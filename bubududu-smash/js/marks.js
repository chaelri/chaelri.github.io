// Every small symbol in the game, drawn rather than typed.
//
// They used to be characters — ▲ ➜ ★ » ❄ ⇄ ♥ ✊ — set in Nunito and stroked
// white. Seven of the eight are ordinary type and came out of whatever font
// the machine happened to fall back to, so the same power-up did not look the
// same on a Mac as on a Windows PC as on a phone. The eighth was worse: ✊ has
// an emoji presentation, and a colour emoji glyph ignores fillStyle and
// strokeStyle entirely. That is why One Punch alone had no white outline and
// no colour — it was not being drawn, it was being pasted.
//
// So none of them is type any more. Each is a path in a 100x100 box, which
// means the same pixels everywhere, at any size, and every one of them takes
// the outline and the colour the rest of the game uses.
//
// The same definitions serve the canvas (via Path2D) and the DOM (via inline
// <svg>), because a chip in the panel and the orb on the platform have to be
// the same symbol — keeping a copy in each is exactly how Suntok and Tatlo
// ended up rendering a `?` before.

const f = (n) => (Math.round(n * 100) / 100).toString();

/* All of these wind CLOCKWISE ON SCREEN, so overlapping pieces UNION under a
 * nonzero fill instead of cutting each other away. `rev` runs one backwards,
 * which is how a groove becomes a hole. */

/** A capsule from one point to another: the workhorse. */
function bar(x1, y1, x2, y2, w, rev) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (w / 2), ny = (dx / len) * (w / 2);
  const r = f(w / 2);
  const A = (x, y, s) => `A${r} ${r} 0 0 ${s} ${f(x)} ${f(y)}`;
  if (rev) {
    return `M${f(x2 + nx)} ${f(y2 + ny)}${A(x2 - nx, y2 - ny, 0)}` +
           `L${f(x1 - nx)} ${f(y1 - ny)}${A(x1 + nx, y1 + ny, 0)}Z`;
  }
  return `M${f(x1 + nx)} ${f(y1 + ny)}${A(x1 - nx, y1 - ny, 1)}` +
         `L${f(x2 - nx)} ${f(y2 - ny)}${A(x2 + nx, y2 + ny, 1)}Z`;
}

function circle(cx, cy, r, rev) {
  const s = rev ? 0 : 1;
  return `M${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 ${s} ${f(cx + r)} ${f(cy)}` +
         `A${f(r)} ${f(r)} 0 1 ${s} ${f(cx - r)} ${f(cy)}Z`;
}

