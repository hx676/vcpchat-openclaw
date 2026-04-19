const BaseChatMode = require('./baseChatMode');

class SilverCompanionManagedMode extends BaseChatMode {
    constructor() {
        super('silver_companion_managed');
    }

    determineSpeakers() {
        return [];
    }
}

module.exports = new SilverCompanionManagedMode();
