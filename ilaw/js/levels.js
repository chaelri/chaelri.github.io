// Level data. Everything is authored in world units (a level is 44 x 26 of
// them, roughly metres) and expanded into collision + occluder geometry by
// world.js — nothing here is pixels, so the same numbers work at any size.
//
// A note on why every chasm is crossed exactly once per lantern:
//
// A shadow bridge only exists while the light is BEHIND the pillar, so the
// walker can cross a chasm but can never carry the lantern over it. That is
// the point — but it means two chasms in a row would strand her on the far
// side with no light source at all. So a level either has one chasm, or it
// has a second lantern waiting past the first one.

const bounds = { x: 1, y: 1, w: 42, h: 24 };

export const LEVELS = [
  {
    id: "pagpasok",
    name: "Pagpasok",
    sub: "the way in",
    hint: "Sweep the beam. Find both shards. Then the door.",
    size: [44, 26],
    bounds,
    start: [5, 13],
    lanterns: [{ x: 5, y: 13 }],
    blocks: [
      { x: 13, y: 1, w: 1.6, h: 9 },
      { x: 13, y: 16, w: 1.6, h: 9 },
      { x: 27, y: 8, w: 11, h: 1.6 },
      { x: 23, y: 15, w: 1.6, h: 10 },
    ],
    pillars: [],
    voids: [],
    shards: [[19, 4.5], [33, 21]],
    spawns: [[31, 4], [19, 21]],
    exit: [40, 13],
  },

  {
    id: "tulay",
    name: "Ang Tulay",
    sub: "the bridge",
    hint: "The floor is gone.<br>Set the lantern down, and put the beam on the pillar.",
    size: [44, 26],
    bounds,
    start: [5, 13],
    lanterns: [{ x: 5, y: 13 }],
    blocks: [{ x: 29, y: 11, w: 9, h: 1.6 }],
    // The teaching level, so the answer sits on the path she is already
    // walking: straight out of the start, at her own height. The original
    // layout put both pillars off the direct line, which meant the obvious
    // route east had nothing to cast a shadow and simply dropped her.
    pillars: [
      { x: 15, y: 13, r: 1.4 },
      { x: 15, y: 6, r: 1.1 },
    ],
    // Six wide, not seven: at seven, a lantern put down partway along the
    // approach reached to within half a metre of the far lip and dropped her
    // there, which reads as the mechanic being broken rather than as the
    // light being too far away.
    voids: [{ x: 19, y: 1, w: 6, h: 24 }],
    shards: [[8, 4], [33, 7], [36, 21]],
    spawns: [[32, 14], [10, 21]],
    exit: [40, 13],
  },

  {
    id: "malalim",
    name: "Malalim",
    sub: "deeper",
    hint: "Two chasms, one lantern. There is another light down there somewhere.",
    size: [44, 26],
    bounds,
    start: [4, 13],
    // The second one is dark until she walks into it. Crossing the first
    // chasm leaves lantern A behind for good, so this is the payoff.
    lanterns: [{ x: 5, y: 13 }, { x: 21, y: 22 }],
    blocks: [{ x: 35, y: 10, w: 1.6, h: 7 }],
    pillars: [
      { x: 9, y: 7, r: 1.2 },
      { x: 9, y: 18, r: 1.2 },
      { x: 23, y: 13, r: 1.3 },
      { x: 23, y: 5, r: 1.1 },
    ],
    voids: [
      { x: 13, y: 1, w: 5, h: 24 },
      { x: 27, y: 1, w: 5, h: 24 },
    ],
    shards: [[5, 4], [20, 4], [36, 6], [38, 20]],
    spawns: [[20, 16], [35, 13], [8, 22]],
    exit: [40, 13],
  },
];

export const levelById = (id) => LEVELS.find((l) => l.id === id) || LEVELS[0];
