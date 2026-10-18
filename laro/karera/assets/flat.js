// The critters in 2D, drawn with canvas paths — same draw(ctx, x, y, w, h,
// pose) contract as the roster in js/characters.js, so any of them can join
// CHARACTERS later without the game noticing. (x, y) is the point between the
// feet; `h` is the body height before squash.
//
// Proportions come from critters.json, which build.py reads for the 3D
// models, so the flat and round versions of each one cannot drift apart.
//
// The look is a sticker / cartoon one: every solid shape gets a dark outline
// and a soft light-to-shadow gradient, eyes get a catchlight, and each critter
// has an expression and a prop. The flat single-colour first pass read as dull
// next to the kind of game art Charlie was comparing it with.

const SPEC = await (await fetch(new URL("critters.json", import.meta.url))).json();
const INK = "#2a1420"; // outline colour for everyone

/* --------------------------------------------------------------- colour --- */
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
const light = (c, t) => mix(c, "#ffffff", t);
const dark = (c, t) => mix(c, "#1a0a14", t);

/* --------------------------------------------------------------- shapes --- */
// A shaded, outlined ellipse. `line: false` for things that sit flat on the
// skin (blush, belly) and should not be ringed.
function blob(ctx, f, cx, cy, rx, ry, rot, fill, { line = true, shade = true, alpha = 1, lw = 1 } = {}) {
  rx = Math.max(0.01, rx); ry = Math.max(0.01, ry);
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
  if (shade) {
    const g = ctx.createRadialGradient(cx - rx * 0.35, cy - ry * 0.45, 0, cx, cy, Math.max(rx, ry) * 1.15);
    g.addColorStop(0, light(fill, 0.3));
    g.addColorStop(0.5, fill);
    g.addColorStop(1, dark(fill, 0.22));
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = fill;
  }
  ctx.fill();
  if (line) {
    ctx.lineWidth = f.OL * lw;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function outline(ctx, f, lw = 1) {
  ctx.lineWidth = f.OL * lw;
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.stroke();
}

// A drawn line from (x1,y1) to (x2,y2) that bows by `sag` in the middle.
function stroke(ctx, x1, y1, x2, y2, sag, thick, col) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + sag * 2, x2, y2);
  ctx.lineWidth = thick;
  ctx.lineCap = "round";
  ctx.strokeStyle = col;
  ctx.stroke();
}

/* ------------------------------------------------------------- the body --- */
// Same breath, same squash-and-stretch, same arc as drawYhon in the game, so
// all of them move with one feel. See the long notes there.
function idleBreath(pose) {
  const still = pose.air === 0 ? 1 - Math.min(1, pose.run / 0.12) : 0;
  if (still <= 0) return { squash: 0, lift: 0 };
  const w = Math.sin((pose.t || 0) * 2.1);
  return { squash: -w * 0.035 * still, lift: Math.max(0, w) * 0.022 * still };
}

function frame(ctx, x, y, h, pose, aspect) {
  const rise = pose.rise || 0;
  const air = Math.min(1, Math.abs(rise));
  const stretch = pose.air !== 0 ? air * 0.2 : 0;
  const breath = idleBreath(pose);
  const k = Math.max(0.68, Math.min(1.34, 1 - (pose.squash + breath.squash) * 1.05 - stretch));
  const bh = h * k;
  const bw = (h * aspect) / k;
  const cycle = ((pose.t || 0) % 3.7) / 3.7;
  const f = {
    rise, bw, bh, t: pose.t || 0,
    OL: Math.max(1.5, h * 0.028),
    S: (n) => bw * n,
    V: (n) => bh * n,
    gait: Math.sin(((pose.walk || 0) / (pose.stride || 1)) * Math.PI) * Math.min(1, pose.run * 1.4),
    tuck: pose.air !== 0 ? rise * 0.13 : 0,
    splay: pose.air !== 0 ? Math.max(0, -rise) * 0.055 : 0,
    blink: cycle > 0.965 ? 1 - Math.abs(cycle - 0.982) / 0.017 : 0,
  };
  ctx.save();
  ctx.translate(x, y - bh / 2 - h * breath.lift);
  ctx.scale(pose.face || 1, 1);
  const lean = pose.air !== 0 ? Math.min(1, pose.run) * rise * -0.13 : 0;
  if (lean) ctx.rotate(lean);
  return f;
}

