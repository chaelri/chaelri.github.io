// The game itself — no DOM, no three.js. Only the HOST runs it (and the
// headless self-test); a guest phone sends its actions and draws the
// snapshots that come back.
//
//   PREP   coins in, three shop offers. Buy critters (a duplicate merges up a
//          star), buy snacks and feed them, place your squad on your half,
//          maybe PUSTA! to double the stakes. A random rule is in force.
//   FIGHT  the critters battle on their own; ultimates fire by themselves; the
//          last seconds are FRENZY. The loser loses 1 HP + the winner's
//          surviving stars (doubled per PUSTA). First to 0 HP loses the match.

import { TUNE, BOARD, CRITTERS, CRITTER_IDS, ULT, SHOP, STAR, SNACK_IDS, RULES, PUSTA } from "./config.js";

export const SIDES = [1, -1]; // seat 0 = host half at +z, seat 1 = the other at -z
export const CELLS = BOARD.cols * BOARD.rows;
const RULE_IDS = Object.keys(RULES);

export function cellPos(side, i) {
  const col = i % BOARD.cols, row = Math.floor(i / BOARD.cols);
  return { x: (col - (BOARD.cols - 1) / 2) * BOARD.cell, z: side * (BOARD.firstZ + row * BOARD.cell) };
}

// Where a newly bought critter lands: tank and striker up front, shooter and
// healer behind. The player can drag it anywhere after.
const HOME = { yhon: [1, 2, 0, 3], hedgehog: [2, 1, 3, 0], axolotl: [9, 10, 8, 11], capybara: [10, 9, 5, 6] };
function freeCell(board, id) {
  const taken = new Set(Object.values(board).map((b) => b.cell));
  return (HOME[id] || []).find((c) => !taken.has(c)) ?? [...Array(CELLS).keys()].find((c) => !taken.has(c));
}

/* ---------------------------------------------------------------- match --- */
/** seats: [{ name, kind, pool: [critter ids this player may buy] }] x2 */
export function newMatch(seats) {
  const s = {
    seats, round: 0, events: [], matchWinner: null,
    p: seats.map((seat) => ({ hp: TUNE.hp, coins: 0, shop: [], board: {}, hand: null, pusta: false, ready: false, pool: seat.pool })),
  };
  startRound(s);
  return s;
}

export const slotsFor = (round) => SHOP.slots[Math.min(round - 1, SHOP.slots.length - 1)];
export const price = (rule, kind) => Math.max(1, (kind === "critter" ? SHOP.critter : SHOP.snack) - (rule === "sale" ? 1 : 0));

function rollShop(s, p) {
  p.shop = Array.from({ length: SHOP.offers }, () => {
    const critter = Math.random() < SHOP.critterChance;
    const id = critter ? p.pool[Math.floor(Math.random() * p.pool.length)] : SNACK_IDS[Math.floor(Math.random() * SNACK_IDS.length)];
    return { kind: critter ? "critter" : "snack", id, sold: false };
  });
}

function startRound(s) {
  s.round++;
  s.phase = "prep";
  s.phaseT = TUNE.prepTime;
  s.rule = RULE_IDS[Math.floor(Math.random() * RULE_IDS.length)];
  s.slots = slotsFor(s.round);
  s.roundWinner = null;
  s.units = [];
  s.shots = [];
  s.fightT = 0;
  for (const p of s.p) {
    p.coins = s.round === 1 ? SHOP.start : Math.min(SHOP.maxCoins, p.coins + SHOP.income);
    p.pusta = false;
    p.ready = false;
    rollShop(s, p);
  }
  s.events.push({ type: "round", round: s.round, rule: s.rule });
}

