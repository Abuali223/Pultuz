/* Ali Biznes - safer SW (FIXED7)
   - Network-first for navigations (prevents stale UI after deploy)
   - Cache assets for faster repeat loads
*/
const CACHE_NAME = 'ali-biznes-cache-fixed7';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Always network-first for page navigations so new deploy appears immediately
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  // assets: stale-while-revalidate
  if (url.pathname.startsWith('/assets/') || /\.(js|css|png|jpg|jpeg|webp|svg|woff2?)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((resp) => {
            if (resp && resp.status === 200) {
              const copy = resp.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
            }
            return resp;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }
});
