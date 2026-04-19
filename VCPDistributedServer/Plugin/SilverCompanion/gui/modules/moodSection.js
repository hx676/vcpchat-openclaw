(function () {
    'use strict';

    const utils = (window.SilverCompanionApp || {}).utils;

    function renderMood(dashboard) {
        if (!dashboard || !utils) return;

        const emotion = dashboard.emotion;
        const snapshot = dashboard.analysisSnapshot || {};
        utils.$('emotionTrendLabel').textContent = emotion.overallTrend === 'down' ? '趋势下行' : '趋势平稳';
        utils.$('emotionSignals').innerHTML = emotion.signals.map((signal) => `
            <div class="signal-card">
                <div class="signal-label">${utils.escapeHtml(signal.label)}</div>
                <div class="signal-score status-${utils.escapeHtml(signal.status)}">${utils.escapeHtml(signal.score)}</div>
                <div class="signal-meta">变化 ${signal.delta > 0 ? '+' : ''}${utils.escapeHtml(signal.delta)}</div>
            </div>
        `).join('');
        utils.$('emotionNarrative').innerHTML = utils.listHtml(emotion.narrative, '暂无情绪叙述。');
        utils.$('moodInsight').textContent = [
            dashboard.familySummary.headline,
            snapshot.lastDirective && snapshot.lastDirective.companion_mode ? `当前陪伴模式：${snapshot.lastDirective.companion_mode}` : '',
            snapshot.lastHandoffState && snapshot.lastHandoffState.required ? `建议转介：${snapshot.lastHandoffState.reason || '需要线下关注'}` : '',
            snapshot.lastScheduledAnalysisAt ? `最近定时分析：${utils.formatTime(snapshot.lastScheduledAnalysisAt)}` : '',
        ].filter(Boolean).join(' · ');
    }

    window.SilverCompanionApp = window.SilverCompanionApp || {};
    window.SilverCompanionApp.moodSection = {
        renderMood,
    };
})();
