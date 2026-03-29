"""Phase 2 realtime feature validation.

Usage:
    python -m audio.phase2_feature_check --seconds 20
"""

from __future__ import annotations

import argparse
import sys
import time

import config

from .features import FeatureDependencyError, extract_chroma_features
from .stream_input import AudioDependencyError, MicStreamInput, build_frame_stats

PITCH_CLASS_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Phase 2 chroma feature realtime check")
    parser.add_argument("--seconds", type=float, default=20.0, help="validation duration in seconds")
    return parser.parse_args()


def _top_pitch_classes(chroma_agg, top_k: int = 3):
    idx = chroma_agg.argsort()[::-1][:top_k]
    out = []
    for i in idx:
        out.append((PITCH_CLASS_NAMES[int(i)], float(chroma_agg[int(i)])))
    return out


def main() -> int:
    args = parse_args()

    try:
        mic = MicStreamInput(
            sample_rate=config.AUDIO_SAMPLE_RATE,
            chunk_size=config.AUDIO_CHUNK_SIZE,
            device_index=config.AUDIO_INPUT_DEVICE_INDEX,
            channels=1,
            max_buffer_seconds=max(3.0, config.AUDIO_WINDOW_SECONDS * 3.0),
        )
    except AudioDependencyError as exc:
        print(f"[ERROR] {exc}")
        print("[HINT] 先在已激活环境执行: pip install sounddevice==0.5.5")
        return 1

    print("[INFO] Phase 2 特征验证开始")
    print("[INFO] 若提示缺少 librosa，请先安装后重试")
    print("[INFO] 按 Ctrl+C 可提前结束")

    total_windows = 0
    valid_windows = 0
    feature_windows = 0
    t0 = time.time()
    t_last = t0

    mic.start()
    try:
        for window in mic.iter_windows(
            window_seconds=config.AUDIO_WINDOW_SECONDS,
            hop_seconds=config.AUDIO_HOP_SECONDS,
            timeout_sec=1.0,
        ):
            total_windows += 1
            stats = build_frame_stats(window, rms_gate=config.AUDIO_RMS_GATE)
            if stats.is_valid:
                valid_windows += 1
            else:
                continue

            try:
                result = extract_chroma_features(
                    samples=window,
                    sample_rate=config.AUDIO_SAMPLE_RATE,
                    use_preemphasis=config.AUDIO_USE_PREEMPHASIS,
                    preemphasis_coef=config.AUDIO_PREEMPHASIS_COEF,
                    low_hz=config.AUDIO_BANDPASS_LOW_HZ,
                    high_hz=config.AUDIO_BANDPASS_HIGH_HZ,
                    use_hpss=config.AUDIO_USE_HPSS,
                    chroma_type=config.AUDIO_CHROMA_TYPE,
                    n_fft=config.AUDIO_N_FFT,
                    hop_length=config.AUDIO_HOP_LENGTH,
                    n_chroma=config.AUDIO_CHROMA_BINS,
                    aggregate=getattr(config, "AUDIO_CHROMA_AGGREGATE", "median"),
                )
            except FeatureDependencyError as exc:
                print(f"[ERROR] {exc}")
                print("[HINT] 先在已激活环境执行: pip install librosa==0.10.2.post1")
                return 2

            feature_windows += 1
            now = time.time()
            if now - t_last >= 1.0:
                top_pc = _top_pitch_classes(result.chroma_agg, top_k=3)
                top_msg = ", ".join([f"{name}:{val:.3f}" for name, val in top_pc])
                print(
                    f"[LIVE] t={now - t0:5.1f}s | windows={total_windows:4d} | "
                    f"valid={valid_windows:4d} | feature={feature_windows:4d} | "
                    f"rms={stats.rms:0.5f} | quality={result.quality_score:0.4f} | top={top_msg}"
                )
                t_last = now

            if now - t0 >= args.seconds:
                break

    except KeyboardInterrupt:
        print("\n[INFO] 用户中断，结束采样")
    finally:
        mic.stop()

    elapsed = time.time() - t0
    print("\n[SUMMARY] Phase 2 验证结果")
    print(f"duration_sec      : {elapsed:0.2f}")
    print(f"total_windows     : {total_windows}")
    print(f"valid_windows     : {valid_windows}")
    print(f"feature_windows   : {feature_windows}")

    if feature_windows <= 0:
        print("[WARN] 没有生成特征窗口；请检查门限、麦克风输入或安装 librosa")
        return 3

    print("[OK] Phase 2 特征提取链路可运行")
    return 0


if __name__ == "__main__":
    sys.exit(main())
