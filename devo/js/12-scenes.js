// 12-scenes.js — hand-drawn 8-bit scene banners for the retelling.
//
// Each banner is a 128×40 pixel scene drawn with canvas calls (no AI, no
// image files), scaled up with `image-rendering: pixelated`. A chapter opts in
// by having an entry in _NR_SCENES keyed by `<BOOK-ID>-<chapter>` (the same
// _nrKeyBase the retelling uses). _nrRenderBeats drops a banner in front of the
// first beat that reaches its start verse, right under any section heading.
//
// Only 2 Samuel 22 has scenes so far — a test of whether the banners earn
// their space before anything generates them for other chapters.

const _SC_W = 128, _SC_H = 40;

function _scRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function _scKit(ctx, seed, t = 0) {
  const rnd = _scRng(seed);
  const k = {
    rnd,
    t,                        // seconds — scenes animate off this
    f: Math.floor(t * 8),     // 8-bit frame counter
    px(x, y, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); },
    rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); },
    // Banded sky with a dithered seam between bands — the 8-bit gradient.
    sky(cols, y0 = 0, y1 = _SC_H) {
      const span = (y1 - y0) / cols.length;
      cols.forEach((c, i) => k.rect(0, y0 + Math.round(i * span), _SC_W, Math.ceil(span) + 1, c));
      for (let i = 1; i < cols.length; i++) {
        const y = y0 + Math.round(i * span);
        for (let x = 0; x < _SC_W; x++) {
          if (x % 2 === 0) k.px(x, y, cols[i - 1]);
          if (x % 4 === 1) k.px(x, y + 1, cols[i - 1]);
        }
      }
    },
    // Stars that twinkle: each blinks out and flares on its own beat.
    stars(n, c, maxY) {
      for (let i = 0; i < n; i++) {
        const x = Math.round(rnd() * _SC_W), y = Math.round(rnd() * maxY);
        const ph = (k.f + i * 5) % 23;
        if (ph === 0) continue;
        k.px(x, y, ph < 3 ? "#ffffff" : c);
        if (ph === 1) { k.px(x - 1, y, c); k.px(x + 1, y, c); k.px(x, y - 1, c); k.px(x, y + 1, c); }
      }
    },
    // Music notes drifting up from (x, y) and fading out.
    notes(x0, y0, c) {
      for (let j = 0; j < 3; j++) {
        const p = (k.t * 0.45 + j / 3) % 1;
        if (p > 0.85) continue;
        const x = x0 + Math.round(Math.sin(p * 6 + j) * 3), y = y0 - Math.round(p * 16);
        k.sprite(["..cc", "..c.", "..c.", "cc.."], { c: p > 0.6 ? "#a08a40" : c }, x, y);
      }
    },
    pulse(speed = 1.5, amp = 1) { return Math.round(Math.sin(k.t * speed) * amp); },
    // Silhouette ridge: f(x) is the top edge, filled down to `bottom`.
    ridge(f, c, bottom = _SC_H, x0 = 0, x1 = _SC_W) {
      ctx.fillStyle = c;
      for (let x = x0; x < x1; x++) { const y = Math.round(f(x)); ctx.fillRect(x, y, 1, bottom - y); }
    },
    sprite(rows, pal, x, y, flip = false) {
      rows.forEach((r, j) => {
        for (let i = 0; i < r.length; i++) {
          const ch = r[flip ? r.length - 1 - i : i];
          if (ch !== "." && pal[ch]) k.px(x + i, y + j, pal[ch]);
        }
      });
    },
    disc(cx, cy, r, c) {
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++)
        if (x * x + y * y <= r * r + r * 0.8) k.px(cx + x, cy + y, c);
    },
    // Checker-dithered disc: a soft glow without alpha.
    glow(cx, cy, r, c) {
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++)
        if (x * x + y * y <= r * r && (x + y) % 2 === 0) k.px(cx + x, cy + y, c);
    },
    line(x0, y0, x1, y1, c) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        k.px(x0, y0, c);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    },
    cloud(cx, cy, w, c, shade) {
      for (let i = 0; i < w; i += 3) {
        const r = 2 + Math.round(Math.sin((i / w) * Math.PI) * 3);
        k.disc(cx - w / 2 + i, cy - r / 2, r, c);
      }
      if (shade) k.rect(cx - w / 2, cy + 1, w, 2, shade);
    },
    bolt(x, y0, y1, c, r = rnd) {
      let px = x;
      for (let y = y0; y < y1; y += 3) {
        const nx = px + Math.round((r() - 0.5) * 6);
        k.line(px, y, nx, y + 3, c);
        k.px(nx + 1, y + 3, c);
        px = nx;
      }
    },
  };
  return k;
}

