// The bot. It produces the same { mx, mz, a, l } a thumb would, so the sim
// cannot tell it apart and a guest's screen just sees another player.
//
// Priorities, re-decided a few times a second:
//   1. carrying something  -> take it home and put it on a free pedestal
//   2. a thief has my critter -> chase them down
//   3. they are coming for my base and my lock is ready -> lock the door
//   4. a mystery box is out -> go and open it
//   5. otherwise buy the best critter I can afford, or steal their best one
//      when their door is open and they are far from home

import { WORLD, PLAYER, SPECIES } from "./config.js";
import { SIDES, pedPos, doorPos, inBase, worth, actionFor } from "./sim.js";

export function newBrain(skill = 0.7) {
  return { skill, think: 0, goal: null, mx: 0, mz: 0, a: 0, l: 0, wander: Math.random() * 6 };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Route through the door: a straight line only works inside one region.
function route(me, seat, target) {
  const region = (x, z) => (inBase(0, x, z) ? 0 : inBase(1, x, z) ? 1 : -1);
  const a = region(me.x, me.z), b = region(target.x, target.z);
  if (a === b) return target;
  if (a >= 0) { const inner = doorPos(a, true); return Math.abs(me.x) < 0.8 && dist(me, inner) < 1.4 ? doorPos(a, false) : inner; }
  if (b >= 0) { const outer = doorPos(b, false); return Math.abs(me.x) < 0.8 && dist(me, outer) < 1.2 ? doorPos(b, true) : outer; }
  return target;
}

export function botInput(s, seat, b, dt) {
  const me = s.players[seat], them = s.players[1 - seat];
  b.think -= dt;
  if (b.think <= 0) {
    b.think = 0.12 + (1 - b.skill) * 0.25 + Math.random() * 0.08;
    b.lastThink = b.think;
    b.goal = decide(s, seat, b);
  }
  const g = b.goal;
  if (!g) { b.mx = 0; b.mz = 0; return b; }
  const wp = route(me, seat, g);
  const dx = wp.x - me.x, dz = wp.z - me.z, d = Math.hypot(dx, dz) || 1;
  b.mx = d > 0.25 ? dx / d : 0;
  b.mz = d > 0.25 ? dz / d : 0;
  // a little wobble so it doesn't move like it's on rails
  b.wander += dt * 3;
  b.mx += Math.sin(b.wander) * 0.12; b.mz += Math.cos(b.wander * 1.3) * 0.12;

  // press the button when the thing it wants is in reach
  const act = actionFor(s, seat);
  // ...and only the one it came for: pressing "place" beside the wrong
  // pedestal swapped out (and sold) a better critter
  if (act && g.press === act.kind && (act.kind !== "buy" || act.id === g.id) && (act.kind !== "place" || act.ped === g.ped)) b.a++;
  if (g.lock && me.lockCd <= 0) b.l++;
  return b;
}

function decide(s, seat, b) {
  const me = s.players[seat], them = s.players[1 - seat], other = 1 - seat;
  const byId = (id) => s.critters.find((c) => c.id === id);
  if (me.stun > 0) return null;

  // 1. bring whatever I'm holding home: an empty pedestal, else swap out my worst
  if (me.carry >= 0) {
    const free = s.peds[seat].map((id, i) => (id < 0 ? i : -1)).filter((i) => i >= 0);
    if (free.length) {
      const i = free.sort((a, c) => dist(me, pedPos(seat, a)) - dist(me, pedPos(seat, c)))[0];
      return { ...pedPos(seat, i), press: "place", ped: i };
    }
    const worst = worstPed(s, seat, byId);
    return { ...pedPos(seat, worst), press: "place", ped: worst };
  }
  // 2. chase a thief carrying my critter — once I've noticed. A bot that saw
  // every grab the instant it happened caught 9 thieves in 10.
  const theirs = them.carry >= 0 ? byId(them.carry) : null;
  const robbed = theirs && theirs.home && theirs.home.seat === seat;
  if (robbed) {
    b.noticed = (b.noticed ?? 0) + (b.lastThink || 0.15);
    if (b.noticed > 1.6 - b.skill) return { x: them.x, z: them.z };
  } else b.noticed = 0;
  // 3. lock up when they're heading for my door empty-handed
  const myDoor = doorPos(seat, false);
  if (me.lockCd <= 0 && them.carry < 0 && dist(them, myDoor) < 4.5 && s.event?.id !== "brownout" && Math.random() < b.skill)
    return { x: me.x, z: me.z, lock: true };
  // 4. mystery box
  if (s.box) return { ...s.box, press: "box" };

  // 5. buy or steal. With a full base, only things worth clearly more than my
  // worst critter are worth fetching (it gets swapped out and sold).
  const worst = worstPed(s, seat, byId);
  const floor = worst < 0 ? 0 : worth(byId(s.peds[seat][worst])) * 1.6;
  const free = true;
  const buyable = s.critters.filter((c) => c.where === "parade" && worth(c) <= me.coins && worth(c) > floor && c.x < WORLD.parade.to - 2.5);
  const best = buyable.sort((a, c) => worth(c) - worth(a))[0];
  const loot = s.peds[other].map((id, i) => ({ c: id >= 0 ? byId(id) : null, i })).filter((o) => o.c && o.c.where === "pedestal" && o.c.guard <= 0 && worth(o.c) > floor)
    .sort((a, c) => worth(c.c) - worth(a.c))[0];
  const theirDoorOpen = them.lockT <= 1;
  const lootWorth = loot ? worth(loot.c) : 0;
  // Steal when it's worth more than what I could buy, their door is open, and
  // they aren't standing guard. A greedier bot risks it with them closer.
  const bold = b.skill > 0.75 ? 3 : 5;
  const guarding = inBase(other, them.x, them.z) || dist(them, doorPos(other, false)) < bold;
  const stealing = free && loot && theirDoorOpen && (!guarding || inBase(other, me.x, me.z)) && (lootWorth >= (best ? worth(best) : 0) * 0.6 || !best);
  if (stealing) return { ...pedPos(other, loot.i), press: "steal" };
  if (free && best) {
    // meet it a little ahead of where it's walking
    return { x: Math.min(best.x + 1.2, WORLD.parade.to - 1), z: best.z + SIDES[seat] * 0.6, press: "buy", id: best.id };
  }
  // nothing to do: hang about in front of my own door
  return { x: (Math.random() - 0.5) * 3, z: SIDES[seat] * (WORLD.base.near - 2.5) };
}

/** The pedestal holding my least valuable critter, or -1 while any is empty. */
function worstPed(s, seat, byId) {
  if (s.peds[seat].includes(-1)) return -1;
  let w = 0, wv = Infinity;
  s.peds[seat].forEach((id, i) => { const c = byId(id); const v = c ? worth(c) : 0; if (v < wv) { wv = v; w = i; } });
  return w;
}
