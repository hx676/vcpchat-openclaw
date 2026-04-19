const { METRIC_CONFIG } = require('../types/constants');
const { normalizeHealthState } = require('../store/demoDefaults');

function latestItem(list = []) {
    return Array.isArray(list) && list.length ? list[list.length - 1] : null;
}

function stringifyStable(value) {
    return JSON.stringify(value);
}

function getBloodSugarThreshold(period) {
    return period === 'fasting'
        ? { low: 4.0, high: 7.0 }
        : { low: 4.0, high: 10.0 };
}

function getBloodSugarPeriodLabel(period) {
    if (period === 'fasting') return '空腹';
    if (period === 'postprandial') return '餐后';
    return '随机';
}

function isBloodSugarWatch(item) {
    if (!item || typeof item.value !== 'number') return false;
    const threshold = getBloodSugarThreshold(item.period);
    return item.value < threshold.low || item.value > threshold.high;
}

class HealthMonitorService {
    constructor({ store }) {
        this.store = store;
    }

    async getHealthData() {
        const current = await this.store.readFile('health');
        const normalized = normalizeHealthState(current);
        if (stringifyStable(current) !== stringifyStable(normalized)) {
            await this.store.writeFile('health', normalized);
        }
        return normalized;
    }

    async getMetricTimeline(metric, range = '24h') {
        const health = await this.getHealthData();
        const series = health.metrics[metric];
        if (!Array.isArray(series)) {
            throw new Error(`Unsupported metric: ${metric}`);
        }

        const normalizedRange = range === '7d' ? '7d' : '24h';
        const hourlyMetrics = new Set(['heartRate', 'bloodOxygen']);

        if (normalizedRange === '24h' && series.length > 24) {
            return series.slice(-24);
        }
        if (normalizedRange === '7d') {
            if (hourlyMetrics.has(metric) && series.length > 24 * 7) {
                return series.slice(-(24 * 7));
            }
            if (!hourlyMetrics.has(metric) && series.length > 7) {
                return series.slice(-7);
            }
        }
        return series;
    }

    buildLatestMetrics(health) {
        const heartRateLatest = latestItem(health.metrics.heartRate);
        const bloodOxygenLatest = latestItem(health.metrics.bloodOxygen);
        const sleepLatest = latestItem(health.metrics.sleep);
        const activityLatest = latestItem(health.metrics.activity);
        const stillDurationLatest = latestItem(health.metrics.stillDuration);
        const stressLatest = latestItem(health.metrics.stress);
        const bloodPressureLatest = latestItem(health.metrics.bloodPressure);
        const bloodSugarLatest = latestItem(health.metrics.bloodSugar);

        return {
            heartRate: heartRateLatest
                ? { value: heartRateLatest.value, unit: METRIC_CONFIG.heartRate.unit, timestamp: heartRateLatest.timestamp }
                : null,
            bloodOxygen: bloodOxygenLatest
                ? { value: bloodOxygenLatest.value, unit: METRIC_CONFIG.bloodOxygen.unit, timestamp: bloodOxygenLatest.timestamp }
                : null,
            sleep: sleepLatest
                ? {
                    durationHours: sleepLatest.durationHours,
                    deepHours: sleepLatest.deepHours,
                    wakeCount: sleepLatest.wakeCount,
                    unit: METRIC_CONFIG.sleep.unit,
                    timestamp: sleepLatest.timestamp,
                }
                : null,
            activity: activityLatest
                ? {
                    steps: activityLatest.steps,
                    activeMinutes: activityLatest.activeMinutes,
                    stepUnit: METRIC_CONFIG.activity.unit,
                    durationUnit: '分钟',
                    timestamp: activityLatest.timestamp,
                }
                : null,
            stillDuration: stillDurationLatest
                ? {
                    minutes: stillDurationLatest.minutes,
                    unit: METRIC_CONFIG.stillDuration.unit,
                    timestamp: stillDurationLatest.timestamp,
                }
                : null,
            stress: stressLatest
                ? {
                    value: stressLatest.value,
                    unit: METRIC_CONFIG.stress.unit,
                    timestamp: stressLatest.timestamp,
                }
                : null,
            bloodPressure: bloodPressureLatest
                ? {
                    systolic: bloodPressureLatest.systolic,
                    diastolic: bloodPressureLatest.diastolic,
                    unit: METRIC_CONFIG.bloodPressure.unit,
                    timestamp: bloodPressureLatest.timestamp,
                }
                : null,
            bloodSugar: bloodSugarLatest
                ? {
                    value: bloodSugarLatest.value,
                    unit: bloodSugarLatest.unit || METRIC_CONFIG.bloodSugar.unit,
                    period: bloodSugarLatest.period || 'random',
                    timestamp: bloodSugarLatest.timestamp,
                }
                : null,
        };
    }

