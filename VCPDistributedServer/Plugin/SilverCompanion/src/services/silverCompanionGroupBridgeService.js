const path = require('path');
const fs = require('fs-extra');

class SilverCompanionGroupBridgeService {
    constructor({ projectRoot, agentConfigService }) {
        this.projectRoot = projectRoot;
        this.agentConfigService = agentConfigService;
        this.groupId = 'silvercompanion_ops_group';
        this.groupName = '银发伴侣协作群';
        this.topicId = 'silvercompanion_ops_main';
        this.topicName = '主协作话题';
        this.groupChat = require(path.join(projectRoot, 'Groupmodules', 'groupchat'));
        this.groupChatInitialized = false;
        this.appDataRoot = path.join(projectRoot, 'AppData');
        this.agentDir = path.join(this.appDataRoot, 'Agents');
        this.userDataDir = path.join(this.appDataRoot, 'UserData');
        this.settingsFile = path.join(this.appDataRoot, 'settings.json');
    }

    ensureGroupChatInitialized() {
        if (this.groupChatInitialized) {
            return;
        }

        this.groupChat.initializePaths({
            APP_DATA_ROOT_IN_PROJECT: this.appDataRoot,
            AGENT_DIR: this.agentDir,
            USER_DATA_DIR: this.userDataDir,
            SETTINGS_FILE: this.settingsFile,
        });
        this.groupChatInitialized = true;
    }

    getTopicHistoryPath() {
        return path.join(this.userDataDir, this.groupId, 'topics', this.topicId, 'history.json');
    }

    async getManagedMembers() {
        const [analyzerRuntime, companionRuntime] = await Promise.all([
            this.agentConfigService.getAgentRuntime('analyzer'),
            this.agentConfigService.getAgentRuntime('companion'),
        ]);

        return [
            { id: analyzerRuntime.id, name: analyzerRuntime.name },
            { id: companionRuntime.id, name: companionRuntime.name },
        ];
    }

    ensureMainTopic(topics = []) {
        const nextTopics = Array.isArray(topics) ? [...topics] : [];
        const mainTopic = {
            id: this.topicId,
            name: this.topicName,
            createdAt: Date.now(),
        };

        const filtered = nextTopics.filter((topic) => topic && topic.id !== this.topicId);
        const existing = nextTopics.find((topic) => topic && topic.id === this.topicId);
        return [
            {
                ...mainTopic,
                ...(existing || {}),
                id: this.topicId,
                name: this.topicName,
            },
            ...filtered,
        ];
    }

    buildGroupPrompt(members) {
        const memberNames = members.map((item) => item.name).join('、');
        return [
            '以下群设定优先级高于成员个人默认提示词。',
            '这是 SilverCompanion 的内部协作/调试/会诊群，不是老人端主会话。',
            `当前固定成员：${memberNames}。`,
            '你在这里的输出仅供运营观察、人工接管、会诊和调试使用，不会直接发送给老人。',
            '群内会出现来自 SilverCompanion 页面主链路的镜像记录，包括页面用户输入、分析快照、最终陪伴回复和长期记忆写入结果。',
            '不要把群内讨论当成老人端最终出口。',
            '不要在群场景中调用 DailyNote 或任何长期记忆写入。',
            '不要把镜像内容当成“用户明确要求记住”的证据。',
            '银发分析助手在群里应更偏向风险解释、策略说明和家属摘要解读。',
            '银发陪伴助手在群里应更偏向给出备选表达、语气调整建议和老人端可说版本。',
        ].join('\n');
    }

    buildInvitePrompt() {
        return [
            '现在轮到你 {{VCPChatAgentName}} 发言。',
            '请把自己当作银发伴侣内部协作成员，而不是老人端最终回复出口。',
            '结合已有镜像上下文，给出内部协作意见、风险解释、或备选说法。',
            '不要调用长期记忆写入，不要假设你的回答会自动同步回老人端页面。',
        ].join('\n');
    }

    buildManagedConfig(existingConfig, members) {
        const existing = existingConfig || {};
        return {
            ...existing,
            id: this.groupId,
            name: this.groupName,
            avatar: existing.avatar || null,
            avatarCalculatedColor: existing.avatarCalculatedColor || null,
            members: members.map((item) => item.id),
            mode: 'invite_only',
            tagMatchMode: 'strict',
            memberTags: {},
            groupPrompt: this.buildGroupPrompt(members),
            invitePrompt: this.buildInvitePrompt(),
            useUnifiedModel: false,
            unifiedModel: '',
            createdAt: existing.createdAt || Date.now(),
            topics: this.ensureMainTopic(existing.topics),
            silverCompanionManaged: true,
            silverCompanionRole: 'ops_group',
            silverCompanionMirrorEnabled: true,
        };
    }

