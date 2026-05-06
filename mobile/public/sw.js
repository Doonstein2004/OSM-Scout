const CACHE_NAME = 'osm-scout-v1';
const RUNTIME_CACHE = 'osm-runtime';

const STATIC_ASSETS = [
  '/',
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
  
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase')) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }
  
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request).then((response) => {
        const clone = response.clone();
        if (response.ok) {
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

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const fetched = fetch(request).then((response) => {
    if (response.ok) {
      const clone = response.clone();
      caches.open(RUNTIME_CACHE).then((cache) => {
        cache.put(request, clone);
      });
    }
    return response;
  }).catch(() => null);
  
  return cached || fetched || new Response(JSON.stringify({ error: 'offline' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  });
}