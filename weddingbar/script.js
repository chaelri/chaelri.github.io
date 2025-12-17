// script.js (FULL — PART 1/2)

// =============================
// Firebase imports
// =============================
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  push,
  set,
  update,
  remove,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";

import {
  getStorage,
  ref as sRef,
  uploadBytes,
  deleteObject,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";

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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const storage = getStorage(app);

// =============================
// DOM refs
// =============================
const barsRoot = document.getElementById("bars");
const detailPanel = document.getElementById("detailPanel");
const addBtn = document.getElementById("addBtn");
const clearBtn = document.getElementById("clearBtn");

const nameInput = document.getElementById("name");
const totalInput = document.getElementById("total");
const paidInput = document.getElementById("paid");
const bookedInput = document.getElementById("booked");

const PATH = "weddingCosts";
const NEXT_PATH = "weddingNextSteps";
const GUESTS_PATH = "weddingGuests";

// restore main sort
let savedSort = localStorage.getItem("mainSort") || "none";

// ================
// Formatting helper
// ================
const fmt = (n) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(n);

// Escape HTML
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[m];
  });
}

// =======================================================
// RENDER COST BARS
// =======================================================
function render(items = [], sortType = "none") {
  // Sorting
  if (sortType === "booked") {
    items.sort((a, b) => (b.booked === true) - (a.booked === true));
  } else if (sortType === "totalHigh") {
    items.sort((a, b) => b.total - a.total);
  } else if (sortType === "totalLow") {
    items.sort((a, b) => a.total - b.total);
  } else if (sortType === "nameAZ") {
    items.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortType === "nameZA") {
    items.sort((a, b) => b.name.localeCompare(a.name));
  } else if (sortType === "notBooked") {
    items.sort((a, b) => (a.booked === true) - (b.booked === true));
  } else if (sortType === "paidLow") {
    items.sort((a, b) => (a.paid || 0) - (b.paid || 0));
  } else if (sortType === "paidHigh") {
    items.sort((a, b) => (b.paid || 0) - (a.paid || 0));
  } else if (sortType === "pctLow") {
    items.sort((a, b) => {
      const pA = a.total ? a.paid / a.total : 0;
      const pB = b.total ? b.paid / b.total : 0;
      return pA - pB;
    });
  } else if (sortType === "pctHigh") {
    items.sort((a, b) => {
      const pA = a.total ? a.paid / a.total : 0;
      const pB = b.total ? b.paid / b.total : 0;
      return pB - pA;
    });
  } else if (sortType === "priorityHigh") {
    const order = { high: 3, medium: 2, low: 1 };
    items.sort(
      (a, b) => order[b.priority || "low"] - order[a.priority || "low"]
    );
  } else if (sortType === "priorityLow") {
    const order = { high: 3, medium: 2, low: 1 };
    items.sort(
      (a, b) => order[a.priority || "low"] - order[b.priority || "low"]
    );
  }

  barsRoot.innerHTML = "";

  items.forEach((it) => {
    const pct =
      it.total === 0 && it.paid === 0
        ? 100
        : Math.min(100, Math.max(0, Math.round((it.paid / it.total) * 100)));

    const card = document.createElement("button");
    card.className = "bar-card";
    card.dataset.id = it.id;
    card.onclick = () => showDetails(it);

    const thumb = document.createElement("div");
    thumb.className = "bar-thumb";

    const fill = document.createElement("div");
    fill.className = "bar-fill";

    const text = document.createElement("div");
    text.className = "progress-text";
    text.textContent = it.booked || it.paid > 0 ? pct + "%" : "—";

    fill.appendChild(text);
    thumb.appendChild(fill);

    // Mobile animation
    if (window.innerWidth < 720) {
      fill.style.width = "0%";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fill.style.width = pct + "%";
          setTimeout(() => fill.classList.add("bounce"), 900);
          setTimeout(() => fill.classList.remove("bounce"), 1200);
        });
      });
    } else {
      fill.style.height = "0%";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fill.style.height = pct + "%";
          setTimeout(() => fill.classList.add("bounce"), 900);
          setTimeout(() => fill.classList.remove("bounce"), 1200);
        });
      });
    }

    const info = document.createElement("div");
    info.className = "bar-info";

    const title = document.createElement("div");
    title.className = "bar-title";
    title.textContent = it.name;

    const sub = document.createElement("div");
    sub.className = "bar-sub";
    sub.textContent = it.booked
      ? `${fmt(it.paid)} / ${fmt(it.total)}`
      : it.paid > 0
      ? `${fmt(it.paid)} / ${fmt(it.total)}`
      : `— / ${fmt(it.total)}`;

    info.appendChild(title);
    info.appendChild(sub);

    const priorityDot = document.createElement("div");
    priorityDot.className = "priority-dot " + (it.priority || "low");

    const chip = document.createElement("div");
    chip.className =
      "status-chip " + (it.booked ? "status-booked" : "status-not");
    chip.textContent = it.booked ? "Booked" : "Not booked";

    card.appendChild(thumb);
    card.appendChild(info);
    card.appendChild(chip);
    card.appendChild(priorityDot);

    barsRoot.appendChild(card);
  });
}

// =======================================================
// Countdown + summary
// =======================================================
const weddingDate = new Date("July 2, 2026 00:00:00").getTime();
let countdownMode = "days";

function updateCountdown() {
  const now = Date.now();
  const diff = weddingDate - now;

  if (diff <= 0) {
    document.getElementById("daysLeftNumber").textContent = "0";
    return;
  }

  let value = 0;
  let label;
  if (countdownMode === "days") {
    value = Math.floor(diff / (1000 * 60 * 60 * 24));
    label = "DAYS LEFT";
  } else if (countdownMode === "weeks") {
    value = Math.ceil(diff / (1000 * 60 * 60 * 24 * 7));
    label = "WEEKS LEFT";
  } else {
    value = Math.ceil(diff / (1000 * 60 * 60 * 24 * 30));
    label = "MONTHS LEFT";
  }

  document.getElementById("daysLeftNumber").textContent = value;
  document.getElementById("daysLeftLabel").textContent = label;
}

document.getElementById("daysLeftBox").onclick = () => {
  countdownMode =
    countdownMode === "days"
      ? "weeks"
      : countdownMode === "weeks"
      ? "months"
      : "days";
  updateCountdown();
};

updateCountdown();

function updateSummary(items = []) {
  let totalPaid = 0;
  let grandTotal = 0;

  items.forEach((it) => {
    totalPaid += Number(it.paid || 0);
    grandTotal += Number(it.total || 0);
  });

  document.getElementById("summaryPaid").textContent = fmt(totalPaid);
  document.getElementById("summaryTotal").textContent = fmt(grandTotal);

  const pct = grandTotal > 0 ? Math.round((totalPaid / grandTotal) * 100) : 0;

  const bookedCount = items.filter((it) => it.booked).length;
  const remainingItems = items.length - bookedCount;
  const remainingCosts = grandTotal - totalPaid;

  document.getElementById("statsBooked").textContent =
    bookedCount + " / " + items.length;
  document.getElementById("statsRemainingItems").textContent = remainingItems;
  document.getElementById("statsRemainingCosts").textContent =
    fmt(remainingCosts);

  animateCircleProgress(pct);
}

