// The game itself — pure state in, state out, no DOM and no three.js.
//
// Only the HOST runs this. A guest phone sends its stick and button presses
// and draws whatever snapshot comes back, so the two screens can never
// disagree about who pushed whom off. The self-test runs it too, headless,
// to check that matches really land in the 3–5 minute window.

import { TUNE, CRITTERS, ABILITY } from "./config.js";

const SQ3 = Math.sqrt(3);

/* ---------------------------------------------------------------- arena --- */
// Pointy-top hexes in axial coordinates. A tile's ring is its distance from
// the centre tile; the island crumbles one ring at a time from the outside.
function buildTiles() {
  const R = TUNE.arenaRings, list = [];
  for (let q = -R; q <= R; q++) {
    for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) {
      const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
      list.push({ q, r, ring, x: TUNE.hex * SQ3 * (q + r / 2), z: TUNE.hex * 1.5 * r });
    }
  }
  return list;
}
export const TILES = buildTiles();
const INDEX = new Map(TILES.map((t, i) => [`${t.q},${t.r}`, i]));

/** Index of the tile under world point (x, z), or -1 over open air. */
export function tileAt(x, z) {
  const fq = ((SQ3 / 3) * x - z / 3) / TUNE.hex;
  const fr = ((2 / 3) * z) / TUNE.hex;
  const fs = -fq - fr;
  let q = Math.round(fq), r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  const i = INDEX.get(`${q},${r}`);
  return i === undefined ? -1 : i;
}

export const SOLID = 0, SHAKING = 1, GONE = 2;
export const solidAt = (s, x, z) => {
  const i = tileAt(x, z);
  return i >= 0 && s.tiles[i] !== GONE;
};

/* ---------------------------------------------------------------- match --- */
/**
 * seats: [{ critter, name, kind }] — kind is "host", "guest" or "bot".
 * Always four seats; empty ones are bots.
 */
export function newMatch(seats) {
  const s = {
    t: 0, matchT: 0, round: 0, phase: "countdown", phaseT: 0,
    tiles: new Uint8Array(TILES.length), shake: new Float32Array(TILES.length),
    wave: 0, waveT: 0,
    roundWinner: null, matchWinner: null,
    events: [],
    players: seats.map((seat, i) => ({
      idx: i, critter: seat.critter, name: seat.name, kind: seat.kind,
      wins: 0, kos: 0,
    })),
  };
  startRound(s);
  return s;
}

function startRound(s) {
  s.round++;
  s.phase = "countdown";
  s.phaseT = TUNE.countdown;
  s.tiles.fill(SOLID);
  s.shake.fill(0);
  s.wave = 0;
  s.waveT = s.matchT > TUNE.matchCap - 30 ? TUNE.firstWave / 2 : TUNE.firstWave;
  s.roundWinner = null;
  s.players.forEach((p, i) => {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    Object.assign(p, {
      x: Math.cos(a) * 4.3, z: Math.sin(a) * 4.3, y: 0,
      vx: 0, vz: 0, vy: 0,
      yaw: Math.atan2(-Math.cos(a), -Math.sin(a)), // facing the middle
      out: false, falling: false, stun: 0, immune: 0,
      dashT: 0, dashCd: 0.4, abil: null, abilT: 0, abilCd: 1.5,
      pressD: p.pressD ?? 0, pressA: p.pressA ?? 0,
      lastHit: null, fellAt: 0,
    });
  });
  s.events.push({ type: "round", round: s.round });
}

const massOf = (p) => {
  const m = CRITTERS[p.critter].mass;
  if (p.abil === "dive" && p.abilT > 0) return m * ABILITY.dive.mass;
  if (p.abil === "float" && p.abilT > 0) return m * ABILITY.float.mass;
  return m;
};
const alive = (p) => !p.out && !p.falling;

/** Advance the match by dt seconds. inputs[i] = { mx, mz, d, a } per seat. */
export function step(s, inputs, dt) {
  s.t += dt;
  if (s.phase === "matchEnd") return;

  if (s.phase === "countdown") {
    // Swallow presses made during the countdown so nobody starts with a
    // buffered dash.
    s.players.forEach((p, i) => { const inp = inputs[i]; if (inp) { p.pressD = inp.d; p.pressA = inp.a; } });
    s.phaseT -= dt;
    if (s.phaseT <= 0) { s.phase = "play"; s.events.push({ type: "go" }); }
    return;
  }

  if (s.phase === "play") {
    s.matchT += dt;
    arena(s, dt);
  }
  s.players.forEach((p, i) => move(s, p, inputs[i] || { mx: 0, mz: 0, d: p.pressD, a: p.pressA }, dt));
  collide(s);

  if (s.phase === "play") {
    const left = s.players.filter(alive);
    if (left.length <= 1) endRound(s, left[0] ?? null);
  } else if (s.phase === "roundEnd") {
    s.phaseT -= dt;
    if (s.phaseT <= 0) {
      if (s.matchWinner !== null) { s.phase = "matchEnd"; s.events.push({ type: "match", winner: s.matchWinner }); }
      else startRound(s);
    }
  }
}

