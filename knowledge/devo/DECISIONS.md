# Architectural Decisions & Rationale

> **Note (2026-04-27):** The 9,881-line `devo/script.js` was split into 11 ordered chunks under `devo/js/`. Pure cut/paste, no logic changes — chunks load as classic `<script>` tags via `firebase-sync.js` (`async=false`) and share one script-global scope. The decisions below were unaffected by the split. See [`KEY_FILES.md`](KEY_FILES.md) for the line-range → file map and rationale.

## 1. No Framework (Vanilla JS)

**Decision**: Build with plain JavaScript, no Vue/React/Svelte.

**Why**:
- **Static hosting constraint**: GitHub Pages serves static files only. A build step would require CI/CD; vanilla JS avoids this.
- **File size**: Single 388KB `script.js` + 265KB CSS is cheaper than framework bundles.
- **Zero dependencies**: No npm, no `package.json`, no lock file drift.
- **Direct DOM manipulation**: Bible verse rendering is straightforward.

**Trade-off**: More verbose DOM code, but acceptable for the scope.

---

## 2. localStorage + IndexedDB (Hybrid Persistence)

**Decision**: Use localStorage for settings/favorites + IndexedDB for image/story caching.

**Why localStorage**:
- Small data (settings, favorites, comments) fit in ~5MB quota
- Synchronous API (instant read on page load)
- Simple key-value model matches data structure

**Why IndexedDB for cache**:
- Large data (story AI responses, images) require separate store
- Async API doesn't block page load
- Each entry has TTL (7 days for stories); easy to purge expired

---

## 3. Firebase Realtime Database for Charlie (Apr 25 addition)

**Decision**: Mirror localStorage to Firebase RTDB for Charlie only.

**Why**:
- **Cross-device sync**: Charlie picks up where they left off on another device
- **Real-time updates**: Changes on one device appear on others instantly
- **Opt-in for one user**: Doesn't complicate the app for general users
- **Transparent abstraction**: Script.js code unchanged; firebase-sync.js handles mirroring

**Implementation**:
- Check if `userName === "charlie"` at boot
- Replace `window.localStorage` with in-memory mirror backed by RTDB
- Debounce-flush writes to RTDB (400ms)
- Listen for remote changes; update mirror + refresh globals

---

## 4. Gemini Proxy Instead of Direct API

**Decision**: Call a custom Cloud Run proxy instead of Gemini API directly from browser.

**Why**:
- **API key protection**: Proxy validates requests server-side
- **Cost control**: Proxy can rate-limit, reject cheap prompts
- **Extensibility**: Proxy implements caching, retry logic without touching client
- **TTS integration**: Proxy unifies Gemini + TTS under one endpoint

**Trade-off**: Adds latency vs. direct API call, but acceptable.

---

## 5. Google Cloud TTS Instead of Kokoro

**Decision**: Use Google Cloud Text-to-Speech API (server synthesis) instead of in-browser WASM.

**Why**:
- **Latency**: ~200–400ms per verse vs. ~12s for in-browser WASM
- **Full chapter ready in ~5s**: All verses synthesize in parallel on server
- **Natural voice**: Google's neural voice (`en-US-Journey-D`) professional quality
- **No WASM load time**: In-browser models require ~50–100MB download + init

**Trade-off**: Dependency on cloud service (no offline TTS).

---

## 6. Static GitHub Pages Hosting

**Decision**: Deploy to GitHub Pages (static files only), not a full backend.

**Why**:
- **No server cost**: Static hosting is free
- **No deployment complexity**: Push to GitHub → auto-deploy
- **CDN included**: GitHub Pages uses Fastly CDN
- **PWA-ready**: Service worker + manifest work fine

**Trade-off**: Can't do server-side rendering; use external proxy for dynamic APIs.

---

## 7. PWA Model (Offline-first, Service Worker)

**Decision**: Implement as a PWA with service worker for offline support.

**Why**:
- **Graceful degradation**: Verses cached on first visit; app works offline
- **App-like experience**: Installable to home screen; full-screen mode
- **Fast load**: Service worker caches assets; repeat visits instant

**Trade-off**: Requires HTTPS (GitHub Pages provides); older browsers need shim.

---

## 8. Daily Story Feature (AI-generated devotionals)

**Decision**: Generate multi-part AI devotionals (glance, segments, closing reflection) for each chapter.

**Why**:
- **Engagement**: Devotional structure guides user through contemplation
- **Caching**: Stories cached 7 days; only generated once per chapter
- **Cost-effective**: 3 API calls per chapter; cache amortizes cost over 7 days

