# api/__init__.py - 不在此处注册蓝图，各蓝图在 app.py 中直接注册
# 保留必要的导入以支持 app.py 中的 from api.xxx import xxx
from .teach import teach_bp
from .chords import chords_bp