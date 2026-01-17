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
