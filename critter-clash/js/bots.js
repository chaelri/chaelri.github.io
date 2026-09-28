// The bot only ever makes one decision: where to stand. It picks one of a few
// shapes that make sense for the critters it has, with a random twist, and
// readies up after a human-ish pause.

import { place, setReady, CELLS } from "./sim.js";

// Cell choices per critter for each plan (front row is 0-3, back row 8-11).
const PLANS = [
  { yhon: 1, hedgehog: 2, axolotl: 9, capybara: 10 },   // classic: tanks up, backline behind
  { yhon: 2, hedgehog: 0, axolotl: 10, capybara: 9 },   // striker on a flank
  { yhon: 5, hedgehog: 3, axolotl: 8, capybara: 6 },    // tank a row back, bait on the edge
  { yhon: 1, hedgehog: 5, axolotl: 11, capybara: 10 },  // striker held back for the counter
  { yhon: 0, hedgehog: 3, axolotl: 9, capybara: 10 },   // wide
];

/** A bot squad of n from all four critters — always with a frontliner, so a
 * bot never fields two back-liners (a pairing that wins 16% of the time). */
export function botSquad(n) {
  for (;;) {
    const sq = ["yhon", "hedgehog", "axolotl", "capybara"].sort(() => Math.random() - 0.5).slice(0, n);
    if (sq.includes("yhon") || sq.includes("hedgehog")) return sq;
  }
}

export function newBrain() {
  return { wait: 2 + Math.random() * 5, done: false };
}

export function botStep(s, seat, b, dt) {
  if (s.phase !== "prep") { b.done = false; b.wait = 2 + Math.random() * 5; return; }
  if (b.done) return;
  b.wait -= dt;
  if (b.wait > 0) return;
  const plan = { ...PLANS[Math.floor(Math.random() * PLANS.length)] };
  // the twist: sometimes shuffle one critter into a random free cell
  const squad = s.seats[seat].squad;
  if (Math.random() < 0.4) {
    const id = squad[Math.floor(Math.random() * squad.length)];
    plan[id] = Math.floor(Math.random() * CELLS);
  }
  for (const id of squad) place(s, seat, id, plan[id]);
  setReady(s, seat);
  b.done = true;
}
