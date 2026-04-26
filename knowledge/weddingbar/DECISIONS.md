# WeddingBar — Decisions

## 🚨 Dual Deployment Strategy

**Deployed to TWO platforms simultaneously:**
1. **Firebase Hosting** — Root domain
2. **GitHub Pages** — `/chaelri.github.io/weddingbar/`

**Why Firebase Hosting:**
- Real-time DB backend already chosen (Firebase RTDB)
- Seamless integration (same GCP project, automatic CDN)
- Simple `firebase deploy`
- Custom domains + HTTPS out-of-box
- Analytics + monitoring in Firebase console

**Why GitHub Pages subpath:**
- Redundancy if Firebase goes down
- Version control (deploy history in git)
- No vendor lock-in
- Familiar workflow for open-source

**Trade-offs:**
- Dual maintenance (must keep both deployment configs synced)
- Risk of data inconsistency if versions diverge
- User confusion (two URLs)

## Why Firebase RTDB Over Firestore

**RTDB advantages:**
- Simpler API: `ref()`, `set()`, `get()`, `onValue()`
- Lower latency: all data synced
- Real-time by default
- Smaller SDK (~40 KB gzipped)
- Free tier (100 simultaneous connections)

**Firestore disadvantages for this use case:**
- Overkill for 3 collections
- More verbose query syntax
- More complex security rules

## Why Vanilla JavaScript

- No build step
- Small bundle (~85 KB)
- Fast iteration
- Full control
- Learning value

**Trade-offs:**
- 85 KB harder to navigate than modular components
- Manual sync DOM ↔ Firebase
- More integration tests needed

## Why localStorage for UI State (Not Data)

- Persists across sessions (sort remembered)
- Instant access (no Firebase round-trip)
- Tiny payload (<1 KB)
- Standard browser API

**Why NOT for data:**
- localStorage limit 5-10 MB
- Synchronous (blocks main thread on large data)
- No cloud sync (changes invisible across devices)

## Why PWA + Service Worker

- Install as app (home screen)
- Offline shell
- Push notifications (future)
- Re-engagement via badge

**Network-first cache:** Always fresh content; fallback to cache offline.

**Cache-bust per deploy:** `weddingbar-v{Date.now()}` ensures latest.

## Why Philippine Peso (Hardcoded)

- Personal project for Philippines
- Wedding date July 2, 2026
- Locale `en-PH` for ₱ formatting
- No i18n needed

## Why Wedding Date Hardcoded

```js
const weddingDate = new Date("July 2, 2026 00:00:00").getTime();
```

- Personal project, one wedding, one date
- Countdown: days/weeks/months remaining
- Visual motivation

## Why Guest Kanban (Not Dropdown)

- See all guests + roles simultaneously
- Drag-drop faster than tapping dropdowns
- Visual grouping
- Touch-friendly

**Roles offered:** guest, bride, groom, parent, bridesmaid, groomsman, principal, secondary.

## Why No Authentication (Currently)

- Phase 1 MVP, trusted user group
- Quick iteration (no auth logic)
- Data not sensitive (budgets, names, checklist)

**Risk:** Public read/write Firebase rules. **Fix before sharing publicly:**
- Enable Firebase Auth (Google Sign-in)
- RTDB rules: `".read": "auth != null", ".write": "auth != null"`
- Backend proxy for Firebase config

## Why Attachments in Storage (Not Data URL)

- Bandwidth (CDN-served)
- Performance (lazy-load images)
- Scalability (RTDB stays small)
- Flexibility (re-upload without re-writing metadata)

**Storage path:** `weddingCosts/{itemId}/{filename}.jpg`.

**Metadata in RTDB:** `{ url, path }` per attachment.

## Why Network-First Caching

| Strategy | When |
|----------|------|
| Network-first | Fresh content, fallback offline ← **Chosen** |
| Cache-first | Immutable assets |
| Stale-while-revalidate | News/blog (freshness less critical) |

**Rationale:** Users expect latest data; offline UI shell acceptable; app updates frequently.

## Summary Table

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Deployment | Dual (Firebase + GH Pages) | Redundancy + decoupling |
| Database | Firebase RTDB | Simplicity, real-time |
| Frontend | Vanilla JS | No build, full control |
| UI State | localStorage | Sort prefs only |
| PWA | Yes (SW + manifest) | Install as app, offline UI |
| Currency | Philippine Peso | Personal project for PH |
| Auth | None (currently) | MVP phase |
| Storage | Firebase Storage | CDN, lazy-load, scalable |
| Cache | Network-first | Fresh content |
