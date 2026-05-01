/**
 * 前端按弦检测器
 * 完全镜像后端 detector.py 中的逻辑，基于指板几何参数和手部关键点进行判定
 */

class FingeringDetector {
    constructor() {
        // 指板参数
        this.params = null;
        this.ready = false;

        // 可调阈值（与 config.py 保持一致）
        this.PRESS_THRESHOLD_PX = 25;
        this.STRING_DIST_THRESH = 30;
        this.PINKY_PRESS_THRESHOLD_PX = 20;
        this.PINKY_STRING_DIST_THRESH = 25;
        this.BARRE_ANGLE_THRESH = 25;
        this.BARRE_MIN_COVERED = 2;
        this.FRET_HISTORY_LEN = 3;
        this.PINKY_FRET_HISTORY_LEN = 5;
        this.PINKY_ANGLE_THRESH = 120;

        // 手指定义
        this.FINGER_DEFS = [
            { name: '食指', indices: [6, 7, 8] },
            { name: '中指', indices: [10, 11, 12] },
            { name: '无名指', indices: [14, 15, 16] },
            { name: '小指', indices: [18, 19, 20] }
        ];

        // 历史记录
        this.fretHistory = {};
        this.barreHistory = [];
    }

    /**
     * 设置指板参数（由 fretboard_params 事件调用）
     */
    setParams(params) {
        this.params = params;
        // 预计算向量和辅助数据，加速后续计算
        if (params) {
            this._precompute();
            this.ready = true;
        } else {
            this.ready = false;
        }
    }

    _precompute() {
        const p = this.params;
        
        // 琴弦向量预计算
        this.stringVectors = p.strings.map(s => {
            const nut = s.nut;
            const bridge = s.bridge;
            const dx = bridge[0] - nut[0];
            const dy = bridge[1] - nut[1];
            const len = Math.hypot(dx, dy);
            return { nut, bridge, dx, dy, len };
        });

        // 品丝预计算（用于距离计算）
        this.fretSegments = p.frets.map(f => ({
            fret: f.fret,
            p1: f.p1,
            p2: f.p2
        }));

        // 单位向量
        this.vUnit = p.v_unit;
        this.perpUnit = p.perp_unit;
        this.vLen = p.v_len;
        this.nutCenter = p.nut_center;

        // 弦号映射
        this.stringNoMap = p.string_no_map || {};
    }

    /**
     * 主检测入口：接收 MediaPipe 归一化 landmarks，返回 { positions, barre }
     */
        detect(landmarks, imgWidth, imgHeight) {
            if (!this.ready || !landmarks || landmarks.length < 21) {
                return { positions: [], barre: null };
            }

            const thumbW = THUMBNAIL_WIDTH;
            const scale = imgWidth / thumbW;
            // 如果画面比例与缩略图不一致，可对 Y 轴单独缩放（通常等比例即可）
            const scaleY = scale;

            // 将手部归一化坐标转为视频像素坐标
            const pxLandmarks = landmarks.map(lm => [
                lm.x * imgWidth,
                lm.y * imgHeight
            ]);

            // 动态缩放弦线向量（供距离计算使用）
            const scaledStringVectors = this.params.strings.map(s => {
                const nut = [s.nut[0] * scale, s.nut[1] * scaleY];
                const bridge = [s.bridge[0] * scale, s.bridge[1] * scaleY];
                const dx = bridge[0] - nut[0];
                const dy = bridge[1] - nut[1];
                const len = Math.hypot(dx, dy);
                return { nut, bridge, dx, dy, len };
            });

            // 动态缩放品丝线段
            const scaledFretSegments = this.params.frets.map(f => ({
                fret: f.fret,
                p1: [f.p1[0] * scale, f.p1[1] * scaleY],
                p2: [f.p2[0] * scale, f.p2[1] * scaleY]
            }));

            // 临时替换实例变量，使内部方法 _detectBarre 和 _detectFingerPress 使用缩放后的数据
            const origStringVectors = this.stringVectors;
            const origFretSegments = this.fretSegments;
            const origVLen = this.vLen;
            const origNutCenter = this.nutCenter;

            this.stringVectors = scaledStringVectors;
            this.fretSegments = scaledFretSegments;
            this.vLen = this.params.v_len * scale;
            this.nutCenter = this.params.nut_center ? [this.params.nut_center[0] * scale, this.params.nut_center[1] * scaleY] : null;

            try {
                const barre = this._detectBarre(pxLandmarks);
                const positions = [];
                for (const finger of this.FINGER_DEFS) {
                    if (finger.name === '食指' && barre) continue;
                    const result = this._detectFingerPress(pxLandmarks, finger);
                    if (result) positions.push(result);
                }
                return { positions, barre };
            } finally {
                // 即使异常也恢复原始值，防止状态损坏
                this.stringVectors = origStringVectors;
                this.fretSegments = origFretSegments;
                this.vLen = origVLen;
                this.nutCenter = origNutCenter;
            }
        }

