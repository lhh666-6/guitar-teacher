from flask import Blueprint, request, jsonify
from flask_login import login_user, logout_user, current_user
from models import db, User
import re

auth_bp = Blueprint('auth', __name__)

def is_valid_email(email):
    return re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email)

@auth_bp.route('/api/register', methods=['POST'])
def register():
    data = request.json
    email = data.get('email', '').strip()
    password = data.get('password', '')
    confirm = data.get('confirm', '')

    if not email or not password:
        return jsonify({'error': '邮箱和密码不能为空'}), 400
    if not is_valid_email(email):
        return jsonify({'error': '邮箱格式不正确'}), 400
    if len(password) < 6:
        return jsonify({'error': '密码长度至少6位'}), 400
    if password != confirm:
        return jsonify({'error': '两次密码不一致'}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({'error': '邮箱已注册'}), 400

    user = User(email=email)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    return jsonify({'message': '注册成功，请登录'})

@auth_bp.route('/api/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email', '').strip()
    password = data.get('password', '')

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({'error': '邮箱或密码错误'}), 401

    login_user(user)
    return jsonify({'message': '登录成功', 'redirect': '/'})

@auth_bp.route('/api/logout', methods=['POST'])
def logout():
    logout_user()
    return jsonify({'message': '已退出'})

@auth_bp.route('/api/check_login', methods=['GET'])
def check_login():
    return jsonify({'logged_in': current_user.is_authenticated})

@auth_bp.route('/api/current_user', methods=['GET'])
def current_user_info():
    if current_user.is_authenticated:
        return jsonify({
            'logged_in': True,
            'email': current_user.email,
            'nickname': current_user.nickname or current_user.email.split('@')[0]
        })
    return jsonify({'logged_in': False})