// Race simulation. Pure: no DOM, no three.js. The board steps it at a fixed
// 60 Hz with each racer's latest input; render.js only reads from it.
import { HALF, CURB, WALL, LAPS, nearest, frame, pointAt, groundAt } from "./track.js";

export const C = {
  maxSpeed: 29, accel: 15, brake: 32, reverseMax: 9, coast: 5,
  turn: 2.15, offroadMax: 0.48, offroadDrag: 18,
  boostMax: 1.42, boostAccel: 46,
  driftMin: 11, driftCharge: [0.9, 1.9, 3.0], driftBoost: [0.75, 1.25, 1.85],
  coinBonus: 0.006, coinsMax: 10,
  spin: 1.35, safe: 1.6, star: 7.5, shrink: 4,
  radius: 1.25,
  green: 50, red: 46, shellLife: 7, redLife: 12, maxObjs: 28,
  boxRespawn: 2.5, coinRespawn: 9, roulette: 1.3,
};

export const ITEMS = ["boost", "triple", "banana", "green", "red", "star", "bolt"];

// Item odds by race position: [front, middle, back].
const ODDS = {
  boost: [8, 20, 16], triple: [0, 14, 22], banana: [46, 16, 4], green: [46, 24, 10],
  red: [0, 22, 22], star: [0, 4, 20], bolt: [0, 0, 6],
};

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function createRace(T, racers, opts = {}) {
  const R = rng(opts.seed || 7);
  const st = {
    T, t: 0, phase: "countdown", countdown: opts.countdown ?? 3.5, laps: opts.laps || LAPS,
    karts: [], objs: [], boxes: [], coins: [], pads: [], events: [], rand: R, finished: 0, firstHumanDone: null,
  };
  // grid: two columns, staggered, behind the line
  racers.forEach((r, i) => {
    const back = 8 + i * 6;
    const idx = (T.n - Math.round(back / T.ds)) % T.n;
    const lat = i % 2 ? -4.2 : 4.2;
    const p = pointAt(T, idx, lat);
    st.karts.push({
      id: r.id, name: r.name, char: r.char, color: r.color, human: !!r.human, slot: i,
      x: p.x, z: p.z, y: p.y, vy: 0, h: p.h, speed: 0, idx, dist: -back, lap: 0, place: i + 1,
      drift: 0, driftT: 0, driftLevel: 0, hop: 0, boost: 0, star: 0, spin: 0, safe: 0, shrink: 0,
      coins: 0, item: null, itemCount: 0, roulette: 0, rolled: null, itemPress: 0,
      finished: false, time: 0, wrong: 0, offroad: false, lastLapAt: 0, lapTimes: [],
      ai: { lane: (R() - 0.5) * 8, laneT: 2 + R() * 3, itemWait: 1 + R() * 3, skill: 0.93 + R() * 0.05 },
      input: { steer: 0, gas: 0, brake: 0, drift: 0, item: 0 },
    });
  });
  // item boxes: rows across the road
  for (const f of [0.17, 0.47, 0.77]) {
    const idx = Math.round(T.n * f);
    for (const lat of [-6.4, -3.2, 0, 3.2, 6.4]) {
      const p = pointAt(T, idx, lat);
      st.boxes.push({ x: p.x, z: p.z, y: p.y, idx, gone: 0 });
    }
  }
  // coin lines
  [[0.08, 0], [0.27, -4], [0.36, 5], [0.58, 3], [0.66, -5], [0.88, 0]].forEach(([f, lat]) => {
    const base = Math.round(T.n * f);
    for (let k = 0; k < 6; k++) {
      const p = pointAt(T, base + k * 2, lat + Math.sin(k * 0.9) * 1.5);
      st.coins.push({ x: p.x, z: p.z, y: p.y, gone: 0 });
    }
  });
  // boost pads
  for (const [f, lat] of [[0.42, 0], [0.93, -3]]) {
    const idx = Math.round(T.n * f);
    st.pads.push({ idx, lat, ...pointAt(T, idx, lat) });
  }
  return st;
}

