// The screen: owns the simulation, the lobby and the match.
//
// Keyboard fills in for any player with no phone attached, so this is always
// playable solo for testing:
//   P1  A / D / W        P2  arrows        Enter start    R restart round

import {
  MODES, PLAYERS, ROUNDS_TO_WIN, FEEL, HELPER, BAD_HELPER, SQUAD, DIWATA, COINS, HIT,
  POWERUPS, POWER_ORDER, POWER_SPAWN_MS, POWER_FIRST_MS,
  SHOT_SPEED, SHOT_LIFE, SHOT_COOLDOWN_MS, SHOT_RADIUS, INPUT_HZ, STACK, ABILITY,
  GRAVITY, JUMP_VELOCITY,
} from "./config.js";
import { makeArena, readLevel, solidGrid } from "./levels.js";
import { rng, seed as seedRng, newSeed, rngState, setState as setRngState } from "./rng.js";
import { CHARACTERS, charById, preloadCharacters } from "./characters.js";
import { abilityLook, abilityOf, abilityReady, tickCharges } from "./ability.js";
import { makeActor, stepActor, kill, reviveAt } from "./physics.js";
import { createRenderer, createScene, draw, drawScene, resize, resizeScene } from "./render.js";
import { createHost } from "./net.js";
import { markSVG } from "./marks.js";
import { armAudio, audioState, duckMusic, onAudioState, sfx as rawSfx, startAudio, startMusic, stopMusic } from "./audio.js";
import { snapshot, rowsEqual } from "./netstate.js";
import { paintPanels, packChips, chipsFor as panelChips } from "./panel.js";
import * as HUD from "./hud.js";
import { showNote as drawNote } from "./hud.js";
import { COUNT_WORDS } from "./hud.js";

/* Everything laid over the arena is MIRRORED to the guest.
 *
 * She runs no rules, so none of this happens on her phone by itself — before
 * it was sent, her screen dimmed behind a result and stayed empty, and the
 * countdown never appeared at all. These wrappers record the last thing shown
 * so broadcast() can put it on the wire; hud.js does the actual drawing on
 * both sides, so there is one copy of the markup. */
const shown = { banner: null, count: null, result: null };

/* Notes and sounds are EVENTS, not state: they happen once and are gone, so
 * they ride the next snapshot as a queue that is emptied when it is sent
 * rather than as something compared against last time. Without this the guest
 * had no toasts and no audio at all — every `sfx` call and every note in the
 * game happens inside the rules, and she runs none of them. */
const pending = { notes: [], sfx: [] };

function showNote(a, colour, title, body, glyph = "") {
  pending.notes.push([a.id, a.label, colour, title, body, glyph]);
  if (pending.notes.length > 6) pending.notes.shift();
  drawNote(a, colour, title, body, glyph);
}

/* Every sound the rules make, mirrored.
 *
 * A proxy rather than touching ~40 call sites, and it keeps the two in step:
 * anything added later is carried without being remembered about. Capped,
 * because a tick that somehow fires a hundred of them should cost one
 * snapshot, not a hundred sounds on the other phone. */
const sfx = new Proxy({}, {
  get(_, key) {
    return (opts) => {
      if (typeof key === "string" && pending.sfx.length < 8) pending.sfx.push(key);
      return rawSfx[key](opts);
    };
  },
});

function setBanner(title, sub, pre) {
  /* Nothing to say means HIDE it, not print the word "nothing".
   *
   * setBanner(null) put the literal string "null" in forty-point white across
   * the middle of the lobby, because the markup interpolates the title
   * straight in. Every existing caller happened to use hideBanner(); the
   * first one that did not found this immediately.
   */
  if (title == null) return hideBanner();
  shown.banner = [title, sub || "", pre || ""];
  HUD.setBanner(title, sub, pre);
}
function hideBanner() {
  shown.banner = null;
  HUD.hideBanner();
}
function setCount(n) {
  shown.count = COUNT_WORDS[n] ? n : null;
  if (n === 1) shown.banner = null;      // hud.setCount hides it
  HUD.setCount(n);
}
function clearCount() {
  shown.count = null;
  HUD.clearCount();
}
function setResult(kind) {
  shown.result = kind || null;
  HUD.setResult(kind);
}
import { tileAt } from "./physics.js";

const $ = (s) => document.querySelector(s);
const stage = $("#stage");
const lobby = $("#lobby");
const banner = $("#banner");
const countEl = $("#count");
const hud = $("#hud");
const rematchBtn = $("#rematch");
const recastBtn = $("#recast");
const toasts = { p1: $("#toastL"), p2: $("#toastR") };
const scene = createScene($("#scene"));

const params = new URLSearchParams(location.search);
const SOLO = params.has("solo");

/*
 * Duo: both players on their own phone, no laptop.
 *
 * This file is unchanged in every other respect — the host phone runs exactly
 * the rules the big screen runs, against exactly the same DOM. What duo mode
 * adds is only: a fixed room so two people on different networks can find each
 * other without scanning anything, the host's OWN player fed through the same
 * applyPacket() a remote controller uses, and a snapshot pushed to the guest.
 *
 * Charlie always hosts. Deciding it by who arrived first needs a negotiation
 * that can tie, and for two named people a fixed answer is simply better.
 */
const DUO = params.has("duo") || document.body.classList.contains("duo");

/* Guest: runs the WHOLE simulation, exactly like the host, instead of drawing
 * pictures the host sends.
 *
 * The old split made the two experiences different by construction — one
 * player watched the live game and the other watched an interpolated copy of
 * it, sixty milliseconds late, at whatever rate the snapshots arrived. No
 * amount of tuning closes that, because the delay IS the design.
 *
 * Now both phones run the same seeded, deterministic round. Each applies its
 * own thumbs the instant they move, and the other player's as it arrives.
 * What the host still owns is the truth: a few times a second it sends where
 * everything actually is, and the guest eases onto it. Small disagreements
 * are corrected before they can be seen; nothing waits on the network to
 * start moving.
 */
const GUEST = DUO && params.get("role") === "p2";
const DUO_ROOM = (params.get("r") || "BUBUDUDU").toUpperCase();
// Higher on a direct link than the relay lane can carry; net.js rate-limits
// its own side, so this is simply how often a fresh picture is offered.
const DUO_SNAPSHOT_HZ = 30;
// A full frame at least this often, so a guest is never waiting on a change.
const DUO_KEYFRAME_MS = 1000;
// ?mode=tapakan lets a mode be opened directly, which is the only way to test
// the versus rules without two phones in the room.
const FORCED = params.get("mode");

const renderer = createRenderer(stage);
let host = null;
let phase = "lobby"; // lobby | countdown | play | roundover | matchover
let G = null;
let countdown = 0;
let lastCount = -1;

const score = { p1: 0, p2: 0 };
let roundNo = 1;
const mode = "tapakan";

/* -------------------------------------------------------------- input --- */

