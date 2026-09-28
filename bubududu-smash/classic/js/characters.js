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

// Resolved against THIS MODULE, not the page. A bare "assets/..." is relative
// to the document, so it only worked from the game's own directory — from
// /duo/ it asked for /duo/assets/bubu/1.png, got a 404, and every sprite
// character fell back to the pale "still loading" blob forever. Yhon Yhon
// kept working and hid it, because he is drawn with canvas paths and needs no
// image at all.
const ASSETS = new URL("../assets/", import.meta.url);

function loadFrames(dir, n = 6) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const img = new Image();
    img.src = new URL(`${dir}/${i}.png`, ASSETS).href;
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
/**
 * Standing still is not the same as being stopped.
 *
 * Both characters used to freeze solid the moment you let go — a static
 * picture parked on a platform, which makes a live game look paused. This is
 * one slow breath: a little taller and narrower on the way up, shorter and
 * wider on the way down, with the body lifting a fraction off its feet.
 *
 * It is driven off `pose.t`, the actor's own clock, so the two of them are
 * never quite in sync, and it fades out the instant you start moving so it
 * can never fight the walk cycle.
 */
function idleBreath(pose) {
  const still = pose.air === 0 ? 1 - Math.min(1, pose.run / 0.12) : 0;
  if (still <= 0) return { squash: 0, lift: 0 };
  const w = Math.sin((pose.t || 0) * 2.1);
  return { squash: -w * 0.035 * still, lift: Math.max(0, w) * 0.022 * still };
}

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
  const breath = idleBreath(pose);
  const k = Math.max(0.78, Math.min(1.22, 1 - (pose.squash + breath.squash) * 0.8));
  const dh = h * k;
  const dw = (h * SPRITE_W) / SPRITE_H / k;
  ctx.save();
  ctx.translate(x, y - h * breath.lift);
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

  const breath = idleBreath(pose);
  const k = Math.max(0.68, Math.min(1.34, 1 - (pose.squash + breath.squash) * 1.05 - stretch));
  const bh = h * k;
  const bw = (h * Y.aspect) / k;
  const cx = x;
  const cy = y - bh / 2 - h * breath.lift;
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

  // Body: ONE flat pink, and nothing shaded across the belly.
  //
  // There used to be a darker ellipse over the lower half "so he is not
  // flat". The reference art is a single solid fill — the only darker pinks
  // on him are the inner ears, the snout and the blush, which are features
  // rather than shading — and a darker belly under a blue rim read as a
  // smudge on him rather than as volume.
  ellipse(ctx, 0, 0, bw / 2, bh / 2, 0, Y.body);

  for (const side of [-1, 1]) {
    ellipse(ctx, side * S(Y.blushAt), V(Y.blushY),
      S(Y.blushSize[0]) / 2, V(Y.blushSize[1]) / 2, 0, Y.blush, 0.5);
  }
  // A blink every few seconds, on his own clock so he and Bubu never blink
  // together. Squashing the eye rather than hiding it keeps him from looking
  // briefly eyeless on a slow frame.
  const blinkCycle = ((pose.t || 0) % 3.7) / 3.7;
  const blink = blinkCycle > 0.965 ? 1 - Math.abs(blinkCycle - 0.982) / 0.017 : 0;
  for (const side of [-1, 1]) {
    ellipse(ctx, side * S(Y.eyeAt), V(Y.eyeY), S(Y.eyeR), S(Y.eyeR) * (1 - blink * 0.88), 0, Y.eye);
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
// The jump range used to be pinned at both ends by a co-op gate four tiles up
// that needed a boost to clear. That mode is gone — MODES has only the arena
// in it now — so the window is no longer that tight. What still binds is the
// arena grammar: platforms step two tiles at a time, so every character has
// to clear two comfortably and none of them may clear four, or the level
// stops being a climb. Height goes with the SQUARE of the multiplier, so
// small numbers here do more than they look like they do.
//
// Each also carries an ABILITY, on the fire button. They are what actually
// tells the three apart — the stats below are the character's resting feel
// and the ability is what they DO about it. See ABILITY in config.js.
//
// `stride` is tiles covered per animation frame: a bigger number is a longer,
// slower step. Bubu was cycling far too fast for how far she was travelling.
export const CHARACTERS = [
  {
    id: "yhon",
    name: "Yhon Yhon",
    from: "tayo",
    tint: "#ffbec2",
    spawnFace: 1,
    blurb: "heavy, short steps",
    // The slowest thing on the field, and Ground Pound is why that survives:
    // he cannot chase you down, so he gets above you and arrives before you
    // can leave.
    ability: "pound",
    stats: { jump: 0.98, speed: 0.93, accel: 0.86, stride: 0.78 },
    draw: drawYhon,
  },
  {
    id: "bubu",
    name: "Bubu",
    from: "bubududu",
    tint: "#c9e7ff",
    // The sprite is drawn with one paw raised on the LEFT of the frame, so
    // face 1 is "paw on the left" and -1 mirrors it. It has to be pinned at
    // spawn: reviveAt keeps whatever direction you last walked, so dying on
    // the way left brought him back mirrored.
    spawnFace: 1,
    blurb: "even all round",
    // Nothing to complain about and nothing special, until you are falling —
    // the Air Hop is the only recovery in the game, and the best way to get
    // above somebody.
    ability: "hop",
    stats: { jump: 1.0, speed: 1.02, accel: 1.0, stride: 1.15 },
    draw: (ctx, x, y, w, h, pose) => {
      if (!bubuFrames) bubuFrames = loadFrames("bubu");
      drawSprite(bubuFrames, ctx, x, y, w, h, pose);
    },
  },
  {
    /* Dudu was in the title and was not playable.
     *
     * He has wandered the arena as the helper since the beginning, which is
     * the one argument against promoting him — but the squad is already
     * "three little Bubus" standing next to a playable Bubu and nobody has
     * ever been confused by it. A player wears their owner's colour traced
     * right round them and carries hearts over their head; a helper wears a
     * white rim and a countdown. They do not read as the same thing.
     */
    id: "dudu",
    name: "Dudu",
    from: "bubududu",
    tint: "#ffd7a8",
    spawnFace: 1,
    blurb: "quick, low jump",
    // Quickest across the ground and the worst at getting above anyone, so
    // the Dash doubles down on what he already is: he owns the horizontal and
    // has to be clever about the vertical.
    ability: "dash",
    stats: { jump: 0.98, speed: 1.06, accel: 1.18, stride: 0.95 },
    draw: (ctx, x, y, w, h, pose) => {
      if (!duduFrames) duduFrames = loadFrames("dudu");
      drawSprite(duduFrames, ctx, x, y, w, h, pose);
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

/**
 * Bad Dudu.
 *
 * The same bear, gone purple. He is deliberately NOT a new silhouette: the
 * whole point of him is that you have half a second to notice the colour and
 * decide whether the thing walking in is worth running to. A different shape
 * would be read as "some other character" instead of "that is Dudu, and
 * something is wrong with him".
 *
 * Tinted through a scratch canvas with `source-atop`, which paints only where
 * the sprite already has pixels — the same trick the star uses. A CSS-style
 * hue-rotate cannot do it, because the art is mostly near-white and rotating
 * the hue of white gives you white.
 */
let badBuf = null;

function drawBadDudu(ctx, x, y, w, h, pose) {
  if (!duduFrames) duduFrames = loadFrames("dudu");

  if (!badBuf) {
    badBuf = document.createElement("canvas");
    badBuf.width = 256;
    badBuf.height = 256;
  }
  const b = badBuf.getContext("2d");
  b.clearRect(0, 0, badBuf.width, badBuf.height);

  // Drawn into the buffer with its feet near the bottom, so a stretched jump
  // pose still has room above it.
  const bx = badBuf.width / 2;
  const by = badBuf.height * 0.88;
  const scale = badBuf.height * 0.8 / h;
  drawSprite(duduFrames, b, bx, by, w * scale, h * scale, pose);

  b.save();
  b.globalCompositeOperation = "source-atop";
  b.globalAlpha = 0.66;
  b.fillStyle = "#7b3fd4";
  b.fillRect(0, 0, badBuf.width, badBuf.height);
  // A second darker pass low down, so he is not a flat purple sticker.
  b.globalAlpha = 0.3;
  b.fillStyle = "#2b0f52";
  b.fillRect(0, badBuf.height * 0.6, badBuf.width, badBuf.height * 0.4);
  b.restore();

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1 / scale, 1 / scale);
  ctx.drawImage(badBuf, -bx, -by);
  ctx.restore();
}

export const BAD_HELPER_CHAR = {
  id: "badudu",
  name: "Bad Dudu",
  tint: "#a970ff",
  draw: drawBadDudu,
};

const OFF_ROSTER = { dudu: HELPER_CHAR, badudu: BAD_HELPER_CHAR };

export const charById = (id) =>
  CHARACTERS.find((c) => c.id === id) || OFF_ROSTER[id] || CHARACTERS[0];

/**
 * Warm the sprite cache so nobody's first jump is a white blob.
 *
 * Returns a promise that settles once the frames are actually decoded, which
 * anything drawing a character ONCE — a portrait on a card rather than sixty
 * times a second — has to wait for. Without it the character select drew two
 * empty cards and one pig, because Yhon Yhon is vector and the other two are
 * images that had not arrived yet.
 */
export function preloadCharacters() {
  if (!bubuFrames) bubuFrames = loadFrames("bubu");
  if (!duduFrames) duduFrames = loadFrames("dudu");
  return Promise.all(
    [...bubuFrames, ...duduFrames].map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise((done) => {
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
          })
    )
  );
}
