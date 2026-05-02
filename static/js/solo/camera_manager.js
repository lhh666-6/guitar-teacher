// ========== camera_manager.js ==========
// 摄像头与 MediaPipe 手部跟踪管理，从 GuitarTrainApp 中拆分

class CameraManager {
    constructor(options = {}) {
        this.videoElement = options.videoElement;
        this.onResults = options.onResults || null;
        this.onStreamEnded = options.onStreamEnded || null;
        this.onError = options.onError || null;

        this.stream = null;
        this.hands = null;
        this.handLoopId = null;
        this._handLoopRunning = false;
        this._logMediaPipeReady = false;
        this._logCameraStartFail = false;
        this._cropCanvas = null;
        this._cropCtx = null;
    }

    async open() {
        if (typeof Hands === 'undefined') {
            throw new Error('MediaPipe Hands 库未加载，无法启动摄像头');
        }
        if (!this.hands) {
            this.hands = new Hands({
                locateFile: (file) =>
                    `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`
            });
            this.hands.setOptions({
                maxNumHands: 1,
                modelComplexity: 1,
                minDetectionConfidence: 0.15,
                minTrackingConfidence: 0.15
            });
            if (this.onResults) {
                this.hands.onResults(this.onResults);
            }
            if (!this._logMediaPipeReady) {
                console.log('✅ MediaPipe Hands 已成功加载');
                this._logMediaPipeReady = true;
            }
        }
        await new Promise(resolve => setTimeout(resolve, 1000));

        this.stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1920, height: 1080 }
        });

        const video = this.videoElement;
        video.srcObject = this.stream;
        video.style.transform = 'scaleX(-1)';

        this.stream.getTracks().forEach(track => {
            track.addEventListener('ended', () => {
                if (this.stream && this.stream.getTracks().every(t => t.readyState === 'ended')) {
                    if (this.onStreamEnded) this.onStreamEnded();
                }
            });
        });

        return this.stream;
    }

    startHandLoop(videoElement) {
        if (!this.hands) return;
        this._handLoopRunning = true;

        // 创建离屏裁剪画布（左侧60%涂黑，只保留右侧40%用于手部识别）
        if (!this._cropCanvas) {
            this._cropCanvas = document.createElement('canvas');
            this._cropCtx = this._cropCanvas.getContext('2d');
        }

        const cropRatio = 0.40; // 按弦手在画面右侧（原始帧），保留右侧40%
        const handLoop = async () => {
            if (!this._handLoopRunning || !this.hands || !this.stream) return;
            if (videoElement.readyState >= 2) {
                try {
                    const vw = videoElement.videoWidth;
                    const vh = videoElement.videoHeight;
                    const cropW = Math.floor(vw * cropRatio);
                    if (this._cropCanvas.width !== vw || this._cropCanvas.height !== vh) {
                        this._cropCanvas.width = vw;
                        this._cropCanvas.height = vh;
                    }
                    const ctx = this._cropCtx;
                    // 全帧 → 把左侧60%涂黑 → MediaPipe 只看右侧40%（原始帧中按弦手区域）
                    ctx.drawImage(videoElement, 0, 0, vw, vh);
                    ctx.fillStyle = '#000';
                    ctx.fillRect(0, 0, vw - cropW, vh);
                    await this.hands.send({ image: this._cropCanvas });
                } catch (e) {
                    if (!this._logCameraStartFail) {
                        console.error('❌ MediaPipe hands.send() 失败:', e);
                        this._logCameraStartFail = true;
                    }
                }
            }
            if (this._handLoopRunning) {
                // 用 requestVideoFrameCallback 跟摄像头帧率同步，避免 rAF 在 144Hz 显示器上跑满主线程
                if (videoElement.requestVideoFrameCallback) {
                    this.handLoopId = videoElement.requestVideoFrameCallback(handLoop);
                } else {
                    this.handLoopId = requestAnimationFrame(handLoop);
                }
            }
        };
        if (videoElement.requestVideoFrameCallback) {
            this.handLoopId = videoElement.requestVideoFrameCallback(handLoop);
        } else {
            this.handLoopId = requestAnimationFrame(handLoop);
        }
    }

    stopLoops() {
        this._handLoopRunning = false;
        if (this.handLoopId) {
            cancelAnimationFrame(this.handLoopId);
            this.handLoopId = null;
        }
    }

    close() {
        this.stopLoops();
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
        if (this.videoElement) {
            this.videoElement.srcObject = null;
            this.videoElement.style.transform = '';
        }
        // 不销毁 Hands 实例 — MediaPipe 不支持反复 new/close/new，复用同一实例
        this._cropCanvas = null;
        this._cropCtx = null;
        this._logCameraStartFail = false;
    }
}
