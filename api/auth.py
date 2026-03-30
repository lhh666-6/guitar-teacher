import random
import string
import time
from flask import Blueprint, request, jsonify
from flask_login import login_user, logout_user, current_user
from flask_mail import Message
from models import db, User
import re

auth_bp = Blueprint('auth', __name__)

# 导入 Redis 和 Mail 客户端（在 app.py 中初始化后导入）
redis_client = None
mail = None

# 临时存储验证码（仅用于测试，生产环境请用 Redis）
temp_codes = {}

def init_redis_and_mail(redis_instance, mail_instance):
    global redis_client, mail
    redis_client = redis_instance
    mail = mail_instance

def is_valid_email(email):
    return re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email)

@auth_bp.route('/api/send_code', methods=['POST'])
def send_code():
    data = request.json
    email = data.get('email', '').strip()
    
    if not email:
        return jsonify({'error': '邮箱不能为空'}), 400
    if not is_valid_email(email):
        return jsonify({'error': '邮箱格式不正确'}), 400
    
    if User.query.filter_by(email=email).first():
        return jsonify({'error': '邮箱已注册'}), 400
    
    code = ''.join(random.choices(string.digits, k=6))
    
    # 存储到内存，有效期5分钟
    temp_codes[email] = {'code': code, 'expire': time.time() + 300}
    
    print(f"\n========== 验证码 ==========")
    print(f"邮箱: {email}")
    print(f"验证码: {code}")
    print(f"===========================\n")
    
    if mail:
        try:
            msg = Message(
                subject='吉他教学系统 - 邮箱验证码',
                recipients=[email],
                body=f'您的验证码是：{code}，有效期5分钟。\n\n如果不是您本人操作，请忽略此邮件。'
            )
            mail.send(msg)
            print(f"邮件已发送至 {email}")
        except Exception as e:
            print(f"邮件发送失败: {e}，但验证码已打印，请使用终端中的验证码")
    else:
        print("邮件服务未初始化，请使用终端中的验证码")
    
    return jsonify({'message': '验证码已发送，请查看终端输出'})

@auth_bp.route('/api/register', methods=['POST'])
def register():
    data = request.json
    email = data.get('email', '').strip()
    password = data.get('password', '')
    confirm = data.get('confirm', '')
    code = data.get('code', '')

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
    
    # 验证验证码
    stored = temp_codes.get(email)
    if not stored or stored['expire'] < time.time():
        return jsonify({'error': '验证码已过期，请重新获取'}), 400
    if stored['code'] != code:
        return jsonify({'error': '验证码错误'}), 400
    
    user = User(email=email)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    
    # 删除已使用的验证码
    if email in temp_codes:
        del temp_codes[email]
    
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
    return jsonify({'message': '登录成功', 'redirect': '/'})   # 跳转到首页

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