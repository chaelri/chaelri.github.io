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
  ["a.reversedUntil = 0", "death has to clear Reverse in both copies"],
  ["a.frozenUntil = 0", "death has to clear Freeze in both copies"],
];
for (const [needle, why] of BOTH_CONTAIN) {
  const inSim = sim.includes(needle), inScreen = screen.includes(needle);
  const ok = inSim && inScreen;
  console.log(`${ok ? "ok  " : "FAIL"}  ${needle.padEnd(28)} ${ok ? "" : "— " + why}`);
  if (!ok) bad++;
}

/* ---- the bodies, not just the names ------------------------------------
 *
 * Checking that a function EXISTS in both copies is not enough, and it has
 * now failed to catch the same class of bug twice: the Bazooka's tryShoot
 * existed in both and only one of them called tryBazooka, and killPlayer
 * existed in both while only sim.js had stopped calling kill(). Both times a
 * batch edit threw halfway through screen.js and wrote nothing, and both
 * times Charlie found it by playing.
 *
 * So the bodies are compared. They cannot be compared literally — the two
 * files reach the outside world through different doors, sim.js through an
 * `fx` object and screen.js through `sfx`/`renderer`/`showNote` — but every
 * one of those differences is known and can be normalised away. What is left
 * is the actual rule, and the rule has to match.
 */
function bodyOf(src, name) {
  const at = src.indexOf(`function ${name}(`);
  if (at < 0) return null;
  let i = src.indexOf("{", at), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (!depth) return src.slice(i + 1, j); }
  }
  return null;
}

/** Strip comments, strings and whitespace, and map each file's API onto one. */
function normalise(body) {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    // the two effect APIs, reduced to the same shape
    .replace(/fx\.sfx\(\s*"([a-z]+)"\s*\)/gi, "SFX($1)")
    .replace(/sfx\.([a-z]+)\(\s*\)/gi, "SFX($1)")
    .replace(/fx\.shake\([^;]*\)/g, "SHAKE")
    .replace(/renderer\.shake\s*=[^;]*/g, "SHAKE")
    .replace(/fx\.punch\([^;]*\)/g, "PUNCH")
    .replace(/renderer\.punch\s*=[^;]*/g, "PUNCH")
    .replace(/fx\.flash\([^;]*\)/g, "FLASH")
    .replace(/renderer\.flash\s*=[^;]*/g, "FLASH")
    .replace(/G\.flash\s*=[^;]*/g, "FLASH")
    .replace(/fx\.killCam\(/g, "KILLCAM(").replace(/renderer\.kill\s*=\s*/g, "KILLCAM(")
    .replace(/fx\.note\(/g, "NOTE(").replace(/showNote\(/g, "NOTE(")
    .replace(/fx\.power\(/g, "PAD(").replace(/tellPad\(/g, "PAD(")
    .replace(/["'`][^"'`]*["'`]/g, "STR")
    .replace(/\s+/g, "")
    .replace(/[;{}()]/g, "");
}

/* Only the functions whose job is to decide what HAPPENS. The rest differ
 * legitimately: screen.js draws, talks to pads and runs the guest half. */
const SAME_BODY = [
  "killPlayer", "hurtKing", "crownTheVictor", "kingLanded", "crownLanded",
  "tryBazooka", "bazookaBoom", "poundBoxes", "openBox", "hitBox", "rollDrop",
  "breakLedge", "tickBoxes", "summonKing",
];
for (const name of SAME_BODY) {
  const x = bodyOf(sim, name), y = bodyOf(screen, name);
  if (!x || !y) { console.log(`FAIL  body ${name.padEnd(16)} missing from ${!x ? "sim" : "screen"}`); bad++; continue; }
  const nx = normalise(x), ny = normalise(y);
  const same = nx === ny;
  if (!same) {
    // Point at the first place they part company, or the message is useless.
    let k = 0;
    while (k < nx.length && k < ny.length && nx[k] === ny[k]) k++;
    console.log(`FAIL  body ${name.padEnd(16)} differs at char ${k}`);
    console.log(`        sim:    ...${nx.slice(Math.max(0, k - 30), k + 50)}`);
    console.log(`        screen: ...${ny.slice(Math.max(0, k - 30), k + 50)}`);
    bad++;
  } else {
    console.log(`ok    body ${name.padEnd(16)} identical`);
  }
}

if (missingFromScreen.length)
  console.log(`\nnote  in sim.js only: ${missingFromScreen.join(", ")}`);
if (missingFromSim.length)
  console.log(`note  in screen.js only: ${missingFromSim.join(", ")}`);

console.log(bad ? `\nTWINS FAIL — ${bad} rule(s) differ between the two copies`
                : "\nTWINS OK — every rule is in both copies, body for body");
process.exit(bad ? 1 : 0);
