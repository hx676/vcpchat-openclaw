(function () {
    'use strict';

    const utils = (window.SilverCompanionApp || {}).utils;

    function joinKnown(values, fallback) {
        const filtered = (values || []).map((item) => String(item || '').trim()).filter((item) => item && item !== '0');
        return filtered.length ? filtered.join(' · ') : (fallback || '待了解');
    }

    function renderProfile(dashboard) {
        if (!dashboard || !utils) return;

        const profile = dashboard.profile;
        const memory = dashboard.memory;

        utils.$('basicInfoCard').innerHTML = `
            <div class="identity-main">
                <div class="identity-avatar">${utils.escapeHtml(profile.avatarLabel || 'SC')}</div>
                <div class="identity-body">
                    <strong>${utils.escapeHtml(profile.name)}</strong>
                    <span>${utils.escapeHtml(joinKnown([
                        Number(profile.age) > 0 ? `${profile.age} 岁` : '',
                        profile.gender,
                        profile.city,
                    ], '基础资料待了解'))}</span>
                    <span>${utils.escapeHtml(profile.relationshipRole || '角色待补充')}</span>
                </div>
            </div>
            <div class="summary-copy">${utils.escapeHtml(profile.motto || '先聊天，画像会慢慢补全。')}</div>
            <div class="summary-copy">设备入口：${utils.escapeHtml(profile.watchName || '银发陪伴腕带')}</div>
        `;

        utils.$('profileTags').innerHTML = (profile.tags || []).map((tag) => `<span class="tag-pill">${utils.escapeHtml(tag)}</span>`).join('') || '<span class="tag-pill">暂无标签</span>';
        utils.$('profilePreferences').innerHTML = utils.listHtml(profile.preferences, '暂无偏好记录');
        utils.$('profileFamily').innerHTML = utils.listHtml(profile.family, '暂无家庭关系信息');

        utils.$('profileMemory').innerHTML = `
            <div class="memory-card">
                <strong>短期记忆</strong>
                <div class="memory-copy">最近话题：${utils.escapeHtml(memory.shortTerm.lastTopic || '--')}</div>
                <div class="memory-copy">最近情绪标签：${utils.escapeHtml(memory.shortTerm.lastMoodTag || '--')}</div>
            </div>
            <div class="memory-card">
                <strong>中期模式</strong>
                <div class="memory-copy">${(memory.midTerm.recentPatterns || []).map((item) => `• ${utils.escapeHtml(item)}`).join('<br>') || '暂无模式总结'}</div>
            </div>
            <div class="memory-card">
                <strong>长期偏好</strong>
                <div class="memory-copy">${(memory.longTerm.preferences || []).map((item) => `• ${utils.escapeHtml(item)}`).join('<br>') || '暂无长期偏好'}</div>
            </div>
            <div class="memory-card">
                <strong>关系语境</strong>
                <div class="memory-copy">${(memory.longTerm.familyContext || []).map((item) => `• ${utils.escapeHtml(item)}`).join('<br>') || '暂无关系语境'}</div>
            </div>
            <div class="memory-card">
                <strong>分析事件记忆</strong>
                <div class="memory-copy">记忆本：${utils.escapeHtml(memory.analysisNotebook || '银发分析助手')}</div>
                <div class="memory-copy">最近写入：${utils.escapeHtml(memory.analysisLastWriteSummary || '--')}</div>
                <div class="memory-copy">最近时间：${utils.escapeHtml(utils.formatTime(memory.analysisLastWriteAt))}</div>
            </div>
        `;
    }

    window.SilverCompanionApp = window.SilverCompanionApp || {};
    window.SilverCompanionApp.profileSection = {
        renderProfile,
    };
})();
