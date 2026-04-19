const fs = require('fs');
const path = require('path');
const { BrowserWindow, ipcMain } = require('electron');

const SettingsManager = require(path.join(__dirname, '..', '..', '..', 'modules', 'utils', 'appSettingsManager'));
const LocalDataStore = require('./src/store/localDataStore');
const { createDemoState } = require('./src/store/demoDefaults');
const DashboardAssembler = require('./src/services/dashboardAssembler');
const HealthMonitorService = require('./src/services/healthMonitorService');
const EmotionAnalysisService = require('./src/services/emotionAnalysisService');
const SafeCircleService = require('./src/services/safeCircleService');
const MemoryProfileService = require('./src/services/memoryProfileService');
const FamilySummaryService = require('./src/services/familySummaryService');
const MockScenarioService = require('./src/services/mockScenarioService');
const CompanionSessionService = require('./src/services/companionSessionService');
const VoiceBridgeService = require('./src/services/voiceBridgeService');
const AgentConfigService = require('./src/services/agentConfigService');
const AgentOrchestratorService = require('./src/services/agentOrchestratorService');
const ScheduledAnalysisService = require('./src/services/scheduledAnalysisService');
const SilverCompanionGroupBridgeService = require('./src/services/silverCompanionGroupBridgeService');
const SilverCompanionSessionManager = require('./src/services/silverCompanionSessionManager');

const CHANNELS = Object.freeze({
    getBootstrap: 'silver-companion:get-bootstrap',
    getDashboard: 'silver-companion:get-dashboard',
    getHealthTimeline: 'silver-companion:get-health-timeline',
    sendMessage: 'silver-companion:send-message',
    startVoiceInput: 'silver-companion:start-voice-input',
    stopVoiceInput: 'silver-companion:stop-voice-input',
    stopReplyAudio: 'silver-companion:stop-reply-audio',
    getFamilySummary: 'silver-companion:get-family-summary',
    simulateEvent: 'silver-companion:simulate-event',
    resetMockState: 'silver-companion:reset-mock-state',
    voiceTranscript: 'silver-companion:voice-transcript',
    companionReply: 'silver-companion:companion-reply',
    ttsStop: 'silver-companion:tts-stop',
    analysisUpdated: 'silver-companion:analysis-updated',
    openOpsGroup: 'silver-companion:open-ops-group',
});

let projectRoot = path.resolve(__dirname, '..', '..', '..');
let guiWindow = null;
let contextPromise = null;
let contextGroupId = null;
let ipcRegistered = false;
let routesRegistered = false;
let scheduledAnalysisService = null;
let sessionManager = null;
let currentWindowGroupId = null;
let currentVoiceSession = {
    senderId: null,
    latestTranscript: '',
};

function isUsableWebContents(target) {
    try {
        return !!(target && typeof target.isDestroyed === 'function' && !target.isDestroyed());
    } catch (_error) {
        return false;
    }
}

function getWindowWebContents(windowRef) {
    try {
        if (!windowRef || typeof windowRef.isDestroyed !== 'function' || windowRef.isDestroyed()) {
            return null;
        }
        const webContents = windowRef.webContents;
        return isUsableWebContents(webContents) ? webContents : null;
    } catch (_error) {
        return null;
    }
}

function appendSilverLog(message) {
    try {
        const logPath = path.join(projectRoot, 'AppData', 'silvercompanion.log');
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
    } catch (_error) {
        // Ignore logging failures.
    }
}

function resolveProjectRoot(projectBasePath) {
    if (!projectBasePath) {
        return path.resolve(__dirname, '..', '..', '..');
    }

    const normalized = path.resolve(projectBasePath);
    return path.basename(normalized).toLowerCase() === 'vcpdistributedserver'
        ? path.resolve(normalized, '..')
        : normalized;
}

function getSettingsPath() {
    return path.join(projectRoot, 'AppData', 'settings.json');
}

function getSessionManager() {
    if (!sessionManager) {
        sessionManager = new SilverCompanionSessionManager({ projectRoot });
    }
    return sessionManager;
}

