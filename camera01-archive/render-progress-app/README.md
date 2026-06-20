# Render Progress.app

Native SwiftUI macOS app that monitors a `camera01-archive` render in real time. Replaces the abandoned Chrome `--app` approach and the Terminal TUI.

## Build

Requires Swift 5.9+ (ships with Command Line Tools or Xcode). No Xcode project needed — SPM only.

```sh
cd camera01-archive/render-progress-app
./build.sh
```

Produces `Render Progress.app` in this directory. Ad-hoc signed so it launches without Gatekeeper friction. Drag to `/Applications` or your Dock if you want.

## Run

```sh
open "Render Progress.app"
```

On launch:
- Scans `~/Desktop/Camera01/` for the most-recently-modified `YYYY-MM-DD/` that has a `_render/` subdir, opens it.
- Toolbar button **Open folder…** lets you point at any folder manually.

## What it shows

- Hero progress bar (% of total source-seconds encoded).
- Per-clip strip (one tile per clip, width proportional to clip duration, color = status: green/blue/dark).
- Stats row: elapsed · remaining · total est · output size.
- Current-clip card with mini progress bar (estimated from output bytes vs projected at 14 Mbps).
- Log tail (auto-scrolls).
- "✓ Render complete" card on finish with the final mp4 path.

Polls the source folder every 250 ms; reads only `render.log` + clip file sizes. No background server, no HTTP, no port conflicts.

## Regenerate icon

```sh
/usr/bin/python3 make_icon.py
```

(Re-runs only needed if you tweak the design. `icon.icns` is committed so a fresh `./build.sh` works without PIL.)
