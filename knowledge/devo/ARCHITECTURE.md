## System Architecture Overview

> **Note (2026-04-27 split):** Line numbers throughout this doc reference the original monolithic `devo/script.js` (now deleted). The same code lives in 11 ordered chunks under `devo/js/` (`01-core.js` … `11-boot.js`). See [`KEY_FILES.md`](KEY_FILES.md) for the line-range → file map. All chunks load as classic `<script>` tags via `firebase-sync.js` and share one script-global scope, so the architecture below is unchanged.

**Devotion** is a progressive web app (PWA) for Bible study with AI-powered reflection, text-to-speech, canvas notes, and SOAP journaling. The core app uses localStorage (or Firebase RTDB for Charlie) and IndexedDB, lazy-loads Bible data from JSON, and communicates with Gemini via a Google Cloud proxy for AI features.

### PWA Model & Service Worker Strategy

The app registers a **service worker** (`sw.js`) with an aggressive cache-refresh policy:

- **Cache Strategy**: Network-first for static assets, network-only for HTML. Every SW activation nukes old caches and forces fresh app-shell load.
- **Deployment ID**: Uses `DEPLOYMENT_ID = "v1.1.0-" + Date.now()` (line 3 of sw.js) to create a unique cache per deploy, ensuring old clients never hit stale cache.
- **Core Assets**: CORE_ASSETS (sw.js:7–16) includes index.html, style.css, script.js, bible-meta.js, manifest.json, and icon files.
- **Push Notifications**: Service worker listens for push events (sw.js:48–59) and displays notifications with a click handler that focuses the app window.

### Data Flow: JSON → DOM

1. **Bible Data Loading**:
   - Two JSON files preloaded in `devo/`: `nasb2020.json` (~4.6 MB) and `easy2024.json` (~5.3 MB).
   - Lazy loaded via `bibleData` object in script.js (line ~2198), stored in-memory after first use.
   - Format: `{ [bookId]: { name, chapters: [...verse counts...] }, verses: [...{ book_id, chapter, verse, text }] }`.

2. **Verse Rendering**:
   - User selects book, chapter, (optional) verse via cascading selects or bottom-sheet pickers.
   - Click "Search" triggers `loadPassageById()` (line 2037) which:
     - Extracts verse objects from bibleData.
     - Stores `window.__aiPayload = { book, chapter, isSingle?, versesText }` (line 2639) as staging for AI requests.
     - Renders to `#output` (main content div, line 258 of index.html) with structure: `<div class="verse"><div class="verse-header"><span class="verse-num">1</span><span class="verse-content">[text]</span></div></div>` (see line 2702–2704 of script.js).

3. **Summary & Reflection Sidebar**:
   - `#aiReflection` (sidebar, line 264 of index.html) holds AI-generated reflection questions.
   - Questions stored with IDs like `reflection-PSA-117-1-0` (passageId-index) in textarea elements (line 5702).
   - Results persisted to localStorage keys matching the ID and to IndexedDB for backup.

### Local vs. Proxy-Bound Data

**Local (Client-Side, No Auth)**:
- Bible text (JSON files)
- User name, theme, version preference (localStorage)
- Favorites, comments, notes (localStorage + IndexedDB)
- Canvas sketches (localStorage keys: `devo.canvas.*`)
- SOAP journal entries (localStorage: `soap_application`, `soap_prayer`)
- Reflection responses (localStorage: `reflection-*`, IndexedDB)

**Proxy-Bound (Cloud)**:
- **Gemini Proxy** (line 20 of index.html): `https://gemini-proxy-668755364170.asia-southeast1.run.app`
  - Used for AI summary, reflection questions, story generation.
  - Accessed via `_typeOut()` (line 65) and image generation via `callImageGen()` (line 180).
  - Endpoint calls made from `script.js` with `window.__aiPayload` staged in memory.

- **Google TTS API** (config.js:1):
  - Key: `window.GOOGLE_TTS_KEY`.
  - TTS synthesis for verse playback via Web Audio API.

- **Firebase Realtime Database** (Charlie-only):
  - RTDB at `https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app` (firebase-sync.js:14).
  - Syncs data under path `devo-sync` in RTDB.
  - See below for details.

### Security Model: localStorage Scope & Authentication

**No Authentication**:
- The app has **no login or auth system**. User identity is a name (`userName` localStorage key).
- Charlie's Firebase sync is detected by checking `userName === "charlie"` (firebase-sync.js:54).

