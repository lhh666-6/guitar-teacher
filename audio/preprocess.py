"""Phase 2: audio preprocessing utilities for robust chord features."""

from __future__ import annotations

import numpy as np


def pre_emphasis(samples: np.ndarray, coef: float) -> np.ndarray:
    """Apply pre-emphasis filter y[t] = x[t] - coef*x[t-1]."""
    if samples.size == 0:
        return samples
    out = np.empty_like(samples, dtype=np.float32)
    out[0] = samples[0]
    out[1:] = samples[1:] - (coef * samples[:-1])
    return out


def fft_bandpass(samples: np.ndarray, sr: int, low_hz: float | None, high_hz: float | None) -> np.ndarray:
    """Simple FFT-domain band-pass masking for one window.

    This keeps dependencies minimal and avoids introducing extra realtime state.
    """
    if samples.size == 0:
        return samples
    if low_hz is None and high_hz is None:
        return samples

    x = np.asarray(samples, dtype=np.float32)
    spectrum = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(x.size, d=1.0 / float(sr))

    mask = np.ones_like(freqs, dtype=bool)
    if low_hz is not None:
        mask &= freqs >= float(low_hz)
    if high_hz is not None:
        mask &= freqs <= float(high_hz)

    spectrum[~mask] = 0.0
    filtered = np.fft.irfft(spectrum, n=x.size)
    return filtered.astype(np.float32)


def normalize_peak(samples: np.ndarray, eps: float = 1e-8) -> np.ndarray:
    """Peak-normalize to keep feature scales stable across recordings."""
    if samples.size == 0:
        return samples
    peak = float(np.max(np.abs(samples)))
    if peak < eps:
        return samples
    return (samples / peak).astype(np.float32)
