const path = require('path');

const SettingsManager = require(path.join(__dirname, '..', '..', '..', '..', '..', 'modules', 'utils', 'appSettingsManager'));
const SovitsTTS = require(path.join(__dirname, '..', '..', '..', '..', '..', 'modules', 'SovitsTTS'));
const speechRecognizer = require('../adapters/pluginSpeechRecognizer');

class VoiceBridgeService {
    constructor({ settingsPath }) {
        this.settingsManager = new SettingsManager(settingsPath);
        this.tts = new SovitsTTS(this.settingsManager);
        this.active = false;
    }

    async startVoiceInput(onTranscript) {
        if (this.active) {
            return;
        }

        const settings = await this.settingsManager.readSettings().catch(() => ({}));
        this.active = true;
        try {
            await speechRecognizer.start((text) => {
                if (typeof onTranscript === 'function') {
                    onTranscript(text);
                }
            }, {
                browserPath: settings.speechRecognizerBrowserPath || '',
                recognizerPagePath: settings.speechRecognizerPagePath || 'Voicechatmodules/recognizer.html',
            });
        } catch (error) {
            this.active = false;
            throw error;
        }
    }

    async stopVoiceInput() {
        this.active = false;
        await speechRecognizer.stop();
    }

    async synthesizeReply(text) {
        try {
            const models = await this.tts.getModels(false);
            let voice = null;

            if (Array.isArray(models) && models.length) {
                const firstModel = models[0];
                voice = firstModel?.voice || firstModel?.uri || firstModel?.id || firstModel?.name;
            } else if (models && typeof models === 'object') {
                const firstKey = Object.keys(models)[0];
                voice = firstKey || null;
            }

            if (!voice) {
                return { success: false, reason: 'tts_unavailable' };
            }

            const audioBuffer = await this.tts.textToSpeech(text, voice, 1.0);
            if (!audioBuffer) {
                return { success: false, reason: 'tts_generation_failed' };
            }

            return {
                success: true,
                audioBase64: audioBuffer.toString('base64'),
                mimeType: 'audio/mpeg',
                voice,
            };
        } catch (error) {
            return {
                success: false,
                reason: 'tts_error',
                error: error.message,
            };
        }
    }

    stopReplyAudio() {
        this.tts.stop();
    }

    async cleanup() {
        this.stopReplyAudio();
        await speechRecognizer.shutdown();
        this.active = false;
    }
}

module.exports = VoiceBridgeService;
