const fs = require('fs-extra');
const path = require('path');

const SettingsManager = require(path.join(__dirname, '..', '..', '..', '..', '..', 'modules', 'utils', 'appSettingsManager'));
const LocalDataStore = require('../store/localDataStore');
const { createDemoState } = require('../store/demoDefaults');
const DashboardAssembler = require('./dashboardAssembler');
const HealthMonitorService = require('./healthMonitorService');
const EmotionAnalysisService = require('./emotionAnalysisService');
const SafeCircleService = require('./safeCircleService');
const MemoryProfileService = require('./memoryProfileService');
const FamilySummaryService = require('./familySummaryService');
const MockScenarioService = require('./mockScenarioService');
const CompanionSessionService = require('./companionSessionService');
const VoiceBridgeService = require('./voiceBridgeService');
const AgentConfigService = require('./agentConfigService');
const AgentOrchestratorService = require('./agentOrchestratorService');

class ManagedAgentConfigAdapter {
    constructor(agentConfigService, groupId, notebooks, getGroupConfig) {
        this.agentConfigService = agentConfigService;
        this.groupId = groupId;
        this.notebooks = notebooks;
        this.getGroupConfig = getGroupConfig;
    }

    ensureAgents() {
        return this.agentConfigService.ensureManagedAgents(this.groupId, { notebooks: this.notebooks });
    }

    async getAgentRuntime(agentKey) {
        const runtime = await this.agentConfigService.getManagedAgentRuntime(this.groupId, agentKey);
        const groupConfig = this.getGroupConfig ? await this.getGroupConfig() : null;
        const unifiedModel = typeof groupConfig?.unifiedModel === 'string' ? groupConfig.unifiedModel.trim() : '';

        if (groupConfig?.useUnifiedModel === true && unifiedModel) {
            runtime.config = {
                ...runtime.config,
                model: unifiedModel,
                silverCompanionResolvedModel: unifiedModel,
                silverCompanionResolvedModelSource: 'group_unified_model',
            };
        }

        return runtime;
    }

    appendAgentHistory(agentKey, messages) {
        return this.agentConfigService.appendManagedAgentHistory(this.groupId, agentKey, messages);
    }
}

function deriveAvatarLabel(name) {
    const text = String(name || '').trim();
    if (!text) return 'SC';
    const compact = text.replace(/\s+/g, '');
    return compact.slice(0, 2).toUpperCase();
}

function buildFreshSafeCircleState(existing = {}) {
    const nowIso = new Date().toISOString();
    return {
        ...existing,
        updatedAt: nowIso,
        lastCheckInAt: null,
        checkInLabel: '尚未建立报平安记录',
        contacts: [],
        warnings: [],
    };
}

function sanitizeConversationMessages(messages = []) {
    return (Array.isArray(messages) ? messages : [])
        .filter((message) => !String(message.id || '').startsWith('msg_seed_'));
}

function buildFreshConversationState(existing = {}) {
    const nowIso = new Date().toISOString();
    return {
        ...existing,
        updatedAt: nowIso,
        messages: [],
        proactive: {
            ...(existing.proactive || {}),
            lastGreetingAt: null,
            nextSuggestedGreeting: '晚间轻问候',
        },
    };
}

function buildFreshSummaryState(existing = {}) {
    const nowIso = new Date().toISOString();
    return {
        ...existing,
        updatedAt: nowIso,
        agentOutputs: {
            daily: null,
            weekly: null,
        },
        daily: {
            headline: '暂无足够数据，建议先从日常聊天和基础观察开始。',
            keyEvents: [],
            recommendedActions: [],
        },
        weekly: {
            headline: '暂无一周趋势数据。',
            keyEvents: [],
            recommendedActions: [],
        },
    };
}

function isDemoSafeCircleState(safeCircle = {}) {
    const contacts = Array.isArray(safeCircle.contacts) ? safeCircle.contacts : [];
    const names = contacts.map((item) => item && item.name).filter(Boolean);
    return names.includes('小雨') || names.includes('王阿姨') || names.includes('公园晨练群');
}

