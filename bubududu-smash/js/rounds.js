// Round variety: the mode wheel, the modifier card, and grab-and-throw.
//
// Both sim.js and screen.js carry a full copy of the rules, and every feature
// written twice has at some point been broken in one of them. So everything
// here takes the round (`G`) and a context of the helpers each copy already
// has, and the two files only call into it.
//
// State lives on `G.rd`, and every clock in it counts DOWN in seconds rather
// than holding an absolute time — so the whole object can be sent over the
// wire as it is and mean the same thing on a phone whose clock disagrees.
//
// See ROUND_MODES, ROUND_MODS, ROUND and GRAB in config.js for the why.

import { ROUND_MODES, ROUND_MODS, ROUND, GRAB, PLAYERS, COINS } from "./config.js";

const nameOf = (id) => (PLAYERS.find((p) => p.id === id) || {}).name || id;
const other = (G, id) => G.actors.find((a) => a.id !== id);
const alive = (a) => a && !a.dead && a.hp > 0;

/* ----------------------------------------------------------------- roll --- */

/* A fixed mode and modifier instead of the wheel — for the tests, and for
 * `?mode=hill&mod=lava` on the screen's URL when you want to try one.
 * `undefined` leaves that half to the wheel; `null` means "none". */
let forced = { mode: undefined, mod: undefined };
export function forceRound(mode, mod) { forced = { mode, mod }; }

/** Draw this round's mode and modifier. Never the same mode twice running. */
export function rollRound(G, prev, rng) {
  // Always drawn, even when forced, so a forced round consumes the same
  // random numbers as a free one and everything after it stays in step.
  const modes = ROUND_MODES.filter((m) => !prev || m.id !== prev.mode);
  let mode = modes[Math.floor(rng() * modes.length)].id;
  let mod = null;
  const roll = rng();
  const mods = ROUND_MODS.filter((m) => !prev || m.id !== prev.mod);
  const pick = mods[Math.floor(rng() * mods.length)].id;
  if (roll < ROUND.modChance) mod = pick;
  if (forced.mode !== undefined && ROUND_MODES.some((m) => m.id === forced.mode)) mode = forced.mode;
  if (forced.mod !== undefined && (forced.mod === null || ROUND_MODS.some((m) => m.id === forced.mod))) mod = forced.mod;
  const first = rng() < 0.5 ? "p1" : "p2";
  const [lo, hi] = ROUND.potatoFuse;
  G.rd = {
    mode, mod,
    started: false,
    // hill
    zone: null, zoneLeft: 0, meter: { p1: 0, p2: 0 }, contested: false,
    // potato
    holder: mode === "potato" ? first : null,
    fuse: lo + rng() * (hi - lo),
    // tag
    it: mode === "tag" ? first : null,
    itTime: { p1: 0, p2: 0 },
    passLeft: 0,
    // rush
    rushLeft: ROUND.rushSecs, bank: { p1: 0, p2: 0 }, overtime: false,
    // modifiers
    swapLeft: ROUND.swapEvery,
    lava: ROUND.lavaStart,
    // grab: { by, victim, left }
    grab: null,
    boom: null,
  };
}

export const modeOf = (G) => ROUND_MODES.find((m) => m.id === (G.rd && G.rd.mode)) || ROUND_MODES[0];
export const modOf = (G) => ROUND_MODS.find((m) => m.id === (G.rd && G.rd.mod)) || null;

/** The round card: "Round 2: Hot Potato", and the rule plus the modifier. */
export function roundCard(G, roundNo) {
  const m = modeOf(G), d = modOf(G);
  return {
    title: `Round ${roundNo}: ${m.name}`,
    sub: d ? `${m.rule}  ·  ${d.name}: ${d.desc}` : m.rule,
  };
}

/** Does a hit cost a heart this round? Only in Smash. */
export const heartsOn = (G) => !G.rd || G.rd.mode === "smash";

/* ----------------------------------------------------- bodies, each tick --- */

/**
 * The numbers the round bends, put on each body before physics runs. Runs on
 * every machine that steps a body, so a phone predicting its own player
 * floats in Low Gravity exactly as the server does.
 */
export function applyBody(G, a) {
  const rd = G.rd;
  if (!rd) return;
  a.gravMul = rd.mod === "lowgrav" ? 0.55 : 1;
  a.grip = rd.mod === "ice" ? 0.12 : 1;
  a.bouncy = rd.mod === "bouncy";
  const chaser = (rd.mode === "potato" && rd.holder === a.id) || (rd.mode === "tag" && rd.it === a.id);
  const carrying = rd.grab && rd.grab.by === a.id;
  a.modSpeed = (rd.mod === "turbo" ? 1.35 : 1) * (chaser ? ROUND.chaserSpeed : 1) * (carrying ? GRAB.carrySpeed : 1);
}

