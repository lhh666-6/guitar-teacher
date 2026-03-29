# audio 模块说明

## 1. 模块目标
`audio/` 目录用于实现吉他听觉和弦识别核心能力（Python 3.11.15）。
当前阶段目标：
- 优先支持扫弦场景下的实时和弦识别。
- 首版和弦集合：`C, G, Am, F, Dm, Em, E, A, D, A7, E7, C7`。
- 最终形态：支持实时流式输入、低延迟、连续稳定输出。

## 2. 当前阶段（Phase 0）完成内容
- 完成参数骨架设计，统一放在 `config.py` 的 `Audio Chord Recognition` 分组。
- 确认后续实现边界：
  - 允许修改：`audio/*`、`config.py`。
  - 不修改：其他所有现有模块文件。

## 2.1 当前阶段（Phase 1）完成内容
- 已实现麦克风实时输入链路（`sounddevice`）。
- 已实现环形缓冲与滑窗分帧。
- 已提供 Phase 1 验证脚本：`audio/phase1_mic_check.py`。

## 2.2 当前阶段（Phase 2）完成内容
- 已实现预处理模块：带通、预加重、峰值归一化（`audio/preprocess.py`）。
- 已实现 `librosa + chroma` 特征提取（`audio/features.py`）。
- 已提供 Phase 2 实时特征验证脚本：`audio/phase2_feature_check.py`。

## 2.3 当前阶段（Phase 3）完成内容
- 已实现 12 个常用和弦模板构建（`audio/chord_templates.py`）。
- 已实现模板匹配分类器（`audio/classifier.py`）：输出 `label/confidence/margin/top_k`。
- 已实现时间平滑器（`audio/smoother.py`）：多数投票 + 迟滞切换，抑制抖动。
- 已提供 Phase 3 实时识别验证脚本：`audio/phase3_chord_check.py`。

## 3. 技术路线
核心思路：`librosa + chroma`。
- 输入：麦克风实时音频流（计划使用 `sounddevice`）。
- 预处理：RMS噪声门、可选预加重、可选HPSS、可选频带约束。
- 特征：`chroma_stft`（首选实时）或 `chroma_cqt`（可选高精度）。
- 判定：与和弦模板相似度匹配，输出 `label + confidence`。
- 稳定：多数投票/迟滞切换，减少扫弦抖动。

## 4. 使用前提醒
每次运行或测试前先激活 conda 环境：

```bash
conda activate guitar
```

如需补齐 Phase 1 依赖（由你手动执行）：

```bash
pip install sounddevice==0.5.5
```

说明：你的 `requirements_LJL.txt` 已包含 `sounddevice==0.5.5`，该版本可优先保持一致以降低环境漂移风险。

如需补齐 Phase 2 依赖（由你手动执行）：

```bash
pip install librosa==0.10.2.post1
```

## 5. 参数说明（以 config.py 为准）
以下参数均可直接在 `config.py` 调整，不需要改算法代码。

### 5.1 输入与流式处理
- `AUDIO_CHORD_ENABLED`：听觉识别总开关。
- `AUDIO_INPUT_DEVICE_INDEX`：麦克风设备索引；`None` 表示系统默认设备。
- `AUDIO_SAMPLE_RATE`：采样率（Hz）。
- `AUDIO_CHUNK_SIZE`：单次采样点数，影响实时性和CPU占用。
- `AUDIO_WINDOW_SECONDS`：单次判定使用的滑窗时长（秒）。
- `AUDIO_HOP_SECONDS`：滑窗移动步长（秒），影响输出刷新率。

### 5.2 预处理与抗噪
- `AUDIO_RMS_GATE`：RMS噪声门，过滤静音与背景低能量噪声。
- `AUDIO_USE_PREEMPHASIS`：是否启用预加重。
- `AUDIO_PREEMPHASIS_COEF`：预加重系数。
- `AUDIO_USE_HPSS`：是否启用谐波-打击乐分离。
- `AUDIO_BANDPASS_LOW_HZ`：带通下限（Hz）。
- `AUDIO_BANDPASS_HIGH_HZ`：带通上限（Hz）。

