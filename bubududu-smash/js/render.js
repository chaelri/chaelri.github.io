// Renderer. Bright and readable on purpose — the last game was dark by design
// and half its problems were that nobody could see what was happening.
//
// One camera frames BOTH players and zooms to keep them together, so you are
// always looking at the same picture on the same screen.

import { charById } from "./characters.js";
import { poseOf } from "./physics.js";
import { ABILITY, ALL_POWERS, BAD_HELPER, BOX, COINS, DIWATA, FEEL, HIT, KING, PLAYERS, POWERUPS, SHOT_RADIUS } from "./config.js";
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
      /* An ordinary death: drive in, and then DO NOT COME BACK OUT.
       *
       * It used to ease out over the last fifth of the window, which put a
       * visible retreat between the kill and the banner — the camera pulled
       * back to the whole arena for a moment and then the words appeared, so
       * the last thing you saw was not the thing that happened. Charlie, on
       * the Bazooka first and then generally: "may konti time pa na bumalik
       * sa pagkakazoom out, dapat zoom in lang then freeze ... actually to any
       * deaths."
       *
       * So it holds at full pull for the whole window and lets go in one
       * frame at the end — by which time a round-ending death is already
       * behind its banner, and a mid-round one has the player back on their
       * feet. `killCamMs` is longer than `roundBannerMs` on purpose, so the
       * release can never happen before the banner. */
      killPull = p < 0.12 ? p / 0.12 : 1;
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

/* Per-layer timing, off unless somebody asks for it.
 *
 * "The frame got slower" is a useless sentence on its own — there are thirty
 * layers and the answer has twice been a drawing nobody suspected. Setting
 * `window.__drawProfile = {}` makes every layer add its milliseconds to it,
 * and the cost when it is off is one property read. */
function layer(name, ctx, fn) {
  const prof = typeof window !== "undefined" && window.__drawProfile;
  const t0 = prof ? performance.now() : 0;
  ctx.save();
  try {
    fn();
    if (prof) prof[name] = (prof[name] || 0) + (performance.now() - t0);
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
  for (const a of g.actors) layer("sword", ctx, () => drawSword(r, ctx, g, a));
  for (const a of g.actors) layer("gloves", ctx, () => drawGloves(r, ctx, g, a));
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

/* How long a column of dead floor spends falling out of the world. */
const FALL_SEC = 1.15;

function drawTiles(r, ctx, g) {
  const z = r.cam.zoom;
  const art = tileArt(r);
  trackFallingFloor(r, g);
  const x0 = Math.max(0, Math.floor(r.cam.x - r.w / 2 / z) - 1);
  const x1 = Math.min(g.level.w - 1, Math.ceil(r.cam.x + r.w / 2 / z) + 1);
  const y0 = Math.max(0, Math.floor(r.cam.y - r.h / 2 / z) - 1);
  const y1 = Math.min(g.level.h - 1, Math.ceil(r.cam.y + r.h / 2 / z) + 1);

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const c = g.grid.rows[ty][tx];
      if (c !== "#" && c !== "=" && c !== "^") continue;
      /* The two columns about to be eaten SHAKE first.
       *
       * The arena closes in from both ends and a column simply vanished on
       * the frame the counter crossed an integer — no warning, and if you
       * were standing on it you found out by falling. Charlie: "dapat may
       * alog alog dun sa part na mga yun na nawawala to give players kinda
       * reaction na ay pawala na pala."
       *
       * So the doomed pair trembles through the last part of its second,
       * harder the closer it gets, and goes pale as it loses its grip. The
       * warning window is a fraction of a column rather than a fixed time,
       * which keeps it in step with the shrink however fast that is running.
       */
      const eaten = Math.floor(g.shrink || 0);
      const doomed = tx === eaten || tx === g.level.w - 1 - eaten;
      const near = (g.shrink || 0) % 1;
      let shakeX = 0, shakeY = 0, doomFade = 1;
      if (doomed && near > 0.45) {
        const k = (near - 0.45) / 0.55;              // 0 -> 1 as it runs out
        const amp = z * 0.055 * k * k;
        // Two frequencies, so it is a tremble rather than a vibration.
        shakeX = (Math.sin(g.time * 47 + tx) + Math.sin(g.time * 31 + ty * 0.7)) * amp;
        shakeY = Math.sin(g.time * 53 + ty) * amp * 0.6;
        doomFade = 1 - k * 0.45;
      }
      const px = toX(r, tx) + shakeX;
      const py = toY(r, ty) + shakeY;
      const kind =
        c === "=" ? "plat" :
        c === "^" ? "spike" :
        (ty === 0 || g.grid.rows[ty - 1][tx] !== "#") ? "grass" : "soil";
      // +1 on the destination so neighbouring tiles overlap by a hair;
      // without it a fractional zoom leaves a seam of sky between them.
      if (doomFade < 1) ctx.globalAlpha = doomFade;
      ctx.drawImage(
        art.canvas,
        art.index[kind] * art.cell, 0, art.cell, art.cell,
        px - (art.pad / art.key) * z, py - (art.pad / art.key) * z,
        z * (art.cell / art.key) + 1, z * (art.cell / art.key) + 1
      );
      // Put it back, or every tile drawn after a doomed one inherits the fade.
      if (doomFade < 1) ctx.globalAlpha = 1;
    }
  }

  drawFallingFloor(r, ctx, g, art);

  // doors, drawn from the live list so they can animate open
}

/* The arena eats itself from both ends, and the columns it takes have to GO
 * somewhere.
 *
 * They used to be there on one frame and not on the next, which is a jump cut
 * in the middle of the one thing in the game that can kill you without anyone
 * doing anything. The tremble warned you it was coming; this is what happens
 * when it arrives. Charlie: "dapat di lang siya bigla nawawala, add animation
 * that it really falls down para pwede pa makatalon last moment ang
 * character."
 *
 * Nothing about it is on the wire. Both screens know `shrink`, so both work
 * out the same columns at the same moment — and because it is purely a
 * drawing, a slab that is still visibly falling is already out of the grid
 * and holds nobody up. The window you can jump in is the tremble; this is
 * what makes the tremble mean something.
 */
function trackFallingFloor(r, g) {
  const eaten = Math.floor(g.shrink || 0);
  if (!r.falling) { r.falling = []; r.doomSnap = {}; r.lastEaten = eaten; }
  // A new round: the arena is whole again and nothing is on its way down.
  if (eaten < r.lastEaten) { r.falling.length = 0; r.doomSnap = {}; }

  /* The two columns nearest the edges are photographed every frame, because
   * once the rules take them there is nothing left to draw them from. Two
   * columns of about fifteen tiles is nothing. */
  for (const tx of [eaten, g.level.w - 1 - eaten]) {
    if (tx < 0 || tx >= g.level.w) continue;
    const col = [];
    for (let ty = 0; ty < g.level.h; ty++) {
      const c = g.grid.rows[ty][tx];
      if (c !== "#" && c !== "=" && c !== "^") continue;
      /* The KIND is worked out here and not when it is drawn, because it
       * depends on the tile above — and by the time this slab is falling,
       * the tile above it is gone. Get it wrong and the grass turns to soil
       * on the frame the column dies. */
      col.push([ty,
        c === "=" ? "plat" :
        c === "^" ? "spike" :
        (ty === 0 || g.grid.rows[ty - 1][tx] !== "#") ? "grass" : "soil"]);
    }
    r.doomSnap[tx] = col;
  }

  for (let e = r.lastEaten; e < eaten; e++) {
    for (const tx of [e, g.level.w - 1 - e]) {
      const col = r.doomSnap[tx];
      if (!col || !col.length) continue;
      // It tips AWAY from the middle, which is the direction the ground has
      // just stopped being under it.
      r.falling.push({ tx, col, at: g.time, tip: tx < g.level.w / 2 ? -1 : 1 });
      delete r.doomSnap[tx];
    }
  }
  r.lastEaten = eaten;
  if (r.falling.length) {
    r.falling = r.falling.filter((f) => g.time - f.at < FALL_SEC);
  }
}

