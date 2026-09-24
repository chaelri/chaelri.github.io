// Headless soak test for the rules.
//
// The server runs js/sim.js with nothing around it, so anything the browser
// used to provide by accident — a sound table, a DOM node, a global — is a
// crash that takes the whole match down with it and freezes both phones.
// That is exactly how `sfx is not defined` got out: it only fires when
// somebody picks a power-up up, which no amount of standing still reaches.
//
// This plays the game instead. Random thumbs, every power-up forced in turn,
// hundreds of simulated minutes, and every snapshot packed and unpacked the
// way the wire does it. Any throw is printed with the seed that produced it.
//
//   node server/soak.mjs [minutes]

import * as sim from "../js/sim.js";
import { snapshot, hydrate } from "../js/netstate.js";
import { POWERUPS, POWERUPS_EXTRA } from "../js/config.js";

const MINUTES = Number(process.argv[2] || 20);
const DT = 1 / 60;
const STEPS = Math.round((MINUTES * 60) / DT);

let calls = 0;
const seen = new Set();
const tally = (k) => { calls++; seen.add(k); };

sim.configure({ round: { mode: "smash", mod: null },
  authority: true,
  fx: {
    sfx: (n) => tally("sfx:" + n),
    music: (n) => tally("music:" + n),
    note: (a, c, t) => tally("note:" + t),
    banner: (t) => tally("banner:" + t),
    count: () => tally("count"),
    result: (k) => tally("result:" + k),
    rematch: () => tally("rematch"),
    power: (a) => tally("power:" + (a.power ? a.power.type : "none")),
    shake: () => tally("shake"),
    punch: () => tally("punch"),
    flash: () => tally("flash"),
    killCam: () => tally("killCam"),
    roundStart: () => tally("roundStart"),
  },
});

sim.state.pads.p1.connected = true;
sim.state.pads.p2.connected = true;

/* All three characters, and therefore all three abilities.
 *
 * The defaults are Yhon and Bubu, so Dudu's Dash — and everything the wire,
 * the replay and the renderer do with it — would never once be run by a test
 * that left them alone. Rotated every match, both seats. */
const CAST = ["yhon", "bubu", "dudu"];
let castAt = 0;
function nextCast() {
  sim.state.pads.p1.char = CAST[castAt % CAST.length];
  sim.state.pads.p2.char = CAST[(castAt + 1) % CAST.length];
  castAt++;
}
nextCast();
sim.startMatch();

// Every use of every ability, counted by watching the one field each of them
// writes. A test that fires the button and never checks anything happened is
// a test that passes on an ability that silently does nothing.
const usedBy = {};
const lastUse = { p1: 0, p2: 0 };
function countAbilities() {
  const G = sim.state.G;
  if (!G) return;
  for (const a of G.actors) {
    if (!a.abilityAt || a.abilityAt === lastUse[a.id]) continue;
    lastUse[a.id] = a.abilityAt;
    usedBy[a.char] = (usedBy[a.char] || 0) + 1;
  }
}

// A cheap deterministic stream for the fake thumbs, kept OUT of the game's
// own rng so driving the test cannot change what the game decides.
let s = 12345;
const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const held = { p1: {}, p2: {} };
let seq = 0;
function thumbs(role) {
  const h = (held[role] ||= {});
  if (r() < 0.04) h.left = r() < 0.5;
  if (r() < 0.04) h.right = r() < 0.5;
  if (r() < 0.06) h.jump = r() < 0.5;
  if (r() < 0.03) h.drop = r() < 0.4;
  sim.applyPacket(role, {
    n: ++seq,
    l: !!h.left, r: !!h.right, h: !!h.jump, d: !!h.drop,
    j: (h.j = (h.j || 0) + (r() < 0.05 ? 1 : 0)),
    s: (h.s = (h.s || 0) + (r() < 0.06 ? 1 : 0)),
    k: (h.k = (h.k || 0) + (r() < 0.06 ? 1 : 0)),
  });
}

