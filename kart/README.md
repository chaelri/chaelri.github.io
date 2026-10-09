# Karera

Offline kart racing, Mario Kart style. The Mac is the screen (split screen for up to 3 players, plus CPU racers); each phone is a steering wheel.

```
python3 kart/server.py
```

The board opens on the Mac with a QR code. Scan it, pick a critter, and press **START RACE** (on the phone or the Mac).

## Offline

- All devices on the same WiFi as the Mac. The router doesn't need internet; nothing leaves the house. One phone's hotspot also works.
- Nothing loads from the internet: three.js, the glTF loader, the QR library and the critter models are all in this folder. Music and sounds are synthesized.

## Controls (phone, held sideways)

- **Steer**: touch and slide on the left half (joystick), or **tilt** like a wheel.
- **DRIFT**: hold while turning; sparks go blue, orange, purple. Let go for a turbo.
- **ITEM**: tap to use. **BRAKE**: hold (reverses when stopped).
- Gas is automatic by default (switch to a gas button in the lobby).
- Rocket start: hold DRIFT when the countdown hits 2.

Tilt needs the secure page (phones only share motion sensors over HTTPS). The lobby links to it; the phone shows a "not private" warning once because the certificate is made on this Mac. Tap Show Details, then visit this website.

Keyboard at the Mac (testing, or a player without a phone): press **K** in the lobby. Arrows + Right Shift (drift) + `/` (item), or WASD + Left Shift + E. Enter starts, Esc returns to the lobby, M mutes.

## Items

Turbo, Triple Turbo, Saging (banana), Green Shell, Red Shell (homes on the kart ahead), Bituin (star: invincible and fast), Kidlat (lightning: everyone else spins and shrinks). Further back = better items. Coins (max 10) raise top speed; getting hit drops 3.

## Files

- `server.py`: stdlib relay. HTTP (default 8810) + HTTPS (8811, self-signed, made with openssl into `certs/`), minimal WebSocket server, POST/SSE fallback.
- `index.html` + `js/main.js`: the board (lobby, split screen, HUD, minimap, results).
- `js/sim.js`: the race (pure JS: physics, drift, items, coins, CPU drivers). `js/track.js`: circuit spline + terrain.
- `js/render.js`: three.js world. `js/sound.js`: synth music + sfx. `js/icons.js`: item icons.
- `phone.html`: the controller.
- `_selftest.mjs`: `node kart/_selftest.mjs 20` runs all-CPU races and checks they finish sanely.
