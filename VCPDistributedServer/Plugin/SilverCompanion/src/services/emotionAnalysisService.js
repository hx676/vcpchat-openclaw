class EmotionAnalysisService {
    constructor({ store }) {
        this.store = store;
    }

    async getEmotionData() {
        return this.store.readFile('emotion');
    }

    deriveSignalStatus(key, signal) {
        if (key === 'avoidanceTendency') {
            if (signal.score >= 60) return 'danger';
            if (signal.score >= 45) return 'watch';
            return 'ok';
        }

        if (signal.score <= 45) return 'danger';
        if (signal.score <= 60) return 'watch';
        return 'ok';
    }

    async getEmotionOverview(healthOverview, safeCircleOverview) {
        const emotion = await this.getEmotionData();
        const agentAnalysis = emotion.agentAnalysis || null;

        const signals = Object.entries(emotion.signals).map(([key, signal]) => ({
            key,
            label: signal.label,
            score: signal.score,
            delta: signal.delta,
            status: this.deriveSignalStatus(key, signal),
        }));

        const mediumRiskSignals = signals.filter((item) => item.status === 'watch').length;
        const highRiskSignals = signals.filter((item) => item.status === 'danger').length;
        const sleepCard = healthOverview.cards.find((item) => item.key === 'sleep');

        const narrative = [];
        if (agentAnalysis && agentAnalysis.emotion_summary) {
            narrative.push(agentAnalysis.emotion_summary);
        }
        narrative.push(...(emotion.narrative || []));
        if (sleepCard && sleepCard.status === 'watch') {
            narrative.push('睡眠回落与语言能量下降同时出现，建议陪伴时多使用轻问候而非连续追问。');
        }
        if (safeCircleOverview.warningCount > 0) {
            narrative.push('平安圈互动轻微下降，可能意味着“我还好”之外还有没说出口的疲惫。');
        }

        let riskLevel = 'low';
        if (highRiskSignals > 0) {
            riskLevel = 'high';
        } else if (mediumRiskSignals > 0 || safeCircleOverview.warningCount > 0) {
            riskLevel = 'medium';
        }

        if (agentAnalysis && ['low', 'medium', 'high'].includes(agentAnalysis.emotion_risk_level)) {
            riskLevel = agentAnalysis.emotion_risk_level;
        }

        return {
            updatedAt: emotion.updatedAt,
            overallTrend: emotion.overallTrend,
            signals,
            narrative,
            riskLevel,
            agentAnalysis,
        };
    }
}

module.exports = EmotionAnalysisService;
