/*
 * STRICT PROTOCOL: Selective Delta Updates Only.
 */

// =============================
// Firebase config
// =============================
const firebaseConfig = {
  apiKey: "AIzaSyB8ahT56WbEUaGAymsRNNA-DrfZnUnWIwk",
  authDomain: "test-database-55379.firebaseapp.com",
  databaseURL:
    "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "test-database-55379",
  storageBucket: "test-database-55379.firebasestorage.app",
  messagingSenderId: "933688602756",
  appId: "1:933688602756:web:392a3a4ce040cb9d4452d1",
  measurementId: "G-1LSTC0N3NJ",
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// =============================
// DOM
// =============================
const activeCountEl = document.getElementById("active-count");
const totalCountEl = document.getElementById("total-count");
const currentDateEl = document.getElementById("current-date");
const noLogsMessage = document.getElementById("no-logs-message");
const searchInput = document.getElementById("search-input");
const modal = document.getElementById("comms-modal");
const modalContent = document.getElementById("comms-modal-content");
const modalClose = document.getElementById("comms-modal-close");

const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
currentDateEl.textContent = new Date().toLocaleDateString([], {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

// Live clock
const currentTimeEl = document.getElementById("current-time");
function updateClock() {
  currentTimeEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
updateClock();
setInterval(updateClock, 1000);

// =============================
// Google Sheets Sync
// =============================
const SHEETS_API_URL = 'https://script.google.com/macros/s/AKfycby1MQ0l0uJfynqWveFAZDa1Q3HQPbfmLxGX4ux5bvdCHmOtS6JmD-_lvIDvLPjU8-0/exec';

function syncToSheets(payload) {
  fetch(SHEETS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  }).then((res) => {
    if (res.ok) return res.json();
    throw new Error('Sheets API error: ' + res.status);
  }).then((data) => {
    console.log('Sheets sync result:', data);
  }).catch((err) => console.warn('Sheets sync failed:', err));
}

// =============================
// State
// =============================
let allLogs = {};
let volunteerNicknameMap = {}; // volunteerId -> nickname or first name
let activeSegFilter = "all";
let activeCommsFilter = "all"; // "all" | "has" | "none"
let activeIdFilter = "all"; // "all" | "has" | "none"
let activeSearch = "";
let activeSort = { key: "timein", dir: "desc" }; // key: "name"|"timein"|"duration"
let compSort = { key: "timein", dir: "desc" }; // key: "name"|"segment"|"comms"|"timein"|"timeout"|"duration"
let commsView = "grid"; // "grid" | "compact" | "list"
let commsAmFilter = "all"; // "all" | "9AM" | "12NN"
let commsPmFilter = "all"; // "all" | "3PM" | "6PM"
let activeCommsMap = {};

// All comms codes with their default assignment (role name)
const allComms = [
  { code: "A1", assignment: "Camera 1", role: "Cameraman 1 (Main Follow)" },
  { code: "A2", assignment: "Camera 2", role: "Cameraman 2 (Main Full/TV)" },
  { code: "A3", assignment: "Camera 3", role: "Cameraman 3 (Wide)" },
  { code: "A4", assignment: "Camera 4", role: "Cameraman 4 (Side)" },
  { code: "A5", assignment: "Camera 5", role: "Cameraman 5 (PTZ)" },
  { code: "A6", assignment: "Camera 6", role: "Cameraman 6 (Gimbal)" },
  { code: "A7", assignment: "Camera 7", role: "Cameraman 7 (Gimbal)" },
  { code: "A8", assignment: "Camera 8", role: "Cameraman 8 (Crane)" },
  { code: "B1", assignment: "Camera 9", role: "Cameraman 9 (Stage Left)" },
  { code: "B2", assignment: "Camera Support", role: "Camera Support" },
  { code: "B3", assignment: "Lights", role: "Lights Team Lead" },
  { code: "B4", assignment: "Stage Manager", role: "Stage Manager" },
  { code: "B5", assignment: "Asst Stage Mgr 1", role: "Assistant Stage Manager 1" },
  { code: "B6", assignment: "Asst Stage Mgr 2", role: "Assistant Stage Manager 2" },
  { code: "B7", assignment: "Stage/Equip Lead", role: "Stage/Equipment Lead" },
  { code: "B8", assignment: "Camera 10", role: "Camera 10 (Stage Right)" },
  { code: "C1", assignment: "Program Coord", role: "Program Coordinator" },
  { code: "C2", assignment: "Soundbooth", role: "Main LED Switcher" },
  { code: "C3", assignment: "Graphics Playback", role: "Graphics Playback" },
  { code: "C4", assignment: "BCR Coordinator", role: "BCR Coordinator" },
  { code: "C5", assignment: "FOH", role: "FOH" },
  { code: "C6", assignment: "BC Mix", role: "BC Mix" },
  { code: "C7", assignment: "RF Tech", role: "RF Tech" },
  { code: "C8", assignment: "Speaker Care", role: "Speaker Care" },
];

// =============================
// Helpers
// =============================
function formatTime(isoString) {
  if (!isoString) return "—";
  try {
    return new Date(isoString).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function calcDuration(log) {
  if (!log.timeIn) return "—";
  const start = new Date(log.timeIn);
  const end = log.timeOut ? new Date(log.timeOut) : new Date();
  const diffMs = end - start;
  const hrs = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

function td(content) {
  const el = document.createElement("td");
  el.className = "px-4 py-3 text-sm";
  el.innerHTML = content;
  return el;
}

function servicesBadge(services) {
  if (!services || !services.length) return "";
  const badges = services.map((s) => {
    const isAM = s === "9AM" || s === "12NN";
    return `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded ${isAM ? "bg-sky-900/60 text-sky-400" : "bg-violet-900/60 text-violet-400"}">${s}</span>`;
  });
  return `<div class="flex gap-1 mt-0.5 flex-wrap">${badges.join("")}</div>`;
}

function servicesLabel(services) {
  if (!services || !services.length) return "—";
  return services.join(", ");
}

function commsButton(commsId) {
  if (commsId && commsId !== "NONE") {
    return td(
      `<button class="font-mono font-bold text-white bg-neutral-800 hover:bg-neutral-700 px-2 py-0.5 rounded text-xs transition duration-150 cursor-pointer comms-history-btn" data-comms="${commsId}">${commsId}</button>`
    );
  }
  return td('<span class="text-neutral-600">—</span>');
}

// =============================
// Render
// =============================
function renderTable() {
  const searchTerm = (searchInput.value || "").toLowerCase().trim();

  let entries = Object.entries(allLogs).map(([key, log]) => ({ key, ...log }));

  // Filter
  if (searchTerm) {
    entries = entries.filter((log) => {
      const haystack = `${log.name} ${log.volunteerId} ${log.segment} ${log.role} ${log.commsId} ${log.numberedId}`.toLowerCase();
      return haystack.includes(searchTerm);
    });
  }

  // Sort by timeIn desc
  entries.sort((a, b) => (b.timeIn || "").localeCompare(a.timeIn || ""));

  const pendingEntries = entries.filter((l) => !l.timeOut && l.status === "pending");
  const pendingOutEntries = entries.filter((l) => !l.timeOut && l.status === "pending-out");
  const activeEntries = entries.filter((l) => !l.timeOut && l.status !== "pending" && l.status !== "pending-out");
  const completedEntries = entries.filter((l) => l.timeOut);

  // Counts (from full data, not filtered)
  let totalActive = 0;
  let totalActiveNoComms = 0;
  let totalAll = Object.keys(allLogs).length;
  Object.values(allLogs).forEach((log) => {
    if (!log.timeOut) {
      totalActive++;
      if (!log.commsId || log.commsId === "NONE") totalActiveNoComms++;
    }
  });
  activeCountEl.textContent = totalActive;
  document.getElementById("active-no-comms-count").textContent = totalActiveNoComms;
  totalCountEl.textContent = totalAll;

  // Segment summary bar
  const segSummary = document.getElementById("active-segment-summary");
  if (segSummary) {
    const segCounts = {};
    Object.values(allLogs).forEach((log) => {
      if (!log.timeOut && log.status !== "pending" && log.status !== "pending-out") {
        const seg = log.segment || "Other";
        segCounts[seg] = (segCounts[seg] || 0) + 1;
      }
    });
    const entries2 = Object.entries(segCounts).sort(([a], [b]) => a.localeCompare(b));
    segSummary.innerHTML = entries2.map(([seg, count]) =>
      `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-neutral-800 border border-neutral-700 text-neutral-400">${seg}<span class="text-white font-black">${count}</span></span>`
    ).join("");
  }

  // No logs at all
  noLogsMessage.classList.toggle("hidden", entries.length > 0 || true); // always hide, we have comms table

  // ---- Comms Overview ----
  // Build a map: commsId -> active log (with key)
  activeCommsMap = {};
  Object.entries(allLogs).forEach(([key, log]) => {
    if (!log.timeOut && log.commsId && log.commsId !== "NONE") {
      activeCommsMap[log.commsId] = { ...log, key };
    }
  });

  const activeCommsCount = Object.keys(activeCommsMap).length;
  document.getElementById("comms-toggle-count").textContent = `(${activeCommsCount}/${allComms.length} in use)`;

  renderCommsView(activeCommsMap);

  // Pending table
  const pendingBody = document.getElementById("pending-table-body");
  const pendingSection = document.getElementById("pending-section");
  pendingBody.innerHTML = "";

  if (pendingEntries.length > 0) {
    pendingSection.classList.remove("hidden");
    document.getElementById("pending-table-count").textContent = `(${pendingEntries.length})`;

    pendingEntries.forEach((log) => {
      const row = document.createElement("tr");
      row.className = "hover:bg-neutral-800 transition duration-150";

      row.appendChild(
        td(`<div class="flex items-center"><span class="inline-block w-2 h-2 rounded-full bg-amber-400 mr-2 animate-pulse"></span><span class="font-semibold text-amber-300">${log.name || "—"}</span></div>`)
      );
      row.appendChild(
        td(`<span class="text-neutral-500 text-xs">${log.segment || "—"}</span><br/><span class="text-white font-medium">${log.role || "—"}</span>${servicesBadge(log.services)}`)
      );
      // Editable comms for pending (can reserve even if currently occupied)
      const pendingCommsTd = document.createElement("td");
      pendingCommsTd.className = "px-4 py-2 text-sm";
      if (log.commsId && log.commsId !== "NONE") {
        const isTakenByOther = activeCommsMap[log.commsId];
        const takenLabel = isTakenByOther
          ? `<span class="text-[9px] text-amber-500 ml-0.5">⏳</span>`
          : "";
        pendingCommsTd.innerHTML = `<button class="pending-change-comms-btn group font-mono font-bold text-amber-300 bg-neutral-800 hover:bg-neutral-700 px-2 py-0.5 rounded text-xs transition flex items-center gap-1" data-key="${log.key}" data-comms="${log.commsId}" data-name="${log.name || ""}" data-volunteer="${log.volunteerId || ""}">${log.commsId}${takenLabel}<span class="material-icons-round text-neutral-600 group-hover:text-neutral-300 transition" style="font-size:10px">edit</span></button>`;
      } else {
        pendingCommsTd.innerHTML = `<button class="pending-change-comms-btn group text-neutral-600 hover:text-white transition flex items-center gap-1 text-xs" data-key="${log.key}" data-comms="" data-name="${log.name || ""}" data-volunteer="${log.volunteerId || ""}"><span>—</span><span class="material-icons-round text-neutral-700 group-hover:text-neutral-400 transition" style="font-size:10px">edit</span></button>`;
      }
      row.appendChild(pendingCommsTd);

      // Seg ID input + confirm button
      const segIdTd = document.createElement("td");
      segIdTd.className = "px-4 py-2 text-sm";
      segIdTd.innerHTML = `
        <div class="flex items-center gap-1">
          <input type="text" placeholder="#" data-key="${log.key}" class="pending-segid-input w-16 px-2 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-center text-white text-xs font-mono focus:outline-none focus:border-amber-400" />
          <button class="pending-confirm-btn flex items-center justify-center w-6 h-6 rounded-md bg-neutral-700 text-neutral-500 cursor-not-allowed transition duration-150 disabled" disabled data-key="${log.key}" data-comms="${log.commsId || ""}" data-volunteer="${log.volunteerId || ""}" data-time="${log.timeIn || ""}" data-name="${log.name || ""}" data-segment="${log.segment || ""}" data-role="${log.role || ""}" title="Enter Seg ID first">
            <span class="material-icons-round text-sm">check</span>
          </button>
        </div>
      `;
      row.appendChild(segIdTd);

      // No ID toggle
      const noIdTd = document.createElement("td");
      noIdTd.className = "px-4 py-2 text-sm text-center";
      noIdTd.innerHTML = `
        <button class="pending-noid-toggle group flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition duration-150 border-green-500 bg-green-500/20 text-green-400" data-key="${log.key}" data-checked="false" title="Toggle: No valid ID">
          <span class="material-icons-round text-xs noid-icon">verified</span>
          <span class="text-[10px] font-semibold uppercase tracking-wide noid-label">Has ID</span>
        </button>`;
      row.appendChild(noIdTd);

      row.appendChild(
        td(`<span class="font-mono text-amber-400 text-xs">${formatTime(log.timeIn)}</span>`)
      );

      // Cancel button
      const actionTd = document.createElement("td");
      actionTd.className = "px-4 py-2 text-sm";
      actionTd.innerHTML = `<button class="pending-cancel-btn text-neutral-500 hover:text-red-400 transition text-xs flex items-center gap-1" data-key="${log.key}"><span class="material-icons-round text-base">close</span>Cancel</button>`;
      row.appendChild(actionTd);

      pendingBody.appendChild(row);
    });

    // Attach cancel handlers
    document.querySelectorAll(".pending-cancel-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const key = btn.dataset.key;
        const confirmed = await showConfirm("Cancel this volunteer's pending time-in?");
        if (confirmed) {
          await db.ref(`logs/${todayDate}/${key}`).remove();
          showToast("Pending time-in cancelled", "cancel", "text-red-400");
        }
      });
    });

    // Pending comms reservation (opens change-comms in pending mode)
    document.querySelectorAll(".pending-change-comms-btn").forEach((btn) => {
      btn.addEventListener("click", () =>
        openChangeCommsModal(btn.dataset.key, btn.dataset.comms, btn.dataset.name, btn.dataset.volunteer, true)
      );
    });

    // Attach confirm handlers (check button beside seg ID)
    document.querySelectorAll(".pending-confirm-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const key = btn.dataset.key;
        const commsCode = btn.dataset.comms;
        const volunteerId = btn.dataset.volunteer;
        const timeIn = btn.dataset.time;
        const segIdInput = btn.closest("div").querySelector(".pending-segid-input");
        const numberedId = segIdInput ? segIdInput.value.trim() : "";

        // Check if "No ID" toggle is active for this entry
        const noIdToggle = document.querySelector(`.pending-noid-toggle[data-key="${key}"]`);
        const noId = noIdToggle ? noIdToggle.dataset.checked === "true" : false;

        try {
          // 1. Upgrade pending record to confirmed
          await db.ref(`logs/${todayDate}/${key}`).update({
            numberedId: numberedId || null,
            noId: noId || null,
            status: null, // Remove pending flag — now confirmed
          });

          // 2. Update comms status if mapped
          if (commsCode) {
            await db.ref(`comms/${commsCode}`).update({
              status: "assigned",
              assignedTo: volunteerId,
              assignedTime: timeIn,
            });
          }

          // 3. Sync to Google Sheets
          syncToSheets({
            action: 'timeIn',
            logKey: key,
            volunteerId: volunteerId,
            name: btn.dataset.name,
            segment: btn.dataset.segment,
            role: btn.dataset.role,
            commsId: commsCode || 'NONE',
            numberedId: numberedId,
            timeIn: timeIn,
            date: todayDate,
          });

          showToast("Volunteer timed in successfully", "check_circle", "text-green-400");
        } catch (e) {
          console.error("Confirm error:", e);
          showToast("Failed to confirm time-in", "error", "text-red-400");
        }
      });
    });

    // Enable/disable confirm button based on seg ID input
    document.querySelectorAll(".pending-segid-input").forEach((input) => {
      const confirmBtn = input.closest("div").querySelector(".pending-confirm-btn");
      input.addEventListener("input", () => {
        const hasValue = input.value.trim().length > 0;
        if (confirmBtn) {
          confirmBtn.disabled = !hasValue;
          if (hasValue) {
            confirmBtn.className = "pending-confirm-btn flex items-center justify-center w-6 h-6 rounded-md bg-green-600 hover:bg-green-500 text-white transition duration-150";
            confirmBtn.title = "Confirm time-in";
          } else {
            confirmBtn.className = "pending-confirm-btn flex items-center justify-center w-6 h-6 rounded-md bg-neutral-700 text-neutral-500 cursor-not-allowed transition duration-150";
            confirmBtn.title = "Enter Seg ID first";
          }
        }
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (confirmBtn && !confirmBtn.disabled) confirmBtn.click();
        }
      });
    });

    // No ID toggle handlers
    document.querySelectorAll(".pending-noid-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const isChecked = btn.dataset.checked === "true";
        btn.dataset.checked = isChecked ? "false" : "true";
        const icon = btn.querySelector(".noid-icon");
        const label = btn.querySelector(".noid-label");
        if (!isChecked) {
          // Toggled to "No ID"
          btn.className = "pending-noid-toggle group flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition duration-150 border-amber-500 bg-amber-500/20 text-amber-400";
          label.textContent = "No ID";
          icon.textContent = "warning";
        } else {
          // Toggled back to "Has ID"
          btn.className = "pending-noid-toggle group flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition duration-150 border-green-500 bg-green-500/20 text-green-400";
          label.textContent = "Has ID";
          icon.textContent = "verified";
        }
      });
    });
  } else {
    pendingSection.classList.add("hidden");
  }

  // Pending Time Out table
  const pendingOutBody = document.getElementById("pending-out-table-body");
  const pendingOutSection = document.getElementById("pending-out-section");
  pendingOutBody.innerHTML = "";

  if (pendingOutEntries.length > 0) {
    pendingOutSection.classList.remove("hidden");
    document.getElementById("pending-out-table-count").textContent = `(${pendingOutEntries.length})`;

    pendingOutEntries.forEach((log) => {
      const row = document.createElement("tr");
      row.className = "hover:bg-neutral-800 transition duration-150";

      row.appendChild(
        td(`<div class="flex items-center"><span class="inline-block w-2 h-2 rounded-full bg-red-400 mr-2 animate-pulse"></span><span class="font-semibold text-red-300">${log.name || "—"}</span></div>`)
      );
      row.appendChild(
        td(`<span class="text-neutral-500 text-xs">${log.segment || "—"}</span><br/><span class="text-white font-medium">${log.role || "—"}</span>`)
      );

      // Return Comms
      const commsId = log.commsId;
      if (commsId && commsId !== "NONE") {
        row.appendChild(td(`<span class="font-mono font-bold text-white bg-neutral-800 px-2 py-0.5 rounded text-xs">${commsId}</span>`));
      } else {
        row.appendChild(td('<span class="text-neutral-600">—</span>'));
      }

      // Return Seg ID
      row.appendChild(
        td(log.numberedId ? `<span class="font-mono font-bold text-white">#${log.numberedId}</span>` : '<span class="text-neutral-600">—</span>')
      );

      // Duration
      row.appendChild(
        td(`<span class="font-mono text-red-400 text-xs">${calcDuration(log)}</span>`)
      );

      // Confirm + Cancel buttons
      const actionTd = document.createElement("td");
      actionTd.className = "px-4 py-2 text-sm";
      actionTd.innerHTML = `
        <div class="flex items-center gap-2">
          <button class="pending-out-confirm-btn flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition duration-150" data-key="${log.key}" data-comms="${log.commsId || ""}" data-volunteer="${log.volunteerId || ""}" data-time="${log.timeIn || ""}">
            <span class="material-icons-round text-sm">check</span>Confirm
          </button>
          <button class="pending-out-cancel-btn text-neutral-500 hover:text-neutral-300 transition text-xs" data-key="${log.key}" data-comms="${log.commsId || ""}" title="Cancel time-out request">
            <span class="material-icons-round text-base">close</span>
          </button>
        </div>
      `;
      row.appendChild(actionTd);

      pendingOutBody.appendChild(row);
    });

    // Attach confirm handlers for pending time-out
    document.querySelectorAll(".pending-out-confirm-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const key = btn.dataset.key;
        const commsCode = btn.dataset.comms;

        try {
          const now = new Date().toISOString();

          // 1. Update log: set timeOut, remove pending-out status
          await db.ref(`logs/${todayDate}/${key}`).update({
            timeOut: now,
            status: null,
            commsStatusOut: "OK",
          });

          // 2. Release comms (or auto-assign to pending reservation)
          await releaseCommsOrAutoAssign(commsCode);

          // 3. Sync to Google Sheets
          syncToSheets({
            action: 'timeOut',
            logKey: key,
            timeOut: now,
            timeIn: btn.dataset.time,
          });

          showToast("Volunteer timed out successfully", "check_circle", "text-green-400");
        } catch (e) {
          console.error("Confirm time-out error:", e);
          showToast("Failed to confirm time-out", "error", "text-red-400");
        }
      });
    });

    // Attach cancel handlers for pending time-out
    document.querySelectorAll(".pending-out-cancel-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const key = btn.dataset.key;
        const confirmed = await showConfirm("Cancel this time-out request? Volunteer will remain active.");
        if (confirmed) {
          await db.ref(`logs/${todayDate}/${key}`).update({ status: null });
          showToast("Time-out request cancelled", "cancel", "text-red-400");
        }
      });
    });
  } else {
    pendingOutSection.classList.add("hidden");
  }

  // Active table
  const activeBody = document.getElementById("active-table-body");
  // Active filter pills (segments + comms)
  const activeFilterContainer = document.getElementById("active-filter-pills");
  if (activeFilterContainer) {
    const allActiveForFilter = Object.values(allLogs)
      .filter(l => !l.timeOut && l.status !== "pending" && l.status !== "pending-out");
    const allActiveSegs = [...new Set(allActiveForFilter.map(l => l.segment).filter(Boolean))].sort();

    activeFilterContainer.innerHTML = "";

    function makePill(label, isActive, onClick) {
      const p = document.createElement("button");
      p.textContent = label;
      p.className = isActive
        ? "px-3 py-1 rounded-full text-xs font-semibold bg-white text-neutral-900 transition"
        : "px-3 py-1 rounded-full text-xs font-semibold bg-neutral-800 text-neutral-400 border border-neutral-700 hover:border-neutral-500 hover:text-white transition";
      p.addEventListener("click", onClick);
      return p;
    }

    // Segment pills
    activeFilterContainer.appendChild(makePill("All", activeSegFilter === "all", () => { activeSegFilter = "all"; renderTable(); }));
    allActiveSegs.forEach(seg => {
      activeFilterContainer.appendChild(makePill(seg, activeSegFilter === seg, () => { activeSegFilter = seg; renderTable(); }));
    });

    // Separator
    const sep = document.createElement("span");
    sep.className = "w-px h-5 bg-neutral-700 self-center mx-0.5";
    activeFilterContainer.appendChild(sep);

    // Comms filter pills
    activeFilterContainer.appendChild(makePill("Has Comms", activeCommsFilter === "has", () => { activeCommsFilter = activeCommsFilter === "has" ? "all" : "has"; renderTable(); }));
    activeFilterContainer.appendChild(makePill("No Comms", activeCommsFilter === "none", () => { activeCommsFilter = activeCommsFilter === "none" ? "all" : "none"; renderTable(); }));

    // Separator
    const sep2 = document.createElement("span");
    sep2.className = "w-px h-5 bg-neutral-700 self-center mx-0.5";
    activeFilterContainer.appendChild(sep2);

    // ID filter pills
    activeFilterContainer.appendChild(makePill("Has ID", activeIdFilter === "has", () => { activeIdFilter = activeIdFilter === "has" ? "all" : "has"; renderTable(); }));
    activeFilterContainer.appendChild(makePill("No ID", activeIdFilter === "none", () => { activeIdFilter = activeIdFilter === "none" ? "all" : "none"; renderTable(); }));
  }

  // Apply all active filters: search + segment + comms
  let displayedActiveEntries = activeEntries;
  if (activeSearch) {
    const q = activeSearch.toLowerCase();
    displayedActiveEntries = displayedActiveEntries.filter(l =>
      `${l.name} ${l.segment} ${l.role} ${l.commsId} ${l.numberedId}`.toLowerCase().includes(q)
    );
  }
  if (activeSegFilter !== "all") {
    displayedActiveEntries = displayedActiveEntries.filter(l => l.segment === activeSegFilter);
  }
  if (activeCommsFilter === "has") {
    displayedActiveEntries = displayedActiveEntries.filter(l => l.commsId && l.commsId !== "NONE");
  } else if (activeCommsFilter === "none") {
    displayedActiveEntries = displayedActiveEntries.filter(l => !l.commsId || l.commsId === "NONE");
  }
  if (activeIdFilter === "has") {
    displayedActiveEntries = displayedActiveEntries.filter(l => !l.noId);
  } else if (activeIdFilter === "none") {
    displayedActiveEntries = displayedActiveEntries.filter(l => l.noId === true);
  }

  // Apply sort
  displayedActiveEntries = displayedActiveEntries.slice().sort((a, b) => {
    const dir = activeSort.dir === "asc" ? 1 : -1;
    if (activeSort.key === "name") return dir * (a.name || "").localeCompare(b.name || "");
    if (activeSort.key === "duration") return dir * (calcDurationMs(a) - calcDurationMs(b));
    // default: timein
    return dir * (a.timeIn || "").localeCompare(b.timeIn || "");
  });

  // Update sort arrows on all sortable headers
  ["name", "timein", "duration"].forEach(k => {
    const arrowEl = document.getElementById(`active-arrow-${k}`);
    if (!arrowEl) return;
    if (activeSort.key === k) {
      arrowEl.textContent = activeSort.dir === "asc" ? "↑" : "↓";
      arrowEl.className = "font-mono text-white text-[10px]";
    } else {
      arrowEl.textContent = "";
    }
  });

  activeBody.innerHTML = "";
  document.getElementById("active-table-count").textContent = activeEntries.length ? `(${activeEntries.length})` : "";
  document.getElementById("no-active-message").classList.toggle("hidden", displayedActiveEntries.length > 0);

  // Queue position info for each log key: pos and total for its commsId
  const keyToQueueInfo = {};
  {
    const byCodeQ = {};
    Object.entries(allLogs).forEach(([key, log]) => {
      if (log.timeOut || !log.commsId || log.commsId === "NONE") return;
      if (!byCodeQ[log.commsId]) byCodeQ[log.commsId] = [];
      byCodeQ[log.commsId].push({ key, timeIn: log.timeIn });
    });
    Object.values(byCodeQ).forEach(group => {
      group.sort((a, b) => (a.timeIn || "").localeCompare(b.timeIn || ""));
      group.forEach((item, i) => { keyToQueueInfo[item.key] = { pos: i + 1, total: group.length }; });
    });
  }

  displayedActiveEntries.forEach((log) => {
    const row = document.createElement("tr");
    row.className = "hover:bg-neutral-800 transition duration-150";

    row.appendChild(
      td(`<div class="flex items-center"><span class="inline-block w-2 h-2 rounded-full bg-green-400 mr-2 animate-pulse"></span><span class="font-semibold text-white">${log.name || "—"}</span></div>`)
    );
    row.appendChild(
      td(`<span class="text-neutral-500 text-xs">${log.segment || "—"}</span><br/><span class="text-white font-medium">${log.role || "—"}</span>${servicesBadge(log.services)}`)
    );

    // Editable comms cell
    const commsTd = document.createElement("td");
    commsTd.className = "px-4 py-3 text-sm";
    const commsBtn = log.commsId && log.commsId !== "NONE"
      ? `<button class="change-comms-btn group font-mono font-bold text-white bg-neutral-800 hover:bg-neutral-700 px-2 py-0.5 rounded text-xs transition flex items-center gap-1" data-key="${log.key}" data-comms="${log.commsId}" data-name="${log.name || ""}" data-volunteer="${log.volunteerId || ""}">${log.commsId}<span class="material-icons-round text-neutral-600 group-hover:text-neutral-300 transition" style="font-size:10px">edit</span></button>`
      : `<button class="change-comms-btn group text-neutral-600 hover:text-white transition flex items-center gap-1 text-xs" data-key="${log.key}" data-comms="" data-name="${log.name || ""}" data-volunteer="${log.volunteerId || ""}"><span>—</span><span class="material-icons-round text-neutral-700 group-hover:text-neutral-400 transition" style="font-size:10px">edit</span></button>`;
    const qi = keyToQueueInfo[log.key];
    const queuePosBadge = qi && qi.total > 1
      ? `<div class="text-[9px] font-semibold font-mono mt-0.5 ${qi.pos === 1 ? "text-green-500" : "text-amber-400"}">${qi.pos === 1 ? "Active" : "Pending"} · ${qi.pos} of ${qi.total}</div>`
      : "";
    const queueBadge = log.pendingCommsId
      ? `<div class="flex items-center gap-0.5 mt-0.5 text-[9px] font-semibold text-amber-400"><span class="material-icons-round" style="font-size:9px">hourglass_top</span><span>queued: ${log.pendingCommsId}</span></div>`
      : "";
    commsTd.innerHTML = `<div>${commsBtn}${queuePosBadge}${queueBadge}</div>`;
    row.appendChild(commsTd);

    row.appendChild(
      td(log.numberedId ? `<span class="font-mono font-bold text-white">#${log.numberedId}</span>` : '<span class="text-neutral-600">—</span>')
    );

    // ID status
    const idStatusTd = document.createElement("td");
    idStatusTd.className = "px-4 py-3 text-sm text-center";
    if (log.noId) {
      idStatusTd.innerHTML = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-semibold uppercase tracking-wide"><span class="material-icons-round text-xs">warning</span>No ID</span>`;
    } else {
      idStatusTd.innerHTML = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[10px] font-semibold uppercase tracking-wide"><span class="material-icons-round text-xs">verified</span>OK</span>`;
    }
    row.appendChild(idStatusTd);

    row.appendChild(
      td(`<span class="font-mono text-green-400">${formatTime(log.timeIn)}</span>`)
    );
    row.appendChild(
      td(`<span class="font-mono text-neutral-400">${calcDuration(log)}</span>`)
    );

    // Force time-out button
    const actionTd = document.createElement("td");
    actionTd.className = "px-4 py-3 text-sm";
    actionTd.innerHTML = `<button class="force-timeout-btn text-neutral-600 hover:text-red-400 transition text-xs flex items-center gap-1" data-key="${log.key}" data-comms="${log.commsId || ""}" data-name="${log.name || ""}" data-time="${log.timeIn || ""}"><span class="material-icons-round text-sm">logout</span>Time out</button>`;
    row.appendChild(actionTd);

    activeBody.appendChild(row);
  });

  // Completed table
  const completedBody = document.getElementById("completed-table-body");
  completedBody.innerHTML = "";
  document.getElementById("completed-table-count").textContent = completedEntries.length ? `(${completedEntries.length})` : "";
  document.getElementById("no-completed-message").classList.toggle("hidden", completedEntries.length > 0);

  // Sort completed entries
  const sortedCompleted = completedEntries.slice().sort((a, b) => {
    const d = compSort.dir === "asc" ? 1 : -1;
    switch (compSort.key) {
      case "name": return d * (a.name || "").localeCompare(b.name || "");
      case "segment": return d * (a.segment || "").localeCompare(b.segment || "");
      case "comms": return d * (a.commsId || "").localeCompare(b.commsId || "");
      case "timeout": return d * (a.timeOut || "").localeCompare(b.timeOut || "");
      case "duration": {
        const ms = (l) => l.timeIn ? (l.timeOut ? new Date(l.timeOut) : new Date()) - new Date(l.timeIn) : 0;
        return d * (ms(a) - ms(b));
      }
      default: return d * (a.timeIn || "").localeCompare(b.timeIn || "");
    }
  });

  // Update sort arrows
  ["name","segment","comms","timein","timeout","duration"].forEach((k) => {
    const el = document.getElementById(`comp-arrow-${k}`);
    if (el) el.textContent = compSort.key === k ? (compSort.dir === "asc" ? "↑" : "↓") : "";
  });

  sortedCompleted.forEach((log) => {
    const row = document.createElement("tr");
    row.className = "hover:bg-neutral-800 transition duration-150 opacity-60";

    row.appendChild(
      td(`<div class="flex items-center"><span class="inline-block w-2 h-2 rounded-full bg-neutral-600 mr-2"></span><span class="font-medium text-neutral-400">${log.name || "—"}</span></div>`)
    );
    row.appendChild(
      td(`<span class="text-neutral-600 text-xs">${log.segment || "—"}</span><br/><span class="text-neutral-400">${log.role || "—"}</span>${servicesBadge(log.services)}`)
    );
    row.appendChild(commsButton(log.commsId));
    row.appendChild(
      td(log.numberedId ? `<span class="font-mono text-neutral-400">#${log.numberedId}</span>` : '<span class="text-neutral-700">—</span>')
    );
    row.appendChild(
      td(`<span class="font-mono text-neutral-500">${formatTime(log.timeIn)}</span>`)
    );
    row.appendChild(
      td(`<span class="font-mono text-neutral-500">${formatTime(log.timeOut)}</span>`)
    );
    row.appendChild(
      td(`<span class="font-mono text-neutral-500">${calcDuration(log)}</span>`)
    );

    // Delete button
    const delTd = document.createElement("td");
    delTd.className = "px-4 py-3 text-sm";
    delTd.innerHTML = `<button class="completed-delete-btn text-neutral-700 hover:text-red-400 transition" data-key="${log.key}" data-name="${log.name || ""}" title="Delete entry"><span class="material-icons-round text-base">delete_outline</span></button>`;
    row.appendChild(delTd);

    completedBody.appendChild(row);
  });

  // Attach comms history click handlers
  document.querySelectorAll(".comms-history-btn").forEach((btn) => {
    btn.addEventListener("click", () => showCommsHistory(btn.dataset.comms));
  });

  // Attach change-comms click handlers (active table)
  document.querySelectorAll(".change-comms-btn").forEach((btn) => {
    btn.addEventListener("click", () => openChangeCommsModal(btn.dataset.key, btn.dataset.comms, btn.dataset.name, btn.dataset.volunteer));
  });

  // Attach force time-out handlers (comms overview + active table)
  document.querySelectorAll(".force-timeout-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { key, comms, name, time } = btn.dataset;
      const confirmed = await showConfirm(`Force time-out for "${name}"?`);
      if (!confirmed) return;

      const now = new Date().toISOString();
      await db.ref(`logs/${todayDate}/${key}`).update({
        timeOut: now,
        status: null,
        commsStatusOut: "OK",
      });

      await releaseCommsOrAutoAssign(comms);

      // Sync to Sheets
      syncToSheets({ action: 'timeOut', logKey: key, timeOut: now, timeIn: time });

      showToast(`"${name}" timed out`, "logout", "text-red-400");
    });
  });

  // Attach completed log delete handlers
  document.querySelectorAll(".completed-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { key, name } = btn.dataset;
      const confirmed = await showConfirm(`Delete completed log for "${name}"?`);
      if (!confirmed) return;
      await db.ref(`logs/${todayDate}/${key}`).remove();
      showToast("Log entry deleted", "delete", "text-red-400");
    });
  });
}

