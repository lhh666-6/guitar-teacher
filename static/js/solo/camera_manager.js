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
        this.useMediaPipe = true;
        this.handLoopId = null;
        this.drawLoopId = null;
        this._handLoopRunning = false;
        this._logMediaPipeFallback = false;
        this._logMediaPipeReady = false;
        this._logCameraStartFail = false;
    }

    async open() {
        if (typeof Hands === 'undefined') {
            if (!this._logMediaPipeFallback) {
                console.warn('⚠️ MediaPipe Hands 库未加载，将使用降级模式');
                this._logMediaPipeFallback = true;
            }
            this.useMediaPipe = false;
        } else {
            if (!this.hands) {
                this.hands = new Hands({
                    locateFile: (file) =>
                        `https://fastly.jsdelivr.net/npm/@mediapipe/hands/${file}`
                });
                this.hands.setOptions({
                    maxNumHands: 1,
                    modelComplexity: 1,
                    minDetectionConfidence: 0.2,
                    minTrackingConfidence: 0.2
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
            this.useMediaPipe = true;
        }

        this.stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1920, height: 1080 }
        });

        const video = this.videoElement;
        video.srcObject = this.stream;

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
        if (!this.useMediaPipe || !this.hands) return;
        this._handLoopRunning = true;

        const handLoop = async () => {
            if (!this._handLoopRunning || !this.hands || !this.stream) return;
            if (videoElement.readyState >= 2) {
                try {
                    await this.hands.send({ image: videoElement });
                } catch (e) {
                    if (!this._logCameraStartFail) {
                        console.error('❌ MediaPipe hands.send() 失败:', e);
                        this._logCameraStartFail = true;
                    }
                }
            }
            if (this._handLoopRunning) {
                this.handLoopId = requestAnimationFrame(handLoop);
            }
        };
        this.handLoopId = requestAnimationFrame(handLoop);
    }

    startDrawLoop(drawFn) {
        if (!this.useMediaPipe) return;
        this._handLoopRunning = true;
        const animate = () => {
            if (drawFn) drawFn();
            if (this._handLoopRunning) {
                this.drawLoopId = requestAnimationFrame(animate);
            }
        };
        this.drawLoopId = requestAnimationFrame(animate);
    }

    stopLoops() {
        this._handLoopRunning = false;
        if (this.handLoopId) {
            cancelAnimationFrame(this.handLoopId);
            this.handLoopId = null;
        }
        if (this.drawLoopId) {
            cancelAnimationFrame(this.drawLoopId);
            this.drawLoopId = null;
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
        this.hands = null;
    }
}