    _detectBarre(landmarks) {
        const indexPoints = [5, 6, 7, 8].map(i => landmarks[i]);
        if (indexPoints.length < 2) return null;

        // 拟合直线
        const line = this._fitLine(indexPoints);
        if (!line) return null;

        // 计算与垂直方向的夹角
        const dot = Math.abs(line.dir[0] * this.perpUnit[0] + line.dir[1] * this.perpUnit[1]);
        const angleDeg = Math.acos(Math.min(dot, 1)) * 180 / Math.PI;
        if (angleDeg > this.BARRE_ANGLE_THRESH) return null;

        // 计算覆盖的弦
        const proj = indexPoints.map(p => this._dot(p, this.perpUnit));
        const minProj = Math.min(...proj);
        const maxProj = Math.max(...proj);

        const coveredStrings = [];
        for (let i = 0; i < this.stringVectors.length; i++) {
            const mid = [
                (this.stringVectors[i].nut[0] + this.stringVectors[i].bridge[0]) / 2,
                (this.stringVectors[i].nut[1] + this.stringVectors[i].bridge[1]) / 2
            ];
            const val = this._dot(mid, this.perpUnit);
            if (val >= minProj && val <= maxProj) {
                coveredStrings.push(i + 1);
            }
        }

        if (coveredStrings.length < this.BARRE_MIN_COVERED) return null;

        // 找最长连续区间
        coveredStrings.sort((a, b) => a - b);
        let longestStart = coveredStrings[0], longestEnd = coveredStrings[0];
        let curStart = coveredStrings[0], curEnd = coveredStrings[0];
        for (let i = 1; i < coveredStrings.length; i++) {
            if (coveredStrings[i] === curEnd + 1) {
                curEnd = coveredStrings[i];
            } else {
                if (curEnd - curStart > longestEnd - longestStart) {
                    longestStart = curStart;
                    longestEnd = curEnd;
                }
                curStart = curEnd = coveredStrings[i];
            }
        }
        if (curEnd - curStart > longestEnd - longestStart) {
            longestStart = curStart;
            longestEnd = curEnd;
        }

        if (longestEnd - longestStart + 1 < this.BARRE_MIN_COVERED) return null;

        // 计算品柱
        const tipIdx = 8;
        const tipPt = landmarks[tipIdx];
        const fret = this._getFretFromPoint(tipPt);

        // 应用弦号映射
        const startMapped = this.stringNoMap[longestStart] || longestStart;
        const endMapped = this.stringNoMap[longestEnd] || longestEnd;

        return {
            fret: fret,
            startString: Math.min(startMapped, endMapped),
            endString: Math.max(startMapped, endMapped)
        };
    }

