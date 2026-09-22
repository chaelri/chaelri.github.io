// Both phones, as equal clients of a real server.
//
// Nobody is the host. Each phone connects to the same Colyseus room, sends
// what its thumbs are doing, and is told the world thirty times a second —
// and the two are told the SAME thing at the same moment, which is the one
// property the peer-to-peer build could never have. There, one player watched
// the live game with no latency at all and the other watched a copy of it;
// that gap is in the shape of the design, not in the tuning of it.
//
// Between updates each phone predicts, by running js/sim.js — the same rules
// the server is running — with `authority: false`. So it moves the players
// forward off their own inputs and waits for nothing, but it spawns nothing,
// decides nothing and calls no rounds. The server owns all of that, and the
// correction that arrives is simply better than the guess.

import { createRenderer, draw, resize } from "./render.js";
import { preloadCharacters } from "./characters.js";
import { createPad, paintShootButton } from "./pad.js";
import { paintPanels, chipsFor } from "./panel.js";
import { hydrate } from "./netstate.js";
import * as HUD from "./hud.js";
import * as sim from "./sim.js";
import {
  armAudio, onAudioState, startAudio, sfx, startMusic, stopMusic, duckMusic,
} from "./audio.js";

const $ = (s) => document.querySelector(s);

/** Where the server lives. Overridable for local work. */
export const SERVER =
  localStorage.getItem("bubududu-smash.server") ||
  "wss://bubududu-smash-server-668755364170.asia-southeast1.run.app";

/**
 * @param role  "p1" or "p2" — the page already knows, it is in the URL.
 * @param say   progress text for the waiting screen.
 */
