// History: the last week or month at a glance, plus a way back into any day.

import { METRICS } from "./config.js";
import { state, totalsFor, entriesFor } from "./store.js";
import { dayKey, daysBack, friendlyDate, weekdayLabel, shortDateLabel, fmt, num, esc, icon, clamp } from "./util.js";
import { openSheet } from "./ui.js";
import { entryCardHTML } from "./today.js";
import { openAddSheet, openEntrySheet } from "./entry.js";

let root = null;
let range = 7;

export function mountHistory(container) {
  root = container;
  root.innerHTML = `
    <header class="day-head">
      <div>
        <p class="day-greeting">How it's going</p>
        <h1 class="day-title">History</h1>
      </div>
      <div class="range-toggle" id="rangeToggle">
        <button data-range="7" class="is-active">7d</button>
        <button data-range="30">30d</button>
      </div>
    </header>

    <section class="card streak-card" id="streakCard"></section>
    <section class="card chart-card">
      <div class="section-head section-head--tight">
        <h2>Calories</h2>
        <span class="section-note" id="chartNote"></span>
      </div>
      <div class="chart" id="chart"></div>
    </section>
    <section class="card" id="avgCard"></section>
    <section class="days-wrap">
      <div class="section-head"><h2>Day by day</h2></div>
      <div class="days" id="daysList"></div>
    </section>`;

  root.querySelector("#rangeToggle").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-range]");
    if (!btn) return;
    range = Number(btn.dataset.range);
    root.querySelectorAll("[data-range]").forEach((b) => b.classList.toggle("is-active", b === btn));
    updateHistory();
  });

  root.querySelector("#daysList").addEventListener("click", (e) => {
    const row = e.target.closest("[data-day]");
    if (row) openDaySheet(row.dataset.day);
  });

  root.querySelector("#chart").addEventListener("click", (e) => {
    const bar = e.target.closest("[data-day]");
    if (bar) openDaySheet(bar.dataset.day);
  });

  updateHistory();
}

export function updateHistory() {
  if (!root) return;
  const keys = daysBack(range).reverse(); // oldest → newest
  const rows = keys.map((k) => ({ key: k, t: totalsFor(k) }));
  const logged = rows.filter((r) => r.t.logged);

  renderStreak(rows);
  renderChart(rows);
  renderAverages(logged);
  renderDays([...rows].reverse());
}

/* ------------------------------------------------------------- streak --- */

function onTarget(t) {
  return (
    t.logged &&
    t.net.kcal <= t.budget.kcal &&
    t.net.sugar_g <= t.budget.sugar_g &&
    t.net.sodium_mg <= t.budget.sodium_mg
  );
}

function currentStreak() {
  // Today only breaks a streak once something has been logged and blown past a
  // goal — an empty morning shouldn't read as a failure.
  let streak = 0;
  const today = dayKey();
  const keys = daysBack(200);
  for (const k of keys) {
    const t = totalsFor(k);
    if (k === today && !t.logged) continue;
    if (onTarget(t)) streak++;
    else break;
  }
  return streak;
}

function renderStreak(rows) {
  const streak = currentStreak();
  const good = rows.filter((r) => onTarget(r.t)).length;
  const loggedDays = rows.filter((r) => r.t.logged).length;

  root.querySelector("#streakCard").innerHTML = `
    <div class="streak-main">
      <span class="streak-flame ${streak ? "is-lit" : ""}">${icon("local_fire_department")}</span>
      <div>
        <p class="streak-value">${streak} day${streak === 1 ? "" : "s"}</p>
        <p class="streak-label">${streak ? "on target, straight" : "start a streak today"}</p>
      </div>
    </div>
    <div class="streak-side">
      <div><b>${good}</b><span>on target</span></div>
      <div><b>${loggedDays}</b><span>logged</span></div>
      <div><b>${range}</b><span>days</span></div>
    </div>`;
}

/* -------------------------------------------------------------- chart --- */

/** 7 days get a weekday each; 30 would be a smear, so label every fifth and today. */
function barLabel(key, i, total) {
  if (range === 7) return weekdayLabel(key).slice(0, 2);
  const isToday = key === dayKey();
  if (isToday || i % 5 === 0) return String(Number(key.slice(8, 10)));
  return "";
}

function renderChart(rows) {
  const goal = num(state.profile?.goals?.kcal, 1500);
  const peak = Math.max(goal * 1.15, ...rows.map((r) => r.t.net.kcal));
  const host = root.querySelector("#chart");

  root.querySelector("#chartNote").textContent = `goal ${fmt(goal)} kcal`;

  const bars = rows
    .map((r, i) => {
      const h = clamp(r.t.net.kcal / peak, 0, 1) * 100;
      const over = r.t.net.kcal > r.t.budget.kcal;
      const isToday = r.key === dayKey();
      return `
        <button class="bar-col ${isToday ? "is-today" : ""}" data-day="${r.key}"
                aria-label="${friendlyDate(r.key)}: ${fmt(r.t.net.kcal)} kcal">
          <span class="bar-track">
            <span class="bar-fill ${over ? "is-over" : ""} ${r.t.logged ? "" : "is-empty"}"
                  style="height:${h.toFixed(1)}%; animation-delay:${Math.min(i, 30) * 18}ms"></span>
          </span>
          <span class="bar-label">${barLabel(r.key, i, rows.length)}</span>
        </button>`;
    })
    .join("");

  host.innerHTML = `
    <div class="chart-inner ${range === 30 ? "chart-inner--dense" : ""}">
      <span class="chart-goal"><i></i></span>
      ${bars}
    </div>`;

  // The weekday labels sit below the tracks, so a percentage on the line and a
  // percentage on a bar don't mean the same thing. Measure once instead.
  requestAnimationFrame(() => {
    const inner = host.querySelector(".chart-inner");
    const track = host.querySelector(".bar-track");
    const line = host.querySelector(".chart-goal");
    if (!inner || !track || !line) return;
    const innerBox = inner.getBoundingClientRect();
    const trackBox = track.getBoundingClientRect();
    const y = trackBox.bottom - trackBox.height * clamp(goal / peak, 0, 1);
    line.style.bottom = `${(innerBox.bottom - y).toFixed(1)}px`;
  });
}

