/* The mode wheel, the modifier card, and grab-and-throw.
 *
 * Runs the real rules (js/sim.js) with the wheel pinned to each mode and each
 * modifier in turn, and checks that every one of them does the thing it says
 * on the round card and can actually end a round.
 *
 *   node server/roundstest.mjs
 */
import * as sim from "../js/sim.js";
import { ROUND, GRAB, ROUND_MODES, ROUND_MODS, FEEL } from "../js/config.js";

const quiet = {
  sfx: () => {}, music: () => {}, note: () => {}, banner: () => {}, count: () => {},
  result: () => {}, rematch: () => {}, power: () => {}, shake: () => {}, punch: () => {},
  flash: () => {}, killCam: () => {}, roundStart: () => {},
};
let banners = [];

function world(mode, mod = null, seed = 4242) {
  sim.configure({ authority: true, fx: { ...quiet, banner: (t, s) => banners.push({ t, s }) }, round: { mode, mod } });
  sim.state.newSession();
  sim.state.pads.p1.connected = true;
  sim.state.pads.p2.connected = true;
  sim.state.pads.p1.char = "bubu";
  sim.state.pads.p2.char = "yhon";
  sim.startRound(seed);
  for (let i = 0; i < 600 && sim.state.phase !== "play"; i++) sim.step(sim.TICK);
  if (sim.state.phase !== "play") throw new Error("never reached play");
  return sim.state.G;
}
const run = (sec, each = () => {}) => {
  for (let i = 0, n = Math.round(sec / sim.TICK); i < n && sim.state.phase === "play"; i++) {
    each();
    sim.step(sim.TICK);
  }
};
const P = (G, id) => G.actors.find((a) => a.id === id);
/** Park both players on the floor, far apart, so nothing touches by accident. */
function apart(G) {
  const [a, b] = G.actors;
  const floorY = 13;
  const mid = G.level.w / 2;
  for (const [q, x] of [[a, mid - 5], [b, mid + 5]]) {
    q.x = x; q.y = floorY; q.vx = 0; q.vy = 0; q.grounded = true;
  }
}

let bad = 0;
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "ok  " : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
  if (!cond) bad++;
};

/* ---- the wheel -------------------------------------------------------- */
{
  sim.configure({ round: { mode: undefined, mod: undefined } });
  const seen = new Set(), mods = new Set();
  let repeats = 0, prev = null;
  sim.configure({ authority: true, fx: quiet });
  sim.state.newSession();
  for (let r = 0; r < 60; r++) {
    sim.startRound(1000 + r * 7);
    const rd = sim.state.G.rd;
    seen.add(rd.mode);
    if (rd.mod) mods.add(rd.mod);
    if (prev && prev === rd.mode) repeats++;
    prev = rd.mode;
  }
  ok("wheel every mode turns up", seen.size === ROUND_MODES.length, [...seen].join(","));
  ok("wheel every modifier turns up", mods.size === ROUND_MODS.length, `${mods.size} of ${ROUND_MODS.length}`);
  ok("wheel never the same mode twice running", repeats === 0, `repeats ${repeats}`);
}

/* ---- the round card --------------------------------------------------- */
{
  banners = [];
  world("potato", "ice");
  const card = banners.find((b) => b.t && /Round/.test(b.t));
  ok("card  names the mode and the modifier",
     card && /Hot Potato/.test(card.t) && /Ice Floor/.test(card.s), JSON.stringify(card));
}

/* ---- hearts only in Smash --------------------------------------------- */
function stomp(G, by, victim) {
  const hp = victim.hp, vx = victim.vx;
  for (let i = 0; i < 40; i++) {
    by.x = victim.x; by.y = victim.y - victim.h - 0.3; by.vy = 9;
    sim.step(sim.TICK);
    if (victim.hp !== hp || Math.abs(victim.vx - vx) > 3) break;
  }
}
{
  const G = world("hill");
  apart(G);
  const a = P(G, "p1"), o = P(G, "p2");
  stomp(G, o, a);
  ok("hearts a stomp outside Smash costs no heart", a.hp === FEEL.hp, `hp ${a.hp}`);
  ok("hearts ...it knocks you back instead", Math.abs(a.vx) > 3 || a.launchFor > 0, `vx ${a.vx.toFixed(1)}`);
  const G2 = world("smash");
  apart(G2);
  stomp(G2, P(G2, "p2"), P(G2, "p1"));
  ok("hearts in Smash a stomp still costs one", P(G2, "p1").hp === FEEL.hp - 1, `hp ${P(G2, "p1").hp}`);
}

