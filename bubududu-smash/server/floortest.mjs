/* The arena runs out of floor. Who wins?
 *
 * It used to be a TALLY — most hearts, then who was down, then most gems —
 * worked out on the frame the last plank went, while both of them were still
 * standing on it. Charlie: "dapat di nagaautoterminate laro agad pag nawala
 * yung arena, it will let the players fall pa rin tapos dun magdedecide kung
 * sino mas mataas ang weird kasi bigla nalang lalabas banner."
 *
 * So there is nothing to tally now. The floor stops existing, both of them
 * fall, and the last one still in the air has won it — with height as the
 * tie-break if they go inside the same frame. These cases drive that: one
 * held up, one let go, and both let go together.
 */
import * as sim from "../js/sim.js";

const seen = [];
sim.configure({ round: { mode: "smash", mod: null },
  authority: true,
  fx: {
    sfx: () => {}, music: () => {}, note: () => {},
    banner: (t, sub) => seen.push(["banner", t, sub]),
    count: () => {}, result: () => {}, rematch: () => {}, power: () => {},
    shake: () => {}, punch: () => {}, flash: () => {}, killCam: () => {},
    roundStart: () => {},
  },
});

/**
 * @param hold  called every frame AFTER the floor is gone, so a test can keep
 *              one of them up — which is the whole of what is being measured.
 */
function run(name, setup, hold, expect) {
  seen.length = 0;
  sim.state.newSession();
  sim.state.pads.p1.connected = true;
  sim.state.pads.p2.connected = true;
  sim.startMatch();
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
    if (!G.floorGone) { a.y = b.y = 10; a.vy = b.vy = 0; }
    else hold(a, b, G);
    sim.step(1 / 60);
  }
  const won = sim.state.G.winner;
  const line = seen.filter((s) => s[0] === "banner").pop();
  const ok = won === expect;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name.padEnd(36)} winner=${String(won)} (wanted ${String(expect)})  "${line ? line[1] + " / " + line[2] : "-"}"`);
  return ok;
}

const nobody = () => {};
/** Keep one of them in the air, which in this game is the whole contest. */
const keepUp = (id) => (a, b) => {
  const up = id === "p1" ? a : b;
  up.y = 10; up.vy = 0; up.dead = false;
};

let all = true;
all &= run("p1 stays up, p2 drops", nobody, keepUp("p1"), "p1");
all &= run("p2 stays up, p1 drops", nobody, keepUp("p2"), "p2");
/* Hearts no longer decide it: three hearts in the air beats one, and one
 * heart in the air beats three on the way down. That is the point of the
 * change — the arena stopped being a scoreboard. */
all &= run("hearts do not decide it",
  (a, b) => { a.hp = 1; b.hp = 3; }, keepUp("p1"), "p1");
all &= run("...nor do gems",
  (a, b) => { a.coins = 9; b.coins = 0; }, keepUp("p2"), "p2");
/* Both go together: the higher body was the later fall, so it takes it. p1 is
 * put above p2 on every frame of the drop. */
all &= run("both drop — the higher one takes it", nobody,
  (a, b) => { a.y = 40; b.y = 60; }, "p1");

console.log(all ? "\nFLOOR OK" : "\nFLOOR FAIL");
process.exit(all ? 0 : 1);
