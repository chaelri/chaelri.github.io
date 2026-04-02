/*
 * STRICT PROTOCOL: Selective Delta Updates Only. Treat my provided code as a "Locked Source" with 100% continuity; you must not omit, summarize, or clean up any meta tags, scripts, comments, or existing logic. If a file requires no modifications based on the requested changes, do not output it or provide any response for that file.
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

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// State variables
let volunteerId = null;
let volunteerName = null;
let currentLogKey = null; // Key for the current ongoing time-in log
let html5QrcodeScanner = null;

// =============================
// UI Element Selectors
// =============================
const stages = ["scan", "action", "segment", "comms", "timeout", "final", "register", "qr-result"];

// Smooth card height animation
function animateCardHeight(callback) {
  const card = document.getElementById("main-card");
  const startH = card.offsetHeight;
  card.style.height = startH + "px";

  // Execute the DOM change
  callback();

  // Measure new height
  requestAnimationFrame(() => {
    card.style.height = "auto";
    const endH = card.offsetHeight;
    card.style.height = startH + "px";

    // Force reflow then animate to new height
    card.offsetHeight;
    card.style.height = endH + "px";

    // Clean up after transition
    const onEnd = () => {
      card.style.height = "auto";
      card.removeEventListener("transitionend", onEnd);
    };
    card.addEventListener("transitionend", onEnd);
  });
}

// Loading overlay helpers
function showLoading(text = "Processing...") {
  const overlay = document.getElementById("loading-overlay");
  document.getElementById("loading-text").textContent = text;
  overlay.classList.remove("hidden");
}
function hideLoading() {
  document.getElementById("loading-overlay").classList.add("hidden");
}

function showStage(stageName) {
  animateCardHeight(() => {
    stages.forEach((stage) => {
      const element = document.getElementById(`stage-${stage}`);
      if (element) {
        element.classList.add("hidden");
      }
    });
    const targetElement = document.getElementById(`stage-${stageName}`);
    if (targetElement) {
      targetElement.classList.remove("hidden");
      targetElement.style.animation = "none";
      targetElement.offsetHeight;
      targetElement.style.animation = "";
    }
  });
}

// =============================
// QR Scanner Logic
// =============================
const onScanSuccess = (decodedText, decodedResult) => {
  console.log("QR Code Scanned:", decodedText); // DIAGNOSTIC LOG 1

  if (volunteerId === decodedText) {
    console.log("Ignored continuous scan of the same ID.");
    return; // Prevent continuous scanning of the same ID
  }

  // Stop the scanner fully before processing
  if (html5QrcodeScanner) {
    html5QrcodeScanner
      .stop()
      .then(() => html5QrcodeScanner.clear())
      .catch((e) => console.log("Scanner stop/clear on scan:", e))
      .finally(() => handleVolunteerScan(decodedText));
  } else {
    handleVolunteerScan(decodedText);
  }
};

const onScanError = (errorMessage) => {
  // console.log(`QR Error: ${errorMessage}`);
};

const startQrScanner = async () => {
  // Ensure cleanup before starting — must stop before clearing
  if (html5QrcodeScanner) {
    try {
      const state = html5QrcodeScanner.getState();
      if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
        await html5QrcodeScanner.stop();
      }
      await html5QrcodeScanner.clear();
    } catch (e) {
      console.log("Failed to stop/clear scanner on startup:", e);
    }
  }

  html5QrcodeScanner = new Html5Qrcode("qr-scanner-area");

  // Check if camera is available
  Html5Qrcode.getCameras()
    .then((devices) => {
      if (devices && devices.length) {
        // Prefer the back camera on mobile/iPad
        const cameraId = devices.length > 1 ? devices[1].id : devices[0].id;

        // Show skeleton while camera loads
        const skeleton = document.getElementById("qr-skeleton");
        const scannerEl = document.getElementById("qr-scanner-area");
        if (skeleton) skeleton.classList.remove("hidden");
        scannerEl.style.opacity = "0";

        html5QrcodeScanner
          .start(
            cameraId,
            {
              fps: 10,
              qrbox: { width: 250, height: 250 },
            },
            onScanSuccess,
            onScanError
          )
          .then(() => {
            // Camera started — fade in and hide skeleton
            if (skeleton) skeleton.classList.add("hidden");
            scannerEl.style.transition = "opacity 0.4s ease";
            scannerEl.style.opacity = "1";
          })
          .catch((err) => {
            if (skeleton) skeleton.classList.add("hidden");
            scannerEl.style.opacity = "1";
            document.getElementById(
              "scan-message"
            ).textContent = `Camera start failed: ${err.message || err}`;
            document.getElementById("scan-message").classList.remove("hidden");
            console.error("Camera start failed:", err);
          });
      } else {
        document.getElementById("scan-message").textContent =
          "No camera found on this device.";
        document.getElementById("scan-message").classList.remove("hidden");
      }
    })
    .catch((err) => {
      document.getElementById(
        "scan-message"
      ).textContent = `Error accessing camera: ${err.message || err}`;
      document.getElementById("scan-message").classList.remove("hidden");
      console.error("Error accessing camera:", err);
    });

  showStage("scan");
};

document.addEventListener("DOMContentLoaded", startQrScanner);

// =============================
// Core Logic
// =============================

/**
 * Handles the volunteer QR scan. Checks volunteer existence and current status.
 * @param {string} id The volunteer ID (decoded QR text).
 */
