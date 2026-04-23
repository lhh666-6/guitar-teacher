/**
 * 和弦音频验证器 — 项目集成优化版
 * 优先使用 AudioWorklet（内联 Meyda），失败时降级到 ScriptProcessorNode
 * 接口保持与现有 main.js 完全兼容
 */
class ChordVerifier {
    constructor() {
        // 引擎状态
        this._engine = null;
        this._debug = true; // 可在实例化后关闭

        this.audioContext = null;
        this.mediaStream = null;
        this.workletNode = null;
        this.scriptProcessor = null;
        this.meydaAnalyzer = null;
        this.isActive = false;

        this.isWaitingForTrigger = true;
        this.isRecording = false;
        this.recordingChunks = [];
        this.triggerTimer = null;

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
        this._log(`初始化完成，模板数: ${Object.keys(this.templates).length}`);
    }

    _log(msg, isError = false) {
        if (!this._debug) return;
        const prefix = '[ChordVerifier]';
        if (isError) console.error(`${prefix} ❌ ${msg}`);
        else console.log(`${prefix} ${msg}`);
    }

    _warn(msg) {
        if (this._debug) console.warn(`[ChordVerifier] ⚠️ ${msg}`);
    }

    // ================== 吉他轻度优化 ==================
    _applyLowFreqWeight(chroma) {
        const lowIndices = [0, 2, 4, 5, 7, 9];
        const weighted = [...chroma];
        for (let i of lowIndices) weighted[i] *= 1.05;
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

    // ================== 和弦模板 ==================
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
        for (let [alias, orig] of Object.entries(aliases)) templates[alias] = templates[orig];
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
        this._log(`设置目标: ${chordName}`);
        if (!this.templates[chordName]) {
            this._log(`模板不存在: ${chordName}`, true);
            return false;
        }
        this.targetChord = chordName;
        this.targetTemplate = this.templates[chordName];
        this._resetForNext();
        return true;
    }

    setThreshold(value) {
        this.similarityThreshold = Math.min(1, Math.max(0.4, value));
        this._log(`相似度阈值 = ${this.similarityThreshold}`);
    }

    setTriggerSensitivity(value) {
        this.triggerEnergyThreshold = Math.min(0.8, Math.max(0.2, value));
        this._log(`触发能量阈值 = ${this.triggerEnergyThreshold}`);
    }

