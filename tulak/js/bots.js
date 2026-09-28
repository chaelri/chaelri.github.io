// Bot brains. A bot produces the same { mx, mz, d, a } a thumb would, so the
// sim cannot tell it from a person — and neither can a guest phone.
//
// The whole strategy of the game in one line: get between your target and
// the middle, then shove outward. A bot circles to that inside spot, dashes
// only when the dash lands on solid ground, and runs for the middle when the
// tile under it starts to shake.

import { TUNE, CRITTERS, ABILITY } from "./config.js";
import { TILES, tileAt, solidAt, SHAKING, GONE } from "./sim.js";

export function newBrain(skill = 0.75) {
  return { think: 0, mx: 0, mz: 0, d: 0, a: 0, target: -1, retarget: 0, skill, wander: Math.random() * 6 };
}

const norm = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };

function danger(s, x, z) {
  const i = tileAt(x, z);
  if (i < 0 || s.tiles[i] === GONE) return 2;
  if (s.tiles[i] === SHAKING) return 1;
  // the outermost ring still standing is next to go
  return TILES[i].ring >= TUNE.arenaRings - s.wave ? 0.5 : 0;
}

export function botInput(s, i, b, dt) {
  const me = s.players[i];
  b.think -= dt;
  if (b.think > 0 || me.out || me.falling) return b;
  // Slower thinking for a less skilled bot — reaction time is most of what
  // makes one beatable.
  b.think = 0.09 + (1 - b.skill) * 0.14 + Math.random() * 0.05;

  const foes = s.players.filter((p) => p !== me && !p.out && !p.falling);
  if (!foes.length) { b.mx = -me.x * 0.2; b.mz = -me.z * 0.2; return b; }

  b.retarget -= b.think;
  if (b.retarget <= 0 || !foes.includes(s.players[b.target])) {
    // nearest, with a pull toward whoever is closest to the edge
    let best = null, bestScore = Infinity;
    for (const f of foes) {
      const score = Math.hypot(f.x - me.x, f.z - me.z) - Math.hypot(f.x, f.z) * 0.35;
      if (score < bestScore) { bestScore = score; best = f; }
    }
    b.target = best.idx;
    b.retarget = 1.5 + Math.random() * 2;
  }
  const t = s.players[b.target];

  const toT = norm(t.x - me.x, t.z - me.z);
  const dist = Math.hypot(t.x - me.x, t.z - me.z);
  const [ox, oz] = norm(t.x, t.z); // outward from the middle, through the target
  // The inside spot: just on the middle side of the target.
  const aimX = t.x - ox * 1.25, aimZ = t.z - oz * 1.25;
  const inside = (me.x - t.x) * -ox + (me.z - t.z) * -oz > 0.3; // am I on the middle side?

  let [mx, mz] = inside || dist < 1.6 ? toT : norm(aimX - me.x, aimZ - me.z);

  // Stay alive first. Look where I am and where I am heading.
  const here = danger(s, me.x, me.z);
  const ahead = danger(s, me.x + mx * 1.3, me.z + mz * 1.3);
  if (here >= 1 || ahead >= 1) {
    // head for the safest nearby solid tile, not just the centre, so a hole
    // punched in the middle does not swallow every bot at once
    let best = null, bestD = Infinity;
    for (let k = 0; k < TILES.length; k++) {
      if (s.tiles[k] !== 0) continue;
      const d = Math.hypot(TILES[k].x - me.x, TILES[k].z - me.z) + TILES[k].ring * 0.6;
      if (d < bestD) { bestD = d; best = TILES[k]; }
    }
    if (best) [mx, mz] = norm(best.x - me.x, best.z - me.z);
  } else if (here === 0.5) {
    const [cx, cz] = norm(-me.x, -me.z);
    mx = mx * 0.6 + cx * 0.4; mz = mz * 0.6 + cz * 0.4;
  }
  // a touch of wobble so bots do not move like rails
  b.wander += b.think * 2;
  mx += Math.sin(b.wander) * 0.15 * (1 - b.skill);
  mz += Math.cos(b.wander * 1.3) * 0.15 * (1 - b.skill);
  b.mx = mx; b.mz = mz;

  const faceDot = Math.sin(me.yaw) * toT[0] + Math.cos(me.yaw) * toT[1];
  const safeLanding = (len) => solidAt(s, me.x + toT[0] * len, me.z + toT[1] * len);
  const roll = Math.random() < b.skill;

  // Dash: close, lined up, and the dash will not carry me off the island.
  if (me.dashCd <= 0 && dist < 2.7 && faceDot > 0.9 && safeLanding(2.6) && here < 1 && roll) b.d++;

  // Ability, per critter.
  if (me.abilCd <= 0 && roll) {
    const ab = CRITTERS[me.critter].ability;
    const near = foes.filter((f) => Math.hypot(f.x - me.x, f.z - me.z) < ABILITY.pound.radius * 0.8).length;
    if (ab === "pound" && near >= 1 && here < 1) b.a++;
    else if (ab === "dive" && dist > 1.8 && dist < 6.5 && faceDot > 0.86 && safeLanding(dist + 1)) b.a++;
    else if (ab === "float" && (here >= 1 || (dist < 2.2 && (t.dashT > 0 || (t.abil && t.abilT > 0)) && Math.random() < 0.3))) b.a++;
    else if (ab === "roll" && dist > 1.5 && dist < 6 && faceDot > 0.9 && safeLanding(4)) b.a++;
  }
  return b;
}
