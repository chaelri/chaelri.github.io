# Elevate East Ortigas — Campus UNITE 2026 — Summary

**Event:** Campus UNITE — Elevate's 13th Anniversary
**Date / time / venue:** July 17, 2026 (Friday) · 3:00 PM · 3F Parking Level, SM East Ortigas
**Host:** Elevate East Ortigas (satellite of Christ's Commission Fellowship Elevate)
**Tagline:** "We won't stop until we see a campus and a nation revival."
**Hashtags:** `#ElevateCampusUNITE2026` `#ElevateEastOrtigas`

## What this project does
A 5-surface event app for issuing 1,000 numbered tickets (ECU-0001 → ECU-1000), letting attendees self-register by scanning their printed QR, and running a raffle from the registered pool.

| Surface | Path | Audience | Auth |
|---|---|---|---|
| Public landing | `index.html` | Anyone (students) | Public |
| Registration | `register.html?id=ECU-####` | Anyone w/ printed ticket | Public, gated by URL param |
| Dashboard (list of registered) | `dashboard.html` | Admin | Google sign-in + allowlist |
| Print tickets | `print.html` | Admin | Google sign-in + allowlist |
| Raffle | `raffle.html` | Admin | Google sign-in + allowlist |

## File structure
```
elevate-eo-campus-unite-2026/
├── index.html              ← public landing: hero + trailer + countdown + manual-register + (admin tools post-signin)
├── register.html           ← public, requires ?id=ECU-#### URL param
├── dashboard.html          ← admin: simple list of registered attendees + CSV export + one-time seed
├── print.html              ← admin: render N landscape A4 tickets w/ QR codes, browser-print to PDF
├── raffle.html             ← admin: rolling number animation, draws from registered pool, history
├── style.css               ← theme: dark navy + yellow tape + red banner; @font-face for Blauer Nue
├── js/firebase.js          ← shared Firebase init + auth helpers + path/ID helpers + admin allowlist
└── assets/
    ├── trailer.mp4         ← 9.3 MB · 32 s · 1280×720 · used on the public index page
    ├── elevate-logo.png    ← white-on-dark Elevate wordmark (used in top headers)
    ├── elevate-logo-red.png← black-text + red-A wordmark (favicon, light-bg surfaces)
    └── fonts/              ← self-hosted Blauer Nue (Regular/Medium/Semibold/ExtraBold/Heavy)
```

## Tech
- **Vanilla JS** (ES modules, no build step)
- **Tailwind v4** via browser CDN (no PostCSS, no config)
- **Firebase v9 modular SDK** (loaded direct from gstatic) — Auth + RTDB
- **Material Symbols Outlined** for icons
- **Fonts:** Bebas Neue (Google Fonts, big display) + **Blauer Nue** (self-hosted in `assets/fonts/`, iFonts personal-use license, replaces Manrope after Charlie supplied the OTFs) + JetBrains Mono (for ticket IDs)
- **QR generation:** `qrcode-generator@1.4.4` via `esm.sh` (same pattern as `collaterals/templates/table-numbers/`)

## Firebase
- **Project:** `test-database-55379` (asia-southeast1) — shared with autoclicker, aircon, tayo, echoes, weddingbar
- **Auth:** Google sign-in popup. Admin allowlist in `js/firebase.js`: `ALLOWED_ADMINS = ["charliecayno@gmail.com"]`. Add more emails here.
- **Schema root:** `elevate-eo-campus-unite-2026/` (note the EO infix — sibling Elevate satellites can reuse this app with their own schema root)

### RTDB shape
```
elevate-eo-campus-unite-2026/
├── tickets/ECU-0001: { number: 1, registered: false, createdAt: <ms> }
│                    (after registration: { registered: true, registeredAt, name })
├── registrations/ECU-0001: { ticketId, name, age, gender, fbName, school, registeredAt }
└── raffle/
    ├── draws/<pushKey>: { ticketId, name, school, drawnAt }
    └── lastDraw: { ticketId, name, school, drawnAt }
```

### Seed once
Dashboard has a **Seed 1,000 tickets** button (banner-style when DB is empty, small button always). Idempotent — skips IDs that already exist.

## Theme / brand
- **Palette:** dark navy `#07091a/#0c1130/#161b3d` · yellow caution-tape `#f5d518` · event red `#e11d2c` · text `#ffffff/#cbd0ec/#8b91b8`
- **Vibe:** matches the trailer + the keyart Charlie supplied — yellow tape headline ("CAMPUS UNITE" in Bebas Neue) over a red diagonal banner ("Elevate's 13th Anniversary"). Reusable as `.cu-mark.cu-hero|cu-md|cu-sm` in `style.css`.
- **Display headlines:** Bebas Neue (condensed all-caps)
- **UI / body:** Blauer Nue (weights 400/500/600/800/900; the family has no plain Bold .otf, so 700 maps to ExtraBold via the `font-weight: 700 800` range)

## Quirks
- **No build step.** Open `index.html` in a browser or serve any static way (file://, GitHub Pages, etc).
- **`registrationUrl(id)`** in `js/firebase.js` derives the absolute QR target from `window.location.href`, so QR codes resolve correctly whether the app is at `file://`, `localhost`, or `chaelri.github.io/elevate-eo-campus-unite-2026/`.
- **Race protection:** `register.html` re-checks `tickets/ECU-####/registered` at submit-time, not just on load, so two simultaneous scans don't double-register.
- **Print sheet** uses CSS `@page { size: A4 landscape }` + a 2-column grid. Yields to `requestAnimationFrame` every 20 tickets so a full 1,000-render doesn't freeze the UI.
- **Raffle** persists every draw to `raffle/draws/` plus mirrors latest to `raffle/lastDraw`. "Undo last" pops the most recent.
- **Blauer Nue is paid (Latinotype) but Charlie supplied the OTFs.** Self-hosted under `assets/fonts/iFonts-License.txt` — personal-use license per iFonts. If this project ever ships to a wider audience, revisit the license.

## Deploy
GitHub Pages root → `https://chaelri.github.io/elevate-eo-campus-unite-2026/`. No build, no Firebase Hosting needed — RTDB and Auth are reached over the network from the static page.

## What's not here (yet)
- Email/SMS confirmations on registration (RTDB only)
- Photo upload during registration
- Multi-tenant support for other Elevate satellites (would need parameterizing `SCHEMA_ROOT` + branding)
- Firebase Security Rules — the `elevate-eo-campus-unite-2026/*` path is unauth'd write at the moment, matching the pattern in `weddingbar/` etc. Lock down with rules when ready.