    _detectFingerPress(landmarks, finger) {
        const tipIdx = finger.indices[2];
        const tipPt = landmarks[tipIdx];

        const isPinky = finger.name === '小指';
        const pressThresh = isPinky ? this.PINKY_PRESS_THRESHOLD_PX : this.PRESS_THRESHOLD_PX;
        const stringThresh = isPinky ? this.PINKY_STRING_DIST_THRESH : this.STRING_DIST_THRESH;
        const historyLen = isPinky ? this.PINKY_FRET_HISTORY_LEN : this.FRET_HISTORY_LEN;

        // 小指角度检查
        if (isPinky) {
            const p18 = landmarks[18];
            const p19 = landmarks[19];
            const p20 = landmarks[20];
            const v1 = [p19[0] - p18[0], p19[1] - p18[1]];
            const v2 = [p20[0] - p19[0], p20[1] - p19[1]];
            const len1 = Math.hypot(v1[0], v1[1]);
            const len2 = Math.hypot(v2[0], v2[1]);
            if (len1 > 0 && len2 > 0) {
                const dot = v1[0]*v2[0] + v1[1]*v2[1];
                const cos = dot / (len1 * len2);
                const angle = Math.acos(Math.min(1, Math.max(-1, cos))) * 180 / Math.PI;
                if (angle < this.PINKY_ANGLE_THRESH) return null;
            } else {
                return null;
            }
        }

        // 距离品丝检查
        let minFretDist = Infinity;
        for (const seg of this.fretSegments) {
            const dist = this._pointToSegmentDistance(tipPt, seg.p1, seg.p2);
            if (dist < minFretDist) minFretDist = dist;
        }
        if (minFretDist > pressThresh) return null;

        // 找最近的弦
        let minStringDist = Infinity;
        let closestString = 1;
        for (let i = 0; i < this.stringVectors.length; i++) {
            const sv = this.stringVectors[i];
            const dist = this._pointToSegmentDistance(tipPt, sv.nut, sv.bridge);
            if (dist < minStringDist) {
                minStringDist = dist;
                closestString = i + 1;
            }
        }
        if (minStringDist > stringThresh) return null;

        // 计算品柱
        const fret = this._getFretFromPoint(tipPt);

        // 历史投票
        if (!this.fretHistory[finger.name]) {
            this.fretHistory[finger.name] = [];
        }
        this.fretHistory[finger.name].push(fret);
        if (this.fretHistory[finger.name].length > historyLen) {
            this.fretHistory[finger.name].shift();
        }
        const finalFret = this._mostFrequent(this.fretHistory[finger.name]);

        const mappedString = this.stringNoMap[closestString] || closestString;

        return {
            string: mappedString,
            fret: finalFret
        };
    }

    _getFretFromPoint(pt) {
        if (!this.nutCenter || !this.vUnit || this.vLen === 0) return 1;
        const w = [pt[0] - this.nutCenter[0], pt[1] - this.nutCenter[1]];
        const t = (w[0]*this.vUnit[0] + w[1]*this.vUnit[1]) / this.vLen;
        const clamped = Math.min(1, Math.max(0, t));
        // 二分查找品柱
        for (let i = 1; i <= this.params.num_frets; i++) {
            const ratio = 1 - Math.pow(2, -i/12);
            if (clamped <= ratio) return i;
        }
        return this.params.num_frets;
    }

    _pointToSegmentDistance(p, a, b) {
        const abx = b[0] - a[0], aby = b[1] - a[1];
        const apx = p[0] - a[0], apy = p[1] - a[1];
        const len2 = abx*abx + aby*aby;
        if (len2 === 0) return Math.hypot(apx, apy);
        let t = (apx*abx + apy*aby) / len2;
        t = Math.max(0, Math.min(1, t));
        const projx = a[0] + t * abx;
        const projy = a[1] + t * aby;
        return Math.hypot(p[0] - projx, p[1] - projy);
    }

    _fitLine(points) {
        const n = points.length;
        if (n < 2) return null;
        let sumX = 0, sumY = 0;
        for (const p of points) {
            sumX += p[0]; sumY += p[1];
        }
        const meanX = sumX / n, meanY = sumY / n;
        let xx = 0, yy = 0, xy = 0;
        for (const p of points) {
            const dx = p[0] - meanX;
            const dy = p[1] - meanY;
            xx += dx*dx;
            yy += dy*dy;
            xy += dx*dy;
        }
        let dir;
        if (xx > yy) {
            const slope = xy / xx;
            dir = [1, slope];
        } else {
            const slope = xy / yy;
            dir = [slope, 1];
        }
        const len = Math.hypot(dir[0], dir[1]);
        dir = [dir[0]/len, dir[1]/len];
        return { dir, point: [meanX, meanY] };
    }

    _dot(a, b) {
        return a[0]*b[0] + a[1]*b[1];
    }

    _mostFrequent(arr) {
        const counts = {};
        let maxCount = 0, maxVal = arr[0];
        for (const v of arr) {
            counts[v] = (counts[v] || 0) + 1;
            if (counts[v] > maxCount) {
                maxCount = counts[v];
                maxVal = v;
            }
        }
        return maxVal;
    }

    reset() {
        this.fretHistory = {};
        this.barreHistory = [];
    }
}

// 导出为全局
window.FingeringDetector = FingeringDetector;