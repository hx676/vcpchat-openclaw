const api = window.utilityAPI || window.electronAPI;

const $ = (id) => document.getElementById(id);

let currentStatus = null;
let toastTimer = null;
let statusPollTimer = null;
let accountTestAllRunning = false;
const accountTestResults = new Map();

function showToast(message, type = 'info') {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.dataset.type = type;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3400);
}

async function unwrap(promise, fallback) {
    const result = await promise;
    if (!result || result.success === false) {
        throw new Error(result?.error || fallback);
    }
    return result;
}

function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('zh-CN', { hour12: false });
}

function serviceClass(service) {
    if (service?.listening) return 'ok';
    return 'bad';
}

function setPill(id, text, cls) {
    const el = $(id);
    if (!el) return;
    el.className = `pill ${cls || 'muted'}`;
    el.textContent = text;
}

function processLine(owner) {
    if (!owner) return 'PID: -';
    return `PID: ${owner.pid || '-'} | ${owner.processName || 'process'}${owner.path ? ` | ${owner.path}` : ''}`;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function kv(label, value) {
    const safe = escapeHtml(value);
    return `<div class="kv"><span>${escapeHtml(label)}</span><strong title="${safe}">${safe}</strong></div>`;
}

function getAccountDisplayName(account) {
    return account?.label || account?.fileName || '未命名账号';
}

function getAccountEmailText(account) {
    return account?.email || account?.emailPreview || '';
}

function findEffectiveAccount(activeCredential, accounts) {
    if (!activeCredential?.exists || !Array.isArray(accounts) || accounts.length === 0) return null;
    const fromFlag = accounts.find((item) => item?.isActive);
    if (fromFlag) return fromFlag;
    if (activeCredential?.fingerprint) {
        const fromFingerprint = accounts.find(
            (item) => item?.fingerprint && item.fingerprint === activeCredential.fingerprint
        );
        if (fromFingerprint) return fromFingerprint;
    }
    return null;
}

function upsertAccountTestResult(fileName, patch = {}) {
    if (!fileName) return;
    const previous = accountTestResults.get(fileName) || {};
    accountTestResults.set(fileName, { ...previous, ...patch });
}

function cleanupAccountTestResults(accounts) {
    const keep = new Set((accounts || []).map((item) => item?.fileName).filter(Boolean));
    for (const key of accountTestResults.keys()) {
        if (!keep.has(key)) accountTestResults.delete(key);
    }
}

function getAccountTestView(fileName) {
    const state = fileName ? accountTestResults.get(fileName) : null;
    if (!state) {
        return {
            text: '未测试',
            cls: 'muted',
            detail: '尚未检测该账号可用性',
            loading: false,
        };
    }

    if (state.pending) {
        return {
            text: '测试中',
            cls: 'testing',
            detail: '正在检测可用性...',
            loading: true,
        };
    }

    if (state.status === 'usable') {
        return {
            text: '可用',
            cls: 'ok',
            detail: `${state.summary || '登录态有效'} · ${formatDate(state.checkedAt)}`,
            loading: false,
        };
    }

    if (state.status === 'unusable') {
        return {
            text: '不可用',
            cls: 'bad',
            detail: `${state.summary || '登录态不可用'} · ${formatDate(state.checkedAt)}`,
            loading: false,
        };
    }

    return {
        text: '测试失败',
        cls: 'warn',
        detail: `${state.summary || '检测异常'} · ${formatDate(state.checkedAt)}`,
        loading: false,
    };
}

function summarizeAccountTests(accounts) {
    const stats = {
        tested: 0,
        usable: 0,
        unusable: 0,
        error: 0,
        pending: 0,
    };

    for (const account of accounts || []) {
        const fileName = account?.fileName;
        if (!fileName) continue;
        const state = accountTestResults.get(fileName);
        if (!state) continue;

        if (state.pending) {
            stats.pending += 1;
            continue;
        }
        stats.tested += 1;
        if (state.status === 'usable') stats.usable += 1;
        else if (state.status === 'unusable') stats.unusable += 1;
        else stats.error += 1;
    }

    return stats;
}

function updateBatchTestButton() {
    const button = $('testAllAccountsBtn');
    if (!button) return;
    button.disabled = accountTestAllRunning;
    button.textContent = accountTestAllRunning ? '批量测试中...' : '批量测试可用性';
}

function renderEffectiveAccountBanner(activeCredential, accounts, ccproxyService) {
    const banner = $('effectiveAccountBanner');
    if (!banner) return;

    if (!activeCredential?.exists) {
        banner.className = 'effective-banner bad';
        banner.textContent = '当前生效账号：未检测到默认登录态（auth.json 不存在）';
        return;
    }

    const effectiveAccount = findEffectiveAccount(activeCredential, accounts);
    const ccproxyReady = Boolean(ccproxyService?.listening);

    if (effectiveAccount) {
        const name = getAccountDisplayName(effectiveAccount);
        const plan = effectiveAccount.plan || activeCredential.plan || '未知计划';
        const emailText = getAccountEmailText(effectiveAccount) || getAccountEmailText(activeCredential) || '未知邮箱';
        const statusText = ccproxyReady ? '已生效' : '登录态已切换，但 ccproxy 未运行';
        banner.className = `effective-banner ${ccproxyReady ? 'ok' : 'warn'}`;
        banner.textContent = `当前生效账号：${name}｜邮箱：${emailText}｜计划：${plan}｜${statusText}`;
        return;
    }

    const anonymousName = getAccountEmailText(activeCredential) || activeCredential.accountIdPreview || '未命名登录态';
    banner.className = `effective-banner ${ccproxyReady ? 'warn' : 'bad'}`;
    banner.textContent = `当前生效账号：${anonymousName}（来自默认 auth.json，未在账号池命名）`;
}

function renderCredential(container, credential) {
    if (!container) return;
    if (!credential?.exists) {
        container.className = 'credential-card empty';
        container.textContent = '未找到默认 Codex 登录态。请先使用网页登录并保存账号。';
        return;
    }

    container.className = 'credential-card';
    container.innerHTML = [
        kv('账号', getAccountEmailText(credential) || credential.accountIdPreview || '未知'),
        kv('计划', credential.plan || '未知'),
        kv('过期时间', formatDate(credential.expiresAt)),
        kv('文件指纹', credential.fingerprint || '-'),
        kv('更新时间', formatDate(credential.updatedAt)),
        kv('文件大小', credential.size ? `${credential.size} bytes` : '-'),
    ].join('');
}

function renderAccounts(accounts) {
    const list = $('accountsList');
    if (!list) return;

    if (!accounts?.length) {
        list.innerHTML = '<div class="credential-card empty">暂未检测到已保存账号。先在上方完成网页登录。</div>';
        return;
    }

    list.innerHTML = accounts.map((account) => {
        const testView = getAccountTestView(account.fileName);
        return `
            <article class="account-card ${account.isActive ? 'active' : ''}">
                <div class="account-title">
                    <h2>${escapeHtml(account.label || account.fileName || '未命名账号')}</h2>
                    <div class="title-pills">
                        <span class="pill ${account.isActive ? 'ok' : 'muted'}">${account.isActive ? '当前生效' : '备用'}</span>
                        <span class="pill ${testView.cls}">${escapeHtml(testView.text)}</span>
                    </div>
                </div>
                <div class="credential-card">
                    ${kv('账号', getAccountEmailText(account) || account.accountIdPreview || '未知')}
                    ${kv('计划', account.plan || '未知')}
                    ${kv('过期', formatDate(account.expiresAt))}
                    ${kv('指纹', account.fingerprint || '-')}
                </div>
                <p class="account-test-meta">${escapeHtml(testView.detail)}</p>
                <div class="account-actions">
                    <button class="small-btn" data-test="${escapeHtml(account.fileName)}" ${testView.loading ? 'disabled' : ''}>测试</button>
                    <button class="small-btn primary" data-switch="${escapeHtml(account.fileName)}" ${account.isActive ? 'disabled' : ''}>切换并重启</button>
                    <button class="small-btn" data-switch-only="${escapeHtml(account.fileName)}" ${account.isActive ? 'disabled' : ''}>仅切换</button>
                    <button class="small-btn danger-soft" data-delete="${escapeHtml(account.fileName)}">删除</button>
                </div>
            </article>
        `;
    }).join('');
}

function pickLatestAccount(accounts) {
    if (!Array.isArray(accounts) || !accounts.length) return null;
    const sorted = [...accounts].sort((a, b) => {
        const at = Date.parse(a?.updatedAt || 0);
        const bt = Date.parse(b?.updatedAt || 0);
        return bt - at;
    });
    return sorted.find((item) => item && item.fileName && !item.isActive)
        || sorted.find((item) => item && item.fileName)
        || null;
}

function renderStatus(status) {
    currentStatus = status;
    const vcp = status.services?.vcp;
    const ccproxy = status.services?.ccproxy;
    const settings = status.settings || {};
    const active = status.credentials?.active;
    const accounts = status.credentials?.accounts || [];
    const effectiveAccount = findEffectiveAccount(active, accounts);

    cleanupAccountTestResults(accounts);
    updateBatchTestButton();

    setPill('vcpStatus', vcp?.listening ? '已连接' : '未监听', serviceClass(vcp));
    setPill(
        'ccproxyStatus',
        ccproxy?.listening ? (ccproxy.docsReachable ? '已连接' : '端口通') : '未监听',
        ccproxy?.listening ? (ccproxy.docsReachable ? 'ok' : 'warn') : 'bad'
    );
    setPill('keyStatus', settings.hasVcpApiKey ? 'Key 已设置' : 'Key 缺失', settings.hasVcpApiKey ? 'ok' : 'bad');

    if ($('vcpDetail')) {
        $('vcpDetail').textContent = vcp?.listening ? '6005 正在接收 VCPChat 请求。' : `6005 未监听：${vcp?.error || '服务未启动'}`;
    }
    if ($('ccproxyDetail')) {
        $('ccproxyDetail').textContent = ccproxy?.listening
            ? (ccproxy.docsReachable ? '8000 已就绪，API 文档可访问。' : `8000 端口可达，但文档检查异常：${ccproxy.docsStatus || ccproxy.docsError || '-'}`)
            : `8000 未监听：${ccproxy?.error || 'ccproxy 未启动'}`;
    }
    if ($('vcpOwner')) $('vcpOwner').textContent = processLine(vcp?.owner);
    if ($('ccproxyOwner')) $('ccproxyOwner').textContent = processLine(ccproxy?.owner);
    if ($('modelName')) $('modelName').textContent = settings.model || '未配置模型';
    if ($('vcpUrl')) $('vcpUrl').textContent = settings.vcpServerUrl || '-';
    if ($('keyPreview')) $('keyPreview').textContent = `Key: ${settings.vcpApiKeyPreview || '-'}`;
    if ($('checkedAtText')) $('checkedAtText').textContent = formatDate(status.checkedAt);
    if ($('accountsPath')) $('accountsPath').textContent = status.paths?.accountsDir || '-';
    if ($('accountsSummary')) {
        const effectiveName = effectiveAccount
            ? getAccountDisplayName(effectiveAccount)
            : (active?.exists ? '未命名登录态' : '无');
        const testStats = summarizeAccountTests(accounts);
        const testSummary = testStats.tested > 0 || testStats.pending > 0
            ? `；检测：已测 ${testStats.tested}，可用 ${testStats.usable}，不可用 ${testStats.unusable}，失败 ${testStats.error}${testStats.pending ? `，测试中 ${testStats.pending}` : ''}`
            : '；检测：尚未测试';
        $('accountsSummary').textContent = `检测到 ${accounts.length} 个已保存账号；当前生效：${effectiveName}${testSummary}`;
    }
    if ($('quotaHint')) $('quotaHint').textContent = '剩余额度：OpenAI OAuth 当前未提供直接查询接口，可通过 429/403 判断是否受限';

    renderCredential($('activeCredential'), active);
    renderEffectiveAccountBanner(active, accounts, ccproxy);
    renderAccounts(accounts);

    const dot = $('overallStatusDot');
    const text = $('overallStatusText');
    if (dot && text) {
        const allOk = Boolean(vcp?.listening && ccproxy?.listening && active?.exists);
        const halfOk = Boolean(vcp?.listening || ccproxy?.listening || active?.exists);
        dot.className = `dot ${allOk ? 'ok' : (halfOk ? 'warn' : 'bad')}`;
        text.textContent = allOk ? '链路完整' : (halfOk ? '需要处理' : '未就绪');
    }
}

async function refreshStatus(silent = false) {
    if (!api?.gatewayGetStatus) {
        showToast('当前 preload 没有暴露模型网关 API，请重启 VCPChat。', 'error');
        return;
    }

    try {
        const result = await unwrap(api.gatewayGetStatus(), '读取模型网关状态失败');
        renderStatus(result);
        if (!silent) showToast('状态已刷新');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function runAction(label, fn, refresh = true) {
    try {
        const result = await unwrap(fn(), `${label}失败`);
        showToast(result.message || `${label}完成`);
        if (refresh) {
            setTimeout(() => refreshStatus(true), 1800);
        }
        return result;
    } catch (error) {
        showToast(error.message, 'error');
        return null;
    }
}

async function runSingleAccountTest(fileName) {
    if (!fileName) return;
    if (!api?.gatewayTestAccount) {
        showToast('当前版本未暴露账号测试接口，请重启应用。', 'error');
        return;
    }

    upsertAccountTestResult(fileName, { pending: true, checkedAt: new Date().toISOString() });
    renderAccounts(currentStatus?.credentials?.accounts || []);
    if ($('accountsSummary')) {
        const accounts = currentStatus?.credentials?.accounts || [];
        const effectiveAccount = findEffectiveAccount(currentStatus?.credentials?.active, accounts);
        const effectiveName = effectiveAccount
            ? getAccountDisplayName(effectiveAccount)
            : (currentStatus?.credentials?.active?.exists ? '未命名登录态' : '无');
        const testStats = summarizeAccountTests(accounts);
        $('accountsSummary').textContent = `检测到 ${accounts.length} 个已保存账号；当前生效：${effectiveName}；检测：已测 ${testStats.tested}，可用 ${testStats.usable}，不可用 ${testStats.unusable}，失败 ${testStats.error}${testStats.pending ? `，测试中 ${testStats.pending}` : ''}`;
    }

    try {
        const result = await unwrap(api.gatewayTestAccount(fileName), '账号测试失败');
        upsertAccountTestResult(fileName, {
            pending: false,
            status: result.status,
            usable: result.usable,
            summary: result.summary,
            checkedAt: result.checkedAt || new Date().toISOString(),
            detailsPreview: result.detailsPreview || '',
            commandExitCode: result.commandExitCode,
        });
        showToast(`${fileName}：${result.status === 'usable' ? '可用' : (result.status === 'unusable' ? '不可用' : '测试失败')}`);
    } catch (error) {
        upsertAccountTestResult(fileName, {
            pending: false,
            status: 'error',
            usable: false,
            summary: error.message || '测试异常',
            checkedAt: new Date().toISOString(),
        });
        showToast(error.message || '账号测试失败', 'error');
    }

    renderStatus(currentStatus || { credentials: { accounts: [] }, services: {}, settings: {}, paths: {} });
}

async function runAllAccountsTest() {
    const accounts = currentStatus?.credentials?.accounts || [];
    if (!accounts.length) {
        showToast('暂无可测试账号', 'error');
        return;
    }
    const canBatch = Boolean(api?.gatewayTestAllAccounts);
    const canSingle = Boolean(api?.gatewayTestAccount);
    if (!canBatch && !canSingle) {
        showToast('当前版本未暴露账号测试接口，请重启应用。', 'error');
        return;
    }

    accountTestAllRunning = true;
    updateBatchTestButton();
    for (const account of accounts) {
        upsertAccountTestResult(account.fileName, { pending: true, checkedAt: new Date().toISOString() });
    }
    renderAccounts(accounts);

    try {
        if (canBatch) {
            const result = await unwrap(api.gatewayTestAllAccounts(), '批量测试失败');
            for (const item of result.results || []) {
                upsertAccountTestResult(item.fileName, {
                    pending: false,
                    status: item.status,
                    usable: item.usable,
                    summary: item.summary,
                    checkedAt: item.checkedAt || new Date().toISOString(),
                    detailsPreview: item.detailsPreview || '',
                    commandExitCode: item.commandExitCode,
                });
            }
            showToast(`批量测试完成：可用 ${result.usableCount || 0} / 不可用 ${result.unavailableCount || 0} / 失败 ${result.errorCount || 0}`);
        } else {
            throw new Error('batch-api-missing');
        }
    } catch (error) {
        if (canSingle) {
            let usableCount = 0;
            let unavailableCount = 0;
            let errorCount = 0;
            for (const account of accounts) {
                const fileName = account?.fileName;
                if (!fileName) continue;
                try {
                    const result = await unwrap(api.gatewayTestAccount(fileName), '账号测试失败');
                    upsertAccountTestResult(fileName, {
                        pending: false,
                        status: result.status,
                        usable: result.usable,
                        summary: result.summary,
                        checkedAt: result.checkedAt || new Date().toISOString(),
                        detailsPreview: result.detailsPreview || '',
                        commandExitCode: result.commandExitCode,
                    });
                    if (result.status === 'usable') usableCount += 1;
                    else if (result.status === 'unusable') unavailableCount += 1;
                    else errorCount += 1;
                } catch (singleError) {
                    upsertAccountTestResult(fileName, {
                        pending: false,
                        status: 'error',
                        usable: false,
                        summary: singleError.message || '账号测试异常',
                        checkedAt: new Date().toISOString(),
                    });
                    errorCount += 1;
                }
            }
            showToast(`批量接口异常，已自动逐个测试：可用 ${usableCount} / 不可用 ${unavailableCount} / 失败 ${errorCount}`, 'warn');
        } else {
            for (const account of accounts) {
                const state = accountTestResults.get(account.fileName);
                if (state?.pending) {
                    upsertAccountTestResult(account.fileName, {
                        pending: false,
                        status: 'error',
                        usable: false,
                        summary: '批量测试中断',
                        checkedAt: new Date().toISOString(),
                    });
                }
            }
            showToast(error.message || '批量测试失败', 'error');
        }
    } finally {
        accountTestAllRunning = false;
        updateBatchTestButton();
        renderStatus(currentStatus || { credentials: { accounts: [] }, services: {}, settings: {}, paths: {} });
    }
}

function bindEvents() {
    $('minimizeBtn')?.addEventListener('click', () => api?.minimizeWindow?.());
    $('maximizeBtn')?.addEventListener('click', () => api?.maximizeWindow?.());
    $('closeBtn')?.addEventListener('click', () => api?.closeWindow?.());
    $('refreshBtn')?.addEventListener('click', () => refreshStatus());
    $('testAllAccountsBtn')?.addEventListener('click', () => runAllAccountsTest());

    $('startCcproxyBtn')?.addEventListener('click', () => runAction('启动 ccproxy', () => api.gatewayStartCcproxy()));
    $('restartCcproxyBtn')?.addEventListener('click', () => {
        if (!confirm('确认重启 8000 端口上的 ccproxy？当前进行中的模型请求会中断。')) return;
        runAction('重启 ccproxy', () => api.gatewayRestartCcproxy());
    });
    $('stopCcproxyBtn')?.addEventListener('click', () => {
        if (!confirm('确认停止 8000 端口上的 ccproxy？VCPChat 的 Codex 模型会暂时不可用。')) return;
        runAction('停止 ccproxy', () => api.gatewayStopCcproxy());
    });

    document.querySelectorAll('[data-open-target]').forEach((button) => {
        button.addEventListener('click', () => runAction('打开目标', () => api.gatewayOpen(button.dataset.openTarget), false));
    });

    $('saveActiveBtn')?.addEventListener('click', () => {
        const label = $('saveActiveLabel')?.value || `active-${Date.now()}`;
        runAction('保存当前账号', () => api.gatewaySaveActiveAccount(label));
    });

    $('launchLoginBtn')?.addEventListener('click', async () => {
        const label = $('loginLabelInput')?.value || `account-${Date.now()}`;
        const result = await runAction('打开登录窗口', () => api.gatewayLaunchLogin(label), false);
        if (result?.launcherPath) {
            showToast(`已尝试自动拉起浏览器登录；若没弹出请双击脚本：${result.launcherPath}`);
        }
        setTimeout(() => refreshStatus(true), 1800);
    });

    $('switchLatestBtn')?.addEventListener('click', async () => {
        const fallbackTarget = pickLatestAccount(currentStatus?.credentials?.accounts || []);
        if (!api?.gatewaySwitchLatestAccount && !fallbackTarget?.fileName) {
            showToast('没有可切换的账号，请先完成网页登录并保存', 'error');
            return;
        }
        if (!confirm('确认切换到最新账号并重启 ccproxy？')) return;
        if (api?.gatewaySwitchLatestAccount) {
            await runAction('切换到最新账号', () => api.gatewaySwitchLatestAccount(true));
            return;
        }
        await runAction('切换到最新账号', () => api.gatewaySwitchAccount(fallbackTarget.fileName, true));
    });

    $('accountsList')?.addEventListener('click', (event) => {
        const target = event.target;
        const testName = target?.dataset?.test;
        const switchName = target?.dataset?.switch;
        const switchOnlyName = target?.dataset?.switchOnly;
        const deleteName = target?.dataset?.delete;

        if (testName) {
            runSingleAccountTest(testName);
            return;
        }

        if (switchName) {
            if (!confirm(`确认切换到 ${switchName} 并重启 ccproxy？`)) return;
            runAction('切换账号', () => api.gatewaySwitchAccount(switchName, true));
        } else if (switchOnlyName) {
            if (!confirm(`确认仅切换到 ${switchOnlyName}？不重启时可能需要稍后手动重启 ccproxy 才生效。`)) return;
            runAction('切换账号', () => api.gatewaySwitchAccount(switchOnlyName, false));
        } else if (deleteName) {
            if (!confirm(`确认删除账号文件 ${deleteName}？这不会删除当前默认登录态。`)) return;
            runAction('删除账号文件', () => api.gatewayDeleteAccount(deleteName));
        }
    });

    $('testVcpBtn')?.addEventListener('click', async () => {
        if (!confirm('这会真实请求一次当前模型，可能消耗少量额度。继续吗？')) return;
        if ($('testResult')) $('testResult').textContent = '正在发送 ping...';
        const result = await runAction('链路测试', () => api.gatewayTestVcp(), false);
        if (result && $('testResult')) {
            $('testResult').textContent = JSON.stringify({
                status: result.status,
                ok: result.ok,
                bodyPreview: result.bodyPreview,
            }, null, 2);
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    updateBatchTestButton();
    refreshStatus(true);
    statusPollTimer = setInterval(() => refreshStatus(true), 10000);
});

window.addEventListener('beforeunload', () => {
    if (statusPollTimer) {
        clearInterval(statusPollTimer);
        statusPollTimer = null;
    }
});
