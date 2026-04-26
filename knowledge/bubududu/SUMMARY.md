# Bubududu — Side-Scrolling Platformer Game

**Cute romantic platformer (Bubu & Dudu) — endless runner with hearts/obstacles.** Last commit Apr 9 (parked).

**Tech:** HTML5 Canvas (400×700), vanilla JS, no game engine.

## File Structure
```
bubududu/
├── index.html              — Main entry
├── game.js                 (18 KB) — Core game logic
├── style.css               (2.9 KB) — UI & overlay
└── assets/
    ├── background.png      — Scrolling background
    ├── groundtile.png      — Repeating ground texture
    ├── taptostartwithhearts.png — Start screen card
    ├── happilyeverafter.png — End screen card
    ├── heart.png           — Collectible (111×96px)
    ├── boquet.png, bell.png, cake.png — Hazard obstacles
    ├── bubu/               — Player sprite (6 frames, 1.png-6.png)
    └── dudu/               — NPC sprite (6 frames, 1.png-6.png)
```

## Game States
- `state`: "loading" → "start" → "running" → "ended" (or "duduEnding" for win)
- `score`: float (+0.15/frame, +100 for heart)
- `bubu`: `{ x:60, y, vy, anim, onGround }`
- `currentObstacle`: active obstacle or null
- `spawnTimer`: countdown to next obstacle (80–150 frames)
- `showDudu`: boolean (true at score ≥1000 with 75% chance)
- `floatingTexts[]`: "+100" indicators
- `bgOffset, groundOffset`: parallax positions

## Sprites
- **Bubu Frames:** 6 (1.png-6.png), 60×70px
  - Frames 0-2: Walk cycle (10-tick cycle)
  - Frame 4: Jump pose (when airborne)
- **Dudu Frames:** 6 (1.png-6.png), 60×70px
  - Frames 0-3: Walk cycle (8-tick cycle)
  - Frame 5: Hug pose (end-screen)
  - Rendered horizontally flipped when approaching player

## Obstacles
| Type | Behavior | Scale | Y Position |
|------|----------|-------|-----------|
| Heart ❤️ | Collectible (+100) | 0.45 | Jump zone (GROUND_Y-40 to -80) |
| Boquet | Hazard (instant end) | 0.48 | Ground |
| Bell | Hazard (instant end) | 0.42 | Ground |
| Cake | Hazard (instant end) | 0.40 | Ground |

## Game Loop (game.js 300–432)
```js
function loop(timestamp) {
  // 1. Frame timing (dt computed but unused in physics)
  // 2. Parallax scrolling (bgOffset, groundOffset)
  // 3. Physics (Bubu): vy += GRAVITY (0.75), y += vy
  // 4. Animation frame selection
  // 5. Obstacle spawn (spawnTimer countdown) & movement (-SCROLL_GROUND * 1.8)
  // 6. Collision detection (AABB with hitbox reduced ~20px)
  // 7. Win sequence (Dudu approaches, triggerDuduEnding when close)
  // 8. Render (bg, ground, obstacle, bubu, dudu, ui)
  rafId = requestAnimationFrame(loop);
}
```

## Constants (game.js 15-51)
| Name | Value |
|------|-------|
| CANVAS_W, CANVAS_H | 400, 700 |
| BUBU_W, BUBU_H | 60, 70 |
| DUDU_W, DUDU_H | 60, 70 |
| GROUND_Y | 610 |
| GRAVITY | 0.75 |
| JUMP_FORCE | -15 |
| SCROLL_BG | 1.2 |
| SCROLL_GROUND | 3 |
| MIN_SPAWN, MAX_SPAWN | 80, 150 |

## Win Condition
- Score ≥1000 + 75% chance per cleared obstacle → `showDudu = true`
- Dudu enters from right, walks toward Bubu
- When Dudu reaches Bubu (`duduX < bubu.x + BUBU_W`) → `triggerDuduEnding()`:
  - state = "duduEnding"
  - Hide canvas UI
  - Show #duduEnding overlay (radial pink gradient + 12 floating hearts)
  - Personalized message in #duduMessage (hardcoded Filipino/English to "Karla")
  - **No restart in duduEnding state** (requires page reload)

## Loss (endGame)
- state = "ended"
- Black canvas + end-card image + final score + "Tap to play again"
- handleTap() → resetGame() → state="start"

## Input
- Space key, mouse/touch → handleTap()
- handleTap(): jump if onGround, or start/restart game

## Why
- **Why no game engine (Phaser/Babylon):** Lightweight (~18 KB JS), no overhead for this scope
- **Why HTML5 Canvas (not WebGL):** 2D pixel rendering sufficient
- **Why Asia/Manila TZ-naive:** Personal app for Charlie/Karla
- **Why fixed per-frame physics (dt unused):** Simpler, acceptable for casual game
- **Why no audio:** Possibly intentional (no sound files in repo)
- **Why Three.js? — N/A** (this is canvas, not 3D)

## Known Limitations
- `dt` calculation unused (uses fixed per-frame increments)
- duduEnding state has no user-accessible reset
- No audio (no sound files in repo)
- No frame-rate capping (may struggle on low-end mobile)
