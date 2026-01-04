import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  set,
  onValue,
  remove,
  update,
  query,
  orderByChild,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBNPdSYJXuzvmdEHIeHGkbPmFnZxUq1lAg",
  authDomain: "charlie-karla-wedding.firebaseapp.com",
  databaseURL:
    "https://charlie-karla-wedding-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "charlie-karla-wedding",
  storageBucket: "charlie-karla-wedding.firebasestorage.app",
  messagingSenderId: "954582649260",
  appId: "1:954582649260:web:393fcc0fddafeb571f5209",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let allData = [];
let sortConfig = { key: "name", direction: "asc" };
let searchTerm = "";
let sideSortIndex = 0; // 0: Karla First, 1: Charlie First, 2: Both First
const sideOrders = [
  ["karla", "charlie", "both"], // Click 1
  ["charlie", "karla", "both"], // Click 2
  ["both", "charlie", "karla"], // Click 3
];

// LOAD DATA
function init() {
  const guestListRef = ref(db, "guestList");
  const rsvpRef = ref(db, "rsvps");

  onValue(guestListRef, (guestSnap) => {
    onValue(rsvpRef, (rsvpSnap) => {
      const guests = guestSnap.val() || {};
      const rsvps = Object.values(rsvpSnap.val() || {});

      // Combine data
      allData = Object.entries(guests).map(([id, guest]) => {
        const response = rsvps.find(
          (r) => r.guestName.toLowerCase() === guest.name.toLowerCase()
        );
        return {
          id,
          name: guest.name,
          side: guest.side || "both", // Default to 'both' if not set
          status: response ? response.attending : "pending",
          submittedAt: response ? response.submittedAt : null,
        };
      });
      render();
    });
  });
  initVisitorLogs();
  updateVenueWeather();
}

