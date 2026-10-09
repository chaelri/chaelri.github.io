// Battle simulation. Pure: no DOM, no three.js. The board steps it at 60 Hz.
import { R, CHESTS, SPAWNS, collide, solidAt } from "./map.js";

export const W = {
  fists:   { name: "Kamao",   melee: true, dmg: 14, range: 1.8, arc: 1.2, cd: 0.42, kb: 7, rarity: -1 },
  arnis:   { name: "Arnis",   melee: true, dmg: 27, range: 2.5, arc: 1.7, cd: 0.48, kb: 10, rarity: 1 },
  tirador: { name: "Tirador", dmg: 16, speed: 34, cd: 0.4, ammo: 20, life: 0.9, spread: 0.03, rarity: 0 },
  ripple:  { name: "Ripple",  dmg: 8, speed: 46, cd: 0.1, ammo: 48, life: 0.55, spread: 0.1, rarity: 1 },
  boga:    { name: "Boga",    dmg: 10, pellets: 6, speed: 40, cd: 0.85, ammo: 10, life: 0.3, spread: 0.3, kb: 2, rarity: 1 },
  paltik:  { name: "Paltik",  dmg: 62, speed: 95, cd: 1.3, ammo: 6, life: 0.9, spread: 0, rarity: 2 },
  bazooka: { name: "Bazooka", dmg: 46, splash: 3.6, speed: 24, cd: 1.6, ammo: 4, life: 1.8, kb: 15, rarity: 3 },
};
export const ITEMS = {
  buko:    { name: "Buko Juice", rarity: 0 },
  kalasag: { name: "Kalasag",    rarity: 1 },
  bomba:   { name: "Bomba",      rarity: 1 },
  shoes:   { name: "Rubber Shoes", rarity: 2 },
};
export const RARITY = ["common", "rare", "epic", "legendary"];
const LOOT = {          // what a chest can roll, by rarity tier
  0: ["tirador", "buko", "buko"],
  1: ["ripple", "boga", "arnis", "kalasag", "bomba"],
  2: ["paltik", "shoes", "boga"],
  3: ["bazooka"],
};
export const C = {
  speed: 7, hp: 100, shieldMax: 50, radius: 0.7, openTime: 0.7, pickRange: 1.7, chestRange: 2.0,
  ghostSpeed: 9, ghostCd: 5, ghostBomb: { dmg: 16, r: 2.6, fuse: 1.1 },
  bomb: { dmg: 42, r: 3.4, fuse: 1.0, throwDist: 9 },
  stormStart: 18, stormClose: 92, stormEnd: 112, stormDps: [5, 12],
  roundsToWin: 3, countdown: 3.2, roundEndPause: 4.5,
  ultMax: 100, orbGain: 25, orbCount: 7, orbRespawn: 8, dmgUlt: 0.3, crownBoost: 1.25,
  king: { hp: 480, speed: 4.2, radius: 1.5, spawn: [20, 30], slamR: 3.4, slamDmg: 24, windup: 0.7, cd: 1.5, kb: 15 },
};

// One ult per critter, charged by ult orbs on the map (and a little by dealing damage).
export const ULTS = {
  yhon:     { name: "Belly Flop",  desc: "Leap where you aim and slam down" },
  axolotl:  { name: "Tidal Wave",  desc: "Blast everything in front away" },
  capybara: { name: "Hot Spring",  desc: "Full heal + shield, scald nearby" },
  hedgehog: { name: "Spike Storm", desc: "Spikes in every direction" },
};

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createMatch(players, opts = {}) {
  const st = {
    t: 0, rand: rng(opts.seed || 1), phase: "countdown", phaseT: C.countdown, round: 1,
    players: players.map((p, i) => ({
      id: p.id, name: p.name, char: p.char, color: p.color, bot: !!p.bot, slot: i, wins: 0, kills: 0,
      input: { mx: 0, mz: 0, ax: 0, az: 0, l: 0, w: 0, u: 0, x: 0 }, edges: { w: 0, u: 0, l: 0, x: 0 },
    })),
    events: [], shots: [], loot: [], chests: [], bombs: [], storm: null, nextId: 1, winner: null, champion: null,
  };
  startRound(st);
  return st;
}

function ev(st, e) { st.events.push(e); }