function endRound(s, winner) {
  s.phase = "roundEnd";
  s.phaseT = TUNE.roundEndPause;
  s.roundWinner = winner ? winner.idx : null;
  if (winner) winner.wins++;
  // First to winsNeeded — or, once the clock is past the cap, whoever leads,
  // with knockouts breaking a tie. A tie used to mean "play another round",
  // which let a match run to nearly six minutes.
  const ranked = [...s.players].sort((x, y) => y.wins - x.wins || y.kos - x.kos);
  const best = ranked[0].wins;
  if (best >= TUNE.winsNeeded || (s.matchT >= TUNE.matchCap && best > 0)) s.matchWinner = ranked[0].idx;
  s.events.push({ type: "roundEnd", winner: s.roundWinner });
}

/* ------------------------------------------------------------- crumbling --- */
function arena(s, dt) {
  s.waveT -= dt;
  if (s.waveT <= 0 && s.wave <= TUNE.arenaRings) {
    const ring = TUNE.arenaRings - s.wave;
    TILES.forEach((t, i) => {
      if (t.ring === ring && s.tiles[i] === SOLID) {
        s.tiles[i] = SHAKING;
        s.shake[i] = TUNE.shakeTime + Math.random() * 0.7;
      }
    });
    // A few holes inside the ring as well, so the middle is never simply safe.
    const holes = TUNE.holesPerWave[s.wave] || 0;
    const inner = TILES.map((t, i) => i).filter((i) => TILES[i].ring > 0 && TILES[i].ring < ring && s.tiles[i] === SOLID);
    for (let k = 0; k < holes && inner.length; k++) {
      const i = inner.splice(Math.floor(Math.random() * inner.length), 1)[0];
      s.tiles[i] = SHAKING;
      s.shake[i] = TUNE.shakeTime + 0.4 + Math.random() * 0.6;
    }
    s.wave++;
    // Sudden death: the last half-minute before the cap crumbles twice as fast.
    s.waveT = s.matchT > TUNE.matchCap - 30 ? TUNE.waveEvery / 2 : TUNE.waveEvery;
    s.events.push({ type: "wave", wave: s.wave });
  }
  for (let i = 0; i < TILES.length; i++) {
    if (s.tiles[i] !== SHAKING) continue;
    s.shake[i] -= dt;
    if (s.shake[i] <= 0) s.tiles[i] = GONE;
  }
}

/* -------------------------------------------------------------- movement --- */
const angleTo = (from, to, maxStep) => {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return from + Math.max(-maxStep, Math.min(maxStep, d));
};

