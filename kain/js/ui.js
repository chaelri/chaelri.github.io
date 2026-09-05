// UI primitives: toasts, bottom sheets, the triple progress ring, confetti.
// No framework — just DOM, CSS classes and a couple of transitions.

import { $, el, esc, icon, haptic, clamp, num } from "./util.js";

/* -------------------------------------------------------------- toast --- */

let toastTimer = null;

export function toast(message, { tone = "neutral", icon: ic = "" } = {}) {
  const host = $("#toastHost");
  if (!host) return;
  host.innerHTML = `
    <div class="toast toast--${tone}">
      ${ic ? icon(ic, "toast-icon") : ""}
      <span>${esc(message)}</span>
    </div>`;
  const node = host.firstElementChild;
  requestAnimationFrame(() => node.classList.add("is-in"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.classList.remove("is-in");
    setTimeout(() => (host.innerHTML = ""), 260);
  }, 2600);
}

/* -------------------------------------------------------------- sheet --- */
/* One sheet at a time, stacked on a backdrop. On phones it rises from the
   bottom and can be flicked away; from `md` up it becomes a centred dialog. */

const sheetStack = [];

export function openSheet({ title = "", subtitle = "", icon: ic = "", build, onClose, wide = false }) {
  const root = el("div", `sheet-root${wide ? " sheet-root--wide" : ""}`);
  root.innerHTML = `
    <div class="sheet-backdrop"></div>
    <section class="sheet-panel" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grab" aria-hidden="true"><span></span></div>
      <header class="sheet-head">
        <div class="sheet-head-text">
          ${ic ? `<span class="sheet-head-icon">${icon(ic)}</span>` : ""}
          <div>
            <h2>${esc(title)}</h2>
            ${subtitle ? `<p>${esc(subtitle)}</p>` : ""}
          </div>
        </div>
        <button class="sheet-x" type="button" aria-label="Close">${icon("close")}</button>
      </header>
      <div class="sheet-body"></div>
    </section>`;

  document.body.appendChild(root);
  document.body.classList.add("sheet-open");

  const panel = root.querySelector(".sheet-panel");
  const body = root.querySelector(".sheet-body");

  const handle = {
    root,
    body,
    panel,
    setTitle(t) {
      root.querySelector(".sheet-head h2").textContent = t;
    },
    setSubtitle(t) {
      const p = root.querySelector(".sheet-head p");
      if (p) p.textContent = t;
      else if (t) root.querySelector(".sheet-head-text div").insertAdjacentHTML("beforeend", `<p>${esc(t)}</p>`);
    },
    close,
  };

  function close(result) {
    if (!sheetStack.includes(handle)) return;
    sheetStack.splice(sheetStack.indexOf(handle), 1);
    root.classList.remove("is-open");
    setTimeout(() => {
      root.remove();
      if (!sheetStack.length) document.body.classList.remove("sheet-open");
    }, 300);
    onClose?.(result);
  }

  root.querySelector(".sheet-backdrop").addEventListener("click", () => close());
  root.querySelector(".sheet-x").addEventListener("click", () => {
    haptic(6);
    close();
  });

  // Flick-down to dismiss, from the grab handle only so scrolling the body
  // never fights the gesture.
  const grab = root.querySelector(".sheet-grab");
  let startY = 0;
  let dy = 0;
  let dragging = false;
  grab.addEventListener("pointerdown", (e) => {
    dragging = true;
    startY = e.clientY;
    dy = 0;
    panel.style.transition = "none";
    grab.setPointerCapture(e.pointerId);
  });
  grab.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    dy = Math.max(0, e.clientY - startY);
    panel.style.transform = `translateY(${dy}px)`;
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    panel.style.transition = "";
    panel.style.transform = "";
    if (dy > 110) {
      haptic(6);
      close();
    }
  };
  grab.addEventListener("pointerup", endDrag);
  grab.addEventListener("pointercancel", endDrag);

  sheetStack.push(handle);
  requestAnimationFrame(() => root.classList.add("is-open"));
  build?.(body, handle);
  return handle;
}

// Esc closes the topmost sheet.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && sheetStack.length) sheetStack[sheetStack.length - 1].close();
});

export function confirmSheet({ title, message, confirmLabel = "Delete", tone = "danger", icon: ic = "help" }) {
  return new Promise((resolve) => {
    let answered = false;
    const sheet = openSheet({
      title,
      icon: ic,
      onClose: () => !answered && resolve(false),
      build(body) {
        body.innerHTML = `
          <p class="confirm-msg">${esc(message)}</p>
          <div class="confirm-actions">
            <button class="btn btn-ghost" data-act="no">Cancel</button>
            <button class="btn btn-${tone}" data-act="yes">${esc(confirmLabel)}</button>
          </div>`;
        body.querySelector('[data-act="no"]').onclick = () => {
          answered = true;
          resolve(false);
          sheet.close();
        };
        body.querySelector('[data-act="yes"]').onclick = () => {
          answered = true;
          haptic(12);
          resolve(true);
          sheet.close();
        };
      },
    });
  });
}

