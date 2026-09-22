// The screen: owns the simulation, the lobby and the match.
//
// Keyboard fills in for any player with no phone attached, so this is always
// playable solo for testing:
//   P1  A / D / W        P2  arrows        Enter start    R restart round

import {
  MODES, PLAYERS, ROUNDS_TO_WIN, FEEL, HELPER, BAD_HELPER, SQUAD, DIWATA, COINS, HIT, GLYPH,
  POWERUPS, POWER_ORDER, POWER_SPAWN_MS, POWER_FIRST_MS,
  SHOT_SPEED, SHOT_LIFE, SHOT_COOLDOWN_MS, SHOT_RADIUS,
} from "./config.js";
import { makeArena, readLevel, solidGrid } from "./levels.js";
import { CHARACTERS, charById, preloadCharacters } from "./characters.js";
import { makeActor, stepActor, kill, reviveAt } from "./physics.js";
import { createRenderer, createScene, draw, drawScene, resize, resizeScene } from "./render.js";
import { createHost } from "./net.js";
import { armAudio, audioState, duckMusic, onAudioState, sfx, startAudio, startMusic, stopMusic } from "./audio.js";
import { tileAt } from "./physics.js";

const $ = (s) => document.querySelector(s);
const stage = $("#stage");
const lobby = $("#lobby");
const banner = $("#banner");
const countEl = $("#count");
const hud = $("#hud");
const toasts = { p1: $("#toastL"), p2: $("#toastR") };
const scene = createScene($("#scene"));
const playersBar = $("#players");
const cards = {
  p1: playersBar?.querySelector('[data-p="p1"]'),
  p2: playersBar?.querySelector('[data-p="p2"]'),
};

const params = new URLSearchParams(location.search);
const SOLO = params.has("solo");
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
const pendingJump = { p1: false, p2: false };
const pendingShot = { p1: false, p2: false };

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
}

