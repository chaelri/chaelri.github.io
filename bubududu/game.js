// ==========================================================
// FINAL CLEAN WORKING GAME.JS — BUBU RUNNER (PORTRAIT MODE)
// ==========================================================

// --------------------- CANVAS ------------------------------
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const CANVAS_W = 400;
const CANVAS_H = 700;
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

// --------------------- CONSTANTS ---------------------------
const FRAME_W = 251;
const FRAME_H = 298;

const BUBU_W = 60;
const BUBU_H = 70;

const DUDU_W = 60;
const DUDU_H = 70;

const GROUND_TILE_W = 457;
const GROUND_TILE_H = 64;
const GROUND_H = 90;

const GROUND_Y = CANVAS_H - GROUND_H;
const DUDU_Y = GROUND_Y - DUDU_H; // FIXED

const GRAVITY = 0.75;
const JUMP_FORCE = -15;

const SCROLL_BG = 1.2;
const SCROLL_GROUND = 3;

const OBSTACLE_SCALE = 0.5;

const MIN_SPAWN = 80;
const MAX_SPAWN = 150;

// --------------------- ASSETS ------------------------------
const bg = new Image();
bg.src = "assets/background.png";

const ground = new Image();
ground.src = "assets/groundtile.png";

const startCard = new Image();
startCard.src = "assets/taptostartwithhearts.png";

const endCard = new Image();
endCard.src = "assets/happilyeverafter.png";

// obstacles info (from your dimensions)
const obstacleDefs = [
  { src: "assets/heart.png", w: 111, h: 96, isHeart: true },
  { src: "assets/boquet.png", w: 110, h: 112, isHeart: false },
  { src: "assets/bell.png", w: 97, h: 97, isHeart: false },
  { src: "assets/cake.png", w: 103, h: 106, isHeart: false },
];

// preload obstacles
let obstacles = [];
obstacleDefs.forEach((o) => {
  const img = new Image();
  img.src = o.src;
  obstacles.push({
    img,
    isHeart: o.isHeart,
    w: Math.round(o.w * OBSTACLE_SCALE),
    h: Math.round(o.h * OBSTACLE_SCALE),
  });
});

// preload bubu/dudu frames
let bubuFrames = [];
let duduFrames = [];

for (let i = 1; i <= 6; i++) {
  let b = new Image();
  b.src = `assets/bubu/${i}.png`;
  bubuFrames.push(b);

  let d = new Image();
  d.src = `assets/dudu/${i}.png`;
  duduFrames.push(d);
}

// --------------------- GAME STATE --------------------------
let state = "start"; // start | running | ended
let score = 0;

let bgOffset = 0;
let groundOffset = 0;

let bubu = {
  x: 60,
  y: GROUND_Y - BUBU_H,
  vy: 0,
  anim: 0,
  animTimer: 0,
  onGround: true,
};

let currentObstacle = null;
let obstacleX = CANVAS_W + 40;
let spawnTimer = 100;

let showDudu = false;
let duduX = CANVAS_W + 120;

// --------------------- INPUT -------------------------------
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
    resetGame();
  }
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") handleTap();
});
canvas.addEventListener("mousedown", handleTap);
canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  handleTap();
});

// --------------------- START / RESET ------------------------
function startGame() {
  state = "running";
  score = 0;
  showDudu = false;
  duduX = CANVAS_W + 120;
  currentObstacle = null;
  spawnTimer = 100;

  bubu.y = GROUND_Y - BUBU_H;
  bubu.vy = 0;
  bubu.anim = 0;

  requestAnimationFrame(loop);
}

function resetGame() {
  state = "start";
  drawStartScreen();
}

// --------------------- SPAWN OBSTACLES ----------------------
function spawnObstacle() {
  const o = obstacles[Math.floor(Math.random() * obstacles.length)];

  currentObstacle = {
    img: o.img,
    isHeart: o.isHeart,
    w: o.w,
    h: o.h,
    x: CANVAS_W + 20,
    y: GROUND_Y - o.h,
  };

  spawnTimer = MIN_SPAWN + Math.floor(Math.random() * (MAX_SPAWN - MIN_SPAWN));
}