// The body ellipse as a path, for clipping bands and stripes to it.
const bodyPath = (ctx, f) => { ctx.beginPath(); ctx.ellipse(0, 0, f.bw / 2, f.bh / 2, 0, 0, Math.PI * 2); };

function feet(ctx, f, s, col) {
  for (const side of [-1, 1]) {
    blob(ctx, f, side * f.S(s.footAt + f.splay), f.V(s.footY - f.tuck) + side * f.gait * f.V(0.05),
      f.S(s.footSize[0]) / 2, f.V(s.footSize[1]) / 2, 0, col);
  }
}

function arms(ctx, f, s, pose, col) {
  for (const side of [-1, 1]) {
    const swing = pose.air !== 0 ? Math.max(-0.85, Math.min(0.6, -f.rise * 0.9 + 0.2)) : -side * f.gait * 0.55;
    ctx.save();
    ctx.translate(side * f.S(s.armAt), f.V(s.armY));
    ctx.rotate(swing);
    blob(ctx, f, 0, 0, f.S(s.armSize[0]) / 2, f.V(s.armSize[1]) / 2, 0, col);
    ctx.restore();
  }
}

function eyes(ctx, f, s, col) {
  for (const side of [-1, 1]) {
    const r = f.S(s.eyeR), ex = side * f.S(s.eyeAt), ey = f.V(s.eyeY), sq = 1 - f.blink * 0.88;
    blob(ctx, f, ex, ey, r, r * sq, 0, col, { shade: false, line: false });
    if (f.blink < 0.5) {
      blob(ctx, f, ex + r * 0.35, ey - r * 0.4 * sq, r * 0.34, r * 0.34 * sq, 0, "#ffffff", { shade: false, line: false });
      blob(ctx, f, ex - r * 0.35, ey + r * 0.4 * sq, r * 0.14, r * 0.14 * sq, 0, "#ffffff", { shade: false, line: false, alpha: 0.8 });
    }
  }
}

function brows(ctx, f, b, col) {
  for (const side of [-1, 1]) {
    const drop = b.tilt * b.w / 2;
    stroke(ctx, side * f.S(b.at - b.w / 2), f.V(b.y + drop), side * f.S(b.at + b.w / 2), f.V(b.y - drop),
      -f.V(0.012), f.S(b.thick), col);
  }
}

function blush(ctx, f, s, col) {
  for (const side of [-1, 1]) {
    blob(ctx, f, side * f.S(s.blushAt), f.V(s.blushY), f.S(s.blushSize[0]) / 2, f.V(s.blushSize[1]) / 2, 0, col,
      { line: false, shade: false, alpha: 0.75 });
  }
}

// A D-shaped open mouth with a tongue, outlined.
function openMouth(ctx, f, m, mouthCol, tongueCol) {
  const x = f.S(m.x), y = f.V(m.y), w = f.S(m.w), hh = f.V(m.h);
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.quadraticCurveTo(x, y + hh * 0.2, x + w / 2, y);
    ctx.bezierCurveTo(x + w / 2, y + hh * 1.33, x - w / 2, y + hh * 1.33, x - w / 2, y);
    ctx.closePath();
  };
  path();
  ctx.fillStyle = mouthCol;
  ctx.fill();
  ctx.save();
  path();
  ctx.clip();
  blob(ctx, f, x, y + hh * 0.95, w * 0.28, hh * 0.45, 0, tongueCol, { line: false });
  ctx.restore();
  path();
  outline(ctx, f, 0.8);
}