// =======================================================
// Circle animation
// =======================================================
function animateCircleProgress(targetPct) {
  const circle = document.getElementById("summaryProgressCircle");
  const text = document.getElementById("summaryPctText");

  const radius = 45;
  const circ = 2 * Math.PI * radius;

  let current = 0;
  const duration = 900;
  const start = performance.now();

  function frame(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = progress < 1 ? 1 - Math.pow(1 - progress, 3) : 1;
    current = Math.round(targetPct * eased);

    const offset = circ - (current / 100) * circ;
    circle.style.strokeDashoffset = offset;
    text.textContent = current + "%";

    if (progress < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

// =======================================================
// SHOW DETAILS (Your exact existing version – unchanged)
// =======================================================
function showDetails(it) {
  detailPanel.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom:10px;">
      <button id="backBtn"
        style="
          padding: 12px 18px;
          font-size: 14px;
          border-radius: 8px;
          border: none;
          background: rgba(255, 255, 255, 0.08);
          color: white;
          cursor: pointer;">
        Back
      </button>

      <div style="display:flex; gap:8px;">
        <button id="deleteBtn" class="btn ghost">Delete</button>
        <button id="updateBtn" class="btn">Update</button>
      </div>
    </div>

    <div style="margin-bottom:12px;">
      <div style="font-size:18px; font-weight:700; margin-bottom:4px;">
        ${escapeHtml(it.name)}
      </div>
      <div class="muted" style="font-size:12px;">
        Created: ${new Date(it.createdAt || 0).toLocaleString()}
      </div>
    </div>

    <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px;" class="detail-grid">

      <div>
        <label style="display:block;font-size:12px;margin-bottom:6px;">Name</label>
        <input id="detailName" type="text" value="${escapeHtml(it.name)}" />
      </div>

      <div>
        <label style="display:block;font-size:12px;margin-bottom:6px;">Booked</label>
        <label class="chk" style="display:inline-flex;align-items:center;">
          <input id="detailBooked" type="checkbox" ${
            it.booked ? "checked" : ""
          } />
          <span class="box" aria-hidden="true"></span>
          <span class="chk-label" style="margin-left:6px;">Booked</span>
        </label>
      </div>

      <div>
        <label style="display:block;font-size:12px;margin-bottom:6px;">Paid</label>
        <input id="detailPaid" type="number" value="${Number(it.paid) || 0}" />
      </div>

      <div>
        <label style="display:block;font-size:12px;margin-bottom:6px;">Total</label>
        <input id="detailTotal" type="number" value="${
          Number(it.total) || 0
        }" />
      </div>

      <div>
        <label style="display:block;font-size:12px;margin-bottom:6px;">Priority</label>
        <select id="detailPriority"
         style="width:100%; padding:10px; border-radius:10px; background:var(--card); color:white; border:1px solid rgba(255,255,255,0.06);">
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      <div style="margin-top:16px;">
        <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:6px;">
          Attachments
        </label>

        <div id="attachmentList" style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
        </div>

        <input type="file" id="attachInput" accept="image/*" multiple style="margin-bottom:10px;" />
      </div>
    </div>
  `;

  document.getElementById("chartSection").style.display = "none";
  document.getElementById("detailPriority").value = it.priority || "low";

  detailPanel.classList.add("show");
  detailPanel.style.display = "block";
  detailPanel.setAttribute("aria-hidden", "false");

  // =======================
  // Update button logic
  // =======================
  const updateBtn = document.getElementById("updateBtn");
  const deleteBtn = document.getElementById("deleteBtn");

  updateBtn.replaceWith(updateBtn.cloneNode(true));
  deleteBtn.replaceWith(deleteBtn.cloneNode(true));

  const updateBtn2 = document.getElementById("updateBtn");
  const deleteBtn2 = document.getElementById("deleteBtn");

  updateBtn2.onclick = async () => {
    const newName = document.getElementById("detailName").value.trim();
    const newPaid = Number(document.getElementById("detailPaid").value) || 0;
    const newTotal = Number(document.getElementById("detailTotal").value) || 0;
    const newBooked = document.getElementById("detailBooked").checked;
    const newPriority = document.getElementById("detailPriority").value;

    if (!newName) return alert("Please provide a name.");

    await updateEntry(it.id, {
      name: newName,
      paid: newPaid,
      total: newTotal,
      booked: newBooked,
      createdAt: it.createdAt || Date.now(),
      priority: newPriority,
    });

    listenRealtime();

    setTimeout(() => {
      const card = document.querySelector(`[data-id="${it.id}"]`);
      if (card) {
        card.classList.add("flash");
        setTimeout(() => card.classList.remove("flash"), 600);
      }
    }, 200);

    detailPanel.style.display = "none";
    detailPanel.classList.remove("show");
    detailPanel.setAttribute("aria-hidden", "true");

    document.getElementById("chartSection").style.display = "block";
    listenRealtime();
    showSaveToast();
  };

  // =======================
  // Delete cost item
  // =======================
  deleteBtn2.onclick = async () => {
    const ok = confirm(`Delete "${it.name}"?`);
    if (!ok) return;
    await deleteEntry(it.id);
    detailPanel.style.display = "none";
    detailPanel.classList.remove("show");
    detailPanel.setAttribute("aria-hidden", "true");
    document.getElementById("chartSection").style.display = "block";
    listenRealtime();
  };

  // =======================
  // Back
  // =======================
  document.getElementById("backBtn").onclick = () => {
    detailPanel.classList.remove("show");
    detailPanel.style.display = "none";
    detailPanel.setAttribute("aria-hidden", "true");
    document.getElementById("chartSection").style.display = "block";
    listenRealtime();
  };

  // =======================
  // Attachment list
  // =======================
  const listBox = document.getElementById("attachmentList");
  listBox.innerHTML = "";
  const attachments = it.attachments || [];

  attachments.forEach((att, idx) => {
    const wrap = document.createElement("div");
    wrap.style.position = "relative";

    const img = document.createElement("img");
    img.src = att.url;
    img.style.opacity = "0";
    img.onload = () => (img.style.opacity = "1");
    img.style.transition = "opacity 0.15s";
    img.style.width = "70px";
    img.style.height = "70px";
    img.style.objectFit = "cover";
    img.style.borderRadius = "6px";
    img.style.cursor = "pointer";

    img.onclick = () => {
      const list = attachments.map((x) => x.url);
      openViewer(list, idx);
    };

    const delBtn = document.createElement("button");
    delBtn.textContent = "×";
    delBtn.style.cssText = `
      position:absolute;top:-6px;right:-6px;width:20px;height:20px;border:none;
      border-radius:50%;background:rgba(0,0,0,0.7);color:#fff;cursor:pointer;
    `;
    delBtn.onclick = (e) => {
      e.stopPropagation();
      showDeleteConfirm(async () => {
        if (att.path) await deleteFromFirebaseStorage(att.path);
        const newList = attachments.filter((_, i) => i !== idx);
        await set(ref(db, `${PATH}/${it.id}/attachments`), newList);
        showDetails({ ...it, attachments: newList });
      });
    };

    wrap.appendChild(img);
    wrap.appendChild(delBtn);
    listBox.appendChild(wrap);
  });

  // =======================
  // Upload new attachments
  // =======================
  const fileInput = document.getElementById("attachInput");
  fileInput.onchange = async () => {
    const files = Array.from(fileInput.files);
    if (!files.length) return;

    showUploadLoader();
    try {
      let newList = [...attachments];
      for (const file of files) {
        const compressed = await compressImage(file, 0.6, 1280);
        const up = await uploadToFirebaseStorage(it.id, compressed);
        newList.push(up);
      }
      await set(ref(db, `${PATH}/${it.id}/attachments`), newList);

      // refresh ONLY attachments, not the whole detail panel
      updateAttachmentList(newList);

      listenRealtime();
    } catch (e) {
      console.error(e);
      alert("Upload failed.");
    }
    hideUploadLoader();
  };

  function updateAttachmentList(list) {
    const box = document.getElementById("attachmentList");
    box.innerHTML = "";

    list.forEach((att, idx) => {
      const wrap = document.createElement("div");
      wrap.style.position = "relative";

      const img = document.createElement("img");
      img.src = att.url;
      img.style.opacity = "0";
      img.onload = () => (img.style.opacity = "1");
      img.style.transition = "opacity 0.15s";
      img.style.width = "70px";
      img.style.height = "70px";
      img.style.objectFit = "cover";
      img.style.borderRadius = "6px";
      img.style.cursor = "pointer";

      img.onclick = () => {
        const listUrls = list.map((x) => x.url);
        openViewer(listUrls, idx);
      };

      const delBtn = document.createElement("button");
      delBtn.textContent = "×";
      delBtn.style.cssText = `
      position:absolute;top:-6px;right:-6px;width:20px;height:20px;border:none;
      border-radius:50%;background:rgba(0,0,0,0.7);color:#fff;cursor:pointer;
    `;
      delBtn.onclick = (e) => {
        e.stopPropagation();
        showDeleteConfirm(async () => {
          if (att.path) await deleteFromFirebaseStorage(att.path);
          const newList = list.filter((_, i) => i !== idx);
          await set(ref(db, `${PATH}/${it.id}/attachments`), newList);
          updateAttachmentList(newList);
        });
      };

      wrap.appendChild(img);
      wrap.appendChild(delBtn);
      box.appendChild(wrap);
    });
  }

  // Checkbox visual toggle
  const detailCheckbox = document.getElementById("detailBooked");
  const detailBox = detailCheckbox.nextElementSibling;
  if (detailBox && !detailBox.dataset.bound) {
    detailBox.dataset.bound = "1";
    detailBox.addEventListener("click", () => {
      detailCheckbox.checked = !detailCheckbox.checked;
    });
  }
}

let currentChecklistView = "kanban";

// =======================================================
// Firebase realtime: cost listener
// =======================================================
function listenRealtime() {
  onValue(ref(db, PATH), (snap) => {
    const val = snap.val();
    if (!val) {
      render([]);
      updateSummary([]);
      return;
    }
    const arr = Object.keys(val).map((id) => ({ id, ...val[id] }));
    document.getElementById("sortSelect").value = savedSort;
    const sortType = savedSort;
    if (currentChecklistView === "list") {
      render(arr, sortType);
    }

    updateSummary(arr);
    renderTableView(arr);
    renderGallery(arr);
    renderChecklistKanban(arr);
  });
}

// Save new cost
async function saveEntry(obj) {
  await set(push(ref(db, PATH)), obj);
}

// Update cost
async function updateEntry(id, obj) {
  await update(ref(db, `${PATH}/${id}`), obj);
}

// Delete cost
async function deleteEntry(id) {
  await remove(ref(db, `${PATH}/${id}`));
}

// =======================================================
// Add Costs panel buttons
// =======================================================
addBtn.onclick = async () => {
  const name = nameInput.value.trim();
  const total = Number(totalInput.value);
  const paid = Number(paidInput.value) || 0;
  const booked = bookedInput.checked;

  if (!name) return alert("Missing name.");

  await saveEntry({
    name,
    total,
    paid,
    booked,
    priority: "low",
    createdAt: Date.now(),
  });

  nameInput.value = "";
  totalInput.value = "";
  paidInput.value = "";
  bookedInput.checked = false;

  showSaveToast();
};

// =======================================================
// ADD COSTS PANEL TOGGLE (RESTORED ORIGINAL BEHAVIOR)
// =======================================================

const toggleBtn = document.getElementById("toggleControlsBtn");
const controlsSection = document.querySelector(".controls");

if (toggleBtn && controlsSection) {
  // DEFAULT: hidden when app starts
  controlsSection.classList.remove("visible");
  controlsSection.classList.add("hidden");
  toggleBtn.classList.remove("toggle-expanded");
  toggleBtn.querySelector(".toggle-arrow").textContent = "▼";

  toggleBtn.addEventListener("click", () => {
    const isHidden = controlsSection.classList.contains("hidden");

    if (isHidden) {
      // SHOW
      controlsSection.classList.remove("hidden");
      controlsSection.classList.add("visible");

      toggleBtn.classList.add("toggle-expanded");
      toggleBtn.querySelector(".toggle-arrow").textContent = "▲";
    } else {
      // HIDE
      controlsSection.classList.remove("visible");
      controlsSection.classList.add("hidden");

      toggleBtn.classList.remove("toggle-expanded");
      toggleBtn.querySelector(".toggle-arrow").textContent = "▼";
    }
  });
}

clearBtn.onclick = () => {
  nameInput.value = "";
  totalInput.value = "";
  paidInput.value = "";
  bookedInput.checked = false;
};

// Checkbox ripple fix
document.querySelectorAll('.chk input[type="checkbox"]').forEach((input) => {
  const box = input.nextElementSibling;
  if (box && !box.dataset.bound) {
    box.dataset.bound = "1";
    box.addEventListener("click", () => {
      input.checked = !input.checked;
    });
  }
});

// =======================================================
// VIEWER + DELETE CONFIRM + GALLERY + TABLE VIEW
// (ALL FULL FUNCTIONS — NO OMISSIONS)
// =======================================================

// ========== IMAGE VIEWER ==========
let currentAttachList = [];
let currentAttachIndex = 0;

const viewer = document.getElementById("imgViewerOverlay");
const viewerImg = document.getElementById("imgViewerFull");

function openViewer(list, index) {
  currentAttachList = list;
  currentAttachIndex = index;
  viewerImg.src = list[index];
  viewer.style.display = "flex";
}

viewer.onclick = (e) => {
  if (e.target === viewer) viewer.style.display = "none";
};

document.getElementById("viewerCloseBtn").onclick = () => {
  viewer.style.display = "none";
};

document.getElementById("viewerPrevBtn").onclick = () => {
  currentAttachIndex =
    (currentAttachIndex - 1 + currentAttachList.length) %
    currentAttachList.length;
  viewerImg.src = currentAttachList[currentAttachIndex];
};

document.getElementById("viewerNextBtn").onclick = () => {
  currentAttachIndex = (currentAttachIndex + 1) % currentAttachList.length;
  viewerImg.src = currentAttachList[currentAttachIndex];
};

viewerImg.onclick = (e) => e.stopPropagation();

// ========== DELETE CONFIRM ==========
let confirmDeleteCallback = null;
const delOverlay = document.getElementById("confirmDeleteOverlay");

document.getElementById("confirmDeleteYes").onclick = () => {
  if (confirmDeleteCallback) confirmDeleteCallback();
  delOverlay.style.display = "none";
};

document.getElementById("confirmDeleteNo").onclick = () => {
  confirmDeleteCallback = null;
  delOverlay.style.display = "none";
};

function showDeleteConfirm(cb) {
  confirmDeleteCallback = cb;
  delOverlay.style.display = "flex";
}

// ========== GALLERY ==========
function renderGallery(items) {
  const box = document.getElementById("galleryContent");
  box.innerHTML = "";

  items.forEach((it) => {
    const attachments = it.attachments || [];
    if (!attachments.length) return;

    const title = document.createElement("div");
    title.className = "gallery-item-title";
    title.textContent = it.name;
    box.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "gallery-grid";

    attachments.forEach((att, idx) => {
      const img = document.createElement("img");
      img.className = "gallery-thumb";
      img.src = att.url;
      img.onclick = () =>
        openViewer(
          attachments.map((x) => x.url),
          idx
        );
      grid.appendChild(img);
    });

    box.appendChild(grid);
  });
}

// ========== TABLE VIEW ==========
const tableViewPanel = document.getElementById("tableViewPanel");
const tableViewContent = document.getElementById("tableViewContent");
const closeTableView = document.getElementById("closeTableView");

document.getElementById("openTableIcon").onclick = () => {
  tableViewPanel.classList.add("open");
  lockBodyScroll();
};

document.getElementById("openGalleryIcon").onclick = () => {
  galleryPanel.classList.add("open");
  lockBodyScroll();
};

let tableSort = JSON.parse(localStorage.getItem("tableSort")) || {
  column: null,
  direction: "default",
};

function saveSortState() {
  localStorage.setItem("tableSort", JSON.stringify(tableSort));
}

function sortItemsForTable(items) {
  if (tableSort.direction === "default" || !tableSort.column) {
    return items;
  }

  const col = tableSort.column;
  const dir = tableSort.direction === "asc" ? 1 : -1;

  return [...items].sort((a, b) => {
    let A = a[col];
    let B = b[col];

    if (col === "name") {
      A = A.toLowerCase();
      B = B.toLowerCase();
    }

    if (col === "booked") {
      A = a.booked ? 1 : 0;
      B = b.booked ? 1 : 0;
    }

    return A > B ? dir : A < B ? -dir : 0;
  });
}

function renderTableView(items) {
  const sorted = sortItemsForTable(items);

  let html = `
    <table>
      <thead>
        <tr>
          <th data-col="name">Item</th>
          <th data-col="paid">Paid</th>
          <th data-col="total">Total</th>
          <th data-col="booked">Status</th>
        </tr>
      </thead>
      <tbody>
  `;

  sorted.forEach((it) => {
    html += `
      <tr data-id="${it.id}">
        <td>${escapeHtml(it.name)}</td>
        <td>${fmt(it.paid)}</td>
        <td>${fmt(it.total)}</td>
        <td>
          <span class="status-chip ${
            it.booked ? "status-booked" : "status-not"
          }">
            ${it.booked ? "Booked" : "NB"}
          </span>
        </td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  tableViewContent.innerHTML = html;

  const headers = document.querySelectorAll("#tableViewContent th");

  headers.forEach((h) => {
    h.classList.remove("sort-asc", "sort-desc");
    h.onclick = () => {
      const col = h.dataset.col;
      if (!col) return;

      if (tableSort.column !== col) {
        tableSort.column = col;
        tableSort.direction = "asc";
      } else {
        if (tableSort.direction === "asc") tableSort.direction = "desc";
        else if (tableSort.direction === "desc")
          tableSort.direction = "default";
        else tableSort.direction = "asc";
      }

      saveSortState();
      renderTableView(items);
    };
  });

  // Highlight active
  if (tableSort.column) {
    const active = document.querySelector(
      `#tableViewContent th[data-col="${tableSort.column}"]`
    );
    if (active) {
      if (tableSort.direction === "asc") active.classList.add("sort-asc");
      if (tableSort.direction === "desc") active.classList.add("sort-desc");
    }
  }

  // Row highlight
  const rows = document.querySelectorAll("#tableViewContent tbody tr");
  rows.forEach((row) => {
    row.onclick = () => {
      rows.forEach((r) => r.classList.remove("selected-row"));
      row.classList.add("selected-row");
    };
  });
}

closeTableView.onclick = () => {
  tableViewPanel.classList.remove("open");
  unlockBodyScroll();
};

// =======================================================
// GALLERY PANEL CLOSE
// =======================================================
closeGallery.onclick = () => {
  galleryPanel.classList.remove("open");
  unlockBodyScroll();
};

// =======================================================
// SWIPE HANDLING (mobile)
// =======================================================
let touchStartX = 0;
let touchEndX = 0;

function isMobile() {
  return window.innerWidth < 720;
}

document.addEventListener("touchstart", (e) => {
  if (!isMobile()) return;
  touchStartX = e.changedTouches[0].screenX;
});

document.addEventListener("touchend", (e) => {
  if (!isMobile()) return;

  // DISABLE SWIPE WHEN CHECKLIST OR GUESTS PANEL IS OPEN
  const inChecklist =
    document.getElementById("checklistPanel").style.display === "block";
  const inGuests =
    document.getElementById("guestsPanel").style.display === "block";

  if (inChecklist || inGuests) {
    return; // completely disables table/gallery swipe
  }

  touchEndX = e.changedTouches[0].screenX;
  const diff = touchEndX - touchStartX;

  const tableOpen = tableViewPanel.classList.contains("open");
  const galleryOpen = galleryPanel.classList.contains("open");

  // Swipe LEFT
  if (diff < -70) {
    if (galleryOpen) {
      galleryPanel.classList.remove("open");
      unlockBodyScroll();
      return;
    }
    if (tableOpen) return;
    tableViewPanel.classList.add("open");
    lockBodyScroll();
    return;
  }

  // Swipe RIGHT
  if (diff > 70) {
    if (tableOpen) {
      tableViewPanel.classList.remove("open");
      unlockBodyScroll();
      return;
    }
    if (galleryOpen) return;
    galleryPanel.classList.add("open");
    lockBodyScroll();
    return;
  }
});

// Ensure modals reset scroll
function setupScrollReset(panel) {
  panel.addEventListener("transitionend", () => {
    if (!panel.classList.contains("open")) {
      panel.scrollTop = 0;
    }
  });
}

setupScrollReset(tableViewPanel);
setupScrollReset(galleryPanel);

function lockBodyScroll() {
  document.body.style.overflow = "hidden";
  document.documentElement.style.overflow = "hidden";
}

function unlockBodyScroll() {
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
}

// =======================================================
// IMAGE COMPRESSION & STORAGE
// =======================================================
function compressImage(file, quality = 0.6, maxWidth = 1280) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");

      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

async function uploadToFirebaseStorage(itemId, fileBlob) {
  const randomName = Math.random().toString(36).substring(2) + ".jpg";
  const fileRef = sRef(storage, `weddingCosts/${itemId}/${randomName}`);
  await uploadBytes(fileRef, fileBlob);
  const url = await getDownloadURL(fileRef);
  return { url, path: fileRef.fullPath };
}

async function deleteFromFirebaseStorage(path) {
  const fileRef = sRef(storage, path);
  await deleteObject(fileRef).catch(() => {});
}

// =======================================================
// TOAST
// =======================================================
function showSaveToast() {
  const t = document.getElementById("saveToast");
  t.style.display = "block";
  t.classList.add("show");
  setTimeout(() => {
    t.classList.remove("show");
    t.style.display = "none";
  }, 1200);
}

// Key nav for viewer
document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight") {
    document.getElementById("viewerNextBtn")?.click();
  }
  if (event.key === "ArrowLeft") {
    document.getElementById("viewerPrevBtn")?.click();
  }
  if (event.key === "Escape") {
    document.getElementById("viewerCloseBtn")?.click();
  }
});

