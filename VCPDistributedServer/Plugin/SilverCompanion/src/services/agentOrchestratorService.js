const crypto = require('crypto');
const path = require('path');

const { resolveVcpApiKey } = require(path.join(__dirname, '..', '..', '..', '..', '..', 'modules', 'utils', 'vcpKeyResolver'));
const { resolveModelRequestTarget } = require(path.join(__dirname, '..', '..', '..', '..', '..', 'modules', 'utils', 'modelRouting'));
const { createCompanionReply } = require('../adapters/companionReplyAdapter');
const AnalyzerPolicyService = require('./analyzerPolicyService');
const LongTermMemoryService = require('./longTermMemoryService');
const AnalysisEventMemoryService = require('./analysisEventMemoryService');

function stripCodexModelPrefix(model) {
    const value = String(model || '').trim();
    if (!value.toLowerCase().startsWith('openai-codex/')) return value;
    return value.slice('openai-codex/'.length).trim();
}

function shouldRetryWithStrippedCodexModel(status, rawBody, model) {
    if (status !== 400) return false;
    const current = String(model || '').trim();
    if (!current.toLowerCase().startsWith('openai-codex/')) return false;
    return String(rawBody || '').toLowerCase().includes('not supported when using codex with a chatgpt account');
}

function deriveAvatarLabel(name) {
    const text = String(name || '').trim();
    if (!text) return 'SC';
    const compact = text.replace(/\s+/g, '');
    return compact.slice(0, 2).toUpperCase();
}

function mergeUniqueStrings(base, additions) {
    const values = new Set([...(base || []), ...(additions || [])].map((item) => String(item || '').trim()).filter(Boolean));
    return Array.from(values);
}

function isAbortLikeError(error) {
    const name = String(error?.name || '').toLowerCase();
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();
    return name === 'aborterror'
        || code === 'abort_err'
        || message.includes('aborted')
        || error?.silverCompanionInterrupted === true;
}

class AgentOrchestratorService {
    constructor({
        projectRoot,
        settingsManager,
        store,
        agentConfigService,
        healthService,
        emotionService,
        safeCircleService,
        memoryService,
        familySummaryService,
    }) {
        this.projectRoot = projectRoot;
        this.settingsManager = settingsManager;
        this.store = store;
        this.agentConfigService = agentConfigService;
        this.healthService = healthService;
        this.emotionService = emotionService;
        this.safeCircleService = safeCircleService;
        this.memoryService = memoryService;
        this.familySummaryService = familySummaryService;
        this.policyService = new AnalyzerPolicyService();
        this.longTermMemoryService = new LongTermMemoryService({ projectRoot, store });
        this.analysisEventMemoryService = new AnalysisEventMemoryService({ projectRoot, store });
    }

    async ensureReady() {
        await this.agentConfigService.ensureAgents();
    }

