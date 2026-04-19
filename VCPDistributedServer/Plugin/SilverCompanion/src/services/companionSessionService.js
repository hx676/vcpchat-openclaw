const crypto = require('crypto');

function buildMessage(role, channel, text) {
    return {
        id: `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        role,
        channel,
        text,
        createdAt: new Date().toISOString(),
    };
}

class CompanionSessionService {
    constructor({
        store,
        memoryService,
        healthService,
        emotionService,
        safeCircleService,
        familySummaryService,
        agentOrchestratorService,
    }) {
        this.store = store;
        this.memoryService = memoryService;
        this.healthService = healthService;
        this.emotionService = emotionService;
        this.safeCircleService = safeCircleService;
        this.familySummaryService = familySummaryService;
        this.agentOrchestratorService = agentOrchestratorService;
    }

    async sendMessage(payload = {}) {
        const userText = String(payload.text || '').trim();
        const displayText = String(payload.displayText || payload.text || '').trim();
        const channel = payload.channel || 'text';

        const orchestration = await this.agentOrchestratorService.analyzeAndRespond({
            text: userText,
            channel,
            scene: payload.scene || 'silver_companion_message',
            summaryRange: 'daily',
            abortSignal: payload.abortSignal,
            requestId: payload.requestId,
        });

        const userMessage = buildMessage('user', channel, displayText || userText || '今天先陪我安静聊聊吧。');
        const assistantMessage = buildMessage('assistant', 'text', orchestration.companionText || '我在这儿，您慢慢说。');

        await this.store.updateFile('conversation', (conversation) => ({
            ...conversation,
            updatedAt: new Date().toISOString(),
            messages: [...(conversation.messages || []), userMessage, assistantMessage].slice(-30),
            proactive: {
                ...(conversation.proactive || {}),
                lastGreetingAt: new Date().toISOString(),
            },
        }));

        await this.store.updateFile('memory', (memory) => ({
            ...memory,
            updatedAt: new Date().toISOString(),
            shortTerm: {
                ...(memory.shortTerm || {}),
                lastTopic: userMessage.text,
                lastMoodTag: orchestration.analyzerResult.emotion_risk_level || 'low',
            },
            midTerm: {
                ...(memory.midTerm || {}),
                recentPatterns: [
                    `最近一次主动表达：${userMessage.text}`,
                    ...((memory.midTerm && memory.midTerm.recentPatterns) || []),
                ].slice(0, 4),
            },
        }));

        const profile = await this.store.readFile('profile');
        const healthOverview = await this.healthService.getHealthOverview();
        const safeCircleOverview = await this.safeCircleService.getSafeCircleOverview();
        const emotionOverview = await this.emotionService.getEmotionOverview(healthOverview, safeCircleOverview);
        const familySummary = await this.familySummaryService.getSummary('daily', {
            healthOverview,
            emotionOverview,
            safeCircleOverview,
        });

        return {
            profile,
            familySummary,
            healthOverview,
            emotionOverview,
            safeCircleOverview,
            analyzerResult: orchestration.analyzerResult,
            contextPacket: orchestration.contextPacket,
            profileUpdateResult: orchestration.profileUpdateResult,
            analysisMemoryWriteResult: orchestration.analysisMemoryWriteResult,
            companionMemoryWriteResult: orchestration.companionMemoryWriteResult,
            memoryWriteResult: orchestration.memoryWriteResult,
            userMessage,
            assistantMessage,
        };
    }
}

module.exports = CompanionSessionService;
