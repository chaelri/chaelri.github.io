import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  set,
  get,
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
import { TAG_DEFS, tagDef } from "./tags.js";

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
let hidePending = false;
let hideNo = false;
let currentPage = 1;

function escapeAttr(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// Match rsvp.guestName ↔ guestList.name even when one side has stray spaces
// (trailing, leading, or doubled-internal). Mirrors the same helper in
// weddingtest/script.js so the dashboard read is tolerant of legacy records.
const normalizeName = (s) =>
  String(s || "").trim().replace(/\s+/g, " ").toLowerCase();

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
        // Take the LATEST response by submittedAt so manual overrides win
        // when there are also website RSVPs for the same name.
        const guestKey = normalizeName(guest.name);
        const matches = rsvps
          .filter((r) => r.guestName && normalizeName(r.guestName) === guestKey)
          .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
        const response = matches[0];
        // Source is STICKY: once a guest has ever submitted via the website
        // (any non-manual entry), their source stays "web" — quick-marking
        // from the dashboard just changes the status, not the origin tag.
        const hasWebEntry = matches.some((r) => r.manual !== true);
        const source = hasWebEntry ? "web" : (response ? "manual" : "none");
        return {
          id,
          name: guest.name,
          nickname: guest.nickname || "",
          side: guest.side || "both",
          status: response ? response.attending : "pending",
          submittedAt: response ? response.submittedAt : null,
          rsvpSource: source,
          invited: guest.invited || "no",
          role: guest.role || "guest",
          gender: guest.gender || "",
          age: guest.age || "",
          photoUrl: guest.photoUrl || "",
          marchingOrder: guest.marchingOrder || 0,
          noCount: guest.noCount === true,
          tags: Array.isArray(guest.tags) ? guest.tags : [],
          pairWith: guest.pairWith || "",
          followedUp: guest.followedUp === true,
          // Final Check is set either manually via the dashboard checkbox or
          // automatically when a website RSVP comes in (yes → true,
          // no → false). Default to false so unchecked rows render correctly.
          finalChecked: guest.finalChecked === true,
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
    const passesHidePending = !hidePending || item.status !== "pending";
    const passesHideNo = !hideNo || item.status !== "no";
    return (
      matchesSearch &&
      matchesSide &&
      matchesStatus &&
      matchesInvited &&
      passesHidePending &&
      passesHideNo
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
                    ${
                      guest.noCount
                        ? `<span class="text-[8px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter" title="Lap child — not counted in food">Lap</span>`
                        : ""
                    }
                    ${(guest.tags || [])
                      .map((id) => tagDef(id))
                      .filter(Boolean)
                      .map(
                        (t) =>
                          `<span class="text-[8px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter" style="background:${t.bg};color:${t.fg}">${t.label}</span>`
                      )
                      .join("")}
                    ${(() => {
                      if (!guest.pairWith) return "";
                      const partner = allData.find(
                        (g) => g.id === guest.pairWith
                      );
                      if (!partner) return "";
                      return `<span class="inline-flex items-center gap-1 text-[8px] bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter" title="Paired with ${escapeAttr(
                        partner.name
                      )}"><span class="material-icons" style="font-size:9px">favorite</span>${escapeAttr(
                        partner.name.split(" ")[0]
                      )}</span>`;
                    })()}
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

  // --- STATS LOGIC ---
  // Headcount cards count only invited, non-lap-child guests, so the top
  // stats line up with the RSVP Tracker buckets (which also gate on
  // invited === "yes"). Lap children get their own row below; guests still
  // being considered (invited !== "yes") are intentionally out of the totals.
  const countable = allData.filter(
    (g) => !g.noCount && g.invited === "yes"
  );
  const entourageOnly = countable.filter(
    (g) =>
      g.role &&
      g.role.toLowerCase() !== "guest" &&
      g.role.toLowerCase() !== "none"
  );

  document.getElementById("stat-total").innerText = countable.filter(
    (g) => g.status === "yes" || g.status === "pending"
  ).length;

  document.getElementById("stat-yes").innerText = countable.filter(
    (g) => g.status === "yes"
  ).length;

  document.getElementById("stat-no").innerText = countable.filter(
    (g) => g.status === "no"
  ).length;

  document.getElementById("stat-pending").innerText = countable.filter(
    (g) => g.status === "pending"
  ).length;

  document.getElementById("stat-karla").innerText = countable.filter(
    (g) => g.side === "karla"
  ).length;

  document.getElementById("stat-charlie").innerText = countable.filter(
    (g) => g.side === "charlie"
  ).length;

  document.getElementById("stat-both").innerText = countable.filter(
    (g) => g.side === "both"
  ).length;

  document.getElementById("stat-entourage-count").innerText =
    entourageOnly.length;

  document.getElementById("stat-lap").innerText = allData.filter(
    (g) => g.noCount
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
  renderEntourage();
  renderRsvpTracker();
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
        <div class="p-6 space-y-4">
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
                <div class="md:col-span-2 space-y-1">
                    <label class="text-[9px] uppercase tracking-widest text-stone-400 font-bold">Counting</label>
                    <label class="flex items-center gap-3 p-3 bg-stone-50 border border-stone-100 rounded-xl cursor-pointer hover:border-[#7b8a5b] transition">
                        <input type="checkbox" id="editNoCount" ${
                          guest.noCount ? "checked" : ""
                        } class="w-4 h-4 rounded border-stone-300 accent-[#7b8a5b] focus:ring-[#7b8a5b]" style="accent-color: #7b8a5b">
                        <div class="flex-1">
                            <div class="text-sm font-medium text-stone-700">Lap child — not counted in food</div>
                            <div class="text-[10px] text-stone-400 mt-0.5">Still takes a seat & is searchable in seating, but excluded from the table's pax count.</div>
                        </div>
                    </label>
                </div>
                <div class="md:col-span-2 space-y-2">
                    <label class="text-[9px] uppercase tracking-widest text-stone-400 font-bold">Tags <span class="text-stone-300 normal-case font-normal lowercase">(tap to toggle)</span></label>
                    <div id="editTags" class="flex flex-wrap gap-2">
                        ${TAG_DEFS.map((t) => {
                          const on = (guest.tags || []).includes(t.id);
                          return `<button type="button" data-tag="${t.id}" class="edit-tag-pill" data-active="${on ? "1" : "0"}" style="--tag-bg:${t.bg};--tag-fg:${t.fg};--tag-dot:${t.dot}">
                            <span class="dot"></span>${t.label}
                          </button>`;
                        }).join("")}
                    </div>
                </div>
                <div class="md:col-span-2 space-y-1">
                    <label class="text-[9px] uppercase tracking-widest text-stone-400 font-bold">Sits With <span class="text-stone-300 normal-case font-normal lowercase">(bf/gf, plus-one, etc. — leave empty for none)</span></label>
                    <input type="text" id="editPairWith" list="pairWithList" placeholder="Type a name…"
                        value="${
                          guest.pairWith
                            ? escapeAttr(
                                (allData.find((g) => g.id === guest.pairWith) || {}).name || ""
                              )
                            : ""
                        }"
                        class="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl text-sm outline-none focus:ring-1 focus:ring-[#7b8a5b]">
                    <datalist id="pairWithList">
                        ${allData
                          .filter((g) => g.id !== guest.id)
                          .map(
                            (g) =>
                              `<option value="${escapeAttr(g.name)}"></option>`
                          )
                          .join("")}
                    </datalist>
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

  // Tag pill toggles
  document.querySelectorAll(".edit-tag-pill").forEach((pill) => {
    pill.onclick = () => {
      const cur = pill.dataset.active === "1";
      pill.dataset.active = cur ? "0" : "1";
    };
  });
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
  const noCount = document.getElementById("editNoCount").checked;
  const tags = [...document.querySelectorAll(".edit-tag-pill")]
    .filter((p) => p.dataset.active === "1")
    .map((p) => p.dataset.tag);
  const pairNameRaw = document.getElementById("editPairWith").value.trim();
  let newPairId = "";
  if (pairNameRaw) {
    const target = pairNameRaw.toLowerCase();
    const match = allData.find(
      (g) => g.id !== id && g.name.toLowerCase() === target
    );
    if (match) newPairId = match.id;
    // If user typed something that didn't match, fail soft: treat as empty.
  }
  const photoInput = document.getElementById("photoInput");

  if (!name) return;
  btn.disabled = true;
  btn.innerHTML = `<span class="material-icons animate-spin text-sm">sync</span>`;

  let updateData = {
    name,
    nickname,
    role,
    gender,
    age,
    marchingOrder,
    noCount,
    tags,
    pairWith: newPairId,
  };

  if (photoInput.files[0]) {
    const compressedBlob = await compressImage(photoInput.files[0]);
    const storageRef = sRef(storage, `entourage/${id}.jpg`);
    await uploadBytes(storageRef, compressedBlob);
    const downloadURL = await getDownloadURL(storageRef);
    updateData.photoUrl = downloadURL;
  }

  // Symmetric pair management:
  // - If this guest had a previous partner that's now removed/changed,
  //   clear the old partner's pairWith too.
  // - If a new partner is set, write the reverse link AND clear that
  //   partner's previous link if they were paired with someone else.
  const currentGuest = allData.find((g) => g.id === id) || {};
  const prevPairId = currentGuest.pairWith || "";
  const tasks = [update(ref(db, `guestList/${id}`), updateData)];

  if (prevPairId && prevPairId !== newPairId) {
    tasks.push(update(ref(db, `guestList/${prevPairId}`), { pairWith: "" }));
  }
  if (newPairId) {
    const newPartner = allData.find((g) => g.id === newPairId);
    if (newPartner && newPartner.pairWith && newPartner.pairWith !== id) {
      tasks.push(
        update(ref(db, `guestList/${newPartner.pairWith}`), { pairWith: "" })
      );
    }
    tasks.push(update(ref(db, `guestList/${newPairId}`), { pairWith: id }));
  }

  await Promise.all(tasks);
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
// Quick-mark logic: preserve a guest's ORIGINAL website RSVP (Discord-fed
// entry) and only manage the manual-override layer on top of it.
//
//   - new status === "pending"    → wipe manual entries only (revert to whatever
//                                   the website said, or truly pending if none)
//   - new status matches website  → wipe manual entries (no override needed)
//   - new status differs          → wipe existing manual entries + push one new
//                                   manual entry with the chosen status
//
// Net effect: the Source badge stays "Website" as long as the guest ever
// RSVP'd via the site, even after Charlie/Karla quick-mark from the dashboard.
window.updateManualStatus = async (guestName, newStatus) => {
  const rsvpRef = ref(db, "rsvps");
  const snap = await get(rsvpRef);
  const data = snap.val() || {};
  const guestKey = normalizeName(guestName);
  const entries = Object.entries(data)
    .filter(([, v]) => normalizeName(v.guestName) === guestKey)
    .map(([key, v]) => ({ key, ...v }));

  // Latest website (non-manual) RSVP, if any
  const webEntry = entries
    .filter((e) => e.manual !== true)
    .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0))[0];

  // Remove all manual entries for this guest (we'll rewrite below if needed)
  await Promise.all(
    entries
      .filter((e) => e.manual === true)
      .map((e) => remove(ref(db, `rsvps/${e.key}`)))
  );

  // If resetting OR the new status already matches the website RSVP, leave it
  // as just the website entry — no manual override needed.
  if (newStatus === "pending") return;
  if (webEntry && webEntry.attending === newStatus) return;

  await push(ref(db, "rsvps"), {
    guestName,
    attending: newStatus,
    submittedAt: new Date().toISOString(),
    manual: true,
  });
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

document.getElementById("hidePending").onchange = (e) => {
  hidePending = e.target.checked;
  currentPage = 1;
  render();
};

document.getElementById("hideNo").onchange = (e) => {
  hideNo = e.target.checked;
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

let _visitorCache = {};
function initVisitorLogs() {
  onValue(ref(db, "visitorLogs"), (snapshot) => {
    _visitorCache = snapshot.val() || {};
    renderVisitorLogs(_visitorCache);
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

  const totalPages = Math.ceil(entries.length / VISITOR_PER_PAGE);
  if (visitorCurrentPage > totalPages && totalPages > 0) visitorCurrentPage = totalPages;
  if (visitorCurrentPage < 1) visitorCurrentPage = 1;
  const startIdx = (visitorCurrentPage - 1) * VISITOR_PER_PAGE;
  const pageEntries = entries.slice(startIdx, startIdx + VISITOR_PER_PAGE);

  pageEntries.forEach((visitor) => {
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

  buildMiniPagination(
    "visitor-pagination-container",
    "visitor-page-indicator",
    totalPages,
    visitorCurrentPage,
    (p) => {
      visitorCurrentPage = p;
      renderVisitorLogs(_visitorCache);
    }
  );

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

// Page state for sub-tables that paginate independently of the main guest grid.
let finalCurrentPage = 1;
let visitorCurrentPage = 1;
const FINAL_PER_PAGE = 5;
const VISITOR_PER_PAGE = 10;

function buildMiniPagination(containerId, indicatorId, totalPages, current, onChange) {
  const container = document.getElementById(containerId);
  const indicator = document.getElementById(indicatorId);
  if (!container || !indicator) return;
  container.innerHTML = "";
  indicator.innerText = totalPages === 0
    ? "Page 0 of 0"
    : `Page ${current} of ${totalPages}`;
  if (totalPages <= 1) return;

  const prev = document.createElement("button");
  prev.className = "pag-btn";
  prev.innerHTML = `<span class="material-icons" style="font-size:14px;">chevron_left</span>`;
  prev.disabled = current === 1;
  prev.onclick = () => onChange(current - 1);
  container.appendChild(prev);

  // Compact window of up to 5 pages around the current page
  const windowSize = 5;
  let start = Math.max(1, current - Math.floor(windowSize / 2));
  let end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  for (let p = start; p <= end; p++) {
    const btn = document.createElement("button");
    btn.className = `pag-btn ${p === current ? "active" : ""}`;
    btn.innerText = p;
    btn.onclick = () => onChange(p);
    container.appendChild(btn);
  }

  const next = document.createElement("button");
  next.className = "pag-btn";
  next.innerHTML = `<span class="material-icons" style="font-size:14px;">chevron_right</span>`;
  next.disabled = current === totalPages;
  next.onclick = () => onChange(current + 1);
  container.appendChild(next);
}

function renderFinalList() {
  const finalListBody = document.getElementById("finalGuestTableBody");
  finalListBody.innerHTML = "";
  // Exclude lap children — they're not counted toward the confirmed guest total.
  const confirmedGuests = allData
    .filter((g) => g.status === "yes" && !g.noCount)
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  document.getElementById(
    "final-count-badge"
  ).innerText = `${confirmedGuests.length} Confirmed Guests`;
  if (confirmedGuests.length === 0) {
    finalListBody.innerHTML = `<tr><td colspan="3" class="p-8 text-center text-stone-400 italic">No confirmed guests yet...</td></tr>`;
    buildMiniPagination("final-pagination-container", "final-page-indicator", 0, 0, () => {});
    return;
  }

  const totalPages = Math.ceil(confirmedGuests.length / FINAL_PER_PAGE);
  if (finalCurrentPage > totalPages) finalCurrentPage = totalPages;
  if (finalCurrentPage < 1) finalCurrentPage = 1;
  const startIdx = (finalCurrentPage - 1) * FINAL_PER_PAGE;
  const pageRows = confirmedGuests.slice(startIdx, startIdx + FINAL_PER_PAGE);

  pageRows.forEach((guest) => {
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

  buildMiniPagination(
    "final-pagination-container",
    "final-page-indicator",
    totalPages,
    finalCurrentPage,
    (p) => {
      finalCurrentPage = p;
      renderFinalList();
    }
  );
}

// ----- RSVP Tracker -------------------------------------------------------
// Lets Charlie + Karla finalize the list before the June 1 deadline. Shows
// who responded via the website, who they marked manually, and who still
// needs a nudge. State is driven entirely by allData[].
let rsvpFilter   = "all";     // status chip
let rsvpSide     = "all";     // side chip (Karla / Charlie / Both / All)
let rsvpFollowup = "all";     // followed-up chip (all / yes / no)
let rsvpSearch   = "";
let rsvpPage     = 1;
let rsvpPageSize = 50;        // 0 = show all

function rsvpBucket(g) {
  // Bucket used by both the stat cards and the filter chips. "final-yes" is
  // a synthetic bucket layered on top of yes-* so the Final-Yes chip works
  // without breaking the existing yes-web / yes-manual split — a guest can
  // only fall in final-yes if their RSVP is yes AND finalChecked is true.
  if (g.invited !== "yes") return "not-invited";
  if (g.status === "yes") return g.rsvpSource === "manual" ? "yes-manual" : "yes-web";
  if (g.status === "no") return "no";
  return "pending";
}

// Final-Yes is a cross-cut of bucket + finalChecked, applied as an extra
// filter (not a bucket replacement) so the existing stat cards stay
// accurate.
function passesRsvpFilter(g) {
  if (rsvpFilter === "all") return true;
  if (rsvpFilter === "final-yes") return g.status === "yes" && g.finalChecked === true;
  // "Remaining" = the punch list. Guests who still need an action from
  // Charlie / Karla: either they haven't responded (pending → needs a
  // follow-up nudge) or they said yes but haven't been locked in yet
  // (needs a final attendance check). Declined and Final-Yes are done.
  if (rsvpFilter === "remaining") {
    return g.status === "pending" || (g.status === "yes" && g.finalChecked !== true);
  }
  return rsvpBucket(g) === rsvpFilter;
}

function renderRsvpTracker() {
  const body = document.getElementById("rsvpTrackerBody");
  const cards = document.getElementById("rsvp-stat-cards");
  const empty = document.getElementById("rsvp-empty");
  if (!body || !cards) return;

  const invited = allData.filter((g) => g.invited === "yes");

  // ----- Stat cards
  const counts = { pending: 0, "yes-web": 0, "yes-manual": 0, no: 0, "final-yes": 0 };
  for (const g of invited) {
    const b = rsvpBucket(g);
    if (b in counts) counts[b]++;
    // Final Yes is a cross-cut, not a bucket — count it separately.
    if (g.status === "yes" && g.finalChecked === true) counts["final-yes"]++;
  }
  const STAT_CARDS = [
    { key: "yes-web",    label: "Yes · Website", value: counts["yes-web"],    hint: "Came in via the site" },
    { key: "yes-manual", label: "Yes · Manual",  value: counts["yes-manual"], hint: "Marked by Karla / Charlie" },
    { key: "no",         label: "Declined",      value: counts.no,            hint: "Not attending" },
    { key: "final-yes",  label: "Final Yes ✓",   value: counts["final-yes"],  hint: "Locked-in attendees" },
  ];
  cards.innerHTML = STAT_CARDS.map((s) => `
    <div class="rsvp-stat-card ${rsvpFilter === s.key ? "active" : ""}" data-card="${s.key}">
      <div class="stat-label">${s.label}</div>
      <div class="stat-value">${s.value}</div>
      <div class="text-[10px] text-stone-400 mt-0.5">${s.hint}</div>
    </div>
  `).join("");
  cards.querySelectorAll(".rsvp-stat-card").forEach((el) => {
    el.addEventListener("click", () => {
      rsvpFilter = el.dataset.card;
      renderRsvpTracker();
    });
  });

  // ----- Status filter chips
  document.querySelectorAll(".rsvp-chip").forEach((el) => {
    el.classList.toggle("active", el.dataset.filter === rsvpFilter);
    el.onclick = () => {
      rsvpFilter = el.dataset.filter;
      rsvpPage = 1;
      renderRsvpTracker();
    };
  });

  // ----- Side filter chips (Karla / Charlie / Both / All)
  document.querySelectorAll(".rsvp-side-chip").forEach((el) => {
    el.classList.toggle("active", el.dataset.side === rsvpSide);
    el.onclick = () => {
      rsvpSide = el.dataset.side;
      rsvpPage = 1;
      renderRsvpTracker();
    };
  });

  // ----- Followed-up filter chips (All / Yes / No)
  document.querySelectorAll(".rsvp-followup-chip").forEach((el) => {
    el.classList.toggle("active", el.dataset.followup === rsvpFollowup);
    el.onclick = () => {
      rsvpFollowup = el.dataset.followup;
      rsvpPage = 1;
      renderRsvpTracker();
    };
  });

  // ----- Search input (lazy-bind once)
  const searchEl = document.getElementById("rsvp-search");
  if (searchEl && !searchEl.dataset.bound) {
    searchEl.dataset.bound = "1";
    searchEl.addEventListener("input", (e) => {
      rsvpSearch = e.target.value.toLowerCase().trim();
      rsvpPage = 1;
      renderRsvpTracker();
    });
  }
  if (searchEl) searchEl.value = rsvpSearch;

  // ----- Page-size selector (lazy-bind once)
  const pageSizeEl = document.getElementById("rsvp-page-size");
  if (pageSizeEl && !pageSizeEl.dataset.bound) {
    pageSizeEl.dataset.bound = "1";
    pageSizeEl.addEventListener("change", (e) => {
      rsvpPageSize = Number(e.target.value) || 0;
      rsvpPage = 1;
      renderRsvpTracker();
    });
  }
  if (pageSizeEl) pageSizeEl.value = String(rsvpPageSize);

  // ----- Apply filters + search
  let rows = invited;
  rows = rows.filter(passesRsvpFilter);
  if (rsvpSide !== "all") {
    rows = rows.filter((g) => g.side === rsvpSide);
  }
  if (rsvpFollowup === "yes") {
    rows = rows.filter((g) => g.followedUp === true);
  } else if (rsvpFollowup === "no") {
    rows = rows.filter((g) => g.followedUp !== true);
  }
  if (rsvpSearch) {
    rows = rows.filter(
      (g) => g.name.toLowerCase().includes(rsvpSearch) ||
             (g.nickname || "").toLowerCase().includes(rsvpSearch)
    );
  }
  // Sort: pending first (oldest invitation), then by response date desc
  rows.sort((a, b) => {
    const sa = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
    const sb = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (b.status === "pending" && a.status !== "pending") return 1;
    return sb - sa || a.name.localeCompare(b.name);
  });

  // ----- Pagination — slice rows + draw the page-button strip.
  const total = rows.length;
  const pageSize = rsvpPageSize > 0 ? rsvpPageSize : Math.max(total, 1);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (rsvpPage > pageCount) rsvpPage = pageCount;
  if (rsvpPage < 1) rsvpPage = 1;
  const start = (rsvpPage - 1) * pageSize;
  const visible = rsvpPageSize > 0 ? rows.slice(start, start + pageSize) : rows;

  // ----- Card view ↔ Table view. The Remaining filter renders as a grid of
  // action cards (followed-up + final-check toggles inline) so Charlie + Karla
  // can clear the punch list at a glance. All other filters use the table.
  const isCardView = rsvpFilter === "remaining";
  const tableWrap = document.getElementById("rsvpTrackerTableWrap");
  const cardsWrap = document.getElementById("rsvpTrackerCards");
  const cardsGrid = document.getElementById("rsvp-cards-grid");
  const cardsEmpty = document.getElementById("rsvp-cards-empty");
  if (tableWrap && cardsWrap) {
    tableWrap.classList.toggle("hidden", isCardView);
    cardsWrap.classList.toggle("hidden", !isCardView);
  }
  if (isCardView) {
    body.innerHTML = "";
    empty.classList.add("hidden");
    if (cardsGrid) cardsGrid.innerHTML = visible.map((g) => rsvpCardHtml(g)).join("");
    if (cardsEmpty) cardsEmpty.classList.toggle("hidden", rows.length > 0);
  } else {
    empty.classList.toggle("hidden", rows.length > 0);
    body.innerHTML = visible.map((g) => rsvpRowHtml(g)).join("");
  }
  renderRsvpPagination(total, pageCount);
}

// Sliding-window pagination strip. Shows first / last / current ± 2 with
// ellipses, plus prev / next arrows. Skips the strip entirely if "Show all"
// is on or the result set fits in a single page.
function renderRsvpPagination(total, pageCount) {
  const indicator = document.getElementById("rsvp-page-indicator");
  const strip = document.getElementById("rsvp-pagination");
  if (!indicator || !strip) return;
  if (rsvpPageSize === 0 || total === 0) {
    indicator.textContent = total === 0
      ? "No results"
      : `Showing all ${total}`;
    strip.innerHTML = "";
    return;
  }
  const pageSize = rsvpPageSize;
  const start = (rsvpPage - 1) * pageSize + 1;
  const end = Math.min(rsvpPage * pageSize, total);
  indicator.textContent = `Showing ${start}–${end} of ${total} · Page ${rsvpPage} of ${pageCount}`;

  if (pageCount <= 1) {
    strip.innerHTML = "";
    return;
  }

  const win = new Set([1, pageCount, rsvpPage - 1, rsvpPage, rsvpPage + 1]);
  if (rsvpPage <= 3) [1, 2, 3, 4, 5].forEach((p) => win.add(p));
  if (rsvpPage >= pageCount - 2) [pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount].forEach((p) => win.add(p));
  const pages = [...win].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);

  const parts = [];
  parts.push(`<button class="rsvp-page-btn" data-page="${rsvpPage - 1}" ${rsvpPage === 1 ? "disabled" : ""}>‹</button>`);
  let prev = 0;
  for (const p of pages) {
    if (p - prev > 1) parts.push(`<span class="rsvp-page-ellipsis">…</span>`);
    parts.push(`<button class="rsvp-page-btn ${p === rsvpPage ? "active" : ""}" data-page="${p}">${p}</button>`);
    prev = p;
  }
  parts.push(`<button class="rsvp-page-btn" data-page="${rsvpPage + 1}" ${rsvpPage === pageCount ? "disabled" : ""}>›</button>`);
  strip.innerHTML = parts.join("");

  strip.querySelectorAll(".rsvp-page-btn").forEach((btn) => {
    btn.onclick = () => {
      const p = Number(btn.dataset.page);
      if (Number.isInteger(p) && p >= 1 && p <= pageCount) {
        rsvpPage = p;
        renderRsvpTracker();
      }
    };
  });
}

function rsvpRowHtml(g) {
  const status = g.status || "pending";
  const sideClr = g.side === "karla" ? "text-rose-500"
                : g.side === "charlie" ? "text-sky-600" : "text-stone-500";
  const when = g.submittedAt
    ? new Date(g.submittedAt).toLocaleString("en-US", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "—";
  const sourceBadge = g.rsvpSource === "web"
    ? `<span class="rsvp-source web"><span class="material-icons" style="font-size:11px">public</span>Website</span>`
    : g.rsvpSource === "manual"
    ? `<span class="rsvp-source manual"><span class="material-icons" style="font-size:11px">edit</span>Manual</span>`
    : `<span class="rsvp-source none">no response yet</span>`;
  const statusLabel = status === "yes" ? "Attending"
    : status === "no" ? "Declined"
    : "Pending";
  const followedUpCell = `
    <label class="rsvp-followup">
      <input type="checkbox" data-followup-id="${g.id}" ${g.followedUp ? "checked" : ""} />
      <span class="rsvp-followup-box"></span>
    </label>`;
  // Final Check: a definitive "this guest's status is locked in, don't bug
  // me again" toggle. Pairs with the Final-Yes filter chip so Charlie can
  // surface only fully-confirmed attendees.
  const finalCheckCell = `
    <label class="rsvp-followup" title="Lock in this guest's final status">
      <input type="checkbox" data-finalcheck-id="${g.id}" ${g.finalChecked ? "checked" : ""} />
      <span class="rsvp-followup-box"></span>
    </label>`;
  const rowClass = g.finalChecked ? "rsvp-row final-checked" : "rsvp-row";
  return `
    <tr class="${rowClass}">
      <td class="p-3">
        <div class="font-semibold text-stone-800">${g.name}</div>
        ${g.nickname ? `<div class="text-[10px] text-stone-400">"${g.nickname}"</div>` : ""}
      </td>
      <td class="p-3 text-[10px] uppercase tracking-widest font-bold ${sideClr}">${g.side}</td>
      <td class="p-3"><span class="rsvp-badge ${status}">${statusLabel}</span></td>
      <td class="p-3">${sourceBadge}</td>
      <td class="p-3 text-xs text-stone-500">${when}</td>
      <td class="p-3 text-center">${followedUpCell}</td>
      <td class="p-3 text-center">${finalCheckCell}</td>
    </tr>
  `;
}

// Card view for the Remaining punch list. Same data + same checkbox event
// hooks as the table row (data-followup-id + data-finalcheck-id), so the
// delegated change handler below picks both UIs up without any new wiring.
// Each card surfaces the *reason* it's on the punch list as a small badge:
//   - status === "pending"           → "NEEDS RESPONSE" (no RSVP yet, nudge them)
//   - status === "yes" && !final     → "NEEDS FINAL CHECK" (said yes, confirm)
function rsvpCardHtml(g) {
  const sideClr = g.side === "karla" ? "text-rose-500"
                : g.side === "charlie" ? "text-sky-600" : "text-stone-500";
  const status = g.status || "pending";
  const statusLabel = status === "yes" ? "Attending" : status === "no" ? "Declined" : "Pending";
  const needsBadge = status === "pending"
    ? `<span class="rsvp-need need-followup">Needs response</span>`
    : `<span class="rsvp-need need-final">Needs final check</span>`;
  const when = g.submittedAt
    ? new Date(g.submittedAt).toLocaleString("en-US", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "—";
  return `
    <div class="rsvp-card">
      <div class="rsvp-card-head">
        <div class="rsvp-card-name">
          <div class="serif text-base font-semibold text-stone-800">${g.name}</div>
          ${g.nickname ? `<div class="text-[10px] text-stone-400 italic">"${g.nickname}"</div>` : ""}
        </div>
        ${needsBadge}
      </div>
      <div class="rsvp-card-meta">
        <span class="text-[10px] uppercase tracking-widest font-bold ${sideClr}">${g.side}</span>
        <span class="rsvp-badge ${status}">${statusLabel}</span>
        <span class="text-[10px] text-stone-400">${when}</span>
      </div>
      <div class="rsvp-card-actions">
        <label class="rsvp-card-toggle">
          <input type="checkbox" data-followup-id="${g.id}" ${g.followedUp ? "checked" : ""} />
          <span class="rsvp-followup-box"></span>
          <span>Followed up</span>
        </label>
        <label class="rsvp-card-toggle" title="Lock in this guest's final status">
          <input type="checkbox" data-finalcheck-id="${g.id}" ${g.finalChecked ? "checked" : ""} />
          <span class="rsvp-followup-box"></span>
          <span>Final check</span>
        </label>
      </div>
    </div>
  `;
}

// Delegated handler for the "Followed Up" + "Final Check" checkboxes.
// Both write straight to RTDB under guestList/<id>/<field>.
document.addEventListener("change", (e) => {
  const followup = e.target.closest("[data-followup-id]");
  if (followup) {
    const id = followup.dataset.followupId;
    if (id) set(ref(db, `guestList/${id}/followedUp`), followup.checked);
    return;
  }
  const finalCheck = e.target.closest("[data-finalcheck-id]");
  if (finalCheck) {
    const id = finalCheck.dataset.finalcheckId;
    if (id) set(ref(db, `guestList/${id}/finalChecked`), finalCheck.checked);
  }
});

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