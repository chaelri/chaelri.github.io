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
    a.punch ? [r2(now - a.punch.at), a.punch.face, bit(a.punch.hit)] : 0,
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
    stats: {},                       // pose only needs stride, which sprites default
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
    punch: punch ? { at: now - punch[0], face: punch[1], hit: !!punch[2] } : null,
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
    he: G.helper
      ? [packBody(G.helper.actor), G.helper.ally || 0, bit(G.helper.bad),
         bit(G.helper.leaving), r2(G.helper.wave), bit(G.helper.locked),
         bit(G.helper.waiting), r2(Math.max(0, G.helper.until - now)),
         G.helper.betrayAt != null ? r2(now - G.helper.betrayAt) : -1,
         bit(G.helper.thrown), G.helper.victim || 0]
      : 0,
    ...extra,
  };
}

/** Rebuild something render.js is happy to draw. */
export function hydrate(s) {
  const now = s.t;
  const helper = s.he
    ? {
        actor: unpackBody(s.he[0]),
        ally: s.he[1] || null,
        bad: !!s.he[2],
        leaving: !!s.he[3],
        wave: s.he[4],
        locked: !!s.he[5],
        waiting: !!s.he[6],
        until: now + s.he[7],
        betrayAt: s.he[8] < 0 ? null : now - s.he[8],
        thrown: !!s.he[9],
        victim: s.he[10] || null,
      }
    : null;

  return {
    time: now,
    level: { w: s.lw, h: s.lh },
    grid: { rows: s.rows },
    actors: s.a.map((v) => unpackActor(v, now)),
    powers: s.pw.map(([x, y, type, age]) => ({ x, y, type, born: now - age })),
    coins: s.cn.map(([x, y, taken, n, by, milestone]) => ({
      x, y, taken: taken ? now - taken : 0, n, by: by || null, milestone: !!milestone,
    })),
    shots: s.sh.map(([x, y, vx, owner]) => ({ x, y, vx, vy: 0, owner, life: 1 })),
    bursts: s.bu.map(([x, y, age, colour, big]) => ({ x, y, at: now - age, colour, big: !!big })),
    pops: s.po.map(([x, y, age, colour, glyph]) => ({ x, y, at: now - age, colour, glyph })),
    lostHearts: s.lh2.map(([x, y, rot, age, index]) => ({
      x, y, rot, at: now - age, index, vx: 0, vy: 0, spin: 0,
    })),
    minis: s.mi.map(([body, owner, leaving, wave, until]) => ({
      actor: unpackBody(body), owner: owner || null,
      leaving: !!leaving, wave, until: now + until,
    })),
    helper,
  };
}

/** Cheap "has the arena crumbled since last tick" test. */
export const rowsEqual = (a, b) =>
  !!a && !!b && a.length === b.length && a.every((r, i) => r === b[i]);
