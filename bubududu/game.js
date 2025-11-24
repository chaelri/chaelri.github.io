// ============================================================
// PORTRAIT BUBU RUNNER — CLEAN WORKING FINAL VERSION
// BUBU stays in place. DUDU walks toward BUBU at the end.
// Hearts = +10. Other obstacles = game over.
// ============================================================

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const CANVAS_W = 400;
const CANVAS_H = 700;

canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

// ------------------------------------------------------------
// CONSTANTS
// ------------------------------------------------------------
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

const GRAVITY = 0.8;
const JUMP_FORCE = -15;

const SCROLL = 3;
const OBSTACLE_SCALE = 0.5;

const MIN_SPAWN = 80;
const MAX_SPAWN = 160;

// ------------------------------------------------------------
// LOAD ASSETS
// ------------------------------------------------------------
const bg = new Image();
bg.src = "assets/background.png";

const ground = new Image();
ground.src = "assets/groundtile.png";

const startCard = new Image();
startCard.src = "assets/taptostartwithhearts.png";

const endCard = new Image();
endCard.src = "assets/happilyeverafter.png";

// Obstacles (with dimensions provided by you)
const obstacleDefs = [
  { src: "assets/heart.png", w: 111, h: 96, isHeart: true },
  { src: "assets/boquet.png", w: 110, h: 112, isHeart: false },
  { src: "assets/bell.png", w: 97, h: 97, isHeart: false },
  { src: "assets/cake.png", w: 103, h: 106, isHeart: false },
];

let obstacles = [];

obstacleDefs.forEach((o) => {
  o.img = new Image();
  o.img.src = o.src;
  obstacles.push(o);
});

// Frames for Bubu & Dudu
let bubuFrames = [];
let duduFrames = [];

for (let i = 1; i <= 6; i++) {
  const imgB = new Image();
  imgB.src = `assets/bubu/${i}.png`;
  bubuFrames.push(imgB);

  const imgD = new Image();
  imgD.src = `assets/dudu/${i}.png`;
  duduFrames.push(imgD);
}

// ------------------------------------------------------------
// GAME STATE
// ------------------------------------------------------------
let state = "start"; // start | running | ended
let score = 0;

let bgOffset = 0;
let groundOffset = 0;

// BUBU
let bubu = {
  x: 60,
  y: GROUND_Y - BUBU_H,
  vy: 0,
  onGround: true,
  anim: 0,
  animTimer: 0,
};

// OBSTACLES
let currentObstacle = null;
let obstacleX = CANVAS_W + 40;
let spawnTimer = 0;

// DUDU
let showDudu = false;
let duduX = CANVAS_W + 100;

// ------------------------------------------------------------
// INPUT
// ------------------------------------------------------------
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

// ------------------------------------------------------------
// START / RESET
// ------------------------------------------------------------
function startGame() {
  score = 0;
  state = "running";
  showDudu = false;
  duduX = CANVAS_W + 100;
  currentObstacle = null;
  spawnTimer = 100;
  bubu.x = 60;
  bubu.y = GROUND_Y - BUBU_H;
  bubu.vy = 0;
  bubu.onGround = true;
  bubu.anim = 0;
  requestAnimationFrame(loop);
}

function resetGame() {
  state = "start";
  drawStartScreen();
}

// ------------------------------------------------------------
// SPAWN OBSTACLE
// ------------------------------------------------------------
function spawnObstacle() {
  const o = obstacles[Math.floor(Math.random() * obstacles.length)];
  const w = Math.round(o.w * OBSTACLE_SCALE);
  const h = Math.round(o.h * OBSTACLE_SCALE);

  currentObstacle = {
    img: o.img,
    isHeart: o.isHeart,
    w: w,
    h: h,
    x: CANVAS_W + 40,
    y: GROUND_Y - h,
  };

  spawnTimer = MIN_SPAWN + Math.floor(Math.random() * (MAX_SPAWN - MIN_SPAWN));
}

