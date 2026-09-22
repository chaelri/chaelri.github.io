// The roster.
//
// Two kinds of character live here behind one interface. Bubu and Dudu are
// six-frame sprite sheets lifted from `bubududu/`. Yhon Yhon has no sprite at
// all — in `tayo/` he is a pile of absolutely-positioned divs, so he is
// rebuilt here from the same measurements and drawn with canvas paths. Both
// answer to draw(ctx, x, y, w, h, pose).
//
// `pose` is { face: -1|1, run: 0..1, air: -1|0|1, squash: number, t: seconds }.

const SPRITE_W = 251;
const SPRITE_H = 298;

function loadFrames(dir, n = 6) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const img = new Image();
    img.src = `assets/${dir}/${i}.png`;
    out.push(img);
  }
  return out;
}

// Frame 1 is the neutral stand, 2-5 are the walk cycle, 6 has an arm raised.
const WALK_FRAMES = [1, 2, 3, 4];

/**
 * Advance the walk cycle by DISTANCE COVERED, one frame per `stride` tiles.
 *
 * The first version multiplied elapsed time by a speed that itself depended on
 * how fast you were going, so every acceleration jumped the cycle to a
 * different point and the whole thing stuttered. Distance has no such seam:
 * the feet move because the character moved.
 */
function spriteFrame(frames, pose) {
  if (pose.air !== 0) return frames[pose.air < 0 ? 5 : 3] || frames[0];
  if (pose.run < 0.1) return frames[0];
  const i = Math.floor(pose.walk / (pose.stride || 1));
  return frames[WALK_FRAMES[i % WALK_FRAMES.length]] || frames[0];
}

function drawSprite(frames, ctx, x, y, w, h, pose) {
  const img = spriteFrame(frames, pose);
  if (!img || !img.complete || !img.naturalWidth) {
    // Asset still loading — a soft blob keeps the player visible rather than
    // vanishing for the first few frames of a round.
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.ellipse(x, y - h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // The art is taller than it is wide; fit to height and keep the ratio.
  const k = Math.max(0.78, Math.min(1.22, 1 - pose.squash * 0.8));
  const dh = h * k;
  const dw = (h * SPRITE_W) / SPRITE_H / k;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pose.face, 1);
  ctx.drawImage(img, -dw / 2, -dh, dw, dh);
  ctx.restore();
}

/* ------------------------------------------------------------ yhon yhon --- */

// Measured straight off the reference render rather than off the stylesheet:
// the CSS gives you part sizes but not how round he actually reads once the
// ears and snout are on. Everything is a fraction of BODY WIDTH, and the body
// is deliberately a touch wider than it is tall (1.07) — he is a circle, not
// an egg, and the first version came out narrow and tall and looked wrong.
const Y = {
  body: "#f7bcc6",
  bodyLo: "#f0aab7", // underside, so he is not flat
  innerEar: "#e79cab",
  snout: "#f0a6b4",
  nostril: "#d3838f",
  blush: "#eb9aa8",
  foot: "#f2b0bc",
  eye: "#17111a",

  aspect: 1.07, // width / height
  earAt: 0.34, earSize: [0.2, 0.19], earTop: -0.42,
  innerEarSize: [0.1, 0.095],
  armAt: 0.49, armSize: [0.12, 0.155], armY: 0.11,
  eyeAt: 0.175, eyeY: -0.075, eyeR: 0.035,
  snoutSize: [0.3, 0.215], snoutY: 0.16,
  nostrilAt: 0.057, nostrilSize: [0.045, 0.075],
  blushAt: 0.29, blushY: 0.07, blushSize: [0.138, 0.088],
  footAt: 0.17, footSize: [0.132, 0.095], footY: 0.47,
};

function ellipse(ctx, cx, cy, rx, ry, rot, fill, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawYhon(ctx, x, y, w, h, pose) {
  // Squash is exaggerated well past physical sense — he is supposed to read as
  // squishy, and a subtle 5% wobble on a round pink blob reads as nothing.
  // positive squash = landed, so go short and wide; negative = airborne, so
  // stretch tall and narrow.
  //
  // Width is the INVERSE of the height factor, not another multiple of it, so
  // he keeps his bulk while he deforms. Scaling both the same way made him
  // balloon on every jump and shrink to a pea on every landing.
  //
  // The jump is an ARC, and he has to be drawn as one. `squash` is a decaying
  // impulse — it is spent ~100 ms after takeoff, so on its own he spent the
  // whole flight as a static blob with his arms up. `rise` runs continuously
  // from +1 at launch through 0 at the apex to negative on the way down, so
  // every airborne part of him below is a curve rather than a switch:
  // stretched and tucked going up, rounded out and open at the top, stretched
  // again and reaching with his feet coming down.
  const rise = pose.rise || 0;
  const air = Math.min(1, Math.abs(rise));
  const stretch = pose.air !== 0 ? air * 0.2 : 0;

  const k = Math.max(0.68, Math.min(1.34, 1 - pose.squash * 1.05 - stretch));
  const bh = h * k;
  const bw = (h * Y.aspect) / k;
  const cx = x;
  const cy = y - bh / 2;
  const S = (n) => bw * n; // horizontal fractions
  const V = (n) => bh * n; // vertical fractions

  const gait = Math.sin((pose.walk / (pose.stride || 1)) * Math.PI) * Math.min(1, pose.run * 1.4);
  // Knees up on the climb, legs down reaching for the floor on the descent.
  const tuck = pose.air !== 0 ? rise * 0.13 : 0;
  // He leans the way he is going, and a little further the faster he is going.
  const lean = pose.air !== 0 ? Math.min(1, pose.run) * rise * -0.13 : 0;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(pose.face, 1);
  if (lean) ctx.rotate(lean);

  // feet, behind. Airborne they also splay outward as he reaches down.
  const splay = pose.air !== 0 ? Math.max(0, -rise) * 0.055 : 0;
  for (const side of [-1, 1]) {
    ellipse(ctx, side * S(Y.footAt + splay), V(Y.footY - tuck) + side * gait * V(0.05),
      S(Y.footSize[0]) / 2, V(Y.footSize[1]) / 2, 0, Y.foot);
  }

  // ears, behind, with the darker inner ear. They trail the jump: flicked up
  // off the launch, drooping as he comes down. It is the one part of him with
  // any give, so it is where the weight of the jump shows.
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * S(Y.earAt), V(Y.earTop));
    ctx.rotate(side * (0.34 - rise * 0.42));
    ellipse(ctx, 0, 0, S(Y.earSize[0]) / 2, V(Y.earSize[1]) / 2, 0, Y.body);
    ellipse(ctx, 0, V(0.012), S(Y.innerEarSize[0]) / 2, V(Y.innerEarSize[1]) / 2, 0, Y.innerEar);
    ctx.restore();
  }

  // arm nubs, behind. On the ground they swing with the gait; in the air they
  // sweep smoothly from up (launch) through out (apex) to down (falling).
  for (const side of [-1, 1]) {
    const swing =
      pose.air !== 0
        ? Math.max(-0.85, Math.min(0.6, -rise * 0.9 + 0.2))
        : -side * gait * 0.55;
    ctx.save();
    ctx.translate(side * S(Y.armAt), V(Y.armY));
    ctx.rotate(swing);
    ellipse(ctx, 0, 0, S(Y.armSize[0]) / 2, V(Y.armSize[1]) / 2, 0, Y.body);
    ctx.restore();
  }

  // body
  ellipse(ctx, 0, 0, bw / 2, bh / 2, 0, Y.body);
  ellipse(ctx, 0, V(0.14), bw * 0.46, bh * 0.33, 0, Y.bodyLo, 0.45);

  for (const side of [-1, 1]) {
    ellipse(ctx, side * S(Y.blushAt), V(Y.blushY),
      S(Y.blushSize[0]) / 2, V(Y.blushSize[1]) / 2, 0, Y.blush, 0.5);
  }
  for (const side of [-1, 1]) {
    ellipse(ctx, side * S(Y.eyeAt), V(Y.eyeY), S(Y.eyeR), S(Y.eyeR), 0, Y.eye);
  }

  ellipse(ctx, 0, V(Y.snoutY), S(Y.snoutSize[0]) / 2, V(Y.snoutSize[1]) / 2, 0, Y.snout);
  // Nostrils are vertical ovals, not dots — it is most of what makes him a pig.
  for (const side of [-1, 1]) {
    ellipse(ctx, side * S(Y.nostrilAt), V(Y.snoutY),
      S(Y.nostrilSize[0]) / 2, V(Y.nostrilSize[1]) / 2, 0, Y.nostril);
  }

  ctx.restore();
}

