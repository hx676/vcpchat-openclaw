const path = require('path');
const { spawn } = require('child_process');
const { resolveNodeExecutable } = require('../utils/nodeExecutable');

class AnalysisEventMemoryService {
    constructor({ projectRoot, store }) {
        this.projectRoot = projectRoot;
        this.store = store;
        this.toolboxRoot = path.resolve(projectRoot, '..', 'VCPToolBox');
        this.dailyNoteScript = path.join(this.toolboxRoot, 'Plugin', 'DailyNote', 'dailynote.js');
        this.notebookName = '银发分析助手';
        this.maidName = '[银发分析助手]银发分析助手';
    }

    buildDiaryContent({ summary, tags, source, priority, category, time }) {
        const stamp = time || new Date().toTimeString().slice(0, 5);
        const normalizedTags = Array.isArray(tags) ? tags.filter(Boolean) : [];
        const finalTags = normalizedTags.length
            ? normalizedTags
            : ['银发分析', '事件记忆', category || 'health_trend'];

        return {
            Content: `[${stamp}] ${summary}\nTag: ${finalTags.join(', ')}`,
            Tag: finalTags.join(', '),
            meta: {
                source: source || 'silver_companion_analysis',
                priority: priority || 'medium',
                category: category || 'health_trend',
            },
        };
    }

    executeDailyNoteCreate(payload) {
        return new Promise((resolve, reject) => {
            const child = spawn(resolveNodeExecutable(), [this.dailyNoteScript], {
                cwd: path.dirname(this.dailyNoteScript),
                env: {
                    ...process.env,
                    PROJECT_BASE_PATH: this.toolboxRoot,
                    PYTHONIOENCODING: 'utf-8',
                },
                windowsHide: true,
            });

            let stdout = '';
            let stderr = '';

            child.stdout.setEncoding('utf8');
            child.stderr.setEncoding('utf8');
            child.stdout.on('data', (chunk) => {
                stdout += chunk;
            });
            child.stderr.on('data', (chunk) => {
                stderr += chunk;
            });
            child.on('error', (error) => {
                reject(error);
            });
            child.stdin.on('error', (error) => {
                reject(error);
            });
            child.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(stderr.trim() || stdout.trim() || `DailyNote exited with code ${code}`));
                    return;
                }
                try {
                    resolve(JSON.parse(stdout.trim()));
                } catch (error) {
                    reject(new Error(`Invalid DailyNote response: ${stdout.trim()}`));
                }
            });

            child.stdin.end(JSON.stringify(payload), 'utf8');
        });
    }

    async writeAnalysisEventMemory({ summary, tags, priority, category, source, date, time }) {
        const trimmedSummary = String(summary || '').trim();
        if (!trimmedSummary) {
            return { success: false, skipped: true, reason: 'empty_summary' };
        }

        const currentMemory = await this.store.readFile('memory').catch(() => null);
        if (currentMemory && currentMemory.analysisLastWriteSummary === trimmedSummary) {
            return {
                success: false,
                skipped: true,
                reason: 'duplicate_summary',
                notebook: this.notebookName,
            };
        }

        const today = date || new Date().toISOString().slice(0, 10);
        const diary = this.buildDiaryContent({
            summary: trimmedSummary,
            tags,
            source,
            priority,
            category,
            time,
        });

        const result = await this.executeDailyNoteCreate({
            command: 'create',
            maid: this.maidName,
            Date: today,
            Content: diary.Content,
            Tag: diary.Tag,
        });

        const nowIso = new Date().toISOString();
        await this.store.updateFile('memory', (memory) => ({
            ...memory,
            updatedAt: nowIso,
            analysisLastWriteAt: nowIso,
            analysisLastWriteSummary: trimmedSummary,
            analysisLastWriteSource: source || 'silver_companion_analysis',
            analysisLastWritePriority: priority || 'medium',
            analysisLastWriteTags: Array.isArray(tags) ? tags : [],
            analysisNotebook: this.notebookName,
        }));

        return {
            success: true,
            notebook: this.notebookName,
            writeResult: result,
            summary: trimmedSummary,
            category: category || 'health_trend',
        };
    }
}

module.exports = AnalysisEventMemoryService;