    computeAlerts(health, latestMetrics = this.buildLatestMetrics(health)) {
        const battery = health.device?.battery ?? 100;
        const lastSync = health.device?.lastSyncAt ? Date.parse(health.device.lastSyncAt) : Date.now();
        const minutesSinceSync = Math.round((Date.now() - lastSync) / 60000);
        const alerts = [];

        if (latestMetrics.heartRate && latestMetrics.heartRate.value >= 100) {
            alerts.push({
                key: 'heart_rate',
                severity: 'high',
                title: '心率升高',
                message: `最新心率 ${latestMetrics.heartRate.value} bpm，建议先安静休息并关注是否持续。`,
            });
        }

        if (latestMetrics.bloodOxygen && latestMetrics.bloodOxygen.value <= 94) {
            alerts.push({
                key: 'blood_oxygen',
                severity: 'high',
                title: '血氧偏低',
                message: `最新血氧 ${latestMetrics.bloodOxygen.value}% ，建议尽快复测并关注呼吸状态。`,
            });
        }

        if (latestMetrics.sleep && latestMetrics.sleep.durationHours < 6) {
            alerts.push({
                key: 'sleep',
                severity: 'medium',
                title: '睡眠下降',
                message: `昨夜睡眠 ${latestMetrics.sleep.durationHours} 小时，夜醒 ${latestMetrics.sleep.wakeCount} 次，今日陪伴应更温和。`,
            });
        }

        if (latestMetrics.stillDuration && latestMetrics.stillDuration.minutes >= 240) {
            alerts.push({
                key: 'still_duration',
                severity: 'high',
                title: '静止时长过长',
                message: `今日已连续累计静止 ${latestMetrics.stillDuration.minutes} 分钟，建议提醒起身走动或做轻活动。`,
            });
        } else if (latestMetrics.stillDuration && latestMetrics.stillDuration.minutes >= 120) {
            alerts.push({
                key: 'still_duration',
                severity: 'medium',
                title: '静止时长偏高',
                message: `今日静止时长 ${latestMetrics.stillDuration.minutes} 分钟，建议保持轻提醒，鼓励起身活动。`,
            });
        }

        if (latestMetrics.stress && latestMetrics.stress.value >= 80) {
            alerts.push({
                key: 'stress',
                severity: 'high',
                title: '压力值升高',
                message: `当前压力值 ${latestMetrics.stress.value} 分，建议降低交流压迫感，先稳定节奏。`,
            });
        } else if (latestMetrics.stress && latestMetrics.stress.value >= 60) {
            alerts.push({
                key: 'stress',
                severity: 'medium',
                title: '压力值偏高',
                message: `当前压力值 ${latestMetrics.stress.value} 分，建议以更轻柔的方式陪伴。`,
            });
        }

        if (latestMetrics.bloodSugar && isBloodSugarWatch(latestMetrics.bloodSugar)) {
            alerts.push({
                key: 'blood_sugar',
                severity: 'medium',
                title: '血糖波动提醒',
                message: `${getBloodSugarPeriodLabel(latestMetrics.bloodSugar.period)}血糖 ${latestMetrics.bloodSugar.value} ${latestMetrics.bloodSugar.unit}，当前仅做趋势提醒，可稍后复测确认。`,
            });
        }

        if (health.device?.wearStatus !== 'worn' || health.device?.isWorn === false) {
            alerts.push({
                key: 'wear_status',
                severity: 'medium',
                title: '设备未佩戴',
                message: '当前设备显示未佩戴，步数、心率与安全监测可能不连续，建议先确认佩戴状态。',
            });
        }

        if (battery <= 20) {
            alerts.push({
                key: 'battery',
                severity: 'medium',
                title: '设备低电',
                message: `当前电量 ${battery}% ，建议尽快补电，避免守护中断。`,
            });
        }

        if (!health.device?.connected || minutesSinceSync > 45) {
            alerts.push({
                key: 'sync',
                severity: 'medium',
                title: '同步异常',
                message: `设备最近 ${minutesSinceSync} 分钟未同步，需要留意连接状态。`,
            });
        }

        return alerts;
    }