// =============================
// Comms Release / Auto-Assign Helper
// =============================
async function releaseCommsOrAutoAssign(commsCode) {
  if (!commsCode || commsCode === "NONE" || commsCode === "N/A") return;

  const now = new Date().toISOString();

  // Priority 1: pending time-in user that has reserved this comms
  const pendingReservation = Object.entries(allLogs).find(([k, l]) =>
    !l.timeOut && l.status === "pending" && l.commsId === commsCode
  );

  if (pendingReservation) {
    const [, rLog] = pendingReservation;
    await db.ref(`comms/${commsCode}`).update({
      assignedTo: rLog.volunteerId || null,
      assignedTime: now,
      status: "assigned",
    });
    showToast(`Comms ${commsCode} → ${rLog.name || "pending user"}`, "headset_mic", "text-teal-400");
    return;
  }

  // Priority 2: active confirmed volunteer queued for this comms
  const queuedEntry = Object.entries(allLogs).find(([k, l]) =>
    !l.timeOut && !l.status && l.pendingCommsId === commsCode
  );

  if (queuedEntry) {
    const [qKey, qLog] = queuedEntry;
    const oldCommsId = qLog.commsId && qLog.commsId !== "NONE" ? qLog.commsId : null;

    await db.ref(`logs/${todayDate}/${qKey}`).update({ commsId: commsCode, pendingCommsId: null });
    await db.ref(`comms/${commsCode}`).update({ assignedTo: qLog.volunteerId || null, assignedTime: now, status: "assigned" });

    if (oldCommsId) {
      await db.ref(`comms/${oldCommsId}`).update({ assignedTo: null, assignedTime: null, status: "available" });
      await db.ref("commsEvents").push({
        commsId: oldCommsId, eventType: "released",
        volunteerName: qLog.name || "Unknown", volunteerId: qLog.volunteerId || null,
        logKey: qKey, date: todayDate, timestamp: now,
      });
    }
    await db.ref("commsEvents").push({
      commsId: commsCode, eventType: "transferred_to",
      volunteerName: qLog.name || "Unknown", volunteerId: qLog.volunteerId || null,
      previousCommsId: oldCommsId || null,
      logKey: qKey, date: todayDate, timestamp: now,
    });

    showToast(`Comms ${commsCode} → ${qLog.name || "queued volunteer"}`, "headset_mic", "text-teal-400");
    return;
  }

  // No reservation — free the comms
  await db.ref(`comms/${commsCode}`).update({ assignedTo: null, assignedTime: null, status: "available" });
}

