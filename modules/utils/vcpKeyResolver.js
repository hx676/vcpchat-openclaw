const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

function isLoopbackWsUrl(rawUrl) {
    try {
        const parsed = new URL(rawUrl);
        const hostname = String(parsed.hostname || '').trim().toLowerCase();
        return hostname === '127.0.0.1'
            || hostname === 'localhost'
            || hostname === '::1';
    } catch (error) {
        return false;
    }
}

function isLoopbackHttpUrl(rawUrl) {
    try {
        const parsed = new URL(rawUrl);
        const hostname = String(parsed.hostname || '').trim().toLowerCase();
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
            && (hostname === '127.0.0.1'
                || hostname === 'localhost'
                || hostname === '::1');
    } catch (error) {
        return false;
    }
}

function getToolboxConfigCandidates(projectRoot) {
    const candidates = [
        process.env.VCPTOOLBOX_PATH ? path.join(path.resolve(process.env.VCPTOOLBOX_PATH), 'config.env') : null,
        process.env.VCP_TOOLBOX_PATH ? path.join(path.resolve(process.env.VCP_TOOLBOX_PATH), 'config.env') : null,
        path.resolve(projectRoot, '..', 'VCPToolBox', 'config.env'),
        path.resolve(projectRoot, 'VCPToolBox', 'config.env'),
    ];

    return candidates.filter(Boolean);
}

function readLocalToolboxConfig(projectRoot) {
    for (const configPath of getToolboxConfigCandidates(projectRoot)) {
        try {
            if (!fs.existsSync(configPath)) {
                continue;
            }

            const parsed = dotenv.parse(fs.readFileSync(configPath, 'utf8'));
            return { configPath, parsed };
        } catch (error) {
            continue;
        }
    }

    return null;
}

function resolveVcpLogKey({ projectRoot, wsUrl, configuredKey }) {
    if (!wsUrl || !isLoopbackWsUrl(wsUrl)) {
        return {
            effectiveKey: configuredKey,
            source: 'settings',
            configPath: null,
        };
    }

    const localConfig = readLocalToolboxConfig(projectRoot);
    if (!localConfig?.parsed?.VCP_Key) {
        return {
            effectiveKey: configuredKey,
            source: 'settings',
            configPath: null,
        };
    }

    const backendApiKey = localConfig.parsed.Key;
    const backendWsKey = localConfig.parsed.VCP_Key;
    const shouldUseBackendWsKey = !configuredKey || configuredKey === backendApiKey;

    return {
        effectiveKey: shouldUseBackendWsKey ? backendWsKey : configuredKey,
        source: shouldUseBackendWsKey ? 'local-toolbox-config' : 'settings',
        configPath: localConfig.configPath,
    };
}

function resolveVcpApiKey({ projectRoot, vcpUrl, configuredKey }) {
    if (!vcpUrl || !isLoopbackHttpUrl(vcpUrl)) {
        return {
            effectiveKey: configuredKey,
            source: 'settings',
            configPath: null,
        };
    }

    const localConfig = readLocalToolboxConfig(projectRoot);
    const backendApiKey = localConfig?.parsed?.Key;
    if (!backendApiKey) {
        return {
            effectiveKey: configuredKey,
            source: 'settings',
            configPath: null,
        };
    }

    const backendWsKey = localConfig.parsed.VCP_Key;
    const shouldUseBackendApiKey = !configuredKey || configuredKey === backendWsKey;

    return {
        effectiveKey: shouldUseBackendApiKey ? backendApiKey : configuredKey,
        source: shouldUseBackendApiKey ? 'local-toolbox-config' : 'settings',
        configPath: localConfig.configPath,
    };
}

module.exports = {
    resolveVcpApiKey,
    resolveVcpLogKey,
};