function ev(st, e) { st.events.push(e); }
function wrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function hit(st, k, by, why) {
  if (k.star > 0 || k.safe > 0) return false;
  k.spin = C.spin;
  k.safe = C.spin + C.safe;
  k.drift = 0; k.driftT = 0;
  k.boost = 0;
  const lost = Math.min(3, k.coins);
  k.coins -= lost;
  ev(st, { t: "hit", k: k.id, by: by && by.id, why, lost });
  return true;
}

function pickItem(st, k) {
  const n = st.karts.length;
  const r = n > 1 ? (k.place - 1) / (n - 1) : 0.5;
  const col = r < 0.34 ? 0 : r < 0.67 ? 1 : 2;
  const pool = ITEMS.map((it) => [it, ODDS[it][col]]).filter((x) => x[1] > 0);
  let roll = st.rand() * pool.reduce((a, x) => a + x[1], 0);
  for (const [it, w] of pool) { if ((roll -= w) <= 0) return it; }
  return pool[0][0];
}

function useItem(st, k) {
  const it = k.item;
  if (!it || k.roulette > 0 || k.spin > 0) return;
  const fx = Math.sin(k.h), fz = Math.cos(k.h);
  if (it === "boost" || it === "triple") {
    k.boost = Math.max(k.boost, 1.35);
    ev(st, { t: "boost", k: k.id });
  } else if (it === "banana") {
    st.objs.push({ type: "banana", x: k.x - fx * 2.8, z: k.z - fz * 2.8, y: k.y, vx: 0, vz: 0, life: 60, owner: k.id, age: 0, idx: k.idx });
    ev(st, { t: "drop", k: k.id });
  } else if (it === "green" || it === "red") {
    const v = it === "green" ? C.green : C.red;
    let target = null;
    if (it === "red") {
      // the kart directly ahead in the standings
      target = st.karts.find((o) => o.place === k.place - 1 && !o.finished) || null;
    }
    st.objs.push({ type: it, x: k.x + fx * 2.6, z: k.z + fz * 2.6, y: k.y, vx: fx * v, vz: fz * v, life: it === "red" ? C.redLife : C.shellLife,
      owner: k.id, target: target && target.id, age: 0, idx: k.idx, bounces: 0 });
    ev(st, { t: "fire", k: k.id, item: it });
  } else if (it === "star") {
    k.star = C.star;
    ev(st, { t: "star", k: k.id });
  } else if (it === "bolt") {
    for (const o of st.karts) {
      if (o === k || o.finished) continue;
      o.shrink = C.shrink;
      if (o.star <= 0) { o.spin = Math.max(o.spin, 0.9); o.drift = 0; o.boost = 0; }
    }
    ev(st, { t: "bolt", k: k.id });
  }
  if (it === "triple" && --k.itemCount > 0) return;
  k.item = null;
  k.itemCount = 0;
}

