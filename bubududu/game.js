// ==========================================================
// FINAL CLEAN WORKING GAME.JS — BUBU RUNNER (PORTRAIT MODE)
// ==========================================================

/* Notes:
 - Canvas internal resolution is 400x700 (kept)
 - Visual scaling is handled by CSS. All coordinates assume 400x700 internal units.
 - Place your assets inside ./assets/... as referenced below.
*/

// --------------------- CANVAS ------------------------------
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const CANVAS_W = 400;
const CANVAS_H = 700;

// High-res canvas for crisp text
const dpr = window.devicePixelRatio || 1;
canvas.width = CANVAS_W * dpr;
canvas.height = CANVAS_H * dpr;
ctx.scale(dpr, dpr);
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = "high";

// --------------------- CONSTANTS ---------------------------
const FRAME_W = 251;
const FRAME_H = 298;

const BUBU_W = 60;
const BUBU_H = 70;

const DUDU_W = 60;
const DUDU_H = 70;

const GROUND_TILE_H = 64; // natural tile height (source art)
const GROUND_H = 90; // visual ground height on canvas

const GROUND_Y = CANVAS_H - GROUND_H;
const DUDU_Y = GROUND_Y - DUDU_H;

const GRAVITY = 0.75;
const JUMP_FORCE = -15;

const SCROLL_BG = 1.2;
const SCROLL_GROUND = 3;

const OBSTACLE_SCALE = 0.8;

const MIN_SPAWN = 80;
const MAX_SPAWN = 150;

let floatingTexts = [];
let duduAnim = 0;
let duduAnimTimer = 0;
let bubuTrail = [];

// --------------------- ASSET LIST --------------------------
const ASSETS = {
  bg: "assets/background.png",
  ground: "assets/groundtile.png",
  startCard: "assets/taptostartwithhearts.png",
  endCard: "assets/happilyeverafter.png",
  bubuFrames: [
    "assets/bubu/1.png",
    "assets/bubu/2.png",
    "assets/bubu/3.png",
    "assets/bubu/4.png",
    "assets/bubu/5.png",
    "assets/bubu/6.png",
  ],
  duduFrames: [
    "assets/dudu/1.png",
    "assets/dudu/2.png",
    "assets/dudu/3.png",
    "assets/dudu/4.png",
    "assets/dudu/5.png",
    "assets/dudu/6.png",
  ],
  obstacleDefs: [
    { src: "assets/heart.png", w: 111, h: 96, isHeart: true },
    { src: "assets/boquet.png", w: 110, h: 112, isHeart: false },
    { src: "assets/bell.png", w: 97, h: 97, isHeart: false },
    { src: "assets/cake.png", w: 103, h: 106, isHeart: false },
  ],
};

// --------------------- PRELOADERS --------------------------
function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = (e) => rej(new Error("Failed load: " + src));
    img.src = src;
  });
}

async function preloadAll() {
  const p = [];
  // bg, ground, start/end
  p.push(loadImage(ASSETS.bg));
  p.push(loadImage(ASSETS.ground));
  p.push(loadImage(ASSETS.startCard));
  p.push(loadImage(ASSETS.endCard));

  // frames
  ASSETS.bubuFrames.forEach((s) => p.push(loadImage(s)));
  ASSETS.duduFrames.forEach((s) => p.push(loadImage(s)));

  // obstacles
  ASSETS.obstacleDefs.forEach((o) => p.push(loadImage(o.src)));

  const imgs = await Promise.all(p);
  // Map back to objects
  let idx = 0;
  const bgImg = imgs[idx++]; // bg
  const groundImg = imgs[idx++]; // ground
  const startCardImg = imgs[idx++]; // start
  const endCardImg = imgs[idx++]; // end

  // frames (bubu)
  const bubuImgs = [];
  for (let i = 0; i < ASSETS.bubuFrames.length; i++) bubuImgs.push(imgs[idx++]);
  const duduImgs = [];
  for (let i = 0; i < ASSETS.duduFrames.length; i++) duduImgs.push(imgs[idx++]);

  // obstacles
  const obstacleImgs = [];
  for (let i = 0; i < ASSETS.obstacleDefs.length; i++) {
    obstacleImgs.push(imgs[idx++]);
  }

  // return nicely structured
  return {
    bgImg,
    groundImg,
    startCardImg,
    endCardImg,
    bubuImgs,
    duduImgs,
    obstacleImgs,
  };
}

// --------------------- GAME STATE --------------------------
let state = "loading"; // loading | start | running | ended
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
let spawnTimer = 100;

let showDudu = false;
let duduX = CANVAS_W + 120;

let rafId = null;

// assets placeholders (populated after preload)
let IMG = {};

