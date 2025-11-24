// CLEAN Portrait Runner — game.js
// Internal resolution: 400 x 700 (portrait)
// Bubu frames: assets/bubu/1..6.png (251x298 source)
// Dudu frames: assets/dudu/1..6.png
// Obstacles in assets: heart.png, boquet.png, bell.png, cake.png

// ----------------------
// Canvas setup
// ----------------------
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const CANVAS_W = 400;
const CANVAS_H = 700;

// visible scale handled via CSS, keep internal coords fixed
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

// ----------------------
// Game constants & tuning
// ----------------------
const FRAME_W = 251;
const FRAME_H = 298;

const BUBU_DRAW_W = 60; // user requested small
const BUBU_DRAW_H = 70;

const GROUND_TILE_W = 457;
const GROUND_TILE_H = 64;
const GROUND_DRAW_H = 88; // how tall ground appears in portrait
const GROUND_Y = CANVAS_H - GROUND_DRAW_H;

const GRAVITY = 0.75;
const JUMP_FORCE = -14;
const BASE_SCROLL = 3.2;

const OBSTACLE_SCALE = 0.5; // hearts scaled 50%
const MIN_SPAWN = 90; // frames
const MAX_SPAWN = 160;

// positions
const BUBU_START_X = 60;
const BUBU_START_Y = GROUND_Y - BUBU_DRAW_H;

// Dudu final position
const DUDU_X = CANVAS_W - 110;
const DUDU_Y = GROUND_Y - BUBU_DRAW_H + 6;

// ----------------------
// Assets
// ----------------------
const assets = {
  bg: new Image(),
  ground: new Image(),
  startCard: new Image(),
  endCard: new Image(),
  obstacles: [], // filled below
  bubuFrames: [],
  duduFrames: [],
};

// load background & UI images
assets.bg.src = "assets/background.png"; // 1024x1024
assets.ground.src = "assets/groundtile.png"; // 457x64
assets.startCard.src = "assets/taptostartwithhearts.png";
assets.endCard.src = "assets/happilyeverafter.png";

// obstacle sources & natural sizes (from your list)
const obstacleDefs = [
  { key: "heart", src: "assets/heart.png", w: 111, h: 96, isHeart: true },
  { key: "boquet", src: "assets/boquet.png", w: 110, h: 112, isHeart: false },
  { key: "bell", src: "assets/bell.png", w: 97, h: 97, isHeart: false },
  { key: "cake", src: "assets/cake.png", w: 103, h: 106, isHeart: false },
];

// load obstacle images
for (let def of obstacleDefs) {
  const img = new Image();
  img.src = def.src;
  assets.obstacles.push({ img, w: def.w, h: def.h, isHeart: def.isHeart });
}

// load bubu / dudu frames (1..6)
for (let i = 1; i <= 6; i++) {
  const b = new Image();
  b.src = `assets/bubu/${i}.png`;
  assets.bubuFrames.push(b);
  const d = new Image();
  d.src = `assets/dudu/${i}.png`;
  assets.duduFrames.push(d);
}

// wait for assets
let totalToLoad =
  2 +
  1 +
  1 +
  assets.obstacles.length +
  assets.bubuFrames.length +
  assets.duduFrames.length;
// bg + ground + start + end + obs + bubu + dudu
let loadedCount = 0;
function tickLoad() {
  loadedCount++;
}
assets.bg.onload = tickLoad;
assets.ground.onload = tickLoad;
assets.startCard.onload = tickLoad;
assets.endCard.onload = tickLoad;
assets.obstacles.forEach((o) => (o.img.onload = tickLoad));
assets.bubuFrames.forEach((i) => (i.onload = tickLoad));
assets.duduFrames.forEach((i) => (i.onload = tickLoad));

// show start screen when ready
function waitUntilReady() {
  if (loadedCount >= totalToLoad) {
    drawStartScreen();
  } else {
    requestAnimationFrame(waitUntilReady);
  }
}
waitUntilReady();

// ----------------------
// Game state
// ----------------------
let state = "start"; // 'start' | 'running' | 'ended'
let score = 0;
let scroll = BASE_SCROLL;

let bubu = {
  x: BUBU_START_X,
  y: BUBU_START_Y,
  vx: 0,
  vy: 0,
  onGround: true,
  anim: 0,
  animTimer: 0,
};

let obstacle = null; // {img,w,h,isHeart,x}
let obstacleTimer = 0;

let showDudu = false;

