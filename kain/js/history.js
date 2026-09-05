// History: the last week or month at a glance, plus a way back into any day.

import { METRICS } from "./config.js";
import { state, totalsFor, entriesFor, me, partner, onChange } from "./store.js";
import {
  dayKey,
  daysBack,
  friendlyDate,
  weekdayLabel,
  shortDateLabel,
  fmt,
  num,
  esc,
  icon,
  clamp,
  avatar,
} from "./util.js";
import { openSheet } from "./ui.js";
import { entryCardHTML } from "./today.js";
import { openAddSheet, openEntrySheet, partnerRowHTML, wirePartnerRows } from "./entry.js";

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
  // Shared history: every row carries both of you, so the whole screen answers
  // "how are WE doing" rather than just you.
  const rows = keys.map((k) => ({
    key: k,
    t: totalsFor(k),
    p: totalsFor(k, state.partner.days, state.partner.profile),
  }));

  renderStreak(rows);
  renderChart(rows);
  renderAverages(rows);
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
  const meP = me();
  const otherP = partner();
  const goal = num(state.profile?.goals?.kcal, 1500);
  const peak = Math.max(
    goal * 1.15,
    ...rows.map((r) => Math.max(r.t.net.kcal, r.p.net.kcal))
  );
  const host = root.querySelector("#chart");

  root.querySelector("#chartNote").textContent = `goal ${fmt(goal)} kcal`;

  const bar = (t, who) => {
    const h = clamp(t.net.kcal / peak, 0, 1) * 100;
    const over = t.net.kcal > t.budget.kcal;
    return `<span class="bar-half bar-half--${who} ${over ? "is-over" : ""} ${
      t.logged ? "" : "is-empty"
    }" style="height:${h.toFixed(1)}%"></span>`;
  };

  const bars = rows
    .map((r, i) => {
      const isToday = r.key === dayKey();
      return `
        <button class="bar-col ${isToday ? "is-today" : ""}" data-day="${r.key}"
                style="--i:${Math.min(i, 30)}"
                aria-label="${friendlyDate(r.key)}: you ${fmt(r.t.net.kcal)} kcal, ${esc(
        otherP.name
      )} ${fmt(r.p.net.kcal)} kcal">
          <span class="bar-track bar-track--pair">
            ${bar(r.t, "me")}${bar(r.p, "them")}
          </span>
          <span class="bar-label">${barLabel(r.key, i, rows.length)}</span>
        </button>`;
    })
    .join("");

  host.innerHTML = `
    <div class="chart-legend">
      <span class="chart-key">${avatar(meP, "who-initial--xs")}You</span>
      <span class="chart-key">${avatar(otherP, "who-initial--xs")}${esc(otherP.name)}</span>
    </div>
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

function renderAverages(rows) {
  const host = root.querySelector("#avgCard");
  const meLogged = rows.filter((r) => r.t.logged);
  const themLogged = rows.filter((r) => r.p.logged);
  const otherP = partner();

  if (!meLogged.length && !themLogged.length) {
    host.innerHTML = `<p class="muted-note">Nothing logged in this range yet.</p>`;
    return;
  }

  const mean = (list, key, side) =>
    list.length ? list.reduce((a, r) => a + num(r[side].net[key]), 0) / list.length : 0;

  const cell = (list, m, side, goal) => {
    if (!list.length) return `<span class="avg-cell is-blank">—</span>`;
    const v = mean(list, m.key, side);
    const over = goal && v > goal;
    return `<span class="avg-cell ${over ? "is-over" : ""}">${
      m.key === "sugar_g" ? Math.round(v * 10) / 10 : fmt(v)
    }<small>${m.unit}</small></span>`;
  };

  const goals = state.profile?.goals || {};
  const theirGoals = state.partner.profile?.goals || {};

  host.innerHTML = `
    <div class="section-head section-head--tight"><h2>Daily average</h2></div>
    <div class="avg-grid">
      <span></span>
      <span class="avg-head">${avatar(me(), "who-initial--xs")}You</span>
      <span class="avg-head">${avatar(otherP, "who-initial--xs")}${esc(otherP.name)}</span>
      ${METRICS.map(
        (m) => `
        <span class="avg-metric tone-${m.tone}"><i class="avg-dot"></i>${m.label}</span>
        ${cell(meLogged, m, "t", num(goals[m.key]))}
        ${cell(themLogged, m, "p", num(theirGoals[m.key]))}`
      ).join("")}
    </div>
    <p class="muted-note avg-foot">${meLogged.length} day${meLogged.length === 1 ? "" : "s"} logged · ${
      themLogged.length
    } for ${esc(otherP.name)}</p>`;
}

/* --------------------------------------------------------------- days --- */

function renderDays(rows) {
  const host = root.querySelector("#daysList");
  const otherP = partner();

  const line = (t, person, isMe) => {
    if (!t.logged) {
      return `<span class="day-line is-blank">${avatar(person, "who-initial--xs")}<span class="day-row-none">nothing logged</span></span>`;
    }
    const pills = METRICS.map((m) => {
      const over = t.net[m.key] > t.budget[m.key];
      return `<span class="day-pill tone-${m.tone} ${over ? "is-over" : ""}">${
        m.key === "sugar_g" ? Math.round(t.net[m.key] * 10) / 10 : fmt(t.net[m.key])
      }<i>${m.unit}</i></span>`;
    }).join("");
    return `<span class="day-line">${avatar(person, "who-initial--xs")}<span class="day-pills">${pills}</span>${
      onTarget(t) ? `<span class="day-tick">${icon("check_circle")}</span>` : ""
    }</span>`;
  };

  host.innerHTML = rows
    .map(
      (r) => `
      <button class="day-row ${!r.t.logged && !r.p.logged ? "day-row--empty" : ""}" data-day="${r.key}">
        <span class="day-row-head">
          <span class="day-row-date">${esc(friendlyDate(r.key))}</span>
          ${icon("chevron_right", "entry-chevron")}
        </span>
        ${line(r.t, me(), true)}
        ${line(r.p, otherP, false)}
      </button>`
    )
    .join("");
}

/* ---------------------------------------------------------- day sheet --- */

export function openDaySheet(date) {
  const meP = me();
  const otherP = partner();
  let unsub = null;

  // Same pills as the day rows in the list behind this sheet, so the numbers
  // look like the ones you just tapped.
  const pills = (t) =>
    METRICS.map((m) => {
      const over = t.net[m.key] > t.budget[m.key];
      return `<span class="day-pill tone-${m.tone} ${over ? "is-over" : ""}">${
        m.key === "sugar_g" ? Math.round(t.net[m.key] * 10) / 10 : fmt(t.net[m.key])
      }<i>${m.unit}</i></span>`;
    }).join("");

  const side = (person, t, listHTML, isMine) => `
    <section class="day-side">
      <div class="day-side-head">
        ${avatar(person, "who-initial--sm")}
        <span class="day-side-name">${isMine ? "You" : esc(person.name)}</span>
        ${t.logged && onTarget(t) ? `<span class="day-tick">${icon("check_circle")}</span>` : ""}
      </div>
      <div class="day-pills day-side-pills">${pills(t)}</div>
      ${
        t.burn
          ? `<p class="day-burn">${icon("bolt", "sm")}${fmt(t.kcal)} eaten, ${fmt(t.burn)} burned</p>`
          : ""
      }
      <div class="timeline timeline--sheet" data-side="${isMine ? "me" : "them"}">
        ${listHTML || `<p class="muted-note">Nothing logged.</p>`}
      </div>
      ${isMine ? `<button class="btn btn-soft btn-block tap" id="dsAdd">${icon("add")}Add to this day</button>` : ""}
    </section>`;

  openSheet({
    title: friendlyDate(date),
    icon: "calendar_month",
    wide: true,
    split: true,
    onClose: () => unsub?.(),
    build(body, sheet) {
      // Logging from inside this sheet has to show up in it. The sheet is built
      // once, so without re-rendering on store changes the new entry lands in
      // Firebase and the list you are looking at stays stale.
      const render = () => {
        const mine = totalsFor(date);
        const theirs = totalsFor(date, state.partner.days, state.partner.profile);
        const myList = entriesFor(date);
        const theirList = entriesFor(date, state.partner.days);

        const bits = [];
        const meals = mine.meals + theirs.meals;
        const workouts = mine.workouts + theirs.workouts;
        if (meals) bits.push(`${meals} meal${meals === 1 ? "" : "s"}`);
        if (workouts) bits.push(`${workouts} workout${workouts === 1 ? "" : "s"}`);
        if (!bits.length) bits.push("nothing logged");
        sheet.setSubtitle(
          /^(Today|Yesterday)$/.test(friendlyDate(date))
            ? `${weekdayLabel(date)}, ${shortDateLabel(date)} · ${bits.join(" · ")}`
            : bits.join(" · ")
        );

        // Re-rendering under someone's finger shouldn't move the page.
        const scroll = body.scrollTop;
        body.innerHTML = `
          <div class="day-split">
            ${side(meP, mine, myList.map((e) => entryCardHTML(e, date)).join(""), true)}
            ${side(otherP, theirs, theirList.map(partnerRowHTML).join(""), false)}
          </div>`;
        body.scrollTop = scroll;

        body.querySelector('[data-side="me"]').addEventListener("click", (e) => {
          const card = e.target.closest(".entry");
          if (card) openEntrySheet(card.dataset.date, card.dataset.id);
        });
        wirePartnerRows(body.querySelector('[data-side="them"]'), theirList, otherP);
        body.querySelector("#dsAdd").onclick = () => openAddSheet(date);
      };

      render();
      unsub = onChange(render);
    },
  });
}