function startRound(st) {
  const R_ = st.rand;
  st.shots = []; st.loot = []; st.bombs = [];
  st.chests = CHESTS.map(([x, z], i) => ({ i, x, z, open: false, prog: 0, gold: i === CHESTS.length - 1 }));
  // a few commons lying around so nobody starts empty-handed for long
  for (let k = 0; k < 10; k++) {
    const a = R_() * Math.PI * 2, r = 8 + R_() * 30;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (solidAt(x, z, 1)) continue;
    drop(st, x, z, R_() < 0.6 ? "tirador" : R_() < 0.5 ? "buko" : "ripple");
  }
  st.orbs = [];
  for (let k = 0; k < C.orbCount; k++) st.orbs.push(placeOrb(st, { id: st.nextId++, gone: 0 }));
  st.king = { alive: false, spawned: false, spawnAt: C.king.spawn[0] + R_() * (C.king.spawn[1] - C.king.spawn[0]) };
  const cx = (R_() - 0.5) * 22, cz = (R_() - 0.5) * 22;
  st.storm = { x: 0, z: 0, r: R + 8, fx: cx, fz: cz };
  const order = st.players.map((_, i) => i).sort(() => R_() - 0.5);
  st.players.forEach((p, i) => {
    if (p.pendingChar) { p.char = p.pendingChar; p.pendingChar = null; }   // critter picked mid-match
    const [sx, sz] = SPAWNS[order[i] % SPAWNS.length];
    Object.assign(p, {
      x: sx, z: sz, vx: 0, vz: 0, face: Math.atan2(-sx, -sz), hp: C.hp, shield: 0, alive: true, ghost: false,
      slots: [null, null], active: 0, item: null, cd: 0, fast: 0, opening: null, ghostCd: 2, hurtT: 0, moving: 0,
      ult: 0, crown: false, leap: null, slowT: 0, regenT: 0,
    });
  });
  st.phase = "countdown";
  st.phaseT = C.countdown;
  st.roundT = 0;
}

function placeOrb(st, o) {
  for (let tries = 0; tries < 40; tries++) {
    const a = st.rand() * Math.PI * 2, r = 4 + st.rand() * (R - 8);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (solidAt(x, z, 1)) continue;
    o.x = x; o.z = z; o.gone = 0;
    return o;
  }
  o.x = 0; o.z = 3; o.gone = 0;
  return o;
}

function drop(st, x, z, type, ammo) {
  const weapon = !!W[type];
  const it = {
    id: st.nextId++, kind: weapon ? "weapon" : "item", type, x, z, vx: 0, vz: 0,
    rarity: weapon ? W[type].rarity : ITEMS[type].rarity, ammo: weapon ? (ammo ?? W[type].ammo) : 1, age: 0,
  };
  st.loot.push(it);
  return it;
}

function rollTier(R_, gold) {
  if (gold) return R_() < 0.55 ? 3 : 2;
  const r = R_();
  return r < 0.42 ? 0 : r < 0.82 ? 1 : r < 0.97 ? 2 : 3;
}

function openChest(st, c, p) {
  c.open = true;
  const n = c.gold ? 3 : 2;
  for (let k = 0; k < n; k++) {
    const tier = rollTier(st.rand, c.gold && k === 0);
    const pool = LOOT[tier];
    const it = drop(st, c.x, c.z, pool[Math.floor(st.rand() * pool.length)]);
    const a = (k / n) * Math.PI * 2 + st.rand();
    it.vx = Math.cos(a) * 5; it.vz = Math.sin(a) * 5;   // pops out and slides
  }
  ev(st, { t: "chest", i: c.i, by: p.id, gold: c.gold });
}

export function weaponOf(p) {
  const s = p.slots[p.active];
  return s ? s : { type: "fists", ammo: Infinity };
}

function damage(st, p, dmg, by, w, x, z) {
  if (p.isKing) return damageKing(st, dmg, by, w);
  if (!p.alive || st.phase !== "fight" || p.leap) return;
  if (by && by.crown) dmg *= C.crownBoost;
  if (by && by !== p && by.alive && !by.isKing) by.ult = Math.min(C.ultMax, by.ult + dmg * C.dmgUlt);
  let left = dmg;
  if (p.shield > 0) { const s = Math.min(p.shield, left); p.shield -= s; left -= s; }
  p.hp -= left;
  p.hurtT = 0.25;
  ev(st, { t: "hit", p: p.id, by: by && by.id, dmg: Math.round(dmg), x: p.x, z: p.z, shield: left < dmg });
  if (p.hp <= 0) {
    p.hp = 0; p.alive = false; p.ghost = true; p.ghostCd = 3;
    // everything they carried spills out for the winner to loot
    for (const s of p.slots) if (s) drop(st, p.x + (st.rand() - 0.5) * 2, p.z + (st.rand() - 0.5) * 2, s.type, s.ammo);
    if (p.item) for (let k = 0; k < p.item.count; k++) drop(st, p.x + (st.rand() - 0.5) * 2, p.z + (st.rand() - 0.5) * 2, p.item.type);
    p.slots = [null, null]; p.item = null;
    if (by && by !== p && !by.isKing) by.kills++;
    ev(st, { t: "kill", p: p.id, by: by && by.id, w, x: p.x, z: p.z });
  }
}

