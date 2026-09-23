/**
 * The bend metric, across seeds instead of on one.
 *
 * `nettest` gates on a single fixed round, and for TRANSPORT changes that is
 * right: same scenario in, same number out, so a real regression shows. For
 * GAMEPLAY changes it is a coin toss. Widening the Ground Pound on 2026-09-23
 * moved the default seed's bend p99 from 0.26 to 0.97 without a line of
 * netcode changing — and the same constants read 0.35 at knockback 20 and
 * 0.97 at knockback 19. Not a gate: chaos. Two of eight seeds were already
 * over the 0.5 line on the OLD numbers, which means the pass was luck.
 *
 * What is stable is the DISTRIBUTION. This runs the same bench over a spread
 * of rounds and prints the median, which does move for real reasons and sits
 * still for false ones. Use it whenever a change touches what happens in a
 * match rather than how it travels.
 *
 *   node server/bendsweep.mjs [char] [seeds...]
 */
import { execFileSync } from "node:child_process";

const char = process.argv[2] || "bubu";
const seeds = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ["20260923", "11", "22", "33", "44", "55", "66", "77"];

const rows = [];
for (const sd of seeds) {
  // nettest exits non-zero when it fails its own gate, which is most of the
  // point of running it here — read the output either way.
  let out;
  try {
    out = execFileSync("node",
      ["server/nettest.mjs", "60", "40", "0", char, "0.03", sd],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) { out = (e.stdout || "").toString(); }
  const m = out.match(/bend p99 ([0-9.]+)/);
  const own = out.match(/own body p99 ([0-9.]+)/);
  rows.push({ sd, bend: m ? +m[1] : NaN, own: own ? +own[1] : NaN });
}

const med = (v) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const bends = rows.map((r) => r.bend);

for (const r of rows) console.log(`  seed ${String(r.sd).padEnd(9)} bend ${r.bend.toFixed(3)}   own ${r.own.toFixed(3)}`);
console.log(`\nBEND across ${rows.length} rounds as ${char} — median ${med(bends).toFixed(3)}  ` +
            `worst ${Math.max(...bends).toFixed(3)}  best ${Math.min(...bends).toFixed(3)}`);
console.log(`OWN  median ${med(rows.map((r) => r.own)).toFixed(3)} — this one IS stable ` +
            `across rounds, so it is the number to watch for a real prediction regression.`);
