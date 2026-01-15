// This is a minimal Service Worker for basic PWA functionality
const CACHE_NAME = "dudu-bible-v1";
const urlsToCache = [
  "/",
  "/index.html",
  "/manifest.json",
  // Add other static assets, like your final CSS/JS bundles, when built
  // For development, this mainly ensures the index loads offline
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Opened cache");
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Cache hit - return response
      if (response) {
        return response;
      }
      // No cache hit - fetch from network
      return fetch(event.request);
    })
  );
});
