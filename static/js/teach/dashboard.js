let dashboardData = null;
let modalChartInstance = null;
let currentRecommendations = [];
let addedChords = new Set();

const WAITING_MESSAGES = [
    '正在分析练习数据...',
    '请教 AI 教练中...',
    '诊断薄弱环节...',
    '生成个性化建议...',
    '马上就好，请稍候~',
    '正在整理思路...',
    '为您量身定制指导...'
];

const generateBtn = document.getElementById('generate-advice-btn');
const adviceTextEl = document.getElementById('adviceTextDisplay');
const loadingContainer = document.getElementById('adviceLoadingContainer');
const bubbleMsgEl = document.getElementById('bubbleMessage');

let loadingInterval = null;
let loadingStartTime = null;
let isLoading = false;

function showLoading() {
    if (isLoading) return;
    isLoading = true;
    adviceTextEl.classList.add('hidden');
    loadingContainer.classList.remove('hidden');
    generateBtn.disabled = true;
    generateBtn.textContent = '生成中...';
    let msgIndex = 0;
    const updateBubble = () => {
        bubbleMsgEl.style.opacity = '0';
        setTimeout(() => {
            bubbleMsgEl.textContent = WAITING_MESSAGES[msgIndex % WAITING_MESSAGES.length];
            bubbleMsgEl.style.opacity = '1';
            msgIndex++;
        }, 150);
    };
    updateBubble();
    loadingInterval = setInterval(updateBubble, 2000);
}

function hideLoading(minTime = 1500) {
    return new Promise(resolve => {
        const hide = () => {
            if (loadingInterval) {
                clearInterval(loadingInterval);
                loadingInterval = null;
            }
            loadingContainer.classList.add('hidden');
            adviceTextEl.classList.remove('hidden');
            generateBtn.disabled = false;
            generateBtn.textContent = '生成智能指导';
            isLoading = false;
            resolve();
        };
        if (!loadingStartTime) {
            hide();
            return;
        }
        const elapsed = Date.now() - loadingStartTime;
        if (elapsed >= minTime) hide();
        else setTimeout(hide, minTime - elapsed);
        loadingStartTime = null;
    });
}

function startLoading() {
    loadingStartTime = Date.now();
    showLoading();
}

// 渲染新增的三个卡片
function renderExtraStats(data) {
    const unstableCountEl = document.getElementById('unstable-count');
    const unstableRatioEl = document.getElementById('unstable-ratio');
    const practiceModeEl = document.getElementById('practice-mode');

    if (unstableCountEl) {
        unstableCountEl.textContent = data.unstable_count ?? 0;
    }
    if (unstableRatioEl) {
        unstableRatioEl.textContent = (data.unstable_ratio ?? 0).toFixed(1) + '%';
    }
    if (practiceModeEl) {
        const mode = data.recent_mode;
        practiceModeEl.textContent = mode === 'quick' ? '快速模式' : (mode === 'normal' ? '普通模式' : '无记录');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    startLoading();
    await loadDashboardData();
    await hideLoading(1500);

    generateBtn.addEventListener('click', async () => {
        startLoading();
        try {
            const response = await fetch('/api/teach/generate_advice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const data = await response.json();
            adviceTextEl.innerText = data.advice || '暂时无法生成建议，请稍后再试。';
        } catch (e) {
            adviceTextEl.innerText = '生成失败，请稍后重试';
        } finally {
            await hideLoading(1500);
        }
    });

    document.getElementById('speak-advice-btn').addEventListener('click', () => {
        const text = adviceTextEl.innerText;
        if (text && text !== '点击"生成智能指导"获取个性化建议' && window.VoiceGuide) {
            VoiceGuide.speak(text);
        }
    });

    // 图表按钮统一绑定（根据 data-chart 分发）
    document.querySelectorAll('[data-chart]').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.chart;
            showChartModal(type);
        });
    });

    const modal = document.getElementById('chartModal');
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    modal.addEventListener('click', e => {
        if (e.target === modal) closeModal();
    });

    const refreshBtn = document.getElementById('refreshRecommendBtn');
    refreshBtn.addEventListener('click', async () => {
        refreshBtn.disabled = true;
        refreshBtn.style.opacity = '0.5';
        await loadRecommendations(true);
        refreshBtn.disabled = false;
        refreshBtn.style.opacity = '1';
    });

    await loadRecommendations();
    window.showChartModal = showChartModal;
});

