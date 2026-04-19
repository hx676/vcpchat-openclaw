const { SIMULATION_PRESETS } = require('../types/constants');

function isoHoursAgo(baseTime, hoursAgo) {
    return new Date(baseTime - (hoursAgo * 60 * 60 * 1000)).toISOString();
}

function isoDaysAgo(baseTime, daysAgo) {
    return new Date(baseTime - (daysAgo * 24 * 60 * 60 * 1000)).toISOString();
}

function buildHourlySeries(baseTime, count, mapper) {
    return Array.from({ length: count }, (_value, index) => {
        const offset = count - index - 1;
        return mapper(offset, isoHoursAgo(baseTime, offset));
    });
}

function buildDailySeries(baseTime, count, mapper) {
    return Array.from({ length: count }, (_value, index) => {
        const offset = count - index - 1;
        return mapper(offset, isoDaysAgo(baseTime, offset));
    });
}

function normalizeSeries(series, fallbackSeries) {
    return Array.isArray(series) && series.length ? series : fallbackSeries;
}

function createDemoHealthState(baseTime = Date.now()) {
    const heartRate = buildHourlySeries(baseTime, 24 * 7, (offset, timestamp) => ({
        timestamp,
        value: Math.max(63, Math.round(71 + Math.sin(offset / 3) * 5 + (offset % 4 === 0 ? 2 : 0))),
    }));

    const bloodOxygen = buildHourlySeries(baseTime, 24 * 7, (offset, timestamp) => ({
        timestamp,
        value: Math.max(95, Math.min(99, Math.round(97 + Math.cos(offset / 4) * 1))),
    }));

    const sleep = buildDailySeries(baseTime, 7, (offset, timestamp) => ({
        timestamp,
        durationHours: Number((7.6 - (offset % 3) * 0.3).toFixed(1)),
        deepHours: Number((2.2 - (offset % 2) * 0.2).toFixed(1)),
        wakeCount: 1 + (offset % 2),
    }));

    const bloodPressure = buildDailySeries(baseTime, 7, (offset, timestamp) => ({
        timestamp,
        systolic: 124 + (offset % 3) * 2,
        diastolic: 78 + (offset % 2),
    }));

    const activity = buildDailySeries(baseTime, 7, (offset, timestamp) => ({
        timestamp,
        steps: 6200 + (offset % 4) * 550,
        activeMinutes: 58 + (offset % 3) * 6,
    }));

    const stillDuration = buildDailySeries(baseTime, 7, (offset, timestamp) => ({
        timestamp,
        minutes: 72 + (offset % 4) * 18,
    }));

    const stress = buildDailySeries(baseTime, 7, (offset, timestamp) => ({
        timestamp,
        value: 38 + (offset % 4) * 6,
    }));

    const bloodSugar = buildDailySeries(baseTime, 7, (offset, timestamp) => {
        const period = offset % 3 === 0 ? 'fasting' : offset % 3 === 1 ? 'postprandial' : 'random';
        const baseValue = period === 'fasting' ? 5.2 : period === 'postprandial' ? 6.8 : 6.1;
        return {
            timestamp,
            value: Number((baseValue + (offset % 2) * 0.3).toFixed(1)),
            unit: 'mmol/L',
            period,
        };
    });

    return {
        updatedAt: new Date(baseTime).toISOString(),
        device: {
            battery: 72,
            connected: true,
            locationName: '徐汇社区花园',
            gpsStatus: 'normal',
            lastSyncAt: isoHoursAgo(baseTime, 0),
            sosEnabled: true,
            wearStatus: 'worn',
            isWorn: true,
            wearStatusUpdatedAt: isoHoursAgo(baseTime, 1),
        },
        metrics: {
            heartRate,
            bloodOxygen,
            sleep,
            activity,
            stillDuration,
            stress,
            bloodPressure,
            bloodSugar,
        },
    };
}

