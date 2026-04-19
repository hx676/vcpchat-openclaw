// modules/ipc/gatewayHandlers.js
const { ipcMain, shell } = require('electron');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const net = require('net');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { resolveVcpApiKey } = require('../utils/vcpKeyResolver');

let ipcHandlersRegistered = false;
let PROJECT_ROOT = path.resolve(__dirname, '../..');
let SETTINGS_FILE = path.join(PROJECT_ROOT, 'AppData', 'settings.json');

const VCP_PORT = 6005;
const CCPROXY_PORT = 8000;
const CODEX_AUTH_PATH = path.join(os.homedir(), '.codex', 'auth.json');

function toolboxRoot() {
    const sibling = path.resolve(PROJECT_ROOT, '..', 'VCPToolBox');
    if (fs.existsSync(sibling)) return sibling;

    const nested = path.join(PROJECT_ROOT, 'VCPToolBox');
    if (fs.existsSync(nested)) return nested;

    return sibling;
}

function ccproxyDir() {
    return path.join(toolboxRoot(), 'ccproxy-api');
}

function ccproxyConfigFile() {
    return path.join(ccproxyDir(), '.ccproxy.toml');
}

function ccproxyStartScript() {
    return path.join(toolboxRoot(), 'start_ccproxy_codex.ps1');
}

function accountsDir() {
    return path.join(toolboxRoot(), 'CodexAccounts');
}

function backupsDir() {
    return path.join(accountsDir(), '_backups');
}

function launchersDir() {
    return path.join(accountsDir(), 'launchers');
}

function nowStamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function ok(data = {}) {
    return { success: true, ...data };
}

function fail(error, data = {}) {
    return { success: false, error: error instanceof Error ? error.message : String(error), ...data };
}

function sanitizeLabel(label) {
    return String(label || '')
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 64) || `codex-account-${nowStamp()}`;
}

function maskMiddle(value, left = 4, right = 4) {
    const s = String(value || '');
    if (!s) return '';
    if (s.length <= left + right) return '*'.repeat(s.length);
    return `${s.slice(0, left)}...${s.slice(-right)}`;
}

function maskEmail(value) {
    const s = String(value || '');
    const at = s.indexOf('@');
    if (at <= 0) return maskMiddle(s, 2, 2);
    const name = s.slice(0, at);
    const domain = s.slice(at + 1);
    return `${name.slice(0, 1)}***@${domain}`;
}

function stripCodexModelPrefix(model) {
    const value = String(model || '').trim();
    if (!value.toLowerCase().startsWith('openai-codex/')) return value;
    return value.slice('openai-codex/'.length).trim();
}

function shouldRetryWithStrippedCodexModel(status, rawBody, model) {
    if (status !== 400) return false;
    const current = String(model || '').trim();
    if (!current.toLowerCase().startsWith('openai-codex/')) return false;
    return String(rawBody || '').toLowerCase().includes('not supported when using codex with a chatgpt account');
}

function base64UrlDecode(value) {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return Buffer.from(padded, 'base64').toString('utf8');
}

function decodeJwtPayload(token) {
    try {
        const parts = String(token || '').split('.');
        if (parts.length < 2) return null;
        return JSON.parse(base64UrlDecode(parts[1]));
    } catch {
        return null;
    }
}

