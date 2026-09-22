// Turning a live round into something small enough to send 15-20 times a
// second, and back again.
//
// Only the host simulates. The guest phone receives these and draws them with
// the same render.js the host uses, so there is exactly one copy of the art
// and one copy of the layout rules. Nothing here is authoritative on the
// guest's side — it is a picture, not a game state.
//
// Everything is arrays rather than objects, and every number is rounded to
// two decimals. On a WebRTC channel none of that matters; on the Firebase
// relay lane it is the difference between a playable game on mobile data and
// a slideshow, because that payload is written and read over the public
// internet on every single tick.

import { PLAYERS } from "./config.js";
import { charById } from "./characters.js";
import { poseOf } from "./physics.js";

const r2 = (n) => Math.round(n * 100) / 100;
const bit = (v) => (v ? 1 : 0);

/* --------------------------------------------------------------- actor --- */
// [id, char, x, y, vx, vy, face, walk, squash, t, grounded, hp, dead, respawn,
//  w, h, powerType, ammo, until, invulnUntil, frozenUntil, reversedUntil,
//  coins, fairy, punch, glowUntil, glowFor, glowColour]

function packActor(a, now) {
  return [
    a.id, a.char, r2(a.x), r2(a.y), r2(a.vx), r2(a.vy), a.face,
    r2(a.walk), r2(a.squash), r2(a.t), bit(a.grounded),
    a.hp, bit(a.dead), r2(a.respawn || 0), r2(a.w), r2(a.h),
    a.power ? a.power.type : 0,
    a.power ? a.power.ammo || 0 : 0,
    // Deadlines travel as time REMAINING, not as absolute times. The two
    // phones do not share a clock, and a timestamp from the host's clock read
    // against the guest's makes every bar either full or empty.
    a.power && a.power.until !== Infinity ? r2(Math.max(0, a.power.until - now)) : -1,
    r2(Math.max(0, (a.invulnUntil || 0) - now)),
    r2(Math.max(0, (a.frozenUntil || 0) - now)),
    r2(Math.max(0, (a.reversedUntil || 0) - now)),
    a.coins || 0,
    a.fairy ? [a.fairy.left, r2(Math.max(0, a.fairy.next - now)),
               a.fairy.healAt >= 0 ? r2(now - a.fairy.healAt) : -1,
               bit(a.fairy.leaving), r2(a.fairy.wave), r2(a.fairy.phase)] : 0,
    a.punch ? [r2(now - a.punch.at), a.punch.face, bit(a.punch.hit),
               a.punch.blastAt != null ? r2(now - a.punch.blastAt) : -1] : 0,
    r2(Math.max(0, (a.glowUntil || 0) - now)),
    a.glowFor || 0,
    a.glowColour || 0,
  ];
}

function unpackActor(v, now) {
  const [id, char, x, y, vx, vy, face, walk, squash, t, grounded, hp, dead,
    respawn, w, h, ptype, ammo, puntil, inv, frozen, reversed, coins,
    fairy, punch, glowLeft, glowFor, glowColour] = v;
  const p = PLAYERS.find((q) => q.id === id);
  return {
    id, char, x, y, vx, vy, face, walk, squash, t,
    grounded: !!grounded, hp, dead: !!dead, respawn, w, h,
    // The REAL stats for this character, looked up rather than sent: they are
    // per-character constants both sides already have, and the guest predicts
    // its own movement with them. An empty object here is what made that
    // prediction produce NaN.
    stats: { ...(charById(char).stats || {}) },
    tint: p ? p.colour : "#fff",
    label: p ? p.name : id,
    power: ptype ? { type: ptype, ammo, until: puntil < 0 ? Infinity : now + puntil } : null,
    invulnUntil: inv > 0 ? now + inv : 0,
    frozenUntil: frozen > 0 ? now + frozen : 0,
    reversedUntil: reversed > 0 ? now + reversed : 0,
    coins,
    fairy: fairy
      ? { left: fairy[0], next: now + fairy[1], healAt: fairy[2] < 0 ? -1 : now - fairy[2],
          leaving: !!fairy[3], wave: fairy[4], phase: fairy[5] }
      : null,
    punch: punch
      ? { at: now - punch[0], face: punch[1], hit: !!punch[2],
          blastAt: punch[3] != null && punch[3] >= 0 ? now - punch[3] : null }
      : null,
    glowUntil: glowLeft > 0 ? now + glowLeft : 0,
    glowFor: glowFor || 0,
    glowColour: glowColour || null,
  };
}

/* ------------------------------------------------------------ helpers --- */
// Dudu and the squad are drawn from a pose, so they need the same body fields
// a player does — but never health, power-ups or any of the rest.

const packBody = (b) => {
  const p = poseOf(b);
  return [r2(b.x), r2(b.y), r2(b.vx), r2(b.vy), p.face, r2(p.walk), r2(p.squash),
          r2(p.t), bit(b.grounded), r2(b.w), r2(b.h), bit(b.dead)];
};

const unpackBody = (v) => ({
  x: v[0], y: v[1], vx: v[2], vy: v[3], face: v[4], walk: v[5], squash: v[6],
  t: v[7], grounded: !!v[8], w: v[9], h: v[10], dead: !!v[11], stats: {},
});

/* ------------------------------------------------------------ the wire --- */

/**
 * A whole round, flattened.
 *
 * The tilemap is the one big thing here, and it CHANGES — the arena eats its
 * own floor inward all round — so it cannot be sent once at the start. It is
 * sent as rows of text, which compress well and are usually identical between
 * ticks; `rowsEqual` below lets the sender skip them entirely when nothing
 * has crumbled since the last tick.
 */
