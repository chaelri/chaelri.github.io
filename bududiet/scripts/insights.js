import { state } from "./state.js";
import { getDB } from "./sync/firebase.js";
import {
  ref,
  get,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

/* =============================
   Public API
============================= */

export async function bindInsights() {
  const selfEl = document.getElementById("weeklySelf");
  const partnerEl = document.getElementById("weeklyPartner");
  const selfBars = document.getElementById("weeklySelfBars");
  const partnerBars = document.getElementById("weeklyPartnerBars");

  if (!selfEl || !partnerEl) return;

  const days = lastNDays(7);

  const self = await sumForUser(state.user.uid, days);
  render(selfEl, self);
  renderBars(selfBars, self);

  if (state.partner?.uid) {
    const partner = await sumForUser(state.partner.uid, days);
    render(partnerEl, partner);
    renderBars(partnerBars, partner);
  } else {
    partnerEl.innerHTML = `<div class="muted">No data</div>`;
  }
}

/* =============================
   Data aggregation
============================= */

async function sumForUser(uid, days) {
  const db = getDB();

  let food = 0;
  let exercise = 0;
  const perDay = [];

  for (const day of days) {
    let dayFood = 0;
    let dayExercise = 0;

    const snap = await get(ref(db, `users/${uid}/logs/${day}`));
    const logs = snap.val() || {};

    for (const k in logs) {
      const log = logs[k];
      const kcal = Number(log.kcal) || 0;

      if (log.kind === "food") {
        food += kcal;
        dayFood += kcal;
      }

      if (log.kind === "exercise") {
        exercise += kcal;
        dayExercise += kcal;
      }
    }

    perDay.push({
      date: day,
      net: dayFood - dayExercise,
    });
  }

  return {
    food,
    exercise,
    net: food - exercise,
    perDay,
  };
}

/* =============================
   Render summary cards
============================= */

function render(el, data) {
  if (!data.perDay.length) {
    el.innerHTML = `<div class="muted">No data</div>`;
    return;
  }

  const avg = Math.round(data.net / data.perDay.length);
  const { best, worst } = bestWorst(data);

  el.innerHTML = `
    <div class="glass pad-md">
      <div class="muted">Food</div>
      <strong>${data.food} kcal</strong>
    </div>

    <div class="glass pad-md">
      <div class="muted">Exercise</div>
      <strong>${data.exercise} kcal</strong>
    </div>

    <div class="glass pad-md">
      <div class="muted">Net</div>
      <strong>${data.net} kcal</strong>
    </div>

    <div class="glass pad-md">
      <div class="muted">Daily avg</div>
      <strong>${avg} kcal</strong>
    </div>

    <div class="glass pad-md">
      <div class="muted">Best day</div>
      <strong>${formatDay(best.date)} (${best.net} kcal)</strong>
    </div>

    <div class="glass pad-md">
      <div class="muted">Worst day</div>
      <strong>${formatDay(worst.date)} (${worst.net} kcal)</strong>
    </div>
  `;
}

/* =============================
   Mini bars (Mon → Sun)
============================= */

function renderBars(el, data) {
  if (!el || !data.perDay.length) return;

  const max = Math.max(...data.perDay.map((d) => Math.abs(d.net)), 1);

  el.innerHTML = `
    <div style="display:flex;gap:6px;align-items:flex-end">
      ${data.perDay
        .slice()
        .reverse()
        .map(
          (d) => `
        <div style="flex:1;text-align:center">
          <div
            style="
              height:${Math.max(6, (Math.abs(d.net) / max) * 48)}px;
              background:${d.net > 0 ? "#ef4444" : "#22c55e"};
              border-radius:6px;
              opacity:0.85;
            "
          ></div>
          <div class="muted" style="font-size:10px;margin-top:4px">
            ${shortDay(d.date)}
          </div>
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

/* =============================
   Helpers
============================= */

function bestWorst(data) {
  let best = data.perDay[0];
  let worst = data.perDay[0];

  for (const d of data.perDay) {
    if (d.net < best.net) best = d;
    if (d.net > worst.net) worst = d;
  }

  return { best, worst };
}

function lastNDays(n) {
  const out = [];
  const d = new Date();

  for (let i = 0; i < n; i++) {
    out.push(getLocalDateKey(d));
    d.setDate(d.getDate() - 1);
  }

  return out;
}

function getLocalDateKey(date = new Date()) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function formatDay(date) {
  return new Date(date).toLocaleDateString(undefined, {
    weekday: "long",
  });
}

function shortDay(date) {
  return new Date(date).toLocaleDateString(undefined, {
    weekday: "short",
  });
}
