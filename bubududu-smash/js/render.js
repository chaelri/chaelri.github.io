// Renderer. Bright and readable on purpose — the last game was dark by design
// and half its problems were that nobody could see what was happening.
//
// One camera frames BOTH players and zooms to keep them together, so you are
// always looking at the same picture on the same screen.

import { charById } from "./characters.js";
import { poseOf } from "./physics.js";
import { BAD_HELPER, COINS, DIWATA, FEEL, GLYPH, HIT, PLAYERS, POWERUPS, SHOT_RADIUS } from "./config.js";

// How long the winning shot dwells before the camera comes back.
const BAD_HOLD = HIT.winCamHoldMs / 1000;
const BAD_RELEASE = HIT.winCamReleaseMs / 1000;

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
    clouds: Array.from({ length: 18 }, (_, i) => {
      const far = i < 8;
      return {
        x: Math.random() * 60 - 6,
        // Kept above the play area; clouds drifting through the platforms make
        // the arena harder to read.
        y: Math.random() * (far ? 3.4 : 4.2) + 0.2,
        s: far ? 1.4 + Math.random() * 1.8 : 0.6 + Math.random() * 1.2,
        v: far ? 0.04 + Math.random() * 0.06 : 0.14 + Math.random() * 0.26,
        far,
        puffs: 3 + Math.floor(Math.random() * 3),
      };
    }),
  };
}

export function resize(r, cssW, cssH) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
  const pad = 7;
  const spanX = Math.max(14, maxX - minX + pad * 2);
  const spanY = Math.max(9, maxY - minY + pad * 1.4);
  const zoom = Math.min(r.w / spanX, r.h / spanY);

  r.cam.tzoom = Math.max(22, Math.min(78, zoom));
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
      // In, hold on the body while the result lands, then ease back out to
      // the whole arena — the camera always comes back.
      const held = r.kill.t - r.kill.ms / 1000;
      const out = held <= 0
        ? 0
        : Math.min(1, Math.max(0, (held - BAD_HOLD) / BAD_RELEASE));
      killPull = Math.min(1, p / 0.35) * (1 - out);
      if (out >= 1) r.kill = null;
    } else {
      killPull = p < 0.2 ? p / 0.2 : Math.pow(1 - (p - 0.2) / 0.8, 1.7);
    }
    r.cam.tx += (r.kill.x - r.cam.tx) * killPull * 0.92;
    r.cam.ty += (r.kill.y - r.cam.ty) * killPull * 0.92;
    if (r.kill) r.killZoom = 1 + killPull * (r.kill.zoom ?? 0.9);
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
function drawBackdrop(r, ctx, g, dt) {
  const sky = ctx.createLinearGradient(0, 0, 0, r.h);
  sky.addColorStop(0, "#4fb2ee");
  sky.addColorStop(0.36, "#8ed2f7");
  sky.addColorStop(0.68, "#cfeafb");
  sky.addColorStop(1, "#f6eed9");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, r.w, r.h);

  // sun, fixed high and to the right, with a wide soft halo
  const sx0 = r.w * 0.78 - r.cam.x * r.cam.zoom * 0.02;
  const sy0 = r.h * 0.16;
  const halo = ctx.createRadialGradient(sx0, sy0, 0, sx0, sy0, r.h * 0.42);
  halo.addColorStop(0, "rgba(255,246,214,0.85)");
  halo.addColorStop(0.18, "rgba(255,240,190,0.35)");
  halo.addColorStop(1, "rgba(255,240,190,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(sx0 - r.h * 0.42, sy0 - r.h * 0.42, r.h * 0.84, r.h * 0.84);
  ctx.fillStyle = "rgba(255,252,236,0.95)";
  ctx.beginPath();
  ctx.arc(sx0, sy0, r.h * 0.045, 0, Math.PI * 2);
  ctx.fill();

  // Pushed well down so the arena floats clear of them, and each range is
  // paler than the one in front to fake distance.
  hills(r, ctx, { depth: 0.05, base: 0.74, amp: 0.075, colour: "#aed4ec", seed: 1.0 });
  hills(r, ctx, { depth: 0.12, base: 0.86, amp: 0.085, colour: "#93c6d4", seed: 2.6 });
  hills(r, ctx, { depth: 0.22, base: 0.97, amp: 0.09, colour: "#86c483", seed: 4.2 });

  clouds(r, ctx, g, dt);
}

