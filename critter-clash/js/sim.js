// The game itself — no DOM, no three.js. Only the HOST runs it (and the
// headless self-test); a guest phone sends its placement and draws the
// snapshots that come back.
//
//   PREP   each side puts its squad on its own 4x3 half of the board. The
//          other side's placement stays hidden until the fight.
//   FIGHT  the critters battle on their own, each doing its one job:
//          tank slams, striker hunts the weakest, shooter spits from range,
//          healer keeps whoever is hurt most alive.

import { TUNE, BOARD, CRITTERS, CRITTER_IDS } from "./config.js";

export const SIDES = [1, -1]; // seat 0 = host half at +z, seat 1 = the other at -z
export const CELLS = BOARD.cols * BOARD.rows;

export function cellPos(side, i) {
  const col = i % BOARD.cols, row = Math.floor(i / BOARD.cols);
  return { x: (col - (BOARD.cols - 1) / 2) * BOARD.cell, z: side * (BOARD.firstZ + row * BOARD.cell) };
}

/* ------------------------------------------------------------ placement --- */
// A sensible default so "Ready" works the moment prep opens: tank and
// striker up front, shooter and healer at the back.
const HOME = { yhon: [1, 2], hedgehog: [2, 1, 3, 0], axolotl: [9, 10, 8, 11], capybara: [10, 9, 5, 6] };
export function autoPlace(squad) {
  const taken = new Set(), out = {};
  for (const id of squad) {
    const cell = (HOME[id] || []).find((c) => !taken.has(c)) ?? [...Array(CELLS).keys()].find((c) => !taken.has(c));
    taken.add(cell);
    out[id] = cell;
  }
  return out;
}

/* ---------------------------------------------------------------- match --- */
/** seats: [{ name, kind, squad: [critter ids] }] x2 — squads the same size. */
export function newMatch(seats) {
  const s = { seats, round: 0, wins: [0, 0], events: [], matchWinner: null };
  startRound(s);
  return s;
}

function startRound(s) {
  s.round++;
  s.phase = "prep";
  s.phaseT = TUNE.prepTime;
  s.place = s.seats.map((seat) => (s.place && s.round > 1 ? s.place[s.seats.indexOf(seat)] : autoPlace(seat.squad)));
  s.ready = [false, false];
  s.roundWinner = null;
  s.units = [];
  s.shots = [];
  s.fightT = 0;
  s.events.push({ type: "round", round: s.round });
}

/** Put critter `id` on `cell`; whoever was there swaps into its old cell. */
export function place(s, seat, id, cell) {
  if (s.phase !== "prep" || s.ready[seat] || cell < 0 || cell >= CELLS) return false;
  const p = s.place[seat];
  if (!(id in p)) return false;
  const other = Object.keys(p).find((k) => p[k] === cell);
  if (other) p[other] = p[id];
  p[id] = cell;
  return true;
}
/** A guest's whole placement at once — checked, since it came over the wire. */
export function setPlacement(s, seat, map) {
  if (s.phase !== "prep" || !map || typeof map !== "object") return;
  const squad = s.seats[seat].squad, used = new Set(), next = {};
  for (const id of squad) {
    const c = map[id] | 0;
    if (c < 0 || c >= CELLS || used.has(c)) return;
    used.add(c);
    next[id] = c;
  }
  s.place[seat] = next;
}
export function setReady(s, seat) {
  if (s.phase === "prep") s.ready[seat] = true;
}