// A band that wraps round the body at canvas height y — clipped to the body,
// bowed downward a little so it reads as going round, not across.
function wrapBand(ctx, f, y, thick, col) {
  const y1 = f.V(y - thick / 2), y2 = f.V(y + thick / 2), sag = f.V(0.035), w = f.bw;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(-w, y1);
    ctx.quadraticCurveTo(0, y1 + sag * 2, w, y1);
    ctx.lineTo(w, y2);
    ctx.quadraticCurveTo(0, y2 + sag * 2, -w, y2);
    ctx.closePath();
  };
  ctx.save();
  bodyPath(ctx, f);
  ctx.clip();
  path();
  const g = ctx.createLinearGradient(0, y1, 0, y2 + sag);
  g.addColorStop(0, light(col, 0.25));
  g.addColorStop(1, dark(col, 0.2));
  ctx.fillStyle = g;
  ctx.fill();
  for (const yy of [y1, y2]) {
    ctx.beginPath();
    ctx.moveTo(-w, yy);
    ctx.quadraticCurveTo(0, yy + sag * 2, w, yy);
    outline(ctx, f, 0.8);
  }
  ctx.restore();
}

/* ---------------------------------------------------------- yhon yhon --- */
function drawYhon(ctx, x, y, w, h, pose) {
  const s = SPEC.yhon, c = s.col;
  const f = frame(ctx, x, y, h, pose, s.aspect);
  feet(ctx, f, s, c.foot);
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * f.S(s.earAt), f.V(s.earTop));
    ctx.rotate(side * (s.earTilt - f.rise * 0.42));
    blob(ctx, f, 0, 0, f.S(s.earSize[0]) / 2, f.V(s.earSize[1]) / 2, 0, c.body);
    blob(ctx, f, 0, f.V(0.012), f.S(s.innerEarSize[0]) / 2, f.V(s.innerEarSize[1]) / 2, 0, c.innerEar, { line: false });
    ctx.restore();
  }
  arms(ctx, f, s, pose, c.body);
  blob(ctx, f, 0, 0, f.bw / 2, f.bh / 2, 0, c.body);
  blush(ctx, f, s, c.blush);
  eyes(ctx, f, s, c.eye);
  brows(ctx, f, s.brow, c.brow);
  openMouth(ctx, f, s.mouth, c.mouth, c.tongue);
  blob(ctx, f, 0, f.V(s.snoutY), f.S(s.snoutSize[0]) / 2, f.V(s.snoutSize[1]) / 2, 0, c.snout);
  for (const side of [-1, 1]) {
    blob(ctx, f, side * f.S(s.nostrilAt), f.V(s.snoutY), f.S(s.nostrilSize[0]) / 2, f.V(s.nostrilSize[1]) / 2, 0,
      c.nostril, { line: false, shade: false });
  }
  ctx.restore();
}

