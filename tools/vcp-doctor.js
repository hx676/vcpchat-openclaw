#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const net = require('net');
const Module = require('module');

const chatRoot = path.resolve(__dirname, '..');
const toolboxRootCandidates = [
    path.resolve(chatRoot, '..', 'VCPToolBox'),
    path.resolve(chatRoot, 'VCPToolBox')
];
const toolboxRoot = toolboxRootCandidates.find(candidate => fs.existsSync(path.join(candidate, 'server.js'))) || null;

const builtins = new Set(
    Module.builtinModules.flatMap((name) => [name, name.replace(/^node:/, '')])
);

const results = [];

function addResult(level, title, details) {
    results.push({ level, title, details });
}

function fileExists(targetPath) {
    try {
        fs.accessSync(targetPath, fs.constants.F_OK);
        return true;
    } catch (_) {
        return false;
    }
}

function normalizePackageName(specifier) {
    if (!specifier || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) {
        return null;
    }

    if (specifier.startsWith('@')) {
        const parts = specifier.split('/');
        return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
    }

    return specifier.split('/')[0];
}

function resolvePackage(packageName, basePath) {
    try {
        require.resolve(packageName, { paths: [basePath] });
        return true;
    } catch (_) {
        return false;
    }
}

function collectFiles(rootDir, matcher) {
    const entries = [];
    if (!fileExists(rootDir)) {
        return entries;
    }

    const stack = [rootDir];
    while (stack.length > 0) {
        const current = stack.pop();
        for (const dirent of fs.readdirSync(current, { withFileTypes: true })) {
            const fullPath = path.join(current, dirent.name);
            if (dirent.isDirectory()) {
                if (dirent.name === 'node_modules' || dirent.name === '.git') {
                    continue;
                }
                stack.push(fullPath);
                continue;
            }

            if (matcher(fullPath)) {
                entries.push(fullPath);
            }
        }
    }

    return entries;
}

function resolveLocalImport(currentFile, specifier) {
    const basePath = path.resolve(path.dirname(currentFile), specifier);
    const candidates = [
        basePath,
        `${basePath}.js`,
        `${basePath}.cjs`,
        `${basePath}.mjs`,
        path.join(basePath, 'index.js'),
        path.join(basePath, 'index.cjs'),
        path.join(basePath, 'index.mjs')
    ];

    return candidates.find((candidate) => fileExists(candidate)) || null;
}

function collectPluginEntryFiles(pluginRoot) {
    const manifests = collectFiles(
        pluginRoot,
        (fullPath) => path.basename(fullPath).toLowerCase() === 'plugin-manifest.json'
    );

    const entries = [];
    for (const manifestPath of manifests) {
        try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            const script =
                manifest?.entry?.script ||
                manifest?.entry?.main ||
                manifest?.main ||
                null;

            if (!script) {
                continue;
            }

            const entryFile = path.resolve(path.dirname(manifestPath), script);
            if (fileExists(entryFile)) {
                entries.push(entryFile);
            }
        } catch (_) {
            // Ignore malformed manifests here; they will usually fail elsewhere too.
        }
    }

    return entries;
}

function scanExternalDependencies(entryFiles, resolveRoot) {
    const missing = new Map();
    const patterns = [
        /require\(\s*['"]([^'"]+)['"]\s*\)/g,
        /import\s+(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g,
        /import\(\s*['"]([^'"]+)['"]\s*\)/g
    ];

    const visited = new Set();
    const queue = [...entryFiles];

    while (queue.length > 0) {
        const filePath = queue.pop();
        if (!filePath || visited.has(filePath)) {
            continue;
        }
        visited.add(filePath);

        const source = fs.readFileSync(filePath, 'utf8');
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(source)) !== null) {
                const specifier = match[1];
                if (specifier.startsWith('.')) {
                    const localTarget = resolveLocalImport(filePath, specifier);
                    if (localTarget && !visited.has(localTarget)) {
                        queue.push(localTarget);
                    }
                    continue;
                }

                const packageName = normalizePackageName(specifier);
                if (!packageName || builtins.has(packageName)) {
                    continue;
                }
                if (resolvePackage(packageName, resolveRoot)) {
                    continue;
                }

                const current = missing.get(packageName) || [];
                current.push(path.relative(resolveRoot, filePath));
                missing.set(packageName, current);
            }
        }
    }

    return missing;
}

function checkJsonFile(filePath, label) {
    if (!fileExists(filePath)) {
        addResult('WARN', `${label} 缺失`, path.relative(chatRoot, filePath));
        return;
    }

    try {
        JSON.parse(fs.readFileSync(filePath, 'utf8'));
        addResult('OK', `${label} 可解析`, path.relative(chatRoot, filePath));
    } catch (error) {
        addResult('FAIL', `${label} JSON 无法解析`, `${path.relative(chatRoot, filePath)}: ${error.message}`);
    }
}

function tcpCheck(host, port, timeoutMs = 500) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let settled = false;

        const finalize = (ok, reason) => {
            if (settled) {
                return;
            }
            settled = true;
            socket.destroy();
            resolve({ ok, reason });
        };

        socket.setTimeout(timeoutMs);
        socket.once('connect', () => finalize(true, 'connected'));
        socket.once('timeout', () => finalize(false, 'timeout'));
        socket.once('error', (error) => finalize(false, error.code || error.message));
        socket.connect(port, host);
    });
}

