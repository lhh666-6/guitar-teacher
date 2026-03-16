// static/main.js

document.addEventListener('DOMContentLoaded', function() {
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
        initSoloMode();
    }
});

function initSoloMode() {
    const video = document.getElementById('camera');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const stringSpan = document.getElementById('string');
    const fretSpan = document.getElementById('fret');
    const noteSpan = document.getElementById('note');
    const actionSpan = document.getElementById('action');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');

    let stream = null;
    let socket = null;
    let isSending = false;      // 防止并发发送
    let animationId = null;     // requestAnimationFrame ID

    // 建立 WebSocket 连接
    function connectWebSocket() {
        socket = io(); // 默认连接当前服务器
        socket.on('connect', () => {
            console.log('WebSocket 已连接');
        });
        socket.on('detection_result', (data) => {
            if (data.status === 'success') {
                stringSpan.textContent = data.string;
                fretSpan.textContent = data.fret;
                noteSpan.textContent = data.note || '-';
                actionSpan.textContent = data.action || '-';
            } else {
                console.warn('检测失败:', data.error);
            }
        });
        socket.on('disconnect', () => {
            console.log('WebSocket 断开');
        });
    }

    // 启动摄像头
    async function startCamera() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                } 
            });
            video.srcObject = stream;
            connectWebSocket();
        } catch (err) {
            alert('无法访问摄像头：' + err.message);
        }
    }

    // 停止摄像头
    function stopCamera() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            video.srcObject = null;
        }
        if (socket) {
            socket.disconnect();
        }
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
        isSending = false;
    }

    // 发送一帧
    function sendFrame() {
        if (!video.videoWidth || isSending || !socket || !socket.connected) {
            // 如果未连接或正在发送，等待下一帧
            animationId = requestAnimationFrame(sendFrame);
            return;
        }

        isSending = true;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // 压缩图片以降低传输量（质量0.6，格式JPEG）
        const imageBase64 = canvas.toDataURL('image/jpeg', 0.6);

        // 通过 WebSocket 发送
        socket.emit('frame', { image: imageBase64 }, () => {
            isSending = false; // 发送完成，允许下一帧
        });

        // 继续循环
        animationId = requestAnimationFrame(sendFrame);
    }

    // 开始检测
    function startDetection() {
        if (animationId) return;
        sendFrame(); // 启动循环
    }

    // 绑定按钮事件
    startBtn.addEventListener('click', async () => {
        if (!stream) await startCamera();
        startDetection();
    });
    stopBtn.addEventListener('click', () => {
        stopCamera();
    });

    // 页面关闭时清理
    window.addEventListener('beforeunload', () => {
        stopCamera();
    });
}
