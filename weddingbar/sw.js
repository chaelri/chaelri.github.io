// =======================================================
// AUTO VERSIONING — cache busts on every new deployment
// =======================================================
const SW_VERSION = `v${Date.now()}`;
const CACHE_NAME = `weddingbar-${SW_VERSION}`;

// Files to cache
const FILES_TO_CACHE = [
  "index.html",
  "style.css",
  "script.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

// =======================================================
// INSTALL — cache everything fresh
// =======================================================
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// =======================================================
// ACTIVATE — delete ALL old caches
// =======================================================
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// =======================================================
// FETCH — network first, fallback to cache
// Prevents stale manifest/icons
// =======================================================
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
