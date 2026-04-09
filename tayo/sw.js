// sw.js — Aggressive cache refresh (network-first, always fresh on deploy)

const DEPLOYMENT_ID = "v1-" + Date.now();
const CACHE_NAME = "tayo-" + DEPLOYMENT_ID;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

// INSTALL: force new SW immediately + fetch fresh assets
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(
        CORE_ASSETS.map((url) => new Request(url, { cache: "no-store" }))
      );
    })
  );
});

// ACTIVATE: nuke ALL old caches + claim clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// FETCH: network-first, always fresh
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // HTML/navigation — always network
  if (req.mode === "navigate") {
    event.respondWith(fetch(req, { cache: "no-store" }));
    return;
  }

  // Everything else — network-first, cache fallback
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
