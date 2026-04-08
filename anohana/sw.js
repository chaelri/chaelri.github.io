const CACHE_NAME = "anohana-v3";
const ASSETS = [
  "/anohana/",
  "/anohana/index.html",
  "/anohana/app.js",
  "/anohana/icon-192.png",
  "/anohana/icon-512.png",
  "/anohana/cover.jpg",
  "/anohana/favicon.png",
  "/anohana/manifest.json",
];

// Install — cache everything immediately, skip waiting
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

// Activate — nuke all old caches, claim all clients immediately
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch — cache-first for same-origin, stale-while-revalidate to keep fresh
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Let Google Drive iframes pass through — don't cache
  if (url.origin !== location.origin) {
    return;
  }

  e.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(e.request).then((cached) => {
        // Always fetch in background to update cache
        const fetchPromise = fetch(e.request).then((response) => {
          if (response && response.status === 200) {
            cache.put(e.request, response.clone());
          }
          return response;
        }).catch(() => cached);

        // Return cached immediately, update in background
        return cached || fetchPromise;
      })
    )
  );
});
