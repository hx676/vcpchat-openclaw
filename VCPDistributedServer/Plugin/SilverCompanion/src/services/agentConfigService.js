const path = require('path');
const fs = require('fs-extra');

const AgentConfigManager = require(path.join(__dirname, '..', '..', '..', '..', '..', 'modules', 'utils', 'agentConfigManager'));
const { ANALYZER_PROMPT, COMPANION_PROMPT } = require('../templates/agentPrompts');

const AGENT_DEFINITIONS = Object.freeze({
    analyzer: {
        id: 'silvercompanion_analyzer',
        legacyName: 'SilverCompanionAnalyzer',
        name: '银发分析助手',
        topicId: 'silver_companion_analysis',
        topicName: '银发情绪分析',
        systemPrompt: ANALYZER_PROMPT,
        temperature: 0.3,
        maxOutputTokens: 12000,
        contextTokenLimit: 128000,
        streamOutput: false,
    },
    companion: {
        id: 'silvercompanion_companion',
        legacyName: 'SilverCompanionCompanion',
        name: '银发陪伴助手',
        topicId: 'silver_companion_memory',
        topicName: '银发专属陪伴记忆',
        systemPrompt: COMPANION_PROMPT,
        temperature: 0.7,
        maxOutputTokens: 12000,
        contextTokenLimit: 128000,
        streamOutput: false,
    },
});

function buildManagedAgentDefinition(groupId, agentKey) {
    const base = AGENT_DEFINITIONS[agentKey];
    if (!base) {
        throw new Error(`Unknown SilverCompanion agent key: ${agentKey}`);
    }
    const normalizedGroupId = String(groupId || '').replace(/^silvercompanion_/, '');

    return {
        ...base,
        id: `silvercompanion_${normalizedGroupId}_${agentKey}`,
        topicId: `silver_companion_${groupId}_${agentKey}`,
        topicName: agentKey === 'analyzer'
            ? `${groupId} 分析话题`
            : `${groupId} 陪伴话题`,
        hiddenFromMainList: true,
        silverCompanionManaged: true,
        silverCompanionGroupId: groupId,
    };
}

class AgentConfigService {
    constructor({ projectRoot }) {
        this.projectRoot = projectRoot;
        this.agentDir = path.join(projectRoot, 'AppData', 'Agents');
        this.userDataDir = path.join(projectRoot, 'AppData', 'UserData');
        this.presetDir = path.join(projectRoot, 'AppData', 'systemPromptPresets');
        this.agentConfigManager = new AgentConfigManager(this.agentDir);
    }

    getDefinition(agentKey) {
        const definition = AGENT_DEFINITIONS[agentKey];
        if (!definition) {
            throw new Error(`Unknown SilverCompanion agent key: ${agentKey}`);
        }
        return definition;
    }

    getAgentDir(agentKey) {
        const definition = this.getDefinition(agentKey);
        return path.join(this.agentDir, definition.id);
    }

    getHistoryFile(agentKey) {
        const definition = this.getDefinition(agentKey);
        return path.join(this.userDataDir, definition.id, 'topics', definition.topicId, 'history.json');
    }

    buildDefaultConfig(agentKey) {
        const definition = this.getDefinition(agentKey);
        const now = Date.now();
        return {
            name: definition.name,
            systemPrompt: definition.systemPrompt,
            originalSystemPrompt: definition.systemPrompt,
            promptMode: 'original',
            silverCompanionManaged: true,
            model: 'gpt-5.4-mini',
            temperature: definition.temperature,
            contextTokenLimit: definition.contextTokenLimit,
            maxOutputTokens: definition.maxOutputTokens,
            streamOutput: definition.streamOutput,
            topics: [
                {
                    id: definition.topicId,
                    name: definition.topicName,
                    createdAt: now,
                },
            ],
        };
    }

    buildManagedDefaultConfig(groupId, agentKey, options = {}) {
        const definition = buildManagedAgentDefinition(groupId, agentKey);
        const now = Date.now();
        return {
            name: definition.name,
            systemPrompt: definition.systemPrompt,
            originalSystemPrompt: definition.systemPrompt,
            promptMode: 'original',
            silverCompanionManaged: true,
            silverCompanionGroupId: groupId,
            silverCompanionAgentKey: agentKey,
            hiddenFromMainList: true,
            silverCompanionNotebook: options.notebookName || '',
            model: 'gpt-5.4-mini',
            temperature: definition.temperature,
            contextTokenLimit: definition.contextTokenLimit,
            maxOutputTokens: definition.maxOutputTokens,
            streamOutput: definition.streamOutput,
            topics: [
                {
                    id: definition.topicId,
                    name: definition.topicName,
                    createdAt: now,
                },
            ],
        };
    }

