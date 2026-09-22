// The rules of BUBU DUDU SMASH, with nothing to draw them on.
//
// This is the game: the round, the arena, the power-ups, Dudu, the coins, the
// squad, who died and why. It touches no canvas, no DOM and no audio, which
// is the entire point — the same file runs in a browser tab and on a server
// in Node, so there is one set of rules rather than one per place they might
// need to run.
//
// Everything it wants to SHOW goes through `fx`, injected by whoever is
// running it. In a browser that shakes the camera and plays a sound; on a
// server it is collected into the next state update and sent to both players.
// None of it feeds back into the rules, which is why the split is clean.
//
// The simulation is deterministic: seeded per round, so the same seed and the
// same inputs give the same round anywhere.

import {
  MODES, PLAYERS, ROUNDS_TO_WIN, FEEL, HELPER, BAD_HELPER, SQUAD, DIWATA, COINS, HIT, GLYPH,
  POWERUPS, POWER_ORDER, POWER_SPAWN_MS, POWER_FIRST_MS,
  SHOT_SPEED, SHOT_LIFE, SHOT_COOLDOWN_MS, SHOT_RADIUS, STACK,
} from "./config.js";
import { makeArena, readLevel, solidGrid } from "./levels.js";
import { makeActor, stepActor, kill, reviveAt, poseOf, tileAt } from "./physics.js";
import { rng, seed as seedRng, newSeed, rngState, setState as setRngState } from "./rng.js";
import { charById } from "./characters.js";

/* Is this copy of the rules the one that DECIDES?
 *
 * On a server, yes: it owns the world and says who won. In a browser that is
 * following along it is false, and the same file then only predicts — it
 * still runs the physics so the players move without waiting for anything,
 * but it does not spawn power-ups, hand out rewards or call a round. That is
 * the one behavioural difference between the two places this runs.
 */
let authority = true;

/** Nothing happens until someone supplies one; see configure(). */
let fx = {
  sfx() {}, music() {}, note() {}, banner() {}, count() {}, result() {},
  rematch() {}, power() {}, shake() {}, punch() {}, flash() {}, killCam() {},
  roundStart() {},
};

/** How the simulation reaches the outside world. */
export function configure(opts = {}) {
  if (opts.fx) fx = { ...fx, ...opts.fx };
  if (opts.authority !== undefined) authority = !!opts.authority;
}

/* ---------------------------------------------------------------- state --- */

let phase = "lobby";   // lobby | countdown | play | roundover | matchover
let G = null;
let countdown = 0;
let lastCount = -1;
let roundNo = 1;
let roundSeed = 0;
const score = { p1: 0, p2: 0 };
const mode = "tapakan";

const pads = {
  p1: { left: false, right: false, jumpHeld: false, drop: false, char: "yhon", connected: false },
  p2: { left: false, right: false, jumpHeld: false, drop: false, char: "bubu", connected: false },
};
const seenJumps = { p1: 0, p2: 0 };
const seenShots = { p1: 0, p2: 0 };
const pendingJump = { p1: false, p2: false };
const pendingShot = { p1: false, p2: false };
const seenRematch = { p1: 0, p2: 0 };
const lastSeq = { p1: 0, p2: 0 };
const lastKey = { p1: null, p2: null };
const lastHeard = { p1: 0, p2: 0 };

let acc = 0;
const STEP = 1 / 120;

/** How far a respawn is nudged from the living player. */
const SAFE_SPAWN_GAP = 4;
/** How long a collected coin takes to fly into whoever took it. */
const COIN_POP_SEC = 0.75;
/** Only shown to a player on a keyboard; a phone has a button for it. */
const SHOOT_KEY = { p1: "F", p2: "Shift" };

/** Everything the outside needs to read, without being able to reach in. */
export const state = {
  get G() { return G; },
  get phase() { return phase; },
  set phase(v) { phase = v; },
  get score() { return score; },
  get roundNo() { return roundNo; },
  set roundNo(v) { roundNo = v; },
  get seed() { return roundSeed; },
  get pads() { return pads; },
  get rngAt() { return rngState(); },
  setScore(s) { if (s) { score.p1 = s.p1; score.p2 = s.p2; } },
  setRng(v) { if (v) setRngState(v); },
};

function applyPacket(role, p) {
  const pad = pads[role];
  if (!pad || !p) return;

  // A new session key means the phone reloaded and is counting from one
  // again — start the sequence over rather than treating its first packets as
  // ancient history and ignoring the controller entirely.
  if (p.k && p.k !== lastKey[role]) {
    lastKey[role] = p.k;
    lastSeq[role] = 0;
  }
  // Otherwise, anything at or behind what we already applied is a late
  // duplicate and must not overwrite fresher state.
  if (Number.isFinite(p.n)) {
    if (p.n <= lastSeq[role]) return;
    lastSeq[role] = p.n;
  }
  lastHeard[role] = performance.now();

  if (typeof p.l === "boolean") pad.left = p.l;
  if (typeof p.r === "boolean") pad.right = p.r;
  if (typeof p.h === "boolean") pad.jumpHeld = p.h;
  if (typeof p.d === "boolean") pad.drop = p.d;
  if (typeof p.c === "string" && charById(p.c).id === p.c) pad.char = p.c;
  // Jumps travel as a counter — a press dropped by the unreliable channel
  // would otherwise simply never happen.
  if (Number.isFinite(p.j)) {
    if (p.j < seenJumps[role]) seenJumps[role] = p.j;
    else if (p.j > seenJumps[role]) {
      seenJumps[role] = p.j;
      pendingJump[role] = true;
    }
  }
  if (Number.isFinite(p.s)) {
    if (p.s < seenShots[role]) seenShots[role] = p.s;
    else if (p.s > seenShots[role]) {
      seenShots[role] = p.s;
      pendingShot[role] = true;
    }
  }
  // Rematch, asked for from the other phone. A counter like the rest, so a
  // dropped packet on the unreliable channel does not eat the request — and
  // so the level of the flag can never leave a match restarting forever.
  if (Number.isFinite(p.rm)) {
    if (p.rm < seenRematch[role]) seenRematch[role] = p.rm;
    else if (p.rm > seenRematch[role]) {
      seenRematch[role] = p.rm;
      rematch();
    }
  }
}

function dropStaleInput() {
  const now = performance.now();
  for (const id of ["p1", "p2"]) {
    if (!pads[id].connected) continue;
    if (now - lastHeard[id] > 400) {
      pads[id].left = pads[id].right = pads[id].jumpHeld = pads[id].drop = false;
    }
  }
}


/** The one way back into a match, whatever asked for it. */
export function rematch() {
  if (phase === "lobby" || phase === "matchover") startMatch();
}

/** A fresh match: nought all, round one. */
export function startMatch() {
  fx.music("arm");
  fx.rematch(false);
  fx.result(null);
  score.p1 = 0;
  score.p2 = 0;
  roundNo = 1;
  startRound();
}

function startRound(withSeed) {
  // Hand the camera back, in case the last thing it did was hold on a body.
  fx.killCam(null);

  /* One seed decides the whole round.
   *
   * The arena, where every power-up lands, which of the four a ten-coin
   * reward turns out to be, which way Dudu wanders and whether he turns —
   * all of it comes off the same stream now. That is what makes the round
   * reproducible from a single number, which is the thing a second phone
   * needs in order to run the same game rather than watch a recording of it.
   */
  roundSeed = withSeed != null ? withSeed >>> 0 : newSeed();
  seedRng(roundSeed);
  // Told once, immediately, rather than waiting for the next snapshot: a
  // round the other phone starts a fifth of a second late is a round it
  // spends catching up on.
  // Whoever is running this decides what to do with it — a server sends it to
  // both players, a browser following along ignores it.
  fx.roundStart(roundSeed, roundNo, { ...score });

  // A new arena every round. Mirrored and reachability-checked in makeArena(),
  // so the variety cannot reintroduce either of the two things that used to
  // ruin a round: an unfair side, or a platform you can see and never reach.
  const level = makeArena((rng() * 4294967296) >>> 0);
  const meta = readLevel(level);

  G = {
    mode,
    level,
    meta,
    grid: solidGrid(level),
    time: 0,
    shrink: 0,
    winner: null,
    powers: [],   // pickups sitting on the field
    shots: [],    // bullets in flight
    powerAt: POWER_FIRST_MS / 1000,
    lastPower: null,
    flash: null,
    bursts: [],
    lostHearts: [],
    freeze: 0,
    slow: 0,
    slowRate: HIT.slowMoRate,
    finishAt: 0,        // set by the match-winning blow; see handleDeath
    finishWith: null,
    helpers: [],  // every Dudu on the field — wild, claimed or turned
    helperAt: HELPER.firstMs / 1000,
    minis: [],    // the Tatlo squad, waiting or hunting
    squadAt: SQUAD.firstMs / 1000,
    coins: [],    // loose change on the platforms
    coinAt: 0,
    wildFairy: null,                    // the loose Diwata, if one is out
    wildFairyAt: DIWATA.wildFirstMs / 1000,
    pops: [],     // pickup shockwaves
    actors: PLAYERS.map((p, i) => {
      const a = makeActor(meta.spawns[i].x, meta.spawns[i].y, p.id);
      a.char = pads[p.id].char;
      a.stats = { ...(charById(a.char).stats || {}) };
      a.face = charById(a.char).spawnFace || 1;
      a.tint = p.colour;
      a.label = p.name;
      a.coins = 0;
      a.fairy = null;
      a.hp = FEEL.hp;
      a.baseW = a.w;
      a.baseH = a.h;
      a.power = null;
      a.shotAt = 0;
      a.speedMul = 1;
      a.jumpMul = 1;
      a.frozenUntil = 0;
      a.reversedUntil = 0;
      a.invulnUntil = 0;
      return a;
    }),
  };

  phase = "countdown";
  fx.result(null);
  // Four seconds, one per card. At 3.2 the first card — BUBU — got the 0.2
  // left over after the other three took a second each, so it flashed for two
  // frames and the count read as DUDU, SMASH, title.
  countdown = 3;
  lastCount = -1;
  fx.music("start", 138);
  fx.banner(`${MODES[mode].name}`, `round ${roundNo}`);
}