async function handleVolunteerScan(id) {
  console.log("Processing Volunteer ID for lookup:", id); // DIAGNOSTIC LOG 2

  // Validate QR format before hitting Firebase
  const validPattern = /^(VOL|GUEST)-\d+-[A-Z0-9]{4}$/;
  if (!validPattern.test(id)) {
    console.warn("Invalid QR format rejected:", id);
    const scanMsg = document.getElementById("scan-message");
    scanMsg.textContent = "Invalid QR code. Please use a registered volunteer or guest QR.";
    scanMsg.classList.remove("hidden");
    setTimeout(() => scanMsg.classList.add("hidden"), 4000);

    // Resume scanning
    if (html5QrcodeScanner) {
      try { html5QrcodeScanner.resume(); } catch (e) { startQrScanner(); }
    }
    volunteerId = null;
    return;
  }

  volunteerId = id;
  showLoading("Looking up volunteer...");

  try {
    const volunteerSnapshot = await db
      .ref(`volunteers/${volunteerId}`)
      .once("value");
    if (!volunteerSnapshot.exists()) {
      console.error("Volunteer ID not found in Firebase:", volunteerId); // DIAGNOSTIC LOG 3
      alert("Error: Volunteer ID not recognized. Please check with an admin.");

      // Full clear and restart on failure
      if (html5QrcodeScanner)
        html5QrcodeScanner
          .clear()
          .catch((e) =>
            console.error(
              "Failed to clear scanner on handleVolunteerScan failure:",
              e
            )
          );
      startQrScanner();
      return;
    }

    volunteerName = volunteerSnapshot.val().name || "Volunteer";
    document.getElementById("volunteer-name").textContent = volunteerName;

    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const logsRef = db.ref(`logs/${date}`);
    const logSnapshot = await logsRef
      .orderByChild("volunteerId")
      .equalTo(volunteerId)
      .once("value");

    const logs = logSnapshot.val();
    let activeLog = null;
    let activeLogKey = null;

    if (logs) {
      // Find the most recent log for this volunteer that does NOT have a timeOut
      const sortedLogs = Object.entries(logs).sort(([keyA], [keyB]) =>
        keyB.localeCompare(keyA)
      );
      for (const [key, log] of sortedLogs) {
        if (log.volunteerId === volunteerId && !log.timeOut) {
          activeLog = log;
          activeLogKey = key;
          break;
        }
      }
    }

    currentLogKey = activeLogKey;

    if (activeLog) {
      // Already clocked in → auto Time Out flow
      console.log("Volunteer already clocked in. Auto-routing to Time Out."); // DIAGNOSTIC LOG 4
      const logSnapshot2 = await db.ref(`logs/${date}/${currentLogKey}`).once("value");
      const log = logSnapshot2.val();
      document.getElementById("volunteer-name").textContent = volunteerName;
      document.getElementById("timeout-volunteer-name").textContent = volunteerName;
      document.getElementById("timeout-time").textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      document.getElementById("timeout-date").textContent = new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      document.getElementById("timeout-segment-label").textContent = log.segment || "";
      document.getElementById("timeout-role-label").textContent = log.role || "";

      // Show comms code only if it exists and isn't NONE
      const commsId = log.commsId;
      if (commsId && commsId !== "NONE") {
        document.getElementById("return-comms-id").textContent = commsId;
        document.getElementById("timeout-comms-block").classList.remove("hidden");
      } else {
        document.getElementById("timeout-comms-block").classList.add("hidden");
      }

      // Show segment ID if it was recorded
      const segId = log.numberedId;
      if (segId) {
        document.getElementById("return-seg-id").textContent = "#" + segId;
        document.getElementById("timeout-segid-block").classList.remove("hidden");
      } else {
        document.getElementById("timeout-segid-block").classList.add("hidden");
      }

      hideLoading();
      showStage("timeout");
    } else {
      // Not clocked in → auto Time In flow (segment selection)
      console.log("Volunteer not clocked in. Auto-routing to Time In."); // DIAGNOSTIC LOG 4
      document.getElementById("segment-volunteer-name").textContent = volunteerName;
      document.getElementById("segment-time-in").textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      document.getElementById("segment-date").textContent = new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      // Reset pill state
      document.getElementById("selected-segment").value = "";
      document.getElementById("selected-role").value = "";
      document.getElementById("segment-submit-btn").disabled = true;
      document.getElementById("segment-pills-section").classList.remove("hidden");
      document.getElementById("role-pills-section").classList.add("hidden");
      renderSegmentPills();
      hideLoading();
      showStage("segment");
    }
  } catch (error) {
    console.error("Firebase/Scan Error during lookup:", error);
    alert("An error occurred while checking your status. Please try again.");

    // Full clear and restart on failure
    if (html5QrcodeScanner)
      html5QrcodeScanner
        .clear()
        .catch((e) =>
          console.error(
            "Failed to clear scanner on handleVolunteerScan catch:",
            e
          )
        );
    startQrScanner();
  }
}

/**
 * Handles the Time In button click: proceeds to Segment selection.
 */
document.getElementById("time-in-btn").addEventListener("click", () => {
  if (volunteerId) {
    showStage("segment");
  }
});

/**
 * Handles the Time Out button click: proceeds to Comms return check.
 */
