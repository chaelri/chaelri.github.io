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
  MODES, PLAYERS, ROUNDS_TO_WIN, FEEL, HELPER, BAD_HELPER, SQUAD, DIWATA, COINS, HIT,
  POWERUPS, POWER_ORDER, POWER_SPAWN_MS, POWER_FIRST_MS,
  SHOT_SPEED, SHOT_LIFE, SHOT_COOLDOWN_MS, SHELL_COOLDOWN_MS, SHOT_RADIUS, STACK, ABILITY, BOX, KING, ALL_POWERS, SPAWN_CLEAR,
  GRAVITY, JUMP_VELOCITY,
} from "./config.js";
import { makeArena, readLevel, solidGrid } from "./levels.js";
import { makeActor, stepActor, kill, reviveAt, poseOf, tileAt } from "./physics.js";
import { rng, seed as seedRng, newSeed, rngState, setState as setRngState } from "./rng.js";
import { charById } from "./characters.js";
import { abilityLook, abilityOf, abilityReady, tickCharges } from "./ability.js";
import { forceRound, rollRound, roundCard, heartsOn, applyBody, pinHeld, tryGrab, modeHit, modeFall, onCoin, coinsWanted, pickPower, powerEvery, tickRound } from "./rounds.js";

/* Is this copy of the rules the one that DECIDES?
 *
 * On a server, yes: it owns the world and says who won. In a browser that is
 * following along it is false, and the same file then only predicts — it
 * still runs the physics so the players move without waiting for anything,
 * but it does not spawn power-ups, hand out rewards or call a round. That is
 * the one behavioural difference between the two places this runs.
 */
let authority = true;

/* Which of the two players is sitting in front of THIS copy.
 *
 * Only a client needs it, and only for one decision: your own body is never
 * eased toward a correction, because the server's copy of you is a round trip
 * old and easing onto it drags you backwards against your own thumbs. The
 * other player is the opposite — nothing local owns him, so the correction is
 * simply better than the guess.
 */
let localRole = null;

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
  if (opts.role !== undefined) localRole = opts.role;
  // { mode, mod } pins the wheel — tests use it to get a plain Smash round.
  if (opts.round) forceRound(opts.round.mode, opts.round.mod);
}

/* ---------------------------------------------------------------- state --- */

let phase = "lobby";   // lobby | countdown | play | roundover | matchover
let G = null;
let countdown = 0;
/** When the GO card comes down, a beat INTO the round. See the countdown. */
let cardUntil = 0;
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
const seenSkills = { p1: 0, p2: 0 };
const pendingJump = { p1: false, p2: false };
const pendingShot = { p1: false, p2: false };
// The character's own move is its OWN button, so that a dash can be thrown
// into a punch and a hop can be followed by a shot. One thumb, one thing.
const pendingSkill = { p1: false, p2: false };
const seenRematch = { p1: 0, p2: 0 };
const lastSeq = { p1: 0, p2: 0 };
const lastKey = { p1: null, p2: null };
const lastHeard = { p1: 0, p2: 0 };

let acc = 0;
const STEP = 1 / 120;
/* The unit the network counts in: one input, one of these, on both sides.
 * Two of the simulation's own 1/120 pieces. */
export const TICK = 1 / 60;

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
  /* What the server has actually SEEN of each thumb.
   * It rides back in every snapshot so a client can tell which of the
   * inputs it has sent are already baked into the picture it is looking
   * at, and re-run only the ones that are not. */
  get acks() { return { p1: lastSeq.p1, p2: lastSeq.p2 }; },

  /* Whether the rules are actually advancing, or the world is held still.
   *
   * A landed hit stops the clock for a tenth of a second so the blow reads as
   * weight. During that the server must ALSO stop taking inputs — it consumes
   * exactly one per simulated tick, and a tick it does not simulate is a tick
   * it has no business consuming one for. It used to take them anyway, and
   * then tell the client it had seen them: the client trimmed those inputs
   * out of its history and stopped replaying them, having already predicted
   * them, while the server never simulated them at all. A whole hit-stop's
   * worth of movement, silently discarded, every time anybody got hit — and
   * the bench put it at one to two tiles. It only became obvious once the
   * abilities arrived, because an ability injects velocity and velocity
   * integrates.
   */
  get frozen() { return !!(G && G.freeze > 0); },
  /* A fresh connection counts its ticks from one again.
   *
   * The room outlives a phone: reload the page, or come back after the train
   * goes through a tunnel, and the server is still holding the sequence
   * number the LAST connection reached. Every input from the new one is then
   * "older than what we have" and silently dropped — the game looks perfect,
   * runs at full rate, and the buttons do nothing at all. */
  /* A cold lobby, for a room that has just been opened.
   *
   * The rules are module state and the server process outlives any particular
   * pair of phones, so a room created tomorrow starts life holding the score
   * and the phase of the last match played — and `startMatch()` only fires
   * out of "lobby". Two phones opening the game then land in a finished
   * match, with the Rematch button the only thing that does anything. Which
   * is exactly "it does not start". */
  newSession() {
    phase = "lobby";
    score.p1 = 0;
    score.p2 = 0;
    roundNo = 1;
    G = null;
    countdown = 0;
    lastCount = -1;
    for (const id of ["p1", "p2"]) {
      this.resetInput(id);
      pads[id].connected = false;
    }
  },
  resetInput(role) {
    if (!pads[role]) return;
    lastSeq[role] = 0;
    lastKey[role] = null;
    seenJumps[role] = 0;
    seenShots[role] = 0;
    seenSkills[role] = 0;
    pendingJump[role] = false;
    pendingShot[role] = false;
    pendingSkill[role] = false;
    pads[role].left = pads[role].right = pads[role].jumpHeld = pads[role].drop = false;
  },
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
  // Its OWN counter, and its own `if`. Nested inside the one above it went
  // unread by any packet that carried no `s` at all — which is every packet
  // from anything that only ever presses the skill.
  if (Number.isFinite(p.k)) {
    if (p.k < seenSkills[role]) seenSkills[role] = p.k;
    else if (p.k > seenSkills[role]) {
      seenSkills[role] = p.k;
      pendingSkill[role] = true;
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
  // Only where the pads arrive over a wire. On a client both are handed in
  // every update, so "we have not heard from them" never means anything.
  if (!authority) return;
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
  // Kept a moment, so the next round's mode cannot repeat this one's.
  const prevRd = G && G.rd;
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
    quakes: [],   // where a ground pound landed, and how hard
    boxes: [],    // mystery boxes hanging in the air, and how many bumps left
    king: null,   // King Yhon Yhon, if a box let him out
    boxAt: BOX.firstMs / 1000,
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

  // The mode wheel and the modifier card. See rounds.js.
  rollRound(G, prevRd, rng);

  phase = "countdown";
  fx.result(null);
  // Four seconds, one per card. At 3.2 the first card — BUBU — got the 0.2
  // left over after the other three took a second each, so it flashed for two
  // frames and the count read as DUDU, SMASH, title.
  countdown = 3;
  lastCount = -1;
  // A round can end before the GO card has come down; G.time restarts at
  // zero, so a leftover deadline would take the NEXT round's card off
  // somewhere in the middle of it.
  cardUntil = 0;
  fx.music("start", 138);
  /* Just the round number.
   *
   * It used to be the game's name with the round under it — and the three
   * countdown cards that follow it spell BUBU, DUDU, SMASH, so the title was
   * on screen twice inside two seconds, the second time letter by letter.
   * Charlie, over a screenshot of the two together: "redundant yung
   * bubududusmash sa taas dito." The cards are the better of the two, so the
   * banner keeps the one thing they do not say. */
  const card = roundCard(G, roundNo);
  fx.banner(card.title, card.sub);
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
    a.kingedAt = null;
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

  /* The round ENDS when the floor has gone and somebody drops.
   *
   * Nothing tallies it any more (see where `floorGone` is set): the arena
   * simply stops existing and the last one still in the air has won. If they
   * both go inside the same frame, whoever was higher takes it — which is
   * exactly the sentence Charlie used, "dun magdedecide kung sino mas
   * mataas", and is what anyone watching would call anyway.
   */
  if (G.floorGone && !G.finishAt) {
    const ps = PLAYERS.map((p) => G.actors.find((q) => q.id === p.id)).filter(Boolean);
    if (ps.length === 2) {
      const down = ps.filter((q) => q.dead || q.hp <= 0);
      if (down.length === 1) {
        const won = ps.find((q) => q !== down[0]);
        endRound(won.id, `${down[0].label} ran out of floor first`);
      } else if (down.length === 2) {
        // Both in the same frame: the higher body was the later fall.
        const won = ps[0].y < ps[1].y ? ps[0] : ps[1];
        endRound(won.id, `${won.label} stayed up longest`);
      }
    }
  }

  // respawns
  for (const a of G.actors) {
    if (!a.dead || a.respawn > 0) continue;
    if (a.hp <= 0) continue; // stays down — the round is already over
    // ...and there is nowhere to come back TO once the arena has gone.
    if (G.floorGone) continue;
    const i = G.actors.indexOf(a);
    const at = safeSpawn(i);
    reviveAt(a, at.x, at.y);
    a.cause = null;
    a.thrownAt = null;
    a.kingedAt = null;
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
    /* The floor running out does NOT end the round any more.
     *
     * It used to decide it on the spot — most hearts, then most gems — and
     * the banner simply appeared while both of them were still standing on
     * the last tile. Charlie: "dapat di nagaautoterminate laro agad pag
     * nawala yung arena, it will let the players fall pa rin tapos dun
     * magdedecide kung sino mas mataas ang weird kasi bigla nalang lalabas
     * banner."
     *
     * So the arena simply stops existing and gravity finishes the round: the
     * last one still in the air has won it. That is also a better ending than
     * a tally — it is something you watch rather than something you are
     * told, and there is a second of jumping left in it.
     *
     * `floorGone` is what tells handleDeath to stop respawning anybody; see
     * where it is read. If both are already gone, the tally is still there as
     * the tie-break. */
    if (!widestFloor() && !G.floorGone) {
      G.floorGone = true;
      fx.note(G.actors[0], "#ff8a3b", "NO FLOOR LEFT", "Last one up wins.", "gem");
      fx.sfx("badWind");
      fx.shake(22);
    }
  }
}

/* Nothing left to stand on.
 *
 * The floor eating in from both ends is what guarantees a round ends, and the
 * assumption underneath it was that somebody falls off first. They do not
 * always: the last two planks go in the same frame, both players drop, and
 * whoever the fall check happens to reach first "wins" a round that was
 * actually a draw — or, worse, the second one dies on the way down and the
 * round is awarded to a corpse.
 *
 * So when the arena runs out, it is scored rather than raced. Hearts first,
 * because that is what a round of this game is actually a contest about.
 * Then whoever is still on their feet, which is Charlie's "kung sino
 * nahulog" — someone in the middle of a respawn fell and the other one did
 * not. Coins break a tie that is otherwise exact, and if even those match it
 * goes down as a draw rather than being handed to whoever is listed first.
 */
/* callItOnTheFloor is gone.
 *
 * It decided the round on hearts, then on who was down, then on gems, the
 * instant the last plank went. Nothing calls it now — the arena stops
 * existing and the fall decides it. Deleted rather than left unused,
 * because a scoring function nobody calls is the kind of thing somebody
 * wires back up. */

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
  /* Anything you FIRE has to say what to press.
   *
   * This named the Gun and the Fist, so the Bazooka — the rarest thing in the
   * game, one shell, out of a box you spent three jumps on — arrived with a
   * description and no instruction at all. "how is bazooka even activated"
   * was a fair question and the toast should have answered it. */
  let body = def.desc || "";
  // Endless: there is no number to report, so it says how to use it instead.
  if (def.endless) body = `${def.desc} ${shootPrompt(a.id)}`;
  else if (def.fires && type !== "suntok") {
    const n = a.power ? a.power.ammo : def.ammo;
    body = `${n === 1 ? "One shot" : `${n} shots`}. ${shootPrompt(a.id)}`;
  }
  if (type === "suntok") {
    const n = a.power ? a.power.ammo : 1;
    body = `${n === 1 ? "One punch" : `${n} punches`}. ${shootPrompt(a.id, "punch")}`;
  }
  fx.note(a, def.colour, def.name, body, type);
}


/* Size and speed, worked out from EVERYTHING that is affecting you.
 *
 * Both used to be assigned inside givePower and undone inside clearPower,
 * which works exactly as long as only one thing at a time can change them.
 * The crown broke that: it is not a pickup you find, it is what you get for
 * putting down a boss, and it is meant to last. It lived in the power slot,
 * so taking so much as a Heal off the floor called clearPower on the way past
 * and handed back an ordinary character. Charlie: "kumuha lang ng power up
 * nawala na king status ng character, mawawala lang yun pag nahulog."
 *
 * So the crown is its own flag and this recomputes the two numbers from
 * scratch whenever anything changes. The largest wins rather than the latest:
 * a Grow taken while crowned should not SHRINK you, and its ending should not
 * leave you at ordinary size with a crown still on your head.
 */
function restat(a) {
  const big = a.power && a.power.type === "laki" ? POWERUPS.laki.scale : 1;
  const fast = a.power && a.power.type === "bilis" ? POWERUPS.bilis : null;
  const k = a.crowned ? POWERUPS.korona : null;
  /* HEALTH MAKES YOU BIGGER, on its own.
   *
   * Charlie: "dapat pala the more na mataas hp nung character mas malaki yung
   * character kahit walang big power up, pero mas malaki shempre pag full hp
   * tapos may big power up pa."
   *
   * It is a good rule because it makes the health bar redundant at a glance —
   * you can read how a round is going from across the room without reading
   * anything. It also cuts both ways: a big target is easier to land on, so
   * being ahead costs you something, which is exactly what a game like this
   * wants.
   *
   * Three per cent a heart, from the three you start with, so nine hearts is
   * about a fifth bigger and the difference is felt rather than announced.
   * MULTIPLIED by Grow and the crown rather than maxed against them, because
   * "bigger still" is the whole of the sentence. */
  const heart = 1 + Math.max(0, (a.hp || FEEL.hp) - FEEL.hp) * 0.03;
  const scale = Math.max(big, k ? k.scale : 1) * heart;
  const was = a.h;
  a.w = a.baseW * scale;
  a.h = a.baseH * scale;
  // Grow upward, or the new body is shoved through the floor it is standing
  // on. Only when it actually grew.
  if (a.h > was) a.y -= 0.02;
  a.speedMul = Math.max(fast ? fast.speed : 1, k ? k.speed : 1);
  a.jumpMul = Math.max(fast ? fast.jump : 1, k ? k.jump : 1);
}

