"""Phase 3: chord template definitions for 12 common guitar chords."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import numpy as np

NOTE_TO_PC = {
    "C": 0,
    "C#": 1,
    "Db": 1,
    "D": 2,
    "D#": 3,
    "Eb": 3,
    "E": 4,
    "F": 5,
    "F#": 6,
    "Gb": 6,
    "G": 7,
    "G#": 8,
    "Ab": 8,
    "A": 9,
    "A#": 10,
    "Bb": 10,
    "B": 11,
}


@dataclass
class ChordTemplate:
    name: str
    vector: np.ndarray


def _normalize(v: np.ndarray) -> np.ndarray:
    v = np.asarray(v, dtype=np.float32)
    s = float(np.sum(v))
    if s > 0:
        v = v / s
    return v


def _major_template(root: int, root_w: float, third_w: float, fifth_w: float) -> np.ndarray:
    v = np.zeros((12,), dtype=np.float32)
    v[root % 12] = root_w
    v[(root + 4) % 12] = third_w
    v[(root + 7) % 12] = fifth_w
    return _normalize(v)


def _minor_template(root: int, root_w: float, third_w: float, fifth_w: float) -> np.ndarray:
    v = np.zeros((12,), dtype=np.float32)
    v[root % 12] = root_w
    v[(root + 3) % 12] = third_w
    v[(root + 7) % 12] = fifth_w
    return _normalize(v)


def _dom7_template(root: int, root_w: float, third_w: float, fifth_w: float, seventh_w: float) -> np.ndarray:
    v = np.zeros((12,), dtype=np.float32)
    v[root % 12] = root_w
    v[(root + 4) % 12] = third_w
    v[(root + 7) % 12] = fifth_w
    v[(root + 10) % 12] = seventh_w
    return _normalize(v)


def _parse_chord_name(name: str) -> tuple[str, str]:
    # Supports: C, G, Am, A7, C7
    if name.endswith("m") and not name.endswith("majm"):
        return name[:-1], "minor"
    if name.endswith("7"):
        return name[:-1], "dom7"
    return name, "major"


def build_templates(
    chord_labels: Iterable[str],
    *,
    root_weight: float,
    third_weight: float,
    fifth_weight: float,
    seventh_weight: float,
) -> list[ChordTemplate]:
    templates: list[ChordTemplate] = []

    for label in chord_labels:
        root_name, chord_type = _parse_chord_name(label)
        if root_name not in NOTE_TO_PC:
            # Skip unknown naming in current phase.
            continue
        root = NOTE_TO_PC[root_name]

        if chord_type == "minor":
            vec = _minor_template(root, root_weight, third_weight, fifth_weight)
        elif chord_type == "dom7":
            vec = _dom7_template(root, root_weight, third_weight, fifth_weight, seventh_weight)
        else:
            vec = _major_template(root, root_weight, third_weight, fifth_weight)

        templates.append(ChordTemplate(name=label, vector=vec))

    return templates
