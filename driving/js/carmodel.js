// carmodel.js — procedurally built compact-sedan asset (no external models).
// Local frame: +X forward, +Y up, +Z right. Wheel contact patches at y = 0.

import * as THREE from 'three';
import { MeshBuilder, roundedRing, openRing } from './meshbuilder.js';
import { tireTexture } from './textures.js';

export const BODY_COLORS = [
  0xd9dde2, 0x1c1f24, 0x8f2a2f, 0x1d3d6b, 0x2f6b4a, 0xc8c2b4, 0x6d7176, 0xb8562a, 0x2a2f3a, 0xe0b12c,
];

const V = (x, y, z) => [x, y, z];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

// Rectangular beam between two points — used for pillars, stems, wipers.
function beam(b, p0, p1, w, h, color) {
  const d = norm(sub(p1, p0));
  let up = Math.abs(d[1]) > 0.94 ? [1, 0, 0] : [0, 1, 0];
  const right = norm(cross(d, up));
  up = norm(cross(right, d));
  const ring = (p) => [
    add(add(p, mul(right, w / 2)), mul(up, h / 2)),
    add(add(p, mul(right, w / 2)), mul(up, -h / 2)),
    add(add(p, mul(right, -w / 2)), mul(up, -h / 2)),
    add(add(p, mul(right, -w / 2)), mul(up, h / 2)),
  ];
  b.loft([ring(p0), ring(p1)], color, true, true);
}

// Torus lying in the local XY plane (axis = Z) — the steering wheel rim.
function torus(b, R, r, majorSeg, minorSeg, color) {
  const rings = [];
  for (let i = 0; i <= majorSeg; i++) {
    const t = (i / majorSeg) * Math.PI * 2;
    const cx = Math.cos(t) * R;
    const cy = Math.sin(t) * R;
    const ring = [];
    for (let j = 0; j < minorSeg; j++) {
      const p = (j / minorSeg) * Math.PI * 2;
      ring.push([cx + Math.cos(t) * r * Math.cos(p), cy + Math.sin(t) * r * Math.cos(p), r * Math.sin(p)]);
    }
    rings.push(ring);
  }
  b.loft(rings, color, false, false);
}

/* ------------------------------------------------------------ body shell */

const LOWER_STATIONS = [
  // x, halfWidth, yBottom, yTop — arches bulge at the axles so the wheels show.
  [-2.37, 0.6, 0.52, 0.8],
  [-2.26, 0.78, 0.42, 0.89],
  [-1.98, 0.848, 0.42, 0.935],
  [-1.75, 0.858, 0.46, 0.944],
  [-1.55, 0.8625, 0.52, 0.951], // rear-glass base: cabin aperture starts here
  [-1.37, 0.865, 0.6, 0.955],
  [-1.12, 0.862, 0.48, 0.958],
  [-0.55, 0.865, 0.35, 0.962],
  [0.25, 0.865, 0.34, 0.962],
  [0.82, 0.864, 0.44, 0.958],
  [0.93, 0.8645, 0.5, 0.955], // cowl: cabin aperture ends here
  [1.18, 0.865, 0.6, 0.95],
  [1.46, 0.858, 0.47, 0.94],
  [1.78, 0.836, 0.41, 0.905],
  [1.99, 0.77, 0.44, 0.86],
  [2.05, 0.58, 0.54, 0.79],
];

const COWL_X = 0.93;
const REAR_GLASS_X = -1.55;
const RING_SEGS = 21;
const OPEN_FRAC = 0.925;

const BELT = 0.962;
const ROOF_Y = 1.452;

