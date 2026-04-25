// ==================== YIN 基频检测算法 (优化版) ====================
class YINTuner {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.isActive = false;
        this.animationFrame = null;
        this.onPitchDetected = null;

        this.stringFreqs = {
            1: 329.63, 2: 246.94, 3: 196.00, 4: 146.83, 5: 110.00, 6: 82.41
        };

        // 平滑滤波
        this.smoothedCents = 0;
        this.smoothingFactor = 0.3;

        // 准确计数
        this.accurateCount = 0;
        this.requiredAccurate = 5;

        // 无信号超时
        this.lastValidTime = 0;
        this.timeoutDuration = 5000;
        this.noSignalTimer = null;

        // 音量自适应阈值
        this.rmsThreshold = 500;

        // 自动模式暂停（0.5秒）
        this.isPaused = false;
        this.pauseTimer = null;
    }

    async start(stringNumber, callback) {
        if (this.isActive) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
            await this.audioContext.resume();

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.microphone.connect(this.analyser);

            this.isActive = true;
            this.onPitchDetected = callback;
            this.targetString = stringNumber;
            this.smoothedCents = 0;
            this.accurateCount = 0;
            this.lastValidTime = Date.now();
            this.startNoSignalCheck();

            this.detectLoop();
        } catch (err) {
            console.error('麦克风访问失败:', err);
            alert('无法访问麦克风，请确保已授予权限并连接了麦克风。');
        }
    }

    stop() {
        this.isActive = false;
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        if (this.microphone) {
            this.microphone.disconnect();
            this.microphone = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        // 清除暂停
        this.isPaused = false;
        if (this.pauseTimer) {
            clearTimeout(this.pauseTimer);
            this.pauseTimer = null;
        }
        if (this.noSignalTimer) {
            clearTimeout(this.noSignalTimer);
            this.noSignalTimer = null;
        }
    }

    startNoSignalCheck() {
        if (this.noSignalTimer) clearTimeout(this.noSignalTimer);
        this.noSignalTimer = setTimeout(() => {
            if (this.isActive && Date.now() - this.lastValidTime > this.timeoutDuration) {
                this.onPitchDetected(null, null, 'noSignal', false, 0);
            }
        }, this.timeoutDuration);
    }

    restartNoSignalCheck() {
        if (this.noSignalTimer) clearTimeout(this.noSignalTimer);
        this.noSignalTimer = setTimeout(() => {
            if (this.isActive && Date.now() - this.lastValidTime > this.timeoutDuration) {
                this.onPitchDetected(null, null, 'noSignal', false, 0);
            }
        }, this.timeoutDuration);
    }

    detectLoop() {
        if (!this.isActive) return;

        // 暂停期间跳过检测，但继续循环（不释放麦克风）
        if (this.isPaused) {
            this.animationFrame = requestAnimationFrame(() => this.detectLoop());
            return;
        }

        const buffer = new Float32Array(this.analyser.fftSize);
        this.analyser.getFloatTimeDomainData(buffer);

        // 计算RMS (音量)
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
        const rms = Math.sqrt(sum / buffer.length) * 32768;

        // 动态调整阈值
        if (rms > this.rmsThreshold * 1.5) {
            this.rmsThreshold = rms * 0.7;
        }

        let pitch = null;
        if (rms > this.rmsThreshold) {
            pitch = this.yin(buffer, this.audioContext.sampleRate);
        }

        if (pitch) {
            this.lastValidTime = Date.now();
            this.restartNoSignalCheck();

            const targetFreq = this.stringFreqs[this.targetString];
            const cents = 1200 * Math.log2(pitch / targetFreq);

            // 指数移动平均平滑
            this.smoothedCents = this.smoothedCents * (1 - this.smoothingFactor) + cents * this.smoothingFactor;

            // 检查是否准确 (±8音分)
            const isAccurate = Math.abs(this.smoothedCents) <= 8;
            if (isAccurate) {
                this.accurateCount++;
            } else {
                this.accurateCount = 0;
            }

            const fire = this.accurateCount >= this.requiredAccurate;
            if (this.onPitchDetected) this.onPitchDetected(pitch, this.smoothedCents, 'valid', fire, rms);
        } else {
            if (this.onPitchDetected) this.onPitchDetected(null, null, 'invalid', false, rms);
        }

        this.animationFrame = requestAnimationFrame(() => this.detectLoop());
    }

    // YIN 算法核心
    yin(buffer, sampleRate) {
        const threshold = 0.1;
        const minFreq = 60;
        const maxFreq = 400;
        const maxLag = Math.floor(sampleRate / minFreq);
        const minLag = Math.floor(sampleRate / maxFreq);

        let lag = null;
        let prevDiff = 0;

        for (let tau = minLag; tau < maxLag; tau++) {
            let numerator = 0;
            let denominator = 0;
            for (let i = 0; i < maxLag; i++) {
                if (i + tau < buffer.length) {
                    const diff = buffer[i] - buffer[i + tau];
                    numerator += diff * diff;
                    denominator += buffer[i] * buffer[i] + buffer[i + tau] * buffer[i + tau];
                }
            }
            if (denominator === 0) continue;
            const cm = numerator / denominator * 2;

            if (tau > minLag && cm < threshold) {
                const betterTau = tau - 0.5 * (cm - prevDiff) / ((cm + prevDiff) - 2 * cm);
                lag = betterTau;
                break;
            }
            prevDiff = cm;
        }

        if (lag) {
            const freq = sampleRate / lag;
            if (freq >= minFreq && freq <= maxFreq) return freq;
        }
        return null;
    }
}

