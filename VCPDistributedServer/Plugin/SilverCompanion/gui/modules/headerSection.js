(function () {
    'use strict';

    const utils = (window.SilverCompanionApp || {}).utils;

    function joinKnown(values, fallback) {
        const filtered = (values || []).map((item) => String(item || '').trim()).filter((item) => item && item !== '0');
        return filtered.length ? filtered.join(' · ') : (fallback || '待了解');
    }

    function renderHeader(dashboard, activeSection) {
        if (!dashboard || !utils) return;

        const currentLabel = utils.sectionLabels[activeSection] || '首页';
        utils.$('heroRisk').textContent = `总体风险 ${utils.riskText(dashboard.overallRiskLevel)}`;
        utils.$('heroTitle').textContent = `银发 AI 生活伴侣 · ${currentLabel}`;
        utils.$('heroSubtitle').textContent = dashboard.overview.subtitle;
        utils.$('heroMotto').textContent = dashboard.profile.motto || '保持温和陪伴，把变化翻译成看得懂的信息。';
        utils.$('avatarDisc').textContent = dashboard.profile.avatarLabel || 'SC';
        utils.$('profileName').textContent = dashboard.profile.name;
        utils.$('profileMeta').textContent = joinKnown([
            Number(dashboard.profile.age) > 0 ? `${dashboard.profile.age} 岁` : '',
            dashboard.profile.gender,
            dashboard.profile.city,
            dashboard.profile.relationshipRole,
        ], '画像待补充');
        utils.$('updatedAtLabel').textContent = `更新于 ${utils.formatTime(dashboard.updatedAt)}`;
    }

    window.SilverCompanionApp = window.SilverCompanionApp || {};
    window.SilverCompanionApp.headerSection = {
        renderHeader,
    };
})();