/* ----------------------------------------------------------- averages --- */

function renderAverages(logged) {
  const host = root.querySelector("#avgCard");
  if (!logged.length) {
    host.innerHTML = `<p class="muted-note">Nothing logged in this range yet.</p>`;
    return;
  }
  const avg = METRICS.map((m) => {
    const mean = logged.reduce((a, r) => a + num(r.t.net[m.key]), 0) / logged.length;
    const goal = num(state.profile?.goals?.[m.key]);
    const pct = goal ? clamp(mean / goal, 0, 1) : 0;
    const over = goal && mean > goal;
    return `
      <div class="avg-row tone-${m.tone}">
        <span class="avg-label">${m.label}</span>
        <span class="legend-bar ${over ? "is-over" : ""}"><i style="transform:scaleX(${pct.toFixed(3)})"></i></span>
        <span class="avg-value ${over ? "is-over" : ""}">${
          m.key === "sugar_g" ? Math.round(mean * 10) / 10 : fmt(mean)
        }<small>${m.unit}</small></span>
      </div>`;
  }).join("");

  host.innerHTML = `
    <div class="section-head section-head--tight"><h2>Daily average</h2>
      <span class="section-note">${logged.length} day${logged.length === 1 ? "" : "s"} with entries</span>
    </div>
    <div class="avgs">${avg}</div>`;
}

/* --------------------------------------------------------------- days --- */

function renderDays(rows) {
  const host = root.querySelector("#daysList");
  host.innerHTML = rows
    .map((r) => {
      const t = r.t;
      if (!t.logged) {
        return `
          <button class="day-row day-row--empty" data-day="${r.key}">
            <span class="day-row-date">${esc(friendlyDate(r.key))}</span>
            <span class="day-row-none">nothing logged</span>
            ${icon("chevron_right", "entry-chevron")}
          </button>`;
      }
      const pills = METRICS.map((m) => {
        const over = t.net[m.key] > t.budget[m.key];
        return `<span class="day-pill tone-${m.tone} ${over ? "is-over" : ""}">${
          m.key === "sugar_g" ? Math.round(t.net[m.key] * 10) / 10 : fmt(t.net[m.key])
        }<i>${m.unit}</i></span>`;
      }).join("");
      return `
        <button class="day-row" data-day="${r.key}">
          <span class="day-row-head">
            <span class="day-row-date">${esc(friendlyDate(r.key))}</span>
            ${onTarget(t) ? `<span class="day-tick">${icon("check_circle")}</span>` : ""}
          </span>
          <span class="day-pills">${pills}</span>
          ${icon("chevron_right", "entry-chevron")}
        </button>`;
    })
    .join("");
}

/* ---------------------------------------------------------- day sheet --- */

export function openDaySheet(date) {
  const summary = totalsFor(date);
  const bits = [];
  if (summary.meals) bits.push(`${summary.meals} meal${summary.meals === 1 ? "" : "s"}`);
  if (summary.workouts) bits.push(`${summary.workouts} workout${summary.workouts === 1 ? "" : "s"}`);
  if (!bits.length) bits.push("nothing logged");

  openSheet({
    title: friendlyDate(date),
    // "Today"/"Yesterday" still want the real date spelled out; a titled
    // "Thu, Sep 3" does not want it said twice.
    subtitle: /^(Today|Yesterday)$/.test(friendlyDate(date))
      ? `${weekdayLabel(date)}, ${shortDateLabel(date)} · ${bits.join(" · ")}`
      : bits.join(" · "),
    icon: "calendar_month",
    wide: true,
    build(body) {
      const t = totalsFor(date);
      const list = entriesFor(date);

      body.innerHTML = `
        <div class="totals">
          ${METRICS.map((m) => {
            const over = t.net[m.key] > t.budget[m.key];
            return `
              <div class="total tone-${m.tone} ${over ? "is-over" : ""}">
                <span class="total-value">${m.key === "sugar_g" ? Math.round(t.net[m.key] * 10) / 10 : fmt(t.net[m.key])}</span>
                <span class="total-unit">of ${fmt(t.budget[m.key])} ${m.unit}</span>
                <span class="total-label">${m.label}</span>
              </div>`;
          }).join("")}
        </div>
        ${t.burn ? `<p class="day-burn">${icon("bolt", "sm")}${fmt(t.kcal)} eaten, ${fmt(t.burn)} burned</p>` : ""}
        <div class="timeline timeline--sheet">
          ${
            list.length
              ? list.map((e) => entryCardHTML(e, date)).join("")
              : `<p class="muted-note">Nothing logged this day.</p>`
          }
        </div>
        <button class="btn btn-soft btn-block tap" id="dsAdd">${icon("add")}Add to this day</button>`;

      body.querySelector(".timeline").addEventListener("click", (e) => {
        const card = e.target.closest(".entry");
        if (card) openEntrySheet(card.dataset.date, card.dataset.id);
      });
      body.querySelector("#dsAdd").onclick = () => openAddSheet(date);
    },
  });
}
