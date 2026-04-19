const Charts = {
    // 通用渲染到元素
    renderMasteryInElement: (element, data) => {
        if (element._chart) element._chart.dispose();
        const chart = echarts.init(element);
        const option = {
            title: { text: '和弦掌握度', left: 'center', textStyle: { color: '#ffd966' } },
            radar: {
                indicator: data.chords.map(chord => ({ name: chord.name, max: 100 })),
                shape: 'circle',
                center: ['50%', '50%'],
                radius: '65%',
                name: { textStyle: { color: '#ecd9b4' } },
                splitArea: { areaStyle: { color: ['rgba(255,215,140,0.1)', 'rgba(255,215,140,0.05)'] } },
                axisLine: { lineStyle: { color: 'rgba(255,215,140,0.3)' } }
            },
            series: [{
                type: 'radar',
                data: [{
                    value: data.values,
                    name: '掌握度',
                    areaStyle: { color: 'rgba(52, 152, 219, 0.3)' },
                    lineStyle: { color: '#3498db', width: 2 }
                }]
            }]
        };
        chart.setOption(option);
        element._chart = chart;
        return chart;
    },

    renderProgressInElement: (element, data) => {
        if (element._chart) element._chart.dispose();
        const chart = echarts.init(element);

        // 终极中文日期格式化（针对 "Fri, 10 Apr 2026 00:00:00 GMT"）
        const formatToChineseDate = (input) => {
            const str = String(input);
            const monthMap = {
                Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
                Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12
            };
            // 匹配 "10 Apr" 或 "Apr 10"
            let match = str.match(/(\d{1,2})\s+([A-Za-z]{3})/);
            if (match) {
                const day = parseInt(match[1], 10);
                const month = monthMap[match[2]];
                if (month) return `${month}月${day}日`;
            }
            match = str.match(/([A-Za-z]{3})\s+(\d{1,2})/);
            if (match) {
                const month = monthMap[match[1]];
                const day = parseInt(match[2], 10);
                if (month) return `${month}月${day}日`;
            }
            // 回退：标准 Date 解析
            const d = new Date(str);
            if (!isNaN(d.getTime())) {
                return `${d.getMonth() + 1}月${d.getDate()}日`;
            }
            return str;
        };

        const option = {
            title: { text: '最近练习正确率趋势', left: 'center', textStyle: { color: '#ffd966' } },
            xAxis: {
                type: 'category',
                data: data.dates,
                axisLabel: {
                    color: '#ecd9b4',
                    formatter: (value) => formatToChineseDate(value)
                },
                axisLine: { lineStyle: { color: 'rgba(255,215,140,0.3)' } }
            },
            yAxis: {
                type: 'value',
                max: 100,
                name: '正确率 (%)',
                nameTextStyle: { color: '#ecd9b4' },
                axisLabel: { color: '#ecd9b4' },
                splitLine: { lineStyle: { color: 'rgba(255,215,140,0.1)' } }
            },
            series: [{
                type: 'line',
                data: data.rates,
                smooth: true,
                name: '正确率',
                lineStyle: { color: '#2ecc71', width: 3 },
                areaStyle: { color: 'rgba(46, 204, 113, 0.1)' },
                symbol: 'circle',
                symbolSize: 8,
                itemStyle: { color: '#2ecc71' }
            }],
            tooltip: {
                trigger: 'axis',
                formatter: (params) => {
                    if (!params || params.length === 0) return '';
                    const date = formatToChineseDate(params[0].axisValue);
                    let res = `${date}<br/>`;
                    params.forEach(p => {
                        res += `${p.marker} ${p.seriesName}: ${p.value}%<br/>`;
                    });
                    return res;
                }
            },
            grid: { containLabel: true, left: '10%', right: '8%', bottom: '8%' }
        };
        chart.setOption(option);
        element._chart = chart;
        return chart;
    },

    // 保留原有方法（兼容旧调用）
    renderMastery: (containerId, data) => {
        const element = document.getElementById(containerId);
        return Charts.renderMasteryInElement(element, data);
    },
    renderProgress: (containerId, data) => {
        const element = document.getElementById(containerId);
        return Charts.renderProgressInElement(element, data);
    }
};

window.Charts = Charts;