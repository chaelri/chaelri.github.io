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
import {
  getStorage,
  ref as sRef,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

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
const storage = getStorage(app);

let allData = [];
let sortConfig = { key: "name", direction: "asc" };
let searchTerm = "";
let filterSide = "all";
let filterStatus = "all";
let filterInvited = "all";
let currentPage = 1;

// "guest" is the identifier for regular guests
const ENTOURAGE_ROLES = [
  "guest",
  "Bride",
  "Groom",
  "Parent of Bride",
  "Parent of Groom",
  "Officiant",
  "Maid of Honor",
  "Bridesmaid",
  "Best Man",
  "Groomsman",
  "Principal Sponsor",
  "Secondary Sponsor",
  "Secondary Sponsor (Veil)",
  "Secondary Sponsor (Coin)",
  "Secondary Sponsor (Candle)",
  "Bible Bearer",
  "Ring Bearer",
  "Flower Boy",
  "Flower Girl",
];

// Marching order grouping for vertical display
const MARCHING_ORDER = [
  { label: "The Bride", roles: ["Bride"] },
  { label: "The Groom", roles: ["Groom"] },
  { label: "Parents", roles: ["Parent of Bride", "Parent of Groom"] },
  { label: "The Officiant", roles: ["Officiant"] },
  { label: "Major Attendants", roles: ["Maid of Honor", "Best Man"] },
  { label: "The Wedding Party", roles: ["Bridesmaid", "Groomsman"] },
  { label: "Principal Sponsors", roles: ["Principal Sponsor"] },
  {
    label: "Secondary Sponsors",
    roles: [
      "Secondary Sponsor",
      "Secondary Sponsor (Veil)",
      "Secondary Sponsor (Coin)",
      "Secondary Sponsor (Candle)",
    ],
  },
  { label: "Bible Bearer", roles: ["Bible Bearer"] },
  { label: "Ring Bearer", roles: ["Ring Bearer"] },
  { label: "Flower Girls", roles: ["Flower Boy", "Flower Girl"] },
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
          nickname: guest.nickname || "",
          side: guest.side || "both",
          status: response ? response.attending : "pending",
          submittedAt: response ? response.submittedAt : null,
          invited: guest.invited || "no",
          role: guest.role || "guest",
          gender: guest.gender || "",
          age: guest.age || "",
          photoUrl: guest.photoUrl || "",
          marchingOrder: guest.marchingOrder || 0,
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

  // Update: Show all guests including entourage members
  let displayData = allData.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.nickname.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSide = filterSide === "all" || item.side === filterSide;
    const matchesStatus =
      filterStatus === "all" || item.status === filterStatus;
    const matchesInvited =
      filterInvited === "all" || item.invited === filterInvited;
    return (
      matchesSearch &&
      matchesSide &&
      matchesStatus &&
      matchesInvited
    );
  });

  displayData.sort((a, b) => {
    let valA = (a.name || "").toLowerCase();
    let valB = (b.name || "").toLowerCase();
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
  const activeChip = document.getElementById("mobSortName");
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
                <div class="flex items-center gap-2">
                    <span class="font-medium text-stone-800">${
                      guest.name
                    }</span>
                    ${
                      guest.nickname
                        ? `<span class="text-[10px] text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">"${guest.nickname}"</span>`
                        : ""
                    }
                    ${
                      guest.role && guest.role !== 'guest' 
                        ? `<span class="text-[8px] bg-[#7b8a5b]/10 text-[#7b8a5b] px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">${guest.role}</span>`
                        : ""
                    }
                </div>
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
            <td class="p-4" data-label="Invite">
                <button onclick="copyInviteText('${
                  guest.id
                }')" class="bg-stone-100 hover:bg-[#7b8a5b] hover:text-white transition-colors p-2 rounded-lg flex items-center justify-center">
                  <span class="material-icons text-sm">content_copy</span>
                </button>
            </td>
            <td class="p-4 space-x-3 text-right" data-label="Actions">
                <button onclick="openEditModal('${
                  guest.id
                }')" class="text-blue-400 hover:text-blue-600 text-[10px] font-bold uppercase">Edit</button>
                <button onclick="openDeleteModal('${
                  guest.id
                }')" class="text-stone-300 hover:text-red-500 text-[10px] font-bold uppercase">Del</button>
            </td>
        `;
    tableBody.appendChild(row);
  });

  // --- STATS LOGIC (Uses allData regardless of role) ---
  const entourageOnly = allData.filter(
    (g) =>
      g.role &&
      g.role.toLowerCase() !== "guest" &&
      g.role.toLowerCase() !== "none"
  );

  // stat-total: Expected (Yes + Pending) across entire DB
  document.getElementById("stat-total").innerText = allData.filter(
    (g) => g.status === "yes" || g.status === "pending"
  ).length;

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

  document.getElementById("stat-entourage-count").innerText =
    entourageOnly.length;

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
  renderEntourage();
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

// --- MODAL SYSTEM ---
const modalOverlay = document.getElementById("modalOverlay");
const modalContent = document.getElementById("modalContent");

window.showModal = (content) => {
  modalContent.innerHTML = content;
  modalOverlay.classList.add("active");
};

window.closeModal = () => {
  modalOverlay.classList.remove("active");
};

// Handle clicks outside modal to close
modalOverlay.onclick = (e) => {
  if (e.target === modalOverlay) closeModal();
};

window.openEditModal = (id) => {
  const guest = allData.find((g) => g.id === id);
  showModal(`
        <div class="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <div class="flex justify-between items-center">
                <h3 class="serif text-xl italic text-stone-800">Edit Profile</h3>
                <button onclick="closeModal()" class="text-stone-400 hover:text-stone-600"><span class="material-icons">close</span></button>
            </div>
            
            <!-- Photo Upload -->
            <div class="flex flex-col items-center gap-3 py-2">
                <div class="w-24 h-24 rounded-full border-2 border-stone-100 overflow-hidden bg-stone-50">
                    <img id="modalPhotoPreview" src="${
                      guest.photoUrl ||
                      "https://ui-avatars.com/api/?name=" +
                        guest.name +
                        "&background=7b8a5b&color=fff"
                    }" class="w-full h-full object-cover">
                </div>
                <label class="cursor-pointer bg-stone-100 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-stone-200 transition">
                    Change Photo
                    <input type="file" id="photoInput" class="hidden" accept="image/*">
                </label>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="space-y-1">
                    <label class="text-[9px] uppercase tracking-widest text-stone-400 font-bold">Full Name</label>
                    <input type="text" id="editName" value="${
                      guest.name
                    }" class="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl text-sm outline-none focus:ring-1 focus:ring-[#7b8a5b]">
                </div>
                <div class="space-y-1">
                    <label class="text-[9px] uppercase tracking-widest text-stone-400 font-bold">Nickname</label>
                    <input type="text" id="editNickname" value="${
                      guest.nickname
                    }" class="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl text-sm outline-none focus:ring-1 focus:ring-[#7b8a5b]">
                </div>
                <div class="space-y-1">
                    <label class="text-[9px] uppercase tracking-widest text-stone-400 font-bold">Role / Assignment</label>
                    <select id="editRole" class="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl text-sm outline-none focus:ring-1 focus:ring-[#7b8a5b]">
                        ${ENTOURAGE_ROLES.map(
                          (r) =>
                            `<option value="${r}" ${
                              guest.role.toLowerCase() === r.toLowerCase()
                                ? "selected"
                                : ""
                            }>${r === "guest" ? "Regular Guest" : r}</option>`
                        ).join("")}
                    </select>
                </div>
                <div class="space-y-1">
                    <label class="text-[9px] uppercase tracking-widest text-stone-400 font-bold">Gender</label>
                    <select id="editGender" class="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl text-sm outline-none focus:ring-1 focus:ring-[#7b8a5b]">
                        <option value="">Select...</option>
                        <option value="Male" ${
                          guest.gender === "Male" ? "selected" : ""
                        }>Male</option>
                        <option value="Female" ${
                          guest.gender === "Female" ? "selected" : ""
                        }>Female</option>
                    </select>
                </div>
                <div class="space-y-1">
                    <label class="text-[9px] uppercase tracking-widest text-stone-400 font-bold">Age Category</label>
                    <input type="text" id="editAge" placeholder="e.g. 25 or Child" value="${
                      guest.age
                    }" class="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl text-sm outline-none focus:ring-1 focus:ring-[#7b8a5b]">
                </div>
                <div class="space-y-1">
                    <label class="text-[9px] uppercase tracking-widest text-stone-400 font-bold">Marching Order (1, 2, 3...)</label>
                    <input type="number" id="editMarchingOrder" value="${
                      guest.marchingOrder || 0
                    }" class="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl text-sm outline-none focus:ring-1 focus:ring-[#7b8a5b]">
                </div>
            </div>

            <div class="pt-2">
                <button id="saveGuestBtn" onclick="saveGuestEdit('${
                  guest.id
                }')" class="w-full bg-[#7b8a5b] text-white py-3 rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-lg shadow-[#7b8a5b]/20 flex justify-center items-center">
                    <span>Save Changes</span>
                </button>
            </div>
        </div>
    `);

  const photoInput = document.getElementById("photoInput");
  photoInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (re) =>
        (document.getElementById("modalPhotoPreview").src = re.target.result);
      reader.readAsDataURL(file);
    }
  };
};

async function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.7);
      };
    };
  });
}

window.saveGuestEdit = async (id) => {
  const btn = document.getElementById("saveGuestBtn");
  const name = document.getElementById("editName").value.trim();
  const nickname = document.getElementById("editNickname").value.trim();
  const role = document.getElementById("editRole").value;
  const gender = document.getElementById("editGender").value;
  const age = document.getElementById("editAge").value.trim();
  const marchingOrder = parseInt(document.getElementById("editMarchingOrder").value) || 0;
  const photoInput = document.getElementById("photoInput");

  if (!name) return;
  btn.disabled = true;
  btn.innerHTML = `<span class="material-icons animate-spin text-sm">sync</span>`;

  let updateData = { name, nickname, role, gender, age, marchingOrder };

  if (photoInput.files[0]) {
    const compressedBlob = await compressImage(photoInput.files[0]);
    const storageRef = sRef(storage, `entourage/${id}.jpg`);
    await uploadBytes(storageRef, compressedBlob);
    const downloadURL = await getDownloadURL(storageRef);
    updateData.photoUrl = downloadURL;
  }

  await update(ref(db, `guestList/${id}`), updateData);
  closeModal();
};

window.openDeleteModal = (id) => {
  const guest = allData.find((g) => g.id === id);
  showModal(`
        <div class="p-6 text-center space-y-4">
            <div class="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-2">
                <span class="material-icons text-3xl">delete_outline</span>
            </div>
            h3 class="serif text-xl italic text-stone-800">Delete Guest?</h3>
            <p class="text-sm text-stone-500 leading-relaxed">Are you sure you want to remove <span class="font-bold text-stone-700">${guest.name}</span> from the guest list?</p>
            <div class="grid grid-cols-2 gap-3 pt-2">
                <button onclick="closeModal()" class="py-3 border border-stone-100 rounded-xl text-[10px] font-bold uppercase tracking-widest text-stone-400">Cancel</button>
                <button onclick="confirmDelete('${id}')" class="py-3 bg-red-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-red-500/20">Delete</button>
            </div>
        </div>
    `);
};

window.confirmDelete = async (id) => {
  await remove(ref(db, `guestList/${id}`));
  closeModal();
};

window.copyInviteText = (id) => {
  const guest = allData.find((g) => g.id === id);
  const nameToUse = guest.nickname || guest.name.trim().split(" ")[0];

  const inviteText = `Hi ${nameToUse}!

