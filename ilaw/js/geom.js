// Geometry. Segments, rays, and the visibility polygon that the whole game
// is built on — everything you can see, and every shadow you can stand in,
// comes out of the functions in this file.
//
// A segment is a flat array [x1, y1, x2, y2]. Flat arrays rather than objects
// because the ray caster walks every segment several hundred times a frame and
// the allocation-free version is measurably kinder to the GC.

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Shortest signed difference between two angles, in (-PI, PI]. */
export function angDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/** Frame-rate independent exponential approach. */
export function approach(current, target, rate, dt) {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

/** Same, but around a circle, so a beam never takes the long way round. */
export function approachAngle(current, target, rate, dt) {
  return current + angDiff(target, current) * (1 - Math.exp(-rate * dt));
}

/* --------------------------------------------------------- raycasting --- */

/**
 * Distance along a ray to a segment, or -1 for a miss.
 * Ray is origin (ox,oy) + t * (dx,dy) with (dx,dy) normalised; t >= 0.
 */
export function raySegment(ox, oy, dx, dy, px, py, qx, qy) {
  const sx = qx - px;
  const sy = qy - py;
  const denom = dx * sy - dy * sx;
  if (denom > -1e-9 && denom < 1e-9) return -1; // parallel
  const ex = px - ox;
  const ey = py - oy;
  const t = (ex * sy - ey * sx) / denom;
  const u = (ex * dy - ey * dx) / denom;
  if (t < 0 || u < 0 || u > 1) return -1;
  return t;
}

/** Nearest hit along a ray, capped at maxD. Returns the distance. */
export function castDistance(ox, oy, dx, dy, segments, maxD) {
  let best = maxD;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const t = raySegment(ox, oy, dx, dy, s[0], s[1], s[2], s[3]);
    if (t >= 0 && t < best) best = t;
  }
  return best;
}

/**
 * Is the straight line from the light to this point interrupted?
 *
 * This is the single most important predicate in the game. `false` means the
 * point is lit; `true` means it sits in something's umbra — which is both how
 * a creature hides and how a shadow becomes solid ground.
 */
export function isOccluded(ox, oy, px, py, segments) {
  const dx = px - ox;
  const dy = py - oy;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return false;
  const hit = castDistance(ox, oy, dx / d, dy / d, segments, d);
  return hit < d - 0.03;
}

/**
 * The lit polygon, in world space.
 *
 * Standard approach: aim a ray at every occluder corner that falls inside the
 * cone, plus a hair either side of it so the polygon wraps cleanly around
 * edges, then sort by angle and join the hits up. The cone edges are cast too
 * so the fan always closes.
 *
 * Angles are all expressed as `centre + delta` with delta in [-half, half],
 * which keeps them monotonic and means a plain numeric sort is correct — no
 * wrap-around special cases.
 */
export function visibilityPolygon(ox, oy, segments, centre, half, radius) {
  const deltas = [-half, half];
  // Rays stop exactly ON a wall, which leaves the wall itself outside the lit
  // polygon and therefore invisible. Nudging each hit a few centimetres past
  // the surface lights the face you are actually pointing at. This is a
  // rendering allowance only — isOccluded(), which decides what is solid
  // ground and what burns, stays exact.
  const SKIN = 0.22;
  const r2 = (radius + 1) * (radius + 1);

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    for (let k = 0; k < 2; k++) {
      const px = s[k * 2];
      const py = s[k * 2 + 1];
      const vx = px - ox;
      const vy = py - oy;
      if (vx * vx + vy * vy > r2) continue;
      const d = angDiff(Math.atan2(vy, vx), centre);
      if (d < -half || d > half) continue;
      deltas.push(d - 2e-4, d, d + 2e-4);
    }
  }

  deltas.sort((a, b) => a - b);

  // The fan has to close back through the light itself. Without this vertex a
  // partial cone is not a fan at all — it is the region between the two ends
  // of the arc, which turns every shadow into the only lit thing on screen.
  // A full 360 degree sweep closes on its own, so the apex is skipped there
  // to avoid a zero-area spike along the seam.
  const poly = half < Math.PI - 1e-6 ? [ox, oy] : [];
  let prev = NaN;
  for (let i = 0; i < deltas.length; i++) {
    const d = clamp(deltas[i], -half, half);
    if (d === prev) continue; // duplicate corners are common; skip the work
    prev = d;
    const a = centre + d;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const t = Math.min(castDistance(ox, oy, dx, dy, segments, radius) + SKIN, radius);
    poly.push(ox + dx * t, oy + dy * t);
  }
  return poly;
}

/* ------------------------------------------------------------ shapes --- */

/** Expand an axis-aligned rect into its four wall segments. */
export function rectSegments(x, y, w, h) {
  return [
    [x, y, x + w, y],
    [x + w, y, x + w, y + h],
    [x + w, y + h, x, y + h],
    [x, y + h, x, y],
  ];
}

/** A pillar is an N-gon: exact enough to look round, cheap enough to raycast. */
export function circleSegments(cx, cy, r, sides = 12) {
  const out = [];
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * TAU;
    const a1 = ((i + 1) / sides) * TAU;
    out.push([
      cx + Math.cos(a0) * r,
      cy + Math.sin(a0) * r,
      cx + Math.cos(a1) * r,
      cy + Math.sin(a1) * r,
    ]);
  }
  return out;
}

export function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

/**
 * Push a circle out of a segment if it overlaps. Returns [dx, dy] to apply.
 * Used for walker-versus-wall; the walker is small and slow enough that one
 * resolution pass per segment per frame is stable.
 */
export function circleSegmentPush(cx, cy, radius, s) {
  const ax = s[0];
  const ay = s[1];
  const bx = s[2] - ax;
  const by = s[3] - ay;
  const len2 = bx * bx + by * by;
  let t = len2 > 0 ? ((cx - ax) * bx + (cy - ay) * by) / len2 : 0;
  t = clamp(t, 0, 1);
  const nx = cx - (ax + bx * t);
  const ny = cy - (ay + by * t);
  const d = Math.hypot(nx, ny);
  if (d >= radius) return null;
  if (d < 1e-6) return [0, radius]; // dead centre: shove it somewhere
  const push = radius - d;
  return [(nx / d) * push, (ny / d) * push];
}