// ==================== 页面逻辑 ====================
let currentString = 1;
let isTuning = false;
let tuner = new YINTuner();

// 语音相关
let lastSpokenGuide = '';
let lastVoiceTime = 0;
const voiceCooldown = 2000;

// DOM 元素
const needle = document.getElementById('pitch-needle');
const deviationEl = document.getElementById('deviation');
const guideEl = document.getElementById('guide');
const startBtn = document.getElementById('start-tuning');
const fireworksDiv = document.getElementById('fireworks');
const waveCircle = document.getElementById('wave-circle');
const vibrateString = document.getElementById('vibrate-string');
const volumeBar = document.getElementById('volume-bar');
const trendChart = document.getElementById('trend-chart');
const autoModeToggle = document.getElementById('auto-mode-toggle');
const gaugeCenterNumber = document.getElementById('gauge-center-number');

// 图表相关
let centsHistory = [];
const maxHistory = 10;
let autoMode = false;

// 烟花粒子
function createFirework() {
    fireworksDiv.style.display = 'block';
    for (let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        p.className = 'firework-particle';
        const angle = Math.random() * 2 * Math.PI;
        const distance = Math.random() * 150 + 50;
        const dx = Math.cos(angle) * distance;
        const dy = Math.sin(angle) * distance;
        p.style.setProperty('--dx', dx + 'px');
        p.style.setProperty('--dy', dy + 'px');
        p.style.left = Math.random() * 100 + '%';
        p.style.top = Math.random() * 100 + '%';
        p.style.background = `hsl(${Math.random() * 60 + 30}, 100%, 60%)`;
        fireworksDiv.appendChild(p);
        setTimeout(() => p.remove(), 1000);
    }
    setTimeout(() => fireworksDiv.style.display = 'none', 1000);
}

// 绘制偏差趋势图
function drawTrendChart() {
    trendChart.innerHTML = '';
    centsHistory.forEach(cents => {
        const bar = document.createElement('div');
        bar.className = 'trend-bar';
        const height = Math.min(100, Math.abs(cents) * 3);
        bar.style.height = height + '%';
        if (cents > 0) bar.classList.add('positive');
        else if (cents < 0) bar.classList.add('negative');
        trendChart.appendChild(bar);
    });
}

// 切换弦
document.querySelectorAll('.string-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        if (isTuning) {
            tuner.stop();
            isTuning = false;
            startBtn.textContent = '开始调这根弦';
            startBtn.classList.remove('tuning');
            vibrateString.classList.remove('vibrating');
            VoiceGuide.stop();
        }
        document.querySelectorAll('.string-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentString = parseInt(this.dataset.string);
        const note = ['E','B','G','D','A','E'][currentString-1];
        document.getElementById('current-string').textContent = `${currentString}弦 (${note})`;

        // 重置UI
        needle.style.left = '50%';
        deviationEl.textContent = '当前偏差：0 音分';
        gaugeCenterNumber.textContent = '0';
        guideEl.textContent = '音调准确 ✅';
        guideEl.style.color = '';
        lastSpokenGuide = '';
        centsHistory = [];
        drawTrendChart();
    });
});

// 自动模式开关
autoModeToggle.addEventListener('change', function() {
    autoMode = this.checked;
    if (autoMode) {
        // 如果当前未调音，自动开始
        if (!isTuning) {
            startBtn.click();
        }
        // 语音提示
        VoiceGuide.speak('自动模式已开启', { rate: 0.9 });
    } else {
        // 关闭自动模式，清除可能存在的暂停
        tuner.isPaused = false;
        if (tuner.pauseTimer) {
            clearTimeout(tuner.pauseTimer);
            tuner.pauseTimer = null;
        }
        // 如果仍在调音状态，保持继续（不强制停）
    }
});