/* ------------------------------------------------------------ axolotl --- */
function drawAxolotl(ctx, x, y, w, h, pose) {
  const s = SPEC.axolotl, c = s.col;
  const f = frame(ctx, x, y, h, pose, s.aspect);
  feet(ctx, f, s, c.foot);
  // Gills behind the head, three a side. They trail the jump like Yhon's
  // ears and sway on their own the rest of the time.
  for (const side of [-1, 1]) {
    s.gills.forEach((g, i) => {
      ctx.save();
      ctx.translate(side * f.S(g.x), f.V(g.y));
      ctx.scale(side, 1);
      ctx.rotate(g.angle + Math.sin(f.t * 2.6 + i * 1.3) * 0.07 - f.rise * 0.3);
      const L = f.S(g.len), T = f.S(g.thick);
      blob(ctx, f, L / 2, 0, L / 2, T / 2, 0, c.gill);
      blob(ctx, f, L * 0.86, 0, L * 0.2, T * 0.42, 0, c.gillTip, { line: false });
      ctx.restore();
    });
  }
  arms(ctx, f, s, pose, c.body);
  blob(ctx, f, 0, 0, f.bw / 2, f.bh / 2, 0, c.body);
  blob(ctx, f, 0, f.V(s.belly.y), f.S(s.belly.size[0]) / 2, f.V(s.belly.size[1]) / 2, 0, c.belly, { line: false });
  blush(ctx, f, s, c.blush);
  eyes(ctx, f, s, c.eye);
  openMouth(ctx, f, s.mouth, c.mouth, c.tongue);
  // Swim goggles pushed up on his forehead.
  const g = s.goggles;
  wrapBand(ctx, f, g.y, g.strap, c.strap);
  for (const side of [-1, 1]) {
    const gx = side * f.S(g.at), gy = f.V(g.y), R = f.S(g.r), rim = f.S(g.rim);
    const lg = ctx.createRadialGradient(gx - R * 0.3, gy - R * 0.3, 0, gx, gy, R);
    lg.addColorStop(0, light(c.lens, 0.6));
    lg.addColorStop(1, c.lens);
    ctx.beginPath();
    ctx.arc(gx, gy, R, 0, Math.PI * 2);
    ctx.fillStyle = lg;
    ctx.fill();
    ctx.lineWidth = rim;
    ctx.strokeStyle = c.frame;
    ctx.stroke();
    for (const rr of [R + rim / 2, R - rim / 2]) {
      ctx.beginPath();
      ctx.arc(gx, gy, rr, 0, Math.PI * 2);
      outline(ctx, f, 0.7);
    }
    ctx.beginPath();
    ctx.arc(gx, gy, R * 0.6, -2.6, -1.7);
    ctx.lineWidth = rim * 0.6;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.stroke();
  }
  ctx.restore();
}