function buildShell(b, paint, dark) {
  // The lower body is an OPEN shell: the top centre band is left out between
  // the cowl and the rear-glass base so the cabin is a real aperture rather
  // than a painted deck at belt height. The bonnet and boot decks are then
  // laid across the gap, and the middle stays open for the interior.
  const rings = LOWER_STATIONS.map(([x, w, yb, yt]) =>
    openRing(x, w, yb, yt, RING_SEGS, 5.5, OPEN_FRAC, 3.0)
  );
  b.loft(rings, paint, true, true, false);

  // Decks over the gap. Ring point 0 is the +Z edge, the last is the -Z edge.
  const N = RING_SEGS - 1;
  const deck = (a, c) => {
    const A = rings[a];
    const B = rings[c];
    const mid = (p, q, lift) => [
      (p[0] + q[0]) / 2,
      (p[1] + q[1]) / 2 + lift,
      (p[2] + q[2]) / 2,
    ];
    const mA = mid(A[0], A[N], 0.012);
    const mB = mid(B[0], B[N], 0.012);
    b.quad(A[0], B[0], mB, mA, paint);
    b.quad(mA, mB, B[N], A[N], paint);
  };
  // Belt strip: lifts the open edge the last few millimetres up to the top of
  // the station so the door tops meet the glass instead of leaving a slot.
  const belt = (a, c) => {
    const A = rings[a];
    const B = rings[c];
    const ya = LOWER_STATIONS[a][3];
    const yb = LOWER_STATIONS[c][3];
    const At = [A[0][0], ya, A[0][2]];
    const Bt = [B[0][0], yb, B[0][2]];
    b.quad(A[0], B[0], Bt, At, paint);
    const An = [A[N][0], ya, A[N][2]];
    const Bn = [B[N][0], yb, B[N][2]];
    b.quad(A[N], An, Bn, B[N], paint);
  };
  for (let i = 0; i < LOWER_STATIONS.length - 1; i++) {
    const x0 = LOWER_STATIONS[i][0];
    const x1 = LOWER_STATIONS[i + 1][0];
    if (x0 >= COWL_X - 1e-6 || x1 <= REAR_GLASS_X + 1e-6) deck(i, i + 1);
    else belt(i, i + 1);
  }

  // Greenhouse: pillars + roof panel.
  const aB = 0.92,
    aT = 0.12,
    cT = -1.04,
    cB = -1.58;
  const zBelt = 0.755,
    zRoof = 0.625;
  for (const s of [-1, 1]) {
    beam(b, V(aB, BELT - 0.01, s * zBelt), V(aT, ROOF_Y, s * zRoof), 0.075, 0.09, paint); // A pillar
    beam(b, V(-0.32, BELT - 0.01, s * 0.79), V(-0.32, ROOF_Y - 0.01, s * 0.645), 0.085, 0.085, paint); // B pillar
    beam(b, V(cT, ROOF_Y - 0.01, s * zRoof), V(cB, BELT - 0.01, s * 0.775), 0.13, 0.1, paint); // C pillar
  }
  // Roof shell with a slight crown.
  const NX = 8,
    NZ = 6;
  const roofPt = (u, v) => {
    const x = aT + (cT - aT) * u;
    const hw = 0.628 - 0.02 * u;
    const z = -hw + 2 * hw * v;
    const crown = Math.cos((v - 0.5) * Math.PI) * 0.028;
    const arc = Math.sin(u * Math.PI) * 0.012;
    return V(x, ROOF_Y + crown + arc - 0.02, z);
  };
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ; j++) {
      const u0 = i / NX,
        u1 = (i + 1) / NX,
        v0 = j / NZ,
        v1 = (j + 1) / NZ;
      b.quad(roofPt(u0, v0), roofPt(u1, v0), roofPt(u1, v1), roofPt(u0, v1), paint);
    }
  }
  // Roof rails / drip rails close the gap to the belt line.
  for (const s of [-1, 1]) {
    beam(b, V(aT, ROOF_Y - 0.055, s * 0.62), V(cT, ROOF_Y - 0.055, s * 0.604), 0.04, 0.025, paint);
  }
  // Door tops: a rail along the open edge from the cowl back to the C pillar.
  for (const s of [-1, 1]) {
    beam(b, V(COWL_X, BELT - 0.02, s * 0.8), V(REAR_GLASS_X, BELT - 0.02, s * 0.8), 0.05, 0.045, paint);
  }
  // Cowl panel under the windshield.
  b.box(0.98, BELT - 0.035, 0, 0.19, 0.04, 1.42, dark);
}

