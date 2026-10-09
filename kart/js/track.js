// The circuit: a closed Catmull-Rom spline through hand-placed points, resampled
// every SPACING metres. Pure math, no three.js, so the node self-test can use it.
//
// Frame: x/z is the ground plane, y is up. A kart with heading h faces
// (sin h, 0, cos h); its LEFT is (cos h, 0, -sin h).

export const SPACING = 2;
export const HALF = 9;        // road half-width
export const CURB = 1.3;      // red/white strip just outside the road
export const WALL = 19;       // fence distance from the centre line
export const LAPS = 3;

// [x, z, y] — y is the road height, for the hill on the back section.
const PTS = [
  [-60, 0, 0], [40, 0, 0], [120, 0, 0.3], [178, -22, 1.2], [200, -80, 3], [172, -138, 5.5],
  [115, -156, 7.5], [68, -128, 6.5], [42, -88, 4], [2, -76, 2.2], [-32, -104, 2], [-44, -158, 3],
  [-86, -206, 4], [-152, -212, 3], [-204, -170, 2], [-210, -108, 1], [-178, -52, 0.2], [-126, -12, 0],
];

export const LAKE = { x: 118, z: -78, r: 32, level: -0.7 };

function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

export function buildTrack() {
  // dense pass
  const dense = [];
  const n = PTS.length;
  for (let i = 0; i < n; i++) {
    const p0 = PTS[(i - 1 + n) % n], p1 = PTS[i], p2 = PTS[(i + 1) % n], p3 = PTS[(i + 2) % n];
    for (let k = 0; k < 60; k++) {
      const t = k / 60;
      dense.push([cr(p0[0], p1[0], p2[0], p3[0], t), cr(p0[1], p1[1], p2[1], p3[1], t), cr(p0[2], p1[2], p2[2], p3[2], t)]);
    }
  }
  // arc-length resample
  let total = 0;
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1], b = dense[i % dense.length];
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
    cum.push(total);
  }
  const count = Math.round(total / SPACING);
  const ds = total / count;
  const S = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const s = k * ds;
    while (cum[j + 1] < s) j++;
    const f = (s - cum[j]) / (cum[j + 1] - cum[j]);
    const a = dense[j], b = dense[(j + 1) % dense.length];
    S.push({ x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, y: a[2] + (b[2] - a[2]) * f, s });
  }
  for (let k = 0; k < count; k++) {
    const a = S[(k - 1 + count) % count], b = S[(k + 1) % count], p = S[k];
    const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz);
    p.tx = tx / l; p.tz = tz / l;
    p.nx = p.tz; p.nz = -p.tx;          // left normal
    p.h = Math.atan2(p.tx, p.tz);       // heading along the track
  }
  // curvature over the next ~24 m (for the CPU and for spotting corners)
  for (let k = 0; k < count; k++) {
    const a = S[k], b = S[(k + 12) % count];
    let d = b.h - a.h;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    a.curve = d;
  }
  const T = { S, n: count, ds, length: total };
  buildGrid(T);
  return T;
}

// ---- nearest sample + ground height, via a precomputed grid -------------
const CELL = 3;

function buildGrid(T) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of T.S) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const pad = 420;
  const g = { x0: minX - pad, z0: minZ - pad, nx: 0, nz: 0 };
  g.nx = Math.ceil((maxX - minX + 2 * pad) / CELL) + 1;
  g.nz = Math.ceil((maxZ - minZ + 2 * pad) / CELL) + 1;
  g.idx = new Int32Array(g.nx * g.nz);
  g.dist = new Float32Array(g.nx * g.nz);
  g.h = new Float32Array(g.nx * g.nz);
  // coarse-to-fine nearest search: every 4th sample, then refine around it
  for (let iz = 0; iz < g.nz; iz++) {
    for (let ix = 0; ix < g.nx; ix++) {
      const x = g.x0 + ix * CELL, z = g.z0 + iz * CELL;
      let best = 0, bd = Infinity;
      for (let k = 0; k < T.n; k += 4) {
        const p = T.S[k], d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
      for (let k = best - 4; k <= best + 4; k++) {
        const p = T.S[(k + T.n) % T.n], d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < bd) { bd = d; best = (k + T.n) % T.n; }
      }
      const c = iz * g.nx + ix;
      g.idx[c] = best;
      g.dist[c] = Math.sqrt(bd);
      g.h[c] = terrain(x, z, T.S[best].y, Math.sqrt(bd));
    }
  }
  T.grid = g;
}

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Rolling hills away from the track, flat shoulders beside it, a lake in the infield.
function terrain(x, z, roadY, d) {
  const hills = 3.2 * Math.sin(x / 47 + 1.3) * Math.cos(z / 39) + 2.2 * Math.sin((x + z) / 83) + 1.5;
  const far = smooth(260, 520, Math.hypot(x + 10, z + 105));
  const mountains = far * (30 + 18 * Math.sin(Math.atan2(z + 105, x + 10) * 5));
  const w = smooth(WALL + 4, WALL + 55, d);
  let h = roadY * (1 - w) + (hills + mountains) * w - 0.05 * (1 - w);
  const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (ld < LAKE.r + 14) h = Math.min(h, LAKE.level - 1.6 + smooth(LAKE.r - 10, LAKE.r + 14, ld) * (h - LAKE.level + 1.6));
  return h;
}

function cellAt(T, x, z) {
  const g = T.grid;
  const ix = Math.max(0, Math.min(g.nx - 1, Math.round((x - g.x0) / CELL)));
  const iz = Math.max(0, Math.min(g.nz - 1, Math.round((z - g.z0) / CELL)));
  return iz * g.nx + ix;
}

export function groundAt(T, x, z) {
  const g = T.grid;
  const fx = (x - g.x0) / CELL, fz = (z - g.z0) / CELL;
  const ix = Math.max(0, Math.min(g.nx - 2, Math.floor(fx))), iz = Math.max(0, Math.min(g.nz - 2, Math.floor(fz)));
  const tx = fx - ix, tz = fz - iz, c = iz * g.nx + ix;
  const a = g.h[c], b = g.h[c + 1], d = g.h[c + g.nx], e = g.h[c + g.nx + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (d * (1 - tx) + e * tx) * tz;
}

export function distToTrack(T, x, z) { return T.grid.dist[cellAt(T, x, z)]; }

// Nearest sample, searched around a hint (a kart's last index) so a kart
// never snaps onto a different part of the circuit.
export function nearest(T, x, z, hint) {
  let best, bd = Infinity;
  if (hint === undefined || hint < 0) {
    best = T.grid.idx[cellAt(T, x, z)];
  } else {
    best = hint;
  }
  for (let r = 0; r < 3; r++) {
    const c = best;
    for (let k = -8; k <= 8; k++) {
      const i = (c + k + T.n) % T.n, p = T.S[i], d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    if (best === c) break;
  }
  return best;
}

// Signed lateral offset (left +) and the road height under (x, z) at sample i.
export function frame(T, i, x, z) {
  const p = T.S[i], q = T.S[(i + 1) % T.n];
  const dx = x - p.x, dz = z - p.z;
  const lat = dx * p.nx + dz * p.nz;
  const along = dx * p.tx + dz * p.tz;
  const f = Math.max(0, Math.min(1, along / T.ds));
  return { lat, along, y: p.y + (q.y - p.y) * f };
}

export function pointAt(T, i, lat = 0) {
  const p = T.S[((i % T.n) + T.n) % T.n];
  return { x: p.x + p.nx * lat, z: p.z + p.nz * lat, y: p.y, h: p.h };
}
