from flask import Blueprint, request, jsonify, current_app
import random
import time

teach_bp = Blueprint('teach', __name__, url_prefix='/teach')

# 如果需要访问play_records，可以导入或通过current_app.config
# 这里简单起见，使用全局变量（或后续统一管理）

@teach_bp.route('/auto_hand_detection', methods=['POST'])
def auto_hand_detection():
    try:
        data = request.get_json()
        if not data or 'image' not in data:
            return jsonify({'position':'', 'is_correct':False, 'suggestion':'未检测到图片数据', 'status':'failed'})

        recognizer = current_app.recognizer
        from app import base64_to_cv2

        frame = base64_to_cv2(data['image'])
        if frame is None:
            return jsonify({'position':'', 'is_correct':False, 'suggestion':'图片解码失败', 'status':'failed'})

        timestamp = time.time()
        _, finger_positions = recognizer.process_frame(frame, timestamp)

        position = ''
        if finger_positions:
            _, s_start, s_end, fret = finger_positions[0]
            if s_start == s_end:
                position = f'{s_start}弦{fret}品'
            else:
                position = f'{s_start}-{s_end}弦{fret}品'
        else:
            position = '未检测到按弦'

        target_position = data.get('target_position', '')
        is_correct = position == target_position if target_position else random.choice([True, False])

        suggestions = [
            '按弦位置离品丝太远，建议靠近品丝按弦',
            '手指垂直按弦，避免碰到相邻琴弦',
            '按弦力度适中，继续保持',
            '换把速度可以再快一点，提前预判位置',
            '指法正确，节奏稳定，非常好！'
        ]
        suggestion = random.choice(suggestions) if position != '未检测到按弦' else '请将手指按在正确的品丝位置'

        return jsonify({'position':position, 'is_correct':is_correct, 'suggestion':suggestion, 'status':'success'})
    except Exception as e:
        return jsonify({'position':'', 'is_correct':False, 'suggestion':f'检测失败：{str(e)}', 'status':'failed'})

@teach_bp.route('/auto_voice_recognize', methods=['POST'])
def auto_voice_recognize():
    try:
        questions = ['为什么按弦总是出杂音？','怎么练习手指灵活性？','SOLO时节奏不稳怎么办？','如何提高换把速度？','怎么调1弦？']
        return jsonify({'status':'success', 'text':random.choice(questions)})
    except Exception as e:
        return jsonify({'status':'failed', 'text':f'识别失败：{str(e)}'})

@teach_bp.route('/ai_reply', methods=['POST'])
def ai_reply():
    try:
        data = request.get_json()
        question = data.get('question', '')
        replies = {
            "为什么按弦总是出杂音？": "按弦出杂音主要有3个原因：1. 按弦位置离品丝太远；2. 手指碰到相邻琴弦；3. 按弦力度不足。建议先放慢速度，确保手指垂直按弦，靠近品丝但不接触品丝。",
            "怎么练习手指灵活性？": "推荐每天练10分钟爬格子：从1品到12品，依次用1-2-3-4指按弦，每个手指按实后再换，先慢后快，配合节拍器效果更好。",
            "SOLO时节奏不稳怎么办？": "节奏不稳是新手常见问题，建议先用慢速节拍器（60BPM）练习，把每个音符对准节拍，熟练后再逐步提速，重点是先稳再快。",
            "如何提高换把速度？": "换把慢主要是手指预动不足，练习时先记住目标把位的位置，换把前手指提前做好准备，先分解练习换把动作，再连贯起来。",
            "怎么调1弦？": "调1弦（E音）时，先弹响空弦，观察调音表偏差，偏高则逆时针调弦钮，偏低则顺时针，每次调一点，反复弹响确认音准。"
        }
        return jsonify({'reply': replies.get(question, '你的问题很好！建议先打好基本功，从和弦转换和音阶练习开始，循序渐进提升。')})
    except Exception as e:
        return jsonify({'reply': f'回复失败：{str(e)}'})

@teach_bp.route('/analyze_solo_record')
def analyze_solo_record():
    # 这里需要访问solo模块的play_records，简单起见从当前app的全局变量获取（后续可优化）
    from .solo import play_records
    try:
        if not play_records:
            return jsonify({'status':'failed', 'message':'暂无SOLO记录，请先在SOLO模式演奏并保存'})
        analyses = [
            '你的SOLO整体节奏稳定，但3弦7品的按弦位置偏下，导致音色发闷，建议调整手指位置靠近品丝。',
            '演奏中换把速度较快，但5弦12品的击弦力度不足，声音不清晰，建议加强手指力量练习。',
            '你的SOLO音阶运用流畅，不过节奏稍快，建议配合60BPM节拍器练习，先稳再快。',
            '按弦指法全部正确，音色饱满，继续保持！可以尝试加入滑弦技巧丰富SOLO层次。'
        ]
        return jsonify({'status':'success', 'analysis':random.choice(analyses)})
    except Exception as e:
        return jsonify({'status':'failed', 'analysis':f'分析失败：{str(e)}'})