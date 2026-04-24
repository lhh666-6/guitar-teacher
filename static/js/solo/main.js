// ========== main.js ==========
// GuitarTrainApp 主类，依赖全局常量（来自 constants.js）、绘制函数（来自 ui_helpers.js）和验证模块（chord_validator.js）

(function() {
    // ========== 浏览器兼容性处理 ==========
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices = navigator.mediaDevices || {};
        navigator.mediaDevices.getUserMedia = navigator.mediaDevices.getUserMedia ||
            navigator.webkitGetUserMedia || navigator.mozGetUserMedia ||
            function(constraints) {
                const getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
                if (!getUserMedia) {
                    return Promise.reject(new Error('浏览器不支持摄像头/麦克风访问'));
                }
                return new Promise((resolve, reject) => {
                    getUserMedia.call(navigator, constraints, resolve, reject);
                });
            };
    }

    // ========== 主应用类 ==========
    class GuitarTrainApp {
        constructor() {
            // 状态变量
        
            this.thumbnailDynamicInterval = 200;      // 初始 5帧/秒
            this.thumbnailRttHistory = [];            // RTT 采样
            this.thumbnailFastStartTime = null;       // 开始时间
            this.thumbnailModeCheckTimer = null;      // 2秒定时器
            this.thumbnailModeDecided = false;        // 评估完成标志
            this.chords = [];
            this.currentChord = null;
            this.testList = [];
            this.testResults = [];
            this.testMode = false;
            this.cameraStream = null;
            this.socket = null;
            this.animationId = null;
            this.timerInterval = null;
            this.stats = { correct: 0, wrong: 0 };
            this.currentTestIndex = 0;
            this.recordedForCurrentChord = false;
            this.chordStartTime = null;
            this.lastSendTime = 0;
            this.lastFrameSendTime = 0;

            // 音频验证
            this.audioVerifier = new ChordVerifier();
            this.audioResultCache = null;
            this.audioWaiting = false;
            this.audioTimeout = null;

            this._visualStablePassed = false;
            this._visualErrorStart = null;
            this._visualStableReady = false;

            this.cooldownTimer = null;
            this.quickTimer = null;

            // MediaPipe 相关
            this.hands = null;
            this.camera = null;
            this.filters = [];               // 21个点的滤波器
            this.lastThumbnailTime = 0;
            this.sendingEnabled = false;
            this.useMediaPipe = true;         // 是否尝试使用 MediaPipe

            // 音频预留
            this.audioContext = null;
            this.audioEnabled = false;

            // 关键点发送节流
            this.lastLandmarkSendTime = 0;

            // 用于实时绘制
            this.latestLocalLandmarks = null;
            this.cachedDrawingData = null;
            this.animationFrameId = null;

            this.fingeringDetector = new FingeringDetector();

            // 调试日志锁
            this._logMediaPipeReady = false;
            this._logMediaPipeFallback = false;
            this._logHandResultsFirst = false;
            this._logCameraStartFail = false;
            this._logSocketConnected = false;
            this._logSocketDisconnected = false;
            this._logSocketError = false;
            this._logFretboardReady = false;
            this._logFretboardMissing = false;
            this._logThumbnailOk = false;
            this._logThumbnailFail = false;
            this._logFrameOk = false;
            this._logFrameFail = false;
            this._drawStartedLogged = false;
            this._handModelTriggered = false;

            // DOM 元素缓存
            this.cacheElements();

            // 初始化粒子背景
            this.createParticles();

            // 加载和弦数据
            this.loadChords();

            // 绑定事件
            this.bindEvents();

            // 全屏变化监听：退出全屏时若在测试模式则停止测试并恢复界面
            this._onFullscreenChange = this._handleFullscreenChange.bind(this);
            document.addEventListener('fullscreenchange', this._onFullscreenChange);
            document.addEventListener('webkitfullscreenchange', this._onFullscreenChange);
            document.addEventListener('msfullscreenchange', this._onFullscreenChange);

            // 窗口卸载清理
            window.addEventListener('beforeunload', () => this.cleanup());
        }

        _handleFullscreenChange() {
            const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
            if (!isFullscreen && this.testMode) {
                console.log('[全屏] 退出全屏，自动结束测试并恢复初始界面');
                this.stopTestAndSending();
                if (this.cameraStream) {
                    this._closeCamera();
                }
            }
        }

        cacheElements() {
            this.elements = {
                chordSelect: document.getElementById('chordSelect'),
                selChordName: document.getElementById('selChordName'),
                selChordDesc: document.getElementById('selChordDesc'),
                testListDiv: document.getElementById('testListDiv'),
                testCountSpan: document.getElementById('testCount'),
                statCorrect: document.getElementById('statCorrect'),
                statWrong: document.getElementById('statWrong'),
                statRate: document.getElementById('statRate'),
                currentChordName: document.getElementById('currentChordName'),
                chordDescription: document.getElementById('chordDescription'),
                dotContainer: document.getElementById('dotContainer'),
                cameraFeed: document.getElementById('cameraFeed'),
                toggleCamera: document.getElementById('toggleCamera'),
                cameraStatus: document.getElementById('cameraStatus'),
                startTestBtn: document.getElementById('startTestBtn'),
                clearTestBtn: document.getElementById('clearTestBtn'),
                addToTestBtn: document.getElementById('addToTestBtn'),
                skipBtn: document.getElementById('skipBtn'),
                chordDetailContent: document.getElementById('chordDetailContent'),
                progressDisplay: document.getElementById('progressDisplay'),
                currentTimeDisplay: document.getElementById('currentTimeDisplay'),
                fretboardMini: document.getElementById('fretboardMini'),
                trainLayout: document.querySelector('.train-layout'),
                videoContainer: document.querySelector('.camera-container'),
                difficultyBadge: document.getElementById('difficultyBadge')
            };

            // 叠加画布（若不存在则创建）
            this.overlayCanvas = document.getElementById('overlayCanvas');
            if (!this.overlayCanvas) {
                this.overlayCanvas = document.createElement('canvas');
                this.overlayCanvas.id = 'overlayCanvas';
                this.overlayCanvas.style.position = 'absolute';
                this.overlayCanvas.style.top = '0';
                this.overlayCanvas.style.left = '0';
                this.overlayCanvas.style.width = '100%';
                this.overlayCanvas.style.height = '100%';
                this.overlayCanvas.style.pointerEvents = 'none';
                const parent = this.elements.cameraFeed.parentElement;
                parent.style.position = 'relative';
                parent.appendChild(this.overlayCanvas);
            }
            this.overlayCtx = this.overlayCanvas.getContext('2d');
        }

        createParticles() {
            const particles = document.getElementById('particles');
            if (!particles) return;
            particles.innerHTML = '';
            for (let i = 0; i < 60; i++) {
                const particle = document.createElement('div');
                particle.className = 'particle';
                const size = Math.random() * 6 + 2;
                particle.style.width = `${size}px`;
                particle.style.height = particle.style.width;
                particle.style.background = `rgba(${200 + Math.random()*55}, ${150 + Math.random()*50}, 100, ${0.15+Math.random()*0.2})`;
                particle.style.left = `${Math.random()*100}%`;
                particle.style.top = `${Math.random()*100}%`;
                particle.style.animation = `particleFloat ${Math.random()*10+8}s infinite alternate, particleRotate ${Math.random()*15+10}s infinite linear`;
                particle.style.animationDelay = `${Math.random()*5}s`;
                particles.appendChild(particle);
            }
        }

        getStars(difficulty) {
            return '★'.repeat(difficulty);
        }

        async loadChords() {
            try {
                const response = await fetch('/api/chords/');
                if (!response.ok) throw new Error('网络错误');
                const data = await response.json();
                this.chords = data.map((chord, index) => ({
                    id: `chord_${index}`,
                    name: chord.name,
                    description: chord.desc,
                    detail: chord.desc,
                    positions: chord.positions,
                    barre: chord.barre,
                    difficulty: chord.difficulty || 1
                }));
            } catch (err) {
                console.warn('加载和弦失败，使用默认数据', err);
                this.chords = DEFAULT_CHORDS.map((chord, index) => ({
                    id: `chord_${index}`,
                    name: chord.name,
                    description: chord.desc,
                    detail: chord.desc,
                    positions: chord.positions,
                    barre: chord.barre,
                    difficulty: chord.difficulty || 1
                }));
            }

            const select = this.elements.chordSelect;
            select.innerHTML = '';
            this.chords.forEach(chord => {
                const option = document.createElement('option');
                option.value = chord.id;
                option.textContent = `${chord.name} ${this.getStars(chord.difficulty || 1)}`;
                select.appendChild(option);
            });

            if (this.chords.length > 0) {
                select.value = this.chords[0].id;
                select.dispatchEvent(new Event('change'));
            }

            this.renderPopupList();
            this.loadPendingChordsFromLocalStorage();
        }

        renderPopupList(filterText = '') {
            const popupList = document.getElementById('chordPopupList');
            if (!popupList) return;
            const filtered = filterText
                ? this.chords.filter(c => c.name.toLowerCase().includes(filterText.toLowerCase()))
                : this.chords;
            popupList.innerHTML = '';
            filtered.forEach(chord => {
                const item = document.createElement('div');
                item.className = 'popup-chord-item';
                item.dataset.chordId = chord.id;
                item.innerHTML = `
                    <span class="popup-chord-name">${chord.name}</span>
                    <span class="popup-chord-stars">${this.getStars(chord.difficulty || 1)}</span>
                `;
                item.addEventListener('click', () => {
                    this.elements.chordSelect.value = chord.id;
                    this.elements.chordSelect.dispatchEvent(new Event('change'));
                    document.getElementById('chordModal').classList.remove('active');
                });
                popupList.appendChild(item);
            });
        }

        loadPendingChordsFromLocalStorage() {
            const stored = localStorage.getItem('pendingSoloChords');
            if (!stored) return;
            try {
                const chordNames = JSON.parse(stored);
                if (!Array.isArray(chordNames) || chordNames.length === 0) return;
                const newIds = [];
                for (const name of chordNames) {
                    const chord = this.chords.find(c => c.name === name);
                    if (chord && !this.testList.includes(chord.id)) {
                        newIds.push(chord.id);
                    }
                }
                if (newIds.length) {
                    this.testList.push(...newIds);
                    this.testResults = new Array(this.testList.length).fill(null);
                    this.renderTestList();
                    this.updateProgress();
                    console.log(`[Solo] 已从驾驶舱加载 ${newIds.length} 个和弦到测试列表`);
                }
            } catch(e) {
                console.warn('解析待训练和弦失败', e);
            }
        }

        syncTestListToLocalStorage() {
            const chordNames = this.testList.map(id => {
                const chord = this.chords.find(c => c.id === id);
                return chord ? chord.name : null;
            }).filter(name => name !== null);
            localStorage.setItem('pendingSoloChords', JSON.stringify(chordNames));
        }

        backendToDisplayIndex(backendString) {
            return STRING_COUNT - backendString;
        }

        updateStats() {
            this.elements.statCorrect.textContent = this.stats.correct;
            this.elements.statWrong.textContent = this.stats.wrong;
            const total = this.stats.correct + this.stats.wrong;
            this.elements.statRate.textContent = total ? ((this.stats.correct / total) * 100).toFixed(1) + '%' : '0%';
        }

        renderTestList() {
            const div = this.elements.testListDiv;
            div.innerHTML = '';
            this.testList.forEach((id, idx) => {
                const chord = this.chords.find(c => c.id === id);
                if (!chord) return;
                const item = document.createElement('div');
                item.className = 'test-item';
                const nameSpan = document.createElement('span');
                nameSpan.className = 'test-item-name';
                nameSpan.textContent = chord.name;
                const diffSpan = document.createElement('span');
                diffSpan.className = 'test-item-difficulty';
                const difficulty = chord.difficulty || 1;
                diffSpan.textContent = `难度 ${difficulty}`;
                const statusSpan = document.createElement('span');
                statusSpan.className = 'test-item-status';
                const res = this.testResults[idx];
                if (res !== undefined && res !== null) {
                    if (res.correct) {
                        statusSpan.innerHTML = `<span class="test-badge-correct">✓</span> <span class="test-item-time">${res.time.toFixed(1)}s</span>`;
                    } else {
                        statusSpan.innerHTML = `<span class="test-badge-wrong">✗</span> <span class="test-item-time">--</span>`;
                    }
                } else {
                    statusSpan.innerHTML = `<span class="test-badge-pending">⏳</span>`;
                }
                item.appendChild(nameSpan);
                item.appendChild(diffSpan);
                item.appendChild(statusSpan);
                div.appendChild(item);
            });
            this.elements.testCountSpan.textContent = this.testList.length;
        }

        updateProgress() {
            if (this.testMode && this.testList.length > 0) {
                this.elements.progressDisplay.textContent = `${this.currentTestIndex + 1}/${this.testList.length}`;
            } else {
                this.elements.progressDisplay.textContent = `0/0`;
            }
        }

        stopTestAndSending() {
            this.sendingEnabled = false;
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
            if (this.camera) {
                this.camera.stop();
            }
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
            this._clearAllTimers();
            if (this.audioVerifier) {
                this.audioVerifier.stop();
            }
            this.testMode = false;
            this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
            if (this.elements.trainLayout) {
                this.elements.trainLayout.classList.remove('test-mode');
            }
            if (this.elements.videoContainer) {
                this.elements.videoContainer.classList.remove('video-expanded');
            }
            if (document.fullscreenElement || document.webkitFullscreenElement) {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                }
            }
            if (document.body.classList.contains('video-overlay-active')) {
                document.body.classList.remove('video-overlay-active');
                const fullscreenBtn = document.getElementById('fullscreenVideoBtn');
                if (fullscreenBtn) {
                    fullscreenBtn.innerHTML = '<i class="fas fa-expand" aria-hidden="true"></i> 全屏';
                }
            }
            if (this.currentChord) {
                requestAnimationFrame(() => this.renderStandardDots(this.currentChord));
            }
            this._resetDebugFlags();
        }

        _closeCamera() {
            if (this.testMode) {
                this.stopTestAndSending();
            }
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
            if (this._stopHandLoop) {
                this._stopHandLoop();
            }
            if (this.camera) {
                this.camera.stop();
            }
            if (this.audioVerifier) {
                this.audioVerifier.stop();
            }
            this._clearAllTimers();
            if (this.cameraStream) {
                this.cameraStream.getTracks().forEach(t => t.stop());
                this.cameraStream = null;
            }
            this.elements.cameraFeed.srcObject = null;
            this.elements.cameraFeed.style.transform = '';
            this.elements.toggleCamera.textContent = '开启';
            this.elements.cameraStatus.innerText = '📷 摄像头已关闭';
            if (document.fullscreenElement || document.webkitFullscreenElement) {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                }
            }
            document.body.classList.remove('video-overlay-active');
            const fullscreenBtn = document.getElementById('fullscreenVideoBtn');
            if (fullscreenBtn) {
                fullscreenBtn.innerHTML = '<i class="fas fa-expand" aria-hidden="true"></i> 全屏';
            }
            if (this.elements.trainLayout) {
                this.elements.trainLayout.classList.remove('test-mode');
            }
            if (this.elements.videoContainer) {
                this.elements.videoContainer.classList.remove('video-expanded');
            }
            if (this.socket) {
                this.socket.disconnect();
                if (this.socket.close) this.socket.close();
                this.socket = null;
            }
            this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
            this.filters = [];
            this.latestLocalLandmarks = null;
            this.cachedDrawingData = null;
            this.sendingEnabled = false;
            this._resetDebugFlags();
            if (this.currentChord) {
                requestAnimationFrame(() => this.renderStandardDots(this.currentChord));
            }
        }

        _resetDebugFlags() {
            this._logFretboardReady = false;
            this._logFretboardMissing = false;
            this._drawStartedLogged = false;
            this._handModelTriggered = false;
            this._logThumbnailOk = false;
            this._logThumbnailFail = false;
            this._logFrameOk = false;
            this._logFrameFail = false;
        }

        goToTestIndex(index) {
            if (!this.testList.length || index < 0 || index >= this.testList.length) return;
            const chordId = this.testList[index];
            const chord = this.chords.find(c => c.id === chordId);
            if (chord) {
                this.currentChord = chord;
                this.elements.chordSelect.value = chord.id;
                this.elements.selChordName.textContent = chord.name;
                this.elements.selChordDesc.textContent = chord.description;
                this.elements.currentChordName.textContent = chord.name;
                this.elements.chordDescription.textContent = chord.description;
                this.elements.chordDetailContent.textContent = chord.detail;
                this.renderStandardDots(chord);
                if (this.elements.difficultyBadge) {
                    const difficulty = chord.difficulty || 1;
                    this.elements.difficultyBadge.textContent = '难度' + difficulty;
                }
                this.recordedForCurrentChord = false;
                this.chordStartTime = Date.now();
                this._visualStablePassed = false;
                this._visualStableReady = false;
                this._visualErrorStart = null;
                this.audioResultCache = null;
                this.audioWaiting = false;
                this._clearAllTimers();
                if (this.audioVerifier && this.audioVerifier.isRunning()) {
                    this.audioVerifier.setTargetChord(this.currentChord.name);
                }
                if (QUICK_MODE) {
                    this.quickTimer = setTimeout(() => {
                        if (this.testMode && !this.recordedForCurrentChord) {
                            this._finalizeChord('wrong', { forceSkip: true });
                        }
                    }, 5000);
                }
                this.updateProgress();
            }
        }

        moveToNextTest() {
            if (this.currentTestIndex + 1 >= this.testList.length) {
                this.stopTestAndSending();
                const total = this.stats.correct + this.stats.wrong;
                const avgTime = this.testResults.filter(r => r && r.correct).reduce((acc, r) => acc + r.time, 0) / (this.stats.correct || 1);
                alert(`✅ 测试完成！\n正确: ${this.stats.correct}, 错误: ${this.stats.wrong}\n平均正确用时: ${avgTime.toFixed(2)} 秒`);
                this.elements.progressDisplay.textContent = `${this.testList.length}/${this.testList.length}`;
                this.elements.currentTimeDisplay.textContent = '0.0 s';
                if (this.cameraStream) {
                    this._closeCamera();
                }
                return;
            }
            this.currentTestIndex++;
            this.goToTestIndex(this.currentTestIndex);
        }

        recordCorrect() {
            if (!this.testMode || this.recordedForCurrentChord) return;
            const elapsed = (Date.now() - this.chordStartTime) / 1000;
            this.testResults[this.currentTestIndex] = { correct: true, time: elapsed };
            this.stats.correct++;
            this.updateStats();
            this.recordedForCurrentChord = true;
            this.renderTestList();
            fetch('/api/save_record', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chord_name: this.currentChord.name,
                    correct: true,
                    time_spent: elapsed,
                    mode: QUICK_MODE ? 'quick' : 'normal'
                })
            }).catch(err => console.error('保存记录失败:', err));
        }

        recordSkip() {
            if (!this.testMode || this.recordedForCurrentChord) return;
            this.testResults[this.currentTestIndex] = { correct: false, time: null };
            this.stats.wrong++;
            this.updateStats();
            this.recordedForCurrentChord = true;
            this.renderTestList();
            fetch('/api/save_record', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chord_name: this.currentChord.name,
                    correct: false,
                    time_spent: 0.0,
                    mode: QUICK_MODE ? 'quick' : 'normal'
                })
            }).catch(err => console.error('保存记录失败:', err));
            this.moveToNextTest();
        }

        renderStandardDots(chord, userPositions = [], userBarre = null) {
            const container = this.elements.dotContainer;
            container.innerHTML = '';

            const fretboard = this.elements.fretboardMini;
            const style = window.getComputedStyle(fretboard);
            const topPadding = parseFloat(style.paddingTop);
            const bottomPadding = parseFloat(style.paddingBottom);
            const leftPadding = parseFloat(style.paddingLeft);
            const rightPadding = parseFloat(style.paddingRight);

            const containerWidth = fretboard.clientWidth;
            const containerHeight = fretboard.clientHeight;
            const innerWidth = containerWidth - leftPadding - rightPadding;
            const innerHeight = containerHeight - topPadding - bottomPadding;

            const stringSpacing = innerHeight / (STRING_COUNT - 1);
            const fretSpacing = innerWidth / (FRET_COUNT - 1);

            const baseY = topPadding;
            const baseX = leftPadding;

            const stringLines = document.querySelectorAll('.string-mini');
            stringLines.forEach((el, idx) => {
                const y = baseY + idx * stringSpacing;
                el.style.top = (y - 1) + 'px';
            });
            const stringLabels = document.querySelectorAll('.string-label');
            stringLabels.forEach((el, idx) => {
                const y = baseY + idx * stringSpacing;
                el.style.top = (y - 8) + 'px';
            });

            const fretLines = document.querySelectorAll('.fret-mini');
            fretLines.forEach((el, idx) => {
                const x = baseX + idx * fretSpacing;
                el.style.left = (x - 1) + 'px';
            });
            const fretLabels = document.querySelectorAll('.fret-label');
            fretLabels.forEach((el, idx) => {
                const x = baseX + idx * fretSpacing;
                el.style.left = (x - 15) + 'px';
            });

            const allPositions = [];
            if (chord && chord.positions) {
                chord.positions.forEach(pos => {
                    allPositions.push({ ...pos, type: 'standard', correct: false });
                });
            }
            userPositions.forEach(up => {
                allPositions.push({ string: up.string, fret: up.fret, type: 'user', correct: up.correct });
            });

            const allBarres = [];
            if (chord && chord.barre) {
                allBarres.push({ ...chord.barre, type: 'standard', correct: false });
            }
            if (userBarre) {
                allBarres.push({
                    fret: userBarre.fret,
                    startString: userBarre.startString,
                    endString: userBarre.endString,
                    type: 'user',
                    correct: userBarre.correct
                });
            }

            const allFrets = new Set();
            allPositions.forEach(p => allFrets.add(p.fret));
            allBarres.forEach(b => allFrets.add(b.fret));
            const uniqueFrets = Array.from(allFrets).sort((a, b) => a - b);
            const validFrets = uniqueFrets.slice(0, FRET_COUNT);
            const fretToCol = {};
            validFrets.forEach((fret, idx) => { fretToCol[fret] = idx; });

            allPositions.forEach(p => {
                if (!(p.fret in fretToCol)) return;
                const colIndex = fretToCol[p.fret];
                const idx = this.backendToDisplayIndex(p.string);
                const x = baseX + colIndex * fretSpacing + fretSpacing / 2;
                const y = baseY + idx * stringSpacing;

                const dot = document.createElement('div');
                dot.className = `dot ${p.type === 'standard' ? 'standard' : (p.correct ? 'user-correct' : 'user-wrong')}`;
                dot.style.left = (x - DOT_RADIUS) + 'px';
                if (p.type === 'standard') {
                    dot.style.top = (y - DOT_RADIUS + DOT_RADIUS) + 'px';
                } else {
                    dot.style.top = (y - DOT_RADIUS) + 'px';
                }
                dot.textContent = p.fret;
                container.appendChild(dot);
            });

            allBarres.forEach(b => {
                if (!(b.fret in fretToCol)) return;
                const colIndex = fretToCol[b.fret];
                const startIdx = this.backendToDisplayIndex(b.startString);
                const endIdx = this.backendToDisplayIndex(b.endString);
                const idxMin = Math.min(startIdx, endIdx);
                const idxMax = Math.max(startIdx, endIdx);
                const yStart = baseY + idxMin * stringSpacing;
                const yEnd = baseY + idxMax * stringSpacing;
                const topY = Math.min(yStart, yEnd) - DOT_RADIUS;
                const bottomY = Math.max(yStart, yEnd) + DOT_RADIUS;
                const height = bottomY - topY;
                const x = baseX + colIndex * fretSpacing + fretSpacing / 2;

                const barreDiv = document.createElement('div');
                barreDiv.className = `barre ${b.type === 'standard' ? 'standard' : (b.correct ? 'user-correct' : 'user-wrong')}`;
                barreDiv.style.left = (x - 4) + 'px';
                barreDiv.style.top = topY + 'px';
                barreDiv.style.height = height + 'px';
                barreDiv.style.width = '8px';
                barreDiv.style.opacity = '0.9';
                barreDiv.style.borderRadius = '4px';
                barreDiv.style.position = 'absolute';
                container.appendChild(barreDiv);
            });
        }

        // ================= 核心绘制函数（回归简单，永不偏移） =================
        drawAll() {
            if (!this.overlayCanvas) return;
            const ctx = this.overlayCtx;
            // 直接使用画布的固有像素尺寸（在 loadedmetadata 中已设为视频原始分辨率）
            const w = this.overlayCanvas.width;
            const h = this.overlayCanvas.height;

            ctx.clearRect(0, 0, w, h);

            // 诊断红框，用于验证对齐（正式发布可注释）
            // ctx.strokeStyle = 'red';
            // ctx.lineWidth = 4;
            // ctx.strokeRect(0, 0, w, h);

            if (this.cachedDrawingData) {
                if (!this._drawStartedLogged) {
                    console.log('🖌️ 开始绘制指板叠加层（弦线/品丝）');
                    this._drawStartedLogged = true;
                }
                drawOverlay(ctx, w, h, this.cachedDrawingData);
            } else {
                if (this._drawStartedLogged) {
                    console.warn('⚠️ cachedDrawingData 丢失，停止绘制指板');
                    this._drawStartedLogged = false;
                }
            }

            if (this.latestLocalLandmarks) {
                drawLocalHandLandmarks(ctx, w, h, this.latestLocalLandmarks);
            }
        }

        // ================= 其他功能方法（保持不变） =================
        _recordUnstable() {
            this.testResults[this.currentTestIndex] = {
                correct: false,
                time: null,
                unstable: true
            };
            this.stats.unstable = (this.stats.unstable || 0) + 1;
            console.log('[记录] 按弦不稳');
            const similarity = this.audioResultCache ? this.audioResultCache.confidence : null;
            fetch('/api/save_record', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chord_name: this.currentChord.name,
                    correct: false,
                    is_unstable: true,
                    similarity: similarity,
                    time_spent: 0,
                    mode: QUICK_MODE ? 'quick' : 'normal'
                })
            }).catch(err => console.error('保存不稳记录失败:', err));
        }

        _clearAllTimers() {
            if (this.cooldownTimer) clearTimeout(this.cooldownTimer);
            if (this.audioTimeout) clearTimeout(this.audioTimeout);
            if (this.quickTimer) clearTimeout(this.quickTimer);
            this.cooldownTimer = null;
            this.audioTimeout = null;
            this.quickTimer = null;
            this.audioWaiting = false;
        }

        recordWrong() {
            if (!this.testMode || this.recordedForCurrentChord) return;
            this.testResults[this.currentTestIndex] = { correct: false, time: null };
            this.stats.wrong++;
            this.updateStats();
            this.recordedForCurrentChord = true;   // 标记已记录，防止重复记录
            this.renderTestList();

            fetch('/api/save_record', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chord_name: this.currentChord.name,
                    correct: false,
                    time_spent: 0.0,
                    mode: QUICK_MODE ? 'quick' : 'normal'
                })
            }).catch(err => console.error('保存记录失败:', err));

            // 关键：不调用 this.moveToNextTest()
        }

        _finalizeChord(result, options = {}) {
            if (!this.testMode || this.recordedForCurrentChord) return;
            this._clearAllTimers();

            switch (result) {
                case 'correct':
                    this.recordCorrect();
                    break;
                case 'unstable':
                    this._recordUnstable();
                    break;
                case 'wrong':
                    if (options.forceSkip) {
                        this.recordSkip();
                    } else {
                        this.recordWrong();
                    }
                    break;
            }
            // 不再有任何延迟跳转
        }

        _handleAudioReady() {
            if (!this.testMode || this.recordedForCurrentChord) return;
            if (this.audioTimeout) clearTimeout(this.audioTimeout);
            this.audioTimeout = null;
            this.audioWaiting = false;
            const visualOk = this._visualStableReady ? this._visualStablePassed : this._visualStablePassed;
            const result = window.evaluateChord(visualOk, this.audioResultCache, { threshold: 0.55 });
            this._finalizeChord(result);
        }

        _startAudioTimeout() {
            if (this.audioWaiting || this.audioResultCache) return;
            this.audioWaiting = true;
            this.audioTimeout = setTimeout(() => {
                this.audioResultCache = null;
                this._handleAudioReady();
            }, 3000);
        }

        handleDetectionResult = (data) => {
            const receiveTime = performance.now();
            if (this.lastFrameSendTime > 0) {
                const totalDelay = receiveTime - this.lastFrameSendTime;
            }
            if (data.drawing_data) {
                this.cachedDrawingData = data.drawing_data;
            }
            if (!this.testMode || !this.currentChord) return;
            if (data.status === 'success') {
                const processStart = performance.now();
                const visualResult = {
                    positions: data.positions || [],
                    barre: data.barre || null
                };
                const visualOk = window.validateVisual(visualResult.positions, visualResult.barre, this.currentChord);
                if (visualOk) {
                    this._visualStablePassed = true;
                    this._visualStableReady = true;
                    this._visualErrorStart = null;
                } else {
                    if (!this._visualErrorStart) {
                        this._visualErrorStart = performance.now();
                    } else if (performance.now() - this._visualErrorStart >= 100) {
                        this._visualStablePassed = false;
                        this._visualStableReady = true;
                    }
                }
                const userPositions = visualResult.positions.map(pos => ({
                    ...pos,
                    correct: this.currentChord.positions.some(p => p.string === pos.string && p.fret === pos.fret)
                }));
                let userBarre = null;
                if (visualResult.barre) {
                    const correct = this.currentChord.barre &&
                        visualResult.barre.fret === this.currentChord.barre.fret &&
                        visualResult.barre.startString === this.currentChord.barre.startString &&
                        visualResult.barre.endString === this.currentChord.barre.endString;
                    userBarre = { ...visualResult.barre, correct };
                }
                this.renderStandardDots(this.currentChord, userPositions, userBarre);
                if (this._visualStableReady && !this.recordedForCurrentChord) {
                    if (this.audioResultCache) {
                        this._handleAudioReady();
                    } else if (!this.audioWaiting) {
                        this._startAudioTimeout();
                    }
                }
            }
        };

        onHandResults(results) {
            if (!this._handModelTriggered) {
                console.log('✅ MediaPipe 手部模型首次成功调用，返回手部数据');
                this._handModelTriggered = true;
            }

            const now = performance.now();

            // 选择目标手部
            let targetHandIndex = -1;
            if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                const screenMidX = 0.5;
                let candidateIndex = -1;
                let candidateAvgX = -Infinity;
                for (let i = 0; i < results.multiHandLandmarks.length; i++) {
                    const landmarks = results.multiHandLandmarks[i];
                    if (!landmarks) continue;
                    let sumX = 0;
                    for (let j = 0; j < landmarks.length; j++) {
                        sumX += landmarks[j].x;
                    }
                    const avgX = sumX / landmarks.length;
                    if (avgX > screenMidX && avgX > candidateAvgX) {
                        candidateAvgX = avgX;
                        candidateIndex = i;
                    }
                }
                targetHandIndex = candidateIndex;
            }

            if (targetHandIndex === -1) {
                this.latestLocalLandmarks = null;
                this.drawAll();
                return;
            }

            // 手部切换防抖
            if (this._lastTargetHandIndex !== undefined && this._lastTargetHandIndex !== targetHandIndex) {
                this._handSwitchCounter = (this._handSwitchCounter || 0) + 1;
                if (this._handSwitchCounter < 2) {
                    targetHandIndex = this._lastTargetHandIndex;
                } else {
                    this._handSwitchCounter = 0;
                }
            } else {
                this._handSwitchCounter = 0;
            }
            this._lastTargetHandIndex = targetHandIndex;

            const landmarks = results.multiHandLandmarks[targetHandIndex];
            if (!landmarks) {
                this.latestLocalLandmarks = null;
                this.drawAll();
                return;
            }

            // 平滑滤波
            const smoothed = [];
            for (let i = 0; i < landmarks.length; i++) {
                const lm = landmarks[i];
                if (!this.filters[i]) {
                    this.filters[i] = {
                        x: new OneEuroFilter(now, lm.x, FILTER_MIN_CUTOFF, FILTER_BETA, FILTER_DCUTOFF),
                        y: new OneEuroFilter(now, lm.y, FILTER_MIN_CUTOFF, FILTER_BETA, FILTER_DCUTOFF)
                    };
                    smoothed.push({ x: lm.x, y: lm.y });
                } else {
                    const sx = this.filters[i].x.filter(now, lm.x);
                    const sy = this.filters[i].y.filter(now, lm.y);
                    smoothed.push({ x: sx, y: sy });
                }
            }
            this.latestLocalLandmarks = smoothed;

            // 每帧绘制，确保骨骼实时显示
            this.drawAll();

            // 测试模式下的按弦检测与发送（受频率限制）
            if (now - this.lastLandmarkSendTime < LANDMARK_SEND_INTERVAL) return;
            this.lastLandmarkSendTime = now;

            if (this.fingeringDetector && this.fingeringDetector.ready) {
                const detection = this.fingeringDetector.detect(
                    smoothed,
                    this.elements.cameraFeed.videoWidth,
                    this.elements.cameraFeed.videoHeight
                );
                const result = {
                    status: 'success',
                    positions: detection.positions,
                    barre: detection.barre,
                    drawing_data: null
                };
                this.handleDetectionResult(result);
            } else {
                if (this.testMode) {
                    if (!this._logFretboardMissing) {
                        console.warn('⚠️ 指板参数未就绪，无法进行本地按弦检测');
                        this._logFretboardMissing = true;
                    }
                }
            }

        if (now - this.lastThumbnailTime > this.thumbnailDynamicInterval) {
            this.sendThumbnail();
            this.lastThumbnailTime = now;
        }

        }

        _updateThumbnailRtt(rtt) {
            this.thumbnailRttHistory.push(rtt);
            if (this.thumbnailRttHistory.length > 5) {
                this.thumbnailRttHistory.shift();  // 保留最近 5 个样本
            }
        }

        _evaluateThumbnailMode() {
            this.thumbnailModeDecided = true;
            if (this.thumbnailModeCheckTimer) {
                clearTimeout(this.thumbnailModeCheckTimer);
                this.thumbnailModeCheckTimer = null;
            }

            if (this.thumbnailRttHistory.length === 0) return;

            const avgRtt = this.thumbnailRttHistory.reduce((a, b) => a + b, 0) / this.thumbnailRttHistory.length;

            if (avgRtt > 300) {
                this.thumbnailDynamicInterval = 500;  // 降为 2 帧/秒
            } else {
                this.thumbnailDynamicInterval = 200;  // 保持 5 帧/秒
            }
            // 之后不再改变，舍弃多余帧的逻辑由降低发送频率自然实现
        }

        sendThumbnail() {
            if (!this.socket || !this.socket.connected) return;
            const video = this.elements.cameraFeed;
            if (!video.videoWidth) return;

            const now = performance.now();

            // 首次发送时启动 2 秒评估定时器
            if (!this.thumbnailModeDecided && this.thumbnailFastStartTime === null) {
             this.thumbnailFastStartTime = now;
             this.thumbnailModeCheckTimer = setTimeout(() => {
              this._evaluateThumbnailMode();
           }, 2000);
       }

            const sendTime = now;
            const targetHeight = Math.round(THUMBNAIL_WIDTH * video.videoHeight / video.videoWidth);
            const canvas = document.createElement('canvas');
            canvas.width = THUMBNAIL_WIDTH;
            canvas.height = targetHeight;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, THUMBNAIL_WIDTH, targetHeight);
            const imageBase64 = canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY);

            this.socket.emit('thumbnail', { image: imageBase64 }, (response) => {
                const rtt = performance.now() - sendTime;
                this._updateThumbnailRtt(rtt);
            });
        }



        _handleStreamEnded() {
            console.warn('摄像头流意外终止');
            if (this.cameraStream) {
                this.cameraStream.getTracks().forEach(t => t.stop());
                this.cameraStream = null;
            }
            this._closeCamera();
        }

        async toggleCamera() {
            if (this.cameraStream) {
                this._closeCamera();
            } else {
                try {
                    if (typeof Hands === 'undefined') {
                        if (!this._logMediaPipeFallback) {
                            console.warn('⚠️ MediaPipe Hands 库未加载，将使用降级模式');
                            this._logMediaPipeFallback = true;
                        }
                        this.useMediaPipe = false;
                    } else {
                        if (!this.hands) {
                            this.hands = new Hands({
                                locateFile: (file) => `https://fastly.jsdelivr.net/npm/@mediapipe/hands/${file}`
                            });
                            this.hands.setOptions({
                                maxNumHands: 2,
                                modelComplexity: 1,
                                minDetectionConfidence: 0.12,
                                minTrackingConfidence: 0.12
                            });
                            this.hands.onResults((results) => this.onHandResults(results));
                            if (!this._logMediaPipeReady) {
                                console.log('✅ MediaPipe Hands 已成功加载，等待首次调用');
                                this._logMediaPipeReady = true;
                            }
                        }
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        this.useMediaPipe = true;
                    }

                    this.cameraStream = await navigator.mediaDevices.getUserMedia({
                        video: { width: 1920, height: 1080 }
                    });
                    this.elements.cameraFeed.srcObject = this.cameraStream;
                    this.elements.cameraFeed.style.transform = 'scaleX(-1)';
                    this.elements.toggleCamera.textContent = '关闭';
                    this.elements.cameraStatus.innerText = '📷 摄像头已开启';

                    this.cameraStream.getTracks().forEach(track => {
                        track.addEventListener('ended', () => {
                            if (this.cameraStream.getTracks().every(t => t.readyState === 'ended')) {
                                this._handleStreamEnded();
                            }
                        });
                    });

                    this.socket = io("https://www.hnuguitarteacher.xyz", {
                        path: '/socket.io',
                        transports: ['websocket'],
                        secure: true,
                        rejectUnauthorized: false,
                        reconnection: false,
                        timeout: 20000
                    });

                    this.socket.on('connect', () => {
                        if (!this._logSocketConnected) {
                            console.log('✅ WebSocket 连接成功，ID:', this.socket.id);
                            this._logSocketConnected = true;
                            this._logSocketDisconnected = false;
                            this._logSocketError = false;
                        }
                    });

                    this.socket.on('disconnect', (reason) => {
                        if (!this._logSocketDisconnected) {
                            console.log('❌ WebSocket 断开，原因:', reason);
                            this._logSocketDisconnected = true;
                            this._logSocketConnected = false;
                            this._logFrameOk = false;
                            this._logThumbnailOk = false;
                        }
                    });

                    this.socket.on('connect_error', (err) => {
                        if (!this._logSocketError) {
                            console.error('🚫 WebSocket 连接错误:', err);
                            this._logSocketError = true;
                            this._logFrameFail = true;
                            this._logThumbnailFail = true;
                        }
                    });

                    this.socket.on('error', (err) => {
                        if (!this._logSocketError) {
                            console.error('🚫 WebSocket 错误:', err);
                            this._logSocketError = true;
                        }
                    });

                    this.socket.on('fretboard_params', (params) => {
                        if (!this._logFretboardReady) {
                            console.log('✅ 指板参数已就绪，弦线/品丝绘制可用');
                            this._logFretboardReady = true;
                            this._logFretboardMissing = false;
                        }
                        this.fingeringDetector.setParams(params);
                        const drawingData = this._buildDrawingDataFromParams(params);
                        this.cachedDrawingData = drawingData;
                        this.drawAll();
                    });

                    this.socket.on('detection_result', this.handleDetectionResult);

                    // 等待视频元数据，固定画布像素尺寸为视频原始分辨率（不修改CSS）
                    await new Promise((resolve) => {
                        this.elements.cameraFeed.addEventListener('loadedmetadata', () => {
                            this.overlayCanvas.width = this.elements.cameraFeed.videoWidth;
                            this.overlayCanvas.height = this.elements.cameraFeed.videoHeight;
                            console.log('画布尺寸已设为:', this.overlayCanvas.width, this.overlayCanvas.height);
                            resolve();
                        }, { once: true });
                    });

                    // MediaPipe 循环
                    if (this.useMediaPipe && this.hands) {
                        let handLoopRunning = true;
                        const handLoop = async () => {
                            if (!handLoopRunning || !this.hands || !this.cameraStream) return;
                            const video = this.elements.cameraFeed;
                            if (video.readyState >= 2) {
                                try {
                                    await this.hands.send({ image: video });
                                } catch (e) {
                                    if (!this._logCameraStartFail) {
                                        console.error('❌ MediaPipe hands.send() 调用失败:', e);
                                        this._logCameraStartFail = true;
                                    }
                                }
                            }
                            if (handLoopRunning) {
                                this.animationFrameId = requestAnimationFrame(handLoop);
                            }
                        };
                        this.animationFrameId = requestAnimationFrame(handLoop);

                        const animate = () => {
                            this.drawAll();
                            if (handLoopRunning) {
                                this.animationId = requestAnimationFrame(animate);
                            }
                        };
                        this.animationId = requestAnimationFrame(animate);

                        this._handLoopRunning = () => handLoopRunning;
                        this._stopHandLoop = () => { handLoopRunning = false; };
                    } else {
                        if (!this._logMediaPipeFallback) {
                            console.log('使用降级图像发送模式');
                            this._logMediaPipeFallback = true;
                        }
                    }
                } catch (err) {
                    console.error('无法访问摄像头：' + err.message);
                    alert('无法访问摄像头：' + err.message);
                }
            }
        }

        _buildDrawingDataFromParams(params) {
            const video = this.elements.cameraFeed;
            const videoW = video.videoWidth || 1920;
            const videoH = video.videoHeight || 1080;
            const thumbW = 960;
            const scale = videoW / thumbW;
            const scaleY = scale;
            const strings = params.strings.map(s => ({
                string: s.string,
                start: [s.nut[0] * scale, s.nut[1] * scaleY],
                end: [s.bridge[0] * scale, s.bridge[1] * scaleY]
            }));
            const frets = params.frets.map(f => ({
                fret: f.fret,
                start: [f.p1[0] * scale, f.p1[1] * scaleY],
                end: [f.p2[0] * scale, f.p2[1] * scaleY]
            }));
            return {
                image_size: [videoW, videoH],
                strings: strings,
                frets: frets,
                hand_landmarks: [],
                press_points: [],
                nut_center: params.nut_center ? [params.nut_center[0] * scale, params.nut_center[1] * scaleY] : null,
                bridge_center: params.bridge_center ? [params.bridge_center[0] * scale, params.bridge_center[1] * scaleY] : null
            };
        }

        startTest() {
            if (this.testList.length === 0) {
                alert('测试列表为空');
                return;
            }
            if (!this.cameraStream) {
                alert('请先开启摄像头');
                return;
            }
            if (!this.elements.cameraFeed.videoWidth) {
                alert('摄像头未就绪，请稍后再试');
                return;
            }
            const stateSpan = document.getElementById('quickModeState');
            if (stateSpan) {
                stateSpan.textContent = QUICK_MODE ? '开' : '关';
            }
            // 不再取消 animationId，保持绘制循环运行
            if (this.timerInterval) clearInterval(this.timerInterval);

            this.sendingEnabled = true;
            this.audioResultCache = null;
            this.audioWaiting = false;
            if (this.audioVerifier) {
                this.audioVerifier.setTargetChord(this.currentChord.name);
                this.audioVerifier.start((isMatch, similarity) => {
                    this.audioResultCache = {
                        chord: isMatch ? this.currentChord.name : null,
                        confidence: similarity
                    };
                    if (this.audioWaiting) {
                        this._handleAudioReady();
                    }
                }, (err) => console.error('[音频]', err));
            }

            this.testMode = true;
            if (!document.body.classList.contains('video-overlay-active')) {
                document.body.classList.add('video-overlay-active');
                const fullscreenBtn = document.getElementById('fullscreenVideoBtn');
                if (fullscreenBtn) {
                    fullscreenBtn.innerHTML = '<i class="fas fa-compress" aria-hidden="true"></i> 退出全屏';
                }
            }
            this.stats = { correct: 0, wrong: 0 };
            this.updateStats();
            this.testResults = new Array(this.testList.length).fill(null);
            this.currentTestIndex = 0;
            this.recordedForCurrentChord = false;
            this.goToTestIndex(0);


            this.timerInterval = setInterval(() => {
                if (this.testMode && this.chordStartTime) {
                    const elapsed = (Date.now() - this.chordStartTime) / 1000;
                    this.elements.currentTimeDisplay.textContent = elapsed.toFixed(1) + ' s';
                } else {
                    this.elements.currentTimeDisplay.textContent = '0.0 s';
                }
            }, 100);

            if (this.elements.trainLayout) {
                this.elements.trainLayout.classList.add('test-mode');
            }
            this.renderTestList();

            if (this.elements.videoContainer) {
                this.elements.videoContainer.classList.add('video-expanded');
            }

            const layout = this.elements.trainLayout;
            if (layout.requestFullscreen) {
                layout.requestFullscreen();
            } else if (layout.webkitRequestFullscreen) {
                layout.webkitRequestFullscreen();
            } else if (layout.msRequestFullscreen) {
                layout.msRequestFullscreen();
            }
        }

        bindEvents() {
            const quickBtn = document.getElementById('toggleQuickMode');
            const quickState = document.getElementById('quickModeState');
            if (quickBtn && quickState) {
                quickState.textContent = QUICK_MODE ? '开' : '关';
                quickBtn.addEventListener('click', () => {
                    QUICK_MODE = !QUICK_MODE;
                    quickState.textContent = QUICK_MODE ? '开' : '关';
                    console.log('快速模式', QUICK_MODE ? '已开启' : '已关闭');
                });
            }

            this.elements.chordSelect.addEventListener('change', () => {
                const id = this.elements.chordSelect.value;
                this.currentChord = this.chords.find(c => c.id === id);
                if (this.currentChord) {
                    this.elements.selChordName.textContent = this.currentChord.name;
                    this.elements.selChordDesc.textContent = this.currentChord.description;
                    this.elements.currentChordName.textContent = this.currentChord.name;
                    this.elements.chordDescription.textContent = this.currentChord.description;
                    this.elements.chordDetailContent.textContent = this.currentChord.detail;
                    this.renderStandardDots(this.currentChord);
                    if (this.elements.difficultyBadge) {
                        const difficulty = this.currentChord.difficulty || 1;
                        this.elements.difficultyBadge.textContent = '难度' + difficulty;
                    }
                }
            });

            this.elements.addToTestBtn.addEventListener('click', () => {
                if (this.currentChord && !this.testList.includes(this.currentChord.id)) {
                    this.testList.push(this.currentChord.id);
                    this.testResults = new Array(this.testList.length).fill(null);
                    this.renderTestList();
                    this.updateProgress();
                    this.syncTestListToLocalStorage();
                }
            });

            this.elements.clearTestBtn.addEventListener('click', () => {
                this.testList = [];
                this.testResults = [];
                this.renderTestList();
                this.stats = { correct: 0, wrong: 0 };
                this.updateStats();
                this.elements.progressDisplay.textContent = '0/0';
                this.elements.currentTimeDisplay.textContent = '0.0 s';
                if (this.testMode) {
                    this.stopTestAndSending();
                }
                localStorage.removeItem('pendingSoloChords');
            });

            this.elements.toggleCamera.addEventListener('click', () => this.toggleCamera());
            this.elements.startTestBtn.addEventListener('click', () => this.startTest());
            this.elements.skipBtn.addEventListener('click', () => {
                if (!this.testMode) {
                    alert('请先开始测试');
                    return;
                }
                if (this.recordedForCurrentChord) {
                    alert('当前和弦已记录，不能再次跳过');
                    return;
                }
                this.recordSkip();
            });

            window.addEventListener('resize', () => {
                if (this.currentChord) this.renderStandardDots(this.currentChord);
            });

            const popupBtn = document.getElementById('chordPopupBtn');
            const chordModal = document.getElementById('chordModal');
            const searchInput = document.getElementById('chordPopupSearch');
            if (popupBtn) {
                popupBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    chordModal.classList.toggle('active');
                });
            }
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    this.renderPopupList(e.target.value);
                });
            }
            document.addEventListener('click', (e) => {
                if (chordModal && chordModal.classList.contains('active') && !chordModal.contains(e.target) && e.target !== popupBtn) {
                    chordModal.classList.remove('active');
                }
            });
        }

        cleanup() {
            this.sendingEnabled = false;
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
            if (this._stopHandLoop) {
                this._stopHandLoop();
            }
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (this.camera) {
                this.camera.stop();
            }
            if (this.cameraStream) {
                this.cameraStream.getTracks().forEach(t => t.stop());
            }
            if (this.socket) {
                this.socket.disconnect();
            }
            if (this.audioVerifier) this.audioVerifier.stop();
            this._resetDebugFlags();
            document.removeEventListener('fullscreenchange', this._onFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', this._onFullscreenChange);
            document.removeEventListener('msfullscreenchange', this._onFullscreenChange);
        }
    }

    // 启动应用
    new GuitarTrainApp();
})();