function endRound(winnerId, why) {
  // The guest does not run the rules, so it does not get to call the round
  // either — it would be deciding from its own predicted copy of a stomp and
  // could name a different winner. The host says, and it follows.
  if (!authority) return;
  if (phase !== "play") return;
  phase = "roundover";
  G.winner = winnerId;
  if (winnerId) score[winnerId]++;

  const done = score.p1 >= ROUNDS_TO_WIN || score.p2 >= ROUNDS_TO_WIN;
  fx.music("duck", true);
  if (winnerId) fx.sfx("roundWin"); else fx.sfx("roundLose");
  const name = winnerId ? PLAYERS.find((p) => p.id === winnerId).name : "Nobody";
  fx.banner(winnerId ? `${name} wins` : name, why);
  fx.result("round");

  setTimeout(() => {
    if (done) {
      phase = "matchover";
      fx.music("stop");
      fx.sfx("matchWin");
      const champ = score.p1 > score.p2 ? PLAYERS[0].name : PLAYERS[1].name;
      // "press Enter" is a lie on a phone, where there is no keyboard at all —
      // the match simply ended and nothing could restart it. The button below
      // is the real answer; the key is now just the shortcut for it.
      // The final score as the same pill the HUD wears all match, only big
      // and in the middle. As plain grey text under the headline it was the
      // one number nobody could read, on the one screen it matters most.
      fx.banner(
        `${champ} wins the match`,
        "",
        `<div class="score final"><b class="p1">${score.p1}</b><i></i><b class="p2">${score.p2}</b></div>`
      );
      fx.result("match");
      fx.rematch(true);
    } else {
      roundNo++;
      startRound();
    }
  }, 2600);
}

function catchLostActors() {
  for (let i = 0; i < G.actors.length; i++) {
    const a = G.actors[i];
    if (Number.isFinite(a.x) && Number.isFinite(a.y) &&
        Number.isFinite(a.vx) && Number.isFinite(a.vy)) continue;
    console.warn("[bubu-dudu-smash] actor left the numbers behind, recovering", a.id, {
      x: a.x, y: a.y, vx: a.vx, vy: a.vy, launchFor: a.launchFor,
    });
    const at = safeSpawn(i);
    a.vx = 0;
    a.vy = 0;
    a.launchFor = 0;
    reviveAt(a, at.x, at.y);
    a.cause = null;
    a.thrownAt = null;
    a.defeat = null;
    a.face = charById(a.char).spawnFace || 1;
    a.invulnUntil = G.time + FEEL.hurtInvulnMs / 1000;
  }
}

function tickRules(dt) {
  catchLostActors();

  // The match-winning blow deferred the call so its slow motion could play.
  // Wall clock, not game time: game time is what has been slowed down.
  if (G.finishAt && performance.now() >= G.finishAt) {
    const f = G.finishWith;
    G.finishAt = 0;
    G.finishWith = null;
    if (f) endRound(f.winnerId, f.why);
    return;
  }

  // respawns
  for (const a of G.actors) {
    if (!a.dead || a.respawn > 0) continue;
    if (a.hp <= 0) continue; // stays down — the round is already over
    const i = G.actors.indexOf(a);
    const at = safeSpawn(i);
    reviveAt(a, at.x, at.y);
    a.cause = null;
    a.thrownAt = null;
    a.defeat = null;
    // reviveAt keeps whatever direction you were last walking, so dying on
    // the way left brought Bubu back mirrored — paw on the wrong side for the
    // whole next life. Every spawn starts from the character's own facing.
    a.face = charById(a.char).spawnFace || 1;
    // A moment of grace, or you can be knocked straight back out by whatever
    // was standing where you reappeared.
    a.invulnUntil = G.time + FEEL.hurtInvulnMs / 1000;
  }

  // The floor retreats from both ends, so a round always ends.
  G.shrink += dt * 0.42;
  const eaten = Math.floor(G.shrink);
  if (eaten > 0) {
    const rows = G.grid.rows.map((r) => [...r]);
    for (let y = 0; y < rows.length; y++) {
      for (let k = 0; k < eaten && k < rows[y].length; k++) {
        rows[y][k] = ".";
        rows[y][rows[y].length - 1 - k] = ".";
      }
    }
    G.grid = { rows: rows.map((r) => r.join("")) };
  }
}

function standingRoom(sp) {
  const x = Math.floor(sp.x);
  for (let d = 0; d <= 2; d++) {
    const row = G.grid.rows[Math.floor(sp.y + 0.5) + d];
    const c = row && row[x];
    if (c === "#" || c === "=") return true;
  }
  return false;
}

function widestFloor() {
  let best = null;
  for (let y = 0; y < G.level.h; y++) {
    const row = G.grid.rows[y];
    let run = null;
    for (let x = 0; x <= row.length; x++) {
      const solid = row[x] === "#" || row[x] === "=";
      if (solid) run = run || { y, x0: x, x1: x };
      else if (run) {
        run.x1 = x - 1;
        if (!best || run.x1 - run.x0 > best.x1 - best.x0) best = run;
        run = null;
      }
      if (solid && run) run.x1 = x;
    }
  }
  return best;
}

function safeSpawn(i) {
  const best = widestFloor();
  if (!best) return G.meta.spawns[i];

  const y = best.y - 1.2;
  // Nudged apart so two respawns in the same instant do not land on top of
  // each other and register as a stomp.
  const mid = (best.x0 + best.x1) / 2 + 0.5;
  const nudge = (i === 0 ? -1 : 1) * Math.min(1.6, (best.x1 - best.x0) / 4);
  const wanted = mid + nudge;

  // ...and away from anyone ALREADY standing there. Dropping back in on top
  // of the other player is a stomp, which is a free kill handed to whoever
  // just died. Walk the floor and take the spot furthest from them, breaking
  // ties toward where we wanted to land anyway.
  const them = G.actors.filter((a, j) => j !== i && !a.dead);
  if (!them.length) return { x: wanted, y };

  const clear = (x) => Math.min(...them.map((a) => Math.abs(a.x - x)));
  if (clear(wanted) >= SAFE_SPAWN_GAP) return { x: wanted, y };

  let bestX = wanted;
  let bestScore = -Infinity;
  for (let x = best.x0 + 1; x <= best.x1; x += 0.5) {
    // Far from them first; among equally clear spots, the closest to centre.
    const score = Math.min(clear(x), SAFE_SPAWN_GAP) * 100 - Math.abs(x - wanted);
    if (score > bestScore) { bestScore = score; bestX = x; }
  }
  return { x: bestX, y };
}

function shootPrompt(id, verb = "fire") {
  return pads[id]?.connected
    ? `Tap the button to ${verb}.`
    : `Press ${SHOOT_KEY[id]} to ${verb}.`;
}

function showStack(a, colour, title, gain, glyph = "") {
  fx.note(a, colour, title, `Stacked \u2014 ${gain}.`, glyph);
}

function showPickup(a, type) {
  const def = POWERUPS[type];
  if (!def) return;
  // The two armed power-ups are the ones that need an instruction, and the
  // instruction differs per player and per controller — a phone says "tap the
  // button", a keyboard has to name the key.
  let body = def.desc || "";
  if (type === "baril") body = `Six shots. ${shootPrompt(a.id)}`;
  if (type === "suntok") {
    const n = a.power ? a.power.ammo : 1;
    body = `${n === 1 ? "One punch" : `${n} punches`}. ${shootPrompt(a.id, "punch")}`;
  }
  fx.note(a, def.colour, def.name, body, GLYPH[type] || "");
}


function givePower(a, type) {
  const def = POWERUPS[type];

  // Two of them do their whole job to the OTHER player and are spent at once,
  // so they never become a state you are "holding".
  if (type === "lunas") {
    a.hp = Math.min(FEEL.hpMax, a.hp + def.heal);
    G.flash = { type, at: G.time };
    showPickup(a, type);
    fx.sfx("lunas");
    return;
  }

  if (type === "yelo" || type === "baliktad") {
    for (const o of G.actors) {
      if (o === a || o.dead) continue;
      if (type === "yelo") o.frozenUntil = G.time + def.freezeMs / 1000;
      else o.reversedUntil = G.time + def.reverseMs / 1000;
    }
    G.flash = { type, at: G.time };
    showPickup(a, type);
    sfx[type]?.();
    return;
  }

  // Already holding this one? Add to it rather than start it again. Going
  // through clearPower here would undo laki's size and bilis's speed on the
  // way past and then set them a second time, which is a visible stutter for
  // no reason.
  const mag = def.ammo || def.punches || 0;
  if (a.power && a.power.type === type) {
    if (mag) a.power.ammo = Math.min(mag * STACK.maxAmmoMul, a.power.ammo + mag);
    if (def.ms) {
      const base = def.ms / 1000;
      a.power.until = Math.min(G.time + base * STACK.maxDurationMul, a.power.until + base);
    }
    sfx[type]?.();
    showStack(a, def.colour, def.name, mag ? `${a.power.ammo} now` : "longer", GLYPH[type] || "");
    fx.power(a);
    return;
  }

  clearPower(a, true);
  a.power = {
    type,
    until: def.ms ? G.time + def.ms / 1000 : Infinity,
    ammo: mag,
  };
  if (type === "laki") {
    a.w = a.baseW * def.scale;
    a.h = a.baseH * def.scale;
    // Grow upward, or he grows into the floor and gets shoved through it.
    a.y -= 0.02;
  }
  if (type === "bilis") {
    a.speedMul = def.speed;
    a.jumpMul = def.jump;
  }
  sfx[type]?.();
  showPickup(a, type);
  fx.power(a);
}

function standingTiles() {
  const out = [];
  for (let y = 1; y < G.level.h; y++) {
    const row = G.grid.rows[y];
    const above = G.grid.rows[y - 1];
    for (let x = 1; x < row.length - 1; x++) {
      const c = row[x];
      if ((c === "#" || c === "=") && above[x] === ".") out.push({ x: x + 0.5, y: y - 0.55 });
    }
  }
  return out;
}

