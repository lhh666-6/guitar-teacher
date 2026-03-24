/**
 * 教学仪表盘主逻辑（双图表同时展示）
 */
document.addEventListener('DOMContentLoaded', async () => {
    await loadDashboardData();

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

let dashboardData = null;

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

        // 同时渲染两个图表
        if (data.mastery && data.mastery.chords.length) {
            Charts.renderMastery('radar-chart', data.mastery);
        }
        if (data.progress && data.progress.dates.length) {
            Charts.renderProgress('progress-chart', data.progress);
        }
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

function handleVoiceCommand(command) {
    console.log('语音指令：', command);
    if (command.includes('掌握度')) {
        // 如果用户想单独聚焦雷达图，可以高亮对应的图表卡片（简单滚动）
        document.getElementById('radar-chart').scrollIntoView({ behavior: 'smooth' });
        VoiceGuide.speak('已为您展示和弦掌握度雷达图');
    } else if (command.includes('进步') || command.includes('曲线')) {
        document.getElementById('progress-chart').scrollIntoView({ behavior: 'smooth' });
        VoiceGuide.speak('已为您展示进步趋势曲线');
    } else if (command.includes('朗读') || command.includes('读一下')) {
        const adviceText = document.querySelector('.advice-text').innerText;
        if (adviceText && adviceText !== '点击“生成智能指导”获取个性化建议') {
            VoiceGuide.speak(adviceText);
        } else {
            VoiceGuide.speak('请先生成智能指导');
        }
    } else if (command.includes('新建议') || command.includes('生成')) {
        generateAdvice();
    } else if (command.includes('练习')) {
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