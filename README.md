# guitar-teacher

一个基于 Flask、Socket.IO、计算机视觉和前端交互页面的吉他教学系统原型仓库。

本 README 面向仓库协作者，重点说明：

- 当前真实仓库结构
- 各模块职责
- 如何运行和验证模块
- 除 `python app.py` 之外还能怎么做局部验证
- 多人协作时推荐的 Git 工作方式

## 1. 项目概览

当前仓库包含几类主要能力：

- 用户登录与训练记录管理
- 和弦数据查询
- SOLO 练习页面与实时识别交互
- TEACH 教学驾驶舱（统计、建议、推荐）
- 调音页面
- TTS 语音播报与语音指令交互
- 基于 YOLO / 手部关键点的视觉识别链路

当前真实主入口是：

- `app.py`

需要注意的是，仓库中存在一些历史遗留或未接线模块，README 以**当前真实运行路径**为准，而不是以目录中是否存在文件为准。

## 2. 真实仓库结构

### 2.1 后端入口与配置

- `app.py`
  - Flask 主入口
  - 页面路由
  - Socket.IO 事件处理
  - 历史记录、教学驾驶舱、健康检查、TTS 等主要 API
- `config.py`
  - 模型路径
  - 检测参数
  - 数据库连接
  - LLM/TTS 配置
- `models.py`
  - SQLAlchemy 数据模型

### 2.2 核心能力模块

- `core/detector.py`
  - 视觉识别核心
  - 负责指板检测、弦/品映射、识别结果生成
- `core/filters.py`
  - 平滑与滤波逻辑
- `core/user_stats.py`
  - 训练统计聚合逻辑
- `core/llm_service.py`
  - 教学建议与和弦推荐的大模型封装
- `core/tts_service.py`
  - TTS 合成与缓存逻辑

### 2.3 API 模块

- `api/auth.py`
  - 注册、登录、退出、当前用户状态
- `api/chords.py`
  - 和弦静态数据与查询接口
- `api/solo.py`
- `api/teach.py`
- `api/__init__.py`

其中：

- `api/auth.py` 和 `api/chords.py` 是当前主路径的一部分
- `api/solo.py`、`api/teach.py`、`api/__init__.py` 当前更像历史遗留或未接线结构，不能默认视为真实运行路径

### 2.4 前端页面与静态资源

- `templates/`
  - `index.html`：首页/模式入口
  - `login.html`：登录与注册
  - `solo.html`：SOLO 练习页
  - `teach.html`：教学驾驶舱
  - `tuning.html`：调音页
  - `history.html`：训练历史页
- `static/css/`
  - 页面样式
- `static/js/solo/`
  - SOLO 页面逻辑
- `static/js/teach/`
  - 教学驾驶舱逻辑
- `static/js/login.js`
  - 登录页逻辑
- `static/js/index.js`
  - 首页交互逻辑
- `static/js/tuning.js`
  - 调音页脚本
- `static/js/voice_guide.js`
  - 语音交互相关逻辑

### 2.5 模型与资源

- `models/best.pt`
  - YOLO 模型
- `models/hand_landmarker.task`
  - 手部关键点模型

### 2.6 其他文件

- `benchmark.py`
  - 视觉识别链路的独立验证脚本
- `migrate_to_mysql.py`
  - 数据迁移脚本（当前仅作辅助脚本看待，使用前需检查其与当前配置是否一致）

## 3. 模块功能说明

### 3.1 登录与用户体系

主要文件：

- `api/auth.py`
- `models.py`

主要能力：

- 用户注册
- 用户登录
- 用户退出
- 当前登录状态查询

主要接口：