function tickCoins(dt) {
  const live = G.coins.filter((c) => !c.taken).length;
  if (live < COINS.onField) {
    G.coinAt -= dt;
    // The first handful land straight away — trickling them in one every two
    // and a half seconds meant the field was still filling when the round was
    // half over, and there was nothing to go for at the start.
    if (live < COINS.atOnce) G.coinAt = 0;
    if (G.coinAt <= 0) {
      G.coinAt = COINS.respawnMs / 1000;
      const spots = standingTiles();
      if (spots.length) {
        // Not on top of an existing one, and not under someone's feet.
        for (let i = 0; i < 12; i++) {
          const p = spots[Math.floor(rng() * spots.length)];
          const clash =
            G.coins.some((c) => !c.taken && Math.abs(c.x - p.x) < 1.4 && Math.abs(c.y - p.y) < 1) ||
            G.actors.some((a) => !a.dead && Math.abs(a.x - p.x) < 1.2 && Math.abs(a.y - p.y) < 1.4);
          if (!clash) { G.coins.push({ x: p.x, y: p.y, at: G.time, taken: 0 }); break; }
        }
      }
    }
  }

  for (const c of G.coins) {
    if (c.taken) continue;
    for (const a of G.actors) {
      if (a.dead) continue;
      if (Math.abs(a.x - c.x) > COINS.radius + a.w / 2) continue;
      if (Math.abs(a.y - a.h / 2 - c.y) > COINS.radius + a.h / 2) continue;
      c.taken = G.time;
      a.coins = (a.coins || 0) + 1;

      // Everything the pickup needs to draw itself, recorded on the coin —
      // which sticks around for another half second precisely so it can play
      // this out. Collecting one used to be a sound and a number changing in
      // a corner, which is no feedback at all for the thing you spend most of
      // the round chasing.
      c.n = a.coins;             // the count to float up from it
      c.by = a.id;               // who took it, so it can fly to them
      c.milestone = a.coins >= COINS.perReward;

      // A flash of gold on the character, so the feedback lands on YOU and
      // not only on the spot the coin was in.
      a.glowUntil = G.time + 0.3;
      a.glowFor = 0.3;
      a.glowColour = COINS.colour;

      // A kick that grows through the run: barely there on the first coin,
      // unmistakable on the tenth. Ten identical thumps would be seasickness.
      fx.punch(0.012 + a.coins * 0.004);
      fx.shake(2 + a.coins * 0.8);

      // Each coin in the run is a semitone above the last, so ten of them
      // climb a scale and the reward lands on top of it. Resets with the
      // count, which is what makes a full run feel like it went somewhere.
      fx.sfx("coin", { rate: Math.pow(2, (a.coins - 1) / 12) });
      if (a.coins >= COINS.perReward) {
        a.coins = 0;
        grantReward(a);
      }
      break;
    }
  }

  // A collected coin lingers only long enough to play its little rise.
  if (G.coins.length) G.coins = G.coins.filter((c) => !c.taken || G.time - c.taken < COIN_POP_SEC);

  // The arena eats its floor; take back anything left hanging over nothing.
  for (let i = G.coins.length - 1; i >= 0; i--) {
    if (!standingRoom(G.coins[i])) G.coins.splice(i, 1);
  }
}

function grantReward(a) {
  const pick = COINS.rewards[Math.floor(rng() * COINS.rewards.length)];
  fx.punch(0.05);
  G.pops.push({ x: a.x, y: a.y - a.h * 0.6, at: G.time, colour: COINS.colour, glyph: "\u2605" });
  a.glowUntil = G.time + 0.7;
  a.glowFor = 0.7;
  a.glowColour = COINS.colour;

  if (pick === "suntok") { givePower(a, "suntok"); return; }
  if (pick === "diwata") { giveFairy(a); return; }
  if (pick === "tatlo") { summonSquad(a); return; }
  summonDudu(a);
}

function giveFairy(a) {
  // A second Diwata queues more heals behind the first rather than restarting
  // her at two — she is one of four things ten coins can buy, and buying the
  // same one twice should not be the worst of the four.
  if (a.fairy && !a.fairy.leaving) {
    a.fairy.left = Math.min(STACK.maxFairyHeals, a.fairy.left + DIWATA.heals);
    showStack(a, DIWATA.colour, DIWATA.name, `${a.fairy.left} hearts waiting`, "\u271a");
    fx.sfx("diwata");
    return;
  }
  a.fairy = {
    left: DIWATA.heals,
    next: G.time + DIWATA.firstMs / 1000,
    healAt: -1,
    leaving: false,
    wave: 0,
    phase: rng() * Math.PI * 2,
  };
  fx.note(a, DIWATA.colour, DIWATA.name, "Two hearts, one at a time.");
  fx.sfx("diwata");
}

function fairyPerch() {
  const lv = G.level;
  const spots = [];
  for (let x = 1; x < lv.w - 1; x++) {
    for (let y = 1; y < lv.h; y++) {
      const c = G.grid.rows[y][x];
      if (c !== "#" && c !== "=") continue;
      if (G.grid.rows[y - 1][x] !== ".") break;
      const [lo, hi] = DIWATA.wildReach;
      spots.push({ x: x + 0.5, y: y - (lo + rng() * (hi - lo)) });
      break;            // only the topmost surface of each column
    }
  }
  if (!spots.length) return null;
  return spots[Math.floor(rng() * spots.length)];
}

function spawnWildFairy() {
  const at = fairyPerch();
  if (!at) return;
  G.wildFairy = {
    x: at.x, y: at.y,
    tx: at.x, ty: at.y,
    hold: 0,
    born: G.time,
    until: G.time + DIWATA.wildLifeMs / 1000,
    phase: rng() * Math.PI * 2,
    face: rng() < 0.5 ? 1 : -1,
    leaving: false,
    wave: 0,
  };
  fx.sfx("spawn");
}

function tickWildFairy(dt) {
  if (!G.wildFairy) {
    G.wildFairyAt -= dt;
    if (G.wildFairyAt <= 0) {
      G.wildFairyAt = DIWATA.wildEveryMs / 1000;
      spawnWildFairy();
    }
    return;
  }

  const w = G.wildFairy;

  if (w.leaving) {
    w.wave += dt;
    w.y -= dt * 3.2;
    if (w.wave > DIWATA.leaveMs / 1000) G.wildFairy = null;
    return;
  }
  if (G.time > w.until) { w.leaving = true; return; }

  // Drift toward the current perch, pause when she gets there, then pick
  // another. Easing rather than a constant speed is what makes her read as
  // fluttering instead of sliding along a line.
  const dx = w.tx - w.x;
  const dy = w.ty - w.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.35) {
    w.hold -= dt;
    if (w.hold <= 0) {
      const next = fairyPerch();
      if (next) { w.tx = next.x; w.ty = next.y; }
      const [lo, hi] = DIWATA.wildHoverMs;
      w.hold = (lo + rng() * (hi - lo)) / 1000;
    }
  } else {
    const step = Math.min(d, DIWATA.wildSpeed * dt * Math.min(1, 0.35 + d / 3));
    w.x += (dx / d) * step;
    w.y += (dy / d) * step;
    if (Math.abs(dx) > 0.2) w.face = Math.sign(dx);
  }

  // Caught.
  for (const a of G.actors) {
    if (a.dead) continue;
    if (Math.abs(a.x - w.x) > 0.85 + a.w / 2) continue;
    if (Math.abs(a.y - a.h / 2 - w.y) > 0.95 + a.h / 2) continue;
    G.wildFairy = null;
    G.pops.push({ x: w.x, y: w.y, at: G.time, colour: DIWATA.colour, glyph: "\u271a" });
    G.bursts.push({ x: w.x, y: w.y, at: G.time, colour: DIWATA.colour, big: true });
    a.glowUntil = G.time + 0.45;
    a.glowFor = 0.45;
    a.glowColour = DIWATA.colour;
    fx.punch(0.04);
    giveFairy(a);
    break;
  }
}

function tickFairies(dt) {
  tickWildFairy(dt);

  for (const a of G.actors) {
    const f = a.fairy;
    if (!f) continue;

    if (f.leaving) {
      f.wave += dt;
      if (f.wave > DIWATA.leaveMs / 1000) a.fairy = null;
      continue;
    }
    if (a.dead) continue;

    // She will not spend one on someone already full — the clock simply
    // waits, so she is never wasted on a heal that does nothing. Her ceiling
    // is one above everything else's.
    if (a.hp >= DIWATA.hpMax) {
      f.next = Math.max(f.next, G.time + 0.4);
      continue;
    }
    if (G.time < f.next) continue;

    a.hp = Math.min(DIWATA.hpMax, a.hp + 1);
    f.left--;
    f.healAt = G.time;
    f.next = G.time + DIWATA.everyMs / 1000;
    G.pops.push({ x: a.x, y: a.y - a.h * 0.7, at: G.time, colour: DIWATA.colour, glyph: "\u271a" });
    fx.sfx("lunas");
    if (f.left <= 0) { f.leaving = true; f.wave = 0; }
  }
}

function spawnSquad(at = null) {
  const made = [];
  const floor = widestFloor();
  if (!floor || floor.x1 - floor.x0 < 6) return made;
  // Somewhere along the floor, but not right on top of either player —
  // unless they were bought, in which case they land where you are.
  let home = at;
  if (home === null) {
    let best = -1;
    for (let i = 0; i < 8; i++) {
      const x = floor.x0 + 2 + rng() * (floor.x1 - floor.x0 - 4);
      const d = Math.min(...G.actors.map((a) => Math.abs(a.x - x)));
      if (d > best) { best = d; home = x; }
    }
  }
  home = Math.max(floor.x0 + 2, Math.min(floor.x1 - 1, home));

  for (let i = 0; i < SQUAD.count; i++) {
    const off = (i - (SQUAD.count - 1) / 2) * SQUAD.spread;
    const m = makeActor(home + off, floor.y, "bubu");
    m.w *= SQUAD.scale;
    m.h *= SQUAD.scale;
    m.baseW = m.w;
    m.baseH = m.h;
    m.stats = { ...SQUAD.stats };
    m.hp = 99;
    m.face = off < 0 ? 1 : -1;   // facing inward, so the huddle reads as one
    m.vy = -4;
    const mini = {
      actor: m,
      owner: null,                // nobody's yet
      home: home + off,
      until: G.time + SQUAD.waitMs / 1000,
      jumpAt: 0,
      leaving: false,
      wave: 0,
    };
    G.minis.push(mini);
    made.push(mini);
  }
  fx.sfx("tatlo");
  return made;
}