    async buildContextPacket(payload = {}) {
        const [profile, healthOverview, safeCircleOverview, conversation, memory, analysisSnapshot] = await Promise.all([
            this.store.readFile('profile'),
            this.healthService.getHealthOverview(),
            this.safeCircleService.getSafeCircleOverview(),
            this.memoryService.getConversation(),
            this.memoryService.getMemoryProfile(),
            this.store.readFile('analysisSnapshot'),
        ]);

        const emotionOverview = await this.emotionService.getEmotionOverview(healthOverview, safeCircleOverview);

        return {
            profile: {
                name: profile.name,
                age: profile.age,
                gender: profile.gender,
                city: profile.city,
                relationshipRole: profile.relationshipRole,
                motto: profile.motto,
                preferences: profile.preferences || [],
                family: profile.family || [],
                tags: profile.tags || [],
            },
            health: {
                riskLevel: healthOverview.riskLevel,
                latestMetrics: healthOverview.latestMetrics,
                cards: healthOverview.cards,
                alerts: healthOverview.alerts,
                device: healthOverview.device,
            },
            emotionSignals: {
                riskLevel: emotionOverview.riskLevel,
                signals: emotionOverview.signals,
                narrative: emotionOverview.narrative.slice(0, 4),
            },
            safeCircle: {
                warningCount: safeCircleOverview.warningCount,
                warnings: safeCircleOverview.warnings,
                checkInLabel: safeCircleOverview.checkInLabel,
                contacts: safeCircleOverview.contacts,
            },
            recentConversation: {
                messages: (conversation.messages || []).slice(-8).map((message) => ({
                    role: message.role,
                    channel: message.channel,
                    text: message.text,
                    createdAt: message.createdAt,
                })),
                proactive: conversation.proactive || {},
            },
            memory: {
                shortTerm: memory.shortTerm || {},
                midTerm: memory.midTerm || {},
                longTerm: memory.longTerm || {},
                longTermLastWriteAt: memory.longTermLastWriteAt || null,
                longTermLastWriteSummary: memory.longTermLastWriteSummary || '',
                longTermNotebook: memory.longTermNotebook || '银发陪伴助手',
                analysisLastWriteAt: memory.analysisLastWriteAt || null,
                analysisLastWriteSummary: memory.analysisLastWriteSummary || '',
                analysisLastWriteSource: memory.analysisLastWriteSource || '',
                analysisLastWritePriority: memory.analysisLastWritePriority || '',
                analysisLastWriteTags: Array.isArray(memory.analysisLastWriteTags) ? memory.analysisLastWriteTags : [],
                analysisNotebook: memory.analysisNotebook || '银发分析助手',
            },
            lastAnalysisSnapshot: analysisSnapshot || null,
            userInput: {
                text: String(payload.text || '').trim(),
                channel: payload.channel || 'text',
            },
            scene: payload.scene || 'silver_companion',
        };
    }

    buildSystemPrompt(agentRuntime) {
        const config = agentRuntime.config || {};
        const topicCreatedAt = new Date(agentRuntime.topicCreatedAt || Date.now()).toISOString();
        const prepended = [
            `当前聊天记录文件路径: ${agentRuntime.historyFile}`,
            `当前话题创建于: ${topicCreatedAt}`,
        ];
        const basePrompt = String(config.systemPrompt || '').replace(/\{\{AgentName\}\}/g, config.name || agentRuntime.name);
        return `${prepended.join('\n')}\n\n${basePrompt}`.trim();
    }

    buildModelConfig(agentRuntime) {
        const config = agentRuntime.config || {};
        return {
            model: config.model || 'gpt-5.4-mini',
            temperature: config.temperature !== undefined ? Number(config.temperature) : 0.7,
            max_tokens: config.maxOutputTokens ? Number(config.maxOutputTokens) : 12000,
            contextTokenLimit: config.contextTokenLimit ? Number(config.contextTokenLimit) : 128000,
            stream: false,
        };
    }

