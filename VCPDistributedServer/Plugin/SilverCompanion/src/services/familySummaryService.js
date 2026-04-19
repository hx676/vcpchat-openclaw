class FamilySummaryService {
    constructor({ store }) {
        this.store = store;
    }

    buildLocalSummary(normalizedRange, stored, dependencies) {
        const keyEvents = [
            ...dependencies.healthOverview.alerts.map((item) => item.message),
            ...dependencies.emotionOverview.narrative.slice(0, 2),
            ...dependencies.safeCircleOverview.warnings.map((item) => item.message),
        ].slice(0, 4);

        const recommendedActions = [];
        if (dependencies.healthOverview.riskLevel === 'high') {
            recommendedActions.push('建议尽快由家属进行一次语音确认，必要时安排线下关注。');
        } else if (dependencies.emotionOverview.riskLevel !== 'low') {
            recommendedActions.push('建议家属今晚主动发起一次轻量问候，避免连续追问。');
        } else {
            recommendedActions.push('暂时维持温和陪伴和日报关注即可。');
        }

        if (dependencies.safeCircleOverview.warningCount > 0) {
            recommendedActions.push('熟人圈互动出现回落，建议从“报平安”而不是“查问”切入。');
        }

        let headline = (stored && stored.headline) || '当前总体状态平稳，可继续保持轻陪伴。';
        if (dependencies.healthOverview.riskLevel === 'high') {
            headline = '当前出现较高优先级健康波动，建议家属尽快进行一次语音确认。';
        } else if (dependencies.emotionOverview.riskLevel === 'high') {
            headline = '当前情绪波动明显，适合用温和陪伴而非直接追问的方式介入。';
        } else if (dependencies.healthOverview.riskLevel === 'medium' || dependencies.safeCircleOverview.warningCount > 0) {
            headline = '当前存在轻中度变化，建议保持更高质量的在场感和轻量问候。';
        }

        return {
            range: normalizedRange,
            updatedAt: new Date().toISOString(),
            headline,
            keyEvents: keyEvents.length ? keyEvents : (stored && stored.keyEvents) || [],
            recommendedActions: recommendedActions.length ? recommendedActions : (stored && stored.recommendedActions) || [],
            source: 'local',
        };
    }

    async getSummary(range, dependencies, options = {}) {
        const normalizedRange = range === 'weekly' || range === '7d' ? 'weekly' : 'daily';
        const preferAgent = options.preferAgent !== false;
        const summaryStore = await this.store.readFile('summary');
        const stored = summaryStore[normalizedRange];
        const agentOutput = summaryStore.agentOutputs && summaryStore.agentOutputs[normalizedRange]
            ? summaryStore.agentOutputs[normalizedRange]
            : null;

        if (preferAgent && agentOutput && agentOutput.headline) {
            return {
                range: normalizedRange,
                updatedAt: agentOutput.updatedAt || summaryStore.updatedAt,
                headline: agentOutput.headline,
                keyEvents: Array.isArray(agentOutput.keyEvents) ? agentOutput.keyEvents : [],
                recommendedActions: Array.isArray(agentOutput.recommendedActions) ? agentOutput.recommendedActions : [],
                source: agentOutput.source || 'agent',
                emotionSummary: agentOutput.emotion_summary || '',
                emotionRiskLevel: agentOutput.emotion_risk_level || 'low',
                companionGuidance: agentOutput.companion_guidance || '',
                confidenceNote: agentOutput.confidence_note || '',
            };
        }

        const summary = this.buildLocalSummary(normalizedRange, stored, dependencies);

        await this.store.updateFile('summary', (value) => ({
            ...value,
            updatedAt: summary.updatedAt,
            [normalizedRange]: {
                headline: summary.headline,
                keyEvents: summary.keyEvents,
                recommendedActions: summary.recommendedActions,
            },
        }));

        return summary;
    }
}

module.exports = FamilySummaryService;
