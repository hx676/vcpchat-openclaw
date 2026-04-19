const DEFAULT_BASE_URL = 'http://127.0.0.1:6005/v1/integrations/openclaw';
const DEFAULT_MIRROR_CHANNEL = 'feishu';

function normalizeBaseUrl(value) {
    const raw = String(value || '').trim() || DEFAULT_BASE_URL;
    return raw.replace(/\/+$/, '');
}

function normalizeMirrorChannels(pluginConfig = {}) {
    if (Array.isArray(pluginConfig.mirrorChannels)) {
        const values = pluginConfig.mirrorChannels
            .map((item) => String(item || '').trim())
            .filter(Boolean);
        if (values.length > 0) {
            return Array.from(new Set(values));
        }
    }

    const single = String(pluginConfig.mirrorChannel || DEFAULT_MIRROR_CHANNEL).trim() || DEFAULT_MIRROR_CHANNEL;
    return [single];
}

export function resolvePluginConfig(pluginConfig = {}) {
    const mirrorChannels = normalizeMirrorChannels(pluginConfig);
    return {
        baseUrl: normalizeBaseUrl(pluginConfig.baseUrl),
        token: String(pluginConfig.token || '').trim(),
        mirrorChannel: mirrorChannels[0] || DEFAULT_MIRROR_CHANNEL,
        mirrorChannels,
        enableMirror: pluginConfig.enableMirror !== false,
        enableTools: pluginConfig.enableTools !== false,
    };
}

function buildHeaders(config) {
    if (!config.token) {
        throw new Error('VCP bridge token is missing. Set plugins.entries.vcp-openclaw-bridge.config.token or OPENCLAW_VCP_SHARED_TOKEN.');
    }

    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`,
    };
}

export async function requestJson(config, routePath, method = 'GET', body = null) {
    const response = await fetch(`${normalizeBaseUrl(config.baseUrl)}${routePath}`, {
        method,
        headers: buildHeaders(config),
        body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = { raw: text };
    }

    if (!response.ok) {
        throw new Error(data?.error || `VCP integration request failed with status ${response.status}`);
    }

    return data;
}

export function toMirrorEnvelope(event, context, overrides = {}) {
    const metadata = event?.metadata && typeof event.metadata === 'object' ? event.metadata : {};
    return {
        channel: overrides.channel || context?.channelId || overrides.fallbackChannel || 'unknown',
        conversationId: overrides.conversationId || context?.conversationId || event?.from || event?.to || 'unknown',
        threadId: overrides.threadId || metadata.threadId || metadata.threadTs || context?.threadId || '',
        direction: overrides.direction || 'system',
        source: overrides.source || 'openclaw',
        message: {
            messageId: overrides.messageId || metadata.messageId || event?.messageId || '',
            role: overrides.role || '',
            senderId: overrides.senderId || metadata.senderId || event?.from || '',
            senderName: overrides.senderName || metadata.senderName || metadata.senderDisplayName || '',
            content: overrides.content ?? event?.content ?? '',
            attachments: overrides.attachments || metadata.attachments || [],
            timestamp: overrides.timestamp || event?.timestamp || Date.now(),
        },
        toolCalls: overrides.toolCalls || [],
        memoryHits: overrides.memoryHits || [],
        metadata: {
            ...(metadata || {}),
            ...(overrides.metadata || {}),
        },
    };
}
