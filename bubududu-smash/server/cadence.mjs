/* What the live server actually sends, and when.
 *
 * SEND_HZ says thirty a second. That is what the code asks for; this is what
 * arrives, across the public internet, off a Cloud Run instance that is free
 * and therefore CPU-throttled between requests. The gap between snapshots is
 * the whole budget the other player's motion is interpolated out of — if it
 * ever exceeds the interpolation delay, the remote player freezes and then
 * jumps, and that is what a stutter IS.
 */
import { Client } from "colyseus.js";

const URL = process.env.SMASH_URL || "wss://bubududu-smash-server-5ypptiosra-as.a.run.app";
const SECONDS = Number(process.argv[2] || 45);

const pct = (a, p) => a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;

async function seat(role) {
  const c = new Client(URL);
  const room = await c.joinOrCreate("smash", { role });
  const gaps = [];
  const rtts = [];
  let last = 0;
  room.onMessage("s", () => {
    const now = performance.now();
    if (last) gaps.push(now - last);
    last = now;
  });
  room.onMessage("pong", (t) => rtts.push(performance.now() - t));
  const ping = setInterval(() => room.send("ping", performance.now()), 500);
  // a thumb on the pad, so the round actually runs
  let n = 0;
  const input = setInterval(() => {
    const batch = [];
    for (let i = 0; i < 2; i++) {
      n++;
      batch.push({ n, l: n % 120 < 60, r: n % 120 >= 60, h: false, d: false, j: 0, s: 0 });
    }
    room.send("input", batch);
  }, 1000 / 30);
  return { room, gaps, rtts, stop: () => { clearInterval(ping); clearInterval(input); room.leave(); } };
}

const a = await seat("p1");
const b = await seat("p2");
console.log(`connected — watching for ${SECONDS}s`);
await new Promise((r) => setTimeout(r, SECONDS * 1000));

for (const [name, s] of [["p1", a], ["p2", b]]) {
  const g = s.gaps;
  const over = (ms) => g.filter((x) => x > ms).length;
  console.log(
    `\n${name}  ${g.length} snapshots in ${SECONDS}s  = ${(g.length / SECONDS).toFixed(1)}/s\n` +
    `    gap  p50 ${pct(g, 0.5).toFixed(0)}ms  p90 ${pct(g, 0.9).toFixed(0)}ms  ` +
    `p99 ${pct(g, 0.99).toFixed(0)}ms  worst ${Math.max(...g).toFixed(0)}ms\n` +
    `    gaps over 100ms: ${over(100)}   over 200ms: ${over(200)}   over 400ms: ${over(400)}\n` +
    `    rtt  p50 ${pct(s.rtts, 0.5).toFixed(0)}ms  p90 ${pct(s.rtts, 0.9).toFixed(0)}ms  worst ${Math.max(...s.rtts).toFixed(0)}ms`
  );
}
a.stop(); b.stop();
process.exit(0);
