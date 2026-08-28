// meshbuilder.js — tiny geometry accumulator so the whole world can be baked
// into a handful of draw calls without pulling in BufferGeometryUtils.

import * as THREE from 'three';

const _c = new THREE.Color();

function toLinear(hex) {
  _c.setHex(hex);
  return [_c.r, _c.g, _c.b];
}

export class MeshBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
  }

  get count() {
    return this.pos.length / 3;
  }

  vert(p, n, u, c) {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.uv.push(u[0], u[1]);
    this.col.push(c[0], c[1], c[2]);
    return this.count - 1;
  }

  tri(a, b, c) {
    this.idx.push(a, b, c);
  }

  // p0..p3 counter-clockwise when viewed from the front face.
  quad(p0, p1, p2, p3, color, uvs, normal) {
    const c = Array.isArray(color) ? color : toLinear(color);
    let n = normal;
    if (!n) {
      const ax = p1[0] - p0[0],
        ay = p1[1] - p0[1],
        az = p1[2] - p0[2];
      const bx = p3[0] - p0[0],
        by = p3[1] - p0[1],
        bz = p3[2] - p0[2];
      n = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      n = [n[0] / l, n[1] / l, n[2] / l];
    }
    const u = uvs || [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const i0 = this.vert(p0, n, u[0], c);
    const i1 = this.vert(p1, n, u[1], c);
    const i2 = this.vert(p2, n, u[2], c);
    const i3 = this.vert(p3, n, u[3], c);
    this.tri(i0, i1, i2);
    this.tri(i0, i2, i3);
  }

  // Horizontal quad on the XZ plane at height y (used for road surfaces).
  ground(x0, z0, x1, z1, y, color, uvScale = 1, uvOffset = [0, 0]) {
    const c = Array.isArray(color) ? color : toLinear(color);
    const n = [0, 1, 0];
    const u = (x, z) => [x / uvScale + uvOffset[0], z / uvScale + uvOffset[1]];
    const a = this.vert([x0, y, z0], n, u(x0, z0), c);
    const b = this.vert([x0, y, z1], n, u(x0, z1), c);
    const d = this.vert([x1, y, z1], n, u(x1, z1), c);
    const e = this.vert([x1, y, z0], n, u(x1, z0), c);
    this.tri(a, b, d);
    this.tri(a, d, e);
  }

  // Rotated flat strip on the ground (lane paint, parking bay lines).
  stripe(cx, cz, len, wid, rotY, y, color) {
    const c = Math.cos(rotY),
      s = Math.sin(rotY);
    const hx = len / 2,
      hz = wid / 2;
    const p = (a, b) => [cx + a * c - b * s, y, cz + a * s + b * c];
    this.quad(p(-hx, -hz), p(-hx, hz), p(hx, hz), p(hx, -hz), color, null, [0, 1, 0]);
  }

  box(cx, cy, cz, sx, sy, sz, color, rotY = 0, uvScale = 0) {
    const hx = sx / 2,
      hy = sy / 2,
      hz = sz / 2;
    const co = Math.cos(rotY),
      si = Math.sin(rotY);
    const P = (x, y, z) => [cx + x * co - z * si, cy + y, cz + x * si + z * co];
    const N = (x, y, z) => [x * co - z * si, y, x * si + z * co];
    const uq = (w, h) =>
      uvScale > 0
        ? [
            [0, 0],
            [w / uvScale, 0],
            [w / uvScale, h / uvScale],
            [0, h / uvScale],
          ]
        : null;
    // +X, -X
    this.quad(P(hx, -hy, hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), color, uq(sz, sy), N(1, 0, 0));
    this.quad(P(-hx, -hy, -hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz), color, uq(sz, sy), N(-1, 0, 0));
    // +Y, -Y
    this.quad(P(-hx, hy, hz), P(hx, hy, hz), P(hx, hy, -hz), P(-hx, hy, -hz), color, uq(sx, sz), N(0, 1, 0));
    this.quad(P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), color, uq(sx, sz), N(0, -1, 0));
    // +Z, -Z
    this.quad(P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz), color, uq(sx, sy), N(0, 0, 1));
    this.quad(P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz), color, uq(sx, sy), N(0, 0, -1));
  }

  // rings: array of arrays of [x,y,z]; every ring must hold the same count.
  // closed = false lofts an open shell (used for a car body with the cabin
  // aperture cut out of the top).
  loft(rings, color, capStart = true, capEnd = true, closed = true) {
    const c = Array.isArray(color) ? color : toLinear(color);
    const n = rings[0].length;
    const rows = [];
    for (let r = 0; r < rings.length; r++) {
      const row = [];
      for (let i = 0; i < n; i++) {
        // Smooth-ish normal: outward from the ring centroid.
        const ring = rings[r];
        let cx = 0,
          cy = 0,
          cz = 0;
        for (const p of ring) {
          cx += p[0];
          cy += p[1];
          cz += p[2];
        }
        cx /= n;
        cy /= n;
        cz /= n;
        const p = ring[i];
        let nx = p[0] - cx,
          ny = p[1] - cy,
          nz = p[2] - cz;
        const l = Math.hypot(nx, ny, nz) || 1;
        row.push(this.vert(p, [nx / l, ny / l, nz / l], [i / n, r / rings.length], c));
      }
      rows.push(row);
    }
    const last = closed ? n : n - 1;
    for (let r = 0; r < rings.length - 1; r++) {
      for (let i = 0; i < last; i++) {
        const j = (i + 1) % n;
        this.tri(rows[r][i], rows[r + 1][i], rows[r + 1][j]);
        this.tri(rows[r][i], rows[r + 1][j], rows[r][j]);
      }
    }
    if (capStart) this._cap(rings[0], c, true);
    if (capEnd) this._cap(rings[rings.length - 1], c, false);
  }

  _cap(ring, c, flip) {
    const n = ring.length;
    let cx = 0,
      cy = 0,
      cz = 0;
    for (const p of ring) {
      cx += p[0];
      cy += p[1];
      cz += p[2];
    }
    cx /= n;
    cy /= n;
    cz /= n;
    // Cap normal from the first triangle.
    const ax = ring[1][0] - ring[0][0],
      ay = ring[1][1] - ring[0][1],
      az = ring[1][2] - ring[0][2];
    const bx = cx - ring[0][0],
      by = cy - ring[0][1],
      bz = cz - ring[0][2];
    let nx = ay * bz - az * by,
      ny = az * bx - ax * bz,
      nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    if (flip) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const nrm = [nx, ny, nz];
    const ci = this.vert([cx, cy, cz], nrm, [0.5, 0.5], c);
    const ids = ring.map((p, i) => this.vert(p, nrm, [i / n, 0], c));
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (flip) this.tri(ci, ids[j], ids[i]);
      else this.tri(ci, ids[i], ids[j]);
    }
  }

  // Cylinder along the local Y axis, then rotated so its axis is `axis`.
  cylinder(cx, cy, cz, radius, height, seg, color, axis = 'y') {
    const rings = [];
    for (const h of [-height / 2, height / 2]) {
      const ring = [];
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const u = Math.cos(a) * radius;
        const v = Math.sin(a) * radius;
        if (axis === 'y') ring.push([cx + u, cy + h, cz + v]);
        else if (axis === 'x') ring.push([cx + h, cy + u, cz + v]);
        else ring.push([cx + u, cy + v, cz + h]);
      }
      rings.push(ring);
    }
    this.loft(rings, color, true, true);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// Squircle cross-section in the YZ plane at station x — the car body loft ring.
