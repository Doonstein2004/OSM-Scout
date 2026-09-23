// This Service Worker is intentionally inert. Three rounds of caching bugs
// (a stale app shell requesting JS chunks that no longer exist after a
// deploy, a custom navigation handler that could itself fail, an unhandled
// rejection on a failed asset fetch) showed that hand-rolled caching here
// buys little for a data-driven app that needs the network anyway, and
// keeps finding new ways to break the first load.
//
// hooks/useServiceWorker.ts actively unregisters any Service Worker on
// load, so in practice this file stops running shortly after a page loads
// it. It's kept minimal (no fetch handler at all — every request just goes
// to the network like there was no Service Worker there) as a safety net
// for the moment before that unregister call completes, and for any
// leftover reference to '/sw.js' that might still exist somewhere.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
  );
  self.clients.claim();
});
