// The simulation. Runs only on the screen (the MacBook); the phones never see
// any of this. One authoritative copy means the two controllers can never
// disagree about where anything is.

import { TUNING as T } from "./config.js";
import { LEVELS } from "./levels.js";
import {
  angDiff,
  approach,
  approachAngle,
  circleSegmentPush,
  circleSegments,
  clamp,
  isOccluded,
  lerp,
  pointInRect,
  rectSegments,
} from "./geom.js";

/* ------------------------------------------------------------- build --- */

export function createGame(levelIndex = 0) {
  const level = LEVELS[clamp(levelIndex, 0, LEVELS.length - 1)];

  // Occluders: the outer wall, every block, every pillar. Voids are holes in
  // the floor, not walls — light crosses them freely, which is the only reason
  // a shadow can ever fall across one.
  const segments = [];
  const b = level.bounds;
  segments.push(...rectSegments(b.x, b.y, b.w, b.h));
  for (const r of level.blocks) segments.push(...rectSegments(r.x, r.y, r.w, r.h));
  for (const p of level.pillars) segments.push(...circleSegments(p.x, p.y, p.r, 14));

  const g = {
    level,
    levelIndex,
    segments,
    time: 0,
    status: "play", // play | won | lost

    walker: {
      x: level.start[0],
      y: level.start[1],
      vx: 0,
      vy: 0,
      safeX: level.start[0],
      safeY: level.start[1],
      teeter: 0,
      invuln: 0,
      falling: 0,
      facing: 0,
    },

    lanterns: level.lanterns.map((l, i) => ({
      x: l.x,
      y: l.y,
      found: i === 0, // only the first one is burning at the start
      active: i === 0,
      spark: 0,
    })),
    carried: true, // she starts with it in her hands

    light: {
      x: level.start[0],
      y: level.start[1],
      angle: 0,
      half: T.beamHalfAngle,
      range: T.beamRange,
      focus: 0,
      flareUntil: 0,
      flareReadyAt: 0,
    },

    shards: level.shards.map(([x, y]) => ({ x, y, taken: false, bob: Math.random() * 6 })),
    creatures: level.spawns.map(([x, y], i) => ({
      x,
      y,
      hx: x, // home, for respawns
      hy: y,
      hp: T.creatureHp,
      alive: true,
      respawnAt: 0,
      wob: i * 1.7,
      lit: 0,
    })),

    hearts: T.hearts,
    exit: { x: level.exit[0], y: level.exit[1], open: false, pulse: 0 },

    // Transient things the renderer wants to react to. Cleared each step.
    events: [],
  };

  syncLight(g, 0, true);
  return g;
}

export const shardsLeft = (g) => g.shards.filter((s) => !s.taken).length;
export const activeLantern = (g) => g.lanterns.find((l) => l.active) || g.lanterns[0];

/* --------------------------------------------------------- predicates --- */

/** Is this world point inside the beam's reach right now? (ignores occluders) */
function inCone(g, x, y) {
  const L = g.light;
  const dx = x - L.x;
  const dy = y - L.y;
  const d = Math.hypot(dx, dy);
  if (d > L.range) return false;
  if (d < 0.35) return true; // standing on the lantern
  return Math.abs(angDiff(Math.atan2(dy, dx), L.angle)) <= L.half;
}

/** Fully lit: in the beam and nothing in the way. */
export function isLit(g, x, y) {
  if (isFlareLit(g, x, y)) return true;
  if (!inCone(g, x, y)) return false;
  return !isOccluded(g.light.x, g.light.y, x, y, g.segments);
}

/**
 * The flare is a burst out of the lantern in every direction. It deliberately
 * does NOT create or destroy shadows — if it did, popping a flare while she
 * was halfway across a shadow bridge would drop her into the dark, which felt
 * like a betrayal rather than a mistake.
 */
export function isFlareLit(g, x, y) {
  if (g.time > g.light.flareUntil) return false;
  const d = Math.hypot(x - g.light.x, y - g.light.y);
  if (d > T.flareRadius) return false;
  return !isOccluded(g.light.x, g.light.y, x, y, g.segments);
}

/**
 * The umbra: inside the beam, but with something blocking the way. This is the
 * only thing in the game that is solid ground over a chasm.
 */
export function inCastShadow(g, x, y) {
  if (!inCone(g, x, y)) return false;
  return isOccluded(g.light.x, g.light.y, x, y, g.segments);
}

export function overVoid(g, x, y) {
  for (const v of g.level.voids) if (pointInRect(x, y, v)) return true;
  return false;
}

/* ---------------------------------------------------------------- sim --- */

