// Portrait Bubu Runner — game.js
// Canvas size: 400 x 700
// Bubu draw size: 60 x 70
// Obstacle scale: 50%

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Logical (internal) resolution
const CANVAS_W = 400;
const CANVAS_H = 700;
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

// Game constants
const FRAME_W = 251; // original frame width of your PNGs
const FRAME_H = 298; // original frame height
const BUBU_W = 60; // draw width for portrait (user chose A)
const BUBU_H = 70; // draw height
const OBSTACLE_SCALE = 0.5; // user chose A: 50%
const GROUND_TILE_W = 457; // source tile width
const GROUND_TILE_H = 64;
const GROUND_DRAW_H = 80; // visual ground height in portrait
const GROUND_Y = CANVAS_H - GROUND_DRAW_H; // y position of ground top
const GRAVITY = 0.7;
const JUMP_FORCE = -13;

// State
let gameState = "start"; // start | running | end
let assetsLoaded = 0;
let bubuFrames = [];
let duduFrames = [];
let obstacleImages = [];
let bg = new Image();
let groundTile = new Image();
let startCard = new Image();
let endingCard = new Image();

let bgOffset = 0;
let groundOffset = 0;
let scrollSpeed = 3;

// Bubu state
let bubuX = 60;
let bubuY = GROUND_Y - BUBU_H; // top-left y
let velY = 0;
let onGround = true;
let animIndex = 0;
let animTimer = 0;

// Obstacle state
let obstacle = null; // {img, w, h}
let obstacleX = CANVAS_W + 40;
let obstacleSpawnTimer = 0;
let showDudu = false;

// Dudu position
const DUDU_X = CANVAS_W - 110;
const DUDU_Y = GROUND_Y - BUBU_H + 10;

// Helper to count assets
function assetLoaded() {
  assetsLoaded++;
}

// Load assets
bg.src = "assets/background.png";
bg.onload = assetLoaded;
groundTile.src = "assets/groundtile.png";
groundTile.onload = assetLoaded;
startCard.src = "assets/taptostartwithhearts.png";
startCard.onload = assetLoaded;
endingCard.src = "assets/happilyeverafter.png";
endingCard.onload = assetLoaded;

// obstacles
const obstacleList = [
  { src: "assets/heart.png" },
  { src: "assets/boquet.png" },
  { src: "assets/bell.png" },
  { src: "assets/cake.png" },
];
obstacleList.forEach((o) => {
  o.img = new Image();
  o.img.src = o.src;
  o.img.onload = assetLoaded;
  // we will read natural size once loaded
});

// bubu & dudu frames (1..6)
for (let i = 1; i <= 6; i++) {
  const img = new Image();
  img.src = `assets/bubu/${i}.png`;
  img.onload = assetLoaded;
  bubuFrames.push(img);
}
for (let i = 1; i <= 6; i++) {
  const img = new Image();
  img.src = `assets/dudu/${i}.png`;
  img.onload = assetLoaded;
  duduFrames.push(img);
}

// Wait until assets ready then draw start screen
function waitForAssets() {
  // expected count: bg + ground + start + end + 4 obstacles + 6 bubu + 6 dudu = 22
  if (assetsLoaded >= 22) {
    drawStartScreen();
  } else {
    requestAnimationFrame(waitForAssets);
  }
}
waitForAssets();

// Responsive scaling: visual only (keeps internal physics same)
function applyResponsiveScaling() {
  // scale canvas visually to fit viewport width while keeping portrait
  const wrapper = canvas.parentElement;
  const maxWidth = Math.min(window.innerWidth - 20, 420); // margin
  const scale = maxWidth / CANVAS_W;
  canvas.style.width = `${Math.round(CANVAS_W * scale)}px`;
  canvas.style.height = `${Math.round(CANVAS_H * scale)}px`;
}
window.addEventListener("resize", applyResponsiveScaling);
applyResponsiveScaling();

// Input: tap or key
function onInput() {
  if (gameState === "start") {
    startGame();
    return;
  }
  if (gameState === "running") {
    doJump();
    return;
  }
  if (gameState === "end") {
    // restart
    resetGame();
    return;
  }
}
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") onInput();
});
canvas.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    onInput();
  },
  { passive: false }
);
canvas.addEventListener("mousedown", onInput);

// Start / reset
function startGame() {
  gameState = "running";
  obstacleSpawnTimer = 0;
  showDudu = false;
  obstacleX = CANVAS_W + 40;
  spawnObstacle();
  animIndex = 0;
  animTimer = 0;
  velY = 0;
  onGround = true;
  update();
}

function resetGame() {
  // simple full reset
  gameState = "start";
  bubuX = 60;
  bubuY = GROUND_Y - BUBU_H;
  velY = 0;
  onGround = true;
  animIndex = 0;
  animTimer = 0;
  showDudu = false;
  drawStartScreen();
}

// Jump logic
function doJump() {
  if (!onGround) return;
  velY = JUMP_FORCE;
  onGround = false;
}

// Obstacle spawn (random)
function spawnObstacle() {
  const idx = Math.floor(Math.random() * obstacleList.length);
  const o = obstacleList[idx];
  obstacle = {
    img: o.img,
    w: Math.round((o.img.naturalWidth || 100) * OBSTACLE_SCALE),
    h: Math.round((o.img.naturalHeight || 80) * OBSTACLE_SCALE),
  };
  obstacleX = CANVAS_W + 40;
  // randomize next spawn delay
  obstacleSpawnTimer = 60 + Math.floor(Math.random() * 120);
}

