# models.py 完整修改后

from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin

db = SQLAlchemy()

class User(UserMixin, db.Model):
    __tablename__ = 'user'
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    nickname = db.Column(db.String(64))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    records = db.relationship('TrainingRecord', backref='user', lazy=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    @property
    def is_authenticated(self):
        return True

    @property
    def is_active(self):
        return True

    @property
    def is_anonymous(self):
        return False

    def get_id(self):
        return str(self.id)


class TrainingRecord(db.Model):
    __tablename__ = 'training_record'
    id = db.Column(db.Integer, primary_key=True)
    chord_name = db.Column(db.String(50), nullable=False)
    correct = db.Column(db.Boolean, nullable=False)
    time_spent = db.Column(db.Float)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

    # 新增字段
    is_unstable = db.Column(db.Boolean, default=False)       # 按弦不稳标记
    similarity = db.Column(db.Float, nullable=True)          # 音频相似度 0~1
    mode = db.Column(db.String(20), nullable=True)           # 练习模式: 'normal' / 'quick'

    __table_args__ = (
        db.Index('idx_created_at', 'created_at'),
        db.Index('idx_chord_correct', 'chord_name', 'correct'),
        db.Index('idx_user_id', 'user_id'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'chord_name': self.chord_name,
            'correct': self.correct,
            'time_spent': self.time_spent if self.time_spent else None,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None,
            'is_unstable': self.is_unstable,
            'similarity': self.similarity,
            'mode': self.mode
        }