const pads = {
  p1: { left: false, right: false, jumpHeld: false, drop: false, connected: false, char: "yhon" },
  p2: { left: false, right: false, jumpHeld: false, drop: false, connected: false, char: "bubu" },
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

/* Which keys do what, in one place.
 *
 * Several spellings each, because keyboards disagree about what sits next to
 * what — but the FIRST of each list is the one the game tells you about, on
 * the lobby card and on the skill badge. E and full stop are Charlie's pick:
 * E beside WASD, and the full stop beside the arrows. Both used to be spare
 * spellings of the fire key and have been taken off it, or one key would do
 * two things.
 */
const SHOOT_KEYS = {
  p1: ["KeyF", "KeyQ"],
  p2: ["Slash", "Comma", "ShiftRight", "Enter", "NumpadEnter"],
};
const SKILL_KEYS = {
  p1: ["KeyE", "KeyG", "KeyC"],
  p2: ["Period", "Semicolon", "Quote", "ControlRight"],
};
/** How each is written on screen — the first spelling, in plain English. */
export const KEY_LABEL = {
  shoot: { p1: "F", p2: "/" },
  skill: { p1: "E", p2: "." },
};

const keys = new Set();
addEventListener("keydown", (e) => {
  if (!e.repeat) {
    keys.add(e.code);
    if (!pads.p1.connected && (e.code === "KeyW" || e.code === "Space")) pendingJump.p1 = true;
    if (!pads.p2.connected && e.code === "ArrowUp") pendingJump.p2 = true;
    // Shoot sits next to each player's own hand: F beside WASD, and the
    // punctuation cluster beside the arrows. Several spellings each, because
    // keyboards disagree about what is next to what.
    if (!pads.p1.connected && SHOOT_KEYS.p1.includes(e.code)) pendingShot.p1 = true;
    if (!pads.p2.connected && SHOOT_KEYS.p2.includes(e.code)) pendingShot.p2 = true;
    /* The character's own move is its OWN key, beside the fire key, because
     * the whole reason it left the fire button is that the two are worth
     * pressing together — dash INTO a punch, hop and then shoot. */
    if (!pads.p1.connected && SKILL_KEYS.p1.includes(e.code)) pendingSkill.p1 = true;
    if (!pads.p2.connected && SKILL_KEYS.p2.includes(e.code)) pendingSkill.p2 = true;
    if (e.code === "Enter") rematch();
    // KeyR is p1's skill now. The round restart moved to a modifier so a
    // thumb on the skill key cannot reroll the arena mid-fight.
    if (e.code === "KeyR" && e.shiftKey && phase === "play") startRound();
  }
  if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
});
addEventListener("keyup", (e) => keys.delete(e.code));

/**
 * If a controller goes quiet, zero its movement. Without this a dropped
 * connection leaves you sprinting in whatever direction you were last heard
 * holding, which in the arena means straight off the edge.
 */
function dropStaleInput() {
  const now = performance.now();
  for (const id of ["p1", "p2"]) {
    if (!pads[id].connected) continue;
    if (now - lastHeard[id] > 400) {
      pads[id].left = pads[id].right = pads[id].jumpHeld = pads[id].drop = false;
    }
  }
}

function localInput() {
  // A locally-driven pad already has its input; the keyboard must not fight it.
  if (!pads.p1.connected && !pads.p1.local) {
    pads.p1.left = keys.has("KeyA");
    pads.p1.right = keys.has("KeyD");
    pads.p1.jumpHeld = keys.has("KeyW") || keys.has("Space");
    pads.p1.drop = keys.has("KeyS");
  }
  if (!pads.p2.connected && !pads.p2.local) {
    pads.p2.left = keys.has("ArrowLeft");
    pads.p2.right = keys.has("ArrowRight");
    pads.p2.jumpHeld = keys.has("ArrowUp");
    pads.p2.drop = keys.has("ArrowDown");
  }
}

/* --------------------------------------------------------------- round --- */

function startRound(withSeed) {
  // Hand the camera back, in case the last thing it did was hold on a body.
  renderer.kill = null;

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
  if (!GUEST && host) host.tell("p2", { rs: roundSeed, rn: roundNo, sc: { ...score } });

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
    quakes: [],   // where a ground pound landed, and how hard
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
  setResult(null);
  // Four seconds, one per card. At 3.2 the first card — BUBU — got the 0.2
  // left over after the other three took a second each, so it flashed for two
  // frames and the count read as DUDU, SMASH, title.
  countdown = 3;
  lastCount = -1;
  startMusic(138);
  setBanner(`${MODES[mode].name}`, `round ${roundNo}`);
}

function startMatch() {
  startAudio();
  showRematch(false);
  setResult(null);
  score.p1 = 0;
  score.p2 = 0;
  roundNo = 1;
  lobby.classList.add("gone");
  $("#scene")?.classList.add("gone");
  preloadCharacters();
  startRound();
}

/**
 * The one way back into a match, whatever you are holding.
 *
 * Enter, the on-screen button, and the guest phone's button all come through
 * here, so there is a single place that decides when a rematch is allowed.
 */
export function rematch() {
  if (phase === "lobby" || phase === "matchover") startMatch();
}

/* Back to the lobby, characters and all.
 *
 * Rematch keeps whoever you were, which is right most of the time and is
 * exactly wrong after a 3-0. The lobby is where the picker and the QR codes
 * live, so this simply goes back to it — the room stays open and the codes
 * are still the same room, so a phone already scanned in does not have to do
 * anything.
 */
export function backToLobby() {
  if (phase !== "matchover" && phase !== "lobby") return;
  phase = "lobby";
  G = null;
  score.p1 = 0; score.p2 = 0; roundNo = 1;
  setBanner(null);
  setResult(null);
  showRematch(false);
  clearCount();
  stopMusic();
  lobby.classList.remove("gone");
  $("#players")?.classList.remove("on");
  paintPick("p1");
  paintPick("p2");
}

function showRematch(on) {
  rematchBtn?.classList.toggle("show", !!on);
  recastBtn?.classList.toggle("show", !!on);
  $("#afterwards")?.classList.toggle("show", !!on);
}
rematchBtn?.addEventListener("click", rematch);
recastBtn?.addEventListener("click", backToLobby);

function endRound(winnerId, why) {
  // The guest does not run the rules, so it does not get to call the round
  // either — it would be deciding from its own predicted copy of a stomp and
  // could name a different winner. The host says, and it follows.
  if (GUEST) return;
  if (phase !== "play") return;
  phase = "roundover";
  G.winner = winnerId;
  if (winnerId) score[winnerId]++;

  const done = score.p1 >= ROUNDS_TO_WIN || score.p2 >= ROUNDS_TO_WIN;
  duckMusic(true);
  if (winnerId) sfx.roundWin(); else sfx.roundLose();
  const name = winnerId ? PLAYERS.find((p) => p.id === winnerId).name : "Nobody";
  setBanner(winnerId ? `${name} wins` : name, why);
  setResult("round");

  setTimeout(() => {
    if (done) {
      phase = "matchover";
      stopMusic();
      sfx.matchWin();
      const champ = score.p1 > score.p2 ? PLAYERS[0].name : PLAYERS[1].name;
      // "press Enter" is a lie on a phone, where there is no keyboard at all —
      // the match simply ended and nothing could restart it. The button below
      // is the real answer; the key is now just the shortcut for it.
      // The final score as the same pill the HUD wears all match, only big
      // and in the middle. As plain grey text under the headline it was the
      // one number nobody could read, on the one screen it matters most.
      setBanner(
        `${champ} wins the match`,
        "",
        `<div class="score final"><b class="p1">${score.p1}</b><i></i><b class="p2">${score.p2}</b></div>`
      );
      setResult("match");
      showRematch(true);
    } else {
      roundNo++;
      startRound();
    }
  }, 2600);
}

/**
 * The big number.
 *
 * Replacing the whole element is what restarts the CSS animation — re-setting
 * the text alone would leave the pop and the shock ring already finished.
 */

// Four beats, and they spell the game. "3 2 1 START" is four beats of
// nothing; this is the same four saying who you are playing as and what you
// are about to do, with the title landing on the last one as the round opens.



/**
 * `pre` sits ABOVE the headline — the final score goes there, because under
 * the name it read as a footnote to the sentence rather than as the result.
 */

/**
 * Whether a result is on screen, and how final it is.
 *
 * Drives the scrim behind the banner. `null` clears it, "round" dims the
 * arena, "match" dims it further — the round is over in under three seconds
 * and the arena still matters, the match is not.
 */

/* ----------------------------------------------------------- the rules --- */

/**
 * An actor whose position has gone non-finite draws nothing, throws nothing,
 * and never comes back — it simply disappears mid-round and the round cannot
 * end because nobody can die. One bad number anywhere in the physics or in
 * anything that pushes an actor about is enough to do it.
 *
 * Rather than hunt every arithmetic path, this catches the state itself: put
 * them back on solid ground and say so, so the game survives it and the cause
 * is named in the console instead of silently eating the match.
 */
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
    if (!widestFloor()) callItOnTheFloor();
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
function callItOnTheFloor() {
  const players = PLAYERS.map((p) => G.actors.find((a) => a.id === p.id)).filter(Boolean);
  if (players.length < 2) return;
  const rank = (a) =>
    Math.max(0, a.hp || 0) * 1000 + (a.dead ? 0 : 100) + Math.min(99, a.coins || 0);
  const [a, b] = players;
  const ra = rank(a);
  const rb = rank(b);
  if (ra === rb) return endRound(null, "the arena ran out");
  const won = ra > rb ? a : b;
  const lost = ra > rb ? b : a;
  const why =
    won.hp !== lost.hp ? `${won.label} had more hearts when the arena ran out`
    : won.dead !== lost.dead ? `${lost.label} was already down when the arena ran out`
    : `${won.label} had more gems when the arena ran out`;
  endRound(won.id, why);
}

// How much room a respawn wants from the other player before it will settle
// for a spot. Wider than both bodies plus the stomp window.
const SAFE_SPAWN_GAP = 4;

/**
 * Somewhere solid to come back to.
 *
 * The arena eats its floor inward from both ends, so by the middle of a round
 * the original spawn points are hanging over nothing — coming back there meant
 * falling again immediately and losing a second heart for it. This finds the
 * widest run of floor still standing and puts you in the middle of it, a
 * little above so you drop in rather than appear.
 */
/**
 * Is there anything to stand on under this spot?
 *
 * Two tiles of reach, which covers the one-tile gap every `?` marker sits at
 * above its platform and nothing more — a spot floating three tiles over the
 * void does not qualify just because the ground is somewhere below it.
 */
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

/* ----------------------------------------------------------- powerups --- */


/** A short note down that player's own side of the screen. */

/**
 * The fire control, per player.
 *
 * Charlie is on WASD so his is F, right beside it; Karla is on the arrows so
 * hers is the right Shift, right beside those. The chip and the pickup notice
 * both read from here, so there is one place that can be wrong.
 */
const SHOOT_KEY = { p1: "F", p2: "Shift" };

/** How to say it in a sentence, for whichever thing that player is holding. */
function shootPrompt(id, verb = "fire") {
  return pads[id]?.connected
    ? `Tap the button to ${verb}.`
    : `Press ${SHOOT_KEY[id]} to ${verb}.`;
}

/**
 * The smaller toast for "you already had this, now you have more of it".
 *
 * Deliberately not the same as the first-time note: the first one explains
 * what the thing DOES, which you do not need to be told twice, and which was
 * long enough that a second pickup pushed the panel out of the way again.
 */
function showStack(a, colour, title, gain, glyph = "") {
  showNote(a, colour, title, `Stacked \u2014 ${gain}.`, glyph);
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
  showNote(a, def.colour, def.name, body, type);
}


function padMsg(a) {
  const st = abilityState(a.id);
  return {
    p: a.power ? a.power.type : null,
    ammo: a.power ? a.power.ammo : 0,
    // ...and the character's own move, for the same button. The phone cannot
    // work this out: it does not run the rules and has never seen the round.
    ab: st ? st.ability.id : null,
    cd: st ? Math.round(st.cd * 100) : 0,
    rd: st ? (st.ready ? 1 : 0) : 0,
    n: st ? st.charges : 0,
    mx: st ? st.max : 0,
  };
}

function tellPad(a) {
  const msg = padMsg(a);
  host?.tell(a.id, msg);
  // The host's own fire button is not on the far end of a data channel, so it
  // has to be told directly or it never learns it is holding anything.
  if (DUO && a.id === "p1") for (const fn of powerListeners) fn(msg);
}

/* The fire button, kept up to date without flooding the channel.
 *
 * A power-up only changes when you pick one up, so telling the pad on that
 * event alone was enough. A cooldown changes every frame — and a cooldown
 * that is only redrawn when something else happens is a cooldown you cannot
 * read. Sent at ten a second, and only when it has actually changed, which
 * for most of a round is not at all.
 */
const padSaid = { p1: "", p2: "" };
let padToldAt = 0;
function tellPads(now) {
  if (!G || now - padToldAt < 100) return;
  padToldAt = now;
  for (const a of G.actors) {
    const msg = padMsg(a);
    const key = `${msg.p}|${msg.ammo}|${msg.ab}|${msg.cd}|${msg.rd}|${msg.n}`;
    if (padSaid[a.id] === key) continue;
    padSaid[a.id] = key;
    host?.tell(a.id, msg);
    if (DUO && a.id === "p1") for (const fn of powerListeners) fn(msg);
  }
}

function givePower(a, type) {
  const def = POWERUPS[type];

  // Two of them do their whole job to the OTHER player and are spent at once,
  // so they never become a state you are "holding".
  if (type === "lunas") {
    a.hp = Math.min(FEEL.hpMax, a.hp + def.heal);
    G.flash = { type, at: G.time };
    showPickup(a, type);
    sfx.lunas();
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
    showStack(a, def.colour, def.name, mag ? `${a.power.ammo} now` : "longer", type);
    tellPad(a);
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
  tellPad(a);
}

/* --------------------------------------------------------------- coins --- */
//
// Ten coins buys one of the four big things. They are the only thing in the
// game you can collect at your own pace, which is what makes them worth
// having: a round with nothing happening still has something to do, and the
// reward is big enough to cross the arena for.

// How long a collected coin keeps drawing its pickup. Matched in render.js.
const COIN_POP_SEC = 0.75;

/** Every tile you could stand on, top surface only. */
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
      renderer.punch = Math.max(renderer.punch || 0, 0.012 + a.coins * 0.004);
      renderer.shake = Math.max(renderer.shake || 0, 2 + a.coins * 0.8);

      // Each coin in the run is a semitone above the last, so ten of them
      // climb a scale and the reward lands on top of it. Resets with the
      // count, which is what makes a full run feel like it went somewhere.
      sfx.coin({ rate: Math.pow(2, (a.coins - 1) / 12) });
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

/** Ten coins, one of the four. */
function grantReward(a) {
  const pick = COINS.rewards[Math.floor(rng() * COINS.rewards.length)];
  renderer.punch = Math.max(renderer.punch || 0, 0.05);
  G.pops.push({ x: a.x, y: a.y - a.h * 0.6, at: G.time, colour: COINS.colour, glyph: "bituin" });
  a.glowUntil = G.time + 0.7;
  a.glowFor = 0.7;
  a.glowColour = COINS.colour;

  if (pick === "suntok") { givePower(a, "suntok"); return; }
  if (pick === "diwata") { giveFairy(a); return; }
  if (pick === "tatlo") { summonSquad(a); return; }
  summonDudu(a);
}

/* --------------------------------------------------------------- fairy --- */

function giveFairy(a) {
  // A second Diwata queues more heals behind the first rather than restarting
  // her at two — she is one of four things ten coins can buy, and buying the
  // same one twice should not be the worst of the four.
  if (a.fairy && !a.fairy.leaving) {
    a.fairy.left = Math.min(STACK.maxFairyHeals, a.fairy.left + DIWATA.heals);
    showStack(a, DIWATA.colour, DIWATA.name, `${a.fairy.left} hearts waiting`, "plus");
    sfx.diwata();
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
  showNote(a, DIWATA.colour, DIWATA.name, "Two hearts, one at a time.", "plus");
  sfx.diwata();
}

/**
 * Somewhere she can hover that a player could actually jump to.
 *
 * Same rule the power-ups follow: a reward you can see and cannot reach is
 * worse than no reward, because you go for it and you fall. Every perch is
 * measured UP from a solid tile, so there is always something under her.
 */
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

/** Put a loose Diwata on the field, drifting. */
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
  sfx.spawn();
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
    renderer.punch = Math.max(renderer.punch || 0, 0.04);
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
    G.pops.push({ x: a.x, y: a.y - a.h * 0.7, at: G.time, colour: DIWATA.colour, glyph: "plus" });
    sfx.lunas();
    if (f.left <= 0) { f.leaving = true; f.wave = 0; }
  }
}

/* --------------------------------------------------------------- minis --- */
//
// Three little Bubus. They are not clones of you — they are three small
// copies of the one thing in this game that is genuinely frightening, which
// is something that walks at you and lands on your head. Small, quick, and
// gone in nine seconds.
//
// They run the same stepActor as everybody else, so they fall, collide and
// stomp by the same rules. What is deliberately NOT shared with Dudu is his
// patience: they charge, they do not roam and they do not wait. The one thing
// they do share is that immunity stops them — a starred or flashing player is
// not something three of them get to gang up on.

/**
 * The squad arrives on its own and waits.
 *
 * They land in a huddle somewhere on the surviving floor and mill about until
 * one of the players walks into them. Whoever does takes all three at once —
 * splitting them would make this a race to pick up items, and they are meant
 * to read as three characters choosing a side.
 */
/** Puts SQUAD.count little Bubus on the floor and RETURNS them. */
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
  sfx.tatlo();
  return made;
}