// =======================================================
// CHECKLIST + GUESTS (Full implementation)
// =======================================================

// Checklist listener unsubscribe
let nextStepsUnsub = null;
let currentChecklistTarget = "checklistList";

// =======================================================
// CHECKLIST KANBAN DATA PREP (ONE-TIME SAFE MIGRATION)
// =======================================================
function migrateChecklistItem(id, item) {
  const updates = {};

  // status migration
  if (!item.status) {
    updates.status = item.done ? "done" : "todo";
  }

  // order migration
  if (item.sortIndex === undefined) {
    updates.sortIndex = item.createdAt || Date.now();
  }

  // 🚑 title recovery (CRITICAL)
  if (!item.text && item.title) {
    updates.text = item.title;
  }

  if (!item.text && !item.title) {
    updates.text = "Untitled task";
  }

  if (Object.keys(updates).length > 0) {
    update(ref(db, `${NEXT_PATH}/${id}`), updates);
  }
}

// Load checklist OR next steps
function loadNextSteps(targetId = "nextStepsList") {
  currentChecklistTarget = targetId;

  if (typeof nextStepsUnsub === "function") {
    nextStepsUnsub();
    nextStepsUnsub = null;
  }

  const listEl = document.getElementById(targetId);
  if (!listEl) return;

  nextStepsUnsub = onValue(ref(db, NEXT_PATH), (snap) => {
    const val = snap.val();
    if (!val) {
      listEl.innerHTML = `<div class="muted">No items yet.</div>`;
      return;
    }

    const arr = Object.keys(val).map((id) => {
      migrateChecklistItem(id, val[id]);
      return { id, ...val[id] };
    });

    arr.sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));

    listEl.innerHTML = "";

    arr.forEach((step) => {
      const row = document.createElement("div");
      row.style.cursor = "pointer";
      row.onclick = () => openChecklistModal(step);
      row.className = `cl-row prio-${step.priority || "low"}`;

      row.style.cssText = `
        display:flex;
        justify-content:space-between;
        align-items:flex-end;
        gap:12px;
        padding:12px 0;
        border-bottom:1px solid rgba(255,255,255,0.05);
      `;

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.alignItems = "flex-start";
      left.style.gap = "12px";

      left.onclick = (e) => {
        e.stopPropagation();
      };

      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.className = "next-checkbox";
      chk.checked = !!step.done;
      chk.onclick = (e) => {
        e.stopPropagation();

        if (chk.checked) {
          flow.classList.remove("animate");
          flow.offsetHeight; // reset animation
          flow.classList.add("animate");
          // celebratory confetti/sparkle
          triggerCelebration(row, chk);
        }

        txt.classList.toggle("cl-done", chk.checked);
        set(ref(db, `${NEXT_PATH}/${step.id}/done`), chk.checked);
      };

      const txt = document.createElement("div");
      txt.style.maxWidth = "100%";
      txt.onclick = (e) => {
        e.stopPropagation();
      };

      txt.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="cl-priority ${step.priority || "low"}">
            ${(step.priority || "low").toUpperCase()}
          </span>

          <span style="font-size:15px; ${
            step.done ? "text-decoration:line-through;color:var(--muted);" : ""
          } font-weight:700;">
            ${escapeHtml(step.text)}
          </span>
        </div>
        ${
          step.notes
            ? `<div class="muted" style="font-size:13px; margin-top:6px;">${escapeHtml(
                step.notes
              )}</div>`
            : ""
        }
        ${
          step.deadline
            ? `<div class="muted" style="font-size:12px; margin-top:6px;">Deadline: ${step.deadline}</div>`
            : ""
        }
      `;

      left.appendChild(chk);
      left.appendChild(txt);

      const actions = document.createElement("div");
      actions.className = "cl-actions-row";

      /* EDIT (pencil icon via SVG) */
      const editBtn = document.createElement("button");
      editBtn.className = "cl-icon-btn";
      editBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          xmlns="http://www.w3.org/2000/svg">
          <path d="M4 20h4l10.5-10.5a2.12 2.12 0 0 0-3-3L5 17v3z"
            stroke="white" stroke-width="2" fill="none"/>
        </svg>
      `;
      editBtn.onclick = (e) => {
        e.stopPropagation();
        openChecklistModal(step);
      };

      /* DELETE */
      const delBtn = document.createElement("button");
      delBtn.className = "cl-icon-btn";
      delBtn.textContent = "×";
      delBtn.onclick = (e) => {
        e.stopPropagation();
        remove(ref(db, `${NEXT_PATH}/${step.id}`));
      };

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      // flow layer (ONE per row)
      const flow = document.createElement("div");
      flow.className = `cl-flow ${step.priority || "low"}`;
      row.appendChild(flow);

      row.appendChild(left);
      row.appendChild(actions);

      listEl.appendChild(row);
    });
  });
}