/* -------------------------------------------------------------- actions --- */
// Every prep action goes through here, for the host, the bot and a guest's
// messages alike. Each returns true if it changed something.
export function act(s, seat, a) {
  const p = s.p[seat];
  if (s.phase !== "prep" || p.ready || !a) return false;
  switch (a.t) {
    case "buy": {
      const o = p.shop[a.i];
      if (!o || o.sold) return false;
      const cost = price(s.rule, o.kind);
      if (p.coins < cost) return false;
      if (o.kind === "critter") {
        const have = p.board[o.id];
        if (have) {
          if (have.star >= 3) return false;
          have.star++;
          s.events.push({ type: "merge", seat, id: o.id, star: have.star });
        } else {
          if (Object.keys(p.board).length >= s.slots) return false;
          p.board[o.id] = { cell: freeCell(p.board, o.id), star: 1, snacks: [] };
          s.events.push({ type: "bought", seat, id: o.id });
        }
      } else {
        if (p.hand) return false; // feed the one you are holding first
        p.hand = o.id;
      }
      p.coins -= cost;
      o.sold = true;
      return true;
    }
    case "reroll":
      if (p.coins < SHOP.reroll) return false;
      p.coins -= SHOP.reroll;
      rollShop(s, p);
      return true;
    case "feed": {
      const b = p.board[a.id];
      if (!p.hand || !b) return false;
      b.snacks.push(p.hand);
      s.events.push({ type: "fed", seat, id: a.id, snack: p.hand });
      p.hand = null;
      return true;
    }
    case "move": {
      const b = p.board[a.id], cell = a.cell | 0;
      if (!b || cell < 0 || cell >= CELLS) return false;
      const other = Object.keys(p.board).find((k) => p.board[k].cell === cell);
      if (other) p.board[other].cell = b.cell;
      b.cell = cell;
      return true;
    }
    case "pusta":
      if (p.pusta) return false;
      p.pusta = true;
      s.events.push({ type: "pusta", seat });
      return true;
    case "ready":
      if (!Object.keys(p.board).length) return false; // buy someone first
      p.ready = true;
      return true;
  }
  return false;
}