function summonSquad(owner) {
  // They ADD to whatever you already have rather than replacing it — that is
  // the whole point of buying a second squad. Your existing ones also get
  // their clock refreshed, so a stack expires together instead of dribbling
  // away one Bubu at a time.
  const mine = G.minis.filter((m) => m.owner === owner.id && !m.leaving);
  const room = STACK.maxMinis - mine.length;
  const life = G.time + SQUAD.lifeMs / 1000;
  for (const m of mine) m.until = Math.max(m.until, life);

  if (room <= 0) {
    showStack(owner, SQUAD.colour, "Mini Bubus!", `${mine.length} of them, longer`, "\u2022\u2022\u2022");
    fx.sfx("helperSave");
    return;
  }

  // Claim only the ones this call just made. Claiming every unowned mini
  // would also pocket a WILD squad standing on the field waiting to be
  // collected — buying one reward should not quietly take another.
  const fresh = spawnSquad(owner.x);
  claimSquad(owner, fresh.slice(0, room));
  // Anything over the cap simply never joined; send it away rather than
  // leaving it standing there unowned in the middle of your squad.
  for (const m of fresh.slice(room)) m.leaving = true;
}

function claimSquad(owner, list = null) {
  const target = G.actors.find((o) => o !== owner);
  for (const m of list || G.minis) {
    if (m.owner || m.leaving) continue;
    m.owner = owner.id;
    m.until = G.time + SQUAD.lifeMs / 1000;
    m.actor.speedMul = 1;
    m.actor.face = target ? Math.sign(target.x - m.actor.x) || 1 : 1;
  }
  const total = G.minis.filter((m) => m.owner === owner.id && !m.leaving).length;
  fx.note(owner, SQUAD.colour, "Mini Bubus!",
    total > SQUAD.count ? `${total} little Bubus, all yours.` : "Three little Bubus, on your side.");
  fx.sfx("helperSave");
}

function tickMinis(dt) {
  // A new squad walks in on its own clock, but only while there is not
  // already one waiting to be collected. Squads someone has ALREADY claimed
  // do not block it — otherwise taking them would stop any more arriving,
  // and both players are allowed to have their own at once.
  const unclaimed = G.minis.some((m) => !m.owner && !m.leaving);
  if (!unclaimed) {
    G.squadAt -= dt;
    if (G.squadAt <= 0) {
      G.squadAt = SQUAD.everyMs / 1000;
      spawnSquad();
    }
  }
  if (!G.minis.length) return;

  // Unclaimed: the first player to touch any of them takes all three.
  if (G.minis.some((m) => !m.owner && !m.leaving)) {
    for (const a of G.actors) {
      if (a.dead) continue;
      const hit = G.minis.some(
        (m) =>
          !m.owner && !m.leaving &&
          Math.abs(a.x - m.actor.x) < (a.w + m.actor.w) / 2 + 0.2 &&
          Math.abs(a.y - m.actor.y) < 1.2
      );
      if (hit) { claimSquad(a); break; }
    }
  }

  for (let i = G.minis.length - 1; i >= 0; i--) {
    const m = G.minis[i];
    const me = m.actor;

    if (m.leaving) {
      m.wave += dt;
      if (m.wave > 0.7) G.minis.splice(i, 1);
      continue;
    }

    let input = { left: false, right: false, jumpDown: false, jumpHeld: false, dropDown: false };
    let others = [];

    if (!m.owner) {
      // Waiting to be collected: shuffling about where they landed, not
      // patrolling. Three small things pacing looks like a threat; three
      // small things fidgeting on the spot looks like they are waiting.
      me.speedMul = SQUAD.idleSpeedMul;
      const drift = me.x - m.home;
      if (drift < -SQUAD.idleRange) me.face = 1;
      else if (drift > SQUAD.idleRange) me.face = -1;
      else if (rng() < 0.5 * dt) me.face *= -1;
      input.left = me.face < 0;
      input.right = me.face > 0;
      if (!groundAhead(me, me.face) || wallAhead(me, me.face)) {
        input.left = input.right = false;
        me.face *= -1;
      }
      // A little hop now and then, so a waiting squad is not three statues.
      if (me.grounded && G.time * 1000 - m.jumpAt > 900 && rng() < 0.5 * dt) {
        input.jumpDown = true;
        m.jumpAt = G.time * 1000;
      }
      input.jumpHeld = true;
      stepActor(me, input, G.grid, dt, [], {
        onDeath: () => { m.leaving = true; m.wave = 0; },
      });
      if (G.time > m.until) { m.leaving = true; m.wave = 0; }
      continue;
    }

    const target = G.actors.find((o) => o.id !== m.owner);

    if (target && !target.dead) {
      const guarded = !!(target.power && target.power.type === "bituin");
      const safe = !!(target.invulnUntil && G.time < target.invulnUntil) || guarded;

      const floor = widestFloor();
      let aimX = target.x + target.vx * 0.28;
      if (floor) aimX = Math.max(floor.x0 + 1, Math.min(floor.x1, aimX));
      // While they cannot be hurt, hang back a body's width rather than
      // pile into them — same rule Dudu follows, for the same reason.
      if (safe) aimX += Math.sign(me.x - target.x || 1) * 2.6;

      const dx = aimX - me.x;
      const dir = Math.sign(dx);
      const above = me.y - target.y;
      input.left = dx < -0.25;
      input.right = dx > 0.25;

      const blocked = !groundAhead(me, dir) || wallAhead(me, dir);
      const close = Math.abs(dx) < 2 && Math.abs(above) < 1.2;
      if (
        me.grounded &&
        G.time * 1000 - m.jumpAt > 260 &&
        (above > 0.8 || blocked || (close && !safe))
      ) {
        input.jumpDown = true;
        m.jumpAt = G.time * 1000;
      }
      input.jumpHeld = true;

      if (me.grounded && !input.jumpDown && !groundAhead(me, dir)) {
        input.left = false;
        input.right = false;
      }
      const below = target.y - me.y;
      if (me.grounded && below > 0.6 && Math.abs(target.x - me.x) < 2 && onDropThrough(me)) {
        input.dropDown = true;
        input.jumpDown = false;
      }
      // Only the target is solid to them, so they run through each other and
      // through the player who called them.
      if (!safe) others = [target];
    }

    stepActor(me, input, G.grid, dt, others, {
      onStomp: (by, victim) => {
        if (victim.power && victim.power.type === "bituin") {
          by.vy = -10;
          m.leaving = true;
          m.wave = 0;
          return;
        }
        // Credited to whoever they are running for, not to the small white
        // bear doing the landing — `by` here is the mini itself.
        fx.sfx("stomp");
        killPlayer(victim, G.actors.find((q) => q.id === m.owner) || null,
                   m.owner ? "bubus" : "strayBubu");
        fx.shake(14);
        m.leaving = true;
        m.wave = 0;
      },
      onDeath: () => {
        m.leaving = true;
        m.wave = 0;
      },
    });

    if (G.time > m.until) {
      m.leaving = true;
      m.wave = 0;
    }
  }
}

function clearPower(a, quiet = false) {
  if (!a.power) return;
  if (a.power.type === "laki") {
    a.w = a.baseW;
    a.h = a.baseH;
  }
  if (a.power.type === "bilis") {
    a.speedMul = 1;
    a.jumpMul = 1;
  }
  if (a.power.type === "suntok") a.punch = null;
  a.power = null;
  if (!quiet) fx.sfx("powerEnd");
  fx.power(a);
}

const hasPower = (a, t) => a.power && a.power.type === t;

function overlapping(a, b) {
  return (
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
    Math.abs(a.y - a.h / 2 - (b.y - b.h / 2)) < (a.h + b.h) / 2
  );
}

function deathFocus(a) {
  return {
    x: Math.max(1, Math.min(G.level.w - 1, a.x)),
    y: Math.max(1, Math.min(G.level.h - 1, a.y - a.h * 0.5)),
  };
}

function deathLine(a) {
  const nameOf = (id) => {
    const p = PLAYERS.find((q) => q.id === id);
    return p ? p.name : null;
  };
  const them = nameOf(a.id) || "they";
  const c = a.cause || {};
  const who = nameOf(c.by);

  // A fall shortly after Bad Dudu let go is his, not theirs.
  const thrown = a.thrownAt != null && G.time - a.thrownAt < 4;

  switch (c.how) {
    case "stomp":  return who ? `${who} finishes ${them} with a stomp` : `${them} is stomped`;
    case "star":   return who ? `${who} runs ${them} down with the star` : `${them} runs into the star`;
    case "shot":   return who ? `${who} shoots ${them}` : `a bullet finds ${them}`;
    case "punch":  return who ? `${who} ends ${them} with one punch` : `one punch ends ${them}`;
    case "dudu":   return who ? `Dudu finishes ${them} for ${who}` : `Dudu finishes ${them}`;
    case "bubus":  return who ? `${who}'s mini Bubus swarm ${them}` : `the mini Bubus swarm ${them}`;
    case "strayBubu": return `a stray mini Bubu lands on ${them}`;
    case "spikes": return thrown ? `Bad Dudu throws ${them} onto the spikes` : `${them} lands on the spikes`;
    case "fall":   return thrown ? `Bad Dudu throws ${them} off the map` : `${them} falls off the map`;
    default:       return thrown ? `Bad Dudu throws ${them} off the map` : `${them} is out of health`;
  }
}

