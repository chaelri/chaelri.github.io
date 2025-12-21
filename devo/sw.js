// sw.js — automatic cache management (NO manual versioning needed)

const CACHE_NAME = "dudu-devotion";

// Core app shell files
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./bible-meta.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// Install: cache core assets and activate immediately
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
});

// Activate: clean up old caches automatically
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : null))
        )
      )
  );
  self.clients.claim();
});

// Fetch strategy:
// - HTML/navigation → network-first (always get latest)
// - Static assets → cache-first (fast, offline-ready)
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Always try network first for page navigations
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first for everything else (CSS, JS, icons, etc.)
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
    )
  );
});