    async sendMessagesToVcp(messages, modelConfig, options = {}) {
        const settings = await this.settingsManager.readSettings();
        if (!settings) {
            throw new Error('SilverCompanion settings are unavailable.');
        }
        if (!settings.vcpServerUrl && !String(modelConfig?.model || '').toLowerCase().startsWith('ollama/')) {
            throw new Error('未配置 vcpServerUrl，无法调用 SilverCompanion Agent。');
        }

        const requestTarget = resolveModelRequestTarget({
            defaultUrl: settings.vcpServerUrl,
            enableToolInjection: settings.enableVcpToolInjection === true,
            model: modelConfig?.model,
        });

        let key = '';
        if (requestTarget.requiresAuth) {
            key = resolveVcpApiKey({
                projectRoot: this.projectRoot,
                vcpUrl: requestTarget.finalUrl,
                configuredKey: settings.vcpApiKey || '',
            }).effectiveKey;
        }

        if (requestTarget.requiresAuth && !key) {
            throw new Error('未配置 vcpApiKey，无法调用 SilverCompanion Agent。');
        }

        const requestBody = {
            messages,
            ...modelConfig,
            model: requestTarget.resolvedModel,
            stream: false,
            requestId: options.requestId || `silver_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        };

        let response = await fetch(requestTarget.finalUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(requestTarget.requiresAuth ? { Authorization: `Bearer ${key}` } : {}),
            },
            body: JSON.stringify(requestBody),
            signal: options.signal,
        });

        if (!response.ok) {
            let errorText = await response.text();
            if (shouldRetryWithStrippedCodexModel(response.status, errorText, requestBody.model)) {
                const fallbackModel = stripCodexModelPrefix(requestBody.model);
                if (fallbackModel && fallbackModel !== requestBody.model) {
                    requestBody.model = fallbackModel;
                    response = await fetch(requestTarget.finalUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(requestTarget.requiresAuth ? { Authorization: `Bearer ${key}` } : {}),
                        },
                        body: JSON.stringify(requestBody),
                        signal: options.signal,
                    });
                    if (!response.ok) {
                        errorText = await response.text();
                    }
                }
            }

            if (!response.ok) {
                throw new Error(`SilverCompanion Agent 调用失败: ${response.status} - ${errorText}`);
            }
        }

        const data = await response.json();
        return String(data?.choices?.[0]?.message?.content || '').trim();
    }

    buildAnalyzerMessages(agentRuntime, contextPacket) {
        return [
            { role: 'system', content: this.buildSystemPrompt(agentRuntime) },
            {
                role: 'user',
                content: [
                    '请基于以下 SilverCompanionContextPacket 做情绪分析、家属摘要和陪伴策略，严格返回 JSON。',
                    JSON.stringify(contextPacket, null, 2),
                ].join('\n\n'),
            },
        ];
    }

    buildCompanionMessages(agentRuntime, contextPacket, analyzerDirective) {
        return [
            { role: 'system', content: this.buildSystemPrompt(agentRuntime) },
            {
                role: 'user',
                content: [
                    '请基于以下上下文生成适合老人端的陪伴回复。',
                    JSON.stringify({
                        context: contextPacket,
                        directive: analyzerDirective,
                    }, null, 2),
                ].join('\n\n'),
            },
        ];
    }

    extractJsonObject(rawText) {
        const text = String(rawText || '').trim();
        if (!text) {
            throw new Error('分析助手返回为空。');
        }

        const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
        const candidate = fencedMatch ? fencedMatch[1].trim() : text;

        try {
            return JSON.parse(candidate);
        } catch (_error) {
            const start = candidate.indexOf('{');
            const end = candidate.lastIndexOf('}');
            if (start !== -1 && end !== -1 && end > start) {
                return JSON.parse(candidate.slice(start, end + 1));
            }
            throw new Error('分析助手未返回合法 JSON。');
        }
    }

    buildFallbackDirective(contextPacket, familySummary, emotionOverview) {
        return this.policyService.normalizeDirective({
            emotion_summary: emotionOverview.narrative[0] || '当前情绪趋势整体平稳，但建议继续保持温和陪伴。',
            emotion_risk_level: emotionOverview.riskLevel,
            family_summary_headline: familySummary.headline,
            family_key_events: familySummary.keyEvents,
            family_actions: familySummary.recommendedActions,
            companion_guidance: '请继续保持自然、温和、低压迫感的陪伴方式，避免连续追问。',
            confidence_note: '本次为本地规则降级结果。',
            memory_should_write: false,
            memory_summary: '',
            memory_tags: [],
            memory_priority: 'low',
            analysis_memory_should_write: false,
            analysis_memory_summary: '',
            analysis_memory_tags: [],
            analysis_memory_priority: 'low',
            analysis_memory_category: 'health_trend',
            profile_updates: {},
            source: 'fallback',
        }, contextPacket);
    }

    async persistAnalysisState(kind, range, analyzerDirective) {
        const nowIso = new Date().toISOString();
        const source = analyzerDirective.source || 'agent';

        await this.store.updateFile('emotion', (emotion) => ({
            ...emotion,
            updatedAt: nowIso,
            agentAnalysis: {
                emotion_summary: analyzerDirective.emotion_summary,
                emotion_risk_level: analyzerDirective.emotion_risk_level,
                companion_guidance: analyzerDirective.companion_guidance,
                companion_mode: analyzerDirective.companion_mode,
                tone_rule: analyzerDirective.tone_rule,
                forbidden_phrases: analyzerDirective.forbidden_phrases,
                allowed_focus_topics: analyzerDirective.allowed_focus_topics,
                must_avoid_topics: analyzerDirective.must_avoid_topics,
                reply_goal: analyzerDirective.reply_goal,
                handoff_required: analyzerDirective.handoff_required,
                handoff_reason: analyzerDirective.handoff_reason,
                confidence_note: analyzerDirective.confidence_note,
                memory_should_write: analyzerDirective.memory_should_write,
                memory_summary: analyzerDirective.memory_summary,
                memory_tags: analyzerDirective.memory_tags,
                memory_priority: analyzerDirective.memory_priority,
                analysis_memory_should_write: analyzerDirective.analysis_memory_should_write,
                analysis_memory_summary: analyzerDirective.analysis_memory_summary,
                analysis_memory_tags: analyzerDirective.analysis_memory_tags,
                analysis_memory_priority: analyzerDirective.analysis_memory_priority,
                analysis_memory_category: analyzerDirective.analysis_memory_category,
                profile_updates: analyzerDirective.profile_updates,
                updatedAt: nowIso,
                source,
            },
        }));

        await this.store.updateFile('summary', (summary) => ({
            ...summary,
            updatedAt: nowIso,
            agentOutputs: {
                ...(summary.agentOutputs || {}),
                [range]: {
                    headline: analyzerDirective.family_summary_headline,
                    keyEvents: analyzerDirective.family_key_events,
                    recommendedActions: analyzerDirective.family_actions,
                    emotion_summary: analyzerDirective.emotion_summary,
                    emotion_risk_level: analyzerDirective.emotion_risk_level,
                    companion_guidance: analyzerDirective.companion_guidance,
                    companion_mode: analyzerDirective.companion_mode,
                    confidence_note: analyzerDirective.confidence_note,
                    memory_should_write: analyzerDirective.memory_should_write,
                    memory_summary: analyzerDirective.memory_summary,
                    memory_tags: analyzerDirective.memory_tags,
                    memory_priority: analyzerDirective.memory_priority,
                    analysis_memory_should_write: analyzerDirective.analysis_memory_should_write,
                    analysis_memory_summary: analyzerDirective.analysis_memory_summary,
                    analysis_memory_tags: analyzerDirective.analysis_memory_tags,
                    analysis_memory_priority: analyzerDirective.analysis_memory_priority,
                    analysis_memory_category: analyzerDirective.analysis_memory_category,
                    profile_updates: analyzerDirective.profile_updates,
                    handoff_required: analyzerDirective.handoff_required,
                    handoff_reason: analyzerDirective.handoff_reason,
                    updatedAt: nowIso,
                    source,
                },
            },
        }));

        await this.store.updateFile('analysisSnapshot', (snapshot) => ({
            ...snapshot,
            updatedAt: nowIso,
            lastTurnAnalysisAt: kind === 'turn' ? nowIso : snapshot.lastTurnAnalysisAt,
            lastScheduledAnalysisAt: kind === 'scheduled' ? nowIso : snapshot.lastScheduledAnalysisAt,
            lastDirective: analyzerDirective,
            lastRiskLevel: analyzerDirective.emotion_risk_level,
            lastFamilySummary: analyzerDirective.family_summary_headline,
            lastHandoffState: {
                required: analyzerDirective.handoff_required,
                reason: analyzerDirective.handoff_reason,
            },
        }));
    }

    async maybeWriteLongTermMemory(contextPacket, analyzerDirective) {
        if (!analyzerDirective.memory_should_write) {
            return { success: false, skipped: true, reason: 'memory_should_write_false' };
        }

        if (!String(analyzerDirective.memory_summary || '').trim()) {
            return { success: false, skipped: true, reason: 'empty_memory_summary' };
        }

        return this.longTermMemoryService.writeCompanionMemory({
            summary: analyzerDirective.memory_summary,
            tags: analyzerDirective.memory_tags,
            priority: analyzerDirective.memory_priority,
            source: contextPacket.scene || 'silver_companion',
        });
    }

    async maybeWriteAnalysisEventMemory(contextPacket, analyzerDirective) {
        if (!analyzerDirective.analysis_memory_should_write) {
            return { success: false, skipped: true, reason: 'analysis_memory_should_write_false' };
        }

        if (!String(analyzerDirective.analysis_memory_summary || '').trim()) {
            return { success: false, skipped: true, reason: 'empty_analysis_memory_summary' };
        }

        return this.analysisEventMemoryService.writeAnalysisEventMemory({
            summary: analyzerDirective.analysis_memory_summary,
            tags: analyzerDirective.analysis_memory_tags,
            priority: analyzerDirective.analysis_memory_priority,
            category: analyzerDirective.analysis_memory_category,
            source: contextPacket.scene || 'silver_companion_analysis',
        });
    }

    selectLegacyMemoryWriteResult(companionMemoryWriteResult, analysisMemoryWriteResult) {
        if (companionMemoryWriteResult && companionMemoryWriteResult.success) {
            return companionMemoryWriteResult;
        }
        if (analysisMemoryWriteResult && analysisMemoryWriteResult.success) {
            return analysisMemoryWriteResult;
        }
        return companionMemoryWriteResult || analysisMemoryWriteResult || { success: false, skipped: true, reason: 'no_memory_write' };
    }

    async applyProfileUpdates(analyzerDirective) {
        const updates = analyzerDirective.profile_updates || {};
        const hasUpdates = Object.values(updates).some((value) => {
            if (Array.isArray(value)) return value.length > 0;
            return value !== null && value !== undefined && String(value).trim() !== '';
        });

        if (!hasUpdates) {
            return { success: false, skipped: true, reason: 'no_profile_updates' };
        }

        const nowIso = new Date().toISOString();
        await this.store.updateFile('profile', (profile) => {
            const next = {
                ...profile,
                updatedAt: nowIso,
            };

            if (updates.name) {
                next.name = updates.name;
                next.avatarLabel = deriveAvatarLabel(updates.name);
            } else if (!next.avatarLabel && next.name) {
                next.avatarLabel = deriveAvatarLabel(next.name);
            }

            if (updates.age) next.age = updates.age;
            if (updates.gender) next.gender = updates.gender;
            if (updates.city) next.city = updates.city;
            if (updates.relationshipRole) next.relationshipRole = updates.relationshipRole;
            if (updates.motto) next.motto = updates.motto;
            if (updates.preferences && updates.preferences.length) {
                next.preferences = mergeUniqueStrings(next.preferences, updates.preferences);
            }
            if (updates.family && updates.family.length) {
                next.family = mergeUniqueStrings(next.family, updates.family);
            }
            if (updates.tags && updates.tags.length) {
                next.tags = mergeUniqueStrings(next.tags, updates.tags);
            }

            return next;
        });

        return { success: true, updates };
    }

    async runAnalyzer(contextPacket, range, kind, options = {}) {
        const analyzerRuntime = await this.agentConfigService.getAgentRuntime('analyzer');
        const fallbackHealthOverview = await this.healthService.getHealthOverview();
        const fallbackSafeCircleOverview = await this.safeCircleService.getSafeCircleOverview();
        const fallbackEmotionOverview = await this.emotionService.getEmotionOverview(fallbackHealthOverview, fallbackSafeCircleOverview);
        const fallbackFamilySummary = await this.familySummaryService.getSummary(range, {
            healthOverview: fallbackHealthOverview,
            emotionOverview: fallbackEmotionOverview,
            safeCircleOverview: fallbackSafeCircleOverview,
        }, { preferAgent: false });

        let directive;

        try {
            const rawText = await this.sendMessagesToVcp(
                this.buildAnalyzerMessages(analyzerRuntime, contextPacket),
                this.buildModelConfig(analyzerRuntime),
                {
                    signal: options.signal,
                    requestId: options.requestId ? `${options.requestId}_analyzer` : undefined,
                }
            );
            directive = this.policyService.normalizeDirective(this.extractJsonObject(rawText), contextPacket);
            directive.source = 'agent';
            await this.agentConfigService.appendAgentHistory('analyzer', [
                { role: 'user', content: JSON.stringify(contextPacket), timestamp: Date.now() },
                { role: 'assistant', content: JSON.stringify(directive), timestamp: Date.now() },
            ]);
        } catch (_error) {
            if (isAbortLikeError(_error)) {
                throw _error;
            }
            directive = this.buildFallbackDirective(contextPacket, fallbackFamilySummary, fallbackEmotionOverview);
            directive.source = 'fallback';
        }

        await this.persistAnalysisState(kind, range, directive);
        return directive;
    }

    async runCompanion(contextPacket, analyzerDirective, options = {}) {
        const companionRuntime = await this.agentConfigService.getAgentRuntime('companion');
        try {
            const responseText = await this.sendMessagesToVcp(
                this.buildCompanionMessages(companionRuntime, contextPacket, analyzerDirective),
                this.buildModelConfig(companionRuntime),
                {
                    signal: options.signal,
                    requestId: options.requestId ? `${options.requestId}_companion` : undefined,
                }
            );

            if (responseText) {
                await this.agentConfigService.appendAgentHistory('companion', [
                    {
                        role: 'user',
                        content: JSON.stringify({
                            userInput: contextPacket.userInput,
                            directive: analyzerDirective,
                        }),
                        timestamp: Date.now(),
                    },
                    {
                        role: 'assistant',
                        content: responseText,
                        timestamp: Date.now(),
                    },
                ]);
                return responseText;
            }
        } catch (_error) {
            if (isAbortLikeError(_error)) {
                throw _error;
            }
            // Fall through to local fallback.
        }

        return createCompanionReply({
            userText: contextPacket.userInput.text,
            profile: contextPacket.profile,
            healthState: contextPacket.health,
            emotionState: {
                riskLevel: analyzerDirective.emotion_risk_level,
                signals: [],
            },
            safeCircleState: {
                warningCount: contextPacket.safeCircle.warningCount,
            },
            familySummary: {
                headline: analyzerDirective.family_summary_headline,
            },
            proactive: !contextPacket.userInput.text,
        });
    }

    async analyzeOnly(payload = {}) {
        await this.ensureReady();
        const range = payload.summaryRange || 'daily';
        const contextPacket = await this.buildContextPacket({
            ...payload,
            scene: payload.scene || 'scheduled_analysis',
        });
        const analyzerDirective = await this.runAnalyzer(contextPacket, range, 'scheduled', {
            signal: payload.abortSignal,
            requestId: payload.requestId,
        });
        const profileUpdateResult = await this.applyProfileUpdates(analyzerDirective);
        const analysisMemoryWriteResult = await this.maybeWriteAnalysisEventMemory(contextPacket, analyzerDirective);
        const companionMemoryWriteResult = await this.maybeWriteLongTermMemory(contextPacket, analyzerDirective);
        const memoryWriteResult = this.selectLegacyMemoryWriteResult(companionMemoryWriteResult, analysisMemoryWriteResult);
        return {
            contextPacket,
            analyzerResult: analyzerDirective,
            profileUpdateResult,
            analysisMemoryWriteResult,
            companionMemoryWriteResult,
            memoryWriteResult,
        };
    }

    async analyzeAndRespond(payload = {}) {
        await this.ensureReady();
        const range = payload.summaryRange || 'daily';
        const contextPacket = await this.buildContextPacket(payload);
        const analyzerDirective = await this.runAnalyzer(contextPacket, range, 'turn', {
            signal: payload.abortSignal,
            requestId: payload.requestId,
        });
        const profileUpdateResult = await this.applyProfileUpdates(analyzerDirective);
        const analysisMemoryWriteResult = await this.maybeWriteAnalysisEventMemory(contextPacket, analyzerDirective);
        const companionMemoryWriteResult = await this.maybeWriteLongTermMemory(contextPacket, analyzerDirective);
        const memoryWriteResult = this.selectLegacyMemoryWriteResult(companionMemoryWriteResult, analysisMemoryWriteResult);
        const companionText = await this.runCompanion(contextPacket, analyzerDirective, {
            signal: payload.abortSignal,
            requestId: payload.requestId,
        });

        return {
            contextPacket,
            analyzerResult: analyzerDirective,
            profileUpdateResult,
            analysisMemoryWriteResult,
            companionMemoryWriteResult,
            memoryWriteResult,
            companionText,
        };
    }
}

module.exports = AgentOrchestratorService;
