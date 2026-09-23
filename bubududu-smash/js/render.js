// Renderer. Bright and readable on purpose — the last game was dark by design
// and half its problems were that nobody could see what was happening.
//
// One camera frames BOTH players and zooms to keep them together, so you are
// always looking at the same picture on the same screen.

import { charById } from "./characters.js";
import { poseOf } from "./physics.js";
import { ABILITY, BAD_HELPER, BOX, COINS, DIWATA, FEEL, HIT, KING, PLAYERS, POWERUPS, SHOT_RADIUS } from "./config.js";
import { drawMark, markPath, stampMark } from "./marks.js";
import { bakeScenery, blitRange } from "./scenery.js";


const SKY_TOP = "#8fd4ff";
const SKY_BOT = "#dff3ff";
const GROUND = "#6b4a3a";
const GROUND_TOP = "#7ec850";
const GROUND_EDGE = "#5aa53a";
const PLATFORM = "#c98b52";
const PLATFORM_TOP = "#e8b07a";
const SPIKE = "#5a6270";
const STAR = "#ffd54a";

export function createRenderer(canvas) {
  return {
    canvas,
    ctx: canvas.getContext("2d"),
    w: 0,
    h: 0,
    cam: { x: 0, y: 0, zoom: 40, base: 40, tx: 0, ty: 0, tzoom: 40 },
    kill: null,     // the death the camera is currently dwelling on
    killZoom: 1,
    punch: 0,
    flash: 0,
    shake: 0,
    // Scratch buffer for recolouring a character without catching the scenery
    // behind them — see the star handling in drawActor().
    tint: (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      return c;
    })(),
    // Two cloud depths. The far ones are bigger, paler and barely move.
    /* Two cloud depths. `y` is a fraction of the SKY BAND, not a world
       height — see clouds() for why they stopped being world objects. */
    clouds: Array.from({ length: 11 }, (_, i) => {
      const far = i < 6;
      return {
        x: Math.random() * 60,
        y: far ? Math.random() * 0.55 : 0.3 + Math.random() * 0.7,
        s: far ? 1.1 + Math.random() * 1.1 : 0.55 + Math.random() * 0.8,
        v: far ? 0.04 + Math.random() * 0.06 : 0.14 + Math.random() * 0.26,
        far,
        puffs: 3 + Math.floor(Math.random() * 3),
      };
    }),
  };
}

export function resize(r, cssW, cssH) {
  /* Phones draw fewer pixels.
   *
   * A modern handset reports dpr 3, and the cap of 2 still meant filling
   * ~4.3M pixels a frame on a 430x932 screen for a game whose art is flat
   * colour and sprites. At 1.5 that is 2.4M — 44% less work for a difference
   * you have to look for on a 6-inch panel, and it is the cheapest frame time
   * available anywhere in this renderer. The UI is DOM and stays sharp. */
  const cap = document.body.classList.contains("duo") ? 1.5 : 2;
  const dpr = Math.min(window.devicePixelRatio || 1, cap);
  r.w = Math.round(cssW * dpr);
  r.h = Math.round(cssH * dpr);
  r.canvas.width = r.w;
  r.canvas.height = r.h;
  r.canvas.style.width = cssW + "px";
  r.canvas.style.height = cssH + "px";
}

/**
 * Frame both actors. Zoom out when they separate, in when they are together,
 * and never so far that a player leaves the screen — in a two-player game on
 * one screen, losing sight of yourself is the worst thing that can happen.
 */
function updateCamera(r, level, actors, dt) {
  const alive = actors.filter((a) => !a.dead);
  const pts = alive.length ? alive : actors;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const a of pts) {
    minX = Math.min(minX, a.x);
    maxX = Math.max(maxX, a.x);
    minY = Math.min(minY, a.y - a.h);
    maxY = Math.max(maxY, a.y);
  }
  /* How much world sits around the two of them.
   *
   * Widened: at 7 the pair filled the frame and the platforms above them were
   * cut off at the top edge, so you could not see the thing you were about to
   * jump to. The vertical minimum matters as much as the horizontal — both
   * players standing on the same floor gives a span of nearly nothing, and
   * the zoom would then be decided entirely by the width.
   */
  const pad = 9.5;
  const spanX = Math.max(18, maxX - minX + pad * 2);
  const spanY = Math.max(13, maxY - minY + pad * 1.4);
  const zoom = Math.min(r.w / spanX, r.h / spanY);

  // The ceiling has to come from the canvas, not from a number that happened
  // to suit a laptop. A flat 78 shows 38 tiles on a 3024px-wide screen and
  // fifteen on a phone held upright — so on a phone you could not see the
  // person you are trying to land on, which reads as the camera being stuck
  // zoomed in. Tie it to always showing at least MIN_TILES across.
  const MIN_TILES = 26;
  const ceiling = Math.min(64, r.w / MIN_TILES);
  r.cam.tzoom = Math.max(20, Math.min(ceiling, zoom));
  r.cam.tx = (minX + maxX) / 2;
  r.cam.ty = (minY + maxY) / 2;

  /* -------------------------------------------------------- the kill cam ---
   *
   * A death used to be a shake and a flash while the camera carried on
   * framing both players — which is the one moment you do NOT want a wide
   * neutral shot. Here it abandons the framing rule entirely: snaps onto the
   * body, drives in hard, holds, and drifts back out. Deliberately breaking
   * "keep both on screen" is the whole effect, so it is time-boxed and lets
   * go of the camera completely when it ends.
   */
  let killPull = 0;
  r.killZoom = 1;
  if (r.kill) {
    r.kill.t += dt;
    const p = Math.min(1, r.kill.t / (r.kill.ms / 1000));
    // A normal death: in over the first fifth, hold, then let go on a curve.
    // A `hold` kill is the one that won the match — it rides in and stays,
    // and only startRound() gives the camera back.
    if (r.kill.hold) {
      /* The one that won the match rides in and NEVER comes back out.
       *
       * It used to ease back to the whole arena, because holding parked the
       * camera on an empty patch of ground — the loser was deleted on the
       * frame they died. The body stays now (see DEFEAT_SEC in drawActor), so
       * there is something to hold on, and pulling out to a wide shot of
       * nothing was the wrong half of that pair to fix. It keeps creeping in
       * the whole time, so the last thing you see is how it ended.
       *
       * Only startRound() gives the camera back.
       */
      killPull = Math.min(1, p / 0.35);
      r.kill.creep = Math.min(1, (r.kill.creep || 0) + dt * 0.22);
    } else {
      // An ordinary death: snap in, then STAY there for most of the window
      // before letting go. It used to start releasing a fifth of the way in,
      // so the camera was already retreating while the body was still being
      // thrown — you never got a clear look at what had just happened to you.
      killPull = p < 0.12 ? p / 0.12
               : p < 0.78 ? 1
               : Math.pow(1 - (p - 0.78) / 0.22, 1.7);
    }
    r.cam.tx += (r.kill.x - r.cam.tx) * killPull * 0.92;
    r.cam.ty += (r.kill.y - r.cam.ty) * killPull * 0.92;
    if (r.kill) {
      const creep = r.kill.hold ? (r.kill.creep || 0) * 0.55 : 0;
      r.killZoom = 1 + killPull * ((r.kill.zoom ?? 0.9) + creep);
    }
    if (r.kill && p >= 1 && !r.kill.hold) r.kill = null;
  }

  // Keep the view inside the level rather than showing void past the edges.
  const halfW = r.w / 2 / r.cam.tzoom;
  const halfH = r.h / 2 / r.cam.tzoom;
  if (level.w > halfW * 2) r.cam.tx = Math.max(halfW, Math.min(level.w - halfW, r.cam.tx));
  else r.cam.tx = level.w / 2;
  if (level.h > halfH * 2) r.cam.ty = Math.max(halfH, Math.min(level.h - halfH, r.cam.ty));
  else r.cam.ty = level.h / 2;

  // Chases much harder while the kill cam has it, or the snap reads as a
  // slow drift and the moment is over before the camera arrives.
  const k = 1 - Math.exp(-(7 + killPull * 16) * dt);
  r.cam.x += (r.cam.tx - r.cam.x) * k;
  r.cam.y += (r.cam.ty - r.cam.y) * k;
  // The smoothed zoom is kept separate from the hit kick, or each frame's
  // kick would compound into the next one's baseline.
  r.cam.base += (r.cam.tzoom - r.cam.base) * (1 - Math.exp(-5 * dt));
  if (r.punch > 0) {
    r.punch *= 0.86;
    if (r.punch < 0.002) r.punch = 0;
  }
  r.cam.zoom = r.cam.base * (1 + r.punch) * (r.killZoom || 1);
}

const toX = (r, wx) => (wx - r.cam.x) * r.cam.zoom + r.w / 2;
const toY = (r, wy) => (wy - r.cam.y) * r.cam.zoom + r.h / 2;

