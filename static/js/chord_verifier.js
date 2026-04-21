/**
 * 和弦验证器（Chroma + 模板匹配）- 触发模式
 * 用途：监听麦克风，当检测到超过能量阈值的声音时，自动录制一段音频并判断是否为目标和弦
 * 适用场景：逐个和弦练习（用户弹一个和弦 → 系统自动判断一次 → 等待下一个）
 * 依赖：Meyda (https://cdn.jsdelivr.net/npm/meyda@5.0.0/dist/web/meyda.min.js)
 */

class ChordVerifier {
    constructor() {
        // 音频相关
        this.audioContext = null;
        this.mediaStream = null;
        this.sourceNode = null;
        this.meydaAnalyzer = null;
        this.isActive = false;
        
        // 触发与录音状态
        this.isWaitingForTrigger = true;   // 是否在等待声音触发
        this.isRecording = false;          // 是否正在录音中
        this.recordingChunks = [];         // 存储录音期间的 chroma 向量
        this.triggerTimer = null;          // 录音结束定时器
        
        // 阈值参数
        this.similarityThreshold = 0.68;   // 余弦相似度阈值（0~1）
        this.energyThreshold = 0.3;        // chroma 能量阈值（低于此值完全忽略）
        this.triggerEnergyThreshold = 0.5; // 触发录音的能量阈值（需大于能量阈值）
        this.holdDuration = 1.2;           // 触发后录音时长（秒）
        
        // 目标和弦
        this.targetChord = null;
        this.targetTemplate = null;
        
        // 回调函数
        this.onResult = null;      // function(isMatch, similarity, chromaVector)
        this.onError = null;       // function(errorMessage)
        this.onStartListening = null; // 可选：开始监听时的回调
        this.onStopListening = null;  // 可选：停止监听时的回调
        
        // 预计算和弦模板库
        this.templates = this._buildTemplates();
    }

    // ================== 和弦模板构建 ==================
    _rootMap() {
        return {
            'C': 0, 'C#': 1, 'Db': 1,
            'D': 2, 'D#': 3, 'Eb': 3,
            'E': 4,
            'F': 5, 'F#': 6, 'Gb': 6,
            'G': 7, 'G#': 8, 'Ab': 8,
            'A': 9, 'A#': 10, 'Bb': 10,
            'B': 11
        };
    }

    _qualityIntervals() {
        return {
            '':     [0,4,7],          // 大三
            'm':    [0,3,7],          // 小三
            '7':    [0,4,7,10],       // 属七
            'm7':   [0,3,7,10],       // 小七
            'maj7': [0,4,7,11],       // 大七
            '6':    [0,4,7,9],        // 六
            'm6':   [0,3,7,9],        // 小六
            '9':    [0,4,7,10,14],    // 九
            'add9': [0,4,7,14],       // add9
            'sus2': [0,2,7],          // sus2
            'sus4': [0,5,7],          // sus4
            '7sus4':[0,5,7,10]        // 7sus4
        };
    }

    _parseChordName(chordName) {
        const qualities = ['maj7', 'm7', '7sus4', 'add9', 'sus2', 'sus4', 'm6', 'm', '7', '6', '9', ''];
        for (let q of qualities) {
            if (chordName.endsWith(q)) {
                const root = chordName.slice(0, chordName.length - q.length);
                if (this._rootMap()[root]) {
                    return { root: root, quality: q };
                }
            }
        }
        if (this._rootMap()[chordName]) {
            return { root: chordName, quality: '' };
        }
        return null;
    }

    _getChordTemplate(root, quality) {
        const rootIdx = this._rootMap()[root];
        if (rootIdx === undefined) return null;
        const intervals = this._qualityIntervals()[quality];
        if (!intervals) return null;
        
        const template = new Array(12).fill(0);
        // 根音加权（根音位置权重更高）
        for (let interval of intervals) {
            let weight = (interval === 0) ? 1.5 : 1.0;
            const idx = (rootIdx + interval) % 12;
            template[idx] += weight;
        }
        // 归一化
        const norm = Math.hypot(...template);
        if (norm === 0) return template;
        return template.map(v => v / norm);
    }

    _buildTemplates() {
        const rootNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const qualities = ['', 'm', '7', 'm7', 'maj7', '6', 'm6', '9', 'add9', 'sus2', 'sus4', '7sus4'];
        const templates = {};
        for (let root of rootNotes) {
            for (let qual of qualities) {
                const chordName = root + qual;
                const template = this._getChordTemplate(root, qual);
                if (template) templates[chordName] = template;
            }
        }
        // 等音映射
        templates['Db'] = templates['C#'];
        templates['Eb'] = templates['D#'];
        templates['Gb'] = templates['F#'];
        templates['Ab'] = templates['G#'];
        templates['Bb'] = templates['A#'];
        return templates;
    }