function givePower(a, type) {
  const def = POWERUPS[type];

  // Two of them do their whole job to the OTHER player and are spent at once,
  // so they never become a state you are "holding".
  if (type === "lunas" || type === "puso") {
    /* The Big Heart SETS you to nine, which is now simply the ceiling; a Heal
     * adds one towards it.
     *
     * Setting rather than adding is still the right shape for it: it is the
     * rarest thing in a box, and "+3" handed to a player on seven would open
     * the box, play the fanfare and move the bar by less than a Heal lying on
     * the floor. */
    if (def.set) a.hp = def.set;
    /* A heal can never LOWER you.
     *
     * When the ceilings disagreed this was load-bearing: take the Big Heart
     * out of a box, stand on nine, walk over an ordinary Heal — and the flat
     * `Math.min(5, hp + 1)` it used to be clamped you to five. Charlie: "9
     * healths tapos kumuha ng heart bumaba ... yung limit naging 5".
     *
     * There is one ceiling now and it cannot happen, and it is still written
     * this way on purpose: the cap belongs to what a pickup may ADD, never to
     * what you already have, so the next ceiling change cannot bring it back.
     * Past the cap it simply does nothing. */
    else a.hp = Math.max(a.hp, Math.min(FEEL.hpMax, a.hp + def.heal));
    // Gaining one makes you bigger, the same way losing one makes you smaller.
    restat(a);
    G.flash = { type, at: G.time };
    showPickup(a, type);
    fx.sfx("lunas");
    return;
  }

  /* The Shield does not go in the weapon slot.
   *
   * It used to, so walking over one took the Bazooka off you — the rarest
   * thing in the game, spent on a defensive buff you did not choose to trade
   * for it. Charlie: "nakita ko naman nareplace yung bazooka ng shield tbh
   * dapat pwede yon sabay." They are different KINDS of thing: one is what
   * your fire button does, the other is whether anything can touch you, and
   * nothing about holding a gun says you cannot also be behind glass.
   *
   * Its own field, so the two never meet. Picking a second one up extends
   * the first rather than restarting it, the same as every stacking rule
   * here. */
  if (type === "kalasag") {
    const base = def.ms / 1000;
    const had = (a.shieldUntil || 0) > G.time;
    a.shieldUntil = had
      ? Math.min(G.time + base * STACK.maxDurationMul, a.shieldUntil + base)
      : G.time + base;
    G.flash = { type, at: G.time };
    if (had) showStack(a, def.colour, def.name, "longer", type);
    else showPickup(a, type);
    fx.sfx(type);
    return;
  }

  if (type === "yelo" || type === "baliktad") {
    for (const o of G.actors) {
      if (o === a || o.dead) continue;
      if (untouchableNow(o)) continue;
      if (type === "yelo") o.frozenUntil = G.time + def.freezeMs / 1000;
      else o.reversedUntil = G.time + def.reverseMs / 1000;
    }
    G.flash = { type, at: G.time };
    showPickup(a, type);
    fx.sfx(type);
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
    fx.sfx(type);
    showStack(a, def.colour, def.name, mag ? `${a.power.ammo} now` : "longer", type);
    fx.power(a);
    return;
  }

  clearPower(a, true);
  a.power = {
    type,
    until: def.ms ? G.time + def.ms / 1000 : Infinity,
    ammo: mag,
  };
  restat(a);
  fx.sfx(type);
  showPickup(a, type);
  fx.power(a);
}

/**
 * How far the nearest living player is from a point, in tiles.
 *
 * The one question every spawner has to ask. Dead players do not count —
 * they are not standing anywhere yet, and treating a corpse's last position
 * as occupied would push spawns away from somewhere nobody is.
 */
function playerGap(sp) {
  let best = Infinity;
  for (const a of G.actors) {
    if (a.dead) continue;
    best = Math.min(best, Math.hypot(a.x - sp.x, a.y - sp.y));
  }
  return best;
}

/**
 * Pick from `spots`, preferring anywhere at least `clear` tiles from both
 * players — and if nothing is that far, taking the furthest there is.
 *
 * The fallback is the whole point. Late in a round the floor is a handful of
 * tiles wide and both players are standing on it; a filter that returns an
 * empty list there means no more pickups for the rest of the round, which is
 * a worse outcome than a pickup landing a bit close.
 */
