// Levels, authored as text. One character per tile:
//
//   #  solid          =  one-way platform (jump up through it)
//   ^  spikes         .  air
//   A  spawn one      B  spawn two
//   ?  a spot where a power-up can appear
//
// Rows must all be the same length; validate() shouts if they are not.

function validate(level, opts = {}) {
  const w = level.rows[0].length;
  level.rows.forEach((r, i) => {
    if (r.length !== w) throw new Error(`${level.id} row ${i} is ${r.length}, expected ${w}`);
  });
  level.w = w;
  level.h = level.rows.length;

  // Every spawn must have ground under it within a short drop. Karla once
  // spawned over a four-tile hole in the arena and died before the countdown
  // finished; a miscounted row should never be able to do that again.
  level.rows.forEach((r, y) => {
    [...r].forEach((c, x) => {
      if (c !== "A" && c !== "B") return;
      let ground = -1;
      for (let d = 1; d <= 4 && y + d < level.rows.length; d++) {
        const t = level.rows[y + d][x];
        if (t === "#" || t === "=") { ground = y + d; break; }
        if (t === "^") throw new Error(`${level.id}: spawn ${c} at x=${x} is over spikes`);
      }
      if (ground < 0) throw new Error(`${level.id}: spawn ${c} at x=${x} has no ground beneath it`);
    });
  });
  // Nothing should be placed where the jump cannot take you. A full jump
  // clears 3.43 tiles and about 7 across; anything asking for more is a
  // platform you can see and never stand on.
  const surfaces = [];
  level.rows.forEach((r, y) => {
    let run = null;
    [...r].forEach((c, x) => {
      if (c === "#" || c === "=") {
        if (!run) run = { y, x0: x, x1: x };
        else run.x1 = x;
      } else if (run) { surfaces.push(run); run = null; }
    });
    if (run) surfaces.push(run);
  });
  if (surfaces.length > 1) {
    const MAX_RISE_J = 3;
    const MAX_ACROSS = 6;
    const lowest = Math.max(...surfaces.map((s2) => s2.y));
    const reached = new Set(surfaces.filter((s2) => s2.y === lowest).map((s2) => surfaces.indexOf(s2)));
    let grew = true;
    while (grew) {
      grew = false;
      surfaces.forEach((to, ti) => {
        if (reached.has(ti)) return;
        for (const fi of reached) {
          const from = surfaces[fi];
          const rise = from.y - to.y;
          if (rise > MAX_RISE_J) continue;
          const across = to.x0 > from.x1 ? to.x0 - from.x1 : from.x0 > to.x1 ? from.x0 - to.x1 : 0;
          if (across > MAX_ACROSS) continue;
          reached.add(ti);
          grew = true;
          return;
        }
      });
    }
    const stranded = surfaces.filter((_, i) => !reached.has(i));
    if (stranded.length)
      throw new Error(
        `${level.id}: ${stranded.length} surface(s) cannot be jumped to — ` +
          stranded.map((s2) => `row ${s2.y} x${s2.x0}-${s2.x1}`).join(", ")
      );
  }
  return level;
}

/* --------------------------------------------------------------- arena --- */
//
// No floor at all. Everything below the platforms is a fall, so the only way
// to lose is to be somewhere the other person is not.

export const TAPAKAN = [
  validate({
    id: "tapakan-1",
    mode: "tapakan",
    name: "BUBU DUDU SMASH",
    sub: "land on their head",
    // A pyramid with two-tile steps, staggered so each tier is a normal jump
    // from the one below. The first version stacked platforms at 3, 5, 7 and
    // 9 tiles above the floor against a 3.43 tile jump: five of the seven
    // could not be reached at all, and the other two needed a perfect jump.
    rows: [
      "................................................",
      "................................................",
      "................................................",
      "................................................",
      "................................................",
      ".......................?........................",
      ".....................======.....................",
      "..................?..........?..................",
      "................=====......=====................",
      "...........?........................?...........",
      ".........=====....................=====.........",
      "................................................",
      "............A......................B............",
      "......####################################......",
      "................................................",
      "................................................",
    ],
  }),
];

/* ----------------------------------------------------------- generated --- */
//
// One hand-authored arena meant every round looked the same. These build a
// fresh one each round on the same skeleton — floor at row 13, tiers at rows
// 10, 8 and 6, because two-tile steps are what the jump can actually clear.
// What varies is what sits on each tier.
//
// Two rules are never relaxed, both of them bought with bugs:
//
//   - everything is MIRRORED about the centre. An arena that is kinder to one
//     side is the "dayaaa" complaint, and in a game about landing on someone's
//     head a two-tile advantage decides it.
//   - the result goes through the same validate() as the authored map, so a
//     generated tier that cannot be jumped to, or a spawn over a hole, is
//     thrown away rather than played.
//
// If a shape fails, we draw another. If forty in a row fail, the authored
// arena is used, so a round can never fail to start.

