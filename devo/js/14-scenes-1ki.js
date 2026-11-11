// 14-scenes-1ki.js — the 8-bit scene banners for 1 Kings.
//
// Same kit as 2 Samuel (13-scenes-2sa.js): each chapter is a list of scenes
// keyed by the verse they open on, drawn on the 128×40 canvas. Hard moments
// (executions, Naboth, the Baal prophets, Ahab's death) are shown by their
// setting or aftermath, never the act. Wrapped in an IIFE so the local helpers
// (temple, chariot, raven, calf...) do not leak into the shared script scope.

(function () {
  const GOLD = "#f2c230", GOLD2 = "#c9a046", STONE = "#d8cdb0", STONE2 = "#bfb294";
  const BRONZE = "#b07a3a", BRONZE2 = "#d0964a", WOOD = "#8a5a32", DARK = "#1a1218";

  // ── Local helpers ────────────────────────────────────────────────────────
  // The Lord's temple: limestone, gold trim, the bronze pillars at the porch.
  function temple(k, x, base, o = {}) {
    const w = o.w ?? 40, h = o.h ?? 15, cx = x + Math.floor(w / 2);
    k.rect(cx - 9, base - h - 6, 18, 6, STONE);
    k.rect(cx - 10, base - h - 7, 20, 1, GOLD2);
    k.rect(x, base - h, w, h, STONE);
    for (let i = 2; i < w; i += 5) k.rect(x + i, base - h + 1, 1, h - 1, STONE2);
    k.rect(x - 2, base - h - 1, w + 4, 2, GOLD2);
    for (let i = 4; i < w - 4; i += 7) k.rect(x + i, base - h + 3, 2, 2, "#3a2e24");
    k.rect(cx - 3, base - 9, 6, 9, o.lit ? "#f7d154" : "#5a3a22");
    if (o.lit) k.glow(cx, base - 5, 7 + k.pulse(2), "#fff1b0");
    if (o.ruin) return;
    for (const px of [cx - 7, cx + 5]) { k.rect(px, base - 11, 2, 11, BRONZE); k.rect(px - 1, base - 12, 4, 2, BRONZE2); }
  }
  // A chariot with one horse; the driver's legs hide behind the box.
  function chariot(k, x, base, flip = false, who = null, pose = "stand") {
    const box = flip ? x + 11 : x, hx = flip ? x : x + 9;
    if (who) k.fig(who, pose, box, base - 15, flip);
    k.animal("horse", hx, base - 7, flip, true);
    k.line(flip ? box : box + 7, base - 4, flip ? hx + 7 : hx + 2, base - 4, "#5c3a1e");
    k.rect(box, base - 7, 8, 4, WOOD); k.rect(box, base - 7, 8, 1, GOLD2);
    const wx = box + 4, wy = base - 2, a = k.t * 6;
    k.disc(wx, wy, 2, "#3a2418"); k.px(wx, wy, GOLD2);
    k.px(wx + Math.round(Math.cos(a) * 2), wy + Math.round(Math.sin(a) * 2), "#c9a046");
  }
  function raven(k, x, y, bread = false) {
    const up = Math.floor(k.t * 5 + x / 7) % 2;
    k.sprite(up ? ["k...k...", ".k.k....", "..kkkkb.", "....k..."] : ["........", "..kkkkb.", ".k.k....", "k...k..."], { k: "#1a1a22", b: "#e8b830" }, x, y);
    if (bread) k.rect(x + 7, y + 2, 2, 2, "#d8a860");
  }
  function calf(k, x, base) {
    k.glow(x + 5, base - 7, 8 + k.pulse(2), "#8a6a20");
    k.rect(x - 1, base - 4, 12, 4, "#8a8070"); k.rect(x - 1, base - 4, 12, 1, "#a89c88");
    k.sprite(_SC_ANIMAL.ox.rows, { b: GOLD, h: "#fff0a0", e: "#8a6a20" }, x, base - 9);
  }
  function ship(k, x, y, sail = "#f3e6c4") {
    const yy = y + Math.round(Math.sin(k.t * 2 + x / 9));
    for (let i = 0; i < 3; i++) k.rect(x + i, yy + i, 22 - i * 2, 1, i ? "#5a3820" : WOOD);
    k.line(x + 11, yy - 1, x + 11, yy - 13, "#5c3a1e");
    k.rect(x + 5, yy - 12, 12, 9, sail); k.rect(x + 5, yy - 9, 12, 1, "#c8504a");
    k.px(x + 11, yy - 14, "#c8504a"); k.px(x + 12 + (k.f % 4 < 2 ? 0 : 1), yy - 14, "#c8504a");
  }
  function sea(k, y, c = "#2c5a8c") {
    k.rect(0, y, 128, 40 - y, c);
    for (let x = 0; x < 128; x += 5) k.px((x + k.t * 5) % 128, y + 1 + (x % 4), "#9cc0f0");
  }
  function bed(k, x, y, w) {
    k.rect(x, y, w, 3, WOOD); k.rect(x, y, w, 1, "#e8dcc0");
    k.rect(x, y + 3, 1, 3, "#5c3a1e"); k.rect(x + w - 1, y + 3, 1, 3, "#5c3a1e");
  }
  function table(k, x, y, w) {
    k.rect(x, y, w, 2, WOOD);
    k.rect(x + 1, y + 2, 1, 3, "#5c3a1e"); k.rect(x + w - 2, y + 2, 1, 3, "#5c3a1e");
  }
  function tomb(k, x, base) {
    k.disc(x + 8, base - 6, 8, "#6a6050"); k.rect(x, base - 6, 17, 6, "#6a6050");
    k.rect(x + 5, base - 8, 6, 8, DARK); k.disc(x + 13, base - 4, 4, "#8a8070");
  }
  function cedar(k, x, base, h = 18) {
    k.rect(x, base - h, 2, h, "#5c3a1e");
    for (let i = 0; i < 4; i++) {
      const y = base - h + 1 + i * 4, w = 3 + i * 2, sway = (k.f + i * 3 + x) % 16 < 8 ? 0 : 1;
      k.rect(x + 1 - w + sway, y, w * 2, 2, i % 2 ? "#2e5a2a" : "#3a6e30");
    }
  }
  function cherub(k, x, y, flip = false, reach = 10) {
    const P = { c: "#f7d154", s: "#f2d070", e: "#8a6a20", b: "#f2d070", t: GOLD, T: "#d8a820", w: "#fff0a0", l: "#d8a820", h: "#f2d070" };
    k.sprite(_SCK.stand, P, x, y, flip);
    const d = flip ? -1 : 1, sx = x + 3, flap = Math.floor(k.t * 1.5) % 2;
    for (let f = 0; f < 3; f++) k.line(sx, y + 5 + f, sx + d * (reach - f * 2), y + 1 + f * 2 + flap, f ? "#e8b830" : "#fff0a0");
    for (let f = 0; f < 3; f++) k.line(sx, y + 5 + f, sx - d * (6 - f * 2), y + 2 + f * 2, "#d8a820");
  }
  function menorah(k, x, base) {
    k.rect(x, base - 8, 1, 8, GOLD); k.rect(x - 2, base - 1, 5, 1, GOLD);
    for (const d of [-3, -2, -1, 1, 2, 3]) k.line(x, base - 5 + Math.abs(d) - 3, x + d, base - 8, GOLD);
    for (const d of [-3, -2, -1, 0, 1, 2, 3]) k.px(x + d, base - 9 - ((k.f + d + 3) % 3 === 0 ? 1 : 0), (k.f + d) % 2 ? "#ffd27a" : "#ff9a3c");
  }
  const CAMEL = ["..........hh", "...bb.....hb", "..bbbb....h.", ".bbbbbbbbbh.", "bbbbbbbbbb..", ".b.b...b.b..", ".b.b...b.b.."];
  function camel(k, x, base, flip = false, load = "#c8504a") {
    const bob = Math.floor(k.t * 3 + x) % 2 ? -1 : 0;
    k.sprite(CAMEL, { b: "#c8a06a", h: "#b08a58" }, x, base - 7 + bob, flip);
    if (load) k.rect(x + 3, base - 9 + bob, 4, 2, load);
  }
  function pyramid(k, x, base, h = 12) {
    for (let i = 0; i < h; i++) k.rect(x - i, base - h + i, i * 2 + 1, 1, i % 3 ? "#d8b878" : "#c0a060");
  }
  function highPlace(k, x, base) {
    k.rect(x, base - 4, 18, 4, "#7a6a58"); k.rect(x, base - 4, 18, 1, "#9a8a74");
    k.rect(x + 3, base - 18, 2, 14, "#6a4a2a"); k.rect(x + 1, base - 15, 6, 2, "#8a6a3a"); k.disc(x + 4, base - 19, 2, "#8a6a3a");
    k.fire(x + 12, base - 4, 5); k.smoke(x + 12, base - 8);
  }
  function blocks(k, x, base, n = 3) {
    for (let i = 0; i < n; i++) { k.rect(x + i * 7, base - 5, 6, 5, "#c8bca0"); k.rect(x + i * 7, base - 5, 6, 1, "#e0d6bc"); }
  }

  const NR = {
    1: [
      { verse: 1, alt: "Old King David lies under a pile of blankets while young Abishag looks after him", draw: (k) => {
        k.room("palace"); k.lamp(108, 10);
        bed(k, 28, 27, 46); k.fig("David", "lie", 32, 24);
        k.rect(37, 24, 14, 2, "#6a4a8a"); k.rect(38, 23, 12, 1, "#8a6aa8"); k.rect(36, 26, 16, 1, "#4a3a6a");
        k.fig("Abishag", "stand", 82, 19, true);
        for (let i = 0; i < 3; i++) { const p = (k.t * 0.7 + i / 3) % 1; if (p < 0.6) k.px(31 - i, 22 - p * 8, "#cfe4f2"); }
      } },
      { verse: 5, alt: "Adonijah rides out in a chariot with men running ahead of him, telling everyone he will be king", draw: (k) => {
        k.scene("day", "hills");
        const p = ((k.t * 12) % 190) - 70;
        chariot(k, p, 31, false, "Adonijah");
        for (let i = 0; i < 4; i++) k.fig("runner " + i, "run", p + 24 + i * 10, 19);
      } },
      { verse: 15, alt: "Bathsheba bows low before the old king in his room while Nathan waits at the door", draw: (k) => {
        k.room("palace"); k.lamp(64, 8);
        bed(k, 8, 27, 30); k.fig("David", "sit", 16, 18); k.rect(10, 25, 16, 2, "#6a4a8a");
        k.fig("Bathsheba", "bow", 50, 25, true);
        k.rect(98, 10, 14, 20, DARK); k.fig("Nathan", "stand", 102, 19, true);
      } },
      { verse: 38, alt: "At the Gihon spring Zadok pours oil on Solomon, the trumpet blows and the people shout, Long live King Solomon", draw: (k) => {
        k.scene("day", "hills");
        k.rect(96, 30, 32, 3, "#2c5a8c"); for (let x = 98; x < 126; x += 5) k.px(x + (k.f % 4), 31, "#9cc0f0");
        k.animal("donkey", 4, 24);
        k.fig("Solomon", "kneel", 28, 22); k.fig("Zadok", "horn", 38, 19, true);
        for (let i = 0; i < 3; i++) k.px(35, 21 + ((k.t * 6 + i * 2) % 5), "#f7d154");
        k.fig("Nathan", "stand", 50, 19, true); k.fig("trumpeter", "trumpet", 62, 19);
        k.fig("crowd 1", "praise", 76, 20); k.fig("crowd 2", "praise", 88, 20); k.fig("crowd 3", "dance", 104, 21);
      } },
      { verse: 50, alt: "Afraid of Solomon, Adonijah runs to the holy tent and holds on to the horns of the altar", draw: (k) => {
        k.scene("dusk", "hills");
        k.tent(66, 31, 36, 15, "#c8b08a");
        k.altar(44, 31); for (const hx of [44, 55]) { k.px(hx, 23, "#a89c88"); k.px(hx, 22, "#a89c88"); }
        k.fig("Adonijah", "kneel", 35, 22);
        k.fig("messenger", "stand", 112, 19, true);
      } },
    ],
    2: [
      { verse: 1, alt: "Dying King David gives Solomon his last instructions from his bed", draw: (k) => {
        k.room("palace"); k.lamp(18, 10);
        bed(k, 34, 27, 38); k.fig("David", "lie", 38, 24); k.rect(44, 24, 12, 2, "#6a4a8a");
        k.fig("Solomon", "kneel", 76, 22, true); k.crown(64, 25);
      } },
      { verse: 10, alt: "David is buried in the City of David as the mourners weep at dusk", draw: (k) => {
        k.scene("dusk", "city", { cityX: 98, cityW: 44 });
        tomb(k, 14, 31);
        k.fig("Solomon", "weep", 40, 19); k.fig("Bathsheba", "weep", 52, 19); k.fig("Nathan", "weep", 64, 19);
      } },
      { verse: 19, alt: "King Solomon gives his mother Bathsheba a throne at his right side", draw: (k) => {
        k.room("palace"); k.lamp(64, 8); k.lamp(112, 10);
        k.rect(20, 30, 50, 1, "#c9a046");
        k.throne(28, 31); k.fig("Solomon", "sit", 30, 21);
        k.throne(46, 31); k.fig("Bathsheba", "sit", 48, 21);
        k.fig("servant", "stand", 92, 19, true);
      } },
      { verse: 26, alt: "Abiathar the priest walks home to his fields at Anathoth, sent away by the king", draw: (k) => {
        k.scene("dusk", "field");
        k.city(20, 26, 26, 8, true);
        const p = (k.t * 4) % 60; k.fig("Abiathar", "staff", 50 + p, 19);
        k.tree(110, 29);
      } },
      { verse: 39, alt: "Shimei saddles his donkey and leaves Jerusalem for Gath to fetch his runaway slaves", draw: (k) => {
        k.scene("dawn", "desert");
        k.city(14, 28, 24, 10); k.city(114, 28, 20, 8);
        const p = (k.t * 5) % 70;
        k.animal("donkey", 36 + p, 24, false, true); k.fig("Shimei", "run", 26 + p, 19);
      } },
    ],
    3: [
      { verse: 4, alt: "At Gibeon Solomon offers a thousand burnt offerings on the altar", draw: (k) => {
        k.scene("day", "hills");
        k.altar(20, 31); k.altar(56, 31); k.altar(92, 31);
        k.fig("Solomon", "praise", 38, 20); k.fig("priest", "stand", 74, 19); k.animal("sheep", 110, 27, true);
      } },
      { verse: 5, alt: "In the night at Gibeon the Lord appears to Solomon in a dream", draw: (k) => {
        k.scene("night", "hills", { noMoon: true });
        k.tent(10, 31, 22, 12);
        k.glow(70, 9, 11 + k.pulse(2), "#6a6440"); k.disc(70, 9, 3, "#fff8d0");
        for (let i = 0; i < 4; i++) k.line(70, 12, 50 + i * 4, 27, "#5a5a40");
        k.fig("Solomon", "lie", 48, 27);
      } },
      { verse: 16, alt: "Two women stand before King Solomon, each saying the living baby is hers", draw: (k) => {
        k.room("palace"); k.lamp(64, 8);
        k.throne(12, 31); k.fig("Solomon", "sit", 14, 21);
        k.fig("first woman", "stand", 56, 19, true); k.sprite(_SCK.baby, _SC_PAL, 54, 25);
        k.fig("second woman", "stand", 76, 19, true); k.fig("guard", "spear", 104, 19, true);
      } },
      { verse: 26, alt: "The real mother falls to her knees and begs the king to let the baby live", draw: (k) => {
        k.room("palace"); k.lamp(40, 8);
        k.throne(12, 31); k.fig("Solomon", "sit", 14, 21);
        k.rect(46, 29, 10, 1, "#e8dcc0"); k.sprite(_SCK.baby, _SC_PAL, 49, 25 + (k.f % 8 < 4 ? 0 : 1));
        k.fig("first woman", "kneel", 62, 22, true); k.fig("second woman", "stand", 82, 19, true);
        k.fig("guard", "stand", 104, 19, true);
      } },
      { verse: 28, alt: "All Israel hears of the king's wise judgement and stands in awe", draw: (k) => {
        k.scene("day", "city", { cityX: 30, cityW: 50 });
        k.fig("Solomon", "front", 22, 13);
        for (let i = 0; i < 5; i++) k.fig("Israelite " + i, "bow", 58 + i * 13, 26 + (Math.floor(k.t * 1.5 + i * 0.5) % 2), true);
      } },
    ],
    4: [
      { verse: 1, alt: "King Solomon sits on his throne with his officials and scribes around him", draw: (k) => {
        k.room("palace"); k.lamp(20, 8); k.lamp(108, 8);
        k.throne(52, 31); k.fig("Solomon", "sit", 54, 21);
        k.fig("Azariah", "stand", 30, 19); k.fig("Benaiah", "spear", 88, 19, true);
        k.fig("scribe", "sit", 6, 21); k.scroll(14, 26 + (k.f % 6 < 3 ? 0 : 1));
      } },
      { verse: 20, alt: "The people of Judah and Israel, many as the sand, eat and drink and are happy", draw: (k) => {
        k.scene("dusk", "hills");
        table(k, 20, 26, 70); k.disc(32, 25, 2, "#e0a96d"); k.disc(50, 25, 2, "#c8504a"); k.disc(68, 25, 2, "#8a4a8a"); k.px(80, 24, "#e8dcc0");
        k.fig("guest 1", "sit", 12, 20); k.fig("guest 2", "sit", 92, 20, true);
        k.fig("guest 3", "front", 40, 14); k.fig("guest 4", "front", 58, 14);
        k.fig("dancer", "dance", 108, 21); k.notes(116, 20, "#f7d154");
      } },
      { verse: 25, alt: "Every family lives safely, resting under their own vine and fig tree", draw: (k) => {
        k.scene("day", "hills");
        k.rect(10, 22, 16, 9, "#c8b896"); k.rect(9, 21, 18, 1, "#a8987a"); k.rect(16, 25, 4, 6, "#5a3a22");
        k.line(28, 30, 28, 16, "#5c3a1e"); k.line(28, 16, 50, 16, "#4a8a3a");
        for (let x = 30; x < 50; x += 4) { k.px(x, 17, "#7a3a8a"); k.px(x + 1, 18, "#7a3a8a"); }
        k.fig("father", "sit", 34, 21); k.fig("child", "child", 46, 24);
        k.tree(84, 30, "oak", "#4a7a32"); k.fig("mother", "sit", 92, 21, true);
        k.birds(2, 6);
      } },
      { verse: 26, alt: "Long stables full of the horses that pull Solomon's chariots", draw: (k) => {
        k.scene("day", "hills");
        k.rect(0, 16, 128, 3, "#6a4a30"); for (let x = 2; x < 128; x += 16) k.rect(x, 19, 2, 12, "#5c3a1e");
        for (let i = 0; i < 5; i++) k.animal("horse", 6 + i * 24, 24 + (Math.floor(k.t * 2 + i) % 3 === 0 ? -1 : 0));
        k.fig("stable boy", "stand", 116, 19, true);
      } },
      { verse: 29, alt: "Solomon teaches about trees, animals and birds while visitors from other lands listen", draw: (k) => {
        k.scene("day", "hills");
        cedar(k, 14, 31, 22); k.fig("Solomon", "staff", 22, 19);
        k.animal("ox", 36, 26); k.birds(4, 6);
        k.fig("visitor", "stand", 66, 19, true); k.fig("visitor 2", "stand", 80, 19, true); k.fig("visitor 3", "sit", 96, 21, true);
        k.notes(30, 16, "#f7d154");
      } },
    ],
    5: [
      { verse: 1, alt: "From his city by the sea, King Hiram of Tyre sends men to Solomon", draw: (k) => {
        k.scene("day", "none");
        sea(k, 27);
        k.rect(68, 27, 60, 13, "#c8a06a"); k.city(102, 27, 40, 12);
        ship(k, 16, 26);
        k.fig("Hiram", "front", 72, 15); k.fig("messenger", "run", 56 - ((k.t * 5) % 20), 15, true);
      } },
      { verse: 6, alt: "Woodcutters fell the tall cedars of Lebanon for the temple", draw: (k) => {
        k.scene("day", "mountains");
        for (const x of [8, 26, 96, 116]) cedar(k, x, 31, 20);
        k.rect(40, 29, 30, 2, WOOD); k.rect(40, 29, 2, 2, "#c8a06a");
        const sw = Math.floor(k.t * 3) % 2;
        k.fig("woodcutter", "stand", 78, 19); k.line(85, 23 - sw * 3, 89, 21 - sw, "#8a8a92");
        if (sw) { k.px(92, 22, "#e0c08a"); k.px(93, 20, "#e0c08a"); }
        k.fig("Sidonian", "stand", 50, 18);
      } },
      { verse: 9, alt: "Cedar logs are tied together and floated along the sea on rafts", draw: (k) => {
        k.scene("dawn", "none");
        sea(k, 26);
        k.ridge((x) => 24 + Math.sin(x / 5) * 2, "#3a3048", 27, 96, 128);
        for (let r = 0; r < 2; r++) {
          const x = ((k.t * 4 + r * 60) % 150) - 30, y = 27 + r * 4 + Math.round(Math.sin(k.t * 2 + r));
          for (let i = 0; i < 4; i++) k.rect(x, y + i, 24, 1, i % 2 ? "#6a4028" : WOOD);
          if (r === 0) k.fig("raftsman", "staff", x + 8, y - 12);
        }
      } },
      { verse: 15, alt: "Thousands of workers cut big stones in the hill country for the temple foundation", draw: (k) => {
        k.scene("noon", "mountains");
        blocks(k, 60, 31, 3); k.rect(64, 21, 6, 5, "#c8bca0");
        for (let i = 0; i < 3; i++) {
          const x = 10 + i * 16, hit = Math.floor(k.t * 3 + i) % 2;
          k.fig("stonecutter " + i, "kneel", x, 22);
          k.line(x + 8, 26, x + 10, 24 - hit * 3, "#8a8a92");
          if (hit) { k.px(x + 12, 27, "#ffe08a"); k.px(x + 13, 25, "#ffe08a"); }
          k.rect(x + 10, 27, 5, 4, "#c8bca0");
        }
        k.fig("overseer", "staff", 104, 19, true);
      } },
    ],
    6: [
      { verse: 1, alt: "The temple walls rise as workers set stones that were cut and shaped at the quarry, so no hammer is heard", draw: (k) => {
        k.scene("day", "hills");
        k.rect(36, 20, 56, 11, STONE); for (let x = 36; x < 92; x += 6) k.rect(x, 20, 1, 11, STONE2);
        k.rect(36, 25, 56, 1, STONE2);
        for (const x of [32, 96]) k.line(x, 31, x, 12, "#7a5a32"); k.line(32, 14, 96, 14, "#7a5a32");
        const p = (k.t * 0.4) % 1, by = 19 - Math.round(p * 4);
        k.rect(56, by - 4, 6, 4, "#c8bca0"); k.line(59, 14, 59, by - 4, "#c8b08a");
        k.fig("builder", "stand", 70, 8); k.fig("builder 2", "stand", 14, 19);
        k.rect(16, 15, 6, 4, "#c8bca0");
      } },
      { verse: 11, alt: "At night the Lord speaks to Solomon about the temple he is building", draw: (k) => {
        k.scene("night", "hills", { noMoon: true });
        k.rect(64, 20, 50, 11, "#3a3a48"); for (const x of [62, 116]) k.line(x, 31, x, 12, "#2a2a36");
        k.glow(40, 8, 10 + k.pulse(2), "#5a5a40"); k.disc(40, 8, 2, "#fff8d0");
        for (let i = 0; i < 3; i++) k.line(40, 10, 30 + i * 5, 24, "#4a4a38");
        k.fig("Solomon", "kneel", 30, 22);
      } },
      { verse: 21, alt: "Inside, the walls are carved with palm trees and flowers and covered with gold", draw: (k) => {
        k.rect(0, 0, 128, 40, "#8a6a20"); k.rect(0, 30, 128, 10, "#6a5018");
        for (let x = 10; x < 128; x += 24) {
          k.line(x, 28, x, 12, GOLD); for (const d of [-4, -2, 2, 4]) k.line(x, 12, x + d, 14 + Math.abs(d) / 2, GOLD);
          k.disc(x + 12, 18, 2, "#f7d154"); k.px(x + 12, 18, "#d42a4a");
        }
        const s = (k.t * 30) % 180 - 20;
        for (let y = 2; y < 30; y++) k.px(s + y * 0.3, y, "#fff0a0");
        k.fig("goldsmith", "stand", 56, 19);
      } },
      { verse: 23, alt: "Two great gold cherubs stand in the Most Holy Place with their wings touching in the middle", draw: (k) => {
        k.rect(0, 0, 128, 40, "#3a2a10"); k.rect(0, 30, 128, 10, "#5a4010");
        k.glow(64, 16, 16 + k.pulse(1.2), "#5a4818");
        cherub(k, 40, 17, false, 22); cherub(k, 82, 17, true, 22);
      } },
      { verse: 37, alt: "After seven years of work the Lord's temple stands finished", draw: (k) => {
        k.scene("dawn", "hills");
        temple(k, 44, 31, { lit: true });
        k.fig("Solomon", "praise", 16, 20); k.fig("worshipper", "praise", 98, 20); k.fig("worshipper 2", "bow", 112, 26, true);
      } },
    ],
    7: [
      { verse: 2, alt: "Solomon walks through the Palace of the Forest of Lebanon with its rows of cedar pillars", draw: (k) => {
        k.scene("day", "hills");
        k.rect(4, 10, 120, 3, "#6a4a30"); k.rect(4, 13, 120, 18, "#4a3020");
        for (let x = 8; x < 124; x += 8) k.rect(x + 3, 13, 2, 18, "#6a4828");
        for (let x = 6; x < 124; x += 8) k.rect(x, 13, 3, 18, "#a87a48");
        for (let x = 6; x < 124; x += 16) k.rect(x, 14, 10, 3, "#2a1a10");
        k.fig("Solomon", "stand", 20 + ((k.t * 6) % 90), 19);
      } },
      { verse: 13, alt: "Hiram the bronze worker pours glowing bronze into clay moulds in the Jordan valley", draw: (k) => {
        k.scene("dusk", "valley");
        k.disc(22, 24, 8, "#6a5a4a"); k.rect(14, 24, 17, 7, "#6a5a4a"); k.rect(19, 25, 6, 6, "#ff7a2f"); k.fire(22, 25, 4);
        k.smoke(22, 14);
        k.line(30, 28, 70, 30, "#3a2a1a");
        for (let i = 0; i < 6; i++) { const p = ((k.t * 0.8 + i / 6) % 1); k.px(30 + p * 40, 28 + p * 2, i % 2 ? "#ffb03a" : "#ffe08a"); }
        k.rect(70, 27, 26, 4, "#7a5a3a"); k.rect(72, 28, 22, 2, "#ff9a3c");
        k.fig("Hiram", "stand", 48, 18); k.fig("worker", "kneel", 98, 22, true);
      } },
      { verse: 21, alt: "Two tall bronze pillars named Jakin and Boaz stand at the temple porch, decorated with lilies and pomegranates", draw: (k) => {
        k.scene("day", "none");
        k.rect(0, 4, 128, 27, STONE); for (let x = 0; x < 128; x += 8) k.rect(x, 4, 1, 27, STONE2);
        k.rect(52, 12, 24, 19, "#5a3a22");
        for (const x of [36, 84]) {
          k.rect(x, 8, 6, 23, BRONZE); k.rect(x + 1, 8, 1, 23, BRONZE2);
          k.rect(x - 2, 3, 10, 5, BRONZE2); k.disc(x + 3, 3, 3, "#e0a85a");
          for (let i = 0; i < 5; i++) k.px(x - 1 + i * 2, 7, "#c8504a");
        }
        k.rect(0, 31, 128, 9, "#a89c80");
        k.fig("Hiram", "stand", 12, 19); k.fig("Solomon", "stand", 104, 19, true);
        k.glow(39, 4, 4 + k.pulse(2), "#fff0a0");
      } },
      { verse: 23, alt: "The huge bronze bowl called the Sea rests on twelve bronze bulls", draw: (k) => {
        k.scene("day", "none");
        k.rect(0, 0, 128, 31, "#cfe4f2"); k.rect(0, 26, 128, 5, STONE);
        k.rect(0, 31, 128, 9, "#a89c80");
        for (let i = 0; i < 3; i++) {
          k.sprite(_SC_ANIMAL.ox.rows, { b: BRONZE, h: BRONZE2, e: "#5a3a1a" }, 30 + i * 11, 26, true);
          k.sprite(_SC_ANIMAL.ox.rows, { b: BRONZE, h: BRONZE2, e: "#5a3a1a" }, 66 + i * 11, 26);
        }
        for (let y = 0; y < 9; y++) { const hw = 34 - y * y * 0.25; k.rect(64 - hw, 16 + y, hw * 2, 1, y % 3 ? BRONZE : BRONZE2); }
        k.rect(28, 15, 72, 2, BRONZE2);
        for (let x = 32; x < 96; x += 7) k.px(x + (k.f % 5), 15, "#9cc0f0");
        k.fig("priest", "stand", 8, 19); k.fig("priest 2", "stand", 112, 19, true);
      } },
      { verse: 48, alt: "Inside the temple stand the gold altar, the gold table for the holy bread and the gold lampstands", draw: (k) => {
        k.rect(0, 0, 128, 40, "#3a2a14"); k.rect(0, 30, 128, 10, "#5a4010");
        for (let i = 0; i < 5; i++) menorah(k, 8 + i * 9, 30);
        table(k, 62, 25, 20); for (let i = 0; i < 4; i++) k.rect(63 + i * 5, 23, 4, 2, "#e0b070");
        k.rect(94, 22, 12, 8, GOLD); k.rect(94, 22, 12, 1, "#fff0a0"); k.smoke(100, 20);
        k.glow(30, 18, 12 + k.pulse(1.5), "#5a4818");
      } },
    ],
    8: [
      { verse: 3, alt: "The priests carry the Covenant Box up to the new temple while the people follow", draw: (k) => {
        k.scene("day", "city", { cityX: 104, cityW: 40 });
        const x = 10 + ((k.t * 5) % 50);
        k.fig("priest", "stand", x + 12, 19); k.fig("priest 2", "stand", x - 9, 19);
        k.ark(x, 21);
        k.fig("Solomon", "praise", x - 26, 20); k.animal("sheep", x - 40, 27);
      } },
      { verse: 6, alt: "The Covenant Box is set in the Most Holy Place under the wings of the cherubs", draw: (k) => {
        k.rect(0, 0, 128, 40, "#2a1e0c"); k.rect(0, 30, 128, 10, "#4a3810");
        k.glow(64, 22, 14 + k.pulse(1.5), "#5a4818");
        cherub(k, 36, 15, false, 26); cherub(k, 86, 15, true, 26);
        k.ark(59, 25);
      } },
      { verse: 10, alt: "A cloud fills the temple, so bright with the Lord's glory that the priests cannot stay at their work", draw: (k) => {
        k.rect(0, 0, 128, 40, "#6a5420"); k.rect(0, 30, 128, 10, "#4a3810");
        for (let i = 0; i < 6; i++) k.cloud(((i * 26 + k.t * 3) % 170) - 20, 6 + (i % 3) * 5, 22, "#fff8e0", "#f0e0b0");
        k.glow(64, 14, 18 + k.pulse(1.5), "#fff0b0");
        k.fig("priest", "bow", 30, 25, true); k.fig("priest 2", "bow", 60, 25); k.fig("priest 3", "bow", 92, 25, true);
      } },
      { verse: 22, alt: "Solomon stands before the altar with his hands lifted towards heaven and prays", draw: (k) => {
        k.scene("day", "hills");
        temple(k, 76, 31, { w: 46 });
        k.rect(20, 23, 22, 8, BRONZE); k.rect(20, 23, 22, 1, BRONZE2);
        k.fig("Solomon", "praise", 26, 11);
        k.fig("Israelite", "bow", 4, 25); k.fig("Israelite 2", "stand", 50, 19, true); k.fig("Israelite 3", "kneel", 62, 22, true);
        k.glow(30, 4, 6 + k.pulse(2), "#fff6c8");
      } },
      { verse: 63, alt: "Solomon and the people dedicate the temple with offerings and a great festival", draw: (k) => {
        k.scene("dusk", "hills");
        temple(k, 82, 31, { w: 40, lit: true });
        k.altar(10, 31); k.altar(30, 31); k.altar(50, 31);
        k.animal("ox", 66, 26); k.animal("sheep", 26, 28, true);
        k.fig("Solomon", "praise", 104, 20);
      } },
    ],
    9: [
      { verse: 2, alt: "The Lord appears to Solomon a second time, as he had at Gibeon", draw: (k) => {
        k.scene("night", "city", { cityX: 90, cityW: 56, noMoon: true });
        k.glow(30, 8, 11 + k.pulse(2), "#6a6440"); k.disc(30, 8, 3, "#fff8d0");
        for (let i = 0; i < 4; i++) k.line(30, 11, 22 + i * 5, 26, "#5a5a40");
        k.fig("Solomon", "kneel", 24, 22);
      } },
      { verse: 6, alt: "A warning picture: if Israel turns away, the temple will become a heap of stones", draw: (k) => {
        k.scene("storm", "hills");
        k.rect(40, 26, 50, 5, "#6a6050"); k.stones(44, 26, 9); k.stones(70, 26, 9);
        k.rect(48, 18, 4, 8, "#6a6050"); k.rect(76, 21, 3, 5, "#6a6050");
        k.fig("passer-by", "stand", 14, 19); k.fig("passer-by 2", "weep", 104, 19, true);
      } },
      { verse: 11, alt: "Hiram goes to look at the twenty towns Solomon gave him and is not pleased", draw: (k) => {
        k.scene("day", "hills");
        for (const x of [60, 82, 104]) { k.rect(x, 24, 12, 7, "#a8987a"); k.rect(x + 4, 27, 3, 4, "#4a3a2a"); }
        k.fig("Hiram", "stand", 30, 19); k.fig("servant", "stand", 18, 19);
        k.birds(2, 8);
      } },
      { verse: 15, alt: "Solomon's labourers build the city walls of Jerusalem, Hazor, Megiddo and Gezer", draw: (k) => {
        k.scene("day", "hills");
        k.rect(40, 16, 70, 15, "#9a8a70"); for (let y = 18; y < 31; y += 3) for (let x = 40 + (y % 2) * 3; x < 110; x += 7) k.rect(x, y, 6, 1, "#7a6a58");
        for (let i = 40; i < 110; i += 5) k.rect(i, 13, 3, 3, "#9a8a70");
        const p = (k.t * 8) % 30;
        k.fig("labourer", "stand", 10 + p, 19); k.rect(12 + p, 16, 5, 3, "#c8bca0");
        k.fig("labourer 2", "stand", 72, 1); k.fig("overseer", "staff", 114, 19, true);
      } },
      { verse: 26, alt: "Solomon's ships sail from Ezion-Geber on the Red Sea to bring back gold from Ophir", draw: (k) => {
        k.scene("dawn", "none");
        sea(k, 26, "#2a4a7a");
        k.rect(0, 26, 28, 14, "#c8a06a");
        ship(k, 40, 27); ship(k, 78 + ((k.t * 3) % 30), 29);
        k.fig("sailor", "stand", 8, 15);
      } },
    ],
    10: [
      { verse: 1, alt: "The Queen of Sheba arrives in Jerusalem with camels loaded with spices, gold and precious stones", draw: (k) => {
        k.scene("noon", "desert");
        k.city(108, 28, 36, 12);
        const p = (k.t * 4) % 30;
        camel(k, 6 + p, 31, false, "#c8504a"); camel(k, 30 + p, 31, false, GOLD);
        k.fig("Queen of Sheba", "stand", 46 + p, 19); k.fig("servant", "staff", 58 + p, 19);
      } },
      { verse: 4, alt: "The Queen of Sheba sees Solomon's wisdom, his palace, his food and his servants, and is amazed", draw: (k) => {
        k.room("palace"); k.lamp(64, 6);
        table(k, 34, 26, 60); k.disc(46, 25, 2, "#e0a96d"); k.disc(64, 25, 2, "#c8504a"); k.rect(78, 23, 2, 3, GOLD); k.rect(84, 23, 2, 3, GOLD);
        k.fig("Solomon", "sit", 22, 20); k.fig("Queen of Sheba", "sit", 98, 20, true);
        k.fig("cupbearer", "stand", 112, 19, true);
        k.glow(100, 18, 4 + k.pulse(3), "#7a6030");
      } },
      { verse: 10, alt: "The queen gives Solomon gold, spices and jewels, more spices than were ever seen again", draw: (k) => {
        k.room("palace"); k.lamp(20, 8);
        k.throne(10, 31); k.fig("Solomon", "sit", 12, 21);
        for (let i = 0; i < 4; i++) k.rect(40 + i * 5, 26 - (i % 2) * 2, 4, 4 + (i % 2) * 2, i % 2 ? GOLD : "#c8504a");
        k.disc(64, 28, 2, "#6ac0d0"); k.disc(68, 28, 2, "#d04a8a"); k.glow(52, 26, 7 + k.pulse(2), "#8a6a20");
        k.fig("Queen of Sheba", "bow", 78, 25, true); k.fig("servant", "kneel", 96, 22, true);
      } },
      { verse: 18, alt: "Solomon's great ivory throne covered with gold, with six steps and a lion on each side", draw: (k) => {
        k.room("palace"); k.lamp(18, 8); k.lamp(110, 8);
        for (let i = 0; i < 6; i++) k.rect(34 + i * 3, 30 - i * 2, 60 - i * 6, 2, i % 2 ? "#e8dcc0" : "#f4ecd8");
        k.rect(56, 6, 16, 12, "#f4ecd8"); k.rect(56, 6, 16, 1, GOLD); k.rect(56, 16, 16, 2, GOLD);
        k.fig("Solomon", "front", 59, 7);
        for (let i = 0; i < 3; i++) { k.sprite(_SC_ANIMAL.lion.rows, _SC_ANIMAL.lion.pal, 28 + i * 3, 23 - i * 2 - 2); k.sprite(_SC_ANIMAL.lion.rows, _SC_ANIMAL.lion.pal, 92 - i * 3, 23 - i * 2 - 2, true); }
        k.glow(64, 10, 10 + k.pulse(1.5), "#8a6a20");
      } },
      { verse: 22, alt: "Ships return from far lands carrying gold, silver, ivory, apes and peacocks", draw: (k) => {
        k.scene("day", "none");
        sea(k, 25);
        k.rect(84, 25, 44, 15, "#c8a06a");
        ship(k, 10 + ((k.t * 3) % 40), 26);
        k.rect(92, 22, 6, 3, GOLD); k.rect(99, 22, 5, 3, "#e8e8f0"); k.rect(105, 21, 2, 4, "#f4ecd8");
        const fan = k.f % 12 < 6;
        k.disc(116, 22, fan ? 4 : 2, "#2a8a7a"); k.px(116, 22, "#4a6ad0"); k.rect(116, 21, 1, 4, "#3a6ad0");
        k.fig("trader", "stand", 86, 13);
      } },
    ],
    11: [
      { verse: 3, alt: "As Solomon grows old, his many foreign wives turn his heart away from the Lord", draw: (k) => {
        k.room("palace"); k.lamp(64, 6);
        k.throne(52, 31); k.fig("Solomon", "sit", 54, 21);
        for (let i = 0; i < 3; i++) { k.fig("foreign wife " + i, "stand", 8 + i * 12, 19); k.fig("foreign wife " + (i + 3), "stand", 82 + i * 12, 19, true); }
        k.smoke(30, 14); k.smoke(98, 14);
      } },
      { verse: 7, alt: "On a hill east of Jerusalem Solomon builds shrines to the gods of Moab and Ammon", draw: (k) => {
        k.scene("dusk", "none");
        k.ridge((x) => 20 + Math.abs(x - 40) * 0.25, "#3a2244");
        k.ridge(() => 31, "#2a1832");
        highPlace(k, 22, 22); highPlace(k, 50, 23);
        k.city(104, 30, 34, 10, true);
        k.fig("Solomon", "stand", 84, 19, true);
      } },
      { verse: 17, alt: "Young Hadad escapes from Edom with his father's servants and flees to Egypt", draw: (k) => {
        k.scene("noon", "desert");
        pyramid(k, 100, 28, 14); pyramid(k, 120, 28, 9);
        const p = (k.t * 8) % 60;
        k.fig("Hadad", "child", 20 + p, 24); k.fig("Edomite servant", "run", 6 + p, 19); k.fig("Edomite servant 2", "run", 30 + p, 19);
      } },
      { verse: 29, alt: "Ahijah tears his new coat into twelve pieces and gives ten of them to Jeroboam", draw: (k) => {
        k.scene("day", "field");
        k.fig("Ahijah", "stand", 34, 19); k.rect(42, 24, 2, 2, "#4a8a5a"); k.rect(41, 26, 2, 2, "#3a7a4a");
        k.fig("Jeroboam", "stand", 84, 19, true);
        for (let i = 0; i < 10; i++) {
          const p = Math.min(1, ((k.t * 0.5) % 1.6)), d = i * 0.06;
          const q = Math.max(0, Math.min(1, (p - d) * 1.6));
          k.rect(46 + q * (24 + (i % 5) * 3), 24 - Math.sin(q * Math.PI) * 6 + Math.floor(i / 5) * 2 + q * 4, 2, 2, i % 2 ? "#4a8a5a" : "#3a7a4a");
        }
      } },
      { verse: 41, alt: "Solomon dies after ruling forty years and is buried in the City of David", draw: (k) => {
        k.scene("dusk", "city", { cityX: 96, cityW: 50 });
        tomb(k, 10, 31);
        k.fig("Rehoboam", "front", 40, 19); k.crown(42, 14);
        k.fig("mourner", "weep", 56, 19); k.fig("mourner 2", "weep", 68, 19);
      } },
    ],
    12: [
      { verse: 1, alt: "At Shechem Jeroboam and the people of Israel ask King Rehoboam to lighten their heavy load", draw: (k) => {
        k.scene("day", "city", { cityX: 102, cityW: 40 });
        k.fig("Rehoboam", "front", 78, 19); k.crown(80, 14);
        k.fig("Jeroboam", "stand", 56, 19);
        for (let i = 0; i < 3; i++) k.fig("Israelite " + i, "stand", 8 + i * 13, 19 + (Math.floor(k.t * 2 + i) % 4 === 0 ? -1 : 0));
      } },
      { verse: 6, alt: "Rehoboam listens to the old advisors on one side and his young friends on the other", draw: (k) => {
        k.room("palace"); k.lamp(64, 6);
        k.throne(58, 31); k.fig("Rehoboam", "sit", 60, 21);
        k.fig("old advisor", "staff", 12, 19); k.fig("old advisor 2", "staff", 28, 19);
        k.fig("young advisor", "stand", 88, 19, true); k.fig("young advisor 2", "stand", 100, 19, true); k.fig("young advisor 3", "dance", 112, 20, true);
      } },
      { verse: 16, alt: "The tribes of Israel turn their backs on Rehoboam and go home to their tents", draw: (k) => {
        k.scene("dusk", "hills");
        k.city(16, 30, 28, 10, true); k.fig("Rehoboam", "stand", 36, 19);
        k.tent(92, 31, 16, 9); k.tent(110, 31, 14, 8, "#b89a74");
        const p = (k.t * 5) % 30;
        for (let i = 0; i < 3; i++) k.fig("Israelite " + i, "run", 52 + i * 12 + p, 19);
      } },
      { verse: 18, alt: "After Adoniram is stoned, Rehoboam races back to Jerusalem in his chariot", draw: (k) => {
        k.scene("dusk", "hills");
        k.stones(14, 31, 9);
        const p = (k.t * 14) % 170 - 30;
        chariot(k, p, 31, false, "Rehoboam");
        k.city(112, 28, 30, 10, true);
      } },
      { verse: 28, alt: "Jeroboam sets up a gold calf at Bethel and tells the people to worship it", draw: (k) => {
        k.scene("dusk", "hills");
        calf(k, 54, 31);
        k.fig("Jeroboam", "praise", 30, 20); k.altar(84, 31);
        k.fig("Israelite", "bow", 104, 26, true);
      } },
    ],
    13: [
      { verse: 1, alt: "A man of God from Judah cries out against the altar at Bethel while Jeroboam stands beside it", draw: (k) => {
        k.scene("day", "hills");
        k.altar(58, 31);
        k.fig("Jeroboam", "stand", 76, 19, true); k.line(75, 24, 70, 22, "#e0a96d");
        k.fig("man of God", "staff", 26, 19);
      } },
      { verse: 5, alt: "The altar splits apart and its ashes pour out, as the man of God said", draw: (k) => {
        k.scene("day", "hills");
        k.rect(52, 26, 6, 5, "#8a8070"); k.rect(64, 25, 6, 6, "#8a8070"); k.line(58, 26, 60, 31, "#3a3030");
        for (let i = 0; i < 6; i++) { const p = (k.t * 0.8 + i / 6) % 1; k.px(60 + (i % 3) - 1 + p * (i % 2 ? 6 : -6), 25 + p * 6, "#8a8a92"); }
        k.fig("Jeroboam", "kneel", 80, 22, true);
        k.fig("man of God", "staff", 28, 19);
      } },
      { verse: 14, alt: "The old prophet rides out on his donkey and finds the man of God sitting under an oak tree", draw: (k) => {
        k.scene("day", "hills");
        k.tree(24, 30, "oak", "#3f7a2e"); k.tree(30, 30, "oak", "#3f7a2e"); k.fig("man of God", "sit", 34, 21);
        const p = (k.t * 4) % 30;
        k.animal("donkey", 100 - p, 24, true, true); k.fig("old prophet", "sit", 102 - p, 16, true);
      } },
      { verse: 19, alt: "The man of God goes back and eats at the old prophet's house", draw: (k) => {
        k.room("house"); k.lamp(64, 8);
        table(k, 38, 26, 52); k.rect(50, 24, 5, 2, "#d8a860"); k.rect(70, 23, 3, 3, "#a0603a");
        k.fig("man of God", "sit", 28, 20); k.fig("old prophet", "sit", 92, 20, true);
      } },
      { verse: 24, alt: "On the road a lion and a donkey stand quietly beside the fallen man of God", draw: (k) => {
        k.scene("dusk", "desert");
        k.rect(0, 30, 128, 3, "#7a5a40");
        k.fig("man of God", "lie", 56, 28);
        k.animal("lion", 34, 26); k.animal("donkey", 74, 24, true);
        k.fig("traveller", "stand", 110, 19, true);
      } },
    ],
    14: [
      { verse: 2, alt: "Jeroboam's wife puts on a disguise and walks to Shiloh with bread and a jar of honey", draw: (k) => {
        k.scene("day", "hills");
        k.city(110, 28, 26, 9);
        const p = (k.t * 4) % 50;
        k.fig("Jeroboam's wife", "stand", 20 + p, 19); k.rect(27 + p, 24, 4, 3, "#c8a060"); k.rect(28 + p, 23, 2, 1, "#e8b830");
      } },
      { verse: 4, alt: "Old, blind Ahijah sits in his house as Jeroboam's wife comes to the door", draw: (k) => {
        k.room("house"); k.lamp(40, 10);
        k.fig("Ahijah", "sit", 22, 21);
        k.rect(92, 8, 20, 22, "#cfe4f2"); k.fig("Jeroboam's wife", "stand", 98, 19, true);
      } },
      { verse: 17, alt: "Jeroboam's wife returns to Tirzah, and all Israel mourns the king's son", draw: (k) => {
        k.scene("dusk", "city", { cityX: 90, cityW: 60 });
        k.fig("Jeroboam's wife", "weep", 30, 19); k.fig("mourner", "weep", 44, 19); k.fig("mourner 2", "weep", 14, 19);
      } },
      { verse: 25, alt: "King Shishak of Egypt carries off the gold shields and treasures from Jerusalem", draw: (k) => {
        k.scene("day", "hills");
        k.city(108, 28, 36, 12);
        const p = (k.t * 8) % 40;
        chariot(k, 30 - p, 31, true, "Shishak");
        for (let i = 0; i < 3; i++) { const x = 60 + i * 13 - p; k.fig("Egyptian soldier " + i, "run", x, 19, true); k.disc(x + 1, 24, 2, GOLD); }
      } },
      { verse: 27, alt: "Rehoboam's guards carry bronze shields in place of the gold ones when the king goes to the temple", draw: (k) => {
        k.scene("day", "hills");
        temple(k, 76, 31, { w: 44 });
        for (let i = 0; i < 3; i++) { k.fig("guard " + i, "stand", 12 + i * 14, 19); k.disc(18 + i * 14, 24, 2, BRONZE2); }
        k.fig("Rehoboam", "stand", 58, 19);
      } },
    ],
    15: [
      { verse: 12, alt: "King Asa burns his grandmother's Asherah pole in the Kidron valley", draw: (k) => {
        k.scene("day", "valley");
        k.rect(0, 33, 128, 2, "#2c5a8c"); for (let x = 0; x < 128; x += 7) k.px((x + k.t * 5) % 128, 33, "#9cc0f0");
        k.rect(60, 18, 2, 13, "#6a4a2a"); k.rect(58, 21, 6, 2, "#8a6a3a");
        k.fire(61, 31, 8); k.fire(61, 24, 4); k.smoke(61, 14);
        k.fig("Asa", "stand", 30, 19); k.fig("Maakah", "stand", 100, 19, true);
      } },
      { verse: 17, alt: "King Baasha of Israel builds up Ramah to block the road into Judah", draw: (k) => {
        k.scene("day", "hills");
        k.rect(56, 18, 40, 13, "#9a8a70"); for (let i = 56; i < 96; i += 5) k.rect(i, 15, 3, 3, "#9a8a70");
        k.rect(72, 24, 8, 7, "#3a2e24");
        k.fig("Baasha", "front", 100, 19); k.fig("soldier", "spear", 40, 19);
        const hit = Math.floor(k.t * 3) % 2; k.fig("builder", "stand", 82, 4); if (hit) k.px(90, 12, "#ffe08a");
      } },
      { verse: 18, alt: "Asa's messengers take the temple's silver and gold to Ben-Hadad in Damascus", draw: (k) => {
        k.scene("dawn", "desert");
        k.city(110, 28, 30, 10);
        const p = (k.t * 5) % 50;
        k.animal("donkey", 30 + p, 24, false, true); k.rect(33 + p, 22, 5, 2, GOLD); k.rect(36 + p, 21, 3, 1, "#e8e8f0");
        k.fig("messenger", "run", 18 + p, 19); k.fig("messenger 2", "run", 44 + p, 19);
      } },
      { verse: 22, alt: "The people of Judah carry away the stones and timber of Ramah to build Geba and Mizpah", draw: (k) => {
        k.scene("day", "hills");
        k.rect(90, 24, 26, 7, "#9a8a70"); k.stones(100, 31, 6);
        const p = (k.t * 6) % 40;
        k.fig("worker", "stand", 70 - p, 19, true); k.rect(70 - p, 16, 6, 3, "#c8bca0");
        k.fig("worker 2", "stand", 50 - p, 19, true); k.rect(46 - p, 16, 14, 2, WOOD);
        k.fig("Asa", "stand", 10, 19);
      } },
    ],
    16: [
      { verse: 1, alt: "The prophet Jehu brings the Lord's message against King Baasha", draw: (k) => {
        k.room("palace"); k.lamp(64, 6);
        k.throne(18, 31); k.fig("Baasha", "sit", 20, 21);
        k.fig("Jehu", "staff", 80, 19, true);
      } },
      { verse: 18, alt: "Omri's army surrounds Tirzah while the king's palace goes up in flames at night", draw: (k) => {
        k.scene("night", "hills", { moonX: 20 });
        k.palace(46, 31, 40, 16);
        for (let x = 48; x < 86; x += 7) k.fire(x, 15, 5);
        k.smoke(56, 10); k.smoke(76, 10); k.glow(66, 18, 14 + k.pulse(3), "#7a3a1a");
        k.fig("Omri", "sword", 14, 20); k.fig("soldier", "spear", 100, 19, true); k.fig("soldier 2", "spear", 112, 19, true);
      } },
      { verse: 24, alt: "Omri buys the hill of Samaria from Shemer and builds a city on it", draw: (k) => {
        k.scene("day", "none");
        k.ridge((x) => 18 + Math.abs(x - 84) * 0.3, "#6f9a4a");
        k.ridge(() => 32, "#4f7a36");
        k.rect(70, 12, 30, 6, "#9a8a70"); for (let i = 70; i < 100; i += 4) k.rect(i, 10, 2, 2, "#9a8a70");
        k.fig("Omri", "stand", 18, 19); k.fig("Shemer", "stand", 36, 19, true);
        const p = Math.floor(k.t * 2) % 2; k.disc(31, 24 - p, 1, "#e8e8f0"); k.disc(29, 25, 1, "#c8c8d8");
      } },
      { verse: 31, alt: "Ahab marries Jezebel, daughter of the king of Sidon", draw: (k) => {
        k.room("palace"); k.lamp(30, 8); k.lamp(98, 8);
        k.fig("Ahab", "stand", 54, 19); k.fig("Jezebel", "stand", 66, 19, true);
        k.fig("musician", "trumpet", 10, 19); k.fig("guest", "dance", 108, 20);
      } },
      { verse: 32, alt: "Ahab builds a temple for Baal in Samaria and sets up an Asherah pole", draw: (k) => {
        k.scene("dusk", "city", { cityX: 102, cityW: 40 });
        k.rect(36, 18, 30, 13, "#5a4a3a"); k.rect(34, 16, 34, 2, "#3a2a2a"); k.rect(48, 24, 6, 7, "#2a1818");
        highPlace(k, 6, 31);
        k.fig("Ahab", "stand", 72, 19, true); k.fig("Jezebel", "stand", 84, 19, true);
      } },
    ],
    17: [
      { verse: 1, alt: "Elijah tells King Ahab there will be no dew or rain until he says so", draw: (k) => {
        k.scene("noon", "city", { cityX: 100, cityW: 44 });
        k.fig("Ahab", "front", 70, 19); k.crown(72, 14);
        k.fig("Elijah", "staff", 34, 19);
      } },
      { verse: 5, alt: "By the Kerith brook, ravens bring Elijah bread and meat morning and evening", draw: (k) => {
        k.scene("dawn", "valley");
        k.rect(0, 32, 128, 2, "#2c5a8c"); for (let x = 0; x < 128; x += 6) k.px((x + k.t * 4) % 128, 32, "#9cc0f0");
        k.fig("Elijah", "sit", 52, 21);
        const p = (k.t * 10) % 80;
        raven(k, 120 - p, 8, true); raven(k, 140 - p, 13, true);
      } },
      { verse: 10, alt: "At the gate of Zarephath Elijah meets a widow gathering sticks", draw: (k) => {
        k.scene("famine", "desert");
        k.city(108, 28, 36, 12);
        k.fig("widow", "kneel", 62, 22, true);
        for (let i = 0; i < 4; i++) k.line(52 + i * 2, 30, 56 + i * 2, 28, "#7a5a32");
        k.fig("Elijah", "staff", 26, 19);
      } },
      { verse: 16, alt: "In the widow's house the flour bowl and the oil jar never run out", draw: (k) => {
        k.room("house"); k.lamp(64, 8);
        table(k, 40, 26, 48); k.rect(48, 23, 6, 3, "#a0603a"); k.rect(49, 22, 4, 1, "#f3e6c4");
        k.rect(68, 21, 4, 5, "#a0603a"); k.rect(69, 20, 2, 1, "#a0603a");
        const d = (k.t * 4) % 4; k.px(70, 19 - d, "#f7d154"); k.glow(60, 22, 6 + k.pulse(2), "#7a6030");
        k.fig("Elijah", "sit", 28, 20); k.fig("widow", "sit", 90, 20, true); k.fig("widow's son", "child", 104, 24, true);
      } },
      { verse: 23, alt: "Elijah carries the boy down from the upstairs room alive and gives him back to his mother", draw: (k) => {
        k.scene("day", "none");
        k.rect(20, 8, 70, 23, "#c8b896"); k.rect(18, 7, 74, 1, "#a8987a"); k.rect(20, 18, 70, 1, "#a8987a");
        k.rect(60, 10, 8, 6, "#3a2e24");
        for (let i = 0; i < 6; i++) k.rect(78 + i * 3, 17 + i * 2, 4, 1, "#8a7a5a");
        k.ridge(() => 31, "#b08050"); k.ridge(() => 36, "#9a6a3a");
        k.fig("Elijah", "stand", 40, 19); k.fig("widow's son", "child", 48, 24);
        k.fig("widow", "praise", 60, 20, true);
      } },
    ],
    18: [
      { verse: 2, alt: "In the third year of famine Ahab and Obadiah set off in different directions to look for grass", draw: (k) => {
        k.scene("famine", "desert");
        for (const x of [20, 104]) { k.line(x, 30, x, 20, "#5a3a1e"); k.line(x, 23, x - 3, 19, "#5a3a1e"); k.line(x, 22, x + 3, 18, "#5a3a1e"); }
        const p = (k.t * 4) % 30;
        k.fig("Ahab", "stand", 50 - p, 19, true); k.fig("Obadiah", "stand", 66 + p, 19);
        k.animal("horse", 34 - p, 24, true);
      } },
      { verse: 26, alt: "On Mount Carmel the prophets of Baal dance and shout around their altar, but no one answers", draw: (k) => {
        k.scene("noon", "mountains");
        k.rect(54, 25, 16, 6, "#8a8070"); for (let i = 0; i < 4; i++) k.line(55 + i * 4, 25, 57 + i * 4, 23, "#7a5a32");
        for (let i = 0; i < 4; i++) k.fig("Baal prophet " + i, "dance", 30 + i * 14 + (i > 1 ? 24 : 0), 20 + (i % 2));
        k.fig("Elijah", "sit", 4, 21);
      } },
      { verse: 30, alt: "Elijah rebuilds the Lord's altar with twelve stones and soaks it with water", draw: (k) => {
        k.scene("day", "mountains");
        k.rect(46, 30, 34, 3, "#2c5a8c"); for (let x = 48; x < 80; x += 5) k.px(x + (k.f % 4), 31, "#9cc0f0");
        for (let i = 0; i < 12; i++) k.rect(52 + (i % 4) * 6, 30 - Math.floor(i / 4) * 3 - 3, 5, 3, i % 2 ? "#8a8070" : "#a09484");
        for (let i = 0; i < 4; i++) k.line(53 + i * 6, 20, 56 + i * 6, 19, "#7a5a32");
        k.fig("Elijah", "staff", 26, 19); k.fig("servant", "stand", 86, 18, true);
        k.rect(82, 22, 4, 4, "#a0603a");
        for (let i = 0; i < 3; i++) k.px(80 - ((k.t * 6 + i) % 4), 23 + ((k.t * 8 + i * 2) % 6), "#9cc0f0");
      } },
      { verse: 38, alt: "Fire from the Lord falls and burns up the offering, the stones and the water, and the people bow down", draw: (k) => {
        k.scene("dusk", "mountains");
        for (let i = -2; i <= 2; i++) k.line(64 + i * 3, 0, 64 + i, 22, i % 2 ? "#ffb03a" : "#ffe08a");
        k.glow(64, 22, 12 + k.pulse(4), "#ff9a3c");
        k.rect(52, 24, 24, 7, "#8a8070"); k.fire(64, 24, 20); k.smoke(58, 16); k.smoke(70, 16);
        k.fig("Elijah", "praise", 30, 20);
        k.fig("Israelite", "bow", 86, 26, true); k.fig("Israelite 2", "bow", 100, 26, true); k.fig("Israelite 3", "bow", 114, 26, true);
      } },
      { verse: 42, alt: "Elijah bows on top of Carmel while his servant spots a little cloud rising from the sea", draw: (k) => {
        k.scene("day", "none", { sunX: 30 });
        sea(k, 28, "#2a5a8a");
        k.ridge((x) => (x < 64 ? 20 + x * 0.05 : 20 + (x - 64) * 0.4), "#4f7a36", 40, 0, 96);
        k.fig("Elijah", "bow", 20, 15); k.fig("servant", "stand", 44, 9);
        const c = 4 + Math.floor((k.t * 0.5) % 4); k.cloud(110, 22, c, "#e8eef8");
      } },
      { verse: 45, alt: "Heavy rain pours down as Elijah runs ahead of Ahab's chariot all the way to Jezreel", draw: (k) => {
        k.scene("storm", "hills");
        const p = (k.t * 12) % 180 - 40;
        chariot(k, p, 31, false, "Ahab");
        k.fig("Elijah", "run", p + 30, 19);
      } },
    ],
    19: [
      { verse: 4, alt: "Worn out and afraid, Elijah sits alone under a broom tree in the desert", draw: (k) => {
        k.scene("dusk", "desert");
        for (let i = 0; i < 7; i++) k.line(54, 30, 46 + i * 3, 18 + (i % 3) * 2 + (k.f % 10 < 5 ? 0 : 1), "#5a7a3a");
        k.fig("Elijah", "sit", 60, 21);
      } },
      { verse: 5, alt: "An angel wakes Elijah beside bread baked on hot stones and a jar of water", draw: (k) => {
        k.scene("night", "desert");
        for (let i = 0; i < 7; i++) k.line(30, 30, 22 + i * 3, 18 + (i % 3) * 2, "#2a3a2a");
        k.fig("Elijah", "lie", 34, 28);
        k.rect(52, 29, 8, 2, "#5a3a2a"); k.fire(56, 29, 4); k.rect(53, 27, 6, 1, "#d8a860");
        k.rect(62, 26, 3, 5, "#a0603a");
        k.angel(76, 10);
      } },
      { verse: 11, alt: "On Mount Sinai a great wind, then an earthquake, then a fire pass by the cave, but the Lord is not in them", draw: (k) => {
        const ph = Math.floor(k.t / 2) % 3, sh = ph === 1 ? (k.f % 2 ? 1 : -1) : 0;
        k.scene(ph === 0 ? "storm" : "dusk", "none");
        k.ridge((x) => 10 + Math.abs(x - 40) * 0.4 + sh, "#3a3048");
        k.ridge(() => 32 + sh, "#2a1832");
        k.disc(32, 26 + sh, 5, "#0e0a14"); k.fig("Elijah", "stand", 29, 20 + sh);
        if (ph === 0) for (let i = 0; i < 8; i++) { const x = (k.t * 60 + i * 23) % 140 - 10; k.line(x, 6 + i * 3, x + 10, 6 + i * 3, "#cfd8e8"); }
        if (ph === 1) { k.line(70, 31, 80, 26, "#0e0a14"); k.line(80, 26, 92, 31, "#0e0a14"); k.stones(100, 31, 6); }
        if (ph === 2) for (let x = 64; x < 128; x += 8) k.fire(x, 31, 6);
      } },
      { verse: 13, alt: "After the fire comes a quiet whisper, and Elijah covers his face and stands at the mouth of the cave", draw: (k) => {
        k.scene("dawn", "none");
        k.ridge((x) => 10 + Math.abs(x - 40) * 0.4, "#3a3048");
        k.ridge(() => 32, "#2a1832");
        k.disc(32, 26, 5, "#0e0a14");
        k.fig("Elijah", "stand", 40, 19); k.rect(41, 19, 6, 4, "#6a5a4a");
        for (let i = 0; i < 3; i++) { const r = 4 + ((k.t * 4 + i * 4) % 12); k.px(52 + r, 21 - Math.round(r / 3), "#f2d0a0"); k.px(52 + r, 21 + Math.round(r / 3), "#f2d0a0"); }
      } },
      { verse: 19, alt: "Elijah finds Elisha ploughing with twelve pairs of oxen and throws his cloak over him", draw: (k) => {
        k.scene("day", "hills");
        for (let i = 0; i < 3; i++) k.animal("ox", 4 + i * 16, 25, false, true);
        k.fig("Elisha", "stand", 56, 19); k.line(52, 29, 60, 31, "#5c3a1e");
        k.fig("Elijah", "stand", 96, 19, true);
        const p = (k.t * 0.6) % 1, x = 92 - p * 30, y = 22 - Math.sin(p * Math.PI) * 8;
        k.rect(x, y, 6, 3, "#6a5a4a"); k.px(x + 6, y + 1, "#5a4a3a");
      } },
    ],
    20: [
      { verse: 1, alt: "Ben-Hadad of Syria and thirty-two kings camp with their horses and chariots around Samaria", draw: (k) => {
        k.scene("dusk", "hills");
        k.city(64, 26, 34, 12, true);
        for (const x of [4, 22, 92, 110]) k.tent(x, 31, 15, 8, "#8a7a64");
        k.flag(40, 31, "#3a5a8a"); k.flag(88, 31, "#3a5a8a");
        k.animal("horse", 2, 24); k.fig("Ben-Hadad", "stand", 26, 19);
      } },
      { verse: 16, alt: "At noon Ben-Hadad and the kings drink in their tents as Israel's young soldiers march out", draw: (k) => {
        k.scene("noon", "hills");
        k.city(20, 28, 30, 12);
        const p = (k.t * 6) % 30;
        for (let i = 0; i < 3; i++) k.fig("young soldier " + i, "spear", 38 + i * 10 + p, 20);
        k.tent(84, 31, 40, 16, "#8a7a64");
        k.fig("Ben-Hadad", "sit", 96, 21, true); k.rect(93, 24, 2, 2, GOLD);
      } },
      { verse: 27, alt: "Israel's small army camps like two little flocks of goats while the Syrians fill the land", draw: (k) => {
        k.scene("day", "valley");
        for (let i = 0; i < 2; i++) k.fig("Israelite " + i, "spear", 6 + i * 9, 20);
        for (let i = 0; i < 2; i++) k.fig("Israelite " + (i + 2), "spear", 30 + i * 9, 20);
        for (let i = 0; i < 24; i++) {
          const x = 60 + (i % 8) * 8 + (Math.floor(i / 8) % 2) * 4, y = 20 + Math.floor(i / 8) * 4 + (Math.floor(k.t * 2 + i) % 5 === 0 ? -1 : 0);
          k.rect(x, y, 3, 2, "#e0a96d"); k.rect(x, y + 2, 3, 5, "#6a3a3a"); k.px(x - 1, y - 2, "#d8dce4"); k.line(x - 1, y - 1, x - 1, y + 6, "#8a6a3a");
        }
      } },
      { verse: 32, alt: "Ben-Hadad's officers come to Ahab wearing sackcloth with ropes on their heads, asking for mercy", draw: (k) => {
        k.scene("day", "hills");
        chariot(k, 10, 31, false, "Ahab");
        for (let i = 0; i < 3; i++) { const x = 50 + i * 16; k.fig("Syrian officer " + i, "kneel", x, 22, true); k.rect(x + 2, 22, 5, 1, "#c8b896"); k.rect(x + 1, 27, 7, 4, "#7a6a50"); }
        k.fig("Ben-Hadad", "stand", 110, 19, true);
      } },
      { verse: 38, alt: "A prophet with a bandage over his eyes waits by the road for the king", draw: (k) => {
        k.scene("day", "hills");
        k.rect(0, 30, 128, 3, "#a08a5a");
        k.fig("prophet", "stand", 30, 19); k.rect(31, 21, 7, 1, "#f2efe6");
        const p = (k.t * 8) % 50;
        chariot(k, 108 - p, 31, true, "Ahab");
      } },
    ],
    21: [
      { verse: 2, alt: "Ahab asks Naboth for his vineyard next to the palace, but Naboth will not sell his family's land", draw: (k) => {
        k.scene("day", "none");
        k.ridge((x) => 26 + Math.sin(x / 9) * 2, "#6f9a4a"); k.ridge(() => 32, "#4f7a36");
        k.palace(92, 31, 34, 18);
        for (let r = 0; r < 3; r++) for (let x = 6 + r * 3; x < 60; x += 9) {
          k.line(x, 31 - r, x, 25 - r, "#5c3a1e"); k.rect(x - 2, 23 - r, 5, 2, "#4a8a3a");
          k.px(x + ((k.f + x) % 6 < 3 ? -1 : 1), 25 - r, "#7a3a8a");
        }
        k.fig("Naboth", "stand", 62, 19); k.fig("Ahab", "stand", 76, 19, true);
      } },
      { verse: 4, alt: "Ahab lies on his bed facing the wall and will not eat, until Jezebel comes in", draw: (k) => {
        k.room("palace"); k.lamp(20, 8);
        bed(k, 64, 27, 40); k.fig("Ahab", "lie", 84, 24, true);
        table(k, 40, 25, 14); k.disc(46, 24, 2, "#e0a96d");
        k.fig("Jezebel", "stand", 14, 19);
      } },
      { verse: 8, alt: "Late at night Jezebel writes letters in Ahab's name and seals them with his seal", draw: (k) => {
        k.room("palace"); k.lamp(58, 14);
        k.rect(96, 6, 14, 12, "#0a0f1e"); k.px(100, 9, "#e8e8ff"); k.px(105, 13, "#e8e8ff");
        table(k, 44, 25, 30); k.scroll(52, 21); k.scroll(64, 22);
        k.fig("Jezebel", "sit", 30, 20);
        if (k.f % 16 < 8) k.disc(70, 24, 1, "#c8303a");
      } },
      { verse: 17, alt: "Elijah meets Ahab in Naboth's vineyard with the Lord's message of judgement", draw: (k) => {
        k.scene("dusk", "none");
        k.ridge((x) => 26 + Math.sin(x / 9) * 2, "#4a2a4a"); k.ridge(() => 32, "#3a2244");
        k.city(110, 28, 30, 10, true); k.stones(90, 31, 6);
        for (let x = 4; x < 60; x += 9) { k.line(x, 31, x, 25, "#5c3a1e"); k.rect(x - 2, 23, 5, 2, "#3a5a2a"); }
        k.fig("Elijah", "staff", 60, 19); k.fig("Ahab", "stand", 76, 19, true);
      } },
      { verse: 27, alt: "Ahab tears his clothes, puts on rough sackcloth and goes about quietly fasting", draw: (k) => {
        k.room("palace"); k.lamp(64, 10);
        k.fig("Ahab", "weep", 56, 19); k.rect(58, 24, 5, 6, "#7a6a50"); k.rect(57, 28, 7, 2, "#6a5a40");
        k.rect(20, 28, 10, 2, "#c8a06a"); k.rect(96, 26, 6, 4, "#a0603a");
      } },
    ],
    22: [
      { verse: 10, alt: "Ahab and Jehoshaphat sit on their thrones at Samaria's gate while Zedekiah waves iron horns", draw: (k) => {
        k.scene("day", "city", { cityX: 100, cityW: 44 });
        k.throne(10, 31); k.fig("Ahab", "sit", 12, 21);
        k.throne(28, 31); k.fig("Jehoshaphat", "sit", 30, 21);
        const b = Math.floor(k.t * 3) % 2;
        k.fig("Zedekiah", "stand", 52, 19 - b, true); k.px(52, 18 - b, "#8a8a92"); k.px(51, 17 - b, "#8a8a92"); k.px(58, 18 - b, "#8a8a92"); k.px(59, 17 - b, "#8a8a92");
        k.fig("prophet", "praise", 64, 20); k.fig("prophet 2", "praise", 76, 20);
      } },
      { verse: 17, alt: "Micaiah sees Israel scattered on the hills like sheep with no shepherd", draw: (k) => {
        k.scene("dusk", "mountains");
        for (let i = 0; i < 6; i++) k.animal("sheep", 40 + i * 14, 24 + (i % 3) * 2 + (Math.floor(k.t + i) % 3 === 0 ? -1 : 0), i % 2 === 0);
        k.fig("Micaiah", "stand", 12, 19);
      } },
      { verse: 30, alt: "At Ramoth Gilead Jehoshaphat rides in his royal robes while Ahab fights in disguise", draw: (k) => {
        k.scene("day", "valley");
        chariot(k, 8, 31, false, "Jehoshaphat");
        k.fig("disguised Ahab", "spear", 34, 20);
        const p = (k.t * 6) % 20;
        chariot(k, 90 - p, 31, true, "Syrian captain");
        const a = (k.t * 0.5) % 1; k.line(60 + a * 30, 4 + a * 4, 64 + a * 30, 4 + a * 4, "#8a6a3a");
      } },
      { verse: 37, alt: "At sunset Ahab's empty chariot is washed at the pool of Samaria", draw: (k) => {
        k.scene("dusk", "city", { cityX: 104, cityW: 40 });
        k.rect(20, 31, 50, 3, "#2c5a8c"); for (let x = 22; x < 68; x += 6) k.px(x + (k.f % 5), 32, "#9cc0f0");
        chariot(k, 28, 31, false);
        k.fig("servant", "kneel", 56, 22, true);
        for (let i = 0; i < 3; i++) k.px(54 - ((k.t * 6 + i) % 4), 26 + ((k.t * 8 + i * 2) % 4), "#9cc0f0");
        k.fig("mourner", "weep", 86, 19);
      } },
      { verse: 48, alt: "Jehoshaphat's ships are wrecked in a storm at Ezion-Geber before they can sail for gold", draw: (k) => {
        k.scene("storm", "none");
        sea(k, 26, "#1e3a5a");
        k.rect(0, 26, 30, 14, "#6a5a40");
        for (const [x, tilt] of [[44, 3], [84, -3]]) {
          for (let i = 0; i < 3; i++) k.rect(x + i, 28 + i + (i ? 0 : tilt > 0 ? 1 : 0), 20 - i * 2, 1, WOOD);
          k.line(x + 10, 27, x + 10 + tilt, 18, "#5c3a1e"); k.rect(x + 10 + tilt, 18, 5, 4, "#c8b896");
        }
        k.fig("Jehoshaphat", "weep", 10, 15);
      } },
    ],
  };

  for (const [ch, scenes] of Object.entries(NR)) {
    if (typeof _NR_SCENES !== "undefined") _NR_SCENES["1KI-" + ch] = scenes;
  }
})();
