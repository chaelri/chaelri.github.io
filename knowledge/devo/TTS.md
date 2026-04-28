# Devo TTS — Architecture

**Last major rewrite:** 2026-04-28 (Edge TTS swap + canvas listen mode).

The TTS subsystem reads Bible passages aloud with word-level highlighting and lock-screen media controls. Synthesis happens on Microsoft's free "Edge Read Aloud" WebSocket, relayed through `gemini-proxy/`. Audio + Edge `WordBoundary` timings come back as JSON; client caches MP3 blobs in IndexedDB so re-listening within 3 days is offline-instant.

Two front-end modes:
- **Immersive overlay** (`#ttsImmersive`) — full-screen, with intro screen, scrubber, pause panel, auto-reflection.
- **Canvas mode** — playback while the user keeps drawing/highlighting; sticky mini-player at bottom-center, marching-ants dotted border around the current verse, soft pink wash on the current word.

## Files

| File | Role |
|---|---|
| `devo/js/03-tts.js` | All TTS logic — synthesis, queue, playback, word highlight, canvas controller, Media Session |
| `devo/js/07-immersive.js` | Immersive overlay UI (open/close, scrubber, reflection panel) |
| `devo/js/01-core.js` | IDB cache (`_TTS_STORE`, `_getTtsAudio`, `_saveTtsAudio`) — 3-day TTL |
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

`ttsSynthesize(text)` (03-tts.js):

1. Compute cache key `${TTS_VOICE.name}|${text}`.
2. Try `_getTtsAudio(cacheKey)` — instant return on hit; `_edgeToClientShape(blob, timings)` builds `{ url, timepoints, words }` from the cached MP3 + Edge WordBoundary array.
3. On miss, acquire a slot from the **10-runner semaphore** (`_synthSem`). Wait if 10 in flight already.
4. POST to `${GEMINI_PROXY}/edge-tts` with `{ text, voice }`.
5. On 200, decode base64 → Blob, fire-and-forget `_saveTtsAudio(cacheKey, blob, timings)`, return shape.
6. Retry up to 5× with exponential backoff (600ms base, 2s for rate-limit, max 12s).

### Proxy → Microsoft

`POST /edge-tts` (gemini-proxy/index.js):

1. Validate body (`text` required, ≤5000 chars).
2. Open `MsEdgeTTS` WebSocket, `setMetadata(voice, AUDIO_24KHZ_48KBITRATE_MONO_MP3, { wordBoundaryEnabled: true })`.
3. `tts.toStream(text)` → `{ audioStream, metadataStream }`.
4. `_consumeEdgeMetadata` parses each JSON metadata chunk into `{ word, start, duration }` (seconds, converted from Microsoft's 100ns ticks).
5. `Promise.all([audioDone, metaDone])` — audio bytes concatenated to a Buffer.
6. Return `{ audioBase64, timings }`. Always `tts.close()` in `finally`.

Cost: free-tier Cloud Run covers ~800 chapters/month for one user; Microsoft eats the synthesis cost.

## Background prefetch (3-day cache)

`_ttsPrefetchChapter()` (03-tts.js) runs at the end of `loadPassage()` (04-passage.js):

1. Reads `window.__aiPayload.versesText`, splits on newlines.
2. For each verse, strips the `"<n>. "` prefix and (for v1) prepends `"<Book> <Chapter>. "`.
3. Fires `ttsSynthesize(text).catch(() => {})` for every verse — fire-and-forget.

The 10-slot semaphore in `ttsSynthesize` caps in-flight count; cache hits are instant IDB reads. Spam-flipping 10 chapters queues ~300 calls that drain in the background. **3-day TTL** (`_TTS_MAX_AGE` in 01-core.js) keeps the IDB store from bloating; entries past 3d are purged on startup.

IndexedDB schema (`devo-cache` DB, version 6):
```js
// _TTS_STORE = "tts"
{ key: "en-US-BrianNeural|<text>", blob: Blob, timings: [{word, start, duration}, ...], time: <ms> }
```

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
- ✕ `#cmListenStopBtn` → `stopTTS()`
- Verse counter `<cur>/<total>` rendered as three styled spans with `font-feature-settings: "frac" 0` so SF Mono doesn't auto-format `29/36` as a vulgar fraction.

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

## Constants

```js
GEMINI_PROXY = "https://gemini-proxy-668755364170.asia-southeast1.run.app"  // 01-core.js
TTS_VOICE = { name: "en-US-BrianNeural" }                                   // 03-tts.js
EDGE_DEFAULT_VOICE = "en-US-BrianNeural"                                    // gemini-proxy/index.js
_synthSem = { active: 0, max: 10, queue: [] }                               // 03-tts.js
_TTS_MAX_AGE = 3 * 24 * 60 * 60 * 1000                                      // 01-core.js
_IMG_DB_VER = 6                                                             // 01-core.js
_CM_TTS_FOLLOW_KEY = "devo.cmTtsAutoFollow"                                 // 03-tts.js
```

## Why Edge TTS, not Google Cloud TTS?

- ~10× faster synthesis (~150-300ms vs. ~2s per verse for Journey-D).
- Microsoft's "Read Aloud" endpoint is free; no API key on the client.
- Real `WordBoundary` timings come back with the audio — no need for the synthetic-timing heuristic except as a fallback.
- Cloud Run free tier easily covers ~800 chapters/month for one user; the proxy is just a WebSocket relay.

Trade-off: `msedge-tts` uses Microsoft's undocumented internal endpoint. If MS revokes the anonymous trusted token, we'd need to switch to a paid TTS path. Not load-bearing for the personal-use scope.
