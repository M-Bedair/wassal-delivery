const CACHE_NAME = 'wassal-app-shell-v2';
const APP_SHELL = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './firebase-config.js',
    './manifest.webmanifest',
    './logo.PNG',
    './logo-light.PNG',
    './login-background.jpg',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png',
    './icons/apple-touch-icon.png'
];
const SHELL_URLS = new Set(APP_SHELL.map(path => new URL(path, self.location).href));
const INDEX_URL = new URL('./index.html', self.location).href;

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL.map(path => new Request(path, { cache: 'reload' }))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys
                .filter(key => key.startsWith('wassal-app-shell-') && key !== CACHE_NAME)
                .map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith(
            (async () => {
                try {
                    const response = await fetch(request);
                    if (response.ok && SHELL_URLS.has(request.url)) {
                        const cache = await caches.open(CACHE_NAME);
                        await cache.put(request, response.clone());
                    }
                    return response;
                } catch {
                    return (await caches.match(request)) || (await caches.match(INDEX_URL));
                }
            })()
        );
        return;
    }

    if (SHELL_URLS.has(request.url)) {
        event.respondWith(
            (async () => {
                const cache = await caches.open(CACHE_NAME);
                try {
                    const response = await fetch(request);
                    if (response.ok) await cache.put(request, response.clone());
                    return response;
                } catch (error) {
                    const cached = await cache.match(request);
                    if (cached) return cached;
                    throw error;
                }
            })()
        );
    }
});
