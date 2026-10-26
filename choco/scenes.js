// Animated 8-bit scene for each step, drawn on an 80x48 canvas and scaled up pixelated.
// Each scene is draw(ctx, t) with t in [0, 1); the action finishes around t≈0.88 and holds.

export const W = 80, H = 48;
const TAU = Math.PI * 2;
const DUR = 6500;   // ms per loop
const FPS = 12;     // choppy on purpose — it's 8-bit

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const rnd = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

function rgb(c) { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function mix(a, b, k) {
  const A = rgb(a), B = rgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * clamp(k)).toString(16).padStart(2, '0')).join('');
}

// ---------- pixel primitives ----------
function px(ctx, x, y, w, h, c) {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

function disc(ctx, cx, cy, rx, ry = rx, c) {
  if (rx < 0.5 || ry < 0.5) return;
  ctx.fillStyle = c;
  const R = Math.round(ry);
  for (let y = -R; y <= R; y++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    ctx.fillRect(Math.round(cx) - w, Math.round(cy) + y, w * 2 + 1, 1);
  }
}

function ring(ctx, cx, cy, rx, ry, c) {
  ctx.fillStyle = c;
  const n = Math.max(8, Math.round(rx * 5));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    ctx.fillRect(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), 1, 1);
  }
}

function line(ctx, x0, y0, x1, y1, c, th = 1) {
  ctx.fillStyle = c;
  const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
  for (let i = 0; i <= n; i++) {
    const k = n ? i / n : 0;
    ctx.fillRect(Math.round(x0 + (x1 - x0) * k), Math.round(y0 + (y1 - y0) * k), th, th);
  }
}

// ---------- sets ----------
const C = { x: 36, y: 24 };

function gingham(ctx) {
  for (let y = 0; y < H; y += 4) {
    for (let x = 0; x < W; x += 4) {
      const a = (x / 4) % 2, b = (y / 4) % 2;
      px(ctx, x, y, 4, 4, a && b ? '#ffb8d6' : a || b ? '#ffd3e6' : '#fff1f7');
    }
  }
}

function sky(ctx) {
  for (let y = 0; y < 38; y += 3) px(ctx, 0, y, W, 3, mix('#dccfff', '#ffd6ea', y / 38));
  px(ctx, 0, 38, W, 10, '#f2c9a0');
  px(ctx, 0, 38, W, 1, '#e0ad7f');
  for (let x = 6; x < W; x += 17) px(ctx, x, 42, 6, 1, '#e7b88b');
}

function pan(ctx) {
  disc(ctx, C.x + 2, C.y + 2, 21, 20, 'rgba(90,40,60,.18)');
  px(ctx, 54, 21, 26, 5, '#26262e');
  px(ctx, 54, 21, 26, 1, '#4a4a58');
  disc(ctx, C.x, C.y, 21, 20, '#80859b');
  disc(ctx, C.x, C.y, 19, 18, '#2d303d');
}

function bowl(ctx) {
  disc(ctx, C.x + 2, C.y + 2, 21, 20, 'rgba(90,40,60,.18)');
  disc(ctx, C.x, C.y, 21, 20, '#ffffff');
  disc(ctx, C.x, C.y, 19, 18, '#eee6f7');
}

// tools orbit the center; handle runs outward along the radius
function tool(ctx, kind, angle, r = 8) {
  const hx = C.x + Math.cos(angle) * r, hy = C.y + Math.sin(angle) * r * 0.9;
  const ox = C.x + Math.cos(angle) * 46, oy = C.y + Math.sin(angle) * 46;
  if (kind === 'whisk') {
    line(ctx, hx, hy, ox, oy, '#8b90a5', 2);
    ring(ctx, hx, hy, 4, 4, '#dde1ec');
    line(ctx, hx - 3, hy, hx + 3, hy, '#dde1ec');
    line(ctx, hx, hy - 3, hx, hy + 3, '#dde1ec');
  } else {
    line(ctx, hx, hy, ox, oy, '#c9a27a', 2);
    disc(ctx, hx, hy, 3, 3, '#9cc3f5');
    px(ctx, hx - 1, hy - 2, 2, 1, '#d4e6ff');
  }
}

