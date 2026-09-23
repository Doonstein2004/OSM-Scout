import { useEffect, useState } from 'react';

/**
 * Three rounds of Service Worker bugs in a row (a stale cached app shell
 * requesting JS chunks that no longer exist after a deploy, a custom
 * network-first navigation handler that could itself fail, an unhandled
 * rejection on a failed asset fetch) is a pattern, not bad luck — hand-
 * rolled SW caching for a data-driven app that needs the network anyway
 * buys little and keeps finding new ways to break the first load.
 *
 * Rather than registering (or re-patching) one, this actively unregisters
 * any Service Worker still controlling the page from a previous visit —
 * the only way to get someone who's already stuck with a broken cached
 * one back to a clean, SW-free state. It clears the Cache Storage entries
 * our old sw.js versions created too, since an unregistered worker
 * doesn't reclaim the caches it filled.
 */
export function useServiceWorker() {
  const [registered, setRegistered] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;

    if ('serviceWorker' in navigator) {
      setSupported(true);

      navigator.serviceWorker.getRegistrations()
        .then((registrations) => {
          return Promise.all(registrations.map((r) => r.unregister()));
        })
        .then((results) => {
          if (results.some(Boolean)) {
            console.log('SW unregistered');
          }
          setRegistered(false);
        })
        .catch((err) => {
          console.log('SW unregister failed:', err);
        });

      if (typeof caches !== 'undefined') {
        caches.keys()
          .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
          .catch(() => {});
      }
    }
  }, []);

  return { registered, supported };
}