function move(s, p, inp, dt) {
  if (p.out) return;
  const c = CRITTERS[p.critter];

  if (p.falling) {
    p.vy -= TUNE.gravity * dt;
    p.y += p.vy * dt;
    p.x += p.vx * dt * 0.6;
    p.z += p.vz * dt * 0.6;
    if (p.y < TUNE.fallOut) p.out = true;
    return;
  }

  for (const k of ["dashCd", "abilCd", "stun", "dashT", "immune"]) p[k] = Math.max(0, p[k] - dt);
  if (p.abil !== "pound") p.abilT = Math.max(0, p.abilT - dt);

  const playing = s.phase === "play" || s.phase === "roundEnd";
  const dashPress = playing && inp.d !== p.pressD;
  const abilPress = playing && inp.a !== p.pressA;
  p.pressD = inp.d; p.pressA = inp.a;

  let mx = inp.mx || 0, mz = inp.mz || 0;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const steering = len > 0.18;

  const rolling = p.abil === "roll" && p.abilT > 0;
  const diving = p.abil === "dive" && p.abilT > 0;
  const airborne = p.y > 0 || p.vy > 0;

  if (rolling) {
    if (steering) p.yaw = angleTo(p.yaw, Math.atan2(mx, mz), ABILITY.roll.turn * dt);
    p.vx = Math.sin(p.yaw) * ABILITY.roll.speed;
    p.vz = Math.cos(p.yaw) * ABILITY.roll.speed;
  } else if (diving) {
    p.vx = Math.sin(p.yaw) * ABILITY.dive.speed;
    p.vz = Math.cos(p.yaw) * ABILITY.dive.speed;
  } else if (p.dashT > 0) {
    p.vx = Math.sin(p.yaw) * TUNE.dash.speed;
    p.vz = Math.cos(p.yaw) * TUNE.dash.speed;
  } else {
    if (steering && p.stun <= 0) p.yaw = angleTo(p.yaw, Math.atan2(mx, mz), 16 * dt);
    const top = TUNE.maxSpeed * c.speed;
    const rate = airborne ? TUNE.airControl : p.stun > 0 ? TUNE.stunControl : TUNE.control;
    const k = 1 - Math.exp(-rate * dt);
    p.vx += (mx * top - p.vx) * k;
    p.vz += (mz * top - p.vz) * k;
  }

  if (dashPress && p.dashCd <= 0 && !airborne && !rolling && !diving) {
    if (steering) p.yaw = Math.atan2(mx, mz);
    p.dashT = TUNE.dash.time;
    p.dashCd = TUNE.dash.cd * (c.dashCd || 1);
    s.events.push({ type: "dash", who: p.idx });
  }
  if (abilPress && p.abilCd <= 0 && !airborne && p.dashT <= 0 && !rolling && !diving) {
    if (steering) p.yaw = Math.atan2(mx, mz);
    p.abil = c.ability;
    p.abilCd = c.cd;
    if (c.ability === "pound") { p.vy = ABILITY.pound.jump; p.y = 0.001; p.abilT = 1; }
    else p.abilT = ABILITY[c.ability].time;
    s.events.push({ type: "ability", who: p.idx, ability: c.ability });
  }

  if (p.y > 0 || p.vy > 0) {
    p.vy -= TUNE.gravity * dt;
    p.y += p.vy * dt;
    if (p.y <= 0) {
      p.y = 0; p.vy = 0;
      if (p.abil === "pound") { pound(s, p); p.abil = null; p.abilT = 0; }
    }
  }
  if (p.abil && p.abil !== "pound" && p.abilT <= 0) p.abil = null;

  p.x += p.vx * dt;
  p.z += p.vz * dt;

  // Over open air with nothing holding you up: you fall. The capybara's
  // ring holds him up until it runs out.
  const floating = p.abil === "float" && p.abilT > 0;
  if (p.y <= 0 && !floating && !solidAt(s, p.x, p.z)) {
    p.falling = true;
    p.fellAt = s.t;
    p.vy = 0;
    const by = p.lastHit && s.t - p.lastHit.t < 3 ? p.lastHit.by : null;
    if (by !== null) s.players[by].kos++;
    s.events.push({ type: "fall", who: p.idx, by, how: by !== null ? p.lastHit.how : null });
  }
}

function pound(s, p) {
  const P = ABILITY.pound;
  s.events.push({ type: "pound", who: p.idx, x: p.x, z: p.z });
  for (const o of s.players) {
    if (o === p || !alive(o) || o.y > 0.4) continue;
    const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz);
    if (d > P.radius || d < 1e-4) continue;
    const power = (P.power * (1 - (d / P.radius) * 0.55)) / massOf(o);
    o.vx += (dx / d) * power;
    o.vz += (dz / d) * power;
    o.stun = Math.max(o.stun, P.stun);
    o.lastHit = { by: p.idx, t: s.t, how: "pound" };
  }
}

/* ------------------------------------------------------------- collision --- */
// What a critter hits with, if it is moving INTO the other one.
function attackPower(p) {
  if (p.abil === "roll" && p.abilT > 0) return ABILITY.roll.power;
  if (p.abil === "dive" && p.abilT > 0) return TUNE.bump.dash * 1.15;
  if (p.dashT > 0) return TUNE.bump.dash;
  return 0;
}

