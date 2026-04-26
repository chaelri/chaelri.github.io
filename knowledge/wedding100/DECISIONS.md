# Wedding100 — Decisions

## Why Three.js (vs Simpler 2D)?

**Chosen:** Three.js + custom lofted-mesh Mannequin.

**Rationale:**
1. **Visual impact:** Full 3D body with smooth proportions engages users more than stick figures
2. **Exercise clarity:** Depth (Z-axis) shows movement from multiple angles (squat depth)
3. **Dual-view animation:** `animFigDual()` cycles front → side views to show mechanics
4. **Lazy loading:** IntersectionObserver + WebGL context pooling (max 3) prevents memory bloat
5. **Scalability:** Lofted meshes handle 20+ poses without explosion of assets

**Alternative rejected:** SVG stick figures lighter but lack depth perception. Video would require many GIFs (already has 4 strap-band GIFs as fallback).

## Why Countdown-Only (vs Full Invitation)?

**This is NOT the actual invitation** — that's `weddingtest/`.

**This is a fitness tracker.** Companion `/weddingtest/` handles RSVP/guests/schedule.

**What countdown provides:**
- Motivational pre-wedding fitness goal
- Dual-user progress (bride & groom train together)
- Daily accountability (5-min workouts, steps)

**Why separate?** Cleaner separation of concerns (invitation ≠ fitness).

## Why Firebase RTDB

**Verification:** Firebase initialized + listener loop, but last commit Sep 2024 — unclear if actively used.

**Probable intent:**
- **Real-time sync:** Karla logs workout on phone, Charlie sees on laptop
- **No auth:** Trusted environment (just bride + groom)
- **Fallback to localStorage:** Works if Firebase fails

**Cost:** Minimal (2 users, small payload).

**Alternatives considered (speculative):**
- Pure localStorage: requires manual phone-to-phone sync
- Service Worker + cloud backup: overkill
- REST API: less natural pattern

## Relationship to Other Wedding Projects

1. **wedding100 (this):** 100-day countdown, kettlebell tracker
2. **weddingtest:** RSVP/guest management
3. **weddingbar:** Bar/cocktail tracker
4. **weddingtimeline:** Ceremony/schedule timeline

**wedding100 is isolated:** No imports, no shared Firebase projects mentioned. Each operates independently.

## Why Vanilla JS

**Chosen:** Plain ES6, Tailwind CSS, no build step.

**Rationale:**
1. **Single HTML file:** Easy version control & deploy
2. **PWA-friendly:** manifest.json + simple structure
3. **No dependencies (except Three.js & canvas-confetti)**
4. **Firebase Compat SDK:** Older, simpler pattern

**Trade-off:** Direct DOM manipulation more verbose than React.

## Why Tailwind (vs BEM/Custom)

**Chosen:** Tailwind CSS, CDN-loaded.

**Benefits:**
- Rapid iteration
- Dark mode support (auto-trigger 6pm-6am)
- Consistent spacing/colors (claude-500, sand-400)
- Responsive utilities

## Why Confetti on Milestones

**Psychological:**
- Celebrates small wins (5K steps) → daily engagement
- Dopamine hit → habit-forming
- Visual reward (no background music; SFX + confetti only)

**Technical:** canvas-confetti v1.6.0 lightweight (~5 KB gzipped), battle-tested.

## Why Dual-User (Charlie & Karla)

**Use case:** Engaged couple training pre-wedding.

**Implementation:**
- Separate localStorage keys (`wedding100_charlie` vs `wedding100_karla`)
- Separate Firebase refs (`wedding100/users/charlie` vs `karla`)
- UI switches users in settings (line 670–671)
- Partner progress visible (line 618 `#partnerCard`)

**Benefit:** Accountability + friendly competition.

## Why Manila Time Zone

**Hardcoded:** `phNow()` uses `'Asia/Manila'` (line 1377).

**Inference:** Couple/developer Philippines-based.

**Affects:**
- "Today" reset (midnight PH time)
- Dark mode trigger (6pm-6am PH time)
