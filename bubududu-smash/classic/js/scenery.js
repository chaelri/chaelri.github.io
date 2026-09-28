// The place the fight happens in.
//
// This used to be three sine waves and a row of white pills: a green band, a
// blue band, some clouds. Charlie's words for it were "parang standard clouds
// with grass like minecraft" — and he was right, it was wallpaper. What he
// asked for was "parang legit but not realism ofc" — a real PLACE, drawn, not
// a photograph. So: a forested valley in the late afternoon, seen from a long
// way up, with five ranges of depth between the arena and the horizon.
//
// ── Why it is baked ──────────────────────────────────────────────────────
// A treeline is the thing that sells distance, and a treeline is hundreds of
// paths. Building those every frame is not affordable inside a 16ms budget
// that already has two characters, a squad, shots and a crowd of orbs in it.
//
// So each range is drawn ONCE into its own offscreen canvas, 1600px wide, and
// blitted twice per frame with a parallax offset — eight drawImage calls for
// the entire backdrop, however many trees are in it. The cost of a range is
// paid at startup and on resize, and nowhere else.
//
// Tiling seamlessly is the one constraint that shapes the drawing code: every
// ridge profile is periodic over the canvas width, and anything with a body
// (a tree, a fern) that lands near an edge is drawn a SECOND time a full width
// away so the half that falls off one side arrives on the other.

const W = 1600;               // one tile of scenery, in px

/** Deterministic noise, so a range looks the same every time it is baked. */
function rnd(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A ridge line, periodic over W so the canvas tiles.
 *
 * Every term's frequency is a whole number of cycles across W — that is the
 * whole trick. Pick 0.8 and 1.9 as the multipliers (as the old hills did) and
 * the two ends of the canvas do not meet, so the backdrop visibly jumps every
 * time the camera travels one tile width.
 */
function ridgeAt(x, o) {
  const u = (x / W) * Math.PI * 2;
  return (
    Math.sin(u * o.a + o.pa) * o.amp +
    Math.sin(u * o.b + o.pb) * o.amp * 0.45 +
    Math.sin(u * o.c + o.pc) * o.amp * 0.22
  );
}

/** Fills the area under a ridge, from the ridge down to the canvas floor. */
function underRidge(x, o, base, h) {
  x.beginPath();
  x.moveTo(0, h);
  for (let px = 0; px <= W; px += 6) x.lineTo(px, base + ridgeAt(px, o));
  x.lineTo(W, h);
  x.closePath();
  x.fill();
}

/* ------------------------------------------------------------------ trees */

/**
 * One conifer, as a stack of shrinking triangles.
 *
 * Conifers are what a distant ridge is covered in, and a triangle is enough
 * for one at that size. Deciduous blobs at ridge distance read as broccoli.
 */
function conifer(x, cx, cy, hgt, wid, fill) {
  x.fillStyle = fill;
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const top = cy - hgt * (1 - t * 0.42);
    const bot = cy - hgt * (0.46 - t * 0.23);
    const hw = wid * (0.42 + t * 0.58) * 0.5;
    x.beginPath();
    x.moveTo(cx, top);
    x.lineTo(cx + hw, bot);
    x.lineTo(cx - hw, bot);
    x.closePath();
    x.fill();
  }
  x.fillRect(cx - wid * 0.06, cy - hgt * 0.24, wid * 0.12, hgt * 0.26);
}

/**
 * One broadleaf tree — a trunk that forks, and a canopy of overlapping lobes.
 *
 * The lobes are what makes this read as a tree rather than a lollipop: a
 * canopy is a silhouette with bites out of its edge, and you only get those
 * by overlapping circles of different sizes rather than drawing one big one.
 */
