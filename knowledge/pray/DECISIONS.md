# Pray — Decisions

## Why Fire-and-Forget (No Response Persistence)

- Prayers are personal, transient acts
- Gemini intercession supplemental, not core record
- UX intent: "Pray, see fire, move on" (minimize friction)
- Firebase stores only requests (what user prayed for), not AI responses

**Trade-off:** User can't review past intercessions or AI guidance.

**Alt considered:** Store intercession in `/requests/{id}/intercession` — adds DB growth + privacy concern.

## Why Gemini Proxy (Not Direct API)

- API key hidden (server-side)
- Server-side rate limiting & auth
- Proxy can swap LLM backend without client change
- Proxy can enrich context server-side

**Why NOT direct Gemini REST:** API key exposure, per-user rate limiting issues.

**Why NOT Firebase Cloud Functions:** External proxy is shared infrastructure, decoupled from Firebase project.

## Why Custom CSS Particles (Not Library)

- CSS GPU acceleration via `will-change: transform, opacity`
- 15 particles = lightweight (canvas overkill)
- Single asset (fire.png) reused
- Pixel-perfect timing control

**Why NOT confetti.js:** Adds ~10 KB; custom PNG particles = 0 deps.

**Animation curve `cubic-bezier(0.1, 0, 0.3, 1)`:**
- Fast acceleration (explosive release)
- Decelerate at end (natural settling)

**Why 1.2s duration:**
- Celebratory but not intrusive
- Long enough to see motion, short enough to return to UX
- Aligns with prayer-to-action mental model

## Why Dark Navy Theme (#0f172a)

- Prayer/meditation traditionally uses soft darkness (not harsh black)
- Cool blue undertone signals calm, introspection
- Blue accent (#3b82f6) pops against navy

**Why NOT light theme:**
- Prayer at any time (evening sessions) → dark default-safe
- Reduces eye strain for long sessions

**Color palette:**
- BG: #0f172a (navy)
- Cards: white
- Primary UI: #3b82f6 (blue, calm/trustworthy)
- Success: #22c55e (green, celebration)
- Text accent: #64748b (slate-500)

## Why Stateless Architecture

- Firebase `onValue()` serves as real-time state sync
- Vanilla JS DOM manipulation sufficient (4 views, ~50 elements)
- Adding state library = 15 KB+ overhead

**Why no Service Worker cache:**
- App requires network (Firebase + uploads)
- Offline support would need IndexedDB + sync queue
- Online-only design

**Why Firebase, not custom backend:**
- No infrastructure to manage
- Real-time `onValue` = live sync across tabs
- Storage included
- Free tier covers small user base

## Why Single-File App (No Build)

- ~700 lines JS + ~400 lines CSS
- No npm dependencies (Firebase via CDN)
- Bundle overhead > app code at this scale
- Faster dev iteration

**Why Tailwind CDN:** Rapid UI iteration, no PostCSS config.

**Why Material Icons CDN:** Standardized, no asset management.

## Acknowledged Gaps

- No accessibility (ARIA labels, prefers-reduced-motion)
- No keyboard nav beyond Space bar
- No screen reader support for timers
- No service worker (offline)
- Gemini call not yet implemented (loading state placeholder only)

**Why not prioritized:** Personal prayer app, not public-facing. Can be retrofitted later.
