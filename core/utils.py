import base64
import logging
import os
import time
from functools import wraps

import numpy as np
import cv2

logger = logging.getLogger(__name__)


def base64_to_cv2(image_base64: str):
    """Base64 字符串解码为 OpenCV 图像 (BGR)"""
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


def safe_socketio_emit(socketio, event, data, room=None):
    """安全的 SocketIO 发送，捕获异常防止崩溃"""
    try:
        socketio.emit(event, data, room=room)
    except Exception as e:
        logger.error(f"发送消息失败 (event={event}): {e}")


def cache_result(ttl=5):
    """简单的内存缓存装饰器，支持 TTL"""
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


def check_model_files(yolo_model_path):
    """检查模型文件是否存在，缺失则抛出异常"""
    if not os.path.exists(yolo_model_path):
        logger.error(f"模型文件缺失: {yolo_model_path}")
        raise FileNotFoundError(f"模型文件缺失: {yolo_model_path}")
    logger.info("模型文件已找到")
