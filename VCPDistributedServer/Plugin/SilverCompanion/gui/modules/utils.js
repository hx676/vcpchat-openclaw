(function () {
    'use strict';

    const metricOrder = ['heartRate', 'bloodOxygen', 'sleep', 'activity', 'stillDuration', 'stress', 'bloodPressure', 'bloodSugar'];
    const sectionLabels = {
        home: '首页',
        profile: '基本信息',
        dashboard: '看板',
        mood: '心情',
        health: '健康',
        safeCircle: '平安圈',
    };

    function $(id) {
        return document.getElementById(id);
    }

    function unwrap(result, fallbackMessage) {
        const message = fallbackMessage || '请求失败';
        if (!result || result.success === false) {
            throw new Error(result && result.error ? result.error : message);
        }
        return result.data !== undefined ? result.data : result;
    }

    function setTheme(mode) {
        document.body.classList.toggle('dark-theme', mode === 'dark');
        document.body.classList.toggle('light-theme', mode === 'light');
    }

    function formatTime(value) {
        if (!value) return '--';
        return new Date(value).toLocaleString('zh-CN', { hour12: false });
    }

    function formatRelative(value) {
        if (!value) return '--';
        const diffMs = Date.now() - Date.parse(value);
        const hours = Math.max(0, Math.round(diffMs / 3600000));
        if (hours < 1) return '刚刚';
        if (hours < 24) return `${hours} 小时前`;
        return `${Math.round(hours / 24)} 天前`;
    }

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function listHtml(items, fallback) {
        const values = Array.isArray(items) ? items : [];
        const emptyText = fallback || '暂无数据';
        if (!values.length) {
            return `<li>${escapeHtml(emptyText)}</li>`;
        }
        return values.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    }

    function riskText(level) {
        if (level === 'high') return '高';
        if (level === 'medium') return '中';
        return '低';
    }

    function extractMetricValue(metric, point) {
        if (!point) return 0;
        if (metric === 'bloodPressure') return point.systolic || 0;
        if (metric === 'sleep') return point.durationHours || 0;
        if (metric === 'activity') return point.steps || 0;
        if (metric === 'stillDuration') return point.minutes || 0;
        return point.value || 0;
    }

    function buildSparkline(metric, series) {
        if (!Array.isArray(series) || !series.length) {
            return '<svg class="chart-svg"></svg>';
        }

        const values = series.map((item) => extractMetricValue(metric, item));
        const max = Math.max.apply(null, values);
        const min = Math.min.apply(null, values);
        const span = max - min || 1;

        const points = values.map((value, index) => {
            const x = (index / Math.max(1, values.length - 1)) * 100;
            const y = 64 - (((value - min) / span) * 54);
            return `${x},${y}`;
        }).join(' ');

        return [
            '<svg class="chart-svg" viewBox="0 0 100 74" preserveAspectRatio="none">',
            `<polyline fill="none" stroke="#ff8c6e" stroke-width="2.4" points="${points}"></polyline>`,
            '</svg>',
        ].join('');
    }

    window.SilverCompanionApp = window.SilverCompanionApp || {};
    window.SilverCompanionApp.utils = {
        $,
        metricOrder,
        sectionLabels,
        unwrap,
        setTheme,
        formatTime,
        formatRelative,
        escapeHtml,
        listHtml,
        riskText,
        extractMetricValue,
        buildSparkline,
    };
})();
