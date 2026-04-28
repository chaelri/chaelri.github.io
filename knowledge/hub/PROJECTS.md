# Hub Project Index for chaelri.github.io

**Last updated:** 2026-04-28
**Scope:** Complete mapping of top-level directories + root files, with tech stack, deployment, status, and key entry points.

## Status Legend

- 🟢 **Active** — in regular use, recent commits, ongoing maintenance expected
- 🟡 **Parked** — functional but not under active development; may be resumed
- ✅ **Stable** — configuration/documentation file, no changes needed regularly

---

## Active Projects

### devo/  🟢

Bible devotional progressive web app (PWA) — daily passages, AI explanations, drawing canvas, TTS, Firebase sync.

- **Tech:** vanilla JS (~9,881 lines split across 11 chunks under `devo/js/`), CSS, PWA (service worker), Firebase RTDB, IndexedDB, Gemini API via proxy.
- **Entry:** `index.html`, `js/01-core.js` … `js/11-boot.js` (loaded in order by `firebase-sync.js` with `async=false`), `style.css`, `firebase-sync.js` (Charlie-only sync), `manifest.json`.
- **Deploy:** GitHub Pages at `/devo/`.
- **Quirks:** Uses NASB 2020 + Easy-to-Read JSON files (~10 MB total). AI calls go through `gemini-proxy/`. Firebase sync gates on `userName === "charlie"`. Synchronous cross-chunk calls only work via `js/11-boot.js` — earlier chunks must only DEFINE functions, never trigger forward chains.
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

Backend proxy for Gemini API — used by devo (explanations), pray (intercession AI), and others.

- **Tech:** Node.js (Express), node-fetch, Google Cloud Run (asia-southeast1, project 668755364170), Firestore (push subs), Cloud Scheduler.
- **Entry:** `index.js`, `package.json`, `Dockerfile`, `DEPLOY.md` (full setup guide).
- **Deploy:** Cloud Run (asia-southeast1). Daily 3 PM PHT trigger via Cloud Scheduler.
- **Quirks:**
  - Provides `/send-reminder` endpoint (Cloud Scheduler-driven daily reminders)
  - Stores push subscriptions in Firestore
  - Free tier eligible
  - **Never commit `GEMINI_API_KEY`** — use environment variables at deploy time

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
| devo, monthsary, tayo, sns-dq, weddingtest, towa-no-yuugure, flux, pray, echoes, wedding100, weddingtimeline, horizon, money, anohana, bubududu | GitHub Pages subpath | ✅ |
| guard-exit-interview | GitHub Pages — **DUAL-REPO** (also push to `guard-exit-tracker`) | ✅ |
| vm-management | GitHub Pages `/vm-management/` | ✅ |
| weddingbar | Firebase Hosting (root via `firebase.json`) — also GH Pages `/weddingbar/` | `firebase deploy` |
| functions | Firebase Cloud Functions | `firebase deploy` |
| gemini-proxy | Google Cloud Run (asia-southeast1, project 668755364170) | Manual / CI |
| cockpit | Local only (`uvicorn`) | Manual |
| devo-mobile | Expo Dev / EAS | Manual |
| animedownloader-ext | Chrome (manual install) | Manual |
| index.html (root) | GitHub Pages `/` | ✅ |
