## Overview

> **Note (2026-04-27 split):** Line numbers reference the original monolithic `devo/script.js`. The TTS code now lives in `devo/js/03-tts.js` (synthesis, queue, playback, word highlight) and `devo/js/07-immersive.js` (immersive overlay). See [`KEY_FILES.md`](KEY_FILES.md) for the full map.

Google Cloud Text-to-Speech with voice `en-US-Journey-D`, server-synthesized via the Gemini proxy at `https://gemini-proxy-668755364170.asia-southeast1.run.app`. The app synthesizes at request time (no pre-generated cache) and manages playback with word-level highlighting, immersive fullscreen mode, and a persistent player bar.

## Verse-to-Audio Flow

### 1. Synthesis Entry Points
**`ttySynthesize(text, retries=10)` (lines 996–1039)**
- Calls Google Cloud TTS REST API directly at `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`
- Requires `window.GOOGLE_TTS_KEY` or `localStorage.getItem("googleTtsKey")`
- Request payload:
  ```json
  {
    "input": { "text": "..." },
    "voice": { /* TTS_VOICE constant */ },
    "audioConfig": { "audioEncoding": "MP3" }
  }
  ```
- Response: `{ audioContent: "<base64 MP3>" }`
- Converts base64 to Uint8Array, creates Blob, returns object URL: `{ url, timepoints: [], words }`
- Retries with exponential backoff (800ms base, 3s for rate-limit; max 30s delay, 1.5s jitter)
- Errors: throws for auth/no-key; retries for network/rate-limit

### 2. Playback State Machine
**Global vars (line 1049–1050)**
- `let ttsQueue = []` — array of `{el, verseNum, text, ttsText, url, ready, timepoints, words, prefixWordCount}`
- `let ttsIdx = -1` — current verse index
- `let ttsPaused = false` — pause state
- `let ttsGen = 0` — generation token to discard stale callbacks
- `let ttsAudio = null` — HTMLAudioElement
- `let _ttsReadyCount = 0` — synthesis progress tracker

**Queue Building (lines 1088–1120)**
- `ttsBuildQueue()` extracts verses from DOM (line 1068; uses `window.__aiPayload?.versesText`)
- Prepends chapter title if multi-verse (line 1095–1096)
- Calculates verse range label for UI

### 3. Semaphore-Based Synthesis Control
**Lines 825–839**
- `_synthAcquire()` — wait for synthesis slot (max concurrent via `_synthSem.max`, queued resolvers in `_synthSem.queue`)
- `_synthRelease()` — free slot, dequeue next waiter
- `_synthReset()` — clear semaphore on TTS abort

**On-Demand Synthesis Loop (lines 843–871)**
- `_ttsSynthItem(item, gen)` — synthesizes if not already `item.ready`; returns promise
- `_ttsPrepareLookahead(index, gen)` — synthesizes current + 2 ahead (line 842: `TTS_LOOKAHEAD = 2`)
- Caches result in `item.url`, `item.timepoints`, `item.words`
- Updates progress bar live: `_ttsReadyCount / ttsQueue.length`

## Word-Level Highlighting

### 1. Timepoint Computation
**`_computeSyntheticTimepoints(words, duration)` (lines 907–936)**
- If TTS provider returns real timing marks, use them; else synthesize pseudo-timings
- Each word weighted by letter count + punctuation "silence" (period = 3.2, comma = 1.5, etc.)
- Allocate duration proportionally: 1.5% lead-in, 96.5% across words
- Returns `[{ timeSeconds: 0.0 }, { timeSeconds: 0.5 }, ...]`

### 2. Highlighting Runtime
**`_startWordHighlight(audio, item)` (lines 938–990)**
- Injects word spans into `.verse-content`: `<span class="tts-word" data-idx="0">word</span>`
- Restores original on stop (via `_originalHTML` backup)
- If timepoints missing, calls `_computeSyntheticTimepoints()` on `loadedmetadata`
- RAF loop ticks on `audio.currentTime`, matches against `timepoints[i].timeSeconds`
- Toggles `tts-word-active` class and `tts-imm-word-active` (immersive mode)
- Accounts for chapter-title prefix: displays word index adjusted by `item.prefixWordCount`

**`_stopWordHighlight()` (lines 992–994)**
- Cancels RAF, clears highlights

### 3. HTML Structure
**Verse DOM (lines 2700–2719)**
```html
<div id="<verse_num>" class="verse-header">
  <div class="verse-content">
    <span class="verse-num">1</span>Text...
    <span class="verse-meta-indicators">...</span>
  </div>
</div>
<div class="verse-actions">
  <button data-action="context">...</button>
  <button data-action="ask">...</button>
  <button data-action="note">...</button>
</div>
```

