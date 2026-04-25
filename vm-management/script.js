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

// Philippine time helper (UTC+8)
function getPHDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }); // YYYY-MM-DD
}

function getPHHour() {
  return parseInt(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", hour: "numeric", hour12: false }));
}

// =============================
// Service Selection (Sunday Services)
// =============================
const SERVICE_SLOTS = ["9AM", "12NN", "3PM", "6PM"];
let selectedServices = new Set();

function initServicePills() {
  const phHour = getPHHour();
  selectedServices = phHour < 12 ? new Set(["9AM", "12NN"]) : new Set(["3PM", "6PM"]);
  updateServicePillUI();
}

function updateServicePillUI() {
  document.querySelectorAll(".service-pill").forEach((btn) => {
    const svc = btn.dataset.service;
    const active = selectedServices.has(svc);
    const isAM = svc === "9AM" || svc === "12NN";
    btn.className = active
      ? `service-pill py-2 rounded-lg text-xs font-bold border transition ${isAM ? "border-sky-500 bg-sky-500/20 text-sky-400" : "border-violet-500 bg-violet-500/20 text-violet-400"}`
      : "service-pill py-2 rounded-lg text-xs font-bold border transition border-neutral-300 bg-white text-neutral-400 hover:border-neutral-500";
  });
}

document.querySelectorAll(".service-pill").forEach((btn) => {
  btn.addEventListener("click", () => {
    const svc = btn.dataset.service;
    if (selectedServices.has(svc)) selectedServices.delete(svc);
    else selectedServices.add(svc);
    updateServicePillUI();
    const roleVal = document.getElementById("selected-role")?.value;
    const submitBtn = document.getElementById("segment-submit-btn");
    if (submitBtn) submitBtn.disabled = !roleVal || selectedServices.size === 0;
  });
});

// State variables
let volunteerId = null;
let volunteerName = null;
let volunteerTeam = null; // Registered segments (comma-separated)
let currentLogKey = null; // Key for the current ongoing time-in log
let html5QrcodeScanner = null;

// =============================
// Typewriter Effect
// =============================
function typewriterEffect(el, text, speed = 45) {
  el.textContent = "";
  let i = 0;
  function tick() {
    if (i < text.length) {
      el.textContent += text[i];
      i++;
      setTimeout(tick, speed);
    }
  }
  tick();
}

// =============================
// UI Element Selectors
// =============================
const stages = ["scan", "action", "segment", "comms", "timeout", "final", "register", "qr-result", "initial", "guest", "guest-qr", "search-user"];

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

let scannerBusy = false;
const startQrScanner = async () => {
  if (scannerBusy) return;
  scannerBusy = true;

  // Ensure cleanup before starting
  if (html5QrcodeScanner) {
    try {
      const state = html5QrcodeScanner.getState();
      if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
        await html5QrcodeScanner.stop();
      }
    } catch (e) {}
    try { await html5QrcodeScanner.clear(); } catch (e) {}
    html5QrcodeScanner = null;
  }

  // Clear the container
  const scannerArea = document.getElementById("qr-scanner-area");
  if (scannerArea) scannerArea.innerHTML = "";

  const skeleton = document.getElementById("qr-skeleton");
  if (skeleton) skeleton.classList.remove("hidden");
  if (scannerArea) scannerArea.style.opacity = "0";

  try {
    const devices = await Html5Qrcode.getCameras();
    if (!devices || !devices.length) {
      document.getElementById("scan-message").textContent = "No camera found on this device.";
      document.getElementById("scan-message").classList.remove("hidden");
      if (skeleton) skeleton.classList.add("hidden");
      scannerBusy = false;
      return;
    }

    // Create fresh instance right before start
    html5QrcodeScanner = new Html5Qrcode("qr-scanner-area");

    await html5QrcodeScanner.start(
      { facingMode: "user" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      onScanSuccess,
      onScanError
    );

    if (skeleton) skeleton.classList.add("hidden");
    if (scannerArea) {
      scannerArea.style.transition = "opacity 0.4s ease";
      scannerArea.style.opacity = "1";
    }
  } catch (err) {
    if (skeleton) skeleton.classList.add("hidden");
    if (scannerArea) scannerArea.style.opacity = "1";
    document.getElementById("scan-message").textContent = `Error accessing camera: ${err.message || err}`;
    document.getElementById("scan-message").classList.remove("hidden");
    console.error("Camera error:", err);
  }

  scannerBusy = false;
  showStage("scan");
};

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("qr-scanner-area")) {
    startQrScanner();
  }
  if (document.getElementById("stage-initial")) {
    showStage("initial");
  } else if (document.getElementById("stage-scan")) {
  }
});

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
  const validPattern = /^(VOL|GUEST)-\d+-[A-Z0-9]{4,8}$/;
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

    const volunteerData = volunteerSnapshot.val();
    volunteerName = volunteerData.name || "Volunteer";
    volunteerTeam = volunteerData.team || "";
    document.getElementById("volunteer-name").textContent = volunteerName;

    const date = getPHDate(); // YYYY-MM-DD in Philippine time
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

    if (activeLog && activeLog.status === "pending") {
      // Still pending time-in → resume waiting for admin confirmation
      console.log("Volunteer has pending time-in. Resuming pending flow.");
      pendingTimeIn = {
        segment: activeLog.segment,
        role: activeLog.role,
        commsCode: activeLog.commsId !== "NONE" ? activeLog.commsId : null,
        commsId: activeLog.commsId || "NONE",
        pendingKey: activeLogKey,
        timestamp: activeLog.timeIn,
      };

      // Populate the comms/waiting stage
      document.getElementById("comms-volunteer-name").textContent = volunteerName;
      document.getElementById("comms-time-in").textContent = new Date(activeLog.timeIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      document.getElementById("comms-segment-label").textContent = activeLog.segment || "";
      document.getElementById("comms-role-label").textContent = activeLog.role || "";

      if (activeLog.commsId && activeLog.commsId !== "NONE") {
        document.getElementById("assigned-comms-id").textContent = activeLog.commsId;
        document.getElementById("comms-assignment-block").classList.remove("hidden");
        document.getElementById("comms-none-block").classList.add("hidden");
      } else {
        document.getElementById("comms-assignment-block").classList.add("hidden");
        document.getElementById("comms-none-block").classList.remove("hidden");
      }

      hideLoading();
      showStage("comms");
      startPendingListener();

    } else if (activeLog && activeLog.status === "pending-out") {
      // Already pending time-out → resume waiting
      console.log("Volunteer has pending time-out. Resuming pending-out flow.");
      const log = activeLog;
      document.getElementById("timeout-volunteer-name").textContent = volunteerName;
      document.getElementById("timeout-time").textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      document.getElementById("timeout-date").textContent = new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      document.getElementById("timeout-segment-label").textContent = log.segment || "";
      document.getElementById("timeout-role-label").textContent = log.role || "";

      const commsId = log.commsId;
      if (commsId && commsId !== "NONE") {
        document.getElementById("return-comms-id").textContent = commsId;
        document.getElementById("timeout-comms-block").classList.remove("hidden");
      } else {
        document.getElementById("timeout-comms-block").classList.add("hidden");
      }
      const segId = log.numberedId;
      if (segId) {
        document.getElementById("return-seg-id").textContent = "#" + segId;
        document.getElementById("timeout-segid-block").classList.remove("hidden");
      } else {
        document.getElementById("timeout-segid-block").classList.add("hidden");
      }

      hideLoading();
      showStage("timeout");
      startPendingTimeOutListener(date, currentLogKey);

    } else if (activeLog) {
      // Confirmed active (no pending status) → time-out flow
      console.log("Volunteer confirmed active. Auto-routing to Time Out.");
      const logSnapshot2 = await db.ref(`logs/${date}/${currentLogKey}`).once("value");
      const log = logSnapshot2.val();
      document.getElementById("volunteer-name").textContent = volunteerName;
      document.getElementById("timeout-volunteer-name").textContent = volunteerName;
      document.getElementById("timeout-time").textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      document.getElementById("timeout-date").textContent = new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      document.getElementById("timeout-segment-label").textContent = log.segment || "";
      document.getElementById("timeout-role-label").textContent = log.role || "";

      const commsId = log.commsId;
      if (commsId && commsId !== "NONE") {
        document.getElementById("return-comms-id").textContent = commsId;
        document.getElementById("timeout-comms-block").classList.remove("hidden");
      } else {
        document.getElementById("timeout-comms-block").classList.add("hidden");
      }

      const segId = log.numberedId;
      if (segId) {
        document.getElementById("return-seg-id").textContent = "#" + segId;
        document.getElementById("timeout-segid-block").classList.remove("hidden");
      } else {
        document.getElementById("timeout-segid-block").classList.add("hidden");
      }

      // Mark as pending time-out
      await db.ref(`logs/${date}/${currentLogKey}`).update({ status: "pending-out" });

      hideLoading();
      showStage("timeout");
      startPendingTimeOutListener(date, currentLogKey);
    } else {
      // Not clocked in → auto Time In flow (segment selection)
      console.log("Volunteer not clocked in. Auto-routing to Time In."); // DIAGNOSTIC LOG 4
      typewriterEffect(document.getElementById("segment-volunteer-name"), volunteerName);
      document.getElementById("segment-time-in").textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      document.getElementById("segment-date").textContent = new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      // Reset pill state
      document.getElementById("selected-segment").value = "";
      document.getElementById("selected-role").value = "";
      document.getElementById("segment-submit-btn").disabled = true;
      document.getElementById("segment-pills-section").classList.remove("hidden");
      document.getElementById("role-pills-section").classList.add("hidden");
      renderSegmentPills();
      initServicePills();
      // Render volunteer QR code for reference
      renderSegmentQR(volunteerId);
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
if (document.getElementById("time-in-btn")) {
  document.getElementById("time-in-btn").addEventListener("click", () => {
    if (volunteerId) {
      showStage("segment");
    }
  });
}

/**
 * Handles the Time Out button click: proceeds to Comms return check.
 */
if (document.getElementById("time-out-btn")) {
  document.getElementById("time-out-btn").addEventListener("click", async () => {
    if (currentLogKey) {
      const date = getPHDate();
      try {
        const snapshot = await db.ref(`logs/${date}/${currentLogKey}`).once("value");
        const log = snapshot.val();
        document.getElementById("return-comms-id").textContent = log.commsId || "N/A";
        // Mark as pending time-out
        await db.ref(`logs/${date}/${currentLogKey}`).update({ status: "pending-out" });
        showStage("timeout");
        startPendingTimeOutListener(date, currentLogKey);
      } catch (error) {
        console.error("Error retrieving log for time out:", error);
        alert("Could not retrieve active log details. Please try scanning again.");
        startQrScanner();
      }
    }
  });
}

// =============================
// Segment → Role Mapping
// =============================
const segmentRoles = {
  // Camera — A1-A8 (Camera 1-8), B1 (Camera 9), B8 (Camera 10)
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
    "Comms Custodian",
    "Volunteer Care",
    "Volunteer Management",
    "VM Trainee",
  ],
  "Guest": [
    "Guest",
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
  "Guest": { bg: "bg-neutral-50", border: "border-neutral-300", text: "text-neutral-600", pill: "bg-neutral-100 text-neutral-700 border-neutral-300", pillActive: "bg-neutral-700 text-white border-neutral-700 ring-neutral-400", badge: "bg-neutral-600" },
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
// Segment Stage QR Code
// =============================
function renderSegmentQR(volId) {
  const qrOut = document.getElementById("segment-qr-output");
  const qrContainer = document.getElementById("segment-qr-container");
  const toggleArrow = document.getElementById("qr-toggle-arrow");
  const toggleText = document.getElementById("qr-toggle-text");
  // Reset state
  qrOut.innerHTML = "";
  qrContainer.classList.add("hidden");
  toggleArrow.style.transform = "";
  toggleText.textContent = "Show my QR";
  // Generate QR
  new QRCode(qrOut, { text: volId, width: 140, height: 140, colorDark: "#171717", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H });
}

// Toggle listener for segment QR
(function() {
  const btn = document.getElementById("show-my-qr-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const qrContainer = document.getElementById("segment-qr-container");
    const arrow = document.getElementById("qr-toggle-arrow");
    const text = document.getElementById("qr-toggle-text");
    const isHidden = qrContainer.classList.toggle("hidden");
    arrow.style.transform = isHidden ? "" : "rotate(180deg)";
    text.textContent = isHidden ? "Show my QR" : "Hide my QR";
  });
})();

// =============================
// Pill-based Segment & Role Picker
// =============================
// Segment icons (Material Icons Round)
const segmentIcons = {
  "Audio": "headphones",
  "Lights": "light_mode",
  "Camera": "videocam",
  "Stage": "stairs",
  "Graphics": "desktop_windows",
  "Volunteer Management": "group",
  "Guest": "badge",
  "Live Prod Crew": "engineering",
  "Comms": "headset_mic",
};

function renderSegmentPills() {
  const container = document.getElementById("segment-pills");
  container.innerHTML = "";

  const volunteerSegs = Object.keys(segmentRoles).filter((s) => !staffSegments.includes(s));
  const staffSegs = Object.keys(segmentRoles).filter((s) => staffSegments.includes(s));

  // Parse registered segments for hint styling
  const registeredSegs = volunteerTeam
    ? volunteerTeam.split(",").map((s) => s.trim().toLowerCase())
    : [];

  function isRegistered(seg) {
    return registeredSegs.some((r) => r === seg.toLowerCase() || seg.toLowerCase().includes(r) || r.includes(seg.toLowerCase()));
  }

  let idx = 0;

  // Volunteer segments
  volunteerSegs.forEach((seg) => {
    const pill = document.createElement("button");
    pill.type = "button";
    const hint = isRegistered(seg);
    if (hint) {
      pill.innerHTML = `${seg} <span class="text-[10px] opacity-60">★</span>`;
      pill.className =
        "inline-flex items-center gap-1 px-4 py-2 rounded-full text-sm font-medium border-2 border-neutral-800 bg-neutral-50 text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 transition duration-150";
    } else {
      pill.textContent = seg;
      pill.className =
        "px-4 py-2 rounded-full text-sm font-medium border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 transition duration-150";
    }
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
    const hint = isRegistered(seg);
    if (hint) {
      pill.innerHTML = `${seg} <span class="text-[10px] opacity-60">★</span>`;
      pill.className =
        "inline-flex items-center gap-1 px-4 py-2 rounded-full text-sm font-medium border-2 border-white bg-neutral-900 text-white hover:bg-neutral-700 transition duration-150 ring-2 ring-neutral-400";
    } else {
      pill.textContent = seg;
      pill.className =
        "px-4 py-2 rounded-full text-sm font-medium border border-neutral-300 bg-neutral-900 text-white hover:bg-neutral-700 transition duration-150";
    }
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

  // 2. Build roles
  const leaderKeywords = ["Director", "Lead", "Mentor", "Head", "Manager", "Trainee", "Observer"];
  const segRoles = [...segmentRoles[segment]];
  const regularRoles = segRoles.filter((r) => !leaderKeywords.some((k) => r.includes(k)));
  const leaderRoles = segRoles.filter((r) => leaderKeywords.some((k) => r.includes(k)));
  // Add generic "(Volunteer)" role unless segment is "Guest"
  const volunteerRole = `${segment} (Volunteer)`;
  const allRoles = segment === "Guest"
    ? [...regularRoles, ...leaderRoles]
    : [...regularRoles, ...leaderRoles, volunteerRole];

  // Sort: roles with comms codes first, "(Volunteer)" catch-all last
  allRoles.sort((a, b) => {
    const aIsVol = a.endsWith("(Volunteer)");
    const bIsVol = b.endsWith("(Volunteer)");
    if (aIsVol && !bIsVol) return 1;
    if (!aIsVol && bIsVol) return -1;
    const aHasComms = !!roleToComms[a];
    const bHasComms = !!roleToComms[b];
    if (aHasComms && !bHasComms) return -1;
    if (!aHasComms && bHasComms) return 1;
    return 0;
  });

  // If only 1 role, auto-select it and skip role picker
  if (allRoles.length === 1) {
    document.getElementById("selected-role").value = allRoles[0];
    document.getElementById("segment-submit-btn").disabled = false;
    // Show change button row but hide "— SELECT ROLE" text
    document.getElementById("role-pills-section").classList.remove("hidden");
    container.innerHTML = `
      <div class="text-center py-4">
        <span class="material-icons-round text-3xl text-neutral-300 mb-1">waving_hand</span>
        <p class="text-sm font-medium text-neutral-700">Welcome to Live Production</p>
        <p class="text-xs text-neutral-400 mt-0.5">Tap next to get your check-in confirmed</p>
      </div>`;
    // Update header to just show segment without "— SELECT ROLE"
    document.querySelector("#role-pills-section .flex.items-center.justify-between p").innerHTML =
      `<span class="text-neutral-800">${segment}</span>`;
    return;
  }
  const rowMap = {}; // role -> row element, for later disable

  const hasAnyComms = allRoles.some((r) => !!roleToComms[r]);
  let sectionDividerInserted = false;

  // "Priority" label above comms roles
  if (hasAnyComms) {
    const priorityLabel = document.createElement("div");
    priorityLabel.className = "w-full pb-0.5";
    priorityLabel.innerHTML = '<p class="text-[10px] uppercase tracking-widest text-teal-600 font-semibold">Roles with Comms</p>';
    container.appendChild(priorityLabel);
  }

  allRoles.forEach((role, pillIdx) => {
    const isVolunteerRole = role.endsWith("(Volunteer)");
    const hasComms = !!roleToComms[role];

    // Insert divider between comms and non-comms sections
    if (hasAnyComms && !hasComms && !isVolunteerRole && !sectionDividerInserted) {
      sectionDividerInserted = true;
      const divider = document.createElement("div");
      divider.className = "w-full pt-1 pb-0.5";
      divider.innerHTML = '<p class="text-[10px] uppercase tracking-widest text-neutral-400 font-semibold">Other Roles</p>';
      container.appendChild(divider);
    }

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
  const date = getPHDate();
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

      // Handle taken rows (except unlimited ones)
      Object.entries(takenMap).forEach(([role, info]) => {
        const row = rowMap[role];
        if (!row) return;
        const isUnlimited = role.endsWith("(Volunteer)") || /trainee|observer/i.test(role) || /technical director/i.test(role);
        if (isUnlimited) return;

        const takenCommsCode = roleToComms[role];
        const timeStr = new Date(info.timeIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (takenCommsCode) {
          // Comms role — allow queuing, keep enabled
          const commsBadge = `<span class="text-xs font-mono font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">${takenCommsCode}</span>`;
          row.className = "w-full text-left px-3 py-2.5 rounded-lg text-sm border border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-400 hover:bg-amber-100 transition duration-150";
          row.dataset.defaultClass = row.className;
          row.innerHTML = `
            <span class="flex items-center gap-2 w-full">
              <span class="material-icons-round text-base text-amber-500">hourglass_top</span>
              <span class="flex-1">
                <span class="font-medium">${role}</span>
                <span class="block text-xs text-amber-600 mt-0.5">${info.name} serving — tap to queue for auto-assign</span>
              </span>
              ${commsBadge}
            </span>`;
        } else {
          // Non-comms role — keep disabled
          row.disabled = true;
          row.className = "w-full text-left px-3 py-2.5 rounded-lg text-sm border border-green-100 bg-green-50 text-green-700 cursor-default transition duration-150";
          row.dataset.defaultClass = row.className;
          row.innerHTML = `
            <span class="flex items-center gap-2 w-full">
              <span class="material-icons-round text-base text-green-400">check_circle</span>
              <span class="flex-1">
                <span class="font-medium">${role}</span>
                <span class="block text-xs text-green-500 mt-0.5">${info.name} is serving since ${timeStr}</span>
              </span>
            </span>`;
        }
        // Move to bottom of list
        container.appendChild(row);
      });
    }
  } catch (e) {
    console.log("Could not fetch taken roles:", e);
  }
}

function selectRole(selectedRow, role) {
  document.getElementById("selected-role").value = role;
  document.getElementById("segment-submit-btn").disabled = selectedServices.size === 0;

  // Reset all rows, highlight selected
  const allRows = document.getElementById("role-pills").querySelectorAll("button");
  allRows.forEach((r) => {
    if (r.disabled) return; // skip taken/serving rows
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

// Role scroll mask (fades edges based on scroll position)
(function() {
  const el = document.getElementById("role-pills");
  if (!el) return;

  function updateMask() {
    const { scrollTop, scrollHeight, clientHeight } = el;
    const canScrollUp = scrollTop > 2;
    const canScrollDown = scrollTop + clientHeight < scrollHeight - 2;

    if (canScrollUp && canScrollDown) {
      el.style.maskImage = "linear-gradient(to bottom, transparent, black 24px, black calc(100% - 24px), transparent)";
    } else if (canScrollUp) {
      el.style.maskImage = "linear-gradient(to bottom, transparent, black 24px)";
    } else if (canScrollDown) {
      el.style.maskImage = "linear-gradient(to bottom, black calc(100% - 24px), transparent)";
    } else {
      el.style.maskImage = "none";
    }
  }

  el.addEventListener("scroll", updateMask);
  new MutationObserver(() => requestAnimationFrame(updateMask)).observe(el, { childList: true });
})();

// "Change segment" link
if (document.getElementById("change-segment-btn")) {
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
}

/**
 * Handles the Segment Form submission (Stage 3 -> Stage 4).
 * Only prepares the UI — no Firebase write yet.
 */
// Store pending time-in data
let pendingTimeIn = null;

if (document.getElementById("segment-form")) {
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
      const date = getPHDate();
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
        status: "pending",
        services: [...selectedServices],
      });

      // Update UI only
      document.getElementById("comms-volunteer-name").textContent = volunteerName;
      document.getElementById("comms-time-in").textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      document.getElementById("comms-segment-label").textContent = segment;
      document.getElementById("comms-role-label").textContent = role;
      document.getElementById("numbered-id-input").value = "";

      // Check if comms is currently in use by someone else
      let commsOccupied = false;
      if (commsCode) {
        const commsSnap = await db.ref(`comms/${commsCode}`).once("value");
        const commsData = commsSnap.val();
        commsOccupied = !!(commsData && commsData.status === "assigned" && commsData.assignedTo !== volunteerId);
      }

      const commsQueuedBlock = document.getElementById("comms-queued-block");
      if (commsCode) {
        document.getElementById("assigned-comms-id").textContent = commsCode;
        document.getElementById("comms-assignment-block").classList.remove("hidden");
        document.getElementById("comms-none-block").classList.add("hidden");
        if (commsQueuedBlock) commsQueuedBlock.classList.toggle("hidden", !commsOccupied);
      } else {
        document.getElementById("comms-assignment-block").classList.add("hidden");
        document.getElementById("comms-none-block").classList.remove("hidden");
        if (commsQueuedBlock) commsQueuedBlock.classList.add("hidden");
      }

      showStage("comms");
      startPendingListener();
    });
}

/**
 * Handles Comms Received Confirmation (Stage 4 -> Stage 6).
 * This button completes the Time In process from the volunteer's perspective.
 */
// Go back from comms to segment selection
if (document.getElementById("comms-go-back-btn")) {
  document.getElementById("comms-go-back-btn").addEventListener("click", async () => {
    // Stop listening for admin confirmation
    if (pendingListener) { pendingListener.off(); pendingListener = null; }
    // Remove pending record from Firebase
    if (pendingTimeIn && pendingTimeIn.pendingKey) {
      const date = pendingTimeIn.timestamp.slice(0, 10);
      await db.ref(`logs/${date}/${pendingTimeIn.pendingKey}`).remove().catch(() => {});
    }
    pendingTimeIn = null;
    currentLogKey = null;
    // Re-populate segment stage
    document.getElementById("segment-volunteer-name").textContent = volunteerName || "";
    document.getElementById("segment-time-in").textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    document.getElementById("segment-date").textContent = new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    document.getElementById("selected-segment").value = "";
    document.getElementById("selected-role").value = "";
    document.getElementById("segment-submit-btn").disabled = true;
    document.getElementById("segment-pills-section").classList.remove("hidden");
    document.getElementById("role-pills-section").classList.add("hidden");
    renderSegmentPills();
    showStage("segment");
  });
}

// Listen for admin confirmation of pending time-in
let pendingListener = null;

function startPendingListener() {
  if (!pendingTimeIn) return;
  const { pendingKey, timestamp, commsCode } = pendingTimeIn;
  const date = timestamp.slice(0, 10);
  const ref = db.ref(`logs/${date}/${pendingKey}`);

  // Clean up any previous listener
  if (pendingListener) { pendingListener.off(); pendingListener = null; }

  pendingListener = ref;
  ref.on("value", (snap) => {
    const data = snap.val();
    if (!data) {
      // Record was deleted (admin cancelled) — go back to scan
      ref.off();
      pendingListener = null;
      pendingTimeIn = null;
      showStage("scan");
      startQrScanner();
      return;
    }
    // Admin confirmed: status is removed (null/undefined)
    if (data.status !== "pending") {
      ref.off();
      pendingListener = null;

      const commsText = document.getElementById("assigned-comms-id").textContent || "—";
      const timeText = document.getElementById("comms-time-in").textContent;
      const numberedId = data.numberedId || "";

      currentLogKey = pendingKey;
      pendingTimeIn = null;

      // Populate final page
      document.getElementById("final-type-badge").textContent = "Timed In";
      document.getElementById("final-type-badge").className = "inline-block bg-green-600 text-white text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-3";
      document.getElementById("final-volunteer-name").textContent = volunteerName;
      document.getElementById("final-time-label").textContent = timeText;
      document.getElementById("final-date-label").textContent = new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      document.getElementById("final-comms-code").textContent = commsText;
      // Show No ID notice or normal message
      const noIdNotice = document.getElementById("final-noid-notice");
      if (data.noId) {
        document.getElementById("final-message").textContent = "";
        if (noIdNotice) noIdNotice.classList.remove("hidden");
      } else {
        document.getElementById("final-message").textContent = "Do your best for God as you serve. God bless!";
        if (noIdNotice) noIdNotice.classList.add("hidden");
      }

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

      showStage("final");
      startFinalCountdown();
    }
  });
}

/**
 * Listen for admin confirmation of pending time-out.
 * When admin confirms, the log gets timeOut set and status removed.
 */
let pendingTimeOutListener = null;

function startPendingTimeOutListener(date, logKey) {
  const ref = db.ref(`logs/${date}/${logKey}`);

  // Clean up any previous listener
  if (pendingTimeOutListener) { pendingTimeOutListener.off(); pendingTimeOutListener = null; }

  pendingTimeOutListener = ref;
  ref.on("value", (snap) => {
    const data = snap.val();
    if (!data) {
      // Record was deleted — go back to scan
      ref.off();
      pendingTimeOutListener = null;
      showStage("scan");
      startQrScanner();
      return;
    }
    // Admin confirmed: status is no longer "pending-out" and timeOut is set
    if (data.status !== "pending-out" && data.timeOut) {
      ref.off();
      pendingTimeOutListener = null;

      // Show final page
      document.getElementById("final-type-badge").textContent = "Timed Out";
      document.getElementById("final-type-badge").className = "inline-block bg-red-600 text-white text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-3";
      document.getElementById("final-volunteer-name").textContent = volunteerName;
      document.getElementById("final-time-label").textContent = new Date(data.timeOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      document.getElementById("final-date-label").textContent = new Date(data.timeOut).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      document.getElementById("final-comms-block").classList.add("hidden");
      document.getElementById("final-segid-block").classList.add("hidden");
      document.getElementById("final-message").textContent = "Thank you for serving the Lord!";
      showStage("final");
      startFinalCountdown();
    }

    // Admin cancelled: status cleared but no timeOut — volunteer is still active
    if (data.status !== "pending-out" && !data.timeOut) {
      ref.off();
      pendingTimeOutListener = null;

      const waitingBlock = document.getElementById("timeout-waiting-block");
      const cancelNotice = document.getElementById("timeout-cancel-notice");
      if (waitingBlock) waitingBlock.classList.add("hidden");
      if (cancelNotice) cancelNotice.classList.remove("hidden");

      function goBackToAction() {
        if (cancelNotice) cancelNotice.classList.add("hidden");
        if (waitingBlock) waitingBlock.classList.remove("hidden");
        document.getElementById("volunteer-name").textContent = volunteerName;
        document.getElementById("time-in-btn").disabled = true;
        document.getElementById("time-out-btn").disabled = false;
        showStage("action");
      }

      const okBtn = document.getElementById("timeout-cancel-ok-btn");
      if (okBtn) {
        const handler = () => { okBtn.removeEventListener("click", handler); goBackToAction(); };
        okBtn.addEventListener("click", handler);
      }
      setTimeout(goBackToAction, 8000);
    }
  });
}

// Volunteer-initiated cancel of pending time-out
if (document.getElementById("timeout-self-cancel-btn")) {
  document.getElementById("timeout-self-cancel-btn").addEventListener("click", async () => {
    const date = getPHDate();
    const logKey = currentLogKey;
    if (!logKey) { startQrScanner(); return; }

    if (pendingTimeOutListener) { pendingTimeOutListener.off(); pendingTimeOutListener = null; }

    try {
      await db.ref(`logs/${date}/${logKey}`).update({ status: null });
    } catch (e) {
      console.error("Failed to cancel time-out:", e);
    }

    volunteerId = null;
    volunteerName = null;
    currentLogKey = null;
    startQrScanner();
  });
}

/**
 * Resets the application state to restart scanning.
 */
if (document.getElementById("reset-scan-btn")) {
  document.getElementById("reset-scan-btn").addEventListener("click", () => {
    volunteerId = null;
    volunteerName = null;
    currentLogKey = null;
    commsStatusOut = null;
    commsIdToReturn = null;
    startQrScanner();
  });
}

// =============================
// Quick Name Check-in
// =============================
(function() {
  const input = document.getElementById("quick-name-input");
  const results = document.getElementById("quick-name-results");
  const resultsInner = document.getElementById("quick-name-results-inner");
  const status = document.getElementById("quick-name-status");
  const goBtn = document.getElementById("quick-name-go-btn");
  const clearBtn = document.getElementById("quick-name-clear");
  if (!input) return;

  // Title case helper
  function toTitleCase(str) {
    return str.replace(/\b\w/g, c => c.toUpperCase());
  }

  // Auto-capitalize on blur (so the actual value is title-cased for registration)
  input.addEventListener("blur", () => {
    if (input.value.trim()) {
      const pos = input.selectionStart;
      input.value = toTitleCase(input.value);
    }
  });

  // Show/hide clear button based on input content
  input.addEventListener("input", () => { clearBtn.classList.toggle("hidden", !input.value); });
  clearBtn.addEventListener("click", () => {
    input.value = "";
    clearBtn.classList.add("hidden");
    input.dispatchEvent(new Event("input"));
    input.focus();
  });

  function updateResultsHeight() {
    const inner = resultsInner;
    const targetH = inner.scrollHeight;
    if (targetH > 0) {
      results.style.height = targetH + "px";
      results.style.opacity = "1";
      results.style.borderColor = "";
    } else {
      results.style.height = "0px";
      results.style.opacity = "0";
      results.style.borderColor = "transparent";
    }
  }
  function showResults() { requestAnimationFrame(updateResultsHeight); }
  function hideResults() {
    results.style.height = "0px";
    results.style.opacity = "0";
    results.style.borderColor = "transparent";
  }
  // Start collapsed
  hideResults();

  const segContainer = document.getElementById("quick-reg-segments");
  const segPills = document.getElementById("quick-seg-pills");
  const quickSegList = ["Audio", "Lights", "Camera", "Stage", "Graphics", "Volunteer Management", "Guest"];
  let quickSelectedSegs = new Set();

  let allVols = [];
  const selectedPill = document.getElementById("quick-selected-pill");
  const pillName = document.getElementById("quick-pill-name");
  const pillRemove = document.getElementById("quick-pill-remove");

  let selectedVolId = null;
  let isNewUser = false;

  function showPill(name) {
    pillName.textContent = name;
    selectedPill.classList.remove("hidden");
    input.classList.add("invisible");
    clearBtn.classList.add("hidden");
    pillShownAt = Date.now();
  }

  function hidePill() {
    selectedPill.classList.add("hidden");
    input.classList.remove("invisible");
    input.value = "";
    // Reset input to search mode
    input.placeholder = "Search or enter your name";
    input.classList.add("bg-neutral-50");
    input.classList.remove("bg-white", "border-neutral-900");
    document.getElementById("quick-search-icon").textContent = "search";
    document.getElementById("quick-input-label").classList.add("hidden");
    document.getElementById("quick-reg-header").classList.add("hidden");
    clearBtn.classList.add("hidden");
    selectedVolId = null;
    isNewUser = false;
    goBtn.classList.add("hidden");
    status.classList.add("hidden");
    showSegPicker(false);
    hideResults();
    expandScanner();
    input.focus();
  }

  pillRemove.addEventListener("click", hidePill);

  // Expose reset for external use (logo click)
  window.resetQuickName = hidePill;

  // Track when pill was just shown to prevent immediate Enter submit
  let pillShownAt = 0;

  // Enter key when pill is shown → trigger Continue (with guard)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !selectedPill.classList.contains("hidden") && !goBtn.classList.contains("hidden") && !goBtn.disabled) {
      if (Date.now() - pillShownAt < 300) return; // guard against same-keypress double-fire
      e.preventDefault();
      goBtn.click();
    }
  });

  function renderQuickSegPills() {
    segPills.innerHTML = "";
    quickSegList.forEach(seg => {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.textContent = seg;
      const isActive = quickSelectedSegs.has(seg);
      pill.className = isActive
        ? "px-3 py-1.5 rounded-full text-xs font-semibold bg-neutral-900 text-white border border-neutral-900 transition"
        : "px-3 py-1.5 rounded-full text-xs font-medium bg-white text-neutral-600 border border-neutral-300 hover:border-neutral-500 transition";
      pill.addEventListener("click", () => {
        if (quickSelectedSegs.has(seg)) quickSelectedSegs.delete(seg);
        else quickSelectedSegs.add(seg);
        renderQuickSegPills();
        goBtn.disabled = quickSelectedSegs.size === 0;
      });
      segPills.appendChild(pill);
    });
  }

  function showSegPicker(show) {
    if (show) {
      quickSelectedSegs.clear();
      segContainer.classList.remove("hidden");
      renderQuickSegPills();
      goBtn.disabled = true;
    } else {
      segContainer.classList.add("hidden");
      goBtn.disabled = false;
    }
  }

  // Minimize/restore scanner based on input state
  const scannerWrapper = document.getElementById("qr-scanner-wrapper");
  const showScannerBtn = document.getElementById("show-scanner-btn");

  function collapseScanner() {
    if (!scannerWrapper) return;
    scannerWrapper.style.height = "0px";
    scannerWrapper.style.opacity = "0";
    scannerWrapper.style.marginBottom = "0";
    if (showScannerBtn && !isNewUser) showScannerBtn.classList.remove("hidden");
    // Pause scanning while typing (don't stop — avoids restart race conditions)
    if (html5QrcodeScanner) {
      try { html5QrcodeScanner.pause(true); } catch (e) {}
    }
  }

  function expandScanner() {
    if (!scannerWrapper) return;
    scannerWrapper.style.height = "16rem";
    scannerWrapper.style.opacity = "1";
    scannerWrapper.style.marginBottom = "";
    if (showScannerBtn) showScannerBtn.classList.add("hidden");
    // Resume scanning
    if (html5QrcodeScanner) {
      try { html5QrcodeScanner.resume(); } catch (e) { startQrScanner(); }
    } else {
      startQrScanner();
    }
  }

  // Keyboard navigation for search results
  let activeIndex = -1;

  function updateActiveItem() {
    const items = resultsInner.querySelectorAll("button");
    items.forEach((item, i) => {
      if (i === activeIndex) {
        item.classList.add("bg-neutral-200");
        item.scrollIntoView({ block: "nearest" });
      } else {
        item.classList.remove("bg-neutral-200");
      }
    });
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const items = resultsInner.querySelectorAll("button");
      if (activeIndex >= 0 && activeIndex < items.length) {
        items[activeIndex].click();
      } else if (!goBtn.classList.contains("hidden") && !goBtn.disabled) {
        goBtn.click();
      }
      return;
    }

    const items = resultsInner.querySelectorAll("button");
    if (!items.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = activeIndex < items.length - 1 ? activeIndex + 1 : 0;
      updateActiveItem();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = activeIndex > 0 ? activeIndex - 1 : items.length - 1;
      updateActiveItem();
    }
  });

  // Reset active index when results change
  const origShowResults = showResults;
  showResults = function() {
    activeIndex = -1;
    origShowResults();
  };

  input.addEventListener("focus", () => {
    if (!isNewUser) collapseScanner();
  });

  input.addEventListener("blur", () => {
    setTimeout(() => {
      if (!input.value.trim() && !selectedVolId && !isNewUser) expandScanner();
    }, 200);
  });

  // "Scan QR instead" button
  if (showScannerBtn) {
    showScannerBtn.addEventListener("click", () => {
      hidePill();
      input.value = "";
      clearBtn.classList.add("hidden");
      selectedVolId = null;
      isNewUser = false;
      goBtn.classList.add("hidden");
      status.classList.add("hidden");
      showSegPicker(false);
      hideResults();
      expandScanner();
      input.blur();
    });
  }

  // Load all volunteers for matching
  db.ref("volunteers").once("value", (snap) => {
    const data = snap.val() || {};
    allVols = Object.entries(data).map(([id, v]) => ({ id, name: v.name || "", type: v.type || "volunteer", team: v.team || "" }));
  });

  function selectNewUser() {
    selectedVolId = null;
    isNewUser = true;
    hideResults();
    // Switch input to "name entry" mode
    input.value = toTitleCase(input.value.trim());
    input.placeholder = "e.g., Juan Dela Cruz";
    input.classList.remove("bg-neutral-50");
    input.classList.add("bg-white", "border-neutral-900");
    document.getElementById("quick-search-icon").textContent = "person";
    document.getElementById("quick-input-label").classList.remove("hidden");
    document.getElementById("quick-reg-header").classList.remove("hidden");
    clearBtn.classList.add("hidden");
    if (showScannerBtn) showScannerBtn.classList.add("hidden");
    status.classList.add("hidden");
    showSegPicker(true);
    goBtn.textContent = "Register & Continue";
    goBtn.classList.remove("hidden");
  }

  function selectExisting(v) {
    input.value = v.name;
    selectedVolId = v.id;
    isNewUser = false;
    hideResults();
    showPill(v.name);
    status.classList.add("hidden");
    showSegPicker(false);
    goBtn.textContent = "Continue";
    goBtn.classList.remove("hidden");
  }

  input.addEventListener("input", () => {
    // If in new-user name entry mode, don't trigger search
    if (isNewUser) return;

    const query = input.value.trim().toLowerCase();
    selectedVolId = null;
    goBtn.classList.add("hidden");
    status.classList.add("hidden");
    showSegPicker(false);
    resultsInner.innerHTML = "";

    if (query.length < 2) {
      hideResults();
      if (!query) expandScanner();
      return;
    }

    collapseScanner();
    const matches = allVols.filter(v => v.name.toLowerCase().includes(query)).slice(0, 5);

    if (matches.length > 0) {
      matches.forEach(v => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "w-full text-left px-4 py-3 hover:bg-neutral-200 active:bg-neutral-300 transition-colors text-sm flex items-center gap-3 border-b border-neutral-100 last:border-0";
        const segPills = v.team ? v.team.split(",").map(s => {
          const seg = s.trim();
          const icon = segmentIcons[seg] || "";
          return `<span class="inline-flex items-center gap-0.5 text-[10px] font-medium bg-neutral-100 text-neutral-500 px-1.5 py-0.5 rounded">${icon ? `<span class="material-icons-round" style="font-size:10px">${icon}</span>` : ""}${seg}</span>`;
        }).join("") : "";
        item.innerHTML = `
          <span class="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center flex-shrink-0">
            <span class="material-icons-round text-neutral-400 text-sm">person</span>
          </span>
          <span class="flex flex-col min-w-0">
            <span class="font-medium text-neutral-800">${v.name}</span>
            ${segPills ? `<span class="flex flex-wrap gap-1 mt-0.5">${segPills}</span>` : ""}
          </span>`;
        item.addEventListener("click", () => selectExisting(v));
        resultsInner.appendChild(item);
      });

      // "Not me" / create new option
      const createOpt = document.createElement("button");
      createOpt.type = "button";
      createOpt.className = "w-full text-left px-4 py-3 hover:bg-neutral-200 active:bg-neutral-300 transition-colors text-sm flex items-center gap-3 border-t border-neutral-200 text-neutral-500";
      createOpt.innerHTML = `
        <span class="w-8 h-8 rounded-full bg-neutral-900 flex items-center justify-center flex-shrink-0">
          <span class="material-icons-round text-white text-sm">person_add</span>
        </span>
        <span>I'm not listed — register as <strong class="text-neutral-800">${toTitleCase(input.value.trim())}</strong></span>`;
      createOpt.addEventListener("click", selectNewUser);
      resultsInner.appendChild(createOpt);
    } else {
      // No matches — show create option directly
      const empty = document.createElement("div");
      empty.className = "px-4 py-5 text-center";
      empty.innerHTML = `
        <p class="text-sm text-neutral-400 mb-3">No one named "<strong class="text-neutral-600">${toTitleCase(input.value.trim())}</strong>" found</p>
        <button type="button" class="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white text-sm font-semibold rounded-lg hover:bg-neutral-700 transition" id="quick-create-inline">
          <span class="material-icons-round text-sm">person_add</span>
          Register as new volunteer
        </button>`;
      resultsInner.appendChild(empty);
      document.getElementById("quick-create-inline").addEventListener("click", selectNewUser);
    }

    // Animate to new content height after DOM is updated
    showResults();
  });

  // Close results when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#quick-name-input") && !e.target.closest("#quick-name-results")) {
      hideResults();
    }
  });

  goBtn.addEventListener("click", async () => {
    const name = toTitleCase(input.value.trim());
    if (!name) return;

    showLoading("Processing...");

    if (selectedVolId) {
      // Existing volunteer — proceed to scan flow
      if (html5QrcodeScanner) {
        try {
          const state = html5QrcodeScanner.getState();
          if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
            await html5QrcodeScanner.stop();
          }
          await html5QrcodeScanner.clear();
        } catch (e) {}
      }
      handleVolunteerScan(selectedVolId);
    } else if (isNewUser) {
      // Auto-register new volunteer with selected segments
      const team = [...quickSelectedSegs].join(", ");
      const newId = `VOL-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      await db.ref(`volunteers/${newId}`).set({
        name: name,
        type: "volunteer",
        team: team || null,
        contact: null,
        registeredAt: new Date().toISOString(),
      });
      // Add to local list
      allVols.push({ id: newId, name, type: "volunteer" });
      // Proceed
      if (html5QrcodeScanner) {
        try {
          const state = html5QrcodeScanner.getState();
          if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
            await html5QrcodeScanner.stop();
          }
          await html5QrcodeScanner.clear();
        } catch (e) {}
      }
      handleVolunteerScan(newId);
    }

    // Reset
    input.value = "";
    selectedVolId = null;
    isNewUser = false;
    goBtn.classList.add("hidden");
    status.classList.add("hidden");
  });
})();

// Header logo click → back to scan
if (document.getElementById("header-home-btn")) {
  document.getElementById("header-home-btn").addEventListener("click", async () => {
    // If already on scan stage with camera visible and no active session, do nothing
    const scanStage = document.getElementById("stage-scan");
    const scannerWrap = document.getElementById("qr-scanner-wrapper");
    const scannerVisible = scannerWrap && parseFloat(scannerWrap.style.opacity || "1") > 0;
    if (scanStage && !scanStage.classList.contains("hidden") && !volunteerId && scannerVisible) return;

    volunteerId = null;
    volunteerName = null;
    volunteerTeam = null;
    currentLogKey = null;
    if (pendingTimeOutListener) { pendingTimeOutListener.off(); pendingTimeOutListener = null; }
    if (pendingListener) { pendingListener.off(); pendingListener = null; }
    pendingTimeIn = null;

    // Reset quick-name registration state (resets DOM + internal variables)
    if (window.resetQuickName) window.resetQuickName();

    // Stop existing scanner before restarting
    if (html5QrcodeScanner) {
      try {
        const state = html5QrcodeScanner.getState();
        if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
          await html5QrcodeScanner.stop();
        }
        await html5QrcodeScanner.clear();
      } catch (e) {}
      html5QrcodeScanner = null;
    }

    showStage("scan");
    startQrScanner();
  });
}

// =============================
// Registration / Guest Check-in Logic
// =============================

/**
 * Opens the registration form for volunteers or guests.
 * @param {string} type - "volunteer" or "guest"
 */


if (document.getElementById("register-back-btn")) {
  document.getElementById("register-back-btn").addEventListener("click", () => {
    hideAllStages();
    if (document.getElementById("stage-initial")) {
      showStage("initial");
    } else {
      showStage("scan");
    }
  });
}

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

if (document.getElementById("register-name")) {
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
}

if (document.getElementById("register-name")) {
  document.getElementById("register-name").addEventListener("blur", () => {
    setTimeout(() => document.getElementById("name-suggestions").classList.add("hidden"), 200);
  });
}

/**
 * Handles registration form submission.
 * Generates a unique ID, saves to Firebase, and shows the QR code.
 */
if (document.getElementById("register-form")) {
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
}

/**
 * Proceed to scan the newly generated QR.
 */
if (document.getElementById("qr-proceed-scan-btn")) {
  document
    .getElementById("qr-proceed-scan-btn")
    .addEventListener("click", () => {
      if (document.getElementById("stage-initial")) {
        window.location.href = "index.html";
      } else {
        startQrScanner();
      }
    });
}

if (document.getElementById("qr-done-btn")) {
  document.getElementById("qr-done-btn").addEventListener("click", () => {
    if (document.getElementById("stage-initial")) {
      showStage("initial");
    } else {
      startQrScanner();
    }
  });
}

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

if (document.getElementById("final-new-scan-btn")) {
  document.getElementById("final-new-scan-btn").addEventListener("click", () => {
    stopFinalCountdown();
    window.location.reload();
  });
}

// =============================
// Guest Check-in (inline in index.html)
// =============================
if (document.getElementById("open-guest-btn")) {
  document.getElementById("open-guest-btn").addEventListener("click", async () => {
    if (html5QrcodeScanner) {
      try {
        const state = html5QrcodeScanner.getState();
        if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
          await html5QrcodeScanner.stop();
        }
        await html5QrcodeScanner.clear();
      } catch (e) {}
    }
    showStage("guest");
  });
}

if (document.getElementById("guest-back-btn")) {
  document.getElementById("guest-back-btn").addEventListener("click", () => startQrScanner());
}

if (document.getElementById("guest-form")) {
  document.getElementById("guest-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("guest-name").value.trim();
    const contact = document.getElementById("guest-contact").value.trim();
    if (!name) return;

    showLoading("Registering guest...");
    const newId = `GUEST-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    try {
      await db.ref(`volunteers/${newId}`).set({
        name, type: "guest", registeredAt: new Date().toISOString(),
        ...(contact ? { contact } : {}),
      });

      document.getElementById("guest-qr-name").textContent = name;
      document.getElementById("guest-qr-id").textContent = `ID: ${newId}`;
      const qrContainer = document.getElementById("guest-qr-output");
      qrContainer.innerHTML = "";
      new QRCode(qrContainer, { text: newId, width: 200, height: 200, colorDark: "#000000", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H });

      hideLoading();
      showStage("guest-qr");
    } catch (error) {
      hideLoading();
      alert("Registration failed. Please try again.");
    }
  });
}

