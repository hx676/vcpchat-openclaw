(function () {
    'use strict';

    const utils = (window.SilverCompanionApp || {}).utils;

    function getWearStatusLabel(device) {
        if (!device) return '--';
        if (device.wearStatus === 'worn' || device.isWorn === true) return '已佩戴';
        if (device.wearStatus === 'removed' || device.isWorn === false) return '未佩戴';
        return '未知';
    }

    async function renderHealth(api, dashboard, activeRange) {
        if (!dashboard || !utils) return;

        utils.$('healthCharts').innerHTML = '<div class="chart-card">正在加载趋势图...</div>';
        const seriesResults = await Promise.all(
            utils.metricOrder.map((metric) => api.getHealthTimeline(metric, activeRange))
        );

        const seriesMap = Object.fromEntries(
            utils.metricOrder.map((metric, index) => [metric, utils.unwrap(seriesResults[index], `读取 ${metric} 趋势失败`)])
        );

        utils.$('healthCharts').innerHTML = utils.metricOrder.map((metric) => {
            const card = dashboard.health.cards.find((item) => item.key === metric);
            if (!card) {
                return '';
            }
            return `
                <div class="chart-card">
                    <div class="chart-label">${utils.escapeHtml(card.label)}</div>
                    <div class="chart-meta">${utils.escapeHtml(card.displayValue)} · ${utils.escapeHtml(card.deltaLabel)}</div>
                    ${utils.buildSparkline(metric, seriesMap[metric])}
                </div>
            `;
        }).join('');

        utils.$('healthAlerts').innerHTML = utils.listHtml(
            dashboard.health.alerts.map((item) => `${item.title}：${item.message}`),
            '当前没有健康强提醒，适合保持自然陪伴。'
        );

        const device = dashboard.health.device || {};
        utils.$('deviceStatusList').innerHTML = utils.listHtml([
            `设备电量：${device.battery != null ? device.battery : '--'}%`,
            `连接状态：${device.connected ? '在线' : '离线'}`,
            `佩戴状态：${getWearStatusLabel(device)}`,
            `佩戴更新时间：${utils.formatRelative(device.wearStatusUpdatedAt)}`,
            `最近同步：${utils.formatRelative(device.lastSyncAt)}`,
            `位置：${device.locationName || '--'}`,
        ], '暂无设备状态');
    }

    window.SilverCompanionApp = window.SilverCompanionApp || {};
    window.SilverCompanionApp.healthSection = {
        renderHealth,
    };
})();
