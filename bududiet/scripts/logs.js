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
        <br/>
      <small>${log.notes || ""}</small><br/>
      <button data-index="${index}" class="editLogBtn">
        <span class="material-icon">edit</span>
        Edit
        </button>
        <button data-index="${index}" class="deleteLogBtn">
        <span class="material-icon">delete</span>
        Delete
        </button>
    </div>
  `;
}

document.addEventListener("click", (e) => {
  const del = e.target.closest(".deleteLogBtn");
  if (del) {
    const index = Number(del.dataset.index);
    if (!Number.isNaN(index)) deleteLog(index);
    return;
  }

  const edit = e.target.closest(".editLogBtn");
  if (edit) {
    const index = Number(edit.dataset.index);
    if (!Number.isNaN(index)) openEdit(index);
  }
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
  import("./today.js").then((m) => m.bindToday());
}

import { rerunGemini } from "./rerun.js";

let editingIndex = null;

function openEdit(index) {
  editingIndex = index;
  const modal = document.getElementById("editModal");
  const ta = document.getElementById("editText");

  ta.value = state.today.logs[index]?.notes || "";
  modal.classList.remove("hidden");

  document.getElementById("cancelEditBtn").onclick = closeEdit;
  document.getElementById("reRunBtn").onclick = async () => {
    const text = ta.value.trim();
    const file = document.getElementById("editImage").files[0];

    const updated = await rerunGemini(text, file);
    replaceLog(index, updated);
    closeEdit();
    bindLogs();

    import("./today.js").then((m) => m.bindToday(true));
  };
}

function closeEdit() {
  editingIndex = null;
  document.getElementById("editModal").classList.add("hidden");
}

function replaceLog(index, updated) {
  const old = state.today.logs[index];

  if (old.kind === "food") state.today.net -= old.kcal;
  if (old.kind === "exercise") state.today.net += old.kcal;

  state.today.logs[index] = { ...updated, ts: Date.now() };

  if (updated.kind === "food") state.today.net += updated.kcal;
  if (updated.kind === "exercise") state.today.net -= updated.kcal;

  localStorage.setItem(
    `bududiet:${state.user.email}:today`,
    JSON.stringify(state.today)
  );
}
