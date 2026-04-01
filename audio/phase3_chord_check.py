"""Phase 3 realtime chord check for 12 common chords.

Usage:python -m audio.phase3_chord_check --seconds 20
    
"""

from __future__ import annotations

import argparse
import sys
import time

import config

from .chord_templates import build_templates
from .classifier import classify_chord
from .features import FeatureDependencyError, extract_chroma_features
from .smoother import ChordTemporalSmoother
from .stream_input import AudioDependencyError, MicStreamInput, build_frame_stats


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Phase 3 realtime chord classification check")
    parser.add_argument("--seconds", type=float, default=20.0, help="validation duration in seconds")
    return parser.parse_args()


def _fmt_top_k(items: list[tuple[str, float]]) -> str:
    if not items:
        return "-"
    return ", ".join([f"{n}:{s:.3f}" for n, s in items])


def main() -> int:
    args = parse_args()

    templates = build_templates(
        config.AUDIO_CHORD_LABELS,
        root_weight=getattr(config, "AUDIO_TEMPLATE_ROOT_WEIGHT", 1.0),
        third_weight=getattr(config, "AUDIO_TEMPLATE_THIRD_WEIGHT", 0.85),
        fifth_weight=getattr(config, "AUDIO_TEMPLATE_FIFTH_WEIGHT", 0.75),
        seventh_weight=getattr(config, "AUDIO_TEMPLATE_SEVENTH_WEIGHT", 0.65),
    )
    if not templates:
        print("[ERROR] 未生成和弦模板，请检查 AUDIO_CHORD_LABELS")
        return 1

    smoother = ChordTemporalSmoother(
        window_size=config.AUDIO_SMOOTH_WINDOW,
        min_vote_count=getattr(config, "AUDIO_SMOOTH_MIN_VOTES", 2),
        unknown_label=config.AUDIO_UNKNOWN_LABEL,
        switch_hysteresis=config.AUDIO_SWITCH_HYSTERESIS,
    )

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
        return 2

    print("[INFO] Phase 3 和弦识别验证开始")
    print(f"[INFO] labels={config.AUDIO_CHORD_LABELS}")
    print("[INFO] 按 Ctrl+C 可提前结束")

    total = 0
    valid = 0
    classified = 0
    t0 = time.time()
    t_last = t0
    t_last_output = 0.0

    mic.start()
    try:
        for window in mic.iter_windows(
            window_seconds=config.AUDIO_WINDOW_SECONDS,
            hop_seconds=config.AUDIO_HOP_SECONDS,
            timeout_sec=1.0,
        ):
            total += 1
            stats = build_frame_stats(window, rms_gate=config.AUDIO_RMS_GATE)
            if not stats.is_valid:
                continue
            valid += 1

            try:
                feat = extract_chroma_features(
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
                return 3

            pred = classify_chord(
                chroma_agg=feat.chroma_agg,
                templates=templates,
                unknown_label=config.AUDIO_UNKNOWN_LABEL,
                confidence_threshold=config.AUDIO_CONFIDENCE_THRESHOLD,
                margin_threshold=config.AUDIO_MARGIN_THRESHOLD,
                feature_quality=feat.quality_score,
                feature_quality_gate=getattr(config, "AUDIO_FEATURE_QUALITY_GATE", 0.03),
                top_k=max(1, int(getattr(config, "AUDIO_CLASSIFIER_TOP_K", 3))),
            )
            classified += 1

            smooth_out = smoother.update(pred.label, pred.confidence)

            now = time.time()
            should_output = (now - t_last_output) >= float(config.AUDIO_MIN_OUTPUT_INTERVAL)
            if should_output and (now - t_last >= 1.0):
                print(
                    f"[LIVE] t={now - t0:5.1f}s | total={total:4d} | valid={valid:4d} | cls={classified:4d} | "
                    f"rms={stats.rms:0.5f} | raw={pred.label:>7} | stable={smooth_out.label:>7} | "
                    f"conf={pred.confidence:0.3f} | margin={pred.margin:0.3f} | q={pred.quality:0.3f} | "
                    f"top={_fmt_top_k(pred.top_k)}"
                )
                t_last = now
                t_last_output = now

            if now - t0 >= args.seconds:
                break

    except KeyboardInterrupt:
        print("\n[INFO] 用户中断，结束采样")
    finally:
        mic.stop()

    elapsed = time.time() - t0
    print("\n[SUMMARY] Phase 3 验证结果")
    print(f"duration_sec      : {elapsed:0.2f}")
    print(f"total_windows     : {total}")
    print(f"valid_windows     : {valid}")
    print(f"classified_windows: {classified}")
    print(f"last_stable_label : {smoother.current_label}")

    if classified <= 0:
        print("[WARN] 没有产生分类结果，请检查门限或输入信号")
        return 4

    print("[OK] Phase 3 分类与平滑链路可运行")
    return 0


if __name__ == "__main__":
    sys.exit(main())
