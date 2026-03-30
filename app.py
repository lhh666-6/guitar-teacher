import base64
import logging
import os
import threading
import time
import io
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from functools import wraps

import cv2
import numpy as np
from flask import Flask, jsonify, request, render_template, send_file, session, redirect, url_for
from flask_cors import CORS
from flask_socketio import SocketIO
from flask_login import LoginManager, login_required, current_user
from sqlalchemy import func, case

from core.detector import GuitarFingeringRecognizer
from api.chords import chords_bp
import config
from core import user_stats
from core.llm_service import LLMService
from models import db, TrainingRecord, User
from core.tts_service import VolcTTS
from api.auth import auth_bp

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

# ---------- 数据库配置 ----------
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///training.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

with app.app_context():
    db.create_all()

# ---------- 初始化 Flask-Login ----------
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login_page'   # 未登录时重定向的路由端点
login_manager.login_message = '请先登录以访问此页面'
login_manager.login_message_category = 'info'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# 注册蓝图
app.register_blueprint(chords_bp, url_prefix='/api/chords')
app.register_blueprint(auth_bp)

# 初始化 SocketIO
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode='eventlet',
    max_http_buffer_size=10 * 1024 * 1024,
    ping_timeout=60,
    ping_interval=25
)

# ---------- 模型文件检查 ----------
def check_model_files():
    missing = []
    if not os.path.exists(config.YOLO_MODEL_PATH):
        missing.append(config.YOLO_MODEL_PATH)
    if not os.path.exists(config.HAND_MODEL_PATH):
        missing.append(config.HAND_MODEL_PATH)
    if missing:
        logger.error(f"模型文件缺失: {missing}")
        raise FileNotFoundError(f"模型文件缺失: {missing}")
    logger.info("所有模型文件已找到")

check_model_files()

# ---------- 识别器初始化 ----------
recognizer = GuitarFingeringRecognizer(
    yolo_model_path=config.YOLO_MODEL_PATH,
    hand_model_path=config.HAND_MODEL_PATH
)

executor = ThreadPoolExecutor(max_workers=2)

play_records = []
records_lock = threading.Lock()
MAX_RECORDS = 100

# ---------- TTS 服务 (Edge TTS，无需配置) ----------
tts_service = VolcTTS()   # 使用默认音色 zh-CN-XiaoxiaoNeural 和缓存目录 tts_cache

# ---------- 工具函数 ----------
def base64_to_cv2(image_base64: str):
    try:
        if ',' in image_base64:
            image_base64 = image_base64.split(',')[-1]
        image_base64 = image_base64.strip()
        img_bytes = base64.b64decode(image_base64)
        img_np = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(img_np, cv2.IMREAD_COLOR)
        if frame is None:
            logger.warning("cv2.imdecode 返回 None，图片可能损坏")
        return frame
    except Exception as e:
        logger.error(f"Base64 转图片失败: {e}")
        return None

def _safe_emit(event, data, room=None):
    try:
        socketio.emit(event, data, room=room)
    except Exception as e:
        logger.error(f"发送消息失败 (event={event}): {e}")

# ---------- SocketIO 事件处理 ----------
@socketio.on('hand_landmarks')
def handle_hand_landmarks(data):
    landmarks = data.get('landmarks')
    timestamp = data.get('timestamp', time.time())
    img_width = data.get('img_width', 1280)
    img_height = data.get('img_height', 720)

    if not landmarks or len(landmarks) != 21:
        logger.warning("收到无效的关键点数据")
        _safe_emit('detection_result', {'status': 'failed', 'error': '关键点数据无效'})
        return

    sid = request.sid
    try:
        result = recognizer.process_landmarks(landmarks, timestamp, img_width, img_height)
        _safe_emit('detection_result', result, room=sid)
    except Exception as e:
        logger.exception("处理关键点时发生异常")
        _safe_emit('detection_result', {'status': 'failed', 'error': '处理失败'})

@socketio.on('thumbnail')
def handle_thumbnail(data):
    image_base64 = data.get('image')
    if not image_base64:
        logger.warning("收到空缩略图数据")
        return

    frame = base64_to_cv2(image_base64)
    if frame is None:
        logger.warning("缩略图解码失败")
        return

    success = recognizer.update_fretboard(frame)
    if success:
        logger.info("指板参数更新成功")
    else:
        logger.warning("指板参数更新失败（可能未检测到琴枕/琴桥）")

@socketio.on('frame')
def handle_frame(data):
    image_base64 = data.get('image')
    if not image_base64:
        logger.warning("收到空图像数据")
        _safe_emit('detection_result', {'status': 'failed', 'error': '图像数据为空'})
        return

    sid = request.sid
    executor.submit(process_and_emit, image_base64, sid)