    buildCards(health, latestMetrics = this.buildLatestMetrics(health)) {
        const bloodSugarLabel = latestMetrics.bloodSugar
            ? `${getBloodSugarPeriodLabel(latestMetrics.bloodSugar.period)}采样`
            : '暂无数据';

        return [
            {
                key: 'heartRate',
                label: METRIC_CONFIG.heartRate.label,
                displayValue: latestMetrics.heartRate ? `${latestMetrics.heartRate.value} ${METRIC_CONFIG.heartRate.unit}` : '--',
                status: latestMetrics.heartRate && latestMetrics.heartRate.value >= 100 ? 'danger' : 'ok',
                deltaLabel: latestMetrics.heartRate && latestMetrics.heartRate.value >= 90 ? '较平时偏高' : '整体平稳',
            },
            {
                key: 'bloodOxygen',
                label: METRIC_CONFIG.bloodOxygen.label,
                displayValue: latestMetrics.bloodOxygen ? `${latestMetrics.bloodOxygen.value}${METRIC_CONFIG.bloodOxygen.unit}` : '--',
                status: latestMetrics.bloodOxygen && latestMetrics.bloodOxygen.value <= 94 ? 'danger' : 'ok',
                deltaLabel: latestMetrics.bloodOxygen && latestMetrics.bloodOxygen.value <= 95 ? '建议复测' : '处于舒适区间',
            },
            {
                key: 'sleep',
                label: METRIC_CONFIG.sleep.label,
                displayValue: latestMetrics.sleep ? `${latestMetrics.sleep.durationHours}${METRIC_CONFIG.sleep.unit}` : '--',
                status: latestMetrics.sleep && latestMetrics.sleep.durationHours < 6 ? 'watch' : 'ok',
                deltaLabel: latestMetrics.sleep ? `夜醒 ${latestMetrics.sleep.wakeCount} 次` : '暂无数据',
            },
            {
                key: 'activity',
                label: METRIC_CONFIG.activity.label,
                displayValue: latestMetrics.activity ? `${latestMetrics.activity.steps}${METRIC_CONFIG.activity.unit}` : '--',
                status: latestMetrics.activity && latestMetrics.activity.steps < 3000 ? 'watch' : 'ok',
                deltaLabel: latestMetrics.activity ? `${latestMetrics.activity.activeMinutes} 分钟活动` : '暂无数据',
            },
            {
                key: 'stillDuration',
                label: METRIC_CONFIG.stillDuration.label,
                displayValue: latestMetrics.stillDuration ? `${latestMetrics.stillDuration.minutes}${METRIC_CONFIG.stillDuration.unit}` : '--',
                status: latestMetrics.stillDuration && latestMetrics.stillDuration.minutes >= 240
                    ? 'danger'
                    : latestMetrics.stillDuration && latestMetrics.stillDuration.minutes >= 120
                        ? 'watch'
                        : 'ok',
                deltaLabel: latestMetrics.stillDuration && latestMetrics.stillDuration.minutes >= 240
                    ? '久静风险已抬头'
                    : latestMetrics.stillDuration && latestMetrics.stillDuration.minutes >= 120
                        ? '建议提醒起身'
                        : '活动节奏正常',
            },
            {
                key: 'stress',
                label: METRIC_CONFIG.stress.label,
                displayValue: latestMetrics.stress ? `${latestMetrics.stress.value}${METRIC_CONFIG.stress.unit}` : '--',
                status: latestMetrics.stress && latestMetrics.stress.value >= 80
                    ? 'danger'
                    : latestMetrics.stress && latestMetrics.stress.value >= 60
                        ? 'watch'
                        : 'ok',
                deltaLabel: latestMetrics.stress && latestMetrics.stress.value >= 80
                    ? '建议降低陪伴压迫感'
                    : latestMetrics.stress && latestMetrics.stress.value >= 60
                        ? '稍有紧张趋势'
                        : '压力平稳',
            },
            {
                key: 'bloodPressure',
                label: METRIC_CONFIG.bloodPressure.label,
                displayValue: latestMetrics.bloodPressure ? `${latestMetrics.bloodPressure.systolic}/${latestMetrics.bloodPressure.diastolic}` : '--',
                status: latestMetrics.bloodPressure && latestMetrics.bloodPressure.systolic >= 140 ? 'watch' : 'ok',
                deltaLabel: latestMetrics.bloodPressure && latestMetrics.bloodPressure.systolic >= 135 ? '收缩压偏高' : '波动可接受',
            },
            {
                key: 'bloodSugar',
                label: METRIC_CONFIG.bloodSugar.label,
                displayValue: latestMetrics.bloodSugar ? `${latestMetrics.bloodSugar.value} ${latestMetrics.bloodSugar.unit}` : '--',
                status: latestMetrics.bloodSugar && isBloodSugarWatch(latestMetrics.bloodSugar) ? 'watch' : 'ok',
                deltaLabel: bloodSugarLabel,
            },
        ];
    }

    determineRiskLevel(alerts) {
        if (alerts.some((item) => item.severity === 'high')) return 'high';
        if (alerts.length > 0) return 'medium';
        return 'low';
    }

    async getHealthOverview() {
        const health = await this.getHealthData();
        const latestMetrics = this.buildLatestMetrics(health);
        const alerts = this.computeAlerts(health, latestMetrics);

        return {
            updatedAt: health.updatedAt,
            device: health.device,
            latestMetrics,
            cards: this.buildCards(health, latestMetrics),
            alerts,
            riskLevel: this.determineRiskLevel(alerts),
        };
    }
}

module.exports = HealthMonitorService;