/** Whoever is being held is carried over the holder's head. Every machine. */
export function pinHeld(G) {
  const g = G.rd && G.rd.grab;
  if (!g) return;
  const by = G.actors.find((a) => a.id === g.by);
  const v = G.actors.find((a) => a.id === g.victim);
  if (!alive(by) || !alive(v)) { G.rd.grab = null; if (v) v.lockUntil = 0; return; }
  // A little struggle, so it reads as someone being held and not as a hat.
  v.x = by.x + Math.sin(G.time * 31) * 0.06;
  v.y = by.y - by.h - 0.02;
  v.vx = by.vx;
  v.vy = 0;
  v.grounded = false;
  v.face = -by.face;
}

/* ---------------------------------------------------------------- grab --- */

/** The power-up button with nothing to fire: grab, or throw if holding. */
export function tryGrab(G, a, ctx) {
  const rd = G.rd;
  if (!rd || !alive(a)) return false;
  if (rd.grab && rd.grab.by === a.id) { throwHeld(G, a, ctx); return true; }
  if (rd.grab) return false;
  if ((a.grabReady || 0) > G.time) return false;
  const o = other(G, a.id);
  if (!alive(o)) return false;
  if (Math.abs(o.x - a.x) > GRAB.reachX || Math.abs((o.y - o.h / 2) - (a.y - a.h / 2)) > GRAB.reachY) {
    // A whiff still costs the cooldown, or it is a free button to mash.
    a.grabReady = G.time + 0.35;
    return false;
  }
  if (!ctx.canHit(o, a)) return false;
  rd.grab = { by: a.id, victim: o.id, left: GRAB.holdMs / 1000 };
  a.grabReady = G.time + GRAB.cooldownMs / 1000;
  a.face = Math.sign(o.x - a.x) || a.face;
  o.lockUntil = G.time + GRAB.holdMs / 1000 + 0.1;
  o.punch = null;
  o.swing = null;
  G.bursts.push({ x: o.x, y: o.y - o.h * 0.5, at: G.time, colour: "#ffffff" });
  ctx.fx.sfx("land");
  ctx.fx.shake(6);
  ctx.fx.punch(0.03);
  if (rd.mode !== "smash") passOn(G, a, o, ctx);   // a grab is a touch
  return true;
}

function throwHeld(G, a, ctx) {
  const g = G.rd.grab;
  if (!g) return;
  const v = G.actors.find((q) => q.id === g.victim);
  G.rd.grab = null;
  if (!v) return;
  v.lockUntil = 0;
  v.vx = a.face * GRAB.throwVx;
  v.vy = GRAB.throwVy;
  v.launchFor = GRAB.launchMs / 1000;
  v.grabThrownBy = a.id;
  v.grabThrownAt = G.time;
  v.invulnUntil = Math.max(v.invulnUntil || 0, G.time + 0.25);
  G.bursts.push({ x: v.x, y: v.y - v.h * 0.5, at: G.time, colour: "#ffd24a", big: true });
  ctx.fx.sfx("badHit");
  ctx.fx.shake(22);
  ctx.fx.punch(0.06);
}

/* ------------------------------------------------------- hits, no hearts --- */

/**
 * A hit in a mode where hearts are off: knocked back instead, and whatever
 * the mode says a hit means. Returns true — the heart is not taken.
 */
export function modeHit(G, victim, by, how, ctx) {
  victim.lethal = false;          // a punch or a shell armed this; spend it here
  victim.hitFor = null;
  const [kx, ky] = ROUND.knock[how] || ROUND.knock.other;
  const from = by ? Math.sign(victim.x - by.x) || (by.face || 1) : (victim.face || 1) * -1;
  victim.vx = from * kx;
  victim.vy = -ky;
  victim.launchFor = Math.max(victim.launchFor || 0, ROUND.knockMs / 1000 * (kx > 20 ? 1.6 : 1));
  victim.grounded = false;
  victim.invulnUntil = Math.max(victim.invulnUntil || 0, G.time + 0.7);
  if (by && G.actors.includes(by)) {
    victim.grabThrownBy = by.id;   // a fall straight after is theirs
    victim.grabThrownAt = G.time;
  }
  G.bursts.push({ x: victim.x, y: victim.y - victim.h * 0.55, at: G.time, colour: "#ffffff", big: kx > 20 });
  ctx.fx.sfx("stomp");
  ctx.fx.shake(kx > 20 ? 26 : 8);
  if (by && G.actors.includes(by)) {
    passOn(G, by, victim, ctx);
    if (G.rd.mode === "rush" && how === "stomp") spillBank(G, victim, ctx);
  }
  return true;
}

