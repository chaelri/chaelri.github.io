import assert from "node:assert";
import { shouldSweep as s } from "./logic.js";
const cases = [
  ["✅Claude", 4, false, false], ["✅Claude", 5, false, true], ["✅ Claude", 5, false, true],
  ["✅Claude (MCP)", 5, false, true], ["✅️ Claude", 5, false, true],
  ["Claude", 59, false, false], ["Claude", 60, false, true], ["Claude (MCP)", 60, false, true],
  ["⌛Claude", 359, false, false], ["⌛Claude", 360, false, true], ["⌛Claude", 999, true, false],
  ["🔔Claude", 9999, false, false], ["🔔Claude", 0, true, false],
  ["Claude", 0, true, true], ["✅Claude", 0, true, true],
  ["Work", 9999, true, false], ["✅ Claude notes", 9999, true, false], ["", 9999, true, false], [undefined, 9, true, false],
];
for (const [t, a, f, want] of cases) assert.equal(s(t, a, f), want, `${t} ${a} ${f}`);
console.log(cases.length, "passed");
