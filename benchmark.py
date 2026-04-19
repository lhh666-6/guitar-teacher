#!/usr/bin/env python3
import cv2
import time
import numpy as np
from core.detector import GuitarFingeringRecognizer
import config

def test_resize(image_path, widths):
    # 读取原图
    original = cv2.imread(image_path)
    if original is None:
        print(f"无法读取图片: {image_path}")
        return
    h, w = original.shape[:2]
    print(f"原图尺寸: {w}x{h}")

    recognizer = GuitarFingeringRecognizer(
        yolo_model_path=config.YOLO_MODEL_PATH,
        hand_model_path=config.HAND_MODEL_PATH
    )

    results = {}
    for new_width in widths:
        # 计算缩放比例
        ratio = new_width / w
        new_height = int(h * ratio)
        resized = cv2.resize(original, (new_width, new_height))
        print(f"\n测试分辨率: {new_width}x{new_height}")

        # 多次测试取平均
        n_iter = 5
        times = []
        success = False
        for i in range(n_iter):
            start = time.perf_counter()
            # 注意：update_fretboard 会修改 recognizer 内部状态，但重复调用不影响结果
            success = recognizer.update_fretboard(resized)
            elapsed = (time.perf_counter() - start) * 1000
            times.append(elapsed)
            print(f"  第{i+1}次: {elapsed:.2f} ms, 成功: {success}")
        avg = sum(times) / n_iter
        results[new_width] = {'avg_ms': avg, 'success': success}
        print(f"  平均耗时: {avg:.2f} ms")

    recognizer.close()
    return results

if __name__ == "__main__":
    # 测试的宽度列表（按需修改）
    widths = [1280, 960, 640, 480, 320]
    # 图片路径（请替换为你的图片路径）
    img_path = "test_guitar.jpg"
    results = test_resize(img_path, widths)
    print("\n========== 汇总 ==========")
    for w, info in results.items():
        status = "成功" if info['success'] else "失败"
        print(f"宽度 {w}: 平均 {info['avg_ms']:.2f} ms, {status}")