function drawFallingFloor(r, ctx, g, art) {
  if (!r.falling || !r.falling.length) return;
  const z = r.cam.zoom;
  const cell = z * (art.cell / art.key) + 1;
  const pad = (art.pad / art.key) * z;

  for (const f of r.falling) {
    const t = (g.time - f.at) / FALL_SEC;
    if (t < 0 || t >= 1) continue;
    // Gravity, not a slide: it hangs for a beat and then goes.
    const drop = t * t * z * 22;
    const tilt = f.tip * t * t * 0.55;
    const alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    const ox = toX(r, f.tx + 0.5);
    const oy = toY(r, g.level.h * 0.5);
    ctx.translate(ox, oy);
    ctx.rotate(tilt);
    ctx.translate(-ox, -oy);

    for (const [ty, kind] of f.col) {
      const px = toX(r, f.tx);
      const py = toY(r, ty) + drop;
      ctx.drawImage(art.canvas, art.index[kind] * art.cell, 0, art.cell, art.cell,
                    px - pad, py - pad, cell, cell);
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
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
  /* One highlight along the top — and it has to FADE.
   *
   * It used to be the lighter colour redrawn inside a rectangular clip, which
   * leaves a dead-straight horizontal line across the symbol. On a heart and
   * on a shield, which are exactly the shapes a game fills from the bottom,
   * that line reads as a LEVEL: Charlie, on the Heal orb, "tagal ko na pansin
   * tong heart parang 90% full lang itsura neto", and then the same about the
   * Shield. It was meant to be a lit side and it was being read as a gauge.
   *
   * A gradient clipped to the symbol's own outline says "light falling on it"
   * and cannot be read as a measurement, because there is no edge to measure
   * to. */
  const path = markPath(type);
  if (path) {
    x.save();
    x.translate(cx, cy);
    x.scale(size / 100, size / 100);
    x.translate(-50, -50);
    x.clip(path, "nonzero");
    const sheen = x.createLinearGradient(0, 4, 0, 78);
    sheen.addColorStop(0, "rgba(255,255,255,0.5)");
    sheen.addColorStop(0.55, "rgba(255,255,255,0.14)");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = sheen;
    x.fillRect(0, 0, 100, 100);
    x.restore();
  }

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

    /* The two OP items BURN.
     *
     * One Punch and the Bazooka are the only things on the field that end a
     * round the instant they connect, and they were sitting there looking
     * like a Speed pickup. Charlie: "make it blazing hot kasi super rare non
     * isipin mo basta nakatapat sa kalaban patay ... improve itsura nung
     * pickup item mismo."
     *
     * So they get fire: a ring of flame licking upward off the orb, embers
     * rising from it, and a hot floor glow underneath. All of it derived from
     * `age`, so both phones see the same flame with nothing on the wire.
     */
    if (def.op) {
      ctx.save();
      // A hot pool on the ground beneath it, replacing the cool shadow's job.
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.35 + 0.15 * pulse;
      const pool = ctx.createRadialGradient(px, py + drop, 0, px, py + drop, rad * 2);
      pool.addColorStop(0, "rgba(255,150,50,0.55)");
      pool.addColorStop(1, "rgba(255,90,20,0)");
      ctx.fillStyle = pool;
      ctx.beginPath();
      ctx.ellipse(px, py + drop, rad * 2, rad * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Tongues of flame around it, each on its own flicker so the ring is
      // never symmetrical — a steady ring is a halo, a jittering one is fire.
      for (let i = 0; i < 11; i++) {
        const n = noiseAt(i * 7 + 13);
        const ang = (i / 11) * Math.PI * 2 - Math.PI / 2;
        const lick = 0.55 + 0.45 * Math.abs(Math.sin(age * (7 + n * 5) + i * 2.1));
        const inner = rad * 0.82;
        const outer = rad * (1.05 + lick * (0.5 + n * 0.5));
        // Flames reach upward wherever they are on the ring — heat rises.
        const tipY = py + Math.sin(ang) * outer - rad * lick * 0.5;
        ctx.globalAlpha = 0.5 + 0.4 * lick;
        const fg = ctx.createLinearGradient(px, py, px + Math.cos(ang) * outer, tipY);
        fg.addColorStop(0, "rgba(255,244,190,0.95)");
        fg.addColorStop(0.5, "rgba(255,160,50,0.8)");
        fg.addColorStop(1, "rgba(220,50,20,0)");
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(ang - 0.22) * inner, py + Math.sin(ang - 0.22) * inner);
        ctx.lineTo(px + Math.cos(ang) * outer, tipY);
        ctx.lineTo(px + Math.cos(ang + 0.22) * inner, py + Math.sin(ang + 0.22) * inner);
        ctx.closePath();
        ctx.fill();
      }

      // Embers coming off the top, because fire sheds.
      for (let i = 0; i < 7; i++) {
        const n = noiseAt(i * 5 + 61);
        const t = (age * (0.5 + n * 0.5) + n * 3) % 1;
        ctx.globalAlpha = (1 - t) * 0.85;
        ctx.fillStyle = n > 0.5 ? "#ffd27a" : "#ff8a3d";
        ctx.beginPath();
        ctx.arc(px + (n - 0.5) * rad * 2 + Math.sin(age * 3 + i) * rad * 0.2,
                py - t * rad * 3, z * 0.035 * (1 - t * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

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

/**
 * A bazooka shell going off.
 *
 * Not a crater — a rocket detonating, usually in the air. So it is spherical
 * rather than ground-hugging, it goes white-hot before it goes orange, and it
 * leaves smoke rather than dust: smoke BILLOWS UPWARD after it has stopped
 * spreading, which is the single thing that separates an explosion from a
 * firework.
 *
 * Sized against the real blast radius, so what you see is what it killed.
 */
function drawBoom(r, ctx, g, q, age) {
  const def = POWERUPS.bazuka;
  const z = r.cam.zoom;
  const t = age / (def.boomMs / 1000);
  if (t >= 1) return;
  const px = toX(r, q.x);
  const py = toY(r, q.y);
  const R = def.blast * z;

  /* 0. A scorch under it, laid down first and outlasting everything else, so
   *    the ground remembers where a rocket went off. */
  {
    const ct = Math.min(1, t / 1);
    ctx.save();
    ctx.globalAlpha = Math.pow(1 - ct, 1.4) * 0.35;
    const sc = ctx.createRadialGradient(px, py, 0, px, py, R * 0.9);
    sc.addColorStop(0, "rgba(38,24,16,0.9)");
    sc.addColorStop(1, "rgba(38,24,16,0)");
    ctx.fillStyle = sc;
    ctx.beginPath();
    ctx.ellipse(px, py, R * 0.9, R * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* 1. The flash — two frames of pure white, bigger than the blast.
   *    Everything else is detail; this is the bang. */
  if (t < 0.07) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = (1 - t / 0.07) * 0.85;
    const fl = ctx.createRadialGradient(px, py, 0, px, py, R * 1.05);
    fl.addColorStop(0, "rgba(255,255,255,1)");
    fl.addColorStop(0.5, "rgba(255,240,190,0.7)");
    fl.addColorStop(1, "rgba(255,180,60,0)");
    ctx.fillStyle = fl;
    ctx.beginPath();
    ctx.arc(px, py, R * 1.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* 2. The fireball: white core, yellow, orange, red edge — expanding fast
   *    and then holding while it burns out. */
  const grow = 1 - Math.pow(1 - Math.min(1, t * 2.6), 3);
  const rad = R * (0.25 + grow * 0.85);
  if (t < 0.55) {
    const k = 1 - t / 0.55;
    ctx.save();
    /* Drawn SOLID, not additively.
     *
     * The first version used `lighter` for the whole fireball, which on a
     * bright sky adds to something already near white — so the explosion came
     * out as a pale bloom washing over half the frame rather than as a ball
     * of fire. An explosion is an OBJECT: it is opaque, it has an edge, and
     * it hides what is behind it. Only the initial flash adds. */
    ctx.globalAlpha = Math.min(1, k * 1.5);
    const fb = ctx.createRadialGradient(px, py, 0, px, py, rad);
    fb.addColorStop(0.00, "rgba(255,250,214,1)");
    fb.addColorStop(0.16, "rgba(255,224,102,1)");
    fb.addColorStop(0.42, "rgba(255,150,40,1)");
    fb.addColorStop(0.74, "rgba(214,54,22,0.92)");
    fb.addColorStop(0.92, "rgba(120,26,16,0.45)");
    fb.addColorStop(1.00, "rgba(90,20,14,0)");
    ctx.fillStyle = fb;
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fill();

    /* Lobes around the edge, so the ball is not a perfect circle. A circle
     * is a sun; an explosion is lumpy. */
    for (let i = 0; i < 16; i++) {
      const n = noiseAt(i * 4 + q.x * 2.7);
      const ang = (i / 16) * Math.PI * 2 + n * 0.6;
      const lr = rad * (0.34 + n * 0.3);
      const ld = rad * (0.62 + n * 0.3);
      const lg = ctx.createRadialGradient(px + Math.cos(ang) * ld, py + Math.sin(ang) * ld, 0,
                                          px + Math.cos(ang) * ld, py + Math.sin(ang) * ld, lr);
      lg.addColorStop(0, "rgba(255,186,64,0.95)");
      lg.addColorStop(0.6, "rgba(226,72,26,0.7)");
      lg.addColorStop(1, "rgba(150,34,18,0)");
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.arc(px + Math.cos(ang) * ld, py + Math.sin(ang) * ld, lr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* 3. The shockwave: a thin ring travelling out PAST the fireball, which is
   *    what gives the blast a size you can read at a glance. */
  if (t < 0.5) {
    const e = t / 0.5;
    const ee = 1 - Math.pow(1 - e, 2.4);
    ctx.save();
    ctx.globalAlpha = (1 - e) * 0.9;
    ctx.strokeStyle = "#fff6dd";
    ctx.lineWidth = Math.max(2, z * 0.12 * (1 - e));
    ctx.beginPath();
    ctx.arc(px, py, R * (0.3 + ee * 1.25), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /* 4. Smoke. Billows out, then keeps RISING after it has stopped spreading —
   *    the lag between the two is what makes it read as smoke and not as a
   *    second, slower fireball. */
  ctx.save();
  for (let i = 0; i < 38; i++) {
    const n1 = noiseAt(i * 5 + q.x * 3.1), n2 = noiseAt(i * 5 + 1 + q.x * 3.1);
    const ang = (i / 38) * Math.PI * 2 + n1;
    const out = R * (0.25 + n2 * 0.85) * (1 - Math.pow(1 - Math.min(1, t * 1.8), 2));
    const rise = z * (0.4 + n1 * 2.4) * t;
    const pr = z * (0.12 + n2 * 0.2) * (0.5 + t * 2.4);
    ctx.globalAlpha = Math.max(0, 1 - t * 1.1) * 0.5;
    ctx.drawImage(softDot(i % 3 ? "78,66,60" : "156,140,128"),
                  px + Math.cos(ang) * out - pr, py + Math.sin(ang) * out * 0.8 - rise - pr,
                  pr * 2, pr * 2);
  }
  ctx.restore();

  /* 4b. SECONDARY detonations — three more fireballs popping off around the
   *     first, each on its own short clock.
   *
   *     One ball of fire is a firework; a thing that keeps going off for the
   *     next third of a second is an explosion. Cheap, and it is most of the
   *     difference between "it popped" and "sabog na sabog". */
  for (let i = 0; i < 3; i++) {
    const n = noiseAt(i * 11 + q.x * 5.3);
    const at = 0.1 + i * 0.09;
    const tt = (t - at) / 0.3;
    if (tt <= 0 || tt >= 1) continue;
    const ang = n * Math.PI * 2;
    const d = R * (0.35 + n * 0.5);
    const sx = px + Math.cos(ang) * d;
    const sy = py + Math.sin(ang) * d * 0.8;
    const sr = R * (0.3 + n * 0.28) * (0.4 + (1 - Math.pow(1 - tt, 3)) * 0.9);
    ctx.save();
    ctx.globalAlpha = (1 - tt) * 0.9;
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
    sg.addColorStop(0, "rgba(255,250,220,1)");
    sg.addColorStop(0.3, "rgba(255,212,90,1)");
    sg.addColorStop(0.7, "rgba(238,96,30,0.85)");
    sg.addColorStop(1, "rgba(140,30,16,0)");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* 5. Sparks, thrown on straight lines and fading — the only part that is
   *    allowed to leave the blast radius. */
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (let i = 0; i < 30; i++) {
    const n = noiseAt(i * 7 + 90 + q.x);
    const ang = (i / 30) * Math.PI * 2 + n * 0.4;
    const far = R * (0.8 + n * 1.1) * Math.min(1, t * 2.2);
    const len = z * 0.3 * (1 - t);
    ctx.globalAlpha = Math.max(0, 1 - t * 1.6);
    ctx.strokeStyle = n > 0.5 ? "#fff2c4" : def.colour;
    ctx.lineWidth = Math.max(1, z * 0.045 * (1 - t));
    ctx.beginPath();
    ctx.moveTo(px + Math.cos(ang) * far, py + Math.sin(ang) * far);
    ctx.lineTo(px + Math.cos(ang) * (far + len), py + Math.sin(ang) * (far + len));
    ctx.stroke();
  }
  ctx.restore();
}

function drawQuakes(r, ctx, g) {
  if (!g.quakes || !g.quakes.length) return;
  const z = r.cam.zoom;
  const AB = ABILITY.pound;

  for (const q of g.quakes) {
    const age = g.time - q.at;
    if (age < 0) continue;
    // A shell going off in the air is a different picture entirely.
    if (q.kind === 1) { drawBoom(r, ctx, g, q, age); continue; }
    const force = Math.max(0.15, Math.min(1, q.force || 0));
    const px = toX(r, q.x);
    const py = toY(r, q.y);
    // The real radius of the shove, in px. Everything on the floor is drawn
    // against THIS, so what you see is what the move actually covers.
    const reach = (AB.blast + (AB.blastFar - AB.blast) * force) * z;
    const seed = Math.abs(q.x) * 7.13 + Math.abs(q.y) * 3.7;

    const ct = age / (CRACK_MS / 1000);
    const t = age / (QUAKE_MS / 1000);

    /* ---- 1. dust settling where he landed, instead of cracks ----
     *
     * There were fissures here: tapered black wedges radiating out, plus a
     * dark scorch under them. Charlie: "di ko trip yung parang cracks e ...
     * parang di bagay". He is right, and the reason is that they were the
     * only hard-edged black thing in the whole game. Everything else here is
     * soft, rounded and bright — the characters, the pickups, the valley —
     * so a shattered floor read as damage from a different picture.
     *
     * What is left behind is DUST, warm and pale, a ring of it sitting on
     * the ground where the shock pushed it out. Same information (something
     * heavy landed here, this big, a moment ago) with none of the violence.
     */
    if (ct < 1) {
      const open = Math.min(1, ct * 5);
      const fade = Math.pow(1 - ct, 1.5);
      ctx.save();
      for (let i = 0; i < 14; i++) {
        const n1 = noiseAt(i * 3 + seed), n2 = noiseAt(i * 3 + 1 + seed);
        const ang = (i / 14) * Math.PI * 2;
        const out = reach * (0.45 + n1 * 0.5) * open;
        const rad = z * (0.16 + force * 0.2) * (0.6 + n2);
        ctx.globalAlpha = fade * 0.3;
        ctx.drawImage(softDot(i % 3 === 0 ? "168,140,104" : "226,208,180"),
                      px + Math.cos(ang) * out - rad,
                      py + Math.sin(ang) * out * 0.22 - rad * 0.5,
                      rad * 2, rad);
      }
      ctx.restore();
    }

    /* ---- 2. impact rays: chunky, white, rounded — a cartoon landing ----
     *
     * The thing the cracks were really doing was saying "the force went
     * OUTWARD from here". Lines that spread from the point of impact do that
     * job, and in this game's language they are short, fat, white and gone
     * in a tenth of a second. */
    if (ct < 0.24) {
      const e = ct / 0.24;
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.globalAlpha = 1 - e;
      for (let i = 0; i < 9; i++) {
        const n = noiseAt(i * 5 + seed);
        const ang = -Math.PI + (i + 0.5) * (Math.PI / 9) + (n - 0.5) * 0.3;
        const from = reach * (0.18 + e * 0.5);
        const len = reach * (0.16 + n * 0.16) * (1 - e);
        ctx.lineWidth = Math.max(2, z * (0.09 + force * 0.07) * (1 - e));
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(ang) * from, py + Math.sin(ang) * from * 0.3);
        ctx.lineTo(px + Math.cos(ang) * (from + len), py + Math.sin(ang) * (from + len) * 0.3);
        ctx.stroke();
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


/* ------------------------------------------------------------- pinata --- */

const BOX_MS = 240;

// The paper. Bright, and deliberately nothing else in the arena wears these.
const PINATA_BANDS = ["#ff8fb1", "#ffd24a", "#7fd4ff", "#ff8fb1", "#a8e26a", "#ffd24a"];

/**
 * The thing you hit — a piñata, hanging from a cord.
 *
 * It was a wooden crate with a ? and three cracks scratched across it, and
 * Charlie's read was the right one: "ang panget lang ng crack and pagkakagawa
 * mismo nung asset ... yung talagang parang gusto mo basagin ... something
 * cute na basagin ko". A crate is a container; nobody wants to break a
 * container. A piñata is the one object in the world whose entire purpose is
 * to be hit until it bursts, and it is cute on the way there.
 *
 * Which also solves the damage problem. A crack drawn on a box is a scratch —
 * the box is the same box. A piñata comes APART: the paper frills tear off a
 * band at a time, it hangs more and more crooked, strips come loose, and the
 * face goes from a smile to a wince. You can read how many hits are left
 * from across the arena without counting anything.
 */
/* The pinata itself, drawn at the origin of whatever context it is handed.
 *
 * Pulled out of drawBoxes so it can be drawn TWICE: once into stampOutline's
 * scratch buffer, which flattens it to a silhouette for the white rim, and
 * once for real on top. Before this the rim was a single ellipse stroked
 * round the dome, so the ears, the pom and every paper tab — the parts that
 * ARE its outline — had no edge at all. Charlie, holding it up next to the
 * fairy: "lagyan natin white outline yung pinata just like outline ni fairy
 * yhon here."
 */
function pinataArt(c, s, gone, z) {
  /* The body: one clean pastel dome, and the face lives on it.
   *
   * The first one wrapped the WHOLE body in rows of coloured paper tabs,
   * which buried the face in confetti and read as a beach ball — "ang
   * panget ng itsura". The paper is a skirt and a collar now: the middle
   * of the face is left alone, because the face is the reason you want to
   * hit it.
   */
  const bodyGrd = c.createLinearGradient(0, -s * 0.4, 0, s * 0.4);
  bodyGrd.addColorStop(0, "#ffe3ef");
  bodyGrd.addColorStop(1, "#ffb9d4");
  c.fillStyle = bodyGrd;
  c.beginPath();
  c.ellipse(0, 0, s * 0.42, s * 0.4, 0, 0, Math.PI * 2);
  c.fill();

  /* The skirt: bands of paper tabs hanging off the BOTTOM only. Each hit
   * tears the top surviving band away, so the silhouette loses a layer
   * every time and the damage is something that happened rather than a
   * scratch drawn on. */
  const bands = 3;
  const alive = Math.max(0, bands - gone);
  for (let i = 0; i < alive; i++) {
    const fy = s * (0.06 + i * 0.13);
    const halfW = s * 0.42 * Math.cos((fy / (s * 0.46)) * 1.1);
    c.fillStyle = PINATA_BANDS[i % PINATA_BANDS.length];
    const tabs = Math.max(5, Math.round(halfW / (s * 0.06)));
    for (let k = 0; k < tabs; k++) {
      const tx = -halfW + (k + 0.5) * (halfW * 2 / tabs);
      const tw = (halfW * 2 / tabs) * 0.6;
      c.beginPath();
      c.moveTo(tx - tw, fy);
      c.lineTo(tx + tw, fy);
      c.lineTo(tx, fy + s * 0.14);
      c.closePath();
      c.fill();
    }
  }

  // A collar of the same paper under the chin, which ties the skirt to the
  // head and gives the face something to sit above.
  c.fillStyle = PINATA_BANDS[(alive + 1) % PINATA_BANDS.length];
  c.beginPath();
  c.ellipse(0, -s * 0.02, s * 0.3, s * 0.07, 0, 0, Math.PI * 2);
  c.fill();

  // Ears, so it is a creature rather than a pot.
  c.fillStyle = "#ffd24a";
  for (const side of [-1, 1]) {
    c.beginPath();
    c.moveTo(side * s * 0.16, -s * 0.34);
    c.lineTo(side * s * 0.3, -s * 0.58);
    c.lineTo(side * s * 0.36, -s * 0.28);
    c.closePath();
    c.fill();
    // a paler inner ear, or they read as horns
    c.fillStyle = "#ffeeb5";
    c.beginPath();
    c.moveTo(side * s * 0.21, -s * 0.34);
    c.lineTo(side * s * 0.29, -s * 0.5);
    c.lineTo(side * s * 0.31, -s * 0.3);
    c.closePath();
    c.fill();
    c.fillStyle = "#ffd24a";
  }

  // A pom on top where the cord ties on — the piece that makes it a party
  // object rather than a bag.
  c.fillStyle = "#7fd4ff";
  c.beginPath();
  c.arc(0, -s * 0.44, s * 0.1, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "rgba(255,255,255,0.85)";
  c.lineWidth = Math.max(1.2, z * 0.03);
  c.stroke();

  // Blush. Two dots of warmth and the thing is suddenly worth hitting.
  c.fillStyle = "rgba(255,138,170,0.55)";
  for (const side of [-1, 1]) {
    c.beginPath();
    c.ellipse(side * s * 0.26, -s * 0.09, s * 0.075, s * 0.05, 0, 0, Math.PI * 2);
    c.fill();
  }

  /* The face. THE reason you want to hit it, and the clearest read on how
   * close it is to bursting: a smile, then a wince, then dizzy. */
  c.fillStyle = "#3b2a2f";
  const eye = s * 0.045;
  if (gone === 0) {
    for (const side of [-1, 1]) {
      c.beginPath();
      c.arc(side * s * 0.14, -s * 0.16, eye, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = "#3b2a2f";
    c.lineWidth = Math.max(1.2, z * 0.03);
    c.beginPath();
    c.arc(0, -s * 0.1, s * 0.1, 0.2 * Math.PI, 0.8 * Math.PI);
    c.stroke();
  } else if (gone === 1) {
    // squeezed shut
    c.strokeStyle = "#3b2a2f";
    c.lineWidth = Math.max(1.4, z * 0.032);
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(side * s * 0.2, -s * 0.06);
      c.lineTo(side * s * 0.07, -s * 0.02);
      c.stroke();
    }
    c.beginPath();
    c.arc(0, s * 0.14, s * 0.08, 1.15 * Math.PI, 1.85 * Math.PI);
    c.stroke();
  } else {
    // dizzy — one more and it is confetti
    c.strokeStyle = "#3b2a2f";
    c.lineWidth = Math.max(1.4, z * 0.032);
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(side * s * 0.2, -s * 0.12);
      c.lineTo(side * s * 0.06, s * 0.0);
      c.moveTo(side * s * 0.06, -s * 0.12);
      c.lineTo(side * s * 0.2, s * 0.0);
      c.stroke();
    }
    c.beginPath();
    c.ellipse(0, s * 0.16, s * 0.07, s * 0.05, 0, 0, Math.PI * 2);
    c.stroke();
  }
}

/* Whoever is holding the string.
 *
 * The pinata hung from a cord that went up and stopped — Charlie: "nakasabit
 * to out of nowhere which doesnt make sense, lets make a small golden fairy
 * yhon hold the pinata." So a Fairy Yhon carries it in, gold rather than the
 * pink one who heals you, because they do different things and the two should
 * not be confused across a room: the pink one is following a player, the gold
 * one is holding the thing you are about to hit.
 *
 * She is drawn from nothing but the clock and the box's own x, so both
 * screens show the same flutter without a byte on the wire.
 */
function drawPinataFairy(r, ctx, x, y, z, t, seed) {
  const beat = Math.sin(t * 20 + seed) * 0.4 + 0.75;
  const bob = Math.sin(t * 2.6 + seed) * z * 0.07;
  const fy = y + bob;

  ctx.save();

  /* WHITE light, not gold.
   *
   * Gold was the first answer to "golden fairy" and it was the wrong one in
   * practice: the halo is the biggest thing in that corner of the screen, and
   * a warm yellow one sat on a pale sky as a smudge with a yellowish pig in
   * the middle of it — she disappeared into her own light. White separates
   * from everything the valley is made of, and the gold survives where it
   * belongs, on her. Charlie: "dapat pala white glow yung fairy na nagbubuhat
   * white outline din." */
  const glow = ctx.createRadialGradient(x, fy, 0, x, fy, z * 1.1);
  glow.addColorStop(0, "rgba(255,255,255,0.8)");
  glow.addColorStop(0.45, "rgba(255,252,240,0.34)");
  glow.addColorStop(1, "rgba(255,252,240,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, fy, z * 1.1, 0, Math.PI * 2);
  ctx.fill();

  // Wings, beating fast, behind her.
  ctx.save();
  ctx.translate(x, fy - z * 0.2);
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = "#fff6d8";
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.rotate(-0.5);
    ctx.beginPath();
    ctx.ellipse(z * 0.24, 0, z * 0.3 * beat, z * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  const size = z * 0.56;
  const pose = { face: 1, run: 0, air: -1, rise: 0.4, squash: -0.1,
                 t, walk: 0, stride: 1 };
  // A white rim, the same one every small thing in this game wears so it
  // holds against sky, hill or treeline.
  stampOutline(r, ctx, "rgba(255,255,255,0.95)", x, fy + size * 0.5, size, size,
    z * 0.06,
    (b, bx, by) => charById("yhon").draw(b, bx, by, size, size, pose));
  charById("yhon").draw(ctx, x, fy + size * 0.5, size, size, pose);
  /* ...and the gold goes ON HER rather than round her: a light wash over the
   * body, which is what makes her the golden one without turning the air
   * around her yellow. Weak enough that the face survives it, because the
   * face is why she is a fairy carrying something and not a lamp. */
  drawSilhouette(r, ctx, "#ffca4d", 0.3, x, fy + size * 0.5, size, size,
    (b, bx, by) => charById("yhon").draw(b, bx, by, size, size, pose));

  // A few grains of gold dust falling off her.
  for (let i = 0; i < 4; i++) {
    const k = (t * 0.6 + i / 4 + seed * 0.13) % 1;
    ctx.globalAlpha = (1 - k) * 0.7;
    ctx.fillStyle = i % 2 ? "#fff3c4" : "#ffcf5c";
    ctx.beginPath();
    ctx.arc(x + Math.sin(k * 5 + i) * z * 0.3, fy + k * z * 0.7,
            z * 0.04 * (1 - k), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawBoxes(r, ctx, g) {
  if (!g.boxes || !g.boxes.length) return;
  const z = r.cam.zoom;
  for (const b of g.boxes) {
    const left = Math.max(0, Math.min(BOX.hits, b.hits));
    const gone = BOX.hits - left;                 // bands torn off so far

    // Struck: it swings hard, then settles. Everything hangs off this.
    const hitT = Math.max(0, Math.min(1, (g.time - (b.bumpAt ?? -9)) / (BOX_MS / 1000)));
    const struck = hitT < 1;
    const swing = struck
      ? Math.sin(hitT * Math.PI * 3) * (1 - hitT) * 0.55
      : Math.sin(g.time * 1.9 + b.x) * 0.06;      // idle sway on the cord
    // It hangs more crooked the more it has taken.
    const lean = swing + gone * 0.13;

    const anchorX = toX(r, b.x);
    const anchorY = toY(r, b.y - 1.5);             // where the cord is tied
    const s = z * BOX.w;
    const cord = z * 1.5;
    // The body swings from the anchor, so the cord and the body agree.
    const px = anchorX + Math.sin(lean) * cord;
    const py = anchorY + Math.cos(lean) * cord;

    ctx.save();

    /* The cord. It is what says "hit me" — a thing hanging from a string at
     * head height is an invitation in every culture that has ever had one. */
    ctx.strokeStyle = "rgba(120,96,72,0.85)";
    ctx.lineWidth = Math.max(1.5, z * 0.045);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(anchorX, anchorY + z * 0.16);
    ctx.quadraticCurveTo(anchorX + Math.sin(lean) * cord * 0.45, anchorY + cord * 0.5,
                         px, py - s * 0.42);
    ctx.stroke();

    // ...and the fairy holding the other end of it. See drawPinataFairy.
    drawPinataFairy(r, ctx, anchorX, anchorY, z, g.time, b.x);

    ctx.translate(px, py);
    ctx.rotate(lean * 0.5);

    // A shadow under it, so it hangs in front of the valley rather than on it.
    ctx.fillStyle = "rgba(30,24,16,0.16)";
    ctx.beginPath();
    ctx.ellipse(0, s * 0.72, s * 0.34, s * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();

    /* A glow around it, breathing, and a flare on every hit.
     *
     * It is one of two things on the field worth crossing the arena for and
     * it was drawn like scenery — a pastel object against a pastel valley,
     * quiet enough to walk past. Charlie: "make this glowing." The halo is
     * warm rather than the body's pink so it separates from its own skirt,
     * and it BRIGHTENS the moment it is struck, which is also the clearest
     * read that a hit registered on something that mostly just swings.
     */
    const pulse = 0.5 + 0.5 * Math.sin(g.time * 3.2 + b.x * 1.7);
    const flare = struck ? (1 - hitT) * (1 - hitT) : 0;
    // Wider and warmer than the first pass at it — "increase natin".
    const lift = 0.4 + 0.16 * pulse + flare * 0.6;
    const rad = s * (1.28 + pulse * 0.06 + flare * 0.4);
    const halo = ctx.createRadialGradient(0, -s * 0.06, s * 0.18,
                                          0, -s * 0.06, rad);
    halo.addColorStop(0, `rgba(255,232,163,${(0.7 + flare * 0.3).toFixed(3)})`);
    halo.addColorStop(0.38, `rgba(255,186,214,${lift.toFixed(3)})`);
    halo.addColorStop(1, "rgba(255,186,214,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, -s * 0.06, rad, 0, Math.PI * 2);
    ctx.fill();

    /* Four motes turning around it, because a still glow reads as a blur and
     * a moving one reads as alive. They are the only thing in this drawing
     * that is not attached to the body, which is what makes the body look
     * like it is giving something off. */
    for (let i = 0; i < 4; i++) {
      const ang = g.time * 1.15 + (i / 4) * Math.PI * 2 + b.x;
      const rr = s * (0.56 + 0.06 * Math.sin(g.time * 2.4 + i));
      ctx.globalAlpha = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(ang * 2));
      ctx.fillStyle = i % 2 ? "#fff3c4" : "#ffd6ea";
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * rr, -s * 0.06 + Math.sin(ang) * rr * 0.55,
              s * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* The rim, and it is a real outline now — see pinataArt. The shape is
     * drawn once into a buffer, flattened, and stamped round itself, so the
     * ears and every paper tab get an edge instead of only the dome. */
    stampOutline(r, ctx, "rgba(255,255,255,0.95)", 0, s * 0.4, s, s,
                 Math.max(2, z * 0.05),
                 (b2, bx, by) => {
                   b2.save();
                   b2.translate(bx, by - s * 0.4);
                   pinataArt(b2, s, gone, z);
                   b2.restore();
                 });
    pinataArt(ctx, s, gone, z);

    // Struck this frame: it flashes, and paper scatters.
    if (hitT < 0.3) {
      ctx.globalAlpha = (1 - hitT / 0.3) * 0.85;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.46, s * 0.42, 0, 0, Math.PI * 2);
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
  /* The SAME sprite convention drawActor uses.
   *
   * A player's body is drawn at `a.h * z * 1.32` — the sprite is taller than
   * the hitbox, which is where AMMO_Y, HEART_Y and the crown's own anchor all
   * come from. The King was drawn at a flat `a.h * z`, so his head sat 32%
   * lower than every formula written against that convention assumed, and his
   * crown floated most of a body-height above him. "mashado malayo crown
   * niya." Drawing him by the same rule fixes the crown, the hearts and his
   * proportions in one go — and makes him properly bigger, which he should
   * be anyway. */
  const w = a.w * z, h = a.h * z * 1.32;

  ctx.save();
  // A shadow the size of him, so the ground says how big he is before he
  // lands on it.
  ctx.fillStyle = "rgba(24,18,12,0.22)";
  ctx.beginPath();
  ctx.ellipse(px, py + z * 0.06, w * 0.5, z * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();

  /* How long ago he was struck, 0..1 through the window.
   *
   * Derived from `hurtUntil`, which is already on the wire — nothing extra
   * travels for any of this. */
  const hurtLeft = (k.hurtUntil || 0) - g.time;
  const hitT = hurtLeft > 0
    ? 1 - hurtLeft / (KING.hurtInvulnMs / 1000)
    : 1;
  const hurt = hurtLeft > 0;

  /* Squashed by the blow, then springing back past true.
   *
   * A body that only changes COLOUR when it is hit has not been hit, it has
   * been recoloured. The deformation is what the eye reads as force, and it
   * is why every cartoon in the world does this. */
  if (hitT < 0.55) {
    const e = hitT / 0.55;
    const q = Math.sin(e * Math.PI * 1.6) * (1 - e) * 0.3;
    ctx.translate(px, py);
    ctx.scale(1 + q, 1 - q * 0.9);
    ctx.translate(-px, -py);
  }

  /* The aura, under everything he wears.
   *
   * He arrives out of a box in the middle of a bright valley and was, in
   * colour terms, a large yellow pig. Charlie asked for dark violet — and
   * then, seeing the first pass: "di dapat bilog e pero parang aura tala na
   * masmoky vibe, hindi bilog na bilog yung dark purple aura pero smoky eme
   * parang enemy sha. Lagyan din natin siya ng red highlight."
   *
   * He is right, and the reason is worth writing down: a circle is a
   * CONTAINER. A perfectly round glow says "here is a boundary, and he is
   * inside it" — which is what a shield says, and a shield is a friendly
   * thing. Smoke has no boundary; it says the thing in the middle is giving
   * something off. Same colour, opposite sentence.
   *
   * So the shape is a closed path whose radius wanders with three sines at
   * different rates, drawn three times over at different sizes and speeds so
   * no two frames have the same silhouette, and the red rides in it as a
   * separate, smaller, faster lobe — a heat inside the smoke rather than a
   * second ring around it.
   */
  {
    const flare = hurt ? (1 - hitT) * (1 - hitT) : 0;
    const cy = py - h * 0.5;
    const base = h * (0.82 + flare * 0.22);

    /* One wandering blob. `wob` is how far from round it is allowed to get,
     * `sp` how fast it churns, `seed` keeps the three layers out of step. */
    const smoke = (cxx, cyy, rad, wob, sp, seed) => {
      const N = 46;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const th = (i / N) * Math.PI * 2;
        const wig =
          Math.sin(th * 3 + g.time * sp + seed) * 0.52 +
          Math.sin(th * 5 - g.time * sp * 0.7 + seed * 2.3) * 0.31 +
          Math.sin(th * 2 + g.time * sp * 0.41 + seed * 3.7) * 0.22;
        const rr = rad * (1 + wob * wig);
        const x = cxx + Math.cos(th) * rr;
        const y = cyy + Math.sin(th) * rr * 0.94;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
    };

    // Three violet layers: wide and faint, middle, and a denser core.
    const layers = [
      [1.22, 0.38, 0.55, 0.0, 0.34],
      [0.98, 0.3, 0.85, 2.1, 0.52],
      [0.72, 0.22, 1.25, 4.4, 0.66],
    ];
    for (const [k, wob, sp, seed, alpha] of layers) {
      const rad = base * k;
      const grd = ctx.createRadialGradient(px, cy, rad * 0.15, px, cy, rad);
      grd.addColorStop(0, fade(KING.auraGlow, (alpha + flare * 0.3) * 0.9));
      grd.addColorStop(0.55, fade(KING.aura, alpha + flare * 0.25));
      grd.addColorStop(1, fade(KING.aura, 0));
      ctx.fillStyle = grd;
      smoke(px, cy, rad, wob, sp, seed);
      ctx.fill();
    }

    /* The red. Low and behind him, churning faster than the violet — it is
     * the part that says "enemy" rather than "magic", and it only ever shows
     * through the smoke rather than outlining it. */
    const rr = base * (0.62 + flare * 0.3);
    const ry = cy + h * 0.12;
    const red = ctx.createRadialGradient(px, ry, rr * 0.1, px, ry, rr);
    red.addColorStop(0, `rgba(255,74,74,${(0.42 + flare * 0.45).toFixed(3)})`);
    red.addColorStop(0.5, `rgba(198,26,46,${(0.26 + flare * 0.3).toFixed(3)})`);
    red.addColorStop(1, "rgba(198,26,46,0)");
    ctx.fillStyle = red;
    smoke(px, ry, rr, 0.34, 1.9, 1.3);
    ctx.fill();

    /* Wisps lifting off the top of it, which is what makes it smoke and not
     * a stain. Derived from his own x so both screens draw the same ones. */
    for (let i = 0; i < 9; i++) {
      const t = (g.time * 0.42 + i * 0.111 + a.x * 0.07) % 1;
      const drift = Math.sin(t * 5.2 + i * 2.1) * w * 0.5;
      const ex = px + drift;
      const ey = py - t * h * 1.3;
      const grow = 0.6 + t * 1.6;
      ctx.globalAlpha = Math.sin(t * Math.PI) * (0.52 + flare * 0.3);
      ctx.fillStyle = i % 4 === 0 ? "#ff5a6e" : KING.aura;
      smoke(ex, ey, z * 0.2 * grow, 0.45, 2.4, i * 1.7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // The cape goes on FIRST — it hangs behind him and has to be occluded by
  // his own body, or it reads as a sheet pasted over the front of him.
  drawCape(ctx, px, py, w, h, z, a.face, g.time);

  // The body, outlined so he holds against the treeline.
  /* The outline callback is handed (buffer, x, bottomY) — three arguments.
   *
   * This one declared four and used them as if they were (x, y, w, h), so it
   * drew into the PAGE's context at a coordinate that was itself a context
   * object: every number downstream came out NaN, canvas discards NaN draws
   * without complaint, and the King has been walking around with no outline
   * at all. Nothing threw, so nothing said so. */
  stampOutline(r, ctx, "rgba(255,255,255,0.95)", px, py, w, h,
               Math.max(2, z * 0.07), (b2, bx, by) => {
    charById("yhon").draw(b2, bx, by, w, h, {
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
    /* RED, and only briefly white.
     *
     * The first frames blow out to white — that is the impact itself — and
     * then it settles into a deep angry red that pulses for the rest of the
     * window. White on its own is what a player wears during their grace
     * period, which is the most forgettable state in the game; wearing it
     * made the boss look like he was recovering rather than hurting.
     */
    if (hitT < 0.12) {
      ctx.globalAlpha = 1 - hitT / 0.12;
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.ellipse(px, py - h * 0.5, w * 0.52, h * 0.52, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // Deep red, following his actual shape.
    drawSilhouette(r, ctx, "#d81f3e",
      (1 - hitT) * (0.55 + 0.3 * Math.abs(Math.sin(g.time * 26))),
      px, py, w, h, (b, bx, by) => {
        charById("yhon").draw(b, bx, by, w, h, {
          face: a.face, run: 0, air: a.grounded ? 0 : (a.vy < 0 ? -1 : 1),
          squash: 0, t: g.time, walk: 0, stride: 0.78,
        });
      });

    // A shockwave off the body on the first frames, so the hit has a size.
    if (hitT < 0.4) {
      const e = hitT / 0.4;
      ctx.save();
      ctx.globalAlpha = (1 - e) * 0.8;
      ctx.strokeStyle = "#fff0b0";
      ctx.lineWidth = Math.max(2, z * 0.09 * (1 - e));
      ctx.beginPath();
      ctx.ellipse(px, py - h * 0.5, w * (0.4 + e * 1.1), h * (0.4 + e * 0.9),
                  0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Same anchor correction as the player's: the sprite reaches 1.32 of the
  // body box, so `py - h` is inside his head rather than on top of it.
  drawCrown(ctx, px, py - h * 0.98, w * 0.46, z);

  // His three hearts, over the crown rather than over the head — the crown
  // is where a player's hearts would be.
  // Above the crown, which is itself above his head — that stack is the
  // whole silhouette, so nothing may overlap anything else in it.
  drawBossHearts(r, ctx, px, py - h * 0.98 - w * 0.62, k.hp, KING.hp, z);
  ctx.restore();
}

/**
 * A royal cape, hanging behind whoever is wearing the crown.
 *
 * Drawn BEHIND the body — it is the one part of the outfit that has to be
 * occluded by its wearer, or it reads as a red sheet pasted over them.
 *
 * It trails AWAY from the direction they are facing and billows on a slow
 * clock, because a cape that hangs perfectly still is a towel. Three things
 * make it read as velvet rather than as a triangle: it is wider at the hem
 * than at the shoulders, the hem is a wave rather than a line, and there is
 * a fur collar across the top with the dark flecks ermine has.
 */
function drawCape(ctx, px, py, w, h, z, face, t) {
  const back = -face;                       // it hangs on the far side
  const sway = Math.sin(t * 2.6) * 0.12 + Math.sin(t * 4.1) * 0.05;
  /* Wide and long enough to actually be seen.
   *
   * The first one was narrower than the body it hangs behind, so all that
   * showed was a red sliver under the feet. A cape only reads if it is
   * BIGGER than its wearer — that is the whole look. */
  const topY = py - h * 0.72;               // at the shoulders
  const hemY = py + h * 0.1;                // past the feet
  const topW = w * 0.46;
  const hemW = w * 1.24;

  ctx.save();
  // the body of it
  ctx.beginPath();
  ctx.moveTo(px - topW * 0.5, topY);
  ctx.lineTo(px + topW * 0.5, topY);
  // down the trailing edge, blown outward
  ctx.quadraticCurveTo(px + topW * 0.5 + back * w * 0.1, py - h * 0.3,
                       px + hemW * 0.5 + back * w * (0.3 + sway), hemY);
  // the hem, as a wave
  for (let i = 1; i <= 6; i++) {
    const u = i / 6;
    const x = px + hemW * 0.5 - hemW * u + back * w * (0.3 + sway) * (1 - u * 0.35);
    const y = hemY + Math.sin(t * 5 + u * 7) * h * 0.05 + (u < 1 ? h * 0.03 : 0);
    ctx.lineTo(x, y);
  }
  ctx.quadraticCurveTo(px - topW * 0.5 - back * w * 0.02, py - h * 0.3,
                       px - topW * 0.5, topY);
  ctx.closePath();
  const velvet = ctx.createLinearGradient(0, topY, 0, hemY);
  velvet.addColorStop(0, "#e14b63");
  velvet.addColorStop(0.55, "#c0304f");
  velvet.addColorStop(1, "#8d1f3a");
  ctx.fillStyle = velvet;
  ctx.fill();
  ctx.lineWidth = Math.max(1.4, z * 0.035);
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.stroke();

  // A gold hem, which is most of what makes it look expensive.
  ctx.strokeStyle = "rgba(255,214,90,0.9)";
  ctx.lineWidth = Math.max(1.6, z * 0.045);
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    const u = i / 6;
    const x = px + hemW * 0.5 - hemW * u + back * w * (0.3 + sway) * (1 - u * 0.35);
    const y = hemY + Math.sin(t * 5 + u * 7) * h * 0.05;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();

  // The ermine collar, and its flecks.
  ctx.fillStyle = "#fffaf0";
  roundRect(ctx, px - topW * 0.62, topY - h * 0.05, topW * 1.24, h * 0.13, h * 0.05);
  ctx.fill();
  ctx.strokeStyle = "rgba(120,110,96,0.35)";
  ctx.lineWidth = Math.max(1, z * 0.025);
  ctx.stroke();
  ctx.fillStyle = "rgba(60,52,46,0.55)";
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.ellipse(px + i * topW * 0.34, topY + h * 0.015, z * 0.022, z * 0.038, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * The crown. Worn by King Yhon Yhon, and by whoever takes it off him.
 *
 * Drawn taller and heavier than it was, with a velvet band and real jewels.
 * The first one was a small flat zigzag that read, at playing distance, as a
 * yellow smudge on the head — Charlie: "medyo emphasize pa natin na naging
 * king na talaga yung character ko". A crown has to be the first thing you
 * see about a character wearing one.
 */
function drawCrown(ctx, px, py, s, z) {
  ctx.save();
  const lw = Math.max(1.4, z * 0.035);

  // The band: a velvet cuff under the gold, which is what makes it read as a
  // crown rather than as a paper hat.
  ctx.fillStyle = "#c0304f";
  roundRect(ctx, px - s * 0.62, py - s * 0.12, s * 1.24, s * 0.26, s * 0.1);
  ctx.fill();
  ctx.strokeStyle = "rgba(90,20,36,0.5)";
  ctx.lineWidth = lw;
  ctx.stroke();

  // Five points, the middle one tallest, with a ball on each tip.
  const pts = [-0.56, -0.28, 0, 0.28, 0.56];
  const hts = [0.52, 0.72, 0.95, 0.72, 0.52];
  ctx.beginPath();
  ctx.moveTo(px - s * 0.62, py - s * 0.06);
  for (let i = 0; i < pts.length; i++) {
    ctx.lineTo(px + s * pts[i], py - s * hts[i]);
    const next = pts[i + 1];
    if (next !== undefined) ctx.lineTo(px + s * (pts[i] + next) / 2, py - s * 0.14);
  }
  ctx.lineTo(px + s * 0.62, py - s * 0.06);
  ctx.closePath();
  const gold = ctx.createLinearGradient(0, py - s * 0.95, 0, py);
  gold.addColorStop(0, "#fff6c9");
  gold.addColorStop(0.45, "#ffd24a");
  gold.addColorStop(1, "#d99a12");
  ctx.fillStyle = gold;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = lw;
  ctx.stroke();

  // A ball on every tip — the detail that says "gold" rather than "yellow".
  for (let i = 0; i < pts.length; i++) {
    ctx.fillStyle = "#fff3bd";
    ctx.beginPath();
    ctx.arc(px + s * pts[i], py - s * hts[i], s * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(200,150,20,0.6)";
    ctx.lineWidth = lw * 0.7;
    ctx.stroke();
  }

  // Jewels along the band.
  for (let i = -1; i <= 1; i++) {
    ctx.fillStyle = i === 0 ? "#ff4d6d" : "#7fd4ff";
    ctx.beginPath();
    ctx.arc(px + i * s * 0.32, py + s * 0.01, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = lw * 0.8;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Everything else that says KING, on a player who is wearing the crown.
 *
 * The crown alone was doing all the work and it is only as big as a head. A
 * player who has just beaten a boss should be unmistakable from anywhere on
 * the arena, so: gold light coming off the body, a ring of royal sparks
 * orbiting them, and a gold pool on the floor underneath. Together they read
 * before the crown is even legible.
 */
/**
 * The gold pool a crowned player stands in.
 *
 * Drawn BEFORE the character — a glow around a body floats, a pool
 * underneath says the light is coming off something standing there, but only
 * if the body is on top of it. Painted after, it washes out their feet and
 * the hem of the cape.
 */
function drawRoyalPool(ctx, px, py, w, h, dim) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = dim;
  const pool = ctx.createRadialGradient(px, py, 0, px, py, w * 1.1);
  pool.addColorStop(0, "rgba(255,214,90,0.5)");
  pool.addColorStop(1, "rgba(255,196,60,0)");
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.ellipse(px, py, w * 1.1, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRoyalty(r, ctx, g, a, px, py, left) {
  const z = r.cam.zoom;
  // `h` is still needed by the sparks below; deleting it when the pool moved
  // out of this function made drawRoyalty throw every frame, which layer()
  // swallowed — so the sparks simply stopped and nothing said why.
  const w = a.w * z, h = a.h * z;
  // Blinks out over the last second and a half, like every other timer here.
  const dim = left < 1.5 ? 0.35 + 0.35 * Math.abs(Math.sin(g.time * 16)) : 1;

  ctx.save();
  ctx.globalAlpha = dim;

  /* The pool on the floor is NOT here.
   *
   * It used to be, and this function runs after the body is on the canvas —
   * so a bright wash was painting over their feet and the bottom of the
   * cape. Charlie: "make yung nasa baba na glow sa likod nung character."
   * It is drawn with the cape and the glow now, before the sprite, in
   * drawActor's `korona` branch. See drawRoyalPool.
   *
   * What is left here is the one thing that SHOULD be in front: the sparks.
   */

  /* Royal sparks, orbiting. Six of them on a slow ellipse, each twinkling on
   * its own clock so the ring never reads as a solid hoop. */
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 6; i++) {
    const t = g.time * 1.3 + (i / 6) * Math.PI * 2;
    const sx = px + Math.cos(t) * w * 0.95;
    const sy = py - h * 0.55 + Math.sin(t) * h * 0.4;
    const tw = 0.5 + 0.5 * Math.abs(Math.sin(g.time * 5 + i * 2.1));
    const sz = z * 0.07 * tw;
    ctx.globalAlpha = dim * (0.5 + 0.5 * tw) * (Math.sin(t) < 0 ? 0.45 : 1);
    ctx.fillStyle = "#fff3bd";
    // A four-point star, not a dot — a dot is dust, a star is treasure.
    ctx.beginPath();
    ctx.moveTo(sx, sy - sz);
    ctx.quadraticCurveTo(sx, sy, sx + sz, sy);
    ctx.quadraticCurveTo(sx, sy, sx, sy + sz);
    ctx.quadraticCurveTo(sx, sy, sx - sz, sy);
    ctx.quadraticCurveTo(sx, sy, sx, sy - sz);
    ctx.fill();
  }
  ctx.restore();
  ctx.restore();
}

/** A boss health bar: big pips, not the player's small hearts. */
/* The boss's own bar. Same language as the players' — see drawHearts — and
 * deliberately louder than theirs.
 *
 * It stays over his head rather than becoming a banner at the top of the
 * screen: the thing you are judging is how close HE is to going down while
 * you decide whether to stand next to him, and that judgement belongs where
 * he is. Charlie: "actually yung hp sa taas niya na rin pero emphasize natin
 * since diba babaguhin nanatin yung hp."
 *
 * What makes it his and not a player's: a name over it, a red frame, three
 * fat segments instead of nine thin ones, and a pulse that gets faster as it
 * empties.
 */
function drawBossHearts(r, ctx, cx, cy, hp, max, z) {
  const W = z * 3.4;
  const H = z * 0.34;
  const skew = H * 0.55;
  const gap = Math.max(2, W * 0.016);
  const seg = (W - gap * (max - 1)) / max;
  const x0 = cx - W / 2;
  const top = cy - H / 2;

  const path = (i, frac) => {
    const L = x0 + i * (seg + gap);
    const R = L + seg * Math.max(0, Math.min(1, frac));
    ctx.beginPath();
    ctx.moveTo(L + skew, top);
    ctx.lineTo(R + skew, top);
    ctx.lineTo(R, top + H);
    ctx.lineTo(L, top + H);
    ctx.closePath();
  };

  ctx.save();
  // The name, small and spaced, so there is no doubt whose bar this is.
  ctx.font = `700 ${Math.max(8, z * 0.19).toFixed(1)}px "Nunito", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.lineWidth = Math.max(2, z * 0.05);
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.strokeText("KING YHON YHON", cx, top - z * 0.1);
  ctx.fillStyle = "#3a1050";
  ctx.fillText("KING YHON YHON", cx, top - z * 0.1);

  for (let i = 0; i < max; i++) {
    path(i, 1);
    ctx.fillStyle = "rgba(38,12,54,0.55)";
    ctx.fill();
    ctx.lineWidth = Math.max(1.4, z * 0.03);
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.stroke();

    if (i >= hp) continue;
    ctx.save();
    path(i, 1);
    ctx.clip();
    const grd = ctx.createLinearGradient(0, top, 0, top + H);
    grd.addColorStop(0, "#ff7a6a");
    grd.addColorStop(0.55, "#e01f3d");
    grd.addColorStop(1, "#8a0b33");
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillRect(x0 - W, top, W * 3, H * 0.3);
    ctx.restore();
  }

  // Down to his last: the whole frame pulses red, faster the lower it gets.
  if (hp > 0 && hp <= 1) {
    const beat = 0.5 + 0.5 * Math.sin(r.cam.t0 ? 0 : performance.now() / 90);
    ctx.globalAlpha = 0.25 + beat * 0.45;
    ctx.strokeStyle = "#ff3355";
    ctx.lineWidth = Math.max(2, z * 0.06);
    path(0, 1);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
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
/** The same colour, at an alpha. `mix` with t = 0 changes nothing but the
 *  fourth channel, which is all a gradient stop usually wants. */
const fade = (hex, a) => mix(hex, [0, 0, 0], 0, a);
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

/** One glove. Its own function because the punch THROWS one — see drawPunch. */
function gloveArt(ctx, gx, gy, rad, face, z) {
  const def = POWERUPS.suntok;
  // A mitt, a white cuff, and a knuckle line so it is not just a ball.
  ctx.fillStyle = def.colour;
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.lineWidth = Math.max(1.4, z * 0.03);
  ctx.beginPath();
  ctx.ellipse(gx, gy, rad * 1.05, rad, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.ellipse(gx - face * rad * 0.7, gy + rad * 0.2, rad * 0.4, rad * 0.55,
              0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(120,30,20,0.5)";
  ctx.lineWidth = Math.max(1, z * 0.018);
  ctx.beginPath();
  ctx.moveTo(gx + face * rad * 0.15, gy - rad * 0.5);
  ctx.lineTo(gx + face * rad * 0.15, gy + rad * 0.5);
  ctx.stroke();
}

/**
 * The gloves, worn for as long as you are holding a One Punch.
 *
 * You could not tell by looking. The fist is the single most decisive thing
 * anyone can be carrying — one input and the round is over — and until it was
 * thrown the player holding it looked exactly like the player who was not, so
 * the other one had no reason to change what they were doing. That is a
 * warning the game owed them. Charlie: "dapat may hawak na gloves yung
 * character pag may one punch man sha. Para nakikita na hala meron pala siya,
 * and its glowing para nakakatakot."
 *
 * Two of them, riding the walk out of phase with each other, with the light
 * pulsing — it is meant to be read across the arena, not admired up close.
 */
function drawGloves(r, ctx, g, a) {
  if (a.dead || !a.power || a.power.type !== "suntok") return;
  // Mid-punch the fist has its own drawing, and two of them fighting over the
  // same hand is worse than neither.
  if (a.punch && punchPhaseAt(g.time, a.punch)) return;

  const def = POWERUPS.suntok;
  const z = r.cam.zoom;
  const px = toX(r, a.x);
  const py = toY(r, a.y);
  const face = a.face || 1;
  const beat = 0.5 + 0.5 * Math.sin(g.time * 5.2);
  const swing = Math.sin((a.walk || 0) * 2) * a.w * z * 0.16;

  ctx.save();
  for (const side of [-1, 1]) {
    // Front hand leads, back hand trails: the same offset the legs use.
    const gx = px + face * a.w * z * 1.25 * 0.4 * side + (side > 0 ? swing : -swing);
    // Hand height, the same as every other thing anyone holds — off the
    // sprite, not the hitbox.
    const gy = py - a.h * z * 1.32 * (0.3 + (side > 0 ? 0.03 : -0.015))
               + Math.sin(g.time * 3 + side) * z * 0.02;
    const rad = z * 0.115;

    // The light first, and it is the loud part.
    const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, rad * (3.1 + beat * 0.7));
    glow.addColorStop(0, `rgba(255,140,110,${(0.6 + beat * 0.3).toFixed(3)})`);
    glow.addColorStop(0.45, `rgba(255,90,70,${(0.26 + beat * 0.14).toFixed(3)})`);
    glow.addColorStop(1, "rgba(255,90,70,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(gx, gy, rad * (3.1 + beat * 0.7), 0, Math.PI * 2);
    ctx.fill();

    gloveArt(ctx, gx, gy, rad, face, z);

    // An ember or two lifting off, because a still glow is a sticker.
    const k = (g.time * 0.8 + (side > 0 ? 0 : 0.5)) % 1;
    ctx.globalAlpha = Math.sin(k * Math.PI) * 0.75;
    ctx.fillStyle = "#ffd27a";
    ctx.beginPath();
    ctx.arc(gx + Math.sin(k * 6 + side) * rad * 0.9, gy - k * z * 0.5,
            z * 0.035 * (1 - k), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/** punchPhase, for the renderer — it has no G to read the clock from. */
function punchPhaseAt(now, punch) {
  const def = POWERUPS.suntok;
  const t = (now - punch.at) * 1000;
  if (t < def.windupMs + def.activeMs) return true;
  return false;
}

/**
 * Excalibur — held, and swung.
 *
 * Two jobs and they matter differently. The HELD sword is what tells the
 * other player what you are carrying from across the arena, before anything
 * has happened; the SWING is a shape that has to be read in a sixth of a
 * second, so it is one bright crescent rather than a picture of a blade in
 * motion. A drawn sword rotating accurately through an arc is, at forty
 * pixels, a grey smear — the crescent is the arc itself, which is the part
 * you are meant to judge distance against.
 */
function drawSword(r, ctx, g, a) {
  if (a.dead) return;
  const holding = a.power && a.power.type === "espada";
  const ph = a.swing ? swingPhaseAt(g.time, a.swing) : null;
  if (!holding && !ph) return;

  const def = POWERUPS.espada;
  const z = r.cam.zoom;
  const px = toX(r, a.x);
  const py = toY(r, a.y);
  const midY = py - a.h * z * 0.55;

  if (ph && ph.state === "out") {
    const face = a.swing.face;
    const k = ph.t;                      // 0..1 through the dangerous part
    const fade = 1 - k;
    // Over the top, or up from below — trySwing alternates them.
    const from = a.swing.up ? 1.15 : -1.15;
    const to = a.swing.up ? -0.95 : 0.95;
    const ang = from + (to - from) * k;
    const R = def.reach * z * 0.92;

    ctx.save();
    ctx.translate(px, midY);
    ctx.scale(face, 1);

    /* The sweep: a filled wedge between where the blade was and where it is,
     * which is the only honest way to draw "everything in here was cut". */
    const back = from + (to - from) * Math.max(0, k - 0.42);
    const grd = ctx.createRadialGradient(0, 0, R * 0.25, 0, 0, R);
    grd.addColorStop(0, `rgba(255,255,255,${(0.05 * fade).toFixed(3)})`);
    grd.addColorStop(0.72, `rgba(127,227,255,${(0.34 * fade).toFixed(3)})`);
    grd.addColorStop(1, `rgba(233,250,255,${(0.8 * fade).toFixed(3)})`);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, Math.min(ang, back), Math.max(ang, back));
    ctx.closePath();
    ctx.fill();

    // The leading edge, white-hot — and it is the thing you actually read the
    // swing by, so it is a band rather than a line. "yung range ok na yung
    // itsura lang pati slash mas mukhang makapal pls."
    ctx.strokeStyle = `rgba(255,255,255,${(0.95 * fade).toFixed(3)})`;
    ctx.lineWidth = Math.max(4, z * 0.17);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.96, ang - 0.2, ang + 0.2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(127,227,255,${(0.6 * fade).toFixed(3)})`;
    ctx.lineWidth = Math.max(6, z * 0.28);
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.9, ang - 0.34, ang + 0.34);
    ctx.stroke();

    // ...and the blade itself, on that edge, so there is a sword in the sweep
    // rather than only a light.
    ctx.save();
    ctx.rotate(ang);
    ctx.fillStyle = "#eaf9ff";
    ctx.strokeStyle = "rgba(90,150,180,0.75)";
    ctx.lineWidth = Math.max(1, z * 0.018);
    // A broad blade. At z*0.055 it was a needle — "ang nipis ng excalibur".
    ctx.beginPath();
    ctx.moveTo(R * 0.2, -z * 0.14);
    ctx.lineTo(R * 0.92, -z * 0.085);
    ctx.lineTo(R, 0);
    ctx.lineTo(R * 0.92, z * 0.085);
    ctx.lineTo(R * 0.2, z * 0.14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffd86b";
    ctx.fillRect(R * 0.1, -z * 0.2, z * 0.075, z * 0.4);      // crossguard
    ctx.restore();
    ctx.restore();

    // It BIT something: a clean flash at the point of contact.
    if (a.swing.hit && a.swing.landAt != null) {
      const bt = (g.time - a.swing.landAt) / 0.22;
      if (bt >= 0 && bt < 1) {
        ctx.save();
        ctx.globalAlpha = 1 - bt;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = Math.max(2, z * 0.06 * (1 - bt));
        const hx = px + face * def.reach * z * 0.5;
        for (const d of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(hx - face * z * 0.5, midY + d * z * 0.5 * (1 + bt));
          ctx.lineTo(hx + face * z * 0.5, midY - d * z * 0.5 * (1 + bt));
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    return;
  }

  /* Resting: carried point-up beside the shoulder, bobbing with the walk.
   * This is the half that does the work between swings — a player holding a
   * sword has to look like one from the other side of the arena. */
  const s = z * 0.34;
  // The same hand the gun is in — see the weapon block in drawActor, and the
  // same sprite-derived numbers.
  const hx = px + (a.face || 1) * a.w * z * 1.25 * 0.4;
  const hy = py - a.h * z * 1.32 * 0.3 + Math.sin(g.time * 2.4 + a.x) * z * 0.03;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate((a.face || 1) * -0.25);
  // A little light off it, so it reads as Excalibur rather than a stick.
  const glow = ctx.createRadialGradient(0, -s * 0.6, 0, 0, -s * 0.6, s * 1.5);
  glow.addColorStop(0, "rgba(127,227,255,0.45)");
  glow.addColorStop(1, "rgba(127,227,255,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, -s * 0.6, s * 1.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#eaf9ff";
  ctx.strokeStyle = "rgba(90,150,180,0.8)";
  ctx.lineWidth = Math.max(1, z * 0.016);
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.5);
  ctx.lineTo(s * 0.3, -s * 1.12);
  ctx.lineTo(s * 0.3, -s * 0.2);
  ctx.lineTo(-s * 0.3, -s * 0.2);
  ctx.lineTo(-s * 0.3, -s * 1.12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffd86b";
  ctx.fillRect(-s * 0.56, -s * 0.26, s * 1.12, s * 0.17);     // crossguard
  ctx.fillStyle = "#b9752f";
  ctx.fillRect(-s * 0.12, -s * 0.12, s * 0.24, s * 0.4);      // grip
  ctx.fillStyle = "#ffd86b";
  ctx.beginPath();
  ctx.arc(0, s * 0.34, s * 0.15, 0, Math.PI * 2);             // pommel
  ctx.fill();
  ctx.restore();
}

/** The rules' own swingPhase, for the renderer — it has no G to read. */
function swingPhaseAt(now, swing) {
  const def = POWERUPS.espada;
  const t = (now - swing.at) * 1000;
  if (t < def.windupMs) return { state: "wind", t: t / def.windupMs };
  if (t < def.windupMs + def.activeMs)
    return { state: "out", t: (t - def.windupMs) / def.activeMs };
  return null;
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

  /* The punch itself is a GLOVE thrown down the lane.
   *
   * It was a red ring swelling outward, which had a job — the hitbox is
   * invisible and the size of a fist, so a miss never explained itself — and
   * did it by putting an abstract shape on screen that belonged to nothing.
   * The glove does the same job and is a thing: you can see it leave, you
   * can see how far it went, and on a miss you watch it sail past and drop.
   * Charlie: "when one punch man miss, and didnt hit, can we instead of the
   * circle red that goes to the missed direction, the gloves being thrown at."
   *
   * On a MISS it keeps going past the end of the swing and falls away, which
   * is the whole of the feedback: the reach was real and it was short.
   */
  {
    const face = a.punch.face;
    const t = (ms - def.windupMs) / def.activeMs;     // 1 at the end of reach
    const missing = !a.punch.hit;
    // Past 1 it is only drawn on a miss, and only for a moment.
    const show = live || (missing && t >= 0 && t < 2.1);
    if (show && t >= 0) {
      const flight = Math.min(t, 1) + Math.max(0, t - 1) * 0.55;
      const gx = toX(r, a.x + face * (a.w / 2 + 0.2 + def.reach * flight * 0.95));
      const gy = py + Math.max(0, t - 1) * Math.max(0, t - 1) * z * 1.5;  // it drops
      const fade = t <= 1 ? 1 : Math.max(0, 1 - (t - 1) / 1.1);
      const rad = z * 0.135;

      ctx.save();
      ctx.globalAlpha = fade;
      // Three ghosts behind it, which is the reach drawn as a path.
      for (let i = 3; i >= 1; i--) {
        const back = Math.max(0, flight - i * 0.16);
        const bxp = toX(r, a.x + face * (a.w / 2 + 0.2 + def.reach * back * 0.95));
        ctx.globalAlpha = fade * (0.1 + (3 - i) * 0.09);
        gloveArt(ctx, bxp, py, rad * (0.7 + i * 0.05), face, z);
      }
      ctx.globalAlpha = fade;
      // Heat off it, so it is plainly the dangerous thing in the air.
      const heat = ctx.createRadialGradient(gx, gy, 0, gx, gy, rad * 2.6);
      heat.addColorStop(0, "rgba(255,150,110,0.55)");
      heat.addColorStop(1, "rgba(255,110,80,0)");
      ctx.fillStyle = heat;
      ctx.beginPath();
      ctx.arc(gx, gy, rad * 2.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(gx, gy);
      // It tumbles once it is past the end of the arm.
      ctx.rotate(Math.max(0, t - 0.9) * face * 7);
      gloveArt(ctx, 0, 0, rad, face, z);
      ctx.restore();
      ctx.restore();
    }
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

      /* ...and the WAVE, out across the arena.
       *
       * The blast is a corridor now — everything in front of you, level with
       * the fist — and a ring drawn at the fist says nothing about that. This
       * is the part that tells both players what the move actually did, and
       * it has to arrive fast: it crosses the whole reach in the first third
       * of the animation, because a shockwave that travels slowly enough to
       * watch is a projectile, and this is not one.
       */
      const face = a.punch.face;
      const head = Math.min(1, bt * 3.2);          // how far the front has got
      const tail = Math.max(0, (bt - 0.22) * 2.3); // ...and the back
      if (head > tail) {
        const x0 = px + face * def.reachX * z * tail;
        const x1 = px + face * def.reachX * z * head;
        const halfH = z * def.reachY;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = (1 - bt) * (1 - bt) * 0.95;
        // A lens shape: fat at the fist end, tapering to the front, so it
        // reads as something LEAVING rather than as a painted bar.
        const wave = ctx.createLinearGradient(x0, 0, x1, 0);
        wave.addColorStop(0, "rgba(255,120,80,0)");
        wave.addColorStop(0.35, "rgba(255,180,90,0.75)");
        wave.addColorStop(0.85, "rgba(255,245,210,0.95)");
        wave.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = wave;
        ctx.beginPath();
        ctx.moveTo(x0, py - halfH * 0.25);
        ctx.quadraticCurveTo((x0 + x1) / 2, py - halfH, x1, py - halfH * 0.18);
        ctx.lineTo(x1, py + halfH * 0.18);
        ctx.quadraticCurveTo((x0 + x1) / 2, py + halfH, x0, py + halfH * 0.25);
        ctx.closePath();
        ctx.fill();

        // Streaks inside it, which is what gives a wave a direction.
        ctx.globalAlpha = (1 - bt) * 0.6;
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = Math.max(1.5, z * 0.045);
        for (let i = 0; i < 7; i++) {
          const n = noiseAt(i * 5 + 31);
          const y = py + (n - 0.5) * halfH * 1.5;
          const sx = x0 + (x1 - x0) * (0.1 + n * 0.55);
          ctx.beginPath();
          ctx.moveTo(sx, y);
          ctx.lineTo(sx + face * (x1 - x0) * 0.3, y);
          ctx.stroke();
        }
        ctx.restore();
      }
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
/**
 * The same shape, flattened to one solid colour, drawn ONCE on top.
 *
 * A tint has to follow the body. The first attempt used
 * `globalCompositeOperation = "source-atop"` and a rectangle, which tints
 * every pixel already on the canvas inside that rectangle — and the canvas by
 * that point holds the whole scene, so what appeared over King Yhon Yhon was
 * a hard pink RECTANGLE with the sky and the platforms inside it. Visible
 * immediately in a screenshot and not at all in the code.
 *
 * This borrows stampOutline's trick — draw into a scratch canvas, then
 * `source-in` a flat fill over it, keeping only the alpha — and blits the
 * result in place rather than around a ring.
 */
function drawSilhouette(r, ctx, colour, alpha, cx, cy, w, h, drawInto) {
  const padX = Math.ceil(w * 0.6) + 4;
  const padY = Math.ceil(h * 0.25) + 4;
  const cw = Math.ceil(w) + padX * 2;
  const ch = Math.ceil(h) + padY * 2;
  if (cw <= 0 || ch <= 0 || cw > 2048 || ch > 2048) return;

  // Its own buffer: stampOutline's is often mid-use by the caller above.
  const buf = r.tintBuf || (r.tintBuf = document.createElement("canvas"));
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
  b.globalCompositeOperation = "source-in";
  /* `colour` may be a function, which is handed the buffer and the box the
   * shape occupies inside it. That is the only way to fill a silhouette with
   * a GRADIENT: the gradient's coordinates have to be buffer coordinates, and
   * the caller has no idea what those are — the padding is worked out here. */
  if (typeof colour === "function") colour(b, padX, padY, w, h);
  else { b.fillStyle = colour; b.fillRect(0, 0, cw, ch); }
  b.globalCompositeOperation = "source-over";

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(buf, 0, 0, cw, ch, cx - padX - w / 2, cy - padY - h, cw, ch);
  ctx.restore();
}

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
  /* `colour` may be a function, which is handed the buffer and the box the
   * shape occupies inside it. That is the only way to fill a silhouette with
   * a GRADIENT: the gradient's coordinates have to be buffer coordinates, and
   * the caller has no idea what those are — the padding is worked out here. */
  if (typeof colour === "function") colour(b, padX, padY, w, h);
  else { b.fillStyle = colour; b.fillRect(0, 0, cw, ch); }
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

/**
 * The bazooka shell in flight.
 *
 * It was the ordinary bullet sprite with homing bolted on, which Charlie
 * summed up exactly: "kasi parang gun lang na sumusunod right now e". A
 * rocket is a different object — it has a nose, it has fins, it burns out of
 * the back, and it leaves the air behind it dirty. And because this one
 * STEERS, it has to be drawn along its own heading rather than flipped
 * left-or-right like a bullet; a shell curving upward while pointing
 * sideways is the tell that it is a bullet in costume.
 */
function drawRocket(r, ctx, g, b) {
  const z = r.cam.zoom;
  const px = toX(r, b.x);
  const py = toY(r, b.y);
  const ang = Math.atan2(b.vy, b.vx);
  const age = b.born === undefined ? 99 : Math.max(0, g.time - b.born);
  // Sized against the launcher it came out of, which is now nearly as tall
  // as a character — a pea leaving a cannon looks wrong.
  const L = z * 0.9;               // body length
  const W = z * 0.27;              // and half its width
  // Burn flicker, fast and deterministic so both phones see the same flame.
  const burn = 0.72 + 0.28 * Math.sin(g.time * 47 + b.x * 3);

  /* The trail first, so everything else sits on top of it.
   *
   * Traced back along the CURRENT heading rather than from a history of
   * where it has been — over the last few puffs' worth of distance a steering
   * shell is near enough straight, and this costs no state on either side. */
  ctx.save();
  for (let i = 1; i <= 12; i++) {
    const back = i * L * 0.62;
    const n1 = noiseAt(i * 3 + Math.floor(b.born * 97));
    const n2 = noiseAt(i * 3 + 1 + Math.floor(b.born * 97));
    const drift = (n1 - 0.5) * z * 0.12 * i;
    const tx = px - Math.cos(ang) * back - Math.sin(ang) * drift;
    const ty = py - Math.sin(ang) * back + Math.cos(ang) * drift - i * z * 0.02;
    const rad = z * (0.09 + i * 0.035) * (0.7 + n2 * 0.6);
    // Younger puffs nearer the tail are still hot; the far ones are grey.
    const hot = i < 3;
    ctx.globalAlpha = Math.max(0, (1 - i / 12)) * (hot ? 0.5 : 0.34)
                    * Math.min(1, age * 6);
    ctx.drawImage(softDot(hot ? "255,196,96" : i % 2 ? "142,132,126" : "96,88,84"),
                  tx - rad, ty - rad, rad * 2, rad * 2);
  }
  ctx.restore();

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(ang);

  /* The flame, out of the back. Two cones — a wide orange one and a short
   * white core — both flickering, because a steady flame is a nozzle and a
   * flickering one is thrust. */
  ctx.globalCompositeOperation = "lighter";
  for (const [len, wide, col] of [[L * (2.1 * burn), W * 1.15, "rgba(255,138,45,0.55)"],
                                  [L * (1.15 * burn), W * 0.66, "rgba(255,226,120,0.8)"],
                                  [L * (0.6 * burn), W * 0.34, "rgba(255,255,240,0.95)"]]) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(-L * 0.52, -wide);
    ctx.quadraticCurveTo(-L * 0.52 - len * 0.6, -wide * 0.35, -L * 0.52 - len, 0);
    ctx.quadraticCurveTo(-L * 0.52 - len * 0.6, wide * 0.35, -L * 0.52, wide);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";

  // Fins — two at the tail, so it reads as a thing that was aimed.
  ctx.fillStyle = "#b9452a";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-L * 0.42, side * W * 0.5);
    ctx.lineTo(-L * 0.68, side * W * 1.5);
    ctx.lineTo(-L * 0.24, side * W * 0.95);
    ctx.closePath();
    ctx.fill();
  }

  /* The body: a capsule with a nose cone. White rim, like every other thing
   * in this game that has to hold against sky, dirt and a treeline. */
  ctx.beginPath();
  ctx.moveTo(L * 0.62, 0);                       // the point
  ctx.quadraticCurveTo(L * 0.3, -W, -L * 0.1, -W);
  ctx.lineTo(-L * 0.5, -W * 0.82);
  ctx.quadraticCurveTo(-L * 0.62, 0, -L * 0.5, W * 0.82);
  ctx.lineTo(-L * 0.1, W);
  ctx.quadraticCurveTo(L * 0.3, W, L * 0.62, 0);
  ctx.closePath();
  const body = ctx.createLinearGradient(0, -W, 0, W);
  body.addColorStop(0, "#ffd9a8");
  body.addColorStop(0.42, POWERUPS.bazuka.colour);
  body.addColorStop(1, "#a8521f");
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = Math.max(1.4, z * 0.035);
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.stroke();

  // A dark nose cone and a band, so it is not one smooth blob.
  ctx.fillStyle = "#3f2a22";
  ctx.beginPath();
  ctx.moveTo(L * 0.62, 0);
  ctx.quadraticCurveTo(L * 0.34, -W * 0.92, L * 0.2, -W * 0.72);
  ctx.lineTo(L * 0.2, W * 0.72);
  ctx.quadraticCurveTo(L * 0.34, W * 0.92, L * 0.62, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillRect(-L * 0.06, -W * 0.95, L * 0.1, W * 1.9);
  ctx.restore();
}

function drawShots(r, ctx, g) {
  if (!g.shots) return;
  const z = r.cam.zoom;
  for (const b of g.shots) {
    // A bazooka shell is not a bullet and must not be drawn as one.
    if (b.homing) { drawRocket(r, ctx, g, b); continue; }
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
/* The health bar over a character's head.
 *
 * It was a row of hearts, wrapping to three rows once the Big Heart could put
 * you on nine — which is a lot of small red shapes over a small animal, and
 * at nine it was a wall of them. Charlie: "lets make it a progress bar with
 * cut diagonally. di na heart. tapos pag nababawasan, alam mo yung idea na
 * magwwhite muna yung nabawasan na part tapos magiign transparent."
 *
 * So: one bar, cut into slanted segments, one per heart. The diagonal is not
 * decoration — it is what lets nine segments sit in the width of a character
 * and still be countable, because a slanted gap reads as a division at a size
 * where a vertical one reads as an artefact.
 *
 * WHAT WAS JUST LOST goes white and then fades out of it, which is the part
 * that carries the hit: a bar that simply gets shorter tells you the number
 * afterwards, and a bar that flashes the piece it lost tells you what
 * happened. The memory of it is kept here rather than sent — every screen
 * watches the same hp fall, so every screen can see the same piece go.
 */
function drawHearts(r, ctx, g, a, cx, cy) {
  const z = r.cam.zoom;
  // Only as many slots as you have earned: a healthy player should not look
  // permanently six down because nine is possible.
  const max = Math.max(FEEL.hp, Math.ceil(a.hp));

  /* The ghost of the last hit. Renderer-local, per actor. */
  const mem = (r.hpMem || (r.hpMem = {}));
  const was = mem[a.id];
  if (!was || was.hp === undefined) mem[a.id] = { hp: a.hp, lostFrom: 0, lostTo: 0, at: -9 };
  else if (a.hp < was.hp) mem[a.id] = { hp: a.hp, lostFrom: a.hp, lostTo: was.hp, at: g.time };
  else if (a.hp > was.hp) mem[a.id] = { hp: a.hp, lostFrom: 0, lostTo: 0, at: -9 };
  const m = mem[a.id];
  /* The white HOLDS, then goes. A straight fade from the first frame means
   * the brightest moment is one frame long and the eye misses it; this one is
   * fully white for the first 45% of the window and only then transparent. */
  const GHOST = 0.72;
  const ghostAge = g.time - m.at;
  const raw = ghostAge >= 0 && ghostAge < GHOST ? 1 - ghostAge / GHOST : 0;
  const ghosting = raw <= 0 ? 0 : Math.min(1, raw / 0.55);

  // Bigger than the first pass at it — "lets make character hp larger" — and
  // still tied to the body it belongs to.
  const W = Math.max(z * 1.15, a.w * z * 1.6);
  const H = z * 0.24;
  const skew = H * 0.62;                     // how far the cut leans
  const gap = Math.max(1.5, W * 0.016);
  const seg = (W - gap * (max - 1)) / max;
  const x0 = cx - W / 2;
  const top = cy - H / 2;

  /* Just hit: the bar SWELLS and settles.
   *
   * Not a vibration — a single clean grow-and-return, on the same clock as
   * the white flash, so the three beats read in order: it gets bigger, the
   * piece you lost is unmistakably white, then that piece goes. Charlie:
   * "medyo empasize mo pag hit yung hp bar, parang lalaki siya animation, it
   * will be bigger for a bit tapos kitang kita yung white for a sec tapos
   * magdidisappear magiging transparent." */
  const swell = ghosting > 0 ? Math.sin(Math.min(1, ghostAge / GHOST) * Math.PI) : 0;
  const kick = 1 + swell * 0.34;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(kick, kick);
  ctx.translate(-cx, -cy);

  /* One segment, as a path — slanted in the middle, SQUARE at the two ends.
   *
   * The whole bar is a rectangle and only the divisions between the hearts
   * lean: "tbh i want it rectangle pa rin pero diagonal cuts yung pagkakahati
   * ng hp's." That is the right call and it is not the same shape at all — a
   * bar made of parallelograms has two sloping ends and reads as a torn strip
   * of paper, where a rectangle cut diagonally reads as a gauge that somebody
   * divided up.
   *
   * So the lean is dropped on whichever edge is the outside of the bar. */
  const seg_path = (i, frac) => {
    const f = Math.max(0, Math.min(1, frac));
    const L = x0 + i * (seg + gap);
    const R = L + seg * f;
    const lLean = i === 0 ? 0 : skew;                    // flat left end
    const rLean = i === max - 1 && f >= 1 ? 0 : skew;    // flat right end
    ctx.beginPath();
    ctx.moveTo(L + lLean, top);
    ctx.lineTo(R + rLean, top);
    ctx.lineTo(R, top + H);
    ctx.lineTo(L, top + H);
    ctx.closePath();
  };

  /* One white frame round the WHOLE bar, under the segments.
   *
   * Stroking each segment gave it an edge everywhere including down the
   * middle, which at speed reads as a fence rather than as a bar. This is the
   * outline: a single rounded rectangle, fat, so the thing holds against sky,
   * hill and treeline the way every other small object in this game does.
   * "lets make character hp larger and have a white outline." */
  ctx.beginPath();
  const pad = Math.max(2.5, z * 0.042);
  ctx.roundRect(x0 - pad, top - pad, W + pad * 2, H + pad * 2, (H + pad * 2) * 0.28);
  ctx.strokeStyle = "rgba(255,255,255,0.96)";
  ctx.lineWidth = pad * 2;
  ctx.stroke();
  ctx.fillStyle = "rgba(26,38,52,0.38)";
  ctx.fill();

  for (let i = 0; i < max; i++) {
    // The empty channel, so the bar has a length to read against.
    seg_path(i, 1);
    ctx.fillStyle = "rgba(26,38,52,0.3)";
    ctx.fill();

    /* The piece that has just gone: white first, then out.
     *
     * Drawn under the live fill so a half-heart loss shows the half that
     * went beside the half that is left, rather than over it. */
    if (ghosting > 0) {
      const gf = Math.max(0, Math.min(1, m.lostTo - i));
      const lf = Math.max(0, Math.min(1, m.lostFrom - i));
      if (gf > lf) {
        ctx.save();
        seg_path(i, gf);
        ctx.clip();
        seg_path(i, 1);
        ctx.fillStyle = `rgba(255,255,255,${(0.95 * ghosting).toFixed(3)})`;
        ctx.fill();
        ctx.restore();
      }
    }

    const fill = Math.max(0, Math.min(1, a.hp - i));
    if (fill <= 0) continue;
    /* The three you start with are red; everything past them is gold.
     *
     * Same rule the hearts had, and it is worth keeping: a spare heart is a
     * thing you went and got, and it should not look like the ones you were
     * given. */
    const spare = i >= FEEL.hp;
    ctx.save();
    seg_path(i, fill);
    ctx.clip();
    seg_path(i, 1);
    const grd = ctx.createLinearGradient(0, top, 0, top + H);
    if (spare) {
      grd.addColorStop(0, "#ffe9a8");
      grd.addColorStop(1, "#f5b43a");
    } else {
      grd.addColorStop(0, "#ff8fa6");
      grd.addColorStop(1, "#e8324f");
    }
    ctx.fillStyle = grd;
    ctx.fill();
    // A sheen along the top, so it reads as a bar and not a sticker.
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillRect(x0 - W, top, W * 3, H * 0.34);
    ctx.restore();
  }

  /* The cuts, in white, drawn LAST.
   *
   * The divisions used to be the dark channel showing between segments, which
   * reads as a gap in the bar rather than as a division of it — and inside a
   * white frame it looked like the bar had holes punched in it. Charlie:
   * "even yung hp diagonal cuts should be white outline."
   *
   * After the fills, not before: a line drawn first is simply painted over by
   * the segment beside it. */
  ctx.beginPath();
  for (let i = 1; i < max; i++) {
    const L = x0 + i * (seg + gap) - gap * 0.5;
    ctx.moveTo(L + skew, top);
    ctx.lineTo(L, top + H);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.96)";
  ctx.lineWidth = Math.max(2.5, gap * 2.6);
  ctx.lineCap = "butt";
  ctx.stroke();

  ctx.restore();
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
  /* Thrown, whether or not they were taken off the board.
   *
   * This tested `a.dead`, which was right while every lost heart was a
   * respawn. It is not any more — a hit leaves you standing exactly where you
   * were — so the one blow that DOES end things, the killing one, had its
   * body animation silently skipped: the character stood still at zero hearts
   * while the round ended around them. Charlie, after One Punch sent nobody
   * anywhere: "it just froze kasi death na hmm."
   *
   * The animation belongs to `defeat` existing, not to `dead`. A pit death
   * still sets both. */
  const d0 = a.defeat;
  const flying = d0 && g.time - d0.at >= 0 && g.time - d0.at <= DEFEAT_SEC;
  if (a.dead || flying) {
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
  /* A little shudder of the BODY when they are hit — not the camera.
   *
   * Charlie: "add a little shake din, subtle lang when hit yung other
   * character ... just animation not the view." The screen no longer moves at
   * all for a hit, which is what was asked for, but that left the blow with
   * nothing physical to show. Half a tile of wobble on the character alone
   * says "that landed" without touching the framing, and it decays inside a
   * fifth of a second so it never fights the running animation.
   *
   * Derived from the grace deadline, which is already on the wire. */
  const hurtAge = FEEL.hurtInvulnMs / 1000 - ((a.invulnUntil || 0) - g.time);
  const crowned = !!a.crowned;
  const shudder = (hurtAge >= 0 && hurtAge < 0.18 && !crowned)
    ? Math.sin(hurtAge * 95) * (1 - hurtAge / 0.18) * z * 0.11
    : 0;
  const px = toX(r, a.x + (a.ox || 0)) + kick * z * 0.16 + shudder;
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

  /* The Shield: a hard bubble, and a clock you can read from across the map.
   *
   * It has to look DIFFERENT from the grace bubble below, which is soft,
   * white and short. This one is cyan, has an edge, and carries a ring that
   * empties as the five and a half seconds run down — the whole design of
   * the power-up is that the other player can see exactly how long they have
   * to stay away, and a bubble with no clock on it is just a bubble.
   */
  if (a.shieldUntil && g.time < a.shieldUntil) {
    /* An energy shield, and it has to SHOUT.
     *
     * The first one was a pale glass bubble with a thin ring on it, and at
     * playing distance it read as a faint outline around the character —
     * Charlie: "di masyado visible yung shield effect sa character dapat mas
     * more and with animation."
     *
     * The problem was that it was all edge and no substance. What makes a
     * shield read is the SURFACE: something happening across the whole dome,
     * moving, so the eye sees a field rather than a circle. So it has a
     * hexagonal lattice turning slowly inside it, a highlight sweeping round
     * the rim, sparks riding the edge, and a countdown that is now a fat arc
     * rather than a hairline. It also breathes.
     */
    const def = POWERUPS.kalasag;
    const left = Math.max(0, a.shieldUntil - g.time);
    const frac = Math.max(0, Math.min(1, left / (def.ms / 1000)));
    /* A CIRCLE, and a wide one.
     *
     * It was an ellipse derived from the body — 1.15 of the width by 0.86 of
     * the height — so it came out a tall oblong shrink-wrapped to the
     * character, which is a costume rather than a field. Charlie: "lets
     * increase the aura circle sakop of shield.. and make sure its fully
     * circle not oblong covering the body."
     *
     * One radius, taken from whichever of the two the body is bigger in, so
     * it stays round on every character and at every size — including a
     * crowned one, who is two and a half times the ordinary body. */
    const cx = px, cy = py - a.h * z * 0.5;
    const rad = Math.max(a.w * z, a.h * z * 0.9) * 1.32;
    const beat = 1 + 0.035 * Math.sin(g.time * 4.5);
    const RX = rad * beat, RY = rad * beat;

    ctx.save();
    // Blinks over the last second, like every other timer in the game.
    ctx.globalAlpha = left < 1 ? 0.5 + 0.45 * Math.abs(Math.sin(g.time * 18)) : 1;

    /* The field itself — bright at the rim, hollow in the middle so the
     * character stays legible through it. This is the part that was missing. */
    const glass = ctx.createRadialGradient(cx, cy, RX * 0.25, cx, cy, RX);
    glass.addColorStop(0, "rgba(127,212,255,0.04)");
    glass.addColorStop(0.55, "rgba(127,212,255,0.16)");
    glass.addColorStop(0.86, "rgba(150,228,255,0.42)");
    glass.addColorStop(1, "rgba(220,248,255,0.72)");
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.ellipse(cx, cy, RX, RY, 0, 0, Math.PI * 2);
    ctx.fill();

    /* The lattice. Clipped to the dome and turning, which is the whole
     * animation — a still pattern is wallpaper. */
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, RX, RY, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalAlpha *= 0.5;
    ctx.strokeStyle = "rgba(190,240,255,0.9)";
    ctx.lineWidth = Math.max(1, z * 0.025);
    const cell = z * 0.34;
    const spin = g.time * 0.5;
    for (let ring = 1; ring <= 3; ring++) {
      for (let i = 0; i < ring * 6; i++) {
        const ang = spin * (ring % 2 ? 1 : -1) + (i / (ring * 6)) * Math.PI * 2;
        const hx = cx + Math.cos(ang) * cell * ring * 1.1;
        const hy = cy + Math.sin(ang) * cell * ring * 0.85;
        ctx.beginPath();
        for (let k = 0; k <= 6; k++) {
          const ha = (k / 6) * Math.PI * 2 + Math.PI / 6;
          const hxx = hx + Math.cos(ha) * cell * 0.5;
          const hyy = hy + Math.sin(ha) * cell * 0.5;
          k ? ctx.lineTo(hxx, hyy) : ctx.moveTo(hxx, hyy);
        }
        ctx.stroke();
      }
    }
    ctx.restore();

    // The rim, thick and bright.
    ctx.lineWidth = Math.max(3, z * 0.1);
    ctx.strokeStyle = "rgba(226,250,255,0.95)";
    ctx.beginPath();
    ctx.ellipse(cx, cy, RX, RY, 0, 0, Math.PI * 2);
    ctx.stroke();

    /* The clock, ON the rim and fat enough to read across the arena. It is
     * the reason the other player can wait this out rather than guess. */
    ctx.lineWidth = Math.max(4, z * 0.13);
    ctx.strokeStyle = def.colour;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.ellipse(cx, cy, RX, RY, 0, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();

    // A highlight sweeping round it, so the surface is plainly moving.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const sweep = -g.time * 1.6;
    ctx.globalAlpha *= 0.9;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = Math.max(3, z * 0.09);
    ctx.beginPath();
    ctx.ellipse(cx, cy, RX, RY, 0, sweep, sweep + 0.8);
    ctx.stroke();
    ctx.restore();

    // ...and sparks riding the edge.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 5; i++) {
      const ang = g.time * 2.1 + (i / 5) * Math.PI * 2;
      const sx = cx + Math.cos(ang) * RX;
      const sy = cy + Math.sin(ang) * RY;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(g.time * 7 + i * 2));
      ctx.globalAlpha = tw;
      ctx.fillStyle = "#e8fbff";
      ctx.beginPath();
      ctx.arc(sx, sy, z * 0.07 * tw, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();
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
    /* Dash: a blink, in the Valorant sense.
     *
     * Four straight lines behind the body was a speed EFFECT and not a move
     * — it lasted the 185ms the dash lasts and then everything was ordinary
     * again, so from across the room the character had simply teleported a
     * few tiles with a smudge. Charlie: "make dudu's dash more defined and
     * more noticeable na nagdash something like Jett from valorant dash."
     *
     * What makes that read is three things, and none of them is the lines:
     * copies of the BODY left along the path, a mark at the place you left
     * from, and a wake that OUTLIVES the dash. The last one matters most —
     * the move is over in a sixth of a second, which is less than most people
     * look at anything, so the trail has to still be there when the eye
     * arrives.
     */
    const trails = (r.dashTrail || (r.dashTrail = new Map()));
    let tr = trails.get(a.id);
    if (!tr) trails.set(a.id, (tr = []));
    if (a.dashFor > 0) {
      /* Sampled by DISTANCE, not per frame.
       *
       * Per frame gave sixteen copies overlapping each other into one amber
       * smear — which is a motion blur, and a motion blur is the thing this
       * was already doing with lines. What reads as a blink is a few
       * separate bodies you can count. Distance also makes it the same on a
       * 60Hz screen and a 120Hz one, which frame counting is not. */
      const last = tr[tr.length - 1];
      // A whole body-width apart, or they overlap into the same amber band
      // the lines were already making. Four of them over a 4.4-tile dash.
      if (!last || Math.abs(a.x - last.x) > 1.05 || Math.abs(a.y - last.y) > 1.05) {
        tr.push({ x: a.x, y: a.y, at: g.time, w: a.w, h: a.h,
                  char: a.char, pose: poseOf(a) });
        if (tr.length > 8) tr.shift();
      }
    }
    if (tr.length) {
      const GHOST_SEC = 0.3;
      ctx.save();
      for (let i = 0; i < tr.length; i++) {
        const gh = tr[i];
        const age = g.time - gh.at;
        // A new round resets the clock, which makes every stored age absurd.
        if (age < 0 || age > GHOST_SEC) continue;
        const k = 1 - age / GHOST_SEC;
        const gx = toX(r, gh.x);
        const gy = toY(r, gh.y);
        const gw = gh.w * z * 1.24;
        const ghh = gh.h * z * 1.3;
        // Newest ghosts are the character's own colour; older ones cool into
        // the dash's amber as they go, which is what gives the trail a
        // direction to read along.
        drawSilhouette(r, ctx, ABILITY.dash.colour, k * 0.62,
                       gx, gy, gw, ghh,
                       (b, bx, by) => charById(gh.char).draw(b, bx, by, gw, ghh, gh.pose));
      }
      ctx.restore();

      /* The mark where it STARTED. A dash you can see the origin of is a
       * distance travelled; one you cannot is a character that moved. */
      const from = tr[0];
      const fAge = g.time - from.at;
      if (fAge >= 0 && fAge < 0.36) {
        const k = 1 - fAge / 0.36;
        const fx0 = toX(r, from.x);
        const fy0 = toY(r, from.y) - from.h * z * 0.5;
        const dir = Math.sign(a.dashVx || a.face) || 1;
        ctx.save();
        ctx.globalAlpha = k * 0.95;
        ctx.strokeStyle = ABILITY.dash.colour;
        ctx.lineWidth = Math.max(2, z * 0.1 * k);
        ctx.lineCap = "round";
        // Two crescents opening the way they went — air being shoved aside.
        for (const sp of [0.42, 0.66]) {
          ctx.beginPath();
          ctx.arc(fx0, fy0, z * sp * (1 + (1 - k) * 0.7),
                  -dir * 0.8 + (dir < 0 ? Math.PI : 0),
                  dir * 0.8 + (dir < 0 ? Math.PI : 0));
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    // ...and the speed lines, on the body itself, while it is actually going.
    if (a.dashFor > 0) {
      const left = a.dashFor / (ABILITY.dash.ms / 1000);
      const back = -Math.sign(a.dashVx || a.face);
      ctx.save();
      ctx.globalAlpha = Math.min(1, left) * 0.9;
      ctx.strokeStyle = "#fff4d6";
      ctx.lineCap = "round";
      // Three, not six: the ghosts carry the speed now, and six lines over
      // the top of them was the smear this was supposed to stop being.
      for (let i = 0; i < 3; i++) {
        const y = py - a.h * z * (0.28 + i * 0.3);
        ctx.lineWidth = Math.max(1.5, z * (0.08 - i * 0.012));
        ctx.beginPath();
        ctx.moveTo(px + back * z * (0.3 + i * 0.12), y);
        ctx.lineTo(px + back * z * (1.5 + i * 0.35), y);
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
    // Thicker than it began, twice over. At the distance the two of them
    // actually sit from the screen a hairline rim reads as an anti-alias
    // artefact rather than as "this one is mine". Charlie, three times now,
    // each with a close-up: "medyo kapalan pa outline ng onti", then
    // "kapalan pa natin ng konti yung outline sa characters"."
    let thick = z * 0.082;
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
    // `?? Infinity` because `starred` is true for the CROWN too, and the
    // crown is not in the power slot — see drawRoyalPool below for what
    // reading it there cost.
    const left = (a.power ? a.power.until : Infinity) - g.time;
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
  } else if (a.crowned) {
    /* Crowned: the ordinary character, with a glow behind it.
     *
     * Three wrong answers before this one, each more elaborate than the last
     * — gold laid over the body, then a flat silhouette with no face, then a
     * white tint that ghosted every feature into a cream blob. Charlie, after
     * the third: "panget pa rin ... normal character plus lagyan mo nalang ng
     * glow."
     *
     * He is right and it is the obvious answer. The character is already the
     * best-looking thing in the game; nothing needed to be done TO it. The
     * crown, the cape and the light around it say everything, and the player
     * still looks like the player. */
    drawCape(ctx, px, py, cw, chh, z, a.face, g.time);
    // The pool on the floor goes here, under everything of theirs.
    /* Full strength, always.
     *
     * This read `a.power.until` to fade the pool out in the crown's last
     * second — and the crown moved OUT of the power slot, so a crowned player
     * holding nothing has `a.power === null` and this threw a TypeError on
     * every frame. `layer()` swallows it, which means everything after this
     * line was skipped: the character itself was never drawn, and what was
     * left on screen was the owner's colour rim with a cape and a crown and
     * nothing inside it. Charlie: "ano to bug, bat naging ganto si king
     * yhon."
     *
     * There is no deadline left to fade towards — the crown lasts until you
     * fall off the map — so the argument is simply 1. */
    drawRoyalPool(ctx, px, py, cw, chh, 1);

    // The glow, behind: the same silhouette a size up, added to whatever is
    // there, so the light spills onto the arena rather than onto the sprite.
    /* The glow, behind: the same silhouette a size up, added to whatever is
     * there, so the light spills onto the arena rather than onto the sprite.
     *
     * Two passes, and it went back to two after a one-pass version: the
     * single gradient pass saved 0.2ms — which was nothing — and came out a
     * pale cream fog a size and a half bigger than the character, with the
     * ears showing through it. "ang weird ng king yhon character for some
     * reason... di siya maganda tignan." A rim of gold and a rim of pale
     * gold, tight to the body, is what this is supposed to be. */
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const pulse = 0.42 + 0.12 * Math.sin(g.time * 6);
    for (const [grow, alpha, col] of [[1.16, pulse * 0.5, "#ffb43a"],
                                      [1.06, pulse * 0.8, "#ffe9a8"]]) {
      drawSilhouette(r, ctx, col, alpha, px, py, cw * grow, chh * grow,
        (b2, bx, by) => charById(a.char).draw(b2, bx, by, cw * grow, chh * grow, poseOf(a)));
    }
    ctx.restore();

    // ...and then simply them.
    charById(a.char).draw(ctx, px, py, cw, chh, poseOf(a));
  } else {
    charById(a.char).draw(ctx, px, py, cw, chh, poseOf(a));
  }
  ctx.restore();

  /* Just hit: white-hot for two frames, then deep red.
   *
   * The same treatment King Yhon Yhon gets, for the same reason — Charlie:
   * "when hit atleast add red eme like king yhon". A hit stops the world for
   * nothing now and does not move you at all, which is what was asked for,
   * but it left the blow itself with almost nothing to show: the bar went
   * down and the grace bubble came up, and a bubble is a defensive state, not
   * an impact. This is the impact.
   *
   * Timed off `invulnUntil`, which is already on the wire, so nothing extra
   * travels. Skipped while crowned — the crown sets the same field for twelve
   * seconds and the player is not hurt, they are winning. */
  const hurtLeft = (a.invulnUntil || 0) - g.time;
  if (hurtLeft > 0 && !crowned && !a.dead) {
    /* A FIXED flash, not a fraction of the grace.
     *
     * The grace is 1.6 seconds — long, because it has to be long enough to
     * get away. Scaling the flash to it meant the red pulsed for nearly a
     * second, which is a status effect rather than an impact. 420ms is the
     * hit; the rest of the window is just the bubble. */
    const HIT_FLASH = 0.42;
    const hitAge = FEEL.hurtInvulnMs / 1000 - hurtLeft;
    const hitT = hitAge / HIT_FLASH;
    if (hitT >= 0 && hitT < 1) {
      const cw = a.w * z * 1.25, chh = a.h * z * 1.32;
      const paint = (b, bx, by) => charById(a.char).draw(b, bx, by, cw, chh, poseOf(a));
      // The bang: pure white, gone almost at once.
      if (hitT < 0.22) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        drawSilhouette(r, ctx, "#ffffff", 1 - hitT / 0.22, px, py, cw, chh, paint);
        ctx.restore();
      }
      // ...then the red, pulsing out over the rest of it.
      drawSilhouette(r, ctx, "#d81f3e",
        (1 - hitT) * (0.6 + 0.3 * Math.abs(Math.sin(g.time * 26))),
        px, py, cw, chh, paint);
      // A ring off the body on the first frames, so the hit has a size.
      if (hitT < 0.6) {
        const e = hitT / 0.6;
        ctx.save();
        ctx.globalAlpha = (1 - e) * 0.75;
        ctx.strokeStyle = "#fff0b0";
        ctx.lineWidth = Math.max(2, z * 0.08 * (1 - e));
        ctx.beginPath();
        ctx.ellipse(px, py - chh * 0.5, cw * (0.45 + e * 1.0), chh * (0.45 + e * 0.85),
                    0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  /* Frozen: crystallised, and the crystal is doing something.
   *
   * It was a flat blue pentagon with a white outline — the silhouette of a
   * block of ice, and nothing else. Charlie: "can we improve
   * cystalyzation/frozen effect animation yung pagkakacrystal lagyan mo ng
   * sprinkle idk."
   *
   * What ice has that a pentagon does not: facets that catch the light at
   * different angles, a frosted rim where it meets the air, internal cracks,
   * and glints coming off it. The glints are the "sprinkle" — they twinkle on
   * their own clocks so the block is never still, which is the whole
   * difference between frozen and merely painted blue.
   */
  if (a.frozenUntil && g.time < a.frozenUntil) {
    const left = a.frozenUntil - g.time;
    const fade = Math.min(1, left * 1.8);
    const w = a.w * z, h = a.h * z;
    const top = py - h * 1.5;
    // The block's outline, kept as one path so everything can clip to it.
    const block = () => {
      ctx.beginPath();
      ctx.moveTo(px, top);
      ctx.lineTo(px + w * 0.9, py - h * 0.95);
      ctx.lineTo(px + w * 0.72, py);
      ctx.lineTo(px - w * 0.72, py);
      ctx.lineTo(px - w * 0.9, py - h * 0.95);
      ctx.closePath();
    };

    ctx.save();
    ctx.globalAlpha = fade * 0.78;
    // Body of the ice: darker at the base where it is thick, bright at the
    // top where the light gets in.
    const icy = ctx.createLinearGradient(0, top, 0, py);
    icy.addColorStop(0, "#d6f4ff");
    icy.addColorStop(0.45, "#7fd0f2");
    icy.addColorStop(1, "#3f97c4");
    block();
    ctx.fillStyle = icy;
    ctx.fill();

    /* Facets. Long triangles from the apex down, alternating light and dark,
     * which is what makes a lump of blue read as something CUT. */
    ctx.save();
    block();
    ctx.clip();
    for (let i = 0; i < 6; i++) {
      const n = noiseAt(i * 7 + 3);
      const x0 = px + (i / 5 - 0.5) * w * 1.9;
      ctx.globalAlpha = fade * (i % 2 ? 0.22 : 0.13);
      ctx.fillStyle = i % 2 ? "#ffffff" : "#1f6c98";
      ctx.beginPath();
      ctx.moveTo(px + (n - 0.5) * w * 0.5, top);
      ctx.lineTo(x0 + w * 0.2, py + h * 0.1);
      ctx.lineTo(x0 - w * 0.2, py + h * 0.1);
      ctx.closePath();
      ctx.fill();
    }
    // Internal cracks — thin, bright, and not reaching the edges.
    ctx.globalAlpha = fade * 0.5;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = Math.max(1, z * 0.025);
    for (let i = 0; i < 4; i++) {
      const n1 = noiseAt(i * 9 + 21), n2 = noiseAt(i * 9 + 22);
      const sx = px + (n1 - 0.5) * w * 1.2;
      const sy = py - h * (0.25 + n2);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (n2 - 0.5) * w * 0.5, sy - h * 0.3);
      ctx.lineTo(sx + (n1 - 0.5) * w * 0.7, sy - h * 0.55);
      ctx.stroke();
    }
    ctx.restore();

    // A frosted rim, thick, where the block meets the air.
    ctx.globalAlpha = fade * 0.95;
    ctx.strokeStyle = "#eefaff";
    ctx.lineWidth = Math.max(2, z * 0.07);
    block();
    ctx.stroke();

    /* The sprinkle: glints on the surface and frost motes drifting off it.
     * Each on its own clock, so the block never holds still. */
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 7; i++) {
      const n1 = noiseAt(i * 5 + 40), n2 = noiseAt(i * 5 + 41);
      const tw = Math.max(0, Math.sin(g.time * 3.2 + i * 1.9));
      if (tw <= 0.05) continue;
      const gx = px + (n1 - 0.5) * w * 1.5;
      const gy = py - h * (0.15 + n2 * 1.25);
      const gs = z * (0.05 + n2 * 0.06) * tw;
      ctx.globalAlpha = fade * tw;
      ctx.fillStyle = "#ffffff";
      // A four-point glint, not a dot — a dot is snow, a glint is ice.
      ctx.beginPath();
      ctx.moveTo(gx, gy - gs * 2.2);
      ctx.quadraticCurveTo(gx, gy, gx + gs, gy);
      ctx.quadraticCurveTo(gx, gy, gx, gy + gs * 2.2);
      ctx.quadraticCurveTo(gx, gy, gx - gs, gy);
      ctx.quadraticCurveTo(gx, gy, gx, gy - gs * 2.2);
      ctx.fill();
    }
    // ...and frost falling off it, so it is plainly cold rather than glass.
    for (let i = 0; i < 9; i++) {
      const n = noiseAt(i * 3 + 70);
      const t = (g.time * (0.4 + n * 0.5) + n * 3) % 1;
      ctx.globalAlpha = fade * (1 - t) * 0.7;
      ctx.fillStyle = "#dff6ff";
      ctx.beginPath();
      ctx.arc(px + (n - 0.5) * w * 1.7, py - h * 1.2 + t * h * 1.3,
              z * 0.028, 0, Math.PI * 2);
      ctx.fill();
    }
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

  /* The weapon, IN HAND.
   *
   * Nothing was ever drawn on the body — the gun existed as six pips over the
   * head and a chip on the card, and that was survivable while the only
   * weapon was a six-shooter you fired constantly. It is not survivable for a
   * one-shot out of a box: Charlie picked up a Bazooka, looked at his
   * character, and said "my character doesnt evn hold it". If you cannot see
   * it, you do not believe you have it.
   *
   * The mark is the same drawn path the orb and the chip use, so the thing in
   * his hands is unmistakably the thing he picked up, and it is identical on
   * every machine. Flipped with the body, and it rides the recoil the
   * shoulder already does after a shot.
   */
  if (a.power && ALL_POWERS[a.power.type]?.fires && a.power.type !== "suntok") {
    const def = ALL_POWERS[a.power.type];
    const big = a.power.type === "bazuka";
    const since = g.time - (a.shotAt || -9) / 1000;
    // Kicks back on the frame it fires, then settles.
    const kick = since >= 0 && since < 0.2 ? (1 - since / 0.2) * (big ? 0.28 : 0.14) : 0;
    /* A Bazooka is nearly as big as the character carrying it.
     *
     * It was drawn at 0.62 of body height, which is a large pistol — Charlie:
     * "its a bazooka so bigg talaga sha somehow baka kasing laki pa ng
     * character." It is a tube you put on your shoulder. At this size it also
     * does the job the chip and the toast were doing on their own: you can
     * tell from across the arena who is carrying the thing that ends rounds.
     */
    const size = a.h * z * (big ? 1.15 : 0.4);
    /* At the HAND, not across the face.
     *
     * The pistol sat at 0.42 of the body width out and half the hitbox
     * height up — which on a character whose sprite is a third taller than
     * its hitbox and mostly head lands squarely on the snout. Charlie, with a
     * picture of a pig holding a gun in its mouth: "lets fix positioning nung
     * gun, dapat nasa kamay mismo ni yhon, left and right pati nung other
     * characters."
     *
     * All three are drawn in the same box with their paws in the same place,
     * so one offset serves all of them, and it is mirrored with `face` — so
     * "left and right" is the same fix, not two.
     *
     * The Bazooka is the exception and stays high: it is a tube you put on
     * your SHOULDER, and a shoulder is not a hand. */
    /* Measured off the SPRITE, not the hitbox.
     *
     * The body is drawn at 1.25 of the hitbox wide and 1.32 of it tall, so a
     * hand placed at a fraction of `a.w`/`a.h` lands well inside the drawing
     * — on the snout of a crowned player, who is two and a half times
     * everyone else. Same numbers drawActor uses for the sprite itself. */
    const sw = a.w * z * 1.25, sh = a.h * z * 1.32;
    const hx = px + a.face * (sw * (big ? 0.36 : 0.42) - kick * z * (big ? 0.7 : 0.5));
    const hy = py - sh * (big ? 0.62 : 0.3);
    ctx.save();
    ctx.translate(hx, hy);
    if (a.face < 0) ctx.scale(-1, 1);
    // A shadow under it so it sits in front of the body rather than on it.
    ctx.globalAlpha = 0.18;
    stampMark(ctx, a.power.type, 1, size * 0.06, size, "#2a1c12", Math.max(1, z * 0.02));
    ctx.globalAlpha = 1;
    stampMark(ctx, a.power.type, 0, 0, size, "#ffffff", Math.max(1.6, z * 0.045));
    drawMark(ctx, a.power.type, 0, 0, size, def.colour);
    ctx.restore();
  }

  /* Ammo, in the same language as the health above it.
   *
   * It was a row of rounded capsules floating at its own height, which is a
   * second visual idea for the same kind of information — how much of
   * something you have left. Now it is the health bar's little brother:
   * directly under it, the same diagonal cuts, green, and smaller. Charlie:
   * "ifix mo yung placement nung bullets sa baba lang din nung diagonal hp,
   * diagonal din green nga lang pero masmaliit."
   */
  if (a.power && a.power.type === "baril") {
    const n = a.power.ammo;
    const full = POWERUPS.baril.ammo || n;
    const W = Math.max(z * 0.7, a.w * z);
    const H = z * 0.085;
    const skew = H * 0.9;
    const gap = Math.max(1, W * 0.02);
    const seg = (W - gap * (full - 1)) / full;
    const x0 = px - W / 2;
    // Tucked under the health bar rather than on a height of its own.
    const top = py - a.h * z * HEART_Y + z * 0.14;
    ctx.save();
    ctx.lineWidth = Math.max(1, z * 0.016);
    for (let i = 0; i < full; i++) {
      const L = x0 + i * (seg + gap);
      const R = L + seg;
      const lLean = i === 0 ? 0 : skew;
      const rLean = i === full - 1 ? 0 : skew;
      ctx.beginPath();
      ctx.moveTo(L + lLean, top);
      ctx.lineTo(R + rLean, top);
      ctx.lineTo(R, top + H);
      ctx.lineTo(L, top + H);
      ctx.closePath();
      ctx.fillStyle = i < n ? POWERUPS.baril.colour : "rgba(26,38,52,0.3)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
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
  if (a.crowned) {
    // No deadline at all any more — the crown is a flag that a fall takes, so
    // there is nothing left to count down and nothing to fade out on.
    const left = 99;
    // Gold light off the body, a pool on the floor, sparks orbiting — see
    // drawRoyalty. The crown on its own is only as big as a head, and this
    // has to read from anywhere on the arena.
    drawRoyalty(r, ctx, g, a, px, py, left);
    ctx.save();
    if (left < 1.5) ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(g.time * 16));
    /* On the crown of the head, not across the eyes.
     *
     * The band was anchored at 0.98 of body height. The sprite reaches 1.32
     * — the same number AMMO_Y and HEART_Y are derived from, six lines down
     * — so 0.98 is a third of the way INTO the head, which put the velvet
     * band straight over both eyes. "ang panget ng itsura as a king ...
     * natatakpan na mukha e." It perches now. */
    drawCrown(ctx, px, py - a.h * z * 1.30, a.w * z * 0.5, z);
    ctx.restore();
  }

  // Hearts over the head, and nothing else. The name lives in the panel at
  // the bottom now — two labels for one character is one too many.
  // Lifted clear when there is a crown in the way.
  // A crown reaches 1.30 of the body plus its own height, which is taller
  // than HEART_Y on its own.
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
