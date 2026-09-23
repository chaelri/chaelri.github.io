// Which move a character has, and whether they can use it right now.
//
// Pure: it reads the actor and a clock, and nothing else. That is what lets
// the rules ask it (to decide whether a press does anything), the pad ask it
// (to light the button), and the panel ask it (to show both players' state on
// a laptop, where there is no button to light). It was written out three
// times before this existed — twice in the two copies of the rules and about
// to be a fourth in the panel — which is exactly the kind of thing that ends
// up meaning something different in one place than another.

import { ABILITY } from "./config.js";
import { charById } from "./characters.js";

export function abilityOf(a) {
  if (!a) return null;
  const def = charById(a.char);
  return (def && def.ability && ABILITY[def.ability]) || null;
}

/**
 * Is the move theirs to use, this instant?
 *
 * @param now  the world clock, in SECONDS — passed rather than reached for,
 *             because the replay runs this against a clock that is walking
 *             back through the last few ticks rather than the live one.
 */
export function abilityReady(a, now) {
  const ab = abilityOf(a);
  if (!ab || a.dead) return false;
  if (a.frozenUntil && now < a.frozenUntil) return false;
  if (now * 1000 - (a.abilityAt || -9e9) < ab.cooldownMs) return false;
  /* Deliberately NOT "are your feet off the ground".
   *
   * The server holds a couple of inputs back as jitter slack, so it simulates
   * your press two ticks after you made it — and two ticks is easily enough
   * to land in. Gate a move on `grounded` and the two sides answer the same
   * press differently: you dive, the server says no, and at a pound's speed
   * that is a tile and a half of disagreement handed to you as a jolt. The
   * bench put it at exactly that.
   *
   * So nothing here reads a state that a hair's difference in position can
   * flip. Pressing with your feet down is not refused, it just does the
   * grounded version of the move — which for the pound is a slam on the spot,
   * and is a better move than the refusal was. */
  if (ab.id === "hop") return (a.hops || 0) < ab.perAir;
  if (ab.id === "pound") return !a.pounding;
  return true;
}

/**
 * Everything an indicator needs, or null if this character has no move.
 *
 * `cd` and `ready` are two different questions and both have to be answered:
 * an Air Hop off cooldown is still no use with your feet on the ground, and
 * something that looked ready and did nothing would be worse than something
 * that looked spent.
 */
export function abilityLook(a, now) {
  const ab = abilityOf(a);
  if (!ab) return null;
  const since = now * 1000 - (a.abilityAt || -9e9);
  return {
    ability: ab,
    cd: Math.max(0, Math.min(1, 1 - since / ab.cooldownMs)),
    ready: abilityReady(a, now),
  };
}