// =============================
// Comms Overview Views
// =============================
function renderCommsView(map) {
  const content = document.getElementById("comms-content");
  if (!content) return;

  ["grid", "compact", "list"].forEach((v) => {
    const btn = document.getElementById(`comms-view-${v}`);
    if (!btn) return;
    btn.className = v === commsView
      ? "comms-view-btn w-7 h-7 rounded-md flex items-center justify-center transition bg-neutral-700 text-white"
      : "comms-view-btn w-7 h-7 rounded-md flex items-center justify-center transition text-neutral-500 hover:text-white hover:bg-neutral-800";
  });

  // Build per-batch maps using FCFS: earliest timeIn across all batches wins the device
  function matchesAM(svcs) {
    return commsAmFilter === "all"
      ? svcs.some(s => s === "9AM" || s === "12NN")
      : svcs.includes(commsAmFilter);
  }
  function matchesPM(svcs) {
    return commsPmFilter === "all"
      ? svcs.some(s => s === "3PM" || s === "6PM")
      : svcs.includes(commsPmFilter);
  }

  // FCFS: group all non-timed-out commsId entries by code, sort by timeIn ascending
  const byCode = {};
  Object.entries(allLogs).forEach(([key, log]) => {
    if (log.timeOut || !log.commsId || log.commsId === "NONE") return;
    if (!byCode[log.commsId]) byCode[log.commsId] = [];
    byCode[log.commsId].push({ ...log, key });
  });
  Object.values(byCode).forEach(group => {
    group.sort((a, b) => (a.timeIn || "").localeCompare(b.timeIn || ""));
    const total = group.length;
    group.forEach((log, i) => {
      log._queuePos = i + 1;
      log._queueTotal = total;
      if (i > 0) log._isPending = true;
    });
  });

  // Distribute into batch maps — first per batch (earliest timeIn) wins
  const amMap = {}, pmMap = {};
  Object.values(byCode).forEach(group => {
    group.forEach(log => {
      const svcs = log.services || [];
      if (matchesAM(svcs) && !amMap[log.commsId]) amMap[log.commsId] = log;
      if (matchesPM(svcs) && !pmMap[log.commsId]) pmMap[log.commsId] = log;
    });
  });

  // Queue maps: pendingCommsId entries (waiting for a specific device to free up)
  const amQueueMap = {}, pmQueueMap = {};
  Object.entries(allLogs).forEach(([key, log]) => {
    if (log.timeOut || !log.pendingCommsId) return;
    const svcs = log.services || [];
    if (matchesAM(svcs) && !amQueueMap[log.pendingCommsId]) amQueueMap[log.pendingCommsId] = { ...log, key };
    if (matchesPM(svcs) && !pmQueueMap[log.pendingCommsId]) pmQueueMap[log.pendingCommsId] = { ...log, key };
  });

  function filterPill(label, currentFilter, batchKey, value, colorActive, colorInactive) {
    const isActive = currentFilter === value;
    return `<button class="comms-batch-filter text-[9px] px-1.5 py-0.5 rounded-full font-semibold transition ${isActive ? colorActive : colorInactive}" data-batch="${batchKey}" data-value="${value}">${label}</button>`;
  }

  function batchHeader(label, count, colorClass, batchKey, filterOpts) {
    const pills = filterOpts.map(f => filterPill(f.label, f.current, batchKey, f.value, f.colorActive, f.colorInactive)).join("");
    return `<div class="flex items-center gap-2 px-4 pt-3 pb-1.5 flex-wrap">
      <span class="text-[10px] font-bold uppercase tracking-widest ${colorClass}">${label}</span>
      <span class="text-[10px] text-neutral-600 font-mono">${count}/${allComms.length} in use</span>
      <div class="flex items-center gap-1 ml-auto">${pills}</div>
    </div>`;
  }

  const amOpts = [
    { label: "All", value: "all", current: commsAmFilter, colorActive: "bg-sky-500 text-white", colorInactive: "text-neutral-500 hover:text-sky-400" },
    { label: "9AM", value: "9AM", current: commsAmFilter, colorActive: "bg-sky-500 text-white", colorInactive: "text-neutral-500 hover:text-sky-400" },
    { label: "12NN", value: "12NN", current: commsAmFilter, colorActive: "bg-sky-500 text-white", colorInactive: "text-neutral-500 hover:text-sky-400" },
  ];
  const pmOpts = [
    { label: "All", value: "all", current: commsPmFilter, colorActive: "bg-violet-500 text-white", colorInactive: "text-neutral-500 hover:text-violet-400" },
    { label: "3PM", value: "3PM", current: commsPmFilter, colorActive: "bg-violet-500 text-white", colorInactive: "text-neutral-500 hover:text-violet-400" },
    { label: "6PM", value: "6PM", current: commsPmFilter, colorActive: "bg-violet-500 text-white", colorInactive: "text-neutral-500 hover:text-violet-400" },
  ];

  function gridCell(c, batchMap, queueMap) {
    const active = batchMap[c.code];
    const queued = queueMap[c.code];
    if (active) {
      if (active._isPending) {
        const displayName = volunteerNicknameMap[active.volunteerId] || (active.name || "").split(" ")[0];
        const pPos = active._queuePos || 2;
        const pTotal = active._queueTotal || 2;
        return `<div class="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 flex flex-col items-center gap-1 min-w-0">
          <span class="font-mono font-black text-amber-400 text-base leading-none">${c.code}</span>
          <span class="text-[9px] text-neutral-500 text-center leading-tight truncate w-full">${c.assignment}</span>
          <span class="text-[10px] font-semibold text-amber-300 text-center leading-tight truncate w-full">${displayName}</span>
          <span class="text-[8px] font-bold text-amber-500 font-mono bg-amber-500/10 px-1.5 py-0.5 rounded-full">#${pPos} of ${pTotal}</span>
        </div>`;
      }
      const since = active.timeIn ? calcDuration({ timeIn: active.timeIn }) : "—";
      const displayName = volunteerNicknameMap[active.volunteerId] || (active.name || "").split(" ")[0];
      const queuedName = queued ? (volunteerNicknameMap[queued.volunteerId] || (queued.name || "").split(" ")[0]) : null;
      const qTotal = active._queueTotal || 1;
      const posBadge = qTotal > 1 ? `<span class="text-[8px] font-bold text-green-500 font-mono bg-green-500/10 px-1.5 py-0.5 rounded-full">#1 of ${qTotal}</span>` : "";
      return `<div class="rounded-lg border border-green-500/40 bg-green-500/5 p-2 flex flex-col items-center gap-1 min-w-0">
        <span class="font-mono font-black text-green-400 text-base leading-none">${c.code}</span>
        <span class="text-[9px] text-neutral-500 text-center leading-tight truncate w-full">${c.assignment}</span>
        <span class="text-[10px] font-semibold text-white text-center leading-tight truncate w-full">${displayName}</span>
        <span class="text-[9px] text-green-600 font-mono">${since}</span>
        ${posBadge}
        ${queuedName ? `<span class="text-[8px] text-amber-400 font-semibold flex items-center gap-0.5"><span class="material-icons-round" style="font-size:8px">hourglass_top</span>${queuedName}</span>` : ""}
      </div>`;
    }
    if (queued) {
      const displayName = volunteerNicknameMap[queued.volunteerId] || (queued.name || "").split(" ")[0];
      return `<div class="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 flex flex-col items-center gap-1 min-w-0">
        <span class="font-mono font-black text-amber-400 text-base leading-none">${c.code}</span>
        <span class="text-[9px] text-neutral-500 text-center leading-tight truncate w-full">${c.assignment}</span>
        <span class="material-icons-round text-amber-500" style="font-size:11px">hourglass_top</span>
        <span class="text-[10px] font-semibold text-amber-300 text-center leading-tight truncate w-full">${displayName}</span>
        <span class="text-[9px] text-amber-700 font-mono">queued</span>
      </div>`;
    }
    const otherBatch = map[c.code];
    return `<div class="rounded-lg border border-neutral-800 bg-neutral-900/50 p-2 flex flex-col items-center gap-1 min-w-0 opacity-40">
      <span class="font-mono font-bold text-neutral-500 text-base leading-none">${c.code}</span>
      <span class="text-[9px] text-neutral-700 text-center leading-tight truncate w-full">${c.assignment}</span>
      <span class="text-[9px] text-neutral-700">${otherBatch ? "Other batch" : "—"}</span>
    </div>`;
  }

  function compactCell(c, batchMap, queueMap) {
    const active = batchMap[c.code];
    const queued = queueMap[c.code];
    if (active) {
      if (active._isPending) {
        const displayName = volunteerNicknameMap[active.volunteerId] || (active.name || "").split(" ")[0];
        const pPos = active._queuePos || 2;
        const pTotal = active._queueTotal || 2;
        return `<div class="rounded-md bg-amber-500/10 border border-amber-500/30 px-1.5 py-1.5 flex flex-col items-center gap-0.5 min-w-0">
          <span class="font-mono font-black text-amber-400 text-xs leading-none">${c.code}</span>
          <span class="text-[8px] text-amber-400 truncate w-full text-center leading-tight">${displayName}</span>
          <span class="text-[7px] font-bold text-amber-500 font-mono">#${pPos}/${pTotal}</span>
        </div>`;
      }
      const displayName = volunteerNicknameMap[active.volunteerId] || (active.name || "").split(" ")[0];
      const queuedName = queued ? (volunteerNicknameMap[queued.volunteerId] || (queued.name || "").split(" ")[0]) : null;
      const qTotal = active._queueTotal || 1;
      const posBadge = qTotal > 1 ? `<span class="text-[7px] font-bold text-green-500 font-mono">#1/${qTotal}</span>` : "";
      return `<div class="rounded-md bg-green-500/10 border border-green-500/30 px-1.5 py-1.5 flex flex-col items-center gap-0.5 min-w-0">
        <span class="font-mono font-black text-green-400 text-xs leading-none">${c.code}</span>
        <span class="text-[8px] text-neutral-400 truncate w-full text-center leading-tight">${displayName}</span>
        ${posBadge}
        ${queuedName ? `<span class="text-[7px] text-amber-400 flex items-center gap-0.5"><span class="material-icons-round" style="font-size:7px">hourglass_top</span>${queuedName}</span>` : ""}
      </div>`;
    }
    if (queued) {
      const displayName = volunteerNicknameMap[queued.volunteerId] || (queued.name || "").split(" ")[0];
      return `<div class="rounded-md bg-amber-500/10 border border-amber-500/30 px-1.5 py-1.5 flex flex-col items-center gap-0.5 min-w-0">
        <span class="font-mono font-black text-amber-400 text-xs leading-none">${c.code}</span>
        <span class="text-[7px] text-amber-500 flex items-center gap-0.5 justify-center"><span class="material-icons-round" style="font-size:7px">hourglass_top</span>${displayName}</span>
      </div>`;
    }
    return `<div class="rounded-md bg-neutral-900 border border-neutral-800 px-1.5 py-1.5 flex flex-col items-center gap-0.5 min-w-0 opacity-35">
      <span class="font-mono font-bold text-neutral-600 text-xs leading-none">${c.code}</span>
      <span class="text-[8px] text-neutral-700 text-center leading-tight">—</span>
    </div>`;
  }

  function listRow(c, batchMap, queueMap) {
    const active = batchMap[c.code];
    const queued = queueMap[c.code];
    if (active) {
      if (active._isPending) {
        const pPos = active._queuePos || 2;
        const pTotal = active._queueTotal || 2;
        return `<tr class="hover:bg-neutral-800 transition duration-150 border-b border-neutral-800/50 opacity-75">
          <td class="px-4 py-2"><span class="material-icons-round text-amber-500" style="font-size:9px">pending</span></td>
          <td class="px-4 py-2"><span class="font-mono font-bold text-amber-400 text-xs">${c.code}</span><span class="text-[9px] font-bold text-amber-500 font-mono bg-amber-500/10 px-1.5 py-0.5 rounded-full ml-1">#${pPos} of ${pTotal}</span></td>
          <td class="px-4 py-2 text-neutral-400 text-xs">${c.assignment}</td>
          <td class="px-4 py-2 text-xs"><span class="font-semibold text-amber-300">${active.name || "—"}</span><br/><span class="text-neutral-500">${active.role || ""}</span></td>
          <td class="px-4 py-2 text-amber-700 text-xs font-mono">pending</td>
          <td class="px-4 py-2"></td>
        </tr>`;
      }
      const since = active.timeIn ? calcDuration({ timeIn: active.timeIn }) : "—";
      const queuedName = queued ? (volunteerNicknameMap[queued.volunteerId] || (queued.name || "").split(" ")[0]) : null;
      const qTotal = active._queueTotal || 1;
      const posBadge = qTotal > 1 ? `<span class="text-[9px] font-bold text-green-500 font-mono bg-green-500/10 px-1.5 py-0.5 rounded-full ml-1">#1 of ${qTotal}</span>` : "";
      return `<tr class="hover:bg-neutral-800 transition duration-150 border-b border-neutral-800/50">
        <td class="px-4 py-2"><span class="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse"></span></td>
        <td class="px-4 py-2"><button class="comms-history-btn font-mono font-bold text-white bg-neutral-800 hover:bg-neutral-700 px-2 py-0.5 rounded text-xs transition cursor-pointer" data-comms="${c.code}">${c.code}</button>${posBadge}</td>
        <td class="px-4 py-2 text-neutral-400 text-xs">${c.assignment}</td>
        <td class="px-4 py-2 text-xs"><span class="font-semibold text-white">${active.name || "—"}</span><br/><span class="text-neutral-500">${active.role || ""}</span>${queuedName ? `<br/><span class="text-[9px] text-amber-400 flex items-center gap-0.5 mt-0.5"><span class="material-icons-round" style="font-size:9px">hourglass_top</span>queued: ${queuedName}</span>` : ""}</td>
        <td class="px-4 py-2 font-mono text-green-400 text-xs">${since}</td>
        <td class="px-4 py-2"><button class="force-timeout-btn text-neutral-600 hover:text-red-400 transition text-xs flex items-center gap-1" data-key="${active.key}" data-comms="${c.code}" data-name="${active.name || ""}" data-time="${active.timeIn || ""}"><span class="material-icons-round text-sm">logout</span></button></td>
      </tr>`;
    }
    if (queued) {
      return `<tr class="hover:bg-neutral-800 transition duration-150 border-b border-neutral-800/50 opacity-75">
        <td class="px-4 py-2"><span class="material-icons-round text-amber-500" style="font-size:9px">hourglass_top</span></td>
        <td class="px-4 py-2"><span class="font-mono font-bold text-amber-400 text-xs">${c.code}</span></td>
        <td class="px-4 py-2 text-neutral-400 text-xs">${c.assignment}</td>
        <td class="px-4 py-2 text-xs"><span class="font-semibold text-amber-300">${queued.name || "—"}</span><br/><span class="text-neutral-500">${queued.role || ""}</span></td>
        <td class="px-4 py-2 text-amber-700 text-xs font-mono">queued</td>
        <td class="px-4 py-2"></td>
      </tr>`;
    }
    return `<tr class="border-b border-neutral-800/30 opacity-35">
      <td class="px-4 py-2"><span class="inline-block w-2 h-2 rounded-full bg-neutral-700"></span></td>
      <td class="px-4 py-2"><span class="font-mono font-bold text-neutral-600 text-xs">${c.code}</span></td>
      <td class="px-4 py-2 text-neutral-600 text-xs">${c.assignment}</td>
      <td class="px-4 py-2 text-neutral-700 text-xs">Available</td>
      <td class="px-4 py-2 text-neutral-700 text-xs">—</td>
      <td class="px-4 py-2"></td>
    </tr>`;
  }

  function wireFilterBtns() {
    content.querySelectorAll(".comms-batch-filter").forEach(btn => {
      btn.addEventListener("click", () => {
        const { batch, value } = btn.dataset;
        if (batch === "am") commsAmFilter = value;
        else if (batch === "pm") commsPmFilter = value;
        renderCommsView(activeCommsMap);
      });
    });
  }

  const divider = `<div class="border-t border-neutral-800/60 mx-2"></div>`;
  const listThead = `<thead><tr class="text-neutral-500 text-xs uppercase tracking-wider border-b border-neutral-800">
    <th class="px-4 py-2 text-left font-semibold w-6"></th>
    <th class="px-4 py-2 text-left font-semibold">Comms</th>
    <th class="px-4 py-2 text-left font-semibold">Assignment</th>
    <th class="px-4 py-2 text-left font-semibold">Volunteer</th>
    <th class="px-4 py-2 text-left font-semibold">Since</th>
    <th class="px-4 py-2 text-left font-semibold"></th>
  </tr></thead>`;

  if (commsView === "grid") {
    content.innerHTML =
      batchHeader("AM Batch · 9AM & 12NN", Object.keys(amMap).length, "text-sky-400", "am", amOpts) +
      `<div class="px-4 pb-3 grid grid-cols-8 gap-2">${allComms.map(c => gridCell(c, amMap, amQueueMap)).join("")}</div>` +
      divider +
      batchHeader("PM Batch · 3PM & 6PM", Object.keys(pmMap).length, "text-violet-400", "pm", pmOpts) +
      `<div class="px-4 pb-3 grid grid-cols-8 gap-2">${allComms.map(c => gridCell(c, pmMap, pmQueueMap)).join("")}</div>`;
    wireFilterBtns();

  } else if (commsView === "compact") {
    content.innerHTML =
      batchHeader("AM Batch · 9AM & 12NN", Object.keys(amMap).length, "text-sky-400", "am", amOpts) +
      `<div class="px-3 pb-3 grid grid-cols-8 gap-1.5">${allComms.map(c => compactCell(c, amMap, amQueueMap)).join("")}</div>` +
      divider +
      batchHeader("PM Batch · 3PM & 6PM", Object.keys(pmMap).length, "text-violet-400", "pm", pmOpts) +
      `<div class="px-3 pb-3 grid grid-cols-8 gap-1.5">${allComms.map(c => compactCell(c, pmMap, pmQueueMap)).join("")}</div>`;
    wireFilterBtns();

  } else {
    content.innerHTML =
      batchHeader("AM Batch · 9AM & 12NN", Object.keys(amMap).length, "text-sky-400", "am", amOpts) +
      `<table class="w-full text-sm">${listThead}<tbody>${allComms.map(c => listRow(c, amMap, amQueueMap)).join("")}</tbody></table>` +
      divider +
      batchHeader("PM Batch · 3PM & 6PM", Object.keys(pmMap).length, "text-violet-400", "pm", pmOpts) +
      `<table class="w-full text-sm">${listThead}<tbody>${allComms.map(c => listRow(c, pmMap, pmQueueMap)).join("")}</tbody></table>`;
    wireFilterBtns();

    content.querySelectorAll(".comms-history-btn").forEach((btn) => {
      btn.addEventListener("click", () => showCommsHistory(btn.dataset.comms));
    });
    content.querySelectorAll(".force-timeout-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const { key, comms, name, time } = btn.dataset;
        const confirmed = await showConfirm(`Force time-out for "${name}"?`);
        if (!confirmed) return;
        const now = new Date().toISOString();
        await db.ref(`logs/${todayDate}/${key}`).update({ timeOut: now, status: null, commsStatusOut: "OK" });
        await releaseCommsOrAutoAssign(comms);
        syncToSheets({ action: "timeOut", logKey: key, timeOut: now, timeIn: time });
        showToast(`"${name}" timed out`, "logout", "text-red-400");
      });
    });
  }
}

