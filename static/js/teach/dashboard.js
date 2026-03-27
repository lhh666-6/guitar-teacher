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

    // 语音遥控按钮（可选，新版 VoiceGuide 自动监听唤醒词）
    const voiceToggleBtn = document.getElementById('voice-toggle');
    if (voiceToggleBtn) {
        voiceToggleBtn.addEventListener('click', () => {
            if (window.VoiceGuide && window.VoiceGuide.wakeUp) {
                VoiceGuide.wakeUp();
            }
        });
    }
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

// ========== 全局语音控制器适配 ==========
if (window.VoiceGuide) {
    // 注册 UI 动作
    VoiceGuide.registerAction('show_radar', () => {
        if (window.radarChart) {
            document.getElementById('radar-chart').scrollIntoView({ behavior: 'smooth' });
            VoiceGuide.speak('已显示和弦掌握度');
        }
    });
    VoiceGuide.registerAction('show_progress', () => {
        if (window.progressChart) {
            document.getElementById('progress-chart').scrollIntoView({ behavior: 'smooth' });
            VoiceGuide.speak('已显示进步趋势');
        }
    });
    VoiceGuide.registerAction('read_advice', () => {
        const adviceText = document.querySelector('.advice-text').innerText;
        if (adviceText && adviceText !== '点击“生成智能指导”获取个性化建议') {
            VoiceGuide.speak(adviceText);
        } else {
            VoiceGuide.speak('请先生成智能指导');
        }
    });
    VoiceGuide.registerAction('generate_advice', () => {
        generateAdvice();
    });
    VoiceGuide.registerAction('goto_solo', (params) => {
        if (params.chord) {
            window.location.href = `/solo?chord=${encodeURIComponent(params.chord)}`;
        } else {
            VoiceGuide.speak('请指定要练习的和弦，比如“练习 C 和弦”');
        }
    });

    // 注册页面指令（驾驶舱特有）
    VoiceGuide.registerPageCommands('/teach', [
        { patterns: ['显示掌握度', '掌握度'], action: 'show_radar' },
        { patterns: ['显示进步曲线', '进步曲线'], action: 'show_progress' },
        { patterns: ['朗读指导'], action: 'read_advice' },
        { patterns: ['生成新建议', '生成指导'], action: 'generate_advice' },
        { patterns: [/练习\s*([A-G#b]+)/, '开始练习'], action: 'goto_solo', extract: (match) => ({ chord: match[1] }) }
    ]);
}