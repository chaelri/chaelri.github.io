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
const stages = ["scan", "action", "segment", "comms", "timeout", "final"];

function showStage(stageName) {
  stages.forEach((stage) => {
    const element = document.getElementById(`stage-${stage}`);
    if (element) {
      element.classList.add("hidden");
    }
  });
  const targetElement = document.getElementById(`stage-${stageName}`);
  if (targetElement) {
    targetElement.classList.remove("hidden");
  }
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

  // Stop the scanner and process the ID
  if (html5QrcodeScanner) {
    // Pausing is sometimes quicker and prevents issues with immediate clear()
    html5QrcodeScanner.pause(true); // Pause the scanner

    // Then, proceed with the logic
    handleVolunteerScan(decodedText);

    // Clearing is kept for a full reset flow (like handleVolunteerScan failure or reset button)
    // For a successful scan, we let handleVolunteerScan proceed and only clear on reset/fail.
  } else {
    handleVolunteerScan(decodedText);
  }
};

const onScanError = (errorMessage) => {
  // console.log(`QR Error: ${errorMessage}`);
};

const startQrScanner = () => {
  // Ensure cleanup before starting
  if (html5QrcodeScanner) {
    html5QrcodeScanner
      .clear()
      .catch((e) => console.log("Failed to clear scanner on startup:", e));
  }

  html5QrcodeScanner = new Html5Qrcode("qr-scanner-area");

  // Check if camera is available
  Html5Qrcode.getCameras()
    .then((devices) => {
      if (devices && devices.length) {
        // Prefer the back camera on mobile/iPad
        const cameraId = devices.length > 1 ? devices[1].id : devices[0].id;

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
          .catch((err) => {
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
  volunteerId = id;

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
    const timeInBtn = document.getElementById("time-in-btn");
    const timeOutBtn = document.getElementById("time-out-btn");

    timeInBtn.disabled = activeLog !== null;
    timeOutBtn.disabled = activeLog === null;

    if (activeLog) {
      timeInBtn.textContent = "Time In (Already Clocked)";
      timeOutBtn.textContent = "Time Out";
      timeInBtn.classList.remove("bg-green-500");
      timeInBtn.classList.add("bg-gray-400");
    } else {
      timeInBtn.textContent = "Time In";
      timeInBtn.classList.remove("bg-gray-400");
      timeInBtn.classList.add("bg-green-500");
      timeOutBtn.textContent = "Time Out (Not Clocked In)";
    }

    console.log("Volunteer found. Showing action stage."); // DIAGNOSTIC LOG 4
    showStage("action");
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

/**
 * Handles the Segment Form submission (Stage 3 -> Stage 4).
 */
document
  .getElementById("segment-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const segment = document.getElementById("segment-select").value;
    const service = document.getElementById("service-select").value;
    const role = document.getElementById("role-select").value;

    try {
      // 1. Find an available comms ID
      const availableCommsSnapshot = await db
        .ref("comms")
        .orderByChild("status")
        .equalTo("available")
        .limitToFirst(1)
        .once("value");
      let assignedCommsId = "ID_NONE";

      if (availableCommsSnapshot.exists()) {
        const commsData = availableCommsSnapshot.val();
        assignedCommsId = Object.keys(commsData)[0];
        console.log(`Comms ID ${assignedCommsId} found and will be assigned.`); // DIAGNOSTIC LOG 5
      } else {
        console.log("No available Comms ID found. Assigning 'ID_NONE'."); // DIAGNOSTIC LOG 5b
      }

      // 2. Log Time In
      const now = new Date().toISOString();
      const date = now.slice(0, 10);
      const logPath = `logs/${date}`;
      const newLogRef = db.ref(logPath).push();
      currentLogKey = newLogRef.key;

      const logData = {
        volunteerId: volunteerId,
        name: volunteerName,
        timeIn: now,
        timeOut: null,
        segment: segment,
        service: service,
        role: role,
        commsId: assignedCommsId,
        commsStatusOut: null, // Status only set on Time Out
      };

      await newLogRef.set(logData);
      console.log(
        `Time In logged successfully at path: ${logPath}/${currentLogKey}`
      ); // DIAGNOSTIC LOG 6

      // 3. Update Comms Status (if a comms was assigned)
      if (assignedCommsId !== "ID_NONE") {
        await db.ref(`comms/${assignedCommsId}`).update({
          status: "assigned",
          assignedTo: volunteerId,
          assignedTime: now,
        });
        console.log(`Comms ID ${assignedCommsId} updated to assigned.`); // DIAGNOSTIC LOG 7
      }

      // 4. Update UI
      document.getElementById("assigned-comms-id").textContent =
        assignedCommsId;
      showStage("comms");

      // Notification/Prompt to get comms is handled by the UI message in stage-comms
    } catch (error) {
      console.error("Time In/Comms Assignment Error:", error);
      alert(
        "An error occurred during Time In and Comms assignment. Please contact admin."
      );
    }
  });

/**
 * Handles Comms Received Confirmation (Stage 4 -> Stage 6).
 * This button completes the Time In process from the volunteer's perspective.
 */
document.getElementById("comms-received-btn").addEventListener("click", () => {
  document.getElementById(
    "final-message"
  ).textContent = `You are clocked in and assigned to Comms/ID: ${
    document.getElementById("assigned-comms-id").textContent
  }. Enjoy your shift!`;
  showStage("final");
});

/**
 * Handles Comms Status selection during Time Out (Stage 5).
 */
let commsStatusOut = null;
let commsIdToReturn = null;

document
  .querySelectorAll("#stage-timeout button[data-status]")
  .forEach((button) => {
    button.addEventListener("click", (e) => {
      commsStatusOut = e.target.dataset.status;
      commsIdToReturn = document.getElementById("return-comms-id").textContent;
      const finalTimeoutBtn = document.getElementById("final-timeout-btn");
      const statusMessage = document.getElementById("comms-status-message");

      finalTimeoutBtn.classList.remove("hidden");
      statusMessage.classList.add("hidden");
      finalTimeoutBtn.disabled = false;

      if (commsStatusOut === "DAMAGED") {
        // In a real scenario, this would trigger a different workflow (VM scan)
        // For now, we'll mark it as disabled until "VM" has scanned it (simulated by a timeout or manual check)
        // Protocol: "prompt user to receive the comms and/or id" - VM Special QR for status check is on the admin page.
        statusMessage.textContent =
          "🚨 IMPORTANT: Please hand over the damaged Comms/ID to a VM for a damage check and special QR scan.";
        statusMessage.classList.remove("hidden");
        finalTimeoutBtn.textContent =
          "Confirm Time Out (Comms requires VM check)";
      } else {
        finalTimeoutBtn.textContent = "Confirm Time Out & Comms Return";
      }
    });
  });

/**
 * Handles the final Time Out confirmation (Stage 5 -> Stage 6).
 */
document
  .getElementById("final-timeout-btn")
  .addEventListener("click", async () => {
    if (!currentLogKey || !commsStatusOut) {
      alert("Error: Missing log or comms status. Please re-scan.");
      startQrScanner();
      return;
    }

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
      if (commsIdToReturn && commsIdToReturn !== "ID_NONE") {
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
      const statusMsg =
        commsStatusOut === "OK"
          ? "Thank you for returning the equipment in good condition."
          : "Equipment is marked as DAMAGED. A report has been logged.";
      document.getElementById(
        "final-message"
      ).textContent = `Time Out recorded successfully at ${new Date().toLocaleTimeString()}. ${statusMsg}`;
      showStage("final");
    } catch (error) {
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
