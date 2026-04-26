## Overview
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