function handleDeath(a) {
  // The match is already being won; nothing that happens during the slow
  // motion gets to change who won it or end the round a second time.
  if (G.finishAt) return;
  clearPower(a, true);
  // A fist in mid-air when you die does not get to land afterwards.
  a.punch = null;
  const before = a.hp;
  // Normally a death costs one heart. A punch is the exception — it is
  // flagged lethal at the point of contact and takes the whole bar.
  const lethal = !!a.lethal;
  a.lethal = false;
  a.hp = lethal ? 0 : Math.max(0, a.hp - 1);

  // Everything stops for a beat, then resumes in slow motion — except the
  // blow that takes the match, which is set up below and never stops at all.
  G.freeze = HIT.freezeMs / 1000;
  G.slow = HIT.slowMoMs / 1000;
  G.slowRate = HIT.slowMoRate;

  fx.shake(HIT.shake);
  fx.punch(HIT.punch);
  fx.flash(1);
  // And the camera drops the framing rule and dives onto the body. See the
  // kill cam in render.js — it is time-boxed and hands the camera back.
  fx.killCam({ ...deathFocus(a), t: 0, ms: HIT.killCamMs });

  // Debris at the point of impact, and the heart they just lost thrown clear.
  G.bursts.push({ x: a.x, y: a.y - a.h * 0.55, at: G.time, colour: "#ff4d6d", big: true });
  G.lostHearts.push({
    x: a.x,
    y: a.y - a.h * 1.5,
    vx: (rng() - 0.5) * 3,
    vy: -7,
    spin: (rng() - 0.5) * 9,
    rot: 0,
    at: G.time,
    index: before - 1,
  });

  fx.sfx("die");

  /* They do not vanish.
   *
   * A death used to be a character ceasing to exist and a puff of white where
   * they had been — which costs a heart and shows you nothing, and left the
   * kill cam driving in on an empty patch of ground. The body is kept and
   * thrown: away from whoever did it, up, spinning, and it settles and fades.
   * Render integrates this from `at`; it is animation, not physics, so it
   * cannot collide with anything or be stomped again.
   */
  const killer = a.cause && a.cause.by ? G.actors.find((o) => o.id === a.cause.by) : null;
  const away = killer ? Math.sign(a.x - killer.x) || 1 : (a.face || 1) * -1;
  a.defeat = {
    at: G.time,
    x: a.x,
    y: a.y,
    vx: away * (3.2 + rng() * 1.6),
    vy: -9.5,
    spin: away * (5 + rng() * 4),
    lethal,
  };

  if (a.hp > 0) return;

  // The kill that takes the match is the last thing that happens in a game,
  // so the camera holds on it: it drives further in and never lets go, and
  // the result comes up over the body rather than over an empty wide shot.
  const winnerId = a.id === "p1" ? "p2" : "p1";
  if (score[winnerId] + 1 >= ROUNDS_TO_WIN) {
    fx.killCam({
      ...deathFocus(a),
      t: 0,
      ms: HIT.winCamMs,
      zoom: HIT.winCamZoom,
      hold: true,
    });
    // No freeze, a long slow crawl instead, and the round is not called until
    // it has run — so the camera drives into something that is still moving.
    G.freeze = 0;
    G.slow = HIT.winSlowMoMs / 1000;
    G.slowRate = HIT.winSlowRate;
    G.finishAt = performance.now() + HIT.winSlowMoMs;
    G.finishWith = { winnerId, why: deathLine(a) };
    return;
  }
  endRound(winnerId, deathLine(a));
}

function killPlayer(victim, by, how = "stomp") {
  if (victim.dead) return;
  if (victim.invulnUntil && G.time < victim.invulnUntil) return;

  // The grace after being hit is DEFENSIVE. It is the only thing that sets
  // invulnUntil, so an attacker who has it is someone who just respawned or
  // was just recovered — and they were able to land on whoever happened to be
  // standing at the respawn point and kill them, while being untouchable
  // themselves. Being unable to retaliate against someone killing you is the
  // worst version of this bug. A star is different: it is meant to kill on
  // contact, and it is a power, not grace.
  if (by && by.invulnUntil && G.time < by.invulnUntil) return;
  // A star makes you untouchable, whoever is doing the touching. Bullets
  // already skipped a star-holder and the player-versus-player stomp turned it
  // around on the attacker, but Dudu came through this function and could
  // kill someone who was supposed to be invincible.
  if (victim.power && victim.power.type === "bituin") return;
  // Recorded on the victim rather than passed down, because `kill()` in
  // physics.js is also the one that fires for a pit and it has no idea who
  // was involved. handleDeath reads whichever of the two got there.
  victim.cause = { how, by: by ? by.id : null };
  kill(victim, { onDeath: handleDeath });
}

function tickPowers(dt) {

  // spawn
  G.powerAt -= dt;
  if (G.powerAt <= 0 && G.meta.powerSpots.length) {
    G.powerAt = POWER_SPAWN_MS / 1000;
    // The spots come from the tilemap, but the arena eats its floor inward as
    // the round runs — so by the middle of a round the outer spots are hanging
    // over open air. A power-up nobody can reach is worse than no power-up:
    // you watch it, you go for it, and you fall. Only offer the spots that
    // still have something under them, and if none do, put it over whatever
    // floor is left.
    const free = G.meta.powerSpots.filter(
      (sp) => !G.powers.some((q) => q.x === sp.x && q.y === sp.y) && standingRoom(sp)
    );
    const floor = widestFloor();
    const sp = free.length
      ? free[Math.floor(rng() * free.length)]
      : floor
        ? { x: (floor.x0 + floor.x1 + 1) / 2, y: floor.y - 1.4 }
        : null;
    if (sp) {
      let type = POWER_ORDER[Math.floor(rng() * POWER_ORDER.length)];
      let guard = 0;
      while (type === G.lastPower && guard++ < 8)
        type = POWER_ORDER[Math.floor(rng() * POWER_ORDER.length)];
      G.lastPower = type;
      G.powers.push({ x: sp.x, y: sp.y, type, born: G.time });
      fx.sfx("spawn");
    }
  }

  // pickup
  for (let i = G.powers.length - 1; i >= 0; i--) {
    const q = G.powers[i];
    for (const a of G.actors) {
      if (a.dead) continue;
      if (Math.abs(a.x - q.x) < 0.8 + a.w / 2 && Math.abs(a.y - a.h / 2 - q.y) < 0.9 + a.h / 2) {
        G.powers.splice(i, 1);
        // Contact is the payoff, so it gets its own effect rather than the
        // same small ring a bullet gets: a shockwave where it was taken, a
        // kick to the camera, and the character flashes as it goes in.
        G.pops.push({
          x: q.x,
          y: q.y,
          at: G.time,
          colour: POWERUPS[q.type].colour,
          glyph: GLYPH[q.type] || "",
        });
        G.bursts.push({ x: q.x, y: q.y, at: G.time, colour: POWERUPS[q.type].colour });
        a.glowUntil = G.time + 0.45;
        a.glowFor = 0.45;
        a.glowColour = POWERUPS[q.type].colour;
        fx.punch(0.035);
        givePower(a, q.type);
        break;
      }
    }
  }

  // A spot can lose its floor while a power-up is sitting on it. Take it back
  // rather than leave bait hanging over the drop.
  for (let i = G.powers.length - 1; i >= 0; i--) {
    if (!standingRoom(G.powers[i])) G.powers.splice(i, 1);
  }

  if (G.pops.length) G.pops = G.pops.filter((p) => G.time - p.at < 0.7);

  // Bursts are short; drop them once they have played out.
  if (G.bursts.length) G.bursts = G.bursts.filter((b) => G.time - b.at < 0.6);

  // expiry, and the star's sparkle
  for (const a of G.actors) {
    if (!a.power) continue;
    if (hasPower(a, "bituin") && rng() < dt * 9) fx.sfx("sparkle");
    if (a.power.until !== Infinity && G.time > a.power.until) clearPower(a);
    if (a.power && a.power.type === "baril" && a.power.ammo <= 0) clearPower(a);
  }

  // The star kills on contact from any direction — that is the whole point of
  // it, and it beats being big.
  for (const a of G.actors) {
    if (a.dead || !hasPower(a, "bituin")) continue;
    for (const o of G.actors) {
      if (o === a || o.dead) continue;
      if (hasPower(o, "bituin")) continue; // two stars just bounce off each other
      if (overlapping(a, o)) killPlayer(o, a, "star");
    }
  }

  // bullets
  for (let i = G.shots.length - 1; i >= 0; i--) {
    const b = G.shots[i];
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    const t = tileAt(G.grid, Math.floor(b.x), Math.floor(b.y));
    if (b.life <= 0 || t === "#") {
      if (t === "#") fx.sfx("shotWall");
      G.shots.splice(i, 1);
      continue;
    }
    for (const o of G.actors) {
      if (o.dead || o.id === b.owner) continue;
      if (hasPower(o, "bituin")) continue; // the star shrugs off bullets
      if (
        Math.abs(o.x - b.x) < o.w / 2 + SHOT_RADIUS &&
        Math.abs(o.y - o.h / 2 - b.y) < o.h / 2 + SHOT_RADIUS
      ) {
        G.shots.splice(i, 1);
        fx.sfx("shotHit");
        killPlayer(o, G.actors.find((q) => q.id === b.owner) || null, "shot");
        break;
      }
    }
  }
}

function tryShoot(a) {
  if (hasPower(a, "suntok")) return tryPunch(a);
  if (!hasPower(a, "baril") || a.power.ammo <= 0) return;
  if (G.time * 1000 - a.shotAt < SHOT_COOLDOWN_MS) return;
  a.shotAt = G.time * 1000;
  a.power.ammo--;
  fx.power(a);
  G.shots.push({
    x: a.x + a.face * (a.w / 2 + 0.25),
    y: a.y - a.h * 0.55,
    vx: a.face * SHOT_SPEED,
    vy: 0,
    owner: a.id,
    life: SHOT_LIFE,
  });
  fx.sfx("shoot");
}

function tryPunch(a) {
  const def = POWERUPS.suntok;
  if (!a.power || a.power.ammo <= 0) return;
  if (a.punch && G.time - a.punch.at < def.cooldownMs / 1000) return;
  a.power.ammo--;
  a.punch = { at: G.time, face: a.face, hit: false };
  fx.sfx("suntok");
  fx.power(a);
  if (a.power.ammo <= 0) {
    // Spent, but let the last one land before the power-up disappears.
    a.power.until = G.time + (def.windupMs + def.activeMs) / 1000 + 0.05;
  }
}

