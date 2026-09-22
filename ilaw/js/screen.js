// The MacBook screen. Owns the simulation, the renderer and the room.
//
// Keyboard and mouse stand in for any role that has no phone attached, so the
// game is always playable — testing alone, or carrying on when someone's
// battery dies mid-level.
//   move: WASD / arrows      lantern: E       flare: space
//   aim:  mouse              focus:  hold mouse button

import { LEVELS } from "./levels.js";
import { ROLES, TUNING } from "./config.js";
import { createGame, idle, step } from "./world.js";
import { createRenderer, draw, resize } from "./render.js";
import { createHost } from "./net.js";
import { armAudio, audioState, duck, onAudioState, setAmbience, sfx, startAudio } from "./audio.js";

const $ = (s) => document.querySelector(s);
const stage = $("#stage");
const lobby = $("#lobby");
const card = $("#card");
const tipEl = $("#tip");
const soundEl = $("#sound");

const params = new URLSearchParams(location.search);
const SOLO = params.has("solo");

const renderer = createRenderer(stage);
let game = createGame(0);
let host = null;
let phase = "lobby"; // lobby | card | play
let levelIndex = 0;

const connected = { ilaw: false, anino: false };

/* -------------------------------------------------------------- input --- */

// Live controller state, merged from whichever transport is carrying it.
const input = {
  ilaw: { angle: 0, focus: 0, flare: false },
  anino: { mx: 0, my: 0, act: false },
};
// Press counters rather than booleans: a press sent over an unreliable data
// channel can arrive late or not at all, but a counter that went up is still
// unambiguous whenever it lands.
const seen = { fl: 0, ac: 0 };
const pending = { flare: false, act: false };

function applyPacket(role, p) {
  if (!p || typeof p !== "object") return;
  if (role === "ilaw") {
    if (Number.isFinite(p.a)) input.ilaw.angle = p.a;
    if (Number.isFinite(p.f)) input.ilaw.focus = p.f;
    if (Number.isFinite(p.fl)) {
      if (p.fl < seen.fl) seen.fl = p.fl; // the phone reloaded and reset
      else if (p.fl > seen.fl) {
        seen.fl = p.fl;
        pending.flare = true;
      }
    }
  } else if (role === "anino") {
    if (Number.isFinite(p.mx)) input.anino.mx = p.mx;
    if (Number.isFinite(p.my)) input.anino.my = p.my;
    if (Number.isFinite(p.ac)) {
      if (p.ac < seen.ac) seen.ac = p.ac;
      else if (p.ac > seen.ac) {
        seen.ac = p.ac;
        pending.act = true;
      }
    }
  }
}

/* -- keyboard + mouse, for any role nobody is holding a phone for ---------- */

const keys = new Set();
let mouse = { x: 0, y: 0, down: false, seen: false };

addEventListener("keydown", (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === "KeyE" && !connected.anino) pending.act = true;
  if (e.code === "Space" && !connected.ilaw) {
    pending.flare = true;
    e.preventDefault();
  }
  if (e.code === "Enter" && phase === "lobby") begin();
  if (e.code === "KeyR" && phase === "play") startLevel(levelIndex);
});
addEventListener("keyup", (e) => keys.delete(e.code));

stage.addEventListener("mousemove", (e) => {
  const rect = stage.getBoundingClientRect();
  const k = renderer.w / rect.width;
  mouse.x = ((e.clientX - rect.left) * k - renderer.ox) / renderer.scale;
  mouse.y = ((e.clientY - rect.top) * k - renderer.oy) / renderer.scale;
  mouse.seen = true;
});
stage.addEventListener("mousedown", (e) => {
  mouse.down = true;
  e.preventDefault();
});
addEventListener("mouseup", () => (mouse.down = false));
stage.addEventListener("contextmenu", (e) => e.preventDefault());

function localInput() {
  if (!connected.anino) {
    const l = keys.has("KeyA") || keys.has("ArrowLeft");
    const r = keys.has("KeyD") || keys.has("ArrowRight");
    const u = keys.has("KeyW") || keys.has("ArrowUp");
    const d = keys.has("KeyS") || keys.has("ArrowDown");
    input.anino.mx = (r ? 1 : 0) - (l ? 1 : 0);
    input.anino.my = (d ? 1 : 0) - (u ? 1 : 0);
  }
  if (!connected.ilaw && mouse.seen) {
    input.ilaw.angle = Math.atan2(mouse.y - game.light.y, mouse.x - game.light.x);
    input.ilaw.focus = mouse.down ? 1 : 0;
  }
}

/* ---------------------------------------------------------------- tips --- */

