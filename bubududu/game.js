// =============================
// CONSTANTS
// =============================
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const FRAME = 256;
const PADDING = 0; // your sheets have no padding

const GRAVITY = 0.6;
const JUMP_FORCE = -11;

let gameRunning = true;

// =============================
// LOAD SPRITES
// =============================
const bubu = new Image();
bubu.src = "assets/bubu_spritesheet.png";

const dudu = new Image();
dudu.src = "assets/dudu_spritesheet.png";

// =============================
// SPRITE FRAME COORDINATES
// =============================

// BUBU frames:
const bubuFrames = [
  { x: 0, y: 0 }, // idle
  { x: 256, y: 0 }, // run1
  { x: 512, y: 0 }, // run2
  { x: 0, y: 256 }, // run3
  { x: 256, y: 256 }, // jump
  { x: 512, y: 256 }, // victory
];

// DUDU frames (same pattern):
const duduFrames = [
  { x: 0, y: 0 },
  { x: 256, y: 0 },
  { x: 512, y: 0 },
  { x: 0, y: 256 },
  { x: 256, y: 256 },
  { x: 512, y: 256 },
];

// =============================
// GAME STATE
// =============================
let bubuX = 80;
let bubuY = 200;

let velY = 0;
let onGround = true;

let bubuAnim = 0;
let animTimer = 0;

let obstacleX = 800;
let obstacleW = 40;
let obstacleH = 60;

let showDudu = false;

// =============================
// INPUT
// =============================
window.addEventListener("keydown", jump);
window.addEventListener("touchstart", jump);

function jump() {
  if (!gameRunning) return;
  if (onGround) {
    velY = JUMP_FORCE;
    onGround = false;
  }
}

// =============================
// MAIN LOOP
// =============================
function update() {
  if (!gameRunning) return;

  // --- gravity ---
  velY += GRAVITY;
  bubuY += velY;

  // floor
  if (bubuY >= 200) {
    bubuY = 200;
    velY = 0;
    onGround = true;
  }

  // --- animate Bubu ---
  animTimer++;
  if (onGround) {
    if (animTimer % 8 === 0) {
      bubuAnim++;
      if (bubuAnim > 3) bubuAnim = 1; // loop run frames
    }
  } else {
    bubuAnim = 4; // jump frame
  }

  // --- move obstacle ---
  obstacleX -= 7;

  if (obstacleX < -50 && !showDudu) {
    // when obstacle finishes, show dudu
    showDudu = true;
  }

  // --- collision ---
  if (!showDudu && obstacleX < bubuX + FRAME - 20) {
    if (bubuY + FRAME > 200) {
      gameRunning = false;
      bubuAnim = 4; // freeze at jump
    }
  }

  draw();
  requestAnimationFrame(update);
}

// =============================
// DRAW EVERYTHING
// =============================
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // ground
  ctx.fillStyle = "#deb5c7";
  ctx.fillRect(0, 264, canvas.width, 4);

  // obstacle (temporary placeholder)
  if (!showDudu) {
    ctx.fillStyle = "#ff8fb1";
    ctx.fillRect(obstacleX, 240, obstacleW, obstacleH);
  }

  // draw Bubu
  const f = bubuFrames[bubuAnim];
  ctx.drawImage(bubu, f.x, f.y, FRAME, FRAME, bubuX, bubuY, 128, 128);

  // Dudu appears at end
  if (showDudu) {
    const df = duduFrames[5]; // happy pose
    ctx.drawImage(dudu, df.x, df.y, FRAME, FRAME, 500, 200, 128, 128);

    // if Bubu reaches Dudu → happy ending
    if (bubuX + FRAME > 500) {
      bubuAnim = 5; // victory pose
      gameRunning = false;
    }
  }
}

// START GAME
update();
