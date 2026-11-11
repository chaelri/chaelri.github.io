// 19-scenes-ezr.js — the 8-bit banners for Ezra.
//
// Uses the scene kit from 12-scenes.js + 13-scenes-2sa.js (k.scene, k.fig,
// k.room, ...). Everything lives inside an IIFE so the local helpers below
// (temple, ruins, camel, scales, ...) never leak into the shared global scope.
// Scenes are keyed by the verse they open on. The hard ending of chapter 10 is
// shown by its setting (the rain, the inquiry), never the families parting.
(function () {
  const GOLD = "#f2c230", SILVER = "#d8dce4", WOOD = "#7a5a32", SKIN = "#e0a96d";

  // A gold band and three points on a standing or sitting figure's head.
  function king(k, name, pose, x, y, flip = false) {
    k.fig(name, pose, x, y, flip);
    const w = pose === "sit" ? 8 : 7;
    const col = (i) => (flip ? x + w - 1 - i : x + i);
    for (let i = 2; i <= 6; i++) k.px(col(i), y + 1, GOLD);
    for (const i of [2, 4, 6]) k.px(col(i), y, GOLD);
    k.px(col(4), y + 1, "#d42a4a");
  }

  // The Temple. stage 0 = foundation only, 1 = walls half up, 2 = finished.
  function temple(k, x, base, stage = 2, w = 36, scaffold = stage === 1) {
    const stone = "#c8b898", mort = "#a8987a", dark = "#2a2018";
    k.rect(x - 3, base - 2, w + 6, 3, "#8a7a60");
    for (let i = -3; i < w + 3; i += 5) k.px(x + i, base - 1, "#6a5a48");
    if (stage === 0) {
      for (let i = 0; i < w; i += 6) k.rect(x + i, base - 4, 5, 2, stone);
      return;
    }
    const h = stage === 1 ? 8 : 15;
    if (stage === 1) {
      for (let i = 0; i < w; i += 3) { const hh = h - ((i * 5) % 4); k.rect(x + i, base - 2 - hh, 3, hh, stone); }
      for (let y = base - 5; y > base - h; y -= 3) k.rect(x, y, w, 1, mort);
    } else {
      k.rect(x, base - 2 - h, w, h, stone);
      for (let y = base - 5; y > base - 2 - h; y -= 3) k.rect(x, y, w, 1, mort);
      k.rect(x - 2, base - 4 - h, w + 4, 2, "#e0d4b4");
      k.rect(x + w / 2 - 6, base - 9 - h, 12, 5, stone);
      k.rect(x + w / 2 - 7, base - 10 - h, 14, 1, "#e0d4b4");
      k.rect(x + w / 2 - 7, base - 13, 2, 11, "#c9a046");
      k.rect(x + w / 2 + 5, base - 13, 2, 11, "#c9a046");
      k.rect(x + w / 2 - 2, base - 10, 4, 8, dark);
    }
    if (scaffold) {
      for (const sx of [x + 3, x + w - 6]) {
        k.line(sx, base - 2, sx, base - h - 9, WOOD); k.line(sx + 3, base - 2, sx + 3, base - h - 9, WOOD);
        for (let y = base - 6; y > base - h - 9; y -= 4) k.line(sx, y, sx + 3, y, WOOD);
      }
    }
  }

  // Broken, fire-blackened walls of the old city.
  function ruins(k, x, base, w = 40, burnt = false) {
    for (let i = 0; i < w; i += 4) {
      const h = 3 + ((i * 7 + x) % 9);
      k.rect(x + i, base - h, 4, h, burnt ? (i % 8 ? "#4a3e36" : "#3a302a") : (i % 8 ? "#8a7a64" : "#6a5a4a"));
    }
    k.stones(x + 3, base + 1, 4);
    k.stones(x + w - 8, base + 1, 5);
  }

  const CAMEL = [
    "...........hh", "..........hhk", "....hh....h..", "...hhhh..hh..", "..hhhhhhhhh..",
    ".hhhhhhhhh...", ".hhhhhhhh....", "..h.h..h.h...", "..h.h..h.h...",
  ];
  function camel(k, x, y, flip = false, walk = true) {
    const bob = walk && Math.floor(k.t * 3) % 2 ? -1 : 0;
    k.sprite(CAMEL, { h: "#c09a62", k: "#2a1a10" }, x, y + bob, flip);
  }

  // A donkey with a pack on its back.
  function packDonkey(k, x, y, flip = false, c = "#a88a5a") {
    k.animal("donkey", x, y, flip, true);
    const bob = Math.floor(k.t * 4) % 2 ? -1 : 0;
    k.rect(x + 2, y + 1 + bob, 5, 3, c);
    k.px(x + 4, y + bob, "#5c3a1e");
  }

  // Gold and silver cups in a row, each glinting on its own beat.
  function vessels(k, x, y, n, step = 4) {
    for (let i = 0; i < n; i++) {
      const c = i % 2 ? SILVER : GOLD, vx = x + i * step;
      k.rect(vx, y, 3, 1, c); k.px(vx + 1, y + 1, c); k.rect(vx, y + 2, 3, 1, c);
      if ((k.f + i * 3) % 12 === 0) k.px(vx + 1, y - 1, "#ffffff");
    }
  }

  // A balance whose beam rocks gently: gold in one pan, silver in the other.
  function scales(k, x, y) {
    const tilt = k.pulse(2, 1);
    k.line(x, y, x, y + 10, WOOD); k.rect(x - 3, y + 10, 7, 1, "#5a3a22");
    k.line(x - 6, y + tilt, x + 6, y - tilt, "#c9a046");
    for (const [sx, dy] of [[-6, tilt], [6, -tilt]]) {
      k.line(x + sx, y + dy, x + sx, y + dy + 3, "#a8865c");
      k.rect(x + sx - 2, y + dy + 4, 5, 1, "#c9a046");
    }
    k.rect(x - 7, y + tilt + 3, 3, 1, GOLD);
    k.rect(x + 5, y - tilt + 3, 3, 1, SILVER);
  }

  function sack(k, x, base, c = "#c8b08a") { k.disc(x, base - 3, 3, c); k.rect(x - 1, base - 7, 3, 1, WOOD); }
  function jar(k, x, base, c = "#a8603a") { k.rect(x - 2, base - 5, 5, 5, c); k.rect(x - 1, base - 7, 3, 2, c); k.px(x, base - 4, "#c8805a"); }
  function chest(k, x, base) { k.rect(x, base - 5, 10, 5, "#6a4028"); k.rect(x, base - 5, 10, 1, "#8a5a32"); k.px(x + 5, base - 3, GOLD); }

  // A booth of poles and leafy branches for the Festival of Huts.
  function booth(k, x, base, w = 14) {
    k.line(x, base, x, base - 9, WOOD); k.line(x + w, base, x + w, base - 9, WOOD);
    for (let i = -1; i <= w + 1; i += 2) k.disc(x + i, base - 10, 1, i % 4 ? "#4a8a3a" : "#3f7a2e");
    k.px(x + (Math.floor(k.t * 3) % (w + 1)), base - 12, "#6aaa4a");
  }

  // Shelves of scroll pigeonholes along the back wall.
  function shelves(k, x, y, cols, rows) {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      k.rect(x + c * 6, y + r * 5, 5, 4, "#2a1a10");
      k.rect(x + c * 6 + 1, y + r * 5 + 1, 3, 2, (r + c) % 3 ? "#e8d8b0" : "#c9a46a");
    }
  }

  // Marks appearing across a scroll as someone writes.
  function writing(k, x, y, n = 8) {
    const done = Math.floor(k.t * 3) % (n + 4);
    for (let i = 0; i < Math.min(done, n); i++) k.px(x + i, y + (i % 2), "#3a2a20");
  }

  function hill(k, x0, top, c) { k.ridge((x) => (x > x0 ? top + (x - x0) * 0.15 : 40), c, 40, x0, 128); }

  const NR = {
    1: [
      { verse: 1, alt: "In his first year King Cyrus of Persia sits on his throne as the Lord stirs his heart to write a decree", draw: (k) => {
        k.room("palace"); k.lamp(14, 9); k.lamp(114, 9);
        k.glow(44, 12, 10 + k.pulse(1.5, 2), "#7a6a3a");
        k.throne(40, 31); king(k, "Cyrus", "sit", 42, 21);
        k.fig("scribe", "sit", 84, 21, true); k.scroll(70, 25); writing(k, 70, 26, 8);
      } },
      { verse: 2, alt: "A herald reads Cyrus's decree in Babylon: the Lord's people may go home and rebuild His Temple", draw: (k) => {
        k.scene("day", "city", { cityX: 26, cityW: 44 });
        k.fig("herald", "stand", 56, 19); k.scroll(63, 22 + k.pulse(2, 1));
        k.fig("exile", "stand", 82, 19, true); k.fig("exile 2", "praise", 94, 20); k.fig("exile 3", "stand", 108, 19, true);
        k.fig("exile child", "child", 104, 23, true);
      } },
      { verse: 5, alt: "Families of Judah and Benjamin load their donkeys while neighbours bring silver and gold", draw: (k) => {
        k.scene("day", "hills"); k.palace(4, 31, 30, 14);
        packDonkey(k, 84, 24, true); packDonkey(k, 104, 24, true, "#8a6a4a");
        k.fig("neighbour", "stand", 40, 19);
        const p = (Math.sin(k.t * 1.5) + 1) / 2; vessels(k, 48 + Math.round(p * 10), 23, 1);
        k.fig("Judah's elder", "stand", 64, 19, true); k.fig("Levite", "stand", 74, 19, true);
      } },
      { verse: 7, alt: "Cyrus's treasurer Mithredath counts out the Temple's gold and silver bowls for Sheshbazzar", draw: (k) => {
        k.room("palace"); k.lamp(64, 6);
        k.rect(30, 27, 68, 3, "#8a5a32"); k.rect(32, 30, 2, 2, "#5a3a22"); k.rect(94, 30, 2, 2, "#5a3a22");
        vessels(k, 34, 23, 1 + (Math.floor(k.t * 2) % 15));
        king(k, "Cyrus", "stand", 10, 19); k.fig("Mithredath", "stand", 20, 19);
        k.fig("Sheshbazzar", "stand", 104, 19, true);
      } },
      { verse: 11, alt: "At dawn Sheshbazzar leads the exiles out of Babylon with the Temple treasures on a cart", draw: (k) => {
        k.scene("dawn", "desert", { sunX: 112 });
        k.city(16, 30, 30, 10);
        const o = Math.round((k.t * 3) % 20);
        k.cart(40 + o, 26); vessels(k, 43 + o, 23, 3); k.animal("ox", 56 + o, 24, false, true);
        k.fig("exile", "run", 30 + o, 19); k.fig("Sheshbazzar", "staff", 70 + o, 19);
        k.fig("exile 2", "run", 84 + o, 19);
      } },
    ],
    2: [
      { verse: 1, alt: "The long caravan of returning exiles crosses the desert, Zerubbabel and Jeshua at its head", draw: (k) => {
        k.scene("noon", "desert");
        const walkers = ["exile 4", "exile 3", "exile 2", "exile", "Jeshua", "Zerubbabel"];
        packDonkey(k, 4, 24); camel(k, 18, 22);
        walkers.forEach((n, i) => k.fig(n, n === "Jeshua" ? "staff" : "run", 34 + i * 15, 19));
        k.fig("exile child", "child", 47, 23);
        for (let i = 0; i < 6; i++) k.px((k.f * 2 + i * 21) % 128, 31 - (i % 2), "#c8a870");
      } },
      { verse: 36, alt: "Priests, Levites, singers and gatekeepers walk together, the singers playing as they go", draw: (k) => {
        k.scene("day", "hills");
        k.fig("priest", "trumpet", 6, 19); k.fig("priest 2", "stand", 20, 19);
        k.fig("Levite", "stand", 38, 19); k.fig("singer", "praise", 52, 20);
        k.sprite(_SC_LYRE, _SC_PAL, 68, 24); k.fig("singer 2", "stand", 74, 19); k.notes(70, 20, "#f7d154");
        k.fig("gatekeeper", "spear", 96, 19); k.fig("gatekeeper 2", "spear", 110, 19);
      } },
      { verse: 66, alt: "Horses, mules, camels and donkeys plod along with the travellers at sunset", draw: (k) => {
        k.scene("dusk", "desert", { sunX: 40 });
        k.animal("horse", 2, 24, false, true); k.animal("horse", 18, 24, false, true);
        camel(k, 34, 22); camel(k, 52, 22);
        packDonkey(k, 70, 24); k.animal("donkey", 84, 24, false, true); packDonkey(k, 98, 24);
        k.fig("herdsman", "staff", 112, 19);
      } },
      { verse: 68, alt: "Arriving at the ruined Temple site, family leaders give gold and silver to rebuild it", draw: (k) => {
        k.scene("day", "hills");
        ruins(k, 70, 31, 54);
        chest(k, 52, 31);
        const n = Math.floor(k.t * 2) % 8;
        for (let i = 0; i < n; i++) k.px(53 + (i * 3) % 8, 25 - Math.floor(i / 3), i % 2 ? SILVER : GOLD);
        k.fig("family leader", "stand", 38, 19); k.fig("family leader 2", "stand", 24, 19); k.fig("family leader 3", "stand", 10, 19);
      } },
    ],
    3: [
      { verse: 1, alt: "In the seventh month the people gather as one in Jerusalem among the ruins", draw: (k) => {
        k.scene("dawn", "hills", { sunX: 64 });
        ruins(k, 4, 31, 28); ruins(k, 98, 31, 28);
        const o = Math.round(((k.t * 2) % 10));
        k.fig("exile", "run", 30 + o, 19); k.fig("exile 2", "run", 18 + o, 19);
        k.fig("exile 3", "run", 90 - o, 19, true); k.fig("exile 4", "run", 102 - o, 19, true);
        k.fig("Zerubbabel", "front", 56, 19); k.fig("Jeshua", "front", 66, 19);
      } },
      { verse: 2, alt: "Jeshua and Zerubbabel rebuild the altar and offer burnt offerings while wary neighbours watch", draw: (k) => {
        k.scene("day", "hills");
        hill(k, 92, 20, "#4f7a36");
        k.fig("neighbour", "spear", 100, 8, true); k.fig("neighbour 2", "stand", 112, 9, true);
        k.altar(48, 31); k.stones(64, 31, 6);
        k.fig("Jeshua", "praise", 30, 20); k.fig("Zerubbabel", "stand", 74, 19, true);
      } },
      { verse: 4, alt: "The people keep the Festival of Huts, living in shelters of leafy branches", draw: (k) => {
        k.scene("day", "field", { crop: "#a89a50", cropTop: "#c8b860" });
        booth(k, 8, 31); booth(k, 50, 31); booth(k, 92, 31, 16);
        k.fig("exile", "sit", 11, 21); k.fig("exile child", "child", 55, 23); k.fig("exile 2", "sit", 57, 21, true);
        k.fig("Levite", "sit", 96, 21); k.animal("sheep", 30, 27, false, true);
      } },
      { verse: 7, alt: "Cedar logs from Lebanon float down the sea to Joppa for the new Temple", draw: (k) => {
        k.scene("day", "none");
        k.ridge((x) => 12 + Math.abs(((x + 10) % 40) - 20) * 0.5, "#5a7a8a", 26, 0, 60);
        for (let i = 0; i < 4; i++) k.tree(6 + i * 13, 26, "oak", "#2f5a2a");
        k.rect(0, 26, 128, 14, "#2c5a8c");
        for (let x = 0; x < 128; x += 7) k.px((x + k.t * 5) % 128, 28 + (x % 9), "#9cc0f0");
        for (let i = 0; i < 4; i++) { const lx = ((i * 34 + k.t * 6) % 160) - 20; k.rect(lx, 30 + (i % 2) * 4, 14, 2, "#8a5a32"); k.px(lx, 30 + (i % 2) * 4, "#c8a070"); }
        k.rect(100, 26, 28, 6, "#b88a50"); k.fig("mason", "stand", 112, 15, true);
      } },
      { verse: 10, alt: "The Temple foundation is laid and the priests blow trumpets while the Levites praise with cymbals", draw: (k) => {
        k.scene("day", "hills");
        temple(k, 46, 31, 0);
        k.fig("priest", "trumpet", 8, 19); k.fig("priest 2", "trumpet", 22, 19);
        k.fig("Levite", "praise", 92, 20); k.fig("Levite 2", "stand", 106, 19, true);
        const clash = Math.floor(k.t * 4) % 2;
        k.px(103 - clash, 24, GOLD); k.px(105 + clash, 24, GOLD); k.notes(96, 16, "#f7d154");
      } },
      { verse: 12, alt: "Old men who remembered the first Temple weep aloud while others shout for joy", draw: (k) => {
        k.scene("day", "hills");
        temple(k, 46, 31, 0);
        k.fig("old priest", "weep", 6, 19); k.fig("old Levite", "weep", 18, 19); k.fig("elder", "weep", 30, 19);
        k.fig("young man", "praise", 86, 20); k.fig("young man 2", "dance", 100, 21); k.fig("young man 3", "praise", 114, 20);
      } },
    ],
    4: [
      { verse: 1, alt: "Neighbours come offering to help build, but Zerubbabel and Jeshua refuse them", draw: (k) => {
        k.scene("day", "hills");
        temple(k, 84, 31, 1, 36);
        k.fig("Samarian", "stand", 10, 19); k.fig("Samarian 2", "stand", 22, 19); k.fig("Samarian 3", "stand", 34, 19);
        k.fig("Zerubbabel", "stand", 56, 19, true); k.fig("Jeshua", "staff", 68, 19, true);
        k.line(54, 24, 51 + (k.f % 6 < 3 ? 0 : 1), 22, SKIN);
      } },
      { verse: 4, alt: "Enemies glare from a hill and bribe officials to frighten the builders", draw: (k) => {
        k.scene("dusk", "hills");
        temple(k, 8, 31, 1, 30);
        hill(k, 84, 18, "#3a2244");
        k.fig("enemy", "spear", 90, 6, true); k.fig("enemy 2", "spear", 104, 7, true);
        k.fig("builder", "weep", 46, 19); k.fig("official", "stand", 62, 19); k.fig("enemy 3", "stand", 76, 19, true);
        const p = (Math.sin(k.t * 2) + 1) / 2; k.px(70 + Math.round(-p * 4), 25, GOLD); k.px(71 + Math.round(-p * 4), 25, GOLD);
      } },
      { verse: 8, alt: "Rehum and Shimshai write a letter against Jerusalem to King Artaxerxes", draw: (k) => {
        k.room("house"); k.lamp(64, 8);
        k.rect(48, 27, 34, 3, "#6a4028");
        k.scroll(56, 23); writing(k, 57, 24, 7);
        k.fig("Shimshai", "sit", 40, 21); k.fig("Rehum", "stand", 92, 19, true);
        k.line(91, 24, 88 + (k.f % 6 < 3 ? 0 : 1), 23, SKIN);
      } },
      { verse: 17, alt: "Artaxerxes has the old records searched and sends back an order to stop the building", draw: (k) => {
        k.room("palace"); shelves(k, 70, 4, 9, 3);
        k.throne(14, 31); king(k, "Artaxerxes", "sit", 16, 21);
        k.fig("scribe", "stand", 46, 19, true); k.scroll(34, 22 + k.pulse(2, 1));
        k.fig("messenger", "kneel", 74, 22, true);
      } },
      { verse: 23, alt: "Rehum and Shimshai hurry to Jerusalem with soldiers to force the work to stop", draw: (k) => {
        k.scene("day", "hills");
        temple(k, 6, 31, 1, 30);
        k.fig("Rehum", "run", 56, 19, true); k.scroll(52, 22);
        k.fig("Shimshai", "run", 70, 19, true); k.fig("soldier", "spear", 86, 19, true); k.fig("soldier 2", "spear", 100, 19, true);
        for (let i = 0; i < 5; i++) k.px(80 + ((k.f * 3 + i * 9) % 40), 30 - (i % 2), "#a8986a");
      } },
      { verse: 24, alt: "Work on the Temple stops and the half-built walls stand silent", draw: (k) => {
        k.scene("dusk", "hills", { sunX: 104 });
        temple(k, 30, 31, 1, 44);
        k.line(80, 31, 86, 29, WOOD); k.stones(90, 31, 3);
        k.birds(3, 8, "#2a1832");
      } },
    ],
    5: [
      { verse: 1, alt: "The prophets Haggai and Zechariah speak God's word to the people of Judah", draw: (k) => {
        k.scene("day", "hills");
        temple(k, 92, 31, 1, 30, false);
        k.rect(18, 28, 12, 3, "#8a8070");
        k.fig("Haggai", "staff", 18, 16); k.fig("Zechariah", "praise", 32, 20);
        k.glow(24, 10, 6 + k.pulse(2, 2), "#fff6c8");
        k.fig("listener", "sit", 52, 21, true); k.fig("listener 2", "sit", 64, 21, true); k.fig("listener 3", "stand", 76, 19, true);
      } },
      { verse: 2, alt: "Zerubbabel and Jeshua start building again as stones are hauled up the scaffolds", draw: (k) => {
        k.scene("day", "hills");
        temple(k, 44, 31, 1, 40);
        const y = 28 - (Math.floor(k.t * 4) % 16); k.line(51, 6, 51, y, "#c8b08a"); k.rect(49, y, 4, 3, "#a8987a");
        k.fig("Zerubbabel", "stand", 20, 19); k.fig("Jeshua", "staff", 8, 19);
        k.fig("builder", "stand", 92, 19, true); k.rect(90, 17 + k.pulse(4, 1), 4, 3, "#a8987a");
        k.fig("builder 2", "run", 106, 19, true);
      } },
      { verse: 3, alt: "Governor Tattenai rides up and asks who gave them permission to build", draw: (k) => {
        k.scene("day", "hills");
        temple(k, 6, 31, 1, 34);
        k.fig("Zerubbabel", "stand", 50, 19);
        k.animal("horse", 76, 24, true); k.fig("Tattenai", "sit", 79, 17, true);
        k.animal("horse", 100, 24, true, true); k.fig("Shethar-Bozenai", "sit", 103, 17, true);
        k.line(78, 23, 74 + (k.f % 6 < 3 ? 0 : 1), 19, SKIN);
      } },
      { verse: 6, alt: "A rider gallops east with Tattenai's letter to King Darius", draw: (k) => {
        k.scene("noon", "desert");
        const x = ((k.t * 18) % 170) - 20;
        k.animal("horse", x, 24, false, true); k.fig("messenger", "sit", x + 1, 17); k.scroll(x + 9, 20);
        for (let i = 0; i < 4; i++) k.px(x - 3 - i * 3, 30 - (i % 2), "#c8a870");
      } },
      { verse: 12, alt: "The elders recall how Nebuchadnezzar burned the first Temple and carried the people away", draw: (k) => {
        k.scene("night", "hills", { noMoon: true });
        ruins(k, 56, 31, 64, true);
        k.fire(72, 26, 6); k.fire(100, 24, 8); k.smoke(72, 22); k.smoke(100, 20);
        k.glow(86, 22, 14 + k.pulse(2, 2), "#5a2a1a");
        k.fig("captive", "weep", 34, 19, true); k.fig("captive 2", "weep", 22, 19, true); k.fig("Babylonian", "spear", 6, 19, true);
      } },
    ],
    6: [
      { verse: 1, alt: "In the fortress at Ecbatana, Darius's officials find Cyrus's decree among the scrolls", draw: (k) => {
        k.room("house"); k.lamp(64, 6);
        shelves(k, 4, 4, 9, 4);
        k.fig("archivist", "stand", 70, 19, true);
        k.scroll(76, 22); k.glow(81, 24, 6 + k.pulse(2, 2), "#7a6a3a");
        k.fig("Darius's officer", "stand", 92, 19, true); k.fig("officer 2", "stand", 106, 19, true);
      } },
      { verse: 6, alt: "Tattenai reads Darius's reply ordering him to leave the Temple builders alone", draw: (k) => {
        k.scene("day", "hills");
        temple(k, 80, 31, 1, 40);
        k.fig("Tattenai", "stand", 30, 19); k.scroll(37, 22);
        k.fig("Shethar-Bozenai", "bow", 16, 25);
        k.fig("builder", "stand", 64, 19); k.rect(66, 17 + k.pulse(4, 1), 4, 3, "#a8987a");
      } },
      { verse: 14, alt: "The building goes well as Haggai and Zechariah encourage the elders", draw: (k) => {
        k.scene("day", "hills");
        temple(k, 46, 31, 2, 36, true);
        k.fig("Haggai", "staff", 8, 19); k.fig("Zechariah", "praise", 22, 20);
        k.fig("elder", "stand", 92, 19, true); k.fig("builder", "stand", 106, 19, true);
        k.px(52 + (k.f % 8), 13, "#a8987a");
      } },
      { verse: 15, alt: "The Temple is finished on the third day of Adar, in the sixth year of King Darius", draw: (k) => {
        k.scene("dawn", "hills", { sunX: 64 });
        k.glow(64, 18, 18 + k.pulse(1.3, 2), "#c08a5a");
        temple(k, 46, 31, 2);
        k.fig("Zerubbabel", "praise", 14, 20); k.fig("Jeshua", "praise", 104, 20);
      } },
      { verse: 16, alt: "The people dedicate the Temple with joy, bringing bulls, rams and lambs", draw: (k) => {
        k.scene("day", "hills");
        temple(k, 70, 31, 2, 34);
        k.altar(50, 31);
        k.animal("ox", 4, 26, false, true); k.animal("sheep", 18, 27, false, true); k.animal("sheep", 26, 28, false, true);
        k.fig("priest", "praise", 36, 20); k.fig("Levite", "dance", 112, 21);
      } },
      { verse: 19, alt: "On the fourteenth day of the first month the returned exiles eat the Passover at night", draw: (k) => {
        k.scene("night", "hills");
        temple(k, 90, 31, 2, 30);
        k.fire(34, 30, 8); k.rect(26, 23, 16, 1, WOOD); k.rect(30, 24, 8, 2, "#c8a070");
        k.fig("father", "sit", 10, 21); k.fig("mother", "sit", 50, 21, true); k.fig("exile child", "child", 62, 23, true);
        k.lamp(72, 26);
      } },
    ],
    7: [
      { verse: 1, alt: "Ezra, a priest descended from Aaron, studies the Law of the Lord by lamplight", draw: (k) => {
        k.room("house"); k.lamp(76, 10);
        shelves(k, 92, 6, 5, 3);
        k.fig("Ezra", "sit", 42, 21); k.scroll(52, 24);
        k.glow(57, 25, 6 + k.pulse(1.5, 1), "#7a6a3a");
      } },
      { verse: 7, alt: "Ezra's company of priests, Levites and singers sets out from Babylon on the four-month journey", draw: (k) => {
        k.scene("dawn", "desert", { sunX: 112 });
        k.city(14, 30, 26, 10);
        k.fig("singer", "praise", 34, 20); k.fig("Levite", "run", 48, 19); k.fig("priest", "run", 60, 19);
        packDonkey(k, 72, 24); k.fig("Ezra", "staff", 90, 19);
        k.notes(38, 16, "#f7d154");
      } },
      { verse: 10, alt: "Ezra sets his heart to study the Law, to do it, and to teach it to Israel", draw: (k) => {
        k.scene("day", "city", { cityX: 100, cityW: 50 });
        k.rect(14, 27, 18, 4, "#8a7a60");
        k.fig("Ezra", "stand", 18, 15); k.scroll(25, 18 + k.pulse(1.5, 1));
        k.fig("listener", "sit", 46, 21, true); k.fig("listener 2", "sit", 58, 21, true); k.fig("listener 3", "sit", 70, 21, true);
        k.fig("listener child", "child", 82, 23, true);
      } },
      { verse: 11, alt: "King Artaxerxes hands Ezra a letter giving him authority to go to Jerusalem", draw: (k) => {
        k.room("palace"); k.lamp(64, 6);
        k.throne(96, 31); king(k, "Artaxerxes", "sit", 98, 21, true);
        k.scroll(80, 22); k.glow(85, 24, 6 + k.pulse(2, 2), "#7a6a3a");
        k.fig("Ezra", "bow", 60, 25);
        k.fig("royal adviser", "stand", 30, 19); k.fig("royal adviser 2", "stand", 16, 19);
      } },
      { verse: 21, alt: "The king's treasurers west of the river supply silver, wheat, wine, oil and salt", draw: (k) => {
        k.scene("day", "city", { cityX: 100, cityW: 48 });
        sack(k, 20, 31); sack(k, 27, 31, "#b8a070"); jar(k, 36, 31); jar(k, 43, 31, "#8a5a3a");
        k.rect(48, 28, 6, 3, "#f2efe6"); k.px(51, 27, "#f2efe6");
        vessels(k, 18, 24, 3);
        k.fig("treasurer", "stand", 4, 19);
        k.fig("Ezra", "stand", 60, 19, true); k.fig("Levite", "stand", 72, 19, true);
      } },
      { verse: 27, alt: "Ezra praises the Lord who put it in the king's heart to honour His house", draw: (k) => {
        k.scene("dusk", "mountains", { sunX: 96 });
        k.fig("Ezra", "praise", 50, 20); k.notes(56, 16, "#f7d154");
        k.fig("Levite", "kneel", 30, 22); k.fig("priest", "kneel", 70, 22, true);
      } },
    ],
    8: [
      { verse: 1, alt: "The family leaders who go up with Ezra gather under their clan banners", draw: (k) => {
        k.scene("day", "field");
        const cols = ["#db2777", "#2f6fbf", "#d8a020", "#3f8a4a", "#8a4ab0"];
        cols.forEach((c, i) => { k.flag(10 + i * 24, 31, c); k.fig("clan leader " + i, "stand", 13 + i * 24, 19); });
      } },
      { verse: 15, alt: "The travellers camp for three days beside the Ahava River", draw: (k) => {
        k.scene("day", "river");
        k.tent(4, 28, 18, 10); k.tent(26, 28, 16, 9, "#b89a74"); k.tent(92, 28, 18, 10);
        k.fig("Ezra", "stand", 52, 16); k.fig("leader", "stand", 66, 16, true);
        k.scroll(60, 20 + k.pulse(1.5, 1));
      } },
      { verse: 21, alt: "By the river Ezra proclaims a fast, and the people kneel to ask God for a safe journey", draw: (k) => {
        k.scene("dusk", "river", { sunX: 104 });
        k.fig("Ezra", "kneel", 50, 19); k.fig("priest", "kneel", 34, 19); k.fig("Levite", "kneel", 18, 19);
        k.fig("exile", "kneel", 66, 19); k.fig("exile child", "child", 80, 21);
        k.glow(56, 6, 6 + k.pulse(1.5, 2), "#e0a060");
      } },
      { verse: 24, alt: "Ezra weighs out the silver, gold and bowls and entrusts them to twelve priests", draw: (k) => {
        k.room("tent"); k.lamp(110, 8);
        scales(k, 60, 16);
        vessels(k, 34, 27, 4); chest(k, 76, 30);
        k.fig("Ezra", "stand", 42, 18);
        k.fig("Sherebiah", "stand", 88, 19, true); k.fig("Hashabiah", "stand", 100, 19, true); k.fig("priest", "stand", 112, 19, true);
      } },
      { verse: 31, alt: "God's hand protects the caravan from robbers lying in wait along the road", draw: (k) => {
        k.scene("day", "desert");
        k.glow(40, 22, 22 + k.pulse(1.3, 2), "#fff6c8");
        k.fig("Ezra", "staff", 48, 19); packDonkey(k, 30, 24); k.fig("priest", "run", 18, 19); k.fig("Levite", "run", 6, 19);
        const hide = Math.floor(k.t * 1.5) % 3 === 0 ? 0 : 5;
        k.sprite(_SCK.stand.slice(0, 4), _scPalFor("robber"), 96, 17 + hide, true);
        k.disc(100, 29, 6, "#8a7050"); k.disc(112, 30, 5, "#7a6040");
      } },
      { verse: 35, alt: "In Jerusalem the returned exiles offer bulls and rams for all Israel", draw: (k) => {
        k.scene("day", "city", { cityX: 104, cityW: 44 });
        temple(k, 52, 31, 2, 30);
        k.altar(30, 31);
        k.animal("ox", 4, 26, false, true); k.animal("sheep", 16, 27); k.fig("priest", "praise", 86, 20);
      } },
    ],
    9: [
      { verse: 1, alt: "Leaders come to Ezra to report that the people have not kept themselves separate", draw: (k) => {
        k.scene("day", "city", { cityX: 20, cityW: 40 });
        temple(k, 92, 31, 2, 28);
        k.fig("Ezra", "stand", 52, 19);
        k.fig("leader", "stand", 66, 19, true); k.fig("leader 2", "stand", 78, 19, true);
        k.line(65, 24, 62 + (k.f % 6 < 3 ? 0 : 1), 23, SKIN);
      } },
      { verse: 3, alt: "Ezra tears his robe and sits stunned while those who fear God gather around him", draw: (k) => {
        k.scene("day", "hills");
        temple(k, 92, 31, 2, 30);
        k.fig("Ezra", "sit", 50, 21);
        k.line(53, 26, 54, 29, "#1a1218"); k.line(55, 27, 54, 29, "#1a1218");
        k.fig("faithful man", "bow", 30, 25); k.fig("faithful man 2", "bow", 68, 25, true); k.fig("faithful woman", "weep", 14, 19);
        if (k.f % 10 < 5) k.px(53, 20, "#9cc8f0");
      } },
      { verse: 5, alt: "At the evening sacrifice Ezra falls to his knees and spreads out his hands to God", draw: (k) => {
        k.scene("dusk", "hills", { sunX: 20 });
        temple(k, 82, 31, 2, 36);
        k.altar(60, 31);
        k.fig("Ezra", "kneel", 38, 22);
        const up = k.pulse(1.5, 1); k.px(45, 25 - 2 + up, SKIN); k.px(46, 24 - 2 + up, SKIN);
      } },
      { verse: 8, alt: "For a moment God gives a small remnant a secure place and light for their eyes", draw: (k) => {
        k.scene("night", "hills", { moonX: 20 });
        temple(k, 46, 31, 2);
        k.glow(64, 26, 10 + k.pulse(1.5, 2), "#7a6030");
        k.fig("remnant", "stand", 18, 19); k.fig("remnant 2", "stand", 30, 19); k.fig("remnant child", "child", 98, 23, true);
        k.lamp(64, 26);
      } },
      { verse: 13, alt: "Ezra bows low before the Temple and confesses that God is righteous", draw: (k) => {
        k.scene("night", "hills");
        temple(k, 64, 31, 2, 40);
        k.fig("Ezra", "bow", 36, 25);
        k.glow(84, 16, 8 + k.pulse(1.2, 2), "#3a3a5a");
      } },
    ],
    10: [
      { verse: 1, alt: "Ezra lies weeping before the Temple and a great crowd of men, women and children weep with him", draw: (k) => {
        k.scene("dusk", "hills");
        temple(k, 82, 31, 2, 36);
        k.fig("Ezra", "lie", 58, 28);
        k.fig("man", "weep", 6, 19); k.fig("woman", "weep", 18, 19); k.fig("child", "child", 30, 23); k.fig("man 2", "weep", 38, 19);
        if (k.f % 8 < 4) k.px(57, 30, "#9cc8f0");
      } },
      { verse: 2, alt: "Shecaniah tells Ezra there is still hope for Israel and urges him to rise and act", draw: (k) => {
        k.scene("dawn", "hills", { sunX: 64 });
        temple(k, 92, 31, 2, 30);
        k.fig("Ezra", "kneel", 40, 22); k.fig("Shecaniah", "stand", 58, 19, true);
        k.line(57, 24, 50, 22 + k.pulse(2, 1), SKIN);
      } },
      { verse: 6, alt: "Ezra spends the night in Jehohanan's room, eating no bread and drinking no water", draw: (k) => {
        k.room("house"); k.lamp(28, 8);
        k.rect(64, 27, 26, 3, "#6a4028");
        k.disc(70, 26, 2, "#c8a070"); jar(k, 82, 27, "#7a8a9a");
        k.fig("Ezra", "weep", 44, 19);
      } },
      { verse: 7, alt: "Messengers carry the summons to every town in Judah: come to Jerusalem in three days", draw: (k) => {
        k.scene("day", "hills");
        k.city(18, 28, 24, 8); k.city(108, 28, 26, 8);
        const x = 40 + (k.t * 10) % 40;
        k.fig("messenger", "run", x, 19); k.scroll(x + 7, 22);
        k.fig("messenger 2", "run", 92 - (k.t * 10) % 40, 19, true);
      } },
      { verse: 9, alt: "The men of Judah and Benjamin sit trembling in the Temple square in the heavy rain", draw: (k) => {
        k.scene("storm", "hills");
        temple(k, 90, 31, 2, 30);
        for (let i = 0; i < 6; i++) k.fig("man of Judah " + i, "sit", 4 + i * 12, 21 + (k.f % 6 === i ? 1 : 0));
        k.fig("Ezra", "stand", 76, 19, true);
      } },
      { verse: 16, alt: "Ezra and the family leaders sit down to look into each case, one family at a time", draw: (k) => {
        k.room("house"); k.lamp(16, 8); k.lamp(112, 8);
        k.rect(30, 27, 40, 3, "#6a4028"); k.scroll(34, 23); k.scroll(52, 23); writing(k, 53, 24, 7);
        k.fig("Ezra", "sit", 18, 21); k.fig("family leader", "sit", 70, 21, true);
        k.fig("man", "stand", 88, 19, true); k.fig("man 2", "stand", 100, 19, true); k.fig("man 3", "stand", 112, 19, true);
      } },
    ],
  };

  for (const [ch, scenes] of Object.entries(NR)) {
    if (typeof _NR_SCENES !== "undefined") _NR_SCENES["EZR-" + ch] = scenes;
  }
})();