function normalizeHealthState(health = {}, options = {}) {
    const baseTime = Number.isFinite(Date.parse(health.updatedAt))
        ? Date.parse(health.updatedAt)
        : (options.baseTime || Date.now());
    const defaults = createDemoHealthState(baseTime);
    const device = health.device || {};
    const metrics = health.metrics || {};
    const derivedWearStatus = typeof device.isWorn === 'boolean'
        ? (device.isWorn ? 'worn' : 'removed')
        : (device.wearStatus || defaults.device.wearStatus);
    const derivedIsWorn = typeof device.isWorn === 'boolean'
        ? device.isWorn
        : (derivedWearStatus === 'unknown' ? null : derivedWearStatus === 'worn');

    return {
        updatedAt: health.updatedAt || defaults.updatedAt,
        device: {
            ...defaults.device,
            ...device,
            wearStatus: derivedWearStatus,
            isWorn: derivedIsWorn,
            wearStatusUpdatedAt: device.wearStatusUpdatedAt || device.lastSyncAt || defaults.device.wearStatusUpdatedAt,
        },
        metrics: {
            heartRate: normalizeSeries(metrics.heartRate, defaults.metrics.heartRate),
            bloodOxygen: normalizeSeries(metrics.bloodOxygen, defaults.metrics.bloodOxygen),
            sleep: normalizeSeries(metrics.sleep, defaults.metrics.sleep),
            activity: normalizeSeries(metrics.activity, defaults.metrics.activity),
            stillDuration: normalizeSeries(metrics.stillDuration, defaults.metrics.stillDuration),
            stress: normalizeSeries(metrics.stress, defaults.metrics.stress),
            bloodPressure: normalizeSeries(metrics.bloodPressure, defaults.metrics.bloodPressure),
            bloodSugar: normalizeSeries(metrics.bloodSugar, defaults.metrics.bloodSugar),
        },
    };
}