**localStorage Scope**:
- All data is scoped to domain (app URL).
- Data is **unencrypted** and readable by any script on the origin.
- Private data (notes, reflections) is visible to users sharing a browser profile.

**Firebase Sync (Charlie-Only)**:
- Enabled if `userName === "charlie"` (firebase-sync.js:54).
- localStorage is **shadowed** by an in-memory mirror backed by Firebase RTDB (firebase-sync.js:154–187).
- Mirror syncs these static keys (firebase-sync.js:22–33):
  - `bibleFavorites`, `bibleComments`, `devotionStandaloneNotes`, `storySeenHistory`, `userName`, `bibleVersion`, `recentPassageId`, `recentPassage`, `soap_application`, `soap_prayer`.
- Dynamic prefixes synced:
  - `reflection-*` (reflection responses)
  - `devo.canvas.*` (canvas sketches)
- **Debounced writes**: 400ms (firebase-sync.js:38, `FB_WRITE_DEBOUNCE_MS`).
- **Remote listen**: Firebase listener re-renders globals and triggers dashboard refresh if visible (firebase-sync.js:205–256).

### Service Worker Cache Strategy

- **install**: Forces SW activation immediately, caches CORE_ASSETS with `cache: "no-store"` (sw.js:19–29).
- **activate**: Deletes all old caches and claims all clients. **No infinite reload loop** (sw.js:31–45).
- **fetch**:
  - HTML (navigate mode): Always network, never cache (sw.js:83–86).
  - Static assets: Fetch → update cache → return; fallback to cache on offline (sw.js:89–99).
- **Result**: Online users always see latest assets; offline users see last-known version.

### IndexedDB Cache Layer

**Database**: `"dudu-devotion-db"`, version 1 (line 573 of script.js).

**Stores**:
- `verses`: Cached verse text (unused in current flow, legacy structure).
- Image cache under separate DB `"devo-cache"` (line 83, unused in current code).

**Lifecycle**:
- Opened by `openDB()` (line 570) which returns a Promise<IDBDatabase>.
- Verse cache functions: `getVerseCache()` (line 604), `saveVerseCache()` (line 624), `clearVerseCache()` (line 638).
- AI reflection data optionally stored here for backup (line 3965 comment).

### Configuration & Secrets

`config.js` (3 lines):
- `window.GOOGLE_TTS_KEY`: API key for Google TTS.
- `window.VAPID_PUBLIC_KEY`: Public key for Web Push notifications.
- `window.PUSH_SERVER_URL`: Gemini proxy endpoint for push-related features.

`bible-meta.js`:
- Precomputed metadata: `window.BIBLE_META = { GEN: { name, chapters: [...] }, ... }` (all 66 books with chapter counts).
- Used to populate book/chapter dropdowns on load.

### localStorage Keys (Complete Schema)

| Key | Type | Scope | Example |
|-----|------|-------|---------|
| `bibleVersion` | String | User preference | `"NASB"` or `"EASY"` |
| `recentPassageId` | String | Last read passage | `"JHN-3-16"` |
| `recentPassage` | String | Display name | `"John 3:16"` |
| `bibleFavorites` | JSON obj | Verse favorites | `{ "JHN-3-16": 1713916200, ... }` |
| `bibleComments` | JSON obj | Verse notes | `{ "JHN-3-16": [{ text, time }, ...], ... }` |
| `isLightMode` | JSON bool | Theme | `true` or `false` |
| `reflectionVisible` | JSON bool | UI state | Toggle side panel |
| `reflection-[PASSAGEID]-[INDEX]` | String | Q&A pairs | `"Q: ...\nA: ..."` |
| `reflection-time-[PASSAGEID]` | String | Timestamp | Milliseconds since epoch |
| `devotionStandaloneNotes` | JSON array | Standalone notes | `[{ id, type, text, createdAt, ... }, ...]` |
| `storySeenHistory` | JSON obj | Story tracking | `{ "JHN-3": 1, ... }` (boolean-like) |
| `devo.canvas.[KEY]` | JSON obj | Canvas sketches | `{ drawMode, zoom, ... }` |
| `soap_application` | JSON array | SOAP entries | `[{ id, type, entry, createdAt, ... }, ...]` |
| `soap_prayer` | JSON array | SOAP prayers | Same structure as `soap_application` |
| `userName` | String | User ID | `"charlie"` or `"alice"` |
| `pushEnabled` | String | Push state | `"true"` or `"false"` |
| `pushAsked` | String | Prompt flag | `"true"` or `"false"` |
