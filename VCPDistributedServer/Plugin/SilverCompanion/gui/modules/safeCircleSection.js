(function () {
    'use strict';

    const utils = (window.SilverCompanionApp || {}).utils;

    function renderSafeCircle(dashboard) {
        if (!dashboard || !utils) return;

        const safeCircle = dashboard.safeCircle;
        utils.$('checkInLabel').textContent = safeCircle.checkInLabel || `最近报平安 ${utils.formatRelative(safeCircle.lastCheckInAt)}`;
        utils.$('safeCircleSummary').textContent = safeCircle.warningCount > 0
            ? `当前平安圈存在 ${safeCircle.warningCount} 条弱异常提醒，建议从“报平安”而不是“查问”切入。`
            : '当前平安圈整体平稳，熟人联系频率处于较健康状态。';

        utils.$('contactList').innerHTML = safeCircle.contacts.map((contact) => `
            <div class="contact-card">
                <div class="contact-name">${utils.escapeHtml(contact.name)}</div>
                <div class="contact-meta">${utils.escapeHtml(contact.relation)} · 最近互动 ${utils.formatRelative(contact.lastInteractionAt)}</div>
                <div class="contact-meta status-${contact.status === 'quiet' ? 'watch' : 'ok'}">${contact.status === 'quiet' ? '互动略少' : '状态平稳'}</div>
            </div>
        `).join('');

        utils.$('safeWarnings').innerHTML = utils.listHtml(
            safeCircle.warnings.map((item) => item.message),
            '当前平安圈没有弱异常。'
        );
    }

    window.SilverCompanionApp = window.SilverCompanionApp || {};
    window.SilverCompanionApp.safeCircleSection = {
        renderSafeCircle,
    };
})();
