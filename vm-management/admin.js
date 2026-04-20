/*
 * STRICT PROTOCOL: Selective Delta Updates Only. Treat my provided code as a "Locked Source" with 100% continuity; you must not omit, summarize, or clean up any meta tags, scripts, comments, or existing logic. If a file requires no modifications based on the requested changes, do not output it or provide any response for that file.
 */

// =============================
// Firebase config (Same as script.js)
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

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

let vmHtml5QrcodeScanner = null;
let currentScannedCommsId = null;

// =============================
// 1. Volunteer Account & QR Creation
// =============================

/**
 * Generates the next sequential V-XXXX ID using a Firebase transaction.
 * @returns {Promise<string>} The new V-XXXX ID.
 */
async function getNextVolunteerId() {
  const metaRef = db.ref("meta/lastVolunteerId");

  return new Promise((resolve, reject) => {
    metaRef.transaction(
      (currentValue) => {
        // Initialize if it doesn't exist, start from 1000 to get V-1001 first.
        if (
          currentValue === null ||
          typeof currentValue !== "number" ||
          currentValue < 1000
        ) {
          return 1000;
        }
        return currentValue + 1;
      },
      (error, committed, snapshot) => {
        if (error) {
          reject(new Error("Transaction failed to increment volunteer ID."));
        } else if (committed) {
          const nextIdNumber = snapshot.val();
          // Format as V-XXXX
          const vId = `V-${String(nextIdNumber).padStart(4, "0")}`;
          resolve(vId);
        } else {
          // Should not happen if Firebase transaction works correctly (it retries automatically)
          reject(
            new Error("Failed to commit volunteer ID increment. Try again.")
          );
        }
      }
    );
  });
}

document
  .getElementById("volunteer-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    const vName = document.getElementById("v-name").value.trim();
    const messageEl = document.getElementById("volunteer-message");
    const qrOutputEl = document.getElementById("qrcode-output");
    const qrIdDisplayEl = document.getElementById("qr-id-display");

    messageEl.classList.add("hidden");

    try {
      // 1. Auto-generate the unique ID (V-XXXX)
      const vId = await getNextVolunteerId();

      const volunteerRef = db.ref(`volunteers/${vId}`);

      // 2. Save new volunteer data
      await volunteerRef.set({
        name: vName,
        createdAt: new Date().toISOString(),
      });

      // 3. Generate QR Code
      qrOutputEl.innerHTML = "";
      new QRCode(qrOutputEl, {
        text: vId,
        width: 150,
        height: 150,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H,
      });

      qrIdDisplayEl.textContent = vId;

      messageEl.textContent = `Volunteer ${vName} (${vId}) created successfully! QR Code generated.`;
      messageEl.classList.remove("hidden");
      messageEl.classList.remove("text-red-600");
      messageEl.classList.add("text-green-600");

      document.getElementById("v-name").value = "";
    } catch (error) {
      console.error("Volunteer Creation Error:", error);
      messageEl.textContent = `An error occurred: ${error.message}`;
      messageEl.classList.remove("hidden");
      messageEl.classList.remove("text-green-600");
      messageEl.classList.add("text-red-600");
    }
  });

// =============================
// 2. VM Comms Status Check (Special QR)
// =============================

const onVmScanSuccess = (decodedText) => {
  // Stop the scanner and process the ID
  if (vmHtml5QrcodeScanner) {
    vmHtml5QrcodeScanner.pause();
  }
  handleCommsScan(decodedText);
};

const onVmScanError = (errorMessage) => {
  // console.log(`VM QR Error: ${errorMessage}`);
};

