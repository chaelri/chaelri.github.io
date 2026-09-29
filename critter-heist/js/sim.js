// The game itself — no DOM, no three.js. Only the HOST (and the headless
// self-test) runs it; a guest phone sends its stick and button presses and
// draws the snapshots that come back, so two phones never disagree about who
// stole what.

import { MATCH, WORLD, PLAYER, LOCK, RARITY, RARITY_IDS, RAINBOW, SPECIES, SPECIES_IDS, EVENTS } from "./config.js";

export const SIDES = [1, -1];
const B = WORLD.base;

/* ------------------------------------------------------------ geometry --- */
export const pedPos = (seat, i) => ({ x: WORLD.pedestals[i][0], z: WORLD.pedestals[i][1] * SIDES[seat] });
export const doorPos = (seat, inside) => ({ x: 0, z: SIDES[seat] * (B.near + (inside ? 0.9 : -0.9)) });
export function inBase(seat, x, z) {
  const zz = z * SIDES[seat];
  return Math.abs(x) < B.halfX && zz > B.near && zz < B.far;
}

// Walls as boxes {x0,x1,z0,z1}. The door gap is its own box, solid only for
// the other player while that base is locked.
function wallsFor(seat) {
  const s = SIDES[seat], t = B.wall;
  const zr = (a, b) => (s > 0 ? [a, b] : [-b, -a]);
  const box = (x0, x1, za, zb, door = false) => { const [z0, z1] = zr(za, zb); return { x0, x1, z0, z1, seat, door }; };
  return [
    box(-B.halfX - t, -B.door, B.near - t, B.near + t),
    box(B.door, B.halfX + t, B.near - t, B.near + t),
    box(-B.halfX - t, -B.halfX + t, B.near, B.far + t),
    box(B.halfX - t, B.halfX + t, B.near, B.far + t),
    box(-B.halfX - t, B.halfX + t, B.far - t, B.far + t),
    box(-B.door, B.door, B.near - t, B.near + t, true),
  ];
}
export const WALLS = [...wallsFor(0), ...wallsFor(1)];

function collide(s, p) {
  for (const w of WALLS) {
    // A locked door keeps the other player OUT; a thief already inside can
    // still run for it (trapping them made every lock a guaranteed catch).
    if (w.door && !(w.seat !== p.seat && s.players[w.seat].lockT > 0 && !inBase(w.seat, p.x, p.z))) continue;
    // circle vs box: push out along the shortest axis
    const cx = Math.max(w.x0, Math.min(p.x, w.x1)), cz = Math.max(w.z0, Math.min(p.z, w.z1));
    const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
    if (d >= PLAYER.radius) continue;
    if (d > 1e-4) { p.x = cx + (dx / d) * PLAYER.radius; p.z = cz + (dz / d) * PLAYER.radius; }
    else { // centre inside the box: out through the nearest face
      const opts = [[p.x - w.x0, -1, 0], [w.x1 - p.x, 1, 0], [p.z - w.z0, 0, -1], [w.z1 - p.z, 0, 1]].sort((a, b) => a[0] - b[0])[0];
      p.x += opts[1] * (opts[0] + PLAYER.radius); p.z += opts[2] * (opts[0] + PLAYER.radius);
    }
  }
  p.x = Math.max(-WORLD.halfX + PLAYER.radius, Math.min(WORLD.halfX - PLAYER.radius, p.x));
  p.z = Math.max(-WORLD.halfZ + PLAYER.radius, Math.min(WORLD.halfZ - PLAYER.radius, p.z));
}

/* --------------------------------------------------------------- critters --- */
export const worth = (c) => RARITY[c.rarity].price * (c.rainbow ? RAINBOW.price : 1);
export const earns = (c) => RARITY[c.rarity].income * (c.rainbow ? RAINBOW.income : 1);

function roll(golden) {
  const pool = RARITY_IDS.filter((r) => !golden || r !== "common");
  const total = pool.reduce((a, r) => a + RARITY[r].weight, 0);
  let x = Math.random() * total;
  for (const r of pool) { x -= RARITY[r].weight; if (x <= 0) return r; }
  return pool[0];
}
function newCritter(s, rarity) {
  return {
    id: s.nextId++, species: SPECIES_IDS[Math.floor(Math.random() * SPECIES_IDS.length)],
    rarity, rainbow: Math.random() < RAINBOW.chance,
    where: "parade", x: WORLD.parade.from, z: WORLD.parade.z, owner: -1, ped: -1, carrier: -1,
    home: null, guard: 0, held: 0,
  };
}

