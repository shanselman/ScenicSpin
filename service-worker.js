// Bump shellVersion whenever the app shell assets change. The ?v= query below
// must stay in sync with the matching references in index.html so the new shell
// is fetched and the previous cache (keyed by version) is cleaned on activate.
const shellVersion = '{{SHELL_VERSION}}';
const cacheName = `{{CACHE_NAME}}-v${shellVersion}`;
const shellAssets = [
  './',
  './index.html',
  `./src/app.js?v=${shellVersion}`,
  `./src/styles.css?v=${shellVersion}`,
  './manifest.webmanifest',
  './routes/catalog.json',
  './routes/candidate-backlog.json',
  './icons/favicon.svg',
  './icons/app-icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(shellAssets)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== cacheName).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  if (
    requestUrl.origin !== self.location.origin ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(cacheName).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        })
      )
  );
});
