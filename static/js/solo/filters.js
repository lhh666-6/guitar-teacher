// ========== filters.js ==========
// OneEuroFilter 类：用于平滑手部关键点，参数说明见构造函数
// KalmanFilter 类：1D 恒速卡尔曼滤波，对手部运动更友好

class KalmanFilter {
    /**
     * 1D 恒速卡尔曼滤波器 — 对运动追踪更友好
     * @param {number} t0 初始时间戳 (毫秒)
     * @param {number} x0 初始值
     * @param {number} q 过程噪声 (默认0.05，越大越信任测量值，越跟手)
     * @param {number} r 测量噪声 (默认0.5，越小越信任测量值)
     */
    constructor(t0, x0, q = 0.05, r = 0.5) {
        // 状态 [position, velocity]
        this.x = [x0, 0];
        // 协方差矩阵，初始有一定不确定性
        this.P = [[1, 0], [0, 1]];
        this.q = q;
        this.r = r;
        this.t_prev = t0;
    }

    filter(t, z) {
        const dt = (t - this.t_prev) / 1000; // 转为秒
        this.t_prev = t;
        if (dt <= 0.001) return this.x[0];

        // ---- 预测步骤 ----
        // F = [[1, dt], [0, 1]]
        const x_pred = [
            this.x[0] + this.x[1] * dt,
            this.x[1]
        ];
        // P_pred = F * P * F^T + Q
        const p00 = this.P[0][0] + dt * (this.P[1][0] + this.P[0][1]) + dt * dt * this.P[1][1];
        const p01 = this.P[0][1] + dt * this.P[1][1];
        const p10 = this.P[1][0] + dt * this.P[1][1];
        const p11 = this.P[1][1];
        // 加过程噪声 Q
        const dt2 = dt * dt;
        const dt3 = dt2 * dt;
        const dt4 = dt2 * dt2;
        const q = this.q;
        const P_pred = [
            [p00 + q * dt4 / 4, p01 + q * dt3 / 2],
            [p10 + q * dt3 / 2, p11 + q * dt2]
        ];

        // ---- 更新步骤 ----
        // H = [1, 0], 只观测位置
        const y = z - x_pred[0]; // 创新
        const S = P_pred[0][0] + this.r; // 创新协方差
        const K0 = P_pred[0][0] / S; // K[0]
        const K1 = P_pred[1][0] / S; // K[1]

        this.x[0] = x_pred[0] + K0 * y;
        this.x[1] = x_pred[1] + K1 * y;

        // P = (I - K*H) * P_pred
        const ikh00 = 1 - K0;
        this.P[0][0] = ikh00 * P_pred[0][0];
        this.P[0][1] = ikh00 * P_pred[0][1];
        this.P[1][0] = P_pred[1][0] - K1 * P_pred[0][0];
        this.P[1][1] = P_pred[1][1] - K1 * P_pred[0][1];

        return this.x[0];
    }
}

class OneEuroFilter {
    /**
     * @param {number} t0 初始时间戳 (毫秒)
     * @param {number} x0 初始值
     * @param {number} mincutoff 最小截止频率，控制平滑程度 (越小越平滑，默认 1.0)
     * @param {number} beta 速度系数，控制对快速运动的反应 (越大对快速运动越敏感，默认 0.03)
     * @param {number} dcutoff 导数截止频率 (默认 1.0，一般无需改动)
     */
    constructor(t0, x0, mincutoff = 1.0, beta = 0.03, dcutoff = 1.0) {
        this.mincutoff = mincutoff;
        this.beta = beta;
        this.dcutoff = dcutoff;
        this.x_prev = x0;
        this.dx_prev = 0.0;
        this.t_prev = t0;
    }

    smoothingFactor(t, cutoff) {
        const r = 2 * Math.PI * cutoff * t / 1000;
        return r / (r + 1);
    }

    exponentialSmoothing(a, x, x_prev) {
        return a * x + (1 - a) * x_prev;
    }

    filter(t, x) {
        const tElapsed = t - this.t_prev;
        if (tElapsed <= 0) return this.x_prev;
        const dx = (x - this.x_prev) / tElapsed;
        const a_d = this.smoothingFactor(tElapsed, this.dcutoff);
        const dx_hat = this.exponentialSmoothing(a_d, dx, this.dx_prev);
        const cutoff = this.mincutoff + this.beta * Math.abs(dx_hat);
        const a = this.smoothingFactor(tElapsed, cutoff);
        const x_hat = this.exponentialSmoothing(a, x, this.x_prev);
        this.x_prev = x_hat;
        this.dx_prev = dx_hat;
        this.t_prev = t;
        return x_hat;
    }
}