// ---------------- CPU driver ----------------
function think(st, k, dt) {
  const T = st.T, a = k.ai;
  a.laneT -= dt;
  if (a.laneT <= 0) { a.lane = (st.rand() - 0.5) * 9; a.laneT = 2 + st.rand() * 4; }
  const look = Math.round((10 + k.speed * 0.55) / T.ds);
  const tgtIdx = k.idx + look;
  const curve = T.S[(k.idx + 4) % T.n].curve;
  // hug the inside of corners a little
  let lane = clamp(a.lane + curve * 9, -HALF + 2, HALF - 2);
  // dodge bananas in the way
  for (const o of st.objs) {
    if (o.type !== "banana") continue;
    const dx = o.x - k.x, dz = o.z - k.z, d = Math.hypot(dx, dz);
    if (d > 30 || d < 1) continue;
    const ahead = (dx * Math.sin(k.h) + dz * Math.cos(k.h)) / d;
    if (ahead > 0.85) { lane += (frame(T, k.idx, o.x, o.z).lat > lane ? -5 : 5); break; }
  }
  const p = pointAt(T, tgtIdx, lane);
  const want = Math.atan2(p.x - k.x, p.z - k.z);
  const diff = wrap(want - k.h);
  const steer = clamp(-diff * 2.6, -1, 1);
  const sharp = Math.abs(curve) > 0.55;
  const inp = k.input;
  inp.steer = steer;
  inp.gas = 1;
  inp.brake = Math.abs(diff) > 1.3 && k.speed > 8 ? 1 : 0;
  // drift through long corners, let go on the exit
  if (!k.drift && sharp && k.speed > 18 && Math.abs(steer) > 0.35) inp.drift = 1;
  else if (k.drift && (Math.abs(curve) < 0.2 || k.driftLevel >= 2)) inp.drift = 0;
  // items
  if (k.item && k.roulette <= 0) {
    a.itemWait -= dt;
    let fire = false;
    const it = k.item;
    if (it === "star" || it === "bolt" || it === "triple") fire = a.itemWait < 0;
    else if (it === "boost") fire = a.itemWait < 0 && Math.abs(curve) < 0.25;
    else if (it === "banana") {
      fire = a.itemWait < -6 || (a.itemWait < 0 && st.karts.some((o) => o !== k && o.dist < k.dist && k.dist - o.dist < 25));
    } else if (it === "red") fire = a.itemWait < 0 && k.place > 1;
    else if (it === "green") {
      fire = a.itemWait < -8 || (a.itemWait < 0 && st.karts.some((o) => {
        if (o === k) return false;
        const dx = o.x - k.x, dz = o.z - k.z, d = Math.hypot(dx, dz);
        return d < 45 && (dx * Math.sin(k.h) + dz * Math.cos(k.h)) / d > 0.97;
      }));
    }
    if (fire) { inp.item++; a.itemWait = 1 + st.rand() * 3; }
  }
  // rubber band against the humans, so the CPUs stay in the fight
  const humans = st.karts.filter((o) => o.human && !o.finished);
  let skill = a.skill;
  if (humans.length) {
    const lead = Math.max(...humans.map((o) => o.dist)), back = Math.min(...humans.map((o) => o.dist));
    if (k.dist > lead + 40) skill *= 0.9;
    else if (k.dist < back - 60) skill *= 1.07;
  }
  a.speedFactor = skill;
}

// ---------------- one tick ----------------
export function step(st, dt, inputs) {
  const T = st.T;
  st.t += dt;
  if (st.phase === "countdown") {
    st.countdown -= dt;
    if (st.countdown <= 0) {
      st.phase = "race"; st.raceStart = st.t; ev(st, { t: "go" });
      // rocket start: gas held from about "2" gives a boost; held from "3" stalls
      for (const k of st.karts) {
        const rev = k.human ? k.revT || 0 : (st.rand() < 0.5 ? 1 : 0);
        if (rev > 0.5 && rev < 2.2) { k.boost = 1.0; ev(st, { t: "boost", k: k.id }); }
        else if (rev >= 2.2) { k.spin = 0.7; ev(st, { t: "stall", k: k.id }); }
      }
    }
  }
  const racing = st.phase === "race" || st.phase === "done";

  for (const k of st.karts) {
    if (inputs && inputs[k.id] && k.human && !k.finished && !st.autopilot) {
      const i = inputs[k.id];
      k.input.steer = clamp(+i.steer || 0, -1, 1); k.input.gas = i.gas ? 1 : 0; k.input.brake = i.brake ? 1 : 0;
      k.input.drift = i.drift ? 1 : 0;
      if ((i.item | 0) !== k.itemPress) { k.itemPress = i.item | 0; if (racing) useItem(st, k); }
    } else if ((!k.human || k.finished || st.autopilot) && racing) {
      const before = k.input.item;
      think(st, k, dt);
      if (k.input.item !== before) useItem(st, k);
    }
    if (!racing) {
      k.revT = k.input.gas ? (k.revT || 0) + dt : 0;
      continue;
    }
    drive(st, k, dt);
  }
  if (racing) {
    collideKarts(st);
    moveObjects(st, dt);
    pickups(st, dt);
    rank(st);
  }
}