    async ensureAgent(agentKey) {
        const definition = this.getDefinition(agentKey);
        const agentPath = this.getAgentDir(agentKey);
        const configPath = path.join(agentPath, 'config.json');
        const historyFile = this.getHistoryFile(agentKey);
        const defaultConfig = this.buildDefaultConfig(agentKey);

        await fs.ensureDir(agentPath);
        await fs.ensureDir(path.dirname(historyFile));

        if (!(await fs.pathExists(configPath))) {
            await this.agentConfigManager.writeAgentConfig(definition.id, defaultConfig);
        } else {
            const existing = await this.agentConfigManager.readAgentConfig(definition.id, { allowDefault: true });
            const topics = Array.isArray(existing.topics) && existing.topics.length
                ? existing.topics
                : defaultConfig.topics;
            const hasTopic = topics.some((topic) => topic.id === definition.topicId);
            const merged = {
                ...existing,
                name: (!existing.name || existing.name === definition.legacyName) ? defaultConfig.name : existing.name,
                systemPrompt: existing.silverCompanionManaged === false ? (existing.systemPrompt || defaultConfig.systemPrompt) : defaultConfig.systemPrompt,
                originalSystemPrompt: existing.silverCompanionManaged === false
                    ? (existing.originalSystemPrompt || existing.systemPrompt || defaultConfig.systemPrompt)
                    : defaultConfig.systemPrompt,
                promptMode: existing.promptMode || 'original',
                silverCompanionManaged: existing.silverCompanionManaged !== false,
                model: existing.model || defaultConfig.model,
                temperature: existing.temperature !== undefined ? existing.temperature : defaultConfig.temperature,
                contextTokenLimit: existing.contextTokenLimit || defaultConfig.contextTokenLimit,
                maxOutputTokens: existing.maxOutputTokens || defaultConfig.maxOutputTokens,
                streamOutput: existing.streamOutput !== undefined ? existing.streamOutput : defaultConfig.streamOutput,
                topics: (hasTopic ? topics : [...topics, defaultConfig.topics[0]]).map((topic) => {
                    if (topic.id === definition.topicId && (!topic.name || topic.name.includes('SilverCompanion'))) {
                        return { ...topic, name: definition.topicName };
                    }
                    return topic;
                }),
            };
            await this.agentConfigManager.writeAgentConfig(definition.id, merged);
        }

        if (!(await fs.pathExists(historyFile))) {
            await fs.writeJson(historyFile, [], { spaces: 2 });
        }

        return this.getAgentRuntime(agentKey);
    }

    async ensureAgents() {
        await this.ensurePresetFiles();
        await this.ensureAgent('analyzer');
        await this.ensureAgent('companion');
    }

    getManagedDefinition(groupId, agentKey) {
        return buildManagedAgentDefinition(groupId, agentKey);
    }

    getManagedAgentDir(groupId, agentKey) {
        const definition = this.getManagedDefinition(groupId, agentKey);
        return path.join(this.agentDir, definition.id);
    }

    getManagedHistoryFile(groupId, agentKey) {
        const definition = this.getManagedDefinition(groupId, agentKey);
        return path.join(this.userDataDir, definition.id, 'topics', definition.topicId, 'history.json');
    }

    async ensureManagedAgent(groupId, agentKey, options = {}) {
        const definition = this.getManagedDefinition(groupId, agentKey);
        const agentPath = this.getManagedAgentDir(groupId, agentKey);
        const configPath = path.join(agentPath, 'config.json');
        const historyFile = this.getManagedHistoryFile(groupId, agentKey);
        const defaultConfig = this.buildManagedDefaultConfig(groupId, agentKey, options);

        await fs.ensureDir(agentPath);
        await fs.ensureDir(path.dirname(historyFile));

        if (!(await fs.pathExists(configPath))) {
            await this.agentConfigManager.writeAgentConfig(definition.id, defaultConfig);
        } else {
            const existing = await this.agentConfigManager.readAgentConfig(definition.id, { allowDefault: true });
            const topics = Array.isArray(existing.topics) && existing.topics.length
                ? existing.topics
                : defaultConfig.topics;
            const hasTopic = topics.some((topic) => topic.id === definition.topicId);
            const merged = {
                ...existing,
                name: defaultConfig.name,
                systemPrompt: existing.silverCompanionManaged === false ? (existing.systemPrompt || defaultConfig.systemPrompt) : defaultConfig.systemPrompt,
                originalSystemPrompt: existing.silverCompanionManaged === false
                    ? (existing.originalSystemPrompt || existing.systemPrompt || defaultConfig.systemPrompt)
                    : defaultConfig.systemPrompt,
                promptMode: existing.promptMode || 'original',
                silverCompanionManaged: true,
                silverCompanionGroupId: groupId,
                silverCompanionAgentKey: agentKey,
                hiddenFromMainList: true,
                silverCompanionNotebook: options.notebookName || existing.silverCompanionNotebook || '',
                model: existing.model || defaultConfig.model,
                temperature: existing.temperature !== undefined ? existing.temperature : defaultConfig.temperature,
                contextTokenLimit: existing.contextTokenLimit || defaultConfig.contextTokenLimit,
                maxOutputTokens: existing.maxOutputTokens || defaultConfig.maxOutputTokens,
                streamOutput: existing.streamOutput !== undefined ? existing.streamOutput : defaultConfig.streamOutput,
                topics: (hasTopic ? topics : [...topics, defaultConfig.topics[0]]).map((topic) => {
                    if (topic.id === definition.topicId) {
                        return { ...topic, name: definition.topicName };
                    }
                    return topic;
                }),
            };
            await this.agentConfigManager.writeAgentConfig(definition.id, merged);
        }

        if (!(await fs.pathExists(historyFile))) {
            await fs.writeJson(historyFile, [], { spaces: 2 });
        }

        return this.getManagedAgentRuntime(groupId, agentKey);
    }

