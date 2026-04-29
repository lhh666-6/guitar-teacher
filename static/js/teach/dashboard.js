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

// 轮播状态
var carouselState = {
    radar: 0,     // 0=雷达图, 1=难度分布, 2=日历热力图
    progress: 0   // 0=正确率+相似度, 1=仅正确率, 2=仅相似度
};
var carouselTitles = {
    radar: ['和弦掌握度', '难度分布', '练习频次'],
    progress: ['进步趋势', '正确率趋势', '相似度趋势']
};
var autoRotateTimers = {};
var AUTO_ROTATE_MS = 3500;

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

// ========== 轮播逻辑 ==========
function updateCarouselUI(panel) {
    var state = carouselState[panel];
    var dotsContainer = document.getElementById(panel + 'Dots');
    if (dotsContainer) {
        var total = 3;
        var html = '';
        for (var i = 0; i < total; i++) {
            html += '<span class="carousel-dot' + (i === state ? ' active' : '') + '"><i></i></span>';
        }
        dotsContainer.innerHTML = html;
    }
    var titleEl = document.getElementById(panel + 'PanelTitle');
    if (titleEl) {
        titleEl.style.opacity = '0';
        titleEl.style.transform = 'translateY(-6px)';
        setTimeout(function () {
            titleEl.textContent = carouselTitles[panel][state];
            titleEl.style.opacity = '1';
            titleEl.style.transform = 'translateY(0)';
        }, 120);
    }
}

function _triggerPanelGlow(panel) {
    var el = document.getElementById(panel + 'Panel');
    if (!el) return;
    el.classList.add('glow-pulse');
    setTimeout(function () { el.classList.remove('glow-pulse'); }, 700);
}

function switchCarouselView(panel, data, direction) {
    direction = direction || 0; // 1=next, -1=prev, 0=initial
    var state = carouselState[panel];

    if (direction !== 0) {
        _triggerPanelGlow(panel);
    }

    if (panel === 'radar') {
        var ids = ['radarChart', 'difficultyChart', 'calendarChart'];
        var allEls = ids.map(function(id) { return document.getElementById(id); });
        var emptyEl = document.getElementById('radarEmpty');

        allEls.forEach(function(el) { if (el) { el.classList.remove('active'); el.style.display = 'none'; } });
        if (emptyEl) emptyEl.style.display = 'none';

        var activeId = ids[state];
        var activeEl = document.getElementById(activeId);
        var rendered = null;

        if (state === 0 && data.mastery && data.mastery.chords && data.mastery.chords.length) {
            rendered = Charts.renderMastery('radarChart', data.mastery);
        } else if (state === 1 && data.chord_difficulty) {
            rendered = Charts.renderDifficulty('difficultyChart', data.chord_difficulty);
        } else if (state === 2 && data.daily_practice) {
            rendered = Charts.renderCalendar('calendarChart', data.daily_practice);
        }

        if (rendered) {
            if (activeEl) {
                activeEl.style.display = 'block';
                activeEl.offsetHeight;
                activeEl.classList.add('active');
            }
            setTimeout(function() { rendered.resize(); }, 80);
        } else if (emptyEl) {
            emptyEl.style.display = 'block';
        }
    } else if (panel === 'progress') {
        var ids = ['progressChart', 'accuracyOnlyChart', 'similarityOnlyChart'];
        var allEls = ids.map(function(id) { return document.getElementById(id); });
        var emptyEl = document.getElementById('progressEmpty');

        allEls.forEach(function(el) { if (el) { el.classList.remove('active'); el.style.display = 'none'; } });
        if (emptyEl) emptyEl.style.display = 'none';

        var activeId = ids[state];
        var activeEl = document.getElementById(activeId);
        var rendered = null;

        var avgAcc = (data.overview && data.overview.avg_accuracy) || null;
        if (state === 0 && data.progress && data.progress.dates && data.progress.dates.length) {
            rendered = Charts.renderProgress('progressChart', data.progress, data.similarity_trend || null, avgAcc);
        } else if (state === 1 && data.progress && data.progress.dates && data.progress.dates.length) {
            rendered = Charts.renderAccuracyOnly('accuracyOnlyChart', data.progress, avgAcc);
        } else if (state === 2 && data.progress && data.progress.dates && data.progress.dates.length) {
            rendered = Charts.renderSimilarityOnly('similarityOnlyChart', data.progress, data.similarity_trend || null);
        }

        if (rendered) {
            if (activeEl) {
                activeEl.style.display = 'block';
                activeEl.offsetHeight;
                activeEl.classList.add('active');
            }
            setTimeout(function() { rendered.resize(); }, 80);
        } else if (emptyEl) {
            emptyEl.style.display = 'block';
        }
    }
    updateCarouselUI(panel);
}

function initCarousel() {
    document.querySelectorAll('.carousel-arrow').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var panel = btn.dataset.panel;
            var dir = btn.dataset.dir === 'next' ? 1 : -1;
            carouselState[panel] = (carouselState[panel] + dir + 3) % 3;
            switchCarouselView(panel, dashboardData, dir);
            // 用户手动切换后重置自动轮播计时器
            stopAutoRotate(panel);
            startAutoRotate(panel);
        });
    });

    // 鼠标悬停暂停当前面板轮播，离开恢复
    ['radar', 'progress'].forEach(function (panel) {
        var el = document.getElementById(panel + 'Panel');
        if (!el) return;
        el.addEventListener('mouseenter', function () { stopAutoRotate(panel); });
        el.addEventListener('mouseleave', function () { startAutoRotate(panel); });
    });
}