function buildGlass(b, glass) {
  const G = 0.008;
  const zs = 0.723;
  // Windshield.
  b.quad(V(0.93, 0.958, -0.72), V(0.93, 0.958, 0.72), V(0.14, 1.418, 0.6), V(0.14, 1.418, -0.6), glass);
  // Rear glass.
  b.quad(V(-1.05, 1.41, -0.6), V(-1.05, 1.41, 0.6), V(-1.55, 0.958, 0.735), V(-1.55, 0.958, -0.735), glass);
  // Side glass — front and rear door panes on each flank.
  for (const s of [-1, 1]) {
    const z = s * zs;
    b.quad(
      V(0.9, 0.958, z),
      V(0.16, 1.4, z),
      V(-0.29, 1.412, z),
      V(-0.29, 0.958, z),
      glass,
      null,
      [0, 0, s]
    );
    b.quad(
      V(-0.36, 0.958, z),
      V(-0.36, 1.412, z),
      V(-1.0, 1.4, z),
      V(-1.32, 0.958, z),
      glass,
      null,
      [0, 0, s]
    );
  }
  return G;
}

function buildTrim(b, dark, chrome, detail) {
  // Rocker sills.
  for (const s of [-1, 1]) b.box(-0.1, 0.36, s * 0.845, 2.3, 0.14, 0.045, dark);
  // Under-floor pan so the cabin is not see-through from below.
  b.box(-0.15, 0.33, 0, 3.4, 0.06, 1.2, 0x14161a);
  // Bumpers.
  b.box(1.98, 0.52, 0, 0.14, 0.2, 1.36, dark);
  b.box(-2.3, 0.55, 0, 0.14, 0.2, 1.3, dark);
  // Grille + lower intake.
  b.box(2.02, 0.74, 0, 0.07, 0.16, 0.86, 0x101216);
  b.box(2.03, 0.5, 0, 0.06, 0.16, 1.0, 0x101216);
  for (let i = -3; i <= 3; i++) b.box(2.05, 0.74 + i * 0.035, 0, 0.03, 0.014, 0.84, chrome);
  // Wheel-arch liners (stops you seeing straight through the car).
  for (const ax of [1.18, -1.37]) {
    for (const s of [-1, 1]) b.cylinder(ax, 0.36, s * 0.56, 0.36, 0.26, 12, 0x0b0c0e, 'z');
  }
  // Door shut lines.
  for (const s of [-1, 1]) {
    for (const x of [0.9, -0.32, -1.35]) b.box(x, 0.66, s * 0.868, 0.018, 0.56, 0.01, 0x2a2c30);
    b.box(0.3, 0.83, s * 0.872, 1.1, 0.035, 0.012, 0x2a2c30);
    b.box(-0.85, 0.83, s * 0.872, 0.9, 0.035, 0.012, 0x2a2c30);
    // Handles.
    b.box(0.28, 0.86, s * 0.878, 0.2, 0.05, 0.03, chrome);
    b.box(-0.83, 0.86, s * 0.878, 0.2, 0.05, 0.03, chrome);
  }
  // Belt-line chrome.
  for (const s of [-1, 1]) b.box(-0.3, 0.955, s * 0.845, 2.2, 0.022, 0.02, chrome);
  // Exhaust.
  b.cylinder(-2.3, 0.36, -0.5, 0.045, 0.26, 10, 0x53565b, 'x');
  if (detail === 'high') {
    // Wipers.
    beam(b, V(1.0, 0.99, -0.5), V(0.62, 1.16, -0.1), 0.03, 0.02, 0x1a1c20);
    beam(b, V(1.0, 0.99, 0.28), V(0.62, 1.16, 0.62), 0.03, 0.02, 0x1a1c20);
    // Shark-fin antenna.
    beam(b, V(-0.95, ROOF_Y - 0.01, 0), V(-1.12, ROOF_Y + 0.09, 0), 0.03, 0.02, 0x1a1c20);
  }
}

