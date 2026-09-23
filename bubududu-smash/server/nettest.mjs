// The netcode itself, on a bench.
//
// A server instance of the rules and a client instance of the SAME file, with
// a simulated link between them — latency, jitter and packet loss you choose —
// and then the one question that matters asked properly:
//
//   how far is what you are looking at from what is actually true?
//
// Two separate copies of a module that is full of module-level state is the
// only hard part; Node's ESM loader keys its cache on the whole specifier, so
// `sim.js?server` and `sim.js?client` are genuinely two instances.
//
// Measured for both players, because they are different problems:
//
//   YOUR player is predicted and reconciled. The right question is whether
//   the reconciliation converges — your own body should sit where the server
//   has it, and correcting should not move the picture.
//
//   THE OTHER player is interpolated from the snapshots, deliberately a fixed
//   delay behind. So the right question is not "is he where he is" — he is
//   not, on purpose — but "is he where he WAS, INTERP_MS ago", which is
//   exactly what you are being shown and is the thing that has to be smooth.
//
//   node server/nettest.mjs [seconds] [latencyMs] [lossPct]

import { snapshot, hydrate } from "../js/netstate.js";

const SECONDS = Number(process.argv[2] || 60);
const LATENCY = Number(process.argv[3] || 40);   // one way
const LOSS    = Number(process.argv[4] || 0);    // per cent of snapshots dropped
const JITTER  = 8;

const server = await import("../js/sim.js?server");
const client = await import("../js/sim.js?client");

const ROLE = "p1";                 // the client we are being
const OTHER = "p2";
const STEP = 1 / 60;          // one tick, both sides
const SEND_HZ = 30;
const SEND_INPUT_HZ = 40;     // how often the tail of ticks goes up the wire
const BUFFER_MIN = 2;
const BUFFER_MAX = 8;
const INTERP_MS = 100;
const HISTORY_MAX = 240;

const noop = () => {};
const FX = {
  sfx: noop, music: noop, note: noop, banner: noop, count: noop, result: noop,
  rematch: noop, power: noop, shake: noop, punch: noop, flash: noop,
  killCam: noop, roundStart: noop,
};
server.configure({ authority: true, fx: FX });
client.configure({ authority: false, role: ROLE, fx: FX });
server.state.pads.p1.connected = true;
server.state.pads.p2.connected = true;
client.state.pads.p1.connected = true;
client.state.pads.p2.connected = true;
server.startMatch();

/* ------------------------------------------------------------- the link --- */

let clock = 0;                                   // simulated milliseconds
let rnd = 99991;
const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const hop = () => LATENCY + (rand() - 0.5) * 2 * JITTER;

const toServer = [];
const toClient = [];
const post = (q, payload) => q.push({ at: clock + hop(), payload });
const drain = (q, fn) => {
  while (q.length && q[0].at <= clock) fn(q.shift().payload);
};

/* ---------------------------------------------------------- the thumbs ---- */

let seq = 0, sawJump = 0, jumps = 0;
const history = [];
let heldL = false, heldR = false, heldJ = false;
/** One tick of thumbs: remembered, predicted. Sending is separate. */
function thumbs() {
  // A person: holds a direction for the best part of a second, jumps now and
  // then. Strobing the buttons every frame is the one input pattern no netcode
  // is designed for and no player produces.
  if (rand() < 0.02) { heldR = !heldR; heldL = false; }
  if (rand() < 0.02) { heldL = !heldL; heldR = false; }
  if (rand() < 0.02) { jumps++; }
  if (rand() < 0.05) heldJ = rand() < 0.5;
  const jd = jumps !== sawJump; sawJump = jumps;
  const h = { n: ++seq, l: heldL, r: heldR, h: heldJ, d: false, j: jumps, s: 0, jd };
  history.push(h);
  while (history.length > HISTORY_MAX) history.shift();
  client.applyPacket(ROLE, h);
}

/* The other player, driven into the server's queue the same way — the client
   never sees these buttons, which is the point: it only ever sees where he
   ENDED UP. */
let oL = false, oR = false, oJumps = 0, oSeq = 0;
function theirThumbs() {
  if (rand() < 0.02) { oR = !oR; oL = false; }
  if (rand() < 0.02) { oL = !oL; oR = false; }
  if (rand() < 0.02) oJumps++;
  queued[OTHER].push({ n: ++oSeq, l: oL, r: oR, h: rand() < 0.5, d: false, j: oJumps, s: 0 });
}

/* The server's input queues, and the one-per-tick rule that makes a replay
   reproducible. Mirrors feed() in server/index.mjs. */
