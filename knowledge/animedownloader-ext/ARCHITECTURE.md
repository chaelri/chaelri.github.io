# AnimeDownloader Extension — Architecture

## Background Service Worker (background.js)

**Role:** Orchestrator for multi-tab download lifecycle.

### State & Storage
- **Session Storage Key:** `downloadTabs` — tracks active download tabs (survives SW sleep)
- **Local Storage Key:** `animeHistory` — downloaded episodes per anime ID; title, poster, details, `lastUpdated`

### Core Functions

**Tab Tracking:**
- `trackTab(tabId, meta)` — register on open with `openedAt`, `animeId`, `animeTitle`
- `untrackTab(tabId)` — deregister on close
- `getTrackedTabs()` — fetch all tracked

**Batch Download Queue:**
- `enqueueBatch(msg, originTabId)` — receive batch from animepahe.js
- `fireAll(items)` — open each episode URL in parallel; Chrome queues page loads
- `cancelBatch()` — stop and close all pending tabs
- `reportBatchProgress(status, ep)` — send progress messages back to animepahe.js

**Download Auto-Close:**
- Listeners: `chrome.downloads.onCreated` (first), `chrome.downloads.onChanged` (fallback)
- Closes oldest tracked download tab as soon as browser owns the file
- Reduces per-tab wait from ~15s to ~1s
- Safety: `waitForTabClose(tabId, timeoutMs)` fallback (15s countdown in kwik.js)

**Context Menus** (created on `chrome.runtime.onInstalled`):
- `bulk-dl-play`: right-click episode link → open AnimePahe with `?auto=true`
- `bulk-dl-anime`: right-click anime link → search AnimePahe and launch
- `bulk-dl-here`: right-click on page → trigger auto-pilot on current page

**Tab Grouping:**
- `groupDownloadTab(tabId, animeId, animeTitle)` creates or reuses per-anime group
- Collapsible, blue color, emoji title "🔽 Title"
- In-memory map validated on reuse (groups can be deleted by user)

**Filename Rewriting (`chrome.downloads.onDeterminingFilename`):**
- Input: `AnimePahe_Kimi_ni_Todoke_-_1_BD_1080p_Freehold.mp4`
- Output: `Kimi ni Todoke/Kimi ni Todoke EP 1.mp4`
- Sanitizes special characters
- No zero-padding ("EP 1", "EP 10" natural-sort safe)

## Content Scripts — Page-Specific Logic

### LiveChart.me (livechart.js)

**Three modes (detect from URL):**

**1. Season List** (`/` or no `/anime/`):
- Scrapes anime cards (title, poster, genres, rating, episodes, studio, synopsis)
- Reconstruction: replaces entire page HTML with custom UI
- Floating search dropdown (⌘K trigger)
- Card grid with modal detail view
- AI search disabled (Gemini proxy empty string)

**2. Individual Anime** (`/anime/{id}`):
- Injects "Scan All Episodes" button + numeric input (start episode)
- "View on AnimePahe" button
- Opens AnimePahe search with `?searchFilter={title}&episodeNumber={num}&auto=true`

**3. Search Results** (`/search?q=...`):
- Full page replacement with result cards
- Live fetch + local caching
- Download/View/LiveChart links per result

### AnimePahe (animepahe.js)

**Three modes:**

**1. Search Auto-Click** (`?searchFilter=...`):
- Auto-clicks anime result matching filter
- Navigates to first episode

**2. Episode Player** (`/play/{episodeId}`):
- Extracts best quality download link (highest resolution, non-English)
- Renders **NukeUI**: full-page custom UI (poster, title, meta, episode grid, qualities)
- Inline auto-pilot panel (bottom-right) if `?auto=true`
- Fetches remaining episode URLs in parallel (4-concurrent)
- Sends `batchDownload` to background service worker

**3. Anime Listing** (`/anime/{id}`):
- Injects search pills (genre/studio filters)
- Renders download history (read from storage)

### Kwik.cx & Pahe.win (kwik.js, pahe.js)

- Wait for download button (`.button.is-success`)
- Auto-click it
- 15-second countdown safety timer
- On click, clean up UI, send `closeTab` message
- Retry logic (max 5 retries) for Cloudflare challenges

### Guard (guard.js — MAIN world, document_start)

**Runs at `document_start` in MAIN world** — executes BEFORE any page scripts.

**Defenses:**
1. Neuter third-party `<script>` tags (set type to `blocked/javascript`)
2. Remove rogue `<html>` direct-child elements (ads inject siblings of `<body>`)
3. Block cross-host navigation (`location.href`, `.assign()`, `.replace()`)
4. Kill `window.open()`, `document.write()`, `document.writeln()`
5. Capture-phase click blocker (animepahe.pw only)
6. Purge ad-placement globals (`$insert*$`, `*-placement-queue*`)
7. **Watchdog loop** (300ms) re-arms all defenses + sweeps DOM

## Message-Passing API

### Content Scripts → Background

| Action | Sender | Payload |
|--------|--------|---------|
| `openTab` | livechart.js | `{url, animeId?, animeTitle?}` → creates background tab + groups |
| `closeTab` | kwik.js | none → closes sender's tab |
| `batchDownload` | animepahe.js | `{animeId, animeTitle, poster, items: [{downloadUrl, ep}, ...]}` |
| `cancelBatch` | animepahe.js | none |

### Background → Content Scripts

| Action | Receiver | Payload |
|--------|----------|---------|
| `batchProgress` | animepahe.js | `{status: "start"\|"done"\|"failed"\|"complete"\|"cancelled", ep, done, total}` |

## Popup UI (popup.html)

**Layout:** 300px wide, dark theme (Inter font)

**Content:**
1. Logo "Anime**Downloader**" (accent on "Downloader")
2. Tagline "One-click bulk download"
3. Four-step onboarding with blue numbered circles:
   - Step 1: Visit LiveChart.me
   - Step 2: Click SCAN on anime card
   - Step 3: Auto-pilot opens background tabs
   - Step ✨: Use AI Search bar (disabled — Gemini cost)
4. CTA button → opens https://livechart.me

## Key Design Patterns

- **Session storage for SW resilience** — batch state survives SW sleep
- **Parallel fetch with concurrency control** — 4 concurrent episode fetches
- **Message-passing isolation** — content scripts (isolated world) ↔ service worker
- **document_start injection** (guard.js) — MAIN world before page scripts
- **Full-page DOM reconstruction** — bypasses existing page logic
- **MutationObserver watchdog** — real-time ad-node detection