function dateFromMaybeEpoch(value) {
    if (!value) return null;
    if (typeof value === 'string' && Number.isNaN(Number(value))) {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const ms = n < 10000000000 ? n * 1000 : n;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function readJsonSafe(filePath) {
    try {
        if (!(await fs.pathExists(filePath))) return null;
        return await fs.readJson(filePath);
    } catch {
        return null;
    }
}

async function summarizeAuthFile(filePath) {
    const exists = await fs.pathExists(filePath);
    if (!exists) {
        return {
            exists: false,
            path: filePath,
        };
    }

    const stat = await fs.stat(filePath);
    const raw = await fs.readFile(filePath);
    const fingerprint = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 12);
    const data = await readJsonSafe(filePath);
    const claims = decodeJwtPayload(data?.id_token);
    const openaiAuth = claims?.['https://api.openai.com/auth'] || {};
    const accountId = data?.account_id || claims?.sub || openaiAuth?.user_id || '';
    const email = claims?.email || data?.email || '';
    const plan = openaiAuth?.chatgpt_plan_type || openaiAuth?.plan_type || data?.plan || '';
    const expiresAt = dateFromMaybeEpoch(data?.expires_at || data?.expiry || data?.expiresAt || claims?.exp);

    return {
        exists: true,
        path: filePath,
        fileName: path.basename(filePath),
        updatedAt: stat.mtime.toISOString(),
        size: stat.size,
        fingerprint,
        accountIdPreview: maskMiddle(accountId, 6, 4),
        email,
        emailPreview: email ? maskEmail(email) : '',
        plan,
        expiresAt,
        hasRefreshToken: Boolean(data?.refresh_token),
        hasAccessToken: Boolean(data?.access_token),
        hasIdToken: Boolean(data?.id_token),
    };
}

async function listAccounts() {
    await fs.ensureDir(accountsDir());
    const active = await summarizeAuthFile(CODEX_AUTH_PATH);
    const activeFingerprint = active.fingerprint;
    const entries = await fs.readdir(accountsDir(), { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.toLowerCase().endsWith('.json')) continue;
        const filePath = path.join(accountsDir(), entry.name);
        try {
            const summary = await summarizeAuthFile(filePath);
            files.push({
                ...summary,
                label: entry.name.replace(/\.auth\.json$/i, '').replace(/\.json$/i, ''),
                isActive: Boolean(activeFingerprint && summary.fingerprint === activeFingerprint),
            });
        } catch (error) {
            files.push({
                exists: false,
                path: filePath,
                fileName: entry.name,
                updatedAt: null,
                size: 0,
                fingerprint: '',
                accountIdPreview: '',
                email: '',
                emailPreview: '',
                plan: '',
                expiresAt: null,
                hasRefreshToken: false,
                hasAccessToken: false,
                hasIdToken: false,
                label: entry.name.replace(/\.auth\.json$/i, '').replace(/\.json$/i, ''),
                isActive: false,
                readError: error instanceof Error ? error.message : String(error),
            });
        }
    }

    files.sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });

    return files;
}

function resolveAccountFile(fileName) {
    const base = path.basename(String(fileName || ''));
    if (!base || !base.toLowerCase().endsWith('.json')) {
        throw new Error('请选择有效的账号凭据文件');
    }

    const root = path.resolve(accountsDir());
    const target = path.resolve(root, base);
    if (target !== path.join(root, base)) {
        throw new Error('账号文件路径不合法');
    }
    return target;
}

function tcpProbe(port, host = '127.0.0.1', timeoutMs = 1200) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let settled = false;
        const done = (listening, error = '') => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve({ host, port, listening, error });
        };

        socket.setTimeout(timeoutMs);
        socket.once('connect', () => done(true));
        socket.once('timeout', () => done(false, 'timeout'));
        socket.once('error', (error) => done(false, error.code || error.message));
        socket.connect(port, host);
    });
}

async function waitForPortListening(port, host = '127.0.0.1', timeoutMs = 10000, intervalMs = 500) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        const probe = await tcpProbe(port, host, Math.min(intervalMs, 1200));
        if (probe.listening) {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return false;
}

function requestText(url, options = {}) {
    return new Promise((resolve) => {
        const parsed = new URL(url);
        const transport = parsed.protocol === 'https:' ? https : http;
        const req = transport.request({
            method: options.method || 'GET',
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: `${parsed.pathname}${parsed.search}`,
            headers: options.headers || {},
            timeout: options.timeoutMs || 5000,
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    body: Buffer.concat(chunks).toString('utf8'),
                });
            });
        });

        req.on('timeout', () => {
            req.destroy(new Error('timeout'));
        });
        req.on('error', (error) => {
            resolve({ ok: false, status: 0, body: '', error: error.message });
        });
        if (options.body) req.write(options.body);
        req.end();
    });
}

