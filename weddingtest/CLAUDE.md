# weddingtest/ — 🚨 LIVE WEDDING INVITATION 🚨

## CRITICAL CONTEXT

**Despite the folder name "weddingtest," this IS the production wedding invitation for Charlie & Karla, July 2, 2026.**

- Deployed at `charliekarlawedding.vercel.app`
- Live since February 2026
- Actively receiving RSVPs and guest messages
- **Do NOT delete, rename, or repurpose this directory.**
- Treat all changes as production updates.

## Knowledge

@../knowledge/weddingtest/SUMMARY.md

@../knowledge/weddingtest/ARCHITECTURE.md

@../knowledge/weddingtest/KEY_FILES.md

@../knowledge/weddingtest/PATTERNS.md

@../knowledge/weddingtest/DECISIONS.md

## Quick reminders

- **RSVP validation:** name must match `masterGuestList` from Firebase (case-insensitive). Not in list = shake + error.
- **Two Discord webhooks** (RSVP + messages) hardcoded in `script.js`. Should move to env vars.
- **Modal scroll lock pattern:** save `scrollYMemory`, set `body.style.top = -scrollY`, add `modal-active` class. Restore on close.
- **Countdown targets 10:00 AM** (ceremony time), not midnight. Updates every 1000ms.
- **Firebase project:** `charlie-karla-wedding` (separate from other apps' `test-database-55379`).
- **Admin panel:** `/guestlistmanager/dashboard.html` — CURRENTLY UNPROTECTED (TODO: add Firebase auth).
- **Asset directory is large** (~104 MB, mostly videos). Don't add more videos without compression.
