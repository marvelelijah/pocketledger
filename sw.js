// Network-first so updates arrive; falls back to cache when offline.
const CACHE = 'pocketledger-v22';
const ASSETS = ['./', './index.html', './style.css', './data.js', './app.js', './lock.js', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // only cache this app's own files and its fonts; never bank data or Plaid
  const host = new URL(e.request.url).hostname;
  if (host !== location.hostname && host !== 'fonts.googleapis.com' && host !== 'fonts.gstatic.com') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
