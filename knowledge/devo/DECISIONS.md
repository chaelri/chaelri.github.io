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

**Implementation** (original Charlie-only — superseded by decision #21 multi-user):
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

---

## 15. Smart reflection retry + New Covenant prompt rule (2026-04-28)

**Decision**: Replace the naive "regenerate everything" retry button with a smart retry that preserves answered questions and only regenerates the unanswered ones; AND tighten the prompt with a strict NEW COVENANT rule so OT ceremonial / dietary / sacrificial laws are never asked as still-binding obligations.

**Why smart partial regen**:
- Charlie kept losing real, thought-out answers when he wanted to swap *one* question that didn't land.
- Full regen on a 3-of-3 prompt costs more tokens, and fresh AI questions don't honor the work the user already did.
- New flow: read each `<li>`'s textarea value → if N=3 unanswered, fall back to full regen; if 0 unanswered, button is disabled with green "✓ All questions answered" tooltip; if 1–2 unanswered, fetch exactly N new questions with an explicit "DO NOT duplicate these already-answered questions" exclusion list and swap them into the unanswered slots in-place.
- Answered Q+A pairs survive verbatim; existing textarea event-listeners survive (we only wire NEW textareas to avoid double-firing saves).

**Why the covenant rule needed strengthening**:
- First pass said "don't bind the reader to OT laws." AI still asked "what unclean food will you avoid this week?" on Leviticus 11.
- Final rule: explicit hard-forbidden list of question patterns (matching the exact phrasings that leaked through), proof-text references (Mark 7:19, Acts 10, Col 2:16), four NT-faithful redirect angles (God's character / heart principle / Christ fulfillment / NT-parallel transfer), and concrete BAD→GOOD rewrite pairs for Leviticus 11/16/19. Plus a 3-step self-check the AI runs before emitting each question.

**Implementation**:
- Extracted `_fetchReflectionLis({ book, chapter, versesText, count, excludeQuestions })` so both `renderAIReflectionQuestions` (count=3, exclude=[]) and `_smartRetryReflections` (count=N<3, exclude=answeredQuestions) share the same prompt builder.
- `_ensureReflectionRetryUI(mount)` is idempotent: on every innerHTML overwrite (fresh render, cache restore, retry re-render) it (a) ensures the button is in the DOM, (b) wires a delegated click handler on `#aiReflection`, (c) wires a delegated `input` handler that recomputes button state after every keystroke. Survives across cache-restores and modal clones.
- Reflect modal (`openReflectModal` in `08-story.js`) clones `#aiReflection`'s innerHTML; the cleanHTML strip-regex was tightened so it wipes AI rogue spans but **not** `material-symbols-outlined` spans (otherwise the refresh icon glyph disappears). The modal independently re-wires its own retry button click → smart retry → re-open the modal so the new questions show.
- Trade-off: extra plumbing vs. simpler "always full regen." Worth it because Charlie's answers are the user's actual reflection work — losing them on a misclick is a meaningful regression.

**State indicator** (`.ai-refl-retry-done`):
- Pink default → green when all 3 answered. Tooltip changes to "All questions answered ✓". Pure CSS swap, no icon font swap (Material glyphs render from textContent, not pseudo-elements — pseudo-element ::before content="check" doesn't actually swap the icon).

---

## 16. Letter-indicator keycap badges on canvas tools (2026-04-28)

**Decision**: Add visible `H`/`E`/`1`–`5` keycap-style badges (12-13px, dark pill, bottom-right of each button) on the canvas-mode highlight tool, eraser tool, and 5 color swatches — desktop only.

**Why**: native `title=` tooltips only show on hover, which mobile-touch users never see and even desktop users don't discover unless they hover-and-wait. Charlie wanted the shortcuts (`H`, `E`, `1`–`5`) DISCOVERABLE, not buried in tooltip-on-hover. CSS `::after` with hardcoded `content` selectors per `[data-tool]` / `[data-color]` keeps the badges in pure CSS — no HTML/JS plumbing.

**Why desktop-only**: phones don't have keyboards, so the badges would be visual noise. Wrapped in `@media (min-width: 768px)`.

**Trade-off**: hardcoded badge content per swatch color in CSS instead of `data-shortcut="1"` HTML attribute + `content: attr(data-shortcut)`. Both work; the CSS-only version is cleaner because the swatch HTML stays the canonical source for color, and shortcuts are tightly coupled to the JS `KEY_TO_COLOR` map anyway — when those change, both must update.

---

## 17. Random study-mode highlight color (2026-04-28)

**Decision**: When canvas mode opens and plays the cinematic study intro (chapter title with marker sweep), pick a random highlight color from the 5-swatch palette instead of always yellow.

**Why**: Charlie said the intro "always looked the same" — the highlight was hardcoded yellow even though the canvas itself supports 5 colors. Randomizing the intro color makes the moment feel less repetitive across chapters.

**Implementation**: `_playStudyIntro` in `10-creator-canvas.js` rolls one of 5 color triplets (mid / edge / glow rgb tuples for yellow, pink, blue, orange, green) and sets `--cm-hi-1` / `--cm-hi-2` / `--cm-hi-3` / `--cm-hi-glow` CSS custom properties on `.cm-intro-highlight`. The CSS gradient + drop-shadow read from those vars; defaults are yellow if JS doesn't set them.

---

## 18. Edge TTS swap + canvas listen mode (2026-04-28)

**Decision**: Replace Google Cloud TTS (`en-US-Journey-D`, direct browser → `texttospeech.googleapis.com`) with Microsoft "Edge Read Aloud" (`en-US-BrianNeural`) routed through a new `POST /edge-tts` endpoint on `gemini-proxy/`. Bump synth concurrency from 4 → 10. Fire prefetch for the whole chapter on `loadPassage` instead of just on Listen-tap. Re-introduce the IndexedDB audio cache with a short 3-day TTL. Add a canvas-mode listen flow with a sticky mini-player, marching-ants verse border, and Media Session API integration.

**Why the swap**:
- Synthesis is ~10× faster (~150-300ms/verse vs. ~2s for Journey-D).
- Microsoft's Edge Read Aloud endpoint is free; client no longer needs `GOOGLE_TTS_KEY`.
- Real `WordBoundary` timings come back with the audio, so word-level highlighting uses true Edge timings (synthetic-timing heuristic stays as a fallback).
- Cloud Run free tier covers ~800 chapters/month; Microsoft eats the synthesis cost.
- Trade-off: `msedge-tts` uses Microsoft's undocumented internal endpoint via a public anonymous trusted token. If MS revokes it, we'd need to switch to a paid path. Not load-bearing for personal-use scope.

**Why prefetch the whole chapter on load**:
- Per-verse synthesis is so fast that the user finishing the on-screen verse-1 read takes longer than the entire chapter to synth. Tap-Listen feels instant.
- 3-day TTL keeps IDB bounded even on chapter spam; cache hits are instant on revisits.
- Even pathological flipping (10 chapters × 30 verses = ~300 calls) just queues behind the 10-slot semaphore.

**Why canvas listen mode (separate from immersive)**:
- The immersive overlay covers the canvas; defeats the point of read-along while highlighting/drawing.
- Canvas mode keeps the paper visible; sticky mini-player at bottom-center provides ⏮ ⏯ ⏭ 🔒 (auto-follow toggle) ✕.
- Auto-follow (default on) smooth-scrolls the canvas to keep the active verse centered. `localStorage.devo.cmTtsAutoFollow` persists the toggle. `visibilitychange` hook re-snaps to current verse when the user reopens the phone.
- Active verse gets a marching-ants pink dotted border via injected SVG `<rect>` with animated `stroke-dashoffset` (clean rounded corners — earlier 4-edge gradient trick clipped at corners). Active word gets a soft `rgba(190,24,93,0.2)` wash with dark text staying — no per-word color flip, no strobing.
- Active verse `padding: 20px 24px` so text "loloob" deep inside the dotted box; neighbors push down naturally and auto-scroll re-centers.

**Media Session API**:
- iOS Safari pauses audio on screen-lock unless the page registers as media. Wiring `navigator.mediaSession` makes the OS treat devo as a media app — audio keeps playing past chapter boundaries while the phone is asleep, lock screen shows verse metadata + ◀◀ ▶ ▶▶ controls, headphone buttons work.

**Canvas chapter nav (no need to exit to switch passages)**:
- ‹ / › chevrons flank the big italic passage title; proxy to legacy `#prevChapterBtn` / `#nextChapterBtn`.
- Tappable topbar title opens `window._openBookPicker()`.
- `loadBtn.onclick` wrapper now calls `window._cmReload?.()` so the canvas paper rerenders the new chapter without replaying the intro.
- `.bc-sheet` z-index bumped 1005 → 10200 so the picker sits above `.cm-overlay` (10050) and the listen bar (10080).

**Removed during this rewrite**:
- Share-as-image (`cmShareBtn`, `html2canvas` plumbing, `exportPassageAsImage`, `downloadBlob`) — Charlie didn't use it.
- Clear-all-highlights (`cmClearBtn`, `_confirmDialog` flow) — also unused.
- `_prefetchNextChapter` (post-chapter background prefetch of the *next* chapter) — superseded by per-load prefetch.
- `tts-preview/` directory — was a Node-side baking experiment that got us to the Edge TTS decision; now obsolete.
- `_TTS_STORE` was briefly dropped (DB v5) when we thought Edge synth was so fast caching was unnecessary; restored at v6 with 3-day TTL after Charlie's "save it nalang pala" decision.

---

## 19. Drop marching-ants verse border for opacity dim (2026-04-28, same day as #18)

**Decision**: Remove the SVG marching-ants dotted border + 20×24 padding on the active verse (introduced earlier in #18). Replace with a simpler opacity dim: when `body.tts-canvas-follow` is set, every `.cm-verse:not(.cm-verse-tts-active)` fades to 0.35 opacity; the active verse stays at full brightness.

**Why**:
- The padded active verse never aligned cleanly with inactive verses' padding — the bordered box visibly broke the column rhythm.
- Marching-ants animation + SVG injection added DOM/render work for marginal benefit.
- Charlie's framing: "para simple yet align yung padding sa other verses" — keep all verses at identical layout, just dim the rest.
- Dim only applies when auto-follow is LOCKED. Unlocked = user is free-scrolling, dimming would be annoying so it releases everywhere.

**Implementation**:
- `_cmMarkActiveVerse(verseNum)` no longer injects the `.cm-verse-ants-svg` element; just toggles the `.cm-verse-tts-active` class so the dim selector has a `:not()` target.
- `playChapterInCanvas` adds `body.tts-canvas-follow` when `_cmTtsAutoFollow` is on; `_ttsCleanupMode` removes both `tts-canvas-active` and `tts-canvas-follow`. `cmTtsToggleAutoFollow` adds/removes it on user toggle.
- All `.cm-verse-ants-svg` CSS gone. `.cm-verse.cm-verse-tts-active`'s padding/margin rules gone — class is now purely a CSS hook.
- Per-word soft pink wash (`.cm-word-tts-active`) stays as the read-along position marker.

**Trade-off**: Loses the "decorative" feel of the dotted-border. Gain is a calmer, more read-friendly emphasis that respects column alignment.

---

## 20. Multi-meta TTS cache + permanent storage + dedupe (2026-04-28, evening session)

**Decision**: Three coupled changes to the TTS audio cache to fix a long tail of "biglang nawawala" / "nirereplace-an" / queue-blowup bugs Charlie kept hitting in the Audio Library bulk-download flow.

### 20a. Multi-meta entry shape

The Bible has many verses with **identical text** — e.g. "Now the Lord spoke to Moses, saying," at Exodus 6:10 / 14:1 / 31:1 / 31:12, plus dozens more. Cache key was (and still is) `voice|text`, so all four hit one IDB record. Old schema stored `{book, chapter, verseNum}` at the top level — every save **overwrote** the previous verse's meta. Saving 31:12 made 6:10 disappear from the Audio Library counter; chapters that were 100% cached would flip back to "partial" the moment a duplicate-text verse from another chapter saved.

Fix: store metas as an **array** on the entry (`metas: [{book, chapter, verseNum}, …]`). `_saveTtsAudio` now does the read+merge+write inside a single readwrite transaction (IDB serializes overlapping readwrites on the same store), so two parallel saves both end up in the array. `_metasInclude` deduplicates so calling save with an already-present meta is idempotent. Legacy entries (single top-level meta) auto-promote on read via `_entryMetas`.

`_listTtsAudioEntries` consumers (book grouper in `_renderAudioLibrary`, per-book poll counter) now iterate `_entryMetas(e)` so every verse pointing at a shared audio shows up in the counter.

Force-fresh path was REMOVED — it deleted the entire entry, which would have wiped all sharing verses' metas. The cache-hit-append on multi-meta is the correct cure for the "stuck verse" symptom anyway.

### 20b. Permanent cache (no TTL)

`_TTS_MAX_AGE = Infinity`. `_getTtsAudio`'s freshness check is always true; `_purgeExpiredCache`'s deletion check is never true. Once a verse is downloaded for the device, it stays.

**Why**: synth cost is on Microsoft's free Read Aloud, not ours, so the prior 3-day TTL was just churn for the user (re-downloading the same chapters every few days). Charlie: "honestly do not do any expiry on this audio, so theres no need for a device to download it again". IndexedDB has effectively unlimited per-origin quota on modern browsers; user can clear site data if ever needed.

UI consequences: removed `data-status="expiring"` chapter cell state, removed `~Xh left` tooltips, removed `• 3-day cache` summary suffix.

### 20c. In-flight dedupe

`_inflight = new Map<cacheKey, Promise>`. The Audio Library poll re-fires retries every 1.5s for missing verses. Without dedupe, those calls piled up faster than the 10-slot semaphore drained — within minutes the "waiting" counter reached >100k duplicates of the same texts. With dedupe: the second caller for an in-flight key just `await`s the lead caller's promise (no semaphore acquire, no queue entry) and registers its meta on the shared IDB entry post-resolve.

**Trade-off**: One more layer between caller and the network. Worth it: queue stays bounded at <20 even mid-download.

### 20d. Targeted retry + stuck detection

Earlier the Audio Library poller re-fired `_ttsPrefetchSpecific(book, chapter)` for the entire chapter on every 1.5s tick — most calls cache-hit, but Charlie's "wala talaga nangyayare na" pointed out the loop hides which specific verse is failing. Now the poll diffs `expected verseNums (1..N)` against `have` (Set from metadata index) and computes the **exact** missing verseNums. `_ttsPrefetchSpecific` accepts an optional `onlyVerseNums: Set` and filters before iterating.

Also added stuck-round tracking: a `Map<chapter, {signature, rounds}>` increments while the same missing set persists. After 2 polls (~3s), logs `[devo-tts] STUCK <book> <ch>` so the user can see exactly what's failing instead of staring at a counter that won't move.

### 20e. Per-book pollers + survive close

Was: single global `_audioLibPollTimer`; closing the modal killed it AND cleared `_downloadingBooks`. Re-opening or starting a second book wiped the first.

Now: `_audioLibPollers` is a `Map<bookKey, intervalId>`. Each book's bulk download owns its own poller. Closing the modal stops only the activity-panel UI tick; per-book downloads keep ticking in the background. Multiple books download concurrently — they share the global 10-slot synth semaphore but neither cancels the other. Pollers self-clean when their book completes or hits the 10-min cap.

`_renderAudioLibrary(expandBook)` sentinel semantics tightened so background re-renders don't yank the user's expansion: `undefined` → preserve, `null` → collapse all, `"<book>"` → expand. Charlie's rule: "if nakaclose na sha hayaan mo sha nakaclose wag mo agawin yung ginagawa ko".

### 20f. Apostrophe regex bug

`loadPassage:1167` and `_ttsPrefetchSpecific` both normalized verse text with `replace(/([.,!?'])(?=[a-zA-Z0-9])/g, "$1 ")` — the `'` (curly right single quote, U+2019) in the punct class matched possessives and inserted a space, producing `Aaron' s`, `Lord' s`, etc. This sent malformed text to TTS (read aloud weirdly), AND sometimes choked Microsoft's synth. Removed `'` from both regexes.

### Files touched

- `devo/js/01-core.js` — `_TTS_MAX_AGE = Infinity`; new `_deleteTtsAudio`, `_entryMetas`, `_metasInclude`; `_saveTtsAudio` rewritten as single-transaction read+merge+write with metas array.
- `devo/js/03-tts.js` — `_inflight` Map dedupe in `ttsSynthesize`; targeted retry + stuck tracker in the bulk-download click handler; per-book `_audioLibPollers` Map; `_ttsPrefetchSpecific` accepts `onlyVerseNums` filter; cache-hit append-meta replaces the old single-meta backfill; force-fresh path removed; `_renderAudioLibrary` consumers iterate `_entryMetas`; sentinel semantics for `expandBook`.
- `devo/js/04-passage.js` — apostrophe removed from punct class.
- `devo/style.css` — Audio Library Activity panel re-themed light cream/pink; orphan `.audio-lib-ch[data-status="expiring"]` rule removed; orphan `.audio-lib-log-filter` rules removed; verse-num dim selector changed to `> *:not(.cm-verse-num)` so the tap-to-jump affordance stays full-opacity even when its parent verse is dimmed by auto-follow; `.cm-title` → `flex: 0 0 auto` / `width: auto` so the topbar passage button is fit-content (was stretching across the whole row).
- `devo/index.html` — added `#mtAudioLibBtn` next to the Listen button; canvas listen icon swapped `graphic_eq` → `headphones` (matches the top-bar Listen); removed the "Show cache hits" toggle.

---

## 21. Multi-user firebase sync — Karla added (2026-04-29)

**Decision**: Generalize `firebase-sync.js` from "Charlie-only" to "any user in `SYNC_USERS`". Add Karla as the second supported user with her own private RTDB path.

**Why**:
- Charlie & Karla each use the devo app for their own private Bible study. Reflections, notes, prayer entries, and SOAP journals are personal — they should NOT pool into a shared dataset.
- Karla wants the same cross-device sync benefit Charlie's had since 2026-04-25 (pick up reading on phone after starting on laptop, etc.).
- The mirror logic itself is user-agnostic (it just shadows localStorage and pipes writes to a path); the only thing that varies per user is the RTDB path. So generalizing was a small refactor, not a rewrite.

**Implementation**:
- `SYNC_USERS = { charlie: "devo-sync", karla: "devo-sync-karla" }` keyed by lowercase userName. Charlie's path stays as `devo-sync` for back-compat — no migration of his existing data.
- Replaced `_isCharlie` flag + hardcoded `RTDB_PATH` constant with `_syncUser` (active user) + `_syncPath` (resolved per-user path) state.
- `_activateCharlie` → `_activateSyncFor(user)` (parameterized). If a different sync user is active when activate is called, `_deactivateSync()` runs first to tear down the old mirror/listener/timers — so charlie ↔ karla swap works mid-session without a page reload.
- Public API: `window.activateSyncForUser(name)` + `window.deactivateSync()`. Back-compat shims: `window.activateCharlieSync` / `window.activateKarlaSync` both delegate to `activateSyncForUser`.
- `js/05-render-init.js` `_showNamePrompt`: replaced single-name "charlie" boundary check with a `SYNC_USERS = ["charlie", "karla"]` array + activate/deactivate-or-swap logic. Adding more users requires extending both this array AND the firebase-sync `SYNC_USERS` map.

**Trade-off**: Two separate RTDB roots means slightly more storage, but each is bounded by one user's working set so it's negligible. No cross-user data leakage by construction (different paths = different `.on("value")` listeners = different snapshots). If we ever wanted shared data (e.g., a shared "we read this together" feature), we'd add a third path like `devo-sync-shared` and write to both from each user's mirror.

**Files touched**:
- `devo/firebase-sync.js` — bootstrap, activate, deactivate, mirror install, write/listen all parameterized on `_syncPath`.
- `devo/js/05-render-init.js` — name-prompt swap logic.

---

## 22. Dashboard polish + AI Continue-Reading recap + idle game-feel layer (2026-04-29)

**Decision**: Major dashboard pass — visual harmony, AI-generated recap on the Continue Reading card, and a subtle ambient-motion layer that makes the dashboard feel alive without being distracting.

**Why**: The dashboard had become a static read-only list of recent items. Charlie wanted (a) clearer CTAs ("Pick up where you left off" instead of "Continue Reading?"), (b) a recap of what the resumed chapter is actually about (so re-entry doesn't require remembering), (c) ambient motion so the page doesn't read as dead.

**Visual harmony**:
- Notes cards re-themed to match Favorites' pink-tint card surface so both columns read as one kind of "recent activity".
- Notes cap raised to 5 (was 3), 2-line preview clamp; type label only renders when the visible set is mixed (otherwise every row tagging "REFLECTION" was noise).
- Favorites: `FAV_PAGE_SIZE` 3 → 5 (cuts paginator from 63 → 38 pages); paginator buttons re-styled as muted ghost icons + "n/total" indicator instead of bright pink filled CTAs.
- Continue Reading: italic ref + chevron + halo card-button instead of bare text; sentence-case "Pick up where you left off" header with `dashboard-icon--book` hook.
- Top-right icons got self-explanatory aria-label/title (e.g. "Audio library — manage downloaded chapters").
- Hidden empty `.top-actions-reading` row on dashboard so the greeting and CTA enter the fold sooner.

**AI Continue-Reading recap**:
- New `loadDashContinueRecap()` fetches a one-sentence recap of the resumed passage from gemini-proxy. Cache key `passageRecap-${recentPassageId}` lives in localStorage.
- `passageRecap-` was added to `SYNC_DYNAMIC_PREFIXES` in `firebase-sync.js`, so for sync users (Charlie, Karla) the recap rides the existing mirror — same recap on every device, no regeneration. For non-sync users it's plain localStorage (still no regen on revisit).
- Cache miss shows a pink three-dot loader; failures don't poison the cache so the next visit retries.

**Idle game-feel layer** (all gated by `prefers-reduced-motion: no-preference`):
- **Floating motes** — 18 randomized pink dots drifting up across the viewport, each with own duration (9-21s), delay, scale, opacity, lateral drift via inline CSS variables. Negative start delays so the field is full from t=0.
- **Twinkles** — 10 sparkle dots blinking at random positions (3-7s loops).
- **Section icons** — `dashboard-icon--fav` heart heartbeat (2.6s lub-dub), `dashboard-icon--book` slow breath (4s), `dashboard-icon--notes` pen-twitch (5.5s, mostly still).
- **Continue card** — `dashContinueGlow` 4.5s breathing pink halo via `box-shadow`; `nudgeRight` chevron loop continues; ref has gradient text-fill that slides via `dashRefShimmer` (charlie called the LEVITICUS shimmer good — keep it).
- **Greeting title** — slow pink+blue text-shadow breath (the brand's two accent colors).

**Things explicitly removed during this pass**:
- **Card sheen sweep** — Charlie hated the diagonal light streak across cards ("ew remove the shimmer"). Removed the `::after` overlay + `dashCardSheen` keyframes + `position: relative; overflow: hidden` shim on cards.
- **Card idle bob** — Charlie said the random translateY oscillation made him dizzy ("ayaw ko pala na randomly moving yung tiles nakakahilo"). Removed `dashCardFloat` keyframes + animation + nth-child stagger overrides. Hover state on cards stays at translateY(-4px) lift (no random motion involved).

**Reading progress bar** (separate, from earlier in the day): `#readProgressBar` + fill at the bottom of the layout. Tracks `.layout` scroll in normal mode and `#cmScroll` in canvas mode; hidden on dashboard (`.layout-unset`). MutationObserver re-evaluates on layout flips and canvas open/close.

**Files touched**:
- `devo/js/01-core.js` — `FAV_PAGE_SIZE` 3 → 5.
- `devo/js/04-passage.js` — Continue Reading button restructure, `dashContinueRecap` mount, `loadDashContinueRecap` next to `loadDashGreetingMsg`, ambient layer injection (motes + twinkles HTML), section icon modifier classes (`dashboard-icon--book/fav/notes`), notes slice 5, mixed-type label gate.
- `devo/js/05-render-init.js` — reading progress bar setup.
- `devo/firebase-sync.js` — `passageRecap-` added to `SYNC_DYNAMIC_PREFIXES`.
- `devo/index.html` — top-right icon labels expanded; `#readProgressBar` markup.
- `devo/style.css` — dashboard polish + idle keyframes + ambient containers + reading progress bar.

---

## 23. SOAP feature deletion + free-form Prayers journal (2026-05-05)

**Decision**: Delete the entire SOAP "Application & Prayer" subsystem and replace its prayer half with a free-form **Prayers journal** that mirrors the existing Gratitude pattern.

**Why SOAP was pulled**:
- Charlie's framing: *"its not feasible and usable anymore"*. The SOAP screen + dashboard combined view (the Application/Prayer columns with stack cards + All/God/Family/Ministry pills) added a lot of UI surface for very little payoff. Charlie's actual journaling habit had migrated to the Obedience + Gratitude pattern (open input on top, list below, no categories).
- The 5-category gating (`God / Family / Work-School / Ministry / Others`) added friction for entries that didn't naturally fit one bucket. Free-text journals don't ask the user to label first.
- The SOAP "Respond" button on Dig Deeper sat at the bottom of the AI study card and was the only entry path — easy to miss. The new dashboard journal pills sit on the home screen right under the greeting, so they're always one tap away regardless of which passage is loaded.

**What changed (single coordinated removal + add)**:
- Deleted `devo/js/09-soap.js` outright (~970 lines).
- `index.html`: removed `#soapListPanel` + `#soapScreen` panels.
- `sw.js`: dropped `js/09-soap.js` from `CORE_ASSETS`; bumped `DEPLOYMENT_ID` v1.18.0 → v1.19.0 to force the cache flip.
- `firebase-sync.js`: removed `js/09-soap.js` from the injector list, removed `soap_application` / `soap_prayer` from `SYNC_STATIC_KEYS`, deleted `_mergeSoapEntries` and the `decodedKey === "soap_application" || decodedKey === "soap_prayer"` branch in `_mergeKeys`.
- `js/04-passage.js`: removed the `soap-respond-row` div + `openSoapScreen` binding from `fetchInlineDigDeeper`; removed `_renderSoapDashCombined()` rendering + `_bindSoapDashboard()` invocation from `renderDashboard`.
- `js/08-story.js`: same Respond-button removal from the passage-level Dig Deeper card.
- Added Prayers helpers in `js/04-passage.js` (mirroring the Gratitude block): `_PRAY_JOURNAL_KEY = "prayersJournal"`, `_getPrayersEntries`, `_savePrayersEntries`, `_addPrayerEntry`, `_deletePrayerEntry`, `_refreshPrayersJournalLink`, `openPrayersJournal` (uses `volunteer_activism` icon, "Lord, I pray..." placeholder), `_renderPrayerEntry`.
- Added a third pill `#dashPrayLink` to `.dash-journal-row` between Gratitude and the right-edge.
- `firebase-sync.js`: added `prayersJournal` to `SYNC_STATIC_KEYS` AND extended the `noteJournalKey` handler in `_listenForRemoteChanges` so live re-renders include the prayers modal. The `devo:journal-sync` event listener in `04-passage.js` got a third branch for `prayersJournal` that preserves draft input across re-renders.
- Reused the existing `.grat-modal` / `.grat-list` / `.grat-add` CSS for the Prayers modal via a `.pray-modal` class modifier on the outer wrapper. The gratitude listener checks `.grat-modal:not(.pray-modal)` so cross-modal re-renders don't fire wrong handlers.

**Trade-offs / leftover state**:
- `style.css` still contains all `.soap-*` rules as orphan CSS (~thousands of lines). Harmless dead weight, kept to avoid a sprawling cleanup PR. Can be pruned later if file size becomes a concern.
- Existing `soap_application` / `soap_prayer` entries remain in users' localStorage and RTDB. They're never read or written anymore, so they decay quietly. NOT migrated into `prayersJournal` because (a) the SOAP entries had a different shape (`{id, category, text, passage, time}` vs. the new `{id, ts, text}`) and the user signaled they wanted a fresh start; (b) migrating across categories would have required arbitrary mapping decisions.
- The Prayers journal does NOT carry the verse passage that triggered it — unlike SOAP entries which were always linked to the passage open in Dig Deeper. This is intentional: free-form means free-form, not "respond to verse X". Users who want the verse-attached pattern still have verse Comments (`bibleComments`).

**Modal X-button polish (same day, related fix)**:
The global `.modal-close` (`top: 16px; right: 16px` of `#modalContent`) visually clipped the gratitude/prayers modal's pink corner because the modal pane and the X both sat in the same padding strip. Fixed with a `:has()` rule: `#modalContent:has(.grat-modal) .modal-close` repositions to `top: 18px; right: 18px` and skins the bg pink-tinted (`rgba(219, 39, 119, 0.14)` + matching border) so the button reads as part of the header. The `.grat-modal-header` also got `padding-right: 60px` (52px on mobile) reserved so the title text never runs under the X.

**Files touched**:
- `devo/js/09-soap.js` — deleted.
- `devo/js/04-passage.js` — Dig-Deeper Respond removed; dashboard SOAP section removed; Prayers journal block + dashboard pill added; `devo:journal-sync` listener extended.
- `devo/js/08-story.js` — Dig-Deeper Respond removed (passage-level path).
- `devo/index.html` — `#soapListPanel` + `#soapScreen` panels removed.
- `devo/sw.js` — `DEPLOYMENT_ID` bump + `js/09-soap.js` removed from CORE_ASSETS.
- `devo/firebase-sync.js` — injector list, `SYNC_STATIC_KEYS`, `_mergeSoapEntries`, `noteJournalKey`, `_mergeKeys` SOAP branch all updated; `prayersJournal` added to sync.
- `devo/style.css` — `.grat-modal-header` right padding + `:has(.grat-modal) .modal-close` skin.

---

## 24. Auto-retrying daily-Proverb card (2026-05-05)

**Decision**: Replace the single-attempt + "Couldn't load — try again" failure path on the home-screen Proverb card with an automatic retry loop (up to 6 attempts, exponential backoff capped at ~8s), re-rolling a fresh random Proverbs chapter on every retry. The user-facing "try again" card only renders if the network is genuinely down for the full retry window.

**Why**: Charlie's framing: *"i should never be seeing this in proverbs, it should be always finding one until it finds one. unless internet is really bad"*. The Proverb card is ambient/idle UI — it's the first thing on the home screen, alongside the greeting. Any kind of error chrome reads as "the app is broken" even when the actual cause is a single transient Gemini call (a malformed JSON response, a chapter where the AI picked an out-of-range verse, a rate-limit blip, etc.). Each of those failure modes was already retry-able by clicking the manual button — so the click was redundant work the app should be doing automatically.

**Implementation in `js/04-passage.js` `loadDashProverb`**:
- Replaced the one-shot `try / catch / show error card` with a `for` loop over `MAX_TRIES = 6` attempts.
- **Re-roll every attempt**: each iteration recomputes `randomChapter = Math.floor(Math.random() * 31) + 1` so a single bad chapter pick (e.g. AI returned a verse that's not in the local Bible JSON) doesn't loop forever on the same chapter. Same for the recent-refs / last-topic exclusions — they're recomputed each iteration so a fix-up retry doesn't pick the just-failed verse.
- **Exponential backoff**, capped low (`Math.min(8000, 700 * 1.7^attempt)` ≈ 700ms / 1.2s / 2.0s / 3.4s / 5.8s / 8s). Total budget ~21s across 6 tries — keeps the user on the dashboard for a result rather than burning minutes on a doomed attempt.
- **Offline awareness**: at the top of each iteration, if `navigator.onLine === false`, `await` a one-shot `online` event listener instead of burning retries against guaranteed failures. So when wifi flaps and reconnects, the card resumes immediately.
- **Bail-on-navigate**: each iteration checks `document.getElementById("dashProvCard") === card` before rendering — if the user navigated away (or another `renderDashboard()` call swapped the card frame), the in-flight retry loop returns silently instead of rendering into the wrong card.
- The "Couldn't load — try again" failure card is only rendered after all 6 attempts fail AND the card is still mounted. When it does appear, the manual button still calls `loadDashProverb(true)` which kicks off another full retry loop, so the user gets the same robustness on a manual click.

**Trade-offs**: Slightly more API spend on consistently-failing cells (worst case 6× the call cost of one bad load). Acceptable because (a) Gemini is the cheap path here and (b) the prior single-attempt was producing a visible error chrome on transient failures that should have been a non-event. The exponential backoff also limits total per-load spend on persistent failures.

**Files touched**:
- `devo/js/04-passage.js` — `loadDashProverb` retry loop.

---

## 25. Proverb-ref restyle to match Continue-Reading shimmer (2026-05-05)

**Decision**: Style `.dash-prov-topic` (the verse reference at the top of the daily Proverb card, e.g. "PROVERBS 30:8-9") identically to `.dash-continue-ref` — italic Editor's Note serif, gradient pink fill, clamp-sized, with the `dashRefShimmer` ambient animation under `prefers-reduced-motion: no-preference`.

**Why**: Visual consistency. The home screen has two "verse reference" surfaces — the Continue Reading card and the Proverb card. Before today, they used radically different type treatments: the Continue Reading ref was the big italic serif with the slow gradient shimmer (set up in decision #22), while the Proverb topic was a small uppercase 11px pink eyebrow line. Charlie wanted them to read as siblings: *"basically same css were doing in this dash-continue-ref"*.

**Trade-off**: The Proverb header is slightly busier now because the title is bigger and shimmers — but it's still constrained to the small Proverb card and the shimmer cycles slowly (5s alternate), so it doesn't compete with the Continue Reading shimmer above it. The two shimmers are out of phase by definition since they animate independently.

**Files touched**:
- `devo/style.css` — `.dash-prov-topic` rule rewritten with the gradient + clamp + italic serif; the existing `@keyframes dashRefShimmer` block was extended to apply to both selectors (`.dash-continue-ref, .dash-prov-topic`).

