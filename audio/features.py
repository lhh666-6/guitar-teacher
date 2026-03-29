"""Phase 2: librosa-based chroma feature extraction."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np

from .preprocess import fft_bandpass, normalize_peak, pre_emphasis

try:
    import librosa  # type: ignore[import-not-found]
except Exception:  # pragma: no cover - runtime dependency check
    librosa = None


class FeatureDependencyError(RuntimeError):
    """Raised when librosa is unavailable."""


@dataclass
class FeatureResult:
    chroma: np.ndarray
    chroma_agg: np.ndarray
    dominant_pitch_class: int
    dominant_strength: float
    quality_score: float


def _ensure_librosa() -> None:
    if librosa is None:
        raise FeatureDependencyError(
            "librosa is not available. Please install it before running Phase 2 scripts."
        )


def _aggregate_chroma(chroma: np.ndarray, method: Literal["median", "mean"]) -> np.ndarray:
    if chroma.size == 0:
        return np.zeros((12,), dtype=np.float32)
    if method == "mean":
        vec = np.mean(chroma, axis=1)
    else:
        vec = np.median(chroma, axis=1)

    vec = np.asarray(vec, dtype=np.float32)
    s = float(np.sum(vec))
    if s > 0:
        vec /= s
    return vec


def _quality_from_chroma(chroma_agg: np.ndarray) -> float:
    """A simple confidence-like quality proxy for Phase 2.

    We use top1 - top2 separation to estimate how peaky the chroma is.
    """
    if chroma_agg.size != 12:
        return 0.0
    sorted_vals = np.sort(chroma_agg)[::-1]
    if sorted_vals.size < 2:
        return 0.0
    return float(max(0.0, sorted_vals[0] - sorted_vals[1]))


def extract_chroma_features(
    samples: np.ndarray,
    sample_rate: int,
    *,
    use_preemphasis: bool,
    preemphasis_coef: float,
    low_hz: float | None,
    high_hz: float | None,
    use_hpss: bool,
    chroma_type: Literal["stft", "cqt"],
    n_fft: int,
    hop_length: int,
    n_chroma: int,
    aggregate: Literal["median", "mean"] = "median",
) -> FeatureResult:
    _ensure_librosa()

    x = np.asarray(samples, dtype=np.float32)
    if x.size == 0:
        return FeatureResult(
            chroma=np.zeros((n_chroma, 0), dtype=np.float32),
            chroma_agg=np.zeros((n_chroma,), dtype=np.float32),
            dominant_pitch_class=0,
            dominant_strength=0.0,
            quality_score=0.0,
        )

    # 1) Band-pass and optional pre-emphasis to suppress room/low-end noise.
    x = fft_bandpass(x, sr=sample_rate, low_hz=low_hz, high_hz=high_hz)
    if use_preemphasis:
        x = pre_emphasis(x, coef=preemphasis_coef)

    # 2) Optional harmonic isolation for guitar chord content.
    if use_hpss:
        harmonic, _ = librosa.effects.hpss(x)
        x = np.asarray(harmonic, dtype=np.float32)

    x = normalize_peak(x)

    # 3) Chroma extraction.
    if chroma_type == "cqt":
        chroma = librosa.feature.chroma_cqt(
            y=x,
            sr=sample_rate,
            hop_length=hop_length,
            n_chroma=n_chroma,
        )
    else:
        chroma = librosa.feature.chroma_stft(
            y=x,
            sr=sample_rate,
            n_fft=n_fft,
            hop_length=hop_length,
            n_chroma=n_chroma,
        )

    chroma = np.asarray(chroma, dtype=np.float32)
    chroma_agg = _aggregate_chroma(chroma, method=aggregate)

    dominant_pc = int(np.argmax(chroma_agg)) if chroma_agg.size else 0
    dominant_strength = float(chroma_agg[dominant_pc]) if chroma_agg.size else 0.0
    quality = _quality_from_chroma(chroma_agg)

    return FeatureResult(
        chroma=chroma,
        chroma_agg=chroma_agg,
        dominant_pitch_class=dominant_pc,
        dominant_strength=dominant_strength,
        quality_score=quality,
    )
