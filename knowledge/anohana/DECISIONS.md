# Anohana — Decisions

## Why Google Drive Embed (Not Self-Hosted Video)

- No video hosting cost
- Public files only (no auth complexity)
- Drive's player handles fullscreen, quality switching
- Easy to add new episodes (upload + grab fileId)

**Trade-off:** Player controls fixed (Drive's UI), depends on Drive uptime.

## Why Static Episode IDs (Not CMS)

- Personal fan site, fixed 11-episode anime
- Manual curation, no dynamic updates needed
- No backend to manage

**Hardcoded in `app.js` lines 4-16:**
```js
EPISODES = [{ ep, title, fileId, dur }]
```

## Why Custom Animations (Not Library)

- **Brand control:** Bespoke timing, cubic-bezier easing
- **No overhead:** ~1.3 KB custom CSS vs ~80 KB Animate.css
- **CSS variables:** `--r`, `--t` per-element customization
- **GPU-accelerated:** Direct CSS transitions

## Why Blur-Up Images

- Perceived performance (blurred thumbnail loads instantly while full image downloads)
- Visual feedback (shape immediately, not blank box)

## Why No Analytics

- Personal fan site (one user)
- No tracking concerns
- No metrics needed

## Why Tailwind CDN (Not Pre-Built)

- No build step
- Instant CSS update on class change
- Single HTML file deploy

**Trade-off:** External CDN dependency for full styling (offline first-load may be unstyled).

## Why "TEST MODE" Menma Frequency (5-10s)

**Currently:** Menma peeks every 5-10s.
**Intended:** 30-60s+ in production (less intrusive).

**Why kept high:** Development testing; reset before final deploy.

## Sequence Tuning (Why 3.2s Intro)

- Ceremonial reveal (paced, not jarring)
- Browser time to load assets (videos)
- Signals importance of moment
- "Continue" button respects user agency

**Animation timeline:**
- 300ms: flower SVG entrance
- 800ms: menma image
- 1400ms: title
- 1900ms: subtitle
- 3200ms: app body fade-in

## Known Limitations

- Google Drive embed: public files only; no private content
- Video controls fixed (Drive's player)
- External CSS (Tailwind, Fonts) not cached for offline
- Menma peek frequency too high (test mode)
- Episode IDs hardcoded; no dynamic CMS
- No accessibility (ARIA, prefers-reduced-motion)
- No analytics (no tracking)
