var Charts = {
    _instances: {},
    _theme: {
        gold: '#ffd966',
        goldDim: '#c0a88b',
        green: '#2ecc71',
        blue: '#4a90e2',
        red: '#e74c3c',
        orange: '#e6a817',
        text: '#ecd9b4',
        bgGlow: 'rgba(255,215,140,0.06)',
        gridLine: 'rgba(255,215,140,0.06)',
        axisLine: 'rgba(255,215,140,0.15)'
    },

    _initChart: function (containerId) {
        if (typeof echarts === 'undefined') {
            console.error('ECharts 库未加载，无法初始化图表:', containerId);
            return null;
        }
        var el = document.getElementById(containerId);
        if (!el) {
            console.warn('图表容器元素未找到:', containerId);
            return null;
        }
        if (this._instances[containerId]) {
            this._instances[containerId].dispose();
        }
        var chart = echarts.init(el, null, { devicePixelRatio: 2 });
        this._instances[containerId] = chart;
        return chart;
    },

    _animationOpts: function () {
        return {
            animation: true,
            animationDuration: 1000,
            animationEasing: 'cubicOut',
            animationDurationUpdate: 500,
            animationEasingUpdate: 'cubicInOut',
            animationDelay: function (idx) { return idx * 40; }
        };
    },

    // ========== 和弦掌握度 — 雷达图 ==========
    renderMastery: function (containerId, data) {
        var chart = this._initChart(containerId);
        var t = this._theme;
        if (!chart || !data || !data.chords || !data.chords.length) {
            return null;
        }

        var indicator = data.chords.map(function (c) {
            return { name: c.name, max: 100 };
        });

        var opt = this._animationOpts();
        opt.radar = {
            indicator: indicator,
            shape: 'circle',
            center: ['50%', '52%'],
            radius: '62%',
            name: {
                textStyle: { color: t.text, fontSize: 12, fontWeight: 500 }
            },
            splitArea: {
                areaStyle: { color: [t.bgGlow, 'rgba(255,215,140,0.01)'] }
            },
            axisLine: { lineStyle: { color: t.axisLine } },
            splitLine: { lineStyle: { color: t.gridLine } }
        };
        opt.tooltip = {
            trigger: 'item',
            backgroundColor: 'rgba(30,20,15,0.95)',
            borderColor: 'rgba(255,215,140,0.4)',
            textStyle: { color: t.text, fontSize: 13 },
            formatter: function (p) {
                return '<b>' + p.name + '</b><br/>掌握度: <b style="color:' + t.gold + '">' + p.value + '%</b>';
            }
        };
        opt.series = [{
            type: 'radar',
            symbol: 'circle',
            symbolSize: 5,
            lineStyle: { color: t.gold, width: 2, shadowBlur: 8, shadowColor: 'rgba(255,217,102,0.3)' },
            itemStyle: { color: t.gold, borderColor: '#fff', borderWidth: 1 },
            areaStyle: { color: 'rgba(255,217,102,0.12)' },
            data: [{ value: data.values, name: '掌握度' }]
        }];
        chart.setOption(opt);
        return chart;
    },

    // ========== 难度分布 — 玫瑰图 ==========
    renderDifficulty: function (containerId, data) {
        var chart = this._initChart(containerId);
        var t = this._theme;
        if (!chart || !data || !data.length) return null;

        var opt = this._animationOpts();
        opt.tooltip = {
            trigger: 'item',
            backgroundColor: 'rgba(30,20,15,0.95)',
            borderColor: 'rgba(255,215,140,0.4)',
            textStyle: { color: t.text, fontSize: 13 },
            formatter: function (p) { return '<b>' + p.name + '</b><br/>练习: <b>' + p.value + '次</b> (' + p.percent + '%)'; }
        };
        opt.series = [{
            type: 'pie',
            radius: ['30%', '70%'],
            center: ['50%', '50%'],
            roseType: 'radius',
            label: {
                color: t.text,
                fontSize: 12,
                formatter: '{b}\n{d}%',
                distanceToLabelLine: 8
            },
            labelLine: { lineStyle: { color: 'rgba(255,215,140,0.3)' }, smooth: 0.1 },
            emphasis: {
                scaleSize: 12,
                itemStyle: { shadowBlur: 20, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.6)' }
            },
            itemStyle: {
                borderColor: 'rgba(30,20,15,0.8)',
                borderWidth: 2,
                borderRadius: 4
            },
            data: [
                { value: data[0] ? data[0].value : 0, name: '基础', itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{offset:0,color:'#6fbf4c'},{offset:1,color:'#3d8b2e'}]) } },
                { value: data[1] ? data[1].value : 0, name: '进阶', itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{offset:0,color:'#4a90e2'},{offset:1,color:'#2563a8'}]) } },
                { value: data[2] ? data[2].value : 0, name: '高级', itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{offset:0,color:'#e6a817'},{offset:1,color:'#b8860b'}]) } }
            ]
        }];
        chart.setOption(opt);
        return chart;
    },

    // ========== 练习频次 — 日历热力图 ==========
    renderCalendar: function (containerId, data) {
        var chart = this._initChart(containerId);
        var t = this._theme;
        if (!chart || !data || !data.length) return null;

        var maxVal = Math.max.apply(null, data.map(function (d) { return d[1]; })) || 1;

        chart.setOption({
            backgroundColor: 'transparent',
            tooltip: {
                backgroundColor: 'rgba(30,20,15,0.95)',
                borderColor: 'rgba(255,215,140,0.4)',
                textStyle: { color: t.text, fontSize: 13 },
                formatter: function (p) { return '<b>' + p.data[0] + '</b><br/>练习 <b>' + p.data[1] + '</b> 次'; }
            },
            visualMap: {
                min: 0,
                max: maxVal,
                type: 'piecewise',
                orient: 'horizontal',
                left: 'center',
                bottom: 0,
                backgroundColor: 'transparent',
                textStyle: { color: t.goldDim, fontSize: 10 },
                itemWidth: 14,
                itemHeight: 14,
                pieces: [
                    { min: 1, label: '1+', color: '#4a3518' },
                    { min: 3, label: '3+', color: '#6b4c1e' },
                    { min: 5, label: '5+', color: '#9b7028' },
                    { min: 8, label: '8+', color: '#c9a02b' },
                    { min: 12, label: '12+', color: '#ffd966' }
                ]
            },
            calendar: {
                top: 20,
                left: 20,
                right: 20,
                bottom: 50,
                cellSize: [28, 28],
                range: String(new Date().getFullYear()),
                splitLine: { lineStyle: { color: 'rgba(255,215,140,0.08)', width: 1 } },
                dayLabel: { color: t.goldDim, fontSize: 9, margin: 4 },
                monthLabel: { color: t.text, fontSize: 10, margin: 8 },
                yearLabel: { show: false },
                itemStyle: {
                    color: 'rgba(255,215,140,0.03)',
                    borderColor: 'rgba(255,215,140,0.06)',
                    borderWidth: 1,
                    borderRadius: 3
                }
            },
            series: [{
                type: 'heatmap',
                coordinateSystem: 'calendar',
                data: data,
                emphasis: {
                    itemStyle: { shadowBlur: 10, shadowColor: 'rgba(255,217,102,0.4)' }
                }
            }]
        });
        return chart;
    },

    // ========== 进步趋势 — 双折线图 + 平均线 ==========
    renderProgress: function (containerId, progressData, similarityData, avgAccuracy) {
        var chart = this._initChart(containerId);
        var t = this._theme;
        if (!chart || !progressData || !progressData.dates || !progressData.dates.length) {
            return null;
        }

        var formatDate = this._formatDate;
        var series = [{
            name: '正确率',
            type: 'line',
            data: progressData.rates,
            smooth: 0.4,
            symbol: 'circle',
            symbolSize: 5,
            lineStyle: { color: t.green, width: 3, shadowBlur: 6, shadowColor: 'rgba(46,204,113,0.3)' },
            itemStyle: { color: t.green, borderColor: '#fff', borderWidth: 1 },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(46,204,113,0.18)' },
                    { offset: 1, color: 'rgba(46,204,113,0.0)' }
                ])
            },
            markLine: avgAccuracy != null ? {
                silent: true,
                symbol: 'none',
                lineStyle: { color: t.orange, type: 'dashed', width: 2 },
                label: {
                    formatter: '均值 {c}%',
                    position: 'insideEndTop',
                    color: t.orange,
                    fontSize: 11,
                    fontWeight: 600,
                    backgroundColor: 'rgba(30,20,15,0.8)',
                    padding: [2, 8],
                    borderRadius: 8
                },
                data: [{ yAxis: avgAccuracy, name: '平均正确率' }]
            } : undefined
        }];

        if (similarityData && similarityData.length === progressData.dates.length) {
            series.push({
                name: '相似度',
                type: 'line',
                data: similarityData.map(function (v) { return +(v * 100).toFixed(1); }),
                smooth: 0.4,
                symbol: 'diamond',
                symbolSize: 5,
                lineStyle: { color: t.blue, width: 2.5, type: 'solid', shadowBlur: 4, shadowColor: 'rgba(74,144,226,0.2)' },
                itemStyle: { color: t.blue, borderColor: '#fff', borderWidth: 1 }
            });
        }

        var opt = this._animationOpts();
        opt.tooltip = {
            trigger: 'axis',
            backgroundColor: 'rgba(30,20,15,0.95)',
            borderColor: 'rgba(255,215,140,0.4)',
            textStyle: { color: t.text, fontSize: 13 },
            formatter: function (params) {
                var html = '<b>' + formatDate(params[0].axisValue) + '</b><br/>';
                params.forEach(function (p) {
                    html += p.marker + ' ' + p.seriesName + ': <b>' + p.value + '%</b><br/>';
                });
                return html;
            }
        };
        opt.legend = {
            data: series.map(function (s) { return s.name; }),
            textStyle: { color: t.goldDim, fontSize: 11 },
            top: 0,
            icon: 'roundRect'
        };
        opt.xAxis = {
            type: 'category',
            data: progressData.dates,
            boundaryGap: false,
            axisLabel: { color: t.goldDim, fontSize: 10, formatter: formatDate },
            axisLine: { lineStyle: { color: t.axisLine } },
            axisTick: { show: false }
        };
        opt.yAxis = {
            type: 'value',
            min: 0,
            max: 100,
            name: '%',
            nameTextStyle: { color: t.goldDim, fontSize: 11 },
            axisLabel: { color: t.goldDim, fontSize: 10 },
            splitLine: { lineStyle: { color: t.gridLine } },
            axisLine: { show: false },
            axisTick: { show: false }
        };
        opt.grid = { containLabel: true, left: '4%', right: '6%', top: 40, bottom: 8 };
        opt.series = series;
        chart.setOption(opt);
        return chart;
    },

    renderAccuracyOnly: function (containerId, progressData, avgAccuracy) {
        var chart = this._initChart(containerId);
        var t = this._theme;
        if (!chart || !progressData || !progressData.dates || !progressData.dates.length) return null;

        var opt = this._animationOpts();
        opt.tooltip = {
            trigger: 'axis',
            backgroundColor: 'rgba(30,20,15,0.95)',
            borderColor: 'rgba(255,215,140,0.4)',
            textStyle: { color: t.text, fontSize: 13 },
            formatter: function (params) {
                return '<b>' + Charts._formatDate(params[0].axisValue) + '</b><br/>正确率: <b style="color:' + t.green + '">' + params[0].value + '%</b>';
            }
        };
        opt.xAxis = {
            type: 'category',
            data: progressData.dates,
            boundaryGap: false,
            axisLabel: { color: t.goldDim, fontSize: 10, formatter: Charts._formatDate },
            axisLine: { lineStyle: { color: t.axisLine } },
            axisTick: { show: false }
        };
        opt.yAxis = {
            type: 'value', min: 0, max: 100,
            axisLabel: { color: t.goldDim, fontSize: 10 },
            splitLine: { lineStyle: { color: t.gridLine } },
            axisLine: { show: false },
            axisTick: { show: false }
        };
        opt.series = [{
            name: '正确率',
            type: 'line',
            data: progressData.rates,
            smooth: 0.4,
            symbol: 'circle',
            symbolSize: 5,
            lineStyle: { color: t.green, width: 3, shadowBlur: 6, shadowColor: 'rgba(46,204,113,0.3)' },
            itemStyle: { color: t.green, borderColor: '#fff', borderWidth: 1 },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(46,204,113,0.2)' },
                    { offset: 1, color: 'rgba(46,204,113,0.0)' }
                ])
            },
            markLine: avgAccuracy != null ? {
                silent: true, symbol: 'none',
                lineStyle: { color: t.orange, type: 'dashed', width: 2 },
                label: { formatter: '均值 {c}%', color: t.orange, fontSize: 11, fontWeight: 600 },
                data: [{ yAxis: avgAccuracy }]
            } : undefined
        }];
        opt.grid = { containLabel: true, left: '4%', right: '6%', top: 20, bottom: 8 };
        chart.setOption(opt);
        return chart;
    },

    renderSimilarityOnly: function (containerId, progressData, similarityData) {
        var chart = this._initChart(containerId);
        var t = this._theme;
        if (!chart || !progressData || !progressData.dates || !progressData.dates.length) return null;

        var simValues = similarityData ? similarityData.map(function (v) { return +(v * 100).toFixed(1); }) : [];
        var opt = this._animationOpts();
        opt.tooltip = {
            trigger: 'axis',
            backgroundColor: 'rgba(30,20,15,0.95)',
            borderColor: 'rgba(255,215,140,0.4)',
            textStyle: { color: t.text, fontSize: 13 },
            formatter: function (params) {
                return '<b>' + Charts._formatDate(params[0].axisValue) + '</b><br/>相似度: <b style="color:' + t.blue + '">' + params[0].value + '%</b>';
            }
        };
        opt.xAxis = {
            type: 'category',
            data: progressData.dates,
            boundaryGap: false,
            axisLabel: { color: t.goldDim, fontSize: 10, formatter: Charts._formatDate },
            axisLine: { lineStyle: { color: t.axisLine } },
            axisTick: { show: false }
        };
        opt.yAxis = {
            type: 'value', min: 0, max: 100,
            axisLabel: { color: t.goldDim, fontSize: 10 },
            splitLine: { lineStyle: { color: t.gridLine } },
            axisLine: { show: false },
            axisTick: { show: false }
        };
        opt.series = [{
            name: '相似度',
            type: 'line',
            data: simValues,
            smooth: 0.4,
            symbol: 'diamond',
            symbolSize: 5,
            lineStyle: { color: t.blue, width: 3, shadowBlur: 6, shadowColor: 'rgba(74,144,226,0.3)' },
            itemStyle: { color: t.blue, borderColor: '#fff', borderWidth: 1 },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(74,144,226,0.18)' },
                    { offset: 1, color: 'rgba(74,144,226,0.0)' }
                ])
            }
        }];
        opt.grid = { containLabel: true, left: '4%', right: '6%', top: 20, bottom: 8 };
        chart.setOption(opt);
        return chart;
    },

    // ========== 稳定度 — 环形图 ==========
    renderStabilityDonut: function (containerId, correct, error, unstable) {
        var chart = this._initChart(containerId);
        var t = this._theme;
        if (!chart) return null;

        var total = correct + error + unstable;
        if (total === 0) {
            chart.setOption({
                title: { text: '无数据', left: 'center', top: 'center', textStyle: { color: t.goldDim, fontSize: 11 } },
                series: []
            });
            return chart;
        }

        chart.setOption({
            tooltip: {
                trigger: 'item',
                backgroundColor: 'rgba(30,20,15,0.95)',
                borderColor: 'rgba(255,215,140,0.4)',
                textStyle: { color: t.text, fontSize: 13 },
                formatter: function (p) { return '<b>' + p.name + '</b>: ' + p.value + '次 (' + p.percent + '%)'; }
            },
            legend: { show: false },
            series: [{
                type: 'pie',
                radius: ['55%', '82%'],
                center: ['50%', '50%'],
                avoidLabelOverlap: false,
                label: { show: false },
                emphasis: { scale: false },
                itemStyle: { borderColor: 'rgba(30,20,15,0.8)', borderWidth: 2 },
                data: [
                    { value: correct, name: '正确', itemStyle: { color: t.green } },
                    { value: error, name: '错误', itemStyle: { color: t.red } },
                    { value: unstable, name: '不稳', itemStyle: { color: t.orange } }
                ]
            }]
        });
        return chart;
    },

    _formatDate: function (input) {
        var str = String(input);
        var monthMap = {
            Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
            Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12
        };
        var match = str.match(/(\d{1,2})\s+([A-Za-z]{3})/);
        if (match) {
            var day = parseInt(match[1], 10);
            var month = monthMap[match[2]];
            if (month) return month + '月' + day + '日';
        }
        match = str.match(/([A-Za-z]{3})\s+(\d{1,2})/);
        if (match) {
            var month = monthMap[match[1]];
            var day = parseInt(match[2], 10);
            if (month) return month + '月' + day + '日';
        }
        var d = new Date(str);
        if (!isNaN(d.getTime())) return (d.getMonth()+1) + '月' + d.getDate() + '日';
        return str;
    },

    resizeAll: function () {
        for (var key in this._instances) {
            if (this._instances.hasOwnProperty(key)) {
                this._instances[key].resize();
            }
        }
    }
};

window.Charts = Charts;