const queued = { p1: [], p2: [] };
const headTick = { p1: 0, p2: 0 };
function feed(role) {
  const q = queued[role];
  if (!q.length) return;
  if (server.state.phase !== "play") { while (q.length) server.applyPacket(role, q.shift()); return; }
  if (q.length <= BUFFER_MIN) return;
  const take = q.length > BUFFER_MAX ? 2 : 1;
  for (let i = 0; i < take && q.length; i++) server.applyPacket(role, q.shift());
}

/* ------------------------------------------------------------ the tape ---- */

const tape = [];
const truth = [];                                 // where the server really had OTHER
let started = false, lastSeed = null;

function onSnapshot(m) {
  if (!m.rows) return;
  let view;
  try { view = hydrate(m); } catch { bad++; return; }
  if (!started) { started = true; client.startRound(m.sd); lastSeed = m.sd; }
  if (m.sd !== lastSeed) { lastSeed = m.sd; tape.length = 0; history.length = 0; client.startRound(m.sd); }

  const o = view.actors.find((a) => a.id === OTHER);
  if (o) { tape.push({ at: clock, x: o.x, y: o.y }); while (tape.length > 24) tape.shift(); }

  const ack = (m.ak && m.ak[ROLE]) || 0;
  while (history.length && history[0].n < ack) history.shift();
  view.score = m.sc; view.roundNo = m.rn;
  client.applyServer(view, m.ph, { history, ack });
  corrections++;
}

/** netclient's showOther(), on the bench. */
function otherNow() {
  if (!tape.length) return null;
  const at = clock - INTERP_MS;
  let hi = -1;
  for (let i = tape.length - 1; i >= 0; i--) if (tape[i].at <= at) { hi = i; break; }
  if (hi < 0) return tape[0];
  if (hi >= tape.length - 1) return tape[tape.length - 1];
  const p = tape[hi], q = tape[hi + 1];
  const k = Math.min(1, Math.max(0, (at - p.at) / (q.at - p.at || 1)));
  return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k };
}

/* --------------------------------------------------------------- the run -- */

let corrections = 0, bad = 0, frames = 0;
const predTick = new Map();
const predIn = new Map();
const calmErr = [];
const big = [];
let noisy = 0;
const mineErr = [], theirErr = [], theirJerk = [];
let prevOther = null, prevOther2 = null;
let lastInput = 0, lastSend = 0;