/** The coin reward version: they arrive already on your side. */
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
    sfx.helperSave();
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

/** Hand a squad to whoever walked into it — by default, every loose one. */
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
  showNote(owner, SQUAD.colour, "Mini Bubus!",
    total > SQUAD.count ? `${total} little Bubus, all yours.` : "Three little Bubus, on your side.",
    "squad");
  sfx.helperSave();
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
        sfx.stomp();
        killPlayer(victim, G.actors.find((q) => q.id === m.owner) || null,
                   m.owner ? "bubus" : "strayBubu");
        renderer.shake = 14;
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
  if (!quiet) sfx.powerEnd();
  tellPad(a);
}

const hasPower = (a, t) => a.power && a.power.type === t;

function overlapping(a, b) {
  return (
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
    Math.abs(a.y - a.h / 2 - (b.y - b.h / 2)) < (a.h + b.h) / 2
  );
}

/**
 * Where the camera should look for a death at (x, y).
 *
 * A player who falls off the world dies somewhere far below the arena, and
 * pointing the camera there frames empty sky — the level clamp then quietly
 * cancels the whole move. Pulled back inside the level, the shot frames the
 * ledge they came off, which is the bit worth seeing.
 */
function deathFocus(a) {
  return {
    x: Math.max(1, Math.min(G.level.w - 1, a.x)),
    y: Math.max(1, Math.min(G.level.h - 1, a.y - a.h * 0.5)),
  };
}

