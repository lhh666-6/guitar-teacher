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

            // DOM 元素缓存
            this.cacheElements();

            // 初始化粒子背景
            this.createParticles();

            // 加载和弦数据
            this.loadChords();

            // 绑定事件
            this.bindEvents();

            // 窗口卸载清理
            window.addEventListener('beforeunload', () => this.cleanup());
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
                fullscreenVideoBtn: document.getElementById('fullscreenVideoBtn'),
                cameraStatus: document.getElementById('cameraStatus'),
                startTestBtn: document.getElementById('startTestBtn'),
                clearTestBtn: document.getElementById('clearTestBtn'),
                addToTestBtn: document.getElementById('addToTestBtn'),
                skipBtn: document.getElementById('skipBtn'),
                resultModal: document.getElementById('resultModal'),
                resultModalTitle: document.getElementById('resultModalTitle'),
                resultModalBody: document.getElementById('resultModalBody'),
                resultModalConfirmBtn: document.getElementById('resultModalConfirmBtn'),
                chordDetailContent: document.getElementById('chordDetailContent'),
                progressDisplay: document.getElementById('progressDisplay'),
                currentTimeDisplay: document.getElementById('currentTimeDisplay'),
                fretboardMini: document.getElementById('fretboardMini'),
                trainLayout: document.querySelector('.train-layout'),
                videoContainer: document.querySelector('.camera-container'),
                difficultyBadge: document.getElementById('difficultyBadge')
            };

            this.updateSkipButtonState();
            this.updateStartButtonState();

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

        getDifficultyLabel(difficulty) {
            return `难度 ${difficulty}`;
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
                const difficultyLabel = this.getDifficultyLabel(chord.difficulty || 1);
                option.textContent = `${chord.name} ${difficultyLabel}`;
                select.appendChild(option);
            });

            if (this.chords.length > 0) {
                select.value = this.chords[0].id;
                select.dispatchEvent(new Event('change'));
            }

            // 从 localStorage 加载驾驶舱页面添加的待训练和弦
            this.loadPendingChordsFromLocalStorage();
        }

        // 从 localStorage 加载待训练和弦
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
                // 可选：加载后不清除，保留用于驾驶舱状态同步
            } catch(e) {
                console.warn('解析待训练和弦失败', e);
            }
        }

        // 同步当前 testList 到 localStorage（供驾驶舱读取）
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
                        statusSpan.innerHTML = `<span class="test-badge-correct"><i class="fas fa-check" aria-hidden="true"></i></span> <span class="test-item-time">${res.time.toFixed(1)}s</span>`;
                    } else {
                        statusSpan.innerHTML = `<span class="test-badge-wrong"><i class="fas fa-xmark" aria-hidden="true"></i></span> <span class="test-item-time">--</span>`;
                    }
                } else {
                    statusSpan.innerHTML = `<span class="test-badge-pending"><i class="fas fa-hourglass-half" aria-hidden="true"></i></span>`;
                }

                item.appendChild(nameSpan);
                item.appendChild(diffSpan);
                item.appendChild(statusSpan);
                div.appendChild(item);
            });
            this.elements.testCountSpan.textContent = this.testList.length;
        }

        updateSkipButtonState() {
            if (!this.elements.skipBtn) return;
            const canSkip = this.testMode && this.testList.length > 0 && !this.recordedForCurrentChord;
            this.elements.skipBtn.disabled = !canSkip;
        }

        updateProgress() {
            if (this.testMode && this.testList.length > 0) {
                this.elements.progressDisplay.textContent = `${this.currentTestIndex + 1}/${this.testList.length}`;
            } else {
                this.elements.progressDisplay.textContent = `0/0`;
            }
            this.updateSkipButtonState();
        }

        updateStartButtonState() {
            if (!this.elements.startTestBtn) return;
            if (this.testMode) {
                this.elements.startTestBtn.innerHTML = '<i class="fas fa-stop" aria-hidden="true"></i> 停止测试';
                this.elements.startTestBtn.classList.remove('btn-primary');
                this.elements.startTestBtn.classList.add('btn-danger');
            } else {
                this.elements.startTestBtn.innerHTML = '<i class="fas fa-play" aria-hidden="true"></i> 开始测试';
                this.elements.startTestBtn.classList.remove('btn-danger');
                this.elements.startTestBtn.classList.add('btn-primary');
            }
        }

        openVideoFullscreen() {
            const enabled = !document.body.classList.contains('video-overlay-active');
            this.setVideoOverlayMode(enabled);
        }

        showResultModal(title, lines) {
            if (!this.elements.resultModal) return;
            this.elements.resultModalTitle.textContent = title;
            this.elements.resultModalBody.textContent = Array.isArray(lines) ? lines.join('\n') : String(lines || '');
            this.elements.resultModal.classList.add('show');
        }

        hideResultModal() {
            if (!this.elements.resultModal) return;
            this.elements.resultModal.classList.remove('show');
        }

        scheduleFretboardRerender() {
            if (!this.currentChord) return;

            const rerender = () => {
                if (!this.currentChord) return;
                this.renderStandardDots(this.currentChord);
            };

            requestAnimationFrame(() => {
                requestAnimationFrame(rerender);
            });

            setTimeout(rerender, 180);
        }

        setVideoOverlayMode(enabled) {
            document.body.classList.toggle('video-overlay-active', enabled);
            if (this.elements.fullscreenVideoBtn) {
                this.elements.fullscreenVideoBtn.innerHTML = enabled
                    ? '<i class="fas fa-compress" aria-hidden="true"></i> 退出全屏'
                    : '<i class="fas fa-expand" aria-hidden="true"></i> 全屏';
            }
            this.scheduleFretboardRerender();
        }

        async ensureCameraReady() {
            if (!this.cameraStream) {
                await this.toggleCamera();
            }
            if (!this.cameraStream) {
                return false;
            }
            if (this.elements.cameraFeed.videoWidth) {
                return true;
            }
            await new Promise((resolve) => {
                this.elements.cameraFeed.addEventListener('loadedmetadata', resolve, { once: true });
            });
            return !!this.elements.cameraFeed.videoWidth;
        }

        showErrorModal(message) {
            this.showResultModal('提示', message);
        }

        stopTestAndSending(showSummary = false) {
            const summary = {
                correct: this.stats.correct,
                wrong: this.stats.wrong,
                total: this.stats.correct + this.stats.wrong,
                avgTime: this.testResults.filter(r => r && r.correct).reduce((acc, r) => acc + r.time, 0) / (this.stats.correct || 1)
            };

            this.sendingEnabled = false;
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
            this.testMode = false;
            this.recordedForCurrentChord = false;
            this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
            if (this.elements.trainLayout) {
                this.elements.trainLayout.classList.remove('test-mode');
            }
            this.setVideoOverlayMode(false);
            this.updateStartButtonState();

            const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
            if (fullscreenElement) {
                if (document.exitFullscreen) {
                    document.exitFullscreen().catch(() => {});
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                }
            }
            this.updateSkipButtonState();

            if (showSummary) {
                this.showResultModal('测试完成', [
                    `正确：${summary.correct}`,
                    `错误：${summary.wrong}`,
                    `平均正确用时：${summary.avgTime.toFixed(2)} 秒`
                ]);
            }
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
                this.updateProgress();
                this.updateSkipButtonState();
            }
        }

        moveToNextTest() {
            if (this.currentTestIndex + 1 >= this.testList.length) {
                this.stopTestAndSending(true);
                this.elements.progressDisplay.textContent = `${this.testList.length}/${this.testList.length}`;
                this.elements.currentTimeDisplay.textContent = '0.0 s';
                this.updateSkipButtonState();
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
            this.updateSkipButtonState();
            this.renderTestList();

            fetch('/api/save_record', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chord_name: this.currentChord.name,
                    correct: true,
                    time_spent: elapsed
                })
            }).catch(err => console.error('保存记录失败:', err));

            this.moveToNextTest();
        }

        recordSkip() {
            if (!this.testMode || this.recordedForCurrentChord) return;
            this.testResults[this.currentTestIndex] = { correct: false, time: null };
            this.stats.wrong++;
            this.updateStats();
            this.recordedForCurrentChord = true;
            this.updateSkipButtonState();
            this.renderTestList();

            fetch('/api/save_record', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chord_name: this.currentChord.name,
                    correct: false,
                    time_spent: 0.0
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
                    allPositions.push({
                        ...pos,
                        type: 'standard',
                        correct: false
                    });
                });
            }
            userPositions.forEach(up => {
                allPositions.push({
                    string: up.string,
                    fret: up.fret,
                    type: 'user',
                    correct: up.correct
                });
            });

            const allBarres = [];
            if (chord && chord.barre) {
                allBarres.push({
                    ...chord.barre,
                    type: 'standard',
                    correct: false
                });
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
            validFrets.forEach((fret, idx) => {
                fretToCol[fret] = idx;
            });

            allPositions.forEach(p => {
                if (!(p.fret in fretToCol)) return;
                const colIndex = fretToCol[p.fret];
                const idx = this.backendToDisplayIndex(p.string);
                const x = baseX + colIndex * fretSpacing + fretSpacing / 2;
                const y = baseY + idx * stringSpacing;

                const dot = document.createElement('div');
                dot.className = `dot ${p.type === 'standard' ? 'standard' : (p.correct ? 'user-correct' : 'user-wrong')}`;
                dot.style.left = x + 'px';
                dot.style.top = y + 'px';
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

        drawAll() {
            if (!this.overlayCanvas) return;
            const ctx = this.overlayCtx;
            const w = this.overlayCanvas.width;
            const h = this.overlayCanvas.height;

            ctx.clearRect(0, 0, w, h);

            if (this.cachedDrawingData) {
                drawOverlay(ctx, w, h, this.cachedDrawingData);
            }

            if (this.latestLocalLandmarks) {
                drawLocalHandLandmarks(ctx, w, h, this.latestLocalLandmarks);
            }
        }

        handleDetectionResult = (data) => {
            const receiveTime = performance.now();
            if (this.lastFrameSendTime > 0) {
                const totalDelay = receiveTime - this.lastFrameSendTime;
                console.log(`📡 总延迟: ${totalDelay.toFixed(1)} ms`);
            }

            console.log('收到检测结果:', data);

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

                const isCorrect = window.validateVisual(
                    visualResult.positions,
                    visualResult.barre,
                    this.currentChord
                );

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

                const processEnd = performance.now();
                console.log(`⚙️ 结果处理耗时: ${(processEnd - processStart).toFixed(2)} ms`);

                if (isCorrect && !this.recordedForCurrentChord) {
                    this.recordCorrect();
                }

                this.renderStandardDots(this.currentChord, userPositions, userBarre);
            }
        }

        onHandResults(results) {
            const now = performance.now();
            if (!this.testMode || !this.sendingEnabled) return;

            if (now - this.lastLandmarkSendTime < LANDMARK_SEND_INTERVAL) {
                return;
            }
            this.lastLandmarkSendTime = now;

            let targetHandIndex = -1;
            if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                let minAvgX = Infinity;
                for (let i = 0; i < results.multiHandLandmarks.length; i++) {
                    const landmarks = results.multiHandLandmarks[i];
                    if (!landmarks) continue;
                    let sumX = 0;
                    for (let j = 0; j < landmarks.length; j++) {
                        sumX += landmarks[j].x;
                    }
                    const avgX = sumX / landmarks.length;
                    if (avgX < minAvgX) {
                        minAvgX = avgX;
                        targetHandIndex = i;
                    }
                }
            }
            if (targetHandIndex === -1) {
                this.latestLocalLandmarks = null;
                return;
            }

            const landmarks = results.multiHandLandmarks[targetHandIndex];
            if (!landmarks) {
                this.latestLocalLandmarks = null;
                return;
            }

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

            this.lastFrameSendTime = now;
            this.socket.emit('hand_landmarks', {
                landmarks: smoothed.map(p => [p.x, p.y]),
                timestamp: now,
                img_width: this.elements.cameraFeed.videoWidth,
                img_height: this.elements.cameraFeed.videoHeight
            });

            if (now - this.lastThumbnailTime > THUMBNAIL_INTERVAL) {
                this.sendThumbnail();
                this.lastThumbnailTime = now;
            }
        }

        sendThumbnail() {
            if (!this.socket || !this.socket.connected) return;
            const video = this.elements.cameraFeed;
            if (!video.videoWidth) return;

            const targetHeight = Math.round(THUMBNAIL_WIDTH * video.videoHeight / video.videoWidth);
            const canvas = document.createElement('canvas');
            canvas.width = THUMBNAIL_WIDTH;
            canvas.height = targetHeight;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, THUMBNAIL_WIDTH, targetHeight);
            const imageBase64 = canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY);
            this.socket.emit('thumbnail', { image: imageBase64 });
        }

        sendAudio() {}

        async toggleCamera() {
            if (this.cameraStream) {
                const wasTesting = this.testMode;
                const stopSummary = wasTesting ? {
                    completed: this.currentTestIndex,
                    total: this.testList.length,
                    correct: this.stats.correct,
                    wrong: this.stats.wrong
                } : null;
                this.stopTestAndSending(false);
                this.sendingEnabled = false;
                // ✅ 修改：统一清理动画帧
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
                this.cameraStream.getTracks().forEach(t => t.stop());
                this.cameraStream = null;
                this.elements.cameraFeed.srcObject = null;
                this.elements.cameraFeed.style.transform = '';
                this.elements.toggleCamera.innerHTML = '<i class="fas fa-video" aria-hidden="true"></i> 开启摄像头';
                this.elements.cameraStatus.innerHTML = '<i class="fas fa-camera" aria-hidden="true"></i> 摄像头已关闭';
                if (this.socket) {
                    this.socket.disconnect();
                    if (this.socket.close) this.socket.close();
                    this.socket = null;
                }
                this.testMode = false;
                this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
                if (this.elements.trainLayout) {
                    this.elements.trainLayout.classList.remove('test-mode');
                }
                this.filters = [];
                this.latestLocalLandmarks = null;
                this.cachedDrawingData = null;
                if (wasTesting && stopSummary) {
                    this.showResultModal('测试已结束', [
                        '摄像头已关闭，本次测试已结束。',
                        `已完成进度：${stopSummary.completed}/${stopSummary.total}`,
                        `正确：${stopSummary.correct}`,
                        `错误：${stopSummary.wrong}`
                    ]);
                }
            } else {
                try {
                    if (typeof Hands === 'undefined') {
                        console.warn('MediaPipe Hands 库未加载，将使用降级模式');
                        this.useMediaPipe = false;
                    } else {
                        if (!this.hands) {
                            this.hands = new Hands({
                                locateFile: (file) => `https://fastly.jsdelivr.net/npm/@mediapipe/hands/${file}`
                            });
                            this.hands.setOptions({
                                maxNumHands: 1,
                                modelComplexity: 1,
                                minDetectionConfidence: 0.12,
                                minTrackingConfidence: 0.12
                            });
                            this.hands.onResults((results) => this.onHandResults(results));
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            this.useMediaPipe = true;
                        }
                    }

                    this.cameraStream = await navigator.mediaDevices.getUserMedia({
                        video: { width: 1920, height: 1080 }
                    });
                    this.elements.cameraFeed.srcObject = this.cameraStream;
                    this.elements.cameraFeed.style.transform = 'scaleX(-1)';
                    this.elements.toggleCamera.innerHTML = '<i class="fas fa-video" aria-hidden="true"></i> 关闭摄像头';
                    this.elements.cameraStatus.innerHTML = '<i class="fas fa-camera" aria-hidden="true"></i> 摄像头已开启';

                    // ✅ 修改：Socket.IO 配置支持自签名证书，且禁止自动重连（由按钮手动控制）
                    this.socket = io({
                        path: '/socket.io',
                        transports: ['websocket', 'polling'],
                        secure: true,
                        rejectUnauthorized: false,      // 允许自签名证书（仅测试环境，生产环境请移除）
                        reconnection: false,            // 禁止自动重连，完全由按钮控制
                        timeout: 20000
                    });

                    this.socket.on('connect', () => {
                        console.log('✅ WebSocket 连接成功，ID:', this.socket.id);
                    });
                    this.socket.on('disconnect', (reason) => {
                        console.log('❌ WebSocket 断开，原因:', reason);
                    });
                    this.socket.on('connect_error', (err) => {
                        console.error('🚫 WebSocket 连接错误:', err);
                    });
                    this.socket.on('error', (err) => {
                        console.error('🚫 WebSocket 错误:', err);
                    });
                    this.socket.on('detection_result', this.handleDetectionResult);

                    await new Promise((resolve) => {
                        this.elements.cameraFeed.addEventListener('loadedmetadata', () => {
                            this.overlayCanvas.width = this.elements.cameraFeed.videoWidth;
                            this.overlayCanvas.height = this.elements.cameraFeed.videoHeight;
                            console.log('画布尺寸已设为:', this.overlayCanvas.width, this.overlayCanvas.height);
                            resolve();
                        }, { once: true });
                    });

                    if (this.useMediaPipe && this.hands) {
                        this.camera = new Camera(this.elements.cameraFeed, {
                            onFrame: async () => {
                                await this.hands.send({ image: this.elements.cameraFeed });
                            },
                            width: 1920,
                            height: 1080
                        });
                        this.camera.start();

                        if (this.animationFrameId) {
                            cancelAnimationFrame(this.animationFrameId);
                        }
                        const animate = () => {
                            this.drawAll();
                            this.animationFrameId = requestAnimationFrame(animate);
                        };
                        this.animationFrameId = requestAnimationFrame(animate);
                    } else {
                        console.log('使用降级图像发送模式');
                    }
                } catch (err) {
                    this.showErrorModal('无法访问摄像头：' + err.message);
                }
            }
        }

        async restartCameraProcessingIfNeeded() {
            if (!this.cameraStream || !this.useMediaPipe || !this.hands || !this.elements.cameraFeed) {
                return;
            }

            if (this.camera) {
                this.camera.stop();
                this.camera = null;
            }

            this.camera = new Camera(this.elements.cameraFeed, {
                onFrame: async () => {
                    await this.hands.send({ image: this.elements.cameraFeed });
                },
                width: 1920,
                height: 1080
            });
            this.camera.start();

            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
            }
            const animate = () => {
                this.drawAll();
                this.animationFrameId = requestAnimationFrame(animate);
            };
            this.animationFrameId = requestAnimationFrame(animate);
        }

        async startTest() {
            if (this.testList.length === 0) {
                this.showErrorModal('测试列表为空');
                return;
            }

            const cameraReady = await this.ensureCameraReady();
            if (!cameraReady) {
                this.showErrorModal('无法开启摄像头，请检查权限后重试');
                return;
            }
            if (!this.elements.cameraFeed.videoWidth) {
                this.showErrorModal('摄像头未就绪，请稍后再试');
                return;
            }

            if (this.animationId) cancelAnimationFrame(this.animationId);
            if (this.timerInterval) clearInterval(this.timerInterval);

            await this.restartCameraProcessingIfNeeded();

            this.hideResultModal();
            this.sendingEnabled = true;
            this.testMode = true;
            this.updateStartButtonState();
            this.stats = { correct: 0, wrong: 0 };
            this.updateStats();
            this.testResults = new Array(this.testList.length).fill(null);
            this.currentTestIndex = 0;
            this.recordedForCurrentChord = false;

            this.goToTestIndex(0);

            if (!this.useMediaPipe || !this.hands) {
                this.sendFrame();
            }

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
        }

        sendFrame = () => {
            if (!this.sendingEnabled) return;
            if (!this.elements.cameraFeed.videoWidth || !this.socket || !this.socket.connected) {
                this.animationId = requestAnimationFrame(this.sendFrame);
                return;
            }
            const now = Date.now();
            if (now - this.lastSendTime < FRAME_INTERVAL) {
                this.animationId = requestAnimationFrame(this.sendFrame);
                return;
            }
            this.lastSendTime = now;

            const canvas = document.createElement('canvas');
            canvas.width = this.elements.cameraFeed.videoWidth;
            canvas.height = this.elements.cameraFeed.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(this.elements.cameraFeed, 0, 0, canvas.width, canvas.height);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            const imageBase64 = canvas.toDataURL('image/jpeg', 0.8);
            this.socket.emit('frame', { image: imageBase64 });
            this.animationId = requestAnimationFrame(this.sendFrame);
        }

        bindEvents() {
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

            // 添加和弦：同步更新 localStorage
            this.elements.addToTestBtn.addEventListener('click', () => {
                if (this.currentChord && !this.testList.includes(this.currentChord.id)) {
                    this.testList.push(this.currentChord.id);
                    this.testResults = new Array(this.testList.length).fill(null);
                    this.renderTestList();
                    this.updateProgress();
                    this.syncTestListToLocalStorage();
                }
            });

            // 清空列表：同步清空 localStorage
            this.elements.clearTestBtn.addEventListener('click', () => {
                this.testList = [];
                this.testResults = [];
                this.recordedForCurrentChord = false;
                this.renderTestList();
                this.stats = { correct: 0, wrong: 0 };
                this.updateStats();
                this.elements.progressDisplay.textContent = '0/0';
                this.elements.currentTimeDisplay.textContent = '0.0 s';
                if (this.testMode) {
                    this.stopTestAndSending();
                }
                this.updateSkipButtonState();
                localStorage.removeItem('pendingSoloChords');
            });

            this.elements.toggleCamera.addEventListener('click', () => this.toggleCamera());
            this.elements.fullscreenVideoBtn.addEventListener('click', () => this.openVideoFullscreen());
            this.elements.startTestBtn.addEventListener('click', () => {
                if (this.testMode) {
                    this.stopTestAndSending(false);
                    this.showResultModal('测试已停止', [
                        `已完成进度：${this.currentTestIndex}/${this.testList.length}`,
                        `正确：${this.stats.correct}`,
                        `错误：${this.stats.wrong}`
                    ]);
                    this.elements.currentTimeDisplay.textContent = '0.0 s';
                    return;
                }
                this.startTest().catch(err => {
                    console.error('开始测试失败:', err);
                    this.showErrorModal('开始测试失败，请稍后重试');
                });
            });
            this.elements.resultModalConfirmBtn.addEventListener('click', () => this.hideResultModal());
            document.addEventListener('fullscreenchange', () => {
                if (!document.fullscreenElement) {
                    this.setVideoOverlayMode(false);
                }
            });
            document.addEventListener('webkitfullscreenchange', () => {
                if (!document.webkitFullscreenElement) {
                    this.setVideoOverlayMode(false);
                }
            });
            this.elements.skipBtn.addEventListener('click', () => {
                if (this.elements.skipBtn.disabled) {
                    return;
                }
                this.recordSkip();
            });

            window.addEventListener('resize', () => {
                if (this.currentChord) this.renderStandardDots(this.currentChord);
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
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (this.camera) {
                this.camera.stop();
                this.camera = null;
            }
            if (this.cameraStream) {
                this.cameraStream.getTracks().forEach(t => t.stop());
            }
            if (this.socket) {
                this.socket.disconnect();
            }
        }
    }

    // 启动应用
    new GuitarTrainApp();
})();
