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
                videoContainer: document.querySelector('.camera-container')
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
                    barre: chord.barre
                }));
            } catch (err) {
                console.warn('加载和弦失败，使用默认数据', err);
                this.chords = DEFAULT_CHORDS.map((chord, index) => ({
                    id: `chord_${index}`,
                    name: chord.name,
                    description: chord.desc,
                    detail: chord.desc,
                    positions: chord.positions,
                    barre: chord.barre
                }));
            }

            this.chords.forEach(chord => {
                const option = document.createElement('option');
                option.value = chord.id;
                option.textContent = chord.name;
                this.elements.chordSelect.appendChild(option);
            });

            if (this.chords.length > 0) {
                this.elements.chordSelect.value = this.chords[0].id;
                this.elements.chordSelect.dispatchEvent(new Event('change'));
            }
        }

        backendToDisplayIndex(backendString) {
            return STRING_COUNT - 1;
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
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
            this.testMode = false;
            this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
            if (this.elements.trainLayout) {
                this.elements.trainLayout.classList.remove('test-mode');
            }
            if (this.elements.videoContainer) {
                this.elements.videoContainer.classList.remove('video-expanded');
            }
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
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

                this.recordedForCurrentChord = false;
                this.chordStartTime = Date.now();
                this.updateProgress();
            }
        }

        moveToNextTest() {
            if (this.currentTestIndex + 1 >= this.testList.length) {
                this.stopTestAndSending();
                this.testMode = false;
                const total = this.stats.correct + this.stats.wrong;
                const avgTime = this.testResults.filter(r => r && r.correct).reduce((acc, r) => acc + r.time, 0) / (this.stats.correct || 1);
                alert(`✅ 测试完成！\n正确: ${this.stats.correct}, 错误: ${this.stats.wrong}\n平均正确用时: ${avgTime.toFixed(2)} 秒`);
                this.elements.progressDisplay.textContent = `${this.testList.length}/${this.testList.length}`;
                this.elements.currentTimeDisplay.textContent = '0.0 s';
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
            this.moveToNextTest();
        }

        recordSkip() {
            if (!this.testMode || this.recordedForCurrentChord) return;
            this.testResults[this.currentTestIndex] = { correct: false, time: null };
            this.stats.wrong++;
            this.updateStats();
            this.recordedForCurrentChord = true;
            this.renderTestList();
            this.moveToNextTest();
        }

        // ---------- 渲染标准指板（mini指板）----------
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

            // 调整琴弦位置
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

            // 品柱
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

            // 标准横按
            if (chord && chord.barre) {
                const barre = chord.barre;
                const barreDiv = this.createBarreElement(barre, baseX, baseY, fretSpacing, stringSpacing, 'standard');
                container.appendChild(barreDiv);
            }

            // 标准按点
            if (chord && chord.positions) {
                chord.positions.forEach(pos => {
                    const dot = this.createDotElement(pos, baseX, baseY, fretSpacing, stringSpacing, 'standard');
                    container.appendChild(dot);
                });
            }

            // 用户横按
            if (userBarre) {
                const barreDiv = this.createBarreElement(userBarre, baseX, baseY, fretSpacing, stringSpacing, userBarre.correct ? 'user-correct' : 'user-wrong');
                container.appendChild(barreDiv);
            }

            // 用户按点
            userPositions.forEach(up => {
                const dot = this.createDotElement(up, baseX, baseY, fretSpacing, stringSpacing, up.correct ? 'user-correct' : 'user-wrong');
                container.appendChild(dot);
            });
        }

        // 创建单个按点元素
        createDotElement(pos, baseX, baseY, fretSpacing, stringSpacing, className) {
            const dot = document.createElement('div');
            dot.className = `dot ${className}`;
            const idx = this.backendToDisplayIndex(pos.string);
            const x = baseX + (pos.fret - 1) * fretSpacing;
            const y = baseY + idx * stringSpacing;
            dot.style.left = (x - DOT_RADIUS) + 'px';
            dot.style.top = (y - DOT_RADIUS) + 'px';
            dot.textContent = pos.fret;
            return dot;
        }

        // 创建横按元素
        createBarreElement(barre, baseX, baseY, fretSpacing, stringSpacing, className) {
            const barreDiv = document.createElement('div');
            barreDiv.className = `barre ${className}`;
            const startIdx = this.backendToDisplayIndex(barre.startString);
            const endIdx = this.backendToDisplayIndex(barre.endString);
            const idxMin = Math.min(startIdx, endIdx);
            const idxMax = Math.max(startIdx, endIdx);
            const yStart = baseY + idxMin * stringSpacing;
            const yEnd = baseY + idxMax * stringSpacing;
            const topY = Math.min(yStart, yEnd) - DOT_RADIUS;
            const bottomY = Math.max(yStart, yEnd) + DOT_RADIUS;
            const height = bottomY - topY;
            const x = baseX + (barre.fret - 1) * fretSpacing;
            barreDiv.style.left = (x - 4) + 'px';
            barreDiv.style.top = topY + 'px';
            barreDiv.style.height = height + 'px';
            barreDiv.style.width = '8px';
            barreDiv.style.backgroundColor = className.includes('correct') ? '#28a745' : '#dc3545';
            barreDiv.style.opacity = '0.9';
            barreDiv.style.borderRadius = '4px';
            barreDiv.style.position = 'absolute';
            return barreDiv;
        }

        // ---------- 统一绘制函数（由动画循环调用）----------
        drawAll() {
            if (!this.overlayCanvas) return;
            const ctx = this.overlayCtx;
            const w = this.overlayCanvas.width;
            const h = this.overlayCanvas.height;

            ctx.clearRect(0, 0, w, h);

            // 绘制缓存的后端数据（琴弦、品丝、按弦点）
            if (this.cachedDrawingData) {
                drawOverlay(ctx, w, h, this.cachedDrawingData);
            }

            // 绘制实时手部关键点
            if (this.latestLocalLandmarks) {
                drawLocalHandLandmarks(ctx, w, h, this.latestLocalLandmarks);
            }
        }

        // ---------- WebSocket 结果处理（修改点：使用独立验证函数）----------
        handleDetectionResult = (data) => {
            const receiveTime = performance.now();
            if (this.lastFrameSendTime > 0) {
                const totalDelay = receiveTime - this.lastFrameSendTime;
                console.log(`📡 总延迟: ${totalDelay.toFixed(1)} ms`);
            }

            console.log('收到检测结果:', data);

            if (data.drawing_data) {
                // 缓存最新的绘图数据
                this.cachedDrawingData = data.drawing_data;
            }

            if (!this.testMode || !this.currentChord) return;

            if (data.status === 'success') {
                const processStart = performance.now();

                // 准备视觉结果
                const visualResult = {
                    positions: data.positions || [],
                    barre: data.barre || null
                };

                // 调用独立验证函数判断是否正确（纯视觉，未来可替换为融合）
                const isCorrect = window.validateVisual(
                    visualResult.positions,
                    visualResult.barre,
                    this.currentChord
                );

                // 准备用于 mini 指板显示的用户数据（保留 correct 标记，用于颜色区分）
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

                // 更新 mini 指板显示
                this.renderStandardDots(this.currentChord, userPositions, userBarre);
            }
        }

        // ---------- MediaPipe 结果回调（与您原有代码相同，但确保使用常量）----------
        onHandResults(results) {
            const now = performance.now();
            if (!this.testMode || !this.sendingEnabled) return;

            // 节流：30fps
            if (now - this.lastLandmarkSendTime < LANDMARK_SEND_INTERVAL) {
                return;
            }
            this.lastLandmarkSendTime = now;

            // 选择最左边的手
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

            // 应用 OneEuroFilter 平滑
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

            // 发送关键点到后端
            this.lastFrameSendTime = now;
            this.socket.emit('hand_landmarks', {
                landmarks: smoothed.map(p => [p.x, p.y]),
                timestamp: now,
                img_width: this.elements.cameraFeed.videoWidth,
                img_height: this.elements.cameraFeed.videoHeight
            });

            // 定时发送缩略图
            if (now - this.lastThumbnailTime > THUMBNAIL_INTERVAL) {
                this.sendThumbnail();
                this.lastThumbnailTime = now;
            }
        }

        // ---------- 发送缩略图 ----------
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

        // ===== 音频预留 =====
        sendAudio() {
            // 暂未实现
        }

        // ---------- 摄像头开关（动态加载 MediaPipe）----------
        async toggleCamera() {
            if (this.cameraStream) {
                // 关闭摄像头
                this.sendingEnabled = false;
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
                this.elements.toggleCamera.textContent = '开启';
                this.elements.cameraStatus.innerText = '📷 摄像头已关闭';
                if (this.socket) {
                    this.socket.disconnect();
                    if (this.socket.close) this.socket.close();
                    this.socket = null;
                }
                if (this.animationId) {
                    cancelAnimationFrame(this.animationId);
                    this.animationId = null;
                }
                this.testMode = false;
                this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
                if (this.elements.trainLayout) {
                    this.elements.trainLayout.classList.remove('test-mode');
                }
                this.filters = [];
                this.latestLocalLandmarks = null;
                this.cachedDrawingData = null;
            } else {
                try {
                    // 动态加载 MediaPipe
                    if (typeof Hands === 'undefined') {
                        console.warn('MediaPipe Hands 库未加载，请检查脚本引入');
                        alert('MediaPipe 库加载失败，将使用降级模式');
                        this.useMediaPipe = false;
                    } else {
                        console.log('MediaPipe 库已找到，开始初始化...');
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
                            console.log('MediaPipe Hands 模型初始化完成');
                            this.useMediaPipe = true;
                        }
                    }

                    // 请求摄像头
                    this.cameraStream = await navigator.mediaDevices.getUserMedia({
                        video: { width: 1920, height: 1080 }
                    });
                    this.elements.cameraFeed.srcObject = this.cameraStream;
                    this.elements.cameraFeed.style.transform = 'scaleX(-1)';
                    this.elements.toggleCamera.textContent = '关闭';
                    this.elements.cameraStatus.innerText = '📷 摄像头已开启';
                    this.socket = io();

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
                        console.log('启动 MediaPipe 相机');
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
                    alert('无法访问摄像头：' + err.message);
                }
            }
        }

        // ---------- 开始测试 ----------
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

            if (this.animationId) cancelAnimationFrame(this.animationId);
            if (this.timerInterval) clearInterval(this.timerInterval);

            this.sendingEnabled = true;
            this.testMode = true;
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

        // ---------- 降级模式：发送帧 ----------
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

        // ---------- 绑定事件 ----------
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
                }
            });

            this.elements.addToTestBtn.addEventListener('click', () => {
                if (this.currentChord && !this.testList.includes(this.currentChord.id)) {
                    this.testList.push(this.currentChord.id);
                    this.testResults = new Array(this.testList.length).fill(null);
                    this.renderTestList();
                    this.updateProgress();
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
        }

        cleanup() {
            this.sendingEnabled = false;
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
            if (this.animationId) cancelAnimationFrame(this.animationId);
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
        }
    }

    // 启动应用
    new GuitarTrainApp();
})();