/* ---- King of the Hill ------------------------------------------------- */
{
  const G = world("hill");
  run(0.2);
  const z = G.rd.zone;
  ok("hill  a crown is placed", !!z, JSON.stringify(z));
  const a = P(G, "p1"), o = P(G, "p2");
  o.x = 2; o.y = 13;
  run(ROUND.hillGoal + 1, () => {
    const zz = G.rd.zone;
    a.x = zz.x; a.y = zz.row; a.vx = 0; a.vy = 0;
    o.x = zz.x + 8 < G.level.w - 4 ? zz.x + 8 : zz.x - 8; o.vx = 0;
  });
  ok("hill  holding it alone wins", sim.state.phase !== "play" && G.winner === "p1",
     `phase ${sim.state.phase} winner ${G.winner} meter ${G.rd.meter.p1.toFixed(1)}`);
}

{
  // Standing still where you spawned must never be enough.
  let free = 0;
  for (let seed = 1; seed <= 15; seed++) {
    const G = world("hill", null, seed * 31);
    run(12, () => { for (const q of G.actors) { q.vx = 0; } });
    if (G.winner) free++;
  }
  ok("hill  the crown never lands under an idle player", free === 0, `free wins ${free} of 15`);
}

/* ---- Hot Potato ------------------------------------------------------- */
{
  const G = world("potato");
  apart(G);
  const h0 = G.rd.holder;
  const holder = P(G, h0), them = P(G, h0 === "p1" ? "p2" : "p1");
  holder.x = them.x - 0.5;
  sim.step(sim.TICK);
  ok("potato touching passes the bomb", G.rd.holder === them.id, `holder ${G.rd.holder}`);
  holder.x = them.x - 0.5;
  sim.step(sim.TICK);
  ok("potato ...and it cannot bounce straight back", G.rd.holder === them.id);
  apart(G);
  run(ROUND.potatoFuse[1] + 3);
  ok("potato the fuse goes off and ends the round", sim.state.phase !== "play" || G.finishAt > 0,
     `phase ${sim.state.phase}`);
  ok("potato ...the one holding it loses", G.winner === holder.id || (G.finishWith && G.finishWith.winnerId === holder.id),
     `winner ${G.winner || (G.finishWith && G.finishWith.winnerId)} holder was ${them.id}`);
}

/* ---- Tag -------------------------------------------------------------- */
{
  const G = world("tag");
  apart(G);
  const it = G.rd.it;
  run(ROUND.tagLose + 1, () => apart(G));
  ok("tag   IT for too long loses", sim.state.phase !== "play" && G.winner && G.winner !== it,
     `winner ${G.winner} it ${it} time ${G.rd.itTime[it].toFixed(1)}`);
}

/* ---- Coin Rush -------------------------------------------------------- */
{
  const G = world("rush");
  apart(G);
  const a = P(G, "p1");
  let got = 0;
  run(ROUND.rushSecs + 1, () => {
    // p1 hoovers: stand on every coin in turn.
    const c = G.coins.find((q) => !q.taken);
    if (c) { a.x = c.x; a.y = c.y + 0.5; a.vx = 0; a.vy = 0; }
    got = G.rd.bank.p1;
  });
  ok("rush  coins go in the bank", got > 5, `bank ${got}`);
  ok("rush  most coins at the whistle wins", sim.state.phase !== "play" && G.winner === "p1",
     `phase ${sim.state.phase} winner ${G.winner} bank ${JSON.stringify(G.rd.bank)}`);
}