function runPowerShell(command, timeoutMs = 12000) {
    return new Promise((resolve) => {
        const child = spawn('powershell.exe', [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            command,
        ], {
            windowsHide: true,
        });

        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
            child.kill();
            resolve({ code: -1, stdout, stderr: stderr || 'timeout' });
        }, timeoutMs);

        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString('utf8');
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString('utf8');
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({ code, stdout, stderr });
        });
    });
}

async function getPortOwner(port) {
    const command = [
        `$conn = Get-NetTCPConnection -LocalPort ${Number(port)} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1`,
        'if ($conn) {',
        '  $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue',
        '  [pscustomobject]@{',
        '    pid = $conn.OwningProcess;',
        '    processName = $proc.ProcessName;',
        '    path = $proc.Path;',
        '    startTime = $proc.StartTime',
        '  } | ConvertTo-Json -Compress',
        '}',
    ].join('; ');

    const result = await runPowerShell(command);
    const text = result.stdout.trim();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

async function loadSettingsSummary() {
    const settings = await readJsonSafe(SETTINGS_FILE) || {};
    const url = settings.vcpServerUrl || `http://127.0.0.1:${VCP_PORT}/v1/chat/completions`;
    const key = settings.vcpApiKey || '';
    return {
        vcpServerUrl: url,
        model: settings.model || '',
        enableVcpToolInjection: Boolean(settings.enableVcpToolInjection),
        hasVcpApiKey: Boolean(key),
        vcpApiKeyPreview: key ? maskMiddle(key, 4, 4) : '',
    };
}

async function getStatus() {
    await fs.ensureDir(accountsDir());

    const settings = await loadSettingsSummary();
    const vcpProbe = await tcpProbe(VCP_PORT);
    const ccproxyProbe = await tcpProbe(CCPROXY_PORT);
    const [vcpOwner, ccproxyOwner, activeCredential, accounts] = await Promise.all([
        vcpProbe.listening ? getPortOwner(VCP_PORT) : Promise.resolve(null),
        ccproxyProbe.listening ? getPortOwner(CCPROXY_PORT) : Promise.resolve(null),
        summarizeAuthFile(CODEX_AUTH_PATH),
        listAccounts(),
    ]);

    let docs = { ok: false, status: 0 };
    if (ccproxyProbe.listening) {
        docs = await requestText(`http://127.0.0.1:${CCPROXY_PORT}/openapi.json`, { timeoutMs: 5000 });
    }

    return ok({
        checkedAt: new Date().toISOString(),
        settings,
        services: {
            vcp: { ...vcpProbe, owner: vcpOwner },
            ccproxy: { ...ccproxyProbe, owner: ccproxyOwner, docsReachable: Boolean(docs.ok), docsStatus: docs.status, docsError: docs.error || '' },
        },
        paths: {
            toolboxRoot: toolboxRoot(),
            ccproxyDir: ccproxyDir(),
            ccproxyConfigFile: ccproxyConfigFile(),
            ccproxyStartScript: ccproxyStartScript(),
            accountsDir: accountsDir(),
            codexAuthPath: CODEX_AUTH_PATH,
        },
        credentials: {
            active: activeCredential,
            accounts,
        },
    });
}

async function startCcproxy() {
    const script = ccproxyStartScript();
    if (!(await fs.pathExists(script))) {
        return fail(`找不到启动脚本：${script}`);
    }

    const child = spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        script,
    ], {
        cwd: toolboxRoot(),
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
    });
    child.unref();

    return ok({ message: 'ccproxy 启动命令已发送', script });
}

async function stopCcproxy() {
    const command = [
        `$conns = Get-NetTCPConnection -LocalPort ${CCPROXY_PORT} -State Listen -ErrorAction SilentlyContinue`,
        'foreach ($conn in $conns) { Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue }',
    ].join('; ');
    const result = await runPowerShell(command);
    if (result.code !== 0 && result.stderr) return fail(result.stderr);
    return ok({ message: 'ccproxy 停止命令已发送' });
}

async function restartCcproxy() {
    await stopCcproxy();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return startCcproxy();
}