const types = [...Object.keys(POWERUPS), ...Object.keys(POWERUPS_EXTRA)];
let forced = 0;
const faults = [];
const trace = [];
let matches = 0;
let boxSeen = false, bumped = false, kingSeen = 0;

/* Between rounds the rules wait on a real timer, not the simulation clock,
 * so a loop that never yields sits in `roundover` forever and the test only
 * ever plays round one. Handing the event loop back while it is waiting is
 * what lets a whole match — and the rematch after it — actually run. */
for (let i = 0; i < STEPS; i++) {
  try {
    if (sim.state.phase === "roundover" || sim.state.phase === "matchover") {
      await new Promise((r) => setTimeout(r, 12));
      if (sim.state.phase === "matchover") { matches++; nextCast(); sim.rematch(); }
    }
    thumbs("p1");
    thumbs("p2");
    sim.step(DT);
    countAbilities();

    const G = sim.state.G;
    if (G) {
      // Every power-up, on both players, in rotation — the one thing random
      // play will not reliably reach in any sane amount of time.
      // Twice through the list and then stop: forcing one every second and a
      // half forever keeps a shield or a spare heart topped up for ever, and
      // the round can never end.
      if (i % 90 === 0 && forced < types.length * 4) {
        const a = G.actors[forced % 2];
        const type = types[Math.floor(forced / 2) % types.length];
        forced++;
        if (a && !a.dead) {
          G.powers.push({ type, x: a.x, y: a.y, vy: 0, born: G.time, taken: false });
        }
      }
      // ...and the wire, both ways, on every frame a real one would go out.
      if (i % 2 === 0) {
        const snap = snapshot(G, {
          phase: sim.state.phase, score: sim.state.score,
          roundNo: sim.state.roundNo, seed: sim.state.seed, full: i % 60 === 0,
        });
        hydrate(JSON.parse(JSON.stringify(snap)));
      }
    }
    /* Boxes and the King are RARE — a box every nineteen seconds, and the
     * King is two chances in nine of one. A soak that never opened one would
     * report OK on code that had never run, which is the only way this file
     * can lie. Counted here so the summary has to admit it. */
    {
      const g = sim.state.G;
      if (g) {
        if (g.boxes && g.boxes.length) boxSeen = true;
        if (g.king) kingSeen++;
        for (const b of (g.boxes || [])) if (b.hits < 3) bumped = true;
      }
    }
    if (i % 600 === 0) trace.push([Math.round(i / 60), sim.state.phase, sim.state.roundNo, `${sim.state.score.p1}-${sim.state.score.p2}`]);
  } catch (err) {
    faults.push({ step: i, t: sim.state.G && +sim.state.G.time.toFixed(2), err: String(err && err.stack || err) });
    if (faults.length > 6) break;
  }
}

const G = sim.state.G;
console.log(`steps       ${STEPS} (${MINUTES} simulated minutes)`);
console.log(`matches     ${matches} played to the end`);
console.log(`abilities   ${Object.entries(usedBy).map(([k, v]) => `${k} ${v}`).join("  ") || "NONE"}`);
console.log(`rounds      ${sim.state.roundNo}   score ${JSON.stringify(sim.state.score)}`);
console.log(`phase       ${sim.state.phase}   clock ${G ? G.time.toFixed(1) : "-"}`);
console.log(`powers hit  ${forced} forced, ${types.length} kinds`);
console.log(`trace       ${trace.map((t) => t.join("/")).join("  ")}`);
console.log(`effects     ${calls} calls, ${seen.size} distinct`);
console.log(`boxes       ${boxSeen ? 'spawned' : 'NEVER SPAWNED'}, ${bumped ? 'bumped' : 'never bumped'}; king ticks ${kingSeen}`);
if (!faults.length) console.log("\nSOAK OK — no exception in any rule, any snapshot, any round.");
else {
  console.log(`\nSOAK FAIL — ${faults.length} exception(s):`);
  for (const f of faults) console.log(`\n  step ${f.step} (t=${f.t})\n${f.err.split("\n").slice(0, 6).map((l) => "    " + l).join("\n")}`);
  process.exitCode = 1;
}
