# Anohana — Architecture

## Client-Side-Only SPA

No backend. User interactions = JavaScript DOM manipulation + local browser state.

**Content sources:**
- Static: HTML, CSS (Tailwind + inline), SVG
- External: Google Fonts (icons & typeface), Google Drive (videos & thumbnails)
- Local Storage: Last viewed episode

## Page Load Sequence

### 1. HTML Parse (index.html, ~17.3 KB)
- Meta tags (PWA-capable, mobile viewport, safe-area)
- Tailwind CDN with custom theme config (extends colors, fonts)
- Inline `<style>` block (~274 lines: animations, layouts)
- Service worker registration (bottom of body)

### 2. Intro Overlay Fade-In (`playIntro()` in app.js)
```
t=300ms:  flower SVG scale(0.3)→1, rotate(-45deg)→0
t=800ms:  menma1.png translateY(30px)→0
t=1400ms: title "Anohana" translateY(20px)→0
t=1900ms: subtitle translateY(15px)→0
t=3200ms: overlay opacity 0→1, app-body opacity 0→1
t=4000ms: overlay.display = "none"
```

### 3. Time Greeting (`setTimeGreeting()`, line 87–99)
- Reads `new Date().getHours()`
- Sets icon + text (night/morning/afternoon/evening)
- Updates `#time-greeting`

### 4. Quote Animation (`typeQuote()`, line 104–123)
- Starts at t=3500ms
- Random quote from QUOTES
- Typing: 35–60ms per character
- Holds 8s, then next quote

### 5. Episode Initialization (line 214–218)
- Reads localStorage for last episode
- If valid, schedules `playEpisode(index)` at t=3400ms
- Else defaults to Episode 1

## Gallery Rendering (Episode List)

**Dynamic DOM (lines 169–193):**
```js
EPISODES.forEach((ep, i) => {
  const row = document.createElement("button");
  row.className = "ep-row reveal ...";
  row.style.transitionDelay = `${i * 0.04}s`;  // Stagger 40ms
  row.innerHTML = `
    <div class="ep-thumb">
      <img src="${thumbUrl(ep.fileId)}" alt="EP ${ep.ep}" loading="lazy" />
      <div class="thumb-play"><span class="material-symbols-outlined">play_arrow</span></div>
    </div>
    <div class="flex-1">
      <div class="ep-title">${ep.title}</div>
      <div class="ep-sub">EP ${ep.ep} · ${ep.dur}</div>
      <span class="now-badge">playing</span>
    </div>
  `;
  row.onclick = () => playEpisode(i);
  list.appendChild(row);
});
```

**Thumbnail loading:**
- `thumbUrl(fileId)` → `https://drive.google.com/thumbnail?id=${fileId}&sz=w240`
- `loading="lazy"` attribute
- Mobile: 90px width, 16:9 aspect (50px height)
- Desktop (640px+): 120px × 67px

## Video Player & Streaming

**`playEpisode(index)` flow:**
```js
function playEpisode(index) {
  const ep = EPISODES[index];
  currentEp = index;

  player.style.opacity = "0";
  setTimeout(() => {
    player.src = buildDriveUrl(ep.fileId);
    placeholder.classList.add("hidden");
    player.onload = () => { player.style.opacity = "1"; };
  }, 200);

  nowPlaying.classList.remove("hidden");
  nowPlayingText.textContent = `EP ${ep.ep} — ${ep.title}`;

  document.querySelectorAll(".ep-row").forEach((row, i) => {
    row.classList.toggle("active", i === index);
  });

  localStorage.setItem("anohana_last_ep", index);
  document.querySelector("nav").scrollIntoView({ behavior: "smooth" });
}
```

**Player URL:**
```
buildDriveUrl(fileId) → https://drive.google.com/file/d/${fileId}/preview
```

- No auth (public files only)
- Fullscreen support via iframe `allow` attribute
- Autoplay supported

## Animations & Visual Effects

**Floating Petals (lines 222–249):**
```js
function spawnPetal() {
  const petal = document.createElement("div");
  petal.className = "petal";
  // Random size 10-24px, color (PETAL_COLORS), left 0-100%, duration 8-15s
  petal.style.animation = `petal-fall ${duration}s ease-in forwards`;
  petalContainer.appendChild(petal);
  // Auto-remove after animation
}
// Spawn loop every 2-5s, starting t=3.5s
```

**Fireflies in Hero (lines 254–267):**
- 12 dots, 2-5px size
- Box-shadow adds glow
- `firefly-float` 4-10s + 0-5s delay infinite
- Random drift vectors via CSS vars `--fx`, `--fy`

**Menma Peeking (lines 270–307):**
- 4 sides: from-right, from-left, from-bottom, from-top-right
- Random image (menma2.png or menma3.png)
- Translate from off-screen → visible (~3-6s display)
- Wiggle while visible (rotate ±3°, translateY -3px)
- Spawn every 5-10s starting t=3s

**Floating Lyrics (lines 312–326):**
- 7 Secret Base lyrics (theme song)
- 12px italic, red 20% opacity
- Drifts right→left across viewport, 12.5s
- Spawn every 20-60s starting t=10s

## PWA Strategy (sw.js)

```js
const CACHE_NAME = "anohana-v3";
const ASSETS = [
  "/anohana/", "/anohana/index.html", "/anohana/app.js",
  "/anohana/icon-192.png", "/anohana/icon-512.png",
  "/anohana/cover.jpg", "/anohana/favicon.png", "/anohana/manifest.json",
];
```

**Install:** Cache all ASSETS, skipWaiting.

**Activate:** Delete old caches, claim clients.

**Fetch (Stale-While-Revalidate):**
```js
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;  // Don't intercept cross-origin

  e.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(e.request).then((cached) => {
        const fetchPromise = fetch(e.request).then((response) => {
          if (response && response.status === 200) cache.put(e.request, response.clone());
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    )
  );
});
```

**Behavior:**
1. Cache-first (immediate)
2. Background fetch updates cache
3. Offline: fallback to cache or fail gracefully

## State & Persistence

**localStorage:**
- `anohana_last_ep`: Episode index (0-10) for resume

**Session variables:**
- `currentEp`, `EPISODES`, `QUOTES`, `SECRET_BASE_LYRICS`, `PETAL_COLORS`, `FIREFLY_COLORS`, `MENMA_IMGS`

## Responsive Design

**Breakpoints (Tailwind):**
- Mobile: <640px (default)
- Tablet/Desktop: ≥640px (sm)
- Desktop: ≥768px (md)

| Element | Mobile | Desktop sm | Desktop md |
|---------|--------|-----------|----------|
| Cover image | Hidden | Visible (40-52px) | 208-320px |
| Episode thumbnail | 90px | 120px | 120px |
| Hero padding | 8px (pt-8 pb-10) | pt-12 pb-14 | same |
| Now Playing nav | Hidden | Visible | Visible |

## Performance

**Lazy loading:**
- Episode thumbnails: `loading="lazy"`
- Google Drive previews: on-demand

**Animation optimization:**
- `will-change: transform, opacity` on petals (GPU acceleration)
- `pointer-events: none` (don't block underneath)
- Reveal observer (threshold 10%, rootMargin -40px)

**Bundle:**
- HTML: 17.3 KB | JS: 13.2 KB | SW: 1.5 KB | Images: ~520 KB | **Total cacheable: ~552 KB**