def process_and_emit(image_base64: str, sid: str):
    timings = {}
    t_start = time.perf_counter()

    try:
        t_decode = time.perf_counter()
        frame = base64_to_cv2(image_base64)
        if frame is None:
            _safe_emit('detection_result', {
                'status': 'failed',
                'error': '图片解码失败'
            }, room=sid)
            return
        timings['decode'] = (time.perf_counter() - t_decode) * 1000

        t_infer = time.perf_counter()
        timestamp = time.time()
        processed_frame, result = recognizer.process_frame(frame, timestamp)
        timings['inference'] = (time.perf_counter() - t_infer) * 1000

        t_emit = time.perf_counter()
        _safe_emit('detection_result', result, room=sid)
        timings['emit'] = (time.perf_counter() - t_emit) * 1000

        total_ms = (time.perf_counter() - t_start) * 1000
        logger.info(
            f"[APP_TIMING] 解码={timings['decode']:.1f}ms, 推理={timings['inference']:.1f}ms, "
            f"发送={timings['emit']:.1f}ms, 总计={total_ms:.1f}ms | "
            f"按点: {len(result.get('positions', []))} | 横按: {result.get('barre') is not None}"
        )
    except Exception as e:
        logger.exception("处理帧时发生异常")
        _safe_emit('detection_result', {
            'status': 'failed',
            'error': '处理失败，请稍后重试'
        }, room=sid)

# ---------- HTTP 接口 ----------
@app.route('/api/solo/save_record', methods=['POST'])
@login_required
def save_solo_record():
    global play_records
    try:
        data = request.get_json()
        new_record = data.get('record', [])
        with records_lock:
            play_records = new_record
            if len(play_records) > MAX_RECORDS:
                play_records = play_records[-MAX_RECORDS:]
        logger.info(f"记录保存成功，当前条数: {len(play_records)}")
        return jsonify({'status': 'success', 'message': '记录保存成功'})
    except Exception as e:
        logger.exception("保存记录失败")
        return jsonify({'status': 'failed', 'message': '保存失败，请稍后重试'}), 500

@app.route('/api/save_record', methods=['POST'])
@login_required
def save_training_record():
    data = request.get_json()
    if not data or 'chord_name' not in data or 'correct' not in data:
        return jsonify({'error': '缺少必要字段'}), 400

    record = TrainingRecord(
        chord_name=data['chord_name'],
        correct=data['correct'],
        time_spent=data.get('time_spent', 0.0)
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
            "yolo": os.path.exists(config.YOLO_MODEL_PATH),
            "hand": os.path.exists(config.HAND_MODEL_PATH)
        }
    })

# ---------- 页面路由 ----------
@app.route('/')
def index():
    if current_user.is_authenticated:
        return redirect(url_for('intro'))
    else :
        return redirect(url_for('login_page'))

@app.route('/intro')
@login_required
def intro():
    # 渲染原有的 index.html，并告诉它动画结束后跳转到 /teach
    return render_template('index.html', redirect_after_intro='/teach')

@app.route('/login')
def login_page():
    if current_user.is_authenticated:
        return redirect(url_for('intro'))
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
    records = TrainingRecord.query.order_by(TrainingRecord.created_at.desc()).limit(100).all()
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

    query = TrainingRecord.query
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
    records_data = [{
        'id': r.id,
        'chord_name': r.chord_name,
        'correct': r.correct,
        'time_spent': float(r.time_spent) if r.time_spent else None,
        'created_at': r.created_at.isoformat() if r.created_at else None
    } for r in records]

    return jsonify({
        'records': records_data,
        'total': total,
        'page': page,
        'per_page': per_page
    })

def cache_result(ttl=5):
    def decorator(func):
        cache = {}
        @wraps(func)
        def wrapper(*args, **kwargs):
            key = str(args) + str(kwargs)
            now = time.time()
            if key in cache and now - cache[key]['time'] < ttl:
                return cache[key]['value']
            result = func(*args, **kwargs)
            cache[key] = {'value': result, 'time': now}
            return result
        return wrapper
    return decorator

@app.route('/api/history/stats')
@cache_result(ttl=5)
@login_required
def history_stats():
    total = db.session.query(func.count(TrainingRecord.id)).scalar()
    correct = db.session.query(func.sum(TrainingRecord.correct.cast(db.Integer))).scalar()
    accuracy = (correct / total * 100) if total else 0

    chord_stats = db.session.query(
        TrainingRecord.chord_name,
        func.count(TrainingRecord.id).label('total'),
        func.sum(TrainingRecord.correct.cast(db.Integer)).label('correct')
    ).group_by(TrainingRecord.chord_name).all()

    chords = []
    accuracies = []
    weak_chords = []
    if chord_stats:
        sorted_stats = sorted(chord_stats, key=lambda x: x.correct / x.total if x.total else 0)
        weak_chords = [stat.chord_name for stat in sorted_stats[:3]]
        for stat in chord_stats:
            chords.append(stat.chord_name)
            accuracies.append(round((stat.correct / stat.total) * 100, 1))

    last = TrainingRecord.query.order_by(TrainingRecord.created_at.desc()).first()
    last_time = last.created_at.isoformat() if last else None

    return jsonify({
        'total_count': total,
        'accuracy': accuracy,
        'last_practice': last_time,
        'weak_chords': weak_chords,
        'chords': chords,
        'accuracies': accuracies
    })

