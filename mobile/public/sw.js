const CACHE_VERSION = 'v3';
const CACHE_NAME = `osm-scout-${CACHE_VERSION}`;
const RUNTIME_CACHE = `osm-runtime-${CACHE_VERSION}`;

// Only cache true static assets — never the root HTML.
// The root HTML references hashed JS bundles; caching it causes blank screens
// when new bundles are deployed because the old HTML points to URLs that no
// longer exist. Always fetch HTML fresh so the browser gets the latest entry point.
const STATIC_ASSETS = [
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.origin !== location.origin) return;

  // Never cache HTML documents — always fetch fresh to pick up new JS bundles.
  const isHtml = event.request.headers.get('accept')?.includes('text/html') ||
    url.pathname === '/' || url.pathname.endsWith('.html');
  if (isHtml) return;

  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
