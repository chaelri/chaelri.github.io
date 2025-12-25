const CACHE_NAME = "budu-diet-v1";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",

  // views
  "./views/home.html",
  "./views/logs.html",
  "./views/add.html",
  "./views/insights.html",
  "./views/profile.html",

  // scripts
  "./scripts/app.js",
  "./scripts/state.js",
  "./scripts/tabs.js",
  "./scripts/log.js",
  "./scripts/logs.js",
  "./scripts/today.js",
  "./scripts/insights.js",
  "./scripts/profile.js",

  // styles
  "./styles/theme.css",
  "./styles/layout.css",
  "./styles/tabs.css",
  "./styles/animations.css",

  // icons
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
];

/* ===========================
   INSTALL
=========================== */
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS);
    })
  );
});

/* ===========================
   ACTIVATE
=========================== */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
  );
  self.clients.claim();
});

/* ===========================
   FETCH
=========================== */
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // 🚫 Never cache Firebase, Gemini, or external APIs
  if (!url.origin.startsWith(self.location.origin)) {
    return;
  }

  // 🔁 SPA navigation fallback
  if (event.request.mode === "navigate") {
    event.respondWith(
      caches.match("./index.html").then((cached) => {
        return cached || fetch(event.request);
      })
    );
    return;
  }

  // 📦 Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((res) => {
        const copy = res.clone();

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, copy);
        });

        return res;
      });
    })
  );
});
