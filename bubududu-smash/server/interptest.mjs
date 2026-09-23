/* Does the remote world MOVE between snapshots, or only when one lands?
 *
 * That is the whole difference between smooth and juddery, and for a long
 * time nothing measured it — the netcode bench watches the two players and
 * the two players were the only things being interpolated. Everything else
 * the server owns was taken outright from each snapshot and then held still,
 * so it moved at the snapshot rate: three frames of a sixty-hertz screen
 * showing the same picture, then a jump. Charlie saw it on exactly the things
 * that move fastest — "mini bubu jumping, lumilipad na fairy yhon".
 *
 * So this feeds a synthetic world in at the snapshot rate, samples it at the
 * frame rate, and counts the frames on which each thing did not move at all.
 *
 *   node server/interptest.mjs [seconds] [sendHz] [jitterMs] [lossPct] [raw]
 *
 * `raw` skips the reading-between entirely, which is exactly what the client
 * used to do with everything except the other player — so it prints the bug
 * as it was, and shows that this test would have caught it.
 */
import { createWorldTape, INTERP_MIN, INTERP_MAX } from "../js/interp.js";

const SECONDS = Number(process.argv[2] || 12);
const SEND_HZ = Number(process.argv[3] || 30);
const JITTER = Number(process.argv[4] || 8);
const LOSS = Number(process.argv[5] || 0);
const RAW = process.argv[6] === "raw";
const FRAME_HZ = 60;

/* Something that is always genuinely moving, so a frozen frame can only be
 * the reading-between failing and never the thing standing still. */
const path = (t, phase) => ({
  x: 20 + Math.sin(t * 1.7 + phase) * 6,
  y: 10 + Math.abs(Math.sin(t * 3.1 + phase)) * 2.4,
});

function truth(t) {
  const mk = (i) => {
    const { x, y } = path(t, i);
    return { x, y, face: Math.sin(t * 1.7 + i) > 0 ? 1 : -1, walk: t * 4,
             squash: 0, t, grounded: (t * 3 | 0) % 2 === 0, dead: false };
  };
  return {
    actors: [{ id: "p1", ...mk(0) }, { id: "p2", ...mk(1) }],
    minis: [0, 1, 2].map((i) => ({ actor: mk(2 + i) })),
    helpers: [{ actor: mk(5) }],
    wildFairy: path(t, 6),
    shots: [{ owner: "p1", born: 0, x: 5 + t * 24, y: 9 }],
  };
}

/** A world object of the shape render.js draws, filled from one snapshot. */
function worldFrom(v) {
  const copy = (b) => ({ ...b });
  return {
    actors: v.actors.map(copy),
    minis: v.minis.map((m) => ({ actor: copy(m.actor) })),
    helpers: v.helpers.map((h) => ({ actor: copy(h.actor) })),
    wildFairy: { ...v.wildFairy },
    shots: v.shots.map(copy),
  };
}

const tape = createWorldTape();
let G = null;
let nextSend = 0;
let clock = 0;
const frameMs = 1000 / FRAME_HZ;
const sendMs = 1000 / SEND_HZ;

const watch = {
  "other player": (g) => g.actors[1].x,
  "mini bubu":    (g) => g.minis[0].actor.x,
  "mini (up/down)": (g) => g.minis[0].actor.y,
  "dudu":         (g) => g.helpers[0].actor.x,
  "fairy yhon":   (g) => g.wildFairy.x,
  "bullet":       (g) => g.shots[0].x,
};
const seen = {}, still = {}, total = {}, steps = {};
for (const k of Object.keys(watch)) { seen[k] = null; still[k] = 0; total[k] = 0; steps[k] = []; }

for (let f = 0; f * frameMs < SECONDS * 1000; f++) {
  clock = f * frameMs;
  // deliver whatever is due, with jitter and loss
  while (nextSend <= clock) {
    const v = truth(nextSend / 1000);
    if (Math.random() * 100 >= LOSS) {
      const at = nextSend + (Math.random() - 0.5) * 2 * JITTER;
      tape.record(v, at);
      // the newest snapshot is what the client holds; positions get read back
      G = worldFrom(v);
    }
    nextSend += sendMs;
  }
  if (!G) continue;
  if (!RAW) tape.apply(G, clock, "p1");
  for (const [k, get] of Object.entries(watch)) {
    const v = get(G);
    if (seen[k] !== null) {
      total[k]++;
      const d = Math.abs(v - seen[k]);
      if (d < 1e-9) still[k]++; else steps[k].push(d);
    }
    seen[k] = v;
  }
}

const pct = (a, p) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length * p)] : 0);
console.log(`${SECONDS}s · ${SEND_HZ} snapshots/s · ${FRAME_HZ} frames/s · ` +
            `jitter ±${JITTER}ms · loss ${LOSS}%   ` +
            (RAW ? "RAW — newest snapshot held, nothing read between" :
                   `playhead settled at ${tape.interpMs.toFixed(0)}ms`) + "\n");
let worst = 0;
for (const k of Object.keys(watch)) {
  const frozen = total[k] ? (still[k] / total[k]) * 100 : 0;
  worst = Math.max(worst, frozen);
  // The biggest single hop, as a share of the average one: a world that only
  // moves when a snapshot lands is flat, flat, then a hop several times the
  // size of a smooth step.
  const p50 = pct(steps[k], 0.5), p99 = pct(steps[k], 0.99);
  console.log(`  ${k.padEnd(16)} frozen ${frozen.toFixed(1)}%   ` +
              `step p50 ${p50.toFixed(4)}  p99 ${p99.toFixed(4)}  ` +
              `(p99 is ${p50 ? (p99 / p50).toFixed(1) : "-"}x the usual)`);
}

/* At 60 frames against 30 snapshots, a world that is not read between is
 * frozen on every other frame — fifty per cent. Anything near that is the bug
 * back. A little is expected and fine: the playhead can sit still for a frame
 * when a snapshot arrives early. */
const ok = RAW ? worst > 30 : worst < 12;
console.log(`\n${ok ? "INTERP OK" : "INTERP FAIL"} — worst frozen ${worst.toFixed(1)}%` +
            (RAW ? " (raw must be OVER 30, or this test proves nothing)" : " (< 12)"));
process.exit(ok ? 0 : 1);
