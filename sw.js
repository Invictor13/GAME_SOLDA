'use strict';

const cacheName = 'welding-master-v3';
const shell = [
    './', './index.html', './manifest.webmanifest', './assets/icon-192.png', './assets/icon-512.png',
    './assets/interface.css', './assets/arcade.css', './assets/three.min.js',
    './assets/workshop.js', './assets/campaign.js', './assets/arcade.js', './assets/install.js'
].map(path => new URL(path, self.registration.scope).href);

self.addEventListener('install', event => {
    event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(shell)));
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
        try {
            const response = await fetch(event.request);
            if (response.ok && shell.includes(event.request.url)) await cache.put(event.request, response.clone());
            return response;
        } catch (error) {
            const saved = await cache.match(event.request) || (navigation && await cache.match(shell[1]));
            if (saved) return saved;
            throw error;
        }
    })());
});
