import time
import logging

logger = logging.getLogger(__name__)


def process_and_emit(image_base64, sid, socketio, recognizer, frame_lock, frame_busy_ref, config_debug=False):
    """处理视频帧并发送检测结果（供线程池调用）"""
    from core.utils import base64_to_cv2, safe_socketio_emit

    timings = {}
    t_start = time.perf_counter()

    try:
        t_decode = time.perf_counter()
        frame = base64_to_cv2(image_base64)
        if frame is None:
            safe_socketio_emit(socketio, 'detection_result', {
                'status': 'failed',
                'error': '图片解码失败'
            }, room=sid)
            return
        timings['decode'] = (time.perf_counter() - t_decode) * 1000

        t_infer = time.perf_counter()
        timestamp = time.time()
        processed_frame, result = recognizer.process_frame(frame, timestamp)
        timings['inference'] = (time.perf_counter() - t_infer) * 1000

        total_ms = (time.perf_counter() - t_start) * 1000
        result['server_timing_ms'] = round(total_ms, 1)

        t_emit = time.perf_counter()
        safe_socketio_emit(socketio, 'detection_result', result, room=sid)
        timings['emit'] = (time.perf_counter() - t_emit) * 1000

        if config_debug:
            logger.info(
                f"[APP_TIMING] 解码={timings['decode']:.1f}ms, 推理={timings['inference']:.1f}ms, "
                f"发送={timings['emit']:.1f}ms, 总计={total_ms:.1f}ms | "
                f"按点: {len(result.get('positions', []))} | 横按: {result.get('barre') is not None}"
            )
    except Exception as e:
        logger.exception("处理帧时发生异常")
        safe_socketio_emit(socketio, 'detection_result', {
            'status': 'failed',
            'error': '处理失败，请稍后重试'
        }, room=sid)
    finally:
        with frame_lock:
            frame_busy_ref['value'] = False
