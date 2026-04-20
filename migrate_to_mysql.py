#!/usr/bin/env python3
"""
数据迁移脚本：将 SQLite 中的 User 和 TrainingRecord 数据复制到 MySQL。
使用前请确保：
1. 已安装 pymysql: pip install pymysql
2. MySQL 中已创建数据库和用户（参考 README）
3. config.py 中 DATABASE_URL 已设置为 MySQL 连接字符串
4. 停止正在运行的应用（避免数据库冲突）
"""

import sys
import os

# 添加项目根目录到 Python 路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import db, User, TrainingRecord
from config import Config

# 读取配置（假设 config.py 中已正确设置）
mysql_uri = Config.SQLALCHEMY_DATABASE_URI
if 'sqlite' in mysql_uri:
    print("错误: config.py 中的 DATABASE_URL 仍然是 SQLite，请先修改为 MySQL 连接字符串")
    sys.exit(1)

print(f"目标数据库: {mysql_uri}")

# 连接 SQLite（源数据库）
sqlite_path = 'sqlite:///training.db'
sqlite_engine = create_engine(sqlite_path)
SqliteSession = sessionmaker(bind=sqlite_engine)
sqlite_session = SqliteSession()

# 连接 MySQL（目标数据库）
mysql_engine = create_engine(mysql_uri, echo=False)
# 创建表结构（如果不存在）
db.Model.metadata.create_all(mysql_engine)
MysqlSession = sessionmaker(bind=mysql_engine)
mysql_session = MysqlSession()

def migrate_table(model, session_src, session_dst, id_field='id'):
    """通用迁移函数"""
    rows = session_src.query(model).all()
    count = 0
    for row in rows:
        # 检查是否已存在（避免重复）
        existing = session_dst.query(model).filter(getattr(model, id_field) == getattr(row, id_field)).first()
        if not existing:
            session_dst.add(row)
            count += 1
        else:
            print(f"跳过已存在的记录: {model.__name__} id={getattr(row, id_field)}")
    session_dst.commit()
    print(f"迁移 {model.__name__}: {count} 条记录")
    return count

try:
    print("开始迁移数据...")
    user_count = migrate_table(User, sqlite_session, mysql_session)
    record_count = migrate_table(TrainingRecord, sqlite_session, mysql_session)
    print(f"迁移完成！用户数: {user_count}, 训练记录数: {record_count}")
except Exception as e:
    print(f"迁移失败: {e}")
    mysql_session.rollback()
finally:
    sqlite_session.close()
    mysql_session.close()