// ----------------------
// Input (tap/jump/start/restart)
// ----------------------
function handleTap() {
  if (state === "start") {
    startGame();
    return;
  }
  if (state === "running") {
    if (bubu.onGround) {
      bubu.vy = JUMP_FORCE;
      bubu.onGround = false;
    }
    return;
  }
  if (state === "ended") {
    // restart clean
    resetGame();
    return;
  }
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") handleTap();
});
canvas.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    handleTap();
  },
  { passive: false }
);
canvas.addEventListener("mousedown", handleTap);

// ----------------------
// Game flow helpers
// ----------------------
function startGame() {
  score = 0;
  scroll = BASE_SCROLL;
  state = "running";
  showDudu = false;
  obstacle = null;
  obstacleTimer =
    MIN_SPAWN + Math.floor(Math.random() * (MAX_SPAWN - MIN_SPAWN));
  bubu.x = BUBU_START_X;
  bubu.y = BUBU_START_Y;
  bubu.vy = 0;
  bubu.onGround = true;
  bubu.anim = 0;
  bubu.animTimer = 0;
  requestAnimationFrame(loop);
}

function resetGame() {
  state = "start";
  score = 0;
  drawStartScreen();
}

// ----------------------
// Spawning obstacles
// ----------------------
function spawnRandomObstacle() {
  const idx = Math.floor(Math.random() * assets.obstacles.length);
  const src = assets.obstacles[idx];
  const w = Math.round(src.w * OBSTACLE_SCALE);
  const h = Math.round(src.h * OBSTACLE_SCALE);
  const x = CANVAS_W + 40;
  obstacle = { img: src.img, w, h, isHeart: src.isHeart, x };
  // next spawn: random but allow reachability
  obstacleTimer =
    MIN_SPAWN + Math.floor(Math.random() * (MAX_SPAWN - MIN_SPAWN));
}

// ----------------------
// Collision helpers
// ----------------------
function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

// ----------------------
// Main loop
// ----------------------
function loop() {
  if (state !== "running") return;

  // physics
  bubu.vy += GRAVITY;
  bubu.y += bubu.vy;
  if (bubu.y >= BUBU_START_Y) {
    bubu.y = BUBU_START_Y;
    bubu.vy = 0;
    bubu.onGround = true;
  } else {
    bubu.onGround = false;
  }

  // animate (0 idle, 1 run1, 2 run2, 3 run3, 4 jump, 5 victory)
  bubu.animTimer++;
  if (bubu.onGround) {
    if (bubu.animTimer % 10 === 0) {
      bubu.anim = bubu.anim < 3 ? bubu.anim + 1 : 1;
    }
  } else {
    bubu.anim = 4;
  }

  // background & ground scroll (simple loop)
  assets.bgOffset = (assets.bgOffset || 0) - scroll * 0.35;
  if (assets.bgOffset <= -1024) assets.bgOffset += 1024;
  assets.groundOffset = (assets.groundOffset || 0) - scroll;
  if (assets.groundOffset <= -GROUND_TILE_W)
    assets.groundOffset += GROUND_TILE_W;

  // obstacle logic
  if (!obstacle) {
    obstacleTimer--;
    if (obstacleTimer <= 0 && !showDudu) {
      spawnRandomObstacle();
    }
  } else {
    obstacle.x -= scroll * 2.6;
    // if it passed offscreen, award (if heart) or simply remove and maybe show dudu later
    if (obstacle.x + obstacle.w < -20) {
      // if obstacle was heart and never collected, do nothing
      obstacle = null;
      // chance to show dudu after some obstacles passed
      if (!showDudu && Math.random() < 0.15) {
        showDudu = true; // Dudu appears soon
      }
    }
  }

  // check collisions
  if (obstacle && !showDudu) {
    // small bubu hitbox (fair)
    const bHit = {
      x: bubu.x + 8,
      y: bubu.y + 8,
      w: BUBU_DRAW_W - 16,
      h: BUBU_DRAW_H - 12,
    };
    const oHit = {
      x: obstacle.x,
      y: GROUND_Y + (GROUND_DRAW_H - obstacle.h),
      w: obstacle.w,
      h: obstacle.h,
    };
    if (rectsOverlap(bHit, oHit)) {
      if (obstacle.isHeart) {
        // collect heart => score + 10, remove obstacle
        score += 10;
        obstacle = null;
      } else {
        // hit other obstacle => game over
        state = "ended";
        // show end with final score after a small delay
        setTimeout(() => drawEndScreen(), 80);
        return;
      }
    }
  }

  // if showDudu is true, allow Bubu to reach Dudu
  if (showDudu && bubu.x + BUBU_DRAW_W >= DUDU_X - 6) {
    // victory
    bubu.anim = 5;
    state = "ended";
    setTimeout(() => drawEndScreen(), 100);
    return;
  }

  draw();
  requestAnimationFrame(loop);
}

