# kart/ (Karera) — SUMMARY

Offline Mario Kart-style racer built 2026-10-09. Mac = split-screen display (up to 3 humans + CPUs, 4th quadrant = minimap/standings), phones = wheels. Drivers are the bubududu-smash/3d critters (GLBs copied into `assets/`).

- **Run:** `python3 kart/server.py` → board `http://localhost:8810/`, phones `http://<lan-ip>:8810/p`, tilt page `https://<lan-ip>:8811/p`.
- **Board owns the race.** `js/sim.js` steps at fixed 60 Hz in the board tab; the server only relays (`/ws?role=board` localhost-only, `/ws?pid=` phones). Phones send `{t:"in", s,g,b,d,i}` ~30 Hz; board sends `{t:"st",...}` ~6 Hz. Item presses are counters, not booleans.
- **Tilt needs HTTPS** (DeviceMotion is secure-context only). Self-signed cert via `/usr/bin/openssl`, regenerated when LAN IPs change. Steering = signed angle of gravity in the screen plane vs a calibration vector, so iOS/Android sign conventions cancel out.
- **Busy-port check is load-bearing.** `bind()` connects to 127.0.0.1:port first and skips it if anything answers. With SO_REUSEADDR (kept, so a restart rebinds 8810 at once instead of drifting to 8812) macOS otherwise let the server silently share a port another process held on 127.0.0.1, so the board talked to the wrong server.
- **Layout:** 1 player full screen, 2 stacked, 3 side-by-side columns (wider FOV via `cam.userData.fovAdd`, minimap bottom of the middle column), 4 = 2x2 with the map quadrant. CPU racers default to 0.
- **Road ribbon winding** must be (a, a+1, a+2)/(a+1, a+3, a+2) or the road is culled from above.
- three.js r186 vendored in `vendor/three/` + GLTFLoader/BufferGeometryUtils/SkeletonUtils fetched once at 0.186.1; the import map maps bare `"three"` for the addons. PCFSoftShadowMap is gone in r186.
- Critter GLBs are merged per material at load (~25 meshes → ~8). 3-player split screen holds 60 fps on the M5.
- **Testing:** `node kart/_selftest.mjs N`; `?autopilot` on the board makes the CPU drive human karts; press K to add keyboard players.