// One-liners that appear when the thing they describe is actually happening.
// A controls screen nobody reads is worse than no controls screen; this only
// speaks when there is something in front of you to attach it to.
let tipTimer = null;

function tip(html, ms = 7000, once = null) {
  if (once) {
    const key = "ilaw.tip." + once;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {}
  }
  clearTimeout(tipTimer);
  tipEl.innerHTML = html;
  tipEl.classList.add("in");
  tipTimer = setTimeout(() => tipEl.classList.remove("in"), ms);
}

/* -------------------------------------------------------------- cards --- */

let cardTimer = null;

function showCard(html, ms) {
  clearTimeout(cardTimer);
  card.innerHTML = html;
  card.classList.remove("hidden");
  requestAnimationFrame(() => card.classList.add("in"));
  duck(true);
  if (ms) {
    return new Promise((res) => {
      cardTimer = setTimeout(() => {
        hideCard();
        res();
      }, ms);
    });
  }
  return Promise.resolve();
}

function hideCard() {
  card.classList.remove("in");
  duck(false);
  setTimeout(() => card.classList.add("hidden"), 500);
}

/* --------------------------------------------------------------- flow --- */

async function startLevel(i) {
  levelIndex = i;
  game = createGame(i);
  seen.fl = 0;
  seen.ac = 0;
  pending.flare = pending.act = false;
  resize(renderer, innerWidth, innerHeight, game.level);
  phase = "card";
  const L = LEVELS[i];
  await showCard(
    `<div class="eyebrow">${i + 1} of ${LEVELS.length}</div>
     <h2>${L.name}</h2>
     <div class="sub">${L.sub}</div>
     <p class="hint">${L.hint}</p>`,
    2800
  );
  phase = "play";
  if (i === 0) {
    setTimeout(
      () =>
        tip(
          "<b>Ilaw</b> holds the light and cannot move. <b>Anino</b> walks and cannot see. That is the whole game.",
          9000,
          "roles"
        ),
      1200
    );
  }
}

async function onWon() {
  sfx.won();
  phase = "card";
  if (levelIndex + 1 < LEVELS.length) {
    await showCard(
      `<h2>Nakalabas kayo</h2><div class="sub">you got out</div>
       <p class="hint">Deeper, then.</p>`,
      2600
    );
    startLevel(levelIndex + 1);
  } else {
    await showCard(
      `<h2>Ilaw at Anino</h2><div class="sub">wakas</div>
       <p class="hint">You carried each other all the way down.<br>Press <b>R</b> to go again.</p>`,
      99999
    );
  }
}

async function onLost() {
  sfx.lost();
  renderer.shake = 26;
  phase = "card";
  await showCard(
    `<h2>Kinuha kayo ng dilim</h2><div class="sub">the dark took you</div>
     <p class="hint">Again.</p>`,
    2400
  );
  startLevel(levelIndex);
}

function begin() {
  if (phase !== "lobby") return;
  startAudio();
  lobby.classList.add("gone");
  startLevel(0);
}

/* --------------------------------------------------------------- loop --- */

let last = performance.now();
let acc = 0;
const STEP = 1 / 60;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  localInput();

  if (phase === "play") {
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard++ < 5) {
      acc -= STEP;
      input.ilaw.flare = pending.flare;
      input.anino.act = pending.act;
      step(game, STEP, input);
      pending.flare = pending.act = false;
      input.ilaw.flare = input.anino.act = false;
      handleEvents();
    }
  } else {
    // Keep the beam alive behind a card so the screen is never frozen.
    acc = 0;
    idle(game, dt, input);
  }

  soundtrack(dt);

  draw(renderer, game, {
    peers: [
      { label: ROLES.ilaw.name, on: connected.ilaw },
      { label: ROLES.anino.name, on: connected.anino },
    ],
  });
}

/* The two continuous voices, plus footsteps, driven off the sim each frame. */
let footAcc = 0;
let footX = 0;
let footY = 0;
let flareWasReady = true;

