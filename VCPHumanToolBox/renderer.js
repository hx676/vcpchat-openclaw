// VCPHumanToolBox/renderer.js
import { tools } from './renderer_modules/config.js';
import * as canvasHandler from './renderer_modules/ui/canvas-handler.js';
import * as dynamicImageHandler from './renderer_modules/ui/dynamic-image-handler.js';

document.addEventListener('DOMContentLoaded', async () => {
    // --- 鍏冪礌鑾峰彇 ---
    const toolGrid = document.getElementById('tool-grid');
    const toolDetailView = document.getElementById('tool-detail-view');
    const backToGridBtn = document.getElementById('back-to-grid-btn');
    const toolTitle = document.getElementById('tool-title');
    const toolDescription = document.getElementById('tool-description');
    const toolForm = document.getElementById('tool-form');
    const resultContainer = document.getElementById('result-container');

    // --- 鍏ㄥ眬鍙橀噺 ---
    let VCP_SERVER_URL = '';
    let VCP_API_KEY = '';
    let USER_NAME = 'Human';
    let settings = {};
    let MAX_FILENAME_LENGTH = 400;

    // --- 璁剧疆鍔犺浇涓庝繚瀛?---
    async function loadSettings() {
        try {
            settings = await window.electronAPI.invoke('vcp-ht-get-settings');
        } catch (error) {
            console.error('Failed to load settings:', error);
            settings = {};
        }
    }

    async function saveSettings() {
        try {
            const result = await window.electronAPI.invoke('vcp-ht-save-settings', settings);
            if (!result.success) {
                throw new Error(result.error);
            }
            console.log('[VCPHumanToolBox] Settings saved successfully');
        } catch (error) {
            console.error('[VCPHumanToolBox] Failed to save settings:', error);
            throw error;
        }
    }

    // --- 鍒濆鍖栧簲鐢ㄧ▼搴?---
    async function initializeApp() {
        await loadSettings();

        if (settings.vcpServerUrl) {
            try {
                const url = new URL(settings.vcpServerUrl);
                url.pathname = '/v1/human/tool';
                VCP_SERVER_URL = url.toString();
            } catch (e) {
                console.error("Invalid vcpServerUrl in settings:", settings.vcpServerUrl);
            }
        }
        VCP_API_KEY = settings.vcpApiKey || '';
        USER_NAME = settings.userName || 'Human';
        MAX_FILENAME_LENGTH = settings.maxFilenameLength || 400;
        
        // 鍔ㄦ€佸姞杞芥ā鍧楀苟浼犻€掗厤缃?
        // 娉ㄦ剰锛氱敱浜庣Щ闄や簡 require锛屾ā鍧楅渶瑕侀噸鏋勪负娴忚鍣ㄥ吋瀹圭殑鏍煎紡
        canvasHandler.setMaxFilenameLength(MAX_FILENAME_LENGTH);

        if (!VCP_SERVER_URL || !VCP_API_KEY) {
            toolGrid.innerHTML = `<div class="error">閿欒锛氭棤娉曞姞杞介厤缃枃浠?(settings.json)銆傝纭繚鏂囦欢瀛樺湪涓旀牸寮忔纭€?br>鏈兘浠?settings.json 涓壘鍒?vcpServerUrl 鎴?vcpApiKey</div>`;
            return;
        }

        initializeUI();
    }
    


    // --- 鍑芥暟瀹氫箟 ---

    function renderToolGrid() {
        toolGrid.innerHTML = '';
        for (const toolName in tools) {
            const tool = tools[toolName];
            const card = document.createElement('div');
            card.className = 'tool-card';
            card.dataset.toolName = toolName;
            card.innerHTML = `
                <h3>${tool.displayName}</h3>
                <p>${tool.description}</p>
            `;
            card.addEventListener('click', () => showToolDetail(toolName));
            toolGrid.appendChild(card);
        }
    }

    function showToolDetail(toolName) {
        const tool = tools[toolName];
        toolTitle.textContent = tool.displayName;
        toolDescription.textContent = tool.description;
        
        buildToolForm(toolName);

        toolGrid.style.display = 'none';
        toolDetailView.style.display = 'block';
        resultContainer.innerHTML = '';
    }

    function buildToolForm(toolName) {
        const tool = tools[toolName];
        toolForm.innerHTML = '';
        const paramsContainer = document.createElement('div');
        paramsContainer.id = 'params-container';

        if (tool.commands) {
            const commandSelectGroup = document.createElement('div');
            commandSelectGroup.className = 'form-group';
            commandSelectGroup.innerHTML = `<label for="command-select">閫夋嫨鎿嶄綔 (Command):</label>`;
            const commandSelect = document.createElement('select');
            commandSelect.id = 'command-select';
            commandSelect.name = 'command';
            
            for (const commandName in tool.commands) {
                const option = document.createElement('option');
                option.value = commandName;
                option.textContent = `${commandName} - ${tool.commands[commandName].description}`;
                commandSelect.appendChild(option);
            }
            commandSelectGroup.appendChild(commandSelect);
            toolForm.appendChild(commandSelectGroup);
            
            toolForm.appendChild(paramsContainer);

            commandSelect.addEventListener('change', (e) => {
                renderFormParams(tool.commands[e.target.value].params, paramsContainer, toolName, e.target.value);
            });
            renderFormParams(tool.commands[commandSelect.value].params, paramsContainer, toolName, commandSelect.value);

        } else {
            toolForm.appendChild(paramsContainer);
            renderFormParams(tool.params, paramsContainer, toolName);
        }

        // 娣诲姞鎸夐挳瀹瑰櫒
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; gap: 10px; margin-top: 15px; flex-wrap: wrap;';
        
        const submitButton = document.createElement('button');
        submitButton.type = 'submit';
        submitButton.textContent = '鎵ц';
        submitButton.style.cssText = `
            background-color: var(--success-color);
            color: var(--text-on-accent);
            border: none;
            padding: 12px 25px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
            transition: background-color 0.2s;
        `;
        buttonContainer.appendChild(submitButton);
        
        // 娣诲姞鍏ㄩ儴娓呯┖鎸夐挳
        const clearAllButton = document.createElement('button');
        clearAllButton.type = 'button';
        clearAllButton.innerHTML = '馃棏锔?鍏ㄩ儴娓呯┖';
        clearAllButton.style.cssText = `
            background-color: var(--warning-color, #f59e0b);
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
        `;
        
        clearAllButton.addEventListener('click', () => {
            clearAllFormData(toolName);
        });
        
        buttonContainer.appendChild(clearAllButton);

        // 涓?ComfyUI 宸ュ叿娣诲姞璁剧疆鎸夐挳
        if (toolName === 'ComfyUIGen') {
            const settingsButton = document.createElement('button');
            settingsButton.type = 'button';
            settingsButton.textContent = '鈿欙笍 璁剧疆';
            settingsButton.className = 'back-btn';
            settingsButton.style.cssText = 'margin-left: auto;';
            settingsButton.addEventListener('click', () => openComfyUISettings());
            buttonContainer.appendChild(settingsButton);
        }
        
        // 涓?NanoBananaGen 宸ュ叿娣诲姞鏂囦欢鍚嶈缃寜閽?
        if (toolName === 'NanoBananaGen') {
            const filenameSettingsButton = document.createElement('button');
            filenameSettingsButton.type = 'button';
            filenameSettingsButton.innerHTML = '鈿欙笍 璁剧疆';
            filenameSettingsButton.style.cssText = `
                background-color: var(--secondary-color, #6b7280);
                color: white;
                border: none;
                padding: 12px 20px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.2s;
            `;
            
            filenameSettingsButton.addEventListener('click', () => {
                showFilenameSettings();
            });
            
            buttonContainer.appendChild(filenameSettingsButton);
        }

        toolForm.appendChild(buttonContainer);

        toolForm.onsubmit = (e) => {
            e.preventDefault();
            executeTool(toolName);
        };
    }

    function renderFormParams(params, container, toolName = '', commandName = '') {
        container.innerHTML = '';
        const dependencyListeners = [];

        // 妫€鏌ユ槸鍚︿负 NanoBananaGen 鐨?compose 鍛戒护
        const isNanoBananaCompose = toolName === 'NanoBananaGen' && commandName === 'compose';
        let imageUrlCounter = 1; // 鐢ㄤ簬鍔ㄦ€佸浘鐗囪緭鍏ユ鐨勮鏁板櫒

        params.forEach(param => {
            const paramGroup = document.createElement('div');
            paramGroup.className = 'form-group';
            
            let labelText = param.description || param.name;
            const label = document.createElement('label');
            label.textContent = `${labelText}${param.required ? ' *' : ''}`;
            
            let input;
            if (param.type === 'textarea') {
                input = document.createElement('textarea');
            } else if (param.type === 'select') {
                input = document.createElement('select');
                param.options.forEach(opt => {
                    const option = document.createElement('option');
                    option.value = opt;
                    option.textContent = opt || `(${param.name})`;
                    input.appendChild(option);
                });
            } else if (param.type === 'radio') {
                input = document.createElement('div');
                input.className = 'radio-group';
                param.options.forEach(opt => {
                    const radioLabel = document.createElement('label');
                    const radioInput = document.createElement('input');
                    radioInput.type = 'radio';
                    radioInput.name = param.name;
                    radioInput.value = opt;
                    if (opt === param.default) radioInput.checked = true;
                    
                    radioLabel.appendChild(radioInput);
                    radioLabel.append(` ${opt}`);
                    input.appendChild(radioLabel);

                    // Add listener for dependency changes
                    radioInput.addEventListener('change', () => {
                        dependencyListeners.forEach(listener => listener());
                    });
                });
            } else if (param.type === 'dragdrop_image') {
                // 鍒涘缓鎷栨嫿涓婁紶鍥剧墖杈撳叆妗?
                input = canvasHandler.createDragDropImageInput(param);

            } else if (param.type === 'checkbox') {
                input = document.createElement('div');
                input.className = 'checkbox-group';
                
                const checkboxLabel = document.createElement('label');
                checkboxLabel.className = 'checkbox-label';
                checkboxLabel.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    margin-top: 5px;
                `;
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.name = param.name;
                checkbox.checked = param.default || false;
                
                const checkboxText = document.createElement('span');
                checkboxText.textContent = param.description || param.name;
                
                checkboxLabel.appendChild(checkbox);
                checkboxLabel.appendChild(checkboxText);
                input.appendChild(checkboxLabel);
                
                // 娣诲姞缈昏瘧鐩稿叧鐨刄I鍏冪礌
                if (param.name === 'enable_translation') {
                    const translationContainer = createTranslationContainer(param.name);
                    input.appendChild(translationContainer);
                    
                    // 鐩戝惉 checkbox 鐘舵€佸彉鍖?
                    checkbox.addEventListener('change', (e) => {
                        const container = input.querySelector('.translation-container');
                        if (container) {
                            container.style.display = e.target.checked ? 'block' : 'none';
                        }
                    });
                }
            } else {
                input = document.createElement('input');
                input.type = param.type || 'text';
                
                // 涓烘暟瀛楃被鍨嬫坊鍔犲睘鎬ф敮鎸?
                if (input.type === 'number') {
                    if (param.min !== undefined) input.min = param.min;
                    if (param.max !== undefined) input.max = param.max;
                    // 榛樿姝ラ暱涓?any锛屽厑璁歌緭鍏ュ皬鏁帮紝闄ら潪鍙︽湁鎸囧畾
                    input.step = param.step || 'any';
                }
            }
            
            if (input.tagName !== 'DIV' || param.type === 'dragdrop_image') {
                input.name = param.name;
                if (param.type !== 'dragdrop_image') {
                    input.placeholder = param.placeholder || '';
                    if (param.default) input.value = param.default;
                }
                if (param.required) input.required = true;
            } else {
                // For radio group, we need a hidden input to carry the name for FormData
                const hiddenInput = document.createElement('input');
                hiddenInput.type = 'hidden';
                hiddenInput.name = param.name;
                paramGroup.appendChild(hiddenInput);
            }

            paramGroup.appendChild(label);
            paramGroup.appendChild(input);
            container.appendChild(paramGroup);

            // Handle conditional visibility
            if (param.dependsOn) {
                const dependencyCheck = () => {
                    const dependencyField = toolForm.querySelector(`[name="${param.dependsOn.field}"]:checked`) || toolForm.querySelector(`[name="${param.dependsOn.field}"]`);
                    if (dependencyField && dependencyField.value === param.dependsOn.value) {
                        paramGroup.style.display = '';
                    } else {
                        paramGroup.style.display = 'none';
                    }
                };
                dependencyListeners.push(dependencyCheck);
            }
        });

        // 濡傛灉鏄?NanoBanana compose 妯″紡锛屾坊鍔犲姩鎬佸浘鐗囩鐞嗗尯鍩?
        if (isNanoBananaCompose) {
            dynamicImageHandler.createDynamicImageContainer(container);
        }

        dependencyListeners.forEach(listener => listener());
    }

    // 鍒涘缓缈昏瘧瀹瑰櫒
    function createTranslationContainer(paramName) {
        const container = document.createElement('div');
        container.className = 'translation-container';
        container.style.cssText = `
            display: none;
            margin-top: 10px;
            padding: 15px;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            background: rgba(59, 130, 246, 0.05);
        `;
        
        // 缈昏瘧璁剧疆鍖哄煙
        const settingsArea = document.createElement('div');
        settingsArea.style.cssText = `
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
            align-items: center;
            flex-wrap: wrap;
        `;
        
        const qualityLabel = document.createElement('label');
        qualityLabel.textContent = '璐ㄩ噺锛?;
        qualityLabel.style.cssText = `
            font-weight: bold;
            color: var(--secondary-text);
            font-size: 14px;
        `;
        
        const qualitySelect = document.createElement('select');
        qualitySelect.className = 'translation-quality-select';
        qualitySelect.innerHTML = `
            <option value="gemini-2.5-flash-lite-preview-06-17">蹇€?/option>
            <option value="gemini-2.5-flash" selected>鍧囪　</option>
            <option value="gemini-2.5-pro">璐ㄩ噺</option>
        `;
        qualitySelect.style.cssText = `
            padding: 6px 12px;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            background: var(--input-bg);
            color: var(--primary-text);
        `;
        
        const languageLabel = document.createElement('label');
        languageLabel.textContent = '鐩爣璇█锛?;
        languageLabel.style.cssText = `
            font-weight: bold;
            color: var(--secondary-text);
            font-size: 14px;
        `;
        
        const languageSelect = document.createElement('select');
        languageSelect.className = 'translation-language-select';
        languageSelect.innerHTML = `
            <option value="en" selected>鑻辫</option>
            <option value="zh">涓枃</option>
            <option value="ja">鏃ヨ</option>
            <option value="ko">闊╄</option>
            <option value="fr">娉曡</option>
            <option value="de">寰疯</option>
            <option value="es">瑗跨彮鐗欒</option>
        `;
        languageSelect.style.cssText = `
            padding: 6px 12px;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            background: var(--input-bg);
            color: var(--primary-text);
        `;
        
        settingsArea.appendChild(qualityLabel);
        settingsArea.appendChild(qualitySelect);
        settingsArea.appendChild(languageLabel);
        settingsArea.appendChild(languageSelect);
        
        const translatedPromptLabel = document.createElement('label');
        translatedPromptLabel.textContent = '缈昏瘧鍚庣殑鎻愮ず璇嶏細';
        translatedPromptLabel.style.cssText = `
            display: block;
            margin-bottom: 8px;
            font-weight: bold;
            color: var(--secondary-text);
        `;
        
        const translatedPromptArea = document.createElement('textarea');
        translatedPromptArea.className = 'translated-prompt';
        translatedPromptArea.placeholder = '缈昏瘧缁撴灉灏嗘樉绀哄湪杩欓噷鈥?;
        translatedPromptArea.readOnly = false; // 鍏佽鐢ㄦ埛缂栬緫
        translatedPromptArea.style.cssText = `
            width: 100%;
            min-height: 80px;
            padding: 10px;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            background: var(--input-bg);
            color: var(--primary-text);
            font-family: inherit;
            resize: vertical;
            box-sizing: border-box;
        `;
        
        const buttonGroup = document.createElement('div');
        buttonGroup.style.cssText = `
            display: flex;
            gap: 10px;
            margin-top: 10px;
        `;
        
        const translateButton = document.createElement('button');
        translateButton.type = 'button';
        translateButton.innerHTML = '馃實 缈昏瘧';
        translateButton.style.cssText = `
            background: var(--primary-color);
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        `;
        
        const useOriginalButton = document.createElement('button');
        useOriginalButton.type = 'button';
        useOriginalButton.innerHTML = '猬咃笍 浣跨敤鍘熸枃';
        useOriginalButton.style.cssText = `
            background: var(--warning-color, #f59e0b);
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        `;
        
        // 缈昏瘧鍔熻兘
        translateButton.addEventListener('click', async () => {
            const promptTextarea = toolForm.querySelector('textarea[name="prompt"]');
            if (promptTextarea && promptTextarea.value.trim()) {
                const quality = qualitySelect.value;
                const targetLang = languageSelect.value;
                await translatePrompt(promptTextarea.value, translatedPromptArea, translateButton, quality, targetLang);
            } else {
                alert('璇峰厛杈撳叆鎻愮ず璇?);
            }
        });
        
        // 浣跨敤鍘熸枃
        useOriginalButton.addEventListener('click', () => {
            const promptTextarea = toolForm.querySelector('textarea[name="prompt"]');
            if (promptTextarea) {
                translatedPromptArea.value = promptTextarea.value;
            }
        });
        
        buttonGroup.appendChild(translateButton);
        buttonGroup.appendChild(useOriginalButton);
        
        container.appendChild(settingsArea);
        container.appendChild(translatedPromptLabel);
        container.appendChild(translatedPromptArea);
        container.appendChild(buttonGroup);
        
        return container;
    }

    // 缈昏瘧鎻愮ず璇?
    async function translatePrompt(text, outputTextarea, button, quality = 'gemini-2.5-flash', targetLang = 'en') {
        const originalText = button.innerHTML;
        button.innerHTML = '馃攧 缈昏瘧涓?..';
        button.disabled = true;
        
        try {
            // 鑾峰彇鐩爣璇█鍚嶇О
            const languageMap = {
                'en': '鑻辫',
                'zh': '涓枃', 
                'ja': '鏃ヨ',
                'ko': '闊╄',
                'fr': '娉曡',
                'de': '寰疯',
                'es': '瑗跨彮鐗欒'
            };
            
            const targetLanguageText = languageMap[targetLang] || '鑻辫';
            
            // 鏋勫缓绯荤粺鎻愮ず璇嶏紙涓?VCPChat 缈昏瘧妯″潡淇濇寔涓€鑷达級
            const systemPrompt = `浣犳槸涓€涓笓涓氱殑缈昏瘧鍔╂墜銆傝灏嗙敤鎴锋彁渚涚殑鏂囨湰缈昏瘧鎴?{targetLanguageText}銆?浠呰繑鍥炵炕璇戠粨鏋滐紝涓嶈鍖呭惈浠讳綍瑙ｉ噴鎴栭澶栦俊鎭€俙;
            
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: text }
            ];
            
            // 浣跨敤 VCP 鐨?chat 鎺ュ彛杩涜缈昏瘧
            const chatUrl = VCP_SERVER_URL.replace('/v1/human/tool', '/v1/chat/completions');
            const response = await fetch(chatUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${VCP_API_KEY}`
                },
                body: JSON.stringify({
                    messages: messages,
                    model: quality,
                    temperature: 0.7,
                    max_tokens: 50000,
                    stream: false
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`鏈嶅姟鍣ㄩ敊璇? ${response.status} ${response.statusText} - ${errorText}`);
            }
            
            const result = await response.json();
            const translation = result.choices?.[0]?.message?.content;
            
            if (translation) {
                outputTextarea.value = translation.trim();
            } else {
                throw new Error('API 杩斿洖鐨勫搷搴斾腑娌℃湁鏈夋晥鐨勭炕璇戝唴瀹广€?);
            }
        } catch (error) {
            console.error('缈昏瘧澶辫触:', error);
            outputTextarea.value = `缈昏瘧澶辫触: ${error.message}\n\n鍘熸枃: ${text}`;
        } finally {
            button.innerHTML = originalText;
            button.disabled = false;
        }
    }

    // 鍏ㄩ儴娓呯┖鍔熻兘
    function clearAllFormData(toolName) {
        const confirmed = confirm('纭畾瑕佹竻绌烘墍鏈夊唴瀹瑰悧锛熷寘鎷彁绀鸿瘝銆佺炕璇戝唴瀹广€佸浘鐗囧拰棰濆鍥剧墖銆?);
        
        if (!confirmed) return;
        
        // 1. 娓呯┖鎵€鏈夎緭鍏ユ
        const inputs = toolForm.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            if (input.type === 'checkbox' || input.type === 'radio') {
                input.checked = input.defaultChecked || false;
            } else if (input.tagName === 'SELECT') {
                input.selectedIndex = 0; // 閲嶇疆涓洪粯璁ら€夐」
            } else {
                input.value = '';
            }
        });
        
        // 2. 娓呯┖缈昏瘧瀹瑰櫒
        const translationContainers = toolForm.querySelectorAll('.translation-container');
        translationContainers.forEach(container => {
            const translatedPrompt = container.querySelector('.translated-prompt');
            if (translatedPrompt) {
                translatedPrompt.value = '';
            }
            // 闅愯棌缈昏瘧瀹瑰櫒
            container.style.display = 'none';
        });
        
        // 3. 娓呯┖鍥剧墖棰勮鍖哄煙
        const previewAreas = toolForm.querySelectorAll('.image-preview-area');
        previewAreas.forEach(preview => {
            preview.style.display = 'none';
            preview.innerHTML = '';
        });
        
        // 4. 鏄剧ず鎵€鏈夋嫋鎷藉尯鍩燂紝闅愯棌娓呯┖鎸夐挳
        const dropZones = toolForm.querySelectorAll('.drop-zone');
        const clearButtons = toolForm.querySelectorAll('.clear-image-btn');
        
        dropZones.forEach(dropZone => {
            dropZone.style.display = 'block';
            dropZone.innerHTML = `
                <div class="drop-icon">馃搧</div>
                <div class="drop-text">鎷栨嫿鍥剧墖鏂囦欢鍒版澶勬垨鐐瑰嚮閫夋嫨</div>
            `;
            dropZone.style.color = 'var(--secondary-text)';
        });
        
        clearButtons.forEach(btn => {
            btn.style.display = 'none';
        });
        
        // 5. 娓呯┖鍔ㄦ€佸浘鐗囧尯鍩燂紙浠呴檺 NanoBananaGen compose 妯″紡锛?
        if (toolName === 'NanoBananaGen') {
            const dynamicContainer = toolForm.querySelector('.dynamic-images-container');
            if (dynamicContainer) {
                const imagesList = dynamicContainer.querySelector('.sortable-images-list');
                if (imagesList) {
                    // 娓呯┖鎵€鏈夊姩鎬佹坊鍔犵殑鍥剧墖
                    const dynamicItems = imagesList.querySelectorAll('.dynamic-image-item');
                    dynamicItems.forEach(item => {
                        item.remove();
                    });
                }
            }
        }
        
        // 6. 娓呯┖缁撴灉瀹瑰櫒
        if (resultContainer) {
            resultContainer.innerHTML = '';
        }
        
        // 7. 鏄剧ず鎴愬姛鎻愮ず
        const successMessage = document.createElement('div');
        successMessage.className = 'success-notification';
        successMessage.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--success-color);
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            z-index: 1000;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        `;
        successMessage.textContent = '鉁?宸叉竻绌烘墍鏈夊唴瀹?;
        document.body.appendChild(successMessage);
        
        // 3绉掑悗绉婚櫎鎻愮ず
        setTimeout(() => {
            if (successMessage.parentNode) {
                successMessage.classList.add('removing');
                setTimeout(() => {
                    if (successMessage.parentNode) {
                        successMessage.parentNode.removeChild(successMessage);
                    }
                }, 300);
            }
        }, 2700);
    }

    // 鏄剧ず鏂囦欢鍚嶈缃璇濇
    function showFilenameSettings() {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 10000;
            display: flex;
            justify-content: center;
            align-items: center;
        `;
        
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: var(--card-bg);
            border-radius: 8px;
            padding: 30px;
            width: 90%;
            width: 90%;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            border: 1px solid var(--border-color);
        `;
        
        dialog.innerHTML = `
            <h3 style="margin: 0 0 20px 0; color: var(--primary-text); text-align: center;">鏂囦欢鍚嶆樉绀鸿缃?/h3>
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 8px; color: var(--secondary-text); font-weight: bold;">
                    鏂囦欢鍚嶆渶澶ч暱搴︼紙瓒呰繃鍒欑渷鐣ワ級锛?
                </label>
                <input type="number" id="filename-length-input" 
                    value="${MAX_FILENAME_LENGTH}" 
                    min="50" 
                    max="1000" 
                    style="
                        width: 100%;
                        padding: 10px;
                        border: 1px solid var(--border-color);
                        border-radius: 4px;
                        background: var(--input-bg);
                        color: var(--primary-text);
                        font-size: 14px;
                        box-sizing: border-box;
                    "
                >
                <div style="font-size: 12px; color: var(--secondary-text); margin-top: 5px;">
                    寤鸿鑼冨洿锛?0-1000 瀛楃锛岄粯璁や负 400
                </div>
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button id="cancel-btn" style="
                    background: var(--secondary-color, #6b7280);
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                ">鍙栨秷</button>
                <button id="save-btn" style="
                    background: var(--primary-color);
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                ">淇濆瓨</button>
            </div>
        `;
        
        const input = dialog.querySelector('#filename-length-input');
        const cancelBtn = dialog.querySelector('#cancel-btn');
        const saveBtn = dialog.querySelector('#save-btn');
        
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(overlay);
        });
        
        saveBtn.addEventListener('click', async () => {
            const newLength = parseInt(input.value, 10);
            if (newLength >= 50 && newLength <= 1000) {
                MAX_FILENAME_LENGTH = newLength;
                settings.maxFilenameLength = newLength;
                
                try {
                    await saveSettings();
                    
                    // 鏄剧ず鎴愬姛鎻愮ず
                    const successMsg = document.createElement('div');
                    successMsg.className = 'success-notification';
                    successMsg.style.cssText = `
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        background: var(--success-color);
                        color: white;
                        padding: 12px 20px;
                        border-radius: 6px;
                        z-index: 10001;
                        font-size: 14px;
                        font-weight: 500;
                    `;
                    successMsg.textContent = '鉁?璁剧疆宸蹭繚瀛?;
                    document.body.appendChild(successMsg);
                    
                    setTimeout(() => {
                        if (successMsg.parentNode) {
                            successMsg.parentNode.removeChild(successMsg);
                        }
                    }, 2000);
                    
                    document.body.removeChild(overlay);
                } catch (saveError) {
                    console.error('[VCPHumanToolBox] Failed to save settings:', saveError);
                    alert('淇濆瓨璁剧疆澶辫触锛? + saveError.message);
                }
            } else {
                alert('璇疯緭鍏?50-1000 涔嬮棿鐨勬暟鍊?);
            }
        });
        
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        
        // 鐐瑰嚮鑳屾櫙鍏抽棴
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
            }
        });
    }

    async function executeTool(toolName) {
        const formData = new FormData(toolForm);
        const args = {};
        let finalToolName = toolName;

        const tool = tools[toolName];
        // The finalToolName is always the toolName. The 'command' is an argument.

        for (let [key, value] of formData.entries()) {
            // Handle checkbox
            const inputElement = toolForm.querySelector(`[name="${key}"]`);
            if (inputElement && inputElement.type === 'checkbox') {
                args[key] = inputElement.checked;
            } else if (value) {
                args[key] = value;
            }
        }

        resultContainer.innerHTML = '<div class="loader"></div>';

        try {
            const result = await window.electronAPI.invoke('vcp-ht-execute-tool-proxy', {
                url: VCP_SERVER_URL,
                apiKey: VCP_API_KEY,
                toolName: finalToolName,
                userName: USER_NAME,
                args: args
            });

            if (result.success) {
                renderResult(result.data, toolName);
            } else {
                renderResult({ status: 'error', error: result.error }, toolName);
            }
        } catch (error) {
            renderResult({ status: 'error', error: error.message }, toolName);
        }
    }

    function renderResult(data, toolName) {
        resultContainer.innerHTML = '';
    
        // 1. Handle errors first
        if (data.status === 'error' || data.error) {
            const errorMessage = data.error || data.message || '鏈煡閿欒';
            const pre = document.createElement('pre');
            pre.className = 'error';
            pre.textContent = typeof errorMessage === 'object' ? JSON.stringify(errorMessage, null, 2) : errorMessage;
            resultContainer.appendChild(pre);
            return; // Exit on error, no images to process
        }
    
        // 2. Extract the core content, handling nested JSON from certain tools
        let content = data.result || data.message || data;
        if (content && typeof content.content === 'string') {
            try {
                const parsedContent = JSON.parse(content.content);
                // Prioritize 'original_plugin_output' as it often contains the final, formatted result.
                content = parsedContent.original_plugin_output || parsedContent;
            } catch (e) {
                // If it's not a valid JSON string, just use the string from 'content' property.
                content = content.content;
            }
        }
    
        // 3. Render content based on its type
        if (content == null) {
            const p = document.createElement('p');
            p.textContent = '鎻掍欢鎵ц瀹屾瘯锛屼絾娌℃湁杩斿洖鏄庣‘鍐呭銆?;
            resultContainer.appendChild(p);
        } else if (content && Array.isArray(content.content)) { // Multi-modal content (e.g., from GPT-4V)
            content.content.forEach(item => {
                if (item.type === 'text') {
                    const pre = document.createElement('pre');
                    pre.textContent = item.text;
                    resultContainer.appendChild(pre);
                } else if (item.type === 'image_url' && item.image_url && item.image_url.url) {
                    const imgElement = document.createElement('img');
                    imgElement.src = item.image_url.url;
                    resultContainer.appendChild(imgElement);
                }
            });
        } else if (typeof content === 'string' && (content.startsWith('data:image') || /\.(jpg|jpeg|png|gif|webp)$/i.test(content))) { // Direct image URL string
            const imgElement = document.createElement('img');
            imgElement.src = content;
            resultContainer.appendChild(imgElement);
        } else if (typeof content === 'string') { // Markdown/HTML string
            const div = document.createElement('div');
            // Use marked to render markdown, which will also render raw HTML like <img> tags
            if (window.marked && typeof window.marked.parse === 'function') {
                div.innerHTML = window.marked.parse(content);
            } else {
                console.error("'marked' library not loaded. Displaying content as plain text.");
                div.textContent = content;
            }
            resultContainer.appendChild(div);
        } else if (toolName === 'TavilySearch' && content && (content.results || content.images)) {
            const searchResultsWrapper = document.createElement('div');
            searchResultsWrapper.className = 'tavily-search-results';

            // Render images
            if (content.images && content.images.length > 0) {
                const imagesContainer = document.createElement('div');
                imagesContainer.className = 'tavily-images-container';
                content.images.forEach(image => {
                    const imageWrapper = document.createElement('figure');
                    imageWrapper.className = 'tavily-image-wrapper';
                    const img = document.createElement('img');
                    img.src = image.url;
                    const figcaption = document.createElement('figcaption');
                    figcaption.textContent = image.description;
                    imageWrapper.appendChild(img);
                    imageWrapper.appendChild(figcaption);
                    imagesContainer.appendChild(imageWrapper);
                });
                searchResultsWrapper.appendChild(imagesContainer);
            }

            // Render search results
            if (content.results && content.results.length > 0) {
                const resultsContainer = document.createElement('div');
                resultsContainer.className = 'tavily-results-container';
                content.results.forEach(result => {
                    const resultItem = document.createElement('div');
                    resultItem.className = 'tavily-result-item';

                    const title = document.createElement('h4');
                    const link = document.createElement('a');
                    link.href = result.url;
                    link.textContent = result.title;
                    link.target = '_blank'; // Open in new tab
                    title.appendChild(link);

                    const url = document.createElement('p');
                    url.className = 'tavily-result-url';
                    url.textContent = result.url;

                    const snippet = document.createElement('div');
                    snippet.className = 'tavily-result-snippet';
                    if (window.marked && typeof window.marked.parse === 'function') {
                        snippet.innerHTML = window.marked.parse(result.content);
                    } else {
                        console.error("'marked' library not loaded. Displaying content as plain text.");
                        snippet.textContent = result.content;
                    }

                    resultItem.appendChild(title);
                    resultItem.appendChild(url);
                    resultItem.appendChild(snippet);
                    resultsContainer.appendChild(resultItem);
                });
                searchResultsWrapper.appendChild(resultsContainer);
            }

            resultContainer.appendChild(searchResultsWrapper);
        } else if (typeof content === 'object') { // Generic object
            // Check for common image/text properties within the object
            const imageUrl = content.image_url || content.url || content.image;
            const textResult = content.result || content.message || content.original_plugin_output || content.content;
    
            if (typeof imageUrl === 'string') {
                const imgElement = document.createElement('img');
                imgElement.src = imageUrl;
                resultContainer.appendChild(imgElement);
            } else if (typeof textResult === 'string') {
                if (window.marked && typeof window.marked.parse === 'function') {
                    resultContainer.innerHTML = window.marked.parse(textResult);
                } else {
                    console.error("'marked' library not loaded. Displaying content as plain text.");
                    resultContainer.textContent = textResult;
                }
            } else {
                // Fallback for other objects: pretty-print the JSON
                const pre = document.createElement('pre');
                pre.textContent = JSON.stringify(content, null, 2);
                resultContainer.appendChild(pre);
            }
        } else { // Fallback for any other data type
            const pre = document.createElement('pre');
            pre.textContent = `鎻掍欢杩斿洖浜嗘湭鐭ョ被鍨嬬殑鏁版嵁: ${String(content)}`;
            resultContainer.appendChild(pre);
        }
    
        // 4. Finally, ensure all rendered images (newly created or from HTML) have the context menu
        // attachEventListenersToImages(resultContainer);
    }

    // --- Image Viewer Modal ---
    function setupImageViewer() {
        if (document.getElementById('image-viewer-modal')) return;

        const viewer = document.createElement('div');
        viewer.id = 'image-viewer-modal';
        viewer.style.cssText = `
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            overflow: auto;
            background-color: rgba(0,0,0,0.85);
            justify-content: center;
            align-items: center;
        `;
        viewer.innerHTML = `
            <span style="position: absolute; top: 15px; right: 35px; color: #f1f1f1; font-size: 40px; font-weight: bold; cursor: pointer;">&times;</span>
            <img style="margin: auto; display: block; max-width: 90%; max-height: 90%;">
        `;
        document.body.appendChild(viewer);

        const modalImg = viewer.querySelector('img');
        const closeBtn = viewer.querySelector('span');

        function openModal(src) {
            viewer.style.display = 'flex';
            modalImg.src = src;
            document.addEventListener('keydown', handleEscKeyModal);
        }

        function closeModal() {
            viewer.style.display = 'none';
            modalImg.src = '';
            document.removeEventListener('keydown', handleEscKeyModal);
        }

        function handleEscKeyModal(e) {
            if (e.key === 'Escape') {
                closeModal();
            }
        }

        closeBtn.onclick = closeModal;
        viewer.onclick = function(e) {
            if (e.target === viewer) {
                closeModal();
            }
        };

        resultContainer.addEventListener('click', (e) => {
            let target = e.target;
            // Handle case where user clicks an IMG inside an A tag
            if (target.tagName === 'IMG' && target.parentElement.tagName === 'A') {
                target = target.parentElement;
            }

            if (target.tagName === 'A' && target.href && (target.href.match(/\.(jpeg|jpg|gif|png|webp)$/i) || target.href.startsWith('data:image'))) {
                e.preventDefault();
                openModal(target.href);
            }
        });
    }

    // --- 鍒濆鍖?---
    async function loadAndProcessWallpaper() {
        const bodyStyles = getComputedStyle(document.body);
        let wallpaperUrl = bodyStyles.backgroundImage;

        if (wallpaperUrl && wallpaperUrl !== 'none') {
            const match = wallpaperUrl.match(/url\("(.+)"\)/);
            if (match && match[1]) {
                let imagePath = match[1];
                if (imagePath.startsWith('file:///')) {
                    imagePath = decodeURI(imagePath.substring(8));
                }

                try {
                    const processedImageBase64 = await window.electronAPI.invoke('vcp-ht-process-wallpaper', imagePath);
                    if (processedImageBase64) {
                        document.body.style.backgroundImage = `url('${processedImageBase64}')`;
                    }
                } catch (error) {
                    console.error('Wallpaper processing failed:', error);
                }
            }
        }
    }

    function initializeUI() {
        // Window controls
        document.getElementById('minimize-btn').addEventListener('click', () => {
            window.electronAPI.send('window-control', 'minimize');
        });
        document.getElementById('maximize-btn').addEventListener('click', () => {
            window.electronAPI.send('window-control', 'maximize');
        });
        document.getElementById('close-btn').addEventListener('click', () => {
            window.electronAPI.send('window-control', 'close');
        });

        // Theme toggle
        const themeToggleBtn = document.getElementById('theme-toggle-btn');
        
        function applyTheme(theme) {
            if (theme === 'light') {
                document.body.classList.add('light-theme');
                themeToggleBtn.textContent = '鈽€锔?;
            } else {
                document.body.classList.remove('light-theme');
                themeToggleBtn.textContent = '馃寵';
            }
        }

        // Apply initial theme from settings
        applyTheme(settings.vcpht_theme);

        themeToggleBtn.addEventListener('click', async () => {
            const isLight = document.body.classList.toggle('light-theme');
            const newTheme = isLight ? 'light' : 'dark';
            applyTheme(newTheme);
            settings.vcpht_theme = newTheme;
            
            try {
                await saveSettings();
            } catch (saveError) {
                console.error('[VCPHumanToolBox] Failed to save theme setting:', saveError);
            }
        });

        // App controls
        backToGridBtn.addEventListener('click', () => {
            toolDetailView.style.display = 'none';
            toolGrid.style.display = 'grid';
        });

        // 宸ヤ綔娴佺紪鎺掓寜閽?
        renderToolGrid();
        loadAndProcessWallpaper();
        setupImageViewer();
    }

    initializeApp();

    // --- ComfyUI 闆嗘垚鍔熻兘 ---
    let comfyUIDrawer = null;
    let comfyUILoaded = false;

    function createComfyUIDrawer() {
        const overlay = document.createElement('div');
        overlay.className = 'drawer-overlay hidden';
        overlay.addEventListener('click', closeComfyUISettings);

        const drawer = document.createElement('div');
        drawer.className = 'drawer-panel';
        drawer.innerHTML = `
            <div class="drawer-content" id="comfyui-drawer-content">
                <div style="text-align: center; padding: 50px; color: var(--secondary-text);">
                    姝ｅ湪鍔犺浇 ComfyUI 閰嶇疆...
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(drawer);

        return { overlay, drawer };
    }

    async function openComfyUISettings() {
        if (!comfyUIDrawer) {
            comfyUIDrawer = createComfyUIDrawer();
        }

        comfyUIDrawer.overlay.classList.remove('hidden');
        comfyUIDrawer.drawer.classList.add('open');
        document.body.classList.add('drawer-open');

        if (!comfyUILoaded) {
            try {
                await loadComfyUIModules();
                
                if (window.ComfyUILoader) {
                    await window.ComfyUILoader.load();
                    
                    const drawerContent = document.getElementById('comfyui-drawer-content');
                    if (window.comfyUI && drawerContent) {
                        window.comfyUI.createUI(drawerContent, {
                            defaultTab: 'connection',
                            onClose: closeComfyUISettings
                        });
                    }
                    
                    comfyUILoaded = true;
                } else {
                    throw new Error('ComfyUILoader 鏈兘姝ｇ‘鍔犺浇');
                }
            } catch (error) {
                console.error('鍔犺浇 ComfyUI 妯″潡澶辫触:', error);
                const drawerContent = document.getElementById('comfyui-drawer-content');
                if (drawerContent) {
                    drawerContent.innerHTML = `
                        <div style="text-align: center; padding: 50px; color: var(--danger-color);">
                            鍔犺浇 ComfyUI 閰嶇疆澶辫触: ${error.message}
                        </div>
                    `;
                }
            }
        }

        document.addEventListener('keydown', handleEscKey);
    }

    function closeComfyUISettings() {
        if (comfyUIDrawer) {
            comfyUIDrawer.overlay.classList.add('hidden');
            comfyUIDrawer.drawer.classList.remove('open');
            document.body.classList.remove('drawer-open');
        }
        document.removeEventListener('keydown', handleEscKey);
    }

    function handleEscKey(e) {
        if (e.key === 'Escape') {
            closeComfyUISettings();
        }
    }

    async function loadComfyUIModules() {
        const loaderScript = document.createElement('script');
        loaderScript.src = 'ComfyUImodules/ComfyUILoader.js';
        
        return new Promise((resolve, reject) => {
            loaderScript.onload = resolve;
            loaderScript.onerror = () => reject(new Error('鏃犳硶鍔犺浇 ComfyUILoader.js'));
            document.head.appendChild(loaderScript);
        });
    }


    // 灏嗗嚱鏁版毚闇插埌鍏ㄥ眬浣滅敤鍩燂紝浠ヤ究鎸夐挳鐐瑰嚮鏃惰皟鐢?
    window.openComfyUISettings = openComfyUISettings;
    window.closeComfyUISettings = closeComfyUISettings;
});