/* --------------------------------------------------------------- roster --- */

let bubuFrames = null;
let duduFrames = null;

// Each character moves differently. The numbers are multipliers on the shared
// feel in config.js, kept small — enough that you notice who you are holding,
// not so much that one of them is simply better.
//
// The jump range is bounded at BOTH ends by the co-op gate, which sits four
// tiles up and is meant to need a boost:
//   - the best jumper must not clear 4 alone (Dudu at 1.10 managed 4.10, which
//     quietly removed the need for a partner at all)
//   - the worst jumper, standing on a partner, must clear it with room to
//     spare (Yhon at 0.95 landed on 4.02, which is not a margin)
// Height goes with the square of the multiplier, so the usable window is
// narrow: everything sits between 0.98 and 1.05, and the characters are told
// apart by speed, acceleration and stride instead.
//
// `stride` is tiles covered per animation frame: a bigger number is a longer,
// slower step. Bubu was cycling far too fast for how far she was travelling.
export const CHARACTERS = [
  {
    id: "yhon",
    name: "Yhon Yhon",
    from: "tayo",
    tint: "#ffbec2",
    blurb: "heavy, short steps",
    stats: { jump: 0.98, speed: 0.93, accel: 0.86, stride: 0.78 },
    draw: drawYhon,
  },
  {
    id: "bubu",
    name: "Bubu",
    from: "bubududu",
    tint: "#c9e7ff",
    blurb: "even all round",
    stats: { jump: 1.0, speed: 1.02, accel: 1.0, stride: 1.15 },
    draw: (ctx, x, y, w, h, pose) => {
      if (!bubuFrames) bubuFrames = loadFrames("bubu");
      drawSprite(bubuFrames, ctx, x, y, w, h, pose);
    },
  },
];

/**
 * Dudu is not one of the two players — he walks in on his own and gives
 * things away. Same sprite sheet, same walk cycle, drawn through the same
 * path as everyone else.
 */
export const HELPER_CHAR = {
  id: "dudu",
  name: "Dudu",
  tint: "#ffe0b8",
  draw: (ctx, x, y, w, h, pose) => {
    if (!duduFrames) duduFrames = loadFrames("dudu");
    drawSprite(duduFrames, ctx, x, y, w, h, pose);
  },
};

export const charById = (id) =>
  CHARACTERS.find((c) => c.id === id) || (id === "dudu" ? HELPER_CHAR : CHARACTERS[0]);

/** Warm the sprite cache so nobody's first jump is a white blob. */
export function preloadCharacters() {
  if (!bubuFrames) bubuFrames = loadFrames("bubu");
  if (!duduFrames) duduFrames = loadFrames("dudu");
}
