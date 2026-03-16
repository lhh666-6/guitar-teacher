import base64
import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np
from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
from flask_socketio import SocketIO

from core.detector import GuitarFingeringRecognizer
from api.chords import chords_bp
import config

# ---------- 日志配置 ----------
logging.basicConfig(
    level=logging.INFO if not config.DEBUG else logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ---------- 初始化应用 ----------
app = Flask(__name__)
app.config['SECRET_KEY'] = config.SECRET_KEY
CORS(app)

# 注册蓝图
app.register_blueprint(chords_bp, url_prefix='/api/chords')

# 初始化 SocketIO，启用 eventlet 异步模式，并设置相关参数
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode='eventlet',                     # 使用 eventlet 提升性能
    max_http_buffer_size=10 * 1024 * 1024,     # 10 MB，防止大帧被截断
    ping_timeout=60,                            # 默认60秒，可适当调整
    ping_interval=25                             # 默认25秒
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

# 线程池，用于异步处理帧（与 eventlet 配合，不宜过大）
executor = ThreadPoolExecutor(max_workers=2)

# 全局演奏记录
play_records = []
records_lock = threading.Lock()
MAX_RECORDS = 100

# ---------- 工具函数 ----------
def base64_to_cv2(image_base64: str):
    """将 base64 图片数据转换为 OpenCV 图像 (BGR 格式)"""
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
    """安全发送消息，捕获可能的连接异常"""
    try:
        socketio.emit(event, data, room=room)
    except Exception as e:
        logger.error(f"发送消息失败 (event={event}): {e}")

# ---------- 新增：处理手部关键点 ----------
@socketio.on('hand_landmarks')
def handle_hand_landmarks(data):
    """接收前端传来的手部关键点（21个归一化点）"""
    landmarks = data.get('landmarks')  # 期望格式: [[x1,y1], [x2,y2], ...]
    timestamp = data.get('timestamp', time.time())
    img_width = data.get('img_width', 1280)   # 前端告知图像宽高（用于坐标换算）
    img_height = data.get('img_height', 720)

    if not landmarks or len(landmarks) != 21:
        logger.warning("收到无效的关键点数据")
        _safe_emit('detection_result', {'status': 'failed', 'error': '关键点数据无效'})
        return

    sid = request.sid
    # 直接在主线程中处理（关键点计算非常快）
    try:
        result = recognizer.process_landmarks(landmarks, timestamp, img_width, img_height)
        _safe_emit('detection_result', result, room=sid)
    except Exception as e:
        logger.exception("处理关键点时发生异常")
        _safe_emit('detection_result', {'status': 'failed', 'error': '处理失败'})

# ---------- 新增：处理缩略图（用于YOLO更新指板）----------
@socketio.on('thumbnail')
def handle_thumbnail(data):
    """接收前端发来的低分辨率缩略图，用于YOLO更新指板参数"""
    image_base64 = data.get('image')
    if not image_base64:
        logger.warning("收到空缩略图数据")
        return

    frame = base64_to_cv2(image_base64)
    if frame is None:
        logger.warning("缩略图解码失败")
        return

    # 更新指板参数（非阻塞，但通常很快，直接运行）
    success = recognizer.update_fretboard(frame)
    if success:
        logger.info("指板参数更新成功")
    else:
        logger.warning("指板参数更新失败（可能未检测到琴枕/琴桥）")

# ---------- 原有的 frame 事件（可选保留，作为降级）----------
@socketio.on('frame')
def handle_frame(data):
    """接收前端图像帧，提交到线程池处理（原有逻辑，可降级使用）"""
    image_base64 = data.get('image')
    if not image_base64:
        logger.warning("收到空图像数据")
        _safe_emit('detection_result', {'status': 'failed', 'error': '图像数据为空'})
        return

    sid = request.sid
    executor.submit(process_and_emit, image_base64, sid)

def process_and_emit(image_base64: str, sid: str):
    """在线程池中执行推理并发送结果（包含详细计时）"""
    timings = {}
    t_start = time.perf_counter()

    try:
        # ----- 1. 图像解码阶段 -----
        t_decode = time.perf_counter()
        frame = base64_to_cv2(image_base64)
        if frame is None:
            _safe_emit('detection_result', {
                'status': 'failed',
                'error': '图片解码失败'
            }, room=sid)
            return
        timings['decode'] = (time.perf_counter() - t_decode) * 1000

        # ----- 2. 推理阶段 -----
        t_infer = time.perf_counter()
        timestamp = time.time()
        processed_frame, result = recognizer.process_frame(frame, timestamp)
        timings['inference'] = (time.perf_counter() - t_infer) * 1000

        # ----- 3. 发送结果 -----
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
def save_record():
    """保存演奏记录"""
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

@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查接口"""
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
@app.route('/index.html')
def index():
    return render_template('index.html')

@app.route('/tuning')
def tuning():
    return render_template('tuning.html')

@app.route('/solo')
def solo():
    return render_template('solo.html')

@app.route('/teach')
def teach():
    return render_template('teach.html')

# ---------- 启动 ----------
if __name__ == '__main__':
    logger.info(f"启动服务器，debug={config.DEBUG}")
    socketio.run(
        app,
        debug=config.DEBUG,
        host='0.0.0.0',
        port=5000,
        use_reloader=False   # 关闭重载器以避免与 eventlet 冲突
    ) 