// 开始/停止调音按钮
startBtn.addEventListener('click', function() {
    if (!isTuning) {
        // 开始调音
        tuner.start(currentString, (freq, cents, status, fire, rms) => {
            // 更新音量条
            const volumePercent = Math.min(100, (rms / 5000) * 100);
            volumeBar.style.width = volumePercent + '%';

            if (status === 'valid') {
                // 指针位置
                let leftPercent = 50 + (cents / 50) * 25;
                leftPercent = Math.max(0, Math.min(100, leftPercent));
                needle.style.left = leftPercent + '%';

                deviationEl.textContent = `当前偏差：${cents.toFixed(1)} 音分`;
                gaugeCenterNumber.textContent = cents.toFixed(0);

                // 更新趋势图
                centsHistory.push(cents);
                if (centsHistory.length > maxHistory) centsHistory.shift();
                drawTrendChart();

                // 指导文本与语音
                let guideText = '';
                let voiceText = '';

                if (fire) {
                    guideText = '音调准确 ✅ 恭喜！';
                    voiceText = '音调准确，恭喜';
                    createFirework();
                    tuner.accurateCount = 0; // 重置计数

                    if (autoMode) {
                        // 自动模式：暂停0.5秒后继续
                        tuner.isPaused = true;
                        guideText += ' (暂停中...)';
                        // 清除之前的定时器
                        if (tuner.pauseTimer) clearTimeout(tuner.pauseTimer);
                        tuner.pauseTimer = setTimeout(() => {
                            tuner.isPaused = false;
                            tuner.pauseTimer = null;
                            // 暂停结束后更新提示（如果仍在自动模式且激活）
                            if (autoMode && isTuning) {
                                guideEl.textContent = '继续检测...';
                            }
                        }, 500); // 0.5秒 = 烟花动画时间
                    } else {
                        // 常规模式：调准后自动停止
                        tuner.stop();
                        isTuning = false;
                        startBtn.textContent = '开始调这根弦';
                        startBtn.classList.remove('tuning');
                        vibrateString.classList.remove('vibrating');
                    }
                } else if (Math.abs(cents) <= 8) {
                    guideText = '音调准确 ✅';
                    voiceText = '音调准确';
                } else if (cents > 8) {
                    guideText = `音调偏高 ← 逆时针调${cents.toFixed(1)}音分`;
                    voiceText = '偏高';
                } else if (cents < -8) {
                    guideText = `音调偏低 → 顺时针调${Math.abs(cents).toFixed(1)}音分`;
                    voiceText = '偏低';
                }

                guideEl.textContent = guideText;
                const now = Date.now();
                if (voiceText && voiceText !== lastSpokenGuide && now - lastVoiceTime > voiceCooldown) {
                    VoiceGuide.speak(voiceText, { rate: 1.0, pitch: 1.0 });
                    lastSpokenGuide = voiceText;
                    lastVoiceTime = now;
                }

                // 激活动画（常规模式调准会stop，动画会被移除，所以仅在非停止时添加）
                if (isTuning) vibrateString.classList.add('vibrating');

                // 自动模式：匹配最近弦（无阈值）
                if (autoMode && freq) {
                    let minDiff = Infinity;
                    let matchedString = currentString;
                    for (let s in tuner.stringFreqs) {
                        const diff = Math.abs(freq - tuner.stringFreqs[s]);
                        if (diff < minDiff) {
                            minDiff = diff;
                            matchedString = parseInt(s);
                        }
                    }
                    // 只在匹配的弦与当前不同，且未暂停时切换
                    if (matchedString !== currentString && !tuner.isPaused) {
                        currentString = matchedString;
                        document.querySelectorAll('.string-btn').forEach(b => b.classList.remove('active'));
                        document.querySelector(`.string-btn[data-string="${currentString}"]`).classList.add('active');
                        const note = ['E','B','G','D','A','E'][currentString-1];
                        document.getElementById('current-string').textContent = `${currentString}弦 (${note})`;
                        VoiceGuide.speak(`请调${currentString}弦`, { rate: 0.9 });
                    }
                }
            } else if (status === 'invalid') {
                vibrateString.classList.remove('vibrating');
            } else if (status === 'noSignal') {
                guideEl.textContent = '⚠️ 没有检测到琴声，请拨动琴弦';
                guideEl.style.color = '#ffaa00';
                vibrateString.classList.remove('vibrating');
                const now = Date.now();
                if (lastSpokenGuide !== 'noSignal' && now - lastVoiceTime > voiceCooldown) {
                    VoiceGuide.speak('请拨动琴弦', { rate: 0.9 });
                    lastSpokenGuide = 'noSignal';
                    lastVoiceTime = now;
                }
            }
        });

        isTuning = true;
        startBtn.textContent = '停止调音';
        startBtn.classList.add('tuning');
        lastSpokenGuide = '';
    } else {
        // 停止调音
        tuner.stop();
        isTuning = false;
        startBtn.textContent = '开始调这根弦';
        startBtn.classList.remove('tuning');
        vibrateString.classList.remove('vibrating');
        needle.style.left = '50%';
        deviationEl.textContent = '当前偏差：0 音分';
        gaugeCenterNumber.textContent = '0';
        guideEl.textContent = '音调准确 ✅';
        guideEl.style.color = '';
        VoiceGuide.stop();
        lastSpokenGuide = '';
        volumeBar.style.width = '0%';
        centsHistory = [];
        drawTrendChart();
        // 即使关闭手动停止，自动模式仍保留开关状态，下次启动时自动模式继续生效
    }
});

// 初始化
drawTrendChart();