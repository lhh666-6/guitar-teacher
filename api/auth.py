from flask import Blueprint, request, jsonify
from flask_login import login_user, logout_user, current_user
from models import db, User
import re
import random
import smtplib
import time
from email.mime.text import MIMEText
from email.header import Header

auth_bp = Blueprint('auth', __name__)

# 内存存储验证码 {email: {'code': '123456', 'expires': timestamp}}
_verify_codes = {}

VERIFY_CODE_EXPIRE = 300  # 5分钟过期
VERIFY_CODE_COOLDOWN = 60  # 60秒内不允许重发


def is_valid_email(email):
    return re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email)


def send_email(to_email, subject, body):
    """通过 QQ SMTP 发送邮件"""
    from config import SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD
    msg = MIMEText(body, 'plain', 'utf-8')
    msg['Subject'] = Header(subject, 'utf-8')
    msg['From'] = SMTP_USER
    msg['To'] = to_email

    try:
        server = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=10)
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_USER, [to_email], msg.as_string())
        server.quit()
        return True, None
    except smtplib.SMTPAuthenticationError:
        return False, 'SMTP 认证失败，请检查授权码'
    except smtplib.SMTPException as e:
        return False, f'邮件发送失败: {e}'
    except Exception as e:
        return False, f'发送异常: {e}'


@auth_bp.route('/api/send_verify_code', methods=['POST'])
def send_verify_code():
    data = request.json
    email = data.get('email', '').strip()

    if not email or not is_valid_email(email):
        return jsonify({'error': '请输入有效的邮箱地址'}), 400

    # 检查冷却时间
    existing = _verify_codes.get(email)
    if existing and time.time() - existing.get('sent_at', 0) < VERIFY_CODE_COOLDOWN:
        remaining = int(VERIFY_CODE_COOLDOWN - (time.time() - existing['sent_at']))
        return jsonify({'error': f'请 {remaining} 秒后再试'}), 429

    # 生成6位验证码
    code = str(random.randint(100000, 999999))
    _verify_codes[email] = {
        'code': code,
        'expires': time.time() + VERIFY_CODE_EXPIRE,
        'sent_at': time.time()
    }

    # 发送邮件
    subject = '吉他教学系统 - 邮箱验证码'
    body = f'您的验证码是：{code}\n有效期 5 分钟，请勿泄露。'
    success, error = send_email(email, subject, body)

    if success:
        return jsonify({'message': '验证码已发送'})
    else:
        # 发送失败，清除验证码缓存
        _verify_codes.pop(email, None)
        return jsonify({'error': error}), 500


@auth_bp.route('/api/register', methods=['POST'])
def register():
    data = request.json
    email = data.get('email', '').strip()
    password = data.get('password', '')
    confirm = data.get('confirm', '')
    verify_code = data.get('verify_code', '').strip()

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

    # 校验验证码
    if not verify_code:
        return jsonify({'error': '请输入验证码'}), 400
    cached = _verify_codes.get(email)
    if not cached:
        return jsonify({'error': '请先获取验证码'}), 400
    if time.time() > cached['expires']:
        _verify_codes.pop(email, None)
        return jsonify({'error': '验证码已过期，请重新获取'}), 400
    if cached['code'] != verify_code:
        return jsonify({'error': '验证码错误'}), 400

    # 验证通过，删除缓存
    _verify_codes.pop(email, None)

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