/* ----------------------------------------------------------- capybara --- */
function drawCapybara(ctx, x, y, w, h, pose) {
  const s = SPEC.capybara, c = s.col;
  const f = frame(ctx, x, y, h, pose, s.aspect);
  feet(ctx, f, s, c.foot);
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * f.S(s.earAt), f.V(s.earTop));
    ctx.rotate(-side * f.rise * 0.3);
    blob(ctx, f, 0, 0, f.S(s.earSize[0]) / 2, f.V(s.earSize[1]) / 2, 0, c.ear);
    blob(ctx, f, 0, f.V(0.01), f.S(s.innerEarSize[0]) / 2, f.V(s.innerEarSize[1]) / 2, 0, c.innerEar, { line: false });
    ctx.restore();
  }
  blob(ctx, f, 0, 0, f.bw / 2, f.bh / 2, 0, c.body);
  blush(ctx, f, s, c.blush);
  // Sleepy eyes: a short drooping line. He never blinks — he is already
  // mostly asleep. A hop does make him open them for a moment.
  for (const side of [-1, 1]) {
    const ex = side * f.S(s.eyeAt), ey = f.V(s.eyeY);
    if (pose.air !== 0 && f.rise > 0.3) {
      blob(ctx, f, ex, ey, f.S(s.eyeThick) * 1.3, f.S(s.eyeThick) * 1.3, 0, c.eye, { line: false, shade: false });
    } else {
      stroke(ctx, ex - f.S(s.eyeW / 2), ey, ex + f.S(s.eyeW / 2), ey, f.V(0.018), f.S(s.eyeThick), c.eye);
    }
  }
  const mz = s.muzzle;
  blob(ctx, f, 0, f.V(mz.y), f.S(mz.size[0]) / 2, f.V(mz.size[1]) / 2, 0, c.muzzle);
  for (const side of [-1, 1]) {
    blob(ctx, f, side * f.S(s.nostrilAt), f.V(s.nostrilY), f.S(s.nostrilSize[0]) / 2, f.V(s.nostrilSize[1]) / 2, 0,
      c.nose, { line: false, shade: false });
  }
  const m = s.smile;
  stroke(ctx, -f.S(m.w / 2), f.V(m.y), f.S(m.w / 2), f.V(m.y), f.V(m.sag), f.S(m.thick), c.mouth);

  // The swim ring he is sitting in: a torus seen from the front is a band
  // with round ends; its red and white stripes are spaced by angle round the
  // ring, so they bunch up toward the sides the way real ones do.
  const rg = s.ring, rr = f.V(rg.r), ry = f.V(rg.y);
  const R = (f.bw / 2) * Math.sqrt(1 - (2 * rg.y) ** 2) + rr * 0.55;
  const ringPath = () => { ctx.beginPath(); ctx.roundRect(-R - rr, ry - rr, 2 * (R + rr), 2 * rr, rr); };
  ctx.save();
  ringPath();
  ctx.clip();
  const n = rg.stripes;
  for (let i = 0; i < n; i++) {
    const a1 = Math.PI - (i * 2 * Math.PI) / n, a2 = Math.PI - ((i + 1) * 2 * Math.PI) / n;
    if (a1 < 0) break;
    const x1 = Math.cos(a1) * (R + rr * 1.2), x2 = Math.cos(Math.max(0, a2)) * (R + rr * 1.2);
    ctx.fillStyle = i % 2 ? c.ringA : c.ringB;
    ctx.fillRect(x1, ry - rr, (a2 < 0 ? R + rr * 1.2 : x2) - x1 + 0.5, 2 * rr);
  }
  const sh = ctx.createLinearGradient(0, ry - rr, 0, ry + rr);
  sh.addColorStop(0, "rgba(255,255,255,0.35)");
  sh.addColorStop(0.45, "rgba(255,255,255,0)");
  sh.addColorStop(1, "rgba(40,0,10,0.3)");
  ctx.fillStyle = sh;
  ctx.fillRect(-R - rr, ry - rr, 2 * (R + rr), 2 * rr);
  ctx.restore();
  ringPath();
  outline(ctx, f);
  arms(ctx, f, s, pose, c.body); // resting on the ring

  // The orange. It stays balanced whatever he does, which is the joke.
  const o = s.orange, r = f.S(o.r);
  const ox = f.S(o.x), oy = -f.bh / 2 - r * 0.78;
  blob(ctx, f, ox + r * 0.32, oy - r * 0.86, r * 0.55, r * 0.26, -0.5, c.leaf);
  blob(ctx, f, ox, oy, r, r, 0, c.orange);
  ctx.restore();
}

