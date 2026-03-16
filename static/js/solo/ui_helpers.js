// ========== ui_helpers.js ==========
// 纯绘制函数，不依赖主类状态，仅通过参数传递上下文

/**
 * 在画布上绘制本地手部关键点（实时跟随）
 * @param {CanvasRenderingContext2D} ctx 画布上下文
 * @param {number} canvasWidth 画布宽度
 * @param {number} canvasHeight 画布高度
 * @param {Array} landmarks 归一化关键点数组 [{x,y}, ...]
 */
function drawLocalHandLandmarks(ctx, canvasWidth, canvasHeight, landmarks) {
    // 测试红色方块（可删除）
    ctx.fillStyle = 'red';
    ctx.fillRect(50, 50, 30, 30);

    if (!landmarks) return;
    landmarks.forEach(lm => {
        const x = canvasWidth - lm.x * canvasWidth; // 翻转 x 以匹配镜像视频
        const y = lm.y * canvasHeight;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fillStyle = '#00ff00';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
    });
}

/**
 * 绘制来自后端的检测结果（琴弦、品丝、按弦点）
 * @param {CanvasRenderingContext2D} ctx 画布上下文
 * @param {number} canvasWidth 画布宽度
 * @param {number} canvasHeight 画布高度
 * @param {Object} drawingData 后端返回的绘图数据
 */
function drawOverlay(ctx, canvasWidth, canvasHeight, drawingData) {
    if (!drawingData) return;

    const origWidth = drawingData.image_size[0];
    const origHeight = drawingData.image_size[1];
    const scaleX = canvasWidth / origWidth;
    const scaleY = canvasHeight / origHeight;

    // 绘制琴弦（翻转 x 坐标）
    if (drawingData.strings) {
        drawingData.strings.forEach(s => {
            const x1 = canvasWidth - s.start[0] * scaleX;
            const y1 = s.start[1] * scaleY;
            const x2 = canvasWidth - s.end[0] * scaleX;
            const y2 = s.end[1] * scaleY;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = '#ffaa00';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        });
    }

    // 绘制品丝（翻转 x 坐标）
    if (drawingData.frets) {
        drawingData.frets.forEach(f => {
            const x1 = canvasWidth - f.start[0] * scaleX;
            const y1 = f.start[1] * scaleY;
            const x2 = canvasWidth - f.end[0] * scaleX;
            const y2 = f.end[1] * scaleY;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.stroke();
        });
    }

    // 绘制按弦点（翻转 x 坐标）
    if (drawingData.press_points) {
        drawingData.press_points.forEach(p => {
            if (p.is_barre && p.index_points) {
                if (p.index_points.length >= 2) {
                    ctx.beginPath();
                    const first = p.index_points[0];
                    const x1 = canvasWidth - first[0] * scaleX;
                    const y1 = first[1] * scaleY;
                    ctx.moveTo(x1, y1);
                    for (let i = 1; i < p.index_points.length; i++) {
                        const xi = canvasWidth - p.index_points[i][0] * scaleX;
                        const yi = p.index_points[i][1] * scaleY;
                        ctx.lineTo(xi, yi);
                    }
                    ctx.closePath();
                    ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
                    ctx.fill();
                    ctx.strokeStyle = '#ffff00';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            } else if (p.tip_x !== undefined && p.tip_y !== undefined) {
                const x = canvasWidth - p.tip_x * scaleX;
                const y = p.tip_y * scaleY;
                ctx.beginPath();
                ctx.arc(x, y, 8, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
                ctx.fill();
                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.font = '12px Arial';
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = '#000';
                ctx.shadowBlur = 4;
                ctx.fillText(p.finger, x + 10, y - 10);
                ctx.shadowBlur = 0;
            }
        });
    }
}