// ── Sprites ─────────────────────────────────────────────────────────────────
// David: purple robe, gold crown, brown beard. Lowercase = palette key.
const _SC_PAL = {
  s: "#e0a96d", e: "#2a1a10", h: "#3b2414", b: "#5c3a1e",
  t: "#7b55b8", T: "#563a8a", w: "#f2c14e", c: "#f7d154", l: "#4a3020",
};
const _SC_DAVID = [ // 7×12, facing right
  "..c.c.c",
  "..ccccc",
  ".hhsses",
  ".hhssss",
  "..hbbb.",
  ".ttttt.",
  "tTttttss",
  ".twwwt.",
  ".tTttt.",
  ".ttttt.",
  "tTttttt",
  ".l...l.",
];
const _SC_PRAISE = [ // 9×12, front, arms raised
  "s.......s",
  "t.......t",
  "t..c.c..t",
  ".t.ccc.t.",
  ".t.ese.t.",
  "..tbbbt..",
  "..ttttt..",
  "..twwwt..",
  "..tTttt..",
  ".ttttTtt.",
  ".tTttttt.",
  "..l...l..",
];
const _SC_PRAISE_B = [".........", "s.......s", "t..c.c..t", "t..ccc..t", ".t.ese.t."].concat(_SC_PRAISE.slice(5));
const _SC_KNEEL = [ // 8×9, facing right
  "..c.c.c.",
  "..ccccc.",
  ".hhsses.",
  ".hhssss.",
  "..hbbb..",
  ".ttttss.",
  ".tTttt..",
  "tttttTt.",
  "llttttttl",
];
const _SC_LYRE = [
  "w...w",
  "ww.ww",
  "wcccw",
  "wcccw",
  ".www.",
];
const _SC_DEER = [ // 10×8, leaping right
  "......a.a.",
  ".......a..",
  ".......dde",
  "......dd..",
  ".ddddddd..",
  "dddDdddd..",
  "d.d....dd.",
  "d.......d.",
];
const _SC_DEER_PAL = { a: "#d8c7a0", d: "#b5763b", D: "#e3c08a", e: "#2a1a10" };
const _SC_FALLEN = [ // 11×3, enemy lying flat
  "mm.........",
  "msstrrrrrll",
  "mm..rrrr...",
];
const _SC_BOW = [ // 7×6, bowing foreigner facing left
  ".gg....",
  "gsso...",
  ".soooo.",
  "..ooooo",
  "..oooOo",
  "..o...o",
];

// ── Scenes for 2 Samuel 22 (David's song of deliverance) ────────────────────
function _scRock(k) { // v1-4: my rock, my fortress, my deliverer
  k.sky(["#2b1d4a", "#5b2a5e", "#a8435f", "#e0704a", "#f2a65a"], 0, 30);
  k.disc(96, 26, 7, "#ffd27a");
  k.glow(96, 26, 11 + k.pulse(1.5), "#ffd27a");
  k.stars(14, "#f4e3ff", 9);
  k.ridge((x) => 28 + Math.sin(x / 9) * 2 + Math.sin(x / 4) * 1, "#3a2244");
  // The crag, with a fortress on its shoulder.
  k.ridge((x) => (x < 22 || x > 76 ? 40 : 12 + Math.abs(x - 46) * 0.55 + Math.sin(x * 1.3) * 1.2), "#4a3a3a", 40, 22, 77);
  k.ridge((x) => (x < 22 || x > 76 ? 40 : 15 + Math.abs(x - 46) * 0.6 + Math.sin(x * 0.9)), "#2e2328", 40, 50, 77);
  for (let y = 18; y < 40; y += 3) k.line(30 + (y % 5), y, 34 + (y % 7), y + 1, "#5e4b48");
  k.rect(40, 5, 13, 12, "#6a5a52");
  for (let x = 40; x < 53; x += 3) k.rect(x, 3, 2, 2, "#6a5a52");
  k.rect(45, 9, 3, 5, "#1a1218");
  k.rect(46, 10, 1, 3, "#ffd27a");
  k.line(46, 3, 46, 0, "#3b2414");
  k.rect(47, 0, 4, 2, "#db2777");
  k.px(51, k.f % 4 < 2 ? 0 : 1, "#db2777");
  k.rect(39, 16, 15, 2, "#4a3a3a");
  // David on the rock beside it, arms raised; the lyre set down at his feet.
  k.sprite(Math.floor(k.t * 2) % 2 ? _SC_PRAISE_B : _SC_PRAISE, _SC_PAL, 54, 6);
  k.sprite(_SC_LYRE, _SC_PAL, 64, 17);
  k.notes(66, 15, "#f7d154");
  k.ridge((x) => 35 + Math.sin(x / 3), "#1c1420", 40, 0, 128);
}

