/**
 * 语音指导模块 - 基于 Web Speech API
 * 提供调音、教学等场景的语音提示功能
 * 使用方法：VoiceGuide.speak(text, options)
 */
const VoiceGuide = (function() {
    // 语音合成实例
    let synth = window.speechSynthesis;
    let utterance = null;

    // 默认配置
    const defaults = {
        lang: 'zh-CN',
        pitch: 1.0,          // 音调 0~2
        rate: 1.0,            // 语速 0.1~10
        volume: 1.0,
        onStart: null,
        onEnd: null,
        onError: null
    };

    // 防抖：避免连续重复朗读相同文本
    let lastSpokenText = '';
    let lastSpokenTime = 0;
    const DEBOUNCE_INTERVAL = 2000; // 2秒内不重复朗读相同内容

    // 初始化检查
    function checkSupport() {
        if (!window.speechSynthesis) {
            console.warn('当前浏览器不支持 Web Speech API，语音功能不可用');
            return false;
        }
        return true;
    }

    /**
     * 核心朗读方法
     * @param {string} text - 要朗读的文本
     * @param {object} options - 覆盖默认配置
     */
    function speak(text, options = {}) {
        if (!checkSupport()) return;

        // 防抖处理：相同文本且间隔过短则不重复
        const now = Date.now();
        if (text === lastSpokenText && now - lastSpokenTime < DEBOUNCE_INTERVAL) {
            console.log(`[语音防抖] 忽略重复文本: "${text}"`);
            return;
        }

        // 取消当前正在朗读的内容
        if (synth.speaking) {
            synth.cancel();
        }

        const config = { ...defaults, ...options };
        utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = config.lang;
        utterance.pitch = config.pitch;
        utterance.rate = config.rate;
        utterance.volume = config.volume;

        // 选择中文语音（优先）
        const voices = synth.getVoices();
        const zhVoice = voices.find(v => v.lang.includes('zh') || v.lang.includes('cmn'));
        if (zhVoice) utterance.voice = zhVoice;

        utterance.onstart = config.onStart;
        utterance.onend = () => {
            lastSpokenText = text;
            lastSpokenTime = Date.now();
            if (config.onEnd) config.onEnd();
        };
        utterance.onerror = config.onError;

        synth.speak(utterance);
    }

    /**
     * 立即停止当前朗读
     */
    function stop() {
        if (synth && synth.speaking) {
            synth.cancel();
        }
    }

    // 获取 voices 的异步处理（部分浏览器需要）
    if (checkSupport()) {
        if (synth.getVoices().length === 0) {
            synth.addEventListener('voiceschanged', () => {});
        }
    }

    return {
        speak,
        stop,
        checkSupport
    };
})();