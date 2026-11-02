// 13-scenes-2sa.js — the scene kit and the 8-bit banners for 2 Samuel.
//
// The kit methods are mixed into every scene kit (`k`) by _scKit in
// 12-scenes.js, so a scene reads as a short script:
//   k.scene("dusk", "hills"); k.city(80, 30); k.fig("David", "weep", 50, 18);
// Figures take their colours from the chapter's cast (same as the speaker
// faces); any other name ("Philistine", "soldier 2") hashes to a stable look.
// Canvas is 128×40; the ground line sits around y 30–34.

const _SC_SKY = {
  day: ["#4a7ec0", "#6f9dd3", "#9cc3e6", "#cfe4f2"],
  noon: ["#6fa8e0", "#9ccbf0", "#d8eef8", "#fff6d8"],
  dawn: ["#2c3566", "#6b4a7a", "#c4707a", "#f2b07a"],
  dusk: ["#2b1d4a", "#5b2a5e", "#a8435f", "#e0704a", "#f2a65a"],
  night: ["#05070f", "#0a0f1e", "#111a30", "#18233d"],
  storm: ["#14161f", "#1d202b", "#282c3a", "#33384a"],
  famine: ["#9a5a2a", "#c07a3a", "#dca060", "#f0c888"],
};
const _SC_LAND = {
  day: ["#7aa0b8", "#6f9a4a", "#4f7a36"],
  noon: ["#9ab8c8", "#8aa85a", "#6a8a3e"],
  dawn: ["#4a3a5a", "#3a3048", "#2a2236"],
  dusk: ["#4a2a4a", "#3a2244", "#2a1832"],
  night: ["#1a2236", "#141c2c", "#0e1420"],
  storm: ["#2a2e38", "#22262e", "#181b22"],
  famine: ["#b08050", "#9a6a3a", "#7a5030"],
};
const _SC_SAND = ["#e0c08a", "#d0a86a", "#b88a50"];

// Figure sprites, facing right unless noted. C = crown points, c = head
// (crown band / hair / turban), L = long hair or veil (drawn only when set).
const _SCK = {
  stand: [
    "..C.C.C", "..ccccc", ".Lhsses", ".Lhssss", ".L.bbb.", ".ttttt.",
    "tTtttts", ".twwwt.", ".tTttt.", ".ttttt.", "tTttttt", ".l...l.",
  ],
  run: [
    "..C.C.C.", "..ccccc.", ".Lhsses.", ".Lhssss.", ".L.bbb..", ".ttttt..",
    "tTttttss", ".twwwt..", ".tTttt..", "tttttttt", "tt....tt", "l......l",
  ],
  kneel: [
    "..C.C.C.", "..ccccc.", ".Lhsses.", ".Lhssss.", ".L.bbb..", ".ttttss.",
    ".tTttt..", "tttttTt.", "llttttttl",
  ],
  front: [
    "...C.C...", "...ccc...", "..LeseL..", "..LsssL..", "...bbb...", "..ttttt..",
    ".ttttttt.", ".s.www.s.", "..ttttt..", "..tTttt..", ".ttttttt.", "..l...l..",
  ],
  praise: [
    "s.......s", "t..C.C..t", "t..ccc..t", ".tLeseLt.", "..tbbbt..", "..ttttt..",
    "..twwwt..", "..ttttt..", "..tTttt..", ".ttttTtt.", ".tTttttt.", "..l...l..",
  ],
  weep: [
    "...C.C...", "...ccc...", "..Lsssss.", "..tbbbt..", "..ttttt..", "..ttttt..",
    "..twwwt..", "..ttttt..", "..tTttt..", ".ttttttt.", ".tttTttt.", "..l...l..",
  ],
  dance: [
    "...C.C...", "...ccc...", "s.LeseL.s", "tt.bbb.tt", "..ttttt..", "..twwwt..",
    "..ttttt..", "..tTttt..", ".ttttttt.", "..l..ll..", "..l......",
  ],
  sit: [
    "..C.C.C.", "..ccccc.", ".Lhsses.", ".Lhssss.", ".L.bbb..", ".ttttt..",
    "tTtttts.", ".twwwttt", ".tttTttt", ".l.....l",
  ],
  lie: [".c.........", "csstttttTll", ".s..tttt..."],
  bow: [".cc....", "csst...", ".stttt.", "..ttttt", "..tttTt", "..t...t"],
  child: [".ccc.", ".ese.", ".sss.", "ttttt", ".ttt.", ".ttt.", ".l.l."],
  baby: [".ss.", "wsew", "wwww", ".ww."],
};
const _SC_ANIMAL = {
  sheep: { rows: [".www..", "wwwwwk", "wwwww.", ".k.k.."], pal: { w: "#f2efe6", k: "#3a3030" } },
  ox: { rows: ["........hh", ".bbbbbbbbe", "bbbbbbbbb.", "bbbbbbbb..", ".b.b..b.b."], pal: { b: "#8a5a32", h: "#e8dcc0", e: "#2a1a10" } },
  donkey: { rows: [".........a", "........ga", "........gg", ".ggggggggk", "gggggggg..", ".g.g..g.g.", ".g.g..g.g."], pal: { g: "#8a8a92", a: "#5a5a62", k: "#2a2a30" } },
  lion: { rows: ["......mmm", "......mym", "yyyyyyymm", "yyyyyyyy.", ".y.y..y.y"], pal: { y: "#d8a050", m: "#8a5020" } },
  horse: { rows: [".........m", "........hh", "........hh", "hhhhhhhhhk", "hhhhhhhh..", ".h.h..h.h.", ".h.h..h.h."], pal: { h: "#6a4028", m: "#2a1a10", k: "#1a1008" } },
};