/**
 * The single place a death costs anything.
 *
 * Falling into a pit and landing on spikes are killed off inside the physics
 * step, not through killPlayer, so routing both through here is the only way
 * they cost health at all — without it you could fall off the arena forever
 * for free.
 */
/**
 * How the round actually ended, in a sentence.
 *
 * "out of health" was true of every death there is and told you nothing: you
 * looked up from your own half of the screen and could not tell whether you
 * had been stomped, shot, swarmed or had simply walked off a ledge. Every
 * kill site tags `a.cause` on the way in, and this turns it into the one line
 * under the winner's name.
 */
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

  renderer.shake = HIT.shake;
  renderer.punch = HIT.punch;
  renderer.flash = 1;
  // And the camera drops the framing rule and dives onto the body. See the
  // kill cam in render.js — it is time-boxed and hands the camera back.
  renderer.kill = { ...deathFocus(a), t: 0, ms: HIT.killCamMs };

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

  sfx.die();

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
    renderer.kill = {
      ...deathFocus(a),
      t: 0,
      ms: HIT.winCamMs,
      zoom: HIT.winCamZoom,
      hold: true,
    };
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

/**
 * A death caused by the OTHER player — a stomp, a bullet, a star. These are
 * the ones a star or a moment of grace can turn aside; a pit is not.
 */
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
      sfx.spawn();
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
          glyph: q.type,
        });
        G.bursts.push({ x: q.x, y: q.y, at: G.time, colour: POWERUPS[q.type].colour });
        a.glowUntil = G.time + 0.45;
        a.glowFor = 0.45;
        a.glowColour = POWERUPS[q.type].colour;
        renderer.punch = Math.max(renderer.punch || 0, 0.035);
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
    if (hasPower(a, "bituin") && rng() < dt * 9) sfx.sparkle();
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
      if (t === "#") sfx.shotWall();
      // Where it landed. A bullet that simply stops mid-air reads as the
      // game having lost it; a spray of sparks off the plank reads as a miss.
      if (t === "#") G.pops.push({ x: b.x, y: b.y, at: G.time, colour: "#ffd873", glyph: "" });
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
        G.pops.push({ x: b.x, y: b.y, at: G.time, colour: "#ffd873", glyph: "" });
        G.shots.splice(i, 1);
        sfx.shotHit();
        killPlayer(o, G.actors.find((q) => q.id === b.owner) || null, "shot");
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
    if (loud) { sfx.jump(); showNote(a, ab.colour, ab.name, ab.desc, ab.mark); }
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
    if (loud) { sfx.bilis(); renderer.shake = Math.max(renderer.shake || 0, 4); }
    return;
  }

  // pound
  a.pounding = true;
  a.poundFrom = a.y;      // where the dive began — the blast is worth the fall
  a.vy = ab.speed;
  /* Horizontal momentum is KEPT, not killed.
   *
   * Zeroing it made the pound a dead drop, which is both less useful — you
   * can only ever hit what is directly beneath you — and worse to predict:
   * if the two sides disagree by a tick about when it fired, the difference
   * is the whole of a run, nine and a half tiles a second. Keeping it means
   * a disagreement costs nothing sideways. You still cannot STEER, which is
   * what makes it a commitment; you just keep what you came in with. */
  a.lockUntil = G.time + ab.lockMs / 1000;
  if (loud) sfx.suntok();
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
    if (a.grounded) { a.pounding = false; a.lockUntil = 0; poundLanded(a); }
    else a.vy = Math.max(a.vy, ab.speed);
  }
}

/**
 * What the fire button should be showing, for whoever holds this pad.
 *
 * Read-only, and it answers both questions the button needs: how much of the
 * cooldown is left to draw, and whether the move is actually available —
 * which is not the same thing. An Air Hop off cooldown is still unusable with
 * your feet on the ground, and a button that looked ready and did nothing
 * would be worse than one that looked spent.
 */
