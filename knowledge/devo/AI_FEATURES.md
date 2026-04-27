## Overview

> **Note (2026-04-27 split):** Line numbers reference the original monolithic `devo/script.js`. AI helpers (`callGemini`, `callGeminiStream`, `_typeOut`, `mdToHTML`, image cache) now live in `devo/js/01-core.js`; reflection/chat/passage logic lives in `devo/js/04-passage.js`; story-related AI fetches live in `devo/js/08-story.js`. See [`KEY_FILES.md`](KEY_FILES.md) for the full map.

The app integrates with Gemini API via a Cloud Run proxy at `https://gemini-proxy-668755364170.asia-southeast1.run.app`. All AI calls funnel through two patterns: **synchronous full-response** (`callGemini()`) and **client-side progressive reveal** (`callGeminiStream()` → `_typeOut()`). Image generation is currently disabled (line 181).

**Proxy URL constant:** `GEMINI_PROXY = 'https://gemini-proxy-668755364170.asia-southeast1.run.app'` (line 16)

## Core API Patterns

### 1. Non-Streaming: `callGemini(prompt)` (lines 29–38)
**Request:**
```
POST https://gemini-proxy-668755364170.asia-southeast1.run.app
Content-Type: application/json

{
  "task": "summary",
  "contents": [{ "parts": [{ "text": "<prompt>" }] }]
}
```

**Response shape:**
```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          { "text": "response body..." }
        ]
      }
    }
  ]
}
```
- Extracted as `data?.candidates?.[0]?.content?.parts?.[0]?.text || ''`
- Throws if `!res.ok` with message `"Gemini proxy error: ${res.status}"`

### 2. Client-Side Streaming: `callGeminiStream(prompt, onChunk)` (lines 49–62)
- **Not true SSE.** Fetches full response via `callGemini()`, then reveals via `_typeOut()`
- Calls `onChunk(delta, full)` for every 16ms tick: `delta` = new chars, `full` = accumulation
- Returns promise resolving with full text

**`_typeOut(text, onChunk)` (lines 65–78)**
- Reveals ~4 chars per 16ms tick (≈240 chars/sec)
- Calls `onChunk(text.slice(i - take, i), text.slice(0, i))` for each batch
- Used to simulate "typing" in response areas

## AI Feature Matrix

| Feature | Function | Lines | Method | Prompt | Rendering |
|---------|----------|-------|--------|--------|-----------|
| Quick Context (verse) | `fetchInlineQuickContext()` | 1542–1597 | `callGemini()` | "Explain in 2-3 sentences" | Inline card |
| Verse Chat | `toggleVerseChat()` | 1600–1850+ | Dual: suggestions + stream | Multi-turn | History + chips |
| Context Summary | `renderAIContextSummary()` | 2967–3056 | Dual: quick + full stream | Structured | Dual-card scaffold |
| Reflection Questions | `renderAIReflectionQuestions()` | 3102–3280 | `fetch()` → proxy | RAW HTML output | Direct DOM |
| Reflection Smart Retry | `_smartRetryReflections()` | 04-passage.js | `_fetchReflectionLis(count, excludeQuestions)` | Partial regen | In-place `<li>` swap |
| Story Glance | `fetchStoryGlance()` | 6620–6645 | `callGemini()` | At-a-glance summary | Markdown |
| Story Timeline | `fetchStoryTimeline()` | 6647–6695 | `callGemini()` | Narrative segments | JSON objects |
| Story Closing | `fetchStoryClosing()` | 6698–6735 | `callGemini()` | Reflective close | Markdown |
| Story Dig Deeper | `fetchStoryDigDeeper()` | 6053–6120 | `callGemini()` | Deep context | Markdown card |
| Story Ask AI | `openStoryAskAI()` | 6130–6210 | `callGeminiStream()` | User question | Streamed markdown |
| Image Gen | `callImageGen()` | 180–182 | **DISABLED** | N/A | N/A |

## Window Payload Contract
**`window.__aiPayload` (lines 2016–2018, 2639)**
- Format: `{ book: "GENESIS", chapter: "3", versesText: "3:1 In the beginning...\n3:2 And..." }`
- Set before each AI-dependent feature load
- Cleared/restored by modal close handlers to preserve prior passage context

## Response Formats

### Markdown HTML
**Used by:** Quick Context, Context Summary (full), Story Dig Deeper, Story Ask AI
- Function: `mdToHTML(text)` (lines 189–210)
- Converts `**bold**`, `*italic*`, headers, bullets
- Auto-linkifies Bible refs via `linkifyBibleRefs()` (line 222)

### Raw HTML (Reflection Questions Only)
**Function:** `renderAIReflectionQuestions()` (lines 3102–3280)
- **CRITICAL:** Direct `innerHTML` injection
- Must validate strict rules (lines 3114–3151):
  - Single `<div>` wrapping `<ol>` with exactly 3 `<li>` items
  - Each `<li>`: `<p>` (question) + empty `<textarea>` (answer)
  - **All verse links:** `<a href="#<verse>" class="reflection-link">v. X</a>`
  - NO styling tags; NO parentheses around links
- Cached in `localStorage["reflection-${passageId}"]`