# ---------- 教学驾驶舱 API ----------
llm_service = LLMService()

@app.route('/api/teach/dashboard')
@login_required
def get_teach_dashboard():
    overview = user_stats.get_overview()
    mastery = user_stats.get_chord_mastery()
    progress = user_stats.get_progress_trend()
    recent = user_stats.get_recent_records()
    return jsonify({
        'overview': overview,
        'mastery': mastery,
        'progress': progress,
        'recent_records': recent
    })

@app.route('/api/teach/generate_advice', methods=['POST'])
@login_required
def generate_advice():
    overview = user_stats.get_overview()
    recent = user_stats.get_recent_records(limit=1)
    stats = {
        'overview': overview,
        'recent_records': recent
    }
    advice = llm_service.generate_advice(stats)
    if advice:
        return jsonify({'advice': advice})
    else:
        return jsonify({'advice': '暂时无法生成建议，请稍后再试。'})

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

# ---------- 语音指令处理 ----------
TEACH_COMMANDS = [
    {'patterns': ['显示掌握度', '掌握度'], 'action': 'show_radar', 'text': '已显示和弦掌握度'},
    {'patterns': ['显示进步曲线', '进步曲线'], 'action': 'show_progress', 'text': '已显示进步趋势'},
    {'patterns': ['朗读指导'], 'action': 'read_advice', 'text': None},
    {'patterns': ['生成新建议', '生成指导'], 'action': 'generate_advice', 'text': '正在生成新建议'},
    {'patterns': [r'练习\s*([A-G#b]+)'], 'action': 'goto_solo', 'text': None, 'extract': lambda m: {'chord': m[1]}},
]

TUNING_COMMANDS = [
    {'patterns': [r'调([一二三四五六1-6])弦'], 'action': 'select_string', 'text': None,
     'extract': lambda m: {'string': {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'1':1,'2':2,'3':3,'4':4,'5':5,'6':6}.get(m[1])}},
    {'patterns': ['开始调音'], 'action': 'start_tuning', 'text': '开始调音'},
    {'patterns': ['停止调音'], 'action': 'stop_tuning', 'text': '停止调音'},
    {'patterns': ['打开自动模式', '开启自动模式'], 'action': 'auto_mode', 'text': '自动模式已开启', 'extract': lambda m: {'enable': True}},
    {'patterns': ['关闭自动模式'], 'action': 'auto_mode', 'text': '自动模式已关闭', 'extract': lambda m: {'enable': False}},
]

def match_command(command, commands):
    for cmd in commands:
        for pattern in cmd['patterns']:
            if isinstance(pattern, str):
                if pattern in command:
                    result = {'action': cmd['action'], 'text': cmd.get('text')}
                    if 'extract' in cmd:
                        result.update(cmd['extract']({}))
                    return result
            elif isinstance(pattern, re.Pattern):
                match = pattern.search(command)
                if match:
                    result = {'action': cmd['action'], 'text': cmd.get('text')}
                    if 'extract' in cmd:
                        result.update(cmd['extract'](match))
                    return result
    return None

def process_teach_command(command):
    return match_command(command, TEACH_COMMANDS)

def process_tuning_command(command):
    return match_command(command, TUNING_COMMANDS)

def process_solo_command(command):
    return None

def process_general_command(command, session_id):
    try:
        conv = llm_service.get_conversation(session_id)
        original_prompt = conv.system_prompt
        conv.set_system_prompt("你是一个吉他教学助手。用户提问时，请用最简洁的语言回答，不超过30字，直接给出建议，不要啰嗦，不要解释背景。")
        reply = llm_service.chat(session_id, command)
        conv.set_system_prompt(original_prompt)
        return {'text': reply}
    except Exception as e:
        logger.error(f"LLM 问答失败: {e}")
        return {'text': '抱歉，我暂时无法回答。'}

@socketio.on('voice_command')
def handle_voice_command(data):
    sid = request.sid
    command = data.get('command', '').strip()
    page = data.get('page', '/')
    session_id = data.get('session_id', sid)

    if not command:
        return

    if page.startswith('/teach'):
        result = process_teach_command(command)
    elif page.startswith('/tuning'):
        result = process_tuning_command(command)
    elif page.startswith('/solo'):
        result = process_solo_command(command)
    else:
        result = None

    if result is None:
        result = process_general_command(command, session_id)

    if result and result.get('text'):
        audio = tts_service.synthesize(result['text'])
        if audio:
            result['audio_base64'] = base64.b64encode(audio).decode()
        else:
            result['fallback'] = True

    socketio.emit('voice_response', result, room=sid)

# ---------- 启动 ----------
if __name__ == '__main__':
    logger.info(f"启动服务器，debug={config.DEBUG}")
    socketio.run(
        app,
        debug=config.DEBUG,
        host='0.0.0.0',
        port=5000,
        use_reloader=False
    )