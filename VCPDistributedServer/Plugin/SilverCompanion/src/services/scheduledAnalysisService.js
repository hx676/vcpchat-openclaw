class ScheduledAnalysisService {
    constructor({ intervalMs = 5 * 60 * 1000, runAnalysis, onMeaningfulChange }) {
        this.intervalMs = intervalMs;
        this.runAnalysis = runAnalysis;
        this.onMeaningfulChange = onMeaningfulChange;
        this.timer = null;
        this.running = false;
        this.lastSignature = '';
    }

    async tick() {
        if (this.running) return;
        this.running = true;
        try {
            const result = await this.runAnalysis();
            const signature = JSON.stringify({
                risk: result?.dashboard?.analysisSnapshot?.lastRiskLevel,
                headline: result?.dashboard?.familySummary?.headline,
            });
            if (signature !== this.lastSignature) {
                this.lastSignature = signature;
                if (typeof this.onMeaningfulChange === 'function') {
                    await this.onMeaningfulChange(result);
                }
            }
        } finally {
            this.running = false;
        }
    }

    start() {
        if (this.timer) return;
        this.timer = setInterval(() => {
            this.tick().catch(() => {});
        }, this.intervalMs);
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.running = false;
    }
}

module.exports = ScheduledAnalysisService;
