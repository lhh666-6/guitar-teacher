# models.py

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

    # 与训练记录的关系（方便反向查询）
    records = db.relationship('TrainingRecord', backref='user', lazy=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    # Flask-Login 需要的属性（UserMixin 已提供，但显式写出也可）
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
    chord_name = db.Column(db.String(50), nullable=False)   # 和弦名称
    correct = db.Column(db.Boolean, nullable=False)         # 是否正确
    time_spent = db.Column(db.Float)                        # 用时（秒）
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # 新增：关联用户 ID（必须）
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

    # 添加索引加速查询
    __table_args__ = (
        db.Index('idx_created_at', 'created_at'),
        db.Index('idx_chord_correct', 'chord_name', 'correct'),
        db.Index('idx_user_id', 'user_id'),          # 按用户查询的索引
    )

    def to_dict(self):
        return {
            'id': self.id,
            'chord_name': self.chord_name,
            'correct': self.correct,
            'time_spent': self.time_spent,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S')
        }