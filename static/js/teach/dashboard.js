let dashboardData = null;
let currentChartType = null;
let modalChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadDashboardData();

    // 绑定生成指导按钮
    document.getElementById('generate-advice-btn').addEventListener('click', generateAdvice);
    document.getElementById('speak-advice-btn').addEventListener('click', () => {
        const adviceText = document.querySelector('.advice-text').innerText;
        if (adviceText && adviceText !== '点击“生成智能指导”获取个性化建议') {
            VoiceGuide.speak(adviceText);
        }
    });

    // 语音唤醒按钮
    const voiceToggleBtn = document.getElementById('voice-toggle');
    if (voiceToggleBtn) {
        voiceToggleBtn.addEventListener('click', () => {
            if (window.VoiceGuide && window.VoiceGuide.wakeUp) {
                VoiceGuide.wakeUp();
            }
        });
    }

    // 绑定图表按钮（打开模态框）
    const radarBtn = document.querySelector('[data-chart="radar"]');
    const progressBtn = document.querySelector('[data-chart="progress"]');
    radarBtn.addEventListener('click', () => showChartModal('radar'));
    progressBtn.addEventListener('click', () => showChartModal('progress'));

    // 模态框关闭事件
    const modal = document.getElementById('chartModal');
    const closeBtn = document.getElementById('closeModalBtn');
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // 暴露给语音控制
    window.showChartModal = showChartModal;
});

async function loadDashboardData() {
    try {
        const response = await fetch('/api/teach/dashboard');
        const data = await response.json();
        dashboardData = data;

        // 更新顶部指标
        document.getElementById('total-duration').textContent = data.overview.total_duration;
        document.getElementById('total-sessions').textContent = data.overview.total_sessions;
        document.getElementById('avg-accuracy').textContent = data.overview.avg_accuracy;
        document.getElementById('weak-chords').textContent = data.overview.weak_chords.join('、');

        // 更新最近记录表格
        const tbody = document.querySelector('#records-table tbody');
        tbody.innerHTML = data.recent_records.map(r => `
            <tr>
                <td>${r.time}</td>
                <td>${r.chord}</td>
                <td>${r.accuracy}%</td>
                <td>${r.duration}</td>
            </tr>
        `).join('');
    } catch (e) {
        console.error('加载数据失败', e);
    }
}

async function generateAdvice() {
    const btn = document.getElementById('generate-advice-btn');
    btn.disabled = true;
    btn.textContent = '生成中...';
    try {
        const response = await fetch('/api/teach/generate_advice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const data = await response.json();
        document.querySelector('.advice-text').innerText = data.advice;
    } catch (e) {
        alert('生成失败，请稍后重试');
    } finally {
        btn.disabled = false;
        btn.textContent = '✨ 生成智能指导';
    }
}

function showChartModal(type) {
    if (!dashboardData) {
        console.warn('数据未加载完成');
        return;
    }

    // 更新按钮激活样式
    const radarBtn = document.querySelector('[data-chart="radar"]');
    const progressBtn = document.querySelector('[data-chart="progress"]');
    radarBtn.classList.toggle('active', type === 'radar');
    progressBtn.classList.toggle('active', type === 'progress');

    const modalTitle = document.getElementById('modalTitle');
    const modalChartBox = document.getElementById('modalChartBox');

    // 清空容器（如果之前有图表则销毁）
    if (modalChartInstance) {
        modalChartInstance.dispose();
        modalChartInstance = null;
    }
    modalChartBox.innerHTML = ''; // 清空内部可能残留的 canvas

    // 根据类型渲染图表到模态框
    if (type === 'radar') {
        if (dashboardData.mastery && dashboardData.mastery.chords.length) {
            modalTitle.textContent = '🎯 和弦掌握度';
            modalChartInstance = Charts.renderMasteryInElement(modalChartBox, dashboardData.mastery);
        } else {
            modalChartBox.innerHTML = '<p style="text-align:center; color:#ecd9b4;">暂无掌握度数据</p>';
        }
    } else if (type === 'progress') {
        if (dashboardData.progress && dashboardData.progress.dates.length) {
            modalTitle.textContent = '📈 进步趋势';
            modalChartInstance = Charts.renderProgressInElement(modalChartBox, dashboardData.progress);
        } else {
            modalChartBox.innerHTML = '<p style="text-align:center; color:#ecd9b4;">暂无进步数据</p>';
        }
    }

    // 显示模态框
    const modal = document.getElementById('chartModal');
    modal.classList.add('active');

    // 监听窗口缩放，重新调整图表尺寸
    const resizeHandler = () => {
        if (modalChartInstance && modalChartInstance.resize) {
            modalChartInstance.resize();
        }
    };
    window.addEventListener('resize', resizeHandler);
    // 保存以便关闭时移除
    modal._resizeHandler = resizeHandler;
}

function closeModal() {
    const modal = document.getElementById('chartModal');
    modal.classList.remove('active');
    // 移除 resize 监听
    if (modal._resizeHandler) {
        window.removeEventListener('resize', modal._resizeHandler);
        delete modal._resizeHandler;
    }
    // 可选：销毁图表实例以释放资源
    if (modalChartInstance) {
        modalChartInstance.dispose();
        modalChartInstance = null;
    }
}