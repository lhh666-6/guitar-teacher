/**
 * 吉他风格粒子系统
 * 包含圆形、拨片、小音符，颜色为木质暖色
 */
(function() {
    const canvas = document.getElementById('particles-js');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let width, height;
    let particles = [];
    const PARTICLE_COUNT = 80;

    // 粒子类型
    const TYPES = ['circle', 'pick', 'note'];
    // 暖色调
    const COLORS = [
        '#d4a373', '#b5835a', '#e9b384', '#c78c5c', '#a5673f', '#d98c4a'
    ];

    function random(min, max) {
        return Math.random() * (max - min) + min;
    }

    function initParticles() {
        particles = [];
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const type = TYPES[Math.floor(Math.random() * TYPES.length)];
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: random(-0.3, 0.3),
                vy: random(-0.3, 0.3),
                size: random(6, 14),      // 基础大小
                color: COLORS[Math.floor(Math.random() * COLORS.length)],
                alpha: random(0.2, 0.7),
                type: type,
                rotation: random(0, Math.PI * 2), // 旋转角度
            });
        }
    }

    function resizeCanvas() {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
        initParticles();
    }

    // 绘制拨片 (简单的圆角三角形)
    function drawPick(x, y, size, color, alpha, rotation) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation);
        ctx.beginPath();
        const h = size * 1.5;
        const w = size * 0.9;
        ctx.moveTo(0, -h/2);
        ctx.lineTo(w/2, h/2);
        ctx.lineTo(-w/2, h/2);
        ctx.closePath();
        ctx.fillStyle = color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
        ctx.fill();
        // 添加高光
        ctx.beginPath();
        ctx.moveTo(0, -h/3);
        ctx.lineTo(w/5, h/5);
        ctx.lineTo(-w/5, h/5);
        ctx.closePath();
        ctx.fillStyle = '#fff' + '40';
        ctx.fill();
        ctx.restore();
    }

    // 绘制八分音符 (简化)
    function drawNote(x, y, size, color, alpha, rotation) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation);
        ctx.fillStyle = color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
        // 椭圆头部
        ctx.beginPath();
        ctx.ellipse(0, -size*0.2, size*0.4, size*0.25, 0, 0, Math.PI*2);
        ctx.fill();
        // 杆
        ctx.fillRect(size*0.3, -size*0.5, size*0.1, size);
        // 尾巴 (简化为一个小勾)
        ctx.beginPath();
        ctx.moveTo(size*0.4, -size*0.2);
        ctx.quadraticCurveTo(size*0.6, -size*0.1, size*0.5, size*0.2);
        ctx.lineWidth = size*0.1;
        ctx.strokeStyle = color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
        ctx.stroke();
        ctx.restore();
    }

    function drawParticles() {
        ctx.clearRect(0, 0, width, height);

        particles.forEach(p => {
            // 更新位置
            p.x += p.vx;
            p.y += p.vy;

            // 边界反弹 (柔和)
            if (p.x < 0 || p.x > width) p.vx *= -0.9;
            if (p.y < 0 || p.y > height) p.vy *= -0.9;

            // 限制边界
            p.x = Math.max(0, Math.min(width, p.x));
            p.y = Math.max(0, Math.min(height, p.y));

            // 随机轻微旋转
            p.rotation += 0.002;

            // 根据类型绘制
            if (p.type === 'circle') {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
                ctx.fillStyle = p.color + Math.floor(p.alpha * 255).toString(16).padStart(2, '0');
                ctx.fill();
                // 内圈高光
                ctx.beginPath();
                ctx.arc(p.x-1, p.y-1, p.size * 0.2, 0, Math.PI * 2);
                ctx.fillStyle = '#fff' + '60';
                ctx.fill();
            } else if (p.type === 'pick') {
                drawPick(p.x, p.y, p.size, p.color, p.alpha, p.rotation);
            } else if (p.type === 'note') {
                drawNote(p.x, p.y, p.size, p.color, p.alpha, p.rotation);
            }
        });

        requestAnimationFrame(drawParticles);
    }

    window.addEventListener('resize', () => {
        resizeCanvas();
    });

    resizeCanvas();
    drawParticles();
})();