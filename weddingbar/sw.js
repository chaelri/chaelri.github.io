const CACHE = "weddingbar-static-v3";

const FILES = [
  "/weddingbar/index.html",
  "/weddingbar/style.css",
  "/weddingbar/script.js",
  "/weddingbar/manifest.json",
];

/* DEBUG missing files */
FILES.forEach((f) => {
  fetch(f)
    .then((r) => {
      if (!r.ok) console.error("❌ Missing:", f);
    })
    .catch(() => {
      console.error("❌ Failed to load:", f);
    });
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(FILES).catch((err) => {
        console.error("❌ addAll failed", err);
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