    // 余弦相似度
    _cosineSimilarity(a, b) {
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        if (normA === 0 || normB === 0) return 0;
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    // chroma 能量
    _chromaEnergy(chroma) {
        return chroma.reduce((sum, v) => sum + v * v, 0);
    }

    // 谐波抑制（减少泛音干扰）
    _suppressHarmonics(chroma) {
        const result = [...chroma];
        for (let i = 0; i < 12; i++) {
            const fifth = (i + 7) % 12;
            result[fifth] = Math.max(0, result[fifth] - chroma[i] * 0.3);
        }
        return result;
    }

    // ================== 公共 API ==================
    
    // 设置目标和弦（例如 "C", "G7", "Am"）
    setTargetChord(chordName) {
        if (!this.templates[chordName]) {
            console.warn(`和弦模板不存在: ${chordName}`);
            this.targetChord = null;
            this.targetTemplate = null;
            return false;
        }
        this.targetChord = chordName;
        this.targetTemplate = this.templates[chordName];
        this._resetForNext();
        return true;
    }

    // 设置相似度阈值（0~1，默认0.68）
    setThreshold(value) {
        this.similarityThreshold = Math.min(1, Math.max(0, value));
    }

    // 设置触发灵敏度（能量阈值，默认0.5，越低越灵敏）
    setTriggerSensitivity(value) {
        this.triggerEnergyThreshold = Math.min(1, Math.max(0.2, value));
    }

    // 开始监听（需要用户手势触发）
    async start(onResultCallback, onErrorCallback) {
        if (this.isActive) {
            await this.stop();
        }
        if (!this.targetTemplate) {
            const err = "请先调用 setTargetChord() 设置目标和弦";
            if (onErrorCallback) onErrorCallback(err);
            else console.error(err);
            return;
        }

        this.onResult = onResultCallback;
        this.onError = onErrorCallback;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaStream = stream;
            
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.sourceNode = this.audioContext.createMediaStreamSource(stream);
            
            if (typeof Meyda === 'undefined') {
                throw new Error("Meyda 库未加载，请确保在 HTML 中引入 meyda.min.js");
            }
            
            // 创建分析器，回调实现触发+录音逻辑
            this.meydaAnalyzer = Meyda.createMeydaAnalyzer({
                audioContext: this.audioContext,
                source: this.sourceNode,
                bufferSize: 4096,
                hopSize: 2048,
                featureExtractors: ['chroma'],
                callback: (features) => {
                    if (!this.isActive) return;
                    if (!features || !features.chroma) return;
                    
                    let chroma = features.chroma;
                    // 应用谐波抑制
                    chroma = this._suppressHarmonics(chroma);
                    const energy = this._chromaEnergy(chroma);
                    
                    // 能量门限：太低的声音完全忽略
                    if (energy < this.energyThreshold) return;
                    
                    // 等待触发模式
                    if (this.isWaitingForTrigger && !this.isRecording) {
                        if (energy >= this.triggerEnergyThreshold) {
                            // 触发！开始录音
                            this.isRecording = true;
                            this.isWaitingForTrigger = false;
                            this.recordingChunks = [];
                            
                            // 设置定时器，录音结束后分析
                            this.triggerTimer = setTimeout(() => {
                                this._finalizeRecording();
                            }, this.holdDuration * 1000);
                        }
                    }
                    
                    // 录音模式：收集 chroma
                    if (this.isRecording) {
                        this.recordingChunks.push(chroma);
                    }
                }
            });
            
            this.meydaAnalyzer.start();
            await this.audioContext.resume();
            this.isActive = true;
            
            if (this.onStartListening) this.onStartListening();
            
        } catch (err) {
            console.error("启动验证器失败:", err);
            if (this.onError) this.onError(err.message);
            await this.stop();
        }
    }

    // 停止监听，释放资源
    async stop() {
        this.isActive = false;
        if (this.meydaAnalyzer) {
            this.meydaAnalyzer.stop();
            this.meydaAnalyzer = null;
        }
        if (this.triggerTimer) {
            clearTimeout(this.triggerTimer);
            this.triggerTimer = null;
        }
        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }
        if (this.audioContext) {
            await this.audioContext.close();
            this.audioContext = null;
        }
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        this._resetForNext();
        if (this.onStopListening) this.onStopListening();
    }

    // 重置状态（准备下一次判定）
    _resetForNext() {
        this.isWaitingForTrigger = true;
        this.isRecording = false;
        this.recordingChunks = [];
        if (this.triggerTimer) {
            clearTimeout(this.triggerTimer);
            this.triggerTimer = null;
        }
    }

    // 录音结束，分析并回调结果
    _finalizeRecording() {
        if (!this.isRecording) return;
        this.isRecording = false;
        if (this.triggerTimer) clearTimeout(this.triggerTimer);
        
        if (this.recordingChunks.length === 0) {
            this.isWaitingForTrigger = true;
            if (this.onResult) this.onResult(false, 0, null);
            return;
        }
        
        // 计算平均 chroma
        const avgChroma = this.recordingChunks.reduce((acc, c) => {
            for (let i = 0; i < 12; i++) acc[i] += c[i];
            return acc;
        }, new Array(12).fill(0)).map(v => v / this.recordingChunks.length);
        
        const energy = this._chromaEnergy(avgChroma);
        if (energy < this.energyThreshold) {
            this.isWaitingForTrigger = true;
            if (this.onResult) this.onResult(false, 0, avgChroma);
            return;
        }
        
        const similarity = this._cosineSimilarity(avgChroma, this.targetTemplate);
        const isMatch = similarity >= this.similarityThreshold;
        
        if (this.onResult) {
            this.onResult(isMatch, similarity, avgChroma);
        }
        
        // 重置状态，等待下一次触发
        this.isWaitingForTrigger = true;
        this.recordingChunks = [];
    }

    // 强制重置（用于手动清空等待状态）
    forceReset() {
        this._resetForNext();
    }

    // 获取当前是否正在运行
    isRunning() {
        return this.isActive;
    }
}

// 导出全局变量
if (typeof window !== 'undefined') {
    window.ChordVerifier = ChordVerifier;
}