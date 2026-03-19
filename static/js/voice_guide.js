/**
 * 语音指导模块 - 支持语音播报和语音识别
 * 使用方法：
 *   VoiceGuide.speak(text)                // 播报文本
 *   VoiceGuide.toggleListening(callback)  // 切换语音识别状态，传入回调处理指令
 *   VoiceGuide.stopListening()            // 停止监听
 */
const VoiceGuide = (function() {
    // ----- 语音播报部分 -----
    let synthesis = window.speechSynthesis;
    let utterance = null;

    // 默认播报配置
    const speakDefaults = {
        lang: 'zh-CN',
        pitch: 1.0,
        rate: 1.0,
        volume: 1.0
    };

    // 防抖：避免短时间重复朗读相同文本
    let lastSpokenText = '';
    let lastSpokenTime = 0;
    const DEBOUNCE_INTERVAL = 2000;

    function checkSpeechSupport() {
        if (!window.speechSynthesis) {
            console.warn('浏览器不支持 Web Speech API，语音播报不可用');
            return false;
        }
        return true;
    }

    function speak(text, options = {}) {
        if (!checkSpeechSupport()) return;
        if (!text) return;

        // 防抖处理
        const now = Date.now();
        if (text === lastSpokenText && now - lastSpokenTime < DEBOUNCE_INTERVAL) {
            console.log(`[语音防抖] 忽略重复文本: "${text}"`);
            return;
        }

        // 取消当前播报
        if (synthesis.speaking) {
            synthesis.cancel();
        }

        const config = { ...speakDefaults, ...options };
        utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = config.lang;
        utterance.pitch = config.pitch;
        utterance.rate = config.rate;
        utterance.volume = config.volume;

        // 选择中文语音
        const voices = synthesis.getVoices();
        const zhVoice = voices.find(v => v.lang.includes('zh') || v.lang.includes('cmn'));
        if (zhVoice) utterance.voice = zhVoice;

        utterance.onend = () => {
            lastSpokenText = text;
            lastSpokenTime = Date.now();
        };

        synthesis.speak(utterance);
    }

    // ----- 语音识别部分 -----
    let recognition = null;
    let isListening = false;
    let onCommandCallback = null;

    function initRecognition(callback) {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            console.warn('浏览器不支持语音识别');
            return false;
        }
        recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'zh-CN';

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            console.log('识别结果：', transcript);
            if (onCommandCallback) {
                onCommandCallback(transcript);
            }
        };

        recognition.onerror = (event) => {
            console.error('语音识别错误', event.error);
        };

        recognition.onend = () => {
            isListening = false;
            updateUI(false);
        };

        return true;
    }

    function startListening(callback) {
        if (!recognition) {
            if (!initRecognition(callback)) return;
        }
        onCommandCallback = callback;
        try {
            recognition.start();
            isListening = true;
            updateUI(true);
        } catch (e) {
            console.error('启动语音识别失败', e);
        }
    }

    function stopListening() {
        if (recognition && isListening) {
            recognition.stop();
            isListening = false;
            updateUI(false);
        }
    }

    function toggleListening(callback) {
        if (isListening) {
            stopListening();
        } else {
            startListening(callback);
        }
    }

    // 更新UI（如果页面有语音按钮）
    function updateUI(listening) {
        const btn = document.getElementById('voice-toggle');
        const status = document.getElementById('voice-status');
        if (btn) {
            btn.textContent = listening ? '🔴 关闭语音' : '🎤 开启语音遥控';
            btn.classList.toggle('listening', listening);
        }
        if (status) {
            status.textContent = listening ? '聆听中...' : '';
        }
    }

    // 预加载语音列表（部分浏览器需要）
    if (checkSpeechSupport() && synthesis.getVoices().length === 0) {
        synthesis.addEventListener('voiceschanged', () => {});
    }

    return {
        speak,
        stopListening,
        toggleListening
    };
})();

// 暴露全局变量
window.VoiceGuide = VoiceGuide;