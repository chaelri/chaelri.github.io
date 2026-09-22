# ilaw/ — Ilaw at Anino

**Built:** 2026-09-22
**Status:** 🟢 Active — playable end to end, three levels
**Live:** GitHub Pages at `/ilaw/`; controller at `/ilaw/phone/`

Asymmetric co-op game for Charlie + Karla. The MacBook is the shared screen and
owns the whole simulation; the two iPhones are controllers that stream input and
render nothing. One player aims a lantern with the phone's gyro, the other walks
a character who can only see what the beam is on.

## The load-bearing design decision

The lantern is a **separate object from the walker**, not carried on her.

This was not the first design. The original pitch had the light originating from
the walker — but then she sits at the apex of every shadow she casts and can
never stand in one, which kills the shadow-bridge mechanic outright. Making the
lantern placeable fixed it and turned out to be the whole game:

- **carried** — the light follows her, she can always see, no shadow to stand in
- **placed** — the light is anchored, she can walk into the dark, and a pillar
  with the lantern behind it casts an umbra that is solid ground over a chasm

Corollary that constrains every level: she can cross a chasm on a shadow but can
never carry the lantern over one. So a level has **one chasm, or a second
lantern waiting past the first**. `levels.js` says this in a comment; breaking
it strands her in the dark with no light source and no way back.

The bridge is bidirectional as long as the beam is held, so there is no
soft-lock — only the lantern is ever stranded, never the player.

## Tech

- Vanilla ES modules, no build step, no binary assets. Every pixel is drawn at
  runtime (inline canvas paths + gradients), same posture as `driving/`.
- Canvas 2D with five offscreen layers. Tailwind is **not** used — hand-written
  CSS, Inter + Playfair Display.
- Firebase RTDB (`test-database-55379`) for **signalling only**; gameplay runs
  over a WebRTC data channel direct between the phones and the Mac on the LAN.
- WebAudio synthesis for all sound. No audio files.
- No auth. Root RTDB rules are already `.read/.write: true`, so `/ilaw` needed no
  rules change.

## Entry points

| File | What it is |
|---|---|
| `index.html` | the screen — lobby, then the game |
| `phone/index.html` | the controller, both roles, gated by `body[data-role]` |
| `js/world.js` | the simulation; `createGame`, `step`, `idle`, `inCastShadow` |
| `js/geom.js` | `visibilityPolygon`, `isOccluded`, `castDistance` |
| `js/net.js` | `createHost` / `createClient` — room code, WebRTC, RTDB fallback |
| `js/screen.js` | host loop, level flow, keyboard/mouse fallback |
| `js/phone.js` | controller; the gyro → beam-angle maths |
| `js/config.js` | all tuning in one place (`TUNING`) |
| `js/levels.js` | three levels in world units (44 × 26) |
| `_selftest.html` | headless regression harness — see below |

## RTDB shape

```
ilaw/rooms/<CODE>/
  created                     ms epoch; onDisconnect removes the whole room
  peers/<peerId>/
    role, name, joined
    offer   { type, sdp }     written by the screen
    answer  { type, sdp }     written by the phone
    hostIce/<k>, peerIce/<k>  trickled candidates
    relay   { …input… }       fallback lane, only read while p2p is down
```

Ephemeral by construction — nothing about the game is ever written here, and the
room deletes itself when the screen's tab closes.

## Quirks

- **A cone visibility polygon must close through the light's own position.** A
  full 360° fan wraps onto itself and does not need the apex vertex; a partial
  cone does. Without it the filled shape becomes the region *between the two
  ends of the arc*, which renders every shadow as the only lit thing on screen —
  perfectly inverted. This was the first real bug and it is not obvious from
  looking at the code.
- **Rendering nudges each ray hit 0.22 units past the surface** (`SKIN` in
  `geom.js`) so walls and pillars catch the light instead of sitting just
  outside the lit polygon and staying invisible. `isOccluded()` — which decides
  what is solid ground and what burns — deliberately stays exact.
- **The mask canvas is painted amber, not white.** `destination-in` uses only
  alpha, so masking is unaffected, and the same canvas can then be screened over
  the frame as the warm glow. Collapsed a re-tint pass out of the compositor.
- **Static geometry is baked once per level** (`bakeStatic`). Redrawing the floor
  grid every frame was most of the draw cost: 29 ms → 0.08 ms on GPU.
- **`#lantern`'s ID specificity beat the role-gating class rule**, leaking the
  Anino button onto the Ilaw controller. The gate carries `!important` on
  purpose.
- **Button presses travel as counters, not booleans.** The data channel is
  `{ordered: false, maxRetransmits: 0}`; a boolean edge can vanish, a counter
  that incremented is unambiguous whenever it lands. `screen.js` also handles the
  counter going *backwards*, which is what a phone reload looks like.
- **`webkitCompassHeading` is deliberately unused.** Absolute and drift-free, but
  magnetometer-based, and they play sitting next to a laptop full of magnets.
  The beam is relative to the last Re-centre tap instead, derived from the
  W3C alpha/beta/gamma rotation matrix.
- **The gyro heading axis is picked once, at calibration.** Re-picking live would
  snap the beam 90° the moment the phone tipped past vertical.
- **The flare reveals and repels but does not touch shadows.** Making it a real
  light meant popping one mid-crossing dropped her into the chasm — a betrayal,
  not a mistake.
- **Not linked from the root hub page**, same posture as `mac-toggle/` and
  `kain/`. The room code is the only gate.

## Self-test

`_selftest.html` steps all three levels 420 frames each, draws every frame, and
reports errors plus per-phase timings. `?shot=play` leaves a gameplay frame on
the canvas, `?shot=bridge` (default) leaves the shadow-bridge frame. Title reads
`SELFTEST OK` / `SELFTEST FAIL`, so it greps cleanly from headless Chrome:

```sh
python3 -m http.server 8777
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --use-angle=metal --enable-gpu --window-size=1600,1000 \
  --virtual-time-budget=25000 --dump-dom \
  "http://127.0.0.1:8777/ilaw/_selftest.html"
```

Note: the real game cannot be screenshotted this way — its rAF loop never lets
the virtual-time budget expire. That is why the harness exists.

## Not built yet

- No level 4+; `LEVELS` in `levels.js` is the only thing to extend.
- No haptics from the screen back to the phones (the data channel is one-way in
  practice; the return path exists but is unused).
- No persistence — no best times, no completion record.