function buildMirrors(b, dark, glass) {
  const out = {};
  for (const s of [-1, 1]) {
    // Stem then housing.
    beam(b.trim, V(0.86, 1.0, s * 0.8), V(0.855, 1.02, s * 0.9), 0.07, 0.06, dark);
    b.trim.box(0.845, 1.03, s * 0.98, 0.19, 0.11, 0.11, dark);
    b.glass.quad(
      V(0.775, 0.99, s * 1.03),
      V(0.775, 1.08, s * 1.03),
      V(0.915, 1.08, s * 1.03),
      V(0.915, 0.99, s * 1.03),
      0x2b3a4a,
      null,
      [0, 0, s]
    );
  }
  return out;
}

/* ---------------------------------------------------------------- wheels */

// Emitted directly in car space: the geometry rolls in XY with its axle on Z,
// which is exactly the car's own frame, so baking a wheel is just a translation.
function emitTire(b, R, W, ox, oy, oz) {
  const SEG = 22;
  const prof = [
    [-W / 2, R * 0.86],
    [-W / 2 + 0.02, R * 0.965],
    [-W / 2 + 0.05, R],
    [W / 2 - 0.05, R],
    [W / 2 - 0.02, R * 0.965],
    [W / 2, R * 0.86],
  ];
  const rings = prof.map(([z, rr]) => {
    const ring = [];
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      ring.push([ox + Math.cos(a) * rr, oy + Math.sin(a) * rr, oz + z]);
    }
    return ring;
  });
  b.loft(rings, 0x141416, false, false);
  for (const s of [-1, 1]) {
    const zOuter = oz + (s * W) / 2;
    const ringA = [];
    const ringB = [];
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      ringA.push([ox + Math.cos(a) * R * 0.86, oy + Math.sin(a) * R * 0.86, zOuter]);
      ringB.push([ox + Math.cos(a) * R * 0.6, oy + Math.sin(a) * R * 0.6, zOuter]);
    }
    b.loft([ringA, ringB], 0x1a1a1d, false, false);
  }
}

function emitRim(b, R, W, ox, oy, oz) {
  const rr = R * 0.62;
  b.cylinder(ox, oy, oz, rr, W * 0.55, 20, 0x9aa0a8, 'z');
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const bx = Math.cos(a) * rr * 0.55;
    const by = Math.sin(a) * rr * 0.55;
    beam(b, [ox, oy, oz + W * 0.2], [ox + bx * 1.7, oy + by * 1.7, oz + W * 0.2], 0.055, 0.055, 0xb6bcc4);
  }
  b.cylinder(ox, oy, oz + W * 0.24, rr * 0.28, 0.05, 14, 0x7f858c, 'z');
}

// 'high' keeps tyre and rim on separate materials; everything else merges them
// so a traffic car costs four wheel draw calls instead of eight.
function wheelGeometries(R, W, split) {
  if (split) {
    const t = new MeshBuilder();
    const r = new MeshBuilder();
    emitTire(t, R, W, 0, 0, 0);
    emitRim(r, R, W, 0, 0, 0);
    return { tire: t.geometry(), rim: r.geometry() };
  }
  const m = new MeshBuilder();
  emitTire(m, R, W, 0, 0, 0);
  emitRim(m, R, W, 0, 0, 0);
  return { tire: m.geometry(), rim: null };
}

/* ------------------------------------------------------------- interior */

