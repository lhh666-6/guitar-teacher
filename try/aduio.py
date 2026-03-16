import pyaudio
import aubio
import numpy as np

# ========== 1. 初始化 PyAudio 和 aubio ==========
p = pyaudio.PyAudio()
# aubio 音高检测器 (YIN算法，精度高)
pitch_detector = aubio.pitch("yin", 2048, 512, 44100)
pitch_detector.set_unit("Hz")
pitch_detector.set_tolerance(0.8)

# ========== 2. 打开音频流 ==========
stream = p.open(format=pyaudio.paFloat32,   # aubio 需要 float32
                channels=1,
                rate=44100,
                input=True,
                frames_per_buffer=512)      # 必须与 aubio 的 hop_size 一致

print("🎤 实时音高检测已启动，对着麦克风弹/唱/吹口哨...")

# ========== 3. 无限循环，实时检测 ==========
try:
    while True:
        # 读取一块音频数据
        samples = stream.read(512, exception_on_overflow=False)
        # 转换成 numpy 数组 (float32)
        samples_np = np.frombuffer(samples, dtype=np.float32)
        
        # 检测音高
        pitch = pitch_detector(samples_np)[0]
        
        # 忽略极低频（避免噪声误报）
        if pitch > 80 and pitch < 800:
            print(f"🎵 当前音高: {pitch:.2f} Hz")
        else:
            print("🔇 静音或无效信号")
            
except KeyboardInterrupt:
    print("\n🛑 停止检测")
    stream.stop_stream()
    stream.close()
    p.terminate()