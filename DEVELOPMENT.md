# 智能吉他和弦教学系统 — 开发文档

## 1. 项目概述

基于摄像头 + 麦克风的实时吉他指法检测与教学反馈系统。前端采集视频帧和手部关键点，后端通过 YOLO + 指板几何算法判定按弦/品位，结合音高检测（YIN）和 LLM 生成教学建议。

**核心能力:**
- Solo 模式: 实时指法检测 + 和弦正确性评估（视觉+听觉双验证）
- 调音器: 单弦音高检测，渐变仪表盘，自动模式
- 教学驾驶舱: 练习统计、雷达图、进步曲线、AI 智能指导
- 用户系统: 邮箱注册/登录，训练记录持久化

## 2. 技术栈

| 层 | 技术 |
|---|------|
| 后端框架 | Flask + Flask-SocketIO + Flask-Login |
| 实时通信 | Socket.IO (WebSocket, ping 25s/timeout 60s) |
| 数据库 | MySQL + SQLAlchemy ORM |
| 对象检测 | YOLO (ultralytics, best.pt) |
| 手部关键点 | MediaPipe Hands (前端 JS, 21点/手) |
| 音高检测 | YIN 算法 (Meyda 前端库) |
| LLM | DeepSeek V4 Flash (主力) + 火山方舟豆包 (备用) |
| TTS | 火山方舟 Edge TTS |
| 前端 | 原生 JS + Canvas，无框架 |
| 图标 | Font Awesome 6 |

## 3. 目录结构

```
guitar-teacher/
├── app.py                  # Flask 入口, Socket.IO 事件, HTTP 路由
├── config.py               # 全局配置（模型路径/检测阈值/滤波/LLM/DB）
├── models.py               # SQLAlchemy 模型: User, TrainingRecord
├── requirements.txt        # Python 依赖
│
├── core/
│   ├── detector.py         # GuitarFingeringRecognizer — YOLO + 指板几何 + 指法判定
│   ├── llm_service.py      # LLM 对话管理 + DeepSeek/火山方舟双通道 + 缓存
│   ├── tts_service.py      # Edge TTS 语音合成（磁盘缓存）
│   ├── video_processor.py  # 帧处理线程（YOLO 推理 + emit）
│   ├── filters.py          # OneEuroFilter / Kalman 滤波
│   ├── utils.py            # base64→cv2, safe_socketio_emit, cache_result
│   ├── recommendation.py   # 智能和弦推荐算法
│   └── user_stats.py       # 用户统计数据聚合
│
├── api/
│   ├── auth.py             # 注册/登录/登出 (邮箱验证码), Blueprint
│   ├── chords.py           # 和弦数据库 API (70+ 和弦), Blueprint
│   └── teach.py            # 教学面板 API + 自动手部检测, Blueprint
│
├── templates/              # Jinja2 模板 (6个页面)
│   ├── index.html          # 首页（模式选择 + 主题切换）
│   ├── solo.html           # Solo 训练页（最复杂）
│   ├── tuning.html         # 调音器页
│   ├── teach.html          # 教学驾驶舱
│   ├── history.html        # 历史记录
│   └── login.html          # 登录/注册
│
├── static/
│   ├── css/
│   │   ├── base.css        # 全局样式（CSS 变量、深色/浅色主题）
│   │   ├── solo.css        # Solo 页样式（指板、琴弦、品柱、动画）
│   │   └── login.css       # 登录页样式
│   └── js/
│       ├── index.js        # 首页粒子背景
│       ├── login.js        # 登录页逻辑
│       ├── tuning.js       # 调音器逻辑（YIN + 仪表盘 + 自动模式）
│       ├── chord_verifier.js # 前端和弦模板库（204模板，视觉+听觉验证）
│       ├── solo/
│       │   ├── main.js     # GuitarTrainApp — Solo 模式主控
│       │   ├── camera_manager.js  # 摄像头管理（MediaPipe 初始化）
│       │   ├── socket_manager.js  # 前后端 Socket.IO 通信
│       │   ├── fingering_detector.js # 前端镜像检测（后端卡顿时本地执行）
│       │   ├── chord_validator.js   # 视觉+听觉和弦验证融合
│       │   ├── chord_verifier.js    # 前端和弦模板匹配
│       │   ├── constants.js  # 前端常量（需与 config.py 同步）
│       │   ├── filters.js    # 前端 OneEuroFilter
│       │   └── ui_helpers.js # UI 辅助（Toast、弹窗、渲染）
│       └── teach/
│           ├── dashboard.js  # 教学驾驶舱主控
│           └── charts.js     # ECharts 图表（雷达图、进度图）
│
└── models/
    └── best.pt             # YOLO 模型（检测琴枕/琴桥）
```

## 4. 核心数据流

### 4.1 Solo 模式检测流水线

```
浏览器摄像头
    ├─→ MediaPipe Hands → 21点手部关键点
    │       ↓ Socket.IO 'hand_landmarks'
    │   GuitarFingeringRecognizer.process_landmarks()
    │       → 结合 YOLO 指板参数 → 判定按弦/品位
    │       ↓ emit 'detection_result'
    │   前端渲染 Canvas 覆盖层
    │
    └─→ 960px 缩略图帧
            ↓ Socket.IO 'thumbnail'
        GuitarFingeringRecognizer.update_fretboard()
            → YOLO 检测琴枕/琴桥
            ↓ emit 'fretboard_params'
        前端更新指板几何参数
```

### 4.2 和弦验证流程

```
视觉检测 (前端/后端手指位置)
    +
音频检测 (Meyda YIN 音高)
    ↓
chord_validator.js 融合判定
    → 位置正确 + 音高匹配 → 正确
    → 位置正确 + 音高偏差 → 不稳定
    → 位置错误 → 错误
    ↓
Socket.IO 'frame' → 后端处理 → emit 'frame_result'
    → 前端统计 + 保存记录
```

