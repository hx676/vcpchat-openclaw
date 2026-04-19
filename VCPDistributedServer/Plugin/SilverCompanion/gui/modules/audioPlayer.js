(function () {
    'use strict';

    function stopCurrentAudio(state) {
        if (state.currentAudio) {
            state.currentAudio.pause();
            state.currentAudio.currentTime = 0;
            state.currentAudio = null;
        }
    }

    async function playReplyAudio(audioPayload, state, onStatusChange) {
        if (!audioPayload || audioPayload.success !== true || !audioPayload.audioBase64) {
            onStatusChange('文本回复');
            return;
        }

        stopCurrentAudio(state);
        const audio = new Audio(`data:${audioPayload.mimeType || 'audio/mpeg'};base64,${audioPayload.audioBase64}`);
        state.currentAudio = audio;
        onStatusChange('语音播放中');
        audio.onended = () => {
            state.currentAudio = null;
            onStatusChange(state.isRecording ? '语音录入中' : '文本待机');
        };

        try {
            await audio.play();
        } catch (_error) {
            onStatusChange('语音就绪，等待播放权限');
        }
    }

    window.SilverCompanionApp = window.SilverCompanionApp || {};
    window.SilverCompanionApp.audioPlayer = {
        stopCurrentAudio,
        playReplyAudio,
    };
})();