function isDemoProfileState(profile = {}) {
    const preferences = Array.isArray(profile.preferences) ? profile.preferences : [];
    const family = Array.isArray(profile.family) ? profile.family : [];
    const tags = Array.isArray(profile.tags) ? profile.tags : [];

    return profile.id === 'elder_demo'
        || profile.name === '李阿姨'
        || preferences.includes('喜欢晨间散步')
        || family.includes('女儿住在苏州')
        || tags.includes('品质银发');
}

function hasDemoConversationSeed(conversation = {}) {
    const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
    return messages.some((item) => String(item.id || '').startsWith('msg_seed_'));
}

class SilverCompanionSessionManager {
    constructor({ projectRoot }) {
        this.projectRoot = projectRoot;
        this.appDataRoot = path.join(projectRoot, 'AppData');
        this.agentDir = path.join(this.appDataRoot, 'Agents');
        this.userDataDir = path.join(this.appDataRoot, 'UserData');
        this.settingsPath = path.join(this.appDataRoot, 'settings.json');
        this.groupRoot = path.join(this.appDataRoot, 'SilverCompanion', 'groups');
        this.groupChat = require(path.join(projectRoot, 'Groupmodules', 'groupchat'));
        this.agentConfigService = new AgentConfigService({ projectRoot });
        this.contexts = new Map();
        this.groupChatInitialized = false;
        this.activeManagedRequestControllers = new Map();
    }

    ensureGroupChatInitialized() {
        if (this.groupChatInitialized) {
            return;
        }

        this.groupChat.initializePaths({
            APP_DATA_ROOT_IN_PROJECT: this.appDataRoot,
            AGENT_DIR: this.agentDir,
            USER_DATA_DIR: this.userDataDir,
            SETTINGS_FILE: this.settingsPath,
        });
        this.groupChatInitialized = true;
    }

    buildManagedGroupId() {
        return `elder_${Date.now()}`;
    }

    buildManagedTopicId(groupId) {
        return `${groupId}_main`;
    }

    buildNotebooks(groupId) {
        return {
            companion: `银发陪伴助手__${groupId}`,
            analysis: `银发分析助手__${groupId}`,
        };
    }

    getDataRoot(groupId) {
        return path.join(this.groupRoot, groupId);
    }

    getLegacyDemoRoot() {
        return path.join(this.appDataRoot, 'SilverCompanion', 'elder_demo');
    }

    buildProfileSeed(groupId, payload = {}) {
        const ageRaw = payload.age;
        const normalizedAge = String(ageRaw || '').trim() !== '' && Number.isFinite(Number(ageRaw)) && Number(ageRaw) > 0
            ? Number(ageRaw)
            : undefined;
        return {
            id: groupId,
            name: payload.groupName || payload.name || '新老人',
            age: normalizedAge,
            gender: payload.gender || undefined,
            city: payload.city || undefined,
            relationshipRole: payload.relationshipRole || undefined,
            preferences: Array.isArray(payload.preferences) ? payload.preferences : undefined,
            family: Array.isArray(payload.family) ? payload.family : undefined,
            avatarLabel: deriveAvatarLabel(payload.groupName || payload.name || ''),
        };
    }

    ensureMainTopic(topics = [], groupId) {
        const topicId = this.buildManagedTopicId(groupId);
        const filtered = Array.isArray(topics) ? topics.filter((topic) => topic && topic.id !== topicId) : [];
        const existing = Array.isArray(topics) ? topics.find((topic) => topic && topic.id === topicId) : null;

        return [
            {
                id: topicId,
                name: '主要对话',
                createdAt: existing?.createdAt || Date.now(),
            },
            ...filtered,
        ];
    }