document.getElementById("time-out-btn").addEventListener("click", () => {
  if (currentLogKey) {
    // Retrieve the comms ID from the active log
    const date = new Date().toISOString().slice(0, 10);
    db.ref(`logs/${date}/${currentLogKey}`)
      .once("value", (snapshot) => {
        const log = snapshot.val();
        document.getElementById("return-comms-id").textContent =
          log.commsId || "N/A";
        showStage("timeout");
      })
      .catch((error) => {
        console.error("Error retrieving log for time out:", error);
        alert(
          "Could not retrieve active log details. Please try scanning again."
        );
        startQrScanner();
      });
  }
});

// =============================
// Segment → Role Mapping
// =============================
const segmentRoles = {
  "Audio": [
    "FOH",
    "FOH Assistant",
    "FOH Trainee",
    "FOH Assistant Trainee",
    "FOH Observer",
    "Monitor Mix",
    "RF Tech",
    "Monitor Mix Trainee",
    "Monitor Mix Observer",
    "BC Mix",
    "BC Mix Assistant",
    "BC Mix Trainee",
    "BC Mix Assistant Trainee",
    "BC Mix Observer",
    "NxtGen",
    "NxtGen Trainee",
    "NxtGen Observer",
    "Audio Volunteer",
  ],
  "Lights": [
    "Lights Team Lead",
    "Lighting Operator",
    "Lighting Assist",
    "Lighting Trainee/Observer",
  ],
  "Camera": [
    "Camera Director",
    "Technical Director (Switcher)",
    "Cameraman 1 (Main Follow)",
    "Cameraman 2 (Main Full/TV)",
    "Cameraman 3 (Wide)",
    "Cameraman 4 (Side)",
    "Cameraman 5 (PTZ)",
    "Cameraman 6 (Gimbal)",
    "Cameraman 7 (Gimbal)",
    "Cameraman 8 (Crane)",
    "Cameraman 9 (Stage Left)",
    "Camera 10 (Stage Right)",
    "Camera Trainee/Observer",
    "Camera Mentor",
    "Camera Support",
  ],
  "Stage": [
    "Stage Manager",
    "Stage Mentor",
    "Assistant Stage Manager 1",
    "Assistant Stage Manager 2",
    "Speaker Care",
    "Speaker Care Assist",
    "Stage Trainee/Observer",
  ],
  "Graphics": [
    "Graphics Team Lead",
    "Main LED Switcher",
    "Main LED Graphics Operator",
    "BCR Coordinator",
    "Graphics Switcher",
    "Graphics Playback",
    "Graphics Playback Assist",
    "Lower Thirds Operator",
    "Teleprompter Operator",
    "Graphics Trainee/Observer",
    "Graphics Mentor",
  ],
  "Volunteer Management": [
    "VM / Comms Custodian",
    "VM - Volunteer Care",
    "Volunteer Management",
    "VM Trainee",
  ],
  "Live Prod Crew": [
    "Graphics Playback",
    "Soundbooth Support",
    "BCR Support",
    "Stage & Roving Support",
    "Camera Support",
    "NXTGEN & Roving Support",
    "Stage & Warehouse Support",
  ],
  "Comms": [
    "Live Prod Head",
    "Program Coordinator",
    "Video/Equipment Lead",
    "Audio/Equipment Lead",
    "Stage/Equipment Lead",
  ],
};

// Staff segments (full-time workers, not volunteers)
const staffSegments = ["Live Prod Crew", "Comms"];