function buildInterior(b, seatCol, detail = 'high') {
  const trimC = 0x2b2e35;
  // Floor + parcel shelf.
  b.box(-0.3, 0.44, 0, 2.7, 0.05, 1.5, 0x1a1c20);
  b.box(-1.4, 0.94, 0, 0.42, 0.05, 1.3, trimC);
  // Dashboard sits ahead of the wheel, its top pad meeting the screen base.
  b.box(0.8, 0.845, 0, 0.32, 0.33, 1.5, trimC);
  b.box(0.92, 1.0, 0, 0.16, 0.05, 1.48, 0x393d45);
  // Instrument binnacle, directly ahead of the driver.
  b.box(0.58, 1.02, -0.36, 0.26, 0.08, 0.44, 0x1c1f24);
  // Centre stack + console + shifter.
  b.box(0.74, 0.88, 0.02, 0.14, 0.3, 0.4, 0x101216);
  b.box(0.3, 0.62, 0.02, 0.72, 0.2, 0.34, trimC);
  b.box(0.16, 0.74, 0.02, 0.12, 0.12, 0.06, 0x3a3d44);
  // Door cards.
  for (const s of [-1, 1]) {
    b.box(-0.1, 0.72, s * 0.745, 2.2, 0.44, 0.05, trimC);
    b.box(0.28, 0.86, s * 0.705, 0.24, 0.05, 0.05, 0x3a3d44);
  }
  // Seats: H-point roughly level with the B-pillar, headrests kept low so the
  // rear-view mirror still has a usable window.
  const seat = (x, z) => {
    b.box(x, 0.6, z, 0.55, 0.14, 0.5, seatCol);
    b.box(x - 0.3, 0.84, z, 0.14, 0.56, 0.5, seatCol);
    b.box(x - 0.32, 1.16, z, 0.12, 0.17, 0.23, seatCol);
  };
  seat(-0.05, -0.36);
  seat(-0.05, 0.36);
  b.box(-1.05, 0.58, 0, 0.55, 0.14, 1.3, seatCol);
  b.box(-1.32, 0.8, 0, 0.16, 0.5, 1.3, seatCol);
  // No 3D rear-view mirror body: the HUD mirror at the top of the screen is
  // the working one, and a black slab floating up-right only gets in the way.
  if (detail !== 'high') return;
  // Steering column shroud (only the car you actually sit in needs one).
  beam(b, V(0.47, 0.99, -0.36), V(0.68, 0.84, -0.36), 0.1, 0.1, 0x17191d);
}

function buildSteeringWheel() {
  const b = new MeshBuilder();
  const R = 0.185;
  torus(b, R, 0.019, 26, 8, 0x1b1d21);
  // Three spokes and the hub.
  for (const a of [Math.PI, -Math.PI / 6, (-Math.PI * 5) / 6]) {
    beam(b, V(0, 0, 0), V(Math.cos(a) * R, Math.sin(a) * R, 0), 0.035, 0.02, 0x26292f);
  }
  b.cylinder(0, 0, 0, 0.055, 0.05, 14, 0x2c2f35, 'z');
  b.box(0, 0, 0.028, 0.055, 0.02, 0.01, 0xc9cdd3);
  return b.geometry();
}

/* --------------------------------------------------------------- public */

