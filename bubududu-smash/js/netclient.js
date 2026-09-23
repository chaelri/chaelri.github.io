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
import { preloadCharacters, CHARACTERS, charById } from "./characters.js";
import { createPad, paintShootButton, paintSkillButton } from "./pad.js";
import { markSVG } from "./marks.js";
import { ABILITY } from "./config.js";
import { paintPanels, chipsFor } from "./panel.js";
import { hydrate } from "./netstate.js";
import { createWorldTape } from "./interp.js";
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
  const params = new URLSearchParams(location.search);

  const renderer = createRenderer($("#stage"));
  resize(renderer, innerWidth, innerHeight);
  addEventListener("resize", () => resize(renderer, innerWidth, innerHeight));
  preloadCharacters().then(() => paintCast()).catch(() => {});

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

  /* The REMOTE WORLD, as a little archive rather than a guess.
   *
   * Every moving thing the server owns is kept with the moment it arrived,
   * and all of it is drawn a little way in the past — between two places the
   * server actually put it, never past the newest one.
   *
   * This used to hold the other PLAYER and nothing else, and everything else
   * the server owns — the three mini Bubus, Dudu, the wild fairy, the bullets
   * — was taken outright from each snapshot and then held still until the
   * next one. So they moved at the snapshot rate rather than the screen's,
   * and that is exactly where Charlie could see it: "mas noticeable sa mga
   * element like mini bubu jumping, lumilipad na fairy yhon". They are all on
   * one playhead now, so the whole remote world moves together — which is
   * also the only way Dudu cannot land a stomp on somebody who, on your
   * screen, has not arrived yet.
   *
   * The reading-between itself lives in interp.js, which has no socket and no
   * DOM in it and can therefore be run against a synthetic feed and measured.
   */
  const tape = createWorldTape();

  /* ------------------------------------------------------------- the cast --- */
  /*
   * Who you are holding, and the one move that is yours.
   *
   * The character used to be fixed by seat — Charlie was always the pig and
   * Karla always the panda — and it was cosmetic, so there was nothing to
   * pick. Now each one carries an ability on the fire button and the choice
   * is the whole of it.
   *
   * It is remembered, and the match still starts itself the moment both
   * phones are in: nobody should have to press anything to play, so this
   * cannot become a gate in front of the game. Changing it mid-match takes
   * effect at the next round rather than swapping the body out from under a
   * jump — see startRound, which reads the pad.
   */
  const REMEMBER = "bubududu-smash.char";
  let myChar =
    params.get("char") ||
    localStorage.getItem(REMEMBER) ||
    sim.state.pads[role].char;
  if (!CHARACTERS.some((c) => c.id === myChar)) myChar = sim.state.pads[role].char;
  sim.state.pads[role].char = myChar;

  function pickChar(id) {
    if (!CHARACTERS.some((c) => c.id === id)) return;
    myChar = id;
    try { localStorage.setItem(REMEMBER, id); } catch {}
    sim.state.pads[role].char = id;
    room?.send("char", id);
    paintCast();
  }

  function paintCast() {
    const el = $("#cast");
    if (!el) return;
    if (el.dataset.built !== "1") {
      el.dataset.built = "1";
      el.innerHTML = CHARACTERS.map((c) => {
        const ab = c.ability && ABILITY[c.ability];
        return `<button type="button" data-char="${c.id}" style="--ac:${ab ? ab.colour : "#fff"}">` +
               `<canvas width="96" height="96"></canvas>` +
               `<b>${c.name}</b>` +
               `<span>${markSVG(ab ? ab.mark : "", "mk")}${ab ? ab.name : ""}</span>` +
               `</button>`;
      }).join("");
      for (const b of el.querySelectorAll("button")) {
        b.addEventListener("click", () => pickChar(b.dataset.char));
      }
    }
    for (const b of el.querySelectorAll("button")) {
      b.classList.toggle("on", b.dataset.char === myChar);
      /* Redrawn every time, not once when the cards are built.
       *
       * Two of the three are sprites and the frames arrive over the network,
       * so drawing them once at build time drew nothing at all: Yhon Yhon is
       * vector and turned up, Bubu and Dudu were empty cards. */
      const cv = b.querySelector("canvas");
      const ctx = cv.getContext("2d");
      ctx.clearRect(0, 0, cv.width, cv.height);
      charById(b.dataset.char).draw(ctx, cv.width / 2, cv.height * 0.94,
        cv.width * 0.74, cv.height * 0.8,
        { face: 1, run: 0, air: 0, squash: 0, t: 0, walk: 0, stride: 1 });
    }
  }
  // Painted HERE and not up beside createPad, which is where it was: `myChar`
  // is a `let` declared in this block, so reading it from earlier in the
  // function is a temporal dead zone throw — inside paintCast, after it had
  // already built the cards. Three cards, none of them lit, and connect()
  // quietly abandoned on an unhandled rejection.
  paintCast();

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
      // How far behind the remote world is being drawn, which is no longer a
      // constant — a harness that assumes 100 will call a correct picture
      // drifted, which is exactly what _nettest.html used to do.
      interp: Math.round(tape.interpMs),
      /* One of each thing this client does NOT predict.
       *
       * A harness cannot otherwise tell the difference between a world that
       * MOVES between snapshots and one that only jumps when a snapshot
       * lands, and that difference is the whole of how smooth it looks. For
       * a long time it was the latter and nothing measured it. */
      mini: G.minis[0] ? +G.minis[0].actor.x.toFixed(3) : null,
      helper: G.helpers[0] ? +G.helpers[0].actor.x.toFixed(3) : null,
      wild: G.wildFairy ? +G.wildFairy.x.toFixed(3) : null,
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
      tape.reset();
      history.length = 0;
      sim.startRound(m.sd);
    }

    view.score = m.sc;
    view.roundNo = m.rn;

    // The whole remote world, filed away to be read back a moment from now.
    // Nothing draws any of it from here directly.
    tape.record(view, performance.now());

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
    room = await client.joinOrCreate("smash", { role, char: myChar });
    room.onMessage("s", apply);
    room.onMessage("power", (m) => { if (m.id === role) paintShootButton(m.p, m.ammo); });
    // Whoever changed, including us — the server is the one that decides it
    // took, so the highlight follows its answer and not the tap.
    room.onMessage("cast", (m) => {
      if (!m || !sim.state.pads[m.role]) return;
      sim.state.pads[m.role].char = m.char;
      if (m.role === role) { myChar = m.char; paintCast(); }
    });
    // Smoothed, because one slow packet should not move the whole picture.
    room.onMessage("pong", (t) => {
      const sample = performance.now() - t;
      stats.rtt = stats.rtt ? stats.rtt * 0.8 + sample * 0.2 : sample;
    });
    room.onLeave(() => { say("lost the room — reconnecting…"); setTimeout(join, 1200); });
    say("in the room — waiting for the round");
  }

  /* Keep trying.
   *
   * One attempt was all there was, and on the free tier the FIRST one is the
   * one most likely to fail: when nobody has played for a few minutes there
   * is no container at all, and the join can time out while one starts. A
   * single failure then left the phone sitting on "could not reach the
   * server" for ever with nothing to do but reload — which is indingishable,
   * from the sofa, from the game being broken.
   */
  say("connecting…");
  for (let attempt = 1; ; attempt++) {
    try {
      await join();
      break;
    } catch (err) {
      console.warn("[bubu-dudu-smash] join failed, retrying", err);
      say(attempt < 3 ? "waking the server…" : `still trying… (${attempt})`);
      await new Promise((r) => setTimeout(r, Math.min(4000, 700 * attempt)));
    }
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
  let sawSkill = pad.state.k;
  function mintTick() {
    const p = pad.state;
    // `jd` is the extra: the wire carries jump as a COUNTER, which is right
    // for a packet that may be lost, and a replay needs to know which single
    // tick the press belonged to.
    const jd = p.j !== sawJump; sawJump = p.j;
    // ...and the same for the SKILL button, because the move on it changes
    // where your body is and therefore has to be re-runnable. The power-up
    // button needs no edge: a shot is the server's to spawn.
    const kd = p.k !== sawSkill; sawSkill = p.k;
    const h = { n: ++seq, l: p.l, r: p.r, h: p.h, d: p.d, j: p.j, s: p.s, k: p.k, jd, kd };
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
      tape.apply(G, performance.now(), role);   // ...and read the rest off the tape

      /* The fire button, every frame rather than only when a power-up lands.
       *
       * It carries a cooldown now, and a cooldown that only repaints when
       * something else happens is a cooldown you cannot read. */
      const me = G.actors.find((a) => a.id === role);
      const ab = sim.abilityState(role);
      paintShootButton(me && me.power ? me.power.type : null,
                       me && me.power ? me.power.ammo || 0 : 0);
      paintSkillButton(ab && ab.ability, ab ? ab.cd : 0, !!(ab && ab.ready));
      draw(renderer, G, dt);
      paintPanels(
        G.actors,
        { p1: chipsFor(G.actors.find((a) => a.id === "p1"), G, sim.state.pads),
          p2: chipsFor(G.actors.find((a) => a.id === "p2"), G, sim.state.pads) },
        dt, G.time
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