export function snapshot(G, extra = {}) {
  const now = G.time;
  return {
    t: r2(now),
    lw: G.level.w,
    lh: G.level.h,
    rows: G.grid.rows,
    a: G.actors.map((a) => packActor(a, now)),
    pw: G.powers.map((q) => [r2(q.x), r2(q.y), q.type, r2(now - q.born)]),
    cn: G.coins.map((c) => [r2(c.x), r2(c.y), c.taken ? r2(now - c.taken) : 0,
                            c.n || 0, c.by || 0, bit(c.milestone)]),
    sh: G.shots.map((s) => [r2(s.x), r2(s.y), r2(s.vx), s.owner]),
    bu: G.bursts.map((b) => [r2(b.x), r2(b.y), r2(now - b.at), b.colour, bit(b.big)]),
    po: G.pops.map((p) => [r2(p.x), r2(p.y), r2(now - p.at), p.colour, p.glyph || ""]),
    lh2: G.lostHearts.map((h) => [r2(h.x), r2(h.y), r2(h.rot), r2(now - h.at), h.index]),
    mi: G.minis.map((m) => [packBody(m.actor), m.owner || 0, bit(m.leaving),
                            r2(m.wave), r2(Math.max(0, m.until - now))]),
    wf: G.wildFairy
      ? [r2(G.wildFairy.x), r2(G.wildFairy.y), r2(G.wildFairy.phase),
         G.wildFairy.face, bit(G.wildFairy.leaving), r2(G.wildFairy.wave)]
      : 0,
    // A LIST now: a bought Dudu no longer deletes the wild one, so there can
    // be several on the field at once.
    he: G.helpers.map((h) =>
      [packBody(h.actor), h.ally || 0, bit(h.bad),
       bit(h.leaving), r2(h.wave), bit(h.locked),
       bit(h.waiting), r2(Math.max(0, h.until - now)),
       h.betrayAt != null ? r2(now - h.betrayAt) : -1,
       bit(h.thrown), h.victim || 0]),
    ...extra,
  };
}

/** Rebuild something render.js is happy to draw. */
export function hydrate(s) {
  const now = s.t;
  /* Helpers: a list now, but tolerate the old single packed helper so a phone
   * running a cached build does not black-screen on its first snapshot.
   *
   * The discriminator has to look TWO deep. Both shapes have an array at [0]
   * — the old one's is the packed body, the new one's is a whole packed
   * helper — so `Array.isArray(he[0])` says nothing. And the empty case is
   * the one that actually bit: `[] ? [[]] : []` takes the truthy branch,
   * because an empty array is truthy, so NO helpers on the field became ONE
   * helper made of nothing and hydrate threw on it. That is every snapshot in
   * which no Dudu happens to be out, which is most of them — and a throw here
   * means the guest never applies the frame at all. */
  /* Every list defaults to empty.
   *
   * A field can legitimately be absent: Firebase RTDB stores an empty array
   * as null, so on the relay lane `pw: []` comes back undefined, and a sender
   * one version ahead may simply not send something. Reading `.map` off that
   * throws — and a throw here means the guest applies no frame at all, so the
   * whole picture goes for one missing bullet list. */
  const A = (v) => (Array.isArray(v) ? v : []);

  const he = s.he;
  const rows =
    !he || !he.length ? []
    : Array.isArray(he[0]) && Array.isArray(he[0][0]) ? he
    : [he];
  const helpers = rows.map((v) => ({
    actor: unpackBody(v[0]),
    ally: v[1] || null,
    bad: !!v[2],
    leaving: !!v[3],
    wave: v[4],
    locked: !!v[5],
    waiting: !!v[6],
    until: now + v[7],
    betrayAt: v[8] < 0 ? null : now - v[8],
    thrown: !!v[9],
    victim: v[10] || null,
  }));

  return {
    time: now,
    level: { w: s.lw, h: s.lh },
    grid: { rows: s.rows },
    actors: A(s.a).map((v) => unpackActor(v, now)),
    powers: A(s.pw).map(([x, y, type, age]) => ({ x, y, type, born: now - age })),
    coins: A(s.cn).map(([x, y, taken, n, by, milestone]) => ({
      x, y, taken: taken ? now - taken : 0, n, by: by || null, milestone: !!milestone,
    })),
    shots: A(s.sh).map(([x, y, vx, owner]) => ({ x, y, vx, vy: 0, owner, life: 1 })),
    bursts: A(s.bu).map(([x, y, age, colour, big]) => ({ x, y, at: now - age, colour, big: !!big })),
    pops: A(s.po).map(([x, y, age, colour, glyph]) => ({ x, y, at: now - age, colour, glyph })),
    lostHearts: A(s.lh2).map(([x, y, rot, age, index]) => ({
      x, y, rot, at: now - age, index, vx: 0, vy: 0, spin: 0,
    })),
    wildFairy: s.wf
      ? { x: s.wf[0], y: s.wf[1], phase: s.wf[2], face: s.wf[3],
          leaving: !!s.wf[4], wave: s.wf[5] }
      : null,
    minis: A(s.mi).map(([body, owner, leaving, wave, until]) => ({
      actor: unpackBody(body), owner: owner || null,
      leaving: !!leaving, wave, until: now + until,
    })),
    helpers,
  };
}

/** Cheap "has the arena crumbled since last tick" test. */
export const rowsEqual = (a, b) =>
  !!a && !!b && a.length === b.length && a.every((r, i) => r === b[i]);
