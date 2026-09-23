/* Does replaying an input land where living through it did?
 *
 * That is the one contract the whole netcode rests on. Every correction from
 * the server is "here is where you were N inputs ago" followed by re-running
 * those N inputs, so if the replay path and the live path disagree by even a
 * little, every correction moves you — and the more the input DOES, the more
 * it moves you. A jump is an impulse and forgives a lot. An ability sets a
 * velocity and holds it, and velocity integrates.
 *
 * The netcode bench measures this end to end, through a simulated link, with
 * hits and respawns and hit-stop in the way. It says the error is there and
 * cannot say whose fault it is. This runs the two paths against each other on
 * the same body from the same state with nothing else moving, so an answer is
 * either exact or it is a bug, and the bug is in one of two functions.
 *
 *   node server/replaytest.mjs [char]
 */
import * as sim from "../js/sim.js";

const CHARS = process.argv[2] ? [process.argv[2]] : ["bubu", "yhon", "dudu"];
const TICK = sim.TICK;

const quiet = {
  sfx: () => {}, music: () => {}, note: () => {}, banner: () => {}, count: () => {},
  result: () => {}, rematch: () => {}, power: () => {}, shake: () => {}, punch: () => {},
  flash: () => {}, killCam: () => {}, roundStart: () => {},
};

const FIELDS = ["x", "y", "vx", "vy", "face", "walk", "squash", "t", "grounded",
                "coyote", "buffer", "jumpHeld", "launchFor",
                "abilityAt", "hops", "dashUntil", "dashFace", "pounding", "lockUntil"];
const grab = (a) => Object.fromEntries(FIELDS.map((k) => [k, a[k]]));
const put = (a, o) => { for (const k of FIELDS) a[k] = o[k]; };

let allOk = true;

for (const char of CHARS) {
  // A client, because that is the side that replays: authority off, and only
  // this body moves.
  sim.configure({ authority: false, role: "p1", fx: quiet });
  sim.state.newSession();
  sim.state.pads.p1.connected = true;
  sim.state.pads.p2.connected = true;
  sim.state.pads.p1.char = char;
  sim.state.pads.p2.char = char === "bubu" ? "yhon" : "bubu";
  sim.startRound(4242);
  // Out of the countdown, or simulate() never runs and the test passes on a
  // body that did not move at all.
  for (let i = 0; i < 600 && sim.state.phase !== "play"; i++) sim.step(TICK);
  if (sim.state.phase !== "play") throw new Error("never reached play");

  const G = sim.state.G;
  const a = G.actors.find((q) => q.id === "p1");

  /* A stream that presses everything, including the fire button, in the
   * pattern most likely to catch an ordering mistake: a press while airborne,
   * a press on the ground, a press during the cooldown, a press while turning
   * round. */
  let rnd = 7;
  const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const inputs = [];
  let l = false, r = true, j = 0, k = 0, sawJ = 0, sawK = 0;
  for (let n = 1; n <= 120; n++) {
    if (rand() < 0.08) { r = !r; l = false; }
    if (rand() < 0.08) { l = !l; r = false; }
    if (rand() < 0.06) j++;
    if (rand() < 0.10) k++;
    inputs.push({ n, l, r, h: rand() < 0.5, d: false, j, k,
                  jd: j !== sawJ, kd: k !== sawK });
    sawJ = j; sawK = k;
  }

  const start = grab(a);
  const startTime = G.time;

  // --- lived through ---
  for (const h of inputs) {
    sim.applyPacket("p1", h);
    sim.step(TICK);
  }
  const lived = grab(a);
  const livedTime = G.time;

  // --- replayed ---
  put(a, start);
  G.time = startTime;
  sim.replayLocal(inputs, 0);
  const replayed = grab(a);

  const diffs = FIELDS
    .map((k) => [k, lived[k], replayed[k]])
    .filter(([, x, y]) => (typeof x === "number" ? Math.abs(x - y) > 1e-9 : x !== y));

  const ok = diffs.length === 0;
  allOk &&= ok;
  console.log(`${ok ? "ok  " : "FAIL"}  ${char.padEnd(6)} ` +
    (ok ? `120 inputs replayed exactly (x ${lived.x.toFixed(4)}, y ${lived.y.toFixed(4)})`
        : diffs.map(([k, x, y]) =>
            `${k}: lived ${typeof x === "number" ? x.toFixed(4) : x} vs replayed ${typeof y === "number" ? y.toFixed(4) : y}`).join("\n           ")));
  G.time = livedTime;
}

console.log(`\n${allOk ? "REPLAY OK" : "REPLAY FAIL"} — living through an input and re-running it must land in the same place`);
process.exit(allOk ? 0 : 1);