// scaled tile widths (computed after images load)
let bgTileW = 0;
let groundTileW = 0;

// obstacles array structured
let obstacles = [];
let bubuFrames = [];
let duduFrames = [];

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
    return;
  }
}

// keyboard + mouse + touch
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") handleTap();
});
canvas.addEventListener("mousedown", (e) => {
  e.preventDefault();
  handleTap();
});
canvas.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    handleTap();
  },
  { passive: false }
);

// disable touchmove scrolling while touching canvas
window.addEventListener(
  "touchmove",
  (e) => {
    if (state === "running") e.preventDefault();
  },
  { passive: false }
);

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

  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

function resetGame() {
  state = "start";
  showDudu = false;
  currentObstacle = null;
  spawnTimer = MIN_SPAWN + Math.floor(Math.random() * (MAX_SPAWN - MIN_SPAWN));
  drawStartScreen();
}

// --------------------- SPAWN OBSTACLES ----------------------
function spawnObstacle() {
  const i = Math.floor(Math.random() * ASSETS.obstacleDefs.length);
  const def = ASSETS.obstacleDefs[i];
  const imgObj = obstacles[i];

  // Per-obstacle scaling
  let scale = 0.5; // default

  if (def.isHeart) scale = 0.45;
  if (def.src.includes("cake")) scale = 0.4;
  if (def.src.includes("bell")) scale = 0.42;
  if (def.src.includes("boquet")) scale = 0.48;

  // HEIGHT LOGIC
  let obstacleH = Math.round(def.h * scale);
  let finalY;

  if (def.isHeart) {
    // Hearts → jump zone
    // Reachable jump zone (relative to Bubu's jump height)
    const maxReach = GROUND_Y - BUBU_H - 80; // highest reachable
    const minReach = GROUND_Y - BUBU_H - 40; // slightly above head

    finalY = Math.random() < 0.5 ? maxReach : minReach; // slightly random but always reachable
  } else {
    // Non-hearts → ground zone
    finalY = GROUND_Y - obstacleH;
  }

  currentObstacle = {
    img: imgObj.img,
    isHeart: def.isHeart,
    w: Math.round(def.w * scale),
    h: obstacleH,
    x: CANVAS_W + 20,
    y: finalY,
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
let lastTime = 0;
function loop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const dt = (timestamp - lastTime) / 16.666; // normalize to 60fps
  lastTime = timestamp;

  if (state !== "running") return;

  score += 0.15;

  // background scroll (using actual scaled bgTileW)
  bgOffset = (bgOffset + SCROLL_BG) % bgTileW;
  if (bgOffset < -bgTileW) bgOffset += bgTileW;
  if (bgOffset > bgTileW) bgOffset -= bgTileW;

  // ground scroll
  groundOffset = (groundOffset + SCROLL_GROUND) % groundTileW;
  if (groundOffset < -groundTileW) groundOffset += groundTileW;
  if (groundOffset > groundTileW) groundOffset -= groundTileW;

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

  // Emit bubu trail
  if (bubu.onGround) {
    // walking: subtle trail
    if (Math.random() < 0.3) {
      bubuTrail.push({
        x: bubu.x + BUBU_W * 0.4,
        y: bubu.y + BUBU_H * 0.7,
        alpha: 0.8,
        size: 10 + Math.random() * 4,
        vy: 0.3,
        type: "walk",
      });
    }
  } else {
    // jumping: cute floaty hearts
    if (Math.random() < 0.4) {
      bubuTrail.push({
        x: bubu.x + BUBU_W * 0.4,
        y: bubu.y + BUBU_H * 0.5,
        alpha: 0.9,
        size: 12 + Math.random() * 6,
        vy: -0.4,
        type: "jump",
      });
    }
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

      if (score >= 1000 && Math.random() < 0.75) {
        showDudu = true;
      }
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
        // Add score
        score += 100;

        // Add floating cute text
        floatingTexts.push({
          x: bubu.x + 20,
          y: bubu.y - 10,
          text: "+100",
          alpha: 1,
          vy: -0.6,
        });

        currentObstacle = null;
      } else {
        endGame();
        return;
      }
    }
  }

  // Dudu walking animation
  if (showDudu) {
    duduAnimTimer += dt;
    if (duduAnimTimer >= 8) {
      // about .12s at 60fps
      duduAnimTimer = 0;
      duduAnim = (duduAnim + 1) % 4;
    }
  }

  // Dudu moves in
  if (showDudu) {
    duduX -= SCROLL_GROUND * 0.8;

    if (duduX < bubu.x + BUBU_W) {
      triggerDuduEnding();
      return;
    }
  }

  // Update floating texts
  floatingTexts = floatingTexts.filter((ft) => ft.alpha > 0);
  floatingTexts.forEach((ft) => {
    ft.y += ft.vy;
    ft.alpha -= 0.02;
  });

  // Update trail
  bubuTrail = bubuTrail.filter((t) => t.alpha > 0);
  bubuTrail.forEach((t) => {
    t.y += t.vy;
    t.alpha -= 0.02;
    t.size *= 0.98; // shrink over time
  });

  draw();
  rafId = requestAnimationFrame(loop);
}

