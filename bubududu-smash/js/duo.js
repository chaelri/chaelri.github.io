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
import { stepActor } from "./physics.js";
import { createClient } from "./net.js";
import { createPad, paintShootButton } from "./pad.js";
import { hydrate } from "./netstate.js";
import { paintPanels, unpackChips } from "./panel.js";
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
  window.__duo = () => screen.duoStats;

  padEl.classList.remove("hidden");

  // Held on the waiting screen until she is actually in. Dropping straight
  // into an empty arena gives no clue whether anything is happening.
  const watch = setInterval(() => {
    if (!screen.guestIn()) return say("waiting for Karla…");
    clearInterval(watch);
    wait.classList.add("gone");
  }, 600);
}

/* ---------------------------------------------------------- smoothing --- */
//
// Snapshots arrive ~20 times a second. Drawing them raw means the world moves
// in 20 visible steps per second while the screen refreshes 60 times — which
// is most of what "laggy" actually was, before any network is blamed.
//
// Two separate cures, because the problem is two problems:
//
//   EVERYONE ELSE is drawn slightly in the PAST, interpolated between the two
//   most recent snapshots. A fixed delay of one snapshot interval is enough to
//   always have a pair to blend, and it buys smoothness for a lag nobody can
//   perceive on a character they do not control.
//
//   YOUR OWN character is drawn in the PRESENT, simulated locally from your
//   own buttons with the same physics the host runs, and corrected toward the
//   host whenever the two disagree. Without this, every step you take waits a
//   full round trip before it appears, and no amount of interpolation hides
//   that — it is the one thing you feel directly.

const LERP_BACK_MS = 60;     // how far behind live the remote view is drawn
const SNAP_AT = 2.5;         // tiles of disagreement before prediction gives up
const CORRECT = 0.18;        // otherwise, ease toward the host this much a frame

const lerp = (a, b, t) => a + (b - a) * t;

