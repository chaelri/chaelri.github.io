// sw.js
const CACHE = "weddingbar-static-v1";
const FILES = [
  "/weddingbar/",
  "/weddingbar/index.html",
  "/weddingbar/style.css",
  "/weddingbar/script.js",
  "/weddingbar/manifest.json",
  "/weddingbar/icons/icon-192.png",
  "/weddingbar/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Serve cached static assets first (cache-first strategy)
  if (
    FILES.includes(url.pathname) ||
    url.pathname.startsWith("/weddingbar/icons")
  ) {
    event.respondWith(
      caches.match(event.request).then((resp) => resp || fetch(event.request))
    );
    return;
  }

  // For other requests, try network then fallback to cache
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
