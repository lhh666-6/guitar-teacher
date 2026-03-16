from flask import Blueprint, request, jsonify, current_app
import time

solo_bp = Blueprint('solo', __name__, url_prefix='/solo')

# 模拟数据库：存储SOLO演奏记录（如果多个蓝图需要共享，可移到app.py或config中）
# 这里暂时保留，但更好的方式是通过current_app.config或全局变量
play_records = []

@solo_bp.route('/hand_detection', methods=['POST'])
def hand_detection():
    """手部骨骼识别（真实检测）"""
    try:
        data = request.get_json()
        if not data or 'image' not in data:
            return jsonify({'string':0, 'fret':0, 'note':'', 'action':'', 'status':'failed', 'error':'缺少图片数据'})

        # 从current_app获取识别器（需要在app.py中设置app.recognizer）
        recognizer = current_app.recognizer
        from app import base64_to_cv2  # 复用工具函数

        frame = base64_to_cv2(data['image'])
        if frame is None:
            return jsonify({'string':0, 'fret':0, 'note':'', 'action':'', 'status':'failed', 'error':'图片解码失败'})

        timestamp = time.time()
        gesture_result, finger_positions = recognizer.process_frame(frame, timestamp)

        # 提取第一个有效按弦位置
        string = 0
        fret = 0
        if finger_positions:
            _, s_start, s_end, f = finger_positions[0]
            string = s_start
            fret = f

        # 音符映射
        notes_map = {1:'E4',2:'B3',3:'G3',4:'D3',5:'A2',6:'E2'}
        note = ''
        if string > 0:
            base = notes_map.get(string)
            if base:
                root = base[0]
                octave = int(base[1])
                octave_shift = fret // 12
                note = f"{root}{octave + octave_shift}"

        # 动作识别结果
        if isinstance(gesture_result, dict):
            action = gesture_result.get('action', '')
        else:
            action = str(gesture_result) if gesture_result else ''

        return jsonify({
            'string': string,
            'fret': fret,
            'note': note,
            'action': action,
            'status': 'success'
        })

    except Exception as e:
        current_app.logger.error(f"Hand detection error: {e}")
        return jsonify({'string':0, 'fret':0, 'note':'', 'action':'', 'status':'failed', 'error':str(e)})

@solo_bp.route('/save_record', methods=['POST'])
def save_record():
    """保存SOLO记录"""
    global play_records
    try:
        data = request.get_json()
        play_records = data.get('record', [])
        return jsonify({'status': 'success', 'message': '记录保存成功'})
    except Exception as e:
        return jsonify({'status': 'failed', 'message': f'保存失败：{str(e)}'})