# Pray — Prayer Request App

**A.C.T.S. (Adoration / Confession / Thanksgiving / Supplication) prayer flow with AI intercession.** Last commit Jan 11, 2026 (parked).

**Stack:** Vanilla JS, Tailwind CSS, fire animation (CSS + canvas), PWA. Firebase Realtime DB + Storage.

## File Structure
```
pray/
├── index.html              — Tailwind + Material Icons + Firebase
├── app.js                  — Vanilla JS, Firebase, ACTS prayer cards
├── style.css               — Card animations, timer rings, fire VFX
├── manifest.json           — PWA (#0f172a dark navy)
└── assets/fire.png, pray.png
```

## Prayer Flow (A.C.T.S. Model)

1. User clicks "START PRAYING" (`#start-acts`)
2. `generatePrayerCards()` builds 4-6 slide cards:
   - **Adoration** (60s)
   - **Confession** (60s)
   - **Thanksgiving** (60s)
   - **Supplication** (120s) — active prayer requests as polaroids
3. Card system: `.snap-point` containers with scroll-snap, IntersectionObserver triggers `startTimer()`, `.timer-ring` SVG animated via stroke-dashoffset
4. Direct Prayer (single request): `window.directPray(id, context)` → 1 card, "Praying For" 120s

## Loading State
- `#request-sending-overlay` shown on submit
- "Lifting up..." text + breathing pray.png
- `bg-[#0f172a]/95 backdrop-blur-xl`
- Hidden after 600-1400ms (Gemini call expected here)

## Fire Finish Animation
- `runFireTransition(callback)` creates 15 `.fire-particle` divs
- CSS `@keyframes fireBlast` (1.2s, cubic-bezier(0.1, 0, 0.3, 1))
- Particles spawn center, translate to `--tx`/`--ty` via CSS vars
- Scale `--s` 2-6×, opacity 0→1→0
- Callback fires at 600ms (mid-animation)

## Firebase Schema
```
/streak                    — int, ACTS session counter
/requests/{id}             — { text, imageUrl, isAnswered, count, createdAt, includeInActs, checklist }
/clickHistory              — last 5 timestamps (CHALEE-style?)
```

## localStorage
- `last_prayer_record`: `{timestamp, type, name}` (for "Last prayed" UI)
- No Gemini response storage (fire-and-forget)

## Gemini Integration
**Status:** Loading overlay exists but Gemini call NOT YET WIRED in code (placeholder).

**Expected URL:** `https://gemini-proxy-668755364170.asia-southeast1.run.app`

**Expected payload:**
```json
{
  "prayer_text": "Peace in my household",
  "acts_phase": "Supplication",
  "image_url": "https://...",
  "checklist": ["Peace", "Guidance"],
  "timestamp": 1234567890
}
```

**Integration point:** After Firebase push (line 504), before `requestInput.value = ""` (line 513).

## Image Handling
- `compressImage()` resizes max 1024px, quality 0.6 JPEG
- Uploads to Firebase Storage at `prayers/${timestamp}.jpg`
- URL stored in request object

## Why
- **Why fire-and-forget (no response persistence):** Prayers are personal/transient, supplemental AI not core
- **Why Gemini proxy (not direct):** Hides API key, server-side rate limiting, swappable backend
- **Why dark navy theme (#0f172a):** Calm, prayer/meditation aesthetic
- **Why CSS particles (not confetti library):** Precision, no dependency, GPU-accelerated
- **Why no service worker:** Online-only design (relies on Firebase + Gemini)
- **Why Firebase RTDB:** Real-time streak/request sync, simple

## Known Gaps
- Service worker not implemented
- Gemini call not yet wired (placeholder loading state)
- No accessibility (ARIA labels, reduced-motion)
