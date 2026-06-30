// Dashboard: renders the 7 cards + progress bar from state.js.

import { TEMPLATES, getAllStatus, getProgressPct } from "./shared/state.js";
import { COLLATERALS_FOLDER_URL } from "./shared/drive.js";
import { fbGet, fbSubscribe } from "./shared/firebase-sync.js";

// Field IDs used by the Program Details page (collaterals/details/app.js).
// Duplicated here so the dashboard can show a live filled-count without
// importing the form module (which would pull in render code we don't need).
const DETAILS_FIELDS = [
  // Ceremony — People & Flow
  "officiant","honoringParentsSpeaker","communionDuringCeremony",
  // Ceremony — Music
  "welcomingMusic1","welcomingMusic2","chargingPSMusic",
  // Ceremony — Setup
  "entranceArch","aisleRunner","symbolsTableProvider","candleStylingProvider",
  // Pictorial
  "pictorialExtras",
  // Reception — People
  "host","receptionOpeningPrayer","brideIntermissionPerformer","groomIntermissionPerformer",
  // Reception — Music & Moments
  "firstDanceChoreo","cocktailMusic","bouquetTossSong","closingSong","exitDance","memoryVideoStatus",
  // Reception — Games & Prizes
  "coupleTriviaPrizes","bringMeToJerusalemPrizes","preProgramGamePrizes",
  // Reception — Guest Experience
  "dressCodeGuests","sendOffStyle",
  // Couple Story
  "endearment","petNames","whereTheyMet","bfgfAnniversary","yearsTogether",
  "proposalLocation","proposalDate","firstDateSpot","memorableTrip","favoriteSnack",
  "charlieJob","karlaJob","firstILoveYou","favoriteShow","insideJoke","lifeVerse",
  "honeymoonDestination","otherFunFacts",
  // Well-wishers
  "wellWishersSpecial",
  // Suppliers
  "supplierCatering","supplierCake","supplierSound","supplierPhoto","supplierPhotoman",
  "supplierVideo","supplierSDE","supplierHMUA","supplierFlorist","supplierLights",
  "supplierPhotobooth","supplierGown","supplierTuxBarong","supplierRings","supplierBridalCar",
  "supplierOther",
];

const SUBS = {
  "name-cards":        "Place cards with each guest's name · wildflower border",
  "menu":              "Pre-edited Canva menu · 2-up on A4 landscape, ready for the printer",
  "table-numbers":     "Card per table — family headline + numbered guest list, A4 cut-out sheet for the mirror",
  "money-envelopes":   "Single-panel envelope dieline · top flap + 3 glue tabs · A4 portrait + decorative front insert, sized for PHP banknotes",
  "mirror-chart":      "2 × 5 ft seating chart for the mirror display",
  "monogram":          "C & K monogram still — for the LED visual / signage",
  "invitation":        "Printable wedding invitation card",
  "sponsors-thankyou": "11 pre-edited Canva cards · laid out 2 × 3 per A4 portrait sheet, ready for the printer",
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

function renderDetailsProgress(remote) {
  const total = DETAILS_FIELDS.length;
  const data = remote && typeof remote === "object" ? remote : {};
  const filled = DETAILS_FIELDS.filter((k) => typeof data[k] === "string" && data[k].trim().length > 0).length;
  const pct = Math.round((filled / total) * 100);
  const fillEl = document.getElementById("details-fill");
  const sumEl = document.getElementById("details-summary");
  if (fillEl) fillEl.style.width = pct + "%";
  if (sumEl) sumEl.textContent = `${filled} of ${total} filled · ${pct}%`;
}

(async () => {
  try {
    const remote = await fbGet("_details");
    renderDetailsProgress(remote);
  } catch (e) {
    console.warn("details progress load failed", e);
    renderDetailsProgress(null);
  }
  fbSubscribe("_details", renderDetailsProgress);
})();

renderCards();
renderProgress();

// Re-render if returned from a template page (state may have changed).
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    renderCards();
    renderProgress();
  }
});
