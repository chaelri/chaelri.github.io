/* sim.js and screen.js are the same rules TWICE, and they have to stay twins.
 *
 * sim.js is the authoritative server; screen.js is the laptop and the host
 * phone. Every rule lives in both, and every edit has to land in both. When
 * one lands in only one, the game is fine wherever the tested copy runs and
 * quietly broken everywhere else — and nothing catches it, because the soak,
 * the netcode bench and boxtest all drive sim.js.
 *
 * That is exactly how the Bazooka shipped unusable: a batch edit threw
 * halfway through screen.js, wrote nothing, and reported success for sim.js
 * on the line above. The laptop had the power-up, the chip, the ammo and the
 * key hint, and no tryBazooka to call. Charlie: "di ko pa rin napapagana".
 *
 * So: every function and constant one copy has, the other must have too.
 * This is a crude check and it would have caught it on the first run.
 */
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../js/${f}`, import.meta.url), "utf8");
const sim = read("sim.js");
const screen = read("screen.js");

/** Every `function name(` declared at the top level of a file. */
const fns = (src) =>
  new Set([...src.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]));

/* Names that legitimately live in only one of them.
 *
 * sim.js is a headless server: no DOM, no renderer, no lobby, no pads to
 * paint. screen.js is a page: it owns all of that AND the netcode's guest
 * half. Anything listed here is a real difference in what the file is FOR,
 * not a rule that went missing — and the list is short on purpose, because a
 * long one is how this check stops working.
 */
const ONLY_SIM = new Set([]);
const ONLY_SCREEN = new Set([]);

const a = fns(sim), b = fns(screen);
const missingFromScreen = [...a].filter((n) => !b.has(n) && !ONLY_SIM.has(n));
const missingFromSim = [...b].filter((n) => !a.has(n) && !ONLY_SCREEN.has(n));

/* The rules, specifically.
 *
 * The lists above will always have entries — these two files genuinely do
 * different jobs. What must never differ is a function that decides what
 * HAPPENS in a match. Naming them explicitly means a new rule has to be
 * added here too, which is the point: the list is the checklist.
 */
const RULES = [
  "tryShoot", "tryBazooka", "tryPunch", "tryAbility", "holdAbility",
  "poundLanded", "breakLedge", "poundBoxes", "tickBoxes", "openBox",
  "hitBox", "rollDrop", "summonKing", "hurtKing", "crownTheVictor",
  "tickKing", "kingLanded", "tickKingContact", "crownLanded",
  "killPlayer", "handleDeath", "givePower", "clearPower", "showPickup",
];

let bad = 0;
for (const name of RULES) {
  const inSim = a.has(name), inScreen = b.has(name);
  const ok = inSim && inScreen;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name.padEnd(18)} sim:${inSim ? "y" : "-"} screen:${inScreen ? "y" : "-"}`);
  if (!ok) bad++;
}

/* And the one-liners inside them that are easy to add to one file only. */
const BOTH_CONTAIN = [
  ['hasPower(a, "bazuka")', "the fire control has to reach the Bazooka"],
  ["b.homing", "a shell has to steer in both copies"],
  ["SQUAD.damage", "the mini squad's half heart"],
  ["breakLedge(a, force)", "a pound has to break the ledge"],
  ["hurtKing(a)", "the King has to be hurtable"],
  ['givePower(winner, "korona")', "the crown has to be handed over"],
];
for (const [needle, why] of BOTH_CONTAIN) {
  const inSim = sim.includes(needle), inScreen = screen.includes(needle);
  const ok = inSim && inScreen;
  console.log(`${ok ? "ok  " : "FAIL"}  ${needle.padEnd(28)} ${ok ? "" : "— " + why}`);
  if (!ok) bad++;
}

if (missingFromScreen.length)
  console.log(`\nnote  in sim.js only: ${missingFromScreen.join(", ")}`);
if (missingFromSim.length)
  console.log(`note  in screen.js only: ${missingFromSim.join(", ")}`);

console.log(bad ? `\nTWINS FAIL — ${bad} rule(s) live in only one copy`
                : "\nTWINS OK — every rule is in both copies");
process.exit(bad ? 1 : 0);
