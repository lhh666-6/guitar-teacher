# config.py
# 吉他指法识别系统配置参数

import os
from dotenv import load_dotenv
load_dotenv()

# ---------- 日志调试 ----------
DEBUG = True                     # 控制日志输出级别

# ---------- 静态资源缓存 ----------
SEND_FILE_MAX_AGE_DEFAULT = 0     # 开发环境禁用静态缓存，生产环境可调至 3600
APP_VERSION = '20260429v2'        # 静态资源版本号，更新后递增强制刷新浏览器缓存

# ---------- 模型路径 ----------
YOLO_MODEL_PATH = "models/best.pt"                     # YOLO检测琴枕琴桥的模型

# ---------- 检测参数 ----------
NUM_STRINGS = 6                                         # 吉他弦数
NUM_FRETS = 12                                           # 要显示的品数
YOLO_CONF = 0.15                                         # YOLO检测置信度
HAND_CONF = 0.12                                        # 手部检测置信度

# ---------- 指板几何参数 ----------
SCALE_FACTOR = 1.0                                      # 品丝位置缩放因子（控制绘制范围）
STRING_EDGE_SHRINK_RATIO = 0.1                          # 琴弦端点向内侧收缩比例

# ---------- 调试与显示 ----------
DEBUG_MODE = True                                       # 是否打印详细调试信息
DRAW_FRET_NUMBERS = True                                # 是否在图像上绘制品号

# ---------- 图像预处理 ----------
USE_CLAHE = False                                       # 是否使用CLAHE增强对比度

# ---------- 滤波参数 ----------
FILTER_MODE = 4                                         # 0:无 1:简单平滑 2:预留 3:OneEuro 4:Kalman
PRESS_THRESHOLD_PX = 20                                 # 指尖离品丝的像素距离阈值
STRING_DIST_THRESH = 30                                 # 指尖离琴弦的像素距离阈值
MIN_BOX_WIDTH = 20                                   # 琴枕/琴桥最小宽度

# Kalman滤波参数 (FILTER_MODE=4 时生效)
KALMAN_Q = 0.08                                          # 过程噪声，越大越跟手 (0.01~0.2)
KALMAN_R = 0.5                                           # 测量噪声，越小越信任测量值 (0.1~2.0)

# OneEuro滤波参数
ONE_EURO_MIN_CUTOFF = 0.7
ONE_EURO_BETA = 0.005
ONE_EURO_DCUTOFF = 1.0

# 简单平滑参数
SMOOTH_ALPHA = 0.3

# 运动检测参数
MOTION_THRESHOLD = 8                                    # 像素变化阈值
MOTION_FRAMES = 4                                       # 连续超过阈值帧数后启用滤波

# 品号历史平滑长度
FRET_HISTORY_LEN = 5

# ---------- 横按检测参数 ----------
BARRE_ANGLE_THRESH = 35                                 # 食指直线与指板垂直方向的最大夹角（度）
BARRE_MIN_COVERED = 4                                   # 最少覆盖琴弦数才判定为横按（仅计4弦及以上）
USE_FIXED_DIST_THRESH = False                           # 是否使用固定距离阈值
FIXED_DIST_THRESH = 40                                  # 固定距离阈值（像素）
DYNAMIC_THRESH_RATIO = 1.5                              # 动态阈值比例

# ---------- 琴枕琴桥方向配置 ----------
FORCE_NUT_LEFT = False                                  # 视频 CSS 镜像已处理左右翻转

# ---------- Flask应用配置（新增，仅用于满足Flask要求）----------
SECRET_KEY = 'dev-secret-key'                           # Flask密钥，任意字符串即可
# 缩略图尺寸（必须与前端 constants.js 中的值一致）
THUMBNAIL_WIDTH = 640
# 大模型配置（DeepSeek 主力 + 火山方舟备用）
DEEPSEEK_API_KEY = 'sk-e2943168af8645e594c82104d2f23b65'
DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions'
LLM_MODEL = 'deepseek-v4-flash'
# 火山方舟（备用）
VOLCANO_API_KEY = '06ab62f2-ba88-4b31-b05d-6ce0cce4cd06g'
VOLCANO_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'
FALLBACK_MODEL = 'doubao-seed-2-0-mini-260215'
ENABLE_LLM = True

# ---------- 邮箱验证码配置 ----------
SMTP_HOST = 'smtp.qq.com'
SMTP_PORT = 465
SMTP_USER = os.getenv('SMTP_USER', '2741554524@qq.com')
SMTP_PASSWORD = os.getenv('SMTP_PASSWORD', 'yuvmgretufqvdecd')
# ---------- 数据库配置 ----------
SQLALCHEMY_DATABASE_URI = 'mysql+pymysql://guitar_user:Lhh815815@127.0.0.1:3306/guitar_db?charset=utf8mb4'
SQLALCHEMY_TRACK_MODIFICATIONS = False