    async ensureManagedAgents(groupId, options = {}) {
        await this.ensurePresetFiles();
        const notebooks = options.notebooks || {};
        const analyzer = await this.ensureManagedAgent(groupId, 'analyzer', {
            notebookName: notebooks.analysis || '',
        });
        const companion = await this.ensureManagedAgent(groupId, 'companion', {
            notebookName: notebooks.companion || '',
        });
        return {
            analyzerId: analyzer.id,
            companionId: companion.id,
            analyzer,
            companion,
        };
    }

    async ensurePresetFiles() {
        await fs.ensureDir(this.presetDir);
        const files = [
            {
                name: '90-银发分析助手-模板.md',
                content: ANALYZER_PROMPT,
            },
            {
                name: '91-银发陪伴助手-模板.md',
                content: COMPANION_PROMPT,
            },
        ];

        for (const file of files) {
            const filePath = path.join(this.presetDir, file.name);
            if (!(await fs.pathExists(filePath))) {
                await fs.writeFile(filePath, file.content, 'utf8');
            }
        }
    }

    async getAgentRuntime(agentKey) {
        const definition = this.getDefinition(agentKey);
        const config = await this.agentConfigManager.readAgentConfig(definition.id, { allowDefault: true });
        const topic = Array.isArray(config.topics)
            ? config.topics.find((item) => item.id === definition.topicId) || config.topics[0]
            : null;
        const topicId = topic ? topic.id : definition.topicId;
        const topicCreatedAt = topic ? topic.createdAt : Date.now();
        const historyFile = path.join(this.userDataDir, definition.id, 'topics', topicId, 'history.json');

        return {
            key: agentKey,
            id: definition.id,
            name: config.name || definition.name,
            config: {
                ...config,
                id: definition.id,
                agentDataPath: path.join(this.userDataDir, definition.id),
            },
            topicId,
            topicCreatedAt,
            historyFile,
        };
    }

    async getManagedAgentRuntime(groupId, agentKey) {
        const definition = this.getManagedDefinition(groupId, agentKey);
        const config = await this.agentConfigManager.readAgentConfig(definition.id, { allowDefault: true });
        const topic = Array.isArray(config.topics)
            ? config.topics.find((item) => item.id === definition.topicId) || config.topics[0]
            : null;
        const topicId = topic ? topic.id : definition.topicId;
        const topicCreatedAt = topic ? topic.createdAt : Date.now();
        const historyFile = path.join(this.userDataDir, definition.id, 'topics', topicId, 'history.json');

        return {
            key: agentKey,
            id: definition.id,
            name: config.name || definition.name,
            config: {
                ...config,
                id: definition.id,
                agentDataPath: path.join(this.userDataDir, definition.id),
            },
            topicId,
            topicCreatedAt,
            historyFile,
        };
    }

    async readAgentHistory(agentKey) {
        const runtime = await this.getAgentRuntime(agentKey);
        if (!(await fs.pathExists(runtime.historyFile))) {
            return [];
        }
        try {
            const history = await fs.readJson(runtime.historyFile);
            return Array.isArray(history) ? history : [];
        } catch (_error) {
            return [];
        }
    }

    async appendAgentHistory(agentKey, messages) {
        const runtime = await this.getAgentRuntime(agentKey);
        const history = await this.readAgentHistory(agentKey);
        const nextHistory = history.concat(messages || []).slice(-40);
        await fs.ensureDir(path.dirname(runtime.historyFile));
        await fs.writeJson(runtime.historyFile, nextHistory, { spaces: 2 });
        return nextHistory;
    }

    async readManagedAgentHistory(groupId, agentKey) {
        const runtime = await this.getManagedAgentRuntime(groupId, agentKey);
        if (!(await fs.pathExists(runtime.historyFile))) {
            return [];
        }
        try {
            const history = await fs.readJson(runtime.historyFile);
            return Array.isArray(history) ? history : [];
        } catch (_error) {
            return [];
        }
    }

    async appendManagedAgentHistory(groupId, agentKey, messages) {
        const runtime = await this.getManagedAgentRuntime(groupId, agentKey);
        const history = await this.readManagedAgentHistory(groupId, agentKey);
        const nextHistory = history.concat(messages || []).slice(-40);
        await fs.ensureDir(path.dirname(runtime.historyFile));
        await fs.writeJson(runtime.historyFile, nextHistory, { spaces: 2 });
        return nextHistory;
    }
}

module.exports = AgentConfigService;