    async ensureGroupData(groupId, profileSeed = {}, notebooks) {
        const store = new LocalDataStore({
            dataDir: this.getDataRoot(groupId),
            defaultFactory: createDemoState,
        });
        await store.ensureDataFiles();

        await store.updateFile('profile', (profile) => ({
            ...profile,
            id: groupId,
            name: profileSeed.name || profile.name,
            age: profileSeed.age != null ? profileSeed.age : (Number(profile.age) > 0 ? profile.age : null),
            gender: profileSeed.gender || profile.gender || '',
            city: profileSeed.city || profile.city || '',
            relationshipRole: profileSeed.relationshipRole || profile.relationshipRole || '',
            preferences: profileSeed.preferences || profile.preferences,
            family: profileSeed.family || profile.family,
            avatarLabel: profileSeed.avatarLabel || profile.avatarLabel,
            motto: profile.motto && profile.motto !== '今天也想和熟悉的人说一声平安。'
                ? profile.motto
                : '先聊聊天，画像会慢慢补全。',
            tags: Array.isArray(profile.tags) ? profile.tags.filter(Boolean) : [],
            updatedAt: new Date().toISOString(),
        }));

        await store.updateFile('profile', (profile) => {
            if (!isDemoProfileState(profile)) {
                return profile;
            }

            return {
                ...profile,
                id: groupId,
                name: profileSeed.name || profile.name,
                age: profileSeed.age != null ? profileSeed.age : null,
                gender: profileSeed.gender || '',
                city: profileSeed.city || '',
                relationshipRole: profileSeed.relationshipRole || '',
                preferences: Array.isArray(profileSeed.preferences) ? profileSeed.preferences : [],
                family: Array.isArray(profileSeed.family) ? profileSeed.family : [],
                tags: [],
                avatarLabel: profileSeed.avatarLabel || profile.avatarLabel,
                motto: '先聊聊天，画像会慢慢补全。',
                watchName: '银发陪伴腕带',
                updatedAt: new Date().toISOString(),
            };
        });

        await store.updateFile('memory', (memory) => ({
            ...memory,
            updatedAt: new Date().toISOString(),
            longTermNotebook: notebooks.companion,
            analysisNotebook: notebooks.analysis,
        }));

        await store.updateFile('safeCircle', (safeCircle) => {
            if (!isDemoSafeCircleState(safeCircle)) {
                return safeCircle;
            }
            return buildFreshSafeCircleState(safeCircle);
        });

        await store.updateFile('conversation', (conversation) => {
            const sanitizedMessages = sanitizeConversationMessages(conversation.messages || []);
            const hadDemoSeed = hasDemoConversationSeed(conversation);

            if (!hadDemoSeed) {
                return {
                    ...conversation,
                    messages: sanitizedMessages,
                };
            }

            const next = buildFreshConversationState(conversation);
            next.messages = sanitizedMessages;
            return next;
        });

        await store.updateFile('summary', (summary) => {
            const headline = String(summary?.daily?.headline || '');
            if (
                headline.includes('总体状态平稳')
                || headline.includes('本周整体状态温和稳定')
                || headline.includes('熟人圈互动保持活跃')
            ) {
                return buildFreshSummaryState(summary);
            }
            return summary;
        });

        return store;
    }

    async createManagedGroupConfig(groupId, payload = {}) {
        this.ensureGroupChatInitialized();
        const notebooks = this.buildNotebooks(groupId);
        const managedAgents = await this.agentConfigService.ensureManagedAgents(groupId, { notebooks });
        const profileSeed = this.buildProfileSeed(groupId, payload);
        const topicId = this.buildManagedTopicId(groupId);

        const result = await this.groupChat.createAgentGroup(profileSeed.name, {
            id: groupId,
            members: [managedAgents.analyzerId, managedAgents.companionId],
            mode: 'silver_companion_managed',
            createdAt: Date.now(),
            topics: [{ id: topicId, name: '主要对话', createdAt: Date.now() }],
            silverCompanionManaged: true,
            silverCompanionRole: 'elder_session',
            silverCompanionElderId: groupId,
            silverCompanionDataDir: this.getDataRoot(groupId),
            silverCompanionAssistantIds: {
                analyzer: managedAgents.analyzerId,
                companion: managedAgents.companionId,
            },
            silverCompanionNotebooks: notebooks,
            silverCompanionProfileSeed: profileSeed,
        });

        if (!result.success) {
            throw new Error(result.error || '创建受管老人群失败');
        }

        await this.ensureGroupData(groupId, profileSeed, notebooks);
        return result.agentGroup;
    }