const startVmQrScanner = () => {
  vmHtml5QrcodeScanner = new Html5Qrcode("vm-qr-scanner-area");

  Html5Qrcode.getCameras()
    .then((devices) => {
      if (devices && devices.length) {
        const cameraId = devices.length > 1 ? devices[1].id : devices[0].id; // Prefer back camera
        vmHtml5QrcodeScanner
          .start(
            cameraId,
            { fps: 10, qrbox: { width: 250, height: 250 } },
            onVmScanSuccess,
            onVmScanError
          )
          .catch((err) => {
            document.getElementById(
              "vm-scan-message"
            ).textContent = `Camera start failed: ${err.message || err}`;
            document
              .getElementById("vm-scan-message")
              .classList.remove("hidden");
          });
      } else {
        document.getElementById("vm-scan-message").textContent =
          "No camera found for Comms Scan.";
        document.getElementById("vm-scan-message").classList.remove("hidden");
      }
    })
    .catch((err) => {
      document.getElementById(
        "vm-scan-message"
      ).textContent = `Error accessing camera: ${err.message || err}`;
      document.getElementById("vm-scan-message").classList.remove("hidden");
    });
};

/**
 * Handles the Comms QR scan. Checks comms existence and displays update form.
 * @param {string} commsId The Comms ID (decoded QR text).
 */
async function handleCommsScan(commsId) {
  currentScannedCommsId = commsId.toUpperCase().trim();
  const commsUpdateEl = document.getElementById("vm-status-update");
  const scannedCommsIdEl = document.getElementById("scanned-comms-id");
  const vmScanMessageEl = document.getElementById("vm-scan-message");

  try {
    const commsSnapshot = await db
      .ref(`comms/${currentScannedCommsId}`)
      .once("value");
    if (!commsSnapshot.exists()) {
      // If comms ID does not exist, create it as 'available'
      await db.ref(`comms/${currentScannedCommsId}`).set({
        status: "available",
        assignedTo: null,
        damageReport: "Initial setup via VM scan.",
      });
      vmScanMessageEl.textContent = `New Comms ID ${currentScannedCommsId} initialized!`;
      vmScanMessageEl.classList.remove("text-red-500");
      vmScanMessageEl.classList.add("text-blue-500");
    } else {
      vmScanMessageEl.textContent = "";
      vmScanMessageEl.classList.add("hidden");
    }

    scannedCommsIdEl.textContent = currentScannedCommsId;
    commsUpdateEl.classList.remove("hidden");
  } catch (error) {
    console.error("Comms Scan/Lookup Error:", error);
    vmScanMessageEl.textContent = `Error: ${error.message}`;
    vmScanMessageEl.classList.remove("hidden");
    vmScanMessageEl.classList.add("text-red-500");
    commsUpdateEl.classList.add("hidden");
  }
}

/**
 * Handles Comms Status update buttons.
 */
document.querySelectorAll(".comms-status-btn").forEach((button) => {
  button.addEventListener("click", async (e) => {
    if (!currentScannedCommsId) return;

    const status = e.target.dataset.status;
    const report = document.getElementById("comms-report").value.trim();
    const updateMessageEl = document.getElementById("comms-update-message");

    try {
      const updateData = {
        status: status,
        damageReport: report || null,
      };

      // If marking as available/damaged (VM check), ensure it's unassigned
      if (status !== "assigned") {
        updateData.assignedTo = null;
        updateData.assignedTime = null;
      }

      await db.ref(`comms/${currentScannedCommsId}`).update(updateData);

      updateMessageEl.textContent = `Comms ID ${currentScannedCommsId} status updated to ${status.toUpperCase()}.`;
      updateMessageEl.classList.remove("hidden");
      updateMessageEl.classList.remove("text-red-600");
      updateMessageEl.classList.add("text-green-600");

      // Clear report field and allow for new scan
      document.getElementById("comms-report").value = "";
      document.getElementById("vm-status-update").classList.add("hidden");

      if (vmHtml5QrcodeScanner) {
        vmHtml5QrcodeScanner.resume();
      }
    } catch (error) {
      console.error("Comms Status Update Error:", error);
      updateMessageEl.textContent = `Error updating status: ${error.message}`;
      updateMessageEl.classList.remove("hidden");
      updateMessageEl.classList.remove("text-green-600");
      updateMessageEl.classList.add("text-red-600");
    }
  });
});

