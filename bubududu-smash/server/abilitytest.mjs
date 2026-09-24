/* Does each move actually DO its thing — including while you are moving?
 *
 * Nothing tested this. The soak presses the button thousands of times and
 * only asks that nothing throws; the netcode bench asks whether the two sides
 * agree, and they agreed perfectly about a Dash that did nothing. So Dudu's
 * dash was cancelled on the tick after it fired for anyone holding the
 * direction they were already going — which is everyone, always — and every
 * green test stayed green. Charlie found it by playing: "kapag moving di
 * gumagana".
 *
 * The trap is that each of these works from a standstill. They have to be
 * checked IN MOTION, which is the only way they are ever really used.
 */
import * as sim from "../js/sim.js";
import { ABILITY, SKILL_CHARGES } from "../js/config.js";
import { abilityLook } from "../js/ability.js";

const quiet = {
  sfx: () => {}, music: () => {}, note: () => {}, banner: () => {}, count: () => {},
  result: () => {}, rematch: () => {}, power: () => {}, shake: () => {}, punch: () => {},
  flash: () => {}, killCam: () => {}, roundStart: () => {},
};

function world(char) {
  sim.configure({ round: { mode: "smash", mod: null }, authority: true, fx: quiet });
  sim.state.newSession();
  sim.state.pads.p1.connected = true;
  sim.state.pads.p2.connected = true;
  sim.state.pads.p1.char = char;
  sim.state.pads.p2.char = char === "bubu" ? "yhon" : "bubu";
  sim.startRound(4242);
  for (let i = 0; i < 600 && sim.state.phase !== "play"; i++) sim.step(sim.TICK);
  if (sim.state.phase !== "play") throw new Error("never reached play");
  return sim.state.G;
}

let n = 0;
const push = (p) => sim.applyPacket("p1", { n: ++n, ...p });

/**
 * Run right, optionally jump, then fire — or deliberately do not.
 *
 * Measured as a PAIR, pressing and not pressing from the same setup, and the
 * move is judged on the difference. Absolute thresholds need a number picked
 * by hand for each one, and the first attempt picked a bad one: the pound was
 * failing at "1.38 tiles down" because six ticks of jump had only put him a
 * tile and a half above the floor, so it landed almost at once. It was the
 * test that was wrong. A difference needs no such guess.
 */
function trial(char, { air = 0, press = true, ticks = 22 } = {}) {
  const G = world(char);
  const a = G.actors.find((q) => q.id === "p1");
  a.x = 12; a.y = 13; a.vx = 0; a.vy = 0; a.face = 1;
  a.abilityAt = 0; a.dashFor = 0; a.hops = 0; a.pounding = false;
  // up to speed, holding the direction — which is the whole point
  for (let i = 0; i < 40; i++) { push({ r: true }); sim.step(sim.TICK); }
  const jumps = air ? 1 : 0;
  for (let i = 0; i < air; i++) { push({ r: true, h: true, j: jumps }); sim.step(sim.TICK); }
  const from = { x: a.x, y: a.y };
  push({ r: true, h: !!air, j: jumps, k: press ? 1 : 0 });
  sim.step(sim.TICK);
  const fired = press && a.abilityAt !== 0;
  let dx = 0, rise = 0, drop = 0, fastest = 0;
  for (let i = 0; i < ticks; i++) {
    push({ r: true, h: !!air, j: jumps, k: press ? 1 : 0 });
    sim.step(sim.TICK);
    dx = Math.max(dx, a.x - from.x);
    rise = Math.min(rise, a.y - from.y);
    drop = Math.max(drop, a.y - from.y);
    fastest = Math.max(fastest, a.vy);
  }
  return { fired, dx, rise, drop, fastest };
}

let ok = true;
const say = (pass, line) => { ok &&= pass; console.log(`${pass ? "ok  " : "FAIL"}  ${line}`); };

/* Dudu's Dash, held while running.
 *
 * This is the one that was broken: the clamp in stepActor pinned vx straight
 * back to running speed the moment a direction was held, so the dash was
 * worth nothing at all to anyone actually moving — and it worked perfectly
 * from a standstill, which is why it looked fine. */
{
  const on = trial("dudu", { press: true });
  const off = trial("dudu", { press: false });
  say(on.fired, `dudu   dash fires while running`);
  say(on.dx > off.dx + 2,
    `dudu   dash gains ${(on.dx - off.dx).toFixed(2)} tiles over simply running ` +
    `(${on.dx.toFixed(2)} vs ${off.dx.toFixed(2)})`);
}

/* Bubu's Air Hop, in the air and holding a direction — a hop that only works
 * standing still is no recovery at all. */
{
  const on = trial("bubu", { air: 14, press: true });
  const off = trial("bubu", { air: 14, press: false });
  say(on.fired, `bubu   air hop fires in the air while moving`);
  say(on.rise < off.rise - 1,
    `bubu   air hop lifts ${(off.rise - on.rise).toFixed(2)} tiles higher than falling ` +
    `(${(-on.rise).toFixed(2)} vs ${(-off.rise).toFixed(2)})`);
}

/* Yhon's Ground Pound, fired on the way up with room left to fall.
 *
 * Twenty-two ticks of jump was too many: he had already landed by the time
 * the button went, so both runs measured the same natural fall and the test
 * reported a difference of exactly zero. Which was true, and about the
 * scenario rather than about the move. */
{
  const on = trial("yhon", { air: 14, press: true });
  const off = trial("yhon", { air: 14, press: false });
  say(on.fired, `yhon   pound fires in the air while moving`);
  /* Measured as SPEED, not distance. Both end up on the same floor — the
   * pound's whole worth is getting there before they can leave, so distance
   * compares two identical numbers and says nothing. */
  say(on.fastest > off.fastest + 8,
    `yhon   pound falls at ${on.fastest.toFixed(1)} tiles a second, against ${off.fastest.toFixed(1)} falling`);
}

/* The charge stack: three in hand, spent one after another, filling back up
 * on their own and never past the cap. No lifetime limit — the cooldown just
 * goes into a stack instead of into a yes-or-no. */
{
  const G = world("dudu");
  const a = G.actors.find((q) => q.id === "p1");
  const look = () => abilityLook(a, G.time);
  const max = SKILL_CHARGES;
  say(look().charges === max, `charge  starts holding ${look().charges} of ${max}`);

  let spent = 0;
  for (let k = 1; k <= max + 1; k++) {
    a.x = 14; a.vx = 0; a.dashFor = 0;
    push({ k });
    sim.step(sim.TICK);
    if (a.dashFor > 0) spent++;
    for (let i = 0; i < 4; i++) { push({ k }); sim.step(sim.TICK); }
    a.dashFor = 0;
  }
  say(spent === max, `charge  ${spent} went off back to back, and the next was refused`);
  say(look().charges === 0, `charge  stack is empty after spending them`);

  const cd = ABILITY.dash.cooldownMs / 1000;
  let k = 99;
  for (let i = 0; i < Math.ceil(cd * 60) + 2; i++) { push({ k }); sim.step(sim.TICK); }
  say(look().charges === 1, `charge  one came back after ${cd.toFixed(1)}s, and only one`);

  for (let i = 0; i < 60 * 60; i++) { push({ k }); sim.step(sim.TICK); }
  say(look().charges === max, `charge  a long wait fills to ${look().charges} and stops there`);
}

console.log(`\n${ok ? "ABILITY OK" : "ABILITY FAIL"} — every move has to work IN MOTION, which is the only way anyone uses one`);
process.exit(ok ? 0 : 1);