/** One rolling range, offset against the camera by its depth. */
function hills(r, ctx, o) {
  const yBase = r.h * o.base - r.cam.y * r.cam.zoom * o.depth * 0.25;
  const amp = r.h * o.amp;
  const off = r.cam.x * r.cam.zoom * o.depth;
  ctx.fillStyle = o.colour;
  ctx.beginPath();
  ctx.moveTo(0, r.h);
  for (let x = 0; x <= r.w + 20; x += 18) {
    // Divided by a fraction of the height so several waves fit across the
    // view; a larger divisor put less than one wave on screen and the ranges
    // came out as flat bands.
    const u = (x + off) / (r.h * 0.33);
    const y =
      yBase +
      Math.sin(u * 0.8 + o.seed) * amp +
      Math.sin(u * 1.9 + o.seed * 2.1) * amp * 0.4 +
      Math.sin(u * 0.33 + o.seed * 3.7) * amp * 0.75;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(r.w + 20, r.h);
  ctx.closePath();
  ctx.fill();
}

function clouds(r, ctx, g, dt) {
  for (const c of r.clouds) {
    c.x += c.v * dt;
    if (c.x > g.level.w + 10) c.x = -10;
    const depth = c.far ? 0.12 : 0.4;
    const px = (c.x - r.cam.x * depth) * r.cam.zoom + r.w / 2;
    const py = (c.y - r.cam.y * depth * 0.4) * r.cam.zoom + r.h / 2;
    const s = c.s * r.cam.zoom;
    if (px < -s * 3 || px > r.w + s * 3) continue;

    ctx.save();
    ctx.globalAlpha = c.far ? 0.42 : 0.72;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    // a handful of overlapping lobes reads as a cloud; one ellipse reads as a
    // pill
    ctx.ellipse(px, py, s, s * 0.52, 0, 0, Math.PI * 2);
    for (let i = 0; i < c.puffs; i++) {
      const t = (i / (c.puffs - 1 || 1)) * 2 - 1;
      ctx.ellipse(
        px + t * s * 0.85,
        py + Math.abs(t) * s * 0.14 - s * 0.1,
        s * (0.62 - Math.abs(t) * 0.22),
        s * (0.42 - Math.abs(t) * 0.14),
        0, 0, Math.PI * 2
      );
    }
    ctx.fill();
    ctx.restore();
  }
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
  layer("helper", ctx, () => drawHelper(r, ctx, g));
  layer("minis", ctx, () => drawMinis(r, ctx, g));
  // Per actor, so one character failing can never take the other one with it.
  for (const a of g.actors) layer(`actor:${a.char}`, ctx, () => drawActor(r, ctx, g, a));
  for (const a of g.actors) layer("fairy", ctx, () => drawFairy(r, ctx, g, a));
  for (const a of g.actors) layer("punch", ctx, () => drawPunch(r, ctx, g, a));
  layer("shots", ctx, () => drawShots(r, ctx, g));
  layer("bursts", ctx, () => drawBursts(r, ctx, g));
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
  const x0 = Math.max(0, Math.floor(r.cam.x - r.w / 2 / z) - 1);
  const x1 = Math.min(g.level.w - 1, Math.ceil(r.cam.x + r.w / 2 / z) + 1);
  const y0 = Math.max(0, Math.floor(r.cam.y - r.h / 2 / z) - 1);
  const y1 = Math.min(g.level.h - 1, Math.ceil(r.cam.y + r.h / 2 / z) + 1);

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const c = g.grid.rows[ty][tx];
      const px = toX(r, tx);
      const py = toY(r, ty);
      if (c === "#") {
        const openAbove = ty === 0 || g.grid.rows[ty - 1][tx] !== "#";
        ctx.fillStyle = GROUND;
        ctx.fillRect(px, py, z + 1, z + 1);
        if (openAbove) {
          ctx.fillStyle = GROUND_TOP;
          ctx.fillRect(px, py, z + 1, z * 0.28);
          ctx.fillStyle = GROUND_EDGE;
          ctx.fillRect(px, py + z * 0.28, z + 1, z * 0.06);
        }
      } else if (c === "=") {
        ctx.fillStyle = PLATFORM;
        roundRect(ctx, px, py + z * 0.1, z, z * 0.34, z * 0.1);
        ctx.fill();
        ctx.fillStyle = PLATFORM_TOP;
        roundRect(ctx, px, py + z * 0.1, z, z * 0.14, z * 0.07);
        ctx.fill();
      } else if (c === "^") {
        ctx.fillStyle = SPIKE;
        const n = 3;
        for (let i = 0; i < n; i++) {
          ctx.beginPath();
          ctx.moveTo(px + (i * z) / n, py + z);
          ctx.lineTo(px + ((i + 0.5) * z) / n, py + z * 0.24);
          ctx.lineTo(px + ((i + 1) * z) / n, py + z);
          ctx.closePath();
          ctx.fill();
        }
      }
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

    // outer bloom, breathing
    const bloom = ctx.createRadialGradient(px, py, rad * 0.5, px, py, rad * (2.5 + pulse * 0.5));
    bloom.addColorStop(0, mix(def.colour, [255, 255, 255], 0.25, 0.55));
    bloom.addColorStop(0.5, mix(def.colour, [255, 255, 255], 0.1, 0.18));
    bloom.addColorStop(1, mix(def.colour, [255, 255, 255], 0, 0));
    ctx.fillStyle = bloom;
    ctx.fillRect(px - rad * 3, py - rad * 3, rad * 6, rad * 6);

    // sparkles on the FAR half of the orbit, drawn under the sphere
    const orbit = (i) => {
      const a = age * 1.9 + (i * Math.PI * 2) / 3;
      return { x: px + Math.cos(a) * rad * 1.5, y: py + Math.sin(a) * rad * 0.52, depth: Math.sin(a) };
    };
    const sparkle = (o) => {
      const near = (o.depth + 1) / 2;
      const sr = rad * (0.08 + near * 0.1);
      ctx.globalAlpha = 0.35 + near * 0.5;
      ctx.fillStyle = lighten(def.colour, 0.55);
      ctx.beginPath();
      ctx.arc(o.x, o.y, sr, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    };
    for (let i = 0; i < 3; i++) {
      const o = orbit(i);
      if (o.depth < 0) sparkle(o);
    }

    // the sphere: lit from up and to the left
    const lx = px - rad * 0.36;
    const ly = py - rad * 0.42;
    const body = ctx.createRadialGradient(lx, ly, rad * 0.06, px, py, rad);
    body.addColorStop(0, lighten(def.colour, 0.72));
    body.addColorStop(0.42, def.colour);
    body.addColorStop(1, darken(def.colour, 0.42));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fill();

    // bounce light along the bottom-right edge
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.clip();
    const rim = ctx.createRadialGradient(
      px + rad * 0.55, py + rad * 0.6, rad * 0.1,
      px + rad * 0.55, py + rad * 0.6, rad * 1.1
    );
    rim.addColorStop(0, lighten(def.colour, 0.5, 0.5));
    rim.addColorStop(1, lighten(def.colour, 0.5, 0));
    ctx.fillStyle = rim;
    ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    ctx.restore();

    // specular
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(lx, ly - rad * 0.06, rad * 0.26, rad * 0.17, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // glyph, with a little depth under it
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Lunas is health, so it wears the same heart the health bar does rather
    // than a symbol you have to learn. Nothing else on the field is that
    // shape, so it needs no reading at all.
    if (q.type === "lunas") {
      ctx.save();
      ctx.shadowColor = "rgba(255,77,109,0.9)";
      ctx.shadowBlur = rad * 0.7;
      heartPath(ctx, px, py - rad * 0.06, rad * 0.46);
      ctx.fillStyle = "#ff4d6d";
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1.5, rad * 0.1);
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.stroke();
      // a shine, so it reads as the same object as the hearts overhead
      heartPath(ctx, px - rad * 0.14, py - rad * 0.24, rad * 0.16);
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fill();
      ctx.restore();
    } else {
      const mark = GLYPH[q.type] || "?";
      ctx.font = `800 ${rad * 0.92}px "Nunito", system-ui, sans-serif`;
      ctx.fillStyle = darken(def.colour, 0.55, 0.5);
      ctx.fillText(mark, px, py + rad * 0.1);
      ctx.fillStyle = "#fff";
      ctx.fillText(mark, px, py + rad * 0.04);
    }
    ctx.textBaseline = "alphabetic";

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

    // The glyph itself, rising out of the spot it was taken from.
    if (p.glyph) {
      ctx.globalAlpha = Math.max(0, 1 - t * 1.25);
      ctx.font = `900 ${z * (0.7 + t * 0.5)}px "Nunito", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = Math.max(2, z * 0.08);
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.fillStyle = p.colour;
      const gy = py - z * (0.3 + e * 1.9);
      ctx.strokeText(p.glyph, px, gy);
      ctx.fillText(p.glyph, px, gy);
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

    const glow = ctx.createRadialGradient(px, py, 0, px, py, rad * 2.6);
    glow.addColorStop(0, "rgba(255,200,61,0.45)");
    glow.addColorStop(1, "rgba(255,200,61,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(px - rad * 2.6, py - rad * 2.6, rad * 5.2, rad * 5.2);

    // A darker rim, the face inside it, and one fixed highlight.
    ctx.fillStyle = "#c98a12";
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COINS.colour;
    ctx.beginPath();
    ctx.arc(px, py, rad * 0.78, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath();
    ctx.ellipse(px - rad * 0.26, py - rad * 0.3, rad * 0.24, rad * 0.16, -0.5, 0, Math.PI * 2);
    ctx.fill();
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
function drawFairy(r, ctx, g, a) {
  const f = a.fairy;
  if (!f || a.dead) return;
  const z = r.cam.zoom;

  const leave = f.leaving ? Math.min(1, f.wave / (DIWATA.leaveMs / 1000)) : 0;
  const bob = Math.sin(g.time * 3 + f.phase) * z * 0.18;
  const px = toX(r, a.x - (a.face || 1) * DIWATA.orbit) + Math.cos(g.time * 1.6 + f.phase) * z * 0.12;
  const py = toY(r, a.y - a.h * 1.15) + bob - leave * z * 2.4;

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
    const glow = ctx.createRadialGradient(px, py - z * 0.3, 0, px, py - z * 0.3, z * 1.0);
    glow.addColorStop(0, mix(own, [255, 255, 255], 0.2, 0.55));
    glow.addColorStop(1, mix(own, [255, 255, 255], 0, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(px - z, py - z * 1.3, z * 2, z * 2);

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
  if (ms > total + 90) return;
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
  const h = g.helper;
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
  const base = own || "#ffd08c";
  const warm = hunting ? "rgba(255,120,110,0.55)" : mix(base, [255, 255, 255], 0.15, 0.5);
  const glow = ctx.createRadialGradient(px, py - z * 0.5, 0, px, py - z * 0.5, z * 1.6);
  glow.addColorStop(0, warm);
  glow.addColorStop(1, mix(base, [255, 255, 255], 0, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(px - z * 1.6, py - z * 2.1, z * 3.2, z * 3.2);

  // A ring on the floor in the owner's colour — the unambiguous part, since a
  // halo behind a sprite can be hard to read against a bright sky.
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
    charById("dudu").draw(ctx, px, py, me.w * z * 1.25, me.h * z * 1.32, poseOf(me));
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

function drawShots(r, ctx, g) {
  if (!g.shots) return;
  const z = r.cam.zoom;
  for (const b of g.shots) {
    const px = toX(r, b.x);
    const py = toY(r, b.y);
    const rad = SHOT_RADIUS * z;
    // a short trail behind it
    const tail = Math.sign(b.vx) * rad * 3.4;
    const grd = ctx.createLinearGradient(px - tail, py, px, py);
    grd.addColorStop(0, "rgba(99,217,138,0)");
    grd.addColorStop(1, "rgba(99,217,138,0.75)");
    ctx.fillStyle = grd;
    ctx.fillRect(Math.min(px, px - tail), py - rad * 0.5, Math.abs(tail), rad);
    ctx.fillStyle = "#eafff0";
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * A heart, about as wide as it is tall.
 *
 * Drawn from the top dip down each side to the point, rather than from the
 * point outwards. The first version put its control points wider than the
 * shape was tall, which squashed it into a flat blob.
 */
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
  const max = Math.max(FEEL.hp, a.hp);
  const s = z * 0.19;
  const gap = s * 2.65;
  const total = (max - 1) * gap;
  // Just hit: the hearts jump so the loss is noticed.
  const hurt = a.invulnUntil && g.time < a.invulnUntil;
  const kick = hurt ? 1 + 0.22 * Math.abs(Math.sin(g.time * 18)) : 1;

  for (let i = 0; i < max; i++) {
    const x = cx - total / 2 + i * gap;
    const full = i < a.hp;
    // Anything past the three you start with is a spare, and is gold — so a
    // glance says "she has one in hand" rather than just "she is fine".
    const bonus = i >= FEEL.hp;
    const sz = s * (full ? kick : 1);
    ctx.save();
    if (bonus) {
      ctx.shadowColor = "rgba(255,196,60,0.9)";
      ctx.shadowBlur = z * 0.22;
    }
    heartPath(ctx, x, cy, sz);
    // Flat fill, thin white edge. A gradient and a shine on something this
    // small just reads as noise, and a dark outline turns it muddy.
    ctx.fillStyle = bonus ? "#ffc43c" : full ? "#ff4d6d" : "rgba(255,255,255,0.5)";
    ctx.fill();
    ctx.lineWidth = Math.max(1.2, z * 0.035);
    // An empty heart outlined in white disappears the moment it drifts over a
    // cloud, so it gets a cool edge instead; a full one is red enough to keep
    // the white.
    ctx.strokeStyle = full ? "rgba(255,255,255,0.9)" : "rgba(92,128,158,0.65)";
    ctx.shadowBlur = 0;
    ctx.stroke();
    ctx.restore();
  }
}

function drawActor(r, ctx, g, a) {
  if (a.dead) {
    // a puff where they went
    const px = toX(r, a.x);
    const py = toY(r, a.y);
    const k = 1 - a.respawn / 0.9;
    ctx.globalAlpha = Math.max(0, 1 - k);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath();
    ctx.arc(px, py - r.cam.zoom * 0.5, r.cam.zoom * (0.3 + k * 0.8), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }
  const px = toX(r, a.x);
  const py = toY(r, a.y);
  const z = r.cam.zoom;

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

  const cw = a.w * z * 1.25;
  const chh = a.h * z * 1.32;
  const starred = a.power && a.power.type === "bituin";

  ctx.save();
  if (safe) ctx.globalAlpha = 0.55 + 0.35 * Math.abs(Math.sin(g.time * 13));

  if (starred) {
    // Cycle the whole character through the spectrum, faster as it runs out.
    const left = a.power.until - g.time;
    const speed = left < 2.5 ? 900 : 480;
    const hue = (g.time * speed) % 360;
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

  // Reversed: two arrows chasing each other over their head.
  if (a.reversedUntil && g.time < a.reversedUntil) {
    ctx.save();
    ctx.translate(px, py - a.h * z * 1.65);
    ctx.rotate(Math.sin(g.time * 7) * 0.25);
    ctx.fillStyle = "#ff9c3f";
    ctx.font = `800 ${z * 0.52}px "Nunito", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("⇄", 0, 0);
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

  // Hearts over the head, and nothing else. The name lives in the panel at
  // the bottom now — two labels for one character is one too many.
  const heartY = py - a.h * z * HEART_Y;
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
    clouds: Array.from({ length: 16 }, (_, i) => {
      const far = i < 7;
      return {
        x: Math.random() * 60 - 6,
        y: Math.random() * (far ? 3.2 : 4) + 0.2,
        s: far ? 1.4 + Math.random() * 1.8 : 0.6 + Math.random() * 1.2,
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
