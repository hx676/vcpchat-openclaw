const OLLAMA_MODEL_PREFIX = 'ollama/';
const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';

function isOllamaModel(model) {
    return String(model || '').trim().toLowerCase().startsWith(OLLAMA_MODEL_PREFIX);
}

function stripOllamaModelPrefix(model) {
    const value = String(model || '').trim();
    if (!isOllamaModel(value)) return value;
    return value.slice(OLLAMA_MODEL_PREFIX.length).trim();
}

function buildOllamaUrl(pathname = '/v1/chat/completions') {
    const url = new URL(DEFAULT_OLLAMA_BASE_URL);
    url.pathname = pathname;
    return url.toString();
}

function normalizeOllamaModelRecord(model) {
    const rawId = String(model?.model || model?.name || model?.id || '').trim();
    if (!rawId) return null;
    return {
        id: `${OLLAMA_MODEL_PREFIX}${rawId}`,
        object: 'model',
        owned_by: 'ollama',
        provider: 'ollama',
        rawOllamaModel: rawId,
    };
}

function shouldDisplayOllamaModel(model) {
    const name = String(model?.model || model?.name || model?.id || '').trim().toLowerCase();
    const families = [
        ...(Array.isArray(model?.details?.families) ? model.details.families : []),
        ...(model?.details?.family ? [model.details.family] : []),
    ].map((item) => String(item || '').trim().toLowerCase());

    if (name.includes('embed')) return false;
    if (families.some((family) => family.includes('embed') || family.includes('bert'))) return false;
    return true;
}

async function fetchOllamaDisplayModels(fetchImpl = fetch) {
    try {
        const tagsResponse = await fetchImpl(buildOllamaUrl('/api/tags'));
        if (!tagsResponse.ok) {
            return [];
        }

        const tagsData = await tagsResponse.json();
        const models = Array.isArray(tagsData?.models) ? tagsData.models : [];
        return models
            .filter(shouldDisplayOllamaModel)
            .map(normalizeOllamaModelRecord)
            .filter(Boolean);
    } catch (_error) {
        return [];
    }
}

function resolveModelRequestTarget({ defaultUrl, enableToolInjection, model }) {
    if (isOllamaModel(model)) {
        return {
            provider: 'ollama',
            finalUrl: buildOllamaUrl('/v1/chat/completions'),
            resolvedModel: stripOllamaModelPrefix(model),
            useToolInjection: false,
            requiresAuth: false,
        };
    }

    let finalUrl = defaultUrl;
    if (enableToolInjection === true) {
        const urlObject = new URL(finalUrl);
        urlObject.pathname = '/v1/chatvcp/completions';
        finalUrl = urlObject.toString();
    }

    return {
        provider: 'vcp',
        finalUrl,
        resolvedModel: model,
        useToolInjection: enableToolInjection === true,
        requiresAuth: true,
    };
}

module.exports = {
    OLLAMA_MODEL_PREFIX,
    DEFAULT_OLLAMA_BASE_URL,
    isOllamaModel,
    stripOllamaModelPrefix,
    buildOllamaUrl,
    fetchOllamaDisplayModels,
    resolveModelRequestTarget,
};
