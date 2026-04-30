/**
 * 吉他调音器 — YIN 标准算法 + AudioContext 复用
 * 标准 CMNDF + 抛物线插值，±2 音分精度
 */
class YINTuner {
    constructor() {
        this.audioContext = null;
        this.mediaStream = null;
        this.analyser = null;
        this.isActive = false;
        this.animationFrame = null;
        this.onPitchDetected = null;

        this.stringFreqs = {
            1: 329.63, 2: 246.94, 3: 196.00, 4: 146.83, 5: 110.00, 6: 82.41
        };

        this.smoothedCents = 0;
        this.smoothingFactor = 0.3;
        this.accurateCount = 0;
        this.requiredAccurate = 5;

        this.lastValidTime = 0;
        this.timeoutDuration = 5000;
        this.noSignalTimer = null;

        // 动态 RMS 阈值（带衰减）
        this.rmsThreshold = 500;
        this.rmsFloor = 200;

        // 调音成功锁定 & 自动模式暂停
        this.tuningSuccess = false;
        this.isPaused = false;
        this.pauseTimer = null;
    }

    async start(stringNumber, callback) {
        if (this.isActive) return;
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

            if (!this.audioContext || this.audioContext.state === 'closed') {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                this.audioContext = new AudioContext();
            }

            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            source.connect(this.analyser);

            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            this.isActive = true;
            this.onPitchDetected = callback;
            this.targetString = stringNumber;
            this.smoothedCents = 0;
            this.accurateCount = 0;
            this.lastValidTime = Date.now();
            this.rmsThreshold = 500;
            this.tuningSuccess = false;
            this.isPaused = false;

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
        if (this.analyser) { this.analyser.disconnect(); this.analyser = null; }
        if (this.mediaStream) { this.mediaStream.getTracks().forEach(t => t.stop()); this.mediaStream = null; }
        if (this.audioContext && this.audioContext.state !== 'closed') {
            try { this.audioContext.suspend(); } catch (e) { /* 忽略 */ }
        }
        this.isPaused = false;
        if (this.pauseTimer) { clearTimeout(this.pauseTimer); this.pauseTimer = null; }
        if (this.noSignalTimer) { clearTimeout(this.noSignalTimer); this.noSignalTimer = null; }
        this.tuningSuccess = false;
    }

    destroy() {
        this.stop();
        if (this.audioContext) { this.audioContext.close(); this.audioContext = null; }
    }

    // ========== 标准 YIN 算法（CMNDF + 抛物线插值） ==========
    yin(buffer, sampleRate) {
        const threshold = 0.15;
        const minFreq = 60;
        const maxFreq = 400;
        const maxLag = Math.min(Math.floor(buffer.length / 2), Math.floor(sampleRate / minFreq));
        const minLag = Math.floor(sampleRate / maxFreq);

        const W = maxLag; // 窗宽 = lag 上限，保证全部 τ 有足量样本
        const diff = new Float32Array(maxLag);

        // Step 1: 差值函数 d(τ) = Σ(x_j - x_{j+τ})²
        for (let tau = 0; tau < maxLag; tau++) {
            let sum = 0;
            for (let j = 0; j < W && j + tau < buffer.length; j++) {
                const delta = buffer[j] - buffer[j + tau];
                sum += delta * delta;
            }
            diff[tau] = sum;
        }

        // Step 2: 累积均值归一化差值 d'(τ) = d(τ) / ((1/τ) * Σ d(j))
        const cmndf = new Float32Array(maxLag);
        cmndf[0] = 1;
        let runningSum = 0;
        for (let tau = 0; tau < maxLag; tau++) {
            runningSum += diff[tau];
            cmndf[tau] = tau > 0 ? diff[tau] * tau / runningSum : 1;
        }

        // Step 3: 找第一个低于阈值的 τ（向下搜索局部最小值）
        let tauEstimate = -1;
        for (let tau = minLag; tau < maxLag - 1; tau++) {
            if (cmndf[tau] < threshold) {
                while (tau + 1 < maxLag && cmndf[tau + 1] < cmndf[tau]) {
                    tau++;
                }
                tauEstimate = tau;
                break;
            }
        }
        if (tauEstimate < 0) return null;

        // Step 4: 抛物线插值（亚采样精度）
        if (tauEstimate > 0 && tauEstimate < maxLag - 1) {
            const y1 = cmndf[tauEstimate - 1];
            const y0 = cmndf[tauEstimate];
            const y2 = cmndf[tauEstimate + 1];
            const denom = 2 * (y1 - 2 * y0 + y2);
            if (Math.abs(denom) > 1e-12) {
                tauEstimate += 0.5 * (y1 - y2) / denom;
            }
        }

        const freq = sampleRate / tauEstimate;
        if (freq >= minFreq && freq <= maxFreq) return freq;
        return null;
    }

