import { Type } from '@sinclair/typebox';
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import { requestJson, resolvePluginConfig, toMirrorEnvelope } from './src/client.js';

const TOOL_CATALOG_NAME = 'vcp_tool_catalog';
const MEMORY_TOOL_NAME = 'vcp_memory_search';
const MEMORY_WRITE_TOOL_NAME = 'vcp_memory_write';
const KB_AGENT_ASK_TOOL_NAME = 'vcp_kb_agent_ask';

const EXECUTE_TOOLS = [
    {
        openClawName: 'vcp_url_fetch',
        vcpToolName: 'UrlFetch',
        description: 'Fetch web pages, snapshots, images, or local files through VCP UrlFetch.',
        parameters: Type.Object({
            url: Type.String(),
            mode: Type.Optional(Type.Union([
                Type.Literal('text'),
                Type.Literal('snapshot'),
                Type.Literal('image')
            ]))
        })
    },
    {
        openClawName: 'vcp_vsearch',
        vcpToolName: 'VSearch',
        description: 'Run VCP semantic concurrent search across web sources.',
        parameters: Type.Object({
            SearchTopic: Type.String(),
            Keywords: Type.String(),
            SearchMode: Type.Optional(Type.Union([
                Type.Literal('grounding'),
                Type.Literal('grok'),
                Type.Literal('tavily')
            ])),
            ShowURL: Type.Optional(Type.Boolean())
        })
    },
    {
        openClawName: 'vcp_bilibili_fetch',
        vcpToolName: 'BilibiliFetch',
        description: 'Read Bilibili metadata, search results, and snapshots through VCP.',
        parameters: Type.Object({
            url: Type.Optional(Type.String()),
            action: Type.Optional(Type.String()),
            keyword: Type.Optional(Type.String()),
            search_type: Type.Optional(Type.String()),
            page: Type.Optional(Type.Number()),
            danmaku_num: Type.Optional(Type.Number()),
            comment_num: Type.Optional(Type.Number()),
            snapshots: Type.Optional(Type.String()),
            hd_snapshot: Type.Optional(Type.Boolean())
        })
    }
];

function normalizeContentText(value) {
    if (typeof value === 'string') {
        return value;
    }
    if (value === undefined || value === null) {
        return '';
    }
    return JSON.stringify(value, null, 2);
}

function shouldMirrorChannel(config, channelId) {
    if (!config.enableMirror) {
        return false;
    }
    const channel = String(channelId || '').trim();
    return Array.isArray(config.mirrorChannels) && config.mirrorChannels.includes(channel);
}

async function mirrorEvent(config, envelope) {
    if (!config.enableMirror) {
        return;
    }
    await requestJson(config, '/mirror/session-event', 'POST', envelope);
}

function buildToolMirrorMetadata(toolName, responsePayload) {
    return {
        toolCalls: [
            {
                toolName,
                ok: Boolean(responsePayload?.ok),
                traceId: responsePayload?.traceId || '',
                error: responsePayload?.error || '',
                artifacts: responsePayload?.artifacts || [],
            }
        ],
        metadata: {
            traceId: responsePayload?.traceId || '',
            artifacts: responsePayload?.artifacts || [],
        }
    };
}

function buildCallerMeta(ctx) {
    return {
        channelId: ctx.deliveryContext?.channel || ctx.messageChannel || '',
        accountId: ctx.deliveryContext?.accountId || ctx.agentAccountId || '',
        threadId: ctx.deliveryContext?.threadId || '',
        sessionKey: ctx.sessionKey || '',
        agentId: ctx.agentId || '',
    };
}