/** Fell off the map in a no-hearts mode. */
export function modeFall(G, a, ctx) {
  if (G.rd && G.rd.mode === "rush") {
    const n = Math.min(ROUND.rushSteal, G.rd.bank[a.id] || 0);
    G.rd.bank[a.id] -= n;
    if (n) ctx.fx.note(a, COINS.colour, `-${n} coins`, "Fell off the map.", "gem");
  }
}

/** Touching someone passes the bomb or IT, if you are the one carrying it. */
function passOn(G, from, to, ctx) {
  const rd = G.rd;
  if (rd.passLeft > 0 || !alive(to)) return;
  if (rd.mode === "potato" && rd.holder === from.id) {
    rd.holder = to.id;
    rd.passLeft = ROUND.passCooldownMs / 1000;
    ctx.fx.sfx("pinata");
    ctx.fx.note(to, "#ff6a3d", "You have the bomb", "Touch them to pass it.", "bazuka");
  } else if (rd.mode === "tag" && rd.it === from.id) {
    rd.it = to.id;
    rd.passLeft = ROUND.passCooldownMs / 1000;
    ctx.fx.sfx("pinata");
    ctx.fx.note(to, "#b879ff", "You're IT", "Touch them to pass it.", "dash");
  }
}

function spillBank(G, victim, ctx) {
  const n = Math.min(ROUND.rushSteal, G.rd.bank[victim.id] || 0);
  if (!n) return;
  G.rd.bank[victim.id] -= n;
  const spots = ctx.standingTiles().filter((t) => Math.hypot(t.x - victim.x, t.y - victim.y) < 4);
  for (let i = 0; i < n; i++) {
    const s = spots.length ? spots[Math.floor(ctx.rng() * spots.length)] : { x: victim.x, y: victim.y - 0.55 };
    G.coins.push({ x: s.x + (ctx.rng() - 0.5) * 0.4, y: s.y, at: G.time, taken: 0 });
    G.bursts.push({ x: s.x, y: s.y, at: G.time, colour: COINS.colour });
  }
  ctx.fx.note(victim, COINS.colour, `-${n} coins`, "Knocked loose.", "gem");
}

/** A coin was picked up. In Coin Rush it also goes in the bank. */
export function onCoin(G, a) {
  if (G.rd && G.rd.mode === "rush") G.rd.bank[a.id] = (G.rd.bank[a.id] || 0) + 1;
}

/** How many coins the field is topped up to. */
export const coinsWanted = (G) => (G.rd && G.rd.mode === "rush" ? ROUND.rushCoins : COINS.onField);

/** Gunfight overrides what the floor spawns, and how often. */
export function pickPower(G, rng) {
  if (!G.rd || G.rd.mod !== "guns") return null;
  return rng() < 0.6 ? "baril" : "espada";
}
export const powerEvery = (G, base) => (G.rd && G.rd.mod === "guns" ? ROUND.gunfightEveryMs : base);

/* --------------------------------------------------------- the round tick --- */

/**
 * Everything the round's mode and modifier do over time. Authority only.
 *
 * ctx: fx, rng, standingTiles, standingRoom, widestFloor, canHit, givePower,
 *      summonKing, endRound, killFall, detonate
 */