// Segment color themes (Tailwind classes)
const segmentColors = {
  "Volunteer Management": { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", pill: "bg-rose-100 text-rose-800 border-rose-300", pillActive: "bg-rose-600 text-white border-rose-600 ring-rose-300", badge: "bg-rose-600" },
  "Audio": { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-700", pill: "bg-violet-100 text-violet-800 border-violet-300", pillActive: "bg-violet-600 text-white border-violet-600 ring-violet-300", badge: "bg-violet-600" },
  "Lights": { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", pill: "bg-amber-100 text-amber-800 border-amber-300", pillActive: "bg-amber-600 text-white border-amber-600 ring-amber-300", badge: "bg-amber-600" },
  "Camera": { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", pill: "bg-blue-100 text-blue-800 border-blue-300", pillActive: "bg-blue-600 text-white border-blue-600 ring-blue-300", badge: "bg-blue-600" },
  "Stage": { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", pill: "bg-emerald-100 text-emerald-800 border-emerald-300", pillActive: "bg-emerald-600 text-white border-emerald-600 ring-emerald-300", badge: "bg-emerald-600" },
  "Graphics": { bg: "bg-cyan-50", border: "border-cyan-200", text: "text-cyan-700", pill: "bg-cyan-100 text-cyan-800 border-cyan-300", pillActive: "bg-cyan-600 text-white border-cyan-600 ring-cyan-300", badge: "bg-cyan-600" },
  "Live Prod Crew": { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", pill: "bg-orange-100 text-orange-800 border-orange-300", pillActive: "bg-orange-600 text-white border-orange-600 ring-orange-300", badge: "bg-orange-600" },
  "Comms": { bg: "bg-teal-50", border: "border-teal-200", text: "text-teal-700", pill: "bg-teal-100 text-teal-800 border-teal-300", pillActive: "bg-teal-600 text-white border-teal-600 ring-teal-300", badge: "bg-teal-600" },
};
const defaultColor = { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", pill: "bg-white text-gray-700 border-gray-300", pillActive: "bg-blue-600 text-white border-blue-600 ring-blue-300", badge: "bg-blue-600" };

let currentSegmentColor = defaultColor;

// =============================
// Role → Comms Code Mapping (Sunday)
// =============================
const roleToComms = {
  // Camera — A1-A8 (Camera 1-8), B1 (Camera 9), B8 (Camera 10)
  "Cameraman 1 (Main Follow)": "A1",
  "Cameraman 2 (Main Full/TV)": "A2",
  "Cameraman 3 (Wide)": "A3",
  "Cameraman 4 (Side)": "A4",
  "Cameraman 5 (PTZ)": "A5",
  "Cameraman 6 (Gimbal)": "A6",
  "Cameraman 7 (Gimbal)": "A7",
  "Cameraman 8 (Crane)": "A8",
  "Cameraman 9 (Stage Left)": "B1",
  "Camera 10 (Stage Right)": "B8",
  // Camera — B2
  "Camera Support": "B2",
  // Lights — B3
  "Lights Team Lead": "B3",
  // Stage — B4, B5, B6, C8
  "Stage Manager": "B4",
  "Assistant Stage Manager 1": "B5",
  "Assistant Stage Manager 2": "B6",
  "Speaker Care": "C8",
  // Audio — C5, C6, C7
  "FOH": "C5",
  "BC Mix": "C6",
  "RF Tech": "C7",
  // Graphics — C2, C3, C4
  "Main LED Switcher": "C2",     // Soundbooth
  "Graphics Playback": "C3",
  "BCR Coordinator": "C4",
  // Comms (staff) — B7, C1
  "Stage/Equipment Lead": "B7",
  "Program Coordinator": "C1",
};

// =============================
// Pill-based Segment & Role Picker
// =============================
function renderSegmentPills() {
  const container = document.getElementById("segment-pills");
  container.innerHTML = "";

  const volunteerSegs = Object.keys(segmentRoles).filter((s) => !staffSegments.includes(s));
  const staffSegs = Object.keys(segmentRoles).filter((s) => staffSegments.includes(s));

  let idx = 0;

  // Volunteer segments
  volunteerSegs.forEach((seg) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.textContent = seg;
    pill.className =
      "px-4 py-2 rounded-full text-sm font-medium border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 transition duration-150";
    pill.style.animationDelay = `${idx * 50}ms`;
    pill.addEventListener("click", () => selectSegment(seg));
    container.appendChild(pill);
    idx++;
  });

  // Divider
  if (staffSegs.length) {
    const divider = document.createElement("div");
    divider.className = "w-full my-3 divider-anim";
    divider.style.animationDelay = `${idx * 50}ms`;
    divider.innerHTML = '<p class="text-xs uppercase tracking-widest text-neutral-400 font-semibold text-center">Staff / Full-time</p>';
    container.appendChild(divider);
    idx++;
  }

  // Staff segments
  staffSegs.forEach((seg) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.textContent = seg;
    pill.className =
      "px-4 py-2 rounded-full text-sm font-medium border border-neutral-300 bg-neutral-900 text-white hover:bg-neutral-700 transition duration-150";
    pill.style.animationDelay = `${idx * 50}ms`;
    pill.addEventListener("click", () => selectSegment(seg));
    container.appendChild(pill);
    idx++;
  });
}

async function selectSegment(segment) {
  document.getElementById("selected-segment").value = segment;
  document.getElementById("selected-role").value = "";
  document.getElementById("segment-submit-btn").disabled = true;
  document.getElementById("selected-segment-label").textContent = segment;

  // Apply segment color theme
  currentSegmentColor = segmentColors[segment] || defaultColor;

  // 1. Hide segment pills immediately
  document.getElementById("segment-pills-section").classList.add("hidden");
  // Keep role section hidden while we build it
  document.getElementById("role-pills-section").classList.add("hidden");

  const container = document.getElementById("role-pills");
  container.innerHTML = "";

  // 2. Build all role pills INSTANTLY (no waiting for Firebase)
  const leaderKeywords = ["Director", "Lead", "Mentor", "Head", "Manager", "Trainee", "Observer"];
  const volunteerRole = `${segment} (Volunteer)`;
  const segRoles = [...segmentRoles[segment]];
  const regularRoles = segRoles.filter((r) => !leaderKeywords.some((k) => r.includes(k)));
  const leaderRoles = segRoles.filter((r) => leaderKeywords.some((k) => r.includes(k)));
  const allRoles = [...regularRoles, ...leaderRoles, volunteerRole];
  const rowMap = {}; // role -> row element, for later disable

  allRoles.forEach((role, pillIdx) => {
    const isVolunteerRole = role.endsWith("(Volunteer)");

    const row = document.createElement("button");
    row.type = "button";
    row.dataset.role = role;

    const checkColor = "text-neutral-400";
    if (isVolunteerRole) {
      row.innerHTML = `
        <span class="flex items-center gap-2">
          <span class="material-icons-round text-base ${checkColor} role-check">radio_button_unchecked</span>
          <span>${segment}</span>
          <span class="border border-current text-xs font-semibold px-2 py-0.5 rounded-full vol-badge">Volunteer</span>
        </span>`;
    } else {
      const commsCode = roleToComms[role];
      const commsBadge = commsCode ? `<span class="ml-auto text-xs font-mono font-bold text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded">${commsCode}</span>` : "";
      row.innerHTML = `
        <span class="flex items-center gap-2 w-full">
          <span class="material-icons-round text-base ${checkColor} role-check">radio_button_unchecked</span>
          <span class="role-label">${role}</span>
          ${commsBadge}
        </span>`;
    }

    row.className =
      "w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 hover:border-neutral-400 transition duration-150";
    row.dataset.defaultClass = row.className;
    row.style.animationDelay = `${pillIdx * 40}ms`;
    row.addEventListener("click", () => {
      if (!row.disabled) selectRole(row, role);
    });
    container.appendChild(row);
    rowMap[role] = row;
  });

  // 3. Reveal immediately — pills are ready
  animateCardHeight(() => {
    document.getElementById("role-pills-section").classList.remove("hidden");
  });

  // 4. Fetch taken roles in BACKGROUND, then disable them
  const date = new Date().toISOString().slice(0, 10);
  try {
    const logsSnap = await db.ref(`logs/${date}`).once("value");
    const logs = logsSnap.val();
    if (logs) {
      // Build map: role -> { name, timeIn }
      const takenMap = {};
      Object.values(logs).forEach((log) => {
        if (log.role && !log.timeOut) {
          takenMap[log.role] = { name: log.name, timeIn: log.timeIn };
        }
      });

      // Disable taken rows (except unlimited ones)
      Object.entries(takenMap).forEach(([role, info]) => {
        const row = rowMap[role];
        if (!row) return;
        const isUnlimited = role.endsWith("(Volunteer)") || /trainee|observer/i.test(role);
        if (isUnlimited) return;

        row.disabled = true;
        const timeStr = new Date(info.timeIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const takenCommsCode = roleToComms[role];
        const takenCommsBadge = takenCommsCode ? `<span class="text-xs font-mono font-bold text-green-400 bg-green-100 px-2 py-0.5 rounded">${takenCommsCode}</span>` : "";
        row.className = "w-full text-left px-3 py-2.5 rounded-lg text-sm border border-green-100 bg-green-50 text-green-700 cursor-default transition duration-150";
        row.innerHTML = `
          <span class="flex items-center gap-2 w-full">
            <span class="material-icons-round text-base text-green-400">check_circle</span>
            <span class="flex-1">
              <span class="font-medium">${role}</span>
              <span class="block text-xs text-green-500 mt-0.5">${info.name} is serving since ${timeStr}</span>
            </span>
            ${takenCommsBadge}
          </span>`;
      });
    }
  } catch (e) {
    console.log("Could not fetch taken roles:", e);
  }
}

function selectRole(selectedRow, role) {
  document.getElementById("selected-role").value = role;
  document.getElementById("segment-submit-btn").disabled = false;

  // Reset all rows, highlight selected
  const allRows = document.getElementById("role-pills").querySelectorAll("button");
  allRows.forEach((r) => {
    r.className = r.dataset.defaultClass || "w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 hover:border-neutral-400 transition duration-150";
    r.style.opacity = "1";
    r.style.transform = "translateY(0)";
    r.style.animation = "none";
    const check = r.querySelector(".role-check");
    if (check) { check.textContent = "radio_button_unchecked"; check.className = "material-icons-round text-base text-neutral-400 role-check"; }
    const badge = r.querySelector(".font-mono");
    if (badge) { badge.className = "ml-auto text-xs font-mono font-bold text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded"; }
  });
  selectedRow.className =
    "w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium border-2 border-neutral-900 bg-neutral-900 text-white transition duration-150";
  selectedRow.style.opacity = "1";
  selectedRow.style.transform = "translateY(0)";
  selectedRow.style.animation = "none";
  const selectedCheck = selectedRow.querySelector(".role-check");
  if (selectedCheck) { selectedCheck.textContent = "check_circle"; selectedCheck.className = "material-icons-round text-base text-white role-check"; }
  // Invert comms badge for selected state
  const commsBadge = selectedRow.querySelector(".font-mono");
  if (commsBadge) { commsBadge.className = "ml-auto text-xs font-mono font-bold text-neutral-900 bg-white px-2 py-0.5 rounded"; }
}

// "Change segment" link
document.getElementById("change-segment-btn").addEventListener("click", () => {
  document.getElementById("selected-segment").value = "";
  document.getElementById("selected-role").value = "";
  document.getElementById("segment-submit-btn").disabled = true;
  animateCardHeight(() => {
    document.getElementById("role-pills-section").classList.add("hidden");
    document.getElementById("segment-pills-section").classList.remove("hidden");
    renderSegmentPills();
  });
});

/**
 * Handles the Segment Form submission (Stage 3 -> Stage 4).
 * Only prepares the UI — no Firebase write yet.
 */
// Store pending time-in data
let pendingTimeIn = null;

document
  .getElementById("segment-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const segment = document.getElementById("selected-segment").value;
    const role = document.getElementById("selected-role").value;

    if (!segment || !role) return;

    // Resolve comms code
    const commsCode = roleToComms[role] || null;

    // Store for later confirmation
    const commsId = commsCode || "NONE";
    pendingTimeIn = { segment, role, commsCode, commsId };

    // Write a PENDING record to Firebase so monitor can see
    const now = new Date().toISOString();
    const date = now.slice(0, 10);
    const pendingRef = db.ref(`logs/${date}`).push();
    pendingTimeIn.pendingKey = pendingRef.key;
    pendingTimeIn.timestamp = now;
    await pendingRef.set({
      volunteerId: volunteerId,
      name: volunteerName,
      timeIn: now,
      timeOut: null,
      segment: segment,
      role: role,
      commsId: commsId,
      numberedId: null,
      commsStatusOut: null,
      status: "pending", // <-- pending flag
    });

    // Update UI only
    document.getElementById("comms-volunteer-name").textContent = volunteerName;
    document.getElementById("comms-time-in").textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    document.getElementById("comms-segment-label").textContent = segment;
    document.getElementById("comms-role-label").textContent = role;
    document.getElementById("numbered-id-input").value = "";

    if (commsCode) {
      document.getElementById("assigned-comms-id").textContent = commsCode;
      document.getElementById("comms-assignment-block").classList.remove("hidden");
      document.getElementById("comms-none-block").classList.add("hidden");
    } else {
      document.getElementById("comms-assignment-block").classList.add("hidden");
      document.getElementById("comms-none-block").classList.remove("hidden");
    }

    showStage("comms");
  });

/**
 * Handles Comms Received Confirmation (Stage 4 -> Stage 6).
 * This button completes the Time In process from the volunteer's perspective.
 */
// Go back from comms to segment selection
document.getElementById("comms-go-back-btn").addEventListener("click", async () => {
  // Remove pending record from Firebase
  if (pendingTimeIn && pendingTimeIn.pendingKey) {
    const date = pendingTimeIn.timestamp.slice(0, 10);
    await db.ref(`logs/${date}/${pendingTimeIn.pendingKey}`).remove().catch(() => {});
  }
  pendingTimeIn = null;
  showStage("segment");
});

// Clear error on typing
document.getElementById("numbered-id-input").addEventListener("input", () => {
  document.getElementById("numbered-id-error").classList.add("hidden");
  document.getElementById("numbered-id-input").classList.remove("border-red-400", "shake");
});

document.getElementById("comms-received-btn").addEventListener("click", async () => {
  const numberedId = document.getElementById("numbered-id-input").value.trim();

  showLoading("Timing in...");

  try {
    if (!pendingTimeIn) {
      hideLoading();
      alert("Error: No pending time-in data. Please start over.");
      startQrScanner();
      return;
    }

    const { segment, role, commsCode, pendingKey, timestamp } = pendingTimeIn;
    const assignedCommsId = commsCode || "NONE";
    const date = timestamp.slice(0, 10);

    // 1. Upgrade pending record to confirmed
    currentLogKey = pendingKey;
    await db.ref(`logs/${date}/${pendingKey}`).update({
      numberedId: numberedId,
      status: null, // Remove pending flag — now confirmed
    });
    console.log(`Time In confirmed at: logs/${date}/${currentLogKey}`);

    // 2. Update Comms Status in Firebase (if mapped)
    if (commsCode) {
      await db.ref(`comms/${commsCode}`).update({
        status: "assigned",
        assignedTo: volunteerId,
        assignedTime: now,
      });
    }

    pendingTimeIn = null;

    const commsText = document.getElementById("assigned-comms-id").textContent || "—";
    const timeText = document.getElementById("comms-time-in").textContent;

    // Populate final page
    document.getElementById("final-type-badge").textContent = "Timed In";
    document.getElementById("final-type-badge").className = "inline-block bg-green-600 text-white text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-3";
    document.getElementById("final-volunteer-name").textContent = volunteerName;
    document.getElementById("final-time-label").textContent = timeText;
    document.getElementById("final-date-label").textContent = new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    document.getElementById("final-comms-code").textContent = commsText;
    document.getElementById("final-message").textContent = "Do your best for God as you serve. God bless!";

    if (commsText && commsText !== "—") {
      document.getElementById("final-comms-block").classList.remove("hidden");
    } else {
      document.getElementById("final-comms-block").classList.add("hidden");
    }

    if (numberedId) {
      document.getElementById("final-seg-id").textContent = "#" + numberedId;
      document.getElementById("final-segid-block").classList.remove("hidden");
    } else {
      document.getElementById("final-segid-block").classList.add("hidden");
    }

    hideLoading();
    showStage("final");
    startFinalCountdown();
  } catch (error) {
    hideLoading();
    console.error("Time In Error:", error);
    alert("An error occurred during Time In. Please try again.");
  }
});

/**
 * Handles Comms Status selection during Time Out (Stage 5).
 */
let commsStatusOut = null;
let commsIdToReturn = null;

/**
 * Handles the final Time Out confirmation (Stage 5 -> Stage 6).
 */
document
  .getElementById("final-timeout-btn")
  .addEventListener("click", async () => {
    if (!currentLogKey) {
      alert("Error: Missing log. Please re-scan.");
      startQrScanner();
      return;
    }

    commsStatusOut = "OK";
    commsIdToReturn = document.getElementById("return-comms-id").textContent;
    showLoading("Timing out...");

    try {
      const now = new Date().toISOString();
      const date = now.slice(0, 10);

      // 1. Update Log Time Out and Comms Status
      const logUpdate = {
        timeOut: now,
        commsStatusOut: commsStatusOut,
      };
      await db.ref(`logs/${date}/${currentLogKey}`).update(logUpdate);
      console.log(
        `Time Out logged successfully at path: logs/${date}/${currentLogKey}`
      ); // DIAGNOSTIC LOG 8

      // 2. Update Comms status
      if (commsIdToReturn && commsIdToReturn !== "NONE" && commsIdToReturn !== "N/A" && commsIdToReturn !== "ID_NONE") {
        const commsUpdate = {
          assignedTo: null,
          assignedTime: null,
          status: commsStatusOut === "OK" ? "available" : "damaged", // Mark as damaged if selected
        };
        await db.ref(`comms/${commsIdToReturn}`).update(commsUpdate);
        console.log(
          `Comms ID ${commsIdToReturn} updated to ${commsUpdate.status}.`
        ); // DIAGNOSTIC LOG 9
      }

      // 3. Final UI update
      document.getElementById("final-type-badge").textContent = "Timed Out";
      document.getElementById("final-type-badge").className = "inline-block bg-red-600 text-white text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-3";
      document.getElementById("final-volunteer-name").textContent = volunteerName;
      document.getElementById("final-time-label").textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      document.getElementById("final-date-label").textContent = new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      document.getElementById("final-comms-block").classList.add("hidden");
      document.getElementById("final-segid-block").classList.add("hidden");
      document.getElementById("final-message").textContent = "Thank you for serving the Lord!";
      hideLoading();
      showStage("final");
      startFinalCountdown();
    } catch (error) {
      hideLoading();
      console.error("Time Out/Comms Return Error:", error);
      alert("An error occurred during Time Out. Please contact admin.");
    }
  });

/**
 * Resets the application state to restart scanning.
 */
document.getElementById("reset-scan-btn").addEventListener("click", () => {
  volunteerId = null;
  volunteerName = null;
  currentLogKey = null;
  commsStatusOut = null;
  commsIdToReturn = null;
  startQrScanner();
});

// =============================
// DEBUG: Test User
// =============================
document.getElementById("test-user-btn").addEventListener("click", async () => {
  showLoading("Looking up volunteer...");

  const testId = "VOL-0000000000000-TEST";
  const testName = "Test Volunteer";

  // Ensure test user exists in Firebase
  const snap = await db.ref(`volunteers/${testId}`).once("value");
  if (!snap.exists()) {
    await db.ref(`volunteers/${testId}`).set({
      name: testName,
      type: "volunteer",
      registeredAt: new Date().toISOString(),
    });
  }

  // Stop scanner and simulate scan
  if (html5QrcodeScanner) {
    try {
      const state = html5QrcodeScanner.getState();
      if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
        await html5QrcodeScanner.stop();
      }
      await html5QrcodeScanner.clear();
    } catch (e) {
      console.log("Failed to stop/clear scanner for test user:", e);
    }
  }

  handleVolunteerScan(testId);
});

// =============================
// Registration / Guest Check-in Logic
// =============================

/**
 * Opens the registration form for volunteers or guests.
 * @param {string} type - "volunteer" or "guest"
 */
async function openRegisterForm(type) {
  // Stop scanner while registering — must stop before clearing
  if (html5QrcodeScanner) {
    try {
      const state = html5QrcodeScanner.getState();
      if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
        await html5QrcodeScanner.stop();
      }
      await html5QrcodeScanner.clear();
    } catch (e) {
      console.log("Failed to stop/clear scanner for register:", e);
    }
  }

  document.getElementById("register-type").value = type;
  document.getElementById("register-form").reset();

  if (type === "guest") {
    document.getElementById("register-title").textContent = "Guest Check-in";
    document.getElementById("register-team-group").classList.add("hidden");
    document.getElementById("register-submit-btn").textContent =
      "Generate Guest QR";
  } else {
    document.getElementById("register-title").textContent =
      "Register Volunteer";
    document.getElementById("register-team-group").classList.remove("hidden");
    document.getElementById("register-submit-btn").textContent =
      "Register & Generate QR";

    // Render segment pills for volunteer registration (multi-select)
    const pillContainer = document.getElementById("register-segment-pills");
    pillContainer.innerHTML = "";
    const selectedSegments = new Set();
    document.getElementById("register-team").value = "";

    const defaultPillClass = "px-3 py-1.5 rounded-full text-xs font-medium border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 transition duration-150";
    const activePillClass = "px-3 py-1.5 rounded-full text-xs font-medium border-2 border-neutral-900 bg-neutral-900 text-white transition duration-150";

    const allSegs = Object.keys(segmentRoles);
    allSegs.forEach((seg) => {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.textContent = seg;
      pill.className = defaultPillClass;
      pill.addEventListener("click", () => {
        if (selectedSegments.has(seg)) {
          selectedSegments.delete(seg);
          pill.className = defaultPillClass;
        } else {
          selectedSegments.add(seg);
          pill.className = activePillClass;
        }
        document.getElementById("register-team").value = [...selectedSegments].join(", ");
      });
      pillContainer.appendChild(pill);
    });
  }

  showStage("register");
}

document
  .getElementById("open-register-btn")
  .addEventListener("click", () => openRegisterForm("volunteer"));

document
  .getElementById("open-guest-btn")
  .addEventListener("click", () => openRegisterForm("guest"));

document.getElementById("register-back-btn").addEventListener("click", () => {
  startQrScanner();
});

// =============================
// Name autocomplete for registration
// =============================
let allVolunteers = []; // cached volunteer list

async function loadVolunteers() {
  try {
    const snap = await db.ref("volunteers").once("value");
    const data = snap.val() || {};
    allVolunteers = Object.entries(data).map(([id, v]) => ({
      id,
      name: v.name || "",
      team: v.team || "",
    }));
  } catch (e) {
    console.log("Could not load volunteers for autocomplete:", e);
  }
}
loadVolunteers();

document.getElementById("register-name").addEventListener("input", (e) => {
  const query = e.target.value.toLowerCase().trim();
  const suggestionsEl = document.getElementById("name-suggestions");
  const matchMsg = document.getElementById("name-match-msg");
  suggestionsEl.innerHTML = "";
  matchMsg.classList.add("hidden");

  if (query.length < 2) {
    suggestionsEl.classList.add("hidden");
    return;
  }

  const matches = allVolunteers.filter((v) =>
    v.name.toLowerCase().includes(query)
  ).slice(0, 5);

  if (matches.length === 0) {
    suggestionsEl.classList.add("hidden");
    return;
  }

  suggestionsEl.classList.remove("hidden");
  matches.forEach((v) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 transition flex items-center justify-between";
    item.innerHTML = `
      <span class="font-medium text-neutral-800">${v.name}</span>
      <span class="text-xs text-amber-600 font-medium">Already registered</span>
    `;
    item.addEventListener("click", () => {
      document.getElementById("register-name").value = v.name;
      suggestionsEl.classList.add("hidden");
      matchMsg.textContent = `"${v.name}" is already registered. They can scan their QR to time in.`;
      matchMsg.className = "text-xs mt-1 text-amber-600";
      matchMsg.classList.remove("hidden");
    });
    suggestionsEl.appendChild(item);
  });
});

// Hide suggestions on blur (with delay for click)
document.getElementById("register-name").addEventListener("blur", () => {
  setTimeout(() => document.getElementById("name-suggestions").classList.add("hidden"), 200);
});

/**
 * Handles registration form submission.
 * Generates a unique ID, saves to Firebase, and shows the QR code.
 */
document
  .getElementById("register-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    const type = document.getElementById("register-type").value;
    const name = document.getElementById("register-name").value.trim();
    const team = document.getElementById("register-team").value.trim();
    const contact = document.getElementById("register-contact").value.trim();

    if (!name) {
      alert("Please enter a name.");
      return;
    }

    // Generate a unique ID
    const prefix = type === "guest" ? "GUEST" : "VOL";
    const newId = `${prefix}-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 6)
      .toUpperCase()}`;

    try {
      // Save to Firebase
      const volunteerData = {
        name: name,
        type: type,
        registeredAt: new Date().toISOString(),
      };

      if (type === "volunteer" && team) {
        volunteerData.team = team;
      }
      if (contact) {
        volunteerData.contact = contact;
      }

      await db.ref(`volunteers/${newId}`).set(volunteerData);
      console.log(`${type} registered with ID: ${newId}`);

      // Show QR result
      const titleEl = document.getElementById("qr-result-title");
      const nameEl = document.getElementById("qr-result-name");
      const idEl = document.getElementById("qr-result-id");
      const qrContainer = document.getElementById("qr-code-output");

      if (type === "guest") {
        titleEl.textContent = "Guest Registered!";
        titleEl.classList.remove("text-green-600");
        titleEl.classList.add("text-gray-600");
        nameEl.textContent = name;
      } else {
        titleEl.textContent = "Volunteer Registered!";
        titleEl.classList.remove("text-gray-600");
        titleEl.classList.add("text-green-600");
        nameEl.textContent = `${name}${team ? " — " + team : ""}`;
      }

      idEl.textContent = `ID: ${newId}`;

      // Clear previous QR code
      qrContainer.innerHTML = "";

      // Generate QR code
      new QRCode(qrContainer, {
        text: newId,
        width: 200,
        height: 200,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H,
      });

      showStage("qr-result");
    } catch (error) {
      console.error("Registration error:", error);
      alert("Registration failed. Please try again.");
    }
  });

/**
 * Proceed to scan the newly generated QR.
 */
document
  .getElementById("qr-proceed-scan-btn")
  .addEventListener("click", () => {
    startQrScanner();
  });

document.getElementById("qr-done-btn").addEventListener("click", () => {
  startQrScanner();
});

// =============================
// Final stage auto-restart countdown
// =============================
let finalCountdownTimer = null;
let finalCountdownInterval = null;

function startFinalCountdown() {
  clearTimeout(finalCountdownTimer);
  clearInterval(finalCountdownInterval);

  let seconds = 10;
  const secondsEl = document.getElementById("final-seconds");
  const progressEl = document.getElementById("final-progress");

  secondsEl.textContent = seconds;
  progressEl.style.transition = "none";
  progressEl.style.width = "0%";
  progressEl.offsetHeight; // reflow
  progressEl.style.transition = "width 10s linear";
  progressEl.style.width = "100%";

  finalCountdownInterval = setInterval(() => {
    seconds--;
    if (seconds >= 0) secondsEl.textContent = seconds;
  }, 1000);

  finalCountdownTimer = setTimeout(() => {
    clearInterval(finalCountdownInterval);
    window.location.reload();
  }, 10000);
}

function stopFinalCountdown() {
  clearTimeout(finalCountdownTimer);
  clearInterval(finalCountdownInterval);
}

document.getElementById("final-new-scan-btn").addEventListener("click", () => {
  stopFinalCountdown();
  window.location.reload();
});
