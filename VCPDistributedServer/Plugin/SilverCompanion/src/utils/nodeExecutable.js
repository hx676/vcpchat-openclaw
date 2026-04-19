const fs = require('fs');
const path = require('path');

function isElectronRuntime() {
    return Boolean(process.versions && process.versions.electron);
}

function getExistingPath(candidates = []) {
    return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

function resolveNodeExecutable() {
    if (!isElectronRuntime()) {
        return process.execPath;
    }

    const envCandidates = [
        process.env.NODE_EXECUTABLE,
        process.env.npm_node_execpath,
        process.env.NODE,
    ].filter(Boolean);

    const windowsCandidates = [
        process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'nodejs', 'node.exe') : null,
        process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'nodejs', 'node.exe') : null,
    ];

    return getExistingPath([...envCandidates, ...windowsCandidates]) || 'node';
}

module.exports = {
    resolveNodeExecutable,
};