function punchPhase(a) {
  if (!a.punch) return null;
  const def = POWERUPS.suntok;
  const t = (G.time - a.punch.at) * 1000;
  if (t < def.windupMs) return { state: "wind", t: t / def.windupMs };
  if (t < def.windupMs + def.activeMs)
    return { state: "out", t: (t - def.windupMs) / def.activeMs };
  return null;
}

function tickPunches() {
  const def = POWERUPS.suntok;
  for (const a of G.actors) {
    const ph = punchPhase(a);
    if (!ph || ph.state !== "out" || a.punch.hit || a.dead) continue;
    const fx = a.x + a.punch.face * (a.w / 2 + def.reach * 0.6);
    const fy = a.y - a.h * 0.55;
    for (const o of G.actors) {
      if (o === a || o.dead) continue;
      // A radial blast centred on the fist rather than a box the size of the
      // fist. Behind you it stops almost at once, so the punch still has to
      // be aimed — but a near miss in front now connects, which is the whole
      // difference between "one of my three landed" and "none did".
      const ox = o.x - fx;
      const oy = (o.y - o.h / 2) - fy;
      // "Is he in front of me" is measured from the PLAYER, not from the
      // fist. Measuring it from the fist — which is nearly two tiles out —
      // classified anyone standing right against you as being BEHIND the
      // punch, so the one range you cannot miss from was the one range that
      // never connected.
      const forward = (o.x - a.x) * a.punch.face;
      if (forward < -def.blastBehind) continue;
      const d = Math.hypot(ox, oy * 0.85) - (o.w + o.h) / 4;
      if (d > def.blastRadius) continue;
      a.punch.hit = true;
      a.punch.blastAt = G.time;
      // One punch. Not one heart — everything, spare hearts included. That is
      // the trade the Suntok makes: three swings, each one has to be thrown
      // from arm's length and each one can miss, so the one that lands ends
      // the round. A star still stops it outright.
      o.lethal = true;
      // Sent flying whether or not it kills — a star turns the damage aside
      // but not the shove, so surviving a punch still costs you your footing.
      o.vx = a.punch.face * def.knockback;
      o.vy = -6.4;
      // The landing gets its own weight: a hit-stop, a hard shake, a flash,
      // a big burst at the fist and a ring of sparks thrown outward. A one-
      // punch kill that looked like a bullet hit was the complaint.
      G.bursts.push({ x: fx, y: fy, at: G.time, colour: def.colour, big: true });
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        G.bursts.push({
          x: fx + Math.cos(ang) * def.blastRadius * 0.55,
          y: fy + Math.sin(ang) * def.blastRadius * 0.4,
          at: G.time + i * 0.005,
          colour: i % 2 ? "#ffd7a0" : def.colour,
        });
      }
      G.pops.push({ x: fx, y: fy, at: G.time, colour: def.colour, glyph: GLYPH.suntok || "" });
      G.freeze = Math.max(G.freeze, 0.13);
      G.slow = Math.max(G.slow, 0.22);
      fx.shake(46);
      fx.punch(0.085);
      fx.flash(0.42);
      fx.sfx("badHit");
      fx.sfx("shotHit");
      killPlayer(o, a, "punch");
      // Cleared straight after, because killPlayer may refuse the kill (a
      // shield, a star, i-frames) and a flag left set would make their NEXT
      // death — a plain fall, minutes later — take the whole bar.
      o.lethal = false;
      break;
    }
  }
}

function spawnHelper() {
  const lv = G.level;
  const fromLeft = rng() < 0.5;

  const spot = edgeFooting(fromLeft);
  if (!spot) return;
  const { col, y } = spot;

  // A real actor, so he falls, collides and jumps exactly like a player does.
  const actor = makeActor(col + 0.5, y, "dudu");
  actor.stats = { ...HELPER.stats };
  actor.baseW = actor.w;
  actor.baseH = actor.h;
  actor.hp = 99;

  const h = {
    actor,
    ally: null,
    done: false,
    until: G.time + HELPER.stayMs / 1000,
    // A ceiling that never moves, so a player who chains immunity cannot keep
    // him on the field indefinitely by freezing his hunt clock.
    hardUntil: G.time + HELPER.maxStayMs / 1000,
    waiting: false,
    wanderDir: fromLeft ? 1 : -1,
    jumpAt: 0,
    pause: 0,
    locked: false,
    pouncing: false,
    leaving: false,
    wave: 0,
  };
  G.helpers.push(h);
  fx.sfx("helper");
  return h;
}

function summonDudu(owner) {
  // Already have one of your own out? He stays and works longer. Replacing
  // him would be the reward quietly cancelling itself: a fresh Dudu with a
  // fresh fifteen seconds is worth LESS than one with twelve left plus this.
  const had = G.helpers.find((h) => h.ally === owner.id && !h.bad && !h.leaving);
  if (had) {
    const base = HELPER.huntMs / 1000;
    had.until = Math.min(G.time + base * STACK.maxDurationMul, had.until + base);
    // The hard ceiling exists to stop chained immunity parking him on the
    // field forever; a stack is a legitimate way past it, so it moves with him.
    had.hardUntil = Math.max(had.hardUntil || 0, had.until + 1);
    had.waiting = false;
    showStack(owner, "#ffb84d", "Dudu", `${Math.round(had.until - G.time)}s of hunting`, "\ud83d\udc3b");
    fx.sfx("helper");
    return;
  }

  // Emphatically NOT `G.helpers = []` first. A Dudu already wandering the
  // arena belongs to nobody yet and either player can still go and meet him;
  // deleting him because someone else spent ten coins takes a live chance off
  // the field. The bought one simply joins him.
  const h = spawnHelper();
  if (!h) return;
  // Put him beside his new ally rather than out at the edge.
  h.actor.x = owner.x + (owner.face || 1) * -1.4;
  h.actor.y = owner.y;
  h.ally = owner.id;
  h.until = G.time + HELPER.huntMs / 1000;
  h.actor.speedMul = 1;
  h.pause = 0;
  fx.note(owner, "#ffb84d", "Dudu", "Bought and paid for. He is on your side.");
  fx.sfx("helper");
}

function edgeFooting(fromLeft) {
  const lv = G.level;
  for (let step = 0; step < lv.w; step++) {
    const c = fromLeft ? 2 + step : lv.w - 3 - step;
    if (c < 1 || c > lv.w - 2) break;
    for (let ty = 2; ty < lv.h; ty++) {
      const t = G.grid.rows[ty][c];
      if (t === "#" || t === "=") {
        if (G.grid.rows[ty - 1][c] === ".") return { col: c, y: ty };
        break;
      }
    }
  }
  return null;
}

function repelBadDudu(h, victim) {
  const face = Math.sign(victim.x - h.actor.x) || victim.face || 1;
  h.bad = false;
  h.ally = null;
  h.victim = null;
  h.betrayAt = null;
  h.leaving = true;
  h.wave = 0;
  h.actor.vx = -face * BAD_HELPER.launchVx * 0.55;
  h.actor.vy = BAD_HELPER.launchVy * 0.8;
  h.actor.grounded = false;
  h.actor.speedMul = 0;

  G.bursts.push({ x: h.actor.x, y: h.actor.y - h.actor.h * 0.5, at: G.time,
                  colour: "#ffe66b", big: true });
  G.pops.push({ x: victim.x, y: victim.y - victim.h * 0.6, at: G.time,
                colour: "#ffe66b", glyph: GLYPH.bituin || "\u2605" });
  G.freeze = Math.max(G.freeze, 0.1);
  fx.shake(30);
  fx.punch(0.06);
  fx.note(victim, "#ffe66b", "Nice try", "He bounced. The star does not care.");
  fx.sfx("badHit");
}

function untouchableNow(a) {
  if (!a) return false;
  if (a.power && a.power.type === "bituin") return true;
  return !!(a.invulnUntil && G.time < a.invulnUntil);
}

function beginBetrayal(h, victim) {
  // Untouchable beats the grab. Same test the hunt already uses to decide
  // that chasing this player is pointless, so there is one definition of
  // "cannot be touched" rather than two that can drift apart.
  if (untouchableNow(victim)) return repelBadDudu(h, victim);

  h.bad = true;
  h.ally = null;
  h.victim = victim.id;
  h.betrayAt = G.time;
  h.thrown = false;
  h.actor.speedMul = 0;
  h.actor.face = Math.sign(victim.x - h.actor.x) || h.actor.face;

  // Held. frozenUntil is already the "your buttons do nothing" flag, so the
  // grab costs nothing new, and it covers the transform and the wind-up.
  const hold = (BAD_HELPER.transformMs + BAD_HELPER.holdMs) / 1000;
  victim.frozenUntil = G.time + hold;
  victim.vx = 0;
  victim.vy = 0;

  fx.note(victim, "#a970ff", "Bad Dudu", "That was not Dudu.");
  fx.sfx("badWind");
  fx.shake(14);
}

function tickBetrayal(h, dt) {
  const me = h.actor;

  if (h.leaving) {
    h.wave += dt;
    if (h.wave > 1.2) h.done = true;
    return;
  }

  const victim = G.actors.find((a) => a.id === h.victim);
  const ms = (G.time - h.betrayAt) * 1000;
  const done = BAD_HELPER.transformMs + BAD_HELPER.holdMs;

  if (victim && !victim.dead) {
    if (!h.thrown) {
      // Pinned beside him and off the ground for as long as he has hold.
      victim.x = me.x + (me.face || 1) * 0.9;
      victim.y = me.y - 0.35;
      victim.vx = 0;
      victim.vy = 0;
      victim.grounded = false;
    }
    if (!h.thrown && ms >= done) {
      h.thrown = true;
      victim.frozenUntil = 0;
      throwPlayer(victim, me.face || 1);
    }
  } else if (!h.thrown) {
    h.thrown = true;   // they died in his hands; nothing left to throw
  }

  if (h.thrown && ms > done + 420) {
    h.leaving = true;
    h.wave = 0;
    fx.sfx("poof");
  }

  // He never moves during it. Still stepped, so he falls if the floor goes
  // out from under him mid-throw.
  stepActor(
    me,
    { left: false, right: false, jumpDown: false, jumpHeld: false, dropDown: false },
    G.grid, dt, [],
    { onDeath: () => { h.leaving = true; h.wave = 0; } }
  );
}

