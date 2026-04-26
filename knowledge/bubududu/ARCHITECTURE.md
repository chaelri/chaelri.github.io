# Bubududu — Architecture

## Game Loop (game.js 300–432)

**Entry:** `requestAnimationFrame(loop)` at line 239 (`startGame()`) and 431 (recursive).

```js
function loop(timestamp) {  // line 301
  // 1. Frame timing
  const dt = (timestamp - lastTime) / 16.666;  // normalize to 60fps (UNUSED in physics)

  // 2. Parallax scrolling
  bgOffset = (bgOffset + SCROLL_BG) % bgTileW;
  groundOffset = (groundOffset + SCROLL_GROUND) % groundTileW;

  // 3. Physics (Bubu)
  bubu.vy += GRAVITY;
  bubu.y += bubu.vy;
  if (bubu.y >= GROUND_Y - BUBU_H) bubu.onGround = true;

  // 4. Animation frame selection
  if (bubu.onGround) {
    bubu.animTimer++ every 10 ticks → cycle frames 1-3
  } else {
    bubu.anim = 4;  // jump pose
  }

  // 5. Obstacle spawning & movement
  if (!currentObstacle) spawnTimer-- → spawnObstacle() at 0
  if (currentObstacle) currentObstacle.x -= SCROLL_GROUND * 1.8;

  // 6. Collision detection & scoring
  if (overlap(bubuHitBox, obstacleHitBox)) {
    if (isHeart) score += 100; floatingText("+100");
    else endGame();
  }

  // 7. Win sequence
  if (showDudu) duduX -= SCROLL_GROUND * 0.8;
  if (duduX < bubu.x) triggerDuduEnding();

  // 8. Render
  draw();
  rafId = requestAnimationFrame(loop);
}
```

**Frame Timing:** `dt = (timestamp - lastTime) / 16.666` calculated but **NOT applied to physics** (direct per-frame increments instead).

## Physics & Collision (lines 320–400)

**Gravity & Jump:**
- Gravity = 0.75 units/frame (line 42)
- Jump force = -15 units/frame (line 43)
- Ground check: `bubu.y >= GROUND_Y - BUBU_H` (line 324)

**Collision (lines 293–296, 363–400):**
```js
function overlap(a, b) {  // AABB
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

// Hitbox reduced ~20px to prevent tight corners
const bHit = { x: bubu.x+10, y: bubu.y+10, w:40, h:60 };
const oHit = { x: obstacle.x, y: obstacle.y, w: obs.w, h: obs.h };
if (overlap(bHit, oHit)) { /* heart or hazard */ }
```

**Heart Collection (lines 378–395):**
- Triggers bloom effect (#heartBloom DOM, opacity 0→1→0 in 250ms)
- Floating text "+100" at Bubu's position (vy=-0.6, alpha fade)
- Clears currentObstacle

**Hazard Collision (lines 396–399):** `endGame()` → state = "ended".

## Obstacle Spawning (lines 251–290)

```js
function spawnObstacle() {
  // 1. Random type (0-3: heart, boquet, bell, cake)
  const def = ASSETS.obstacleDefs[i];

  // 2. Per-type scaling (line 257-262)
  scale = isHeart ? 0.45 : (cake ? 0.40 : 0.42/0.48);

  // 3. Y-position
  if (isHeart) {
    finalY = GROUND_Y - BUBU_H - (40 or 80);  // jump-reachable
  } else {
    finalY = GROUND_Y - obstacleH;  // ground
  }

  // 4. Create object
  currentObstacle = {
    img: obstacleImgs[i], isHeart: def.isHeart,
    w: def.w * scale, h: def.h * scale,
    x: CANVAS_W + 20,  // off-screen right
    y: finalY
  };

  spawnTimer = random(MIN_SPAWN, MAX_SPAWN);  // 80-150 frames
}
```

**Movement (line 351):** `currentObstacle.x -= SCROLL_GROUND * 1.8` (faster than ground for visual acceleration).

## Scoring System

- **Per-frame:** `score += 0.15` (line 308) — continuous time bonus
- **Heart collection:** `score += 100` (line 379) — discrete bonus
- **Score display:** Updated every frame at top-right via DOM (line 545)
- **Win trigger:** Score ≥1000 + obstacle cleared + 75% chance → `showDudu = true` (line 356)

## Win/End Sequences

### Loss (`endGame`, lines 599–657)
1. state = "ended"
2. Draw black canvas
3. Render end-card image + final score + "Tap to play again"
4. handleTap() → resetGame() → state = "start"

### Romantic Win (`triggerDuduEnding`, lines 659–678)
1. state = "duduEnding"
2. Hide canvas UI (#ui)
3. Show #duduEnding overlay (radial pink gradient)
4. Spawn 12 floating hearts (`.dudu-heart` divs with floatUp animation, 6s)
5. Display message in #duduMessage (lines 738–776, hardcoded Filipino/English to "Karla")
6. **No restart in duduEnding state** — requires page reload

### Normal Restart (`resetGame`, lines 242–248)
1. state = "start"
2. Reset spawn timer to random(80, 150)
3. drawStartScreen() — "Tap to Start" card

## Asset Loading & Initialization (lines 88–142, 681–727)

**Preload Pipeline:**
```js
async function preloadAll() {
  // Promise.all() on loadImage() for all assets
  return { bgImg, groundImg, startCard, endCard, bubuImgs[], duduImgs[], obstacleImgs[] };
}

// Boot sequence (681-727)
try {
  const loaded = await preloadAll();
  IMG.bg = loaded.bgImg;
  bubuFrames = loaded.bubuImgs;
  duduFrames = loaded.duduImgs;
  // ... tile width calculations ...
  state = "start";
  drawStartScreen();
} catch (err) {
  console.error("Asset preload failed");
}
```

**Tile Width Calculation (702–710):**
- Background: `bgTileW = bgImg.naturalWidth * (CANVAS_H / bgImg.naturalHeight)`
- Ground: `groundTileW = groundImg.naturalWidth * (GROUND_H / groundImg.naturalHeight)`
- Fallback: defaults (1024, 457) if 0

## Canvas Rendering (lines 435–565)

**`drawBackground()` (435–461):**
- Scale image to fit canvas height (cover)
- Tile seamlessly with bgOffset modulo wrapping
- ⚠️ bgOffset wrapping may have off-by-one in edge cases

**`drawGround()` (463–487):**
- Scale ground tile to GROUND_H (90px)
- Tile with groundOffset, draw extra to avoid gaps
- Position GROUND_Y (700 - 90 = 610)

**`drawObstacle()` (489–502):**
- `ctx.drawImage()` if currentObstacle exists and !showDudu

**`drawBubu()` (504–519):**
- Uses `bubuFrames[bubu.anim]` with bounds checking
- Size: BUBU_W=60, BUBU_H=70

**`drawDudu()` (521–542):**
- **Flipped rendering:** `ctx.scale(-1, 1)` + `-(duduX + DUDU_W)` for horizontal flip
- Only visible when showDudu=true
- Position: duduX (scrolls left)

**`draw()` (549–565):**
1. Clear canvas
2. drawBackground(), drawGround(), drawObstacle(), drawBubu(), drawDudu()
3. drawUI() (score)
4. Render floating texts with globalAlpha fade

## Device Pixel Ratio (lines 19–24)
```js
const dpr = window.devicePixelRatio || 1;
canvas.width = CANVAS_W * dpr;
canvas.height = CANVAS_H * dpr;
ctx.scale(dpr, dpr);
```
Ensures crisp rendering on high-DPI (retina).
