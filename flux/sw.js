// Version 1.0.1 (Change this to force an update)
importScripts(
  "https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js"
);

if (workbox) {
  workbox.core.skipWaiting();
  workbox.core.clientsClaim();

  // Cache HTML, CSS, JS
  workbox.routing.registerRoute(
    ({ request }) =>
      request.destination === "script" ||
      request.destination === "style" ||
      request.destination === "document",
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: "flux-static-assets",
    })
  );

  // Cache Google Fonts & Material Icons
  workbox.routing.registerRoute(
    ({ url }) =>
      url.origin === "https://fonts.googleapis.com" ||
      url.origin === "https://fonts.gstatic.com",
    new workbox.strategies.CacheFirst({
      cacheName: "google-fonts",
      plugins: [new workbox.expiration.ExpirationPlugin({ maxEntries: 20 })],
    })
  );

  // Cache Tailwind CDN
  workbox.routing.registerRoute(
    ({ url }) => url.origin === "https://cdn.tailwindcss.com",
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: "tailwind-cdn",
    })
  );

  // Cache Firebase Scripts
  workbox.routing.registerRoute(
    ({ url }) => url.origin === "https://www.gstatic.com",
    new workbox.strategies.CacheFirst({
      cacheName: "firebase-core",
    })
  );
}
