// The Today screen: three rings, what's left, and the day's timeline.

import { METRICS } from "./config.js";
import { state, totalsFor, entriesFor, me, partner, saveProfile } from "./store.js";
import {
  dayKey,
  longDateLabel,
  greeting,
  clockLabel,
  mealSlot,
  fmt,
  num,
  esc,
  icon,
  countUp,
  clamp,
  haptic,
  avatar,
} from "./util.js";
import { ringStackHTML, setRings, miniRingHTML } from "./ui.js";

const METRIC_BY_KEY = Object.fromEntries(METRICS.map((m) => [m.key, m]));

let root = null;
let focusKey = "kcal"; // which metric the middle of the rings reports
let centerMode = "left"; // "left" = what's still available, "total" = what's used
let seenIds = new Set(); // so only genuinely new cards animate in

export function mountToday(container) {
  root = container;
  root.innerHTML = `
    <header class="day-head">
      <div>
        <p class="day-greeting" id="dayGreeting"></p>
        <h1 class="day-title" id="dayTitle"></h1>
      </div>
      <button class="who-chip tap" id="whoChip" aria-label="Switch person"></button>
    </header>

    <section class="hero card" id="hero">
      <div class="hero-stage">
        ${ringStackHTML()}
      </div>
      <div class="legend" id="legend"></div>
      <div class="hero-chips" id="heroChips"></div>
    </section>

    <section class="quick" id="quickRow">
      <button class="quick-btn quick-btn--photo tap" data-add="camera">
        ${icon("photo_camera")}<span>Snap a meal</span>
      </button>
      <button class="quick-btn tap" data-add="describe">
        ${icon("edit_note")}<span>Type it</span>
      </button>
      <button class="quick-btn tap" data-add="exercise">
        ${icon("directions_run")}<span>Move</span>
      </button>
    </section>

    <section class="timeline-wrap">
      <div class="section-head">
        <h2>Today's log</h2>
        <span class="section-note" id="timelineNote"></span>
      </div>
      <div class="timeline" id="timeline"></div>
    </section>

    <section id="partnerCard"></section>`;

  root.querySelector("#legend").addEventListener("click", (e) => {
    const row = e.target.closest("[data-metric]");
    if (!row) return;
    focusKey = row.dataset.metric;
    renderCenter();
    root.querySelectorAll("[data-metric]").forEach((r) => r.classList.toggle("is-focus", r === row));
    // Remembered per person, so the ring opens the way you left it on either
    // phone rather than resetting to calories every time.
    saveProfile({ ringMetric: focusKey });
  });

  root.querySelector("#ringCenter").addEventListener("click", () => {
    centerMode = centerMode === "left" ? "total" : "left";
    haptic(8);
    renderCenter();
    saveProfile({ ringMode: centerMode });
  });

  updateToday();
}

export function updateToday() {
  if (!root) return;
  const today = dayKey();
  const person = me();
  const t = totalsFor(today);

  // The saved display wins — including when it arrives from the other device.
  if (METRIC_BY_KEY[state.profile?.ringMetric]) focusKey = state.profile.ringMetric;
  centerMode = state.profile?.ringMode === "total" ? "total" : "left";

  root.querySelector("#dayGreeting").textContent = `${greeting()}, ${person.name.toLowerCase()}`;
  root.querySelector("#dayTitle").textContent = longDateLabel(today);

  const chip = root.querySelector("#whoChip");
  chip.dataset.accent = person.accent;
  chip.innerHTML = `${avatar(person)}${icon("unfold_more", "who-caret")}`;

  renderLegend(t);
  renderCenter(t);
  renderChips(t);
  renderTimeline(today);
  renderPartner();

  const pcts = {
    kcal: safePct(t.net.kcal, t.budget.kcal),
    sugar_g: safePct(t.net.sugar_g, t.budget.sugar_g),
    sodium_mg: safePct(t.net.sodium_mg, t.budget.sodium_mg),
  };
  setRings(
    root,
    pcts,
    // Where the ring would have reached without today's movement.
    { kcal: safePct(t.kcal, t.budget.kcal) }
  );
}

function safePct(used, goal) {
  return num(goal) > 0 ? num(used) / num(goal) : 0;
}

/* ------------------------------------------------------------- pieces --- */
/* --------------------------------------------------------------- words --- */
/* Everything you ate and did today, drifting behind the ring. Low enough in
   opacity to be atmosphere rather than text you have to read past. */


