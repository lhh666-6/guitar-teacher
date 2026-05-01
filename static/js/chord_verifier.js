//**
 * 和弦验证器（AudioWorklet 版）
 * 完全兼容原 ChordVerifier 接口，消除 ScriptProcessorNode 弃用警告。
 * 使用 Meyda 进行 chroma 特征提取，保持原有模板匹配算法。
 */
class ChordVerifier {
    constructor() {
        this.audioContext = null;
        this.mediaStream = null;
        this.workletNode = null;
        this.isActive = false;

        this.isWaitingForTrigger = true;
        this.isRecording = false;
        this.recordingChunks = [];     // 存储 {chroma, energy}
        this.triggerTimer = null;

        // 阈值（与原版一致）
        this.similarityThreshold = 0.55;
        this.energyThreshold = 0.3;
        this.triggerEnergyThreshold = 0.5;
        this.holdDuration = 1.0;

        this.lastEnergy = 0;

        this.targetChord = null;
        this.targetTemplate = null;

        this.onResult = null;
        this.onError = null;
        this.onStartListening = null;
        this.onStopListening = null;

        this.templates = this._buildTemplates();
        console.log("[ChordVerifier] AudioWorklet 版已加载，模板数:", Object.keys(this.templates).length);
    }

    // ================== 吉他轻度优化 ==================
    _applyLowFreqWeight(chroma) {
        const lowIndices = [0, 2, 4, 5, 7, 9];
        const weighted = [...chroma];
        for (let i of lowIndices) {
            weighted[i] *= 1.05;
        }
        return weighted;
    }

    _isAttack(currentEnergy) {
        if (this.lastEnergy === 0) {
            this.lastEnergy = currentEnergy;
            return false;
        }
        const ratio = currentEnergy / (this.lastEnergy + 0.01);
        this.lastEnergy = currentEnergy;
        return ratio > 1.5 && currentEnergy > this.triggerEnergyThreshold;
    }

    // ================== 和弦模板构建（根音权重 1.2） ==================
    _rootMap() {
        return {
            'C':0,'C#':1,'Db':1,'D':2,'D#':3,'Eb':3,'E':4,
            'F':5,'F#':6,'Gb':6,'G':7,'G#':8,'Ab':8,'A':9,'A#':10,'Bb':10,'B':11
        };
    }

    _qualityIntervals() {
        return {
            '':[0,4,7], 'm':[0,3,7], '7':[0,4,7,10], 'm7':[0,3,7,10],
            'maj7':[0,4,7,11], '6':[0,4,7,9], 'm6':[0,3,7,9],
            '9':[0,4,7,10,14], 'add9':[0,4,7,14], 'sus2':[0,2,7],
            'sus4':[0,5,7], '7sus4':[0,5,7,10]
        };
    }

    _getChordTemplate(root, quality) {
        const rootIdx = this._rootMap()[root];
        if (rootIdx === undefined) return null;
        const intervals = this._qualityIntervals()[quality];
        if (!intervals) return null;
        const template = new Array(12).fill(0);
        for (let interval of intervals) {
            let weight = (interval === 0) ? 1.2 : 1.0;
            const idx = (rootIdx + interval) % 12;
            template[idx] += weight;
        }
        const norm = Math.hypot(...template);
        return norm === 0 ? template : template.map(v => v / norm);
    }

    _buildTemplates() {
        const roots = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        const quals = ['','m','7','m7','maj7','6','m6','9','add9','sus2','sus4','7sus4'];
        const templates = {};
        for (let r of roots) {
            for (let q of quals) {
                const name = r + q;
                const tpl = this._getChordTemplate(r, q);
                if (tpl) templates[name] = tpl;
            }
        }
        const aliases = { 'Db':'C#', 'Eb':'D#', 'Gb':'F#', 'Ab':'G#', 'Bb':'A#' };
        for (let [alias, orig] of Object.entries(aliases)) {
            templates[alias] = templates[orig];
        }
        return templates;
    }

    _cosineSimilarity(a, b) {
        let dot = 0, na = 0, nb = 0;
        for (let i = 0; i < 12; i++) {
            dot += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
        }
        if (na === 0 || nb === 0) return 0;
        return dot / (Math.sqrt(na) * Math.sqrt(nb));
    }

    _chromaEnergy(chroma) {
        return chroma.reduce((s, v) => s + v * v, 0);
    }

