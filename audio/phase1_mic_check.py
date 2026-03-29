"""Phase 1 verification script.

Usage:
    python -m audio.phase1_mic_check --seconds 20
"""

from __future__ import annotations

import argparse
import sys
import time

import config

from .stream_input import AudioDependencyError, MicStreamInput, build_frame_stats


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Phase 1 microphone stream validation")
    parser.add_argument("--seconds", type=float, default=20.0, help="validation duration in seconds")
    parser.add_argument("--list-devices", action="store_true", help="list input devices and exit")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if args.list_devices:
        try:
            devices = MicStreamInput.list_input_devices()
        except AudioDependencyError as exc:
            print(f"[ERROR] {exc}")
            print("[HINT] 请先在已激活的 conda 环境中执行: pip install sounddevice==0.5.5")
            return 1

        if not devices:
            print("[WARN] 未检测到可用输入设备")
            return 0

        print("index | channels | default_sr | name")
        for idx, name, channels, sr in devices:
            print(f"{idx:>5} | {channels:>8} | {sr:>10.1f} | {name}")
        return 0

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
        print("[HINT] 请先在已激活的 conda 环境中执行: pip install sounddevice==0.5.5")
        return 1

    total_frames = 0
    valid_frames = 0
    rms_peak = 0.0
    t_start = time.time()
    t_last_log = t_start

    print("[INFO] Phase 1 麦克风验证开始")
    print(f"[INFO] sample_rate={config.AUDIO_SAMPLE_RATE}, chunk_size={config.AUDIO_CHUNK_SIZE}, "
          f"window={config.AUDIO_WINDOW_SECONDS}s, hop={config.AUDIO_HOP_SECONDS}s")
    print(f"[INFO] rms_gate={config.AUDIO_RMS_GATE}, device_index={config.AUDIO_INPUT_DEVICE_INDEX}")
    print("[INFO] 按 Ctrl+C 可提前结束")

    mic.start()
    try:
        for window in mic.iter_windows(
            window_seconds=config.AUDIO_WINDOW_SECONDS,
            hop_seconds=config.AUDIO_HOP_SECONDS,
            timeout_sec=1.0,
        ):
            stats = build_frame_stats(window, rms_gate=config.AUDIO_RMS_GATE)
            total_frames += 1
            if stats.is_valid:
                valid_frames += 1
            rms_peak = max(rms_peak, stats.rms)

            now = time.time()
            elapsed = now - t_start

            if now - t_last_log >= 1.0:
                fps = total_frames / max(elapsed, 1e-6)
                valid_ratio = (valid_frames / total_frames) if total_frames else 0.0
                print(
                    f"[LIVE] t={elapsed:5.1f}s | frames={total_frames:4d} | "
                    f"fps={fps:5.2f} | rms={stats.rms:0.5f} | peak={stats.peak:0.5f} | "
                    f"valid_ratio={valid_ratio:0.2%}"
                )
                t_last_log = now

            if elapsed >= args.seconds:
                break

    except KeyboardInterrupt:
        print("\n[INFO] 用户中断，结束采样")
    finally:
        mic.stop()

    elapsed = time.time() - t_start
    fps = total_frames / max(elapsed, 1e-6)
    valid_ratio = (valid_frames / total_frames) if total_frames else 0.0

    print("\n[SUMMARY] Phase 1 验证结果")
    print(f"duration_sec     : {elapsed:0.2f}")
    print(f"total_frames     : {total_frames}")
    print(f"valid_frames     : {valid_frames}")
    print(f"valid_ratio      : {valid_ratio:0.2%}")
    print(f"avg_fps          : {fps:0.2f}")
    print(f"max_rms          : {rms_peak:0.5f}")
    print(f"rms_gate         : {config.AUDIO_RMS_GATE:0.5f}")

    if total_frames == 0:
        print("[WARN] 未采集到有效窗口，请检查麦克风设备或参数")
        return 2

    print("[OK] Phase 1 采集与分帧链路可运行")
    return 0


if __name__ == "__main__":
    sys.exit(main())