function _scWaves(k) { // v5-7: waves of death, torrents; He heard from His temple
  k.sky(["#0b1020", "#121a33", "#1b2748", "#24345c"], 0, 26);
  k.cloud(30, 7, 40, "#1d2640", "#151c30");
  k.cloud(70, 5, 34, "#1f2944", "#151c30");
  // The temple in the heights, the one light in the storm.
  k.glow(108, 8, 11 + k.pulse(1.2), "#4a4020");
  k.rect(100, 6, 16, 2, "#f7d154");
  k.rect(102, 4, 12, 2, "#f2c14e");
  k.rect(105, 2, 6, 2, "#f2c14e");
  for (let x = 101; x < 116; x += 3) k.rect(x, 8, 1, 6, "#e0b84a");
  k.rect(99, 14, 18, 1, "#f7d154");
  for (let i = 0; i < 40; i++) {
    const x = (k.rnd() * 128 - k.t * 8 + 256) % 128, y = (k.rnd() * 24 + k.t * 30) % 26;
    k.line(x, y, x - 1, y + 2, "#3b4c78");
  }
  const sea = ["#1f3d6b", "#173057", "#102444", "#0a1a33"];
  sea.forEach((c, i) => k.ridge((x) => 20 + i * 5 + Math.sin(x / (6 + i) + i + k.t * (1.6 - i * 0.3)) * (4 - i * 0.6), c));
  for (let x = 0; x < 128; x++) {
    const y = Math.round(20 + Math.sin(x / 6 + k.t * 1.6) * 4);
    if (Math.cos(x / 6 + k.t * 1.6) > 0.55) { k.px(x, y, "#cfe3ff"); k.px(x + 1, y - 1, "#9cc0f0"); }
  }
  // David, only head and hands above the water, crying out.
  k.sprite((Math.floor(k.t * 3) % 2 ? _SC_PRAISE_B : _SC_PRAISE).slice(0, 7), _SC_PAL, 56, 13 + k.pulse(1.6, 1.2));
  k.ridge((x) => 21 + Math.sin(x / 2.4 + k.t * 3) * 1.2, "#1f3d6b", 23, 52, 70);
  // Now and then the storm flashes.
  if (k.f % 37 < 2) k.bolt(18 + (Math.floor(k.f / 37) * 41) % 80, 0, 18, "#dfe8ff", _scRng(k.f));
}

