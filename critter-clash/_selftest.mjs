// Plays whole bot-vs-bot matches through the real sim, headless, and reports
// pacing and balance: how long fights and matches take, and how each critter
// does. The match is meant to land in 3–5 minutes with humans taking their
// full prep time, so it is reported that way too.
//
//   node critter-clash/_selftest.mjs [matches]

import { newMatch, step } from "./js/sim.js";
import { newBrain, botStep } from "./js/bots.js";
import { TUNE, CRITTER_IDS } from "./js/config.js";

export function run(matches = 40) {
  const dt = 1 / 30;
  const out = { fights: [], rounds: [], draws: 0, errors: [], survive: {}, dealt: {}, fielded: {}, squadWins: {} };
  for (const id of CRITTER_IDS) { out.survive[id] = 0; out.dealt[id] = 0; out.fielded[id] = 0; }
  const sizes = [2, 3, 4];
  for (let m = 0; m < matches; m++) {
    try {
      const n = sizes[m % sizes.length];
      // random squads of n, so every mix gets exercised
      const pick = () => [...CRITTER_IDS].sort(() => Math.random() - 0.5).slice(0, n);
      const s = newMatch([{ name: "a", kind: "bot", squad: pick() }, { name: "b", kind: "bot", squad: pick() }]);
      const brains = [newBrain(), newBrain()];
      let t = 0;
      while (s.phase !== "matchEnd" && t < 1200) {
        brains.forEach((b, i) => botStep(s, i, b, dt));
        step(s, dt);
        t += dt;
        for (const e of s.events) {
          if (e.type === "hit" && e.by >= 0) out.dealt[s.units[e.by].id] += e.amount;
          if (e.type === "roundEnd") {
            out.fights.push(s.fightT);
            if (e.winner === null) out.draws++;
            for (const u of s.units) { out.fielded[u.id]++; if (u.alive) out.survive[u.id]++; }
            if (e.winner !== null) { const k = [...s.seats[e.winner].squad].sort().join("+"); out.squadWins[k] = (out.squadWins[k] || 0) + 1; }
          }
        }
        s.events.length = 0;
      }
      if (s.phase !== "matchEnd") throw new Error("match never ended");
      out.rounds.push(s.round);
    } catch (e) { out.errors.push(String(e.stack || e)); }
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const perRound = TUNE.prepTime + avg(out.fights) + TUNE.roundEndPause + 1.5;
  out.summary = {
    avgFightSec: +avg(out.fights).toFixed(1),
    maxFightSec: +Math.max(...out.fights).toFixed(1),
    avgRounds: +avg(out.rounds).toFixed(1),
    humanMatchMin: +((perRound * avg(out.rounds)) / 60).toFixed(2),
    drawRate: +(out.draws / (out.fights.length || 1)).toFixed(2),
    surviveRate: Object.fromEntries(CRITTER_IDS.map((id) => [id, +(out.survive[id] / (out.fielded[id] || 1)).toFixed(2)])),
    dmgPerRound: Object.fromEntries(CRITTER_IDS.map((id) => [id, Math.round(out.dealt[id] / (out.fielded[id] || 1))])),
  };
  out.ok = !out.errors.length;
  return out;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("_selftest.mjs")) {
  const r = run(+process.argv[2] || 40);
  console.log(JSON.stringify(r.summary, null, 1));
  if (r.errors.length) console.log(r.errors.slice(0, 3).join("\n"));
  console.log(r.ok ? "SELFTEST OK" : "SELFTEST FAIL");
}
