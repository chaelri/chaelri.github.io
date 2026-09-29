// Plays whole bot-vs-bot matches through the real sim, headless, and reports
// what happened: buys, steals, catches, how rich the bases got, whether the
// bots ever got stuck. No graphics, no sound.
//
//   node critter-heist/_selftest.mjs [matches]

import { newMatch, step, baseValue } from "./js/sim.js";
import { newBrain, botInput } from "./js/bots.js";

export function run(matches = 20) {
  const dt = 1 / 30;
  const out = { values: [], margins: [], bought: 0, stolen: 0, caught: 0, escapes: 0, locks: 0, legendaries: 0, rainbows: 0, boxes: 0, stuck: 0, errors: [], draws: 0 };
  for (let m = 0; m < matches; m++) {
    try {
      const s = newMatch([{ name: "a", kind: "bot" }, { name: "b", kind: "bot" }]);
      const brains = [newBrain(0.6 + Math.random() * 0.3), newBrain(0.6 + Math.random() * 0.3)];
      let still = [0, 0], last = s.players.map((p) => ({ x: p.x, z: p.z }));
      while (s.phase !== "end") {
        const inputs = brains.map((b, i) => { botInput(s, i, b, dt); return { mx: b.mx, mz: b.mz, a: b.a, l: b.l }; });
        step(s, inputs, dt);
        for (const e of s.events) {
          if (e.type === "place" && !e.stolen) out.bought++;
          if (e.type === "place" && e.stolen) out.stolen++;
          if (e.type === "caught") out.caught++;
          if (e.type === "escape") out.escapes++;
          if (e.type === "lock") out.locks++;
          if (e.type === "box") out.boxes++;
          if (e.type === "place" && e.rarity === "legendary") out.legendaries++;
          if (e.type === "place" && e.rainbow) out.rainbows++;
        }
        s.events.length = 0;
        // a bot standing in one spot for 20 s straight with a goal is stuck
        s.players.forEach((p, i) => {
          const moved = Math.hypot(p.x - last[i].x, p.z - last[i].z);
          still[i] = moved < 0.01 ? still[i] + dt : 0;
          if (still[i] > 20) { out.stuck++; still[i] = -999; }
          last[i] = { x: p.x, z: p.z };
        });
      }
      const v = [baseValue(s, 0), baseValue(s, 1)];
      out.values.push(...v);
      out.margins.push(Math.abs(v[0] - v[1]) / Math.max(1, Math.max(...v)));
      if (s.winner === null) out.draws++;
    } catch (e) { out.errors.push(String(e.stack || e)); }
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  out.summary = {
    avgBaseValue: Math.round(avg(out.values)),
    maxBaseValue: Math.max(...out.values),
    avgWinMargin: +avg(out.margins).toFixed(2),
    perMatch: {
      buys: +(out.bought / matches).toFixed(1), steals: +(out.stolen / matches).toFixed(1), caught: +(out.caught / matches).toFixed(1),
      escapes: +(out.escapes / matches).toFixed(1), locks: +(out.locks / matches).toFixed(1), legendaries: +(out.legendaries / matches).toFixed(2),
      rainbows: +(out.rainbows / matches).toFixed(2), boxes: +(out.boxes / matches).toFixed(2),
    },
    stuck: out.stuck, draws: out.draws,
  };
  out.ok = !out.errors.length && out.stuck === 0;
  return out;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("_selftest.mjs")) {
  const r = run(+process.argv[2] || 20);
  console.log(JSON.stringify(r.summary, null, 1));
  if (r.errors.length) console.log(r.errors.slice(0, 3).join("\n"));
  console.log(r.ok ? "SELFTEST OK" : "SELFTEST FAIL");
}
