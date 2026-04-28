var dashboardData = null;
var currentRecommendations = [];
var addedChords = new Set();

var WAITING_MESSAGES = [
    '正在分析练习数据...',
    '请教 AI 教练中...',
    '诊断薄弱环节...',
    '生成个性化建议...',
    '马上就好，请稍候~',
    '正在整理思路...',
    '为您量身定制指导...'
];

var generateBtn = document.getElementById('generate-advice-btn');
var adviceTextEl = document.getElementById('adviceTextDisplay');
var loadingContainer = document.getElementById('adviceLoadingContainer');
var bubbleMsgEl = document.getElementById('bubbleMessage');
var loadingInterval = null;
var isLoading = false;

function showLoading() {
    if (isLoading) return;
    isLoading = true;
    adviceTextEl.classList.add('hidden');
    loadingContainer.classList.remove('hidden');
    generateBtn.disabled = true;
    generateBtn.textContent = '生成中...';
    var msgIndex = 0;
    var updateBubble = function () {
        bubbleMsgEl.style.opacity = '0';
        setTimeout(function () {
            bubbleMsgEl.textContent = WAITING_MESSAGES[msgIndex % WAITING_MESSAGES.length];
            bubbleMsgEl.style.opacity = '1';
            msgIndex++;
        }, 150);
    };
    updateBubble();
    loadingInterval = setInterval(updateBubble, 2000);
}

function hideLoading() {
    if (loadingInterval) {
        clearInterval(loadingInterval);
        loadingInterval = null;
    }
    loadingContainer.classList.add('hidden');
    adviceTextEl.classList.remove('hidden');
    generateBtn.disabled = false;
    generateBtn.textContent = '生成指导';
    isLoading = false;
}

// ========== 加载仪表盘数据 ==========
function loadDashboardData() {
    return fetch('/api/teach/dashboard')
        .then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        })
        .then(function (data) {
            dashboardData = data;
            renderStats(data);
            renderCharts(data);
            renderRecords(data);
            renderMiniStats(data);
        })
        .catch(function (err) {
            console.error('加载仪表盘数据失败:', err);
            var cards = ['total-duration', 'total-sessions', 'avg-accuracy', 'weak-chords'];
            cards.forEach(function (id) {
                var el = document.getElementById(id);
                if (el) el.textContent = '加载失败';
            });
        });
}

// ========== 渲染统计卡片 ==========
function renderStats(data) {
    var overview = data.overview || {};
    document.getElementById('total-duration').textContent = overview.total_duration || '0';
    document.getElementById('total-sessions').textContent = overview.total_sessions || '0';
    document.getElementById('avg-accuracy').textContent = overview.avg_accuracy || '0';
    var weak = overview.weak_chords || [];
    document.getElementById('weak-chords').textContent = weak.length && weak[0] !== '无数据' ? weak.join('、') : '—';
}

// ========== 渲染图表（直接嵌入页面） ==========
function renderCharts(data) {
    // 雷达图
    if (data.mastery && data.mastery.chords && data.mastery.chords.length) {
        Charts.renderMastery('radarChart', data.mastery);
    }

    // 进步趋势 + 相似度（合并为双折线）
    if (data.progress && data.progress.dates && data.progress.dates.length) {
        Charts.renderProgress('progressChart', data.progress, data.similarity_trend || null);
    }

    // 稳定度环形图
    var total = (data.overview && data.overview.total_sessions) || 0;
    var accuracy = parseFloat((data.overview && data.overview.avg_accuracy) || 0);
    var unstableCount = data.unstable_count || 0;
    var correctCount = Math.round(total * accuracy / 100);
    var errorCount = total - correctCount;
    Charts.renderStabilityDonut('stabilityDonut', correctCount, errorCount, unstableCount);
}

// ========== 渲染迷你统计行 ==========
function renderMiniStats(data) {
    var unstableCountEl = document.getElementById('unstable-count');
    var unstableRatioEl = document.getElementById('unstable-ratio');
    var practiceModeEl = document.getElementById('practice-mode');

    if (unstableCountEl) {
        unstableCountEl.textContent = data.unstable_count || 0;
    }
    if (unstableRatioEl) {
        unstableRatioEl.textContent = (data.unstable_ratio || 0).toFixed(1) + '%';
    }
    if (practiceModeEl) {
        var mode = data.recent_mode;
        practiceModeEl.textContent = mode === 'quick' ? '快速模式' : (mode === 'normal' ? '普通模式' : '无记录');
    }
}

