import requests
import json
from config import VOLCANO_API_KEY, VOLCANO_ENDPOINT, LLM_MODEL

class LLMService:
    def __init__(self):
        self.api_key = VOLCANO_API_KEY
        self.endpoint = VOLCANO_ENDPOINT
        self.model = LLM_MODEL
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        })

    def generate(self, prompt, system_prompt="你是一个专业的吉他教练。", temperature=0.7, max_tokens=500):
        """调用火山方舟大模型生成文本"""
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        try:
            resp = self.session.post(self.endpoint, json=payload, timeout=10)
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"LLM调用失败: {e}")
            return None

    def generate_advice(self, user_stats):
        """根据用户统计数据生成教学建议"""
        weak_chords_str = ', '.join(user_stats['overview']['weak_chords'])
        prompt = f"""
根据以下用户的吉他练习数据，生成3条简短、鼓励性的教学建议（每条不超过30字）：
- 总练习次数：{user_stats['overview']['total_sessions']}
- 平均正确率：{user_stats['overview']['avg_accuracy']}%
- 薄弱和弦：{weak_chords_str}
- 最近一次练习：{user_stats['recent_records'][0] if user_stats['recent_records'] else '无'}

建议格式：以“1.”、“2.”、“3.”开头。
        """
        return self.generate(prompt, system_prompt="你是一位鼓励型的吉他教练，给出具体可行的建议。")