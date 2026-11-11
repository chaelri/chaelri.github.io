// 17-scenes-2ch-a.js — the 8-bit banners for 2 Chronicles 1–18.
//
// Same kit as 2 Samuel (13-scenes-2sa.js mixes it into every `k`); this file
// only adds local helpers (temple front, sanctuary, cherubim, lampstand, the
// bronze Sea, ships, chariots, camels) and the scene data. Scenes are keyed by
// the verse they open on. Battles and deaths are shown by setting or
// aftermath, never the act. Wrapped in an IIFE so nothing leaks into the
// shared script scope. Chapters 19–36 live in a sibling file.
(function () {
  const GOLD = "#f2c230", GOLD_D = "#c9a046", GOLD_L = "#fff0a0";
  const STONE = "#d8ccb0", STONE_D = "#b0a084";
  const BRONZE = "#b8783a", BRONZE_L = "#d89a4a";

  // Courtyard / plain ground under a scene drawn with terrain "none".
  function ground(k, c = "#b8a070", c2 = "#a08a5a", y = 31, paved = false) {
    k.rect(0, y, 128, 40 - y, c);
    k.rect(0, y + 4, 128, 40 - y - 4, c2);
    if (paved) for (let x = 0; x < 128; x += 8) k.rect(x + (x % 16 ? 4 : 0), y + 1, 1, 3, c2);
  }
  function water(k, y, c = "#2c5a8c") {
    k.rect(0, y, 128, 40 - y, c);
    for (let x = 0; x < 128; x += 5) k.px((x + k.t * 5) % 128, y + 1 + (x % 4) * 2, "#9cc0f0");
  }

  // The temple front: long hall, tall porch, gilded cornice, two bronze
  // pillars at the door. x = left edge of the hall.
  function temple(k, x, base, o = {}) {
    const w = o.w ?? 44, h = o.h ?? 16, cx = Math.round(x + w / 2);
    k.rect(x, base - h, w, h, STONE);
    k.rect(x - 1, base - h - 2, w + 2, 2, GOLD_D);
    for (let i = 3; i < w - 2; i += 5) k.rect(x + i, base - h + 3, 1, h - 5, STONE_D);
    k.rect(cx - 8, base - h - 7, 16, h + 7, STONE);
    k.rect(cx - 9, base - h - 9, 18, 2, GOLD);
    for (let i = -7; i <= 7; i += 3) k.px(cx + i, base - h - 10, GOLD);
    if (o.open) k.rect(cx - 3, base - 10, 6, 10, "#ffd27a");
    else {
      k.rect(cx - 3, base - 10, 6, 10, "#6a4a20"); k.rect(cx, base - 10, 1, 10, "#4a3010");
      k.px(cx - 2, base - 6, GOLD); k.px(cx + 2, base - 6, GOLD);
    }
    if (!o.noPillars) for (const px of [cx - 7, cx + 6]) {
      k.rect(px, base - 13, 2, 13, BRONZE); k.rect(px - 1, base - 15, 4, 2, BRONZE_L);
      k.px(px, base - 16, "#c8504a"); k.px(px + 1, base - 16, "#c8504a");
    }
    k.rect(cx - 11, base - 1, 22, 1, STONE_D);
    if (o.glow) k.glow(cx, base - h - 2, 10 + k.pulse(1.5, 2), "#fff4c2");
  }
  // The cloud of the Lord's glory.
  function glory(k, cx, cy, w) {
    k.glow(cx, cy, Math.round(w / 2) + k.pulse(1.2, 2), "#fff4c2");
    k.cloud(cx + k.pulse(0.7, 2), cy, w, "#f6f2e2", "#ddd4b8");
  }
  // Inside the temple: gold-covered cedar, carved palms and chains.
  function sanctuary(k, holy = false) {
    k.rect(0, 0, 128, 40, holy ? "#3a2a0e" : "#6a5018");
    for (let x = 4; x < 128; x += 16) {
      k.rect(x, 3, 10, 25, holy ? "#4a3812" : "#8a6a22");
      k.line(x + 5, 25, x + 5, 12, GOLD_D);
      for (const d of [-3, -2, 2, 3]) k.line(x + 5, 12, x + 5 + d, 14 + Math.abs(d) % 2, GOLD);
    }
    for (let x = 0; x < 128; x += 2) k.px(x, 1 + (x % 4 ? 1 : 0), GOLD_D);
    k.rect(0, 30, 128, 10, holy ? "#5a4214" : "#7a5a1a");
    for (let x = 0; x < 128; x += 10) k.rect(x, 30, 1, 10, holy ? "#4a3410" : "#6a4c16");
    for (let i = 0; i < 4; i++) if ((k.f + i * 5) % 14 === 0) k.px(12 + i * 31, 8 + (i % 2) * 9, "#ffffff");
  }
  const CHERUB_PAL = { c: GOLD, s: "#f2d070", e: "#8a6a10", b: "#f2d070", t: GOLD, T: GOLD_D, w: GOLD_L, l: GOLD_D };
  // A golden cherub facing out, wings stretched level to each side.
  function cherub(k, x, y, reachL, reachR) {
    for (let f = 0; f < 3; f++) {
      k.line(x + 2, y + 5 + f, x + 2 - reachL + f * 2, y + 1 + f, f === 1 ? GOLD_D : GOLD);
      k.line(x + 6, y + 5 + f, x + 6 + reachR - f * 2, y + 1 + f, f === 1 ? GOLD_D : GOLD);
    }
    k.sprite(_SCK.front, CHERUB_PAL, x, y);
  }
  const MENORAH = ["f.f.f.f", "g.g.g.g", "g.g.g.g", ".ggggg.", "...g...", "...g...", "..ggg.."];
  function menorah(k, x, y) {
    k.glow(x + 3, y, 5, "#7a6030");
    k.sprite(MENORAH, { g: GOLD, f: (k.f + x) % 4 < 2 ? "#ffd27a" : "#ff9a3c" }, x, y);
  }
  function bronzeAltar(k, x, base, w = 14, h = 7) {
    k.rect(x, base - h, w, h, BRONZE);
    for (let y = base - h + 2; y < base; y += 2) k.rect(x, y, w, 1, "#9a6030");
    k.px(x, base - h - 1, BRONZE_L); k.px(x + w - 1, base - h - 1, BRONZE_L);
    k.fire(x + w / 2, base - h, w - 4);
    k.smoke(x + w / 2, base - h - 3);
  }
  const BULL_PAL = { b: BRONZE, h: BRONZE_L, e: "#5a3a12" };
  // The bronze Sea: a great basin on bulls facing outward. About 28 wide.
  function sea(k, x, base) {
    k.rect(x + 7, base - 7, 12, 3, BRONZE);
    k.sprite(_SC_ANIMAL.ox.rows, BULL_PAL, x - 2, base - 5, true);
    k.sprite(_SC_ANIMAL.ox.rows, BULL_PAL, x + 18, base - 5);
    for (let i = 0; i < 7; i++) k.rect(x + i, base - 14 + i, 26 - 2 * i, 1, i % 2 ? BRONZE : "#a86a30");
    k.rect(x - 1, base - 15, 28, 1, BRONZE_L);
    for (let i = 1; i < 26; i += 4) k.px(x + i, base - 12, "#e8b860");
    k.px(x + 2 + (k.f % 22), base - 16, "#9cc0f0");
  }
  const SHIP = ["....m.....", "....mss...", "....msss..", "....mssss.", "....m.....", "hhhhhhhhhh", ".hhhhhhhh."];
  function ship(k, x, y, flip = false, sail = "#f2efe6") {
    k.sprite(SHIP, { m: "#5c3a1e", s: sail, h: "#8a5a32" }, x, y + k.pulse(2 + x * 0.01, 1), flip);
  }
  // Tall layered cedar of Lebanon.
  function cedar(k, x, base, h = 16, c = "#2f5a2a") {
    k.rect(x, base - 4, 2, 4, "#5c3a1e");
    for (let i = 0; i < h - 4; i++) {
      const w = Math.round((i / (h - 4)) * 6) + 1;
      k.rect(x + 1 - w, base - h + i, w * 2, 1, i % 3 === 2 ? "#244a20" : c);
    }
  }
  // Horse pulling a two-wheeled car; `who` rides in the car.
  function chariot(k, x, base, flip = false, who = null, pose = "stand") {
    const hx = flip ? x : x + 8, cx = flip ? x + 11 : x;
    k.animal("horse", hx, base - 7, flip, true);
    if (who) k.fig(who, pose, cx, base - 16, flip);
    k.rect(cx, base - 8, 7, 4, "#8a5a32"); k.rect(cx, base - 8, 7, 1, GOLD_D);
    k.disc(cx + 3, base - 3, 2, "#5a3a22"); k.px(cx + 3, base - 3, "#a8865c");
  }
  const CAMEL = [
    ".........hh.", ".........hhh", "...hh....h..", "..hhhh...h..", ".hhhhhhhhh..",
    "hhhhhhhhhh..", ".hhhhhhhh...", ".h.h...h.h..", ".h.h...h.h..",
  ];
  function camel(k, x, y, flip = false, load = null) {
    const bob = Math.floor(k.t * 3 + x) % 2 ? -1 : 0;
    k.sprite(CAMEL, { h: "#c8a070" }, x, y + bob, flip);
    if (load) k.rect(x + (flip ? 5 : 2), y + 1 + bob, 6, 3, load);
  }
  // A worker's hammer that rises and strikes.
  function hammer(k, x, y, flip = false, i = 0) {
    const up = Math.floor(k.t * 4 + i) % 2, d = flip ? -1 : 1, hx = flip ? x : x + 6;
    k.line(hx, y + 6, hx + d * 2, y + (up ? 1 : 5), "#7a5a32");
    k.rect(hx + d * 2 - 1, y + (up ? 0 : 5), 3, 2, "#5a5a62");
    if (!up) k.px(hx + d * 4, y + 9 - (k.f % 3), "#ffe08a");
  }
  // Light pouring down from heaven onto (x, y).
  function rays(k, x, y, n = 4, c = "#fff4c2") {
    for (let i = 0; i < n; i++) {
      const p = (k.t * 0.8 + i / n) % 1;
      k.line(x - n * 2 + i * 4, 0, x - n + i * 2, y, i % 2 ? c : "#fff8d0");
      k.px(x - n + i * 2, Math.round(p * y), "#ffffff");
    }
  }
  // A speech bubble whose dots fill in one by one.
  function talk(k, x, y) {
    k.rect(x, y, 9, 5, "#f4f0e0"); k.px(x + 2, y + 5, "#f4f0e0");
    for (let i = 0; i < 3; i++) if (Math.floor(k.t * 3) % 4 > i) k.px(x + 2 + i * 2, y + 2, "#3a3030");
  }
  const JAR = [".cc.", "cccc", "cccc", "cccc", ".cc."];
  function jar(k, x, y, c = "#b06a3a") { k.sprite(JAR, { c }, x, y); k.px(x + 1, y + 1, "#e0a070"); }
  function peacock(k, x, base) {
    const sp = 3 + (Math.floor(k.t * 0.7) % 2);
    for (let a = -3; a <= 3; a++) { k.line(x, base - 3, x + a * sp, base - 10 + Math.abs(a), "#2a8a7a"); k.px(x + a * sp, base - 10 + Math.abs(a), "#2a4ab0"); }
    k.rect(x - 1, base - 4, 3, 3, "#2a5ab0"); k.px(x + 2, base - 6, "#2a5ab0"); k.px(x + 2, base - 7, "#2a8a7a");
    k.line(x, base - 1, x, base, "#8a6a3a");
  }
  const APE = [".bb.", "bfeb", ".bb.", "bbbb", "b..b"];
  function ape(k, x, y) { k.sprite(APE, { b: "#6a4a30", f: "#c8a080", e: "#c8a080" }, x, y - (Math.floor(k.t * 4) % 2)); }
  function rainbow(k, cx, cy, r) {
    ["#d84a4a", "#e8a040", "#e8d860", "#6ab060", "#4a7ad0"].forEach((c, j) => {
      for (let a = 0; a <= Math.PI; a += 0.02) k.px(cx + Math.cos(a) * (r - j), cy - Math.sin(a) * (r - j), c);
    });
  }

  const NR = {
    1: [
      { verse: 3, alt: "Solomon leads the whole assembly to the bronze altar before the Lord's tent at Gibeon", draw: (k) => {
        k.scene("day", "hills"); k.tent(76, 31, 28, 14, "#d8c8a8");
        bronzeAltar(k, 50, 31, 16, 8);
        k.fig("Solomon", "praise", 34, 19); k.fig("elder", "stand", 18, 19); k.fig("captain", "spear", 4, 19);
        k.fig("priest", "stand", 68, 19, true);
      } },
      { verse: 7, alt: "That night God appears to Solomon and says, Ask for whatever you want me to give you", draw: (k) => {
        k.scene("night", "hills", { moonX: 18 }); k.tent(84, 31, 26, 13, "#7a6a54");
        k.fig("Solomon", "kneel", 52, 23);
        k.glow(56, 5, 8 + k.pulse(2, 2), "#fff4c2");
        for (let y = 0; y < 18; y += 2) k.px(56 + (y % 4 ? 1 : 0), 5 + y, "#fff8d0");
      } },
      { verse: 11, alt: "God gives Solomon the wisdom he asked for, and riches and honour besides", draw: (k) => {
        k.room("palace"); k.lamp(14, 8); k.lamp(114, 8);
        rays(k, 50, 22, 3);
        k.fig("Solomon", "kneel", 44, 22); k.scroll(30, 26);
        k.crown(70, 10);
        for (let i = 0; i < 7; i++) { k.disc(82 + (i % 4) * 5, 28 - Math.floor(i / 4) * 3, 2, i % 2 ? GOLD : "#d8dce4"); if ((k.f + i * 3) % 11 === 0) k.px(82 + (i % 4) * 5, 27 - Math.floor(i / 4) * 3, "#ffffff"); }
      } },
      { verse: 14, alt: "Solomon gathers chariots and horsemen, fourteen hundred chariots and twelve thousand horses", draw: (k) => {
        k.scene("day", "valley"); k.city(110, 26, 28, 9);
        for (let i = 0; i < 3; i++) chariot(k, ((i * 52 + k.t * 10) % 170) - 30, 32, false, "charioteer " + i);
      } },
      { verse: 15, alt: "In Jerusalem silver and gold become as common as stones, and cedar as common as fig trees", draw: (k) => {
        k.scene("noon", "city", { cityX: 62, cityW: 52 });
        cedar(k, 6, 31, 18); cedar(k, 114, 31, 20); k.tree(100, 31);
        k.fig("Solomon", "front", 92, 19);
        for (let i = 0; i < 14; i++) {
          const x = 4 + i * 9, y = 34 + (i % 3);
          k.disc(x, y, 1, i % 3 ? "#d8dce4" : GOLD);
          if ((k.f + i * 4) % 17 === 0) k.px(x, y - 1, "#ffffff");
        }
      } },
    ],
    2: [
      { verse: 1, alt: "Solomon sets seventy thousand carriers and eighty thousand stonecutters to work in the hills", draw: (k) => {
        k.scene("day", "mountains");
        for (let i = 0; i < 3; i++) { k.fig("stonecutter " + i, "stand", 8 + i * 18, 19); hammer(k, 8 + i * 18, 19, false, i); k.rect(17 + i * 18, 27, 5, 4, STONE); }
        const x = 64 + ((k.t * 8) % 44); k.fig("carrier", "run", x, 19); k.rect(x + 1, 16, 6, 3, STONE);
        k.fig("Solomon", "stand", 116, 19, true);
      } },
      { verse: 3, alt: "Solomon writes to King Hiram of Tyre asking for cedar and a skilled craftsman", draw: (k) => {
        k.room("palace"); k.lamp(64, 8);
        k.fig("Solomon", "sit", 28, 20);
        k.rect(38, 26, 24, 3, "#8a5a32"); k.rect(40, 29, 2, 2, "#6a4020"); k.rect(58, 29, 2, 2, "#6a4020");
        k.scroll(44, 21);
        const q = k.f % 6; k.line(46 + q, 21, 48 + q, 17, "#f2efe6");
        k.fig("messenger", "stand", 86, 19, true); cedar(k, 112, 30, 12);
      } },
      { verse: 8, alt: "Woodcutters fell the tall cedars of Lebanon", draw: (k) => {
        k.scene("day", "mountains");
        cedar(k, 8, 31, 20); cedar(k, 24, 31, 16); cedar(k, 102, 31, 18); cedar(k, 118, 31, 22);
        const p = Math.min(1, (k.t % 5) / 2.5), ang = p * p * 1.3;
        const tx = 66 + Math.sin(ang) * 22, ty = 31 - Math.cos(ang) * 22;
        k.line(66, 31, tx, ty, "#5c3a1e"); k.line(67, 31, tx + 1, ty, "#5c3a1e");
        for (let s = 0.45; s <= 1; s += 0.15) k.disc(66 + Math.sin(ang) * 22 * s, 31 - Math.cos(ang) * 22 * s, 2 + Math.round((1 - s) * 4), "#2f5a2a");
        k.fig("woodcutter", "stand", 44, 19); hammer(k, 44, 19);
        k.fig("woodcutter 2", "stand", 84, 19, true); hammer(k, 84, 19, true, 1);
      } },
      { verse: 13, alt: "Hiram sends Huram-Abi, a master craftsman in gold, bronze, iron and fine cloth", draw: (k) => {
        k.room("house");
        k.rect(72, 20, 18, 10, "#5a4a40"); k.rect(75, 22, 12, 6, "#2a1a14"); k.fire(81, 28, 10); k.glow(81, 24, 9, "#7a4020");
        k.rect(50, 25, 10, 2, "#3a3a44"); k.rect(53, 27, 4, 3, "#3a3a44"); k.rect(52, 24, 5, 1, BRONZE_L);
        k.fig("Huram-Abi", "stand", 40, 19); hammer(k, 40, 19);
        for (let i = 0; i < 3; i++) k.rect(100 + i * 6, 22, 4, 8, ["#3a4ab0", "#7a3a9a", "#b02a3a"][i]);
      } },
      { verse: 16, alt: "Cedar logs tied into rafts float along the sea to Joppa", draw: (k) => {
        k.scene("day", "none");
        k.ridge((x) => (x > 92 ? 25 - (x - 92) * 0.12 : 40), "#6f9a4a", 40, 92, 128);
        k.city(114, 24, 18, 6);
        water(k, 27);
        for (let i = 0; i < 2; i++) {
          const x = ((i * 64 + k.t * 6) % 140) - 30, b = k.pulse(2 + i, 1);
          k.rect(x, 29 + b, 20, 2, "#8a5a32"); k.rect(x + 1, 31 + b, 18, 1, "#6a4020");
          for (let r = 3; r < 20; r += 6) k.px(x + r, 29 + b, "#d8c890");
          k.fig("raftsman " + i, "staff", x + 7, 17 + b);
        }
      } },
    ],
    3: [
      { verse: 1, alt: "Solomon begins building the temple on Mount Moriah, at Araunah's threshing floor", draw: (k) => {
        k.scene("dawn", "hills");
        k.rect(38, 25, 52, 6, STONE); for (let x = 38; x < 90; x += 6) k.rect(x + (x % 12 ? 0 : 3), 27, 1, 3, STONE_D); k.rect(38, 28, 52, 1, STONE_D);
        k.line(70, 31, 70, 6, "#7a5a32"); k.line(70, 6, 84, 6, "#7a5a32");
        const y = 8 + Math.round(Math.abs(Math.sin(k.t * 0.8)) * 10); k.line(82, 6, 82, y, "#c8b890"); k.rect(79, y, 7, 4, STONE);
        k.fig("builder", "stand", 92, 19, true); k.fig("builder 2", "stand", 50, 19); hammer(k, 50, 19);
        k.fig("Solomon", "stand", 14, 19);
      } },
      { verse: 5, alt: "Workers cover the cypress walls with pure gold, carved with palm trees and chains", draw: (k) => {
        sanctuary(k);
        k.fig("goldsmith", "kneel", 30, 22); hammer(k, 30, 22, false, 0);
        k.line(84, 30, 88, 8, "#7a5a32"); k.line(90, 30, 94, 8, "#7a5a32"); for (let y = 10; y < 30; y += 4) k.line(84 + (30 - y) / 5.5, y, 90 + (30 - y) / 5.5, y, "#7a5a32");
        k.fig("goldsmith 2", "stand", 94, 6, true);
        k.rect(100, 10 + k.pulse(2, 1), 6, 4, GOLD_L);
      } },
      { verse: 10, alt: "Two great golden cherubim stand in the Most Holy Place, their wings reaching wall to wall", draw: (k) => {
        sanctuary(k, true);
        k.glow(64, 18, 16 + k.pulse(1.2, 2), "#6a5420");
        cherub(k, 34, 17, 26, 26); cherub(k, 86, 17, 26, 26);
      } },
      { verse: 14, alt: "A curtain of blue, purple and crimson, worked with cherubim, hangs before the Most Holy Place", draw: (k) => {
        sanctuary(k); menorah(k, 12, 23);
        k.rect(28, 2, 72, 2, GOLD);
        const cols = ["#3a4ab0", "#7a3a9a", "#b02a3a", "#e8e4d8"];
        for (let x = 28; x < 100; x++) {
          const hem = 29 + Math.round(Math.sin(k.t * 1.5 + x / 6));
          k.line(x, 4, x, hem, cols[Math.floor((x - 28) / 3) % 4]);
        }
        for (const cx of [44, 64, 84]) { k.px(cx, 12, GOLD); k.line(cx - 4, 10, cx - 1, 12, GOLD); k.line(cx + 4, 10, cx + 1, 12, GOLD); k.px(cx, 13, GOLD); k.px(cx, 14, GOLD); }
        k.fig("priest", "stand", 106, 19, true);
      } },
      { verse: 15, alt: "The two bronze pillars, Jachin and Boaz, stand at the front of the temple", draw: (k) => {
        k.scene("noon", "none"); ground(k, "#c8b890", "#b0a078", 31, true);
        temple(k, 28, 31, { w: 72, h: 17, noPillars: true });
        for (const px of [48, 77]) {
          k.rect(px, 9, 3, 22, BRONZE); k.rect(px + 2, 9, 1, 22, "#9a6030");
          k.rect(px - 2, 5, 7, 4, BRONZE_L);
          for (let i = -2; i < 5; i += 2) k.px(px + i, 9, "#c8504a");
          k.px(px + 1, 10 + (k.f % 20), "#ffe0a0");
        }
        k.fig("Solomon", "stand", 10, 19); k.fig("Huram-Abi", "stand", 108, 19, true);
      } },
    ],
    4: [
      { verse: 1, alt: "A great bronze altar is made, nine metres square and four and a half metres high", draw: (k) => {
        k.scene("day", "city", { cityX: 112, cityW: 26 });
        k.line(18, 31, 32, 17, "#9a6030"); k.line(19, 31, 33, 17, "#9a6030");
        bronzeAltar(k, 32, 31, 46, 14);
        k.fig("priest", "stand", 82, 19, true); k.fig("priest 2", "stand", 22, 14);
      } },
      { verse: 2, alt: "The great bronze Sea stands on twelve bronze bulls", draw: (k) => {
        k.scene("day", "none"); ground(k, "#c8b890", "#b0a078", 31, true);
        temple(k, 4, 31, { w: 40, h: 14 });
        sea(k, 66, 31);
        k.fig("priest", "stand", 104, 19, true);
        for (let i = 0; i < 3; i++) k.px(102, 22 + ((k.t * 8 + i * 3) % 9), "#9cc8f0");
      } },
      { verse: 7, alt: "Golden lampstands burn in the Holy Place beside tables of gold", draw: (k) => {
        sanctuary(k);
        for (const x of [6, 20, 100, 114]) menorah(k, x, 23);
        for (const x of [36, 70]) {
          k.rect(x, 25, 20, 2, GOLD); k.rect(x + 1, 27, 2, 3, GOLD_D); k.rect(x + 17, 27, 2, 3, GOLD_D);
          for (let i = 0; i < 4; i++) k.rect(x + 2 + i * 4, 23, 3, 2, "#e0b070");
        }
        k.fig("priest", "stand", 59, 18);
      } },
      { verse: 17, alt: "In the clay ground of the Jordan plain the bronze is poured into moulds", draw: (k) => {
        k.scene("dusk", "valley");
        k.rect(10, 22, 14, 10, "#5a4a40"); k.rect(13, 25, 8, 4, "#2a1a14"); k.fire(17, 29, 6); k.smoke(17, 18);
        k.fig("caster", "stand", 38, 19);
        k.rect(45, 21, 5, 4, "#3a3a44");
        for (let y = 25; y < 32; y++) k.px(49 + Math.round((y - 25) * 0.4), y, (y + k.f) % 3 ? "#ffb03a" : "#ffe08a");
        k.rect(48, 32, 18, 2, "#ff7a2f"); k.glow(57, 32, 6, "#a04a20");
        k.rect(76, 32, 18, 2, "#7a3a20"); k.rect(102, 32, 18, 2, "#4a3020");
        k.fig("caster 2", "stand", 96, 19, true);
      } },
    ],
    5: [
      { verse: 4, alt: "The Levites lift the ark and carry it up to the temple in a great procession", draw: (k) => {
        k.scene("day", "none"); ground(k, "#b8a070", "#a08a5a");
        temple(k, 86, 31, { w: 38, h: 14 });
        const b = Math.floor(k.t * 3) % 2;
        k.fig("priest", "stand", 30, 19 + b); k.fig("priest 2", "stand", 52, 19 + b);
        k.ark(40, 21 + b);
        k.fig("Solomon", "stand", 66, 19); k.fig("Israelite", "praise", 4, 19); k.fig("elder", "stand", 16, 19);
      } },
      { verse: 6, alt: "Solomon and the people sacrifice more sheep and cattle than anyone could count", draw: (k) => {
        k.scene("dawn", "hills");
        bronzeAltar(k, 58, 31, 16, 8);
        k.fig("Solomon", "praise", 40, 19); k.ark(20, 24);
        for (let i = 0; i < 6; i++) k.animal("sheep", 80 + ((i * 9 + k.t * 3) % 48), 28 + (i % 2) * 2, true, true);
        k.animal("ox", 84, 23, true);
      } },
      { verse: 7, alt: "The priests set the ark in the Most Holy Place beneath the cherubim's wings", draw: (k) => {
        sanctuary(k, true);
        k.glow(64, 20, 14 + k.pulse(1.5, 2), "#6a5420");
        cherub(k, 32, 14, 22, 28); cherub(k, 88, 14, 24, 26);
        k.ark(60, 24);
        k.fig("priest", "bow", 12, 24); k.fig("priest 2", "bow", 108, 24, true);
      } },
      { verse: 12, alt: "Levites in white linen play cymbals, harps and lyres while the priests blow trumpets", draw: (k) => {
        k.scene("day", "none"); ground(k, "#c8b890", "#b0a078", 31, true);
        temple(k, 4, 31, { w: 36, h: 14 }); bronzeAltar(k, 44, 31, 12, 6);
        k.fig("priest", "trumpet", 62, 19); k.fig("priest 2", "trumpet", 74, 19);
        k.fig("Levite", "sit", 88, 21); k.sprite(_SC_LYRE, _SC_PAL, 96, 25); k.notes(98, 22, "#f7d154");
        const clash = Math.floor(k.t * 3) % 2;
        k.fig("Levite 2", "stand", 110, 19, true);
        k.disc(108 - (clash ? 0 : 2), 25, 2, GOLD); k.disc(118 + (clash ? 0 : 2), 25, 2, GOLD);
      } },
      { verse: 13, alt: "The cloud of the Lord's glory fills the temple, and the priests cannot stand to serve", draw: (k) => {
        k.scene("day", "none"); ground(k, "#c8b890", "#b0a078", 31, true);
        temple(k, 40, 31, { w: 48, glow: true });
        glory(k, 64, 9, 44);
        k.fig("priest", "bow", 10, 25); k.fig("priest 2", "bow", 24, 25);
        k.fig("Levite", "bow", 100, 25, true); k.fig("Levite 2", "bow", 114, 25, true);
      } },
    ],
    6: [
      { verse: 3, alt: "King Solomon turns round and blesses the whole assembly of Israel", draw: (k) => {
        k.scene("day", "none"); ground(k, "#c8b890", "#b0a078", 31, true);
        temple(k, 72, 31, { w: 50 });
        k.fig("Solomon", "praise", 54, 19);
        for (let i = 0; i < 4; i++) k.fig("Israelite " + i, "stand", 4 + i * 11, 20 + (i % 2));
        for (let i = 0; i < 3; i++) { const p = (k.t * 0.6 + i / 3) % 1; k.px(14 + i * 12, 18 - Math.round(p * 10), "#fff4c2"); }
      } },
      { verse: 13, alt: "On a bronze platform Solomon spreads out his hands toward heaven and prays", draw: (k) => {
        k.scene("day", "none"); ground(k, "#c8b890", "#b0a078", 31, true);
        rays(k, 58, 14, 3);
        k.rect(50, 26, 17, 5, BRONZE); k.rect(50, 26, 17, 1, BRONZE_L);
        k.fig("Solomon", "praise", 54, 14);
        bronzeAltar(k, 96, 31, 14, 7);
        k.fig("Israelite", "kneel", 14, 23); k.fig("Israelite 2", "kneel", 28, 23); k.fig("priest", "stand", 78, 19, true);
      } },
      { verse: 18, alt: "Even the highest heavens cannot contain you, Solomon prays, much less this temple", draw: (k) => {
        k.scene("night", "none", { noMoon: true }); k.stars(30, "#fff8d0", 22);
        k.rect(0, 31, 128, 9, "#141c2c");
        temple(k, 70, 31, { w: 24, h: 9 });
        k.glow(82, 18, 4 + k.pulse(2, 1), "#7a6030");
        k.fig("Solomon", "praise", 36, 19);
      } },
      { verse: 26, alt: "When the sky is shut and there is no rain, the people pray toward this place", draw: (k) => {
        k.scene("famine", "desert");
        for (let x = 6; x < 128; x += 14) { k.line(x, 34, x + 4, 36, "#7a5030"); k.line(x + 4, 36, x + 7, 35, "#7a5030"); }
        temple(k, 92, 31, { w: 28, h: 10 });
        k.fig("farmer", "kneel", 50, 23); k.fig("farmer 2", "kneel", 64, 23);
        const cx = 20 + ((k.t * 4) % 40);
        k.cloud(cx, 6, 18, "#8a8a92", "#6a6a72");
        for (let i = 0; i < 4; i++) k.px(cx - 6 + i * 4, 10 + ((k.t * 10 + i * 3) % 8), "#9cc0f0");
      } },
      { verse: 32, alt: "A foreigner from a distant land comes to pray toward the temple", draw: (k) => {
        k.scene("day", "valley");
        temple(k, 92, 31, { w: 30, h: 11 });
        const x = 16 + ((k.t * 5) % 50);
        k.animal("donkey", x - 13, 24, false, true);
        k.fig("foreigner", "staff", x, 19);
      } },
    ],
    7: [
      { verse: 1, alt: "Fire comes down from heaven and burns up the offerings, and the Lord's glory fills the temple", draw: (k) => {
        k.scene("day", "none"); ground(k, "#c8b890", "#b0a078", 31, true);
        temple(k, 78, 31, { w: 44, glow: true });
        for (let y = 0; y < 23; y++) for (let x = 44; x < 54; x++) if ((x * 7 + y * 3 + k.f) % 3 !== 0) k.px(x + Math.round(Math.sin(y / 3 + k.t * 4)), y, y % 3 ? "#ffb03a" : "#ffe08a");
        bronzeAltar(k, 40, 31, 18, 8);
        k.fig("Solomon", "praise", 16, 19); k.fig("priest", "bow", 64, 25, true);
      } },
      { verse: 3, alt: "All Israel bow with their faces to the pavement: he is good, his love endures for ever", draw: (k) => {
        k.scene("day", "none"); ground(k, "#c8b890", "#b0a078", 31, true);
        temple(k, 84, 31, { w: 40, glow: true }); glory(k, 104, 7, 26);
        for (let i = 0; i < 6; i++) k.fig("Israelite " + i, "bow", 4 + i * 12, 25 + (i % 2));
        k.notes(40, 18, "#f7d154");
      } },
      { verse: 8, alt: "For seven days a vast crowd keeps the festival, their tents spread far and wide", draw: (k) => {
        k.scene("dusk", "hills");
        for (let i = 0; i < 6; i++) k.tent(2 + i * 21, 31 - (i % 2), 16, 8, ["#c8b08a", "#b89a74", "#d8c8a8"][i % 3]);
        k.fire(48, 32, 5); k.fire(92, 32, 5);
        k.fig("Israelite", "dance", 34, 20); k.fig("Israelite 2", "dance", 58, 20, true); k.fig("Israelite 3", "praise", 76, 20);
      } },
      { verse: 12, alt: "The Lord appears to Solomon at night: I have heard your prayer and chosen this place", draw: (k) => {
        k.room("palace"); k.lamp(108, 12);
        k.rect(28, 26, 32, 4, "#8a5a32"); k.rect(28, 25, 32, 1, "#d8c8a8"); k.rect(28, 30, 2, 2, "#6a4020"); k.rect(58, 30, 2, 2, "#6a4020");
        k.fig("Solomon", "lie", 36, 22);
        k.glow(46, 8, 9 + k.pulse(1.6, 2), "#c8a850");
        for (let y = 0; y < 12; y += 2) k.px(46 + (y % 4 ? 1 : 0), 10 + y, "#fff8d0");
      } },
      { verse: 14, alt: "If my people humble themselves and pray, I will forgive their sin and heal their land", draw: (k) => {
        k.scene("day", "field", { crop: "#4a8a3a", cropTop: "#8acf5a", sunX: 24 });
        rainbow(k, 92, 31, 24);
        for (let i = 0; i < 5; i++) k.px(60 + i * 13, 6 + ((k.t * 12 + i * 5) % 20), "#cfe8ff");
        k.fig("Israelite", "kneel", 30, 21); k.fig("Israelite 2", "kneel", 44, 21);
      } },
    ],
    8: [
      { verse: 4, alt: "Solomon builds Tadmor in the desert and strengthens his store cities", draw: (k) => {
        k.scene("noon", "desert");
        k.tree(8, 31, "palm"); k.tree(118, 31, "palm");
        k.city(64, 29, 40, 10);
        k.line(86, 31, 86, 10, "#7a5a32"); k.line(94, 31, 94, 10, "#7a5a32"); for (let y = 12; y < 31; y += 6) k.line(86, y, 94, y, "#7a5a32");
        k.fig("builder", "stand", 87, 4); hammer(k, 87, 4);
        const x = 14 + ((k.t * 7) % 22); k.fig("carrier", "run", x, 19); k.rect(x + 1, 16, 6, 3, STONE);
      } },
      { verse: 11, alt: "Pharaoh's daughter moves from the City of David to the palace Solomon built for her", draw: (k) => {
        k.scene("day", "city", { cityX: 24, cityW: 40 });
        k.palace(84, 31, 38, 18); k.flag(103, 13, "#3a8ad0");
        const x = 46 + ((k.t * 4) % 26);
        k.fig("maid", "stand", x - 11, 19); k.fig("Pharaoh's daughter", "stand", x, 19);
      } },
      { verse: 13, alt: "Offerings rise every day, on the Sabbaths, the new moons and the three yearly festivals", draw: (k) => {
        k.scene("dusk", "none", { sunX: 120 }); ground(k, "#8a7a68", "#6a5a4a", 31, true);
        k.disc(96, 8, 3, "#f4f0d8"); k.disc(97, 7, 3, "#2b1d4a");
        temple(k, 6, 31, { w: 40 });
        bronzeAltar(k, 58, 31, 14, 7);
        k.fig("priest", "stand", 80, 19, true); k.animal("sheep", 92, 27, true, true);
      } },
      { verse: 14, alt: "Priests and Levites take their turns of duty, and gatekeepers stand at every gate", draw: (k) => {
        k.scene("day", "city", { cityX: 64, cityW: 100 });
        k.fig("gatekeeper", "spear", 50, 19); k.fig("gatekeeper 2", "spear", 70, 19, true);
        k.fig("Levite", "stand", 18, 19); k.scroll(26, 25);
        k.fig("priest", "stand", 100 - ((k.t * 4) % 16), 19, true);
      } },
      { verse: 17, alt: "At Ezion-Geber on the Red Sea, Hiram's sailors set out with Solomon's men for Ophir", draw: (k) => {
        k.scene("dawn", "none", { sunX: 98 });
        water(k, 29); k.rect(0, 26, 30, 14, "#6a5a48"); k.rect(30, 27, 18, 2, "#8a5a32"); k.rect(32, 29, 2, 6, "#6a4020"); k.rect(44, 29, 2, 6, "#6a4020");
        k.fig("sailor", "stand", 14, 15);
        ship(k, 50 + ((k.t * 4) % 40), 22, false, "#e8d8b8"); ship(k, 86 + ((k.t * 3) % 30), 23);
      } },
    ],
    9: [
      { verse: 1, alt: "The Queen of Sheba arrives in Jerusalem with camels carrying spices, gold and jewels", draw: (k) => {
        k.scene("day", "desert"); k.city(106, 28, 38, 10);
        const p = (k.t * 5) % 24;
        camel(k, 2 + p, 22, false, "#c8504a"); camel(k, 22 + p, 22, false, GOLD);
        k.fig("Queen of Sheba", "stand", 40 + p, 19); k.fig("servant", "staff", 50 + p, 19);
      } },
      { verse: 3, alt: "The Queen of Sheba sees Solomon's wisdom, his palace and the food on his table, and is overwhelmed", draw: (k) => {
        k.room("palace"); k.lamp(64, 8);
        k.throne(10, 31); k.fig("Solomon", "sit", 12, 21); talk(k, 22, 10);
        k.fig("Queen of Sheba", "stand", 40, 19, true);
        k.rect(58, 27, 40, 3, "#8a5a32");
        for (let i = 0; i < 5; i++) k.disc(62 + i * 8, 26, 2, ["#e0a96d", "#c8504a", "#d8c070", "#8ab060", "#e0a96d"][i]);
        k.fig("cupbearer", "stand", 104, 19, true); k.rect(101, 24, 2, 2, GOLD);
        for (let i = 0; i < 2; i++) k.px(101, 26 + ((k.t * 8 + i * 2) % 4), "#a8305a");
      } },
      { verse: 9, alt: "She gives the king great amounts of gold, spices and precious stones", draw: (k) => {
        k.room("palace"); k.lamp(20, 8); k.lamp(108, 8);
        k.fig("Queen of Sheba", "stand", 18, 19); k.fig("servant", "bow", 32, 25);
        for (let i = 0; i < 3; i++) {
          const x = 46 + i * 12; k.rect(x, 25, 9, 5, "#7a4a28"); k.rect(x, 24, 9, 1, GOLD_D);
          k.rect(x + 1, 23, 7, 1, ["#f2c230", "#c8504a", "#5aa0d8"][i]);
          if ((k.f + i * 4) % 10 === 0) k.px(x + 3, 22, "#ffffff");
        }
        jar(k, 84, 25, "#c08a50");
        k.fig("Solomon", "stand", 98, 19, true);
      } },
      { verse: 17, alt: "Solomon's great ivory throne covered with gold, lions on its six steps, gold shields on the walls", draw: (k) => {
        k.room("palace"); k.lamp(14, 14); k.lamp(114, 14);
        for (let i = 0; i < 5; i++) { k.disc(10 + i * 27, 5, 2, GOLD); k.px(9 + i * 27, 4, GOLD_L); }
        for (let i = 0; i < 6; i++) {
          k.rect(34 + i * 3, 29 - i * 2, 60 - i * 6, 2, i % 2 ? "#f2ece0" : "#e0d8c4");
          for (const lx of [34 + i * 3, 91 - i * 3]) { k.px(lx, 28 - i * 2, GOLD); k.px(lx + 1, 28 - i * 2, GOLD_D); }
        }
        k.rect(56, 6, 16, 13, "#f2ece0"); k.rect(56, 6, 16, 1, GOLD); k.rect(58, 4, 12, 2, GOLD);
        k.fig("Solomon", "sit", 60, 9);
        k.glow(64, 12, 14 + k.pulse(1.2, 2), "#7a6030");
      } },
      { verse: 21, alt: "Every three years the ships come home with gold, silver, ivory, apes and peacocks", draw: (k) => {
        k.scene("day", "none");
        water(k, 29); k.rect(0, 28, 44, 12, "#c8b890"); k.rect(40, 27, 20, 2, "#8a5a32");
        ship(k, 64 + ((k.t * 3) % 40), 22);
        peacock(k, 12, 30); ape(k, 24, 23); ape(k, 30, 24);
        k.line(34, 27, 38, 23, "#f2ece0"); k.line(36, 27, 40, 24, "#f2ece0");
        for (let i = 0; i < 3; i++) k.disc(48 + i * 4, 25, 1, i % 2 ? "#d8dce4" : GOLD);
      } },
    ],
    10: [
      { verse: 3, alt: "Jeroboam and all Israel come to Rehoboam at Shechem: lighten the heavy yoke your father put on us", draw: (k) => {
        k.scene("day", "city", { cityX: 104, cityW: 40 });
        k.fig("Rehoboam", "stand", 74, 19, true);
        k.fig("Jeroboam", "stand", 50, 19); talk(k, 56, 8);
        for (let i = 0; i < 3; i++) k.fig("Israelite " + i, "stand", 6 + i * 12, 20 + (i % 2));
        k.rect(58, 30, 12, 2, "#7a5a32"); k.px(59, 29, "#7a5a32"); k.px(68, 29, "#7a5a32");
      } },
      { verse: 6, alt: "Rehoboam asks the old men who had served his father Solomon for their advice", draw: (k) => {
        k.room("palace"); k.lamp(44, 8);
        k.throne(14, 31); k.fig("Rehoboam", "sit", 16, 21);
        k.fig("old advisor", "staff", 62, 19, true); k.fig("old advisor 2", "staff", 80, 19, true);
        talk(k, 54, 8);
      } },
      { verse: 8, alt: "But he turns to the young men who grew up with him and takes their harsh advice", draw: (k) => {
        k.room("palace"); k.lamp(100, 8);
        k.fig("Rehoboam", "stand", 24, 19);
        k.fig("young man", "dance", 54, 20); k.fig("young man 2", "stand", 70, 19, true); k.fig("young man 3", "praise", 86, 19);
        talk(k, 64, 7);
      } },
      { verse: 16, alt: "All Israel cries, To your tents, O Israel! and goes home", draw: (k) => {
        k.scene("dusk", "hills");
        k.tent(92, 31, 16, 8); k.tent(110, 31, 14, 7, "#b89a74");
        for (let i = 0; i < 3; i++) k.fig("Israelite " + i, "run", 40 + ((i * 18 + k.t * 7) % 56), 19);
        k.fig("Rehoboam", "stand", 12, 19);
      } },
      { verse: 18, alt: "Rehoboam hurries into his chariot and flees to Jerusalem", draw: (k) => {
        k.scene("dusk", "valley"); k.city(110, 26, 28, 9, true);
        k.stones(4, 34, 6);
        chariot(k, 16 + ((k.t * 12) % 60), 32, false, "Rehoboam");
      } },
    ],
    11: [
      { verse: 1, alt: "Rehoboam gathers a hundred and eighty thousand soldiers to fight against Israel", draw: (k) => {
        k.scene("day", "hills"); k.flag(4, 31, "#db2777");
        k.fig("Rehoboam", "sword", 12, 19);
        for (let i = 0; i < 6; i++) k.fig("soldier " + i, "spear", 32 + i * 15, 19 + (i % 2));
      } },
      { verse: 4, alt: "The prophet Shemaiah says, Do not fight your brothers, and the soldiers go home", draw: (k) => {
        k.scene("dusk", "hills");
        k.fig("Shemaiah", "staff", 18, 19); talk(k, 26, 7);
        for (let i = 0; i < 3; i++) k.fig("soldier " + i, "run", 44 + ((i * 26 + k.t * 6) % 80), 19);
      } },
      { verse: 5, alt: "Rehoboam builds strong cities in Judah and fills them with shields, spears, food, oil and wine", draw: (k) => {
        k.scene("day", "city", { cityX: 36, cityW: 50 });
        k.fig("Rehoboam", "stand", 70, 19);
        for (let i = 0; i < 3; i++) jar(k, 84 + i * 6, 26, i % 2 ? "#8a3a3a" : "#b06a3a");
        for (let i = 0; i < 2; i++) { k.disc(106 + i * 6, 27, 2, BRONZE); k.line(116 + i * 3, 31, 116 + i * 3, 15, "#8a6a3a"); k.px(116 + i * 3, 14, "#d8dce4"); }
        const y = 20 + Math.abs(k.pulse(2, 3)); k.rect(98, y - 6, 4, 3, "#c8a060");
      } },
      { verse: 13, alt: "Priests and Levites leave their homes all over Israel and come to Judah and Jerusalem", draw: (k) => {
        k.scene("dawn", "hills"); k.city(108, 28, 32, 10);
        for (let i = 0; i < 3; i++) {
          const x = ((i * 28 + k.t * 5) % 84) - 4;
          k.fig("Levite " + i, "staff", x, 19); k.rect(x - 2, 23, 3, 4, "#a88a64");
        }
      } },
      { verse: 22, alt: "Rehoboam makes Maakah's son Abijah chief prince among his brothers", draw: (k) => {
        k.room("palace"); k.lamp(64, 6);
        k.throne(8, 31); k.fig("Rehoboam", "sit", 10, 21);
        k.fig("Maakah", "stand", 30, 19);
        k.glow(57, 18, 8 + k.pulse(2, 1), "#7a6030"); k.fig("Abijah", "front", 52, 19);
        k.fig("brother", "bow", 76, 25, true); k.fig("brother 2", "bow", 90, 25, true); k.fig("brother 3", "child", 106, 24, true);
      } },
    ],
    12: [
      { verse: 2, alt: "King Shishak of Egypt comes up against Jerusalem with twelve hundred chariots", draw: (k) => {
        k.scene("noon", "desert");
        for (let i = 0; i < 3; i++) {
          const x = 130 - ((i * 46 + k.t * 10) % 170);
          chariot(k, x, 32, true, i === 1 ? "Shishak" : "Egyptian " + i);
          k.disc(x + 18, 29, 2 + (k.f % 2), "#e8d8b0");
        }
      } },
      { verse: 5, alt: "Shemaiah warns Rehoboam, and the king and the leaders humble themselves before the Lord", draw: (k) => {
        k.room("palace"); k.lamp(64, 8);
        k.fig("Shemaiah", "staff", 96, 19, true); talk(k, 86, 7);
        k.fig("Rehoboam", "kneel", 50, 22); k.crown(62, 28);
        k.fig("leader", "kneel", 16, 22); k.fig("leader 2", "kneel", 30, 22);
      } },
      { verse: 9, alt: "Shishak carries off the temple treasures and all of Solomon's gold shields", draw: (k) => {
        k.scene("day", "none"); ground(k, "#c8b890", "#b0a078", 31, true);
        temple(k, 4, 31, { w: 40 });
        for (let i = 0; i < 3; i++) {
          const x = 50 + ((i * 26 + k.t * 6) % 78);
          k.fig("Egyptian " + i, "run", x, 19); k.disc(x + 3, 23, 2, GOLD); k.px(x + 2, 22, GOLD_L);
        }
      } },
      { verse: 10, alt: "Rehoboam makes bronze shields in their place, and the guards carry them when he goes to the temple", draw: (k) => {
        k.scene("day", "none"); ground(k, "#c8b890", "#b0a078", 31, true);
        temple(k, 82, 31, { w: 42 });
        for (let i = 0; i < 3; i++) { k.fig("guard " + i, "spear", 8 + i * 14, 19); k.disc(13 + i * 14, 25, 2, BRONZE); k.px(12 + i * 14, 24, BRONZE_L); }
        k.fig("Rehoboam", "stand", 52 + ((k.t * 3) % 14), 19);
      } },
    ],
    13: [
      { verse: 4, alt: "Abijah stands on Mount Zemaraim and calls out to Jeroboam and all Israel", draw: (k) => {
        k.scene("day", "mountains");
        k.ridge((x) => 17 + Math.abs(x - 24) * 0.4, "#5a8a3e", 40, 0, 60);
        k.fig("Abijah", "stand", 20, 5); talk(k, 28, 1);
        k.fig("soldier of Judah", "spear", 38, 20); k.fig("soldier of Judah 2", "spear", 50, 20);
        k.fig("Jeroboam", "stand", 86, 19, true);
        for (let i = 0; i < 3; i++) k.fig("soldier of Israel " + i, "spear", 96 + i * 10, 19 + (i % 2), true);
      } },
      { verse: 10, alt: "We have not left the Lord: the priests burn incense and light the gold lampstand every evening", draw: (k) => {
        sanctuary(k); menorah(k, 26, 23);
        k.rect(42, 25, 20, 2, GOLD); k.rect(43, 27, 2, 3, GOLD_D); k.rect(59, 27, 2, 3, GOLD_D);
        for (let i = 0; i < 4; i++) k.rect(44 + i * 4, 23, 3, 2, "#e0b070");
        k.rect(78, 22, 8, 8, GOLD); k.rect(77, 21, 10, 1, GOLD_L); k.smoke(82, 18);
        k.fig("priest", "stand", 92, 19, true);
      } },
      { verse: 14, alt: "Surrounded front and back, Judah cries out to the Lord and the priests blow the trumpets", draw: (k) => {
        k.scene("day", "valley");
        rays(k, 60, 18, 3);
        k.fig("soldier of Israel", "spear", 2, 20); k.fig("soldier of Israel 2", "spear", 14, 19);
        k.fig("priest", "trumpet", 38, 19); k.fig("Abijah", "praise", 56, 19); k.fig("priest 2", "trumpet", 76, 19, true);
        k.fig("soldier of Israel 3", "spear", 106, 19, true); k.fig("soldier of Israel 4", "spear", 118, 20, true);
      } },
      { verse: 16, alt: "Israel's army runs away before Judah, because God gives Judah the victory", draw: (k) => {
        k.scene("dusk", "hills");
        k.flag(8, 31, "#db2777"); k.fig("Abijah", "sword", 16, 19); k.fig("soldier of Judah", "spear", 28, 19);
        k.disc(58, 32, 2, "#7a6a50"); k.line(66, 32, 74, 30, "#8a6a3a");
        for (let i = 0; i < 3; i++) k.fig("soldier of Israel " + i, "run", 70 + ((i * 22 + k.t * 9) % 64), 19);
      } },
    ],
    14: [
      { verse: 3, alt: "Asa removes the foreign altars, smashes the sacred stones and cuts down the Asherah poles", draw: (k) => {
        k.scene("day", "hills");
        k.rect(66, 27, 36, 4, "#8a8070"); k.rect(70, 15, 4, 12, "#6a6050"); k.stones(78, 27, 5);
        const p = Math.min(1, (k.t % 5) / 2.5), ang = p * p * 1.4;
        const tx = 94 + Math.sin(ang) * 16, ty = 27 - Math.cos(ang) * 16;
        k.line(94, 27, tx, ty, "#6a4a2a"); k.line(95, 27, tx + 1, ty, "#6a4a2a"); k.disc(tx, ty, 1, "#8a6a3a");
        k.fig("worker", "stand", 50, 19); hammer(k, 50, 19);
        k.fig("Asa", "stand", 18, 19);
      } },
      { verse: 7, alt: "In the years of peace Asa builds towns with walls, towers, gates and bars", draw: (k) => {
        k.scene("day", "valley"); k.birds(3, 5);
        k.rect(40, 18, 50, 13, "#7a6a58"); for (let x = 40; x < 90; x += 4) k.rect(x, 16, 2, 2, "#7a6a58");
        k.rect(84, 10, 10, 21, "#5a4c40"); for (let x = 84; x < 94; x += 3) k.rect(x, 8, 2, 2, "#5a4c40");
        k.rect(60, 22, 9, 9, "#2a2018"); for (let x = 61; x < 69; x += 2) k.line(x, 22, x, 30, "#8a8a92");
        k.fig("builder", "stand", 74, 6); hammer(k, 74, 6);
        k.fig("Asa", "stand", 14, 19);
      } },
      { verse: 9, alt: "Zerah of Ethiopia comes against Judah with a huge army and three hundred chariots", draw: (k) => {
        k.scene("dusk", "valley");
        for (let x = 60; x < 128; x += 3) { const y = 22 + Math.round(Math.sin(x / 9)); k.line(x, y, x, y + 3, "#3a2244"); k.px(x, y - 1, "#d8dce4"); }
        k.fig("soldier", "spear", 64, 19, true); k.fig("soldier 2", "spear", 76, 20, true);
        chariot(k, 92, 32, true, "Zerah");
        k.fig("Asa", "stand", 10, 19); k.fig("soldier of Judah", "spear", 22, 19);
      } },
      { verse: 11, alt: "Asa cries out: Lord, there is no one like you to help the weak against the strong", draw: (k) => {
        k.scene("dawn", "valley");
        for (let x = 92; x < 128; x += 3) k.line(x, 23, x, 27, "#2a2236");
        rays(k, 56, 20, 4);
        k.fig("Asa", "kneel", 52, 22); k.fig("soldier of Judah", "kneel", 30, 22); k.fig("soldier of Judah 2", "kneel", 16, 22);
      } },
      { verse: 15, alt: "Judah comes home to Jerusalem with great flocks of sheep and camels", draw: (k) => {
        k.scene("day", "hills"); k.city(110, 28, 28, 9);
        const p = (k.t * 5) % 20;
        camel(k, 6 + p, 22);
        for (let i = 0; i < 4; i++) k.animal("sheep", 26 + p + i * 9, 27 + (i % 2), false, true);
        k.fig("soldier of Judah", "staff", 66 + p, 19);
      } },
    ],
    15: [
      { verse: 2, alt: "The Spirit of God comes on Azariah, who tells Asa: the Lord is with you while you are with him", draw: (k) => {
        k.scene("day", "valley");
        k.fig("soldier", "spear", 6, 19); k.fig("soldier 2", "spear", 18, 20);
        k.fig("Asa", "stand", 34, 19);
        k.glow(78, 24, 9 + k.pulse(2, 2), "#fff4c2"); k.fig("Azariah", "staff", 74, 19, true); talk(k, 64, 7);
      } },
      { verse: 8, alt: "Asa takes courage, gets rid of the idols and repairs the Lord's altar in front of the temple", draw: (k) => {
        k.scene("day", "none"); ground(k, "#c8b890", "#b0a078", 31, true);
        temple(k, 78, 31, { w: 46 });
        k.stones(6, 33, 9);
        bronzeAltar(k, 40, 31, 16, 8);
        k.fig("mason", "stand", 24, 19); hammer(k, 24, 19);
        k.fig("Asa", "stand", 62, 19, true);
      } },
      { verse: 14, alt: "The people promise with a loud shout, with trumpets and rams' horns, to seek the Lord", draw: (k) => {
        k.scene("day", "city", { cityX: 106, cityW: 36 });
        k.fig("Israelite", "horn", 6, 19); k.fig("Israelite 2", "praise", 20, 19); k.fig("Asa", "praise", 36, 19);
        k.fig("priest", "trumpet", 52, 19); k.fig("Israelite 3", "praise", 70, 19);
        k.notes(30, 14, "#f7d154");
      } },
      { verse: 16, alt: "Asa cuts down Maakah's idol and burns it beside the Kidron brook", draw: (k) => {
        k.scene("night", "valley");
        k.rect(0, 35, 128, 2, "#2c5a8c"); for (let x = 0; x < 128; x += 7) k.px((x + k.t * 5) % 128, 35, "#9cc0f0");
        k.glow(64, 26, 13 + k.pulse(3, 1), "#6a3a18");
        k.line(52, 31, 74, 26, "#5a3a1e"); k.fire(64, 31, 14); k.smoke(64, 22);
        k.fig("Asa", "stand", 30, 19); k.fig("Maakah", "stand", 100, 19, true);
      } },
      { verse: 19, alt: "No more war comes to Judah until the thirty-fifth year of Asa's reign", draw: (k) => {
        k.scene("day", "field", { crop: "#6a9a3a", cropTop: "#b0c060" });
        k.birds(3, 6); k.city(108, 26, 26, 8); k.flag(108, 14, "#db2777");
        const x = 24 + ((k.t * 4) % 40);
        k.animal("ox", x + 10, 24, false, true); k.line(x + 6, 27, x + 10, 26, "#7a5a32");
        k.fig("farmer", "stand", x, 18);
      } },
    ],
    16: [
      { verse: 1, alt: "King Baasha of Israel fortifies Ramah to stop anyone going in or out of Judah", draw: (k) => {
        k.scene("day", "hills");
        k.rect(48, 15, 32, 16, "#7a6a58"); for (let x = 48; x < 80; x += 4) k.rect(x, 13, 2, 2, "#7a6a58"); k.rect(60, 23, 8, 8, "#2a2018");
        k.fig("Baasha", "spear", 86, 19, true); k.fig("builder", "stand", 66, 1); hammer(k, 66, 1);
        k.fig("traveller", "run", 30 - ((k.t * 6) % 30), 19, true);
      } },
      { verse: 2, alt: "Asa sends silver and gold from the temple treasury to Ben-Hadad in Damascus", draw: (k) => {
        k.scene("day", "hills"); k.city(108, 28, 32, 10);
        const p = (k.t * 5) % 30;
        for (let i = 0; i < 2; i++) { const x = 6 + p + i * 24; k.animal("donkey", x, 24, false, true); k.rect(x + 2, 21, 5, 3, i ? "#d8dce4" : GOLD); }
        k.fig("messenger", "staff", 56 + p, 19);
      } },
      { verse: 9, alt: "The eyes of the Lord search the whole earth to strengthen those whose hearts are fully his", draw: (k) => {
        k.scene("night", "hills", { noMoon: true });
        k.city(24, 28, 22, 7, true); k.tent(96, 31, 16, 8, "#6a5a48");
        const ex = 64 + Math.sin(k.t * 0.6) * 54;
        for (let i = -2; i <= 2; i++) k.line(64, 0, ex + i * 4, 31, i % 2 ? "#5a5440" : "#8a8050");
        k.glow(ex, 28, 7, "#fff4c2");
        k.fig("faithful man", "praise", 60, 19);
      } },
      { verse: 10, alt: "Angry at the seer Hanani's warning, Asa puts him in prison", draw: (k) => {
        k.room("house"); k.lamp(40, 8);
        k.rect(68, 6, 50, 24, "#1a1a22");
        k.fig("Hanani", "sit", 88, 20, true);
        for (let x = 68; x < 118; x += 4) k.rect(x, 6, 1, 24, "#7a7a84");
        k.rect(68, 6, 50, 1, "#7a7a84");
        k.fig("Asa", "stand", 30, 19);
      } },
      { verse: 14, alt: "Asa is laid in the tomb he cut for himself, among spices, and a great fire is lit in his honour", draw: (k) => {
        k.scene("dusk", "mountains");
        k.rect(0, 10, 40, 22, "#4a3a4a"); k.ridge((x) => 10 - Math.sin(x / 6) * 2, "#4a3a4a", 12, 0, 40);
        k.rect(14, 21, 10, 10, "#1a1218"); k.disc(19, 21, 5, "#1a1218");
        k.glow(70, 26, 12 + k.pulse(3, 1), "#7a4020"); k.fire(70, 31, 14); k.smoke(70, 22);
        jar(k, 46, 26, "#c08a50");
        k.fig("mourner", "weep", 92, 19, true); k.fig("mourner 2", "weep", 106, 19, true);
      } },
    ],
    17: [
      { verse: 1, alt: "Jehoshaphat makes Judah strong and puts soldiers in all its walled cities", draw: (k) => {
        k.scene("day", "city", { cityX: 76, cityW: 76 });
        k.fig("soldier", "spear", 52, 2); k.fig("soldier 2", "spear", 92, 2, true);
        k.flag(8, 31, "#db2777"); k.fig("Jehoshaphat", "stand", 16, 19);
      } },
      { verse: 5, alt: "All Judah brings gifts to Jehoshaphat, and he has great riches and honour", draw: (k) => {
        k.room("palace"); k.lamp(64, 8);
        k.throne(10, 31); k.fig("Jehoshaphat", "sit", 12, 21);
        k.fig("man of Judah", "bow", 36, 25, true);
        k.fig("woman of Judah", "stand", 70, 19, true); jar(k, 66, 24, "#c08a50");
        k.fig("man of Judah 2", "stand", 92, 19, true);
        for (let i = 0; i < 5; i++) { k.disc(48 + i * 3, 29 - (i % 2) * 2, 1, i % 2 ? "#d8dce4" : GOLD); if ((k.f + i * 3) % 13 === 0) k.px(48 + i * 3, 27, "#ffffff"); }
      } },
      { verse: 9, alt: "Officials and Levites go through the towns of Judah teaching from the Book of the Law", draw: (k) => {
        k.scene("day", "hills"); k.tree(10, 31);
        k.fig("Levite", "stand", 34, 19); k.scroll(42, 23); talk(k, 42, 10);
        k.fig("villager", "sit", 64, 21, true); k.fig("villager 2", "sit", 78, 21, true); k.fig("villager 3", "sit", 92, 21, true);
        k.fig("child of Judah", "child", 106, 24, true);
      } },
      { verse: 11, alt: "Philistines bring silver, and Arabs bring flocks of seven thousand seven hundred rams and goats", draw: (k) => {
        k.scene("noon", "desert"); k.city(18, 28, 30, 9);
        const p = (k.t * 5) % 16;
        for (let i = 0; i < 4; i++) {
          const x = 44 - p + i * 10, y = 27 + (i % 2);
          if (i % 2) k.sprite(_SC_ANIMAL.sheep.rows, { w: "#5a4a3a", k: "#2a1a10" }, x, y, true); else k.animal("sheep", x, y, true, true);
        }
        k.fig("Arab herder", "staff", 86 - p, 19, true); camel(k, 98 - p, 22, true);
        k.fig("Philistine", "stand", 118, 19, true); k.disc(116, 25, 1, "#d8dce4");
      } },
    ],
    18: [
      { verse: 9, alt: "Ahab and Jehoshaphat sit on their thrones at Samaria's gate while Zedekiah waves iron horns", draw: (k) => {
        k.scene("day", "city", { cityX: 70, cityW: 100 });
        k.throne(4, 31); k.fig("Ahab", "sit", 6, 21);
        k.throne(22, 31); k.fig("Jehoshaphat", "sit", 24, 21);
        const y = 19 - (Math.floor(k.t * 4) % 2);
        k.fig("Zedekiah", "stand", 54, y, true); k.line(55, y + 1, 53, y - 3, "#8a8a92"); k.line(59, y + 1, 61, y - 3, "#8a8a92");
        k.fig("prophet", "praise", 72, 19); k.fig("prophet 2", "praise", 88, 19); k.fig("prophet 3", "praise", 104, 19);
      } },
      { verse: 16, alt: "Micaiah sees all Israel scattered on the hills like sheep without a shepherd", draw: (k) => {
        k.scene("dusk", "mountains");
        for (let i = 0; i < 6; i++) k.animal("sheep", 8 + i * 20 + Math.round(Math.sin(k.t * 0.7 + i) * 3), 26 + (i % 3) * 2, i % 2 === 0, true);
        k.line(58, 34, 70, 31, "#7a5a32"); k.px(70, 30, "#7a5a32");
      } },
      { verse: 18, alt: "Micaiah sees the Lord on his throne with all the host of heaven standing to his right and left", draw: (k) => {
        k.scene("night", "none", { noMoon: true });
        for (let i = 0; i < 6; i++) k.cloud(i * 24 + 6, 34, 26, "#d8d4e8", "#b8b4cc");
        k.glow(64, 16, 18 + k.pulse(1.2, 2), "#fff4c2");
        k.rect(56, 10, 16, 18, "#fff8d0"); k.rect(56, 10, 16, 2, GOLD); k.rect(54, 22, 20, 3, GOLD_L); k.disc(64, 8, 3, "#ffffff");
        k.angel(18, 10); k.angel(98, 10);
      } },
      { verse: 31, alt: "Jehoshaphat cries out, and the Lord helps him and turns the chariot officers away", draw: (k) => {
        k.scene("day", "valley");
        rays(k, 24, 16, 3);
        chariot(k, 14, 32, false, "Jehoshaphat", "praise");
        for (let i = 0; i < 2; i++) chariot(k, 62 + ((i * 34 + k.t * 10) % 70), 32, false, "Syrian officer " + i);
      } },
      { verse: 34, alt: "The battle lasts all day, and at sunset Ahab's chariot stands still on the field", draw: (k) => {
        k.scene("dusk", "hills", { sunX: 64 });
        k.birds(3, 6, "#2a1832");
        chariot(k, 46, 32, false, "Ahab", "sit");
        k.line(14, 33, 24, 31, "#5a3a22"); k.disc(96, 33, 2, "#5a4a40"); k.flag(110, 32, "#5a5a62");
      } },
    ],
  };

  for (const [ch, scenes] of Object.entries(NR)) {
    if (typeof _NR_SCENES !== "undefined") _NR_SCENES["2CH-" + ch] = scenes;
  }
})();