function spawnAwayFrom(spots, clear) {
  if (!spots.length) return null;
  const roomy = spots.filter((sp) => playerGap(sp) >= clear);
  if (roomy.length) return roomy[Math.floor(rng() * roomy.length)];
  let best = spots[0], bestGap = -1;
  for (const sp of spots) {
    const gap = playerGap(sp);
    if (gap > bestGap) { bestGap = gap; best = sp; }
  }
  return best;
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
  if (live < coinsWanted(G)) {
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
            // Not merely "not under their feet" — a short walk away, or one
            // player hoovers up everything that appears while they stand still.
            playerGap(p) < SPAWN_CLEAR.coin;
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
      onCoin(G, a);

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
      /* No screen shake for a coin.
       *
       * It grew with the count, so the tenth one threw the camera about — and
       * you pick up coins constantly, which made the most routine thing in
       * the game one of the most disruptive. The zoom kick stays, because it
       * reads as a little pop rather than as a jolt, and the rising pitch is
       * what actually tells you the count is climbing. */
      fx.punch(0.012 + a.coins * 0.004);

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
  G.pops.push({ x: a.x, y: a.y - a.h * 0.6, at: G.time, colour: COINS.colour, glyph: "bituin" });
  a.glowUntil = G.time + 0.7;
  a.glowFor = 0.7;
  a.glowColour = COINS.colour;

  if (pick === "diwata") { giveFairy(a); return; }
  /* Everything else on the list is simply a power-up.
   *
   * ...except that a Gun must not arrive and take a Bazooka off you. It is
   * the same refusal the pickup makes, and it matters more here because a
   * coin counter hitting ten is not a thing you can step around: you get the
   * Shield instead, which is the reward nobody is ever sad to see. */
  const give = (pick === "baril" && a.power && ALL_POWERS[a.power.type]?.op)
    ? "kalasag" : pick;
  givePower(a, give);
}

function giveFairy(a) {
  // A second Diwata queues more heals behind the first rather than restarting
  // her at two — she is one of four things ten coins can buy, and buying the
  // same one twice should not be the worst of the four.
  if (a.fairy && !a.fairy.leaving) {
    a.fairy.left = Math.min(STACK.maxFairyHeals, a.fairy.left + DIWATA.heals);
    showStack(a, DIWATA.colour, DIWATA.name, `${a.fairy.left} hearts waiting`, "plus");
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
  fx.note(a, DIWATA.colour, DIWATA.name, "Two hearts, one at a time.", "plus");
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
    G.pops.push({ x: w.x, y: w.y, at: G.time, colour: DIWATA.colour, glyph: "plus" });
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
    // IS everything else's now; she used to stop one short of the Big Heart's
    // and one above the floor Heal's, which is three different answers to
    // "why has it stopped".
    if (a.hp >= FEEL.hpMax) {
      f.next = Math.max(f.next, G.time + 0.4);
      continue;
    }
    if (G.time < f.next) continue;

    // Same rule as the Heal above: cap the addition, never the total. The
    // guard a few lines up already skips a full player, but a heal that CAN
    // subtract is a bug waiting for the next ceiling change.
    a.hp = Math.max(a.hp, Math.min(FEEL.hpMax, a.hp + 1));
    restat(a);
    f.left--;
    f.healAt = G.time;
    f.next = G.time + DIWATA.everyMs / 1000;
    G.pops.push({ x: a.x, y: a.y - a.h * 0.7, at: G.time, colour: DIWATA.colour, glyph: "plus" });
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
    total > SQUAD.count ? `${total} little Bubus, all yours.` : "Three little Bubus, on your side.",
    "squad");
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
      const guarded = isStar(target);
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
        if (isStar(victim)) {
          by.vy = -10;
          m.leaving = true;
          m.wave = 0;
          return;
        }
        // Credited to whoever they are running for, not to the small white
        // bear doing the landing — `by` here is the mini itself.
        fx.sfx("stomp");
        killPlayer(victim, G.actors.find((q) => q.id === m.owner) || null,
                   m.owner ? "bubus" : "strayBubu", SQUAD.damage);
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

  if (a.power.type === "suntok") a.punch = null;
  a.power = null;
  restat(a);
  if (!quiet) fx.sfx("powerEnd");
  fx.power(a);
}

const hasPower = (a, t) => a.power && a.power.type === t;

/**
 * Is this one untouchable-and-lethal-on-contact?
 *
 * The Star, and King Yhon Yhon's Crown, which is a Star and a Big at once.
 * Fifteen places in this file tested `type === "bituin"` by name, and every
 * one of them would have had to learn the Crown's name too — so the question
 * is asked of the power-up instead, via its `star` flag. Add a third and
 * nothing here changes.
 */
// The crown counts too, and it is no longer in the power slot to be found
// by the second half of this.
const isStar = (a) => !!(a && (a.crowned || (a.power && ALL_POWERS[a.power.type]?.star)));

/**
 * Untouchable, but not lethal to touch — the Shield.
 *
 * Kept apart from `isStar` on purpose: a Star turns contact around on the
 * attacker, a Shield just refuses it. Somebody running into a shielded player
 * should bounce off and carry on, not lose the round.
 */
// Its own field, not the power slot — see givePower. A shield and a weapon
// are different kinds of thing and you may hold both.
const isShielded = (a) => !!(a && a.shieldUntil && G.time < a.shieldUntil);

/* A Star or a Shield turns aside the SHOVE as well as the damage.
 *
 * They were two different promises: damage went through killPlayer, which has
 * always refused both, and being thrown went through half a dozen places that
 * did not ask. So a shielded player was still launched off the arena by a
 * Ground Pound, still frozen solid by an Ice, and still sent across the map
 * by a fist — the map doing the killing that the power-up had just refused to
 * let anyone do. Charlie: "dapat pag may star or shield power up immune ako sa
 * knock up ni yhon ground pound, king yhon ground pound, frozen, star,
 * bazooka, one punch man (even yung talbog)."
 */
const isWarded = (a) => isStar(a) || isShielded(a);

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
  /* ...and a fall shortly after the KING landed is his.
   *
   * It beats every other reading, including the star and the stomp, because
   * nothing else that happens in a round is King Yhon Yhon. Charlie asked for
   * the words. */
  if (a.kingedAt != null && G.time - a.kingedAt < 4) return "SHOW RESPECT TO THE KING!";

  // Thrown by the other player — a grab, or a knock in a no-hearts mode.
  if (a.grabThrownBy && G.time - (a.grabThrownAt || -9) < 4 && (c.how === "fall" || c.how === "spikes"))
    return `${nameOf(a.grabThrownBy)} throws ${them} off the map`;
  switch (c.how) {
    case "bomb":   return `the bomb goes off in ${them}'s hands`;
    case "lava":   return `${them} sinks into the lava`;
    case "stomp":  return who ? `${who} finishes ${them} with a stomp` : `${them} is stomped`;
    case "star":   return who ? `${who} runs ${them} down with the star` : `${them} runs into the star`;
    case "bazuka": return who ? `${who} puts a shell through ${them}` : `${them} takes a shell`;
    case "shot":   return who ? `${who} shoots ${them}` : `a bullet finds ${them}`;
    case "punch":  return who ? `${who} ends ${them} with one punch` : `one punch ends ${them}`;
    // The sword had no line at all, so a death by Excalibur read as "out of
    // health" — the most anonymous sentence in the list, for the loudest
    // weapon in the game. "lagyan mo description when kill by excalibur."
    case "espada": return who ? `${who} cuts ${them} down with Excalibur`
                              : `Excalibur cuts ${them} down`;
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
  /* Did they LEAVE THE BOARD, or just lose a heart?
   *
   * kill() in physics.js sets `dead` before it calls us, and a hit never
   * does — killPlayer comes straight here. That one bit is the difference
   * between falling off the map and being stomped, and everything below that
   * is "you lose what you were holding" hangs on it. */
  const fell = !!a.dead;
  // A fist in mid-air when you die does not get to land afterwards, and
  // neither does a sword.
  a.punch = null;
  a.swing = null;
  /* ...and neither effect follows you out of the grave.
   *
   * Charlie: "kapag namamatay dapat mawaala rin yung reverse effect sa
   * namatay". Reverse and Freeze are deadlines in seconds, and they were only
   * ever reset at the START OF A ROUND — so being reversed and then killed
   * spent the rest of those five seconds on a body that had just respawned
   * somewhere else, holding left to go right for a life you had already paid
   * a heart for. Freeze is worse and had the same hole: you could come back
   * unable to move at all.
   *
   * Cleared HERE rather than at the respawn a second later, because the chip
   * on the card is drawn off these same two fields — clearing late leaves it
   * claiming an effect on a player who is not even on the board. */
  a.reversedUntil = 0;
  a.frozenUntil = 0;
  const before = a.hp;
  // Normally a death costs one heart. A punch is the exception — it is
  // flagged lethal at the point of contact and takes the whole bar.
  const lethal = !!a.lethal;
  a.lethal = false;
  /* How much this one cost, in hearts.
   *
   * A whole one unless whoever did it said otherwise, and rounded to the
   * nearest half on the way out: hp is a float now, and 3 - 0.5 - 0.5 - 0.5
   * in binary is 1.4999999999999998, which draws as a heart and a half but
   * compares as less than one and a half everywhere it matters.
   */
  // Hearts are off outside Smash: a fall costs whatever the mode says.
  const cost = !heartsOn(G) && !lethal ? 0 : a.hitFor == null ? 1 : a.hitFor;
  if (!cost && fell) modeFall(G, a, roundCtx());
  a.hitFor = null;
  a.hp = lethal ? 0 : Math.max(0, Math.round((a.hp - cost) * 2) / 2);
  // Size follows health now — see restat — so losing one has to re-derive it.
  restat(a);

  // Everything stops for a beat, then resumes in slow motion — except the
  // blow that takes the match, which is set up below and never stops at all.
  /* Out of hearts is OUT.
   *
   * A hit stopped setting `dead` when it stopped respawning you, which is
   * right for a hit you survive — but the LAST one left the character
   * standing there as a live actor on zero hearts. The defeat animation plays
   * over the top of them for a second and then ends, and the ordinary sprite
   * is drawn again underneath: they pop back into existence. Charlie:
   * "namatay na nga nagrerespawn pa somehow ... magsstop talaga siya sa
   * pagkamatay."
   *
   * So the killing blow takes them off the board. Not a respawn — the loop
   * that revives people skips anyone on zero — it simply stops them being
   * there, which is what being out of a round means. */
  if (a.hp <= 0 && !a.dead) {
    a.dead = true;
    a.respawn = 0;
    a.vx = 0;
    a.vy = 0;
  }
  const gone = a.dead || a.hp <= 0;

  /* The power-up survives a HIT. It does not survive a fall.
   *
   * clearPower used to run at the top of this function, so every stomp,
   * bullet and mini Bubu took whatever you were holding — a Bazooka you had
   * crossed the arena for, gone to a half-heart graze. That is the same
   * complaint as the respawn-on-hit one and it has the same answer: a hit
   * costs a heart and nothing else. Charlie: "Pag na hit, di dapat narereset
   * yung hawak na skill, unless bumagsak sa stage."
   *
   * The crown goes with it, on the same condition and for the same reason —
   * and since a crowned player cannot be touched at all, a fall is the only
   * way either of them ever reaches this line. */
  if (fell || gone) {
    clearPower(a, true);
    a.crowned = false;
    a.shieldUntil = 0;
    restat(a);
  }
  // A hit you walk away from stops the world for less time and does not put
  // it into slow motion afterwards — that treatment belongs to a life ending.
  G.freeze = gone ? HIT.freezeMs / 1000 : HIT.hurtFreezeMs / 1000;
  if (gone) {
    G.slow = HIT.slowMoMs / 1000;
    G.slowRate = HIT.slowMoRate;
  }

  fx.shake(gone ? HIT.shake : HIT.hurtShake);
  fx.punch(gone ? HIT.punch : HIT.hurtPunch);
  if (gone) fx.flash(1);
  /* The camera only dives on a body that has actually gone.
   *
   * Diving onto a player who is still standing there — and who is about to
   * be shoved and keep playing — throws the framing away mid-fight for
   * something that is not over. It still rides a pit death, and the blow
   * that ends the round gets its own camera further down. */
  if (a.dead || a.hp <= 0) fx.killCam({ ...deathFocus(a), t: 0, ms: HIT.killCamMs });

  // Debris at the point of impact, and the heart they just lost thrown clear.
  G.bursts.push({ x: a.x, y: a.y - a.h * 0.55, at: G.time, colour: "#ff4d6d", big: true });
  if (cost) G.lostHearts.push({
    x: a.x,
    y: a.y - a.h * 1.5,
    vx: (rng() - 0.5) * 3,
    vy: -7,
    spin: (rng() - 0.5) * 9,
    rot: 0,
    at: G.time,
    index: before - 1,
  });

  // "die" is a life ending. A hit you walk away from gets the ordinary
  // impact instead — the same sound anything else landing on you makes.
  fx.sfx(gone ? "die" : "stomp");

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
  /* An explosion throws you away from ITSELF. Anything else throws you away
   * from whoever did it. See `blastFrom` in bazookaBoom. */
  const from = a.blastFrom || killer;
  a.blastFrom = null;
  const away = from ? Math.sign(a.x - from.x) || 1 : (a.face || 1) * -1;
  // ...and only a body that has gone gets thrown. Someone who took a heart
  // and is still playing is animated by the ordinary character code.
  if (a.dead || a.hp <= 0) a.defeat = {
    at: G.time,
    x: a.x,
    y: a.y,
    /* A One Punch throws them OUT.
     *
     * Every other defeat drops the body a few tiles from where it stood,
     * which is right for a stomp. The Suntok is the one blow that ends a
     * round outright and it was landing them in a heap at arm's length —
     * "animation na tatalbog kalaban hanggang dulo". A lethal one leaves at
     * five times the speed and spins twice as hard, so it clears the arena
     * while you are still watching it. */
    vx: away * (lethal ? 30 + rng() * 8 : 3.2 + rng() * 1.6),
    vy: lethal ? -13 : -9.5,
    // ...and a shell throws harder still, and more upward, because a blast
    // lifts you off the ground before it moves you sideways.
    ...(a.cause && a.cause.how === "bazuka"
      ? { vx: away * POWERUPS.bazuka.throw, vy: -POWERUPS.bazuka.throwUp }
      : {}),
    spin: away * (lethal ? 14 + rng() * 6 : 5 + rng() * 4),
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
  /* An ordinary round end waits too.
   *
   * It used to call endRound on the very frame of the death, which put the
   * banner — and the scrim that dims the arena behind it — straight over the
   * body still travelling, the shell still going off, the fall still
   * happening. Same deferral the match-winning blow has always used, just a
   * shorter one, and the kill cam runs underneath it. */
  G.finishAt = performance.now() + HIT.roundBannerMs;
  G.finishWith = { winnerId, why: deathLine(a) };
}

/**
 * Take a life off somebody.
 *
 * `damage` is in HEARTS and may be a fraction — the mini Bubu squad takes
 * half. It rides on the victim rather than being passed down because `kill()`
 * in physics.js is the same door a pit death comes through, and a pit knows
 * nothing about who or how much.
 */
/* Whether a blow can land on this player at all.
 *
 * Every one of killPlayer's early-outs, pulled out where an attacker can ask
 * BEFORE it commits to anything. That matters because `lethal` — the flag
 * that says "this one takes the whole bar, not a heart" — is read by
 * handleDeath and not by killPlayer: a Bazooka or a One Punch that armed it
 * and was then turned away at the door left it armed on the victim's body,
 * and the next ordinary hit they took, a minute later, killed them outright.
 * Charlie: "the bazooka and one punch man overrides damage null when a person
 * just respawn."
 */
function canHit(victim, by, thrown = false) {
  if (!victim || victim.dead) return false;
  // The grace after being hit, and the grace after coming back.
  if (victim.invulnUntil && G.time < victim.invulnUntil) return false;
  /* ...and an ATTACKER who has it cannot swing either. It is defensive and
   * nothing else sets it, so someone with it just respawned — and landing on
   * whoever happens to be standing at the spawn point while being untouchable
   * yourself is the worst version of this.
   *
   * It applies to CONTACT only. A bullet or a shell left your hand before any
   * of this was true, and it is in the world on its own account from then on:
   * Charlie fired a Bazooka, dropped off the map, and watched the shell reach
   * its target and do nothing — because by the time it landed he had
   * respawned, and his own respawn grace was being read as "the attacker
   * cannot swing". "Nung nagland yung bazooka sa enemy bat wala damage dapat
   * patay siya e." He is right: the shot was fired by someone who was alive,
   * aimed, and paid for. */
  if (!thrown && by && by.invulnUntil && G.time < by.invulnUntil) return false;
  // A Star, and the crown, kill on contact and cannot be touched back.
  if (isStar(victim)) return false;
  /* ...and the Shield refuses everything for as long as it lasts.
   *
   * Everything that TAKES A HEART comes through here — stomps, bullets, the
   * fist, the bazooka's blast, the mini squad, a bad Dudu. The drop does not,
   * and must not: it goes through kill() in physics.js, and a shield that
   * covered it would let you sit in the one place the arena cannot reach. */
  if (isShielded(victim)) return false;
  return true;
}

/* What rounds.js needs from this copy of the rules. See js/rounds.js. */
function roundCtx() {
  return {
    fx, rng, standingTiles, standingRoom, widestFloor, canHit, givePower, summonKing, endRound,
    killFall(a, how) {
      a.cause = { how, by: null };
      kill(a, { onDeath: handleDeath });
    },
    /* Hot Potato: the fuse ran out in somebody's hands. */
    detonate(a) {
      G.quakes.push({ x: a.x, y: a.y - a.h / 2, at: G.time, force: 1, kind: 1 });
      a.lethal = true;
      a.cause = { how: "bomb", by: null };
      fx.shake(40);
      fx.flash(1);
      fx.sfx("suntok");
      handleDeath(a);
    },
  };
}

function killPlayer(victim, by, how = "stomp", damage = 1) {
  // Every reason a blow bounces off, in one place. See canHit. A bullet and a
  // shell are THROWN: they are in the world on their own account and do not
  // care what has happened to whoever fired them since.
  if (!canHit(victim, by, how === "shot" || how === "bazuka")) return;
  // Every mode but Smash: no hearts, a hit knocks you back. See rounds.js.
  if (!heartsOn(G)) { modeHit(G, victim, by, how, roundCtx()); return; }
  // Recorded on the victim rather than passed down, because `kill()` in
  // physics.js is also the one that fires for a pit and it has no idea who
  // was involved. handleDeath reads whichever of the two got there.
  victim.cause = { how, by: by ? by.id : null };
  victim.hitFor = damage;

  /* A hit does NOT take you off the board.
   *
   * It used to call kill(), which sets `dead`, starts a respawn clock and
   * puts you back at a spawn point a second later — so every stomp, every
   * bullet, every punch teleported you across the arena. Charlie, watching
   * the boss take three hits without going anywhere: "make it same like king
   * yhon di talaga nagrereset position unless nahulog sa map".
   *
   * So: handleDeath is called DIRECTLY, and it has never touched `dead`
   * itself — kill() does. Falling off the map and landing on spikes still go
   * through kill() from physics.js and still put you back, because there is
   * nowhere to stand when the reason you lost the heart is that there was
   * nowhere to stand.
   *
   * "pag nahulog lang yun."
   *
   * And a hit moves you NOWHERE — no shove either. Being thrown belongs to
   * moves built to throw you: the pound, the punch, the King's landing, a
   * bazooka. All a hit costs is the heart and a moment of grace. */
  handleDeath(victim);
  if (victim.dead || victim.hp <= 0) return;

  /* No shove, either.
   *
   * The respawn came out and a knockback went in to replace it, and that was
   * still the wrong shape: thirteen tiles a second plus a launch flag threw
   * you most of the way across the arena, which is the same complaint in a
   * different costume. Charlie: "not necesarily tatalbog yung character when
   * hit ... parang king yhon yhon nga pag nahit diba di naman tatalbog tapos
   * pupunta sa gitna wag ganon."
   *
   * So a hit moves you NOWHERE. You lose the heart, you flash for a moment,
   * and you are exactly where you were doing exactly what you were doing.
   * Being thrown is what happens when something is designed to throw you —
   * a Ground Pound, a punch, the King landing — and those all still do.
   */
  victim.invulnUntil = Math.max(victim.invulnUntil || 0,
                                G.time + FEEL.hurtInvulnMs / 1000);
}

/* -------------------------------------------------------------- king --- */

/**
 * King Yhon Yhon — the rare thing in a box.
 *
 * Not a pickup: an event. He lands in the middle of whatever floor is left,
 * jumps on the spot, and every landing throws anyone standing on the ground.
 * He is hostile to both players AND to Yhon, so opening his box with the
 * character he is a king of buys nothing.
 *
 * He is an actor so that the ordinary physics moves him and the ordinary
 * bullet, fist and star code can find him, but he is NOT in `G.actors` —
 * that list is the two players and everything downstream of it assumes so
 * (scores, deaths, the round ending). He lives in `G.king` like the wild
 * Diwata lives in `G.wildFairy`.
 */
function summonKing(from) {
  if (G.king) return;                 // one at a time; a second is not a boss
  const floor = widestFloor();
  const at = floor
    ? { x: (floor.x0 + floor.x1 + 1) / 2, y: floor.y }
    : { x: from.x, y: from.y + 2 };
  const a = makeActor(at.x, at.y, "yhon");
  a.char = "yhon";
  a.w *= KING.scale;
  a.h *= KING.scale;
  a.hp = KING.hp;
  a.label = "King";
  a.face = -1;
  G.king = {
    actor: a,
    hp: KING.hp,
    born: G.time,
    until: G.time + KING.lifeMs / 1000,
    jumpAt: G.time + KING.jumpEveryMs / 1000,
    hurtUntil: 0,
    lastHitBy: null,
    leaving: false,
    wave: 0,
  };
  // He arrives with the same weight he lands with, so the entrance reads as
  // the thing he is about to do over and over.
  G.quakes.push({ x: at.x, y: at.y, at: G.time, force: 1 });
  fx.shake(26);
  fx.punch(0.09);
  fx.sfx("suntok");
  fx.note(G.actors[0], KING.colour, "KING YHON YHON", "Three hearts. Everyone's problem.", "pound");
}

/** One heart off the King, from whoever managed it. */
function hurtKing(by, hearts = 1) {
  const k = G.king;
  if (!k || k.leaving) return false;
  // A window after each hit, or a gun burst takes all three in a third of a
  // second and the boss is over before it has jumped twice.
  if (G.time < k.hurtUntil) return false;
  // Everything takes one, except the One Punch — which takes all three. See
  // the punch's own call.
  k.hp -= hearts;
  k.hurtUntil = G.time + KING.hurtInvulnMs / 1000;
  k.lastHitBy = by ? by.id : k.lastHitBy;
  k.actor.hp = k.hp;
  k.actor.invulnUntil = k.hurtUntil;

  /* Make it FELT.
   *
   * This was a white wash over him, a single burst and a shake — and white is
   * what this game already puts on a player during their grace period, the
   * least eventful thing that happens to anyone. So the biggest moment in the
   * round wore the costume of the smallest one. Charlie: "ang panget naman ng
   * hit animation ni boss yhon ... make it more ramdam. di lang white eme".
   *
   * Every tool the game has for weight, aimed at this one moment. */
  k.hitAt = G.time;

  // 1. The world stops. Nothing else here matters as much as this does.
  G.freeze = Math.max(G.freeze, KING.hitFreezeMs / 1000);

  // 2. He is knocked off his feet, away from whoever did it. Replicated for
  //    free, because his position is already on the wire.
  const from = by ? Math.sign(k.actor.x - by.x) || 1 : 1;
  k.actor.vx = from * KING.hitRecoil;
  k.actor.vy = -KING.hitLift;
  k.actor.grounded = false;

  // 3. The ground takes it too — the same crater a pound leaves, small.
  G.quakes.push({ x: k.actor.x, y: k.actor.y, at: G.time, force: 0.45 });
  while (G.quakes.length > 6) G.quakes.shift();

  // 4. A ring of debris off the body, not one puff.
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2;
    G.bursts.push({
      x: k.actor.x + Math.cos(ang) * k.actor.w * 0.4,
      y: k.actor.y - k.actor.h * 0.5 + Math.sin(ang) * k.actor.h * 0.3,
      at: G.time, colour: i % 3 ? KING.colour : "#ff4d6d",
    });
  }

  // 5. The heart he just lost comes OFF him and falls, the way a player's
  //    does. Three hearts is the whole fight; each one leaving should be an
  //    event you can point at.
  G.lostHearts.push({
    x: k.actor.x, y: k.actor.y - k.actor.h * 1.15,
    vx: -from * 4, vy: -8, spin: (rng() - 0.5) * 10, rot: 0,
    at: G.time, index: k.hp,
  });

  fx.shake(KING.hitShake);
  fx.punch(KING.hitPunch);
  fx.sfx("stomp");
  fx.sfx("suntok");
  if (k.hp <= 0) {
    // The last one ends the fight, so it gets the full treatment: the world
    // stops longer and comes back slowly, which is what this game does for
    // every other blow that decides something.
    G.freeze = Math.max(G.freeze, HIT.freezeMs / 1000);
    G.slow = Math.max(G.slow, KING.deathSlowMs / 1000);
    G.slowRate = KING.deathSlowRate;
    crownTheVictor(k);
  }
  return true;
}

/** He is down. Whoever landed the last one wears it. */
function crownTheVictor(k) {
  k.leaving = true;
  k.wave = 0;
  const winner = k.lastHitBy ? G.actors.find((a) => a.id === k.lastHitBy) : null;
  G.quakes.push({ x: k.actor.x, y: k.actor.y, at: G.time, force: 1 });
  for (let i = 0; i < 10; i++) {
    G.bursts.push({ x: k.actor.x, y: k.actor.y - k.actor.h * 0.5, at: G.time, colour: KING.colour });
  }
  fx.shake(30);
  fx.punch(0.1);
  fx.flash(1);
  if (!winner || winner.dead) return;
  /* The crown, as an ordinary power-up.
   *
   * This used to set four loose fields — a deadline, a size, two multipliers
   * — and borrow `invulnUntil` for the untouchable part. `invulnUntil` is the
   * grace after being HIT, so the reward for beating a boss made you flash
   * like someone who had just been hurt and put a "safe" chip on your card,
   * and the toast said "Star" because that is the pickup it borrowed the
   * effect from. givePower does all of it properly: the chip, the clock, its
   * own name, and `star: true` so every rule that asks `isStar` says yes. */
  /* The crown is a FLAG on the player, not the power-up they are holding.
   *
   * givePower put it in the slot, which gave it the chip and the toast for
   * free and cost the thing outright: every pickup goes through clearPower
   * on its way in, so a Heal lying under your feet took the boss you had
   * just beaten off your head. It is kept here instead, where nothing else
   * writes, and only a death takes it. */
  winner.crowned = true;
  restat(winner);
  /* ...and a sword with it, which is bigger than anyone else's — see
   * `kingHearts` in config. It replaces whatever they were holding, Bazooka
   * included: what they have just been given is strictly better, and a king
   * with two fire buttons is not a thing this game can express. */
  givePower(winner, "espada");
  fx.note(winner, KING.colour, "CROWNED", POWERUPS.korona.desc, "korona");
}

/**
 * The King's turn: jump, land, shake the world.
 *
 * He does not chase. Standing still and being enormous is the threat — the
 * arena is small and shrinking, and "the floor is dangerous every second and
 * a half" is a harder problem to solve than something running at you.
 */
function tickKing(dt) {
  const k = G.king;
  if (!k) return;
  const a = k.actor;

  if (k.leaving) {
    k.wave += dt;
    if (k.wave > 0.8) G.king = null;
    return;
  }
  if (G.time > k.until) { k.leaving = true; k.wave = 0; return; }

  // He faces whoever is nearer, which is all the reading anyone needs.
  const near = G.actors.filter((q) => !q.dead)
    .sort((p, q) => Math.abs(p.x - a.x) - Math.abs(q.x - a.x))[0];
  if (near) a.face = Math.sign(near.x - a.x) || a.face;

  const wasAir = !a.grounded;
  stepActor(a, { left: false, right: false, jump: false, jumpHeld: false },
            G.grid, dt, [], {
    onDeath: () => { k.leaving = true; k.wave = 0; },
  });

  if (a.grounded && G.time >= k.jumpAt) {
    a.vy = -KING.jumpVel;
    a.grounded = false;
    k.jumpAt = G.time + KING.jumpEveryMs / 1000;
    fx.sfx("jump");
  }
  // Landed: everything on the floor goes flying.
  if (a.grounded && wasAir) kingLanded(a);
}

/** The King's landing. A player's Ground Pound, three times the size. */
function kingLanded(a) {
  G.quakes.push({ x: a.x, y: a.y, at: G.time, force: 1 });
  while (G.quakes.length > 6) G.quakes.shift();
  fx.shake(24);
  fx.punch(0.08);
  fx.sfx("suntok");
  for (const o of G.actors) {
    /* Nobody who cannot be touched is thrown either — and that INCLUDES the
     * grace after coming back.
     *
     * He lands every second and a half across seven and a half tiles, so a
     * player who respawns anywhere near him is picked straight back up and
     * put over the edge with no frame in between to answer with. Charlie:
     * "star and shield (even from death respawn) should also be immune to
     * king yhon ground pound." untouchableNow is the one definition of it. */
    if (o.dead || untouchableNow(o)) continue;
    const d = Math.hypot(o.x - a.x, o.y - a.y);
    if (d > KING.blast) continue;
    const kk = 1 - d / KING.blast;
    const dir = Math.sign(o.x - a.x) || 1;
    o.vx = dir * KING.knockback * kk;
    o.vy = -KING.upward * kk;
    o.launchFor = Math.max(o.launchFor || 0, 0.25 + (KING.launchMs / 1000) * kk);
    /* Marked as HIS, so the round says so if the map finishes the job.
     *
     * He does not kill anybody directly — he throws them, and the drop does
     * the rest, which would otherwise be reported as "falls off the map" with
     * no mention of the three-metre pig who put them there. Same mechanism
     * the bad Dudu's throw uses, and it lapses on the same clock. */
    o.kingedAt = G.time;
  }
}

/* ------------------------------------------------------------- boxes --- */

/**
 * Mystery boxes: spawning them, breaking them, and what falls out.
 *
 * The box hangs in the air and you open it by jumping into it from below.
 * Three bumps normally, one if you are BIG, and instantly if Yhon lands a
 * Ground Pound on top of it — every character has a way in, and each one's
 * way is the thing that character already does, so nobody has to be taught
 * anything new.
 *
 * It is deliberately a commitment. Three jumps is three landings spent under
 * the same square of sky with somebody else looking for your head, which is
 * why what comes out has to beat anything lying on the floor for free.
 */
/**
 * Touching the King while starred, and what the crown does on a landing.
 *
 * Both are "this player brushed against the world and something happened",
 * and both need the King to exist, so they live together and run once a tick.
 */
function tickKingContact(dt) {
  for (const a of G.actors) {
    if (a.dead) continue;

    /* STOMPING him takes a heart, like it does to anybody else.
     *
     * Charlie: "bakit ground pound lang nakakapatay kay king yhon, dapat
     * kahit sino na tumapak pwede, its not fair for other characters". He was
     * right and it was a real hole: the pound reached him, the gun reached
     * him, the fist and the star reached him — but the one verb every
     * character in the game has, landing on someone's head, did not, because
     * the King is not in `G.actors` and that is the only list `onStomp` ever
     * looks at. So Bubu and Dudu could only hurt a boss while holding
     * something they had to find first, and Yhon could always hurt him.
     *
     * Falling, feet above his head, near enough horizontally — and it bounces
     * you off him the way stomping a player does, so it is survivable and
     * repeatable rather than a trade of your own body for a heart.
     */
    if (G.king && !G.king.leaving && a.vy > 0) {
      const kb = G.king.actor;
      const head = kb.y - kb.h;
      if (Math.abs(a.x - kb.x) < (a.w + kb.w) / 2 &&
          a.y > head - kb.h * 0.35 && a.y < head + kb.h * 0.45) {
        if (hurtKing(a)) {
          // The same bounce a stomped player gives, plus a bit — he is
          // three times the size and should feel like landing on one.
          a.vy = -FEEL.stompBounce * 1.25;
          a.y = head - 0.02;
        }
      }
    }

    /* A star takes one heart off him, like everything else does.
     *
     * Charlie: "Star can just hit 1 heart as well sa kanya". Note it does NOT
     * kill him the way it kills a player — the star's whole promise is that
     * contact ends it, and a boss is the one thing in the game that promise
     * does not hold for. `hurtKing`'s own window stops a starred player
     * standing inside him and draining all three in a tenth of a second. */
    if (G.king && !G.king.leaving && isStar(a)) {
      const kb = G.king.actor;
      if (Math.abs(a.x - kb.x) < (a.w + kb.w) / 2 &&
          Math.abs((a.y - a.h / 2) - (kb.y - kb.h / 2)) < (a.h + kb.h) / 2) {
        hurtKing(a);
      }
    }

    /* The crown: every landing is a Ground Pound.
     *
     * Detected the same way the King's own landing is — airborne last tick,
     * grounded this one. It is the King's move, handed to whoever took it
     * off him, which is why the reward is worth chasing a boss for. */
    /* Anything HEAVY shakes the floor when it lands — the crown, and now Big.
     *
     * Charlie: "isip ko yung big power up, nakakaground pound sha." It is
     * the right instinct and it costs nothing to give: the power-up already
     * makes you a head taller and opens a pinata in one bump, so a landing
     * that throws people is what the size was already promising. It is not
     * Yhon's Ground Pound — there is no dive and no aiming it, you simply
     * weigh something now — and it lasts as long as the power-up does. */
    if ((a.crowned || hasPower(a, "laki")) && a.grounded && a.wasAirborne) {
      crownLanded(a);
    }
    a.wasAirborne = !a.grounded;
  }
  void dt;
}

/** A crowned player hits the floor. */
function crownLanded(a) {
  const R = KING.reward;
  G.quakes.push({ x: a.x, y: a.y, at: G.time, force: 0.8 });
  while (G.quakes.length > 6) G.quakes.shift();
  fx.shake(18);
  fx.punch(0.06);
  fx.sfx("suntok");
  for (const o of G.actors) {
    if (o === a || o.dead || untouchableNow(o)) continue;
    const d = Math.hypot(o.x - a.x, o.y - a.y);
    if (d > R.poundBlast) continue;
    const k = 1 - d / R.poundBlast;
    const dir = Math.sign(o.x - a.x) || 1;
    o.vx = dir * R.knockback * k;
    o.vy = -R.upward * k;
    o.launchFor = Math.max(o.launchFor || 0, 0.25 + 0.3 * k);
  }
}

function tickBoxes(dt) {
  // ---- spawn ------------------------------------------------------------
  G.boxAt -= dt;
  if (G.boxAt <= 0) {
    G.boxAt = BOX.everyMs / 1000;
    if (G.boxes.length < BOX.max) {
      /* Over a platform, high enough to have to jump for.
       *
       * The same reachability problem the power-ups have, and worse: a
       * power-up over the drop is bait you can decline, but a box you have
       * bumped twice is a sunk cost that will pull a player out over the
       * edge on the third. Only spots with something still under them. */
      const free = G.meta.powerSpots.filter(
        (sp) => standingRoom(sp) &&
                !G.boxes.some((b) => Math.abs(b.x - sp.x) < 2) &&
                !G.powers.some((q) => q.x === sp.x && q.y === sp.y)
      );
      const floor = widestFloor();
      /* Boxes get the widest berth of anything.
       *
       * A pinata is three bumps and whatever is inside it, so one that
       * appears beside a player is not a pickup they were quicker to — it is
       * a reward nobody contested. */
      const sp = spawnAwayFrom(free, SPAWN_CLEAR.box)
        || (floor ? { x: (floor.x0 + floor.x1 + 1) / 2, y: floor.y - 1.4 } : null);
      if (sp) {
        G.boxes.push({
          x: sp.x, y: sp.y - 1.5, hits: BOX.hits, born: G.time, bumpAt: -9,
          // Rolled NOW, not when it breaks.
          //
          // Both machines have to agree about what was inside, and the only
          // thing they reliably agree about is the seeded rng run in the same
          // order. Rolling at spawn puts the draw on the tick a box appears —
          // one event, on the server, replicated like any other — instead of
          // on whichever tick each side happened to decide it broke.
          drop: rollDrop(),
        });
        fx.sfx("spawn");
      }
    }
  }

  // ---- head-bumps -------------------------------------------------------
  for (let i = G.boxes.length - 1; i >= 0; i--) {
    const b = G.boxes[i];
    for (const a of G.actors) {
      if (a.dead) continue;
      // Rising only. Walking past one at the same height is not opening it,
      // and neither is falling onto it — that is the pound's job, below.
      if (a.vy >= 0) continue;
      const head = a.y - a.h;
      if (Math.abs(a.x - b.x) > BOX.w / 2 + a.w / 2) continue;
      if (head > b.y + BOX.h / 2 || head < b.y - BOX.h) continue;
      hitBox(b, a, hasPower(a, "laki") ? BOX.bigHits : 1);
      // Bounced off it, whether or not that was the last bump.
      a.vy = 2.4;
      break;
    }
    if (b.hits <= 0) { openBox(b, i); }
  }
}

/** Which of the three it is. Weighted; see BOX.drops. */
function rollDrop() {
  const total = BOX.drops.reduce((n, d) => n + d.weight, 0);
  let r = rng() * total;
  for (const d of BOX.drops) { r -= d.weight; if (r <= 0) return d.id; }
  return BOX.drops[0].id;
}

/** One blow against a box, worth `n` of the bumps it takes. */
function hitBox(b, by, n) {
  b.hits -= n;
  b.bumpAt = G.time;
  b.by = by ? by.id : null;
  if (b.hits > 0) {
    fx.sfx("pinata");
    fx.shake(4);
  }
}

/**
 * A Ground Pound opens a box outright.
 *
 * Called from the landing rather than from the bump loop, because the pound
 * is the one way in that does not involve hitting it from underneath — he
 * comes down THROUGH it. Anything within the blast, which is the same radius
 * that shoves players, so what he can see he can open.
 */
function poundBoxes(a, reach) {
  for (let i = G.boxes.length - 1; i >= 0; i--) {
    const b = G.boxes[i];
    if (Math.hypot(b.x - a.x, b.y - a.y) > reach) continue;
    hitBox(b, a, BOX.hits);
    openBox(b, i);
  }
}

/** It is open. Hand out what was in it and take the box off the field. */
function openBox(b, i) {
  G.boxes.splice(i, 1);
  G.pops.push({ x: b.x, y: b.y, at: G.time, colour: BOX.colour, glyph: "box" });
  /* Confetti, in the piñata's own colours, thrown in a ring.
   *
   * Six grey-gold puffs in one spot was a crate splintering. This bursts. */
  const PAPER = ["#ff8fb1", "#ffd24a", "#7fd4ff", "#a8e26a"];
  for (let k = 0; k < 16; k++) {
    const ang = (k / 16) * Math.PI * 2;
    G.bursts.push({
      x: b.x + Math.cos(ang) * 0.7, y: b.y + Math.sin(ang) * 0.6,
      at: G.time, colour: PAPER[k % PAPER.length], big: k % 4 === 0,
    });
  }
  fx.shake(12);
  fx.punch(0.05);
  fx.sfx("poof");

  if (b.drop === "hari") { summonKing(b); return; }
  // The other two fall out as an ordinary pickup, so whoever wants it still
  // has to go and touch it — opening a box is not the same as winning one,
  // and the opponent gets a moment to contest it.
  /* Flagged as box loot, which overrides the decline rules below.
   *
   * Walking over a Gun must not cost you a Bazooka — but if you spent three
   * bumps on a pinata and a Bazooka came out, you are having it, whatever is
   * in your hands. Charlie: "any box can overwrite current op item." The
   * refusals exist to stop ACCIDENTS, and opening a box is not one. */
  G.powers.push({ x: b.x, y: b.y, type: b.drop, born: G.time, fromBox: true });
  fx.sfx("spawn");
}

function tickPowers(dt) {

  // spawn
  G.powerAt -= dt;
  if (G.powerAt <= 0 && G.meta.powerSpots.length) {
    G.powerAt = powerEvery(G, POWER_SPAWN_MS) / 1000;
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
    // Away from both of them, or the pickup is a gift rather than a race.
    const sp = spawnAwayFrom(free, SPAWN_CLEAR.power)
      || (floor ? { x: (floor.x0 + floor.x1 + 1) / 2, y: floor.y - 1.4 } : null);
    if (sp) {
      // Gunfight decides for itself. See pickPower.
      const forced = pickPower(G, rng);
      let type = forced || POWER_ORDER[Math.floor(rng() * POWER_ORDER.length)];
      let guard = forced ? 9 : 0;
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
        /* A Gun does not take a Bazooka off you.
         *
         * They share the fire button, so picking one up while holding the
         * other swaps them — and walking over a six-shooter is not a decision
         * anyone makes on purpose when they are carrying the one shell that
         * ends a round. Charlie: "normal gun di talaga."
         *
         * The orb is LEFT on the field rather than consumed, so the other
         * player can still have it. Everything else still replaces normally,
         * the Star included, because taking a Star is a choice you can see
         * yourself making and it is not strictly worse.
         */
        /* NOTHING off the floor takes a Bazooka off you.
         *
         * It began as "a Gun does not replace a Bazooka", which covered the
         * case anyone hits first and left every other one open — a Grow, a
         * Star, a Speed, all of them silently spending the one shell that
         * ends a round. Charlie: "Dapat talaga hindi narereplace yung
         * bazooka, best gun na yun sa laro plss."
         *
         * The orb is LEFT on the field rather than consumed, so the other
         * player can still have it. A box still overrides — that is the
         * deliberate exception and it is the only way to trade one away. */
        if (!q.fromBox && hasPower(a, "bazuka") && !ALL_POWERS[q.type]?.slotless) {
          continue;
        }
        /* ...and Excalibur is only ever traded for another WEAPON.
         *
         * A Star or a Grow lying in your path used to take the sword off you,
         * which is the same complaint as the Bazooka's in a smaller hat:
         * something you chose and crossed the arena for, spent by walking.
         * Charlie: "yung iba di narereplace si excalibur ng star or shield."
         *
         * A gun, a shell or a fist still takes it — that is the deal the
         * sword was given when it was made endless, and it is the only way to
         * put it down. */
        if (!q.fromBox && hasPower(a, "espada")
            && !ALL_POWERS[q.type]?.slotless && !ALL_POWERS[q.type]?.fires) {
          continue;
        }
        /* ...and the two OP items never trade for each other.
         *
         * A Bazooka and a One Punch are each one input that ends a round.
         * They share the fire button so you could never hold both anyway;
         * what this stops is the bad half of that — walking over one and
         * silently losing the other. Left on the field, like the Gun. */
        if (!q.fromBox && ALL_POWERS[q.type]?.op
            && a.power && ALL_POWERS[a.power.type]?.op) continue;
        G.powers.splice(i, 1);
        // Contact is the payoff, so it gets its own effect rather than the
        // same small ring a bullet gets: a shockwave where it was taken, a
        // kick to the camera, and the character flashes as it goes in.
        G.pops.push({
          x: q.x,
          y: q.y,
          at: G.time,
          colour: POWERUPS[q.type].colour,
          glyph: q.type,
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
    if (isStar(a) && rng() < dt * 9) fx.sfx("sparkle");
    if (a.power.until !== Infinity && G.time > a.power.until) clearPower(a);
    /* A spent weapon is dropped, whichever weapon it was.
     *
     * Named the Gun specifically, so an empty Bazooka stayed in your hands
     * for the rest of the round: a dead fire button and a chip claiming a
     * weapon you no longer had. `fires` is the flag; see config.js. */
    if (a.power && ALL_POWERS[a.power.type]?.fires && a.power.ammo <= 0
        && a.power.type !== "suntok" && !ALL_POWERS[a.power.type].endless) {
      /* The fist is the exception — its last swing has to be allowed to land,
       * and givePower already sets an expiry for exactly that.
       *
       * Excalibur is the other one, and a different kind: it has no magazine
       * at all, so `ammo <= 0` is its resting state rather than the end of
       * it. Without `endless` here it would be taken off you on the very
       * frame it was picked up. */
      clearPower(a);
    }
  }

  // The star kills on contact from any direction — that is the whole point of
  // it, and it beats being big.
  for (const a of G.actors) {
    if (a.dead || !isStar(a)) continue;
    for (const o of G.actors) {
      if (o === a || o.dead) continue;
      if (isStar(o)) continue; // two stars just bounce off each other
      if (overlapping(a, o)) killPlayer(o, a, "star");
    }
  }

  // bullets
  for (let i = G.shots.length - 1; i >= 0; i--) {
    const b = G.shots[i];
    b.life -= dt;
    /* A shell steers; a bullet does not.
     *
     * It turns at a fixed rate towards its target rather than snapping onto
     * it, which is what makes it dodgeable at all — a shell that simply
     * pointed at you every tick would be a straight line drawn from the
     * barrel to your body. It aims at the KING first when there is one, so a
     * one-shot is not wasted flying past a boss to hit a player. */
    if (b.homing) {
      const def = POWERUPS.bazuka;
      const mark = (G.king && !G.king.leaving) ? G.king.actor
        : G.actors.find((o) => !o.dead && o.id !== b.owner);
      if (mark) {
        const tx = mark.x, ty = mark.y - mark.h / 2;
        const dist = Math.hypot(tx - b.x, ty - b.y);
        /* Close enough — go off.
         *
         * A proximity fuse, which a four-tile blast has never needed to do
         * without. It is also what stops the spiral: inside its own turn
         * radius the shell cannot come round, so rather than orbit until the
         * fuel runs out it simply detonates where it is. */
        if (dist <= def.fuse) { bazookaBoom(b.x, b.y, b.owner); G.shots.splice(i, 1); continue; }
        const want = Math.atan2(ty - b.y, tx - b.x);
        const have = Math.atan2(b.vy, b.vx);
        let d = want - have;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        /* Turn hard enough to actually get there.
         *
         * `def.turn` is a floor. What it really needs is a rate whose turn
         * radius (speed / rate) fits inside the distance left — so the rate
         * rises as the gap closes and the shell can always come round. */
        const rate = Math.max(def.turn, (def.speed / Math.max(0.5, dist)) * 1.6);
        const turn = Math.max(-rate * dt, Math.min(rate * dt, d));
        const ang = have + turn;
        b.vx = Math.cos(ang) * def.speed;
        b.vy = Math.sin(ang) * def.speed;
      }
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    const t = tileAt(G.grid, Math.floor(b.x), Math.floor(b.y));
    /* A shell goes THROUGH the ground.
     *
     * It was detonating on the first solid tile like a bullet, and since it
     * steers towards a target that is usually on another platform, the tile
     * it met first was almost always the floor between them — Charlie: "dapat
     * oks lang siya tumagos sa pinakaplatform sa baba di kasi umaabot sa
     * kalaban e." A guided weapon that cannot get to the thing it is guiding
     * itself at is not a weapon.
     *
     * So terrain does not stop it at all. It goes off on a body, on the King,
     * or when it runs out of fuel — and its fuel is what stops it circling
     * the level forever. */
    if (b.life <= 0 || (t === "#" && !b.homing)) {
      if (b.homing) { bazookaBoom(b.x, b.y, b.owner); G.shots.splice(i, 1); continue; }
      if (t === "#") fx.sfx("shotWall");
      // Where it landed. A bullet that simply stops mid-air reads as the
      // game having lost it; a spray of sparks off the plank reads as a miss.
      if (t === "#") G.pops.push({ x: b.x, y: b.y, at: G.time, colour: "#ffd873", glyph: "" });
      G.shots.splice(i, 1);
      continue;
    }
    /* A bullet opens a pinata too, a bump at a time.
     *
     * "even baril pwede rin sa box." Six shots is two boxes, which gives the
     * Gun something to do besides chase people and is the only way to open
     * one without standing underneath it. */
    {
      let hitOne = false;
      for (let k = G.boxes.length - 1; k >= 0; k--) {
        const bx = G.boxes[k];
        if (Math.abs(bx.x - b.x) > BOX.w / 2 + SHOT_RADIUS) continue;
        if (Math.abs(bx.y - b.y) > BOX.h / 2 + SHOT_RADIUS) continue;
        G.pops.push({ x: b.x, y: b.y, at: G.time, colour: "#ffd873", glyph: "" });
        // A shell blows it open outright; a bullet is worth one bump.
        hitBox(bx, G.actors.find((q) => q.id === b.owner) || null,
               b.homing ? BOX.hits : 1);
        if (b.homing) bazookaBoom(b.x, b.y, b.owner);
        if (bx.hits <= 0) openBox(bx, k);
        G.shots.splice(i, 1);
        hitOne = true;
        break;
      }
      if (hitOne) continue;
    }

    /* The King is in front of the players in this list ON PURPOSE.
     *
     * He is enormous and they fight around his feet; a shell that passes
     * through him to hit somebody standing behind would read as the boss
     * having no body at all. Charlie asked for the gun to work on him —
     * "Star can just hit 1 heart as well sa kanya and even baril" — and one
     * heart is what everything takes off him. */
    if (G.king && !G.king.leaving) {
      const kb = G.king.actor;
      if (Math.abs(kb.x - b.x) < kb.w / 2 + SHOT_RADIUS &&
          Math.abs(kb.y - kb.h / 2 - b.y) < kb.h / 2 + SHOT_RADIUS) {
        G.pops.push({ x: b.x, y: b.y, at: G.time, colour: "#ffd873", glyph: "" });
        G.shots.splice(i, 1);
        fx.sfx("shotHit");
        // A shell goes off ON him; hurtKing is called from inside the blast.
        if (b.homing) { bazookaBoom(b.x, b.y, b.owner); continue; }
        hurtKing(G.actors.find((q) => q.id === b.owner) || null);
        continue;
      }
    }
    for (const o of G.actors) {
      if (o.dead || o.id === b.owner) continue;
      if (isStar(o)) continue; // the star shrugs off bullets
      if (
        Math.abs(o.x - b.x) < o.w / 2 + SHOT_RADIUS &&
        Math.abs(o.y - o.h / 2 - b.y) < o.h / 2 + SHOT_RADIUS
      ) {
        G.pops.push({ x: b.x, y: b.y, at: G.time, colour: "#ffd873", glyph: "" });
        G.shots.splice(i, 1);
        fx.sfx("shotHit");
        // A shell does not merely hit them — it goes off, and the blast is
        // what does the work. See bazookaBoom.
        if (b.homing) { bazookaBoom(b.x, b.y, b.owner); break; }
        if (b.lethal && canHit(o, G.actors.find((q) => q.id === b.owner) || null, true)) { o.lethal = true; fx.shake(18); fx.flash(1); }
        killPlayer(o, G.actors.find((q) => q.id === b.owner) || null, b.lethal ? "bazuka" : "shot");
        break;
      }
    }
  }
}

/* ------------------------------------------------------------ abilities --- */
//
// The fire button, when you are not holding a power-up.
//
// Everything here is REPLAYABLE: it reads only the actor's own fields and the
// clock, and it writes only the actor's own fields. That is what lets a client
// fire its ability the instant the thumb moves and still land exactly where
// the server put it — reconciliation re-runs these the same way it re-runs a
// jump. Anything that touches the rest of the world (the pound's shove) is
// fenced off behind `loud`, which only the server passes.

function tryAbility(a, loud) {
  const ab = abilityOf(a);
  if (!ab || !abilityReady(a, G.time)) return;
  // One off the stack. The clock is already sitting at `now` while it is
  // full (see tickCharges), so the wait for the next one starts here.
  a.skillN = Math.max(0, (a.skillN || 0) - 1);
  a.abilityAt = G.time * 1000;   // when it was last used, for the effects

  if (ab.id === "hop") {
    a.hops = (a.hops || 0) + 1;
    a.vy = JUMP_VELOCITY * (a.stats?.jump ?? 1) * (a.jumpMul || 1) * ab.rise;
    // The buffered-jump grace would otherwise spend itself on the landing
    // and give a third jump for free.
    a.buffer = 0;
    a.coyote = 0;
    a.jumpHeld = true;
    if (loud) { fx.sfx("jump"); fx.note(a, ab.colour, ab.name, ab.desc, ab.mark); }
    return;
  }

  if (ab.id === "dash") {
    // A countdown and a velocity, which is what physics understands — it owns
    // holding it, because it is the one place that can hold it against the
    // steering clamp. See `dashing` in stepActor.
    a.dashFor = ab.ms / 1000;
    a.dashVx = a.face * ab.speed;
    a.vx = a.dashVx;
    // Unconditional for the same reason: on the ground vy is already nothing,
    // so clamping it costs nothing and reading `grounded` costs correctness.
    a.vy = Math.min(a.vy, 0) * ab.hang;
    if (loud) { fx.sfx("bilis"); fx.shake(4); }
    return;
  }

  // pound
  a.pounding = true;
  /* From a standstill, hop first.
   *
   * Pressing this with both feet on the floor used to be a dive of zero
   * tiles: minimum blast, no travel, and the landing resolved on the very
   * next tick because `grounded` was still true. So he pops up and the dive
   * begins at the apex.
   *
   * `poundFrom` is set to the apex he is ABOUT TO REACH rather than to where
   * he is standing — the height of a launch is (v^2)/2g and nothing about it
   * is uncertain. Doing it this way means the blast is worth the hop without
   * a scrap of new state travelling over the wire to say "he is still on the
   * way up", which would be another thing for the two sides to disagree
   * about. Nothing is predicted here that is not already arithmetic.
   *
   * `coyote` is in the test on purpose. Reading bare `grounded` on the tick
   * an ability fires is the shape of bug that has bitten this file before —
   * a hair of position flips it, the two sides take different branches, and
   * one of them hops while the other dives. The grace window makes it a
   * decision about the last few frames rather than about one. */
  if (a.grounded || (a.coyote || 0) > 0) {
    const v = JUMP_VELOCITY * (a.stats?.jump ?? 1) * (a.jumpMul || 1) * ab.hop;
    a.vy = v;
    a.poundFrom = a.y - (v * v) / (2 * GRAVITY);
    a.coyote = 0;
    a.buffer = 0;
  } else {
    a.poundFrom = a.y;    // where the dive began — the blast is worth the fall
    a.vy = ab.speed;
  }
  /* Horizontal momentum is KEPT, not killed.
   *
   * Zeroing it made the pound a dead drop, which is both less useful — you
   * can only ever hit what is directly beneath you — and worse to predict:
   * if the two sides disagree by a tick about when it fired, the difference
   * is the whole of a run, nine and a half tiles a second. Keeping it means
   * a disagreement costs nothing sideways. You still cannot STEER, which is
   * what makes it a commitment; you just keep what you came in with. */
  a.lockUntil = G.time + ab.lockMs / 1000;
  if (loud) fx.sfx("suntok");
}

/**
 * Held for as long as the burst lasts, AFTER the step that would have bled it.
 *
 * A dash written as a one-off shove is eaten by ground friction inside two
 * ticks and reads as a stumble. Written as a window, the friction is simply
 * outvoted for the length of it and then takes over cleanly.
 */
function holdAbility(a, dt) {
  const ab = abilityOf(a);
  if (a.grounded) a.hops = 0;
  // The stack fills here, every tick, so it advances identically whether this
  // is the live step or the replay running back over the same ticks.
  tickCharges(a, G.time);
  if (!ab) return;
  // Only the hang: the horizontal is physics's now, so that steering cannot
  // cancel it. This just stops the fall for as long as the burst lasts, which
  // is what makes it read as a leap rather than a shove.
  if (ab.id === "dash" && a.dashFor > 0) {
    a.vy = Math.min(a.vy, GRAVITY * dt * ab.hang);
  }
  if (ab.id === "pound" && a.pounding) {
    // Rising out of the standing hop. Nothing to dive with yet, and
    // `grounded` can still be true for the tick he leaves the floor — which
    // would otherwise land the pound before it had left the ground.
    if (a.vy < 0) { /* on the way up */ }
    else if (a.grounded) { a.pounding = false; a.lockUntil = 0; poundLanded(a); }
    else a.vy = Math.max(a.vy, ab.speed);
  }
}

/**
 * What the fire button should be showing, for whoever is holding this phone.
 *
 * Read-only, and it answers both questions the button needs: how much of the
 * cooldown is left to draw, and whether the move is actually available —
 * which is not the same thing. An Air Hop off cooldown is still unusable with
 * your feet on the ground, and a button that looked ready and did nothing
 * would be worse than one that looked spent.
 */
export function abilityState(id) {
  const a = G && G.actors.find((q) => q.id === id);
  return a ? abilityLook(a, G.time) : null;
}

/**
 * The landing, which only the server runs — it moves somebody else.
 *
 * Everything here scales with how far he fell. That is the whole decision in
 * the move: a pound off a step is a nudge, a pound off the top of the arena
 * takes their footing away for a third of a second and throws them most of a
 * body-length. Waiting to get height is what makes it worth using.
 */
/**
 * A Ground Pound takes the ledge out from under itself.
 *
 * Charlie: "yhon yhon jump ground pound can actually destroy platform if he
 * jumped and landed on platform". So it does — but only '=' , the thin
 * ledges. Punching a hole through the '#' ground would cut the arena in two
 * and strand whoever is on the far side of it, and the shrink already eats
 * the floor on its own schedule without needing help.
 *
 * It spreads from the impact and STOPS at the first gap, rather than taking
 * every tile within the radius. Reaching across a gap to break a platform he
 * did not land on is not something the player can see coming, and the whole
 * move is already about committing to one spot.
 *
 * How wide depends on the fall, like everything else the landing does — so
 * the same decision (how long to climb first) buys both the blast and the
 * demolition.
 */
function breakLedge(a, force) {
  const ab = ABILITY.pound;
  const ty = Math.floor(a.y + 0.05);          // the tile his feet are resting on
  const row = G.grid.rows[ty];
  if (!row) return;
  const tx = Math.floor(a.x);
  if (row[tx] !== "=") return;                // he landed on ground, not a ledge

  const span = Math.round(ab.breaks + (ab.breaksFar - ab.breaks) * force);
  /* A row is a STRING, not an array of characters.
   *
   * `G.grid.rows[ty][x] = "."` on one is a silent no-op in sloppy mode and a
   * TypeError under a module's strict mode, which is how the soak found this
   * the first time it ever ran a pound onto a ledge. The shrink rebuilds the
   * whole grid from scratch every time it eats a column for the same reason;
   * this collects the columns first and rewrites the row once. */
  const gone = [];
  for (const dir of [0, -1, 1]) {
    for (let k = dir === 0 ? 0 : 1; k <= span; k++) {
      const x = tx + dir * k;
      if (x < 0 || x >= row.length) break;
      if (row[x] !== "=") break;              // a gap ends it
      gone.push(x);
      if (dir === 0) break;
    }
  }
  if (!gone.length) return;
  const cut = new Set(gone);
  G.grid.rows[ty] = [...row].map((c, x) => (cut.has(x) ? "." : c)).join("");
  /* Debris where each tile was, so the platform is SEEN to go.
   *
   * Without this the ledge simply is not there the next frame, which reads
   * as a rendering fault rather than as something he did. Capped, because a
   * wide break on a long platform is a dozen tiles and the burst layer is
   * drawn for every one of them.
   */
  for (const x of gone.slice(0, 10)) {
    G.bursts.push({ x: x + 0.5, y: ty + 0.5, at: G.time, colour: "#9a9182" });
  }
  fx.sfx("poof");
}

function poundLanded(a) {
  if (!authority) return;
  const ab = ABILITY.pound;
  /* How far the dive actually was, as 0..1 of a long one. */
  const fell = Math.max(0, a.y - (a.poundFrom ?? a.y));
  const force = Math.max(0, Math.min(1, fell / ab.fallFull));
  const reach = ab.blast + (ab.blastFar - ab.blast) * force;
  a.poundFrom = null;
  fx.sfx("land");
  fx.shake(15 + 30 * force);
  fx.punch(0.04 + 0.09 * force);
  G.pops.push({ x: a.x, y: a.y, at: G.time, colour: ab.colour, glyph: ab.mark });
  /* The crater, for the renderer — replicated, so both phones see the same
   * one in the same place. `force` is how hard, which drives everything the
   * ground does: the ring, the dust, and how long the cracks stay. */
  G.quakes.push({ x: a.x, y: a.y, at: G.time, force });
  breakLedge(a, force);
  poundBoxes(a, reach);
  // He is standing on the same floor as everybody else, so the shove finds
  // him — and a pound landed on a boss should be worth a heart.
  if (G.king && !G.king.leaving &&
      Math.hypot(G.king.actor.x - a.x, G.king.actor.y - a.y) <= reach) {
    hurtKing(a);
  }
  while (G.quakes.length > 6) G.quakes.shift();
  for (const o of G.actors) {
    // Nor is anyone untouchable — a ward, or the grace after coming back.
    if (o === a || o.dead || untouchableNow(o)) continue;
    const d = Math.hypot(o.x - a.x, o.y - a.y);
    if (d > reach) continue;
    // Away and up, hardest at the centre. It does not hurt them — the kill is
    // still the stomp, and this is what makes the stomp possible.
    // Hardest at the centre, and worth what the fall was worth.
    const k = (1 - d / reach) * (0.45 + 0.55 * force);
    const dir = Math.sign(o.x - a.x) || (a.face > 0 ? 1 : -1);
    o.vx = dir * ab.knockback * k;
    o.vy = -ab.upward * k;
    /* Marked as a LAUNCH, like every other authoritative shove.
     *
     * It is the one thing here the other player cannot have predicted — the
     * pound landed on the server and they will not hear about it for half a
     * round trip. launchFor is how the rest of the game says "your own input
     * is not what moved you"; without it their controls fight the shove, and
     * nothing downstream can tell this apart from ordinary running. */
    /* A flat quarter second of no control, however glancing the blast —
     * plus more for a hard one. Flat, because a stun you cannot count on
     * is a stun you cannot build anything on, and the whole reason it is
     * here is so a pound can be followed by something. */
    o.launchFor = Math.max(o.launchFor || 0, 0.25 + (ab.launchMs / 1000) * k);
  }
}

function tryShoot(a) {
  // Holding someone over your head: the button throws them.
  if (G.rd && G.rd.grab && G.rd.grab.by === a.id) return tryGrab(G, a, roundCtx());
  if (hasPower(a, "suntok")) return tryPunch(a);
  if (hasPower(a, "bazuka")) return tryBazooka(a);
  if (hasPower(a, "espada")) return trySwing(a);
  /* Nothing to fire: the same button grabs. See GRAB in config.js. */
  if (!hasPower(a, "baril") || a.power.ammo <= 0) {
    if (!a.power || !ALL_POWERS[a.power.type]?.fires || !(a.power.ammo > 0)) tryGrab(G, a, roundCtx());
    return;
  }
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
    // When it left the barrel. Everything the renderer does with a gun — the
    // flash, the smoke, the case coming out, the shoulder going back — is
    // worked out from this and the bullet's own speed, so there is nothing
    // else to send and nothing to keep in step.
    born: G.time,
  });
  fx.sfx("shoot");
  // The gun kicks. Small — it is a cartoon — but a shot that moves nothing
  // at the firing end reads as the bullet having simply appeared.
  fx.punch(0.03);
}

/**
 * The bazooka. One shell, and it steers.
 *
 * Aim-assisted rather than instant: it leaves the barrel slower than a bullet
 * and turns towards whoever it is looking for, so the target gets a moment to
 * see it coming and to try — and mostly fail — to do something about it. A
 * homing one-shot that arrived instantly would not be a weapon, it would be a
 * button that says "win".
 *
 * It carries `homing` and `lethal` and is otherwise an ordinary shot, so the
 * wall hits, the wire and the renderer all already know what to do with it.
 */
/**
 * A bazooka shell going off.
 *
 * Everything within the blast is out — it does not have to touch you, which
 * is the whole reason it is one shell out of one box in three. It takes the
 * ledge with it too, because a rocket that leaves the floor immaculate is a
 * firework.
 *
 * Called from wherever the shell stops: a body, the King, a wall, or simply
 * running out of fuel. There is no case where it fizzles.
 */
function bazookaBoom(x, y, ownerId) {
  const def = POWERUPS.bazuka;
  const by = G.actors.find((q) => q.id === ownerId) || null;

  // The fireball itself, replicated. `kind` tells the renderer this is a
  // rocket going off in the air rather than a body hitting the floor.
  G.quakes.push({ x, y, at: G.time, force: 1, kind: 1 });
  while (G.quakes.length > 6) G.quakes.shift();

  fx.shake(def.shake);
  fx.punch(0.11);
  fx.flash(1);
  G.freeze = Math.max(G.freeze, def.freezeMs / 1000);
  fx.sfx("suntok");
  fx.sfx("stomp");

  // Debris, thrown wide.
  for (let i = 0; i < 20; i++) {
    const ang = (i / 20) * Math.PI * 2;
    const rr = def.blast * (0.3 + (i % 4) * 0.2);
    G.bursts.push({
      x: x + Math.cos(ang) * rr, y: y + Math.sin(ang) * rr * 0.8,
      at: G.time, colour: i % 3 ? def.colour : "#ffe66b", big: i % 5 === 0,
    });
  }

  // Everyone inside it, including whoever fired it — you do not get to stand
  // in your own explosion.
  for (const o of G.actors) {
    if (o.dead) continue;
    if (Math.hypot(o.x - x, (o.y - o.h / 2) - y) > def.blast) continue;
    // A ward, or the grace after coming back, shrugs off the whole thing —
    // the heart, the throw and the mark that says an explosion moved you.
    // This is the VICTIM's state and it still counts; it is the SHOOTER's
    // that a shell in flight has stopped caring about. See canHit.
    if (untouchableNow(o)) continue;
    // Armed only if it can actually land — see canHit. Arming it on someone
    // who is untouchable leaves it on their body for the NEXT hit they take,
    // which then costs them the whole bar instead of a heart.
    if (canHit(o, o.id === ownerId ? null : by, true)) o.lethal = true;
    /* Thrown FROM THE BLAST, not from the shooter.
     *
     * handleDeath works out which way to throw a body from `cause.by` — the
     * player who did it — which for a shell is whoever pulled the trigger,
     * usually standing somewhere else entirely. What should move you is the
     * explosion, so the explosion says where it was. */
    o.blastFrom = { x, y };
    killPlayer(o, o.id === ownerId ? null : by, "bazuka");
  }

  // And the King, who is not in that list.
  if (G.king && !G.king.leaving) {
    const kb = G.king.actor;
    if (Math.hypot(kb.x - x, (kb.y - kb.h / 2) - y) <= def.blast + kb.w * 0.4) hurtKing(by);
  }

  // The floor it went off on. Same rule as a Ground Pound: '=' only, or the
  // arena gets cut in two by a weapon that is already the strongest thing in
  // the game.
  const ty = Math.floor(y + 0.5);
  const row = G.grid.rows[ty];
  if (row) {
    const tx = Math.floor(x);
    const gone = [];
    for (const dir of [0, -1, 1]) {
      for (let k = dir === 0 ? 0 : 1; k <= def.breaks; k++) {
        const cx = tx + dir * k;
        if (cx < 0 || cx >= row.length) break;
        if (row[cx] !== "=") break;
        gone.push(cx);
        if (dir === 0) break;
      }
    }
    if (gone.length) {
      const cut = new Set(gone);
      G.grid.rows[ty] = [...row].map((c, cx) => (cut.has(cx) ? "." : c)).join("");
    }
  }
}

function tryBazooka(a) {
  if (!a.power || a.power.ammo <= 0) return;
  if (G.time * 1000 - a.shotAt < SHELL_COOLDOWN_MS) return;
  const def = POWERUPS.bazuka;
  a.shotAt = G.time * 1000;
  a.power.ammo--;
  fx.power(a);
  G.shots.push({
    x: a.x + a.face * (a.w / 2 + 0.3),
    y: a.y - a.h * 0.55,
    vx: a.face * def.speed,
    vy: 0,
    owner: a.id,
    life: def.lifeMs / 1000,
    born: G.time,
    homing: true,
    lethal: true,
  });
  fx.sfx("shoot");
  fx.shake(7);
  fx.punch(0.06);
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

/* ------------------------------------------------------------ Excalibur --- */

/** Where a swing is in its arc, or null if there is not one happening. */
function swingPhase(a) {
  if (!a.swing) return null;
  const def = POWERUPS.espada;
  const t = (G.time - a.swing.at) * 1000;
  if (t < def.windupMs) return { state: "wind", t: t / def.windupMs };
  if (t < def.windupMs + def.activeMs)
    return { state: "out", t: (t - def.windupMs) / def.activeMs };
  return null;
}

/** Swing it. Costs nothing and can be done again a third of a second later. */
function trySwing(a) {
  const def = POWERUPS.espada;
  if (!a.power) return;
  if (a.swing && G.time - a.swing.at < def.cooldownMs / 1000) return;
  /* The arc ALTERNATES, over and then under.
   *
   * Two identical swings in a row read as one animation stuttering; a
   * downstroke followed by an upstroke reads as someone working. It is one
   * bit and it rides on the wire with the rest of the swing. */
  a.swingN = ((a.swingN || 0) + 1) % 2;
  a.swing = { at: G.time, face: a.face, hit: false, up: a.swingN === 1 };
  fx.sfx("espada");
  fx.power(a);
}

/* The blade, while it is coming down.
 *
 * An ARC, and everything in it at once — a pinata AND the King AND whoever is
 * standing there all take it from one swing, which is what "AOE" means here
 * and is the trade for three tiles of reach. The fist is a corridor to the
 * far wall and spends itself on the first thing it meets; this is a short
 * sweep that does not care how many things are in it.
 */
function tickSwings() {
  const def = POWERUPS.espada;
  for (const a of G.actors) {
    const ph = swingPhase(a);
    if (!ph || ph.state !== "out" || a.swing.hit || a.dead) continue;
    const face = a.swing.face;
    const midY = a.y - a.h * 0.55;
    // A king's sword is longer and takes three. See `kingHearts` in config.
    const mega = !!a.crowned;
    const hearts = mega ? def.kingHearts : def.hearts;
    const reach = mega ? def.reach * def.kingScale : def.reach;
    /* Does this thing lie inside the sweep?
     *
     * Ahead of the body out to `reach`, a little behind it — the arc starts
     * over the shoulder — and within `reachY` of the waist. Measured from the
     * EDGE of the target rather than its middle, so a box the size of a
     * player is not judged by one pixel at its centre. */
    const inArc = (x, y, halfW, halfH) => {
      const ahead = (x - a.x) * face;
      if (ahead < -def.behind - halfW || ahead > reach + halfW) return false;
      return Math.abs(y - midY) <= def.reachY + halfH;
    };

    let landed = false;

    // Pinatas. Two of its three bands in one swing, so two swings open it.
    for (let k = G.boxes.length - 1; k >= 0; k--) {
      const bx = G.boxes[k];
      if (!inArc(bx.x, bx.y, BOX.w / 2, BOX.h / 2)) continue;
      landed = true;
      hitBox(bx, a, hearts);
      if (bx.hits <= 0) openBox(bx, k);
    }

    // The King, who takes two of his three.
    if (G.king && !G.king.leaving) {
      const kb = G.king.actor;
      if (inArc(kb.x, kb.y - kb.h * 0.5, kb.w / 2, kb.h / 2)) {
        if (hurtKing(a, hearts)) landed = true;
      }
    }

    // ...and whoever is standing in it, for two hearts.
    for (const o of G.actors) {
      if (o === a || o.dead) continue;
      if (!inArc(o.x, o.y - o.h * 0.5, o.w / 2, o.h / 2)) continue;
      if (!canHit(o, a)) continue;
      landed = true;
      killPlayer(o, a, "espada", hearts);
    }

    if (landed) {
      a.swing.hit = true;
      a.swing.landAt = G.time;
      fx.sfx("espadaHit");
      fx.shake(14);
      fx.punch(0.045);
      G.bursts.push({
        x: a.x + face * reach * 0.5, y: midY,
        at: G.time, colour: def.colour, big: true,
      });
    }
  }
}

function tickPunches() {
  const def = POWERUPS.suntok;
  for (const a of G.actors) {
    const ph = punchPhase(a);
    if (!ph || ph.state !== "out" || a.punch.hit || a.dead) continue;
    const fistX = a.x + a.punch.face * (a.w / 2 + def.reach * 0.6);
    const fistY = a.y - a.h * 0.55;
    /* A One Punch opens a pinata outright.
     *
     * "yung mga one punch man pwede gamitin kay king yhon or sa mismong box."
     * It is the same blast that ends a player; a paper animal is not going to
     * survive it. Checked before the King and the players so the swing is
     * spent on the thing nearest the fist. */
    for (let k = G.boxes.length - 1; k >= 0; k--) {
      const bx = G.boxes[k];
      const ahead = (bx.x - a.x) * a.punch.face;
      if (ahead < -def.blastBehind || ahead > def.reachX) continue;
      if (Math.abs(bx.y - fistY) > def.reachY + BOX.h / 2) continue;
      a.punch.hit = true;
      a.punch.blastAt = G.time;
      hitBox(bx, a, BOX.hits);
      openBox(bx, k);
      break;
    }
    if (a.punch.hit) continue;

    /* One Punch takes ONE heart off the King, not all of them.
     *
     * It ends him in ONE, the same as it ends a player and the same as it
     * opens a box.
     *
     * It used to take a heart like anything else, on the reasoning that a
     * boss worth three openings should not become a pickup with extra steps.
     * Charlie overruled it, and he is right about what the move is for: the
     * whole identity of the One Punch is that whatever is in front of it is
     * finished, and a boss that shrugs one off is the move being special
     * everywhere except the one place it would be remembered. It is two
     * chances in nine out of a box that turns up every nineteen seconds, and
     * you still have to be stood next to a thing that flattens the floor.
     * "dapat pag inone punchman ko yung box or si king yhon talagang one hit
     * lang sila." */
    if (G.king && !G.king.leaving) {
      const kb = G.king.actor;
      const forward = (kb.x - a.x) * a.punch.face;
      const level = Math.abs((kb.y - kb.h / 2) - fistY) <= def.reachY + kb.h / 2;
      if (forward >= -def.blastBehind && forward <= def.reachX && level) {
        a.punch.hit = true;
        a.punch.blastAt = G.time;
        G.bursts.push({ x: fistX, y: fistY, at: G.time, colour: def.colour, big: true });
        hurtKing(a, KING.hp);
        continue;
      }
    }
    for (const o of G.actors) {
      if (o === a || o.dead) continue;
      // A radial blast centred on the fist rather than a box the size of the
      // fist. Behind you it stops almost at once, so the punch still has to
      // be aimed — but a near miss in front now connects, which is the whole
      // difference between "one of my three landed" and "none did".
      /* A CORRIDOR in front, not a blob around the fist.
       *
       * Forward as far as the arena goes, and level with the fist to within
       * a couple of tiles. See `reachX` in config for why this shape. */
      const forward = (o.x - a.x) * a.punch.face;
      if (forward < -def.blastBehind || forward > def.reachX) continue;
      if (Math.abs((o.y - o.h / 2) - fistY) > def.reachY + o.h / 2) continue;
      // Untouchable: the fist passes straight through. It used to throw them
      // anyway — "a star turns the damage aside but not the shove" — and a
      // shove out over a chasm is a kill by another name.
      if (untouchableNow(o)) continue;
      a.punch.hit = true;
      a.punch.blastAt = G.time;
      // One punch. Not one heart — everything, spare hearts included. That is
      // the trade the Suntok makes: three swings, each one has to be thrown
      // from arm's length and each one can miss, so the one that lands ends
      // the round. A star still stops it outright.
      // ...and armed only if it can land. See canHit: a fist thrown at someone
      // who is still in their respawn grace used to leave `lethal` set on them
      // for good, so the next stomp they took an entire round later killed
      // them outright.
      if (canHit(o, a)) o.lethal = true;
      // Sent flying whether or not it kills — a star turns the damage aside
      // but not the shove, so surviving a punch still costs you your footing.
      o.vx = a.punch.face * def.knockback;
      o.vy = -def.lift;
      /* ...and MARKED as a launch, or it costs them nothing.
       *
       * The line above has said "still costs you your footing" since the
       * punch was written, and it did not: without this the victim cancels
       * the whole shove by holding a direction on the very next tick, which
       * is what anyone is already doing. Same bypass the pound uses and the
       * bad Dudu's throw uses — see `launched` in stepActor. */
      o.launchFor = Math.max(o.launchFor || 0, 0.4);
      // Its own treatment, louder than a death's, because it IS the death and
      // the whole move is that it is excessive.
      G.freeze = Math.max(G.freeze, def.freezeMs / 1000);
      fx.shake(def.shake);
      // The landing gets its own weight: a hit-stop, a hard shake, a flash,
      // a big burst at the fist and a ring of sparks thrown outward. A one-
      // punch kill that looked like a bullet hit was the complaint.
      G.bursts.push({ x: fistX, y: fistY, at: G.time, colour: def.colour, big: true });
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        G.bursts.push({
          x: fistX + Math.cos(ang) * def.blastRadius * 0.55,
          y: fistY + Math.sin(ang) * def.blastRadius * 0.4,
          at: G.time + i * 0.005,
          colour: i % 2 ? "#ffd7a0" : def.colour,
        });
      }
      G.pops.push({ x: fistX, y: fistY, at: G.time, colour: def.colour, glyph: "suntok" });
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
                colour: "#ffe66b", glyph: "bituin" });
  G.freeze = Math.max(G.freeze, 0.1);
  fx.shake(30);
  fx.punch(0.06);
  fx.note(victim, "#ffe66b", "Nice try", "He bounced. The star does not care.", "bituin");
  fx.sfx("badHit");
}

function untouchableNow(a) {
  if (!a) return false;
  // The Shield belongs here too — it refuses the grab for the same reason it
  // refuses a Ground Pound: both end with you thrown off the map.
  if (isWarded(a)) return true;
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

  fx.note(victim, "#a970ff", "Bad Dudu", "That was not Dudu.", "dudu");
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
  /* Thrown the way he is FACING, which is the side he grabbed you from.
   *
   * It used to work out the nearest edge and throw you at that instead, on
   * the reasoning that the map should do the killing — and it read as the
   * throw ignoring the whole struggle: he takes you from the right and hurls
   * you left, past himself. Charlie: "kung san nagcontact si character dun
   * din talbog so kung from right si character, right din talbog sa corner,
   * pag sa left sa left." He already faces you when he grabs (see
   * beginBetrayal), and you are pinned on that side, so the direction is
   * there to be used rather than recomputed. */
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
      fx.note(a, "#ffb84d", "Dudu", "He is on your side. He roams, and jumps them if they get close.", "dudu");
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
      if (isStar(victim)) {
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
      if (isStar(victim)) {
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
    /* A client moves NOBODY but you.
     *
     * The other player used to be predicted here from the thumbs the server
     * echoed back, which is a guess about a person — it is right while they
     * run in a straight line and wrong at the exact moments you are watching
     * them: the turn, the landing, the jump. They are interpolated from the
     * server's own record instead now (see netclient.js), so there is nothing
     * here to guess.
     */
    if (!authority && a.id !== localRole) continue;
    const pad = pads[a.id];
    const frozen = a.frozenUntil && G.time < a.frozenUntil;
    const flipped = a.reversedUntil && G.time < a.reversedUntil;
    // Committed to a pound: you cannot steer out of it, which is the whole
    // of what makes it a decision rather than a free fall.
    const locked = a.lockUntil && G.time < a.lockUntil;
    const input = {
      left: frozen || locked ? false : flipped ? pad.right : pad.left,
      right: frozen || locked ? false : flipped ? pad.left : pad.right,
      jumpDown: frozen || locked ? false : pendingJump[a.id],
      jumpHeld: frozen ? false : pad.jumpHeld,
      dropDown: frozen || locked ? false : pad.drop,
    };
    // Frozen still falls — being iced mid-air should not park you in the sky.
    if (frozen) a.vx *= 0.82;
    applyBody(G, a);
    stepActor(a, input, G.grid, dt, G.actors, opts);
    holdAbility(a, dt);
    if (pendingSkill[a.id]) tryAbility(a, true);
    if (pendingShot[a.id]) tryShoot(a);
  }
  // Whoever is being held goes where the holder goes.
  pinHeld(G);
  pendingJump.p1 = false;
  pendingJump.p2 = false;
  pendingShot.p1 = false;
  pendingShot.p2 = false;
  pendingSkill.p1 = false;
  pendingSkill.p2 = false;
}

/* ------------------------------------------------------- reconciliation --- */

/**
 * The server's picture, taken whole — and then your own body re-run forward.
 *
 * What was here before BLENDED: a quarter of the gap closed per update, and
 * your own character left alone entirely unless it was more than three tiles
 * out, because pulling on it every update fought your thumb and read as a
 * shake. That is a workaround, not netcode. It cannot converge — your own
 * player would sit a body-width from where the server had it and simply stay
 * there — and a correction big enough to act on arrived as a jump.
 *
 * What every game that feels right does instead: the snapshot says which of
 * your inputs it has already accounted for. Take its answer EXACTLY, then
 * replay the inputs it has not seen yet on top. The result is not a
 * compromise between two positions, it is the server's position brought up to
 * date — and it lands where you already are, so there is nothing to see.
 *
 * @param view    a hydrated snapshot
 * @param hostPhase the server's phase; taken outright, always
 * @param opts   { history, ack, now } — your unacknowledged thumbs
 */
/* How a correction is GIVEN BACK to your eyes.
 *
 * The simulation takes the server's answer whole and re-runs your unacked
 * inputs — that part is hard, exact, and must stay that way. But the result
 * can still differ from where your body was being drawn a frame ago, because
 * the server knows things you cannot: a punch that landed, a Dudu that shoved
 * you, a power-up the other player picked up. Snapped straight onto the
 * screen that reads as a jolt, and an ability makes it worse, because an
 * ability injects velocity and velocity integrates.
 *
 * So the correction goes into the simulation immediately and into the PICTURE
 * over the next tenth of a second. Nothing about the rules changes: this is
 * an offset the renderer adds and the physics never sees.
 *
 * The offset is held to a length rather than dropped when it gets big: a
 * dropped offset is a jump of whatever it had reached, which is the thing
 * this exists to prevent. A death or a respawn clears it, because the body
 * has genuinely gone somewhere else and nobody is watching it arrive.
 */
const SMOOTH_MAX = 1.1;       // tiles the picture may ever be behind the rules
const SMOOTH_HALFLIFE = 0.07; // seconds to give back half of what is left

export function applyServer(view, hostPhase, opts = {}) {
  const me = G && localRole ? G.actors.find((q) => q.id === localRole) : null;
  const wasAt = me ? { x: me.x, y: me.y, dead: !!me.dead } : { x: 0, y: 0, dead: true };
  if (!G || !view) return;

  if (view.score) { score.p1 = view.score.p1; score.p2 = view.score.p2; }
  if (view.roundNo) roundNo = view.roundNo;

  /* The phase is the server's, FULL STOP — including out of the countdown.
   *
   * This used to set `countdown = 0` and leave the frame loop to notice. That
   * works only while the frame loop is running, and if it is not — a thrown
   * frame, a tab the browser has throttled, a hitch during startup — the
   * round is stuck in a countdown that can never tick, wearing a card whose
   * entry animation is frozen at nought per cent. Nothing recovers from that,
   * because the one thing that could is the thing that has stopped. */
  if (hostPhase && hostPhase !== phase) {
    phase = hostPhase;
    if (phase !== "countdown") {
      countdown = 0;
      fx.count(null);
      if (phase === "play") fx.banner(null);
    }
  }

  // Every actor, outright. There is no easing left anywhere: the local player
  // is about to be replayed forward from here, and the other one is drawn
  // from the interpolation buffer, not from this.
  for (const a of G.actors) {
    const t = view.actors.find((o) => o.id === a.id);
    if (!t) continue;
    /* WHO they are holding, taken from the server like everything else.
     *
     * It was not, and it cannot be worked out locally: a client knows its own
     * pick and has no idea what the other phone chose. So the other player
     * was drawn as whatever this client's copy of the pad happened to default
     * to — Karla picks Yhon Yhon and Charlie's phone draws a panda — and,
     * worse, carried that character's speed and jump into the prediction.
     */
    if (t.char && a.char !== t.char) {
      a.char = t.char;
      a.stats = { ...(charById(t.char).stats || {}) };
    }
    a.x = t.x; a.y = t.y; a.vx = t.vx; a.vy = t.vy;
    a.face = t.face; a.walk = t.walk; a.squash = t.squash;
    a.grounded = t.grounded; a.t = t.t;
    a.coyote = t.coyote; a.buffer = t.buffer;
    a.jumpHeld = t.jumpHeld; a.launchFor = t.launchFor;
    /* What the power-up does to MOVEMENT, derived rather than sent.
     *
     * givePower sets these and only the server runs it, so a client holding
     * Bilis was predicting at walking pace against a server running at one
     * and a half — a divergence that grows a fifth of a tile every tick for
     * as long as you hold the button, which is the single worst thing the
     * bench found. They are constants keyed off the power everyone already
     * knows about, so deriving them cannot fall out of step the way another
     * field on the wire could. */
    a.hp = t.hp; a.dead = t.dead; a.respawn = t.respawn;
    a.w = t.w; a.h = t.h;
    a.power = t.power;
    a.crowned = t.crowned;
    a.shieldUntil = t.shieldUntil;
    /* ...read off the NEW power, and off the crown beside it.
     *
     * Two things were wrong here. It was computed before `a.power` was
     * replaced, so for one snapshot every client predicted at the speed of
     * the power-up it used to be holding. And the crown is no longer in that
     * slot, so a king predicted at walking pace against a server running him
     * at the crown's. Largest wins, exactly as restat does it — this cannot
     * call restat itself, because restat nudges a growing body up out of the
     * floor and the position here is the server's. */
    const def = a.power ? POWERUPS[a.power.type] : null;
    const kd = a.crowned ? POWERUPS.korona : null;
    a.speedMul = Math.max((def && def.speed) || 1, kd ? kd.speed : 1);
    a.jumpMul = Math.max((def && def.jump) || 1, kd ? kd.jump : 1);
    a.invulnUntil = t.invulnUntil;
    a.frozenUntil = t.frozenUntil;
    a.reversedUntil = t.reversedUntil;
    a.coins = t.coins;
    a.fairy = t.fairy;
    a.punch = t.punch;
    a.glowUntil = t.glowUntil;
    a.glowFor = t.glowFor;
    a.glowColour = t.glowColour;
    // The ability's private state, taken outright like the jump's — see
    // packActor. Whatever is still unacked is re-run by replayLocal below.
    a.abilityAt = t.abilityAt;
    a.skillN = t.skillN;
    a.skillAt = t.skillAt;
    a.hops = t.hops;
    a.dashFor = t.dashFor;
    a.dashVx = t.dashVx;
    a.pounding = t.pounding;
    a.lockUntil = t.lockUntil;
  }

  // Everything that is not a player is the server's outright and always was —
  // a client simulates none of it, so there is nothing local to preserve.
  G.powers = view.powers;
  G.coins = view.coins;
  G.shots = view.shots;
  G.bursts = view.bursts;
  G.pops = view.pops;
  if (view.shrink != null) G.shrink = view.shrink;
  // A server from before the mode wheel sends none: play it as plain Smash
  // rather than guess at a mode it is not running.
  G.rd = view.rd || null;
  G.quakes = view.quakes || [];
  G.boxes = view.boxes || [];
  G.king = view.king || null;
  G.lostHearts = view.lostHearts;
  G.minis = view.minis;
  G.helpers = view.helpers;
  G.wildFairy = view.wildFairy;
  G.time = view.time;
  // Hit-stop and slow motion stop the clock the rules run on, so a client
  // that does not take them keeps moving through a moment the server is
  // holding still — and every landed hit costs it about a tile of prediction.
  G.freeze = view.freeze || 0;
  G.slow = view.slow || 0;
  if (view.slowRate) G.slowRate = view.slowRate;

  /* The floor, when the server sends it.
   *
   * The arena eats itself inward all round, so the two can end up one tile
   * apart — and one tile of floor is the difference between standing and
   * falling. Rows only ride the keyframes, which is often enough. */
  if (view.grid && view.grid.rows && G.grid.rows.length === view.grid.rows.length) {
    G.grid.rows = view.grid.rows;
  }

  if (opts.history) replayLocal(opts.history, opts.ack || 0);

  // ...and hand the difference to the renderer rather than to the eye.
  if (me && localRole) {
    if (me.dead || wasAt.dead) {
      // A death and a respawn put the body somewhere else on purpose. There
      // is nothing to give back and nobody is looking at it.
      me.ox = 0; me.oy = 0;
    } else {
      me.ox = (me.ox || 0) + (wasAt.x - me.x);
      me.oy = (me.oy || 0) + (wasAt.y - me.y);
      /* CLAMPED, never zeroed.
       *
       * The first version dropped the offset outright when a correction came
       * in bigger than the cap — and dropping it is itself a jump, of exactly
       * the size it had got to. The bench caught that: the worst thing drawn
       * in a run got WORSE with the smoothing on than without it. Holding it
       * to a length and letting it decay cannot do that. */
      const m = Math.hypot(me.ox, me.oy);
      if (m > SMOOTH_MAX) { me.ox *= SMOOTH_MAX / m; me.oy *= SMOOTH_MAX / m; }
    }
  }
}

/** Give back whatever is left of the last correction, a little each frame. */
function easeCorrection(dt) {
  if (!G || !localRole) return;
  const a = G.actors.find((q) => q.id === localRole);
  if (!a || (!a.ox && !a.oy)) return;
  const k = Math.pow(0.5, dt / SMOOTH_HALFLIFE);
  a.ox *= k;
  a.oy *= k;
  // Under a hundredth of a tile is under a pixel. Stop, or it never ends.
  if (Math.abs(a.ox) < 0.01) a.ox = 0;
  if (Math.abs(a.oy) < 0.01) a.oy = 0;
}

/**
 * Re-run the thumbs the server has not answered yet, on your body only.
 *
 * One tick of input, one tick of stepping — the same 1/60 the live prediction
 * took and the same 1/60 the server took, so N replayed inputs land exactly
 * where living through those N inputs did. Timing this off the clock instead
 * is what left a steady third of a tile of error: a client and a server never
 * agree on the MOMENT an input took effect, only on its number.
 *
 * Silent: no sounds, no deaths, no rules. Those already happened once, on the
 * server, and it will tell us about them.
 */
export function replayLocal(history, ack) {
  if (!G || !localRole || phase !== "play") return;
  const a = G.actors.find((q) => q.id === localRole);
  if (!a || a.dead) return;

  /* The CLOCK has to walk forward too, and it did not.
   *
   * Everything replayed here was stepped against `G.time`, which applyServer
   * has just set to the server's time at the snapshot — one instant, held
   * still for every input re-run against it. For a jump that does not matter:
   * a jump is an impulse and reads no deadline. For an ability it is fatal.
   * Dash holds your speed for `dashFor`, the pound locks your steering
   * until `lockUntil`, and every one of them checks a cooldown — so with a
   * frozen clock the whole replay either dashed or did not, as one, and the
   * bench put the error at one and a half tiles.
   *
   * Each replayed input is one tick after the last, so the clock advances by
   * one tick per input and is put back afterwards: the world's clock belongs
   * to the server, and only this body is being re-run.
   */
  const was = G.time;
  for (let i = 0; i < history.length; i++) {
    const h = history[i];
    if (h.n <= ack) continue;
    // The same two 1/120 pieces one live tick is made of.
    stepLocal(a, h, TICK / 2, true);
    stepLocal(a, h, TICK / 2, false);
    /* ...and ONCE, after both halves, because that is what step() does.
     *
     * Advancing it between the halves looks more accurate and is not: a live
     * tick runs both of its 1/120 pieces against the clock as it stood at the
     * START of the tick and only then moves it on. Splitting it here meant
     * the second half of every replayed tick read a deadline the live one
     * never saw, which for Dudu's Dash — held until a deadline — put the
     * replay a sixtieth of a second out of step on every single tick. */
    G.time += TICK;
  }
  G.time = was;
}

/**
 * One replayed slice. Mirrors the input derivation in simulate(), silently.
 *
 * `h` is the packet AS SENT — l/r/h/d and the raw counters — rather than some
 * friendlier local shape. Keeping one shape is not tidiness: the first version
 * remembered {left,right,jumpHeld} and put THAT on the wire, where the server
 * reads {l,r,h} and a missing jump counter simply meant nobody ever jumped.
 * The bench caught it; a phone would have shown it as the jump button doing
 * nothing at all.
 */
function stepLocal(a, h, dt, edge) {
  const frozen = a.frozenUntil && G.time < a.frozenUntil;
  const flipped = a.reversedUntil && G.time < a.reversedUntil;
  const locked = a.lockUntil && G.time < a.lockUntil;
  const input = {
    left: frozen || locked ? false : flipped ? !!h.r : !!h.l,
    right: frozen || locked ? false : flipped ? !!h.l : !!h.r,
    // The press is an EDGE, so it belongs to the first half of the tick that
    // carried it and to no other — applied twice it would count as two.
    jumpDown: frozen || locked ? false : (edge && !!h.jd),
    jumpHeld: frozen ? false : !!h.h,
    dropDown: frozen || locked ? false : !!h.d,
  };
  if (frozen) a.vx *= 0.82;
  stepActor(a, input, G.grid, dt, G.actors, {});
  holdAbility(a, dt);
  /* ...and the fire button, silently.
   *
   * An ability MOVES you, so leaving it out of the replay would mean every
   * correction landed on a body that had never air-hopped — the server would
   * say you were four tiles up and the replay would put you back on the
   * floor. The shot and the punch are their own button and are left out on
   * purpose: they spawn things and hurt people, and the server has already
   * done both. `loud` is what separates the two.
   */
  if (edge && h.kd) tryAbility(a, false);
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
      /* SMASH! is the GO, so the round starts ON it.
       *
       * The three cards were BUBU, DUDU, SMASH! at one second each and play
       * began a second AFTER the last one — so the noise that says go went
       * off while you still could not move, and the card you were meant to
       * react to had already been on screen for a beat by the time the round
       * did anything. Charlie: "di tama yung timing sa intro ng sound."
       *
       * Now the third card, its sound, its flash and the first frame you can
       * move on all land together, and the card rides the first second of
       * the round the way a GO card is supposed to. */
    if (countdown <= 1) {
      phase = "play";
      // ...and the card comes down a beat into the round rather than at the
      // moment it starts, which is what makes it read as GO and not as 1.
      cardUntil = G.time + 0.7;
      fx.music("duck", false);
      fx.banner(null);
    }
  }

  // The GO card, taken down a beat into the round. It used to come off when
  // the countdown reached zero, and the countdown no longer gets that far.
  if (cardUntil && G && G.time >= cardUntil) {
    cardUntil = 0;
    fx.count(null);
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
      tickRound(G, sim, roundCtx());
      tickPowers(sim);
      tickBoxes(sim);
      tickKing(sim);
      tickKingContact(sim);
      tickCoins(sim);
      tickFairies(sim);
      tickHelper(sim);
      tickMinis(sim);
      tickPunches();
      tickSwings();
      tickRules(sim);
    }
    G.time += sim;
    easeCorrection(dt);
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
