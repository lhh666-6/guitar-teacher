from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class TrainingRecord(db.Model):
    __tablename__ = 'training_record'
    id = db.Column(db.Integer, primary_key=True)
    chord_name = db.Column(db.String(50), nullable=False)   # 和弦名称
    correct = db.Column(db.Boolean, nullable=False)          # 是否正确
    time_spent = db.Column(db.Float)                          # 用时（秒）
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # 添加索引加速查询
    __table_args__ = (
        db.Index('idx_created_at', 'created_at'),
        db.Index('idx_chord_correct', 'chord_name', 'correct'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'chord_name': self.chord_name,
            'correct': self.correct,
            'time_spent': self.time_spent,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S')
        }