function syncLight(g, dt, snap = false) {
  const L = g.light;
  const lan = activeLantern(g);

  // Where the light comes from: her hands, or wherever she put it down.
  const tx = g.carried ? g.walker.x : lan.x;
  const ty = g.carried ? g.walker.y : lan.y;
  if (snap) {
    L.x = tx;
    L.y = ty;
  } else {
    // A touch of lag so a placed lantern feels like it has weight and a
    // carried one swings slightly behind her.
    L.x = approach(L.x, tx, 22, dt);
    L.y = approach(L.y, ty, 22, dt);
  }
  if (g.carried) {
    lan.x = g.walker.x;
    lan.y = g.walker.y;
  }
}

export function step(g, dt, input) {
  g.events.length = 0;
  if (g.status !== "play") return g;

  g.time += dt;
  const W = g.walker;
  const L = g.light;
  const ilaw = input.ilaw || {};
  const anino = input.anino || {};

  /* -- the light player -------------------------------------------------- */

  if (typeof ilaw.angle === "number" && Number.isFinite(ilaw.angle)) {
    // Smoothed rather than snapped: gyro is noisy at rest and a jittering
    // beam edge is very visible against pure black.
    L.angle = approachAngle(L.angle, ilaw.angle, 24, dt);
  }
  const wantFocus = clamp(ilaw.focus || 0, 0, 1);
  L.focus = approach(L.focus, wantFocus, T.focusLerp, dt);
  L.half = lerp(T.beamHalfAngle, T.beamHalfAngleFocused, L.focus);
  L.range = lerp(T.beamRange, T.beamRangeFocused, L.focus);

  if (ilaw.flare && g.time * 1000 >= L.flareReadyAt) {
    L.flareUntil = g.time + T.flareMs / 1000;
    L.flareReadyAt = (g.time + T.flareCooldownMs / 1000) * 1000;
    g.events.push({ t: "flare" });
  }

  /* -- the walker -------------------------------------------------------- */

  let mx = clamp(anino.mx || 0, -1, 1);
  let my = clamp(anino.my || 0, -1, 1);
  const mag = Math.hypot(mx, my);
  if (mag > 1) {
    mx /= mag;
    my /= mag;
  }
  if (mag > 0.08) W.facing = Math.atan2(my, mx);

  const targetVx = mx * T.walkSpeed;
  const targetVy = my * T.walkSpeed;
  W.vx = approach(W.vx, targetVx, T.walkAccel, dt);
  W.vy = approach(W.vy, targetVy, T.walkAccel, dt);
  W.x += W.vx * dt;
  W.y += W.vy * dt;

  // Walls. One push-out pass per segment; she is small and slow enough that
  // this never tunnels.
  for (const s of g.segments) {
    const push = circleSegmentPush(W.x, W.y, T.walkRadius, s);
    if (push) {
      W.x += push[0];
      W.y += push[1];
    }
  }

  /* -- picking the lantern up and putting it down ------------------------ */

  // Walking into an unlit lantern wakes it. No button for this: finding the
  // second light should feel like it happened to you, not like a menu.
  for (const lan of g.lanterns) {
    if (lan.found) continue;
    if (Math.hypot(lan.x - W.x, lan.y - W.y) < 1.1) {
      for (const other of g.lanterns) other.active = false;
      lan.found = true;
      lan.active = true;
      lan.spark = 1;
      g.carried = true;
      syncLight(g, 0, true);
      g.events.push({ t: "newLantern", x: lan.x, y: lan.y });
    }
  }

  const act = !!anino.act;
  const actEdge = act && !g._prevAct;
  g._prevAct = act;

  if (actEdge) {
    const lan = activeLantern(g);
    if (g.carried) {
      // Never let her set it down over a hole — it would be unrecoverable.
      if (!overVoid(g, W.x, W.y)) {
        g.carried = false;
        lan.x = W.x;
        lan.y = W.y;
        g.events.push({ t: "place", x: lan.x, y: lan.y });
      }
    } else if (Math.hypot(lan.x - W.x, lan.y - W.y) < 1.4) {
      g.carried = true;
      g.events.push({ t: "take" });
    }
  }

  syncLight(g, dt);

  /* -- the floor, or the lack of it -------------------------------------- */

  if (W.invuln > 0) W.invuln -= dt;

  const hole = overVoid(g, W.x, W.y);
  const bridged = hole && inCastShadow(g, W.x, W.y);
  if (hole && !bridged) {
    W.teeter += dt;
    if (W.teeter >= T.teeterMs / 1000) {
      fall(g);
    }
  } else {
    W.teeter = Math.max(0, W.teeter - dt * 2.5);
    if (!hole) {
      W.safeX = W.x;
      W.safeY = W.y;
    }
  }

  /* -- shards and the door ----------------------------------------------- */

  for (const s of g.shards) {
    if (s.taken) continue;
    s.bob += dt;
    if (Math.hypot(s.x - W.x, s.y - W.y) < 1.0) {
      s.taken = true;
      g.events.push({ t: "shard", x: s.x, y: s.y });
    }
  }
  g.exit.open = shardsLeft(g) === 0;
  g.exit.pulse += dt * (g.exit.open ? 3 : 1);
  if (g.exit.open && Math.hypot(g.exit.x - W.x, g.exit.y - W.y) < 1.3) {
    g.status = "won";
    g.events.push({ t: "won" });
  }

  /* -- anino ------------------------------------------------------------- */

  const lan = activeLantern(g);
  const strayed = Math.hypot(W.x - lan.x, W.y - lan.y);
  const boldness = clamp(strayed / T.creatureFarDist, 0, 1);
  const speed = lerp(T.creatureSpeed, T.creatureSpeedFar, boldness);

  for (const c of g.creatures) {
    if (!c.alive) {
      if (g.time * 1000 >= c.respawnAt) {
        c.alive = true;
        c.hp = T.creatureHp;
        c.x = c.hx;
        c.y = c.hy;
      }
      continue;
    }

    c.wob += dt;
    const litNow = isLit(g, c.x, c.y);
    c.lit = approach(c.lit, litNow ? 1 : 0, 12, dt);

    if (litNow) {
      c.hp -= T.creatureBurnRate * dt;
      // Recoil directly away from the lantern — the light shoves as well as
      // burns, which is what makes sweeping feel like doing something.
      const ax = c.x - g.light.x;
      const ay = c.y - g.light.y;
      const d = Math.hypot(ax, ay) || 1;
      c.x += (ax / d) * speed * 1.4 * dt;
      c.y += (ay / d) * speed * 1.4 * dt;
      if (c.hp <= 0) {
        c.alive = false;
        c.respawnAt = (g.time + T.creatureRespawnMs / 1000) * 1000;
        g.events.push({ t: "burn", x: c.x, y: c.y });
        continue;
      }
    } else {
      c.hp = Math.min(T.creatureHp, c.hp + T.creatureHealRate * dt);
      const ax = W.x - c.x;
      const ay = W.y - c.y;
      const d = Math.hypot(ax, ay) || 1;
      // A little wander so they do not march in a dead-straight line.
      const wob = Math.sin(c.wob * 1.3) * 0.35;
      c.x += ((ax / d) * speed + -(ay / d) * wob) * dt;
      c.y += ((ay / d) * speed + (ax / d) * wob) * dt;
    }

    for (const s of g.segments) {
      const push = circleSegmentPush(c.x, c.y, T.creatureRadius, s);
      if (push) {
        c.x += push[0];
        c.y += push[1];
      }
    }

    if (
      W.invuln <= 0 &&
      Math.hypot(c.x - W.x, c.y - W.y) < T.walkRadius + T.creatureRadius
    ) {
      hurt(g, "touched");
      const ax = W.x - c.x;
      const ay = W.y - c.y;
      const d = Math.hypot(ax, ay) || 1;
      W.vx = (ax / d) * 11;
      W.vy = (ay / d) * 11;
    }
  }

  return g;
}

