import requests
import json
import logging
import hashlib
import time
import re
from typing import Optional, Dict, List
from collections import OrderedDict

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class SimpleCache:
    """简单的内存缓存，支持 TTL 和最大条目数"""
    def __init__(self, max_size=100, ttl=3600):
        self.cache = OrderedDict()
        self.max_size = max_size
        self.ttl = ttl

    def _make_key(self, prompt, system_prompt, temperature, max_tokens):
        key_str = f"{prompt}|{system_prompt}|{temperature}|{max_tokens}"
        return hashlib.md5(key_str.encode()).hexdigest()

    def get(self, prompt, system_prompt, temperature, max_tokens):
        key = self._make_key(prompt, system_prompt, temperature, max_tokens)
        if key in self.cache:
            value, timestamp = self.cache[key]
            if time.time() - timestamp < self.ttl:
                self.cache.move_to_end(key)
                return value
            else:
                del self.cache[key]
        return None

    def set(self, prompt, system_prompt, temperature, max_tokens, value):
        key = self._make_key(prompt, system_prompt, temperature, max_tokens)
        self.cache[key] = (value, time.time())
        self.cache.move_to_end(key)
        if len(self.cache) > self.max_size:
            self.cache.popitem(last=False)


class Conversation:
    """多轮对话管理"""
    def __init__(self, system_prompt="你是一个专业的吉他教练。"):
        self.system_prompt = system_prompt
        self.messages = [{"role": "system", "content": system_prompt}]

    def add_user_message(self, content: str):
        self.messages.append({"role": "user", "content": content})

    def add_assistant_message(self, content: str):
        self.messages.append({"role": "assistant", "content": content})

    def get_messages(self):
        return self.messages

    def clear(self):
        self.messages = [{"role": "system", "content": self.system_prompt}]

    def set_system_prompt(self, new_prompt: str):
        """动态修改 system prompt"""
        self.system_prompt = new_prompt
        for i, msg in enumerate(self.messages):
            if msg["role"] == "system":
                self.messages[i]["content"] = new_prompt
                return
        self.messages.insert(0, {"role": "system", "content": new_prompt})


