// util.js — math helpers, seeded RNG, 2D oriented-box collision.
// Math frame used across the sim: X = forward-ish world east, Y = world north,
// psi = heading CCW (left-positive). THREE mapping: three.x = X, three.z = -Y.

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const deg2rad = (d) => (d * Math.PI) / 180;
export const rad2deg = (r) => (r * 180) / Math.PI;
export const sign0 = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

export function moveTowards(cur, tgt, maxDelta) {
  const d = tgt - cur;
  if (Math.abs(d) <= maxDelta) return tgt;
  return cur + Math.sign(d) * maxDelta;
}

// Frame-rate independent exponential smoothing toward a target.
export function expSmooth(cur, tgt, tau, dt) {
  if (tau <= 1e-6) return tgt;
  return tgt + (cur - tgt) * Math.exp(-dt / tau);
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export function angleDiff(a, b) {
  return wrapAngle(a - b);
}

// Piecewise-linear table lookup. table = [[x0,y0],[x1,y1],...] sorted by x.
export function tableLookup(table, x) {
  if (x <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, y0] = table[i - 1];
      const [x1, y1] = table[i];
      return lerp(y0, y1, (x - x0) / (x1 - x0));
    }
  }
  return last[1];
}

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this._f = mulberry32(this.seed);
  }
  next() {
    return this._f();
  }
  range(a, b) {
    return a + (b - a) * this._f();
  }
  int(a, b) {
    return Math.floor(this.range(a, b + 1));
  }
  pick(arr) {
    return arr[Math.floor(this._f() * arr.length) % arr.length];
  }
  chance(p) {
    return this._f() < p;
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this._f() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

/* ---------------------------------------------------------------- 2D OBB */
// box = { x, y, hx, hy, rot }  (hx = half length along local X, hy along local Y)

export function obbCorners(b, out) {
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  const ax = c * b.hx,
    ay = s * b.hx;
  const bx = -s * b.hy,
    by = c * b.hy;
  const r = out || [];
  r[0] = [b.x + ax + bx, b.y + ay + by];
  r[1] = [b.x + ax - bx, b.y + ay - by];
  r[2] = [b.x - ax - bx, b.y - ay - by];
  r[3] = [b.x - ax + bx, b.y - ay + by];
  return r;
}

function projectBox(b, axX, axY) {
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  const cx = b.x * axX + b.y * axY;
  const ex = Math.abs((c * axX + s * axY) * b.hx) + Math.abs((-s * axX + c * axY) * b.hy);
  return [cx - ex, cx + ex];
}

// Separating-axis test. Returns null when disjoint, else the minimum
// translation vector to push A out of B: { nx, ny, depth }.
export function obbOverlap(A, B) {
  const axes = [
    [Math.cos(A.rot), Math.sin(A.rot)],
    [-Math.sin(A.rot), Math.cos(A.rot)],
    [Math.cos(B.rot), Math.sin(B.rot)],
    [-Math.sin(B.rot), Math.cos(B.rot)],
  ];
  let best = Infinity;
  let bnx = 0;
  let bny = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = axes[i];
    const [amin, amax] = projectBox(A, ax, ay);
    const [bmin, bmax] = projectBox(B, ax, ay);
    if (amax < bmin || bmax < amin) return null;
    const o = Math.min(amax - bmin, bmax - amin);
    if (o < best) {
      best = o;
      bnx = ax;
      bny = ay;
    }
  }
  // Point the normal from B toward A.
  const dx = A.x - B.x;
  const dy = A.y - B.y;
  if (dx * bnx + dy * bny < 0) {
    bnx = -bnx;
    bny = -bny;
  }
  return { nx: bnx, ny: bny, depth: best };
}

export function pointInObb(px, py, b) {
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  const dx = px - b.x;
  const dy = py - b.y;
  const lx = dx * c + dy * s;
  const ly = -dx * s + dy * c;
  return Math.abs(lx) <= b.hx && Math.abs(ly) <= b.hy;
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function fmt(v, d = 0) {
  return v.toFixed(d);
}

export function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

export function timeStr(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${pad2(m)}:${pad2(s)}`;
}
