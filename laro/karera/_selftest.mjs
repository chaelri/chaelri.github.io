// node _selftest.mjs [races] — all-CPU races through the real sim; checks they finish and stay sane.
import { buildTrack } from "./js/track.js";
import { createRace, step, C } from "./js/sim.js";
const N = +process.argv[2] || 20;
const T = buildTrack();
const CH = ["yhon", "axolotl", "capybara", "hedgehog"];
let worst = 0, totals = { hit: 0, box: 0, coin: 0, miniturbo: 0, fire: 0, bump: 0, pad: 0, boost: 0 }, times = [], walls = 0;
for (let r = 0; r < N; r++) {
  const racers = Array.from({ length: 6 }, (_, i) => ({ id: "k" + i, name: "CPU" + i, char: CH[i % 4], color: "#fff", human: false }));
  const st = createRace(T, racers, { seed: r + 1 });
  let t = 0;
  while (st.phase !== "done" && t < 400) {
    step(st, 1 / 60, null);
    t += 1 / 60;
    for (const e of st.events) if (totals[e.t] !== undefined) totals[e.t]++;
    st.events.length = 0;
    for (const k of st.karts) {
      for (const f of ["x", "z", "y", "h", "speed", "dist"]) if (!Number.isFinite(k[f])) throw new Error(`NaN ${f} race ${r} t ${t}`);
    }
  }
  if (st.phase !== "done") throw new Error("race " + r + " never finished; dists " + st.karts.map((k) => k.dist.toFixed(0)));
  const fin = st.karts.filter((k) => k.finished).map((k) => k.time);
  times.push(...fin);
  worst = Math.max(worst, t);
}
times.sort((a, b) => a - b);
console.log(`races ${N}  slowest race ${worst.toFixed(0)}s  finish times min ${times[0].toFixed(1)} median ${times[times.length >> 1].toFixed(1)} max ${times[times.length - 1].toFixed(1)}`);
console.log("per race:", Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, +(v / N).toFixed(1)])));
