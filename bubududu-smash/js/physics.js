// Platformer physics. Tile grid, axis-separated collision, and all the little
// forgiveness rules that decide whether a jump feels like yours or like the
// game ignoring you.

import { FEEL, GRAVITY, JUMP_VELOCITY } from "./config.js";

export const SOLID = "#";
export const ONEWAY = "=";
export const HAZARD = "^";

export function makeActor(x, y, id) {
  return {
    id,
    x,
    y, // y is the actor's FEET; everything draws upward from here
    vx: 0,
    vy: 0,
    w: FEEL.width,
    h: FEEL.height,
    face: 1,
    grounded: false,
    groundedOn: null, // "tile" | actor id
    coyote: 0,
    buffer: 0,
    jumpHeld: false,
    dead: false,
    respawn: 0,
    squash: 0,
    launchFor: 0,   // seconds of no control after being hit hard
    t: 0,
    // Distance walked, not time elapsed. Animation driven off a clock times a
    // speed factor jumps every time that factor changes, which is what made
    // the walk cycles stutter under acceleration.
    walk: 0,
    stats: { jump: 1, speed: 1, accel: 1, stride: 1 },
    justStomped: null,
  };
}

/* ----------------------------------------------------------- the grid --- */

export function tileAt(level, tx, ty) {
  if (ty < 0 || ty >= level.rows.length) return ".";
  const row = level.rows[ty];
  if (tx < 0 || tx >= row.length) return ty >= level.rows.length - 1 ? "." : "#";
  return row[tx];
}

const isSolid = (c) => c === SOLID;
const isOneWay = (c) => c === ONEWAY;

/** Does this box overlap any solid tile? One-ways are handled separately. */
function boxHitsSolid(level, x, y, w, h) {
  const x0 = Math.floor(x - w / 2);
  const x1 = Math.floor(x + w / 2 - 1e-6);
  const y0 = Math.floor(y - h);
  const y1 = Math.floor(y - 1e-6);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) if (isSolid(tileAt(level, tx, ty))) return true;
  return false;
}

/**
 * One-way platforms only exist for an actor that is falling and whose feet
 * were above the platform's top edge a moment ago. Anything else and you
 * would snag on them while jumping up through the level.
 */
function oneWayUnder(level, a, prevFeet) {
  if (a.vy < 0) return null;
  const x0 = Math.floor(a.x - a.w / 2);
  const x1 = Math.floor(a.x + a.w / 2 - 1e-6);
  const ty = Math.floor(a.y - 1e-6);
  for (let tx = x0; tx <= x1; tx++) {
    if (!isOneWay(tileAt(level, tx, ty))) continue;
    if (prevFeet <= ty + 1e-4) return ty;
  }
  return null;
}

/* ----------------------------------------------------------- stepping --- */

/**
 * input: { left, right, jumpDown, jumpHeld, dropDown }
 * others: the other actors, for landing on heads.
 */