function buildToolFactory(api, definition) {
    return (ctx) => ({
        name: definition.openClawName,
        description: definition.description,
        parameters: definition.parameters,
        execute: async (_id, params) => {
            const config = resolvePluginConfig(api.pluginConfig);
            const payload = await requestJson(config, '/tools/execute', 'POST', {
                sessionId: ctx.sessionId || '',
                conversationId: ctx.deliveryContext?.to || ctx.sessionKey || '',
                toolName: definition.vcpToolName,
                arguments: params,
                callerMeta: buildCallerMeta(ctx)
            });

            if (shouldMirrorChannel(config, ctx.deliveryContext?.channel)) {
                const mirror = buildToolMirrorMetadata(definition.vcpToolName, payload);
                await mirrorEvent(config, toMirrorEnvelope(
                    {
                        content: normalizeContentText(payload.result),
                        timestamp: Date.now(),
                        metadata: {
                            threadId: ctx.deliveryContext?.threadId || '',
                        }
                    },
                    {
                        channelId: ctx.deliveryContext?.channel,
                        conversationId: ctx.deliveryContext?.to,
                    },
                    {
                        direction: 'system',
                        source: 'vcp',
                        role: 'system',
                        content: `${definition.vcpToolName} -> ${payload.ok ? 'ok' : 'error'}\n${normalizeContentText(payload.result || payload.error || '')}`,
                        conversationId: ctx.deliveryContext?.to || ctx.sessionKey || '',
                        threadId: ctx.deliveryContext?.threadId || '',
                        ...mirror
                    }
                ));
            }

            if (!payload.ok) {
                return {
                    content: [{ type: 'text', text: `VCP ${definition.vcpToolName} failed: ${payload.error || 'unknown error'}` }]
                };
            }

            return {
                content: [{ type: 'text', text: normalizeContentText(payload.result) }]
            };
        }
    });
}