async function saveActiveAccount(label) {
    if (!(await fs.pathExists(CODEX_AUTH_PATH))) {
        return fail(`当前登录态不存在：${CODEX_AUTH_PATH}`);
    }

    await fs.ensureDir(accountsDir());
    const safeLabel = sanitizeLabel(label);
    const target = path.join(accountsDir(), `${safeLabel}.auth.json`);
    await fs.copy(CODEX_AUTH_PATH, target, { overwrite: true });
    return ok({ file: await summarizeAuthFile(target), target });
}

async function backupActiveAccount() {
    if (!(await fs.pathExists(CODEX_AUTH_PATH))) return null;
    await fs.ensureDir(backupsDir());
    const target = path.join(backupsDir(), `auth.backup-${nowStamp()}.json`);
    await fs.copy(CODEX_AUTH_PATH, target, { overwrite: true });
    return target;
}

async function switchAccount(fileName, restart = true) {
    const source = resolveAccountFile(fileName);
    if (!(await fs.pathExists(source))) {
        return fail(`账号文件不存在：${source}`);
    }

    await fs.ensureDir(path.dirname(CODEX_AUTH_PATH));
    const backupPath = await backupActiveAccount();
    await fs.copy(source, CODEX_AUTH_PATH, { overwrite: true });

    let restartResult = null;
    if (restart) {
        restartResult = await restartCcproxy();
    }

    return ok({
        message: restart ? '账号已切换，ccproxy 正在重启' : '账号已切换',
        backupPath,
        active: await summarizeAuthFile(CODEX_AUTH_PATH),
        restartResult,
    });
}

async function switchLatestAccount(restart = true) {
    await fs.ensureDir(accountsDir());
    const entries = await fs.readdir(accountsDir(), { withFileTypes: true });
    const candidates = [];

    for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.toLowerCase().endsWith('.auth.json')) continue;
        const fullPath = path.join(accountsDir(), entry.name);
        try {
            const stat = await fs.stat(fullPath);
            candidates.push({ fileName: entry.name, mtimeMs: stat.mtimeMs });
        } catch {
            // Ignore transient file-stat errors and continue.
        }
    }

    if (!candidates.length) {
        return fail('No saved account file found in CodexAccounts');
    }

    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return switchAccount(candidates[0].fileName, restart);
}

async function deleteAccount(fileName) {
    const target = resolveAccountFile(fileName);
    if (!(await fs.pathExists(target))) return fail(`账号文件不存在：${target}`);
    await fs.remove(target);
    return ok({ message: '账号文件已删除', target });
}

function psQuote(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
}

async function clearStaleCodexLoginListeners(port = 1455) {
    const psScript = [
        `$port = ${Number(port) || 1455}`,
        '$listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique',
        'if (-not $listeners) { Write-Output "none"; exit 0 }',
        'foreach ($procId in $listeners) {',
        '  $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $procId" -ErrorAction SilentlyContinue',
        '  $cmd = if ($proc) { $proc.CommandLine } else { "" }',
        "  if ($cmd -match 'ccproxy(\\.exe)?\\W*auth\\s+login\\s+codex') {",
        '    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue',
        '    Write-Output ("killed:" + $procId)',
        '  } else {',
        '    $name = if ($proc) { $proc.Name } else { "unknown" }',
        '    Write-Output ("blocked:" + $procId + ":" + $name)',
        '    exit 21',
        '  }',
        '}',
        'exit 0',
    ].join('; ');

    const result = await runPowerShell(psScript, 15000);

    const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
    if (result.code === -1) {
        return { success: false, status: -1, output, error: result.stderr || 'timeout' };
    }
    return {
        success: typeof result.code === 'number' && (result.code === 0 || result.code === 21),
        status: typeof result.code === 'number' ? result.code : 0,
        output,
        error: '',
    };
}

