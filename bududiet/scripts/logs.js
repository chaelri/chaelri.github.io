// scripts/logs.js
import { state } from "./state.js";

let syncBound = false;

export function bindLogs() {
  if (!syncBound) {
    import("./sync/status.js").then((m) => m.bindSyncStatus());
    syncBound = true;
  }

  const selfList = document.getElementById("logsListSelf");
  const partnerList = document.getElementById("logsListPartner");
  if (!selfList || !partnerList) return;

  // ---------- AVATARS ----------
  const avatarSelf = document.getElementById("avatarSelf");
  const avatarPartner = document.getElementById("avatarPartner");
  const partnerNameEl = document.getElementById("partnerName");
  const selfNameEl = document.getElementById("selfName");

  if (avatarSelf) {
    avatarSelf.innerHTML = state.user.photo; // "C" or "K"
    avatarSelf.className = "avatar-circle";
  }

  if (avatarPartner && state.partner?.name) {
    avatarPartner.innerHTML = state.partner.photo;
    avatarPartner.className = "avatar-circle";
  }

  selfNameEl.textContent = state.user.name;

  if (partnerNameEl && state.partner?.name) {
    partnerNameEl.textContent = state.partner.name;
  }

  // ---------- TOTALS ----------
  const totalSelf = document.getElementById("totalSelf");
  const totalPartner = document.getElementById("totalPartner");

  if (totalSelf) totalSelf.textContent = `${state.today.net} kcal`;
  if (totalPartner && state.partner?.today) {
    totalPartner.textContent = `${state.partner.today.net} kcal`;
  }

  // ---------- SELF ----------
  selfList.innerHTML = state.today.logs.length
    ? state.today.logs.map((log, idx) => renderLog(log, idx, true)).join("")
    : `<div class="glass pad-md">No logs yet.</div>`;

  // ---------- PARTNER ----------
  const pLogs = state.partner?.today?.logs || [];
  partnerList.innerHTML = pLogs.length
    ? pLogs.map((log) => renderLog(log, null, false)).join("")
    : `<div class="glass pad-md">No logs yet.</div>`;
}

function renderLog(log, index, canDelete) {
  const sign =
    log.kind === "food"
      ? `<span class="material-icon">restaurant</span>`
      : `<span class="material-icon">directions_run</span>`;

  return `
    <div class="glass log-item">
      <strong style="display:flex;align-items:center;gap:8px;">
        ${sign}
        ${log.kcal} kcal
      </strong>
      <small>${log.notes || ""}</small>
      ${
        canDelete
          ? `<button data-index="${index}" class="deleteLogBtn">
              <span class="material-icon">delete</span>
            </button>`
          : `<div class="muted" style="margin-top:6px;font-size:12px">
              ${state.partner.name} log
            </div>`
      }
    </div>
  `;
}

document.addEventListener("click", (e) => {
  const del = e.target.closest(".deleteLogBtn");
  if (!del) return;

  const index = Number(del.dataset.index);
  if (!Number.isNaN(index)) deleteLog(index);
});

async function deleteLog(index) {
  const log = state.today.logs[index];
  if (!log) return;

  const { setSyncing, setLive } = await import("./sync/status.js");
  setSyncing();

  try {
    const { getDB } = await import("./sync/firebase.js");
    const { ref, query, orderByChild, equalTo, get, remove } = await import(
      "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js"
    );

    const todayKey = (() => {
      const d = new Date();
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 10);
    })();

    const logsRef = ref(getDB(), `users/${state.user.uid}/logs/${todayKey}`);
    const snap = await get(logsRef);

    snap.forEach((child) => {
      if (child.val()?.ts === log.ts) {
        remove(child.ref);
      }
    });
  } catch (e) {
    console.error(e);
  }

  setLive();
}