if (document.getElementById("guest-proceed-scan-btn")) {
  document.getElementById("guest-proceed-scan-btn").addEventListener("click", () => startQrScanner());
}
if (document.getElementById("guest-back-to-scan-btn")) {
  document.getElementById("guest-back-to-scan-btn").addEventListener("click", () => startQrScanner());
}

// =============================
// Search User (forgot QR)
// =============================
if (document.getElementById("open-search-btn")) {
  document.getElementById("open-search-btn").addEventListener("click", async () => {
    if (html5QrcodeScanner) {
      try {
        const state = html5QrcodeScanner.getState();
        if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
          await html5QrcodeScanner.stop();
        }
        await html5QrcodeScanner.clear();
      } catch (e) {}
    }
    // Load volunteers for search
    try {
      const snap = await db.ref("volunteers").once("value");
      const data = snap.val() || {};
      window._searchVolunteers = Object.entries(data).map(([id, v]) => ({ id, name: v.name || "", team: v.team || "" }));
    } catch (e) {
      window._searchVolunteers = [];
    }
    document.getElementById("search-user-input").value = "";
    document.getElementById("search-results").innerHTML = "";
    showStage("search-user");
  });
}

if (document.getElementById("search-back-btn")) {
  document.getElementById("search-back-btn").addEventListener("click", () => startQrScanner());
}

if (document.getElementById("search-user-input")) {
  document.getElementById("search-user-input").addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    const resultsEl = document.getElementById("search-results");
    resultsEl.innerHTML = "";
    if (query.length < 2) return;

    const matches = (window._searchVolunteers || []).filter((v) =>
      v.name.toLowerCase().includes(query)
    ).slice(0, 10);

    if (matches.length === 0) {
      resultsEl.innerHTML = '<p class="text-sm text-neutral-400 text-center py-4">No volunteers found.</p>';
      return;
    }

    matches.forEach((v) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "w-full text-left px-3 py-3 rounded-lg border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-400 transition duration-150 flex items-center justify-between";
      row.innerHTML = `
        <div>
          <span class="font-semibold text-neutral-800">${v.name}</span>
          ${v.team ? `<span class="text-xs text-neutral-400 ml-2">${v.team}</span>` : ""}
        </div>
        <span class="material-icons-round text-neutral-400 text-base">arrow_forward</span>
      `;
      row.addEventListener("click", () => {
        // Simulate scanning this volunteer's QR
        showLoading("Looking up volunteer...");
        handleVolunteerScan(v.id);
      });
      resultsEl.appendChild(row);
    });
  });
}