async function launchLogin(label) {
    await fs.ensureDir(accountsDir());
    const safeLabel = sanitizeLabel(label);
    const target = path.join(accountsDir(), `${safeLabel}.auth.json`);
    const proxyDir = ccproxyDir();
    if (!(await fs.pathExists(proxyDir))) {
        return fail(`找不到 ccproxy 目录：${proxyDir}`);
    }

    const command = [
        `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`,
        `Set-Location -LiteralPath ${psQuote(proxyDir)}`,
        `$env:PYTHONUTF8='1'`,
        `$env:PYTHONIOENCODING='utf-8'`,
        `Write-Host '将登录结果保存到：${target.replace(/'/g, "''")}'`,
        `uv run ccproxy auth login codex --file ${psQuote(target)} --force`,
        `Write-Host ''`,
        `Write-Host '登录完成后，回到 VCPChat 的模型网关管理窗口点击刷新。'`,
    ].join('; ');

    const launcher = [
        '$ErrorActionPreference = "Stop"',
        `Start-Process -FilePath 'powershell.exe'`,
        `-WorkingDirectory ${psQuote(proxyDir)}`,
        `-WindowStyle Normal`,
        `-ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', ${psQuote(command)})`,
    ].join(' ');

    const child = spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        launcher,
    ], {
        cwd: proxyDir,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
    });
    child.unref();

    return ok({ message: '已打开登录终端', target });
}

async function launchLoginScript(label) {
    await fs.ensureDir(accountsDir());
    await fs.ensureDir(launchersDir());

    const safeLabel = sanitizeLabel(label);
    const target = path.join(accountsDir(), `${safeLabel}.auth.json`);
    const proxyDir = ccproxyDir();
    if (!(await fs.pathExists(proxyDir))) {
        return fail(`鎵句笉鍒?ccproxy 鐩綍锛?{proxyDir}`);
    }

    const callbackPort = 1455;
    const cleanup = await clearStaleCodexLoginListeners(callbackPort);
    if (!cleanup.success) {
        return fail('Failed to pre-check OAuth callback port', {
            callbackPort,
            details: cleanup.output || cleanup.error || 'unknown error',
        });
    }
    const shouldForceManual = cleanup.status === 21;
    if (cleanup.status !== 0 && cleanup.status !== 21) {
        return fail(`Failed to prepare callback port ${callbackPort}.`, {
            callbackPort,
            details: cleanup.output || '',
        });
    }

    const launcherPath = path.join(launchersDir(), `login_${safeLabel}.cmd`);
    const launcherBody = [
        '@echo off',
        'chcp 65001 >nul',
        `title Codex Login - ${safeLabel}`,
        `cd /d "${proxyDir}"`,
        'set PYTHONUTF8=1',
        'set PYTHONIOENCODING=utf-8',
        'echo Saving login to:',
        `echo ${target}`,
        'echo.',
        'echo Preparing callback port 1455...',
        `powershell -NoProfile -ExecutionPolicy Bypass -Command "$procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'ccproxy(\\.exe)?\\W*auth\\s+login\\s+codex' }; foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }; exit 0"`,
        'timeout /t 1 >nul',
        `powershell -NoProfile -ExecutionPolicy Bypass -Command "$conn = Get-NetTCPConnection -LocalPort 1455 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($conn) { Write-Host ('Port 1455 occupied by PID: ' + $conn.OwningProcess); exit 21 }; exit 0"`,
        ...(shouldForceManual
            ? [
                `echo Port ${callbackPort} is occupied by another app.`,
                'echo Browser callback mode is unavailable. Switching to manual OAuth mode...',
                `uv run ccproxy auth login codex --manual --file "${target}" --force`,
            ]
            : [
                'if %ERRORLEVEL% NEQ 0 (',
                '  echo Port 1455 is still in use. Switching to manual OAuth mode...',
                `  uv run ccproxy auth login codex --manual --file "${target}" --force`,
                '  goto :finish_login',
                ')',
                'echo Callback port is ready.',
                'echo.',
                `uv run ccproxy auth login codex --file "${target}" --force`,
                'if %ERRORLEVEL% NEQ 0 (',
                '  echo.',
                '  echo Auto browser login failed. Switching to manual OAuth mode...',
                `  uv run ccproxy auth login codex --manual --file "${target}" --force`,
                ')',
            ]),
        ':finish_login',
        'echo.',
        'echo Login flow finished. Return to VCPChat and click Refresh.',
        'pause',
        '',
    ].join('\r\n');

    await fs.writeFile(launcherPath, launcherBody, 'utf8');

    const folderOpenResult = await shell.openPath(launchersDir());
    const launchOpenResult = await shell.openPath(launcherPath);
    if (launchOpenResult) {
        return fail(`鏃犳硶鎵撳紑鐧诲綍鑴氭湰锛?${launchOpenResult}`, {
            target,
            launcherPath,
            folderOpenResult,
        });
    }

    return ok({
        message: shouldForceManual ? '登录脚本已打开（1455 被占用，已切换手动 OAuth 模式）' : '登录脚本已生成并打开',
        target,
        launcherPath,
        folderOpenResult,
        callbackPort,
        precheck: cleanup.output || '',
        mode: shouldForceManual ? 'manual' : 'auto',
    });
}

