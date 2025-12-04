// script.js
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
  getMessaging,
  getToken,
  onMessage,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-messaging.js";

import {
  getStorage,
  ref as sRef,
  uploadBytes,
  deleteObject,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";

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
const storage = getStorage(app);
const messaging = getMessaging(app);

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
      fill.style.width = "0%";
      requestAnimationFrame(() => (fill.style.width = pct + "%"));
    } else {
      fill.style.height = "0%";
      requestAnimationFrame(() => (fill.style.height = pct + "%"));
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

    <!-- ITEM TITLE + CREATED DATE IN OWN SECTION -->
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
      <div style="margin-top:16px;">
        <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:6px;">
            Attachments
        </label>

        <div id="attachmentList" style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
            <!-- filled by JS -->
        </div>

        <input type="file" id="attachInput" accept="image/*" multiple style="margin-bottom:10px;" />
    </div>

    </div>
  `;

  document.getElementById("chartSection").style.display = "none";

  // show panel
  detailPanel.classList.add("show");
  detailPanel.style.display = "block";
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

  const backBtn = document.getElementById("backBtn");

  backBtn.onclick = () => {
    // hide detail panel
    detailPanel.classList.remove("show");
    detailPanel.style.display = "none";

    // show bars again
    document.getElementById("chartSection").style.display = "block";
  };

  // ATTACHMENTS LIST (with preview + delete)
  const listBox = document.getElementById("attachmentList");
  listBox.innerHTML = "";

  const attachments = it.attachments || [];

  attachments.forEach((att, idx) => {
    const url = att.url; // URL from Firebase Storage

    const wrap = document.createElement("div");
    wrap.style.position = "relative";

    const img = document.createElement("img");
    img.src = url;

    img.onload = () => {
      // force Safari repaint
      img.style.opacity = "1";
    };

    img.style.opacity = "0"; // start hidden
    img.style.transition = "opacity 0.15s ease-out";

    img.style.width = "70px";
    img.style.height = "70px";
    img.style.objectFit = "cover";
    img.style.borderRadius = "6px";
    img.style.cursor = "pointer";

    // FIXED — Viewer now receives URLs only
    img.onclick = () => {
      const urlList = attachments.map((a) => a.url); // convert object list → url list
      openViewer(urlList, idx);
    };

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
        // DELETE from Firebase Storage
        if (att.path) {
          await deleteFromFirebaseStorage(att.path);
        }

        // DELETE from Firebase Database
        const newList = attachments.filter((_, i) => i !== idx);
        await set(ref(db, `${PATH}/${it.id}/attachments`), newList);

        // Refresh View
        showDetails({ ...it, attachments: newList });
      });
    };

    wrap.appendChild(img);
    wrap.appendChild(delBtn);
    listBox.appendChild(wrap);
  });

  const fileInput = document.getElementById("attachInput");
  fileInput.multiple = true; // ensure multi-file input

  fileInput.onchange = async () => {
    const files = Array.from(fileInput.files);
    if (files.length === 0) return;

    showUploadLoader();

    try {
      let newList = [...(it.attachments || [])];

      // Process each selected file
      for (const file of files) {
        // Compress first (0.6 quality, 1280 max width)
        const compressed = await compressImage(file, 0.6, 1280);

        // Upload to Firebase Storage
        const uploaded = await uploadToFirebaseStorage(it.id, compressed);

        // Push into attachment list
        newList.push(uploaded);
      }

      // Save updated attachments list to Firebase Database
      await set(ref(db, `${PATH}/${it.id}/attachments`), newList);

      // Refresh UI
      showDetails({ ...it, attachments: newList });
      listenRealtime();
    } catch (err) {
      console.error(err);
      alert("Failed to upload images.");
    }

    hideUploadLoader();
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
    if (!val) {
      render([]);
      updateSummary([]);
      return;
    }

    // Convert object to array
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

async function sendNotification(title, body, extraData = {}) {
  console.log(title);
  console.log(body);
  await push(ref(db, "notifications/queue"), {
    title,
    body,
    data: extraData,
  });
}

// ----------------- ADD AFTER saveEntry(...) -----------------
/**
 * Update an existing entry by id (overwrites values provided).
 * We use set(ref(db, PATH + '/' + id), obj) to write exact fields.
 */
async function updateEntry(id, obj) {
  if (!id) throw new Error("Missing id for updateEntry");
  await update(ref(db, `${PATH}/${id}`), obj);
}

/**
 * Delete an entry by id.
 */
async function deleteEntry(id) {
  if (!id) throw new Error("Missing id for deleteEntry");
  await remove(ref(db, `${PATH}/${id}`));
}

async function enableNotifications() {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return;

  const token = await getToken(messaging, {
    vapidKey:
      "BOa8XHyFqlBP8Wn7BU4Z_Vut60wcGv4947ZwZeUN6TmPfhuHfnga1AaKG6jeZ2LjC8wUDnh9VcExWFNXaU3J0Y8",
  });

  console.log("FCM Token:", token);

  // 🔥 SAVE TOKEN TO DATABASE
  await set(ref(db, "fcmTokens/" + token), true);
  console.log("Token saved to DB.");
}

enableNotifications();

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
      .register("/sw.js")
      .then((reg) => console.log("SW OK:", reg.scope))
      .catch((err) => console.warn("SW FAIL", err));
  });
}
navigator.serviceWorker
  .register("/firebase-messaging-sw.js")
  .then((reg) => {
    console.log("Messaging SW registered", reg);
  })
  .catch((err) => console.error("FCM SW failed", err));

// FULLSCREEN VIEWER + SWIPE
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

function showImg(delta) {
  currentAttachIndex =
    (currentAttachIndex + delta + currentAttachList.length) %
    currentAttachList.length;
  viewerImg.src = currentAttachList[currentAttachIndex];
}

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

function showUploadLoader() {
  document.getElementById("uploadLoader").style.display = "block";
}

function hideUploadLoader() {
  document.getElementById("uploadLoader").style.display = "none";
}

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

      canvas.toBlob(
        (blob) => {
          resolve(blob);
        },
        "image/jpeg",
        quality
      );
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

// Toggle Add Costs section with arrow animation (DEFAULT HIDDEN)
const toggleBtn = document.getElementById("toggleControlsBtn");
const controlsSection = document.querySelector(".controls");

if (toggleBtn && controlsSection) {
  // 1. Default: hidden
  controlsSection.classList.remove("visible");
  controlsSection.classList.add("hidden");
  toggleBtn.classList.remove("toggle-expanded"); // arrow DOWN (▼)
  toggleBtn.querySelector(".toggle-arrow").textContent = "▼";

  toggleBtn.addEventListener("click", () => {
    const isHidden = controlsSection.classList.contains("hidden");

    if (isHidden) {
      // SHOW
      controlsSection.classList.remove("hidden");
      controlsSection.classList.add("visible");

      toggleBtn.classList.add("toggle-expanded"); // arrow UP (▲)
      toggleBtn.querySelector(".toggle-arrow").textContent = "▲";
    } else {
      // HIDE
      controlsSection.classList.remove("visible");
      controlsSection.classList.add("hidden");

      toggleBtn.classList.remove("toggle-expanded"); // arrow DOWN (▼)
      toggleBtn.querySelector(".toggle-arrow").textContent = "▼";
    }
  });
}

document.getElementById("viewerPrevBtn").onclick = () => {
  showImg(-1);
};

document.getElementById("viewerNextBtn").onclick = () => {
  showImg(1);
};

viewerImg.onclick = (e) => e.stopPropagation();

document.getElementById("nextStepsBtn").onclick = () => {
  // hide everything wedding-costs related
  document.getElementById("backBtn")?.click();
  document.getElementById("weddingCostsWrapper").style.display = "none";
  document.getElementById("toggleControlsBtn").style.display = "none";
  detailPanel.style.display = "none";

  // show next steps panel
  document.getElementById("nextStepsPanel").style.display = "block";
  document.getElementById("nextStepsAddBar").style.display = "block";

  loadNextSteps();
};

document.getElementById("nextStepsBackBtn").onclick = () => {
  document.getElementById("nextStepsPanel").style.display = "none";
  document.getElementById("nextStepsAddBar").style.display = "none";
  document.getElementById("weddingCostsWrapper").style.display = "block";
  document.getElementById("toggleControlsBtn").style.display = "block";
};

document.getElementById("addNextStepBtn").onclick = async () => {
  const text = document.getElementById("nextStepInput").value.trim();
  const deadline = document.getElementById("nextStepDeadline").value || null;

  if (deadline) {
    sendNotification("New Step Added", `${text} — Deadline: ${deadline}`);
  } else {
    sendNotification("New Step Added", `${text}`);
  }

  if (!text) return alert("Please type a task");

  await set(push(ref(db, NEXT_PATH)), {
    text,
    deadline,
    done: false,
    createdAt: Date.now(),
  });

  document.getElementById("nextStepInput").value = "";
  document.getElementById("nextStepDeadline").value = "";

  loadNextSteps();
};

function loadNextSteps() {
  const listBox = document.getElementById("nextStepsList");

  onValue(ref(db, NEXT_PATH), (snap) => {
    const val = snap.val();
    if (!val) {
      listBox.innerHTML = `<div class="muted">No tasks yet.</div>`;
      return;
    }

    const arr = Object.keys(val).map((id) => ({
      id,
      ...val[id],
    }));

    // sort by deadline OR created date
    arr.sort(
      (a, b) => (a.deadline || a.createdAt) - (b.deadline || b.createdAt)
    );

    listBox.innerHTML = "";

    arr.forEach((step) => {
      const row = document.createElement("div");
      row.style.cssText = `
        display:flex;
        justify-content:space-between;
        align-items:center;
        padding:10px 0;
        border-bottom:1px solid rgba(255,255,255,0.05);
      `;

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.alignItems = "center";
      left.style.gap = "10px";

      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.className = "next-checkbox";
      chk.checked = step.done;
      chk.onclick = () => {
        set(ref(db, `${NEXT_PATH}/${step.id}/done`), chk.checked);
      };

      const txt = document.createElement("div");
      txt.innerHTML = `
        <div style="font-size:15px; ${
          step.done ? "text-decoration:line-through;color:var(--muted);" : ""
        }">
          ${escapeHtml(step.text)}
        </div>
        ${
          step.deadline
            ? `<div class="muted" style="font-size:12px;">Deadline: ${step.deadline}</div>`
            : ""
        }
      `;

      left.appendChild(chk);
      left.appendChild(txt);

      const delBtn = document.createElement("button");
      delBtn.textContent = "×";
      delBtn.style.cssText = `
        width:26px;height:26px;border:none;border-radius:8px;
        background:rgba(255,255,255,0.06);color:white;cursor:pointer;
      `;
      delBtn.onclick = () => {
        remove(ref(db, `${NEXT_PATH}/${step.id}`));
      };

      row.appendChild(left);
      row.appendChild(delBtn);
      listBox.appendChild(row);
    });
  });
}
