# core/user_stats.py

from models import TrainingRecord, db
from datetime import datetime, timedelta
from sqlalchemy import func, case
from api.chords import chords_data

def get_overview(user_id):
    """返回当前用户的总览数据：总次数、总时长、平均正确率、薄弱和弦TOP3"""
    # 基础查询加上 user_id 过滤
    base_query = TrainingRecord.query.filter_by(user_id=user_id)
    
    total_sessions = base_query.count()
    avg_accuracy = db.session.query(func.avg(TrainingRecord.correct))\
        .filter(TrainingRecord.user_id == user_id).scalar() or 0
    avg_accuracy = int(avg_accuracy * 100)
    total_duration = db.session.query(func.sum(TrainingRecord.time_spent))\
        .filter(TrainingRecord.user_id == user_id).scalar() or 0
    total_duration = int(total_duration) // 60  # 转换为分钟

    weak_chords_query = db.session.query(
        TrainingRecord.chord_name,
        func.avg(TrainingRecord.correct).label('acc')
    ).filter(TrainingRecord.user_id == user_id)\
     .group_by(TrainingRecord.chord_name)\
     .order_by('acc').limit(3).all()
    weak_chords = [row.chord_name for row in weak_chords_query]

    return {
        'total_sessions': total_sessions,
        'total_duration': total_duration,
        'avg_accuracy': avg_accuracy,
        'weak_chords': weak_chords if weak_chords else ['无数据']
    }

def get_chord_mastery(user_id):
    """返回当前用户的所有和弦掌握度"""
    chord_query = db.session.query(
        TrainingRecord.chord_name,
        func.avg(TrainingRecord.correct).label('acc')
    ).filter(TrainingRecord.user_id == user_id)\
     .group_by(TrainingRecord.chord_name).all()
    chords = [{'name': row.chord_name, 'value': int((row.acc or 0) * 100)} for row in chord_query]
    return {
        'chords': chords,
        'values': [c['value'] for c in chords]
    }

def get_progress_trend(user_id, days=60):
    """返回当前用户最近 days 天的正确率趋势（按天聚合）"""
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=days)
    progress_query = db.session.query(
        func.date(TrainingRecord.created_at).label('day'),
        func.avg(TrainingRecord.correct).label('acc')
    ).filter(
        TrainingRecord.user_id == user_id,
        func.date(TrainingRecord.created_at) >= start_date
    ).group_by(
        func.date(TrainingRecord.created_at)
    ).order_by('day').all()

    dates = [row.day for row in progress_query]
    rates = [int(row.acc * 100) for row in progress_query]

    # 简单移动平均平滑（窗口5天），减少日间波折
    window = 5
    smoothed = []
    for i in range(len(rates)):
        half = window // 2
        start = max(0, i - half)
        end = min(len(rates), i + half + 1)
        avg = sum(rates[start:end]) / (end - start)
        smoothed.append(round(avg))
    return {'dates': dates, 'rates': smoothed}

def get_mode_ratio(user_id):
    """返回 quick vs normal 模式使用次数和比例"""
    mode_counts = db.session.query(
        TrainingRecord.mode,
        func.count(TrainingRecord.id)
    ).filter(
        TrainingRecord.user_id == user_id,
        TrainingRecord.mode.isnot(None)
    ).group_by(TrainingRecord.mode).all()

    result = {'quick': 0, 'normal': 0, 'total': 0}
    for mode, count in mode_counts:
        key = 'quick' if mode == 'quick' else 'normal'
        result[key] = count
        result['total'] += count
    return result

def get_daily_practice_count(user_id, days=90):
    """返回每天练习次数，用于日历热力图"""
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=days)
    daily = db.session.query(
        func.date(TrainingRecord.created_at).label('day'),
        func.count(TrainingRecord.id)
    ).filter(
        TrainingRecord.user_id == user_id,
        func.date(TrainingRecord.created_at) >= start_date
    ).group_by(func.date(TrainingRecord.created_at)).all()

    return [[str(row.day), row[1]] for row in daily]

