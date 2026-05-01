# 智能吉他和弦教学系统 — 技术细节实现

## 1. YOLO 指板检测与几何建模

### 1.1 检测流程

`core/detector.py` — `GuitarFingeringRecognizer.update_fretboard()`

```
输入: 960px 缩略图
  ↓ YOLO 推理 (cls=0 琴枕, cls=1 琴桥, conf≥0.15, verbose=False)
  ↓ 限频 300ms（避免重复推理）
输出: 琴枕/琴桥中心坐标 + 检测框
```

```python
# 限频：300ms 内跳过
now = time.time()
if self.last_nut_center is not None and now - self._last_yolo_time < 0.3:
    return True  # 命中缓存

# 双重检查锁避免线程竞争
with self.fretboard_lock:
    if self.last_nut_center is not None and now - self._last_yolo_time < 0.3:
        return True  # "二次检查，避免锁等待期间其他线程已更新"
```

### 1.2 品丝位置公式（12-TET 十二平均律）

```python
@staticmethod
def _get_fret_position_ratio(n):
    return 1.0 - (2.0 ** (-n / 12.0))
```

每品到琴桥的距离比例 = 1 − 2^(−n/12)。品 1 约 5.6%，品 12 恰好 50%。

### 1.3 指板几何重建

```
琴枕中心 Nut = (cx_nut, cy_nut)
琴桥中心 Bridge = (cx_bridge, cy_bridge)

方向向量:   V = Bridge - Nut
单位化:     v_unit = V / |V|
弦长:       v_len = |V|
垂直向量:   perp_unit = (-V.y, V.x) / |V|

品丝线:     对于 n = 1..12
  ratio = 1 - 2^(-n/12)
  fret_center = Nut + V * ratio
  fret_p1 = fret_center + perp_unit * (nut_h * 0.425)
  fret_p2 = fret_center - perp_unit * (nut_h * 0.425)

琴弦线:     对于 i = 0..5
  t = i / 5  (在 Nut_top→Nut_bottom 和 Bridge 上均匀分布)
  string_nut = lerp(nut_top, nut_bottom, t)  (向内收缩 10%)
  string_bridge = lerp(bridge_top, bridge_bottom, t)
```

**弦号映射**: 按琴弦中点 Y 坐标降序排列，确保 Y 最大的弦（图像最上方）映射为 1 弦，Y 最小的映射为 6 弦。

```python
mid_y = [(p_nut[1] + p_bridge[1])/2 for _, p_nut, p_bridge in self.string_lines]
sorted_indices = np.argsort(mid_y)[::-1]  # 降序
# sorted_indices 第 0 个 = 弦号 1，第 5 个 = 弦号 6
```

---

## 2. 指法识别算法

### 2.1 输入数据

```
前端 → Socket.IO hand_landmarks → 后端
  landmarks: [[x,y]*21]  # 归一化坐标 0~1
  timestamp: 毫秒
  img_width, img_height: 原始尺寸
```

### 2.2 坐标转换

```python
landmarks_px = [(int(x*w), int(y*h)) for x,y in landmarks]
thumb_w, thumb_h = THUMBNAIL_WIDTH, THUMBNAIL_WIDTH * h / w
scale = thumb_w / w
landmarks_thumb = [(x*scale, y*scale) for x,y in landmarks_px]
```

### 2.3 横按检测

```
输入: 食指 4 个点 [5,6,7,8]（指根到指尖）
  1. cv2.fitLine() 拟合食指直线
  2. 计算直线与指板垂直方向 perp_unit 的夹角 = arccos(|dot|) * 180/π
  3. 夹角 ≤ 25° → 候选横按
  4. 投影：所有弦中点在食指直线上的投影
  5. 覆盖弦数 ≥ 4 → 确认横按
  6. 最长连续覆盖段 = 横按范围
  7. 食指指尖(8)对应品位 = 横按品位
```

