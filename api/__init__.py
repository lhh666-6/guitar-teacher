from flask import Blueprint
from .solo import solo_bp
from .teach import teach_bp
from .chords import chords_bp   # 新增

api_bp = Blueprint('api', __name__, url_prefix='/api')
api_bp.register_blueprint(solo_bp)
api_bp.register_blueprint(teach_bp)
api_bp.register_blueprint(chords_bp)   # 注册