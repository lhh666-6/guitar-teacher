import numpy as np


class KalmanFilter:
    """1D 恒速卡尔曼滤波器 — 对手部运动追踪更友好
    状态向量: [position, velocity]
    q: 过程噪声，越大越跟手 (建议 0.01~0.2)
    r: 测量噪声，越小越信任测量值 (建议 0.1~2.0)
    """
    def __init__(self, q=0.08, r=0.5):
        self.q = q
        self.r = r
        self.x = None  # [position, velocity]
        self.P = None  # 协方差矩阵
        self.last_time = None

    def __call__(self, z, timestamp=None):
        z = np.asarray(z, dtype=float)
        if timestamp is None:
            dt = 1.0 / 30
        else:
            if self.last_time is None:
                dt = 1.0 / 30
            else:
                dt = max(timestamp - self.last_time, 0.001)
        self.last_time = timestamp

        if self.x is None:
            # 首次初始化：位置=测量值，速度=0
            self.x = np.stack([z, np.zeros_like(z)], axis=-1)  # shape: (..., 2)
            self.P = np.tile(np.eye(2), z.shape + (1, 1))      # shape: (..., 2, 2)
            return z.copy()

        # ---- 预测 ----
        F = np.array([[1, dt], [0, 1]])
        x_pred = self.x @ F.T  # (..., 2)
        P_pred = F @ self.P @ F.T  # (..., 2, 2)
        # 加过程噪声 Q
        dt2, dt3, dt4 = dt * dt, dt * dt * dt, dt * dt * dt * dt
        Q = self.q * np.array([[dt4/4, dt3/2], [dt3/2, dt2]])
        P_pred = P_pred + Q

        # ---- 更新 ----
        H = np.array([1.0, 0.0])
        y = z - x_pred[..., 0]  # 创新
        S = P_pred[..., 0, 0] + self.r
        K0 = P_pred[..., 0, 0] / S
        K1 = P_pred[..., 1, 0] / S

        self.x[..., 0] = x_pred[..., 0] + K0 * y
        self.x[..., 1] = x_pred[..., 1] + K1 * y

        # 更新协方差
        ikh00 = 1 - K0
        self.P[..., 0, 0] = ikh00 * P_pred[..., 0, 0]
        self.P[..., 0, 1] = ikh00 * P_pred[..., 0, 1]
        self.P[..., 1, 0] = P_pred[..., 1, 0] - K1 * P_pred[..., 0, 0]
        self.P[..., 1, 1] = P_pred[..., 1, 1] - K1 * P_pred[..., 0, 1]

        return self.x[..., 0].copy()


class OneEuroFilter:
    """一欧元滤波器，用于平滑手部关键点轨迹，减少抖动"""
    def __init__(self, min_cutoff=0.5, beta=0.1, dcutoff=1.0):
        self.min_cutoff = min_cutoff
        self.beta = beta
        self.dcutoff = dcutoff
        self.x_prev = None
        self.dx_prev = None
        self.last_time = None

    def _alpha(self, cutoff, dt):
        tau = 1.0 / (2 * np.pi * cutoff)
        return 1.0 / (1.0 + tau / dt)

    def __call__(self, x, timestamp=None):
        x = np.asarray(x, dtype=float)
        if timestamp is None:
            dt = 1.0 / 30
        else:
            if self.last_time is None:
                dt = 1.0 / 30
            else:
                dt = timestamp - self.last_time
        self.last_time = timestamp

        if self.x_prev is None:
            self.x_prev = x.copy()
            self.dx_prev = np.zeros_like(x)
            return x.copy()

        dx = (x - self.x_prev) / dt
        a_d = self._alpha(self.dcutoff, dt)
        edx = a_d * dx + (1 - a_d) * self.dx_prev

        speed = np.linalg.norm(edx)
        cutoff = self.min_cutoff + self.beta * speed
        a = self._alpha(cutoff, dt)
        filtered = a * x + (1 - a) * self.x_prev

        self.x_prev = filtered
        self.dx_prev = edx
        return filtered