```python
# 核心判断
cos_angle = abs(np.dot(line_dir, self.global_perp_unit))
angle_deg = np.degrees(np.arccos(np.clip(cos_angle, 0, 1)))
if angle_deg <= 25:  # BARRE_ANGLE_THRESH
    # 投影弦 → 计算覆盖范围
```

### 2.4 手指按弦判定

```
对每根手指 (食指/中指/无名指/小指):
  [食指已横按则跳过]

  1. 小指预检：计算 P18→P19 和 P19→P20 的弯曲角
     夹角 < 30° → 判定小指未按弦，跳过

  2. 距离品丝: min(dist(finger_tip, fret_p1→fret_p2))
     距离 > 阈值(25px) → 未按弦

  3. 距离琴弦: min(dist(finger_tip, string_nut→string_bridge))
     找最近弦号，通过 string_no_map 修正

  4. 品位判定: _get_fret_from_point(tip_pt)
     w = tip - nut_center
     t = dot(w, v_unit) / v_len  (0~1，指板方向投影比例)
     idx = searchsorted(fret_ratios, t)
     final_fret = mode(fret_history[:5])  # 历史平滑
```

### 2.5 向量化距离计算

```python
@staticmethod
def _point_to_line_distance_vectorized(pt, line_p1s, line_p2s):
    line_vec = line_p2s - line_p1s           # (N, 2)
    pt_vec = pt - line_p1s
    cross = np.abs(np.cross(line_vec, pt_vec))
    dist = cross / np.linalg.norm(line_vec, axis=1)
    return dist  # (N,) 一次计算所有品丝/琴弦的距离
```

---

## 3. 滤波系统

### 3.1 1D 恒速卡尔曼滤波

`core/filters.py` — `KalmanFilter`

```
状态向量: [position, velocity]
预测:
  x_pred = F @ x      (F = [[1,dt],[0,1]])
  P_pred = F @ P @ F^T + Q
更新:
  y = z - x_pred[0]   (创新)
  S = P_pred[0,0] + R
  K[0] = P_pred[0,0] / S
  K[1] = P_pred[1,0] / S
  x = x_pred + K * y
```

```python
# Q 矩阵: dt^4/4, dt^3/2; dt^3/2, dt^2 — 源自恒速模型
dt2, dt3, dt4 = dt*dt, dt*dt*dt, dt*dt*dt*dt
Q = q * [[dt4/4, dt3/2], [dt3/2, dt2]]
```

### 3.2 OneEuro 滤波器

```
α(cutoff, dt) = 1 / (1 + τ/dt), τ = 1/(2π·cutoff)
dx = (x - x_prev) / dt
dx_smooth = α(dcutoff, dt) * dx + (1-α) * dx_prev
cutoff = min_cutoff + β * |dx_smooth|
filtered = α(cutoff, dt) * x + (1-α) * x_prev
```

- `min_cutoff = 0.7`：静止时的截止频率
- `β = 0.005`：速度响应系数（越大越跟手）
- `dcutoff = 1.0`：导数滤波截止频率

---

## 4. YIN 音高检测

`static/js/tuning.js` — `YINTuner`

### 4.1 算法步骤

```
Step 1: 差分函数
  d(τ) = Σ (x[j] - x[j+τ])²     τ = lag

Step 2: 累积均值归一化差值
  d'(τ) = d(τ) / ((1/τ) * Σ d(j))       τ > 0
  d'(0) = 1

Step 3: 找第一个 d'(τ) < 0.15 的 τ
  向下搜索局部最小值

Step 4: 抛物线插值（亚采样精度）
  τ* = τ + 0.5 * (y1 - y2) / (y1 - 2y0 + y2)

Step 5: 频率
  f = sampleRate / τ*
  f ∈ [70, 440] Hz (吉他音域)
```

### 4.2 偏差计算