function createDemoState() {
    const now = Date.now();

    return {
        profile: {
            id: 'elder_demo',
            name: '李阿姨',
            age: 67,
            gender: '女',
            city: '上海',
            relationshipRole: '退休教师',
            watchName: '银发陪伴腕带',
            avatarLabel: 'LA',
            motto: '今天也想和熟悉的人说一声平安。',
            preferences: ['喜欢晨间散步', '晚饭后会和老同事语音聊天', '偏爱温和的提醒方式'],
            family: ['女儿住在苏州', '外孙每周末视频'],
            tags: ['品质银发', '熟人圈活跃', '偏好语音交流'],
        },
        health: createDemoHealthState(now),
        emotion: {
            updatedAt: new Date(now).toISOString(),
            overallTrend: 'stable',
            agentAnalysis: null,
            signals: {
                expressionDesire: { score: 68, delta: -4, label: '表达欲略有回落' },
                languageEnergy: { score: 64, delta: -3, label: '语言能量平稳偏缓' },
                avoidanceTendency: { score: 28, delta: 2, label: '回避倾向较低' },
                familiarInteraction: { score: 72, delta: -6, label: '熟人互动仍保持活跃' },
            },
            narrative: [
                '最近两天依旧保持规律交流，但晚间主动表达略有下降。',
                '睡眠趋势基本平稳，没有出现明显烦躁或压抑指征。',
                '熟人圈互动频率仍处于较健康区间，暂未出现持续疏离迹象。',
            ],
        },
        safeCircle: {
            updatedAt: new Date(now).toISOString(),
            lastCheckInAt: isoHoursAgo(now, 3),
            checkInLabel: '今天 08:15 已报平安',
            contacts: [
                { id: 'daughter', name: '小雨', relation: '女儿', lastInteractionAt: isoHoursAgo(now, 6), status: 'online', interactionDelta: -1 },
                { id: 'friend-wang', name: '王阿姨', relation: '老同事', lastInteractionAt: isoHoursAgo(now, 10), status: 'calm', interactionDelta: 0 },
                { id: 'travel-group', name: '公园晨练群', relation: '熟人圈', lastInteractionAt: isoHoursAgo(now, 20), status: 'quiet', interactionDelta: -1 },
            ],
            warnings: [],
        },
        memory: {
            updatedAt: new Date(now).toISOString(),
            longTermLastWriteAt: null,
            longTermLastWriteSummary: '',
            longTermLastWriteSource: '',
            longTermLastWritePriority: '',
            longTermLastWriteTags: [],
            longTermNotebook: '银发陪伴助手',
            analysisLastWriteAt: null,
            analysisLastWriteSummary: '',
            analysisLastWriteSource: '',
            analysisLastWritePriority: '',
            analysisLastWriteTags: [],
            analysisNotebook: '银发分析助手',
            shortTerm: {
                lastTopic: '今天晨练后觉得膝盖有一点酸',
                lastMoodTag: '平稳',
            },
            midTerm: {
                recentPatterns: [
                    '近一周睡眠时长比较稳定，起夜次数较少。',
                    '傍晚聊天时更愿意讲熟人圈的小事，而不是身体感受。',
                ],
            },
            longTerm: {
                preferences: ['希望提醒像朋友一样自然', '喜欢语音交流多过长文本'],
                familyContext: ['对子女报忧时会比较克制', '重视熟人圈里的存在感'],
            },
        },
        conversation: {
            updatedAt: new Date(now).toISOString(),
            messages: [
                {
                    id: 'msg_seed_assistant',
                    role: 'assistant',
                    channel: 'text',
                    text: '早上好，李阿姨。今天风不大，您要是想去花园散步，我可以帮您看看今天的步数趋势。',
                    createdAt: isoHoursAgo(now, 5),
                },
                {
                    id: 'msg_seed_user',
                    role: 'user',
                    channel: 'voice',
                    text: '我刚走了一圈，感觉还可以，就是有点犯困。',
                    createdAt: isoHoursAgo(now, 4),
                },
                {
                    id: 'msg_seed_assistant_2',
                    role: 'assistant',
                    channel: 'text',
                    text: '那今天午后可以稍微休息一下。我会把您最近的睡眠变化一起记着，避免只是累了却没说出来。',
                    createdAt: isoHoursAgo(now, 4),
                },
            ],
            proactive: {
                lastGreetingAt: isoHoursAgo(now, 5),
                nextSuggestedGreeting: '傍晚提醒报平安',
            },
        },
        summary: {
            updatedAt: new Date(now).toISOString(),
            agentOutputs: {
                daily: null,
                weekly: null,
            },
            daily: {
                headline: '总体状态平稳，表达欲较昨日轻微下降。',
                keyEvents: [
                    '今日已完成晨间活动，活动量维持在正常区间。',
                    '情绪趋势总体稳定，但晚间主动表达略少。',
                    '熟人圈互动保持活跃，没有出现显著断联。',
                ],
                recommendedActions: [
                    '傍晚可由家属发起一次简短语音问候。',
                    '继续关注睡眠与傍晚情绪变化，不需要过度干预。',
                ],
            },
            weekly: {
                headline: '本周整体状态温和稳定，生活节奏与熟人圈联系保持良好。',
                keyEvents: [
                    '睡眠和活动数据整体平稳，无持续上升风险。',
                    '熟人互动维持规律，但存在轻微的晚间交流回落。',
                ],
                recommendedActions: [
                    '周末可以安排一次更长一点的视频陪伴。',
                    '继续观察“说没事但表达减少”的模式是否连续出现。',
                ],
            },
        },
        simulation: {
            updatedAt: new Date(now).toISOString(),
            currentScenario: 'baseline',
            history: [],
            availableEvents: SIMULATION_PRESETS,
        },
        analysisSnapshot: {
            updatedAt: new Date(now).toISOString(),
            lastTurnAnalysisAt: null,
            lastScheduledAnalysisAt: null,
            lastDirective: null,
            lastRiskLevel: 'low',
            lastFamilySummary: '',
            lastHandoffState: {
                required: false,
                reason: '',
            },
        },
    };
}

module.exports = {
    createDemoState,
    createDemoHealthState,
    normalizeHealthState,
};
