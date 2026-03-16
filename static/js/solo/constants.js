// ========== constants.js ==========
// 所有可调参数和常量集中在此，方便调优

// -------------------- 网络传输参数 --------------------
// 降级模式帧间隔（毫秒），5fps = 200ms
const FRAME_INTERVAL = 200;

// 缩略图发送间隔（毫秒），5fps = 200ms
const THUMBNAIL_INTERVAL = 200;

// 缩略图宽度（像素），高度按比例自动计算
// 提高此值可增加后端 YOLO 精度，但会增加网络流量
// 必须与后端 config.py 中的 THUMBNAIL_WIDTH 一致
const THUMBNAIL_WIDTH = 960;

// JPEG 压缩质量（0.0 ~ 1.0），0.9 视觉无损
const THUMBNAIL_QUALITY = 0.9;

// -------------------- 手部关键点滤波参数 --------------------
// OneEuroFilter 最小截止频率，越小越平滑（建议范围 0.5 ~ 3.0）
const FILTER_MIN_CUTOFF = 2.0;

// 速度系数，越大对快速运动响应越快，但可能引入抖动（建议范围 0.01 ~ 0.1）
const FILTER_BETA = 0.1;

// 导数截止频率，通常无需修改
const FILTER_DCUTOFF = 1.0;

// 关键点发送节流间隔（毫秒），33ms ≈ 30fps
const LANDMARK_SEND_INTERVAL = 33;

// -------------------- 指板绘制参数 --------------------
const STRING_COUNT = 6;
const FRET_COUNT = 5;
const DOT_RADIUS = 12;

// -------------------- 记录相关 --------------------
const MAX_RECORDS = 100;

// -------------------- 和弦库数据（备用，当后端加载失败时使用）--------------------
const DEFAULT_CHORDS = [
    { name: 'C', desc: '大三和弦 (明亮)', positions: [{string:2, fret:1}, {string:4, fret:2}, {string:5, fret:3}, {string:6, fret:3}], barre: null },
    { name: 'Dm', desc: '小三和弦 (柔和)', positions: [{string:1, fret:1}, {string:2, fret:3}, {string:3, fret:2}, {string:4, fret:2}], barre: null },
    { name: 'Em', desc: '小三和弦 (忧郁)', positions: [{string:4, fret:2}, {string:5, fret:2}], barre: null },
    { name: 'F', desc: '大横按和弦', positions: [{string:2, fret:1}, {string:3, fret:2}, {string:4, fret:3}], barre: {fret:1, startString:6, endString:1} },
    { name: 'G', desc: '大三和弦', positions: [{string:1, fret:3}, {string:5, fret:2}, {string:6, fret:3}], barre: null },
    { name: 'Am', desc: '小三和弦', positions: [{string:2, fret:1}, {string:3, fret:2}, {string:4, fret:2}], barre: null }
];