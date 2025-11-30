// script.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  push,
  set,
  remove,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";

// Firebase config (unchanged)
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

const barsRoot = document.getElementById("bars");
const detailPanel = document.getElementById("detailPanel");

const addBtn = document.getElementById("addBtn");
const clearBtn = document.getElementById("clearBtn");

const nameInput = document.getElementById("name");
const totalInput = document.getElementById("total");
const paidInput = document.getElementById("paid");
const bookedInput = document.getElementById("booked");

const PATH = "weddingCosts";

// Format money
const fmt = (n) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(n);

// HTML escape
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

/* =======================================================
   RENDER — FIXED percent clamp + horizontal/vertical bars
   ======================================================= */
function render(items = [], sortType = "none") {
  // Apply sorting
  if (sortType === "booked") {
    items.sort((a, b) => {
      // booked first
      return (b.booked === true) - (a.booked === true);
    });
  } else if (sortType === "totalHigh") {
    items.sort((a, b) => b.total - a.total);
  } else if (sortType === "totalLow") {
    items.sort((a, b) => a.total - b.total);
  }

  barsRoot.innerHTML = "";

  items.forEach((it) => {
    const rawPct = it.total ? (it.paid / it.total) * 100 : 0;
    const pct = Math.min(100, Math.max(0, Math.round(rawPct))); // FIXED

    const card = document.createElement("button");
    card.className = "bar-card";
    card.onclick = () => showDetails(it);

    // THUMB
    const thumb = document.createElement("div");
    thumb.className = "bar-thumb";

    const fill = document.createElement("div");
    fill.className = "bar-fill";

    const text = document.createElement("div");
    text.className = "progress-text";
    text.textContent = it.booked || it.paid > 0 ? pct + "%" : "—";

    fill.appendChild(text);
    thumb.appendChild(fill);

    // VIEWPORT RESPONSIVE BEHAVIOR
    if (window.innerWidth < 720) {
      fill.style.width = pct + "%"; // MOBILE horizontal
    } else {
      fill.style.height = pct + "%"; // DESKTOP vertical
    }

    // INFO
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

    const chip = document.createElement("div");
    chip.className =
      "status-chip " + (it.booked ? "status-booked" : "status-not");
    chip.textContent = it.booked ? "Booked" : "Not yet booked";

    card.appendChild(thumb);
    card.appendChild(info);
    card.appendChild(chip);
    barsRoot.appendChild(card);
  });
}

function updateSummary(items = []) {
  let totalPaid = 0;
  let grandTotal = 0;

  items.forEach((it) => {
    totalPaid += Number(it.paid || 0);
    grandTotal += Number(it.total || 0);
  });

  document.getElementById("summaryPaid").textContent = fmt(totalPaid);
  document.getElementById("summaryTotal").textContent = fmt(grandTotal);
}

