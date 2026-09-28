// Plays whole bot-vs-bot matches through the real sim, headless, and reports
// pacing and balance: how long fights and matches take, how many rounds, how
// often shops merge and PUSTA gets called. The match is meant to land in 3–5
// minutes with humans taking their full prep time, so it is reported that way.
//
//   node critter-clash/_selftest.mjs [matches]

import { newMatch, step } from "./js/sim.js";
import { newBrain, botStep, botPool } from "./js/bots.js";
import { TUNE } from "./js/config.js";

export function run(matches = 40) {
  const dt = 1 / 30;
  const out = { fights: [], rounds: [], draws: 0, errors: [], merges: 0, pustas: 0, stars3: 0, poolWins: {}, dmg: [] };
  for (let m = 0; m < matches; m++) {
    try {
      const n = [2, 3, 4][m % 3];
      const pools = [botPool(n), botPool(n)];
      const s = newMatch([{ name: "a", kind: "bot", pool: pools[0] }, { name: "b", kind: "bot", pool: pools[1] }]);
      const brains = [newBrain(), newBrain()];
      let t = 0;
      while (s.phase !== "matchEnd" && t < 1500) {
        brains.forEach((b, i) => botStep(s, i, b, dt));
        step(s, dt);
        t += dt;
        for (const e of s.events) {
          if (e.type === "roundEnd") { out.fights.push(s.fightT); out.dmg.push(e.dmg); if (e.winner === null) out.draws++; }
          if (e.type === "merge") { out.merges++; if (e.star === 3) out.stars3++; }
          if (e.type === "pusta") out.pustas++;
        }
        s.events.length = 0;
      }
      if (s.phase !== "matchEnd") throw new Error("match never ended");
      out.rounds.push(s.round);
      const k = [...pools[s.matchWinner]].sort().join("+");
      out.poolWins[k] = (out.poolWins[k] || 0) + 1;
    } catch (e) { out.errors.push(String(e.stack || e)); }
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const perRound = TUNE.prepTime * 0.8 + avg(out.fights) + TUNE.roundEndPause + 1.5; // people rarely use every prep second
  out.summary = {
    avgFightSec: +avg(out.fights).toFixed(1),
    avgRounds: +avg(out.rounds).toFixed(1),
    minRounds: Math.min(...out.rounds), maxRounds: Math.max(...out.rounds),
    humanMatchMin: +((perRound * avg(out.rounds)) / 60).toFixed(2),
    avgDmgPerRound: +avg(out.dmg).toFixed(1),
    drawRate: +(out.draws / (out.fights.length || 1)).toFixed(2),
    mergesPerMatch: +(out.merges / matches).toFixed(1),
    threeStarsPerMatch: +(out.stars3 / matches).toFixed(2),
    pustasPerMatch: +(out.pustas / matches).toFixed(1),
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