// --------------------- DRAW HELPERS ------------------------
function drawBackground() {
  const img = IMG.bg;
  if (!img) return;

  // compute scale that fits height (cover vertically)
  const scale = CANVAS_H / img.naturalHeight;
  const w = Math.round(img.naturalWidth * scale);

  // draw enough tiles to cover canvas width with seamless offset
  // offset normalized to [-w, 0)
  const offset = ((bgOffset % w) + w) % w;
  let x = -offset;
  while (x < CANVAS_W) {
    ctx.drawImage(
      img,
      0,
      0,
      img.naturalWidth,
      img.naturalHeight,
      x,
      0,
      w,
      CANVAS_H
    );
    x += w;
  }
}

function drawGround() {
  const img = IMG.ground;
  if (!img) return;
  // scale ground tile to desired GROUND_H
  const scale = GROUND_H / img.naturalHeight;
  const w = Math.round(img.naturalWidth * scale);
  const h = GROUND_H;
  const offset = ((groundOffset % w) + w) % w;
  let x = -offset;
  // draw 1 extra tile on each side to avoid gaps
  while (x < CANVAS_W) {
    ctx.drawImage(
      img,
      0,
      0,
      img.naturalWidth,
      img.naturalHeight,
      x,
      GROUND_Y,
      w,
      h
    );
    x += w;
  }
}

function drawObstacle() {
  if (!currentObstacle || showDudu) return;
  ctx.drawImage(
    currentObstacle.img,
    0,
    0,
    currentObstacle.img.naturalWidth,
    currentObstacle.img.naturalHeight,
    currentObstacle.x,
    currentObstacle.y,
    currentObstacle.w,
    currentObstacle.h
  );
}

function drawBubu() {
  const frameImg =
    bubuFrames[Math.max(0, Math.min(bubu.anim, bubuFrames.length - 1))];
  if (!frameImg) return;
  ctx.drawImage(
    frameImg,
    0,
    0,
    frameImg.naturalWidth,
    frameImg.naturalHeight,
    bubu.x,
    bubu.y,
    BUBU_W,
    BUBU_H
  );
}

function drawDudu() {
  if (!showDudu) return;

  const frame = duduFrames[duduAnim];

  ctx.save();
  ctx.scale(-1, 1); // flip horizontally

  ctx.drawImage(
    frame,
    0,
    0,
    frame.naturalWidth,
    frame.naturalHeight,
    -(duduX + DUDU_W),
    DUDU_Y,
    DUDU_W,
    DUDU_H
  );

  ctx.restore();
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
  // Draw floating score texts
  floatingTexts.forEach((ft) => {
    ctx.globalAlpha = ft.alpha;
    ctx.fillStyle = "#ff8acb"; // cute pink
    ctx.font = "20px Arial";
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.globalAlpha = 1;
  });
  // Draw Bubu Trail
  bubuTrail.forEach((t) => {
    ctx.globalAlpha = t.alpha;

    if (t.type === "walk") {
      ctx.fillStyle = "#ffb6d9"; // soft pink
    } else {
      ctx.fillStyle = "#ff8acb"; // brighter for jump
    }

    ctx.beginPath();
    ctx.arc(t.x, t.y, t.size, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
  });
}

// --------------------- START / END SCREENS -----------------
function drawStartScreen() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  drawBackground();
  drawGround();

  // center the start card
  const w = Math.min(
    300,
    IMG.startCard.naturalWidth * (300 / IMG.startCard.naturalWidth)
  );
  const h = w * (IMG.startCard.naturalHeight / IMG.startCard.naturalWidth);
  ctx.drawImage(
    IMG.startCard,
    0,
    0,
    IMG.startCard.naturalWidth,
    IMG.startCard.naturalHeight,
    (CANVAS_W - w) / 2,
    80,
    w,
    h
  );

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

  // hugging pose (center)
  const dImg = duduFrames[5] || duduFrames[0];
  const bImg = bubuFrames[5] || bubuFrames[0];

  const px = CANVAS_W / 2;
  ctx.drawImage(
    dImg,
    0,
    0,
    dImg.naturalWidth,
    dImg.naturalHeight,
    px + 5,
    DUDU_Y,
    DUDU_W,
    DUDU_H
  );
  ctx.drawImage(
    bImg,
    0,
    0,
    bImg.naturalWidth,
    bImg.naturalHeight,
    px - 75,
    DUDU_Y,
    BUBU_W,
    BUBU_H
  );

  // translucent overlay + end card
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.fillRect((CANVAS_W - 360) / 2 - 8, 70 - 8, 360 + 16, 200 + 16);

  const ec = IMG.endCard;
  const ecW = 360;
  const ecH = Math.round(ec.naturalHeight * (ecW / ec.naturalWidth));
  ctx.drawImage(
    ec,
    0,
    0,
    ec.naturalWidth,
    ec.naturalHeight,
    (CANVAS_W - ecW) / 2,
    70,
    ecW,
    ecH
  );

  ctx.fillStyle = "#6b2630";
  ctx.font = "18px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`Final Score: ${Math.floor(score)}`, CANVAS_W / 2, 290);
  ctx.fillText("Tap to play again", CANVAS_W / 2, CANVAS_H - 40);
}

