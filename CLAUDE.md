# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

智能吉他和弦教学系统 — 通过摄像头+麦克风实时检测吉他指法并给出教学反馈。组合了 YOLO（后端检测琴枕/琴桥）、MediaPipe（前端手部关键点）、音高检测（YIN 算法）和 LLM（火山方舟豆包模型）生成教学建议。

## 常用命令

```bash
pip install -r requirements.txt    # 安装依赖
python app.py                      # 启动开发服务器 (0.0.0.0:5000)
```

- MySQL 数据库必须运行，连接字符串在 `config.py` 的 `SQLALCHEMY_DATABASE_URI`
- 启动时会检查 `models/best_n.pt` 和 `models/hand_landmarker.task` 是否存在，缺失则退出
- PyTorch 可选 — 仅在需要 YOLO GPU 推理时安装（`requirements.txt` 中有注释说明）

## 架构

### 核心检测流水线

```
前端摄像头 → MediaPipe 手部关键点 (前端JS, 21点/手)
           → 缩略图帧 (960px宽)
                 ↓ Socket.IO
后端  GuitarFingeringRecognizer:
      - YOLO 检测琴枕/琴桥位置 (best_n.pt)
      - 结合手部关键点 + 指板几何 → 判断按弦/品位
      → 返回 detection_result + drawing_data (Canvas覆盖层)
```

- **前端镜像检测**: `static/js/solo/fingering_detector.js` 在后端卡顿时可本地执行相同检测逻辑
- **和弦评估**: `chord_validator.js` 融合视觉（手部位置）+ 听觉（音高检测）判定正确性
- **OneEuroFilter**: 前后端各实现一份 (`core/filters.py` + `static/js/solo/filters.js`)，用于平滑手部坐标

### 后端模块

| 模块 | 职责 |
|------|------|
| `app.py` | Flask 入口 + Socket.IO 事件处理（`hand_landmarks`, `thumbnail`, `frame`, `voice_command` 等） |
| `config.py` | 所有可调参数 — 模型路径、检测阈值、滤波参数、LLM/TTS 配置、DB 连接 |
| `models.py` | SQLAlchemy 模型: `User`(认证) + `TrainingRecord`(训练记录) |
| `core/detector.py` | `GuitarFingeringRecognizer` — YOLO + 指板几何 + 指法判定 |
| `core/llm_service.py` | 火山方舟 LLM 集成（对话管理、教学建议生成） |
| `core/tts_service.py` | Edge TTS 语音合成（磁盘缓存） |
| `core/user_stats.py` | 用户统计数据聚合 |
| `api/auth.py` | 注册/登录/登出 (Flask-Login) |
| `api/chords.py` | 和弦数据库 (70+ 和弦，难度 1-3 级) |
| `api/teach.py` | 教学面板 API + AI 回复接口 |

### 前端

- 纯原生 JS，无框架。模块按页面划分：首页、Solo 训练、调音器、教学面板
- Solo 模式是最复杂的单页应用，`static/js/solo/main.js` 中的 `GuitarTrainApp` 类负责编排整个流程
- `voice_guide.js`: 语音助手，唤醒词 "小吉他"，通过 Socket.IO 分发语音指令

### 调参要点

- 前端和后端的检测阈值需保持一致。前端参数在 `static/js/solo/constants.js` 和 `fingering_detector.js`，后端在 `config.py`
- 缩略图宽度 `THUMBNAIL_WIDTH = 960` 前后端必须同步
- `FORCE_NUT_LEFT` 控制琴枕方向（镜像问题），按需切换
- `models/best_n.pt` 是训练产物用于 YOLO 检测，`best.onnx` 是 ONNX 导出（当前未使用）