### 5.3 特征提取
- `AUDIO_CHROMA_TYPE`：`stft` 或 `cqt`。
- `AUDIO_N_FFT`：FFT窗长。
- `AUDIO_HOP_LENGTH`：帧移。
- `AUDIO_CHROMA_BINS`：chroma维度（通常固定12）。
- `AUDIO_CHROMA_AGGREGATE`：时序聚合方式（`median` 或 `mean`）。
- `AUDIO_FEATURE_QUALITY_GATE`：特征分离度门限（top1-top2）。

### 5.4 分类与输出
- `AUDIO_CHORD_LABELS`：首版可识别和弦标签集合。
- `AUDIO_CONFIDENCE_THRESHOLD`：最低置信度阈值。
- `AUDIO_MARGIN_THRESHOLD`：Top1和Top2分差阈值。
- `AUDIO_UNKNOWN_LABEL`：不确定结果输出标签。
- `AUDIO_TEMPLATE_ROOT_WEIGHT`：模板中根音权重。
- `AUDIO_TEMPLATE_THIRD_WEIGHT`：模板中三音权重。
- `AUDIO_TEMPLATE_FIFTH_WEIGHT`：模板中五音权重。
- `AUDIO_TEMPLATE_SEVENTH_WEIGHT`：模板中七音权重（7和弦用）。
- `AUDIO_CLASSIFIER_TOP_K`：输出/打印的候选和弦数量。

### 5.5 稳定器
- `AUDIO_SMOOTH_WINDOW`：多数投票窗口帧数。
- `AUDIO_SMOOTH_MIN_VOTES`：窗口内最少票数门限。
- `AUDIO_SWITCH_HYSTERESIS`：和弦切换迟滞阈值。
- `AUDIO_MIN_OUTPUT_INTERVAL`：最小输出间隔（秒）。

### 5.6 调试
- `AUDIO_DEBUG_LOG`：是否打印调试日志。
- `AUDIO_PRINT_TOP_K`：输出Top-K候选数量。

## 6. 下一阶段计划（待你确认后执行）
Phase 1 已实现：
- 麦克风实时输入。
- 环形缓冲与滑窗分帧。
- 基础 RMS 门限验证脚本。

### 6.1 Phase 1 运行方式
列出可用输入设备：

```bash
python -m audio.phase1_mic_check --list-devices
```

进行 20 秒验证（默认）：

```bash
python -m audio.phase1_mic_check --seconds 20
```

### 6.2 Phase 1 验证方法
- 终端会持续打印 `RMS`、`peak`、`valid_ratio`、`fps`。
- 静音场景下：`valid_ratio` 应较低。
- 扫弦/拨弦场景下：`RMS` 与 `valid_ratio` 应明显上升。
- 若没有采到数据：先检查 `AUDIO_INPUT_DEVICE_INDEX` 与麦克风权限。

## 7. 下一阶段（Phase 2）预告
Phase 2 已实现特征提取（`librosa + chroma`）与抗噪预处理。

### 7.1 Phase 2 运行方式

```bash
python -m audio.phase2_feature_check --seconds 20
```

### 7.2 Phase 2 验证方法
- 终端会输出 `quality` 和 `top`（Top3 音级分量）。
- 静音时：有效窗口应较少，`feature_windows` 增速慢。
- 扫弦时：有效窗口明显增加，`top` 会稳定集中在若干音级。

如环境缺少依赖，请手动执行：

```bash
pip install librosa==0.10.2.post1
```

## 8. 下一阶段（Phase 3）预告
Phase 3 已进入 12 个常用和弦模板匹配与置信度输出（不做前后端集成）。

### 8.1 Phase 3 运行方式

```bash
python -m audio.phase3_chord_check --seconds 20
```

### 8.2 Phase 3 验证方法
- 连续扫同一和弦（如 G）：观察 `stable` 是否明显比 `raw` 更稳定。
- `raw` 与 `stable` 字段说明：
  - `raw`：当前窗口直接分类结果。
  - `stable`：经过平滑器后的稳定输出。
- 若 `stable` 仍跳变较大：优先调整
  - `AUDIO_SMOOTH_WINDOW`
  - `AUDIO_SMOOTH_MIN_VOTES`
  - `AUDIO_SWITCH_HYSTERESIS`
  - `AUDIO_CONFIDENCE_THRESHOLD` / `AUDIO_MARGIN_THRESHOLD`
