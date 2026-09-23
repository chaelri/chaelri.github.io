// Two phones, no laptop, any network.
//
// BOTH phones run the whole game. Same rules, same Dudu, same arena — each
// from the same seed, so neither has to be told what the other's world looks
// like. Each applies its own thumbs the instant they move and the other
// player's as they arrive, and the host sends where everything actually is a
// few times a second so the two can never quietly tell different stories.
//
// It used to be one-sided: the host played the live game and the guest drew
// pictures of it, interpolated sixty milliseconds late at whatever rate they
// turned up. That makes the two experiences different BY CONSTRUCTION — the
// delay is the design, not a bug in it — and it is why one phone always felt
// worse than the other however much was tuned.
//
// Why Charlie still hosts: somebody has to own the truth and mint the seed,
// and electing by who arrived first needs a negotiation that can tie badly
// (both hosting, neither finding the other). For two named people a fixed
// answer is simply better. It buys him no advantage now — he waits on the
// same corrections she does.
//
// Across two mobile networks WebRTC usually cannot connect directly (carrier
// NAT), so net.js falls back to relaying through Firebase. That works and it
// is slower; the status pill says which one you are on. Running the round on
// both phones is what makes the relay lane playable at all: it now carries
// corrections rather than every frame of the picture.

import { createClient } from "./net.js";
import { createPad, paintShootButton } from "./pad.js";
import { hydrate } from "./netstate.js";
import { armAudio, onAudioState, startAudio, sfx } from "./audio.js";
import * as HUD from "./hud.js";

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const ROOM = (params.get("r") || "BUBUDUDU").toUpperCase();
const WHO_KEY = "bubududu-smash.who";

/* Wake the server while you are still deciding who you are.
 *
 * It is on Cloud Run's free tier, which means when nobody has played for a
 * few minutes there is no container at all and the first person in waits
 * eight to twelve seconds for one to start. Nothing about that is fixable
 * for free — but it does not have to be spent WAITING. A bare GET the moment
 * the page opens starts the container booting behind the two taps it takes
 * to pick a name, and by the time the socket is opened it is up. Nothing
 * depends on the answer, so a failure here costs nothing either.
 */
if (params.get("net") !== "p2p") {
  import("./netclient.js")
    .then(({ SERVER }) => fetch(SERVER.replace(/^ws/, "http") + "/health", { mode: "no-cors" }))
    .catch(() => {});
}

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

  /* The server build, and it is the DEFAULT now.
   *
   * Both phones are equal clients of a real authoritative server; nobody
   * hosts. It was behind `?net=server` while it was being proved out, which
   * turned out to be the whole of a morning's confusion: every fix to the
   * netcode was landing on a build nobody was opening. The plain URL is the
   * one that gets typed, so the plain URL has to be the good one.
   *
   * `?net=p2p` still opts back into the old peer-to-peer path, which is kept
   * as something that works if the server is ever down — but on it one player
   * watches the live game and the other watches a copy of it, and that gap is
   * in the shape of the design, not in the tuning of it.
   */
  if (params.get("net") !== "p2p") {
    wait.querySelector(".who").classList.add("gone");
    import("./netclient.js").then((net) => net.connect({ role, say }));
    return;
  }

  wait.querySelector(".who").classList.add("gone");
  say(role === "p1" ? "old build · opening the room…" : "old build · looking for Charlie…");
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

