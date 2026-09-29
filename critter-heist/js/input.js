// Thumbs in, { mx, mz, a, l } out: a stick, the action button and Lock.
//
// The stick floats: it appears wherever the left thumb lands, so there is no
// "missed the joystick" in a scramble. Buttons count presses rather than
// report held state — the sim compares counters, so a tap that happens
// between two frames (or two network packets) is never lost.
//
// Screen up is world -z (the camera looks down the island from the +z side),
// so the stick maps straight across: right = +x, down = +z.

const RADIUS = 56; // px of thumb travel for full speed

export function createInput({ stickZone, stickBase, stickKnob, actBtn, lockBtn, onPress }) {
  const st = { mx: 0, mz: 0, a: 0, l: 0, enabled: false };
  let stickId = null, ox = 0, oy = 0;
  const keys = new Set();

  const showStick = (on) => { stickBase.style.opacity = on ? "1" : "0"; };

  stickZone.addEventListener("pointerdown", (e) => {
    if (stickId !== null) return;
    stickId = e.pointerId;
    stickZone.setPointerCapture(e.pointerId);
    ox = e.clientX; oy = e.clientY;
    stickBase.style.transform = `translate(${ox}px, ${oy}px)`;
    stickKnob.style.transform = "translate(0px, 0px)";
    showStick(true);
    e.preventDefault();
  });
  stickZone.addEventListener("pointermove", (e) => {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - ox, dy = e.clientY - oy;
    const len = Math.hypot(dx, dy);
    // Drag past the rim and the base follows the thumb, so you never run out
    // of stick on a long push.
    if (len > RADIUS) {
      ox += (dx / len) * (len - RADIUS);
      oy += (dy / len) * (len - RADIUS);
      dx = e.clientX - ox; dy = e.clientY - oy;
      stickBase.style.transform = `translate(${ox}px, ${oy}px)`;
    }
    stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    st.mx = dx / RADIUS; st.mz = dy / RADIUS;
  });
  const release = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    st.mx = 0; st.mz = 0;
    showStick(false);
  };
  stickZone.addEventListener("pointerup", release);
  stickZone.addEventListener("pointercancel", release);

  const press = (which) => {
    if (!st.enabled) return;
    st[which]++;
    onPress?.(which);
  };
  for (const [btn, which] of [[actBtn, "a"], [lockBtn, "l"]]) {
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      btn.classList.add("down");
      press(which);
    });
    const up = () => btn.classList.remove("down");
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
    btn.addEventListener("pointerleave", up);
  }

  // Keyboard, for playing and testing on the Mac.
  addEventListener("keydown", (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    keys.add(k);
    if (k === " " || k === "j" || k === "e") press("a");
    if (k === "l" || k === "k" || k === "shift") press("l");
  });
  addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

  return {
    state: st,
    read() {
      if (stickId === null) {
        const x = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
        const z = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
        const l = Math.hypot(x, z) || 1;
        st.mx = x / l; st.mz = z / l;
      }
      return { mx: st.mx, mz: st.mz, a: st.a, l: st.l };
    },
  };
}
