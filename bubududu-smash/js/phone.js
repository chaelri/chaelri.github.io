// The controller. Two thumbs, four buttons, nothing to read.
//
// The supervisor at the bottom is the part that matters: it watches the link
// and rebuilds the whole client when it dies, so locking your screen or
// walking through a dead spot costs you a couple of seconds instead of the
// rest of the game.

import { INPUT_HZ, PLAYERS } from "./config.js";
import { CHARACTERS, charById } from "./characters.js";
import { createClient } from "./net.js";

const $ = (s) => document.querySelector(s);
const els = {
  join: $("#join"),
  pad: $("#pad"),
  code: $("#code"),
  err: $("#err"),
  joinBtn: $("#joinBtn"),
  state: $("#state"),
  haptic: $("#haptic"),
  chars: $("#chars"),
  who: [...document.querySelectorAll("[data-who]")],
};

const params = new URLSearchParams(location.search);
if (params.get("r")) els.code.value = params.get("r").toUpperCase();

let role = params.get("role") || null;
let character = params.get("c") || "yhon";
let client = null;

const state = { l: false, r: false, h: false, d: false, j: 0, s: 0 };
let seq = 0;
// A fresh key per page load. The screen uses it to tell "this is a new sender
// starting its count again" apart from "this is an old packet arriving late",
// which a sequence number alone cannot express.
const sessionKey = Math.random().toString(36).slice(2, 8);

function tick() {
  if (els.haptic) els.haptic.checked = !els.haptic.checked;
}

/* ------------------------------------------------------------- roster --- */

// Show how each one plays, not where the art came from — the differences are
// small enough that nobody would find them otherwise.
els.chars.innerHTML = CHARACTERS.map(
  (c) => `<button data-char="${c.id}"><b>${c.name}</b><i>${c.blurb || c.from}</i></button>`
).join("");
function selectChar(id) {
  character = id;
  for (const b of els.chars.querySelectorAll("[data-char]"))
    b.classList.toggle("sel", b.dataset.char === id);
}
els.chars.addEventListener("click", (e) => {
  const b = e.target.closest("[data-char]");
  if (b) {
    selectChar(b.dataset.char);
    tick();
  }
});
selectChar(character);

for (const btn of els.who) {
  btn.addEventListener("click", () => {
    role = btn.dataset.who;
    els.who.forEach((b) => b.classList.toggle("sel", b === btn));
    els.joinBtn.disabled = false;
    els.joinBtn.textContent = `Play as ${PLAYERS.find((p) => p.id === role).name}`;
  });
}
if (role) els.who.find((b) => b.dataset.who === role)?.click();

/* ------------------------------------------------------------ buttons --- */
// Held buttons are tracked by pointer id, because a thumb that slides off the
// edge of a button never fires pointerup where you expect it to.

/**
 * Controls, driven by the browser's own list of live touches.
 *
 * Every previous version tracked pointerdown/up pairs and kept its own record
 * of what was held. That record can desync — iOS drops or reorders a release
 * often enough — and a lost pointerup leaves a direction jammed on. The
 * symptom is confusing: pressing LEFT while RIGHT is stuck reads as "left
 * does nothing and he stops", because left and right cancel out.
 *
 * `TouchEvent.touches` is not a record, it is the complete set of fingers
 * currently on the glass. Recomputing every button from it on every touch
 * event means there is no bookkeeping left to get out of step: if a finger is
 * gone, it is simply not in the list.
 */
function bindControls() {
  const zones = () => ({
    dpad: document.querySelector(".dpad").getBoundingClientRect(),
    jump: $("#jump").getBoundingClientRect(),
    down: $("#down").getBoundingClientRect(),
    shoot: $("#shoot").getBoundingClientRect(),
  });

  const inside = (b, x, y, m = 14) =>
    x >= b.left - m && x <= b.right + m && y >= b.top - m && y <= b.bottom + m;

  let wasJump = false;
  let wasShoot = false;

  function apply(points) {
    const z = zones();
    let l = false, r = false, jump = false, down = false, shoot = false;

    for (const pt of points) {
      const { x, y } = pt;
      if (inside(z.dpad, x, y, 20)) {
        // Split down the middle: no dead strip, no overlap, and sliding from
        // one arrow to the other just works.
        if (x < z.dpad.left + z.dpad.width / 2) l = true;
        else r = true;
      }
      if (inside(z.jump, x, y)) jump = true;
      if (inside(z.down, x, y)) down = true;
      if (inside(z.shoot, x, y)) shoot = true;
    }

    state.l = l;
    state.r = r;
    state.h = jump;
    state.d = down;

    // Presses are counted on the rising edge only.
    if (jump && !wasJump) { state.j++; tick(); }
    if (shoot && !wasShoot) { state.s++; tick(); }
    wasJump = jump;
    wasShoot = shoot;

    $("#left").classList.toggle("down", l);
    $("#right").classList.toggle("down", r);
    $("#jump").classList.toggle("down", jump);
    $("#down").classList.toggle("down", down);
    $("#shoot").classList.toggle("down", shoot);
  }

  if ("ontouchstart" in window) {
    const fromTouches = (e) =>
      apply([...e.touches].map((t) => ({ x: t.clientX, y: t.clientY })));
    for (const ev of ["touchstart", "touchmove", "touchend", "touchcancel"])
      document.addEventListener(ev, fromTouches, { passive: true });
  } else {
    // Desktop fallback: one mouse pointer, same reconciliation.
    const live = new Map();
    const push = () => apply([...live.values()]);
    document.addEventListener("pointerdown", (e) => {
      live.set(e.pointerId, { x: e.clientX, y: e.clientY });
      push();
    });
    document.addEventListener("pointermove", (e) => {
      if (!live.has(e.pointerId)) return;
      live.set(e.pointerId, { x: e.clientX, y: e.clientY });
      push();
    });
    const drop = (e) => { live.delete(e.pointerId); push(); };
    document.addEventListener("pointerup", drop);
    document.addEventListener("pointercancel", drop);
  }

  // Anything that takes the page away releases everything.
  const clearAll = () => apply([]);
  addEventListener("blur", clearAll);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") clearAll();
  });
}