```
cents = 1200 * log2(freq / targetFreq)
       = 1200 * log(freq/target) / log(2)

|cents| ≤ 8  → 音准
cents > 8  → 偏高，逆时针调
cents < -8 → 偏低，顺时针调
```

---

## 5. 和弦验证系统

### 5.1 视觉验证

`chord_validator.js` — `validateVisual()`

```
输入: detectedPositions[{string,fret}], detectedBarre{fret,start,end}, targetChord

横按和弦: 检查 barre 的 fret/startString/endString 完全匹配
非横按和弦: 检查所有 target.positions 是否 ⊆ detectedPositions
```

### 5.2 音频验证

`chord_verifier.js` — `ChordVerifier`

```
Meyda chroma 特征提取 → 12 维半音向量
  ↓ 根音权重 ×1.2, 低频弦权重 ×1.05
  ↓ 与 204 个和弦模板做 cosine similarity
  ↓ similarity > 0.55 → 匹配

触发机制: energy ratio > 1.5 (attack detection)
采集窗口: 1.0s (holdDuration)
```

### 5.3 融合判定

```javascript
function evaluateChord(visualOk, audioResult, options = { threshold: 0.55 }) {
    if (!visualOk) return 'wrong';        // 视觉错误 → 直接错误
    if (!audioResult) return 'unstable';  // 视觉对但无音频 → 不稳定
    if (audioResult.confidence >= 0.55) return 'correct';
    return 'unstable';
}
```

---

## 6. LLM 服务架构

### 6.1 双通道设计

```
主力: DeepSeek V4 Flash (deepseek-v4-flash)
  endpoint: https://api.deepseek.com/v1/chat/completions
备用: 火山方舟豆包 (doubao-seed-2-0-mini-260215)
  endpoint: https://ark.cn-beijing.volces.com/api/v3/chat/completions
```

### 6.2 内存缓存

```python
class SimpleCache:
    """OrderedDict LRU + MD5 key + TTL"""
    def _make_key(self, prompt, system_prompt, temperature, max_tokens):
        key_str = f"{prompt}|{system_prompt}|{temperature}|{max_tokens}"
        return hashlib.md5(key_str.encode()).hexdigest()
    # max_size=100, ttl=3600s
```

### 6.3 流式生成 (SSE)

```
前端 → GET /api/teach/advice/stream
后端 → 后台线程调用 LLM stream → queue.Queue
主线程 → while queue.get(timeout=10) → yield SSE events
  格式: data: {"content": "..."}\n\n
  心跳: : heartbeat\n\n (10s 无数据时)
```

### 6.4 教学建议 Prompt 构建

```
练习{N}次 | 均准{X}% | 趋势{上升/下降/平稳} | 不稳{Y}%
快速模式{Z}% | 最佳:C{G}% G{H}% | 薄弱:Am{I}% F{J}%
近期: date1(r1%) → date2(r2%) → ...
[如均准≥80%] 已掌握和弦:C,G,Am → 推荐歌曲
```

System prompt 要求输出 5 段结构：整体评估 → 优势分析 → 薄弱点 → 练习建议 → 歌曲推荐。

---

## 7. TTS 语音合成

`core/tts_service.py` — `VolcTTS`

### 7.1 架构

```
Edge TTS (Microsoft)
  ↓ SSML 控制语速/音量
  ↓ 磁盘缓存 (MD5 key, ttl_cache/)
  ↓ 备用音色链: Xiaoxiao → Yunxi → Xiaobei
  ↓ 重试 2 次
```

### 7.2 SSML 构建

```xml
<speak version="1.0" xmlns="..." xml:lang="zh-CN">
  <prosody rate="90%" volume="100%">{text}</prosody>
</speak>
```

语速/音量偏离 1.0 超过 1% 时启用 SSML 模式。

### 7.3 异步执行修复

```python
# asyncio.run() 在主线程嵌套时会 RuntimeError
# 修复: 降级到 ThreadPoolExecutor 执行
except RuntimeError:
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(asyncio.run, _async_synth())
        return future.result(timeout=30)
```