// MAIN LOOP
function update() {
  if (gameState !== "running") return;

  // parallax movement
  bgOffset -= scrollSpeed * 0.4;
  groundOffset -= scrollSpeed;

  if (bgOffset <= -1024) bgOffset = 0;
  if (groundOffset <= -GROUND_TILE_W) groundOffset = 0;

  // physics
  velY += GRAVITY;
  bubuY += velY;

  // floor collision
  if (bubuY >= GROUND_Y - BUBU_H) {
    bubuY = GROUND_Y - BUBU_H;
    velY = 0;
    onGround = true;
  }

  // animation timer
  animTimer++;
  if (onGround) {
    if (animTimer % 8 === 0) {
      animIndex++;
      if (animIndex > 3) animIndex = 1;
    }
  } else {
    animIndex = 4; // jump frame while in air
  }

  // obstacle movement and spawn logic
  obstacleX -= scrollSpeed * 2.5; // obstacle speed (faster than background)
  if (obstacle && obstacleX < -200 && !showDudu) {
    // obstacle left screen, next stage: show Dudu as reachable
    showDudu = true;
  }
  obstacleSpawnTimer--;
  if (obstacleSpawnTimer <= 0 && !showDudu) {
    spawnObstacle();
  }

  // collision check using a smaller hitbox
  if (obstacle && !showDudu) {
    const bubuHit = {
      x: bubuX + 12,
      y: bubuY + 10,
      w: BUBU_W - 24,
      h: BUBU_H - 18,
    };
    const obsHit = {
      x: obstacleX,
      y: GROUND_Y + (GROUND_DRAW_H - obstacle.h),
      w: obstacle.w,
      h: obstacle.h,
    };

    const collided =
      bubuHit.x < obsHit.x + obsHit.w &&
      bubuHit.x + bubuHit.w > obsHit.x &&
      bubuHit.y < obsHit.y + obsHit.h &&
      bubuHit.y + bubuHit.h > obsHit.y;

    if (collided) {
      // hit — end game
      animIndex = 4;
      gameState = "end";
      drawEndingScreen();
      return;
    }
  }

  // reaching dudu
  if (showDudu && bubuX + BUBU_W > DUDU_X - 10) {
    animIndex = 5; // victory
    gameState = "end";
    drawEndingScreen();
    return;
  }

  draw();
  requestAnimationFrame(update);
}

// DRAW helpers
function drawBackground() {
  // draw two copies horizontally for seamless
  // scale bg to fill canvas height while maintaining ratio
  const scale = CANVAS_H / 1024; // background natural is 1024x1024
  const drawW = 1024 * scale;
  const drawH = CANVAS_H;
  // convert bgOffset in logical pixels: bgOffset is in background-space (so scale accordingly)
  const ofs = Math.floor(bgOffset);
  ctx.drawImage(bg, ofs, 0, 1024, 1024, 0, 0, drawW, drawH);
  ctx.drawImage(bg, ofs + 1024, 0, 1024, 1024, drawW, 0, drawW, drawH);
}

function drawGround() {
  // tile ground horizontally at bottom
  const tileScale = GROUND_DRAW_H / GROUND_TILE_H;
  const drawW = GROUND_TILE_W * tileScale;
  const drawH = GROUND_DRAW_H;
  const ofs = Math.floor(groundOffset);
  // draw three copies to fill
  ctx.drawImage(groundTile, ofs, GROUND_Y, drawW, drawH);
  ctx.drawImage(groundTile, ofs + drawW, GROUND_Y, drawW, drawH);
  ctx.drawImage(groundTile, ofs + drawW * 2, GROUND_Y, drawW, drawH);
}

function drawObstacle() {
  if (!obstacle || showDudu) return;
  const drawH = obstacle.h;
  const drawW = obstacle.w;
  const y = GROUND_Y + (GROUND_DRAW_H - drawH);
  ctx.drawImage(obstacle.img, obstacleX, y, drawW, drawH);
}

function drawBubu() {
  const frame = bubuFrames[animIndex] || bubuFrames[0];
  // destination: bubuX, bubuY (top-left), size BUBU_W x BUBU_H
  ctx.drawImage(frame, 0, 0, FRAME_W, FRAME_H, bubuX, bubuY, BUBU_W, BUBU_H);
}

function drawDudu() {
  if (!showDudu) return;
  const frame = duduFrames[5] || duduFrames[0];
  ctx.drawImage(frame, 0, 0, FRAME_W, FRAME_H, DUDU_X, DUDU_Y, BUBU_W, BUBU_H);
}

function drawStartScreen() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  drawBackground();
  drawGround();
  // draw a centered start card
  ctx.drawImage(startCard, (CANVAS_W - 245) / 2, 90, 245, 298);
  // tiny instruction
  ctx.fillStyle = "#6b2630";
  ctx.font = "16px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Tap to Start — Tap to Jump", CANVAS_W / 2, CANVAS_H - 40);
}

function drawEndingScreen() {
  draw(); // draws last frame
  // overlay ending card
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect((CANVAS_W - 360) / 2 - 8, 60 - 8, 360 + 16, 200 + 16);
  ctx.drawImage(endingCard, (CANVAS_W - 360) / 2, 60, 360, 200);
  ctx.fillStyle = "#6b2630";
  ctx.font = "18px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Tap to play again", CANVAS_W / 2, CANVAS_H - 40);
}

function draw() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  drawBackground();
  drawGround();
  drawObstacle();
  drawBubu();
  drawDudu();
}

// Expose a quick debug function to force spawn obstacle (open console -> spawnObstacle())
window.spawnObstacle = spawnObstacle;
window.resetGame = resetGame;