/* ---------------------------------------------------------------- fight --- */
function spawn(s) {
  s.units = [];
  s.p.forEach((p, si) => {
    // Nobody bought anything by the whistle: a free starter so there is a fight.
    if (!Object.keys(p.board).length) p.board[p.pool[0]] = { cell: freeCell(p.board, p.pool[0]), star: 1, snacks: [] };
    for (const [id, b] of Object.entries(p.board)) {
      const c = CRITTERS[id], pos = cellPos(SIDES[si], b.cell);
      const n = (k) => b.snacks.filter((x) => x === k).length;
      let hp = c.hp * STAR.mult[b.star - 1] * (1 + 0.4 * n("halohalo"));
      if (s.rule === "merienda") hp *= 1.25;
      let atk = c.atk * STAR.mult[b.star - 1] * (1 + 0.35 * n("turon"));
      if (s.rule === "ulan" && id === "axolotl") atk *= 1.5;
      s.units.push({
        seat: si, id, star: b.star, snacks: b.snacks.slice(), x: pos.x, z: pos.z, hp, max: hp, atk,
        range: c.range * (s.rule === "brownout" && c.shot ? 0.5 : 1),
        ultRate: (1 + 0.6 * n("taho")) * (s.rule === "fiesta" ? 2 : 1),
        crits: 2 * n("calamansi"), revives: n("balut"),
        alive: true, cd: 0.3 + Math.random() * 0.4, healCd: 0.5, hits: 0, target: -1, retarget: 0,
        face: SIDES[si] > 0 ? Math.PI : 0, rush: id === "hedgehog" ? 1.0 : 0,
        slow: s.rule === "traffic" ? 4 : 0, ult: 0, stun: 0, shield: 0,
      });
    }
  });
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const jitter = () => 1 + (Math.random() * 2 - 1) * TUNE.jitter;
const charge = (u, n) => { if (u && u.alive) u.ult = Math.min(ULT.full, u.ult + n * u.ultRate); };

function hurt(s, u, amount, by) {
  if (!u.alive) return;
  if (u.shield > 0) amount *= 0.5;
  if (by && by.crits > 0) { by.crits--; amount *= 3; s.events.push({ type: "crit", u: s.units.indexOf(u) }); }
  u.hp -= amount;
  charge(u, amount * ULT.taken);
  charge(by, amount * ULT.dealt);
  const idx = s.units.indexOf(u);
  s.events.push({ type: "hit", u: idx, by: s.units.indexOf(by), amount: Math.round(amount) });
  if (u.hp <= 0) {
    if (u.revives > 0) {
      u.revives--;
      u.hp = u.max * 0.4;
      s.events.push({ type: "revive", u: idx });
      return;
    }
    u.hp = 0;
    u.alive = false;
    s.events.push({ type: "ko", u: idx, by: s.units.indexOf(by) });
  }
}

function moveToward(u, tx, tz, speed, stopAt, dt) {
  const dx = tx - u.x, dz = tz - u.z, d = Math.hypot(dx, dz);
  if (d <= stopAt) return false;
  const step = Math.min(d - stopAt, speed * dt);
  u.x += (dx / d) * step;
  u.z += (dz / d) * step;
  u.face = Math.atan2(dx, dz);
  return true;
}

function think(s, u, dt, frenzy) {
  const c = CRITTERS[u.id];
  u.cd -= dt * (frenzy ? 2 : 1);
  u.healCd -= dt * (frenzy ? 2 : 1);
  u.rush = Math.max(0, u.rush - dt);
  u.shield = Math.max(0, u.shield - dt);
  u.slow = Math.max(0, u.slow - dt);
  if (u.stun > 0) { u.stun -= dt; return; } // dizzy from a belly flop
  const allies = s.units.filter((o) => o.alive && o.seat === u.seat && o !== u);
  const foes = s.units.filter((o) => o.alive && o.seat !== u.seat);
  if (!foes.length) return;
  const speed = c.speed * (u.rush > 0 ? 2.2 : 1) * (u.slow > 0 ? 0.35 : 1);

  // Healer: the most-hurt ally (or itself) comes first.
  if (c.heal) {
    const patient = [u, ...allies].filter((o) => o.hp / o.max < 0.88).sort((a, b) => a.hp / a.max - b.hp / b.max)[0];
    if (patient) {
      if (dist(u, patient) > c.heal.range) { moveToward(u, patient.x, patient.z, speed, c.heal.range * 0.9, dt); return; }
      if (u.healCd <= 0) {
        u.healCd = c.heal.cd;
        const amt = Math.min(patient.max - patient.hp, c.heal.amount * STAR.mult[u.star - 1] * jitter());
        patient.hp += amt;
        charge(u, amt * ULT.healed);
        s.events.push({ type: "heal", u: s.units.indexOf(u), to: s.units.indexOf(patient), amount: Math.round(amt) });
      }
      if (patient !== u) u.face = Math.atan2(patient.x - u.x, patient.z - u.z);
      return;
    }
  }

  // Who to hit: the striker hunts the weakest, everyone else the nearest.
  u.retarget -= dt;
  let t = s.units[u.target];
  if (!t || !t.alive || u.retarget <= 0) {
    t = u.id === "hedgehog" ? foes.reduce((a, b) => (b.hp < a.hp ? b : a)) : foes.reduce((a, b) => (dist(u, b) < dist(u, a) ? b : a));
    u.target = s.units.indexOf(t);
    u.retarget = 0.8;
  }
  if (moveToward(u, t.x, t.z, speed, u.range * 0.95, dt)) return;
  u.face = Math.atan2(t.x - u.x, t.z - u.z);
  if (u.cd > 0) return;
  u.cd = c.cd;
  const ui = s.units.indexOf(u);

  if (c.shot) {
    s.shots.push({ x: u.x, z: u.z, t: u.target, seat: u.seat, from: ui, dmg: u.atk * jitter(), speed: c.shot });
    s.events.push({ type: "shoot", u: ui });
    return;
  }
  s.events.push({ type: "swing", u: ui });
  if (c.slam && ++u.hits % c.slam.every === 0) {
    s.events.push({ type: "slam", u: ui, x: u.x, z: u.z });
    for (const f of foes) {
      const d = dist(u, f);
      if (d > c.slam.radius) continue;
      hurt(s, f, u.atk * c.slam.mult * jitter(), u);
      f.x += ((f.x - u.x) / (d || 1)) * 0.35;
      f.z += ((f.z - u.z) / (d || 1)) * 0.35;
    }
    return;
  }
  hurt(s, t, u.atk * jitter(), u);
}

function separate(s) {
  const R = TUNE.radius * 2 * 0.9;
  const live = s.units.filter((u) => u.alive);
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1e-3;
      if (d >= R) continue;
      const push = (R - d) / 2;
      a.x -= (dx / d) * push; a.z -= (dz / d) * push;
      b.x += (dx / d) * push; b.z += (dz / d) * push;
    }
  }
  for (const u of live) {
    u.x = Math.max(-3.6, Math.min(3.6, u.x));
    u.z = Math.max(-6.2, Math.min(6.2, u.z));
  }
}