    async ensureManagedGroup(groupId, options = {}) {
        this.ensureGroupChatInitialized();

        let groupConfig = await this.groupChat.getAgentGroupConfig(groupId);
        if (!groupConfig) {
            if (!options.allowCreate) {
                throw new Error(`Managed SilverCompanion group not found: ${groupId}`);
            }
            groupConfig = await this.createManagedGroupConfig(groupId, options.profileSeed || { groupName: options.groupName || groupId });
        }

        const notebooks = this.buildNotebooks(groupId);
        const managedAgents = await this.agentConfigService.ensureManagedAgents(groupId, { notebooks });
        const profileSeed = {
            ...(groupConfig.silverCompanionProfileSeed || {}),
            ...(options.profileSeed || {}),
            groupName: options.groupName || groupConfig.name,
        };

        const nextConfig = {
            ...groupConfig,
            id: groupId,
            name: options.groupName || groupConfig.name,
            members: [managedAgents.analyzerId, managedAgents.companionId],
            mode: 'silver_companion_managed',
            topics: this.ensureMainTopic(groupConfig.topics, groupId),
            silverCompanionManaged: true,
            silverCompanionRole: 'elder_session',
            silverCompanionElderId: groupId,
            silverCompanionDataDir: this.getDataRoot(groupId),
            silverCompanionAssistantIds: {
                analyzer: managedAgents.analyzerId,
                companion: managedAgents.companionId,
            },
            silverCompanionNotebooks: notebooks,
            silverCompanionProfileSeed: {
                ...(groupConfig.silverCompanionProfileSeed || {}),
                ...profileSeed,
            },
        };

        const saved = await this.groupChat.saveAgentGroupConfig(groupId, nextConfig);
        if (!saved.success) {
            throw new Error(saved.error || '保存 SilverCompanion 受管群配置失败');
        }

        await this.ensureGroupData(groupId, this.buildProfileSeed(groupId, nextConfig.silverCompanionProfileSeed || {}), notebooks);
        return saved.agentGroup;
    }

    async ensureDefaultManagedGroup() {
        const legacyDemoRoot = this.getLegacyDemoRoot();
        const groupId = 'silvercompanion_elder_demo';
        const targetRoot = this.getDataRoot(groupId);

        if (await fs.pathExists(legacyDemoRoot) && !(await fs.pathExists(targetRoot))) {
            await this.ensureManagedGroup(groupId, {
                allowCreate: true,
                groupName: '默认老人',
                profileSeed: { groupName: '默认老人' },
            });
            await fs.ensureDir(path.dirname(targetRoot));
            await fs.move(legacyDemoRoot, targetRoot, { overwrite: true });
            const notebooks = this.buildNotebooks(groupId);
            await this.ensureGroupData(groupId, { groupName: '默认老人' }, notebooks);
            return groupId;
        }

        await this.ensureManagedGroup(groupId, {
            allowCreate: true,
            groupName: '默认老人',
            profileSeed: { groupName: '默认老人' },
        });
        return groupId;
    }

    async createSilverCompanionGroup(payload = {}) {
        let groupId = payload.groupId || this.buildManagedGroupId();
        while (await this.groupChat.getAgentGroupConfig(groupId)) {
            groupId = this.buildManagedGroupId();
        }

        const groupConfig = await this.createManagedGroupConfig(groupId, payload);
        return {
            success: true,
            groupId,
            topicId: this.buildManagedTopicId(groupId),
            agentGroup: groupConfig,
        };
    }

    buildAgentAdapter(groupId, notebooks) {
        return new ManagedAgentConfigAdapter(
            this.agentConfigService,
            groupId,
            notebooks,
            async () => this.groupChat.getAgentGroupConfig(groupId)
        );
    }

