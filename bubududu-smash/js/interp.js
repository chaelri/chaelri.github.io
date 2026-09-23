// The remote world, read back a moment late.
//
// Everything a client does not simulate — the other player, the squad, Dudu,
// the wild fairy, the bullets — arrives in snapshots and is drawn BETWEEN
// them, at a playhead held a little way behind the newest one. Both ends of
// every step are places the server actually put something, so this is smooth
// and correct at the same time. Extrapolation is the alternative and it is at
// its worst at the one moment you are looking hardest: the turn, the landing,
// the hit, where everything you know about someone says they are still going
// the way they were.
//
// This lives on its own, away from netclient.js, because it is the part of
// the netcode with no sockets and no DOM in it — which means it can be run
// against a synthetic feed in Node and actually MEASURED. It went unmeasured
// for a long time, and for all of that time the only thing being interpolated
// was the other player: the squad, Dudu and the fairy were taken outright
// from each snapshot and then held still until the next, so they moved at the
// snapshot rate and not the screen's. See server/interptest.mjs.

/** One body, reduced to the fields a drawn pose is made of. */
export const body = (b) => ({
  x: b.x, y: b.y, face: b.face, walk: b.walk, squash: b.squash,
  t: b.t || 0, grounded: !!b.grounded, dead: !!b.dead,
});

/* A pair that cannot be the same thing is not read between.
 *
 * The squad and the helpers are matched by their place in the list, because
 * that is all the wire carries — and the list shifts the moment one of them
 * leaves, which would pair a mini with its neighbour and slide it across the
 * arena. A respawn does the same thing honestly. Either way, more than a
 * couple of tiles apart in a thirtieth of a second is not motion, so the
 * newer frame is taken outright and the glitch lasts nothing. */
const APART = 2.2;

function put(a, f, vx, vy) {
  a.x = f.x; a.y = f.y; a.face = f.face; a.walk = f.walk;
  a.squash = f.squash; a.grounded = f.grounded;
  if (f.t !== undefined) a.t = f.t;
  a.vx = vx || 0; a.vy = vy || 0;
}

function lerpBody(a, p, q, k, per) {
  if (!a || !p || !q) return;
  if (Math.abs(q.x - p.x) > APART || Math.abs(q.y - p.y) > APART) return void put(a, q, 0, 0);
  put(a, {
    x: p.x + (q.x - p.x) * k,
    y: p.y + (q.y - p.y) * k,
    // The walk cycle is distance covered, so it reads between like a
    // position; the facing is a direction and snaps to whichever end of the
    // pair we are nearer.
    walk: p.walk + (q.walk - p.walk) * k,
    squash: p.squash + (q.squash - p.squash) * k,
    t: p.t + (q.t - p.t) * k,
    face: k < 0.5 ? p.face : q.face,
    grounded: k < 0.5 ? p.grounded : q.grounded,
  },
  /* Velocity is DERIVED from the two frames, never sent.
   *
   * The renderer leans the body, kicks dust and picks the run weighting off
   * it, so a velocity that disagreed with the motion on screen would be a
   * character sprinting on the spot — or sliding along with its legs still.
   * Taken from the same pair the position came from, it cannot. */
  (q.x - p.x) * per, (q.y - p.y) * per);
}

/**
 * How far behind to run the playhead — measured, not assumed.
 *
 * It has to cover the longest gap between two snapshots, or the playhead runs
 * off the end of the tape and the whole remote world freezes until the next
 * one lands. A fixed tenth of a second covers a bad phone network and spends
 * that tenth of a second on a good one for nothing. So it is read off the
 * gaps that are actually arriving, and it EASES: a delay that jumps is a
 * delay you can see, because the world briefly runs fast or slow.
 */
export const INTERP_MIN = 55;
export const INTERP_MAX = 180;
const EASE_MS = 1.5;        // most it may move per snapshot