const _scExtras = {
  // Sky + terrain. time: day noon dawn dusk night storm famine.
  // terrain: hills mountains valley desert field river forest city none.
  scene(time = "day", terrain = "hills", o = {}) {
    const k = this;
    const sky = _SC_SKY[time] || _SC_SKY.day;
    k.sky(sky, 0, 31);
    if (["night", "dusk", "dawn"].includes(time)) k.stars(time === "night" ? 40 : 12, "#e8e8ff", time === "night" ? 26 : 10);
    if (time === "night" && !o.noMoon) { k.disc(o.moonX ?? 108, 7, 4, "#f4f0d8"); k.disc((o.moonX ?? 108) + 2, 6, 3, sky[0]); }
    if (time === "day" || time === "noon") {
      const sx = o.sunX ?? 108;
      k.glow(sx, 8, 9 + k.pulse(1.3), "#fff6c8");
      k.disc(sx, 8, time === "noon" ? 5 : 4, "#fff1b0");
    }
    if (time === "dusk" || time === "dawn") {
      const sx = o.sunX ?? 100;
      k.glow(sx, 27, 12 + k.pulse(1.3), "#ffd27a");
      k.disc(sx, 27, 7, "#ffd27a");
    }
    if (time === "famine") { k.disc(o.sunX ?? 100, 8, 6, "#fff4c0"); k.glow(o.sunX ?? 100, 8, 14 + k.pulse(2), "#ffe8a0"); }
    if (["day", "dawn", "noon"].includes(time)) {
      k.cloud(((30 + k.t * 2) % 170) - 20, 6, 20, "#ffffff", "#dde9f5");
      k.cloud(((110 + k.t * 1.5) % 170) - 20, 10, 14, "#ffffff", "#dde9f5");
    }
    if (time === "storm") {
      for (let i = 0; i < 9; i++) k.cloud(((i * 17 + k.t * 4) % 170) - 20, 3 + (i % 3) * 2, 20, "#2a2e3a", "#1c1f28");
      k.rain();
      if (k.f % 41 < 2) k.bolt(20 + (Math.floor(k.f / 41) * 37) % 90, 4, 26, "#e8eeff", _scRng(k.f));
    }
    const L = (terrain === "desert" && (time === "day" || time === "noon")) ? _SC_SAND : (_SC_LAND[time] || _SC_LAND.day);
    const g = (o.ground ?? 32);
    switch (terrain) {
      case "mountains":
        k.ridge((x) => 10 + Math.abs(((x + 20) % 56) - 28) * 0.7 + Math.sin(x) * 0.6, L[0]);
        k.ridge((x) => g - 2 + Math.sin(x / 6) * 2, L[1]);
        break;
      case "valley":
        k.ridge((x) => 14 + Math.abs(x - 64) * 0.22 + Math.sin(x / 5), L[0]);
        k.ridge((x) => g + Math.sin(x / 7), L[1]);
        break;
      case "desert":
        k.ridge((x) => 24 + Math.sin(x / 14) * 3, L[0]);
        k.ridge((x) => g - 1 + Math.sin(x / 9 + 1) * 2, L[1]);
        break;
      case "field":
        k.ridge((x) => 25 + Math.sin(x / 11) * 2, L[0]);
        k.ridge(() => g - 3, L[1]);
        for (let x = 1; x < 128; x += 3) {
          const sway = Math.round(Math.sin(k.t * 2 + x / 5));
          k.line(x, g + 6, x + sway, g - 2, o.crop || "#c8b050");
          k.px(x + sway, g - 3, o.cropTop || "#e0c860");
        }
        break;
      case "river":
        k.ridge((x) => 24 + Math.sin(x / 9) * 2.5, L[0]);
        k.ridge((x) => g - 3 + Math.sin(x / 6), L[1]);
        k.rect(0, g, 128, 5, o.water || "#2c5a8c");
        for (let x = 0; x < 128; x += 6) k.px((x + k.t * 6) % 128, g + 1 + (x % 3), "#9cc0f0");
        k.rect(0, g + 5, 128, 8, L[2]);
        break;
      case "forest":
        k.ridge((x) => 22 + Math.sin(x / 8) * 2, L[0]);
        for (let i = 0; i < 9; i++) k.tree(6 + i * 15 + (i % 2) * 4, g - 2, "oak", L[2]);
        k.ridge((x) => g + Math.sin(x / 5), L[1]);
        break;
      case "city":
        k.ridge((x) => 24 + Math.sin(x / 9) * 2, L[0]);
        k.city(o.cityX ?? 64, 26, o.cityW ?? 60, 12, time === "night" || time === "dusk");
        k.ridge((x) => g + Math.sin(x / 7), L[1]);
        break;
      case "none":
        break;
      default: // hills
        k.ridge((x) => 24 + Math.sin(x / 9) * 2.5 + Math.sin(x / 4), L[0]);
        k.ridge((x) => g - 1 + Math.sin(x / 7) * 1.5, L[1]);
    }
    if (terrain !== "none" && terrain !== "river") k.ridge(() => g + 5, L[2]);
  },

  // Indoors: palace (cedar), tent (cloth), house (stone). Lamp-lit.
  room(kind = "palace") {
    const k = this;
    const wall = { palace: ["#4a3020", "#3a2418"], tent: ["#5a4030", "#4a3424"], house: ["#4a4450", "#3a3440"] }[kind] || ["#4a3020", "#3a2418"];
    k.rect(0, 0, 128, 40, wall[0]);
    if (kind === "palace") for (let x = 4; x < 128; x += 16) k.rect(x, 2, 10, 24, wall[1]);
    if (kind === "tent") for (let x = 0; x < 128; x += 8) k.rect(x, 0, 4, 30, wall[1]);
    if (kind === "house") for (let y = 3; y < 30; y += 5) for (let x = (y % 2) * 6; x < 128; x += 12) k.rect(x, y, 11, 4, wall[1]);
    k.rect(0, 30, 128, 10, "#2a1e18");
    for (let x = 0; x < 128; x += 10) k.rect(x, 30, 1, 10, "#22180f");
  },
  lamp(x, y) {
    const k = this;
    k.glow(x, y, 7 + (k.f % 4 < 2 ? 0 : 1), "#7a6030");
    k.rect(x - 2, y + 2, 5, 2, "#c9a046");
    k.px(x, y + 1, "#ff9a3c"); k.px(x + (k.f % 3 === 0 ? 1 : 0), y, "#ffd27a");
  },

  // People. pose: stand run kneel front praise weep dance sit lie bow child baby,
  // plus stand-based extras: sword spear staff horn trumpet.
  fig(name, pose, x, y, flip = false) {
    const k = this;
    const pal = (typeof _scPalFor === "function") ? _scPalFor(name) : _SC_PAL;
    const P = { ...pal };
    if (!P.C) delete P.C;
    if (!P.L) delete P.L;
    let rows = _SCK[pose] || _SCK.stand;
    if (pose === "run" && Math.floor(k.t * 6) % 2) rows = _SCK.stand;
    if (pose === "dance" && Math.floor(k.t * 2.5) % 2) flip = !flip;
    if (pose === "praise" && Math.floor(k.t * 2) % 2) rows = [".........", ...rows.slice(0, 1), ...rows.slice(2)];
    const extra = ["sword", "spear", "staff", "horn", "trumpet"].includes(pose);
    if (extra) rows = _SCK.stand;
    let yy = y;
    if (pose === "weep" && k.f % 6 < 3) yy += 0; // shoulders shake via tears below
    k.sprite(rows, P, x, yy, flip);
    const hx = flip ? x : x + 6, dir = flip ? -1 : 1;
    if (pose === "weep") { const d = (k.t * 8) % 6; k.px(x + 3, y + 3 + d, "#9cc8f0"); k.px(x + 5, y + 4 + ((d + 3) % 6), "#9cc8f0"); }
    if (pose === "sword") { const up = Math.floor(k.t * 2) % 2; k.line(hx + dir, y + 5, hx + dir, y - 2 + up, "#d8dce4"); k.px(hx + dir, y + 6, "#8a6a2a"); }
    if (pose === "spear") { k.line(hx + dir, y - 4, hx + dir, y + 12, "#8a6a3a"); k.px(hx + dir, y - 5, "#d8dce4"); k.px(hx + dir, y - 6, "#d8dce4"); }
    if (pose === "staff") { k.line(hx + dir, y - 1, hx + dir, y + 12, "#7a5a32"); k.px(hx + dir * 2, y - 1, "#7a5a32"); }
    if (pose === "horn") { k.px(hx + dir, y + 2, "#e8dcc0"); k.px(hx + dir * 2, y + 1, "#e8dcc0"); if (k.f % 8 < 4) k.px(hx + dir * 2, y + 3, "#e8d070"); }
    if (pose === "trumpet") { k.line(hx, y + 3, hx + dir * 4, y + 1, "#e8dcc0"); k.notes(hx + dir * 5, y, "#f7d154"); }
  },
  // A Philistine giant: the standing figure at double size, facing left.
  giant(name, x, y) {
    const k = this;
    const G = _SCK.stand.flatMap((r) => { const w = r.replace(/./g, (ch) => ch + ch); return [w, w]; });
    const P = { ...((typeof _scPalFor === "function") ? _scPalFor(name) : _SC_PAL) };
    if (!P.C) delete P.C; if (!P.L) delete P.L;
    k.sprite(G, P, x, y + (Math.floor(k.t * 1.5) % 2), true);
    k.line(x - 1, y + 2, x - 1, y + 24, "#8a6a3a"); k.rect(x - 2, y - 1, 3, 3, "#d8dce4");
  },
  animal(kind, x, y, flip = false, walk = false) {
    const k = this;
    const a = _SC_ANIMAL[kind];
    if (!a) return;
    const bob = walk && Math.floor(k.t * 4) % 2 ? -1 : 0;
    k.sprite(a.rows, a.pal, x, y + bob, flip);
  },
  birds(n, y0, c = "#1a1a22") {
    const k = this;
    for (let i = 0; i < n; i++) {
      const x = ((i * 23 + k.t * (6 + i)) % 150) - 10, y = y0 + Math.sin(k.t + i) * 3 + (i % 3) * 3;
      const up = Math.floor(k.t * 4 + i) % 2;
      k.px(x - 1, y - up, c); k.px(x, y, c); k.px(x + 1, y - up, c);
    }
  },
  rain(c = "#5a6a8a") {
    const k = this;
    for (let i = 0; i < 46; i++) {
      const x = (k.rnd() * 128 - k.t * 8 + 256) % 128, y = (k.rnd() * 34 + k.t * 30) % 36;
      k.line(x, y, x - 1, y + 2, c);
    }
  },

  // Places and props.
  city(x, base, w = 50, h = 12, lit = false) {
    const k = this;
    const x0 = x - w / 2, stone = "#7a6a58", dark = "#5a4c40";
    k.rect(x0, base - h, w, h + 6, stone);
    for (let i = x0; i < x0 + w; i += 4) k.rect(i, base - h - 2, 2, 2, stone);
    for (const tx of [x0 - 2, x0 + w / 2 - 4, x0 + w - 6]) {
      k.rect(tx, base - h - 6, 8, h + 6, dark);
      for (let i = 0; i < 8; i += 3) k.rect(tx + i, base - h - 8, 2, 2, dark);
      k.rect(tx + 3, base - h - 3, 2, 3, lit ? "#ffd27a" : "#2a2018");
    }
    k.rect(x - 3, base - 6, 6, 6, "#2a2018");
    for (let i = 0; i < w; i += 9) k.rect(x0 + 3 + i, base - h + 4, 1, 2, lit && (i + k.f) % 5 ? "#ffd27a" : "#3a2e24");
  },
  palace(x, base, w = 40, h = 18) {
    const k = this;
    k.rect(x, base - h, w, h, "#8a6a48");
    k.rect(x - 2, base - h - 3, w + 4, 3, "#6a4a30");
    for (let i = 3; i < w - 2; i += 6) k.rect(x + i, base - h + 2, 2, h - 2, "#a8865c");
    k.rect(x + w / 2 - 3, base - 8, 6, 8, "#3a2418");
  },
  tent(x, base, w = 18, h = 10, c = "#c8b08a") {
    const k = this;
    for (let i = 0; i < h; i++) k.rect(x + w / 2 - (i * w) / (2 * h), base - h + i, (i * w) / h + 1, 1, i % 3 ? c : "#a88a64");
    k.rect(x + w / 2 - 1, base - 5, 3, 5, "#3a2a1a");
  },
  ark(x, y) {
    const k = this;
    k.glow(x + 5, y + 2, 9 + k.pulse(1.5), "#7a6a2a");
    k.rect(x, y, 10, 5, "#e8b830");
    k.rect(x, y, 10, 1, "#fff0a0");
    k.px(x + 1, y - 1, "#f7d154"); k.px(x + 2, y - 2, "#f7d154"); k.px(x + 8, y - 1, "#f7d154"); k.px(x + 7, y - 2, "#f7d154");
    k.line(x - 3, y + 3, x + 12, y + 3, "#8a5a32");
  },
  cart(x, y) {
    const k = this;
    k.rect(x, y, 16, 2, "#8a5a32");
    for (const wx of [x + 3, x + 12]) { k.disc(wx, y + 4, 2, "#5a3a22"); k.px(wx, y + 4, "#a8865c"); }
  },
  altar(x, base) {
    const k = this;
    k.rect(x, base - 7, 12, 7, "#8a8070");
    for (let y = base - 7; y < base; y += 2) k.rect(x, y, 12, 1, "#6a6050");
    k.fire(x + 6, base - 7, 8);
    k.smoke(x + 6, base - 10);
  },
  fire(x, base, w = 6) {
    const k = this;
    for (let i = 0; i < w; i++) {
      const fx = x - w / 2 + i, hgt = 2 + ((i * 7 + k.f) % 4);
      k.line(fx, base, fx, base - hgt, i % 2 ? "#ff7a2f" : "#ffb03a");
      if ((i + k.f) % 3 === 0) k.px(fx, base - hgt - 1, "#ffe08a");
    }
  },
  smoke(x, y) {
    const k = this;
    for (let i = 0; i < 4; i++) {
      const p = (k.t * 0.5 + i / 4) % 1;
      k.disc(x + Math.sin(p * 6 + i) * 2, y - p * 18, 1 + Math.round(p * 2), p > 0.7 ? "#5a5a62" : "#8a8a92");
    }
  },
  throne(x, base) {
    const k = this;
    k.rect(x, base - 14, 3, 14, "#c9a046");
    k.rect(x, base - 6, 10, 2, "#c9a046");
    k.rect(x + 8, base - 6, 2, 6, "#a8862e");
    k.px(x + 1, base - 15, "#f7d154");
  },
  tree(x, base, kind = "oak", c = "#3f7a2e") {
    const k = this;
    if (kind === "palm") {
      k.line(x, base, x + 1, base - 12, "#7a5a32");
      for (const d of [-4, -2, 2, 4]) k.line(x + 1, base - 12, x + 1 + d, base - 10 + Math.abs(d) / 2 + (k.f % 8 < 4 ? 0 : 1), "#4a8a3a");
      return;
    }
    k.rect(x, base - 6, 2, 6, "#5c3a1e");
    k.disc(x + 1, base - 9, 4, c);
    k.disc(x + 3, base - 7, 3, c);
    k.px(x - 1 + (k.f % 10 < 5 ? 0 : 1), base - 11, "#5a9a40");
  },
  well(x, base) {
    const k = this;
    k.rect(x, base - 5, 10, 5, "#8a8070");
    k.rect(x + 1, base - 6, 8, 1, "#2a2a30");
    k.line(x, base - 5, x, base - 11, "#5c3a1e"); k.line(x + 9, base - 5, x + 9, base - 11, "#5c3a1e");
    k.line(x, base - 11, x + 9, base - 11, "#5c3a1e");
  },
  stones(x, base, n = 6) {
    const k = this;
    for (let i = 0; i < n; i++) k.disc(x + (i % 3) * 3 + Math.floor(i / 3), base - 1 - Math.floor(i / 3) * 2, 1, i % 2 ? "#8a8070" : "#6a6050");
  },
  flag(x, base, c = "#db2777") {
    const k = this;
    k.line(x, base, x, base - 12, "#5c3a1e");
    k.rect(x + 1, base - 12, 5, 3, c);
    k.px(x + 6, base - 12 + (k.f % 4 < 2 ? 0 : 1), c);
  },
  scroll(x, y) {
    const k = this;
    k.rect(x, y, 10, 4, "#f3e6c4");
    k.rect(x - 1, y - 1, 2, 6, "#c9a46a"); k.rect(x + 9, y - 1, 2, 6, "#c9a46a");
    for (let i = 1; i < 9; i += 2) k.px(x + i, y + 1 + (i % 2), "#8a7a5a");
  },
  crown(x, y) {
    const k = this;
    k.glow(x + 2, y + 1, 4 + k.pulse(2), "#8a6a20");
    k.rect(x, y + 1, 5, 2, "#f2c230");
    k.px(x, y, "#f2c230"); k.px(x + 2, y, "#f2c230"); k.px(x + 4, y, "#f2c230"); k.px(x + 2, y + 1, "#d42a4a");
  },
  window(x, y, who) {
    const k = this;
    k.rect(x - 1, y - 1, 10, 9, "#3a2418");
    k.rect(x, y, 8, 7, "#1a1218");
    if (who) k.sprite(_SCK.front.slice(0, 6), (typeof _scPalFor === "function") ? _scPalFor(who) : _SC_PAL, x, y + 1);
  },
  angel(x, y) {
    const k = this;
    const flap = Math.floor(k.t * 3) % 2;
    k.glow(x + 4, y + 6, 9 + k.pulse(2), "#6a6440");
    for (const s of [-1, 1]) for (let f = 0; f < 4; f++) k.line(x + 4, y + 4 + f, x + 4 + s * (9 - f * 2), y - 1 + f * 2 + flap, "#f4f6ff");
    k.sprite(_SCK.front, { c: "#f7e6a0", s: "#f2e0c0", e: "#3a3050", b: "#f2e0c0", t: "#f4f6ff", T: "#d8def0", w: "#f7d154", l: "#d8def0" }, x, y);
    k.line(x + 8, y + 7, x + 14, y - 2, "#fff8d0"); k.px(x + 15, y - 3, "#ffffff");
  },
};