def get_chord_difficulty_distribution(user_id):
    """返回用户练习和弦的难度分布"""
    practiced_chords = db.session.query(
        TrainingRecord.chord_name,
        func.count(TrainingRecord.id)
    ).filter(TrainingRecord.user_id == user_id)\
     .group_by(TrainingRecord.chord_name).all()

    chord_diff_map = {c['name']: c.get('difficulty', 1) for c in chords_data}
    diff_counts = {1: 0, 2: 0, 3: 0}
    for chord_name, count in practiced_chords:
        diff = chord_diff_map.get(chord_name, 1)
        diff_counts[diff] = diff_counts.get(diff, 0) + count

    return [
        {'name': '基础', 'value': diff_counts[1]},
        {'name': '进阶', 'value': diff_counts[2]},
        {'name': '高级', 'value': diff_counts[3]}
    ]

def get_recent_records(user_id, limit=10):
    """返回当前用户的最近练习记录"""
    records_query = TrainingRecord.query.filter_by(user_id=user_id)\
        .order_by(TrainingRecord.created_at.desc())\
        .limit(limit).all()
    records = []
    for r in records_query:
        records.append({
            'time': r.created_at.strftime('%Y-%m-%d %H:%M') if r.created_at else '',
            'chord': r.chord_name,
            'accuracy': int(r.correct * 100) if r.correct is not None else 0,
            'duration': round(r.time_spent or 0, 1),
            'is_unstable': bool(r.is_unstable) if r.is_unstable is not None else False,
            'mode': r.mode or 'normal'
        })
    return records


def get_advice_stats(user_id, include_daily=False):
    """构建教学仪表盘和 LLM 建议共用的统计数据"""
    overview = get_overview(user_id)
    mastery = get_chord_mastery(user_id)
    progress = get_progress_trend(user_id)
    recent = get_recent_records(user_id, limit=10)
    mode_ratio = get_mode_ratio(user_id)
    chord_diff_dist = get_chord_difficulty_distribution(user_id)

    unstable_count = db.session.query(func.count(TrainingRecord.id))\
        .filter(TrainingRecord.user_id == user_id, TrainingRecord.is_unstable == True).scalar()
    total_count = db.session.query(func.count(TrainingRecord.id))\
        .filter(TrainingRecord.user_id == user_id).scalar()
    unstable_ratio = round((unstable_count / total_count * 100) if total_count else 0.0, 1)

    rates = progress.get('rates', [])
    if len(rates) >= 3:
        recent_avg = sum(rates[-3:]) / 3
        earlier_avg = sum(rates[:3]) / 3 if len(rates) >= 6 else rates[0]
        if recent_avg - earlier_avg > 5:
            trend_desc = '上升'
        elif recent_avg - earlier_avg < -5:
            trend_desc = '下降'
        else:
            trend_desc = '平稳'
    else:
        trend_desc = '数据不足'

    recent_similarities = db.session.query(
        TrainingRecord.correct, TrainingRecord.similarity
    ).filter(
        TrainingRecord.user_id == user_id,
        TrainingRecord.similarity.isnot(None)
    ).order_by(TrainingRecord.created_at.desc()).limit(20).all()

    sim_trend = []
    adjusted_trend = []
    for correct_val, sim in reversed(recent_similarities):
        sim = float(sim)
        sim_trend.append(round(sim, 3))
        if include_daily:
            adjusted = min(sim * 1.1, 1.0) if correct_val else sim * 0.9
            adjusted_trend.append(round(adjusted, 3))

    result = {
        'overview': overview,
        'mastery': mastery,
        'progress': progress,
        'recent_records': recent,
        'mode_ratio': mode_ratio,
        'unstable_ratio': unstable_ratio,
        'unstable_count': unstable_count,
        'trend_desc': trend_desc,
        'chord_difficulty': chord_diff_dist,
        'similarity_trend': sim_trend
    }

    if include_daily:
        daily_practice = get_daily_practice_count(user_id)
        result['daily_practice'] = daily_practice
        result['similarity_trend'] = adjusted_trend
        result['recent_mode'] = 'quick' if mode_ratio.get('quick', 0) > 0 else 'normal'

    return result