/* ------------------------------------------------------------------ match --- */
/** seats: [{ name, kind }] x2 */
export function newMatch(seats) {
  const s = {
    seats, t: 0, phase: "countdown", phaseT: 3, winner: null, events: [], nextId: 1,
    critters: [], paradeT: 0.3, event: null, eventAt: MATCH.events.slice(), eventsSeen: [], box: null,
    players: seats.map((seat, i) => ({
      seat: i, x: doorPos(i, true).x, z: SIDES[i] * (B.near + 2.2), vx: 0, vz: 0, face: SIDES[i] > 0 ? Math.PI : 0,
      coins: MATCH.startCoins, carry: -1, stun: 0, lockT: 0, lockCd: 0, pressA: 0, pressL: 0,
      stats: { bought: 0, stolen: 0, caught: 0, lost: 0 },
    })),
    peds: [Array(WORLD.pedestals.length).fill(-1), Array(WORLD.pedestals.length).fill(-1)],
  };
  // a few critters already walking so the parade isn't empty at the start
  for (let k = 0; k < 6; k++) { const c = newCritter(s, roll(false)); c.x = WORLD.parade.from + 3.2 + k * 3.3; s.critters.push(c); }
  return s;
}

const byId = (s, id) => s.critters.find((c) => c.id === id);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function baseValue(s, seat) {
  let v = Math.floor(s.players[seat].coins);
  for (const id of s.peds[seat]) if (id >= 0) v += worth(byId(s, id));
  return v;
}

