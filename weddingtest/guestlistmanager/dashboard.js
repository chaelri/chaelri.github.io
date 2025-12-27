import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  set,
  onValue,
  remove,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// REUSE YOUR CONFIG
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

// SIMPLE SECURITY: Only you and Karla know the password
const pass = prompt("Enter Admin Password:");
if (pass === "ck2026") {
  // You can change 'ck2026' to whatever you want
  document.getElementById("adminContent").classList.remove("hidden");
} else {
  alert("Unauthorized");
  window.location.href = "index.html";
}

const tableBody = document.getElementById("guestTableBody");
const addForm = document.getElementById("addGuestForm");

// REAL-TIME LISTENER
function loadData() {
  const guestListRef = ref(db, "guestList");
  const rsvpRef = ref(db, "rsvps");

  onValue(guestListRef, (guestSnapshot) => {
    onValue(rsvpRef, (rsvpSnapshot) => {
      const guests = guestSnapshot.val() || {};
      const rsvps = rsvpSnapshot.val() || {};
      renderTable(guests, rsvps);
    });
  });
}

function renderTable(guests, rsvps) {
  tableBody.innerHTML = "";
  let stats = { total: 0, yes: 0, no: 0, pending: 0 };

  // Convert RSVPs to a searchable map by Name (Case Insensitive)
  const rsvpMap = {};
  Object.values(rsvps).forEach((r) => {
    rsvpMap[r.guestName.toLowerCase()] = r.attending;
  });

  Object.entries(guests).forEach(([id, guest]) => {
    stats.total++;
    const status = rsvpMap[guest.name.toLowerCase()] || "pending";
    if (status === "yes") stats.yes++;
    else if (status === "no") stats.no++;
    else stats.pending++;

    const row = document.createElement("tr");
    row.className = "border-b border-stone-50 hover:bg-stone-50/50 transition";
    row.innerHTML = `
            <td class="p-4 font-medium text-stone-800">${guest.name}</td>
            <td class="p-4">
                <span class="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest 
                ${
                  status === "yes"
                    ? "bg-green-100 text-green-700"
                    : status === "no"
                    ? "bg-red-100 text-red-700"
                    : "bg-stone-100 text-stone-500"
                }">
                    ${status}
                </span>
            </td>
            <td class="p-4 text-right">
                <button class="delete-btn text-stone-300 hover:text-red-500 transition" data-id="${id}">
                    Delete
                </button>
            </td>
        `;
    tableBody.appendChild(row);
  });

  // Update Stats
  document.getElementById("stat-total").innerText = stats.total;
  document.getElementById("stat-yes").innerText = stats.yes;
  document.getElementById("stat-no").innerText = stats.no;
  document.getElementById("stat-pending").innerText = stats.pending;

  // Attach Delete Listeners
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.onclick = () => deleteGuest(btn.getAttribute("data-id"));
  });
}

// ADD GUEST
addForm.onsubmit = async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById("newGuestName");
  const name = nameInput.value.trim();
  if (!name) return;

  try {
    const newListRef = push(ref(db, "guestList"));
    await set(newListRef, { name: name });
    nameInput.value = "";
  } catch (e) {
    console.error(e);
  }
};

// DELETE GUEST
async function deleteGuest(id) {
  if (
    confirm(
      "Are you sure you want to remove this guest from the list? They will no longer be able to RSVP."
    )
  ) {
    await remove(ref(db, `guestList/${id}`));
  }
}

loadData();