function broadleaf(x, cx, cy, hgt, rr, fill, lit) {
  const trunkH = hgt * 0.42;
  // trunk, tapering, with two limbs going up into the canopy
  x.fillStyle = "rgba(48,40,36,0.38)";
  x.beginPath();
  x.moveTo(cx - hgt * 0.045, cy);
  x.lineTo(cx + hgt * 0.045, cy);
  x.lineTo(cx + hgt * 0.02, cy - trunkH);
  x.lineTo(cx - hgt * 0.02, cy - trunkH);
  x.closePath();
  x.fill();
  x.lineWidth = Math.max(1, hgt * 0.028);
  x.strokeStyle = "rgba(48,40,36,0.34)";
  x.beginPath();
  x.moveTo(cx, cy - trunkH * 0.7);
  x.lineTo(cx - hgt * 0.13, cy - trunkH * 1.22);
  x.moveTo(cx, cy - trunkH * 0.8);
  x.lineTo(cx + hgt * 0.14, cy - trunkH * 1.3);
  x.stroke();

  const top = cy - hgt * 0.62;
  const rad = hgt * 0.3;
  const lobes = [];
  for (let i = 0; i < 9; i++) {
    const a = rr() * Math.PI * 2;
    const d = rr() * rad * 0.85;
    lobes.push({
      x: cx + Math.cos(a) * d * 1.25,
      y: top + Math.sin(a) * d * 0.62,
      r: rad * (0.48 + rr() * 0.46),
    });
  }
  x.fillStyle = fill;
  x.beginPath();
  for (const l of lobes) { x.moveTo(l.x + l.r, l.y); x.arc(l.x, l.y, l.r, 0, Math.PI * 2); }
  x.fill();

  // Sun on the upper-left of the canopy only. A whole-canopy highlight just
  // lightens the tree; a crescent on one side gives it a direction to be lit
  // FROM, which is the only reason the layer reads as three-dimensional.
  x.save();
  x.clip();
  x.fillStyle = lit;
  x.beginPath();
  for (const l of lobes) {
    x.moveTo(l.x - l.r * 0.2 + l.r * 0.7, l.y - l.r * 0.28);
    x.arc(l.x - l.r * 0.2, l.y - l.r * 0.28, l.r * 0.7, 0, Math.PI * 2);
  }
  x.fill();
  x.restore();
}

/**
 * Paint something three times: one tile left, in place, one tile right.
 *
 * This is the fix for the only visible bug this file has had. A ridge drawn
 * from a periodic function tiles perfectly, but a TREE is a body: one that
 * stands near x=0 has its left half clipped off by the canvas edge, and the
 * half that should reappear at x=W was never drawn. The result was a hard
 * vertical seam every tile width with trees sliced down the middle either
 * side of it — visible in a screenshot the moment the treeline existed.
 *
 * `fn` is handed the offset and must reseed its own randomness, so all three
 * passes lay down the same wood in three places and the canvas keeps the
 * thirds that land on it.
 */
function wrapped(fn) {
  fn(-W); fn(0); fn(W);
}

/* ----------------------------------------------------------------- ranges */

/**
 * Bake every range, at this canvas height.
 *
 * `H` is the screen height because each range is positioned within its own
 * full-height canvas — that way blitting is a straight (x, y) with no per-range
 * arithmetic at draw time, and a range can put haze BELOW its own ridge
 * without needing a second layer to do it in.
 */
