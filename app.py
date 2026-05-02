import logging
import base64
import os
import json
import threading
import queue
import time
import io
from concurrent.futures import ThreadPoolExecutor

from api.chords import chords_bp

from flask import Flask, jsonify, request, render_template, send_file, redirect, url_for, Response, stream_with_context
from flask_cors import CORS
from flask_socketio import SocketIO
from flask_login import LoginManager, login_required, current_user
from sqlalchemy import func

from core.detector import GuitarFingeringRecognizer
import config
from core import user_stats
from core.llm_service import LLMService
from models import db, TrainingRecord, User
from core.tts_service import VolcTTS
from api.auth import auth_bp
from core.recommendation import generate_smart_recommendations
from core.utils import base64_to_cv2, safe_socketio_emit, cache_result, check_model_files

# ---------- 日志配置 ----------
logging.basicConfig(
    level=logging.INFO if not config.DEBUG else logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ---------- 初始化应用 ----------
app = Flask(__name__)
app.config.from_object(config)
CORS(app)

@app.context_processor
def inject_version():
    return dict(APP_VERSION=config.APP_VERSION)

# ---------- 数据库初始化 ----------
db.init_app(app)

with app.app_context():
    db.create_all()

# ---------- 初始化 Flask-Login ----------
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login_page'
login_manager.login_message = '请先登录以访问此页面'
login_manager.login_message_category = 'info'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# 注册蓝图
app.register_blueprint(chords_bp, url_prefix='/api/chords')
app.register_blueprint(auth_bp)

# ---------- 修复 SocketIO 配置（解决 400 错误） ----------
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode=None,
    max_http_buffer_size=10 * 1024 * 1024,
    ping_timeout=60,
    ping_interval=25,
    allow_upgrades=True
)

# ---------- 模型文件检查 ----------
check_model_files(config.YOLO_MODEL_PATH)

# ---------- 识别器初始化 ----------
recognizer = GuitarFingeringRecognizer(
    yolo_model_path=config.YOLO_MODEL_PATH
)

executor = ThreadPoolExecutor(max_workers=1)
_frame_busy = {'value': False}
_frame_lock = threading.Lock()

play_records = {}
records_lock = threading.Lock()
MAX_RECORDS = 100

# ---------- TTS 服务 ----------
tts_service = VolcTTS()

# ---------- 工具函数（已迁移至 core/utils.py） ----------
# base64_to_cv2, safe_socketio_emit, cache_result 从 core.utils 导入

# ---------- SocketIO 事件处理 ----------
@socketio.on('hand_landmarks')
def handle_hand_landmarks(data):
    landmarks = data.get('landmarks')
    timestamp = data.get('timestamp', time.time())
    img_width = data.get('img_width', 1280)
    img_height = data.get('img_height', 720)

    if not landmarks or len(landmarks) != 21:
        logger.warning("收到无效的关键点数据")
        safe_socketio_emit(socketio, 'detection_result', {'status': 'failed', 'error': '关键点数据无效'})
        return

    sid = request.sid
    try:
        result = recognizer.process_landmarks(landmarks, timestamp, img_width, img_height)
        safe_socketio_emit(socketio, 'detection_result', result, room=sid)
    except Exception as e:
        logger.exception("处理关键点时发生异常")
        safe_socketio_emit(socketio, 'detection_result', {'status': 'failed', 'error': '处理失败'})

@socketio.on('thumbnail')
def handle_thumbnail(data):
    image_base64 = data.get('image')
    if not image_base64:
        return True
    with _frame_lock:
        if _frame_busy['value']:
            if not hasattr(app, '_drop_count'):
                app._drop_count = 0
                app._drop_last_log = 0
            app._drop_count += 1
            if time.time() - app._drop_last_log > 5:
                logger.warning("缩略图丢帧: %d 次 (后端繁忙)", app._drop_count)
                app._drop_last_log = time.time()
            return True
        _frame_busy['value'] = True

    def _process_thumb(img_b64, sid):
        t_start = time.perf_counter()
        try:
            frame = base64_to_cv2(img_b64)
            if frame is None:
                return
            success = recognizer.update_fretboard(frame)
            if success:
                params = recognizer.get_fretboard_params()
                if params:
                    params['server_timing_ms'] = round((time.perf_counter() - t_start) * 1000, 1)
                    socketio.emit('fretboard_params', params, room=sid)
        except Exception as e:
            logger.exception("缩略图处理异常")
        finally:
            with _frame_lock:
                _frame_busy['value'] = False

    executor.submit(_process_thumb, image_base64, request.sid)
    return True

