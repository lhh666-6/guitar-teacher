import asyncio
import edge_tts
import logging
import os
import uuid
import time
import threading
import re
from typing import Optional

logger = logging.getLogger(__name__)

# 备用音色链（主音色失败时依次尝试）
FALLBACK_VOICES = [
    "zh-CN-XiaoxiaoNeural",
    "zh-CN-YunxiNeural",
    "zh-CN-XiaobeiNeural",
]


class VolcTTS:
    """Edge TTS 服务 — 支持 SSML 语速/音量调节 + 备用音色链"""

    def __init__(self, app_id: str = "", api_key: str = "",
                 voice_type: str = "zh-CN-XiaoxiaoNeural",
                 cluster: str = "", cache_dir: str = 'tts_cache', retry: int = 2):
        self.voice = voice_type
        self.cache_dir = cache_dir
        self.retry = retry
        os.makedirs(cache_dir, exist_ok=True)

    def _get_cache_key(self, text: str, voice: str, emotion: Optional[str],
                       speed: float, volume: float) -> str:
        import hashlib
        key_str = f"{text}_{voice}_{emotion or ''}_{speed}_{volume}"
        return hashlib.md5(key_str.encode()).hexdigest()

    def _get_cache_path(self, text: str, voice: str, emotion: Optional[str],
                        speed: float, volume: float) -> str:
        return os.path.join(self.cache_dir,
                            f"{self._get_cache_key(text, voice, emotion, speed, volume)}.mp3")

    def _build_ssml(self, text: str, speed_ratio: float = 1.0,
                    volume_ratio: float = 1.0) -> str:
        """构建 SSML，支持语速和音量调节"""
        text = re.sub(r'[<>&]', lambda m: {'<': '&lt;', '>': '&gt;', '&': '&amp;'}[m.group()], text)
        rate = f"{speed_ratio * 100:.0f}%"
        volume = f"{volume_ratio * 100:.0f}%"
        return (
            f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" '
            f'xml:lang="zh-CN">'
            f'<prosody rate="{rate}" volume="{volume}">{text}</prosody>'
            f'</speak>'
        )

    def _synthesize_sync(self, text: str, voice: str, use_ssml: bool = False) -> Optional[bytes]:
        async def _async_synth():
            if use_ssml:
                communicate = edge_tts.Communicate(text, voice)
            else:
                communicate = edge_tts.Communicate(text, voice)
            audio_bytes = b""
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_bytes += chunk["data"]
            return audio_bytes

        try:
            return asyncio.run(_async_synth())
        except RuntimeError:
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(asyncio.run, _async_synth())
                return future.result(timeout=30)
        except Exception as e:
            logger.error(f"Edge TTS 合成失败: {e}")
            return None

    def _call_api(self, text: str, voice_type: str, emotion: Optional[str],
                  speed_ratio: float, volume_ratio: float) -> Optional[bytes]:
        voice = voice_type if voice_type else self.voice

        # 如果 speed 或 volume 需要调节，使用 SSML
        use_ssml = abs(speed_ratio - 1.0) > 0.01 or abs(volume_ratio - 1.0) > 0.01
        if use_ssml:
            text = self._build_ssml(text, speed_ratio, volume_ratio)

        for attempt in range(self.retry):
            audio_bytes = self._synthesize_sync(text, voice, use_ssml)
            if audio_bytes:
                return audio_bytes
            time.sleep(0.5)
        return None

    def _try_with_fallback(self, text: str, speed_ratio: float,
                           volume_ratio: float, emotion: Optional[str]) -> Optional[bytes]:
        """主音色 + 备用音色链依次尝试"""
        voices_to_try = [self.voice]
        for v in FALLBACK_VOICES:
            if v not in voices_to_try:
                voices_to_try.append(v)

        for voice in voices_to_try:
            logger.info(f"[TTS] 尝试音色: {voice}")
            result = self._call_api(text, voice, emotion, speed_ratio, volume_ratio)
            if result:
                if voice != self.voice:
                    logger.info(f"[TTS] 主音色失败，已切换到备用音色: {voice}")
                return result
            logger.warning(f"[TTS] 音色 {voice} 失败，尝试下一个...")
        return None

    def synthesize(self, text: str, voice_type: Optional[str] = None,
                   speed_ratio: float = 0.9, volume_ratio: float = 1.0,
                   emotion: Optional[str] = None) -> Optional[bytes]:
        if not text:
            return None
        voice = voice_type or self.voice

        cache_path = self._get_cache_path(text, voice, emotion, speed_ratio, volume_ratio)
        if os.path.exists(cache_path):
            try:
                with open(cache_path, 'rb') as f:
                    audio = f.read()
                    logger.info(f"[TTS] 命中缓存: {cache_path}, 大小={len(audio)}")
                    return audio
            except Exception as e:
                logger.warning(f"读取缓存失败: {e}")

        logger.info(f"[TTS] 未命中缓存，调用 Edge TTS: voice={voice}, "
                    f"speed={speed_ratio}, vol={volume_ratio}")
        audio_bytes = self._try_with_fallback(text, speed_ratio, volume_ratio, emotion)
        if audio_bytes:
            try:
                with open(cache_path, 'wb') as f:
                    f.write(audio_bytes)
                logger.info(f"[TTS] 已写入缓存: {cache_path}")
            except Exception as e:
                logger.warning(f"写入缓存失败: {e}")
        return audio_bytes
