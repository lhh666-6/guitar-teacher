# config.py
# 吉他指法识别系统配置参数

# ---------- 日志调试 ----------
DEBUG = True                     # 控制日志输出级别

# ---------- 模型路径 ----------
YOLO_MODEL_PATH = "models/best.pt"                     # YOLO检测琴枕琴桥的模型
HAND_MODEL_PATH = "models/hand_landmarker.task"        # MediaPipe手部关键点模型

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
FILTER_MODE = 3                                         # 0:无滤波 1:简单平滑 2:预留 3:OneEuro滤波
PRESS_THRESHOLD_PX = 20                                 # 指尖离品丝的像素距离阈值
STRING_DIST_THRESH = 30                                 # 指尖离琴弦的像素距离阈值
MIN_BOX_WIDTH = 20                                   # 琴枕/琴桥最小宽度

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
BARRE_ANGLE_THRESH = 25                                 # 食指直线与指板垂直方向的最大夹角（度）
BARRE_MIN_COVERED = 4                                   # 最少覆盖琴弦数才判定为横按
USE_FIXED_DIST_THRESH = False                           # 是否使用固定距离阈值
FIXED_DIST_THRESH = 40                                  # 固定距离阈值（像素）
DYNAMIC_THRESH_RATIO = 1.5                              # 动态阈值比例

# ---------- 小拇指专属参数 ----------
PINKY_PRESS_THRESHOLD_PX = 25                           # 小拇指离品丝阈值
PINKY_STRING_DIST_THRESH = 40                           # 小拇指离琴弦阈值
PINKY_FRET_HISTORY_LEN = 5
PINKY_SMOOTH_ALPHA = 0.4
PINKY_ANGLE_THRESH = 30                                 # 小拇指弯曲角度阈值

# ---------- 琴枕琴桥方向配置 ----------
FORCE_NUT_LEFT = False                                  # 根据前端镜像情况设置

# ---------- Flask应用配置（新增，仅用于满足Flask要求）----------
SECRET_KEY = 'dev-secret-key'                           # Flask密钥，任意字符串即可
# config.py 末尾添加
# 缩略图尺寸（必须与前端 constants.js 中的值一致）
THUMBNAIL_WIDTH = 960