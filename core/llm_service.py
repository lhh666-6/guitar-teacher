import requests
import json
import logging
import hashlib
import time
from typing import Optional, Dict, List, Generator, Any
from functools import lru_cache
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
            "stream": stream
        }
        try:
            resp = self.session.post(self.endpoint, json=payload, timeout=self.timeout, stream=stream)
            resp.raise_for_status()
            if stream:
                return resp
            else:
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
        result = self._call_api(messages, temperature, max_tokens, stream=False)
        if result and "choices" in result:
            content = result["choices"][0]["message"]["content"]
            if self.enable_cache:
                self.cache.set(prompt, system_prompt, temperature, max_tokens, content)
            return content
        return None

    def generate_stream(self, prompt, system_prompt="你是一个专业的吉他教练。", temperature=0.7, max_tokens=500) -> Generator[str, None, None]:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ]
        response = self._call_api(messages, temperature, max_tokens, stream=True)
        if response is None:
            yield "生成失败，请稍后再试。"
            return

        for line in response.iter_lines():
            if line:
                line = line.decode('utf-8')
                if line.startswith('data: '):
                    data = line[6:]
                    if data == '[DONE]':
                        break
                    try:
                        chunk = json.loads(data)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        if "content" in delta:
                            yield delta["content"]
                    except json.JSONDecodeError:
                        continue

    def get_conversation(self, session_id: str) -> Conversation:
        if session_id not in self.conversations:
            self.conversations[session_id] = Conversation()
        return self.conversations[session_id]

    def chat(self, session_id: str, user_message: str, temperature=0.7, max_tokens=500) -> str:
        conv = self.get_conversation(session_id)
        conv.add_user_message(user_message)

        result = self._call_api(conv.get_messages(), temperature, max_tokens, stream=False)
        if result and "choices" in result:
            reply = result["choices"][0]["message"]["content"]
            conv.add_assistant_message(reply)
            return reply
        return "抱歉，我暂时无法回答。"

    def chat_stream(self, session_id: str, user_message: str, temperature=0.7, max_tokens=500) -> Generator[str, None, None]:
        conv = self.get_conversation(session_id)
        conv.add_user_message(user_message)

        response = self._call_api(conv.get_messages(), temperature, max_tokens, stream=True)
        if response is None:
            yield "生成失败，请稍后再试。"
            return

        full_reply = []
        for line in response.iter_lines():
            if line:
                line = line.decode('utf-8')
                if line.startswith('data: '):
                    data = line[6:]
                    if data == '[DONE]':
                        break
                    try:
                        chunk = json.loads(data)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        if "content" in delta:
                            content = delta["content"]
                            full_reply.append(content)
                            yield content
                    except json.JSONDecodeError:
                        continue

        conv.add_assistant_message("".join(full_reply))
    # 在 LLMService 类中添加以下方法（放在 generate_advice 方法附近即可）

    def generate_chord_recommendations(self, user_stats: Dict) -> Optional[List[str]]:
        """
        根据用户练习数据生成推荐和弦列表（3~5个）
        返回格式：['C', 'G', 'Am', ...]
        """
        overview = user_stats.get('overview', {})
        total_sessions = overview.get('total_sessions', 0)
        avg_accuracy = overview.get('avg_accuracy', 0)
        weak_chords = overview.get('weak_chords', [])
        weak_chords_str = ', '.join(weak_chords) if weak_chords else '无'

        recent_records = user_stats.get('recent_records', [])
        latest_practice = "无"
        if recent_records and isinstance(recent_records, list):
            last = recent_records[0]
            if isinstance(last, dict):
                chord = last.get('chord', '未知')
                acc = last.get('accuracy', 0)
                latest_practice = f"{chord}和弦 (正确率{acc}%)"
            else:
                latest_practice = str(last)

        prompt = f"""
    根据以下用户的吉他练习数据，推荐 3 到 5 个和弦，供用户下次练习。推荐的和弦应具有针对性，例如：
    - 重点练习薄弱和弦
    - 适当增加难度，挑战新和弦
    - 巩固已掌握但还不够熟练的和弦

    请直接返回和弦名称列表，格式为 JSON 数组，例如：["C", "G", "Am", "Em", "F"]
    不要包含其他文字，只返回 JSON 数组。

    用户数据：
    - 总练习次数：{total_sessions}
    - 平均正确率：{avg_accuracy}%
    - 薄弱和弦：{weak_chords_str}
    - 最近一次练习：{latest_practice}
        """
        result = self.generate(prompt, system_prompt="你是一个专业的吉他教练，根据数据生成推荐和弦列表。")
        if not result:
            return None
        # 尝试解析 JSON
        import json
        try:
            # 提取可能包含在 markdown 代码块中的 JSON
            import re
            json_match = re.search(r'\[.*?\]', result, re.DOTALL)
            if json_match:
                chords = json.loads(json_match.group())
                if isinstance(chords, list) and all(isinstance(c, str) for c in chords):
                    return chords[:5]  # 限制最多5个
        except:
            # 如果解析失败，返回一个默认列表
            logger.warning("解析推荐和弦失败，使用默认列表")
            return ['C', 'G', 'Am', 'Em', 'D']
        return None
   
    def generate_advice(self, user_stats: Dict) -> Optional[str]:
        overview = user_stats.get('overview', {})
        total_sessions = overview.get('total_sessions', 0)
        avg_accuracy = overview.get('avg_accuracy', 0)
        weak_chords = overview.get('weak_chords', [])
        weak_chords_str = ', '.join(weak_chords) if weak_chords else '无'

        recent_records = user_stats.get('recent_records', [])
        latest_practice = "无"
        if recent_records and isinstance(recent_records, list):
            last = recent_records[0]
            if isinstance(last, dict):
                chord = last.get('chord', '未知')
                acc = last.get('accuracy', 0)
                latest_practice = f"{chord}和弦 (正确率{acc}%)"
            else:
                latest_practice = str(last)

        prompt = f"""
根据以下用户的吉他练习数据，生成3条简短、鼓励性的教学建议（每条不超过30字）：
- 总练习次数：{total_sessions}
- 平均正确率：{avg_accuracy}%
- 薄弱和弦：{weak_chords_str}
- 最近一次练习：{latest_practice}

建议格式：以“1.”、“2.”、“3.”开头。
        """
        return self.generate(prompt, system_prompt="你是一位鼓励型的吉他教练，给出具体可行的建议。")