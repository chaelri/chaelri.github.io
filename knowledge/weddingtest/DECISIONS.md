# Wedding Invitation — Decisions

## 🚨 CRITICAL: This Is The Real Wedding, Not A Test

**Despite the misleading folder name "weddingtest," this IS the production invitation for Charlie & Karla's wedding on July 2, 2026.**

The name "weddingtest" originated when the project was initially created as a development/staging environment. It evolved into the live invitation deployed to `charliekarlawedding.vercel.app` and is actively receiving RSVPs.

**Implications:**
- Do NOT delete, rename, or repurpose this directory
- All changes are production updates (test before merging)
- Guest data in Firebase is real and live
- Discord webhooks actively notifying the couple

## Tech Stack Choices

### Why Vanilla JS + Tailwind CDN (No Build Step)?
- Speed to deploy: no npm install delays
- Minimal friction (Charlie is primary developer)
- Hosting simplicity (static site on Vercel)
- Tailwind JIT via CDN (custom config in script tag)
- Firebase as backend (no server logic)

**Trade-off:** Slightly larger HTML (106 KB), CSS not minified, but Vercel CDN compensates.

### Why Custom CSS Animations (Not Library)?
- Brand control (custom cubic-bezier easing)
- Minimal overhead (~1.3 KB vs Animate.css ~80 KB)
- CSS variables (`--r`, `--t`) for per-element customization
- GPU-accelerated transitions

### Why Firebase Realtime Database?
- Zero ops (managed service)
- Real-time sync (Discord webhook fires immediately)
- Simple JSON structure
- Access control via Firebase rules
- Low cost (free tier)

**Alternative rejected:** REST API (added complexity).

### Why Playfair Display + Inter?
- Brand elegance (Playfair = decorative serif, wedding-appropriate)
- Inter (clean, modern) = readability
- Proven serif + sans pairing
- Free Google Fonts
- Playfair italic ampersand animates beautifully

### Why guestlistmanager as Submodule?
- Admin separation (distinct interface)
- Firebase shared (same database)
- Same Vercel deploy
- Future: could add auth without disrupting main invitation

**Current access:** Anyone with URL can manage guest list. **TODO:** Firebase authentication.

## Feature Decisions

### 1. Intro Overlay Delay (2.5s → 3s → 4.5s)
- Ceremonial, paced reveal
- Browser time to load heavy assets (videos)
- Signals importance
- "Continue" button (respects user agency)

### 2. Scroll-Based Nav Hide
- Maximizes viewport on mobile
- Always visible at top + bottom
- Shows at RSVP (form reminder)

### 3. 4 Confetti Variants
- Petal Drift (continuous after intro)
- RSVP Burst (high-energy celebration)
- Forever Drift (sides-based, frames section)
- Trivia Sparkle (micro-interactions)

### 4. Modal Scroll Lock Pattern
- `body.style.top = -scrollY` + `position: fixed`
- Prevents background jump when modal opens/closes
- Tested: iOS Safari, Android Chrome, desktop

### 5. Autocomplete + Arrow Keys
- Power users navigate without mouse
- Mobile thumb-reachable
- Only exact match (case-insensitive) accepted

### 6. Video Priming on Overlay Close
- Play → pause → reset before overlay disappears
- Tricks iOS/Safari autoplay policy
- Ensures smooth playback later

### 7. Discord Webhooks (Two: RSVP + Messages)
- Immediate awareness (not polling Firebase)
- Visual distinction (✅ vs 💌)
- Webhook URLs hardcoded in client-side code
- **Acceptable risk:** spam-only attack surface

### 8. Static Asset Organization
- Flat `/assets/` structure
- Videos unoptimized (~62 MB) — could be ~30 MB with H.264 + lower bitrate

### 9. Permissive Firebase Rules
- `guestList` readable by all (for autocomplete)
- `rsvps` & `wishes` writable by all
- **Acceptable:** No PII, low-sensitivity data
- **Future:** Add Firebase auth (email-based optional OTP)

### 10. No Service Worker / PWA
- One-time use (wedding is one day)
- Vercel CDN provides excellent caching
- Already feels app-like

### 11. No Image Optimization (WebP/AVIF)
- Time-to-deliver prioritized
- JPG/PNG universal browser support
- **Future:** TinyPNG/ImageOptim for next update

### 12. Countdown Targets 10:00 AM (Not Midnight)
- Ceremony start time
- "Today is the Day!" when dist < 0

## Deployment

**Platform:** Vercel (https://charliekarlawedding.vercel.app)

**Why:**
- Automatic deploys from git push
- Global CDN
- Preview deployments for testing
- GitHub CI/CD integration
- Free tier sufficient

**Workflow:**
1. Charlie pushes to main
2. Vercel auto-builds (no build step) and deploys
3. Live within seconds

## Known Limitations & Debt

1. **Firebase webhook URLs hardcoded** — should be Vercel env vars
2. **Attire modal reused for story images** — works but couples concerns
3. **Admin dashboard unprotected** — anyone with URL can edit
4. **Videos unoptimized** — ~62 MB total
5. **No error logging** — Firebase errors logged to console only
6. **CSS not minified** — 25 KB → ~15 KB possible
7. **No analytics** — only RSVP data, no scroll tracking

## Post-Wedding Decisions

- **Rename:** "weddingtest" → "wedding-2026" or archive
- **Admin Auth:** Firebase sign-in for guestlistmanager
- **Guest List Lock:** Firebase rules post-July 2
- **Memories Archive:** Convert to photo gallery of reception

## Why This Architecture Is Correct

- One-time event = acceptable tech debt
- Fast MVP (2+ months from concept to live)
- Solo developer (Charlie + Karla)
- Low ops (Vercel + Firebase = zero servers)
- Guest experience flawless across iOS/Android/desktop
- Flexibility (can add features without rebuild)

The "weddingtest" name stuck because it started as a test but proved robust enough for production. **This decision document serves as a reminder: this IS production, despite the folder name.**