function triggerCelebration(rowEl, anchorEl) {
  try {
    const rectRow = rowEl.getBoundingClientRect();
    const rect = anchorEl.getBoundingClientRect();

    const container = document.createElement("div");
    container.className = "celebrate";
    container.style.left = rect.left - rectRow.left + rect.width / 2 + "px";
    container.style.top = rect.top - rectRow.top + rect.height / 2 + "px";

    const colors = ["#ff8fbf", "#ffd56b", "#67e39b", "#9b8cff", "#4da3ff"];
    for (let i = 0; i < 14; i++) {
      const piece = document.createElement("span");
      piece.className = "confetti";
      piece.style.setProperty(
        "--dx",
        (Math.random() * 80 - 40).toFixed(0) + "px"
      );
      piece.style.setProperty(
        "--dy",
        (-Math.random() * 80 - 20).toFixed(0) + "px"
      );
      piece.style.background = colors[i % colors.length];
      piece.style.transform = `rotate(${Math.floor(Math.random() * 360)}deg)`;
      container.appendChild(piece);
    }

    const sparkle = document.createElement("span");
    sparkle.className = "sparkle";
    container.appendChild(sparkle);

    rowEl.appendChild(container);

    setTimeout(() => {
      container.remove();
    }, 900);
  } catch (e) {
    // no-op
  }
}

let editingChecklistId = null;

const modalOverlay = document.getElementById("checklistModalOverlay");
const modalTitle = document.getElementById("checklistModalTitle");
const clTitle = document.getElementById("clTitle");
const clNotes = document.getElementById("clNotes");
const clDeadline = document.getElementById("clDeadline");
let selectedPriority = "low";
const prioButtons = document.querySelectorAll("#clPriorityRow .cl-prio-btn");

function openChecklistModal(step = null) {
  editingChecklistId = step?.id || null;

  modalTitle.textContent = step ? "Edit Task" : "Add Task";
  clTitle.value = step?.text || "";
  clNotes.value = step?.notes || "";
  clDeadline.value = step?.deadline || "";
  selectedPriority = step?.priority || "low";
  prioButtons.forEach((b) =>
    b.classList.toggle("active", b.dataset.prio === selectedPriority)
  );

  prioButtons.forEach((btn) => {
    btn.onclick = () => {
      selectedPriority = btn.dataset.prio;
      prioButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    };
  });

  modalOverlay.style.display = "flex";
  setTimeout(() => clTitle.focus(), 50);
}

function closeChecklistModal() {
  const modal = document.getElementById("checklistModal");
  modal.style.animation = "none";
  modal.offsetHeight; // reset
  modal.style.animation = "modalPop 0.18s reverse";

  setTimeout(() => {
    modalOverlay.style.display = "none";
    modal.style.animation = "";
    editingChecklistId = null;
  }, 160);
}

document.getElementById("clCancel").onclick = closeChecklistModal;

modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeChecklistModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeChecklistModal();
});

document.getElementById("clSave").onclick = async () => {
  const text = clTitle.value.trim();
  if (!text) return alert("Task title required");

  const payload = {
    text,
    notes: clNotes.value.trim() || null,
    deadline: clDeadline.value || null,
    priority: selectedPriority,
  };

  if (editingChecklistId) {
    const existing =
      (await get(ref(db, `${NEXT_PATH}/${editingChecklistId}`))).val() || {};

    await update(ref(db, `${NEXT_PATH}/${editingChecklistId}`), {
      ...existing,
      ...payload,
    });
  } else {
    await set(push(ref(db, NEXT_PATH)), payload);
  }

  closeChecklistModal();
  loadNextSteps(currentChecklistTarget);
  showSaveToast();
};

// Guests listener
let guestsUnsub = null;

function saveGuest(obj) {
  return set(push(ref(db, GUESTS_PATH)), obj);
}

function openGuestEditor(g) {
  editingGuestId = g.id;
  document.getElementById("editGuestName").value = g.name || "";
  document.getElementById("editGuestGender").value = g.gender || "";
  document.getElementById("editGuestSide").value = g.side || "";
  document.getElementById("editGuestRelation").value = g.relation || "";
  document.getElementById("editGuestRole").value = g.role || "guest";
  document.getElementById("editGuestRsvp").value = g.rsvp || "pending";
  document.getElementById("editGuestNotes").value = g.notes || "";

  const bar = document.getElementById("guestEditBar");
  bar.style.display = "block";
  requestAnimationFrame(() => bar.classList.add("open"));
}

function loadGuests() {
  if (typeof guestsUnsub === "function") {
    guestsUnsub();
    guestsUnsub = null;
  }

  const box = document.getElementById("guestList");
  guestsUnsub = onValue(ref(db, GUESTS_PATH), (snap) => {
    const val = snap.val();
    if (!val) {
      box.innerHTML = `<div class="muted">No guests yet.</div>`;
      return;
    }

    let rawGuests = Object.keys(val).map((id) => ({ id, ...val[id] }));

    // APPLY SEARCH
    const q = (
      document.getElementById("guestSearch")?.value || ""
    ).toLowerCase();
    if (q.trim() !== "") {
      rawGuests = rawGuests.filter(
        (g) =>
          (g.name || "").toLowerCase().includes(q) ||
          (g.role || "").toLowerCase().includes(q) ||
          (g.side || "").toLowerCase().includes(q) ||
          (g.relation || "").toLowerCase().includes(q) ||
          (g.rsvp || "").toLowerCase().includes(q) ||
          (g.notes || "").toLowerCase().includes(q)
      );
    }

    // APPLY FILTER CHIPS
    rawGuests = rawGuests.filter((g) => applyGuestFilters(g));

    const statsBox = document.getElementById("guestStats");
    if (statsBox) {
      const total = rawGuests.length;
      const charlie = rawGuests.filter((g) => g.side === "charlie").length;
      const karla = rawGuests.filter((g) => g.side === "karla").length;
      const both = rawGuests.filter((g) => g.side === "both").length;
      const yes = rawGuests.filter((g) => g.rsvp === "yes").length;
      const no = rawGuests.filter((g) => g.rsvp === "no").length;
      const pending = rawGuests.filter((g) => g.rsvp === "pending").length;

      statsBox.innerHTML = `
    Total: <b>${total}</b> • 
    Charlie: ${charlie} • 
    Karla: ${karla} • 
    Both: ${both} • 
    Yes: ${yes} • No: ${no} • Pending: ${pending}
  `;
    }

    const groups = {
      charlie: [],
      karla: [],
      both: [],
    };

    rawGuests.forEach((g) => {
      groups[g.side || "both"].push(g);
    });

    // container for output
    box.innerHTML = "";

    // Render by group
    ["charlie", "karla", "both"].forEach((side) => {
      if (groups[side].length === 0) return;

      // header
      const h = document.createElement("div");
      h.textContent = side.toUpperCase() + ` (${groups[side].length})`;
      h.style.margin = "12px 0 6px";
      h.style.fontWeight = "700";
      box.appendChild(h);

      // pick view type
      if (guestViewMode === "grid") {
        renderGuestGrid(groups[side], box);
      } else {
        renderGuestList(groups[side], box);
      }
    });
  });
}

let openInlineEditor = null;