function knock(p, fx, fz, kb) { p.vx += fx * kb; p.vz += fz * kb; }

function explode(st, x, z, r, dmg, by, w, kb = 10, exclude = null) {
  ev(st, { t: "boom", x, z, r });
  const k = st.king;
  if (k.alive && !(by && by.isKing) && Math.hypot(k.x - x, k.z - z) < r + C.king.radius) damageKing(st, dmg, by, w);
  for (const q of st.players) {
    if (!q.alive || q === exclude) continue;
    const d = Math.hypot(q.x - x, q.z - z);
    if (d > r) continue;
    const f = 1 - (d / r) * 0.6;
    damage(st, q, dmg * f, by, w, x, z);
    if (d > 0.01) knock(q, (q.x - x) / d, (q.z - z) / d, kb * f);
  }
}

// ---------------- the step ----------------
export function step(st, dt) {
  st.t += dt;
  if (st.phase === "countdown") {
    st.phaseT -= dt;
    if (st.phaseT <= 0) { st.phase = "fight"; ev(st, { t: "fight" }); }
    for (const p of st.players) { readEdges(p); p.face = Math.atan2(p.input.ax || p.input.mx || Math.sin(p.face), p.input.az || p.input.mz || Math.cos(p.face)); }
    return;
  }
  if (st.phase === "roundEnd") {
    st.phaseT -= dt;
    tickWorld(st, dt);
    for (const p of st.players) movePlayer(st, p, dt, true);
    if (st.phaseT <= 0) {
      if (st.champion) { st.phase = "matchEnd"; ev(st, { t: "match", winner: st.champion }); }
      else { st.round++; startRound(st); ev(st, { t: "round", n: st.round }); }
    }
    return;
  }
  if (st.phase === "matchEnd") { tickWorld(st, dt); return; }

  st.roundT += dt;
  storm(st, dt);
  kingStep(st, dt);
  for (const o of st.orbs) if (o.gone > 0 && (o.gone -= dt) <= 0) placeOrb(st, o);
  for (const p of st.players) {
    if (p.bot) think(st, p, dt);
    movePlayer(st, p, dt, false);
  }
  tickWorld(st, dt);
  const alive = st.players.filter((p) => p.alive);
  if (st.players.length > 1 && alive.length <= 1) endRound(st, alive[0] || null);
  else if (st.players.length === 1 && !alive.length) endRound(st, null);
}

function endRound(st, w) {
  st.phase = "roundEnd";
  st.phaseT = C.roundEndPause;
  st.winner = w ? w.id : null;
  if (w) {
    w.wins++;
    if (w.wins >= C.roundsToWin) st.champion = w.id;
  }
  ev(st, { t: "roundEnd", winner: st.winner });
}

function storm(st, dt) {
  const s = st.storm, t = st.roundT;
  const k = t < C.stormStart ? 0 : Math.min(1, (t - C.stormStart) / (C.stormClose - C.stormStart));
  const k2 = t < C.stormClose ? 0 : Math.min(1, (t - C.stormClose) / (C.stormEnd - C.stormClose));
  const ease = k * k * (3 - 2 * k);
  s.r = (R + 8) + (5 - (R + 8)) * ease - 5 * k2;
  s.x = s.fx * ease; s.z = s.fz * ease;
  s.closing = t >= C.stormStart && s.r > 0.01;
  s.next = t < C.stormStart ? C.stormStart - t : 0;
  if (t >= C.stormStart && st.stormWarned !== st.round) { st.stormWarned = st.round; ev(st, { t: "storm" }); }
  const dps = C.stormDps[0] + (C.stormDps[1] - C.stormDps[0]) * k;
  for (const p of st.players) {
    if (!p.alive) continue;
    p.inStorm = Math.hypot(p.x - s.x, p.z - s.z) > s.r;
    if (p.inStorm) {
      p.stormAcc = (p.stormAcc || 0) + dps * dt;
      if (p.stormAcc >= 1) { const d = Math.floor(p.stormAcc); p.stormAcc -= d; damage(st, p, d, null, "storm"); }
    }
  }
}

function readEdges(p) {
  const i = p.input, e = p.edges;
  const out = { swap: (i.w | 0) !== e.w, use: (i.u | 0) !== e.u, ult: (i.x | 0) !== (e.x | 0), loot: !e.l && !!i.l };   // loot: press only, not release
  e.w = i.w | 0; e.u = i.u | 0; e.l = i.l | 0; e.x = i.x | 0;
  return out;
}