function collide(s) {
  const R2 = TUNE.radius * 2;
  const ps = s.players;
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j];
      if (!alive(a) || !alive(b) || Math.abs(a.y - b.y) > 0.8) continue;
      let dx = b.x - a.x, dz = b.z - a.z;
      let d = Math.hypot(dx, dz);
      if (d >= R2) continue;
      if (d < 1e-4) { dx = 1; dz = 0; d = 1e-4; }
      const nx = dx / d, nz = dz / d;
      const ma = massOf(a), mb = massOf(b);
      const over = R2 - d;
      a.x -= nx * over * (mb / (ma + mb)); a.z -= nz * over * (mb / (ma + mb));
      b.x += nx * over * (ma / (ma + mb)); b.z += nz * over * (ma / (ma + mb));

      // A power hit REPLACES the plain collision rather than stacking on it.
      // Both together turned a 15 u/s dash into ~18 u/s of knockback — five
      // tiles — and rounds lasted four seconds.
      const powered = (attackPower(a) && a.vx * nx + a.vz * nz > 1) || (attackPower(b) && -(b.vx * nx + b.vz * nz) > 1);
      const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (rel < 0 && !powered) {
        const jImp = (-(1 + TUNE.bump.restitution) * rel) / (1 / ma + 1 / mb);
        a.vx -= (nx * jImp) / ma; a.vz -= (nz * jImp) / ma;
        b.vx += (nx * jImp) / mb; b.vz += (nz * jImp) / mb;
      }

      // Power hits on top of the plain physics: a dash, a roll, a dive or the
      // swim ring sends the other one flying. `immune` stops one contact from
      // counting as a hit every frame it lasts.
      for (const [att, tgt, sx, sz] of [[a, b, nx, nz], [b, a, -nx, -nz]]) {
        if (tgt.immune > 0) continue;
        let power = attackPower(att);
        let how = att.abil && att.abilT > 0 ? att.abil : att.dashT > 0 ? "dash" : "walk";
        const into = att.vx * sx + att.vz * sz;
        if (power && into < 1) power = 0;
        if (!power) {
          // The hedgehog's quills: whoever walks into him bounces off.
          if (tgt.critter !== "hedgehog" && att.critter === "hedgehog" && -(tgt.vx * sx + tgt.vz * sz) > 1.5) { power = ABILITY.prickly; how = "prickly"; }
          // a plain walking shove, only if actually walking into them
          else if (into > 2) power = TUNE.bump.walk * (into / TUNE.maxSpeed);
          else continue;
        }
        if (tgt.abil === "dive" && tgt.abilT > 0) continue; // slippery
        // The swim ring is a COUNTER, not a weapon: a real hit on a floating
        // capybara bounces straight back at whoever threw it. (It used to
        // bounce anyone who so much as touched him, and it out-killed every
        // other move in the game.)
        if (tgt.abil === "float" && tgt.abilT > 0 && power > 5) {
          const back = Math.max(power * ABILITY.float.reflect, ABILITY.float.bounce);
          att.vx -= (sx * back) / massOf(att);
          att.vz -= (sz * back) / massOf(att);
          att.stun = Math.max(att.stun, TUNE.bump.stun);
          att.immune = 0.22;
          att.lastHit = { by: tgt.idx, t: s.t, how: "float" };
          if (att.dashT > 0) att.dashT = 0;
          if (att.abil === "roll" || att.abil === "dive") att.abilT = 0;
          s.events.push({ type: "bump", x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, power: back, by: tgt.idx, who: att.idx });
          continue;
        }
        if (tgt.abil === "float" && tgt.abilT > 0) continue;
        const m = massOf(tgt);
        tgt.vx += (sx * power) / m;
        tgt.vz += (sz * power) / m;
        tgt.stun = Math.max(tgt.stun, power > 6 ? TUNE.bump.stun : 0.15);
        tgt.immune = 0.22;
        tgt.lastHit = { by: att.idx, t: s.t, how };
        // Any committed move ends on impact. A roll or dive that ploughed on
        // through its target carried the hedgehog and axolotl out to the
        // edge after every hit, and they lost three rounds in four.
        if (att.dashT > 0 || ((att.abil === "roll" || att.abil === "dive") && att.abilT > 0)) {
          att.dashT = 0;
          if (att.abil === "roll" || att.abil === "dive") att.abilT = 0;
          att.vx *= 0.25; att.vz *= 0.25;
        }
        s.events.push({ type: "bump", x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, power, by: att.idx, who: tgt.idx });
      }
    }
  }
}

/* -------------------------------------------------------------- network --- */
// Compact snapshot for the guest: positions to 2 decimals, the tile states as
// one string, and whatever events happened since the last one.
const r2 = (v) => Math.round(v * 100) / 100;
export function snapshot(s) {
  return {
    k: "s",
    ph: s.phase, pt: r2(s.phaseT), rd: s.round, mt: Math.round(s.matchT), wv: s.wave,
    rw: s.roundWinner, mw: s.matchWinner,
    tl: Array.from(s.tiles).join(""),
    p: s.players.map((p) => [
      r2(p.x), r2(p.z), r2(p.y), r2(p.yaw),
      (p.out ? 1 : 0) | (p.falling ? 2 : 0) | (p.dashT > 0 ? 4 : 0) | (p.abil && (p.abilT > 0 || p.abil === "pound") ? 8 : 0) | (p.stun > 0 ? 16 : 0),
      r2(p.dashCd), r2(p.abilCd), p.wins, p.kos, p.critter, p.name, p.kind,
    ]),
    ev: s.events,
  };
}
