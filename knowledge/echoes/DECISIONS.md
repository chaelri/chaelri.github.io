# Echoes — Decisions

## 1. Dual-User Only (Charlie & Karla)

**Why hardcoded users:**
- Scope simplification (no registration, email verify, password reset)
- Privacy for couple (no bot abuse, no moderation)
- UI clarity (two branded buttons)
- No third-party user management = no credential compromise risk

**Trade-offs:**
- Not scalable (third user = code change)
- No real auth (session = localStorage alone)
- Single browser share risk (one user can see other's session)

## 2. Firebase RTDB (Not Firestore/REST)

**Why RTDB:**
- Real-time sync via `onValue()`, no polling
- Offline-first (Firebase SDK local cache)
- Zero ops (managed)
- Generous free tier (100 connections, 1 GB)
- Integrated Storage

**Why NOT Firestore:** Higher costs for reads ($0.06/100k vs unlimited). Overkill for two users.

**Why NOT REST API:** HTTP polling required, no real-time multi-client sync.

**Why NOT WebSocket custom:** Server deploy + SSL cert + uptime monitoring.

## 3. Instagram-Style Stories (24h Ephemeral)

**Why ephemeral:**
- Casual sharing (less permanent than posts)
- Auto-expiry (`expiresAt: now + 86400000`) eliminates storage bloat
- Visual novelty (story circles, progress bars, navigation)
- Seen-by tracking (`seenBy` object)

**Why NOT just posts:** All-permanent posts feel like archive; couples want ephemeral "inbox" feel.

**Trade-off:** Expired stories stay in RTDB (no backend cron deletes them). Acceptable for two-user app; minor storage cost.

## 4. Tailwind v4 Browser Build (No Build Step)

**Why CDN:**
- No build tool complexity
- Instant CSS update on class change
- GitHub Pages friendly
- v4 is newer (arbitrary values, more features)

**Why NOT pre-compiled:** CDN is fast/reliable; static files work equally.

**Why NOT UnoCSS/Pico:** Tailwind ecosystem most familiar.

**Trade-off:** ~14 KB gzipped CSS download + browser parsing on cold load.

## 5. Vanilla JavaScript (No Framework)

**Why:**
- No bundle bloat (React/Vue overhead)
- Direct DOM manipulation faster to prototype
- Plain JS portable, framework-knowledge-free

**Trade-off:**
- Code verbosity (1,443 lines, lots of `getElementById`)
- No re-render optimization (could duplicate DOM updates)
- No test framework

## 6. Firebase Storage (Not Cloudinary/S3)

**Why:**
- Integrated with RTDB (same auth)
- Signed URLs auto-expire
- Cheaper ($0.018/GB egress vs S3 ~$0.09/GB)
- No CORS issues (same origin)

**Why NOT Cloudinary/Imgix:** Adds dependency + cost for image transformation (not used).

## 7. localStorage for Session (Not IndexedDB)

**Why:**
- Single JSON object (`{ id, name, profilePicURL, bio }`)
- ~few KB sufficient
- Simpler API than async IndexedDB

**Why NOT cookies:** Cross-domain risk, harder to manage.

## 8. Two-Button Login UI

**Why:**
- Intent clarity (Charlie or Karla)
- No form validation
- No password logic

**Trade-off:** Not extensible (third user = code change).

## 9. Real-Time Comments with Likes

**Why nested with likes:**
- Engagement (couples encourage each other)
- RTDB structure maps trivially to nested no-SQL
- No reply threads (flat list per post)

**Why NOT reply threads:** Adds complexity, two-user app doesn't need depth.

## 10. Blur-Up Image Lazy Loading

**Why base64 placeholder:**
- Perceived performance (blurred thumbnail loads instantly)
- Storage efficiency (20px, 10% quality = ~1 KB)
- Visual feedback (shape immediately, not blank)

**Why NOT progressive JPEG:** Firebase Storage doesn't host JPEG metadata.

**Why NOT LQIP libraries:** Canvas blur-up free, works everywhere.

## 11. Auto-Delete for Expired Stories — None (Manual Only)

**Why expired stories linger:**
- Firebase RTDB no TTL trigger (vs Redis)
- Client-side filtering (`if expiresAt > now`) is free
- Low risk (two users, ~10-20 stories/day)

**Could add:** Cloud Function trigger on story write, scheduled delete. Not implemented — acceptable tech debt.

## 12. No Encryption

**Why:**
- Trust model (Charlie & Karla trust each other)
- E2E encryption complicates Firebase RTDB sync

**Security assumption:** RTDB rules restrict to charlie/karla only (not visible in code; can't verify).

**Risk:** If rules permissive, any Firebase user could read.

## Summary

| Decision | Why | Trade-Off |
|----------|-----|-----------|
| Dual-user only | Scope, privacy | Not scalable |
| Firebase RTDB | Real-time, zero ops | Vendor lock-in, no TTL |
| 24h stories | Casual sharing | Stale data in DB |
| Tailwind v4 CDN | No build, GH Pages | 14 KB overhead |
| Vanilla JS | Simple state | Verbose, no testing |
| Firebase Storage | Integrated, cheap | No image transform |
| localStorage session | Simple | Single device, no logout |
| Blur-up images | Perceived performance | Extra canvas render |
| Real-time comments | Engagement | No threading |