function paintCharBtn() {
  const b = $("#swap");
  if (b) b.textContent = charById(character).name;
}

function bindPad() {
  const swap = $("#swap");
  if (swap) {
    swap.addEventListener("click", () => {
      const i = CHARACTERS.findIndex((c) => c.id === character);
      selectChar(CHARACTERS[(i + 1) % CHARACTERS.length].id);
      paintCharBtn();
      tick();
    });
  }
  bindControls();
}

/* --------------------------------------------------------------- send --- */

function send() {
  client?.send({ k: sessionKey, n: ++seq, l: state.l, r: state.r, h: state.h, d: state.d, j: state.j, s: state.s, c: character });
}

/** The screen tells us what we are holding; this is display only. */
function onMessage(m) {
  const b = $("#shoot");
  if (!b || !m) return;
  // One button, two weapons. The glyph says which, the number says how many
  // are left — so a thumb never has to guess whether it is shooting or
  // punching.
  const armed = (m.p === "baril" || m.p === "suntok") && m.ammo > 0;
  b.classList.toggle("armed", armed);
  b.classList.toggle("melee", armed && m.p === "suntok");
  b.textContent = armed ? `${m.p === "suntok" ? "\u270a" : "\u279c"}${m.ammo}` : "\u279c";
}

/* ---------------------------------------------------------- supervisor --- */

let joining = false;

async function connect() {
  if (joining) return;
  joining = true;
  try {
    if (client) {
      try { client.destroy(); } catch {}
      client = null;
    }
    client = await createClient({
      code: els.code.value.trim().toUpperCase(),
      role,
      name: PLAYERS.find((p) => p.id === role)?.name || role,
      onState: paintState,
      onMessage,
    });
    paintState(client.mode);
  } finally {
    joining = false;
  }
}

function paintState(m) {
  const label =
    m === "p2p" ? "direct" : m === "relay" ? "relay" : m === "lost" ? "reconnecting…" : m === "offline" ? "offline" : "connecting…";
  els.state.textContent = label;
  els.state.dataset.mode = m;
}

/**
 * The watchdog. `healthy` goes false when RTDB drops us or when the screen's
 * copy of our peer record disappears — both of which happen every time an
 * iPhone locks. Rejoining is cheap, so just do it.
 */
function supervise() {
  setInterval(async () => {
    if (!client || joining) return;
    paintState(client.mode);
    if (!client.healthy) {
      paintState("lost");
      try { await connect(); } catch {}
    }
  }, 1800);

  addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible") return;
    try { await navigator.wakeLock?.request("screen"); } catch {}
    if (client && !client.healthy) await connect();
  });

  // Tapping the status pill forces a rejoin, for when all else fails.
  els.state.addEventListener("click", () => connect());
}

/* ---------------------------------------------------------------- join --- */

async function enterGame() {
  document.body.dataset.role = role;
  els.join.classList.add("gone");
  els.pad.classList.remove("hidden");
  bindPad();
  paintCharBtn();
  setInterval(send, 1000 / INPUT_HZ);
  supervise();
  try { await navigator.wakeLock?.request("screen"); } catch {}
}

els.joinBtn.addEventListener("click", async () => {
  if (els.code.value.trim().length < 4 || !role) return;
  els.joinBtn.disabled = true;
  els.err.textContent = "";
  try {
    await connect();
  } catch (err) {
    els.err.textContent = err.message || "Could not join.";
    els.joinBtn.disabled = false;
    return;
  }
  enterGame();
});

/**
 * Scanned straight off the screen: the link carries the room, the player and
 * the character, so there is nothing left to ask. Go.
 */
async function autoJoin() {
  els.join.classList.add("connecting");
  try {
    await connect();
  } catch (err) {
    // Only fall back to the form if the room genuinely is not there — a stale
    // QR from a previous session, usually.
    els.join.classList.remove("connecting");
    els.err.textContent = err.message || "Could not join.";
    els.joinBtn.disabled = !role;
    return;
  }
  enterGame();
}

// ?pad=1 shows the controls without a room, so the buttons can be exercised
// on their own. Nothing is sent anywhere.
if (params.has("pad")) {
  role = role || "p1";
  document.body.dataset.role = role;
  els.join.classList.add("gone");
  els.pad.classList.remove("hidden");
  bindPad();
  paintCharBtn();
  window.__pad = () => ({ ...state });
} else if (params.get("r") && role) autoJoin();

document.addEventListener("gesturestart", (e) => e.preventDefault());
// NOTE: no global touchmove preventDefault. `touch-action: none` in the CSS
// already stops the page moving, and cancelling touchmove on top of it makes
// iOS fire pointercancel mid-press — which silently let go of whichever
// direction you were holding.