function fall(g) {
  const W = g.walker;
  W.teeter = 0;
  W.x = W.safeX;
  W.y = W.safeY;
  W.vx = 0;
  W.vy = 0;
  g.events.push({ t: "fall" });
  // She is always pulled back to solid ground, but only pays for it if the
  // mercy window from the last knock has run out — otherwise walking back
  // into a chasm you cannot see yet costs a heart a second.
  hurt(g, "fell", true);
}

/** `quiet` suppresses the duplicate event, never the invulnerability check. */
function hurt(g, reason, quiet = false) {
  const W = g.walker;
  if (W.invuln > 0) return;
  g.hearts -= 1;
  W.invuln = T.invulnMs / 1000;
  if (!quiet) g.events.push({ t: "hurt", reason });
  if (g.hearts <= 0) {
    g.hearts = 0;
    g.status = "lost";
    g.events.push({ t: "lost" });
  }
}

/**
 * Advance only the beam and the clock — used while a title card is up.
 *
 * The screen should never freeze: a still image of a dark room reads as a
 * crash. The light keeps sweeping behind the card, but nothing can move,
 * catch fire or fall while she cannot act.
 */
export function idle(g, dt, input) {
  g.time += dt;
  const L = g.light;
  const ilaw = input.ilaw || {};
  if (Number.isFinite(ilaw.angle)) L.angle = approachAngle(L.angle, ilaw.angle, 18, dt);
  const wantFocus = clamp(ilaw.focus || 0, 0, 1);
  L.focus = approach(L.focus, wantFocus, T.focusLerp, dt);
  L.half = lerp(T.beamHalfAngle, T.beamHalfAngleFocused, L.focus);
  L.range = lerp(T.beamRange, T.beamRangeFocused, L.focus);
  syncLight(g, dt);
  g.exit.pulse += dt;
  for (const s of g.shards) s.bob += dt;
  for (const c of g.creatures) c.wob += dt;
}
