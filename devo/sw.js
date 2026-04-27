// sw.js — AGGRESSIVE cache refresh on new deployments (GitHub-safe)

const DEPLOYMENT_ID = "v1.2.0-" + Date.now(); // Date.now() ensures a new cache on every SW update
const CACHE_NAME = "dudu-devotion-" + DEPLOYMENT_ID;

// Core app shell files (always refreshed). script.js was split into ordered
// chunks under js/; firebase-sync.js dynamically injects them in order.
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./config.js",
  "./firebase-sync.js",
  "./bible-meta.js",
  "./manifest.json",
  "./js/01-core.js",
  "./js/02-data.js",
  "./js/03-tts.js",
  "./js/04-passage.js",
  "./js/05-render-init.js",
  "./js/06-notes.js",
  "./js/07-immersive.js",
  "./js/08-story.js",
  "./js/09-soap.js",
  "./js/10-creator-canvas.js",
  "./js/11-boot.js",
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

      // ⚠️ We removed the infinite reload loop.
      // Since we use a "Network First" strategy below, your changes are ALWAYS enforced
      // for online users without needing to force a page reload.
    })()
  );
});

// PUSH NOTIFICATIONS
self.addEventListener("push", (event) => {
  let data = { title: "Devotion", body: "Time to spend with the Lord today." };
  try { data = event.data.json(); } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || "Devotion", {
      body: data.body,
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      data: { url: self.registration.scope },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "./";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      const existing = clients.find((c) => c.url.includes("devo"));
      if (existing) { existing.focus(); return; }
      return self.clients.openWindow(url);
    })
  );
});

// FETCH STRATEGY (VERY AGGRESSIVE):
// - HTML → NETWORK ONLY (never trust cache)
// - Everything else → NETWORK FIRST + overwrite cache
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle GET requests (Cache API doesn't support POST/PUT/etc.)
  if (req.method !== "GET") return;

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