// ── 2 Samuel ───────────────────────────────────────────────────────────────
// Scenes are keyed by the verse they open on. Hard moments (killings,
// Tamar, Bathsheba) are shown by their aftermath or setting, never the act.
const _NR_2SA = {
  1: [
    { verse: 1, alt: "A man with torn clothes runs into David's camp at Ziklag carrying Saul's crown", draw: (k) => {
      k.scene("noon", "desert"); k.tent(14, 31); k.tent(34, 31, 14, 8, "#b89a74");
      k.fig("David", "stand", 60, 19, true);
      const x = 112 - ((k.t * 10) % 40); k.fig("Amalekite", "run", x, 19, true); k.crown(x - 3, 21);
    } },
    { verse: 11, alt: "David and his men tear their clothes and mourn until evening", draw: (k) => {
      k.scene("dusk", "hills"); k.tent(98, 31);
      k.fig("David", "weep", 50, 19); k.fig("soldier", "weep", 30, 19); k.fig("soldier 2", "weep", 70, 19);
    } },
    { verse: 17, alt: "David sings a lament for Saul and Jonathan, a broken bow and shield on Mount Gilboa", draw: (k) => {
      k.scene("dusk", "mountains", { sunX: 104 });
      k.fig("David", "sit", 28, 21); k.sprite(_SC_LYRE, _SC_PAL, 37, 25); k.notes(40, 22, "#f7d154");
      k.line(70, 31, 78, 27, "#8a6a3a"); k.line(80, 31, 86, 29, "#8a6a3a"); k.disc(94, 29, 3, "#7a6a50"); k.px(94, 29, "#c9a046");
    } },
  ],
  2: [
    { verse: 1, alt: "The men of Judah anoint David king at Hebron", draw: (k) => {
      k.scene("day", "city", { cityX: 96, cityW: 44 });
      k.fig("David", "kneel", 40, 23); k.fig("elder of Judah", "horn", 50, 19, true);
      for (let i = 0; i < 3; i++) k.px(47, 22 + ((k.t * 6 + i * 2) % 5), "#f7d154");
      k.fig("man of Judah", "praise", 14, 20); k.fig("man of Judah 2", "praise", 70, 20);
    } },
    { verse: 12, alt: "Twelve men of Abner and twelve of Joab face each other at the pool of Gibeon", draw: (k) => {
      k.scene("day", "hills");
      k.rect(44, 31, 40, 4, "#2c5a8c"); for (let x = 46; x < 82; x += 5) k.px(x + (k.f % 4), 32, "#9cc0f0");
      for (let i = 0; i < 3; i++) { k.fig("Abner's man " + i, "sword", 6 + i * 11, 20); k.fig("Joab's man " + i, "sword", 92 + i * 11, 20, true); }
    } },
    { verse: 18, alt: "Asahel, swift as a gazelle, chases Abner across the field", draw: (k) => {
      k.scene("day", "field");
      const p = (k.t * 14) % 170 - 20; k.fig("Abner", "run", p + 22, 19); k.fig("Asahel", "run", p, 19);
      k.animal("sheep", 100, 28);
    } },
    { verse: 24, alt: "At sunset Abner calls down from a hilltop to stop the fighting", draw: (k) => {
      k.scene("dusk", "hills");
      k.ridge((x) => (x > 70 ? 18 + (x - 70) * 0.2 : 40), "#2a1832", 40, 70, 128);
      k.fig("Abner", "spear", 92, 6, true); k.flag(108, 19, "#8a8aa0");
      k.fig("Joab", "trumpet", 20, 19); k.fig("soldier", "stand", 34, 19);
    } },
  ],
  3: [
    { verse: 1, alt: "David's house grows stronger while Saul's grows weaker", draw: (k) => {
      k.scene("day", "hills"); k.palace(14, 31, 34, 16); k.flag(30, 15, "#db2777");
      k.tent(88, 31, 20, 10, "#7a7064"); k.flag(98, 21, "#5a5a62");
      k.fig("David", "stand", 52, 19);
    } },
    { verse: 16, alt: "Paltiel follows Michal, weeping, as far as Bahurim", draw: (k) => {
      k.scene("day", "hills");
      const p = (k.t * 6) % 140; k.fig("Michal", "stand", 96 - p * 0.3, 19, true); k.fig("Abner's man", "spear", 110 - p * 0.3, 19, true);
      k.fig("Paltiel", "weep", 30, 19); k.tree(10, 30);
    } },
    { verse: 20, alt: "David holds a feast for Abner at Hebron and they make peace", draw: (k) => {
      k.room("palace"); k.lamp(20, 10); k.lamp(108, 10);
      k.rect(36, 27, 56, 3, "#8a5a32"); k.disc(52, 26, 2, "#e0a96d"); k.disc(76, 26, 2, "#c8504a");
      k.fig("David", "sit", 26, 20); k.fig("Abner", "sit", 94, 20, true);
    } },
    { verse: 31, alt: "David weeps aloud at Abner's grave in Hebron", draw: (k) => {
      k.scene("dusk", "hills"); k.stones(60, 31, 9);
      k.fig("David", "weep", 44, 19); k.fig("mourner", "weep", 76, 19); k.fig("mourner 2", "weep", 88, 19);
    } },
  ],
  4: [
    { verse: 4, alt: "A nurse flees with five-year-old Mephibosheth, who falls and becomes lame", draw: (k) => {
      k.scene("day", "hills"); k.city(20, 30, 30, 10);
      const p = (k.t * 10) % 140; k.fig("nurse", "run", 40 + p * 0.5, 19); k.fig("Mephibosheth", "child", 50 + p * 0.5, 22);
    } },
    { verse: 5, alt: "In the heat of noon two men creep into Ish-bosheth's house while he rests", draw: (k) => {
      k.scene("noon", "city", { cityX: 70, cityW: 70 });
      k.fig("Rechab", "sword", 20, 20); k.fig("Baanah", "sword", 32, 20);
      k.rect(66, 24, 8, 6, "#1a1218");
    } },
    { verse: 9, alt: "David on his throne rebukes the men who killed Ish-bosheth", draw: (k) => {
      k.room("palace"); k.lamp(64, 8);
      k.throne(20, 31); k.fig("David", "sit", 22, 21);
      k.fig("Rechab", "bow", 70, 25, true); k.fig("Baanah", "bow", 84, 25, true);
    } },
  ],
  5: [
    { verse: 1, alt: "All the tribes of Israel come to Hebron and anoint David king over Israel", draw: (k) => {
      k.scene("day", "city", { cityX: 100, cityW: 40 });
      k.fig("David", "front", 40, 19);
      for (let i = 0; i < 5; i++) k.fig("tribe " + i, "bow", 54 + i * 9, 26 + (Math.floor(k.t * 1.5 + i * 0.5) % 2), true);
      k.fig("elder", "horn", 28, 19);
    } },
    { verse: 6, alt: "David's men take the stronghold of Zion through the water shaft", draw: (k) => {
      k.scene("night", "hills", { moonX: 20 });
      k.city(78, 24, 64, 14, true);
      k.rect(36, 28, 6, 12, "#0e1420"); k.rect(37, 28, 4, 12, "#1a2a40");
      const y = 38 - ((k.t * 4) % 14); k.fig("Joab", "stand", 35, y);
    } },
    { verse: 11, alt: "Hiram of Tyre sends cedar logs and builders for David's house", draw: (k) => {
      k.scene("day", "city", { cityX: 104, cityW: 36 });
      k.palace(40, 31, 30, 14); k.rect(40, 17, 12, 3, "#f3e6c4");
      for (let i = 0; i < 3; i++) k.rect(4 + i * 4, 26 - i * 2, 22, 2, "#8a5a32");
      k.fig("builder", "stand", 72, 19); k.fig("builder 2", "kneel", 84, 22);
    } },
    { verse: 17, alt: "The Philistines spread out in the Valley of Rephaim", draw: (k) => {
      k.scene("day", "valley");
      for (let i = 0; i < 5; i++) k.fig("Philistine " + i, "spear", 66 + i * 11, 20, true);
      k.fig("David", "sword", 18, 20);
    } },
    { verse: 22, alt: "The sound of marching in the tops of the balsam trees", draw: (k) => {
      k.scene("dawn", "valley");
      for (let i = 0; i < 8; i++) { const x = 10 + i * 15; k.tree(x + Math.round(Math.sin(k.t * 4 + i) * 1), 30, "oak", "#2e5a2a"); }
      k.fig("David", "kneel", 56, 23);
      for (let i = 0; i < 4; i++) k.px(((k.t * 30 + i * 32) % 128), 10 + i * 3, "#cfe8ff");
    } },
  ],
  6: [
    { verse: 3, alt: "The ark rides on a new cart pulled by oxen, with music all around", draw: (k) => {
      k.scene("day", "hills");
      const x = 20 + ((k.t * 4) % 30); k.animal("ox", x + 20, 23, false, true); k.cart(x, 27); k.ark(x + 3, 21);
      k.fig("musician", "trumpet", x - 14, 19); k.fig("David", "dance", x + 36, 19);
    } },
    { verse: 6, alt: "At the threshing floor the oxen stumble and Uzzah reaches out to the ark", draw: (k) => {
      k.scene("storm", "hills");
      k.rect(30, 30, 60, 3, "#a08a5a");
      k.animal("ox", 66, 22); k.cart(46, 26); k.ark(49, 20);
      k.fig("Uzzah", "stand", 34, 18);
    } },
    { verse: 12, alt: "David dances with all his might before the ark as it comes into Jerusalem", draw: (k) => {
      k.scene("day", "city", { cityX: 100, cityW: 44 });
      k.ark(36, 22); k.fig("priest", "stand", 28, 19); k.fig("priest 2", "stand", 46, 19, true);
      k.fig("David", "dance", 62, 19); k.fig("musician", "trumpet", 76, 19);
      k.altar(4, 31);
    } },
    { verse: 16, alt: "Michal watches from a window as David leaps and dances", draw: (k) => {
      k.scene("day", "city", { cityX: 40, cityW: 70 });
      k.rect(78, 4, 22, 27, "#7a6a58"); k.window(84, 8, "Michal");
      k.fig("David", "dance", 36, 19); k.notes(48, 18, "#f7d154");
    } },
  ],
  7: [
    { verse: 1, alt: "David in his house of cedar, while the ark of God dwells in a tent", draw: (k) => {
      k.scene("day", "city", { cityX: 104, cityW: 30 });
      k.palace(8, 31, 40, 18); k.fig("David", "stand", 52, 19);
      k.tent(70, 31, 22, 12, "#d8c8a8"); k.ark(76, 26);
      k.fig("Nathan", "staff", 96, 19, true);
    } },
    { verse: 4, alt: "That night the word of the Lord comes to Nathan under the stars", draw: (k) => {
      k.scene("night", "hills");
      k.fig("Nathan", "praise", 56, 18);
      k.glow(60, 4, 6 + k.pulse(2), "#fff4c2");
      for (let y = 0; y < 16; y += 2) k.px(60 + (y % 4 ? 1 : 0), y, "#fff8d0");
    } },
    { verse: 8, alt: "I took you from the pasture, from following the sheep", draw: (k) => {
      k.scene("day", "hills");
      k.fig("young David", "staff", 30, 19);
      for (let i = 0; i < 5; i++) k.animal("sheep", 48 + i * 13 + Math.round(Math.sin(k.t + i)), 27 + (i % 2), i % 2 === 0, true);
      k.crown(110, 6);
    } },
    { verse: 18, alt: "King David goes in and sits before the Lord to pray", draw: (k) => {
      k.room("tent"); k.lamp(108, 12);
      k.ark(70, 22); k.fig("David", "kneel", 38, 22);
      for (let i = 0; i < 3; i++) k.px(50 + i * 5, 14 - ((k.t * 4 + i * 3) % 10), "#f7d154");
    } },
  ],
  8: [
    { verse: 1, alt: "David defeats the Philistines and his armies win on every side", draw: (k) => {
      k.scene("dusk", "hills");
      k.fig("David", "sword", 30, 19); k.flag(18, 31, "#db2777"); k.fig("soldier", "spear", 44, 19);
      k.sprite(_SC_FALLEN, { m: "#7a7f8a", s: "#c48a5a", t: "#3a3a40", r: "#8a2020", l: "#2a2020" }, 76, 31);
      const x = 90 + ((k.t * 12) % 50); k.fig("Philistine", "run", x, 19);
    } },
    { verse: 9, alt: "King Toi sends his son with gifts of silver, gold and bronze", draw: (k) => {
      k.room("palace"); k.lamp(64, 8);
      k.throne(14, 31); k.fig("David", "sit", 16, 21);
      k.fig("Joram", "bow", 52, 25, true);
      for (let i = 0; i < 3; i++) { k.rect(70 + i * 12, 26, 8, 4, ["#d8dce4", "#f2c230", "#c88a4a"][i]); if ((k.f + i * 3) % 9 === 0) k.px(72 + i * 12, 25, "#ffffff"); }
    } },
    { verse: 15, alt: "David reigns over all Israel, doing justice and righteousness", draw: (k) => {
      k.room("palace"); k.lamp(30, 8); k.lamp(98, 8);
      k.throne(58, 31); k.fig("David", "sit", 60, 21);
      k.fig("Joab", "spear", 34, 19); k.fig("Jehoshaphat", "stand", 84, 19, true); k.scroll(96, 26);
    } },
  ],
  9: [
    { verse: 1, alt: "David asks Ziba whether anyone is left of Saul's house", draw: (k) => {
      k.room("palace"); k.lamp(64, 8);
      k.throne(22, 31); k.fig("David", "sit", 24, 21); k.fig("Ziba", "stand", 70, 19, true);
    } },
    { verse: 6, alt: "Mephibosheth, lame in both feet, falls on his face before the king", draw: (k) => {
      k.room("palace"); k.lamp(100, 8);
      k.fig("David", "front", 30, 19);
      k.fig("Mephibosheth", "bow", 60, 25, true); k.line(74, 20, 70, 31, "#7a5a32");
    } },
    { verse: 11, alt: "Mephibosheth eats at the king's table like one of the king's sons", draw: (k) => {
      k.room("palace"); k.lamp(20, 8); k.lamp(108, 8);
      k.rect(24, 27, 80, 3, "#8a5a32");
      for (let i = 0; i < 4; i++) k.disc(36 + i * 18, 26, 2, ["#e0a96d", "#c8504a", "#d8c070", "#8ab060"][i]);
      k.fig("David", "sit", 14, 20); k.fig("Mephibosheth", "sit", 52, 20); k.fig("son of David", "sit", 86, 20, true);
    } },
  ],
  10: [
    { verse: 4, alt: "Hanun shaves off half of each envoy's beard and cuts their garments short", draw: (k) => {
      k.scene("day", "city", { cityX: 100, cityW: 44 });
      for (let i = 0; i < 3; i++) { const x = 20 + i * 18 - ((k.t * 6) % 10); k.fig("envoy " + i, "weep", x, 19); k.px(x + 3, 23, "#e0a96d"); }
    } },
    { verse: 5, alt: "The ashamed envoys wait at Jericho until their beards grow back", draw: (k) => {
      k.scene("noon", "desert");
      for (let i = 0; i < 5; i++) k.tree(12 + i * 24, 31, "palm");
      k.fig("envoy", "sit", 40, 21); k.fig("envoy 2", "sit", 64, 21, true);
    } },
    { verse: 9, alt: "Joab faces battle in front and behind, Arameans and Ammonites", draw: (k) => {
      k.scene("day", "valley");
      for (let i = 0; i < 3; i++) k.fig("Aramean " + i, "spear", 4 + i * 10, 20);
      k.fig("Joab", "sword", 56, 19); k.fig("Abishai", "sword", 66, 19, true);
      for (let i = 0; i < 3; i++) k.fig("Ammonite " + i, "spear", 92 + i * 10, 20, true);
    } },
    { verse: 15, alt: "David crosses the Jordan and routs the Arameans and their chariots", draw: (k) => {
      k.scene("day", "river");
      k.fig("David", "sword", 30, 18); k.flag(20, 30, "#db2777");
      const x = 70 + ((k.t * 14) % 60); k.animal("horse", x, 22, false, true); k.cart(x - 14, 25);
    } },
  ],
  11: [
    { verse: 1, alt: "In the spring the army marches out to war, but David stays in Jerusalem", draw: (k) => {
      k.scene("day", "hills"); k.palace(4, 31, 34, 18); k.window(16, 16, "David");
      for (let i = 0; i < 5; i++) { const x = ((50 + i * 12 + k.t * 8) % 150); k.fig("soldier " + i, "spear", x, 19); }
    } },
    { verse: 2, alt: "David walks on his palace roof at evening and looks out over the city", draw: (k) => {
      k.scene("dusk", "none");
      k.city(96, 34, 60, 10, true);
      k.rect(0, 26, 50, 14, "#5a4436"); k.rect(0, 25, 50, 1, "#7a6050");
      k.fig("David", "stand", 30, 13);
    } },
    { verse: 9, alt: "Uriah sleeps at the palace door with the king's servants and does not go home", draw: (k) => {
      k.scene("night", "none"); k.palace(10, 34, 60, 22);
      k.rect(36, 26, 8, 8, "#1a1008");
      k.fig("Uriah", "lie", 46, 31); k.fig("servant", "lie", 76, 31, true);
      for (let i = 0; i < 3; i++) k.px(60 + i * 3, 26 - ((k.t * 3 + i) % 6), "#9fb4e0");
    } },
    { verse: 14, alt: "David writes a letter to Joab and sends it by Uriah's own hand", draw: (k) => {
      k.room("palace"); k.lamp(80, 14);
      k.rect(40, 24, 30, 3, "#8a5a32"); k.scroll(48, 20);
      k.fig("David", "sit", 26, 19); k.fig("Uriah", "stand", 92, 19, true);
    } },
    { verse: 16, alt: "Arrows fly from the wall of Rabbah where the fighting is fiercest", draw: (k) => {
      k.scene("day", "hills"); k.city(96, 30, 56, 16);
      for (let i = 0; i < 5; i++) { const p = (k.t * 1.2 + i / 5) % 1; k.line(80 - p * 60, 12 + p * 14, 76 - p * 60, 14 + p * 14, "#c8b08a"); }
      k.fig("Uriah", "sword", 30, 19); k.fig("soldier", "spear", 14, 19);
    } },
    { verse: 26, alt: "But the thing David had done was evil in the sight of the Lord", draw: (k) => {
      k.scene("storm", "city", { cityX: 64, cityW: 70 });
      k.palace(50, 30, 28, 12);
    } },
  ],
  12: [
    { verse: 1, alt: "Nathan's parable: the rich man's flocks and the poor man's one little lamb", draw: (k) => {
      k.scene("day", "hills");
      for (let i = 0; i < 6; i++) k.animal("sheep", 4 + (i % 3) * 13, 24 + Math.floor(i / 3) * 5, false, true);
      k.fig("rich man", "stand", 46, 19, true);
      k.fig("poor man", "kneel", 92, 22); k.animal("sheep", 102, 26, true);
    } },
    { verse: 7, alt: "Nathan says to David: You are the man!", draw: (k) => {
      k.room("palace"); k.lamp(64, 8);
      k.throne(80, 31); k.fig("David", "sit", 82, 21, true);
      k.fig("Nathan", "stand", 40, 19); k.line(47, 25, 52 + (k.f % 4 < 2 ? 0 : 1), 24, "#e0a96d");
    } },
    { verse: 16, alt: "David fasts and lies all night on the ground, pleading for the child", draw: (k) => {
      k.room("palace"); k.lamp(100, 12);
      k.fig("David", "bow", 50, 25);
      k.fig("elder", "stand", 82, 19, true);
    } },
    { verse: 24, alt: "Solomon is born, and the Lord loves him", draw: (k) => {
      k.room("house"); k.lamp(24, 10);
      k.fig("Bathsheba", "sit", 52, 20); k.fig("Solomon", "baby", 60, 24);
      k.glow(62, 25, 7 + k.pulse(2), "#5a4a3a");
      k.fig("David", "stand", 76, 19, true);
    } },
    { verse: 29, alt: "David takes Rabbah and the heavy gold crown is placed on his head", draw: (k) => {
      k.scene("day", "city", { cityX: 90, cityW: 56 });
      k.fig("David", "front", 34, 19); k.crown(35, 13);
      k.fig("soldier", "praise", 14, 20); k.fig("soldier 2", "praise", 52, 20);
    } },
  ],
  13: [
    { verse: 6, alt: "Tamar is sent to bake cakes for her brother Amnon", draw: (k) => {
      k.room("house"); k.lamp(110, 10);
      k.fig("Tamar", "kneel", 40, 22); k.rect(54, 26, 10, 4, "#8a8070"); k.fire(59, 26, 6);
      for (let i = 0; i < 3; i++) k.disc(66 + i * 5, 28, 1, "#e0b870");
    } },
    { verse: 19, alt: "Tamar puts ashes on her head and tears her robe, weeping", draw: (k) => {
      k.scene("dusk", "city", { cityX: 96, cityW: 50 });
      k.fig("Tamar", "weep", 40, 19);
      for (let i = 0; i < 4; i++) k.px(42 + i * 2, 16 + ((k.t * 5 + i * 2) % 5), "#8a8a92");
    } },
    { verse: 23, alt: "Absalom holds a sheep-shearing feast at Baal-hazor", draw: (k) => {
      k.scene("day", "hills"); k.tent(90, 31, 24, 12, "#d8c8a8");
      for (let i = 0; i < 4; i++) k.animal("sheep", 10 + i * 12, 27, i % 2 === 1, true);
      k.fig("Absalom", "stand", 66, 19);
    } },
    { verse: 29, alt: "The king's sons flee on their mules", draw: (k) => {
      k.scene("dusk", "hills");
      for (let i = 0; i < 3; i++) { const x = ((k.t * 16 + i * 40) % 170) - 20; k.animal("donkey", x, 23, false, true); k.fig("king's son " + i, "sit", x + 1, 13); }
    } },
    { verse: 37, alt: "Absalom flees by night to Talmai, king of Geshur", draw: (k) => {
      k.scene("night", "desert");
      const x = 20 + ((k.t * 6) % 90); k.fig("Absalom", "run", x, 19);
    } },
  ],
  14: [
    { verse: 4, alt: "The wise woman of Tekoa, dressed in mourning, bows before the king", draw: (k) => {
      k.room("palace"); k.lamp(64, 8);
      k.throne(20, 31); k.fig("David", "sit", 22, 21);
      k.fig("woman of Tekoa", "bow", 66, 25, true); k.fig("Joab", "stand", 100, 19, true);
    } },
    { verse: 25, alt: "No one in Israel was praised like Absalom for his beauty and his long hair", draw: (k) => {
      k.scene("day", "city", { cityX: 100, cityW: 40 });
      k.fig("Absalom", "front", 50, 18);
      for (let y = 20; y < 29; y++) { k.px(50 + (y % 2), y, "#3b2414"); k.px(57 - (y % 2), y, "#3b2414"); }
      k.fig("admirer", "praise", 24, 20); k.fig("admirer 2", "praise", 76, 20);
    } },
    { verse: 30, alt: "Absalom's servants set Joab's barley field on fire", draw: (k) => {
      k.scene("day", "field", { crop: "#c8a040", cropTop: "#e8c860" });
      for (let i = 0; i < 6; i++) k.fire(60 + i * 10, 31, 6);
      k.smoke(70, 20); k.smoke(100, 20);
      k.fig("Joab", "run", 10 + ((k.t * 8) % 30), 19);
    } },
    { verse: 33, alt: "Absalom bows before the king, and the king kisses him", draw: (k) => {
      k.room("palace"); k.lamp(100, 8);
      k.fig("David", "stand", 50, 19); k.fig("Absalom", "kneel", 60, 22, true);
      k.glow(60, 16, 5 + k.pulse(1.5), "#7a5a3a");
    } },
  ],
  15: [
    { verse: 1, alt: "Absalom rides a chariot with horses and fifty men running ahead", draw: (k) => {
      k.scene("day", "hills");
      const x = ((k.t * 14) % 180) - 30;
      k.animal("horse", x + 22, 22, false, true); k.cart(x + 4, 25); k.fig("Absalom", "stand", x + 8, 13);
      for (let i = 0; i < 3; i++) k.fig("runner " + i, "run", x + 36 + i * 10, 19);
    } },
    { verse: 2, alt: "Absalom stands by the city gate and steals the hearts of the people", draw: (k) => {
      k.scene("day", "none"); k.city(96, 34, 60, 18);
      k.fig("Absalom", "stand", 46, 21); k.fig("man of Israel", "stand", 58, 21, true); k.fig("man of Israel 2", "stand", 22, 21);
      k.ridge(() => 34, "#6a5a48");
    } },
    { verse: 13, alt: "David and his household flee Jerusalem on foot", draw: (k) => {
      k.scene("dawn", "city", { cityX: 104, cityW: 44 });
      for (let i = 0; i < 4; i++) { const x = 70 - i * 13 - ((k.t * 5) % 13); k.fig(i ? "servant " + i : "David", "run", x, 19, true); }
    } },
    { verse: 24, alt: "Zadok and the Levites carry the ark, and David sends it back to the city", draw: (k) => {
      k.scene("day", "city", { cityX: 104, cityW: 40 });
      k.ark(58, 20); k.fig("Zadok", "stand", 48, 19); k.fig("Levite", "stand", 70, 19);
      k.fig("David", "stand", 20, 19);
    } },
    { verse: 30, alt: "David climbs the Mount of Olives weeping, head covered and barefoot", draw: (k) => {
      k.scene("dusk", "none");
      k.ridge((x) => 36 - x * 0.18 + Math.sin(x / 5), "#3a2244");
      for (let i = 0; i < 6; i++) k.tree(10 + i * 20, 37 - (10 + i * 20) * 0.18, "oak", "#2a3a2a");
      const p = (k.t * 3) % 40; k.fig("David", "weep", 30 + p, 22 - p * 0.18);
    } },
  ],
  16: [
    { verse: 1, alt: "Ziba meets David with saddled donkeys loaded with bread, raisins and wine", draw: (k) => {
      k.scene("day", "mountains");
      k.animal("donkey", 56, 23); k.animal("donkey", 72, 24, true);
      k.rect(58, 21, 5, 2, "#c8a060"); k.rect(74, 22, 5, 2, "#8a3a5a");
      k.fig("Ziba", "stand", 44, 19); k.fig("David", "stand", 100, 19, true);
    } },
    { verse: 5, alt: "Shimei curses David and throws stones and dust along the hillside", draw: (k) => {
      k.scene("day", "hills");
      k.ridge((x) => 30 - Math.sin(((x - 60) / 68) * Math.PI) * 14, "#5a7a3a", 40, 60, 128);
      k.fig("Shimei", "stand", 84, 4, true);
      for (let i = 0; i < 3; i++) { const p = (k.t * 1.3 + i / 3) % 1; k.px(82 - p * 40, 8 + p * 14 - Math.sin(p * Math.PI) * 6, "#8a8070"); }
      k.fig("David", "stand", 24, 19); k.fig("Abishai", "sword", 36, 19);
    } },
    { verse: 15, alt: "Absalom enters Jerusalem with Ahithophel", draw: (k) => {
      k.scene("day", "city", { cityX: 90, cityW: 60 });
      k.fig("Absalom", "front", 40, 19); k.fig("Ahithophel", "staff", 26, 19); k.flag(54, 31, "#8a3a8a");
    } },
    { verse: 22, alt: "A tent is pitched for Absalom on the palace roof", draw: (k) => {
      k.scene("dusk", "none"); k.palace(30, 34, 64, 18);
      k.tent(52, 16, 20, 8, "#8a3a8a"); k.flag(76, 16, "#8a3a8a");
    } },
  ],
  17: [
    { verse: 1, alt: "Absalom's council weighs Ahithophel's advice against Hushai's", draw: (k) => {
      k.room("palace"); k.lamp(64, 8);
      k.throne(54, 31); k.fig("Absalom", "sit", 56, 21);
      k.fig("Ahithophel", "staff", 22, 19); k.fig("Hushai", "stand", 96, 19, true);
    } },
    { verse: 18, alt: "Jonathan and Ahimaaz hide in a well while a woman spreads grain over it", draw: (k) => {
      k.scene("day", "hills"); k.tent(96, 31, 18, 10, "#b8a080");
      k.well(44, 31); k.rect(44, 25, 10, 1, "#c8b050");
      k.fig("woman of Bahurim", "kneel", 58, 22);
      if (k.f % 16 < 8) { k.px(47, 24, "#e0a96d"); k.px(50, 24, "#c48a5a"); }
    } },
    { verse: 22, alt: "By dawn David and all his people cross over the Jordan", draw: (k) => {
      k.scene("dawn", "river");
      for (let i = 0; i < 5; i++) { const x = ((k.t * 6 + i * 26) % 150) - 10; k.fig(i ? "follower " + i : "David", "stand", x, 23); }
    } },
    { verse: 27, alt: "Barzillai and others bring beds, bowls, wheat, honey and cheese at Mahanaim", draw: (k) => {
      k.scene("day", "hills"); k.tent(10, 31);
      for (let i = 0; i < 4; i++) k.rect(50 + i * 11, 27, 8, 4, ["#c8a060", "#e0c040", "#f0e8d0", "#8a6a3a"][i]);
      k.fig("Barzillai", "staff", 96, 19, true); k.fig("David", "stand", 34, 19);
    } },
  ],
  18: [
    { verse: 1, alt: "The army marches out by hundreds and thousands while David stands by the gate", draw: (k) => {
      k.scene("dawn", "none"); k.city(20, 34, 36, 18);
      k.fig("David", "stand", 42, 22);
      for (let i = 0; i < 5; i++) { const x = ((56 + i * 14 + k.t * 8) % 150); k.fig("soldier " + i, "spear", x, 22); }
      k.ridge(() => 34, "#3a3048");
    } },
    { verse: 6, alt: "The battle spreads through the forest of Ephraim", draw: (k) => {
      k.scene("day", "forest");
      k.fig("soldier", "sword", 30, 19); k.fig("Absalom's man", "spear", 70, 19, true);
      for (let i = 0; i < 4; i++) k.px((k.t * 20 + i * 30) % 128, 20 + i, "#c8d8a0");
    } },
    { verse: 9, alt: "Absalom's hair catches in an oak while his mule runs on", draw: (k) => {
      k.scene("day", "hills");
      k.rect(52, 6, 4, 26, "#5c3a1e"); k.line(54, 10, 80, 12, "#5c3a1e");
      for (const [x, y, r] of [[54, 6, 7], [70, 9, 6], [82, 10, 5], [44, 8, 5]]) k.disc(x, y, r, "#2e6a2a");
      const sw = Math.round(Math.sin(k.t * 2)); k.line(74, 12, 74 + sw, 15, "#3b2414");
      k.fig("Absalom", "front", 70 + sw, 15);
      const x = 92 + ((k.t * 12) % 50); k.animal("donkey", x, 25, false, true);
    } },
    { verse: 24, alt: "From the roof over the gate, the watchman sees runners coming", draw: (k) => {
      k.scene("day", "desert");
      k.city(16, 32, 30, 14); k.fig("watchman", "stand", 10, 4);
      for (let i = 0; i < 2; i++) { const x = 120 - ((k.t * 9 + i * 22) % 80); k.fig(i ? "Cushite" : "Ahimaaz", "run", x, 20, true); }
      k.fig("David", "sit", 34, 21);
    } },
    { verse: 33, alt: "David weeps in the room over the gate: O my son Absalom", draw: (k) => {
      k.scene("dusk", "none"); k.city(64, 36, 80, 20, true);
      k.rect(52, 6, 24, 12, "#3a2e24"); k.rect(54, 8, 20, 10, "#1a1218");
      k.fig("David", "weep", 58, 7);
    } },
  ],
  19: [
    { verse: 3, alt: "The troops steal into the city like people ashamed after fleeing battle", draw: (k) => {
      k.scene("dusk", "city", { cityX: 100, cityW: 44 });
      for (let i = 0; i < 4; i++) { const x = 20 + i * 14 + ((k.t * 3) % 10); k.fig("soldier " + i, "weep", x, 19); }
    } },
    { verse: 8, alt: "The king gets up and sits in the gate, and all the people come before him", draw: (k) => {
      k.scene("day", "none"); k.city(30, 34, 50, 20);
      k.fig("David", "sit", 26, 24);
      for (let i = 0; i < 4; i++) k.fig("man " + i, "bow", 62 + i * 14, 28, true);
      k.ridge(() => 34, "#6a5a48");
    } },
    { verse: 15, alt: "Judah comes to the Jordan to bring the king across on the ferry", draw: (k) => {
      k.scene("day", "river");
      const x = 20 + ((k.t * 5) % 60); k.rect(x, 30, 26, 3, "#8a5a32"); k.fig("David", "stand", x + 9, 18);
      k.fig("Shimei", "bow", 100, 25, true);
    } },
    { verse: 24, alt: "Mephibosheth comes to meet the king, unwashed and grieving since he left", draw: (k) => {
      k.scene("day", "city", { cityX: 104, cityW: 36 });
      k.fig("David", "stand", 30, 19); k.fig("Mephibosheth", "kneel", 50, 22, true);
      for (let i = 0; i < 4; i++) k.px(52 + i * 2, 19 + (i % 2), "#5a4a3a");
    } },
    { verse: 31, alt: "Old Barzillai, eighty years old, says goodbye at the Jordan", draw: (k) => {
      k.scene("dusk", "river");
      k.fig("Barzillai", "staff", 40, 19); k.fig("David", "stand", 60, 19, true); k.fig("Chimham", "stand", 74, 19, true);
    } },
  ],
  20: [
    { verse: 1, alt: "Sheba blows the trumpet: We have no share in David", draw: (k) => {
      k.scene("day", "hills");
      k.fig("Sheba", "trumpet", 40, 19);
      for (let i = 0; i < 4; i++) { const x = 60 + ((k.t * 10 + i * 18) % 70); k.fig("man of Israel " + i, "run", x, 19); }
    } },
    { verse: 8, alt: "Joab and Amasa meet at the great stone in Gibeon", draw: (k) => {
      k.scene("dusk", "hills"); k.disc(64, 26, 7, "#6a6058"); k.rect(57, 26, 15, 6, "#6a6058");
      k.fig("Joab", "stand", 40, 19); k.fig("Amasa", "stand", 82, 19, true);
    } },
    { verse: 15, alt: "Joab's army raises a siege ramp against the wall of Abel Beth-maacah", draw: (k) => {
      k.scene("day", "hills"); k.city(96, 30, 56, 18);
      k.ridge((x) => 34 - (x - 40) * 0.6, "#8a7a5a", 40, 40, 70);
      for (let i = 0; i < 3; i++) k.fig("soldier " + i, "spear", 8 + i * 12, 19);
      k.fig("Joab", "sword", 46, 19);
    } },
    { verse: 16, alt: "A wise woman calls out from the city wall to Joab", draw: (k) => {
      k.scene("day", "none"); k.city(84, 34, 80, 22);
      k.fig("wise woman", "front", 80, 0); k.notes(90, 6, "#ffffff");
      k.fig("Joab", "stand", 20, 22); k.ridge(() => 34, "#6a7a48");
    } },
    { verse: 22, alt: "Joab blows the trumpet and the men disperse to their tents", draw: (k) => {
      k.scene("dusk", "hills"); k.tent(90, 31); k.tent(110, 31, 14, 8);
      k.fig("Joab", "trumpet", 30, 19);
    } },
  ],
  21: [
    { verse: 1, alt: "A famine for three years, year after year", draw: (k) => {
      k.scene("famine", "desert");
      for (let i = 0; i < 18; i++) k.line(4 + i * 7, 34, 7 + i * 7, 37, "#7a5030");
      k.tree(30, 31, "oak", "#8a7a40"); k.fig("David", "kneel", 60, 22);
      k.birds(3, 8, "#3a2010");
    } },
    { verse: 10, alt: "Rizpah spreads sackcloth on the rock and keeps watch until the rain falls", draw: (k) => {
      const rain = (k.t % 12) > 8;
      k.scene(rain ? "storm" : "famine", "hills");
      k.rect(36, 27, 30, 6, "#6a6058"); k.rect(40, 26, 20, 2, "#5a4a3a");
      k.fig("Rizpah", "sit", 44, 16);
      if (!rain) k.birds(3, 6, "#2a1a10");
    } },
    { verse: 12, alt: "The bones of Saul and Jonathan are buried in the land of Benjamin", draw: (k) => {
      k.scene("day", "hills"); k.stones(54, 31, 9);
      k.fig("David", "stand", 36, 19); k.fig("mourner", "weep", 76, 19);
    } },
    { verse: 15, alt: "David grows weary fighting a giant of the Philistines", draw: (k) => {
      k.scene("day", "valley");
      k.fig("David", "sword", 30, 19); k.fig("Abishai", "sword", 18, 19);
      k.giant("Ishbi-benob", 70, 8);
    } },
    { verse: 20, alt: "A giant with six fingers on each hand and six toes on each foot", draw: (k) => {
      k.scene("dusk", "valley");
      k.giant("giant of Gath", 64, 8);
      k.fig("Jonathan son of Shimei", "sword", 30, 20);
    } },
  ],
  23: [
    { verse: 1, alt: "David's last words: like the light of morning, a morning without clouds", draw: (k) => {
      k.scene("dawn", "field", { crop: "#4a8a3a", cropTop: "#8acf5a" });
      k.fig("David", "praise", 56, 15);
      for (let i = 0; i < 6; i++) k.px(10 + i * 21, 30 - ((k.t * 3 + i) % 4), "#cfe8ff");
    } },
    { verse: 11, alt: "Shammah takes his stand in the middle of a lentil field and defends it", draw: (k) => {
      k.scene("day", "field", { crop: "#6a8a3a", cropTop: "#a0b050" });
      k.fig("Shammah", "sword", 58, 18);
      const x = 110 + ((k.t * 10) % 40); k.fig("Philistine", "run", x, 18);
      k.fig("Philistine 2", "run", 10 - ((k.t * 10) % 30), 18, true);
    } },
    { verse: 15, alt: "Three mighty men bring water from the well of Bethlehem, and David pours it out to the Lord", draw: (k) => {
      k.scene("day", "city", { cityX: 104, cityW: 36 });
      k.well(70, 31); k.fig("mighty man", "stand", 84, 19, true);
      k.fig("David", "stand", 36, 19);
      for (let i = 0; i < 4; i++) k.px(44, 24 + ((k.t * 10 + i * 2) % 8), "#9cc8f0");
    } },
    { verse: 20, alt: "Benaiah goes down into a pit on a snowy day and kills a lion", draw: (k) => {
      k.scene("night", "none", { noMoon: true });
      k.rect(0, 22, 128, 18, "#d8e0ea"); k.rect(40, 26, 48, 14, "#3a3040");
      for (let i = 0; i < 30; i++) k.px((k.rnd() * 128 + k.t * 3) % 128, (k.rnd() * 30 + k.t * 8) % 30, "#ffffff");
      k.fig("Benaiah", "sword", 50, 26); k.animal("lion", 66, 34, true);
    } },
  ],
  24: [
    { verse: 1, alt: "David orders Joab to count the people of Israel", draw: (k) => {
      k.room("palace"); k.lamp(64, 8);
      k.throne(20, 31); k.fig("David", "sit", 22, 21); k.fig("Joab", "stand", 80, 19, true); k.scroll(64, 24);
    } },
    { verse: 10, alt: "David's heart troubles him after the count, and he confesses", draw: (k) => {
      k.scene("night", "city", { cityX: 90, cityW: 60 });
      k.fig("David", "kneel", 40, 22);
    } },
    { verse: 15, alt: "The angel stretches out his hand over Jerusalem", draw: (k) => {
      k.scene("storm", "city", { cityX: 64, cityW: 70 });
      k.angel(86, 4);
    } },
    { verse: 18, alt: "Gad tells David to build an altar on Araunah's threshing floor", draw: (k) => {
      k.scene("day", "hills");
      k.rect(40, 30, 50, 3, "#a08a5a");
      k.animal("ox", 70, 23); k.fig("Araunah", "bow", 50, 26, true);
      k.fig("David", "stand", 22, 19); k.fig("Gad", "staff", 10, 19);
    } },
    { verse: 25, alt: "David builds an altar and offers sacrifices, and the plague stops", draw: (k) => {
      k.scene("dawn", "city", { cityX: 104, cityW: 36 });
      k.altar(52, 31); k.fig("David", "praise", 30, 19);
      for (let i = 0; i < 4; i++) k.line(58, 0, 58 + (i - 1.5) * 8, 18, "#fff4c2");
    } },
  ],
};

for (const [ch, scenes] of Object.entries(_NR_2SA)) {
  if (typeof _NR_SCENES !== "undefined") _NR_SCENES[`2SA-${ch}`] = scenes;
}
