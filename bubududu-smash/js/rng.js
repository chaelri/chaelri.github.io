// The simulation's source of chance.
//
// Every random number the RULES consult comes from here, and it is seeded per
// round by the host. That is what lets both phones run the same simulation and
// arrive at the same arena, the same power-up in the same place, the same
// coin flip on Dudu — without any of it being sent.
//
// It is NOT for rendering. Sparks, dust, the wobble on a cloud and the pitch
// of a sound can differ between the two screens without anyone noticing or
// anything drifting, and routing those through here would mean the two phones
// consuming the stream at different rates — which is exactly how a shared
// sequence goes out of step. Anything that only affects pixels keeps using
// Math.random.
//
// xorshift32: four instructions, no state beyond one integer, and the same
// generator levels.js has always used to build an arena from a seed.

let a = 1;

export function seed(n) {
  a = (n >>> 0) || 1;
}

export function rng() {
  a ^= a << 13; a >>>= 0;
  a ^= a >> 17;
  a ^= a << 5; a >>>= 0;
  return a / 4294967296;
}

/** Where the stream has got to. Two sims in step agree on this. */
export function rngState() {
  return a >>> 0;
}

/** A fresh seed, for whoever is deciding the round. */
export const newSeed = () => (Math.random() * 4294967296) >>> 0;
