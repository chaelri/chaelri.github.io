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
function showDetails(it) {
  detailPanel.innerHTML = `
    <div style="display:flex;justify-content:space-between;">
      <strong>${escapeHtml(it.name)}</strong>
      <span class="muted">${it.booked ? "Booked" : "Not yet booked"}</span>
    </div>
    <div style="margin-top:8px">
      Paid: <strong>${it.booked || it.paid > 0 ? fmt(it.paid) : "—"}</strong>
    </div>
    <div>Total: <strong>${fmt(it.total)}</strong></div>
  `;
  detailPanel.classList.add("show");
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
