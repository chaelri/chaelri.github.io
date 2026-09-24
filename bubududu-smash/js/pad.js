// The touch controls, as a thing two pages can use.
//
// Lifted out of phone.js unchanged, because the host phone in duo mode needs
// exactly the same controls for its own player and a second implementation of
// this would drift. The comment below is the whole reason this code looks the
// way it does, and it is worth keeping in front of anyone editing it.

import { ALL_POWERS } from "./config.js";
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
  // `k` is the character's own move; `s` is whatever power-up is in hand.
  // Two counters, because they are two buttons and can be combined.
  const state = { l: false, r: false, h: false, d: false, j: 0, s: 0, k: 0 };

  const zones = () => ({
    dpad: document.querySelector(".dpad").getBoundingClientRect(),
    jump: $("#jump").getBoundingClientRect(),
    down: $("#down").getBoundingClientRect(),
    shoot: $("#shoot").getBoundingClientRect(),
    skill: $("#skill").getBoundingClientRect(),
  });

  const inside = (b, x, y, m = 14) =>
    x >= b.left - m && x <= b.right + m && y >= b.top - m && y <= b.bottom + m;

  let wasJump = false;
  let wasShoot = false;
  let wasSkill = false;

  function apply(points) {
    const z = zones();
    let l = false, r = false, jump = false, down = false, shoot = false, skill = false;

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
      if (inside(z.skill, x, y)) skill = true;
    }

    state.l = l;
    state.r = r;
    state.h = jump;
    state.d = down;

    // Presses are counted on the rising edge only.
    if (jump && !wasJump) { state.j++; onEdge?.(); }
    if (shoot && !wasShoot) { state.s++; onEdge?.(); }
    if (skill && !wasSkill) { state.k++; onEdge?.(); }
    wasJump = jump;
    wasShoot = shoot;
    wasSkill = skill;

    $("#left").classList.toggle("down", l);
    $("#right").classList.toggle("down", r);
    $("#jump").classList.toggle("down", jump);
    $("#down").classList.toggle("down", down);
    $("#skill").classList.toggle("down", skill);
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
 * The power-up button: the gun, or the fist, or nothing in hand.
 *
 * It was three buttons in one — the character's move shared it whenever no
 * power-up had taken it — and sharing made the one thing you most want to do
 * impossible: you could not dash INTO a punch, or hop and then shoot,
 * because the move and the power-up were the same thumb on the same button.
 * They are two buttons now and the combination is the point.
 *
 * The symbols are drawn paths rather than characters. ✊ and ➜ were typed,
 * and ✊ has an emoji presentation, so the one button on the pad came out
 * differently on every phone. See js/marks.js.
 */
export function paintShootButton(power, ammo) {
  const b = $("#shoot");
  if (!b) return;
  /* Ask the power-up whether it fires; do not recite a list of names.
   *
   * This read `power === "baril" || power === "suntok"`, and the Bazooka was
   * neither — so the one button you fire it with was dead on every phone,
   * while the laptop key worked fine because that path asks the rules. See
   * `fires` in config.js. */
  const def = ALL_POWERS[power];
  // `endless` is armed with no magazine at all — see Excalibur in config.js.
  // Without it the one weapon that never runs out reads as the one weapon
  // that is always empty.
  const armed = !!(def && def.fires) && (ammo > 0 || !!def.endless);
  b.classList.toggle("armed", armed);
  b.classList.toggle("melee", armed && (power === "suntok" || power === "espada"));
  b.classList.toggle("grab", !armed);
  const count = armed && !def.endless ? String(ammo) : "";
  const key = `${armed ? power : "-"}|${count}`;
  if (b.dataset.key !== key) {
    b.dataset.key = key;
    // Its own mark, whatever it is — a Bazooka drawn as a six-shooter is a
    // lie about how many shots you have.
    // Nothing to fire: the same button grabs. See GRAB in config.js.
    b.innerHTML = markSVG(armed ? power : "grab", "mk") +
      (count ? `<i>${count}</i>` : "");
  }
}

let wasReady = false;
let popTimer = null;

/**
 * The character's own move, on its own button.
 *
 * @param cd     0..1 of the cooldown still to run, 0 when the clock is up.
 * @param ready  whether it can actually be used — an Air Hop off cooldown is
 *               still no use with your feet on the ground.
 */
export function paintSkillButton(ability, cd = 0, ready = false, charges = 0, max = 0) {
  const b = $("#skill");
  if (!b) return;
  b.classList.toggle("ability", !!ability);
  b.classList.toggle("ready", !!ability && ready);
  b.style.setProperty("--cd", `${Math.max(0, Math.min(1, cd)) * 100}%`);
  if (ability) b.style.setProperty("--ac", ability.colour);

  /* How many are in hand, as PIPS rather than a number.
   *
   * Three of something is a quantity you read without counting; "3" is a
   * quantity you read by reading. The ring round the rim is the wait for the
   * next one, so between them the button answers both questions a charge
   * stack raises — how many now, and how long until one more. */
  const want = `${ability ? ability.mark : "-"}|${charges}/${max}`;
  if (b.dataset.key !== want) {
    b.dataset.key = want;
    b.innerHTML = ability
      ? markSVG(ability.mark, "mk") +
        (max > 1
          ? `<u>${Array.from({ length: max },
              (_, i) => `<i class="${i < charges ? "on" : ""}"></i>`).join("")}</u>`
          : "")
      : "";
  }

  /* The moment it comes BACK gets said out loud, once.
   *
   * A state you have to notice changing is a state you notice too late —
   * mid-round nobody is watching their thumb, they are watching the other
   * player. So the frame the cooldown ends throws one ring off the button
   * and gives it a kick, and the rest of the time it simply breathes.
   *
   * Removed and re-added around a reflow, which is what restarts a CSS
   * animation; setting the class on an element that already has it does
   * nothing at all. Same trick the note cards use to re-bump.
   */
  const live = !!ability && ready;
  if (live && !wasReady) {
    b.classList.remove("pop");
    void b.offsetWidth;
    b.classList.add("pop");
    clearTimeout(popTimer);
    popTimer = setTimeout(() => b.classList.remove("pop"), 560);
  }
  if (!live) { b.classList.remove("pop"); clearTimeout(popTimer); }
  wasReady = live;
}