async function loadDashboardData() {
    const res = await fetch('/api/teach/dashboard');
    dashboardData = await res.json();

    document.getElementById('total-duration').textContent = dashboardData.overview.total_duration || '0';
    document.getElementById('total-sessions').textContent = dashboardData.overview.total_sessions || '0';
    document.getElementById('avg-accuracy').textContent = dashboardData.overview.avg_accuracy || '0';
    const weak = dashboardData.overview.weak_chords || [];
    document.getElementById('weak-chords').textContent = weak.length ? weak.join('、') : '—';

    const tbody = document.querySelector('#records-table tbody');
    const records = dashboardData.recent_records || [];
    tbody.innerHTML = records.map(r => `
        <tr><td>${r.time||'—'}</td><td>${r.chord||'—'}</td><td>${r.accuracy||0}%</td><td>${r.duration||0}</td></tr>
    `).join('');

    // 渲染新增卡片
    renderExtraStats(dashboardData);
}

// ========== 推荐列表 ==========
function loadAddedChords() {
    const stored = localStorage.getItem('pendingSoloChords');
    addedChords = stored ? new Set(JSON.parse(stored)) : new Set();
}
function saveAddedChords() {
    localStorage.setItem('pendingSoloChords', JSON.stringify([...addedChords]));
}
async function fetchRecommendations() {
    const res = await fetch('/api/teach/recommend_chords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });
    const data = await res.json();
    return data.chords || [];
}
async function loadRecommendations() {
    loadAddedChords();
    try {
        currentRecommendations = await fetchRecommendations();
    } catch (e) {
        console.error('获取推荐失败', e);
        currentRecommendations = [
            { name: 'C', reason: '基础开放和弦' },
            { name: 'G', reason: '常用和弦' },
            { name: 'Am', reason: '简单小调和弦' }
        ];
    }
    renderRecommendations();
}
function renderRecommendations() {
    const container = document.getElementById('recommendList');
    if (!currentRecommendations.length) {
        container.innerHTML = '<div class="recommend-item" style="justify-content:center;">暂无推荐</div>';
        return;
    }
    container.innerHTML = currentRecommendations.map((item, idx) => {
        const isAdded = addedChords.has(item.name);
        return `
            <div class="recommend-item" style="animation-delay: ${idx * 0.03}s">
                <div class="chord-info">
                    <span class="chord-name">${item.name}</span>
                    <span class="chord-reason">${item.reason || '智能推荐'}</span>
                </div>
                <button class="add-btn ${isAdded ? 'added' : ''}" data-chord="${item.name}" ${isAdded ? 'disabled' : ''}>
                    ${isAdded ? '已加入' : '加入'}
                </button>
            </div>
        `;
    }).join('');
    container.querySelectorAll('.add-btn:not([disabled])').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const chord = btn.dataset.chord;
            addedChords.add(chord);
            saveAddedChords();
            btn.classList.add('added');
            btn.textContent = '已加入';
            btn.disabled = true;
        });
    });
}

