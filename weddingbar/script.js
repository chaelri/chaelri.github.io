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
  if (countdownMode === "days") {
    value = Math.floor(diff / (1000 * 60 * 60 * 24));
  } else if (countdownMode === "weeks") {
    value = Math.ceil(diff / (1000 * 60 * 60 * 24 * 7));
  } else {
    value = Math.ceil(diff / (1000 * 60 * 60 * 24 * 30));
  }

  document.getElementById("daysLeftNumber").textContent = value;
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
      showDetails({ ...it, attachments: newList });
      listenRealtime();
    } catch (e) {
      console.error(e);
      alert("Upload failed.");
    }
    hideUploadLoader();
  };

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
    const sortType = savedSort;
    render(arr, sortType);
    updateSummary(arr);
    renderTableView(arr);
    renderGallery(arr);
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

    const arr = Object.keys(val).map((id) => ({ id, ...val[id] }));
    arr.sort(
      (a, b) =>
        (a.deadline || a.createdAt || 0) - (b.deadline || b.createdAt || 0)
    );

    listEl.innerHTML = "";

    arr.forEach((step) => {
      const row = document.createElement("div");
      row.style.cssText = `
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:12px;
        padding:12px 0;
        border-bottom:1px solid rgba(255,255,255,0.05);
      `;

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.alignItems = "flex-start";
      left.style.gap = "12px";

      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.className = "next-checkbox";
      chk.checked = !!step.done;
      chk.onclick = () =>
        set(ref(db, `${NEXT_PATH}/${step.id}/done`), chk.checked);

      const txt = document.createElement("div");
      txt.style.maxWidth = "100%";
      txt.innerHTML = `
        <div style="font-size:15px; ${
          step.done ? "text-decoration:line-through;color:var(--muted);" : ""
        } font-weight:700;">
          ${escapeHtml(step.text)}
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

      const delBtn = document.createElement("button");
      delBtn.textContent = "×";
      delBtn.style.cssText = `
        width:32px;height:32px;border:none;border-radius:8px;
        background:rgba(255,255,255,0.06);color:white;cursor:pointer;
      `;
      delBtn.onclick = () => remove(ref(db, `${NEXT_PATH}/${step.id}`));

      row.appendChild(left);
      row.appendChild(delBtn);
      listEl.appendChild(row);
    });
  });
}

// Guests listener
let guestsUnsub = null;

function saveGuest(obj) {
  return set(push(ref(db, GUESTS_PATH)), obj);
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

    const arr = Object.keys(val).map((id) => ({ id, ...val[id] }));
    arr.sort((a, b) => {
      if ((a.side || "") !== (b.side || ""))
        return (a.side || "").localeCompare(b.side || "");
      if ((a.relation || "") !== (b.relation || ""))
        return (a.relation || "").localeCompare(b.relation || "");
      return (a.name || "").localeCompare(b.name || "");
    });

    box.innerHTML = "";
    arr.forEach((g) => {
      const row = document.createElement("div");
      row.style.cssText = `
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:12px;
        padding:10px 0;
        border-bottom:1px solid rgba(255,255,255,0.05);
      `;

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.flexDirection = "column";
      left.style.gap = "6px";

      const title = document.createElement("div");
      title.style.fontWeight = "700";
      title.textContent = g.name;

      const meta = document.createElement("div");
      meta.className = "muted";
      meta.style.fontSize = "13px";
      meta.textContent = `${g.side || "—"} • ${g.relation || "—"} • ${
        g.role || "guest"
      } • RSVP: ${g.rsvp || "pending"}`;

      left.appendChild(title);
      left.appendChild(meta);

      if (g.notes) {
        const note = document.createElement("div");
        note.className = "muted";
        note.style.fontSize = "13px";
        note.textContent = g.notes;
        left.appendChild(note);
      }

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "8px";

      const del = document.createElement("button");
      del.textContent = "Delete";
      del.className = "btn ghost";
      del.onclick = () => remove(ref(db, `${GUESTS_PATH}/${g.id}`));

      actions.appendChild(del);

      row.appendChild(left);
      row.appendChild(actions);
      box.appendChild(row);
    });
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

document.getElementById("openGuests").onclick = () => {
  checklistDropdown.style.display = "none";
  openGuestsPanel();
};

document.getElementById("openSeating").onclick = () => {
  checklistDropdown.style.display = "none";
  alert("Seating Planner coming soon");
};

function openChecklistPanel() {
  document.getElementById("weddingCostsWrapper").style.display = "none";
  document.getElementById("nextStepsPanel").style.display = "none";
  document.getElementById("toggleControlsBtn").style.display = "none";

  document.getElementById("checklistPanel").style.display = "block";
  document.getElementById("guestsPanel").style.display = "none";

  document.getElementById("nextStepsAddBar").style.display = "block";
  document.getElementById("guestsAddBar").style.display = "none";

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
}

document.getElementById("checklistBackBtn").onclick = () => {
  document.getElementById("checklistPanel").style.display = "none";
  document.getElementById("nextStepsAddBar").style.display = "none";
  document.getElementById("weddingCostsWrapper").style.display = "block";
  document.getElementById("toggleControlsBtn").style.display = "block";
  listenRealtime();
};

document.getElementById("guestsBackBtn").onclick = () => {
  document.getElementById("guestsPanel").style.display = "none";
  document.getElementById("guestsAddBar").style.display = "none";
  document.getElementById("weddingCostsWrapper").style.display = "block";
  document.getElementById("toggleControlsBtn").style.display = "block";
  listenRealtime();
};

document.getElementById("nextStepsBackBtn").onclick = () => {
  document.getElementById("nextStepsPanel").style.display = "none";
  document.getElementById("nextStepsAddBar").style.display = "none";
  document.getElementById("weddingCostsWrapper").style.display = "block";
  document.getElementById("toggleControlsBtn").style.display = "block";
  listenRealtime();
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

// =======================================================
// Prevent iPhone zoom by enforcing min 16px font in all inputs/selects
// =======================================================

document.querySelectorAll("input, select, button").forEach((el) => {
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
          color:white; border:none; font-size:16px;" />

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
          color:white; border:none; font-size:16px; min-height:70px;"></textarea>

        <button id="addGuestBtn" type="button" class="btn" 
          style="padding:14px; font-size:16px; border-radius:12px;">
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
// Improve Checklist Add Form — add Notes field if missing
// =======================================================

// Insert notes input if not present
(function initChecklistNotes() {
  const wrap = document.getElementById("nextStepsAddInner");
  if (!wrap) return;

  // Create textarea for notes
  const notes = document.createElement("textarea");
  notes.id = "nextStepNotes";
  notes.placeholder = "Notes (optional)…";
  notes.style.cssText =
    "width:100%; padding:12px; border-radius:10px; background:var(--card); color:white; border:none; font-size:16px; margin-bottom:12px; min-height:70px;";
  wrap.insertBefore(notes, document.getElementById("addNextStepBtn"));
})();

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
// END OF FILE — all functionality preserved
// =======================================================

// App start
listenRealtime();
