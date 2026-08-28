# driving/ — Driving Range (project context)

Browser driving simulator for LTO practical-exam practice: real automatic
gearbox behaviour, idle creep, engine braking, three mirrors, random town and
traffic. No build step, no backend, no binary assets.

@../knowledge/driving/SUMMARY.md

## Working on this

- Run it: `python3 -m http.server 8899` from the repo root, then open
  `http://127.0.0.1:8899/driving/`. ES modules need a server; `file://` will not
  work.
- Two coordinate frames are in play (math X/Y-left/psi-CCW vs THREE x/z=-Y).
  Read the "Coordinate frames" section of the SUMMARY before touching geometry.
- The drivetrain in `js/vehicle.js` is a real model — creep and engine braking
  are emergent, not scripted. Do not "fix" them with special cases.
- Verify physics changes by stepping `vehicle.update()` directly in the console
  rather than by driving: background tabs suspend requestAnimationFrame.