// ========== 图表模态框（分发） ==========
function showChartModal(type) {
    if (!dashboardData) return;
    const title = document.getElementById('modalTitle');
    const box = document.getElementById('modalChartBox');
    if (modalChartInstance) modalChartInstance.dispose();

    if (type === 'radar' && dashboardData.mastery?.chords?.length) {
        title.textContent = '和弦掌握度';
        modalChartInstance = Charts.renderMasteryInElement(box, dashboardData.mastery);
    } else if (type === 'progress' && dashboardData.progress?.dates?.length) {
        title.textContent = '进步趋势';
        modalChartInstance = Charts.renderProgressInElement(box, dashboardData.progress);
    } else if (type === 'similarity' && dashboardData.similarity_trend?.length) {
        title.textContent = '相似度趋势';
        modalChartInstance = renderSimilarityChart(box, dashboardData.similarity_trend);
    } else if (type === 'stability') {
        title.textContent = '正确/不稳统计';
        modalChartInstance = renderStabilityChart(box);
    } else {
        box.innerHTML = '<p style="text-align:center;color:#ecd9b4;">暂无数据</p>';
        modalChartInstance = null;
        document.getElementById('chartModal').classList.add('active');
        return;
    }

    document.getElementById('chartModal').classList.add('active');
    const resizeHandler = () => { if (modalChartInstance?.resize) modalChartInstance.resize(); };
    window.addEventListener('resize', resizeHandler);
    document.getElementById('chartModal')._resizeHandler = resizeHandler;
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

// 相似度趋势图（折线图，复用 dashboardData.similarity_trend）
function renderSimilarityChart(container, dataArray) {
    if (container._chart) container._chart.dispose();
    const chart = echarts.init(container);
    chart.setOption({
        tooltip: {
            trigger: 'axis',
            formatter: params => `第${params[0].name}次: ${(params[0].value * 100).toFixed(1)}%`
        },
        xAxis: {
            type: 'category',
            data: dataArray.map((_, i) => i + 1),
            axisLabel: { color: '#c0a88b' }
        },
        yAxis: {
            type: 'value',
            name: '相似度',
            min: 0, max: 1,
            axisLabel: { color: '#c0a88b', formatter: val => (val * 100).toFixed(0) + '%' },
            splitLine: { lineStyle: { color: 'rgba(255,215,140,0.1)' } }
        },
        series: [{
            type: 'line',
            data: dataArray,
            smooth: true,
            lineStyle: { color: '#ffd966', width: 2 },
            itemStyle: { color: '#ffd966' },
            areaStyle: { color: 'rgba(255,215,140,0.1)' }
        }],
        grid: { containLabel: true, left: '8%', top: 40, bottom: 20 }
    });
    container._chart = chart;
    return chart;
}

// 正确/不稳统计（分组柱状图，从 overview 推算）
function renderStabilityChart(container) {
    if (container._chart) container._chart.dispose();
    const chart = echarts.init(container);

    const total = dashboardData.overview.total_sessions || 0;
    const accuracy = parseFloat(dashboardData.overview.avg_accuracy) || 0;
    const unstableCount = dashboardData.unstable_count || 0;
    const correctCount = Math.round(total * accuracy / 100);
    const errorCount = total - correctCount;

    chart.setOption({
        tooltip: { trigger: 'axis' },
        legend: {
            data: ['正确次数', '错误次数', '不稳次数'],
            textStyle: { color: '#ecd9b4' },
            top: 10
        },
        xAxis: {
            type: 'category',
            data: ['统计'],
            axisLabel: { color: '#ecd9b4' },
            axisLine: { lineStyle: { color: '#b98c5f' } }
        },
        yAxis: {
            type: 'value',
            name: '次数',
            nameTextStyle: { color: '#ecd9b4' },
            axisLabel: { color: '#ecd9b4' },
            splitLine: { lineStyle: { color: 'rgba(255,215,140,0.1)' } }
        },
        series: [
            {
                name: '正确次数',
                type: 'bar',
                data: [correctCount],
                itemStyle: { color: '#2ecc71' },
                barGap: '10%'
            },
            {
                name: '错误次数',
                type: 'bar',
                data: [errorCount],
                itemStyle: { color: '#e74c3c' }
            },
            {
                name: '不稳次数',
                type: 'bar',
                data: [unstableCount],
                itemStyle: { color: '#e6a817' }
            }
        ],
        grid: { containLabel: true, left: '10%', right: '10%', top: 60, bottom: 30 }
    });
    container._chart = chart;
    return chart;
}

// 兼容隐藏样式
const style = document.createElement('style');
style.textContent = `.hidden { display: none !important; }`;
document.head.appendChild(style);