async function resolveGroupId(groupId) {
    if (groupId) {
        return groupId;
    }
    if (currentWindowGroupId) {
        return currentWindowGroupId;
    }
    currentWindowGroupId = await getSessionManager().ensureDefaultManagedGroup();
    return currentWindowGroupId;
}

async function createContext(groupId) {
    return getSessionManager().getSessionContext(groupId);
}

async function getContext(groupId) {
    const resolvedGroupId = await resolveGroupId(groupId);
    if (!contextPromise || contextGroupId !== resolvedGroupId) {
        contextGroupId = resolvedGroupId;
        contextPromise = createContext(resolvedGroupId);
    }
    return contextPromise;
}

function sendToWindow(target, channel, payload) {
    if (!isUsableWebContents(target)) {
        return false;
    }

    try {
        target.send(channel, payload);
        return true;
    } catch (error) {
        appendSilverLog(`sendToWindow failed channel=${channel} error=${error.message}`);
        return false;
    }
}

function formatRiskLabel(level) {
    if (level === 'high') return '高';
    if (level === 'medium') return '中';
    return '低';
}

function buildDashboardSummaryMarkdown(dashboard) {
    const lines = [
        `# ${dashboard.profile.name} 状态摘要`,
        '',
        `- 总体风险等级: ${formatRiskLabel(dashboard.overallRiskLevel)}`,
        `- 今日概览: ${dashboard.overview.subtitle}`,
        `- 家属摘要: ${dashboard.familySummary.headline}`,
        '',
        '## 当前提醒',
    ];

    if (dashboard.health.alerts.length) {
        dashboard.health.alerts.forEach((item) => {
            lines.push(`- ${item.title}: ${item.message}`);
        });
    } else {
        lines.push('- 当前没有健康强提醒，适合维持自然陪伴。');
    }

    lines.push('', '## 情绪翻译');
    dashboard.emotion.narrative.slice(0, 3).forEach((item) => {
        lines.push(`- ${item}`);
    });

    return lines.join('\n');
}

async function emitCompanionReply(targetWebContents, result) {
    const context = await getContext(currentWindowGroupId);
    const dashboard = await context.dashboardAssembler.getDashboard('daily');
    let audio = null;

    if (result.assistantMessage?.text) {
        audio = await context.voiceBridgeService.synthesizeReply(result.assistantMessage.text);
    }

    sendToWindow(targetWebContents, CHANNELS.companionReply, {
        ...result,
        dashboard,
        audio,
    });
}

async function buildScheduledAnalysisPayload() {
    const context = await getContext(currentWindowGroupId);
    const analysis = await context.agentOrchestratorService.analyzeOnly({
        scene: 'scheduled_analysis',
        summaryRange: 'daily',
    });
    const dashboard = await context.dashboardAssembler.getDashboard('daily');
    return {
        analysis,
        dashboard,
    };
}

function ensureScheduledAnalysis() {
    if (scheduledAnalysisService) {
        return;
    }

    scheduledAnalysisService = new ScheduledAnalysisService({
        intervalMs: 5 * 60 * 1000,
        runAnalysis: buildScheduledAnalysisPayload,
        onMeaningfulChange: async (payload) => {
            const webContents = getWindowWebContents(guiWindow);
            if (webContents) {
                sendToWindow(webContents, CHANNELS.analysisUpdated, payload);
            }
        },
    });

    scheduledAnalysisService.start();
}

function stopScheduledAnalysis() {
    if (scheduledAnalysisService) {
        scheduledAnalysisService.stop();
        scheduledAnalysisService = null;
    }
}

async function handleMessageRequest(payload, targetWebContents = null) {
    const context = await getContext(payload.groupId || currentWindowGroupId);
    const result = await context.companionSessionService.sendMessage(payload);
    const dashboard = await context.dashboardAssembler.getDashboard('daily');

    if (targetWebContents) {
        await emitCompanionReply(targetWebContents, result);
    }

    return {
        success: true,
        dashboard,
        familySummary: result.familySummary,
        analyzerResult: result.analyzerResult,
        contextPacket: result.contextPacket,
        profileUpdateResult: result.profileUpdateResult,
        analysisMemoryWriteResult: result.analysisMemoryWriteResult,
        companionMemoryWriteResult: result.companionMemoryWriteResult,
        memoryWriteResult: result.memoryWriteResult,
        userMessage: result.userMessage,
        assistantMessage: result.assistantMessage,
    };
}

