// The Smash-style cards along the bottom: your face, your hearts, and every
// effect currently running on you.
//
// This lives on its own because BOTH phones have to draw it and only one of
// them is simulating. The host builds the chip list from the live round; the
// guest is handed the same list over the wire and draws it with this exact
// code. Two implementations would have drifted the first time a chip changed.

import { PLAYERS, FEEL } from "./config.js";
import { charById } from "./characters.js";

const HEART_SVG =
  '<svg viewBox="0 0 24 22"><path d="M12 21.3C2.6 14.6 1 11.2 1 7.9 1 4.1 3.9 1.4 7.2 1.4c2.1 0 3.8 1 4.8 2.6 1-1.6 2.7-2.6 4.8-2.6C20.1 1.4 23 4.1 23 7.9c0 3.3-1.6 6.7-11 13.4z"/></svg>';

const $ = (s) => document.querySelector(s);

let bar = null;
let cards = null;
let pose = 0;

function grab() {
  if (cards) return cards;
  bar = $("#players");
  if (!bar) return null;
  cards = {
    p1: bar.querySelector('[data-p="p1"]'),
    p2: bar.querySelector('[data-p="p2"]'),
  };
  return cards;
}

/**
 * @param actors  whatever we have of both players this frame
 * @param chips   { p1: [{label, colour, pct, bad, bump}], p2: [...] }
 * @param dt      seconds, for the idle breath on the portraits
 */
export function paintPanels(actors, chips, dt) {
  const c = grab();
  if (!c) return;
  bar.classList.add("on");
  pose += dt;

  for (const p of PLAYERS) {
    const card = c[p.id];
    const a = actors.find((x) => x.id === p.id);
    if (!card || !a) continue;
    card.style.setProperty("--pc", p.colour);
    card.classList.toggle("out", a.hp <= 0);

    // portrait, drawn with the same routine the game uses
    const cv = card.querySelector(".face");
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, cv.width, cv.height);
    charById(a.char).draw(ctx, cv.width / 2, cv.height * 0.96, cv.width * 0.72, cv.height * 0.8, {
      face: 1,
      run: 0,
      air: 0,
      squash: Math.sin(pose * 2.2) * 0.05,
      t: pose,
      walk: 0,
      stride: 1,
    });

    const hearts = card.querySelector(".phearts");
    // Only ever as many slots as you start with, plus however many spares you
    // are actually carrying — five empty slots would read as five lost hearts.
    const slots = Math.max(FEEL.hp, a.hp);
    const want = Array.from({ length: slots }, (_, i) => i < a.hp).join(",");
    if (hearts.dataset.state !== want) {
      hearts.dataset.state = want;
      hearts.innerHTML = Array.from({ length: slots }, (_, i) => {
        const cls = i >= FEEL.hp ? "bonus" : i < a.hp ? "" : "off";
        return HEART_SVG.replace("<svg", `<svg class="${cls}"`);
      }).join("");
    }

    const list = (chips && chips[p.id]) || [];
    const key = list.map((q) => q.label + Math.round(q.pct / 6) + (q.bump ? "!" : "")).join("|");
    const el = card.querySelector(".pchips");
    if (el.dataset.key !== key) {
      el.dataset.key = key;
      el.innerHTML = list
        .map(
          (q) =>
            `<span class="chip${q.bad ? " bad" : ""}${q.bump ? " bump" : ""}" style="--cc:${q.colour};--left:${q.pct}%">${q.label}</span>`
        )
        .join("");
    }
  }
}

/* ------------------------------------------------------------- the wire --- */
// Chips are sent to the guest as arrays, for the same reason everything else
// in netstate.js is: on the Firebase relay lane this rides the public internet
// on every tick it changes.

export const packChips = (list) =>
  list.map((q) => [q.label, q.colour, Math.round(q.pct), q.bad ? 1 : 0, q.bump ? 1 : 0]);

export const unpackChips = (list) =>
  (list || []).map(([label, colour, pct, bad, bump]) => ({
    label, colour, pct, bad: !!bad, bump: !!bump,
  }));
