// GIF Maker service worker: app shell works offline (everything runs in the browser anyway).
const CACHE = 'gif-maker-v2';
const SHELL = ['./', './index.html', './gifenc.esm.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/favicon.svg', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// network first for the app files (so updates show up), cache as the offline fallback; fonts: cache first
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.searchParams.has('src')) return;
  const fonts = u.hostname.endsWith('googleapis.com') || u.hostname.endsWith('gstatic.com');
  if (u.origin !== location.origin && !fonts) return;
  if (fonts) {
    e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); return res; })));
    return;
  }
  e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); return res; }).catch(() => caches.match(r).then(hit => hit || caches.match('./index.html'))));
});