const W = 48;
const H = 16;
const FLOOR_Y = 13;
const TIERS = [10, 8, 6];

/** Deterministic per round, so a arena can be reproduced from its seed. */
function rngFrom(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a ^= a << 13; a >>>= 0;
    a ^= a >> 17;
    a ^= a << 5; a >>>= 0;
    return a / 4294967296;
  };
}

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const between = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

/**
 * One tier's runs, described on the LEFT HALF ONLY.
 *
 * Everything is authored in half and mirrored afterwards, which is the only
 * way the mirror is exact: taking the midpoint of a mirrored run gives an
 * off-by-one on even lengths, and that is a power-up spot sitting one tile
 * closer to one player than the other.
 *
 *   "ledge"  a run out toward the edge, its twin appears opposite
 *   "bridge" a run that reaches the centre line, becoming one wide platform
 *   "both"   one of each
 *   "none"   an empty tier, which is what makes some arenas open and tall
 */
function tierRuns(rng, shape) {
  const half = W / 2;
  const out = [];
  if (shape === "ledge" || shape === "both") {
    const len = between(rng, 4, 7);
    const x0 = between(rng, 6, half - len - 2);
    out.push([x0, x0 + len - 1]);
  }
  if (shape === "bridge" || shape === "both") {
    const len = between(rng, 3, 7);
    out.push([half - len, half - 1]);
  }
  return out;
}

function buildArena(seed) {
  const rng = rngFrom(seed);
  const half = W / 2;
  const grid = Array.from({ length: H }, () => Array(W).fill("."));

  // Floor: always solid and always centred, only its width moves. A hole in
  // it would fight safeSpawn(), which puts a respawning player on the middle
  // of whatever floor survives the shrink.
  const inset = between(rng, 4, 8);
  for (let x = inset; x < half; x++) grid[FLOOR_Y][x] = "#";

  // At least one tier has to carry something, or the arena is a flat strip.
  let shapes;
  do {
    shapes = TIERS.map(() => pick(rng, ["ledge", "bridge", "both", "ledge", "none"]));
  } while (shapes.every((sh) => sh === "none"));

  TIERS.forEach((y, i) => {
    for (const [x0, x1] of tierRuns(rng, shapes[i])) {
      for (let x = x0; x <= x1; x++) grid[y][x] = "=";
      // A power-up spot over the middle of the run, one row up so it sits on
      // the platform rather than inside it.
      const mid = Math.floor((x0 + x1) / 2);
      if (grid[y - 1][mid] === ".") grid[y - 1][mid] = "?";
    }
  });

  // One spawn, well inside the floor so the shrink cannot reach it before the
  // countdown is over. The mirror below produces the other.
  const sx = between(rng, inset + 4, half - 5);
  grid[FLOOR_Y - 1][sx] = "A";

  // Mirror the half into a whole. The reflected spawn becomes B; everything
  // else reflects as itself.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < half; x++) {
      const c = grid[y][x];
      grid[y][W - 1 - x] = c === "A" ? "B" : c;
    }
  }

  return {
    id: `tapakan-gen-${seed}`,
    mode: "tapakan",
    name: "BUBU DUDU SMASH",
    sub: "land on their head",
    rows: grid.map((r) => r.join("")),
  };
}

/**
 * A fresh arena, or the authored one if the dice refuse to cooperate.
 * validate() throws on anything unreachable, so failures are simply redrawn.
 */
export function makeArena(seed = (Math.random() * 1e9) | 0) {
  for (let i = 0; i < 40; i++) {
    try {
      return validate(buildArena((seed + i * 2654435761) | 0));
    } catch {
      /* unreachable tier or a bad spawn — draw another */
    }
  }
  return TAPAKAN[0];
}

export const ALL = { tapakan: TAPAKAN };

/** Pull the spawn points and power-up spots out of the tilemap. */
export function readLevel(level) {
  const out = { spawns: [], powerSpots: [] };
  level.rows.forEach((row, y) => {
    [...row].forEach((c, x) => {
      const p = { x: x + 0.5, y: y + 1 };
      if (c === "?") out.powerSpots.push({ x: x + 0.5, y: y + 0.6 });
      else if (c === "A") out.spawns[0] = p;
      else if (c === "B") out.spawns[1] = p;
    });
  });
  if (!out.spawns[0]) out.spawns[0] = { x: 2.5, y: 2 };
  if (!out.spawns[1]) out.spawns[1] = { x: 3.5, y: 2 };
  return out;
}

/** Tiles the physics should treat as solid. */
export function solidGrid(level) {
  const rows = level.rows.map((r) =>
    [...r]
      .map((c) => (c === "#" ? "#" : c === "=" ? "=" : c === "^" ? "^" : "."))
      .join("")
  );
  return { rows };
}