function triggerDuduEnding() {
  state = "duduEnding";

  // hide canvas UI
  document.getElementById("ui").style.display = "none";

  // show romantic ending screen
  const screen = document.getElementById("duduEnding");
  screen.style.display = "flex";

  // OPTIONAL: spawn floating hearts
  for (let i = 0; i < 12; i++) {
    const h = document.createElement("div");
    h.className = "dudu-heart";
    h.style.left = Math.random() * 100 + "%";
    h.style.animationDelay = Math.random() * 3 + "s";
    h.textContent = "💗";
    screen.appendChild(h);
  }
}

// --------------------- BOOT / INIT -------------------------
(async function boot() {
  try {
    const loaded = await preloadAll();
    // map images
    IMG.bg = loaded.bgImg;
    IMG.ground = loaded.groundImg;
    IMG.startCard = loaded.startCardImg;
    IMG.endCard = loaded.endCardImg;

    bubuFrames = loaded.bubuImgs;
    duduFrames = loaded.duduImgs;

    // obstacles mapping using obstacleDefs order
    obstacles = ASSETS.obstacleDefs.map((def, i) => ({
      img: loaded.obstacleImgs[i],
      isHeart: def.isHeart,
      w: Math.round(def.w * OBSTACLE_SCALE),
      h: Math.round(def.h * OBSTACLE_SCALE),
    }));

    // compute tile widths for bg and ground using natural dimensions scaled to canvas height / ground height
    const bgScale = CANVAS_H / IMG.bg.naturalHeight;
    bgTileW = Math.round(IMG.bg.naturalWidth * bgScale);

    const groundScale = GROUND_H / IMG.ground.naturalHeight;
    groundTileW = Math.round(IMG.ground.naturalWidth * groundScale);

    // ensure non-zero
    if (!bgTileW) bgTileW = 1024;
    if (!groundTileW) groundTileW = 457;

    // set initial spawn timer
    spawnTimer =
      MIN_SPAWN + Math.floor(Math.random() * (MAX_SPAWN - MIN_SPAWN));

    // initial state -> start
    state = "start";

    // draw start screen now that everything is loaded
    drawStartScreen();
  } catch (err) {
    console.error("Asset preload failed:", err);
    ctx.fillStyle = "#000";
    ctx.font = "16px sans-serif";
    ctx.fillText("Failed to load assets. Check console.", 20, 60);
  }
})();

// Export for debugging (optional)
window.__bubu = {
  startGame,
  resetGame,
  drawStartScreen,
  drawEndScreen,
  draw,
};

document.getElementById(
  "duduMessage"
).innerHTML = `My love Karla, I've been running after you not to catch you… but to run with you forever. 💗
  
  Hello fiancè ko,
  
  I just want to appreciate you love
  for being so loving Bubu for me. 
  You might be feeling down from yourself
  pero know na I appreciate you not just
  from what you are showing me, but because
  of who you really are. Blessing ka sakin, love.

  I want you to know na di ako lugi sayo.
  I want to assure you na di magbabago love ko sayo
  I want to assure you na sure ako sayo
  I want you to know that Dudu loves you so much.
  
  You might not want medtech anymore, 
  but know that proud na proud pa rin ako sayo
  I appreciate how dedicated you are sa work.
  I appreciate you being early na lagi para di ma-late
  I love how you always pray for me in the morning.
  I love how you update me kahit na natutulog me.

  I appreciate the food blessings na binibigay mo sakin
  Mapa-small man or malaki, lagi me nasusurprise and
  I'm really glad sa mga gifts ni Bubu sakin.

  I want you to know how special you are for me.
  
  I'm sorry for being bad Dudu
  and not prioritizing my Bubu.

  Know that di man ako sawa sayo
  and I love you always. 

  I miss you love ko, and I always want to bond with you.
  - your fiance, Dudu Chalee`;
