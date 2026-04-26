# AnimeDownloader Extension — Decisions

## Why Manifest v3

- Required for Chrome Web Store
- More secure permissions (host_permissions explicit)
- Service worker (instead of background page) — more efficient
- Future-proof (v2 deprecated)

## Why Per-Site Content Scripts

Different page structures per provider:
- LiveChart.me: anime discovery
- AnimePahe: episode listing + player
- Kwik.cx, Pahe.win: download endpoints

Separating concerns into distinct scripts keeps logic clear.

## Why MAIN World for guard.js

Must execute **BEFORE** page scripts to neutralize ads/popups.

**ISOLATED world** (default for content scripts):
- Sandboxed from page scripts
- Can't override page globals like `window.open`

**MAIN world:**
- Same context as page scripts
- Can override globals (window.open, document.write)
- Required for ad-blocking + nav guards

## Why document_start Injection

Default `document_idle` runs AFTER page scripts. Too late for guarding.

`document_start` runs BEFORE any other scripts → guard can override globals first.

## Why Broad Host Permissions

Multiple AnimePahe variants (`.pw`, `.com`, `.ru`, `.org`) + Kwik + Pahe.

Listed in `host_permissions` manifest field.

**Trade-off:** Users see "Read and change all your data on these sites" in install dialog.

## Why Session Storage in Background

Service workers in MV3 sleep when idle (~30s). Persistent state needed.

**`chrome.storage.session`:** survives SW sleep, cleared on browser restart.

Alternative: `chrome.storage.local` (persists across browser restarts).

**Used:**
- `downloadTabs`: active download tab tracker
- `animeHistory`: per-anime episode history (local storage)

## Why 4-Concurrent Fetch Limit

- Avoid AnimePahe rate-limiting
- Browser concurrent connection limits
- Doesn't overwhelm user's network

## Why Tab Grouping

Visual organization in browser:
- All download tabs for one anime grouped
- Collapsible (reduce visual clutter)
- Color-coded (blue = downloading)
- Emoji title "🔽 Title" identifies group

**In-memory map** validated on reuse (user can delete groups).

## Why Filename Rewriting

**Original:** `AnimePahe_Kimi_ni_Todoke_-_1_BD_1080p_Freehold.mp4`
**Rewritten:** `Kimi ni Todoke/Kimi ni Todoke EP 1.mp4`

**Rationale:**
- Folder per anime (organized library)
- Clean filename ("EP 1" vs "AnimePahe_-_1_BD_1080p_Freehold")
- Natural sort ("EP 1", "EP 10" without leading zeros sort correctly because of spacing)

## Why Full-Page DOM Reconstruction

**Problem:** AnimePahe + LiveChart pages have ads, popups, complex JS.

**Solution:** Replace entire HTML with custom UI built from scraped data.

**Pros:**
- Bypass all ad scripts
- Custom UX (search dropdown, NukeUI episode player)
- No page conflicts

**Cons:**
- Fragile (page structure changes break scraping)
- Heavy DOM operations (replacing page HTML)

## Why MutationObserver Watchdog

Ad scripts try to re-inject after blocked. 300ms watchdog re-arms defenses + sweeps DOM.

**Trade-off:** Continuous DOM scanning has CPU cost. Acceptable for download tabs (short-lived).

## Why Manual Install (Not Chrome Web Store)

- Side-loaded extensions (manifest is ready for store but not published)
- Charlie's personal use
- Avoids store review delays
- Allows broad host permissions without policy issues

## Why AI Search Disabled

Gemini proxy adds cost per query. Disabled for now — can re-enable if value justifies cost.

**Currently:** Search uses local LiveChart data via fetch + cache.

## Known Limitations

- Manifest v3 service worker sleep (~30s) — mitigated by session storage
- Page structure changes break scraping (ongoing maintenance burden)
- Cloudflare challenges may block (max 5 retries)
- No mobile support (Chrome extension = desktop only)
- Ad-blocker may have unintended interactions