/* ---------------------------------------------------------------- fight --- */
function spawn(s) {
  s.units = [];
  s.seats.forEach((seat, si) => {
    for (const id of seat.squad) {
      const c = CRITTERS[id], p = cellPos(SIDES[si], s.place[si][id]);
      s.units.push({
        seat: si, id, x: p.x, z: p.z, hp: c.hp, max: c.hp, alive: true,
        cd: 0.3 + Math.random() * 0.4, healCd: 0.5, hits: 0, target: -1, retarget: 0,
        face: SIDES[si] > 0 ? Math.PI : 0, rush: id === "hedgehog" ? 1.0 : 0,
      });
    }
  });
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const jitter = () => 1 + (Math.random() * 2 - 1) * TUNE.jitter;

function hurt(s, u, amount, by) {
  if (!u.alive) return;
  u.hp -= amount;
  const idx = s.units.indexOf(u);
  s.events.push({ type: "hit", u: idx, by: s.units.indexOf(by), amount: Math.round(amount) });
  if (u.hp <= 0) {
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

function act(s, u, dt) {
  const c = CRITTERS[u.id];
  u.cd -= dt;
  u.healCd -= dt;
  u.rush = Math.max(0, u.rush - dt);
  const allies = s.units.filter((o) => o.alive && o.seat === u.seat && o !== u);
  const foes = s.units.filter((o) => o.alive && o.seat !== u.seat);
  if (!foes.length) return;

  // Healer: the most-hurt ally (or itself) comes first.
  if (c.heal) {
    const hurtOnes = [u, ...allies].filter((o) => o.hp / o.max < 0.88).sort((a, b) => a.hp / a.max - b.hp / b.max);
    const patient = hurtOnes[0];
    if (patient) {
      if (dist(u, patient) > c.heal.range) { moveToward(u, patient.x, patient.z, c.speed, c.heal.range * 0.9, dt); return; }
      if (u.healCd <= 0) {
        u.healCd = c.heal.cd;
        const amt = Math.min(patient.max - patient.hp, c.heal.amount * jitter());
        patient.hp += amt;
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
  const speed = c.speed * (u.rush > 0 ? 2.2 : 1);
  if (moveToward(u, t.x, t.z, speed, c.range * 0.95, dt)) return;
  u.face = Math.atan2(t.x - u.x, t.z - u.z);
  if (u.cd > 0) return;
  u.cd = c.cd;
  const ui = s.units.indexOf(u);

  if (c.shot) {
    s.shots.push({ x: u.x, z: u.z, t: u.target, seat: u.seat, from: ui, dmg: c.atk * jitter(), speed: c.shot });
    s.events.push({ type: "shoot", u: ui });
    return;
  }
  s.events.push({ type: "swing", u: ui });
  if (c.slam && ++u.hits % c.slam.every === 0) {
    s.events.push({ type: "slam", u: ui, x: u.x, z: u.z });
    for (const f of foes) {
      const d = dist(u, f);
      if (d > c.slam.radius) continue;
      hurt(s, f, c.atk * c.slam.mult * jitter(), u);
      // and a shove outward
      f.x += ((f.x - u.x) / (d || 1)) * 0.35;
      f.z += ((f.z - u.z) / (d || 1)) * 0.35;
    }
    return;
  }
  hurt(s, t, c.atk * jitter(), u);
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

/* ------------------------------------------------------------------ step --- */
export function step(s, dt) {
  if (s.phase === "matchEnd") return;
  if (s.phase === "prep") {
    s.phaseT -= dt;
    if (s.phaseT <= 0 || (s.ready[0] && s.ready[1])) {
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
    for (const u of s.units) if (u.alive) act(s, u, dt);
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

function endRound(s, winner, how) {
  s.phase = "roundEnd";
  s.phaseT = TUNE.roundEndPause;
  s.roundWinner = winner;
  if (winner !== null) {
    s.wins[winner]++;
    if (s.wins[winner] >= TUNE.winsNeeded) s.matchWinner = winner;
  }
  s.events.push({ type: "roundEnd", winner, how });
}

/* -------------------------------------------------------------- network --- */
const r2 = (v) => Math.round(v * 100) / 100;
/**
 * What the guest (seat 1) gets. During prep the host's placement is left out
 * — seeing it would hand the guest a free counter.
 */
export function snapshot(s) {
  return {
    k: "s", ph: s.phase, pt: r2(s.phaseT), rd: s.round, w: s.wins, rdy: s.ready, rw: s.roundWinner, mw: s.matchWinner,
    seats: s.seats.map((x) => [x.name, x.kind, x.squad]),
    u: s.phase === "prep" ? null : s.units.map((u) => [u.seat, CRITTER_IDS.indexOf(u.id), r2(u.x), r2(u.z), Math.round(u.hp), u.max, r2(u.face)]),
    sh: s.shots.map((sh) => [r2(sh.x), r2(sh.z), sh.seat]),
  };
}