// View toggle handlers
["grid", "compact", "list"].forEach((v) => {
  document.getElementById(`comms-view-${v}`)?.addEventListener("click", () => {
    commsView = v;
    renderCommsView(activeCommsMap);
  });
});

// =============================
// Previous Logs (all dates)
// =============================
let previousLogsLoaded = false;
let allPreviousEntries = [];
let filteredPreviousEntries = [];
let prevLogsPage = 1;
const PREV_LOGS_PER_PAGE = 25;
let prevLogsSortKey = "date-desc";
let prevLogsDateFilter = null; // null = all, "YYYY-MM-DD" = specific date
let prevLogsSegFilter = "all";
let prevLogsCommsFilter = "all";
let prevLogsIdFilter = "all";
let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();

function loadPreviousLogs() {
  if (previousLogsLoaded) return;
  previousLogsLoaded = true;

  db.ref("logs").once("value", (snapshot) => {
    const allDates = snapshot.val() || {};
    allPreviousEntries = [];
    Object.entries(allDates).forEach(([date, dateLogs]) => {
      Object.entries(dateLogs).forEach(([key, log]) => {
        if (log.status === "pending") return;
        allPreviousEntries.push({ key, date, ...log });
      });
    });
    prevLogsPage = 1;
    renderPrevLogsPills();
    renderCalendar();
    filterAndRenderPreviousLogs();
  });
}