function reportRecentPluginErrors() {
    const reportsDir = path.join(chatRoot, 'VCPDistributedServer', 'Plugin', 'PTYShellExecutor', 'reports');
    if (!fileExists(reportsDir)) {
        return;
    }

    const reports = fs.readdirSync(reportsDir)
        .map((name) => ({
            name,
            fullPath: path.join(reportsDir, name),
            mtimeMs: fs.statSync(path.join(reportsDir, name)).mtimeMs
        }))
        .sort((a, b) => b.mtimeMs - a.mtimeMs);

    if (reports.length === 0) {
        return;
    }

    const latest = reports[0];
    const ageHours = Math.round((Date.now() - latest.mtimeMs) / 36e5);
    if (ageHours <= 2) {
        addResult('WARN', '检测到近期插件错误报告', `${path.relative(chatRoot, latest.fullPath)} (${ageHours}h 前)`);
    }
}

async function main() {
    addResult('OK', 'VCPChat 根目录', chatRoot);
    if (toolboxRoot) {
        addResult('OK', 'VCPToolBox 根目录', toolboxRoot);
    } else {
        addResult('FAIL', '未找到 VCPToolBox', toolboxRootCandidates.join(' | '));
    }

    if (!fileExists(path.join(chatRoot, 'node_modules'))) {
        addResult('FAIL', 'VCPChat node_modules 缺失', '请先运行 ensure-node-deps.bat');
    }
    if (toolboxRoot && !fileExists(path.join(toolboxRoot, 'node_modules'))) {
        addResult('FAIL', 'VCPToolBox node_modules 缺失', '请先运行 VCPToolBox\\ensure-node-deps.bat');
    }

    const chatDeps = ['electron', 'node-pty', '@xterm/headless'];
    for (const dep of chatDeps) {
        addResult(
            resolvePackage(dep, chatRoot) ? 'OK' : 'FAIL',
            `VCPChat 依赖 ${dep}`,
            resolvePackage(dep, chatRoot) ? 'installed' : 'missing'
        );
    }

    if (toolboxRoot) {
        const toolboxDeps = ['express', 'ws', 'better-sqlite3'];
        for (const dep of toolboxDeps) {
            addResult(
                resolvePackage(dep, toolboxRoot) ? 'OK' : 'FAIL',
                `VCPToolBox 依赖 ${dep}`,
                resolvePackage(dep, toolboxRoot) ? 'installed' : 'missing'
            );
        }
    }

    const chatPluginMissing = scanExternalDependencies(
        collectPluginEntryFiles(path.join(chatRoot, 'VCPDistributedServer', 'Plugin')),
        chatRoot
    );
    for (const [dep, files] of chatPluginMissing.entries()) {
        addResult('FAIL', `VCPChat 插件缺依赖 ${dep}`, files.slice(0, 5).join(', '));
    }

    if (toolboxRoot) {
        const toolboxPluginMissing = scanExternalDependencies(
            collectPluginEntryFiles(path.join(toolboxRoot, 'Plugin')),
            toolboxRoot
        );
        for (const [dep, files] of toolboxPluginMissing.entries()) {
            addResult('FAIL', `VCPToolBox 插件缺依赖 ${dep}`, files.slice(0, 5).join(', '));
        }
    }

    checkJsonFile(path.join(chatRoot, 'AppData', 'settings.json'), 'VCPChat 设置');
    if (toolboxRoot) {
        if (fileExists(path.join(toolboxRoot, 'config.env'))) {
            addResult('OK', 'VCPToolBox config.env 存在', 'config.env');
        } else {
            addResult('FAIL', 'VCPToolBox config.env 缺失', 'config.env');
        }

        const semanticGroupsPath = path.join(toolboxRoot, 'Plugin', 'RAGDiaryPlugin', 'semantic_groups.json');
        const semanticGroupsExamplePath = path.join(toolboxRoot, 'Plugin', 'RAGDiaryPlugin', 'semantic_groups.json.example');
        if (fileExists(semanticGroupsPath)) {
            checkJsonFile(semanticGroupsPath, 'semantic_groups');
        } else if (fileExists(semanticGroupsExamplePath)) {
            addResult('WARN', 'semantic_groups 仅有 example', path.relative(toolboxRoot, semanticGroupsExamplePath));
        } else {
            addResult('FAIL', 'semantic_groups 配置缺失', 'semantic_groups.json / semantic_groups.json.example');
        }
    }

    const port6005 = await tcpCheck('127.0.0.1', 6005, 500);
    addResult(port6005.ok ? 'OK' : 'WARN', '端口 6005', port6005.reason);

    reportRecentPluginErrors();

    const summary = { OK: 0, WARN: 0, FAIL: 0 };
    for (const result of results) {
        summary[result.level] += 1;
    }

    console.log('=== VCP Doctor ===');
    for (const result of results) {
        console.log(`[${result.level}] ${result.title}: ${result.details}`);
    }
    console.log('---');
    console.log(`Summary => OK: ${summary.OK}, WARN: ${summary.WARN}, FAIL: ${summary.FAIL}`);

    process.exit(summary.FAIL > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('[FAIL] Doctor crashed:', error);
    process.exit(1);
});
