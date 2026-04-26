# 4th Monthsary Page — Quick Reference

## Directory Structure
```
monthsary/
├── index.html              (112 lines) — login gate + protected content
├── script.js               (646 lines) — Firebase auth, click counter, chat
├── styles.css              (479 lines) — Pacifico font, glass login card, chat modal
├── Chalee1.png             (3.9 MB)   — profile image (also used as favicon)
├── heart.png               (107 KB)   — particle effect sprite
├── apa.mp3                 (16 KB)    — random sound clip (55% probability)
├── hmmmp.mp3               (34 KB)    — random sound clip (25% probability)
├── ily.mp3                 (24 KB)    — random sound clip (5% probability, plays every 100 clicks)
└── who am i to you.mp3     (54 KB)    — random sound clip (15% probability)
```

**Last rebuild:** Apr 26, 2026 (commit `b9ad526`). Moved from root to `/monthsary/` subdir, Firebase upgraded 9.6.1 → 11.0.2.

## Login Flow (Firebase + Google Sign-In)

1. **At load:** Auth check via `onAuthStateChanged()` (line 570)
2. **Allowed users:** `["charliecayno@gmail.com", "kasromantico@gmail.com"]` (line 119)
3. **Sign-in button:** HTML `#googleSignIn` (line 41 in index.html)
4. **On valid login:**
   - Email stored in `localStorage` as `"currentUserEmail"`
   - `formattedUser` mapped: `"charlie"` or `"karla"` (lines 124–125)
   - `#login-container` hidden, `#protected-content` shown (lines 519–520)
   - Online status updated in Firebase (line 521)
5. **On invalid email:** Sign out + inline error: *"This page is just for Charlie & Karla 💕"* (line 509)

## Key Globals & Constants

| Variable | Type | Purpose |
|----------|------|---------|
| `allowedEmails` | array | Hardcoded gate for Charlie & Karla |
| `firebaseConfig` | object | Firebase project `test-database-55379` |
| `currentUserEmail` | string | Cached from `localStorage` or auth state |
| `formattedUser` | string | `"charlie"` \| `"karla"` (derived from email) |
| `floatingMessages` | array | 5 random texts shown on clicks (line 112–118) |
| `lastCount` | number | Tracks previous counter for notifications |
| `userInteracted` | boolean | Blocks vibration until user engages |

**Firebase Refs:**
- `counter` — miss counter value (single int)
- `clickHistory` — timestamped list of last 5 clicks
- `chat` — messages with user/message/timestamp
- `typing` — real-time typing indicators
- `onlineUsers/<emailKey>` — online/offline status per user

## Content Sections (after login)

1. **Online Status Badge** (`#online-status`, line 55) — Shows partner's online/offline state with last-seen.
2. **Miss Counter** (`#counter-container`, lines 62–75) — Click `Chalee1.png` → increment counter, play random sound, particle burst, floating text.
3. **Chat Modal** (`#chatModal`, lines 81–104) — Real-time messages + typing indicators between Charlie ("Chalee") and Karla ("Karlyy").

## Key Selectors

```
#googleSignIn        /* sign-in button */
#login-container     /* gate (always visible until auth) */
#protected-content   /* main content (display:none until auth) */
#online-status       /* partner online indicator */
#clickableImage      /* Chalee1.png clickable avatar */
#counter-container   /* miss counter wrapper */
#chatModal           /* chat overlay */
#openChat            /* chat button (fixed bottom-right) */
#sign-out-button     /* logout */
```