function calcDurationMs(log) {
  if (!log.timeIn) return 0;
  const start = new Date(log.timeIn);
  const end = log.timeOut ? new Date(log.timeOut) : new Date();
  return end - start;
}

function sortPreviousEntries(entries) {
  const key = prevLogsSortKey;
  return entries.slice().sort((a, b) => {
    switch (key) {
      case "date-asc":
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.timeIn || "").localeCompare(b.timeIn || "");
      case "date-desc":
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return (b.timeIn || "").localeCompare(a.timeIn || "");
      case "name-asc": return (a.name || "").localeCompare(b.name || "");
      case "name-desc": return (b.name || "").localeCompare(a.name || "");
      case "segment-asc": return (a.segment || "").localeCompare(b.segment || "");
      case "segment-desc": return (b.segment || "").localeCompare(a.segment || "");
      case "comms-asc": return (a.commsId || "").localeCompare(b.commsId || "");
      case "comms-desc": return (b.commsId || "").localeCompare(a.commsId || "");
      case "timein-asc": return (a.timeIn || "").localeCompare(b.timeIn || "");
      case "timein-desc": return (b.timeIn || "").localeCompare(a.timeIn || "");
      case "timeout-asc": return (a.timeOut || "").localeCompare(b.timeOut || "");
      case "timeout-desc": return (b.timeOut || "").localeCompare(a.timeOut || "");
      case "duration-desc": return calcDurationMs(b) - calcDurationMs(a);
      case "duration-asc": return calcDurationMs(a) - calcDurationMs(b);
      default:
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return (b.timeIn || "").localeCompare(a.timeIn || "");
    }
  });
}

function filterAndRenderPreviousLogs() {
  const searchTerm = (document.getElementById("prev-logs-search").value || "").toLowerCase().trim();

  let entries = allPreviousEntries;
  if (searchTerm) {
    entries = entries.filter((log) => {
      const haystack = `${log.date} ${log.name} ${log.segment} ${log.role} ${log.commsId} ${log.numberedId}`.toLowerCase();
      return haystack.includes(searchTerm);
    });
  }
  if (prevLogsDateFilter) {
    entries = entries.filter((e) => e.date === prevLogsDateFilter);
  }
  if (prevLogsSegFilter !== "all") {
    entries = entries.filter((e) => e.segment === prevLogsSegFilter);
  }
  if (prevLogsCommsFilter === "has") {
    entries = entries.filter((e) => e.commsId && e.commsId !== "NONE");
  } else if (prevLogsCommsFilter === "none") {
    entries = entries.filter((e) => !e.commsId || e.commsId === "NONE");
  }
  if (prevLogsIdFilter === "has") {
    entries = entries.filter((e) => !e.noId);
  } else if (prevLogsIdFilter === "none") {
    entries = entries.filter((e) => e.noId === true);
  }

  filteredPreviousEntries = sortPreviousEntries(entries);
  updatePrevSortArrows();
  renderPreviousLogsPage();
}

function renderPreviousLogsPage() {
  const section = document.getElementById("previous-logs-section");
  const body = document.getElementById("previous-logs-body");
  const noMsg = document.getElementById("no-prev-logs-message");
  body.innerHTML = "";

  const total = filteredPreviousEntries.length;

  if (allPreviousEntries.length === 0) {
    section.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");
  document.getElementById("previous-logs-count").textContent = `(${total})`;

  if (total === 0) {
    noMsg.classList.remove("hidden");
    document.getElementById("prev-logs-page-info").textContent = "";
    document.getElementById("prev-logs-page-numbers").innerHTML = "";
    ["prev-logs-first", "prev-logs-prev", "prev-logs-next", "prev-logs-last"].forEach(id => {
      document.getElementById(id).disabled = true;
    });
    return;
  }
  noMsg.classList.add("hidden");

  const totalPages = Math.ceil(total / PREV_LOGS_PER_PAGE);
  if (prevLogsPage > totalPages) prevLogsPage = totalPages;
  if (prevLogsPage < 1) prevLogsPage = 1;

  const startIdx = (prevLogsPage - 1) * PREV_LOGS_PER_PAGE;
  const endIdx = Math.min(startIdx + PREV_LOGS_PER_PAGE, total);
  const pageEntries = filteredPreviousEntries.slice(startIdx, endIdx);

  pageEntries.forEach((log) => {
    const row = document.createElement("tr");
    row.className = "hover:bg-neutral-800 transition duration-150 opacity-50 hover:opacity-80";

    const isToday = log.date === todayDate;
    const dateBadge = isToday
      ? `<span class="font-mono text-green-400 text-xs">${log.date}</span> <span class="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full font-semibold">TODAY</span>`
      : `<span class="font-mono text-neutral-400 text-xs">${log.date}</span>`;
    row.appendChild(td(dateBadge));
    row.appendChild(td(`<span class="text-neutral-400">${log.name || "—"}</span>`));
    row.appendChild(
      td(`<span class="text-neutral-600 text-xs">${log.segment || "—"}</span><br/><span class="text-neutral-400">${log.role || "—"}</span>${servicesBadge(log.services)}`)
    );
    row.appendChild(commsButton(log.commsId));

    // ID status
    const prevIdTd = document.createElement("td");
    prevIdTd.className = "px-4 py-3 text-sm text-center";
    if (log.noId) {
      prevIdTd.innerHTML = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-semibold uppercase tracking-wide"><span class="material-icons-round text-xs">warning</span>No ID</span>`;
    } else {
      prevIdTd.innerHTML = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-700/30 text-neutral-500 text-[10px] font-semibold uppercase tracking-wide"><span class="material-icons-round text-xs">verified</span>OK</span>`;
    }
    row.appendChild(prevIdTd);

    row.appendChild(td(`<span class="font-mono text-neutral-500 text-xs">${formatTime(log.timeIn)}</span>`));
    row.appendChild(td(`<span class="font-mono text-neutral-500 text-xs">${formatTime(log.timeOut)}</span>`));
    row.appendChild(td(`<span class="font-mono text-neutral-500 text-xs">${calcDuration(log)}</span>`));

    const actionTd = document.createElement("td");
    actionTd.className = "px-4 py-3 text-sm";
    actionTd.innerHTML = `<button class="prev-log-delete-btn text-neutral-600 hover:text-red-400 transition" data-date="${log.date}" data-key="${log.key}" data-name="${log.name || ""}" title="Delete entry"><span class="material-icons-round text-base">delete_outline</span></button>`;
    row.appendChild(actionTd);

    body.appendChild(row);
  });

  // Attach delete handlers
  document.querySelectorAll(".prev-log-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { date, key, name } = btn.dataset;
      const confirmed = await showConfirm(`Delete log for "${name}" on ${date}?`);
      if (!confirmed) return;
      await db.ref(`logs/${date}/${key}`).remove();
      // Remove from allPreviousEntries
      allPreviousEntries = allPreviousEntries.filter(e => !(e.key === key && e.date === date));
      filterAndRenderPreviousLogs();
      showToast("Log entry deleted", "delete", "text-red-400");
    });
  });

  // Attach comms history click handlers for previous logs
  body.querySelectorAll(".comms-history-btn").forEach((btn) => {
    btn.addEventListener("click", () => showCommsHistory(btn.dataset.comms));
  });

  // Pagination info
  document.getElementById("prev-logs-page-info").textContent = `${startIdx + 1}–${endIdx} of ${total}`;

  // Pagination buttons
  document.getElementById("prev-logs-first").disabled = prevLogsPage <= 1;
  document.getElementById("prev-logs-prev").disabled = prevLogsPage <= 1;
  document.getElementById("prev-logs-next").disabled = prevLogsPage >= totalPages;
  document.getElementById("prev-logs-last").disabled = prevLogsPage >= totalPages;

  // Page numbers
  const pageNumContainer = document.getElementById("prev-logs-page-numbers");
  pageNumContainer.innerHTML = "";
  const maxVisible = 5;
  let startPage = Math.max(1, prevLogsPage - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);
  if (endPage - startPage + 1 < maxVisible) startPage = Math.max(1, endPage - maxVisible + 1);

  for (let p = startPage; p <= endPage; p++) {
    const btn = document.createElement("button");
    btn.textContent = p;
    btn.className = p === prevLogsPage
      ? "w-8 h-8 rounded-lg text-xs font-bold bg-white text-neutral-900 transition"
      : "w-8 h-8 rounded-lg text-xs font-semibold text-neutral-500 hover:text-white bg-neutral-900 border border-neutral-800 transition";
    btn.addEventListener("click", () => {
      prevLogsPage = p;
      renderPreviousLogsPage();
    });
    pageNumContainer.appendChild(btn);
  }
}

// Pagination button handlers
document.getElementById("prev-logs-first").addEventListener("click", () => { prevLogsPage = 1; renderPreviousLogsPage(); });
document.getElementById("prev-logs-prev").addEventListener("click", () => { prevLogsPage--; renderPreviousLogsPage(); });
document.getElementById("prev-logs-next").addEventListener("click", () => { prevLogsPage++; renderPreviousLogsPage(); });
document.getElementById("prev-logs-last").addEventListener("click", () => { prevLogsPage = Math.ceil(filteredPreviousEntries.length / PREV_LOGS_PER_PAGE); renderPreviousLogsPage(); });

// Search handler for previous logs
document.getElementById("prev-logs-search").addEventListener("input", () => {
  prevLogsPage = 1;
  filterAndRenderPreviousLogs();
});

// Clickable sort headers
document.querySelectorAll(".prev-sort-header").forEach((th) => {
  th.addEventListener("click", () => {
    const col = th.dataset.sort; // date | name | segment | comms | timein | timeout | duration
    const currentBase = prevLogsSortKey.replace(/-asc$|-desc$/, "");
    const currentDir = prevLogsSortKey.endsWith("-asc") ? "asc" : "desc";
    const newDir = (currentBase === col && currentDir === "desc") ? "asc" : "desc";
    prevLogsSortKey = `${col}-${newDir}`;
    prevLogsPage = 1;
    filterAndRenderPreviousLogs();
  });
});

function updatePrevSortArrows() {
  ["date", "name", "segment", "comms", "timein", "timeout", "duration"].forEach((k) => {
    const el = document.getElementById(`prev-arrow-${k}`);
    if (!el) return;
    const base = prevLogsSortKey.replace(/-asc$|-desc$/, "");
    if (base === k) {
      el.textContent = prevLogsSortKey.endsWith("-asc") ? "↑" : "↓";
      el.className = "font-mono text-white text-[10px]";
    } else {
      el.textContent = "";
    }
  });
}

function renderPrevLogsPills() {
  const container = document.getElementById("prev-logs-filter-pills");
  if (!container) return;
  const allSegs = [...new Set(allPreviousEntries.map((e) => e.segment).filter(Boolean))].sort();
  container.innerHTML = "";

  function makePill(label, isActive, onClick) {
    const p = document.createElement("button");
    p.textContent = label;
    p.className = isActive
      ? "px-3 py-1 rounded-full text-xs font-semibold bg-white text-neutral-900 transition"
      : "px-3 py-1 rounded-full text-xs font-semibold bg-neutral-800 text-neutral-400 border border-neutral-700 hover:border-neutral-500 hover:text-white transition";
    p.addEventListener("click", onClick);
    return p;
  }

  function sep() {
    const s = document.createElement("span");
    s.className = "w-px h-5 bg-neutral-700 self-center mx-0.5";
    return s;
  }

  container.appendChild(makePill("All", prevLogsSegFilter === "all", () => { prevLogsSegFilter = "all"; prevLogsPage = 1; renderPrevLogsPills(); filterAndRenderPreviousLogs(); }));
  allSegs.forEach((seg) => {
    container.appendChild(makePill(seg, prevLogsSegFilter === seg, () => { prevLogsSegFilter = prevLogsSegFilter === seg ? "all" : seg; prevLogsPage = 1; renderPrevLogsPills(); filterAndRenderPreviousLogs(); }));
  });
  container.appendChild(sep());
  container.appendChild(makePill("Has Comms", prevLogsCommsFilter === "has", () => { prevLogsCommsFilter = prevLogsCommsFilter === "has" ? "all" : "has"; prevLogsPage = 1; renderPrevLogsPills(); filterAndRenderPreviousLogs(); }));
  container.appendChild(makePill("No Comms", prevLogsCommsFilter === "none", () => { prevLogsCommsFilter = prevLogsCommsFilter === "none" ? "all" : "none"; prevLogsPage = 1; renderPrevLogsPills(); filterAndRenderPreviousLogs(); }));
  container.appendChild(sep());
  container.appendChild(makePill("Has ID", prevLogsIdFilter === "has", () => { prevLogsIdFilter = prevLogsIdFilter === "has" ? "all" : "has"; prevLogsPage = 1; renderPrevLogsPills(); filterAndRenderPreviousLogs(); }));
  container.appendChild(makePill("No ID", prevLogsIdFilter === "none", () => { prevLogsIdFilter = prevLogsIdFilter === "none" ? "all" : "none"; prevLogsPage = 1; renderPrevLogsPills(); filterAndRenderPreviousLogs(); }));
}

