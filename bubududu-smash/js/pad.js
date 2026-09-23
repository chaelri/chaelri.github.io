// The touch controls, as a thing two pages can use.
//
// Lifted out of phone.js unchanged, because the host phone in duo mode needs
// exactly the same controls for its own player and a second implementation of
// this would drift. The comment below is the whole reason this code looks the
// way it does, and it is worth keeping in front of anyone editing it.

import { markSVG } from "./marks.js";

const $ = (s) => document.querySelector(s);

/**
 * Controls, driven by the browser's own list of live touches.
 *
 * Every previous version tracked pointerdown/up pairs and kept its own record
 * of what was held. That record can desync — iOS drops or reorders a release
 * often enough — and a lost pointerup leaves a direction jammed on. The
 * symptom is confusing: pressing LEFT while RIGHT is stuck reads as "left
 * does nothing and he stops", because left and right cancel out.
 *
 * `TouchEvent.touches` is not a record, it is the complete set of fingers
 * currently on the glass. Recomputing every button from it on every touch
 * event means there is no bookkeeping left to get out of step: if a finger is
 * gone, it is simply not in the list.
 *
 * `onEdge` fires on the rising edge of jump and shoot, for haptics.
 */
export function createPad({ onEdge } = {}) {
  const state = { l: false, r: false, h: false, d: false, j: 0, s: 0 };

  const zones = () => ({
    dpad: document.querySelector(".dpad").getBoundingClientRect(),
    jump: $("#jump").getBoundingClientRect(),
    down: $("#down").getBoundingClientRect(),
    shoot: $("#shoot").getBoundingClientRect(),
  });

  const inside = (b, x, y, m = 14) =>
    x >= b.left - m && x <= b.right + m && y >= b.top - m && y <= b.bottom + m;

  let wasJump = false;
  let wasShoot = false;

  function apply(points) {
    const z = zones();
    let l = false, r = false, jump = false, down = false, shoot = false;

    for (const pt of points) {
      const { x, y } = pt;
      if (inside(z.dpad, x, y, 20)) {
        // Split down the middle: no dead strip, no overlap, and sliding from
        // one arrow to the other just works.
        if (x < z.dpad.left + z.dpad.width / 2) l = true;
        else r = true;
      }
      if (inside(z.jump, x, y)) jump = true;
      if (inside(z.down, x, y)) down = true;
      if (inside(z.shoot, x, y)) shoot = true;
    }

    state.l = l;
    state.r = r;
    state.h = jump;
    state.d = down;

    // Presses are counted on the rising edge only.
    if (jump && !wasJump) { state.j++; onEdge?.(); }
    if (shoot && !wasShoot) { state.s++; onEdge?.(); }
    wasJump = jump;
    wasShoot = shoot;

    $("#left").classList.toggle("down", l);
    $("#right").classList.toggle("down", r);
    $("#jump").classList.toggle("down", jump);
    $("#down").classList.toggle("down", down);
    $("#shoot").classList.toggle("down", shoot);
  }

  if ("ontouchstart" in window) {
    const fromTouches = (e) =>
      apply([...e.touches].map((t) => ({ x: t.clientX, y: t.clientY })));
    for (const ev of ["touchstart", "touchmove", "touchend", "touchcancel"])
      document.addEventListener(ev, fromTouches, { passive: true });
  } else {
    // Desktop fallback: one mouse pointer, same reconciliation.
    const live = new Map();
    const push = () => apply([...live.values()]);
    document.addEventListener("pointerdown", (e) => {
      live.set(e.pointerId, { x: e.clientX, y: e.clientY });
      push();
    });
    document.addEventListener("pointermove", (e) => {
      if (!live.has(e.pointerId)) return;
      live.set(e.pointerId, { x: e.clientX, y: e.clientY });
      push();
    });
    const drop = (e) => { live.delete(e.pointerId); push(); };
    document.addEventListener("pointerup", drop);
    document.addEventListener("pointercancel", drop);
  }

  // Anything that takes the page away releases everything.
  const clearAll = () => apply([]);
  addEventListener("blur", clearAll);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") clearAll();
  });

  return { state, clearAll };
}

/**
 * What the fire button should say. Shared so the controller page and the duo
 * page never disagree about whether you are holding a gun or a fist.
 */
/**
 * The fire button, which is three buttons depending on what you are holding.
 *
 * With a power-up it is the gun or the fist. With nothing it is your
 * character's own move, which is most of a round — that button used to sit
 * there greyed out doing nothing for four rounds out of five.
 *
 * The symbols are drawn paths rather than characters. ✊ and ➜ were typed,
 * and ✊ has an emoji presentation, so the one button on the pad came out
 * differently on every phone. See js/marks.js.
 *
 * @param cd     0..1 of the cooldown still to run, 0 when the clock is up.
 * @param ready  whether it can actually be used — an Air Hop off cooldown is
 *               still no use with your feet on the ground.
 */
export function paintShootButton(power, ammo, ability = null, cd = 0, ready = false) {
  const b = $("#shoot");
  if (!b) return;
  const armed = (power === "baril" || power === "suntok") && ammo > 0;
  const mark = armed ? (power === "suntok" ? "suntok" : "baril") : ability && ability.mark;
  const live = !armed && !!ability && ready;

  b.classList.toggle("armed", armed);
  b.classList.toggle("melee", armed && power === "suntok");
  b.classList.toggle("ability", !armed && !!ability);
  b.classList.toggle("ready", live);
  // The cooldown drains out of the button itself, the same way a chip's does.
  b.style.setProperty("--cd", `${Math.max(0, Math.min(1, cd)) * 100}%`);
  if (ability) b.style.setProperty("--ac", ability.colour);

  const key = `${mark || "-"}|${armed ? ammo : ""}`;
  if (b.dataset.key !== key) {
    b.dataset.key = key;
    b.innerHTML = markSVG(mark || "baril", "mk") + (armed ? `<i>${ammo}</i>` : "");
  }
}