export function bakeScenery(H) {
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    return [c, c.getContext("2d")];
  };

  /* ── 1. far mountains ───────────────────────────────────────────────
     Barely blue, barely there. These are 20km away and the air between
     here and them is doing most of the work. */
  const [farC, far] = mk();
  {
    const o = { a: 1, b: 3, c: 7, pa: 0.4, pb: 1.9, pc: 3.3, amp: H * 0.075 };
    const base = H * 0.60;
    far.fillStyle = "#a9c9e0";
    underRidge(far, o, base, H);
    /* Sun on the faces that are turned towards it.
     *
     * The first pass painted a flat band of one colour down every rising
     * slope, which put a pale TRAPEZOID on each mountain that stopped dead at
     * the summit — a panel stuck on the hill, not light falling across it.
     * Two things fix it: the band fades out downward, and its strength
     * follows how steep the slope is, so it arrives and leaves gradually
     * instead of switching on at the first pixel that happens to rise. */
    far.save();
    for (let px = 0; px <= W; px += 5) {
      const y = base + ridgeAt(px, o);
      const slope = (base + ridgeAt(px + 12, o) - y) / 12;
      const lit = Math.max(0, Math.min(1, -slope * 5));   // 0 flat, 1 steep-rising
      if (lit <= 0.02) continue;
      const band = H * 0.05;
      const gr = far.createLinearGradient(0, y, 0, y + band);
      gr.addColorStop(0, `rgba(226,240,250,${0.42 * lit})`);
      gr.addColorStop(1, "rgba(226,240,250,0)");
      far.fillStyle = gr;
      far.fillRect(px, y, 5.5, band);
    }
    far.restore();
  }

  /* ── 2. near mountains, forested along the top ─────────────────────── */
  const [midC, mid] = mk();
  {
    const o = { a: 1, b: 2, c: 5, pa: 2.2, pb: 0.7, pc: 4.6, amp: H * 0.062 };
    const base = H * 0.70;
    mid.fillStyle = "#86b2c6";
    underRidge(mid, o, base, H);
    // A fine sawtooth of conifers along the crest. This is what turns a blue
    // silhouette into a forested mountain, and it costs one pass.
    wrapped((ox) => {
      const r = rnd(4242);
      for (let px = 0; px <= W; px += 7) {
        const y = base + ridgeAt(px, o);
        const hgt = H * (0.016 + r() * 0.018);
        conifer(mid, px + ox, y + 1, hgt, hgt * 0.62, "#7aa6bb");
      }
    });
  }

  /* ── 3. the treeline ────────────────────────────────────────────────
     The range that does the work. Individual trees, big enough to be read
     as trees, standing on a bank with their feet lost in haze. */
  const [treeC, tree] = mk();
  {
    const o = { a: 1, b: 3, c: 6, pa: 5.1, pb: 2.4, pc: 0.9, amp: H * 0.035 };
    const base = H * 0.815;
    // the bank they stand on
    tree.fillStyle = "#5f8f6b";
    underRidge(tree, o, base + H * 0.055, H);

    // Back row, small and cool — the far side of the same wood.
    wrapped((ox) => {
      const r = rnd(9001);
      for (let i = 0; i < 46; i++) {
        const cx = (i / 46) * W + (r() - 0.5) * W * 0.02;
        const y = base + ridgeAt(cx, o) + H * 0.03;
        const hgt = H * (0.05 + r() * 0.03);
        if (r() > 0.55) conifer(tree, cx + ox, y, hgt, hgt * 0.5, "#578a68");
        else broadleaf(tree, cx + ox, y, hgt, rnd(500 + i * 17), "#5a9068", "#6ba077");
      }
    });

    // Front row: fewer, larger, warmer, and lit.
    wrapped((ox) => {
      const r = rnd(31337);
      for (let i = 0; i < 22; i++) {
        const cx = (i / 22) * W + (r() - 0.5) * W * 0.03;
        const y = base + ridgeAt(cx, o) + H * 0.06;
        const hgt = H * (0.085 + r() * 0.055);
        if (i % 5 === 0) conifer(tree, cx + ox, y, hgt * 1.15, hgt * 0.5, "#3f7350");
        else broadleaf(tree, cx + ox, y, hgt, rnd(1000 + i * 37), "#4a8258", "#67a06d");
      }
    });

    // Haze pooling in the wood. Distance is not just colour, it is the air
    // in front of the thing — without this the treeline is a sticker.
    const hz = tree.createLinearGradient(0, base - H * 0.05, 0, base + H * 0.1);
    hz.addColorStop(0, "rgba(206,229,243,0)");
    hz.addColorStop(1, "rgba(206,229,243,0.5)");
    tree.fillStyle = hz;
    tree.fillRect(0, base - H * 0.05, W, H * 0.16);
  }

  /* ── 4. the valley floor ────────────────────────────────────────────
     Closest range, darkest, and the only one whose top edge is soft: it is
     a canopy seen from above rather than a ridge seen side-on. */
  const [nearC, near] = mk();
  {
    const o = { a: 2, b: 5, c: 9, pa: 1.1, pb: 3.8, pc: 2.2, amp: H * 0.022 };
    const base = H * 0.945;
    near.fillStyle = "#2f5b45";
    underRidge(near, o, base, H);
    // Crowns poking up out of it, so the edge is foliage and not a hill.
    wrapped((ox) => {
      const r = rnd(777);
      for (let i = 0; i < 90; i++) {
        const cx = (i / 90) * W + (r() - 0.5) * W * 0.01;
        const y = base + ridgeAt(cx, o) + H * 0.004;
        const rad = H * (0.012 + r() * 0.016);
        near.fillStyle = r() > 0.5 ? "#356449" : "#2b5340";
        near.beginPath();
        near.ellipse(cx + ox, y, rad * 1.3, rad, 0, 0, Math.PI * 2);
        near.fill();
      }
    });
    // Mist in the bottom of the valley, catching the light.
    const hz = near.createLinearGradient(0, base - H * 0.02, 0, H);
    hz.addColorStop(0, "rgba(198,224,238,0.32)");
    hz.addColorStop(0.5, "rgba(198,224,238,0.07)");
    hz.addColorStop(1, "rgba(198,224,238,0)");
    near.fillStyle = hz;
    near.fillRect(0, base - H * 0.02, W, H);
  }

  return { H, w: W, far: farC, mid: midC, tree: treeC, near: nearC };
}

/**
 * Blit one range, tiled, at its own parallax rate.
 *
 * Two drawImage calls, because the offset is taken modulo the canvas width —
 * so at most one seam is ever on screen and the copy either side of it covers
 * it. A third call is only needed on a screen wider than 1600px at zoom, which
 * the loop below handles anyway.
 */
export function blitRange(ctx, img, r, depth, lift) {
  const off = ((r.cam.x * r.cam.zoom * depth) % W + W) % W;
  const y = -r.cam.y * r.cam.zoom * depth * 0.25 + lift;
  // W + 1 wide: at a fractional offset, two tiles drawn exactly W apart
  // round to leave a one-pixel line of sky between them.
  for (let x = -off; x < r.w; x += W) ctx.drawImage(img, x, y, W + 1, img.height);
}