function throwPlayer(a, face) {
  // The throw does not kill — the map does, a second later, and by then the
  // death looks exactly like walking off a ledge. Stamped here so the fall
  // can still be credited to whoever launched them.
  a.thrownAt = G.time;
  const floor = widestFloor();
  if (floor) {
    const centre = (floor.x0 + floor.x1 + 1) / 2;
    face = a.x === centre ? face : Math.sign(a.x - centre);
  }
  a.vx = face * BAD_HELPER.launchVx;
  a.vy = BAD_HELPER.launchVy;
  a.launchFor = BAD_HELPER.launchFor / 1000;
  a.grounded = false;
  a.punch = null;
  G.bursts.push({ x: a.x, y: a.y - a.h * 0.55, at: G.time, colour: "#a970ff", big: true });
  G.freeze = 0.09;
  fx.shake(40);
  fx.punch(0.07);
  fx.sfx("badHit");
}

function tickHelper(dt) {
  // The timer only runs while there is no UNCLAIMED Dudu out — same rule the
  // squad follows. Someone owning one must not stop the next stranger
  // arriving, or buying a Dudu would quietly turn the spawner off.
  const loose = G.helpers.some((h) => !h.ally && !h.bad && !h.leaving);
  if (!loose && G.helpers.length < STACK.maxHelpers) {
    G.helperAt -= dt;
    if (G.helperAt <= 0) {
      G.helperAt = HELPER.everyMs / 1000;
      spawnHelper();
    }
  }

  for (const h of G.helpers.slice()) tickOneHelper(h, dt);
  if (G.helpers.some((h) => h.done)) G.helpers = G.helpers.filter((h) => !h.done);
}

function tickOneHelper(h, dt) {
  if (h.bad) return tickBetrayal(h, dt);

  const me = h.actor;

  if (h.leaving) {
    h.wave += dt;
    if (h.wave > 1.2) h.done = true;
    return;
  }

  const ally = h.ally ? G.actors.find((a) => a.id === h.ally) : null;
  const target = ally ? G.actors.find((a) => a.id !== h.ally) : null;

  let input = { left: false, right: false, jumpDown: false, jumpHeld: false, dropDown: false };
  let others = [];

  if (!ally) {
    // --- nobody has reached him yet: ambling about, looking lost
    me.speedMul = HELPER.idleSpeedMul;

    if (h.pause > 0) {
      h.pause -= dt;
    } else {
      if (rng() < HELPER.idlePauseChance * dt) {
        const [lo, hi] = HELPER.idlePauseMs;
        h.pause = (lo + rng() * (hi - lo)) / 1000;
      } else if (rng() < HELPER.idleTurnChance * dt) {
        h.wanderDir *= -1;
      }
      input.left = h.wanderDir < 0;
      input.right = h.wanderDir > 0;
    }

    if (!groundAhead(me, h.wanderDir) || wallAhead(me, h.wanderDir)) {
      h.wanderDir *= -1;
      input.left = input.right = false;
    }
    if (me.x < 1.5) h.wanderDir = 1;
    if (me.x > G.level.w - 1.5) h.wanderDir = -1;

    for (const a of G.actors) {
      if (a.dead) continue;
      if (Math.abs(a.x - me.x) > (a.w + me.w) / 2) continue;
      if (Math.abs(a.y - me.y) > 1.2) continue;
      // A literal coin flip, HERE, on contact — not at spawn. There is nothing
      // to read beforehand and nothing to do about it afterwards.
      if (rng() < HELPER.betrayChance) {
        beginBetrayal(h, a);
        break;
      }
      h.ally = a.id;
      h.until = G.time + HELPER.huntMs / 1000;
      me.speedMul = 1;
      h.pause = 0;
      fx.note(a, "#ffb84d", "Dudu", "He is on your side. He roams, and jumps them if they get close.");
      fx.sfx("helper");
      break;
    }
  } else if (target && !target.dead) {
    me.speedMul = 1;
    // --- on your side: roams the arena, and commits when they get close
    //
    // Not while they are still flashing, though. A player who has just been
    // hit is untouchable, so attacking them does literally nothing — he was
    // spending his fifteen seconds bouncing off someone he could not hurt.
    // Anything that makes them unhittable makes chasing them pointless: the
    // grace after a hit, or a star.
    const untouchable = untouchableNow(target);
    const dist = Math.hypot(target.x - me.x, target.y - me.y);
    h.waiting = untouchable;
    if (untouchable) {
      h.locked = false;
      // Hold the clock. Spending the window on someone who cannot be hurt is
      // the same as not having the window at all.
      h.until += dt;
    } else if (!h.locked && dist < HELPER.detectTiles) h.locked = true;
    else if (h.locked && dist > HELPER.giveUpTiles) h.locked = false;

    if (h.locked) {
      // Aim ahead of them by however long it takes him to get there, but
      // never past the edge of what floor is left — leading a runner towards
      // a vanished ledge is how he kept sprinting off the arena.
      const lead = me.grounded ? HELPER.leadGround : HELPER.leadAir;
      const floor = widestFloor();
      let aimX = target.x + target.vx * lead;
      if (floor) aimX = Math.max(floor.x0 + 1, Math.min(floor.x1, aimX));
      const dx = aimX - me.x;
      const dir = Math.sign(dx);
      const above = me.y - target.y; // positive when the target is higher

      // Steer tightly in the air so he comes down ON them, loosely on the
      // ground so he does not jitter on the spot beside them.
      const dead = me.grounded ? HELPER.groundDeadzone : HELPER.airDeadzone;
      input.left = dx < -dead;
      input.right = dx > dead;

      const blocked = !groundAhead(me, dir) || wallAhead(me, dir);
      // The pounce: alongside and level, so hop to get over their head.
      // Pounce on the LED position, not the current one.
      const pounce =
        Math.abs(dx) < HELPER.pounceTiles && Math.abs(above) < HELPER.pounceLevel;

      if (
        me.grounded &&
        G.time * 1000 - h.jumpAt > HELPER.jumpCooldownMs &&
        (above > 0.9 || blocked || pounce)
      ) {
        input.jumpDown = true;
        h.jumpAt = G.time * 1000;
        if (pounce) h.pouncing = true;
      }
      input.jumpHeld = true;
      if (me.grounded) h.pouncing = false;

      // Standing on the lip of a drop with no jump queued: stop. Otherwise he
      // walks off chasing someone on the far side of a gap.
      if (me.grounded && !input.jumpDown && !groundAhead(me, dir)) {
        input.left = false;
        input.right = false;
      }

      // Directly above them on a platform he can fall through: drop.
      // Without this he stands on the ledge looking down at someone he has no
      // other way of reaching — the platforms are one-way, so the only route
      // down is the same one a player would take.
      const below = target.y - me.y;
      if (me.grounded && below > 0.6 && Math.abs(target.x - me.x) < 2.2 && onDropThrough(me)) {
        input.dropDown = true;
        input.jumpDown = false;
      }

      // Only the target is solid to him, so he runs straight past his ally.
      others = [target];
    } else if (h.waiting) {
      // --- waiting them out: keeps station a few tiles off, facing them, and
      // closes the moment the shine goes. Standing still would read as broken;
      // chasing would read as attacking. Shadowing reads as patience.
      const gap = target.x - me.x;
      const dir = Math.sign(gap) || 1;
      if (Math.abs(gap) > HELPER.waitTiles) {
        input.left = dir < 0;
        input.right = dir > 0;
      } else if (Math.abs(gap) < HELPER.waitTiles * 0.6) {
        input.left = dir > 0;
        input.right = dir < 0;
      }
      if (!groundAhead(me, input.left ? -1 : 1) || wallAhead(me, input.left ? -1 : 1)) {
        input.left = input.right = false;
      }
      me.face = dir;
      others = [target];
    } else {
      // --- roaming: his own patrol, hopping between ledges
      input.left = h.wanderDir < 0;
      input.right = h.wanderDir > 0;
      const blocked = !groundAhead(me, h.wanderDir) || wallAhead(me, h.wanderDir);
      if (me.grounded && G.time * 1000 - h.jumpAt > HELPER.jumpCooldownMs) {
        // Jump the gap sometimes and turn round others, so he actually gets
        // about the arena instead of pacing one ledge for the whole fifteen
        // seconds.
        if (blocked) {
          if (rng() < 0.55) {
            input.jumpDown = true;
            h.jumpAt = G.time * 1000;
          } else h.wanderDir *= -1;
        } else if (rng() < HELPER.wanderJumpChance * dt) {
          input.jumpDown = true;
          h.jumpAt = G.time * 1000;
        }
      }
      input.jumpHeld = true;
      if (me.grounded && !input.jumpDown && !groundAhead(me, h.wanderDir)) {
        input.left = false;
        input.right = false;
        h.wanderDir *= -1;
      }
      const floor = widestFloor();
      if (floor) {
        if (me.x < floor.x0 + 1.5) h.wanderDir = 1;
        if (me.x > floor.x1 - 0.5) h.wanderDir = -1;
      }
      // Still solid to the target, so a lucky landing still counts.
      others = [target];
    }
  }

  stepActor(me, input, G.grid, dt, others, {
    onStomp: (by, victim) => {
      // Landing on a star is a mistake, not an attack — it throws him off and
      // he gives up rather than pinballing off someone he cannot hurt.
      if (victim.power && victim.power.type === "bituin") {
        by.vy = -12;
        fx.sfx("land");
        h.leaving = true;
        h.wave = 0;
        return;
      }
      // Credited to whoever he is working for, not to the bear.
      fx.sfx("stomp");
      killPlayer(victim, G.actors.find((q) => q.id === h.ally) || null, "dudu");
      fx.shake(16);
      // He did what he came for.
      h.leaving = true;
      h.wave = 0;
      fx.sfx("poof");
    },
    onDeath: () => {
      // He fell off the world; put him back rather than losing him silently.
      h.leaving = true;
      h.wave = 0;
    },
  });

  if (G.time > h.until || G.time > h.hardUntil) {
    h.leaving = true;
    h.wave = 0;
    fx.sfx("poof");
  }
}

