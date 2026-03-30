let dashboardData = null;
let currentChartType = null;
let modalChartInstance = null;

// 推荐列表相关变量
let currentRecommendations = [];
let addedChords = new Set(); // 已加入的和弦，用于界面状态

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

    // 加载已加入的和弦列表（从localStorage）
    loadAddedChords();

    // 加载推荐列表
    await loadRecommendations();

    // 绑定刷新按钮
    const refreshBtn = document.getElementById('refreshRecommendBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            refreshBtn.textContent = '⏳';
            await loadRecommendations(true);
            refreshBtn.disabled = false;
            refreshBtn.textContent = '🔄';
        });
    }

    // 暴露给语音控制
    window.showChartModal = showChartModal;
});

async function loadDashboardData() {
    try {
        const response = await fetch('/api/teach/dashboard');
        const data = await response.json();
        dashboardData = data;

        document.getElementById('total-duration').textContent = data.overview.total_duration;
        document.getElementById('total-sessions').textContent = data.overview.total_sessions;
        document.getElementById('avg-accuracy').textContent = data.overview.avg_accuracy;
        document.getElementById('weak-chords').textContent = data.overview.weak_chords.join('、');

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

// ========== 推荐列表相关 ==========

// 从localStorage加载已加入的和弦
function loadAddedChords() {
    const stored = localStorage.getItem('pendingSoloChords');
    if (stored) {
        try {
            const chords = JSON.parse(stored);
            addedChords = new Set(chords);
        } catch(e) {}
    }
}

// 保存已加入的和弦到localStorage
function saveAddedChords() {
    localStorage.setItem('pendingSoloChords', JSON.stringify(Array.from(addedChords)));
}

// 获取推荐列表（模拟 AI 生成，实际可对接后端 API）
async function fetchRecommendations() {
    // 模拟后端返回，实际应调用 /api/teach/recommend_chords
    // 这里使用常见和弦库，随机取 3~5 个，并去重
    const commonChords = ['C', 'G', 'D', 'Am', 'Em', 'F', 'Bm', 'A', 'E', 'Dm', 'F#m', 'B'];
    const count = Math.floor(Math.random() * 3) + 3; // 3~5
    // 随机抽取不重复的和弦
    const shuffled = [...commonChords];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count);
}

async function loadRecommendations(refresh = false) {
    try {
        // 可调用真实 API，这里先使用模拟
        // const response = await fetch('/api/teach/recommend_chords');
        // const data = await response.json();
        // currentRecommendations = data.chords;
        currentRecommendations = await fetchRecommendations();
        renderRecommendations();
    } catch (e) {
        console.error('获取推荐失败', e);
        // 降级使用静态列表
        currentRecommendations = ['C', 'G', 'Am'];
        renderRecommendations();
    }
}

function renderRecommendations() {
    const container = document.getElementById('recommendList');
    if (!container) return;
    if (!currentRecommendations || currentRecommendations.length === 0) {
        container.innerHTML = '<div class="recommend-item">暂无推荐，点击刷新</div>';
        return;
    }
    container.innerHTML = currentRecommendations.map(chord => {
        const isAdded = addedChords.has(chord);
        return `
            <div class="recommend-item" data-chord="${chord}">
                <span class="chord-name">${chord}</span>
                <button class="add-btn ${isAdded ? 'added' : ''}" data-chord="${chord}" ${isAdded ? 'disabled' : ''}>
                    ${isAdded ? '✓ 已加入' : '+ 加入训练列表'}
                </button>
            </div>
        `;
    }).join('');

    // 绑定按钮事件
    document.querySelectorAll('.add-btn').forEach(btn => {
        if (btn.disabled) return;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const chord = btn.getAttribute('data-chord');
            if (chord && !addedChords.has(chord)) {
                addedChords.add(chord);
                saveAddedChords();
                // 更新按钮样式
                btn.classList.add('added');
                btn.textContent = '✓ 已加入';
                btn.disabled = true;
                // 可选：提示
                // VoiceGuide.speak(`已将${chord}和弦加入训练列表`);
            }
        });
    });
}

// ========== 模态框图表 ==========

function showChartModal(type) {
    if (!dashboardData) {
        console.warn('数据未加载完成');
        return;
    }

    const radarBtn = document.querySelector('[data-chart="radar"]');
    const progressBtn = document.querySelector('[data-chart="progress"]');
    radarBtn.classList.toggle('active', type === 'radar');
    progressBtn.classList.toggle('active', type === 'progress');

    const modalTitle = document.getElementById('modalTitle');
    const modalChartBox = document.getElementById('modalChartBox');

    if (modalChartInstance) {
        modalChartInstance.dispose();
        modalChartInstance = null;
    }
    modalChartBox.innerHTML = '';

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

    const modal = document.getElementById('chartModal');
    modal.classList.add('active');

    const resizeHandler = () => {
        if (modalChartInstance && modalChartInstance.resize) {
            modalChartInstance.resize();
        }
    };
    window.addEventListener('resize', resizeHandler);
    modal._resizeHandler = resizeHandler;
}

function closeModal() {
    const modal = document.getElementById('chartModal');
    modal.classList.remove('active');
    if (modal._resizeHandler) {
        window.removeEventListener('resize', modal._resizeHandler);
        delete modal._resizeHandler;
    }
    if (modalChartInstance) {
        modalChartInstance.dispose();
        modalChartInstance = null;
    }
}