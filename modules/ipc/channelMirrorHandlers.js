const { ipcMain } = require('electron');
const fs = require('fs-extra');
const path = require('path');
const dotenv = require('dotenv');
const { pathToFileURL } = require('url');

let ipcHandlersRegistered = false;
let PROJECT_ROOT = path.resolve(__dirname, '../..');

function findToolboxRoot() {
    const sibling = path.resolve(PROJECT_ROOT, '..', 'VCPToolBox');
    if (fs.existsSync(path.join(sibling, 'server.js'))) {
        return sibling;
    }

    const nested = path.join(PROJECT_ROOT, 'VCPToolBox');
    if (fs.existsSync(path.join(nested, 'server.js'))) {
        return nested;
    }

    return sibling;
}

function resolveMirrorRoot() {
    const toolboxRoot = findToolboxRoot();
    const configPath = path.join(toolboxRoot, 'config.env');
    if (fs.existsSync(configPath)) {
        try {
            const parsed = dotenv.parse(fs.readFileSync(configPath, 'utf8'));
            const configured = String(parsed.CHANNEL_MIRROR_ROOT_PATH || '').trim();
            if (configured) {
                return path.isAbsolute(configured)
                    ? configured
                    : path.resolve(toolboxRoot, configured);
            }
        } catch (error) {
            console.warn('[ChannelMirrorHandlers] Failed to parse VCPToolBox config.env:', error.message);
        }
    }

    return path.join(toolboxRoot, 'ChannelMirrorData');
}

function buildSessionItem(session) {
    return {
        id: session.sessionId,
        type: 'channel_mirror',
        name: session.displayName || session.conversationId || session.sessionId,
        avatarUrl: null,
        readOnly: true,
        mirrorChannel: session.channel,
        mirrorConversationId: session.conversationId,
        mirrorTopicId: session.topicId || 'main',
        updatedAt: session.updatedAt || '',
        createdAt: session.createdAt || session.updatedAt || '',
        config: {
            sessionId: session.sessionId,
            channel: session.channel,
            conversationId: session.conversationId,
            displayName: session.displayName || session.conversationId || session.sessionId,
            topics: [
                {
                    id: session.topicId || 'main',
                    name: session.displayName || session.conversationId || session.sessionId,
                    createdAt: session.createdAt || session.updatedAt || Date.now(),
                    readOnly: true,
                },
            ],
            readOnly: true,
        },
    };
}

async function readJsonSafe(filePath, fallbackValue) {
    try {
        if (!(await fs.pathExists(filePath))) {
            return fallbackValue;
        }
        return await fs.readJson(filePath);
    } catch (error) {
        return fallbackValue;
    }
}

function resolveOpenClawStateRoot() {
    const home = process.env.USERPROFILE || process.env.HOME || '';
    return home ? path.join(home, '.openclaw') : '';
}

function mapMirrorChannelToAgentId(channel) {
    if (channel === 'feishu') return 'feishu';
    if (channel === 'openclaw-weixin') return 'weixin';
    if (channel === 'qqbot') return 'qq';
    return '';
}

function extractTextFromOpenClawMessageContent(content) {
    if (typeof content === 'string') {
        return content;
    }
    if (!Array.isArray(content)) {
        return '';
    }

    return content
        .map((part) => {
            if (!part) return '';
            if (typeof part === 'string') return part;
            if (part.type === 'text') return String(part.text || '');
            return '';
        })
        .filter(Boolean)
        .join('\n')
        .trim();
}

function extractMirrorMessageIdFromOpenClawUserText(text) {
    const match = String(text || '').match(/\[message_id:\s*([^\]]+)\]/i);
    return match?.[1]?.trim() || '';
}

function normalizeAssistantMirrorText(text) {
    return String(text || '')
        .replace(/\[\[reply_to_current\]\]\s*/gi, '')
        .trim();
}