    // ========== 无信号检测 ==========
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

    // ========== 检测循环 ==========
    detectLoop() {
        if (!this.isActive) return;

        if (this.isPaused || this.tuningSuccess) {
            this.animationFrame = requestAnimationFrame(() => this.detectLoop());
            return;
        }

        const buffer = new Float32Array(this.analyser.fftSize);
        this.analyser.getFloatTimeDomainData(buffer);

        // RMS 计算
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
        const rms = Math.sqrt(sum / buffer.length) * 32768;

        // 自适应阈值：上升快、下降慢（2 秒半衰期衰减）
        if (rms > this.rmsThreshold * 2) {
            this.rmsThreshold = Math.max(this.rmsFloor, rms * 0.6);
        }
        // 静默时缓慢衰减（每帧 ~0.07%，约 2 秒衰减一半 @60fps）
        if (rms < this.rmsThreshold * 0.3) {
            this.rmsThreshold = Math.max(this.rmsFloor, this.rmsThreshold * 0.988);
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

            // 指数移动平均
            this.smoothedCents = this.smoothedCents * (1 - this.smoothingFactor) + cents * this.smoothingFactor;

            const isAccurate = Math.abs(this.smoothedCents) <= 8;
            if (isAccurate) {
                this.accurateCount++;
            } else {
                this.accurateCount = 0;
            }

            const fire = this.accurateCount >= this.requiredAccurate;
            if (fire) {
                this.tuningSuccess = true;
            }
            if (this.onPitchDetected) this.onPitchDetected(pitch, this.smoothedCents, 'valid', fire, rms);
        } else {
            if (this.onPitchDetected) this.onPitchDetected(null, null, 'invalid', false, rms);
        }

        this.animationFrame = requestAnimationFrame(() => this.detectLoop());
    }
}

