const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('silverCompanion', {
    getBootstrap: () => ipcRenderer.invoke('silver-companion:get-bootstrap'),
    getDashboard: (range) => ipcRenderer.invoke('silver-companion:get-dashboard', range),
    getHealthTimeline: (metric, range) => ipcRenderer.invoke('silver-companion:get-health-timeline', metric, range),
    sendCompanionMessage: (payload) => ipcRenderer.invoke('silver-companion:send-message', payload),
    startVoiceInput: () => ipcRenderer.invoke('silver-companion:start-voice-input'),
    stopVoiceInput: () => ipcRenderer.invoke('silver-companion:stop-voice-input'),
    stopReplyAudio: () => ipcRenderer.invoke('silver-companion:stop-reply-audio'),
    getFamilySummary: (range) => ipcRenderer.invoke('silver-companion:get-family-summary', range),
    simulateEvent: (event) => ipcRenderer.invoke('silver-companion:simulate-event', event),
    resetMockState: () => ipcRenderer.invoke('silver-companion:reset-mock-state'),
    runScheduledAnalysis: () => ipcRenderer.invoke('silver-companion:run-scheduled-analysis'),
    openOpsGroup: () => ipcRenderer.invoke('silver-companion:open-ops-group'),
    onVoiceTranscript: (callback) => subscribe('silver-companion:voice-transcript', callback),
    onCompanionReply: (callback) => subscribe('silver-companion:companion-reply', callback),
    onAnalysisUpdated: (callback) => subscribe('silver-companion:analysis-updated', callback),
    onTtsStop: (callback) => subscribe('silver-companion:tts-stop', callback),
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    maximizeWindow: () => ipcRenderer.send('maximize-window'),
    closeWindow: () => ipcRenderer.send('close-window'),
});
