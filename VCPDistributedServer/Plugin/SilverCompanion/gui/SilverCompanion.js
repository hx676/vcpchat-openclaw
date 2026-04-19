const api = window.silverCompanion;
const appModules = window.SilverCompanionApp || {};
const utils = appModules.utils;
const navigation = appModules.navigation;
const headerSection = appModules.headerSection;
const homeSection = appModules.homeSection;
const profileSection = appModules.profileSection;
const dashboardSection = appModules.dashboardSection;
const moodSection = appModules.moodSection;
const healthSection = appModules.healthSection;
const safeCircleSection = appModules.safeCircleSection;
const audioPlayer = appModules.audioPlayer;

const state = {
    bootstrap: null,
    dashboard: null,
    activeRange: '24h',
    activeSection: 'home',
    latestTranscript: '',
    isRecording: false,
    currentAudio: null,
};

function applyReadOnlyChatMode() {
    const input = utils.$('messageInput');
    input.value = '';
    input.disabled = true;
    input.placeholder = '聊天主入口已切换到老人群，这里只展示最近对话。';
    utils.$('sendTextBtn').disabled = true;
    utils.$('startVoiceBtn').disabled = true;
    utils.$('stopVoiceBtn').disabled = true;
    setVoiceStatus('请回到老人群继续聊天');
    utils.$('transcriptText').textContent = '当前资料页为只读模式，请在老人群里使用文本或语音聊天。';
}

function setVoiceStatus(text) {
    utils.$('voiceStatus').textContent = text;
}

async function renderAll() {
    if (!state.dashboard) return;

    navigation.renderNavigation(state.activeSection);
    headerSection.renderHeader(state.dashboard, state.activeSection);
    homeSection.renderHome(state.dashboard);
    profileSection.renderProfile(state.dashboard);
    dashboardSection.renderDashboard(state.bootstrap, state.dashboard);
    moodSection.renderMood(state.dashboard);
    safeCircleSection.renderSafeCircle(state.dashboard);

    try {
        await healthSection.renderHealth(api, state.dashboard, state.activeRange);
    } catch (error) {
        utils.$('healthCharts').innerHTML = `<div class="chart-card status-danger">${utils.escapeHtml(error.message)}</div>`;
    }
}

async function refreshDashboard(range) {
    const dashboard = utils.unwrap(await api.getDashboard(range || 'daily'), '刷新看板失败');
    state.dashboard = dashboard;
    await renderAll();
}

async function refreshData() {
    const refreshBtn = utils.$('refreshDataBtn');
    const originalText = refreshBtn ? refreshBtn.textContent : '刷新数据';

    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.textContent = '刷新中...';
    }

    try {
        await api.runScheduledAnalysis().catch(() => null);
        await refreshDashboard('daily');
        utils.$('simStatus').textContent = '已手动刷新当前老人群数据。';
    } finally {
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.textContent = originalText;
        }
    }
}

async function sendTextMessage() {
    if (state.bootstrap && state.bootstrap.readOnlyChat === true) return;
    const input = utils.$('messageInput');
    const text = input.value.trim();
    if (!text) return;

    setVoiceStatus('正在生成陪伴回复');
    input.value = '';
    await api.sendCompanionMessage({ text, channel: 'text' });
}

async function startVoice() {
    if (state.bootstrap && state.bootstrap.readOnlyChat === true) return;
    utils.unwrap(await api.startVoiceInput(), '启动语音失败');
    state.isRecording = true;
    state.latestTranscript = '';
    utils.$('transcriptText').textContent = '正在监听语音，请自然说话。';
    setVoiceStatus('语音录入中');
    utils.$('startVoiceBtn').disabled = true;
    utils.$('stopVoiceBtn').disabled = false;
}

async function stopVoice() {
    if (state.bootstrap && state.bootstrap.readOnlyChat === true) return;
    const result = await api.stopVoiceInput();
    state.isRecording = false;
    utils.$('startVoiceBtn').disabled = false;
    utils.$('stopVoiceBtn').disabled = true;

    if (!result || result.success === false) {
        setVoiceStatus('未收到有效转写');
        return;
    }

    setVoiceStatus('正在生成语音回复');
}

async function simulate(type) {
    await api.simulateEvent({ type });
    utils.$('simStatus').textContent = `已注入模拟事件：${type}`;
    await refreshDashboard('daily');
}

async function resetBaseline() {
    await api.resetMockState();
    utils.$('simStatus').textContent = '已恢复健康与情绪基线，聊天记录和记忆已保留。';
    await refreshDashboard('daily');
}

async function openOpsGroup() {
    const result = await api.openOpsGroup();
    if (!result || result.success === false) {
        throw new Error(result && result.error ? result.error : '返回群聊失败');
    }
    utils.$('simStatus').textContent = '已返回当前老人群，可在主聊天窗口继续聊天。';
}

function bindSectionTabs() {
    document.querySelectorAll('.section-tab').forEach((button) => {
        button.addEventListener('click', () => {
            state.activeSection = button.dataset.section;
            navigation.renderNavigation(state.activeSection);
            headerSection.renderHeader(state.dashboard, state.activeSection);
        });
    });
}

function bindHeaderButtons() {
    utils.$('minimizeBtn').addEventListener('click', () => api.minimizeWindow());
    utils.$('maximizeBtn').addEventListener('click', () => api.maximizeWindow());
    utils.$('closeBtn').addEventListener('click', () => api.closeWindow());
    utils.$('refreshDataBtn').addEventListener('click', () => {
        refreshData().catch((error) => {
            utils.$('simStatus').textContent = error.message;
        });
    });
}