function toggleInlineGuestEditor(g, container) {
  // auto-close previously open editor
  if (openInlineEditor && openInlineEditor !== container) {
    const prev = openInlineEditor.querySelector(".guest-inline-editor");
    if (prev) prev.remove();
  }
  const existing = container.querySelector(".guest-inline-editor");

  if (existing) {
    existing.remove();
    openInlineEditor = null;
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "guest-inline-editor";
  wrap.style.marginTop = "10px";
  wrap.style.padding = "12px";
  wrap.style.borderRadius = "12px";
  wrap.style.background = "rgba(255,255,255,0.04)";
  wrap.innerHTML = `
    <label style="font-size:13px;opacity:0.7;display:block;margin-bottom:4px;">Name</label>
    <input id="inlineName-${g.id}" type="text" value="${g.name || ""}"
      style="width:100%;margin-bottom:12px;padding:12px;border-radius:10px;background:var(--card);color:white;border:0;">

    <label style="font-size:13px;opacity:0.7;display:block;margin-bottom:4px;">Gender</label>
    <select id="inlineGender-${g.id}"
      style="width:100%;margin-bottom:12px;padding:12px;border-radius:10px;background: var(--card);color: white;border:0;">
      <option value="">Gender</option>
      <option value="male" ${
        g.gender === "male" ? "selected" : ""
      }>Male</option>
      <option value="female" ${
        g.gender === "female" ? "selected" : ""
      }>Female</option>
    </select>

    <label style="font-size:13px;opacity:0.7;display:block;margin-bottom:4px;">Side</label>
    <select id="inlineSide-${g.id}"
      style="width:100%;margin-bottom:12px;padding:12px;border-radius:10px;background: var(--card);color: white;border:0;">
      <option value="">Side</option>
      <option value="charlie" ${
        g.side === "charlie" ? "selected" : ""
      }>Charlie</option>
      <option value="karla" ${
        g.side === "karla" ? "selected" : ""
      }>Karla</option>
      <option value="both" ${g.side === "both" ? "selected" : ""}>Both</option>
    </select>

    <label style="font-size:13px;opacity:0.7;display:block;margin-bottom:4px;">Relation</label>
    <select id="inlineRelation-${g.id}"
      style="width:100%;margin-bottom:12px;padding:12px;border-radius:10px;background: var(--card);color: white;border:0;">
      <option value="">Relation</option>
      <option value="family" ${
        g.relation === "family" ? "selected" : ""
      }>Family</option>
      <option value="friend" ${
        g.relation === "friend" ? "selected" : ""
      }>Friend</option>
    </select>

    <label style="font-size:13px;opacity:0.7;display:block;margin-bottom:4px;">Role</label>
    <select id="inlineRole-${g.id}"
      style="width:100%;margin-bottom:12px;padding:12px;border-radius:10px;background: var(--card);color: white;border:0;">
      <option value="">Role</option>
      <option value="bride" ${
        g.role === "bride" ? "selected" : ""
      }>Bride</option>
      <option value="groom" ${
        g.role === "groom" ? "selected" : ""
      }>Groom</option>
      <option value="parent" ${
        g.role === "parent" ? "selected" : ""
      }>Parent</option>
      <option value="bridesmaid" ${
        g.role === "bridesmaid" ? "selected" : ""
      }>Bridesmaid</option>
      <option value="groomsman" ${
        g.role === "groomsman" ? "selected" : ""
      }>Groomsman</option>
      <option value="principal" ${
        g.role === "principal" ? "selected" : ""
      }>Principal Sponsor</option>
      <option value="secondary" ${
        g.role === "secondary" ? "selected" : ""
      }>Secondary Sponsor</option>
      <option value="guest" ${
        g.role === "guest" ? "selected" : ""
      }>Guest</option>
    </select>

    <label style="font-size:13px;opacity:0.7;display:block;margin-bottom:4px;">RSVP Status</label>
    <select id="inlineRsvp-${g.id}"
      style="width:100%;margin-bottom:12px;padding:12px;border-radius:10px;background: var(--card);color: white;border:0;">
      <option value="pending" ${
        g.rsvp === "pending" ? "selected" : ""
      }>RSVP: Pending</option>
      <option value="yes" ${
        g.rsvp === "yes" ? "selected" : ""
      }>RSVP: Yes</option>
      <option value="no" ${g.rsvp === "no" ? "selected" : ""}>RSVP: No</option>
    </select>

    <label style="font-size:13px;opacity:0.7;display:block;margin-bottom:4px;">Notes</label>
    <textarea id="inlineNotes-${g.id}"
      style="width:100%;margin-bottom:14px;padding:12px;border-radius:10px;background: var(--card);color:white;box-sizing:border-box;border:0;">${
        g.notes || ""
      }</textarea>

    <div style="display:flex;gap:8px;">
      <button class="btn" style="flex:1;" onclick="event.stopPropagation(); saveInlineGuest('${
        g.id
      }')">Save</button>
      <button class="btn ghost" style="flex:1;" onclick="event.stopPropagation(); deleteInlineGuest('${
        g.id
      }')">Delete</button>
    </div>
`;

  // prevent click inside editor from triggering row toggle
  wrap.addEventListener("click", (e) => e.stopPropagation());

  container.appendChild(wrap);
  openInlineEditor = container;
}

window.saveInlineGuest = async function (id) {
  await update(ref(db, `${GUESTS_PATH}/${id}`), {
    name: document.getElementById(`inlineName-${id}`).value.trim(),
    gender: document.getElementById(`inlineGender-${id}`).value,
    side: document.getElementById(`inlineSide-${id}`).value,
    relation: document.getElementById(`inlineRelation-${id}`).value,
    role: document.getElementById(`inlineRole-${id}`).value,
    rsvp: document.getElementById(`inlineRsvp-${id}`).value,
    notes: document.getElementById(`inlineNotes-${id}`).value.trim(),
  });
  loadGuests();
  showSaveToast();
};

window.deleteInlineGuest = async function (id) {
  const ok = confirm("Delete this guest?");
  if (!ok) return;
  await remove(ref(db, `${GUESTS_PATH}/${id}`));
  loadGuests();
};

function renderGuestChips() {
  const box = document.getElementById("guestFilterChips");
  if (!box) return;

  const chips = [
    { type: "side", value: "charlie" },
    { type: "side", value: "karla" },
    { type: "side", value: "both" },
    { type: "relation", value: "family" },
    { type: "relation", value: "friend" },
    { type: "role", value: "bride" },
    { type: "role", value: "groom" },
    { type: "role", value: "parent" },
    { type: "role", value: "guest" },
    { type: "role", value: "bridesmaid" },
    { type: "role", value: "groomsman" },
    { type: "role", value: "principal" },
    { type: "rsvp", value: "yes" },
    { type: "rsvp", value: "pending" },
    { type: "rsvp", value: "no" },
  ];

  box.innerHTML = "";

  const clear = document.createElement("button");
  clear.textContent = "Clear Filters";
  clear.className = "btn ghost";
  clear.style.padding = "6px 10px";
  clear.style.marginLeft = "auto";

  clear.onclick = () => {
    guestFilters.side = [];
    guestFilters.relation = [];
    guestFilters.role = [];
    guestFilters.rsvp = [];
    renderGuestChips();
    loadGuests();
  };

  box.appendChild(clear);

  chips.forEach((c) => {
    const btn = document.createElement("button");
    btn.textContent = c.value;

    // SHOW ACTIVE visual indicator
    const isActive = guestFilters[c.type].includes(c.value);

    btn.className = isActive ? "btn" : "btn ghost";

    btn.style.padding = "6px 10px";
    btn.style.borderRadius = "999px"; // pill look

    btn.onclick = () => {
      if (guestFilters[c.type].includes(c.value)) {
        guestFilters[c.type] = guestFilters[c.type].filter(
          (v) => v !== c.value
        );
      } else {
        guestFilters[c.type].push(c.value);
      }

      renderGuestChips(); // refresh pills to show active state
      loadGuests(); // apply filtering
    };

    box.appendChild(btn);
  });
}

// =======================================================
// PANEL OPENERS
// =======================================================
const checklistBtn = document.getElementById("checklistBtn");
const checklistDropdown = document.getElementById("checklistDropdown");
const checklistMenu = document.getElementById("checklistMenu");

checklistBtn.onclick = () => {
  const open = checklistBtn.getAttribute("aria-expanded") === "true";
  checklistBtn.setAttribute("aria-expanded", !open);
  checklistDropdown.style.display = open ? "none" : "block";
};

document.addEventListener("click", (e) => {
  if (!checklistMenu.contains(e.target)) {
    checklistDropdown.style.display = "none";
    checklistBtn.setAttribute("aria-expanded", "false");
  }
});

document.getElementById("openChecklist").onclick = () => {
  checklistDropdown.style.display = "none";
  openChecklistPanel();
};

document.getElementById("openGuests").onclick = async () => {
  checklistDropdown.style.display = "none";
  openGuestsPanel();
  // ensure Kanban renders when guests panel is opened
  try {
    loadGuestsKanban();
  } catch (e) {
    /* graceful */
  }
};

let kanbanDragLock = false; // prevents Firebase from re-rendering mid-drag
let currentDraggingId = null;

// more complete mapping to normalize roles from arbitrary strings
const mapping = {
  principal: "principal sponsors",
  "principal sponsor": "principal sponsors",
  "principal sponsors": "principal sponsors",

  groomsman: "groomsmen",
  groomsmen: "groomsmen",

  secondary: "secondary sponsors",
  "secondary sponsor": "secondary sponsors",
  "secondary sponsors": "secondary sponsors",
};
const roleOrder = [
  "bride",
  "groom",
  "principal sponsors",
  "parent",
  "bridesmaid",
  "groomsmen",
  "secondary sponsors",
  "guest",
];

async function loadGuestsKanban() {
  const board = document.getElementById("kanbanBoard");
  if (!board) {
    console.warn("loadGuestsKanban: kanbanBoard not found");
    return;
  }

  console.log("KANBAN: render start");

  // Build columns
  board.innerHTML = "";
  roleOrder.forEach((role) => {
    const col = document.createElement("div");
    col.className = "kanban-column";
    col.dataset.role = role;

    col.innerHTML = `
      <h3>${role} <span class="col-count">(0)</span></h3>
      <div class="kanban-list" data-role="${role}"></div>
    `;

    const list = col.querySelector(".kanban-list");

    // DESKTOP DRAGOVER → ALWAYS INSERT PLACEHOLDER
    col.addEventListener(
      "dragover",
      (e) => {
        e.preventDefault();

        const ph = document.querySelector(".kanban-placeholder");
        if (!ph) return;

        const children = Array.from(list.children).filter((c) => c !== ph);

        let inserted = false;
        for (const child of children) {
          const rect = child.getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          if (e.clientY < mid) {
            list.insertBefore(ph, child);
            inserted = true;
            break;
          }
        }
        if (!inserted) list.appendChild(ph);

        // visual highlight
        list.closest(".kanban-column").classList.add("drag-over");
        console.log(
          "dragover → placeholder moved to:",
          role,
          "inserted:",
          inserted
        );
      },
      { passive: false }
    );

    // dragleave: clear highlight when leaving column
    col.addEventListener("dragleave", (e) => {
      const to = e.relatedTarget;
      if (!to || !col.contains(to)) {
        col.classList.remove("drag-over");
        console.log("dragleave column:", role);
      }
    });

    // DESKTOP DROP
    col.addEventListener("drop", async (e) => {
      e.preventDefault();
      col.classList.remove("drag-over");

      const droppedId =
        (e.dataTransfer &&
          e.dataTransfer.getData &&
          e.dataTransfer.getData("text/plain")) ||
        currentDraggingId;

      console.log("DROP fired!", { droppedId, role });

      if (!droppedId) {
        console.warn("drop: no id found", { currentDraggingId });
        const ph = document.querySelector(".kanban-placeholder");
        if (ph && ph.parentElement) ph.parentElement.removeChild(ph);
        return;
      }

      const card = document.querySelector(
        `.kanban-card[data-id="${droppedId}"]`
      );
      const ph = document.querySelector(".kanban-placeholder");

      if (!card || !ph) {
        console.warn("drop: missing card or placeholder", !!card, !!ph);
        if (ph && ph.parentElement) ph.parentElement.removeChild(ph);
        return;
      }

      list.replaceChild(card, ph);
      console.log("DROP → card inserted:", droppedId);

      try {
        await update(ref(db, `${GUESTS_PATH}/${droppedId}`), { role });
        await persistColumnOrder(list);
        console.log("DROP → db updated and order persisted for", droppedId);
      } catch (err) {
        console.error("DROP → db update/persist failed:", err);
      } finally {
        kanbanDragLock = false;
        currentDraggingId = null;
        // re-render to sync with DB
        loadGuestsKanban();
      }
    });

    board.appendChild(col);
  });

  // helper to create placeholder element
  function createPlaceholder() {
    const ph = document.createElement("div");
    ph.className = "kanban-placeholder";
    ph.style.height = "54px";
    ph.style.border = "2px dashed rgba(255,255,255,0.08)";
    ph.style.borderRadius = "10px";
    ph.style.marginBottom = "8px";
    return ph;
  }

  // LIVE DATA
  onValue(ref(db, GUESTS_PATH), (snap) => {
    if (kanbanDragLock) {
      console.log("⛔ Skipping render — dragging");
      return;
    }

    console.log("loadGuestsKanban: fetched guests from DB");
    const raw = snap.val() || {};
    const guests = Object.keys(raw).map((id) => ({ id, ...raw[id] }));

    ensureSortIndexes(guests);
    guests.sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));

    // Apply search filter if present
    const q = (
      document.getElementById("guestSearch")?.value || ""
    ).toLowerCase();
    const filtered = q
      ? guests.filter(
          (g) =>
            (g.name || "").toLowerCase().includes(q) ||
            (g.role || "").toLowerCase().includes(q) ||
            (g.side || "").toLowerCase().includes(q)
        )
      : guests;

    // Group guests into normalized roles
    const groups = {};
    roleOrder.forEach((r) => (groups[r] = []));

    filtered.forEach((g) => {
      const r = (g.role || "guest").toLowerCase();
      const normalized = roleOrder.includes(r) ? r : mapping[r] || "guest";
      groups[normalized].push(g);
    });

    // Render cards in each column
    roleOrder.forEach((role) => {
      const col = board.querySelector(`.kanban-column[data-role="${role}"]`);
      const list = col.querySelector(".kanban-list");
      const group = groups[role] || [];

      col.querySelector(".col-count").textContent = `(${group.length})`;
      list.innerHTML = "";

      group.forEach((g) => {
        const card = document.createElement("div");
        card.className = "kanban-card";
        card.dataset.id = g.id;
        card.dataset.role = role;
        card.draggable = true;

        // ensure only the card—not children—is draggable
        card.querySelectorAll("*").forEach((el) => {
          el.style.pointerEvents = "none";
        });

        // build inner HTML preserving dots and meta
        const sideColor =
          g.side === "charlie"
            ? "#4da3ff"
            : g.side === "karla"
            ? "#ff8fbf"
            : "#b57cff";
        const rsvpColor =
          g.rsvp === "yes"
            ? "#67e39b"
            : g.rsvp === "no"
            ? "#ff6b6b"
            : "#ffd56b";

        card.innerHTML = `
          <div style="min-width:0;">
            <div class="name">${escapeHtml(g.name || "—")}</div>
            <div class="meta-row">${escapeHtml(
              g.relation || "—"
            )} • ${escapeHtml(g.side || "")}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;align-items:center;">
            <span style="width:10px;height:10px;border-radius:50%;background:${sideColor};"></span>
            <span style="width:10px;height:10px;border-radius:50%;background:${rsvpColor};"></span>
          </div>
        `;

        // Prevent children from initiating their own drag but allow events to bubble
        card.querySelectorAll("*").forEach((el) => {
          el.addEventListener("dragstart", (ev) => ev.stopPropagation());
        });

        // Click opens inline editor unless dragging
        card.addEventListener("click", (e) => {
          if (card.classList.contains("dragging")) return; // prevents opening editor after drag
          if (typeof toggleInlineGuestEditor === "function")
            toggleInlineGuestEditor(g, card);
        });

        // DESKTOP drag handlers
        let placeholder = null;

        card.addEventListener("dragstart", (e) => {
          console.log(
            "dragstart fired for",
            card.dataset.id,
            "dataTransfer?",
            !!e.dataTransfer
          );
          // If no dataTransfer, bail — touch fallback handles touch
          if (!e.dataTransfer) {
            console.warn("dragstart: no dataTransfer for", card.dataset.id);
            return;
          }

          kanbanDragLock = true;
          currentDraggingId = g.id;

          try {
            e.dataTransfer.setData("text/plain", g.id);
            e.dataTransfer.effectAllowed = "move";
            console.log("dragstart: set dataTransfer id:", g.id);
          } catch (err) {
            console.warn("dragstart: dataTransfer.setData failed", err);
          }

          card.classList.add("dragging");
          placeholder = createPlaceholder();
          const parentList = card.closest(".kanban-list");
          parentList.insertBefore(placeholder, card.nextSibling);
        });

        card.addEventListener("dragend", () => {
          console.log("dragend for", card.dataset.id);
          kanbanDragLock = false;
          currentDraggingId = null;
          card.classList.remove("dragging");
          const ph = document.querySelector(".kanban-placeholder");
          if (ph && ph.parentElement) ph.parentElement.removeChild(ph);
        });

        // TOUCH fallback: long-press then move placeholder with touch
        let touchTimer = null;
        let touchDragging = false;

        card.addEventListener(
          "touchstart",
          (e) => {
            if (e.touches.length > 1) return;
            touchTimer = setTimeout(() => {
              touchDragging = true;
              kanbanDragLock = true;
              currentDraggingId = g.id;
              card.classList.add("dragging");
              const parentList = card.closest(".kanban-list");
              placeholder = createPlaceholder();
              parentList.insertBefore(placeholder, card.nextSibling);
              console.log("touchstart: began touch-drag for", g.id);
            }, 160);
          },
          { passive: true }
        );

        card.addEventListener(
          "touchmove",
          (e) => {
            if (!touchDragging) return;
            const t = e.touches[0];
            const target = document.elementFromPoint(t.clientX, t.clientY);
            const colEl = target?.closest?.(".kanban-column");
            if (!colEl) return;
            const listEl = colEl.querySelector(".kanban-list");
            const phExisting = document.querySelector(".kanban-placeholder");
            if (!phExisting) return;

            // Insert placeholder relative to vertical position
            const children = Array.from(listEl.children).filter(
              (c) => c !== phExisting
            );
            let inserted = false;
            for (const child of children) {
              const rect = child.getBoundingClientRect();
              const mid = rect.top + rect.height / 2;
              if (t.clientY < mid) {
                listEl.insertBefore(phExisting, child);
                inserted = true;
                break;
              }
            }
            if (!inserted) listEl.appendChild(phExisting);
            console.log(
              "touchmove: moved placeholder to column",
              colEl.dataset.role
            );
          },
          { passive: true }
        );

        card.addEventListener(
          "touchend",
          async (e) => {
            clearTimeout(touchTimer);
            if (!touchDragging) return;
            touchDragging = false;
            card.classList.remove("dragging");

            const phExisting = document.querySelector(".kanban-placeholder");
            const colEl = phExisting?.closest(".kanban-column");
            console.log("touchend:", { id: g.id, col: colEl?.dataset?.role });

            if (phExisting && colEl) {
              phExisting.replaceWith(card);
              try {
                await update(ref(db, `${GUESTS_PATH}/${g.id}`), {
                  role: colEl.dataset.role,
                });
                await persistColumnOrder(colEl.querySelector(".kanban-list"));
                console.log(
                  "touchend: updated role and persisted order for",
                  g.id
                );
              } catch (err) {
                console.error("touchend: update failed", err);
              }
              currentDraggingId = null;
              kanbanDragLock = false;
              loadGuestsKanban();
            } else {
              if (phExisting && phExisting.parentElement)
                phExisting.parentElement.removeChild(phExisting);
              currentDraggingId = null;
              kanbanDragLock = false;
              console.warn("touchend: no valid drop target for", g.id);
            }
          },
          { passive: true }
        );

        card.addEventListener(
          "touchcancel",
          () => {
            clearTimeout(touchTimer);
            touchDragging = false;
            card.classList.remove("dragging");
            const existing = document.querySelector(".kanban-placeholder");
            if (existing && existing.parentElement)
              existing.parentElement.removeChild(existing);
            currentDraggingId = null;
            kanbanDragLock = false;
            console.log("touchcancel for", g.id);
          },
          { passive: true }
        );

        list.appendChild(card);
      });

      // update count
      col.querySelector(".col-count").textContent = `(${
        (groups[role] || []).length
      })`;
    });

    console.log("KANBAN: render complete");
  });
}

