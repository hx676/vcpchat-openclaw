const { EMPTY_ANALYZER_RESULT } = require('../types/agentContracts');

class AnalyzerPolicyService {
    normalizeDirective(rawResult, contextPacket) {
        const merged = {
            ...EMPTY_ANALYZER_RESULT,
            ...(rawResult || {}),
        };

        merged.family_key_events = Array.isArray(merged.family_key_events) ? merged.family_key_events : [];
        merged.family_actions = Array.isArray(merged.family_actions) ? merged.family_actions : [];
        merged.forbidden_phrases = Array.isArray(merged.forbidden_phrases) ? merged.forbidden_phrases : [];
        merged.allowed_focus_topics = Array.isArray(merged.allowed_focus_topics) ? merged.allowed_focus_topics : [];
        merged.must_avoid_topics = Array.isArray(merged.must_avoid_topics) ? merged.must_avoid_topics : [];
        merged.memory_tags = Array.isArray(merged.memory_tags) ? merged.memory_tags : [];
        merged.analysis_memory_tags = Array.isArray(merged.analysis_memory_tags) ? merged.analysis_memory_tags : [];
        merged.profile_updates = this.normalizeProfileUpdates(merged.profile_updates);
        merged.memory_should_write = merged.memory_should_write === true;
        merged.analysis_memory_should_write = merged.analysis_memory_should_write === true;
        merged.handoff_required = merged.handoff_required === true;

        if (!['low', 'medium', 'high'].includes(merged.emotion_risk_level)) {
            merged.emotion_risk_level = 'medium';
        }
        if (!['low', 'medium', 'high'].includes(merged.memory_priority)) {
            merged.memory_priority = 'medium';
        }
        if (!['low', 'medium', 'high'].includes(merged.analysis_memory_priority)) {
            merged.analysis_memory_priority = 'medium';
        }
        if (!['health_trend', 'emotion_trend', 'sleep_pattern', 'safe_circle_risk', 'device_reliability', 'compound_risk'].includes(merged.analysis_memory_category)) {
            merged.analysis_memory_category = 'health_trend';
        }

        const localRisk = this.deriveLocalRisk(contextPacket);
        if (localRisk === 'high') {
            merged.emotion_risk_level = 'high';
            merged.handoff_required = true;
            merged.handoff_reason = merged.handoff_reason || '健康或平安圈出现高优先级风险，需要优先安全与转介。';
        } else if (localRisk === 'medium' && merged.emotion_risk_level === 'low') {
            merged.emotion_risk_level = 'medium';
        }

        return this.applyCompanionPolicy(merged);
    }

    deriveLocalRisk(contextPacket) {
        const healthRisk = contextPacket?.health?.riskLevel || 'low';
        const safeWarnings = Number(contextPacket?.safeCircle?.warningCount || 0);

        if (healthRisk === 'high') return 'high';
        if (healthRisk === 'medium' || safeWarnings > 0) return 'medium';
        return 'low';
    }

    applyCompanionPolicy(directive) {
        const next = { ...directive };

        if (next.emotion_risk_level === 'high') {
            next.companion_mode = 'protective_escalation';
            next.tone_rule = next.tone_rule || '简短、稳住、确认现实状态，优先安全与转介。';
            next.reply_goal = next.reply_goal || '先降低风险，再决定是否继续深入交流。';
            next.handoff_required = true;
            next.forbidden_phrases = mergeUnique(next.forbidden_phrases, [
                '你别想太多',
                '这没什么',
                '你就是太敏感了',
                '肯定不会有事',
            ]);
            next.allowed_focus_topics = mergeUnique(next.allowed_focus_topics, [
                '当前感受',
                '是否有人在身边',
                '是否需要联系家属',
                '线下支持',
            ]);
            next.must_avoid_topics = mergeUnique(next.must_avoid_topics, [
                '否定风险',
                '玩笑化风险',
                '长篇闲聊转移',
            ]);
            return next;
        }

        if (next.emotion_risk_level === 'medium') {
            next.companion_mode = 'supportive_guarded';
            next.tone_rule = next.tone_rule || '更轻柔、更接住，不连续追问，不下结论。';
            next.reply_goal = next.reply_goal || '先稳住情绪与关系感，再轻量引导表达。';
            next.forbidden_phrases = mergeUnique(next.forbidden_phrases, [
                '你别想太多',
                '这没什么',
            ]);
            next.allowed_focus_topics = mergeUnique(next.allowed_focus_topics, [
                '当下感受',
                '休息安排',
                '轻量熟人联系',
            ]);
            next.must_avoid_topics = mergeUnique(next.must_avoid_topics, [
                '连续追问家庭压力',
                '直接否定情绪',
            ]);
            return next;
        }

        next.companion_mode = 'natural_companion';
        next.tone_rule = next.tone_rule || '自然、温和、有在场感。';
        next.reply_goal = next.reply_goal || '保持陪伴关系和自然聊天延续。';
        return next;
    }

    normalizeProfileUpdates(rawProfileUpdates) {
        const source = rawProfileUpdates && typeof rawProfileUpdates === 'object' && !Array.isArray(rawProfileUpdates)
            ? rawProfileUpdates
            : {};

        const trimString = (value) => String(value || '').trim();
        const toArray = (value) => Array.isArray(value)
            ? value.map((item) => trimString(item)).filter(Boolean)
            : [];

        const ageValue = source.age;
        const normalizedAge = Number.isFinite(Number(ageValue)) && Number(ageValue) > 0
            ? Number(ageValue)
            : null;

        return {
            name: trimString(source.name),
            age: normalizedAge,
            gender: trimString(source.gender),
            city: trimString(source.city),
            relationshipRole: trimString(source.relationshipRole),
            motto: trimString(source.motto),
            preferences: toArray(source.preferences),
            family: toArray(source.family),
            tags: toArray(source.tags),
        };
    }
}

function mergeUnique(base, additions) {
    const set = new Set([...(base || []), ...(additions || [])].filter(Boolean));
    return Array.from(set);
}

module.exports = AnalyzerPolicyService;
