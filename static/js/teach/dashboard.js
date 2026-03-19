/**
 * 教学仪表盘主逻辑
 */
document.addEventListener('DOMContentLoaded', async () => {
    // 加载初始数据
    await loadDashboardData();

    // 图表选项卡切换
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            switchChart(tab.dataset.chart);
        });
    });

    // 生成智能指导按钮
    document.getElementById('generate-advice-btn').addEventListener('click', generateAdvice);

    // 朗读指导按钮
    document.getElementById('speak-advice-btn').addEventListener('click', () => {
        const adviceText = document.querySelector('.advice-text').innerText;
        if (adviceText && adviceText !== '点击“生成智能指导”获取个性化建议') {
            VoiceGuide.speak(adviceText);
        }
    });

    // 语音遥控
    document.getElementById('voice-toggle').addEventListener('click', () => {
        VoiceGuide.toggleListening(handleVoiceCommand);
    });
});

// 存储当前图表类型和所有数据
let currentChart = 'mastery';
let dashboardData = null;

async function loadDashboardData() {
    try {
        const response = await fetch('/api/teach/dashboard');
        const data = await response.json();
        dashboardData = data;

        // 更新左侧概览
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

        // 默认显示掌握度图表
        switchChart('mastery');
    } catch (e) {
        console.error('加载数据失败', e);
    }
}

function switchChart(type) {
    currentChart = type;
    if (!dashboardData) return;

    if (type === 'mastery') {
        Charts.renderMastery('chart-container', dashboardData.mastery);
    } else if (type === 'progress') {
        Charts.renderProgress('chart-container', dashboardData.progress);
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

function handleVoiceCommand(command) {
    console.log('语音指令：', command);
    if (command.includes('掌握度')) {
        switchChart('mastery');
        // 激活对应选项卡
        document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
        document.querySelector('[data-chart="mastery"]').classList.add('active');
    } else if (command.includes('进步') || command.includes('曲线')) {
        switchChart('progress');
        document.querySelector('[data-chart="progress"]').classList.add('active');
    } else if (command.includes('朗读') || command.includes('读一下')) {
        const adviceText = document.querySelector('.advice-text').innerText;
        if (adviceText && adviceText !== '点击“生成智能指导”获取个性化建议') {
            VoiceGuide.speak(adviceText);
        }
    } else if (command.includes('新建议') || command.includes('生成')) {
        generateAdvice();
    } else if (command.includes('练习')) {
        // 简单提取和弦名，例如“练习 C 和弦”
        const match = command.match(/练习\s*([A-G][#b]?m?)/);
        if (match) {
            const chord = match[1];
            window.location.href = `/solo?chord=${chord}`;
        } else {
            VoiceGuide.speak('请指定要练习的和弦，比如“练习 C 和弦”');
        }
    } else {
        VoiceGuide.speak('抱歉，我没有听清指令');
    }
}