    // ================== AudioWorklet 内联模块 ==================
    _createWorkletBlob() {
        const code = `
            // 导入 Meyda 库（在 Worklet 上下文中通过 importScripts 加载）
            try {
                importScripts('https://cdn.jsdelivr.net/npm/meyda@5.0.0/dist/web/meyda.min.js');
            } catch(e) {
                console.error('Meyda 加载失败:', e);
            }

            class AudioProcessor extends AudioWorkletProcessor {
                constructor() {
                    super();
                    // 创建 Meyda 特征提取器（用于 chroma）
                    this.bufferSize = 4096;
                    this.hopSize = 2048;
                    this.sampleRate = 44100;
                    
                    // 初始化 Meyda 所需的音频上下文和节点
                    // 由于 Worklet 中没有直接的 AudioContext，我们使用 offline 方式提取 chroma
                    // 这里采用滑动窗口手动计算 chroma 需要 Meyda 支持，我们将在 process 中调用 Meyda 的 extract 方法
                    this.frameBuffer = new Float32Array(this.bufferSize);
                    this.framePos = 0;
                }

                process(inputs) {
                    const input = inputs[0];
                    if (!input || input.length === 0) return true;
                    
                    const channelData = input[0];
                    if (!channelData) return true;
                    
                    // 将数据填入帧缓冲区
                    for (let i = 0; i < channelData.length; i++) {
                        if (this.framePos < this.bufferSize) {
                            this.frameBuffer[this.framePos++] = channelData[i];
                        }
                        
                        // 当缓冲区满，提取特征
                        if (this.framePos === this.bufferSize) {
                            try {
                                if (typeof Meyda !== 'undefined') {
                                    // 计算 chroma 特征
                                    const features = Meyda.extract('chroma', this.frameBuffer);
                                    if (features) {
                                        // 将 chroma 和原始音频数据发送给主线程
                                        this.port.postMessage({
                                            type: 'features',
                                            chroma: features,
                                            buffer: this.frameBuffer.slice()
                                        });
                                    }
                                }
                            } catch(e) {
                                // 忽略错误
                            }
                            
                            // 滑动窗口：将后 hopSize 个样本移到前面
                            const hopSamples = this.hopSize;
                            const newBuffer = new Float32Array(this.bufferSize);
                            newBuffer.set(this.frameBuffer.subarray(hopSamples));
                            this.frameBuffer = newBuffer;
                            this.framePos = this.bufferSize - hopSamples;
                        }
                    }
                    return true;
                }
            }
            registerProcessor('audio-processor', AudioProcessor);
        `;
        return new Blob([code], { type: 'application/javascript' });
    }

    // ================== 音频帧处理 ==================
    _handleWorkletMessage(event) {
        if (!this.isActive) return;
        const data = event.data;
        if (data.type !== 'features') return;
        
        let chroma = data.chroma;
        if (!chroma) return;
        
        chroma = this._applyLowFreqWeight(chroma);
        const energy = this._chromaEnergy(chroma);
        
        if (energy < this.energyThreshold) {
            this.lastEnergy = energy;
            return;
        }
        
        const isAttack = this._isAttack(energy);
        
        if (this.isWaitingForTrigger && !this.isRecording) {
            if (isAttack || energy >= this.triggerEnergyThreshold) {
                console.log(`[ChordVerifier] 触发录音！能量=${energy.toFixed(3)}`);
                this.isRecording = true;
                this.isWaitingForTrigger = false;
                this.recordingChunks = [];
                if (this.triggerTimer) clearTimeout(this.triggerTimer);
                this.triggerTimer = setTimeout(() => {
                    this._finalizeRecording();
                }, this.holdDuration * 1000);
            }
        }
        
        if (this.isRecording) {
            this.recordingChunks.push({ chroma, energy });
        }
    }