function abilityState(id) {
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
function poundLanded(a) {
  const ab = ABILITY.pound;
  /* How far the dive actually was, as 0..1 of a long one. */
  const fell = Math.max(0, a.y - (a.poundFrom ?? a.y));
  const force = Math.max(0, Math.min(1, fell / ab.fallFull));
  const reach = ab.blast + (ab.blastFar - ab.blast) * force;
  a.poundFrom = null;
  sfx.land();
  renderer.shake = Math.max(renderer.shake || 0, 15 + 30 * force);
  renderer.punch = Math.max(renderer.punch || 0, 0.04 + 0.09 * force);
  G.pops.push({ x: a.x, y: a.y, at: G.time, colour: ab.colour, glyph: ab.mark });
  /* The crater, for the renderer — replicated, so both phones see the same
   * one in the same place. `force` is how hard, which drives everything the
   * ground does: the ring, the dust, and how long the cracks stay. */
  G.quakes.push({ x: a.x, y: a.y, at: G.time, force });
  while (G.quakes.length > 6) G.quakes.shift();
  for (const o of G.actors) {
    if (o === a || o.dead) continue;
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
  if (hasPower(a, "suntok")) return tryPunch(a);
  if (!hasPower(a, "baril") || a.power.ammo <= 0) return;
  if (G.time * 1000 - a.shotAt < SHOT_COOLDOWN_MS) return;
  a.shotAt = G.time * 1000;
  a.power.ammo--;
  tellPad(a);
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
  sfx.shoot();
  // The gun kicks. Small — it is a cartoon — but a shot that moves nothing
  // at the firing end reads as the bullet having simply appeared.
  renderer.punch = Math.max(renderer.punch || 0, 0.03);
}

/**
 * The punch.
 *
 * A shot is fire-and-forget; a punch is a window. The fist winds up, is
 * dangerous for about an eighth of a second, and then it is over — so it can
 * miss, which is the whole reason it is allowed to be a one-hit kill at
 * arm's length. `tickPunches` below is what actually looks for a connection,
 * every frame the window is open, because both bodies keep moving through it.
 */
function tryPunch(a) {
  const def = POWERUPS.suntok;
  if (!a.power || a.power.ammo <= 0) return;
  if (a.punch && G.time - a.punch.at < def.cooldownMs / 1000) return;
  a.power.ammo--;
  a.punch = { at: G.time, face: a.face, hit: false };
  sfx.suntok();
  tellPad(a);
  if (a.power.ammo <= 0) {
    // Spent, but let the last one land before the power-up disappears.
    a.power.until = G.time + (def.windupMs + def.activeMs) / 1000 + 0.05;
  }
}

/** Where the fist is, in world tiles, 0..1 through its active window. */
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
      /* ...and MARKED as a launch, or it costs them nothing.
       *
       * The line above has said "still costs you your footing" since the
       * punch was written, and it did not: without this the victim cancels
       * the whole shove by holding a direction on the very next tick, which
       * is what anyone is already doing. Same bypass the pound uses and the
       * bad Dudu's throw uses — see `launched` in stepActor. */
      o.launchFor = Math.max(o.launchFor || 0, 0.2);
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
      G.pops.push({ x: fx, y: fy, at: G.time, colour: def.colour, glyph: "suntok" });
      G.freeze = Math.max(G.freeze, 0.13);
      G.slow = Math.max(G.slow, 0.22);
      renderer.shake = 46;
      renderer.punch = Math.max(renderer.punch || 0, 0.085);
      renderer.flash = Math.max(renderer.flash || 0, 0.42);
      sfx.badHit();
      sfx.shotHit();
      killPlayer(o, a, "punch");
      // Cleared straight after, because killPlayer may refuse the kill (a
      // shield, a star, i-frames) and a flag left set would make their NEXT
      // death — a plain fall, minutes later — take the whole bar.
      o.lethal = false;
      break;
    }
  }
}

/* ------------------------------------------------------------- helper --- */
//
// Dudu walks in from one side, paces along the ground, and gives whatever you
// need most to whoever reaches him first: health if you are hurt, otherwise a
// power-up. Then he waves and leaves. He exists so that being behind is never
// hopeless — in co-op as much as in versus.

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
  sfx.helper();
  return h;
}

/**
 * The coin reward: a Dudu who is already on your side.
 *
 * Bought rather than met, so the coin flip that makes one in ten of them turn
 * never happens — that gamble belongs to walking up to a stranger, not to
 * something you spent ten coins on.
 */
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
    showStack(owner, "#ffb84d", "Dudu", `${Math.round(had.until - G.time)}s of hunting`, "dudu");
    sfx.helper();
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
  showNote(owner, "#ffb84d", "Dudu", "Bought and paid for. He is on your side.", "dudu");
  sfx.helper();
}

/**
 * Somewhere near the chosen edge with floor under it and air above it.
 *
 * Fixed columns do not work: the arena floor stops well short of both edges,
 * so whoever walks in was being asked to appear in mid-air and never showed
 * up at all. Walk inward until there is something to stand on.
 */
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

/* ------------------------------------------------------------ Bad Dudu --- */
//
// Half the time, Dudu is not Dudu.
//
// Nothing about him looks different until you touch him, and that is the
// whole mechanic: at even odds, running at him stops being a reflex and
// becomes a bet you place every time he walks in.
//
// Once triggered it plays out on its own — transform, hold, throw — and the
// victim has no input for any of it. See BAD_HELPER in config.js for why it
// is deliberately not dodgeable.

/**
 * Bad Dudu grabs someone — unless they are untouchable, in which case it goes
 * very badly for him.
 *
 * The star already means "nothing can hurt me", and it beats a stomp, a
 * bullet and a Suntok. Being grabbed and thrown off the map straight through
 * it was the one hole left in that promise, and it is the worst possible one
 * to find out about: you took the power-up that says you are safe and then
 * died anyway, with no counterplay to learn from it. So the grab reverses —
 * he bounces off, and he is the one who goes flying.
 */
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
  renderer.shake = 30;
  renderer.punch = Math.max(renderer.punch || 0, 0.06);
  showNote(victim, "#ffe66b", "Nice try", "He bounced. The star does not care.", "bituin");
  sfx.badHit();
}

/**
 * Can anything actually land on this player right now?
 *
 * The star, and the grace period after a hit. Dudu uses it to decide whether
 * hunting them is worth his clock; Bad Dudu uses it to decide whether the
 * grab connects at all.
 */
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

  showNote(victim, "#a970ff", "Bad Dudu", "That was not Dudu.", "dudu");
  sfx.badWind();
  renderer.shake = 14;
}

/** The betrayal, from the grab to the throw. Runs instead of the hunt. */
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
    sfx.poof();
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

/**
 * Sent across the map. What kills them is the edge, not the punch.
 *
 * Thrown toward the NEARER end of the surviving floor rather than simply away
 * from him. Hurling someone away from yourself sends them inward as often as
 * out, and a throw that lands them safely in the middle of a wide floor is
 * just a shove — measured at 17 tiles of travel and no damage at all. Aiming
 * at the closer edge makes the throw mean what it looks like, while leaving
 * the counterplay exactly where it was: do not walk up to him.
 */
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
  renderer.shake = 40;
  renderer.punch = 0.07;
  sfx.badHit();
}

/**
 * Dudu hunts.
 *
 * Once you reach him he goes after the OTHER player for fifteen seconds and
 * tries to land on their head. He is not tethered to you and he is not a
 * dispenser — he is a third body on the field that happens to be on your side.
 *
 * The chase is driven through the same stepActor() the players use, so he
 * falls, collides, climbs and stomps by the same rules. The AI below is only
 * deciding which buttons to hold:
 *
 *   - run toward the target's x
 *   - jump when they are above him, when the ground ahead runs out, or when
 *     something is in the way
 *
 * That is enough to climb the arena and cross the race course, and it keeps
 * him beatable: outrun him, or get somewhere he cannot follow.
 */
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
      showNote(a, "#ffb84d", "Dudu", "He is on your side. He roams, and jumps them if they get close.", "dudu");
      sfx.helper();
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
        sfx.land();
        h.leaving = true;
        h.wave = 0;
        return;
      }
      // Credited to whoever he is working for, not to the bear.
      sfx.stomp();
      killPlayer(victim, G.actors.find((q) => q.id === h.ally) || null, "dudu");
      renderer.shake = 16;
      // He did what he came for.
      h.leaving = true;
      h.wave = 0;
      sfx.poof();
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
    sfx.poof();
  }
}