// =============================
// 3. Comms Master List
// =============================

const commsListEl = document.getElementById("comms-list");

/**
 * Renders the live list of comms units.
 * @param {object} commsData All comms data.
 */
function renderCommsList(commsData) {
  commsListEl.innerHTML = "";

  if (!commsData) {
    commsListEl.innerHTML =
      '<p class="text-gray-500">No comms units registered.</p>';
    return;
  }

  // Sort by ID
  const sortedComms = Object.entries(commsData).sort(([idA], [idB]) =>
    idA.localeCompare(idB)
  );

  sortedComms.forEach(([id, data]) => {
    let statusClass = "";
    let statusText = "";

    switch (data.status) {
      case "available":
        statusClass = "bg-green-100 text-green-800";
        statusText = "Available";
        break;
      case "assigned":
        statusClass = "bg-blue-100 text-blue-800";
        statusText = `Assigned to ${data.assignedTo || "?"}`;
        break;
      case "damaged":
        statusClass = "bg-red-100 text-red-800";
        statusText = "DAMAGED";
        break;
      default:
        statusClass = "bg-gray-100 text-gray-800";
        statusText = "Unknown";
    }

    const div = document.createElement("div");
    // FIX: Use an array for classes and only spread the array into classList.add to avoid empty token error.
    const divClasses = [
      "flex",
      "justify-between",
      "items-center",
      "p-2",
      "rounded-md",
    ];
    if (statusClass) {
      // Only push if statusClass is not an empty string
      divClasses.push(statusClass);
    }

    div.classList.add(...divClasses);
    div.innerHTML = `
            <span class="font-bold">${id}</span>
            <span class="text-sm">${statusText}</span>
        `;
    commsListEl.appendChild(div);
  });
}

// Listen for real-time updates on comms data
console.log(
  "Admin Comms List connecting to path: comms. Ensure the database URL in config is correct."
); // DIAGNOSTIC LOG 1
db.ref("comms").on(
  "value",
  (snapshot) => {
    console.log(
      `Admin Comms List received data change. Snapshot size: ${snapshot.numChildren()}`
    ); // DIAGNOSTIC LOG 2
    renderCommsList(snapshot.val());
  },
  (error) => {
    console.error("Firebase Comms List Read Error:", error);
    commsListEl.innerHTML =
      '<p class="text-red-500">Failed to load comms list.</p>';
  }
);

document.addEventListener("DOMContentLoaded", startVmQrScanner);

// =============================
// 3. Comms Usage History
// =============================
const allCommsCodes = [
  "A1","A2","A3","A4","A5","A6","A7","A8",
  "B1","B2","B3","B4","B5","B6","B7","B8",
  "C1","C2","C3","C4","C5","C6","C7","C8",
];

const commsHistorySelectGrid = document.getElementById("comms-history-select-grid");
const commsHistoryPanel = document.getElementById("comms-history-panel");
let activeCommsHistoryBtn = null;

allCommsCodes.forEach((code) => {
  const btn = document.createElement("button");
  btn.textContent = code;
  btn.className = "comms-hist-btn px-3 py-1.5 font-mono font-bold text-sm bg-white border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 transition duration-150";
  btn.addEventListener("click", () => {
    if (activeCommsHistoryBtn) activeCommsHistoryBtn.className = "comms-hist-btn px-3 py-1.5 font-mono font-bold text-sm bg-white border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 transition duration-150";
    btn.className = "comms-hist-btn px-3 py-1.5 font-mono font-bold text-sm bg-blue-600 border border-blue-600 text-white rounded-lg transition duration-150";
    activeCommsHistoryBtn = btn;
    loadCommsHistory(code);
  });
  commsHistorySelectGrid.appendChild(btn);
});

