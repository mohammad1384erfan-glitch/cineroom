// Simple service worker for CineRoom PWA
const CACHE_NAME = 'cineroom-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Security: NEVER cache sync room states, passwords, or signaling channels!
  if (
    url.pathname.includes('/api/') || 
    url.pathname.includes('/realtime') ||
    url.pathname.includes('/signaling') ||
    url.pathname.includes('/cineroom_')
  ) {
    return event.respondWith(fetch(event.request));
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        if (
          event.request.method === 'GET' &&
          response.status === 200 &&
          (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.png') || url.pathname.endsWith('.svg') || url.pathname.endsWith('.woff2'))
        ) {
          const cacheCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, cacheCopy);
          });
        }
        return response;
      });
    })
  );
});
