# core/llm_service.py
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
                # 移动到末尾表示最近使用
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


class LLMService:
    def __init__(self, enable_cache=True, cache_max_size=100, cache_ttl=3600):
        self.api_key = None
        self.endpoint = None
        self.model = None
        self.session = requests.Session()
        self.timeout = 30
        self.enable_cache = enable_cache
        self.cache = SimpleCache(max_size=cache_max_size, ttl=cache_ttl) if enable_cache else None
        # 存储活跃对话（可选，这里简单示范用字典，实际可改用 Redis）
        self.conversations: Dict[str, Conversation] = {}

        # 从 config 加载配置
        self._load_config()

    def _load_config(self):
        """从配置文件加载参数，如果没有则从环境变量读取"""
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
        """调用火山方舟 API，支持流式和非流式"""
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
        """非流式生成文本（带缓存）"""
        # 检查缓存
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
            # 存入缓存
            if self.enable_cache:
                self.cache.set(prompt, system_prompt, temperature, max_tokens, content)
            return content
        return None

    def generate_stream(self, prompt, system_prompt="你是一个专业的吉他教练。", temperature=0.7, max_tokens=500) -> Generator[str, None, None]:
        """
        流式生成文本，返回生成器，逐块返回文本片段
        适用于 SSE 或 Socket.IO 推送
        """
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

    # ========== 多轮对话相关 ==========
    def get_conversation(self, session_id: str) -> Conversation:
        """获取或创建会话"""
        if session_id not in self.conversations:
            self.conversations[session_id] = Conversation()
        return self.conversations[session_id]

    def chat(self, session_id: str, user_message: str, temperature=0.7, max_tokens=500) -> str:
        """
        多轮对话（非流式），自动维护历史
        """
        conv = self.get_conversation(session_id)
        conv.add_user_message(user_message)

        # 调用 API
        result = self._call_api(conv.get_messages(), temperature, max_tokens, stream=False)
        if result and "choices" in result:
            reply = result["choices"][0]["message"]["content"]
            conv.add_assistant_message(reply)
            return reply
        return "抱歉，我暂时无法回答。"

    def chat_stream(self, session_id: str, user_message: str, temperature=0.7, max_tokens=500) -> Generator[str, None, None]:
        """
        多轮对话流式输出
        """
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

        # 将完整回复保存到对话历史
        conv.add_assistant_message("".join(full_reply))

    # ========== 教学建议专用方法（带缓存） ==========
    def generate_advice(self, user_stats: Dict) -> Optional[str]:
        """根据用户统计数据生成教学建议，带缓存"""
        # 构建 prompt（与之前相同）
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
        # 使用通用 generate 方法（会使用缓存）
        return self.generate(prompt, system_prompt="你是一位鼓励型的吉他教练，给出具体可行的建议。")