function movePlayer(st, p, dt, frozen) {
  const inp = p.input;
  const edge = readEdges(p);
  // movement
  let mx = clamp(+inp.mx || 0, -1, 1), mz = clamp(+inp.mz || 0, -1, 1);
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  if (frozen) { mx = mz = 0; }
  if (p.ghost) {
    p.x += mx * C.ghostSpeed * dt; p.z += mz * C.ghostSpeed * dt;
    const d = Math.hypot(p.x, p.z);
    if (d > R + 4) { p.x *= (R + 4) / d; p.z *= (R + 4) / d; }
    p.ghostCd -= dt;
    const wantsBomb = edge.use || edge.loot || Math.hypot(inp.ax || 0, inp.az || 0) > 0.5;
    if (!frozen && st.phase === "fight" && wantsBomb && p.ghostCd <= 0) {
      p.ghostCd = C.ghostCd;
      st.bombs.push({ x: p.x, z: p.z, fuse: C.ghostBomb.fuse, r: C.ghostBomb.r, dmg: C.ghostBomb.dmg, by: p.id, w: "multo", ghost: true, y: 0 });
      ev(st, { t: "ghostbomb", p: p.id });
    }
    if (ml > 0.1) p.face = Math.atan2(mx, mz);
    return;
  }
  if (!p.alive) return;
  if (p.leap) { leapStep(st, p, dt); return; }
  if (p.regenT > 0) { p.regenT -= dt; p.hp = Math.min(C.hp, p.hp + 12 * dt); }
  p.slowT = Math.max(0, p.slowT - dt);
  const speed = C.speed * (p.fast > 0 ? 1.35 : 1) * (p.opening ? 0.35 : 1) * (p.slowT > 0 ? 0.55 : 1);
  p.x += (mx * speed + p.vx) * dt;
  p.z += (mz * speed + p.vz) * dt;
  const decay = Math.exp(-dt * 7);
  p.vx *= decay; p.vz *= decay;
  collide(p, C.radius);
  p.moving = ml > 0.1 ? Math.min(1, ml) : 0;
  p.cd -= dt; p.fast = Math.max(0, p.fast - dt); p.hurtT = Math.max(0, p.hurtT - dt);
  if (frozen) return;

  // aim: right stick, else face where you walk; a little aim assist
  const al = Math.hypot(inp.ax || 0, inp.az || 0);
  let aim = al > 0.2 ? Math.atan2(inp.ax, inp.az) : ml > 0.1 ? Math.atan2(mx, mz) : p.face;
  const w = weaponOf(p), spec = W[w.type];
  const reach = spec.melee ? spec.range + 1 : spec.speed * spec.life;
  let best = null, bestA = 0.22;
  for (const q of st.players) {
    if (q === p || !q.alive) continue;
    const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
    if (d > reach) continue;
    const da = Math.abs(wrap(Math.atan2(dx, dz) - aim));
    if (da < bestA) { bestA = da; best = q; }
  }
  if (best && al > 0.2) aim = Math.atan2(best.x - p.x, best.z - p.z);
  p.face = aim;

  // fire while the aim stick is pushed
  if (al > 0.45 && p.cd <= 0) fire(st, p);

  if (edge.swap) {
    p.active = 1 - p.active;
    p.cd = Math.max(p.cd, 0.15);
    ev(st, { t: "swap", p: p.id });
  }
  if (edge.use && p.item) useItem(st, p);
  if (edge.ult && p.ult >= C.ultMax && st.phase === "fight") ult(st, p);
  for (const o of st.orbs) {
    if (o.gone > 0 || Math.hypot(o.x - p.x, o.z - p.z) > 1.3) continue;
    o.gone = C.orbRespawn;
    p.ult = Math.min(C.ultMax, p.ult + C.orbGain);
    ev(st, { t: "orb", p: p.id, x: o.x, z: o.z, full: p.ult >= C.ultMax });
  }

  // loot: hold near a chest to open it; tap near loot to grab it
  let chest = null;
  for (const c of st.chests) if (!c.open && Math.hypot(c.x - p.x, c.z - p.z) < C.chestRange) chest = c;
  if (inp.l && chest) {
    if (p.opening !== chest) { p.opening = chest; chest.prog = 0; }
    chest.prog += dt;
    if (chest.prog >= C.openTime) { openChest(st, chest, p); p.opening = null; }
  } else {
    if (p.opening) p.opening.prog = 0;
    p.opening = null;
  }
  autoPickup(st, p);
  if (edge.loot && !chest) grab(st, p);
  p.near = chest ? "chest" : nearestLoot(st, p) ? "loot" : null;
}

