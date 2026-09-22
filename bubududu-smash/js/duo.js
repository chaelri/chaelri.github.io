// Two phones, no laptop, any network.
//
// Charlie's phone is the host: it loads screen.js unchanged and runs the whole
// game — the same rules, the same Dudu, the same arena generator — and pushes
// a snapshot down to Karla twenty times a second. Karla's phone never
// simulates anything. It sends its buttons up and draws what comes back with
// the same render.js, so there is one copy of the art and one copy of the
// rules in this repo, not two.
//
// Why Charlie always hosts: electing a host by who arrived first needs a
// negotiation that can tie, and it can tie badly (both hosting, neither
// finding the other). For two named people a fixed answer is simply better,
// and it costs only that Charlie's phone has to be in the game — which it was
// going to be anyway.
//
// Across two mobile networks WebRTC usually cannot connect directly (carrier
// NAT), so net.js falls back to relaying through Firebase. That works and it
// is slower; the status pill says which one you are on.

import { createRenderer, draw, resize } from "./render.js";
import { preloadCharacters } from "./characters.js";
import { createClient } from "./net.js";
import { createPad, paintShootButton } from "./pad.js";
import { hydrate } from "./netstate.js";
import { armAudio, onAudioState, startAudio } from "./audio.js";

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const ROOM = (params.get("r") || "BUBUDUDU").toUpperCase();
const WHO_KEY = "bubududu-smash.who";

const wait = $("#duowait");
const padEl = $("#pad");
const statusEl = wait.querySelector(".status");

/* ----------------------------------------------------------- who are you --- */

let role = params.get("role") || localStorage.getItem(WHO_KEY) || null;

for (const b of wait.querySelectorAll("[data-who]")) {
  b.addEventListener("click", () => {
    role = b.dataset.who;
    try { localStorage.setItem(WHO_KEY, role); } catch {}
    startAudio();
    begin();
  });
}

function say(msg) {
  statusEl.textContent = msg;
}

/* ------------------------------------------------------------------ go --- */

function begin() {
  document.body.dataset.role = role;
  wait.querySelector(".who").classList.add("gone");
  say(role === "p1" ? "opening the room…" : "looking for Charlie…");
  armAudio();
  onAudioState((st) => $("#sound")?.classList.toggle("show", st !== "on"));
  if (role === "p1") hostSide();
  else guestSide();
}

/** Charlie. Loads the real game and lets it run the show. */
async function hostSide() {
  // screen.js boots itself on import and takes the page over. That is the
  // point: the host is not a special build of the game, it IS the game.
  const screen = await import("./screen.js");
  const pad = createPad({ onEdge: haptic });
  screen.feedLocalPad(pad);
  screen.onHostPower((m) => paintShootButton(m.p, m.ammo));

  padEl.classList.remove("hidden");
  wait.classList.add("gone");
  $("#state").textContent = "waiting for Karla";
  $("#state").dataset.mode = "host";

  // The pill doubles as the connection light once she is in.
  setInterval(() => {
    $("#state").textContent = screen.guestIn() ? "hosting" : "waiting for Karla";
  }, 1200);
}

/** Karla. Sends buttons, draws whatever comes back. */
function guestSide() {
  const renderer = createRenderer($("#stage"));
  resize(renderer, innerWidth, innerHeight);
  addEventListener("resize", () => resize(renderer, innerWidth, innerHeight));
  preloadCharacters();

  const pad = createPad({ onEdge: haptic });
  let client = null;
  let seq = 0;
  const sessionKey = Math.random().toString(36).slice(2, 8);

  // The last picture the host sent, and the tilemap it was drawn with. Rows
  // only arrive when the arena has crumbled, so they have to be remembered.
  let view = null;
  let rows = null;

  function onMessage(m) {
    if (!m) return;
    // A power hint for the fire button, not a snapshot.
    if (m.p !== undefined && m.a === undefined) return paintShootButton(m.p, m.ammo);
    if (!m.a) return;
    if (m.rows) rows = m.rows;
    else if (rows) m.rows = rows;
    if (!m.rows) return;                    // nothing to draw against yet
    view = hydrate(m);
    view.__phase = m.ph;
    paintHud(m);
    wait.classList.add("gone");
    padEl.classList.remove("hidden");
  }

  function paintState(mode) {
    const el = $("#state");
    el.textContent =
      mode === "p2p" ? "direct" : mode === "relay" ? "relay" :
      mode === "lost" ? "reconnecting…" : mode === "offline" ? "offline" : "connecting…";
    el.dataset.mode = mode;
  }

  async function connect() {
    try { client?.destroy(); } catch {}
    client = await createClient({
      code: ROOM, role: "p2", name: "Karla", onState: paintState, onMessage,
    });
    paintState(client.mode);
  }

  connect().catch(() => say("could not reach the room — is Charlie's phone open?"));

  setInterval(() => {
    if (!client) return;
    const p = pad.state;
    client.send({ k: sessionKey, n: ++seq, l: p.l, r: p.r, h: p.h, d: p.d, j: p.j, s: p.s });
  }, 1000 / 40);

  // Rejoin on its own, the same way the controller page does.
  setInterval(async () => {
    if (client && !client.healthy) { paintState("lost"); await connect().catch(() => {}); }
  }, 1800);

  let last = performance.now();
  (function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.08, (now - last) / 1000);
    last = now;
    // Drawn every frame even though snapshots arrive at 20 Hz — the camera
    // easing and every animation in render.js run on dt, so redrawing the
    // same snapshot still looks alive rather than juddering at 20 fps.
    if (view) draw(renderer, view, dt);
  })(performance.now());
}

/* ----------------------------------------------------------------- hud --- */

// The guest has no simulation, so the score comes off the wire. Health does
// not need to: render.js already draws each character's hearts over its head
// straight out of the snapshot, which is where you are looking anyway.
function paintHud(m) {
  const hud = $("#hud");
  if (m.sc) {
    hud.innerHTML =
      `<div class="score"><b class="p1">${m.sc.p1}</b><i>—</i><b class="p2">${m.sc.p2}</b></div>`;
  }
}

function haptic() {
  const h = $("#haptic");
  if (h) h.checked = !h.checked;
  try { navigator.vibrate?.(8); } catch {}
}

/* --------------------------------------------------------------- start --- */

document.addEventListener("gesturestart", (e) => e.preventDefault());
if (role) begin();
else say("pick who you are");