async function createOrFocusWindow(options = {}) {
    const nextGroupId = await resolveGroupId(options.groupId);
    currentWindowGroupId = nextGroupId;
    if (guiWindow && !guiWindow.isDestroyed()) {
        if (contextGroupId !== nextGroupId) {
            contextPromise = null;
            contextGroupId = null;
            await guiWindow.loadFile(path.join(__dirname, 'gui', 'SilverCompanion.html'));
        }
        if (!guiWindow.isVisible()) {
            guiWindow.show();
        }
        guiWindow.focus();
        return guiWindow;
    }

    guiWindow = new BrowserWindow({
        width: 1380,
        height: 920,
        minWidth: 1180,
        minHeight: 760,
        title: 'Silver Companion',
        frame: false,
        ...(process.platform === 'darwin' ? {} : { titleBarStyle: 'hidden' }),
        backgroundColor: '#f5f0e8',
        webPreferences: {
            preload: path.join(__dirname, 'gui', 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            spellcheck: false,
        },
        show: false,
    });

    guiWindow.setMenu(null);
    guiWindow.webContents.on('did-finish-load', () => {
        appendSilverLog('window did-finish-load');
    });
    guiWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
        appendSilverLog(`window did-fail-load code=${errorCode} desc=${errorDescription} url=${validatedURL}`);
    });
    guiWindow.webContents.on('render-process-gone', (_event, details) => {
        appendSilverLog(`window render-process-gone ${JSON.stringify(details)}`);
    });
    guiWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
        if (level <= 2) {
            appendSilverLog(`renderer console level=${level} line=${line} source=${sourceId} message=${message}`);
        }
    });

    await guiWindow.loadFile(path.join(__dirname, 'gui', 'SilverCompanion.html'));
    ensureScheduledAnalysis();
    guiWindow.once('ready-to-show', () => {
        if (guiWindow && !guiWindow.isDestroyed()) {
            guiWindow.show();
        }
    });

    guiWindow.on('closed', () => {
        appendSilverLog('window closed');
        const currentWindow = guiWindow;
        guiWindow = null;
        stopScheduledAnalysis();
        currentVoiceSession = { senderId: null, latestTranscript: '' };
        getContext()
            .then((context) => context.voiceBridgeService.cleanup())
            .catch(() => {});
        const webContents = getWindowWebContents(currentWindow);
        if (webContents) {
            sendToWindow(webContents, CHANNELS.ttsStop, {});
        }
    });

    return guiWindow;
}

