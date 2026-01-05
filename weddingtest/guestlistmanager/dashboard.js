import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  set,
  onValue,
  remove,
  update,
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
let sideSortIndex = 0;
let currentPage = 1;
const sideOrders = [
  ["karla", "charlie", "both"],
  ["charlie", "karla", "both"],
  ["both", "charlie", "karla"],
];

function init() {
  const guestListRef = ref(db, "guestList");
  const rsvpRef = ref(db, "rsvps");

  onValue(guestListRef, (guestSnap) => {
    onValue(rsvpRef, (rsvpSnap) => {
      const guests = guestSnap.val() || {};
      const rsvps = Object.values(rsvpSnap.val() || {});

      allData = Object.entries(guests).map(([id, guest]) => {
        const response = rsvps.find(
          (r) => r.guestName.toLowerCase() === guest.name.toLowerCase()
        );
        return {
          id,
          name: guest.name,
          side: guest.side || "both",
          status: response ? response.attending : "pending",
          submittedAt: response ? response.submittedAt : null,
          invited: guest.invited || "no",
        };
      });
      render();
    });
  });
  initVisitorLogs();
  updateVenueWeather();
}

function render(shouldScroll = false) {
  const tableBody = document.getElementById("guestTableBody");
  tableBody.innerHTML = "";

  let displayData = allData.filter((item) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  const rowsPerPage = window.innerWidth < 640 ? 5 : 10;
  const totalPages = Math.ceil(displayData.length / rowsPerPage);

  if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedData = displayData.slice(startIndex, startIndex + rowsPerPage);

  document.querySelectorAll(".sort-chip").forEach((chip) => {
    chip.classList.remove("active");
    chip.innerText = chip.innerText.replace(" ↑", "").replace(" ↓", "");
  });
  const activeChipMap = {
    name: "mobSortName",
    side: "mobSortSide",
    status: "mobSortStatus",
  };
  const activeChip = document.getElementById(activeChipMap[sortConfig.key]);
  if (activeChip) {
    activeChip.classList.add("active");
    activeChip.innerText += sortConfig.direction === "asc" ? " ↑" : " ↓";
  }

  paginatedData.forEach((guest) => {
    const row = document.createElement("tr");
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
            <td class="p-4" data-label="Name">
                <div class="font-medium text-stone-800">${guest.name}</div>
                ${
                  guest.submittedAt
                    ? `<div class="replied-date italic">Replied: ${new Date(
                        guest.submittedAt
                      ).toLocaleDateString()}</div>`
                    : ""
                }
            </td>
            <td class="p-4" data-label="Side">
              <select class="side-select bg-transparent text-[10px] font-bold uppercase tracking-widest outline-none cursor-pointer p-1 rounded ${sideColor}" data-id="${
      guest.id
    }">
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
            <td class="p-4" data-label="Status">
                <select class="status-select bg-transparent text-[10px] font-bold uppercase tracking-widest outline-none cursor-pointer p-1 rounded ${
                  guest.status === "yes"
                    ? "text-green-600"
                    : guest.status === "no"
                    ? "text-red-500"
                    : "text-stone-400"
                }" data-name="${guest.name}">
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
            <td class="p-4" data-label="Invited">
                <select class="invited-select bg-transparent text-[10px] font-bold uppercase tracking-widest outline-none cursor-pointer p-1 rounded ${
                  guest.invited === "yes" ? "text-sky-600" : "text-stone-400"
                }" data-id="${guest.id}">
                    <option value="no" ${
                      guest.invited === "no" ? "selected" : ""
                    }>No</option>
                    <option value="yes" ${
                      guest.invited === "yes" ? "selected" : ""
                    }>Yes</option>
                </select>
            </td>
            <td class="p-4 space-x-3 text-right" data-label="Actions">
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

  document
    .querySelectorAll(".status-select")
    .forEach(
      (s) =>
        (s.onchange = (e) =>
          updateManualStatus(e.target.dataset.name, e.target.value))
    );
  document
    .querySelectorAll(".side-select")
    .forEach(
      (s) =>
        (s.onchange = (e) =>
          updateGuestSide(e.target.dataset.id, e.target.value))
    );
  document
    .querySelectorAll(".invited-select")
    .forEach(
      (s) =>
        (s.onchange = (e) =>
          updateInvitedStatus(e.target.dataset.id, e.target.value))
    );

  renderPagination(totalPages);
  renderFinalList();
}

