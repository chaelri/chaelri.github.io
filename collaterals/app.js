// Dashboard: renders the 7 cards + progress bar from state.js.

import { TEMPLATES, getAllStatus, getProgressPct } from "./shared/state.js";
import { COLLATERALS_FOLDER_URL } from "./shared/drive.js";

const SUBS = {
  "name-cards":      "Place cards with each guest's name · wildflower border",
  "menu":            "Starter · Main · Dessert printable menu cards",
  "table-numbers":   "Triangle prism table marker with QR for photo upload",
  "money-envelopes": "Ready-to-cut wedding-day envelopes with guest fields",
  "mirror-chart":    "2 × 5 ft seating chart for the mirror display",
  "monogram":        "C & K monogram still — for the LED visual / signage",
  "invitation":      "Printable wedding invitation card",
};

const STATUS_LABEL = {
  pending: "Not started",
  in_progress: "In progress",
  ready: "Ready to print",
  printed: "Printed",
};

function renderCards() {
  const grid = document.getElementById("card-grid");
  const statuses = getAllStatus();
  grid.innerHTML = TEMPLATES.map((t) => {
    const status = statuses[t.id];
    return `
      <a class="collat-card" href="${t.path}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <div class="card-icon"><span class="material-symbols-outlined">${t.icon}</span></div>
          <span class="status-pill status-${status}">
            <span class="status-dot"></span>${STATUS_LABEL[status]}
          </span>
        </div>
        <div>
          <div class="card-title">${t.label}</div>
          <div class="card-sub">${SUBS[t.id] || ""}</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:auto;padding-top:8px;border-top:1px solid var(--border);font-size:0.78rem;color:var(--ink-faint)">
          <span>Open editor</span>
          <span class="material-symbols-outlined" style="font-size:18px">arrow_forward</span>
        </div>
      </a>
    `;
  }).join("");
}

function renderProgress() {
  const pct = getProgressPct();
  document.getElementById("progress-fill").style.width = pct + "%";
  document.getElementById("progress-pct").textContent = pct + "%";
  const st = getAllStatus();
  const readyCount = Object.values(st).filter((s) => s === "ready" || s === "printed").length;
  document.getElementById("progress-summary").textContent = `${readyCount} of ${TEMPLATES.length} ready or printed`;
}

document.getElementById("drive-folder-link").href = COLLATERALS_FOLDER_URL;

renderCards();
renderProgress();

// Re-render if returned from a template page (state may have changed).
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    renderCards();
    renderProgress();
  }
});