function drive(st, k, dt) {
  const T = st.T, inp = k.input;
  const timers = ["boost", "star", "spin", "safe", "shrink"];
  for (const t of timers) if (k[t] > 0) k[t] = Math.max(0, k[t] - dt);
  if (k.roulette > 0) {
    k.roulette -= dt;
    if (k.roulette <= 0) { k.item = k.rolled; k.itemCount = k.item === "triple" ? 3 : 1; ev(st, { t: "got", k: k.id, item: k.item }); }
  }

  const fr = frame(T, k.idx, k.x, k.z);
  const off = Math.abs(fr.lat) > HALF + CURB * 0.6;
  k.offroad = off;
  let max = C.maxSpeed * (1 + Math.min(k.coins, C.coinsMax) * C.coinBonus) * (k.ai.speedFactor && (!k.human || k.finished || st.autopilot) ? k.ai.speedFactor : 1);
  if (k.shrink > 0) max *= 0.72;
  if (off && k.boost <= 0 && k.star <= 0) max *= C.offroadMax;
  if (k.star > 0) max *= 1.18;
  if (k.boost > 0) max *= C.boostMax;

  let steer = inp.steer;
  if (k.spin > 0) {
    k.speed += (0 - k.speed) * Math.min(1, dt * 2.2);
    steer = 0;
  } else if (k.boost > 0) {
    k.speed = Math.min(max, k.speed + C.boostAccel * dt);
  } else if (inp.brake && !inp.gas) {
    k.speed = k.speed > 0 ? Math.max(0, k.speed - C.brake * dt) : Math.max(-C.reverseMax, k.speed - C.accel * 0.5 * dt);
  } else if (inp.brake && inp.gas) {
    k.speed = Math.max(0, k.speed - C.brake * 0.6 * dt);
  } else if (inp.gas) {
    // accelerate fast from a stop, ease into top speed
    const a = C.accel * (1.25 - 0.75 * Math.max(0, k.speed) / max);
    k.speed = k.speed < max ? Math.min(max, k.speed + a * dt) : Math.max(max, k.speed - C.offroadDrag * dt);
  } else {
    k.speed = k.speed > 0 ? Math.max(0, k.speed - C.coast * dt) : Math.min(0, k.speed + C.coast * dt);
  }
  if (k.speed > max && k.boost <= 0) k.speed = Math.max(max, k.speed - (off ? C.offroadDrag : 9) * dt);

  // ---- drift: hold drift while turning, charge sparks, release for a turbo
  if (inp.drift && !k.drift && Math.abs(steer) > 0.25 && k.speed > C.driftMin && k.spin <= 0 && k.hop <= 0) {
    k.drift = Math.sign(steer);
    k.driftT = 0; k.driftLevel = 0;
    k.hop = 0.22;
    ev(st, { t: "hop", k: k.id });
  }
  if (k.drift && (!inp.drift || k.speed < C.driftMin * 0.7 || k.spin > 0)) {
    if (k.driftLevel > 0 && k.spin <= 0 && inp.drift === 0) {
      k.boost = Math.max(k.boost, C.driftBoost[k.driftLevel - 1]);
      ev(st, { t: "miniturbo", k: k.id, level: k.driftLevel });
    }
    k.drift = 0; k.driftT = 0; k.driftLevel = 0;
  }
  let yawRate;
  const sp = Math.abs(k.speed);
  if (k.drift) {
    const into = steer * k.drift;              // -1 (opening up) .. 1 (tightening)
    yawRate = -k.drift * C.turn * (0.62 + 0.42 * into);
    k.driftT += dt * (0.75 + 0.55 * Math.max(0, into)) * (off ? 0.4 : 1);
    const lvl = C.driftCharge.filter((c) => k.driftT >= c).length;
    if (lvl !== k.driftLevel) { k.driftLevel = lvl; ev(st, { t: "spark", k: k.id, level: lvl }); }
  } else {
    const grip = Math.min(1, sp / 7) * (1 - 0.32 * Math.min(1, sp / C.maxSpeed));
    yawRate = -steer * C.turn * grip * (k.speed < 0 ? -1 : 1);
  }
  if (k.spin > 0) yawRate = 0;
  k.h = wrap(k.h + yawRate * dt);

  // drifting karts slide toward the outside of the turn
  const slip = k.drift ? k.drift * 0.32 : 0;
  const mh = k.h + slip;
  k.x += Math.sin(mh) * k.speed * dt;
  k.z += Math.cos(mh) * k.speed * dt;

  // ---- track position, walls, ground
  const prev = k.idx;
  k.idx = nearest(T, k.x, k.z, k.idx);
  let d = k.idx - prev;
  if (d > T.n / 2) d -= T.n;
  if (d < -T.n / 2) d += T.n;
  k.dist += d * T.ds;
  const f2 = frame(T, k.idx, k.x, k.z);
  if (Math.abs(f2.lat) > WALL - C.radius) {
    const p = T.S[k.idx], side = Math.sign(f2.lat), lim = (WALL - C.radius) * side;
    k.x += p.nx * (lim - f2.lat);
    k.z += p.nz * (lim - f2.lat);
    // turn the nose back along the wall and scrub speed
    const along = Math.sin(k.h) * p.tx + Math.cos(k.h) * p.tz;
    const th = Math.atan2(p.tx, p.tz) + (along < 0 ? Math.PI : 0);
    const into = Math.abs(wrap(k.h - th));
    k.h = wrap(th + (wrap(k.h - th)) * 0.25);
    k.speed *= 1 - Math.min(0.5, into * 0.8);
    if (into > 0.25 && sp > 8) ev(st, { t: "bump", k: k.id });
  }
  const g = Math.abs(f2.lat) <= HALF + CURB ? f2.y : groundAt(T, k.x, k.z);
  if (k.hop > 0) { k.hop -= dt; }
  if (k.y > g + 0.05) { k.vy -= 30 * dt; k.y += k.vy * dt; if (k.y <= g) { k.y = g; k.vy = 0; } }
  else { k.y = g; k.vy = 0; }

  // ---- wrong way + laps
  const tang = Math.sin(k.h) * T.S[k.idx].tx + Math.cos(k.h) * T.S[k.idx].tz;
  k.wrong = tang < -0.35 && k.speed > 4 ? k.wrong + dt : 0;
  const lap = Math.floor(k.dist / T.length);
  if (lap > k.lap && lap >= 1 && !k.finished) {
    k.lapTimes.push(st.t - st.raceStart - k.lastLapAt);
    k.lastLapAt = st.t - st.raceStart;
    if (lap >= st.laps) {
      k.finished = true;
      k.time = st.t - st.raceStart;
      st.finished++;
      k.finishPlace = st.finished;
      ev(st, { t: "finish", k: k.id, place: k.finishPlace });
      if (k.human && st.firstHumanDone === null) st.firstHumanDone = st.t;
    } else ev(st, { t: "lap", k: k.id, lap: lap + 1 });
  }
  k.lap = Math.max(k.lap, lap);
}