function registerIpcHandlers() {
    if (ipcRegistered) {
        return;
    }

    ipcMain.handle(CHANNELS.getBootstrap, async () => {
        const context = await getContext(currentWindowGroupId);
        const bootstrap = await context.dashboardAssembler.getBootstrap();
        return {
            success: true,
            data: {
                ...bootstrap,
                readOnlyChat: true,
                boundGroup: {
                    groupId: context.groupId,
                    topicId: context.topicId,
                    name: context.groupConfig.name,
                },
            },
        };
    });

    ipcMain.handle(CHANNELS.getDashboard, async (_event, range = 'daily') => {
        const context = await getContext(currentWindowGroupId);
        return { success: true, data: await context.dashboardAssembler.getDashboard(range) };
    });

    ipcMain.handle(CHANNELS.getHealthTimeline, async (_event, metric, range = '24h') => {
        const context = await getContext(currentWindowGroupId);
        return { success: true, data: await context.healthService.getMetricTimeline(metric, range) };
    });

    ipcMain.handle(CHANNELS.sendMessage, async (event, payload) => handleMessageRequest(payload, event.sender));

    ipcMain.handle(CHANNELS.startVoiceInput, async (event) => {
        const context = await getContext(currentWindowGroupId);
        if (currentVoiceSession.senderId && currentVoiceSession.senderId !== event.sender.id) {
            return { success: false, error: 'voice_input_busy' };
        }

        try {
            currentVoiceSession = {
                senderId: event.sender.id,
                latestTranscript: '',
            };

            await context.voiceBridgeService.startVoiceInput((text) => {
                currentVoiceSession.latestTranscript = text;
                sendToWindow(event.sender, CHANNELS.voiceTranscript, {
                    text,
                    updatedAt: new Date().toISOString(),
                });
            });
        } catch (error) {
            currentVoiceSession = { senderId: null, latestTranscript: '' };
            throw error;
        }

        return { success: true };
    });

    ipcMain.handle(CHANNELS.stopVoiceInput, async (event) => {
        const context = await getContext(currentWindowGroupId);
        await context.voiceBridgeService.stopVoiceInput();

        const transcript = String(currentVoiceSession.latestTranscript || '').trim();
        currentVoiceSession = { senderId: null, latestTranscript: '' };

        if (!transcript) {
            return { success: false, error: 'no_transcript' };
        }

        await handleMessageRequest({ text: transcript, channel: 'voice' }, event.sender);
        return { success: true, transcript };
    });

    ipcMain.handle(CHANNELS.stopReplyAudio, async (event) => {
        const context = await getContext(currentWindowGroupId);
        context.voiceBridgeService.stopReplyAudio();
        sendToWindow(event.sender, CHANNELS.ttsStop, {});
        return { success: true };
    });

    ipcMain.handle(CHANNELS.getFamilySummary, async (_event, range = 'daily') => {
        const context = await getContext(currentWindowGroupId);
        const dashboard = await context.dashboardAssembler.getDashboard(range);
        return { success: true, data: dashboard.familySummary };
    });

    ipcMain.handle(CHANNELS.simulateEvent, async (_event, payload) => {
        const context = await getContext(currentWindowGroupId);
        const result = await context.mockScenarioService.applyEvent(payload);
        return { success: true, data: result };
    });

    ipcMain.handle(CHANNELS.resetMockState, async () => {
        const context = await getContext(currentWindowGroupId);
        const result = await context.mockScenarioService.restoreBaseline();
        return { success: true, data: result };
    });

    ipcMain.handle(CHANNELS.openOpsGroup, async () => {
        const context = await getContext(currentWindowGroupId);
        const windowHandlers = require(path.join(projectRoot, 'modules', 'ipc', 'windowHandlers'));
        return windowHandlers.openSilverCompanionOpsGroup({
            groupId: context.groupId,
            topicId: context.topicId,
        });
    });

    ipcMain.handle('silver-companion:run-scheduled-analysis', async () => {
        return { success: true, data: await buildScheduledAnalysisPayload() };
    });

    ipcRegistered = true;
}

function registerRoutes(app, _pluginConfig, projectBasePath) {
    if (routesRegistered) {
        return;
    }

    projectRoot = resolveProjectRoot(projectBasePath);
    contextPromise = null;
    registerIpcHandlers();

    const wrap = (handler) => async (req, res) => {
        try {
            const data = await handler(req, res);
            if (!res.headersSent) {
                res.json({ success: true, data });
            }
        } catch (error) {
            if (!res.headersSent) {
                res.status(500).json({ success: false, error: error.message });
            }
        }
    };

    app.get('/admin_api/silver-companion/bootstrap', wrap(async (req) => {
        const context = await getContext(req.query.groupId);
        const bootstrap = await context.dashboardAssembler.getBootstrap();
        return {
            ...bootstrap,
            readOnlyChat: true,
            boundGroup: {
                groupId: context.groupId,
                topicId: context.topicId,
                name: context.groupConfig.name,
            },
        };
    }));

    app.get('/admin_api/silver-companion/dashboard', wrap(async (req) => {
        const context = await getContext(req.query.groupId);
        return context.dashboardAssembler.getDashboard(req.query.range || 'daily');
    }));

    app.get('/admin_api/silver-companion/health/:metric', wrap(async (req) => {
        const context = await getContext(req.query.groupId);
        return context.healthService.getMetricTimeline(req.params.metric, req.query.range || '24h');
    }));

    app.get('/admin_api/silver-companion/family-summary', wrap(async (req) => {
        const context = await getContext(req.query.groupId);
        const dashboard = await context.dashboardAssembler.getDashboard(req.query.range || 'daily');
        return dashboard.familySummary;
    }));

    app.post('/admin_api/silver-companion/message', wrap(async (req) => {
        return handleMessageRequest(req.body || {});
    }));

    app.post('/admin_api/silver-companion/simulate', wrap(async (req) => {
        const context = await getContext(req.body?.groupId);
        return context.mockScenarioService.applyEvent(req.body || {});
    }));

    app.post('/admin_api/silver-companion/reset', wrap(async (req) => {
        const context = await getContext(req.body?.groupId);
        const result = await context.mockScenarioService.restoreBaseline();
        return { restored: true, baseline: result };
    }));

    routesRegistered = true;
}