/* --------------------------------------------------------- ring stack --- */
/* Three concentric arcs — calories outside, sugar in the middle, sodium in the
   centre. Each is a circle whose dash offset animates from empty to its share. */

// Radii and stroke are load-bearing: the innermost ring's inner edge is the
// only room the centre readout gets. r=48 with a 14 stroke leaves a hole of
// 2*(48-7) = 82 of the 200 viewBox — 41% of the ring's width — which is what
// the `cqi` font sizes in style.css are tuned against. Shrink r or fatten the
// stroke and "1,130" starts running over the sodium arc.
const RING_STROKE = 14;
const RING_GEOM = [
  { key: "kcal", r: 88 },
  { key: "sugar_g", r: 68 },
  { key: "sodium_mg", r: 48 },
];

export function ringStackHTML() {
  const arcs = RING_GEOM.map(({ key, r }) => {
    const c = 2 * Math.PI * r;
    // The "given back" arc is drawn to how much you ATE and then covered by the
    // solid arc, which only reaches the net. Whatever green peeks out past the
    // end of the solid arc is exactly what the workout clawed back — no extra
    // maths, same dashoffset trick as a normal progress arc.
    const give =
      key === "kcal"
        ? `
      <circle class="ring-give" data-give="${key}" cx="100" cy="100" r="${r}"
              stroke-width="${RING_STROKE}" stroke-linecap="round"
              stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${c.toFixed(1)}"
              data-circ="${c.toFixed(1)}" />`
        : "";
    return `
      <circle class="ring-track" cx="100" cy="100" r="${r}" stroke-width="${RING_STROKE}" />${give}
      <circle class="ring-arc ring-arc--${key}" data-ring="${key}" cx="100" cy="100" r="${r}"
              stroke-width="${RING_STROKE}" stroke-linecap="round"
              stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${c.toFixed(1)}"
              data-circ="${c.toFixed(1)}" />`;
  }).join("");

  // Each arc runs light → deep along its own sweep. userSpaceOnUse keeps the
  // gradient fixed to the ring box, so it doesn't rotate with the -90° group.
  const grads = [
    ["kainGradKcal", "#fde68a", "#f59e0b"],
    ["kainGradSugar", "#fecdd3", "#e11d48"],
    ["kainGradSodium", "#bae6fd", "#0284c7"],
    ["kainGradOver", "#ff8a80", "#e01b0f"],
  ]
    .map(
      ([id, from, to]) => `
      <linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="18" y1="8" x2="182" y2="192">
        <stop offset="0%" stop-color="${from}" />
        <stop offset="100%" stop-color="${to}" />
      </linearGradient>`
    )
    .join("");

  // Bubbles ride *inside* the arc: a second dashed circle whose dashes read as
  // dots, clipped by a mask that is the filled part of the ring. Crawling the
  // dash offset walks them from the ring's start round to wherever the progress
  // currently ends — and nowhere past it, because the mask stops there.
  const masks = RING_GEOM.map(({ key, r }) => {
    const c = 2 * Math.PI * r;
    return `
      <mask id="kainMask-${key}" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
        <circle cx="100" cy="100" r="${r}" fill="none" stroke="#fff"
                stroke-width="${RING_STROKE}" stroke-linecap="round"
                stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${c.toFixed(1)}"
                data-mask="${key}" data-circ="${c.toFixed(1)}" />
      </mask>`;
  }).join("");

  const flows = RING_GEOM.map(
    ({ key, r }) => `
      <circle class="ring-flow ring-flow--big ring-flow--${key}" cx="100" cy="100" r="${r}"
              fill="none" stroke-width="${RING_STROKE - 6}" stroke-linecap="round"
              stroke-dasharray="0.01 40" mask="url(#kainMask-${key})" />
      <circle class="ring-flow ring-flow--small ring-flow--${key}" cx="100" cy="100" r="${r}"
              fill="none" stroke-width="${RING_STROKE - 10}" stroke-linecap="round"
              stroke-dasharray="0.01 27" mask="url(#kainMask-${key})" />`
  ).join("");

  return `
    <div class="ring-wrap">
      <svg class="ring-svg" viewBox="0 0 200 200" aria-hidden="true">
        <defs>${grads}${masks}</defs>
        <g transform="rotate(-90 100 100)">${arcs}${flows}</g>
      </svg>
      <button type="button" class="ring-center" id="ringCenter"
              aria-label="Switch between what's left and the running total"></button>
    </div>`;
}

/**
 * pcts: { kcal: 0.62, ... } — the share of the goal that actually counts. Over
 * 1 is allowed and shows hot.
 * ghosts: { kcal: 0.78 } — optional, the share BEFORE exercise offset it. The
 * stretch between the two renders as the give-back segment.
 */
