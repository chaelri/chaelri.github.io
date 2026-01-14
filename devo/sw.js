// sw.js — AGGRESSIVE cache refresh on new deployments (GitHub-safe)

const DEPLOYMENT_ID = self.registration.scope + "-" + Date.now();
const CACHE_NAME = "dudu-devotion-" + DEPLOYMENT_ID;

// Core app shell files (always refreshed)
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

// ACTIVATE: NUKE all old caches + force clients to reload
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));

      await self.clients.claim();

      // 🔥 FORCE ALL OPEN TABS TO HARD RELOAD
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((client) => {
        client.navigate(client.url);
      });
    })()
  );
});

// FETCH STRATEGY (VERY AGGRESSIVE):
// - HTML → NETWORK ONLY (never trust cache)
// - Everything else → NETWORK FIRST + overwrite cache
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // HTML / navigation — ALWAYS NETWORK
  if (req.mode === "navigate") {
    event.respondWith(fetch(req, { cache: "no-store" }));
    return;
  }

  // Static assets — network-first, overwrite cache
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(req, copy);
        });
        return res;
      })
      .catch(() => caches.match(req))
  );
});