**Trade-off**: Latency on first chapter load (~5–10s); cached reads instant.

---

## 9. Canvas Mode (Draw & Highlight)

**Decision**: Add full-screen drawing mode for highlighting and annotating passages.

**Why**:
- **Study feature**: Natural Bible study tool
- **Canvas API**: Native browser support; no library needed
- **Persistent**: Highlights saved to `devo.canvas.*` in localStorage
- **Immersive**: Full-screen mode focuses user without distractions

**Trade-off**: Complex touch handling; CSS `user-select: none` mitigates.

---

## 10. Immersive TTS Mode

**Decision**: Full-screen TTS overlay with verse stage, scrubber, pause panel, auto-reflection.

**Why**:
- **Distraction-free**: Hides controls; focuses on audio + text
- **Reflective**: Auto-shows 4 guided reflection questions when TTS finishes
- **Touch-optimized**: Verse stage, pause buttons, favorite heart all tap-friendly
- **Engagement**: Smooth transitions between verses

**Trade-off**: Complex UI state machine; worth it for contemplative experience.

---

## 11. Notes App (Standalone & Verse-linked)

**Decision**: Two kinds of notes: standalone free-form + verse-linked comments.

**Why**:
- **Flexibility**: Users may want notes not tied to a verse
- **Verse-linked efficiency**: Comments directly on verses for quick reference
- **Persistence**: Both stored in localStorage; searchable in notes app
- **Dashboard integration**: Recent notes show on home screen

**Storage**:
- Standalone: `devotionStandaloneNotes` (JSON array)
- Verse-linked: `bibleComments` (keyed by verse)

---

## 12. SOAP Method (Scripture, Observation, Application, Prayer)

**Decision**: Implement "SOAP notebook" feature for structured Bible study.

**Why**:
- **Structured method**: Well-known Bible study framework
- **User-friendly**: Four sections guide reflection without being prescriptive
- **Persistent**: Entries stored in localStorage; linkable to passages
- **Dashboard view**: All entries visible; filterable by type

**Storage**: `soap_application` and `soap_prayer` (JSON arrays)

---

## 13. Why Kokoro Isn't Used

**Investigation finding**: App uses **Google Cloud TTS**, not Kokoro. No `kokoro-js@1.2.1` or ONNX runtime dependencies found. Voice hardcoded to `en-US-Journey-D` (Google voice, line 820).

**Likely reason**: Kokoro evaluated but rejected in favor of cloud TTS due to latency/performance (see decision #5).

---

## 14. Split script.js into ordered chunks (2026-04-27)

**Decision**: Split the 388 KB / 9,881-line `script.js` into 11 ordered files under `devo/js/` (`01-core.js` … `11-boot.js`), loaded as classic `<script>` tags via `firebase-sync.js` with `async=false`.

**Why classic scripts, not ES modules**:
- `firebase-sync.js` already mutates `script.js`'s in-memory globals from outside (e.g. refreshes `comments` / `favorites` after remote RTDB updates). ES module scoping (top-level `let`/`const` not visible on `window`) would break this — would have required moving all shared state to a `state.js` module and rewriting cross-module access through explicit imports. Too much surface area for a maintainability refactor.
- Classic `<script>` tags share one script-global lexical scope across files, so cross-file globals (`comments`, `favorites`, `ttsQueue`, `bibleData`, `modalOverlay`, etc.) work unchanged. Runtime is byte-equivalent to the former monolithic file.

**Trade-off**: No real encapsulation — any chunk can still touch any global. That's the same as the status quo (single-script everything-on-window); the only thing the split buys is editability.

**Hoisting trap encountered**:
The original monolithic `script.js` benefitted from whole-file function hoisting: a top-level call at line 3650 (`showDashboard()`) could safely chain into `stopTTS()` → `ttsImmersiveClose()` (defined ~1700 lines later) because hoisting brought the later declarations into scope. After the split, hoisting only works **within a chunk** — so kickoff calls in early chunks broke when they reached forward into later chunks.

**Fix**: All synchronous kickoff (`fetchBibleData()` / `loadBooks()` / `showDashboard()` / `updateControlStates()`, the recent-passage restore block, the `_onAppLoad` readyState trigger) was moved to `js/11-boot.js`, which loads last. By the time it executes, every function across every chunk is already in scope.

**Service worker**: All chunks added to `sw.js` `CORE_ASSETS`; `DEPLOYMENT_ID` bumped to `v1.2.0-` to force cache refresh on the deploy.
