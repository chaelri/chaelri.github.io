// ========================================
// CANVAS + CONTEXT
// ========================================
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = 800;
canvas.height = 300;

// ========================================
// GAME CONSTANTS
// ========================================
const FRAME_W = 251;
const FRAME_H = 298;

const DRAW_W = 120;
const DRAW_H = 140;

const GROUND_Y = 230;

const GRAVITY = 0.6;
const JUMP_FORCE = -12;

// ========================================
// LOAD BACKGROUND + GROUND
// ========================================
const bg = new Image();
bg.src = "assets/background.png"; // 1024×1024

const groundTile = new Image();
groundTile.src = "assets/groundtile.png"; // 457×64

// parallax offsets
let bgOffset = 0;
let groundOffset = 0;

// ========================================
// LOAD START + END SCREENS
// ========================================
const startScreen = new Image();
startScreen.src = "assets/taptostartwithhearts.png";

const endingCard = new Image();
endingCard.src = "assets/happilyeverafter.png";

// ========================================
// LOAD OBSTACLES
// ========================================
const obstacleImages = [
  { src: "assets/heart.png", w: 111, h: 96 },
  { src: "assets/boquet.png", w: 110, h: 112 },
  { src: "assets/bell.png", w: 97, h: 97 },
  { src: "assets/cake.png", w: 103, h: 106 },
];

obstacleImages.forEach((o) => {
  o.img = new Image();
  o.img.src = o.src;
});

// active obstacle
let obstacle = null;
let obstacleX = 800;

// ========================================
// LOAD BUBU FRAMES
// ========================================
let bubuFrames = [];
for (let i = 1; i <= 6; i++) {
  let img = new Image();
  img.src = `assets/bubu/${i}.png`;
  bubuFrames.push(img);
}

// LOAD DUDU FRAMES
let duduFrames = [];
for (let i = 1; i <= 6; i++) {
  let img = new Image();
  img.src = `assets/dudu/${i}.png`;
  duduFrames.push(img);
}

// ========================================
// GAME STATE
// ========================================
let bubuX = 80;
let bubuY = GROUND_Y;

let velY = 0;
let onGround = true;

let animIndex = 0;
let animTimer = 0;

let gameState = "start";
// start → running → end

let showDudu = false;

let assetsLoaded = 0;

// ========================================
// LOAD CHECK
// ========================================
function countAsset() {
  assetsLoaded++;
}

bg.onload = countAsset;
groundTile.onload = countAsset;
startScreen.onload = countAsset;
endingCard.onload = countAsset;

bubuFrames.forEach((img) => (img.onload = countAsset));
duduFrames.forEach((img) => (img.onload = countAsset));
obstacleImages.forEach((o) => (o.img.onload = countAsset));

function waitForAssets() {
  if (assetsLoaded >= 1 + 1 + 1 + 1 + 6 + 6 + 4) {
    drawStartScreen();
  } else {
    requestAnimationFrame(waitForAssets);
  }
}
waitForAssets();

// ========================================
// INPUT HANDLERS
// ========================================
window.addEventListener("keydown", handleInput);
canvas.addEventListener("touchstart", handleInput);

function handleInput() {
  if (gameState === "start") {
    gameState = "running";
    spawnObstacle();
    update();
    return;
  }

  if (gameState === "end") {
    return; // you can add restart logic here
  }

  jump();
}

function jump() {
  if (!onGround) return;
  velY = JUMP_FORCE;
  onGround = false;
}

// ========================================
// OBSTACLE LOGIC
// ========================================
function spawnObstacle() {
  obstacle = obstacleImages[Math.floor(Math.random() * obstacleImages.length)];
  obstacleX = 800;
}

// ========================================
// MAIN UPDATE LOOP
// ========================================
function update() {
  if (gameState !== "running") return;

  // parallax background
  bgOffset -= 1;
  groundOffset -= 6;

  if (bgOffset <= -1024) bgOffset = 0;
  if (groundOffset <= -457) groundOffset = 0;

  // gravity
  velY += GRAVITY;
  bubuY += velY;

  if (bubuY >= GROUND_Y) {
    bubuY = GROUND_Y;
    velY = 0;
    onGround = true;
  }

  // animate Bubu
  animTimer++;
  if (onGround) {
    if (animTimer % 8 === 0) {
      animIndex++;
      if (animIndex > 3) animIndex = 1;
    }
  } else {
    animIndex = 4; // jump frame
  }

  // move obstacle
  obstacleX -= 7;

  // collision
  if (!showDudu) {
    const oW = obstacle.w;
    const oH = obstacle.h;

    let hit =
      bubuX + DRAW_W - 20 > obstacleX &&
      bubuX + 20 < obstacleX + oW &&
      bubuY + DRAW_H > GROUND_Y + DRAW_H - oH;

    if (hit) {
      animIndex = 4;
      gameState = "end";
      drawEndingScreen();
      return;
    }
  }

  // passed obstacle → show Dudu
  if (obstacleX < -150 && !showDudu) {
    showDudu = true;
  }

  // reach Dudu → victory
  if (showDudu && bubuX + DRAW_W > 520) {
    animIndex = 5;
    gameState = "end";
    drawEndingScreen();
    return;
  }

  draw();
  requestAnimationFrame(update);
}

// ========================================
// DRAW FUNCTIONS
// ========================================
function drawBackground() {
  ctx.drawImage(bg, bgOffset, 0, 1024, 1024);
  ctx.drawImage(bg, bgOffset + 1024, 0, 1024, 1024);
}

function drawGround() {
  ctx.drawImage(groundTile, groundOffset, GROUND_Y + DRAW_H - 10);
  ctx.drawImage(groundTile, groundOffset + 457, GROUND_Y + DRAW_H - 10);
  ctx.drawImage(groundTile, groundOffset + 914, GROUND_Y + DRAW_H - 10);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawBackground();
  drawGround();

  // draw obstacle
  if (!showDudu && obstacle) {
    ctx.drawImage(obstacle.img, obstacleX, GROUND_Y + DRAW_H - obstacle.h);
  }

  // draw Bubu
  const bubuFrame = bubuFrames[animIndex];
  ctx.drawImage(
    bubuFrame,
    0,
    0,
    FRAME_W,
    FRAME_H,
    bubuX,
    bubuY - DRAW_H,
    DRAW_W,
    DRAW_H
  );

  // draw Dudu
  if (showDudu) {
    const victoryFrame = duduFrames[6 - 1];
    ctx.drawImage(
      victoryFrame,
      0,
      0,
      FRAME_W,
      FRAME_H,
      520,
      GROUND_Y - 60,
      DRAW_W,
      DRAW_H
    );
  }
}

function drawStartScreen() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  drawGround();

  ctx.drawImage(startScreen, canvas.width / 2 - 120, 20, 245, 298);
}

function drawEndingScreen() {
  draw();
  ctx.drawImage(endingCard, canvas.width / 2 - 180, 20, 360, 200);
}
