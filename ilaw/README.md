# Ilaw at Anino

A co-op game for two phones and one screen. The MacBook is the only thing
either of you looks at. One of you holds the light; the other walks.

Neither of you can finish a level alone, and that is the whole design:

- **Ilaw** can see everything but cannot move anything.
- **Anino** can move but can only see what the other one is pointing at.

## The one mechanic worth knowing

She starts carrying the lantern, so the light follows her and she can always
see her feet. She can also **put it down**.

That single button is the game. A placed lantern stays put, which means she can
walk away from it — into the dark, and into the shadows it casts. And because a
shadow is only ever cast *behind* something, a pillar with the lantern behind
it throws an umbra that is **solid ground over a chasm**.

So: carry it and see, or set it down and be able to cross. The person aiming
has to hold the beam steady on the pillar while she walks the shadow, and the
bridge disappears the instant he looks away.

The corollary is that she can cross a chasm but can never carry the lantern
over one. Levels are built around that — a level has one chasm, or it has
another lantern waiting on the far side.

## Playing

1. Open `https://chaelri.github.io/ilaw/` on the MacBook and go fullscreen.
2. Both phones open `/ilaw/phone/` — or just scan the QR on the screen.
3. Pick a side, tap Join. It starts on its own once both are in.

Everything needs to be on the same WiFi.

**Ilaw** holds the phone flat, like a compass, and turns it — the beam turns
with it. Hold anywhere on the screen to focus the beam down to a longer, tighter
spotlight. `Flare` is a panic burst on a cooldown. `Re-centre` makes wherever
the phone is pointing now mean "straight right", which is also the fix if the
aim ever drifts.

**Anino** touches anywhere and drags to walk. `Lantern` sets it down or picks it
back up.

### Without phones

The screen plays on its own — handy for testing, or when a battery dies.
Keyboard and mouse take over any role that has no phone attached.

| | |
|---|---|
| walk | `WASD` / arrows |
| aim | mouse |
| focus | hold mouse button |
| lantern | `E` |
| flare | `space` |
| restart level | `R` |

`?solo=1` skips the lobby entirely and starts on the keyboard.

## How it connects

Firebase is used **only** to swap WebRTC offers. Once the handshake lands the
phones talk straight to the MacBook over the LAN, which is what makes gyro
aiming feel attached to your hand rather than arriving from Singapore a tenth of
a second late. The pill on each phone says `direct` when that worked.

If it says `relay`, the peer-to-peer connection failed — most often a router
with client isolation switched on — and input is going through RTDB instead.
Playable, just laggier.

What ever reaches the database is a four-character room code, two SDP blobs and
some ICE candidates, and the room deletes itself when the screen's tab closes.

## Files

```
index.html          the screen: lobby, then the game
phone/index.html    the controller, both roles
js/config.js        tuning — speeds, beam angles, hearts
js/geom.js          rays and the visibility polygon
js/world.js         the simulation (the screen owns all of it)
js/render.js        canvas compositing
js/levels.js        level data, in world units
js/net.js           room + WebRTC + the RTDB fallback
js/screen.js        host loop, lobby, keyboard fallback
js/phone.js         controller, including the gyro maths
js/audio.js         synthesised sound; no audio files
_selftest.html      runs all three levels headless and reports errors + timings
```

No build step, no assets — every pixel is drawn at runtime.

### Self-test

```sh
python3 -m http.server 8777
open "http://127.0.0.1:8777/ilaw/_selftest.html"          # ?shot=play for a gameplay frame
```

It steps every level 420 frames, draws each one, and prints per-phase timings.
The title reads `SELFTEST OK` or `SELFTEST FAIL`.

## Things that bit

- **A cone-shaped visibility polygon has to close through the light's own
  position.** A full 360° fan wraps onto itself and does not need the apex; a
  partial cone absolutely does. Without it the polygon becomes the region
  between the two ends of the arc — which renders every shadow as the only lit
  thing on screen, perfectly inverted.
- **Rays stop exactly on the surface they hit**, which leaves that surface just
  outside the lit polygon and therefore invisible. The renderer nudges each hit
  22 cm past the wall so the pillar you are aiming at can actually be seen.
  `isOccluded()`, which decides what is solid ground, stays exact.
- **`#lantern` is an ID selector setting `display: grid`**, which outranks the
  class-based role gate — the Anino button leaked onto the Ilaw controller until
  the gate got `!important`.
- **Button presses are sent as counters, not booleans.** The data channel is
  unreliable and unordered on purpose; a boolean edge can vanish, but a counter
  that went up is unambiguous whenever it lands.
- **`webkitCompassHeading` is deliberately not used.** It is absolute and
  drift-free, but it is a magnetometer reading, and the thing you are sitting
  next to while you play is a laptop full of magnets. The beam is relative to
  wherever you last tapped Re-centre instead.
- **The flare does not create or destroy shadows.** It only reveals and repels.
  Making it a real light meant popping one while she was halfway across a shadow
  bridge dropped her into the dark, which felt like a betrayal rather than a
  mistake.
