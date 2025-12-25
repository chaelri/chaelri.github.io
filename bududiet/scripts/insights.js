import { state } from "./state.js";
import { getDB } from "./sync/firebase.js";
import {
  ref,
  get,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

export async function bindInsights() {
  const selfEl = document.getElementById("weeklySelf");
  const partnerEl = document.getElementById("weeklyPartner");
  if (!selfEl || !partnerEl) return;

  selfEl.innerHTML = `<div class="muted">Loading…</div>`;
  partnerEl.innerHTML = `<div class="muted">Loading…</div>`;

  const days = lastNDays(7);

  const self = await sumForUser(state.user.uid, days);
  render(selfEl, self);

  if (state.partner?.uid) {
    const partner = await sumForUser(state.partner.uid, days);
    render(partnerEl, partner);
  } else {
    partnerEl.innerHTML = `<div class="muted">No data</div>`;
  }
}

async function sumForUser(uid, days) {
  const db = getDB();

  let food = 0;
  let exercise = 0;

  for (const day of days) {
    const snap = await get(ref(db, `users/${uid}/logs/${day}`));
    const logs = snap.val() || {};
    for (const k in logs) {
      const log = logs[k];
      if (log.kind === "food") food += log.kcal;
      if (log.kind === "exercise") exercise += log.kcal;
    }
  }

  return {
    food,
    exercise,
    net: food - exercise,
  };
}

function render(el, data) {
  el.innerHTML = `
    <div class="glass pad-md">
      <div class="muted">Food</div>
      <strong>${data.food} kcal</strong>
    </div>
    <div class="space-xs"></div>
    <div class="glass pad-md">
      <div class="muted">Exercise</div>
      <strong>${data.exercise} kcal</strong>
    </div>
    <div class="space-xs"></div>
    <div class="glass pad-md">
      <div class="muted">Net</div>
      <strong>${data.net} kcal</strong>
    </div>
  `;
}

function lastNDays(n) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() - 1);
  }
  return out;
}
