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

  /* Your own thumbs, remembered.
   *
   * Every packet sent is kept until the server says it has seen it. When a
   * snapshot arrives, the player is set to exactly what the server had and
   * then these are re-run on top — so the correction lands where you already
   * are instead of somewhere to be blended towards. This is the whole of what
   * "client-side prediction with server reconciliation" means, and it is the
   * reason a real game can be authoritative and still answer your thumb in
   * the same frame you moved it.
   */
  const history = [];
  let seq = 0;
  let lastAck = -1;                      // ...which is also the tick number
  const HISTORY_MAX = 240;          // four seconds of ticks; the wire is never that far behind

  /* One input per tick, and the tick is the unit of everything.
   *
   * The first version of this replayed against the CLOCK: each remembered
   * input covered the milliseconds until the next one was sent. It cannot be
   * made exact, and the bench said so — the replay came out a steady third of
   * a tile short, which is precisely one network trip of running. The reason
   * is that the client and the server never agree on WHEN an input took
   * effect: it is sent at one moment, arrives at another, and is simulated on
   * whichever of the server's ticks happens to come next.
   *
   * Counting instead of timing removes the question. The client produces
   * exactly one input per 1/60, numbered. The server consumes exactly one per
   * 1/60, in order, and says which number it has reached. Replaying then means
   * "step once per input after that number" — the same count of the same size
   * of step the live prediction already took, so the two cannot drift apart
   * by construction.
   */
  const TICK = 1 / 60;

  /* The OTHER player, as a little archive rather than a guess.
   *
   * Their positions are kept with the moment each arrived, and they are drawn
   * INTERP_MS in the past — between two places the server actually put them,
   * never past the newest one. Every game that looks right does this: you
   * watch the other player a tenth of a second late and perfectly smoothly,
   * rather than live and wrong. Guessing forward by half the round trip is
   * the alternative, and it is at its worst at the one moment you are looking
   * hardest — the turn, the landing, the hit.
   */
  const other = role === "p1" ? "p2" : "p1";
  const tape = [];
  const TAPE_MAX = 24;
  /* Three snapshots' worth at 30 Hz, so one lost packet still has something
   * on both sides of the playhead to read between. */
  const INTERP_MS = 100;

  let room = null;
  let started = false;
  let rematchSeq = 0;
  const stats = { updates: 0, bytes: 0, lastAt: 0, bad: 0, rtt: 0 };
  window.__net = () => ({
    ...stats,
    since: stats.lastAt ? Math.round(performance.now() - stats.lastAt) : -1,
    role,
    phase: sim.state.phase,
  });

  /* Everything a harness needs to compare two clients.
   *
   * _nettest.html runs both of them in iframes on ONE page and diffs this,
   * which is the only way to watch them side by side — two browser tabs
   * cannot both be in the foreground, and a background tab gets no animation
   * frames, so half of what I measured for days was a frozen page. */
  window.__peek = () => {
    const G = sim.state.G;
    if (!G) return null;
    const a = (id) => {
      const x = G.actors.find((q) => q.id === id);
      return x && {
        x: +x.x.toFixed(2), y: +x.y.toFixed(2),
        vx: +x.vx.toFixed(2), vy: +x.vy.toFixed(2),
        face: x.face, walk: +x.walk.toFixed(2),
        hp: x.hp, dead: !!x.dead,
      };
    };
    return {
      role, phase: sim.state.phase, seed: sim.state.seed, t: +G.time.toFixed(2),
      p1: a("p1"), p2: a("p2"),
      powers: G.powers.length, coins: G.coins.length,
      helpers: G.helpers.length, minis: G.minis.length,
      // The three numbers that say whether the netcode is alive: the tick
      // this client has reached, the last one the server admits to having
      // simulated, and how many are still outstanding between them.
      tick: seq, ack: lastAck, held: history.length,
      updates: stats.updates, bad: stats.bad, rtt: Math.round(stats.rtt),
      since: stats.lastAt ? Math.round(performance.now() - stats.lastAt) : -1,
      frames: frames,
    };
  };

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
    if (m.sd !== undefined && m.sd !== sim.state.seed) {
      // A new arena is not somewhere the old positions can be read between.
      tape.length = 0;
      history.length = 0;
      sim.startRound(m.sd);
    }

    view.score = m.sc;
    view.roundNo = m.rn;

    // The other player, filed away to be read back a tenth of a second from
    // now. Nothing draws them from here directly.
    const o = view.actors.find((a) => a.id === other);
    if (o) {
      tape.push({
        at: performance.now(),
        x: o.x, y: o.y, face: o.face, walk: o.walk, squash: o.squash,
        dead: !!o.dead, grounded: !!o.grounded,
      });
      while (tape.length > TAPE_MAX) tape.shift();
    }

    // Everything the server knows that we cannot have: what it made of the
    // thumbs we sent it, so we know which of ours are still outstanding.
    /* No `ak` at all means a server older than this page — during a deploy the
     * two are a version apart for a minute or so. Treating that as "it has
     * seen nothing" would replay the entire six seconds of history on every
     * snapshot and fire the player across the map, so it counts as "it has
     * seen everything" and prediction simply carries on unreconciled. */
    const known = m.ak && m.ak[role] !== undefined;
    const ack = known ? m.ak[role] : seq;
    lastAck = known ? m.ak[role] : -1;
    while (history.length && history[0].n < ack) history.shift();

    try {
      sim.applyServer(view, m.ph, { history: known ? history : null, ack });
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
    // Smoothed, because one slow packet should not move the whole picture.
    room.onMessage("pong", (t) => {
      const sample = performance.now() - t;
      stats.rtt = stats.rtt ? stats.rtt * 0.8 + sample * 0.2 : sample;
    });
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

  /* Ticks are minted in the draw loop (see below, `pump`) so that producing
   * an input, predicting it and drawing the result are one thing.
   *
   * What goes up the wire is a short TAIL of them rather than the newest one,
   * because a lost input is not a lost frame — the server would consume the
   * next number in its place and everything after it would be replayed
   * against the wrong history. Six ticks of redundancy is 24 bytes and covers
   * five consecutive losses. Anything the server already has it ignores. */
  let sawJump = pad.state.j;
  function mintTick() {
    const p = pad.state;
    // `jd` is the extra: the wire carries jump as a COUNTER, which is right
    // for a packet that may be lost, and a replay needs to know which single
    // tick the press belonged to.
    const jd = p.j !== sawJump; sawJump = p.j;
    const h = { n: ++seq, l: p.l, r: p.r, h: p.h, d: p.d, j: p.j, s: p.s, jd };
    history.push(h);
    while (history.length > HISTORY_MAX) history.shift();
    sim.applyPacket(role, h);
    return h;
  }
  setInterval(() => {
    if (!history.length) return;
    room?.send("input", history.slice(-6));
  }, 1000 / 40);

  setInterval(() => room?.send("ping", performance.now()), 1000);
  room?.send("ping", performance.now());

  $("#rematch")?.addEventListener("click", () => {
    rematchSeq++;
    $("#rematch").classList.remove("show");
    room?.send("rematch", {});
    haptic();
  });

  /* --------------------------------------------------------------- draw --- */

  /**
   * Where the other player was a tenth of a second ago.
   *
   * Two entries either side of the playhead and a straight line between them.
   * Both ends are places the server actually put them, so this can be smooth
   * and correct at the same time — which extrapolation cannot, because the
   * moment someone turns round, everything you know about them says they are
   * still going the other way.
   *
   * Running off the end of the tape holds the newest frame rather than
   * inventing a new one. A stalled picture for a few frames is a dropped
   * packet; a picture that keeps walking into a wall is a lie.
   */
  function showOther(G) {
    if (!tape.length) return;
    const a = G.actors.find((q) => q.id === other);
    if (!a) return;
    const at = performance.now() - INTERP_MS;

    let hi = -1;
    for (let i = tape.length - 1; i >= 0; i--) if (tape[i].at <= at) { hi = i; break; }
    if (hi < 0) return void assign(a, tape[0]);
    if (hi >= tape.length - 1) return void assign(a, tape[tape.length - 1]);

    const p = tape[hi], q = tape[hi + 1];
    const span = q.at - p.at;
    const k = span > 0 ? Math.min(1, Math.max(0, (at - p.at) / span)) : 0;
    const per = span > 0 ? 1000 / span : 0;
    assign(a, {
      x: p.x + (q.x - p.x) * k,
      y: p.y + (q.y - p.y) * k,
      // The walk cycle is distance covered, so it interpolates like a
      // position; the facing is a direction and snaps to whichever end of the
      // pair we are nearer.
      walk: p.walk + (q.walk - p.walk) * k,
      squash: p.squash + (q.squash - p.squash) * k,
      face: k < 0.5 ? p.face : q.face,
      grounded: k < 0.5 ? p.grounded : q.grounded,
      /* Velocity is DERIVED from the two frames, never sent.
       *
       * The renderer leans the body, kicks dust and picks the run weighting
       * off it, so a velocity that disagreed with the motion on screen would
       * be a character sprinting on the spot — or sliding along with its legs
       * still. Taken from the same pair the position came from, it cannot. */
      vx: (q.x - p.x) * per,
      vy: (q.y - p.y) * per,
    });
  }
  function assign(a, f) {
    a.x = f.x; a.y = f.y; a.face = f.face; a.walk = f.walk;
    a.squash = f.squash; a.grounded = f.grounded;
    a.vx = f.vx || 0; a.vy = f.vy || 0;
  }

  let frames = 0;
  let acc = 0;
  let last = performance.now();
  (function frame(now) {
    requestAnimationFrame(frame);
    frames++;
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    const G = sim.state.G;
    if (!G) return;
    try {
      /* A whole number of ticks, never a fraction of one.
       *
       * Whatever the screen is doing — 60, 120, a hitch, a phone throttling
       * itself — the rules advance in the same 1/60 pieces the server uses,
       * one input each. The leftover is carried, not rounded away. */
      acc += dt;
      let guard = 0;
      while (acc >= TICK && guard++ < 6) {
        acc -= TICK;
        mintTick();
        sim.step(TICK);                   // predict forward — your body only
      }
      showOther(G);                       // ...and read theirs off the tape
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
