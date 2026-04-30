/**
 * VoiceGuide - 全局语音助手（自动持续监听）
 * 功能：唤醒词持续监听、指令分发、TTS播放、音频队列、跨页面状态
 * 修改：手动关闭后不再自动重启，说“再见/拜拜”等词进入休眠
 */
const VoiceGuide = (function() {
    // ========== 私有变量 ==========
    let recognition = null;
    let isAwake = false;
    let isListening = false;
    let wakeTimeout = null;
    let countdownTimer = null;
    let socket = null;
    let currentPage = window.location.pathname;
    let sessionId = null;
    let actions = {};
    let pageCommands = {};
    let audioQueue = [];
    let isPlaying = false;
    let shouldAutoRestart = true;      // 默认自动重启
    let userInteracted = false;

    // 图标元素
    let iconElement = null;

    // 配置
    const WAKE_WORD = '小吉';
    const SLEEP_TIMEOUT = 10000;
    const RESTART_DELAY = 500;

    // 全局指令（内置跳转）
    const GLOBAL_COMMANDS = [
        { patterns: ['调音器'], action: 'navigate', params: { url: '/tuning' }, text: '前往调音器' },
        { patterns: ['历史'], action: 'navigate', params: { url: '/history' }, text: '前往历史记录' },
        { patterns: ['首页'], action: 'navigate', params: { url: '/' }, text: '返回首页' },
        { patterns: ['SOLO模式'], action: 'navigate', params: { url: '/solo' }, text: '进入 SOLO 模式' },
        { patterns: ['驾驶舱'], action: 'navigate', params: { url: '/teach' }, text: '进入教学驾驶舱' }
    ];

    // ========== 辅助函数 ==========
    function showStatus(msg) {
        console.log('[VoiceGuide]', msg);
        updateIcon();
    }

    // 动态注入图标样式
    function injectIconStyles() {
        if (document.getElementById('voice-guide-styles')) return;
        const style = document.createElement('style');
        style.id = 'voice-guide-styles';
        style.textContent = `
            @keyframes voiceGuidePulse {
                0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(46, 204, 113, 0.6); }
                70% { transform: scale(1.08); box-shadow: 0 0 0 14px rgba(46, 204, 113, 0); }
                100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(46, 204, 113, 0); }
            }
            @keyframes voiceGuideWake {
                0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(231, 76, 60, 0.7); }
                70% { transform: scale(1.12); box-shadow: 0 0 0 18px rgba(231, 76, 60, 0); }
                100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(231, 76, 60, 0); }
            }
            @keyframes voiceGuideEnter {
                from { opacity: 0; transform: translateX(20px) scale(0.8); }
                to { opacity: 1; transform: translateX(0) scale(1); }
            }
        `;
        document.head.appendChild(style);
    }

    // 创建悬浮图标
    function createIcon() {
        if (iconElement) return;
        iconElement = document.createElement('div');
        iconElement.id = 'voice-guide-icon';
        iconElement.title = '语音助手 · 点击开启';
        iconElement.style.cssText = `
            position: fixed;
            bottom: 28px;
            right: 28px;
            width: 64px;
            height: 64px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 26px;
            cursor: pointer;
            z-index: 10000;
            transition: all 0.4s cubic-bezier(0.2, 0.9, 0.4, 1);
            user-select: none;
            -webkit-tap-highlight-color: transparent;
            animation: voiceGuideEnter 0.5s cubic-bezier(0.2, 0.9, 0.4, 1) forwards;
        `;
        document.body.appendChild(iconElement);

        // 标签提示
        const label = document.createElement('span');
        label.id = 'voice-guide-label';
        label.textContent = '语音已关闭';
        label.style.cssText = `
            position: fixed;
            bottom: 36px;
            right: 100px;
            font-size: 13px;
            color: #999;
            background: rgba(0,0,0,0.7);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            padding: 4px 14px;
            border-radius: 20px;
            z-index: 10000;
            pointer-events: none;
            transition: all 0.4s ease;
            white-space: nowrap;
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            letter-spacing: 0.5px;
            opacity: 0;
            transform: translateX(10px);
        `;
        document.body.appendChild(label);

        iconElement.addEventListener('click', () => {
            if (isListening) {
                stopListening();
            } else {
                startListening();
            }
        });
        updateIcon();
    }

    function updateIcon() {
        if (!iconElement) return;
        const label = document.getElementById('voice-guide-label');
        if (!isListening) {
            iconElement.innerHTML = '🎤';
            iconElement.title = '语音助手 · 点击开启';
            iconElement.style.backgroundColor = 'rgba(80,80,80,0.75)';
            iconElement.style.backdropFilter = 'blur(8px)';
            iconElement.style.webkitBackdropFilter = 'blur(8px)';
            iconElement.style.boxShadow = '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)';
            iconElement.style.border = '1.5px solid rgba(255,255,255,0.12)';
            iconElement.style.opacity = '0.6';
            iconElement.style.animation = 'none';
            if (label) {
                label.textContent = '语音已关闭';
                label.style.color = '#999';
                label.style.opacity = '0';
                label.style.transform = 'translateX(10px)';
            }
        } else if (isAwake) {
            iconElement.innerHTML = '🎤';
            iconElement.title = '已唤醒 · 点击关闭';
            iconElement.style.backgroundColor = 'rgba(231,76,60,0.88)';
            iconElement.style.backdropFilter = 'blur(12px)';
            iconElement.style.webkitBackdropFilter = 'blur(12px)';
            iconElement.style.boxShadow = '0 0 24px rgba(231,76,60,0.5), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)';
            iconElement.style.border = '1.5px solid rgba(255,120,100,0.5)';
            iconElement.style.opacity = '1';
            iconElement.style.animation = 'voiceGuideWake 1s infinite';
            if (label) {
                label.textContent = '已唤醒 · 请说话';
                label.style.color = '#ff6b6b';
                label.style.opacity = '1';
                label.style.transform = 'translateX(0)';
            }
        } else {
            iconElement.innerHTML = '🎤';
            iconElement.title = '监听中 · 说”小吉”唤醒';
            iconElement.style.backgroundColor = 'rgba(46,204,113,0.82)';
            iconElement.style.backdropFilter = 'blur(10px)';
            iconElement.style.webkitBackdropFilter = 'blur(10px)';
            iconElement.style.boxShadow = '0 0 20px rgba(46,204,113,0.35), 0 4px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)';
            iconElement.style.border = '1.5px solid rgba(100,230,150,0.4)';
            iconElement.style.opacity = '0.95';
            iconElement.style.animation = 'voiceGuidePulse 2.5s infinite';
            if (label) {
                label.textContent = '说”小吉”唤醒';
                label.style.color = '#4ecb71';
                label.style.opacity = '1';
                label.style.transform = 'translateX(0)';
            }
        }
    }

    // ========== 音频播放队列 ==========
    let currentAudio = null; // 追踪当前播放的音频

    function playNext() {
        if (isPlaying || audioQueue.length === 0) return;
        isPlaying = true;
        const item = audioQueue.shift();
        const audio = new Audio(item.url);
        currentAudio = audio;
        const onEnded = () => {
            URL.revokeObjectURL(item.url);
            isPlaying = false;
            currentAudio = null;
            playNext();
        };
        audio.onended = onEnded;
        audio.onerror = onEnded;

        audio.play().catch(e => {
            if (e.name === 'NotAllowedError') {
                console.warn('[TTS] 自动播放被阻止，等待用户交互');
                audioQueue.unshift(item);
                isPlaying = false;
                userInteracted = false; // 需要新的用户交互
                showStatus('点击页面任意位置以启用语音播报');
                const enablePlayback = () => {
                    userInteracted = true;
                    document.removeEventListener('click', enablePlayback);
                    showStatus('语音已启用');
                    playNext();
                };
                document.addEventListener('click', enablePlayback, { once: true });
            } else {
                console.warn('[TTS] 音频播放失败', e);
                URL.revokeObjectURL(item.url);
                isPlaying = false;
                playNext();
            }
        });
    }

    function enqueueAudio(blob) {
        const url = URL.createObjectURL(blob);
        audioQueue.push({ url });
        playNext();
    }

    function stopSpeaking() {
        audioQueue = [];
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }
        isPlaying = false;
    }

    // ========== TTS 播放 ==========
    function playTTS(text, options = {}) {
        if (!text) return;
        console.log('[TTS] 请求合成:', text);
        fetch('/api/tts/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, emotion: options.emotion })
        })
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.blob();
        })
        .then(blob => {
            console.log('[TTS] 音频大小:', blob.size, 'bytes');
            enqueueAudio(blob);
        })
        .catch(err => {
            console.error('[TTS] 后端合成失败:', err);
        });
    }

    function playAudioBase64(base64, mime = 'audio/mpeg') {
        if (!base64) return;
        try {
            const byteChars = atob(base64);
            const byteArrays = [];
            for (let i = 0; i < byteChars.length; i++) {
                byteArrays.push(byteChars.charCodeAt(i));
            }
            const blob = new Blob([new Uint8Array(byteArrays)], { type: mime });
            enqueueAudio(blob);
        } catch (e) {
            console.error('[TTS] base64 解码失败', e);
        }
    }

    // ========== 唤醒与休眠 ==========
    function resetSleepTimer() {
        if (wakeTimeout) clearTimeout(wakeTimeout);
        if (countdownTimer) clearTimeout(countdownTimer);
        wakeTimeout = setTimeout(() => sleep(), SLEEP_TIMEOUT);
        countdownTimer = setTimeout(() => {
            if (isAwake) playTTS('请说出指令');
        }, SLEEP_TIMEOUT - 1000);
    }

    function wakeUp() {
        if (isAwake) return;
        isAwake = true;
        resetSleepTimer();
        playTTS('我在，请问有什么可以帮助您？');
        showStatus('✨ 已唤醒');
        updateIcon();
    }

    function sleep() {
        if (!isAwake) return;
        isAwake = false;
        if (wakeTimeout) clearTimeout(wakeTimeout);
        if (countdownTimer) clearTimeout(countdownTimer);
        showStatus('已休眠');
        updateIcon();
    }

    // ========== 通用动作处理 ==========
    function handleGenericAction(result) {
        const action = result.action;
        const params = result.params || {};
        const genericActions = {
            'read_advice': () => {
                const adviceEl = document.querySelector('#advice-card .advice-text, .advice-card .advice-text');
                if (adviceEl && adviceEl.innerText && !adviceEl.innerText.includes('点击“生成智能指导”')) {
                    playTTS(adviceEl.innerText);
                } else {
                    playTTS('还没有智能指导，请先生成一条建议');
                }
            },
            'generate_advice': () => {
                const btn = document.getElementById('generate-advice-btn');
                if (btn) btn.click();
            },
            'show_radar': () => {
                if (window.showRadarChart) window.showRadarChart();
                else {
                    const radarBtn = document.querySelector('[data-action="show-radar"]');
                    if (radarBtn) radarBtn.click();
                }
            },
            'show_progress': () => {
                if (window.showProgressChart) window.showProgressChart();
                else {
                    const progressBtn = document.querySelector('[data-action="show-progress"]');
                    if (progressBtn) progressBtn.click();
                }
            },
            'goto_solo': () => {
                if (params.chord) {
                    window.location.href = `/solo?chord=${encodeURIComponent(params.chord)}`;
                } else {
                    window.location.href = '/solo';
                }
            },
            'select_string': () => {
                const stringNum = params.string;
                if (stringNum) {
                    if (window.selectString) window.selectString(stringNum);
                    else {
                        const stringBtn = document.querySelector(`[data-string="${stringNum}"]`);
                        if (stringBtn) stringBtn.click();
                    }
                }
            },
            'start_tuning': () => {
                if (window.startTuning) window.startTuning();
                else {
                    const startBtn = document.querySelector('[data-action="start-tuning"]');
                    if (startBtn) startBtn.click();
                }
            },
            'stop_tuning': () => {
                if (window.stopTuning) window.stopTuning();
                else {
                    const stopBtn = document.querySelector('[data-action="stop-tuning"]');
                    if (stopBtn) stopBtn.click();
                }
            },
            'auto_mode': () => {
                const enable = params.enable;
                if (window.setAutoMode) window.setAutoMode(enable);
                else {
                    const autoBtn = document.querySelector(`[data-action="auto-mode"][data-enable="${enable}"]`);
                    if (autoBtn) autoBtn.click();
                }
            }
        };
        const handler = genericActions[action];
        if (handler) {
            handler();
        } else {
            console.warn('没有找到通用处理方式，动作:', action);
        }
    }

    // ========== 指令匹配与执行 ==========
    function matchCommand(text, commands) {
        for (const cmd of commands) {
            for (const pattern of cmd.patterns) {
                if (typeof pattern === 'string') {
                    if (text.includes(pattern)) {
                        return { action: cmd.action, params: cmd.params || {}, text: cmd.text };
                    }
                } else if (pattern instanceof RegExp) {
                    const match = text.match(pattern);
                    if (match) {
                        let params = cmd.params || {};
                        if (cmd.extract) params = { ...params, ...cmd.extract(match) };
                        return { action: cmd.action, params, text: cmd.text };
                    }
                }
            }
        }
        return null;
    }

    function executeAction(result) {
        if (!result) return;
        if (result.action === 'navigate' && result.params.url) {
            window.location.href = result.params.url;
            return;
        }
        const callback = actions[result.action];
        if (callback) {
            callback(result.params);
        } else {
            handleGenericAction(result);
        }
        if (result.text) playTTS(result.text);
    }

    function handleCommand(text) {
        console.log('[指令处理]', text);
        // 🔥 扩展结束语：再见、拜拜、晚安、退下等触发休眠
        if (text.includes('谢谢') || text.includes('结束') || text.includes('再见') || text.includes('拜拜') || text.includes('晚安') || text.includes('退下')) {
            sleep();
            playTTS('好的，需要时请说小吉唤醒我');
            return;
        }

        const pageCmds = pageCommands[currentPage] || [];
        let result = matchCommand(text, pageCmds);
        if (!result) result = matchCommand(text, GLOBAL_COMMANDS);
        if (!result) {
            if (socket && socket.connected) {
                playTTS('请稍等');
                resetSleepTimer();
                socket.emit('voice_command', { command: text, page: currentPage, session_id: sessionId });
                showStatus('🎙️ 处理中...');
            } else {
                console.warn('[VoiceGuide] Socket未连接，无法发送指令');
            }
            return;
        }
        executeAction(result);
    }

    // ========== 后端响应 ==========
    function onVoiceResponse(data) {
        console.log('[后端响应]', data);
        if (data.action) {
            executeAction({ action: data.action, params: data, text: data.text });
        } else if (data.audio_base64) {
            playAudioBase64(data.audio_base64);
        } else if (data.text) {
            playTTS(data.text);
        }
    }

    // ========== 语音识别 ==========
    function initRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            console.warn('不支持语音识别');
            showStatus('❌ 不支持语音识别');
            return false;
        }
        recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'zh-CN';
        
        recognition.onresult = (event) => {
            const text = event.results[event.results.length-1][0].transcript;
            console.log('[语音识别]', text);
            if (isAwake) resetSleepTimer();
            if (!isAwake && text.includes(WAKE_WORD)) {
                wakeUp();
                // 提取唤醒词后面的指令部分
                const idx = text.indexOf(WAKE_WORD);
                const cmd = text.substring(idx + WAKE_WORD.length).trim();
                if (cmd) {
                    setTimeout(() => handleCommand(cmd), 1500);
                }
            } else if (isAwake) {
                handleCommand(text);
            }
        };
        
        recognition.onerror = (e) => {
            if (e.error === 'no-speech') {
                console.log('[语音识别] 无语音输入，继续监听');
                return;
            }
            console.error('[语音识别] 错误:', e.error, e);
            if (e.error === 'not-allowed') {
                shouldAutoRestart = false;
                stopListening();
                showStatus('❌ 麦克风权限被拒绝，请点击下方按钮手动开启');
            } else if (e.error === 'network') {
                console.log('[语音识别] 网络错误，将尝试重启');
            } else if (e.error === 'aborted') {
                shouldAutoRestart = false;
            } else {
                console.log('[语音识别] 未知错误，尝试重启');
            }
        };
        
        recognition.onend = () => {
            console.log('[语音识别] 识别结束');
            if (shouldAutoRestart && !window.closed) {
                // 自动重启：静默恢复，不闪 UI
                setTimeout(() => {
                    isListening = false;
                    try {
                        recognition.start();
                        isListening = true;
                    } catch(e) {
                        console.warn('[语音识别] 自动重启失败:', e.name);
                        updateIcon();
                    }
                }, RESTART_DELAY);
            } else {
                isListening = false;
                showStatus('语音已关闭，请点击按钮开启');
                updateIcon();
            }
        };
        return true;
    }

    function startListening() {
        if (!recognition && !initRecognition()) return;
        if (isListening) return;
        try {
            recognition.start();
            isListening = true;
            shouldAutoRestart = true;   // 手动开启时恢复自动重启标志
            userInteracted = true;       // 标记用户已交互，允许音频播放
            // 预解锁音频：播放静音以获取播放权限
            const unlockAudio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA");
            unlockAudio.play().then(() => { unlockAudio.pause(); }).catch(() => {});
            showStatus('语音识别已启动，说"小吉"唤醒');
            updateIcon();
        } catch (e) {
            console.error('启动语音识别失败', e);
            if (e.name === 'InvalidStateError') {
                isListening = true;
            } else {
                showStatus('启动失败，请检查麦克风权限');
                shouldAutoRestart = false;
            }
        }
    }

    function stopListening() {
        shouldAutoRestart = false;
        if (recognition && isListening) {
            try { recognition.stop(); } catch(e) {
                isListening = false;
                updateIcon();
            }
        } else {
            isListening = false;
            updateIcon();
        }
    }

    // ========== 公开 API ==========
    return {
        init() {
            injectIconStyles();  // 动态注入动画样式
            createIcon();        // 创建悬浮图标（默认关闭，点击开启）
            if (typeof io !== 'undefined') {
                socket = io("https://www.hnuguitarteacher.xyz", { transports: ['websocket'] });
                socket.on('voice_response', onVoiceResponse);
                socket.on('connect_error', (err) => {
                    console.warn('[VoiceGuide] Socket连接错误:', err);
                });
            } else {
                console.warn('[VoiceGuide] Socket.IO 客户端未加载，语音指令将无法发送');
            }
            sessionId = localStorage.getItem('voice_session_id');
            if (!sessionId) {
                sessionId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
                localStorage.setItem('voice_session_id', sessionId);
            }
            // 默认不自动开启，用户点击图标手动开启
            const toggleBtn = document.getElementById('voice-toggle');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', () => {
                    if (isListening) stopListening();
                    else startListening();
                });
            }
        },
        registerAction(actionName, callback) {
            actions[actionName] = callback;
        },
        registerPageCommands(pagePath, commands) {
            pageCommands[pagePath] = commands;
        },
        wakeUp,
        sleep,
        speak: playTTS,
        stop: stopSpeaking,
        isEnabled: () => isListening,
        // 暴露状态用于调试
        getStatus: () => ({ isListening, isAwake, shouldAutoRestart })
    };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => VoiceGuide.init());
} else {
    VoiceGuide.init();
}