function renderCenter(t = totalsFor(dayKey())) {
  const m = METRIC_BY_KEY[focusKey];
  const left = t.left[focusKey];
  const over = left < 0;
  const isTotal = centerMode === "total";
  // In total mode it shows what counts against the goal, so the number always
  // agrees with how far the ring has actually filled.
  const value = isTotal ? t.net[focusKey] : Math.abs(left);
  const center = root.querySelector("#ringCenter");

  center.className = `ring-center tone-${m.tone}${!isTotal && over ? " is-over" : ""}`;
  if (!center.querySelector(".ring-value")) {
    center.innerHTML = `
      <span class="ring-eyebrow"></span>
      <span class="ring-value" data-value="0">0</span>
      <span class="ring-unit"></span>`;
  }
  center.querySelector(".ring-eyebrow").innerHTML = `${
    isTotal ? "total" : over ? "over by" : "left"
  }${icon("swap_vert", "ring-swap")}`;
  center.querySelector(".ring-unit").textContent = isTotal ? `of ${fmt(t.budget[focusKey])} ${m.unit}` : m.centre;
  countUp(center.querySelector(".ring-value"), value, {
    format: (v) => (m.key === "sugar_g" ? (Math.round(v * 10) / 10).toLocaleString("en-US") : fmt(v)),
  });
}

function renderLegend(t) {
  const legend = root.querySelector("#legend");
  const rows = METRICS.map((m) => {
    // Net counts against the goal; only calories can be offset by moving.
    const used = t.net[m.key];
    const goal = t.budget[m.key];
    const pct = clamp(safePct(used, goal), 0, 1);
    const over = used > goal;
    const decimals = m.key === "sugar_g";
    // The indicator Charlie asked for: the goal stays put and the workout is
    // shown as the subtraction it actually is.
    const showsOffset = m.key === "kcal" && t.offset > 0;
    return `
      <button type="button" class="legend-row tone-${m.tone} ${m.key === focusKey ? "is-focus" : ""}" data-metric="${m.key}">
        <span class="legend-dot"></span>
        <span class="legend-label">${m.label}</span>
        <span class="legend-numbers ${over ? "is-over" : ""}">
          <b>${decimals ? (Math.round(used * 10) / 10).toLocaleString("en-US") : fmt(used)}</b>
          <span>/ ${fmt(goal)} ${m.unit}</span>
        </span>
        <span class="legend-bar ${over ? "is-over" : ""}"><i style="transform:scaleX(${pct.toFixed(3)})"></i></span>
        ${
          showsOffset
            ? `<span class="legend-offset">${fmt(t.kcal)} eaten <b>− ${fmt(t.offset)}</b> moved</span>`
            : ""
        }
      </button>`;
  }).join("");
  legend.innerHTML = rows;
}

function renderChips(t) {
  const host = root.querySelector("#heroChips");
  const bits = [
    `<span class="chip">${icon("restaurant")}${t.meals} meal${t.meals === 1 ? "" : "s"}</span>`,
    `<span class="chip">${icon("local_fire_department")}${fmt(t.kcal)} eaten</span>`,
  ];
  if (t.burn > 0) {
    bits.push(
      `<span class="chip chip--burn">${icon("bolt")}${fmt(t.burn)} burned${
        t.offset > 0 ? " · off today's total" : ""
      }</span>`
    );
  }
  host.innerHTML = bits.join("");
}

function renderTimeline(date) {
  const list = entriesFor(date);
  const host = root.querySelector("#timeline");
  const note = root.querySelector("#timelineNote");
  note.textContent = list.length ? `${list.length} entr${list.length === 1 ? "y" : "ies"}` : "";

  if (!list.length) {
    host.innerHTML = `
      <button type="button" class="empty tap" data-add="choose">
        <span class="empty-art">${icon("ramen_dining")}</span>
        <span class="empty-title">Wala pa today</span>
        <span class="empty-sub">Snap your first meal and I'll do the counting.</span>
        <span class="empty-cta">${icon("add")}Log something</span>
      </button>`;
    seenIds = new Set();
    return;
  }

  let lastSlot = "";
  const cards = list
    .map((e) => {
      const slot = e.kind === "exercise" ? "Movement" : mealSlot(e.ts);
      const header = slot !== lastSlot ? `<p class="slot-label">${esc(slot)}</p>` : "";
      lastSlot = slot;
      return header + entryCardHTML(e, date);
    })
    .join("");

  host.innerHTML = cards;

  // Stagger only the cards that weren't on screen a moment ago.
  const nextSeen = new Set();
  host.querySelectorAll(".entry").forEach((card, i) => {
    const id = card.dataset.id;
    nextSeen.add(id);
    if (!seenIds.has(id)) {
      card.classList.add("is-fresh");
      card.style.animationDelay = `${Math.min(i, 6) * 45}ms`;
    }
  });
  seenIds = nextSeen;
}