### JSON Objects (Story Segments)
**Used by:** Story Timeline
- Segment structure: `{ title, content: { quote, commentary }, imagePrompt }`
- Serialized in IndexedDB cache

## Reflection Questions — Smart Retry & New Covenant Rule

**Files:** `js/04-passage.js` (helpers), `js/08-story.js` (reflect modal wiring), `style.css` (`.ai-refl-retry*`)

### Pipeline
1. **Prompt builder** — `_fetchReflectionLis({ book, chapter, versesText, count, excludeQuestions })` returns an array of detached `<li>` elements. Used by both initial render (count=3) and partial retry (count=N<3, excludeQuestions=already-answered).
2. **Initial render** — `renderAIReflectionQuestions(payload)` calls `_fetchReflectionLis` with count=3, wraps the lis in `<ol>`, prepends the `.ai-refl-retry` button, wires verse-ref links + textarea input listeners, calls `initializeReflections`.
3. **Cache restore** — when `runAIForCurrentPassage` finds cached HTML, it sets `mount.innerHTML` and calls `_ensureReflectionRetryUI(mount)` so the button + delegated handlers still attach (idempotent: safe to call repeatedly).
4. **Smart retry click** — `_smartRetryReflections()`:
   - Reads each `<li>`'s textarea value
   - **0 unanswered** → button is already disabled (`.ai-refl-retry-done`, green); no-op
   - **All N unanswered** → falls back to `_fullRetryReflections()` (cache busts, re-renders all 3)
   - **1–2 unanswered** → fetches exactly `unanswered.length` new lis with explicit "DO NOT duplicate these already-answered questions" exclusion list, swaps them into the unanswered slots in `<ol>` via `replaceChild`. Re-keys textarea ids positionally, wires only the new textareas (existing have listeners), wires only new lis' verse-ref links, restores answers by id, persists fresh `mount.innerHTML` to IDB.
5. **Reactive UI** — `_refreshRetryButtonState(mount)` runs after every keystroke (delegated `input` listener on `#aiReflection`). All 3 answered → disabled, green, tooltip "All questions answered ✓". Else enabled, pink, tooltip "Regenerate unanswered questions".

### NEW COVENANT prompt rule
The prompt has a non-negotiable section that:
- Lists OT law categories that are NO LONGER BINDING (dietary, ceremonial purity, sacrificial, civil/theocratic, festival/Sabbath ceremonial) with proof-texts (Mark 7:19, Acts 10, Col 2:16, Heb 8–10, Rom 14:14, Gal 3:23–25)
- Hard-forbids specific phrasings the AI tended to leak (e.g., "what unclean food will you avoid this week?", "what specific food choice will you make differently this week, reflecting God's call to be set apart?")
- Provides four NT-faithful redirect angles (God's character / heart principle / Christ fulfillment / NT-parallel transfer)
- Includes concrete BAD→GOOD rewrite pairs for Leviticus 11/16/19
- Embeds a 3-step self-check the AI runs against each candidate question before emitting

### Reflect modal integration (`08-story.js:openReflectModal`)
- Clones `#aiReflection`'s innerHTML into `#reflectContent` (it's the same content displayed in a fullscreen modal)
- Strip-regex `<(strong|em|b|i|mark)[^>]*>(.*?)<\/\1>/gi` removes AI's rogue inline styling **but spares** `<span class="material-symbols-outlined">` (otherwise the refresh icon glyph empties out and the button becomes invisible)
- The cloned modal button gets its OWN click handler wired in `openReflectModal` (innerHTML cloning loses the source handler) → calls `_smartRetryReflections` → re-opens the modal so the new questions show

## Caching

**IndexedDB (Images)**
- Store: `_IMG_STORE = "images"`
- TTL: `_IMG_MAX_AGE = 7 days`
- Functions: `_getImageFromIDB()` / `_saveImageToIDB()`

**IndexedDB (Stories)**
- Store: `_STORY_STORE = "stories"`
- Key: `story_${book}_${chapter}`
- TTL: `_STORY_MAX_AGE = 7 days`
- Functions: `_getStoryCache()` / `_saveStoryCache()`

**localStorage (Reflection)**
- Key: `reflection-${passageId}`
- Stores: HTML response string
- No TTL; persists across sessions

**Firebase RTDB (Charlie only)**
- Synced: `bibleFavorites`, `bibleComments`, `devotionStandaloneNotes`, `storySeenHistory`, `userName`, `bibleVersion`
- Debounce: 400ms (line 38, firebase-sync.js)

## Error Handling
- `callGemini()` throws on `!res.ok`; no built-in retry
- Callers catch and render fallback HTML (e.g., `"<p>Failed to generate…</p>"`)
- Reflection Questions (line 3225, 3279): same fallback pattern
- Verse chat (line 1688–1695): fallback suggestions if generation fails

## Image Generation
**Function:** `callImageGen(prompt, aspectRatio)` (line 180–182)
- Currently **disabled**: throws `"Image generation disabled"`
- Aspect ratios: `"9:16"` (portrait), `"16:9"` (landscape), `"21:9"` (ultra-wide)
- Expected return: `dataUrl` (base64 URI)
- Called by: verse chat, story scenes, immersive TTS background

## Known Unknowns
- `TTS_VOICE` definition location (expected in config.js or inline)
- Push notification copy generation function location (referenced ~line 3926)
