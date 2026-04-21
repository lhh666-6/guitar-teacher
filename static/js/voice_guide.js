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
    let desiredState = 'standby';
    let recognitionState = 'idle';
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

    const VOICE_GUIDE_ENABLED_KEY = 'voice_guide_enabled';

    // 图标元素
    let iconElement = null;

    // 配置
    const WAKE_WORD = '小吉他';
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

    function isVoiceGuideEnabled() {
        return localStorage.getItem(VOICE_GUIDE_ENABLED_KEY) !== '0';
    }

    function setVoiceGuideEnabled(enabled) {
        localStorage.setItem(VOICE_GUIDE_ENABLED_KEY, enabled ? '1' : '0');
    }

    function setDesiredState(state) {
        desiredState = state;
        isAwake = state === 'awake';
    }

    function syncListeningState() {
        isListening = recognitionState === 'starting' || recognitionState === 'listening' || recognitionState === 'stopping';
    }

    function clearSleepTimers() {
        if (wakeTimeout) clearTimeout(wakeTimeout);
        if (countdownTimer) clearTimeout(countdownTimer);
        wakeTimeout = null;
        countdownTimer = null;
    }

    function requestStandby(options = {}) {
        setDesiredState('standby');
        shouldAutoRestart = true;
        if (options.manual) setVoiceGuideEnabled(true);
        syncListeningState();
        updateIcon();
    }

    function requestOff(options = {}) {
        setDesiredState('off');
        shouldAutoRestart = false;
        clearSleepTimers();
        if (options.manual) setVoiceGuideEnabled(false);
        syncListeningState();
        updateIcon();
    }

    function toggleVoiceGuide() {
        if (desiredState === 'off') {
            requestStandby({ manual: true });
            startListening({ manual: true });
        } else {
            stopListening({ manual: true });
        }
    }

    // 动态注入图标样式（确保动画生效）
    function injectIconStyles() {
        if (document.getElementById('voice-guide-styles')) return;
        const style = document.createElement('style');
        style.id = 'voice-guide-styles';
        style.textContent = `
            @keyframes voiceGuidePulse {
                0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(231, 76, 60, 0.7); }
                70% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(231, 76, 60, 0); }
                100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(231, 76, 60, 0); }
            }

            #voice-guide-icon i {
                font-size: 24px;
                line-height: 1;
            }

            .voice-guide-icon-stack {
                position: relative;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }

            .voice-guide-dot {
                position: absolute;
                right: -2px;
                top: -1px;
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: #ffffff;
                border: 2px solid #e74c3c;
                box-shadow: 0 0 0 2px rgba(255,255,255,0.15);
            }
        `;
        document.head.appendChild(style);
    }

    // 创建悬浮图标
    function createIcon() {
        if (iconElement) return;
        iconElement = document.createElement('div');
        iconElement.id = 'voice-guide-icon';
        iconElement.innerHTML = '<i class="fas fa-microphone" aria-hidden="true"></i>';
        iconElement.title = '语音助手';
        iconElement.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background-color: #666;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 10000;
            transition: all 0.3s ease;
            opacity: 0.8;
        `;
        document.body.appendChild(iconElement);
        iconElement.addEventListener('click', () => {
            toggleVoiceGuide();
        });
        updateIcon();
    }

    function updateIcon() {
        if (!iconElement) return;
        if (!isListening) {
            iconElement.style.backgroundColor = '#999';
            iconElement.style.opacity = '0.5';
            iconElement.innerHTML = '<i class="fas fa-microphone-slash" aria-hidden="true"></i>';
            iconElement.title = '语音未启动，点击开启';
            iconElement.style.animation = 'none';
        } else if (isAwake) {
            iconElement.style.backgroundColor = '#e74c3c';
            iconElement.style.opacity = '1';
            iconElement.innerHTML = '<span class="voice-guide-icon-stack"><i class="fas fa-microphone" aria-hidden="true"></i><span class="voice-guide-dot" aria-hidden="true"></span></span>';
            iconElement.title = '唤醒中，点击关闭';
            iconElement.style.animation = 'voiceGuidePulse 1s infinite';
        } else {
            iconElement.style.backgroundColor = '#2ecc71';
            iconElement.style.opacity = '0.9';
            iconElement.innerHTML = '<i class="fas fa-microphone" aria-hidden="true"></i>';
            iconElement.title = '监听中，说“小吉他”唤醒';
            iconElement.style.animation = 'none';
        }
    }

    // ========== 音频播放队列 ==========
    function playNext() {
        if (isPlaying || audioQueue.length === 0) return;
        isPlaying = true;
        const item = audioQueue.shift();
        const audio = new Audio(item.url);
        const onEnded = () => {
            URL.revokeObjectURL(item.url);
            isPlaying = false;
            playNext();
        };
        audio.onended = onEnded;
        audio.onerror = onEnded;

        audio.play().catch(e => {
            if (e.name === 'NotAllowedError') {
                console.warn('自动播放被阻止，等待用户交互');
                audioQueue.unshift(item);
                isPlaying = false;
                if (!userInteracted) {
                    showStatus('🔊 点击页面任意位置启用语音');
                    const enablePlayback = () => {
                        userInteracted = true;
                        document.removeEventListener('click', enablePlayback);
                        showStatus('🎤 语音已启用');
                        playNext();
                    };
                    document.addEventListener('click', enablePlayback, { once: true });
                }
            } else {
                console.warn('音频播放失败', e);
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
        clearSleepTimers();
        wakeTimeout = setTimeout(() => sleep(), SLEEP_TIMEOUT);
        countdownTimer = setTimeout(() => {
            if (desiredState === 'awake') playTTS('请说出指令');
        }, SLEEP_TIMEOUT - 1000);
    }

    function wakeUp() {
        if (desiredState === 'awake') return;
        setDesiredState('awake');
        shouldAutoRestart = true;
        resetSleepTimer();
        playTTS('我在，请问有什么可以帮助您？');
        showStatus('✨ 已唤醒');
        updateIcon();
    }

    function sleep() {
        if (desiredState !== 'awake') return;
        requestStandby();
        clearSleepTimers();
        playTTS('需要帮助时请叫我小吉他');
        showStatus('😴 已休眠');
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
            playTTS('好的，需要时请说小吉他唤醒我');
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
            requestOff();
            showStatus('❌ 不支持语音识别');
            return false;
        }
        recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'zh-CN';

        recognition.onstart = () => {
            recognitionState = 'listening';
            syncListeningState();
            updateIcon();
        };

        recognition.onresult = (event) => {
            const text = event.results[event.results.length-1][0].transcript;
            console.log('[语音识别]', text);
            if (desiredState === 'awake') resetSleepTimer();
            if (desiredState !== 'awake' && text.includes(WAKE_WORD)) {
                wakeUp();
            } else if (desiredState === 'awake') {
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
                requestOff();
                recognitionState = 'idle';
                syncListeningState();
                showStatus('❌ 麦克风权限被拒绝，请点击下方按钮手动开启');
            } else if (e.error === 'network') {
                console.log('[语音识别] 网络错误，将在结束后按目标状态恢复');
            } else if (e.error === 'aborted') {
                console.log('[语音识别] 识别已中止');
            } else {
                console.log('[语音识别] 未知错误，将在结束后按目标状态恢复');
            }
        };

        recognition.onend = () => {
            console.log('[语音识别] 识别结束');
            recognitionState = 'idle';
            syncListeningState();
            if (desiredState === 'off' || window.closed) {
                showStatus('🎤 语音已关闭，请点击按钮开启');
                updateIcon();
                return;
            }
            showStatus('🎤 语音识别已启动，说“小吉他”唤醒');
            updateIcon();
            setTimeout(() => startListening(), RESTART_DELAY);
        };
        return true;
    }

    function startListening(options = {}) {
        if (!recognition && !initRecognition()) return;
        if (options.manual) requestStandby({ manual: true });
        if (desiredState === 'off') return;
        if (recognitionState !== 'idle') {
            syncListeningState();
            updateIcon();
            return;
        }
        try {
            recognitionState = 'starting';
            syncListeningState();
            recognition.start();
            shouldAutoRestart = true;
            showStatus('🎤 语音识别已启动，说“小吉他”唤醒');
            updateIcon();
        } catch (e) {
            console.error('启动语音识别失败', e);
            if (e.name === 'InvalidStateError') {
                recognitionState = 'listening';
                syncListeningState();
                updateIcon();
                return;
            }
            recognitionState = 'idle';
            syncListeningState();
            showStatus('❌ 启动失败，请检查麦克风权限');
            if (options.manual) requestOff({ manual: true });
            else requestOff();
        }
    }

    function stopListening(options = {}) {
        requestOff(options);
        if (recognitionState === 'idle') {
            showStatus('🎤 语音已关闭（需手动开启）');
            updateIcon();
            return;
        }
        if (!recognition) {
            recognitionState = 'idle';
            syncListeningState();
            showStatus('🎤 语音已关闭（需手动开启）');
            updateIcon();
            return;
        }
        if (recognitionState === 'stopping') {
            showStatus('🎤 语音正在关闭...');
            updateIcon();
            return;
        }
        recognitionState = 'stopping';
        syncListeningState();
        showStatus('🎤 语音正在关闭...');
        updateIcon();
        try {
            recognition.stop();
        } catch (e) {
            console.error('停止语音识别失败', e);
            recognitionState = 'idle';
            syncListeningState();
            showStatus('🎤 语音已关闭（需手动开启）');
            updateIcon();
        }
    }

    // ========== 公开 API ==========
    return {
        init() {
            injectIconStyles();  // 动态注入动画样式
            createIcon();        // 创建悬浮图标
            if (typeof io !== 'undefined') {
                socket = io();
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
            if (isVoiceGuideEnabled()) {
                requestStandby();
                startListening();
            } else {
                requestOff();
                recognitionState = 'idle';
                syncListeningState();
                updateIcon();
            }
            const toggleBtn = document.getElementById('voice-toggle');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', () => {
                    toggleVoiceGuide();
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
        // 暴露状态用于调试
        getStatus: () => ({ isListening, isAwake, shouldAutoRestart, desiredState, recognitionState })
    };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => VoiceGuide.init());
} else {
    VoiceGuide.init();
}