function render() {
  const tableBody = document.getElementById("guestTableBody");
  tableBody.innerHTML = "";

  // Filter by search
  let displayData = allData.filter((item) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Sort Logic
  displayData.sort((a, b) => {
    if (sortConfig.key === "side") {
      const currentOrder = sideOrders[sideSortIndex];
      const indexA = currentOrder.indexOf(a.side);
      const indexB = currentOrder.indexOf(b.side);
      return indexA - indexB;
    }

    let valA = (a[sortConfig.key] || "").toLowerCase();
    let valB = (b[sortConfig.key] || "").toLowerCase();
    if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
    if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
    return 0;
  });

  displayData.forEach((guest) => {
    const row = document.createElement("tr");

    // Dynamic color for Side
    const sideColor =
      guest.side === "karla"
        ? "text-red-600"
        : guest.side === "charlie"
        ? "text-blue-600"
        : "text-purple-500";

    row.className = `border-b border-stone-50 hover:bg-stone-50 transition ${
      guest.status === "no" ? "bg-red-50/30" : ""
    }`;

    row.innerHTML = `
            <td class="p-4">
                <div class="font-medium text-stone-800">${guest.name}</div>
                ${
                  guest.submittedAt
                    ? `<div class="text-[9px] text-stone-400 italic">Replied: ${new Date(
                        guest.submittedAt
                      ).toLocaleDateString()}</div>`
                    : ""
                }
            </td>
            <td class="p-4">
              <select class="side-select bg-transparent text-[10px] font-bold uppercase tracking-widest outline-none cursor-pointer p-1 rounded ${sideColor}" 
                  data-id="${guest.id}">
                  <option value="karla" ${
                    guest.side === "karla" ? "selected" : ""
                  }>Karla</option>
                  <option value="charlie" ${
                    guest.side === "charlie" ? "selected" : ""
                  }>Charlie</option>
                  <option value="both" ${
                    guest.side === "both" ? "selected" : ""
                  }>Both</option>
              </select>
            </td>
            <td class="p-4">
                <select class="status-select bg-transparent text-[10px] font-bold uppercase tracking-widest outline-none cursor-pointer p-1 rounded
                    ${
                      guest.status === "yes"
                        ? "text-green-600"
                        : guest.status === "no"
                        ? "text-red-500"
                        : "text-stone-400"
                    }" 
                    data-name="${guest.name}">
                    <option value="pending" ${
                      guest.status === "pending" ? "selected" : ""
                    }>Pending</option>
                    <option value="yes" ${
                      guest.status === "yes" ? "selected" : ""
                    }>Yes</option>
                    <option value="no" ${
                      guest.status === "no" ? "selected" : ""
                    }>No</option>
                </select>
            </td>
            <td class="p-4 space-x-3 text-right">
                <button onclick="editGuestName('${guest.id}', '${
      guest.name
    }')" class="text-blue-400 hover:text-blue-600 text-[10px] font-bold uppercase">Edit</button>
                <button onclick="deleteGuest('${
                  guest.id
                }')" class="text-stone-300 hover:text-red-500 text-[10px] font-bold uppercase">Del</button>
            </td>
        `;
    tableBody.appendChild(row);
  });

  // --- STATS UPDATE ---
  document.getElementById("stat-total").innerText = allData.length;
  document.getElementById("stat-yes").innerText = allData.filter(
    (g) => g.status === "yes"
  ).length;
  document.getElementById("stat-no").innerText = allData.filter(
    (g) => g.status === "no"
  ).length;
  document.getElementById("stat-pending").innerText = allData.filter(
    (g) => g.status === "pending"
  ).length;
  document.getElementById("stat-karla").innerText = allData.filter(
    (g) => g.side === "karla"
  ).length;
  document.getElementById("stat-charlie").innerText = allData.filter(
    (g) => g.side === "charlie"
  ).length;
  document.getElementById("stat-both").innerText = allData.filter(
    (g) => g.side === "both"
  ).length;

  // --- RE-ATTACH LISTENERS (Crucial!) ---
  document.querySelectorAll(".status-select").forEach((select) => {
    select.onchange = (e) =>
      updateManualStatus(e.target.dataset.name, e.target.value);
  });

  document.querySelectorAll(".side-select").forEach((select) => {
    select.onchange = (e) =>
      updateGuestSide(e.target.dataset.id, e.target.value);
  });

  renderFinalList();
}

// --- ACTIONS ---

window.updateManualStatus = async (guestName, newStatus) => {
  const rsvpRef = ref(db, "rsvps");
  // First, remove any existing RSVP for this person to avoid duplicates
  onValue(
    rsvpRef,
    async (snap) => {
      const data = snap.val();
      if (data) {
        Object.entries(data).forEach(([key, val]) => {
          if (val.guestName.toLowerCase() === guestName.toLowerCase()) {
            remove(ref(db, `rsvps/${key}`));
          }
        });
      }
    },
    { onlyOnce: true }
  );

  if (newStatus !== "pending") {
    const newRsvpRef = push(ref(db, "rsvps"));
    await set(newRsvpRef, {
      guestName: guestName,
      attending: newStatus,
      submittedAt: new Date().toISOString(),
      manual: true,
    });
  }
};

window.editGuestName = async (id, oldName) => {
  const newName = prompt("Edit Guest Name:", oldName);
  if (newName && newName !== oldName) {
    await update(ref(db, `guestList/${id}`), { name: newName });
    // Optional: you could also search rsvps and update the name there to keep data synced
  }
};

window.deleteGuest = async (id) => {
  if (confirm("Delete this guest?")) {
    await remove(ref(db, `guestList/${id}`));
  }
};

// SORTING LOGIC
document.getElementById("sortName").onclick = () => {
  sortConfig.direction =
    sortConfig.key === "name" && sortConfig.direction === "asc"
      ? "desc"
      : "asc";
  sortConfig.key = "name";
  render();
};

document.getElementById("sortSide").onclick = () => {
  // If we were already sorting by side, move to the next priority mode
  if (sortConfig.key === "side") {
    sideSortIndex = (sideSortIndex + 1) % 3;
  } else {
    sortConfig.key = "side";
    sideSortIndex = 0; // Start with Karla if coming from another column
  }

  // Visual feedback: Update the header text to show priority
  const labels = ["Side (K)", "Side (C)", "Side (B)"];
  document.getElementById(
    "sortSide"
  ).innerHTML = `${labels[sideSortIndex]} <span class="sort-icon">↕</span>`;

  render();
};

document.getElementById("sortStatus").onclick = () => {
  sortConfig.direction =
    sortConfig.key === "status" && sortConfig.direction === "asc"
      ? "desc"
      : "asc";
  sortConfig.key = "status";
  render();
};

// SEARCH LOGIC
document.getElementById("searchInput").oninput = (e) => {
  searchTerm = e.target.value;
  render();
};

// ADD GUEST
document.getElementById("addGuestForm").onsubmit = async (e) => {
  e.preventDefault();
  const input = document.getElementById("newGuestName");
  if (!input.value.trim()) return;
  await push(ref(db, "guestList"), { name: input.value.trim() });
  input.value = "";
};

function initVisitorLogs() {
  const visitorLogsRef = ref(db, "visitorLogs");

  onValue(visitorLogsRef, (snapshot) => {
    const data = snapshot.val() || {};
    renderVisitorLogs(data);
  });
}

function renderVisitorLogs(data) {
  const tableBody = document.getElementById("visitorTableBody");
  const badge = document.getElementById("unique-visitor-badge");
  tableBody.innerHTML = "";

  // Convert object to array and sort by latest activity
  const entries = Object.entries(data).map(([id, val]) => ({ id, ...val }));
  entries.sort((a, b) => (b.lastVisit || 0) - (a.lastVisit || 0));

  badge.innerText = `${entries.length} Total Visitors`;

  entries.forEach((visitor) => {
    const row = document.createElement("tr");
    row.className =
      "border-b border-stone-50 hover:bg-stone-50/80 transition cursor-default";

    const lastSeen = visitor.lastVisit
      ? new Date(visitor.lastVisit).toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "Just now";

    row.innerHTML = `
            <td class="p-4">
                <div class="flex items-center gap-2">
                    <span class="text-lg">📍</span>
                    <div>
                        <div class="font-semibold text-stone-800">${visitor.city}, ${visitor.country}</div>
                        <div class="text-[10px] text-stone-400 uppercase tracking-tight">${visitor.region} • ${visitor.ip}</div>
                    </div>
                </div>
            </td>
            <td class="p-4">
                <div class="inline-flex items-center px-2 py-1 rounded bg-orange-50 text-orange-600 text-[10px] font-bold uppercase tracking-tighter">
                    ${visitor.visitCount} Views
                </div>
            </td>
            <td class="p-4 text-xs text-stone-500 font-medium">
                ${lastSeen}
            </td>
        `;
    tableBody.appendChild(row);
  });
  updateMapMarkers(data);
}

let map;
let markers = {}; // To keep track of markers and avoid duplicates

function initMap() {
  // 1. Initialize map (Centered on Philippines/Global view)
  // [12.8797, 121.7740] is roughly Philippines, Zoom 5
  map = L.map("map").setView([12.8797, 121.774], 5);

  // 2. Add a beautiful "Clean/Light" map style that matches your stone/green theme
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      attribution: "© OpenStreetMap",
    }
  ).addTo(map);
}