/* ---- modifiers -------------------------------------------------------- */
{
  const G = world("smash", "lowgrav");
  apart(G);
  const a = P(G, "p1");
  run(0.1);
  ok("mod   Low Gravity lightens the body", a.gravMul < 1, `gravMul ${a.gravMul}`);
  a.vy = -15;
  a.grounded = false;
  const y0 = a.y;
  let top = y0;
  run(1.2, () => { top = Math.min(top, a.y); });
  const G2 = world("smash", null);
  apart(G2);
  const b = P(G2, "p1");
  b.vy = -15; b.grounded = false;
  const y1 = b.y;
  let top2 = y1;
  run(1.2, () => { top2 = Math.min(top2, b.y); });
  ok("mod   ...and you go higher", y0 - top > (y1 - top2) * 1.4, `${(y0 - top).toFixed(1)} vs ${(y1 - top2).toFixed(1)}`);
}
{
  const G = world("smash", "ice");
  apart(G);
  const a = P(G, "p1");
  a.vx = 9; a.grounded = true;
  run(0.5);
  ok("mod   Ice: you keep sliding", Math.abs(a.vx) > 3, `vx after 0.5s ${a.vx.toFixed(1)}`);
}
{
  const G = world("smash", "bouncy");
  apart(G);
  const a = P(G, "p1");
  a.y = 6; a.vy = 12; a.grounded = false;
  let bounced = false;
  run(1.5, () => { if (a.vy < -6) bounced = true; });
  ok("mod   Bouncy: a landing throws you back up", bounced);
}
{
  const G = world("smash", "turbo");
  run(0.05);
  ok("mod   Turbo: faster", P(G, "p1").modSpeed > 1.2, `modSpeed ${P(G, "p1").modSpeed}`);
}
{
  const G = world("smash", "swap");
  apart(G);
  const ax = P(G, "p1").x;
  run(ROUND.swapEvery + 0.3, () => { for (const q of G.actors) { q.vx = 0; } });
  ok("mod   Swap: you trade places", Math.abs(P(G, "p1").x - ax) > 5, `p1 x ${ax.toFixed(1)} -> ${P(G, "p1").x.toFixed(1)}`);
}
{
  const G = world("smash", "lava");
  const rows0 = G.grid.rows.join("").replace(/[^#=]/g, "").length;
  run(25, () => apart(G));
  const rows1 = G.grid.rows.join("").replace(/[^#=]/g, "").length;
  ok("mod   Lava: it rises and takes the floor", G.rd.lava < 13 && rows1 < rows0,
     `lava ${G.rd.lava.toFixed(2)}, solid ${rows0} -> ${rows1}`);
}
{
  const G = world("smash", "bazooka");
  run(0.1);
  ok("mod   Bazooka Party: both armed", G.actors.every((a) => a.power && a.power.type === "bazuka"),
     G.actors.map((a) => a.power && a.power.type).join(","));
}
{
  const G = world("smash", "king");
  run(0.1);
  ok("mod   Royal Visit: the King is here", !!G.king);
}
{
  const G = world("smash", "guns");
  const types = new Set();
  run(20, () => { apart(G); for (const q of G.powers) types.add(q.type); });
  ok("mod   Gunfight: only guns and swords", types.size > 0 && [...types].every((t) => t === "baril" || t === "espada"),
     [...types].join(","));
}

/* ---- grab and throw --------------------------------------------------- */
{
  const G = world("smash");
  apart(G);
  const a = P(G, "p1"), o = P(G, "p2");
  a.power = null;
  o.x = a.x + 0.9; o.y = a.y;
  sim.applyPacket("p1", { seq: 1, s: 1 });
  sim.step(sim.TICK);
  sim.step(sim.TICK);
  ok("grab  the empty power button grabs", G.rd.grab && G.rd.grab.victim === "p2", JSON.stringify(G.rd.grab));
  ok("grab  ...and holds them over your head", o.y < a.y - a.h + 0.1, `o.y ${o.y.toFixed(2)} a.y ${a.y.toFixed(2)}`);
  run(GRAB.holdMs / 1000 + 0.1);
  ok("grab  ...and throws them when time runs out", !G.rd.grab && Math.abs(o.vx) > 5, `vx ${o.vx.toFixed(1)}`);
  ok("grab  a throw costs no heart", o.hp === FEEL.hp, `hp ${o.hp}`);

  // Holding a gun: the button fires, it does not grab.
  const G2 = world("smash");
  apart(G2);
  const b = P(G2, "p1"), c = P(G2, "p2");
  b.power = { type: "baril", ammo: 6, until: Infinity };
  c.x = b.x + 0.9;
  sim.applyPacket("p1", { seq: 1, s: 1 });
  sim.step(sim.TICK);
  ok("grab  with a gun the button still shoots", !G2.rd.grab && b.power.ammo === 5, `ammo ${b.power.ammo}`);
}

console.log(bad ? `\nROUNDS FAIL — ${bad} check(s)` : "\nROUNDS OK — five modes, ten modifiers and a grab, each doing what the card says");
process.exit(bad ? 1 : 0);
