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
        const option = {
            title: { text: '最近练习正确率趋势', left: 'center', textStyle: { color: '#ffd966' } },
            xAxis: {
                type: 'category',
                data: data.dates,
                axisLabel: { color: '#ecd9b4' },
                axisLine: { lineStyle: { color: 'rgba(255,215,140,0.3)' } }
            },
            yAxis: {
                type: 'value',
                max: 100,
                name: '正确率%',
                nameTextStyle: { color: '#ecd9b4' },
                axisLabel: { color: '#ecd9b4' },
                splitLine: { lineStyle: { color: 'rgba(255,215,140,0.1)' } }
            },
            series: [{
                type: 'line',
                data: data.rates,
                smooth: true,
                lineStyle: { color: '#2ecc71', width: 3 },
                areaStyle: { color: 'rgba(46, 204, 113, 0.1)' },
                symbol: 'circle',
                symbolSize: 8,
                itemStyle: { color: '#2ecc71' }
            }],
            tooltip: { trigger: 'axis' },
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