function collideKarts(st) {
  const ks = st.karts, r2 = C.radius * 2;
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
    const a = ks[i], b = ks[j];
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d >= r2 || d < 1e-4 || Math.abs(a.y - b.y) > 2) continue;
    const nx = dx / d, nz = dz / d, push = (r2 - d) / 2;
    a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
    if (a.star > 0 && b.star <= 0) hit(st, b, a, "star");
    else if (b.star > 0 && a.star <= 0) hit(st, a, b, "star");
    else {
      // a little bump: trade some speed
      const m = (a.speed + b.speed) / 2;
      a.speed = a.speed * 0.85 + m * 0.15; b.speed = b.speed * 0.85 + m * 0.15;
      if (st.t - (a.bumpT || 0) > 0.4) { ev(st, { t: "bump", k: a.id }); a.bumpT = st.t; }
    }
  }
}

function moveObjects(st, dt) {
  const T = st.T;
  for (const o of st.objs) {
    o.age += dt;
    o.life -= dt;
    if (o.type === "banana") { o.y = groundAt(T, o.x, o.z); continue; }
    if (o.type === "red") {
      const tgt = st.karts.find((k) => k.id === o.target && !k.finished);
      let aimX, aimZ;
      if (tgt && Math.hypot(tgt.x - o.x, tgt.z - o.z) < 32) { aimX = tgt.x; aimZ = tgt.z; }
      else { const p = pointAt(T, o.idx + 7, 0); aimX = p.x; aimZ = p.z; }
      const want = Math.atan2(aimX - o.x, aimZ - o.z), cur = Math.atan2(o.vx, o.vz);
      const nh = cur + clamp(wrap(want - cur), -5 * dt, 5 * dt);
      o.vx = Math.sin(nh) * C.red; o.vz = Math.cos(nh) * C.red;
    }
    o.x += o.vx * dt; o.z += o.vz * dt;
    o.idx = nearest(T, o.x, o.z, o.idx);
    const fr = frame(T, o.idx, o.x, o.z);
    if (Math.abs(fr.lat) > WALL - 0.6) {
      if (o.type === "green") {
        const p = T.S[o.idx], dot = o.vx * p.nx + o.vz * p.nz;
        o.vx -= 2 * dot * p.nx; o.vz -= 2 * dot * p.nz;
        const side = Math.sign(fr.lat);
        o.x -= p.nx * (Math.abs(fr.lat) - (WALL - 0.7)) * side; o.z -= p.nz * (Math.abs(fr.lat) - (WALL - 0.7)) * side;
        if (++o.bounces > 4) o.life = 0;
      } else o.life = 0;
    }
    o.y = Math.abs(fr.lat) <= HALF + CURB ? fr.y : groundAt(T, o.x, o.z);
  }
  // shells vs bananas
  for (const a of st.objs) {
    if (a.life <= 0 || a.type === "banana") continue;
    for (const b of st.objs) {
      if (b === a || b.life <= 0) continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) < 1.4) { a.life = 0; b.life = 0; ev(st, { t: "poof", x: a.x, z: a.z }); }
    }
  }
  // objects vs karts
  for (const o of st.objs) {
    if (o.life <= 0) continue;
    for (const k of st.karts) {
      if (o.owner === k.id && o.age < 0.5) continue;
      if (Math.abs(o.y - k.y) > 2) continue;
      if (Math.hypot(o.x - k.x, o.z - k.z) < C.radius + 0.55) {
        o.life = 0;
        const by = st.karts.find((q) => q.id === o.owner);
        if (!hit(st, k, by, o.type)) ev(st, { t: "poof", x: o.x, z: o.z });
        break;
      }
    }
  }
  st.objs = st.objs.filter((o) => o.life > 0);
  if (st.objs.length > C.maxObjs) st.objs.splice(0, st.objs.length - C.maxObjs);
}