function renderPagination(totalPages) {
  const container = document.getElementById("pagination-container");
  const indicator = document.getElementById("page-indicator");
  container.innerHTML = "";

  indicator.innerText = `Page ${currentPage} of ${totalPages || 1}`;
  if (totalPages <= 1) return;

  // PREV
  const prevBtn = document.createElement("button");
  prevBtn.className = "pag-btn";
  prevBtn.disabled = currentPage === 1;
  prevBtn.innerHTML = `<span class="material-icons text-sm">chevron_left</span>`;
  prevBtn.onclick = (e) => {
    e.preventDefault();
    currentPage--;
    render(true);
  };
  container.appendChild(prevBtn);

  // Logic for "First 2, Current, Last 2"
  let pages = new Set([1, 2, totalPages - 1, totalPages]);
  if (currentPage > 0) pages.add(currentPage);

  const sortedPages = Array.from(pages)
    .filter((p) => p > 0 && p <= totalPages)
    .sort((a, b) => a - b);

  sortedPages.forEach((page, index) => {
    if (index > 0 && page - sortedPages[index - 1] > 1) {
      const dots = document.createElement("span");
      dots.className = "pag-dots";
      dots.innerText = "•••";
      container.appendChild(dots);
    }

    const pageBtn = document.createElement("button");
    pageBtn.className = `pag-btn ${page === currentPage ? "active" : ""}`;
    pageBtn.innerText = page;
    pageBtn.onclick = (e) => {
      e.preventDefault();
      currentPage = page;
      render(true);
    };
    container.appendChild(pageBtn);
  });

  // NEXT
  const nextBtn = document.createElement("button");
  nextBtn.className = "pag-btn";
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.innerHTML = `<span class="material-icons text-sm">chevron_right</span>`;
  nextBtn.onclick = (e) => {
    e.preventDefault();
    currentPage++;
    render(true);
  };
  container.appendChild(nextBtn);
}

// --- ACTIONS ---
window.updateManualStatus = async (guestName, newStatus) => {
  const rsvpRef = ref(db, "rsvps");
  onValue(
    rsvpRef,
    async (snap) => {
      const data = snap.val();
      if (data) {
        Object.entries(data).forEach(([key, val]) => {
          if (val.guestName.toLowerCase() === guestName.toLowerCase())
            remove(ref(db, `rsvps/${key}`));
        });
      }
    },
    { onlyOnce: true }
  );
  if (newStatus !== "pending") {
    await push(ref(db, "rsvps"), {
      guestName,
      attending: newStatus,
      submittedAt: new Date().toISOString(),
      manual: true,
    });
  }
};

window.editGuestName = async (id, oldName) => {
  const newName = prompt("Edit Guest Name:", oldName);
  if (newName && newName !== oldName)
    await update(ref(db, `guestList/${id}`), { name: newName });
};

window.deleteGuest = async (id) => {
  if (confirm("Delete this guest?")) await remove(ref(db, `guestList/${id}`));
};

const toggleSortName = () => {
  sortConfig.direction =
    sortConfig.key === "name" && sortConfig.direction === "asc"
      ? "desc"
      : "asc";
  sortConfig.key = "name";
  currentPage = 1;
  render();
};

const toggleSortSide = () => {
  if (sortConfig.key === "side") sideSortIndex = (sideSortIndex + 1) % 3;
  else sortConfig.key = "side";
  currentPage = 1;
  render();
};

const toggleSortStatus = () => {
  sortConfig.direction =
    sortConfig.key === "status" && sortConfig.direction === "asc"
      ? "desc"
      : "asc";
  sortConfig.key = "status";
  currentPage = 1;
  render();
};

document.getElementById("sortName").onclick = toggleSortName;
document.getElementById("mobSortName").onclick = toggleSortName;
document.getElementById("sortSide").onclick = toggleSortSide;
document.getElementById("mobSortSide").onclick = toggleSortSide;
document.getElementById("sortStatus").onclick = toggleSortStatus;
document.getElementById("mobSortStatus").onclick = toggleSortStatus;

document.getElementById("searchInput").oninput = (e) => {
  searchTerm = e.target.value;
  currentPage = 1;
  render();
};

document.getElementById("addGuestForm").onsubmit = async (e) => {
  e.preventDefault();
  const input = document.getElementById("newGuestName");
  if (!input.value.trim()) return;
  await push(ref(db, "guestList"), { name: input.value.trim() });
  input.value = "";
};