function soundtrack(dt) {
  const W = game.walker;

  let nearest = Infinity;
  for (const c of game.creatures) {
    if (!c.alive) continue;
    const d = Math.hypot(c.x - W.x, c.y - W.y);
    if (d < nearest) nearest = d;
  }
  const threat =
    phase === "play" && Number.isFinite(nearest)
      ? Math.max(0, Math.min(1, 1 - nearest / 9))
      : 0;
  const teeter = Math.min(1, W.teeter / (TUNING.teeterMs / 1000));
  setAmbience(threat, teeter);

  // Footsteps are paced by distance covered, not by time, so they slow down
  // when she does. A respawn teleports her, so a big jump is not a stride.
  const moved = Math.hypot(W.x - footX, W.y - footY);
  footX = W.x;
  footY = W.y;
  if (phase === "play" && moved < 1.5) {
    footAcc += moved;
    if (footAcc > 1.45) {
      footAcc = 0;
      sfx.footstep();
    }
  }

  const ready = game.time * 1000 >= game.light.flareReadyAt;
  if (ready && !flareWasReady) sfx.flareReady();
  flareWasReady = ready;

  // Teach the flare at the only moment it means anything: when something is
  // coming and he has one available.
  if (phase === "play" && ready && nearest < 7) {
    tip(
      "Something is close. <b>Flare</b> bursts light in every direction and shoves them back.",
      7000,
      "flare"
    );
  }
  if (phase === "play" && W.teeter > 0.05) {
    tip("She is standing on nothing. Only a cast shadow will hold her.", 6000, "void");
  }

  // The bridge lesson, taught at the edge of the hole rather than on a card
  // that flashed past three minutes ago.
  if (phase === "play" && game.level.voids.length) {
    const nearChasm = game.level.voids.some(
      (v) =>
        W.y > v.y - 2 &&
        W.y < v.y + v.h + 2 &&
        W.x > v.x - 3.2 &&
        W.x < v.x + v.w + 3.2
    );
    if (nearChasm && game.carried) {
      tip(
        "While she carries the lantern she stands at the centre of every shadow, so there is none to walk on. <b>Set it down</b>, then put the beam on a pillar.",
        9000,
        "placeit"
      );
    } else if (nearChasm && !game.carried) {
      tip(
        "The pale band across the pit is the pillar's shadow — that is the floor. Hold the beam still. <b>Hold the screen to focus</b> if it does not reach.",
        9000,
        "bridgevis"
      );
    }
  }
}

function handleEvents() {
  for (const e of game.events) {
    if (e.t === "shard") sfx.shard();
    else if (e.t === "place") sfx.place();
    else if (e.t === "take") sfx.take();
    else if (e.t === "flare") sfx.flare();
    else if (e.t === "burn") sfx.burn();
    else if (e.t === "newLantern") sfx.newLantern();
    else if (e.t === "hurt") {
      sfx.hurt();
      renderer.shake = 14;
    } else if (e.t === "fall") {
      sfx.fall();
      renderer.shake = 20;
    } else if (e.t === "won") onWon();
    else if (e.t === "lost") onLost();
  }
}

/* -------------------------------------------------------------- lobby --- */

function paintSlots(list) {
  for (const role of ["ilaw", "anino"]) {
    const was = connected[role];
    const p = list.find((x) => x.role === role);
    connected[role] = !!p;
    const el = lobby.querySelector(`[data-slot="${role}"]`);
    el.classList.toggle("on", !!p);
    el.querySelector(".state").textContent = p
      ? p.relay
        ? "connected · relay"
        : "connected"
      : "waiting…";
    if (!was && p) {
      startAudio();
      sfx.join();
    }
  }
  const ready = connected.ilaw && connected.anino;
  lobby.querySelector(".go").classList.toggle("ready", ready);
  lobby.querySelector(".go").textContent = ready
    ? "Both in — press Enter"
    : "Press Enter to start anyway (keyboard + mouse fill the gap)";
  if (ready && phase === "lobby" && !SOLO) setTimeout(begin, 900);
}

async function boot() {
  armAudio();
  onAudioState((st) => soundEl.classList.toggle("show", st !== "on"));
  soundEl.classList.toggle("show", audioState() !== "on");
  resize(renderer, innerWidth, innerHeight, game.level);
  addEventListener("resize", () => resize(renderer, innerWidth, innerHeight, game.level));
  requestAnimationFrame(frame);

  if (SOLO) {
    lobby.classList.add("gone");
    startAudio();
    startLevel(0);
    return;
  }

  try {
    host = await createHost({ onInput: applyPacket, onPeers: paintSlots });
  } catch (err) {
    lobby.querySelector(".code").textContent = "——";
    lobby.querySelector(".go").textContent =
      "Could not open a room. Add ?solo=1 to play on the keyboard.";
    console.error(err);
    return;
  }
  addEventListener("beforeunload", () => host?.destroy());

  const url = new URL("phone/", location.href);
  url.searchParams.set("r", host.code);
  lobby.querySelector(".code").textContent = host.code.split("").join(" ");
  lobby.querySelector(".url").textContent = url.host + url.pathname;

  try {
    const { default: qrcode } = await import("https://esm.sh/qrcode-generator@1.4.4");
    const qr = qrcode(0, "M");
    qr.addData(url.toString());
    qr.make();
    lobby.querySelector(".qr").innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2 });
  } catch {
    // A QR is a nicety; the code and the URL are the real path in.
  }
}

boot();
