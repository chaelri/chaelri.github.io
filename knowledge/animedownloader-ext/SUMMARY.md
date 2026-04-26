# AnimeDownloader Extension — Chrome Manifest V3

**Bulk anime downloader.** Entry: LiveChart.me discovery → AnimePahe site → automatic episode fetching → Kwik/Pahe download links.

## File Structure
```
animedownloader-ext/
├── manifest.json              # Manifest v3 config
├── background.js              # Service worker: tab lifecycle, batch queue, downloads
├── content/
│   ├── guard.js              # document_start MAIN-world guard (ad-blocker, nav guard)
│   ├── livechart.js          # LiveChart season page UI reconstruction + search
│   ├── animepahe.js          # AnimePahe episode list, auto-pilot, batch coordinator
│   ├── kwik.js               # Kwik.cx download button auto-clicker
│   └── pahe.js               # Pahe.win download button auto-clicker
└── popup/
    └── popup.html            # Extension icon popup: user onboarding
```

## Manifest V3 Config
- **Version:** 1.0.0
- **Permissions:** `tabs`, `storage`, `downloads`, `tabGroups`, `contextMenus`
- **Host Permissions:**
  - `*://*.livechart.me/*`
  - `*://*.animepahe.pw/*`, `.com/*`, `.ru/*`, `.org/*`
  - `*://kwik.cx/*`, `*://pahe.win/*`

## Content Script Injection

| Script | Target URLs | Run At | World | Frames |
|--------|-------------|--------|-------|--------|
| `guard.js` | `/play/*`, `kwik.cx`, `pahe.win` | `document_start` | MAIN | all |
| `livechart.js` | `livechart.me` | `document_idle` | ISOLATED | — |
| `animepahe.js` | AnimePahe domains | `document_idle` | ISOLATED | — |
| `kwik.js` | `kwik.cx` | `document_idle` | ISOLATED | — |
| `pahe.js` | `pahe.win` | `document_idle` | ISOLATED | — |

## Background Service Worker (background.js)

### Storage
- **Session:** `downloadTabs` — tracks active download tabs
- **Local:** `animeHistory` — downloaded episodes per anime ID; title, poster, details, lastUpdated

### Functions
- **Tab Tracking:** `trackTab(tabId, meta)`, `untrackTab(tabId)`, `getTrackedTabs()`
- **Batch Queue:** `enqueueBatch(msg, originTabId)`, `fireAll(items)` (parallel tab opens), `cancelBatch()`
- **Download Auto-Close:** Listens `chrome.downloads.onCreated` → closes oldest tracked tab once browser owns file (~1s instead of 15s)
- **Context Menus:** `bulk-dl-play` (right-click episode link), `bulk-dl-anime` (anime link), `bulk-dl-here` (current page)
- **Tab Grouping:** `groupDownloadTab(tabId, animeId, animeTitle)` — collapsible, blue color, "🔽 Title"
- **Filename Rewriting:** `chrome.downloads.onDeterminingFilename` — `AnimePahe_Kimi_ni_Todoke_-_1_BD_1080p_Freehold.mp4` → `Kimi ni Todoke/Kimi ni Todoke EP 1.mp4`

## Message-Passing API

**Content → Background:**
| Action | Sender | Payload |
|--------|--------|---------|
| `openTab` | livechart.js | `{url, animeId?, animeTitle?}` |
| `closeTab` | kwik.js | none |
| `batchDownload` | animepahe.js | `{animeId, animeTitle, poster, items}` |
| `cancelBatch` | animepahe.js | none |

**Background → Content:**
| Action | Receiver | Payload |
|--------|----------|---------|
| `batchProgress` | animepahe.js | `{status, ep, done, total}` |

## Page-Specific Logic

### LiveChart.me (livechart.js)
**Three modes:**
1. **Season List** (`/`): Reconstructs page HTML, scrapes anime cards, search dropdown (⌘K)
2. **Individual Anime** (`/anime/{id}`): Injects "Scan All Episodes" button, opens AnimePahe with `?searchFilter=...&episodeNumber=...&auto=true`
3. **Search Results** (`/search?q=...`): Full page replacement, live fetch + cache

### AnimePahe (animepahe.js)
**Three modes:**
1. **Search Auto-Click** (`?searchFilter=...`): Auto-clicks anime, navigates to first episode
2. **Episode Player** (`/play/{episodeId}`): Extracts best quality download link, renders NukeUI (full-page custom UI), inline auto-pilot panel if `?auto=true`, fetches remaining episodes (4-concurrent)
3. **Anime Listing** (`/anime/{id}`): Search pills, download history

### Kwik & Pahe (kwik.js, pahe.js)
- Wait for `.button.is-success`, auto-click
- 15-second countdown safety timer
- On click, send `closeTab` message
- Retry logic (max 5) for Cloudflare challenges

### Guard (guard.js — MAIN world, document_start)
**Defenses:**
1. Neuter third-party `<script>` (set type to `blocked/javascript`)
2. Remove rogue `<html>` direct-child elements (ads as siblings of `<body>`)
3. Block cross-host navigation (`location.href`, `.assign()`, `.replace()`)
4. Kill `window.open()`, `document.write()`, `document.writeln()`
5. Capture-phase click blocker (animepahe.pw only)
6. Purge ad-placement globals (`$insert*$`, `*-placement-queue*`)
7. **Watchdog loop** (300ms) re-arms defenses + sweeps DOM

## Popup UI (popup.html)
- 300px wide, dark theme (Inter font)
- Logo "Anime**Downloader**"
- 4-step onboarding (Visit LiveChart → Click SCAN → Auto-pilot opens → Use AI Search)
- CTA → opens https://livechart.me

## Key Design Patterns
- Session storage for service-worker resilience
- Parallel fetch with concurrency control (4 concurrent)
- Message-passing isolation (content scripts ↔ service worker)
- `document_start` injection in MAIN world (executes before page scripts)
- Full-page DOM reconstruction (livechart.js, animepahe.js)
- MutationObserver watchdog (real-time ad-node removal)

## Why
- **Why Manifest v3:** Required for Chrome Web Store, more secure permissions
- **Why per-site content scripts:** Different page structures per provider
- **Why MAIN world for guard.js:** Must execute BEFORE page scripts (document_start)
- **Why broad host permissions:** Multiple AnimePahe variants + Kwik + Pahe needed
- **Why session storage in background:** Survives service worker sleep
