// node arena/_selftest.mjs [matches] — bot-only matches through the real sim.
import { createMatch, step, C } from "./js/sim.js";
import { solidAt } from "./js/map.js";
const N = +process.argv[2] || 20;
const tally = {}, rounds = [], matchLen = [];
let wallInside = 0;
for (let m = 0; m < N; m++) {
  const n = 2 + (m % 3);
  const st = createMatch(Array.from({ length: n }, (_, i) => ({ id: "b" + i, name: "Bot" + i, char: "yhon", color: "#fff", bot: true })), { seed: m + 1 });
  let t = 0, roundStart = 0;
  while (st.phase !== "matchEnd" && t < 1500) {
    step(st, 1 / 60); t += 1 / 60;
    for (const e of st.events) {
      tally[e.t] = (tally[e.t] || 0) + 1;
      if (e.t === "roundEnd") { rounds.push(st.roundT); }
    }
    st.events.length = 0;
    for (const p of st.players) {
      for (const f of ["x", "z", "hp", "shield"]) if (!Number.isFinite(p[f])) throw new Error(`NaN ${f} match ${m}`);
      if (p.alive && solidAt(p.x, p.z, -0.05)) wallInside++;
      if (p.hp < 0 || p.hp > C.hp || p.shield > C.shieldMax) throw new Error("bad hp/shield " + p.hp + " " + p.shield);
    }
  }
  if (st.phase !== "matchEnd") throw new Error("match " + m + " never ended (round " + st.round + ")");
  matchLen.push(t);
}
rounds.sort((a, b) => a - b); matchLen.sort((a, b) => a - b);
console.log(`matches ${N}  rounds ${rounds.length}  round length min ${rounds[0].toFixed(0)}s median ${rounds[rounds.length >> 1].toFixed(0)}s max ${rounds.at(-1).toFixed(0)}s  match median ${matchLen[matchLen.length >> 1].toFixed(0)}s  frames inside walls ${wallInside}`);
const per = Object.fromEntries(Object.entries(tally).map(([k, v]) => [k, +(v / rounds.length).toFixed(1)]));
console.log("per round:", per);
