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
        result = self._call_api(messages, temperature, max_tokens)
        if result and "choices" in result:
            content = result["choices"][0]["message"]["content"]
            if self.enable_cache:
                self.cache.set(prompt, system_prompt, temperature, max_tokens, content)
            return content
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

    # ==================== 精简 Prompt 构建方法 ====================
    def _build_advice_prompt(self, user_stats: Dict) -> str:
        o = user_stats.get('overview', {})
        weak = ','.join(o.get('weak_chords', [])) or '无'
        recent_records = user_stats.get('recent_records', [])
        last = recent_records[0] if recent_records else {}
        last_chord = last.get('chord', '?')
        last_acc = last.get('accuracy', 0)
        return (
            f"总{o.get('total_sessions',0)}次 均准{o.get('avg_accuracy',0)}% "
            f"弱和弦:{weak} 末次:{last_chord}({last_acc}%)\n"
            f"给出3条详细教学建议"
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
        """生成详细的教学建议（非流式），每条建议包含具体指导"""
        prompt = self._build_advice_prompt(user_stats)
        system_prompt = (
            "你是一位经验丰富的吉他教练，请根据用户数据提供3条详细的教学建议。"
            "每条建议应包含：1）指出具体问题或方向；2）给出可操作的练习方法或技巧。"
            "每条建议字数在20-40字之间，用1.2.3.格式输出，语气鼓励且专业。"
        )
        return self.generate(prompt, system_prompt, temperature=0.7, max_tokens=180)

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