while (clock < SECONDS * 1000) {
  clock += STEP * 1000;
  frames++;

  // One tick, one input, on both sides.
  thumbs();
  theirThumbs();
  client.step(STEP);
  if (clock - lastInput >= 1000 / SEND_INPUT_HZ) {
    lastInput = clock;
    post(toServer, JSON.parse(JSON.stringify(history.slice(-6))));
  }

  drain(toServer, (tail) => {
    for (const p of tail) {
      if (p.n <= headTick[ROLE]) continue;
      headTick[ROLE] = p.n;
      queued[ROLE].push(p);
    }
  });
  feed("p1");
  feed("p2");
  server.step(STEP);

  if (clock - lastSend >= 1000 / SEND_HZ) {
    lastSend = clock;
    const G = server.state.G;
    if (G && rand() * 100 >= LOSS) {
      const snap = snapshot(G, {
        ph: server.state.phase, sc: server.state.score, rn: server.state.roundNo,
        sd: server.state.seed, wn: G.winner || 0, ak: server.state.acks,
      });
      post(toClient, JSON.parse(JSON.stringify(snap)));
    }
    if (G) {
      const t = G.actors.find((a) => a.id === OTHER);
      if (t) { truth.push({ at: clock, x: t.x, y: t.y }); while (truth.length > 2000) truth.shift(); }
    }
  }

  drain(toClient, onSnapshot);

  /* ---- measure
   *
   * Comparing the two copies of your own body at the same INSTANT is the
   * wrong question and answers it with the latency: the client has simulated
   * ticks the server has not received yet, and being ahead is the entire
   * point of predicting. The question that means something is whether the
   * prediction was RIGHT — so each side's position is filed against the tick
   * number that produced it, and the two are compared tick for tick.
   */
  const S = server.state.G, C = client.state.G;
  if (!S || !C || server.state.phase !== "play" || client.state.phase !== "play") continue;
  const sm = S.actors.find((a) => a.id === ROLE), cm = C.actors.find((a) => a.id === ROLE);
  if (cm && !cm.dead) { predTick.set(seq, { x: cm.x, y: cm.y, vx: cm.vx }); predIn.set(seq, history[history.length-1]); }
  if (sm && !sm.dead) {
    const at = server.state.acks[ROLE];
    const p = predTick.get(at);
    if (p && at > 0) {
      const e = Math.hypot(sm.x - p.x, sm.y - p.y);
      mineErr.push(e);
      // Quiet play only: no hit, no respawn, no hit-stop anywhere near. What
      // is left there is the netcode's own error rather than the server
      // telling us something we could not have known.
      const settled = !sm.invulnUntil || S.time > sm.invulnUntil;
      if (settled && !S.freeze && !S.slow && !sm.launchFor) calmErr.push(e);
      else noisy++;
      if (e > 0.5) {
        const hh = history.find((q) => q.n === at) || predIn.get(at) || {};
        big.push({ tick: at, e: +e.toFixed(2),
          cin: `${hh.l?"L":"-"}${hh.r?"R":"-"}${hh.h?"H":"-"}${hh.jd?"!":"-"}`,
          spad: `${server.state.pads[ROLE].left?"L":"-"}${server.state.pads[ROLE].right?"R":"-"}${server.state.pads[ROLE].jumpHeld?"H":"-"}`,
          sx: +sm.x.toFixed(2), cx: +p.x.toFixed(2),
          svx: +sm.vx.toFixed(2), cvx: +(p.vx||0).toFixed(2),
          sy: +sm.y.toFixed(2), cy: +p.y.toFixed(2), rev: +(sm.reversedUntil||0).toFixed(1), now: +S.time.toFixed(1),
          pw: sm.power && sm.power.type });
      }
      predTick.delete(at);
    }
  }
  for (const k of predTick.keys()) if (k < server.state.acks[ROLE] - 400) { predTick.delete(k); predIn.delete(k); }

  const drawn = otherNow();
  if (drawn) {
    /* Where the server actually had him at the moment this picture is OF.
     *
     * Not `clock - INTERP_MS`: the snapshot the tape is built from left the
     * server a trip ago, so what is drawn is the truth from INTERP_MS *plus*
     * one latency back. That delay is not error and cannot be removed —
     * nothing can arrive faster than the wire — it is the same delay Source
     * and everything descended from it carries, and the only question worth
     * asking is whether the curve drawn through it is the right curve.
     */
    const want = clock - INTERP_MS - LATENCY;
    let hi = -1;
    for (let i = truth.length - 1; i >= 0; i--) if (truth[i].at <= want) { hi = i; break; }
    if (hi >= 0 && hi < truth.length - 1) {
      const p = truth[hi], q = truth[hi + 1];
      const k = (want - p.at) / (q.at - p.at || 1);
      const ex = p.x + (q.x - p.x) * k, ey = p.y + (q.y - p.y) * k;
      if (Math.hypot(q.x - p.x, q.y - p.y) < 3) theirErr.push(Math.hypot(drawn.x - ex, drawn.y - ey));
    }
    // A respawn moves them across the map in one frame, which is not a jerk in
    // the drawing, it is a different place to be.
    if (prevOther2 && Math.abs(drawn.x - prevOther.x) < 1.5)
      theirJerk.push(Math.abs((drawn.x - prevOther.x) - (prevOther.x - prevOther2.x)));
    prevOther2 = prevOther; prevOther = drawn;
  }
}

const q = (a, p) => { const d = a.slice().sort((x, y) => x - y); return d.length ? +d[Math.min(d.length - 1, Math.floor(d.length * p))].toFixed(3) : null; };
const row = (name, a) => `  ${name.padEnd(22)} median ${String(q(a,.5)).padStart(7)}   p90 ${String(q(a,.9)).padStart(7)}   p99 ${String(q(a,.99)).padStart(7)}   max ${String(q(a,1)).padStart(7)}`;

console.log(`\nlink        ${LATENCY}ms +-${JITTER} one way, ${LOSS}% snapshot loss`);
console.log(`ran         ${SECONDS}s, ${frames} frames, ${corrections} snapshots applied, ${bad} unreadable`);
console.log(`rounds      server ${server.state.roundNo} / client ${client.state.roundNo}   score ${JSON.stringify(server.state.score)}`);
console.log(`\nerror, in tiles (a character is about one):`);
console.log(row("your own body, per tick", mineErr));
console.log(row("your own body, calm", calmErr));
console.log(row("the other player", theirErr));
console.log(`  ${"...drawn".padEnd(22)} ${INTERP_MS + LATENCY}ms behind live (${INTERP_MS} chosen + ${LATENCY} on the wire)`);
console.log(row("their frame-to-frame", theirJerk));
console.log(`\nover half a tile: ${big.length} of ${mineErr.length} ticks (${noisy} were near a hit or a respawn)`);
console.log(big.slice(0, 10).map((b) => "  " + JSON.stringify(b)).join("\n"));
const ok = q(calmErr, .99) !== null && q(calmErr, .99) < 0.5 && q(theirErr, .99) < 0.5 && q(theirJerk, .99) < 0.4;
console.log(`\n${ok ? "NETTEST OK" : "NETTEST FAIL"} — own body p99 ${q(calmErr,.99)} (< 0.5), other p99 ${q(theirErr,.99)} (< 0.5), jerk p99 ${q(theirJerk,.99)} (< 0.4)`);
if (!ok) process.exitCode = 1;
