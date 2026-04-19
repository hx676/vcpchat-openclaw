const { SIMULATION_PRESETS } = require('../types/constants');

class DashboardAssembler {
    constructor({ store, healthService, emotionService, safeCircleService, memoryService, familySummaryService, settingsManager }) {
        this.store = store;
        this.healthService = healthService;
        this.emotionService = emotionService;
        this.safeCircleService = safeCircleService;
        this.memoryService = memoryService;
        this.familySummaryService = familySummaryService;
        this.settingsManager = settingsManager;
    }

    async getDashboard(range = 'daily') {
        const [profile, simulation, healthOverview, safeCircleOverview, conversation, memory, analysisSnapshot] = await Promise.all([
            this.store.readFile('profile'),
            this.store.readFile('simulation'),
            this.healthService.getHealthOverview(),
            this.safeCircleService.getSafeCircleOverview(),
            this.memoryService.getConversation(),
            this.memoryService.getMemoryProfile(),
            this.store.readFile('analysisSnapshot'),
        ]);

        const emotionOverview = await this.emotionService.getEmotionOverview(healthOverview, safeCircleOverview);
        const familySummary = await this.familySummaryService.getSummary(range, {
            healthOverview,
            emotionOverview,
            safeCircleOverview,
        });

        const riskLevels = [healthOverview.riskLevel, emotionOverview.riskLevel, safeCircleOverview.warningCount > 0 ? 'medium' : 'low'];
        const overallRiskLevel = riskLevels.includes('high')
            ? 'high'
            : riskLevels.includes('medium')
                ? 'medium'
                : 'low';

        return {
            updatedAt: new Date().toISOString(),
            overallRiskLevel,
            profile,
            overview: {
                title: `${profile.name} 今日状态`,
                subtitle: overallRiskLevel === 'low' ? '整体平稳，可保持自然陪伴。' : '出现需要留心的波动，建议采用更温和的关注方式。',
                cards: healthOverview.cards,
                alerts: healthOverview.alerts,
            },
            health: healthOverview,
            emotion: emotionOverview,
            safeCircle: safeCircleOverview,
            memory,
            analysisSnapshot,
            conversation,
            familySummary,
            simulation,
        };
    }

    async getBootstrap() {
        const settings = await this.settingsManager.readSettings().catch(() => ({}));
        const dashboard = await this.getDashboard('daily');

        return {
            elderId: dashboard.profile.id,
            themeMode: settings.currentThemeMode || 'dark',
            simulationPresets: SIMULATION_PRESETS,
            voice: {
                supportsSpeechRecognition: true,
                supportsTts: true,
            },
            dashboard,
        };
    }
}

module.exports = DashboardAssembler;
