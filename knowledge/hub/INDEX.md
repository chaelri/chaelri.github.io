# Hub Index (compact)

One line per project. Full detail (tech, deploy, quirks) lives in `knowledge/hub/PROJECTS.md` — grep or read only the section for the project you are working on, never the whole file. Per-project deep MDs live in `knowledge/<project>/`.

**Active**
- `camera01-archive/` — day-folder of Insta360/phone clips → 1080p60 mp4 → unlisted YouTube (local, ffmpeg + yt-helper.mjs)
- `sherill/` — Tita Sherill's Nissan sales site; own Vercel project `drive-with-sherill` (re-set alias after deploy) + `/sherill/`
- `kain/` — photo-first food log (Gemini reads the plate), RTDB, live daily use: never write its data
- `ilaw/` — co-op lantern/shadow game, Mac screen + iPhone controllers over WebRTC
- `bubududu-smash/` — local-WiFi versus platformer, Mac screen + phone controllers; `classic/` is frozen
- `autoclicker/` — ESP32-C3 servo SwitchBot docs + `/phone/` remote (RTDB)
- `aircon/` — ESP32-C3 IR aircon controller docs + `/phone/` remote (RTDB)
- `pocket-remote/` — battery ESP32-C3 + OLED remote for autoclicker + aircon
- `clickflow/` — macOS click-macro app (swiftc, `./build.sh install`) + Windows C# port
- `claude-terminal/` — Windows taskbar "Claude" terminal window (VS Code + local extension)
- `laro/rambulan/`, `laro/karera/` — offline three.js brawl royale + kart racer, phones as controllers (local)
- `phone-drop/` — iPhone → Mac file receiver via QR (local)
- `splat/` — Gaussian-splat viewer + isolation script
- `claude-usage/` — menu bar Claude plan usage % (LaunchAgent) + VS Code twin
- `diskscope/` — local disk-usage browser (`python3 serve.py`)
- `mac-toggle/` — RTDB remote for Mac display sleep (root LaunchDaemon agent)
- `collaterals/` — wedding print collaterals studio (SVG → PNG → Drive)
- `elevate-eo-campus-unite-2026/` — event tickets/registration/raffle app
- `rubiks/` — CFOP course with live 3D cube + scan-and-solve tab
- `driving/` — three.js driving sim for LTO practice
- `devo/` — Bible devotional PWA (11 ordered chunks in `devo/js/`, RTDB sync for charlie/karla)
- `guard-exit-interview/` — guard offboarding tracker; DUAL-REPO push (also `guard-exit-tracker`)
- `monthsary/` — monthsary page with Google sign-in gate
- `sns-dq/` — discussion-questions image generator → Drive
- `towa-no-yuugure/` — episode viewer (sister of `anohana/`)
- `tayo/` — Charlie & Karla journal PWA
- `vm-management/` — Sunday volunteer sign-in/monitor (has own CLAUDE.md)
- `weddingtest/` — the LIVE wedding invitation; never rename/delete

**Infra**
- `gemini-proxy/` — Cloud Run Express proxy (Gemini, edge-tts, upload-drive) + local `drive-helper.mjs`
- `cockpit/` — local FastAPI UI over `claude -p`
- `functions/` + `firebase.json` — Firebase Functions/Hosting (public: `weddingbar/`)
- `index.html` — root hub page

**Parked** — `devo-mobile/`, `flux/`, `pray/`, `echoes/`, `wedding100/`, `weddingbar/`, `weddingtimeline/`, `horizon/`, `money/`, `anohana/`, `animedownloader-ext/`, `bubududu/`
