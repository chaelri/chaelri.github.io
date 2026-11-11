// 15-scenes-2ki.js — the 8-bit banners for 2 Kings.
//
// Built on the scene kit in 12-scenes.js + 13-scenes-2sa.js (k.scene, k.room,
// k.fig, k.animal, ...). Scenes are keyed by the verse they open on, in
// ascending order. Hard moments (fire on the soldiers, the bears, Jehu's
// purge, Jezebel, the sieges, the fall of Jerusalem) are shown by their
// setting or aftermath, never the act. The whole file is one IIFE so its
// helpers never leak into the shared script scope.
(function () {
  // ── Local props and sprites (read the kit, never change it) ─────────────
  const CAMEL = {
    rows: ["..........hh", "...hh.....h.", "..hhhh....h.", ".hhhhhhh.hh.", "hhhhhhhhhh..", ".hhhhhhh....", ".h.h..h.h...", ".h.h..h.h..."],
    pal: { h: "#c8a070" },
  };
  const BEAR = {
    rows: [".bb.........", "bbbb.bbbbb..", "ebbbbbbbbbb.", ".bbbbbbbbbbb", "..b.b...b.b."],
    pal: { b: "#5a3a22", e: "#1a1008" },
  };
  const FIRE_HORSE = (k) => ({ h: k.f % 2 ? "#ff7a2f" : "#ffb03a", m: "#ffe08a", k: "#ff5020" });

  // A horse-drawn chariot standing on `base`. o: { flip, fire, driver, walk }.
  function chariot(k, x, base, o = {}) {
    const f = !!o.flip, fire = !!o.fire;
    const hx = f ? x : x + 9, cx = f ? x + 10 : x;
    if (fire) k.glow(x + 9, base - 5, 11 + k.pulse(3), "#a0401a");
    const bob = o.walk && Math.floor(k.t * 4) % 2 ? -1 : 0;
    k.sprite(_SC_ANIMAL.horse.rows, fire ? FIRE_HORSE(k) : _SC_ANIMAL.horse.pal, hx, base - 7 + bob, f);
    if (o.driver) k.fig(o.driver, "stand", cx + 1, base - 15, f);
    k.rect(cx, base - 6, 9, 4, fire ? "#ffb03a" : "#8a5a32");
    k.rect(cx, base - 6, 9, 1, fire ? "#ffe08a" : "#a8865c");
    k.line(f ? cx : cx + 8, base - 4, f ? cx - 1 : cx + 9, base - 4, "#5c3a1e");
    k.disc(cx + 4, base - 1, 2, fire ? "#ff7a2f" : "#5a3a22");
    k.px(cx + 4, base - 1, fire ? "#ffe08a" : "#a8865c");
    if (fire) { k.fire(cx + 4, base - 6, 9); k.fire(hx + 5, base - 7, 8); }
  }
  // A whirlwind funnel, wide at the top.
  function whirl(k, cx, y0, y1) {
    for (let y = y0; y < y1; y++) {
      const w = 2 + (y1 - y) * 0.35, s = Math.sin(k.t * 7 + y * 0.8) * w;
      k.px(cx + s, y, "#dfe6f2"); k.px(cx - s, y, "#9aa4b8");
    }
  }
  // A dry path through river water (river terrain: water y 32-36).
  function partRiver(k, x, w) {
    k.rect(x, 32, w, 5, "#a08a5a");
    k.rect(x - 1, 30 - (k.f % 2), 1, 7, "#9cc0f0"); k.rect(x + w, 30 - ((k.f + 1) % 2), 1, 7, "#9cc0f0");
  }
  // A city gate: wall, two towers, dark opening. Spans x-4 .. x+34.
  function gate(k, x, base, h = 18) {
    const s = "#7a6a58", d = "#5a4c40";
    k.rect(x, base - h, 30, h, s);
    for (let i = 0; i < 30; i += 4) k.rect(x + i, base - h - 2, 2, 2, s);
    k.rect(x - 4, base - h - 4, 8, h + 4, d); k.rect(x + 26, base - h - 4, 8, h + 4, d);
    for (const tx of [x - 4, x + 26]) for (let i = 0; i < 8; i += 3) k.rect(tx + i, base - h - 6, 2, 2, d);
    k.rect(x + 10, base - 12, 10, 12, "#2a2018"); k.rect(x + 11, base - 13, 8, 1, "#2a2018");
  }
  // A flat-roofed stone house.
  function house(k, x, base, w = 26, h = 12, c = "#b8a080") {
    k.rect(x, base - h, w, h, c); k.rect(x - 1, base - h - 1, w + 2, 2, "#8a7458");
    k.rect(x + 3, base - 7, 4, 7, "#3a2a1a");
    k.rect(x + w - 9, base - h + 3, 4, 3, "#2a2018");
  }
  // A bed; a "lie" figure rests on it at y = base - 9.
  function bed(k, x, base, w = 20) {
    k.rect(x, base - 5, w, 2, "#8a5a32");
    k.rect(x, base - 3, 1, 3, "#5c3a1e"); k.rect(x + w - 1, base - 3, 1, 3, "#5c3a1e");
    k.rect(x + 1, base - 6, w - 2, 1, "#e8dcc0");
  }
  // Solomon's temple: cedar-gold front with the two bronze pillars.
  function temple(k, x, base, w = 44, h = 20) {
    k.rect(x, base - h, w, h, "#d8c8a0");
    k.rect(x - 2, base - h - 3, w + 4, 3, "#c9a046");
    for (let i = 4; i < w - 2; i += 8) k.rect(x + i, base - h + 2, 1, h - 4, "#c8b488");
    for (const px of [x + w / 2 - 11, x + w / 2 + 8]) { k.rect(px, base - h + 5, 3, h - 5, "#b87a3a"); k.rect(px - 1, base - h + 3, 5, 2, "#d89a4a"); }
    k.rect(x + w / 2 - 3, base - 10, 6, 10, "#3a2418"); k.rect(x + w / 2 - 3, base - 10, 6, 1, "#f2c230");
  }
  // A standing stone or carved pole for a false god.
  function idol(k, x, base, c = "#6a6050") {
    k.rect(x, base - 12, 4, 12, c); k.rect(x - 1, base - 14, 6, 2, "#8a8070");
    k.px(x + 1, base - 10, "#2a2030"); k.px(x + 2, base - 10, "#2a2030"); k.rect(x + 1, base - 7, 2, 1, "#2a2030");
  }
  // A clay jar; full ones show oil at the mouth.
  function jar(k, x, base, full) {
    k.rect(x, base - 5, 4, 5, "#a86a3a"); k.rect(x + 1, base - 6, 2, 1, "#8a5030");
    if (full) k.px(x + 1, base - 6, "#f2c230");
  }
  // Broken walls and rubble with smoke: aftermath of a fallen city.
  function ruins(k, x, base, w = 50) {
    for (let i = 0; i < w; i += 7) k.rect(x + i, base - 4 - ((i * 7) % 9), 5, 4 + ((i * 7) % 9), i % 2 ? "#5a4c40" : "#6a5a4a");
    k.stones(x + 4, base, 6); k.stones(x + w - 12, base, 5);
  }
  // A heap of coins / treasure.
  function treasure(k, x, base) {
    for (let i = 0; i < 6; i++) k.disc(x + i * 2, base - 1 - (i % 3), 1, i % 2 ? "#f2c230" : "#d8dce4");
    if (k.f % 10 < 2) k.px(x + 5, base - 4, "#ffffff");
  }

  // A watchtower; a figure on top stands at y = base - h - 12.
  function tower(k, x, base, h = 20) {
    k.rect(x, base - h, 12, h, "#6a5a4a");
    for (let i = 0; i < 12; i += 3) k.rect(x + i, base - h - 2, 2, 2, "#6a5a4a");
    k.rect(x + 4, base - 8, 4, 8, "#2a2018"); k.rect(x + 5, base - h + 4, 2, 3, "#2a2018");
  }
  // Baal's house: a dark shrine with horned standing stones.
  function baalHouse(k, x, base) {
    k.rect(x, base - 18, 48, 18, "#6a3a2a"); k.rect(x - 2, base - 20, 52, 2, "#4a2418");
    for (const hx of [x + 4, x + 40]) { k.rect(hx, base - 26, 4, 8, "#8a5a32"); k.px(hx - 1, base - 27, "#c9a046"); k.px(hx + 4, base - 27, "#c9a046"); }
    k.rect(x + 19, base - 11, 10, 11, "#1a0e0a");
    k.glow(x + 24, base - 6, 4 + (k.f % 4 < 2 ? 0 : 1), "#7a3a1a");
  }
  // A temple money chest with a slot in the lid.
  function chest(k, x, base) {
    k.rect(x, base - 6, 10, 6, "#8a5a32"); k.rect(x, base - 7, 10, 1, "#a8865c");
    k.rect(x + 4, base - 7, 2, 1, "#1a1008"); k.rect(x + 1, base - 4, 8, 1, "#c9a046");
  }
  // A cedar of Lebanon: stacked dark green tiers.
  function cedar(k, x, base, h = 24) {
    k.rect(x - 1, base - 6, 3, 6, "#5c3a1e");
    for (let i = 0; i < 4; i++) { const y = base - 6 - i * (h / 5), w = 18 - i * 4; k.rect(x - w / 2, y - 3, w, 3, i % 2 ? "#2a5a2a" : "#1f4a24"); }
    k.px(x, base - h, "#2a5a2a");
  }
  // A thistle: a spiky little weed.
  function thistle(k, x, base) {
    k.line(x, base, x, base - 6, "#6a8a3a"); k.line(x, base - 3, x - 2, base - 5, "#6a8a3a"); k.line(x, base - 2, x + 2, base - 4, "#6a8a3a");
    k.disc(x, base - 7, 1, "#a04a8a"); k.px(x - 2, base - 6, "#a04a8a"); k.px(x + 2, base - 5, "#a04a8a");
  }
  // Captives walking in a line, roped together. left = walk to the left.
  function exiles(k, x0, n, left = false) {
    for (let i = 0; i < n; i++) {
      const x = x0 + (left ? i : -i) * 12;
      k.fig("exile " + i, "stand", x, 19, left);
      if (i) k.line(x + 3, 25, x + (left ? -9 : 15), 25, "#8a6a3a");
    }
  }

  const NR = {
    1: [
      { verse: 2, alt: "King Ahaziah lies hurt in his palace in Samaria and sends messengers to ask Baal-Zebub", draw: (k) => {
        k.room("palace"); k.lamp(18, 9);
        k.rect(92, 5, 13, 12, "#1a1218");
        for (let i = 0; i < 13; i += 3) k.line(92 + i, 5, 92 + i, 16, "#8a6a48");
        k.line(92, 10, 104, 10, "#8a6a48"); k.rect(97, 11, 4, 6, "#1a1218");
        bed(k, 64, 31, 24); k.fig("Ahaziah", "lie", 68, 22);
        k.fig("messenger", "stand", 42, 19, true);
        k.fig("messenger 2", "run", 30 - ((k.t * 8) % 30), 19, true);
      } },
      { verse: 3, alt: "Elijah, in rough clothes and a leather belt, stops the king's messengers on the road", draw: (k) => {
        k.scene("day", "hills", { sunX: 20 });
        k.glow(74, 4, 6 + k.pulse(2), "#fff4c2");
        k.fig("Elijah", "staff", 72, 19, true);
        k.fig("messenger", "stand", 34, 19); k.fig("messenger 2", "stand", 22, 19);
        k.animal("donkey", 4, 24);
      } },
      { verse: 9, alt: "Elijah sits on a hilltop as fire falls from heaven, leaving only scattered shields below", draw: (k) => {
        k.scene("dusk", "hills", { sunX: 24 });
        k.ridge((x) => 17 + Math.abs(x - 100) * 0.28, "#3a2244", 40, 70, 128);
        k.fig("Elijah", "sit", 95, 7);
        const on = k.f % 16 < 9;
        if (on) { k.glow(40, 28, 10, "#a0401a"); k.bolt(40, 0, 28, "#ffd27a", _scRng(Math.floor(k.f / 16))); }
        k.fire(40, 31, 12);
        for (const [sx, sy] of [[24, 31], [32, 32], [52, 31], [58, 32]]) { k.disc(sx, sy, 2, "#7a6a50"); k.px(sx, sy, "#c9a046"); }
      } },
      { verse: 13, alt: "The third captain kneels before Elijah and begs for his life and his men's", draw: (k) => {
        k.scene("day", "hills", { sunX: 20 });
        k.ridge((x) => 17 + Math.abs(x - 100) * 0.28, "#5a7a40", 40, 70, 128);
        k.fig("Elijah", "staff", 96, 5, true);
        k.fig("captain", "kneel", 60, 23 + (Math.floor(k.t * 1.5) % 2));
        for (let i = 0; i < 4; i++) k.fig("soldier " + i, "bow", 8 + i * 11, 26);
      } },
      { verse: 15, alt: "Elijah stands by Ahaziah's bed and tells him he will not get up again", draw: (k) => {
        k.room("palace"); k.lamp(110, 9);
        bed(k, 18, 31, 24); k.fig("Ahaziah", "lie", 22, 22);
        k.fig("Elijah", "staff", 56, 19, true); k.fig("captain", "stand", 80, 19, true);
      } },
    ],
    2: [
      { verse: 1, alt: "Elijah and Elisha set out together from Gilgal", draw: (k) => {
        k.scene("dawn", "hills");
        k.stones(10, 31, 9);
        const p = ((k.t * 5) % 150) - 20;
        k.fig("Elisha", "stand", p, 19); k.fig("Elijah", "staff", p + 12, 19);
      } },
      { verse: 8, alt: "Elijah strikes the Jordan with his rolled-up coat and the water parts while fifty prophets watch", draw: (k) => {
        k.scene("day", "river");
        partRiver(k, 62, 14);
        k.fig("Elijah", "stand", 56, 19); k.line(63, 25, 66 + (k.f % 4 < 2 ? 0 : 2), 31, "#7a5a32");
        k.fig("Elisha", "stand", 44, 19);
        for (let i = 0; i < 3; i++) k.fig("prophet " + i, "stand", 96 + i * 9, 12, true);
      } },
      { verse: 11, alt: "A chariot of fire with horses of fire comes between them and Elijah goes up in a whirlwind", draw: (k) => {
        k.scene("dusk", "hills");
        whirl(k, 62, 0, 31);
        k.fig("Elijah", "front", 58, 6 + k.pulse(2, 2));
        chariot(k, 82, 20 + k.pulse(2.5, 1), { fire: true });
        k.fig("Elisha", "praise", 18, 20);
      } },
      { verse: 13, alt: "Elisha takes up Elijah's fallen coat and the Jordan parts for him too", draw: (k) => {
        k.scene("dusk", "river");
        partRiver(k, 54, 12);
        k.fig("Elisha", "stand", 44, 19); k.line(51, 25, 54 + (k.f % 4 < 2 ? 0 : 2), 31, "#7a5a32");
        for (let i = 0; i < 3; i++) k.fig("prophet " + i, "bow", 92 + i * 10, 24, true);
      } },
      { verse: 19, alt: "Elisha throws salt into Jericho's spring and the water becomes good", draw: (k) => {
        k.scene("noon", "hills");
        k.city(104, 26, 36, 10);
        for (const x of [70, 80, 122]) k.tree(x, 31, "palm");
        k.rect(42, 30, 22, 3, "#2c5a8c"); k.px(44 + (k.f % 18), 31, "#9cc0f0");
        k.fig("Elisha", "stand", 28, 19); k.rect(35, 25, 4, 2, "#c8b8a0");
        for (let i = 0; i < 4; i++) { const p = (k.t * 1.5 + i / 4) % 1; k.px(38 + p * 14, 24 - Math.sin(p * Math.PI) * 6 + p * 6, "#ffffff"); }
        k.fig("leader of Jericho", "front", 4, 19);
      } },
      { verse: 23, alt: "On the road up to Bethel, two bears come out of the woods", draw: (k) => {
        k.scene("day", "forest");
        k.rect(0, 32, 128, 2, "#a08a5a");
        k.fig("Elisha", "staff", 20, 19);
        const d = (k.t * 3) % 8;
        k.sprite(BEAR.rows, BEAR.pal, 100 - d, 27); k.sprite(BEAR.rows, BEAR.pal, 112 - d, 28);
      } },
    ],
    3: [
      { verse: 4, alt: "Mesha king of Moab, a sheep farmer, with the flocks he had to send to Israel", draw: (k) => {
        k.scene("day", "hills", { sunX: 24 });
        k.fig("Mesha", "staff", 12, 19);
        for (let i = 0; i < 10; i++) k.animal("sheep", 30 + (i % 5) * 18 + (i > 4 ? 8 : 0), 24 + (i > 4 ? 4 : 0), false, true);
      } },
      { verse: 9, alt: "Three kings and their armies wander seven days in the desert of Edom with no water", draw: (k) => {
        k.scene("famine", "desert");
        k.fig("Jehoram", "stand", 20, 19); k.fig("Jehoshaphat", "stand", 34, 19); k.fig("king of Edom", "stand", 48, 19);
        k.animal("horse", 70, 25); k.animal("ox", 90, 27);
        k.line(116, 31, 116, 22, "#6a4a30"); k.line(116, 25, 120, 22, "#6a4a30"); k.line(116, 27, 112, 24, "#6a4a30");
        for (let x = 0; x < 128; x += 9) k.px(x + (k.f % 3), 17 + (x % 3), "#f8dca0");
      } },
      { verse: 15, alt: "A harpist plays and the power of the Lord comes on Elisha", draw: (k) => {
        k.scene("dusk", "desert");
        k.tent(100, 31); k.tent(4, 31, 16, 9, "#b89a74");
        k.fig("harpist", "sit", 30, 21); k.sprite(_SC_LYRE, _SC_PAL, 39, 25); k.notes(42, 22, "#f7d154");
        k.fig("Elisha", "praise", 58, 20); k.glow(62, 18, 8 + k.pulse(2), "#a08a40");
        k.fig("Jehoshaphat", "stand", 80, 19, true);
      } },
      { verse: 20, alt: "At the time of the morning offering, water flows in from Edom and fills the ditches", draw: (k) => {
        k.scene("dawn", "valley");
        const fill = (k.t * 22) % 160;
        for (let i = 0; i < 5; i++) { const x = 6 + i * 25; k.rect(x, 33, 16, 2, "#3a2a20"); if (fill > x) k.rect(x, 33, Math.min(16, fill - x), 2, "#4a8ac8"); }
        k.fig("soldier", "spear", 40, 19); k.fig("soldier 2", "stand", 70, 19, true);
      } },
      { verse: 22, alt: "From the hills the Moabites see the sun on the water and think it is red like blood", draw: (k) => {
        k.scene("dawn", "hills", { sunX: 70 });
        for (let i = 0; i < 5; i++) { const x = 30 + i * 20; k.rect(x, 33, 14, 2, i % 2 ? "#c4504a" : "#a8435f"); k.px(x + (k.f % 14), 33, "#f2b07a"); }
        k.ridge((x) => (x < 26 ? 14 + x * 0.3 : 40), "#2a2236", 40, 0, 26);
        k.fig("Moabite", "spear", 6, 3); k.fig("Moabite 2", "stand", 15, 6);
      } },
      { verse: 27, alt: "Smoke rises over the wall of Kir Hareseth and Israel's army turns back home", draw: (k) => {
        k.scene("dusk", "hills");
        k.city(30, 28, 44, 12); k.smoke(30, 12);
        for (let i = 0; i < 3; i++) k.fig("soldier " + i, "stand", 70 + i * 13 + ((k.t * 3) % 6), 19);
      } },
    ],
    4: [
      { verse: 3, alt: "The widow and her sons fill borrowed jar after jar with oil", draw: (k) => {
        k.room("house"); k.lamp(110, 8);
        const n = Math.floor(k.t * 1.5) % 9;
        for (let i = 0; i < 8; i++) jar(k, 52 + i * 8, 31, i < n);
        k.fig("widow", "stand", 40, 19);
        if (n < 8) k.line(47, 25, 53 + n * 8, 24, "#f2c230");
        k.fig("son", "child", 14, 24); k.fig("son 2", "child", 24, 24);
      } },
      { verse: 10, alt: "The Shunammite woman and her husband build a small room on their roof for Elisha", draw: (k) => {
        k.scene("day", "hills", { sunX: 112 });
        house(k, 30, 31, 46, 12);
        k.rect(54, 10, 18, 9, "#c8b090"); k.rect(53, 9, 20, 1, "#8a7458");
        k.rect(58, 13, 4, 3, "#1a1218"); k.px(59 + (k.f % 2), 14, "#ffd27a");
        for (let i = 0; i < 6; i++) k.rect(76 + i * 2, 30 - i * 2, 2, 1, "#8a7458");
        k.fig("Elisha", "staff", 90, 19, true); k.fig("Gehazi", "stand", 102, 19, true);
        k.fig("Shunammite woman", "stand", 14, 19);
      } },
      { verse: 35, alt: "The Shunammite's son sneezes seven times and opens his eyes", draw: (k) => {
        k.room("house"); k.lamp(14, 8);
        bed(k, 30, 31, 22); k.fig("son", "child", 38, 19);
        if (k.f % 12 < 3) for (let i = 0; i < 3; i++) k.px(46 + i * 2, 20 - i, "#ffffff");
        k.fig("Elisha", "praise", 62, 20);
        k.fig("Shunammite woman", "bow", 84, 26, true);
      } },
      { verse: 38, alt: "In the famine at Gilgal, Elisha throws flour into the pot and the stew is safe to eat", draw: (k) => {
        k.scene("famine", "hills");
        k.fire(58, 33, 10);
        k.rect(50, 24, 16, 8, "#3a3a40"); k.rect(49, 23, 18, 2, "#5a5a62"); k.rect(51, 24, 14, 1, "#7a5a32");
        k.smoke(58, 20);
        k.fig("Elisha", "stand", 36, 19);
        for (let i = 0; i < 3; i++) { const p = (k.t + i / 3) % 1; k.px(44 + p * 8, 24 - p * 2, "#f4f0e0"); }
        k.fig("prophet", "sit", 80, 21, true); k.fig("prophet 2", "sit", 94, 21, true); k.fig("prophet 3", "sit", 108, 21, true);
      } },
      { verse: 42, alt: "Twenty barley loaves feed a hundred men, with some left over", draw: (k) => {
        k.scene("day", "field");
        k.fig("man from Baal Shalisha", "stand", 8, 19); k.rect(14, 24, 6, 4, "#a8865c");
        k.rect(24, 31, 80, 2, "#e8dcc0");
        for (let i = 0; i < 9; i++) k.disc(28 + i * 9, 30, 1, "#d8a050");
        for (let i = 0; i < 5; i++) k.fig("prophet " + i, "sit", 26 + i * 16, 21 + (i % 2 ? 0 : 0), i > 2);
        if (k.f % 16 < 8) k.disc(104 + (k.f % 3), 29, 1, "#e0b060");
      } },
    ],
    5: [
      { verse: 2, alt: "A young girl from Israel tells Naaman's wife about the prophet in Samaria", draw: (k) => {
        k.room("house"); k.lamp(64, 6);
        k.fig("Naaman's wife", "sit", 30, 21);
        k.fig("Israelite girl", "child", 48, 24, true);
        k.fig("Naaman", "sword", 92, 19, true);
        if (k.f % 8 < 5) { k.px(50, 21, "#ffffff"); k.px(52, 20, "#ffffff"); }
      } },
      { verse: 9, alt: "Naaman arrives at Elisha's door with his horses and chariots", draw: (k) => {
        k.scene("day", "hills", { sunX: 20 });
        house(k, 92, 31, 30, 13);
        chariot(k, 30, 32, { driver: "Naaman" });
        chariot(k, 4, 32, { driver: "Syrian soldier" });
        k.fig("Gehazi", "stand", 80, 19, true);
      } },
      { verse: 14, alt: "Naaman dips seven times in the Jordan and his skin becomes clean like a child's", draw: (k) => {
        k.scene("day", "river");
        const n = Math.floor(k.t * 1.2) % 8, under = k.f % 10 < 3;
        k.fig("Naaman", "front", 58, under ? 27 : 21);
        k.rect(48, 30, 30, 7, "#2c5a8c"); for (let x = 50; x < 76; x += 5) k.px(x + (k.f % 3), 31, "#9cc0f0");
        for (let i = 0; i < 7; i++) k.px(52 + i * 3, 14, i < n ? "#f7d154" : "#5a6a8a");
        k.fig("servant", "stand", 16, 19); k.animal("horse", 2, 23);
      } },
      { verse: 21, alt: "Gehazi runs after Naaman, who steps down from his chariot to meet him", draw: (k) => {
        k.scene("day", "hills", { sunX: 24 });
        chariot(k, 70, 32, { flip: true });
        k.fig("Naaman", "stand", 60, 19, true);
        k.fig("Gehazi", "run", 20 + ((k.t * 8) % 24), 19);
      } },
      { verse: 27, alt: "Gehazi walks out from Elisha white as snow with Naaman's skin disease", draw: (k) => {
        k.room("house"); k.lamp(20, 8);
        k.fig("Elisha", "sit", 24, 21);
        k.rect(96, 16, 14, 14, "#1a1218");
        k.fig("Gehazi", "stand", 84, 19);
        for (let i = 0; i < 6; i++) k.px(82 + ((i * 5) % 12), 16 + ((k.f + i * 4) % 15), "#f4f6ff");
        treasure(k, 50, 31);
      } },
    ],
    6: [
      { verse: 6, alt: "Elisha throws a stick into the Jordan and the lost iron axe head floats", draw: (k) => {
        k.scene("day", "river");
        k.tree(8, 30); k.tree(22, 29); k.rect(30, 28, 14, 2, "#8a5a32");
        k.fig("prophet", "stand", 48, 19);
        k.fig("Elisha", "staff", 92, 19, true);
        k.line(78, 33, 84, 31, "#7a5a32");
        const by = 32 + k.pulse(3, 1); k.rect(70, by, 4, 2, "#8a8a92"); k.px(71, by - 1, "#d8dce4");
      } },
      { verse: 15, alt: "At dawn Elisha's servant sees an army with horses and chariots around Dothan", draw: (k) => {
        k.scene("dawn", "hills");
        k.ridge((x) => 20 + Math.abs(x - 64) * 0.4, "#3a3048", 40, 34, 94);
        k.city(64, 22, 24, 8);
        k.fig("servant", "weep", 60, 2);
        chariot(k, 4, 33, { driver: "Syrian" }); chariot(k, 104, 33, { flip: true, driver: "Syrian 2" });
        for (let i = 0; i < 3; i++) k.fig("Syrian " + (i + 3), "spear", 28 + i * 34 + (i === 1 ? 4 : 0), 22, i === 2);
      } },
      { verse: 17, alt: "The servant's eyes are opened: the hills are full of horses and chariots of fire around Elisha", draw: (k) => {
        k.scene("night", "mountains");
        chariot(k, 6, 20, { fire: true }); chariot(k, 30, 15, { fire: true });
        chariot(k, 84, 15, { fire: true, flip: true }); chariot(k, 106, 20, { fire: true, flip: true });
        k.fig("Elisha", "praise", 56, 20); k.fig("servant", "stand", 68, 19, true);
      } },
      { verse: 19, alt: "Elisha leads the blinded Syrian soldiers along the road into Samaria", draw: (k) => {
        k.scene("day", "city", { cityX: 104, cityW: 40 });
        const p = (k.t * 3) % 10;
        k.fig("Elisha", "staff", 62 + p, 19);
        for (let i = 0; i < 4; i++) {
          const x = 48 - i * 13 + p; k.fig("Syrian " + i, "stand", x, 19);
          if ((k.f + i * 3) % 8 < 4) k.px(x + 3, 16, "#f7d154");
        }
      } },
      { verse: 24, alt: "Samaria under siege and famine; the king walks on the city wall in sackcloth", draw: (k) => {
        k.scene("famine", "hills");
        k.rect(0, 14, 64, 20, "#7a6a58");
        for (let i = 0; i < 64; i += 4) k.rect(i, 12, 2, 2, "#7a6a58");
        k.fig("king of Israel", "stand", 16 + ((k.t * 3) % 30), 0);
        k.tent(76, 31, 16, 9, "#9a8a74"); k.tent(98, 31, 18, 10, "#8a7a64");
        k.fig("Syrian", "spear", 118, 19, true);
      } },
    ],
    7: [
      { verse: 1, alt: "At Samaria's gate Elisha says food will be cheap by tomorrow; the king's officer scoffs", draw: (k) => {
        k.scene("famine", "hills");
        gate(k, 46, 32);
        k.fig("Elisha", "staff", 26, 19);
        k.fig("officer", "stand", 92, 19, true);
        k.glow(40, 8, 5 + k.pulse(2), "#fff4c2");
        k.rect(34, 6, 6, 4, "#e8dcc0"); k.rect(42, 6, 6, 4, "#d8c070");
      } },
      { verse: 3, alt: "Four men with leprosy sit outside the city gate at dusk", draw: (k) => {
        k.scene("dusk", "hills");
        gate(k, 84, 32);
        for (let i = 0; i < 4; i++) k.fig("leper " + i, "sit", 16 + i * 14, 21, i % 2 === 1);
      } },
      { verse: 7, alt: "The Syrians flee in the night, leaving their tents, horses and donkeys behind", draw: (k) => {
        k.scene("night", "hills", { moonX: 18 });
        k.tent(10, 31); k.tent(34, 31, 16, 9, "#b89a74"); k.tent(96, 31, 20, 10);
        k.animal("horse", 58, 25); k.animal("donkey", 76, 25, true);
        for (let i = 0; i < 3; i++) { const r = 4 + ((k.f + i * 4) % 12); k.px(64 + r, 12 - i, "#8a90b0"); k.px(64 - r, 12 + i, "#8a90b0"); }
        k.disc(54, 32, 2, "#7a6a50"); k.line(88, 32, 94, 30, "#8a6a3a");
      } },
      { verse: 8, alt: "Inside an empty tent the lepers eat, drink and carry off silver and gold", draw: (k) => {
        k.room("tent"); k.lamp(64, 6);
        k.rect(40, 27, 40, 3, "#8a5a32"); k.disc(50, 26, 2, "#e0a96d"); k.disc(68, 26, 2, "#c8504a");
        k.fig("leper 0", "sit", 26, 21); k.fig("leper 1", "sit", 84, 21, true);
        treasure(k, 100, 31);
        k.fig("leper 2", "run", 6 + ((k.t * 6) % 12), 19, true);
      } },
      { verse: 16, alt: "The people pour out of the gate and food sells cheap, just as Elisha said", draw: (k) => {
        k.scene("day", "hills");
        gate(k, 10, 32);
        for (let i = 0; i < 4; i++) k.fig("person " + i, "run", 46 + i * 14 + ((k.t * 8) % 10), 19);
        for (let i = 0; i < 3; i++) k.rect(104 + i * 7, 27, 5, 5, i % 2 ? "#d8c070" : "#e8dcc0");
      } },
    ],
    8: [
      { verse: 5, alt: "Gehazi is telling the king about Elisha just as the Shunammite woman and her son come in", draw: (k) => {
        k.room("palace"); k.lamp(64, 7);
        k.throne(14, 31); k.fig("king of Israel", "sit", 16, 21);
        k.fig("Gehazi", "stand", 38, 19, true);
        k.fig("Shunammite woman", "bow", 76, 26, true); k.fig("son", "stand", 92, 19, true);
      } },
      { verse: 9, alt: "Hazael brings Elisha a gift loaded on forty camels in Damascus", draw: (k) => {
        k.scene("noon", "city", { cityX: 104, cityW: 40 });
        for (let i = 0; i < 3; i++) { const x = 6 + i * 16 + ((k.t * 3) % 6); k.sprite(CAMEL.rows, CAMEL.pal, x, 24 + (Math.floor(k.t * 4 + i) % 2), false); k.rect(x + 2, 22, 5, 2, "#a85a3a"); }
        k.fig("Hazael", "stand", 60, 19); k.fig("Elisha", "staff", 76, 19, true);
      } },
      { verse: 11, alt: "Elisha stares at Hazael until Hazael is ashamed, and then Elisha weeps", draw: (k) => {
        k.room("house"); k.lamp(64, 6);
        k.fig("Elisha", "weep", 40, 19);
        k.fig("Hazael", "stand", 76, 19, true);
      } },
      { verse: 21, alt: "At night Jehoram's chariots break out through the Edomite army at Zair", draw: (k) => {
        k.scene("night", "hills");
        const p = (k.t * 10) % 160 - 30;
        chariot(k, p, 32, { driver: "Jehoram", walk: true });
        for (let i = 0; i < 3; i++) k.fig("Edomite " + i, "spear", 84 + i * 14, 19, true);
        k.tent(4, 31, 14, 8, "#5a4a3a");
      } },
      { verse: 29, alt: "Ahaziah of Judah visits wounded King Joram in Jezreel", draw: (k) => {
        k.room("palace"); k.lamp(16, 8);
        bed(k, 60, 31, 24); k.fig("Joram", "lie", 64, 22);
        k.fig("Ahaziah", "stand", 40, 19);
      } },
    ],
    9: [
      { verse: 6, alt: "In an inner room the young prophet pours oil on Jehu's head and anoints him king", draw: (k) => {
        k.room("house"); k.lamp(20, 8);
        k.rect(100, 14, 14, 16, "#1a1218");
        k.fig("Jehu", "kneel", 48, 22);
        k.fig("young prophet", "stand", 60, 19, true); k.rect(57, 20, 2, 3, "#c8d8e0");
        k.px(56, 23 + (k.f % 3), "#f2c230");
      } },
      { verse: 13, alt: "The officers spread their coats on the bare steps under Jehu and blow the trumpet: Jehu is king", draw: (k) => {
        k.scene("day", "city", { cityX: 64, cityW: 100 });
        for (let i = 0; i < 5; i++) { k.rect(36 + i * 4, 29 - i * 2, 56 - i * 8, 2, "#8a8070"); k.rect(40 + i * 4, 29 - i * 2, 6, 1, ["#c8504a", "#4a6ab0", "#d8a050", "#6a9a4a", "#a04a8a"][i]); }
        k.fig("Jehu", "front", 60, 9);
        k.fig("officer", "trumpet", 14, 19); k.fig("officer 2", "praise", 96, 20); k.fig("officer 3", "praise", 108, 20);
      } },
      { verse: 17, alt: "The watchman on Jezreel's tower sees Jehu driving his chariot like a madman", draw: (k) => {
        k.scene("day", "valley", { sunX: 64 });
        tower(k, 8, 32, 20); k.fig("watchman", "stand", 11, 0);
        const x = 124 - ((k.t * 12) % 70);
        k.cloud(x + 26, 27, 18, "#d8c8a8", "#c8b08a");
        chariot(k, x, 32, { flip: true, driver: "Jehu", walk: true });
      } },
      { verse: 21, alt: "Joram and Ahaziah ride out in their chariots and meet Jehu at Naboth's field", draw: (k) => {
        k.scene("dusk", "hills");
        for (let x = 4; x < 124; x += 6) { k.rect(x, 30, 2, 2, "#3f7a2e"); k.px(x + 1, 29, "#5a9a40"); }
        chariot(k, 24, 34, { driver: "Joram" }); chariot(k, 2, 34, { driver: "Ahaziah" });
        chariot(k, 92, 34, { flip: true, driver: "Jehu", walk: true });
      } },
      { verse: 30, alt: "Jezebel, her eyes painted, looks down from a palace window as Jehu rides in through the gate", draw: (k) => {
        k.scene("dusk", "city", { cityX: 30, cityW: 50 });
        k.rect(80, 2, 34, 30, "#7a6a58"); for (let i = 80; i < 114; i += 4) k.rect(i, 0, 2, 2, "#7a6a58");
        k.window(92, 8, "Jezebel");
        chariot(k, 40 + ((k.t * 4) % 16), 33, { driver: "Jehu", walk: true });
      } },
    ],
    10: [
      { verse: 1, alt: "Jehu writes letters to the leaders of Samaria about Ahab's seventy sons", draw: (k) => {
        k.room("palace"); k.lamp(14, 8);
        k.rect(30, 26, 24, 4, "#8a5a32"); k.scroll(36, 22);
        k.fig("Jehu", "sit", 18, 21);
        k.fig("messenger", "run", 70 + ((k.t * 10) % 50), 19);
      } },
      { verse: 15, alt: "Jehu meets Jehonadab on the road and takes his hand to lift him into the chariot", draw: (k) => {
        k.scene("day", "hills", { sunX: 20 });
        chariot(k, 36, 33, { driver: "Jehu" });
        k.fig("Jehonadab", "stand", 58, 19, true);
        k.px(56, 25, "#e0a96d"); k.px(57, 25, "#e0a96d");
        k.tree(100, 31); k.tree(114, 30);
      } },
      { verse: 21, alt: "Baal's worshippers crowd into the temple of Baal until it is full from end to end", draw: (k) => {
        k.scene("dusk", "city", { cityX: 20, cityW: 30 });
        baalHouse(k, 66, 32);
        for (let i = 0; i < 4; i++) k.fig("Baal worshipper " + i, "stand", 30 + i * 9 + ((k.t * 4) % 9), 19);
      } },
      { verse: 26, alt: "Baal's stone pillar is pulled down and burned, and his temple becomes a rubbish heap", draw: (k) => {
        k.scene("dusk", "hills");
        ruins(k, 40, 32, 52);
        k.rect(62, 28, 14, 3, "#6a6050"); k.rect(74, 27, 3, 4, "#8a8070");
        k.fire(68, 28, 10); k.smoke(68, 22); k.smoke(52, 26);
        k.fig("Jehu", "stand", 14, 19);
      } },
      { verse: 32, alt: "Hazael's army takes Israel's land east of the Jordan", draw: (k) => {
        k.scene("day", "river");
        for (let i = 0; i < 3; i++) chariot(k, 40 + i * 26 - ((k.t * 3) % 6), 29, { flip: true, driver: "Syrian " + i });
        k.flag(120, 29, "#5a5a62");
      } },
    ],
    11: [
      { verse: 2, alt: "Jehosheba slips away from the palace at night carrying baby Joash", draw: (k) => {
        k.room("palace");
        for (let y = 0; y < 30; y += 2) for (let x = (y / 2) % 2; x < 128; x += 2) k.px(x, y, "#1a1210");
        k.lamp(108, 8);
        const x = 90 - ((k.t * 8) % 80);
        k.fig("Jehosheba", "run", x, 19, true); k.fig("Joash", "baby", x - 2, 24);
        k.fig("nurse", "run", x + 12, 19, true);
      } },
      { verse: 3, alt: "Joash grows up hidden with his nurse in a room of the Lord's temple for six years", draw: (k) => {
        k.room("house"); k.lamp(64, 6);
        k.rect(96, 4, 4, 26, "#b87a3a"); k.rect(95, 3, 6, 2, "#d89a4a");
        k.fig("nurse", "sit", 34, 21);
        k.fig("Joash", "child", 50 + k.pulse(1.2, 2), 24, true);
      } },
      { verse: 12, alt: "Jehoiada brings out Joash and crowns him, and the people clap and shout, Long live the king", draw: (k) => {
        k.scene("day", "city", { cityX: 104, cityW: 30 });
        temple(k, 20, 32, 44, 20);
        k.fig("Joash", "child", 40, 25); k.crown(41, 21);
        k.fig("Jehoiada", "stand", 28, 19);
        k.fig("guard", "spear", 6, 20); k.fig("guard 2", "spear", 68, 20, true);
        k.fig("person", "praise", 84, 20); k.fig("person 2", "praise", 96, 20);
      } },
      { verse: 14, alt: "Queen Athaliah runs in and sees the boy king by the pillar, with trumpets all around", draw: (k) => {
        k.scene("day", "city", { cityX: 20, cityW: 30 });
        k.rect(76, 8, 4, 24, "#b87a3a"); k.rect(75, 6, 6, 2, "#d89a4a");
        k.fig("Joash", "child", 82, 25); k.crown(83, 21);
        k.fig("trumpeter", "trumpet", 94, 19, true); k.fig("trumpeter 2", "trumpet", 110, 19, true);
        k.fig("Athaliah", "run", 50 + ((k.t * 4) % 8), 19);
      } },
      { verse: 19, alt: "The guards bring Joash down to the palace and he takes his seat on the royal throne", draw: (k) => {
        k.room("palace"); k.lamp(64, 6);
        k.throne(56, 31); k.fig("Joash", "child", 58, 21); k.crown(59, 17);
        k.fig("guard", "spear", 30, 19); k.fig("guard 2", "spear", 86, 19, true);
        k.fig("Jehoiada", "stand", 14, 19);
      } },
    ],
    12: [
      { verse: 2, alt: "The priest Jehoiada teaches young King Joash to do what is right", draw: (k) => {
        k.room("house"); k.lamp(64, 6);
        k.fig("Jehoiada", "sit", 34, 21); k.scroll(46, 24);
        k.fig("Joash", "sit", 70, 21, true);
      } },
      { verse: 9, alt: "Jehoiada sets a chest with a hole in its lid by the altar, and the people put money in", draw: (k) => {
        k.scene("day", "city", { cityX: 110, cityW: 30 });
        temple(k, 8, 32, 40, 20);
        chest(k, 56, 32);
        const p = (k.t * 1.5) % 1; k.px(60, 18 + p * 8, "#f2c230");
        k.fig("Jehoiada", "stand", 50, 19);
        k.fig("person", "stand", 66, 19, true); k.fig("person 2", "stand", 80, 19, true);
      } },
      { verse: 11, alt: "Carpenters, builders and stonecutters repair the temple with the money", draw: (k) => {
        k.scene("day", "hills");
        temple(k, 40, 32, 48, 20);
        for (const x of [36, 92]) { k.line(x, 32, x, 10, "#8a5a32"); k.line(x + 4, 32, x + 4, 10, "#8a5a32"); for (let y = 12; y < 32; y += 6) k.line(x, y, x + 4, y, "#8a5a32"); }
        k.fig("builder", "stand", 92, 6 + k.pulse(2, 1));
        k.fig("stonecutter", "kneel", 8, 23); k.rect(16, 28, 5, 4, "#c8c0b0"); if (k.f % 4 < 2) k.px(15, 27, "#ffffff");
        k.fig("carpenter", "stand", 106, 19, true); k.rect(98, 29, 14, 2, "#8a5a32");
      } },
      { verse: 18, alt: "Joash sends the temple's gold to Hazael, and Hazael's army turns away from Jerusalem", draw: (k) => {
        k.scene("day", "hills");
        gate(k, 6, 32);
        const x = 44 + ((k.t * 5) % 20);
        k.animal("donkey", x + 16, 25, false, true); k.cart(x, 28); treasure(k, x + 3, 28);
        for (let i = 0; i < 2; i++) k.fig("Syrian " + i, "spear", 100 + i * 12, 20, true);
      } },
    ],
    13: [
      { verse: 4, alt: "Jehoahaz prays to the Lord while Syria crushes Israel", draw: (k) => {
        k.scene("night", "hills");
        k.fig("Jehoahaz", "kneel", 30, 23);
        k.glow(36, 4, 5 + k.pulse(2), "#fff4c2");
        k.tent(80, 31, 16, 9, "#5a4a3a"); k.tent(100, 31, 18, 10, "#4a3a2e"); k.fire(96, 31, 4);
      } },
      { verse: 14, alt: "Elisha lies ill, and King Jehoash weeps over him: my father, the chariots of Israel", draw: (k) => {
        k.room("house"); k.lamp(16, 8);
        bed(k, 34, 31, 24); k.fig("Elisha", "lie", 38, 22);
        k.fig("Jehoash", "weep", 66, 19, true);
      } },
      { verse: 15, alt: "Elisha puts his hands on the king's hands and an arrow flies out of the east window", draw: (k) => {
        k.room("house");
        k.rect(92, 6, 18, 14, "#f2b07a"); k.rect(92, 14, 18, 6, "#c4707a"); k.disc(101, 15, 3, "#ffd27a"); k.rect(92, 18, 18, 2, "#6a4a5a");
        k.fig("Jehoash", "stand", 48, 19);
        k.line(56, 22, 57, 26, "#8a5a32"); k.line(56, 22, 57, 18, "#8a5a32");
        const ax = 58 + ((k.t * 40) % 60); if (ax < 116) k.line(ax, 22, ax + 4, 22, "#e8dcc0");
        k.fig("Elisha", "stand", 38, 19);
      } },
      { verse: 20, alt: "A dead man touches Elisha's bones in the tomb and comes back to life", draw: (k) => {
        k.scene("dusk", "hills");
        k.ridge((x) => 14 + Math.abs(x - 40) * 0.3, "#3a2244", 40, 0, 80);
        k.rect(34, 20, 12, 12, "#120a14"); k.rect(36, 18, 8, 2, "#120a14");
        k.glow(40, 26, 6 + k.pulse(3), "#a08a40");
        k.fig("man", "stand", 37, 19 + Math.max(0, 6 - Math.floor((k.t * 3) % 10)));
        k.fig("mourner", "run", 60 + ((k.t * 8) % 24), 19);
        for (let i = 0; i < 2; i++) k.animal("horse", 100 + i * 14, 24, true);
      } },
      { verse: 25, alt: "Jehoash defeats Ben-Hadad three times and wins back Israel's towns", draw: (k) => {
        k.scene("day", "city", { cityX: 90, cityW: 50 });
        k.flag(90, 14, "#db2777");
        k.fig("Jehoash", "sword", 30, 19);
        for (let i = 0; i < 3; i++) k.px(40 + i * 3, 10 + (k.f % 8 < 4 ? 0 : 1), "#f7d154");
      } },
    ],
    14: [
      { verse: 7, alt: "Amaziah defeats Edom in the Valley of Salt and takes the rock city of Sela", draw: (k) => {
        k.scene("noon", "desert");
        k.rect(0, 33, 70, 3, "#f4f0e6"); for (let x = 2; x < 70; x += 7) k.px(x + (k.f % 3), 33, "#ffffff");
        k.ridge((x) => 12 + Math.abs(x - 104) * 0.5 + Math.sin(x) , "#a86a4a", 40, 80, 128);
        k.rect(96, 20, 4, 5, "#3a2018"); k.rect(108, 24, 4, 5, "#3a2018");
        k.fig("Amaziah", "stand", 100, 1); k.flag(110, 13, "#db2777");
        k.fig("soldier", "spear", 30, 19); k.fig("soldier 2", "spear", 44, 19);
      } },
      { verse: 9, alt: "Jehoash's warning: a thistle asks a cedar for its daughter, and a wild animal tramples the thistle", draw: (k) => {
        k.scene("day", "mountains", { sunX: 24 });
        cedar(k, 92, 32, 26);
        thistle(k, 62, 32);
        k.animal("lion", 18 + ((k.t * 6) % 30), 27, false, true);
      } },
      { verse: 11, alt: "Israel and Judah face each other in battle at Beth Shemesh", draw: (k) => {
        k.scene("day", "hills");
        k.fig("Amaziah", "sword", 20, 19); k.fig("man of Judah", "spear", 8, 19); k.flag(34, 31, "#db2777");
        k.fig("Jehoash", "sword", 100, 19, true); k.fig("man of Israel", "spear", 114, 19, true); k.flag(88, 31, "#4a6ab0");
        k.city(64, 26, 22, 8);
      } },
      { verse: 13, alt: "Jehoash breaks down part of Jerusalem's wall and carries off the temple treasure", draw: (k) => {
        k.scene("dusk", "hills");
        k.rect(0, 12, 60, 20, "#7a6a58"); for (let i = 0; i < 60; i += 4) k.rect(i, 10, 2, 2, "#7a6a58");
        k.rect(30, 12, 18, 20, "#3a2244"); k.stones(32, 32, 9); k.smoke(40, 14);
        const x = 64 + ((k.t * 5) % 20);
        k.cart(x, 28); treasure(k, x + 3, 28); k.animal("ox", x + 17, 25, false, true);
      } },
      { verse: 25, alt: "Jeroboam II wins back Israel's borders, as the prophet Jonah had said", draw: (k) => {
        k.scene("day", "hills", { sunX: 64 });
        k.rect(96, 26, 32, 6, "#2c5a8c"); k.px(100 + (k.f % 24), 28, "#9cc0f0");
        k.fig("Jeroboam", "stand", 40, 19); k.flag(52, 31, "#db2777");
        k.fig("Jonah", "staff", 20, 19);
        k.flag(8, 31, "#db2777"); k.flag(88, 31, "#db2777");
      } },
    ],
    15: [
      { verse: 5, alt: "Azariah lives alone in a separate house with his skin disease while his son Jotham rules", draw: (k) => {
        k.scene("dusk", "hills");
        house(k, 8, 31, 28, 14);
        k.window(26, 20, "Azariah");
        k.palace(72, 31, 44, 18);
        k.fig("Jotham", "stand", 58, 19);
      } },
      { verse: 10, alt: "In Samaria the throne passes from king to king as one overthrows another", draw: (k) => {
        k.room("palace"); k.lamp(24, 8 + 0); k.lamp(104, 8);
        k.throne(58, 31);
        k.crown(70, 28 + (Math.floor(k.t * 2) % 2));
        for (let i = 0; i < 3; i++) k.fig("king " + i, "stand", 6 + i * 12, 19, false);
      } },
      { verse: 19, alt: "Menahem pays King Pul of Assyria a thousand talents of silver to go away", draw: (k) => {
        k.scene("day", "hills");
        k.fig("Menahem", "bow", 40, 26, true);
        treasure(k, 50, 31); treasure(k, 58, 31);
        chariot(k, 80, 33, { driver: "Pul" });
        for (let i = 0; i < 2; i++) k.fig("Assyrian " + i, "spear", 106 + i * 10, 19, true);
      } },
      { verse: 29, alt: "Tiglath-Pileser takes Galilee and Naphtali and carries the people off to Assyria", draw: (k) => {
        k.scene("dusk", "hills");
        k.city(18, 28, 30, 10); k.smoke(18, 14);
        exiles(k, 44 + ((k.t * 3) % 8), 4);
        k.fig("Assyrian", "spear", 110, 19);
      } },
      { verse: 35, alt: "Jotham builds the Upper Gate of the Lord's temple", draw: (k) => {
        k.scene("day", "city", { cityX: 110, cityW: 30 });
        temple(k, 10, 32, 40, 20);
        gate(k, 60, 32, 14);
        k.line(58, 32, 58, 12, "#8a5a32"); k.line(92, 32, 92, 12, "#8a5a32"); k.line(58, 14, 92, 14, "#8a5a32");
        k.fig("builder", "stand", 74, 2 + k.pulse(2, 1));
        k.fig("Jotham", "stand", 100, 19, true);
      } },
    ],
    16: [
      { verse: 4, alt: "Ahaz burns incense at the shrines on the hills and under every green tree", draw: (k) => {
        k.scene("dusk", "hills");
        for (const x of [20, 70, 108]) { k.tree(x, 30, "oak", "#2e5a2a"); idol(k, x + 8, 31); k.smoke(x + 4, 26); }
        k.fig("Ahaz", "stand", 44, 19);
      } },
      { verse: 8, alt: "Ahaz sends the temple's silver and gold to the king of Assyria", draw: (k) => {
        k.scene("day", "desert");
        const x = 20 + ((k.t * 4) % 20);
        k.sprite(CAMEL.rows, CAMEL.pal, x, 24 + (Math.floor(k.t * 4) % 2)); treasure(k, x + 2, 24);
        k.fig("messenger", "stand", x + 14, 19);
        k.palace(84, 31, 40, 18); k.flag(104, 13, "#5a5a8a");
      } },
      { verse: 10, alt: "In Damascus Ahaz sees a great altar and sends its plan to Uriah the priest", draw: (k) => {
        k.scene("day", "city", { cityX: 104, cityW: 40 });
        k.rect(40, 20, 26, 12, "#8a8070"); for (let y = 20; y < 32; y += 3) k.rect(40, y, 26, 1, "#6a6050");
        k.fire(53, 20, 14); k.smoke(53, 16);
        k.fig("Ahaz", "stand", 22, 19);
        k.fig("messenger", "run", 70 + ((k.t * 8) % 20), 19); k.scroll(66, 12);
      } },
      { verse: 14, alt: "Ahaz's new altar stands before the temple and the old bronze altar is pushed aside", draw: (k) => {
        k.scene("day", "hills");
        temple(k, 70, 32, 44, 20);
        k.rect(36, 20, 24, 12, "#8a8070"); for (let y = 20; y < 32; y += 3) k.rect(36, y, 24, 1, "#6a6050"); k.fire(48, 20, 12);
        k.rect(6, 25, 10, 7, "#b87a3a"); k.rect(6, 25, 10, 1, "#d89a4a");
        k.fig("Uriah", "stand", 22, 19);
      } },
      { verse: 17, alt: "Ahaz takes the bronze Sea down from its bronze bulls and sets it on a stone floor", draw: (k) => {
        k.room("palace"); k.lamp(64, 6);
        k.rect(40, 29, 48, 2, "#8a8070");
        for (let i = 0; i < 8; i++) k.rect(46 + i, 21 + i, 36 - i * 2, 1, i % 3 ? "#b87a3a" : "#9a6a2a"); k.rect(45, 20, 38, 1, "#d89a4a"); k.px(52 + (k.f % 24), 20, "#9cc0f0");
        for (let i = 0; i < 2; i++) k.sprite(_SC_ANIMAL.ox.rows, { b: "#b87a3a", h: "#d89a4a", e: "#6a4a20" }, 6 + i * 14, 26);
        k.fig("Ahaz", "stand", 100, 19, true);
      } },
    ],
    17: [
      { verse: 5, alt: "The Assyrian army surrounds Samaria and besieges it for three years", draw: (k) => {
        k.scene("night", "hills", { moonX: 20 });
        k.ridge((x) => 20 + Math.abs(x - 64) * 0.4, "#141c2c", 40, 30, 98);
        k.city(64, 22, 30, 8, true);
        for (const x of [4, 22, 98, 112]) k.tent(x, 32, 14, 8, "#5a4a3a");
        k.fire(38, 32, 4); k.fire(92, 32, 4);
      } },
      { verse: 6, alt: "Samaria falls and the Israelites are led away to Assyria", draw: (k) => {
        k.scene("dusk", "desert");
        k.city(110, 28, 30, 10); k.smoke(104, 14); k.smoke(116, 16);
        exiles(k, 70 - ((k.t * 3) % 8), 5, true);
        k.fig("Assyrian", "spear", 4, 19);
      } },
      { verse: 10, alt: "Stone pillars and Asherah poles stand on every high hill and under every green tree", draw: (k) => {
        k.scene("dusk", "mountains");
        for (const [x, b] of [[14, 30], [44, 29], [78, 30], [108, 29]]) { k.tree(x, b, "oak", "#2a4a26"); idol(k, x + 7, b + 1, x % 2 ? "#5a4a3a" : "#6a6050"); }
        k.smoke(60, 24);
      } },
      { verse: 25, alt: "Lions roam among the new settlers living in Samaria's towns", draw: (k) => {
        k.scene("dusk", "hills");
        house(k, 6, 31, 26, 12); house(k, 96, 31, 26, 12, "#a89070");
        k.animal("lion", 44 + ((k.t * 5) % 30), 27, false, true);
        k.fig("settler", "run", 34, 19, true);
      } },
      { verse: 28, alt: "An Israelite priest comes back to Bethel to teach the settlers how to worship the Lord", draw: (k) => {
        k.scene("day", "hills");
        k.fig("priest", "staff", 30, 19); k.scroll(40, 16);
        for (let i = 0; i < 4; i++) k.fig("settler " + i, "sit", 54 + i * 16, 21, true);
      } },
    ],
    18: [
      { verse: 4, alt: "Hezekiah breaks the bronze snake Nehushtan and cuts down the Asherah poles", draw: (k) => {
        k.scene("day", "hills", { sunX: 20 });
        k.line(80, 32, 92, 14, "#7a5a32");
        for (let i = 0; i < 5; i++) k.rect(88 + (i % 2) * 2, 15 + i * 2, 3, 1, "#c08a3a");
        k.rect(98, 31, 3, 1, "#c08a3a"); k.rect(104, 30, 2, 1, "#c08a3a"); if (k.f % 8 < 2) k.px(99, 30, "#ffffff");
        k.rect(14, 30, 18, 2, "#6a5a3a"); k.rect(30, 29, 3, 3, "#8a8070");
        k.fig("Hezekiah", "sword", 60, 19);
      } },
      { verse: 13, alt: "Sennacherib's army attacks and captures the walled towns of Judah", draw: (k) => {
        k.scene("dusk", "hills");
        k.city(100, 28, 40, 10); k.fire(92, 16, 6); k.smoke(92, 12); k.smoke(110, 14);
        for (let i = 0; i < 4; i++) k.fig("Assyrian " + i, "spear", 8 + i * 14 + ((k.t * 3) % 6), 20);
        k.flag(66, 31, "#5a5a8a");
      } },
      { verse: 17, alt: "The Assyrian field commander arrives with a great army by the upper pool outside Jerusalem", draw: (k) => {
        k.scene("day", "hills");
        k.rect(0, 12, 40, 20, "#7a6a58"); for (let i = 0; i < 40; i += 4) k.rect(i, 10, 2, 2, "#7a6a58"); k.rect(10, 22, 8, 10, "#2a2018");
        k.rect(44, 30, 22, 3, "#2c5a8c"); k.px(46 + (k.f % 18), 31, "#9cc0f0");
        k.fig("Assyrian commander", "stand", 70, 19, true);
        for (let i = 0; i < 3; i++) k.fig("Assyrian " + i, "spear", 84 + i * 13, 19, true);
      } },
      { verse: 28, alt: "The Assyrian commander shouts up in Hebrew to the people sitting on Jerusalem's wall", draw: (k) => {
        k.scene("day", "hills", { sunX: 112 });
        k.rect(0, 14, 62, 18, "#7a6a58"); for (let i = 0; i < 62; i += 4) k.rect(i, 12, 2, 2, "#7a6a58");
        for (let i = 0; i < 4; i++) k.fig("person " + i, "sit", 6 + i * 13, 4);
        k.fig("Assyrian commander", "stand", 84, 19, true);
        for (let i = 0; i < 3; i++) { const r = 3 + ((k.f + i * 3) % 9); k.px(82 - r, 21 - r, "#ffffff"); k.px(81 - r, 22 - r, "#ffffff"); }
        k.fig("Eliakim", "stand", 66, 19);
      } },
      { verse: 37, alt: "Eliakim, Shebna and Joah come to Hezekiah with their clothes torn", draw: (k) => {
        k.room("palace"); k.lamp(64, 6);
        k.throne(12, 31); k.fig("Hezekiah", "sit", 14, 21);
        k.fig("Eliakim", "weep", 56, 19); k.fig("Shebna", "weep", 74, 19); k.fig("Joah", "weep", 92, 19);
      } },
    ],
    19: [
      { verse: 1, alt: "Hezekiah tears his clothes, puts on sackcloth and goes into the Lord's temple", draw: (k) => {
        k.scene("dusk", "city", { cityX: 110, cityW: 30 });
        temple(k, 46, 32, 44, 20);
        k.fig("Hezekiah", "kneel", 30, 23); k.rect(31, 28, 6, 3, "#6a5a3a");
        k.glow(68, 6, 6 + k.pulse(2), "#fff4c2");
      } },
      { verse: 14, alt: "Hezekiah spreads Sennacherib's letter out before the Lord and prays", draw: (k) => {
        k.room("palace"); k.lamp(16, 8); k.lamp(112, 8);
        k.glow(64, 0, 12 + k.pulse(1.5), "#7a6a40");
        for (let i = 0; i < 4; i++) k.line(64, 0, 52 + i * 8, 26, "#8a7a4a");
        k.scroll(58, 27);
        k.fig("Hezekiah", "kneel", 42, 22);
      } },
      { verse: 20, alt: "Isaiah sends Hezekiah the Lord's answer: the king of Assyria will not enter this city", draw: (k) => {
        k.scene("day", "city", { cityX: 104, cityW: 40 });
        k.fig("Isaiah", "stand", 20, 19); k.scroll(30, 14);
        k.fig("messenger", "run", 40 + ((k.t * 10) % 40), 19);
      } },
      { verse: 35, alt: "That night the angel of the Lord goes out over the Assyrian camp", draw: (k) => {
        k.scene("night", "desert", { moonX: 18 });
        for (let i = 0; i < 6; i++) k.tent(2 + i * 21, 32, 16, 8, i % 2 ? "#5a4a3a" : "#4a3a2e");
        k.angel(60, 3);
      } },
      { verse: 36, alt: "At dawn Sennacherib breaks camp and goes home to Nineveh", draw: (k) => {
        k.scene("dawn", "desert");
        k.tent(90, 32, 16, 8, "#4a3a2e"); k.tent(110, 32, 14, 7, "#5a4a3a");
        const x = 70 - ((k.t * 8) % 90);
        k.cloud(x + 26, 28, 14, "#a08a7a");
        chariot(k, x, 33, { flip: true, driver: "Sennacherib", walk: true });
      } },
    ],
    20: [
      { verse: 2, alt: "Hezekiah, deathly ill, turns his face to the wall and weeps as he prays", draw: (k) => {
        k.room("palace"); k.lamp(64, 6);
        bed(k, 84, 31, 26); k.fig("Hezekiah", "lie", 98, 22, true);
        k.px(97, 24 + (k.f % 4), "#9cc8f0");
        k.fig("Isaiah", "staff", 30 - ((k.t * 4) % 20), 19, true);
      } },
      { verse: 7, alt: "Isaiah has a cake of figs laid on Hezekiah's boil, and he recovers", draw: (k) => {
        k.room("palace"); k.lamp(110, 8);
        bed(k, 14, 31, 26); k.fig("Hezekiah", "sit", 22, 19);
        k.fig("Isaiah", "stand", 58, 19, true);
        k.rect(50, 24, 6, 2, "#a8865c"); for (let i = 0; i < 3; i++) k.disc(51 + i * 2, 23, 1, "#6a3a6a");
      } },
      { verse: 11, alt: "The shadow goes back ten steps on the stairway of Ahaz", draw: (k) => {
        k.scene("day", "city", { cityX: 20, cityW: 30, sunX: 116 });
        for (let i = 0; i < 10; i++) k.rect(40 + i * 7, 29 - i * 2, 84 - i * 7, 2, i % 2 ? "#c8b488" : "#b8a478");
        const s = Math.floor((k.t * 2) % 11);
        for (let i = 10 - s; i < 10; i++) k.rect(40 + i * 7, 29 - i * 2, 7, 2, "#5a5040");
        k.fig("Hezekiah", "stand", 14, 19); k.fig("Isaiah", "praise", 26, 20);
      } },
      { verse: 13, alt: "Hezekiah proudly shows the envoys from Babylon everything in his treasure house", draw: (k) => {
        k.room("palace"); k.lamp(64, 5);
        for (let y = 12; y < 30; y += 8) { k.rect(70, y + 5, 50, 1, "#6a4a30"); for (let i = 0; i < 6; i++) jar(k, 72 + i * 8, y + 5, i % 2 === 0); }
        treasure(k, 60, 31);
        k.fig("Hezekiah", "stand", 46, 19, true);
        k.fig("envoy", "stand", 18, 19); k.fig("envoy 2", "stand", 6, 19);
      } },
    ],
    21: [
      { verse: 3, alt: "Manasseh rebuilds the shrines, sets up altars for Baal and bows down to the stars", draw: (k) => {
        k.scene("night", "city", { cityX: 90, cityW: 60, noMoon: true });
        k.stars(20, "#fff4c2", 12);
        idol(k, 30, 31); k.altar(40, 31);
        k.fig("Manasseh", "bow", 8, 26);
      } },
      { verse: 7, alt: "Manasseh sets up a carved Asherah pole in the Lord's temple", draw: (k) => {
        k.scene("dusk", "hills");
        temple(k, 40, 32, 48, 20);
        k.rect(76, 14, 3, 18, "#6a4a30"); k.disc(77, 13, 2, "#3a5a2a"); k.px(77, 18, "#2a1a10");
        k.fig("Manasseh", "stand", 22, 19);
        k.smoke(30, 24);
      } },
      { verse: 13, alt: "The prophets warn that the Lord will measure Jerusalem with Samaria's line and wipe it like a dish", draw: (k) => {
        k.scene("storm", "city", { cityX: 80, cityW: 70 });
        const sw = Math.round(Math.sin(k.t * 1.5) * 3);
        k.line(80, 0, 80 + sw, 12, "#e8dcc0"); k.rect(79 + sw, 12, 3, 3, "#8a8a92");
        k.fig("prophet", "staff", 16, 19);
      } },
      { verse: 18, alt: "Manasseh is buried in the garden of Uzza, and his son Amon becomes king", draw: (k) => {
        k.scene("dusk", "hills");
        k.tree(10, 31, "oak", "#2e5a2a"); k.tree(28, 30, "oak", "#2e5a2a"); k.tree(110, 31, "oak", "#2e5a2a");
        k.rect(50, 24, 16, 8, "#6a6050"); k.rect(54, 26, 8, 6, "#1a1218"); k.disc(68, 29, 3, "#8a8070");
        k.fig("Amon", "front", 84, 19);
      } },
      { verse: 24, alt: "The people of the land make eight-year-old Josiah king", draw: (k) => {
        k.scene("day", "city", { cityX: 64, cityW: 100 });
        k.fig("Josiah", "child", 60, 25); k.crown(61, 21);
        for (let i = 0; i < 2; i++) { k.fig("person " + i, "praise", 20 + i * 14, 20); k.fig("person " + (i + 2), "praise", 80 + i * 14, 20); }
      } },
    ],
    22: [
      { verse: 2, alt: "Josiah walks in the ways of David, not turning to the right or the left", draw: (k) => {
        k.scene("day", "hills", { sunX: 64 });
        for (let y = 24; y < 40; y++) { const w = 2 + (y - 24) * 2; k.rect(64 - w / 2, y, w, 1, "#c8b08a"); }
        k.fig("Josiah", "front", 60, 21 + k.pulse(3, 1));
        k.tree(20, 31); k.tree(100, 31);
      } },
      { verse: 5, alt: "Shaphan brings the money and the workmen repair the Lord's temple", draw: (k) => {
        k.scene("day", "city", { cityX: 110, cityW: 30 });
        temple(k, 40, 32, 44, 20);
        k.fig("Shaphan", "stand", 14, 19); chest(k, 24, 32);
        const x = 96 + ((k.t * 4) % 12);
        k.fig("workman", "stand", x, 19, true); k.rect(x - 6, 20, 14, 2, "#8a5a32");
        k.fig("workman 2", "kneel", 30, 23, true);
      } },
      { verse: 8, alt: "Hilkiah the high priest finds the Book of the Law in the temple", draw: (k) => {
        k.room("house"); k.lamp(20, 8);
        k.rect(70, 14, 22, 14, "#2a2028"); k.glow(81, 21, 8 + k.pulse(2), "#a08a40");
        k.scroll(76, 20);
        k.fig("Hilkiah", "stand", 56, 19);
        for (let i = 0; i < 4; i++) k.px(72 + ((i * 7 + k.f) % 20), 10 + i, "#8a8070");
      } },
      { verse: 11, alt: "Josiah hears the words of the Book of the Law and tears his robes", draw: (k) => {
        k.room("palace"); k.lamp(64, 6);
        k.throne(12, 31);
        k.fig("Josiah", "weep", 30, 19);
        k.fig("Shaphan", "stand", 74, 19, true); k.scroll(64, 23);
      } },
      { verse: 14, alt: "The king's officials go to ask Huldah the prophetess at her house in Jerusalem", draw: (k) => {
        k.scene("day", "city", { cityX: 104, cityW: 40 });
        house(k, 30, 31, 30, 13);
        k.fig("Huldah", "stand", 40, 19);
        k.fig("Hilkiah", "stand", 64, 19, true); k.fig("Shaphan", "stand", 76, 19, true);
      } },
    ],
    23: [
      { verse: 2, alt: "Josiah stands by the pillar and reads the Book of the Covenant to all the people", draw: (k) => {
        k.scene("day", "hills");
        temple(k, 4, 32, 44, 20);
        k.fig("Josiah", "stand", 52, 19); k.scroll(60, 22);
        for (let i = 0; i < 4; i++) k.fig("person " + i, "sit", 74 + i * 13, 21, true);
      } },
      { verse: 4, alt: "Josiah has the objects made for Baal and Asherah burned in the fields of the Kidron Valley", draw: (k) => {
        k.scene("dusk", "valley");
        k.city(20, 22, 36, 8, true);
        k.fire(64, 32, 18); k.smoke(58, 26); k.smoke(70, 24);
        k.rect(60, 30, 3, 2, "#6a6050"); k.rect(68, 29, 2, 3, "#6a4a30");
        k.fig("Josiah", "stand", 94, 19, true);
      } },
      { verse: 15, alt: "At Bethel Josiah pulls down the altar, but leaves the grave of the man of God untouched", draw: (k) => {
        k.scene("day", "hills");
        k.stones(30, 32, 9); k.rect(24, 28, 8, 3, "#8a8070"); k.smoke(32, 26);
        k.rect(96, 22, 6, 10, "#a8a090"); k.rect(94, 22, 10, 2, "#a8a090");
        k.fig("Josiah", "stand", 70, 19, true);
      } },
      { verse: 21, alt: "Judah keeps the Passover as it had not been kept since the days of the judges", draw: (k) => {
        k.room("house"); k.lamp(18, 8); k.lamp(110, 8);
        k.rect(34, 27, 60, 3, "#8a5a32");
        k.disc(50, 26, 2, "#e8dcc0"); k.disc(64, 25, 3, "#c87a4a"); k.disc(78, 26, 2, "#6a8a3a");
        k.fig("family", "sit", 22, 21); k.fig("family 2", "sit", 96, 21, true); k.fig("child", "child", 60, 20);
      } },
      { verse: 30, alt: "Josiah's servants bring him home in a chariot from Megiddo, and the people mourn", draw: (k) => {
        k.scene("dusk", "city", { cityX: 104, cityW: 40 });
        chariot(k, 30 + ((k.t * 2) % 8), 33, { driver: "servant" });
        k.fig("mourner", "weep", 60, 19); k.fig("mourner 2", "weep", 72, 19);
        k.flag(8, 31, "#3a3040");
      } },
    ],
    24: [
      { verse: 1, alt: "Nebuchadnezzar king of Babylon marches against Judah", draw: (k) => {
        k.scene("day", "desert");
        chariot(k, 50 + ((k.t * 3) % 8), 33, { driver: "Nebuchadnezzar" });
        for (let i = 0; i < 3; i++) k.fig("Babylonian " + i, "spear", 6 + i * 13 + ((k.t * 3) % 8), 19);
        k.flag(86, 31, "#3a5ab0"); k.city(112, 26, 24, 8);
      } },
      { verse: 10, alt: "Babylon's army surrounds Jerusalem and lays siege to it", draw: (k) => {
        k.scene("dusk", "hills");
        k.city(64, 26, 56, 12);
        for (const x of [2, 16, 98, 112]) k.tent(x, 32, 13, 8, "#4a3a5a");
        k.flag(30, 31, "#3a5ab0"); k.flag(94, 31, "#3a5ab0");
      } },
      { verse: 12, alt: "King Jehoiachin, his mother and his officials come out of the gate and give themselves up", draw: (k) => {
        k.scene("day", "hills");
        gate(k, 6, 32);
        k.fig("Jehoiachin", "bow", 52, 26); k.fig("queen mother", "bow", 42, 26);
        k.fig("Nebuchadnezzar", "stand", 90, 19, true); k.fig("Babylonian", "spear", 104, 19, true); k.flag(118, 31, "#3a5ab0");
      } },
      { verse: 14, alt: "The temple treasures are carried off and ten thousand people are led away to Babylon", draw: (k) => {
        k.scene("dusk", "desert");
        exiles(k, 60 - ((k.t * 3) % 8), 4, true);
        const x = 4; k.cart(x, 28); treasure(k, x + 3, 28); k.animal("ox", x - 2, 25, true);
        k.fig("Babylonian", "spear", 112, 19, true);
      } },
      { verse: 17, alt: "Nebuchadnezzar makes Mattaniah king and renames him Zedekiah", draw: (k) => {
        k.room("palace"); k.lamp(64, 6);
        k.throne(14, 31); k.fig("Nebuchadnezzar", "sit", 16, 21);
        k.fig("Zedekiah", "kneel", 56, 22, true); k.crown(58, 16 + k.pulse(2, 1));
        k.fig("Babylonian", "spear", 96, 19, true);
      } },
    ],
    25: [
      { verse: 1, alt: "Nebuchadnezzar's army builds siege works all around Jerusalem and famine grips the city", draw: (k) => {
        k.scene("famine", "hills");
        k.rect(40, 12, 88, 20, "#7a6a58"); for (let i = 40; i < 128; i += 4) k.rect(i, 10, 2, 2, "#7a6a58");
        for (let i = 0; i < 18; i++) k.rect(14 + i, 32 - i, 1, i, "#8a7458");
        tower(k, 16, 32, 18);
        k.fig("Babylonian", "spear", 2, 19);
      } },
      { verse: 4, alt: "The wall is broken through and Zedekiah's soldiers slip away at night toward the desert", draw: (k) => {
        k.scene("night", "hills", { moonX: 110 });
        k.rect(0, 12, 44, 20, "#4a4248"); for (let i = 0; i < 44; i += 4) k.rect(i, 10, 2, 2, "#4a4248");
        k.rect(18, 12, 12, 20, "#0e1420"); k.stones(19, 32, 6);
        const x = 58 + ((k.t * 6) % 50);
        k.fig("Zedekiah", "run", x, 19); k.fig("soldier", "run", x - 12, 19);
      } },
      { verse: 9, alt: "Nebuzaradan burns the temple, the palace and the houses of Jerusalem", draw: (k) => {
        k.scene("night", "hills", { noMoon: true });
        k.glow(64, 26, 30 + k.pulse(2, 2), "#5a2a1a");
        temple(k, 42, 32, 44, 20);
        for (const x of [48, 60, 74, 86]) k.fire(x, 13, 6);
        k.smoke(54, 8); k.smoke(80, 8);
        ruins(k, 2, 32, 34); k.fire(18, 28, 6); ruins(k, 96, 32, 30);
      } },
      { verse: 12, alt: "Only the poorest people are left to tend the vineyards and the fields", draw: (k) => {
        k.scene("day", "hills");
        for (let x = 4; x < 124; x += 8) { k.line(x, 32, x, 26, "#6a4a30"); k.disc(x, 25, 2, "#3f7a2e"); if (x % 16 === 4) k.px(x + 1, 27, "#6a3a6a"); }
        k.fig("vinedresser", "kneel", 50, 23); k.fig("farmer", "stand", 92, 19, true);
        ruins(k, 106, 32, 20);
      } },
      { verse: 13, alt: "Babylon's soldiers break up the bronze pillars and the bronze Sea and carry them away", draw: (k) => {
        k.scene("dusk", "desert");
        const x = 30 + ((k.t * 4) % 20);
        k.cart(x, 28); k.rect(x + 1, 24, 14, 3, "#b87a3a"); k.rect(x + 2, 22, 5, 2, "#d89a4a"); k.animal("ox", x + 17, 25, false, true);
        k.rect(4, 29, 18, 3, "#b87a3a"); k.rect(22, 28, 4, 4, "#d89a4a");
        k.fig("Babylonian", "spear", 96, 19);
      } },
      { verse: 27, alt: "In Babylon, Evil-Merodach frees Jehoiachin and gives him a seat at the king's table", draw: (k) => {
        k.room("palace"); k.lamp(20, 8); k.lamp(108, 8);
        k.rect(36, 27, 56, 3, "#8a5a32"); k.disc(50, 26, 2, "#e0a96d"); k.disc(64, 26, 2, "#c8504a"); k.disc(78, 26, 2, "#e8dcc0");
        k.glow(98, 24, 8 + k.pulse(1.5), "#7a6a40");
        k.fig("Evil-Merodach", "sit", 24, 21); k.fig("Jehoiachin", "sit", 94, 21, true);
      } },
    ],
  };

  for (const [ch, scenes] of Object.entries(NR)) { if (typeof _NR_SCENES !== "undefined") _NR_SCENES["2KI-" + ch] = scenes; }
})();