// ------------------------------------------------------------
// COLLISION CHECK
// ------------------------------------------------------------
function hitboxOverlap(a, b) {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

// ------------------------------------------------------------
// MAIN LOOP
// ------------------------------------------------------------
function loop() {
  if (state !== "running") return;

  // score (time)
  score += 0.2;

  // background scroll
  bgOffset -= SCROLL * 0.3;
  if (bgOffset <= -1024) bgOffset += 1024;

  // ground scroll
  groundOffset -= SCROLL;
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

  // animate Bubu
  bubu.animTimer++;
  if (bubu.onGround) {
    if (bubu.animTimer % 10 === 0) {
      bubu.anim = bubu.anim < 3 ? bubu.anim + 1 : 1;
    }
  } else {
    bubu.anim = 4;
  }

  // obstacle logic
  if (!currentObstacle && !showDudu) {
    spawnTimer--;
    if (spawnTimer <= 0) {
      spawnObstacle();
    }
  }

  if (currentObstacle && !showDudu) {
    currentObstacle.x -= SCROLL * 2.4;

    if (currentObstacle.x + currentObstacle.w < 0) {
      currentObstacle = null;

      // 20% chance to activate Dudu approach
      if (Math.random() < 0.2) {
        showDudu = true;
      }
    }
  }

  // collision
  if (currentObstacle && !showDudu) {
    const bHit = {
      x: bubu.x + 10,
      y: bubu.y + 5,
      w: BUBU_W - 20,
      h: BUBU_H - 10,
    };

    const oHit = {
      x: currentObstacle.x,
      y: currentObstacle.y,
      w: currentObstacle.w,
      h: currentObstacle.h,
    };

    if (hitboxOverlap(bHit, oHit)) {
      if (currentObstacle.isHeart) {
        score += 10;
        currentObstacle = null;
      } else {
        setTimeout(() => endGame(), 80);
        return;
      }
    }
  }

  // Dudu moves IN only after showDudu == true
  if (showDudu) {
    duduX -= SCROLL * 0.8;

    // Bubu reaches Dudu
    if (duduX < bubu.x + BUBU_W) {
      bubu.anim = 5;
      setTimeout(() => endGame(), 100);
    }
  }

  draw();
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------
// DRAW FUNCTIONS
// ------------------------------------------------------------
function drawBackground() {
  const scale = CANVAS_H / 1024;
  const w = 1024 * scale;
  const h = CANVAS_H;

  const ofs = bgOffset;

  ctx.drawImage(bg, 0, 0, 1024, 1024, ofs, 0, w, h);
  ctx.drawImage(bg, 0, 0, 1024, 1024, ofs + w, 0, w, h);
}

function drawGround() {
  const scale = GROUND_H / GROUND_TILE_H;
  const w = GROUND_TILE_W * scale;
  const h = GROUND_H;
  const ofs = groundOffset;

  ctx.drawImage(ground, ofs, GROUND_Y, w, h);
  ctx.drawImage(ground, ofs + w, GROUND_Y, w, h);
  ctx.drawImage(ground, ofs + 2 * w, GROUND_Y, w, h);
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
  const frame = bubuFrames[bubu.anim] || bubuFrames[0];
  ctx.drawImage(frame, 0, 0, FRAME_W, FRAME_H, bubu.x, bubu.y, BUBU_W, BUBU_H);
}

function drawDudu() {
  if (!showDudu) return;
  const frame = duduFrames[0]; // idle while walking in
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

// ------------------------------------------------------------
// START & END SCREENS
// ------------------------------------------------------------
function drawStartScreen() {
  drawBackground();
  drawGround();

  ctx.drawImage(startCard, (CANVAS_W - 245) / 2, 90, 245, 298);

  drawUI();

  ctx.fillStyle = "#6b2630";
  ctx.font = "15px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Tap to Start — Tap to Jump", CANVAS_W / 2, CANVAS_H - 40);
}

function endGame() {
  state = "ended";
  drawEndScreen();
}

function drawEndScreen() {
  drawBackground();
  drawGround();

  ctx.drawImage(
    duduFrames[5], // victory pose
    0,
    0,
    FRAME_W,
    FRAME_H,
    CANVAS_W / 2 + 10,
    GROUND_Y - DUDU_H,
    DUDU_W,
    DUDU_H
  );

  ctx.drawImage(
    bubuFrames[5],
    0,
    0,
    FRAME_W,
    FRAME_H,
    CANVAS_W / 2 - 80,
    GROUND_Y - BUBU_H,
    BUBU_W,
    BUBU_H
  );

  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fillRect((CANVAS_W - 360) / 2 - 8, 70 - 8, 360 + 16, 200 + 16);
  ctx.drawImage(endCard, (CANVAS_W - 360) / 2, 70, 360, 200);

  ctx.fillStyle = "#6b2630";
  ctx.font = "20px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`Final Score: ${Math.floor(score)}`, CANVAS_W / 2, 290);
  ctx.fillText("Tap to play again", CANVAS_W / 2, CANVAS_H - 40);
}
