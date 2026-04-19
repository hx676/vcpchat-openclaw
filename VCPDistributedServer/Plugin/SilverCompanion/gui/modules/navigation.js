(function () {
    'use strict';

    function renderNavigation(activeSection) {
        document.querySelectorAll('.section-tab').forEach((button) => {
            button.classList.toggle('active', button.dataset.section === activeSection);
        });

        document.querySelectorAll('.content-panel').forEach((panel) => {
            panel.classList.toggle('active', panel.id === `section-${activeSection}`);
        });
    }

    window.SilverCompanionApp = window.SilverCompanionApp || {};
    window.SilverCompanionApp.navigation = {
        renderNavigation,
    };
})();
