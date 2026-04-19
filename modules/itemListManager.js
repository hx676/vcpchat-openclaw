// modules/itemListManager.js

window.itemListManager = (() => {
    let itemListUl;
    let electronAPI;
    let currentSelectedItemRef;
    let mainRendererFunctions;
    let uiHelper;
    let wasSelectionListenerActive = false;
    let loadedItemsCache = [];

    function init(config) {
        if (!config.elements?.itemListUl || !config.electronAPI || !config.refs?.currentSelectedItemRef || typeof config.mainRendererFunctions?.selectItem !== 'function') {
            console.error('[ItemListManager] Missing required init dependencies.');
            return;
        }

        itemListUl = config.elements.itemListUl;
        electronAPI = config.electronAPI;
        currentSelectedItemRef = config.refs.currentSelectedItemRef;
        mainRendererFunctions = config.mainRendererFunctions;
        uiHelper = config.uiHelper;
    }

    function highlightActiveItem(itemId, itemType) {
        if (!itemListUl) return;
        itemListUl.querySelectorAll('li').forEach(item => {
            item.classList.toggle('active', item.dataset.itemId === itemId && item.dataset.itemType === itemType);
        });
    }

    async function saveItemOrder(orderedItemsWithTypes) {
        try {
            const result = await electronAPI.saveCombinedItemOrder(orderedItemsWithTypes);
            if (!result?.success) {
                uiHelper?.showToastNotification?.(`淇濆瓨椤圭洰椤哄簭澶辫触: ${result?.error || '未知错误'}`, 'error');
            }
        } catch (error) {
            console.error('[ItemListManager] Error saving combined item order:', error);
            uiHelper?.showToastNotification?.(`淇濆瓨椤圭洰椤哄簭鍑洪敊: ${error.message}`, 'error');
        }
    }

    function initializeItemSortable() {
        if (!itemListUl || typeof Sortable === 'undefined') return;
        if (itemListUl.sortableInstance) {
            itemListUl.sortableInstance.destroy();
        }

        itemListUl.sortableInstance = new Sortable(itemListUl, {
            animation: 150,
            ghostClass: 'sortable-ghost-main',
            chosenClass: 'sortable-chosen-main',
            dragClass: 'sortable-drag-main',
            onStart: async () => {
                if (electronAPI?.getSelectionListenerStatus) {
                    wasSelectionListenerActive = await electronAPI.getSelectionListenerStatus();
                    if (wasSelectionListenerActive) {
                        electronAPI.toggleSelectionListener(false);
                    }
                }
            },
            onEnd: async (evt) => {
                if (electronAPI?.toggleSelectionListener && wasSelectionListenerActive) {
                    electronAPI.toggleSelectionListener(true);
                }
                wasSelectionListenerActive = false;

                const orderedItems = Array.from(evt.to.children).map((item) => ({
                    id: item.dataset.itemId,
                    type: item.dataset.itemType
                }));
                await saveItemOrder(orderedItems);
            }
        });
    }

    function getDefaultAvatar(item) {
        return item.type === 'agent' ? 'assets/default_avatar.png' : 'assets/default_group_avatar.png';
    }

    function getItemTypeLabel(item) {
        if (item.type === 'group') {
            const config = item.config || item;
            if (config?.silverCompanionManaged === true && config?.silverCompanionRole === 'elder_session') {
                return '老人群';
            }
            if (config?.silverCompanionManaged === true && config?.silverCompanionRole === 'ops_group') {
                return '协作群';
            }
            return '群聊';
        }
        if (item.type === 'channel_mirror') {
            if (item.mirrorChannel === 'feishu') return '飞书';
            if (item.mirrorChannel === 'openclaw-weixin') return '微信';
            return item.mirrorChannel || '镜像';
        }
        return 'Agent';
    }

    function handleDoubleClick(item) {
        if (mainRendererFunctions?.selectItem) {
            mainRendererFunctions.selectItem(item.id, item.type, item.name, item.avatarUrl, item.config || item);
        }
        window.uiManager?.switchToTab?.('settings');
    }

    function handleMiddleClick(item) {
        if (mainRendererFunctions?.selectItem) {
            mainRendererFunctions.selectItem(item.id, item.type, item.name, item.avatarUrl, item.config || item);
        }
        window.uiManager?.switchToTab?.('topics');
    }

    function renderItem(item) {
        const li = document.createElement('li');
        li.dataset.itemId = item.id;
        li.dataset.itemType = item.type;
        li._lastClickTime = 0;
        li._middleClickHandled = false;

        const avatarWrapper = document.createElement('div');
        avatarWrapper.className = 'avatar-wrapper';

        const avatarImg = document.createElement('img');
        avatarImg.className = 'avatar';
        avatarImg.src = item.avatarUrl
            ? `${item.avatarUrl}${item.avatarUrl.includes('?') ? '&' : '?'}t=${Date.now()}`
            : getDefaultAvatar(item);
        avatarImg.alt = `${item.name} avatar`;
        avatarImg.onerror = () => {
            avatarImg.src = getDefaultAvatar(item);
        };
        avatarWrapper.appendChild(avatarImg);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'agent-name';
        nameSpan.textContent = `${item.name} (${getItemTypeLabel(item)})`;

        if (item.type === 'agent' && item.config && !item.config.disableCustomColors) {
            if (item.config.avatarBorderColor) {
                avatarImg.style.borderColor = item.config.avatarBorderColor;
            }
            if (item.config.nameTextColor) {
                nameSpan.style.color = item.config.nameTextColor;
            }
        }

        li.appendChild(avatarWrapper);
        li.appendChild(nameSpan);

        li.addEventListener('auxclick', (event) => {
            if (event.button !== 1) return;
            event.preventDefault();
            event.stopPropagation();
            li._middleClickHandled = true;
            handleMiddleClick(item);
        });

        li.addEventListener('click', (event) => {
            if (li._middleClickHandled) {
                li._middleClickHandled = false;
                return;
            }

            const currentTime = Date.now();
            const isDoubleClick = event.button === 0 && (currentTime - li._lastClickTime) < 300;
            li._lastClickTime = currentTime;

            if (isDoubleClick) {
                event.preventDefault();
                event.stopPropagation();
                handleDoubleClick(item);
                return;
            }

            if (event.button === 0 && mainRendererFunctions?.selectItem) {
                mainRendererFunctions.selectItem(item.id, item.type, item.name, item.avatarUrl, item.config || item);
            }
        });

        return li;
    }

    async function loadItems() {
        if (!itemListUl || !electronAPI) {
            console.error('[ItemListManager] Cannot load items. Module not initialized or missing dependencies.');
            return;
        }

        itemListUl.innerHTML = '<li><div class=\"loading-spinner-small\"></div>加载列表中...</li>';
        const allItemsResult = await electronAPI.getAllItems();
        itemListUl.innerHTML = '';

        if (!allItemsResult?.success || !Array.isArray(allItemsResult.items)) {
            itemListUl.innerHTML = `<li>加载项目失败: ${allItemsResult?.error || '未知错误'}</li>`;
            loadedItemsCache = [];
            return;
        }

        let items = allItemsResult.items.map(item => ({
            ...item,
            avatarUrl: item.avatarUrl || getDefaultAvatar(item)
        }));
        loadedItemsCache = [...items];

        let combinedOrderFromSettings = [];
        try {
            const settings = await electronAPI.loadSettings();
            if (Array.isArray(settings?.combinedItemOrder)) {
                combinedOrderFromSettings = settings.combinedItemOrder;
            }
        } catch (error) {
            console.warn('[ItemListManager] Could not load combinedItemOrder from settings:', error);
        }

        if (combinedOrderFromSettings.length > 0) {
            const itemMap = new Map(items.map(item => [`${item.type}_${item.id}`, item]));
            const orderedItems = [];
            combinedOrderFromSettings.forEach(entry => {
                const key = `${entry.type}_${entry.id}`;
                if (itemMap.has(key)) {
                    orderedItems.push(itemMap.get(key));
                    itemMap.delete(key);
                }
            });
            orderedItems.push(...itemMap.values());
            items = orderedItems;
        } else {
            items.sort((a, b) => {
                if (a.type !== b.type) {
                    if (a.type === 'channel_mirror') return 1;
                    if (b.type === 'channel_mirror') return -1;
                    return a.type === 'group' ? -1 : 1;
                }
                return (a.name || '').localeCompare(b.name || '', 'zh-Hans-CN');
            });
        }

        if (items.length === 0) {
            itemListUl.innerHTML = '<li>没有找到可用项目。</li>';
            return;
        }

        const fragment = document.createDocumentFragment();
        items.forEach(item => fragment.appendChild(renderItem(item)));
        itemListUl.appendChild(fragment);

        const currentSelectedItem = currentSelectedItemRef.get();
        if (currentSelectedItem?.id) {
            highlightActiveItem(currentSelectedItem.id, currentSelectedItem.type);
        }

        initializeItemSortable();
        refreshUnreadCounts();
    }

    function refreshUnreadCounts() {
        if (!electronAPI) return;
        electronAPI.getUnreadTopicCounts()
            .then(result => {
                if (result?.success) {
                    updateUnreadBadges(result.counts);
                }
            })
            .catch(err => console.error('[ItemListManager] Failed to fetch unread counts:', err));
    }

    function resetMouseEventStates() {
        itemListUl?.querySelectorAll('li').forEach((item) => {
            item._lastClickTime = 0;
            item._middleClickHandled = false;
        });
    }

    function findItemById(itemId, itemType) {
        return loadedItemsCache.find(item => item.id === itemId && item.type === itemType) || null;
    }

    function updateUnreadBadges(counts) {
        if (!itemListUl) return;
        const listItems = itemListUl.querySelectorAll('li[data-item-type=\"agent\"]');
        listItems.forEach((listItem) => {
            const agentId = listItem.dataset.itemId;
            const count = counts[agentId];
            const avatarWrapper = listItem.querySelector('.avatar-wrapper');
            const existingBadge = listItem.querySelector('.unread-badge');

            if (count !== undefined && (count > 0 || count === 0)) {
                const displayCount = count > 0 ? count.toString() : '';
                const isDotOnly = count === 0;
                if (existingBadge) {
                    existingBadge.textContent = displayCount;
                    existingBadge.classList.toggle('unread-badge-dot-only', isDotOnly);
                } else if (avatarWrapper) {
                    const unreadBadge = document.createElement('span');
                    unreadBadge.className = 'unread-badge';
                    if (isDotOnly) {
                        unreadBadge.classList.add('unread-badge-dot-only');
                    }
                    unreadBadge.textContent = displayCount;
                    avatarWrapper.appendChild(unreadBadge);
                }
            } else if (existingBadge) {
                existingBadge.remove();
            }
        });
    }

    function updateLoadedItemConfig(itemId, itemType, partialConfig) {
        const matchedItem = loadedItemsCache.find(item => item.id === itemId && item.type === itemType);
        if (!matchedItem) return false;
        matchedItem.config = {
            ...(matchedItem.config || {}),
            ...partialConfig
        };
        return true;
    }

    return {
        init,
        loadItems,
        highlightActiveItem,
        resetMouseEventStates,
        findItemById,
        updateLoadedItemConfig,
        updateUnreadBadges,
        refreshUnreadCounts,
    };
})();