function initVisitorLogs() {
  onValue(ref(db, "visitorLogs"), (snapshot) => {
    const data = snapshot.val() || {};
    renderVisitorLogs(data);
  });
}

function renderVisitorLogs(data) {
  const tableBody = document.getElementById("visitorTableBody");
  tableBody.innerHTML = "";
  const entries = Object.entries(data).map(([id, val]) => ({ id, ...val }));
  entries.sort((a, b) => (b.lastVisit || 0) - (a.lastVisit || 0));
  document.getElementById(
    "unique-visitor-badge"
  ).innerText = `${entries.length} Total Visitors`;

  entries.forEach((visitor) => {
    const row = document.createElement("tr");
    row.className =
      "border-b border-stone-50 hover:bg-stone-50/80 transition cursor-default";
    row.innerHTML = `
            <td class="p-4" data-label="Location">
                <div class="flex items-center gap-2">
                    <span class="text-lg">📍</span>
                    <div>
                        <div class="font-semibold text-stone-800">${
                          visitor.city
                        }, ${visitor.country}</div>
                        <div class="text-[10px] text-stone-400 uppercase tracking-tight">${
                          visitor.region
                        } • ${visitor.ip}</div>
                    </div>
                </div>
            </td>
            <td class="p-4" data-label="Engagement">
                <div class="inline-flex items-center px-2 py-1 rounded bg-orange-50 text-orange-600 text-[10px] font-bold uppercase tracking-tighter">${
                  visitor.visitCount
                } Views</div>
            </td>
            <td class="p-4 text-xs text-stone-500 font-medium" data-label="Last Active">${new Date(
              visitor.lastVisit
            ).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}</td>
        `;
    tableBody.appendChild(row);
  });
  updateMapMarkers(data);
}

let map;
let markers = {};
function initMap() {
  map = L.map("map").setView([12.8797, 121.774], 5);
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    { attribution: "© OpenStreetMap" }
  ).addTo(map);
}

function updateMapMarkers(visitorData) {
  if (!map) initMap();
  Object.entries(visitorData).forEach(([id, visitor]) => {
    if (visitor.latitude && visitor.longitude) {
      const pos = [visitor.latitude, visitor.longitude];
      if (!markers[id]) {
        markers[id] = L.circleMarker(pos, {
          radius: 8,
          fillColor: "#7b8a5b",
          color: "#fff",
          weight: 2,
          opacity: 1,
          fillOpacity: 0.8,
        }).addTo(map);
      } else {
        markers[id].setLatLng(pos);
      }
    }
  });
}

async function updateVenueWeather() {
  try {
    const res = await fetch(`https://wttr.in/Pasig?format=j1`);
    const data = await res.json();
    document.getElementById(
      "venue-temp"
    ).innerText = `${data.current_condition[0].temp_C}°C`;
    const desc = data.current_condition[0].weatherDesc[0].value.toLowerCase();
    document.getElementById("weather-icon").innerText = desc.includes("sun")
      ? "☀️"
      : desc.includes("cloud")
      ? "☁️"
      : "🌧️";
  } catch (e) {
    console.log(e);
  }
}

function renderFinalList() {
  const finalListBody = document.getElementById("finalGuestTableBody");
  finalListBody.innerHTML = "";
  const confirmedGuests = allData
    .filter((g) => g.status === "yes")
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  document.getElementById(
    "final-count-badge"
  ).innerText = `${confirmedGuests.length} Confirmed Guests`;
  if (confirmedGuests.length === 0) {
    finalListBody.innerHTML = `<tr><td colspan="3" class="p-8 text-center text-stone-400 italic">No confirmed guests yet...</td></tr>`;
    return;
  }
  confirmedGuests.forEach((guest) => {
    const row = document.createElement("tr");
    row.className = "border-b border-stone-50 transition";
    row.innerHTML = `<td class="p-4 font-semibold text-stone-800" data-label="Confirmed">${
      guest.name
    }</td><td class="p-4 text-xs text-stone-500" data-label="Date">${new Date(
      guest.submittedAt
    ).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}</td><td class="p-4 text-right" data-label="Status"><span class="bg-green-100 text-green-700 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest">Attending</span></td>`;
    finalListBody.appendChild(row);
  });
}

window.updateGuestSide = async (id, newSide) => {
  await update(ref(db, `guestList/${id}`), { side: newSide });
};

window.updateInvitedStatus = async (id, newInvited) => {
  await update(ref(db, `guestList/${id}`), { invited: newInvited });
};

init();