function renderCalendar() {
  const grid = document.getElementById("cal-grid");
  const label = document.getElementById("cal-month-label");
  if (!grid || !label) return;

  label.textContent = new Date(calendarYear, calendarMonth, 1).toLocaleDateString([], { month: "long", year: "numeric" });

  const datesWithEntries = new Set(allPreviousEntries.map((e) => e.date));
  const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

  grid.innerHTML = "";
  for (let i = 0; i < firstDay; i++) grid.appendChild(document.createElement("div"));

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const hasEntries = datesWithEntries.has(dateStr);
    const isSelected = prevLogsDateFilter === dateStr;
    const isToday = dateStr === todayDate;

    const btn = document.createElement("button");
    btn.className = [
      "relative w-8 h-8 mx-auto rounded-lg text-xs transition flex items-center justify-center leading-none",
      isSelected ? "bg-white text-neutral-900 font-bold" :
      isToday && hasEntries ? "text-green-400 font-semibold hover:bg-neutral-800" :
      isToday ? "text-green-400 font-semibold" :
      hasEntries ? "text-white hover:bg-neutral-800" :
      "text-neutral-700 pointer-events-none",
    ].join(" ");
    btn.textContent = d;

    if (hasEntries || isToday) {
      btn.addEventListener("click", () => {
        prevLogsDateFilter = isSelected ? null : dateStr;
        const calLabel = document.getElementById("prev-logs-calendar-label");
        calLabel.textContent = prevLogsDateFilter
          ? new Date(prevLogsDateFilter + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
          : "All Dates";
        document.getElementById("prev-logs-calendar").classList.add("hidden");
        const calBtn = document.getElementById("prev-logs-calendar-btn");
        if (prevLogsDateFilter) calBtn.classList.add("border-white/30", "text-white");
        else calBtn.classList.remove("border-white/30", "text-white");
        prevLogsPage = 1;
        renderCalendar();
        filterAndRenderPreviousLogs();
      });
    }

    if (hasEntries && !isSelected) {
      const dot = document.createElement("span");
      dot.className = "absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full " + (isToday ? "bg-green-500" : "bg-neutral-500");
      btn.appendChild(dot);
    }

    grid.appendChild(btn);
  }
}

// Calendar toggle
document.getElementById("prev-logs-calendar-btn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  const cal = document.getElementById("prev-logs-calendar");
  cal.classList.toggle("hidden");
  if (!cal.classList.contains("hidden")) renderCalendar();
});

document.addEventListener("click", (e) => {
  const cal = document.getElementById("prev-logs-calendar");
  if (cal && !cal.classList.contains("hidden") && !cal.closest(".relative")?.contains(e.target)) {
    cal.classList.add("hidden");
  }
});

document.getElementById("cal-prev-month")?.addEventListener("click", () => {
  calendarMonth--;
  if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
  renderCalendar();
});
document.getElementById("cal-next-month")?.addEventListener("click", () => {
  calendarMonth++;
  if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
  renderCalendar();
});
document.getElementById("cal-clear")?.addEventListener("click", () => {
  prevLogsDateFilter = null;
  document.getElementById("prev-logs-calendar-label").textContent = "All Dates";
  document.getElementById("prev-logs-calendar-btn").classList.remove("border-white/30", "text-white");
  document.getElementById("prev-logs-calendar").classList.add("hidden");
  prevLogsPage = 1;
  renderCalendar();
  filterAndRenderPreviousLogs();
});

// =============================
// Download XLSX
// =============================
document.getElementById("download-xlsx-btn").addEventListener("click", async () => {
  const btn = document.getElementById("download-xlsx-btn");
  btn.disabled = true;
  btn.classList.add("opacity-50", "pointer-events-none");

  try {
    // Use allPreviousEntries if loaded, otherwise fetch fresh
    let entries = allPreviousEntries;
    if (entries.length === 0) {
      const snap = await db.ref("logs").once("value");
      const allDates = snap.val() || {};
      entries = [];
      Object.entries(allDates).forEach(([date, dateLogs]) => {
        Object.entries(dateLogs).forEach(([key, log]) => {
          if (log.status === "pending") return;
          entries.push({ key, date, ...log });
        });
      });
    }

    // Sort by date desc, then timeIn desc
    entries.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return (b.timeIn || "").localeCompare(a.timeIn || "");
    });

    // Build sheet data
    const rows = entries.map((log) => ({
      Date: log.date,
      Volunteer: log.name || "",
      Segment: log.segment || "",
      Role: log.role || "",
      Comms: log.commsId || "",
      "Seg ID": log.numberedId || "",
      "Time In": log.timeIn ? new Date(log.timeIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
      "Time Out": log.timeOut ? new Date(log.timeOut).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
      Duration: calcDuration(log),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Logs");

    // Auto-size columns
    const colWidths = Object.keys(rows[0] || {}).map((key) => {
      const maxLen = Math.max(key.length, ...rows.map((r) => String(r[key] || "").length));
      return { wch: Math.min(maxLen + 2, 30) };
    });
    ws["!cols"] = colWidths;

    XLSX.writeFile(wb, `LiveProd_Logs_${todayDate}.xlsx`);
    showToast(`Downloaded ${rows.length} records`, "download", "text-green-400");
  } catch (err) {
    console.error("XLSX download error:", err);
    showToast("Failed to download", "error", "text-red-400");
  } finally {
    btn.disabled = false;
    btn.classList.remove("opacity-50", "pointer-events-none");
  }
});

// Load previous logs on page load
loadPreviousLogs();

// =============================
// Toast & Confirm Modal
// =============================
function showToast(msg, icon = "check_circle", color = "text-green-400") {
  const toast = document.getElementById("toast");
  document.getElementById("toast-msg").textContent = msg;
  const iconEl = document.getElementById("toast-icon");
  iconEl.textContent = icon;
  iconEl.className = `material-icons-round text-base ${color}`;
  toast.classList.remove("hidden");
  toast.style.animation = "none";
  toast.offsetHeight;
  toast.style.animation = "toastIn 0.3s ease forwards";
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.animation = "toastOut 0.3s ease forwards";
    setTimeout(() => toast.classList.add("hidden"), 300);
  }, 3000);
}

function showConfirm(msg) {
  return new Promise((resolve) => {
    const modal = document.getElementById("confirm-modal");
    document.getElementById("confirm-modal-msg").textContent = msg;
    modal.classList.remove("hidden");

    const okBtn = document.getElementById("confirm-modal-ok");
    const cancelBtn = document.getElementById("confirm-modal-cancel");

    const cleanup = () => {
      modal.classList.add("hidden");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
    };
    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
  });
}

// =============================
// Search
// =============================
searchInput.addEventListener("input", () => renderTable());

// Reset sort button — also clears active filters
document.getElementById("sort-reset")?.addEventListener("click", () => {
  activeSort = { key: "timein", dir: "desc" };
  activeSegFilter = "all";
  activeCommsFilter = "all";
  activeIdFilter = "all";
  activeSearch = "";
  const searchEl = document.getElementById("active-search");
  if (searchEl) searchEl.value = "";
  renderTable();
});

// Active table sortable column headers
function toggleActiveSort(key) {
  if (activeSort.key === key) {
    activeSort.dir = activeSort.dir === "asc" ? "desc" : "asc";
  } else {
    activeSort = { key, dir: key === "timein" ? "desc" : "asc" };
  }
  renderTable();
}
document.getElementById("active-th-name")?.addEventListener("click", () => toggleActiveSort("name"));
document.getElementById("active-th-timein")?.addEventListener("click", () => toggleActiveSort("timein"));
document.getElementById("active-th-duration")?.addEventListener("click", () => toggleActiveSort("duration"));

["name","segment","comms","timein","timeout","duration"].forEach((key) => {
  document.getElementById(`comp-th-${key}`)?.addEventListener("click", () => {
    if (compSort.key === key) { compSort.dir = compSort.dir === "asc" ? "desc" : "asc"; }
    else { compSort.key = key; compSort.dir = key === "timein" || key === "timeout" ? "desc" : "asc"; }
    renderTable();
  });
});

// Active section search
document.getElementById("active-search")?.addEventListener("input", (e) => {
  activeSearch = e.target.value;
  renderTable();
});

// Active section collapse toggle
let activeCollapsed = false;
document.getElementById("active-section-toggle").addEventListener("click", () => {
  activeCollapsed = !activeCollapsed;
  const body = document.getElementById("active-section-body");
  const icon = document.getElementById("active-toggle-icon");
  if (activeCollapsed) {
    body.style.maxHeight = "0px";
    body.style.overflow = "hidden";
    body.style.opacity = "0";
    icon.textContent = "expand_more";
  } else {
    body.style.maxHeight = "2000px";
    body.style.overflow = "";
    body.style.opacity = "1";
    icon.textContent = "expand_less";
  }
});

// Comms table collapse toggle
let commsCollapsed = false;
document.getElementById("comms-toggle").addEventListener("click", () => {
  commsCollapsed = !commsCollapsed;
  const wrapper = document.getElementById("comms-table-wrapper");
  const icon = document.getElementById("comms-toggle-icon");
  if (commsCollapsed) {
    wrapper.style.maxHeight = "0px";
    wrapper.style.opacity = "0";
    wrapper.style.borderColor = "transparent";
    icon.textContent = "expand_more";
  } else {
    wrapper.style.maxHeight = "2000px";
    wrapper.style.opacity = "1";
    wrapper.style.borderColor = "";
    icon.textContent = "expand_less";
  }
});

// =============================
// Comms History Modal
// =============================
async function showCommsHistory(commsId) {
  modalContent.innerHTML = `
    <div class="flex flex-col items-center gap-2 py-8">
      <div class="sparkle-row"><span class="sparkle-dot"></span><span class="sparkle-dot"></span><span class="sparkle-dot"></span></div>
      <p class="text-xs text-neutral-400 uppercase tracking-widest font-semibold">Loading history...</p>
    </div>`;
  modal.classList.remove("hidden");

  try {
    const [logsSnap, eventsSnap] = await Promise.all([
      db.ref(`logs/${todayDate}`).once("value"),
      db.ref("commsEvents").orderByChild("commsId").equalTo(commsId).once("value"),
    ]);

    const todayLogs = logsSnap.val() || {};
    const allEvents = eventsSnap.val() || {};

    // Build unified timeline entries
    const items = [];

    Object.entries(todayLogs).forEach(([key, log]) => {
      if (log.commsId === commsId) {
        items.push({ _type: "log", _sort: log.timeIn || "", ...log });
      }
    });

    Object.entries(allEvents).forEach(([, ev]) => {
      if (ev.date === todayDate) {
        items.push({ _type: "event", _sort: ev.timestamp || "", ...ev });
      }
    });

    items.sort((a, b) => (b._sort || "").localeCompare(a._sort || ""));

    if (items.length === 0) {
      modalContent.innerHTML = `
        <p class="text-center text-neutral-500 py-8">No history found for <span class="font-mono font-bold text-white">${commsId}</span></p>`;
      return;
    }

    const logCount = items.filter((i) => i._type === "log").length;

    let html = `
      <div class="mb-4 text-center">
        <span class="font-mono font-black text-2xl text-white">${commsId}</span>
        <p class="text-xs text-neutral-500 mt-1">${logCount} session${logCount !== 1 ? "s" : ""} today</p>
      </div>
      <div class="space-y-2 max-h-80 overflow-y-auto pr-1">`;

    items.forEach((h) => {
      if (h._type === "event") {
        let icon, label, color, subLabel;
        if (h.eventType === "transferred_to") {
          icon = "arrow_downward"; color = "text-amber-400"; label = "Assigned to";
          subLabel = h.previousCommsId ? `<span class="text-neutral-600">prev: <span class="font-mono">${h.previousCommsId}</span></span>` : "";
        } else if (h.eventType === "transferred_from") {
          icon = "arrow_upward"; color = "text-sky-400"; label = "Released from";
          subLabel = h.nextCommsId ? `<span class="text-neutral-600">moved to: <span class="font-mono">${h.nextCommsId}</span></span>` : "";
        } else {
          icon = "link_off"; color = "text-neutral-500"; label = "Released by"; subLabel = "";
        }
        html += `
          <div class="flex items-center gap-3 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2">
            <span class="material-icons-round text-sm ${color} flex-shrink-0">${icon}</span>
            <div class="flex-1 min-w-0">
              <p class="text-xs ${color} font-semibold">${label}</p>
              <p class="text-xs text-neutral-400 truncate">${h.volunteerName || "—"}</p>
              ${subLabel ? `<p class="text-[10px] mt-0.5">${subLabel}</p>` : ""}
            </div>
            <div class="text-xs text-neutral-600 font-mono flex-shrink-0">${formatTime(h.timestamp)}</div>
          </div>`;
      } else {
        const isClockedIn = !h.timeOut;
        const dotColor = isClockedIn ? "bg-green-400 animate-pulse" : "bg-neutral-600";
        const duration = calcDuration(h);
        html += `
          <div class="flex items-center gap-3 bg-neutral-800 rounded-lg px-3 py-2.5">
            <span class="w-2 h-2 rounded-full ${dotColor} flex-shrink-0"></span>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold text-white truncate">${h.name || "—"}</p>
              <p class="text-xs text-neutral-500">${h.segment || ""} / ${h.role || ""}</p>
            </div>
            <div class="text-right flex-shrink-0">
              <p class="text-xs font-mono text-green-400">${formatTime(h.timeIn)}</p>
              <p class="text-xs font-mono ${h.timeOut ? "text-red-400" : "text-neutral-600"}">${h.timeOut ? formatTime(h.timeOut) : "active"}</p>
            </div>
            <div class="text-xs text-neutral-500 font-mono flex-shrink-0">${duration}</div>
          </div>`;
      }
    });

    html += `</div>`;
    modalContent.innerHTML = html;
  } catch (error) {
    console.error("Error fetching comms history:", error);
    modalContent.innerHTML = `<p class="text-center text-red-400 py-8">Failed to load history.</p>`;
  }
}

modalClose.addEventListener("click", () => modal.classList.add("hidden"));
modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.classList.add("hidden");

});

// =============================
// Change Comms Modal
// =============================
const changeCommsModal = document.getElementById("change-comms-modal");
document.getElementById("change-comms-modal-close")?.addEventListener("click", () => changeCommsModal.classList.add("hidden"));
changeCommsModal?.addEventListener("click", (e) => { if (e.target === changeCommsModal) changeCommsModal.classList.add("hidden"); });