/** Karla. Sends buttons, draws whatever comes back. */
/** Karla. Runs the same round Charlie is running, and shows it live. */
async function guestSide() {
  // screen.js boots itself on import and takes the page over — the same as it
  // does for the host. In ?role=p2 it knows not to open a room or broadcast;
  // everything else about it is identical, which is the point.
  const screen = await import("./screen.js");
  const pad = createPad({ onEdge: haptic });

  let client = null;
  let seq = 0;
  let rematchSeq = 0;
  let started = false;
  const got = { corrections: 0, bytes: 0, lastAt: 0, bad: 0 };
  window.__duo = () => ({
    ...got,
    since: got.lastAt ? Math.round(performance.now() - got.lastAt) : -1,
    mode: client && client.mode,
  });
  const sessionKey = Math.random().toString(36).slice(2, 8);

  function onMessage(m) {
    if (!m) return;

    // A power hint for the fire button, not a round message.
    if (m.p !== undefined && m.a === undefined && m.rs === undefined) {
      return paintShootButton(m.p, m.ammo);
    }

    // The host has started a round. Start the same one, from its seed.
    if (m.rs !== undefined) {
      started = true;
      wait.classList.add("gone");
      padEl.classList.remove("hidden");
      screen.beginRoundAs(m.rs, m.rn, m.sc);
      return;
    }

    if (!m.a) return;
    got.corrections++;
    got.lastAt = performance.now();
    got.bytes = JSON.stringify(m).length;

    // Charlie's thumbs, applied to our copy of him. This is what makes him
    // move here at all — nothing about his position is trusted between
    // corrections, it is simulated from what he is pressing.
    if (m.i1) {
      screen.feedRemoteInput("p1", {
        k: "host", n: ++hostSeq,
        l: !!m.i1[0], r: !!m.i1[1], h: !!m.i1[2], d: !!m.i1[3],
        j: m.i1[4], s: m.i1[5],
      });
    }

    // A round already in progress when we joined.
    if (!started && m.sd !== undefined) {
      started = true;
      wait.classList.add("gone");
      padEl.classList.remove("hidden");
      screen.beginRoundAs(m.sd, m.rn, m.sc);
    }

    // ...and the truth, to ease onto.
    let view;
    try {
      view = hydrate(m);
    } catch (err) {
      got.bad++;
      got.lastError = String(err && err.message ? err.message : err);
      console.warn("[bubu-dudu-smash] unreadable correction, skipped", err);
      return;
    }
    view.score = m.sc;
    view.roundNo = m.rn;
    screen.applyCorrection(view, m.rs2, m.ph);

    /* Everything the rules would have said, said for us.
     *
     * We run none of them, so none of this happens here by itself — the
     * banner, the countdown card, the scrim behind them, the toast when a
     * power-up is taken, and every sound in the game. hud.js does the drawing
     * on both sides, so there is one copy of the markup.
     */
    if (m.hd) applyHud(m.hd);
    if (m.nt) for (const [id, label, colour, title, body, glyph] of m.nt)
      HUD.showNote({ id, label }, colour, title, body, glyph);
    // Anything unknown is ignored rather than throwing: the two phones can be
    // a version apart in the middle of a match.
    if (m.sx) for (const key of m.sx) { try { sfx[key]?.(); } catch {} }
  }
  let hostSeq = 0;

  function paintState(mode) {
    const el = $("#state");
    if (el) {
      el.textContent =
        mode === "p2p" ? "direct" : mode === "relay" ? "relay" :
        mode === "lost" ? "reconnecting…" : mode === "offline" ? "offline" : "connecting…";
      el.dataset.mode = mode;
    }
    if (!started) {
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

  connect().catch(() => say("could not reach the room — is Charlie's phone open?"));

  // Our own thumbs go straight into our own simulation, with no wait at all,
  // and up the wire for his.
  setInterval(() => {
    const p = pad.state;
    screen.feedRemoteInput("p2", {
      k: "local", n: ++seq, l: p.l, r: p.r, h: p.h, d: p.d, j: p.j, s: p.s,
    });
    client?.send({
      k: sessionKey, n: seq, l: p.l, r: p.r, h: p.h, d: p.d, j: p.j, s: p.s,
      rm: rematchSeq,
    });
  }, 1000 / 40);

  // Rejoin on its own, the same way the controller page does.
  setInterval(async () => {
    if (client && !client.healthy) { paintState("lost"); await connect().catch(() => {}); }
  }, 1800);

  screen.onHostPower((mm) => paintShootButton(mm.p, mm.ammo));

  $("#rematch")?.addEventListener("click", () => {
    rematchSeq++;
    $("#rematch").classList.remove("show");
    haptic();
  });
}

/**
 * The overlay, applied only when it actually changes.
 *
 * setBanner and setCount both REPLACE their element, which is what restarts
 * the CSS animation — calling them every correction would retrigger the pop
 * thirty times a second and the text would sit there vibrating.
 */
let hudWas = "";
function applyHud(hd) {
  const key = JSON.stringify(hd);
  if (key === hudWas) return;
  hudWas = key;
  if (hd.banner) HUD.setBanner(hd.banner[0], hd.banner[1], hd.banner[2]);
  else HUD.hideBanner();
  if (hd.count != null) HUD.setCount(hd.count);
  else HUD.clearCount();
  HUD.setResult(hd.result);
}

/* ----------------------------------------------------------------- hud --- */

function haptic() {
  const h = $("#haptic");
  if (h) h.checked = !h.checked;
  try { navigator.vibrate?.(8); } catch {}
}

/* --------------------------------------------------------------- start --- */

document.addEventListener("gesturestart", (e) => e.preventDefault());
if (role) begin();
else say("pick who you are");