async function openTarget(target) {
    const map = {
        docs: `http://127.0.0.1:${CCPROXY_PORT}/docs`,
        dashboard: `http://127.0.0.1:${CCPROXY_PORT}/dashboard`,
        accounts: accountsDir(),
        ccproxy: ccproxyDir(),
        toolbox: toolboxRoot(),
        codexAuthFolder: path.dirname(CODEX_AUTH_PATH),
    };

    const resolved = map[target];
    if (!resolved) return fail('未知的打开目标');
    if (/^https?:\/\//i.test(resolved)) {
        await shell.openExternal(resolved);
    } else {
        await fs.ensureDir(resolved);
        await shell.openPath(resolved);
    }
    return ok({ target: resolved });
}

async function testVcpRequest() {
    const rawSettings = await readJsonSafe(SETTINGS_FILE) || {};
    let finalUrl = rawSettings.vcpServerUrl || `http://127.0.0.1:${VCP_PORT}/v1/chat/completions`;
    if (rawSettings.enableVcpToolInjection === true) {
        try {
            const urlObj = new URL(finalUrl);
            urlObj.pathname = '/v1/chatvcp/completions';
            finalUrl = urlObj.toString();
        } catch (error) {
            return fail(`Invalid VCP URL: ${finalUrl}`, { details: error.message });
        }
    }

    const keyResolution = resolveVcpApiKey({
        projectRoot: PROJECT_ROOT,
        vcpUrl: finalUrl,
        configuredKey: rawSettings.vcpApiKey || '',
    });
    const effectiveKey = keyResolution.effectiveKey || '';
    let model = rawSettings.model || 'gpt-5.4';
    let body = JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        stream: false,
        max_tokens: 8,
    });

    const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
    };
    if (effectiveKey) {
        headers.Authorization = `Bearer ${effectiveKey}`;
    }

    let result = await requestText(finalUrl, {
        method: 'POST',
        headers,
        body,
        timeoutMs: 60000,
    });

    if (!result.ok && shouldRetryWithStrippedCodexModel(result.status, result.body || result.error, model)) {
        const fallbackModel = stripCodexModelPrefix(model);
        if (fallbackModel && fallbackModel !== model) {
            model = fallbackModel;
            body = JSON.stringify({
                model,
                messages: [{ role: 'user', content: 'ping' }],
                stream: false,
                max_tokens: 8,
            });
            headers['Content-Length'] = Buffer.byteLength(body);
            result = await requestText(finalUrl, {
                method: 'POST',
                headers,
                body,
                timeoutMs: 60000,
            });
        }
    }

    return ok({
        status: result.status,
        ok: result.ok,
        bodyPreview: String(result.body || result.error || '').slice(0, 800),
        requestUrl: finalUrl,
        modelUsed: model,
        keySource: keyResolution.source || 'settings',
    });
}

