#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
独立测试火山引擎流式 API
直接使用 config.py 中的真实配置
"""

import sys
import os
import requests
import json

# 确保能导入同目录下的 config.py
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from config import VOLCANO_API_KEY, VOLCANO_ENDPOINT, LLM_MODEL
except ImportError as e:
    print(f"❌ 无法导入 config.py，请检查文件是否存在: {e}")
    sys.exit(1)

print("✅ 配置加载成功")
print(f"   API_KEY: {VOLCANO_API_KEY[:10]}...")
print(f"   ENDPOINT: {VOLCANO_ENDPOINT}")
print(f"   MODEL: {LLM_MODEL}\n")

# ========== 测试参数 ==========
PROMPT = "用三句话介绍吉他，每句不超过20字。"
SYSTEM_PROMPT = "你是一个专业的吉他教练。"
TEMPERATURE = 0.7
MAX_TOKENS = 100

# ========== 发送流式请求 ==========
headers = {
    "Authorization": f"Bearer {VOLCANO_API_KEY}",
    "Content-Type": "application/json",
    "Accept": "text/event-stream"      # 关键：告诉服务器我们要 SSE 流
}

payload = {
    "model": LLM_MODEL,
    "messages": [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": PROMPT}
    ],
    "temperature": TEMPERATURE,
    "max_tokens": MAX_TOKENS,
    "stream": True                      # 关键：启用流式
}

print("🚀 发送流式请求...")
print("=" * 50)

try:
    with requests.post(VOLCANO_ENDPOINT, headers=headers, json=payload, stream=True, timeout=30) as resp:
        resp.raise_for_status()
        print(f"响应状态: {resp.status_code}")
        print(f"Content-Type: {resp.headers.get('Content-Type')}\n")

        if 'text/event-stream' not in resp.headers.get('Content-Type', ''):
            print("⚠️ 警告：响应不是 SSE 格式，可能无法流式输出！")

        print("📝 流式内容开始（逐字打印）:\n")
        for line in resp.iter_lines(decode_unicode=True):
            if line:
                if line.startswith('data: '):
                    data = line[6:]
                    if data == '[DONE]':
                        break
                    try:
                        chunk = json.loads(data)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        if "content" in delta:
                            text = delta["content"]
                            print(text, end='', flush=True)   # 逐字输出，不换行
                    except json.JSONDecodeError:
                        continue
        print("\n" + "=" * 50)
        print("✅ 流式接收完成")

except Exception as e:
    print(f"\n❌ 请求失败: {e}")
    sys.exit(1)
    