# ---------- HTTP 接口 ----------
@app.route('/api/solo/save_record', methods=['POST'])
@login_required
def save_solo_record():
    global play_records
    try:
        data = request.get_json()
        new_record = data.get('record', [])
        with records_lock:
            play_records[current_user.id] = new_record
            if len(play_records[current_user.id]) > MAX_RECORDS:
                play_records[current_user.id] = play_records[current_user.id][-MAX_RECORDS:]
        logger.info(f"用户 {current_user.id} 记录保存成功，条数: {len(new_record)}")
        return jsonify({'status': 'success', 'message': '记录保存成功'})
    except Exception as e:
        logger.exception("保存记录失败")
        return jsonify({'status': 'failed', 'message': '保存失败'}), 500

@app.route('/api/save_record', methods=['POST'])
@login_required
def save_training_record():
    data = request.get_json()
    if not data or 'chord_name' not in data or 'correct' not in data:
        return jsonify({'error': '缺少必要字段'}), 400

    record = TrainingRecord(
        chord_name=data['chord_name'],
        correct=data['correct'],
        time_spent=data.get('time_spent', 0.0),
        user_id=current_user.id,
        is_unstable=data.get('is_unstable', False),
        similarity=data.get('similarity', None),
        mode=data.get('mode', None)
    )
    db.session.add(record)
    db.session.commit()
    return jsonify({'status': 'ok', 'id': record.id})

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "ok",
        "message": "吉他AI服务运行正常",
        "models": {
            "yolo": os.path.exists(config.YOLO_MODEL_PATH)
        }
    })

# ---------- 页面路由 ----------
@app.route('/favicon.ico')
def favicon():
    return '', 204

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/login')
def login_page():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    return render_template('login.html')

@app.route('/tuning')
@login_required
def tuning():
    return render_template('tuning.html')

@app.route('/solo')
@login_required
def solo():
    return render_template('solo.html')

@app.route('/teach')
@login_required
def teach():
    return render_template('teach.html')

@app.route('/history')
@login_required
def history():
    records = TrainingRecord.query.filter_by(user_id=current_user.id)\
        .order_by(TrainingRecord.created_at.desc()).limit(100).all()
    records_data = [{
        'id': r.id,
        'chord_name': r.chord_name,
        'correct': r.correct,
        'time_spent': float(r.time_spent) if r.time_spent else None,
        'created_at': r.created_at.isoformat() if r.created_at else None
    } for r in records]
    return render_template('history.html', records=records_data)

# ---------- 历史记录 API ----------
@app.route('/api/history/data')
@login_required
def history_data():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    chord = request.args.get('chord', None)
    result = request.args.get('result', None)
    start_date = request.args.get('start_date', None)
    end_date = request.args.get('end_date', None)

    query = TrainingRecord.query.filter_by(user_id=current_user.id)
    if chord and chord != 'all':
        query = query.filter(TrainingRecord.chord_name == chord)
    if result == 'correct':
        query = query.filter(TrainingRecord.correct == True)
    elif result == 'wrong':
        query = query.filter(TrainingRecord.correct == False)
    if start_date:
        query = query.filter(TrainingRecord.created_at >= start_date)
    if end_date:
        query = query.filter(TrainingRecord.created_at <= end_date + ' 23:59:59')

    total = query.count()
    records = query.order_by(TrainingRecord.created_at.desc()).offset((page-1)*per_page).limit(per_page).all()
    records_data = [r.to_dict() for r in records]

    return jsonify({
        'records': records_data,
        'total': total,
        'page': page,
        'per_page': per_page
    })


@app.route('/api/history/stats')
@login_required
def history_stats():
    total = db.session.query(func.count(TrainingRecord.id))\
        .filter(TrainingRecord.user_id == current_user.id).scalar()
    correct = db.session.query(func.sum(TrainingRecord.correct.cast(db.Integer)))\
        .filter(TrainingRecord.user_id == current_user.id).scalar()
    accuracy = (correct / total * 100) if total else 0

    chord_stats = db.session.query(
        TrainingRecord.chord_name,
        func.count(TrainingRecord.id).label('total'),
        func.sum(TrainingRecord.correct.cast(db.Integer)).label('correct')
    ).filter(TrainingRecord.user_id == current_user.id)\
     .group_by(TrainingRecord.chord_name).all()

    chords = []
    accuracies = []
    weak_chords = []
    if chord_stats:
        sorted_stats = sorted(chord_stats, key=lambda x: x.correct / x.total if x.total else 0)
        weak_chords = [stat.chord_name for stat in sorted_stats[:3]]
        for stat in chord_stats:
            chords.append(stat.chord_name)
            accuracies.append(round((stat.correct / stat.total) * 100, 1))

    last = TrainingRecord.query.filter_by(user_id=current_user.id)\
        .order_by(TrainingRecord.created_at.desc()).first()
    last_time = last.created_at.isoformat() if last else None

    return jsonify({
        'total_count': total,
        'accuracy': accuracy,
        'last_practice': last_time,
        'weak_chords': weak_chords,
        'chords': chords,
        'accuracies': accuracies
    })