class LLMService:
    def __init__(self, enable_cache=True, cache_max_size=100, cache_ttl=3600):
        self.api_key = None
        self.endpoint = None
        self.model = None
        self.session = requests.Session()
        self.timeout = 30
        self.enable_cache = enable_cache
        self.cache = SimpleCache(max_size=cache_max_size, ttl=cache_ttl) if enable_cache else None
        self.conversations: Dict[str, Conversation] = {}

        self._load_config()

    def _load_config(self):
        try:
            from config import VOLCANO_API_KEY, VOLCANO_ENDPOINT, LLM_MODEL
            self.api_key = VOLCANO_API_KEY
            self.endpoint = VOLCANO_ENDPOINT
            self.model = LLM_MODEL
        except ImportError:
            import os
            self.api_key = os.getenv("VOLCANO_API_KEY")
            self.endpoint = os.getenv("VOLCANO_ENDPOINT", "https://ark.cn-beijing.volces.com/api/v3/chat/completions")
            self.model = os.getenv("LLM_MODEL", "ep-xxxxxxxxx")

        if not self.api_key or not self.endpoint or not self.model:
            logger.error("LLM 配置缺失，请检查 config.py 或环境变量")
            raise ValueError("LLM 配置缺失")

        self.session.headers.update({
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        })

    def _call_api(self, messages: List[Dict], temperature=0.7, max_tokens=500, stream=False):
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": stream,
            "thinking": {"type": "disabled"}   # Doubao-Seed-2.0-mini 极速模式
        }
        try:
            resp = self.session.post(self.endpoint, json=payload, timeout=self.timeout)
            resp.raise_for_status()
            return resp.json()
        except requests.exceptions.Timeout:
            logger.error("LLM 请求超时")
            return None
        except requests.exceptions.RequestException as e:
            logger.error(f"LLM 请求异常: {e}")
            return None

    def generate(self, prompt, system_prompt="你是一个专业的吉他教练。", temperature=0.7, max_tokens=500):
        if self.enable_cache:
            cached = self.cache.get(prompt, system_prompt, temperature, max_tokens)
            if cached is not None:
                logger.info("命中缓存")
                return cached

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ]

        for attempt in range(2):
            result = self._call_api(messages, temperature, max_tokens)
            if result and "choices" in result:
                content = result["choices"][0]["message"]["content"]
                if self.enable_cache:
                    self.cache.set(prompt, system_prompt, temperature, max_tokens, content)
                return content
            if attempt < 1:
                logger.warning(f"LLM 调用失败，重试中... ({attempt+1}/2)")
        return None

    def get_conversation(self, session_id: str) -> Conversation:
        if session_id not in self.conversations:
            self.conversations[session_id] = Conversation()
        return self.conversations[session_id]

    def chat(self, session_id: str, user_message: str, temperature=0.7, max_tokens=500) -> str:
        conv = self.get_conversation(session_id)
        conv.add_user_message(user_message)

        result = self._call_api(conv.get_messages(), temperature, max_tokens)
        if result and "choices" in result:
            reply = result["choices"][0]["message"]["content"]
            conv.add_assistant_message(reply)
            return reply
        return "抱歉，我暂时无法回答。"

    # ==================== 增强 Prompt 构建方法 ====================
    def _build_advice_prompt(self, user_stats: Dict) -> str:
        o = user_stats.get('overview', {})
        mastery = user_stats.get('mastery', {})
        progress = user_stats.get('progress', {})
        recent_records = user_stats.get('recent_records', [])
        mode_ratio = user_stats.get('mode_ratio', {})
        unstable_ratio = user_stats.get('unstable_ratio', 0)
        trend_desc = user_stats.get('trend_desc', '未知')

        # 和弦掌握度排名：最好3个 + 最差3个（带分数）
        chords_list = mastery.get('chords', [])
        chords_sorted = sorted(chords_list, key=lambda x: x.get('value', 0), reverse=True)
        best3 = [(c['name'], c.get('value', 0)) for c in chords_sorted[:3]] if chords_sorted else []
        worst3 = [(c['name'], c.get('value', 0)) for c in chords_sorted[-3:]] if chords_sorted else []
        best3_str = ', '.join([f"{n}({v}%)" for n, v in best3]) if best3 else '无'
        worst3_str = ', '.join([f"{n}({v}%)" for n, v in worst3]) if worst3 else '无'

        # 最近练习记录摘要（带时间）
        recent_summary = []
        for r in recent_records[:7]:
            time_val = r.get('time', '')
            recent_summary.append(f"{r['chord']}({r['accuracy']}%{'|稳' if not r.get('is_unstable') else '|不稳'})")
        recent_str = ' → '.join(recent_summary) if recent_summary else '无'

        # 模式使用比例
        quick = mode_ratio.get('quick', 0)
        normal = mode_ratio.get('normal', 0)
        total_mode = quick + normal
        if total_mode > 0:
            mode_desc = f"快速模式:{quick}次({quick*100//total_mode}%) 普通模式:{normal}次({normal*100//total_mode}%)"
        else:
            mode_desc = "暂无"

        # 错误统计
        total_sessions = o.get('total_sessions', 0)
        avg_accuracy = o.get('avg_accuracy', 0)
        error_count = int(total_sessions * (1 - avg_accuracy / 100)) if total_sessions else 0

        # 进步趋势详细数据
        rates = progress.get('rates', [])
        rate_trend = ''
        if len(rates) >= 3:
            rate_trend = f"近3次正确率: {' → '.join([str(r)+'%' for r in rates[-3:]])}"
        elif rates:
            rate_trend = f"最近正确率: {rates[-1]}%"

        return (
            f"【数据概览】总练习{total_sessions}次 | "
            f"正确{o.get('avg_accuracy',0)}% | "
            f"错误约{error_count}次 | "
            f"总时长{o.get('total_duration',0)}分钟\n"
            f"【掌握度最佳3】{best3_str}\n"
            f"【掌握度薄弱3】{worst3_str}\n"
            f"【薄弱和弦TOP3】{','.join(o.get('weak_chords',['无']))}\n"
            f"【进步趋势】{trend_desc} | {rate_trend}\n"
            f"【稳定性】不稳比例{unstable_ratio}% | 不稳次数{user_stats.get('unstable_count',0)}\n"
            f"【练习模式】{mode_desc}\n"
            f"【最近7次练习】{recent_str}\n"
            f"请基于以上数据给出3条详细教学建议。每条建议需：1)指出具体数据问题；2)分析原因；3)给出可操作的练习方法。每条40-80字，用1.2.3.编号。语气温暖鼓励，避免说教。"
        )

    def _build_chord_recommendation_prompt(self, user_stats: Dict) -> str:
        o = user_stats.get('overview', {})
        weak = ','.join(o.get('weak_chords', [])) or '无'
        recent_records = user_stats.get('recent_records', [])
        last = recent_records[0] if recent_records else {}
        last_chord = last.get('chord', '?')
        last_acc = last.get('accuracy', 0)
        return (
            f"总{o.get('total_sessions',0)}次 均准{o.get('avg_accuracy',0)}% "
            f"弱和弦:[{weak}] 末次{last_chord}({last_acc}%)\n"
            f"推荐3-5个和弦,仅返回JSON数组如['C','G','Am']"
        )

    # ==================== 优化后的非流式方法 ====================
    def generate_advice(self, user_stats: Dict) -> Optional[str]:
        prompt = self._build_advice_prompt(user_stats)
        system_prompt = (
            "你是经验丰富的吉他教练，擅长用数据指导学生。"
            "你需要：1)精确引用数据中的具体数字来佐证判断；"
            "2)将薄弱和弦与掌握度排名关联起来给建议；"
            "3)如果进步趋势下降或不稳比例高，要优先给出稳定性训练建议；"
            "4)如果用户快速模式使用频繁，可建议适当用普通模式加深练习；"
            "5)语气温暖鼓励，用「你」称呼，每条建议40-80字，用1.2.3.编号格式。"
        )
        return self.generate(prompt, system_prompt, temperature=0.5, max_tokens=500)

    def generate_chord_recommendations(self, user_stats: Dict) -> Optional[List[str]]:
        """极速生成和弦推荐（非流式），<2秒返回"""
        prompt = self._build_chord_recommendation_prompt(user_stats)
        system_prompt = "你是一个专业的吉他教练，根据数据生成推荐和弦列表。仅返回JSON数组，无其他文字。"
        result = self.generate(prompt, system_prompt, temperature=0.5, max_tokens=60)
        if not result:
            return self._fallback_recommendations()
        try:
            json_match = re.search(r'\[.*?\]', result, re.DOTALL)
            if json_match:
                chords = json.loads(json_match.group())
                if isinstance(chords, list) and all(isinstance(c, str) for c in chords):
                    return chords[:5]
        except Exception as e:
            logger.warning(f"解析推荐和弦失败: {e}")
        return self._fallback_recommendations()

    def _fallback_recommendations(self) -> List[str]:
        return ['C', 'G', 'Am', 'Em', 'D']