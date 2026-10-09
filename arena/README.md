# Rambulan

Offline island brawl for 2 to 4 players. Everyone shares ONE screen on the Mac (the camera zooms to keep all fighters in frame); each phone is a twin-stick controller.

```
python3 arena/server.py
```

Needs the `kart/` folder next to it: three.js, the glTF loader and the critter models are served from there.

## How a match goes

- Loot chests (hold LOOT next to one). Loot pops out with a rarity beam: gray common, blue rare, purple epic, gold legendary. The courtyard chest is always gold.
- Weapons: Kamao (fists), Arnis, Tirador, Ripple, Boga, Paltik, Bazooka. Items: Buko Juice (+40 HP), Kalasag (+50 shield), Bomba (thrown), Rubber Shoes (speed).
- Walk over ammo for a gun you hold, or onto an empty slot. Tap LOOT on top of something to swap it into your hands.
- The storm starts shrinking after 18 s and closes over about 90 s. Last one standing wins the round; first to 3 rounds wins the match.
- Knocked out players become a **multo**: float around and drop a ghost bomb every 5 s.
- Whatever a knocked-out player carried spills on the ground.

## Phone (sideways)

Left thumb anywhere = move. Right thumb anywhere = aim, and it fires while pushed (with light aim assist). SWAP, USE and LOOT are top right.

Keyboard at the Mac (testing): K adds a keyboard player, WASD move, arrows aim + fire, F loot, G use, R swap. Enter starts, Esc lobby, M mute.

## Files

- `js/sim.js`: the match (pure JS). `js/map.js`: island layout + collision. `_selftest.mjs`: `node arena/_selftest.mjs 30` plays bot matches and checks them.
- `js/render.js`: three.js island, shared camera. `js/main.js` + `index.html`: lobby, HUD, kill feed. `phone.html`: controller.
- `server.py`: same stdlib relay as Karera, port 8830.
