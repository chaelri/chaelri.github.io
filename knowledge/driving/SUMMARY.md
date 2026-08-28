# driving/ — Driving Range

**Purpose:** Browser driving simulator built so Charlie can practise for the LTO
practical exam after finishing PDC. Emphasis is on the things an actual test
looks at: the start-up routine, brake-shift interlock, idle creep, engine
braking, mirror use and parking accuracy — not on lap times.

**Status:** 🟢 Active. Built 2026-08-28.
**Deploy:** GitHub Pages at `/driving/`. No build step, no backend, no assets on
disk — every texture and mesh is generated at runtime.

---

## Stack

- **three.js 0.169** via jsDelivr + an import map. Core only; no addons.
- Vanilla ES modules, hand-written CSS, Inter + JetBrains Mono + Material Symbols.
- WebAudio synthesis for the engine, tyres, indicator relay and horn.

## Entry points

| File | What it is |
|---|---|
| `index.html` | Page shell: canvas, mirror bezels, HUD, mission menu, results |
| `style.css` | All styling. Dark cockpit palette |
| `js/main.js` | Renderer, cameras, the three mirrors, fixed-step loop, collisions, glue |
| `js/vehicle.js` | The driving model (engine → converter → 4-speed auto → tyres) |
| `js/carmodel.js` | The car asset: body loft, greenhouse, glass, interior, wheels |
| `js/world.js` | Procedural town: roads, kerbs, buildings, car parks, traffic lights, range |
| `js/traffic.js` | AI cars on the lane network |
| `js/meshbuilder.js` | Geometry accumulator (`MeshBuilder`, `openRing`, `roundedRing`) |
| `js/textures.js` | Canvas-generated asphalt, concrete, grass, facades, sky |
| `js/missions.js` | The six exercises, live metrics and LTO-style fault scoring |
| `js/hud.js` | Gauges, gear gate, steering readout, minimap, toasts |
| `js/audio.js` | Synthesised engine + road noise |
| `js/input.js` | Keyboard, touch pads, event bus |

## Controls

`W` gas · `S` brake · `A`/`D` steer · `Space` handbrake ·
`↑`/`↓` move the lever through **P R N D L** · `Enter` start/stop ·
`Q`/`E` signals · `H` horn · `L` headlights · `C` camera · `M` mirrors ·
`T` day/night · `R` recover · `N` new town · `P` pause.

Start-up routine, deliberately the real one: hold the brake → `Enter` to start →
still braking, `↓` to **D** → release the brake and the car creeps → squeeze `W`.

---

## Load-bearing details

### Coordinate frames
Two frames, and mixing them up is the classic bug here.
- **Math frame** (`vehicle.js`, `world.js`, `traffic.js`, `missions.js`):
  X forward/east, **Y left/north**, `psi` CCW (left-positive).
- **THREE frame**: `three.x = X`, `three.z = -Y`, `group.rotation.y = psi`.
- The **car model** is built facing local **+X**, with **+Z = right** and the
  wheel contact patches at `y = 0`.
- `MeshBuilder`'s `rotY` is the negative of `psi` — `world.js` wraps this in
  `mbRot()`, and every world helper (`gnd`, `bx`, `strp`) does the conversion.

### The drivetrain is a real model, not a curve fit
`vehicle.js` integrates engine speed as a state with its own inertia, feeds it
through a **torque converter** (capacity `C·ω²·(1−sr²)`, torque ratio 2.1→1.0),
then a 4-speed box and final drive to the **front** wheels. Consequences that
the sim depends on:
- **Creep** is idle torque multiplied by a stalled converter. Settles at
  ~6.6 km/h forward, ~5.6 km/h reverse, and stops on its own as the turbine
  catches the engine. Nothing scripts it.
- **Engine braking** is the engine's own friction torque fed back through a
  **lock-up clutch** (3rd/4th at cruise, or always in **L**). Measured coast
  deceleration: 0.58 m/s² in D, **1.15 m/s² in L**.
- Two bugs worth remembering, both fixed 2026-08-28:
  1. A `|vx| < 0.02 → vx = 0` jitter clamp silently killed creep, because creep
     needs several steps to climb past 2 cm/s. Standstill is now decided by
     comparing drive force against brake + rolling resistance, not by a speed
     threshold.
  2. The downshift threshold at full throttle (4300 rpm) sat *above* the rpm the
     car actually ran at in the higher gears, so WOT cascaded 4→3→2→1 and hit
     the limiter at 62 km/h. A downshift now also has to satisfy
     `projectedRpm < upshiftRpm × 0.94`.

