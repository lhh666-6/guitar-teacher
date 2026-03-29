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
# 大模型配置（火山方舟）
VOLCANO_API_KEY = '06ab62f2-ba88-4b31-b05d-6ce0cce4cd06'          # 替换为实际密钥
VOLCANO_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'  # 示例地址
LLM_MODEL = 'doubao-seed-2-0-mini-260215'                # 替换为部署的模型ID
ENABLE_LLM = True                          # 是否启用大模型
# config.py 末尾添加

VOLC_TTS_VOICE_TYPE = "zh-CN-XiaoxiaoNeural"   # 或其他音色

# ---------- 听觉和弦识别参数（Audio Chord Recognition）----------
# 总开关：用于后续在不改业务代码的情况下统一启停音频识别能力
AUDIO_CHORD_ENABLED = True

# 输入设备与流式处理
# 使用 sounddevice 时的设备索引；None 表示使用系统默认输入设备
AUDIO_INPUT_DEVICE_INDEX = None
# 麦克风采样率（Hz），22050 对吉他扫弦识别与性能较均衡
AUDIO_SAMPLE_RATE = 22050
# 每次从麦克风读取的采样点数（chunk），越小延迟越低但CPU开销更高
AUDIO_CHUNK_SIZE = 1024
# 滑窗总时长（秒），用于一次和弦判定的上下文长度
AUDIO_WINDOW_SECONDS = 1.0
# 滑窗步长（秒），越小输出越频繁、实时性越强
AUDIO_HOP_SECONDS = 0.1

# 预处理与抗噪
# RMS噪声门限：低于该值认为是静音/背景噪声，跳过识别
AUDIO_RMS_GATE = 0.012
# 是否启用预加重，提高高频细节，改善扫弦瞬态特征
AUDIO_USE_PREEMPHASIS = False
# 预加重系数，常用 0.95~0.98
AUDIO_PREEMPHASIS_COEF = 0.97
# 是否启用谐波-打击乐分离（HPSS），通常有助于和弦判定稳定
AUDIO_USE_HPSS = True
# 可选带通滤波下限（Hz），None 表示不限制
AUDIO_BANDPASS_LOW_HZ = 80
# 可选带通滤波上限（Hz），None 表示不限制
AUDIO_BANDPASS_HIGH_HZ = 1000

# 特征提取（librosa + chroma）
# chroma算法类型：'stft' 实时更友好，'cqt' 音高表达更细但更耗时
AUDIO_CHROMA_TYPE = 'stft'
# STFT窗长（n_fft），越大频率分辨率更好但时延更高
AUDIO_N_FFT = 2048
# 帧移（hop_length），越小时间分辨率越高但计算量更大
AUDIO_HOP_LENGTH = 512
# chroma维度固定为12（12平均律）
AUDIO_CHROMA_BINS = 12
# chroma时序聚合方式：'median' 对瞬时噪声更稳，'mean' 更平滑
AUDIO_CHROMA_AGGREGATE = 'median'
# 特征质量阈值（top1-top2分离度），低于阈值表示当前窗口区分度较弱
AUDIO_FEATURE_QUALITY_GATE = 0.05

# 和弦模板权重（可用于微调不同和弦音的重要性）
AUDIO_TEMPLATE_ROOT_WEIGHT = 1.0
AUDIO_TEMPLATE_THIRD_WEIGHT = 0.85
AUDIO_TEMPLATE_FIFTH_WEIGHT = 0.75
AUDIO_TEMPLATE_SEVENTH_WEIGHT = 0.65

# 分类输出设置
# 每次打印/调试展示的Top-K候选和弦数
AUDIO_CLASSIFIER_TOP_K = 3

# 平滑器设置
# 在平滑窗口中，候选和弦至少出现多少次才认为“有足够证据”
AUDIO_SMOOTH_MIN_VOTES = 2

# 分类与置信度控制
# 首版和弦集合（12个常用和弦），后续可扩展
AUDIO_CHORD_LABELS = [
	'C', 'G', 'Am', 'F', 'Dm', 'Em', 'E', 'A', 'D', 'A7', 'E7', 'C7'
]
# Top-1置信度阈值，低于阈值输出 Unknown 以减少误报
AUDIO_CONFIDENCE_THRESHOLD = 0.30
# 次优差距阈值：Top1-Top2 小于该值时判定不稳定，输出 Unknown
AUDIO_MARGIN_THRESHOLD = 0.025
# 未知类别输出名称
AUDIO_UNKNOWN_LABEL = 'Unknown'

# 实时稳定器（扫弦场景重点）
# 平滑窗口帧数，窗口内多数投票减少抖动
AUDIO_SMOOTH_WINDOW = 5
# 迟滞阈值：新和弦置信度需超过当前和弦该差值才允许切换
AUDIO_SWITCH_HYSTERESIS = 0.05
# 最小输出间隔（秒），避免终端/上层消费端过于频繁刷新
AUDIO_MIN_OUTPUT_INTERVAL = 0.08

# 调试与日志
# 是否打印每帧调试信息（RMS、TopK、延迟估计）
AUDIO_DEBUG_LOG = True
# 是否打印Top-K候选，便于手工调参观察
AUDIO_PRINT_TOP_K = 3