@app.route('/api/history/clear', methods=['POST'])
@login_required
def clear_history():
    global play_records
    TrainingRecord.query.filter_by(user_id=current_user.id).delete()
    db.session.commit()
    # 同时清空内存中的练习记录（防止 solo 模式残留）
    with records_lock:
        play_records.pop(current_user.id, None)
    return jsonify({'status': 'ok', 'message': '记录已清空'})

# ---------- 练习统计 API ----------
llm_service = LLMService()


@app.route('/api/teach/dashboard')
@login_required
def get_teach_dashboard():
    stats = user_stats.get_advice_stats(current_user.id, include_daily=True)
    return jsonify(stats)


@app.route('/api/teach/generate_advice', methods=['POST'])
@login_required
def generate_advice():
    stats = user_stats.get_advice_stats(current_user.id)
    advice = llm_service.generate_advice(stats)
    if advice:
        return jsonify({'advice': advice})
    else:
        return jsonify({'advice': '暂时无法生成建议，请稍后再试。'})


@app.route('/api/teach/advice/stream')
@login_required
def generate_advice_stream():
    stats = user_stats.get_advice_stats(current_user.id)

    def generate():
        q = queue.Queue()

        def worker():
            try:
                for chunk in llm_service.generate_advice_stream(stats):
                    q.put(('content', chunk))
                q.put(('done', None))
            except Exception as e:
                logger.error(f"流式生成异常: {e}")
                q.put(('error', str(e)))

        t = threading.Thread(target=worker, daemon=True)
        t.start()

        while True:
            try:
                item = q.get(timeout=10)
                kind, value = item
                if kind == 'content':
                    if value is None:
                        yield f"data: {json.dumps({'error': '生成失败，请稍后重试'})}\n\n"
                        return
                    yield f"data: {json.dumps({'content': value})}\n\n"
                elif kind == 'done':
                    yield f"data: {json.dumps({'done': True})}\n\n"
                    return
                elif kind == 'error':
                    yield f"data: {json.dumps({'error': value})}\n\n"
                    return
            except queue.Empty:
                yield ": heartbeat\n\n"

    return Response(
        stream_with_context(generate()),
        content_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive'
        }
    )


@app.route('/api/teach/recommend_chords', methods=['POST'])
@login_required
def recommend_chords():
    try:
        recommendations = generate_smart_recommendations(current_user.id, count=5)
        return jsonify({'chords': recommendations})
    except Exception as e:
        logger.exception("生成推荐和弦失败")
        fallback = [
            {'name': 'C', 'reason': '基础开放和弦'},
            {'name': 'G', 'reason': '常用和弦'},
            {'name': 'Am', 'reason': '简单小调和弦'},
            {'name': 'Em', 'reason': '适合入门'},
            {'name': 'D', 'reason': '常用和弦'}
        ]
        return jsonify({'chords': fallback})

# ---------- TTS 路由 ----------
@app.route('/api/tts/speak', methods=['POST'])
def tts_speak():
    start_time = time.time()
    data = request.get_json()
    text = data.get('text', '').strip()
    if not text:
        logger.warning("[TTS] 请求文本为空")
        return jsonify({'error': 'no text'}), 400
    emotion = data.get('emotion')
    logger.info(f"[TTS] 收到合成请求: text='{text}', emotion={emotion}")

    audio_bytes = tts_service.synthesize(text, emotion=emotion)
    elapsed = (time.time() - start_time) * 1000
    if audio_bytes:
        logger.info(f"[TTS] 合成成功, 耗时={elapsed:.1f}ms, 音频大小={len(audio_bytes)} bytes")
        return send_file(io.BytesIO(audio_bytes), mimetype='audio/mpeg')
    else:
        logger.error(f"[TTS] 合成失败, 耗时={elapsed:.1f}ms")
        return jsonify({'error': 'synthesis failed'}), 500

# ---------- 【最终修复】启动代码（解决 WebSocket 400） ----------
if __name__ == '__main__':
    logger.info(f"启动服务器，debug={config.DEBUG}")
    socketio.run(
        app,
        debug=config.DEBUG,
        host='0.0.0.0',
        port=5000,
        use_reloader=False
    )