// ----------------------
// Drawing functions
// ----------------------
function drawBackground() {
  // draw tiled background scaled vertically to canvas height
  // we will draw two horizontally to loop
  const scale = CANVAS_H / 1024; // because source bg is square 1024
  const drawW = 1024 * scale;
  const drawH = CANVAS_H;
  const ofs = Math.floor(assets.bgOffset || 0);
  // first
  ctx.drawImage(assets.bg, 0, 0, 1024, 1024, ofs, 0, drawW, drawH);
  // second copy to fill gap
  ctx.drawImage(assets.bg, 0, 0, 1024, 1024, ofs + drawW, 0, drawW, drawH);
}

function drawGround() {
  const tileScale = GROUND_DRAW_H / GROUND_TILE_H;
  const drawW = GROUND_TILE_W * tileScale;
  const drawH = GROUND_DRAW_H;
  const ofs = Math.floor(assets.groundOffset || 0);
  // draw 3 copies to be safe
  ctx.drawImage(assets.ground, ofs, GROUND_Y, drawW, drawH);
  ctx.drawImage(assets.ground, ofs + drawW, GROUND_Y, drawW, drawH);
  ctx.drawImage(assets.ground, ofs + drawW * 2, GROUND_Y, drawW, drawH);
}

function drawObstacle() {
  if (!obstacle || showDudu) return;
  const drawH = obstacle.h;
  const drawW = obstacle.w;
  const y = GROUND_Y + (GROUND_DRAW_H - drawH);
  ctx.drawImage(obstacle.img, obstacle.x, y, drawW, drawH);
}

function drawBubu() {
  const frameIndex = Math.max(0, Math.min(5, bubu.anim || 0));
  const frame = assets.bubuFrames[frameIndex];
  if (!frame) return;
  ctx.drawImage(
    frame,
    0,
    0,
    FRAME_W,
    FRAME_H,
    bubu.x,
    bubu.y,
    BUBU_DRAW_W,
    BUBU_DRAW_H
  );
}

function drawDudu() {
  if (!showDudu) return;
  const frame = assets.duduFrames[5] || assets.duduFrames[0];
  ctx.drawImage(
    frame,
    0,
    0,
    FRAME_W,
    FRAME_H,
    DUDU_X,
    DUDU_Y,
    BUBU_DRAW_W,
    BUBU_DRAW_H
  );
}

function drawScore() {
  const el = document.getElementById("score");
  if (el) el.textContent = `Score: ${score}`;
}

function draw() {
  // clear
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  drawBackground();
  drawGround();
  drawObstacle();
  drawBubu();
  drawDudu();
  drawScore();
}

// Start screen & end screen
function drawStartScreen() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  drawBackground();
  drawGround();
  // center start card
  const w = 245,
    h = 298;
  ctx.drawImage(assets.startCard, (CANVAS_W - w) / 2, 80, w, h);
  drawScore();
  // text hint
  ctx.fillStyle = "#6b2630";
  ctx.font = "14px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Tap to start — Tap to jump", CANVAS_W / 2, CANVAS_H - 40);
}

function drawEndScreen() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  drawBackground();
  drawGround();
  // show characters together
  // draw bubu a little left of center, dudu near right
  ctx.drawImage(
    assets.bubuFrames[5],
    0,
    0,
    FRAME_W,
    FRAME_H,
    CANVAS_W / 2 - 80,
    GROUND_Y - BUBU_DRAW_H,
    BUBU_DRAW_W,
    BUBU_DRAW_H
  );
  ctx.drawImage(
    assets.duduFrames[5],
    0,
    0,
    FRAME_W,
    FRAME_H,
    CANVAS_W / 2 + 10,
    GROUND_Y - BUBU_DRAW_H,
    BUBU_DRAW_W,
    BUBU_DRAW_H
  );

  // draw ending card centered
  const cardW = 360,
    cardH = 200;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fillRect((CANVAS_W - cardW) / 2 - 8, 60 - 8, cardW + 16, cardH + 16);
  ctx.drawImage(assets.endCard, (CANVAS_W - cardW) / 2, 60, cardW, cardH);

  // final score
  ctx.fillStyle = "#6b2630";
  ctx.font = "18px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`Final Score: ${score}`, CANVAS_W / 2, 60 + cardH + 36);
  ctx.fillText("Tap to play again", CANVAS_W / 2, CANVAS_H - 40);
}

// small helper to draw immediate end screen
function drawEndScreenImmediate() {
  drawEndScreen();
}

// Expose to console for debug
window._spawn = spawnRandomObstacle;
window._reset = resetGame;