// SHOW DETAILS
// ----------------- REPLACE showDetails(it) WITH THIS -----------------
function showDetails(it) {
  // Render editable fields inside the existing detailPanel
  detailPanel.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
      <div>
        <strong>${escapeHtml(it.name)}</strong>
        <div class="muted" style="font-size:12px;margin-top:4px;">
          Created: ${new Date(it.createdAt || 0).toLocaleString()}
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button id="deleteBtn" class="btn ghost">Delete</button>
        <button id="updateBtn" class="btn">Update</button>
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
      <div style="margin-top:16px;">
        <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:6px;">
            Attachments
        </label>

        <div id="attachmentList" style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
            <!-- filled by JS -->
        </div>

        <input type="file" id="attachInput" accept="image/*" style="margin-bottom:10px;" />
        <button id="uploadAttachBtn" class="btn ghost">Add Image</button>
    </div>

    </div>
  `;

  // show panel
  detailPanel.classList.add("show");
  detailPanel.setAttribute("aria-hidden", "false");

  // wire up buttons: update and delete
  const updateBtn = document.getElementById("updateBtn");
  const deleteBtn = document.getElementById("deleteBtn");

  // remove any prior listeners by replacing node (safe)
  updateBtn.replaceWith(updateBtn.cloneNode(true));
  deleteBtn.replaceWith(deleteBtn.cloneNode(true));

  // re-query (cloned nodes)
  const updateBtn2 = document.getElementById("updateBtn");
  const deleteBtn2 = document.getElementById("deleteBtn");

  updateBtn2.addEventListener("click", async () => {
    // gather edited values
    const newName = document.getElementById("detailName").value.trim();
    const newPaid = Number(document.getElementById("detailPaid").value) || 0;
    const newTotal = Number(document.getElementById("detailTotal").value) || 0;
    const newBooked = document.getElementById("detailBooked").checked;

    if (!newName || !newTotal) {
      return alert("Please provide a name and a total amount.");
    }

    // call update helper (keeps createdAt)
    await updateEntry(it.id, {
      name: newName,
      paid: newPaid,
      total: newTotal,
      booked: newBooked,
      createdAt: it.createdAt || Date.now(),
    });

    // refresh live view
    listenRealtime();

    // hide panel
    detailPanel.classList.remove("show");
    detailPanel.setAttribute("aria-hidden", "true");
  });

  deleteBtn2.addEventListener("click", async () => {
    const ok = confirm(
      `Delete "${it.name}"? This will remove the item from Firebase.`
    );
    if (!ok) return;

    await deleteEntry(it.id);

    // refresh and hide
    listenRealtime();
    detailPanel.classList.remove("show");
    detailPanel.setAttribute("aria-hidden", "true");
  });

  // ATTACHMENTS LIST (with preview + delete)
  const listBox = document.getElementById("attachmentList");
  listBox.innerHTML = "";

  const attachments = it.attachments || [];

  attachments.forEach((url, idx) => {
    const wrap = document.createElement("div");
    wrap.style.position = "relative";

    const img = document.createElement("img");
    img.src = url;
    img.style.width = "70px";
    img.style.height = "70px";
    img.style.objectFit = "cover";
    img.style.borderRadius = "6px";
    img.style.cursor = "pointer";

    img.onclick = () => openViewer(attachments, idx);

    const delBtn = document.createElement("button");
    delBtn.textContent = "×";
    delBtn.style.position = "absolute";
    delBtn.style.top = "-6px";
    delBtn.style.right = "-6px";
    delBtn.style.width = "20px";
    delBtn.style.height = "20px";
    delBtn.style.borderRadius = "50%";
    delBtn.style.border = "none";
    delBtn.style.background = "rgba(0,0,0,0.7)";
    delBtn.style.color = "#fff";
    delBtn.style.cursor = "pointer";

    delBtn.onclick = (e) => {
      e.stopPropagation();
      showDeleteConfirm(async () => {
        const newList = attachments.filter((_, i) => i !== idx);
        await set(ref(db, `${PATH}/${it.id}/attachments`), newList);
        showDetails({ ...it, attachments: newList });
      });
    };

    wrap.appendChild(img);
    wrap.appendChild(delBtn);
    listBox.appendChild(wrap);
  });

  // UPLOAD NEW ATTACHMENT (IMGBB)
  const uploadBtn = document.getElementById("uploadAttachBtn");
  uploadBtn.onclick = async () => {
    const file = document.getElementById("attachInput").files[0];
    if (!file) return alert("Select an image first.");

    try {
      const url = await uploadToImgbb(file);
      const newList = [...attachments, url];
      await set(ref(db, `${PATH}/${it.id}/attachments`), newList);
      showDetails({ ...it, attachments: newList });
    } catch (err) {
      console.error(err);
      alert("Failed to upload image.");
    }
  };

  // make the checkbox visual toggle work in the detail panel as your helper does
  const detailCheckbox = document.getElementById("detailBooked");
  const detailBox = detailCheckbox ? detailCheckbox.nextElementSibling : null;
  if (detailBox && !detailBox.dataset.hasBoxClick) {
    detailBox.dataset.hasBoxClick = "1";
    detailBox.addEventListener("click", () => {
      detailCheckbox.checked = !detailCheckbox.checked;
      detailCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
      detailCheckbox.focus();
    });
  }
}

/* Listen from Firebase */
function listenRealtime() {
  onValue(ref(db, PATH), (snapshot) => {
    const val = snapshot.val();
    if (!val) return;

    const arr = Object.keys(val).map((k) => ({ id: k, ...val[k] }));
    const sortType = document.getElementById("sortSelect").value;
    render(arr, sortType);
    updateSummary(arr);
  });
}

/* Save */
async function saveEntry(obj) {
  await set(push(ref(db, PATH)), obj);
}

// ----------------- ADD AFTER saveEntry(...) -----------------
/**
 * Update an existing entry by id (overwrites values provided).
 * We use set(ref(db, PATH + '/' + id), obj) to write exact fields.
 */
async function updateEntry(id, obj) {
  if (!id) throw new Error("Missing id for updateEntry");
  await set(ref(db, `${PATH}/${id}`), obj);
}

/**
 * Delete an entry by id.
 */
async function deleteEntry(id) {
  if (!id) throw new Error("Missing id for deleteEntry");
  await remove(ref(db, `${PATH}/${id}`));
}

async function uploadToImgbb(file) {
  const apiKey = "8d4b7939a2d5c9f6b6366ce54305e3db";
  const formData = new FormData();
  formData.append("image", file);

  const res = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
    method: "POST",
    body: formData,
  });

  const data = await res.json();
  if (!data.success) throw new Error("ImgBB upload failed");

  return data.data.url; // Direct HTTPS URL to stored image
}

// ----------------- END ADD -----------------

/* Controls */
addBtn.addEventListener("click", async () => {
  const name = nameInput.value.trim();
  const total = Number(totalInput.value);
  const paid = Number(paidInput.value) || 0;
  const booked = bookedInput.checked;

  if (!name || !total) return alert("Missing fields.");

  await saveEntry({
    name,
    total,
    paid,
    booked,
    createdAt: Date.now(),
  });

  nameInput.value = "";
  totalInput.value = "";
  paidInput.value = "";
  bookedInput.checked = false;
});

clearBtn.onclick = () => {
  nameInput.value = "";
  totalInput.value = "";
  paidInput.value = "";
  bookedInput.checked = false;
};

window.addEventListener("resize", listenRealtime);

// Checkbox helper — keep click-to-toggle but remove ripple animation
document.querySelectorAll('.chk input[type="checkbox"]').forEach((input) => {
  // make clicking the visual box toggle the input (for safety)
  const box = input.nextElementSibling;
  if (box && !box.dataset.hasBoxClick) {
    box.dataset.hasBoxClick = "1";
    box.addEventListener("click", () => {
      input.checked = !input.checked;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.focus();
    });
  }
});

document.getElementById("imgPreviewOverlay").onclick = () => {
  document.getElementById("imgPreviewOverlay").style.display = "none";
};

listenRealtime();

/* SW register */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/weddingbar/sw.js")
      .then((reg) => console.log("SW OK:", reg.scope))
      .catch((err) => console.warn("SW FAIL", err));
  });
}

// FULLSCREEN VIEWER + SWIPE
let currentAttachList = [];
let currentAttachIndex = 0;

const viewer = document.getElementById("imgViewerOverlay");
const viewerImg = document.getElementById("imgViewerFull");
const viewLeft = document.getElementById("viewerLeft");
const viewRight = document.getElementById("viewerRight");

function openViewer(list, index) {
  currentAttachList = list;
  currentAttachIndex = index;
  viewerImg.src = list[index];
  viewer.style.display = "flex";
}

viewer.onclick = (e) => {
  if (e.target === viewer) viewer.style.display = "none";
};

function showImg(delta) {
  currentAttachIndex =
    (currentAttachIndex + delta + currentAttachList.length) %
    currentAttachList.length;
  viewerImg.src = currentAttachList[currentAttachIndex];
}

viewLeft.onclick = () => showImg(-1);
viewRight.onclick = () => showImg(1);

// Swipe gestures
let sx = 0;
viewer.addEventListener("touchstart", (e) => (sx = e.touches[0].clientX));
viewer.addEventListener("touchend", (e) => {
  const dx = e.changedTouches[0].clientX - sx;
  if (Math.abs(dx) > 50) dx < 0 ? showImg(1) : showImg(-1);
});

// DELETE CONFIRMATION MODAL
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

document.getElementById("viewerCloseBtn").onclick = () => {
  viewer.style.display = "none";
};

document.getElementById("sortSelect").addEventListener("change", () => {
  listenRealtime();
});