export function createWorldTape({ max = 32, start = 100 } = {}) {
  const frames = [];
  const gaps = [];
  const tape = {
    frames,
    interpMs: start,

    reset() { frames.length = 0; gaps.length = 0; },

    /** @param view a hydrated snapshot @param at when it arrived, ms */
    record(view, at) {
      if (frames.length) {
        gaps.push(at - frames[frames.length - 1].at);
        if (gaps.length > 40) gaps.shift();
        if (gaps.length >= 8) {
          const sorted = [...gaps].sort((a, b) => a - b);
          const p90 = sorted[Math.floor(sorted.length * 0.9)];
          const want = Math.max(INTERP_MIN, Math.min(INTERP_MAX, p90 * 1.5 + 15));
          tape.interpMs += Math.max(-EASE_MS, Math.min(EASE_MS, want - tape.interpMs));
        }
      }
      frames.push({
        at,
        actors: view.actors.map((a) => ({ id: a.id, b: body(a) })),
        minis: view.minis.map((m) => body(m.actor)),
        helpers: view.helpers.map((h) => body(h.actor)),
        wild: view.wildFairy ? { x: view.wildFairy.x, y: view.wildFairy.y } : null,
        // Bullets carry the one thing that names them across snapshots: who
        // fired, and when. Index would not do — they spawn and die constantly.
        shots: view.shots.map((s) => ({
          key: `${s.owner}|${(s.born || 0).toFixed(2)}`, x: s.x, y: s.y,
        })),
      });
      while (frames.length > max) frames.shift();
    },

    /**
     * Write the world as it was `interpMs` ago into G.
     *
     * Running off either end of the tape holds that end rather than inventing
     * a frame. A stalled picture for a few frames is a dropped packet; a
     * picture that keeps walking into a wall is a lie.
     *
     * @param skip the role this client predicts for itself — never touched.
     */
    apply(G, now, skip) {
      if (!frames.length || !G) return false;
      const at = now - tape.interpMs;
      let hi = -1;
      for (let i = frames.length - 1; i >= 0; i--) if (frames[i].at <= at) { hi = i; break; }
      let p, q, k, per;
      if (hi < 0) { p = q = frames[0]; k = 0; per = 0; }
      else if (hi >= frames.length - 1) { p = q = frames[frames.length - 1]; k = 0; per = 0; }
      else {
        p = frames[hi]; q = frames[hi + 1];
        const span = q.at - p.at;
        k = span > 0 ? Math.min(1, Math.max(0, (at - p.at) / span)) : 0;
        per = span > 0 ? 1000 / span : 0;
      }

      for (const a of G.actors) {
        if (a.id === skip) continue;
        const was = p.actors.find((e) => e.id === a.id);
        const now2 = q.actors.find((e) => e.id === a.id);
        lerpBody(a, was && was.b, now2 && now2.b, k, per);
      }
      for (let i = 0; i < G.minis.length; i++) {
        lerpBody(G.minis[i].actor, p.minis[i], q.minis[i], k, per);
      }
      for (let i = 0; i < G.helpers.length; i++) {
        lerpBody(G.helpers[i].actor, p.helpers[i], q.helpers[i], k, per);
      }
      if (G.wildFairy && p.wild && q.wild) {
        const far = Math.abs(q.wild.x - p.wild.x) > APART || Math.abs(q.wild.y - p.wild.y) > APART;
        G.wildFairy.x = far ? q.wild.x : p.wild.x + (q.wild.x - p.wild.x) * k;
        G.wildFairy.y = far ? q.wild.y : p.wild.y + (q.wild.y - p.wild.y) * k;
      }
      // A bullet only in the newer frame has just been fired, and stays where
      // it is until there is a pair to read between.
      if (p !== q && G.shots.length) {
        const was = new Map(p.shots.map((s) => [s.key, s]));
        const isNow = new Map(q.shots.map((s) => [s.key, s]));
        for (const s of G.shots) {
          const key = `${s.owner}|${(s.born || 0).toFixed(2)}`;
          const a0 = was.get(key), a1 = isNow.get(key);
          if (!a0 || !a1) continue;
          s.x = a0.x + (a1.x - a0.x) * k;
          s.y = a0.y + (a1.y - a0.y) * k;
        }
      }
      return true;
    },
  };
  return tape;
}
