# Anohana — Anime Fan Site

**Streaming hub for "Anohana" (The Flower We Saw That Day, 2011, 11 episodes).** Embedded Google Drive player, character/episode gallery, animations.

**Stack:** Vanilla JS, Tailwind v3 CDN, Material Icons, PWA. Last commit September 2024.

## File Structure
```
anohana/
├── index.html              (17.3 KB) — Main HTML template
├── app.js                  (13.2 KB) — Core logic
├── sw.js                   (1.5 KB)  — Cache-first SW
├── manifest.json           — PWA
├── cover.jpg               (96.8 KB) — Series cover
├── favicon.png             (2.8 KB)
├── icon-192.png, icon-512.png
├── menma1.png              (224.6 KB) — Intro overlay character
├── menma2.png, menma3.png  — Peeking variants
```

**Total Size:** ~596 KB

## Episode Configuration (app.js 4–16)
```js
EPISODES = [{
  ep: number,
  title: string,
  fileId: string,    // Google Drive ID
  dur: "22:30"
}]
// All 11 episodes hardcoded
```

## Content Sections
1. **Intro Overlay** (3.2s): Animated flower SVG → menma1.png + title → fade reveal
2. **Hero Section**: Time-based greeting, series title (with Japanese), animated quote typing, stats (11 episodes / ~22min / 2011), cover image, gradient line accent
3. **Video Player**: Google Drive iframe (16:9), placeholder shimmer, fade in/out on episode change, "Now Playing" badge with prev/next buttons
4. **Episode Gallery**: 11 buttons with thumbnail (lazy-loaded), title, episode number, duration, "PLAYING" badge animation, hover zoom
5. **Footer**: Monospace "CHAELRI_STREAM" branding

## Key Globals (app.js)
- `EPISODES[]` — 11 episode objects
- `QUOTES[]` — 10 anime quotes (random selection)
- `SECRET_BASE_LYRICS[]` — 7 theme song lyrics for floating animations
- `PETAL_COLORS[]` — 5 hex colors
- `FIREFLY_COLORS[]` — 4 hex colors
- `MENMA_IMGS[]` — `["menma2.png", "menma3.png"]`
- `currentEp` — Active episode index (0–10)

## Selectors
- `#player`, `#player-placeholder`, `#now-playing`
- `#episode-list`, `#app-body`, `#intro-overlay`

## localStorage
- `anohana_last_ep` — Resume from last watched episode

## Color Scheme
- Dark bg: `#060609`
- Card: `#0c0c12`
- Border: `#16161f`
- Primary red: `#e53935` (accent, active)
- Primary blue: `#1e88e5` (hover)

## Animations
- **Intro:** 3.2s sequence (flower scale+rotate, menma slide, title slide)
- **Petal Fall:** Continuous drift (`@keyframes petal-fall`, 8-15s, sway + rotate)
- **Fireflies:** 12 glowing dots in hero, random drift (4-10s + delay)
- **Menma Peeking:** Random sides (right/left/bottom/top-right), wiggle while visible
- **Floating Lyrics:** Theme song text drifts across viewport (every 20-60s)
- **Quote Typing:** Character-by-character (35-60ms) every 8s

## PWA (sw.js)
- **Cache:** `anohana-v3` (versioned)
- **Strategy:** Stale-while-revalidate for own assets
- **Cached:** index.html, app.js, manifest, icons, cover (NOT external CDN assets)
- **Skip Waiting:** Auto-activates new SW

## Why
- **Why Google Drive embed:** No video hosting cost, public files
- **Why static episode IDs:** Manual curation, no dynamic CMS
- **Why custom animations (not library):** Full control, brand-specific
- **Why blur-up images:** Perceived performance
- **Why no analytics:** Personal fan site
- **Why Tailwind CDN:** No build step
- **Why "TEST MODE" Menma frequency (5-10s):** Should be 30-60s+ in production

## Known Limitations
- Google Drive embed: public files only
- Video controls fixed (Drive's player)
- External CSS (Tailwind, Fonts) not cached for offline
- Menma peek frequency too high (test mode)
- No accessibility (ARIA, prefers-reduced-motion)
