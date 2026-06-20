# camera01-archive — render & YouTube workflow

**Last established:** 2026-06-21
**First production run:** Feb 17, 2026 folder → `https://youtu.be/_P5TxK1uLTE` (unlisted, 50:28, 4.5 GB)

The workflow that takes a day-folder of mixed-orientation Insta360 (or any phone-camera) clips and produces one 1080p60 H.264 video on YouTube as **unlisted, not-for-kids**, with a content-derived title.

## Source shape

A folder of files lives at `~/Desktop/Camera01/<YYYY-MM-DD>/` containing a day's recordings. Per-folder you'll typically see:

- `VID_*.mp4` — main video clips (mostly 4K landscape 60fps, occasionally portrait with rotation=90 metadata)
- `PRO_VID_*.mp4` — 4:3 photo-mode "Pro" clips
- `LIV_*.mp4` — Live Photo motion clips (~3s, 4:3)
- `IMG_*.jpg` — photos (ignored by the workflow)
- `LRV_*.lrv` / `PRO_LRV_*.lrv` — Insta360 low-res proxies (ignored)

Filenames embed `YYYYMMDD_HHMMSS` so alphabetical sort = chronological order.

A typical day = ~10–20 clips, ~30–60 min total duration, ~30 GB on disk.

## The two helpers (in this repo)

### 1. `camera01-archive/render.sh` — merge & encode

Two optional companions for watching the render live:

- **Native SwiftUI app** at `camera01-archive/render-progress-app/` — build with `./build.sh` (SPM, no Xcode required), produces `Render Progress.app`. Auto-detects the most-recent date folder under `~/Desktop/Camera01/` on launch; toolbar **Open folder…** for manual selection. Polls every 250 ms via direct file reads (no server). **Recommended.**
- **Terminal TUI** at `camera01-archive/progress.sh <source_dir>` — run in a second Terminal window. Pure ANSI, identical signals as the Swift app but text-only. Useful over SSH.

The Chrome `--app` mode UI from the first run was abandoned — `--user-data-dir` spawns a separate Chrome instance at the end of the Dock, which felt off.



```sh
./camera01-archive/render.sh ~/Desktop/Camera01/2026-02-18
```

Outputs `~/Desktop/Camera01/2026-02-18/_render/Feb18_2026.mp4` plus 19-ish `clip_NN.mp4` intermediates and a `render.log`.

**Pipeline per clip:**
- HW HEVC decode via VideoToolbox (`-hwaccel videotoolbox`)
- `area` downscaler (best quality/speed for 4K→1080p)
- Landscape 16:9 → `scale=1920:1080`
- Portrait or 4:3 → blurred-fill bg (`boxblur=40:1` on an upscaled+cropped copy of itself) + centered foreground. **Content-aware "gradient" feel — no black bars.** This is the look the user asked for; portrait clips are kept un-cropped.
- HW H.264 encode `h264_videotoolbox -realtime 1` at 14M target / 18M cap
- AAC 192k stereo, `+faststart` for streaming

**Concurrency:** 2 parallel ffmpeg processes. **Apple M3 base has one media-engine encoder unit** — 2-way already saturates it. Don't bump to 3+ on M3 base; it just queues. On M3 Pro/Max/Ultra (2+ encoders), 3-4 way works.

**Throughput on M3 base, 16 GB:** ~3.5–4× realtime. 51 min source → ~13–17 min wall time end-to-end including concat.

**Quality:** 14 Mbps H.264 is comfortably above YouTube's recommended upload bitrate. YouTube re-encodes to ~10 Mbps VP9 for delivery anyway, so going higher just bloats the upload.

### 2. `gemini-proxy/yt-helper.mjs` — resumable YouTube upload

```sh
cd gemini-proxy
node yt-helper.mjs upload ~/Desktop/Camera01/2026-02-18/_render/Feb18_2026.mp4 \
  --title "kape, X, Y · Feb 18, 2026" \
  --privacy unlisted
```

- Resumable upload (8 MiB chunks), survives flaky network
- Defaults: `privacyStatus=unlisted`, `selfDeclaredMadeForKids=false`, `category=22` (People & Blogs)
- Throughput on ~17 MB/s upload → ~5 min for a 5 GB file
- Prints `https://youtu.be/<id>` + Studio edit link at the end

## OAuth setup (one-time per Google Cloud project)

YouTube's `https://www.googleapis.com/auth/youtube.upload` is a **Google-restricted scope**. Three things you must know:

### Why the ADC shortcut doesn't work

`gcloud auth application-default login --scopes=...youtube.upload` returns **"This app is blocked"** in the browser. gcloud's pre-built OAuth client (`764086051850-...apps.googleusercontent.com`) is verified for many scopes but **not for `youtube.upload`** — Google blocks unverified clients from requesting restricted scopes.

### The workaround that does work

Use your **own** OAuth Desktop client (project `gen-lang-client-0614956024`) kept in **"Testing"** mode with `charliecayno@gmail.com` listed as a test user. Testing-mode apps are exempt from verification for their own test users.

### Setup steps (done once, persist across machines)

1. **Enable the API in the project:**
   ```sh
   gcloud services enable youtube.googleapis.com --project=gen-lang-client-0614956024
   ```
