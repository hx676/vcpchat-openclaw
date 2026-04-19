// modules/ipc/groupChatHandlers.js
const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const groupChat = require('../../Groupmodules/groupchat');

let silverCompanionSessionManager = null;

function getSilverCompanionSessionManager(projectRoot) {
    if (!silverCompanionSessionManager) {
        const SilverCompanionSessionManager = require(path.join(projectRoot, 'VCPDistributedServer', 'Plugin', 'SilverCompanion', 'src', 'services', 'silverCompanionSessionManager'));
        silverCompanionSessionManager = new SilverCompanionSessionManager({ projectRoot });
    }
    return silverCompanionSessionManager;
}

/**
 * Initializes group chat related IPC handlers.
 * @param {BrowserWindow} mainWindow The main window instance.
 * @param {object} context - An object containing necessary context.
 * @param {string} context.AGENT_DIR - The path to the agents directory.
 * @param {string} context.USER_DATA_DIR - The path to the user data directory.
 * @param {function} context.getSelectionListenerStatus - Function to get the current status of the selection listener.
 * @param {function} context.stopSelectionListener - Function to stop the selection listener.
 * @param {function} context.startSelectionListener - Function to start the selection listener.
 */
let ipcHandlersRegistered = false;

function initialize(mainWindow, context) {
    const { AGENT_DIR, USER_DATA_DIR, APP_DATA_ROOT_IN_PROJECT, PROJECT_ROOT, getSelectionListenerStatus, stopSelectionListener, startSelectionListener, fileWatcher } = context;

    if (ipcHandlersRegistered) {
        return;
    }

    // Helper function to get agent config, needed by multiple handlers
    const readJsonWithBomTolerance = async (filePath) => {
        const rawContent = await fs.readFile(filePath, 'utf8');
        const content = rawContent.charCodeAt(0) === 0xFEFF ? rawContent.slice(1) : rawContent;
        return JSON.parse(content);
    };

    const getAgentConfigById = async (agentId) => {
        const agentDir = path.join(AGENT_DIR, agentId);
        const configPath = path.join(agentDir, 'config.json');
        if (await fs.pathExists(configPath)) {
            const config = await readJsonWithBomTolerance(configPath);
            // Construct avatarUrl by checking for file existence, which is more robust
            const avatarPathPng = path.join(agentDir, 'avatar.png');
            const avatarPathJpg = path.join(agentDir, 'avatar.jpg');
            const avatarPathJpeg = path.join(agentDir, 'avatar.jpeg');
            const avatarPathGif = path.join(agentDir, 'avatar.gif');
            config.avatarUrl = null;
            if (await fs.pathExists(avatarPathPng)) {
                config.avatarUrl = `file://${avatarPathPng}?t=${Date.now()}`;
            } else if (await fs.pathExists(avatarPathJpg)) {
                config.avatarUrl = `file://${avatarPathJpg}?t=${Date.now()}`;
            } else if (await fs.pathExists(avatarPathJpeg)) {
                config.avatarUrl = `file://${avatarPathJpeg}?t=${Date.now()}`;
            } else if (await fs.pathExists(avatarPathGif)) {
                config.avatarUrl = `file://${avatarPathGif}?t=${Date.now()}`;
            }
            config.id = agentId; // Ensure ID is part of the returned config
            return config;
        }
        return { error: `Agent config for ${agentId} not found.` };
    };

    // --- Group Chat IPC Handlers ---
    ipcMain.handle('create-agent-group', async (event, groupName, initialConfig) => {
        return await groupChat.createAgentGroup(groupName, initialConfig);
    });

    ipcMain.handle('create-silver-companion-group', async (_event, payload = {}) => {
        const sessionManager = getSilverCompanionSessionManager(PROJECT_ROOT);
        return sessionManager.createSilverCompanionGroup(payload);
    });
    
    ipcMain.handle('get-agent-groups', async () => {
        return await groupChat.getAgentGroups();
    });
    
    ipcMain.handle('get-agent-group-config', async (event, groupId) => {
        return await groupChat.getAgentGroupConfig(groupId);
    });
    
    ipcMain.handle('save-agent-group-config', async (event, groupId, configData) => {
        return await groupChat.saveAgentGroupConfig(groupId, configData);
    });
    
    ipcMain.handle('delete-agent-group', async (event, groupId) => {
        return await groupChat.deleteAgentGroup(groupId);
    });
    
    ipcMain.handle('save-agent-group-avatar', async (event, groupId, avatarData) => {
        const listenerWasActive = getSelectionListenerStatus();
        if (listenerWasActive) {
            stopSelectionListener();
            console.log('[Main] Temporarily stopped selection listener for group avatar dialog.');
        }
        try {
            const result = await groupChat.saveAgentGroupAvatar(groupId, avatarData);
            return result;
        } finally {
            if (listenerWasActive) {
                startSelectionListener();
                console.log('[Main] Restarted selection listener after group avatar dialog.');
            }
        }
    });
    
    ipcMain.handle('get-group-topics', async (event, groupId, searchTerm) => {
        return await groupChat.getGroupTopics(groupId, searchTerm);
    });
    
    ipcMain.handle('create-new-topic-for-group', async (event, groupId, topicName) => {
        return await groupChat.createNewTopicForGroup(groupId, topicName);
    });
    
    ipcMain.handle('delete-group-topic', async (event, groupId, topicId) => {
        return await groupChat.deleteGroupTopic(groupId, topicId);
    });
    
    ipcMain.handle('save-group-topic-title', async (event, groupId, topicId, newTitle) => {
        return await groupChat.saveGroupTopicTitle(groupId, topicId, newTitle);
    });
    
    ipcMain.handle('get-group-chat-history', async (event, groupId, topicId) => {
        return await groupChat.getGroupChatHistory(groupId, topicId);
    });
    
    ipcMain.handle('save-group-chat-history', async (event, groupId, topicId, history) => {
        if (!groupId || !topicId || !Array.isArray(history)) {
            const errorMsg = `保存群组 ${groupId} 话题 ${topicId} 聊天历史失败: 参数无效。`;
            console.error(errorMsg);
            return { success: false, error: errorMsg };
        }
        try {
            if (fileWatcher) {
                fileWatcher.signalInternalSave();
            }
            const result = await groupChat.saveGroupChatHistory(groupId, topicId, history);
            if (result.success) {
                console.log(`[Main IPC] 群组 ${groupId} 话题 ${topicId} 聊天历史已保存到 ${result.historyFile}`);
            }
            return result;
        } catch (error) {
            console.error(`[Main IPC] 保存群组 ${groupId} 话题 ${topicId} 聊天历史失败:`, error);
            return { success: false, error: error.message };
        }
    });
    
    ipcMain.handle('send-group-chat-message', async (event, groupId, topicId, userMessage) => {
        // The actual VCP call and streaming will be handled within groupChat.handleGroupChatMessage
        // It needs a way to send stream chunks back to the renderer.
        // We'll pass a function to groupChat.handleGroupChatMessage that uses event.sender.send
        console.log(`[Main IPC] Received send-group-chat-message for Group: ${groupId}, Topic: ${topicId}`);
        try {
            const sendStreamChunkToRenderer = (data) => { // Channel is now fixed
                if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
                    mainWindow.webContents.send('vcp-stream-event', data);
                }
            };

            const groupConfig = await groupChat.getAgentGroupConfig(groupId);
            if (groupConfig && (groupConfig.silverCompanionManaged === true || groupConfig.mode === 'silver_companion_managed')) {
                const sessionManager = getSilverCompanionSessionManager(PROJECT_ROOT);
                await sessionManager.handleManagedGroupMessage({
                    groupId,
                    topicId,
                    userMessage,
                    sendStreamChunkToRenderer,
                });
                return { success: true, managed: true, message: 'SilverCompanion managed group message handled.' };
            }
    
            // Await the group chat handler to ensure any errors within it are caught by this try...catch block.
            await groupChat.handleGroupChatMessage(groupId, topicId, userMessage, sendStreamChunkToRenderer, getAgentConfigById);
            
            return { success: true, message: "Group chat message processing started and completed." };
        } catch (error) {
            console.error(`[Main IPC] Error in send-group-chat-message handler for Group ${groupId}:`, error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('inviteAgentToSpeak', async (event, groupId, topicId, invitedAgentId) => {
        console.log(`[Main IPC] Received inviteAgentToSpeak for Group: ${groupId}, Topic: ${topicId}, Agent: ${invitedAgentId}`);
        try {
            const sendStreamChunkToRenderer = (data) => { // Channel is now fixed
                if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
                    mainWindow.webContents.send('vcp-stream-event', data);
                }
            };

            await groupChat.handleInviteAgentToSpeak(groupId, topicId, invitedAgentId, sendStreamChunkToRenderer, getAgentConfigById);
            return { success: true, message: "Agent invitation processing started." };
        } catch (error) {
            console.error(`[Main IPC] Error in inviteAgentToSpeak handler for Group ${groupId}, Agent ${invitedAgentId}:`, error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('redo-group-chat-message', async (event, groupId, topicId, messageId, agentId) => {
        console.log(`[Main IPC] Received redo-group-chat-message for Group: ${groupId}, Topic: ${topicId}, Message: ${messageId}, Agent: ${agentId}`);
        try {
            const sendStreamChunkToRenderer = (data) => {
                if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
                    mainWindow.webContents.send('vcp-stream-event', data);
                }
            };

            // This new function will be created in groupchat.js
            await groupChat.redoGroupChatMessage(groupId, topicId, messageId, agentId, sendStreamChunkToRenderer, getAgentConfigById);
            
            return { success: true, message: "Redo group chat message processing started." };
        } catch (error) {
            console.error(`[Main IPC] Error in redo-group-chat-message handler for Group ${groupId}, Message ${messageId}:`, error);
            return { success: false, error: error.message };
        }
    });

    ipcHandlersRegistered = true;
}

module.exports = {
    initialize,
    getSilverCompanionSessionManager,
};
