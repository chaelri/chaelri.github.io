/* Whether the match may begin.
 *
 * Its own file, and a pure function, because it is a rule with four inputs
 * and no way to see it run: the room it lives in needs a websocket transport
 * and two real clients before it will do anything at all, so the version of
 * this that lived inline in onJoin could only be tested by two people picking
 * up two phones. This can be asked the question directly — see readytest.mjs.
 *
 *   seated  which roles have a socket in the room
 *   ready   which have tapped Ready
 *   gated   which are running a page that HAS a Ready button
 *   phase   the rules' own phase; only "lobby" can be started from
 *
 * A client that never said `gate: true` is taken as ready. That is what keeps
 * a half-finished rollout playable: for the few minutes one phone is on the
 * old files and the other on the new, the old one simply does not get asked.
 */
export function shouldStart({ seated, ready, gated, phase }) {
  if (phase !== "lobby") return false;
  for (const r of ["p1", "p2"]) {
    if (!seated[r]) return false;
    if (gated[r] && !ready[r]) return false;
  }
  return true;
}
