'use strict';

if ('serviceWorker' in navigator && ['https:', 'http:'].includes(location.protocol)) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Cache offline indisponível.', error));
    });
}