- `POST /api/register`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/check_login`
- `GET /api/current_user`

### 3.2 和弦数据模块

主要文件：

- `api/chords.py`

主要能力：

- 提供和弦静态数据
- 为 SOLO 页面提供可选和弦与指法信息

主要接口：

- `GET /api/chords/`

### 3.3 SOLO 练习模块

主要文件：

- `templates/solo.html`
- `static/js/solo/main.js`
- `core/detector.py`
- `app.py`

主要能力：

- 摄像头输入
- 指位检测结果展示
- 和弦验证
- 练习记录保存

依赖：

- `/api/chords/`
- Socket.IO 实时事件
- 视觉识别模型

### 3.4 TEACH 教学驾驶舱

主要文件：

- `templates/teach.html`
- `static/js/teach/dashboard.js`
- `static/js/teach/charts.js`
- `core/user_stats.py`
- `core/llm_service.py`
- `app.py`

主要能力：

- 训练统计展示
- 最近训练记录展示
- 智能建议生成
- 和弦推荐生成

主要接口：

- `GET /api/teach/dashboard`
- `POST /api/teach/generate_advice`
- `POST /api/teach/recommend_chords`

### 3.5 历史记录模块

主要文件：

- `templates/history.html`
- `app.py`
- `models.py`
- `core/user_stats.py`

主要能力：

- 查看练习历史
- 查看统计数据
- 结合筛选条件读取记录

主要接口：

- `GET /api/history/data`
- `GET /api/history/stats`

### 3.6 调音模块

主要文件：

- `templates/tuning.html`
- `static/js/tuning.js`

主要能力：

- 浏览器麦克风采集
- 音高检测
- 页面交互反馈

说明：

- 调音页相对更接近“前端可轻量预览”的页面
- 但如果要做正式验证，仍建议通过 Flask 页面路由访问

### 3.7 TTS 与语音交互

主要文件：

- `core/tts_service.py`
- `static/js/voice_guide.js`
- `app.py`

主要能力：

- 文本转语音
- 前端语音指令交互
- 语音播报缓存

运行时特征：

- 会生成 `tts_cache/` 目录和缓存文件

## 4. 运行前准备

### 4.1 Python 与依赖

建议环境：

- Python 3.11.x

安装依赖：

```bash
pip install -r requirements.txt
```

### 4.2 模型文件

启动和视觉识别相关功能依赖以下文件：

- `models/best.pt`
- `models/hand_landmarker.task`

如果模型文件不存在，`app.py` 启动时会失败。

### 4.3 数据库与配置

当前项目依赖数据库配置，且配置集中在：

- `config.py`

协作者需要注意：

- 当前配置文件中包含本地化/开发态配置
- 不要默认把 `config.py` 里的配置当作通用部署方案
- 后续建议逐步迁移到环境变量或本地私有配置文件

## 5. 完整启动方式

完整启动命令：

```bash
python app.py
```

启动后可访问：

- `/`
- `/login`
- `/tuning`
- `/solo`
- `/teach`
- `/history`

健康检查接口：

```text
GET /api/health
```

例如：

```bash
curl http://127.0.0.1:5000/api/health
```

## 6. 除 `python app.py` 外的模块验证方式

这个仓库除完整入口外，可单独验证的模块并不多，但仍有几种实用方式。

### 6.1 视觉链路独立验证：`benchmark.py`

命令：

```bash
python benchmark.py
```

用途：

- 验证视觉识别/指板检测链路
- 对不同图像尺寸进行测试

前置条件：

- 安装好依赖
- 模型文件存在
- 当前目录下有测试图片（脚本默认使用 `test_guitar.jpg`）

### 6.2 和弦数据轻量验证

命令示例：

```bash
python -c "from api.chords import chords_data; print(len(chords_data))"
```

用途：

- 验证和弦静态数据能否被正常加载

适合场景：

- 不想启动完整 Flask 服务，只想确认数据模块结构是否正常

### 6.3 视觉识别类轻量验证

命令示例：

```bash
python -c "from core.detector import GuitarFingeringRecognizer; r=GuitarFingeringRecognizer(); print('ok')"
```

用途：

- 验证识别核心是否能完成实例化

前置条件：

- 模型文件存在
- YOLO/相关依赖正常安装

### 6.4 TTS 模块轻量验证

命令示例：

```bash
python -c "from core.tts_service import VolcTTS; t=VolcTTS(); audio=t.synthesize('你好，吉他'); print(len(audio) if audio else 0)"
```

用途：

- 验证 TTS 模块是否能够完成一次合成调用

注意：

- 运行时可能写入 `tts_cache/`
- `tts_cache/` 属于运行缓存，不应提交

### 6.5 页面级轻量预览建议

页面的可独立预览程度并不一致：

- `tuning`：最接近可轻量预览的页面
- `solo`：强依赖后端接口、模型和 Socket.IO
- `teach`：强依赖后端接口和统计数据
- `history`：强依赖数据库与后端接口

因此：

- 如果只是做前端 UI 优化，可优先从 `tuning` 页面或纯样式层改动入手
- 如果要验收完整功能，仍建议走 Flask 路由和真实接口

### 6.6 只预览前端界面的本地方式

如果你的目标只是**在浏览器里查看前端界面修改效果**，而不追求功能可用，那么可以不运行整个项目。

推荐两种方式：

#### 方式 A：直接用本地静态服务器预览

在仓库根目录执行：

```bash
python -m http.server 8000
```

然后在浏览器中按文件路径打开页面，例如：

- `templates/index.html`
- `templates/solo.html`
- `templates/teach.html`
- `templates/tuning.html`
- `templates/history.html`

更实用的方式是：

1. 先启动静态服务器
2. 再在浏览器中访问本地静态文件地址，例如：

```text
http://127.0.0.1:8000/templates/index.html
http://127.0.0.1:8000/templates/solo.html
http://127.0.0.1:8000/templates/teach.html
http://127.0.0.1:8000/templates/tuning.html
http://127.0.0.1:8000/templates/history.html
```

适用场景：

- 看布局
- 看配色
- 看字体、间距、圆角、阴影
- 看响应式变化
- 看纯前端动效

限制：

- 页面里依赖 `/api/...`、登录态、数据库、Socket.IO 的功能大概率不可用
- 更适合纯 UI 预览，不适合功能验收

#### 方式 B：直接双击 HTML 文件或拖入浏览器

如果只想快速看页面外观，也可以直接打开：

- `templates/index.html`
- `templates/solo.html`
- `templates/teach.html`
- `templates/tuning.html`
- `templates/history.html`

这种方式最轻量，但相对更容易遇到：

- 本地资源路径问题
- 浏览器安全策略导致的脚本限制

因此更推荐优先用 `python -m http.server 8000`。

#### 前端预览时的实际建议

- 优先查看：`index.html`、`tuning.html`
- `solo.html`、`teach.html`、`history.html` 可先看静态布局，不要把接口报错当成 UI 修改失败
- 如果某个页面强依赖接口，建议在前端临时使用 mock 数据或占位块来观察视觉效果

## 7. 当前已知结构注意事项

协作者在阅读代码时，请特别注意以下事实：

- `api/__init__.py` 中定义了 `api_bp`，但当前未接入主应用
- `api/solo.py`、`api/teach.py` 不能默认视为真实运行路径
- 当前真实主路径应以 `app.py` 中实际注册和实际路由为准
- 仓库中存在一些历史备份和运行残留，详见 `project_issue.md`

## 8. 推荐的多人协作 Git 工作方式

### 8.1 分支策略

推荐：

- 不直接在 `main` 上开发
- 功能开发、文档整理、修复都使用独立分支

分支命名建议：

- `feat/<topic>`
- `fix/<topic>`
- `docs/<topic>`
- `refactor/<topic>`

### 8.2 提交流程

推荐流程：

1. 从最新基线分支拉出工作分支
2. 小步提交，保持每次提交目标单一
3. 提交前做最小验证
4. 通过 PR 合并，而不是直接把大量改动一次性推到公共分支

### 8.3 文档与配置类改动也走 PR

以下改动也建议走单独 PR：

- `README.md`
- `.gitignore`
- `project_issue.md`
- 部署与配置相关文件

原因：

- 这类文件对所有协作者都有影响
- 很容易引发误解、冲突或后续返工

### 8.4 避免提交本地噪音

请不要提交以下内容：

- `.claude/`
- `tts_cache/`
- `nohup.out`
- 各类本地备份文件
- 编辑器私有配置

### 8.5 高冲突文件谨慎修改

以下文件改动影响面较大，协作时建议提前沟通：

- `app.py`
- `config.py`
- `models.py`
- `core/detector.py`

### 8.6 关于 `.gitignore` 的一个重要说明

`.gitignore` 只对**未跟踪文件**生效。

如果某个缓存、日志、备份文件已经被提交到版本库，那么后续即使把它加入 `.gitignore`，Git 仍会继续跟踪它。此时需要额外通过 Git 索引移除后，才能真正停止跟踪。

## 9. 相关补充文档

- `project_issue.md`
  - 记录当前仓库结构问题、疑似多余文件、未接线模块和配置风险
