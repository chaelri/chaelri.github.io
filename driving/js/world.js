// world.js — procedural town: road grid, kerbs, buildings, parking lots,
// traffic lights and the training range. Everything is baked into a handful of
// merged meshes so four render passes (main + three mirrors) stay cheap.
//
// Authoring frame is the math frame (X, Y). THREE gets x = X, z = -Y.

import * as THREE from 'three';
import { MeshBuilder } from './meshbuilder.js';
import { asphaltTexture, concreteTexture, grassTexture, dirtTexture, facadeTexture } from './textures.js';
import { Rng, clamp, lerp } from './util.js';
import { buildCar, BODY_COLORS } from './carmodel.js';

export const GRID = 6;
export const BLOCK = 74;
export const ROAD_W = 11;
export const HW = ROAD_W / 2;
export const LANE = 3.4;
export const SIDEWALK = 2.6;

const Y_GROUND = 0.0;
const Y_ROAD = 0.02;
const Y_PAINT = 0.035;
const Y_KERB = 0.15;

const mbRot = (psi) => -psi;

export class World {
  constructor(scene, seed = 1, opts = {}) {
    this.scene = scene;
    this.seed = seed >>> 0;
    this.rng = new Rng(this.seed);
    this.group = new THREE.Group();
    scene.add(this.group);

    const span = (GRID - 1) * BLOCK;
    this.off = -span / 2;
    this.gx = [];
    this.gy = [];
    for (let i = 0; i < GRID; i++) {
      this.gx.push(this.off + i * BLOCK);
      this.gy.push(this.off + i * BLOCK);
    }
    this.min = this.off - HW - 26;
    this.max = -this.min;

    this.colliders = [];
    this.cones = [];
    this.bays = [];
    this.lots = [];
    this.cells = [];
    this.parkedCars = [];
    this.lights = [];
    this.lightTime = 0;
    this.night = !!opts.night;

    this._generate();
    this._build();
  }

  /* ----------------------------------------------------------- generation */

  _generate() {
    const rng = this.rng;
    const types = [];
    for (let j = 0; j < GRID - 1; j++) {
      for (let i = 0; i < GRID - 1; i++) {
        let t = 'buildings';
        const roll = rng.next();
        if (roll < 0.16) t = 'park';
        else if (roll < 0.28) t = 'lot';
        else if (roll < 0.34) t = 'empty';
        types.push({ i, j, type: t });
      }
    }
    // The bottom-left cell is always the driving range.
    types.find((c) => c.i === 0 && c.j === 0).type = 'range';
    // Guarantee at least one shopping-centre style car park.
    if (!types.some((c) => c.type === 'lot')) types[Math.floor(types.length / 2)].type = 'lot';
    this.cells = types;

    // Traffic-light intersections: interior crossings, every other one.
    for (let j = 1; j < GRID - 1; j++) {
      for (let i = 1; i < GRID - 1; i++) {
        if ((i + j) % 2 === 0 && this.lights.length < 6) {
          this.lights.push({ i, j, x: this.gx[i], y: this.gy[j] });
        }
      }
    }
  }

  cellRect(i, j) {
    return {
      x0: this.gx[i] + HW,
      x1: this.gx[i + 1] - HW,
      y0: this.gy[j] + HW,
      y1: this.gy[j + 1] - HW,
    };
  }

  /* --------------------------------------------------------------- meshes */

