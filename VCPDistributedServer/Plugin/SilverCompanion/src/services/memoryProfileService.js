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

function normalizeMemoryProfile(memory = {}) {
    return {
        ...memory,
        longTermLastWriteAt: memory.longTermLastWriteAt || null,
        longTermLastWriteSummary: memory.longTermLastWriteSummary || '',
        longTermLastWriteSource: memory.longTermLastWriteSource || '',
        longTermLastWritePriority: memory.longTermLastWritePriority || '',
        longTermLastWriteTags: Array.isArray(memory.longTermLastWriteTags) ? memory.longTermLastWriteTags : [],
        longTermNotebook: memory.longTermNotebook || '银发陪伴助手',
        analysisLastWriteAt: memory.analysisLastWriteAt || null,
        analysisLastWriteSummary: memory.analysisLastWriteSummary || '',
        analysisLastWriteSource: memory.analysisLastWriteSource || '',
        analysisLastWritePriority: memory.analysisLastWritePriority || '',
        analysisLastWriteTags: Array.isArray(memory.analysisLastWriteTags) ? memory.analysisLastWriteTags : [],
        analysisNotebook: memory.analysisNotebook || '银发分析助手',
        shortTerm: memory.shortTerm || {},
        midTerm: memory.midTerm || { recentPatterns: [] },
        longTerm: memory.longTerm || {},
    };
}

class MemoryProfileService {
    constructor({ store }) {
        this.store = store;
    }

    async getMemoryProfile() {
        const current = await this.store.readFile('memory');
        const normalized = normalizeMemoryProfile(current);
        if (JSON.stringify(current) !== JSON.stringify(normalized)) {
            await this.store.writeFile('memory', normalized);
        }
        return normalized;
    }

    async getConversation() {
        return this.store.readFile('conversation');
    }

    async recordExchange({ userText, assistantText, channel }) {
        const userMessage = buildMessage('user', channel || 'text', userText);
        const assistantMessage = buildMessage('assistant', 'text', assistantText);

        await this.store.updateFile('conversation', (conversation) => {
            const nextMessages = [...conversation.messages, userMessage, assistantMessage].slice(-30);
            return {
                ...conversation,
                updatedAt: new Date().toISOString(),
                messages: nextMessages,
                proactive: {
                    ...conversation.proactive,
                    lastGreetingAt: new Date().toISOString(),
                },
            };
        });

        await this.store.updateFile('memory', (memory) => ({
            ...memory,
            updatedAt: new Date().toISOString(),
            shortTerm: {
                ...memory.shortTerm,
                lastTopic: userText,
                lastMoodTag: /累|困|没精神|不舒服|难受/.test(userText) ? '需要多留意' : '平稳',
            },
            midTerm: {
                ...memory.midTerm,
                recentPatterns: [
                    `最近一次主动表达：${userText}`,
                    ...(((memory.midTerm || {}).recentPatterns) || []),
                ].slice(0, 4),
            },
        }));

        return { userMessage, assistantMessage };
    }
}

module.exports = MemoryProfileService;