### 4.3 调音器流程

```
麦克风 → Meyda YIN → 频率 → 音分偏差
    → 仪表盘指针 + 趋势图
    → 自动模式: 自动匹配最近弦
    → 音准 < ±8 音分 → 烟花特效
```

## 5. 后端 API 参考

### 5.1 HTTP 路由

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/` | 否 | 首页 |
| GET | `/login` | 否 | 登录页 |
| GET | `/solo` | 是 | Solo 训练 |
| GET | `/tuning` | 是 | 调音器 |
| GET | `/teach` | 是 | 教学驾驶舱 |
| GET | `/history` | 是 | 历史记录 |
| GET | `/api/health` | 否 | 健康检查 |
| GET | `/favicon.ico` | 否 | 返回 204 |

### 5.2 训练记录 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/save_record` | 保存单条训练记录 |
| POST | `/api/solo/save_record` | 保存 Solo 演奏记录 |
| GET | `/api/history/data` | 分页查询历史记录 |
| GET | `/api/history/stats` | 统计数据（正确率/弱项/趋势） |

### 5.3 教学 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/teach/dashboard` | 驾驶舱综合数据 |
| POST | `/api/teach/generate_advice` | 生成 AI 教学建议 |
| GET | `/api/teach/advice/stream` | 流式生成建议 (SSE) |
| POST | `/api/teach/recommend_chords` | 智能和弦推荐 |

### 5.4 和弦 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/chords/list` | 全部和弦列表 |
| GET | `/api/chords/detail/<name>` | 单个和弦详情 |

### 5.5 认证 API (auth_bp)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/send_code` | 发送邮箱验证码 |
| POST | `/register` | 注册 |
| POST | `/login` | 登录 |
| POST | `/logout` | 登出 |
| GET | `/check_auth` | 检查登录状态 |

### 5.6 TTS API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/tts/speak` | 文本转语音 |

### 5.7 Socket.IO 事件

| 事件名 | 方向 | 说明 |
|--------|------|------|
| `hand_landmarks` | 前端→后端 | 21点手部关键点 |
| `thumbnail` | 前端→后端 | 缩略图帧（指板检测） |
| `frame` | 前端→后端 | 完整帧（和弦验证） |
| `detection_result` | 后端→前端 | 指法检测结果 |
| `fretboard_params` | 后端→前端 | 指板几何参数 |
| `frame_result` | 后端→前端 | 和弦验证结果 |
| `connect` | 系统 | WebSocket 连接建立 |

## 6. 配置速查 (config.py)

```python
# 关键阈值
NUM_STRINGS = 6          # 吉他弦数
NUM_FRETS = 12           # 品数
YOLO_CONF = 0.15         # YOLO 置信度
HAND_CONF = 0.12         # 手部检测置信度

# 滤波
FILTER_MODE = 4          # 0:无 1:平滑 3:OneEuro 4:Kalman
KALMAN_Q = 0.08          # 过程噪声
KALMAN_R = 0.5           # 测量噪声

# 横按检测
BARRE_ANGLE_THRESH = 25  # 食指与指板夹角阈值
BARRE_MIN_COVERED = 4    # 最少覆盖弦数

# LLM
LLM_MODEL = 'deepseek-v4-flash'
FALLBACK_MODEL = 'doubao-seed-2-0-mini-260215'

# 前后端同步
THUMBNAIL_WIDTH = 640    # 必须与前端 constants.js 一致
APP_VERSION = '20260429v2'
```

## 7. 前后端同步项

修改以下参数时，**必须前后端同时改**，否则会出现检测偏差：

| 参数 | 后端 (config.py) | 前端 (constants.js) |
|------|------------------|---------------------|
| 缩略图宽度 | `THUMBNAIL_WIDTH` | `THUMBNAIL_WIDTH` |
| 琴弦数 | `NUM_STRINGS` | `STRING_COUNT` |
| 品数 | `NUM_FRETS` | `FRET_COUNT` |
| 按弦阈值 | `PRESS_THRESHOLD_PX` | `PRESS_THRESHOLD` |
| 滤波模式 | `FILTER_MODE` | — (前端有独立 OneEuro) |

## 8. 主题系统

- CSS 变量定义在 `base.css`，通过 `[data-theme="light"]` 和默认（无属性=dark）切换
- 初始化脚本 `<script>` 在每个模板 `<head>` 中**内联执行**（阻塞渲染避免闪烁）
- 默认主题: **白天（浅色）**，用户切换后存入 `localStorage.theme`
- 主题切换按钮仅在首页，其他页面继承 `localStorage` 设置

## 9. 本地开发

```bash
pip install -r requirements.txt

# 确保 MySQL 运行 + 数据库存在
mysql -u root -e "CREATE DATABASE IF NOT EXISTS guitar_db CHARACTER SET utf8mb4"

# 确保模型文件存在
ls models/best.pt          # YOLO 模型（必需）

# 启动
python app.py              # http://0.0.0.0:5000
```

## 10. 部署注意事项

- 生产环境 `config.DEBUG = False`，`SEND_FILE_MAX_AGE_DEFAULT = 3600`
- 更新 `APP_VERSION` 可强制浏览器刷新所有静态资源缓存
- MySQL 连接串在 `config.SQLALCHEMY_DATABASE_URI`
- SMTP 配置在 `config.py`（QQ 邮箱），生产环境应使用环境变量
- LLM API Key 在 `config.py`，生产环境建议使用环境变量
- Socket.IO 配置: `ping_timeout=60, ping_interval=25, max_http_buffer_size=10MB`