---

## 8. 前端镜像检测

`static/js/solo/fingering_detector.js` — `FingeringDetector`

后端卡顿时的本地检测方案，完全镜像 `detector.py` 逻辑：

```javascript
setParams(params) {
    // 预计算：弦向量 {nut, bridge, dx, dy, len}
    // 品丝段 {fret, p1, p2}
    this.vUnit = params.v_unit;
    this.perpUnit = params.perp_unit;
    this.vLen = params.v_len;
}

detect(landmarks) {
    // 1. 横按检测: 食指直线 + 角度判断 + 弦投影
    // 2. 手指遍历: 距离品丝 → 距离琴弦 → 品位判定
    // 3. 历史平滑: 众数滤波
    // 与后端完全一致的算法
}
```

---

## 9. 主题系统

```
CSS变量体系 (base.css):
  默认（无 data-theme）    → 深色主题
  [data-theme="light"]     → 浅色主题

初始化（在 <head> 中内联执行，阻塞渲染防闪烁）:
  var t = localStorage.getItem('theme');
  if (!t || t !== 'dark')
    document.documentElement.setAttribute('data-theme', 'light');

所有组件通过 var(--xxx) 引用主题色，无需 JS 参与。
```

---

## 10. Socket.IO 通信协议

### 10.1 配置

```python
SocketIO(
    cors_allowed_origins="*",
    async_mode=None,          # 自动选择
    max_http_buffer_size=10MB, # 支持大帧
    ping_timeout=60,
    ping_interval=25,
    allow_upgrades=True
)
```

### 10.2 事件时序

```
Solo 训练帧时序:
  前端 → thumbnail (200ms 间隔) → 后端 → fretboard_params
  前端 → hand_landmarks (33ms 节流) → 后端 → detection_result
  前端 → frame (200ms 间隔, 训练模式) → 后端 → detection_result

限频保护:
  - 后端缩略图: 300ms
  - 后端 frame: frame_busy 锁（单线程处理）
  - 前端 landmark: 33ms 节流
```

### 10.3 帧处理线程模型

```python
executor = ThreadPoolExecutor(max_workers=1)
_frame_busy = {'value': False}  # 引用传递，避免多线程同步问题

def handle_frame(data, callback=None):
    with _frame_lock:
        if _frame_busy['value']: return callback('busy')
        _frame_busy['value'] = True
    executor.submit(process_and_emit, ...)
```

---

## 11. 智能和弦推荐算法

`core/recommendation.py`

```
策略分 4 层，每层随机采样保证多样性:

层1: 薄弱和弦 (正确率 < 60%) → 选 1~2 个
层2: 未练习和弦 → 选 1~2 个
层3: 根据综合正确率选难度池:
      正确率 < 50% → 只推荐基础和弦
      正确率 ≥ 50% → 推荐进阶/高级和弦
层4: 随机补全至 5 个

每个推荐附带理由字符串，例如:
  "你在F上正确率偏低，加强练习能有效提升"
  "C是基础开放和弦，适合新手入门"
```

---

## 12. 数据库模型

```sql
-- User 表
CREATE TABLE user (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(120) UNIQUE NOT NULL,
    password_hash VARCHAR(128) NOT NULL,
    nickname VARCHAR(64),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- TrainingRecord 表
CREATE TABLE training_record (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    chord_name VARCHAR(50) NOT NULL,
    correct BOOLEAN NOT NULL,
    time_spent FLOAT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER NOT NULL REFERENCES user(id),
    is_unstable BOOLEAN DEFAULT FALSE,
    similarity FLOAT,
    mode VARCHAR(20),           -- 'normal' | 'quick'
    INDEX idx_created_at (created_at),
    INDEX idx_chord_correct (chord_name, correct),
    INDEX idx_user_id (user_id)
);
```
