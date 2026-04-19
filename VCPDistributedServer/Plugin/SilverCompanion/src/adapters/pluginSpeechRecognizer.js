const path = require('path');
const fs = require('fs');

let browser = null;
let page = null;
let isProcessing = false;
let textCallback = null;
let lastResolvedConfigSignature = '';
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
let recognizerConfig = {
    browserPath: '',
    recognizerPagePath: path.join(PROJECT_ROOT, 'Voicechatmodules', 'recognizer.html'),
};

function getDefaultRecognizerPagePath() {
    return path.join(PROJECT_ROOT, 'Voicechatmodules', 'recognizer.html');
}

function resolveRecognizerPagePath(customPagePath = '') {
    const candidate = String(customPagePath || '').trim();
    if (!candidate) {
        return getDefaultRecognizerPagePath();
    }

    if (path.isAbsolute(candidate)) {
        return candidate;
    }

    return path.join(PROJECT_ROOT, candidate);
}

function resolveRecognizerPageUrl(customPagePath = '') {
    const resolvedPath = resolveRecognizerPagePath(customPagePath);
    return `file://${resolvedPath.replace(/\\/g, '/')}`;
}

function resolveBrowserExecutablePath(puppeteer, customBrowserPath = '') {
    const customPath = String(customBrowserPath || '').trim();
    if (customPath) {
        if (fs.existsSync(customPath)) {
            return customPath;
        }
        throw new Error(`Custom browser path does not exist: ${customPath}`);
    }

    let executablePath = puppeteer.executablePath();
    if (process.platform === 'win32') {
        const chromePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe') : null,
        ].filter(Boolean);

        for (const candidate of chromePaths) {
            if (fs.existsSync(candidate)) {
                executablePath = candidate;
                break;
            }
        }
    }

    return executablePath;
}

function normalizeConfig(config = {}) {
    return {
        browserPath: String(config.browserPath || '').trim(),
        recognizerPagePath: resolveRecognizerPagePath(config.recognizerPagePath),
    };
}

function getConfigSignature(config) {
    return JSON.stringify({
        browserPath: config.browserPath || '',
        recognizerPagePath: config.recognizerPagePath || '',
    });
}

async function ensureConfigApplied(nextConfig = {}) {
    const normalized = normalizeConfig(nextConfig);
    const nextSignature = getConfigSignature(normalized);

    recognizerConfig = normalized;

    if (browser && nextSignature !== lastResolvedConfigSignature) {
        await shutdown();
    }

    lastResolvedConfigSignature = nextSignature;
}

async function initializeBrowser() {
    if (browser) {
        return;
    }

    const puppeteer = require('puppeteer');
    const executablePath = resolveBrowserExecutablePath(puppeteer, recognizerConfig.browserPath);

    browser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--use-fake-ui-for-media-stream',
            '--disable-gpu',
        ],
    });

    page = await browser.newPage();
    const context = browser.defaultBrowserContext();

    try {
        await context.overridePermissions('file://', ['microphone']);
    } catch (_error) {
        await context.overridePermissions(`file://${PROJECT_ROOT.replace(/\\/g, '/')}`, ['microphone']);
    }

    await page.exposeFunction('sendTextToElectron', (text) => {
        if (typeof textCallback === 'function') {
            textCallback(text);
        }
    });

    await page.exposeFunction('sendErrorToElectron', (error) => {
        console.error('[SilverCompanion SpeechRecognizer] Browser Error:', error);
    });

    await page.goto(resolveRecognizerPageUrl(recognizerConfig.recognizerPagePath));
}

async function start(callback, config = {}) {
    if (isProcessing) {
        throw new Error('Speech recognizer is already starting.');
    }

    isProcessing = true;
    try {
        if (callback) {
            textCallback = callback;
        }

        await ensureConfigApplied({
            browserPath: config.browserPath,
            recognizerPagePath: config.recognizerPagePath,
        });

        await initializeBrowser();
        if (!page) {
            throw new Error('Speech recognizer page is unavailable.');
        }

        await page.evaluate(() => {
            if (typeof window.startRecognition !== 'function') {
                throw new Error('Recognizer page missing startRecognition.');
            }
            window.startRecognition();
        });
    } catch (error) {
        await shutdown();
        throw error;
    } finally {
        isProcessing = false;
    }
}

async function stop() {
    if (isProcessing || !page) {
        return;
    }

    isProcessing = true;
    try {
        if (page && !page.isClosed()) {
            await page.evaluate(() => {
                if (typeof window.stopRecognition === 'function') {
                    window.stopRecognition();
                }
            });
        }
    } finally {
        isProcessing = false;
    }
}

async function shutdown() {
    if (browser) {
        try {
            await browser.close();
        } catch (_error) {
            // Ignore shutdown errors.
        }
    }

    browser = null;
    page = null;
    textCallback = null;
    isProcessing = false;
}

module.exports = {
    start,
    stop,
    shutdown,
};