function swirl(ctx, a0, c, maxR = 15, alpha = 1) {
  ctx.globalAlpha = alpha;
  for (const arm of [0, Math.PI]) {
    for (let k = 2; k < 26; k++) {
      const a = a0 + arm + k * 0.42, r = (k / 26) * maxR;
      px(ctx, C.x + Math.cos(a) * r, C.y + Math.sin(a) * r * 0.9, 1, 1, c);
    }
  }
  ctx.globalAlpha = 1;
}

function sparkle(ctx, x, y, c = '#ffffff') {
  px(ctx, x, y - 1, 1, 3, c);
  px(ctx, x - 1, y, 3, 1, c);
}

// ---------- the ten scenes ----------
export const SCENES = [
  // 1 · melt the butter
  (ctx, t) => {
    gingham(ctx); pan(ctx);
    const m = seg(t, 0.05, 0.75);
    disc(ctx, C.x, C.y, lerp(3, 15, m), lerp(2, 14, m), '#ffe27a');
    const tick = Math.floor(t * 24);
    for (let i = 0; i < 10; i++) {
      if (m > 0.15 && rnd(i + tick * 13) > 0.55) {
        px(ctx, C.x + (rnd(i) * 2 - 1) * 12 * m, C.y + (rnd(i + 9) * 2 - 1) * 11 * m, 1, 1, '#fff6c2');
      }
    }
    const s = lerp(10, 0, m), a = t * TAU * 2;
    if (s > 0.6) {
      const bx = C.x + Math.cos(a) * 3, by = C.y + Math.sin(a) * 2;
      px(ctx, bx - s / 2, by - s * 0.35, s, s * 0.7, '#ffd23f');
      px(ctx, bx - s / 2, by - s * 0.35, s, 1, '#fff0a8');
    }
    tool(ctx, 'spatula', a + 0.8, 9);
  },

  // 2 · milk + sugar
  (ctx, t) => {
    gingham(ctx); pan(ctx);
    const pour = seg(t, 0, 0.3), sug = seg(t, 0.32, 0.55), m = seg(t, 0.55, 0.88);
    disc(ctx, C.x, C.y, 15, 14, '#ffe27a');
    disc(ctx, C.x, C.y, lerp(2, 17, pour), lerp(2, 16, pour), mix('#fffaf0', '#fff1c4', m));
    for (let i = 0; i < 30; i++) {
      if (rnd(i) < sug && rnd(i + 3) > m) {
        px(ctx, C.x + 6 + (rnd(i + 40) - 0.5) * 12, C.y - 2 + (rnd(i + 80) - 0.5) * 10, 1, 1, '#ffffff');
      }
    }
    if (t < 0.3) {
      px(ctx, 6, -2, 12, 7, '#eef3ff'); px(ctx, 6, 4, 12, 1, '#9ad7ff');
      line(ctx, 17, 4, C.x - 4, C.y - 4, '#ffffff', 2);
    }
    if (t > 0.3 && t < 0.56) {
      disc(ctx, 52, -1, 10, 5, '#e8e2ff'); disc(ctx, 52, -1, 8, 3, '#ffffff');
      for (let i = 0; i < 10; i++) px(ctx, 44 + rnd(i) * 6, (t * 90 + i * 5) % 22, 1, 1, '#ffffff');
    }
    if (m > 0) {
      swirl(ctx, t * TAU * 3, '#f2df9c', 15, 1 - m * 0.7);
      tool(ctx, 'spatula', t * TAU * 3, 8);
    }
  },

  // 3 · dry team
  (ctx, t) => {
    gingham(ctx); bowl(ctx);
    const k = seg(t, 0.05, 0.25), m = seg(t, 0.45, 0.85);
    disc(ctx, C.x - 5, C.y + 1, 9, 7, '#fbf6ee');
    px(ctx, C.x - 8, C.y - 3, 4, 1, '#ffffff');
    disc(ctx, C.x + 6, C.y - 2, 7 * k, 6 * k, '#6b3d26');
    if (t > 0.05 && t < 0.26) for (let i = 0; i < 12; i++) px(ctx, C.x + 4 + rnd(i) * 5, (t * 120 + i * 4) % 20, 1, 1, '#6b3d26');
    for (let i = 0; i < 8; i++) if (rnd(i + 20) < seg(t, 0.28, 0.42)) px(ctx, C.x - 2 + rnd(i + 30) * 8, C.y - 4 + rnd(i + 50) * 7, 1, 1, '#ffffff');
    if (m > 0) {
      disc(ctx, C.x, C.y, lerp(2, 16, m), lerp(2, 15, m), '#a87b62');
      for (let i = 0; i < 14; i++) px(ctx, C.x + (rnd(i + 60) - 0.5) * 26 * m, C.y + (rnd(i + 70) - 0.5) * 22 * m, 1, 1, '#8a5e47');
      tool(ctx, 'whisk', t * TAU * 3.5, 8);
    }
  },

  // 4 · egg + vanilla
  (ctx, t) => {
    gingham(ctx); bowl(ctx);
    const fall = seg(t, 0, 0.16), crack = seg(t, 0.18, 0.3), white = seg(t, 0.22, 0.3), m = seg(t, 0.52, 0.88);
    if (t < 0.2) {
      const ey = lerp(-8, C.y - 8, fall);
      disc(ctx, C.x, ey, 4, 5, '#fff1dc'); px(ctx, C.x - 2, ey - 3, 1, 2, '#ffffff');
    } else if (crack < 1) {
      const dx = lerp(2, 12, crack), dy = lerp(C.y - 8, -6, crack);
      disc(ctx, C.x - dx, dy, 3, 2, '#fff1dc'); disc(ctx, C.x + dx, dy, 3, 2, '#fff1dc');
    }
    if (white > 0) {
      disc(ctx, C.x, C.y, lerp(9, 15, m) * white, lerp(8, 14, m) * white, mix('#fff8ea', '#ffc94a', m));
      disc(ctx, C.x, C.y - 1, lerp(3.5, 0, m), lerp(3.5, 0, m), '#ffb22e');
      if (m < 0.5) px(ctx, C.x - 1, C.y - 3, 1, 1, '#fff2c0');
    }
    if (t > 0.34 && t < 0.52) {
      px(ctx, 54, -1, 6, 10, '#a8693a'); px(ctx, 55, 9, 4, 2, '#3a2216');
      for (let i = 0; i < 3; i++) px(ctx, 52 - i, (t * 70 + i * 6) % 18 + 10, 1, 2, '#8a5226');
    }
    if (t > 0.45 && m < 1) disc(ctx, C.x + 5, C.y + 3, lerp(2, 0, m), lerp(1.5, 0, m), '#8a5226');
    if (m > 0) {
      for (let i = 0; i < 10; i++) if (rnd(i + Math.floor(t * 20)) > 0.6) px(ctx, C.x + (rnd(i) - 0.5) * 24, C.y + (rnd(i + 5) - 0.5) * 22, 1, 1, '#ffe7a0');
      tool(ctx, 'whisk', t * TAU * 4, 7);
    }
  },

  // 5 · wet team unite
  (ctx, t) => {
    gingham(ctx); bowl(ctx);
    const p = seg(t, 0.05, 0.55), m = seg(t, 0.58, 0.9);
    disc(ctx, C.x, C.y, lerp(15, 17, p), lerp(14, 16, p), mix('#ffc94a', '#ffe08a', p));
    if (t < 0.56) {
      disc(ctx, 64, 3, 13, 7, '#80859b'); disc(ctx, 64, 3, 11, 5, '#2d303d'); disc(ctx, 62, 5, 7, 3, '#ffe58a');
      line(ctx, 70, -1, 79, -6, '#26262e', 2);
      line(ctx, 55, 8, C.x + 5, C.y - 3, '#ffe58a', 2);
      for (let j = 0; j < 3; j++) {
        const r = (t * 40 + j * 5) % 14;
        ring(ctx, C.x + 5, C.y - 2, r, r * 0.9, '#fff1b8');
      }
    }
    if (m > 0) {
      swirl(ctx, t * TAU * 3, '#fff1b8', 15, 1 - m * 0.6);
      tool(ctx, 'whisk', t * TAU * 4, 8);
    }
  },

  // 6 · make the batter
  (ctx, t) => {
    gingham(ctx); bowl(ctx);
    const k = seg(t, 0.02, 0.3), m = seg(t, 0.35, 0.85);
    disc(ctx, C.x, C.y, 17, 16, mix('#ffe08a', '#3d2116', m));
    disc(ctx, C.x - 2, C.y - 1, 10 * k * (1 - m), 8 * k * (1 - m), '#a87b62');
    if (t < 0.32) {
      disc(ctx, 10, 2, 12, 6, '#ffffff'); disc(ctx, 10, 2, 10, 4, '#a87b62');
      line(ctx, 18, 6, C.x - 3, C.y - 3, '#a87b62', 3);
    }
    if (m > 0) {
      swirl(ctx, t * TAU * 3, m < 0.6 ? '#ffe08a' : '#6b3d26', 15, m < 0.6 ? 1 - m : 0.8);
      tool(ctx, 'whisk', t * TAU * 4, 8);
    }
    if (m >= 1) {
      px(ctx, C.x - 9, C.y - 9, 5, 1, '#7a4a32'); px(ctx, C.x - 11, C.y - 8, 2, 1, '#7a4a32');
    }
  },

  // 7 · tin + foil hat
  (ctx, t) => {
    sky(ctx);
    const f = seg(t, 0.05, 0.4), k = seg(t, 0.46, 0.66), c = seg(t, 0.66, 0.82);
    disc(ctx, 40, 37, 24, 2, 'rgba(120,70,40,.25)');
    for (let y = 24; y <= 36; y++) {
      const q = (y - 24) / 12, x0 = lerp(20, 23, q), x1 = lerp(60, 57, q);
      px(ctx, x0, y, x1 - x0, 1, y > 33 ? '#b4b8c9' : '#c9ccd8');
    }
    for (let x = 23; x < 58; x += 3) px(ctx, x, 26, 1, 9, '#aeb2c4');
    disc(ctx, 40, 24, 21, 4, '#e3e6f0');
    disc(ctx, 40, 24, 19, 3, '#8c90a6');
    if (f > 0) disc(ctx, 40, 24, lerp(5, 19, f), lerp(1, 3, f), '#3d2116');
    if (t < 0.42) {
      disc(ctx, 60, 4, 13, 7, '#ffffff'); disc(ctx, 60, 5, 11, 5, '#3d2116');
      line(ctx, 50, 8, 41, 23, '#3d2116', 3);
    }
    if (k > 0) {
      const y = lerp(-14, 17, k), h = lerp(8, 5, c);
      px(ctx, 17, y + lerp(0, 2, c), 46, h, '#eef0f7');
      px(ctx, 17, y + lerp(0, 2, c) + h - 1, 46, 1, '#c4c8d8');
      if (c > 0) {
        px(ctx, 16, 22, 4, lerp(0, 8, c), '#dfe2ec');
        px(ctx, 60, 22, 4, lerp(0, 8, c), '#dfe2ec');
        for (let x = 18; x < 62; x += 4) px(ctx, x, 24, 2, lerp(0, 2, c), '#c4c8d8');
      }
      const sx = lerp(14, 66, seg(t, 0.84, 1));
      if (t > 0.84) px(ctx, sx, y + 2, 3, 3, '#ffffff');
    }
  },

  // 8 · steam it (loops forever — it's a 40-minute scene)
  (ctx, t) => {
    sky(ctx);
    px(ctx, 16, 39, 48, 4, '#26262e');
    px(ctx, 20, 26, 40, 13, '#c9ccd8'); px(ctx, 20, 36, 40, 3, '#aeb2c4');
    px(ctx, 15, 28, 5, 3, '#26262e'); px(ctx, 60, 28, 5, 3, '#26262e');
    px(ctx, 22, 16, 36, 10, '#dde0eb');
    px(ctx, 20, 25, 40, 2, '#a9adc0');
    px(ctx, 29, 13, 22, 3, '#eef0f7');
    ctx.globalAlpha = 0.75;
    for (let y = 9; y <= 16; y++) {
      const w = 19 * Math.sqrt(Math.max(0, 1 - ((16 - y) / 7) ** 2));
      px(ctx, 40 - w, y, w * 2, 1, '#e4f1ff');
    }
    ctx.globalAlpha = 1;
    px(ctx, 37, 6, 6, 4, '#26262e');
    px(ctx, 28, 11, 4, 1, '#ffffff');
    for (let i = 0; i < 6; i++) {
      const ph = (t * 2 + i / 6) % 1;
      const sx = 24 + i * 6.5 + Math.sin(ph * TAU + i) * 3;
      ctx.globalAlpha = (1 - ph) * 0.9;
      disc(ctx, sx, lerp(12, -4, ph), lerp(1.5, 4.5, ph), lerp(1.5, 4, ph), '#ffffff');
    }
    ctx.globalAlpha = 1;
    px(ctx, 4, 45, 72, 2, '#e0ad7f');
    px(ctx, 4, 45, 72 * t, 2, '#8fe0c0');
  },

  // 9 · ganache time
  (ctx, t) => {
    gingham(ctx); pan(ctx);
    const m = seg(t, 0.45, 0.88);
    disc(ctx, C.x, C.y, 17, 16, mix('#fffaf0', '#4a2617', m));
    if (t < 0.4) {
      for (let i = 0; i < 16; i++) {
        if (rnd(i + Math.floor(t * 30) * 7) > 0.5) {
          const a = (i / 16) * TAU;
          px(ctx, C.x + Math.cos(a) * 16, C.y + Math.sin(a) * 15, 1, 1, '#ffffff');
        }
      }
      for (let i = 0; i < 4; i++) {
        const ph = (t * 3 + i / 4) % 1;
        ctx.globalAlpha = 1 - ph;
        px(ctx, C.x - 9 + i * 6 + Math.sin(ph * 9) * 2, lerp(C.y - 8, -2, ph), 1, 2, '#ffffff');
      }
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < 9; i++) {
      const land = 0.18 + i * 0.024;
      if (t < land - 0.06) continue;
      const tx = C.x + (rnd(i + 90) - 0.5) * 20, ty = C.y + (rnd(i + 99) - 0.5) * 18;
      const y = lerp(-4, ty, seg(t, land - 0.06, land));
      const s = lerp(4, 0, m);
      if (s > 0.5) { px(ctx, tx, y, s, s, '#3d2116'); px(ctx, tx, y, s, 1, '#6b3d26'); }
    }
    if (m > 0) {
      swirl(ctx, t * TAU * 3, '#fff3e0', 15, (1 - m) * 0.9);
      tool(ctx, 'spatula', t * TAU * 3, 8);
    }
    if (m >= 1) { px(ctx, C.x - 9, C.y - 9, 6, 1, '#7a4a32'); px(ctx, C.x - 11, C.y - 8, 2, 1, '#7a4a32'); }
  },

  // 10 · frost + float
  (ctx, t) => {
    sky(ctx);
    const g = seg(t, 0.05, 0.3), s = seg(t, 0.3, 0.55), d = seg(t, 0.5, 0.75), fin = seg(t, 0.8, 0.9);
    const lift = fin * 2;
    disc(ctx, 40, 38, 30, 5, '#ffffff');
    disc(ctx, 40, 37, 26, 3, '#efe8fa');
    const y0 = 22 - lift;
    px(ctx, 18, y0, 45, 14, '#4a2a1b');
    disc(ctx, 40, 36 - lift, 22, 3, '#4a2a1b');
    disc(ctx, 40, y0, 22, 4, '#5e3624');
    for (let i = 0; i < 6; i++) px(ctx, 21 + rnd(i) * 38, y0 + 3 + rnd(i + 6) * 9, 1, 1, '#5e3624');
    if (g > 0) disc(ctx, 40, y0 - 2, lerp(4, 10, g), lerp(2, 3, g), '#2e190f');
    if (s > 0) disc(ctx, 40, y0, lerp(10, 22, s), lerp(3, 4, s), '#2e190f');
    if (d > 0) {
      px(ctx, 18, y0, 45, 14 * d, '#2e190f');
      for (let i = 0; i < 10; i++) px(ctx, 19 + i * 4.3, y0, 3, Math.min(15, 14 * d + rnd(i) * 4 * (1 - d) + 2), '#2e190f');
      if (d >= 1) disc(ctx, 40, 36 - lift, 22, 3, '#2e190f');
    }
    if (t > 0.08 && t < 0.72) {
      const sx = 34 + Math.sin(t * TAU * 3) * 10;
      line(ctx, sx, y0 - 3, sx + 11, y0 - 5, '#d4d8e4', 2);
      line(ctx, sx + 11, y0 - 5, sx + 18, y0 - 9, '#d14b4b', 2);
    }
    if (t > 0.78) {
      ring(ctx, 40, y0, 12, 2, '#5c3524'); ring(ctx, 40, y0, 6, 1, '#5c3524');
      const blink = Math.floor(t * 40) % 9 === 0;
      px(ctx, 32, y0 + 6, 2, blink ? 1 : 2, '#fff4e8'); px(ctx, 47, y0 + 6, 2, blink ? 1 : 2, '#fff4e8');
      px(ctx, 29, y0 + 9, 3, 1, '#ff9ec7'); px(ctx, 49, y0 + 9, 3, 1, '#ff9ec7');
      px(ctx, 39, y0 + 9, 3, 1, '#ff7fae');
    }
    if (fin > 0) {
      ring(ctx, 40, y0 - 10, lerp(2, 9, fin), lerp(0.5, 2, fin), '#ffd86b');
      const tw = Math.floor(t * 30);
      for (let i = 0; i < 5; i++) if ((tw + i) % 3 === 0) sparkle(ctx, 10 + rnd(i) * 60, 4 + rnd(i + 7) * 14, i % 2 ? '#ffffff' : '#ffd86b');
    }
  },
];

// ---------- runner ----------
// The scenes ARE the step instructions, so they play even with reduce-motion on
// (Windows "Animation effects" off sets it for every site). Tap replays from the start.
const live = new Set();
const io = 'IntersectionObserver' in window
  ? new IntersectionObserver(entries => {
      for (const e of entries) e.isIntersecting ? live.add(e.target) : live.delete(e.target);
    }, { rootMargin: '80px' })
  : null;

function draw(cv, t) {
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  SCENES[Number(cv.dataset.scene)](ctx, t);
}

export function mountScenes(root) {
  io?.disconnect();
  live.clear();
  root.querySelectorAll('canvas[data-scene]').forEach(cv => {
    cv.width = W; cv.height = H;
    cv._t0 = performance.now();
    draw(cv, 0);
    if (io) io.observe(cv); else live.add(cv);
  });
}

export function replay(cv) {
  cv._t0 = performance.now();
}

let last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (now - last < 1000 / FPS) return;
  last = now;
  for (const cv of live) {
    const elapsed = Math.floor((now - cv._t0) / (1000 / FPS)) * (1000 / FPS);
    draw(cv, (elapsed % DUR) / DUR);
  }
}
requestAnimationFrame(frame);
