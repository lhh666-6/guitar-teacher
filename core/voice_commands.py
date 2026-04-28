"""语音指令匹配与处理"""

import re
import logging

logger = logging.getLogger(__name__)

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


def process_general_command(command, session_id, llm_service):
    conv = llm_service.get_conversation(session_id)
    original_prompt = conv.system_prompt
    try:
        conv.set_system_prompt(
            "你是一个吉他教学助手。用户提问时，请用最简洁的语言回答，不超过30字，"
            "直接给出建议，不要啰嗦，不要解释背景。"
        )
        reply = llm_service.chat(session_id, command)
        return {'text': reply}
    except Exception as e:
        logger.error(f"LLM 问答失败: {e}")
        return {'text': '抱歉，我暂时无法回答。'}
    finally:
        conv.set_system_prompt(original_prompt)
