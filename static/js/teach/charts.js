var Charts = {
    _instances: {},

    _initChart: function (containerId) {
        var el = document.getElementById(containerId);
        if (!el) return null;
        if (this._instances[containerId]) {
            this._instances[containerId].dispose();
        }
        var chart = echarts.init(el);
        this._instances[containerId] = chart;
        return chart;
    },

    // ========== 和弦掌握度 — 雷达图 ==========
    renderMastery: function (containerId, data) {
        var chart = this._initChart(containerId);
        if (!chart || !data || !data.chords || !data.chords.length) {
            document.getElementById('radarEmpty').style.display = 'block';
            document.getElementById('radarChart').style.display = 'none';
            return null;
        }
        document.getElementById('radarEmpty').style.display = 'none';
        document.getElementById('radarChart').style.display = 'block';

        var indicator = data.chords.map(function (c) {
            return { name: c.name, max: 100 };
        });

        chart.setOption({
            radar: {
                indicator: indicator,
                shape: 'circle',
                center: ['50%', '52%'],
                radius: '62%',
                name: { textStyle: { color: '#ecd9b4', fontSize: 12 } },
                splitArea: {
                    areaStyle: { color: ['rgba(255,215,140,0.06)', 'rgba(255,215,140,0.02)'] }
                },
                axisLine: { lineStyle: { color: 'rgba(255,215,140,0.25)' } },
                splitLine: { lineStyle: { color: 'rgba(255,215,140,0.12)' } }
            },
            series: [{
                type: 'radar',
                data: [{
                    value: data.values,
                    name: '掌握度',
                    areaStyle: { color: 'rgba(255, 217, 102, 0.2)' },
                    lineStyle: { color: '#ffd966', width: 2 },
                    itemStyle: { color: '#ffd966' },
                    symbol: 'circle',
                    symbolSize: 4
                }]
            }],
            tooltip: {
                trigger: 'item',
                formatter: function (p) {
                    return p.name + '<br/>掌握度: ' + p.value + '%';
                }
            }
        });
        return chart;
    },

    // ========== 进步趋势 — 双折线图（正确率 + 相似度） ==========
    renderProgress: function (containerId, progressData, similarityData) {
        var chart = this._initChart(containerId);
        if (!chart || !progressData || !progressData.dates || !progressData.dates.length) {
            document.getElementById('progressEmpty').style.display = 'block';
            document.getElementById('progressChart').style.display = 'none';
            return null;
        }
        document.getElementById('progressEmpty').style.display = 'none';
        document.getElementById('progressChart').style.display = 'block';

        var formatDate = this._formatDate;
        var series = [{
            name: '正确率',
            type: 'line',
            data: progressData.rates,
            smooth: true,
            lineStyle: { color: '#2ecc71', width: 2.5 },
            itemStyle: { color: '#2ecc71' },
            symbol: 'circle',
            symbolSize: 6,
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(46,204,113,0.15)' },
                    { offset: 1, color: 'rgba(46,204,113,0.01)' }
                ])
            }
        }];

        // 如果有相似度数据，叠加第二条线
        if (similarityData && similarityData.length === progressData.dates.length) {
            series.push({
                name: '相似度',
                type: 'line',
                data: similarityData.map(function (v) { return +(v * 100).toFixed(1); }),
                smooth: true,
                lineStyle: { color: '#4a90e2', width: 2, type: 'dashed' },
                itemStyle: { color: '#4a90e2' },
                symbol: 'diamond',
                symbolSize: 5
            });
        }

        chart.setOption({
            tooltip: {
                trigger: 'axis',
                formatter: function (params) {
                    var date = formatDate(params[0].axisValue);
                    var html = date + '<br/>';
                    params.forEach(function (p) {
                        html += p.marker + ' ' + p.seriesName + ': ' + p.value + (p.seriesName === '相似度' ? '%' : '%') + '<br/>';
                    });
                    return html;
                }
            },
            legend: {
                data: series.map(function (s) { return s.name; }),
                textStyle: { color: '#ecd9b4', fontSize: 11 },
                top: 0
            },
            xAxis: {
                type: 'category',
                data: progressData.dates,
                axisLabel: {
                    color: '#c0a88b',
                    fontSize: 10,
                    formatter: formatDate
                },
                axisLine: { lineStyle: { color: 'rgba(255,215,140,0.2)' } }
            },
            yAxis: {
                type: 'value',
                min: 0,
                max: 100,
                name: '%',
                nameTextStyle: { color: '#c0a88b', fontSize: 11 },
                axisLabel: { color: '#c0a88b', fontSize: 10 },
                splitLine: { lineStyle: { color: 'rgba(255,215,140,0.08)' } }
            },
            series: series,
            grid: { containLabel: true, left: '6%', right: '6%', top: 40, bottom: 10 }
        });
        return chart;
    },

    // ========== 稳定度 — 小型环形图 ==========
    renderStabilityDonut: function (containerId, correct, error, unstable) {
        var chart = this._initChart(containerId);
        if (!chart) return null;

        var total = correct + error + unstable;
        if (total === 0) {
            chart.setOption({
                title: { text: '无数据', left: 'center', top: 'center', textStyle: { color: '#c0a88b', fontSize: 11 } },
                series: []
            });
            return chart;
        }

        chart.setOption({
            tooltip: {
                trigger: 'item',
                formatter: function (p) { return p.name + ': ' + p.value + '次 (' + p.percent + '%)'; }
            },
            legend: { show: false },
            series: [{
                type: 'pie',
                radius: ['55%', '80%'],
                center: ['50%', '50%'],
                avoidLabelOverlap: false,
                label: { show: false },
                emphasis: { scale: false },
                data: [
                    { value: correct, name: '正确', itemStyle: { color: '#2ecc71' } },
                    { value: error, name: '错误', itemStyle: { color: '#e74c3c' } },
                    { value: unstable, name: '不稳', itemStyle: { color: '#e6a817' } }
                ]
            }]
        });
        return chart;
    },

    // ========== 日期格式化工具 ==========
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