/* ----------------------------------------------------------- hedgehog --- */
function drawHedgehog(ctx, x, y, w, h, pose) {
  const s = SPEC.hedgehog, c = s.col;
  const f = frame(ctx, x, y, h, pose, s.aspect);
  const sp = s.spikes, b = s.band;
  feet(ctx, f, s, c.foot);
  // Bandana tails flapping out the side, behind him.
  const ky = f.V(b.y), kx = f.bw / 2 - f.S(0.02);
  for (const [a, len] of [[0.35, 0.2], [0.85, 0.17]]) {
    ctx.save();
    ctx.translate(kx, ky);
    ctx.rotate(a + Math.sin(f.t * 7 + len * 30) * 0.12 - f.rise * 0.3);
    blob(ctx, f, f.S(len) / 2, 0, f.S(len) / 2, f.V(b.thick) * 0.55, 0, c.band);
    ctx.restore();
  }
  // The spikes: a zigzag round the body from `from` to `to` radians, measured
  // clockwise from straight up, leaving the underside bare. They fluff out a
  // little at the top of a hop.
  const puff = 1 + sp.len * (1 + Math.max(0, -Math.abs(f.rise) + 0.4) * 0.5);
  const at = (a, k) => [Math.sin(a) * (f.bw / 2) * k, -Math.cos(a) * (f.bh / 2) * k];
  const step = (sp.to - sp.from) / sp.count;
  ctx.beginPath();
  ctx.moveTo(...at(sp.from, 0.8));
  for (let i = 0; i <= sp.count; i++) {
    const a = sp.from + i * step;
    ctx.lineTo(...at(a - step / 2, 0.98));
    ctx.lineTo(...at(a, i % 2 ? puff : puff * 0.94));
    ctx.lineTo(...at(a + step / 2, 0.98));
  }
  ctx.lineTo(...at(sp.to, 0.8));
  ctx.closePath();
  const sg = ctx.createRadialGradient(0, -f.bh * 0.2, 0, 0, 0, f.bw * 0.65);
  sg.addColorStop(0, light(c.spikes, 0.2));
  sg.addColorStop(1, dark(c.spikes, 0.25));
  ctx.fillStyle = sg;
  ctx.fill();
  outline(ctx, f);
  blob(ctx, f, 0, 0, f.bw / 2, f.bh / 2, 0, c.spikes, { line: false });
  // a lighter inner ring of shorter quills, for depth
  ctx.beginPath();
  for (let i = 0; i <= sp.count; i++) {
    const a = sp.from + (i + 0.5) * step;
    if (a > sp.to) break;
    ctx.moveTo(...at(a, 0.72));
    ctx.lineTo(...at(a, 0.9));
  }
  ctx.lineWidth = f.S(0.018);
  ctx.lineCap = "round";
  ctx.strokeStyle = c.spikeTip;
  ctx.stroke();

  for (const side of [-1, 1]) {
    blob(ctx, f, side * f.S(s.earAt), f.V(s.earY), f.S(s.earSize[0]) / 2, f.V(s.earSize[1]) / 2, 0, c.ear);
    blob(ctx, f, side * f.S(s.earAt), f.V(s.earY + 0.01), f.S(s.innerEarSize[0]) / 2, f.V(s.innerEarSize[1]) / 2, 0,
      c.innerEar, { line: false });
  }
  blob(ctx, f, 0, f.V(s.face.y), f.S(s.face.size[0]) / 2, f.V(s.face.size[1]) / 2, 0, c.face);
  wrapBand(ctx, f, b.y, b.thick, c.band);
  arms(ctx, f, s, pose, c.face);
  blush(ctx, f, s, c.blush);
  eyes(ctx, f, s, c.eye);
  brows(ctx, f, s.brow, c.brow);
  // Gritted teeth.
  const g = s.grit, gw = f.S(g.w), gh = f.V(g.h), gy = f.V(g.y);
  ctx.beginPath();
  ctx.roundRect(-gw / 2, gy - gh / 2, gw, gh, gh * 0.45);
  ctx.fillStyle = c.teeth;
  ctx.fill();
  outline(ctx, f, 0.8);
  ctx.beginPath();
  ctx.moveTo(-gw / 2 + gh * 0.2, gy);
  ctx.lineTo(gw / 2 - gh * 0.2, gy);
  for (const t of [-0.22, 0, 0.22]) { ctx.moveTo(gw * t, gy - gh / 2); ctx.lineTo(gw * t, gy + gh / 2); }
  outline(ctx, f, 0.45);
  blob(ctx, f, 0, f.V(s.snout.y), f.S(s.snout.size[0]) / 2, f.V(s.snout.size[1]) / 2, 0, c.snout);
  blob(ctx, f, 0, f.V(s.noseY), f.S(s.noseSize[0]) / 2, f.V(s.noseSize[1]) / 2, 0, c.nose, { line: false });
  blob(ctx, f, f.S(0.015), f.V(s.noseY - 0.015), f.S(0.018), f.V(0.012), 0, "#ffffff", { line: false, shade: false, alpha: 0.7 });
  ctx.restore();
}

const entry = (id, draw) => ({ name: SPEC[id].name, tag: SPEC[id].tag, theme: SPEC[id].theme, aspect: SPEC[id].aspect, draw });
export const FLAT = {
  yhon: entry("yhon", drawYhon),
  axolotl: entry("axolotl", drawAxolotl),
  capybara: entry("capybara", drawCapybara),
  hedgehog: entry("hedgehog", drawHedgehog),
};
