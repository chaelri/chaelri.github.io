# 4th Monthsary — Design Decisions

## 1. Login Gate: Charlie & Karla only

**Decision:** Two-tier access — Firebase Google Sign-In + hardcoded email whitelist (`charliecayno@gmail.com`, `kasromantico@gmail.com`).

**Why:**
- Privacy/intimacy — personal monthsary, no random visitors
- Shared session state — counter, chat, online status are global; only the couple should write
- Simple — Firebase RTDB doesn't offer email-pattern row-level security; client-side gate + sign-out is practical
- Friendly denial — inline status text, not an alert: *"This page is just for Charlie & Karla 💕"*

**Trade-off:** Anyone can inspect HTML/JS structure, but content doesn't render without auth, and Firebase rules (assumed) block unauthenticated reads.

---

## 2. Date-locking to Nov 11 — intended but NOT enforced in code

**Status:** Code does not check date. Asset timestamps and title imply Nov 11 unlock was the intent.

**Why not implemented yet:**
- Apr 26 rebuild focused on Firebase upgrade + sign-in UX polish
- Date check deferred — couple can visit anytime, content shows after auth alone

**Future:** Add a `today.getMonth() === 10 && today.getDate() === 11` check before `updateUI()`.

---

## 3. MP3s in repo (vs streaming)

**Decision:** 4 MP3 clips (~129 KB total) committed to git.

**Why:**
| Aspect | Local MP3s | Streaming |
|--------|---|---|
| Latency | Zero | Network RTT |
| Reliability | Always works | Depends on CDN |
| Cost | Free | Per-request |
| Complexity | `<audio>` tag | CORS, signed URLs |

For a couple's app with frequent visits and small audio total, local wins on every axis. Privacy is acceptable since the repo is private/personal.

---

## 4. Pacifico cursive font

**Decision:** Google Fonts `Pacifico` for headings, buttons, floating text, sign-in card title.

**Why:**
- Romantic / hand-written feel matches "miss you" tone
- Casual, not formal — avoids corporate sans-serif
- CDN-hosted, mobile-friendly, readable at all sizes
- Cohesive personality across dialogs/buttons/floating overlays

Fallbacks: `Open Sans` (body), `Funnel Sans` (alt), serif.

---

## 5. Apr 26, 2026 rebuild (commit `b9ad526`)

**Before:** Monthsary at repo root, Firebase v9.6.1, alert-box on auth failure.

**After:**
- Moved to `/monthsary/` subdir
- Firebase v9.6.1 → v11.0.2 (better tree-shaking, modern auth flow)
- Sign-in UX redesigned: glass-morphism card, inline error text, disabled-button-during-auth state
- Inline Google logo SVG (faster than image)
- Root `index.html` replaced with project hub landing

**Why rebuild:**
1. **Repo organization** — monthsary is one of many projects; subdir keeps root clean
2. **Firebase modernization** — v11 has 8 months of improvements
3. **UX polish** — `alert()` → inline status (less jarring)
4. **Path stability** — assets stayed relative, so move was zero-refactor

**Commit message** preserves the rationale and credits Claude Opus 4.7 (1M context) co-author.

---

## Design philosophy

1. **Intimacy first** — every decision prioritizes the couple's experience
2. **Simplicity** — no frameworks, no build, vanilla HTML/CSS/JS + Firebase
3. **Realtime** — RTDB ensures counter/chat/online sync instantly
4. **Microinteractions** — sounds, particles, floating text, heart animations