// ==================== 页面逻辑 ====================
(function () {
    let currentString = 6;
    let isTuning = false;
    const tuner = new YINTuner();

    let lastSpokenGuide = '';
    let lastVoiceTime = 0;
    const voiceCooldown = 2000;

    let autoMode = false;

    const autoModeBtn = document.getElementById('auto-mode-btn');
    const autoStatusSpan = document.getElementById('auto-status');
    const needle = document.getElementById('pitch-needle');
    const deviationEl = document.getElementById('deviation');
    const guideEl = document.getElementById('guide');
    const startBtn = document.getElementById('start-tuning');
    const fireworksDiv = document.getElementById('fireworks');
    const vibrateString = document.getElementById('vibrate-string');
    const volumeBar = document.getElementById('volume-bar');
    const trendChart = document.getElementById('trend-chart');
    const gaugeCenterNumber = document.getElementById('gauge-center-number');

    let centsHistory = [];
    const maxHistory = 10;

    const defaultDeviationText = '当前偏差：未开始调弦';
    const defaultGuideHTML = '<i class="fas fa-hand-pointer" aria-hidden="true"></i> 未开始调弦';

    function speak(text, rate = 0.9) {
        // 统一走 VoiceGuide TTS，语音关闭时静默
        if (!window.VoiceGuide || !window.VoiceGuide.isEnabled()) return;
        window.VoiceGuide.speak(text, { rate });
    }

    function stopSpeak() {
        if (window.VoiceGuide) window.VoiceGuide.stop();
    }

    function resetTuningDisplay() {
        needle.style.left = '50%';
        deviationEl.textContent = defaultDeviationText;
        gaugeCenterNumber.textContent = '0';
        guideEl.innerHTML = defaultGuideHTML;
        guideEl.style.color = '';
        lastSpokenGuide = '';
        centsHistory = [];
        volumeBar.style.width = '0%';
        drawTrendChart();
    }

    function createFirework() {
        fireworksDiv.style.display = 'block';
        for (let i = 0; i < 30; i++) {
            const p = document.createElement('div');
            p.className = 'firework-particle';
            const angle = Math.random() * 2 * Math.PI;
            const distance = Math.random() * 150 + 50;
            p.style.setProperty('--dx', Math.cos(angle) * distance + 'px');
            p.style.setProperty('--dy', Math.sin(angle) * distance + 'px');
            p.style.left = Math.random() * 100 + '%';
            p.style.top = Math.random() * 100 + '%';
            p.style.background = `hsl(${Math.random() * 60 + 30}, 100%, 60%)`;
            fireworksDiv.appendChild(p);
            setTimeout(() => p.remove(), 1000);
        }
        setTimeout(() => { fireworksDiv.style.display = 'none'; }, 1000);
    }

    function drawTrendChart() {
        trendChart.innerHTML = '';
        centsHistory.forEach(cents => {
            const bar = document.createElement('div');
            bar.className = 'trend-bar';
            bar.style.height = Math.min(100, Math.abs(cents) * 3) + '%';
            if (cents > 0) bar.classList.add('positive');
            else if (cents < 0) bar.classList.add('negative');
            trendChart.appendChild(bar);
        });
    }

    // ========== 弦选择 ==========
    document.querySelectorAll('.string-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            if (isTuning) {
                tuner.stop();
                isTuning = false;
                startBtn.textContent = '开始调这根弦';
                startBtn.classList.remove('tuning');
                vibrateString.classList.remove('vibrating');
                stopSpeak();
            }
            document.querySelectorAll('.string-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentString = parseInt(this.dataset.string);
            document.getElementById('current-string').textContent =
                `${currentString}弦 (${['E', 'B', 'G', 'D', 'A', 'E'][currentString - 1]})`;
            resetTuningDisplay();
        });
    });

    // ========== 自动模式 ==========
    autoModeBtn.addEventListener('click', function () {
        autoMode = !autoMode;
        if (autoMode) {
            autoModeBtn.classList.add('active');
            autoStatusSpan.textContent = '开启';
            if (isTuning) speak('自动模式已开启');
        } else {
            autoModeBtn.classList.remove('active');
            autoStatusSpan.textContent = '关闭';
            tuner.isPaused = false;
            if (tuner.pauseTimer) { clearTimeout(tuner.pauseTimer); tuner.pauseTimer = null; }
            if (isTuning) speak('自动模式已关闭');
        }
    });

    // ========== 开始/停止调音 ==========
    startBtn.addEventListener('click', function () {
        if (!isTuning) {
            tuner.start(currentString, (freq, cents, status, fire, rms) => {
                volumeBar.style.width = Math.min(100, (rms / 5000) * 100) + '%';

                if (status === 'valid') {
                    const leftPercent = Math.max(0, Math.min(100, 50 + (cents / 50) * 25));
                    needle.style.left = leftPercent + '%';
                    deviationEl.textContent = `当前偏差：${cents.toFixed(1)} 音分`;
                    gaugeCenterNumber.textContent = cents.toFixed(0);

                    centsHistory.push(cents);
                    if (centsHistory.length > maxHistory) centsHistory.shift();
                    drawTrendChart();

                    let guideHTML = '';
                    let voiceText = '';

                    if (fire) {
                        guideHTML = '<i class="fas fa-circle-check" aria-hidden="true"></i> 音调准确，恭喜！';
                        voiceText = '音调准确，恭喜';
                        createFirework();
                        tuner.accurateCount = 0;

                        if (autoMode) {
                            tuner.isPaused = true;
                            guideHTML += ' (暂停中...)';
                            if (tuner.pauseTimer) clearTimeout(tuner.pauseTimer);
                            tuner.pauseTimer = setTimeout(() => {
                                tuner.isPaused = false;
                                tuner.pauseTimer = null;
                                tuner.tuningSuccess = false;
                                if (autoMode && isTuning) {
                                    guideEl.innerHTML = '继续检测...';
                                }
                            }, 500);
                        } else {
                            tuner.stop();
                            isTuning = false;
                            startBtn.textContent = '开始调这根弦';
                            startBtn.classList.remove('tuning');
                            vibrateString.classList.remove('vibrating');
                        }
                    } else if (Math.abs(cents) <= 8) {
                        guideHTML = '<i class="fas fa-circle-check" aria-hidden="true"></i> 音调准确';
                        voiceText = '音调准确';
                    } else if (cents > 8) {
                        guideHTML = `<i class="fas fa-arrow-rotate-left" aria-hidden="true"></i> 音调偏高，逆时针调${cents.toFixed(1)}音分`;
                        voiceText = '偏高';
                    } else if (cents < -8) {
                        guideHTML = `<i class="fas fa-arrow-rotate-right" aria-hidden="true"></i> 音调偏低，顺时针调${Math.abs(cents).toFixed(1)}音分`;
                        voiceText = '偏低';
                    }

                    guideEl.innerHTML = guideHTML;
                    const now = Date.now();
                    if (voiceText && voiceText !== lastSpokenGuide && now - lastVoiceTime > voiceCooldown) {
                        speak(voiceText, 1.0);
                        lastSpokenGuide = voiceText;
                        lastVoiceTime = now;
                    }

                    if (isTuning) vibrateString.classList.add('vibrating');

                    // 自动模式：匹配最近弦
                    if (autoMode && freq && !tuner.tuningSuccess) {
                        let minDiff = Infinity;
                        let matchedString = currentString;
                        for (let s in tuner.stringFreqs) {
                            const diff = Math.abs(freq - tuner.stringFreqs[s]);
                            if (diff < minDiff) { minDiff = diff; matchedString = parseInt(s); }
                        }
                        if (matchedString !== currentString && minDiff < 10 && !tuner.isPaused) {
                            currentString = matchedString;
                            document.querySelectorAll('.string-btn').forEach(b => b.classList.remove('active'));
                            document.querySelector(`.string-btn[data-string="${currentString}"]`).classList.add('active');
                            document.getElementById('current-string').textContent =
                                `${currentString}弦 (${['E', 'B', 'G', 'D', 'A', 'E'][currentString - 1]})`;
                            speak(`请调${currentString}弦`);
                        }
                    }
                } else if (status === 'invalid') {
                    vibrateString.classList.remove('vibrating');
                } else if (status === 'noSignal') {
                    guideEl.innerHTML = '<i class="fas fa-triangle-exclamation" aria-hidden="true"></i> 没有检测到琴声，请拨动琴弦';
                    guideEl.style.color = document.documentElement.getAttribute('data-theme') === 'light' ? '#b87a14' : '#ffaa00';
                    vibrateString.classList.remove('vibrating');
                    const now = Date.now();
                    if (lastSpokenGuide !== 'noSignal' && now - lastVoiceTime > voiceCooldown) {
                        speak('请拨动琴弦');
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
            tuner.stop();
            isTuning = false;
            startBtn.textContent = '开始调这根弦';
            startBtn.classList.remove('tuning');
            vibrateString.classList.remove('vibrating');
            stopSpeak();
            resetTuningDisplay();
        }
    });

    drawTrendChart();
})();