    async createSessionContext(groupId) {
        const groupConfig = await this.ensureManagedGroup(groupId);
        const notebooks = groupConfig.silverCompanionNotebooks || this.buildNotebooks(groupId);
        const settingsManager = new SettingsManager(this.settingsPath);
        const store = new LocalDataStore({
            dataDir: this.getDataRoot(groupId),
            defaultFactory: createDemoState,
        });

        await store.ensureDataFiles();
        const healthService = new HealthMonitorService({ store });
        const emotionService = new EmotionAnalysisService({ store });
        const safeCircleService = new SafeCircleService({ store });
        const memoryService = new MemoryProfileService({ store });
        const familySummaryService = new FamilySummaryService({ store });
        const mockScenarioService = new MockScenarioService({ store });
        const voiceBridgeService = new VoiceBridgeService({ settingsPath: this.settingsPath });
        const agentAdapter = this.buildAgentAdapter(groupId, notebooks);
        const agentOrchestratorService = new AgentOrchestratorService({
            projectRoot: this.projectRoot,
            settingsManager,
            store,
            agentConfigService: agentAdapter,
            healthService,
            emotionService,
            safeCircleService,
            memoryService,
            familySummaryService,
        });
        await agentOrchestratorService.ensureReady();
        agentOrchestratorService.longTermMemoryService.notebookName = notebooks.companion;
        agentOrchestratorService.longTermMemoryService.maidName = `[${notebooks.companion}]${notebooks.companion}`;
        agentOrchestratorService.analysisEventMemoryService.notebookName = notebooks.analysis;
        agentOrchestratorService.analysisEventMemoryService.maidName = `[${notebooks.analysis}]${notebooks.analysis}`;

        const companionSessionService = new CompanionSessionService({
            store,
            memoryService,
            healthService,
            emotionService,
            safeCircleService,
            familySummaryService,
            agentOrchestratorService,
        });
        const dashboardAssembler = new DashboardAssembler({
            store,
            settingsManager,
            healthService,
            emotionService,
            safeCircleService,
            memoryService,
            familySummaryService,
        });

        return {
            groupId,
            topicId: this.buildManagedTopicId(groupId),
            groupConfig,
            notebooks,
            managedAssistantIds: groupConfig.silverCompanionAssistantIds,
            settingsManager,
            store,
            healthService,
            emotionService,
            safeCircleService,
            memoryService,
            familySummaryService,
            mockScenarioService,
            voiceBridgeService,
            agentOrchestratorService,
            companionSessionService,
            dashboardAssembler,
        };
    }

    async getSessionContext(groupId) {
        if (!this.contexts.has(groupId)) {
            this.contexts.set(groupId, this.createSessionContext(groupId));
        }
        return this.contexts.get(groupId);
    }

    invalidateSession(groupId) {
        this.contexts.delete(groupId);
    }

    isAbortLikeError(error) {
        const name = String(error?.name || '').toLowerCase();
        const code = String(error?.code || '').toLowerCase();
        const message = String(error?.message || '').toLowerCase();
        return name === 'aborterror'
            || code === 'abort_err'
            || message.includes('aborted')
            || error?.silverCompanionInterrupted === true;
    }

    registerManagedRequest(messageId, entry) {
        this.activeManagedRequestControllers.set(messageId, {
            ...entry,
            interrupted: false,
            createdAt: Date.now(),
        });
    }

    releaseManagedRequest(messageId) {
        this.activeManagedRequestControllers.delete(messageId);
    }

    interruptManagedGroupRequest(messageId) {
        const entry = this.activeManagedRequestControllers.get(messageId);
        if (!entry) {
            return { success: false, error: 'Request not found or already completed.' };
        }

        entry.interrupted = true;
        try {
            entry.controller.abort();
        } catch (_error) {
            // Ignore abort races.
        }
        return { success: true, message: 'Interrupt signal sent to SilverCompanion managed request.' };
    }

    emitManagedInterrupted(messageId, assistantContext, sendStreamChunkToRenderer) {
        if (typeof sendStreamChunkToRenderer !== 'function') {
            return;
        }

        sendStreamChunkToRenderer({
            type: 'end',
            error: '用户中止',
            fullResponse: '',
            messageId,
            context: assistantContext,
            interrupted: true,
        });
    }

    buildGroupAssistantContext(groupId, topicId, agentRuntime) {
        return {
            groupId,
            topicId,
            agentId: agentRuntime.id,
            agentName: agentRuntime.name,
            avatarUrl: agentRuntime.config.avatarUrl || null,
            avatarColor: agentRuntime.config.avatarCalculatedColor || null,
            isGroupMessage: true,
        };
    }