// keep search input triggering kanban render
if (document.getElementById("guestSearch")) {
  document.getElementById("guestSearch").oninput = () => {
    try {
      loadGuestsKanban();
    } catch (e) {}
  };
}

document.getElementById("openSeating").onclick = () => {
  checklistDropdown.style.display = "none";
  alert("Seating Planner coming soon");
};

function renderChecklistKanban(items = []) {
  const todo = document.getElementById("clTodo");
  const doing = document.getElementById("clDoing");
  const done = document.getElementById("clDone");

  todo.innerHTML = "";
  doing.innerHTML = "";
  done.innerHTML = "";

  const empty = (msg) => {
    const d = document.createElement("div");
    d.className = "cl-empty";
    d.textContent = msg;
    return d;
  };

  items.forEach((step) => {
    const card = document.createElement("div");
    card.draggable = true;

    card.className = "cl-card";
    card.dataset.id = step.id;
    card.dataset.status = step.status || "todo";
    card.dataset.text = step.text || "";

    card.innerHTML = `
      <div class="title">${escapeHtml(
        card.dataset.text || "Untitled task"
      )}</div>


      <div class="prio ${step.priority || "low"}">
        ${(step.priority || "low").toUpperCase()}
      </div>
    `;

    let placeholder = null;

    card.addEventListener("dragstart", (e) => {
      clDraggingId = step.id;
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      try {
        e.dataTransfer.setData("text/plain", step.id);
      } catch {}
      placeholder = createClPlaceholder();
      card.parentElement.insertBefore(placeholder, card.nextSibling);
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      clDraggingId = null;
      if (placeholder && placeholder.parentElement) {
        placeholder.parentElement.removeChild(placeholder);
      }
    });

    if (step.status === "doing") doing.appendChild(card);
    else if (step.status === "done") done.appendChild(card);
    else todo.appendChild(card);
  });
  if (!todo.children.length) todo.appendChild(empty("Drop tasks here"));
  if (!doing.children.length) doing.appendChild(empty("Work in progress"));
  if (!done.children.length) done.appendChild(empty("All done 🎉"));
}