async function processToolCall(args = {}) {
    projectRoot = resolveProjectRoot(projectRoot);
    registerIpcHandlers();

    const action = args.command || args.action || 'OpenSilverCompanionDashboard';
    const context = await getContext(args.groupId);

    switch (action) {
        case 'OpenSilverCompanionDashboard': {
            await createOrFocusWindow({ groupId: args.groupId });
            return {
                content: [
                    { type: 'text', text: '银发 AI 生活伴侣仪表盘已打开。' },
                ],
            };
        }
        case 'GetSilverCompanionSnapshot': {
            const dashboard = await context.dashboardAssembler.getDashboard(args.range || 'daily');
            return {
                content: [
                    { type: 'text', text: buildDashboardSummaryMarkdown(dashboard) },
                ],
            };
        }
        case 'GenerateSilverCompanionSummary': {
            const dashboard = await context.dashboardAssembler.getDashboard(args.range || 'daily');
            return {
                content: [
                    {
                        type: 'text',
                        text: [
                            `# 家属摘要`,
                            '',
                            `- 结论: ${dashboard.familySummary.headline}`,
                            '',
                            '## 关键事件',
                            ...dashboard.familySummary.keyEvents.map((item) => `- ${item}`),
                            '',
                            '## 建议动作',
                            ...dashboard.familySummary.recommendedActions.map((item) => `- ${item}`),
                        ].join('\n'),
                    },
                ],
            };
        }
        case 'SimulateSilverCompanionEvent': {
            const result = await context.mockScenarioService.applyEvent({
                type: args.eventType || args.type || 'combined',
            });
            return {
                content: [
                    { type: 'text', text: `模拟事件已执行：${result.type}` },
                ],
            };
        }
        case 'ResetSilverCompanionState': {
            await context.store.reset();
            return {
                content: [
                    { type: 'text', text: '银发 AI 生活伴侣状态已重置为默认演示数据。' },
                ],
            };
        }
        case 'OpenSilverCompanionOpsGroup': {
            const result = await context.groupBridgeService.openOpsGroup();
            if (result && result.success) {
                return {
                    content: [
                        { type: 'text', text: '银发伴侣协作群已打开。' },
                    ],
                };
            }
            throw new Error(result && result.error ? result.error : '打开银发伴侣协作群失败');
        }
        default:
            throw new Error(`Unknown SilverCompanion command: ${action}`);
    }
}

async function cleanup() {
    currentVoiceSession = { senderId: null, latestTranscript: '' };

    if (guiWindow && !guiWindow.isDestroyed()) {
        guiWindow.close();
        guiWindow = null;
    }

    if (contextPromise) {
        try {
            const context = await contextPromise;
            stopScheduledAnalysis();
            await context.voiceBridgeService.cleanup();
        } catch (_error) {
            // Ignore cleanup failures on shutdown.
        }
    }
}

module.exports = {
    processToolCall,
    registerRoutes,
    cleanup,
};