function fire(st, p) {
  const w = weaponOf(p), spec = W[w.type];
  p.cd = spec.cd;
  const fx = Math.sin(p.face), fz = Math.cos(p.face);
  if (spec.melee) {
    ev(st, { t: "swing", p: p.id, w: w.type });
    for (const q of st.players) {
      if (q === p || !q.alive) continue;
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
      if (d > spec.range + C.radius) continue;
      if (Math.abs(wrap(Math.atan2(dx, dz) - p.face)) > spec.arc / 2 && d > 0.8) continue;
      damage(st, q, spec.dmg, p, w.type);
      knock(q, dx / (d || 1), dz / (d || 1), spec.kb);
    }
    const k = st.king;
    if (k.alive) {
      const dx = k.x - p.x, dz = k.z - p.z, d = Math.hypot(dx, dz);
      if (d < spec.range + C.king.radius && (Math.abs(wrap(Math.atan2(dx, dz) - p.face)) < spec.arc / 2 + 0.4 || d < 2)) damageKing(st, spec.dmg, p, w.type);
    }
    return;
  }
  const n = spec.pellets || 1;
  for (let k = 0; k < n; k++) {
    const a = p.face + (n > 1 ? (k / (n - 1) - 0.5) * spec.spread : (st.rand() - 0.5) * spec.spread);
    st.shots.push({ x: p.x + fx * 0.7, z: p.z + fz * 0.7, vx: Math.sin(a) * spec.speed, vz: Math.cos(a) * spec.speed,
      life: spec.life, dmg: spec.dmg, owner: p.id, w: w.type, splash: spec.splash || 0, kb: spec.kb || 2, id: st.nextId++ });
  }
  ev(st, { t: "shoot", p: p.id, w: w.type });
  w.ammo--;
  if (w.ammo <= 0) { p.slots[p.active] = null; ev(st, { t: "empty", p: p.id, w: w.type }); }
}

// ---------------- ults ----------------
function ult(st, p) {
  p.ult = 0;
  const fx = Math.sin(p.face), fz = Math.cos(p.face);
  ev(st, { t: "ult", p: p.id, char: p.char, x: p.x, z: p.z, face: p.face });
  if (p.char === "yhon") {
    p.leap = { sx: p.x, sz: p.z, tx: p.x + fx * 9, tz: p.z + fz * 9, t: 0, dur: 0.6 };
  } else if (p.char === "axolotl") {
    const hitOne = (q, dx, dz, d) => {
      damage(st, q, 30, p, "wave");
      if (!q.isKing) { knock(q, dx / (d || 1), dz / (d || 1), 24); q.slowT = 2; }
    };
    for (const q of [...st.players, st.king]) {
      if (q === p || !q.alive) continue;
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
      if (d < 10 && Math.abs(wrap(Math.atan2(dx, dz) - p.face)) < 0.75) hitOne(q, dx, dz, d);
    }
  } else if (p.char === "capybara") {
    p.hp = C.hp; p.shield = C.shieldMax; p.regenT = 4;
    for (const q of [...st.players, st.king]) {
      if (q === p || !q.alive) continue;
      if (Math.hypot(q.x - p.x, q.z - p.z) < 6) { damage(st, q, 14, p, "spring"); if (!q.isKing) q.slowT = 3; }
    }
  } else {
    for (let wave = 0; wave < 2; wave++) {
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2 + wave * 0.22;
        st.shots.push({ x: p.x + Math.sin(a) * 0.9, z: p.z + Math.cos(a) * 0.9, vx: Math.sin(a) * (30 - wave * 6), vz: Math.cos(a) * (30 - wave * 6),
          life: 0.7, dmg: 16, owner: p.id, w: "spike", splash: 0, kb: 5, id: st.nextId++ });
      }
    }
  }
}

function leapStep(st, p, dt) {
  const L = p.leap;
  L.t += dt;
  const f = Math.min(1, L.t / L.dur);
  p.x = L.sx + (L.tx - L.sx) * f; p.z = L.sz + (L.tz - L.sz) * f;
  p.y = Math.sin(f * Math.PI) * 4;
  if (f >= 1) {
    p.leap = null; p.y = 0;
    collide(p, C.radius);
    explode(st, p.x, p.z, 4.2, 46, p, "slam", 18, p);
    ev(st, { t: "slam", p: p.id, x: p.x, z: p.z });
  }
}