function bindCompanionActions() {
    utils.$('sendTextBtn').addEventListener('click', () => {
        sendTextMessage().catch((error) => {
            setVoiceStatus(error.message);
        });
    });

    utils.$('messageInput').addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendTextMessage().catch((error) => {
                setVoiceStatus(error.message);
            });
        }
    });

    utils.$('startVoiceBtn').addEventListener('click', () => {
        startVoice().catch((error) => {
            setVoiceStatus(error.message);
        });
    });

    utils.$('stopVoiceBtn').addEventListener('click', () => {
        stopVoice().catch((error) => {
            setVoiceStatus(error.message);
        });
    });

    utils.$('stopAudioBtn').addEventListener('click', async () => {
        audioPlayer.stopCurrentAudio(state);
        await api.stopReplyAudio();
        setVoiceStatus(state.isRecording ? '语音录入中' : '文本待机');
    });
}

function bindSimulationActions() {
    utils.$('resetScenarioBtn').addEventListener('click', () => {
        resetBaseline().catch((error) => {
            utils.$('simStatus').textContent = error.message;
        });
    });

    document.addEventListener('click', (event) => {
        const simButton = event.target.closest('[data-sim-type]');
        if (simButton) {
            simulate(simButton.dataset.simType).catch((error) => {
                utils.$('simStatus').textContent = error.message;
            });
        }

        const rangeButton = event.target.closest('.range-btn');
        if (rangeButton) {
            document.querySelectorAll('.range-btn').forEach((button) => button.classList.remove('active'));
            rangeButton.classList.add('active');
            state.activeRange = rangeButton.dataset.range;
            healthSection.renderHealth(api, state.dashboard, state.activeRange).catch((error) => {
                utils.$('healthCharts').innerHTML = `<div class="chart-card status-danger">${utils.escapeHtml(error.message)}</div>`;
            });
        }
    });
}

function bindOpsGroupAction() {
    const openOpsGroupBtn = utils.$('openOpsGroupBtn');
    if (!openOpsGroupBtn) return;

    openOpsGroupBtn.addEventListener('click', () => {
        openOpsGroup().catch((error) => {
            utils.$('simStatus').textContent = error.message;
        });
    });
}

function registerSubscriptions() {
    api.onVoiceTranscript((payload) => {
        state.latestTranscript = payload && payload.text ? payload.text : '';
        utils.$('transcriptText').textContent = state.latestTranscript || '正在等待更清晰的转写结果。';
    });

    api.onCompanionReply((payload) => {
        if (payload && payload.dashboard) {
            state.dashboard = payload.dashboard;
            renderAll().catch((error) => {
                utils.$('heroSubtitle').textContent = error.message;
            });
        }

        if (payload && payload.assistantMessage && payload.assistantMessage.text) {
            setVoiceStatus('已收到陪伴回复');
        }

        audioPlayer.playReplyAudio(payload ? payload.audio : null, state, setVoiceStatus);
    });

    api.onAnalysisUpdated((payload) => {
        if (payload && payload.dashboard) {
            state.dashboard = payload.dashboard;
            renderAll().catch((error) => {
                utils.$('heroSubtitle').textContent = error.message;
            });
        }
    });

    api.onTtsStop(() => {
        audioPlayer.stopCurrentAudio(state);
        setVoiceStatus(state.isRecording ? '语音录入中' : '文本待机');
    });
}

function registerGlobalErrorHandlers() {
    window.addEventListener('error', (event) => {
        const message = event && event.error && event.error.message
            ? event.error.message
            : (event && event.message) || 'SilverCompanion 前端发生错误';
        if (utils.$('heroRisk')) utils.$('heroRisk').textContent = '运行异常';
        if (utils.$('heroSubtitle')) utils.$('heroSubtitle').textContent = message;
        if (utils.$('voiceStatus')) utils.$('voiceStatus').textContent = message;
        console.error('[SilverCompanion Renderer Error]', event && event.error ? event.error : event);
    });

    window.addEventListener('unhandledrejection', (event) => {
        const reason = event && event.reason && event.reason.message
            ? event.reason.message
            : String((event && event.reason) || 'SilverCompanion 前端 Promise 异常');
        if (utils.$('heroRisk')) utils.$('heroRisk').textContent = 'Promise 异常';
        if (utils.$('heroSubtitle')) utils.$('heroSubtitle').textContent = reason;
        if (utils.$('voiceStatus')) utils.$('voiceStatus').textContent = reason;
        console.error('[SilverCompanion Renderer Rejection]', event && event.reason ? event.reason : event);
    });
}

async function initialize() {
    bindSectionTabs();
    bindHeaderButtons();
    bindCompanionActions();
    bindSimulationActions();
    bindOpsGroupAction();
    registerSubscriptions();

    const bootstrap = utils.unwrap(await api.getBootstrap(), '初始化 SilverCompanion 失败');
    state.bootstrap = bootstrap;
    state.dashboard = bootstrap.dashboard;
    utils.setTheme(bootstrap.themeMode);
    if (bootstrap.readOnlyChat === true) {
        applyReadOnlyChatMode();
    }
    await renderAll();
}

registerGlobalErrorHandlers();

document.addEventListener('DOMContentLoaded', () => {
    initialize().catch((error) => {
        utils.$('heroRisk').textContent = '初始化失败';
        utils.$('heroTitle').textContent = 'Silver Companion';
        utils.$('heroSubtitle').textContent = error.message;
    });
});
