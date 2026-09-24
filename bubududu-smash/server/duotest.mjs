/* Is everything we have built actually IN the two-phone build?
 *
 * Charlie has asked three times, and the honest answer has been "yes, because
 * of how the files are wired" — which is a claim about the code, not a check
 * of it. The wiring can change, and the three times parity HAS silently
 * broken this year it broke in exactly this direction: a rule landed in
 * sim.js and not in the file the phones run.
 *
 * So this walks the real import graph from duo/index.html and asserts that
 * every feature is reachable from it. It does not simulate anything; what it
 * proves is that the code which implements each thing is loaded by that page.
 * The rules being IDENTICAL in both copies is twinstest's job, and the two
 * together are the whole answer.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* `--live` checks the DEPLOYED files instead of the working copy.
 *
 * Because "is it in duo?" and "is it on Charlie's phone?" are different
 * questions, and the second one is the one that has actually been wrong.
 * Three rounds of "bat parang wala" ended with the code being present in the
 * repo, present on the server, and absent from a phone holding a cached
 * module graph. This checks the middle one; the build stamp in the lobby
 * checks the last.
 *
 *   node server/duotest.mjs --live
 */
const LIVE = process.argv.includes("--live");
const BASE = "https://chaelri.github.io/bubududu-smash";
const cache = new Map();

async function prefetch() {
  const want = new Set(["duo/index.html"]);
  // Start from the page, then pull whatever it reaches.
  const seen = new Set();
  const pull = async (rel) => {
    if (cache.has(rel)) return cache.get(rel);
    const res = await fetch(`${BASE}/${rel}?cb=${Date.now()}`);
    const txt = res.ok ? await res.text() : "";
    cache.set(rel, txt);
    return txt;
  };
  const page = await pull("duo/index.html");
  const entry = page.match(/<script[^>]+src="\.\.\/(js\/[\w.\-]+)"/);
  const stack = entry ? [entry[1]] : [];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    const src = await pull(f);
    for (const m of src.matchAll(/(?:from\s+|import\()\s*"\.\/([\w.\-]+)"/g)) {
      stack.push("js/" + m[1]);
    }
  }
  void want;
}

const read = (rel) => (LIVE ? (cache.get(rel) ?? "") : readFileSync(join(ROOT, rel), "utf8"));
const have = (rel) => (LIVE ? cache.has(rel) && cache.get(rel) !== "" : existsSync(join(ROOT, rel)));
if (LIVE) await prefetch();

/* ---- walk the graph, starting from the page itself ---------------------- */

const page = read("duo/index.html");
const entry = page.match(/<script[^>]+src="\.\.\/(js\/[\w.\-]+)"/);
if (!entry) { console.log("FAIL  duo/index.html loads no module at all"); process.exit(1); }

