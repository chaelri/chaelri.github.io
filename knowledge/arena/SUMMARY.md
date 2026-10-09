# arena/ (Rambulan) — SUMMARY

Offline 3D island brawl royale built 2026-10-09 after Karera got boring fast. Shared single camera on the Mac (Charlie asked to "see each other on the Mac"), phones are twin-stick controllers. 2-4 players, optional bots (default 0).

- **Run:** `python3 arena/server.py` → board `http://localhost:8830/`, phones `/p`.
- **Depends on `kart/`:** `server.py` falls back to `../kart/` for `vendor/` and `assets/` (three.js r186, GLTFLoader, critter GLBs, flat.js, qrcode.js) so 7 MB isn't duplicated.
- **Board owns the match** (`js/sim.js`, 60 Hz). Phone input `{t:"in", mx,mz, ax,az, l, w, u}`: sticks are -1..1 in screen space, which is world x/z because the camera looks toward -z. `w`/`u` are counters; `l` is held (chest opening) and its RISING edge grabs loot. Firing on release too was a bug.
- **Layout is authored at 1/0.82 scale** and shrunk in `map.js` (R=36). At full size, framing 3-4 spread-out players made the critters tiny.
- Sea sits at y -0.95 with ±0.34 waves; any higher and it pokes through the island's dips as a puddle.
- Ghosts (multo) drop a bomb on use/loot/aim push every 5 s. A knocked-out player's gear spills onto the ground.
- **Testing:** `node arena/_selftest.mjs 30` (bot matches, invariants); `window.__rambulan` on the board (settings.bots, addKeyboard, startMatch).
- **Ults + King Yhon (2026-10-09, same day):** `ult` 0-100 per player, charged by `st.orbs` (+25, respawn elsewhere after 8 s) and `dmgUlt` 0.3/damage dealt; input `x` is the ult counter. King is `st.king` with `isKing`; `damage()` routes to `damageKing()`, and `explode()` skips the king when he is the attacker (his own slam used to hurt him). Last hit sets `crown` (+25% dmg, cleared each round).
- **Mid-match critter change:** `pendingChar` applies in `startRound()`; immediate during countdown or as a ghost. Lobby cards on the Mac cycle critter on click.
- **Phone never zooms:** iOS ignores `user-scalable=no`, so `touch-action` + eating the second tap of a double tap in `touchend` + blocking `gesture*` is what actually stops it. Same fix applied to `kart/phone.html`.