    async ensureOpsGroup() {
        this.ensureGroupChatInitialized();
        const members = await this.getManagedMembers();
        const existing = await this.groupChat.getAgentGroupConfig(this.groupId);
        const nextConfig = this.buildManagedConfig(existing, members);
        const result = await this.groupChat.saveAgentGroupConfig(this.groupId, nextConfig);

        if (!result || result.success === false) {
            throw new Error(result && result.error ? result.error : '创建银发伴侣协作群失败');
        }

        const historyFile = this.getTopicHistoryPath();
        await fs.ensureDir(path.dirname(historyFile));
        if (!(await fs.pathExists(historyFile))) {
            await fs.writeJson(historyFile, [], { spaces: 2 });
        }

        return {
            groupId: this.groupId,
            topicId: this.topicId,
            config: result.agentGroup || nextConfig,
        };
    }

    getWindowHandlers() {
        try {
            return require(path.join(this.projectRoot, 'modules', 'ipc', 'windowHandlers'));
        } catch (_error) {
            return null;
        }
    }

    emitMainWindow(channel, payload) {
        const windowHandlers = this.getWindowHandlers();
        const mainWindow = windowHandlers && typeof windowHandlers.getMainWindow === 'function'
            ? windowHandlers.getMainWindow()
            : null;

        if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
            mainWindow.webContents.send(channel, payload);
        }
    }

    truncateText(value, maxLength = 96) {
        const normalized = String(value || '').replace(/\s+/g, ' ').trim();
        if (!normalized) return '';
        if (normalized.length <= maxLength) return normalized;
        return `${normalized.slice(0, maxLength)}...`;
    }

    safeJson(payload) {
        try {
            return JSON.stringify(payload, null, 2);
        } catch (_error) {
            return '{}';
        }
    }

    buildMirrorId(kind, turnId) {
        return `silver_companion_${kind}_${String(turnId).replace(/[^\w-]/g, '_')}`;
    }

    buildMirrorText(kind, summary, payload) {
        const labelMap = {
            user_input: '页面用户输入',
            analysis_snapshot: '分析快照',
            companion_reply: '最终陪伴回复',
            memory_write: '长期记忆写入结果',
            scheduled_analysis: '定时分析快照',
        };

        return [
            `【${labelMap[kind] || kind}】`,
            summary || '无摘要',
            '',
            this.safeJson(payload),
        ].join('\n');
    }

    buildMirrorEntry({ kind, turnId, summary, payload, createdAt, label }) {
        const timestamp = Date.parse(createdAt) || Date.now();
        return {
            id: this.buildMirrorId(kind, turnId),
            role: 'user',
            name: label,
            content: this.buildMirrorText(kind, summary, payload),
            timestamp,
            createdAt,
            isSilverCompanionMirror: true,
            silverCompanionMirror: {
                kind,
                source: 'silver_companion_page',
                turnId,
                summary,
                payload,
                createdAt,
            },
        };
    }

    buildTurnEntries(payload = {}) {
        const nowIso = new Date().toISOString();
        const turnId = payload.userMessage && payload.userMessage.id
            ? payload.userMessage.id
            : `turn_${Date.now()}`;
        const analyzer = payload.analyzerResult || {};
        const assistantMessage = payload.assistantMessage || {};
        const entries = [
            this.buildMirrorEntry({
                kind: 'user_input',
                turnId,
                label: '银发伴侣页面',
                createdAt: payload.userMessage?.createdAt || nowIso,
                summary: this.truncateText(payload.userMessage?.text || '页面收到了一条空输入'),
                payload: {
                    channel: payload.userMessage?.channel || 'text',
                    text: payload.userMessage?.text || '',
                    source: 'silver_companion_page',
                },
            }),
            this.buildMirrorEntry({
                kind: 'analysis_snapshot',
                turnId,
                label: '银发分析快照',
                createdAt: nowIso,
                summary: [
                    `风险=${analyzer.emotion_risk_level || 'low'}`,
                    analyzer.family_summary_headline || analyzer.emotion_summary || '无摘要',
                ].join(' · '),
                payload: {
                    emotion_risk_level: analyzer.emotion_risk_level || 'low',
                    emotion_summary: analyzer.emotion_summary || '',
                    family_summary_headline: analyzer.family_summary_headline || '',
                    family_key_events: analyzer.family_key_events || [],
                    family_actions: analyzer.family_actions || [],
                    companion_mode: analyzer.companion_mode || '',
                    tone_rule: analyzer.tone_rule || '',
                    reply_goal: analyzer.reply_goal || '',
                    handoff_required: analyzer.handoff_required === true,
                    handoff_reason: analyzer.handoff_reason || '',
                    source: analyzer.source || 'agent',
                },
            }),
            this.buildMirrorEntry({
                kind: 'companion_reply',
                turnId,
                label: '银发陪伴输出',
                createdAt: assistantMessage.createdAt || nowIso,
                summary: this.truncateText(assistantMessage.text || '未生成最终回复'),
                payload: {
                    text: assistantMessage.text || '',
                },
            }),
        ];

        const memoryResults = [payload.analysisMemoryWriteResult, payload.companionMemoryWriteResult]
            .filter((item) => item && item.success);

        if (!memoryResults.length && payload.memoryWriteResult && payload.memoryWriteResult.success) {
            memoryResults.push(payload.memoryWriteResult);
        }

        memoryResults.forEach((memoryWriteResult, index) => {
            entries.push(this.buildMirrorEntry({
                kind: 'memory_write',
                turnId: `${turnId}_${index}`,
                label: '长期记忆写入',
                createdAt: nowIso,
                summary: this.truncateText(memoryWriteResult.summary || '已写入长期记忆'),
                payload: {
                    success: true,
                    notebook: memoryWriteResult.notebook || '银发陪伴助手',
                    summary: memoryWriteResult.summary || '',
                    category: memoryWriteResult.category || '',
                },
            }));
        });

        return entries;
    }

    buildScheduledEntries(payload = {}) {
        const snapshot = payload.dashboard?.analysisSnapshot || {};
        const analyzer = payload.analysis?.analyzerResult || {};
        const turnId = snapshot.lastScheduledAnalysisAt || payload.dashboard?.updatedAt || `scheduled_${Date.now()}`;
        const createdAt = snapshot.lastScheduledAnalysisAt || new Date().toISOString();
        const entries = [
            this.buildMirrorEntry({
                kind: 'scheduled_analysis',
                turnId,
                label: '定时分析快照',
                createdAt,
                summary: [
                    `风险=${snapshot.lastRiskLevel || analyzer.emotion_risk_level || 'low'}`,
                    snapshot.lastFamilySummary || analyzer.family_summary_headline || analyzer.emotion_summary || '无摘要',
                ].join(' · '),
                payload: {
                    lastRiskLevel: snapshot.lastRiskLevel || analyzer.emotion_risk_level || 'low',
                    lastFamilySummary: snapshot.lastFamilySummary || analyzer.family_summary_headline || '',
                    handoff_required: snapshot.lastHandoffState?.required === true || analyzer.handoff_required === true,
                    handoff_reason: snapshot.lastHandoffState?.reason || analyzer.handoff_reason || '',
                    emotion_summary: analyzer.emotion_summary || '',
                    source: analyzer.source || 'agent',
                },
            }),
        ];

        const memoryResults = [payload.analysis?.analysisMemoryWriteResult, payload.analysis?.companionMemoryWriteResult]
            .filter((item) => item && item.success);

        if (!memoryResults.length && payload.analysis?.memoryWriteResult && payload.analysis.memoryWriteResult.success) {
            memoryResults.push(payload.analysis.memoryWriteResult);
        }

        memoryResults.forEach((memoryWriteResult, index) => {
            entries.push(this.buildMirrorEntry({
                kind: 'memory_write',
                turnId: `${turnId}_${index}`,
                label: '长期记忆写入',
                createdAt,
                summary: this.truncateText(memoryWriteResult.summary || '已写入长期记忆'),
                payload: {
                    success: true,
                    notebook: memoryWriteResult.notebook || '银发陪伴助手',
                    summary: memoryWriteResult.summary || '',
                    category: memoryWriteResult.category || '',
                },
            }));
        });

        return entries;
    }

    async appendEntries(entries = []) {
        if (!entries.length) {
            return { success: true, appendedCount: 0 };
        }

        await this.ensureOpsGroup();
        const history = await this.groupChat.getGroupChatHistory(this.groupId, this.topicId);
        const currentHistory = Array.isArray(history) ? history : [];
        const existingIds = new Set(currentHistory.map((item) => item && item.id).filter(Boolean));
        const nextHistory = [...currentHistory];
        let appendedCount = 0;

        entries.forEach((entry) => {
            if (!existingIds.has(entry.id)) {
                nextHistory.push(entry);
                existingIds.add(entry.id);
                appendedCount += 1;
            }
        });

        nextHistory.sort((left, right) => {
            const leftTime = Number(left && left.timestamp) || 0;
            const rightTime = Number(right && right.timestamp) || 0;
            return leftTime - rightTime;
        });

        if (appendedCount === 0) {
            return { success: true, appendedCount: 0 };
        }

        const result = await this.groupChat.saveGroupChatHistory(this.groupId, this.topicId, nextHistory);
        if (result.success) {
            this.emitMainWindow('silver-companion:ops-group-history-updated', {
                groupId: this.groupId,
                topicId: this.topicId,
                path: result.historyFile,
            });
        }
        return {
            ...result,
            appendedCount,
        };
    }

    async mirrorTurn(payload = {}) {
        return this.appendEntries(this.buildTurnEntries(payload));
    }

    async mirrorScheduledAnalysis(payload = {}) {
        return this.appendEntries(this.buildScheduledEntries(payload));
    }

    async openOpsGroup() {
        await this.ensureOpsGroup();
        const windowHandlers = this.getWindowHandlers();

        if (windowHandlers && typeof windowHandlers.openSilverCompanionOpsGroup === 'function') {
            return windowHandlers.openSilverCompanionOpsGroup({
                groupId: this.groupId,
                topicId: this.topicId,
            });
        }

        return {
            success: false,
            error: 'main_window_unavailable',
        };
    }
}

module.exports = SilverCompanionGroupBridgeService;