async function loadCommsHistory(commsId) {
  commsHistoryPanel.classList.remove("hidden");
  commsHistoryPanel.innerHTML = `<p class="text-gray-400 text-sm text-center py-4">Loading history for <strong class="font-mono">${commsId}</strong>...</p>`;

  try {
    const [logsSnap, eventsSnap] = await Promise.all([
      db.ref("logs").once("value"),
      db.ref("commsEvents").orderByChild("commsId").equalTo(commsId).once("value"),
    ]);

    const allDates = logsSnap.val() || {};
    const allEvents = eventsSnap.val() || {};

    const items = [];

    Object.entries(allDates).forEach(([date, dateLogs]) => {
      if (!dateLogs) return;
      Object.entries(dateLogs).forEach(([key, log]) => {
        if (log.commsId === commsId && log.status !== "pending") {
          items.push({ _type: "log", _sort: `${date}T${log.timeIn || ""}`, key, date, ...log });
        }
      });
    });

    Object.entries(allEvents).forEach(([, ev]) => {
      items.push({ _type: "event", _sort: ev.timestamp || "", ...ev });
    });

    items.sort((a, b) => b._sort.localeCompare(a._sort));

    const logCount = items.filter((i) => i._type === "log").length;

    if (items.length === 0) {
      commsHistoryPanel.innerHTML = `<p class="text-gray-500 text-center py-4">No usage history found for <strong class="font-mono text-blue-600">${commsId}</strong>.</p>`;
      return;
    }

    function fmtTime(iso) {
      if (!iso) return "—";
      return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    function fmtDuration(log) {
      if (!log.timeIn) return "—";
      const start = new Date(log.timeIn);
      const end = log.timeOut ? new Date(log.timeOut) : new Date();
      const mins = Math.floor((end - start) / 60000);
      const hrs = Math.floor(mins / 60);
      return hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
    }

    let html = `<div class="mb-3 pb-2 border-b border-gray-200 flex items-center justify-between">
      <h3 class="font-bold text-gray-800">Comms <span class="font-mono text-blue-600">${commsId}</span></h3>
      <span class="text-xs text-gray-400">${logCount} session${logCount !== 1 ? "s" : ""}</span>
    </div><div class="space-y-2">`;

    items.forEach((h) => {
      if (h._type === "event") {
        const isTransfer = h.eventType === "transferred_to";
        const label = isTransfer ? "Transferred to" : "Released by";
        const badgeClass = isTransfer ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500";
        html += `<div class="flex items-center justify-between p-2.5 rounded-lg border border-gray-100 bg-gray-50">
          <div class="flex items-center gap-2">
            <span class="text-xs px-2 py-0.5 rounded-full font-semibold ${badgeClass}">${label}</span>
            <span class="text-sm text-gray-700 font-medium">${h.volunteerName || "—"}</span>
          </div>
          <div class="text-right text-xs text-gray-400 font-mono">${h.date || ""} ${fmtTime(h.timestamp)}</div>
        </div>`;
      } else {
        const isActive = !h.timeOut;
        html += `<div class="flex items-center justify-between p-3 rounded-lg border ${isActive ? "border-green-300 bg-green-50" : "border-gray-200 bg-white"}">
          <div>
            <p class="font-semibold text-gray-800 text-sm">${h.name || "—"}</p>
            <p class="text-xs text-gray-500">${h.segment || "—"} / ${h.role || "—"}</p>
            <p class="text-xs text-gray-400 font-mono">${h.date}</p>
          </div>
          <div class="text-right text-xs">
            <p class="text-green-600 font-mono font-semibold">${fmtTime(h.timeIn)}</p>
            <p class="${isActive ? "text-green-500 font-bold" : "text-red-500"} font-mono">${isActive ? "Active" : fmtTime(h.timeOut)}</p>
            <p class="text-gray-400 mt-0.5">${fmtDuration(h)}</p>
          </div>
        </div>`;
      }
    });

    html += `</div>`;
    commsHistoryPanel.innerHTML = html;
  } catch (err) {
    commsHistoryPanel.innerHTML = `<p class="text-red-500 text-sm text-center py-4">Error: ${err.message}</p>`;
  }
}
