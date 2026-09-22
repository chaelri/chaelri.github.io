// Canvas renderer.
//
// The trick the whole look rests on: the world is drawn ONCE, fully lit, onto
// an offscreen canvas. Then it is stencilled twice — once through a "what I
// have already seen" mask (dim, cold, from memory) and once through the live
// beam (warm, full brightness). Nothing is ever drawn dark; darkness is just
// the absence of a stencil.
//
// The light mask is rendered at 60% resolution and scaled back up, which gives
// soft beam edges for free. A hard-edged cone reads as a cheap 2D effect; a
// slightly soft one reads as a lamp.

import { MEMORY_ALPHA, TUNING as T } from "./config.js";
import { activeLantern, isFlareLit, isLit, overVoid } from "./world.js";
import { TAU, visibilityPolygon } from "./geom.js";

const MASK_SCALE = 0.6;

const C = {
  night: "#04060c",
  floor: "#262c3a",
  floorLine: "#2f3646",
  wall: "#49516a",
  wallTop: "#626d8c",
  voidInk: "#000104",
  voidRim: "#141c33",
  amber: "#ffc36b",
  amberHot: "#fff1d2",
  shard: "#9fe8ff",
  walker: "#0a0d16",
  walkerRim: "#8fb4ff",
  creature: "#05070e",
  creatureRim: "#4a1d46",
  eye: "#ff5f7e",
};

function makeCanvas(w = 1, h = 1) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** One-off noise tile. Re-generating grain per frame is pure waste. */
function makeGrain(size = 160) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 120 + Math.random() * 135;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function createRenderer(canvas) {
  return {
    canvas,
    ctx: canvas.getContext("2d"),
    world: makeCanvas(),
    // The floor, the walls and the pillars never move. Drawing them once per
    // level instead of once per frame is the single biggest win in here — the
    // flagstone grid alone is ~35 stroked paths.
    static: makeCanvas(),
    staticKey: null,
    grainPattern: null,
    mask: makeCanvas(),
    memo: makeCanvas(),
    scratch: makeCanvas(),
    grain: makeGrain(),
    w: 0,
    h: 0,
    scale: 1,
    ox: 0,
    oy: 0,
    shake: 0,
    levelKey: null,
  };
}

export function resize(r, cssW, cssH, level) {
  // Retina at full resolution means compositing four full-screen canvases per
  // frame for no visible gain on a dark, soft-edged image. 1.5 is plenty.
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  r.w = w;
  r.h = h;
  r.canvas.width = w;
  r.canvas.height = h;
  r.canvas.style.width = cssW + "px";
  r.canvas.style.height = cssH + "px";

  for (const key of ["world", "static", "memo", "scratch"]) {
    r[key].width = w;
    r[key].height = h;
  }
  r.mask.width = Math.round(w * MASK_SCALE);
  r.mask.height = Math.round(h * MASK_SCALE);

  const [lw, lh] = level.size;
  r.scale = Math.min(w / lw, h / lh);
  r.ox = (w - lw * r.scale) / 2;
  r.oy = (h - lh * r.scale) / 2;
  r.levelKey = null; // force the memory layer to clear
  r.staticKey = null; // ... and the baked geometry to be re-baked at this size
  r.grainPattern = null;
}

const sx = (r, x) => r.ox + x * r.scale;
const sy = (r, y) => r.oy + y * r.scale;

/**
 * Only the segments that could possibly matter for a light of this reach.
 * Cuts the ray caster's inner loop by 3-5x on the bigger levels.
 */
function segmentsNear(segments, x, y, radius) {
  const out = [];
  const r2 = radius * radius;
  for (const s of segments) {
    // Distance from the light to the segment's bounding box, squared.
    const minX = Math.min(s[0], s[2]);
    const maxX = Math.max(s[0], s[2]);
    const minY = Math.min(s[1], s[3]);
    const maxY = Math.max(s[1], s[3]);
    const dx = x < minX ? minX - x : x > maxX ? x - maxX : 0;
    const dy = y < minY ? minY - y : y > maxY ? y - maxY : 0;
    if (dx * dx + dy * dy <= r2) out.push(s);
  }
  return out;
}