Invited ka sa kasal namin ni Karla this coming July 2, 2026! 🤍

Kindly RSVP sa website namin if you can go, preferably before JUNE 1 sana: https://charliekarlawedding.vercel.app

Nandito na rin yung details ng wedding like kung ano susuotin, time and place.

One quick request: Please refrain from sharing the wedding details to others as limited lang ang seats namin, and we especially chose you to be part of our big day! See youuu!

If may other questions, chat nalang din. Thanks!`;

  navigator.clipboard
    .writeText(inviteText)
    .then(() => {
      showModal(`
        <div class="p-8 text-center space-y-4">
            <div class="w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto mb-2">
                <span class="material-icons text-3xl">check_circle</span>
            </div>
            <h3 class="serif text-xl italic text-stone-800">Invite Copied!</h3>
            <p class="text-sm text-stone-500">Message for <span class="font-bold text-stone-700">${nameToUse}</span> is ready to be pasted.</p>
            <div class="pt-2">
                <button onclick="closeModal()" class="w-full bg-stone-900 text-white py-3 rounded-xl font-bold text-[10px] uppercase tracking-widest">Great</button>
            </div>
        </div>
    `);
    })
    .catch((err) => {
      console.error("Error copying text: ", err);
    });
};

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
  openEditModal(id);
};

window.deleteGuest = async (id) => {
  openDeleteModal(id);
};

const toggleSortName = () => {
  sortConfig.direction = sortConfig.direction === "asc" ? "desc" : "asc";
  sortConfig.key = "name";
  currentPage = 1;
  render();
};

document.getElementById("sortName").onclick = toggleSortName;
document.getElementById("mobSortName").onclick = toggleSortName;

document.getElementById("searchInput").oninput = (e) => {
  searchTerm = e.target.value;
  currentPage = 1;
  render();
};

document.getElementById("filterSide").onchange = (e) => {
  filterSide = e.target.value;
  currentPage = 1;
  render();
};

document.getElementById("filterStatus").onchange = (e) => {
  filterStatus = e.target.value;
  currentPage = 1;
  render();
};

document.getElementById("filterInvited").onchange = (e) => {
  filterInvited = e.target.value;
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

function renderEntourage() {
  const gallery = document.getElementById("entourage-container");
  const table = document.getElementById("entourageTableBody");
  gallery.innerHTML = "";
  table.innerHTML = "";

  // Entourage logic: Role exists and is NOT "guest" or "none"
  const entourageData = allData.filter(
    (g) =>
      g.role &&
      g.role.toLowerCase() !== "guest" &&
      g.role.toLowerCase() !== "none"
  );

  if (entourageData.length === 0) {
    gallery.innerHTML = `<div class="col-span-full py-12 text-center text-stone-400 italic text-sm">Assign roles in the Guest List to populate the Entourage...</div>`;
    table.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-stone-400 italic">No entourage members assigned.</td></tr>`;
    return;
  }

  // VERTICAL MARCH GALLERY RENDERING
  MARCHING_ORDER.forEach((group) => {
    const membersInGroup = entourageData
      .filter((p) => group.roles.includes(p.role))
      .sort((a, b) => (a.marchingOrder || 0) - (b.marchingOrder || 0));

    if (membersInGroup.length === 0) return;

    // Category Header
    const rowHeader = document.createElement("div");
    rowHeader.className = "w-full text-center";
    rowHeader.innerHTML = `<p class="serif italic text-[#7b8a5b] text-sm uppercase tracking-widest mb-4 opacity-60">— ${group.label} —</p>`;
    gallery.appendChild(rowHeader);

    // Categories Row: Updated grid with centering for solo/orphaned rows
    const row = document.createElement("div");
    row.className = "grid grid-cols-2 gap-x-4 md:gap-x-12 gap-y-10 w-full max-w-2xl mx-auto justify-items-center";

    membersInGroup.forEach((person, index) => {
      const card = document.createElement("div");
      // If there's an odd number of items and this is the last one, center it across 2 cols
      const isSolo = membersInGroup.length % 2 !== 0 && index === membersInGroup.length - 1;
      card.className = `${isSolo ? "col-span-2" : ""} flex flex-col items-center text-center space-y-3 group min-w-[120px] cursor-pointer hover:scale-105 transition-all duration-300`;
      
      card.onclick = () => openEditModal(person.id);
      const avatar =
        person.photoUrl ||
        `https://ui-avatars.com/api/?name=${person.name}&background=7b8a5b&color=fff`;

      card.innerHTML = `
            <div class="relative">
                <div class="w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden border-2 border-stone-100 shadow-sm group-hover:border-[#7b8a5b] transition-all duration-300">
                    <img src="${avatar}" class="w-full h-full object-cover">
                </div>
                ${
                  person.gender
                    ? `<span class="absolute -bottom-1 -right-1 bg-white shadow-md rounded-full w-6 h-6 flex items-center justify-center text-[10px]">${
                        person.gender === "Male" ? "👔" : "👗"
                      }</span>`
                    : ""
                }
            </div>
            <div>
                <p class="text-[12px] font-bold text-stone-800 leading-tight">${
                  person.name
                }</p>
                <p class="text-[9px] uppercase tracking-widest text-[#7b8a5b] font-bold mt-1">${
                  person.role
                }</p>
            </div>
        `;
      row.appendChild(card);
    });
    gallery.appendChild(row);

    // Decorative Separator
    const divider = document.createElement("div");
    divider.className = "w-12 h-px bg-stone-100 my-4";
    gallery.appendChild(divider);
  });

  // MANAGEMENT TABLE RENDERING
  const priority = ENTOURAGE_ROLES;
  entourageData.sort(
    (a, b) => priority.indexOf(a.role) - priority.indexOf(b.role)
  );

  entourageData.forEach((person) => {
    const avatar =
      person.photoUrl ||
      `https://ui-avatars.com/api/?name=${person.name}&background=7b8a5b&color=fff`;
    const row = document.createElement("tr");
    row.className = "border-b border-stone-100 hover:bg-stone-50 transition";
    row.innerHTML = `
        <td class="p-4">
            <div class="flex items-center gap-3">
                <img src="${avatar}" class="w-8 h-8 rounded-full object-cover border border-stone-200">
                <span class="font-bold text-stone-800">${person.name}</span>
            </div>
        </td>
        <td class="p-4 font-bold text-[#7b8a5b] uppercase text-[9px] tracking-widest">${
          person.role
        }</td>
        <td class="p-4 text-stone-400">${person.age || "--"} • ${
      person.gender || "--"
    }</td>
        <td class="p-4 text-right">
            <button onclick="openEditModal('${
              person.id
            }')" class="text-blue-500 hover:underline font-bold uppercase tracking-tighter">Edit</button>
        </td>
    `;
    table.appendChild(row);
  });
}

window.updateGuestSide = async (id, newSide) => {
  await update(ref(db, `guestList/${id}`), { side: newSide });
};

window.updateInvitedStatus = async (id, newInvited) => {
  await update(ref(db, `guestList/${id}`), { invited: newInvited });
};

init();