# Wedding Invitation — SUMMARY

## 🚨 CRITICAL: REAL WEDDING, NOT A TEST

Despite the folder name "weddingtest," this is the **LIVE PRODUCTION wedding invitation** for Charlie & Karla, July 2, 2026. Do NOT delete, rename, or treat as experimental.

## Quick Facts
- **Couple:** Charlie Michael Cayno & Karla Sofia Romantico
- **Date:** Thursday, July 2, 2026 at 10:00 AM
- **Venue:** CCF East Ortigas (3F SM East Ortigas Parking Area)
- **Deployed at:** charliekarlawedding.vercel.app
- **Live since:** February 2026

## File Structure
```
weddingtest/
├── index.html            (2,812 lines, 106 KB) — Main invitation page
├── script.js             (1,416 lines, 44 KB) — Interactivity & Firebase
├── style.css             (1,329 lines, 25 KB) — Custom animations & layout
├── assets/               (104 MB) — Images, audio, video, floral PNGs
│   ├── monogram.png      — C&K logo (used throughout)
│   ├── hero-portrait.jpg, background-song.mp3 (6.4 MB)
│   ├── courtship.m4a (audio testimonial)
│   ├── proposal.mp4 (29 MB), skyranch.mp4 (33 MB)
│   ├── 5-10.png (floral overlays)
│   ├── attire/ (gallery images)
│   └── qr-bpi.jpg, qr-gcash.jpg, qr-maribank.jpg
└── guestlistmanager/     (64 KB submodule)
    ├── dashboard.html, dashboard.js, dashboard.css
```

## Firebase Config
- Database: `charlie-karla-wedding-default-rtdb.asia-southeast1.firebasedatabase.app`
- Collections: `guestList`, `rsvps`, `wishes`

## Key Globals
- `masterGuestList[]` — Loaded from Firebase, used for RSVP autocomplete
- `scrollYMemory` — Preserves scroll position when modals open/close
- `currentImagesArray[]` — Active gallery images
- `currentGuestName` — Last RSVP'd guest (for follow-up messages)
- `isMusicMuted` — Background music toggle state

## RSVP Flow

1. **Intro Overlay** (2.5–4.5s): monogram fade + shimmer → flowers → welcome modal → "CONTINUE" → page reveals
2. **Form Entry** (#rsvp): Guest types name → autocomplete filters `masterGuestList` → arrow keys / Enter to select → Yes/No/Maybe attendance
3. **Validation & Submission**: name must match `masterGuestList` (case-insensitive); pushes to Firebase `rsvps` + Discord webhook; confetti burst, wax seal, scroll to RSVP
4. **Post-RSVP Notes**: optional message → `secondaryNote` textarea → pushes to Firebase `wishes` + second Discord webhook

## Key Element IDs

| ID | Purpose |
|----|---------|
| `floral-overlay`, `intro-monogram`, `welcomeModal`, `closeModalBtn` | Intro |
| `main-nav`, `more-menu`, `countdown-container` | Navigation |
| `rsvpForm`, `guestName`, `attendance`, `nameErrorMsg`, `autocomplete-list`, `successMsg` | RSVP |
| `post-rsvp-container`, `secondaryNote` | Post-RSVP |
| `bgMusic`, `musicToggle`, `musicIcon`, `courtshipAudio` | Audio |
| `attireModal`, `mainAttireImg`, `qrLightbox` | Modals |
| `forever-section`, `scroll-progress-bar` | Visual effects |

## Firebase Schema

**guestList:**
```js
{ id: { name, nickname, side, invited, role, gender, age, photoUrl, marchingOrder } }
```

**rsvps:**
```js
{ id: { guestName, attending: "yes"|"no"|"maybe", submittedAt: ISO } }
```

**wishes:**
```js
{ id: { guestName, message, timestamp: ISO } }
```

## Tech Stack
- HTML semantic + Tailwind CDN with custom theme
- Vanilla JS (ES modules), Firebase Realtime DB, canvas-confetti
- Fonts: Playfair Display (serif) + Inter (sans)
- Colors: Sage (#7b8a5b), Pink (#ffb7c5), Cream (#faf9f6), Stone (#a8a29e)

## Deployment
- Vercel auto-deploys from git push
- Firebase Rules: guests read `guestList`; write `rsvps` & `wishes`
- Discord webhooks (hardcoded URLs) for real-time RSVP notifications
- Admin panel: `/guestlistmanager/dashboard.html`
