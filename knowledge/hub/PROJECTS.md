# Hub Project Index for chaelri.github.io

**Last updated:** 2026-05-27
**Scope:** Complete mapping of top-level directories + root files, with tech stack, deployment, status, and key entry points.

## Status Legend

- 🟢 **Active** — in regular use, recent commits, ongoing maintenance expected
- 🟡 **Parked** — functional but not under active development; may be resumed
- ✅ **Stable** — configuration/documentation file, no changes needed regularly

---

## Active Projects

### autoclicker/  🟢

DIY WiFi auto-clicker build reference + live phone remote — ESP32-C3 + MG90S servo SwitchBot (migrated from relay+solenoid 2026-05-06). Single-page site documents hardware, wiring, firmware; phone subdir is the live remote.

- **Tech:** vanilla HTML/CSS/JS, Tailwind v4 (browser CDN, no build), Firebase v10 SDK (RTDB + anonymous Auth), Inter + JetBrains Mono + Material Symbols Outlined.
- **Entry:** `index.html` (overview/hardware/wiring/pcb/demo/code/checklist; all visuals hand-drawn inline SVG, no image dependencies), `firmware/autoclicker.ino` (canonical Arduino sketch, in-repo), `phone/index.html` (~166 lines — live big-button remote).
- **Deploy:** GitHub Pages at `/autoclicker/`. Phone remote at `/autoclicker/phone/`.
- **Firmware:** `firmware/autoclicker.ino` (canonical, in-repo) — uses `ESP32Servo` library (Kevin Harrington — install via Library Manager; AVR `Servo.h` does not run on ESP32-C3). **Four trigger paths**: Firebase SSE stream (online, primary), local web UI on port 80 (same WiFi), SoftAP fallback `AutoClicker-AP` (offline), and a **6×6×5 mm tactile pushbutton on GPIO4** added 2026-05-19 (always-on, no network needed — `INPUT_PULLUP` + 30 ms debounce; each press calls `doToggle()`, mirroring the big PRESS button in the web UI). Continuous-rotation servo: PWM pulse = speed/direction. Tuning knobs: `STOP_US`, `PUSH_US`/`RETURN_US`, `PUSH_MS`/`RETURN_MS`, `CLICK_HOLD_MS`, `BTN_DEBOUNCE_MS`.
- **Quirks:**
  - **Demo section is animation-only** — `Trigger click` / `Double click` simulate the GPIO pulse in SVG, they do NOT touch Firebase. Only `phone/index.html` writes for real.
  - **SVG visuals are servo-aligned** with the button visible: hardware top-down shows ESP32 + MG90S + the tactile button hand-drawn in SVG, with cyan IO4 highlight and two button wires routed to the ESP32's bottom edge.
  - **Physical button shares ESP32 GND with the servo brown wire** — same pad fans out to two wires (visualized as a Y-junction in the connection-map SVG). The C3 SuperMini also exposes a top-edge `G` pad if you'd rather not stack.
  - Shares Firebase project `test-database-55379` (asia-southeast1) with other repo apps; uses paths `/autoclicker/command` (transient) and `/autoclicker/state` (authoritative latched state).
  - Firebase web API key in `phone/index.html` is intentional — it's a public client config, not a secret.
  - Wires/checklist render from `wires[]` (now **6 entries**) and `steps[]` arrays — edit data, not DOM.
  - Section IDs (`overview/hardware/wiring/pcb/demo/code/checklist`) are load-bearing for `syncNav()` scroll-spy.
- **Full docs:** See `knowledge/autoclicker/SUMMARY.md`, `ARCHITECTURE.md`, `KEY_FILES.md`.

### aircon/  🟢

DIY WiFi aircon controller — sister project to autoclicker. ESP32-C3 + 940 nm IR LED replaces Charlie's TCL TAC-09CSA/KEI remote entirely; phone web remote writes desired state to Firebase RTDB; ESP32 polls and pulses TCL112AC IR codes at the aircon.

