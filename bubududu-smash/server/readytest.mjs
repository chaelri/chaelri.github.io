/* The start gate, asked every question two phones can put to it.
 *
 * The one that matters and is easy to get wrong is the LAST pair: a rollout
 * is never atomic, and for a few minutes one phone is on the old files. If
 * the gate asked that phone to press a button it does not have, the two of
 * them would sit on a lobby that can never start — which is a worse failure
 * than the auto-start this replaces, because there is nothing to press.
 */
import { shouldStart } from "./gate.mjs";

const S = (p1, p2) => ({ p1, p2 });
const CASES = [
  ["nobody in",                  { seated: S(0,0), ready: S(0,0), gated: S(1,1), phase: "lobby" }, false],
  ["only Charlie",               { seated: S(1,0), ready: S(1,0), gated: S(1,1), phase: "lobby" }, false],
  ["both in, neither ready",     { seated: S(1,1), ready: S(0,0), gated: S(1,1), phase: "lobby" }, false],
  ["both in, one ready",         { seated: S(1,1), ready: S(1,0), gated: S(1,1), phase: "lobby" }, false],
  ["both in, the other ready",   { seated: S(1,1), ready: S(0,1), gated: S(1,1), phase: "lobby" }, false],
  ["both in, BOTH ready",        { seated: S(1,1), ready: S(1,1), gated: S(1,1), phase: "lobby" }, true],
  ["both ready mid-match",       { seated: S(1,1), ready: S(1,1), gated: S(1,1), phase: "play" }, false],
  ["both ready after a match",   { seated: S(1,1), ready: S(1,1), gated: S(1,1), phase: "matchover" }, false],
  ["an old page never asked",    { seated: S(1,1), ready: S(0,0), gated: S(0,0), phase: "lobby" }, true],
  ["half a rollout",             { seated: S(1,1), ready: S(0,0), gated: S(1,0), phase: "lobby" }, false],
  ["...once the new one taps",   { seated: S(1,1), ready: S(1,0), gated: S(1,0), phase: "lobby" }, true],
  ["ready but not seated",       { seated: S(1,0), ready: S(1,1), gated: S(1,1), phase: "lobby" }, false],
];

let bad = 0;
for (const [what, input, want] of CASES) {
  const got = shouldStart(input);
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what.padEnd(28)} -> ${got}${ok ? "" : `  (wanted ${want})`}`);
}
console.log(bad ? `\nREADY FAIL — ${bad}` : "\nREADY OK — the match waits for both of them");
process.exit(bad ? 1 : 0);
