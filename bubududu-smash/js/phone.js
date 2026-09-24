// The controller. Two thumbs, four buttons, nothing to read.
//
// The supervisor at the bottom is the part that matters: it watches the link
// and rebuilds the whole client when it dies, so locking your screen or
// walking through a dead spot costs you a couple of seconds instead of the
// rest of the game.

import { INPUT_HZ, PLAYERS } from "./config.js";
import { CHARACTERS, charById } from "./characters.js";
import { createClient } from "./net.js";
import { createPad, paintShootButton, paintSkillButton } from "./pad.js";
import { ABILITY } from "./config.js";
import { markSVG } from "./marks.js";

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

let pad = null;
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
// small enough that nobody would find them otherwise. The MOVE leads, because
// it is now the thing that actually tells the three apart; the old blurb is a
// line about their feel and was the only thing here when the choice was
// cosmetic.
els.chars.innerHTML = CHARACTERS.map((c) => {
  const ab = c.ability && ABILITY[c.ability];
  return `<button data-char="${c.id}"${ab ? ` style="--ac:${ab.colour}"` : ""}>` +
    `<b>${c.name}</b>` +
    (ab ? `<u>${markSVG(ab.mark, "mk")}${ab.name}</u>` : "") +
    `<i>${c.blurb || c.from}</i></button>`;
}).join("");
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

// The touch handling lives in pad.js, because the duo page's host phone needs
// exactly the same controls and two copies of it would drift apart.

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
  pad = createPad({ onEdge: tick });
}

/* --------------------------------------------------------------- send --- */

function send() {
  if (!pad) return;
  const p = pad.state;
  client?.send({ k: sessionKey, n: ++seq, l: p.l, r: p.r, h: p.h, d: p.d, j: p.j, s: p.s, k: p.k, c: character });
}

/** The screen tells us what we are holding; this is display only. */
function onMessage(m) {
  if (!m) return;
  // `ab` is the character's own move, which shares this button whenever no
  // power-up has taken it. The phone does not run the rules and has never
  // seen the round, so all of this is told rather than worked out.
  // Paint it once now, or the button is empty until the first power
  // message arrives — which on a quiet round is a while.
  paintShootButton(null, 0);
  paintShootButton(m.p, m.ammo);
  paintSkillButton(m.ab ? ABILITY[m.ab] : null, (m.cd || 0) / 100, !!m.rd, m.n || 0, m.mx || 0);
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
  window.__pad = () => ({ ...(pad ? pad.state : {}) });
} else if (params.get("r") && role) autoJoin();

document.addEventListener("gesturestart", (e) => e.preventDefault());
// NOTE: no global touchmove preventDefault. `touch-action: none` in the CSS
// already stops the page moving, and cancelling touchmove on top of it makes
// iOS fire pointercancel mid-press — which silently let go of whichever
// direction you were holding.
