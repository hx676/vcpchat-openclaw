const DEMO_ELDER_ID = 'elder_demo';

const DATA_FILES = Object.freeze({
    profile: 'profile.json',
    health: 'health.json',
    emotion: 'emotion.json',
    safeCircle: 'safe_circle.json',
    memory: 'memory.json',
    conversation: 'conversation.json',
    summary: 'summary.json',
    simulation: 'simulation.json',
    analysisSnapshot: 'analysis_snapshot.json',
});

const METRIC_CONFIG = Object.freeze({
    heartRate: { label: '心率', unit: 'bpm', color: '#ef6f6c' },
    bloodOxygen: { label: '血氧', unit: '%', color: '#57c7ff' },
    sleep: { label: '睡眠', unit: 'h', color: '#8f7cff' },
    activity: { label: '活动', unit: '步', color: '#4bc58d' },
    stillDuration: { label: '静止时长', unit: '分钟', color: '#6f7fa1' },
    stress: { label: '压力值', unit: '分', color: '#ff8c6e' },
    bloodPressure: { label: '血压', unit: 'mmHg', color: '#ffb451' },
    bloodSugar: { label: '血糖', unit: 'mmol/L', color: '#c36b7f' },
});

const RANGE_CONFIG = Object.freeze({
    '24h': { label: '近24小时' },
    '7d': { label: '近7天' },
});

const SIMULATION_PRESETS = Object.freeze([
    { type: 'heart_rate_alert', label: '注入心率异常', description: '模拟心率升高并触发风险提醒。' },
    { type: 'sleep_drop', label: '注入睡眠下降', description: '模拟昨夜睡眠时长下降与夜醒增多。' },
    { type: 'interaction_drop', label: '注入互动减少', description: '模拟熟人互动减少与报平安延迟。' },
    { type: 'low_mood', label: '注入低落情绪', description: '模拟表达欲下降、语言能量下降和回避上升。' },
    { type: 'battery_low', label: '注入设备低电', description: '模拟低电量与同步异常。' },
    { type: 'combined', label: '注入复合异常', description: '同时模拟健康、情绪和平安圈波动。' },
    { type: 'baseline', label: '恢复基线状态', description: '重置为默认演示状态。' },
]);

module.exports = {
    DEMO_ELDER_ID,
    DATA_FILES,
    METRIC_CONFIG,
    RANGE_CONFIG,
    SIMULATION_PRESETS,
};