function parseAuthStatusResult(rawOutput, exitCode) {
    const output = String(rawOutput || '').trim();
    const normalized = output.toLowerCase();

    const hasValidCredentials = /authenticated with valid credentials/.test(normalized);
    const hasAuthenticated = /\bauthenticated\b/.test(normalized);
    const hasExpired = /expired|token.+expired|refresh token.+invalid/.test(normalized);
    const hasUnauthorized = /unauthorized|not authenticated|invalid credentials|forbidden/.test(normalized);
    const hasMissingFile = /no such file|not found|does not exist|missing/.test(normalized);

    if ((exitCode === 0 && hasValidCredentials) || (exitCode === 0 && hasAuthenticated && !hasExpired && !hasUnauthorized)) {
        return {
            usable: true,
            status: 'usable',
            summary: '登录态有效，可使用',
        };
    }

    if (hasExpired || hasUnauthorized) {
        return {
            usable: false,
            status: 'unusable',
            summary: '登录态失效或已过期',
        };
    }

    if (hasMissingFile) {
        return {
            usable: false,
            status: 'error',
            summary: '账号文件不存在或不可读',
        };
    }

    if (exitCode !== 0) {
        return {
            usable: false,
            status: 'error',
            summary: `检测失败（退出码 ${exitCode}）`,
        };
    }

    return {
        usable: false,
        status: 'unusable',
        summary: '未检测到有效登录态',
    };
}

function trimPreview(text, max = 1200) {
    const compact = String(text || '').trim();
    if (compact.length <= max) return compact;
    return `${compact.slice(0, max)} ...`;
}

async function testSavedAccountFile(accountFilePath, accountMeta = {}) {
    const proxyDir = ccproxyDir();
    if (!(await fs.pathExists(proxyDir))) {
        return {
            fileName: accountMeta.fileName || path.basename(accountFilePath),
            label: accountMeta.label || '',
            checkedAt: new Date().toISOString(),
            usable: false,
            status: 'error',
            summary: `ccproxy 目录不存在：${proxyDir}`,
            commandExitCode: -1,
            detailsPreview: '',
        };
    }

    const command = [
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
        `$env:PYTHONUTF8='1'`,
        `$env:PYTHONIOENCODING='utf-8'`,
        `Set-Location -LiteralPath ${psQuote(proxyDir)}`,
        `uv run ccproxy auth status codex --file ${psQuote(accountFilePath)} --detailed`,
    ].join('; ');

    const result = await runPowerShell(command, 60000);
    const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
    const parsed = parseAuthStatusResult(output, result.code);

    return {
        fileName: accountMeta.fileName || path.basename(accountFilePath),
        label: accountMeta.label || '',
        checkedAt: new Date().toISOString(),
        usable: parsed.usable,
        status: parsed.status,
        summary: parsed.summary,
        commandExitCode: result.code,
        detailsPreview: trimPreview(output),
    };
}

async function testAccount(fileName) {
    try {
        const target = resolveAccountFile(fileName);
        if (!(await fs.pathExists(target))) {
            return fail(`账号文件不存在：${target}`);
        }

        const meta = await summarizeAuthFile(target);
        const result = await testSavedAccountFile(target, {
            fileName: path.basename(target),
            label: meta?.fileName
                ? path.basename(meta.fileName, path.extname(meta.fileName))
                : path.basename(target, path.extname(target)),
        });
        return ok(result);
    } catch (error) {
        return fail(`账号测试失败：${error instanceof Error ? error.message : String(error)}`);
    }
}

async function testAllAccounts() {
    let accounts = [];
    try {
        accounts = await listAccounts();
    } catch (error) {
        try {
            await fs.ensureDir(accountsDir());
            const names = await fs.readdir(accountsDir());
            accounts = names
                .filter((name) => String(name).toLowerCase().endsWith('.json'))
                .map((name) => ({
                    fileName: name,
                    label: path.basename(name, path.extname(name)),
                }));
        } catch (fallbackError) {
            return fail(`读取账号列表失败：${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`, {
                details: error instanceof Error ? error.message : String(error),
            });
        }
    }

    const results = [];

    for (const account of accounts) {
        const fileName = account?.fileName;
        if (!fileName) continue;
        try {
            const filePath = resolveAccountFile(fileName);
            const result = await testSavedAccountFile(filePath, {
                fileName,
                label: account.label || path.basename(fileName, path.extname(fileName)),
            });
            results.push(result);
        } catch (error) {
            results.push({
                fileName,
                label: account.label || path.basename(fileName, path.extname(fileName)),
                checkedAt: new Date().toISOString(),
                usable: false,
                status: 'error',
                summary: `检测异常：${error instanceof Error ? error.message : String(error)}`,
                commandExitCode: -1,
                detailsPreview: '',
            });
        }
    }

    const usableCount = results.filter((item) => item.status === 'usable').length;
    const unavailableCount = results.filter((item) => item.status === 'unusable').length;
    const errorCount = results.filter((item) => item.status === 'error').length;

    return ok({
        checkedAt: new Date().toISOString(),
        total: results.length,
        usableCount,
        unavailableCount,
        errorCount,
        results,
    });
}

