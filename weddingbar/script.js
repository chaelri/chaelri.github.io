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
const refreshBtn = document.getElementById("refreshBtn");

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
function render(items = []) {
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

    <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
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

  // Render attachments with preview + delete
  const listBox = document.getElementById("attachmentList");
  listBox.innerHTML = "";

  if (it.attachments && Array.isArray(it.attachments)) {
    it.attachments.forEach((url, idx) => {
      const wrapper = document.createElement("div");
      wrapper.style.position = "relative";

      // Thumbnail
      const thumb = document.createElement("img");
      thumb.src = url;
      thumb.style.width = "70px";
      thumb.style.height = "70px";
      thumb.style.borderRadius = "6px";
      thumb.style.objectFit = "cover";
      thumb.style.cursor = "pointer";

      // Fullscreen preview
      thumb.onclick = () => {
        const overlay = document.getElementById("imgPreviewOverlay");
        const fullImg = document.getElementById("imgPreviewFull");
        fullImg.src = url;
        overlay.style.display = "flex";
      };

      // Delete button
      const del = document.createElement("button");
      del.textContent = "×";
      del.style.position = "absolute";
      del.style.top = "-6px";
      del.style.right = "-6px";
      del.style.background = "rgba(0,0,0,0.6)";
      del.style.border = "none";
      del.style.color = "white";
      del.style.borderRadius = "50%";
      del.style.width = "20px";
      del.style.height = "20px";
      del.style.cursor = "pointer";
      del.style.fontSize = "14px";
      del.style.lineHeight = "20px";
      del.style.padding = "0";

      del.onclick = async (e) => {
        e.stopPropagation(); // prevent triggering fullscreen
        const newList = it.attachments.filter((_, i) => i !== idx);
        await set(ref(db, `${PATH}/${it.id}/attachments`), newList);
        showDetails({ ...it, attachments: newList }); // refresh panel
      };

      wrapper.appendChild(thumb);
      wrapper.appendChild(del);
      listBox.appendChild(wrapper);
    });
  }

  // UPLOAD handler (base64)
  const uploadBtn = document.getElementById("uploadAttachBtn");
  uploadBtn.onclick = async () => {
    const input = document.getElementById("attachInput");
    const file = input.files[0];
    if (!file) return alert("Select an image first.");

    // convert to base64
    const uploadBtn = document.getElementById("uploadAttachBtn");
    uploadBtn.onclick = async () => {
      const input = document.getElementById("attachInput");
      const file = input.files[0];
      if (!file) return alert("Select an image first.");

      try {
        // 1) Upload to ImgBB
        const imageURL = await uploadToImgbb(file);

        // 2) Save URL to Firebase
        const updatedList = it.attachments
          ? [...it.attachments, imageURL]
          : [imageURL];

        await set(ref(db, `${PATH}/${it.id}/attachments`), updatedList);

        // 3) Refresh UI
        showDetails({ ...it, attachments: updatedList });
        listenRealtime();

        alert("Image uploaded!");
      } catch (err) {
        console.error(err);
        alert("Failed to upload image.");
      }
    };

    // add to DB
    const finalList = it.attachments ? [...it.attachments, b64] : [b64];
    await set(ref(db, `${PATH}/${it.id}/attachments`), finalList);

    alert("Image attached!");

    // Update UI
    listenRealtime();
    showDetails({ ...it, attachments: finalList });
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
    render(arr);
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

refreshBtn.onclick = listenRealtime;

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
