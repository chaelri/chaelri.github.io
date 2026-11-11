// 16-scenes-1ch.js — the 8-bit scene banners for 1 Chronicles.
//
// Built on the scene kit in 13-scenes-2sa.js (k.scene, k.fig, k.tent, k.ark,
// k.altar, ...). Chapters 1-9 are family lists, so their banners show what the
// lists are about: family trees, tribes and their lands, priests, singers and
// gatekeepers, the exile and the return. Chapters 10-29 follow the story from
// Saul's death to Solomon on the throne. Scenes are keyed by the verse they
// open on. Deaths and battles are shown by their setting or aftermath, never
// the act. Everything sits inside one IIFE so no name leaks into the shared
// script scope.

(function () {
  // ── Local props (the shared kit is never modified) ─────────────────────────
  const GOLD = "#f7d154", WOOD = "#8a5a32", DARKWOOD = "#5c3a1e", LINEN = "#e8e0d0";

  // A chain of names: dots that light up one generation at a time.
  function lineage(k, x0, y0, n, dx, dy) {
    const on = Math.floor(k.t * 3) % (n + 4);
    for (let i = 0; i < n; i++) {
      const x = x0 + i * dx, y = y0 + i * dy;
      if (i) k.line(x - dx + 2, y - dy, x - 2, y, "#8a7a5a");
      k.disc(x, y, 1, i <= on ? GOLD : "#6a5a40");
    }
  }

  // A family tree: one root, doubling each generation, lit from the root up.
  function famTree(k, cx, base, depth, w, c = "#8a6a3a") {
    const lit = Math.floor(k.t * 1.5) % (depth + 2);
    let prev = [cx];
    const rows = [];
    for (let d = 1; d <= depth; d++) {
      const n = 2 ** d, y = base - d * 7, row = [];
      for (let i = 0; i < n; i++) row.push(Math.round(cx - w / 2 + (w * (i + 0.5)) / n));
      row.forEach((x, i) => k.line(prev[i >> 1], y + 6, x, y + 1, c));
      rows.push([row, y, d]);
      prev = row;
    }
    for (const [row, y, d] of rows) row.forEach((x) => k.disc(x, y, 1, d <= lit ? GOLD : "#e8dcc0"));
    k.disc(cx, base, 2, GOLD);
  }

  function boat(k, x, y, w = 26) {
    k.rect(x, y, w, 4, "#6a4428");
    k.rect(x + 2, y + 4, w - 4, 2, "#5a3820");
    for (let i = 2; i < w; i += 4) k.px(x + i, y + 1, "#8a5a32");
    k.rect(x + 7, y - 5, w - 14, 5, WOOD);
    k.rect(x + 6, y - 6, w - 12, 1, "#5a3820");
    k.px(x + Math.round(w / 2), y - 3, "#ffd27a");
  }

  function rainbow(k, cx, cy, r) {
    ["#d84a4a", "#f2a03a", "#f2d24a", "#5aaa4a", "#4a7ac8", "#7a4ab8"].forEach((c, i) => {
      for (let a = 0; a <= Math.PI; a += 0.015) k.px(cx + Math.cos(a) * (r - i), cy - Math.sin(a) * (r - i) * 0.8, c);
    });
  }

  const CAMEL = [
    "........hh", "...hh...hk", "..hhhh..h.", ".hhhhhhhh.", "hhhhhhhh..", ".h.h..h.h.", ".h.h..h.h.",
  ];
  function camel(k, x, y, flip = false, walk = false) {
    const bob = walk && Math.floor(k.t * 3) % 2 ? -1 : 0;
    k.sprite(CAMEL, { h: "#c89a5a", k: "#3a2a1a" }, x, y + bob, flip);
  }

  function pot(k, x, base, c) {
    k.disc(x, base - 3, 3, c);
    k.rect(x - 1, base - 8, 3, 2, c);
    k.rect(x - 2, base - 8, 5, 1, "#7a4a2a");
    k.px(x - 1, base - 4, "#e8b890");
  }

  function bow(k, x, y) {
    for (let j = -4; j <= 4; j++) k.px(x + Math.round(2 - (j * j) / 8), y + j, WOOD);
    k.line(x, y - 4, x, y + 4, "#e8dcc0");
  }

  function lots(k, x, y) {
    for (let j = 0; j < 2; j++) {
      const p = (k.t * 1.1 + j * 0.35) % 1, h = Math.round(Math.sin(p * Math.PI) * 7);
      k.rect(x + j * 3, y - h, 2, 2, j ? "#e8dcc0" : "#c9a046");
    }
  }

  function torch(k, x, y) {
    k.rect(x, y, 1, 5, DARKWOOD);
    k.glow(x, y - 2, 5 + (k.f % 4 < 2 ? 0 : 1), "#6a4a20");
    k.fire(x + 1, y, 3);
  }

  // A gatehouse 24 wide; `open` 0..1 slides the doors apart.
  function gate(k, x, base, open = 0, inside = "#2a1a10") {
    k.rect(x, base - 20, 24, 20, "#8a7a62");
    for (let i = 0; i < 24; i += 4) k.rect(x + i, base - 22, 2, 2, "#8a7a62");
    for (let y = base - 18; y < base; y += 4) k.rect(x, y, 24, 1, "#7a6a54");
    k.rect(x + 6, base - 14, 12, 14, inside);
    const w = Math.round(6 * (1 - open));
    if (w > 0) { k.rect(x + 6, base - 14, w, 14, "#6a4428"); k.rect(x + 18 - w, base - 14, w, 14, "#6a4428"); }
  }

  function menorah(k, x, base) {
    k.rect(x - 2, base - 1, 5, 1, "#c9a046");
    k.rect(x, base - 9, 1, 8, "#c9a046");
    k.rect(x - 6, base - 5, 13, 1, "#c9a046");
    for (let i = -3; i <= 3; i++) {
      k.rect(x + i * 2, base - 9, 1, 4, "#c9a046");
      k.px(x + i * 2, base - 10 - ((k.f + i) % 3 === 0 ? 1 : 0), (k.f + i) % 2 ? "#ffd27a" : "#ff9a3c");
    }
    k.glow(x, base - 10, 6, "#6a5a30");
  }

  function incense(k, x, base) {
    k.rect(x, base - 7, 7, 7, "#e8b830");
    k.rect(x, base - 7, 7, 1, "#fff0a0");
    k.px(x, base - 8, GOLD); k.px(x + 6, base - 8, GOLD);
    k.smoke(x + 3, base - 9);
  }

  function breadTable(k, x, base) {
    k.rect(x, base - 7, 16, 2, "#e8b830");
    k.rect(x + 1, base - 5, 1, 5, "#c9a046"); k.rect(x + 14, base - 5, 1, 5, "#c9a046");
    for (let i = 0; i < 3; i++) { k.rect(x + 2, base - 9 - i * 2, 5, 2, "#d8a868"); k.rect(x + 9, base - 9 - i * 2, 5, 2, "#d8a868"); }
  }

  // Materials for the temple: dressed stone, cedar logs, gold and bronze.
  function stoneBlocks(k, x, base, rows = 3) {
    for (let r = 0; r < rows; r++) for (let j = 0; j < rows - r; j++) {
      const bx = x + j * 6 + r * 3, by = base - 4 - r * 4;
      k.rect(bx, by, 5, 4, r % 2 ? "#b8aa90" : "#a89a80"); k.rect(bx, by + 3, 5, 1, "#7a6e5a");
    }
  }
  function logs(k, x, base, n = 3) {
    for (let r = 0; r < n; r++) for (let j = 0; j < n - r; j++) {
      const lx = x + j * 5 + r * 2.5, ly = base - 3 - r * 4;
      k.rect(lx - 2, ly - 2, 5, 4, "#7a4a28"); k.disc(lx, ly, 1, "#c89a5a");
    }
  }
  function bars(k, x, base, c = "#f2c230") {
    for (let r = 0; r < 3; r++) for (let j = 0; j < 3 - r; j++) k.rect(x + j * 5 + r * 2, base - 2 - r * 2, 4, 2, r === 2 ? "#fff0a0" : c);
    if (k.f % 12 < 2) k.px(x + 6, base - 7, "#ffffff");
  }

  // A temple plan on a sheet of parchment.
  function plan(k, x, y, w = 30, h = 16) {
    k.rect(x, y, w, h, "#efe2bc");
    k.rect(x - 1, y - 1, 2, h + 2, "#c9a46a"); k.rect(x + w - 1, y - 1, 2, h + 2, "#c9a46a");
    const c = "#3a5a9a";
    k.line(x + 4, y + h - 3, x + w - 5, y + h - 3, c);
    k.line(x + 6, y + 6, x + w - 7, y + 6, c);
    k.line(x + 6, y + 6, x + 6, y + h - 3, c); k.line(x + w - 7, y + 6, x + w - 7, y + h - 3, c);
    k.line(x + 6, y + 6, x + w / 2, y + 2, c); k.line(x + w - 7, y + 6, x + w / 2, y + 2, c);
    k.line(x + 10, y + 7, x + 10, y + h - 4, c); k.line(x + w - 11, y + 7, x + w - 11, y + h - 4, c);
    const d = Math.floor(k.t * 4) % 12; k.px(x + 8 + d, y + h - 2, "#2a1a10");
  }

  // A finished temple seen from outside, with two bronze pillars.
  function temple(k, x, base, w = 40, h = 18) {
    k.rect(x, base - h, w, h, "#d8c8a0");
    k.rect(x - 2, base - h - 2, w + 4, 2, "#b8a47a");
    k.rect(x + w / 2 - 8, base - h - 6, 16, 4, "#d8c8a0"); k.rect(x + w / 2 - 9, base - h - 7, 18, 1, "#b8a47a");
    k.rect(x + w / 2 - 4, base - 10, 8, 10, "#4a3020");
    k.rect(x + w / 2 - 8, base - 14, 2, 14, "#c08a40"); k.rect(x + w / 2 + 6, base - 14, 2, 14, "#c08a40");
    k.glow(x + w / 2, base - h - 6, 10 + k.pulse(1.2), "#c9b070");
  }

  function cymbals(k, x, y) {
    const on = Math.floor(k.t * 4) % 2;
    k.rect(x - 3 + on, y, 3, 1, "#e8b830"); k.rect(x + 1 - on, y, 3, 1, "#e8b830");
    if (!on) { k.px(x, y - 2, "#fff8d0"); k.px(x - 2, y - 1, "#fff8d0"); k.px(x + 2, y - 1, "#fff8d0"); }
  }

  function harp(k, x, y) {
    k.line(x, y, x, y + 8, "#c9a046"); k.line(x, y, x + 5, y + 8, "#c9a046"); k.line(x, y + 8, x + 5, y + 8, "#c9a046");
    for (let i = 1; i < 5; i++) k.line(x + i, y + 2 + i, x + i, y + 7, "#f2efe6");
  }

  function rays(k, x, n, spread, y1 = 22, c = "#fff4c2") {
    for (let i = 0; i < n; i++) k.line(x, 0, x - spread / 2 + (i * spread) / (n - 1), y1, c);
  }

  // A seven-day tally: one more mark each beat.
  function tally(k, x, y, n, on, off) {
    const d = Math.floor(k.t * 1.2) % (n + 2);
    for (let i = 0; i < n; i++) k.rect(x + i * 3, y, 1, 4, i < d ? on : off);
  }

  const NR = {
    1: [
      { verse: 1, alt: "Adam and Eve stand in the first garden while the generations down to Noah light up one by one", draw: (k) => {
        k.scene("dawn", "hills", { sunX: 22 });
        k.tree(4, 30, "oak", "#2e5a2a"); k.tree(38, 30, "palm");
        k.fig("Adam", "stand", 14, 19); k.fig("Eve", "stand", 24, 19, true);
        lineage(k, 50, 22, 10, 8, -1);
      } },
      { verse: 4, alt: "Noah and his sons Shem, Ham and Japheth stand below the ark on the mountain under a rainbow", draw: (k) => {
        k.scene("day", "none", { sunX: 16 });
        rainbow(k, 60, 32, 30);
        k.ridge((x) => Math.min(30, 12 + Math.abs(x - 92) * 0.45) + Math.sin(x / 3) * 0.5, "#7aa0b8");
        k.ridge((x) => 29 + Math.sin(x / 7) * 1.5, "#6f9a4a");
        k.ridge(() => 36, "#4f7a36");
        boat(k, 80, 10, 24);
        k.fig("Noah", "staff", 10, 18); k.fig("Shem", "stand", 24, 18); k.fig("Ham", "stand", 34, 18); k.fig("Japheth", "stand", 44, 18);
        const p = (k.t * 0.3) % 1; k.sprite([".w.", "www"], { w: "#f4f6ff" }, 120 - p * 60, 12 + Math.round(Math.sin(p * 9)));
      } },
      { verse: 28, alt: "Abraham stands under a sky full of stars with his sons Ishmael and Isaac", draw: (k) => {
        k.scene("night", "desert", { moonX: 18 });
        k.tent(80, 31, 22, 12); k.tree(110, 31, "palm");
        k.fig("Ishmael", "stand", 30, 19); k.fig("Abraham", "staff", 44, 19); k.fig("Isaac", "child", 58, 24, true);
      } },
      { verse: 34, alt: "Isaac's sons: Esau the hunter on the open hills, and Jacob, called Israel, by the tents with the flocks", draw: (k) => {
        k.scene("day", "hills", { sunX: 64 });
        k.fig("Esau", "spear", 14, 19); k.tree(34, 30);
        k.tent(58, 31, 16, 9);
        k.animal("sheep", 82 + k.pulse(1, 2), 27); k.animal("sheep", 112, 27, true);
        k.fig("Jacob", "staff", 98, 19, true);
      } },
      { verse: 43, alt: "Over the red hills of Edom, crowns appear one after another for its early kings", draw: (k) => {
        k.scene("dusk", "mountains", { sunX: 64 });
        k.city(64, 30, 30, 8, true);
        const n = Math.floor(k.t * 1.5) % 10;
        for (let i = 0; i < 8; i++) if (i < n) k.crown(6 + i * 16, 3 + (i % 2) * 3);
      } },
    ],
    2: [
      { verse: 1, alt: "The twelve tribes of Israel camp together, a tent and a banner for each son", draw: (k) => {
        k.scene("day", "hills", { sunX: 64 });
        const cols = ["#db2777", "#2f7ab8", "#e8b830", "#4a9a4a", "#a04ac0", "#e07030", "#3aa8a0", "#c8504a", "#f2efe6", "#5a5ac8", "#8a6a3a", "#9ac83a"];
        for (let i = 0; i < 6; i++) { k.flag(14 + i * 21, 24, cols[i]); k.tent(2 + i * 21, 24, 12, 6, "#d8c8a8"); }
        for (let i = 0; i < 6; i++) { k.tent(8 + i * 20, 31, 15, 8); k.flag(23 + i * 20, 31, cols[i + 6]); }
      } },
      { verse: 13, alt: "Jesse's sons stand in a row, the youngest, David, with a lamb at his feet", draw: (k) => {
        k.scene("day", "hills", { sunX: 118 });
        k.fig("Jesse", "staff", 2, 19);
        ["Eliab", "Abinadab", "Shimea", "Nethanel", "Raddai", "Ozem"].forEach((n, i) => k.fig(n, "stand", 16 + i * 12, 19));
        k.glow(94, 27, 5 + k.pulse(2), "#fff6c8");
        k.fig("David", "child", 92, 24, true); k.animal("sheep", 101, 27, true, true);
      } },
      { verse: 55, alt: "Families of scribes at Jabez copy the records by lamplight", draw: (k) => {
        k.room("house"); k.lamp(64, 8);
        k.rect(30, 27, 68, 3, "#6a4428");
        k.fig("scribe", "sit", 20, 20); k.scroll(36, 23); k.scroll(82, 23);
        k.fig("scribe 2", "sit", 100, 20, true);
        const q = Math.floor(k.t * 4) % 8; k.px(37 + q, 24, "#2a1a10"); k.px(90 - q, 24, "#2a1a10");
      } },
    ],
    3: [
      { verse: 1, alt: "At Hebron, David stands with the six sons born to him there", draw: (k) => {
        k.scene("day", "city", { cityX: 100, cityW: 40 });
        k.fig("David", "stand", 10, 19);
        ["Amnon", "Daniel", "Absalom", "Adonijah", "Shephatiah", "Ithream"].forEach((n, i) =>
          k.fig(n, "child", 22 + i * 9, 24 - ((Math.floor(k.t * 3) + i) % 4 === 0 ? 1 : 0)));
      } },
      { verse: 5, alt: "In Jerusalem at night, Bathsheba holds baby Solomon while David looks on", draw: (k) => {
        k.scene("night", "city", { cityX: 96, cityW: 56 });
        k.fig("David", "stand", 28, 19); k.fig("Bathsheba", "stand", 42, 19, true);
        k.glow(42, 26, 4 + k.pulse(2), "#6a6440");
        k.sprite(_SCK.baby, { s: "#e0a96d", e: "#2a1a10", w: "#f2efe6" }, 39, 24);
      } },
      { verse: 10, alt: "A line of crowns passes down from Solomon to the kings of Judah after him", draw: (k) => {
        k.room("palace"); k.throne(6, 31); k.fig("Solomon", "sit", 8, 21);
        const n = Math.floor(k.t * 2) % 12;
        for (let i = 0; i < 9; i++) {
          const x = 30 + i * 11, y = 5 + i * 2;
          if (i) k.line(x - 8, y - 1, x - 2, y + 1, "#8a6a3a");
          if (i <= n) k.crown(x - 2, y); else k.rect(x - 2, y + 1, 5, 2, "#5a4030");
        }
      } },
      { verse: 17, alt: "King Jehoiachin is led away from Jerusalem as a prisoner toward Babylon", draw: (k) => {
        k.scene("dusk", "desert", { sunX: 112 });
        k.city(16, 30, 28, 10);
        const p = (k.t * 4) % 40;
        k.fig("Babylonian", "spear", 34 + p, 19);
        k.fig("Jehoiachin", "stand", 48 + p, 19); k.line(42 + p, 26, 48 + p, 26, "#a08a5a");
        k.fig("exile", "weep", 60 + p, 19); k.line(55 + p, 26, 61 + p, 26, "#a08a5a");
        k.fig("Babylonian 2", "spear", 74 + p, 19);
      } },
    ],
    4: [
      { verse: 1, alt: "Judah's family spreads out like a tree, each new generation lighting up", draw: (k) => {
        k.scene("day", "hills", { sunX: 14 });
        famTree(k, 72, 30, 3, 96);
        k.fig("Judah", "staff", 4, 19);
      } },
      { verse: 9, alt: "Jabez kneels in the field at dawn and asks God to bless him and widen his land", draw: (k) => {
        k.scene("dawn", "field", { crop: "#4a8a3a", cropTop: "#8acf5a", sunX: 104 });
        rays(k, 62, 5, 40, 20);
        const w = 12 + ((k.t * 4) % 30);
        k.stones(56 - w, 31, 3); k.stones(68 + w, 31, 3);
        k.fig("Jabez", "kneel", 58, 22);
      } },
      { verse: 23, alt: "Potters shape clay jars on a spinning wheel, working for the king", draw: (k) => {
        k.room("house"); k.lamp(112, 8);
        k.fig("potter", "sit", 26, 21);
        k.rect(36, 28, 18, 2, "#5a3a22");
        const a = k.t * 6; k.px(45 + Math.cos(a) * 7, 29, "#c9a046");
        pot(k, 45, 28, "#b86a3a");
        for (let i = 0; i < 4; i++) pot(k, 68 + i * 10, 31, i % 2 ? "#a85a30" : "#c87a48");
      } },
      { verse: 39, alt: "Simeon's clans lead their flocks east to good pasture near Gedor", draw: (k) => {
        k.scene("day", "valley", { sunX: 20 });
        k.tree(118, 31);
        const p = (k.t * 4) % 40;
        for (let i = 0; i < 5; i++) k.animal("sheep", 26 + i * 11 + p, 27 + (i % 2), false, true);
        k.fig("Simeonite", "staff", 10 + p, 19);
      } },
    ],
    5: [
      { verse: 1, alt: "Old Israel blesses Joseph's two sons while Reuben, the firstborn, stands apart", draw: (k) => {
        k.room("tent"); k.lamp(64, 6);
        k.fig("Israel", "sit", 20, 21);
        k.glow(45, 26, 7 + k.pulse(2), "#6a5a30");
        k.fig("Ephraim", "child", 36, 24, true); k.fig("Manasseh", "child", 46, 24, true);
        k.fig("Reuben", "stand", 104, 19, true);
      } },
      { verse: 10, alt: "Reuben's men settle in tents across the wide plains east of Gilead", draw: (k) => {
        k.scene("dusk", "desert", { sunX: 24 });
        camel(k, 8, 24, false, true);
        k.fig("Reubenite", "stand", 26, 19);
        k.fire(42, 31, 4);
        k.tent(52, 31, 18, 10); k.tent(78, 31, 16, 9, "#b89a74"); k.tent(102, 30, 12, 7);
      } },
      { verse: 20, alt: "In battle the eastern tribes cry out to God, and light breaks through the storm", draw: (k) => {
        k.scene("storm", "hills");
        rays(k, 64, 5, 44, 22);
        k.fig("Reubenite", "kneel", 38, 22); k.fig("Gadite", "kneel", 56, 22); k.fig("Manassite", "kneel", 74, 22);
      } },
      { verse: 23, alt: "Half the tribe of Manasseh spreads its tents up toward snowy Mount Hermon", draw: (k) => {
        k.scene("day", "none", { sunX: 20 });
        k.ridge((x) => 6 + Math.abs(x - 84) * 0.5, "#7a8aa8");
        k.ridge((x) => 6 + Math.abs(x - 84) * 0.5, "#eef2f8", 13, 70, 99);
        k.ridge((x) => 28 + Math.sin(x / 7) * 1.5, "#6f9a4a");
        k.ridge(() => 36, "#4f7a36");
        k.tent(8, 31, 16, 9); k.tent(32, 31, 14, 8, "#b89a74"); k.tent(98, 31, 14, 8);
        k.animal("sheep", 56 + k.pulse(0.8, 4), 27, false, true); k.animal("sheep", 74, 28, true);
      } },
      { verse: 26, alt: "The king of Assyria leads the eastern tribes away into exile", draw: (k) => {
        k.scene("dusk", "desert", { sunX: 20 });
        const p = (k.t * 3) % 30;
        k.fig("exile 3", "weep", 22 + p, 19); k.fig("exile 2", "stand", 36 + p, 19); k.fig("exile", "weep", 50 + p, 19);
        k.animal("horse", 70 + p, 24, false, true); k.fig("Tiglath-Pileser", "sit", 70 + p, 17);
      } },
    ],
    6: [
      { verse: 1, alt: "Levi's sons Gershon, Kohath and Merari carry the parts of the holy tent through the desert", draw: (k) => {
        k.scene("day", "desert", { sunX: 112 });
        const p = (k.t * 4) % 30, b = Math.floor(k.t * 4) % 2;
        k.fig("Gershon", "stand", 18 + p, 19); k.rect(14 + p, 18 - b, 14, 3, "#2f5a9a"); k.rect(14 + p, 19 - b, 14, 1, "#db2777");
        k.fig("Kohath", "stand", 48 + p, 19); k.rect(46 + p, 17 - b, 10, 4, "#e8b830"); k.rect(46 + p, 17 - b, 10, 1, "#fff0a0");
        k.fig("Merari", "stand", 78 + p, 19); k.rect(74 + p, 18 - b, 16, 2, WOOD); k.rect(74 + p, 17 - b, 16, 1, "#a8865c");
      } },
      { verse: 31, alt: "Heman, Asaph and Ethan lead the singing in front of the holy tent", draw: (k) => {
        k.scene("day", "hills", { sunX: 20 });
        k.tent(40, 31, 40, 16, LINEN);
        k.fig("Ethan", "stand", 22, 19); harp(k, 29, 21); k.notes(30, 18, GOLD);
        k.fig("Heman", "praise", 55, 19); k.notes(60, 16, GOLD);
        k.fig("Asaph", "stand", 92, 19, true); cymbals(k, 90, 25);
      } },
      { verse: 49, alt: "Aaron burns incense on the golden altar beside the lampstand and the table of bread", draw: (k) => {
        k.room("tent");
        menorah(k, 24, 30);
        incense(k, 58, 30);
        k.fig("Aaron", "stand", 74, 19, true);
        breadTable(k, 96, 30);
      } },
      { verse: 54, alt: "Levites receive towns and pastures scattered among all the tribes, chosen by lot", draw: (k) => {
        k.scene("day", "hills", { sunX: 64 });
        k.city(18, 26, 20, 6); k.city(66, 22, 18, 5); k.city(108, 26, 20, 6);
        k.animal("sheep", 30, 28, false, true); k.animal("sheep", 88 + k.pulse(1, 3), 28, true);
        k.fig("Levite", "stand", 46, 19); lots(k, 54, 22);
      } },
    ],
    7: [
      { verse: 1, alt: "Issachar's brave fighting men stand ready on the hills, each family under its banner", draw: (k) => {
        k.scene("dawn", "hills", { sunX: 64 });
        k.flag(20, 30, "#3aa8a0"); k.flag(62, 30, "#e8b830"); k.flag(104, 30, "#3aa8a0");
        for (let i = 0; i < 6; i++) k.fig("Issachar man " + i, "spear", 4 + i * 21, 19);
      } },
      { verse: 22, alt: "Ephraim mourns his sons for many days, and his family comes to comfort him", draw: (k) => {
        k.scene("dusk", "hills");
        k.tent(88, 31, 20, 11);
        k.fig("brother", "stand", 34, 19); k.fig("Ephraim", "weep", 48, 19); k.fig("brother 2", "stand", 62, 19, true);
      } },
      { verse: 23, alt: "After the sorrow, a new son, Beriah, is born to Ephraim's house", draw: (k) => {
        k.room("tent"); k.lamp(64, 6);
        k.fig("Ephraim", "stand", 40, 19);
        k.glow(64, 26, 5 + k.pulse(2), "#7a6030");
        k.fig("Ephraim's wife", "sit", 66, 21, true);
        k.sprite(_SCK.baby, { s: "#e0a96d", e: "#2a1a10", w: "#f2efe6" }, 62, 25);
      } },
      { verse: 24, alt: "Sheerah, Ephraim's granddaughter, builds the towns of Lower and Upper Beth Horon", draw: (k) => {
        k.scene("day", "hills", { sunX: 20 });
        k.city(38, 30, 26, 8);
        k.fig("Sheerah", "stand", 64, 19);
        const h = Math.floor(k.t * 2) % 8;
        for (let r = 0; r <= h; r++) k.rect(84, 30 - r * 2, 28, 2, r % 2 ? "#7a6a58" : "#8a7a68");
        k.rect(84 + ((h * 3) % 24), 28 - h * 2, 4, 2, "#a89a80");
      } },
      { verse: 30, alt: "Asher's sons and their sister Serah stand on the shore by the sea", draw: (k) => {
        k.scene("day", "none", { sunX: 112 });
        k.rect(0, 24, 128, 16, "#2c5a8c");
        for (let x = 0; x < 128; x += 7) k.px((x + k.t * 5) % 128, 25 + (x % 3) * 2, "#9cc0f0");
        k.ridge((x) => 29 + Math.sin(x / 8) * 1.5, "#d8c08a", 40, 0, 92);
        ["Imnah", "Ishvah", "Ishvi", "Beriah", "Serah"].forEach((n, i) => k.fig(n, "stand", 6 + i * 14, 17));
      } },
    ],
    8: [
      { verse: 1, alt: "Benjamin's clans gather around a campfire as their family lines are read from a scroll", draw: (k) => {
        k.scene("night", "hills", { moonX: 20 });
        k.tent(96, 31, 20, 11);
        k.glow(64, 27, 10 + k.pulse(3), "#5a3a20");
        k.fire(64, 31, 6);
        k.fig("Benjamite", "sit", 20, 21);
        k.fig("Benjamite elder", "stand", 38, 19); k.scroll(46, 24);
        k.fig("Benjamite 2", "sit", 74, 21, true);
      } },
      { verse: 33, alt: "Kish's family: his son Saul, and Saul's son Jonathan with his bow", draw: (k) => {
        k.scene("day", "hills");
        k.fig("Kish", "staff", 10, 19); k.animal("donkey", 24, 24, false, true);
        k.fig("Saul", "stand", 56, 18);
        k.fig("Jonathan", "stand", 74, 19); bow(k, 82, 24);
      } },
      { verse: 40, alt: "Ulam's sons, skilled archers, send arrows flying toward a target", draw: (k) => {
        k.scene("day", "field");
        k.line(112, 22, 112, 31, DARKWOOD);
        k.disc(112, 20, 5, "#e8dcc0"); k.disc(112, 20, 3, "#c8504a"); k.disc(112, 20, 1, "#e8dcc0");
        k.fig("Ulam's son", "stand", 12, 19); bow(k, 19, 23);
        k.fig("Ulam's son 2", "stand", 32, 19); bow(k, 39, 23);
        const p = (k.t * 1.2) % 1, x = 22 + p * 84, y = 23 - Math.sin(p * Math.PI) * 5;
        k.line(x, y, x + 4, y, "#e8dcc0"); k.px(x + 5, y, "#d8dce4");
      } },
    ],
    9: [
      { verse: 1, alt: "By the rivers of Babylon at night, the people of Judah sit far from home", draw: (k) => {
        k.scene("night", "river", { moonX: 64 });
        k.city(100, 24, 40, 9, true);
        k.tree(4, 29, "oak", "#2e4a3a"); k.tree(56, 29, "oak", "#2e4a3a");
        k.fig("exile", "sit", 18, 19); k.fig("exile 2", "weep", 34, 17); k.fig("exile 3", "sit", 66, 19, true);
      } },
      { verse: 2, alt: "The first families return home, walking toward Jerusalem's broken walls at dawn", draw: (k) => {
        k.scene("dawn", "hills", { sunX: 104 });
        k.city(96, 30, 40, 10);
        k.rect(84, 20, 6, 5, "#3a3048"); k.rect(104, 22, 5, 4, "#3a3048");
        k.stones(78, 31, 5); k.stones(110, 31, 6);
        const p = (k.t * 4) % 24;
        k.fig("priest", "staff", 6 + p, 19); k.fig("Levite", "stand", 20 + p, 19);
        k.fig("mother", "stand", 34 + p, 19); k.fig("child", "child", 44 + p, 24);
      } },
      { verse: 17, alt: "Levite gatekeepers keep watch by torchlight at the east gate of God's house", draw: (k) => {
        k.scene("night", "hills", { moonX: 18 });
        gate(k, 52, 31, 0);
        torch(k, 46, 16); torch(k, 80, 16);
        k.fig("Shallum", "spear", 34, 19); k.fig("Akkub", "spear", 86, 19, true);
      } },
      { verse: 27, alt: "At first light the gatekeepers open the doors of God's house", draw: (k) => {
        k.scene("dawn", "hills", { sunX: 20 });
        const o = Math.min(1, (k.t * 0.3) % 1.5);
        gate(k, 52, 31, o, "#ffd27a");
        if (o > 0.2) k.glow(64, 24, 6, "#fff6c8");
        k.fig("gatekeeper", "stand", 40, 19); k.fig("gatekeeper 2", "stand", 78, 19, true);
      } },
      { verse: 33, alt: "Levite musicians keep singing in the temple by lamplight through the night", draw: (k) => {
        k.room("palace"); k.lamp(18, 8); k.lamp(110, 8);
        k.window(60, 4); k.px(62 + (k.f % 20 < 10 ? 0 : 1), 6, "#e8e8ff"); k.px(65, 8, "#e8e8ff"); k.disc(66, 6, 1, "#f4f0d8");
        k.fig("singer", "praise", 34, 19); k.notes(40, 16, GOLD);
        k.fig("singer 2", "stand", 56, 19); harp(k, 63, 21);
        k.fig("singer 3", "stand", 82, 19, true); cymbals(k, 80, 25);
      } },
    ],
    10: [
      { verse: 1, alt: "On Mount Gilboa Israel's army flees as Philistine banners rise on the heights", draw: (k) => {
        k.scene("dusk", "mountains", { sunX: 30 });
        k.flag(64, 11, "#8a8aa0"); k.flag(119, 11, "#8a8aa0");
        const p = (k.t * 10) % 50;
        k.fig("Israelite", "run", 60 - p, 19, true); k.fig("Israelite 2", "run", 76 - p, 19, true);
      } },
      { verse: 8, alt: "The next morning Saul's shield, spear and crown lie abandoned on Mount Gilboa", draw: (k) => {
        k.scene("dawn", "mountains", { sunX: 100 });
        k.birds(3, 6);
        k.line(38, 31, 50, 27, "#8a6a3a"); k.px(51, 26, "#d8dce4"); k.px(52, 26, "#d8dce4");
        k.disc(62, 29, 3, "#7a6a50"); k.px(62, 29, "#c9a046");
        k.crown(70, 28);
      } },
      { verse: 11, alt: "The brave men of Jabesh Gilead walk all night by torchlight to bring Saul and his sons home", draw: (k) => {
        k.scene("night", "hills", { moonX: 110 });
        const p = (k.t * 4) % 40;
        k.fig("Jabesh man 3", "stand", 6 + p, 19); torch(k, 13 + p, 17);
        k.fig("Jabesh man", "stand", 26 + p, 19);
        k.rect(33 + p, 25, 22, 2, "#5a3a22"); k.rect(35 + p, 23, 18, 2, "#d8d0c0");
        k.fig("Jabesh man 2", "stand", 55 + p, 19);
      } },
      { verse: 12, alt: "They bury Saul and his sons under the great tree at Jabesh and fast for seven days", draw: (k) => {
        k.scene("dusk", "hills");
        k.rect(60, 16, 4, 15, DARKWOOD);
        for (const [x, y, r] of [[56, 13, 6], [68, 12, 6], [62, 9, 6], [50, 16, 4], [74, 16, 4]]) k.disc(x, y, r, "#2e4a2a");
        k.stones(54, 31, 6); k.stones(66, 31, 6);
        k.fig("Jabesh man", "kneel", 30, 22); k.fig("Jabesh man 2", "kneel", 88, 22, true);
        tally(k, 102, 4, 7, "#f4f0d8", "#5a2a4a");
      } },
      { verse: 14, alt: "The Lord turns the kingdom over to David, who looks out over Hebron at dawn", draw: (k) => {
        k.scene("dawn", "hills", { sunX: 98 });
        k.city(100, 30, 30, 8);
        k.fig("David", "stand", 40, 19); k.crown(41, 11 + k.pulse(2, 1));
      } },
    ],
    11: [
      { verse: 1, alt: "All Israel comes to Hebron, and the elders bow as David is anointed king", draw: (k) => {
        k.scene("day", "city", { cityX: 104, cityW: 36 });
        k.fig("David", "kneel", 24, 22); k.fig("Zadok", "horn", 34, 19, true);
        for (let i = 0; i < 3; i++) k.px(31, 22 + ((k.t * 6 + i * 2) % 5), GOLD);
        for (let i = 0; i < 3; i++) k.fig("elder " + i, "bow", 50 + i * 11, 25, true);
      } },
      { verse: 4, alt: "Joab climbs the steep slope first as David's army takes the fortress of Jebus", draw: (k) => {
        k.scene("day", "hills", { sunX: 20 });
        const f = (x) => Math.min(31, 15 + Math.abs(x - 98) * 0.55);
        k.ridge(f, "#8a7a5a", 40, 50, 128);
        k.city(98, 15, 34, 8);
        const p = (k.t * 0.15) % 1, jx = 52 + p * 24;
        k.fig("Joab", "run", jx, Math.round(f(jx + 4)) - 12);
        k.fig("soldier", "spear", 14, 19); k.fig("David", "stand", 28, 19); k.flag(40, 31, "#db2777");
      } },
      { verse: 10, alt: "David's mighty men stand guard in front of his tent, weapons ready", draw: (k) => {
        k.scene("dusk", "hills", { sunX: 64 });
        k.tent(52, 31, 24, 12, "#b89a74"); k.flag(76, 31, "#db2777");
        k.fig("Jashobeam", "spear", 12, 19); k.fig("Eleazar", "sword", 30, 19);
        k.fig("Benaiah", "spear", 90, 19, true); k.fig("Abishai", "sword", 106, 19, true);
      } },
      { verse: 18, alt: "Three mighty men bring water from Bethlehem's well, and David pours it out on the ground to the Lord", draw: (k) => {
        k.scene("night", "none", { noMoon: true });
        k.rect(0, 0, 128, 40, "#2a2430");
        k.disc(64, 40, 34, "#14101a");
        k.ridge(() => 31, "#3a3040");
        k.lamp(36, 12);
        k.fig("David", "stand", 56, 19);
        for (let i = 0; i < 4; i++) k.px(63, 25 + ((k.t * 10 + i * 2) % 6), "#9cc8f0");
        k.fig("mighty man", "kneel", 74, 22, true); k.fig("mighty man 2", "kneel", 86, 22, true); k.fig("mighty man 3", "kneel", 98, 22, true);
      } },
      { verse: 23, alt: "Benaiah, armed only with a club, faces a huge Egyptian who carries a spear like a weaver's rod", draw: (k) => {
        k.scene("noon", "desert", { sunX: 20 });
        k.fig("Benaiah", "staff", 36, 19);
        k.giant("Egyptian", 74, 7);
      } },
    ],
    12: [
      { verse: 1, alt: "At Ziklag, archers and slingers who can use either hand join David", draw: (k) => {
        k.scene("noon", "desert", { sunX: 116 });
        k.tent(4, 31, 18, 10); k.tent(24, 31, 14, 8, "#b89a74");
        k.fig("David", "stand", 46, 19);
        k.fig("Benjamite archer", "stand", 70, 19, true); bow(k, 68, 23);
        const a = k.t * 9, hx = 96;
        k.fig("Benjamite slinger", "stand", 90, 19, true);
        k.line(hx - 6, 25, hx - 6 + Math.cos(a) * 4, 25 + Math.sin(a) * 4, "#8a6a3a");
        k.px(hx - 6 + Math.cos(a) * 5, 25 + Math.sin(a) * 5, "#d8dce4");
      } },
      { verse: 8, alt: "Men of Gad, bold as lions and swift as gazelles, race across the mountains to David", draw: (k) => {
        k.scene("day", "mountains", { sunX: 20 });
        const p = (k.t * 12) % 160 - 20;
        k.fig("Gadite", "run", p, 19); k.fig("Gadite 2", "run", p - 16, 19);
        k.sprite(_SC_DEER, _SC_DEER_PAL, p + 14, 21 - (Math.floor(k.t * 4) % 2) * 2);
        k.animal("lion", 104, 26, true);
      } },
      { verse: 18, alt: "God's Spirit comes on Amasai and he shouts to David, We are yours", draw: (k) => {
        k.scene("dusk", "mountains", { sunX: 100 });
        k.glow(78, 20, 10 + k.pulse(2, 2), "#a8784a");
        rays(k, 78, 3, 12, 16, "#ffe8a0");
        k.fig("David", "stand", 40, 19);
        k.fig("Amasai", "praise", 74, 19); k.fig("Benjamite", "stand", 92, 19, true); k.fig("man of Judah", "stand", 104, 19, true);
      } },
      { verse: 22, alt: "Day after day more men stream in, until David's army is as great as the army of God", draw: (k) => {
        k.scene("day", "hills", { sunX: 64 });
        k.flag(64, 30, "#db2777"); k.fig("David", "stand", 56, 19);
        const n = 2 + (Math.floor(k.t) % 4);
        for (let i = 0; i < n; i++) { k.fig("soldier " + i, "spear", 42 - i * 11, 19); k.fig("soldier " + (i + 9), "spear", 72 + i * 11, 19, true); }
      } },
      { verse: 40, alt: "Donkeys, camels and oxen arrive loaded with food for three days of joy in Hebron", draw: (k) => {
        k.scene("day", "city", { cityX: 108, cityW: 34 });
        const p = (k.t * 4) % 20;
        k.animal("donkey", 8 + p, 24, false, true); k.rect(10 + p, 23, 5, 2, "#c89a5a");
        camel(k, 24 + p, 24, false, true); k.rect(27 + p, 22, 4, 2, "#8a3a5a");
        k.animal("ox", 40 + p, 26, false, true);
        k.fig("man of Issachar", "staff", 54 + p, 19);
        for (let i = 0; i < 3; i++) pot(k, 80 + i * 6, 31, "#b86a3a");
      } },
    ],
    13: [
      { verse: 1, alt: "David talks with the leaders about bringing God's Covenant Box back", draw: (k) => {
        k.room("palace"); k.lamp(64, 8);
        k.fig("David", "stand", 58, 19);
        k.fig("commander", "sit", 22, 21); k.fig("commander 2", "sit", 36, 21);
        k.fig("commander 3", "sit", 82, 21, true); k.fig("commander 4", "sit", 96, 21, true);
      } },
      { verse: 7, alt: "Uzzah and Ahio guide the new cart carrying the Covenant Box from Abinadab's house", draw: (k) => {
        k.scene("day", "hills", { sunX: 20 });
        const p = (k.t * 3) % 24;
        k.fig("Uzzah", "stand", 26 + p, 19);
        k.cart(36 + p, 26); k.ark(39 + p, 21);
        k.animal("ox", 56 + p, 26, false, true);
        k.fig("Ahio", "staff", 72 + p, 19);
      } },
      { verse: 8, alt: "David and all Israel dance and sing before God with harps, cymbals and trumpets", draw: (k) => {
        k.scene("day", "field", { sunX: 64 });
        k.fig("David", "dance", 58, 20);
        k.fig("musician", "stand", 20, 19); harp(k, 27, 21); k.notes(30, 18, GOLD);
        k.fig("musician 2", "stand", 38, 19); cymbals(k, 46, 25);
        k.fig("priest", "trumpet", 82, 19, true); k.fig("Israelite", "praise", 100, 19);
      } },
      { verse: 9, alt: "At the threshing floor the oxen stumble, the sky darkens, and the people draw back from the Box", draw: (k) => {
        k.scene("storm", "hills");
        k.rect(36, 30, 56, 3, "#a08a5a");
        k.cart(50, 25); k.ark(53, 20);
        k.animal("ox", 70, 25 + (k.f % 6 < 3 ? 1 : 0));
        k.fig("David", "weep", 14, 19); k.fig("Ahio", "stand", 100, 19, true);
      } },
      { verse: 13, alt: "The Covenant Box rests at Obed-Edom's house for three months, and God blesses his family", draw: (k) => {
        k.scene("day", "hills", { sunX: 100 });
        k.rect(14, 16, 40, 15, "#9a8a72"); k.rect(12, 14, 44, 2, "#7a6a58"); k.rect(30, 22, 8, 9, "#3a2a1a");
        k.ark(29, 24);
        k.fig("Obed-Edom", "praise", 64, 19); k.fig("Obed-Edom's son", "child", 78, 24); k.fig("Obed-Edom's son 2", "child", 86, 24, true);
        k.tree(100, 30, "oak", "#3f8a2e"); k.animal("sheep", 108, 27, true, true);
      } },
    ],
    14: [
      { verse: 1, alt: "King Hiram of Tyre sends cedar logs, carpenters and stonemasons to build David's palace", draw: (k) => {
        k.scene("day", "hills", { sunX: 18 });
        k.palace(70, 31, 40, 18);
        logs(k, 22, 31, 3);
        const p = (k.t * 5) % 30;
        k.fig("carpenter", "stand", 38 + p, 19); k.rect(36 + p, 17, 12, 2, "#7a4a28");
        k.fig("mason", "stand", 112, 19, true);
      } },
      { verse: 3, alt: "In Jerusalem David's family grows, his children playing outside the palace", draw: (k) => {
        k.scene("dusk", "city", { cityX: 98, cityW: 50 });
        k.fig("David", "stand", 20, 19);
        for (let i = 0; i < 5; i++) {
          const x = 34 + i * 9 + Math.round(Math.sin(k.t * 2 + i) * 2), hop = (Math.floor(k.t * 4) + i) % 3 === 0 ? 1 : 0;
          k.fig("child " + i, "child", x, 24 - hop, i % 2 === 1);
        }
      } },
      { verse: 8, alt: "The Philistines spread out across the Valley of Rephaim, and David asks God what to do", draw: (k) => {
        k.scene("dusk", "valley", { sunX: 64 });
        for (let i = 0; i < 5; i++) { k.tent(56 + i * 14, 28 + (i % 2) * 2, 12, 7, "#8a8070"); }
        k.flag(68, 26, "#8a8aa0"); k.flag(96, 26, "#8a8aa0");
        k.fig("David", "kneel", 18, 22); k.glow(22, 16, 6 + k.pulse(2), "#a8784a");
      } },
      { verse: 11, alt: "At Baal Perazim God breaks through the enemy like a flood of water", draw: (k) => {
        k.scene("day", "mountains", { sunX: 110 });
        k.ridge((x) => 22 + x * 0.1, "#6a5a48", 40, 0, 26);
        k.fig("David", "praise", 8, 10);
        const w = (k.t * 24) % 150;
        k.rect(26, 27, Math.min(w, 102), 5, "#2c5a8c");
        for (let x = 28; x < 26 + Math.min(w, 102); x += 5) k.px(x + (k.f % 5), 28 + (x % 2), "#9cc0f0");
        if (w < 102) { k.rect(24 + w, 24, 3, 8, "#3c6aa0"); k.px(26 + w, 23, "#f4f6ff"); k.px(27 + w, 25, "#f4f6ff"); }
        k.flag(116, 31, "#8a8aa0");
      } },
      { verse: 15, alt: "David's men wait under the balsam trees for the sound of marching in the treetops", draw: (k) => {
        k.scene("dusk", "forest");
        for (let i = 0; i < 9; i++) if ((k.f + i * 3) % 7 < 3) { const x = 7 + i * 15 + (i % 2) * 4; k.px(x - 1, 17, "#ffe8a0"); k.px(x + 2, 16, "#ffe8a0"); k.px(x + 4, 18, "#ffe8a0"); }
        k.fig("David", "sword", 40, 19); k.fig("soldier", "spear", 54, 19); k.fig("soldier 2", "spear", 68, 19);
      } },
    ],
    15: [
      { verse: 1, alt: "David pitches a new tent in Jerusalem as a place for God's Covenant Box", draw: (k) => {
        k.scene("day", "city", { cityX: 104, cityW: 36 });
        const h = 10 + (Math.floor(k.t * 2) % 5);
        k.tent(36, 31, 32, h, LINEN);
        k.line(36, 31, 30, 31 - h, "#a08a5a");
        k.fig("Levite", "stand", 20, 19); k.fig("David", "stand", 74, 19, true);
      } },
      { verse: 15, alt: "The Levites carry the Covenant Box on poles on their shoulders, as Moses commanded", draw: (k) => {
        k.scene("day", "hills", { sunX: 110 });
        const p = (k.t * 3) % 30, b = Math.floor(k.t * 3) % 2;
        k.ark(46 + p, 19 - b);
        k.line(26 + p, 22 - b, 74 + p, 22 - b, WOOD);
        k.fig("Levite", "stand", 26 + p, 19); k.fig("Levite 2", "stand", 36 + p, 19);
        k.fig("Levite 3", "stand", 60 + p, 19); k.fig("Levite 4", "stand", 70 + p, 19);
      } },
      { verse: 16, alt: "Levite musicians tune harps and lyres and strike bronze cymbals as Kenaniah leads the singing", draw: (k) => {
        k.room("palace"); k.lamp(20, 8); k.lamp(108, 8);
        k.fig("Heman", "stand", 14, 19); cymbals(k, 22, 25);
        k.fig("Asaph", "stand", 34, 19); harp(k, 41, 21);
        k.fig("Kenaniah", "praise", 58, 19); k.notes(63, 16, GOLD);
        k.fig("Ethan", "stand", 84, 19, true); k.sprite(_SC_LYRE, _SC_PAL, 78, 24);
        k.fig("singer", "stand", 100, 19, true);
      } },
      { verse: 28, alt: "With shouts, horns and trumpets all Israel brings the Covenant Box up to Jerusalem", draw: (k) => {
        k.scene("day", "city", { cityX: 106, cityW: 34 });
        const p = (k.t * 3) % 20;
        k.fig("priest", "trumpet", 4 + p, 19);
        k.fig("Levite", "stand", 20 + p, 19); k.ark(29 + p, 19); k.line(20 + p, 22, 48 + p, 22, WOOD); k.fig("Levite 2", "stand", 42 + p, 19);
        k.fig("David", "dance", 56 + p, 20);
        k.fig("priest 2", "horn", 72 + p, 19);
      } },
      { verse: 29, alt: "Michal watches from a window as David dances and celebrates, and she despises him", draw: (k) => {
        k.scene("day", "city", { cityX: 64, cityW: 100 });
        k.palace(76, 31, 44, 20); k.window(92, 14, "Michal");
        k.fig("David", "dance", 34, 20); k.fig("singer", "praise", 14, 19); k.notes(20, 16, GOLD);
      } },
    ],
    16: [
      { verse: 1, alt: "The Covenant Box is set inside David's tent, and offerings rise from the altar", draw: (k) => {
        k.scene("dawn", "hills", { sunX: 108 });
        k.tent(14, 31, 40, 18, LINEN); k.ark(29, 24);
        k.altar(70, 31);
        k.fig("David", "praise", 92, 19);
      } },
      { verse: 3, alt: "David gives every man and woman a loaf of bread, dates and raisins", draw: (k) => {
        k.scene("day", "hills", { sunX: 20 });
        k.fig("David", "stand", 28, 19);
        k.rect(8, 27, 16, 4, WOOD); for (let i = 0; i < 4; i++) k.rect(9 + i * 4, 25, 3, 2, "#d8a868");
        const p = (k.t * 3) % 12;
        for (let i = 0; i < 6; i++) k.fig(i % 2 ? "woman " + i : "man " + i, i === 5 ? "child" : "stand", 44 + i * 13 - p, i === 5 ? 24 : 19, true);
        k.rect(42 - p, 25, 3, 2, "#d8a868");
      } },
      { verse: 7, alt: "Asaph and his brothers sing David's song of thanks to the Lord before the Covenant Box", draw: (k) => {
        k.room("tent"); k.lamp(16, 6); k.lamp(112, 6);
        k.ark(59, 22);
        k.fig("Asaph", "praise", 32, 19); cymbals(k, 46, 20); k.notes(38, 15, GOLD);
        k.fig("Jeiel", "stand", 82, 19, true); harp(k, 76, 21); k.notes(84, 15, GOLD);
      } },
      { verse: 31, alt: "The heavens rejoice, the sea roars and the trees of the forest sing for joy", draw: (k) => {
        k.scene("day", "none", { sunX: 64 });
        k.rect(0, 26, 52, 14, "#2c5a8c");
        for (let x = 0; x < 52; x += 5) k.px((x + k.t * 6) % 52, 27 + Math.round(Math.sin(k.t * 3 + x)) + (x % 3) * 2, "#cfe4f2");
        k.ridge((x) => 27 + Math.sin(x / 6) * 1.5, "#6f9a4a", 40, 52, 128); k.ridge(() => 35, "#4f7a36", 40, 52, 128);
        for (let i = 0; i < 4; i++) k.tree(62 + i * 16, 28 + (i % 2), "oak", "#3f7a2e");
        k.notes(20, 22, "#f2efe6"); k.notes(70, 14, GOLD); k.notes(104, 15, GOLD);
      } },
      { verse: 37, alt: "Asaph serves at the Covenant Box in Jerusalem each day while Zadok offers at the altar in Gibeon", draw: (k) => {
        k.scene("dusk", "hills", { sunX: 64 });
        k.rect(63, 0, 2, 40, "#1a1222");
        k.tent(4, 31, 30, 14, LINEN); k.ark(14, 25); k.fig("Asaph", "stand", 40, 19, true); k.notes(40, 16, GOLD);
        k.altar(82, 31); k.fig("Zadok", "stand", 100, 19, true); k.fig("priest", "stand", 112, 19, true);
      } },
    ],
    17: [
      { verse: 1, alt: "David, living in a house of cedar, tells Nathan that God's Box still sits in a tent", draw: (k) => {
        k.scene("day", "city", { cityX: 64, cityW: 110 });
        k.palace(8, 31, 46, 20);
        k.fig("David", "stand", 58, 19); k.fig("Nathan", "staff", 72, 19, true);
        k.tent(94, 31, 26, 12, LINEN); k.glow(107, 26, 4 + k.pulse(2), "#a8904a");
      } },
      { verse: 3, alt: "That night God speaks to Nathan the prophet", draw: (k) => {
        k.scene("night", "city", { cityX: 100, cityW: 40 });
        rays(k, 40, 5, 20, 20, "#c8c8f0");
        k.glow(40, 22, 8 + k.pulse(2), "#3a3a6a");
        k.fig("Nathan", "kneel", 36, 22);
      } },
      { verse: 7, alt: "God reminds David: I took you from following the sheep in the fields to lead my people", draw: (k) => {
        k.scene("day", "field", { crop: "#4a8a3a", cropTop: "#8acf5a", sunX: 104 });
        k.fig("David", "staff", 30, 19);
        k.animal("sheep", 46, 27, false, true); k.animal("sheep", 58, 28); k.animal("sheep", 16, 28, true);
        k.crown(86, 8 + k.pulse(1.5, 2));
      } },
      { verse: 11, alt: "God promises that one of David's sons will build His house and his throne will last forever", draw: (k) => {
        k.scene("night", "hills", { moonX: 18 });
        k.throne(56, 31); k.crown(56, 13);
        lineage(k, 70, 24, 7, 8, -2);
      } },
      { verse: 16, alt: "King David sits before the Lord in the tent and prays with thanks", draw: (k) => {
        k.room("tent"); k.lamp(110, 6);
        k.ark(80, 22);
        k.fig("David", "sit", 40, 21); k.glow(84, 22, 12 + k.pulse(1.5, 2), "#6a5a30");
      } },
    ],
    18: [
      { verse: 1, alt: "David's banner flies over Gath after he defeats the Philistines", draw: (k) => {
        k.scene("dawn", "city", { cityX: 80, cityW: 60, sunX: 24 });
        k.flag(78, 10, "#db2777");
        k.fig("David", "spear", 18, 19); k.fig("soldier", "stand", 32, 19);
      } },
      { verse: 3, alt: "David brings back Hadadezer's horses and gold shields from the Euphrates", draw: (k) => {
        k.scene("day", "desert", { sunX: 108 });
        const p = (k.t * 4) % 24;
        k.animal("horse", 6 + p, 24, false, true); k.animal("horse", 20 + p, 25, false, true);
        k.fig("soldier", "staff", 34 + p, 19);
        for (let i = 0; i < 3; i++) { k.disc(56 + p + i * 7, 26, 2, "#f2c230"); k.px(56 + p + i * 7, 26, "#fff0a0"); }
        k.fig("David", "stand", 98, 19, true);
      } },
      { verse: 9, alt: "King Tou sends his son Hadoram with gifts of gold, silver and bronze to greet David", draw: (k) => {
        k.room("palace"); k.lamp(64, 6);
        k.throne(16, 31); k.fig("David", "sit", 18, 21);
        k.fig("Hadoram", "bow", 54, 25, true);
        bars(k, 40, 31); bars(k, 70, 31, "#d8dce4"); bars(k, 84, 31, "#c08a40");
        k.fig("servant of Tou", "stand", 104, 19, true);
      } },
      { verse: 11, alt: "David gives all the gold, silver and bronze to the Lord", draw: (k) => {
        k.scene("dusk", "hills", { sunX: 64 });
        k.tent(46, 31, 36, 14, LINEN);
        bars(k, 30, 31); bars(k, 86, 31, "#d8dce4"); bars(k, 100, 31, "#c08a40");
        k.fig("David", "kneel", 14, 22);
      } },
      { verse: 14, alt: "David rules all Israel and does what is right and fair for his people", draw: (k) => {
        k.room("palace"); k.lamp(36, 6); k.lamp(92, 6);
        k.throne(56, 31); k.fig("David", "sit", 58, 21);
        k.fig("Jehoshaphat", "stand", 36, 19); k.scroll(26, 25);
        k.fig("woman of Israel", "kneel", 82, 22, true); k.fig("Zadok", "stand", 104, 19, true);
      } },
    ],
    19: [
      { verse: 2, alt: "David sends messengers to comfort King Hanun after his father Nahash dies", draw: (k) => {
        k.scene("dusk", "hills", { sunX: 30 });
        k.city(104, 30, 36, 10, true);
        const p = (k.t * 4) % 30;
        k.fig("David's officer", "staff", 20 + p, 19); k.fig("David's officer 2", "stand", 34 + p, 19);
      } },
      { verse: 5, alt: "David's ashamed officers wait in Jericho among the palm trees until their beards grow back", draw: (k) => {
        k.scene("day", "desert", { sunX: 110 });
        k.tree(10, 31, "palm"); k.tree(26, 31, "palm"); k.tree(100, 31, "palm"); k.tree(116, 31, "palm");
        k.city(64, 30, 26, 7);
        k.fig("David's officer", "sit", 34, 21); k.fig("David's officer 2", "sit", 84, 21, true);
        tally(k, 50, 4, 9, "#2a1a10", "#a8c8e0");
      } },
      { verse: 6, alt: "The Ammonites hire thousands of chariots and horsemen from Aram", draw: (k) => {
        k.scene("dusk", "desert", { sunX: 24 });
        for (let i = 0; i < 4; i++) {
          const x = 30 + i * 22 + Math.round(Math.sin(k.t + i) * 2);
          k.animal("horse", x, 24, true, true); k.cart(x + 9, 25);
        }
        k.flag(18, 31, "#8a8aa0"); k.flag(120, 31, "#8a8aa0");
      } },
      { verse: 10, alt: "Joab and Abishai turn back to back to face two armies, and say: Be strong and brave", draw: (k) => {
        k.scene("day", "valley", { sunX: 64 });
        k.fig("Joab", "sword", 58, 19, true); k.fig("Abishai", "sword", 66, 19);
        for (let i = 0; i < 3; i++) { k.fig("Aramean " + i, "spear", 4 + i * 10, 19); k.fig("Ammonite " + i, "spear", 98 + i * 10, 19, true); }
      } },
      { verse: 19, alt: "The kings who served Hadadezer lower their banners and make peace with David", draw: (k) => {
        k.scene("dawn", "hills", { sunX: 64 });
        k.fig("David", "stand", 24, 19);
        for (let i = 0; i < 3; i++) k.fig("king of Aram " + i, "bow", 52 + i * 14, 25, true);
        k.line(104, 31, 112, 24, "#5c3a1e"); k.rect(110, 26, 5, 3, "#8a8aa0");
      } },
    ],
    20: [
      { verse: 1, alt: "In the spring Joab's army camps around the Ammonite city of Rabbah", draw: (k) => {
        k.scene("day", "city", { cityX: 64, cityW: 44 });
        k.tent(4, 31, 16, 9); k.tent(108, 31, 16, 9);
        k.fig("Joab", "spear", 26, 19); k.flag(36, 31, "#db2777");
        for (let i = 0; i < 6; i++) k.px(6 + i * 22, 31 - (i % 2), (k.f + i) % 4 ? "#f2a0c0" : "#ffffff");
      } },
      { verse: 2, alt: "David takes the heavy gold crown with its precious stone from the king of Rabbah", draw: (k) => {
        k.scene("dusk", "city", { cityX: 100, cityW: 44 });
        k.fig("David", "stand", 44, 19);
        k.glow(48, 14, 6 + k.pulse(2), "#a8784a");
        k.rect(44, 13, 9, 3, "#f2c230"); for (let i = 0; i < 5; i++) k.px(44 + i * 2, 12, "#f2c230");
        k.px(48, 14, k.f % 6 < 3 ? "#3ad8a0" : "#a8ffe0");
        k.fig("soldier", "spear", 22, 19);
      } },
      { verse: 4, alt: "After the battle at Gezer, Sibbecai stands beside the fallen giant's huge spear and helmet", draw: (k) => {
        k.scene("dusk", "valley", { sunX: 104 });
        k.line(54, 31, 92, 29, "#8a6a3a"); k.rect(92, 27, 3, 3, "#d8dce4");
        k.rect(66, 29, 12, 2, "#c08a40"); k.rect(68, 28, 8, 1, "#c08a40"); k.px(72, 28, "#f2d070");
        k.fig("Sibbecai", "spear", 36, 19);
      } },
      { verse: 6, alt: "At Gath a giant with six fingers on each hand comes out against Israel, and Jonathan faces him", draw: (k) => {
        k.scene("day", "mountains", { sunX: 20 });
        k.fig("Jonathan son of Shimea", "sword", 34, 19);
        k.giant("giant of Gath", 74, 7);
        for (let i = 0; i < 6; i++) k.px(73 + (i % 3), 18 + Math.floor(i / 3), "#e0a96d");
      } },
    ],
    21: [
      { verse: 1, alt: "In a darkened hall David orders Joab to count all the fighting men of Israel", draw: (k) => {
        k.room("palace");
        for (let y = 0; y < 14; y += 2) for (let x = (y / 2) % 2; x < 128; x += 2) k.px(x, y, "#1a1018");
        k.lamp(64, 12);
        k.throne(16, 31); k.fig("David", "sit", 18, 21);
        k.fig("Joab", "stand", 88, 19, true); k.scroll(74, 25);
      } },
      { verse: 4, alt: "Joab travels through all Israel counting the men, his tally growing as he goes", draw: (k) => {
        k.scene("day", "hills", { sunX: 108 });
        k.tent(8, 31, 14, 8); k.tent(92, 31, 16, 9, "#b89a74"); k.tent(112, 31, 12, 7);
        const p = (k.t * 4) % 40;
        k.fig("Joab", "stand", 30 + p, 19); k.scroll(38 + p, 24);
        tally(k, 30, 4, 12, "#2a1a10", "#9cc3e6");
      } },
      { verse: 8, alt: "Alone at night, David kneels with his crown set aside and confesses his sin", draw: (k) => {
        k.room("palace");
        k.window(96, 6); k.disc(100, 9, 2, "#f4f0d8"); k.px(98, 8, "#e8e8ff");
        k.lamp(30, 16);
        k.crown(38, 28);
        k.fig("David", "kneel", 54, 22);
      } },
      { verse: 16, alt: "David sees the angel of the Lord between earth and sky over Jerusalem, and he and the elders bow in sackcloth", draw: (k) => {
        k.scene("dusk", "city", { cityX: 90, cityW: 60, sunX: 120 });
        k.angel(86, 3);
        k.fig("David", "bow", 14, 25); k.fig("elder", "bow", 26, 25); k.fig("elder 2", "bow", 38, 25);
      } },
      { verse: 20, alt: "Araunah is threshing wheat when he sees the angel, and his sons hide behind the sheaves", draw: (k) => {
        k.scene("day", "hills", { sunX: 14 });
        k.rect(30, 30, 52, 3, "#c8a868");
        const turn = Math.floor(k.t / 2) % 2;
        k.animal("ox", turn ? 44 : 58, 26, !!turn, true);
        k.fig("Araunah", "stand", 84, 19, true);
        k.fig("Araunah's son", "child", 104, 24); k.fig("Araunah's son 2", "child", 110, 24);
        for (let i = 0; i < 3; i++) { k.rect(100 + i * 6, 23, 3, 9, "#d8b860"); k.rect(99 + i * 6, 22, 5, 2, "#e8c870"); }
        k.angel(44, 1);
      } },
      { verse: 26, alt: "David builds an altar on the threshing floor, and the Lord answers with fire from heaven", draw: (k) => {
        k.scene("dawn", "city", { cityX: 104, cityW: 36, sunX: 104 });
        for (let y = 0; y < 22; y += 2) k.px(62 + ((y + k.f) % 3) - 1, y, y % 4 ? "#ffb03a" : "#ffe08a");
        k.line(62, 0, 62, 22, "#ff7a2f");
        k.altar(56, 31);
        k.fig("David", "praise", 30, 19); k.fig("Gad", "staff", 14, 19);
      } },
    ],
    22: [
      { verse: 1, alt: "David stands by his altar and sees where the house of the Lord will be built", draw: (k) => {
        k.scene("dusk", "hills", { sunX: 104 });
        const on = k.f % 16 < 12;
        for (let x = 52; x <= 100; x += 2) { if (on) { k.px(x, 10, "#f4e8b0"); k.px(x, 30, "#f4e8b0"); } }
        for (let y = 10; y <= 30; y += 2) { if (on) { k.px(52, y, "#f4e8b0"); k.px(100, y, "#f4e8b0"); k.px(62, y, "#f4e8b0"); k.px(90, y, "#f4e8b0"); } }
        for (let i = 0; i <= 12; i++) if (on) { k.px(64 + i * 2, 9 - Math.min(i, 12 - i) / 2, "#f4e8b0"); }
        k.fig("David", "stand", 22, 19); k.altar(34, 31);
      } },
      { verse: 2, alt: "Stonecutters shape blocks of stone for the house of God", draw: (k) => {
        k.scene("day", "hills", { sunX: 64 });
        stoneBlocks(k, 46, 31, 4);
        const up = Math.floor(k.t * 4) % 2;
        k.fig("stonecutter", "kneel", 20, 22); k.line(28, 24 - up * 3, 30, 27 - up * 2, "#8a8a92");
        k.fig("stonecutter 2", "kneel", 86, 22, true); k.line(85, 24 - (1 - up) * 3, 83, 27 - (1 - up) * 2, "#8a8a92");
        k.fig("stonecutter 3", "stand", 104, 19, true); k.rect(98, 17, 6, 3, "#a89a80");
      } },
      { verse: 3, alt: "David piles up iron, bronze beyond weighing, and cedar logs from Sidon and Tyre", draw: (k) => {
        k.scene("day", "none", { sunX: 112 });
        k.rect(0, 24, 128, 16, "#2c5a8c");
        for (let x = 0; x < 128; x += 7) k.px((x + k.t * 4) % 128, 26 + (x % 3), "#9cc0f0");
        k.ridge((x) => 28 + Math.sin(x / 9), "#d8c08a", 40, 0, 84);
        const bob = k.pulse(2, 1);
        boat(k, 92, 23 + bob, 30); k.rect(100, 18 + bob, 14, 1, "#7a4a28");
        bars(k, 6, 31, "#8a8a92"); bars(k, 24, 31, "#c08a40"); logs(k, 44, 31, 3);
        k.fig("David", "stand", 66, 17);
      } },
      { verse: 6, alt: "David calls young Solomon and tells him to build a house for the Lord", draw: (k) => {
        k.room("palace"); k.lamp(64, 6);
        k.fig("David", "sit", 30, 21);
        plan(k, 48, 12, 28, 14);
        k.fig("Solomon", "stand", 86, 19, true);
      } },
      { verse: 17, alt: "David commands all the leaders of Israel to help his son Solomon", draw: (k) => {
        k.scene("day", "city", { cityX: 100, cityW: 40 });
        k.fig("David", "stand", 12, 19); k.fig("Solomon", "stand", 52, 19);
        k.glow(55, 24, 7 + k.pulse(2), "#fff6c8");
        for (let i = 0; i < 3; i++) k.fig("leader " + i, i === 1 ? "bow" : "stand", 28 + i * 8 - (i === 1 ? 0 : 0), i === 1 ? 25 : 19);
        k.fig("leader 3", "stand", 66, 19, true); k.fig("leader 4", "stand", 76, 19, true);
      } },
    ],
    23: [
      { verse: 1, alt: "Old King David makes his son Solomon king over Israel", draw: (k) => {
        k.room("palace"); k.lamp(64, 6);
        k.throne(14, 31); k.fig("David", "sit", 16, 21); k.line(25, 18, 25, 30, "#7a5a32");
        k.fig("Solomon", "kneel", 44, 22, true);
        k.crown(46, 10 + ((k.t * 3) % 8));
      } },
      { verse: 3, alt: "The Levites aged thirty and over are counted, 38,000 men", draw: (k) => {
        k.scene("day", "hills", { sunX: 64 });
        for (let i = 0; i < 9; i++) k.fig("Levite " + i, "stand", 4 + i * 10, 14);
        for (let i = 0; i < 9; i++) k.fig("Levite " + (i + 9), "stand", 9 + i * 10, 19);
        k.fig("scribe", "sit", 108, 21, true); k.scroll(104, 18);
        tally(k, 98, 4, 8, "#2a1a10", "#9cc3e6");
      } },
      { verse: 13, alt: "Aaron is set apart to serve the Lord and to bless the people in His name", draw: (k) => {
        k.scene("dawn", "desert", { sunX: 64 });
        k.tent(44, 31, 40, 16, LINEN);
        k.fig("Aaron", "praise", 60, 18);
        rays(k, 64, 3, 16, 14, "#fff4c2");
        k.fig("Israelite", "bow", 14, 25); k.fig("Israelite 2", "bow", 28, 25);
        k.fig("Israelite 3", "bow", 92, 25, true); k.fig("Israelite 4", "bow", 106, 25, true);
      } },
      { verse: 28, alt: "Levites set out the holy bread and keep the temple's things clean", draw: (k) => {
        k.room("tent"); k.lamp(64, 6);
        breadTable(k, 30, 30);
        const p = (k.t * 3) % 16;
        k.fig("Levite", "stand", 52 + p, 19); k.rect(50 + p, 23, 4, 2, "#d8a868");
        k.fig("Levite 2", "kneel", 96, 22, true); k.disc(92, 29, 2, "#c08a40"); k.px(91 + (k.f % 3), 28, "#fff0a0");
      } },
      { verse: 30, alt: "Every morning and every evening the Levites stand to thank and praise the Lord", draw: (k) => {
        k.scene("dawn", "none", { sunX: 24 });
        const dusk = ["#2b1d4a", "#5b2a5e", "#a8435f", "#e0704a", "#f2a65a"];
        dusk.forEach((c, i) => k.rect(64, Math.round(i * 6.2), 64, 7, c));
        k.stars(14, "#e8e8ff", 12);
        k.glow(104, 27, 10, "#ffd27a"); k.disc(104, 27, 6, "#f2a65a");
        k.ridge((x) => 30 + Math.sin(x / 7) * 1.5, "#3a3048"); k.ridge(() => 36, "#2a2236");
        k.rect(63, 0, 2, 31, "#1a1222");
        k.fig("Levite", "praise", 24, 18); k.notes(30, 15, GOLD);
        k.fig("Levite 2", "praise", 92, 18); k.notes(98, 15, GOLD);
      } },
    ],
    24: [
      { verse: 1, alt: "Aaron's sons Eleazar and Ithamar serve as priests at the altar", draw: (k) => {
        k.scene("day", "desert", { sunX: 20 });
        k.altar(58, 31);
        k.fig("Eleazar", "stand", 40, 19); k.fig("Ithamar", "stand", 76, 19, true);
        k.tent(96, 31, 26, 12, LINEN);
      } },
      { verse: 5, alt: "Lots are drawn to divide the priests into groups, with Zadok and Ahimelech looking on", draw: (k) => {
        k.room("house"); k.lamp(64, 6);
        pot(k, 64, 31, "#a85a30");
        lots(k, 62, 20);
        k.fig("Zadok", "stand", 40, 19); k.fig("Ahimelech", "stand", 80, 19, true);
      } },
      { verse: 6, alt: "Shemaiah the scribe writes down each name before the king and the leaders", draw: (k) => {
        k.room("palace"); k.lamp(64, 6);
        k.throne(10, 31); k.fig("David", "sit", 12, 21);
        k.fig("Shemaiah", "sit", 44, 21); k.scroll(54, 24);
        const q = Math.floor(k.t * 4) % 8; k.px(55 + q, 25, "#2a1a10");
        k.fig("Zadok", "stand", 82, 19, true); k.fig("Ahimelech", "stand", 98, 19, true);
      } },
      { verse: 19, alt: "Each group of priests takes its turn to go into the temple and serve", draw: (k) => {
        k.scene("day", "city", { cityX: 20, cityW: 30 });
        temple(k, 78, 31, 40, 16);
        const p = (k.t * 5) % 24;
        for (let i = 0; i < 3; i++) k.fig("priest " + i, "stand", 44 + i * 10 + p, 19);
      } },
      { verse: 31, alt: "The Levite families cast lots too, the oldest the same as the youngest", draw: (k) => {
        k.scene("dusk", "hills", { sunX: 104 });
        k.fig("old Levite", "staff", 34, 19); lots(k, 60, 24);
        k.fig("young Levite", "stand", 76, 19, true);
        k.fire(60, 31, 4);
      } },
    ],
    25: [
      { verse: 1, alt: "The sons of Asaph, Heman and Jeduthun prophesy with lyres, harps and cymbals", draw: (k) => {
        k.room("palace"); k.lamp(64, 6);
        k.glow(64, 20, 14 + k.pulse(1.5, 2), "#5a4020");
        k.fig("Asaph", "stand", 20, 19); cymbals(k, 28, 25); k.notes(26, 16, GOLD);
        k.fig("Heman", "stand", 58, 19); harp(k, 65, 21); k.notes(66, 16, GOLD);
        k.fig("Jeduthun", "stand", 96, 19, true); k.sprite(_SC_LYRE, _SC_PAL, 90, 24); k.notes(94, 16, GOLD);
      } },
      { verse: 3, alt: "Jeduthun plays the harp on the hillside at dawn, giving thanks and praise to the Lord", draw: (k) => {
        k.scene("dawn", "hills", { sunX: 90 });
        k.fig("Jeduthun", "sit", 46, 21); harp(k, 54, 21);
        k.notes(58, 18, GOLD); k.notes(70, 14, "#f2efe6");
        k.tree(14, 30, "oak", "#2e4a3a");
      } },
      { verse: 5, alt: "Heman's fourteen sons and three daughters sing in the house of the Lord", draw: (k) => {
        k.scene("day", "hills", { sunX: 64 });
        k.fig("Heman", "praise", 60, 18);
        for (let i = 0; i < 8; i++) {
          const x = i < 4 ? 8 + i * 11 : 74 + (i - 4) * 11, hop = (Math.floor(k.t * 3) + i) % 4 === 0 ? 1 : 0;
          k.fig("Heman's child " + i, "child", x, 24 - hop, i >= 4);
        }
        k.notes(30, 18, GOLD); k.notes(96, 18, GOLD);
      } },
      { verse: 8, alt: "Musicians cast lots for their duties, teacher and student alike", draw: (k) => {
        k.scene("dusk", "city", { cityX: 104, cityW: 36 });
        k.fig("teacher", "staff", 28, 19); k.sprite(_SC_LYRE, _SC_PAL, 37, 25);
        lots(k, 52, 24);
        k.fig("student", "child", 66, 24, true); harp(k, 60, 22);
      } },
    ],
    26: [
      { verse: 1, alt: "Strong gatekeepers from Korah's family stand at the temple gate", draw: (k) => {
        k.scene("day", "hills", { sunX: 110 });
        gate(k, 52, 31, 0);
        k.fig("Meshelemiah", "spear", 22, 19); k.fig("Zechariah", "spear", 38, 19);
        k.fig("gatekeeper", "spear", 80, 19, true); k.fig("gatekeeper 2", "spear", 96, 19, true);
      } },
      { verse: 5, alt: "God blesses Obed-Edom with eight sons, all of them able gatekeepers", draw: (k) => {
        k.scene("dawn", "hills", { sunX: 64 });
        k.fig("Obed-Edom", "praise", 60, 18);
        for (let i = 0; i < 8; i++) k.fig("Obed-Edom's son " + i, "stand", i < 4 ? 4 + i * 12 : 74 + (i - 4) * 12, 19, i >= 4);
      } },
      { verse: 13, alt: "Lots decide which family will guard each of the four gates of the temple court", draw: (k) => {
        k.scene("day", "none", { sunX: 120 });
        k.rect(0, 0, 128, 40, "#8aa85a");
        k.rect(34, 4, 60, 32, "#a89a80"); k.rect(38, 8, 52, 24, "#d8c8a0");
        const g = Math.floor(k.t * 1.5) % 4;
        [[60, 4, 8, 4], [60, 32, 8, 4], [34, 16, 4, 8], [90, 16, 4, 8]].forEach(([x, y, w, h], i) => k.rect(x, y, w, h, i === g ? GOLD : "#4a3020"));
        lots(k, 62, 22);
        k.fig("gatekeeper", "stand", 12, 19); k.fig("gatekeeper 2", "stand", 108, 19, true);
      } },
      { verse: 20, alt: "Levites guard the temple treasuries, full of gold and gifts taken from battle and given to God", draw: (k) => {
        k.room("house"); k.lamp(64, 6);
        bars(k, 30, 31); bars(k, 46, 31, "#d8dce4"); bars(k, 76, 31, "#c08a40");
        k.rect(90, 24, 14, 7, "#6a4428"); k.rect(90, 24, 14, 2, "#8a5a32"); k.px(96, 27, GOLD);
        k.fig("Ahijah", "spear", 10, 19); k.fig("treasurer", "stand", 108, 19, true);
      } },
      { verse: 29, alt: "Outside the temple, officials and judges hear the people's cases", draw: (k) => {
        k.scene("day", "city", { cityX: 64, cityW: 70 });
        k.fig("Kenaniah", "sit", 56, 21); k.rect(52, 31, 18, 1, "#5a4030");
        k.fig("man of Israel", "stand", 30, 19); k.fig("man of Israel 2", "stand", 84, 19, true);
        k.scroll(68, 24);
      } },
    ],
    27: [
      { verse: 1, alt: "Twelve army divisions take turns serving the king, one for each month of the year", draw: (k) => {
        k.scene("night", "hills", { noMoon: true });
        const m = Math.floor(k.t * 1.5) % 12;
        for (let i = 0; i < 12; i++) k.disc(8 + i * 10, 6, 2, i === m ? "#f4f0d8" : "#3a4a6a");
        for (let i = 0; i < 4; i++) k.fig("division " + ((m + i) % 12), "spear", 20 + i * 24, 19);
      } },
      { verse: 23, alt: "David does not count the young, for God has promised Israel will be as many as the stars", draw: (k) => {
        k.scene("night", "hills", { moonX: 110 });
        k.stars(50, "#fff6c8", 24);
        k.fig("David", "stand", 52, 19); k.fig("child", "child", 62, 24, true);
      } },
      { verse: 25, alt: "The king's fields are ploughed and his vineyards and olive groves are tended", draw: (k) => {
        k.scene("day", "field", { crop: "#6a8a3a", cropTop: "#a0b050", sunX: 20 });
        const p = (k.t * 3) % 30;
        k.animal("ox", 10 + p, 26, false, true); k.line(20 + p, 28, 26 + p, 31, "#5c3a1e"); k.fig("farmer", "staff", 26 + p, 19);
        for (let i = 0; i < 4; i++) { k.line(82 + i * 10, 31, 82 + i * 10, 24, "#5c3a1e"); k.disc(82 + i * 10, 22, 2, "#4a7a2a"); k.px(83 + i * 10, 23, "#7a3a8a"); }
        k.tree(118, 30, "oak", "#7a9a5a");
      } },
      { verse: 29, alt: "The king's cattle, camels, donkeys and flocks graze in the pastures", draw: (k) => {
        k.scene("day", "valley", { sunX: 64 });
        k.animal("ox", 6, 26); k.animal("ox", 20 + k.pulse(0.6, 2), 27);
        camel(k, 42, 24, false, true); k.animal("donkey", 60, 24, true);
        k.animal("sheep", 82, 27, false, true); k.animal("sheep", 92, 28); k.animal("sheep", 102, 27, true);
        k.fig("Jaziz", "staff", 112, 19, true);
      } },
      { verse: 32, alt: "Jonathan the wise counsellor writes the records while Jehiel teaches the king's sons", draw: (k) => {
        k.room("palace"); k.lamp(64, 6);
        k.fig("Jonathan", "sit", 14, 21); k.scroll(24, 24);
        k.fig("Jehiel", "staff", 62, 19);
        k.fig("king's son", "child", 80, 24, true); k.fig("king's son 2", "child", 90, 24, true);
        k.fig("Hushai", "stand", 108, 19, true);
      } },
    ],
    28: [
      { verse: 1, alt: "David gathers all the officials and leaders of Israel in Jerusalem", draw: (k) => {
        k.scene("day", "city", { cityX: 64, cityW: 80 });
        k.rect(48, 26, 32, 5, "#a89a80"); k.rect(52, 24, 24, 2, "#b8aa90");
        k.fig("David", "stand", 60, 12);
        for (let i = 0; i < 4; i++) { k.fig("official " + i, "stand", 4 + i * 11, 19); k.fig("official " + (i + 4), "stand", 86 + i * 11, 19, true); }
      } },
      { verse: 9, alt: "David tells Solomon to know God and serve Him with all his heart", draw: (k) => {
        k.scene("dusk", "hills", { sunX: 64 });
        k.fig("David", "stand", 46, 19); k.fig("Solomon", "stand", 58, 19, true);
        const b = Math.floor(k.t * 3) % 2;
        k.sprite([".r.r.", "rrrrr", ".rrr.", "..r.."], { r: b ? "#ff5a7a" : "#d42a4a" }, 60, 10);
      } },
      { verse: 11, alt: "David gives Solomon the plans for the temple that God put in his mind", draw: (k) => {
        k.room("palace"); k.lamp(16, 6); k.lamp(112, 6);
        plan(k, 48, 6, 32, 18);
        k.fig("David", "stand", 32, 19); k.fig("Solomon", "stand", 88, 19, true);
      } },
      { verse: 20, alt: "Be strong and brave, David tells Solomon at the temple site among the stones and cedar", draw: (k) => {
        k.scene("dawn", "hills", { sunX: 64 });
        stoneBlocks(k, 10, 31, 3); logs(k, 98, 31, 3);
        k.fig("Solomon", "stand", 60, 19); k.glow(63, 16, 6 + k.pulse(2), "#a8784a");
        k.fig("David", "staff", 40, 19);
      } },
    ],
    29: [
      { verse: 6, alt: "The leaders gladly bring gold, silver, bronze and iron for the house of God", draw: (k) => {
        k.scene("day", "city", { cityX: 108, cityW: 34 });
        const n = 1 + (Math.floor(k.t) % 4);
        for (let i = 0; i < n; i++) bars(k, 56 + (i % 2) * 14, 31 - Math.floor(i / 2) * 6, ["#f2c230", "#d8dce4", "#c08a40", "#8a8a92"][i]);
        const p = (k.t * 4) % 20;
        k.fig("leader", "stand", 14 + p, 19); k.rect(19 + p, 24, 4, 2, "#f2c230");
        k.fig("leader 2", "stand", 2 + p, 19);
        k.fig("David", "praise", 86, 19);
      } },
      { verse: 10, alt: "David praises the Lord before the whole assembly: Yours is the greatness and the power", draw: (k) => {
        k.scene("noon", "hills", { sunX: 64 });
        rays(k, 64, 7, 60, 20);
        k.fig("David", "praise", 60, 17);
        for (let i = 0; i < 3; i++) { k.fig("Israelite " + i, "stand", 6 + i * 12, 19); k.fig("Israelite " + (i + 3), "stand", 90 + i * 12, 19, true); }
      } },
      { verse: 20, alt: "The whole assembly bows low and worships the Lord", draw: (k) => {
        k.scene("dawn", "city", { cityX: 104, cityW: 36, sunX: 104 });
        for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) k.fig("worshipper " + (r * 6 + i), "bow", 4 + i * 12 + r * 6, 22 + r * 4);
      } },
      { verse: 22, alt: "With feasting and joy, Solomon is anointed king a second time and Zadok as priest", draw: (k) => {
        k.scene("day", "city", { cityX: 104, cityW: 36 });
        k.fig("Solomon", "kneel", 24, 22); k.fig("Zadok", "horn", 34, 19, true);
        for (let i = 0; i < 3; i++) k.px(31, 22 + ((k.t * 6 + i * 2) % 5), GOLD);
        k.rect(52, 27, 34, 3, WOOD); k.disc(60, 26, 2, "#e0a96d"); k.disc(70, 26, 2, "#c8504a"); k.disc(78, 26, 2, "#d8a868");
        k.fig("Israelite", "sit", 46, 21); k.fig("Israelite 2", "sit", 86, 21, true);
      } },
      { verse: 28, alt: "David dies at a good old age; his crown and harp rest by the throne as the sun sets on Jerusalem", draw: (k) => {
        k.scene("dusk", "city", { cityX: 96, cityW: 56, sunX: 96 });
        k.throne(30, 31); k.crown(34, 22);
        k.sprite(_SC_LYRE, _SC_PAL, 44, 25);
        k.scroll(54, 27);
        k.birds(3, 8, "#2a1a2a");
      } },
    ],
  };

  for (const [ch, scenes] of Object.entries(NR)) {
    if (typeof _NR_SCENES !== "undefined") _NR_SCENES["1CH-" + ch] = scenes;
  }
})();
