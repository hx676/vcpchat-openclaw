// modules/chatManager.js

window.chatManager = (() => {
    // --- Private Variables ---
    let electronAPI;
    let uiHelper;
    let messageRenderer;
    let itemListManager;
    let topicListManager;
    let groupRenderer;

    // References to state in renderer.js
    let currentSelectedItemRef;
    let currentTopicIdRef;
    let currentChatHistoryRef;
    let attachedFilesRef;
    let globalSettingsRef;

    // DOM Elements from renderer.js
    let elements = {};
    
    // Functions from main renderer
    let mainRendererFunctions = {};
    let isCanvasWindowOpen = false; // State to track if the canvas window is open
    let lastAssistantSuspendAt = 0;
    let activeHistoryLoadToken = 0;

    function setCurrentItemActionButtonText(button, text) {
        if (!button) return;
        const label = button.querySelector('.button-label');
        if (label) {
            label.textContent = text;
            return;
        }
        button.textContent = text;
    }



    /**
     * 鎼存梻鏁ら崡鏇氶嚋濮濓絽鍨憴鍕灟閸掔増鏋冮張?
     * @param {string} text - 鏉堟挸鍙嗛弬鍥ㄦ拱
     * @param {Object} rule - 濮濓絽鍨憴鍕灟鐎电钖?
     * @returns {string} 婢跺嫮鎮婇崥搴ｆ畱閺傚洦婀?
     */
    function applyRegexRule(text, rule) {
        if (!rule || !rule.findPattern || typeof text !== 'string') {
            return text;
        }

        try {
            // 娴ｈ法鏁?uiHelperFunctions.regexFromString 閺夈儴袙閺嬫劖顒滈崚娆掋€冩潏鎯х础
            let regex = null;
            if (window.uiHelperFunctions && window.uiHelperFunctions.regexFromString) {
                regex = window.uiHelperFunctions.regexFromString(rule.findPattern);
            } else {
                // 閸氬骸顦弬瑙勵攳閿涙碍澧滈崝銊ㄐ掗弸?
                const regexMatch = rule.findPattern.match(/^\/(.+?)\/([gimuy]*)$/);
                if (regexMatch) {
                    regex = new RegExp(regexMatch[1], regexMatch[2]);
                } else {
                    regex = new RegExp(rule.findPattern, 'g');
                }
            }
            
            if (!regex) {
                console.error('无法创建正则表达式:', rule.findPattern);
                return text;
            }
            
            // 鎼存梻鏁ら弴鎸庡床閿涘牆顩ч弸婊勭梾閺堝娴涢幑銏犲敶鐎圭櫢绱濋崚娆撶帛鐠併倖娴涢幑顫礋缁屽搫鐡х粭锔胯閿?
            return text.replace(regex, rule.replaceWith || '');
        } catch (error) {
            console.error('应用正则规则时出错:', rule.findPattern, error);
            return text;
        }
    }

    /**
     * 鎼存梻鏁ら幍鈧張澶婂爱闁板秶娈戝锝呭灟鐟欏嫬鍨崚鐗堟瀮閺?
     * @param {string} text - 鏉堟挸鍙嗛弬鍥ㄦ拱
     * @param {Array} rules - 濮濓絽鍨憴鍕灟閺佹壆绮?
     * @param {string} scope - 娴ｆ粎鏁ら崺?('frontend' 閹?'context')
     * @param {string} role - 濞戝牊浼呯憴鎺曞 ('user' 閹?'assistant')
     * @param {number} depth - 濞戝牊浼呭ǎ鍗炲閿? = 閺堚偓閺傜増绉烽幁顖ょ礆
     * @returns {string} 婢跺嫮鎮婇崥搴ｆ畱閺傚洦婀?
     */
    function applyRegexRules(text, rules, scope, role, depth = 0) {
        if (!rules || !Array.isArray(rules) || typeof text !== 'string') {
            return text;
        }

        let processedText = text;
        
        rules.forEach(rule => {
            // 濡偓閺屻儲妲搁崥锕€绨茬拠銉ョ安閻劍顒濈憴鍕灟
            
            // 1. 濡偓閺屻儰缍旈悽銊ョ厵
            const shouldApplyToScope =
                (scope === 'context' && rule.applyToContext) ||
                (scope === 'frontend' && rule.applyToFrontend);
            
            if (!shouldApplyToScope) return;
            
            // 2. 濡偓閺屻儴顫楅懝?
            const shouldApplyToRole = rule.applyToRoles && rule.applyToRoles.includes(role);
            if (!shouldApplyToRole) return;
            
            // 3. 濡偓閺屻儲绻佹惔锔肩礄-1 鐞涖劎銇氶弮鐘绘閸掕绱?
            const minDepthOk = rule.minDepth === undefined || rule.minDepth === -1 || depth >= rule.minDepth;
            const maxDepthOk = rule.maxDepth === undefined || rule.maxDepth === -1 || depth <= rule.maxDepth;
            
            if (!minDepthOk || !maxDepthOk) return;
            
            // 鎼存梻鏁ょ憴鍕灟
            processedText = applyRegexRule(processedText, rule);
        });
        
        return processedText;
    }

    /**
     * Initializes the ChatManager module.
     * @param {object} config - The configuration object.
     */
    function init(config) {
        electronAPI = config.electronAPI;
        uiHelper = config.uiHelper;
        
        // Modules
        messageRenderer = config.modules.messageRenderer;
        itemListManager = config.modules.itemListManager;
        topicListManager = config.modules.topicListManager;
        groupRenderer = config.modules.groupRenderer;

        // State References
        currentSelectedItemRef = config.refs.currentSelectedItemRef;
        currentTopicIdRef = config.refs.currentTopicIdRef;
        currentChatHistoryRef = config.refs.currentChatHistoryRef;
        attachedFilesRef = config.refs.attachedFilesRef;
        globalSettingsRef = config.refs.globalSettingsRef;

        // DOM Elements
        elements = config.elements;
        
        // Main Renderer Functions
        mainRendererFunctions = config.mainRendererFunctions;

        console.log('[ChatManager] Initialized successfully.');

        // Listen for Canvas events
        if (electronAPI) {
            electronAPI.onCanvasContentUpdate(handleCanvasContentUpdate);
            electronAPI.onCanvasWindowClosed(handleCanvasWindowClosed);
        }
    }

    /**
     * Saves the last opened item and topic IDs to the settings file.
     * This is a private helper function.
     */
    function _saveLastOpenState() {
        const currentSelectedItem = currentSelectedItemRef.get();
        const currentTopicId = currentTopicIdRef.get();
        const globalSettings = globalSettingsRef.get();

        if (currentSelectedItem && currentSelectedItem.id) {
            const settingsToSave = {
                ...globalSettings, // Preserve existing settings
                lastOpenItemId: currentSelectedItem.id,
                lastOpenItemType: currentSelectedItem.type,
                lastOpenTopicId: currentTopicId,
            };
            // No need to await, let it save in the background
            electronAPI.saveSettings(settingsToSave).catch(err => {
                console.error('[ChatManager] Failed to save last open state:', err);
            });
        }
    }

    function suspendAssistantListenerForTopicLoad(topicId) {
        if (!topicId || !electronAPI || typeof electronAPI.suspendAssistantListener !== 'function') {
            return;
        }

        const now = Date.now();
        if (now - lastAssistantSuspendAt < 200) {
            return;
        }

        const globalSettings = globalSettingsRef && typeof globalSettingsRef.get === 'function'
            ? globalSettingsRef.get()
            : null;

        if (!globalSettings || globalSettings.assistantEnabled !== true) {
            return;
        }

        lastAssistantSuspendAt = now;
        const durationMs = 800 + Math.floor(Math.random() * 701);
        Promise.resolve(electronAPI.suspendAssistantListener(durationMs)).catch((error) => {
            console.warn('[ChatManager] Failed to suspend assistant listener before topic load:', error);
        });
    }

    function normalizeTopicTitle(topicTitle) {
        if (typeof topicTitle !== 'string') return topicTitle;

        const trimmedTitle = topicTitle.trim();
        if (!trimmedTitle) return trimmedTitle;
        if (trimmedTitle.includes('聊天于')) return trimmedTitle;

        const timeMatch = trimmedTitle.match(/(\d{1,2}:\d{2}:\d{2})/);
        if (trimmedTitle.includes('聊天') && timeMatch) {
            return `聊天于 ${timeMatch[1]}`;
        }

        return trimmedTitle;
    }
 
    // --- Functions moved from renderer.js ---
 
    function displayNoItemSelected() {
        const { currentChatNameH3, chatMessagesDiv, currentItemActionBtn, messageInput, sendMessageBtn, attachFileBtn } = elements;
        const voiceChatBtn = document.getElementById('voiceChatBtn');
        currentChatNameH3.textContent = '请选择一个 Agent 或群组开始聊天';
        chatMessagesDiv.innerHTML = `<div class="message-item system welcome-bubble"><p>欢迎来到 VCPChat。请先从左侧选择一个 Agent 或群组，然后开始对话。</p></div>`;
        currentItemActionBtn.style.display = 'none';
        if (voiceChatBtn) voiceChatBtn.style.display = 'none';
        messageInput.disabled = true;
        sendMessageBtn.disabled = true;
        attachFileBtn.disabled = true;
        if (mainRendererFunctions.displaySettingsForItem) {
            mainRendererFunctions.displaySettingsForItem(); 
        }
        if (topicListManager) topicListManager.loadTopicList();
    }

    async function selectItem(itemId, itemType, itemName, itemAvatarUrl, itemFullConfig) {
        // 韫囧啯绁﹂柨浣圭负濞茬粯妞傞敍灞肩瑝閸忎浇顔忛崚鍥ㄥ床Agent
        if (window.flowlockManager && window.flowlockManager.getState && window.flowlockManager.getState().isActive) {
            if (uiHelper && uiHelper.showToastNotification) {
                uiHelper.showToastNotification('当前存在进行中的 Flowlock 任务，暂时不能切换 Agent。', 'warning');
            }
            console.log('[ChatManager] Blocked agent switch due to active Flowlock');
            return;
        }
        
        // Stop any previous watcher when switching items
        if (electronAPI.watcherStop) {
            await electronAPI.watcherStop();
        }

        const { currentChatNameH3, currentItemActionBtn, messageInput, sendMessageBtn, attachFileBtn } = elements;
        let currentSelectedItem = currentSelectedItemRef.get();
        let currentTopicId = currentTopicIdRef.get();

        if (currentSelectedItem.id === itemId && currentSelectedItem.type === itemType && currentTopicId) {
            console.log(`Item ${itemType} ${itemId} already selected with topic ${currentTopicId}. No change.`);
            return;
        }

        currentSelectedItem = { id: itemId, type: itemType, name: itemName, avatarUrl: itemAvatarUrl, config: itemFullConfig };
        currentSelectedItemRef.set(currentSelectedItem);
        currentTopicIdRef.set(null); // Reset topic
        currentChatHistoryRef.set([]);
        window.updateSendButtonState?.();

        document.querySelectorAll('.topic-list .topic-item.active-topic-glowing').forEach(item => {
            item.classList.remove('active-topic-glowing');
        });

        if (messageRenderer) {
            messageRenderer.setCurrentSelectedItem(currentSelectedItem);
            messageRenderer.setCurrentTopicId(null);
            messageRenderer.setCurrentItemAvatar(itemAvatarUrl);
            messageRenderer.setCurrentItemAvatarColor(itemFullConfig?.avatarCalculatedColor || null);
        }

        if (itemType === 'group' && groupRenderer && typeof groupRenderer.handleSelectGroup === 'function') {
            await groupRenderer.handleSelectGroup(itemId, itemName, itemAvatarUrl, itemFullConfig);
        } else if (itemType === 'agent') {
            if (groupRenderer && typeof groupRenderer.clearInviteAgentButtons === 'function') {
                groupRenderer.clearInviteAgentButtons();
            }
        } else if (itemType === 'channel_mirror') {
            if (groupRenderer && typeof groupRenderer.clearInviteAgentButtons === 'function') {
                groupRenderer.clearInviteAgentButtons();
            }
        }
     
        const voiceChatBtn = document.getElementById('voiceChatBtn');

        const itemTypeLabel = itemType === 'group' ? '（群组）' : '';
        currentChatNameH3.textContent = `${itemName}${itemTypeLabel}`;
        setCurrentItemActionButtonText(currentItemActionBtn, itemType === 'group' ? '新建群话题' : '新建聊天话题');
        currentItemActionBtn.title = `${itemName} - ${itemType === 'group' ? '新建群话题' : '新建聊天话题'}`;
        currentItemActionBtn.style.display = 'inline-flex';
        
        if (voiceChatBtn) {
            voiceChatBtn.style.display = itemType === 'agent' ? 'inline-block' : 'none';
        }
        if (itemType === 'channel_mirror') {
            currentItemActionBtn.style.display = 'none';
        }

        itemListManager.highlightActiveItem(itemId, itemType);
        if(mainRendererFunctions.displaySettingsForItem) mainRendererFunctions.displaySettingsForItem();

        try {
            let topics;
            if (itemType === 'agent') {
                topics = await electronAPI.getAgentTopics(itemId);
            } else if (itemType === 'group') {
                topics = await electronAPI.getGroupTopics(itemId);
            } else if (itemType === 'channel_mirror') {
                topics = await electronAPI.getChannelMirrorTopics(itemId);
            }

            if (topics && !topics.error && topics.length > 0) {
                let topicToLoadId = topics[0].id;
                const rememberedTopicId = localStorage.getItem(`lastActiveTopic_${itemId}_${itemType}`);
                if (rememberedTopicId && topics.some(t => t.id === rememberedTopicId)) {
                    topicToLoadId = rememberedTopicId;
                }
                currentTopicIdRef.set(topicToLoadId);
                if (messageRenderer) messageRenderer.setCurrentTopicId(topicToLoadId);
                await loadChatHistory(itemId, itemType, topicToLoadId);
            } else if (topics && topics.error) {
                console.error(`加载 ${itemType} ${itemId} 的话题列表失败:`, topics.error);
                if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: `加载话题列表失败: ${topics.error}`, timestamp: Date.now() });
                await loadChatHistory(itemId, itemType, null);
            } else {
                if (itemType === 'agent') {
                    const agentConfig = await electronAPI.getAgentConfig(itemId);
                    // 閳跨媴绗?濡偓閺屻儲妲搁崥锕佺箲閸ョ偤鏁婄拠顖氼嚠鐠?
                    if (agentConfig && agentConfig.error) {
                        console.error(`[ChatManager] Failed to get agent config for ${itemId}:`, agentConfig.error);
                        if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: `閸旂姾娴囬崝鈺傚闁板秶鐤嗘径杈Е: ${agentConfig.error}`, timestamp: Date.now() });
                        await loadChatHistory(itemId, itemType, null);
                    } else if (agentConfig && (!agentConfig.topics || agentConfig.topics.length === 0)) {
                        const defaultTopicResult = await electronAPI.createNewTopicForAgent(itemId, '新聊天');
                        if (defaultTopicResult.success) {
                            currentTopicIdRef.set(defaultTopicResult.topicId);
                            if (messageRenderer) messageRenderer.setCurrentTopicId(defaultTopicResult.topicId);
                            await loadChatHistory(itemId, itemType, defaultTopicResult.topicId);
                        } else {
                            if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: `閸掓稑缂撴妯款吇鐠囨繈顣芥径杈Е: ${defaultTopicResult.error}`, timestamp: Date.now() });
                            await loadChatHistory(itemId, itemType, null);
                        }
                    } else {
                         await loadChatHistory(itemId, itemType, null);
                    }
                } else if (itemType === 'group') {
                    const defaultTopicResult = await electronAPI.createNewTopicForGroup(itemId, '新群话题');
                    if (defaultTopicResult.success) {
                        currentTopicIdRef.set(defaultTopicResult.topicId);
                        if (messageRenderer) messageRenderer.setCurrentTopicId(defaultTopicResult.topicId);
                        await loadChatHistory(itemId, itemType, defaultTopicResult.topicId);
                    } else {
                        if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: `閸掓稑缂撴妯款吇缂囥倛浜扮拠婵嬵暯婢惰精瑙? ${defaultTopicResult.error}`, timestamp: Date.now() });
                        await loadChatHistory(itemId, itemType, null);
                    }
                }
            }
        } catch (e) {
            console.error(`选择 ${itemType} ${itemId} 时发生错误:`, e);
            if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: `打开${itemType === 'group' ? '群组' : 'Agent'}失败: ${e.message}`, timestamp: Date.now() });
        }

        const isReadOnlyMirror = itemType === 'channel_mirror';
        messageInput.disabled = isReadOnlyMirror;
        sendMessageBtn.disabled = isReadOnlyMirror;
        attachFileBtn.disabled = isReadOnlyMirror;
        // messageInput.focus();
        if (topicListManager) topicListManager.loadTopicList();
        _saveLastOpenState(); // Save state after selecting an item and its default topic
    }
 
    async function selectTopic(topicId) {
        // 韫囧啯绁﹂柨浣圭负濞茬粯妞傞敍灞肩瑝閸忎浇顔忛崚鍥ㄥ床鐠囨繈顣?
        if (window.flowlockManager && window.flowlockManager.getState && window.flowlockManager.getState().isActive) {
            if (uiHelper && uiHelper.showToastNotification) {
                uiHelper.showToastNotification('当前存在进行中的 Flowlock 任务，暂时不能切换话题。', 'warning');
            }
            console.log('[ChatManager] Blocked topic switch due to active Flowlock');
            return;
        }
        
        let currentTopicId = currentTopicIdRef.get();
        if (currentTopicId === topicId) {
            return;
        }

        const currentSelectedItem = currentSelectedItemRef.get();
        if (!currentSelectedItem || !currentSelectedItem.id || !currentSelectedItem.type) {
            console.warn('[ChatManager] Ignored selectTopic: no active item selected yet.');
            return;
        }

        try {
            currentTopicIdRef.set(topicId);
            if (messageRenderer) messageRenderer.setCurrentTopicId(topicId);

            const agentConfigForWatcher = currentSelectedItem.config || currentSelectedItem;
            if (electronAPI.watcherStart && agentConfigForWatcher?.agentDataPath) {
                const historyFilePath = `${agentConfigForWatcher.agentDataPath}\\topics\\${topicId}\\history.json`;
                await electronAPI.watcherStart(historyFilePath, currentSelectedItem.id, topicId);
            }

            document.querySelectorAll('#topicList .topic-item').forEach(item => {
                const isClickedItem = item.dataset.topicId === topicId && item.dataset.itemId === currentSelectedItem.id;
                item.classList.toggle('active', isClickedItem);
                item.classList.toggle('active-topic-glowing', isClickedItem);
            });

            await loadChatHistory(currentSelectedItem.id, currentSelectedItem.type, topicId);
            localStorage.setItem(`lastActiveTopic_${currentSelectedItem.id}_${currentSelectedItem.type}`, topicId);
            _saveLastOpenState();
        } catch (error) {
            console.error('[ChatManager] Failed to select topic:', error);
            if (messageRenderer) {
                messageRenderer.renderMessage({
                    role: 'system',
                    content: `閹垫挸绱戠拠婵嬵暯婢惰精瑙? ${error.message}`,
                    timestamp: Date.now()
                });
            }
        }
    }

    async function handleTopicDeletion(remainingTopics) {
        let currentSelectedItem = currentSelectedItemRef.get();
        const config = currentSelectedItem.config || currentSelectedItem;
        config.topics = remainingTopics;
        currentSelectedItemRef.set(currentSelectedItem);

        if (remainingTopics && remainingTopics.length > 0) {
            const newSelectedTopic = remainingTopics.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
            await selectItem(currentSelectedItem.id, currentSelectedItem.type, currentSelectedItem.name, currentSelectedItem.avatarUrl, (currentSelectedItem.config || currentSelectedItem));
            await loadChatHistory(currentSelectedItem.id, currentSelectedItem.type, newSelectedTopic.id);
            currentTopicIdRef.set(newSelectedTopic.id);
            if (messageRenderer) messageRenderer.setCurrentTopicId(newSelectedTopic.id);
        } else {
            currentTopicIdRef.set(null);
            if (messageRenderer) {
                messageRenderer.setCurrentTopicId(null);
                messageRenderer.clearChat();
                messageRenderer.renderMessage({ role: 'system', content: '当前没有可用话题，请新建一个话题开始聊天。', timestamp: Date.now() });
            }
            await displayTopicTimestampBubble(currentSelectedItem.id, currentSelectedItem.type, null);
        }
    }

    async function loadChatHistory(itemId, itemType, topicId) {
        const loadToken = ++activeHistoryLoadToken;

        const isLoadStillActive = () => loadToken === activeHistoryLoadToken;
        const abortIfStale = () => {
            if (!isLoadStillActive()) {
                console.debug(`[ChatManager] Ignoring stale history load for ${itemType}:${itemId}:${topicId}`);
                return true;
            }
            return false;
        };

        suspendAssistantListenerForTopicLoad(topicId);

        if (messageRenderer) messageRenderer.clearChat();
        currentChatHistoryRef.set([]);
        window.updateSendButtonState?.();
    
    
        document.querySelectorAll('.topic-list .topic-item').forEach(item => {
            const isCurrent = item.dataset.topicId === topicId && item.dataset.itemId === itemId && item.dataset.itemType === itemType;
            item.classList.toggle('active', isCurrent);
            item.classList.toggle('active-topic-glowing', isCurrent);
        });
    
        if (messageRenderer) messageRenderer.setCurrentTopicId(topicId);
        if (abortIfStale()) return;
    
        if (!itemId) {
            const errorMsg = `加载聊天记录失败：缺少${itemType === 'group' ? '群组' : 'Agent'} ID (${itemId}) 配置。`;
            console.error(errorMsg);
            if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: errorMsg, timestamp: Date.now() });
            await displayTopicTimestampBubble(null, null, null);
            return;
        }
    
        if (!topicId) {
            if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: '未找到该话题，请先创建话题或切换到其他话题。', timestamp: Date.now() });
            await displayTopicTimestampBubble(itemId, itemType, null);
            return;
        }
    
        // 閺嶇绺炬穱顔芥暭閿涙矮濞囬悽?await 绾喕绻氶崝鐘烘祰濞戝牊浼呯悮顐ｈ閺?
        if (messageRenderer) {
            await messageRenderer.renderMessage({ role: 'system', name: '系统', content: '正在加载聊天记录...', timestamp: Date.now(), isThinking: true, id: 'loading_history' });
        }
        if (abortIfStale()) {
            if (messageRenderer) messageRenderer.removeMessageById('loading_history');
            return;
        }
    
        let historyResult;
        if (itemType === 'agent') {
            historyResult = await electronAPI.getChatHistory(itemId, topicId);
        } else if (itemType === 'group') {
            historyResult = await electronAPI.getGroupChatHistory(itemId, topicId);
        } else if (itemType === 'channel_mirror') {
            historyResult = await electronAPI.getChannelMirrorHistory(itemId, topicId);
        }

        if (abortIfStale()) {
            if (messageRenderer) messageRenderer.removeMessageById('loading_history');
            return;
        }
    
        const currentSelectedItem = currentSelectedItemRef.get();
        const agentConfigForHistory = currentSelectedItem.config || currentSelectedItem;
        if (electronAPI.watcherStart && agentConfigForHistory?.agentDataPath) {
            const historyFilePath = `${agentConfigForHistory.agentDataPath}\\topics\\${topicId}\\history.json`;
            await electronAPI.watcherStart(historyFilePath, itemId, topicId);
        }

        if (abortIfStale()) {
            if (messageRenderer) messageRenderer.removeMessageById('loading_history');
            return;
        }
    
        if (messageRenderer) messageRenderer.removeMessageById('loading_history');
    
        await displayTopicTimestampBubble(itemId, itemType, topicId);
        if (abortIfStale()) return;
    
        if (historyResult && historyResult.error) {
            if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: `加载话题 "${topicId}" 的聊天记录失败: ${historyResult.error}`, timestamp: Date.now() });
        } else if (historyResult && historyResult.length > 0) {
            currentChatHistoryRef.set(historyResult);
            window.updateSendButtonState?.();
            if (messageRenderer) {
                // Render history in batches to keep the UI responsive.
                const renderOptions = {
                    initialBatch: 5,
                    batchSize: 10,
                    batchDelay: 80
                };
                console.log(`[ChatManager] 准备渲染 ${historyResult.length} 条历史消息...`);
                await messageRenderer.renderHistory(historyResult, renderOptions);
                if (abortIfStale()) return;
                console.log('[ChatManager] 历史消息渲染完成。');
            }
    
        } else if (historyResult) { // History is empty
            currentChatHistoryRef.set([]);
            window.updateSendButtonState?.();
        } else {
            if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: '话题 "' + topicId + '" 暂无聊天记录。', timestamp: Date.now() });
        }

        if (abortIfStale()) return;
    
        if (itemId && topicId && !(historyResult && historyResult.error)) {
            localStorage.setItem(`lastActiveTopic_${itemId}_${itemType}`, topicId);
        }
    }

    async function removeAttachmentFromMessage(messageId, attachmentIndex) {
        const currentChatHistory = currentChatHistoryRef.get();
        const currentTopicId = currentTopicIdRef.get();
        const currentSelectedItem = currentSelectedItemRef.get();

        if (!currentChatHistory || !currentTopicId || !currentSelectedItem) {
            console.error('[ChatManager] Cannot remove attachment: missing state.');
            return;
        }

        const messageIndex = currentChatHistory.findIndex(m => m.id === messageId);
        if (messageIndex === -1) {
            console.error('[ChatManager] Message not found in history:', messageId);
            return;
        }

        const message = currentChatHistory[messageIndex];
        if (message.attachments && message.attachments[attachmentIndex]) {
            const attachmentToRemove = message.attachments[attachmentIndex];
            const fileName = attachmentToRemove.name;
            const updatedHistory = JSON.parse(JSON.stringify(currentChatHistory));
            const updatedMessage = updatedHistory[messageIndex];

            updatedMessage.attachments.splice(attachmentIndex, 1);

            if (updatedMessage.content && fileName) {
                const escapedFileName = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const genericRegex = new RegExp(`\\n*\\s*\\[闂勫嫬濮為弬鍥︽: [^\\]]*${escapedFileName}[^\\]]*\\]`, 'g');
                const imageRegex = new RegExp(`\\n*\\s*\\[闂勫嫬濮為崶鍓у: [^\\]]*${escapedFileName}[^\\]]*\\]`, 'g');
                const fullBlockRegex = new RegExp(`\\n*\\s*\\[闂勫嫬濮為弬鍥︽: [^\\]]*${escapedFileName}[^\\]]*\\][\\s\\S]*?\\[/闂勫嫬濮為弬鍥︽缂佹挻娼? [^\\]]*${escapedFileName}[^\\]]*\\]`, 'g');

                updatedMessage.content = updatedMessage.content
                    .replace(fullBlockRegex, '')
                    .replace(genericRegex, '')
                    .replace(imageRegex, '')
                    .trim();
            }

            try {
                await electronAPI.saveChatHistory(currentSelectedItem.id, currentTopicId, updatedHistory);
                currentChatHistoryRef.set(updatedHistory);

                if (messageRenderer && typeof messageRenderer.updateMessageUI === 'function') {
                    await messageRenderer.updateMessageUI(messageId, updatedMessage);
                } else {
                    await loadChatHistory(currentSelectedItem.id, currentSelectedItem.type, currentTopicId);
                }

                if (uiHelper && uiHelper.showToastNotification) {
                    uiHelper.showToastNotification('附件已移除。', 'success');
                }
            } catch (error) {
                console.error('[ChatManager] Failed to remove attachment:', error);
            }
        }
    }

    async function processFilesData(files) {
        if (!files || files.length === 0) return [];

        console.log(`[ChatManager] Processing ${files.length} files...`);
        const filesToProcess = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            filesToProcess.push(new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const arrayBuffer = e.target.result;
                    if (!arrayBuffer) {
                        console.warn(`[ChatManager] FileReader received null ArrayBuffer for ${file.name}`);
                        resolve({ name: file.name, error: '閺冪姵纭剁拠璇插絿閺傚洣娆㈤崘鍛啇' });
                        return;
                    }

                    const fileBuffer = new Uint8Array(arrayBuffer);
                    resolve({
                        name: file.name,
                        type: file.type || 'application/octet-stream',
                        data: fileBuffer,
                        size: file.size,
                        path: file.path,
                    });
                };
                reader.onerror = (err) => {
                    console.error(`[ChatManager] FileReader error for ${file.name}:`, err);
                    resolve({ name: file.name, error: `閺冪姵纭剁拠璇插絿閺傚洣娆? ${err.message}` });
                };
                reader.readAsArrayBuffer(file);
            }));
        }

        return await Promise.all(filesToProcess);
    }

    async function addAttachmentsToMessage(messageId, droppedFilesData) {
        console.log(`[ChatManager] addAttachmentsToMessage triggered for messageId: ${messageId}`, droppedFilesData);

        const currentChatHistory = currentChatHistoryRef.get();
        const currentTopicId = currentTopicIdRef.get();
        const currentSelectedItem = currentSelectedItemRef.get();

        if (!currentChatHistory || !currentTopicId || !currentSelectedItem) {
            console.error('[ChatManager] Context missing:', {
                hasHistory: !!currentChatHistory,
                currentTopicId,
                selectedItem: currentSelectedItem?.id,
            });
            return;
        }

        const messageIndex = currentChatHistory.findIndex(m => m.id === messageId);
        if (messageIndex === -1) {
            console.error(`[ChatManager] Message with ID ${messageId} not found in current history.`);
            return;
        }

        try {
            const results = await electronAPI.handleFileDrop(currentSelectedItem.id, currentTopicId, droppedFilesData);

            const successfulAttachments = results
                .filter(r => r.success && r.attachment)
                .map(r => ({
                    ...r.attachment,
                    name: r.name,
                    src: r.attachment.internalPath,
                }));

            if (successfulAttachments.length === 0) {
                if (uiHelper && uiHelper.showToastNotification) {
                    uiHelper.showToastNotification('附件添加失败，请检查文件后重试。', 'error');
                }
                return;
            }

            const updatedHistory = JSON.parse(JSON.stringify(currentChatHistory));
            const message = updatedHistory[messageIndex];
            if (!message.attachments) message.attachments = [];
            message.attachments.push(...successfulAttachments);

            await electronAPI.saveChatHistory(currentSelectedItem.id, currentTopicId, updatedHistory);
            currentChatHistoryRef.set(updatedHistory);

            if (messageRenderer && typeof messageRenderer.updateMessageUI === 'function') {
                await messageRenderer.updateMessageUI(messageId, message);
            } else {
                await loadChatHistory(currentSelectedItem.id, currentSelectedItem.type, currentTopicId);
            }

            if (uiHelper && uiHelper.showToastNotification) {
                uiHelper.showToastNotification('已成功添加 ' + successfulAttachments.length + ' 个附件。', 'success');
            }
        } catch (error) {
            console.error('[ChatManager] Failed to add attachments:', error);
            if (uiHelper && uiHelper.showToastNotification) {
                uiHelper.showToastNotification(`闂勫嫪娆㈠ǎ璇插閸戞椽鏁? ${error.message}`, 'error');
            }
        }
    }

    async function displayTopicTimestampBubble(itemId, itemType, topicId) {
        const { chatMessagesDiv } = elements;
        const chatMessagesContainer = document.querySelector('.chat-messages-container');

        if (!chatMessagesDiv || !chatMessagesContainer) {
            console.warn('[displayTopicTimestampBubble] Missing chatMessagesDiv or chatMessagesContainer.');
            const existingBubble = document.getElementById('topicTimestampBubble');
            if (existingBubble) existingBubble.style.display = 'none';
            return;
        }

        let timestampBubble = document.getElementById('topicTimestampBubble');
        if (!timestampBubble) {
            timestampBubble = document.createElement('div');
            timestampBubble.id = 'topicTimestampBubble';
            timestampBubble.className = 'topic-timestamp-bubble';
            if (chatMessagesDiv.firstChild) {
                chatMessagesDiv.insertBefore(timestampBubble, chatMessagesDiv.firstChild);
            } else {
                chatMessagesDiv.appendChild(timestampBubble);
            }
        } else {
            if (chatMessagesDiv.firstChild !== timestampBubble) {
                chatMessagesDiv.insertBefore(timestampBubble, chatMessagesDiv.firstChild);
            }
        }

        if (!itemId || !topicId) {
            timestampBubble.style.display = 'none';
            return;
        }

        try {
            let itemConfigFull;
            if (itemType === 'agent') {
                itemConfigFull = await electronAPI.getAgentConfig(itemId);
            } else if (itemType === 'group') {
                itemConfigFull = await electronAPI.getAgentGroupConfig(itemId);
            }

            if (itemConfigFull && !itemConfigFull.error && itemConfigFull.topics) {
                const currentTopicObj = itemConfigFull.topics.find(t => t.id === topicId);
                if (currentTopicObj && currentTopicObj.createdAt) {
                    const date = new Date(currentTopicObj.createdAt);
                    const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                    timestampBubble.textContent = `话题创建于 ${formattedDate}`;
                    timestampBubble.style.display = 'block';
                } else {
                    console.warn(`[displayTopicTimestampBubble] Topic ${topicId} not found or has no createdAt for ${itemType} ${itemId}.`);
                    timestampBubble.style.display = 'none';
                }
            } else {
                console.error('[displayTopicTimestampBubble] Could not load config or topics for', itemType, itemId, 'Error:', itemConfigFull?.error);
                timestampBubble.style.display = 'none';
            }
        } catch (error) {
            console.error('[displayTopicTimestampBubble] Error fetching topic creation time for', itemType, itemId, 'topic', topicId, ':', error);
            timestampBubble.style.display = 'none';
        }
    }

    async function attemptTopicSummarizationIfNeeded() {
        const currentSelectedItem = currentSelectedItemRef.get();
        const currentChatHistory = currentChatHistoryRef.get();
        const currentTopicId = currentTopicIdRef.get();

        if (currentSelectedItem.type !== 'agent' || currentChatHistory.length < 4 || !currentTopicId) return;

        try {
            // 瀵搫鍩楁禒搴㈡瀮娴犲墎閮寸紒鐔煎櫢閺傛澘濮炴潪鑺ユ付閺傛壆娈戦柊宥囩枂閿涘瞼鈥樻穱婵囩垼妫版ɑ顥呴弻銉ф畱閸戝棛鈥橀幀?
            const agentConfigForSummary = await electronAPI.getAgentConfig(currentSelectedItem.id);
            if (!agentConfigForSummary || agentConfigForSummary.error) {
                console.error('[TopicSummary] Failed to get fresh agent config for summarization:', agentConfigForSummary?.error);
                return;
            }
            // 娴ｈ法鏁ら張鈧弬鎵畱闁板秶鐤嗛弴瀛樻煀閸愬懎鐡ㄦ稉顓犳畱閻樿埖鈧緤绱濇禒銉ょ箽閹镐礁鎮撳?
            if (currentSelectedItem.config) {
                currentSelectedItem.config = agentConfigForSummary;
            } else {
                Object.assign(currentSelectedItem, agentConfigForSummary);
            }
            currentSelectedItemRef.set(currentSelectedItem);

            const topics = agentConfigForSummary.topics || [];
            const currentTopicObject = topics.find(t => t.id === currentTopicId);
            const existingTopicTitle = currentTopicObject ? currentTopicObject.name : '新聊天';
            const currentAgentName = agentConfigForSummary.name || 'AI';

            if (existingTopicTitle === '新聊天' || existingTopicTitle.startsWith('聊天于')) {
                if (messageRenderer && typeof messageRenderer.summarizeTopicFromMessages === 'function') {
                    const summarizedTitle = await messageRenderer.summarizeTopicFromMessages(currentChatHistory.filter(m => !m.isThinking), currentAgentName);
                    if (summarizedTitle) {
                        const saveResult = await electronAPI.saveAgentTopicTitle(currentSelectedItem.id, currentTopicId, summarizedTitle);
                        if (saveResult.success) {
                            // 閺嶅洭顣藉韫箽鐎涙ê鍩岄弬鍥︽閿涘瞼骞囬崷銊︽纯閺傛澘鍞寸€涙ü鑵戦惃鍕嚠鐠炩€蹭簰缁斿宓嗛崣宥嗘Ё閺囧瓨鏁?
                            if (currentTopicObject) {
                                currentTopicObject.name = summarizedTitle;
                            }
                            if (document.getElementById('tabContentTopics').classList.contains('active')) {
                                if (topicListManager) topicListManager.loadTopicList();
                            }
                        } else {
                            console.error(`[TopicSummary] Failed to save new topic title "${summarizedTitle}":`, saveResult.error);
                        }
                    }
                } else {
                    console.error('[TopicSummary] summarizeTopicFromMessages function is not defined or not accessible via messageRenderer.');
                }
            }
        } catch (error) {
            console.error('[TopicSummary] Error during attemptTopicSummarizationIfNeeded:', error);
        }
    }

    async function handleSendMessage() {
        const { messageInput } = elements;
        let content = messageInput.value; // Use let as it might be modified
        const attachedFiles = attachedFilesRef.get();
        const currentSelectedItem = currentSelectedItemRef.get();
        const currentTopicId = currentTopicIdRef.get();
        const globalSettings = globalSettingsRef.get();

        if (!content && attachedFiles.length === 0) return;
        if (!currentSelectedItem.id || !currentTopicId) {
            uiHelper.showToastNotification('请先选择一个话题，再发送消息。', 'error');
            return;
        }
        const selectedModel = String(currentSelectedItem?.config?.model || '').trim().toLowerCase();
        const usingOllamaModel = selectedModel.startsWith('ollama/');
        if (!globalSettings.vcpServerUrl && !usingOllamaModel) {
            uiHelper.showToastNotification('尚未配置 VCP 服务器地址，请先在全局设置中填写 VCP Server URL。', 'error');
            uiHelper.openModal('globalSettingsModal');
            return;
        }

        if (currentSelectedItem.type === 'channel_mirror') {
            uiHelper.showToastNotification('镜像会话当前为只读模式，不能直接在这里发送消息。', 'info');
            return;
        }

        if (currentSelectedItem.type === 'group') {
            if (groupRenderer && typeof groupRenderer.handleSendGroupMessage === 'function') {
                groupRenderer.handleSendGroupMessage(
                    currentSelectedItem.id,
                    currentTopicId,
                    { text: content, attachments: attachedFiles.map(af => ({ type: af.file.type, src: af.localPath, name: af.originalName, size: af.file.size })) },
                    globalSettings.userName || '用户'
                );
            } else {
                uiHelper.showToastNotification("群聊渲染器不可用，暂时无法发送群消息。", 'error');
            }
            messageInput.value = '';
            attachedFilesRef.set([]);
            if(mainRendererFunctions.updateAttachmentPreview) mainRendererFunctions.updateAttachmentPreview();
            uiHelper.autoResizeTextarea(messageInput);
            // messageInput.focus();
            return;
        }

        // --- Standard Agent Message Sending ---
        // The 'content' variable still holds the user's raw input, including the placeholder.
        // We will resolve the placeholder later, only for the final message sent to VCP.
        let combinedTextContent = content; // 閻劋绨崣鎴︹偓浣虹舶VCP閻ㄥ嫮绮嶉崥鍫熸瀮閺堫剙鍞寸€?
 
        const uiAttachments = [];
        if (attachedFiles.length > 0) {
            for (const af of attachedFiles) {
                const fileManagerData = af._fileManagerData || {};
                uiAttachments.push({
                    type: fileManagerData.type,
                    src: af.localPath,
                    name: af.originalName,
                    size: af.file.size,
                    _fileManagerData: fileManagerData
                });

                // 娣囶喗顒滈敍姘殺閺傚洣娆㈢捄顖氱窞閸滃本褰侀崣鏍畱閺傚洦婀板锝団€橀崷浼存閸旂姴鍩?combinedTextContent
                const filePathForContext = af.localPath || af.originalName;

                if (af.file.type.startsWith('image/')) {
                    // 鐎甸€涚艾閸ュ墽澧栭敍灞惧灉娴狀剙褰ч梽鍕鐠侯垰绶為敍灞芥礈娑撳搫鍞寸€圭懓鐨㈡担婊€璐熸径姘侀幀渚€鍎撮崚鍡楀絺闁?
                    combinedTextContent += `\n\n[闂勫嫬濮為崶鍓у: ${filePathForContext}]`;
                } else if (fileManagerData.extractedText) {
                    // 鐎甸€涚艾閺堝褰侀崣鏍ㄦ瀮閺堫剛娈戦弬鍥︽閿涘苯鎮撻弮鍫曟閸旂姾鐭惧鍕嫲閺傚洦婀?
                    combinedTextContent += `\n\n[闂勫嫬濮為弬鍥︽: ${filePathForContext}]\n${fileManagerData.extractedText}\n[/闂勫嫬濮為弬鍥︽缂佹挻娼? ${af.originalName}]`;
                } else {
                    // 鐎甸€涚艾閸忔湹绮弬鍥︽閿涘牆顩ч棅鎶筋暥閵嗕浇顫嬫０鎴欌偓浣规￥閺傚洦婀伴惃鍑盌F缁涘绱氶敍灞藉涧闂勫嫬濮炵捄顖氱窞
                    combinedTextContent += `\n\n[闂勫嫬濮為弬鍥︽: ${filePathForContext}]`;
                }
            }
        }

        const userMessage = {
            role: 'user',
            name: globalSettings.userName || '用户',
            content: content, // Use raw content for UI
            timestamp: Date.now(),
            id: `msg_${Date.now()}_user_${Math.random().toString(36).substring(2, 9)}`,
            attachments: uiAttachments
        };
        
        if (messageRenderer) {
            await messageRenderer.renderMessage(userMessage);
        }
        // Manually update history after rendering
        const currentChatHistory = currentChatHistoryRef.get();
        currentChatHistory.push(userMessage);
        currentChatHistoryRef.set(currentChatHistory);

        // Save history with the user message before adding the thinking message or making API calls
        await electronAPI.saveChatHistory(currentSelectedItem.id, currentTopicId, currentChatHistory);

        // After saving history (which marks the topic as read), refresh the unread counts.
        if (itemListManager && typeof itemListManager.refreshUnreadCounts === 'function') {
            itemListManager.refreshUnreadCounts();
        } else if (itemListManager) {
            itemListManager.loadItems();
        }

        messageInput.value = '';
        attachedFilesRef.set([]);
        if(mainRendererFunctions.updateAttachmentPreview) mainRendererFunctions.updateAttachmentPreview();
        
        // After sending, if the canvas window is still open, restore the placeholder
        if (isCanvasWindowOpen) {
            messageInput.value = CANVAS_PLACEHOLDER;
        }
        uiHelper.autoResizeTextarea(messageInput);
        // messageInput.focus(); // 閺嶇绺炬穱顔筋劀閿涙碍鏁為柌濠冨竴濮濄倛顢戦妴鍌濈箹閺勵垰顕遍懛纰匢濞翠礁绱℃潏鎾冲毉閺冭绱濋崡鍏呭▏閸氭垳绗傚姘З娑旂喍绱扮悮顐㈠繁閸掕埖濯洪崶鐐茬俺闁劎娈戦弽瑙勭爱閵?

        const thinkingMessageId = `msg_${Date.now()}_assistant_${Math.random().toString(36).substring(2, 9)}`;
        const thinkingMessage = {
            role: 'assistant',
            name: currentSelectedItem.name || currentSelectedItem.id || 'AI', // 娣囶喖顦查敍姘▏閻?ID 娴ｆ粈璐熼弴鏉戝讲闂堢姷娈戦崶鐐衡偓鈧?
            content: '思考中...',
            timestamp: Date.now(),
            id: thinkingMessageId,
            isThinking: true,
            avatarUrl: currentSelectedItem.avatarUrl,
            avatarColor: (currentSelectedItem.config || currentSelectedItem)?.avatarCalculatedColor
        };

        let thinkingMessageItem = null;
        if (messageRenderer) {
            thinkingMessageItem = await messageRenderer.renderMessage(thinkingMessage);
        }
        // Manually update history with the thinking message
        const currentChatHistoryWithThinking = currentChatHistoryRef.get();
        currentChatHistoryWithThinking.push(thinkingMessage);
        currentChatHistoryRef.set(currentChatHistoryWithThinking);
        window.updateSendButtonState?.();

        try {
            const agentConfig = currentSelectedItem.config || currentSelectedItem;
            const currentChatHistory = currentChatHistoryRef.get();
            const historySnapshotForVCP = currentChatHistory.filter(msg => msg.id !== thinkingMessage.id && !msg.isThinking);

            const messagesForVCP = await Promise.all(historySnapshotForVCP.map(async msg => {
                let vcpImageAttachmentsPayload = [];
                let vcpAudioAttachmentsPayload = [];
                let vcpVideoAttachmentsPayload = [];
                let currentMessageTextContent = msg.content;

                // --- 鎼存梻鏁ゅ锝呭灟鐟欏嫬鍨敍鍫濇倵缁旑垯绗傛稉瀣瀮閿?--
                if (agentConfig?.stripRegexes && Array.isArray(agentConfig.stripRegexes) && agentConfig.stripRegexes.length > 0) {
                    // --- 閹稿鈧粌顕拠婵婄枂濞嗏檧鈧繆顓哥粻妤佺箒鎼?---
                    const turns = [];
                    for (let i = historySnapshotForVCP.length - 1; i >= 0; i--) {
                        if (historySnapshotForVCP[i].role === 'assistant') {
                            const turn = { assistant: historySnapshotForVCP[i], user: null };
                            if (i > 0 && historySnapshotForVCP[i - 1].role === 'user') {
                                turn.user = historySnapshotForVCP[i - 1];
                                i--; // 鐠哄疇绻冮悽銊﹀煕濞戝牊浼呴敍灞芥礈娑撳搫鍑＄紒蹇涘帳鐎?
                            }
                            turns.unshift(turn);
                        } else if (historySnapshotForVCP[i].role === 'user') {
                            // 婢跺嫮鎮婇張顐㈢啲閻ㄥ嫬宕熸稉顏嗘暏閹撮攱绉烽幁?
                            turns.unshift({ assistant: null, user: historySnapshotForVCP[i] });
                        }
                    }
                    
                    // 閹垫儳鍩岃ぐ鎾冲濞戝牊浼呴幍鈧崷銊ф畱鏉烆喗顐?
                    const turnIndex = turns.findIndex(t => (t.assistant && t.assistant.id === msg.id) || (t.user && t.user.id === msg.id));
                    const depth = turnIndex !== -1 ? (turns.length - 1 - turnIndex) : -1;

                    if (depth !== -1) {
                        // 鎼存梻鏁ょ憴鍕灟閸掔増绉烽幁顖氬敶鐎?
                        currentMessageTextContent = applyRegexRules(
                            currentMessageTextContent,
                            agentConfig.stripRegexes,
                            'context',  // 鏉╂瑩鍣锋径鍕倞閻ㄥ嫭妲搁崣鎴︹偓浣虹舶AI閻ㄥ嫪绗傛稉瀣瀮
                            msg.role,
                            depth
                        );
                    }
                    // --- 濞ｅ崬瀹崇拋锛勭暬閸滃苯绨查悽銊х波閺?---
                }
                // --- 濮濓絽鍨憴鍕灟鎼存梻鏁ょ紒鎾存将 ---

                if (msg.role === 'user' && msg.id === userMessage.id) {
                    // 閸忔娊鏁穱顔碱槻閿涙矮濞囬悽銊ュ嚒缂佸繐瀵橀崥顐︽娴犺泛鍞寸€瑰湱娈?combinedTextContent
                    currentMessageTextContent = combinedTextContent;
                    
                    // IMPORTANT: We need to handle Canvas placeholder WITHOUT overwriting the combined content
                    // First, check if we need to replace Canvas placeholder
                    if (currentMessageTextContent.includes(CANVAS_PLACEHOLDER)) {
                        try {
                            const canvasData = await electronAPI.getLatestCanvasContent();
                            if (canvasData && !canvasData.error) {
                                const formattedCanvasContent = `\n[Canvas Content]\n${canvasData.content || ''}\n[Canvas Path]\n${canvasData.path || 'No file path'}\n[Canvas Errors]\n${canvasData.errors || 'No errors'}\n`;
                                // Replace Canvas placeholder in the combined content
                                currentMessageTextContent = currentMessageTextContent.replace(new RegExp(CANVAS_PLACEHOLDER, 'g'), formattedCanvasContent);
                            } else {
                                console.error("Failed to get latest canvas content:", canvasData?.error);
                                currentMessageTextContent = currentMessageTextContent.replace(new RegExp(CANVAS_PLACEHOLDER, 'g'), '\n[Canvas content could not be loaded]\n');
                            }
                        } catch (error) {
                            console.error("Error fetching canvas content:", error);
                            currentMessageTextContent = currentMessageTextContent.replace(new RegExp(CANVAS_PLACEHOLDER, 'g'), '\n[Error loading canvas content]\n');
                        }
                    }
                } else if (msg.attachments && msg.attachments.length > 0) {
                    let historicalAppendedText = "";
                    for (const att of msg.attachments) {
                        const fileManagerData = att._fileManagerData || {};
                        // 娴兼ê鍘涙担璺ㄦ暏 att.src閿涘苯娲滄稉鍝勭暊娴狅綀銆冮崜宥囶伂閻ㄥ嫭婀伴崷鏉垮讲鐠佸潡妫剁捄顖氱窞
                        // 閸氬骸顦稉?internalPath閿涘牊娼甸懛?fileManager閿涘绱濋張鈧崥搴㈠閺勵垱鏋冩禒璺烘倳
                        const filePathForContext = att.src || (fileManagerData.internalPath ? fileManagerData.internalPath.replace('file://', '') : (att.name || '閺堫亞鐓￠弬鍥︽'));

                        if (fileManagerData.imageFrames && fileManagerData.imageFrames.length > 0) {
                             historicalAppendedText += `\n\n[闂勫嫬濮為弬鍥︽: ${filePathForContext} (閹殿偅寮块悧鍦F閿涘苯鍑℃潪顒佸床娑撳搫娴橀悧?]`;
                        } else if (fileManagerData.extractedText) {
                            historicalAppendedText += `\n\n[闂勫嫬濮為弬鍥︽: ${filePathForContext}]\n${fileManagerData.extractedText}\n[/闂勫嫬濮為弬鍥︽缂佹挻娼? ${att.name || '閺堫亞鐓￠弬鍥︽'}]`;
                        } else {
                            // 鐎甸€涚艾濞屸剝婀侀幓鎰絿閺傚洦婀伴惃鍕瀮娴犺绱欐俊鍌炵叾鐟欏棝顣堕敍澶涚礉閸欘亪妾崝鐘虹熅瀵?
                            historicalAppendedText += `\n\n[闂勫嫬濮為弬鍥︽: ${filePathForContext}]`;
                        }
                    }
                    currentMessageTextContent += historicalAppendedText;
                }

                if (msg.attachments && msg.attachments.length > 0) {
                    // --- IMAGE PROCESSING ---
                    const imageAttachmentsPromises = msg.attachments.map(async att => {
                        const fileManagerData = att._fileManagerData || {};
                        // Case 1: Scanned PDF converted to image frames
                        if (fileManagerData.imageFrames && fileManagerData.imageFrames.length > 0) {
                            return fileManagerData.imageFrames.map(frameData => ({
                                type: 'image_url',
                                image_url: { url: `data:image/jpeg;base64,${frameData}` }
                            }));
                        }
                        // Case 2: Regular image file (including GIFs that get framed)
                        if (att.type.startsWith('image/')) {
                            try {
                                const result = await electronAPI.getFileAsBase64(att.src);
                                if (result && result.success) {
                                    return result.base64Frames.map(frameData => ({
                                        type: 'image_url',
                                        image_url: { url: `data:image/jpeg;base64,${frameData}` }
                                    }));
                                } else {
                                    const errorMsg = result ? result.error : '閺堫亞鐓￠柨娆掝嚖';
                                    console.error(`Failed to get Base64 for ${att.name}: ${errorMsg}`);
                                    uiHelper.showToastNotification(`婢跺嫮鎮婇崶鍓у ${att.name} 婢惰精瑙? ${errorMsg}`, 'error');
                                    return null;
                                }
                            } catch (processingError) {
                                console.error(`Exception during getBase64 for ${att.name}:`, processingError);
                                uiHelper.showToastNotification(`婢跺嫮鎮婇崶鍓у ${att.name} 閺冭泛褰傞悽鐔风磽鐢? ${processingError.message}`, 'error');
                                return null;
                            }
                        }
                        return null; // Not an image or a convertible PDF
                    });

                    const nestedImageAttachments = await Promise.all(imageAttachmentsPromises);
                    const flatImageAttachments = nestedImageAttachments.flat().filter(Boolean);
                    vcpImageAttachmentsPayload.push(...flatImageAttachments);

                    // --- AUDIO PROCESSING ---
                    const supportedAudioTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/aiff', 'audio/aac', 'audio/ogg', 'audio/flac'];
                    const audioAttachmentsPromises = msg.attachments
                        .filter(att => supportedAudioTypes.includes(att.type))
                        .map(async att => {
                            try {
                                const result = await electronAPI.getFileAsBase64(att.src);
                                if (result && result.success) {
                                    return result.base64Frames.map(frameData => ({
                                        type: 'image_url',
                                        image_url: { url: `data:${att.type};base64,${frameData}` }
                                    }));
                                } else {
                                    const errorMsg = result ? result.error : '閺堫亞鐓￠柨娆掝嚖';
                                    console.error(`Failed to get Base64 for audio ${att.name}: ${errorMsg}`);
                                    uiHelper.showToastNotification(`婢跺嫮鎮婇棅鎶筋暥 ${att.name} 婢惰精瑙? ${errorMsg}`, 'error');
                                    return null;
                                }
                            } catch (processingError) {
                                console.error(`Exception during getBase64 for audio ${att.name}:`, processingError);
                                uiHelper.showToastNotification(`婢跺嫮鎮婇棅鎶筋暥 ${att.name} 閺冭泛褰傞悽鐔风磽鐢? ${processingError.message}`, 'error');
                                return null;
                            }
                        });
                    const nestedAudioAttachments = await Promise.all(audioAttachmentsPromises);
                    vcpAudioAttachmentsPayload.push(...nestedAudioAttachments.flat().filter(Boolean));

                    // --- VIDEO PROCESSING ---
                    const videoAttachmentsPromises = msg.attachments
                        .filter(att => att.type.startsWith('video/'))
                        .map(async att => {
                            try {
                                const result = await electronAPI.getFileAsBase64(att.src);
                                if (result && result.success) {
                                    return result.base64Frames.map(frameData => ({
                                        type: 'image_url',
                                        image_url: { url: `data:${att.type};base64,${frameData}` }
                                    }));
                                } else {
                                    const errorMsg = result ? result.error : '閺堫亞鐓￠柨娆掝嚖';
                                    console.error(`Failed to get Base64 for video ${att.name}: ${errorMsg}`);
                                    uiHelper.showToastNotification(`婢跺嫮鎮婄憴鍡涱暥 ${att.name} 婢惰精瑙? ${errorMsg}`, 'error');
                                    return null;
                                }
                            } catch (processingError) {
                                console.error(`Exception during getBase64 for video ${att.name}:`, processingError);
                                uiHelper.showToastNotification(`婢跺嫮鎮婄憴鍡涱暥 ${att.name} 閺冭泛褰傞悽鐔风磽鐢? ${processingError.message}`, 'error');
                                return null;
                            }
                        });
                    const nestedVideoAttachments = await Promise.all(videoAttachmentsPromises);
                    vcpVideoAttachmentsPayload.push(...nestedVideoAttachments.flat().filter(Boolean));
                }

                let finalContentPartsForVCP = [];
                if (currentMessageTextContent && currentMessageTextContent.trim() !== '') {
                    finalContentPartsForVCP.push({ type: 'text', text: currentMessageTextContent });
                }
                finalContentPartsForVCP.push(...vcpImageAttachmentsPayload);
                finalContentPartsForVCP.push(...vcpAudioAttachmentsPayload);
                finalContentPartsForVCP.push(...vcpVideoAttachmentsPayload);

                if (finalContentPartsForVCP.length === 0 && msg.role === 'user') {
                     finalContentPartsForVCP.push({ type: 'text', text: '(閻劍鍩涢崣鎴︹偓浣风啊闂勫嫪娆㈤敍灞肩稻閺冪姵鏋冮張顒佸灗閸ュ墽澧栭崘鍛啇)' });
                }
                
                return { role: msg.role, content: finalContentPartsForVCP.length > 0 ? finalContentPartsForVCP : msg.content };
            }));

            if (agentConfig && agentConfig.systemPrompt) {
                let systemPromptContent = agentConfig.systemPrompt.replace(/\{\{AgentName\}\}/g, agentConfig.name || currentSelectedItem.id);
                const prependedContent = [];

                // 娴犺濮?: 濞夈劌鍙嗛懕濠傘亯鐠佹澘缍嶉弬鍥︽鐠侯垰绶?
                // 閸嬪洩顔?agentConfig 鐎电钖勬稉顓炲瘶閸氼偂绔存稉?agentDataPath 鐏炵偞鈧嶇礉鐠囥儱鐫橀幀褏鏁辨稉鏄忕箻缁嬪婀崝鐘烘祰娴狅絿鎮婇柊宥囩枂閺冭埖褰佹笟娑栤偓?
                if (agentConfig.agentDataPath && currentTopicId) {
                    // 娣囶喗顒滈敍姝漸rrentTopicId 閺堫剝闊╃亸鍗炲瘶閸?"topic_" 閸撳秶绱戦敍灞炬￥闂団偓闁插秴顦插ǎ璇插
                    const historyPath = `${agentConfig.agentDataPath}\\topics\\${currentTopicId}\\history.json`;
                    prependedContent.push(`瑜版挸澧犻懕濠傘亯鐠佹澘缍嶉弬鍥︽鐠侯垰绶? ${historyPath}`);
                }

                // 娴犺濮?: 濞夈劌鍙嗙拠婵嬵暯閸掓稑缂撻弮鍫曟？
                if (agentConfig.topics && currentTopicId) {
                    const currentTopicObj = agentConfig.topics.find(t => t.id === currentTopicId);
                    if (currentTopicObj && currentTopicObj.createdAt) {
                        const date = new Date(currentTopicObj.createdAt);
                        const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                        prependedContent.push(`当前话题创建于 ${formattedDate}`);
                    }
                }

                if (prependedContent.length > 0) {
                    systemPromptContent = prependedContent.join('\n') + '\n\n' + systemPromptContent;
                }

                messagesForVCP.unshift({ role: 'system', content: systemPromptContent });
            }

            const useStreaming = (agentConfig && agentConfig.streamOutput !== undefined) ? (agentConfig.streamOutput === true || agentConfig.streamOutput === 'true') : true;
            const modelConfigForVCP = {
                model: (agentConfig && agentConfig.model) ? agentConfig.model : 'gemini-pro',
                temperature: (agentConfig && agentConfig.temperature !== undefined) ? parseFloat(agentConfig.temperature) : 0.7,
                ...(agentConfig && agentConfig.maxOutputTokens && { max_tokens: parseInt(agentConfig.maxOutputTokens) }),
                ...(agentConfig && agentConfig.contextTokenLimit !== undefined && agentConfig.contextTokenLimit !== null && { contextTokenLimit: parseInt(agentConfig.contextTokenLimit) }),
                ...(agentConfig && agentConfig.top_p !== undefined && agentConfig.top_p !== null && { top_p: parseFloat(agentConfig.top_p) }),
                ...(agentConfig && agentConfig.top_k !== undefined && agentConfig.top_k !== null && { top_k: parseInt(agentConfig.top_k) }),
                stream: useStreaming
            };

            if (useStreaming) {
                if (messageRenderer) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    // Pass the created DOM element directly to avoid race conditions with querySelector
                    await messageRenderer.startStreamingMessage({ ...thinkingMessage, content: "" }, thinkingMessageItem);
                }
            }

            const context = {
                agentId: currentSelectedItem.id,
                agentName: currentSelectedItem.name || currentSelectedItem.id, // 娣囶喖顦查敍姘礋閸楁洝浜版稉濠佺瑓閺傚洦鍧婇崝?agentName閿涘苯鑻熸担璺ㄦ暏 ID 娴ｆ粈璐熼崶鐐衡偓鈧?
                topicId: currentTopicId,
                isGroupMessage: false
            };

            const vcpResponse = await electronAPI.sendToVCP(
                globalSettings.vcpServerUrl,
                globalSettings.vcpApiKey,
                messagesForVCP,
                modelConfigForVCP,
                thinkingMessage.id,
                false, // isGroupCall - legacy, will be ignored by new handler but kept for safety
                context // The new context object
            );

            if (!useStreaming) {
                const response = vcpResponse?.response ?? vcpResponse;
                const responseContext = vcpResponse?.context ?? context;
                const currentSelectedItem = currentSelectedItemRef.get();
                const currentTopicId = currentTopicIdRef.get();

                // Determine if the response is for the currently active chat
                const isForActiveChat = responseContext && responseContext.agentId === currentSelectedItem.id && responseContext.topicId === currentTopicId;

                if (isForActiveChat) {
                    // If it's for the active chat, update the UI as usual
                    if (messageRenderer) messageRenderer.removeMessageById(thinkingMessage.id);
                }

                if (!response) {
                    throw new Error('VCP returned an empty response.');
                }

                if (response.error) {
                    if (isForActiveChat && messageRenderer) {
                        messageRenderer.renderMessage({ role: 'system', content: `VCP闁挎瑨顕? ${response.error}`, timestamp: Date.now() });
                    }
                    console.error(`[ChatManager] VCP Error for background message:`, response.error);
                } else if (response.choices && response.choices.length > 0) {
                    const assistantMessageContent = response.choices[0].message.content;
                    const assistantMessage = {
                        role: 'assistant',
                        name: responseContext?.agentName || responseContext?.agentId || 'AI', // 娣囶喖顦查敍姘▏閻?context 娑擃厾娈?agentName 閹?agentId 娴ｆ粈璐熼崶鐐衡偓鈧?
                        avatarUrl: currentSelectedItem.avatarUrl, // This might be incorrect if user switched, but it's a minor UI detail for background saves.
                        avatarColor: (currentSelectedItem.config || currentSelectedItem)?.avatarCalculatedColor,
                        content: assistantMessageContent,
                        timestamp: Date.now(),
                        id: `msg_${Date.now()}_assistant_${Math.random().toString(36).substring(2, 9)}`
                    };

                    // Fetch the correct history from the file, update it, and save it back.
                    const historyForSave = await electronAPI.getChatHistory(responseContext.agentId, responseContext.topicId);
                    if (historyForSave && !historyForSave.error) {
                        // Remove any lingering 'thinking' message and add the new one
                        const finalHistory = historyForSave.filter(msg => msg.id !== thinkingMessage.id && !msg.isThinking);
                        finalHistory.push(assistantMessage);
                        
                        // Save the final, complete history to the correct file
                        await electronAPI.saveChatHistory(responseContext.agentId, responseContext.topicId, finalHistory);

                        if (isForActiveChat) {
                            // If it's the active chat, also update the UI and in-memory state
                            currentChatHistoryRef.set(finalHistory);
                            window.updateSendButtonState?.();
                            if (messageRenderer) messageRenderer.renderMessage(assistantMessage);
                            await attemptTopicSummarizationIfNeeded();
                        } else {
                            console.log(`[ChatManager] Saved non-streaming response for background chat: Agent ${responseContext.agentId}, Topic ${responseContext.topicId}`);
                        }
                    } else {
                         console.error(`[ChatManager] Failed to get history for background save:`, historyForSave.error);
                    }
                } else {
                    if (isForActiveChat && messageRenderer) {
                        messageRenderer.renderMessage({ role: 'system', content: 'VCP 返回了空响应，请稍后重试。', timestamp: Date.now() });
                    }
                }
            } else {
                if (vcpResponse && vcpResponse.streamError) {
                    console.error("Streaming setup failed in main process:", vcpResponse.errorDetail || vcpResponse.error);
                } else if (vcpResponse && !vcpResponse.streamingStarted && !vcpResponse.streamError) {
                    console.warn("Expected streaming to start, but main process returned non-streaming or error:", vcpResponse);
                    if (messageRenderer) messageRenderer.removeMessageById(thinkingMessage.id); // This will also remove from history
                    if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: '消息流没有正常启动，请检查后端状态后重试。', timestamp: Date.now() });
                    // No need to save again here as removeMessageById handles it if configured
                }
            }
        } catch (error) {
            console.error('调用 VCP 发送消息时出错:', error);
            if (messageRenderer) messageRenderer.removeMessageById(thinkingMessage.id);
            if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: `发送消息失败: ${error.message}`, timestamp: Date.now() });
            if(currentSelectedItem.id && currentTopicId) {
                await electronAPI.saveChatHistory(currentSelectedItem.id, currentTopicId, currentChatHistoryRef.get().filter(msg => !msg.isThinking));
            }
        }
    }

    async function createNewTopicForItem(itemId, itemType) {
        if (!itemId) {
            uiHelper.showToastNotification('缺少目标对象，无法创建新话题。', 'error');
            return;
        }
        
        const currentSelectedItem = currentSelectedItemRef.get();
        if (itemType === 'channel_mirror') {
            uiHelper.showToastNotification('镜像会话当前为只读模式，不能在这里新建话题。', 'info');
            return;
        }
        const itemName = currentSelectedItem.name || (itemType === 'group' ? '群组' : 'Agent');
        const newTopicName = `聊天于 ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
        
        try {
            let result;
            if (itemType === 'agent') {
                result = await electronAPI.createNewTopicForAgent(itemId, newTopicName);
            } else if (itemType === 'group') {
                result = await electronAPI.createNewTopicForGroup(itemId, newTopicName);
            }

            if (result && result.success && result.topicId) {
                currentTopicIdRef.set(result.topicId);
                currentChatHistoryRef.set([]);
                window.updateSendButtonState?.();

                if (messageRenderer) {
                    messageRenderer.setCurrentTopicId(result.topicId);
                    messageRenderer.clearChat();
                    // messageRenderer.renderMessage({ role: 'system', content: `閺傛媽鐦芥０?"${result.topicName}" 瀹告彃绱戞慨瀣ㄢ偓淇? timestamp: Date.now() });
                }
                localStorage.setItem(`lastActiveTopic_${itemId}_${itemType}`, result.topicId);
                
                // 棣冩暋 閸忔娊鏁穱顔碱槻閿涙矮璐熼弬鏉跨紦閻ㄥ嫯鐦芥０妯烘儙閸斻劍鏋冩禒鍓佹磧閸氼剙娅?
                const agentConfigForWatcher = currentSelectedItem.config || currentSelectedItem;
                if (electronAPI.watcherStart && agentConfigForWatcher?.agentDataPath) {
                    const historyFilePath = `${agentConfigForWatcher.agentDataPath}\\topics\\${result.topicId}\\history.json`;
                    await electronAPI.watcherStart(historyFilePath, itemId, result.topicId);
                    console.log(`[ChatManager] Started file watcher for new topic: ${result.topicId}`);
                }
                
                if (document.getElementById('tabContentTopics').classList.contains('active')) {
                    if (topicListManager) await topicListManager.loadTopicList();
                }
                
                await displayTopicTimestampBubble(itemId, itemType, result.topicId);
                // elements.messageInput.focus();
            } else {
                uiHelper.showToastNotification(`閸掓稑缂撻弬鎷岀樈妫版ê銇戠拹? ${result ? result.error : '閺堫亞鐓￠柨娆掝嚖'}`, 'error');
            }
        } catch (error) {
            console.error(`閸掓稑缂撻弬鎷岀樈妫版ɑ妞傞崙娲晩:`, error);
            uiHelper.showToastNotification(`閸掓稑缂撻弬鎷岀樈妫版ɑ妞傞崙娲晩: ${error.message}`, 'error');
        }
    }


    async function handleCreateBranch(selectedMessage) {
        const currentSelectedItem = currentSelectedItemRef.get();
        const currentTopicId = currentTopicIdRef.get();
        const currentChatHistory = currentChatHistoryRef.get();
        const itemType = currentSelectedItem.type;

        if ((itemType !== 'agent' && itemType !== 'group') || !currentSelectedItem.id || !currentTopicId || !selectedMessage) {
            uiHelper.showToastNotification('当前上下文不完整，无法创建分支话题。', 'error');
            return;
        }

        const messageId = selectedMessage.id;
        const messageIndex = currentChatHistory.findIndex(msg => msg.id === messageId);

        if (messageIndex === -1) {
            uiHelper.showToastNotification('未找到目标消息，无法创建分支话题。', 'error');
            return;
        }

        const historyForNewBranch = currentChatHistory.slice(0, messageIndex + 1);
        if (historyForNewBranch.length === 0) {
            uiHelper.showToastNotification('分支内容为空，无法创建分支话题。', 'error');
            return;
        }

        try {
            let itemConfig, originalTopic, createResult, saveResult;
            const itemId = currentSelectedItem.id;

            if (itemType === 'agent') {
                itemConfig = await electronAPI.getAgentConfig(itemId);
            } else { // group
                itemConfig = await electronAPI.getAgentGroupConfig(itemId);
            }

            if (!itemConfig || itemConfig.error) {
                uiHelper.showToastNotification(`读取${itemType === 'agent' ? 'Agent' : '群组'}配置失败: ${itemConfig?.error || ''}`, 'error');
                return;
            }

            originalTopic = itemConfig.topics.find(t => t.id === currentTopicId);
            const originalTopicName = normalizeTopicTitle(originalTopic ? originalTopic.name : '原话题');
            const newBranchTopicName = originalTopicName + '（分支）';

            if (itemType === 'agent') {
                createResult = await electronAPI.createNewTopicForAgent(itemId, newBranchTopicName, true);
            } else { // group
                createResult = await electronAPI.createNewTopicForGroup(itemId, newBranchTopicName, true);
            }

            if (!createResult || !createResult.success || !createResult.topicId) {
                uiHelper.showToastNotification(`閸掓稑缂撻崚鍡樻暜鐠囨繈顣芥径杈Е: ${createResult ? createResult.error : '閺堫亞鐓￠柨娆掝嚖'}`, 'error');
                return;
            }

            const newTopicId = createResult.topicId;

            if (itemType === 'agent') {
                saveResult = await electronAPI.saveChatHistory(itemId, newTopicId, historyForNewBranch);
            } else { // group
                saveResult = await electronAPI.saveGroupChatHistory(itemId, newTopicId, historyForNewBranch);
            }

            if (!saveResult || !saveResult.success) {
                uiHelper.showToastNotification(`保存分支话题失败: ${saveResult ? saveResult.error : '未知错误'}`, 'error');
                // Clean up empty branch topic
                if (itemType === 'agent') {
                    await electronAPI.deleteTopic(itemId, newTopicId);
                } else { // group
                    await electronAPI.deleteGroupTopic(itemId, newTopicId);
                }
                return;
            }

            currentTopicIdRef.set(newTopicId);
            if (messageRenderer) messageRenderer.setCurrentTopicId(newTopicId);
            
            if (document.getElementById('tabContentTopics').classList.contains('active')) {
                if (topicListManager) await topicListManager.loadTopicList();
            }
            await loadChatHistory(itemId, itemType, newTopicId);
            localStorage.setItem(`lastActiveTopic_${itemId}_${itemType}`, newTopicId);

            uiHelper.showToastNotification('已创建分支话题 "' + newBranchTopicName + '" 并切换。', 'success');

        } catch (error) {
            console.error("閸掓稑缂撻崚鍡樻暜閺冭泛褰傞悽鐔兼晩鐠?", error);
            uiHelper.showToastNotification('创建分支话题失败: ' + error.message, 'error');
        }
    }

    async function handleForwardMessage(target, content, attachments) {
        const { messageInput } = elements;
        
        // 1. Find the target item's full config to select it
        let targetItemFullConfig;
        if (target.type === 'agent') {
            targetItemFullConfig = await electronAPI.getAgentConfig(target.id);
        } else {
            targetItemFullConfig = await electronAPI.getAgentGroupConfig(target.id);
        }

        if (!targetItemFullConfig || targetItemFullConfig.error) {
            uiHelper.showToastNotification('转发失败: 无法读取目标会话配置。', 'error');
            return;
        }

        // 2. Select the item. This will automatically handle finding the last active topic or creating a new one.
        await selectItem(target.id, target.type, target.name, targetItemFullConfig.avatarUrl, targetItemFullConfig);

        // 3. After a brief delay to allow the UI to update from selectItem, populate and send.
        setTimeout(async () => {
            // 4. Populate the message input and attachments ref
            messageInput.value = content;
            
            const uiAttachments = attachments.map(att => ({
                file: { name: att.name, type: att.type, size: att.size },
                localPath: att.src,
                originalName: att.name,
                _fileManagerData: att._fileManagerData || {}
            }));
            attachedFilesRef.set(uiAttachments);
            
            // Manually trigger attachment preview update
            if (mainRendererFunctions.updateAttachmentPreview) {
                mainRendererFunctions.updateAttachmentPreview();
            }
            
            // Manually trigger textarea resize
            uiHelper.autoResizeTextarea(messageInput);

            // 5. Call the standard send message handler to trigger the full AI response flow
            await handleSendMessage();

        }, 200); // 200ms delay seems reasonable for UI transition
    }

    // --- Canvas Integration ---
    const CANVAS_PLACEHOLDER = '{{VCPChatCanvas}}';

    function handleCanvasContentUpdate(data) {
        isCanvasWindowOpen = true;
        const { messageInput } = elements;
        // If the canvas is open and there's content, ensure the placeholder is in the input
        if (!messageInput.value.includes(CANVAS_PLACEHOLDER)) {
            // Add a space for better formatting if the input is not empty
            const prefix = messageInput.value.length > 0 ? ' ' : '';
            messageInput.value += prefix + CANVAS_PLACEHOLDER;
            uiHelper.autoResizeTextarea(messageInput);
        }
    }

    function handleCanvasWindowClosed() {
        isCanvasWindowOpen = false;
        const { messageInput } = elements;
        // Remove the placeholder when the window is closed
        if (messageInput.value.includes(CANVAS_PLACEHOLDER)) {
            // Also remove any surrounding whitespace for cleanliness
            messageInput.value = messageInput.value.replace(new RegExp(`\\s*${CANVAS_PLACEHOLDER}\\s*`, 'g'), '').trim();
            uiHelper.autoResizeTextarea(messageInput);
        }
    }


    async function syncHistoryFromFile(itemId, itemType, topicId) {
        if (!messageRenderer) return;

        // 棣冩暋 濡偓閺屻儲妲搁崥锔芥箒濮濓絽婀潻娑滎攽閻ㄥ嫮绱潏鎴炴惙娴?
        const isEditing = document.querySelector('.message-item-editing');
        if (isEditing) {
            console.log('[Sync] Aborting sync because a message is currently being edited.');
            return;
        }

        // 1. Fetch the latest history from the file
        let newHistory;
        if (itemType === 'agent') {
            newHistory = await electronAPI.getChatHistory(itemId, topicId);
        } else if (itemType === 'group') {
            newHistory = await electronAPI.getGroupChatHistory(itemId, topicId);
        }

        if (!newHistory || newHistory.error) {
            console.error("Sync failed: Could not fetch new history.", newHistory?.error);
            return;
        }

        const oldHistory = currentChatHistoryRef.get();
        let historyInMem = [...oldHistory]; // Create a mutable copy to work with

        const oldHistoryMap = new Map(oldHistory.map(msg => [msg.id, msg]));
        const newHistoryMap = new Map(newHistory.map(msg => [msg.id, msg]));
        const activeStreamingId = window.streamManager ? window.streamManager.getActiveStreamingMessageId() : null;

        // --- Perform UI and Memory updates ---

        // 2. Handle DELETED and MODIFIED messages
        for (const oldMsg of oldHistory) {
            if (oldMsg.id === activeStreamingId) {
                continue; // Protect the currently streaming message
            }
            
            const newMsgData = newHistoryMap.get(oldMsg.id);

            if (!newMsgData) {
                // Message was DELETED from the file
                messageRenderer.removeMessageById(oldMsg.id, false); // Update UI
                const indexToRemove = historyInMem.findIndex(m => m.id === oldMsg.id);
                if (indexToRemove > -1) {
                    historyInMem.splice(indexToRemove, 1); // Update Memory
                }
            } else {
                // Message exists, check for MODIFICATION
                if (JSON.stringify(oldMsg.content) !== JSON.stringify(newMsgData.content)) {
                    if (typeof messageRenderer.updateMessageContent === 'function') {
                        messageRenderer.updateMessageContent(oldMsg.id, newMsgData.content); // Update UI
                    }
                    const indexToUpdate = historyInMem.findIndex(m => m.id === oldMsg.id);
                    if (indexToUpdate > -1) {
                        historyInMem[indexToUpdate] = newMsgData; // Update Memory
                    }
                }
            }
        }

        // 3. Handle ADDED messages
        let messagesWereAdded = false;
        for (const newMsg of newHistory) {
            if (!oldHistoryMap.has(newMsg.id)) {
                // Message was ADDED
                messageRenderer.renderMessage(newMsg, true); // Update UI (true = don't modify history ref inside)
                historyInMem.push(newMsg); // Update Memory
                messagesWereAdded = true;
            }
        }

        // 4. If messages were added or removed, the order might be wrong. Re-sort.
        // Also ensures the streaming message (if any) is at the very end.
        historyInMem.sort((a, b) => {
            if (a.id === activeStreamingId) return 1;
            if (b.id === activeStreamingId) return -1;
            return a.timestamp - b.timestamp;
        });

        // 5. Commit the fully merged and sorted history back to the ref. This is the new source of truth.
        currentChatHistoryRef.set(historyInMem);

        // If messages were added, the DOM order might be incorrect. A full re-render is safest
        // but can cause flicker. For now, we accept this as the individual DOM operations
        // are faster. A subsequent topic load will fix any visual misordering.
        if (messagesWereAdded) {
             console.log('[Sync] New messages were added. DOM might require a refresh to be perfectly ordered.');
        }
    }



    // --- Public API ---
    return {
        init,
        selectItem,
        selectTopic,
        handleTopicDeletion,
        loadChatHistory,
        handleSendMessage,
        createNewTopicForItem,
        displayNoItemSelected,
        attemptTopicSummarizationIfNeeded,
        handleCreateBranch,
        handleForwardMessage,
        removeAttachmentFromMessage,
        addAttachmentsToMessage,
        processFilesData,
        syncHistoryFromFile, // Expose the new function
    };
})();

