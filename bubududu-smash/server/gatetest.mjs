/* The ready gate, against a REAL room and two REAL sockets.
 *
 * readytest.mjs asks the rule the question directly, which proves the rule
 * and nothing about the wiring: whether the message is registered, whether
 * the seats are read the way the gate expects, whether the room starts
 * broadcasting the moment it should and not a moment before. That can only
 * be seen from outside, so this starts the actual server as a child process
 * and joins it twice with the actual client library.
 *
 *   node server/gatetest.mjs
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "colyseus.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 2599;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = spawn(process.execPath, [join(HERE, "index.mjs")], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});
const log = [];
srv.stdout.on("data", (b) => log.push(String(b)));
srv.stderr.on("data", (b) => log.push(String(b)));

let bad = 0;
const check = (what, got, want) => {
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what.padEnd(42)} ${got}${ok ? "" : `  (wanted ${want})`}`);
};

try {
  // Give it a moment to bind.
  for (let i = 0; i < 40 && !log.join("").includes("listening"); i++) await sleep(100);

  const seen = { p1: 0, p2: 0 };
  const lobby = { p1: null, p2: null };
  const open = async (role) => {
    const room = await new Client(`ws://127.0.0.1:${PORT}`)
      .joinOrCreate("smash", { role, char: "yhon", gate: true });
    room.onMessage("s", () => { seen[role]++; });
    room.onMessage("lobby", (m) => { lobby[role] = m; });
    return room;
  };

  const a = await open("p1");
  await sleep(400);
  check("one in: no round", seen.p1, 0);

  const b = await open("p2");
  await sleep(600);
  check("both in but neither ready: still no round", seen.p1 + seen.p2, 0);
  check("...and each is told where the other stands", !!lobby.p1 && lobby.p1.in.p2, true);

  a.send("ready", true);
  await sleep(500);
  check("one ready: still no round", seen.p1 + seen.p2, 0);
  check("...and the other phone can see it", lobby.p2 && lobby.p2.ready.p1, true);

  // Taking it back has to work, or a phone put down by mistake is a match.
  a.send("ready", false);
  await sleep(300);
  check("un-ready sticks", lobby.p2 && lobby.p2.ready.p1, false);

  a.send("ready", true);
  b.send("ready", true);
  await sleep(800);
  check("both ready: the round is on for p1", seen.p1 > 5, true);
  check("...and for p2", seen.p2 > 5, true);

  await a.leave();
  await b.leave();
} catch (err) {
  bad++;
  console.log("FAIL  threw:", err && err.message ? err.message : err);
} finally {
  srv.kill("SIGKILL");
}

console.log(bad ? `\nGATE FAIL — ${bad}\n${log.join("")}` : "\nGATE OK — a real room holds the start until both of them say so");
process.exit(bad ? 1 : 0);
