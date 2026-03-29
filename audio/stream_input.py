"""Phase 1: microphone stream input and ring-buffer windowing.

This module only handles realtime audio capture and framing.
No chord-recognition logic is included in Phase 1.
"""

from __future__ import annotations

import queue
import threading
import time
from collections import deque
from dataclasses import dataclass
from typing import Generator, Iterable, Optional

import numpy as np

try:
    import sounddevice as sd
except Exception:  # pragma: no cover - runtime dependency check
    sd = None


class AudioDependencyError(RuntimeError):
    """Raised when optional runtime audio dependencies are unavailable."""


@dataclass
class FrameStats:
    """Simple stats for one audio frame/window."""

    rms: float
    peak: float
    is_valid: bool


class RingAudioBuffer:
    """A fixed-size mono audio ring buffer backed by deque."""

    def __init__(self, max_samples: int):
        if max_samples <= 0:
            raise ValueError("max_samples must be > 0")
        self.max_samples = int(max_samples)
        self._buffer: deque[float] = deque(maxlen=self.max_samples)

    def append(self, mono_chunk: np.ndarray) -> None:
        if mono_chunk.size == 0:
            return
        self._buffer.extend(mono_chunk.astype(np.float32, copy=False))

    def __len__(self) -> int:
        return len(self._buffer)

    def get_last(self, num_samples: int) -> Optional[np.ndarray]:
        if num_samples <= 0:
            raise ValueError("num_samples must be > 0")
        if len(self._buffer) < num_samples:
            return None
        data = list(self._buffer)[-num_samples:]
        return np.asarray(data, dtype=np.float32)


class MicStreamInput:
    """Realtime microphone input with chunk queue + sliding-window generator."""

    def __init__(
        self,
        sample_rate: int,
        chunk_size: int,
        device_index: Optional[int] = None,
        channels: int = 1,
        max_buffer_seconds: float = 5.0,
    ) -> None:
        if sd is None:
            raise AudioDependencyError(
                "sounddevice is not available. Please install it before running Phase 1 scripts."
            )
        if sample_rate <= 0 or chunk_size <= 0:
            raise ValueError("sample_rate and chunk_size must be > 0")
        if channels <= 0:
            raise ValueError("channels must be > 0")
        if max_buffer_seconds <= 0:
            raise ValueError("max_buffer_seconds must be > 0")

        self.sample_rate = int(sample_rate)
        self.chunk_size = int(chunk_size)
        self.device_index = device_index
        self.channels = int(channels)

        max_samples = int(self.sample_rate * max_buffer_seconds)
        self.ring = RingAudioBuffer(max_samples=max_samples)

        self._queue: queue.Queue[np.ndarray] = queue.Queue(maxsize=256)
        self._stream = None
        self._running = threading.Event()

    @staticmethod
    def list_input_devices() -> list[tuple[int, str, int, float]]:
        if sd is None:
            raise AudioDependencyError("sounddevice is not available")
        devices = []
        for idx, dev in enumerate(sd.query_devices()):
            max_in = int(dev.get("max_input_channels", 0))
            if max_in > 0:
                name = str(dev.get("name", "unknown"))
                sr = float(dev.get("default_samplerate", 0.0))
                devices.append((idx, name, max_in, sr))
        return devices

    def _audio_callback(self, indata, frames, callback_time, status) -> None:
        if status:
            # Status is non-fatal in most cases; skip noisy logs in Phase 1.
            pass
        mono = np.asarray(indata[:, 0], dtype=np.float32)
        try:
            self._queue.put_nowait(mono)
        except queue.Full:
            # Drop chunk if consumer is too slow to preserve realtime behavior.
            pass

    def start(self) -> None:
        if self._running.is_set():
            return

        self._stream = sd.InputStream(
            samplerate=self.sample_rate,
            blocksize=self.chunk_size,
            channels=self.channels,
            dtype="float32",
            device=self.device_index,
            callback=self._audio_callback,
        )
        self._stream.start()
        self._running.set()

    def stop(self) -> None:
        if not self._running.is_set():
            return
        self._running.clear()
        if self._stream is not None:
            self._stream.stop()
            self._stream.close()
            self._stream = None

    def iter_chunks(self, timeout_sec: float = 1.0) -> Generator[np.ndarray, None, None]:
        while self._running.is_set():
            try:
                chunk = self._queue.get(timeout=timeout_sec)
                self.ring.append(chunk)
                yield chunk
            except queue.Empty:
                continue

    def iter_windows(
        self,
        window_seconds: float,
        hop_seconds: float,
        timeout_sec: float = 1.0,
    ) -> Generator[np.ndarray, None, None]:
        if window_seconds <= 0 or hop_seconds <= 0:
            raise ValueError("window_seconds and hop_seconds must be > 0")

        window_samples = max(1, int(window_seconds * self.sample_rate))
        hop_samples = max(1, int(hop_seconds * self.sample_rate))

        samples_since_emit = 0
        for chunk in self.iter_chunks(timeout_sec=timeout_sec):
            samples_since_emit += chunk.size
            if len(self.ring) < window_samples:
                continue
            if samples_since_emit < hop_samples:
                continue
            samples_since_emit = 0
            window = self.ring.get_last(window_samples)
            if window is not None:
                yield window


def compute_rms(samples: np.ndarray) -> float:
    if samples.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(np.square(samples, dtype=np.float32), dtype=np.float32)))


def compute_peak(samples: np.ndarray) -> float:
    if samples.size == 0:
        return 0.0
    return float(np.max(np.abs(samples)))


def build_frame_stats(samples: np.ndarray, rms_gate: float) -> FrameStats:
    rms = compute_rms(samples)
    peak = compute_peak(samples)
    return FrameStats(rms=rms, peak=peak, is_valid=(rms >= rms_gate))