function groundAhead(a, dir) {
  const x = Math.floor(a.x + dir * 0.9);
  for (let d = 0; d <= 2; d++) {
    const row = G.grid.rows[Math.floor(a.y + d)];
    const c = row && row[x];
    if (c === "#" || c === "=") return true;
  }
  return false;
}

function onDropThrough(a) {
  const tx = Math.floor(a.x);
  for (const y of [Math.floor(a.y), Math.floor(a.y + 0.06)]) {
    const row = G.grid.rows[y];
    if (row && row[tx] === "=") return true;
  }
  return false;
}

function wallAhead(a, dir) {
  const x = Math.floor(a.x + dir * 0.9);
  const row = G.grid.rows[Math.floor(a.y - 0.5)];
  return !!(row && row[x] === "#");
}

function simulate(dt) {
  const opts = {
    onDeath: handleDeath,
    onStomp: (by, victim) => {
      // A star beats everything, including being landed on.
      if (hasPower(victim, "bituin")) {
        killPlayer(by, victim, "star");
        return;
      }
      // Being big means you get bounced off, not squashed.
      if (hasPower(victim, "laki")) {
        fx.shake(8);
        fx.sfx("land");
        return;
      }
      fx.sfx("stomp");
      killPlayer(victim, by, "stomp");
    },
    onJump: () => fx.sfx("jump"),
    onLand: () => fx.sfx("land"),
  };
  for (const a of G.actors) {
    const pad = pads[a.id];
    const frozen = a.frozenUntil && G.time < a.frozenUntil;
    const flipped = a.reversedUntil && G.time < a.reversedUntil;
    const input = {
      left: frozen ? false : flipped ? pad.right : pad.left,
      right: frozen ? false : flipped ? pad.left : pad.right,
      jumpDown: frozen ? false : pendingJump[a.id],
      jumpHeld: frozen ? false : pad.jumpHeld,
      dropDown: frozen ? false : pad.drop,
    };
    // Frozen still falls — being iced mid-air should not park you in the sky.
    if (frozen) a.vx *= 0.82;
    stepActor(a, input, G.grid, dt, G.actors, opts);
    if (pendingShot[a.id]) tryShoot(a);
  }
  pendingJump.p1 = false;
  pendingJump.p2 = false;
  pendingShot.p1 = false;
  pendingShot.p2 = false;
}

export function applyCorrection(view, rngAt, hostPhase) {
  if (!G || !view) return;

  /* Catch up if the host has already started playing.
   *
   * The round start is announced, so both countdowns normally run together —
   * but if that one message is late or lost, this side is left counting down
   * against a round that is already happening, being dragged about by
   * corrections it cannot act on. Which is precisely "it shakes and the intro
   * never starts". Skip to the end of the count and join in.
   */
  /* The phase is the host's, FULL STOP — including out of the countdown.
   *
   * This used to set `countdown = 0` and leave the frame loop to notice.
   * That works only while the frame loop is running, and if it is not — a
   * thrown frame, a tab the browser has throttled, a hitch during startup —
   * the round is stuck in a countdown that can never tick, wearing a card
   * whose entry animation is frozen at nought per cent, which is an empty
   * ring and a banner that never goes away. Nothing recovers from that,
   * because the one thing that could is the thing that has stopped.
   *
   * Taking the phase directly means the network can always drag this side
   * back into the round on its own.
   */
  if (view.score) { score.p1 = view.score.p1; score.p2 = view.score.p2; }
  if (view.roundNo) roundNo = view.roundNo;
  if (hostPhase && hostPhase !== phase) {
    phase = hostPhase;
    if (phase !== "countdown") {
      countdown = 0;
      fx.count(null);
      if (phase === "play") fx.banner(null);
    }
  }

  for (const a of G.actors) {
    const t = view.actors.find((o) => o.id === a.id);
    if (!t) continue;

    // Anything the RULES decide is taken as given, always: the host is the
    // authority on who got hit and who is holding what.
    a.hp = t.hp;
    a.dead = t.dead;
    a.respawn = t.respawn;
    a.coins = t.coins;

    /* Position is different, and YOUR OWN body is different again.
     *
     * The host's copy of you is a round trip old — it has not seen the last
     * few frames of your thumbs yet. Easing onto it every correction drags
     * you backwards thirty times a second against your own input, which is
     * exactly the shake: you press right, you move right, and something keeps
     * tugging you left. So your own body is left alone unless the gap is big
     * enough to mean something real happened that you have not simulated —
     * a stomp, a throw, a respawn — and those arrive as `dead` anyway.
     *
     * The other player is the opposite case: he is simulated here from his
     * inputs, nothing local owns him, and the host's copy is simply better.
     */
    const mine = a.id === "p2";
    const gap = Math.hypot(t.x - a.x, t.y - a.y);
    if (t.dead || gap > (mine ? CORRECT_MINE : CORRECT_SNAP)) {
      a.x = t.x; a.y = t.y; a.vx = t.vx; a.vy = t.vy;
    } else if (!mine) {
      a.x += (t.x - a.x) * CORRECT_EASE;
      a.y += (t.y - a.y) * CORRECT_EASE;
      a.vx += (t.vx - a.vx) * CORRECT_EASE;
      a.vy += (t.vy - a.vy) * CORRECT_EASE;
    }
  }
  /* Everything that is NOT a player is taken outright.
   *
   * Power-ups, coins, Dudu, the squad, the fairy, bullets, debris: the guest
   * no longer simulates any of it, so there is nothing local to preserve and
   * nothing to blend. Thirty times a second it is simply told, and it is
   * cheap — this is the list that was already being sent.
   */
  G.powers = view.powers;
  G.coins = view.coins;
  G.shots = view.shots;
  G.bursts = view.bursts;
  G.pops = view.pops;
  G.lostHearts = view.lostHearts;
  G.minis = view.minis;
  G.helpers = view.helpers;
  G.wildFairy = view.wildFairy;
  // The clock too, so anything timed off it — a power-up running out, the
  // grace after a hit, Dudu's fifteen seconds — counts down in step.
  G.time = view.time;

  /* The floor, when the host sends it.
   *
   * The arena eats itself inward all round, off each side's own accumulated
   * dt, so the two can end up one tile apart — and one tile of floor is the
   * difference between standing and falling. Rows only ride the keyframes,
   * which is often enough.
   */
  if (view.grid && view.grid.rows && G.grid.rows.length === view.grid.rows.length) {
    G.grid.rows = view.grid.rows;
  }

  // And rejoin the host's place in the random stream, so the next thing that
  // is decided is decided the same way on both phones.
  if (rngAt) setRngState(rngAt);
}

/* ----------------------------------------------------------------- tick --- */

/**
 * One slice of game.
 *
 * Fixed-step inside: the accumulator means the rules always advance in 1/120
 * pieces however often this is called, so a phone at 60 and a server at 30
 * get the same physics rather than merely similar physics.
 */
export function step(dt) {
  if (phase === "lobby") return;
  dropStaleInput();
  if (phase === "countdown") {
    countdown -= dt;
    const n = Math.max(0, Math.ceil(countdown));
    if (n !== lastCount) {
      lastCount = n;
      // Each tick lands: a sound, a camera kick, and the number itself snaps
      // in from oversize. It used to be small grey text under the mode name,
      // which is not a countdown so much as a footnote.
      // SMASH!! is the last card and the biggest; n === 0 is the round
      // actually starting, which clears the card rather than adding a fourth.
      fx.punch(n > 1 ? 0.045 : 0.1);
      fx.shake(n > 1 ? 8 : 22);
      if (n <= 1) fx.flash(0.35);
      n > 1 ? fx.sfx("count") : fx.sfx("go");
      fx.count(n);
    }
    if (countdown <= 0) {
      phase = "play";
      fx.music("duck", false);
      fx.banner(null);
    }
  }

  // "matchover" belongs in this list. Leaving it out stopped drawing, the
  // panels AND the broadcast the moment a match ended — so the other phone
  // was never told it was over and never got the Rematch button, and the
  // winner's arena froze solid behind the banner.
  if (G && phase !== "lobby") {
    // Hit-stop, then a brief slow motion. The clock the simulation runs on is
    // the one that stops; drawing carries on at full rate so the freeze reads
    // as impact rather than as a dropped frame.
    let sim = dt;
    if (G.freeze > 0) {
      G.freeze -= dt;
      sim = 0;
      acc = 0;
    } else if (G.slow > 0) {
      G.slow -= dt;
      sim = dt * (G.slowRate || HIT.slowMoRate);
      if (G.slow <= 0) G.slowRate = HIT.slowMoRate;
    }

    acc += sim;
    let guard = 0;
    while (acc >= STEP && guard++ < 8) {
      acc -= STEP;
      if (phase === "play") simulate(STEP);
    }
    /* The WORLD is the host's, and only the host's.
     *
     * Running these on both phones was the mistake. Two simulations on the
     * same seed still tick at different frame rates and get their input at
     * different moments, so they consume the random stream at different
     * points — and from there one phone spawns a power-up the other does not,
     * Dudu arrives somewhere else, a coin is taken on one and not the other.
     * They were playing different games, which is exactly what it looked
     * like. No amount of correcting ACTORS fixes that, because the actors
     * were never the part that had diverged.
     *
     * So the guest does not run them at all. It gets the whole world off the
     * wire thirty times a second and predicts only the two players between
     * corrections — which is what a client in any of these games actually
     * does. The server owns the world; you predict yourself.
     */
    if (phase === "play" && sim > 0 && authority) {
      tickPowers(sim);
      tickCoins(sim);
      tickFairies(sim);
      tickHelper(sim);
      tickMinis(sim);
      tickPunches();
      tickRules(sim);
    }
    G.time += sim;
    if (G.lostHearts.length) {
      for (const h of G.lostHearts) {
        h.vy += 26 * dt;
        h.x += h.vx * dt;
        h.y += h.vy * dt;
        h.rot += h.spin * dt;
      }
      G.lostHearts = G.lostHearts.filter((h) => G.time - h.at < 1.1);
    }
  }
}

export { applyPacket, startRound, endRound, clearPower, hasPower, punchPhase, deathLine, overlapping };
