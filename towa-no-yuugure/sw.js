const CACHE_NAME = "towa-v1";
const ASSETS = [
  "/towa-no-yuugure/",
  "/towa-no-yuugure/index.html",
  "/towa-no-yuugure/app.js",
  "/towa-no-yuugure/icon-192.png",
  "/towa-no-yuugure/icon-512.png",
  "/towa-no-yuugure/favicon.png",
  "/towa-no-yuugure/manifest.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(e.request).then((cached) => {
        const fetchPromise = fetch(e.request).then((response) => {
          if (response && response.status === 200) cache.put(e.request, response.clone());
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    )
  );
});