/** Is there something to land on just ahead of him? */
function groundAhead(a, dir) {
  const x = Math.floor(a.x + dir * 0.9);
  for (let d = 0; d <= 2; d++) {
    const row = G.grid.rows[Math.floor(a.y + d)];
    const c = row && row[x];
    if (c === "#" || c === "=") return true;
  }
  return false;
}

/** Is he standing on a platform he is allowed to fall through? */
function onDropThrough(a) {
  const tx = Math.floor(a.x);
  for (const y of [Math.floor(a.y), Math.floor(a.y + 0.06)]) {
    const row = G.grid.rows[y];
    if (row && row[tx] === "=") return true;
  }
  return false;
}

/** Is something in the way at body height? */
function wallAhead(a, dir) {
  const x = Math.floor(a.x + dir * 0.9);
  const row = G.grid.rows[Math.floor(a.y - 0.5)];
  return !!(row && row[x] === "#");
}

/* ---------------------------------------------------------------- loop --- *//* ---------------------------------------------------------------- loop --- *//* ---------------------------------------------------------------- loop --- */

let last = performance.now();
let acc = 0;
const STEP = 1 / 120;

let frameFaults = 0;
let lastFrameFault = null;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.08, (now - last) / 1000);
  last = now;
  /* One bad frame is one bad frame.
   *
   * rAF is re-armed above, so a throw here never stopped the loop — but it
   * did stop it ever getting PAST the throw, which is the same thing from the
   * outside: the countdown never ends, the banner never clears, and the
   * network carries on updating a game that has quietly stopped advancing.
   * Caught, counted and reported, so it shows up in __smash() instead of
   * looking like a hang.
   */
  try {
    advance(dt);
  } catch (err) {
    frameFaults++;
    if (!lastFrameFault) console.error("[bubu-dudu-smash] frame threw", err);
    lastFrameFault = String((err && err.stack) || err);
  }
}

/**
 * One frame of game, separated from the rAF callback so it can be driven by
 * hand. A background browser tab gets no animation frames at all, which makes
 * the versus rules untestable without two phones and a foreground window.
 */
function advance(dt) {
  // The title scene runs only while the lobby is up.
  if (phase === "lobby") {
    drawScene(scene, dt);
    return;
  }
  dropStaleInput();
  localInput();
  tellPads(performance.now());

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
      renderer.punch = n > 1 ? 0.045 : 0.1;
      renderer.shake = n > 1 ? 8 : 22;
      if (n <= 1) renderer.flash = 0.35;
      n > 1 ? sfx.count() : sfx.go();
      setCount(n);
    }
    if (countdown <= 0) {
      phase = "play";
      duckMusic(false);
      hideBanner();
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
    if (phase === "play" && sim > 0 && !GUEST) {
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
    draw(renderer, G, dt);
    paintHud();
    paintPlayers(dt);
    if (DUO) broadcast();
  }
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
        renderer.shake = 8;
        sfx.land();
        return;
      }
      sfx.stomp();
      killPlayer(victim, by, "stomp");
    },
    onJump: () => sfx.jump(),
    onLand: () => sfx.land(),
  };
  for (const a of G.actors) {
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
    stepActor(a, input, G.grid, dt, G.actors, opts);
    holdAbility(a, dt);
    if (pendingSkill[a.id]) tryAbility(a, true);
    if (pendingShot[a.id]) tryShoot(a);
  }
  pendingJump.p1 = false;
  pendingJump.p2 = false;
  pendingShot.p1 = false;
  pendingShot.p2 = false;
  pendingSkill.p1 = false;
  pendingSkill.p2 = false;
}

/* ------------------------------------------------------------- duo host --- */

let lastSnapAt = 0;
let lastRows = null;
let lastKeyAt = 0;
let guestWas = false;

/**
 * Push the round down to the guest phone.
 *
 * Capped by wall clock rather than by frame, so a 120 Hz phone does not send
 * twice as much as a 60 Hz one. The tilemap is the bulky part and it only
 * changes when the arena crumbles, so it is dropped from the payload whenever
 * it matches the last one the guest was sent — which is most ticks.
 */
let roundSeed = 0;
let lastChipKey = "";
let lastHudKey = "";

function broadcast() {
  if (GUEST || !host || !G) return;
  const now = performance.now();
  if (now - lastSnapAt < 1000 / DUO_SNAPSHOT_HZ) return;
  lastSnapAt = now;

  const snap = snapshot(G, {
    ph: phase, sc: score, rn: roundNo, wn: G.winner || 0, sd: roundSeed,
    // The host's own thumbs, and where the random stream has got to. Between
    // them these are what let the other phone run the same round rather than
    // watch this one. Input is tiny and goes every tick; the rest of the
    // snapshot is the correction it is checked against.
    i1: [pads.p1.left ? 1 : 0, pads.p1.right ? 1 : 0, pads.p1.jumpHeld ? 1 : 0,
         pads.p1.drop ? 1 : 0, seenJumps.p1, seenShots.p1],
    rs2: rngState(),
  });

  // Status chips, so the other phone can show the same panel. They are sent
  // only when they actually read differently — a chip is only redrawn at
  // sixths of its bar, so shipping the drain of every timer at 30 Hz would be
  // paying relay bandwidth for pixels nobody can tell apart.
  const chips = chipsWire();
  const chipKey = JSON.stringify(chips);
  if (chipKey !== lastChipKey) {
    lastChipKey = chipKey;
    snap.st = chips;
  }


  /* The overlay and the one-shot events.
   *
   * The guest runs none of the rules, so it generates none of this: no
   * banner, no countdown card, no toast when a power-up is taken, no sound.
   * State (banner, card, scrim) goes when it changes and in full on a
   * keyframe; notes and sounds are events and go as a queue that is drained
   * when it is sent.
   */
  const hudKey = JSON.stringify(shown);
  if (hudKey !== lastHudKey) {
    lastHudKey = hudKey;
    snap.hd = shown;
  }
  if (pending.notes.length) { snap.nt = pending.notes; pending.notes = []; }
  if (pending.sfx.length) { snap.sx = pending.sfx; pending.sfx = []; }

  // The tilemap is sent only when it differs from the last tick, because it is
  // most of the payload and it usually has not changed. That alone leaves a
  // guest who joins mid-round with NOTHING to draw against until the arena
  // next crumbles — several seconds of blank screen, which is exactly what it
  // looked like. So: a full frame the moment someone arrives, and one every
  // second regardless, in case a snapshot carrying rows was the one dropped.
  const guestNow = !!pads.p2.connected;
  const joined = guestNow && !guestWas;
  guestWas = guestNow;
  const stale = now - lastKeyAt > DUO_KEYFRAME_MS;

  if (joined || stale || !rowsEqual(snap.rows, lastRows)) {
    lastRows = snap.rows;
    lastKeyAt = now;
    snap.st = chips;          // a keyframe is complete...
    snap.hd = shown;          // ...overlay included
  } else {
    delete snap.rows;
  }
  host.tell("p2", snap);
  duoStats.sent++;
  duoStats.bytes = JSON.stringify(snap).length;
  duoStats.rows = !!snap.rows;
}

/**
 * What the duo link is actually doing, readable from the console on either
 * phone. "It connects but nothing arrives" is the failure this mode will keep
 * having, and guessing at it from the outside is miserable.
 */
export const duoStats = { sent: 0, bytes: 0, rows: false, get guest() { return !!pads.p2.connected; } };

/**
 * The host's own thumbs, through the same door a remote controller uses.
 *
 * Going straight at `pads.p1` would skip the sequence and session-key handling
 * in applyPacket, and then the two players would be running on subtly
 * different input paths — which is exactly the kind of difference that only
 * shows up mid-game.
 */
