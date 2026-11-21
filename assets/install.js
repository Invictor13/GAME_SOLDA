'use strict';

if ('serviceWorker' in navigator && ['https:', 'http:'].includes(location.protocol)) {
    let previousController = navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        const controller = navigator.serviceWorker.controller;
        if (previousController && controller && controller !== previousController) {
            document.getElementById('update-notice').hidden = false;
        }
        previousController = controller;
    });
    document.getElementById('update-reload').addEventListener('click', () => location.reload());
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(error => console.warn('Cache offline indisponível.', error));
    });
}
