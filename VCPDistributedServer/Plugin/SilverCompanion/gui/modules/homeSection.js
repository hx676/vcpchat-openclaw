(function () {
    'use strict';

    const utils = (window.SilverCompanionApp || {}).utils;

    function renderHome(dashboard) {
        if (!dashboard || !utils) return;

        utils.$('overviewCards').innerHTML = dashboard.overview.cards.map((card) => `
            <div class="card">
                <div class="card-label">${utils.escapeHtml(card.label)}</div>
                <div class="card-value status-${utils.escapeHtml(card.status)}">${utils.escapeHtml(card.displayValue)}</div>
                <div class="card-meta">${utils.escapeHtml(card.deltaLabel)}</div>
            </div>
        `).join('');

        utils.$('familyHeadline').textContent = dashboard.familySummary.headline;
        utils.$('familyActions').innerHTML = utils.listHtml(dashboard.familySummary.recommendedActions, '当前没有额外建议动作。');

        const homeAlerts = dashboard.health.alerts
            .map((item) => `${item.title}：${item.message}`)
            .concat(dashboard.safeCircle.warnings.map((item) => item.message))
            .slice(0, 5);

        utils.$('homeAlerts').innerHTML = utils.listHtml(homeAlerts, '当前没有需要特别提醒的风险波动。');

        const expressionSignal = dashboard.emotion.signals.find((item) => item.key === 'expressionDesire');
        const familiarSignal = dashboard.emotion.signals.find((item) => item.key === 'familiarInteraction');

        utils.$('homeMoodSummary').textContent = [
            `表达欲 ${expressionSignal ? expressionSignal.score : '--'}，`,
            `熟人互动 ${familiarSignal ? familiarSignal.score : '--'}。`,
            dashboard.emotion.narrative[0] || '当前情绪趋势整体平稳。',
        ].join('');

        utils.$('homeCircleSummary').textContent = dashboard.safeCircle.warningCount > 0
            ? `当前平安圈有 ${dashboard.safeCircle.warningCount} 条弱异常提醒，最近一次报平安为 ${utils.formatRelative(dashboard.safeCircle.lastCheckInAt)}。`
            : `当前平安圈保持平稳，${dashboard.safeCircle.checkInLabel}。`;
    }

    window.SilverCompanionApp = window.SilverCompanionApp || {};
    window.SilverCompanionApp.homeSection = {
        renderHome,
    };
})();