    _finalizeRecording() {
        if (!this.isRecording) return;
        this.isRecording = false;
        if (this.triggerTimer) clearTimeout(this.triggerTimer);

        const frames = this.recordingChunks.length;
        console.log(`[ChordVerifier] 录音结束，共 ${frames} 帧`);
        if (frames === 0) {
            this.isWaitingForTrigger = true;
            if (this.onResult) this.onResult(false, 0, null, []);
            return;
        }

        // 能量加权平均 chroma
        let totalWeight = 0;
        const weightedChroma = new Array(12).fill(0);
        for (const frame of this.recordingChunks) {
            const weight = frame.energy;
            totalWeight += weight;
            for (let i = 0; i < 12; i++) {
                weightedChroma[i] += frame.chroma[i] * weight;
            }
        }
        const avgChroma = weightedChroma.map(v => v / totalWeight);

        const energy = this._chromaEnergy(avgChroma);
        if (energy < this.energyThreshold) {
            this.isWaitingForTrigger = true;
            if (this.onResult) this.onResult(false, 0, null, []);
            return;
        }

        // === 全模板排名匹配 ===
        const scored = [];
        for (const [name, template] of Object.entries(this.templates)) {
            const sim = this._cosineSimilarity(avgChroma, template);
            scored.push({ name, similarity: sim });
        }
        scored.sort((a, b) => b.similarity - a.similarity);
        const top5 = scored.slice(0, 5);

        const detected = top5[0];
        const targetRank = top5.findIndex(c => c.name === this.targetChord);
        const targetSim = targetRank >= 0 ? top5[targetRank].similarity : (scored.find(c => c.name === this.targetChord)?.similarity || 0);

        // 判定逻辑：target 在 top-1 或 top-2 → correct；top-5 内 → unstable；否则 → wrong
        let isMatch = false;
        if (targetRank >= 0 && targetRank <= 1 && targetSim >= this.similarityThreshold) {
            isMatch = true;
        }

        const label = targetRank >= 0 && targetRank <= 1 ? '正确' : (targetRank >= 0 ? '不稳定' : '错误');
        console.log(`[ChordVerifier] top-5: ${top5.map(c => `${c.name}(${c.similarity.toFixed(3)})`).join(', ')}`);
        console.log(`[ChordVerifier] 目标=${this.targetChord} 排名=#${targetRank + 1} 相似度=${targetSim.toFixed(4)} → ${label}`);

        if (this.onResult) {
            this.onResult(isMatch, targetSim, detected.name, top5);
        }

        this.isWaitingForTrigger = true;
        this.recordingChunks = [];
    }

    // ================== 公共 API ==================
    setTargetChord(chordName) {
        console.log(`[setTargetChord] 尝试设置: ${chordName}`);
        if (!this.templates[chordName]) {
            console.warn(`[setTargetChord] 和弦模板不存在: ${chordName}`);
            this.targetChord = null;
            this.targetTemplate = null;
            return false;
        }
        this.targetChord = chordName;
        this.targetTemplate = this.templates[chordName];
        console.log(`[setTargetChord] 成功设置目标和弦: ${chordName}`);
        this._resetForNext();
        return true;
    }

    setThreshold(value) {
        this.similarityThreshold = Math.min(1, Math.max(0.4, value));
        console.log(`[setThreshold] 相似度阈值 = ${this.similarityThreshold}`);
    }

    setTriggerSensitivity(value) {
        this.triggerEnergyThreshold = Math.min(0.8, Math.max(0.2, value));
        console.log(`[setTriggerSensitivity] 触发能量阈值 = ${this.triggerEnergyThreshold}`);
    }

    async start(onResultCallback, onErrorCallback) {
        console.log("[start] 开始启动验证器...");
        if (this.isActive) {
            await this.stop();
        }
        if (!this.targetTemplate) {
            const err = "请先调用 setTargetChord() 设置目标和弦";
            console.error(err);
            if (onErrorCallback) onErrorCallback(err);
            return;
        }

        this.onResult = onResultCallback;
        this.onError = onErrorCallback;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaStream = stream;
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
            
            // 加载 AudioWorklet 模块
            const blob = this._createWorkletBlob();
            const url = URL.createObjectURL(blob);
            await this.audioContext.audioWorklet.addModule(url);
            URL.revokeObjectURL(url);
            
            const source = this.audioContext.createMediaStreamSource(stream);
            this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');
            this.workletNode.port.onmessage = this._handleWorkletMessage.bind(this);
            
            source.connect(this.workletNode);
            this.workletNode.connect(this.audioContext.destination);
            
            await this.audioContext.resume();
            this.isActive = true;
            console.log("[start] 验证器已激活");
            if (this.onStartListening) this.onStartListening();
        } catch (err) {
            console.error(err);
            if (this.onError) this.onError(err.message);
            await this.stop();
        }
    }

    async stop() {
        console.log("[stop] 停止验证器");
        this.isActive = false;
        if (this.workletNode) {
            this.workletNode.disconnect();
            this.workletNode = null;
        }
        if (this.audioContext) {
            await this.audioContext.close();
            this.audioContext = null;
        }
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(t => t.stop());
            this.mediaStream = null;
        }
        this._resetForNext();
        if (this.onStopListening) this.onStopListening();
    }

    _resetForNext() {
        this.isWaitingForTrigger = true;
        this.isRecording = false;
        this.recordingChunks = [];
        if (this.triggerTimer) clearTimeout(this.triggerTimer);
        this.lastEnergy = 0;
    }

    forceReset() {
        this._resetForNext();
    }

    isRunning() {
        return this.isActive;
    }
}

// 导出到全局
if (typeof window !== 'undefined') {
    window.ChordVerifier = ChordVerifier;
    console.log("[ChordVerifier] 全局导出完成");
}