/** Blend everything positional between two hydrated snapshots. */
function tween(a, b, t) {
  const out = { ...b };
  out.actors = b.actors.map((nb) => {
    const pa = a.actors.find((x) => x.id === nb.id);
    if (!pa || pa.dead !== nb.dead) return nb;
    return { ...nb, x: lerp(pa.x, nb.x, t), y: lerp(pa.y, nb.y, t) };
  });
  out.minis = b.minis.map((nb, i) => {
    const pa = a.minis[i];
    if (!pa) return nb;
    return { ...nb, actor: { ...nb.actor, x: lerp(pa.actor.x, nb.actor.x, t), y: lerp(pa.actor.y, nb.actor.y, t) } };
  });
  out.helpers = (b.helpers || []).map((nb, i) => {
    const pa = (a.helpers || [])[i];
    if (!pa) return nb;
    return { ...nb, actor: { ...nb.actor,
      x: lerp(pa.actor.x, nb.actor.x, t),
      y: lerp(pa.actor.y, nb.actor.y, t) } };
  });
  if (b.wildFairy && a.wildFairy) {
    out.wildFairy = { ...b.wildFairy,
      x: lerp(a.wildFairy.x, b.wildFairy.x, t),
      y: lerp(a.wildFairy.y, b.wildFairy.y, t) };
  }
  return out;
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
  let lastJump = 0;
  const got = { snapshots: 0, bytes: 0, lastAt: 0 };
  // Status chips for both players, and what the host says the match is doing.
  // Chips ride the wire only when they change, so like the tilemap they have
  // to persist between the snapshots that carry them — otherwise every effect
  // would flicker off the instant it settled.
  let chips = { p1: [], p2: [] };
  let phase = "";
  let rematchSeq = 0;
  window.__duo = () => ({
    ...got,
    since: got.lastAt ? Math.round(performance.now() - got.lastAt) : -1,
    chips: { p1: chips.p1.length, p2: chips.p2.length },
    phase,
  });
  const sessionKey = Math.random().toString(36).slice(2, 8);

  // The two most recent pictures, what time each landed, and the tilemap they
  // were drawn against — rows only arrive on a keyframe, so they persist.
  let prev = null, prevAt = 0;
  let next = null, nextAt = 0;
  let rows = null;
  let me = null;          // the locally predicted copy of your own character
  let grid = null;

  function onMessage(m) {
    if (!m) return;
    // A power hint for the fire button, not a snapshot.
    if (m.p !== undefined && m.a === undefined) return paintShootButton(m.p, m.ammo);
    if (!m.a) return;
    if (m.rows) rows = m.rows;
    else if (rows) m.rows = rows;
    if (!m.rows) return;                    // nothing to draw against yet
    got.snapshots++; got.lastAt = performance.now();
    got.bytes = JSON.stringify(m).length;
    got.actors = m.a.length;

    const view = hydrate(m);
    grid = view.grid;
    prev = next || view; prevAt = nextAt || performance.now();
    next = view;         nextAt = performance.now();

    // Reconcile the prediction. Small disagreements are eased away so the
    // correction is invisible; a big one means we were wrong about something
    // real (a stomp, a throw, a respawn) and the host simply wins.
    const server = view.actors.find((a) => a.id === "p2");
    if (server) {
      if (!me || server.dead || Math.hypot(server.x - me.x, server.y - me.y) > SNAP_AT) {
        me = { ...server };
      } else {
        me.x = lerp(me.x, server.x, CORRECT);
        me.y = lerp(me.y, server.y, CORRECT);
        me.hp = server.hp;
        me.power = server.power;
        me.dead = server.dead;
        me.coins = server.coins;
        me.fairy = server.fairy;
        me.punch = server.punch;
        me.invulnUntil = server.invulnUntil;
        me.frozenUntil = server.frozenUntil;
        me.reversedUntil = server.reversedUntil;
        me.glowUntil = server.glowUntil;
        me.glowFor = server.glowFor;
        me.glowColour = server.glowColour;
      }
    }

    if (m.st) chips = { p1: unpackChips(m.st.p1), p2: unpackChips(m.st.p2) };
    if (m.ph) phase = m.ph;
    $("#rematch")?.classList.toggle("show", phase === "matchover");

    paintHud(m);
    wait.classList.add("gone");
    padEl.classList.remove("hidden");
  }

  function paintState(mode) {
    const el = $("#state");
    if (!el) return;
    el.textContent =
      mode === "p2p" ? "direct" : mode === "relay" ? "relay" :
      mode === "lost" ? "reconnecting…" : mode === "offline" ? "offline" : "connecting…";
    el.dataset.mode = mode;

    // Until the first snapshot there is nothing to draw, and "looking for
    // Charlie" is wrong once we have plainly found him — it reads as broken
    // while the round is simply still starting.
    if (!got.snapshots) {
      say(mode === "p2p" || mode === "relay"
        ? "found him — waiting for the round to start"
        : mode === "lost" ? "lost him, trying again…"
        : "looking for Charlie…");
    }
  }

  async function connect() {
    try { client?.destroy(); } catch {}
    client = await createClient({
      code: ROOM, role: "p2", name: "Karla", onState: paintState, onMessage,
    });
    paintState(client.mode);
  }

  // Karla cannot restart the match herself — only the host simulates — so the
  // tap travels up the same input channel as her thumbs and screen.js decides.
  $("#rematch")?.addEventListener("click", () => {
    rematchSeq++;
    $("#rematch").classList.remove("show");
    haptic();
  });

  connect().catch(() => say("could not reach the room — is Charlie's phone open?"));

  setInterval(() => {
    if (!client) return;
    const p = pad.state;
    client.send({ k: sessionKey, n: ++seq, l: p.l, r: p.r, h: p.h, d: p.d, j: p.j, s: p.s, rm: rematchSeq });
  }, 1000 / 40);

  // Rejoin on its own, the same way the controller page does.
  setInterval(async () => {
    if (client && !client.healthy) { paintState("lost"); await connect().catch(() => {}); }
  }, 1800);

  let last = performance.now();

  function tick(now) {
    const dt = Math.min(0.08, (now - last) / 1000);
    last = now;
    if (!next) return false;

    // Everyone else: blended between the last two snapshots, drawn slightly
    // behind live so there is always a pair to blend between.
    const span = Math.max(1, nextAt - prevAt);
    const t = Math.min(1, Math.max(0, (now - LERP_BACK_MS - prevAt) / span));
    const view = prev && prev !== next ? tween(prev, next, t) : next;

    // You: simulated here and now, from your own thumbs.
    if (me && grid && !me.dead) {
      const p = pad.state;
      const flipped = me.reversedUntil > view.time;
      const frozen = me.frozenUntil > view.time;
      stepActor(me, {
        left:  frozen ? false : flipped ? p.r : p.l,
        right: frozen ? false : flipped ? p.l : p.r,
        jumpDown: frozen ? false : p.j !== lastJump,
        jumpHeld: frozen ? false : p.h,
        dropDown: frozen ? false : p.d,
      }, grid, dt, [], {});
      lastJump = p.j;
      view.actors = view.actors.map((a) => (a.id === "p2" ? { ...a, ...me } : a));
    }

    draw(renderer, view, dt);
    paintPanels(view.actors, chips, dt);
    return true;
  }

  (function frame(now) {
    requestAnimationFrame(frame);
    tick(now);
  })(performance.now());

  // A backgrounded tab gets almost no rAF, so "nothing is drawn" and "nothing
  // is arriving" look identical from the outside. The host has __smashStep for
  // the same reason; this is the guest's half of it.
  window.__duoFrame = () => tick(performance.now() + 16);
}

/* ----------------------------------------------------------------- hud --- */

// The guest has no simulation, so the score comes off the wire — and so do the
// status chips, which the host computes and packs (see chipsWire in screen.js).
// Hearts are the one thing she could work out herself, and the panel draws
// them from the snapshot's actors, same as the host's copy does.
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