// exp 2 = ellipse, exp 8 = nearly rectangular. 3.2 reads like a car flank.
export function roundedRing(x, halfW, yBot, yTop, segs = 18, exp = 3.2) {
  const cy = (yBot + yTop) / 2;
  const hh = (yTop - yBot) / 2;
  const pts = [];
  for (let i = 0; i < segs; i++) {
    const t = (i / segs) * Math.PI * 2;
    const cs = Math.cos(t);
    const sn = Math.sin(t);
    const k = Math.pow(Math.pow(Math.abs(cs), exp) + Math.pow(Math.abs(sn), exp), -1 / exp);
    pts.push([x, cy + sn * hh * k, cs * halfW * k]);
  }
  return pts;
}

// Same squircle, but sampled as an open arc that stops short of the top centre
// on both flanks. openFrac is the half-width, as a fraction of halfW, at which
// the shell stops — i.e. where the belt line runs. Point 0 is the +Z (right)
// edge, the last point is the -Z (left) edge.
export function openRing(x, halfW, yBot, yTop, segs = 18, expTop = 5.5, openFrac = 0.92, expBot = 3.0) {
  const cy = (yBot + yTop) / 2;
  const hh = (yTop - yBot) / 2;
  // Flat-ish on top, rounded underneath — the shape of a real body side. Both
  // exponents give k = 1 at the waist, so the two halves join smoothly.
  const kOf = (c, s) => {
    const e = c >= 0 ? expTop : expBot;
    return Math.pow(Math.pow(Math.abs(c), e) + Math.pow(Math.abs(s), e), -1 / e);
  };
  // theta measured from the top, sweeping toward +Z first.
  let t0 = 0.001;
  for (let i = 1; i <= 360; i++) {
    const t = (i / 360) * (Math.PI / 2);
    const z = Math.sin(t) * kOf(Math.cos(t), Math.sin(t));
    t0 = t;
    if (z >= openFrac) break;
  }
  const pts = [];
  const span = Math.PI * 2 - 2 * t0;
  for (let i = 0; i < segs; i++) {
    const t = t0 + (i / (segs - 1)) * span;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const k = kOf(c, s);
    pts.push([x, cy + c * hh * k, s * halfW * k]);
  }
  return pts;
}
