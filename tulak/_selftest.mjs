// Plays whole bot-only matches through the real sim, headless, and reports
// how long they take — the game is supposed to land in 3–5 minutes, and this
// is the only honest way to know. Runs in node or in _selftest.html.
//
//   node tulak/_selftest.mjs [matches]

import { newMatch, step } from "./js/sim.js";
import { newBrain, botInput } from "./js/bots.js";
import { CRITTER_IDS } from "./js/config.js";

export function run(matches = 30) {
  const dt = 1 / 60;
  const out = { matches, durations: [], rounds: [], draws: 0, roundLens: [], wins: {}, kos: 0, selfFalls: 0, errors: [] };
  for (let m = 0; m < matches; m++) {
    try {
      const seats = [0, 1, 2, 3].map((i) => ({ critter: CRITTER_IDS[(i + m) % 4], name: `bot${i}`, kind: "bot" }));
      const s = newMatch(seats);
      const brains = seats.map(() => newBrain(0.6 + Math.random() * 0.35));
      let roundStart = 0, frames = 0;
      while (s.phase !== "matchEnd" && frames < 60 * 60 * 12) {
        const inputs = brains.map((b, i) => {
          botInput(s, i, b, dt);
          return { mx: b.mx, mz: b.mz, d: b.d, a: b.a };
        });
        step(s, inputs, dt);
        for (const e of s.events) {
          if (e.type === "go") roundStart = s.matchT;
          if (e.type === "roundEnd") {
            out.roundLens.push(s.matchT - roundStart);
            if (e.winner === null) out.draws++;
          }
          if (e.type === "fall") e.by === null ? out.selfFalls++ : out.kos++;
        }
        s.events.length = 0;
        for (const p of s.players) {
          if (![p.x, p.z, p.y, p.vx, p.vz].every(Number.isFinite)) throw new Error(`non-finite state for ${p.critter}`);
        }
        frames++;
      }
      if (s.phase !== "matchEnd") throw new Error("match never ended");
      out.durations.push(s.t);
      out.rounds.push(s.round);
      const w = s.players[s.matchWinner].critter;
      out.wins[w] = (out.wins[w] || 0) + 1;
    } catch (e) {
      out.errors.push(String(e.stack || e));
    }
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  out.summary = {
    avgMatchMin: +(avg(out.durations) / 60).toFixed(2),
    minMatchMin: +(Math.min(...out.durations) / 60).toFixed(2),
    maxMatchMin: +(Math.max(...out.durations) / 60).toFixed(2),
    avgRounds: +avg(out.rounds).toFixed(1),
    avgRoundSec: +avg(out.roundLens).toFixed(1),
    drawRate: +(out.draws / (out.roundLens.length || 1)).toFixed(2),
    koShare: +(out.kos / (out.kos + out.selfFalls || 1)).toFixed(2),
    wins: out.wins,
  };
  out.ok = !out.errors.length && out.summary.maxMatchMin <= 5.5;
  return out;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("_selftest.mjs")) {
  const r = run(+process.argv[2] || 30);
  console.log(JSON.stringify(r.summary, null, 1));
  if (r.errors.length) console.log(r.errors.slice(0, 3).join("\n"));
  console.log(r.ok ? "SELFTEST OK" : "SELFTEST FAIL");
}
