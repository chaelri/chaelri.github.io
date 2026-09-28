// The new critters in 2D, drawn with canvas paths the way Yhon Yhon is in
// js/characters.js — same draw(ctx, x, y, w, h, pose) contract, so any of them
// can join CHARACTERS later without the game noticing. (x, y) is the point
// between the feet; `h` is the body height before squash.
//
// Proportions come from critters.json, which build.py reads for the 3D
// models, so the flat and round versions of each one cannot drift apart.

const SPEC = await (await fetch(new URL("critters.json", import.meta.url))).json();

function ell(ctx, cx, cy, rx, ry, rot, fill, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.globalAlpha = 1;
}

// A drawn line that sags in the middle (a smile) — or droops (a sleepy eye).
function sagLine(ctx, cx, cy, w, sag, thick, col) {
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, cy);
  ctx.quadraticCurveTo(cx, cy + sag * 2, cx + w / 2, cy);
  ctx.lineWidth = thick;
  ctx.lineCap = "round";
  ctx.strokeStyle = col;
  ctx.stroke();
}

// Same breath, same squash-and-stretch, same arc as drawYhon, so all four
// move with one feel. See the long notes there for why each number is what
// it is.
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
  const f = {
    rise, bw, bh,
    S: (n) => bw * n,
    V: (n) => bh * n,
    gait: Math.sin(((pose.walk || 0) / (pose.stride || 1)) * Math.PI) * Math.min(1, pose.run * 1.4),
    tuck: pose.air !== 0 ? rise * 0.13 : 0,
    splay: pose.air !== 0 ? Math.max(0, -rise) * 0.055 : 0,
  };
  const cycle = ((pose.t || 0) % 3.7) / 3.7;
  f.blink = cycle > 0.965 ? 1 - Math.abs(cycle - 0.982) / 0.017 : 0;
  ctx.save();
  ctx.translate(x, y - bh / 2 - h * breath.lift);
  ctx.scale(pose.face || 1, 1);
  const lean = pose.air !== 0 ? Math.min(1, pose.run) * rise * -0.13 : 0;
  if (lean) ctx.rotate(lean);
  return f;
}

function feet(ctx, f, s, col) {
  for (const side of [-1, 1]) {
    ell(ctx, side * f.S(s.footAt + f.splay), f.V(s.footY - f.tuck) + side * f.gait * f.V(0.05),
      f.S(s.footSize[0]) / 2, f.V(s.footSize[1]) / 2, 0, col);
  }
}

function arms(ctx, f, s, pose, col) {
  for (const side of [-1, 1]) {
    const swing = pose.air !== 0 ? Math.max(-0.85, Math.min(0.6, -f.rise * 0.9 + 0.2)) : -side * f.gait * 0.55;
    ctx.save();
    ctx.translate(side * f.S(s.armAt), f.V(s.armY));
    ctx.rotate(swing);
    ell(ctx, 0, 0, f.S(s.armSize[0]) / 2, f.V(s.armSize[1]) / 2, 0, col);
    ctx.restore();
  }
}

function dotEyes(ctx, f, s, col) {
  for (const side of [-1, 1]) {
    const r = f.S(s.eyeR);
    ell(ctx, side * f.S(s.eyeAt), f.V(s.eyeY), r, r * (1 - f.blink * 0.88), 0, col);
    // a catchlight, so a flat dot still reads as a shiny eye
    ell(ctx, side * f.S(s.eyeAt) + r * 0.35, f.V(s.eyeY) - r * 0.35, r * 0.3, r * 0.3 * (1 - f.blink), 0, "#fff", 0.85);
  }
}

function blush(ctx, f, s, col) {
  for (const side of [-1, 1]) {
    ell(ctx, side * f.S(s.blushAt), f.V(s.blushY), f.S(s.blushSize[0]) / 2, f.V(s.blushSize[1]) / 2, 0, col);
  }
}

