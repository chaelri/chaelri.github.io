import { state } from "./state.js";

export function bindLogs() {
  const list = document.getElementById("logsList");
  if (!list) return;

  if (!state.today.logs.length) {
    list.innerHTML = `<div class="glass" style="padding:12px">No logs yet.</div>`;
    return;
  }

  list.innerHTML = state.today.logs
    .map((log, idx) => renderLog(log, idx))
    .join("");
}

function renderLog(log, index) {
  const sign = log.kind === "food" ? "➕" : "🔥";
  return `
    <div class="glass" style="padding:12px; margin-bottom:12px;">
      <strong>${sign} ${log.kcal} kcal</strong><br/>
      <small>${log.notes || ""}</small><br/>
      <button data-index="${index}" class="deleteLogBtn" style="margin-top:8px;">
        Delete
      </button>
    </div>
  `;
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".deleteLogBtn");
  if (!btn) return;

  const index = Number(btn.dataset.index);
  if (Number.isNaN(index)) return;

  deleteLog(index);
});

function deleteLog(index) {
  const log = state.today.logs[index];
  if (!log) return;

  if (log.kind === "food") state.today.net -= log.kcal;
  if (log.kind === "exercise") state.today.net += log.kcal;

  state.today.logs.splice(index, 1);

  localStorage.setItem(
    `bududiet:${state.user.email}:today`,
    JSON.stringify(state.today)
  );

  bindLogs();
}