const keys = new Set();
addEventListener("keydown", (e) => {
  if (!e.repeat) {
    keys.add(e.code);
    if (!pads.p1.connected && (e.code === "KeyW" || e.code === "Space")) pendingJump.p1 = true;
    if (!pads.p2.connected && e.code === "ArrowUp") pendingJump.p2 = true;
    // Shoot sits next to each player's own hand: F beside WASD, and the
    // punctuation cluster beside the arrows. Several spellings each, because
    // keyboards disagree about what is next to what.
    if (!pads.p1.connected && ["KeyF", "KeyQ", "KeyE"].includes(e.code)) pendingShot.p1 = true;
    if (!pads.p2.connected && ["Slash", "Period", "Comma", "ShiftRight", "Enter", "NumpadEnter"].includes(e.code))
      pendingShot.p2 = true;
    if (e.code === "Enter" && (phase === "lobby" || phase === "matchover")) startMatch();
    if (e.code === "KeyR" && phase === "play") startRound();
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
  if (!pads.p1.connected) {
    pads.p1.left = keys.has("KeyA");
    pads.p1.right = keys.has("KeyD");
    pads.p1.jumpHeld = keys.has("KeyW") || keys.has("Space");
    pads.p1.drop = keys.has("KeyS");
  }
  if (!pads.p2.connected) {
    pads.p2.left = keys.has("ArrowLeft");
    pads.p2.right = keys.has("ArrowRight");
    pads.p2.jumpHeld = keys.has("ArrowUp");
    pads.p2.drop = keys.has("ArrowDown");
  }
}

/* --------------------------------------------------------------- round --- */

function startRound() {
  // Hand the camera back, in case the last thing it did was hold on a body.
  renderer.kill = null;

  // A new arena every round. Mirrored and reachability-checked in makeArena(),
  // so the variety cannot reintroduce either of the two things that used to
  // ruin a round: an unfair side, or a platform you can see and never reach.
  const level = makeArena();
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
    helper: null,
    helperAt: HELPER.firstMs / 1000,
    minis: [],    // the Tatlo squad, waiting or hunting
    squadAt: SQUAD.firstMs / 1000,
    coins: [],    // loose change on the platforms
    coinAt: 0,
    pops: [],     // pickup shockwaves
    actors: PLAYERS.map((p, i) => {
      const a = makeActor(meta.spawns[i].x, meta.spawns[i].y, p.id);
      a.char = pads[p.id].char;
      a.stats = { ...(charById(a.char).stats || {}) };
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
  countdown = 3.2;
  lastCount = -1;
  startMusic(138);
  setBanner(`${MODES[mode].name}`, `round ${roundNo}`);
}

function startMatch() {
  startAudio();
  score.p1 = 0;
  score.p2 = 0;
  roundNo = 1;
  lobby.classList.add("gone");
  $("#scene")?.classList.add("gone");
  preloadCharacters();
  startRound();
}

function endRound(winnerId, why) {
  if (phase !== "play") return;
  phase = "roundover";
  G.winner = winnerId;
  if (winnerId) score[winnerId]++;

  const done = score.p1 >= ROUNDS_TO_WIN || score.p2 >= ROUNDS_TO_WIN;
  duckMusic(true);
  if (winnerId) sfx.roundWin(); else sfx.roundLose();
  const name = winnerId ? PLAYERS.find((p) => p.id === winnerId).name : "Nobody";
  setBanner(winnerId ? `${name} wins` : name, why);

  setTimeout(() => {
    if (done) {
      phase = "matchover";
      stopMusic();
      sfx.matchWin();
      const champ = score.p1 > score.p2 ? PLAYERS[0].name : PLAYERS[1].name;
      setBanner(`${champ} wins the match`, `${score.p1} — ${score.p2} · press Enter`);
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
let countHide = null;

// Four beats, and they spell the game. "3 2 1 START" is four beats of
// nothing; this is the same four saying who you are playing as and what you
// are about to do, with the title landing on the last one as the round opens.
const COUNT_WORDS = { 3: "BUBU", 2: "DUDU", 1: "SMASH", 0: "BUBU DUDU SMASH!!" };

function setCount(n) {
  clearTimeout(countHide);
  const word = COUNT_WORDS[n];
  if (!word) return clearCount();
  countEl.innerHTML =
    `<div class="count word${n === 0 ? " go title" : ""}">` +
    `<span class="ring"></span><span class="num">${word}</span></div>`;
  // The round title lives in the middle of the screen too, so it steps up out
  // of the way for as long as the number is there rather than sitting under it.
  document.body.classList.add("counting");
  // Nothing follows the last one, so it takes itself off.
  if (n === 0) countHide = setTimeout(clearCount, 900);
}

function clearCount() {
  clearTimeout(countHide);
  countEl.innerHTML = "";
  document.body.classList.remove("counting");
}

function setBanner(title, sub) {
  banner.innerHTML = `<div class="bt">${title}</div><div class="bs">${sub || ""}</div>`;
  banner.classList.add("in");
}
const hideBanner = () => banner.classList.remove("in");

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
    a.invulnUntil = G.time + FEEL.hurtInvulnMs / 1000;
  }
}

function tickRules(dt) {
  catchLostActors();

  // respawns
  for (const a of G.actors) {
    if (!a.dead || a.respawn > 0) continue;
    if (a.hp <= 0) continue; // stays down — the round is already over
    const i = G.actors.indexOf(a);
    const at = safeSpawn(i);
    reviveAt(a, at.x, at.y);
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

const toastTimers = {};

/** A short note down that player's own side of the screen. */
function showNote(a, colour, title, body, glyph = "") {
  const el = toasts[a.id];
  if (!el) return;
  el.style.setProperty("--tc", colour);
  el.innerHTML =
    `<div class="who">${a.label}</div>` +
    `<div class="nm">${title}<em>${glyph}</em></div>` +
    `<div class="ds">${body}</div>`;
  el.classList.add("in");
  clearTimeout(toastTimers[a.id]);
  toastTimers[a.id] = setTimeout(() => el.classList.remove("in"), 2900);
}

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

function showPickup(a, type) {
  const def = POWERUPS[type];
  if (!def) return;
  // The two armed power-ups are the ones that need an instruction, and the
  // instruction differs per player and per controller — a phone says "tap the
  // button", a keyboard has to name the key.
  let body = def.desc || "";
  if (type === "baril") body = `Six shots. ${shootPrompt(a.id)}`;
  if (type === "suntok") body = `Three punches. ${shootPrompt(a.id, "punch")}`;
  showNote(a, def.colour, def.name, body, GLYPH[type] || "");
}


function tellPad(a) {
  host?.tell(a.id, { p: a.power ? a.power.type : null, ammo: a.power ? a.power.ammo : 0 });
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

  clearPower(a, true);
  a.power = {
    type,
    until: def.ms ? G.time + def.ms / 1000 : Infinity,
    ammo: def.ammo || def.punches || 0,
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
          const p = spots[Math.floor(Math.random() * spots.length)];
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
  const pick = COINS.rewards[Math.floor(Math.random() * COINS.rewards.length)];
  renderer.punch = Math.max(renderer.punch || 0, 0.05);
  G.pops.push({ x: a.x, y: a.y - a.h * 0.6, at: G.time, colour: COINS.colour, glyph: "\u2605" });
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
  a.fairy = {
    left: DIWATA.heals,
    next: G.time + DIWATA.firstMs / 1000,
    healAt: -1,
    leaving: false,
    wave: 0,
    phase: Math.random() * Math.PI * 2,
  };
  showNote(a, DIWATA.colour, "Diwata", "Fairy Yhon Yhon. Two hearts, one at a time.");
  sfx.diwata();
}

function tickFairies(dt) {
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
function spawnSquad(at = null) {
  const floor = widestFloor();
  if (!floor || floor.x1 - floor.x0 < 6) return;
  // Somewhere along the floor, but not right on top of either player —
  // unless they were bought, in which case they land where you are.
  let home = at;
  if (home === null) {
    let best = -1;
    for (let i = 0; i < 8; i++) {
      const x = floor.x0 + 2 + Math.random() * (floor.x1 - floor.x0 - 4);
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
    G.minis.push({
      actor: m,
      owner: null,                // nobody's yet
      home: home + off,
      until: G.time + SQUAD.waitMs / 1000,
      jumpAt: 0,
      leaving: false,
      wave: 0,
    });
  }
  sfx.tatlo();
}

/** The coin reward version: they arrive already on your side. */
function summonSquad(owner) {
  // Only this player's own squad is replaced. Clearing the whole array took
  // the OTHER player's Bubus off the field as well, which is a bought reward
  // deleting something the opponent had earned.
  G.minis = G.minis.filter((m) => m.owner !== owner.id);
  spawnSquad(owner.x);
  claimSquad(owner);
}

/** Hand the whole squad to whoever walked into it. */
function claimSquad(owner) {
  const target = G.actors.find((o) => o !== owner);
  for (const m of G.minis) {
    if (m.owner || m.leaving) continue;
    m.owner = owner.id;
    m.until = G.time + SQUAD.lifeMs / 1000;
    m.actor.speedMul = 1;
    m.actor.face = target ? Math.sign(target.x - m.actor.x) || 1 : 1;
  }
  showNote(owner, SQUAD.colour, "Tatlo", "Three little Bubus, on your side.");
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
      else if (Math.random() < 0.5 * dt) me.face *= -1;
      input.left = me.face < 0;
      input.right = me.face > 0;
      if (!groundAhead(me, me.face) || wallAhead(me, me.face)) {
        input.left = input.right = false;
        me.face *= -1;
      }
      // A little hop now and then, so a waiting squad is not three statues.
      if (me.grounded && G.time * 1000 - m.jumpAt > 900 && Math.random() < 0.5 * dt) {
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
        sfx.stomp();
        killPlayer(victim, by);
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
function handleDeath(a) {
  clearPower(a, true);
  // A fist in mid-air when you die does not get to land afterwards.
  a.punch = null;
  const before = a.hp;
  // Normally a death costs one heart. A punch is the exception — it is
  // flagged lethal at the point of contact and takes the whole bar.
  const lethal = !!a.lethal;
  a.lethal = false;
  a.hp = lethal ? 0 : Math.max(0, a.hp - 1);

  // Everything stops for a beat, then resumes in slow motion.
  G.freeze = HIT.freezeMs / 1000;
  G.slow = HIT.slowMoMs / 1000;

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
    vx: (Math.random() - 0.5) * 3,
    vy: -7,
    spin: (Math.random() - 0.5) * 9,
    rot: 0,
    at: G.time,
    index: before - 1,
  });

  sfx.die();

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
  }
  endRound(winnerId, "out of health");
}

/**
 * A death caused by the OTHER player — a stomp, a bullet, a star. These are
 * the ones a star or a moment of grace can turn aside; a pit is not.
 */
function killPlayer(victim, by) {
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
      ? free[Math.floor(Math.random() * free.length)]
      : floor
        ? { x: (floor.x0 + floor.x1 + 1) / 2, y: floor.y - 1.4 }
        : null;
    if (sp) {
      let type = POWER_ORDER[Math.floor(Math.random() * POWER_ORDER.length)];
      let guard = 0;
      while (type === G.lastPower && guard++ < 8)
        type = POWER_ORDER[Math.floor(Math.random() * POWER_ORDER.length)];
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
          glyph: GLYPH[q.type] || "",
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
    if (hasPower(a, "bituin") && Math.random() < dt * 9) sfx.sparkle();
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
      if (overlapping(a, o)) killPlayer(o, a);
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
        sfx.shotHit();
        killPlayer(o, null);
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
  tellPad(a);
  G.shots.push({
    x: a.x + a.face * (a.w / 2 + 0.25),
    y: a.y - a.h * 0.55,
    vx: a.face * SHOT_SPEED,
    vy: 0,
    owner: a.id,
    life: SHOT_LIFE,
  });
  sfx.shoot();
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
      if (Math.abs(fx - o.x) > (o.w + def.reach) / 2) continue;
      if (Math.abs(fy - (o.y - o.h / 2)) > o.h / 2 + 0.35) continue;
      a.punch.hit = true;
      // One punch. Not one heart — everything, spare hearts included. That is
      // the trade the Suntok makes: three swings, each one has to be thrown
      // from arm's length and each one can miss, so the one that lands ends
      // the round. A star still stops it outright.
      o.lethal = true;
      // Sent flying whether or not it kills — a star turns the damage aside
      // but not the shove, so surviving a punch still costs you your footing.
      o.vx = a.punch.face * def.knockback;
      o.vy = -5.5;
      G.bursts.push({ x: fx, y: fy, at: G.time, colour: def.colour, big: true });
      renderer.shake = 22;
      sfx.shotHit();
      killPlayer(o, a);
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
  const fromLeft = Math.random() < 0.5;

  const spot = edgeFooting(fromLeft);
  if (!spot) return;
  const { col, y } = spot;

  // A real actor, so he falls, collides and jumps exactly like a player does.
  const actor = makeActor(col + 0.5, y, "dudu");
  actor.stats = { ...HELPER.stats };
  actor.baseW = actor.w;
  actor.baseH = actor.h;
  actor.hp = 99;

  G.helper = {
    actor,
    ally: null,
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
  sfx.helper();
}

/**
 * The coin reward: a Dudu who is already on your side.
 *
 * Bought rather than met, so the coin flip that makes one in ten of them turn
 * never happens — that gamble belongs to walking up to a stranger, not to
 * something you spent ten coins on.
 */
function summonDudu(owner) {
  G.helper = null;
  spawnHelper();
  const h = G.helper;
  if (!h) return;
  // Put him beside his new ally rather than out at the edge.
  h.actor.x = owner.x + (owner.face || 1) * -1.4;
  h.actor.y = owner.y;
  h.ally = owner.id;
  h.until = G.time + HELPER.huntMs / 1000;
  h.actor.speedMul = 1;
  h.pause = 0;
  showNote(owner, "#ffb84d", "Dudu", "Bought and paid for. He is on your side.");
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

function beginBetrayal(h, victim) {
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

  showNote(victim, "#a970ff", "Bad Dudu", "That was not Dudu.");
  sfx.badWind();
  renderer.shake = 14;
}

/** The betrayal, from the grab to the throw. Runs instead of the hunt. */
function tickBetrayal(dt) {
  const h = G.helper;
  const me = h.actor;

  if (h.leaving) {
    h.wave += dt;
    if (h.wave > 1.2) G.helper = null;
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
  if (!G.helper) {
    G.helperAt -= dt;
    if (G.helperAt <= 0) {
      G.helperAt = HELPER.everyMs / 1000;
      spawnHelper();
    }
    return;
  }

  const h = G.helper;
  if (h.bad) return tickBetrayal(dt);

  const me = h.actor;

  if (h.leaving) {
    h.wave += dt;
    if (h.wave > 1.2) G.helper = null;
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
      if (Math.random() < HELPER.idlePauseChance * dt) {
        const [lo, hi] = HELPER.idlePauseMs;
        h.pause = (lo + Math.random() * (hi - lo)) / 1000;
      } else if (Math.random() < HELPER.idleTurnChance * dt) {
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
      if (Math.random() < HELPER.betrayChance) {
        beginBetrayal(h, a);
        break;
      }
      h.ally = a.id;
      h.until = G.time + HELPER.huntMs / 1000;
      me.speedMul = 1;
      h.pause = 0;
      showNote(a, "#ffb84d", "Dudu", "He is on your side. He roams, and jumps them if they get close.");
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
    const guarded = !!(target.power && target.power.type === "bituin");
    const untouchable = !!(target.invulnUntil && G.time < target.invulnUntil) || guarded;
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
          if (Math.random() < 0.55) {
            input.jumpDown = true;
            h.jumpAt = G.time * 1000;
          } else h.wanderDir *= -1;
        } else if (Math.random() < HELPER.wanderJumpChance * dt) {
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
      sfx.stomp();
      killPlayer(victim, by);
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

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.08, (now - last) / 1000);
  last = now;
  advance(dt);
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

  if (phase === "countdown") {
    countdown -= dt;
    const n = countdown > 1 ? Math.ceil(countdown - 1) : 0;
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

  if (G && (phase === "play" || phase === "countdown" || phase === "roundover")) {
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
      sim = dt * HIT.slowMoRate;
    }

    acc += sim;
    let guard = 0;
    while (acc >= STEP && guard++ < 8) {
      acc -= STEP;
      if (phase === "play") simulate(STEP);
    }
    if (phase === "play" && sim > 0) {
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
  }
}

function simulate(dt) {
  const opts = {
    onDeath: handleDeath,
    onStomp: (by, victim) => {
      // A star beats everything, including being landed on.
      if (hasPower(victim, "bituin")) {
        killPlayer(by, victim);
        return;
      }
      // Being big means you get bounced off, not squashed.
      if (hasPower(victim, "laki")) {
        renderer.shake = 8;
        sfx.land();
        return;
      }
      sfx.stomp();
      killPlayer(victim, by);
    },
    onJump: () => sfx.jump(),
    onLand: () => sfx.land(),
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

/* --------------------------------------------------------- player cards --- */

const HEART_SVG =
  '<svg viewBox="0 0 24 22"><path d="M12 21.3C2.6 14.6 1 11.2 1 7.9 1 4.1 3.9 1.4 7.2 1.4c2.1 0 3.8 1 4.8 2.6 1-1.6 2.7-2.6 4.8-2.6C20.1 1.4 23 4.1 23 7.9c0 3.3-1.6 6.7-11 13.4z"/></svg>';

/**
 * The chips down the bottom: everything currently affecting you, with the time
 * left draining out of each one.
 *
 * Two of them (frozen, reversed) are things done TO you by the other player
 * and are marked `bad` so they pulse — you want those to be impossible to
 * miss, because you cannot work out why your controls feel wrong otherwise.
 */
function chipsFor(a) {
  const out = [];

  // Progress toward the next reward, always first so it sits in one place.
  // `bump` makes the chip jump on the frame the count changes — the number
  // alone is too quiet to notice while you are looking at your character.
  out.push({
    label: `\u25c9 ${a.coins || 0}/${COINS.perReward}`,
    colour: COINS.colour,
    pct: ((a.coins || 0) / COINS.perReward) * 100,
    bad: false,
    bump: a.glowUntil && G.time < a.glowUntil && a.glowColour === COINS.colour,
  });

  if (a.fairy && !a.fairy.leaving) {
    const wait = Math.max(0, a.fairy.next - G.time);
    out.push({
      label: `\u271a ${a.fairy.left}`,
      colour: DIWATA.colour,
      pct: 100 - (wait / (DIWATA.everyMs / 1000)) * 100,
      bad: false,
    });
  }

  if (a.power) {
    const def = POWERUPS[a.power.type];
    const dur = def.ms ? def.ms / 1000 : 0;
    const left = a.power.until === Infinity ? 1 : Math.max(0, a.power.until - G.time);
    const pct = dur ? Math.max(0, Math.min(100, (left / dur) * 100)) : 100;
    let label;
    if (a.power.type === "baril" || a.power.type === "suntok") {
      // Show the key only to a player who is actually on the keyboard; on a
      // phone there is a button for it.
      const key = pads[a.id] && !pads[a.id].connected ? ` <em>${SHOOT_KEY[a.id]}</em>` : "";
      label = `${GLYPH[a.power.type]} ${a.power.ammo}${key}`;
    } else {
      label = `${GLYPH[a.power.type]} ${def.name}`;
    }
    out.push({ label, colour: def.colour, pct, bad: false });
  }
  if (a.frozenUntil && G.time < a.frozenUntil) {
    const left = a.frozenUntil - G.time;
    out.push({
      label: `${GLYPH.yelo} frozen`,
      colour: POWERUPS.yelo.colour,
      pct: (left / (POWERUPS.yelo.freezeMs / 1000)) * 100,
      bad: true,
    });
  }
  if (a.reversedUntil && G.time < a.reversedUntil) {
    const left = a.reversedUntil - G.time;
    out.push({
      label: `${GLYPH.baliktad} reversed`,
      colour: POWERUPS.baliktad.colour,
      pct: (left / (POWERUPS.baliktad.reverseMs / 1000)) * 100,
      bad: true,
    });
  }

  // Things that are yours but are not held IN your hands. They were doing
  // real work on the field with nothing in the panel to say so.
  const squad = G.minis.filter((m) => m.owner === a.id && !m.leaving).length;
  if (squad) {
    out.push({
      label: `\u2022\u2022\u2022 ${squad}`,
      colour: SQUAD.colour,
      pct: 100,
      bad: false,
    });
  }

  const h = G.helper;
  if (h && h.ally === a.id && !h.bad && !h.leaving) {
    const left = Math.max(0, h.until - G.time);
    out.push({
      label: "\ud83d\udc3b Dudu",
      colour: "#ffb84d",
      pct: (left / (HELPER.huntMs / 1000)) * 100,
      bad: false,
    });
  }

  // The grace after a hit. Knowing you cannot be touched for another second
  // is the difference between backing off and going straight back in.
  if (a.invulnUntil && G.time < a.invulnUntil) {
    const left = a.invulnUntil - G.time;
    out.push({
      label: "\u2727 safe",
      colour: "#9fd8ff",
      pct: (left / (FEEL.hurtInvulnMs / 1000)) * 100,
      bad: false,
    });
  }

  return out;
}

let facePose = 0;

function paintPlayers(dt) {
  if (!playersBar) return;
  playersBar.classList.add("on");
  facePose += dt;

  for (const p of PLAYERS) {
    const card = cards[p.id];
    const a = G.actors.find((x) => x.id === p.id);
    if (!card || !a) continue;
    card.style.setProperty("--pc", p.colour);
    card.classList.toggle("out", a.hp <= 0);

    // portrait, drawn with the same routine the game uses
    const cv = card.querySelector(".face");
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, cv.width, cv.height);
    charById(a.char).draw(ctx, cv.width / 2, cv.height * 0.96, cv.width * 0.72, cv.height * 0.8, {
      face: 1,
      run: 0,
      air: 0,
      squash: Math.sin(facePose * 2.2) * 0.05,
      t: facePose,
      walk: 0,
      stride: 1,
    });

    const hearts = card.querySelector(".phearts");
    // Only ever as many slots as you start with, plus however many spares you
    // are actually carrying — five empty slots would read as five lost hearts.
    const slots = Math.max(FEEL.hp, a.hp);
    const want = Array.from({ length: slots }, (_, i) => i < a.hp).join(",");
    if (hearts.dataset.state !== want) {
      hearts.dataset.state = want;
      hearts.innerHTML = Array.from({ length: slots }, (_, i) => {
        const cls = i >= FEEL.hp ? "bonus" : i < a.hp ? "" : "off";
        return HEART_SVG.replace("<svg", `<svg class="${cls}"`);
      }).join("");
    }

    const chips = chipsFor(a);
    const key = chips.map((c) => c.label + Math.round(c.pct / 6) + (c.bump ? "!" : "")).join("|");
    const el = card.querySelector(".pchips");
    if (el.dataset.key !== key) {
      el.dataset.key = key;
      el.innerHTML = chips
        .map(
          (c) =>
            `<span class="chip${c.bad ? " bad" : ""}${c.bump ? " bump" : ""}" style="--cc:${c.colour};--left:${c.pct}%">${c.label}</span>`
        )
        .join("");
    }
  }
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

function paintSlots(list) {
  for (const p of PLAYERS) {
    const on = list.find((x) => x.role === p.id);
    pads[p.id].connected = !!on;
    const el = lobby.querySelector(`[data-slot="${p.id}"]`);
    el.classList.toggle("on", !!on);
    // Empty until they are actually in. A QR code beside a name does not need
    // to be told it is for scanning.
    el.querySelector(".state").textContent = on ? (on.relay ? "in · relay" : "in") : "";
    el.querySelector(".pick").textContent = charById(pads[p.id].char).name;
  }

  // Both scanned in: start on its own. Nobody should have to walk back to the
  // laptop to press a key once they are already holding the controller.
  const ready = PLAYERS.every((p) => pads[p.id].connected);
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
if (SOLO) {
  window.__smash = () => ({ phase, mode, G, score, roundNo, kill: renderer.kill });
  window.__smashStep = (dt, n = 1) => {
    for (let i = 0; i < n; i++) advance(dt);
    return { phase, time: G && G.time };
  };
  window.__smashInput = (id, patch) => Object.assign(pads[id], patch);
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
  preloadCharacters();
  requestAnimationFrame(frame);

  if (SOLO) {
    startMatch();
    return;
  }

  try {
    host = await createHost({ onInput: applyPacket, onPeers: paintSlots, code: keepCode() });
  } catch (err) {
    console.error("could not open a room", err);
    return;
  }
  addEventListener("beforeunload", () => host?.destroy());

  const base = new URL("phone/", location.href);

  // One code per player. Each link already says which room, which player and
  // which character, so scanning it is the entire join — no typing, no
  // picking, no button.
  try {
    const { default: qrcode } = await import("https://esm.sh/qrcode-generator@1.4.4");
    for (const p of PLAYERS) {
      const url = new URL(base);
      url.searchParams.set("r", host.code);
      url.searchParams.set("role", p.id);
      url.searchParams.set("c", pads[p.id].char);
      const qr = qrcode(0, "M");
      qr.addData(url.toString());
      qr.make();
      lobby.querySelector(`[data-slot="${p.id}"] .qr`).innerHTML =
        qr.createSvgTag({ cellSize: 4, margin: 1 });
    }
  } catch (e) {
    console.error("QR unavailable", e);
  }
}

boot();