/** What the action button would do right now for this player. */
export function actionFor(s, seat) {
  const p = s.players[seat], other = 1 - seat;
  if (s.phase !== "play" || p.stun > 0) return null;
  if (p.carry >= 0) {
    if (!inBase(seat, p.x, p.z)) return { kind: "carry", label: "Take it home" };
    // an empty pedestal in reach, else swap out the one in reach (sold for half)
    let best = -1, bd = PLAYER.reach, swap = -1, sd = PLAYER.reach;
    s.peds[seat].forEach((id, i) => {
      const d = dist(p, pedPos(seat, i));
      if (id < 0 && d < bd) { bd = d; best = i; }
      else if (id >= 0 && d < sd && byId(s, id).where === "pedestal") { sd = d; swap = i; }
    });
    if (best >= 0) return { kind: "place", label: "Place", ped: best };
    if (swap >= 0) return { kind: "place", label: `Swap +${Math.floor(worth(byId(s, s.peds[seat][swap])) / 2)}`, ped: swap, swap: true };
    return { kind: "carry", label: "Walk to a pedestal" };
  }
  if (s.box && dist(p, s.box) < PLAYER.reach) return { kind: "box", label: "Open!" };
  // parade: nearest critter in reach
  let pc = null, pd = PLAYER.reach;
  for (const c of s.critters) if (c.where === "parade") { const d = dist(p, c); if (d < pd) { pd = d; pc = c; } }
  if (pc) return p.coins >= worth(pc) ? { kind: "buy", label: `Buy ${worth(pc)}`, id: pc.id } : { kind: "poor", label: `Need ${worth(pc)}`, id: pc.id };
  // their pedestals: steal
  if (inBase(other, p.x, p.z)) {
    let best = -1, bd = PLAYER.reach;
    s.peds[other].forEach((id, i) => { if (id < 0) return; const d = dist(p, pedPos(other, i)); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) {
      const c = byId(s, s.peds[other][best]);
      return c.guard > 0 ? { kind: "guarded", label: "Too heavy!" } : { kind: "steal", label: "Steal!", ped: best };
    }
  }
  // your own pedestals: pick up to move it
  if (inBase(seat, p.x, p.z)) {
    let best = -1, bd = PLAYER.reach * 0.8;
    s.peds[seat].forEach((id, i) => { if (id < 0) return; const d = dist(p, pedPos(seat, i)); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) return { kind: "lift", label: "Pick up", ped: best };
  }
  return null;
}

function doAction(s, p) {
  const a = actionFor(s, p.seat);
  if (!a) return;
  const other = 1 - p.seat;
  if (a.kind === "buy") {
    const c = byId(s, a.id);
    p.coins -= worth(c);
    Object.assign(c, { where: "carried", carrier: p.seat, owner: p.seat, home: null });
    p.carry = c.id;
    p.stats.bought++;
    s.events.push({ type: "buy", seat: p.seat, id: c.id, rarity: c.rarity, rainbow: c.rainbow });
  } else if (a.kind === "place") {
    const c = byId(s, p.carry);
    if (a.swap) {
      // the critter already there is sold for half what it's worth
      const old = byId(s, s.peds[p.seat][a.ped]);
      p.coins += Math.floor(worth(old) / 2);
      old.where = "gone";
      s.events.push({ type: "sold", seat: p.seat, id: old.id, coins: Math.floor(worth(old) / 2) });
    }
    s.peds[p.seat][a.ped] = c.id;
    const stolen = c.home && c.home.seat !== p.seat;
    Object.assign(c, { where: "pedestal", carrier: -1, owner: p.seat, ped: a.ped, home: null, held: 0, guard: SPECIES[c.species].guard || 0 });
    const pp = pedPos(p.seat, a.ped); c.x = pp.x; c.z = pp.z;
    p.carry = -1;
    if (stolen) p.stats.stolen++;
    s.events.push({ type: "place", seat: p.seat, id: c.id, species: c.species, rarity: c.rarity, rainbow: c.rainbow, stolen });
  } else if (a.kind === "steal" || a.kind === "lift") {
    const from = a.kind === "steal" ? other : p.seat;
    const id = s.peds[from][a.ped];
    const c = byId(s, id);
    s.peds[from][a.ped] = -1;
    Object.assign(c, { where: "carried", carrier: p.seat, held: 0, home: { seat: from, ped: a.ped } });
    p.carry = c.id;
    if (a.kind === "steal") s.events.push({ type: "grab", seat: p.seat, id: c.id, rarity: c.rarity });
  } else if (a.kind === "box") {
    const c = newCritter(s, roll(true));
    if (Math.random() < 0.35) c.rarity = Math.random() < 0.5 ? "epic" : "legendary";
    s.critters.push(c);
    Object.assign(c, { where: "carried", carrier: p.seat, owner: p.seat, x: p.x, z: p.z });
    p.carry = c.id;
    s.box = null;
    s.events.push({ type: "box", seat: p.seat, id: c.id, rarity: c.rarity, rainbow: c.rainbow });
  }
}

/** A carried critter goes back where it came from (or back to the parade line if it had no home). */
function sendHome(s, c, why) {
  const carrier = s.players[c.carrier];
  if (carrier) carrier.carry = -1;
  c.carrier = -1;
  if (c.home && s.peds[c.home.seat][c.home.ped] < 0) {
    c.where = "returning";
    c.owner = c.home.seat;
    c.ped = c.home.ped;
    s.peds[c.home.seat][c.home.ped] = c.id; // reserved while it walks back
  } else if (c.home) {
    // its pedestal was filled meanwhile: any free one at home, else it's lost
    const free = s.peds[c.home.seat].indexOf(-1);
    if (free >= 0) { c.where = "returning"; c.owner = c.home.seat; c.ped = free; s.peds[c.home.seat][free] = c.id; }
    else c.where = "gone";
  }
  c.home = null;
  s.events.push({ type: why, id: c.id, seat: c.owner });
}

/* ------------------------------------------------------------------- step --- */
export function step(s, inputs, dt) {
  if (s.phase === "end") return;
  if (s.phase === "countdown") {
    s.players.forEach((p, i) => { const inp = inputs[i]; if (inp) { p.pressA = inp.a; p.pressL = inp.l; } });
    s.phaseT -= dt;
    if (s.phaseT <= 0) { s.phase = "play"; s.events.push({ type: "go" }); }
    return;
  }
  s.t += dt;

  // surprises
  if (s.eventAt.length && s.t >= s.eventAt[0]) {
    s.eventAt.shift();
    const pool = Object.keys(EVENTS).filter((e) => !s.eventsSeen.includes(e));
    const id = pool[Math.floor(Math.random() * pool.length)];
    s.eventsSeen.push(id);
    s.event = { id, until: s.t + MATCH.eventTime };
    if (id === "box") s.box = { x: (Math.random() - 0.5) * 8, z: WORLD.parade.z + (Math.random() < 0.5 ? 2.2 : -2.2) };
    if (id === "brownout") for (const p of s.players) p.lockT = 0;
    s.events.push({ type: "event", id });
  }
  if (s.event && s.t >= s.event.until) { s.event = null; if (s.box) s.box = null; }
  const ev = s.event?.id;

  // the parade
  s.paradeT -= dt;
  if (s.paradeT <= 0) { s.paradeT = WORLD.parade.every; s.critters.push(newCritter(s, roll(ev === "golden"))); }

  // players
  s.players.forEach((p, i) => {
    const inp = inputs[i] || { mx: 0, mz: 0, a: p.pressA, l: p.pressL };
    p.stun = Math.max(0, p.stun - dt);
    p.lockT = Math.max(0, p.lockT - dt);
    p.lockCd = Math.max(0, p.lockCd - dt);
    let mx = inp.mx || 0, mz = inp.mz || 0;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const carried = p.carry >= 0 ? byId(s, p.carry) : null;
    const slow = carried ? SPECIES[carried.species].carrySlow || PLAYER.carrySlow : 1;
    const top = p.stun > 0 ? 0 : PLAYER.speed * slow;
    const k = 1 - Math.exp(-(ev === "ulan" ? 2.2 : 14) * dt);
    p.vx += (mx * top - p.vx) * k;
    p.vz += (mz * top - p.vz) * k;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    if (Math.hypot(p.vx, p.vz) > 0.3) p.face = Math.atan2(p.vx, p.vz);
    collide(s, p);
    if (inp.a !== p.pressA) { p.pressA = inp.a; doAction(s, p); }
    if (inp.l !== p.pressL) {
      p.pressL = inp.l;
      if (p.lockCd <= 0 && ev !== "brownout") { p.lockT = LOCK.time; p.lockCd = LOCK.recharge; s.events.push({ type: "lock", seat: i }); }
    }
  });

  // catching thieves: the owner touches whoever is carrying their critter
  for (const p of s.players) {
    const c = p.carry >= 0 ? byId(s, p.carry) : null;
    if (!c || !c.home || c.home.seat === p.seat) continue;
    const owner = s.players[c.home.seat];
    c.held += dt;
    if (owner.stun <= 0 && dist(owner, p) < PLAYER.tagReach + PLAYER.radius) {
      p.stun = PLAYER.stun;
      p.stats.lost++;
      owner.stats.caught++;
      sendHome(s, c, "caught");
    } else if (SPECIES[c.species].escape && c.held >= SPECIES[c.species].escape) {
      sendHome(s, c, "escape");
    }
  }

  // critters: parade walkers, carried ones, ones walking home, income
  for (let i = s.critters.length - 1; i >= 0; i--) {
    const c = s.critters[i];
    if (c.where === "parade") {
      c.x += WORLD.parade.speed * dt;
      if (c.x > WORLD.parade.to) s.critters.splice(i, 1);
    } else if (c.where === "carried") {
      const p = s.players[c.carrier];
      c.x = p.x; c.z = p.z;
    } else if (c.where === "returning") {
      const t = pedPos(c.owner, c.ped), d = dist(c, t);
      if (d < 0.2) { c.where = "pedestal"; c.x = t.x; c.z = t.z; }
      else { const v = Math.min(d, 7 * dt); c.x += ((t.x - c.x) / d) * v; c.z += ((t.z - c.z) / d) * v; }
    } else if (c.where === "gone") {
      s.critters.splice(i, 1);
    } else if (c.where === "pedestal") {
      c.guard = Math.max(0, c.guard - dt);
    }
  }
  s.peds.forEach((row, seat) => row.forEach((id, i) => {
    if (id < 0) return;
    const c = byId(s, id);
    if (!c || c.where !== "pedestal") return;
    // capybara next door: +20% (left/right in a row, or front/back in a column)
    const col = i % 3, rowi = Math.floor(i / 3);
    const near = [[col - 1, rowi], [col + 1, rowi], [col, 1 - rowi]].filter(([cc]) => cc >= 0 && cc < 3).map(([cc, rr]) => row[rr * 3 + cc]);
    const boost = near.some((n) => n >= 0 && n !== id && byId(s, n)?.species === "capybara") ? 1 + SPECIES.capybara.boost : 1;
    s.players[seat].coins += earns(c) * boost * dt;
  }));

  if (s.t >= MATCH.time) {
    s.phase = "end";
    // anything still being carried goes home first, so a last-second grab doesn't count
    for (const p of s.players) { const c = p.carry >= 0 ? byId(s, p.carry) : null; if (c && c.home) sendHome(s, c, "caught"); }
    const v = [baseValue(s, 0), baseValue(s, 1)];
    s.winner = v[0] === v[1] ? null : v[0] > v[1] ? 0 : 1;
    s.events.push({ type: "end", winner: s.winner, values: v });
  }
}

/* -------------------------------------------------------------- network --- */
const r2 = (v) => Math.round(v * 100) / 100;
const WHERE = ["parade", "carried", "pedestal", "returning", "gone"];
export function snapshot(s) {
  return {
    k: "s", ph: s.phase, pt: r2(s.phaseT), t: r2(s.t), w: s.winner, ev: s.event?.id || null, box: s.box,
    seats: s.seats.map((x) => [x.name, x.kind]),
    p: s.players.map((p) => [r2(p.x), r2(p.z), r2(p.face), p.carry, Math.floor(p.coins), r2(p.stun), r2(p.lockT), r2(p.lockCd)]),
    c: s.critters.map((c) => [c.id, SPECIES_IDS.indexOf(c.species), RARITY_IDS.indexOf(c.rarity), c.rainbow ? 1 : 0, r2(c.x), r2(c.z), WHERE.indexOf(c.where), c.owner, c.ped, r2(c.guard), c.home ? c.home.seat : -1]),
    peds: s.peds,
    v: [baseValue(s, 0), baseValue(s, 1)],
  };
}
export const WHERE_IDS = WHERE;