function inferMimeTypeFromPath(filePath) {
    const ext = path.extname(String(filePath || '')).toLowerCase();
    const map = {
        '.txt': 'text/plain',
        '.md': 'text/markdown',
        '.json': 'application/json',
        '.csv': 'text/csv',
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.ppt': 'application/vnd.ms-powerpoint',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.zip': 'application/zip',
        '.rar': 'application/vnd.rar',
        '.7z': 'application/x-7z-compressed',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.svg': 'image/svg+xml',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.m4a': 'audio/mp4',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
    };
    return map[ext] || 'application/octet-stream';
}

function toRendererAttachment(attachment = {}, index = 0) {
    const type = String(attachment.type || attachment.mimeType || 'application/octet-stream').trim() || 'application/octet-stream';
    const src = String(attachment.src || attachment.url || attachment.fileUrl || '').trim();
    return {
        id: attachment.id || `attachment_${index + 1}`,
        name: attachment.name || attachment.fileName || attachment.title || `attachment_${index + 1}`,
        type,
        src,
        size: attachment.size || 0,
        metadata: attachment.metadata || {},
    };
}

function extractToolCallsFromOpenClawContent(content) {
    if (!Array.isArray(content)) {
        return [];
    }

    return content
        .filter((part) => part && typeof part === 'object' && part.type === 'toolCall')
        .map((part) => ({
            id: String(part.id || '').trim(),
            name: String(part.name || '').trim(),
            arguments: part.arguments && typeof part.arguments === 'object' ? part.arguments : {},
        }))
        .filter((part) => part.id && part.name);
}

function parseJsonObjectFromText(text) {
    try {
        return JSON.parse(String(text || '').trim());
    } catch {
        return null;
    }
}

async function buildAttachmentFromFilePath(filePath) {
    const normalizedPath = String(filePath || '').trim();
    if (!normalizedPath) {
        return null;
    }

    const fileExists = await fs.pathExists(normalizedPath).catch(() => false);
    const stat = fileExists ? await fs.stat(normalizedPath).catch(() => null) : null;
    return {
        id: `attachment_${path.basename(normalizedPath)}`,
        name: path.basename(normalizedPath),
        type: inferMimeTypeFromPath(normalizedPath),
        src: pathToFileURL(normalizedPath).href,
        size: stat?.size || 0,
        metadata: {
            localPath: normalizedPath,
            backfilledFrom: 'openclaw_session',
        },
    };
}

async function loadOpenClawSessionLinesForChannel(channel) {
    const agentId = mapMirrorChannelToAgentId(channel);
    if (!agentId) {
        return [];
    }

    const stateRoot = resolveOpenClawStateRoot();
    if (!stateRoot) {
        return [];
    }

    const sessionsDir = path.join(stateRoot, 'agents', agentId, 'sessions');
    const registryPath = path.join(sessionsDir, 'sessions.json');
    const registry = await readJsonSafe(registryPath, {});
    const preferredKey = `agent:${agentId}:main`;
    const selectedEntry = registry?.[preferredKey]
        || Object.values(registry || {}).sort((a, b) => Number(b?.updatedAt || 0) - Number(a?.updatedAt || 0))[0];

    if (!selectedEntry?.sessionId) {
        return [];
    }

    const jsonlPath = path.join(sessionsDir, `${selectedEntry.sessionId}.jsonl`);
    if (!(await fs.pathExists(jsonlPath))) {
        return [];
    }

    const raw = await fs.readFile(jsonlPath, 'utf8').catch(() => '');
    if (!raw) {
        return [];
    }

    return raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            try {
                return JSON.parse(line);
            } catch {
                return null;
            }
        })
        .filter(Boolean);
}