function tracePoly(ctx, r, poly, scaleK = 1) {
  ctx.beginPath();
  for (let i = 0; i < poly.length; i += 2) {
    const px = (r.ox + poly[i] * r.scale) * scaleK;
    const py = (r.oy + poly[i + 1] * r.scale) * scaleK;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/* ----------------------------------------------------- the world layer --- */

/** Everything that cannot move, baked once per level per canvas size. */
function bakeStatic(r, g) {
  const ctx = r.static.getContext("2d");
  const L = g.level;
  ctx.clearRect(0, 0, r.w, r.h);

  // Floor
  const b = L.bounds;
  ctx.fillStyle = C.floor;
  ctx.fillRect(sx(r, b.x), sy(r, b.y), b.w * r.scale, b.h * r.scale);

  // Faint flagstones, so a lit floor has something to read as texture.
  ctx.strokeStyle = C.floorLine;
  ctx.lineWidth = Math.max(1, r.scale * 0.04);
  ctx.beginPath();
  for (let x = b.x; x <= b.x + b.w + 0.001; x += 2) {
    ctx.moveTo(sx(r, x), sy(r, b.y));
    ctx.lineTo(sx(r, x), sy(r, b.y + b.h));
  }
  for (let y = b.y; y <= b.y + b.h + 0.001; y += 2) {
    ctx.moveTo(sx(r, b.x), sy(r, y));
    ctx.lineTo(sx(r, b.x + b.w), sy(r, y));
  }
  ctx.stroke();

  // Holes in the floor. Drawn with a rim so the edge is legible the instant
  // the beam touches it — falling because you could not see the lip would be
  // the bad kind of unfair.
  for (const v of L.voids) {
    const x = sx(r, v.x);
    const y = sy(r, v.y);
    const w = v.w * r.scale;
    const h = v.h * r.scale;
    ctx.fillStyle = C.voidInk;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = C.voidRim;
    ctx.lineWidth = Math.max(2, r.scale * 0.18);
    ctx.strokeRect(x, y, w, h);
  }

  // Walls
  for (const rect of L.blocks) {
    const x = sx(r, rect.x);
    const y = sy(r, rect.y);
    const w = rect.w * r.scale;
    const h = rect.h * r.scale;
    ctx.fillStyle = C.wall;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = C.wallTop;
    ctx.fillRect(x, y, w, Math.max(2, r.scale * 0.16));
  }
  // Outer wall, drawn as a thick inset stroke
  ctx.strokeStyle = C.wall;
  ctx.lineWidth = Math.max(3, r.scale * 0.5);
  ctx.strokeRect(
    sx(r, b.x) - ctx.lineWidth / 2,
    sy(r, b.y) - ctx.lineWidth / 2,
    b.w * r.scale + ctx.lineWidth,
    b.h * r.scale + ctx.lineWidth
  );

  // Pillars — the things that make bridges
  for (const p of L.pillars) {
    const cx = sx(r, p.x);
    const cy = sy(r, p.y);
    const rad = p.r * r.scale;
    const grd = ctx.createRadialGradient(cx - rad * 0.3, cy - rad * 0.3, rad * 0.1, cx, cy, rad);
    grd.addColorStop(0, C.wallTop);
    grd.addColorStop(1, C.wall);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, TAU);
    ctx.fill();
  }

  r.staticKey = g.level.id;
}

function drawWorld(r, g) {
  const ctx = r.world.getContext("2d");
  if (r.staticKey !== g.level.id) bakeStatic(r, g);
  ctx.clearRect(0, 0, r.w, r.h);
  ctx.drawImage(r.static, 0, 0);

  // Exit
  const ex = sx(r, g.exit.x);
  const ey = sy(r, g.exit.y);
  const er = r.scale * 1.25;
  ctx.save();
  ctx.translate(ex, ey);
  const open = g.exit.open;
  const pulse = 0.5 + 0.5 * Math.sin(g.exit.pulse);
  ctx.fillStyle = open ? `rgba(255,220,150,${0.35 + pulse * 0.5})` : "rgba(90,100,125,0.5)";
  ctx.beginPath();
  ctx.arc(0, 0, er, Math.PI, 0);
  ctx.lineTo(er, er * 0.9);
  ctx.lineTo(-er, er * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = open ? C.amberHot : "#79839e";
  ctx.lineWidth = Math.max(2, r.scale * 0.1);
  ctx.stroke();
  ctx.restore();

  // Shards
  for (const s of g.shards) {
    if (s.taken) continue;
    const x = sx(r, s.x);
    const y = sy(r, s.y) + Math.sin(s.bob * 2) * r.scale * 0.12;
    const rad = r.scale * 0.36;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, rad * 3);
    grd.addColorStop(0, "rgba(200,245,255,0.95)");
    grd.addColorStop(0.35, "rgba(159,232,255,0.5)");
    grd.addColorStop(1, "rgba(159,232,255,0)");
    ctx.fillStyle = grd;
    ctx.fillRect(x - rad * 3, y - rad * 3, rad * 6, rad * 6);
    ctx.fillStyle = C.shard;
    ctx.beginPath();
    ctx.moveTo(x, y - rad);
    ctx.lineTo(x + rad * 0.62, y);
    ctx.lineTo(x, y + rad);
    ctx.lineTo(x - rad * 0.62, y);
    ctx.closePath();
    ctx.fill();
  }

  // Lanterns that are on the ground
  for (const lan of g.lanterns) {
    if (!lan.found) {
      // An unlit lantern still has the faintest ember, or she could never
      // find it in a level that is 95% black.
      const x = sx(r, lan.x);
      const y = sy(r, lan.y);
      ctx.fillStyle = "rgba(255,170,90,0.28)";
      ctx.beginPath();
      ctx.arc(x, y, r.scale * 0.3, 0, TAU);
      ctx.fill();
      continue;
    }
    if (g.carried && lan.active) continue;
    drawLantern(ctx, r, lan.x, lan.y, lan.active);
  }

  // Creatures
  for (const c of g.creatures) {
    if (!c.alive) continue;
    const x = sx(r, c.x);
    const y = sy(r, c.y);
    const rad = T.creatureRadius * r.scale * (1 + Math.sin(c.wob * 3) * 0.07) * (0.55 + c.hp * 0.45);
    ctx.fillStyle = C.creatureRim;
    ctx.beginPath();
    ctx.arc(x, y, rad * 1.35, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.creature;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.eye;
    const eo = rad * 0.34;
    ctx.beginPath();
    ctx.arc(x - eo, y - rad * 0.12, rad * 0.15, 0, TAU);
    ctx.arc(x + eo, y - rad * 0.12, rad * 0.15, 0, TAU);
    ctx.fill();
  }

  drawWalker(ctx, r, g, false);
}

function drawLantern(ctx, r, wx, wy, lit) {
  const x = sx(r, wx);
  const y = sy(r, wy);
  const s = r.scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#2a2f3e";
  ctx.fillRect(-s * 0.2, -s * 0.34, s * 0.4, s * 0.62);
  ctx.fillStyle = lit ? C.amberHot : "#3a4154";
  ctx.fillRect(-s * 0.13, -s * 0.26, s * 0.26, s * 0.44);
  ctx.strokeStyle = "#5b6479";
  ctx.lineWidth = Math.max(1.5, s * 0.06);
  ctx.beginPath();
  ctx.arc(0, -s * 0.4, s * 0.16, Math.PI, 0);
  ctx.stroke();
  ctx.restore();
}

function drawWalker(ctx, r, g, rimOnly) {
  const W = g.walker;
  const x = sx(r, W.x);
  const y = sy(r, W.y);
  const rad = T.walkRadius * r.scale;
  const blink = W.invuln > 0 && Math.floor(W.invuln * 12) % 2 === 0;
  if (blink) return;

  ctx.save();
  ctx.translate(x, y);
  if (!rimOnly) {
    ctx.fillStyle = C.walker;
    ctx.beginPath();
    ctx.ellipse(0, 0, rad, rad * 1.18, 0, 0, TAU);
    ctx.fill();
    // A little cloak tail trailing the way she is moving
    const sp = Math.hypot(W.vx, W.vy);
    if (sp > 0.6) {
      ctx.rotate(W.facing);
      ctx.beginPath();
      ctx.moveTo(-rad * 0.2, -rad * 0.8);
      ctx.lineTo(-rad * (1.1 + sp * 0.16), 0);
      ctx.lineTo(-rad * 0.2, rad * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.rotate(-W.facing);
    }
  }
  ctx.strokeStyle = rimOnly ? "rgba(143,180,255,0.42)" : C.walkerRim;
  ctx.lineWidth = Math.max(1.5, rad * 0.16);
  ctx.beginPath();
  ctx.ellipse(0, 0, rad, rad * 1.18, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------ the light mask --- */

function drawMask(r, g) {
  const ctx = r.mask.getContext("2d");
  const k = MASK_SCALE;
  ctx.clearRect(0, 0, r.mask.width, r.mask.height);
  ctx.globalCompositeOperation = "lighter";

  const L = g.light;
  const cx = (r.ox + L.x * r.scale) * k;
  const cy = (r.oy + L.y * r.scale) * k;

  // Two overlapping cones, the inner one narrower, gives an angular falloff
  // at the beam edges without needing a conic gradient.
  const near = segmentsNear(g.segments, L.x, L.y, L.range + 1);
  for (const [half, alpha] of [[L.half, 0.4], [L.half * 0.68, 0.55]]) {
    const poly = visibilityPolygon(L.x, L.y, near, L.angle, half, L.range);
    const rad = L.range * r.scale * k;
    const grd = ctx.createRadialGradient(cx, cy, rad * 0.04, cx, cy, rad);
    // Deliberately not brightest at the apex. A lamp that blows out to white
    // in the first two metres and fades to mud after six is useless to the
    // person who has to read the far end of the beam for a way through.
    grd.addColorStop(0, `rgba(255,236,206,${alpha * 0.8})`);
    grd.addColorStop(0.28, `rgba(255,224,176,${alpha})`);
    grd.addColorStop(0.68, `rgba(255,205,140,${alpha * 0.66})`);
    grd.addColorStop(0.92, `rgba(255,186,104,${alpha * 0.2})`);
    grd.addColorStop(1, "rgba(255,186,104,0)");
    ctx.fillStyle = grd;
    tracePoly(ctx, r, poly, k);
    ctx.fill();
  }

  // The lantern's own small halo, all the way round, so she is never in
  // literally zero light while holding it.
  const glowR = T.lanternGlow;
  const glowSegs = segmentsNear(g.segments, L.x, L.y, glowR + 1);
  const halo = visibilityPolygon(L.x, L.y, glowSegs, 0, Math.PI, glowR);
  {
    const rad = glowR * r.scale * k;
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    grd.addColorStop(0, "rgba(255,240,214,0.8)");
    grd.addColorStop(1, "rgba(255,186,104,0)");
    ctx.fillStyle = grd;
    tracePoly(ctx, r, halo, k);
    ctx.fill();
  }

  // Flare
  if (g.time < L.flareUntil) {
    const life = (L.flareUntil - g.time) / (T.flareMs / 1000);
    const fr = T.flareRadius * (1.15 - life * 0.3);
    const fsegs = segmentsNear(g.segments, L.x, L.y, fr + 1);
    const fpoly = visibilityPolygon(L.x, L.y, fsegs, 0, Math.PI, fr);
    const rad = fr * r.scale * k;
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    grd.addColorStop(0, `rgba(255,248,236,${0.95 * life})`);
    grd.addColorStop(0.6, `rgba(255,214,150,${0.55 * life})`);
    grd.addColorStop(1, "rgba(255,186,104,0)");
    ctx.fillStyle = grd;
    tracePoly(ctx, r, fpoly, k);
    ctx.fill();
  }

  ctx.globalCompositeOperation = "source-over";
}

/* ------------------------------------------------------ shadow bridges --- */

/**
 * Draw the parts of a pillar's umbra that fall across a hole in the floor.
 *
 * This exists because the mechanic was invisible: an unlit shadow is black,
 * a chasm is drawn black, so a correctly cast bridge looked exactly like the
 * pit it spanned. Nobody can walk a surface they cannot see. Here the shadow
 * over a void is given a face — cool, solid, edge-lit — so it reads as
 * something you could put a foot on.
 *
 * It has to agree with inCastShadow() exactly, or it becomes a liar: drawn
 * floor she falls through, which is far worse than no drawing at all. So the
 * far edge is an ARC at the beam's true reach (not a straight chord past it),
 * and the wedge is clamped to the cone — a shadow cannot be solid where the
 * light does not go.
 */
function drawShadowBridges(ctx, r, g) {
  const L = g.light;
  if (!g.level.voids.length || !g.level.pillars.length) return;

  for (const p of g.level.pillars) {
    const dx = p.x - L.x;
    const dy = p.y - L.y;
    const d = Math.hypot(dx, dy);
    if (d <= p.r * 1.02 || d - p.r > L.range) continue;

    // Only a pillar the beam is actually on can throw anything.
    const faceX = p.x - (dx / d) * (p.r + 0.06);
    const faceY = p.y - (dy / d) * (p.r + 0.06);
    if (!isLit(g, faceX, faceY)) continue;

    const a = Math.atan2(dy, dx);
    const spread = Math.asin(p.r / d);
    const grazing = Math.sqrt(d * d - p.r * p.r);

    // Clamp the wedge into the cone; a fat close pillar can be wider than it.
    let a0 = a - spread;
    let a1 = a + spread;
    const lo = L.angle - L.half;
    const hi = L.angle + L.half;
    if (a0 < lo) a0 = lo;
    if (a1 > hi) a1 = hi;
    if (a1 <= a0) continue;

    for (const v of g.level.voids) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx(r, v.x), sy(r, v.y), v.w * r.scale, v.h * r.scale);
      ctx.clip();

      const cx = sx(r, L.x);
      const cy = sy(r, L.y);
      const far = L.range * r.scale;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a0) * grazing * r.scale, cy + Math.sin(a0) * grazing * r.scale);
      ctx.lineTo(cx + Math.cos(a0) * far, cy + Math.sin(a0) * far);
      ctx.arc(cx, cy, far, a0, a1);
      ctx.lineTo(cx + Math.cos(a1) * grazing * r.scale, cy + Math.sin(a1) * grazing * r.scale);
      ctx.closePath();

      const grd = ctx.createRadialGradient(cx, cy, p.r * r.scale, cx, cy, far);
      grd.addColorStop(0, "rgba(128,158,205,0.32)");
      grd.addColorStop(0.6, "rgba(112,142,190,0.24)");
      // Fades out at the very end so the edge of the beam's reach reads as a
      // place to stop rather than a place to keep walking.
      grd.addColorStop(0.9, "rgba(96,124,170,0.16)");
      grd.addColorStop(1, "rgba(96,124,170,0.02)");
      ctx.fillStyle = grd;
      ctx.fill();

      ctx.strokeStyle = "rgba(168,198,244,0.4)";
      ctx.lineWidth = Math.max(1.5, r.scale * 0.07);
      ctx.stroke();
      ctx.restore();
    }
  }
}

/* -------------------------------------------------------------- frame --- */

export function draw(r, g, ui = {}) {
  const ctx = r.ctx;

  if (r.levelKey !== g.level.id) {
    const m = r.memo.getContext("2d");
    m.clearRect(0, 0, r.w, r.h);
    r.levelKey = g.level.id;
  }

  const P = r.perf;
  let t0 = P ? performance.now() : 0;
  drawWorld(r, g);
  if (P) { P.world += performance.now() - t0; t0 = performance.now(); }
  drawMask(r, g);
  if (P) { P.mask += performance.now() - t0; t0 = performance.now(); }

  // Remember what the beam has swept over.
  {
    const m = r.memo.getContext("2d");
    m.save();
    m.globalCompositeOperation = "lighter";
    m.globalAlpha = 0.05;
    m.drawImage(r.mask, 0, 0, r.w, r.h);
    m.restore();
  }

  ctx.save();
  if (r.shake > 0) {
    ctx.translate((Math.random() - 0.5) * r.shake, (Math.random() - 0.5) * r.shake);
    r.shake *= 0.86;
    if (r.shake < 0.4) r.shake = 0;
  }

  ctx.fillStyle = C.night;
  ctx.fillRect(-40, -40, r.w + 80, r.h + 80);

  const s = r.scratch.getContext("2d");

  // Pass 1 — what she has already seen, cold and dim.
  s.globalCompositeOperation = "source-over";
  s.clearRect(0, 0, r.w, r.h);
  s.drawImage(r.static, 0, 0);
  s.globalCompositeOperation = "destination-in";
  s.drawImage(r.memo, 0, 0);
  s.globalCompositeOperation = "source-over";
  ctx.globalAlpha = MEMORY_ALPHA;
  ctx.drawImage(r.scratch, 0, 0);
  ctx.globalAlpha = 1;

  // Pass 2 — what the beam is on right now.
  s.globalCompositeOperation = "source-over";
  s.clearRect(0, 0, r.w, r.h);
  s.drawImage(r.world, 0, 0);
  s.globalCompositeOperation = "destination-in";
  s.drawImage(r.mask, 0, 0, r.w, r.h);
  s.globalCompositeOperation = "source-over";
  ctx.drawImage(r.scratch, 0, 0);

  // Warm the lit area up. Lamplight is not white, and a pure-white cone on a
  // blue-black room reads as a torch app rather than a lantern.
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.32;
  ctx.drawImage(r.mask, 0, 0, r.w, r.h);
  ctx.restore();

  // A shadow that is currently load-bearing, drawn over the black of the pit
  // and under her feet.
  drawShadowBridges(ctx, r, g);

  // She is always faintly visible to herself, even in the pitch dark. Without
  // this the walker genuinely cannot tell whether her stick is doing anything.
  drawWalker(ctx, r, g, true);

  // A placed lantern is a beacon she can steer back towards.
  const lan = activeLantern(g);
  if (!g.carried && lan.found) {
    const x = sx(r, lan.x);
    const y = sy(r, lan.y);
    const pulse = 0.5 + 0.5 * Math.sin(g.time * 2.4);
    const rad = r.scale * (1.1 + pulse * 0.35);
    // A soft bloom, not a disc — a flat circle out in the dark reads as a
    // solid object, and she walks into it expecting to pick something up.
    const grd = ctx.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, `rgba(255,205,130,${0.3 + pulse * 0.16})`);
    grd.addColorStop(0.45, `rgba(255,195,107,${0.1 + pulse * 0.06})`);
    grd.addColorStop(1, "rgba(255,195,107,0)");
    ctx.fillStyle = grd;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  if (P) { P.composite += performance.now() - t0; t0 = performance.now(); }
  drawTeeter(ctx, r, g);
  drawVignette(ctx, r);
  drawGrain(ctx, r, g);
  if (P) P.post += performance.now() - t0;
  ctx.restore();

  drawHud(ctx, r, g, ui);
}

/** The "you are standing on nothing" warning. */
function drawTeeter(ctx, r, g) {
  const W = g.walker;
  if (W.teeter <= 0.02) return;
  const p = Math.min(1, W.teeter / (T.teeterMs / 1000));
  const x = sx(r, W.x);
  const y = sy(r, W.y);
  const rad = r.scale * (1.6 - p * 0.6);
  ctx.save();
  ctx.strokeStyle = `rgba(255,90,110,${0.35 + p * 0.55})`;
  ctx.lineWidth = Math.max(2, r.scale * 0.12);
  ctx.setLineDash([r.scale * 0.35, r.scale * 0.28]);
  ctx.lineDashOffset = -g.time * r.scale * 3;
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawVignette(ctx, r) {
  const grd = ctx.createRadialGradient(
    r.w / 2, r.h / 2, Math.min(r.w, r.h) * 0.3,
    r.w / 2, r.h / 2, Math.max(r.w, r.h) * 0.72
  );
  grd.addColorStop(0, "rgba(0,0,0,0)");
  grd.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, r.w, r.h);
}

function drawGrain(ctx, r, g) {
  ctx.save();
  ctx.globalAlpha = 0.045;
  ctx.globalCompositeOperation = "overlay";
  const ox = -(g.time * 137) % r.grain.width;
  const oy = -(g.time * 91) % r.grain.height;
  if (!r.grainPattern) r.grainPattern = ctx.createPattern(r.grain, "repeat");
  ctx.translate(ox, oy);
  ctx.fillStyle = r.grainPattern;
  ctx.fillRect(-ox, -oy, r.w + r.grain.width, r.h + r.grain.height);
  ctx.restore();
}

/* ---------------------------------------------------------------- hud --- */

function drawHud(ctx, r, g, ui) {
  const pad = Math.round(r.w * 0.022);
  const fs = Math.max(13, Math.round(r.h * 0.026));
  ctx.save();
  ctx.textBaseline = "top";

  // Hearts
  for (let i = 0; i < T.hearts; i++) {
    const on = i < g.hearts;
    const x = pad + i * fs * 1.5;
    const y = pad;
    ctx.fillStyle = on ? "#ff6f88" : "rgba(255,111,136,0.18)";
    heart(ctx, x, y, fs * 0.9);
  }

  // Shards
  const left = g.shards.filter((s) => !s.taken).length;
  const got = g.shards.length - left;
  ctx.font = `600 ${fs}px "Inter", system-ui, sans-serif`;
  ctx.fillStyle = left === 0 ? C.amberHot : "rgba(159,232,255,0.92)";
  ctx.textAlign = "center";
  ctx.fillText(
    left === 0 ? "the door is open" : `${got} / ${g.shards.length} shards`,
    r.w / 2,
    pad
  );

  // Level name
  ctx.textAlign = "left";
  ctx.font = `500 ${Math.round(fs * 0.82)}px "Inter", system-ui, sans-serif`;
  ctx.fillStyle = "rgba(200,212,240,0.4)";
  ctx.fillText(`${g.level.name.toUpperCase()} · ${g.level.sub}`, pad, r.h - pad - fs);

  // Flare charge — the light player's only resource, so it is worth showing.
  const ready = g.time * 1000 >= g.light.flareReadyAt;
  const frac = ready
    ? 1
    : 1 - (g.light.flareReadyAt - g.time * 1000) / T.flareCooldownMs;
  ctx.textAlign = "right";
  ctx.fillStyle = ready ? "rgba(255,195,107,0.85)" : "rgba(255,195,107,0.3)";
  ctx.fillText(ready ? "FLARE READY" : "flare…", r.w - pad, r.h - pad - fs);
  const bw = r.w * 0.11;
  ctx.fillStyle = "rgba(255,195,107,0.16)";
  ctx.fillRect(r.w - pad - bw, r.h - pad - fs * 1.9, bw, fs * 0.2);
  ctx.fillStyle = "rgba(255,195,107,0.8)";
  ctx.fillRect(r.w - pad - bw, r.h - pad - fs * 1.9, bw * frac, fs * 0.2);

  // Connection pips
  if (ui.peers) {
    ctx.textAlign = "right";
    ctx.font = `500 ${Math.round(fs * 0.72)}px "Inter", system-ui, sans-serif`;
    let y = pad;
    for (const p of ui.peers) {
      ctx.fillStyle = p.on ? "rgba(160,200,255,0.55)" : "rgba(255,120,120,0.75)";
      ctx.fillText(
        `${p.label}${p.on ? (p.relay ? " · relay" : "") : " · offline"}`,
        r.w - pad,
        y
      );
      y += fs;
    }
  }
  ctx.restore();
}

function heart(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.95);
  ctx.bezierCurveTo(-s * 0.15, s * 0.5, s * 0.02, s * 0.03, s * 0.5, s * 0.32);
  ctx.bezierCurveTo(s * 0.98, s * 0.03, s * 1.15, s * 0.5, s * 0.5, s * 0.95);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