export function tickRound(G, dt, ctx) {
  const rd = G.rd;
  if (!rd) return;
  const [p1, p2] = PLAYERS.map((p) => G.actors.find((a) => a.id === p.id));

  if (!rd.started) {
    rd.started = true;
    if (rd.mod === "bazooka") for (const a of G.actors) ctx.givePower(a, "bazuka");
    if (rd.mod === "king") ctx.summonKing({ x: G.level.w / 2, y: 6 });
  }

  if (rd.passLeft > 0) rd.passLeft = Math.max(0, rd.passLeft - dt);

  // The grab lets go on its own if you never throw.
  if (rd.grab) {
    rd.grab.left -= dt;
    const by = G.actors.find((a) => a.id === rd.grab.by);
    if (rd.grab.left <= 0 && by) throwHeld(G, by, ctx);
  }

  /* ---- modifiers ---- */
  if (rd.mod === "swap" && alive(p1) && alive(p2) && !rd.grab) {
    rd.swapLeft -= dt;
    if (rd.swapLeft <= 0) {
      rd.swapLeft = ROUND.swapEvery;
      for (const k of ["x", "y", "vx", "vy"]) [p1[k], p2[k]] = [p2[k], p1[k]];
      for (const a of [p1, p2]) {
        G.bursts.push({ x: a.x, y: a.y - a.h * 0.5, at: G.time, colour: "#b879ff", big: true });
        a.invulnUntil = Math.max(a.invulnUntil || 0, G.time + 0.4);
      }
      ctx.fx.sfx("poof");
      ctx.fx.shake(10);
    }
  }
  if (rd.mod === "lava") {
    rd.lava -= ROUND.lavaRise * dt;
    const drown = Math.ceil(rd.lava);
    if (drown < G.grid.rows.length && G.grid.rows[drown] && /[#=]/.test(G.grid.rows.slice(drown).join(""))) {
      G.grid = { rows: G.grid.rows.map((r, y) => (y >= drown ? r.replace(/[#=]/g, ".") : r)) };
    }
    for (const a of G.actors) if (alive(a) && a.y > rd.lava + 0.3) ctx.killFall(a, "lava");
  }

  /* ---- modes ---- */
  if (rd.mode === "hill") {
    rd.zoneLeft -= dt;
    if (!rd.zone || rd.zoneLeft <= 0 || !ctx.standingRoom({ x: rd.zone.x, y: rd.zone.row - 0.4 })) {
      rd.zone = pickZone(G, ctx, rd.zone);
      rd.zoneLeft = ROUND.hillMoveMs / 1000;
    }
    if (rd.zone) {
      const on = G.actors.filter((a) => alive(a) && Math.abs(a.x - rd.zone.x) <= ROUND.hillHalfW
                                        && Math.abs(a.y - rd.zone.row) < 0.35);
      rd.contested = on.length > 1;
      if (on.length === 1) {
        const a = on[0];
        rd.meter[a.id] += dt;
        if (rd.meter[a.id] >= ROUND.hillGoal) return ctx.endRound(a.id, `${nameOf(a.id)} held the crown`);
      }
    }
  }

  if (rd.mode === "potato" && alive(p1) && alive(p2)) {
    touchPass(G, ctx);
    rd.fuse -= dt;
    if (rd.fuse <= 0) {
      const h = G.actors.find((a) => a.id === rd.holder);
      rd.boom = { x: h.x, y: h.y };
      rd.holder = null;
      return ctx.detonate(h);
    }
  }

  if (rd.mode === "tag" && alive(p1) && alive(p2)) {
    touchPass(G, ctx);
    rd.itTime[rd.it] += dt;
    if (rd.itTime[rd.it] >= ROUND.tagLose) {
      const w = other(G, rd.it);
      return ctx.endRound(w.id, `${nameOf(rd.it)} was IT for ${ROUND.tagLose} seconds`);
    }
  }

  if (rd.mode === "rush") {
    rd.rushLeft -= dt;
    if (rd.rushLeft <= 0) {
      const a = rd.bank.p1, b = rd.bank.p2;
      if (a === b && !rd.overtime) {
        rd.overtime = true;
        rd.rushLeft = 8;
        ctx.fx.note(G.actors[0], COINS.colour, "OVERTIME", "Tied. Eight more seconds.", "gem");
        return;
      }
      rd.rushLeft = 0;
      if (a === b) return ctx.endRound(null, `${a} coins each. A draw.`);
      const w = a > b ? "p1" : "p2";
      return ctx.endRound(w, `${nameOf(w)} ${Math.max(a, b)} coins to ${Math.min(a, b)}`);
    }
  }
}

/** Two bodies touching, for the passing modes. */
function touchPass(G, ctx) {
  const rd = G.rd;
  if (rd.passLeft > 0) return;
  const [a, b] = G.actors;
  if (Math.abs(a.x - b.x) > (a.w + b.w) / 2 + 0.08) return;
  if (Math.abs((a.y - a.h / 2) - (b.y - b.h / 2)) > (a.h + b.h) / 2) return;
  const carrier = rd.mode === "potato" ? rd.holder : rd.it;
  const from = G.actors.find((q) => q.id === carrier);
  passOn(G, from, other(G, carrier), ctx);
}

/** A 3-wide stretch of solid ground for the crown, away from where it was. */
function pickZone(G, ctx, was) {
  const tiles = ctx.standingTiles();
  const key = (t) => `${Math.round(t.x - 0.5)},${Math.round(t.y + 0.55)}`;
  const set = new Set(tiles.map(key));
  const wide = tiles.filter((t) => {
    const x = Math.round(t.x - 0.5), y = Math.round(t.y + 0.55);
    return set.has(`${x - 1},${y}`) && set.has(`${x + 1},${y}`);
  });
  const pool = wide.length ? wide : tiles;
  if (!pool.length) return null;
  /* Never under anybody's feet — a crown that lands where you are standing
   * is a round won by standing still. Somewhere you both have to go to. */
  const gap = (t) => Math.min(...G.actors.filter(alive).map((a) => Math.hypot(a.x - t.x, a.y - (t.y + 0.55))), 99);
  const clear = pool.filter((t) => gap(t) > 5 &&
    (!was || Math.abs(t.x - was.x) > 5 || Math.abs(t.y + 0.55 - was.row) > 1));
  let t;
  if (clear.length) t = clear[Math.floor(ctx.rng() * clear.length)];
  else t = pool.reduce((best, q) => (gap(q) > gap(best) ? q : best), pool[0]);
  return { x: t.x, row: Math.round(t.y + 0.55) };
}