async function buildOutboundBackfill(history, session) {
    if (!Array.isArray(history) || history.length === 0 || !session?.mirrorChannel) {
        return [];
    }

    const inboundIds = new Set(
        history
            .filter((entry) => entry && entry.direction === 'inbound' && entry.mirrorMessageId)
            .map((entry) => String(entry.mirrorMessageId))
    );
    if (inboundIds.size === 0) {
        return [];
    }

    const sessionLines = await loadOpenClawSessionLinesForChannel(session.mirrorChannel);
    if (sessionLines.length === 0) {
        return [];
    }

    const repliesByInboundId = new Map();
    const pendingFileSends = new Map();
    let currentInboundId = '';

    for (const line of sessionLines) {
        if (line?.type !== 'message' || !line.message) {
            continue;
        }

        const role = String(line.message.role || '').trim();
        if (role === 'user') {
            const userText = extractTextFromOpenClawMessageContent(line.message.content);
            const inboundId = extractMirrorMessageIdFromOpenClawUserText(userText);
            currentInboundId = inboundIds.has(inboundId) ? inboundId : '';
            continue;
        }

        if (role === 'assistant') {
            const toolCalls = extractToolCallsFromOpenClawContent(line.message.content);
            for (const toolCall of toolCalls) {
                if (toolCall.name !== 'message') {
                    continue;
                }
                const action = String(toolCall.arguments?.action || '').trim().toLowerCase();
                const filePath = String(toolCall.arguments?.path || '').trim();
                const inboundId = String(toolCall.arguments?.replyTo || currentInboundId || '').trim();
                if (action === 'send' && filePath && inboundIds.has(inboundId)) {
                    pendingFileSends.set(toolCall.id, {
                        inboundId,
                        filePath,
                        timestamp: line.message.timestamp || line.timestamp || Date.now(),
                    });
                }
            }
        }

        if (role === 'toolResult') {
            const toolCallId = String(line.message.toolCallId || '').trim();
            const pending = pendingFileSends.get(toolCallId);
            if (pending) {
                const resultText = extractTextFromOpenClawMessageContent(line.message.content);
                const details = (line.message.details && typeof line.message.details === 'object')
                    ? line.message.details
                    : parseJsonObjectFromText(resultText);
                const deliveryOk = details?.ok === true || details?.status === 'ok';
                if (deliveryOk) {
                    const attachment = await buildAttachmentFromFilePath(pending.filePath);
                    if (attachment) {
                        if (!repliesByInboundId.has(pending.inboundId)) {
                            repliesByInboundId.set(pending.inboundId, []);
                        }
                        repliesByInboundId.get(pending.inboundId).push({
                            kind: 'file',
                            text: '',
                            timestamp: line.message.timestamp || line.timestamp || pending.timestamp || Date.now(),
                            responseId: '',
                            model: 'delivery-mirror',
                            provider: 'openclaw',
                            attachments: [attachment],
                        });
                    }
                }
            }
            continue;
        }

        if (!currentInboundId || role !== 'assistant') {
            continue;
        }

        const assistantText = normalizeAssistantMirrorText(
            extractTextFromOpenClawMessageContent(line.message.content)
        );
        if (!assistantText) {
            continue;
        }

        const provider = String(line.message.provider || '').trim().toLowerCase();
        const model = String(line.message.model || '').trim().toLowerCase();
        if (assistantText === 'NO_REPLY' || (provider === 'openclaw' && model === 'delivery-mirror')) {
            continue;
        }

        if (!repliesByInboundId.has(currentInboundId)) {
            repliesByInboundId.set(currentInboundId, []);
        }

        repliesByInboundId.get(currentInboundId).push({
            kind: 'text',
            text: assistantText,
            timestamp: line.message.timestamp || line.timestamp || Date.now(),
            responseId: line.message.responseId || '',
            model: line.message.model || '',
            provider: line.message.provider || '',
            attachments: [],
        });
    }

    const existingIds = new Set(history.map((entry) => entry.id));
    const supplemental = [];

    for (const [inboundId, replies] of repliesByInboundId.entries()) {
        replies.forEach((reply, index) => {
            const id = `openclaw:assistant:${inboundId}:${index}`;
            if (existingIds.has(id)) {
                return;
            }

            supplemental.push({
                id,
                mirrorMessageId: inboundId,
                direction: 'outbound',
                source: 'openclaw',
                role: 'assistant',
                name: 'OpenClaw',
                content: reply.kind === 'file' ? `已发送文件：${reply.attachments?.[0]?.name || '附件'}` : reply.text,
                attachments: Array.isArray(reply.attachments) ? reply.attachments.map(toRendererAttachment) : [],
                toolCalls: [],
                memoryHits: [],
                metadata: {
                    backfilledFrom: 'openclaw_session',
                    provider: reply.provider,
                    model: reply.model,
                    responseId: reply.responseId,
                },
                timestamp: reply.timestamp,
            });
        });
    }

    return supplemental;
}

