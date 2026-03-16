// ========== chord_validator.js ==========
// 和弦验证逻辑，独立模块，便于后续扩展音频融合

/**
 * 纯视觉验证：检测到的按弦点是否与目标和弦匹配
 * @param {Array} detectedPositions - 后端返回的 positions 数组 [{string, fret}, ...]
 * @param {Object|null} detectedBarre - 后端返回的 barre 对象 {fret, startString, endString}
 * @param {Object} targetChord - 目标和弦对象 {positions, barre}
 * @returns {boolean} 是否匹配
 */
function validateVisual(detectedPositions, detectedBarre, targetChord) {
    // 如果目标和弦有横按，检查横按是否完全匹配
    if (targetChord.barre) {
        if (!detectedBarre) return false;
        if (detectedBarre.fret !== targetChord.barre.fret) return false;
        if (detectedBarre.startString !== targetChord.barre.startString) return false;
        if (detectedBarre.endString !== targetChord.barre.endString) return false;
        return true;
    }

    // 如果没有横按，则检查所有目标按弦点是否都被检测到（可调整规则：允许多余点，但必须包含所有目标点）
    if (!targetChord.positions || targetChord.positions.length === 0) return false;
    if (!detectedPositions || detectedPositions.length < targetChord.positions.length) return false;

    // 转换为 Set 便于比较（格式 "string,fret"）
    const detectedSet = new Set(detectedPositions.map(p => `${p.string},${p.fret}`));
    for (let pos of targetChord.positions) {
        if (!detectedSet.has(`${pos.string},${pos.fret}`)) {
            return false;
        }
    }
    return true;
}

/**
 * 融合验证（视觉 + 音频），预留音频接口
 * @param {Object} visualResult - {positions, barre}
 * @param {Object|null} audioResult - 音频识别结果，例如 {chord: "C", confidence: 0.9}
 * @param {Object} targetChord - 目标和弦
 * @param {Object} options - 融合规则选项，例如 {mode: 'and', weightVisual: 0.7, weightAudio: 0.3}
 * @returns {boolean|number} 是否匹配或置信度
 */
function validateFusion(visualResult, audioResult, targetChord, options = { mode: 'and' }) {
    const visualMatch = validateVisual(visualResult.positions, visualResult.barre, targetChord);

    if (options.mode === 'and') {
        // 必须同时匹配
        return visualMatch && (audioResult ? audioResult.chord === targetChord.name : false);
    } else if (options.mode === 'or') {
        return visualMatch || (audioResult ? audioResult.chord === targetChord.name : false);
    } else if (options.mode === 'weighted') {
        // 加权评分示例
        const visualScore = visualMatch ? 1 : 0;
        const audioScore = (audioResult && audioResult.chord === targetChord.name) ? audioResult.confidence : 0;
        const total = (options.weightVisual || 0.7) * visualScore + (options.weightAudio || 0.3) * audioScore;
        return total;  // 返回置信度，由调用方决定阈值
    }
    return visualMatch; // 默认纯视觉
}

// 将函数暴露到全局（适用于传统 script 引入）
window.validateVisual = validateVisual;
window.validateFusion = validateFusion;