function _scStorm(k) { // v8-16: the earth shook; He rode on a cherub; lightning
  k.sky(["#07070d", "#110d18", "#1a1222", "#24131d"], 0, 40);
  // Smoke out of His nostrils, fire from His mouth: rolling black clouds.
  for (let i = 0; i < 10; i++) k.cloud(((8 + i * 16 + k.t * 3) % 160) - 16, 4 + (i % 2) * 2, 18, "#1c1a24", "#0f0d14");
  // The cherub's wings spread across the dark.
  const flap = Math.sin(k.t * 3) * 3;
  for (let side of [-1, 1]) {
    for (let f = 0; f < 6; f++) {
      const len = 26 - f * 3;
      k.line(64, 12 + f, 64 + side * len, 6 + f * 2.2 + flap * (1 - f / 6), f % 2 ? "#cdd6f6" : "#f2f4ff");
    }
  }
  k.disc(64, 13, 3, "#fffbe6");
  k.glow(64, 13, 8 + k.pulse(2), "#fff3b0");
  // Arrows of lightning scattering the enemy.
  // Mountains trembling: offset strata.
  const shake = k.f % 4 === 0 ? 1 : 0;
  k.ridge((x) => 28 + shake + Math.abs(((x * 7) % 40) - 20) * 0.35 + (x % 4 < 2 ? 1 : 0), "#2a1a22");
  k.ridge((x) => 33 + Math.sin(x / 5) * 1.5, "#3a1f1c");
  // Coals of fire kindled, and the sea bed laid bare.
  for (let i = 0; i < 26; i++) {
    const x = k.rnd() * 128, y = 32 + k.rnd() * 7;
    k.px(x, y, (i + k.f) % 3 ? "#ff7a2f" : "#ffd27a");
  }
  k.rect(52, 36, 24, 4, "#6b5236");
  k.ridge((x) => 35 - Math.max(0, 6 - Math.abs(x - 64) * 0.5), "#13284a", 40, 36, 52);
  k.ridge((x) => 35 - Math.max(0, 6 - Math.abs(x - 64) * 0.5), "#13284a", 40, 76, 92);
  // Arrows of lightning: a fresh pair every flash, white on the strike.
  const cyc = Math.floor(k.t * 1.4), ph = (k.t * 1.4) % 1, r2 = _scRng(cyc * 7 + 3);
  if (ph < 0.4) {
    const c = ph < 0.12 ? "#ffffff" : "#fff27a";
    k.bolt(8 + r2() * 40, 8, 32, c, r2);
    k.bolt(80 + r2() * 40, 9, 30, c, r2);
  }
}

function _scRescue(k) { // v17-20: drew me out of many waters, into a broad place
  k.sky(["#3a6fb0", "#5f93cc", "#8dbbe2", "#c5e2f2"], 0, 30);
  k.cloud(40, 6, 30, "#ffffff", "#dde9f5");
  k.cloud(((100 + k.t * 3) % 160) - 16, 9, 22, "#ffffff", "#dde9f5");
  // The beam from on high.
  for (let y = 6; y < 34; y++) {
    const half = 3 + Math.floor(y / 6);
    for (let x = -half; x <= half; x++) if ((x + y + Math.floor(k.t * 3)) % 2 === 0) k.px(40 + x, y, "#fff7c2");
  }
  // Left: the waters he came out of. Right: the broad place.
  k.ridge((x) => 30 + Math.sin(x / 4 + k.t * 2) * 1.5, "#2c5a8c", 40, 0, 56);
  k.ridge((x) => 33 + Math.sin(x / 3 + 1), "#1f466f", 40, 0, 56);
  k.ridge((x) => 27 - Math.sin((x - 56) / 30) * 2, "#6fae4a", 40, 52, 128);
  k.ridge((x) => 31 + Math.sin(x / 7), "#4f8a36", 40, 52, 128);
  for (let i = 0; i < 30; i++) {
    const x = 60 + k.rnd() * 66, y = 29 + k.rnd() * 10;
    k.px(x, y, ["#ffe066", "#ff8fb1", "#ffffff"][i % 3]);
  }
  k.rect(108, 22, 2, 7, "#5c3a1e");
  k.disc(109, 19, 4, "#3f7a2e");
  k.disc(111, 21, 3, "#4f8a36");
  k.sprite(Math.floor(k.t * 2) % 2 ? _SC_PRAISE_B : _SC_PRAISE, _SC_PAL, 36, 14 - Math.round((Math.sin(k.t * 1.2) + 1) * 1.5));
  // Water streaming off him as he is drawn up.
  for (let x = 37; x < 45; x += 2) k.px(x, 24 + Math.floor((x * 3 + k.t * 10) % 7), "#cfe3ff");
}

