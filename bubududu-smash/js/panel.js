// The Smash-style cards along the bottom: your face, your hearts, and every
// effect currently running on you.
//
// This lives on its own because BOTH phones have to draw it and only one of
// them is simulating. The host builds the chip list from the live round; the
// guest is handed the same list over the wire and draws it with this exact
// code. Two implementations would have drifted the first time a chip changed.

import { PLAYERS, FEEL, COINS, DIWATA, POWERUPS, SQUAD, HELPER } from "./config.js";
import { charById } from "./characters.js";
import { markSVG } from "./marks.js";

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
    const key = list
      .map((q) => (q.mark || "") + q.label + Math.round(q.pct / 6) + (q.bump ? "!" : ""))
      .join("|");
    const el = card.querySelector(".pchips");
    if (el.dataset.key !== key) {
      el.dataset.key = key;
      el.innerHTML = list
        .map(
          (q) =>
            `<span class="chip${q.bad ? " bad" : ""}${q.bump ? " bump" : ""}" style="--cc:${q.colour};--left:${q.pct}%">` +
            markSVG(q.mark) + q.label + `</span>`
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
  list.map((q) => [q.label, q.colour, Math.round(q.pct), q.bad ? 1 : 0, q.bump ? 1 : 0, q.mark || ""]);

export const unpackChips = (list) =>
  (list || []).map(([label, colour, pct, bad, bump, mark]) => ({
    label, colour, pct, bad: !!bad, bump: !!bump, mark: mark || "",
  }));


/* ------------------------------------------------------------- the chips --- */

/** Only shown to a player on a keyboard; a phone has a button for it. */
const SHOOT_KEY = { p1: "F", p2: "Shift" };

export function chipsFor(a, G, pads) {
  const out = [];
  if (!a) return out;

  // Progress toward the next reward, always first so it sits in one place.
  // `bump` makes the chip jump on the frame the count changes — the number
  // alone is too quiet to notice while you are looking at your character.
  out.push({
    // The same cut gem that is lying on the platforms, drawn — it was the ◆
    // character, which is a rhombus in most fonts and nothing like the thing
    // you are picking up.
    mark: "gem",
    label: `${a.coins || 0}/${COINS.perReward}`,
    colour: COINS.colour,
    pct: ((a.coins || 0) / COINS.perReward) * 100,
    bad: false,
    bump: a.glowUntil && G.time < a.glowUntil && a.glowColour === COINS.colour,
  });

  if (a.fairy && !a.fairy.leaving) {
    const wait = Math.max(0, a.fairy.next - G.time);
    out.push({
      mark: "plus",
      label: `${a.fairy.left}`,
      colour: DIWATA.colour,
      pct: 100 - (wait / (DIWATA.everyMs / 1000)) * 100,
      bad: false,
    });
  }

  if (a.power) {
    const def = POWERUPS[a.power.type];
    const dur = def.ms ? def.ms / 1000 : 0;
    const left = a.power.until === Infinity ? 1 : Math.max(0, a.power.until - G.time);
    const pct = dur ? Math.max(0, Math.min(100, (left / dur) * 100)) : 100;
    let label;
    if (a.power.type === "baril" || a.power.type === "suntok") {
      // Show the key only to a player who is actually on the keyboard; on a
      // phone there is a button for it.
      const key = pads[a.id] && !pads[a.id].connected ? ` <em>${SHOOT_KEY[a.id]}</em>` : "";
      label = `${a.power.ammo}${key}`;
    } else {
      label = def.name;
    }
    out.push({ mark: a.power.type, label, colour: def.colour, pct, bad: false });
  }
  if (a.frozenUntil && G.time < a.frozenUntil) {
    const left = a.frozenUntil - G.time;
    out.push({
      mark: "yelo",
      label: "frozen",
      colour: POWERUPS.yelo.colour,
      pct: (left / (POWERUPS.yelo.freezeMs / 1000)) * 100,
      bad: true,
    });
  }
  if (a.reversedUntil && G.time < a.reversedUntil) {
    const left = a.reversedUntil - G.time;
    out.push({
      mark: "baliktad",
      label: "reversed",
      colour: POWERUPS.baliktad.colour,
      pct: (left / (POWERUPS.baliktad.reverseMs / 1000)) * 100,
      bad: true,
    });
  }

  // Things that are yours but are not held IN your hands. They were doing
  // real work on the field with nothing in the panel to say so.
  const squad = G.minis.filter((m) => m.owner === a.id && !m.leaving).length;
  if (squad) {
    out.push({
      mark: "squad",
      label: `${squad}`,
      colour: SQUAD.colour,
      pct: 100,
      bad: false,
    });
  }

  const mine = G.helpers.filter((h) => h.ally === a.id && !h.bad && !h.leaving);
  if (mine.length) {
    // The longest-lived one drives the bar; the count says how many are out,
    // because two Dudus hunting is very different from one and the panel is
    // the only place that can say so.
    const left = Math.max(...mine.map((h) => Math.max(0, h.until - G.time)));
    out.push({
      mark: "dudu",
      label: mine.length > 1 ? `Dudu \u00d7${mine.length}` : "Dudu",
      colour: "#ffb84d",
      pct: Math.min(100, (left / (HELPER.huntMs / 1000)) * 100),
      bad: false,
    });
  }

  // The grace after a hit. Knowing you cannot be touched for another second
  // is the difference between backing off and going straight back in.
  if (a.invulnUntil && G.time < a.invulnUntil) {
    const left = a.invulnUntil - G.time;
    out.push({
      mark: "safe",
      label: "safe",
      colour: "#9fd8ff",
      pct: Math.min(100, (left / (FEEL.hurtInvulnMs / 1000)) * 100),
      bad: false,
    });
  }

  return out;
}