["clTodo", "clDoing", "clDone"].forEach((colId) => {
  const col = document.getElementById(colId);
  if (!col) return;

  col.addEventListener("dragover", (e) => {
    e.preventDefault();
    col.closest(".cl-col")?.classList.add("drag-over");

    const ph = document.querySelector(".cl-placeholder");
    if (!ph) return;

    const cards = Array.from(col.querySelectorAll(".cl-card")).filter(
      (c) => !c.classList.contains("dragging")
    );

    let inserted = false;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) {
        col.insertBefore(ph, c);
        inserted = true;
        break;
      }
    }
    if (!inserted) col.appendChild(ph);
  });

  col.addEventListener("dragleave", (e) => {
    const to = e.relatedTarget;
    if (!to || !col.contains(to)) {
      col.closest(".cl-col")?.classList.remove("drag-over");
    }
  });

  col.addEventListener("drop", async (e) => {
    e.preventDefault();
    col.closest(".cl-col")?.classList.remove("drag-over");

    const id =
      (e.dataTransfer && e.dataTransfer.getData("text/plain")) || clDraggingId;
    if (!id) return;

    const card = document.querySelector(`.cl-card[data-id="${id}"]`);
    const ph = document.querySelector(".cl-placeholder");
    if (!card || !ph) return;

    col.replaceChild(card, ph);
    card.classList.remove("just-dropped");
    card.offsetHeight;
    card.classList.add("just-dropped");

    const status =
      col.id === "clDone" ? "done" : col.id === "clDoing" ? "doing" : "todo";

    await update(ref(db, `${NEXT_PATH}/${id}`), {
      status,
      done: status === "done",
    });
    const flow = card.querySelector(".cl-flow");
    if (flow) {
      flow.classList.remove("animate");
      flow.offsetHeight;
      flow.classList.add("animate");
    }

    await persistChecklistOrder(col);
  });
});

let clDraggingId = null;

function createClPlaceholder() {
  const ph = document.createElement("div");
  ph.className = "cl-placeholder";
  return ph;
}

async function persistChecklistOrder(listEl) {
  if (!listEl) return;
  const cards = Array.from(listEl.querySelectorAll(".cl-card"));
  const updates = {};
  cards.forEach((c, i) => {
    updates[`${NEXT_PATH}/${c.dataset.id}/sortIndex`] = i;
  });
  if (Object.keys(updates).length) {
    await update(ref(db), updates);
  }
}

function openChecklistPanel() {
  document.getElementById("weddingCostsWrapper").style.display = "none";
  document.getElementById("nextStepsPanel").style.display = "none";
  document.getElementById("toggleControlsBtn").style.display = "none";

  document.getElementById("checklistPanel").style.display = "block";
  document.getElementById("guestsPanel").style.display = "none";

  document.getElementById("nextStepsAddBar").style.display = "block";
  document.getElementById("guestsAddBar").style.display = "none";

  document.getElementById("checklistKanban").style.display = "block";
  document.getElementById("checklistList").style.display = "none";

  loadNextSteps("checklistList");
}

function openGuestsPanel() {
  document.getElementById("weddingCostsWrapper").style.display = "none";
  document.getElementById("toggleControlsBtn").style.display = "none";
  document.getElementById("checklistPanel").style.display = "none";

  document.getElementById("guestsPanel").style.display = "block";
  document.getElementById("nextStepsAddBar").style.display = "none";
  document.getElementById("guestsAddBar").style.display = "block";

  loadGuests();
  renderGuestChips();
  document.getElementById("guestSearch").oninput = () => loadGuests();
}

document.getElementById("checklistBackBtn").onclick = () => {
  document.getElementById("checklistPanel").style.display = "none";
  document.getElementById("nextStepsAddBar").style.display = "none";
  document.getElementById("weddingCostsWrapper").style.display = "block";
  document.getElementById("toggleControlsBtn").style.display = "block";
  document.getElementById("nextStepsAddBar").classList.remove("open");
  listenRealtime();
};

document.getElementById("guestsBackBtn").onclick = () => {
  document.getElementById("guestsPanel").style.display = "none";
  document.getElementById("guestsAddBar").style.display = "none";
  document.getElementById("weddingCostsWrapper").style.display = "block";
  document.getElementById("toggleControlsBtn").style.display = "block";
  document.getElementById("guestsAddBar").classList.remove("open");
  listenRealtime();
};

document.getElementById("nextStepsBackBtn").onclick = () => {
  document.getElementById("nextStepsPanel").style.display = "none";
  document.getElementById("nextStepsAddBar").style.display = "none";
  document.getElementById("weddingCostsWrapper").style.display = "block";
  document.getElementById("toggleControlsBtn").style.display = "block";
  listenRealtime();
};

document.getElementById("openAddGuestBtn").onclick = () => {
  const bar = document.getElementById("guestsAddBar");
  bar.classList.toggle("open");
};

document.getElementById("openAddChecklistBtn").onclick = () => {
  openChecklistModal();
};

// =======================================================
// ADD CHECKLIST ITEM
// =======================================================
document.getElementById("addNextStepBtn").onclick = async () => {
  const text = document.getElementById("nextStepInput").value.trim();
  const notes = document.getElementById("nextStepNotes").value.trim();
  const deadline = document.getElementById("nextStepDeadline").value || null;

  if (!text) return alert("Please type an item");

  await set(push(ref(db, NEXT_PATH)), {
    text,
    notes: notes || null,
    deadline,
    done: false,
    createdAt: Date.now(),
  });

  document.getElementById("nextStepInput").value = "";
  document.getElementById("nextStepNotes").value = "";
  document.getElementById("nextStepDeadline").value = "";

  loadNextSteps(currentChecklistTarget);
  showSaveToast();
};

// =======================================================
// ADD GUEST
// =======================================================
document.getElementById("addGuestBtn").onclick = async () => {
  const name = document.getElementById("guestNameInput").value.trim();
  const gender = document.getElementById("guestGenderInput").value;
  const side = document.getElementById("guestSideInput").value;
  const relation = document.getElementById("guestRelationInput").value;
  const role = document.getElementById("guestRoleInput").value;
  const rsvp = document.getElementById("guestRsvpInput").value;
  const notes = document.getElementById("guestNotesInput").value.trim();

  if (!name) return alert("Please enter guest name");

  await saveGuest({
    name,
    gender: gender || null,
    side: side || null,
    relation: relation || null,
    role: role || "guest",
    rsvp: rsvp || "pending",
    notes: notes || null,
    createdAt: Date.now(),
  });

  document.getElementById("guestsForm").reset();
  loadGuests();
  showSaveToast();
};

document.getElementById("clearGuestBtn").onclick = () => {
  document.getElementById("guestsForm").reset();
};

// =======================================================
// SORT SELECT
// =======================================================
document.getElementById("sortSelect").onchange = () => {
  const v = document.getElementById("sortSelect").value;
  localStorage.setItem("mainSort", v);
  savedSort = v;
  listenRealtime();
};

// =======================================================
// UPLOAD LOADER
// =======================================================
function showUploadLoader() {
  document.getElementById("uploadLoader").style.display = "block";
}
function hideUploadLoader() {
  document.getElementById("uploadLoader").style.display = "none";
}

// =======================================================
// SERVICE WORKER
// =======================================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js")
      .then((reg) => console.log("SW OK:", reg.scope))
      .catch((err) => console.warn("SW FAIL", err));
  });
}

// =======================================================
// START
// =======================================================
listenRealtime();

function ensureGuestFields() {
  function ensure(id) {
    if (!document.getElementById(id)) {
      const i = document.createElement("input");
      i.type = "hidden";
      i.id = id;
      document.body.appendChild(i);
    }
  }

  function ensureSelect(id, values = []) {
    if (!document.getElementById(id)) {
      const sel = document.createElement("select");
      sel.id = id;
      sel.style.display = "none";

      values.forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        sel.appendChild(opt);
      });

      document.body.appendChild(sel);
    }
  }

  ensure("guestRelationInput");
  ensure("guestRoleInput");
  ensure("guestNotesInput");
  ensure("guestRsvpInput");

  ensureSelect("guestRelationInput", ["family", "friend"]);
  ensureSelect("guestRoleInput", [
    "bride",
    "groom",
    "principal sponsors",
    "bridesmaid",
    "groomsmen",
    "secondary sponsors",
    "guest",
  ]);
  ensureSelect("guestRsvpInput", ["yes", "no", "pending"]);
}