// detail: 'high'   the car you drive — separate lamp materials, live wheels
//         'low'    AI traffic — animated wheels, brake lights, merged rims
//         'static' parked scenery — everything baked into three draw calls
export function buildCar(opts = {}) {
  const detail = opts.detail || 'high';
  const anim = detail !== 'static';
  const paint = opts.color !== undefined ? opts.color : 0xd9dde2;
  const seatCol = opts.interior !== undefined ? opts.interior : 0x35383e;
  const dark = 0x1c1e22;
  const chrome = 0xb9bec6;

  const group = new THREE.Group();
  group.name = 'car';

  const bPaint = new MeshBuilder();
  const bTrim = new MeshBuilder();
  const bGlass = new MeshBuilder();

  buildShell(bPaint, paint, dark);
  buildGlass(bGlass, 0x141c24);
  buildTrim(bTrim, dark, chrome, detail);
  buildMirrors({ trim: bTrim, glass: bGlass }, dark, 0x2b3a4a);
  // Every car gets an interior — without one, the glass reads as a hollow
  // shell and traffic looks like wireframes.
  buildInterior(bTrim, seatCol, detail);

  const envInt = detail === 'high' ? 1.0 : 0.6;
  // Car paint is a dielectric under clear lacquer: high metalness just makes
  // the flanks mirror the dark ground and the colour disappears.
  const paintMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    metalness: 0.12,
    roughness: 0.34,
    clearcoat: 0.9,
    clearcoatRoughness: 0.1,
    envMapIntensity: envInt * 0.8,
    side: THREE.DoubleSide,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.2,
    roughness: 0.66,
    envMapIntensity: envInt * 0.6,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    metalness: 0.1,
    roughness: 0.06,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    envMapIntensity: envInt * 1.4,
  });

  // The merged body meshes are added at the end, once every bake has run.

  /* lamps ---------------------------------------------------------------- */
  const LAMPS = {
    head: [
      [1.95, 0.75, -0.53, 0.12, 0.16, 0.36],
      [1.95, 0.75, 0.53, 0.12, 0.16, 0.36],
    ],
    tail: [
      [-2.24, 0.78, -0.5, 0.1, 0.18, 0.34],
      [-2.24, 0.78, 0.5, 0.1, 0.18, 0.34],
    ],
    rev: [
      [-2.25, 0.65, -0.28, 0.08, 0.08, 0.18],
      [-2.25, 0.65, 0.28, 0.08, 0.08, 0.18],
    ],
    indL: [
      [1.96, 0.64, -0.66, 0.1, 0.09, 0.16],
      [-2.25, 0.645, -0.5, 0.09, 0.07, 0.32],
      [0.845, 1.03, -1.03, 0.13, 0.03, 0.03],
    ],
    indR: [
      [1.96, 0.64, 0.66, 0.1, 0.09, 0.16],
      [-2.25, 0.645, 0.5, 0.09, 0.07, 0.32],
      [0.845, 1.03, 1.03, 0.13, 0.03, 0.03],
    ],
  };
  const LAMP_TINT = { head: 0xe8eef5, tail: 0x8f1a1f, rev: 0xd8dde2, indL: 0xb06a12, indR: 0xb06a12 };

  const lampMat = (hex, emissive, inten) =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex),
      emissive: new THREE.Color(emissive),
      emissiveIntensity: inten,
      roughness: 0.25,
      metalness: 0.1,
    });

  const head = lampMat(0xdfe6ee, 0xfff2d0, 0.15);
  const tail = lampMat(0x6d1418, 0xff1c1c, 0.25);
  const rev = lampMat(0xd8dde2, 0xffffff, 0.05);
  const indL = lampMat(0x8a5510, 0xff8a10, 0.0);
  const indR = lampMat(0x8a5510, 0xff8a10, 0.0);
  const lampMats = { head, tail, rev, indL, indR };

  if (anim) {
    for (const key of Object.keys(LAMPS)) {
      const lb = new MeshBuilder();
      for (const [x, y, z, sx, sy, sz] of LAMPS[key]) lb.box(x, y, z, sx, sy, sz, 0xffffff);
      const m = new THREE.Mesh(lb.geometry(), lampMats[key]);
      m.name = 'lamp' + key[0].toUpperCase() + key.slice(1);
      group.add(m);
    }
    // Round projector elements, cosmetic only.
    const hb = new MeshBuilder();
    for (const s of [-1, 1]) {
      hb.cylinder(1.99, 0.75, s * 0.44, 0.055, 0.05, 12, 0xffffff, 'x');
      hb.cylinder(1.99, 0.75, s * 0.61, 0.055, 0.05, 12, 0xffffff, 'x');
    }
    group.add(new THREE.Mesh(hb.geometry(), head));
  } else {
    // Parked scenery: bake the lamps into the trim so they cost nothing.
    for (const key of Object.keys(LAMPS)) {
      for (const [x, y, z, sx, sy, sz] of LAMPS[key]) bTrim.box(x, y, z, sx, sy, sz, LAMP_TINT[key]);
    }
  }

  /* wheels --------------------------------------------------------------- */
  const R = 0.303;
  const W = 0.2;
  const AXLE_F = 1.18,
    AXLE_R = -1.37,
    HALF_TRACK = 0.745;
  const spec = [
    [AXLE_F, -HALF_TRACK, true],
    [AXLE_F, HALF_TRACK, true],
    [AXLE_R, -HALF_TRACK, false],
    [AXLE_R, HALF_TRACK, false],
  ];
  const wheels = [];
  let wIdx = 0;

  if (!anim) {
    for (const [ax, az] of spec) {
      emitTire(bTrim, R, W, ax, R, az);
      emitRim(bTrim, R, W, ax, R, az);
    }
  } else {
    const geos = wheelGeometries(R, W, detail === 'high');
    const tireMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.0,
      map: tireTexture(),
    });
    const rimMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.28,
      metalness: 0.9,
      envMapIntensity: envInt,
    });
    for (const [ax, az, steered] of spec) {
      // steerNode turns about the kingpin, spinNode rolls about the axle. The
      // wheel geometry already has its axle on +Z, the car's lateral axis — it
      // must NOT be re-oriented, or it rolls about the wrong axis.
      const steerNode = new THREE.Group();
      steerNode.name = 'wheel' + wIdx;
      steerNode.position.set(ax, R, az);
      const spinNode = new THREE.Group();
      spinNode.name = 'spin' + wIdx;
      // Flip the left-hand wheels so the rim dish faces outboard on both sides.
      const sideNode = new THREE.Group();
      sideNode.rotation.y = az < 0 ? Math.PI : 0;
      const tm = new THREE.Mesh(geos.tire, tireMat);
      tm.castShadow = true;
      sideNode.add(tm);
      if (geos.rim) {
        const rm = new THREE.Mesh(geos.rim, rimMat);
        rm.castShadow = true;
        sideNode.add(rm);
      }
      spinNode.add(sideNode);
      steerNode.add(spinNode);
      group.add(steerNode);
      wheels.push({ steerNode, spinNode, steered, side: Math.sign(az) });
      wIdx++;
    }
  }

  /* driver station ------------------------------------------------------- */
  let steerWheel = null;
  if (detail === 'high') {
    const column = new THREE.Group();
    column.position.set(0.42, 0.99, -0.36);
    const tilt = (23 * Math.PI) / 180;
    const n = new THREE.Vector3(-Math.cos(tilt), Math.sin(tilt), 0).normalize();
    column.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    const wheelMesh = new THREE.Mesh(buildSteeringWheel(), trimMat);
    steerWheel = new THREE.Group();
    steerWheel.add(wheelMesh);
    column.add(steerWheel);
    group.add(column);
  }

  const paintMesh = new THREE.Mesh(bPaint.geometry(), paintMat);
  const trimMesh = new THREE.Mesh(bTrim.geometry(), trimMat);
  const glassMesh = new THREE.Mesh(bGlass.geometry(), glassMat);
  paintMesh.castShadow = true;
  trimMesh.castShadow = true;
  paintMesh.receiveShadow = false;
  group.add(paintMesh, trimMesh, glassMesh);

  const anchors = {
    driverEye: new THREE.Vector3(-0.28, 1.205, -0.36),
    hood: new THREE.Vector3(1.0, 1.6, 0),
    rearMirror: new THREE.Vector3(0.2, 1.35, -0.02),
    mirrorLeft: new THREE.Vector3(0.83, 1.035, -1.0),
    mirrorRight: new THREE.Vector3(0.83, 1.035, 1.0),
  };

  return {
    group,
    wheels,
    steerWheel,
    anchors,
    materials: { paintMat, trimMat, glassMat, ...lampMats },
    wheelRadius: R,
    size: { length: 4.42, width: 1.73, height: 1.475, wheelbase: 2.55 },
  };
}

// Compact variant used for AI traffic and parked cars: same silhouette, no
// interior, one merged wheel material.
export function buildTrafficCar(color, seed = 0) {
  const car = buildCar({ detail: 'low', color });
  return car;
}