export function feedLocalPad(pad) {
  pads.p1.local = true;
  pads.p1.connected = true;
  let seq = 0;
  setInterval(() => {
    const p = pad.state;
    applyPacket("p1", {
      k: "local", n: ++seq,
      l: p.l, r: p.r, h: p.h, d: p.d, j: p.j, s: p.s,
    });
  }, 1000 / INPUT_HZ);
}

/* ------------------------------------------------------- the guest side --- */

/**
 * Start the round the host just started, on the host's seed.
 *
 * Both sides then build the same arena, spawn the same power-ups in the same
 * places and hand out the same rewards, without a byte of any of it being
 * sent — that is the whole point of the round being reproducible from one
 * number.
 */
export function beginRoundAs(seedValue, roundNumber, scoreline) {
  if (scoreline) { score.p1 = scoreline.p1; score.p2 = scoreline.p2; }
  if (roundNumber) roundNo = roundNumber;
  lobby.classList.add("gone");
  $("#scene")?.classList.add("gone");
  startRound(seedValue);
}

/**
 * Feed a player's thumbs in. Same door a controller uses.
 *
 * Both pads are claimed the first time this is called on the guest. Without
 * that, `pads.p2.connected` is false — nothing here ever opens a room or
 * paints a lobby slot — so localInput() decided p2 must be on the keyboard
 * and overwrote left/right from the arrow keys on EVERY frame. Her thumbs
 * reached the pad and were wiped a millisecond later, which looks exactly
 * like the game ignoring her. The host had the same bug once, for the same
 * reason, and it is what `local` was invented for.
 */
export const feedRemoteInput = (role, packet) => {
  if (GUEST && !pads.p2.local) {
    pads.p2.local = true;      // hers, from the glass
    pads.p2.connected = true;
    pads.p1.local = true;      // his, off the wire — the keyboard owns neither
    pads.p1.connected = true;
  }
  applyPacket(role, packet);
};

/** What the guest sends up, so the host can drive its copy of this player. */
export const localInputPacket = () => ({ ...pads.p2 });

/**
 * Ease onto the host's version of the truth.
 *
 * NOT a snap. The two simulations agree about almost everything almost all of
 * the time — they are the same code on the same seed — so a correction is
 * usually a few centimetres, and sliding onto it is invisible where jumping
 * onto it would be a stutter thirty times a minute. Anything big enough that
 * easing would look wrong (a death, a respawn, a throw) is taken outright.
 */
const CORRECT_EASE = 0.25;
const CORRECT_SNAP = 2.2;      // tiles of disagreement before we stop easing
const CORRECT_MINE = 3.5;      // ...and a much longer leash on your own body

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
      clearCount();
      if (phase === "play") hideBanner();
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
  G.quakes = view.quakes || [];
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

/** Is the other phone actually in the room? */
export const guestIn = () => !!pads.p2.connected;

/** So the duo page can show the fire button the right way round. */
export const onHostPower = (fn) => (powerListeners.push(fn), fn);
const powerListeners = [];

/* --------------------------------------------------------- player cards --- */

/**
 * The chips down the bottom: everything currently affecting you, with the time
 * left draining out of each one.
 *
 * Two of them (frozen, reversed) are things done TO you by the other player
 * and are marked `bad` so they pulse — you want those to be impossible to
 * miss, because you cannot work out why your controls feel wrong otherwise.
 */
/* One chipsFor(), in panel.js, and this page calls it with what it has.
 *
 * There used to be a copy here as well — the same twenty lines twice, and the
 * note under chipsWire() below already warned what that costs. It was right:
 * every symbol in the panel became a drawn mark rather than a character, and
 * the copy in this file would have gone on shipping the old ones.
 */
const chipsFor = (a) => panelChips(a, G, pads);

function paintPlayers(dt) {
  paintPanels(G.actors, { p1: chipsFor(G.actors.find((a) => a.id === "p1")),
                          p2: chipsFor(G.actors.find((a) => a.id === "p2")) }, dt, G.time, pads);
}

/**
 * The same chips, packed for the guest phone.
 *
 * She could not see a single status effect: the panels are painted from the
 * live round and she has no round. Recomputing them on her side would mean a
 * second copy of chipsFor() that quietly disagrees the first time one changes,
 * so the host does the thinking and sends the answer.
 */
function chipsWire() {
  const out = {};
  for (const p of PLAYERS) {
    const a = G.actors.find((x) => x.id === p.id);
    if (a) out[p.id] = packChips(chipsFor(a));
  }
  return out;
}

/**
 * The scoreboard: rounds won, and nothing else.
 *
 * It used to repeat both players' names at the top corners, which the panels
 * along the bottom already say in bigger type next to their faces, and the
 * mode name, which does not change. Two labels for the same person is clutter.
 */
function paintHud() {
  const key = `${score.p1}-${score.p2}`;
  if (hud.dataset.key === key) return;
  hud.dataset.key = key;
  hud.innerHTML =
    `<div class="score">` +
    `<b class="p1">${score.p1}</b><i></i><b class="p2">${score.p2}</b>` +
    `</div>`;
}

/* -------------------------------------------------------------- lobby --- */

// Set once the room is open; the picker calls it to redraw a code.
let drawQR = () => {};

/* Who each seat is holding, picked on the laptop.
 *
 * The slot used to print the character's NAME and nothing else, which was
 * honest when the choice was cosmetic and decided by which seat you took.
 * Each one carries an ability on the fire button now, so it is a choice and
 * the shared screen is where you make it — for the QR (the link carries the
 * character, so the code has to be redrawn when it changes) and for the two
 * of you on one keyboard, where there is no phone to pick on at all.
 *
 * Remembered per seat, so nobody re-picks every night.
 */
const REMEMBER = "bubududu-smash.cast";
function rememberCast() {
  try {
    localStorage.setItem(REMEMBER, JSON.stringify({ p1: pads.p1.char, p2: pads.p2.char }));
  } catch {}
}
function recallCast() {
  try {
    const was = JSON.parse(localStorage.getItem(REMEMBER) || "{}");
    for (const p of PLAYERS) {
      if (CHARACTERS.some((c) => c.id === was[p.id])) pads[p.id].char = was[p.id];
    }
  } catch {}
}

function paintPick(id) {
  const el = lobby && lobby.querySelector(`[data-slot="${id}"] .pick`);
  if (!el) return;
  if (el.dataset.built !== "1") {
    el.dataset.built = "1";
    el.innerHTML =
      `<div class="faces">` +
      CHARACTERS.map((c) => `<button type="button" data-char="${c.id}" title="${c.name}">` +
        `<canvas width="72" height="72"></canvas></button>`).join("") +
      `</div><div class="says"></div>`;
    for (const b of el.querySelectorAll("button")) {
      b.addEventListener("click", () => {
        pads[id].char = b.dataset.char;
        rememberCast();
        paintPick(id);
        // The code beside it is now for the wrong character until it is redrawn.
        drawQR(id);
      });
    }
  }
  const mine = pads[id].char;
  for (const b of el.querySelectorAll("button")) {
    b.classList.toggle("on", b.dataset.char === mine);
    // Redrawn every time, not once: two of the three are sprites and the
    // frames arrive over the network, so drawing at build time draws nothing.
    const cv = b.querySelector("canvas");
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, cv.width, cv.height);
    charById(b.dataset.char).draw(ctx, cv.width / 2, cv.height * 0.94,
      cv.width * 0.76, cv.height * 0.82,
      { face: 1, run: 0, air: 0, squash: 0, t: 0, walk: 0, stride: 1 });
  }
  const def = charById(mine);
  const ab = def.ability && ABILITY[def.ability];
  const says = el.querySelector(".says");
  says.style.setProperty("--ac", ab ? ab.colour : "#21313f");
  says.innerHTML = `<b>${def.name}</b>` + (ab ? markSVG(ab.mark, "mk") + ab.name : "");
}


