/**
 * 和弦验证器（Chroma + 模板匹配）- 综合改进版
 * - 根音权重 1.2，无五度泛音宽容
 * - 低频加权 1.05
 * - 能量加权平均录音帧
 * - 高能量原始 chroma（无压缩）
 * 依赖：Meyda (https://cdn.jsdelivr.net/npm/meyda@5.0.0/dist/web/meyda.min.js)
 */
class ChordVerifier {
    constructor() {
        this.audioContext = null;
        this.mediaStream = null;
        this.sourceNode = null;
        this.meydaAnalyzer = null;
        this.isActive = false;
        
        this.isWaitingForTrigger = true;
        this.isRecording = false;
        this.recordingChunks = [];     // 存储 {chroma, energy}
        this.triggerTimer = null;
        
        // 阈值（高能量范围）
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
        console.log("[ChordVerifier] 综合改进版已加载，模板数:", Object.keys(this.templates).length);
    }

    // ================== 吉他轻度优化 ==================
    // 低频加权（C~A 半音级权重提高 1.05）
    _applyLowFreqWeight(chroma) {
        const lowIndices = [0, 2, 4, 5, 7, 9];
        const weighted = [...chroma];
        for (let i of lowIndices) {
            weighted[i] *= 1.05;
        }
        return weighted;
    }

    // 瞬态检测（能量上升沿）
    _isAttack(currentEnergy) {
        if (this.lastEnergy === 0) {
            this.lastEnergy = currentEnergy;
            return false;
        }
        const ratio = currentEnergy / (this.lastEnergy + 0.01);
        this.lastEnergy = currentEnergy;
        return ratio > 1.5 && currentEnergy > this.triggerEnergyThreshold;
    }

    // ================== 和弦模板构建（根音权重 1.2，无泛音宽容） ==================
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
            // 根音权重 1.2，其他音权重 1.0
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
        // 等音别名
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
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.sourceNode = this.audioContext.createMediaStreamSource(stream);
            
            if (typeof Meyda === 'undefined') {
                throw new Error("Meyda 库未加载");
            }
            
            this.meydaAnalyzer = Meyda.createMeydaAnalyzer({
                audioContext: this.audioContext,
                source: this.sourceNode,
                bufferSize: 4096,
                hopSize: 2048,
                featureExtractors: ['chroma'],
                callback: (features) => {
                    if (!this.isActive) return;
                    if (!features || !features.chroma) return;
                    
                    let chroma = features.chroma.slice();
                    chroma = this._applyLowFreqWeight(chroma);
                    const energy = this._chromaEnergy(chroma);
                    
                    if (Math.random() < 0.05) {
                        console.log(`[callback] 能量: ${energy.toFixed(3)} | 等待触发: ${this.isWaitingForTrigger} | 录音中: ${this.isRecording}`);
                    }
                    
                    if (energy < this.energyThreshold) {
                        this.lastEnergy = energy;
                        return;
                    }
                    
                    const isAttack = this._isAttack(energy);
                    
                    if (this.isWaitingForTrigger && !this.isRecording) {
                        if (isAttack || energy >= this.triggerEnergyThreshold) {
                            console.log(`[callback] ✅ 触发录音！能量=${energy.toFixed(3)}`);
                            this.isRecording = true;
                            this.isWaitingForTrigger = false;
                            this.recordingChunks = [];
                            this.triggerTimer = setTimeout(() => {
                                console.log("[callback] 录音定时器到期");
                                this._finalizeRecording();
                            }, this.holdDuration * 1000);
                        }
                    }
                    
                    if (this.isRecording) {
                        // 存储 chroma 及其能量（用于加权平均）
                        this.recordingChunks.push({ chroma, energy });
                        if (this.recordingChunks.length % 10 === 0) {
                            console.log(`[callback] 录音中，已收集 ${this.recordingChunks.length} 帧`);
                        }
                    }
                }
            });
            
            this.meydaAnalyzer.start();
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
        if (this.meydaAnalyzer) {
            this.meydaAnalyzer.stop();
            this.meydaAnalyzer = null;
        }
        if (this.triggerTimer) clearTimeout(this.triggerTimer);
        if (this.sourceNode) this.sourceNode.disconnect();
        if (this.audioContext) await this.audioContext.close();
        if (this.mediaStream) this.mediaStream.getTracks().forEach(t => t.stop());
        this._resetForNext();
        if (this.onStopListening) this.onStopListening();
    }

    _resetForNext() {
        this.isWaitingForTrigger = true;
        this.isRecording = false;
        this.recordingChunks = [];
        if (this.triggerTimer) clearTimeout(this.triggerTimer);
        this.lastEnergy = 0;
        console.log("[_resetForNext] 状态已重置");
    }

    _finalizeRecording() {
        if (!this.isRecording) return;
        this.isRecording = false;
        if (this.triggerTimer) clearTimeout(this.triggerTimer);
        
        const frames = this.recordingChunks.length;
        console.log(`[_finalizeRecording] 录音结束，共 ${frames} 帧`);
        if (frames === 0) {
            this.isWaitingForTrigger = true;
            if (this.onResult) this.onResult(false, 0, null);
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
        console.log(`[_finalizeRecording] 平均能量: ${energy.toFixed(3)}`);
        if (energy < this.energyThreshold) {
            this.isWaitingForTrigger = true;
            if (this.onResult) this.onResult(false, 0, avgChroma);
            return;
        }
        
        const similarity = this._cosineSimilarity(avgChroma, this.targetTemplate);
        const isMatch = similarity >= this.similarityThreshold;
        console.log(`[_finalizeRecording] 相似度: ${similarity.toFixed(4)} → ${isMatch ? "正确" : "错误"}`);
        if (this.onResult) this.onResult(isMatch, similarity, avgChroma);
        
        this.isWaitingForTrigger = true;
        this.recordingChunks = [];
    }

    forceReset() { this._resetForNext(); }
    isRunning() { return this.isActive; }
}

if (typeof window !== 'undefined') {
    window.ChordVerifier = ChordVerifier;
    console.log("[ChordVerifier] 全局导出完成");
}