// ---------------- King Yhon ----------------
function kingStep(st, dt) {
  const k = st.king;
  if (!k.spawned) {
    if (st.roundT >= k.spawnAt && st.players.filter((p) => p.alive).length >= 1) {
      Object.assign(k, { spawned: true, alive: true, isKing: true, x: 0, z: 0, hp: C.king.hp, max: C.king.hp, face: 0, cd: 2, windup: 0, drop: 1.2, hurtT: 0, lastBy: null });
      ev(st, { t: "king" });
    }
    return;
  }
  if (!k.alive) return;
  k.hurtT = Math.max(0, k.hurtT - dt);
  if (k.drop > 0) { k.drop -= dt; if (k.drop <= 0) { ev(st, { t: "kingland", x: k.x, z: k.z }); explode(st, k.x, k.z, 3, 10, null, "king", 12); } return; }
  const alive = st.players.filter((p) => p.alive && !p.leap);
  const tgt = alive.sort((a, b) => Math.hypot(a.x - k.x, a.z - k.z) - Math.hypot(b.x - k.x, b.z - k.z))[0];
  k.cd -= dt;
  if (k.windup > 0) {
    k.windup -= dt;
    if (k.windup <= 0) {
      explode(st, k.x, k.z, C.king.slamR, C.king.slamDmg, k, "king", C.king.kb);
      ev(st, { t: "kingslam", x: k.x, z: k.z });
      k.cd = C.king.cd;
    }
    return;
  }
  if (!tgt) return;
  const dx = tgt.x - k.x, dz = tgt.z - k.z, d = Math.hypot(dx, dz);
  k.face = Math.atan2(dx, dz);
  if (d < C.king.slamR - 0.6 && k.cd <= 0) { k.windup = C.king.windup; ev(st, { t: "kingwind", x: k.x, z: k.z }); return; }
  k.x += (dx / d) * C.king.speed * dt; k.z += (dz / d) * C.king.speed * dt;
  collide(k, C.king.radius);
}

function damageKing(st, dmg, by, w) {
  const k = st.king;
  if (!k.alive || k.drop > 0 || st.phase !== "fight") return;
  if (by && by.crown) dmg *= C.crownBoost;
  k.hp -= dmg;
  k.hurtT = 0.2;
  if (by && !by.isKing) { k.lastBy = by.id; if (by.alive) by.ult = Math.min(C.ultMax, by.ult + dmg * C.dmgUlt); }
  ev(st, { t: "hit", p: "king", by: by && by.id, dmg: Math.round(dmg), x: k.x, z: k.z, king: true });
  if (k.hp <= 0) {
    k.hp = 0; k.alive = false;
    const slayer = st.players.find((p) => p.id === (by && !by.isKing ? by.id : k.lastBy));
    if (slayer && slayer.alive) slayer.crown = true;
    // the OP loot
    const prize = ["bazooka", "paltik", "kalasag", "shoes", "buko"];
    prize.forEach((t, i) => {
      const it = drop(st, k.x, k.z, t);
      const a = (i / prize.length) * Math.PI * 2;
      it.vx = Math.cos(a) * 7; it.vz = Math.sin(a) * 7;
    });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const o = { id: st.nextId++, gone: 0, x: k.x + Math.cos(a) * 3, z: k.z + Math.sin(a) * 3 };
      if (!solidAt(o.x, o.z, 0.5)) st.orbs.push(o);
    }
    ev(st, { t: "kingdown", by: slayer && slayer.id, x: k.x, z: k.z });
  }
}

function useItem(st, p) {
  const it = p.item;
  if (it.type === "buko") {
    if (p.hp >= C.hp) return;
    p.hp = Math.min(C.hp, p.hp + 40);
  } else if (it.type === "kalasag") {
    if (p.shield >= C.shieldMax) return;
    p.shield = Math.min(C.shieldMax, p.shield + 50);
  } else if (it.type === "shoes") {
    p.fast = 10;
  } else if (it.type === "bomba") {
    const d = C.bomb.throwDist;
    let tx = p.x + Math.sin(p.face) * d, tz = p.z + Math.cos(p.face) * d;
    st.bombs.push({ x: p.x, z: p.z, sx: p.x, sz: p.z, tx, tz, fly: 0.55, flyT: 0, fuse: C.bomb.fuse + 0.55, r: C.bomb.r, dmg: C.bomb.dmg, by: p.id, w: "bomba", y: 0 });
  }
  ev(st, { t: "use", p: p.id, item: it.type });
  if (--it.count <= 0) p.item = null;
}

function nearestLoot(st, p) {
  let best = null, bd = C.pickRange;
  for (const it of st.loot) {
    const d = Math.hypot(it.x - p.x, it.z - p.z);
    if (d < bd && it.age > 0.4) { bd = d; best = it; }
  }
  return best;
}