function paintSlots(list) {
  for (const p of PLAYERS) {
    const on = list.find((x) => x.role === p.id);
    // `local` means this pad is driven by THIS device's own screen, so it has
    // no peer record and never will. Without the check, the moment the guest
    // joined this line declared the host's own player disconnected — and
    // localInput() below then overwrote his buttons with keyboard state (all
    // false on a phone) every single frame. He simply could not move.
    pads[p.id].connected = !!on || !!pads[p.id].local;
    // The duo page has no lobby cards — it is one phone, not a shared screen.
    // Reading them unconditionally threw here, BEFORE p2's `connected` was
    // set and before the start check below, so the host sat on "waiting for
    // Karla" forever with her sitting right there connected.
    const el = lobby && lobby.querySelector(`[data-slot="${p.id}"]`);
    if (!el) continue;
    el.classList.toggle("on", !!on);
    // Empty until they are actually in. A QR code beside a name does not need
    // to be told it is for scanning.
    el.querySelector(".state").textContent = on ? (on.relay ? "in · relay" : "in") : "";
    paintPick(p.id);
  }

  // Both scanned in: start on its own. Nobody should have to walk back to the
  // laptop to press a key once they are already holding the controller.
  // In duo the host's own player is local, so it is never a connected peer:
  // waiting for both would wait forever. The guest arriving is the start.
  const ready = DUO
    ? pads.p2.connected
    : PLAYERS.every((p) => pads[p.id].connected);
  if (ready && phase === "lobby" && !starting) {
    starting = true;
    sfx.join();
    setTimeout(() => {
      if (phase === "lobby") startMatch();
      starting = false;
    }, 1100);
  }
}
let starting = false;


// Under ?solo the live round is hung on window for inspection. Versus rules
// are hard to exercise any other way without two phones in the room.
// Also exposed in duo, where the host is a phone: a backgrounded tab gets no
// rAF, so being able to step the simulation by hand is the only way to tell a
// broken link apart from a throttled one.
if (SOLO || DUO) {
  window.__smash = () => ({
    phase, mode, G, score, roundNo, kill: renderer.kill,
    frameFaults, lastFrameFault,
  });
  window.__smashStep = (dt, n = 1) => {
    for (let i = 0; i < n; i++) advance(dt);
    return { phase, time: G && G.time };
  };
  window.__smashInput = (id, patch) => Object.assign(pads[id], patch);
  // Determinism harness: restart a round on a KNOWN seed and read back a
  // fingerprint of the whole live state, so two runs can be compared.
  window.__smashRound = (sd) => { startRound(sd); return roundSeed; };
  window.__smashSeed = () => roundSeed;
  window.__smashFingerprint = () => {
    const r2 = (n) => Math.round(n * 1000) / 1000;
    return JSON.stringify({
      lvl: G.level.rows.join("|"),
      a: G.actors.map((a) => [a.id, r2(a.x), r2(a.y), r2(a.vx), r2(a.vy), a.hp, a.dead ? 1 : 0]),
      pw: G.powers.map((q) => [r2(q.x), r2(q.y), q.type]),
      cn: G.coins.map((c) => [r2(c.x), r2(c.y)]),
      he: G.helpers.map((h) => [r2(h.actor.x), r2(h.actor.y), h.ally || 0, h.bad ? 1 : 0]),
      mi: G.minis.map((m) => [r2(m.actor.x), r2(m.actor.y), m.owner || 0]),
      wf: G.wildFairy ? [r2(G.wildFairy.x), r2(G.wildFairy.y)] : 0,
      t: r2(G.time),
    });
  };
  window.__smashPacket = (role, pkt) => { applyPacket(role, pkt); return { ...pads[role] }; };
  window.__smashJump = (id) => (pendingJump[id] = true);
  window.__smashShoot = (id) => (pendingShot[id] = true);
}

$("#localBtn")?.addEventListener("click", () => {
  // Keyboard already stands in for any slot with no phone attached, so this
  // just skips the waiting.
  startAudio();
  startMatch();
});

/**
 * The same room code across reloads of this screen.
 *
 * A fresh code every load means every refresh silently kills the room, and a
 * QR that was already scanned — or a phone still sitting on the controller —
 * is pointing at nothing. Since the controller retries every couple of
 * seconds, reusing the code makes a reload invisible: the phones simply
 * reconnect.
 *
 * Kept per browser, not per tab, so closing the screen and opening it again
 * still lands on the same room. A new code is only minted if there has been no
 * game here for a day, so a stale one cannot be inherited forever.
 */
function keepCode() {
  // Duo has one room, always, so the other phone needs nothing but the URL.
  if (DUO) return DUO_ROOM;
  const KEY = "bubududu-smash.room";
  const DAY = 24 * 60 * 60 * 1000;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && saved.code && Date.now() - saved.at < DAY) {
      localStorage.setItem(KEY, JSON.stringify({ code: saved.code, at: Date.now() }));
      return saved.code;
    }
  } catch {}
  // Same alphabet and length net.js uses (no look-alike characters), so a
  // code minted here is indistinguishable from one it would have made itself.
  const A = "23456789ACDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  for (let i = 0; i < 4; i++) code += A[bytes[i] % A.length];
  try { localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() })); } catch {}
  return code;
}

async function boot() {
  armAudio();
  onAudioState((st) => $("#sound")?.classList.toggle("show", st !== "on"));
  $("#sound")?.classList.toggle("show", audioState() !== "on");
  resize(renderer, innerWidth, innerHeight);
  resizeScene(scene, innerWidth, innerHeight);
  addEventListener("resize", () => {
    resize(renderer, innerWidth, innerHeight);
    resizeScene(scene, innerWidth, innerHeight);
  });
  preloadCharacters().then(() => { paintPick("p1"); paintPick("p2"); }).catch(() => {});
  // Before the codes are drawn: they carry the character.
  recallCast();
  paintPick("p1");
  paintPick("p2");
  requestAnimationFrame(frame);

  if (SOLO) {
    startMatch();
    return;
  }

  // The guest is handed a link by duo.js; it is not the one holding the room.
  if (GUEST) return;

  try {
    host = await createHost({ onInput: applyPacket, onPeers: paintSlots, code: keepCode() });
  } catch (err) {
    console.error("could not open a room", err);
    return;
  }
  addEventListener("beforeunload", () => host?.destroy());

  const base = new URL("phone/", location.href);

  /* One code per player, redrawn whenever that player's character changes.
   *
   * The link already says which room, which player and which character, so
   * scanning it is the entire join — no typing, no picking, no button. That
   * `c=` is why this has to be redrawable rather than made once: picking a
   * different character on the laptop has to change the code you are about to
   * scan, or the phone joins as whoever you picked LAST.
   */
  let qrcode = null;
  try {
    ({ default: qrcode } = await import("https://esm.sh/qrcode-generator@1.4.4"));
  } catch (e) {
    console.error("QR unavailable", e);
  }
  drawQR = (only) => {
    if (!qrcode || !host) return;
    for (const p of PLAYERS) {
      if (only && only !== p.id) continue;
      const slot = lobby.querySelector(`[data-slot="${p.id}"] .qr`);
      if (!slot) continue;
      const url = new URL(base);
      url.searchParams.set("r", host.code);
      url.searchParams.set("role", p.id);
      url.searchParams.set("c", pads[p.id].char);
      const qr = qrcode(0, "M");
      qr.addData(url.toString());
      qr.make();
      slot.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 1 });
    }
  };
  drawQR();
}

boot();
