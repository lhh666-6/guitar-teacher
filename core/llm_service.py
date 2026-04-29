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
            "thinking": {"type": "enabled"}
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

    # ==================== 全面评估 Prompt 构建 ====================
    def _build_advice_prompt(self, user_stats: Dict) -> str:
        o = user_stats.get('overview', {})
        mastery = user_stats.get('mastery', {})
        progress = user_stats.get('progress', {})
        recent_records = user_stats.get('recent_records', [])
        mode_ratio = user_stats.get('mode_ratio', {})
        unstable_ratio = user_stats.get('unstable_ratio', 0)
        unstable_count = user_stats.get('unstable_count', 0)
        trend_desc = user_stats.get('trend_desc', '未知')
        chord_difficulty = user_stats.get('chord_difficulty', [])
        similarity_trend = user_stats.get('similarity_trend', [])

        # 1. 和弦掌握度雷达图 — 全部排名（带分数）
        chords_list = mastery.get('chords', [])
        chords_sorted = sorted(chords_list, key=lambda x: x.get('value', 0), reverse=True)
        all_ranked = ', '.join([f"{c['name']}({c.get('value',0)}%)" for c in chords_sorted]) if chords_sorted else '无数据'
        best3 = [(c['name'], c.get('value', 0)) for c in chords_sorted[:3]] if chords_sorted else []
        worst3 = [(c['name'], c.get('value', 0)) for c in chords_sorted[-3:]] if chords_sorted else []

        # 2. 难度分布玫瑰图
        diff_desc = ''
        if chord_difficulty:
            diff_parts = [f"{d['name']}:{d['value']}次" for d in chord_difficulty if d.get('value', 0) > 0]
            diff_desc = ', '.join(diff_parts) if diff_parts else '暂无练习分布数据'
            total_diff = sum(d.get('value', 0) for d in chord_difficulty)
            if total_diff > 0:
                pcts = [f"{d['name']}{d['value']*100//total_diff}%" for d in chord_difficulty if d.get('value', 0) > 0]
                diff_desc += f" (占比: {', '.join(pcts)})"

        # 3. 进步趋势折线图
        rates = progress.get('rates', [])
        dates = progress.get('dates', [])
        rate_detail = ''
        if len(dates) >= 5:
            recent_pairs = [f"{d}({r}%)" for d, r in zip(dates[-5:], rates[-5:])]
            rate_detail = ' → '.join(recent_pairs)
        elif len(dates) > 0:
            rate_detail = ', '.join([f"{d}({r}%)" for d, r in zip(dates, rates)])

        # 4. 相似度趋势
        sim_detail = ''
        if similarity_trend and len(similarity_trend) >= 3:
            sim_vals = [f"{v*100:.0f}%" for v in similarity_trend[-5:]]
            sim_detail = f"近5次: {' → '.join(sim_vals)}"
            sim_avg = sum(similarity_trend[-5:]) / min(5, len(similarity_trend[-5:]))
            sim_detail += f" | 均值: {sim_avg*100:.1f}%"

        # 5. 最近练习记录（带不稳标记）
        recent_parts = []
        for i, r in enumerate(recent_records[:10]):
            stable_tag = '⚠不稳' if r.get('is_unstable') else '✓'
            mode_tag = '⚡' if r.get('mode') == 'quick' else ''
            recent_parts.append(f"{i+1}.{r['chord']}({r['accuracy']}%{stable_tag}{mode_tag})")
        recent_str = '\n'.join(recent_parts) if recent_parts else '无'

        # 6. 模式使用
        quick = mode_ratio.get('quick', 0)
        normal = mode_ratio.get('normal', 0)
        total_mode = quick + normal
        if total_mode > 0:
            mode_desc = f"⚡快速:{quick}次({quick*100//total_mode}%) | 📝普通:{normal}次({normal*100//total_mode}%)"
            if quick > normal * 1.5:
                mode_desc += " | ⚠快速模式显著偏多"
            elif normal > quick * 1.5:
                mode_desc += " | 普通模式为主"
        else:
            mode_desc = "暂无数据"

        # 7. 薄弱和弦
        weak_chords = o.get('weak_chords', ['无'])
        weak_with_scores = []
        for w in weak_chords:
            score = next((c.get('value', '?') for c in chords_list if c['name'] == w), '?')
            weak_with_scores.append(f"{w}({score}%)")
        weak_str = ', '.join(weak_with_scores) if weak_with_scores else '无'

        # 构建完整数据报告
        sections = [
            "=" * 40,
            "📊 吉他练习数据全面报告",
            "=" * 40,
            "",
            "▎一、总览数据",
            f"   总练习: {o.get('total_sessions',0)}次 | 总时长: {o.get('total_duration',0)}分钟 | 平均正确率: {o.get('avg_accuracy',0)}%",
            f"   正确次数: {int(o.get('total_sessions',0) * o.get('avg_accuracy',0) / 100)} | 错误次数: {int(o.get('total_sessions',0) * (1 - o.get('avg_accuracy',0) / 100))}",
            f"   不稳次数: {unstable_count} | 不稳占比: {unstable_ratio}%",
            "",
            "▎二、和弦掌握度排名（雷达图数据）",
            f"   全部: {all_ranked}",
            f"   🏆 最佳3: {', '.join([f'{n}({v}%)' for n, v in best3]) if best3 else '无'}",
            f"   ⚠ 薄弱3: {', '.join([f'{n}({v}%)' for n, v in worst3]) if worst3 else '无'}",
            f"   🔴 系统判定薄弱TOP3: {weak_str}",
            "",
            "▎三、进步趋势（折线图数据）",
            f"   整体趋势: {trend_desc}",
            f"   近期数值: {rate_detail or '无'}",
            f"   相似度: {sim_detail or '无数据'}",
            "",
            "▎四、难度练习分布（玫瑰图数据）",
            f"   {diff_desc or '暂无'}",
            "",
            "▎五、练习模式与习惯",
            f"   {mode_desc}",
            "",
            "▎六、最近10次练习详情",
            f"{recent_str}",
            "",
            "=" * 40,
            "请基于以上完整数据，撰写一份全面的吉他学习评估报告。",
            "=" * 40,
        ]

        # 正确率高时追加歌曲推荐请求
        avg_acc = o.get('avg_accuracy', 0)
        if avg_acc >= 80:
            best_chords = [c.get('name','') for c in chords_sorted[:5] if c.get('value', 0) >= 70]
            chord_list = '、'.join(best_chords) if best_chords else '无'
            sections.append("")
            sections.append("=" * 40)
            sections.append("🎵 用户整体正确率较高，请额外推荐适合学习的歌曲")
            sections.append("=" * 40)
            sections.append(f"用户已掌握的和弦: {chord_list}")
            sections.append("请推荐2-3首适合用户当前水平的弹唱歌曲（中文优先），每首列出：")
            sections.append("1. 歌曲名 + 原唱")
            sections.append("2. 歌曲使用的核心和弦进行（如 C-G-Am-F）")
            sections.append("3. 用户已会哪些和弦、还需练哪个")
            sections.append("4. 弹奏难度评估（用★表示，1-5星）")

        return '\n'.join(sections)

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
            "你是资深吉他教学专家兼数据分析师。用户提供了一份完整的吉他练习数据报告，"
            "包含掌握度排名（雷达图）、进步趋势（折线图）、难度分布（玫瑰图）、"
            "练习频次（日历热力图）、稳定性（环形图）、模式使用比例等多维度数据。\n\n"
            "你的任务：撰写一份全面的吉他学习评估报告，请严格按以下结构输出，每部分都要引用具体数据：\n\n"
            "## 一、整体评估\n"
            "用一段话概括学习状态，引用总练习次数、平均正确率、趋势方向等核心指标。\n\n"
            "## 二、强项分析\n"
            "引用掌握度最高的2-3个和弦及其分数，分析为什么这些和弦掌握得好，"
            "结合难度分布数据说明学习策略的优势。\n\n"
            "## 三、薄弱环节\n"
            "引用薄弱和弦的具体分数和排名，分析不稳比例和可能的指法问题。"
            "如果近期趋势下降，指出具体的数据变化。\n\n"
            "## 四、进步趋势解读\n"
            "解读正确率趋势线和相似度数据，说明是在进步、退步还是平台期。"
            "结合日期分析哪段时间进步最明显。\n\n"
            "## 五、练习习惯评价\n"
            "分析快速模式vs普通模式的使用比例，评估练习深度是否足够。"
            "如果快速模式占比过高（>60%），提醒需要更多精细化练习。\n\n"
            "## 六、针对性建议（4-5条）\n"
            "每条建议包含：1）针对的具体问题（引用数据）；2）具体的练习方法；"
            "3）建议的练习频率或时长。用1.2.3.4.编号，每条60-100字。\n\n"
            "## 七、歌曲推荐（仅当用户整体正确率≥80%时有此章节）\n"
            "如果数据报告末尾有「🎵歌曲推荐」请求，则输出此章节。\n"
            "推荐2-3首适合的中文弹唱歌曲，每首包含：\n"
            "① 歌曲名 + 原唱\n"
            "② 和弦进行（如 C-G-Am-F，标注每个和弦在第几拍切换）\n"
            "③ 难度评估（★1-5），说明用户还需练习哪个和弦\n\n"
            "要求：语气温暖鼓励，像一位关心学生的老师，不要像冷冰冰的数据报告。"
            "用「你」称呼用户。精确引用数据中的数字。"
        )
        return self.generate(prompt, system_prompt, temperature=0.5, max_tokens=1200)

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