### Steering
The wheel has 540° of lock and moves at a finite rate (≈560 °/s at rest,
250 °/s at speed), with caster self-centring — that is why you can watch it wind
on. Steering ratio 15.43 : 1 → 35° at the road wheel → 8.3 m turning circle
measured at the CG.

Below ~1.4 m/s the model blends to **exact Ackermann kinematics**, so parking
geometry and reversing are correct rather than slip-angle mush.

### The three mirrors
Each mirror renders the scene from a camera parented to `bodyNode` into its own
`WebGLRenderTarget`, then composites as a screen-space quad with
**`scale.x` negated** — that is the mirror flip, and it avoids the winding /
back-face mess you get from negating the projection matrix. The DOM bezels in
`index.html` are positioned from the same pixel rects in `layoutMirrors()`.
`renderer.shadowMap.autoUpdate = false` + one manual `needsUpdate` per frame
stops the shadow map being re-rendered four times.

Mirrors are only drawn in the cockpit and bonnet views.

### The car body is an OPEN shell
`openRing()` sweeps a squircle cross-section but **stops short of the top centre
on both flanks**, so the cabin is a real aperture. Bonnet and boot decks are laid
across the gap; the middle is left open for the interior. Notes:
- The profile uses **two exponents** — 5.5 above the waist (flat, so the door
  tops land at the belt line) and 3.0 below (rounded flanks). They meet
  continuously because both give `k = 1` at the waist.
- With exponent 3.4 everywhere the aperture edge landed 13 cm *below* the belt
  and the doors rendered as open dark slots. This is the thing to check first if
  the flanks ever look wrong again.
- `paintMat` is `DoubleSide`: an open shell has to draw its inner face.
- Interior panels must stay well inboard — the shell narrows toward the sill, so
  a door card at |z| = 0.79 pokes straight through it. They now sit at 0.745.
- `paintMesh.receiveShadow = false`. At 3 cm shadow-map texels the car's
  self-shadow is nothing but blocky acne across the flanks.
- Wheel geometry is built with its **axle already on +Z**. Do not re-orient it;
  an extra 90° fix-up makes the wheels roll about the car's forward axis.

### Draw-call budget
Three detail levels in `buildCar()`:
- `'high'` — the car you drive: separate lamp materials, split tyre/rim, live
  steering wheel and interior.
- `'low'` — AI traffic: animated wheels and independent brake lights, merged
  tyre+rim (4 wheel meshes instead of 8).
- `'static'` — parked scenery: lamps and wheels **baked into the merged body**,
  so a parked car costs three draw calls instead of sixteen.

Parked cars are capped at 64. Whole scene: ~400 meshes / 350 k triangles, and a
cockpit frame with all three mirrors runs 40–60 draw calls after culling. Before
the bake it was 2,256 meshes.

### World
6 × 6 road grid, 74 m blocks, 11 m carriageways, 3.4 m lanes, right-hand traffic.
Cell (0,0) is always the **driving range** — perpendicular bays, a 7 m parallel
box between two parked cars, 45° angle bays and a seven-cone slalom. Other cells
are randomly buildings / car park / park / vacant from the seed. Traffic lights
sit on up to six interior junctions on a 22 s cycle.

Everything static is baked into six merged meshes by `MeshBuilder` — ground,
asphalt, paint, kerbs, buildings, props — so four render passes stay cheap.

### Missions and faults
Free drive · back-in parking · parallel parking · angle parking · cone slalom ·
city route. A parking exercise is passed when all four corners of the car sit
inside the bay, heading error < 8°, stopped, **and the selector is in P**.
Faults: collision 18, ran a red 14, wrong side 8, cone 6, kerb 5, off road 4.

---

## Gotchas

- **`document.hidden` suspends rAF.** Background tabs freeze the sim; `raw` dt is
  clamped to 0.25 s and substeps are capped at 8, so returning is safe.
- The gear gate refuses illegal moves and says why — that messaging *is* the
  teaching content, so keep the interlock rules in `requestShift()` intact.
- `world.spawn` must be a lane centre, not a grid centreline: starting on the
  centreline puts the car half in the oncoming lane and inside a junction.
- `Traffic` takes a `keepClear` point (defaults to `world.spawn`) and refuses to
  spawn within 30 m of it.
- No Firebase, no analytics, no network calls beyond the three.js CDN and Google
  Fonts.