function roundRect(ctx, x, y, w, h, rad) {
  const k = Math.min(rad, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

/**
 * The backdrop: sky, sun, three ranges of hills and two depths of cloud, each
 * scrolling at its own rate against the camera.
 *
 * The arena floats in open air, so behind it there was nothing but a flat
 * gradient and a few ellipses. Parallax is what turns that into a place: the
 * further a layer is meant to be, the less it moves and the more it washes out
 * toward the sky colour.
 */
/* ============================================================== textures ===
 *
 * The ground, the platforms and the sky used to be flat fills: one brown
 * rectangle, one green strip, one gradient. At the size a phone draws them
 * that reads as coloured paper rather than as a place, and a gradient across
 * a whole screen also bands visibly on an OLED.
 *
 * Everything here is BAKED ONCE into an offscreen canvas and then blitted.
 * Drawing the grain per tile per frame would be a few hundred extra paths a
 * frame on a device that is already the whole simulation — this way the cost
 * is one drawImage per tile, the same as the flat version, and the detail is
 * free after the first frame.
 *
 * The noise is from a seeded generator, never Math.random, or the speckle
 * would crawl every time the atlas was rebuilt at a new zoom.
 */

/** Tiny deterministic PRNG — same tile, same freckles, every time. */
function noiseAt(i) {
  let x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * One canvas holding every tile type, baked ONCE and scaled on the way out.
 *
 * The first version baked at the current zoom and re-baked whenever that
 * moved. The camera eases every single frame, so in practice it re-baked
 * several hundred paths constantly and took the frame from 4ms to 12ms —
 * a cache that is a pessimisation. Bake at a size no tile will ever exceed
 * (the camera's own ceiling is 78 CSS px a tile, doubled for retina) and let
 * drawImage do the scaling, which is free.
 */
const TILE_ART_PX = 160;

const tuftCount = (key) => Math.max(5, Math.round(key / 9));

function tileArt(r) {
  if (r.tiles) return r.tiles;
  const key = TILE_ART_PX;

  const pad = 2;
  const cell = key + pad * 2;
  const kinds = ["soil", "grass", "plat", "spike"];
  const c = document.createElement("canvas");
  c.width = cell * kinds.length;
  c.height = cell;
  const x = c.getContext("2d");

  const at = (i) => i * cell + pad;

  /* ---- soil: the body of the ground, under the grass ---------------- */
  const soil = (ox) => {
    const g = x.createLinearGradient(0, pad, 0, pad + key);
    g.addColorStop(0, "#7d5744");
    g.addColorStop(0.45, GROUND);
    g.addColorStop(1, "#593c2f");
    x.fillStyle = g;
    x.fillRect(ox, pad, key, key);
    // Strata: a few very faint horizontal bands. Earth is layered, and this
    // is what stops the fill reading as one flat brown.
    for (let i = 0; i < 4; i++) {
      const n = noiseAt(i * 13 + 5);
      x.fillStyle = n > 0.5 ? "rgba(255,225,190,0.045)" : "rgba(40,22,16,0.06)";
      x.fillRect(ox, pad + key * (0.18 + i * 0.2 + n * 0.04), key, key * (0.05 + n * 0.06));
    }

    // Grit. The first pass used blobs 8% of a tile wide at 20% contrast,
    // which at playing distance read as gravel rather than as soil. Small
    // and faint is the whole point: you should notice it is not flat, not
    // notice the specks.
    for (let i = 0; i < Math.round(key * 2.2); i++) {
      const n1 = noiseAt(i * 3 + 1), n2 = noiseAt(i * 3 + 2), n3 = noiseAt(i * 3 + 3);
      const s = key * (0.008 + n3 * 0.016);
      x.fillStyle = n3 > 0.55 ? "rgba(255,228,196,0.10)" : "rgba(40,22,16,0.11)";
      x.beginPath();
      x.ellipse(ox + n1 * key, pad + n2 * key, s, s * 0.8, 0, 0, Math.PI * 2);
      x.fill();
    }
    // A handful of small stones, for something the grit can scale against.
    for (let i = 0; i < 4; i++) {
      const n1 = noiseAt(i * 7 + 21), n2 = noiseAt(i * 7 + 22);
      x.fillStyle = "rgba(255,232,206,0.09)";
      x.beginPath();
      x.ellipse(ox + n1 * key, pad + 0.25 * key + n2 * key * 0.7,
                key * 0.032, key * 0.021, 0.4, 0, Math.PI * 2);
      x.fill();
    }
  };

  soil(at(0));

  /* ---- grass: the same soil with a turf cap and blades -------------- */
  soil(at(1));
  {
    const ox = at(1);
    const capH = key * 0.3;
    const g = x.createLinearGradient(0, pad, 0, pad + capH);
    g.addColorStop(0, "#96e063");
    g.addColorStop(1, GROUND_TOP);
    x.fillStyle = g;
    x.fillRect(ox, pad, key, capH);
    x.fillStyle = GROUND_EDGE;
    x.fillRect(ox, pad + capH, key, key * 0.07);

    // Blades hanging INTO the soil, so the join is ragged rather than a
    // ruled line — that straight edge is most of what made it read as paper.
    x.fillStyle = GROUND_EDGE;
    const blades = Math.max(4, Math.round(key / 7));
    for (let i = 0; i < blades; i++) {
      const n = noiseAt(i * 5 + 40);
      const bx = ox + ((i + 0.5) / blades) * key + (n - 0.5) * key * 0.1;
      const bw = key * (0.05 + n * 0.04);
      const bh = key * (0.05 + noiseAt(i * 5 + 41) * 0.09);
      x.beginPath();
      x.moveTo(bx - bw, pad + capH);
      x.lineTo(bx + bw, pad + capH);
      x.lineTo(bx, pad + capH + bh + key * 0.07);
      x.closePath();
      x.fill();
    }
    // ...and a few standing up out of the top, which is what sells turf.
    x.strokeStyle = "rgba(168,235,120,0.95)";
    x.lineCap = "round";
    for (let i = 0; i < blades; i++) {
      const n = noiseAt(i * 9 + 60), n2 = noiseAt(i * 9 + 61);
      const bx = ox + ((i + 0.35) / blades) * key + (n - 0.5) * key * 0.12;
      x.lineWidth = Math.max(1, key * 0.022);
      x.beginPath();
      x.moveTo(bx, pad + key * 0.02);
      x.quadraticCurveTo(bx + (n2 - 0.5) * key * 0.12, pad - key * 0.03,
                         bx + (n2 - 0.5) * key * 0.2, pad - key * 0.075);
      x.stroke();
    }
    // Highlight along the very top lip.
    x.fillStyle = "rgba(255,255,255,0.22)";
    x.fillRect(ox, pad, key, Math.max(1, key * 0.035));
  }

  /* ---- platform: a turfed stone ledge ------------------------------
   *
   * It was a wooden plank, and a plank is furniture: it belonged to a
   * workshop, not to the valley behind it. A ledge of stone with grass
   * growing over its lip is the same silhouette — same thickness, same
   * readable top edge, which is the only thing the game needs from it —
   * made of something the place is actually built out of.
   *
   * The turf cap is deliberately the SAME green as the ground tiles: a
   * player has to be able to tell at a glance that a thing is standable,
   * and "green on top" is the rule the whole arena teaches in round one. */
  {
    const ox = at(2);
    const top = pad + key * 0.1;
    const h = key * 0.34;
    x.save();
    roundRect(x, ox, top, key, h, key * 0.09);
    x.clip();

    // the rock body, lit from above
    const g = x.createLinearGradient(0, top, 0, top + h);
    g.addColorStop(0, "#b0a695");
    g.addColorStop(0.32, "#99907f");
    g.addColorStop(1, "#6d6459");
    x.fillStyle = g;
    x.fillRect(ox, top, key, h);

    // Bedding planes — the near-horizontal seams sedimentary rock splits on.
    // Two of them, faint, with a lit edge under each: stone without a grain
    // direction reads as concrete.
    for (let i = 0; i < 2; i++) {
      const n = noiseAt(i * 11 + 80);
      const gy = top + h * (0.5 + i * 0.26 + (n - 0.5) * 0.06);
      x.strokeStyle = "rgba(48,42,36,0.34)";
      x.lineWidth = Math.max(0.7, key * 0.011);
      x.beginPath();
      x.moveTo(ox - 1, gy);
      x.bezierCurveTo(ox + key * 0.34, gy + h * 0.05 * (n - 0.5),
                      ox + key * 0.68, gy - h * 0.05 * (n - 0.5), ox + key + 1, gy);
      x.stroke();
      x.strokeStyle = "rgba(255,246,228,0.14)";
      x.beginPath();
      x.moveTo(ox - 1, gy + h * 0.035);
      x.bezierCurveTo(ox + key * 0.34, gy + h * 0.085 * (n - 0.5) + h * 0.035,
                      ox + key * 0.68, gy - h * 0.015 * (n - 0.5), ox + key + 1, gy + h * 0.035);
      x.stroke();
    }

    // Weathering: a few pits, and lichen where damp collects on the underside.
    for (let i = 0; i < 9; i++) {
      const n1 = noiseAt(i * 3 + 91), n2 = noiseAt(i * 3 + 92), n3 = noiseAt(i * 3 + 93);
      x.fillStyle = n3 > 0.5 ? "rgba(255,248,232,0.10)" : "rgba(44,38,32,0.14)";
      x.beginPath();
      x.ellipse(ox + n1 * key, top + h * (0.3 + n2 * 0.6),
                key * (0.012 + n3 * 0.016), key * (0.008 + n3 * 0.01), 0.3, 0, Math.PI * 2);
      x.fill();
    }
    for (let i = 0; i < 5; i++) {
      const n1 = noiseAt(i * 5 + 111), n2 = noiseAt(i * 5 + 112);
      x.fillStyle = "rgba(122,152,96,0.2)";
      x.beginPath();
      x.ellipse(ox + n1 * key, top + h * (0.62 + n2 * 0.3),
                key * 0.035, key * 0.018, 0, 0, Math.PI * 2);
      x.fill();
    }

    /* The turf cap. Same greens as the ground, hanging a ragged edge down
     * over the stone — the ragged join is what stopped the ground tiles
     * reading as cut paper and it does the same job here. */
    const capH = h * 0.26;   // thin, or the ledge is a green stick
    const tg = x.createLinearGradient(0, top, 0, top + capH);
    tg.addColorStop(0, "#96e063");
    tg.addColorStop(1, GROUND_TOP);
    x.fillStyle = tg;
    x.fillRect(ox, top, key, capH);
    x.fillStyle = GROUND_EDGE;
    const tufts = Math.max(5, Math.round(key / 9));
    for (let i = 0; i < tufts; i++) {
      const n = noiseAt(i * 5 + 130);
      const bx = ox + ((i + 0.5) / tufts) * key + (n - 0.5) * key * 0.08;
      const bw = key * (0.04 + n * 0.035);
      const bh = h * (0.09 + noiseAt(i * 5 + 131) * 0.2);
      x.beginPath();
      x.moveTo(bx - bw, top + capH - h * 0.03);
      x.lineTo(bx + bw, top + capH - h * 0.03);
      x.lineTo(bx, top + capH + bh);
      x.closePath();
      x.fill();
    }
    // the lit lip along the very top, and the dark underside that gives the
    // strip its thickness
    x.fillStyle = "rgba(255,255,255,0.3)";
    x.fillRect(ox, top, key, Math.max(1, h * 0.09));
    x.fillStyle = "rgba(32,27,22,0.26)";
    x.fillRect(ox, top + h * 0.9, key, h * 0.1);
    x.restore();

    // Blades standing up out of the turf, OUTSIDE the clip so they break the
    // ledge's outline — a platform whose silhouette is a perfect rectangle is
    // the tell that it was drawn rather than grown.
    x.strokeStyle = "rgba(168,235,120,0.95)";
    x.lineCap = "round";
    for (let i = 0; i < tuftCount(key); i++) {
      const n = noiseAt(i * 9 + 150), n2 = noiseAt(i * 9 + 151);
      const bx = ox + ((i + 0.35) / tuftCount(key)) * key + (n - 0.5) * key * 0.12;
      x.lineWidth = Math.max(1, key * 0.018);
      x.beginPath();
      x.moveTo(bx, top + h * 0.02);
      x.quadraticCurveTo(bx + (n2 - 0.5) * key * 0.1, top - key * 0.028,
                         bx + (n2 - 0.5) * key * 0.17, top - key * 0.058);
      x.stroke();
    }

    /* One short tendril of moss off the underside — the detail that makes a
     * floating ledge look like it has been there a while rather than having
     * been placed this morning.
     *
     * ONE, and short. The first pass hung two long vines per tile, and since
     * every tile is the same bitmap that came out as an evenly spaced fringe
     * of identical dangling wires along the whole ledge — the repeat became
     * the most visible thing about it. A stub reads as growth; a wire reads
     * as a rubber stamp. */
    x.strokeStyle = "rgba(96,168,64,0.5)";
    x.lineWidth = Math.max(0.8, key * 0.016);
    {
      const n = noiseAt(171), n2 = noiseAt(172);
      const vx = ox + (0.32 + n * 0.3) * key;
      const vl = h * (0.16 + n2 * 0.22);
      x.beginPath();
      x.moveTo(vx, top + h * 0.9);
      x.quadraticCurveTo(vx + (n - 0.5) * key * 0.05, top + h + vl * 0.55,
                         vx + (n2 - 0.5) * key * 0.05, top + h + vl);
      x.stroke();
    }

    // A soft drop shadow under the ledge, so it sits in front of the valley
    // rather than being pasted onto it.
    const sh = x.createLinearGradient(0, top + h, 0, top + h + key * 0.12);
    sh.addColorStop(0, "rgba(34,28,20,0.22)");
    sh.addColorStop(1, "rgba(34,28,20,0)");
    x.fillStyle = sh;
    x.fillRect(ox, top + h, key, key * 0.12);
  }

  /* ---- spikes ------------------------------------------------------- */
  {
    const ox = at(3);
    const n = 3;
    for (let i = 0; i < n; i++) {
      const x0 = ox + (i * key) / n;
      const g = x.createLinearGradient(x0, 0, x0 + key / n, 0);
      g.addColorStop(0, "#414958");
      g.addColorStop(0.45, "#7b8597");
      g.addColorStop(1, "#414958");
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(x0, pad + key);
      x.lineTo(x0 + key / n / 2, pad + key * 0.24);
      x.lineTo(x0 + key / n, pad + key);
      x.closePath();
      x.fill();
      x.strokeStyle = "rgba(255,255,255,0.5)";
      x.lineWidth = Math.max(0.8, key * 0.02);
      x.beginPath();
      x.moveTo(x0 + key / n / 2, pad + key * 0.24);
      x.lineTo(x0 + key / n * 0.3, pad + key);
      x.stroke();
    }
  }

  r.tiles = { key, cell, pad, canvas: c, index: { soil: 0, grass: 1, plat: 2, spike: 3 } };
  return r.tiles;
}

/**
 * A 128px tile of very faint noise, laid over the sky.
 *
 * A four-stop gradient down a 1200px-tall screen steps in visible bands on
 * any decent display. A couple of percent of noise on top dithers it away —
 * it is the cheapest possible fix and it is what makes the sky read as air.
 */
function skyGrain(r) {
  if (r.grain) return r.grain;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  const img = x.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = noiseAt(i) * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 12;
  }
  x.putImageData(img, 0, 0);
  r.grain = x.canvas;
  return r.grain;
}

function drawBackdrop(r, ctx, g, dt) {
  /* Late afternoon, high over a forested valley. The sky carries most of the
   * mood: warm at the horizon where the sun is going, cooling upward, with a
   * band of haze where the land meets it. Six stops rather than four because
   * the horizon warmth is the whole difference between "outside" and "blue". */
  const sky = ctx.createLinearGradient(0, 0, 0, r.h);
  sky.addColorStop(0.00, "#2f7fc4");
  sky.addColorStop(0.22, "#5aa8de");
  sky.addColorStop(0.46, "#9bd0ef");
  sky.addColorStop(0.66, "#cfe8f6");
  sky.addColorStop(0.82, "#f2e3c9");
  sky.addColorStop(1.00, "#f7d9ab");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, r.w, r.h);

  // Dither the gradient. Six stops down a tall screen band visibly; a couple
  // of percent of noise on top removes them for one fill.
  const grain = r.grainPattern || (r.grainPattern = ctx.createPattern(skyGrain(r), "repeat"));
  if (grain) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = grain;
    ctx.fillRect(0, 0, r.w, r.h);
    ctx.restore();
  }

  // The sun, low and to the right where the warm band is, so the light in the
  // sky and the light on the trees agree about where it is coming from.
  const sx0 = r.w * 0.80 - r.cam.x * r.cam.zoom * 0.02;
  const sy0 = r.h * 0.30;
  const halo = ctx.createRadialGradient(sx0, sy0, 0, sx0, sy0, r.h * 0.5);
  halo.addColorStop(0, "rgba(255,244,206,0.9)");
  halo.addColorStop(0.16, "rgba(255,232,178,0.4)");
  halo.addColorStop(1, "rgba(255,226,166,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(sx0 - r.h * 0.5, sy0 - r.h * 0.5, r.h, r.h);
  ctx.fillStyle = "rgba(255,253,240,0.95)";
  ctx.beginPath();
  ctx.arc(sx0, sy0, r.h * 0.042, 0, Math.PI * 2);
  ctx.fill();

  godRays(r, ctx, g, sx0, sy0);

  /* The four ranges. Baked once — see scenery.js for why, and for the reason
   * every ridge in them is periodic. Rebaked only when the height changes. */
  if (!r.scene || r.scene.H !== Math.round(r.h)) r.scene = bakeScenery(Math.round(r.h));
  const sc = r.scene;
  blitRange(ctx, sc.far,  r, 0.035, 0);
  birds(r, ctx, g);
  blitRange(ctx, sc.mid,  r, 0.075, 0);
  clouds(r, ctx, g, dt);
  blitRange(ctx, sc.tree, r, 0.155, 0);
  blitRange(ctx, sc.near, r, 0.28,  0);

  motes(r, ctx, g, dt);
}

/**
 * Shafts of light leaning away from the sun.
 *
 * Drawn as long thin wedges in `lighter`, which is what makes them ADD to
 * whatever is behind rather than sit on top of it — a shaft that lightens the
 * sky and the treeline by the same amount reads as a painted stripe, one that
 * adds reads as air full of dust.
 *
 * They breathe on a slow clock, out of phase with each other, so the sky is
 * never quite still without anything ever being seen to move.
 */
function godRays(r, ctx, g, sx, sy) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const len = r.h * 1.5;
  for (let i = 0; i < 5; i++) {
    const a = 1.94 + i * 0.14 + Math.sin(g.time * 0.06 + i) * 0.012;
    const wid = (0.028 + i * 0.006) * (0.75 + 0.25 * Math.sin(g.time * 0.21 + i * 2.1));
    const gr = ctx.createLinearGradient(sx, sy, sx + Math.cos(a) * len, sy + Math.sin(a) * len);
    gr.addColorStop(0, "rgba(255,238,196,0.06)");
    gr.addColorStop(0.55, "rgba(255,238,196,0.022)");
    gr.addColorStop(1, "rgba(255,238,196,0)");
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(a - wid) * len, sy + Math.sin(a - wid) * len);
    ctx.lineTo(sx + Math.cos(a + wid) * len, sy + Math.sin(a + wid) * len);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Birds, wheeling between the two mountain ranges.
 *
 * Two arcs each, and never more than a few pixels across — at this distance a
 * bird IS two marks, and drawing wings on it makes it a bat. They fly a slow
 * ellipse rather than a straight line, because a straight line at constant
 * speed is the one thing nothing alive does.
 *
 * Derived from `g.time` and nothing else, so they cost no state and they are
 * in the same place on both screens.
 */
function birds(r, ctx, g) {
  ctx.save();
  ctx.strokeStyle = "rgba(60,84,104,0.5)";
  ctx.lineCap = "round";
  for (let i = 0; i < 6; i++) {
    const t = g.time * (0.028 + i * 0.004) + i * 1.7;
    const cx = r.w * (0.18 + i * 0.13) - r.cam.x * r.cam.zoom * 0.04;
    const px = cx + Math.cos(t) * r.w * 0.16;
    const py = r.h * (0.20 + (i % 3) * 0.055) + Math.sin(t * 1.6) * r.h * 0.03
             - r.cam.y * r.cam.zoom * 0.01;
    if (px < -20 || px > r.w + 20) continue;
    // The flap is the same clock, faster — and it goes flat at the top of the
    // beat, which is what a glide looks like.
    const flap = Math.max(0.12, Math.abs(Math.sin(t * 9)));
    const s = r.h * 0.006;
    ctx.lineWidth = Math.max(1, s * 0.34);
    ctx.beginPath();
    ctx.moveTo(px - s * 2, py + s * flap);
    ctx.quadraticCurveTo(px - s, py - s * flap, px, py);
    ctx.quadraticCurveTo(px + s, py - s * flap, px + s * 2, py + s * flap);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Pollen and dust in the near air, drifting up and across.
 *
 * The one layer that is IN FRONT of the arena in spirit but drawn behind it,
 * because anything over the play area is something Charlie has to see past.
 * Faint, slow and warm: it is there to make the air visible, not to be looked
 * at. Positions are pure functions of time for the same reason as the birds.
 */
function motes(r, ctx, g, dt) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 26; i++) {
    const sp = 0.5 + (i % 5) * 0.11;
    const t = g.time * sp + i * 2.39;
    const px = ((i * 137.5 + t * 26) % (r.w + 80)) - 40;
    const py = r.h * 0.95 - ((t * 14 + i * 53) % (r.h * 0.95));
    const fade = Math.min(1, (r.h * 0.95 - py) / (r.h * 0.2)) * Math.min(1, py / (r.h * 0.25));
    if (fade <= 0) continue;
    const s = r.h * (0.0016 + (i % 4) * 0.0009);
    ctx.fillStyle = `rgba(255,244,208,${0.3 * fade})`;
    ctx.beginPath();
    ctx.arc(px + Math.sin(t * 0.9 + i) * 9, py, s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  void dt;
}

/**
 * Clouds — flat-bottomed, warm underneath, and stretched.
 *
 * The old ones were a row of equal lobes, which is a caterpillar. A real
 * cumulus has a FLAT base where the air stops rising and a piled top, so the
 * lobes only ever go upward from a straight underside, and the light comes
 * from the same low sun as everything else: white on top, warm grey below.
 */
function clouds(r, ctx, g, dt) {
  /* Clouds live in the SKY BAND, not in the world.
   *
   * They used to be world objects at a world y, which worked while they were
   * parallaxed at 0.4 and moved with the arena. Slowing them down to match the
   * new ranges left them sitting still in the middle of the screen — right
   * across the platforms, washing out the one part of the frame that has to
   * stay readable. Karla cannot fight in a cloud.
   *
   * So they are placed as a fraction of the screen height, in the top third,
   * and offset in x by the same parallax the ranges use. They are sky.
   */
  const band = r.h * 0.34;
  for (const c of r.clouds) {
    c.x += c.v * dt;
    const depth = c.far ? 0.05 : 0.1;
    const span = r.w + 900;
    const px = ((c.x * 40 - r.cam.x * r.cam.zoom * depth) % span + span) % span - 450;
    const py = r.h * 0.05 + c.y * band - r.cam.y * r.cam.zoom * depth * 0.25;
    const s = c.s * Math.min(r.cam.zoom, 40) * (c.far ? 1.15 : 0.9);
    if (px < -s * 4 || px > r.w + s * 4) continue;

    ctx.save();
    ctx.globalAlpha = c.far ? 0.38 : 0.62;

    // The pile, built off a flat base at py. A real cumulus has a FLAT base
    // where the air stops rising and a piled top; the old row of equal lobes
    // was a caterpillar.
    const lobe = (ox, oy, rx, ry) => {
      ctx.moveTo(px + ox + rx, py + oy);
      ctx.ellipse(px + ox, py + oy, rx, ry, 0, 0, Math.PI * 2);
    };
    ctx.beginPath();
    ctx.rect(px - s * 1.3, py - s * 0.14, s * 2.6, s * 0.18);
    for (let i = 0; i < c.puffs; i++) {
      const t = (i / (c.puffs - 1 || 1)) * 2 - 1;
      const bulk = 1 - Math.abs(t) * 0.62;
      lobe(t * s * 1.05, -s * 0.09 - bulk * s * 0.17, s * (0.26 + bulk * 0.36), s * (0.18 + bulk * 0.26));
    }
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    // Warm shadow along the underside, clipped to the cloud.
    ctx.clip();
    const sh = ctx.createLinearGradient(0, py - s * 0.3, 0, py + s * 0.06);
    sh.addColorStop(0, "rgba(214,206,214,0)");
    sh.addColorStop(1, "rgba(212,204,208,0.4)");
    ctx.fillStyle = sh;
    ctx.fillRect(px - s * 2, py - s * 0.3, s * 4, s * 0.45);
    ctx.restore();
  }
  void g;
}

/**
 * One layer of the frame, isolated.
 *
 * This is here because of a specific, nasty failure. Every one of these
 * functions does ctx.save() ... ctx.restore(). If one throws in between, the
 * restore never happens, so:
 *
 *   - the save stack grows by one EVERY FRAME, and
 *   - whatever state the dead function had set — usually a globalAlpha on its
 *     way to zero — leaks out and applies to everything drawn afterwards,
 *     in this frame and in every frame after it.
 *
 * The visible result is that the characters vanish mid-round and never come
 * back, while the backdrop (drawn before any of this) carries on normally.
 * One transient bad number becomes a permanently broken game.
 *
 * So: each layer is wrapped, a failure is reported once with its stack rather
 * than silently swallowed, and the canvas state is put back whatever happens.
 */
const drawFaults = new Map();

/**
 * Every layer that has failed since the last reset, as name -> first error.
 *
 * This exists so the failures layer() swallows are still ASSERTABLE. Catching
 * them keeps the game playable, but it also hides them from `window.onerror`,
 * which is what _selftest.html relies on — so without this the self-test would
 * happily report OK on a renderer that is throwing on every frame. Swallowing
 * an error and reporting it are two different jobs; this is the second one.
 */
export const faults = () => [...drawFaults.entries()].map(([name, err]) => `${name}: ${err}`);
export const clearFaults = () => drawFaults.clear();

function layer(name, ctx, fn) {
  ctx.save();
  try {
    fn();
  } catch (err) {
    if (!drawFaults.has(name)) {
      drawFaults.set(name, (err && err.message) || String(err));
      console.error(`[bubu-dudu-smash] draw layer "${name}" failed — skipping it`, err);
    }
  } finally {
    ctx.restore();
  }
}

export function draw(r, g, dt) {
  const ctx = r.ctx;

  // Start every frame from a known state. Belt to the layer braces above: even
  // if the save stack has been left unbalanced by something, this frame cannot
  // inherit a stray alpha, transform or filter from the last one.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.shadowBlur = 0;
  ctx.shadowColor = "rgba(0,0,0,0)";

  layer("camera", ctx, () => updateCamera(r, g.level, g.actors, dt));
  layer("backdrop", ctx, () => drawBackdrop(r, ctx, g, dt));

  ctx.save();
  if (r.shake > 0) {
    ctx.translate((Math.random() - 0.5) * r.shake, (Math.random() - 0.5) * r.shake);
    r.shake *= 0.85;
    if (r.shake < 0.5) r.shake = 0;
  }

  layer("tiles", ctx, () => drawTiles(r, ctx, g));

  layer("coins", ctx, () => drawCoins(r, ctx, g));
  layer("powers", ctx, () => drawPowers(r, ctx, g));
  layer("wildfairy", ctx, () => drawWildFairy(r, ctx, g));
  layer("helper", ctx, () => drawHelper(r, ctx, g));
  layer("minis", ctx, () => drawMinis(r, ctx, g));
  layer("boxes", ctx, () => drawBoxes(r, ctx, g));
  // Behind the players on purpose: he is scenery that hits you, and a body
  // two and a half times theirs drawn in front would hide the fight.
  layer("king", ctx, () => drawKing(r, ctx, g));
  // Per actor, so one character failing can never take the other one with it.
  for (const a of g.actors) layer(`actor:${a.char}`, ctx, () => drawActor(r, ctx, g, a));
  for (const a of g.actors) layer("fairy", ctx, () => drawFairy(r, ctx, g, a));
  for (const a of g.actors) layer("punch", ctx, () => drawPunch(r, ctx, g, a));
  layer("shots", ctx, () => drawShots(r, ctx, g));
  layer("bursts", ctx, () => drawBursts(r, ctx, g));
  layer("quakes", ctx, () => drawQuakes(r, ctx, g));
  layer("pops", ctx, () => drawPops(r, ctx, g));
  layer("hearts", ctx, () => drawLostHearts(r, ctx, g));

  ctx.restore();

  layer("killfx", ctx, () => drawKillFx(r, ctx));

  // Red bloom round the edges, on top of everything and outside the shake.
  if (r.flash > 0) {
    const f = r.flash;
    const grd = ctx.createRadialGradient(
      r.w / 2, r.h / 2, Math.min(r.w, r.h) * 0.22,
      r.w / 2, r.h / 2, Math.max(r.w, r.h) * 0.62
    );
    grd.addColorStop(0, `rgba(255,60,90,0)`);
    grd.addColorStop(1, `rgba(255,40,75,${0.55 * f})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, r.w, r.h);
    r.flash *= 0.9;
    if (r.flash < 0.01) r.flash = 0;
  }
}

/**
 * The impact frame around a death: speed lines converging on the body, a ring
 * thrown off it, and everything outside pulled down into shadow.
 *
 * Drawn in SCREEN space, after the world transform is released, so the shake
 * cannot smear it and it does not scale with the zoom it is layered over.
 */
function drawKillFx(r, ctx) {
  if (!r.kill) return;
  const p = Math.min(1, r.kill.t / (r.kill.ms / 1000));
  if (p >= 1 && r.kill.hold) return;   // the flourish is over; the hold is not
  const px = (r.kill.x - r.cam.x) * r.cam.zoom + r.w / 2;
  const py = (r.kill.y - r.cam.y) * r.cam.zoom + r.h / 2;
  const reach = Math.max(r.w, r.h);

  // Vignette, tight at the moment of the hit and opening back up.
  const dark = Math.max(0, 1 - p * 1.4) * 0.6;
  if (dark > 0.01) {
    const grd = ctx.createRadialGradient(px, py, reach * 0.06, px, py, reach * (0.42 + p * 0.5));
    grd.addColorStop(0, "rgba(6,14,26,0)");
    grd.addColorStop(1, `rgba(6,14,26,${dark})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, r.w, r.h);
  }

  // Speed lines. Wedges rather than strokes, so they taper toward the body.
  const lines = Math.max(0, 1 - p * 1.8);
  if (lines > 0.01) {
    ctx.save();
    ctx.globalAlpha = lines * 0.75;
    ctx.fillStyle = "#ffffff";
    ctx.translate(px, py);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + i * 1.7;
      const inner = reach * (0.16 + 0.1 * ((i * 37) % 10) / 10 + p * 0.5);
      const outer = inner + reach * (0.28 + 0.2 * ((i * 53) % 10) / 10);
      const spread = 0.012 + 0.012 * ((i * 29) % 10) / 10;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a + spread) * outer, Math.sin(a + spread) * outer);
      ctx.lineTo(Math.cos(a - spread) * outer, Math.sin(a - spread) * outer);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Two rings off the body, the second lagging, both thinning as they go.
  for (const lag of [0, 0.12]) {
    const t = (p - lag) / (1 - lag);
    if (t <= 0 || t >= 0.8) continue;
    const e = 1 - Math.pow(1 - t / 0.8, 3);
    ctx.save();
    ctx.globalAlpha = (1 - t / 0.8) * 0.9;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = Math.max(2, reach * 0.012 * (1 - t / 0.8));
    ctx.beginPath();
    ctx.arc(px, py, reach * (0.03 + e * 0.34), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/** The heart they just lost, thrown clear and tumbling away. */
function drawLostHearts(r, ctx, g) {
  if (!g.lostHearts || !g.lostHearts.length) return;
  const z = r.cam.zoom;
  for (const h of g.lostHearts) {
    const age = g.time - h.at;
    const life = Math.max(0, 1 - age / 1.1);
    const px = toX(r, h.x);
    const py = toY(r, h.y);
    // pops big on the first beat, then shrinks as it falls
    const pop = age < 0.12 ? 1 + (0.12 - age) * 5 : 1;
    const size = z * 0.22 * pop * (0.5 + life * 0.5);
    ctx.save();
    ctx.globalAlpha = life;
    ctx.translate(px, py);
    ctx.rotate(h.rot);
    heartPath(ctx, 0, 0, size);
    ctx.fillStyle = "#ff4d6d";
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, z * 0.035);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.stroke();
    // a crack straight down the middle
    ctx.strokeStyle = "rgba(120,20,40,0.75)";
    ctx.lineWidth = Math.max(1.5, size * 0.16);
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.3);
    ctx.lineTo(size * 0.12, 0);
    ctx.lineTo(-size * 0.1, size * 0.3);
    ctx.lineTo(0, size * 0.82);
    ctx.stroke();
    ctx.restore();
  }
}

function drawTiles(r, ctx, g) {
  const z = r.cam.zoom;
  const art = tileArt(r);
  const x0 = Math.max(0, Math.floor(r.cam.x - r.w / 2 / z) - 1);
  const x1 = Math.min(g.level.w - 1, Math.ceil(r.cam.x + r.w / 2 / z) + 1);
  const y0 = Math.max(0, Math.floor(r.cam.y - r.h / 2 / z) - 1);
  const y1 = Math.min(g.level.h - 1, Math.ceil(r.cam.y + r.h / 2 / z) + 1);

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const c = g.grid.rows[ty][tx];
      if (c !== "#" && c !== "=" && c !== "^") continue;
      const px = toX(r, tx);
      const py = toY(r, ty);
      const kind =
        c === "=" ? "plat" :
        c === "^" ? "spike" :
        (ty === 0 || g.grid.rows[ty - 1][tx] !== "#") ? "grass" : "soil";
      // +1 on the destination so neighbouring tiles overlap by a hair;
      // without it a fractional zoom leaves a seam of sky between them.
      ctx.drawImage(
        art.canvas,
        art.index[kind] * art.cell, 0, art.cell, art.cell,
        px - (art.pad / art.key) * z, py - (art.pad / art.key) * z,
        z * (art.cell / art.key) + 1, z * (art.cell / art.key) + 1
      );
    }
  }

  // doors, drawn from the live list so they can animate open
}





/**
 * A little red cap, for a mini Bubu.
 *
 * It is the only thing that separates the squad from a normal Bubu at a
 * glance — same sprite, same white, so without it three of them running in
 * are just "some Bubus". `(x, y)` is the sprite's feet, matching draw().
 */
function drawCap(ctx, x, y, w, h, face) {
  // Sized to sit ON the head rather than perch on it — at half this it read
  // as a red smudge from playing distance.
  const cw = w * 0.82;          // crown width
  const cy = y - h * 0.78;      // sits on top of the head
  ctx.save();

  // crown: a half dome, flattened a little so it reads as a cap not a ball
  ctx.fillStyle = "#e8443f";
  ctx.beginPath();
  ctx.ellipse(x, cy, cw / 2, h * 0.24, 0, Math.PI, Math.PI * 2);
  ctx.fill();

  // peak, out over whichever way they are facing
  ctx.beginPath();
  ctx.ellipse(x + face * cw * 0.44, cy + h * 0.012, cw * 0.42, h * 0.075, 0, 0, Math.PI * 2);
  ctx.fill();

  // button on top, and a darker band so the dome has some shape
  ctx.fillStyle = "#ff7d75";
  ctx.beginPath();
  ctx.ellipse(x - face * cw * 0.12, cy - h * 0.11, cw * 0.2, h * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#c3332f";
  ctx.fillRect(x - cw / 2, cy - h * 0.018, cw, h * 0.036);
  ctx.restore();
}

/* A power-up's whole look — bloom and mark — baked once per type.
 *
 * Every power-up is its own symbol rather than a shaded ball: a ball with a
 * small mark on the front reads, from three tiles away mid-jump, as "a ball".
 * The mark IS the pickup, so it gets the whole space: full size, filled in
 * its own colour, outlined in white so it holds against sky, dirt or a
 * platform, and lit from behind by the bloom.
 *
 * Baked, because drawing it live was three thick strokeText passes and a
 * clipped fourth per orb per frame, and thick stroking of text outlines is
 * expensive: eight on screen took the frame from 2ms to 19ms. The self-test's
 * median gate is what caught it. Rasterising each mark once and blitting it
 * costs one drawImage.
 */
const MARK_REF = 44;          // the rad the sprite is drawn at
const MARK_SPAN = 3.2;        // how far the bloom reaches, in rad
const markCache = new Map();

function markSprite(type, glowC) {
  const key = `${type}:${glowC}`;
  let c = markCache.get(key);
  if (c) return c;

  const rad = MARK_REF;
  const half = Math.ceil(rad * MARK_SPAN);
  c = document.createElement("canvas");
  c.width = c.height = half * 2;
  const x = c.getContext("2d");
  const cx = half;
  const cy = half;

  const bloom = x.createRadialGradient(cx, cy, rad * 0.4, cx, cy, rad * 2.85);
  bloom.addColorStop(0, mix(glowC, [255, 255, 255], 0.3, 0.5));
  bloom.addColorStop(0.5, mix(glowC, [255, 255, 255], 0.12, 0.2));
  bloom.addColorStop(1, mix(glowC, [255, 255, 255], 0, 0));
  x.fillStyle = bloom;
  x.fillRect(0, 0, c.width, c.height);

  /* The mark, drawn rather than typed.
   *
   * It used to be a glyph set in Nunito and stroked three times. Seven of the
   * eight were ordinary characters, so the same power-up came out different
   * on a Mac and on a Windows PC; the eighth was ✊, which has an emoji
   * presentation, and a colour emoji ignores fillStyle and strokeStyle — so
   * One Punch alone had no white edge and no colour at all. Every one of them
   * is a path now, which is the same pixels everywhere and takes the outline
   * like anything else.
   */
  const size = rad * 2.05;
  // Widest first, then the white edge, then the fill.
  stampMark(x, type, cx, cy, size, mix(glowC, [255, 255, 255], 0.4, 0.3), rad * 0.25);
  stampMark(x, type, cx, cy, size, "rgba(255,255,255,0.96)", rad * 0.11);
  drawMark(x, type, cx, cy, size, glowC);
  // One highlight along the top, so it reads as an object with a lit side
  // rather than as a flat symbol.
  x.save();
  x.beginPath();
  x.rect(cx - size, cy - size, size * 2, size * 0.72);
  x.clip();
  drawMark(x, type, cx, cy, size, lighten(glowC, 0.55));
  x.restore();

  markCache.set(key, c);
  return c;
}

function drawPowers(r, ctx, g) {
  if (!g.powers) return;
  const z = r.cam.zoom;

  for (const q of g.powers) {
    const def = POWERUPS[q.type];
    const age = Math.max(0, g.time - q.born);
    // Clamped: backOut() dives steeply negative for t < 0, and a negative
    // radius makes ellipse() throw — which killed the whole frame from here
    // on, taking everything drawn after it with it.
    const pop = age < 0.42 ? Math.max(0.06, backOut(age / 0.42)) : 1;
    const bob = Math.sin(age * 2.6) * z * 0.15;
    const px = toX(r, q.x);
    const py = toY(r, q.y) + bob;
    const rad = z * 0.44 * pop;
    const pulse = 0.5 + 0.5 * Math.sin(age * 3.4);

    // shadow on the ground, tightening as it rises
    const drop = z * 0.85 - bob;
    ctx.save();
    ctx.globalAlpha = 0.16 - bob / (z * 4);
    ctx.fillStyle = "#1a2a36";
    ctx.beginPath();
    ctx.ellipse(px, py + drop, rad * 0.7, rad * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Bloom and mark come from one baked sprite; see markSprite().
    const glowC = q.type === "lunas" ? "#ff4d6d" : def.colour;
    const sprite = markSprite(q.type, glowC);

    // sparkles on the FAR half of the orbit, drawn under the mark
    const orbit = (i) => {
      const a = age * 1.9 + (i * Math.PI * 2) / 3;
      return { x: px + Math.cos(a) * rad * 1.5, y: py + Math.sin(a) * rad * 0.52, depth: Math.sin(a) };
    };
    const sparkle = (o) => {
      const near = (o.depth + 1) / 2;
      const sr = rad * (0.08 + near * 0.1);
      ctx.globalAlpha = 0.35 + near * 0.5;
      ctx.fillStyle = lighten(glowC, 0.55);
      ctx.beginPath();
      ctx.arc(o.x, o.y, sr, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    };
    for (let i = 0; i < 3; i++) {
      const o = orbit(i);
      if (o.depth < 0) sparkle(o);
    }

    const S = rad * MARK_SPAN * (1 + pulse * 0.05);
    ctx.drawImage(sprite, px - S, py - S, S * 2, S * 2);

    // near-side sparkles, over the top
    for (let i = 0; i < 3; i++) {
      const o = orbit(i);
      if (o.depth >= 0) sparkle(o);
    }
  }
}

/** The pop when one is collected: a ring outwards and a few shards. */
/**
 * The moment a pickup is taken.
 *
 * The old version pushed one burst and that was it — the same small ring a
 * bullet impact gets, for the best thing that happens in a round. This is a
 * shockwave, a ring of shards thrown outward, and the power-up's own glyph
 * lifting off and fading, all in the colour of whatever was collected.
 */
/* Where a ground pound landed.
 *
 * Three things over two beats, because one expanding ring reads as a pickup
 * and this is meant to read as the floor being hit: a shockwave that races
 * OUT ALONG THE GROUND rather than as a circle in the air, a hard plume of
 * dust and grit thrown up at the point of impact, and cracks that stay in
 * the dirt for a second and a half after everything else has gone.
 *
 * All of it scales with `force`, which is how far he fell. A pound off a
 * step barely marks the ground; one off the top of the arena leaves a
 * crater. That is the same number the knockback uses, so what you see and
 * what you felt are the same thing.
 */
/* Read from the ability, not copied. These were two literals here and two
 * more in config.js, and widening the pound moved the config pair while the
 * renderer went on drawing to the old clock — the wave finished before the
 * shove did. One source. */
const QUAKE_MS = ABILITY.pound.quakeMs;
const CRACK_MS = ABILITY.pound.crackMs;

/**
 * The crater a ground pound leaves, and everything that happens on the way.
 *
 * The first pass was thin rings and a scatter of round dots, and Charlie's
 * word for it was "panget" — which was fair. The problem is that rings and
 * dots are what an EXPLOSION looks like in the air; a ground pound is a mass
 * arriving at a floor, and nothing about it should look airborne. So:
 *
 *   - the shockwave is a FILLED band hugging the floor, not an outline. An
 *     outline reads as a soap bubble; a band reads as ground being shoved.
 *   - dust BILLOWS. A dust puff grows as it travels — that single property is
 *     the whole difference between smoke and a spray of pellets, and the old
 *     version had constant-radius circles that only faded.
 *   - debris is thrown on real ballistic arcs and comes back DOWN. Nothing
 *     sells weight like seeing the pieces land.
 *   - the wave stops exactly at the blast radius, so the range Yhon actually
 *     has is a thing you can see and learn rather than guess at.
 *
 * Everything here is a pure function of (q.x, q.at, q.force) and the clock,
 * so both phones draw an identical crater without a single extra byte on the
 * wire. `noiseAt` seeded off q.x is what keeps the pattern stable per impact
 * and different between impacts.
 */
/**
 * A soft round blob, baked once per tint.
 *
 * Dust drawn with `arc` + `fill` has a hard edge, and a hard-edged circle at
 * half opacity is a BALLOON — which is exactly what twenty-six of them looked
 * like on the contact sheet. Smoke has no edge. A radial gradient per puff
 * per frame would mean rebuilding a hundred-odd gradient objects every frame
 * of every impact, so the falloff is rasterised once and blitted.
 */
const dotCache = new Map();
function softDot(rgb) {
  let c = dotCache.get(rgb);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d");
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${rgb},0.85)`);
  gr.addColorStop(0.45, `rgba(${rgb},0.45)`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  dotCache.set(rgb, c);
  return c;
}

function drawQuakes(r, ctx, g) {
  if (!g.quakes || !g.quakes.length) return;
  const z = r.cam.zoom;
  const AB = ABILITY.pound;

  for (const q of g.quakes) {
    const age = g.time - q.at;
    if (age < 0) continue;
    const force = Math.max(0.15, Math.min(1, q.force || 0));
    const px = toX(r, q.x);
    const py = toY(r, q.y);
    // The real radius of the shove, in px. Everything on the floor is drawn
    // against THIS, so what you see is what the move actually covers.
    const reach = (AB.blast + (AB.blastFar - AB.blast) * force) * z;
    const seed = Math.abs(q.x) * 7.13 + Math.abs(q.y) * 3.7;

    const ct = age / (CRACK_MS / 1000);
    const t = age / (QUAKE_MS / 1000);

    /* ---- 1. the scorched ground, under everything and longest-lived ---- */
    if (ct < 1) {
      const fade = Math.pow(1 - ct, 1.7) * 0.26;
      const open = Math.min(1, ct * 8);
      ctx.save();
      ctx.globalAlpha = fade;
      const sc = ctx.createRadialGradient(px, py, 0, px, py, reach * 0.85 * open);
      sc.addColorStop(0, "rgba(46,30,20,0.85)");
      sc.addColorStop(0.55, "rgba(58,40,26,0.35)");
      sc.addColorStop(1, "rgba(58,40,26,0)");
      ctx.fillStyle = sc;
      ctx.beginPath();
      ctx.ellipse(px, py, reach * 0.85 * open, reach * 0.2 * open, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    /* ---- 2. the cracks: tapered wedges lying flat on the ground ----
     *
     * These were round-capped STROKES of constant width, forked, at full
     * length — which is a drawing of a bare shrub, and that is exactly what
     * it looked like sitting on the grass. A crack in the ground is wide
     * where the thing hit and narrows to nothing, and it lies in the floor
     * plane rather than standing up out of it. So: filled wedges, squashed
     * on Y by the same amount as the shockwave, and short enough that they
     * stay inside the crater instead of reaching for the next platform. */
    if (ct < 1) {
      const open = Math.min(1, ct * 7);
      const fade = 1 - Math.pow(ct, 2.2);
      const SQUASH = 0.26;
      ctx.save();
      const RAYS = 7;
      for (let i = 0; i < RAYS; i++) {
        const a0 = -Math.PI + (i + 0.5) * (Math.PI / RAYS);
        const wob = (noiseAt(i * 3 + seed) - 0.5) * 0.55;
        const ang = a0 + wob;
        const len = reach * 0.42 * (0.55 + 0.45 * noiseAt(i * 3 + 1 + seed)) * open;
        const w = z * (0.1 + force * 0.09);

        // tip, and a kink partway along so it is not a ruled line
        const ex = px + Math.cos(ang) * len;
        const ey = py + Math.sin(ang) * len * SQUASH;
        const kink = (noiseAt(i * 3 + 2 + seed) - 0.5) * 0.45;
        const mx = px + Math.cos(ang + kink) * len * 0.5;
        const my = py + Math.sin(ang + kink) * len * 0.5 * SQUASH;
        // across the wedge, flattened the same way as its length
        const nx = -Math.sin(ang), ny = Math.cos(ang) * SQUASH;

        const wedge = () => {
          ctx.beginPath();
          ctx.moveTo(px + nx * w, py + ny * w);
          ctx.lineTo(mx + nx * w * 0.45, my + ny * w * 0.45);
          ctx.lineTo(ex, ey);
          ctx.lineTo(mx - nx * w * 0.45, my - ny * w * 0.45);
          ctx.lineTo(px - nx * w, py - ny * w);
          ctx.closePath();
          ctx.fill();
        };

        ctx.globalAlpha = fade * 0.6;
        ctx.fillStyle = "rgba(42,28,18,0.95)";
        wedge();
        // While it is still opening, the inside of the split is hot.
        if (ct < 0.28) {
          ctx.globalAlpha = (1 - ct / 0.28) * 0.55;
          ctx.fillStyle = AB.colour;
          ctx.save();
          ctx.translate(px, py);
          ctx.scale(0.55, 0.55);
          ctx.translate(-px, -py);
          wedge();
          ctx.restore();
        }
      }
      ctx.restore();
    }

    if (t >= 1) continue;

    /* ---- 3. the shockwave: a filled band travelling out along the floor,
       stopping dead at the edge of what the blast actually reaches ---- */
    for (const [lag, thick, warm] of [[0, 0.55, false], [0.18, 0.32, true]]) {
      const tt = (t - lag) / (1 - lag);
      if (tt <= 0 || tt >= 1) continue;
      const ee = 1 - Math.pow(1 - tt, 2.4);
      const rad = reach * ee;
      /* Capped at a fraction of the radius it is currently at.
       *
       * Without the cap the band is wider than the ring for the first third
       * of its life, the inner ellipse clamps to zero, and the nonzero fill
       * has nothing to cut out — so the "expanding band" renders as a solid
       * pale disc sitting on the floor. On the contact sheet it read as a
       * puddle, which is the opposite of the thing travelling outward. */
      const band = Math.min(rad * 0.55, reach * thick * (1 - tt) * 0.5 + z * 0.12);
      const squash = 0.26;

      ctx.save();
      ctx.globalAlpha = Math.pow(1 - tt, 1.7) * 0.95;
      // An annulus: outer ellipse, then the inner one wound the other way so
      // the nonzero fill rule cuts the middle out. One path, one fill — and
      // it stays a band at every radius, which a stroke of fixed width does
      // not once the ring is six tiles across.
      ctx.beginPath();
      ctx.ellipse(px, py, rad, rad * squash, 0, 0, Math.PI * 2);
      ctx.ellipse(px, py, Math.max(0, rad - band), Math.max(0, rad - band) * squash,
                  0, 0, Math.PI * 2, true);
      const gr = ctx.createRadialGradient(px, py, Math.max(0, rad - band), px, py, rad);
      if (warm) {
        gr.addColorStop(0, "rgba(255,156,63,0)");
        gr.addColorStop(0.7, "rgba(255,176,86,0.55)");
        gr.addColorStop(1, "rgba(255,214,150,0.15)");
      } else {
        gr.addColorStop(0, "rgba(255,240,214,0)");
        gr.addColorStop(0.6, "rgba(255,232,190,0.7)");
        gr.addColorStop(1, "rgba(255,255,255,0.9)");
      }
      ctx.fillStyle = gr;
      ctx.fill();
      /* A thin dark line on the leading edge, and ONLY while the wave is
       * young. The band is warm and the arena floor is bright green, so
       * without something dark to separate them it washes out over exactly
       * the ground it is crossing — but carried to the end of the wave's
       * life the same line is a six-tile pencilled hoop lying on the grass,
       * long after anything is still happening. */
      if (tt < 0.5) {
        ctx.globalAlpha = (1 - tt * 2) * 0.35;
        ctx.strokeStyle = "rgba(60,36,18,0.9)";
        ctx.lineWidth = Math.max(1, z * 0.035);
        ctx.beginPath();
        ctx.ellipse(px, py, rad, rad * squash, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* ---- 4. dust, billowing: each puff GROWS as it travels out ---- */
    ctx.save();
    const PUFFS = 26;
    for (let i = 0; i < PUFFS; i++) {
      const side = i % 2 ? 1 : -1;
      const n1 = noiseAt(i * 5 + seed), n2 = noiseAt(i * 5 + 1 + seed);
      const lag = n1 * 0.2;
      const tt = (t - lag) / (1 - lag);
      if (tt <= 0) continue;
      const ee = 1 - Math.pow(1 - tt, 2.2);
      // Out to roughly the blast edge, slowest puffs about half as far.
      const out = reach * ee * (0.45 + n2 * 0.6);
      // Rises as it goes, and keeps rising after it has stopped travelling —
      // that lag between moving out and drifting up is what makes it smoke.
      const rise = z * (0.25 + force * 1.3) * (0.3 + n1) * Math.min(1, tt * 2.1);
      const rad = z * (0.1 + force * 0.16) * (0.5 + n2) * (0.35 + ee * 2.3);
      ctx.globalAlpha = Math.max(0, 1 - tt * 1.05) * 0.55;
      // Two families so it is not one flat colour: pale kicked-up dust, and
      // darker soil from where he actually hit.
      const dot = softDot(i % 3 === 0 ? "124,92,62" : "226,208,180");
      ctx.drawImage(dot, px + side * out - rad, py - rise - rad, rad * 2, rad * 2);
    }
    ctx.restore();

    /* ---- 5. debris: thrown on real arcs, and it comes back down ---- */
    ctx.save();
    const CHUNKS = 12;
    for (let i = 0; i < CHUNKS; i++) {
      const n1 = noiseAt(i * 7 + 40 + seed), n2 = noiseAt(i * 7 + 41 + seed);
      const n3 = noiseAt(i * 7 + 42 + seed);
      const side = i % 2 ? 1 : -1;
      const vx = z * (2.4 + n1 * 5.2) * (0.5 + force) * side;
      const vy = -z * (4.5 + n2 * 5.5) * (0.5 + force);
      const life = t * (QUAKE_MS / 1000);
      const cx = px + vx * life;
      const cy = py + vy * life + z * 34 * life * life;   // gravity, in px
      if (cy > py + z * 0.25) continue;                   // landed, gone
      ctx.globalAlpha = Math.max(0, 1 - t * 0.9);
      ctx.fillStyle = n3 > 0.62 ? "#8f7a5e" : n3 > 0.3 ? "#6b4a30" : "#4e382a";
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(life * (5 + n1 * 9) * side);
      const sz = z * (0.055 + n3 * 0.075) * (0.6 + force * 0.7);
      ctx.fillRect(-sz, -sz * 0.7, sz * 2, sz * 1.4);
      ctx.restore();
    }
    ctx.restore();

    /* ---- 6. contact: a small hot flash and a short column of light ----
     *
     * This was a radial gradient eight tiles across in `lighter`, held for
     * 300ms. On the contact sheet it is a white dome over the entire frame —
     * you cannot see the shockwave, the arena, or either character through
     * it. A flash is a flash: small, and gone before you have focused on it.
     * The wave is what you are supposed to read, so the flash must get out
     * of its way. */
    if (t < 0.14) {
      const k = Math.pow(1 - t / 0.14, 1.8);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = k * 0.85;
      const fl = ctx.createRadialGradient(px, py, 0, px, py, reach * 0.3);
      fl.addColorStop(0, "rgba(255,255,255,0.9)");
      fl.addColorStop(0.4, "rgba(255,206,132,0.4)");
      fl.addColorStop(1, "rgba(255,156,63,0)");
      ctx.fillStyle = fl;
      ctx.beginPath();
      ctx.ellipse(px, py, reach * 0.3, reach * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      // The column. A pound is a vertical event and every other part of this
      // spreads sideways; without it the impact has no up.
      const ch = z * (1.2 + force * 2.4);
      const col = ctx.createLinearGradient(px, py, px, py - ch);
      col.addColorStop(0, "rgba(255,238,198,0.6)");
      col.addColorStop(1, "rgba(255,238,198,0)");
      ctx.fillStyle = col;
      const cw = z * (0.16 + force * 0.24) * k;
      ctx.fillRect(px - cw, py - ch, cw * 2, ch);
      ctx.restore();
    }
  }
}


/* --------------------------------------------------------------- boxes --- */

const BOX_MS = 240;

/**
 * A mystery box: a crate hanging in the air with a ? on it.
 *
 * The count of bumps it has left is the whole read, and it is shown two ways
 * at once — the lid lifts a notch each time and the ? brightens — because a
 * number floating over a crate in a game with no other numbers on the field
 * reads as debug output.
 */
function drawBoxes(r, ctx, g) {
  if (!g.boxes || !g.boxes.length) return;
  const z = r.cam.zoom;
  for (const b of g.boxes) {
    const bob = Math.sin(g.time * 2.1 + b.x) * BOX.bob;
    // Struck: it jumps, the way every block in every platformer has.
    const hitT = Math.max(0, Math.min(1, (g.time - (b.bumpAt ?? -9)) / (BOX_MS / 1000)));
    const kick = hitT < 1 ? Math.sin(hitT * Math.PI) * 0.45 : 0;
    const px = toX(r, b.x);
    const py = toY(r, b.y + bob - kick);
    const s = z * BOX.w;
    const left = Math.max(0, Math.min(BOX.hits, b.hits));
    // Full-strength gold, dulling as it gives way.
    const wear = left / BOX.hits;

    ctx.save();
    // A shadow under it, or it reads as painted on the sky rather than hung
    // in front of it.
    ctx.fillStyle = "rgba(30,24,16,0.18)";
    ctx.beginPath();
    ctx.ellipse(px, py + s * 0.62, s * 0.42, s * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    // the crate
    roundRect(ctx, px - s / 2, py - s / 2, s, s, s * 0.16);
    const grd = ctx.createLinearGradient(0, py - s / 2, 0, py + s / 2);
    // mix() takes an RGB ARRAY as its target, not a hex string — handed a
    // string it indexes characters, and every channel comes out NaN.
    grd.addColorStop(0, mix(BOX.colour, [255, 255, 255], 0.35 * wear + 0.1));
    grd.addColorStop(1, mix(BOX.colour, [107, 74, 48], 0.45 - 0.2 * wear));
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, z * 0.045);
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.stroke();

    // rivets at the corners, so it is a crate and not a tile
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.beginPath();
      ctx.arc(px + sx * s * 0.34, py + sy * s * 0.34, s * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }

    // The ?, bright while it is whole and fading as it gives.
    ctx.save();
    ctx.globalAlpha = 0.45 + 0.55 * wear;
    stampMark(ctx, "box", px, py - s * 0.02, s * 0.52, "#ffffff",
              Math.max(1.5, z * 0.05), mix(BOX.colour, [107, 74, 48], 0.55));
    ctx.restore();

    // The cracks it has taken, one per bump spent.
    const cracks = BOX.hits - left;
    if (cracks > 0) {
      ctx.strokeStyle = "rgba(60,38,20,0.55)";
      ctx.lineWidth = Math.max(1, z * 0.03);
      for (let i = 0; i < cracks; i++) {
        const n = noiseAt(i * 5 + 3);
        ctx.beginPath();
        ctx.moveTo(px - s * 0.42, py + (n - 0.5) * s * 0.7);
        ctx.lineTo(px - s * 0.1 + n * s * 0.2, py + (n - 0.4) * s * 0.5);
        ctx.lineTo(px + s * 0.42, py + (noiseAt(i * 5 + 4) - 0.5) * s * 0.7);
        ctx.stroke();
      }
    }

    // Flash white on the frame it is struck.
    if (hitT < 0.35) {
      ctx.globalAlpha = (1 - hitT / 0.35) * 0.8;
      roundRect(ctx, px - s / 2, py - s / 2, s, s, s * 0.16);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }
    ctx.restore();
  }
}

/* ---------------------------------------------------------------- king --- */

/**
 * King Yhon Yhon.
 *
 * The same pig everyone knows, two and a half times the size, wearing a
 * crown — which is the entire design. A boss that looked like a new creature
 * would need explaining; one that is plainly the pig, enormous, explains
 * itself in the half second before it lands on you.
 */
function drawKing(r, ctx, g) {
  const k = g.king;
  if (!k || !k.actor) return;
  const a = k.actor;
  const z = r.cam.zoom;
  const px = toX(r, a.x);
  const py = toY(r, a.y);
  const w = a.w * z, h = a.h * z;

  ctx.save();
  // A shadow the size of him, so the ground says how big he is before he
  // lands on it.
  ctx.fillStyle = "rgba(24,18,12,0.22)";
  ctx.beginPath();
  ctx.ellipse(px, py + z * 0.06, w * 0.5, z * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();

  // Struck a moment ago: he flashes white, like everything else that is hurt.
  const hurt = k.hurtUntil && g.time < k.hurtUntil;

  // The body, outlined so he holds against the treeline.
  stampOutline(r, ctx, "rgba(255,255,255,0.95)", px, py - h / 2, w, h,
               Math.max(2, z * 0.07), (cx, cy, cw, chh) => {
    charById("yhon").draw(ctx, cx, cy + chh / 2, cw, chh, {
      face: a.face, run: 0, air: a.grounded ? 0 : (a.vy < 0 ? -1 : 1),
      squash: 0, t: g.time, walk: 0, stride: 0.78,
    });
  });
  charById("yhon").draw(ctx, px, py, w, h, {
    face: a.face, run: 0, air: a.grounded ? 0 : (a.vy < 0 ? -1 : 1),
    squash: 0, t: g.time, walk: 0, stride: 0.78,
  });
  if (hurt) {
    ctx.save();
    ctx.globalAlpha = 0.45 + 0.35 * Math.abs(Math.sin(g.time * 30));
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath();
    ctx.ellipse(px, py - h * 0.5, w * 0.48, h * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawCrown(ctx, px, py - h, w * 0.5, z);

  // His three hearts, over the crown rather than over the head — the crown
  // is where a player's hearts would be.
  // Above the crown, which is itself above his head — that stack is the
  // whole silhouette, so nothing may overlap anything else in it.
  drawBossHearts(r, ctx, px, py - h - w * 0.62, k.hp, KING.hp, z);
  ctx.restore();
}

/** The crown. Also worn by whoever takes it off him. */
function drawCrown(ctx, px, py, s, z) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(px - s * 0.6, py);
  ctx.lineTo(px - s * 0.6, py - s * 0.34);
  ctx.lineTo(px - s * 0.3, py - s * 0.1);
  ctx.lineTo(px, py - s * 0.52);
  ctx.lineTo(px + s * 0.3, py - s * 0.1);
  ctx.lineTo(px + s * 0.6, py - s * 0.34);
  ctx.lineTo(px + s * 0.6, py);
  ctx.closePath();
  const grd = ctx.createLinearGradient(0, py - s * 0.52, 0, py);
  grd.addColorStop(0, "#fff0ad");
  grd.addColorStop(1, KING.colour);
  ctx.fillStyle = grd;
  ctx.fill();
  ctx.lineWidth = Math.max(1.4, z * 0.035);
  ctx.strokeStyle = "rgba(120,80,20,0.6)";
  ctx.stroke();
  // Three jewels along the band.
  for (let i = -1; i <= 1; i++) {
    ctx.fillStyle = i === 0 ? "#ff4d6d" : "#7fd4ff";
    ctx.beginPath();
    ctx.arc(px + i * s * 0.34, py - s * 0.08, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A boss health bar: big pips, not the player's small hearts. */
function drawBossHearts(r, ctx, cx, cy, hp, max, z) {
  // Half again the size of a player's. He is the only thing on screen with a
  // health bar that matters to both of them at once, and it has to be
  // readable from wherever either of them happens to be standing.
  const s = z * 0.26;
  const gap = s * 2.5;
  const total = (max - 1) * gap;
  for (let i = 0; i < max; i++) {
    const x = cx - total / 2 + i * gap;
    const full = i < hp;
    heartPath(ctx, x, cy, s);
    ctx.fillStyle = full ? "#ff4d6d" : "rgba(255,255,255,0.45)";
    ctx.fill();
    ctx.lineWidth = Math.max(1.4, z * 0.04);
    ctx.strokeStyle = full ? "rgba(255,255,255,0.95)" : "rgba(92,128,158,0.7)";
    ctx.stroke();
  }
}

function drawPops(r, ctx, g) {
  if (!g.pops || !g.pops.length) return;
  const z = r.cam.zoom;
  for (const p of g.pops) {
    const t = (g.time - p.at) / 0.7;
    if (t >= 1) continue;
    const px = toX(r, p.x);
    const py = toY(r, p.y);
    const e = 1 - Math.pow(1 - t, 2.4);

    ctx.save();

    // Two rings, the second trailing, so it reads as a wave rather than a dot.
    for (const [lag, w] of [[0, 0.16], [0.18, 0.08]]) {
      const tt = (t - lag) / (1 - lag);
      if (tt <= 0) continue;
      const ee = 1 - Math.pow(1 - tt, 2.4);
      ctx.globalAlpha = (1 - tt) * 0.9;
      ctx.strokeStyle = lighten(p.colour, 0.4);
      ctx.lineWidth = Math.max(1.5, z * w * (1 - tt));
      ctx.beginPath();
      ctx.ellipse(px, py, z * (0.2 + ee * 3.2), z * (0.2 + ee * 2.4), 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Shards, alternating long and short so the spray is not a perfect wheel.
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + p.at * 2;
      const reach = i % 2 ? 3.1 : 2.2;
      const d = z * (0.3 + e * reach);
      ctx.globalAlpha = (1 - t) * 0.95;
      ctx.fillStyle = i % 3 === 0 ? "#ffffff" : lighten(p.colour, 0.5);
      ctx.beginPath();
      ctx.arc(px + Math.cos(a) * d, py + Math.sin(a) * d * 0.78, z * 0.12 * (1 - t), 0, Math.PI * 2);
      ctx.fill();
    }

    // The mark itself, rising out of the spot it was taken from.
    if (p.glyph && markPath(p.glyph)) {
      ctx.globalAlpha = Math.max(0, 1 - t * 1.25);
      const gs = z * (0.78 + t * 0.55);
      const gy = py - z * (0.3 + e * 1.9);
      stampMark(ctx, p.glyph, px, gy, gs, "rgba(255,255,255,0.85)", Math.max(1.5, z * 0.05));
      drawMark(ctx, p.glyph, px, gy, gs, p.colour);
    }
    ctx.restore();
  }
}

/* --------------------------------------------------------- colour help --- */

function rgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function mix(hex, target, t, alpha = 1) {
  const c = rgb(hex);
  const o = c.map((v, i) => Math.round(v + (target[i] - v) * t));
  return `rgba(${o[0]},${o[1]},${o[2]},${alpha})`;
}
const lighten = (hex, t, a = 1) => mix(hex, [255, 255, 255], t, a);
const darken = (hex, t, a = 1) => mix(hex, [16, 24, 40], t, a);

/** Overshoot easing for the spawn pop. */
const backOut = (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);

/**
 * Pickups, drawn as lit spheres rather than flat discs.
 *
 * Everything here is doing one job: making the thing look like an object in
 * the world with a light on it. The gradient is offset towards a light up and
 * to the left, there is a darker rim and a bounce highlight on the opposite
 * side, a specular dot, a shadow on the ground beneath, and three sparkles on
 * an elliptical orbit that pass BEHIND the sphere on the far half of the
 * circuit — that last one is most of what sells the depth.
 */

// Matched to the filter in screen.js that keeps a collected coin alive.
const COIN_POP_SEC = 0.75;

/**
 * Coins.
 *
 * No spin. Squashing the width on a sine is the cheap way to fake one, and it
 * looks exactly like what it is — a circle being squeezed. They just bob, on
 * a per-coin phase so a row of them is never in step. A collected one keeps
 * drawing for a beat as it rises and fades, so the pickup has somewhere to go
 * rather than blinking out.
 */
/* The coin, baked once.
 *
 * A gem rather than a disc, and dressed the way the Lunas heart is: a wide
 * white outline so it holds against sky, dirt or a platform, a warm glow
 * behind it, and two shine dots. Seven of these are on the field at a time,
 * so it is rasterised once and blitted after that — the same reason the
 * power-up marks are.
 */
const COIN_REF = 40;
const COIN_SPAN = 2.2;
let coinCanvas = null;

function coinSprite() {
  if (coinCanvas) return coinCanvas;
  const rad = COIN_REF;
  const half = Math.ceil(rad * COIN_SPAN);
  const c = document.createElement("canvas");
  c.width = c.height = half * 2;
  const x = c.getContext("2d");
  const cx = half;
  const cy = half;

  const glow = x.createRadialGradient(cx, cy, rad * 0.3, cx, cy, rad * 2.1);
  glow.addColorStop(0, "rgba(255,206,90,0.5)");
  glow.addColorStop(1, "rgba(255,206,90,0)");
  x.fillStyle = glow;
  x.fillRect(0, 0, c.width, c.height);

  x.lineJoin = "round";
  gemPath(x, cx, cy, rad);
  // Widest pass first, then the white edge, then the fill — stroking on top
  // of the fill eats the shape from its outline inward.
  x.lineWidth = rad * 0.52;
  x.strokeStyle = "rgba(255,214,120,0.55)";
  x.stroke();
  x.lineWidth = rad * 0.34;
  x.strokeStyle = "rgba(255,255,255,0.97)";
  x.stroke();
  x.fillStyle = COINS.colour;
  x.fill();

  // A darker pavilion under the table, so it reads as cut rather than flat.
  x.save();
  gemPath(x, cx, cy, rad);
  x.clip();
  x.fillStyle = "rgba(196,128,10,0.28)";
  x.beginPath();
  x.moveTo(cx - rad, cy - rad * 0.02);
  x.lineTo(cx + rad, cy - rad * 0.02);
  x.lineTo(cx, cy + rad);
  x.closePath();
  x.fill();
  x.restore();

  // Two shines, big then small, the way the heart wears them.
  x.fillStyle = "rgba(255,255,255,0.9)";
  x.beginPath();
  x.ellipse(cx - rad * 0.3, cy - rad * 0.24, rad * 0.17, rad * 0.12, -0.5, 0, Math.PI * 2);
  x.fill();
  x.beginPath();
  x.arc(cx + rad * 0.2, cy + rad * 0.26, rad * 0.1, 0, Math.PI * 2);
  x.fill();

  coinCanvas = c;
  return c;
}

function drawCoins(r, ctx, g) {
  if (!g.coins || !g.coins.length) return;
  const z = r.cam.zoom;
  for (const c of g.coins) {
    const taken = c.taken ? (g.time - c.taken) / COIN_POP_SEC : 0;
    if (taken >= 1) continue;
    const bob = Math.sin(g.time * 2.4 + c.x * 1.3) * z * 0.09;

    let px = toX(r, c.x);
    let py = toY(r, c.y) + bob;
    let rad = z * COINS.radius;

    if (taken) {
      // Collected: it hops up, then homes in on whoever took it and shrinks
      // into them. Flying to the player is what makes it read as "you got
      // this" rather than as the coin simply ceasing to exist.
      const owner = c.by && g.actors.find((a) => a.id === c.by && !a.dead);
      const e = taken * taken;                 // slow start, fast finish
      const hop = Math.sin(Math.min(1, taken * 2.4) * Math.PI) * z * 0.55;
      if (owner) {
        px += (toX(r, owner.x) - px) * e;
        py += (toY(r, owner.y) - owner.h * z * 0.6 - py) * e - hop;
      } else {
        py -= hop + taken * z * 0.9;
      }
      rad *= Math.max(0, 1 + taken * 0.5 - taken * taken * 1.4);
    }

    ctx.save();
    // It stays solid almost all the way in, then goes at the last moment —
    // fading it out from the start just made it look like it never arrived.
    ctx.globalAlpha = taken ? Math.max(0, 1 - Math.pow(taken, 3)) : 1;

    if (taken) drawCoinPop(ctx, r, c, taken);

    const S = rad * COIN_SPAN;
    ctx.drawImage(coinSprite(), px - S, py - S, S * 2, S * 2);
    ctx.restore();
  }
}

/**
 * The flourish a coin leaves behind where it was picked up.
 *
 * Drawn at the coin's ORIGINAL position rather than following it in, so the
 * burst marks the place it was taken from while the coin itself flies off to
 * the player — two things happening instead of one, which is most of why this
 * reads as an event now.
 */
function drawCoinPop(ctx, r, c, t) {
  const z = r.cam.zoom;
  const px = toX(r, c.x);
  const py = toY(r, c.y);
  const big = c.milestone;
  const e = 1 - Math.pow(1 - t, 2.6);

  ctx.save();

  // A ring, wider and slower on the tenth.
  ctx.globalAlpha = Math.max(0, 1 - t * 1.25) * 0.9;
  ctx.strokeStyle = "#fff0bd";
  ctx.lineWidth = Math.max(1.5, z * (big ? 0.11 : 0.07) * (1 - t));
  ctx.beginPath();
  ctx.arc(px, py, z * (0.18 + e * (big ? 2.6 : 1.15)), 0, Math.PI * 2);
  ctx.stroke();

  // Shards thrown outward, alternating gold and white.
  const shards = big ? 14 : 8;
  for (let i = 0; i < shards; i++) {
    const a = (i / shards) * Math.PI * 2 + c.x;
    const d = z * (0.16 + e * (big ? 2.1 : 0.95));
    ctx.globalAlpha = Math.max(0, 1 - t * 1.35);
    ctx.fillStyle = i % 2 ? "#ffffff" : COINS.colour;
    ctx.beginPath();
    ctx.arc(px + Math.cos(a) * d, py + Math.sin(a) * d * 0.85,
      z * (big ? 0.11 : 0.075) * (1 - t), 0, Math.PI * 2);
    ctx.fill();
  }

  // The running total, rising off the spot. This is the actual information —
  // how close you are — delivered where you are already looking.
  if (c.n) {
    ctx.globalAlpha = Math.max(0, 1 - Math.pow(t, 1.6));
    const size = z * (big ? 0.52 : 0.34) * (1 + t * 0.35);
    ctx.font = `900 ${size}px "Nunito", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(2, z * 0.06);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.fillStyle = big ? "#ff8a3d" : "#c98a12";
    const label = big ? "FULL!" : `${c.n}/${COINS.perReward}`;
    const ty = py - z * (0.55 + e * 1.15);
    ctx.strokeText(label, px, ty);
    ctx.fillText(label, px, ty);
  }

  ctx.restore();
}

/**
 * Fairy Yhon Yhon.
 *
 * The same pig, small, with wings, riding just behind and above her player.
 * She trails rather than sticks, which is what makes her look like she is
 * following you rather than glued on — and she flares every time she spends
 * a heal, so the thing you actually care about (a heart went back) has a
 * visible cause.
 */
/**
 * The loose Diwata, drifting the arena waiting to be caught.
 *
 * Same character, same wings, but she is not riding anybody — so she gets a
 * pull-ring on top of the glow. She is the one pickup that MOVES, and without
 * something saying "come and get this" she just looks like scenery.
 */
function drawWildFairy(r, ctx, g) {
  const w = g.wildFairy;
  if (!w) return;
  const z = r.cam.zoom;
  const leave = w.leaving ? Math.min(1, w.wave / (DIWATA.leaveMs / 1000)) : 0;
  const bob = Math.sin(g.time * 3 + w.phase) * z * 0.16;
  const px = toX(r, w.x) + Math.cos(g.time * 1.4 + w.phase) * z * 0.08;
  const py = toY(r, w.y) + bob;

  ctx.save();
  ctx.globalAlpha = 1 - leave;

  // The ring, breathing outward — the same language the power-up pickups use.
  for (const off of [0, 0.5]) {
    const pulse = (g.time * 1.1 + w.phase + off) % 1;
    ctx.strokeStyle = `rgba(255,120,175,${(1 - pulse) * 0.85 * (1 - leave)})`;
    ctx.lineWidth = Math.max(2, z * 0.07 * (1 - pulse * 0.5));
    ctx.beginPath();
    ctx.arc(px, py, z * (0.45 + pulse * 0.95), 0, Math.PI * 2);
    ctx.stroke();
  }

  const glow = ctx.createRadialGradient(px, py, 0, px, py, z * 1.1);
  glow.addColorStop(0, "rgba(255,194,221,0.55)");
  glow.addColorStop(1, "rgba(255,194,221,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(px - z * 2, py - z * 2, z * 4, z * 4);

  const beat = Math.sin(g.time * 22 + w.phase) * 0.4 + 0.75;
  ctx.save();
  ctx.translate(px, py - z * 0.28);
  ctx.globalAlpha = (1 - leave) * 0.72;
  ctx.fillStyle = "#ffffff";
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.rotate(-0.5);
    ctx.beginPath();
    ctx.ellipse(z * 0.26, 0, z * 0.3 * beat, z * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // A short trail of sparks behind her, so a fast drift reads as flight.
  for (let i = 1; i <= 4; i++) {
    const t = i * 0.055;
    ctx.globalAlpha = (1 - leave) * (0.3 - i * 0.06);
    ctx.fillStyle = DIWATA.colour;
    ctx.beginPath();
    ctx.arc(px - (w.face || 1) * z * t * 3.2, py + Math.sin(g.time * 3 + w.phase - t * 4) * z * 0.14,
            z * (0.09 - i * 0.015), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1 - leave;

  // Bigger than the one riding a player: this one has to be spotted from
  // across the arena and chased, not just noticed once it is beside you.
  const size = z * DIWATA.scale * 1.35 * (1 - leave * 0.5);
  /* ...and traced in white, like everything else on the field that belongs
   * to nobody yet. She is a pale pink character on a pale blue sky and the
   * glow behind her is pink too; against a cloud she simply vanished. */
  if (size > 1) {
    const wpose = {
      face: w.face || 1, run: 0, air: -1, rise: 0.4, squash: -0.1,
      t: g.time, walk: 0, stride: 1,
    };
    stampOutline(r, ctx, "#ffffff", px, py + size * 0.5, size, size, z * 0.055,
      (b, bx, by) => charById("yhon").draw(b, bx, by, size, size, wpose));
  }
  charById("yhon").draw(ctx, px, py + size * 0.5, size, size, {
    face: w.face || 1,
    run: 0,
    air: -1,
    rise: 0.4,
    squash: -0.1,
    t: g.time,
    walk: 0,
    stride: 1,
  });
  ctx.restore();
}

function drawFairy(r, ctx, g, a) {
  const f = a.fairy;
  if (!f || a.dead) return;
  const z = r.cam.zoom;

  const leave = f.leaving ? Math.min(1, f.wave / (DIWATA.leaveMs / 1000)) : 0;
  const bob = Math.sin(g.time * 3 + f.phase) * z * 0.18;
  /* She rides a fixed 1.15 tiles out, which is a comfortable arm's length
   * from a normal body and INSIDE a big one — pick up Laki and she ends up
   * sitting on the shoulder she is meant to be flying beside. The orbit is
   * measured off the body she is following, so it grows with it. */
  const grow = Math.max(1, (a.w || FEEL.width) / FEEL.width);
  const px = toX(r, a.x - (a.face || 1) * DIWATA.orbit * grow) +
             Math.cos(g.time * 1.6 + f.phase) * z * 0.12;
  const py = toY(r, a.y - a.h * 1.22) + bob - leave * z * 2.4;

  // The flare when she has just healed.
  const since = f.healAt >= 0 ? g.time - f.healAt : 99;
  const flare = since < 0.5 ? 1 - since / 0.5 : 0;

  ctx.save();
  ctx.globalAlpha = 1 - leave;

  const glow = ctx.createRadialGradient(px, py, 0, px, py, z * (0.9 + flare * 1.1));
  glow.addColorStop(0, `rgba(255,194,221,${0.5 + flare * 0.4})`);
  glow.addColorStop(1, "rgba(255,194,221,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(px - z * 2, py - z * 2, z * 4, z * 4);

  // Wings behind her, beating fast.
  const beat = Math.sin(g.time * 22 + f.phase) * 0.4 + 0.75;
  ctx.save();
  ctx.translate(px, py - z * 0.28);
  ctx.globalAlpha = (1 - leave) * 0.72;
  ctx.fillStyle = "#ffffff";
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.rotate(-0.5);
    ctx.beginPath();
    ctx.ellipse(z * 0.26, 0, z * 0.3 * beat, z * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  const size = z * DIWATA.scale * (1 + flare * 0.18) * (1 - leave * 0.5);
  if (size > 1) {
    const fpose = {
      face: a.face || 1, run: 0, air: -1, rise: 0.4, squash: -0.1,
      t: g.time, walk: 0, stride: 1,
    };
    stampOutline(r, ctx, "#ffffff", px, py + size * 0.5, size, size, z * 0.05,
      (b, bx, by) => charById("yhon").draw(b, bx, by, size, size, fpose));
  }
  charById("yhon").draw(ctx, px, py + size * 0.5, size, size, {
    face: a.face || 1,
    run: 0,
    air: -1,
    rise: 0.4,
    squash: -0.1,
    t: g.time,
    walk: 0,
    stride: 1,
  });

  // Dust behind her, and more of it on a heal.
  const motes = flare > 0 ? 9 : 4;
  for (let i = 0; i < motes; i++) {
    const k = (g.time * 0.7 + i / motes) % 1;
    ctx.globalAlpha = (1 - k) * (1 - leave) * (flare > 0 ? 0.9 : 0.5);
    ctx.fillStyle = i % 2 ? "#fff" : DIWATA.colour;
    const ang = (i / motes) * Math.PI * 2 + g.time * 2;
    const d = z * (0.2 + k * (flare > 0 ? 1.5 : 0.6));
    ctx.beginPath();
    ctx.arc(px + Math.cos(ang) * d, py + Math.sin(ang) * d * 0.8, z * 0.055 * (1 - k), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/** The three little Bubus, and the puff each one leaves. */
function drawMinis(r, ctx, g) {
  if (!g.minis || !g.minis.length) return;
  const z = r.cam.zoom;
  for (const m of g.minis) {
    const me = m.actor;
    const px = toX(r, me.x);
    const py = toY(r, me.y);
    const t = m.leaving ? Math.min(1, m.wave / 0.7) : 0;

    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.beginPath();
    ctx.ellipse(px, py, z * 0.2, z * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();

    // Their owner's colour, so three small white characters are never
    // ambiguous about which side they are running for — and so two squads on
    // the field at once stay told apart.
    const own = ownerColour(m.owner) || "#8fd8ff";

    if (m.owner && !m.leaving) {
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.2 * Math.sin(g.time * 5 + px);
      ctx.strokeStyle = own;
      ctx.lineWidth = Math.max(1.5, z * 0.05);
      ctx.beginPath();
      ctx.ellipse(px, py, z * 0.26, z * 0.09, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const s = Math.max(0, 1 - t * t);
    const mw = me.w * z * 1.2;
    const mh = me.h * z * 1.25;

    // The owner's colour, traced right around them, at full strength — white
    // while they are still standing about waiting to be collected. Three
    // small WHITE characters with no outline, against a sky and a cloud, was
    // the worst of the lot.
    if (!m.leaving && s > 0.05) {
      const ring = m.owner ? own : "#ffffff";
      const pose = poseOf(me);
      stampOutline(r, ctx, ring, px, py, mw * s, mh * s, z * 0.055, (b, bx, by) => {
        charById("bubu").draw(b, bx, by, mw * s, mh * s, pose);
        drawCap(b, bx, by, mw * s, mh * s, me.face);
      });
    }

    ctx.translate(px, py);
    ctx.scale(s, s);
    charById("bubu").draw(ctx, 0, 0, mw, mh, poseOf(me));
    drawCap(ctx, 0, 0, mw, mh, me.face);
    ctx.restore();

    if (m.leaving && t < 1) {
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.fillStyle = ownerColour(m.owner) || "#cdeeff";
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const rr = z * (0.15 + t * 0.8);
        ctx.beginPath();
        ctx.arc(px + Math.cos(a) * rr, py - z * 0.3 + Math.sin(a) * rr * 0.6, z * 0.09 * (1 - t), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

/**
 * The fist.
 *
 * Drawn from the player's own colour so you can tell whose punch is in the
 * air, and it lags behind the wind-up and snaps out — the arc is what sells
 * that the dangerous part is brief.
 */
function drawPunch(r, ctx, g, a) {
  if (!a.punch || a.dead) return;
  const def = POWERUPS.suntok;
  const ms = (g.time - a.punch.at) * 1000;
  const total = def.windupMs + def.activeMs;
  // The connection ring outlives the swing, so the whole draw has to stay
  // alive for it — cutting at the swing's end clipped it a third of the way.
  if (ms > total + Math.max(90, def.blastMs)) return;
  const z = r.cam.zoom;

  // -0.35 tiles at full wind-up, out to `reach` and then back.
  let ext;
  if (ms < def.windupMs) ext = -0.35 * (ms / def.windupMs);
  else {
    const t = Math.min(1, (ms - def.windupMs) / def.activeMs);
    ext = -0.35 + (def.reach + 0.35) * (1 - Math.pow(1 - t, 3));
  }
  const live = ms >= def.windupMs && ms < total;

  const px = toX(r, a.x + a.punch.face * (a.w / 2 + ext * 0.72));
  const py = toY(r, a.y - a.h * 0.55);

  ctx.save();

  // The blast the fist actually carries. Drawn while the punch is live so you
  // can SEE the reach you are aiming with — the hitbox used to be invisible
  // and the size of a fist, so a miss never explained itself.
  if (live) {
    const t = Math.min(1, (ms - def.windupMs) / def.activeMs);
    const rad = z * def.blastRadius * (0.45 + t * 0.55);
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.3;
    const wave = ctx.createRadialGradient(px, py, rad * 0.35, px, py, rad);
    wave.addColorStop(0, "rgba(255,255,255,0)");
    wave.addColorStop(0.72, `${def.colour}`);
    wave.addColorStop(1, "rgba(255,120,80,0)");
    ctx.fillStyle = wave;
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = (1 - t) * 0.85;
    ctx.strokeStyle = "rgba(255,240,220,0.9)";
    ctx.lineWidth = Math.max(1.5, z * 0.045 * (1 - t));
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // The bigger ring that fires on a CONNECTION, outliving the swing itself.
  if (a.punch.blastAt != null) {
    const bt = (g.time - a.punch.blastAt) / (def.blastMs / 1000);
    if (bt >= 0 && bt < 1) {
      const rad = z * def.blastRadius * (0.3 + backOut(bt) * 1.15);
      ctx.save();
      ctx.globalAlpha = (1 - bt) * 0.9;
      ctx.strokeStyle = "#fff3e0";
      ctx.lineWidth = Math.max(2, z * 0.11 * (1 - bt));
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = (1 - bt) * 0.55;
      ctx.strokeStyle = def.colour;
      ctx.lineWidth = Math.max(1.5, z * 0.2 * (1 - bt));
      ctx.beginPath();
      ctx.arc(px, py, rad * 0.82, 0, Math.PI * 2);
      ctx.stroke();
      // Spokes, so the ring reads as force rather than as a bubble.
      ctx.globalAlpha = (1 - bt) * 0.7;
      ctx.lineWidth = Math.max(1.5, z * 0.05);
      ctx.lineCap = "round";
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2 + bt * 0.6;
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(ang) * rad * 0.95, py + Math.sin(ang) * rad * 0.95);
        ctx.lineTo(px + Math.cos(ang) * rad * (1.18 + bt * 0.25),
                   py + Math.sin(ang) * rad * (1.18 + bt * 0.25));
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  if (live) {
    // A short speed streak back toward the shoulder.
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = lighten(def.colour, 0.4);
    ctx.lineWidth = z * 0.16;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(px - a.punch.face * z * 0.7, py);
    ctx.lineTo(px, py);
    ctx.stroke();
  }
  ctx.globalAlpha = live ? 1 : 0.75;
  ctx.fillStyle = live ? lighten(def.colour, 0.2) : def.colour;
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = Math.max(1.5, z * 0.05);
  ctx.beginPath();
  ctx.arc(px, py, z * (live ? 0.3 : 0.22), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawBursts(r, ctx, g) {
  if (!g.bursts) return;
  const z = r.cam.zoom;
  for (const b of g.bursts) {
    const t = (g.time - b.at) / 0.55;
    if (t >= 1) continue;
    const px = toX(r, b.x);
    const py = toY(r, b.y);
    const e = 1 - Math.pow(1 - t, 3);

    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.85;
    ctx.strokeStyle = lighten(b.colour, 0.3);
    ctx.lineWidth = Math.max(2, z * 0.11 * (1 - t));
    ctx.beginPath();
    ctx.arc(px, py, z * (0.3 + e * (b.big ? 2.4 : 1.5)), 0, Math.PI * 2);
    ctx.stroke();

    const shards = b.big ? 14 : 7;
    for (let i = 0; i < shards; i++) {
      const a = (i / shards) * Math.PI * 2 + b.at;
      const d = z * (0.4 + e * (b.big ? 2.8 : 1.7));
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.fillStyle = lighten(b.colour, 0.45);
      ctx.beginPath();
      ctx.arc(px + Math.cos(a) * d, py + Math.sin(a) * d * 0.8, z * (b.big ? 0.13 : 0.09) * (1 - t), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/**
 * A hard outline traced around a character's actual silhouette.
 *
 * This replaced a soft radial halo behind each owned helper and mini Bubu.
 * A gradient at 40% alpha over a bright sky is almost invisible, and over a
 * dark platform it reads as a smudge — so the one thing it existed to say,
 * "these three are HERS", was the thing it said worst.
 *
 * Done by stamping the figure into a scratch canvas, flattening it to a solid
 * colour with `source-in`, and blitting that ring of copies around the real
 * one. Stroking a path would not work: these are sprites and hand-drawn
 * composites, and neither has a path to stroke.
 */
function stampOutline(r, ctx, colour, cx, cy, w, h, thick, drawInto) {
  const px = Math.max(1.5, thick);
  /* The buffer is sized well past the box it is given, in both directions.
   *
   * `w` and `h` are the actor's nominal size, and a character is routinely
   * bigger than that: Yhon Yhon's body width is derived from his HEIGHT and
   * his squash, so at full stretch he is nearly twice `w` across and was
   * being clipped at both sides — which showed up as an outline that simply
   * stopped on his left and right. Ears, arms and an airborne lean reach past
   * the top too. Cheaper to hand it room than to work out the exact extent of
   * an arbitrary draw callback.
   */
  const padX = Math.ceil(px) + Math.ceil(w * 0.6) + 2;
  const padY = Math.ceil(px) + Math.ceil(h * 0.25) + 2;
  const cw = Math.ceil(w) + padX * 2;
  const ch = Math.ceil(h) + padY * 2;
  if (cw <= 0 || ch <= 0 || cw > 2048 || ch > 2048) return;

  const buf = r.outline || (r.outline = document.createElement("canvas"));
  if (buf.width < cw || buf.height < ch) {
    buf.width = Math.max(buf.width, cw);
    buf.height = Math.max(buf.height, ch);
  }
  const b = buf.getContext("2d", { willReadFrequently: true });
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.clearRect(0, 0, cw, ch);
  b.save();
  drawInto(b, padX + w / 2, padY + h);
  b.restore();

  // Flatten whatever was drawn to one solid colour, keeping only its alpha.
  b.globalCompositeOperation = "source-in";
  b.fillStyle = colour;
  b.fillRect(0, 0, cw, ch);
  b.globalCompositeOperation = "source-over";

  /* And then HARDEN that alpha — on the GPU.
   *
   * `source-in` keeps the source's alpha, which is right for a sprite — Bubu
   * and Dudu have hard edges and traced cleanly. Yhon Yhon is vector curves,
   * so his edge is a band of half-transparent pixels, and stamping that
   * around a circle accumulates into a swollen halo rather than a rim.
   *
   * This used to be getImageData / putImageData, which is correct and is a
   * GPU-to-CPU readback: a pipeline stall, once per outlined actor, every
   * frame. Barely measurable on a laptop and brutal on a phone — six of them
   * a frame is most of why the game ran rough on the guest's handset.
   *
   * Drawing the buffer onto itself does the same job without leaving the GPU.
   * Each pass takes alpha a to 1-(1-a)^2, so a half-covered edge pixel goes
   * 0.5 -> 0.75 -> 0.94 -> 0.996 and a faint one still climbs out of the
   * range where stacking it would read as a smudge.
   */
  for (let i = 0; i < 3; i++) b.drawImage(buf, 0, 0, cw, ch, 0, 0, cw, ch);

  const ox = cx - (padX + w / 2);
  const oy = cy - (padY + h);
  // Sixteen, not ten: at ten the ring is a decagon, and on a shape with fine
  // detail the flat sides of it show as lumps.
  const N = 16;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    ctx.drawImage(buf, 0, 0, cw, ch,
      ox + Math.cos(a) * px, oy + Math.sin(a) * px, cw, ch);
  }
}

/** Dudu: wandering while unclaimed, hunting once someone has reached him. */
/**
 * The colour of whoever owns a helper, for the glow under it.
 *
 * With both players able to have a Dudu and a squad of Bubus at once, an
 * identical warm halo on all of them means you cannot tell at a glance whose
 * three white Bubus are running at you. The owner's own colour answers it
 * without a label.
 */
function ownerColour(id) {
  const p = PLAYERS.find((x) => x.id === id);
  return p ? p.colour : null;
}

// How long Dudu's exit takes, matched to the `h.wave > 1.2` in screen.js.
const LEAVE_SEC = 1.2;

/**
 * The betrayal.
 *
 * He is drawn as ordinary Dudu right up to the moment he has hold of you —
 * there is nothing to spot beforehand, by design. The reveal is the whole
 * show: he shudders, the warm glow goes cold, and he crossfades to purple
 * while the victim hangs off the ground in front of him.
 */
function drawBetrayal(r, ctx, g, h) {
  const me = h.actor;
  const z = r.cam.zoom;
  const px = toX(r, me.x);
  const py = toY(r, me.y);
  const ms = (g.time - h.betrayAt) * 1000;
  const leave = h.leaving ? Math.min(1, h.wave / LEAVE_SEC) : 0;

  // 0 through the grab, 1 once he is fully purple.
  const turn = Math.min(1, ms / BAD_HELPER.transformMs);
  const winding = !h.thrown && ms >= BAD_HELPER.transformMs;

  ctx.save();
  ctx.globalAlpha = 1 - leave;

  const glow = ctx.createRadialGradient(px, py - z * 0.5, 0, px, py - z * 0.5, z * 1.7);
  glow.addColorStop(0, `rgba(${Math.round(255 - 105 * turn)},${Math.round(208 - 118 * turn)},${Math.round(140 + 95 * turn)},${0.45 + 0.2 * turn})`);
  glow.addColorStop(1, "rgba(150,90,235,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(px - z * 1.7, py - z * 2.2, z * 3.4, z * 3.4);

  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(px, py, z * 0.34, z * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // The shudder: a hard shake that dies as the colour settles.
  const shudder = turn < 1 ? Math.sin(ms * 0.09) * z * 0.09 * (1 - turn) : 0;
  const s = Math.max(0, 1 - leave * leave);
  ctx.save();
  ctx.translate(px + shudder, py);
  ctx.scale(s, s);
  const pose = poseOf(me);
  // Crossfade rather than swap, so you see him turn rather than blink.
  if (turn < 1) charById("dudu").draw(ctx, 0, 0, me.w * z * 1.25, me.h * z * 1.32, pose);
  ctx.globalAlpha = turn;
  charById("badudu").draw(ctx, 0, 0, me.w * z * 1.3, me.h * z * 1.36, pose);
  ctx.restore();

  // Loading up: rings pulling inward toward the fist.
  if (winding) {
    const t = (ms - BAD_HELPER.transformMs) / BAD_HELPER.holdMs;
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const k = ((t * 1.6 + i / 3) % 1);
      ctx.globalAlpha = (1 - k) * 0.55;
      ctx.strokeStyle = "#c86bff";
      ctx.lineWidth = Math.max(2, z * 0.07);
      ctx.beginPath();
      ctx.arc(px, py - me.h * z * 0.7, z * (0.3 + (1 - k) * 1.5), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.font = `700 ${Math.max(10, z * 0.3)}px "Nunito", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = Math.max(2, z * 0.05);
  const tag = h.leaving ? "bye!" : turn < 1 ? "?!" : "Bad Dudu";
  ctx.fillStyle = turn < 1 ? "#c97d22" : "#7b3fd4";
  const tagY = py - me.h * z * 1.72;
  ctx.strokeText(tag, px, tagY);
  ctx.fillText(tag, px, tagY);

  ctx.restore();
}

function drawHelper(r, ctx, g) {
  // A list, because a bought Dudu no longer deletes the wild one.
  for (const h of g.helpers || []) drawOneHelper(r, ctx, g, h);
}

function drawOneHelper(r, ctx, g, h) {
  if (!h || !h.actor) return;
  if (h.bad) return drawBetrayal(r, ctx, g, h);
  const me = h.actor;
  const z = r.cam.zoom;
  const px = toX(r, me.x);
  const py = toY(r, me.y);
  const ally = h.ally ? g.actors.find((a) => a.id === h.ally) : null;
  const target = ally ? g.actors.find((a) => a.id !== h.ally) : null;
  const onSide = !!(ally && target && !h.leaving);
  const hunting = onSide && h.locked;

  // While hunting, a line to his QUARRY rather than to his ally — what you
  // want to see is who is about to get landed on.
  if (hunting && !target.dead) {
    ctx.save();
    ctx.globalAlpha = 0.22 + 0.1 * Math.sin(g.time * 8);
    ctx.strokeStyle = "#ff5d73";
    ctx.lineWidth = Math.max(2, z * 0.055);
    ctx.setLineDash([z * 0.16, z * 0.18]);
    ctx.lineDashOffset = -g.time * z * 4;
    ctx.beginPath();
    ctx.moveTo(px, py - z * 0.5);
    ctx.lineTo(toX(r, target.x), toY(r, target.y) - z * 0.5);
    ctx.stroke();
    ctx.restore();
  }

  // Unclaimed he is warm and neutral; once he belongs to someone he wears
  // their colour, and goes red only in the moment he commits to a kill.
  const own = ownerColour(h.ally);

  // A ring on the floor in the owner's colour. The outline around him is the
  // headline; this is what still reads when he is behind a platform.
  if (own && !h.leaving) {
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.2 * Math.sin(g.time * 4);
    ctx.strokeStyle = own;
    ctx.lineWidth = Math.max(2, z * 0.07);
    ctx.beginPath();
    ctx.ellipse(px, py, z * 0.5, z * 0.16, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Leaving is an exit, not a cut. He crouches, springs, spins up out of
  // frame and pops — so the moment his fifteen seconds are up reads as
  // something he did, rather than the character simply being unloaded.
  const leaveT = h.leaving ? Math.min(1, h.wave / LEAVE_SEC) : 0;

  ctx.save();
  ctx.globalAlpha = 1 - leaveT;
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.beginPath();
  ctx.ellipse(px, py, z * 0.34, z * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  let leaveLift = 0;
  if (h.leaving) {
    const t = leaveT;
    // 0 → 0.2 is the wind-up; the rest is the launch.
    const crouch = t < 0.2 ? Math.sin((t / 0.2) * Math.PI) : 0;
    const launch = t < 0.2 ? 0 : (t - 0.2) / 0.8;
    leaveLift = Math.sin(Math.min(1, launch) * Math.PI * 0.5) * z * 2.8;
    const scale = Math.max(0, 1 - Math.pow(launch, 1.7));

    ctx.save();
    ctx.translate(px, py - leaveLift);
    ctx.rotate(launch * launch * 5.6 * me.face);
    ctx.scale(scale, scale);
    ctx.globalAlpha = Math.max(0, 1 - Math.pow(launch, 2.3));
    charById("dudu").draw(ctx, 0, 0, me.w * z * 1.25, me.h * z * 1.32, {
      face: me.face,
      run: 0,
      air: launch > 0 ? -1 : 0,
      rise: 1 - launch,
      squash: crouch * 0.32,
      t: g.time,
      walk: 0,
      stride: 1,
    });
    ctx.restore();

    // The puff he leaves behind, expanding and thinning from where he stood.
    const p = (t - 0.18) / 0.55;
    if (p > 0 && p < 1) {
      ctx.save();
      ctx.globalAlpha = (1 - p) * 0.85;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + t * 1.8;
        const rr = z * (0.2 + p * 1.25);
        ctx.fillStyle = i % 3 === 0 ? "#ffd06a" : "#fff6e2";
        ctx.beginPath();
        ctx.arc(
          px + Math.cos(a) * rr,
          py - z * 0.45 + Math.sin(a) * rr * 0.62,
          z * (0.03 + 0.12 * (1 - p)),
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      ctx.restore();
    }
  } else {
    const dw = me.w * z * 1.25;
    const dh = me.h * z * 1.32;
    /* Whose he is, traced right around him. Red while he is committed to a
     * kill, because at that moment the useful information is not "he is hers"
     * but "he is coming for you" — and WHITE while he belongs to nobody,
     * which is most of the time he is on screen. He had no outline at all
     * then, so the one moment he is worth running at was the one moment he
     * was hardest to pick out of the arena. */
    const ring = hunting ? "#ff5d73" : own || "#ffffff";
    if (ring && !h.leaving) {
      const pose = poseOf(me);
      stampOutline(r, ctx, ring, px, py, dw, dh, z * 0.06,
        (b, bx, by) => charById("dudu").draw(b, bx, by, dw, dh, pose));
    }
    charById("dudu").draw(ctx, px, py, dw, dh, poseOf(me));
  }

  // How long he has left, as a ring over his head — a countdown you can read
  // without taking your eyes off the chase.
  if (onSide) {
    const left = Math.max(0, h.until - g.time);
    const frac = left / (15);
    ctx.save();
    ctx.lineWidth = Math.max(2.5, z * 0.09);
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath();
    ctx.arc(px, py - me.h * z * 1.62, z * 0.3, 0, Math.PI * 2);
    ctx.stroke();
    // While he is waiting out an immunity his clock is stopped, so the ring
    // stops with it — and goes cool and pulsing to say the pause is deliberate.
    ctx.strokeStyle = h.waiting
      ? `rgba(150, 220, 255, ${0.6 + 0.35 * Math.sin(g.time * 6)})`
      : left < 4
        ? "#ff5d73"
        : "#ffd06a";
    ctx.beginPath();
    ctx.arc(px, py - me.h * z * 1.62, z * 0.3, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.font = `700 ${Math.max(10, z * 0.28)}px "Nunito", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = Math.max(2, z * 0.05);
  const tag = h.leaving ? "bye!" : hunting ? "!" : "Dudu";
  ctx.fillStyle = hunting ? "#e0483f" : own || "#c97d22";
  const tagY = py - me.h * z * (onSide ? 2.15 : 1.55) - leaveLift;
  ctx.save();
  if (h.leaving) ctx.globalAlpha = Math.max(0, 1 - leaveT * 1.5);
  ctx.strokeText(tag, px, tagY);
  ctx.fillText(tag, px, tagY);
  ctx.restore();

  // Unclaimed: a bobbing marker so you know he is worth running to.
  if (!ally && !h.leaving) {
    const b = Math.sin(g.time * 4) * z * 0.1;
    ctx.fillStyle = "#ffd06a";
    ctx.beginPath();
    ctx.arc(px, py - z * 2.0 + b, z * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = Math.max(1.5, z * 0.045);
    ctx.stroke();
  }
}

/* The gun.
 *
 * It was a green dot with a green smear behind it, and it read as a pea being
 * flicked. A gun going off is four things and only one of them is the bullet:
 * the flash at the barrel, the smoke it leaves hanging there, the case coming
 * out of the side, and the tracer. All four are worked out from the bullet's
 * own birth time and speed, so nothing extra crosses the wire and the two
 * phones cannot disagree about them.
 */
const FLASH_MS = 0.075;     // how long the barrel is lit
const SMOKE_MS = 0.55;      // and how long the smoke hangs
const CASE_MS = 0.6;

function drawShots(r, ctx, g) {
  if (!g.shots) return;
  const z = r.cam.zoom;
  for (const b of g.shots) {
    const px = toX(r, b.x);
    const py = toY(r, b.y);
    const rad = SHOT_RADIUS * z;
    const dir = Math.sign(b.vx) || 1;
    const age = b.born === undefined ? 99 : Math.max(0, g.time - b.born);
    // Where it went off. vy is zero and nothing pulls on a bullet, so the
    // muzzle is simply back along the line it has travelled.
    const mx = toX(r, b.x - b.vx * age);
    const my = py;

    ctx.save();

    /* The muzzle flash: a hot four-point star, long down the barrel and short
     * across it, over a white core. Drawn first so the smoke sits on top of
     * it as it dies. */
    if (age < FLASH_MS) {
      const k = 1 - age / FLASH_MS;
      const len = z * (0.55 + k * 0.85);
      const fat = z * (0.16 + k * 0.3);
      ctx.globalAlpha = 0.45 + k * 0.55;
      const fl = ctx.createRadialGradient(mx, my, 0, mx, my, len);
      fl.addColorStop(0, "rgba(255,255,255,0.95)");
      fl.addColorStop(0.35, "rgba(255,226,120,0.8)");
      fl.addColorStop(1, "rgba(255,150,40,0)");
      ctx.fillStyle = fl;
      ctx.beginPath();
      ctx.ellipse(mx + dir * len * 0.35, my, len, fat * 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
      // the star, pointing the way the shot went
      ctx.fillStyle = "rgba(255,248,214,0.95)";
      ctx.beginPath();
      ctx.moveTo(mx + dir * len * 1.15, my);
      ctx.lineTo(mx, my - fat);
      ctx.lineTo(mx - dir * len * 0.3, my);
      ctx.lineTo(mx, my + fat);
      ctx.closePath();
      ctx.fill();
    }

    /* Smoke, drifting up and back off the barrel and spreading as it goes.
     *
     * White, and not pale grey. The arena is a pale blue sky over pale green
     * hills, and the first version was #dfe9f2 at a fifth opacity — which is
     * the colour of the sky at the opacity of nothing. It was drawing
     * perfectly and could not be seen. */
    if (age < SMOKE_MS) {
      const k = age / SMOKE_MS;
      for (let i = 0; i < 4; i++) {
        const lag = i * 0.11;
        const kk = Math.max(0, k - lag);
        if (kk <= 0) continue;
        ctx.globalAlpha = Math.max(0, 1 - k) * 0.85;
        const cx2 = mx + dir * z * (0.22 + kk * 0.55) - dir * i * z * 0.12;
        const cy2 = my - z * (0.12 + kk * 1.25) - i * z * 0.06;
        const rr = z * (0.13 + kk * 0.5 + i * 0.03);
        /* Grey, with a hot core — not white. Half the sky has a white cloud
         * in it, and white smoke on a white cloud is nothing at all. */
        const pf = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, rr);
        pf.addColorStop(0, "rgba(255,250,240,0.95)");
        pf.addColorStop(0.45, "rgba(176,188,204,0.85)");
        pf.addColorStop(1, "rgba(150,166,188,0)");
        ctx.fillStyle = pf;
        ctx.beginPath();
        ctx.arc(cx2, cy2, rr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /* The case, thrown up and back out of the breech and tumbling. */
    if (age < CASE_MS) {
      const k = age / CASE_MS;
      // Up and well clear of their own head, or it spends its whole life
      // behind the character that ejected it.
      const cx2 = mx - dir * z * (0.2 + k * 1.1);
      const cy2 = my - z * (6.2 * k - 7.6 * k * k);
      ctx.globalAlpha = Math.max(0, 1 - k * 1.3);
      ctx.save();
      ctx.translate(cx2, cy2);
      ctx.rotate(k * 14 * dir);
      ctx.fillStyle = "#e8a92f";
      ctx.fillRect(-z * 0.12, -z * 0.065, z * 0.24, z * 0.13);
      ctx.fillStyle = "#ffe08a";
      ctx.fillRect(-z * 0.12, -z * 0.065, z * 0.24, z * 0.05);
      ctx.restore();
    }

    /* The tracer: a hot line from the muzzle to the bullet on the first few
     * frames, then just the streak that follows it. */
    ctx.globalAlpha = 1;
    if (age < 0.05) {
      const tr = ctx.createLinearGradient(mx, my, px, py);
      tr.addColorStop(0, "rgba(255,230,140,0)");
      tr.addColorStop(1, "rgba(255,244,196,0.85)");
      ctx.strokeStyle = tr;
      ctx.lineWidth = rad * 0.9;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(px, py);
      ctx.stroke();
    }

    // The streak behind it, hot at the bullet and gone a tile back.
    const tail = dir * rad * 4.6;
    const grd = ctx.createLinearGradient(px - tail, py, px, py);
    grd.addColorStop(0, "rgba(255,168,60,0)");
    grd.addColorStop(0.65, "rgba(255,196,86,0.5)");
    grd.addColorStop(1, "rgba(255,238,170,0.9)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(px - tail, py);
    ctx.lineTo(px, py - rad * 0.8);
    ctx.lineTo(px, py + rad * 0.8);
    ctx.closePath();
    ctx.fill();

    // ...and the round itself: a white core in a warm halo.
    const glow = ctx.createRadialGradient(px, py, 0, px, py, rad * 2.6);
    glow.addColorStop(0, "rgba(255,240,180,0.9)");
    glow.addColorStop(1, "rgba(255,170,60,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(px, py, rad * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fffdf2";
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

/**
 * A heart, about as wide as it is tall.
 *
 * Drawn from the top dip down each side to the point, rather than from the
 * point outwards. The first version put its control points wider than the
 * shape was tall, which squashed it into a flat blob.
 */
/**
 * A cut gem: a flat table across the top, two shoulders, and a point.
 *
 * Not a rhombus — four equal sides read as a playing-card suit rather than as
 * something you pick up. The flat top is what makes it a gem, and it gives
 * the shine somewhere to sit.
 */
function gemPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x - s * 0.58, y - s * 0.52);   // table, left
  ctx.lineTo(x + s * 0.58, y - s * 0.52);   // table, right
  ctx.lineTo(x + s * 0.98, y - s * 0.02);   // right shoulder
  ctx.lineTo(x, y + s * 0.98);              // point
  ctx.lineTo(x - s * 0.98, y - s * 0.02);   // left shoulder
  ctx.closePath();
}

function heartPath(ctx, x, y, s) {
  // Wider than tall. The first attempt was a flat blob, the second over-
  // corrected into something narrow and upright; this sits between them.
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.32);
  ctx.bezierCurveTo(x - s * 0.74, y - s * 1.06, x - s * 1.44, y - s * 0.02, x, y + s * 0.84);
  ctx.bezierCurveTo(x + s * 1.44, y - s * 0.02, x + s * 0.74, y - s * 1.06, x, y - s * 0.32);
  ctx.closePath();
}

/**
 * Health drawn over the character's own head rather than in a corner.
 *
 * In a two-player game on one screen the corners are the furthest thing from
 * where you are looking — your eyes are on your own character. Here it costs
 * nothing to read, and you can see the other one's health at the same time.
 */
function drawHearts(r, ctx, g, a, cx, cy) {
  const z = r.cam.zoom;
  // The bar grows only when you are carrying spares. Drawing all five slots
  // all the time would mean a healthy player permanently looks two down.
  const max = Math.max(FEEL.hp, Math.ceil(a.hp));
  const s = z * 0.19;
  const gap = s * 2.65;
  // Just hit: the hearts jump so the loss is noticed.
  const hurt = a.invulnUntil && g.time < a.invulnUntil;
  const kick = hurt ? 1 + 0.22 * Math.abs(Math.sin(g.time * 18)) : 1;

  /* Two rows: the three you start with, and the spares UNDER them.
   *
   * One row that simply grew put a five-heart bar wider than the character it
   * belongs to, hanging off one side — and with the fairy riding the other
   * shoulder there was nowhere for it to go. Rows of three stay the width of
   * the body however well the round is going, and the gold ones read as
   * something extra rather than as more of the same. The card in the panel
   * does exactly this, for the same reason. */
  const rows = [Math.min(FEEL.hp, max), Math.max(0, max - FEEL.hp)];
  const rowGap = s * 2.5;
  /* The whole block is LIFTED when there are two rows, so the bottom one
   * stays where the single row always sat. Growing downward instead would
   * walk the gold hearts straight onto the character's head — which is the
   * one thing over-head hearts must never do, because the head is what you
   * are actually looking at. */
  const lift = rows[1] ? rowGap : 0;
  for (let row = 0, i = 0; row < rows.length; row++) {
    const n = rows[row];
    if (!n) continue;
    const total = (n - 1) * gap;
    const y = cy - lift + row * rowGap;
    for (let k = 0; k < n; k++, i++) drawOneHeart(i, cx - total / 2 + k * gap, y);
  }

  function drawOneHeart(i, x, cy) {
    /* How much of THIS heart is left, 0 to 1.
     *
     * It used to be the boolean `i < a.hp`, which was right while damage
     * came in whole hearts. The mini squad takes half now, and under the old
     * test 2.5 health drew as three full hearts — the hit simply did not
     * appear, which is the worst possible way for a nerf to land. */
    const fill = Math.max(0, Math.min(1, a.hp - i));
    const full = fill >= 1;
    // Anything past the three you start with is a spare, and is gold — so a
    // glance says "she has one in hand" rather than just "she is fine".
    const bonus = i >= FEEL.hp;
    const sz = s * (full ? kick : 1);
    ctx.save();
    if (bonus) {
      ctx.shadowColor = "rgba(255,196,60,0.9)";
      ctx.shadowBlur = z * 0.22;
    }
    // The empty shell first, then however much of it is still there clipped
    // over the top — a half heart is the left half coloured in, the way every
    // game that has ever had one draws it.
    heartPath(ctx, x, cy, sz);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fill();
    if (fill > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - sz * 1.6, cy - sz * 1.6, sz * 3.2 * fill, sz * 3.2);
      ctx.clip();
      heartPath(ctx, x, cy, sz);
      // Flat fill, thin white edge. A gradient and a shine on something this
      // small just reads as noise, and a dark outline turns it muddy.
      ctx.fillStyle = bonus ? "#ffc43c" : "#ff4d6d";
      ctx.fill();
      ctx.restore();
    }
    heartPath(ctx, x, cy, sz);
    ctx.lineWidth = Math.max(1.2, z * 0.035);
    // An empty heart outlined in white disappears the moment it drifts over a
    // cloud, so it gets a cool edge instead; a full one is red enough to keep
    // the white.
    ctx.strokeStyle = fill > 0 ? "rgba(255,255,255,0.9)" : "rgba(92,128,158,0.65)";
    ctx.shadowBlur = 0;
    ctx.stroke();
    ctx.restore();
  }
}

/* How long the knocked-out body stays on screen, in game seconds.
 *
 * Game seconds, so the match-winning blow — which runs at a sixth speed —
 * plays this out over several real ones while the camera drives in. That is
 * the whole point of keeping the body: the kill cam used to arrive at an
 * empty patch of ground, because the character it was diving onto had been
 * deleted on the frame it started. */
const DEFEAT_SEC = 1.15;
// Light gravity on purpose: at the real 26 the body arced straight back down
// and sank through the floor, which reads as falling over rather than as
// being knocked out of the round. This one goes UP and away and fades near
// the top of its arc.
const DEFEAT_GRAVITY = 10;

function drawActor(r, ctx, g, a) {
  if (a.dead) {
    const d = a.defeat;
    const age = d ? g.time - d.at : 99;
    if (!d || age > DEFEAT_SEC || age < 0) return;

    const z = r.cam.zoom;
    const t = age / DEFEAT_SEC;
    // Thrown away from whoever did it, arcing, and tumbling as it goes.
    const wx = d.x + d.vx * age;
    const wy = d.y + d.vy * age + 0.5 * DEFEAT_GRAVITY * age * age;
    const px = toX(r, wx);
    const py = toY(r, wy);
    const cw = a.w * z * 1.25;
    const chh = a.h * z * 1.32;

    ctx.save();
    // Solid almost all the way, then goes. Fading from the first frame reads
    // as "never really there" rather than as being knocked out of the round.
    ctx.globalAlpha = Math.max(0, 1 - Math.pow(t, 3));
    ctx.translate(px, py - chh * 0.5);
    ctx.rotate(d.spin * age * 0.5);
    // Squashed flat on the first beat — the hit landing — then springing back
    // out as it flies. A lethal one (the Suntok) is flattened harder.
    const hit = Math.max(0, 1 - age * 6);
    const squash = hit * (d.lethal ? 0.55 : 0.34);
    ctx.scale(1 + squash, 1 - squash);

    const pose = {
      face: a.face || 1,
      run: 0,
      air: 1,
      rise: -1,
      squash: 0,
      t: g.time,
      walk: 0,
      stride: 1,
    };
    // Still wearing their own colour on the way out, so a glance at the
    // replay still says whose body that is.
    const mine = ownerColour(a.id);
    if (mine) {
      stampOutline(r, ctx, mine, 0, chh * 0.5, cw, chh, z * 0.045,
        (b, bx, by) => charById(a.char).draw(b, bx, by, cw, chh, pose));
    }
    charById(a.char).draw(ctx, 0, chh * 0.5, cw, chh, pose);
    ctx.restore();

    // A ring of dust punched out at the point of impact.
    if (age < 0.45) {
      const k = age / 0.45;
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.55;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(1.5, z * 0.07 * (1 - k));
      ctx.beginPath();
      ctx.ellipse(toX(r, d.x), toY(r, d.y), z * (0.3 + k * 1.5), z * (0.1 + k * 0.5), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    return;
  }
  const z = r.cam.zoom;
  /* The shoulder going back.
   *
   * Worked out from their own youngest bullet rather than from any state on
   * the character, because the bullet already carries the one thing this
   * needs — when it left — and it crosses the wire, so the kick lands on
   * both phones at the same moment. A tenth of a second, hard out and eased
   * back, which is the whole of it.
   */
  let kick = 0;
  if (g.shots && g.shots.length) {
    let newest = null;
    for (const b of g.shots) {
      if (b.owner !== a.id || b.born === undefined) continue;
      if (!newest || b.born > newest.born) newest = b;
    }
    if (newest) {
      const t = (g.time - newest.born) / 0.14;
      if (t >= 0 && t < 1) {
        kick = Math.sin((1 - t) * Math.PI * 0.5) * -Math.sign(newest.vx || 1);
      }
    }
  }
  /* `ox`/`oy` is the last correction, being given back over a tenth of a
   * second rather than all at once. It exists only here — the physics never
   * sees it, and it is zero on everybody but the player holding this phone.
   * See applyServer in sim.js. */
  const px = toX(r, a.x + (a.ox || 0)) + kick * z * 0.16;
  const py = toY(r, a.y + (a.oy || 0));

  // contact shadow
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.beginPath();
  ctx.ellipse(px, py, z * 0.34, z * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // A brief halo in the colour of whatever was just picked up, so the effect
  // lands ON the character and not only on the spot they took it from.
  if (a.glowUntil && g.time < a.glowUntil) {
    // The span has to come from whoever set the glow. It was hardcoded at
    // 0.45s while callers were asking for 0.3, 0.45 and 0.7 — and a glow
    // longer than the hardcoded span makes `t` negative, which makes the
    // radius below negative, which throws and takes the whole character off
    // screen for the duration. Clamped as well, so no caller can do it again.
    const span = a.glowFor || 0.45;
    const t = Math.max(0, Math.min(1, 1 - (a.glowUntil - g.time) / span));
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.75;
    const gl = ctx.createRadialGradient(px, py - a.h * z * 0.5, 0, px, py - a.h * z * 0.5, z * (1 + t * 1.2));
    gl.addColorStop(0, lighten(a.glowColour || "#ffffff", 0.45));
    gl.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gl;
    ctx.fillRect(px - z * 2.2, py - a.h * z - z * 2.2, z * 4.4, z * 4.4);
    ctx.restore();
  }

  // What you are carrying, drawn on you rather than in a corner of the HUD.
  if (a.power) {
    const def = POWERUPS[a.power.type];
    if (a.power.type === "bituin") {
      // handled below, by recolouring the character itself
    } else if (a.power.type === "bilis") {
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = def.colour;
      ctx.lineWidth = Math.max(2, z * 0.07);
      for (let i = 1; i <= 3; i++) {
        const back = -a.face * i * z * 0.3;
        ctx.globalAlpha = 0.34 / i;
        ctx.beginPath();
        ctx.moveTo(px + back, py - a.h * z * 1.05);
        ctx.lineTo(px + back, py - a.h * z * 0.2);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = 0.34;
      ctx.strokeStyle = def.colour;
      ctx.lineWidth = Math.max(3, z * 0.1);
      ctx.beginPath();
      ctx.ellipse(px, py - a.h * z * 0.6, a.w * z * 0.82, a.h * z * 0.7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Still untouchable after a hit. Worth being obvious about: without it you
  // cannot tell why a stomp did nothing, and you spend the grace period you
  // were given standing still instead of using it.
  const safe = a.invulnUntil && g.time < a.invulnUntil;
  if (safe) {
    const left = a.invulnUntil - g.time;
    const beat = Math.sin(g.time * 16);
    ctx.save();
    // a bubble, tightening as the grace runs out
    ctx.globalAlpha = 0.28 + 0.22 * beat;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(3, z * 0.12);
    ctx.beginPath();
    ctx.ellipse(px, py - a.h * z * 0.62, a.w * z * (1.15 - (1 - Math.min(1, left)) * 0.12),
      a.h * z * 0.95, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.16 + 0.12 * beat;
    ctx.fillStyle = "#cfefff";
    ctx.fill();
    // circling sparks, so it reads even against a white cloud
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 3; i++) {
      const ang = g.time * 5 + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(
        px + Math.cos(ang) * a.w * z * 1.15,
        py - a.h * z * 0.62 + Math.sin(ang) * a.h * z * 0.95,
        z * 0.08, 0, Math.PI * 2
      );
      ctx.fill();
    }
    ctx.restore();
  }

  /* The abilities, drawn ON the character rather than announced.
   *
   * None of them lasts long enough to read a label for — a dash is a sixth of
   * a second — so each one is a shape you recognise at a glance and never
   * have to think about: streaks behind a dash, a ring under a hop, a column
   * of pressure under a pound. */
  const ab = a.power ? null : ABILITY;
  if (ab) {
    // Dash: hard streaks trailing the way they came from.
    if (a.dashFor > 0) {
      const left = a.dashFor / (ABILITY.dash.ms / 1000);
      const back = -Math.sign(a.dashVx || a.face);
      ctx.save();
      ctx.globalAlpha = Math.min(1, left) * 0.75;
      ctx.strokeStyle = ABILITY.dash.colour;
      ctx.lineCap = "round";
      for (let i = 0; i < 4; i++) {
        const y = py - a.h * z * (0.25 + i * 0.28);
        ctx.lineWidth = Math.max(1.5, z * (0.09 - i * 0.015));
        ctx.beginPath();
        ctx.moveTo(px + back * z * (0.3 + i * 0.12), y);
        ctx.lineTo(px + back * z * (1.5 + i * 0.5), y);
        ctx.stroke();
      }
      ctx.restore();
    }
    // Pound: the column of air being shoved down ahead of him.
    if (a.pounding) {
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.25 * Math.abs(Math.sin(g.time * 26));
      const col = ctx.createLinearGradient(px, py, px, py + z * 2.4);
      col.addColorStop(0, ABILITY.pound.colour);
      col.addColorStop(1, "rgba(255,156,63,0)");
      ctx.fillStyle = col;
      ctx.fillRect(px - a.w * z * 0.5, py, a.w * z, z * 2.4);
      ctx.restore();
    }
    // Air Hop: a ring left behind at the height it was spent.
    if (a.hops && !a.grounded && a.abilityAt) {
      const age = g.time - a.abilityAt / 1000;
      if (age >= 0 && age < 0.4) {
        const k = age / 0.4;
        ctx.save();
        ctx.globalAlpha = (1 - k) * 0.8;
        ctx.strokeStyle = ABILITY.hop.colour;
        ctx.lineWidth = Math.max(1.5, z * 0.07 * (1 - k));
        ctx.beginPath();
        ctx.ellipse(px, py, z * (0.2 + k * 1.1), z * (0.07 + k * 0.34), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  const cw = a.w * z * 1.25;
  const chh = a.h * z * 1.32;
  const starred = a.power && a.power.type === "bituin";

  ctx.save();
  if (safe) ctx.globalAlpha = 0.55 + 0.35 * Math.abs(Math.sin(g.time * 13));

  /* Whose character this is, traced right around them.
   *
   * Dudu and the mini Bubus already wear their owner's colour, and on a
   * shared screen the players needed it more than the helpers do: two small
   * animals of similar size, and half the time you are looking at the one
   * that is about to land on you rather than the one you are driving. The
   * blue one is Charlie and the pink one is Karla, every round, whichever
   * character they picked.
   *
   * Under the character, not over it, so it is a rim and not a coat of paint.
   * The star skips it — it is already cycling through the whole spectrum and
   * an outline just muddies that.
   */
  const mine = ownerColour(a.id);
  if (mine && !starred && !a.dead) {
    const pose = poseOf(a);
    // Reversed turns the rim itself orange and makes it thicker, pulsing.
    // That marks the character without putting anything ON them — the wash
    // this replaced covered the face of a 40px animal, so the one thing you
    // still had to read, which way they were facing, went with it.
    const rev = a.reversedUntil && g.time < a.reversedUntil;
    let colour = mine;
    let thick = z * 0.045;
    if (rev) {
      const left = a.reversedUntil - g.time;
      if (left < 1.4) {
        // Nearly over: a hard BLINK between the reverse orange and their own
        // colour. Not a pulse — a pulse is what it does the rest of the time,
        // and the difference between "still on" and "about to end" has to be
        // visible at a glance rather than by comparing brightnesses.
        const on = Math.sin(g.time * 20) > 0;
        colour = on ? POWERUPS.baliktad.colour : mine;
        thick = z * (on ? 0.085 : 0.05);
      } else {
        const beat = 0.5 + 0.5 * Math.sin(g.time * 6.4);
        colour = mix(POWERUPS.baliktad.colour, [255, 255, 255], beat * 0.55, 1);
        thick = z * (0.075 + beat * 0.03);
      }
    }
    stampOutline(r, ctx, colour, px, py, cw, chh, thick,
      (b, bx, by) => charById(a.char).draw(b, bx, by, cw, chh, pose));
  }

  if (starred) {
    // Cycle the whole character through the spectrum, faster as it runs out.
    const left = a.power.until - g.time;
    const speed = left < 2.5 ? 900 : 480;
    const hue = (g.time * speed) % 360;

    /* A white rim, at full strength, and a white bloom behind it.
     *
     * The spectrum cycle says "something is happening to this character" and
     * says nothing about WHICH character, because for a third of every cycle
     * they are the colour of the sky and for another third the colour of the
     * dirt. The owner rim is deliberately skipped while starred — it muddies
     * the cycle — so there was nothing holding them off the background at
     * all. White is the one colour that cannot collide with a hue sweep, and
     * it reads as "untouchable" rather than as "belongs to Charlie".
     */
    const halo = ctx.createRadialGradient(
      px, py - chh * 0.45, chh * 0.1, px, py - chh * 0.45, chh * 0.95);
    halo.addColorStop(0, "rgba(255,255,255,0.55)");
    halo.addColorStop(0.55, "rgba(255,255,255,0.3)");
    halo.addColorStop(1, "rgba(255,255,255,0)");
    ctx.save();
    ctx.globalAlpha = 0.85 + 0.15 * Math.sin(g.time * 9);
    ctx.fillStyle = halo;
    ctx.fillRect(px - chh, py - chh * 1.5, chh * 2, chh * 2);
    ctx.restore();
    {
      const pose = poseOf(a);
      stampOutline(r, ctx, "#ffffff", px, py, cw, chh, z * 0.07,
        (b, bx, by) => charById(a.char).draw(b, bx, by, cw, chh, pose));
    }
    const buf = r.tint;
    const need = Math.ceil(Math.max(cw, chh) * 2.4);
    if (buf.width < need) {
      buf.width = need;
      buf.height = need;
    }
    const b = buf.getContext("2d");
    b.clearRect(0, 0, buf.width, buf.height);
    // feet planted near the bottom of the buffer, with room above for a
    // stretched jump pose
    const bx = buf.width / 2;
    const by = buf.height * 0.86;
    charById(a.char).draw(b, bx, by, cw, chh, poseOf(a));
    b.save();
    b.globalCompositeOperation = "source-atop";
    b.globalAlpha = 0.72;
    b.fillStyle = `hsl(${hue} 92% 60%)`;
    b.fillRect(0, 0, buf.width, buf.height);
    b.restore();
    ctx.drawImage(buf, px - bx, py - by);

    // and a couple of sparks trailing off them
    for (let i = 0; i < 4; i++) {
      const t = g.time * 3 + i * 1.7;
      const sx2 = px + Math.sin(t * 1.3 + i) * cw * 0.8;
      const sy2 = py - chh * (0.15 + ((t * 0.4 + i * 0.25) % 1) * 0.9);
      ctx.globalAlpha = 0.9 - ((t * 0.4 + i * 0.25) % 1) * 0.8;
      ctx.fillStyle = `hsl(${(hue + i * 60) % 360} 95% 70%)`;
      ctx.beginPath();
      ctx.arc(sx2, sy2, z * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    charById(a.char).draw(ctx, px, py, cw, chh, poseOf(a));
  }
  ctx.restore();

  // Frozen: encased, with the ice fading as it thaws.
  if (a.frozenUntil && g.time < a.frozenUntil) {
    const left = a.frozenUntil - g.time;
    ctx.save();
    ctx.globalAlpha = Math.min(0.82, left * 1.8);
    ctx.fillStyle = "#6fc9f0";
    ctx.strokeStyle = "#e6f8ff";
    ctx.lineWidth = Math.max(2, z * 0.06);
    ctx.beginPath();
    ctx.moveTo(px, py - a.h * z * 1.5);
    ctx.lineTo(px + a.w * z * 0.85, py - a.h * z * 0.95);
    ctx.lineTo(px + a.w * z * 0.68, py);
    ctx.lineTo(px - a.w * z * 0.68, py);
    ctx.lineTo(px - a.w * z * 0.85, py - a.h * z * 0.95);
    ctx.closePath();
    // Bubu is mostly white, so a pale frost over her reads as nothing. The
    // block is tinted hard enough to be obvious on any of the three.
    ctx.globalAlpha *= 0.8;
    ctx.fill();
    ctx.globalAlpha = Math.min(0.9, left * 1.8);
    ctx.stroke();
    ctx.restore();
  }

  /* Reversed.
   *
   * It is the only effect that makes your own controls lie to you, so the
   * player it lands on has to know instantly — but everything that said so
   * used to sit ON TOP of them: a wash across the body and a pair of arrows
   * through the middle, on a character about forty pixels tall. You could
   * see that SOMETHING was happening and no longer see who was facing where.
   *
   * So the character carries it in their own outline (above), and the
   * explaining happens up here in a badge that nothing else competes with.
   * The two arrows inside it slide past each other and swap ends, which is
   * the effect acted out rather than labelled.
   */
  if (a.reversedUntil && g.time < a.reversedUntil) {
    const left = a.reversedUntil - g.time;
    const RC = POWERUPS.baliktad.colour;
    const urgent = left < 1.2;

    /* Above the hearts (1.80), never under them — and not touching them.
     *
     * 2.2 put the bottom of this pill within two hundredths of a tile of the
     * top of the heart row, which on a phone is the same pixel: the badge
     * and the hearts read as one lump of clutter over the head rather than
     * as two things. This clears them by about a third of a tile. */
    const by = py - a.h * z * 2.62;
    const bw = z * 1.5;
    const bh = z * 0.52;

    ctx.save();
    ctx.translate(px, by);

    // The pill. No white border — the arrows inside are already white and the
    // outline only thickened the shape without adding anything to read.
    ctx.fillStyle = RC;
    roundRect(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2);
    ctx.fill();

    // The swap, playing out inside it. One arrow runs left-to-right along the
    // top, the other right-to-left along the bottom, and they change ends
    // together — two lanes, so they read as passing rather than colliding.
    const cycle = (g.time * 0.9) % 1;
    const travel = bw * 0.3;
    const aw = z * 0.17;
    ctx.save();
    roundRect(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2);
    ctx.clip();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = Math.max(1.6, z * 0.055);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const dir of [1, -1]) {
      // eased so they pause at each end rather than sliding at a constant rate
      const t = dir > 0 ? cycle : 1 - cycle;
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const ax = -travel + e * travel * 2;
      const ay = dir * bh * 0.2;
      ctx.beginPath();
      ctx.moveTo(ax - dir * aw, ay);
      ctx.lineTo(ax + dir * aw, ay);
      ctx.moveTo(ax + dir * aw * 0.35, ay - aw * 0.55);
      ctx.lineTo(ax + dir * aw, ay);
      ctx.lineTo(ax + dir * aw * 0.35, ay + aw * 0.55);
      ctx.stroke();
    }
    ctx.restore();

    // No bar. A draining sliver along the bottom of a pill the size of a
    // thumbnail is not something anyone reads mid-jump, and it made the badge
    // look like a loading indicator. The warning that it is nearly over is
    // the character blinking, which you cannot miss because you are already
    // looking at them.
    ctx.restore();
  }

  // Three things stack over a character's head, and the order is the whole
  // point: body, then bullets, then hearts. The pips used to sit at 1.12 —
  // the sprite reaches 1.32, so they were drawn ON him rather than above him.
  // These are the cleared heights.
  const AMMO_Y = 1.42;
  const HEART_Y = 1.80;

  // Ammo pips, so you know how many shots are left without a HUD readout.
  if (a.power && a.power.type === "baril") {
    const n = a.power.ammo;
    const w = z * 0.17;
    const h = z * 0.11;
    const y = py - a.h * z * AMMO_Y;
    ctx.save();
    // Outlined capsules rather than bare rectangles — a flat green tick on a
    // pale sky was hard to see and harder to count.
    ctx.lineWidth = Math.max(1, z * 0.028);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    for (let i = 0; i < n; i++) {
      const x = px - (n * w) / 2 + i * w + w * 0.14;
      ctx.fillStyle = POWERUPS.baril.colour;
      ctx.beginPath();
      ctx.roundRect(x, y, w * 0.72, h, h / 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  /* The crown, for whoever took King Yhon Yhon down.
   *
   * Drawn on the head rather than shown as a chip, because everything the
   * crown does happens in the world — they are enormous, they cannot be
   * touched, and the floor shakes when they land. A status pill at the
   * bottom of the screen is the wrong place to say any of that.
   */
  if (a.crownUntil && g.time < a.crownUntil) {
    const left = a.crownUntil - g.time;
    ctx.save();
    // A gold halo, so the size alone is not the only tell against a Big.
    ctx.globalCompositeOperation = "lighter";
    // Blinks out over the last second and a half, like every other timer here.
    ctx.globalAlpha = left < 1.5 ? 0.35 + 0.35 * Math.abs(Math.sin(g.time * 16)) : 0.55;
    const hal = ctx.createRadialGradient(px, py - a.h * z * 0.5, 0,
                                         px, py - a.h * z * 0.5, a.w * z * 0.9);
    hal.addColorStop(0, "rgba(255,226,122,0.5)");
    hal.addColorStop(1, "rgba(255,210,74,0)");
    ctx.fillStyle = hal;
    ctx.fillRect(px - a.w * z, py - a.h * z * 1.5, a.w * z * 2, a.h * z * 2);
    ctx.restore();
    ctx.save();
    if (left < 1.5) ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(g.time * 16));
    drawCrown(ctx, px, py - a.h * z, a.w * z * 0.44, z);
    ctx.restore();
  }

  // Hearts over the head, and nothing else. The name lives in the panel at
  // the bottom now — two labels for one character is one too many.
  // Lifted clear when there is a crown in the way.
  const crowned = a.crownUntil && g.time < a.crownUntil;
  const heartY = py - a.h * z * HEART_Y - (crowned ? a.w * z * 0.5 : 0);
  if (typeof a.hp === "number") drawHearts(r, ctx, g, a, px, heartY);
}


/* ------------------------------------------------------- the title scene --- */
//
// The lobby used to be a flat gradient with two QR cards on it. This puts the
// game itself behind them: the same sky, hills and clouds the arena uses, with
// Yhon Yhon, Bubu and Dudu wandering along a ridge underneath, hopping and
// turning round at the ends. It shares every drawing routine above, so the
// start screen and the game cannot drift apart.

const SCENE_GROUND = 15.2;

export function createScene(canvas) {
  return {
    canvas,
    ctx: canvas.getContext("2d"),
    w: 0,
    h: 0,
    t: 0,
    cam: { x: 24, y: 12.4, zoom: 46 },
    clouds: Array.from({ length: 10 }, (_, i) => {
      const far = i < 5;
      return {
        x: Math.random() * 60,
        y: far ? Math.random() * 0.55 : 0.3 + Math.random() * 0.7,
        s: far ? 1.1 + Math.random() * 1.1 : 0.55 + Math.random() * 0.8,
        v: far ? 0.05 + Math.random() * 0.06 : 0.15 + Math.random() * 0.25,
        far,
        puffs: 3 + Math.floor(Math.random() * 3),
      };
    }),
    cast: [
      { id: "yhon", x: 15, vx: 2.2, y: SCENE_GROUND, vy: 0, face: 1, walk: 0, next: 1.5 },
      { id: "bubu", x: 24, vx: -2.6, y: SCENE_GROUND, vy: 0, face: -1, walk: 0, next: 2.6 },
      { id: "dudu", x: 33, vx: 2.4, y: SCENE_GROUND, vy: 0, face: 1, walk: 0, next: 0.9 },
    ],
    orbs: [
      { x: 18.5, y: 10.6, type: "bituin", born: -2 },
      { x: 30, y: 9.6, type: "laki", born: -1.4 },
    ],
  };
}

export function resizeScene(s, cssW, cssH) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  s.w = Math.round(cssW * dpr);
  s.h = Math.round(cssH * dpr);
  s.canvas.width = s.w;
  s.canvas.height = s.h;
  s.canvas.style.width = cssW + "px";
  s.canvas.style.height = cssH + "px";
  // Keep the whole ridge in view however wide the window is.
  s.cam.zoom = Math.max(38, Math.min(110, s.w / 18));
  // gy works out to (height - K * zoom), so a smaller K drops the ridge
  // further down the screen. Low enough that the cast walks clear of the
  // cards and the button rather than behind them.
  s.cam.y = SCENE_GROUND - s.h / 2 / s.cam.zoom + 1.7;
}

export function drawScene(s, dt) {
  const ctx = s.ctx;
  s.t += dt;
  const fake = { level: { w: 48, h: 16 }, time: s.t, powers: s.orbs, shots: [], bursts: [] };

  // Same contract as draw(): a known state every frame, and every piece
  // isolated. The lobby had none of this, so one bad number in the title
  // scene killed the whole screen the player sees FIRST, silently.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.shadowBlur = 0;

  layer("scene:backdrop", ctx, () => drawBackdrop(s, ctx, fake, dt));

  // the ridge they walk on
  const gy = (SCENE_GROUND - s.cam.y) * s.cam.zoom + s.h / 2;
  ctx.fillStyle = "#6b4a3a";
  ctx.fillRect(0, gy, s.w, s.h - gy);
  ctx.fillStyle = "#7ec850";
  ctx.fillRect(0, gy, s.w, s.cam.zoom * 0.3);
  ctx.fillStyle = "#5aa53a";
  ctx.fillRect(0, gy + s.cam.zoom * 0.3, s.w, s.cam.zoom * 0.07);

  layer("scene:powers", ctx, () => drawPowers(s, ctx, fake));

  const left = s.cam.x - s.w / 2 / s.cam.zoom + 1.6;
  const right = s.cam.x + s.w / 2 / s.cam.zoom - 1.6;

  for (const c of s.cast) {
    // wander
    c.x += c.vx * dt;
    c.walk += Math.abs(c.vx) * dt;
    if (c.x < left) { c.x = left; c.vx = Math.abs(c.vx); }
    if (c.x > right) { c.x = right; c.vx = -Math.abs(c.vx); }
    c.face = Math.sign(c.vx);

    // an occasional hop, so they are not just sliding along
    c.next -= dt;
    if (c.next <= 0 && c.y >= SCENE_GROUND - 0.001) {
      c.vy = -9.5;
      c.next = 1.6 + Math.random() * 2.8;
    }
    c.vy += 30 * dt;
    c.y += c.vy * dt;
    if (c.y > SCENE_GROUND) { c.y = SCENE_GROUND; c.vy = 0; }

    const px = (c.x - s.cam.x) * s.cam.zoom + s.w / 2;
    const py = (c.y - s.cam.y) * s.cam.zoom + s.h / 2;
    const air = c.y < SCENE_GROUND - 0.01 ? (c.vy < 0 ? -1 : 1) : 0;

    layer(`scene:${c.id}`, ctx, () => {
      ctx.fillStyle = "rgba(0,0,0,0.14)";
      ctx.beginPath();
      ctx.ellipse(px, gy + s.cam.zoom * 0.06, s.cam.zoom * 0.3, s.cam.zoom * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();

      charById(c.id).draw(ctx, px, py, 0.7 * s.cam.zoom * 1.45, 0.95 * s.cam.zoom * 1.5, {
        face: c.face,
        run: 1,
        air,
        squash: 0,
        t: s.t,
        walk: c.walk,
        stride: c.id === "yhon" ? 0.78 : 1.1,
      });

      ctx.font = `700 ${Math.max(9, s.cam.zoom * 0.24)}px "Nunito", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(33,49,63,0.4)";
      ctx.fillText(charById(c.id).name, px, py - s.cam.zoom * 1.72);
    });
  }
}