function startAutoRotate(panel) {
    if (!panel) {
        // 启动所有面板的轮播
        startAutoRotate('radar');
        startAutoRotate('progress');
        return;
    }
    stopAutoRotate(panel);
    autoRotateTimers[panel] = setInterval(function () {
        carouselState[panel] = (carouselState[panel] + 1) % 3;
        switchCarouselView(panel, dashboardData, 1);
    }, AUTO_ROTATE_MS);
}

function stopAutoRotate(panel) {
    if (!panel) {
        stopAutoRotate('radar');
        stopAutoRotate('progress');
        return;
    }
    if (autoRotateTimers[panel]) {
        clearInterval(autoRotateTimers[panel]);
        autoRotateTimers[panel] = null;
    }
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
            initCarousel();
            switchCarouselView('radar', data);
            switchCarouselView('progress', data);
            startAutoRotate();
        })
        .catch(function (err) {
            console.error('加载仪表盘数据失败:', err);
            var cards = ['total-duration', 'total-sessions', 'avg-accuracy', 'weak-chords'];
            cards.forEach(function (id) {
                var el = document.getElementById(id);
                if (el) el.textContent = '加载失败';
            });
            hideLoading();
        });
}

// ========== 渲染统计卡片 ==========
function renderStats(data) {
    var overview = data.overview || {};
    var cards = [
        { id: 'total-duration', value: overview.total_duration || '0' },
        { id: 'total-sessions', value: overview.total_sessions || '0' },
        { id: 'avg-accuracy', value: overview.avg_accuracy || '0' },
        { id: 'weak-chords', value: (overview.weak_chords && overview.weak_chords.length && overview.weak_chords[0] !== '无数据') ? overview.weak_chords.join('、') : '—' }
    ];
    cards.forEach(function (card, index) {
        var el = document.getElementById(card.id);
        if (!el) return;
        // 数字卡片使用计数动画
        if (card.id !== 'weak-chords' && !isNaN(parseFloat(card.value))) {
            animateNumber(el, parseFloat(card.value) || 0, 600, index * 80);
        } else {
            el.textContent = card.value;
        }
    });
}

function animateNumber(el, targetValue, duration, delay) {
    var startTime = null;
    var startValue = 0;
    var isFloat = targetValue % 1 !== 0;
    setTimeout(function () {
        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            var progress = Math.min((timestamp - startTime) / duration, 1);
            var eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
            var current = isFloat ? (startValue + (targetValue - startValue) * eased).toFixed(1) : Math.round(startValue + (targetValue - startValue) * eased);
            el.textContent = current;
            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                el.textContent = targetValue;
            }
        }
        requestAnimationFrame(step);
    }, delay);
}

// ========== 渲染图表（初始视图） ==========
function renderCharts(data) {
    // 稳定度环形图（不在轮播中）
    var total = (data.overview && data.overview.total_sessions) || 0;
    var accuracy = parseFloat((data.overview && data.overview.avg_accuracy) || 0);
    var unstableCount = data.unstable_count || 0;
    var correctCount = Math.round(total * accuracy / 100);
    var errorCount = total - correctCount;
    Charts.renderStabilityDonut('stabilityDonut', correctCount, errorCount, unstableCount);
}

// ========== 渲染迷你统计行（含模式比例） ==========
function renderMiniStats(data) {
    var unstableCountEl = document.getElementById('unstable-count');
    var unstableRatioEl = document.getElementById('unstable-ratio');

    if (unstableCountEl) {
        unstableCountEl.textContent = data.unstable_count || 0;
    }
    if (unstableRatioEl) {
        unstableRatioEl.textContent = (data.unstable_ratio || 0).toFixed(1) + '%';
    }

    // 模式使用比例
    var modeRatio = data.mode_ratio || {};
    var quickCount = modeRatio.quick || 0;
    var normalCount = modeRatio.normal || 0;
    var modeTotal = modeRatio.total || (quickCount + normalCount);

    var quickEl = document.getElementById('quick-mode-count');
    var quickPctEl = document.getElementById('quick-mode-pct');
    var normalEl = document.getElementById('normal-mode-count');
    var normalPctEl = document.getElementById('normal-mode-pct');

    if (quickEl) quickEl.textContent = quickCount + '次';
    if (normalEl) normalEl.textContent = normalCount + '次';

    if (modeTotal > 0) {
        if (quickPctEl) quickPctEl.textContent = Math.round(quickCount / modeTotal * 100) + '%';
        if (normalPctEl) normalPctEl.textContent = Math.round(normalCount / modeTotal * 100) + '%';
    } else {
        if (quickPctEl) quickPctEl.textContent = '—';
        if (normalPctEl) normalPctEl.textContent = '—';
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
              var text = data.advice || '暂时无法生成建议，请稍后再试。';
              text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
              text = text.replace(/\n/g, '<br>');
              text = text.replace(/## (.*?)(<br>|$)/g, '<strong style="color:#ffd966;font-size:1.05em;">$1</strong><br>');
              adviceTextEl.innerHTML = text;
          })
          .catch(function () {
              adviceTextEl.innerHTML = '生成失败，请稍后重试';
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

window.addEventListener('beforeunload', function () {
    stopAutoRotate();
});
