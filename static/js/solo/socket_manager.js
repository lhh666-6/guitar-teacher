// ========== socket_manager.js ==========
// WebSocket 连接管理，从 GuitarTrainApp 中拆分

class SocketManager {
    constructor(options = {}) {
        this.url = options.url || 'https://www.hnuguitarteacher.xyz';
        this.path = options.path || '/socket.io';
        this.transports = options.transports || ['websocket'];
        this.secure = options.secure !== false;
        this.timeout = options.timeout || 20000;
        this.onConnect = options.onConnect || null;
        this.onDisconnect = options.onDisconnect || null;
        this.onError = options.onError || null;
        this.onFretboardParams = options.onFretboardParams || null;
        this.onDetectionResult = options.onDetectionResult || null;

        this.socket = null;
        this._logConnected = false;
        this._logDisconnected = false;
        this._logError = false;
    }

    connect() {
        this.socket = io(this.url, {
            path: this.path,
            transports: this.transports,
            secure: this.secure,
            rejectUnauthorized: false,
            reconnection: false,
            timeout: this.timeout
        });

        this.socket.on('connect', () => {
            if (!this._logConnected) {
                console.log('✅ WebSocket 连接成功，ID:', this.socket.id);
                this._logConnected = true;
                this._logDisconnected = false;
                this._logError = false;
            }
            if (this.onConnect) this.onConnect(this.socket.id);
        });

        this.socket.on('disconnect', (reason) => {
            if (!this._logDisconnected) {
                console.log('❌ WebSocket 断开，原因:', reason);
                this._logDisconnected = true;
                this._logConnected = false;
            }
            if (this.onDisconnect) this.onDisconnect(reason);
        });

        this.socket.on('connect_error', (err) => {
            if (!this._logError) {
                console.error('🚫 WebSocket 连接错误:', err);
                this._logError = true;
            }
            if (this.onError) this.onError(err);
        });

        this.socket.on('error', (err) => {
            if (!this._logError) {
                console.error('🚫 WebSocket 错误:', err);
                this._logError = true;
            }
        });

        if (this.onFretboardParams) {
            this.socket.on('fretboard_params', this.onFretboardParams);
        }
        if (this.onDetectionResult) {
            this.socket.on('detection_result', this.onDetectionResult);
        }

        return this.socket;
    }

    emit(event, data, callback) {
        if (this.socket && this.socket.connected) {
            this.socket.emit(event, data, callback);
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            if (this.socket.close) this.socket.close();
            this.socket = null;
        }
    }

    get isConnected() {
        return this.socket && this.socket.connected;
    }
}
