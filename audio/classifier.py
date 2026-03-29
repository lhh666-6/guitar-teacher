"""Phase 3: template-matching classifier with confidence and unknown fallback."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .chord_templates import ChordTemplate


@dataclass
class ChordPrediction:
    label: str
    confidence: float
    margin: float
    quality: float
    top_k: list[tuple[str, float]]


def _cosine(a: np.ndarray, b: np.ndarray, eps: float = 1e-8) -> float:
    a = np.asarray(a, dtype=np.float32)
    b = np.asarray(b, dtype=np.float32)
    denom = (float(np.linalg.norm(a)) * float(np.linalg.norm(b))) + eps
    if denom <= eps:
        return 0.0
    return float(np.dot(a, b) / denom)


def classify_chord(
    chroma_agg: np.ndarray,
    templates: list[ChordTemplate],
    *,
    unknown_label: str,
    confidence_threshold: float,
    margin_threshold: float,
    feature_quality: float,
    feature_quality_gate: float,
    top_k: int = 3,
) -> ChordPrediction:
    if chroma_agg.size != 12 or not templates:
        return ChordPrediction(
            label=unknown_label,
            confidence=0.0,
            margin=0.0,
            quality=feature_quality,
            top_k=[],
        )

    scored = [(tpl.name, _cosine(chroma_agg, tpl.vector)) for tpl in templates]
    scored.sort(key=lambda x: x[1], reverse=True)

    best_label, best_score = scored[0]
    second_score = scored[1][1] if len(scored) > 1 else 0.0
    margin = float(best_score - second_score)

    # Unknown fallback to reduce noisy false positives.
    if feature_quality < feature_quality_gate:
        out_label = unknown_label
    elif best_score < confidence_threshold:
        out_label = unknown_label
    elif margin < margin_threshold:
        out_label = unknown_label
    else:
        out_label = best_label

    return ChordPrediction(
        label=out_label,
        confidence=float(best_score),
        margin=margin,
        quality=feature_quality,
        top_k=[(name, float(score)) for name, score in scored[:max(1, top_k)]],
    )
