// Boot, tabs, and the wiring between the store and the three screens.

import { PEOPLE } from "./config.js";
import { initStore, onChange, setWho, state } from "./store.js";
import { $, $$, dayKey, icon, esc, haptic, ageFrom } from "./util.js";
import { tactile, toast } from "./ui.js";
import { mountToday, updateToday } from "./today.js";
import { mountHistory, updateHistory } from "./history.js";
import { mountProfile, updateProfile, openWhoSheet } from "./profile.js";
import {
  openAddSheet,
  openEntrySheet,
  openDescribeSheet,
  openMoveSheet,
  openPartnerSheet,
  pickImage,
} from "./entry.js";

const VIEWS = {
  today: { mount: mountToday, update: updateToday, mounted: false },
  history: { mount: mountHistory, update: updateHistory, mounted: false },
  me: { mount: mountProfile, update: updateProfile, mounted: false },
};

let current = "today";
let lastDay = dayKey();

/* --------------------------------------------------------------- boot --- */

/* iOS Safari has ignored user-scalable=no since iOS 10, and touch-action isn't
   honoured for pinch there either. Swallowing the gesture events is the only
   handle a web page gets — without it a two-finger pinch zooms the whole app. */
function lockZoom() {
  ["gesturestart", "gesturechange", "gestureend"].forEach((evt) =>
    document.addEventListener(evt, (e) => e.preventDefault(), { passive: false })
  );
  // Browsers that route a pinch through touch events rather than gesture ones.
  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false }
  );
}

async function boot() {
  lockZoom();
  tactile(document.body);
  await initStore();

  if (!state.who) {
    showWelcome();
    return;
  }
  startApp();
}

function showWelcome() {
  const gate = $("#welcome");
  gate.hidden = false;
  gate.innerHTML = `
    <div class="welcome-inner">
      <div class="welcome-mark">${icon("ramen_dining")}</div>
      <h1>Kain</h1>
      <p class="welcome-sub">Snap what you eat. I'll count the calories, sugar and sodium — you just keep showing up.</p>
      <p class="welcome-ask">Sino 'to?</p>
      <div class="who-grid">
        ${PEOPLE.map(
          (p) => `
          <button class="who-card tap" data-who="${p.id}" data-accent="${p.accent}">
            <span class="who-initial who-initial--lg">${p.initial}</span>
            <b>${esc(p.name)}</b>
            <small>${p.sex === "male" ? "Male" : "Female"} · ${ageFrom(p.birth)}</small>
          </button>`
        ).join("")}
      </div>
      <p class="welcome-foot">You can switch anytime — it's remembered on this phone.</p>
    </div>`;

  gate.addEventListener("click", (e) => {
    const card = e.target.closest("[data-who]");
    if (!card) return;
    haptic(14);
    setWho(card.dataset.who);
    gate.classList.add("is-leaving");
    setTimeout(() => {
      gate.hidden = true;
      gate.classList.remove("is-leaving");
      startApp();
    }, 420);
  });
}

function startApp() {
  $("#app").hidden = false;
  switchView("today", { instant: true });

  onChange(() => {
    // Only repaint what's on screen; the others refresh when you switch to them.
    VIEWS[current].update?.();
    if (current !== "today" && VIEWS.today.mounted) VIEWS.today.update();
  });

  // Crossing midnight while the app sits open should roll the day over.
  setInterval(() => {
    const today = dayKey();
    if (today !== lastDay) {
      lastDay = today;
      Object.values(VIEWS).forEach((v) => v.mounted && v.update());
      toast("New day — clean slate", { tone: "good", icon: "wb_twilight" });
    }
  }, 60_000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (dayKey() !== lastDay) {
      lastDay = dayKey();
      Object.values(VIEWS).forEach((v) => v.mounted && v.update());
    } else {
      VIEWS[current].update?.();
    }
  });
}

/* --------------------------------------------------------------- tabs --- */

function switchView(name, { instant = false } = {}) {
  if (!VIEWS[name]) return;
  const target = $(`#view-${name}`);
  const previous = $(`#view-${current}`);

  if (!VIEWS[name].mounted) {
    VIEWS[name].mount(target);
    VIEWS[name].mounted = true;
  } else {
    VIEWS[name].update();
  }

  if (previous && previous !== target) previous.hidden = true;
  target.hidden = false;
  if (!instant) {
    target.classList.remove("view-in");
    void target.offsetWidth; // restart the animation
    target.classList.add("view-in");
  }

  current = name;
  $$("#tabbar [data-tab]").forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-current", on ? "page" : "false");
  });
  window.scrollTo({ top: 0, behavior: instant ? "auto" : "smooth" });
}

/* ------------------------------------------------------------ wiring --- */

$("#tabbar").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-tab]");
  if (!btn) return;
  haptic(6);
  switchView(btn.dataset.tab);
});

$("#fab").addEventListener("click", () => {
  haptic(10);
  openAddSheet();
});

// Long-press the + to jump straight to the camera.
let fabTimer = null;
const fab = $("#fab");
fab.addEventListener("pointerdown", () => {
  fabTimer = setTimeout(() => {
    fabTimer = null;
    haptic(16);
    pickImage({ camera: true });
  }, 520);
});
["pointerup", "pointerleave", "pointercancel"].forEach((evt) =>
  fab.addEventListener(evt, () => {
    clearTimeout(fabTimer);
  })
);

// Entry taps anywhere in the app (Today's timeline lives inside #app).
$("#app").addEventListener("click", (e) => {
  const card = e.target.closest(".entry");
  if (card?.dataset.id) {
    openEntrySheet(card.dataset.date, card.dataset.id);
    return;
  }
  const who = e.target.closest("#whoChip");
  if (who) {
    openWhoSheet();
    return;
  }
  if (e.target.closest("[data-partner]")) {
    openPartnerSheet();
    return;
  }
  const add = e.target.closest("[data-add]");
  if (add) {
    const kind = add.dataset.add;
    if (kind === "choose") openAddSheet();
    else if (kind === "camera") pickImage({ camera: true });
    else if (kind === "describe") openDescribeSheet();
    else if (kind === "exercise") openMoveSheet();
  }
});

// Enter opens an entry when it's focused via keyboard (desktop).
$("#app").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const card = e.target.closest?.(".entry");
  if (card?.dataset.id) openEntrySheet(card.dataset.date, card.dataset.id);
});

boot();
