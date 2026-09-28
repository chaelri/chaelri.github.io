// The bot. It goes through exactly the actions a player does (act() in
// sim.js), one at a time with a human-ish pause, so the sim cannot tell it
// apart and a guest's screen shows it thinking.
//
// Priorities each prep: fill empty slots, then merge what it already has,
// then snacks on its best critter; reroll once if the shop gives it nothing.
// Stakes the round (PUSTA!) sometimes when its squad looks the stronger one.

import { act } from "./sim.js";
import { CRITTERS, STAR } from "./config.js";

// Cell plans, front row 0-3, back row 8-11.
const PLANS = [
  { yhon: 1, hedgehog: 2, axolotl: 9, capybara: 10 },
  { yhon: 2, hedgehog: 0, axolotl: 10, capybara: 9 },
  { yhon: 5, hedgehog: 3, axolotl: 8, capybara: 6 },
  { yhon: 1, hedgehog: 5, axolotl: 11, capybara: 10 },
  { yhon: 0, hedgehog: 3, axolotl: 9, capybara: 10 },
];

export function newBrain() {
  return { t: 1.5, round: 0, plan: null, rerolled: false };
}

const power = (p) => Object.entries(p.board).reduce((a, [id, b]) => a + CRITTERS[id].hp * STAR.mult[b.star - 1] * (1 + 0.4 * b.snacks.length), 0);

export function botStep(s, seat, b, dt) {
  if (s.phase !== "prep") return;
  const p = s.p[seat];
  if (p.ready) return;
  if (b.round !== s.round) {
    b.round = s.round;
    b.t = 1 + Math.random() * 1.5;
    b.rerolled = false;
    b.plan = PLANS[Math.floor(Math.random() * PLANS.length)];
  }
  b.t -= dt;
  if (b.t > 0) return;
  b.t = 0.5 + Math.random() * 0.7; // one action at a time, like a thumb

  // feed a held snack to the biggest critter
  if (p.hand) {
    const best = Object.entries(p.board).sort((x, y) => y[1].star - x[1].star || Math.random() - 0.5)[0];
    if (best) { act(s, seat, { t: "feed", id: best[0] }); return; }
  }
  const count = Object.keys(p.board).length;
  const open = p.shop.map((o, i) => ({ ...o, i })).filter((o) => !o.sold);
  const want =
    open.find((o) => o.kind === "critter" && !p.board[o.id] && count < s.slots) ||
    open.find((o) => o.kind === "critter" && p.board[o.id] && p.board[o.id].star < 3) ||
    (count > 0 && !p.hand && open.find((o) => o.kind === "snack"));
  if (want && act(s, seat, { t: "buy", i: want.i })) return;
  if (!b.rerolled && p.coins >= 4 && Math.random() < 0.6) { b.rerolled = true; act(s, seat, { t: "reroll" }); return; }

  // place by the plan, then maybe stake it, then ready
  for (const id of Object.keys(p.board)) {
    const cell = b.plan[id];
    if (cell !== undefined && p.board[id].cell !== cell && Math.random() < 0.8) { act(s, seat, { t: "move", id, cell }); return; }
  }
  if (!p.pusta && power(p) > power(s.p[1 - seat]) * 1.15 && Math.random() < 0.35) { act(s, seat, { t: "pusta" }); return; }
  act(s, seat, { t: "ready" });
}

/** A bot pool to match a player's: same size, always with a frontliner. */
export function botPool(n) {
  for (;;) {
    const sq = ["yhon", "hedgehog", "axolotl", "capybara"].sort(() => Math.random() - 0.5).slice(0, n);
    if (sq.includes("yhon") || sq.includes("hedgehog")) return sq;
  }
}
