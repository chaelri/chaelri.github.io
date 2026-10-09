// The island. Pure data + collision helpers, shared by the sim and the renderer.
// Frame: x right, z toward the camera (screen down), y up. The camera looks
// toward -z, so "up" on a phone stick is -z and the stick maps straight to x/z.

const K = 0.82;                 // the layout below is authored at 1/K scale
export const R = 36;            // walkable island radius
export const SHORE = 40;        // sand ends, water begins

// Solid boxes {x, z, w, d, h, kind} and circles {x, z, r, h, kind}.
// Laid out 4-fold symmetric so no spawn is better than another.
export const BOXES = [];
export const CIRCLES = [];
export const CHESTS = [];       // [x, z]
export const SPAWNS = [[0, -31], [31, 0], [0, 31], [-31, 0]];

function rot4(fn) {
  for (let q = 0; q < 4; q++) {
    const a = (q * Math.PI) / 2, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
    fn((x, z) => [x * c - z * s, x * s + z * c], q);
  }
}

// central ruin: four L-shaped walls around a courtyard with the best chest
rot4((T, q) => {
  const [x1, z1] = T(-6.5, -9);
  BOXES.push({ x: x1, z: z1, w: q % 2 ? 1 : 7, d: q % 2 ? 7 : 1, h: 2.4, kind: "wall" });
  const [x2, z2] = T(-9, -6.5);
  BOXES.push({ x: x2, z: z2, w: q % 2 ? 7 : 1, d: q % 2 ? 1 : 7, h: 2.4, kind: "wall" });
});
// crate clusters and rocks on the way in
rot4((T) => {
  for (const [x, z, w, d] of [[14, -14, 2, 2], [16.2, -14, 2, 2], [14, -11.8, 2, 2], [-4, -21, 3, 1.4], [22, -4, 1.4, 3]]) {
    const [a, b] = T(x, z);
    const swap = Math.abs(T(1, 0)[1]) > 0.5;
    BOXES.push({ x: a, z: b, w: swap ? d : w, d: swap ? w : d, h: 1.6, kind: "crate" });
  }
  for (const [x, z, r] of [[8, -26, 2.2], [-19, -19, 2.6], [27, -15, 1.8], [-30, -9, 2]]) {
    const [a, b] = T(x, z);
    CIRCLES.push({ x: a, z: b, r, h: 2.2, kind: "rock" });
  }
  for (const [x, z] of [[-12, -33], [12, -36], [34, -22], [-27, -27], [20, -26], [-36, -14], [3, -40]]) {
    const [a, b] = T(x, z);
    CIRCLES.push({ x: a, z: b, r: 0.55, h: 6, kind: "palm" });
  }
  for (const [x, z] of [[0, -16], [19, -19], [-22, -30]]) {
    CHESTS.push(T(x, z));
  }
});
CHESTS.push([0, 0]);    // the courtyard chest is always gold

// shrink the authored layout to the island's real size (heights stay)
for (const b of BOXES) { b.x *= K; b.z *= K; b.w *= K; b.d *= K; }
for (const c of CIRCLES) { c.x *= K; c.z *= K; if (c.kind === "rock") c.r *= K; }
for (const a of [...CHESTS, ...SPAWNS]) { a[0] *= K; a[1] *= K; }

const PR = 0.7;         // player radius

// Push a circle (x, z, r) out of every obstacle and back inside the island.
export function collide(p, r = PR) {
  for (const b of BOXES) {
    const cx = Math.max(b.x - b.w / 2, Math.min(p.x, b.x + b.w / 2));
    const cz = Math.max(b.z - b.d / 2, Math.min(p.z, b.z + b.d / 2));
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r;
      } else {
        // centre inside the box: shove out along the shallow axis
        const ox = b.w / 2 + r - Math.abs(p.x - b.x), oz = b.d / 2 + r - Math.abs(p.z - b.z);
        if (ox < oz) p.x += Math.sign(p.x - b.x || 1) * ox; else p.z += Math.sign(p.z - b.z || 1) * oz;
      }
    }
  }
  for (const c of CIRCLES) {
    const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
    if (d < m && d > 1e-6) { p.x = c.x + (dx / d) * m; p.z = c.z + (dz / d) * m; }
  }
  const d = Math.hypot(p.x, p.z);
  if (d > R - r) { p.x *= (R - r) / d; p.z *= (R - r) / d; }
}

// Does a point sit inside something solid? (bullets)
export function solidAt(x, z, pad = 0) {
  for (const b of BOXES) if (Math.abs(x - b.x) < b.w / 2 + pad && Math.abs(z - b.z) < b.d / 2 + pad) return true;
  for (const c of CIRCLES) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + pad) ** 2) return true;
  return false;
}

// Gentle dunes for the renderer; the sim treats the island as flat.
export function heightAt(x, z) {
  const d = Math.hypot(x, z);
  if (d > SHORE) return -0.8 - (d - SHORE) * 0.08;
  const beach = Math.max(0, Math.min(1, (d - R + 2) / 6));
  return 0.18 * Math.sin(x * 0.21) * Math.cos(z * 0.17) * (1 - beach) - beach * 0.6;
}