function _scScroll(k) { // v21-28: clean hands; His ordinances were before me
  k.sky(["#1b1430", "#2a1d3d", "#3a2647"], 0, 40);
  // A tent interior: stone floor, a lampstand, the open scroll.
  k.rect(0, 30, 128, 10, "#2a2030");
  for (let x = 0; x < 128; x += 8) k.rect(x, 30, 1, 10, "#221a28");
  k.glow(70, 16, 16, "#5a3f5a");
  k.glow(70, 16, 10 + k.pulse(1.5), "#8a5a5a");
  k.rect(62, 18, 2, 12, "#6b4a2b");
  k.rect(76, 18, 2, 12, "#6b4a2b");
  k.rect(58, 14, 24, 6, "#f3e6c4");
  k.rect(56, 13, 3, 8, "#c9a46a");
  k.rect(81, 13, 3, 8, "#c9a46a");
  for (let y = 15; y < 19; y++) for (let x = 61; x < 79; x += 2) if ((x + y) % 3) k.px(x, y, "#8a7a5a");
  // A basin — clean hands.
  k.rect(20, 26, 10, 4, "#a0886a");
  k.rect(21, 25, 8, 1, "#6fb0e0");
  k.px(21 + (k.f % 8), 25, "#cfe8ff");
  k.sprite(_SC_KNEEL, _SC_PAL, 40, 21 + (Math.floor(k.t * 0.8) % 2));
  // Dust motes drifting up through the lamplight.
  for (let i = 0; i < 8; i++) {
    const q = (k.t * 0.15 + i / 8) % 1;
    k.px(62 + ((i * 37) % 44) + Math.round(Math.sin(k.t + i) * 2), 30 - q * 26, q > 0.8 ? "#5a4a5a" : "#c9a87a");
  }
  // The lamp on its stand.
  k.rect(100, 14, 2, 16, "#c9a046");
  k.rect(96, 29, 10, 1, "#c9a046");
  k.rect(97, 12, 8, 2, "#c9a046");
  k.px(101 + (k.f % 5 === 0 ? 1 : 0), 10, "#ffd27a"); k.px(101, 11, "#ff9a3c");
  if (k.f % 3) k.px(101, 9, "#fff3b0");
  k.glow(101, 11, 4 + (k.f % 4 < 2 ? 0 : 1), "#f7d154");
}

function _scLamp(k) { // v29-30: You are my lamp; by my God I leap over a wall
  k.sky(["#05070f", "#0a0f1e", "#111a30"], 0, 40);
  k.stars(30, "#9fb4e0", 26);
  k.glow(28, 18, 14, "#3a3220");
  k.glow(28, 18, 9 + k.pulse(2.2), "#7a6a3a");
  // The lamp lighting the dark.
  k.rect(24, 22, 9, 3, "#c9a046");
  k.rect(31, 21, 3, 2, "#c9a046");
  k.px(32, 19, "#ffd27a"); k.px(32, 20, "#ff9a3c"); k.px(32 + (k.f % 3 === 0 ? 0 : 1), 18, "#fff3b0");
  k.rect(26, 25, 5, 2, "#8a6a2a");
  // The wall, and David clearing it mid-leap.
  k.rect(60, 18, 26, 22, "#5a4a42");
  for (let y = 18; y < 40; y += 3) {
    k.rect(60, y, 26, 1, "#3e322c");
    for (let x = 60 + ((y / 3) % 2) * 3; x < 86; x += 6) k.rect(x, y, 1, 3, "#3e322c");
  }
  for (let x = 60; x < 86; x += 4) k.rect(x, 16, 2, 2, "#5a4a42");
  // The leap, on a loop: run up, clear the wall, land on the far side.
  // 0–0.75 of the cycle is the jump; the rest he stands where he landed.
  const p = Math.min(((k.t * 0.3) % 1) / 0.75, 1);
  const at = (q) => [37 + q * 60, 26 - Math.sin(q * Math.PI) * 24];
  if (p < 1) for (let q = Math.max(0, p - 0.18); q < p; q += 0.03) { const [x, y] = at(q); k.px(x + 3, y + 12, "#ffe9a0"); }
  const [dx, dy] = at(p);
  k.sprite(_SC_DAVID, _SC_PAL, dx, dy);
  k.ridge(() => 38, "#1a1414");
}