- **Tech:** vanilla HTML/CSS/JS, Tailwind v4 (browser CDN, no build), Firebase v10 SDK (RTDB + anonymous Auth), Inter + JetBrains Mono + Material Symbols Outlined. Color palette: sky/cyan/teal (deliberately distinct from autoclicker's indigo/purple/pink).
- **Entry:** `index.html` (~1,000 lines — overview/hardware/wiring/demo/code/checklist; all visuals hand-drawn inline SVG, no image dependencies), `firmware/aircon.ino` (canonical Arduino sketch, in-repo), `phone/index.html` (~250 lines — live remote with power/temp±/mode chips/fan chips).
- **Deploy:** GitHub Pages at `/aircon/`. Phone remote at `/aircon/phone/`.
- **Firmware:** `firmware/aircon.ino` — uses `IRremoteESP8266` library (David Conran et al — install via Arduino Library Manager; runs on ESP32 too despite the name). The `IRTcl112Ac` class encodes the full TCL split-AC state. Three trigger paths: Firebase poll (online), local web UI on port 80 (same WiFi), SoftAP fallback `Aircon-AP` (offline). On any state change: parses JSON, mutates `AcState`, calls `ac.send()` which generates the 38 kHz / 112-bit blink pattern on GPIO3.
- **Quirks:**
  - **Two RTDB paths:** `/aircon/command` (transient — phone writes desired state, ESP32 reads + clears) and `/aircon/state` (authoritative — ESP32 mirrors after every send). Same two-path pattern as autoclicker.
  - **No transistor in the BOM** — IR LED driven directly from GPIO3 through a 100 Ω current-limit resistor. Range is ~2-3 m line-of-sight; fine for a wall-mount near the aircon. Add a 2N2222 transistor later if cross-room range is needed.
  - **No TSOP4838 receiver in the BOM** — TCL112AC is pre-supported in the library, so no learning step is needed for Charlie's TAC-09CSA/KEI. Receiver is only needed for unsupported TCL models.
  - **Demo section is animation-only** — `Power on` / `Temp +1` flash the LED + spawn 4 staggered IR ripples + wake the aircon LCD in SVG; they do NOT touch Firebase. Only `phone/index.html` writes for real.
  - **Send full state on every press** — TCL aircons expect a complete state frame per IR transmission, not deltas. The library + the phone remote both honor this.
  - Shares Firebase project `test-database-55379` (asia-southeast1) with autoclicker, weddingbar, echoes, etc. RTDB rules: `.read`/`.write` = `true` for `/aircon/*` while testing.
  - Section IDs (`overview/hardware/wiring/demo/code/checklist`) are load-bearing for `syncNav()` scroll-spy — same skeleton as autoclicker.
- **Full docs:** See `knowledge/aircon/SUMMARY.md`, `ARCHITECTURE.md`, `KEY_FILES.md`.

### pocket-remote/  🟢

Battery-powered hand-held WiFi remote for **both** `autoclicker/` and `aircon/`. Three modules stacked (ESP32-C3 + 0.42" OLED + TP4056 + LiPo 1000 mAh). One BOOT button: **tap to fire** the current mode, **hold ≥800 ms to flip** between LIGHTS and AIRCON modes. Mode persisted in NVS. OLED shows Manila time + day/date + days-until-wedding (2026-07-02) + transient `sent` / `fail` status. USB-C charging via TP4056; usable while plugged in.

- **Tech:** vanilla HTML/CSS/JS (browser-Tailwind v4, no build) for the docs site; firmware uses `U8g2` for the OLED, `HTTPClient` for Firebase HTTPS PUTs, `Preferences` for NVS-backed mode, `WiFiMulti` for roaming. No Firebase SDK, no servo / IR library — pure pass-through to the existing sibling devices.
- **Entry:** `index.html` (~640 lines — overview/hardware/wiring/demo/code/checklist; all visuals hand-drawn inline SVG, no image dependencies), `firmware/pocket-remote.ino` (~330 lines, canonical Arduino sketch).
- **Deploy:** GitHub Pages at `/pocket-remote/`. No phone-remote subpath — the physical device IS the remote.
- **Firmware:** Single sketch. Writes to **existing** RTDB paths used by the sibling phone remotes — `"toggle"` to `/autoclicker/command` in CLICK mode, `{"cmd":"click"}` to `/aircon/command` in AC mode. Receiving firmware can't tell the difference between a phone tap and a pocket-remote tap.
- **Hardware quirks:**
  - **No MT3608 boost converter** in the BOM. Battery (3.0–4.2 V via TP4056 OUT+) feeds the ESP32 `5V` pin directly; the onboard 3.3 V LDO handles the range with ~250 mV headroom. Below ~3.5 V the OLED starts to flicker — that's the "charge me" cue.
  - **No battery sense divider either.** The 220 kΩ + 100 kΩ chain that fed GPIO0 was tried, then dropped — the OLED flicker is the indicator, and the TP4056 DW01 still cuts the cell at 3.0 V to protect it. Four wires + USB-C, no resistors.
  - **Use-while-charging** works because of the TP4056+DW01 protection variant — USB-C powers the load and tops up the cell at the same time.
  - **Don't connect OUT+ to the V3 pin** — 4.2 V exceeds the 3.3 V LDO output spec. Load-bearing warning on the docs page.
- **Firmware quirks:**
  - **Button state machine** decomposes one press into tap vs hold: tap fires on release if held < 500 ms and no hold has fired; hold fires the moment press duration crosses 800 ms (not on release), so feedback is immediate.
  - **Mode is NVS-persisted** under namespace `remote`, key `mode` (uint8). Survives reboots and flat-battery shutdowns.
  - **Modem sleep is the default** (~20–30 mA average → ~12–24 h battery). Do NOT call `WiFi.setSleep(false)` here — the autoclicker firmware does that because it's wall-powered, this remote isn't.
  - **No SoftAP fallback, no local web UI.** OLED + button is the whole interface. WiFi credentials are hardcoded — same SSID pool as autoclicker/aircon (`CAYNO` + `Chaelri`).
  - **`Wire.setPins(5, 6)` must run BEFORE `oled.begin()`** — U8g2 starts I²C on default pins otherwise and the OLED stays blank.
  - **Color palette is amber + emerald** (distinct from autoclicker's indigo/purple and aircon's sky/cyan).
- **Full docs:** See `knowledge/pocket-remote/SUMMARY.md`, `ARCHITECTURE.md`, `KEY_FILES.md`.

### collaterals/  🟢

Print-ready wedding collaterals studio for Charlie & Karla (July 2, 2026) — seven SVG-rendered templates with editable fields, live preview, PNG export, and one-click Drive upload to a shared folder for the printer.

- **Tech:** vanilla JS ESM (no build), pure SVG rendering, browser localStorage, Google Fonts (Playfair Display / Dancing Script / Great Vibes / Inter), Material Symbols Outlined. Vendored `qrcode-generator@1.4.4` for table-number QR codes.
- **Entry:** `index.html` (dashboard — 7 cards + progress bar + Drive folder shortcut), `app.js` (dashboard logic), `style.css` (shared), `shared/{design,state,editor,export,drive,qrcode}.js`, `templates/<name>/{index.html,app.js}` for each of: name-cards, menu, table-numbers, money-envelopes, mirror-chart, monogram, invitation.
- **Deploy:** GitHub Pages at `/collaterals/`.
- **Drive folder:** `1IJWFdaSe8xSuqK-FJEJjMzhyqnOBQNhW` under charliecayno@gmail.com. Created via the new `drive-helper.mjs mkdir` command.
- **Proxy contract:** `/upload-drive` now takes an optional `app` field (`sns_dq` or `collaterals`). Adding new apps = add a row to `DRIVE_FOLDERS` in `gemini-proxy/index.js` + redeploy. Filename regex now also accepts `.pdf` in addition to `.png`.
- **Quirks:**
  - **Pure SVG rendering** — every template builds an SVG string from state, renders as innerHTML for preview, serializes for PNG export. `shared/export.js` injects a Google Fonts `@import` into the cloned SVG before rasterizing so headline fonts resolve.
  - **State shape**: localStorage key `collaterals:v1` = `{ status: { id: pending|in_progress|ready|printed }, data: { id: { ... } } }`. Status pills are visible on the dashboard; the progress bar weights `in_progress=0.4`, `ready=0.85`, `printed=1.0`.
  - **Couple defaults** (names, monogram, date, hashtag) all centralized in `shared/design.js` as the `COUPLE` constant — single source of truth.
  - **Mirror chart export** at scale 5 = 2400×6000 px (24″×60″ at ~100 DPI). The other templates use 2.5–4 scale for ~300 DPI on their respective physical sizes.
  - **Templates do NOT depend on each other** — each `templates/<name>/app.js` is self-contained other than its imports from `shared/`. Adding an 8th template = `mkdir templates/<name>/`, write its two files, and add an entry to `TEMPLATES` in `shared/state.js`.
- **Full docs:** See `knowledge/collaterals/SUMMARY.md`.

### devo/  🟢

Bible devotional progressive web app (PWA) — daily passages, AI explanations, drawing canvas, TTS, Firebase sync.

- **Tech:** vanilla JS (~9,881 lines split across 11 chunks under `devo/js/`), CSS, PWA (service worker), Firebase RTDB, IndexedDB, Gemini API via proxy.
- **Entry:** `index.html`, `js/01-core.js` … `js/11-boot.js` (loaded in order by `firebase-sync.js` with `async=false`), `style.css`, `firebase-sync.js` (multi-user sync — Charlie + Karla), `manifest.json`.
- **Deploy:** GitHub Pages at `/devo/`.
- **Quirks:** Uses NASB 2020 + Easy-to-Read JSON files (~10 MB total). AI calls go through `gemini-proxy/`. Firebase sync activates when `userName.toLowerCase()` is in `SYNC_USERS = { charlie, karla }`; each user has their own RTDB path (Charlie: `devo-sync`, Karla: `devo-sync-karla`) so devotions stay private. Synchronous cross-chunk calls only work via `js/11-boot.js` — earlier chunks must only DEFINE functions, never trigger forward chains.
- **Full docs:** See `knowledge/devo/SUMMARY.md` and the other MDs in `knowledge/devo/`.

### devo-mobile/  🟡

React Native (Expo) mobile companion to devo — paused, code-shares with web version.

- **Tech:** React Native 0.81.5, Expo 54, Expo Router (file-based), TypeScript, Zustand.
- **Entry:** `expo-router/entry`, `app/` (file-based routes), `package.json`.
- **Deploy:** Expo Dev Server / EAS — not on app stores currently.
- **Quirks:** Uses Haptics, SecureStore, Updates (OTA), AV. Likely intended to share Firebase with devo.

### guard-exit-interview/  🟢

Offboarding interview tracker for New Manela guards — captures exit data, exports to colored Excel.

- **Tech:** vanilla JS, Tailwind, Firebase Auth (view-only mode for non-Charlie), RTDB, xlsx-js-style.
- **Entry:** `index.html`, `app.js` (core logic), `style.css`.
- **Deploy:** **Dual-push required** — MUST commit to BOTH `chaelri.github.io` AND `guard-exit-tracker` repos.
- **Quirks:** View-only auth for non-Charlie users. Monthly trends, branch filtering, mobile-overflow fixes recent. Always-PHT timestamps. Verify dual-repo push before considering complete.

### monthsary/  🟢

4th monthsary celebration page (Charlie & Karla, Nov 11) — music clips, confession messages, Firebase login gate.

- **Tech:** vanilla JS, custom CSS (Pacifico font), Firebase Auth (Google Sign-in), MP3 audio, images.
- **Entry:** `index.html` (login + hidden content), `script.js` (auth + reveal logic), `styles.css`.
- **Deploy:** GitHub Pages at `/monthsary/`.
- **Quirks:** Recently rebuilt (Apr 26). Date-locked UI (won't fully render after Nov 11 unless overridden). Login gate restricts content to Charlie & Karla.

### sns-dq/  🟢

Discussion Questions image generator — paste questions, AI adds bold/italic emphasis (no rewording), renders onto the SNS template, copy/download/upload to Drive.

- **Tech:** vanilla JS, Tailwind v4 (browser build), Material Symbols, Open Sauce Sans (Regular / Bold / BoldItalic served on canvas), PWA manifest with `share_target`. No service worker.
- **Entry:** `index.html`, `app.js`, `style.css`, `manifest.json`, `assets/template.png` (1920×1080).
- **Deploy:** GitHub Pages at `/sns-dq/`. Browser-only client.
- **Server side:** `gemini-proxy/upload-drive` endpoint authenticates as charliecayno@gmail.com via stored OAuth refresh token (set up by `gemini-proxy/setup-drive-oauth.sh`). Service accounts can't write to consumer Drives — that's why the user-OAuth path. Drive folder ID hardcoded in proxy.
- **Quirks:** Three-tier weight for emphasis (400/700/700-italic) settled after several iterations; layout pinned to measured pixel bounds of the pre-stamped header in `template.png`. AI output is reconciled run-by-run against the input so wording can never silently change. UX: starts centered single-col, expands to 2-col with View Transitions + confetti on the first successful Generate; no localStorage persistence (deliberate — every load is a clean slate, "+ New" resets back to centered).
- **Full docs:** See `knowledge/sns-dq/SUMMARY.md` and `DECISIONS.md`.

### towa-no-yuugure/  🟢

Episode viewer for *Towa no Yuugure / Dusk Beyond the End of the World* (P.A. Works, 2025) — sister project to `anohana/`.

- **Tech:** vanilla JS, Tailwind (CDN), inline CSS, PWA, Google Drive iframe player.
- **Entry:** `index.html`, `app.js`, `manifest.json`, `sw.js`, PIL-generated PNG icons.
- **Deploy:** GitHub Pages at `/towa-no-yuugure/`.
- **Quirks:** Same structural skeleton as `anohana/` but reskinned — warm orange/amber/violet "Dusk · 2238" palette for main 12 episodes, cool blue "Pre-Fall · 2038" palette for the EP 00 prologue card (placed BEFORE Dusk · 2238 as the chronological start, not at the end). Pure CSS dusk-horizon poster, no cover image. Embers (warm dust) float straight up — no horizontal motion (would jitter the page width). `playEpisode(idx, { scroll: false })` skips scroll-to-nav on auto-resume from `localStorage.towa_last_ep`. Drive folder ID `1EfMvMTbEFj_v_15MMYhV7ucBM3TAauWn` (owned by charliecayno@gmail.com, uploaded via the same OAuth flow as sns-dq).
- **Full docs:** `knowledge/towa-no-yuugure/SUMMARY.md`.

### tayo/  🟢

Shared journal / mood-tracking app for Charlie & Karla — Firebase-backed, real-time sync.

- **Tech:** vanilla JS, custom CSS (Playfair Display + Material Symbols Rounded), Firebase RTDB, IndexedDB, PWA.
- **Entry:** `index.html`, `app.js`, `style.css`, `manifest.json`.
- **Deploy:** GitHub Pages at `/tayo/`.
- **Quirks:** Two-user mode (Charlie + Karla). Partner-dot indicator when other user online. IndexedDB for offline + sync queue.

### vm-management/  🟢

Sunday church volunteer management — sign-in, role assignment, equipment (comms) queue, admin monitor.

- **Tech:** vanilla JS (~2,118 lines), Tailwind, Material Icons Round, Firebase RTDB.
- **Entry:**
  - `index.html` — public sign-in (volunteer entry)
  - `script.js` — sign-in logic, pre-service slot setup
  - `monitor.html` + `monitor.js` — admin-only dashboard (~2,420 lines, not linked publicly)
  - `admin.js` — comms history panel (~485 lines)
  - **`CLAUDE.md`** — already has full architecture reference in the project root
- **Deploy:** GitHub Pages at `/vm-management/`.
- **Quirks:**
  - Service batching: AM (9AM + 12NN, sky color) and PM (3PM + 6PM, violet)
  - Unlimited role types for volunteers/trainees/observers/TDs; others limited to one
  - Comms queue: `pendingCommsId` reserves equipment without releasing current; auto-assign on release
  - Always Philippine time (`getPHDate()` / `getPHHour()`)
  - **No auto-timeout** — only manual user/admin action
- **Full docs:** See `vm-management/CLAUDE.md` (already in repo).

### weddingtest/  🟢

**THE ACTUAL WEDDING INVITATION** despite the misleading name — Charlie & Karla, July 2, 2026.

- **Tech:** vanilla JS (~44 KB), Tailwind (CDN + custom), custom CSS animations, Playfair Display + Inter fonts.
- **Entry:** `index.html` (~106 KB; intro overlay, monogram, RSVP, timeline, music), `script.js`, `style.css`, `guestlistmanager/` submodule.
- **Deploy:** GitHub Pages at `/weddingtest/` — **never delete or rename** (live invitation link).
- **Quirks:** Name "test" refers to initial build phase, NOT throwaway. Features RSVP form, photo gallery, timeline, scroll progress bar, monogram intro. Latest commit Feb 10, 2026.

---

## Core Infrastructure

### cockpit/  🟢

Local web UI for Claude Code CLI — mode-based workflows, knowledge-MD pre-loading, live token budget meter.

- **Tech:** Python 3.12, FastAPI, uvicorn, async subprocess runner, Tailwind frontend, marked.js.
- **Entry:** `server.py`, `runner.py`, `modes/*.json`, `public/index.html`.
- **Deploy:** Local only — `uvicorn server:app --host 127.0.0.1 --port 5050`.
- **Quirks:** Uses Claude Code's Keychain auth (Max sub billing); no `ANTHROPIC_API_KEY` required. WS disconnect = SIGTERM to in-flight subprocess.
- **Full docs:** See `cockpit/README.md`.

### gemini-proxy/  🟢

Backend proxy for Gemini API — used by devo (explanations), pray (intercession AI), and others. Also hosts the `/upload-drive` endpoint used by sns-dq, and locally hosts the `drive-helper.mjs` Drive CLI for read/write tasks outside the `drive.file` scope.

- **Tech:** Node.js (Express), node-fetch, Google Cloud Run (asia-southeast1, project 668755364170), Firestore (push subs), Cloud Scheduler.
- **Entry:** `index.js`, `package.json`, `Dockerfile`, `DEPLOY.md` (full setup guide), `drive-helper.mjs` (local CLI — see `knowledge/drive-helper/SUMMARY.md`).
- **Deploy:** Cloud Run (asia-southeast1). Daily 3 PM PHT trigger via Cloud Scheduler. `drive-helper.mjs` is local-only.
- **Quirks:**
  - Provides `/send-reminder` endpoint (Cloud Scheduler-driven daily reminders)
  - Stores push subscriptions in Firestore
  - Free tier eligible
  - **Never commit `GEMINI_API_KEY`** — use environment variables at deploy time
  - **Drive auth split:** the deployed `/upload-drive` endpoint uses the **`drive.file`** scope (per-file, set up by `setup-drive-oauth.sh`, refresh token in Cloud Run env vars). The local `drive-helper.mjs` uses a separate OAuth client (Desktop type, in Testing mode) with the **full `drive`** scope — needed because `drive.file` can't see files the app didn't create. Local creds in `gemini-proxy/.drive-client.json` + `gemini-proxy/.drive-creds.json` (both gitignored).

### functions/  🟡

Firebase Cloud Functions skeleton — currently associated with WeddingBar Firebase Hosting setup.

- **Tech:** Node.js 20, firebase-admin, firebase-functions.
- **Entry:** `package.json`, `index.js`.
- **Deploy:** Firebase Deploy (`firebase deploy`).
- **Quirks:** **Security update Apr 26**: service account key untracked from version control; uses runtime IAM credentials. No public docs of deployed functions.

### firebase.json  ✅

Firebase Hosting + Functions configuration. Currently routes Hosting public to `weddingbar/`.

### index.html (root)  ✅

Root hub/landing page for `chaelri.github.io` — lists active projects with cards, dark theme.

- **Tech:** Tailwind v4 (browser build, no build step), Material Symbols Outlined, Pacifico display font.
- **Deploy:** GitHub Pages root (`https://chaelri.github.io`).
- **Quirks:** Recently rebuilt (Apr 26) with Tailwind v4. Redirect loader for tunnel check via `?redirect=` query param.

### knowledge/  ✅

Markdown documentation hub for Claude sessions — populated as part of cockpit build (Day 4, Apr 26-27).

- **Structure:**
  - `knowledge/devo/` — 8 deep MDs for devo PWA
  - `knowledge/hub/PROJECTS.md` — this file
- **Deploy:** Local only (not published; for Claude Code context).
- **Quirks:** Living docs — update as projects evolve.

---

## Parked Projects

### flux/  🟡

Digital planner / task management app — todo lists, calendar, dark mode toggle.
- **Tech:** vanilla JS, Tailwind + custom CSS, Material Icons, PWA.
- **Entry:** `index.html`, `script.js`, `style.css`, `sw.js`, `manifest.json`.
- **Deploy:** GitHub Pages `/flux/`. Last commit Apr 9.
- **Quirks:** Full offline support (SW + localStorage). No backend.

### pray/  🟡

Prayer request app with AI-powered intercession via Gemini proxy.
- **Tech:** vanilla JS, Tailwind + custom CSS, fire animation (CSS + canvas), PWA.
- **Entry:** `index.html`, `app.js`, `style.css`, `manifest.json`.
- **Deploy:** GitHub Pages `/pray/`. Last commit Jan 11.
- **Quirks:** Calls `gemini-proxy` for AI intercession. Fire animation on submit. No persistence (fire-and-forget).

### echoes/  🟡

Instagram-style story sharing for Charlie & Karla — real-time feed via Firebase.
- **Tech:** vanilla JS, Tailwind v4 (browser build), Material Icons, Firebase RTDB (assumed), PWA.
- **Entry:** `index.html`, `script.js`, `style.css`.
- **Deploy:** GitHub Pages `/echoes/`. Last commit Jan 24.
- **Quirks:** Dual-login (Charlie/Karla persona). Real-time updates assumed via Firebase.

### wedding100/  🟡

Countdown to wedding (July 2, 2026) — animated 3D confetti, progress bar.
- **Tech:** vanilla JS, Tailwind, Three.js (3D confetti), canvas-confetti, Firebase RTDB.
- **Entry:** `index.html`, `script.js`, `style.css`.
- **Deploy:** GitHub Pages `/wedding100/`. Last commit Sep 2024.
- **Quirks:** Simple countdown — **NOT the actual invitation** (that's `weddingtest/`).

### weddingbar/  🟡

Cost tracker for wedding bar / beverages — expense tracking with category reports.
- **Tech:** vanilla JS, Tailwind, Material Icons, PWA, Firebase RTDB (implied).
- **Entry:** `index.html`, `script.js`, `style.css`, `manifest.json`, `sw.js`.
- **Deploy:** **Firebase Hosting root** (per `firebase.json`'s `"public": "weddingbar"`); also `/weddingbar/` on GitHub Pages.
- **Quirks:** This is the Firebase Hosting public dir — separate from `weddingtest/` (invitation).

### weddingtimeline/  🟡

Wedding day binder / timeline — vendor info, schedules, guest assignments.
- **Tech:** vanilla JS, Tailwind, Material Icons, PWA.
- **Entry:** `index.html`, `script.js`, `style.css`, `manifest.json`, `assets/`.
- **Deploy:** GitHub Pages `/weddingtimeline/`. Last commit Jan 24.
- **Quirks:** Read-only reference for wedding day. Vendor contact + timing.

### horizon/  🟡

Financial future planner — investment projections, net-worth tracking, charts.
- **Tech:** vanilla JS (~60 KB), Tailwind, Chart.js, Material Icons Round, Inter + Space Grotesk fonts.
- **Entry:** `index.html` (~27 KB), `script.js` (~60 KB), `style.css`.
- **Deploy:** GitHub Pages `/horizon/`. Last commit Apr 16.
- **Quirks:** Heavy calculation (compounding, tax). Chart.js visualizations. No backend.

### money/  🟡

Personal budget tracker ("CHALEE" branding) — daily expenses, category breakdown.
- **Tech:** vanilla JS (~82 KB), Tailwind, Material Icons, PWA.
- **Entry:** `index.html` (~30 KB), `script.js` (~82 KB), `style.css`, `manifest.json`.
- **Deploy:** GitHub Pages `/money/`. Last commit Apr 16.
- **Quirks:** All data localStorage (no sync). Branded "CHALEE" for Charlie.

### anohana/  🟡

Anime fan site — character gallery, episode guide, fan reflections.
- **Tech:** vanilla JS, custom CSS, PWA.
- **Entry:** `index.html`, `app.js`, `style.css`, `manifest.json`.
- **Deploy:** GitHub Pages `/anohana/`. Last commit Sep 2024.
- **Quirks:** Personal fan content. No backend, no auth.

### animedownloader-ext/  🟡

Chrome extension — bulk anime downloader for AnimePahe via LiveChart discovery.
- **Tech:** Chrome Extension (Manifest v3), background service worker, content scripts.
- **Entry:** `manifest.json`, `background.js`, `content/livechart.js`, `content/animepahe.js`, `content/kwik.js`, `content/pahe.js`, `content/guard.js`, `popup/popup.html`.
- **Deploy:** Manual install in Chrome; not on Web Store.
- **Quirks:** Broad host permissions across animepahe variants. Content scripts at `document_start` for video guard bypass. Likely needs updates if target sites change.

### bubududu/  🟡

Simple side-scrolling platformer (Bubu & Dudu) — canvas-based game.
- **Tech:** HTML5 Canvas, vanilla JS (no game engine), custom CSS.
- **Entry:** `index.html`, `game.js`, `style.css`, `assets/`.
- **Deploy:** GitHub Pages `/bubududu/`. Last commit Apr 9.
- **Quirks:** Lightweight (no Phaser/Babylon). Canvas-only rendering.

---

## Deployment Quick Reference

| Project | Hosting | Auto-deploy on push? |
|---|---|---|
| devo, monthsary, tayo, sns-dq, weddingtest, towa-no-yuugure, autoclicker, aircon, pocket-remote, collaterals, flux, pray, echoes, wedding100, weddingtimeline, horizon, money, anohana, bubududu | GitHub Pages subpath | ✅ |
| guard-exit-interview | GitHub Pages — **DUAL-REPO** (also push to `guard-exit-tracker`) | ✅ |
| vm-management | GitHub Pages `/vm-management/` | ✅ |
| weddingbar | Firebase Hosting (root via `firebase.json`) — also GH Pages `/weddingbar/` | `firebase deploy` |
| functions | Firebase Cloud Functions | `firebase deploy` |
| gemini-proxy | Google Cloud Run (asia-southeast1, project 668755364170) | Manual / CI |
| cockpit | Local only (`uvicorn`) | Manual |
| devo-mobile | Expo Dev / EAS | Manual |
| animedownloader-ext | Chrome (manual install) | Manual |
| index.html (root) | GitHub Pages `/` | ✅ |
