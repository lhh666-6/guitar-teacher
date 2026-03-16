import numpy as np

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