export function setRings(root, pcts, ghosts = {}) {
  // Flush layout so the arcs have a computed "from" offset to transition out
  // of. This used to be a requestAnimationFrame, which never fires in a
  // throttled or background tab — the rings would then sit empty until the next
  // update. A forced reflow does the same job and always runs.
  void root.offsetWidth;

  RING_GEOM.forEach(({ key }) => {
    const arc = root.querySelector(`[data-ring="${key}"]`);
    if (!arc) return;
    const circ = num(arc.dataset.circ);
    const p = clamp(num(pcts[key]), 0, 1);
    arc.style.strokeDashoffset = String(circ * (1 - p));
    const mask = root.querySelector(`[data-mask="${key}"]`);
    if (mask) mask.style.strokeDashoffset = String(circ * (1 - p));
    arc.classList.toggle("is-over", num(pcts[key]) > 1);
    arc.classList.toggle("is-near", num(pcts[key]) > 0.85 && num(pcts[key]) <= 1);

    const give = root.querySelector(`[data-give="${key}"]`);
    if (give) {
      const g = clamp(num(ghosts[key]), 0, 1);
      // Nothing to show unless the pre-offset figure is genuinely further along.
      const visible = g > p + 0.004;
      give.style.strokeDashoffset = String(circ * (1 - (visible ? g : p)));
      give.classList.toggle("is-on", visible);
    }
  });
}


/* ---------------------------------------------------------- mini ring --- */
/* A small read-only echo of the big ring, for the partner card. Deliberately
   plain: no bubbles, no masks, and flat colours rather than the gradients —
   at 64 px none of that reads, and reusing the gradient/mask IDs from the hero
   ring would collide with them. */

const MINI_GEOM = [
  { key: "kcal", r: 26 },
  { key: "sugar_g", r: 18 },
  { key: "sodium_mg", r: 10 },
];
const MINI_STROKE = 5.5;

export function miniRingHTML(pcts = {}) {
  const arcs = MINI_GEOM.map(({ key, r }) => {
    const c = 2 * Math.PI * r;
    const raw = num(pcts[key]);
    const p = clamp(raw, 0, 1);
    return `
      <circle class="mini-track" cx="30" cy="30" r="${r}" stroke-width="${MINI_STROKE}" />
      <circle class="mini-arc mini-arc--${key}${raw > 1 ? " is-over" : ""}" cx="30" cy="30" r="${r}"
              stroke-width="${MINI_STROKE}" stroke-linecap="round"
              stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - p)).toFixed(1)}" />`;
  }).join("");

  return `
    <svg class="mini-ring" viewBox="0 0 60 60" aria-hidden="true">
      <g transform="rotate(-90 30 30)">${arcs}</g>
    </svg>`;
}

/* ------------------------------------------------------------- confetti -- */
/* Fired when a meal lands. Deliberately small: eight dots, 900 ms, gone. */

export function burst(anchor) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rect = anchor?.getBoundingClientRect?.();
  const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
  const host = el("div", "burst");
  host.style.left = `${x}px`;
  host.style.top = `${y}px`;
  const colors = ["#fbbf24", "#fb7185", "#38bdf8", "#4ade80", "#f472b6"];
  for (let i = 0; i < 10; i++) {
    const dot = el("i");
    const angle = (Math.PI * 2 * i) / 10 + Math.random() * 0.4;
    const dist = 46 + Math.random() * 44;
    dot.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    dot.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
    dot.style.background = colors[i % colors.length];
    dot.style.animationDelay = `${Math.random() * 70}ms`;
    host.appendChild(dot);
  }
  document.body.appendChild(host);
  setTimeout(() => host.remove(), 1100);
}

/* --------------------------------------------------------- form bits ---- */

export function fieldHTML({ id, label, value = "", type = "text", suffix = "", placeholder = "", inputmode = "" }) {
  return `
    <label class="field" for="${id}">
      <span class="field-label">${esc(label)}</span>
      <span class="field-input">
        <input id="${id}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}"
               ${inputmode ? `inputmode="${inputmode}"` : ""} autocomplete="off" />
        ${suffix ? `<span class="field-suffix">${esc(suffix)}</span>` : ""}
      </span>
    </label>`;
}

export function segmentedHTML(name, options, activeValue) {
  return `
    <div class="segmented" role="tablist" data-seg="${name}">
      ${options
        .map(
          (o) => `
        <button type="button" role="tab" data-value="${esc(o.value)}"
                class="${o.value === activeValue ? "is-active" : ""}"
                aria-selected="${o.value === activeValue}">
          ${o.icon ? icon(o.icon) : ""}<span>${esc(o.label)}</span>
        </button>`
        )
        .join("")}
    </div>`;
}

export function wireSegmented(root, name, onPick) {
  const seg = root.querySelector(`[data-seg="${name}"]`);
  if (!seg) return;
  seg.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-value]");
    if (!btn || btn.classList.contains("is-active")) return;
    haptic(6);
    seg.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("is-active", b === btn);
      b.setAttribute("aria-selected", String(b === btn));
    });
    onPick(btn.dataset.value);
  });
}

/** Turn every button in a container into one that ticks when pressed. */
export function tactile(root = document) {
  root.addEventListener(
    "pointerdown",
    (e) => {
      const btn = e.target.closest("button, .tap");
      if (btn && !btn.disabled) haptic(6);
    },
    { passive: true }
  );
}