function updateMapMarkers(visitorData) {
  if (!map) initMap();

  Object.entries(visitorData).forEach(([id, visitor]) => {
    // Only draw if we have coordinates
    if (visitor.latitude && visitor.longitude) {
      const pos = [visitor.latitude, visitor.longitude];

      if (!markers[id]) {
        // Create a new "Circle Marker" (more modern than default pins)
        markers[id] = L.circleMarker(pos, {
          radius: 8,
          fillColor: "#7b8a5b", // Your wedding green
          color: "#fff",
          weight: 2,
          opacity: 1,
          fillOpacity: 0.8,
        }).addTo(map);

        markers[id].bindPopup(`
                    <div class="text-center">
                        <strong class="serif">${visitor.city}</strong><br>
                        <span class="text-[10px] uppercase font-bold text-stone-400">${visitor.visitCount} visits</span>
                    </div>
                `);
      } else {
        // Update existing marker position and popup content
        markers[id].setLatLng(pos);
        markers[id].setPopupContent(
          `<strong>${visitor.city}</strong><br>Visits: ${visitor.visitCount}`
        );
      }
    }
  });
}

async function updateVenueWeather() {
  const city = "Pasig"; // <-- CHANGE THIS to your wedding city
  try {
    // Using a free no-auth weather API (wttr.in)
    const res = await fetch(`https://wttr.in/${city}?format=j1`);
    const data = await res.json();

    const temp = data.current_condition[0].temp_C;
    const desc = data.current_condition[0].weatherDesc[0].value;

    document.getElementById("venue-temp").innerText = `${temp}°C`;
    // Simple emoji based on description
    const icon = desc.toLowerCase().includes("sun")
      ? "☀️"
      : desc.toLowerCase().includes("cloud")
      ? "☁️"
      : "🌧️";
    document.getElementById("weather-icon").innerText = icon;
  } catch (e) {
    console.log("Weather error", e);
  }
}

function renderFinalList() {
  const finalListBody = document.getElementById("finalGuestTableBody");
  const countBadge = document.getElementById("final-count-badge");
  finalListBody.innerHTML = "";

  // 1. Filter only those who said "Yes"
  const confirmedGuests = allData.filter((guest) => guest.status === "yes");

  // 2. Sort them by the date they responded (Newest first)
  confirmedGuests.sort(
    (a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)
  );

  // 3. Update the Badge Count
  countBadge.innerText = `${confirmedGuests.length} Confirmed Guests`;

  // 4. If no one has said yes yet
  if (confirmedGuests.length === 0) {
    finalListBody.innerHTML = `<tr><td colspan="3" class="p-8 text-center text-stone-400 italic">No confirmed guests yet...</td></tr>`;
    return;
  }

  // 5. Generate Rows
  confirmedGuests.forEach((guest) => {
    const row = document.createElement("tr");
    row.className = "border-b border-stone-50 hover:bg-green-50/30 transition";

    // Format the date nicely (e.g., Jan 12, 10:30 AM)
    const responseDate = guest.submittedAt
      ? new Date(guest.submittedAt).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "Manual Entry";

    row.innerHTML = `
            <td class="p-4 font-semibold text-stone-800">
                ${guest.name}
            </td>
            <td class="p-4 text-xs text-stone-500">
                ${responseDate}
            </td>
            <td class="p-4 text-right">
                <span class="bg-green-100 text-green-700 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest">
                    Attending
                </span>
            </td>
        `;
    finalListBody.appendChild(row);
  });
}

// 1. Function to update the Side in Firebase
window.updateGuestSide = async (id, newSide) => {
  await update(ref(db, `guestList/${id}`), { side: newSide });
};

// 2. Add listeners for the side dropdowns (put this at the end of render())
document.querySelectorAll(".side-select").forEach((select) => {
  select.onchange = (e) => updateGuestSide(e.target.dataset.id, e.target.value);
});

init();
