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

const todayDate = new Date().toISOString().slice(0, 10);
currentDateEl.textContent = new Date().toLocaleDateString([], {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

// =============================
// State
// =============================
let allLogs = {};

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
  const activeEntries = entries.filter((l) => !l.timeOut && l.status !== "pending");
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

  // Build a map: commsId -> active log
  const activeCommsMap = {};
  Object.values(allLogs).forEach((log) => {
    if (!log.timeOut && log.commsId && log.commsId !== "NONE") {
      activeCommsMap[log.commsId] = log;
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
        td(`<span class="text-neutral-400">${log.segment || "—"}</span><span class="text-neutral-600 mx-1">/</span><span class="text-white font-medium">${log.role || "—"}</span>`)
      );
      row.appendChild(commsButton(log.commsId));

      // Seg ID input
      const segIdTd = document.createElement("td");
      segIdTd.className = "px-4 py-2 text-sm";
      segIdTd.innerHTML = `
        <input type="text" placeholder="#" data-key="${log.key}" class="pending-segid-input w-16 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-center text-white text-xs font-mono focus:outline-none focus:border-amber-400" />
      `;
      row.appendChild(segIdTd);

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
        if (confirm("Cancel this volunteer's time-in?")) {
          await db.ref(`logs/${todayDate}/${key}`).remove();
        }
      });
    });

    // Attach seg ID save on blur/enter
    document.querySelectorAll(".pending-segid-input").forEach((input) => {
      const saveSegId = async () => {
        const key = input.dataset.key;
        const val = input.value.trim();
        if (val) {
          await db.ref(`logs/${todayDate}/${key}`).update({ numberedId: val });
        }
      };
      input.addEventListener("blur", saveSegId);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); saveSegId(); input.blur(); } });
    });
  } else {
    pendingSection.classList.add("hidden");
  }

  // Active table
  const activeBody = document.getElementById("active-table-body");
  activeBody.innerHTML = "";
  document.getElementById("active-table-count").textContent = activeEntries.length ? `(${activeEntries.length})` : "";
  document.getElementById("no-active-message").classList.toggle("hidden", activeEntries.length > 0);

  activeEntries.forEach((log) => {
    const row = document.createElement("tr");
    row.className = "hover:bg-neutral-800 transition duration-150";

    row.appendChild(
      td(`<div class="flex items-center"><span class="inline-block w-2 h-2 rounded-full bg-green-400 mr-2 animate-pulse"></span><span class="font-semibold text-white">${log.name || "—"}</span></div>`)
    );
    row.appendChild(
      td(`<span class="text-neutral-400">${log.segment || "—"}</span><span class="text-neutral-600 mx-1">/</span><span class="text-white font-medium">${log.role || "—"}</span>`)
    );
    row.appendChild(commsButton(log.commsId));
    row.appendChild(
      td(log.numberedId ? `<span class="font-mono font-bold text-white">#${log.numberedId}</span>` : '<span class="text-neutral-600">—</span>')
    );
    row.appendChild(
      td(`<span class="font-mono text-green-400">${formatTime(log.timeIn)}</span>`)
    );
    row.appendChild(
      td(`<span class="font-mono text-neutral-400">${calcDuration(log)}</span>`)
    );

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
      td(`<span class="text-neutral-500">${log.segment || "—"}</span><span class="text-neutral-700 mx-1">/</span><span class="text-neutral-400">${log.role || "—"}</span>`)
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

    completedBody.appendChild(row);
  });

  // Attach comms history click handlers
  document.querySelectorAll(".comms-history-btn").forEach((btn) => {
    btn.addEventListener("click", () => showCommsHistory(btn.dataset.comms));
  });
}

// =============================
// Search
// =============================
searchInput.addEventListener("input", () => renderTable());

// Reset sort button (just re-renders)
document.getElementById("sort-reset")?.addEventListener("click", () => renderTable());

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
  if (query) {
    filtered = allVolunteers.filter((v) =>
      `${v.name} ${v.team} ${v.contact} ${v.type} ${v.id}`.toLowerCase().includes(query)
    );
  }

  volTableBody.innerHTML = "";
  volCountEl.textContent = `${allVolunteers.length} total`;
  registeredCountEl.textContent = allVolunteers.length;
  noVolMsg.classList.toggle("hidden", filtered.length > 0);

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

    volTableBody.appendChild(row);
  });

  document.querySelectorAll(".qr-preview-btn").forEach((btn) => {
    btn.addEventListener("click", () => showQrModal(btn.dataset.id, btn.dataset.name, btn.dataset.team));
  });
  document.querySelectorAll(".qr-download-btn").forEach((btn) => {
    btn.addEventListener("click", () => downloadQr(btn.dataset.id, btn.dataset.name, btn.dataset.team));
  });
}

volSearchInput.addEventListener("input", renderVolunteers);

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