function take(st, p, it) {
  st.loot.splice(st.loot.indexOf(it), 1);
  ev(st, { t: "pickup", p: p.id, type: it.type, rarity: it.rarity });
}

// walking over loot: ammo for a gun you have, a stack of what you hold, an empty slot
function autoPickup(st, p) {
  for (const it of [...st.loot]) {
    if (it.age < 0.6 || Math.hypot(it.x - p.x, it.z - p.z) > 1.1) continue;
    if (it.kind === "weapon") {
      const same = p.slots.find((s) => s && s.type === it.type);
      if (same && !W[it.type].melee) { same.ammo += it.ammo; take(st, p, it); continue; }
      const free = p.slots.findIndex((s) => !s);
      if (free >= 0 && !same) { p.slots[free] = { type: it.type, ammo: W[it.type].melee ? Infinity : it.ammo }; if (!p.slots[p.active]) p.active = free; take(st, p, it); }
    } else if (!p.item) { p.item = { type: it.type, count: 1 }; take(st, p, it); }
    else if (p.item.type === it.type && p.item.count < 3) { p.item.count++; take(st, p, it); }
  }
}

// LOOT button on top of something: swap it into your hands, dropping what you held
function grab(st, p) {
  const it = nearestLoot(st, p);
  if (!it) return;
  if (it.kind === "weapon") {
    const old = p.slots[p.active];
    p.slots[p.active] = { type: it.type, ammo: W[it.type].melee ? Infinity : it.ammo };
    take(st, p, it);
    if (old) { const d = drop(st, p.x, p.z, old.type, old.ammo); d.age = 0; }
  } else {
    const old = p.item;
    p.item = { type: it.type, count: 1 };
    take(st, p, it);
    if (old) for (let k = 0; k < old.count; k++) drop(st, p.x, p.z, old.type);
  }
}

function tickWorld(st, dt) {
  for (const it of st.loot) {
    it.age += dt;
    if (it.vx || it.vz) {
      it.x += it.vx * dt; it.z += it.vz * dt;
      const f = Math.exp(-dt * 5); it.vx *= f; it.vz *= f;
      if (Math.abs(it.vx) + Math.abs(it.vz) < 0.05) it.vx = it.vz = 0;
      collide(it, 0.4);
    }
  }
  // bullets, sub-stepped so fast ones can't tunnel through a wall or a player
  for (const s of st.shots) {
    const sp = Math.hypot(s.vx, s.vz), n = Math.max(1, Math.ceil((sp * dt) / 0.4));
    for (let k = 0; k < n && s.life > 0; k++) {
      s.x += (s.vx * dt) / n; s.z += (s.vz * dt) / n;
      if (solidAt(s.x, s.z) || Math.hypot(s.x, s.z) > R + 6) { s.life = 0; impact(st, s); break; }
      const kg = st.king;
      if (kg.alive && (kg.x - s.x) ** 2 + (kg.z - s.z) ** 2 < (C.king.radius + 0.25) ** 2) {
        s.life = 0;
        if (s.splash) impact(st, s);
        else damageKing(st, s.dmg, st.players.find((o) => o.id === s.owner), s.w);
        break;
      }
      for (const q of st.players) {
        if (q.id === s.owner || !q.alive) continue;
        if ((q.x - s.x) ** 2 + (q.z - s.z) ** 2 < (C.radius + 0.25) ** 2) {
          s.life = 0;
          const by = st.players.find((o) => o.id === s.owner);
          if (s.splash) impact(st, s);
          else { damage(st, q, s.dmg, by, s.w); knock(q, s.vx / sp, s.vz / sp, s.kb); }
          break;
        }
      }
    }
    s.life -= dt;
    if (s.life <= 0 && s.splash && !s.blown) impact(st, s);
  }
  st.shots = st.shots.filter((s) => s.life > 0);
  // bombs
  for (const b of st.bombs) {
    if (b.flyT !== undefined && b.flyT < b.fly) {
      b.flyT += dt;
      const f = Math.min(1, b.flyT / b.fly);
      b.x = b.sx + (b.tx - b.sx) * f; b.z = b.sz + (b.tz - b.sz) * f;
      b.y = Math.sin(f * Math.PI) * 3;
      if (solidAt(b.x, b.z)) { b.tx = b.x; b.tz = b.z; b.flyT = b.fly; b.y = 0; }
    }
    b.fuse -= dt;
    if (b.fuse <= 0 && !b.done) {
      b.done = true;
      explode(st, b.x, b.z, b.r, b.dmg, st.players.find((o) => o.id === b.by), b.w, b.ghost ? 6 : 12);
    }
  }
  st.bombs = st.bombs.filter((b) => !b.done);
}