async function startCcproxyVerified() {
    const startResult = await startCcproxy();
    if (!startResult?.success) {
        return startResult;
    }

    const ready = await waitForPortListening(CCPROXY_PORT, '127.0.0.1', 12000, 500);
    if (!ready) {
        return fail(`ccproxy did not become ready on port ${CCPROXY_PORT} after start`, {
            startResult,
        });
    }

    return ok({
        ...startResult,
        ready: true,
    });
}

async function restartCcproxyVerified() {
    const stopResult = await stopCcproxy();
    if (!stopResult?.success) {
        return stopResult;
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return startCcproxyVerified();
}

async function switchAccountVerified(fileName, restart = true) {
    const result = await switchAccount(fileName, restart);
    if (!result?.success) {
        return result;
    }

    if (restart) {
        if (result.restartResult && result.restartResult.success === false) {
            return fail(`Account switched but ccproxy restart failed: ${result.restartResult.error || 'unknown error'}`, {
                switchResult: result,
                restartResult: result.restartResult,
            });
        }

        const ready = await waitForPortListening(CCPROXY_PORT, '127.0.0.1', 12000, 500);
        if (!ready) {
            return fail(`Account switched but ccproxy is not listening on ${CCPROXY_PORT}`, {
                switchResult: result,
            });
        }
    }

    return result;
}

async function switchLatestAccountVerified(restart = true) {
    const result = await switchLatestAccount(restart);
    if (!result?.success) {
        return result;
    }

    if (restart) {
        if (result.restartResult && result.restartResult.success === false) {
            return fail(`Latest account selected but ccproxy restart failed: ${result.restartResult.error || 'unknown error'}`, {
                switchResult: result,
                restartResult: result.restartResult,
            });
        }

        const ready = await waitForPortListening(CCPROXY_PORT, '127.0.0.1', 12000, 500);
        if (!ready) {
            return fail(`Latest account selected but ccproxy is not listening on ${CCPROXY_PORT}`, {
                switchResult: result,
            });
        }
    }

    return result;
}

function initialize(options = {}) {
    if (ipcHandlersRegistered) return;

    PROJECT_ROOT = options.PROJECT_ROOT || PROJECT_ROOT;
    SETTINGS_FILE = options.SETTINGS_FILE || SETTINGS_FILE;

    ipcMain.handle('gateway:get-status', () => getStatus());
    ipcMain.handle('gateway:start-ccproxy', () => startCcproxyVerified());
    ipcMain.handle('gateway:restart-ccproxy', () => restartCcproxyVerified());
    ipcMain.handle('gateway:stop-ccproxy', () => stopCcproxy());
    ipcMain.handle('gateway:save-active-account', (_event, label) => saveActiveAccount(label));
    ipcMain.handle('gateway:switch-account', (_event, fileName, restart) => switchAccountVerified(fileName, restart !== false));
    ipcMain.handle('gateway:switch-latest-account', (_event, restart) => switchLatestAccountVerified(restart !== false));
    ipcMain.handle('gateway:delete-account', (_event, fileName) => deleteAccount(fileName));
    ipcMain.handle('gateway:launch-login', (_event, label) => launchLoginScript(label));
    ipcMain.handle('gateway:open', (_event, target) => openTarget(target));
    ipcMain.handle('gateway:test-vcp', () => testVcpRequest());
    ipcMain.handle('gateway:test-account', (_event, fileName) => testAccount(fileName));
    ipcMain.handle('gateway:test-all-accounts', () => testAllAccounts());

    ipcHandlersRegistered = true;
}

module.exports = {
    initialize,
};
