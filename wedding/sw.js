// 🩷 Wedding Bubble Planner - Always Fresh, No Cache Version
self.addEventListener("install", (event) => {
  console.log("[SW] Installed - no cache mode");
  self.skipWaiting(); // activate immediately
});

self.addEventListener("activate", (event) => {
  console.log("[SW] Activated - cleaning all caches...");
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// 🚫 Fetch: never use or store cache
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then((response) => response)
      .catch(() => {
        // Optional: show fallback message or offline.html if you want
        return new Response("You're offline. Please reconnect.", {
          headers: { "Content-Type": "text/plain" },
        });
      })
  );
});
