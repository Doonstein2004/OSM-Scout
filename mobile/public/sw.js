// Bump this on every meaningful change to this file's caching behavior —
// it's what makes the activate handler below actually clear out whatever
// got stuck in a visitor's browser from the previous version.
const CACHE_NAME = 'osm-scout-v2';
const RUNTIME_CACHE = 'osm-runtime-v2';

self.addEventListener('install', (event) => {
  // No precaching of '/' here on purpose — see the fetch handler: HTML
  // navigations are always network-first, so there is nothing worth
  // precaching that wouldn't just go stale between deploys.
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

  // Skip cross-origin requests (Stripe, RevenueCat, etc.)
  if (url.origin !== location.origin || url.hostname.includes('revenuecat.com') || url.hostname.includes('stripe.com')) return;

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase')) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // The app shell (HTML) must never be served stale: a cached index.html
  // references content-hashed JS chunk filenames from whatever build was
  // current when it was cached. Once a new version deploys, those old
  // chunks are gone from the server — requesting one gets Vercel's SPA
  // fallback (the *new* index.html, HTML not JS) instead of a 404, and the
  // browser chokes on it with "Unexpected token '<'" trying to run it as a
  // script. Always going to the network for navigations means the HTML a
  // visitor gets always matches the chunks that actually exist right now.
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Everything else (content-hashed JS/CSS/image assets) is safe to cache
  // aggressively — a given hashed URL's content never changes, so a stale
  // cache entry for it isn't actually stale.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          return new Response(JSON.stringify({ error: 'offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        });
    })
  );
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const clone = response.clone();
      caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
    }
    return response;
  } catch (e) {
    // Only reachable offline — the last successfully cached shell beats
    // nothing at all.
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);

  const fetchedPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        const clone = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => {
          cache.put(request, clone);
        });
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }

  const response = await fetchedPromise;
  if (response) return response;

  return new Response(JSON.stringify({ error: 'offline' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  });
}