2. **Add the scope to the OAuth consent screen — UI only, no API:**
   - Open https://console.cloud.google.com/apis/credentials/consent?project=gen-lang-client-0614956024
   - Edit App → Add or Remove Scopes → search `youtube.upload` → tick → Update → Save
3. **Provision local creds:**
   ```sh
   cp gemini-proxy/.drive-client.json gemini-proxy/.yt-client.json
   cd gemini-proxy
   node yt-helper.mjs auth   # opens browser, click Advanced → Go to (unsafe) → Allow
   ```
4. **Refresh token** lands in `gemini-proxy/.yt-creds.json` (gitignored).

When you re-do this on a new machine, only step 3+4 are needed — steps 1 and 2 are project-level and persist.

### Common pitfalls

- "Access blocked: this app is blocked" → you're using gcloud ADC. Switch to the self-owned OAuth client (steps above).
- "Access blocked: this app's request is invalid (Error 400: invalid_scope)" → step 2 was skipped.
- "no refresh_token in response" → revoke prior consent at https://myaccount.google.com/permissions and re-run.

## Title-picking pattern

Generic titles ("Day with K · Feb 17") feel hollow because they could be any day. Better titles come from **specific anchors visible in the clips**.

Process to find anchors:
1. After ffprobe / before render, sample frames from a handful of clips spread across the day:
   ```sh
   ffmpeg -ss <T> -i <src> -frames:v 1 /tmp/preview.jpg
   ```
2. Read each frame as an image. Note specific brands/menus/locations: "Mang Inasal sulit bowls," "Jollibee Joy Every Moment wall," "leaf-pattern coffee shop wallpaper," "phone unboxing on rug," "motor ride through traffic at 10pm," etc.
3. Pick 2–3 anchors and combine them with the date.

The Feb 17 video landed on **"kape, inasal, unboxing · Feb 17, 2026"** from: leaf-wallpaper café (kape) + Mang Inasal menu boards (inasal) + phone-on-rug late-night unboxing. Date in a readable form, not ISO. Lowercased Taglish reads informal & on-brand for the user + Karla.

## Folder hygiene after each upload

Once the YouTube URL is confirmed playable (`curl https://www.youtube.com/watch?v=<id>` returns `"playabilityStatus":{"status":"OK"}`):

```sh
rm -rf ~/Desktop/Camera01/<YYYY-MM-DD>/
```

Each day-folder is ~30 GB. The MP4 + intermediates are recreatable from the source if needed (which is the YouTube copy now). **YouTube is the archive.** Don't keep local masters unless you have a specific reason.

The IMG_*.jpg photos at the Camera01 root level (not inside date folders) survived the initial sort and are still there. Workflow doesn't touch them.

## Run book for the next folder

```sh
# 1. probe to verify the folder
ls ~/Desktop/Camera01/2026-02-18/*.mp4 | wc -l

# 2. render (terminal A)
./camera01-archive/render.sh ~/Desktop/Camera01/2026-02-18

# 2b. (optional) live progress TUI in terminal B
./camera01-archive/progress.sh ~/Desktop/Camera01/2026-02-18

# 3. find a content-specific title
#    (sample frames, look at them, pick 2–3 anchors)

# 4. upload
cd gemini-proxy
node yt-helper.mjs upload \
  ~/Desktop/Camera01/2026-02-18/_render/Feb18_2026.mp4 \
  --title "<anchors> · Feb 18, 2026" \
  --privacy unlisted

# 5. verify, then nuke source (YouTube takes 1-5 min to finish processing)
curl -fsS "https://www.youtube.com/watch?v=<id>" | grep -oE '"playabilityStatus":[^,]*' | head -1
# wait until status is "OK", not "UNPLAYABLE"
rm -rf ~/Desktop/Camera01/2026-02-18/
```

**Production runs:**
- Feb 17, 2026 → https://youtu.be/_P5TxK1uLTE (50:28, 4.5 GB, ~17 min render)
- Feb 18, 2026 → https://youtu.be/7RARdm_QjFs (5:56, 531 MB, ~2 min render)


## Things tried and explicitly rejected

- **`libx264 slower -crf 17` (best-quality libx264):** ~4 hours for a 51-min source on M3 base. CPU-bound. Quality is imperceptibly different from h264_videotoolbox at 14M after YouTube's re-encode.
- **`lanczos` scaler:** ~2× slower than `area` for downscale. No visible quality difference at 4K→1080p.
- **3+ way parallel ffmpeg on M3 base:** no gain (encoder is the bottleneck, 1 unit).
- **`gcloud auth application-default login` with youtube.upload scope:** blocked by Google (see OAuth section above).
- **CapCut CLI / SDK:** doesn't exist publicly. CapCut web renders in cloud, but uploading 30+ GB of source first is slower than rendering locally.
- **Compressor CLI (Final Cut Pro):** would work but the user doesn't have FCP installed.
- **A Chrome `--app` progress UI:** built for the first run, then nuked. It worked but felt janky (spawns a separate Chrome at the end of the Dock because of `--user-data-dir`). If a progress UI is wanted again, build a proper Swift/PyObjC WebView app instead.
