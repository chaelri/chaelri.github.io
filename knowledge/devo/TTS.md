# Devo TTS — Architecture

**Last major rewrite:** 2026-04-28 (Edge TTS swap + canvas listen mode + Audio Library + multi-meta cache).

The TTS subsystem reads Bible passages aloud with word-level highlighting and lock-screen media controls. Synthesis happens on Microsoft's free "Edge Read Aloud" WebSocket, relayed through `gemini-proxy/`. Audio + Edge `WordBoundary` timings come back as JSON; client caches MP3 blobs in IndexedDB **permanently** (no TTL) so a downloaded chapter stays on the device.

Two front-end modes:
- **Immersive overlay** (`#ttsImmersive`) — full-screen, with intro screen, scrubber, pause panel, auto-reflection.
- **Canvas mode** — playback while the user keeps drawing/highlighting; sticky mini-player at bottom-center, marching-ants dotted border around the current verse, soft pink wash on the current word.

## Files

| File | Role |
|---|---|
| `devo/js/03-tts.js` | All TTS logic — synthesis, queue, playback, word highlight, canvas controller, Media Session |
| `devo/js/07-immersive.js` | Immersive overlay UI (open/close, scrubber, reflection panel) |
| `devo/js/01-core.js` | IDB cache (`_TTS_STORE`, `_getTtsAudio`, `_saveTtsAudio`, `_deleteTtsAudio`, `_entryMetas`, `_metasInclude`) — permanent (no TTL) |
| `devo/js/04-passage.js` | Calls `_ttsPrefetchChapter()` after `loadPassage()` finishes |
| `devo/js/10-creator-canvas.js` | Wires the canvas Listen button + verse-num jump + close-canvas-stops-TTS |
| `gemini-proxy/index.js` | `POST /edge-tts` — wraps `msedge-tts` Node WebSocket, returns `{ audioBase64, timings }` |
| `gemini-proxy/package.json` | Adds `msedge-tts ^2.0.5` dep |

## Voice

```js
const TTS_VOICE = { name: "en-US-BrianNeural" };
```

Default voice on both client and proxy. The proxy accepts an optional `voice` field on the request body if we ever want to A/B another Edge voice (e.g. `en-US-AndrewNeural`, `en-US-AriaNeural`).

## Synthesis pipeline

### Client → Proxy

`ttsSynthesize(text, retries = 5, meta)` (03-tts.js):

1. Compute cache key `${TTS_VOICE.name}|${text}`.
2. Try `_getTtsAudio(cacheKey)` — instant return on hit. If hit, also call `_saveTtsAudio` to **append** the current call's meta (`{book, chapter, verseNum}`) to the entry's `metas[]` array (multi-meta — see below). `_edgeToClientShape(blob, timings)` builds `{ url, timepoints, words }` from the cached MP3 + Edge WordBoundary array.
3. **Dedupe** — check `_inflight` Map for an in-flight promise on this cache key. If present, await it and register meta after — no semaphore acquire. Without this dedupe, the Audio Library poller's 1.5s retry tick re-queued the same texts faster than they drained, growing the queue to >100k entries.
4. On miss + lead caller, acquire a slot from the **10-runner semaphore** (`_synthSem`). Wait if 10 in flight already.
5. POST to `${GEMINI_PROXY}/edge-tts` with `{ text, voice }`.
6. On 200, decode base64 → Blob, fire-and-forget `_saveTtsAudio(cacheKey, blob, timings, meta)`, return shape.
7. Retry up to 5× with exponential backoff (600ms base, 2s for rate-limit, max 12s).
8. After flight resolves (success or fail), `_inflight.delete(cacheKey)` so future calls re-enter the cache check.

### Proxy → Microsoft

`POST /edge-tts` (gemini-proxy/index.js):