/* ------------------------------------------------------------ axolotl --- */
function drawAxolotl(ctx, x, y, w, h, pose) {
  const s = SPEC.axolotl, c = s.col;
  const f = frame(ctx, x, y, h, pose, s.aspect);
  const t = pose.t || 0;
  feet(ctx, f, s, c.foot);
  // Gills behind the head, three a side. They trail the jump like Yhon's
  // ears and sway on their own the rest of the time.
  for (const side of [-1, 1]) {
    s.gills.forEach((g, i) => {
      ctx.save();
      ctx.translate(side * f.S(g.x), f.V(g.y));
      ctx.scale(side, 1);
      ctx.rotate(g.angle + Math.sin(t * 2.6 + i * 1.3) * 0.07 - f.rise * 0.3);
      const L = f.S(g.len), T = f.S(g.thick);
      ell(ctx, L / 2, 0, L / 2, T / 2, 0, c.gill);
      ell(ctx, L * 0.86, 0, L * 0.2, T * 0.42, 0, c.gillTip);
      ctx.restore();
    });
  }
  arms(ctx, f, s, pose, c.body);
  ell(ctx, 0, 0, f.bw / 2, f.bh / 2, 0, c.body);
  ell(ctx, 0, f.V(s.belly.y), f.S(s.belly.size[0]) / 2, f.V(s.belly.size[1]) / 2, 0, c.belly);
  blush(ctx, f, s, c.blush);
  dotEyes(ctx, f, s, c.eye);
  const m = s.smile;
  sagLine(ctx, 0, f.V(m.y), f.S(m.w), f.V(m.sag), f.S(m.thick), c.mouth);
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
    ell(ctx, 0, 0, f.S(s.earSize[0]) / 2, f.V(s.earSize[1]) / 2, 0, c.ear);
    ell(ctx, 0, f.V(0.01), f.S(s.innerEarSize[0]) / 2, f.V(s.innerEarSize[1]) / 2, 0, c.innerEar);
    ctx.restore();
  }
  arms(ctx, f, s, pose, c.body);
  ell(ctx, 0, 0, f.bw / 2, f.bh / 2, 0, c.body);
  blush(ctx, f, s, c.blush);
  // Sleepy eyes: a short drooping line. He never blinks — he is already
  // mostly asleep. A hop does make him open them for a moment.
  for (const side of [-1, 1]) {
    if (pose.air !== 0 && f.rise > 0.3) {
      ell(ctx, side * f.S(s.eyeAt), f.V(s.eyeY), f.S(s.eyeThick) * 1.1, f.S(s.eyeThick) * 1.1, 0, c.eye);
    } else {
      sagLine(ctx, side * f.S(s.eyeAt), f.V(s.eyeY), f.S(s.eyeW), f.V(0.018), f.S(s.eyeThick), c.eye);
    }
  }
  const mz = s.muzzle;
  ell(ctx, 0, f.V(mz.y), f.S(mz.size[0]) / 2, f.V(mz.size[1]) / 2, 0, c.muzzle);
  for (const side of [-1, 1]) {
    ell(ctx, side * f.S(s.nostrilAt), f.V(s.nostrilY), f.S(s.nostrilSize[0]) / 2, f.V(s.nostrilSize[1]) / 2, 0, c.nose);
  }
  // The orange. It stays balanced whatever he does, which is the joke.
  const o = s.orange, r = f.S(o.r);
  const ox = f.S(o.x), oy = -f.bh / 2 - r * 0.78;
  ell(ctx, ox, oy, r, r, 0, c.orange);
  ell(ctx, ox - r * 0.35, oy - r * 0.35, r * 0.28, r * 0.2, -0.6, "#fff", 0.35);
  ell(ctx, ox + r * 0.32, oy - r * 0.86, r * 0.55, r * 0.26, -0.5, c.leaf);
  ctx.restore();
}

/* ----------------------------------------------------------- hedgehog --- */
function drawHedgehog(ctx, x, y, w, h, pose) {
  const s = SPEC.hedgehog, c = s.col;
  const f = frame(ctx, x, y, h, pose, s.aspect);
  const sp = s.spikes;
  feet(ctx, f, s, c.foot);
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
  ctx.fillStyle = c.spikes;
  ctx.fill();
  ell(ctx, 0, 0, f.bw / 2, f.bh / 2, 0, c.spikes);
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
    ell(ctx, side * f.S(s.earAt), f.V(s.earY), f.S(s.earSize[0]) / 2, f.V(s.earSize[1]) / 2, 0, c.ear);
    ell(ctx, side * f.S(s.earAt), f.V(s.earY + 0.01), f.S(s.innerEarSize[0]) / 2, f.V(s.innerEarSize[1]) / 2, 0, c.innerEar);
  }
  ell(ctx, 0, f.V(s.face.y), f.S(s.face.size[0]) / 2, f.V(s.face.size[1]) / 2, 0, c.face);
  arms(ctx, f, s, pose, c.face);
  blush(ctx, f, s, c.blush);
  dotEyes(ctx, f, s, c.eye);
  ell(ctx, 0, f.V(s.snout.y), f.S(s.snout.size[0]) / 2, f.V(s.snout.size[1]) / 2, 0, c.snout);
  ell(ctx, 0, f.V(s.noseY), f.S(s.noseSize[0]) / 2, f.V(s.noseSize[1]) / 2, 0, c.nose);
  ell(ctx, f.S(0.015), f.V(s.noseY - 0.015), f.S(0.018), f.V(0.012), 0, "#fff", 0.6);
  ctx.restore();
}

export const FLAT = {
  axolotl: { name: SPEC.axolotl.name, aspect: SPEC.axolotl.aspect, draw: drawAxolotl },
  capybara: { name: SPEC.capybara.name, aspect: SPEC.capybara.aspect, draw: drawCapybara },
  hedgehog: { name: SPEC.hedgehog.name, aspect: SPEC.hedgehog.aspect, draw: drawHedgehog },
};