    async start(onResultCallback, onErrorCallback) {
        this._log('启动验证器...');
        if (this.isActive) await this.stop();
        if (!this.targetTemplate) {
            const err = '未设置目标和弦';
            this._log(err, true);
            if (onErrorCallback) onErrorCallback(err);
            return;
        }
        this.onResult = onResultCallback;
        this.onError = onErrorCallback;
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });

            const workletSuccess = await this._tryStartWorklet();
            if (workletSuccess) {
                this._engine = 'worklet';
                this._log('✅ 使用 AudioWorklet 引擎');
            } else {
                this._log('⚠️ AudioWorklet 失败，降级到 ScriptProcessorNode');
                this._startScriptProcessor();
                this._engine = 'script';
            }

            await this.audioContext.resume();
            this.isActive = true;
            this._log('验证器已激活');
            if (this.onStartListening) this.onStartListening();
        } catch (err) {
            this._log(`启动失败: ${err.message}`, true);
            if (this.onError) this.onError(err.message);
            await this.stop();
        }
    }

    async _tryStartWorklet() {
        try {
            if (!this.audioContext.audioWorklet) {
                this._warn('浏览器不支持 AudioWorklet');
                return false;
            }
            // 获取 Meyda 源码并内联
            const meydaCode = await this._fetchMeydaCode();
            const blob = this._createWorkletBlob(meydaCode);
            const url = URL.createObjectURL(blob);
            await this.audioContext.audioWorklet.addModule(url);
            URL.revokeObjectURL(url);

            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');
            this.workletNode.port.onmessage = (e) => this._handleAudioFrame(e.data);
            source.connect(this.workletNode);
            this.workletNode.connect(this.audioContext.destination);
            return true;
        } catch (e) {
            this._warn(`AudioWorklet 初始化失败: ${e.message}`);
            return false;
        }
    }

    async _fetchMeydaCode() {
        const resp = await fetch('https://cdn.jsdelivr.net/npm/meyda@5.0.0/dist/web/meyda.min.js');
        return await resp.text();
    }

    _createWorkletBlob(meydaCode) {
        // 内联 Meyda，并模拟 window 对象以兼容 Worklet 环境
        const workletCode = `
            const globalScope = globalThis || self || this;
            globalScope.window = globalScope;
            ${meydaCode}
            class AudioProcessor extends AudioWorkletProcessor {
                constructor() {
                    super();
                    this.bufferSize = 4096;
                    this.hopSize = 2048;
                    this.frameBuffer = new Float32Array(this.bufferSize);
                    this.framePos = 0;
                }
                process(inputs) {
                    const input = inputs[0];
                    if (!input || !input.length) return true;
                    const channelData = input[0];
                    if (!channelData) return true;
                    for (let i = 0; i < channelData.length; i++) {
                        if (this.framePos < this.bufferSize) {
                            this.frameBuffer[this.framePos++] = channelData[i];
                        }
                        if (this.framePos === this.bufferSize) {
                            try {
                                if (typeof Meyda !== 'undefined') {
                                    // 修复: 不传 sampleRate，使用默认值
                                    const chroma = Meyda.extract('chroma', this.frameBuffer);
                                    if (chroma) {
                                        let energy = 0;
                                        for (let j = 0; j < chroma.length; j++) energy += chroma[j] * chroma[j];
                                        this.port.postMessage({ chroma, energy });
                                    }
                                }
                            } catch(e) {}
                            const newBuffer = new Float32Array(this.bufferSize);
                            newBuffer.set(this.frameBuffer.subarray(this.hopSize));
                            this.frameBuffer = newBuffer;
                            this.framePos = this.bufferSize - this.hopSize;
                        }
                    }
                    return true;
                }
            }
            registerProcessor('audio-processor', AudioProcessor);
        `;
        return new Blob([workletCode], { type: 'application/javascript' });
    }

    _startScriptProcessor() {
        if (typeof Meyda === 'undefined') throw new Error('Meyda 库未加载');
        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
        this.meydaAnalyzer = Meyda.createMeydaAnalyzer({
            audioContext: this.audioContext,
            source: source,
            bufferSize: 4096,
            hopSize: 2048,
            featureExtractors: ['chroma'],
            callback: (features) => {
                if (!this.isActive) return;
                if (features && features.chroma) {
                    const energy = features.chroma.reduce((s, v) => s + v * v, 0);
                    this._handleAudioFrame({ chroma: features.chroma, energy });
                }
            }
        });
        this.meydaAnalyzer.start();
        source.connect(this.scriptProcessor);
        this.scriptProcessor.connect(this.audioContext.destination);
        this._log('ScriptProcessor 引擎已启动');
    }

    _handleAudioFrame(data) {
        if (!this.isActive) return;
        let chroma = data.chroma;
        const energy = data.energy;
        if (!chroma) return;

        chroma = this._applyLowFreqWeight(chroma);

        if (energy < this.energyThreshold) {
            this.lastEnergy = energy;
            return;
        }

        const isAttack = this._isAttack(energy);

        if (this.isWaitingForTrigger && !this.isRecording) {
            if (isAttack || energy >= this.triggerEnergyThreshold) {
                this._log(`🎤 触发录音 | 能量=${energy.toFixed(3)}`);
                this.isRecording = true;
                this.isWaitingForTrigger = false;
                this.recordingChunks = [];
                if (this.triggerTimer) clearTimeout(this.triggerTimer);
                this.triggerTimer = setTimeout(() => this._finalizeRecording(), this.holdDuration * 1000);
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
        this._log(`录音结束，共 ${frames} 帧`);

        if (frames === 0) {
            this.isWaitingForTrigger = true;
            if (this.onResult) this.onResult(false, 0, null);
            return;
        }

        let totalWeight = 0;
        const avgChroma = new Array(12).fill(0);
        for (const f of this.recordingChunks) {
            totalWeight += f.energy;
            for (let i = 0; i < 12; i++) avgChroma[i] += f.chroma[i] * f.energy;
        }
        for (let i = 0; i < 12; i++) avgChroma[i] /= totalWeight;

        const energy = this._chromaEnergy(avgChroma);
        if (energy < this.energyThreshold) {
            this._log(`平均能量过低 (${energy.toFixed(3)})，判定为无效`);
            this.isWaitingForTrigger = true;
            if (this.onResult) this.onResult(false, 0, avgChroma);
            return;
        }

        const similarity = this._cosineSimilarity(avgChroma, this.targetTemplate);
        const isMatch = similarity >= this.similarityThreshold;
        this._log(`相似度: ${similarity.toFixed(4)} → ${isMatch ? '✅ 正确' : '❌ 错误'}`);

        if (this.onResult) this.onResult(isMatch, similarity, avgChroma);
        this.isWaitingForTrigger = true;
        this.recordingChunks = [];
    }

    async stop() {
        this._log('停止验证器');
        this.isActive = false;
        if (this.workletNode) this.workletNode.disconnect();
        if (this.meydaAnalyzer) this.meydaAnalyzer.stop();
        if (this.scriptProcessor) this.scriptProcessor.disconnect();
        if (this.audioContext) await this.audioContext.close();
        if (this.mediaStream) this.mediaStream.getTracks().forEach(t => t.stop());
        this.workletNode = this.scriptProcessor = this.meydaAnalyzer = null;
        this.audioContext = this.mediaStream = null;
        this._resetForNext();
        if (this.onStopListening) this.onStopListening();
        this._log('已停止');
    }

    _resetForNext() {
        this.isWaitingForTrigger = true;
        this.isRecording = false;
        this.recordingChunks = [];
        if (this.triggerTimer) clearTimeout(this.triggerTimer);
        this.lastEnergy = 0;
    }

    forceReset() { this._resetForNext(); }
    isRunning() { return this.isActive; }
    getEngineType() { return this._engine; }
}

// 暴露到全局，与现有工程保持一致
if (typeof window !== 'undefined') {
    window.ChordVerifier = ChordVerifier;
}