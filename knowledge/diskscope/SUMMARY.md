# diskscope — Knowledge Summary

**Created:** 2026-08-11
**Status:** 🟢 Active — local-only tool, not deployed anywhere
**Purpose:** Answer "where did my 800 GB go" better than Finder or the macOS
Storage panel can, with one-click reveal-in-Finder on every row.

## Shape

Four files, no build step, no dependencies:

```
diskscope/
├── serve.py      ~800 lines — scanner + HTTP API (stdlib only, py3.9)
├── index.html    markup; Tailwind browser CDN + Material Symbols Rounded
├── style.css     iOS-flavoured theme, dark + light
├── app.js        ~800 lines — views, sorting, keyboard, details panel
└── README.md
```

Run: `python3 serve.py` → scans `/`, prints a tokenised localhost URL, opens it.

## The load-bearing design decision

**The scan indexes directories only**, never individual files. A home folder has
~100 k directories but ~800 k files; a full file index would cost hundreds of MB
of RAM to serve a list view that `scandir` can produce instantly anyway.

So:
- `Scanner.dirs` = `{path: [size, n_files, n_dirs, mtime]}` — the recursive index.
- `Scanner.top` = capped heap of the 40 000 biggest files — feeds the Big-files view.
- `Scanner.exts` = `{".mp4": [count, bytes]}` — feeds the Kinds view.
- Everything else is one `os.scandir` per folder, on demand.

Measured on Charlie's M5: **789 GB / 795 k files / 112 k dirs in ~17 s.**

## The built-in player

Added so a 17 GB clip can be looked at before it's deleted. `GET
/media/<token>/<base64url-path>` streams the file with full `Range` support;
the details sheet gets a small inline player and `P` / the row's play button
opens a full-window theater.

Two non-obvious things were needed to make it work:

- **The media route must have NO query string.** `/api/file?token=…&path=…`
  worked perfectly under `fetch` and `curl`, but `<video src>` requests are
  issued by Chrome's network service and were dropped before reaching the
  socket — the server logged nothing at all, and the element sat on `stalled`
  with `networkState: 2`, `readyState: 0` and **no error to catch**. Moving to a
  plain path segment fixed it instantly. If the player ever "hangs with no
  error", check this first.
- **`Range` support is mandatory, not an optimization.** DJI files are not
  faststart — on the 17.2 GB clip the `moov` atom sits at byte 17,180,694,281,
  so the player *must* be able to fetch the tail. Verified: 206 responses,
  correct `Content-Range`, suffix (`bytes=-2048`) and 416 handling, byte-exact
  reads against `dd`. Result: 3840×2160, 44.7 min, `readyState: 4`.

Other player notes:
- `preload="metadata"` everywhere — never pull the body of a multi-GB file.
- Closing the sheet or theater `pause()`es and removes `src`, so Chrome tears
  down the range request instead of holding it open.
- Expanding from small → theater copies `currentTime` so playback continues.
- Text previews fetch only `bytes=0-131071` so a 2 GB log can't land in the DOM.
- Codecs Chrome can't decode (HEVC, ProRes, HEIC) hit the `onerror` path and
  render an "Open in the default app" card rather than a dead player.
- **Theater sizing uses `position: absolute; inset: 0`, not `height: 100%`.** A
  percentage height on a centered grid item resolved against the wrong box and
  rendered 828 px inside a 769 px stage, pushing the video's controls below the
  window edge. `inset: 0` cannot overflow at any viewport size. (The stage uses
  `margin`, not `padding`, because `inset` resolves against the padding box.)

## Quirks worth remembering

- **The walk never crosses `st_dev`.** That's what stops `/System/Volumes/Data`
  firmlinks and mounted volumes from being counted twice on modern macOS. Remove
  that check and the totals roughly double.
- **Progress counters use per-level `direct_*` values, not subtree totals.** The
  first version added each subtree's total at every level of the recursion and
  reported wildly inflated numbers mid-scan.
- **`showHidden` defaults to ON.** A disk-usage tool that hides a 1.8 GB `.git`
  or `~/.Trash` defeats its own purpose. This is deliberate, not an oversight.
- **Decimal units (1 GB = 1000 MB), matching System Settings.** Using binary
  units would make every number disagree with the panel it's meant to replace.
- **Sizes are logical (`st_size`), not size-on-disk.** Differs from Finder's Get
  Info for sparse files and APFS clones.
- **`/System` and friends are in `SKIP_NAMES`** — sealed read-only volume, not
  cleanable. They're returned with `skipped: true` so the UI greys them out
  instead of showing "—", and `measureUnknowns()` never tries to walk them.
- **~183 folders read as unreadable without Full Disk Access.** `serve.py` probes
  `~/Library/Application Support/com.apple.TCC` to detect this and the UI shows a
  one-line notice. Their bytes fall into the grey "macOS system & snapshots"
  segment.
- **Cache lives at `~/Library/Caches/diskscope/scan-<sha1>.json`**, keyed per
  root, versioned by `CACHE_VERSION`. Bump that constant whenever the node shape
  changes or stale caches will deserialize wrong.
- **`.lrv`/`.lrf` are classified as video on purpose** — DJI proxy clips were
  53 GB of Charlie's disk hiding in the "Other" bucket. Same reasoning added a
  `game` kind for `.vpk`/`.bsp` (88 GB of Steam data).

## Security posture

Local tool, but it can drive `open -R` and Finder's trash, so a webpage in
another tab must not be able to reach it:

- binds `127.0.0.1` only
- per-run random token required on every `/api/*` call
- `Host` and `Origin` must be localhost — blocks DNS rebinding
- every client path is `realpath`'d and must sit inside the scan root
- `subprocess` always takes a list, never `shell=True`
- trash goes through Finder (recoverable), never `rm`, and arms on first click

## Things deliberately NOT built

- **No treemap.** The proportion bar per row plus size sort covers the same job
  in a fraction of the code and stays readable on a laptop screen.
- **No virtualized list.** Render caps at 400 rows with a "Show N more" button.
  Folders with 400+ *visible* entries after filtering are rare in practice.
- **No file watching.** `⌘R` rescans; folders newer than the scan are measured
  lazily via `POST /api/measure`.
- **Not on GitHub Pages.** It's useless without the Python half, so it is not
  linked from the root hub page.