function openChangeCommsModal(logKey, currentCommsId, volName, volunteerId, isPending = false) {
  const titleEl = document.getElementById("change-comms-vol-name");
  titleEl.textContent = isPending ? `Reserve for ${volName}` : volName;
  const list = document.getElementById("change-comms-list");
  list.innerHTML = "";
  changeCommsModal.classList.remove("hidden");

  const currentLog = allLogs[logKey] || {};
  const currentPendingCommsId = currentLog.pendingCommsId || null;

  // Build map of comms codes already in use by OTHER active/confirmed volunteers
  const takenMap = {};
  Object.entries(allLogs).forEach(([key, log]) => {
    if (key !== logKey && !log.timeOut && log.commsId && log.commsId !== "NONE"
        && log.status !== "pending") {
      takenMap[log.commsId] = log.name;
    }
  });

  // For pending mode also include pending-out (will be freed soon but can be reserved)
  const pendingOutMap = {};
  if (isPending) {
    Object.entries(allLogs).forEach(([key, log]) => {
      if (key !== logKey && !log.timeOut && log.commsId && log.commsId !== "NONE"
          && log.status === "pending-out") {
        pendingOutMap[log.commsId] = log.name;
      }
    });
  }

  function makeCommsBtn(label, sublabel, code, isCurrent, isTaken) {
    const btn = document.createElement("button");
    btn.type = "button";
    const isPendingOut = isPending && pendingOutMap[code];
    const isReservable = isTaken && !isPendingOut; // Allow queuing for all volunteers
    const isCurrentQueue = code === currentPendingCommsId;

    if (isCurrent) {
      btn.className = "w-full text-left px-3 py-2 rounded-lg text-xs bg-white text-neutral-900 font-semibold flex items-center gap-2 transition";
    } else if (isCurrentQueue) {
      btn.className = "w-full text-left px-3 py-2 rounded-lg text-xs bg-amber-400/20 border border-amber-400/40 text-amber-300 hover:bg-amber-400/30 flex items-center gap-2 transition";
    } else if (isPendingOut) {
      btn.className = "w-full text-left px-3 py-2 rounded-lg text-xs bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-amber-500/20 flex items-center gap-2 transition";
    } else if (isReservable) {
      btn.className = "w-full text-left px-3 py-2 rounded-lg text-xs bg-amber-900/20 border border-amber-900/30 text-amber-500 hover:bg-amber-900/30 flex items-center gap-2 transition";
    } else {
      btn.className = "w-full text-left px-3 py-2 rounded-lg text-xs bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white flex items-center gap-2 transition";
    }

    const codeColor = isCurrent ? "text-neutral-900"
      : (isCurrentQueue || isPendingOut || isReservable) ? "text-amber-300"
      : "text-white";
    let rightLabel = "";
    if (isCurrent) rightLabel = '<span class="material-icons-round text-sm text-neutral-900">check</span>';
    else if (isCurrentQueue) rightLabel = `<span class="text-[9px] text-amber-400 truncate max-w-[100px]">⏳ Queued · tap to cancel</span>`;
    else if (isPendingOut) rightLabel = `<span class="text-[9px] text-amber-400 truncate max-w-[100px]">Timing out · auto-assign</span>`;
    else if (isReservable) rightLabel = `<span class="text-[9px] text-amber-600 truncate max-w-[100px]">In use · queue</span>`;

    btn.innerHTML = `
      <span class="font-mono font-black text-sm w-8 flex-shrink-0 ${codeColor}">${label}</span>
      <span class="flex-1">${sublabel}</span>
      ${rightLabel}`;

    btn.addEventListener("click", () => applyCommsChange(logKey, code, currentCommsId, volunteerId, currentPendingCommsId));
    return btn;
  }

  // No Comms option
  list.appendChild(makeCommsBtn("—", "No Comms", "", !currentCommsId || currentCommsId === "NONE", false));

  allComms.forEach(c => {
    const isCurrent = c.code === currentCommsId;
    const isTaken = !isCurrent && !!takenMap[c.code];
    list.appendChild(makeCommsBtn(c.code, c.assignment, c.code, isCurrent, isTaken));
  });

  if (isPending || currentPendingCommsId) {
    const hint = document.createElement("p");
    hint.className = "text-[10px] text-neutral-600 text-center mt-2 pt-2 border-t border-neutral-800";
    hint.textContent = "Occupied comms will auto-assign to this volunteer when the current holder times out.";
    list.appendChild(hint);
  }
}

async function applyCommsChange(logKey, newCommsId, oldCommsId, volunteerId, oldPendingCommsId = null) {
  changeCommsModal.classList.add("hidden");
  try {
    const volLog = allLogs[logKey] || {};
    const volName = volLog.name || volunteerId || "Unknown";
    const now = new Date().toISOString();

    // Check if the selected comms is currently occupied by someone else
    const newCommsOccupied = newCommsId && newCommsId !== "NONE" && !!activeCommsMap[newCommsId];
    // Check if the volunteer is cancelling their existing queue by clicking the same comms again
    const cancellingQueue = !!(oldPendingCommsId && newCommsId === oldPendingCommsId);

    if (newCommsOccupied || cancellingQueue) {
      // Queue / cancel-queue mode — don't release current comms, just set pendingCommsId
      if (cancellingQueue) {
        await db.ref(`logs/${todayDate}/${logKey}`).update({ pendingCommsId: null });
        showToast(`Queue for ${oldPendingCommsId} cancelled`, "cancel", "text-neutral-400");
      } else {
        await db.ref(`logs/${todayDate}/${logKey}`).update({ pendingCommsId: newCommsId });
        showToast(`Queued for ${newCommsId} — auto-assigns when freed`, "hourglass_top", "text-amber-400");
      }
      return;
    }

    // Normal assignment — update commsId and clear any pending queue
    await db.ref(`logs/${todayDate}/${logKey}`).update({ commsId: newCommsId || "NONE", pendingCommsId: null });

    if (oldCommsId && oldCommsId !== "NONE") {
      await db.ref("commsEvents").push({
        commsId: oldCommsId,
        eventType: "released",
        volunteerName: volName,
        volunteerId: volunteerId || null,
        logKey,
        date: todayDate,
        timestamp: now,
      });
      await releaseCommsOrAutoAssign(oldCommsId);
    }
    if (newCommsId && newCommsId !== "NONE") {
      await db.ref(`comms/${newCommsId}`).update({ status: "assigned", assignedTo: volunteerId, assignedTime: now });
      await db.ref("commsEvents").push({
        commsId: newCommsId,
        eventType: "transferred_to",
        volunteerName: volName,
        volunteerId: volunteerId || null,
        previousCommsId: (oldCommsId && oldCommsId !== "NONE") ? oldCommsId : null,
        logKey,
        date: todayDate,
        timestamp: now,
      });
      if (oldCommsId && oldCommsId !== "NONE") {
        await db.ref("commsEvents").push({
          commsId: oldCommsId,
          eventType: "transferred_from",
          volunteerName: volName,
          volunteerId: volunteerId || null,
          nextCommsId: newCommsId,
          logKey,
          date: todayDate,
          timestamp: now,
        });
      }
    }

    showToast(newCommsId ? `Comms changed to ${newCommsId}` : "Comms cleared", "headset_mic", "text-teal-400");
  } catch (e) {
    console.error("Comms change error:", e);
    showToast("Failed to update comms", "error", "text-red-400");
  }
}

// =============================
// Firebase Real-time Listener
// =============================
const logsPath = `logs/${todayDate}`;

db.ref(logsPath).on(
  "value",
  (snapshot) => {
    allLogs = snapshot.val() || {};
    renderTable();
  },
  (error) => {
    console.error("Firebase Read Error:", error);
  }
);

// =============================
// Volunteers View
// =============================
const monitorView = document.querySelector(".max-w-5xl");
const volunteersView = document.getElementById("volunteers-view");
const volTableBody = document.getElementById("vol-table-body");
const volSearchInput = document.getElementById("vol-search-input");
const volCountEl = document.getElementById("vol-count");
const noVolMsg = document.getElementById("no-vol-message");
const registeredCountEl = document.getElementById("registered-count");
const qrModal = document.getElementById("qr-modal");
const qrModalOutput = document.getElementById("qr-modal-output");
let allVolunteers = [];
let currentQrTeam = "";
let volSortKey = "name";
let volSortDir = "asc";

// Toggle views
document.getElementById("toggle-volunteers-btn").addEventListener("click", () => {
  monitorView.classList.add("hidden");
  volunteersView.classList.remove("hidden");
});
document.getElementById("back-to-monitor-btn").addEventListener("click", () => {
  volunteersView.classList.add("hidden");
  monitorView.classList.remove("hidden");
});

function vtd(content) {
  const el = document.createElement("td");
  el.className = "px-4 py-3 text-sm";
  el.innerHTML = content;
  return el;
}

function renderVolunteers() {
  const query = (volSearchInput.value || "").toLowerCase().trim();
  let filtered = allVolunteers;

  // Text search (include nickname)
  if (query) {
    filtered = filtered.filter((v) =>
      `${v.name} ${v.nickname} ${v.team} ${v.contact} ${v.type} ${v.id}`.toLowerCase().includes(query)
    );
  }

  // Apply pill filters
  if (activeVolFilters.size > 0) {
    const typeFilters = [...activeVolFilters].filter(f => f.startsWith("type:")).map(f => f.slice(5));
    const segFilters = [...activeVolFilters].filter(f => f.startsWith("seg:")).map(f => f.slice(4));

    filtered = filtered.filter((v) => {
      const typeMatch = typeFilters.length === 0 || typeFilters.includes(v.type);
      const volSegs = v.team ? v.team.split(",").map(s => s.trim()) : [];
      const segMatch = segFilters.length === 0 || segFilters.some(sf => volSegs.includes(sf));
      return typeMatch && segMatch;
    });
  }

  // Sort
  filtered = filtered.slice().sort((a, b) => {
    const dir = volSortDir === "asc" ? 1 : -1;
    if (volSortKey === "nickname") return dir * (a.nickname || "").localeCompare(b.nickname || "");
    if (volSortKey === "type") return dir * (a.type || "").localeCompare(b.type || "");
    return dir * (a.name || "").localeCompare(b.name || "");
  });

  // Update sort arrows
  ["name", "nickname", "type"].forEach((k) => {
    const el = document.getElementById(`vol-arrow-${k}`);
    if (!el) return;
    if (volSortKey === k) {
      el.textContent = volSortDir === "asc" ? "↑" : "↓";
      el.className = "font-mono text-white text-[10px]";
    } else {
      el.textContent = "";
    }
  });

  volTableBody.innerHTML = "";
  const showingFiltered = activeVolFilters.size > 0 || query;
  volCountEl.textContent = showingFiltered
    ? `${filtered.length} of ${allVolunteers.length} shown`
    : `${allVolunteers.length} total`;
  registeredCountEl.textContent = allVolunteers.length;
  noVolMsg.classList.toggle("hidden", filtered.length > 0);

  // Build set of volunteer IDs with active duty (no timeOut, not pending)
  const activeVolIds = new Set();
  Object.values(allLogs).forEach((log) => {
    if (!log.timeOut && log.volunteerId) activeVolIds.add(log.volunteerId);
  });

  filtered.forEach((v) => {
    const row = document.createElement("tr");
    row.className = "hover:bg-neutral-800 transition duration-150";

    row.appendChild(vtd(`<span class="font-semibold text-white">${v.name}</span>`));

    row.appendChild(vtd(v.nickname ? `<span class="text-neutral-300 text-xs font-medium">${v.nickname}</span>` : '<span class="text-neutral-700">—</span>'));

    const typeBadge = v.type === "guest"
      ? '<span class="text-xs bg-neutral-700 text-neutral-300 px-2 py-0.5 rounded-full">Guest</span>'
      : '<span class="text-xs bg-neutral-800 text-white px-2 py-0.5 rounded-full">Volunteer</span>';
    row.appendChild(vtd(typeBadge));

    const segments = v.team
      ? v.team.split(",").map((s) => `<span class="inline-block text-xs bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded-full mr-1 mb-1">${s.trim()}</span>`).join("")
      : '<span class="text-neutral-600">—</span>';
    row.appendChild(vtd(segments));

    row.appendChild(vtd(v.contact ? `<span class="text-neutral-400 font-mono text-xs">${v.contact}</span>` : '<span class="text-neutral-600">—</span>'));

    const qrTd = document.createElement("td");
    qrTd.className = "px-4 py-3 text-sm";
    qrTd.innerHTML = `<button class="qr-preview-btn text-neutral-500 hover:text-white transition" data-id="${v.id}" data-name="${v.name}" data-team="${v.team}"><span class="material-icons-round text-xl">qr_code</span></button>`;
    row.appendChild(qrTd);

    const dlTd = document.createElement("td");
    dlTd.className = "px-4 py-3 text-sm";
    dlTd.innerHTML = `<button class="qr-download-btn text-neutral-500 hover:text-white transition" data-id="${v.id}" data-name="${v.name}" data-team="${v.team}"><span class="material-icons-round text-base">download</span></button>`;
    row.appendChild(dlTd);

    // Edit button
    const editTd = document.createElement("td");
    editTd.className = "px-4 py-3 text-sm";
    editTd.innerHTML = `<button class="vol-edit-btn text-neutral-700 hover:text-white transition" data-id="${v.id}" title="Edit volunteer"><span class="material-icons-round text-base">edit</span></button>`;
    row.appendChild(editTd);

    // Delete button (disabled if on active duty)
    const delTd = document.createElement("td");
    delTd.className = "px-4 py-3 text-sm";
    const isOnDuty = activeVolIds.has(v.id);
    if (isOnDuty) {
      delTd.innerHTML = `<span class="text-neutral-800 cursor-not-allowed" title="Currently on active duty"><span class="material-icons-round text-base">lock</span></span>`;
    } else {
      delTd.innerHTML = `<button class="vol-delete-btn text-neutral-700 hover:text-red-400 transition" data-id="${v.id}" data-name="${v.name}" title="Delete volunteer"><span class="material-icons-round text-base">delete_outline</span></button>`;
    }
    row.appendChild(delTd);

    volTableBody.appendChild(row);
  });

  document.querySelectorAll(".qr-preview-btn").forEach((btn) => {
    btn.addEventListener("click", () => showQrModal(btn.dataset.id, btn.dataset.name, btn.dataset.team));
  });
  document.querySelectorAll(".qr-download-btn").forEach((btn) => {
    btn.addEventListener("click", () => downloadQr(btn.dataset.id, btn.dataset.name, btn.dataset.team));
  });
  document.querySelectorAll(".vol-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { id, name } = btn.dataset;
      const confirmed = await showConfirm(`Delete volunteer "${name}"? This cannot be undone.`);
      if (!confirmed) return;
      await db.ref(`volunteers/${id}`).remove();
      showToast(`"${name}" deleted`, "delete", "text-red-400");
    });
  });
  document.querySelectorAll(".vol-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const vol = allVolunteers.find((v) => v.id === btn.dataset.id);
      if (vol) openEditModal(vol);
    });
  });
}

