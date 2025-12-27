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
          status: response ? response.attending : "pending",
          submittedAt: response ? response.submittedAt : null,
        };
      });
      render();
    });
  });
}

function render() {
  const tableBody = document.getElementById("guestTableBody");
  tableBody.innerHTML = "";

  // Filter by search
  let displayData = allData.filter((item) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Sort
  displayData.sort((a, b) => {
    let valA = a[sortConfig.key].toLowerCase();
    let valB = b[sortConfig.key].toLowerCase();
    if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
    if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
    return 0;
  });

  displayData.forEach((guest) => {
    const row = document.createElement("tr");
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
                <select class="status-select bg-transparent text-xs font-bold uppercase tracking-widest outline-none cursor-pointer p-1 rounded
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
    }')" class="text-blue-400 hover:text-blue-600 text-xs font-bold uppercase">Edit</button>
                <button onclick="deleteGuest('${
                  guest.id
                }')" class="text-stone-300 hover:text-red-500 text-xs font-bold uppercase">Del</button>
            </td>
        `;
    tableBody.appendChild(row);
  });

  // Update Stats
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

  // Attach Select Listeners
  document.querySelectorAll(".status-select").forEach((select) => {
    select.onchange = (e) =>
      updateManualStatus(e.target.dataset.name, e.target.value);
  });
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

init();
