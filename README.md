📁 项目结构（已忽略 __pycache__）
text
guitar-teacher/                # 项目根目录
├── .gitignore                  # Git 忽略规则（Python 模板）
├── README.md                   # 项目说明（可后续完善）
├── requirements.txt            # Python 依赖列表
├── app.py                      # Flask 主应用入口
├── config.py                   # 配置文件（YOLO 路径、阈值等）
│
├── core/                       # 核心逻辑模块
│   ├── __init__.py
│   ├── detector.py             # 吉他指法识别器（调用 YOLO/MediaPipe）
│   ├── filters.py              # 后端 OneEuroFilter 滤波
│   └── state.py / volc_ark.py  # 其他状态/工具模块（若有）
│
├── api/                        # 和弦接口模块
│   ├── __init__.py
│   ├── chords.py               # 和弦数据库与验证
│   ├── solo.py                 # SOLO 模式相关接口
│   └── teach.py                # 教学逻辑接口
│
├── models/                     # 模型文件
│   ├── best.pt                 # YOLO 模型（琴枕/琴桥检测）
│   └── hand_landmarker.task    # MediaPipe 手部模型
│
├── static/                      # 前端静态资源
│   ├── css/
│   │   ├── style.css           # 首页样式
│   │   ├── solo.css            # SOLO 模式样式
│   │   └── tuning.css          # 调音器样式（已优化）
│   └── js/
│       ├── index.js            # 首页粒子动画
│       ├── tuning.js           # 调音器主逻辑
│       ├── voice_guide.js      # 语音指导模块
│       └── solo/                # SOLO 模式 JS
│           ├── constants.js
│           ├── filters.js
│           ├── ui_helpers.js
│           ├── chord_validator.js
│           └── main.js
│
├── templates/                   # HTML 模板
│   ├── index.html               # 首页
│   ├── solo.html                # SOLO 模式页面
│   ├── tuning.html              # 调音器页面（最新优化版）
│   └── teach.html               # 教学页面（若有）
│
└── try/                          # 测试/实验代码（可选）
    ├── aduio.py                  # 音频测试
    └── qiandaun.html             # 前端测试页面# guitar-teacher
基于计算机视觉和听觉的吉他教学系统
