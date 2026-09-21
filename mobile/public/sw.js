// Bump this on every meaningful change to this file's caching behavior —
// it's what makes the activate handler below actually clear out whatever
// got stuck in a visitor's browser from the previous version.
const CACHE_NAME = 'osm-scout-v3';
const RUNTIME_CACHE = 'osm-runtime-v3';

self.addEventListener('install', (event) => {
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

  // Full browser navigations (typing the URL, a hard reload) are left
  // completely alone — no event.respondWith() at all — instead of routed
  // through our own fetch+cache logic. A cached index.html references
  // content-hashed JS chunk filenames from whatever build was current when
  // it was cached; once a new version deploys those old chunks are gone
  // from the server, so serving that stale HTML sends the browser off to
  // request files that no longer exist. Letting the browser's own default
  // network fetch handle navigations means it always gets the HTML that
  // matches whatever chunks are actually live right now, full stop — no
  // custom logic in the loop that could itself become a new failure mode.
  if (event.request.mode === 'navigate') return;

  // Content-hashed JS/CSS/image chunks are safe to cache aggressively — a
  // given hashed URL's content never changes. But a lazily-imported route
  // chunk (e.g. the Smart tab's bundle) is fetched by the app's own module
  // loader, not typed by a user, so a failure here has to surface as a real
  // network error — synthesizing a "success" response (even a 503 one) for
  // a failed fetch turns a transient network hiccup into a module the
  // loader thinks it received and can't actually parse, which is worse
  // than just letting the fetch fail and letting the loader's own retry
  // logic (or the next reload) handle it.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});

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
