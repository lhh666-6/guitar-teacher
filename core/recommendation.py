"""智能和弦推荐算法"""

import random
import logging

from api.chords import chords_data
from core import user_stats

logger = logging.getLogger(__name__)


def generate_smart_recommendations(user_id, count=5):
    """
    基于用户练习数据和和弦难度生成智能推荐（带理由），每次调用结果具有随机性。
    """
    overview = user_stats.get_overview(user_id)
    recent = user_stats.get_recent_records(user_id, limit=20)

    practiced_chords = set()
    chord_accuracies = {}
    for r in recent:
        chord = r.get('chord')
        acc = r.get('accuracy', 0)
        if chord:
            practiced_chords.add(chord)
            chord_accuracies.setdefault(chord, []).append(acc)

    chord_avg_acc = {c: sum(accs) / len(accs) for c, accs in chord_accuracies.items()}
    weak_chords = [c for c, acc in chord_avg_acc.items() if acc < 60]

    chords_info = {c['name']: c for c in chords_data}
    all_chord_names = list(chords_info.keys())
    unpracticed = [c for c in all_chord_names if c not in practiced_chords]

    recommendations = []

    # 1. 随机选择1~2个薄弱和弦
    if weak_chords:
        sample_size = min(2, len(weak_chords))
        selected_weak = random.sample(weak_chords, sample_size)
        for chord in selected_weak:
            recommendations.append({
                'name': chord,
                'reason': f"你在{chord}上正确率偏低，加强练习能有效提升"
            })

    # 2. 从未练习过的和弦中随机选1~2个
    if unpracticed:
        sample_size = min(2, len(unpracticed))
        selected_unpracticed = random.sample(unpracticed, sample_size)
        for chord in selected_unpracticed:
            diff = chords_info[chord]['difficulty']
            if diff == 1:
                reason = f"{chord}是基础开放和弦，适合新手入门"
            elif diff == 2:
                reason = f"{chord}稍有难度，但值得尝试拓展指法"
            else:
                reason = f"{chord}和弦，挑战一下提升技巧"
            recommendations.append({'name': chord, 'reason': reason})

    # 3. 剩余名额根据平均正确率随机抽取
    remaining = count - len(recommendations)
    if remaining > 0:
        avg_accuracy = overview.get('avg_accuracy', 0)
        if avg_accuracy < 50:
            pool = [c for c in all_chord_names if chords_info[c]['difficulty'] == 1]
        else:
            pool = [c for c in all_chord_names if chords_info[c]['difficulty'] >= 2]

        pool = [c for c in pool if c not in [r['name'] for r in recommendations]]
        if pool:
            sample_size = min(remaining, len(pool))
            if sample_size < len(pool):
                selected = random.sample(pool, sample_size)
            else:
                selected = pool[:]
            for chord in selected:
                diff = chords_info[chord]['difficulty']
                if diff == 1:
                    reason = f"{chord}和弦，巩固基础指法"
                elif diff == 2:
                    reason = f"{chord}和弦，提升和弦转换熟练度"
                else:
                    reason = f"{chord}和弦，适合高阶练习"
                recommendations.append({'name': chord, 'reason': reason})

    # 如果还不够，从所有和弦中随机补全
    if len(recommendations) < count:
        remaining = count - len(recommendations)
        remaining_pool = [c for c in all_chord_names if c not in [r['name'] for r in recommendations]]
        if remaining_pool:
            if len(remaining_pool) >= remaining:
                extra = random.sample(remaining_pool, remaining)
            else:
                extra = remaining_pool[:]
            for chord in extra:
                recommendations.append({'name': chord, 'reason': '根据你的练习记录智能推荐'})

    random.shuffle(recommendations)
    return recommendations[:count]
