class SafeCircleService {
    constructor({ store }) {
        this.store = store;
    }

    async getSafeCircleData() {
        return this.store.readFile('safeCircle');
    }

    computeWarnings(safeCircle) {
        const warnings = [];
        const lastCheckInAt = safeCircle.lastCheckInAt ? Date.parse(safeCircle.lastCheckInAt) : Date.now();
        const hoursSinceCheckIn = Math.round((Date.now() - lastCheckInAt) / 3600000);

        if (hoursSinceCheckIn >= 18) {
            warnings.push({
                key: 'checkin_delay',
                severity: 'medium',
                title: '报平安延迟',
                message: `距离最近一次报平安已过去 ${hoursSinceCheckIn} 小时，可以用轻问候方式提醒。`,
            });
        }

        safeCircle.contacts.forEach((contact) => {
            const lastInteractionAt = contact.lastInteractionAt ? Date.parse(contact.lastInteractionAt) : Date.now();
            const hoursSinceInteraction = Math.round((Date.now() - lastInteractionAt) / 3600000);
            if (hoursSinceInteraction >= 36) {
                warnings.push({
                    key: `contact_${contact.id}`,
                    severity: 'low',
                    title: `${contact.name} 互动减少`,
                    message: `与${contact.relation}最近 ${hoursSinceInteraction} 小时未互动，建议观察是否只是生活节奏变化。`,
                });
            }
        });

        return warnings;
    }

    async getSafeCircleOverview() {
        const safeCircle = await this.getSafeCircleData();
        const warnings = this.computeWarnings(safeCircle);

        return {
            updatedAt: safeCircle.updatedAt,
            lastCheckInAt: safeCircle.lastCheckInAt,
            checkInLabel: safeCircle.checkInLabel,
            contacts: safeCircle.contacts,
            warnings,
            warningCount: warnings.length,
        };
    }
}

module.exports = SafeCircleService;
