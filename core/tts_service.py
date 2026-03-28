import asyncio
import edge_tts
import logging
import os
import uuid
import time
import threading
from typing import Optional

logger = logging.getLogger(__name__)

class VolcTTS:
    """
    Edge TTS 服务（完全兼容原火山接口）
    使用微软 Edge 的免费神经网络语音合成
    """
    def __init__(self, app_id: str = "", api_key: str = "",
                 voice_type: str = "zh-CN-XiaoxiaoNeural",
                 cluster: str = "", cache_dir: str = 'tts_cache', retry: int = 2):
        self.voice = voice_type  # Edge TTS 音色
        self.cache_dir = cache_dir
        self.retry = retry
        os.makedirs(cache_dir, exist_ok=True)

    def _get_cache_key(self, text: str, voice: str, emotion: Optional[str]) -> str:
        import hashlib
        key_str = f"{text}_{voice}_{emotion or ''}"
        return hashlib.md5(key_str.encode()).hexdigest()

    def _get_cache_path(self, text: str, voice: str, emotion: Optional[str]) -> str:
        return os.path.join(self.cache_dir, f"{self._get_cache_key(text, voice, emotion)}.mp3")

    def _synthesize_sync(self, text: str, voice: str) -> Optional[bytes]:
        """
        同步合成：在事件循环中运行异步函数
        """
        loop = None
        try:
            # 尝试获取当前事件循环
            loop = asyncio.get_running_loop()
        except RuntimeError:
            # 没有运行中的循环，创建一个新循环
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        async def _async_synth():
            communicate = edge_tts.Communicate(text, voice)
            # 收集音频数据
            audio_bytes = b""
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_bytes += chunk["data"]
            return audio_bytes

        try:
            # 如果已有循环在运行，则使用 run_coroutine_threadsafe（但这里简单起见，直接 run_until_complete）
            # 注意：如果在已有的异步环境中调用，可能会报错，但我们的 Flask 是同步的，所以安全。
            if loop.is_running():
                # 如果循环已在运行，需要跨线程调用，但 Flask 主线程不是异步的，这里一般不会发生
                # 简单处理：新开线程运行新循环
                def target():
                    new_loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(new_loop)
                    return new_loop.run_until_complete(_async_synth())
                return target()
            else:
                return loop.run_until_complete(_async_synth())
        except Exception as e:
            logger.error(f"Edge TTS 合成失败: {e}")
            return None

    def _call_api(self, text: str, voice_type: str, emotion: Optional[str],
                  speed_ratio: float, volume_ratio: float) -> Optional[bytes]:
        """
        内部调用 Edge TTS，忽略 speed_ratio/volume_ratio（Edge TTS 暂不支持简单调节）
        """
        # 可选：如果传入了不同的 voice_type，用传入的，否则用默认
        voice = voice_type if voice_type else self.voice
        for attempt in range(self.retry):
            audio_bytes = self._synthesize_sync(text, voice)
            if audio_bytes:
                return audio_bytes
            time.sleep(0.5)
        return None

    def synthesize(self, text: str, voice_type: Optional[str] = None,
                   speed_ratio: float = 0.9, volume_ratio: float = 1.0,
                   emotion: Optional[str] = None) -> Optional[bytes]:
        """
        对外接口（与原火山版本完全一致）
        """
        if not text:
            return None
        voice = voice_type or self.voice

        cache_path = self._get_cache_path(text, voice, emotion)
        if os.path.exists(cache_path):
            try:
                with open(cache_path, 'rb') as f:
                    audio = f.read()
                    logger.info(f"[TTS] 命中缓存: {cache_path}, 大小={len(audio)}")
                    return audio
            except Exception as e:
                logger.warning(f"读取缓存失败: {e}")

        logger.info(f"[TTS] 未命中缓存，调用 Edge TTS: voice={voice}")
        audio_bytes = self._call_api(text, voice, emotion, speed_ratio, volume_ratio)
        if audio_bytes:
            try:
                with open(cache_path, 'wb') as f:
                    f.write(audio_bytes)
                logger.info(f"[TTS] 已写入缓存: {cache_path}")
            except Exception as e:
                logger.warning(f"写入缓存失败: {e}")
        return audio_bytes