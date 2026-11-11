// 18-scenes-2ch-b.js — 8-bit scene banners for 2 Chronicles 19-36.
//
// Same kit as 2 Samuel (13-scenes-2sa.js mixes scene/room/fig/temple-ish
// props into every `k`). This file covers Jehoshaphat's last years, Joash and
// the temple repair, Uzziah, Ahaz, Hezekiah's Passover and the Assyrian
// siege, Manasseh, Josiah and the Book of the Law, and the exile with Cyrus's
// decree. Chapters 1-18 live in a sibling file. Killings, child sacrifice and
// idolatry are shown by their setting or aftermath only (toppled altars, a
// burning city, mourners), never the act. Canvas is 128x40, ground ~y 32.
(function () {
  // ── Local props (drawn with the base kit; nothing is added to k) ──────────
  // Paved temple court / street across the bottom of the canvas.
  function pave(k, c = "#b8a888", d = "#a08f70", y = 31) {
    k.rect(0, y, 128, 40 - y, c);
    for (let x = 0; x < 128; x += 8) k.rect(x + ((x / 8) % 2) * 4, y + 3, 1, 3, d);
    k.rect(0, y, 128, 1, d);
  }
  // Solomon's temple: stone house, tall porch, two bronze pillars, door.
  // o: shut (doors closed), worn (cracks), ruin (burnt, pillars gone), lit.
  function temple(k, x, base, w = 44, h = 18, o = {}) {
    const stone = o.ruin ? "#6a5e52" : "#c8b890", dark = o.ruin ? "#4a4038" : "#a89870";
    const cx = x + Math.floor(w / 2);
    k.rect(x, base - h, w, h, stone);
    for (let y = base - h + 3; y < base; y += 4) k.rect(x, y, w, 1, dark);
    k.rect(cx - 7, base - h - 7, 14, 7, stone);
    k.rect(cx - 8, base - h - 8, 16, 1, o.ruin ? dark : "#c9a046");
    k.rect(x - 2, base - h - 1, w + 4, 2, o.ruin ? dark : "#c9a046");
    if (!o.ruin) for (const p of [cx - 10, cx + 8]) { k.rect(p, base - 13, 2, 13, "#b07a3a"); k.rect(p - 1, base - 14, 4, 2, "#d8a050"); }
    k.rect(cx - 3, base - 10, 6, 10, o.shut ? "#5a3a22" : "#2a1a12");
    if (o.shut) { k.line(cx, base - 10, cx, base - 1, "#3a2414"); k.line(cx - 3, base - 6, cx + 2, base - 6, "#8a6a3a"); }
    if (o.lit) { k.rect(cx - 2, base - 9, 4, 9, "#7a5a20"); k.px(cx, base - 6 - (k.f % 4 < 2 ? 0 : 1), "#ffd27a"); }
    if (o.worn || o.ruin) {
      k.line(x + 4, base - h + 1, x + 8, base - h + 9, dark); k.line(x + w - 6, base - h + 2, x + w - 9, base - 4, dark);
      k.rect(x + 6, base - h - 1, 5, 2, o.skyC || "#9cc3e6"); k.rect(x + w - 10, base - h - 1, 4, 2, o.skyC || "#9cc3e6");
    }
  }
  // City wall run with crenellations; [g0, g1) is a breach full of rubble.
  function wall(k, x0, x1, base, h = 12, g0 = -1, g1 = -1) {
    for (let x = x0; x < x1; x += 2) {
      if (x >= g0 && x < g1) continue;
      k.rect(x, base - h, 2, h, (x >> 1) % 5 ? "#8a7a64" : "#7a6a56");
      if ((x >> 1) % 3 === 0) k.rect(x, base - h - 2, 2, 2, "#8a7a64");
    }
    for (let y = base - h + 3; y < base; y += 4) for (let x = x0; x < x1; x += 7) if (x < g0 || x >= g1) k.rect(x, y, 1, 1, "#5a4c40");
    if (g1 > g0) k.stones(g0 + 1, base, Math.max(3, Math.floor((g1 - g0) / 2)));
  }
  function tower(k, x, base, h = 18, lit = false) {
    k.rect(x, base - h, 10, h, "#7a6a58");
    for (let i = 0; i < 10; i += 4) k.rect(x + i, base - h - 2, 2, 2, "#7a6a58");
    k.rect(x + 4, base - h + 4, 2, 3, lit ? "#ffd27a" : "#2a2018");
    for (let y = base - h + 9; y < base; y += 4) k.rect(x, y, 10, 1, "#5a4c40");
  }
  // Joash's offering chest with a slot in the lid; a coin drops in.
  function chest(k, x, base) {
    k.rect(x, base - 6, 10, 6, "#8a5a32");
    k.rect(x - 1, base - 7, 12, 2, "#6a4022");
    k.rect(x + 4, base - 7, 3, 1, "#1a1008");
    k.rect(x + 2, base - 5, 1, 5, "#c9a046"); k.rect(x + 7, base - 5, 1, 5, "#c9a046");
    const p = (k.t * 1.1) % 1;
    if (p < 0.8) k.px(x + 5, base - 15 + p * 10, p % 0.2 < 0.1 ? "#fff0a0" : "#f2c230");
  }
  function ship(k, x, y, broken = false) {
    const rock = broken ? Math.round(Math.sin(k.t * 2) * 1) : k.pulse(1.6);
    for (let i = 0; i < 4; i++) k.rect(x + i, y + i + (broken ? Math.floor(i / 2) : 0), 22 - i * 2, 1, i ? "#6a4028" : "#8a5a32");
    if (broken) {
      k.line(x + 11, y, x + 18 + rock, y - 8, "#5c3a1e");
      k.rect(x + 14 + rock, y - 7, 4, 3, "#c8bca0"); k.px(x + 19, y - 4, "#c8bca0");
      return;
    }
    k.line(x + 11, y, x + 11 + rock, y - 12, "#5c3a1e");
    k.rect(x + 7, y - 11, 9, 7, "#e8dcc0"); k.rect(x + 7, y - 7, 9, 1, "#c8bca0");
  }
  function sea(k, y, c = "#2c5a8c", fleck = "#9cc0f0") {
    k.rect(0, y, 128, 40 - y, c);
    for (let x = 0; x < 128; x += 5) k.px((x + k.t * 5) % 128, y + 1 + (x % 4), fleck);
  }
  // A carved wooden pole (Asherah) or small stone idol; fallen = toppled.
  function pole(k, x, base, fallen = false) {
    if (fallen) { k.rect(x, base - 2, 14, 2, "#6a4a2a"); k.px(x + 13, base - 3, "#8a6a3a"); return; }
    k.rect(x, base - 15, 2, 15, "#6a4a2a"); k.rect(x - 1, base - 15, 4, 2, "#8a6a3a"); k.px(x, base - 10, "#3a2414");
  }
  const _IDOL = [".gg.", "gggg", ".dd.", "gddg", ".dd.", ".gg.", "gggg"];
  function idol(k, x, base, fallen = false, c = "#9a9080") {
    const pal = { g: c, d: "#6a6050" };
    if (fallen) { k.rect(x - 1, base - 3, 8, 3, c); k.px(x + 6, base - 4, pal.d); return; }
    k.rect(x - 1, base - 2, 6, 2, "#5a5048");
    k.sprite(_IDOL, pal, x, base - 9);
  }
  // Horse and chariot facing right (driver drawn behind the car).
  function chariot(k, name, x, y, flip = false) {
    k.fig(name, "stand", flip ? x + 10 : x - 9, y - 6, flip);
    k.rect(flip ? x + 10 : x - 10, y + 1, 8, 4, "#8a5a32");
    k.disc(flip ? x + 14 : x - 6, y + 5, 2, "#5a3a22");
    k.line(flip ? x + 10 : x - 2, y + 2, flip ? x + 6 : x + 2, y + 2, "#5c3a1e");
    k.animal("horse", flip ? x - 4 : x, y - 1, flip, true);
  }
  // A rock-cut tomb with a rolled stone.
  function tomb(k, x, base, w = 40, c = "#6a5a4a") {
    k.ridge((xx) => base - 14 + Math.abs(xx - x - w / 2) * 0.35, c, base + 1, x, x + w);
    const dx = x + Math.floor(w / 2);
    k.rect(dx - 3, base - 7, 6, 7, "#1a1210");
    k.disc(dx + 6, base - 3, 3, "#8a7a68");
  }
  function censer(k, x, y) {
    k.rect(x, y, 3, 2, "#e8b830"); k.px(x + 1, y - 1, "#ff9a3c");
    k.smoke(x + 1, y - 3);
  }
  function sacks(k, x, base, n = 3, c = "#c8c8d0") {
    for (let i = 0; i < n; i++) { k.rect(x + i * 5, base - 4, 4, 4, c); k.px(x + i * 5 + 1, base - 5, "#8a8a92"); }
    k.px(x + ((k.f >> 1) % (n * 5)), base - 3, "#ffffff");
  }
  // A heap of grain / fruit (a stepped mound).
  function heap(k, x, base, w = 14, c = "#d8b050", d = "#b89040") {
    for (let i = 0; i < w / 2; i++) k.rect(x + i, base - 1 - i * 0.7, w - i * 2, 1, i % 2 ? c : d);
    k.rect(x, base - 1, w, 1, d);
  }
  function jar(k, x, base, c = "#b8703a") {
    k.rect(x, base - 5, 4, 5, c); k.rect(x + 1, base - 7, 2, 2, c); k.px(x + 1, base - 3, "#8a4a22");
  }
  // Gold incense altar with horns and a thread of smoke.
  function incense(k, x, base) {
    k.rect(x, base - 8, 6, 8, "#d8a830"); k.rect(x, base - 8, 6, 1, "#fff0a0");
    k.px(x, base - 9, "#f7d154"); k.px(x + 5, base - 9, "#f7d154");
    k.smoke(x + 3, base - 11);
  }
  // A plain stone house with a flat roof and a door.
  function house(k, x, base, w = 18, h = 11, c = "#9a8a70") {
    k.rect(x, base - h, w, h, c); k.rect(x - 1, base - h - 1, w + 2, 2, "#7a6a54");
    k.rect(x + Math.floor(w / 2) - 2, base - 7, 4, 7, "#2a1e16");
  }
  // A pole being chopped down: swings from upright to flat and back.
  function felling(k, x, base) {
    const a = Math.min(1, (k.t % 4) / 2.4) * Math.PI / 2;
    k.line(x, base - 1, x + Math.sin(a) * 14, base - 1 - Math.cos(a) * 14, "#6a4a2a");
    k.line(x + 1, base - 1, x + 1 + Math.sin(a) * 14, base - 1 - Math.cos(a) * 14, "#6a4a2a");
  }
  // Iron chain between two points (dotted links).
  function chain(k, x0, x1, y) {
    for (let x = x0; x < x1; x += 2) k.px(x, y + (x % 4 ? 1 : 0), "#9a9aa8");
  }
  // A cooking pot over a fire.
  function pot(k, x, base) {
    k.fire(x + 3, base, 6);
    k.rect(x, base - 7, 7, 5, "#3a3a40"); k.rect(x - 1, base - 7, 9, 1, "#5a5a62");
    if (k.f % 6 < 3) k.px(x + 3, base - 9, "#c8c8d0");
  }
  // Rows of tents with pennants: an army camp.
  function camp(k, x0, x1, base, c = "#8a7a6a", flagC = "#2a3a6a") {
    for (let x = x0, i = 0; x < x1; x += 15, i++) { k.tent(x, base - (i % 2) * 3, 14, 8, c); if (i % 2 === 0) k.flag(x + 7, base - 8, flagC); }
  }
  // Cymbal clash between two gold discs.
  function cymbals(k, x, y) {
    const o = k.f % 4 < 2 ? 1 : 3;
    k.rect(x - o - 1, y, 2, 3, "#e8c040"); k.rect(x + o, y, 2, 3, "#e8c040");
    if (o === 1) { k.px(x - 3, y - 1, "#fff0a0"); k.px(x + 3, y - 1, "#fff0a0"); }
  }

  const NR = {
    19: [
      { verse: 1, alt: "Jehoshaphat comes home to Jerusalem and the prophet Jehu meets him at the gate", draw: (k) => {
        k.scene("day", "city", { cityX: 96, cityW: 52 });
        const p = (k.t * 4) % 14; k.fig("Jehoshaphat", "stand", 26 + p, 19);
        k.fig("Jehu", "staff", 62, 19, true);
      } },
      { verse: 5, alt: "Jehoshaphat appoints judges in the walled towns of Judah", draw: (k) => {
        k.scene("day", "hills"); k.city(102, 30, 34, 10);
        k.fig("Jehoshaphat", "stand", 26, 19); k.scroll(36, 22);
        k.fig("judge", "staff", 54, 19, true); k.fig("judge 2", "staff", 66, 19, true);
        k.birds(3, 8);
      } },
      { verse: 8, alt: "Priests and Levites sit as judges in Jerusalem under Amariah the chief priest", draw: (k) => {
        k.scene("noon", "none"); pave(k); temple(k, 42, 31);
        k.fig("Amariah", "front", 60, 19); k.fig("Levite", "staff", 84, 19, true);
        k.fig("man of Judah", "kneel", 30, 22); k.fig("man of Judah 2", "stand", 14, 19);
        k.scroll(72, 24 + k.pulse(2));
      } },
    ],
    20: [
      { verse: 5, alt: "Jehoshaphat stands before the temple and prays while Judah's families wait", draw: (k) => {
        k.scene("day", "none"); pave(k); temple(k, 74, 31, 48, 18);
        k.fig("Jehoshaphat", "praise", 54, 19);
        k.fig("man of Judah", "kneel", 8, 22); k.fig("woman of Judah", "kneel", 22, 22);
        k.fig("child of Judah", "child", 34, 24); k.fig("man of Judah 2", "kneel", 40, 22);
      } },
      { verse: 14, alt: "The Spirit of the Lord comes on Jahaziel in the middle of the assembly", draw: (k) => {
        k.scene("noon", "hills");
        k.glow(64, 22, 11 + k.pulse(2), "#d8c070");
        for (let i = 0; i < 3; i++) if ((k.f + i * 3) % 9 < 5) k.line(58 + i * 6, 0, 61 + i * 2, 14, "#fff6c8");
        k.fig("Jahaziel", "front", 60, 19);
        k.fig("man of Judah", "kneel", 26, 22); k.fig("Jehoshaphat", "kneel", 42, 22);
        k.fig("Levite", "kneel", 78, 22, true); k.fig("man of Judah 2", "kneel", 94, 22, true);
      } },
      { verse: 21, alt: "Singers in holy robes march ahead of the army praising the Lord", draw: (k) => {
        k.scene("dawn", "desert");
        const b = 16 + ((k.t * 4) % 20);
        k.fig("singer", "praise", b + 62, 20); k.fig("singer 2", "trumpet", b + 50, 19);
        k.fig("soldier", "spear", b + 34, 19); k.fig("soldier 2", "spear", b + 22, 19); k.fig("Jehoshaphat", "stand", b + 8, 19);
        k.notes(b + 66, 18, "#f7d154");
      } },
      { verse: 24, alt: "From the desert watchtower Judah sees only fallen shields; not one enemy is left", draw: (k) => {
        k.scene("noon", "desert", { sunX: 64 });
        tower(k, 10, 31); k.fig("lookout", "stand", 11, 1);
        for (let i = 0; i < 7; i++) { const x = 40 + i * 12, y = 30 + (i % 3); k.disc(x, y, 2, "#8a6a3a"); k.px(x, y, "#c9a046"); k.line(x + 3, y + 2, x + 8, y - 1, "#6a5030"); }
        k.birds(3, 6, "#3a2a20");
      } },
      { verse: 35, alt: "The ships Jehoshaphat built with Ahaziah are wrecked at Ezion Geber", draw: (k) => {
        k.scene("storm", "none"); sea(k, 27, "#1e3a5a", "#7a9ab8");
        k.ridge((x) => 28 - Math.max(0, 26 - x) * 0.3, "#5a5040", 40, 0, 30);
        k.fig("Eliezer", "staff", 6, 14);
        ship(k, 44, 26, true); ship(k, 86, 28, true);
      } },
    ],
    21: [
      { verse: 1, alt: "Jehoshaphat is buried with his ancestors in the City of David", draw: (k) => {
        k.scene("dusk", "hills", { sunX: 24 }); tomb(k, 70, 31, 46);
        k.fig("Jehoram", "stand", 34, 19); k.fig("mourner", "weep", 48, 19); k.fig("mourner 2", "weep", 60, 19);
      } },
      { verse: 9, alt: "Jehoram's chariots break out by night through the Edomites who surround them", draw: (k) => {
        k.scene("night", "hills");
        k.tent(4, 31, 16, 8, "#4a3a2a"); k.tent(104, 31, 18, 9, "#4a3a2a");
        k.fire(28, 31, 4); k.fire(98, 31, 4);
        const x = ((k.t * 16) % 170) - 30; chariot(k, "Jehoram", x, 24);
      } },
      { verse: 12, alt: "A letter arrives for King Jehoram from the prophet Elijah", draw: (k) => {
        k.room("palace"); k.lamp(12, 9); k.lamp(116, 9);
        k.throne(24, 31); k.fig("Jehoram", "sit", 26, 21);
        k.scroll(40 + k.pulse(1.2), 21);
        k.fig("messenger", "bow", 70, 25, true);
      } },
      { verse: 16, alt: "Philistines and Arabs carry off the treasures of the king's palace", draw: (k) => {
        k.scene("day", "desert"); k.palace(6, 31, 36, 16);
        for (let i = 0; i < 2; i++) {
          const x = 48 + ((k.t * 10 + i * 34) % 70);
          k.fig("raider " + i, "run", x, 19); k.rect(x + 1, 16, 6, 3, i ? "#f2c230" : "#c8c8d0");
        }
        k.animal("donkey", 100 - ((k.t * 3) % 6), 24, false, true); k.rect(102, 22, 6, 2, "#c9a046");
      } },
    ],
    22: [
      { verse: 1, alt: "Jerusalem makes young Ahaziah king while his mother Athaliah stands beside him", draw: (k) => {
        k.room("palace"); k.lamp(14, 9); k.lamp(112, 9);
        k.throne(56, 31); k.fig("Ahaziah", "sit", 58, 21);
        k.fig("Athaliah", "stand", 74, 19, true);
        k.fig("official", "bow", 20, 25); k.fig("official 2", "bow", 34, 25);
      } },
      { verse: 5, alt: "Ahaziah rides out with Joram of Israel to fight at Ramoth Gilead", draw: (k) => {
        k.scene("day", "mountains");
        const p = (k.t * 5) % 24;
        chariot(k, "Joram", 54 + p, 24); chariot(k, "Ahaziah", 22 + p, 24);
        k.flag(112, 31, "#5a5a8a");
      } },
      { verse: 10, alt: "Athaliah seizes the throne of Judah in a darkened palace", draw: (k) => {
        k.room("palace"); k.rect(0, 0, 128, 30, "#2a1a14"); k.lamp(64, 6);
        k.throne(58, 31); k.fig("Athaliah", "sit", 60, 21);
        k.fig("guard", "spear", 30, 19); k.fig("guard 2", "spear", 92, 19, true);
      } },
      { verse: 11, alt: "Jehosheba hides baby Joash and his nurse in the temple", draw: (k) => {
        k.scene("night", "none", { moonX: 20 }); pave(k, "#3a3448", "#2a2438"); temple(k, 70, 31, 46, 18, { lit: true });
        const x = 14 + ((k.t * 4) % 34);
        k.fig("nurse", "stand", x, 19); k.fig("Jehosheba", "stand", x + 12, 19); k.fig("Joash", "baby", x + 16, 24);
      } },
    ],
    23: [
      { verse: 1, alt: "Jehoiada the priest makes a covenant with the army commanders", draw: (k) => {
        k.room("house"); k.lamp(64, 6);
        k.fig("Jehoiada", "front", 60, 19); k.scroll(46, 24);
        k.fig("commander", "spear", 28, 19); k.fig("commander 2", "spear", 14, 19);
        k.fig("commander 3", "spear", 82, 19, true); k.fig("commander 4", "spear", 96, 19, true);
      } },
      { verse: 11, alt: "Jehoiada brings out the boy Joash and crowns him as trumpets sound", draw: (k) => {
        k.scene("day", "none"); pave(k); temple(k, 42, 31);
        k.fig("Joash", "child", 61, 24); k.crown(61, 20);
        k.fig("Jehoiada", "front", 46, 19);
        k.fig("Levite", "spear", 30, 19); k.fig("Levite 2", "spear", 86, 19, true);
        k.fig("trumpeter", "trumpet", 6, 19); k.fig("man of Judah", "praise", 104, 20);
      } },
      { verse: 13, alt: "Athaliah tears her robes when she sees the boy king standing by the pillar", draw: (k) => {
        k.scene("day", "none"); pave(k); temple(k, 70, 31, 48, 18);
        k.fig("Joash", "child", 87, 24); k.crown(87, 20);
        k.fig("guard", "spear", 74, 19); k.fig("guard 2", "spear", 112, 19, true);
        k.fig("Athaliah", "stand", 28, 19);
        if (k.f % 6 < 3) { k.line(30, 26, 32, 29, "#1a1018"); k.line(33, 25, 34, 28, "#1a1018"); }
      } },
      { verse: 17, alt: "The people tear down the house of Baal and smash its altars and idols", draw: (k) => {
        k.scene("dusk", "hills");
        for (let i = 0; i < 4; i++) k.rect(74 + i * 10, 31 - [14, 8, 11, 5][i], 4, [14, 8, 11, 5][i], "#6a6058");
        k.rect(80, 29, 18, 2, "#5a5048");
        idol(k, 104, 31, true); k.stones(46, 31, 9);
        k.fire(92, 31, 6); k.smoke(92, 22);
        k.fig("man of Judah", "stand", 18, 19); k.fig("man of Judah 2", "stand", 32, 19);
      } },
      { verse: 20, alt: "Joash is led through the Upper Gate and seated on the royal throne", draw: (k) => {
        k.room("palace"); k.lamp(16, 9); k.lamp(110, 9);
        k.throne(60, 31); k.fig("Joash", "child", 62, 18); k.crown(62, 14);
        k.fig("Jehoiada", "stand", 40, 19);
        k.fig("captain", "spear", 82, 19, true); k.fig("captain 2", "spear", 96, 19, true);
        k.fig("man of Judah", "praise", 14, 20);
      } },
    ],
    24: [
      { verse: 4, alt: "King Joash sees the neglected temple and decides to repair it", draw: (k) => {
        k.scene("day", "none"); pave(k); temple(k, 58, 31, 48, 18, { worn: true, skyC: "#9cc3e6" });
        k.fig("Joash", "stand", 22, 19); k.fig("Jehoiada", "staff", 36, 19);
        k.birds(2, 6);
      } },
      { verse: 8, alt: "A chest stands at the temple gate and the people gladly bring their gifts", draw: (k) => {
        k.scene("day", "none"); pave(k); temple(k, 66, 31, 48, 18);
        chest(k, 44, 31);
        k.fig("Levite", "front", 56, 19);
        k.fig("woman of Judah", "stand", 30, 19); k.fig("man of Judah", "stand", 16, 19); k.fig("man of Judah 2", "stand", 2, 19);
      } },
      { verse: 12, alt: "Masons and carpenters rebuild God's house", draw: (k) => {
        k.scene("noon", "none"); pave(k); temple(k, 40, 31, 48, 18);
        for (const x of [36, 92]) k.line(x, 31, x, 6, "#8a6a3a");
        k.line(36, 12, 92, 12, "#8a6a3a");
        k.fig("mason", "stand", 50, 0); k.fig("carpenter", "stand", 76, 0, true);
        if (k.f % 4 < 2) k.px(57, 3, "#ffffff");
        const x = 104 - ((k.t * 6) % 30); k.fig("worker", "stand", x, 19, true); k.rect(x - 4, 22, 14, 1, "#a8865c");
        k.stones(8, 31, 6);
      } },
      { verse: 15, alt: "Jehoiada dies at 130 and is buried among the kings", draw: (k) => {
        k.scene("dusk", "hills", { sunX: 108 }); tomb(k, 6, 31, 44);
        k.fig("Joash", "weep", 58, 19); k.fig("priest", "weep", 70, 19); k.fig("Levite", "weep", 82, 19);
      } },
      { verse: 20, alt: "The Spirit comes on Zechariah son of Jehoiada and he stands above the people to warn them", draw: (k) => {
        k.scene("day", "none"); pave(k);
        k.rect(48, 25, 28, 6, "#a89870"); k.rect(48, 25, 28, 1, "#c8b890");
        k.glow(60, 18, 9 + k.pulse(2), "#d8c070");
        k.fig("Zechariah", "front", 56, 13);
        k.fig("official", "stand", 20, 19); k.fig("official 2", "stand", 32, 19);
        k.fig("man of Judah", "stand", 86, 19, true); pole(k, 114, 31);
      } },
    ],
    25: [
      { verse: 5, alt: "Amaziah musters Judah's chosen men with spear and shield", draw: (k) => {
        k.scene("day", "hills");
        for (let i = 0; i < 8; i++) k.fig("soldier " + i, "spear", 6 + i * 13, 16);
        for (let i = 0; i < 7; i++) { k.fig("soldier " + (i + 8), "stand", 12 + i * 13, 20); k.disc(18 + i * 13, 27, 2, "#8a6a3a"); }
        k.flag(120, 30, "#db2777");
      } },
      { verse: 7, alt: "A man of God warns Amaziah not to take Israel's hired soldiers", draw: (k) => {
        k.scene("day", "hills");
        k.fig("Amaziah", "stand", 30, 19); k.fig("man of God", "staff", 46, 19, true);
        sacks(k, 62, 31);
        k.fig("Israelite soldier", "spear", 84, 19, true); k.fig("Israelite soldier 2", "spear", 98, 19, true); k.fig("Israelite soldier 3", "spear", 112, 19, true);
      } },
      { verse: 14, alt: "Amaziah sets up the gods of Edom and a prophet comes to rebuke him", draw: (k) => {
        k.scene("dusk", "none"); pave(k, "#6a5048", "#4a3830");
        for (const x of [60, 72, 84]) idol(k, x, 31);
        k.smoke(77, 18);
        k.fig("Amaziah", "stand", 40, 19); k.fig("prophet", "staff", 108, 19, true);
      } },
      { verse: 18, alt: "Jehoash's parable: a wild beast tramples the thistle beside the cedar of Lebanon", draw: (k) => {
        k.scene("day", "mountains");
        for (let i = 0; i < 5; i++) k.rect(20 - i * 2, 6 + i * 5, 6 + i * 4, 4, i % 2 ? "#2a5a2a" : "#3a6a32");
        k.rect(22, 30, 3, 3, "#5c3a1e");
        const lx = 118 - ((k.t * 8) % 70);
        const flat = lx < 76 && lx > 58;
        if (flat) k.rect(64, 30, 7, 2, "#6a5a3a"); else { k.line(67, 31, 67, 25, "#6a7a3a"); k.disc(67, 24, 1, "#8a4aa0"); k.px(65, 28, "#6a7a3a"); k.px(69, 27, "#6a7a3a"); }
        k.animal("lion", lx, 27, true, true);
      } },
      { verse: 23, alt: "Jehoash breaks down Jerusalem's wall and carries off the temple gold", draw: (k) => {
        k.scene("day", "hills"); wall(k, 0, 128, 31, 14, 52, 76);
        const x = 54 + ((k.t * 8) % 74);
        k.fig("Israelite soldier", "run", x, 19); k.rect(x + 1, 16, 6, 2, "#f2c230");
        k.fig("Amaziah", "kneel", 30, 22); k.fig("Jehoash", "sword", 16, 19);
      } },
    ],
    26: [
      { verse: 10, alt: "Uzziah builds towers in the wilderness, digs cisterns and keeps herds and vineyards", draw: (k) => {
        k.scene("day", "field", { crop: "#6a9a3a", cropTop: "#8aba4a" });
        tower(k, 8, 31, 20); k.well(26, 31);
        k.animal("ox", 44, 26); k.animal("sheep", 60, 27, false, true); k.animal("sheep", 68, 28);
        k.fig("Uzziah", "stand", 88, 19, true); k.fig("farmer", "staff", 104, 19, true);
      } },
      { verse: 15, alt: "Skilled men set machines on Jerusalem's towers to shoot arrows and great stones", draw: (k) => {
        k.scene("day", "none"); k.rect(0, 31, 128, 9, "#4f7a36"); wall(k, 0, 128, 31, 10);
        tower(k, 14, 31, 16); tower(k, 96, 31, 16);
        const a = (k.t * 1.5) % 1;
        k.line(19, 15, 19 + Math.cos(a * 2) * 6, 15 - Math.sin(a * 2) * 6, "#7a5a32");
        const sx = 26 + a * 60; k.disc(sx, 6 + (a - 0.5) * (a - 0.5) * 24, 1, "#6a6050");
        k.fig("engineer", "stand", 36, 9); k.fig("soldier", "spear", 98, 3, true);
      } },
      { verse: 16, alt: "Proud Uzziah walks into the temple with a censer and the priests follow him in", draw: (k) => {
        k.room("palace"); k.rect(0, 0, 128, 2, "#c9a046"); k.rect(116, 4, 12, 26, "#7a1a2a");
        incense(k, 100, 30);
        k.fig("Uzziah", "stand", 80, 19); censer(k, 87, 25);
        k.fig("Azariah", "stand", 40, 19); k.fig("priest", "stand", 26, 19); k.fig("priest 2", "stand", 12, 19);
      } },
      { verse: 19, alt: "Skin disease breaks out on Uzziah's forehead beside the incense altar", draw: (k) => {
        k.room("palace"); k.rect(0, 0, 128, 2, "#c9a046");
        incense(k, 84, 30);
        k.fig("Uzziah", "stand", 64, 19, true);
        if (k.f % 8 < 5) { k.px(65, 21, "#f4f4ec"); k.px(67, 22, "#f4f4ec"); k.px(66, 20, "#f4f4ec"); }
        k.rect(56, 29, 3, 2, "#e8b830");
        k.fig("Azariah", "front", 38, 19); k.fig("priest", "front", 24, 19); k.fig("priest 2", "front", 10, 19);
      } },
      { verse: 21, alt: "Uzziah lives alone in a separate house while his son Jotham governs", draw: (k) => {
        k.scene("dusk", "hills"); house(k, 12, 31, 20, 11, "#7a6a58");
        k.fig("Uzziah", "sit", 34, 21, true);
        k.palace(76, 31, 40, 16); k.fig("Jotham", "front", 92, 19);
      } },
    ],
    27: [
      { verse: 3, alt: "Jotham builds the Upper Gate of the Lord's temple", draw: (k) => {
        k.scene("day", "none"); pave(k); temple(k, 18, 31, 44, 18);
        k.rect(80, 16, 26, 15, "#a89878"); k.rect(88, 22, 10, 9, "#2a1a12"); k.rect(78, 14, 30, 2, "#c9a046");
        for (let y = 19; y < 31; y += 4) k.rect(80, y, 8, 1, "#8a7a5a");
        k.fig("mason", "stand", 92, 2); if (k.f % 4 < 2) k.px(99, 11, "#ffffff");
        k.fig("Jotham", "stand", 66, 19);
      } },
      { verse: 4, alt: "Jotham builds towns in the hill country and forts and towers in the forests", draw: (k) => {
        k.scene("day", "forest"); tower(k, 40, 31, 20); k.city(96, 30, 30, 9);
        k.fig("Jotham", "stand", 58, 19); k.fig("builder", "stand", 70, 19, true); k.rect(64, 22, 6, 4, "#8a8070");
      } },
      { verse: 5, alt: "The Ammonites bring Jotham silver, wheat and barley as tribute", draw: (k) => {
        k.scene("noon", "hills");
        k.fig("Jotham", "stand", 18, 19);
        sacks(k, 32, 31, 3); heap(k, 50, 31, 12); heap(k, 64, 31, 12, "#c8a868", "#a88848");
        const x = 108 - ((k.t * 4) % 14);
        k.animal("donkey", x, 24, true, true); k.rect(x + 2, 22, 5, 2, "#d8b050"); k.fig("Ammonite", "stand", x + 12, 19, true);
      } },
    ],
    28: [
      { verse: 2, alt: "Ahaz sets up idols and altars on the hills and under the green trees", draw: (k) => {
        k.scene("dusk", "hills");
        k.tree(10, 30, "oak", "#2a4a2a"); k.tree(110, 30, "oak", "#2a4a2a");
        k.altar(30, 31); idol(k, 48, 31, false, "#8a7a5a"); pole(k, 98, 31);
        k.altar(76, 31); k.fig("Ahaz", "stand", 60, 19, true);
      } },
      { verse: 9, alt: "The prophet Oded meets Israel's army and its captives at Samaria", draw: (k) => {
        k.scene("day", "hills"); k.city(112, 30, 28, 10);
        k.fig("Oded", "staff", 86, 19, true);
        k.fig("soldier", "spear", 66, 19); k.fig("soldier 2", "spear", 54, 19);
        k.fig("captive", "weep", 36, 19); k.fig("captive 2", "weep", 24, 19); k.fig("captive child", "child", 14, 24);
      } },
      { verse: 15, alt: "The captives are clothed, fed and taken on donkeys to Jericho, the city of palms", draw: (k) => {
        k.scene("day", "desert");
        for (const x of [96, 106, 118]) k.tree(x, 30, "palm");
        k.city(108, 30, 26, 8);
        const p = (k.t * 5) % 20;
        k.animal("donkey", 46 + p, 24, false, true); k.fig("captive", "sit", 47 + p, 15);
        k.fig("Ephraimite", "staff", 60 + p, 19); k.fig("captive 2", "stand", 30 + p, 19); k.fig("captive child", "child", 20 + p, 24);
        k.rect(76 + p, 27, 4, 3, "#e0a96d");
      } },
      { verse: 21, alt: "Ahaz sends the temple and palace treasures to the king of Assyria", draw: (k) => {
        k.scene("day", "desert");
        k.fig("Tiglath-Pileser", "stand", 100, 19, true); k.flag(116, 31, "#2a3a6a");
        k.fig("servant", "stand", 68, 19); k.rect(70, 16, 6, 3, "#f2c230");
        sacks(k, 80, 31, 2, "#f2c230");
        k.fig("Ahaz", "bow", 36, 25);
      } },
      { verse: 24, alt: "Ahaz shuts the temple doors and sets up altars on every street corner", draw: (k) => {
        k.scene("dusk", "none"); pave(k, "#6a5a50", "#4a3c34"); temple(k, 42, 31, 44, 18, { shut: true });
        k.altar(10, 31); k.altar(104, 31);
        k.fig("Ahaz", "stand", 26, 19);
      } },
    ],
    29: [
      { verse: 3, alt: "In his first month Hezekiah opens the doors of the Lord's temple again", draw: (k) => {
        k.scene("dawn", "none"); pave(k); temple(k, 42, 31, 44, 18, { lit: true });
        const o = Math.min(3, Math.floor((k.t % 5) * 1.2));
        k.rect(61 - o, 21, 3 - Math.min(o, 2), 10, "#5a3a22"); k.rect(64 + o, 21, 3 - Math.min(o, 2), 10, "#5a3a22");
        k.fig("Hezekiah", "stand", 26, 19); k.fig("Levite", "stand", 92, 19, true);
      } },
      { verse: 16, alt: "The priests carry everything unclean out of the temple to the Kidron Valley", draw: (k) => {
        k.scene("day", "none");
        k.ridge((x) => 14 + x * 0.14, "#8a9a6a"); temple(k, 4, 18, 26, 10);
        k.rect(0, 37, 128, 3, "#2c5a8c"); k.px((k.t * 6) % 128, 38, "#9cc0f0");
        for (let i = 0; i < 3; i++) {
          const p = (k.t * 0.15 + i / 3) % 1, x = 34 + p * 80, y = 14 + x * 0.14 - 12;
          k.fig("priest " + i, "stand", x, y); k.rect(x + 1, y - 2, 5, 2, "#6a5a40");
        }
        k.stones(112, 37, 5);
      } },
      { verse: 20, alt: "Early in the morning Hezekiah brings bulls, rams, lambs and goats to the altar", draw: (k) => {
        k.scene("dawn", "none"); pave(k); temple(k, 76, 31, 44, 18);
        k.altar(60, 31);
        k.animal("ox", 30, 26, false, true); k.animal("sheep", 44, 27); k.animal("sheep", 50, 28, true);
        k.fig("Hezekiah", "stand", 8, 19); k.fig("priest", "front", 72, 19);
      } },
      { verse: 25, alt: "Levites play cymbals, harps and lyres while the priests blow trumpets", draw: (k) => {
        k.scene("day", "none"); pave(k); temple(k, 42, 31);
        k.fig("Levite", "stand", 8, 19); cymbals(k, 17, 23);
        k.fig("Levite 2", "stand", 26, 19); k.sprite(_SC_LYRE, _SC_PAL, 33, 23); k.notes(36, 20, "#f7d154");
        k.fig("priest", "trumpet", 92, 19, true); k.fig("priest 2", "trumpet", 108, 19, true);
      } },
      { verse: 29, alt: "Hezekiah and all the people bow down and worship", draw: (k) => {
        k.scene("noon", "none"); pave(k); temple(k, 74, 31, 48, 18);
        k.altar(58, 31);
        for (let i = 0; i < 4; i++) k.fig(i ? "man of Judah " + i : "Hezekiah", "bow", 8 + i * 12, 25 + (i === Math.floor(k.t) % 4 ? -1 : 0));
      } },
    ],
    30: [
      { verse: 6, alt: "Runners carry Hezekiah's letters from town to town, from Beersheba to Dan", draw: (k) => {
        k.scene("day", "hills"); k.city(16, 30, 24, 8); k.city(112, 30, 24, 8);
        const x = ((k.t * 14) % 100) + 14;
        k.fig("runner", "run", x, 19); k.scroll(x + 7, 22);
      } },
      { verse: 14, alt: "The crowd pulls down the altars in Jerusalem and throws them into the Kidron", draw: (k) => {
        k.scene("day", "valley"); k.rect(52, 32, 24, 2, "#2c5a8c");
        k.stones(30, 31, 6); idol(k, 92, 31, true);
        const p = (k.t * 0.8) % 1; k.disc(70 + p * 6, 20 + p * 11, 1, "#8a8070");
        k.fig("man of Israel", "stand", 12, 19); k.fig("man of Judah", "stand", 76, 17, true); k.fig("man of Judah 2", "stand", 104, 19, true);
      } },
      { verse: 18, alt: "Hezekiah prays for the people who ate the Passover without being made clean", draw: (k) => {
        k.scene("dusk", "none"); pave(k, "#7a6a5a", "#5a4c40"); temple(k, 78, 31, 44, 18);
        k.glow(56, 6, 8 + k.pulse(1.5), "#c8a050");
        k.fig("Hezekiah", "kneel", 52, 22);
        k.fig("man of Ephraim", "stand", 8, 19); k.fig("man of Issachar", "stand", 20, 19); k.fig("woman of Zebulun", "stand", 32, 19);
      } },
      { verse: 21, alt: "For seven days the people keep the feast with great joy and loud music", draw: (k) => {
        k.scene("day", "city", { cityX: 64, cityW: 70 });
        k.rect(40, 28, 48, 3, "#8a5a32"); for (let i = 0; i < 5; i++) k.disc(46 + i * 9, 27, 2, "#e8d0a0");
        k.fig("dancer", "dance", 10, 20); k.fig("dancer 2", "dance", 24, 20);
        k.fig("Levite", "trumpet", 96, 19, true); k.fig("singer", "praise", 110, 20);
      } },
      { verse: 27, alt: "The priests bless the people and their prayer rises up to heaven", draw: (k) => {
        k.scene("night", "none", { noMoon: true }); pave(k, "#3a3448", "#2a2438"); temple(k, 42, 31, 44, 18, { lit: true });
        for (let i = 0; i < 6; i++) { const p = (k.t * 0.4 + i / 6) % 1; k.px(64 + Math.sin(p * 9 + i) * 4, 10 - p * 12, p > 0.7 ? "#a08a40" : "#ffe08a"); }
        k.fig("priest", "praise", 20, 20); k.fig("Levite", "praise", 96, 20);
      } },
    ],
    31: [
      { verse: 1, alt: "Israel goes out to the towns and cuts down the poles and smashes the pillars", draw: (k) => {
        k.scene("day", "hills"); k.city(108, 30, 30, 9);
        felling(k, 52, 31); k.fig("man of Israel", "staff", 38, 19);
        pole(k, 66, 31, true); k.stones(80, 31, 6);
        k.fig("man of Judah", "stand", 14, 19);
      } },
      { verse: 5, alt: "The people bring the first of their grain, new wine, oil and honey in heaps", draw: (k) => {
        k.scene("noon", "field");
        heap(k, 30, 31, 18); heap(k, 52, 31, 16, "#e0c070", "#c0a050");
        jar(k, 74, 31); jar(k, 80, 31, "#9a8a40"); jar(k, 86, 31, "#d8a030");
        const x = 120 - ((k.t * 4) % 16); k.fig("farmer", "stand", x, 19, true); k.rect(x - 1, 16, 6, 3, "#d8b050");
        k.fig("Levite", "stand", 8, 19);
      } },
      { verse: 8, alt: "Hezekiah and his officials see the heaps and bless the Lord", draw: (k) => {
        k.scene("day", "none"); pave(k); temple(k, 80, 31, 44, 18);
        heap(k, 24, 31, 22); heap(k, 50, 31, 18, "#e0c070", "#c0a050");
        k.fig("Hezekiah", "praise", 72, 20); k.fig("official", "praise", 6, 20);
      } },
      { verse: 11, alt: "Storerooms are prepared in the temple and the Levites carry in the gifts", draw: (k) => {
        k.scene("day", "none"); pave(k); temple(k, 46, 31, 44, 18);
        k.rect(92, 17, 30, 14, "#b8a880"); for (const x of [96, 106, 116]) k.rect(x, 23, 4, 8, "#2a1a12");
        const x = 60 + ((k.t * 6) % 30); k.fig("Levite", "stand", x, 19); jar(k, x + 7, 28);
        k.fig("Konaniah", "staff", 16, 19); k.scroll(26, 22);
      } },
    ],
    32: [
      { verse: 1, alt: "Sennacherib of Assyria camps against the walled cities of Judah", draw: (k) => {
        k.scene("dusk", "hills"); camp(k, 4, 76, 31);
        k.city(104, 30, 36, 11, true);
        k.fig("Assyrian soldier", "spear", 78, 19); k.fig("Sennacherib", "stand", 64, 19);
      } },
      { verse: 18, alt: "Sennacherib's officers shout up at the people standing on Jerusalem's wall", draw: (k) => {
        k.scene("day", "none"); k.rect(0, 31, 128, 9, "#6f9a4a"); wall(k, 64, 128, 31, 14);
        for (let i = 0; i < 4; i++) k.sprite(_SCK.front.slice(0, 6), { c: "#5a4030", s: "#e0a96d", e: "#2a1a10", b: "#5c3a1e", t: "#6a5a7a" }, 72 + i * 13, 11);
        k.fig("Assyrian officer", "stand", 34, 19); k.fig("Assyrian soldier", "spear", 18, 19);
        if (k.f % 8 < 5) for (let i = 0; i < 3; i++) k.line(43 + i * 2, 20 - i * 2, 45 + i * 3, 18 - i * 3, "#f4f0d8");
      } },
      { verse: 20, alt: "King Hezekiah and the prophet Isaiah cry out to God in prayer", draw: (k) => {
        k.scene("dusk", "none"); pave(k, "#7a6a5a", "#5a4c40"); temple(k, 74, 31, 46, 18);
        k.glow(46, 4, 9 + k.pulse(1.4), "#c8a050");
        k.fig("Hezekiah", "kneel", 36, 22); k.fig("Isaiah", "kneel", 50, 22);
      } },
      { verse: 21, alt: "The Lord's angel passes over the Assyrian camp by night and the camp falls silent", draw: (k) => {
        k.scene("night", "hills", { moonX: 18 }); camp(k, 8, 120, 31, "#4a4a52", "#1a2238");
        k.smoke(36, 24); k.smoke(96, 24);
        k.angel(60, 3 + k.pulse(1.5));
      } },
      { verse: 30, alt: "Hezekiah's tunnel carries the water of the Gihon spring down inside the city", draw: (k) => {
        k.scene("day", "none"); k.rect(0, 14, 128, 26, "#6a5040");
        for (let i = 0; i < 20; i++) k.px((i * 37) % 128, 15 + (i * 13) % 24, "#5a4234");
        k.rect(0, 14, 128, 2, "#6f9a4a"); k.city(100, 14, 40, 6);
        k.rect(4, 20, 14, 10, "#2c5a8c");
        k.ridge((x) => 22 + Math.sin(x / 9) * 2, "#2a1e18", 32, 18, 124);
        k.rect(18, 30, 106, 2, "#2c5a8c");
        for (let x = 18; x < 124; x += 7) k.px(18 + ((x + k.t * 10) % 106), 30, "#9cc0f0");
        k.fig("digger", "kneel", 70, 21); if (k.f % 4 < 2) k.px(78, 23, "#ffd27a");
        k.lamp(60, 21);
      } },
    ],
    33: [
      { verse: 5, alt: "Manasseh builds altars to the stars in the temple courts and sets up an idol", draw: (k) => {
        k.scene("night", "none", { noMoon: true }); pave(k, "#3a3448", "#2a2438"); temple(k, 42, 31, 44, 18, { shut: true });
        k.altar(14, 31); k.altar(102, 31); idol(k, 64, 22, false, "#8a7a5a");
        k.fig("Manasseh", "stand", 30, 19);
      } },
      { verse: 11, alt: "Assyrian commanders lead Manasseh away to Babylon in bronze chains", draw: (k) => {
        k.scene("day", "desert");
        const p = (k.t * 5) % 30;
        k.fig("Assyrian soldier", "spear", 70 + p, 19); k.fig("Manasseh", "stand", 50 + p, 19); k.fig("Assyrian soldier 2", "spear", 30 + p, 19);
        chain(k, 58 + p, 70 + p, 26); chain(k, 38 + p, 50 + p, 26);
      } },
      { verse: 12, alt: "In his distress Manasseh humbles himself and prays to the Lord", draw: (k) => {
        k.room("house"); k.rect(0, 0, 128, 30, "#2a2830");
        k.rect(84, 6, 12, 10, "#5a6a8a"); for (let x = 86; x < 96; x += 3) k.rect(x, 6, 1, 10, "#1a1820");
        k.glow(90, 11, 10 + k.pulse(1.2), "#5a5a40");
        k.fig("Manasseh", "kneel", 56, 22); chain(k, 50, 58, 30);
      } },
      { verse: 15, alt: "Manasseh throws the foreign gods and altars out of Jerusalem", draw: (k) => {
        k.scene("day", "hills"); wall(k, 0, 54, 31, 13);
        idol(k, 92, 31, true); idol(k, 108, 31, true); k.stones(80, 31, 6);
        const x = 60 + ((k.t * 5) % 22); k.fig("servant", "stand", x, 19); k.sprite(_IDOL, { g: "#9a9080", d: "#6a6050" }, x + 7, 21);
        k.fig("Manasseh", "stand", 36, 19);
      } },
      { verse: 16, alt: "Manasseh restores the Lord's altar and offers thanks", draw: (k) => {
        k.scene("day", "none"); pave(k); temple(k, 70, 31, 46, 18);
        k.altar(54, 31); k.animal("ox", 34, 26);
        k.fig("Manasseh", "praise", 16, 20); k.fig("priest", "front", 68, 19);
      } },
    ],
    34: [
      { verse: 4, alt: "Young Josiah has the altars of the Baals pulled down and the idols ground to dust", draw: (k) => {
        k.scene("day", "hills");
        pole(k, 58, 31, true); idol(k, 80, 31, true); k.stones(92, 31, 9);
        for (let i = 0; i < 8; i++) { const p = (k.t * 0.5 + i / 8) % 1; k.px(84 + i * 2 + p * 10, 28 - p * 14, p > 0.6 ? "#b8b0a0" : "#8a8070"); }
        k.fig("Josiah", "stand", 22, 19); k.fig("man of Judah", "staff", 40, 19);
      } },
      { verse: 14, alt: "Hilkiah the priest finds the Book of the Law in the temple", draw: (k) => {
        k.room("house"); k.lamp(108, 8);
        chest(k, 20, 31); sacks(k, 36, 31, 2, "#c8c8d0");
        k.glow(70, 18, 9 + k.pulse(1.8), "#a08a40");
        k.fig("Hilkiah", "front", 64, 19); k.scroll(66, 15);
        k.fig("Shaphan", "stand", 88, 19, true);
      } },
      { verse: 19, alt: "Josiah tears his robes as Shaphan reads him the words of the Law", draw: (k) => {
        k.room("palace"); k.lamp(64, 6);
        k.throne(22, 31);
        k.fig("Josiah", "weep", 40, 19);
        if (k.f % 6 < 3) { k.line(42, 26, 44, 29, "#1a1018"); k.line(45, 25, 46, 28, "#1a1018"); }
        k.fig("Shaphan", "stand", 76, 19, true); k.scroll(66, 23);
      } },
      { verse: 22, alt: "Hilkiah and the king's men go to Huldah the prophetess in the new quarter", draw: (k) => {
        k.scene("day", "none"); pave(k, "#a89878", "#8a7a5a");
        house(k, 80, 31, 26, 14, "#a89070"); k.city(16, 26, 30, 6);
        k.fig("Huldah", "front", 89, 19);
        k.fig("Hilkiah", "stand", 52, 19); k.fig("Shaphan", "stand", 40, 19); k.fig("Ahikam", "stand", 28, 19);
      } },
      { verse: 30, alt: "Josiah reads the Book of the Covenant to all the people at the temple", draw: (k) => {
        k.scene("noon", "none"); pave(k); temple(k, 54, 31, 46, 18);
        k.fig("Josiah", "front", 64, 19); k.scroll(64 + k.pulse(1.2), 24);
        for (let i = 0; i < 4; i++) k.fig("man of Judah " + i, i % 2 ? "stand" : "kneel", 4 + i * 11, i % 2 ? 19 : 22);
        k.fig("priest", "stand", 106, 19, true);
      } },
    ],
    35: [
      { verse: 3, alt: "The Levites carry the holy ark into the temple Solomon built", draw: (k) => {
        k.scene("day", "none"); pave(k); temple(k, 74, 31, 46, 18);
        const p = (k.t * 4) % 24;
        k.ark(36 + p, 19); k.fig("Levite", "stand", 22 + p, 19); k.fig("Levite 2", "stand", 48 + p, 19);
        k.fig("Josiah", "stand", 6, 19);
      } },
      { verse: 7, alt: "Josiah gives thousands of lambs, goats and bulls from his own flocks for the Passover", draw: (k) => {
        k.scene("day", "field", { crop: "#6a9a3a", cropTop: "#8aba4a" });
        for (let i = 0; i < 7; i++) k.animal("sheep", 40 + i * 11, 26 + (i % 2) * 2, false, i % 3 === 0);
        k.animal("ox", 22, 25); k.animal("ox", 118, 25, true);
        k.fig("Josiah", "stand", 6, 19); k.fig("shepherd", "staff", 108, 19, true);
      } },
      { verse: 13, alt: "The Levites roast the Passover lambs over the fire and serve all the people", draw: (k) => {
        k.scene("dusk", "none"); pave(k, "#7a6a5a", "#5a4c40");
        k.fire(40, 31, 8); k.line(32, 22, 48, 22, "#6a4a2a"); k.rect(37, 22, 6, 3, "#8a4a2a");
        pot(k, 60, 31); pot(k, 74, 31);
        k.fig("Levite", "stand", 20, 19); k.fig("Levite 2", "stand", 88, 19, true);
        k.fig("man of Judah", "sit", 104, 21, true); k.fig("woman of Judah", "sit", 116, 21, true);
      } },
      { verse: 20, alt: "Josiah rides out against Pharaoh Necho of Egypt on the plain of Megiddo", draw: (k) => {
        k.scene("day", "valley");
        chariot(k, "Josiah", 26, 24); k.flag(4, 31, "#db2777");
        chariot(k, "Necho", 90, 24, true); k.flag(122, 31, "#2a7a8a");
        k.fig("Egyptian messenger", "stand", 60 + k.pulse(1.5, 2), 19);
      } },
      { verse: 25, alt: "Jeremiah writes laments and all Judah mourns for Josiah", draw: (k) => {
        k.scene("dusk", "city", { cityX: 100, cityW: 44 });
        k.fig("Jeremiah", "sit", 18, 21); k.scroll(28, 25);
        k.fig("singer", "weep", 46, 19); k.fig("singer 2", "weep", 58, 19); k.fig("mourner", "weep", 70, 19);
      } },
    ],
    36: [
      { verse: 15, alt: "God sends his messengers again and again, but the people mock them", draw: (k) => {
        k.scene("day", "city", { cityX: 100, cityW: 44 });
        k.fig("Jeremiah", "staff", 30, 19);
        k.fig("man of Judah", "stand", 52, 19); k.fig("priest", "stand", 64, 19); k.fig("man of Judah 2", "stand", 76 + k.pulse(3), 19);
        k.birds(2, 8);
      } },
      { verse: 19, alt: "The Babylonians burn God's temple and break down the walls of Jerusalem", draw: (k) => {
        k.scene("night", "none", { noMoon: true }); k.rect(0, 31, 128, 9, "#1a1418");
        k.glow(64, 16, 22 + k.pulse(1.5), "#5a2a1a");
        temple(k, 40, 31, 46, 18, { ruin: true, skyC: "#3a1e1e" });
        k.fire(52, 13, 8); k.fire(76, 13, 8); k.fire(64, 6, 6);
        k.smoke(56, 6); k.smoke(72, 6);
        wall(k, 0, 30, 31, 10, 12, 22); wall(k, 96, 128, 31, 10, 104, 114);
      } },
      { verse: 20, alt: "The survivors are carried off to Babylon while Jerusalem smokes behind them", draw: (k) => {
        k.scene("dusk", "desert", { sunX: 112 });
        k.city(16, 28, 28, 8); k.smoke(12, 16); k.smoke(22, 18);
        const p = (k.t * 3) % 16;
        for (let i = 0; i < 4; i++) k.fig("exile " + i, i === 3 ? "child" : "weep", 40 + i * 12 + p, i === 3 ? 24 : 19);
        k.fig("Babylonian soldier", "spear", 92 + p, 19);
      } },
      { verse: 21, alt: "The empty land rests through seventy years of sabbaths", draw: (k) => {
        k.scene("day", "field", { crop: "#7a9a4a", cropTop: "#9aba5a" });
        k.stones(20, 31, 6); k.rect(94, 22, 3, 9, "#8a7a64"); k.rect(100, 26, 3, 5, "#8a7a64");
        k.animal("sheep", 60, 28, true);
        k.birds(3, 6);
      } },
      { verse: 22, alt: "Cyrus king of Persia proclaims that God's house in Jerusalem will be rebuilt", draw: (k) => {
        k.scene("dawn", "city", { cityX: 32, cityW: 50 });
        k.fig("Persian herald", "trumpet", 50, 19); k.scroll(62, 21);
        k.fig("exile", "praise", 84, 20); k.fig("exile 2", "praise", 98, 20); k.fig("exile child", "child", 112, 24);
      } },
    ],
  };

  for (const [ch, scenes] of Object.entries(NR)) { if (typeof _NR_SCENES !== "undefined") _NR_SCENES["2CH-" + ch] = scenes; }
})();
