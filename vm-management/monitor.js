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
let activeSegFilter = "all";
let activeNameSort = "none"; // "none" | "asc" | "desc"

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

  // No logs at all
  noLogsMessage.classList.toggle("hidden", entries.length > 0 || true); // always hide, we have comms table

  // ---- Comms Overview Table ----
  const commsBody = document.getElementById("comms-table-body");
  commsBody.innerHTML = "";

  // Build a map: commsId -> active log (with key)
  const activeCommsMap = {};
  Object.entries(allLogs).forEach(([key, log]) => {
    if (!log.timeOut && log.commsId && log.commsId !== "NONE") {
      activeCommsMap[log.commsId] = { ...log, key };
    }
  });

  const activeCommsCount = Object.keys(activeCommsMap).length;
  document.getElementById("comms-toggle-count").textContent = `(${activeCommsCount}/${allComms.length} in use)`;

  allComms.forEach((comms) => {
    const activeLo = activeCommsMap[comms.code];
    const isActive = !!activeLo;
    const row = document.createElement("tr");
    row.className = isActive
      ? "hover:bg-neutral-800 transition duration-150"
      : "hover:bg-neutral-800 transition duration-150 opacity-40";

    // Status dot
    const dotTd = document.createElement("td");
    dotTd.className = "px-4 py-2.5 text-center";
    dotTd.innerHTML = isActive
      ? '<span class="inline-block w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse"></span>'
      : '<span class="inline-block w-2.5 h-2.5 rounded-full bg-neutral-700"></span>';
    row.appendChild(dotTd);

    // Comms code (clickable for history)
    row.appendChild(td(`<button class="font-mono font-black text-white text-base hover:text-green-400 transition duration-150 cursor-pointer comms-history-btn" data-comms="${comms.code}">${comms.code}</button>`));

    // Assignment
    row.appendChild(td(`<span class="text-neutral-400 text-xs">${comms.assignment}</span>`));

    // Volunteer
    if (isActive) {
      row.appendChild(td(`<span class="font-semibold text-white">${activeLo.name || "—"}</span>`));
    } else {
      row.appendChild(td('<span class="text-neutral-600 text-xs">Available</span>'));
    }

    // Since
    if (isActive) {
      row.appendChild(td(`<span class="font-mono text-green-400 text-xs">${formatTime(activeLo.timeIn)}</span>`));
    } else {
      row.appendChild(td('<span class="text-neutral-700">—</span>'));
    }

    // Force time-out button
    if (isActive) {
      const actionTd = document.createElement("td");
      actionTd.className = "px-4 py-2.5 text-sm";
      actionTd.innerHTML = `<button class="force-timeout-btn text-neutral-600 hover:text-red-400 transition text-xs flex items-center gap-1" data-key="${activeLo.key}" data-comms="${comms.code}" data-name="${activeLo.name || ""}" data-time="${activeLo.timeIn || ""}"><span class="material-icons-round text-sm">logout</span></button>`;
      row.appendChild(actionTd);
    } else {
      row.appendChild(td(''));
    }

    commsBody.appendChild(row);
  });

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
        td(`<span class="text-neutral-500 text-xs">${log.segment || "—"}</span><br/><span class="text-white font-medium">${log.role || "—"}</span>`)
      );
      row.appendChild(commsButton(log.commsId));

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

          // 2. Release comms if applicable
          if (commsCode && commsCode !== "NONE" && commsCode !== "N/A") {
            await db.ref(`comms/${commsCode}`).update({
              assignedTo: null,
              assignedTime: null,
              status: "available",
            });
          }

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
  // Active segment filter pills
  const activeFilterContainer = document.getElementById("active-filter-pills");
  if (activeFilterContainer) {
    const allActiveSegs = [...new Set(
      Object.values(allLogs)
        .filter(l => !l.timeOut && l.status !== "pending" && l.status !== "pending-out")
        .map(l => l.segment)
        .filter(Boolean)
    )].sort();

    activeFilterContainer.innerHTML = "";

    const allPill = document.createElement("button");
    allPill.textContent = "All";
    allPill.className = activeSegFilter === "all"
      ? "px-3 py-1 rounded-full text-xs font-semibold bg-white text-neutral-900 transition"
      : "px-3 py-1 rounded-full text-xs font-semibold bg-neutral-800 text-neutral-500 hover:text-white border border-neutral-700 transition";
    allPill.addEventListener("click", () => { activeSegFilter = "all"; renderTable(); });
    activeFilterContainer.appendChild(allPill);

    allActiveSegs.forEach((seg) => {
      const pill = document.createElement("button");
      pill.textContent = seg;
      const isActive = activeSegFilter === seg;
      pill.className = isActive
        ? "px-3 py-1 rounded-full text-xs font-semibold bg-white text-neutral-900 transition"
        : "px-3 py-1 rounded-full text-xs font-semibold bg-neutral-800 text-neutral-400 border border-neutral-700 hover:border-neutral-500 transition";
      pill.addEventListener("click", () => { activeSegFilter = seg; renderTable(); });
      activeFilterContainer.appendChild(pill);
    });
  }

  // Apply active segment filter on top of search filter
  let displayedActiveEntries = activeSegFilter === "all"
    ? activeEntries
    : activeEntries.filter(l => l.segment === activeSegFilter);

  // Apply name sort
  if (activeNameSort === "asc") {
    displayedActiveEntries = displayedActiveEntries.slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } else if (activeNameSort === "desc") {
    displayedActiveEntries = displayedActiveEntries.slice().sort((a, b) => (b.name || "").localeCompare(a.name || ""));
  }

  // Update sort arrow indicator
  const arrowEl = document.getElementById("active-sort-arrow");
  if (arrowEl) arrowEl.textContent = activeNameSort === "asc" ? "↑" : activeNameSort === "desc" ? "↓" : "";

  activeBody.innerHTML = "";
  document.getElementById("active-table-count").textContent = activeEntries.length ? `(${activeEntries.length})` : "";
  document.getElementById("no-active-message").classList.toggle("hidden", displayedActiveEntries.length > 0);

  displayedActiveEntries.forEach((log) => {
    const row = document.createElement("tr");
    row.className = "hover:bg-neutral-800 transition duration-150";

    row.appendChild(
      td(`<div class="flex items-center"><span class="inline-block w-2 h-2 rounded-full bg-green-400 mr-2 animate-pulse"></span><span class="font-semibold text-white">${log.name || "—"}</span></div>`)
    );
    row.appendChild(
      td(`<span class="text-neutral-500 text-xs">${log.segment || "—"}</span><br/><span class="text-white font-medium">${log.role || "—"}</span>`)
    );
    row.appendChild(commsButton(log.commsId));
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

  completedEntries.forEach((log) => {
    const row = document.createElement("tr");
    row.className = "hover:bg-neutral-800 transition duration-150 opacity-60";

    row.appendChild(
      td(`<div class="flex items-center"><span class="inline-block w-2 h-2 rounded-full bg-neutral-600 mr-2"></span><span class="font-medium text-neutral-400">${log.name || "—"}</span></div>`)
    );
    row.appendChild(
      td(`<span class="text-neutral-600 text-xs">${log.segment || "—"}</span><br/><span class="text-neutral-400">${log.role || "—"}</span>`)
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

      if (comms && comms !== "NONE" && comms !== "N/A") {
        await db.ref(`comms/${comms}`).update({
          assignedTo: null,
          assignedTime: null,
          status: "available",
        });
      }

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
// Previous Logs (all dates)
// =============================
let previousLogsLoaded = false;
let allPreviousEntries = [];
let filteredPreviousEntries = [];
let prevLogsPage = 1;
const PREV_LOGS_PER_PAGE = 25;
let prevLogsSortKey = "date-desc";

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
      case "name-asc":
        return (a.name || "").localeCompare(b.name || "");
      case "name-desc":
        return (b.name || "").localeCompare(a.name || "");
      case "duration-desc":
        return calcDurationMs(b) - calcDurationMs(a);
      case "duration-asc":
        return calcDurationMs(a) - calcDurationMs(b);
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

  filteredPreviousEntries = sortPreviousEntries(entries);
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
      td(`<span class="text-neutral-600 text-xs">${log.segment || "—"}</span><br/><span class="text-neutral-400">${log.role || "—"}</span>`)
    );
    row.appendChild(commsButton(log.commsId));
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

// Sort dropdown handler
document.getElementById("prev-logs-sort").addEventListener("change", (e) => {
  prevLogsSortKey = e.target.value;
  prevLogsPage = 1;
  filterAndRenderPreviousLogs();
});

// Clickable sort headers
document.querySelectorAll(".prev-sort-header").forEach((th) => {
  th.addEventListener("click", () => {
    const col = th.dataset.sort;
    const sortMap = { date: "date", name: "name", timein: "date", timeout: "date", duration: "duration" };
    const base = sortMap[col] || "date";
    const currentBase = prevLogsSortKey.replace(/-asc$|-desc$/, "");
    const currentDir = prevLogsSortKey.endsWith("-asc") ? "asc" : "desc";
    const newDir = (currentBase === base && currentDir === "desc") ? "asc" : "desc";
    prevLogsSortKey = `${base}-${newDir}`;
    document.getElementById("prev-logs-sort").value = prevLogsSortKey;
    prevLogsPage = 1;
    filterAndRenderPreviousLogs();
  });
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

// Reset sort button
document.getElementById("sort-reset")?.addEventListener("click", () => {
  activeNameSort = "none";
  renderTable();
});

// Active table: click Volunteer header to toggle alphabetical sort
document.getElementById("active-sort-name-th")?.addEventListener("click", () => {
  activeNameSort = activeNameSort === "asc" ? "desc" : "asc";
  renderTable();
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
    const logsSnap = await db.ref(`logs/${todayDate}`).once("value");
    const todayLogs = logsSnap.val() || {};
    const history = [];

    Object.entries(todayLogs).forEach(([key, log]) => {
      if (log.commsId === commsId) {
        history.push({ ...log });
      }
    });

    history.sort((a, b) => (b.timeIn || "").localeCompare(a.timeIn || ""));

    if (history.length === 0) {
      modalContent.innerHTML = `
        <p class="text-center text-neutral-500 py-8">No history found for <span class="font-mono font-bold text-white">${commsId}</span></p>`;
      return;
    }

    let html = `
      <div class="mb-4 text-center">
        <span class="font-mono font-black text-2xl text-white">${commsId}</span>
        <p class="text-xs text-neutral-500 mt-1">${history.length} record${history.length > 1 ? "s" : ""} today</p>
      </div>
      <div class="space-y-2 max-h-80 overflow-y-auto pr-1">`;

    history.forEach((h) => {
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

  // Text search
  if (query) {
    filtered = filtered.filter((v) =>
      `${v.name} ${v.team} ${v.contact} ${v.type} ${v.id}`.toLowerCase().includes(query)
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
  const contact = document.getElementById("edit-vol-contact").value.trim();
  if (!name) return;

  const team = [...editSelectedSegments].join(", ");
  await db.ref(`volunteers/${id}`).update({
    name,
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
    id, name: v.name || "—", type: v.type || "volunteer", team: v.team || "", contact: v.contact || "", registeredAt: v.registeredAt || "",
  }));
  allVolunteers.sort((a, b) => a.name.localeCompare(b.name));
  registeredCountEl.textContent = allVolunteers.length;
  renderVolunteers();
});
