# Devo Mobile — Architectural Decisions

## Why Expo (vs Bare React Native)?

**Chosen: Expo**
- Faster dev loop (Expo Go, instant reload)
- Managed build (no native compilation needed for iteration)
- Built-in services (font, haptics, secure-storage, TTS, audio)
- OTA updates (Expo Updates seamless JS/asset delivery)
- Cross-platform (single codebase iOS/Android/web)

**Not bare RN because:**
- Team small, time-to-market prioritized over native customization
- No need for custom native modules (TTS, storage available via Expo)

## Why Zustand (vs Redux, Recoil, Context)?

**Chosen: Zustand**
- Minimal boilerplate (no actions, no dispatch)
- Lightweight (~1KB vs Redux ~40KB)
- Direct mutations
- Subscriptions API (only re-renders subscribed components)

**Not Redux:** Overkill complexity for local-only single store.
**Not Context:** Re-render cascades, no built-in persistence helpers.

## Firebase: NOT Integrated (Parked)

**Status: NOT USED**

**Why not integrated:**
1. **Local-only philosophy:** App stores user data locally only (SecureStore). No sync backend.
2. **No auth flow:** App is anonymous-only, no login needed.
3. **Stateless AI:** Gemini proxy handles all AI, no Firebase Functions.
4. **Time constraints:** Parked Feb 2026, deprioritized when project halted.

## Code Sharing with devo PWA

**Shared principles:**
- Same Bible metadata structure (book codes, verse counts)
- Same Bible JSON data format
- Same AI prompts (story types, reflection tone, dig deeper structure)
- Same Gemini proxy service
- Same Zustand store architecture pattern

**NOT shared code:**
- UI components (React DOM vs React Native)
- Storage (localStorage + IndexedDB vs expo-secure-store)
- Routing (React Router v6 vs Expo Router)
- TTS (Web Audio API vs native expo-av + fallback)

**Why separate codebases?**
- Mobile-specific features (haptics, secure storage, immersive TTS)
- Native UI patterns (bottom tabs, modal stack, long-press gestures)
- Deployment (app stores vs web hosting)

## Parked Status (Feb 2026)

**Last commit:** "security: untrack functions/service-account.json, use runtime credentials"

**Likely reasons:**
1. **No monetization path:** Premium flag is client-only, no backend billing. Can't convert free users.
2. **MVP complete:** Core reading + AI features working.
3. **Resource allocation:** Team shifted to other projects (devo PWA continued, mobile paused).
4. **Firebase not done:** Sync/cloud features would require backend work.

**To resume:**
1. Implement Firebase Firestore for cloud sync
2. Add App Store/Google Play billing
3. Set up backend to enforce premium limits
4. QA on both platforms
5. Submit to app stores

## Limits Strategy: Client-Side Only

**Current:** Free tier limits checked client-side, incremented locally, reset daily.

**Limitations:**
- User can bypass by reloading or clearing data before limit resets
- No server validation
- Premium is just a flag (not validated)

**Why chosen:**
1. Simplicity (no backend needed for MVP)
2. Offline mode (works without internet)
3. Fast (no network round-trip)

## Why No Auth?

**Decision: Local-only, no login required**

**Rationale:**
1. **Privacy first:** User data stored securely on device, never sent to server
2. **No account friction:** Download, use immediately
3. **Simple MVP**

**Trade-offs:**
- No cloud sync (data locked to device)
- No multi-device access
- Can't recover if phone lost
- No server-side premium enforcement

## Summary

**Devo Mobile is a lean, focused Bible app** optimized for single-device local use. Shares philosophy with the PWA (Zustand, Gemini AI, shared data) but diverges in implementation due to platform differences. The decision to park in Feb 2026 reflects a **complete MVP but incomplete monetization path** — without a way to charge users, continuing development had diminishing returns.
