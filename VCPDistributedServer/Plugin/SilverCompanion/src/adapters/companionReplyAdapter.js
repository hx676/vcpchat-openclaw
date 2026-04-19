function buildConcernTone(healthState, emotionState, safeCircleState) {
    if (healthState.riskLevel === 'high') return '需要多一点守护感';
    if (emotionState.riskLevel === 'medium') return '偏温柔安抚';
    if (safeCircleState.warningCount > 0) return '提醒里带一点陪伴';
    return '自然陪伴';
}

function createCompanionReply(payload) {
    const {
        userText,
        profile,
        healthState,
        emotionState,
        safeCircleState,
        familySummary,
        proactive = false,
    } = payload;

    const tone = buildConcernTone(healthState, emotionState, safeCircleState);
    const name = profile.name || '您';
    const latestSleep = healthState.cards.find((item) => item.key === 'sleep');
    const latestHeartRate = healthState.cards.find((item) => item.key === 'heartRate');
    const familiarSignal = emotionState.signals.find((item) => item.key === 'familiarInteraction');
    const lowerText = String(userText || '').trim();

    if (proactive) {
        return `${name}，我来和您打个招呼。今天整体状态${healthState.riskLevel === 'low' ? '还算平稳' : '有一点需要留心'}，如果您愿意，我们可以聊聊今天过得怎么样，我也会顺手帮您看着睡眠和互动变化。`;
    }

    const mentionsTired = /困|累|乏|没精神|疲惫/.test(lowerText);
    const mentionsPain = /疼|酸|不舒服|闷|头晕|难受/.test(lowerText);
    const mentionsFamily = /女儿|儿子|孩子|家里|家人/.test(lowerText);
    const mentionsNothing = /没事|还好|挺好|不用担心/.test(lowerText);

    const fragments = [];

    if (mentionsPain || healthState.riskLevel === 'high') {
        fragments.push(`我先陪您把这件事放在前面看一眼。现在心率大约在 ${latestHeartRate ? latestHeartRate.displayValue : '当前区间'}，如果不舒服是持续的，我们就先别硬撑。`);
    } else if (mentionsTired || latestSleep?.status === 'watch') {
        fragments.push('我听出来您有点累，先不用急着把自己撑得很精神。最近睡眠趋势有一点回落，今天更适合慢一点。');
    } else {
        fragments.push('我在认真听您说。您现在跟我讲出来，本身就已经很重要了。');
    }

    if (mentionsNothing && emotionState.riskLevel !== 'low') {
        fragments.push('如果您嘴上说“没事”，但其实不太想多讲，也没关系。我会把这种变化记下来，用更温和的方式陪着您。');
    }

    if (mentionsFamily) {
        fragments.push('要是您愿意，我也可以帮您把今天的状态整理成一句更轻松的话，等家里人联系时更容易开口。');
    } else if (familiarSignal && familiarSignal.status !== 'ok') {
        fragments.push('今天和熟人圈的互动比平时少一点，晚上如果您想，我可以提醒您和熟悉的人打个招呼。');
    }

    fragments.push(`我这边会继续用“${tone}”的方式陪着您，也会把关键变化整理进家属摘要里：${familySummary.headline}`);

    return fragments.join('');
}

module.exports = {
    createCompanionReply,
};