export default definePluginEntry({
    id: 'vcp-openclaw-bridge',
    name: 'VCP OpenClaw Bridge',
    description: 'Expose VCP tools plus memory search and write to OpenClaw, and mirror channel sessions into VCP.',
    register(api) {
        const config = resolvePluginConfig(api.pluginConfig);

        if (config.enableTools) {
            api.registerTool({
                name: TOOL_CATALOG_NAME,
                description: 'Read the VCP tool catalog exposed for OpenClaw integration.',
                parameters: Type.Object({}),
                execute: async () => {
                    const payload = await requestJson(config, '/tools/catalog', 'GET');
                    return {
                        content: [{ type: 'text', text: JSON.stringify(payload.tools || [], null, 2) }]
                    };
                }
            });

            api.registerTool({
                name: MEMORY_TOOL_NAME,
                description: 'Search VCP memory and knowledge base through the OpenClaw bridge.',
                parameters: Type.Object({
                    query: Type.String(),
                    topK: Type.Optional(Type.Number()),
                    scope: Type.Optional(Type.String())
                }),
                execute: async (_id, params) => {
                    const payload = await requestJson(config, '/memory/search', 'POST', {
                        sessionId: '',
                        conversationId: '',
                        query: params.query,
                        topK: params.topK,
                        scope: params.scope || 'all'
                    });

                    return {
                        content: [{ type: 'text', text: payload.summary || normalizeContentText(payload.items) }]
                    };
                }
            });

            api.registerTool((ctx) => ({
                name: MEMORY_WRITE_TOOL_NAME,
                description: 'Write durable memory into the VCP knowledge base through DailyNoteWrite.',
                parameters: Type.Object({
                    notebook: Type.String(),
                    content: Type.String(),
                    title: Type.Optional(Type.String()),
                    tags: Type.Optional(Type.Array(Type.String())),
                    dateString: Type.Optional(Type.String()),
                    agentName: Type.Optional(Type.String())
                }),
                execute: async (_id, params) => {
                    const payload = await requestJson(config, '/memory/write', 'POST', {
                        sessionId: ctx.sessionId || '',
                        conversationId: ctx.deliveryContext?.to || ctx.sessionKey || '',
                        notebook: params.notebook,
                        content: params.content,
                        title: params.title,
                        tags: params.tags,
                        dateString: params.dateString,
                        agentName: params.agentName,
                        callerMeta: buildCallerMeta(ctx)
                    });

                    if (shouldMirrorChannel(config, ctx.deliveryContext?.channel)) {
                        const mirror = buildToolMirrorMetadata('memory_write', payload);
                        await mirrorEvent(config, toMirrorEnvelope(
                            {
                                content: normalizeContentText(payload.result),
                                timestamp: Date.now(),
                                metadata: {
                                    threadId: ctx.deliveryContext?.threadId || '',
                                }
                            },
                            {
                                channelId: ctx.deliveryContext?.channel,
                                conversationId: ctx.deliveryContext?.to,
                            },
                            {
                                direction: 'system',
                                source: 'vcp',
                                role: 'system',
                                content: `memory_write -> ${payload.ok ? 'ok' : 'error'}\n${normalizeContentText(payload.savedPath || payload.error || '')}`,
                                conversationId: ctx.deliveryContext?.to || ctx.sessionKey || '',
                                threadId: ctx.deliveryContext?.threadId || '',
                                ...mirror
                            }
                        ));
                    }

                    if (!payload.ok) {
                        return {
                            content: [{ type: 'text', text: `VCP memory write failed: ${payload.error || 'unknown error'}` }]
                        };
                    }

                    return {
                        content: [{ type: 'text', text: `Saved to VCP notebook "${payload.notebook}" at ${payload.savedPath || 'unknown path'}` }]
                    };
                }
            }), { name: MEMORY_WRITE_TOOL_NAME });

            api.registerTool((ctx) => ({
                name: KB_AGENT_ASK_TOOL_NAME,
                description: 'Ask a VCP knowledge-base agent to answer through the VCP chat pipeline.',
                parameters: Type.Object({
                    question: Type.String(),
                    agentAlias: Type.Optional(Type.String()),
                    model: Type.Optional(Type.String()),
                    contextText: Type.Optional(Type.String()),
                    systemHint: Type.Optional(Type.String()),
                    showVcp: Type.Optional(Type.Boolean())
                }),
                execute: async (_id, params) => {
                    const payload = await requestJson(config, '/kb/ask', 'POST', {
                        sessionId: ctx.sessionId || '',
                        conversationId: ctx.deliveryContext?.to || ctx.sessionKey || '',
                        question: params.question,
                        agentAlias: params.agentAlias,
                        model: params.model,
                        contextText: params.contextText,
                        systemHint: params.systemHint,
                        showVcp: params.showVcp,
                        callerMeta: buildCallerMeta(ctx)
                    });

                    if (shouldMirrorChannel(config, ctx.deliveryContext?.channel)) {
                        const mirror = buildToolMirrorMetadata(`kb_agent:${payload.agentAlias || 'unknown'}`, payload);
                        await mirrorEvent(config, toMirrorEnvelope(
                            {
                                content: normalizeContentText(payload.text),
                                timestamp: Date.now(),
                                metadata: {
                                    threadId: ctx.deliveryContext?.threadId || '',
                                }
                            },
                            {
                                channelId: ctx.deliveryContext?.channel,
                                conversationId: ctx.deliveryContext?.to,
                            },
                            {
                                direction: 'system',
                                source: 'vcp',
                                role: 'system',
                                content: `kb_agent_ask -> ${payload.ok ? 'ok' : 'error'}\n${normalizeContentText(payload.text || payload.error || '')}`,
                                conversationId: ctx.deliveryContext?.to || ctx.sessionKey || '',
                                threadId: ctx.deliveryContext?.threadId || '',
                                ...mirror
                            }
                        ));
                    }

                    if (!payload.ok) {
                        return {
                            content: [{ type: 'text', text: `VCP kb agent ask failed: ${payload.error || 'unknown error'}` }]
                        };
                    }

                    return {
                        content: [{ type: 'text', text: payload.text || '' }]
                    };
                }
            }), { name: KB_AGENT_ASK_TOOL_NAME });

            for (const definition of EXECUTE_TOOLS) {
                api.registerTool(buildToolFactory(api, definition), { name: definition.openClawName });
            }
        }

        api.on('message_received', async (event, ctx) => {
            const runtimeConfig = resolvePluginConfig(api.pluginConfig);
            if (!shouldMirrorChannel(runtimeConfig, ctx.channelId)) {
                return;
            }

            await mirrorEvent(runtimeConfig, toMirrorEnvelope(event, ctx, {
                channel: ctx.channelId,
                conversationId: ctx.conversationId || event.from,
                direction: 'inbound',
                source: ctx.channelId,
                role: 'user',
                senderId: event.from,
            }));
        });

        api.on('message_sent', async (event, ctx) => {
            const runtimeConfig = resolvePluginConfig(api.pluginConfig);
            if (!shouldMirrorChannel(runtimeConfig, ctx.channelId)) {
                return;
            }

            const deliverySucceeded = event?.success !== false;
            const normalizedContent = normalizeContentText(event?.content || '');

            await mirrorEvent(runtimeConfig, toMirrorEnvelope(event, ctx, {
                channel: ctx.channelId,
                conversationId: ctx.conversationId || event.to,
                direction: deliverySucceeded ? 'outbound' : 'system',
                source: 'openclaw',
                role: deliverySucceeded ? 'assistant' : 'system',
                content: deliverySucceeded
                    ? normalizedContent
                    : `渠道发送失败\n${normalizedContent}\n\nerror: ${event?.error || 'unknown error'}`,
                metadata: {
                    deliverySuccess: deliverySucceeded,
                    deliveryError: event?.error || '',
                    originalTo: event?.to || '',
                },
            }));
        });
    }
});