export function entryCardHTML(e, date) {
  if (e.kind === "exercise") {
    return `
      <article class="entry entry--move" data-id="${esc(e.id)}" data-date="${esc(date)}" tabindex="0">
        <div class="entry-thumb entry-thumb--move">${icon(e.steps ? "footprint" : "directions_run")}</div>
        <div class="entry-main">
          <p class="entry-title"><span class="entry-name">${esc(e.title || e.activity || "Movement")}</span></p>
          <p class="entry-sub">${esc(clockLabel(e.ts))}${
            e.minutes ? ` · ${fmt(e.minutes)} min` : ""
          }${e.steps ? ` · ${fmt(e.steps)} steps` : ""}</p>
        </div>
        <div class="entry-burn">−${fmt(e.burn)}<span>kcal</span></div>
      </article>`;
  }

  const thumb = e.thumb
    ? `<img src="${e.thumb}" alt="" loading="lazy" />`
    // Food is food: how it got logged — snapped or typed — is not what the
    // timeline is telling you.
    : icon("restaurant");

  return `
    <article class="entry" data-id="${esc(e.id)}" data-date="${esc(date)}" tabindex="0">
      <div class="entry-thumb">${thumb}</div>
      <div class="entry-main">
        <p class="entry-title">
          <span class="entry-name">${esc(e.title || "Meal")}</span>${
          e.brand ? `<span class="entry-brand">${esc(e.brand)}</span>` : ""
        }</p>
        <p class="entry-sub">${esc(clockLabel(e.ts))}${
          e.items?.length ? ` · ${e.items.length} item${e.items.length === 1 ? "" : "s"}` : ""
        }</p>
        <div class="entry-stats">
          <span class="stat tone-kcal">${fmt(e.kcal)}<i>kcal</i></span>
          <span class="stat tone-sugar">${Math.round(num(e.sugar_g) * 10) / 10}<i>g</i></span>
          <span class="stat tone-sodium">${fmt(e.sodium_mg)}<i>mg</i></span>
        </div>
      </div>
      ${icon("chevron_right", "entry-chevron")}
    </article>`;
}

function renderPartner() {
  const host = root.querySelector("#partnerCard");
  if (state.profile?.showPartner === false) {
    host.innerHTML = "";
    return;
  }
  const other = partner();
  const today = dayKey();
  const t = totalsFor(today, state.partner.days, state.partner.profile);

  if (!t.logged) {
    host.innerHTML = `
      <div class="partner card partner--quiet">
        ${avatar(other, "who-initial--sm")}
        <p>${esc(other.name)} hasn't logged anything today.</p>
      </div>`;
    return;
  }

  // A peek at what she actually ate — the names are the interesting part, and
  // tapping opens her full day with a one-tap "Same" on every row.
  const names = entriesFor(today, state.partner.days)
    .filter((e) => e.kind !== "exercise")
    .map((e) => e.title)
    .filter(Boolean);

  const rows = METRICS.map((m) => {
    const pct = clamp(safePct(t.net[m.key], t.budget[m.key]), 0, 1);
    const over = t.net[m.key] > t.budget[m.key];
    return `
      <span class="partner-metric tone-${m.tone}">
        <span class="partner-metric-label">${m.short}</span>
        <span class="legend-bar ${over ? "is-over" : ""}"><i style="transform:scaleX(${pct.toFixed(3)})"></i></span>
        <span class="partner-metric-value ${over ? "is-over" : ""}">${
          m.key === "sugar_g" ? Math.round(t.net[m.key] * 10) / 10 : fmt(t.net[m.key])
        }<i>${m.unit}</i></span>
      </span>`;
  }).join("");

  host.innerHTML = `
    <button type="button" class="partner card tap" data-partner="1">
      <span class="partner-head">
        ${avatar(other, "who-initial--sm")}
        <span class="partner-head-text">
          <span class="partner-name">${esc(other.name)}'s day</span>
          <span class="partner-sub">${t.meals} meal${t.meals === 1 ? "" : "s"}${
            t.burn ? ` · ${fmt(t.burn)} kcal burned` : ""
          }</span>
        </span>
        ${icon("chevron_right", "entry-chevron")}
      </span>
      ${names.length ? `<span class="partner-names">${esc(names.slice(0, 3).join(" · "))}${names.length > 3 ? ` +${names.length - 3}` : ""}</span>` : ""}
      <span class="partner-body">
        ${miniRingHTML({
          kcal: safePct(t.net.kcal, t.budget.kcal),
          sugar_g: safePct(t.net.sugar_g, t.budget.sugar_g),
          sodium_mg: safePct(t.net.sodium_mg, t.budget.sodium_mg),
        })}
        <span class="partner-metrics">${rows}</span>
      </span>
    </button>`;
}