const graph = new Set();
const stack = [entry[1]];
while (stack.length) {
  const f = stack.pop();
  if (graph.has(f) || !have(f)) continue;
  graph.add(f);
  const src = read(f);
  // static imports and the dynamic import() duo.js uses for screen.js
  for (const m of src.matchAll(/(?:from\s+|import\()\s*"\.\/([\w.\-]+)"/g)) {
    stack.push("js/" + m[1]);
  }
}

/* ---- and check each thing is in something the page loads ---------------- */

/* Every entry is [what it is, the file it lives in, a string that must be
 * there]. The marker is a line of the IMPLEMENTATION, never a line of prose:
 * the first draft of this file used comment text and four entries failed on
 * their first run for wording that had drifted — one of them because sim.js
 * and screen.js explain the same rule in different words, which is fine and
 * is not something a test should have an opinion about. Code or nothing. */
const FEATURES = [
  ["mystery pinatas",        "js/screen.js",  "function tickBoxes"],
  ["...their loot overrides", "js/screen.js", "fromBox: true"],
  ["...shot or punched open", "js/screen.js", "b.homing ? BOX.hits : 1"],
  ["King Yhon Yhon",         "js/screen.js",  "function summonKing"],
  ["...hurt by anything",    "js/screen.js",  "function hurtKing"],
  ["...stompable by anyone", "js/screen.js",  "a.vy = -FEEL.stompBounce * 1.25"],
  ["...SHOW RESPECT",        "js/screen.js",  "SHOW RESPECT TO THE KING!"],
  ["the crown",              "js/config.js",  "korona:"],
  ["...lasts the round",     "js/config.js",  "korona"],
  ["the bazooka",            "js/screen.js",  "function tryBazooka"],
  ["...its explosion",       "js/screen.js",  "function bazookaBoom"],
  ["...homing that works",   "js/screen.js",  "def.speed / Math.max(0.5, dist)"],
  ["...through the floor",   "js/screen.js",  '(t === "#" && !b.homing)'],
  ["...not swapped for a gun", "js/screen.js", 'q.type === "baril" && hasPower(a, "bazuka")'],
  ["OP items never trade",   "js/screen.js",  "ALL_POWERS[a.power.type]?.op"],
  ["the shield",             "js/config.js",  "kalasag:"],
  ["...refusing damage",     "js/screen.js",  "isShielded(victim)"],
  ["...drawn as a field",    "js/render.js",  'a.power.type === "kalasag"'],
  ["half hearts",            "js/config.js",  "damage: 0.5"],
  ["...drawn in halves",     "js/render.js",  "const fill = Math.max(0, Math.min(1, a.hp - i))"],
  ["Big Heart sets nine",    "js/config.js",  "set: 9"],
  ["a hit does not respawn", "js/screen.js",  "A hit does NOT take you off the board"],
  ["...nor shove you",       "js/screen.js",  "victim.invulnUntil = Math.max(victim.invulnUntil || 0,"],
  ["...nor stop the world",  "js/config.js",  "hurtFreezeMs: 0"],
  ["...but flashes red",     "js/render.js",  "const HIT_FLASH = 0.42"],
  ["the thrown body",        "js/render.js",  "const flying = d0 && g.time - d0.at >= 0"],
  ["One Punch across the map", "js/config.js", "reachX: 34"],
  ["...its shockwave",       "js/render.js",  "def.reachX * z * head"],
  ["spawns keep clear",      "js/screen.js",  "function spawnAwayFrom"],
  ["no shake on a coin",     "js/screen.js",  "0.012 + a.coins * 0.004"],
  ["the gun is a gun",       "js/marks.js",   "poly([[6, 26], [88, 26], [88, 44], [6, 44]])"],
  ["the after-match vote",   "js/screen.js",  "function castVote"],
  ["...sent by the guest",   "js/duo.js",     "recastSeq"],
  ["...drawn by the guest",  "js/duo.js",     "screen.applyVotes"],
  ["rematch AND recast",     "duo/index.html", 'id="recast"'],
  ["the score, above it all", "duo/index.html", 'id="hud"'],
  ["the pinata's own art",   "js/render.js",  "PINATA_BANDS"],
  ["the valley backdrop",    "js/scenery.js", "export function bakeScenery"],
  ["the pound's dust",       "js/render.js",  "softDot(i % 3 === 0 ? \"168,140,104\"" ],
  /* The ones Charlie named by hand when he asked whether duo really had
   * them. Listed explicitly so the answer to that question is a command. */
  ["mini Bubu is two",       "js/config.js",  "count: 2,"],
  ["...at half a heart",     "js/config.js",  "damage: 0.5"],
  ["half hearts on the wire", "js/netstate.js", "r2(a.hp)"],
  ["...and on the card",     "js/panel.js",   'class="half"'],
  ["the pinata's size",      "js/config.js",  "w: 1.35, h: 1.35"],
  ["the ten-coin list",      "js/config.js",  '"puso", "diwata", "kalasag", "baril"'],
  ["out of hearts is out",   "js/screen.js",  "if (a.hp <= 0 && !a.dead)"],
  ["the banner waits",       "js/config.js",  "roundBannerMs"],
  ["the blast throws you",   "js/config.js",  "throw: 42"],
  ["the proximity fuse",     "js/config.js",  "fuse: 1.6"],
  ["the floor trembles",     "js/render.js",  "const eaten = Math.floor(g.shrink"],
  ["the build stamp",        "js/config.js",  "BUILD = "],
  ["the lobby valley",       "js/duo.js",     "runLobbyScene"],
  ["...and it gets out of the way", "js/duo.js", "function closeScene"],
  ["ready up, both of you",  "duo/index.html", 'id="readybtn"'],
  ["...answered by the server", "js/netclient.js", 'room.onMessage("lobby", paintReady)'],
  ["...and it gates the start", "js/netclient.js", 'client.joinOrCreate("smash", { role, char: myChar, gate: true })'],
];

let bad = 0;
for (const [what, file, marker] of FEATURES) {
  const loaded = file.startsWith("duo/") || graph.has(file);
  const present = have(file) && read(file).includes(marker);
  const ok = loaded && present;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what.padEnd(26)} ${file}` +
              (ok ? "" : loaded ? "  — marker missing" : "  — NOT LOADED BY duo"));
}

console.log(`\nduo loads ${graph.size} modules from ${entry[1]}` +
            (LIVE ? `  —  LIVE, build ${(read("js/config.js").match(/BUILD = "([^"]*)"/) || [])[1] || "?"}` : ""));
console.log(bad
  ? `\nDUO FAIL — ${bad} thing(s) the two-phone build does not have`
  : "\nDUO OK — every feature is reachable from duo/index.html");
process.exit(bad ? 1 : 0);
