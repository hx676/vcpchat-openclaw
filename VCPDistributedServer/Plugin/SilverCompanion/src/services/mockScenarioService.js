const { normalizeHealthState } = require('../store/demoDefaults');
const { createDemoState } = require('../store/demoDefaults');

class MockScenarioService {
    constructor({ store }) {
        this.store = store;
    }

    async restoreBaseline() {
        const defaults = createDemoState();
        const nowIso = new Date().toISOString();

        await Promise.all([
            this.store.writeFile('health', {
                ...normalizeHealthState(defaults.health),
                updatedAt: nowIso,
            }),
            this.store.writeFile('emotion', {
                ...defaults.emotion,
                updatedAt: nowIso,
                agentAnalysis: null,
            }),
            this.store.writeFile('safeCircle', {
                ...defaults.safeCircle,
                updatedAt: nowIso,
            }),
            this.store.writeFile('simulation', {
                ...defaults.simulation,
                updatedAt: nowIso,
                currentScenario: 'baseline',
                history: [
                    {
                        type: 'baseline',
                        createdAt: nowIso,
                    },
                ],
            }),
            this.store.writeFile('summary', {
                ...defaults.summary,
                updatedAt: nowIso,
            }),
            this.store.writeFile('analysisSnapshot', {
                ...defaults.analysisSnapshot,
                updatedAt: nowIso,
            }),
        ]);

        return {
            type: 'baseline',
            label: '已恢复基线状态',
            preserved: ['profile', 'memory', 'conversation'],
        };
    }

    async applyEvent(eventInput) {
        const event = typeof eventInput === 'string' ? { type: eventInput } : (eventInput || {});
        const eventType = event.type || 'baseline';

        if (eventType === 'baseline') {
            return this.restoreBaseline();
        }

        const [rawHealth, emotion, safeCircle] = await Promise.all([
            this.store.readFile('health'),
            this.store.readFile('emotion'),
            this.store.readFile('safeCircle'),
        ]);
        const health = normalizeHealthState(rawHealth);

        const nowIso = new Date().toISOString();

        if (eventType === 'heart_rate_alert' || eventType === 'combined') {
            const heartRate = [...health.metrics.heartRate];
            heartRate[heartRate.length - 1] = { ...heartRate[heartRate.length - 1], timestamp: nowIso, value: 108 };
            health.metrics.heartRate = heartRate;
        }

        if (eventType === 'sleep_drop' || eventType === 'combined') {
            const sleep = [...health.metrics.sleep];
            sleep[sleep.length - 1] = { ...sleep[sleep.length - 1], timestamp: nowIso, durationHours: 5.3, deepHours: 1.4, wakeCount: 3 };
            health.metrics.sleep = sleep;
        }

        if (eventType === 'battery_low' || eventType === 'combined') {
            health.device = {
                ...health.device,
                battery: 14,
                lastSyncAt: new Date(Date.now() - (65 * 60 * 1000)).toISOString(),
            };
        }

        if (eventType === 'combined') {
            const stillDuration = [...health.metrics.stillDuration];
            stillDuration[stillDuration.length - 1] = {
                ...stillDuration[stillDuration.length - 1],
                timestamp: nowIso,
                minutes: 310,
            };
            health.metrics.stillDuration = stillDuration;

            const stress = [...health.metrics.stress];
            stress[stress.length - 1] = {
                ...stress[stress.length - 1],
                timestamp: nowIso,
                value: 84,
            };
            health.metrics.stress = stress;

            const bloodSugar = [...health.metrics.bloodSugar];
            bloodSugar[bloodSugar.length - 1] = {
                ...bloodSugar[bloodSugar.length - 1],
                timestamp: nowIso,
                value: 10.8,
                unit: 'mmol/L',
                period: 'postprandial',
            };
            health.metrics.bloodSugar = bloodSugar;

            health.device = {
                ...health.device,
                wearStatus: 'removed',
                isWorn: false,
                wearStatusUpdatedAt: nowIso,
            };
        }

        if (eventType === 'interaction_drop' || eventType === 'combined') {
            safeCircle.lastCheckInAt = new Date(Date.now() - (21 * 60 * 60 * 1000)).toISOString();
            safeCircle.checkInLabel = '今天未完成主动报平安';
            safeCircle.contacts = safeCircle.contacts.map((contact, index) => ({
                ...contact,
                lastInteractionAt: new Date(Date.now() - ((index + 2) * 18 * 60 * 60 * 1000)).toISOString(),
                status: index === 0 ? 'quiet' : contact.status,
                interactionDelta: -2,
            }));
        }

        if (eventType === 'low_mood' || eventType === 'combined') {
            emotion.overallTrend = 'down';
            emotion.signals.expressionDesire = { score: 39, delta: -18, label: '表达欲明显下降' };
            emotion.signals.languageEnergy = { score: 42, delta: -16, label: '语言能量下降' };
            emotion.signals.avoidanceTendency = { score: 62, delta: 14, label: '回避表达明显上升' };
            emotion.signals.familiarInteraction = { score: 48, delta: -20, label: '熟人互动明显减少' };
            emotion.narrative = [
                '最近表达欲和语言能量同步下降，存在“说没事但不太想展开聊”的迹象。',
                '熟人互动减少与回避倾向上升同时出现，更像是低落而不是单纯忙碌。',
                '建议陪伴方式保持轻柔，不要连续追问身体或家庭压力。',
            ];
        }

        await Promise.all([
            this.store.writeFile('health', { ...health, updatedAt: nowIso }),
            this.store.writeFile('emotion', { ...emotion, updatedAt: nowIso }),
            this.store.writeFile('safeCircle', { ...safeCircle, updatedAt: nowIso }),
            this.store.updateFile('simulation', (simulation) => ({
                ...simulation,
                updatedAt: nowIso,
                currentScenario: eventType,
                history: [
                    {
                        type: eventType,
                        createdAt: nowIso,
                    },
                    ...simulation.history,
                ].slice(0, 12),
            })),
        ]);

        return { type: eventType, label: '模拟事件已注入' };
    }
}

module.exports = MockScenarioService;
