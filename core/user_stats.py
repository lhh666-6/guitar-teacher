# core/user_stats.py

from models import TrainingRecord, db
from datetime import datetime, timedelta
from sqlalchemy import func

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
    chords = [{'name': row.chord_name, 'value': int(row.acc * 100)} for row in chord_query]
    return {
        'chords': chords,
        'values': [c['value'] for c in chords]
    }

def get_progress_trend(user_id, days=30):
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
    return {'dates': dates, 'rates': rates}

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
            'duration': round(r.time_spent or 0, 1)
        })
    return records