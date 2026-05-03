// sw.js — minimal service worker so the PWA installs nicely.
// Network-first for HTML, cache-fallback for static assets, never cache app.js (always fresh).

const DEPLOYMENT_ID = "v1.0.0-" + Date.now();
const CACHE_NAME = "work-brief-" + DEPLOYMENT_ID;
const CORE = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.json",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(CORE.map((url) => new Request(url, { cache: "no-store" })))
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Always-fresh: app.js (changes most often)
  if (url.pathname.endsWith("/app.js") || req.mode === "navigate") {
    event.respondWith(
      fetch(req, { cache: "no-store" }).catch(() => caches.match(req))
    );
    return;
  }

  // Network-first for static assets, fall back to cache offline
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});