1. Validate body (`text` required, ≤5000 chars).
2. Open `MsEdgeTTS` WebSocket, `setMetadata(voice, AUDIO_24KHZ_48KBITRATE_MONO_MP3, { wordBoundaryEnabled: true })`.
3. `tts.toStream(text)` → `{ audioStream, metadataStream }`.
4. `_consumeEdgeMetadata` parses each JSON metadata chunk into `{ word, start, duration }` (seconds, converted from Microsoft's 100ns ticks).
5. `Promise.all([audioDone, metaDone])` — audio bytes concatenated to a Buffer.
6. Return `{ audioBase64, timings }`. Always `tts.close()` in `finally`.

Cost: free-tier Cloud Run covers ~800 chapters/month for one user; Microsoft eats the synthesis cost.

## Background prefetch (permanent cache)

`_ttsPrefetchChapter()` (03-tts.js) runs at the end of `loadPassage()` (04-passage.js):

1. Reads `window.__aiPayload.versesText`, splits on newlines.
2. For each verse, strips the `"<n>. "` prefix and (for v1) prepends `"<Book> <Chapter>. "`.
3. Fires `ttsSynthesize(text, 5, meta).catch(() => {})` for every verse — fire-and-forget. `meta = { book, chapter, verseNum }` is required so the entry shows up in the Audio Library metadata index.

The 10-slot semaphore + per-cache-key dedupe in `ttsSynthesize` cap in-flight count and prevent duplicate queue growth. Cache hits are instant IDB reads (and append meta if missing). **No TTL** — `_TTS_MAX_AGE = Infinity`, the startup purge in `_purgeExpiredCache` is a no-op for the TTS store. Once a verse is downloaded for a device, it stays cached until the user clears site data.

After firing the current chapter, `_ttsPrefetchChapter` schedules a 4-second-delayed call to `_ttsPrefetchSpecific(_nextChapterRef())` so the *next* chapter is also queued in the background. The delay lets the foreground (current) chapter win synth slots first; the next chapter then fills behind it. Result: when auto-advance fires (or the user manually flips), audio is already cached → silent transition.

### Multi-meta IDB schema

Many Bible verses share **identical text** — e.g. "Now the Lord spoke to Moses, saying," appears at Exodus 6:10, 14:1, 31:1, 31:12 (and dozens more across the Pentateuch). Cache key is `voice|text`, so all four hit the same IDB record. The original schema stored a single `{book, chapter, verseNum}` on the entry — every save **overwrote** the previous verse's meta, making the prior verse "disappear" from the Audio Library counter. Charlie called this the "biglang nawawala" / "nirereplace-an" bug.

Fix: track metas as an **array**.

IndexedDB schema (`devo-cache` DB, version 7):
```js
// _TTS_STORE = "tts"
{
  key: "en-US-BrianNeural|<text>",
  blob: Blob,
  timings: [{word, start, duration}, ...],
  time: <ms>,
  metas: [
    { book: "EXO", chapter: "6",  verseNum: "10" },
    { book: "EXO", chapter: "14", verseNum: "1"  },
    { book: "EXO", chapter: "31", verseNum: "1"  },
    { book: "EXO", chapter: "31", verseNum: "12" },
  ],
  // Top-level book/chapter/verseNum mirror metas[0] for legacy code paths
  // and DevTools inspection. metas[] is the source of truth.
  book: "EXO" | null,
  chapter: "6" | null,
  verseNum: "10" | null,
}
```

`_saveTtsAudio` runs the read+merge+write inside a single readwrite transaction (IDB serializes overlapping readwrites on the same store), so two parallel saves for the same key both end up in the metas array. `_metasInclude(metas, meta)` deduplicates appends — calling save with an already-present meta is a no-op. Legacy entries (single top-level meta, no metas array) are auto-promoted on read via `_entryMetas`.

`_listTtsAudioEntries()` (01-core.js) returns `getAll()` of the store. Consumers (`_renderAudioLibrary`, the per-book poll counter) iterate `_entryMetas(e)` so every verse pointing at a shared audio shows up in the index.

## Word-level highlighting

Real Edge `WordBoundary` timings drive the highlight RAF loop. `item.words` is Edge's tokenization (skips pure-punctuation tokens), `item.timepoints` is `[{ timeSeconds }]` for each token, `item.prefixWordCount` is the count of leading prefix words for verse 1 ("Genesis 1." → 2 tokens).

`_startWordHighlight(audio, item)`:
- Finds active timing index `wi` where `pts[i].timeSeconds <= audio.currentTime`.
- `displayIdx = wi - prefixWordCount` — verse-relative index for rendered spans.
- Toggles class on three span sets:
  - `#output .verse .tts-word` (main view) — by `displayIdx`
  - `#ttsImmCurText .tts-imm-word` (immersive) — by `displayIdx`
  - `#cmPassage .cm-word[data-verse="<n>"]` (canvas) — by `displayIdx`, list cached once per verse change

`_injectWordSpans(item)` slices off the prefix words before rendering, so the chapter-title prefix never appears in the verse-content. Synthetic timings (`_computeSyntheticTimepoints`) are still the fallback when a cached entry has empty timings.

## Canvas listen mode (`_ttsInCanvas` flag)

Entry point: `playChapterInCanvas(startVerse?)` (03-tts.js).

Diff vs. `playChapter()`:
- Skips `ttsImmContextOpen()` (no immersive intro screen — would cover the canvas).
- Adds `body.tts-canvas-active` (gates the sticky mini-player + marching-ants CSS).
- Sets `_ttsInCanvas = true`.
- `ttsFinish()` short-circuits the immersive continue-prompt when `_ttsInCanvas`.

### Sticky mini-player (`#cmListenBar`)

Positioned `fixed; bottom: 18px; left: 50%`. Visibility gated entirely by `body.tts-canvas-active`. Buttons:

- ⏮ `#cmListenPrevBtn` → `ttsPrevVerse()`
- ⏯ `#cmListenPauseBtn` → `pauseResumeTTS()` (icon flips between `pause` / `play_arrow` via `_cmListenBarUpdate()`)
- ⏭ `#cmListenNextBtn` → `ttsNextVerse()`
- 🔒 `#cmListenFollowBtn` → `cmTtsToggleAutoFollow()` (auto-scroll lock; persisted to `localStorage.devo.cmTtsAutoFollow`, default ON)
- 🔁 `#cmListenAutoBtn` → `cmTtsToggleAutoAdvance()` (auto-advance to next chapter at end; persisted to `localStorage.devo.cmTtsAutoAdvance`, default OFF)
- ✕ `#cmListenStopBtn` → `stopTTS()`
- Verse counter `<cur>/<total>` rendered as three styled spans with `font-feature-settings: "frac" 0` so SF Mono doesn't auto-format `29/36` as a vulgar fraction.

Auto-advance handler `_ttsCanvasAutoAdvance()` updates `bookEl`/`chapterEl` to next chapter ref, calls `loadPassage()`, then `window._cmReload()` to rerender canvas, then `playChapterInCanvas()` to resume. Wraps to next book; bails at end of Bible.

### Auto-scroll

`_cmTtsScrollToCurrent()` finds the `.cm-verse` containing the active word and `scrollIntoView({ block: "center", behavior: "smooth" })`. Called from `ttsPlayAt` after each verse change AND from a `visibilitychange` listener (so the canvas snaps back to the playing verse when the user reopens the phone).

### Visual emphasis

Two cues on the current verse, with the verse-level cue gated by lock state:

1. **Soft pink wash on the current word** — `.cm-word.cm-word-tts-active`: `background: rgba(190,24,93,0.20)`, dark text stays. No color flip = no per-word strobing. Always on while playing.
2. **Dim inactive verses (auto-follow ON only)** — when `body.tts-canvas-follow` is set, every `.cm-verse:not(.cm-verse-tts-active)` fades to `opacity: 0.35`. The active verse stays at full opacity. No border, no padding bump → all verses keep identical layout, only brightness changes. When auto-follow is unlocked, the dim releases everywhere so free-scrolling reads naturally.

`_cmMarkActiveVerse(verseNum)` toggles the `.cm-verse-tts-active` class on the current verse — that's the hook the `:not()` selector uses for the dim. The body class is added in `playChapterInCanvas` (when `_cmTtsAutoFollow` is on) and toggled by `cmTtsToggleAutoFollow`.

(Earlier iterations: marching-ants SVG border with stroke-dashoffset animation, plus a 20×24 padding bump on the active verse so text "looks deeper". Pulled because it caused layout shifts on neighbors and the bordered box never aligned cleanly with inactive verses' padding. The dim approach keeps every verse at identical layout — strictly opacity emphasis.)

## Lock-screen / background playback

Media Session API integration so iOS/Android keep audio alive when the screen locks:

```js
function _setupMediaSession() {  // wired once on first play
  navigator.mediaSession.setActionHandler("play", ...)
  navigator.mediaSession.setActionHandler("pause", ...)
  navigator.mediaSession.setActionHandler("previoustrack", () => ttsPrevVerse())
  navigator.mediaSession.setActionHandler("nexttrack",     () => ttsNextVerse())
}

function _updateMediaSession(item) {  // called per verse
  navigator.mediaSession.metadata = new MediaMetadata({
    title: `<bookName> <ch>:<verseNum>`,
    artist: "Devotion",
    album: `<bookName> <ch>`,
  });
  navigator.mediaSession.playbackState = ttsPaused ? "paused" : "playing";
}
```

Lock-screen card shows the current verse + ◀◀ ▶ ▶▶ controls; headphone buttons work; pause/play state syncs into the in-app bar via `_cmListenBarUpdate()`.

Cleared in `_ttsCleanupMode()` (sets metadata = null, playbackState = "none").

## Canvas top-bar nav

Inside the canvas overlay, the user can switch passages without exiting:
- **‹ / ›** chevrons flanking the big italic passage title — proxy to legacy `#prevChapterBtn` / `#nextChapterBtn` clicks; canvas content rerenders via `window._cmReload`.
- **Tappable topbar title** — opens `window._openBookPicker()`. The book/chapter picker `.bc-sheet` was bumped to `z-index: 10200` so it sits above `.cm-overlay` (10050) and the listen bar (10080).

After any passage swap, `loadBtn.onclick` wrapper calls `window._cmReload?.()` so the canvas paper re-renders the new chapter.

## Audio Library panel

Modal `#audioLibraryModal` rendered by `_renderAudioLibrary(expandBook?)` (03-tts.js). Lives at `z-index: 10300` — above canvas overlay (10050), listen bar (10080), book picker (10200). Entry points: dashboard button `#dashAudioLibBtn`, top-bar button `#mtAudioLibBtn` (next to the Listen action), canvas top-bar `#cmAudioLibBtn`, and an overflow-sheet entry `#mtAudioLib`.

### Theme

Light cream/pink panel matching the rest of the modal — Activity section uses a faint pink wash (`rgba(190,24,93,0.04)`), pink accent icon, dark text. Earlier dark-navy "console" look was pulled because it broke from the rest of the surface. Log row colors:
- `started` → pink `#be185d`
- `success` → forest green `#15803d`
- `retry` → amber `#b45309` on soft amber wash
- `fail` → crimson `#b91c1c` on soft red wash
- Cache hits are filtered out entirely (toggle removed — the user found them spammy and not actionable).

### Render

Reads `_listTtsAudioEntries()` and iterates `_entryMetas(e)` so each entry contributes ONE Set add per `verseNum` (multi-meta expansion). Groups into `byBook[bookKey][chapter] = { verses: Set<verseNum>, oldest: ms }`.

- Header summary: "X of Y chapters cached" (no TTL text — cache is permanent).
- One row per book (66 books in BIBLE_META order). Tap to expand — accordion: only one open at a time, tapping the open book closes it.
- Expanded book detail:
  - Chapter grid (`auto-fill, minmax(34px, 1fr)`). Each cell is a button.
    - `data-status="cached"` — full (all expected verses present): solid pink.
    - `data-status="partial"` — some verses cached: pink tint.
    - `data-status="none"` — no entry: white/grey.
    - (No `expiring` state — no TTL.)
    - Hover scales 1.06; click navigates the app to that chapter and closes the modal.
  - **Download all chapters** button (`.audio-lib-book-dl`). Disabled when book is fully cached ("All chapters cached" pill) or already downloading.

### `expandBook` sentinel semantics

`_renderAudioLibrary(expandBook)`:
- `undefined` → preserve user's current expansion (re-infer from the live DOM). Used by background re-renders so polling doesn't yank the user's panel to a different book mid-download.
- `null` → collapse all (toggle-close path).
- `"<book>"` → expand that book (Download click, manual toggle-open).

### Per-book bulk download

`_audioLibPollers` is a `Map<bookKey, intervalId>`. Each book's bulk download owns its own poller; closing the modal does NOT clear them, so downloads keep ticking in the background. Multiple books can download concurrently — they share the global 10-slot synth semaphore but neither cancels the other. Poller self-cleans when the book completes or hits the 10-min cap.

Click handler:
1. `_downloadingBooks.has(book)` gate bounces duplicate clicks on the same book.
2. `fireAllChapters()` fires `_ttsPrefetchSpecific({book, chapter: i})` for every chapter (1..N). Cache hits are no-ops; only the missing verses queue.
3. `setInterval(poll, 1500)` registered in `_audioLibPollers`.

Each poll:
- `_listTtsAudioEntries()` → expand metas → group by chapter → count verses present.
- If `done` (all chapters at expected verse counts): clear poller, drop from `_downloadingBooks`.
- Else: `fireIncompleteChapters(grouped)` (see below).
- `_renderAudioLibrary()` only if modal is open (no DOM work for hidden modal).

### Targeted retry + stuck detection

`fireIncompleteChapters(grouped)`:
1. For each chapter where `have.size < expected`, compute the **set of missing verseNums** (`expected - have`).
2. Fire `_ttsPrefetchSpecific({book, chapter: i}, missing)` — the second arg is a Set filter so only the missing verses' synths are queued. Saves ~37× cache reads vs re-firing the whole chapter.
3. Track stuck rounds in a `Map<chapter, {signature, rounds}>`. If the same missing set persists for >2 polls (~3s), log `[devo-tts] STUCK <book> <ch>` so the user can see exactly what's failing. (Earlier the polling silently looped; now it surfaces.)

`_ttsPrefetchSpecific(ref, onlyVerseNums?)`:
- Reads `bibleData[BOOK_NAME][chapter]` directly (independent of which chapter is currently rendered).
- Normalizes verse text the same way `loadPassage:1167` does so cache keys align across all paths: `.trim().replace(/([.,!?])(?=[a-zA-Z0-9])/g, "$1 ").replace(/\s+/g, " ")`. **Important:** `'` (curly apostrophe) is NOT in the punct class — earlier it was, which mangled `Aaron's` into `Aaron' s`, sending malformed text to TTS and producing a different cache key than the loadPassage path expected. Fixed in two places: `_ttsPrefetchSpecific` and `loadPassage:1167`.
- Prepends chapter title only when `verseNum === "1"` (not on `i === 0` of the filtered list — when retrying a mid-chapter verse, the prefix would otherwise produce a wrong cache key).
- Queues each verse through `ttsSynthesize(speak, 5, meta)`.

### Activity panel

Live tick at 500ms (only while the modal is open). Two pieces:
- **Queue badge** — `${_synthSem.active} downloading • ${_synthSem.queue.length} waiting`. Shows "idle" when both are 0. Pink pill when busy.
- **Log scroll** — last 120 events from `_ttsLog` (in-memory ring buffer). Cache hits filtered out in the render.

## Constants

```js
GEMINI_PROXY = "https://gemini-proxy-668755364170.asia-southeast1.run.app"  // 01-core.js
TTS_VOICE = { name: "en-US-BrianNeural" }                                   // 03-tts.js
EDGE_DEFAULT_VOICE = "en-US-BrianNeural"                                    // gemini-proxy/index.js
_synthSem = { active: 0, max: 10, queue: [] }                               // 03-tts.js
_inflight = new Map()                       // cacheKey -> Promise; dedupes concurrent synths
_TTS_MAX_AGE = Infinity                                                     // 01-core.js — no expiry
_IMG_DB_VER = 7                                                             // 01-core.js
_CM_TTS_FOLLOW_KEY = "devo.cmTtsAutoFollow"                                 // 03-tts.js
_audioLibPollers = new Map()  // bookKey -> intervalId; per-book bulk download polls
```

## Why Edge TTS, not Google Cloud TTS?

- ~10× faster synthesis (~150-300ms vs. ~2s per verse for Journey-D).
- Microsoft's "Read Aloud" endpoint is free; no API key on the client.
- Real `WordBoundary` timings come back with the audio — no need for the synthetic-timing heuristic except as a fallback.
- Cloud Run free tier easily covers ~800 chapters/month for one user; the proxy is just a WebSocket relay.

Trade-off: `msedge-tts` uses Microsoft's undocumented internal endpoint. If MS revokes the anonymous trusted token, we'd need to switch to a paid TTS path. Not load-bearing for the personal-use scope.