volSearchInput.addEventListener("input", renderVolunteers);

// Volunteer table sort headers
["name", "nickname", "type"].forEach((key) => {
  document.getElementById(`vol-th-${key}`)?.addEventListener("click", () => {
    if (volSortKey === key) {
      volSortDir = volSortDir === "asc" ? "desc" : "asc";
    } else {
      volSortKey = key;
      volSortDir = "asc";
    }
    renderVolunteers();
  });
});

// =============================
// Volunteer Filter Pills
// =============================
const volFilterSegments = ["Audio", "Lights", "Camera", "Stage", "Graphics", "Volunteer Management", "Guest", "Live Prod Crew", "Comms"];
const volFilterTypes = ["Volunteer", "Guest"];
let activeVolFilters = new Set();

function renderVolFilterPills() {
  const container = document.getElementById("vol-filter-pills");
  container.innerHTML = "";

  // "All" pill
  const allPill = document.createElement("button");
  allPill.textContent = "All";
  allPill.className = activeVolFilters.size === 0
    ? "px-3 py-1 rounded-full text-xs font-semibold bg-white text-neutral-900 transition"
    : "px-3 py-1 rounded-full text-xs font-semibold bg-neutral-800 text-neutral-500 hover:text-white border border-neutral-700 transition";
  allPill.addEventListener("click", () => {
    activeVolFilters.clear();
    renderVolFilterPills();
    renderVolunteers();
  });
  container.appendChild(allPill);

  // Type pills
  volFilterTypes.forEach((type) => {
    const pill = document.createElement("button");
    pill.textContent = type;
    const isActive = activeVolFilters.has("type:" + type.toLowerCase());
    pill.className = isActive
      ? "px-3 py-1 rounded-full text-xs font-semibold bg-white text-neutral-900 transition"
      : "px-3 py-1 rounded-full text-xs font-semibold bg-neutral-800 text-neutral-400 border border-neutral-700 hover:border-neutral-500 transition";
    pill.addEventListener("click", () => {
      const key = "type:" + type.toLowerCase();
      if (activeVolFilters.has(key)) activeVolFilters.delete(key);
      else activeVolFilters.add(key);
      renderVolFilterPills();
      renderVolunteers();
    });
    container.appendChild(pill);
  });

  // Separator
  const sep = document.createElement("span");
  sep.className = "w-px h-5 bg-neutral-700 self-center mx-1";
  container.appendChild(sep);

  // Segment pills
  volFilterSegments.forEach((seg) => {
    const pill = document.createElement("button");
    pill.textContent = seg;
    const isActive = activeVolFilters.has("seg:" + seg);
    pill.className = isActive
      ? "px-3 py-1 rounded-full text-xs font-semibold bg-white text-neutral-900 transition"
      : "px-3 py-1 rounded-full text-xs font-semibold bg-neutral-800 text-neutral-400 border border-neutral-700 hover:border-neutral-500 transition";
    pill.addEventListener("click", () => {
      const key = "seg:" + seg;
      if (activeVolFilters.has(key)) activeVolFilters.delete(key);
      else activeVolFilters.add(key);
      renderVolFilterPills();
      renderVolunteers();
    });
    container.appendChild(pill);
  });
}

renderVolFilterPills();

// =============================
// Edit Volunteer Modal
// =============================
const editSegmentsList = ["Audio", "Lights", "Camera", "Stage", "Graphics", "Volunteer Management", "Guest", "Live Prod Crew", "Comms"];
const editModal = document.getElementById("edit-vol-modal");
let editSelectedType = "volunteer";
let editSelectedSegments = new Set();

function openEditModal(vol) {
  document.getElementById("edit-vol-id").value = vol.id;
  document.getElementById("edit-vol-name").value = vol.name;
  document.getElementById("edit-vol-nickname").value = vol.nickname || "";
  document.getElementById("edit-vol-contact").value = vol.contact || "";

  // Type toggle
  editSelectedType = vol.type || "volunteer";
  updateTypeButtons();

  // Segments
  editSelectedSegments = new Set(
    vol.team ? vol.team.split(",").map((s) => s.trim()).filter(Boolean) : []
  );
  renderEditSegments();

  editModal.classList.remove("hidden");
}

function updateTypeButtons() {
  document.querySelectorAll(".edit-type-btn").forEach((btn) => {
    if (btn.dataset.type === editSelectedType) {
      btn.className = "edit-type-btn flex-1 py-2 text-sm font-semibold rounded-lg border border-white bg-white text-neutral-900 transition";
    } else {
      btn.className = "edit-type-btn flex-1 py-2 text-sm font-semibold rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-500 transition";
    }
  });
}

function renderEditSegments() {
  const container = document.getElementById("edit-vol-segments");
  container.innerHTML = "";
  editSegmentsList.forEach((seg) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.textContent = seg;
    const isSelected = editSelectedSegments.has(seg);
    pill.className = isSelected
      ? "px-3 py-1 rounded-full text-xs font-medium bg-white text-neutral-900 border border-white transition"
      : "px-3 py-1 rounded-full text-xs font-medium bg-neutral-800 text-neutral-400 border border-neutral-700 hover:border-neutral-500 transition";
    pill.addEventListener("click", () => {
      if (editSelectedSegments.has(seg)) {
        editSelectedSegments.delete(seg);
      } else {
        editSelectedSegments.add(seg);
      }
      renderEditSegments();
    });
    container.appendChild(pill);
  });
}

// Type toggle clicks
document.querySelectorAll(".edit-type-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    editSelectedType = btn.dataset.type;
    updateTypeButtons();
  });
});

// Close
document.getElementById("edit-vol-close").addEventListener("click", () => editModal.classList.add("hidden"));
editModal.addEventListener("click", (e) => { if (e.target === editModal) editModal.classList.add("hidden"); });

// Save
document.getElementById("edit-vol-save").addEventListener("click", async () => {
  const id = document.getElementById("edit-vol-id").value;
  const name = document.getElementById("edit-vol-name").value.trim();
  const nickname = document.getElementById("edit-vol-nickname").value.trim();
  const contact = document.getElementById("edit-vol-contact").value.trim();
  if (!name) return;

  const team = [...editSelectedSegments].join(", ");
  await db.ref(`volunteers/${id}`).update({
    name,
    nickname: nickname || null,
    type: editSelectedType,
    team: team || null,
    contact: contact || null,
  });

  editModal.classList.add("hidden");
  showToast(`"${name}" updated`, "check_circle", "text-green-400");
});

// QR Modal
function showQrModal(id, name, team) {
  document.getElementById("qr-modal-name").textContent = name;
  document.getElementById("qr-modal-id").textContent = id;
  currentQrTeam = team || "";
  qrModalOutput.innerHTML = "";
  new QRCode(qrModalOutput, { text: id, width: 200, height: 200, colorDark: "#000000", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H });
  qrModal.classList.remove("hidden");
}

document.getElementById("qr-modal-close").addEventListener("click", () => qrModal.classList.add("hidden"));
qrModal.addEventListener("click", (e) => { if (e.target === qrModal) qrModal.classList.add("hidden"); });

// Branded QR builder
function buildBrandedQr(qrCanvas, name, team) {
  const qrSize = 400;
  const padding = 40;
  const headerH = 70;  // CCF branding top
  const nameH = 50;    // volunteer name
  const segmentH = team ? 35 : 0;
  const bottomPad = 30;
  const totalW = qrSize + padding * 2;
  const totalH = headerH + nameH + segmentH + qrSize + padding + bottomPad;

  const canvas = document.createElement("canvas");
  canvas.width = totalW;
  canvas.height = totalH;
  const ctx = canvas.getContext("2d");

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, totalW, totalH);

  // Top bar — dark background with CCF branding
  ctx.fillStyle = "#171717";
  ctx.fillRect(0, 0, totalW, headerH);

  // CCF logo circle
  const logoX = totalW / 2 - 70;
  const logoY = headerH / 2;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(logoX, logoY, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#171717";
  ctx.font = "bold 11px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("ccf", logoX, logoY + 4);

  // "Live Production" text
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 18px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Live Production", logoX + 22, logoY + 6);

  // Volunteer name (big, centered)
  let yPos = headerH + 38;
  ctx.fillStyle = "#171717";
  ctx.font = "bold 28px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(name, totalW / 2, yPos);
  yPos += 8;

  // Segment
  if (team) {
    yPos += 24;
    ctx.fillStyle = "#737373";
    ctx.font = "15px Inter, sans-serif";
    ctx.fillText(team, totalW / 2, yPos);
    yPos += 12;
  }

  // QR code
  const qrY = headerH + nameH + segmentH;
  ctx.drawImage(qrCanvas, padding, qrY, qrSize, qrSize);

  return canvas;
}

document.getElementById("qr-modal-download").addEventListener("click", () => {
  const name = document.getElementById("qr-modal-name").textContent;
  const id = document.getElementById("qr-modal-id").textContent;
  const tempDiv = document.createElement("div");
  tempDiv.style.cssText = "position:absolute;left:-9999px";
  document.body.appendChild(tempDiv);
  new QRCode(tempDiv, { text: id, width: 400, height: 400, correctLevel: QRCode.CorrectLevel.H });
  setTimeout(() => {
    const c = tempDiv.querySelector("canvas");
    if (c) {
      const branded = buildBrandedQr(c, name, currentQrTeam);
      const link = document.createElement("a");
      link.download = `QR-${name.replace(/\s+/g, "_")}.png`;
      link.href = branded.toDataURL("image/png");
      link.click();
    }
    document.body.removeChild(tempDiv);
  }, 300);
});

function downloadQr(id, name, team) {
  const tempDiv = document.createElement("div");
  tempDiv.style.cssText = "position:absolute;left:-9999px";
  document.body.appendChild(tempDiv);
  new QRCode(tempDiv, { text: id, width: 400, height: 400, correctLevel: QRCode.CorrectLevel.H });
  setTimeout(() => {
    const c = tempDiv.querySelector("canvas");
    if (c) {
      const branded = buildBrandedQr(c, name, team || "");
      const link = document.createElement("a");
      link.download = `QR-${name.replace(/\s+/g, "_")}.png`;
      link.href = branded.toDataURL("image/png");
      link.click();
    }
    document.body.removeChild(tempDiv);
  }, 300);
}

// =============================
// Manual Sync to Google Sheets
// =============================
document.getElementById("sync-sheets-btn").addEventListener("click", async () => {
  const btn = document.getElementById("sync-sheets-btn");
  const label = document.getElementById("sync-sheets-label");
  const icon = btn.querySelector(".material-icons-round");

  // Disable button and show syncing state
  btn.disabled = true;
  btn.classList.add("opacity-50", "pointer-events-none");
  label.textContent = "Syncing...";
  icon.textContent = "hourglass_top";
  icon.classList.add("animate-spin");

  try {
    // Read ALL logs from Firebase (all dates)
    const logsSnap = await db.ref("logs").once("value");
    const allDates = logsSnap.val() || {};
    const allLogEntries = [];

    Object.entries(allDates).forEach(([date, dateLogs]) => {
      Object.entries(dateLogs).forEach(([key, log]) => {
        // Skip pending entries that haven't been confirmed
        if (log.status === "pending") return;
        allLogEntries.push({
          key,
          date,
          volunteerId: log.volunteerId || "",
          name: log.name || "",
          segment: log.segment || "",
          role: log.role || "",
          commsId: log.commsId || "",
          numberedId: log.numberedId || "",
          timeIn: log.timeIn || "",
          timeOut: log.timeOut || "",
        });
      });
    });

    // Sort by date desc, then timeIn desc
    allLogEntries.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.timeIn || "").localeCompare(b.timeIn || "");
    });

    // Send to Sheets
    const res = await fetch(SHEETS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'bulkSync', logs: allLogEntries }),
    });
    const result = await res.json();
    console.log('Bulk sync result:', result);

    // Show success
    label.textContent = "Synced!";
    icon.textContent = "check_circle";
    icon.classList.remove("animate-spin");
    btn.classList.remove("opacity-50");
    btn.classList.add("text-green-400", "border-green-900");
    showToast(`Synced ${result.added || 0} added, ${result.updated || 0} updated`, "sync", "text-green-400");

    setTimeout(() => {
      label.textContent = "Sync Sheets";
      icon.textContent = "sync";
      btn.disabled = false;
      btn.classList.remove("pointer-events-none", "text-green-400", "border-green-900");
    }, 3000);
  } catch (err) {
    console.error("Sheets sync error:", err);
    label.textContent = "Sync Failed";
    icon.textContent = "error";
    icon.classList.remove("animate-spin");
    showToast("Failed to sync to Sheets", "error", "text-red-400");

    setTimeout(() => {
      label.textContent = "Sync Sheets";
      icon.textContent = "sync";
      btn.disabled = false;
      btn.classList.remove("opacity-50", "pointer-events-none");
    }, 3000);
  }
});

// Load volunteers
db.ref("volunteers").on("value", (snapshot) => {
  const data = snapshot.val() || {};
  allVolunteers = Object.entries(data).map(([id, v]) => ({
    id, name: v.name || "—", nickname: v.nickname || "", type: v.type || "volunteer", team: v.team || "", contact: v.contact || "", registeredAt: v.registeredAt || "",
  }));
  allVolunteers.sort((a, b) => a.name.localeCompare(b.name));
  // Rebuild nickname map: volunteerId -> nickname if set, else first name
  volunteerNicknameMap = {};
  allVolunteers.forEach((v) => {
    volunteerNicknameMap[v.id] = v.nickname || (v.name || "").split(" ")[0];
  });
  registeredCountEl.textContent = allVolunteers.length;
  renderVolunteers();
});
