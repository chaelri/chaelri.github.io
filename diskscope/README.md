# diskscope

A disk-usage browser for the whole Mac — the Storage panel in System Settings,
except you can actually walk into the folders, sort by size, and jump straight to
the file in Finder.

Built because macOS's own Files/Finder makes it genuinely hard to answer
"what is eating 800 GB and where is it."

```
python3 serve.py
```

That's it. It scans the startup disk, prints a URL, and opens the browser.

---

## What it does

**Volume bar** — the same segmented bar as System Settings › Storage, but the
segments are your real top-level folders (`Users`, `Applications`, `Library`…),
each one clickable.

**Folder view** — every folder shows its *recursive* size, so you can follow the
weight down instead of guessing. Sort by size, name, date modified, or kind;
filter to 10 MB+ / 100 MB+ / 1 GB+ to skip the noise.

**Big files** — a flat list of the biggest files anywhere under the current
folder, each with the folder it lives in. This is usually the fastest route to
"oh, *that's* where the 17 GB drone clips are."

**Kinds** — total bytes per file type (Video, Image, Code, Game data…) with the
top extensions inside each. Click a kind to see its biggest files.

**One click to Finder** — the folder icon on any row runs `open -R`, which
reveals that exact file in Finder with it selected. Space bar does the same for
the highlighted row.

**Built-in player** — before you throw away 17 GB, look at it. The play button on
any media row opens a full-window player; the details panel also carries a small
inline one. Video, audio, images, PDFs and text all preview, seeking included —
verified on a 17.2 GB 4K clip whose `moov` atom sits at the very end of the file.
Expanding from the small player carries the playhead over rather than restarting.
Anything Chrome can't decode (HEVC, ProRes, HEIC) says so and offers to open it
in the real app instead.

## Keyboard

| Key | Action |
|---|---|
| `↑` `↓` | move selection |
| `→` / `Return` | enter folder (or open details for a file) |
| `←` / `⌘↑` | go up one folder |
| `P` | preview the selected row in the full-window player (again to close) |
| `Space` | reveal the selected row in Finder |
| `⌘F` | focus the filter box |
| `⌘[` `⌘]` | back / forward |
| `⌘R` | rescan the disk |
| `Esc` | close the details panel / clear the filter |

## Options

```
python3 serve.py                 # whole startup disk (default)
python3 serve.py ~/Downloads     # scan one folder instead
python3 serve.py --port 8771     # different port
python3 serve.py --fresh         # ignore the cached index and re-walk
python3 serve.py --no-open       # don't launch a browser
```

Navigation is confined to whatever root you scanned — the server refuses paths
outside it.

## Speed and the cache

A full walk of ~800 GB / ~800 k files takes roughly 15–25 s on an M-series Mac.
The result is cached to `~/Library/Caches/diskscope/`, so every later launch is
instant; hit `⌘R` (or pass `--fresh`) when you want fresh numbers.

Folders created after the last scan show as "measuring…" and are walked on
demand, so a stale cache never shows a wrong size — only a missing one.

## Full Disk Access

Without it, roughly 180 TCC-protected folders read as unreadable and their bytes
land in the grey "macOS system & snapshots" segment instead of being attributed.
The scan still works. To get the complete picture, add your terminal under
**System Settings › Privacy & Security › Full Disk Access** and rescan.

`/System` and a few synthetic paths are skipped deliberately — they're on the
sealed read-only volume and can't be cleaned up anyway. They're shown greyed out
rather than silently omitted.

## Why sizes differ from Finder's "Get Info"

diskscope reports **logical** size (`st_size`, what the file claims to be), like
`du -k --apparent-size`. Finder sometimes reports size on disk, which differs for
sparse files and APFS clones. Units are decimal (1 GB = 1000 MB), matching
System Settings.

## Safety

- Binds `127.0.0.1` only, and every request needs the random token minted at
  startup — so a webpage in another tab can't drive `open -R` on your Mac.
- Requests whose `Host`/`Origin` isn't localhost are rejected outright.
- Nothing from a request ever reaches a shell: `subprocess` is always called with
  a list of arguments, never `shell=True`.
- Every path is resolved and checked to be inside the scan root before use.
- **Move to Trash** uses Finder's own trash (recoverable) and never `rm`. It
  takes two clicks — the button arms first, showing how much you're about to
  throw away.

## Files

| File | What's in it |
|---|---|
| `serve.py` | scanner + HTTP API. Stdlib only, runs on macOS's `/usr/bin/python3`. |
| `index.html` | markup. Tailwind browser build + Material Symbols, no build step. |
| `style.css` | the iOS-flavoured theme, dark and light. |
| `app.js` | all the client logic — views, sorting, keyboard, the details panel. |

## API

All endpoints need `X-Diskscope-Token` (or `?token=`).

| Endpoint | Purpose |
|---|---|
| `GET /api/config` | root, volume totals, quick-jump folders, Full Disk Access state |
| `GET /api/status` | scan state + live progress counters |
| `GET /api/ls?path=` | one folder's children, with recursive sizes for subfolders |
| `GET /api/big?path=&limit=&kind=` | biggest files under a path |
| `GET /api/kinds` | bytes and file counts grouped by kind, with top extensions |
| `GET /api/info?path=` | stat details for one item |
| `GET /media/<token>/<b64url-path>` | the file itself, with `Range` support — this is what the player reads |
| `POST /api/scan` | start a scan (`{"fresh": true}` to bypass the cache) |
| `POST /api/measure` | walk one folder that post-dates the scan |
| `POST /api/reveal` | `open -R` — reveal in Finder |
| `POST /api/open` | `open` — open with the default app |
| `POST /api/trash` | Finder move-to-trash |
