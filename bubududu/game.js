// =============================
// CONSTANTS
// =============================
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const FRAME_W = 251;
const FRAME_H = 298;

const DRAW_W = 120; // how big Bubu appears in game
const DRAW_H = 140;

const GROUND_Y = 230;

const GRAVITY = 0.6;
const JUMP_FORCE = -12;

// =============================
// LOAD FRAMES
// =============================
let bubuFrames = [];
let duduFrames = [];

for (let i = 1; i <= 6; i++) {
  let img = new Image();
  img.src = `assets/bubu/${i}.png`;
  bubuFrames.push(img);
}

for (let i = 1; i <= 6; i++) {
  let img = new Image();
  img.src = `assets/dudu/${i}.png`;
  duduFrames.push(img);
}

// =============================
// GAME STATE
// =============================
let bubuX = 80;
let bubuY = GROUND_Y;

let velY = 0;
let onGround = true;

let animIndex = 0;
let animTimer = 0;

let obstacleX = 800;
let obstacleW = 40;
let obstacleH = 60;

let showDudu = false;

let assetsLoaded = 0;

// Wait until all frames load
bubuFrames.forEach((img) => (img.onload = () => assetsLoaded++));
duduFrames.forEach((img) => (img.onload = () => assetsLoaded++));

function waitForLoad() {
  if (assetsLoaded === 12) {
    update();
  } else {
    requestAnimationFrame(waitForLoad);
  }
}
waitForLoad();

// =============================
// INPUT
// =============================
window.addEventListener("keydown", jump);
window.addEventListener("touchstart", jump);

function jump() {
  if (!onGround) return;
  velY = JUMP_FORCE;
  onGround = false;
}

// =============================
// MAIN LOOP
// =============================
function update() {
  // gravity
  velY += GRAVITY;
  bubuY += velY;

  // floor
  if (bubuY >= GROUND_Y) {
    bubuY = GROUND_Y;
    velY = 0;
    onGround = true;
  }

  // animation
  animTimer++;
  if (onGround) {
    if (animTimer % 8 === 0) {
      animIndex++;
      if (animIndex > 3) animIndex = 1;
    }
  } else {
    animIndex = 4; // jump frame
  }

  // obstacle movement
  obstacleX -= 7;

  if (obstacleX < -50 && !showDudu) {
    showDudu = true;
  }

  // collision
  if (!showDudu) {
    let hit =
      bubuX + DRAW_W - 20 > obstacleX &&
      bubuX + 20 < obstacleX + obstacleW &&
      bubuY + DRAW_H > GROUND_Y - obstacleH;

    if (hit) {
      animIndex = 4;
      return; // stop game
    }
  }

  draw();
  requestAnimationFrame(update);
}

// =============================
// DRAW
// =============================
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // ground
  ctx.fillStyle = "#deb5c7";
  ctx.fillRect(0, GROUND_Y + DRAW_H - 10, canvas.width, 5);

  // obstacle (temp)
  if (!showDudu) {
    ctx.fillStyle = "#ff8fb1";
    ctx.fillRect(
      obstacleX,
      GROUND_Y + DRAW_H - obstacleH,
      obstacleW,
      obstacleH
    );
  }

  // Draw BUBU
  let bubuFrame = bubuFrames[animIndex];
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

  // Draw DUDU at finish
  if (showDudu) {
    let df = duduFrames[5];
    ctx.drawImage(
      df,
      0,
      0,
      FRAME_W,
      FRAME_H,
      520,
      GROUND_Y - 60,
      DRAW_W,
      DRAW_H
    );

    if (bubuX + DRAW_W > 520) {
      animIndex = 5; // victory pose
    }
  }
}