function pickups(st, dt) {
  for (const b of st.boxes) {
    if (b.gone > 0) { b.gone -= dt; continue; }
    for (const k of st.karts) {
      if (Math.hypot(b.x - k.x, b.z - k.z) < C.radius + 1.0) {
        b.gone = C.boxRespawn;
        ev(st, { t: "box", k: k.id, x: b.x, z: b.z });
        if (!k.item && k.roulette <= 0) { k.rolled = pickItem(st, k); k.roulette = C.roulette; ev(st, { t: "roll", k: k.id }); }
        break;
      }
    }
  }
  for (const c of st.coins) {
    if (c.gone > 0) { c.gone -= dt; continue; }
    for (const k of st.karts) {
      if (Math.hypot(c.x - k.x, c.z - k.z) < C.radius + 0.7) {
        c.gone = C.coinRespawn;
        if (k.coins < C.coinsMax) k.coins++;
        ev(st, { t: "coin", k: k.id });
        break;
      }
    }
  }
  for (const p of st.pads) {
    for (const k of st.karts) {
      const fr = frame(st.T, p.idx, k.x, k.z);
      if (Math.abs(fr.along) < 3 && Math.abs(fr.lat - p.lat) < 2.6 && k.boost < 0.6) {
        k.boost = 0.9;
        ev(st, { t: "pad", k: k.id });
      }
    }
  }
}

function rank(st) {
  const order = [...st.karts].sort((a, b) =>
    (a.finished && b.finished) ? a.finishPlace - b.finishPlace : a.finished ? -1 : b.finished ? 1 : b.dist - a.dist);
  order.forEach((k, i) => (k.place = i + 1));
  const humans = st.karts.filter((k) => k.human);
  const allIn = humans.length ? humans.every((k) => k.finished) : st.karts.every((k) => k.finished);
  if (st.phase === "race" && (allIn || (st.firstHumanDone !== null && st.t - st.firstHumanDone > 30))) {
    st.phase = "done";
    st.doneAt = st.t;
    ev(st, { t: "done" });
  }
}

export function standings(st) {
  return [...st.karts].sort((a, b) => a.place - b.place);
}
