(function () {
    'use strict';

    const utils = (window.SilverCompanionApp || {}).utils;

    function renderConversation(messages) {
        return (messages || []).slice(-12).map((message) => `
            <div class="message-card ${utils.escapeHtml(message.role)}">
                <div class="message-meta">${message.role === 'assistant' ? '陪伴助手' : '老人端'} · ${utils.escapeHtml(message.channel)} · ${utils.formatTime(message.createdAt)}</div>
                <div class="message-text">${utils.escapeHtml(message.text)}</div>
            </div>
        `).join('');
    }

    function renderDashboard(bootstrap, dashboard) {
        if (!dashboard || !utils) return;

        utils.$('conversationList').innerHTML = renderConversation(dashboard.conversation.messages);

        const snapshot = dashboard.analysisSnapshot || {};
        const events = []
            .concat(dashboard.familySummary.keyEvents || [])
            .concat(snapshot.lastDirective && snapshot.lastDirective.reply_goal ? [`当前回复目标：${snapshot.lastDirective.reply_goal}`] : [])
            .concat(snapshot.lastDirective && snapshot.lastDirective.tone_rule ? [`当前语气规则：${snapshot.lastDirective.tone_rule}`] : [])
            .concat(snapshot.lastHandoffState && snapshot.lastHandoffState.required ? [`当前转介状态：${snapshot.lastHandoffState.reason || '需要线下关注'}`] : []);
        utils.$('dashboardEvents').innerHTML = utils.listHtml(events, '当前没有新的关键事件。');

        const presets = (bootstrap && bootstrap.simulationPresets) || [];
        utils.$('simulationButtons').innerHTML = presets
            .filter((item) => item.type !== 'baseline')
            .map((item) => `
                <div class="sim-card">
                    <div class="minor-title">${utils.escapeHtml(item.label)}</div>
                    <div class="sim-desc">${utils.escapeHtml(item.description)}</div>
                    <button type="button" data-sim-type="${utils.escapeHtml(item.type)}">立即注入</button>
                </div>
            `).join('');
    }

    window.SilverCompanionApp = window.SilverCompanionApp || {};
    window.SilverCompanionApp.dashboardSection = {
        renderDashboard,
    };
})();
