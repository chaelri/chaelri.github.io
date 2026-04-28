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
