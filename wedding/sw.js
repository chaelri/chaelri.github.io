// 🩷 Wedding Bubble Planner - Smart PWA Cache
const CACHE_NAME = "wedding-bubble-" + new Date().toISOString().slice(0, 10);
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./icon-192.png",
  "./icon-512.png",
  "./manifest.json",
];

// ✅ Install: cache app shell
self.addEventListener("install", (event) => {
  console.log("[SW] Installing new cache:", CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting(); // activate immediately
});

// ✅ Activate: remove old caches
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating, cleaning old caches...");
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k.startsWith("wedding-bubble-") && k !== CACHE_NAME)
          .map((k) => {
            console.log("[SW] Deleting old cache:", k);
            return caches.delete(k);
          })
      );
    })
  );
  return self.clients.claim(); // make new SW take control immediately
});

// ✅ Fetch: serve cached files, fallback to network
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request)
          .then((response) => {
            return caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, response.clone());
              return response;
            });
          })
          .catch(() => cached)
      );
    })
  );
});