function _scHeights(k) { // v31-37: feet like hinds' feet; my arms bend a bow of bronze
  k.sky(["#4a7ec0", "#7fa9d8", "#b6d3ea", "#f0dcb0"], 0, 30);
  k.cloud(((20 + k.t * 2) % 160) - 16, 6, 18, "#ffffff");
  k.ridge((x) => 18 + Math.abs(((x + 10) % 50) - 25) * 0.7, "#8a97b8");
  k.ridge((x) => 10 + Math.abs(x - 96) * 0.6 + Math.sin(x) * 0.8, "#6a5a6a", 40, 66, 128);
  k.rect(92, 10, 9, 2, "#f2f4ff");
  k.ridge((x) => 26 + Math.abs(x - 34) * 0.4 + Math.sin(x / 2), "#5a4a52", 40, 0, 70);
  k.ridge(() => 36, "#3a3038");
  // Hinds bounding along the high places.
  k.sprite(_SC_DEER, _SC_DEER_PAL, ((70 + k.t * 12) % 150) - 12, 6 - Math.round(Math.abs(Math.sin(k.t * 3)) * 4));
  k.sprite(_SC_DEER, _SC_DEER_PAL, ((40 + k.t * 12) % 150) - 12, 13 - Math.round(Math.abs(Math.sin(k.t * 3 + 1)) * 4));
  // David on the summit with the bronze bow drawn.
  k.sprite(_SC_DAVID, _SC_PAL, 28, 14);
  for (let y = 0; y < 11; y++) k.px(37 + Math.round(Math.sin((y / 10) * Math.PI) * 2), 15 + y, "#c58a3a");
  // Draw, loose, draw again.
  const ap = (k.t * 0.6) % 1;
  const pull = ap < 0.35 ? Math.round(ap * 6) : 0;
  k.line(37, 15, 35 - pull, 20, "#e8e0d0");
  k.line(35 - pull, 20, 37, 25, "#e8e0d0");
  const ax = ap < 0.35 ? 36 - pull : 36 + (ap - 0.35) * 160;
  if (ax < 130) { k.line(ax, 20, ax + 10, 20, "#c58a3a"); k.px(ax + 11, 20, "#e0e0e0"); }
}

function _scVictory(k) { // v38-46: enemies crushed like dust; foreigners submit
  k.sky(["#5a2a3a", "#8a3a3a", "#c4643a", "#e8a050"], 0, 28);
  k.disc(20, 22, 6, "#ffcf6a");
  k.glow(20, 22, 9 + k.pulse(1.4), "#ffcf6a");
  k.ridge((x) => 26 + Math.sin(x / 6) * 1.5, "#6a4030");
  k.ridge(() => 31, "#8a6a48");
  for (let i = 0; i < 40; i++) k.px((k.rnd() * 128 + k.t * 4) % 128, 31 + k.rnd() * 9, "#a58560");
  // The broken enemy, flat as the dust of the streets.
  const enemy = { m: "#7a7f8a", s: "#c48a5a", t: "#3a3a40", r: "#8a2020", l: "#2a2020" };
  k.sprite(_SC_FALLEN, enemy, 8, 34);
  k.sprite(_SC_FALLEN, enemy, 26, 36, true);
  k.line(14, 32, 22, 30, "#9a9aa0");
  // David standing, a broken spear at his feet; foreigners bowing before him.
  k.sprite(_SC_DAVID, _SC_PAL, 54, 20);
  k.rect(50, 30, 4, 1, "#6b4a2b");
  const nations = [
    { g: "#e8e0c8", s: "#9a6a3a", o: "#2a8a8a", O: "#1f6a6a" },
    { g: "#c83a3a", s: "#7a4a28", o: "#c8a040", O: "#9a7a28" },
    { g: "#3a3a8a", s: "#b07a48", o: "#6a8a3a", O: "#4a6a2a" },
  ];
  nations.forEach((p, i) => k.sprite(_SC_BOW, p, 72 + i * 14, 26 + (i % 2) + (Math.floor(k.t * 1.5 + i * 0.6) % 2)));
  k.rect(116, 18, 2, 14, "#5c3a1e");
  k.rect(118, 18, 6, 4, "#db2777");
  k.rect(124, 18 + (k.f % 4 < 2 ? 0 : 1), 1, 3, "#db2777");
}