// --------------------- COLLISION ----------------------------
function overlap(a, b) {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

// --------------------- MAIN LOOP ----------------------------
function loop() {
  if (state !== "running") return;

  score += 0.15;

  // background scroll
  bgOffset -= SCROLL_BG;
  if (bgOffset <= -1024) bgOffset += 1024;

  // ground scroll
  groundOffset -= SCROLL_GROUND;
  if (groundOffset <= -GROUND_TILE_W) groundOffset += GROUND_TILE_W;

  // physics
  bubu.vy += GRAVITY;
  bubu.y += bubu.vy;

  if (bubu.y >= GROUND_Y - BUBU_H) {
    bubu.y = GROUND_Y - BUBU_H;
    bubu.vy = 0;
    bubu.onGround = true;
  } else {
    bubu.onGround = false;
  }

  // animation
  bubu.animTimer++;
  if (bubu.onGround) {
    if (bubu.animTimer % 10 === 0) {
      bubu.anim = bubu.anim < 3 ? bubu.anim + 1 : 1;
    }
  } else {
    bubu.anim = 4; // jump frame
  }

  // obstacle logic
  if (!currentObstacle && !showDudu) {
    spawnTimer--;
    if (spawnTimer <= 0) {
      spawnObstacle();
    }
  }

  if (currentObstacle && !showDudu) {
    currentObstacle.x -= SCROLL_GROUND * 1.8;

    if (currentObstacle.x + currentObstacle.w < 0) {
      currentObstacle = null;
      if (Math.random() < 0.25) showDudu = true; // after some obstacles, Dudu walks in
    }
  }

  // collision
  if (currentObstacle && !showDudu) {
    const bHit = {
      x: bubu.x + 10,
      y: bubu.y + 10,
      w: BUBU_W - 20,
      h: BUBU_H - 10,
    };
    const oHit = {
      x: currentObstacle.x,
      y: currentObstacle.y,
      w: currentObstacle.w,
      h: currentObstacle.h,
    };

    if (overlap(bHit, oHit)) {
      if (currentObstacle.isHeart) {
        score += 10;
        currentObstacle = null;
      } else {
        endGame();
        return;
      }
    }
  }

  // Dudu moves in
  if (showDudu) {
    duduX -= SCROLL_GROUND * 0.8;

    if (duduX < bubu.x + BUBU_W) {
      bubu.anim = 5;
      endGame();
      return;
    }
  }

  draw();
  requestAnimationFrame(loop);
}

// --------------------- DRAW -------------------------------
function drawBackground() {
  const scale = CANVAS_H / 1024;
  const w = 1024 * scale;
  const h = CANVAS_H;

  let x = bgOffset;

  ctx.drawImage(bg, 0, 0, 1024, 1024, x, 0, w, h);
  ctx.drawImage(bg, 0, 0, 1024, 1024, x + w, 0, w, h);
}

function drawGround() {
  const scale = GROUND_H / GROUND_TILE_H;
  const w = GROUND_TILE_W * scale;
  const h = GROUND_H;

  const x = groundOffset;

  ctx.drawImage(ground, x, GROUND_Y, w, h);
  ctx.drawImage(ground, x + w, GROUND_Y, w, h);
  ctx.drawImage(ground, x + w * 2, GROUND_Y, w, h);
}

function drawObstacle() {
  if (!currentObstacle || showDudu) return;
  ctx.drawImage(
    currentObstacle.img,
    currentObstacle.x,
    currentObstacle.y,
    currentObstacle.w,
    currentObstacle.h
  );
}

function drawBubu() {
  const frame = bubuFrames[bubu.anim];
  ctx.drawImage(frame, 0, 0, FRAME_W, FRAME_H, bubu.x, bubu.y, BUBU_W, BUBU_H);
}

function drawDudu() {
  if (!showDudu) return;
  const frame = duduFrames[0];
  ctx.drawImage(frame, 0, 0, FRAME_W, FRAME_H, duduX, DUDU_Y, DUDU_W, DUDU_H);
}

function drawUI() {
  const scoreEl = document.getElementById("score");
  if (scoreEl) scoreEl.textContent = `Score: ${Math.floor(score)}`;
}

function draw() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  drawBackground();
  drawGround();
  drawObstacle();
  drawBubu();
  drawDudu();
  drawUI();
}

// --------------------- START / END SCREENS -----------------
function drawStartScreen() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  drawBackground();
  drawGround();

  ctx.drawImage(startCard, (CANVAS_W - 245) / 2, 100, 245, 298);

  ctx.fillStyle = "#6b2630";
  ctx.font = "16px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Tap to Start — Tap to Jump", CANVAS_W / 2, CANVAS_H - 40);

  drawUI();
}

function endGame() {
  state = "ended";
  drawEndScreen();
}

function drawEndScreen() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  drawBackground();
  drawGround();

  // Bubu + Dudu hugging pose
  ctx.drawImage(
    duduFrames[5],
    0,
    0,
    FRAME_W,
    FRAME_H,
    CANVAS_W / 2 + 5,
    DUDU_Y,
    DUDU_W,
    DUDU_H
  );
  ctx.drawImage(
    bubuFrames[5],
    0,
    0,
    FRAME_W,
    FRAME_H,
    CANVAS_W / 2 - 75,
    DUDU_Y,
    BUBU_W,
    BUBU_H
  );

  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.fillRect((CANVAS_W - 360) / 2 - 8, 70 - 8, 360 + 16, 200 + 16);
  ctx.drawImage(endCard, (CANVAS_W - 360) / 2, 70, 360, 200);

  ctx.fillStyle = "#6b2630";
  ctx.font = "18px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`Final Score: ${Math.floor(score)}`, CANVAS_W / 2, 290);
  ctx.fillText("Tap to play again", CANVAS_W / 2, CANVAS_H - 40);
}

// -----------------------------------------------------------
// FIRST LOAD
// -----------------------------------------------------------
drawStartScreen();