function impact(st, s) {
  if (!s.splash || s.blown) { ev(st, { t: "spark", x: s.x, z: s.z }); return; }
  s.blown = true;
  explode(st, s.x, s.z, s.splash, s.dmg, st.players.find((o) => o.id === s.owner), s.w, s.kb);
}

// ---------------- bots ----------------
function think(st, p, dt) {
  const inp = p.input;
  inp.ax = inp.az = 0; inp.mx = inp.mz = 0;
  if (p.ghost) {
    const tgt = st.players.filter((q) => q.alive).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (tgt) { const dx = tgt.x - p.x, dz = tgt.z - p.z, d = Math.hypot(dx, dz) || 1; inp.mx = dx / d; inp.mz = dz / d; if (d < 2) inp.u = (inp.u | 0) + 1; }
    return;
  }
  if (!p.alive) return;
  const s = st.storm;
  const goTo = (x, z) => { const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz) || 1; inp.mx = dx / d; inp.mz = dz / d; return d; };
  const armed = p.slots.some(Boolean);
  if (p.item && ((p.item.type === "buko" && p.hp < 55) || (p.item.type === "kalasag" && p.shield < 10) || p.item.type === "shoes")) inp.u = (inp.u | 0) + 1;
  // stay out of the storm
  if (Math.hypot(p.x - s.x, p.z - s.z) > s.r - 3) { goTo(s.x, s.z); }
  if (p.ult >= C.ultMax) {
    const near = st.players.some((q) => q !== p && q.alive && Math.hypot(q.x - p.x, q.z - p.z) < (p.char === "yhon" ? 9 : 7)) || (st.king.alive && Math.hypot(st.king.x - p.x, st.king.z - p.z) < 7);
    if (near || p.char === "capybara" && p.hp < 50) inp.x = (inp.x | 0) + 1;
  }
  const foes = st.players.filter((q) => q !== p && q.alive);
  if (st.king.alive && st.king.drop <= 0) foes.push(st.king);
  const foe = foes.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  const fd = foe ? Math.hypot(foe.x - p.x, foe.z - p.z) : Infinity;
  const w = W[weaponOf(p).type];
  const range = w.melee ? w.range : w.speed * w.life * 0.8;
  if (!p.slots[p.active] && p.slots[1 - p.active]) inp.w = (inp.w | 0) + 1;
  if (foe && (armed || fd < 6) && fd < 26) {
    if (fd > range * 0.8) goTo(foe.x, foe.z);
    else if (fd < range * 0.4 && !w.melee) { goTo(p.x * 2 - foe.x, p.z * 2 - foe.z); }
    else { inp.mx = Math.cos(st.t + p.slot) * 0.6; inp.mz = Math.sin(st.t * 1.3 + p.slot) * 0.6; }
    if (fd < range + 1) { const dx = foe.x - p.x, dz = foe.z - p.z; inp.ax = dx / fd; inp.az = dz / fd; }
    if (p.item && p.item.type === "bomba" && fd < 10 && fd > 4) { p.face = Math.atan2(foe.x - p.x, foe.z - p.z); inp.u = (inp.u | 0) + 1; }
  } else {
    // go loot: nearest unopened chest or item
    let best = null, bd = Infinity;
    for (const c of st.chests) if (!c.open) { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd) { bd = d; best = c; } }
    for (const it of st.loot) { const d = Math.hypot(it.x - p.x, it.z - p.z) + 4; if (d < bd) { bd = d; best = it; } }
    if (best) {
      const d = goTo(best.x, best.z);
      inp.l = best.i !== undefined && d < C.chestRange - 0.3 ? 1 : 0;
      if (best.kind && d < 1.2) inp.l = (inp.l ? 0 : 1);
    } else if (foe) goTo(foe.x, foe.z);
  }
  // unstick when walking into a wall
  p.botT = (p.botT || 0) + dt;
  if (p.botT > 0.5) {
    p.botT = 0;
    if (p.lastX !== undefined && Math.hypot(p.x - p.lastX, p.z - p.lastZ) < 0.4 && Math.hypot(inp.mx, inp.mz) > 0.5) p.unstick = 0.6;
    p.lastX = p.x; p.lastZ = p.z;
  }
  if (p.unstick > 0) { p.unstick -= dt; const a = Math.atan2(inp.mx, inp.mz) + 1.6; inp.mx = Math.sin(a); inp.mz = Math.cos(a); }
}
