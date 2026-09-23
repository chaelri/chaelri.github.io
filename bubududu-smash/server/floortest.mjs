/* The arena runs out of floor. Who wins?
 *
 * Six cases, each set up by hand and then driven until the last plank goes:
 * a clear lead on hearts either way, a tie broken by who is down, a tie
 * broken by gems, and a dead heat. */
import * as sim from "../js/sim.js";

const seen = [];
sim.configure({
  authority: true,
  fx: {
    sfx: () => {}, music: () => {}, note: () => {},
    banner: (t, sub) => seen.push(["banner", t, sub]),
    count: () => {}, result: () => {}, rematch: () => {}, power: () => {},
    shake: () => {}, punch: () => {}, flash: () => {}, killCam: () => {},
    roundStart: () => {},
  },
});

function run(name, setup, expect) {
  seen.length = 0;
  sim.state.newSession();
  sim.state.pads.p1.connected = true;
  sim.state.pads.p2.connected = true;
  sim.startMatch();
  // out of the countdown
  for (let i = 0; i < 400 && sim.state.phase !== "play"; i++) sim.step(1 / 60);
  if (sim.state.phase !== "play") throw new Error(name + ": never reached play");
  const G = sim.state.G;
  const [a, b] = ["p1", "p2"].map((id) => G.actors.find((x) => x.id === id));
  setup(a, b, G);
  // Eat the floor now rather than waiting the minute it takes on its own.
  G.shrink = 0;
  const w = G.grid.rows[0].length;
  for (let i = 0; i < 60 * 30 && sim.state.phase === "play"; i++) {
    G.shrink = Math.min(w, G.shrink + 1.2);   // a column a frame, from both ends
    // keep them where they were put, so a fall does not decide it first
    a.y = b.y = 10; a.vy = b.vy = 0;
    sim.step(1 / 60);
  }
  const won = sim.state.G.winner;
  const line = seen.filter((s) => s[0] === "banner").pop();
  const ok = won === expect;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name.padEnd(34)} winner=${String(won)} (wanted ${String(expect)})  "${line ? line[1] + " / " + line[2] : "-"}"`);
  return ok;
}

let all = true;
all &= run("p1 has more hearts", (a, b) => { a.hp = 3; b.hp = 1; }, "p1");
all &= run("p2 has more hearts", (a, b) => { a.hp = 1; b.hp = 3; }, "p2");
all &= run("level hearts, p2 is down", (a, b) => {
  a.hp = 2; b.hp = 2; b.dead = true; b.respawn = 0.4;
}, "p1");
all &= run("level hearts, p1 is down", (a, b) => {
  a.hp = 2; b.hp = 2; a.dead = true; a.respawn = 0.4;
}, "p2");
all &= run("level on both, p1 has gems", (a, b) => {
  a.hp = 2; b.hp = 2; a.coins = 5; b.coins = 1;
}, "p1");
all &= run("dead heat", (a, b) => { a.hp = 2; b.hp = 2; a.coins = 3; b.coins = 3; }, null);

console.log(all ? "\nFLOOR OK" : "\nFLOOR FAIL");
process.exit(all ? 0 : 1);
