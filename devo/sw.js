// sw.js — offline-first shell for devo.
//
// The app has to open with no signal and on a weak one, so nothing it needs to
// boot may wait on the network indefinitely:
//   - App shell (HTML/JS/CSS): network first, but give up after NET_TIMEOUT_MS
//     and serve the cached copy. A fresh network copy still lands in the cache.
//   - Bible JSON: cache first, never revalidated. They're ~5 MB each and never
//     change; bump DATA_CACHE to force a re-download if they ever do.
//   - Fonts / Firebase SDK (third-party, versioned URLs): cache first, refreshed
//     in the background.
//   - Everything else cross-origin (Gemini proxy, RTDB long-polling, TTS) is not
//     intercepted at all. Caching RTDB's JSONP polls or AI POSTs is wrong.

const DEPLOYMENT_ID = "v1.65.0-" + Date.now(); // Date.now() ensures a new cache on every SW update
const SHELL_CACHE = "dudu-devotion-" + DEPLOYMENT_ID;
// Long-lived caches survive deploys; only old shell caches are deleted.
const DATA_CACHE = "devo-data-v1";
const CDN_CACHE = "devo-cdn-v1";
const KEEP = new Set([DATA_CACHE, CDN_CACHE]);

const NET_TIMEOUT_MS = 3500;
// After one request has had to fall back to cache, assume the signal is weak
// for a while and answer the rest of the boot (scripts, chunks) from cache at
// once — otherwise each wave of requests pays the timeout again (page, then
// its scripts, then the injected chunks: ~12 s on an 8 s-latency link).
const WEAK_WINDOW_MS = 30000;
let weakUntil = 0;

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
  "./js/09-narrate.js",
  "./js/10-creator-canvas.js",
  "./js/11-boot.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-64.png",
];

const DATA_ASSETS = ["./nasb2020.json", "./easy2024.json"];

// Third-party files the app can't boot or look right without. Same URLs as
// index.html / firebase-sync.js — keep them in step.
const CDN_ASSETS = [
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js",
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0",
  "https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@6..144,1..1000&family=Monsieur+La+Doulaise&family=Nunito:ital,wght@0,300..900;1,300..900&display=swap",
  "https://fonts.googleapis.com/icon?family=Material+Icons",
];
const CDN_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com", "www.gstatic.com"]);

// INSTALL: take over immediately, cache the shell fresh, and fill the
// long-lived caches with anything they're missing.
self.addEventListener("install", (event) => {
  self.skipWaiting();

  event.waitUntil(
    (async () => {
      // Cache each asset independently instead of cache.addAll(). addAll is
      // all-or-nothing: ONE 404 rejects the whole promise, install fails, and
      // the new SW never activates. config.js is gitignored (it holds the API
      // keys), so on any checkout without it — every local Live Server run —
      // addAll always threw and the service worker could never install.
      const shell = await caches.open(SHELL_CACHE);
      await Promise.allSettled(
        CORE_ASSETS.map(async (url) => {
          const res = await fetch(new Request(url, { cache: "no-store" }));
          if (!res.ok) throw new Error(`${url} → ${res.status}`);
          await shell.put(url, res);
        })
      );
      // Already-cached entries are skipped, so after the first install these
      // cost nothing — no re-downloading 10 MB of Bible on every deploy.
      await Promise.allSettled([
        fillMissing(DATA_CACHE, DATA_ASSETS, {}),
        fillMissing(CDN_CACHE, CDN_ASSETS, { mode: "no-cors" }),
      ]);
    })()
  );
});

async function fillMissing(cacheName, urls, init) {
  const cache = await caches.open(cacheName);
  await Promise.allSettled(
    urls.map(async (url) => {
      if (await cache.match(url)) return;
      const res = await fetch(new Request(url, init));
      if (res.ok || res.type === "opaque") await cache.put(url, res);
    })
  );
}

// ACTIVATE: drop old SHELL caches (the Bible and font caches stay) and take
// control of open pages.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== SHELL_CACHE && !KEEP.has(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
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

// FETCH. Every handled branch MUST resolve to a real Response —
// `event.respondWith(undefined)` throws "Failed to convert value to 'Response'"
// in Chrome — so every failure path ends in a synthetic offline Response.
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only GETs (Cache API can't store POST — and every AI call is a POST).
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  if (url.origin !== self.location.origin) {
    if (CDN_HOSTS.has(url.hostname)) event.respondWith(cacheFirst(req, CDN_CACHE, true));
    return; // proxy, RTDB, anything else: straight to the network, untouched
  }

  if (DATA_ASSETS.some((p) => url.pathname.endsWith(p.slice(1)))) {
    event.respondWith(cacheFirst(req, DATA_CACHE, false));
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      networkWithTimeout(event, req, "./index.html").then(
        (res) => res || new Response("Offline", { status: 503, statusText: "Offline" })
      )
    );
    return;
  }

  event.respondWith(
    networkWithTimeout(event, req).then(
      (res) => res || new Response("Offline and not cached", { status: 504, statusText: "Gateway Timeout" })
    )
  );
});

// Cache first; on a miss, fetch and store. With `refresh`, a hit also updates
// the cache in the background so versioned third-party files stay current.
async function cacheFirst(req, cacheName, refresh) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit && !refresh) return hit; // never touch the network for a 5 MB Bible we already have
  const update = fetch(req)
    .then((res) => {
      if (res.ok || res.type === "opaque") cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  if (hit) return hit;
  return (await update) || new Response("Offline and not cached", { status: 504, statusText: "Gateway Timeout" });
}

// Network first, but never wait more than NET_TIMEOUT_MS on a weak signal:
// past that, answer from cache and let the network response (if it ever
// arrives) refresh the shell cache for next time. Offline (fetch rejects)
// falls to cache immediately. Resolves null when neither has it.
function networkWithTimeout(event, req, fallbackUrl) {
  const network = fetch(req, req.mode === "navigate" ? { cache: "no-store" } : undefined).then(async (res) => {
    if (res.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(fallbackUrl || req, res.clone());
    }
    return res;
  });
  event.waitUntil(network.catch(() => {}));

  const fromCache = async () =>
    (await caches.match(req, { ignoreSearch: req.mode === "navigate" })) ||
    (fallbackUrl && ((await caches.match(fallbackUrl)) || (await caches.match("./")))) ||
    null;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (res) => { if (!settled && res) { settled = true; resolve(res); } };
    const timer = setTimeout(async () => {
      const cached = await fromCache();
      if (cached) { weakUntil = Date.now() + WEAK_WINDOW_MS; finish(cached); }
    }, Date.now() < weakUntil ? 0 : NET_TIMEOUT_MS);
    network
      .then((res) => {
        clearTimeout(timer);
        if (!settled) weakUntil = 0; // only a response that beat the timeout means the signal is fine
        finish(res);
      })
      .catch(async () => {
        clearTimeout(timer);
        weakUntil = Date.now() + WEAK_WINDOW_MS;
        const cached = await fromCache();
        if (cached) finish(cached);
        else if (!settled) { settled = true; resolve(null); }
      });
  });
}
