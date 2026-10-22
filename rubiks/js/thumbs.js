// SVG case diagrams drawn from a CubeState — never hand-drawn, so a diagram
// can't disagree with the algorithm under it.
import { eq } from './cube.js';
import { COLORS } from './player.js';

const GREY = '#4a4f5a';

function shown(t, mask) {
  const [hx, hy, hz] = t.home;
  const nz = [hx, hy, hz].filter((v) => v !== 0).length;
  if (mask === 'cross') return nz === 1 || (nz === 2 && hy === -1) || t.c === 'D';
  if (mask === 'f2l') return hy <= 0 || nz === 1;
  if (mask === 'oll') return hy <= 0 || t.c === 'U';
  return true;
}
const fill = (t, mask) => (shown(t, mask) ? COLORS[t.c] : GREY);

// Isometric view of U (or D), F and R.
export function isoSVG(state, mask, bottom = false) {
  const S = 0.866;
  const proj = ([X, Y, Z]) => [(X - Z) * S, -Y + (bottom ? -1 : 1) * 0.5 * (X + Z)];
  const vis = [[0, bottom ? -1 : 1, 0], [0, 0, 1], [1, 0, 0]];
  let polys = '';
  for (const t of state.stickers) {
    if (!vis.some((n) => eq(n, t.n))) continue;
    const ax = t.n.findIndex((v) => v !== 0);
    const [a, b] = [0, 1, 2].filter((i) => i !== ax);
    const c = t.p.map((v, i) => (i === ax ? 1.5 * t.n[i] : v));
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
      const q = [...c];
      q[a] += u * 0.43; q[b] += v * 0.43;
      return proj(q).map((n) => n.toFixed(3)).join(',');
    });
    polys += `<polygon points="${corners.join(' ')}" fill="${fill(t, mask)}" stroke="#0b0c10" stroke-width="0.06" stroke-linejoin="round"/>`;
  }
  const hull = [[1.5, 1.5, 1.5], [1.5, -1.5, 1.5], [1.5, -1.5, -1.5], [1.5, 1.5, -1.5], [-1.5, 1.5, -1.5], [-1.5, 1.5, 1.5], [-1.5, -1.5, 1.5]];
  const outline = (bottom
    ? [[1.5, -1.5, 1.5], [1.5, 1.5, 1.5], [1.5, 1.5, -1.5], [1.5, -1.5, -1.5], [-1.5, -1.5, -1.5], [-1.5, -1.5, 1.5], [-1.5, 1.5, 1.5]]
    : hull).map((p) => proj(p));
  // convex hull order for the silhouette
  const sil = bottom
    ? [outline[1], outline[2], outline[3], outline[4], outline[5], outline[6]]
    : [outline[3], outline[2], outline[1], outline[6], outline[5], outline[4]];
  return `<svg viewBox="-3 -3.2 6 6.4" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <polygon points="${sil.map((p) => p.join(',')).join(' ')}" fill="#0b0c10" stroke="#0b0c10" stroke-width="0.25" stroke-linejoin="round"/>${polys}</svg>`;
}

// Top-down last-layer diagram with the side stickers as thin strips, plus
// arrows for where each piece has to travel (PLL).
export function topSVG(state, mask, arrows = false) {
  const top = state.stickers.filter((t) => t.p[1] === 1);
  const cell = (x, z) => [x * 1.05, z * 1.05];
  let out = '';
  for (const t of top) {
    const [x, , z] = t.p;
    const [cx, cy] = cell(x, z);
    const col = fill(t, mask);
    if (t.n[1] === 1) {
      out += `<rect x="${cx - 0.48}" y="${cy - 0.48}" width="0.96" height="0.96" rx="0.14" fill="${col}"/>`;
    } else {
      const [nx, , nz] = t.n;
      const w = nx ? 0.3 : 0.86, h = nz ? 0.3 : 0.86;
      const ox = cx + nx * 0.82, oy = cy + nz * 0.82;
      out += `<rect x="${ox - w / 2}" y="${oy - h / 2}" width="${w}" height="${h}" rx="0.08" fill="${col}"/>`;
    }
  }
  let arr = '';
  if (arrows) {
    // a piece's home = sum of the directions of the centres matching its colours
    const center = (f) => state.stickers.find((t) => t.p.filter((v) => v).length === 1 && t.c === f);
    const dirOf = (c) => center(c).n;
    const seen = new Set(), trips = [];
    for (const t of top) {
      const key = t.p.join();
      if (seen.has(key) || t.p[0] === 0 && t.p[2] === 0) continue;
      seen.add(key);
      const piece = state.stickers.filter((s) => eq(s.p, t.p));
      const dest = piece.reduce((acc, s) => acc.map((v, i) => v + dirOf(s.c)[i]), [0, 0, 0]);
      if (!eq(dest, t.p)) trips.push([t.p, dest]);
    }
    for (const [from, to] of trips) {
      // a two-piece swap is one double-headed arrow, not two on top of each other
      const swap = trips.some(([f, d]) => eq(f, to) && eq(d, from));
      if (swap && from.join() > to.join()) continue;
      const [x1, y1] = cell(from[0], from[2]);
      const [x2, y2] = cell(to[0], to[2]);
      const len = Math.hypot(x2 - x1, y2 - y1);
      const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
      const s0 = swap ? 0.3 : 0.22;
      const sx = x1 + ux * s0, sy = y1 + uy * s0, ex = x2 - ux * 0.3, ey = y2 - uy * 0.3;
      arr += `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="#111" stroke-width="0.11" stroke-linecap="round" marker-end="url(#ah)"${swap ? ' marker-start="url(#ah)"' : ''}/>`;
    }
  }
  return `<svg viewBox="-2.1 -2.1 4.2 4.2" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs><marker id="ah" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#111"/></marker></defs>
    <rect x="-1.62" y="-1.62" width="3.24" height="3.24" rx="0.24" fill="#0b0c10"/>${out}${arr}</svg>`;
}