// ========== 渲染最近记录 ==========
function renderRecords(data) {
    var tbody = document.querySelector('#records-table tbody');
    if (!tbody) return;
    var records = data.recent_records || [];
    tbody.innerHTML = records.map(function (r) {
        return '<tr>' +
            '<td>' + (r.time || '—') + '</td>' +
            '<td>' + (r.chord || '—') + '</td>' +
            '<td>' + (r.accuracy || 0) + '%</td>' +
            '<td>' + (r.duration || 0) + '</td>' +
            '</tr>';
    }).join('');
    if (!records.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#c0a88b;">暂无练习记录</td></tr>';
    }
}

// ========== 推荐列表 ==========
function loadAddedChords() {
    var stored = localStorage.getItem('pendingSoloChords');
    addedChords = stored ? new Set(JSON.parse(stored)) : new Set();
}

function saveAddedChords() {
    localStorage.setItem('pendingSoloChords', JSON.stringify(Array.from(addedChords)));
}

function fetchRecommendations() {
    return fetch('/api/teach/recommend_chords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    }).then(function (res) { return res.json(); })
      .then(function (data) { return data.chords || []; });
}

function loadRecommendations() {
    loadAddedChords();
    return fetchRecommendations()
        .then(function (chords) {
            currentRecommendations = chords;
            renderRecommendations();
        })
        .catch(function (e) {
            console.error('获取推荐失败', e);
            currentRecommendations = [
                { name: 'C', reason: '基础开放和弦' },
                { name: 'G', reason: '常用和弦' },
                { name: 'Am', reason: '简单小调和弦' }
            ];
            renderRecommendations();
        });
}

function renderRecommendations() {
    var container = document.getElementById('recommendList');
    if (!container) return;
    if (!currentRecommendations.length) {
        container.innerHTML = '<div class="recommend-item" style="justify-content:center;grid-column:1/-1;">暂无推荐</div>';
        return;
    }
    container.innerHTML = currentRecommendations.map(function (item) {
        var isAdded = addedChords.has(item.name);
        return '<div class="recommend-item">' +
            '<div class="chord-info">' +
                '<span class="chord-name">' + item.name + '</span>' +
                '<span class="chord-reason">' + (item.reason || '智能推荐') + '</span>' +
            '</div>' +
            '<button class="add-btn' + (isAdded ? ' added' : '') + '" data-chord="' + item.name + '"' + (isAdded ? ' disabled' : '') + '>' +
                (isAdded ? '已加入' : '加入') +
            '</button>' +
            '</div>';
    }).join('');

    container.querySelectorAll('.add-btn:not([disabled])').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var chord = btn.dataset.chord;
            addedChords.add(chord);
            saveAddedChords();
            btn.classList.add('added');
            btn.textContent = '已加入';
            btn.disabled = true;
        });
    });
}

// ========== 窗口大小调整 ==========
var resizeTimer = null;
window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
        Charts.resizeAll();
    }, 200);
});

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', function () {
    showLoading();
    loadDashboardData().then(function () {
        hideLoading();
    });

    generateBtn.addEventListener('click', function () {
        showLoading();
        fetch('/api/teach/generate_advice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        }).then(function (res) { return res.json(); })
          .then(function (data) {
              adviceTextEl.innerText = data.advice || '暂时无法生成建议，请稍后再试。';
          })
          .catch(function () {
              adviceTextEl.innerText = '生成失败，请稍后重试';
          })
          .finally(function () {
              hideLoading();
          });
    });

    document.getElementById('speak-advice-btn').addEventListener('click', function () {
        var text = adviceTextEl.innerText;
        if (text && text.indexOf('点击') !== 0 && window.VoiceGuide) {
            VoiceGuide.speak(text);
        }
    });

    var refreshBtn = document.getElementById('refreshRecommendBtn');
    refreshBtn.addEventListener('click', function () {
        refreshBtn.disabled = true;
        refreshBtn.style.opacity = '0.5';
        loadRecommendations().then(function () {
            refreshBtn.disabled = false;
            refreshBtn.style.opacity = '1';
        });
    });

    loadRecommendations();
});