## Player Bar UI

**Element: `#ttsPlayer` (line 355 in index.html)**
- Classes: `tts-player` (hidden by default)
- State classes: `tts-ready`, `tts-buffering` (added/removed during synthesis/playback)

**Status Display (line 1166, 1194, 1261)**
- `ttsSetStatus(text)` — updates `#ttsPlayerStatus`
- Format: `"🎵 <verse_num> / <queue_length>"` or `"⏸ Verse <verse_num>"`

**Playback Controls (lines 1244–1327)**
- `pauseResumeTTS()` — toggle `ttsPaused`, pause/resume `ttsAudio`, update icon
- `ttsPrevVerse()` / `ttsNextVerse()` — bounds-check, call `ttsPlayAt(index, gen)`
- `ttsPlayAt(index, gen)` — core playback: sets `ttsIdx`, updates UI, awaits `_ttsPrepareLookahead()`, plays `ttsAudio`

**Stopping (line 1337–1351)**
- `stopTTS()` — clears queue, hides player, resets highlight

## Immersive TTS Overlay

**Element: `#ttsImmersive` (line 376 in index.html)**

### Opening
**`ttsImmersiveOpen()` (lines 5327–5374)**
- Shows `#ttsImmersive`, hides reflection panel
- Sets passage title in `#ttsImmTitle`
- Resets load bar `#ttsImmLoadBar` to 0%
- Wires button clicks: prev/next/pause/close
- Builds scrubber dots from queue length

**`_loadTtsImmersiveBg(bookName, ch)` (lines 5376–5396)**
- Calls `callImageGen()` asynchronously (currently disabled in code: line 181)
- Renders background image with fade-in transition

### UI Components
- `#ttsImmTitle` — passage label (e.g., "John 3")
- `#ttsImmLoadBar` — progress bar (`width: N%`)
- `#ttsImmStatusEl` — status text (e.g., "Preparing…")
- `#ttsImmSlotPrev`, `#ttsImmSlotCur`, `#ttsImmSlotNext` — prev/current/next verse slots
- `#ttsImmPrevBtn`, `#ttsImmNextBtn`, `#ttsImmPauseBtn`, `#ttsImmCloseBtn` — control buttons
- `#ttsImmCurText` — current verse text (contains `.tts-imm-word` spans for highlighting)
- `#ttsImmReflPanel` — reflection questions panel (hidden initially, shown post-playback)
- `#ttsImmContextPanel` — background context (hidden during playback)
- `.tts-imm-stage` and `.tts-imm-footer` — layout sections toggled for panels

### Closing
**`ttsImmersiveClose()` (lines 5398–5432)**
- Hides `#ttsImmersive`
- Resets all panel visibility, button disabled states
- Clears double-tap state and auto-reflection timer

### Scrubber / Verse Navigation
**`ttsImmersiveBuildScrubber()` (lines 5524–5539)**
- Creates dots (one per verse in queue)
- Divs with class `tts-imm-scrub-dot`, data-idx
- Clickable to jump to verse

**`ttsImmersiveUpdate(index)` (lines 5540–5627)**
- Updates active scrubber dot
- Disables prev/next buttons at boundaries
- Renders prev/cur/next verse text snapshots

### Double-Tap to Favorite
**Lines 5367–5371**
- `#ttsImmSlotCur` double-click toggles favorite
- `_immHandleDoubleTap()` — tracks taps, calls `toggleFavorite(key)`

## Web Audio Context

**Audio Element Lifecycle**
- `ttsAudio` created fresh per playback session
- `play()` → `_startWordHighlight()` begins RAF loop
- `pause()` → RAF cancels, but audio is not destroyed
- `currentTime` used for word sync (no custom AudioContext; native HTML5 audio)

**No explicit Web Audio API:**
- Uses `<audio>` element's native playback
- `HTMLAudioElement.play()`, `.pause()`, `.currentTime`, duration properties
- Object URLs (from Blob) as `src`

## Error Handling
- Auth errors (401/403) → throw immediately, stop retries
- Rate-limit (429) → exponential backoff up to 30s
- Network errors → backoff, max 10 attempts
- Synthesis timeout → falls back to synthetic timepoints if provider fails

## Storage & Caching
- **IndexedDB**: Image cache (`_IMG_DB_NAME = "devo-cache"`, v3; 7-day TTL)
- **localStorage**: No TTS cache; verses synthesized on demand each session
- **Firebase**: No TTS data synced (only settings and notes)

## Constants
- `GEMINI_PROXY = 'https://gemini-proxy-668755364170.asia-southeast1.run.app'` (line 16)
- `TTS_VOICE` — expected to be defined in config or inline (unknown — verify before relying)
- `TTS_LOOKAHEAD = 2` (line 842)