async function getChannelMirrorSessionsInternal() {
    const mirrorRoot = resolveMirrorRoot();
    if (!(await fs.pathExists(mirrorRoot))) {
        return [];
    }

    const channelDirs = await fs.readdir(mirrorRoot);
    const sessions = [];

    for (const channelName of channelDirs) {
        const channelDir = path.join(mirrorRoot, channelName);
        const stat = await fs.stat(channelDir).catch(() => null);
        if (!stat || !stat.isDirectory()) continue;
        const conversationDirs = await fs.readdir(channelDir);

        for (const conversationDir of conversationDirs) {
            const sessionFile = path.join(channelDir, conversationDir, 'session.json');
            const session = await readJsonSafe(sessionFile, null);
            if (!session || !session.sessionId) continue;
            sessions.push(buildSessionItem(session));
        }
    }

    return sessions.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

async function getChannelMirrorTopicsInternal(sessionId) {
    const sessions = await getChannelMirrorSessionsInternal();
    const session = sessions.find((item) => item.id === sessionId);
    return session?.config?.topics || [];
}

async function getChannelMirrorHistoryInternal(sessionId, topicId = 'main') {
    const sessions = await getChannelMirrorSessionsInternal();
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) {
        return { error: 'Channel mirror session not found.' };
    }

    const mirrorRoot = resolveMirrorRoot();
    const conversationDir = path.join(
        mirrorRoot,
        session.mirrorChannel,
        Buffer.from(String(session.mirrorConversationId || ''), 'utf8').toString('base64url')
    );
    const historyFile = path.join(conversationDir, 'topics', topicId, 'history.json');
    const history = await readJsonSafe(historyFile, []);
    const normalizedHistory = Array.isArray(history) ? history : [];
    const supplemental = await buildOutboundBackfill(normalizedHistory, session);
    const mergedHistory = [...normalizedHistory, ...supplemental]
        .map((entry) => ({
            ...entry,
            attachments: Array.isArray(entry?.attachments)
                ? entry.attachments.map(toRendererAttachment)
                : [],
        }))
        .sort((a, b) => Number(a?.timestamp || 0) - Number(b?.timestamp || 0));
    return mergedHistory;
}

function initialize(options = {}) {
    PROJECT_ROOT = options.PROJECT_ROOT || PROJECT_ROOT;
    if (ipcHandlersRegistered) {
        return;
    }

    ipcMain.handle('get-channel-mirror-sessions', async () => {
        return getChannelMirrorSessionsInternal();
    });

    ipcMain.handle('get-channel-mirror-topics', async (_event, sessionId) => {
        return getChannelMirrorTopicsInternal(sessionId);
    });

    ipcMain.handle('get-channel-mirror-history', async (_event, sessionId, topicId) => {
        return getChannelMirrorHistoryInternal(sessionId, topicId);
    });

    ipcHandlersRegistered = true;
}

module.exports = {
    initialize,
    getChannelMirrorSessionsInternal,
    getChannelMirrorTopicsInternal,
    getChannelMirrorHistoryInternal,
};