function _scForever(k) { // v47-51: the LORD lives; lovingkindness to David's descendants forever
  k.sky(["#0b1030", "#1c2050", "#3a2a6a", "#7a3a7a", "#e07a6a"], 0, 32);
  // Stars without number — the line that does not end.
  k.stars(50, "#e8e8ff", 22);
  for (let i = 0; i < 12; i++) k.px(70 + i * 5, 4 + Math.round(Math.sin(i / 2) * 2), (k.f + i) % 6 ? "#fff3b0" : "#ffffff");
  const sp = (k.t * 0.22) % 1;
  if (sp < 0.18) { const sx = 10 + sp * 300; k.line(sx, 2 + sp * 40, sx - 5, sp * 40, "#ffffff"); }
  k.disc(100, 31, 8, "#ffcf6a");
  k.glow(100, 31, 13 + k.pulse(1.3), "#ffcf6a");
  k.ridge((x) => 30 + Math.sin(x / 8) * 2, "#2a1a3a");
  // The tower of deliverance.
  k.rect(14, 8, 10, 26, "#4a3a5a");
  for (let x = 14; x < 24; x += 3) k.rect(x, 6, 2, 2, "#4a3a5a");
  k.rect(18, 14, 2, 4, "#ffd27a");
  k.rect(18, 22, 2, 4, "#ffd27a");
  k.ridge(() => 34, "#1a1226");
  // David crowned, singing; the lyre in hand.
  k.sprite(Math.floor(k.t * 2) % 2 ? _SC_PRAISE_B : _SC_PRAISE, _SC_PAL, 56, 22);
  k.sprite(_SC_LYRE, _SC_PAL, 66, 28);
  k.notes(68, 26, "#f7d154");
  k.notes(50, 24, "#ffe9a0");
}

const _NR_SCENES = {
  "2SA-22": [
    { verse: 1, draw: _scRock, alt: "David on a rock fortress at sunset, arms raised in praise" },
    { verse: 5, draw: _scWaves, alt: "David in storm waves crying out, a temple shining in the heights" },
    { verse: 8, draw: _scStorm, alt: "Dark clouds, lightning and a cherub's wings over trembling mountains" },
    { verse: 17, draw: _scRescue, alt: "A beam of light lifting David from the water to a broad green field" },
    { verse: 21, draw: _scScroll, alt: "David kneeling before an open scroll by lamplight, a basin beside him" },
    { verse: 29, draw: _scLamp, alt: "A lamp lighting the dark as David leaps over a wall" },
    { verse: 31, draw: _scHeights, alt: "David drawing a bronze bow on the heights as deer bound past" },
    { verse: 38, draw: _scVictory, alt: "Fallen enemies in the dust as foreigners bow before David" },
    { verse: 47, draw: _scForever, alt: "David singing beside a tall tower under a sky full of stars" },
  ],
};

function _nrScenesFor(base) {
  return (_NR_SCENES[base] || []).map((s, i) => ({ ...s, i }));
}

// One ticker drives every banner on screen at ~9 fps (choppy on purpose — it
// is 8-bit). Banners on hidden pages have no offsetParent and are skipped; the
// loop stops itself once no banner is left in the DOM.
const _scReduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
let _scRaf = 0, _scLast = 0;
function _scDraw(cv, t) {
  const scene = (_NR_SCENES[cv.dataset.base] || [])[+cv.dataset.i];
  if (!scene) return;
  const ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, _SC_W, _SC_H);
  scene.draw(_scKit(ctx, 1000 + scene.verse, t));
}
function _scTick(now) {
  const cvs = document.querySelectorAll("canvas.nr-scene-cv");
  if (!cvs.length) { _scRaf = 0; return; }
  _scRaf = requestAnimationFrame(_scTick);
  const still = _scReduce?.matches;
  if (!still && now - _scLast < 110) return;
  _scLast = now;
  cvs.forEach((cv) => {
    if (!cv.offsetParent) return;
    if (still) { if (!cv.dataset.drawn) { _scDraw(cv, 0); cv.dataset.drawn = "1"; } return; }
    _scDraw(cv, now / 1000);
  });
}
function _scStart() { if (!_scRaf) _scRaf = requestAnimationFrame(_scTick); }

function _nrSceneHTML(base, scene) {
  _scStart();
  return `<div class="nr-pageable nr-scene"><canvas class="nr-scene-cv" width="${_SC_W}" height="${_SC_H}" data-base="${_nrEsc(base)}" data-i="${scene.i}" role="img" aria-label="${_nrEsc(scene.alt)}"></canvas></div>`;
}