ensureGuestFields();

document.querySelectorAll("input").forEach((el) => {
  const s = window.getComputedStyle(el);
  const size = parseFloat(s.fontSize);
  if (size < 16) el.style.fontSize = "16px";
});

// =======================================================
// ENHANCED GUEST ENTRY FORM (below AddBar)
// =======================================================

// Build a better guests form (in place)
(function buildBetterGuestForm() {
  const bar = document.getElementById("guestsAddBar");
  if (!bar) return;

  // Replace bar inner HTML with a vertical form (mobile friendly)
  bar.innerHTML = `
      <form id="guestsForm" style="width:100%; display:flex; flex-direction:column; gap:10px;">
        
        <input id="guestNameInput" type="text" placeholder="Guest name…" 
          style="width:100%; padding:14px; border-radius:10px; background:var(--card); 
          color:white; border:none; font-size:16px; box-sizing: border-box" />

        <select id="guestGenderInput"
          style="width:100%; padding:14px; border-radius:10px; background:var(--card);
          color:white; border:none; font-size:16px;">
          <option value="">Gender</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>

        <select id="guestSideInput"
          style="width:100%; padding:14px; border-radius:10px; background:var(--card);
          color:white; border:none; font-size:16px;">
          <option value="">Side</option>
          <option value="charlie">Charlie</option>
          <option value="karla">Karla</option>
          <option value="both">Both</option>
        </select>

        <select id="guestRelationInput"
          style="width:100%; padding:14px; border-radius:10px; background:var(--card);
          color:white; border:none; font-size:16px;">
          <option value="">Relation</option>
          <option value="family">Family</option>
          <option value="friend">Friend</option>
        </select>

        <select id="guestRoleInput"
          style="width:100%; padding:14px; border-radius:10px; background:var(--card);
          color:white; border:none; font-size:16px;">
          <option value="">Role</option>
          <option value="bride">Bride</option>
          <option value="groom">Groom</option>
          <option value="principal sponsors">Principal Sponsors</option>
          <option value="parent">Parent</option>
          <option value="bridesmaid">Bridesmaid</option>
          <option value="groomsmen">Groomsmen</option>
          <option value="secondary sponsors">Secondary Sponsors</option>
          <option value="guest">Guest</option>
        </select>

        <select id="guestRsvpInput"
          style="width:100%; padding:14px; border-radius:10px; background:var(--card);
          color:white; border:none; font-size:16px;">
          <option value="">RSVP</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
          <option value="pending">Pending</option>
        </select>

        <textarea id="guestNotesInput" placeholder="Notes (optional)…"
          style="width:100%; padding:14px; border-radius:10px; background:var(--card);
          color:white; border:none; font-size:16px; min-height:70px; box-sizing:border-box;"></textarea>

        <button id="addGuestBtn" type="button" class="btn" 
          style="padding:14px; border-radius:12px;">
          Add Guest
        </button>
      </form>
  `;
})();

// =======================================================
// Fix Add Guest Button after dynamic rebuild
// =======================================================
document.body.addEventListener("click", async (e) => {
  if (e.target && e.target.id === "addGuestBtn") {
    const name = document.getElementById("guestNameInput").value.trim();
    const gender = document.getElementById("guestGenderInput").value.trim();
    const side = document.getElementById("guestSideInput").value.trim();
    const relation = document.getElementById("guestRelationInput").value.trim();
    const role = document.getElementById("guestRoleInput").value.trim();
    const rsvp = document.getElementById("guestRsvpInput").value.trim();
    const notes = document.getElementById("guestNotesInput").value.trim();

    if (!name) return alert("Guest name required.");

    await saveGuest({
      name,
      gender: gender || null,
      side: side || null,
      relation: relation || null,
      role: role || "guest",
      rsvp: rsvp || "pending",
      notes: notes || null,
      createdAt: Date.now(),
    });

    document.getElementById("guestsForm").reset();
    loadGuests();
    showSaveToast();
  }
});

// =======================================================
// Fix Add Checklist Button after notes insertion
// =======================================================
document.getElementById("addNextStepBtn").onclick = async () => {
  const text = document.getElementById("nextStepInput").value.trim();
  const notes = document.getElementById("nextStepNotes").value.trim();
  const deadline = document.getElementById("nextStepDeadline").value || null;

  if (!text) return alert("Please type a task");

  await set(push(ref(db, NEXT_PATH)), {
    text,
    notes: notes || null,
    deadline,
    done: false,
    createdAt: Date.now(),
  });

  document.getElementById("nextStepInput").value = "";
  document.getElementById("nextStepNotes").value = "";
  document.getElementById("nextStepDeadline").value = "";

  loadNextSteps(currentChecklistTarget);
  showSaveToast();
};

// =======================================================
// DEVICE ORIENTATION + RESIZE HANDLING (RESTORED)
// =======================================================

// This variable remembers whether we were in mobile mode previously
let lastIsMobile = window.innerWidth < 720;

// Re-render when device rotates (portrait <-> landscape)
window.addEventListener("orientationchange", () => {
  // slight delay because iOS reports wrong sizes instantly
  setTimeout(() => {
    listenRealtime();
  }, 150);
});

// Re-render when resizing (desktop or tablet)
window.addEventListener("resize", () => {
  const isMobile = window.innerWidth < 720;

  // only re-render if breakpoint actually changed
  if (isMobile !== lastIsMobile) {
    lastIsMobile = isMobile;
    listenRealtime();
  }
});

// =======================================================
// END OF FILE — all functionality preserved
// =======================================================

// App start
listenRealtime();

const guestFilters = {
  side: [],
  relation: [],
  role: [],
  rsvp: [],
};

function applyGuestFilters(g) {
  // SIDE
  if (guestFilters.side.length > 0 && !guestFilters.side.includes(g.side))
    return false;

  // RELATION
  if (
    guestFilters.relation.length > 0 &&
    !guestFilters.relation.includes(g.relation)
  )
    return false;

  // ROLE
  if (guestFilters.role.length > 0 && !guestFilters.role.includes(g.role))
    return false;

  // RSVP
  if (guestFilters.rsvp.length > 0 && !guestFilters.rsvp.includes(g.rsvp))
    return false;

  return true;
}

let guestViewMode = "list";

function renderGuestList(arr, box) {
  arr.forEach((g) => {
    const row = document.createElement("div");
    row.className = "cl-row";

    row.style.padding = "10px 0";
    row.style.borderBottom = "1px solid rgba(255,255,255,0.05)";

    const sideDot = `<span class="guest-dot dot-${g.side}"></span>`;
    const rsvpDot = `<span class="guest-dot dot-rsvp-${g.rsvp}"></span>`;

    row.innerHTML = `
  <div style="font-weight:700;">${sideDot}${g.name}</div>
  <div class="muted" style="font-size:13px;">
    ${g.relation || "—"} • ${g.role || "guest"} • ${rsvpDot}${g.rsvp}
  </div>
`;
    row.addEventListener("click", () => toggleInlineGuestEditor(g, row));
    row.addEventListener("click", (e) => {
      if (e.target.closest(".guest-inline-editor")) e.stopPropagation();
    });

    box.appendChild(row);
  });
}

function renderGuestGrid(arr, box) {
  const wrap = document.createElement("div");
  wrap.className = "guest-grid";

  arr.forEach((g) => {
    const item = document.createElement("div");
    item.className = "guest-grid-item";

    const sideDot = `<span class="guest-dot dot-${g.side}"></span>`;

    item.innerHTML = `
      <div style="font-weight:700;">${sideDot}${g.name}</div>
      <div class="muted" style="font-size:12px;">
        ${g.relation || "—"} • ${g.role || "guest"} 
      </div>
    `;
    item.addEventListener("click", () => toggleInlineGuestEditor(g, item));
    item.addEventListener("click", (e) => {
      if (e.target.closest(".guest-inline-editor")) e.stopPropagation();
    });

    wrap.appendChild(item);
  });

  box.appendChild(wrap);
}

const listBtn = document.getElementById("guestViewList");
const gridBtn = document.getElementById("guestViewGrid");

function updateGuestViewButtons() {
  if (guestViewMode === "list") {
    listBtn.className = "btn";
    gridBtn.className = "btn ghost";
  } else {
    listBtn.className = "btn ghost";
    gridBtn.className = "btn";
  }
}

listBtn.onclick = () => {
  guestViewMode = "list";
  updateGuestViewButtons();
  loadGuests();
};

gridBtn.onclick = () => {
  guestViewMode = "grid";
  updateGuestViewButtons();
  loadGuests();
};

// run once on load
updateGuestViewButtons();

// ======================================================
// Persist card order inside a single column (sortIndex)
// ======================================================
async function persistColumnOrder(listEl) {
  if (!listEl) return;

  const items = Array.from(listEl.querySelectorAll(".kanban-card"));
  const updates = {};

  items.forEach((card, i) => {
    const id = card.dataset.id;
    updates[`${GUESTS_PATH}/${id}/sortIndex`] = i;
  });

  if (Object.keys(updates).length > 0) {
    await update(ref(db), updates);
  }
}

// ======================================================
// Ensure all guests have sequential sortIndex per role
// ======================================================
async function ensureSortIndexes(allGuests = []) {
  if (!Array.isArray(allGuests) || allGuests.length === 0) return;

  const groups = {};

  // Group by role
  allGuests.forEach((g) => {
    let role = (g.role || "guest").toLowerCase();
    role = mapping[role] || role;
    if (!roleOrder.includes(role)) role = "guest";
    groups[role].push(g);
  });

  const updates = {};

  Object.keys(groups).forEach((role) => {
    const list = groups[role];

    // Sort current items by sortIndex (or fallback: createdAt)
    list.sort((a, b) => {
      const sA = Number(a.sortIndex ?? 0);
      const sB = Number(b.sortIndex ?? 0);
      if (sA !== sB) return sA - sB;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });

    // Reassign clean 0..n ordering
    list.forEach((g, idx) => {
      if (g.sortIndex !== idx) {
        updates[`${GUESTS_PATH}/${g.id}/sortIndex`] = idx;
      }
    });
  });

  if (Object.keys(updates).length > 0) {
    await update(ref(db), updates);
  }
}