  _build() {
    const road = new MeshBuilder();
    const paint = new MeshBuilder();
    const kerb = new MeshBuilder();
    const build = new MeshBuilder();
    const props = new MeshBuilder();
    const green = new MeshBuilder();

    const gnd = (b, x0, y0, x1, y1, h, color, uv) =>
      b.ground(Math.min(x0, x1), -Math.max(y0, y1), Math.max(x0, x1), -Math.min(y0, y1), h, color, uv || 1);
    const bx = (b, x, y, h, sx, sy, sh, color, psi = 0, uv = 0) =>
      b.box(x, h + sh / 2, -y, sx, sh, sy, color, mbRot(psi), uv);
    const strp = (b, x, y, len, wid, psi, color, h = Y_PAINT) => b.stripe(x, -y, len, wid, mbRot(psi), h, color);

    this._gnd = gnd;
    this._bx = bx;
    this._strp = strp;

    /* base terrain */
    gnd(green, this.min, this.min, this.max, this.max, Y_GROUND, 0xffffff, 9);

    /* carriageways */
    const A = 0xffffff;
    for (let j = 0; j < GRID; j++) {
      gnd(road, this.gx[0] - HW, this.gy[j] - HW, this.gx[GRID - 1] + HW, this.gy[j] + HW, Y_ROAD, A, 9);
    }
    for (let i = 0; i < GRID; i++) {
      gnd(road, this.gx[i] - HW, this.gy[0] - HW, this.gx[i] + HW, this.gy[GRID - 1] + HW, Y_ROAD, A, 9);
    }

    /* lane markings */
    const WHITE = 0xf2f2ee;
    const YELLOW = 0xe8c53a;
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID - 1; i++) {
        this._segmentPaint(paint, 'x', this.gx[i] + HW, this.gx[i + 1] - HW, this.gy[j], WHITE, YELLOW);
      }
    }
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID - 1; j++) {
        this._segmentPaint(paint, 'y', this.gy[j] + HW, this.gy[j + 1] - HW, this.gx[i], WHITE, YELLOW);
      }
    }
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) this._junctionPaint(paint, i, j, WHITE);
    }

    /* blocks */
    for (const cell of this.cells) this._buildCell(cell, { road, paint, kerb, build, props, green });

    /* street furniture along every road line */
    this._streetProps(props);

    /* materials + meshes */
    const asphalt = asphaltTexture();
    const conc = concreteTexture();
    const grass = grassTexture();
    const dirt = dirtTexture();
    const fac = facadeTexture();

    const mk = (b, mat, shadow) => {
      if (b.count === 0) return null;
      const m = new THREE.Mesh(b.geometry(), mat);
      m.receiveShadow = true;
      m.castShadow = !!shadow;
      this.group.add(m);
      return m;
    };

    mk(green, new THREE.MeshStandardMaterial({ map: grass, vertexColors: true, roughness: 1 }));
    mk(road, new THREE.MeshStandardMaterial({ map: asphalt, vertexColors: true, roughness: 0.94 }));
    const pm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 });
    pm.polygonOffset = true;
    pm.polygonOffsetFactor = -2;
    mk(paint, pm);
    mk(kerb, new THREE.MeshStandardMaterial({ map: conc, vertexColors: true, roughness: 0.95 }), true);
    mk(build, new THREE.MeshStandardMaterial({ map: fac, vertexColors: true, roughness: 0.85 }), true);
    mk(props, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.15 }), true);

    this._buildTrafficLights();
    this._buildCones();
    this._buildParkedCars();
  }

  _segmentPaint(b, axis, from, to, center, white, yellow) {
    const strp = this._strp;
    const len = to - from;
    if (len <= 2) return;
    const along = (t) => from + t;
    // Broken centre line, 3 m mark / 4.5 m gap.
    let s = 2;
    while (s < len - 2) {
      const l = Math.min(3, len - 2 - s);
      const mid = along(s + l / 2);
      if (axis === 'x') strp(b, mid, center, l, 0.14, 0, yellow);
      else strp(b, center, mid, l, 0.14, Math.PI / 2, yellow);
      s += 7.5;
    }
    // Solid edge lines.
    const edge = HW - 0.9;
    for (const sgn of [-1, 1]) {
      const mid = along(len / 2);
      if (axis === 'x') strp(b, mid, center + sgn * edge, len, 0.13, 0, white);
      else strp(b, center + sgn * edge, mid, len, 0.13, Math.PI / 2, white);
    }
  }

  _junctionPaint(b, i, j, white) {
    const strp = this._strp;
    const cx = this.gx[i];
    const cy = this.gy[j];
    const inner = HW - 0.2;
    // Stop bars + zebra on every approach that exists.
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (const [dx, dy] of dirs) {
      const gi = i + dx;
      const gj = j + dy;
      if (gi < 0 || gi >= GRID || gj < 0 || gj >= GRID) continue;
      // Stop line sits across the approaching (right-hand) lane.
      const bx = cx + dx * inner;
      const by = cy + dy * inner;
      const psi = dx !== 0 ? 0 : Math.PI / 2;
      // Lateral offset places it over the lane entering the junction.
      const ox = dx !== 0 ? 0 : -dy * LANE * 0.5;
      const oy = dy !== 0 ? 0 : dx * LANE * 0.5;
      strp(b, bx + ox * 0, by + oy * 0, 0.4, LANE - 0.2, psi + Math.PI / 2, white);
      // Zebra bands just outside the junction box.
      for (let k = 0; k < 5; k++) {
        const t = -LANE + k * (LANE / 2.2);
        const zx = cx + dx * (inner + 1.9) + (dx !== 0 ? 0 : t);
        const zy = cy + dy * (inner + 1.9) + (dy !== 0 ? 0 : t);
        strp(b, zx, zy, 2.2, 0.4, psi + Math.PI / 2, white);
      }
    }
  }

  _buildCell(cell, B) {
    const { i, j, type } = cell;
    const R = this.cellRect(i, j);
    const gnd = this._gnd;
    const bx = this._bx;
    const rng = this.rng;

    // Kerb ring + footway.
    const k = 0.16;
    bx(B.kerb, (R.x0 + R.x1) / 2, R.y0 + SIDEWALK / 2, 0, R.x1 - R.x0, SIDEWALK, Y_KERB, 0xffffff, 0, 3);
    bx(B.kerb, (R.x0 + R.x1) / 2, R.y1 - SIDEWALK / 2, 0, R.x1 - R.x0, SIDEWALK, Y_KERB, 0xffffff, 0, 3);
    bx(B.kerb, R.x0 + SIDEWALK / 2, (R.y0 + R.y1) / 2, 0, SIDEWALK, R.y1 - R.y0 - 2 * SIDEWALK, Y_KERB, 0xffffff, 0, 3);
    bx(B.kerb, R.x1 - SIDEWALK / 2, (R.y0 + R.y1) / 2, 0, SIDEWALK, R.y1 - R.y0 - 2 * SIDEWALK, Y_KERB, 0xffffff, 0, 3);

    const I = {
      x0: R.x0 + SIDEWALK,
      x1: R.x1 - SIDEWALK,
      y0: R.y0 + SIDEWALK,
      y1: R.y1 - SIDEWALK,
    };
    cell.inner = I;

    if (type === 'range') {
      this._buildRange(cell, I, B);
      return;
    }
    if (type === 'lot') {
      gnd(B.road, I.x0, I.y0, I.x1, I.y1, Y_ROAD + 0.002, 0xf0f0f0, 9);
      this.lots.push({ ...I });
      this._parkingRows(cell, I, B, 0.3);
      return;
    }
    if (type === 'park') {
      gnd(B.green, I.x0, I.y0, I.x1, I.y1, Y_GROUND + 0.01, 0xdff0d0, 6);
      const n = rng.int(6, 12);
      for (let t = 0; t < n; t++) {
        const x = rng.range(I.x0 + 2, I.x1 - 2);
        const y = rng.range(I.y0 + 2, I.y1 - 2);
        this._tree(B.props, x, y, rng.range(0.8, 1.35));
      }
      return;
    }
    if (type === 'empty') {
      gnd(B.green, I.x0, I.y0, I.x1, I.y1, Y_GROUND + 0.01, 0xe6d9c0, 6);
      return;
    }

    // Buildings.
    gnd(B.green, I.x0, I.y0, I.x1, I.y1, Y_GROUND + 0.01, 0xdcdcd2, 6);
    const cols = rng.int(2, 3);
    const rows = rng.int(2, 3);
    const cw = (I.x1 - I.x0) / cols;
    const chh = (I.y1 - I.y0) / rows;
    for (let a = 0; a < cols; a++) {
      for (let c = 0; c < rows; c++) {
        if (rng.chance(0.18)) continue;
        const m = rng.range(1.5, 4.0);
        const x0 = I.x0 + a * cw + m;
        const x1 = I.x0 + (a + 1) * cw - m;
        const y0 = I.y0 + c * chh + m;
        const y1 = I.y0 + (c + 1) * chh - m;
        const h = rng.range(6, 26);
        const tint = [0xb7b0a4, 0xa9b0b6, 0xc0b6a6, 0x9aa2a8, 0xc9c2b6][rng.int(0, 4)];
        bx(B.build, (x0 + x1) / 2, (y0 + y1) / 2, 0.1, x1 - x0, y1 - y0, h, tint, 0, 26);
        // parapet
        bx(B.build, (x0 + x1) / 2, (y0 + y1) / 2, h + 0.1, x1 - x0 + 0.3, y1 - y0 + 0.3, 0.5, 0x8d8a84, 0, 26);
        this.colliders.push({
          x: (x0 + x1) / 2,
          y: (y0 + y1) / 2,
          hx: (x1 - x0) / 2,
          hy: (y1 - y0) / 2,
          rot: 0,
          kind: 'building',
          h,
        });
      }
    }
  }

  // Rows of perpendicular bays filling a lot, with an aisle between each pair.
  _parkingRows(cell, I, B, occupancy) {
    const strp = this._strp;
    const BAY_W = 2.65;
    const BAY_D = 5.2;
    const AISLE = 6.6;
    const pitch = BAY_D * 2 + AISLE;
    const usableW = I.x1 - I.x0 - 2;
    const nBays = Math.max(2, Math.floor(usableW / BAY_W));
    const startX = (I.x0 + I.x1) / 2 - (nBays * BAY_W) / 2;
    let y = I.y0 + 1.5 + BAY_D;
    while (y + BAY_D < I.y1 - 1.5) {
      for (const side of [-1, 1]) {
        const cy = y + side * (BAY_D / 2);
        if (cy - BAY_D / 2 < I.y0 + 0.5 || cy + BAY_D / 2 > I.y1 - 0.5) continue;
        for (let n = 0; n <= nBays; n++) {
          const x = startX + n * BAY_W;
          strp(B.paint, x, cy, BAY_D, 0.12, Math.PI / 2, 0xf2f2ee, Y_PAINT + 0.002);
        }
        for (let n = 0; n < nBays; n++) {
          const x = startX + (n + 0.5) * BAY_W;
          this.bays.push({
            x,
            y: cy,
            psi: side > 0 ? Math.PI / 2 : -Math.PI / 2,
            hw: BAY_W / 2,
            hl: BAY_D / 2,
            kind: 'perp',
            cell: `${cell.i},${cell.j}`,
            occupied: false,
          });
        }
        strp(B.paint, (startX + startX + nBays * BAY_W) / 2, cy + (side * BAY_D) / 2, nBays * BAY_W, 0.12, 0, 0xf2f2ee, Y_PAINT + 0.002);
      }
      y += pitch;
    }
    // Fill a share of the bays with parked cars, capped so a big town does not
    // end up with hundreds of extra draw calls.
    const CAP = 64;
    for (const bay of this.bays) {
      if (bay.cell !== `${cell.i},${cell.j}`) continue;
      if (this.parkedCars.length < CAP && this.rng.chance(occupancy)) {
        bay.occupied = true;
        this.parkedCars.push({ x: bay.x, y: bay.y, psi: bay.psi + (this.rng.chance(0.5) ? Math.PI : 0) });
      }
    }
  }

  // The LTO-style range: bays, a parallel box between two cars, and a cone slalom.
  _buildRange(cell, I, B) {
    const gnd = this._gnd;
    const strp = this._strp;
    gnd(B.road, I.x0, I.y0, I.x1, I.y1, Y_ROAD + 0.002, 0xf4f4f4, 9);
    this.lots.push({ ...I });

    const cx = (I.x0 + I.x1) / 2;
    const cy = (I.y0 + I.y1) / 2;

    // --- perpendicular (back-in) bays along the top edge
    const BW = 2.65,
      BD = 5.2;
    const n = 8;
    const sx = cx - (n * BW) / 2;
    const by = I.y1 - 2 - BD / 2;
    for (let k = 0; k <= n; k++) strp(B.paint, sx + k * BW, by, BD, 0.12, Math.PI / 2, 0xf2f2ee, Y_PAINT + 0.002);
    strp(B.paint, cx, by + BD / 2, n * BW, 0.12, 0, 0xf2f2ee, Y_PAINT + 0.002);
    for (let k = 0; k < n; k++) {
      const bx0 = sx + (k + 0.5) * BW;
      const occupied = k !== 3 && k !== 4 && this.rng.chance(0.55);
      this.bays.push({
        x: bx0,
        y: by,
        psi: Math.PI / 2,
        hw: BW / 2,
        hl: BD / 2,
        kind: 'perp',
        cell: 'range',
        target: k === 3,
        occupied,
      });
      if (occupied) this.parkedCars.push({ x: bx0, y: by, psi: Math.PI / 2 });
    }

    // --- parallel parking box on the left edge, framed by two parked cars
    const px = I.x0 + 3.2;
    const py = cy - 6;
    const GAPL = 7.0;
    this.bays.push({
      x: px,
      y: py,
      psi: -Math.PI / 2,
      hw: 1.15,
      hl: GAPL / 2,
      kind: 'parallel',
      cell: 'range',
      target: true,
      occupied: false,
    });
    for (const s of [-1, 1]) this.parkedCars.push({ x: px, y: py + s * (GAPL / 2 + 2.4), psi: Math.PI / 2 });
    // Painted box for the parallel bay.
    strp(B.paint, px - 1.15, py, GAPL, 0.12, Math.PI / 2, 0xf0e14a, Y_PAINT + 0.002);
    strp(B.paint, px + 1.15, py, GAPL, 0.12, Math.PI / 2, 0xf0e14a, Y_PAINT + 0.002);
    strp(B.paint, px, py - GAPL / 2, 2.3, 0.12, 0, 0xf0e14a, Y_PAINT + 0.002);
    strp(B.paint, px, py + GAPL / 2, 2.3, 0.12, 0, 0xf0e14a, Y_PAINT + 0.002);

    // --- angle bays on the right edge
    const ax = I.x1 - 6.5;
    for (let k = 0; k < 5; k++) {
      const ay = cy - 10 + k * 3.4;
      const psi = Math.PI / 4;
      this.bays.push({ x: ax, y: ay, psi, hw: 1.35, hl: 2.7, kind: 'angle', cell: 'range', occupied: false });
      strp(B.paint, ax, ay, 5.4, 0.12, psi, 0xf2f2ee, Y_PAINT + 0.002);
    }

    // --- cone slalom down the middle
    for (let k = 0; k < 7; k++) {
      this.cones.push({ x: cx - 12 + k * 4.2, y: I.y0 + 6 + (k % 2 ? 1.6 : -1.6), knocked: false });
    }

    this.rangeCenter = { x: cx, y: cy };
    // Start on the correct (right-hand) lane of the road along the south edge
    // of the range, pointing east and clear of the junction.
    this.spawn = { x: this.gx[0] + 26, y: this.gy[0] - LANE / 2, psi: 0 };
  }

  _tree(b, x, y, s) {
    b.cylinder(x, 1.1 * s, -y, 0.16 * s, 2.2 * s, 8, 0x5a4630, 'y');
    b.cylinder(x, 2.9 * s, -y, 1.55 * s, 1.6 * s, 9, 0x3f6b33, 'y');
    b.cylinder(x, 3.9 * s, -y, 1.05 * s, 1.2 * s, 8, 0x477a38, 'y');
    this.colliders.push({ x, y, hx: 0.4 * s, hy: 0.4 * s, rot: 0, kind: 'tree', h: 4 });
  }

  _streetProps(b) {
    const bx = this._bx;
    // Lamp posts every other block, set back on the footway.
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID - 1; i++) {
        for (const t of [0.32, 0.72]) {
          const x = lerp(this.gx[i] + HW, this.gx[i + 1] - HW, t);
          const y = this.gy[j] + HW + 1.0;
          this._lamp(b, x, y, -Math.PI / 2);
        }
      }
    }
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID - 1; j++) {
        for (const t of [0.5]) {
          const y = lerp(this.gy[j] + HW, this.gy[j + 1] - HW, t);
          const x = this.gx[i] - HW - 1.0;
          this._lamp(b, x, y, 0);
        }
      }
    }
  }

  _lamp(b, x, y, psi) {
    b.cylinder(x, 3.0, -y, 0.09, 6.0, 8, 0x6e7378, 'y');
    const dx = Math.cos(psi) * 1.1;
    const dy = Math.sin(psi) * 1.1;
    b.box(x + dx / 2, 5.9, -(y + dy / 2), Math.abs(dx) + 0.12, 0.12, Math.abs(dy) + 0.12, 0x6e7378);
    b.box(x + dx, 5.78, -(y + dy), 0.5, 0.14, 0.28, 0x2f3338);
    this.colliders.push({ x, y, hx: 0.16, hy: 0.16, rot: 0, kind: 'pole', h: 6 });
  }

  /* -------------------------------------------------------- traffic lights */

  _buildTrafficLights() {
    if (!this.lights.length) return;
    const b = new MeshBuilder();
    const lampMats = [];
    const positions = [];
    for (const L of this.lights) {
      L.lampIndex = [];
      // One head per approach, mounted on the near-right corner.
      const app = [
        { ax: 'x', dir: 1, ox: -HW - 1.2, oy: -HW - 1.2, face: 0 },
        { ax: 'x', dir: -1, ox: HW + 1.2, oy: HW + 1.2, face: Math.PI },
        { ax: 'y', dir: 1, ox: HW + 1.2, oy: -HW - 1.2, face: Math.PI / 2 },
        { ax: 'y', dir: -1, ox: -HW - 1.2, oy: HW + 1.2, face: -Math.PI / 2 },
      ];
      for (const a of app) {
        const px = L.x + a.ox;
        const py = L.y + a.oy;
        b.cylinder(px, 2.4, -py, 0.08, 4.8, 8, 0x494e53, 'y');
        b.box(px, 4.35, -py, 0.34, 1.0, 0.3, 0x22262b, mbRot(a.face));
        this.colliders.push({ x: px, y: py, hx: 0.16, hy: 0.16, rot: 0, kind: 'pole', h: 5 });
        const idx = [];
        for (let k = 0; k < 3; k++) {
          const yy = 4.68 - k * 0.3;
          const fx = px + Math.cos(a.face) * 0.2;
          const fy = py + Math.sin(a.face) * 0.2;
          positions.push([fx, yy, -fy]);
          idx.push(positions.length - 1);
        }
        L.lampIndex.push({ axis: a.ax, idx });
      }
    }
    const poles = new THREE.Mesh(
      b.geometry(),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.3 })
    );
    poles.castShadow = true;
    this.group.add(poles);

    const sph = new THREE.SphereGeometry(0.11, 10, 8);
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.lampMesh = new THREE.InstancedMesh(sph, mat, positions.length);
    this.lampMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const m = new THREE.Matrix4();
    for (let i = 0; i < positions.length; i++) {
      m.makeTranslation(positions[i][0], positions[i][1], positions[i][2]);
      this.lampMesh.setMatrixAt(i, m);
      this.lampMesh.setColorAt(i, new THREE.Color(0x101010));
    }
    this.lampMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.lampMesh);
  }

  // Cycle: NS green 0-9, NS amber 9-11, EW green 11-20, EW amber 20-22.
  lightState(axis) {
    const t = this.lightTime % 22;
    if (axis === 'y') {
      // North-south road (runs along Y) goes first.
      if (t < 9) return 'green';
      if (t < 11) return 'amber';
      return 'red';
    }
    if (t < 11) return 'red';
    if (t < 20) return 'green';
    return 'amber';
  }

  hasLight(i, j) {
    return this.lights.some((l) => l.i === i && l.j === j);
  }

  update(dt) {
    this.lightTime += dt;
    if (!this.lampMesh) return;
    const cols = {
      red: [0xff2a20, 0x2a0806, 0x0a2a0a],
      amber: [0x2a0806, 0xffa316, 0x0a2a0a],
      green: [0x2a0806, 0x2a1c06, 0x22ff4a],
    };
    const c = new THREE.Color();
    for (const L of this.lights) {
      for (const head of L.lampIndex) {
        const st = this.lightState(head.axis);
        const set = cols[st];
        for (let k = 0; k < 3; k++) {
          c.setHex(set[k]);
          this.lampMesh.setColorAt(head.idx[k], c);
        }
      }
    }
    if (this.lampMesh.instanceColor) this.lampMesh.instanceColor.needsUpdate = true;
  }

  /* ------------------------------------------------------------ cones/cars */

  _buildCones() {
    if (!this.cones.length) return;
    const b = new MeshBuilder();
    b.box(0, 0.03, 0, 0.36, 0.06, 0.36, 0x1a1a1c);
    b.cylinder(0, 0.18, 0, 0.13, 0.24, 10, 0xff6a1a);
    b.cylinder(0, 0.4, 0, 0.075, 0.22, 10, 0xff6a1a);
    b.cylinder(0, 0.34, 0, 0.1, 0.07, 10, 0xf2f2ee);
    const geo = b.geometry();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
    for (const c of this.cones) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(c.x, 0, -c.y);
      m.castShadow = true;
      this.group.add(m);
      c.mesh = m;
      c.hx = 0.22;
      c.hy = 0.22;
    }
  }

  _buildParkedCars() {
    if (!this.parkedCars.length) return;
    const proto = new Map();
    for (const p of this.parkedCars) {
      const color = BODY_COLORS[this.rng.int(0, BODY_COLORS.length - 1)];
      if (!proto.has(color)) proto.set(color, buildCar({ detail: 'static', color }));
      const src = proto.get(color);
      const g = src.group.clone(true);
      g.position.set(p.x, 0, -p.y);
      g.rotation.y = p.psi;
      this.group.add(g);
      p.mesh = g;
      this.colliders.push({ x: p.x, y: p.y, hx: 2.21, hy: 0.865, rot: p.psi, kind: 'car', h: 1.5 });
    }
  }

  /* ---------------------------------------------------------------- queries */

  onRoad(x, y) {
    const lo = this.gx[0] - HW;
    const hi = this.gx[GRID - 1] + HW;
    if (x >= lo && x <= hi) {
      for (let j = 0; j < GRID; j++) if (Math.abs(y - this.gy[j]) <= HW) return true;
    }
    if (y >= lo && y <= hi) {
      for (let i = 0; i < GRID; i++) if (Math.abs(x - this.gx[i]) <= HW) return true;
    }
    return false;
  }

  inLot(x, y) {
    for (const l of this.lots) if (x >= l.x0 && x <= l.x1 && y >= l.y0 && y <= l.y1) return true;
    return false;
  }

  surfaceAt(x, y) {
    if (this.onRoad(x, y)) return 'road';
    if (this.inLot(x, y)) return 'lot';
    // Kerb ring around a block?
    const i = Math.floor((x - this.off + HW) / BLOCK);
    const j = Math.floor((y - this.off + HW) / BLOCK);
    if (i >= 0 && i < GRID - 1 && j >= 0 && j < GRID - 1) {
      const R = this.cellRect(i, j);
      if (x > R.x0 && x < R.x1 && y > R.y0 && y < R.y1) {
        const inside =
          x > R.x0 + SIDEWALK && x < R.x1 - SIDEWALK && y > R.y0 + SIDEWALK && y < R.y1 - SIDEWALK;
        if (!inside) return 'kerb';
        const cell = this.cells.find((c) => c.i === i && c.j === j);
        if (cell && cell.type === 'empty') return 'dirt';
        return 'grass';
      }
    }
    return 'grass';
  }

  gripFor(surface) {
    switch (surface) {
      case 'road':
      case 'lot':
        return 1.0;
      case 'kerb':
        return 0.9;
      case 'dirt':
        return 0.72;
      default:
        return 0.6;
    }
  }

  // Nearest lane centre + heading, used for the "wrong side of the road" check.
  laneInfo(x, y) {
    let best = null;
    for (let j = 0; j < GRID; j++) {
      const d = Math.abs(y - this.gy[j]);
      if (d <= HW && (!best || d < best.d)) best = { d, axis: 'x', center: this.gy[j], idx: j };
    }
    for (let i = 0; i < GRID; i++) {
      const d = Math.abs(x - this.gx[i]);
      if (d <= HW && (!best || d < best.d)) best = { d, axis: 'y', center: this.gx[i], idx: i };
    }
    return best;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
    });
    this.scene.remove(this.group);
  }
}

export function buildWorld(scene, seed, opts) {
  return new World(scene, seed, opts);
}
