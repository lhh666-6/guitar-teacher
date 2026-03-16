// ========== filters.js ==========
// OneEuroFilter 类：用于平滑手部关键点，参数说明见构造函数

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