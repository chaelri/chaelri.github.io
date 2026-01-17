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

const logsTableBody = document.getElementById("logs-table-body");
const activeCountEl = document.getElementById("active-count");
const totalCountEl = document.getElementById("total-count");
const currentDateEl = document.getElementById("current-date");
const noLogsMessage = document.getElementById("no-logs-message");

const todayDate = new Date().toISOString().slice(0, 10);
currentDateEl.textContent = todayDate;

/**
 * Formats an ISO string to a human-readable time (HH:MM:SS)
 * @param {string|null} isoString
 * @returns {string}
 */
function formatTime(isoString) {
  if (!isoString) return "—";
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "Invalid Time";
  }
}

/**
 * Creates and returns a table row element (<tr>) for a log entry.
 * @param {string} key The unique key of the log entry.
 * @param {object} log The log data object.
 * @returns {HTMLElement} The created table row.
 */
function createLogRow(key, log) {
  const isClockedIn = !log.timeOut;
  const statusClass = isClockedIn
    ? "bg-green-100 text-green-800"
    : "bg-gray-100 text-gray-800";
  const commsStatusClass =
    log.commsStatusOut === "DAMAGED"
      ? "bg-yellow-100 text-yellow-800"
      : log.commsStatusOut === "OK"
      ? "text-green-600"
      : "text-gray-500";

  const row = document.createElement("tr");
  row.id = `log-row-${key}`;

  // FIX applied in previous step (using spread array) to fix line 96 error
  let rowClasses = ["hover:bg-blue-50", "border-l-4"];
  rowClasses.push(isClockedIn ? "border-green-500" : "border-gray-300");
  row.classList.add(...rowClasses);

  // Helper for creating table data cells (<td>)
  const createCell = (content, extraClass = "") => {
    const cell = document.createElement("td");
    // FIX: Only add extraClass if it's not an empty string
    const baseClasses = [
      "px-3",
      "py-3",
      "whitespace-nowrap",
      "text-sm",
      "text-gray-900",
    ];
    if (extraClass) {
      baseClasses.push(extraClass);
    }
    cell.classList.add(...baseClasses);
    cell.innerHTML = content;
    return cell;
  };

  row.appendChild(
    createCell(
      `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}">${
        isClockedIn ? "ACTIVE" : "COMPLETED"
      }</span>`
    )
  );
  row.appendChild(
    createCell(`
        <div class="font-medium">${log.name || log.volunteerId}</div>
        <div class="text-gray-500 text-xs">${log.volunteerId}</div>
    `)
  );
  row.appendChild(
    createCell(`
        <div class="font-medium">${log.segment} (${log.role})</div>
        <div class="text-gray-500 text-xs">${log.service}</div>
    `)
  );
  row.appendChild(createCell(log.commsId || "N/A"));
  row.appendChild(createCell(formatTime(log.timeIn)));
  row.appendChild(createCell(formatTime(log.timeOut)));
  row.appendChild(
    createCell(
      `<span class="font-semibold ${commsStatusClass}">${
        log.commsStatusOut || "N/A"
      }</span>`
    )
  );

  return row;
}

/**
 * Updates the table with new log data. Implements Selective Delta Updates by key.
 * @param {object} logData All log data for the day.
 */
function updateMonitor(logData) {
  let activeCount = 0;
  let totalCount = 0;
  const existingKeys = new Set();

  if (logData) {
    // Sort keys descending (most recent first)
    const sortedKeys = Object.keys(logData).sort((a, b) => b.localeCompare(a));

    // 1. Update/Add/Count
    sortedKeys.forEach((key) => {
      const log = logData[key];
      const isClockedIn = !log.timeOut;
      totalCount++;
      if (isClockedIn) activeCount++;

      const existingRow = document.getElementById(`log-row-${key}`);
      if (existingRow) {
        // Remove existing to re-insert in correct sorted order (update)
        existingRow.remove();
      }

      // Create or recreate the row
      const newRow = createLogRow(key, log);

      // Insert at the beginning of the table body (descending order)
      logsTableBody.prepend(newRow);

      existingKeys.add(key);
    });

    // 2. Cleanup (Remove rows that no longer exist in logData - Delta)
    Array.from(logsTableBody.children).forEach((row) => {
      const key = row.id.replace("log-row-", "");
      if (!existingKeys.has(key)) {
        row.remove();
      }
    });
  } else {
    logsTableBody.innerHTML = "";
  }

  // 3. Update Counts and Message
  activeCountEl.textContent = activeCount;
  totalCountEl.textContent = totalCount;
  if (totalCount === 0) {
    noLogsMessage.classList.remove("hidden");
  } else {
    noLogsMessage.classList.add("hidden");
  }
}

// =============================
// Firebase Real-time Listener
// =============================

const logsPath = `logs/${todayDate}`;
console.log(
  `Live Monitoring connecting to path: ${logsPath}. Ensure the database URL in config is correct.`
); // DIAGNOSTIC LOG 1

db.ref(logsPath).on(
  "value",
  (snapshot) => {
    console.log(
      `Live Monitoring received data change at ${logsPath}. Snapshot size: ${snapshot.numChildren()}`
    ); // DIAGNOSTIC LOG 2
    updateMonitor(snapshot.val());
  },
  (error) => {
    console.error("Firebase Read Error:", error);
    alert("Failed to load real-time data.");
  }
);