export async function connect({ role, say = () => {} }) {
  const { Client } = await import("https://esm.sh/colyseus.js@0.16.22");

  const renderer = createRenderer($("#stage"));
  resize(renderer, innerWidth, innerHeight);
  addEventListener("resize", () => resize(renderer, innerWidth, innerHeight));
  preloadCharacters();

  const pad = createPad({ onEdge: haptic });
  let room = null;
  let started = false;
  let rematchSeq = 0;
  const stats = { updates: 0, bytes: 0, lastAt: 0, bad: 0 };
  window.__net = () => ({
    ...stats,
    since: stats.lastAt ? Math.round(performance.now() - stats.lastAt) : -1,
    role,
    phase: sim.state.phase,
  });

  /* Predict, but decide nothing. The server is the authority; this copy of
   * the rules exists so the characters move the instant a thumb does. */
  sim.configure({
    authority: false,
    role,
    fx: {
      // Everything the server tells us instead — see apply() below. Locally
      // predicted effects would double up with the real ones.
      shake: () => {}, punch: () => {}, flash: () => {}, killCam: () => {},
      sfx: () => {}, music: () => {}, note: () => {}, banner: () => {},
      count: () => {}, result: () => {}, rematch: () => {}, power: () => {},
      roundStart: () => {},
    },
  });
  // Our own pad drives our own player with no wait at all; the server hears
  // about it too and everyone agrees a few milliseconds later.
  sim.state.pads.p1.connected = true;
  sim.state.pads.p2.connected = true;

  /* ------------------------------------------------------------ the wire --- */

  let hudWas = "";
  function apply(m) {
    stats.updates++;
    stats.lastAt = performance.now();
    stats.bytes = JSON.stringify(m).length;

    if (m.rows) lastRows = m.rows;
    else if (lastRows) m.rows = lastRows;
    if (!m.rows) return;                   // nothing to build a world against

    let view;
    try {
      view = hydrate(m);
    } catch (err) {
      stats.bad++;
      console.warn("[bubu-dudu-smash] unreadable update, skipped", err);
      return;
    }

    // First one: build a world to correct INTO.
    if (!started) {
      started = true;
      $("#duowait")?.classList.add("gone");
      $("#pad")?.classList.remove("hidden");
      sim.startRound(m.sd);
    }
    if (m.sd !== undefined && m.sd !== sim.state.seed) sim.startRound(m.sd);

    // Both players' thumbs, so the OTHER one carries forward between
    // updates instead of stepping thirty times a second. Ours is already in
    // — it went straight into the prediction the moment it was pressed.
    if (m.in) for (const id of ["p1", "p2"]) {
      if (id === role || !m.in[id]) continue;
      const [l, r, h, d] = m.in[id];
      const pad = sim.state.pads[id];
      pad.left = !!l; pad.right = !!r; pad.jumpHeld = !!h; pad.drop = !!d;
    }

    view.score = m.sc;
    view.roundNo = m.rn;
    try {
      sim.applyCorrection(view, null, m.ph);
    } catch (err) {
      // Counted and shouted about once. A correction that throws leaves the
      // client running on prediction alone, which looks like the game working
      // and is not — it is the same picture drifting quietly away from the
      // server's. Silence here cost a whole round of guessing.
      stats.bad++;
      if (stats.bad === 1) console.error("[bubu-dudu-smash] correction threw", err);
      return;
    }

    // The overlay. setBanner and setCount REPLACE their element, which is
    // what restarts the CSS animation — applying an unchanged one thirty
    // times a second would leave the text vibrating.
    if (m.hd) {
      const key = JSON.stringify(m.hd);
      if (key !== hudWas) {
        hudWas = key;
        if (m.hd.banner) HUD.setBanner(m.hd.banner[0], m.hd.banner[1], m.hd.banner[2]);
        else HUD.hideBanner();
        if (m.hd.count != null) HUD.setCount(m.hd.count);
        else HUD.clearCount();
        HUD.setResult(m.hd.result);
        $("#rematch")?.classList.toggle("show", !!m.hd.rematch);
      }
    }

    // One-shot events, heard by both phones at the same moment.
    if (m.notes) for (const [id, label, colour, title, body, glyph] of m.notes)
      HUD.showNote({ id, label }, colour, title, body, glyph);
    if (m.sfx) for (const e of m.sfx) {
      const [name, opts] = Array.isArray(e) ? e : [e];
      try { sfx[name]?.(opts); } catch {}
    }
    if (m.music) for (const [what, arg] of m.music) {
      if (what === "start") startMusic(arg);
      else if (what === "stop") stopMusic();
      else if (what === "duck") duckMusic(arg);
      else if (what === "arm") startAudio();
    }
    // Camera work is per-screen: everyone takes "at least this much".
    if (m.cam) for (const [what, v] of m.cam) {
      if (what === "shake") renderer.shake = Math.max(renderer.shake || 0, v);
      else if (what === "punch") renderer.punch = Math.max(renderer.punch || 0, v);
      else if (what === "flash") renderer.flash = Math.max(renderer.flash || 0, v);
      else if (what === "kill") renderer.kill = v;
    }
  }
  let lastRows = null;

  /* --------------------------------------------------------------- join --- */

  async function join() {
    const client = new Client(SERVER);
    room = await client.joinOrCreate("smash", { role });
    room.onMessage("s", apply);
    room.onMessage("power", (m) => { if (m.id === role) paintShootButton(m.p, m.ammo); });
    room.onLeave(() => { say("lost the room — reconnecting…"); setTimeout(join, 1200); });
    say("in the room — waiting for the round");
  }

  say("connecting…");
  try {
    await join();
  } catch (err) {
    console.error("[bubu-dudu-smash] could not reach the server", err);
    say("could not reach the server");
    return;
  }

  // Our thumbs: into our own prediction immediately, and up to the server.
  let seq = 0;
  setInterval(() => {
    const p = pad.state;
    const packet = { k: "me", n: ++seq, l: p.l, r: p.r, h: p.h, d: p.d, j: p.j, s: p.s };
    sim.applyPacket(role, packet);
    room?.send("input", packet);
  }, 1000 / 40);

  $("#rematch")?.addEventListener("click", () => {
    rematchSeq++;
    $("#rematch").classList.remove("show");
    room?.send("rematch", {});
    haptic();
  });

  /* --------------------------------------------------------------- draw --- */

  let last = performance.now();
  (function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.08, (now - last) / 1000);
    last = now;
    const G = sim.state.G;
    if (!G) return;
    try {
      sim.step(dt);                       // predict forward
      draw(renderer, G, dt);
      paintPanels(
        G.actors,
        { p1: chipsFor(G.actors.find((a) => a.id === "p1"), G, sim.state.pads),
          p2: chipsFor(G.actors.find((a) => a.id === "p2"), G, sim.state.pads) },
        dt
      );
    } catch (err) {
      console.error("[bubu-dudu-smash] frame threw", err);
    }
  })(performance.now());

  armAudio();
  onAudioState((st) => $("#sound")?.classList.toggle("show", st !== "on"));
}

function haptic() {
  const h = $("#haptic");
  if (h) h.checked = !h.checked;
  try { navigator.vibrate?.(8); } catch {}
}