function flyShots(s, dt) {
  for (let i = s.shots.length - 1; i >= 0; i--) {
    const sh = s.shots[i], t = s.units[sh.t];
    if (!t || !t.alive) { s.shots.splice(i, 1); continue; }
    const dx = t.x - sh.x, dz = t.z - sh.z, d = Math.hypot(dx, dz);
    if (d < 0.35) { hurt(s, t, sh.dmg, s.units[sh.from]); s.shots.splice(i, 1); continue; }
    sh.x += (dx / d) * sh.speed * dt;
    sh.z += (dz / d) * sh.speed * dt;
  }
}

/* ------------------------------------------------------------ ultimates --- */
/** Fire critter `id`'s ultimate for `seat`, if its gauge is full (autoUlts calls this). */
export function ultimate(s, seat, id) {
  if (s.phase !== "fight") return false;
  const u = s.units.find((o) => o.seat === seat && o.id === id && o.alive);
  if (!u || u.ult < ULT.full) return false;
  u.ult = 0;
  const ui = s.units.indexOf(u);
  const foes = s.units.filter((o) => o.alive && o.seat !== seat);
  const allies = s.units.filter((o) => o.alive && o.seat === seat);
  const U = ULT[id], k = STAR.mult[u.star - 1];
  if (id === "yhon") {
    // leap onto whichever enemy has the most friends around it
    const spot = foes.reduce((best, f) => {
      const n = foes.filter((o) => dist(o, f) < U.radius).length;
      return !best || n > best.n ? { f, n } : best;
    }, null);
    if (spot) {
      const from = { x: u.x, z: u.z };
      u.x = spot.f.x + (u.x > spot.f.x ? 0.6 : -0.6);
      u.z = spot.f.z + (u.z > spot.f.z ? 0.6 : -0.6);
      s.events.push({ type: "ult", u: ui, id, x: u.x, z: u.z, fx: from.x, fz: from.z });
      for (const f of foes) if (dist(u, f) < U.radius) { hurt(s, f, U.dmg * k * jitter(), u); f.stun = U.stun; }
    }
  } else if (id === "hedgehog") {
    s.events.push({ type: "ult", u: ui, id, targets: foes.map((f) => s.units.indexOf(f)) });
    for (const f of foes) hurt(s, f, U.dmg * k * jitter(), u);
  } else if (id === "axolotl") {
    s.events.push({ type: "ult", u: ui, id, x: u.x, z: u.z });
    const back = -Math.sign(SIDES[seat]); // toward the enemy's own end
    for (const f of foes) { hurt(s, f, U.dmg * k * jitter(), u); f.z += back * U.push; }
  } else if (id === "capybara") {
    s.events.push({ type: "ult", u: ui, id, targets: allies.map((a) => s.units.indexOf(a)) });
    for (const a of allies) { a.hp = Math.min(a.max, a.hp + U.heal * k); a.shield = U.shield; }
  }
  return true;
}

// Full gauges fire on their own. The healer holds hers until a teammate is
// below 55% — a full-HP squad healing itself would waste it.
function autoUlts(s) {
  for (const u of s.units) {
    if (!u.alive || u.ult < ULT.full) continue;
    if (u.id === "capybara" && !s.units.some((o) => o.alive && o.seat === u.seat && o.hp / o.max < 0.55)) continue;
    ultimate(s, u.seat, u.id);
  }
}