/** Points given clockwise on screen — top edge read left to right. */
const poly = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${f(x)} ${f(y)}`).join("") + "Z";

const spin = (x, y, deg, cx = 50, cy = 50) => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const dx = x - cx, dy = y - cy;
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
};

/** A bar rotated about the middle of the box. */
function spoke(x1, y1, x2, y2, w, deg) {
  const [ax, ay] = spin(x1, y1, deg);
  const [bx, by] = spin(x2, y2, deg);
  return bar(ax, ay, bx, by, w);
}

/* ------------------------------------------------------------- the star --- */
const star = (() => {
  const pts = [];
  for (let i = 0; i < 5; i++) {
    const o = (-90 + i * 72) * (Math.PI / 180);
    const m = (-54 + i * 72) * (Math.PI / 180);
    pts.push([50 + Math.cos(o) * 45, 50 + Math.sin(o) * 45]);
    pts.push([50 + Math.cos(m) * 18.5, 50 + Math.sin(m) * 18.5]);
  }
  return poly(pts);
})();

/* --------------------------------------------------------- the snowflake --- */
const flake = (() => {
  let d = "";
  for (const deg of [0, 60, 120]) d += spoke(10, 50, 90, 50, 10, deg);
  // Barbs, two thirds of the way out on every arm — six arms, two each.
  for (let i = 0; i < 6; i++) {
    const deg = i * 60;
    for (const lean of [-42, 42]) {
      const [tx, ty] = [72 + Math.cos((lean * Math.PI) / 180) * 17,
                        50 + Math.sin((lean * Math.PI) / 180) * 17];
      d += spoke(72, 50, tx, ty, 8, deg);
    }
  }
  return d;
})();

/* -------------------------------------------------------------- the fist --- */
//
// Side on, punching right, because a fist drawn face on is four knuckles in a
// row and reads as a row of bumps at the size this is actually seen at. From
// the side it has a wrist, a mass and the curled fingers, and it points the
// way the punch goes.
const fist =
  bar(52, 50, 72, 50, 52) +      // the hand
  bar(18, 56, 46, 56, 32) +      // the wrist behind it
  circle(50, 32, 14) +           // the thumb, laid over the top
  bar(72, 43, 92, 43, 4.5, true) +   // and the curled fingers
  bar(70, 56, 93, 56, 4.5, true) +
  bar(70, 69, 91, 69, 4.5, true) +
  bar(40, 40, 40, 74, 4.5, true);    // where the hand meets the wrist

/* -------------------------------------------------------------- the rest --- */
export const MARKS = {
  // ▲ — Big.
  laki: poly([[50, 9], [95, 85], [5, 85]]),

  // ➜ — the gun, which is the same arrow the fire button wears.
  /* A pistol, side on.
   *
   * This was an ARROW — a rightward chevron, on the orb, on the chip, on the
   * ammo pips and on the fire button. Charlie: "yung arrow na gun instead na
   * arrow make it like real gun." An arrow says "that way"; nothing about it
   * says six shots.
   *
   * Four pieces that union into one silhouette: the slide, the grip raked
   * back under it, a trigger guard, and a front sight — the sight is two
   * pixels of nothing at this size and it is what stops the slide reading as
   * a plain rectangle. */
  baril: poly([[6, 26], [88, 26], [88, 44], [6, 44]]) +        // slide
         poly([[86, 30], [97, 33], [97, 41], [86, 44]]) +      // muzzle
         poly([[13, 44], [41, 44], [32, 92], [4, 92]]) +       // grip
         poly([[41, 44], [58, 44], [58, 53], [45, 57], [41, 52]]) + // guard
         poly([[74, 18], [81, 18], [81, 26], [74, 26]]),       // front sight

  bituin: star,

  // » — Speed.
  bilis:
    poly([[10, 13], [29, 13], [64, 50], [29, 87], [10, 87], [45, 50]]) +
    poly([[42, 13], [61, 13], [96, 50], [61, 87], [42, 87], [77, 50]]),

  yelo: flake,

  // ⇄ — two arrows passing each other, which is the effect acted out.
  baliktad:
    poly([[47, 20], [92, 20], [92, 40], [47, 40], [47, 54], [7, 30], [47, 6]]) +
    poly([[8, 60], [53, 60], [53, 46], [93, 70], [53, 94], [53, 80], [8, 80]]),

  // ♥ — Heal. The same shape the health bar and the lost-heart use.
  lunas:
    "M50 90C12 65 5 47 5 34C5 18 17 7 31 7C39 7 46 11 50 18" +
    "C54 11 61 7 69 7C83 7 95 18 95 34C95 47 88 65 50 90Z",

  suntok: fist,

  /* Excalibur — a blade, a crossguard, a grip and a pommel.
   *
   * Drawn point-up and leaning slightly, because a sword standing perfectly
   * vertical reads as a cross and a sword lying flat reads as the gun that
   * is two entries above it. The fuller — the groove down the middle — is
   * one reversed bar, which is how a solid path gets a hole in it. */
  espada:
    poly([[50, 2], [61, 22], [61, 62], [39, 62], [39, 22]]) +   // blade
    bar(50, 24, 50, 56, 5, true) +                              // the fuller
    poly([[20, 62], [80, 62], [80, 73], [20, 73]]) +            // crossguard
    poly([[44, 73], [56, 73], [56, 90], [44, 90]]) +            // grip
    circle(50, 93, 7),                                          // pommel

  /* Not a power-up: the coin count, the fairy, the squad, the grace window
   * and Dudu all wear a mark in the panel too, and they were all type. */

  // An open hand, fingers up — grab. What the power-up button does when you
  // are holding nothing to fire.
  grab:
    poly([[24, 50], [78, 50], [78, 80], [66, 94], [34, 94], [24, 80]]) +   // palm
    bar(31, 54, 31, 22, 12) + bar(45, 54, 45, 12, 12) +                   // fingers
    bar(59, 54, 59, 14, 12) + bar(72, 56, 72, 26, 11) +
    bar(28, 72, 10, 52, 12),                                              // thumb

  // The cut gem lying on the platforms — flat table, two shoulders, a point.
  gem: poly([[22, 20], [78, 20], [98, 45], [50, 94], [2, 45]]),

  // Fairy Yhon's heal.
  plus: bar(50, 14, 50, 86, 24) + bar(14, 50, 86, 50, 24),

  /* The Shield: a heater shield with a band across it.
   *
   * Not the four-point sparkle `safe` uses — that one is the grace after a
   * hit, which is a moment, and this is a thing you are holding. They appear
   * on the same card and must not be mistaken for each other. */
  kalasag: "M50 5C68 16 84 20 95 21C95 52 88 82 50 97C12 82 5 52 5 21C16 20 32 16 50 5Z"
         + bar(18, 44, 82, 44, 11, true),

  // The grace after a hit: a four-point sparkle.
  safe: "M50 3C57 29 71 43 97 50C71 57 57 71 50 97C43 71 29 57 3 50C29 43 43 29 50 3Z",

  // Three little Bubus.
  squad: circle(18, 50, 13) + circle(50, 50, 13) + circle(82, 50, 13),

  /* --- out of a mystery box ---------------------------------------------- */

  /* The box's own mark: a question mark, drawn rather than typed.
   *
   * A glyph would have been one character of text and it is exactly the trap
   * this file exists to avoid — a '?' set in the system font is a different
   * shape on Charlie's Mac and on Karla's Windows, and the box is the one
   * thing on the field whose whole job is to say "you do not know". */
  box: "M30 32C30 16 40 7 51 7C63 7 72 16 72 29C72 40 65 45 57 51" +
       "C51 55 49 59 49 68L49 72L38 72L38 66C38 54 42 48 50 42" +
       "C56 37 60 34 60 28C60 22 56 18 51 18C45 18 41 23 41 32Z" +
       circle(43, 88, 9),

  /* King Yhon Yhon's crown, for the chip and the toast. The same five points
   * the renderer draws over the winner's head, flattened into the 100-box. */
  korona: poly([[8, 76], [8, 28], [30, 50], [50, 16], [70, 50], [92, 28], [92, 76]]) +
          poly([[8, 80], [92, 80], [92, 92], [8, 92]]),

  /* The Big Heart: the same heart the bar uses, with a ring around it so it
   * is not mistaken for an ordinary Heal at a glance. Three hearts' worth
   * ought to look like more than one. */
  puso: "M50 92C22 72 12 58 12 42C12 28 22 18 34 18C41 18 47 22 50 28" +
        "C53 22 59 18 66 18C78 18 88 28 88 42C88 58 78 72 50 92Z",

  /* The Bazooka: a tube on the shoulder with the shell leaving it. A gun
   * drawn any smaller than this reads as the Baril, and confusing a
   * six-shooter with a one-shot kill is not a mistake worth allowing. */
  bazuka: poly([[6, 40], [64, 40], [64, 62], [6, 62]]) +
          poly([[64, 36], [82, 46], [82, 56], [64, 66]]) +
          poly([[18, 62], [34, 62], [28, 82], [12, 82]]) +
          bar(86, 51, 98, 51, 9),

  /* --- the three abilities, on the fire button --------------------------- */

  // Air Hop — a chevron with a second, smaller one under it: one more jump.
  hop: poly([[50, 4], [92, 44], [74, 44], [50, 24], [26, 44], [8, 44]]) +
       poly([[50, 52], [92, 92], [74, 92], [50, 72], [26, 92], [8, 92]]),

  // Dash — three speed lines behind an arrowhead.
  dash: poly([[46, 14], [96, 50], [46, 86], [46, 62], [66, 50], [46, 38]]) +
        bar(6, 26, 34, 26, 11) + bar(2, 50, 34, 50, 11) + bar(6, 74, 34, 74, 11),

  // Ground Pound — a heavy arrow down onto a floor.
  pound: poly([[34, 6], [66, 6], [66, 40], [88, 40], [50, 78], [12, 40], [34, 40]]) +
         bar(10, 92, 90, 92, 13),

  // Dudu himself — a head and two ears is the whole of him at this size.
  dudu: circle(23, 26, 15) + circle(77, 26, 15) + circle(50, 56, 32) +
        circle(50, 74, 15) + circle(39, 49, 5, true) + circle(61, 49, 5, true) +
        circle(50, 70, 4.5, true),
};

/* ------------------------------------------------------------- the canvas --- */

const paths = new Map();
export function markPath(id) {
  let p = paths.get(id);
  if (p === undefined) {
    const d = MARKS[id];
    p = d ? new Path2D(d) : null;
    paths.set(id, p);
  }
  return p;
}

/**
 * Draw one, centred, `size` across. Nonzero on purpose — the pieces are wound
 * to union, and the few holes are wound backwards.
 */
export function drawMark(ctx, id, cx, cy, size, style) {
  const p = markPath(id);
  if (!p) return false;
  const k = size / 100;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(k, k);
  if (style) ctx.fillStyle = style;
  ctx.fill(p);
  ctx.restore();
  return true;
}

/**
 * The same shape stamped all round itself, which is how it gets an outline
 * without stroking.
 *
 * Stroking would trace every piece separately and draw the seam where the
 * thumb crosses the hand. Stamping traces only the silhouette, which is the
 * one edge anybody is looking at.
 */
export function stampMark(ctx, id, cx, cy, size, colour, thick) {
  const p = markPath(id);
  if (!p) return false;
  const k = size / 100;
  const rim = thick / k;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(k, k);
  ctx.fillStyle = colour;
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    ctx.save();
    ctx.translate(Math.cos(a) * rim, Math.sin(a) * rim);
    ctx.fill(p);
    ctx.restore();
  }
  ctx.restore();
  return true;
}

export function drawMarkOutlined(ctx, id, cx, cy, size, fill, edge, thick) {
  if (!markPath(id)) return false;
  stampMark(ctx, id, cx, cy, size, edge, thick);
  drawMark(ctx, id, cx, cy, size, fill);
  return true;
}

/* ---------------------------------------------------------------- the DOM --- */

/** Inline, and filled with `currentColor`, so a chip's own colour drives it. */
export function markSVG(id, cls = "mk") {
  const d = MARKS[id];
  if (!d) return "";
  return `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true">` +
         `<path d="${d}" fill="currentColor"/></svg>`;
}