    async handleManagedGroupMessage({ groupId, topicId, userMessage, sendStreamChunkToRenderer }) {
        const context = await this.getSessionContext(groupId);
        const resolvedTopicId = topicId || this.buildManagedTopicId(groupId);
        const companionRuntime = await this.agentConfigService.getManagedAgentRuntime(groupId, 'companion');
        const assistantMessageId = `msg_sc_${userMessage.id || Date.now()}_${Date.now()}`;
        const visibleUserText = userMessage.originalUserText || userMessage.content?.text || '';
        const analysisText = userMessage.content?.text || visibleUserText;
        const assistantContext = this.buildGroupAssistantContext(groupId, resolvedTopicId, companionRuntime);
        const requestController = new AbortController();

        this.registerManagedRequest(assistantMessageId, {
            controller: requestController,
            context: assistantContext,
            sendStreamChunkToRenderer,
        });

        if (typeof sendStreamChunkToRenderer === 'function') {
            sendStreamChunkToRenderer({
                type: 'agent_thinking',
                messageId: assistantMessageId,
                context: assistantContext,
            });
        }

        try {
            const result = await context.companionSessionService.sendMessage({
                text: analysisText,
                displayText: visibleUserText,
                channel: 'text',
                scene: 'silver_companion_managed_group',
                groupId,
                topicId: resolvedTopicId,
                abortSignal: requestController.signal,
                requestId: assistantMessageId,
            });

            if (requestController.signal.aborted) {
                this.emitManagedInterrupted(assistantMessageId, assistantContext, sendStreamChunkToRenderer);
                return {
                    success: true,
                    managed: true,
                    interrupted: true,
                    assistantMessageId,
                };
            }

            const history = await this.groupChat.getGroupChatHistory(groupId, resolvedTopicId);
            if (requestController.signal.aborted) {
                this.emitManagedInterrupted(assistantMessageId, assistantContext, sendStreamChunkToRenderer);
                return {
                    success: true,
                    managed: true,
                    interrupted: true,
                    assistantMessageId,
                };
            }
            const nextHistory = Array.isArray(history) ? [...history] : [];

            if (!nextHistory.some((item) => item.id === userMessage.id)) {
                nextHistory.push({
                    role: 'user',
                    name: userMessage.name || '用户',
                    content: visibleUserText,
                    attachments: userMessage.attachments || [],
                    timestamp: userMessage.timestamp || Date.now(),
                    id: userMessage.id || `msg_user_${Date.now()}`,
                });
            }

            nextHistory.push({
                role: 'assistant',
                name: companionRuntime.name,
                agentId: companionRuntime.id,
                content: result.assistantMessage.text,
                timestamp: Date.now(),
                id: assistantMessageId,
                isGroupMessage: true,
            });

            await this.groupChat.saveGroupChatHistory(groupId, resolvedTopicId, nextHistory);
            if (requestController.signal.aborted) {
                this.emitManagedInterrupted(assistantMessageId, assistantContext, sendStreamChunkToRenderer);
                return {
                    success: true,
                    managed: true,
                    interrupted: true,
                    assistantMessageId,
                };
            }

            if (typeof sendStreamChunkToRenderer === 'function') {
                sendStreamChunkToRenderer({
                    type: 'full_response',
                    messageId: assistantMessageId,
                    fullResponse: result.assistantMessage.text,
                    context: assistantContext,
                });
            }

            return {
                success: true,
                managed: true,
                assistantMessageId,
                result,
            };
        } catch (error) {
            if (this.isAbortLikeError(error) || requestController.signal.aborted) {
                this.emitManagedInterrupted(assistantMessageId, assistantContext, sendStreamChunkToRenderer);
                return {
                    success: true,
                    managed: true,
                    interrupted: true,
                    assistantMessageId,
                };
            }

            if (typeof sendStreamChunkToRenderer === 'function') {
                sendStreamChunkToRenderer({
                    type: 'end',
                    error: error.message,
                    fullResponse: `[系统消息] ${error.message}`,
                    messageId: assistantMessageId,
                    context: assistantContext,
                });
            }
            throw error;
        } finally {
            this.releaseManagedRequest(assistantMessageId);
        }
    }

    async openGroupDashboard(groupId) {
        const plugin = require(path.join(this.projectRoot, 'VCPDistributedServer', 'Plugin', 'SilverCompanion', 'SilverCompanion'));
        return plugin.processToolCall({
            command: 'OpenSilverCompanionDashboard',
            groupId,
        });
    }
}

module.exports = SilverCompanionSessionManager;
