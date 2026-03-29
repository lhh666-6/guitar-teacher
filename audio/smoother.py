"""Phase 3: temporal smoother for stable realtime chord output."""

from __future__ import annotations

from collections import Counter, deque
from dataclasses import dataclass


@dataclass
class SmoothedOutput:
    label: str
    switched: bool


class ChordTemporalSmoother:
    def __init__(
        self,
        *,
        window_size: int,
        min_vote_count: int,
        unknown_label: str,
        switch_hysteresis: float,
    ) -> None:
        self.window_size = max(1, int(window_size))
        self.min_vote_count = max(1, int(min_vote_count))
        self.unknown_label = unknown_label
        self.switch_hysteresis = float(switch_hysteresis)

        self.history: deque[str] = deque(maxlen=self.window_size)
        self.current_label: str = unknown_label
        self.current_confidence: float = 0.0

    def update(self, raw_label: str, raw_confidence: float) -> SmoothedOutput:
        self.history.append(raw_label)
        non_unknown = [x for x in self.history if x != self.unknown_label]
        if not non_unknown:
            self.current_label = self.unknown_label
            self.current_confidence = 0.0
            return SmoothedOutput(label=self.current_label, switched=False)

        counter = Counter(non_unknown)
        candidate, votes = counter.most_common(1)[0]

        # Not enough temporal evidence yet, keep current state.
        if votes < self.min_vote_count:
            return SmoothedOutput(label=self.current_label, switched=False)

        if self.current_label in ("", self.unknown_label):
            self.current_label = candidate
            self.current_confidence = raw_confidence
            return SmoothedOutput(label=self.current_label, switched=True)

        if candidate == self.current_label:
            self.current_confidence = max(self.current_confidence * 0.8 + raw_confidence * 0.2, raw_confidence)
            return SmoothedOutput(label=self.current_label, switched=False)

        # Hysteresis: only switch when new label is convincingly stronger.
        if raw_confidence >= (self.current_confidence + self.switch_hysteresis):
            self.current_label = candidate
            self.current_confidence = raw_confidence
            return SmoothedOutput(label=self.current_label, switched=True)

        return SmoothedOutput(label=self.current_label, switched=False)
