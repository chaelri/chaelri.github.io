// Very small service worker: caches static assets for offline PWA behavior.
const CACHE = "weddingbar-static-v1";
const FILES = [
  "/",
  "/weddingbar/", // ensure root path is covered by GitHub Pages routing
  "/weddingbar/index.html",
  "/weddingbar/style.css",
  "/weddingbar/script.js",
  "/weddingbar/manifest.json",
  // add icons if you host them locally e.g. '/weddingbar/icons/icon-192.png'
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

  // For static assets — cache-first
  if (
    FILES.includes(url.pathname) ||
    url.pathname.startsWith("/weddingbar/icons")
  ) {
    event.respondWith(
      caches.match(event.request).then((resp) => resp || fetch(event.request))
    );
    return;
  }

  // For other requests (like Firestore network calls) — use network first
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