/* ------------------------------------------------------------------ step --- */
export function step(s, dt) {
  if (s.phase === "matchEnd") return;
  if (s.phase === "prep") {
    s.phaseT -= dt;
    if (s.phaseT <= 0 || (s.p[0].ready && s.p[1].ready)) {
      spawn(s);
      s.phase = "fight";
      s.phaseT = TUNE.fightTime;
      s.events.push({ type: "fight" });
    }
    return;
  }
  if (s.phase === "fight") {
    s.fightT += dt;
    s.phaseT -= dt;
    const frenzy = s.phaseT <= TUNE.frenzy;
    if (frenzy && s.phaseT + dt > TUNE.frenzy) s.events.push({ type: "frenzy" });
    for (const u of s.units) if (u.alive) think(s, u, dt, frenzy);
    autoUlts(s);
    separate(s);
    flyShots(s, dt);
    const left = [0, 1].map((si) => s.units.filter((u) => u.alive && u.seat === si).length);
    if (!left[0] || !left[1]) endRound(s, left[0] === left[1] ? null : left[0] ? 0 : 1, "ko");
    else if (s.phaseT <= 0) {
      // Time: the side with more of its total HP left takes it.
      const share = [0, 1].map((si) => {
        const us = s.units.filter((u) => u.seat === si);
        return us.reduce((a, u) => a + u.hp, 0) / us.reduce((a, u) => a + u.max, 0);
      });
      endRound(s, Math.abs(share[0] - share[1]) < 0.01 ? null : share[0] > share[1] ? 0 : 1, "time");
    }
  } else if (s.phase === "roundEnd") {
    s.phaseT -= dt;
    flyShots(s, dt);
    if (s.phaseT <= 0) {
      if (s.matchWinner !== null) { s.phase = "matchEnd"; s.events.push({ type: "match", winner: s.matchWinner }); }
      else startRound(s);
    }
  }
}

export const stakes = (s) => (s.p[0].pusta ? PUSTA : 1) * (s.p[1].pusta ? PUSTA : 1);

function endRound(s, winner, how) {
  s.phase = "roundEnd";
  s.phaseT = TUNE.roundEndPause;
  s.roundWinner = winner;
  const mult = stakes(s);
  let dmg;
  if (winner === null) {
    dmg = mult;
    for (const p of s.p) p.hp -= dmg;
  } else {
    const stars = s.units.filter((u) => u.alive && u.seat === winner).reduce((a, u) => a + u.star, 0);
    dmg = (1 + stars) * mult;
    s.p[1 - winner].hp -= dmg;
  }
  s.events.push({ type: "roundEnd", winner, how, dmg });
  const [a, b] = s.p.map((p) => p.hp);
  if (a <= 0 || b <= 0 || s.round >= TUNE.maxRounds) s.matchWinner = a === b ? (winner ?? 0) : a > b ? 0 : 1;
}

/* -------------------------------------------------------------- network --- */
const r2 = (v) => Math.round(v * 100) / 100;
/**
 * What the guest (seat 1) gets: its own shop, coins, board and hand in full;
 * of the host only what the guest could see across the table. The host's
 * board stays hidden until the fight.
 */
export function snapshot(s, ack) {
  const me = s.p[1], them = s.p[0];
  return {
    k: "s", ph: s.phase, pt: r2(s.phaseT), rd: s.round, rule: s.rule, slots: s.slots, rw: s.roundWinner, mw: s.matchWinner, ack,
    seats: s.seats.map((x) => [x.name, x.kind]),
    me: { hp: me.hp, coins: me.coins, shop: me.shop, board: me.board, hand: me.hand, pusta: me.pusta, ready: me.ready },
    them: { hp: them.hp, pusta: them.pusta, ready: them.ready },
    u: s.phase === "prep" ? null : s.units.map((u) => [u.seat, CRITTER_IDS.indexOf(u.id), r2(u.x), r2(u.z), Math.round(u.hp), Math.round(u.max), r2(u.face), Math.floor(u.ult), u.stun > 0 ? 1 : 0, u.shield > 0 ? 1 : 0, u.star]),
    sh: s.shots.map((sh) => [r2(sh.x), r2(sh.z), sh.seat]),
  };
}