export function stepActor(a, input, level, dt, others = [], opts = {}) {
  a.t += dt;
  a.walk += Math.abs(a.vx) * dt;
  if (a.dead) {
    a.respawn -= dt;
    return;
  }

  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir !== 0) a.face = dir;

  /* Being hit hard takes the controls away for a moment.
   *
   * This has to bypass the whole horizontal block below, not just soften it.
   * The clamp at the end of it pins vx back to running speed the instant the
   * victim holds a direction, so without this a launch worth thirty tiles a
   * second was cancelled by the player pressing left — and friction ate what
   * was left of it. No steering and no jumping while it lasts; after that
   * they can act again, which leaves a slim chance of catching a ledge.
   */
  const launched = a.launchFor > 0;
  if (launched) a.launchFor -= dt;

  // Horizontal: accelerate toward the target, or brake toward zero.
  const st = a.stats || { jump: 1, speed: 1, accel: 1 };
  const topSpeed = FEEL.runSpeed * st.speed * (a.speedMul || 1);
  const accel = (a.grounded ? FEEL.groundAccel : FEEL.airAccel) * st.accel;
  const friction = a.grounded ? FEEL.groundFriction : FEEL.airFriction;
  if (launched) {
    // carried by whatever put them here
  } else if (dir !== 0) {
    const target = dir * topSpeed;
    // Turning around is sharper than setting off, or direction changes feel
    // like steering a boat.
    const turning = a.vx !== 0 && Math.sign(a.vx) !== Math.sign(target);
    const rate = turning ? accel * 1.8 : accel;
    a.vx += Math.sign(target - a.vx) * rate * dt;
    if (Math.abs(a.vx) > topSpeed) a.vx = target;
  } else {
    const drop = friction * dt;
    a.vx = Math.abs(a.vx) <= drop ? 0 : a.vx - Math.sign(a.vx) * drop;
  }

  // Jump buffering and coyote time: two small mercies that between them
  // account for most of "this game feels tight".
  a.coyote = a.grounded ? FEEL.coyoteMs / 1000 : Math.max(0, a.coyote - dt);
  a.buffer = launched ? 0 : input.jumpDown ? FEEL.bufferMs / 1000 : Math.max(0, a.buffer - dt);

  if (a.buffer > 0 && a.coyote > 0) {
    a.vy = JUMP_VELOCITY * st.jump * (a.jumpMul || 1);
    a.buffer = 0;
    a.coyote = 0;
    a.grounded = false;
    a.groundedOn = null;
    a.squash = -0.22;
    opts.onJump?.(a);
  }

  // Releasing jump on the way up cuts the arc short — once, on the release
  // edge. Applying it per frame compounds and eats the whole jump.
  if (a.jumpHeld && !input.jumpHeld && a.vy < 0) a.vy *= FEEL.shortHopMultiplier;
  a.jumpHeld = !!input.jumpHeld;

  let g = GRAVITY;
  if (a.vy > 0) g *= FEEL.fallMultiplier;
  else if (Math.abs(a.vy) < FEEL.apexThreshold) g *= FEEL.apexMultiplier;
  a.vy = Math.min(a.vy + g * dt, FEEL.maxFall);

  const prevFeet = a.y;

  // --- horizontal move, then resolve
  //
  // Snapped to the tile edge rather than nudged back in small steps. The old
  // back-off left the body a fraction clear of the surface, so a character
  // standing still was technically airborne on most frames and `grounded`
  // flickered — coyote time hid it, but it could still swallow a jump.
  a.x += a.vx * dt;
  if (boxHitsSolid(level, a.x, a.y, a.w, a.h)) {
    if (a.vx > 0) a.x = Math.ceil(a.x + a.w / 2 - 1) - a.w / 2;
    else if (a.vx < 0) a.x = Math.floor(a.x - a.w / 2) + 1 + a.w / 2;
    if (boxHitsSolid(level, a.x, a.y, a.w, a.h)) {
      const step = Math.sign(a.vx) || 1;
      let guard = 0;
      while (boxHitsSolid(level, a.x, a.y, a.w, a.h) && guard++ < 64) a.x -= step * 0.02;
    }
    a.vx = 0;
  }

  // --- vertical move, then resolve
  const wasGrounded = a.grounded;
  a.grounded = false;
  a.groundedOn = null;
  a.y += a.vy * dt;

  if (boxHitsSolid(level, a.x, a.y, a.w, a.h)) {
    if (a.vy > 0) a.y = Math.floor(a.y);                    // feet onto the tile top
    else if (a.vy < 0) a.y = Math.ceil(a.y - a.h) + a.h;    // head under the tile above
    if (boxHitsSolid(level, a.x, a.y, a.w, a.h)) {
      const step = Math.sign(a.vy) || 1;
      let guard = 0;
      while (boxHitsSolid(level, a.x, a.y, a.w, a.h) && guard++ < 64) a.y -= step * 0.02;
    }
    if (a.vy > 0) land(a, "tile", wasGrounded, opts);
    a.vy = 0;
  } else if (!input.dropDown) {
    const ow = oneWayUnder(level, a, prevFeet);
    if (ow !== null) {
      a.y = ow;
      land(a, "tile", wasGrounded, opts);
      a.vy = 0;
    }
  }

  // --- standing on the other one's head
  for (const o of others) {
    if (o === a || o.dead) continue;
    const overlapX = Math.abs(a.x - o.x) < (a.w + o.w) / 2 - 0.06;
    if (!overlapX) continue;
    const myFeet = a.y;
    const theirHead = o.y - o.h;
    const falling = a.vy >= 0;
    const withinWindow = myFeet > theirHead - FEEL.stompWindow && myFeet < theirHead + 0.45;
    if (falling && withinWindow && prevFeet <= theirHead + 0.2) {
      a.vy = -FEEL.stompBounce;
      a.squash = -0.3;
      a.justStomped = o.id;
      opts.onStomp?.(a, o);
    }
  }

  // Hazards and the bottom of the world. Which of the two it was is recorded
  // on the actor, because the round banner names how you died and "fell off
  // the map" and "landed on the spikes" are not the same story.
  const midTile = tileAt(level, Math.floor(a.x), Math.floor(a.y - a.h / 2));
  if (midTile === HAZARD || a.y > level.rows.length + 4) {
    a.cause = { how: midTile === HAZARD ? "spikes" : "fall", by: null, thrownBy: a.thrownBy || null };
    kill(a, opts);
  }

  // Squash and stretch decays back to neutral.
  a.squash += (0 - a.squash) * Math.min(1, dt * 11);
}

function land(a, on, wasGrounded, opts) {
  a.grounded = true;
  a.groundedOn = on;
  a.coyote = FEEL.coyoteMs / 1000;
  if (!wasGrounded) {
    a.squash = Math.min(0.34, Math.abs(a.vy) * 0.016);
    opts.onLand?.(a);
  }
}

export function kill(a, opts = {}) {
  if (a.dead) return;
  a.dead = true;
  a.respawn = FEEL.respawnMs / 1000;
  a.vx = 0;
  a.vy = 0;
  opts.onDeath?.(a);
}

export function reviveAt(a, x, y) {
  a.dead = false;
  a.respawn = 0;
  a.x = x;
  a.y = y;
  a.vx = 0;
  a.vy = 0;
  a.grounded = false;
  a.squash = 0;
  a.launchFor = 0;
}

/** What the renderer needs to pose a character. */
export function poseOf(a) {
  return {
    face: a.face,
    run: Math.min(1, Math.abs(a.vx) / FEEL.runSpeed),
    walk: a.walk,
    stride: (a.stats && a.stats.stride) || 1,
    air: a.grounded ? 0 : a.vy < 0 ? -1 : 1,
    // A continuous version of `air`: +1 leaving the ground at full launch
    // speed, 0 at the apex, negative on the way down. `air` can only say
    // "up / down / neither", which is why a jump used to snap between two
    // frozen shapes instead of arcing through one.
    rise: a.grounded ? 0 : Math.max(-1.3, Math.min(1, -a.vy / Math.abs(JUMP_VELOCITY))),
    squash: a.squash,
    t: a.t,
  };
}
