'use strict';

const cacheName = 'welding-master-v16';
const shell = [
    './', './manifest.webmanifest', './assets/icon-192.png', './assets/icon-512.png',
    './assets/interface.css', './assets/arcade.css', './assets/three.min.js',
    './assets/surface.js', './assets/delivery.js', './assets/workshop.js', './assets/performance.js', './assets/campaign.js', './assets/mobile-controls.js', './assets/mobile-camera.js', './assets/arcade.js', './assets/install.js'
].map(path => new URL(path, self.registration.scope).href);

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(cacheName);
        await cache.addAll(shell.map(url => new Request(url, { cache: 'reload' })));
        // Activate the complete release even if an old installed tab remains open.
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        for (const key of await caches.keys()) {
            if (key.startsWith('welding-master-') && key !== cacheName) await caches.delete(key);
        }
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    const navigation = event.request.mode === 'navigate' && event.request.url.startsWith(self.registration.scope);
    if (!navigation && !shell.includes(event.request.url)) return;
    event.respondWith((async () => {
        const cache = await caches.open(cacheName);
        // Cada aba recebe o conjunto de arquivos da mesma versão enquanto este worker a controla.
        const saved = await cache.match(navigation ? shell[0] : event.request);
        if (saved) return saved;
        return fetch(event.request);
    })());
});
