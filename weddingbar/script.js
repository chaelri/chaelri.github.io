// script.js
// Modular Firebase v9 (Realtime Database) + UI logic for WeddingBar

// -----------------------------
// Imports (ES modules hosted by Firebase CDN)
// -----------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  onValue,
  push,
  set,
  remove,
  get,
  child,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";

// -----------------------------
// Firebase configuration (you provided)
// -----------------------------
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

// -----------------------------
// Initialize Firebase
// -----------------------------
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// Optional: Google auth provider helpers (not required for DB reads if rules allow)
const provider = new GoogleAuthProvider();

// -----------------------------
// DOM references (expected IDs from index.html)
// -----------------------------
const barsRoot = document.getElementById("bars");
const detailPanel = document.getElementById("detailPanel");
const addBtn = document.getElementById("addBtn");
const clearBtn = document.getElementById("clearBtn");
const refreshBtn = document.getElementById("refreshBtn");
const nameInput = document.getElementById("name");
const totalInput = document.getElementById("total");
const paidInput = document.getElementById("paid");
const bookedInput = document.getElementById("booked");

// Realtime DB collection path
const PATH = "weddingCosts";

// Dummy fallback data if DB read fails
const DUMMY = [
  {
    name: "Caterer",
    total: 30000,
    paid: 5000,
    booked: true,
    createdAt: Date.now(),
  },
  {
    name: "Venue",
    total: 80000,
    paid: 2000,
    booked: true,
    createdAt: Date.now(),
  },
  {
    name: "Photographer",
    total: 25000,
    paid: 0,
    booked: false,
    createdAt: Date.now(),
  },
  {
    name: "Makeup & Hair",
    total: 7000,
    paid: 3000,
    booked: false,
    createdAt: Date.now(),
  },
  {
    name: "Flowers",
    total: 6000,
    paid: 6000,
    booked: true,
    createdAt: Date.now(),
  },
  { name: "Band", total: 15000, paid: 0, booked: false, createdAt: Date.now() },
];

// -----------------------------
// Utilities
// -----------------------------
const fmt = (n) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(n);

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        m
      ])
  );
}

// Accent gradient helper
function accentStart() {
  return "#ff758c";
}
function accentEnd() {
  return "#9b8cff";
}

// -----------------------------
// Render UI
// -----------------------------
function render(items = []) {
  barsRoot.innerHTML = "";
  if (!items.length) {
    barsRoot.innerHTML = '<div class="muted">No items yet</div>';
    return;
  }

  // Sort: booked first, then percent paid desc
  items.sort((a, b) => {
    const bookedDiff =
      (b.booked === true ? 1 : 0) - (a.booked === true ? 1 : 0);
    if (bookedDiff !== 0) return bookedDiff;
    const ap = a.total ? (a.paid || 0) / a.total : 0;
    const bp = b.total ? (b.paid || 0) / b.total : 0;
    return bp - ap;
  });

  for (const it of items) {
    const pct = it.total ? Math.round(((it.paid || 0) / it.total) * 100) : 0;

    const card = document.createElement("button");
    card.className = "bar-card";
    card.type = "button";
    card.setAttribute(
      "aria-label",
      `${it.name} ${it.booked ? "booked" : "not yet booked"}`
    );
    card.addEventListener("click", () => showDetails(it));

    // Thumb / visual bar
    const thumb = document.createElement("div");
    thumb.className = "bar-thumb";

    const fill = document.createElement("div");
    fill.className = "bar-fill";

    // visual percentage: ensure minimal height so item is tappable
    const visualPercent =
      it.paid && it.total
        ? Math.min(100, Math.round((it.paid / it.total) * 100))
        : 6;
    fill.style.height = visualPercent + "%";
    fill.style.background = `linear-gradient(180deg, rgba(255,255,255,0.12), rgba(0,0,0,0.06)), linear-gradient(180deg, ${accentStart()}, ${accentEnd()})`;
    fill.title = `${it.name}: ${it.paid ? fmt(it.paid) : "—"} / ${fmt(
      it.total
    )} (${pct}%)`;

    const fillText = document.createElement("div");
    fillText.className = "progress-text";
    fillText.style.fontSize = "12px";
    fillText.style.color = "#fff";
    fillText.textContent =
      it.booked || (it.paid && it.paid > 0) ? `${pct}%` : "—";

    fill.appendChild(fillText);
    thumb.appendChild(fill);

    // Info column
    const info = document.createElement("div");
    info.className = "bar-info";

    const title = document.createElement("div");
    title.className = "bar-title";
    title.textContent = it.name;

    const sub = document.createElement("div");
    sub.className = "bar-sub";
    sub.textContent = it.booked
      ? `${fmt(it.paid || 0)} / ${fmt(it.total)}`
      : it.paid && it.paid > 0
      ? `${fmt(it.paid)} / ${fmt(it.total)}`
      : `— / ${fmt(it.total)}`;

    info.appendChild(title);
    info.appendChild(sub);

    // Status chip
    const chip = document.createElement("div");
    chip.className =
      "status-chip " + (it.booked ? "status-booked" : "status-not");
    chip.textContent = it.booked ? "Booked" : "Not yet booked";

    // Compose
    card.appendChild(thumb);
    card.appendChild(info);
    card.appendChild(chip);
    barsRoot.appendChild(card);
  }
}

// Show details when tapping a bar
function showDetails(it) {
  detailPanel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <strong>${escapeHtml(it.name)}</strong>
      <small class="muted">${it.booked ? "Booked" : "Not yet booked"}</small>
    </div>
    <div style="margin-top:8px">Paid: <strong>${
      it.booked || (it.paid && it.paid > 0) ? fmt(it.paid || 0) : "—"
    }</strong></div>
    <div>Total: <strong>${fmt(it.total)}</strong></div>
    <div style="margin-top:8px;color:var(--muted);font-size:13px">Tap a bar to see details. Use the form to add new entries.</div>
  `;
  detailPanel.classList.add("show");
  detailPanel.setAttribute("aria-hidden", "false");
  detailPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// -----------------------------
// Realtime DB: listen and CRUD
// -----------------------------
function listenRealtime() {
  const rootRef = ref(db, PATH);
  onValue(
    rootRef,
    (snapshot) => {
      const val = snapshot.val();
      if (!val) {
        // fallback to DUMMY
        render(DUMMY.slice());
        return;
      }
      // transform object map to array
      const arr = Object.keys(val).map((k) => Object.assign({ id: k }, val[k]));
      render(arr);
    },
    (err) => {
      console.error("onValue error", err);
      render(DUMMY.slice());
    }
  );
}

// Save entry to Realtime DB
async function saveEntry(entry) {
  if (!db) {
    DUMMY.push(entry);
    render(DUMMY.slice());
    return;
  }
  // push a new child
  const newRef = push(ref(db, PATH));
  await set(newRef, entry);
}

// Optional delete (not used by UI yet)
async function deleteEntry(id) {
  if (!db || !id) return;
  await remove(ref(db, `${PATH}/${id}`));
}

// -----------------------------
// Controls wiring
// -----------------------------
addBtn.addEventListener("click", async () => {
  const name = (nameInput.value || "").trim();
  const total = Number(totalInput.value) || 0;
  const paid = Number(paidInput.value) || 0;
  const booked = bookedInput.checked === true;

  if (!name) return alert("Please enter an item name");
  if (!total || total <= 0) return alert("Please enter a valid total amount");

  const obj = {
    name,
    total,
    paid: booked ? paid : paid, // we still store paid even if not booked (but UI will show dash)
    booked,
    createdAt: Date.now(),
  };

  try {
    await saveEntry(obj);
    clearInputs();
  } catch (e) {
    console.error("save failed", e);
    alert("Save failed. Check console.");
  }
});

clearBtn.addEventListener("click", clearInputs);

refreshBtn.addEventListener("click", () => {
  // rebind listener: simply call listenRealtime again (onValue replaces previous handler)
  try {
    listenRealtime();
  } catch (e) {
    console.warn("refresh failed", e);
  }
});

function clearInputs() {
  nameInput.value = "";
  totalInput.value = "";
  paidInput.value = "";
  bookedInput.checked = false;
}

// -----------------------------
// Responsive: toggle layout class on #bars
// -----------------------------
const mq = window.matchMedia("(min-width:720px)");
function applyLayout(e) {
  const bars = document.getElementById("bars");
  if (!bars) return;
  if (e.matches) {
    // desktop: horizontal
    bars.classList.remove("vertical");
    bars.classList.add("horizontal");
  } else {
    // mobile: vertical
    bars.classList.remove("horizontal");
    bars.classList.add("vertical");
  }
}
applyLayout(mq);
mq.addEventListener("change", applyLayout);

// -----------------------------
// Optional: Basic auth helpers (not required)
// -----------------------------
async function signInWithGoogle() {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error("Google sign-in failed", e);
  }
}
async function signOut() {
  try {
    await firebaseSignOut(auth);
  } catch (e) {
    console.error("Sign-out failed", e);
  }
}
onAuthStateChanged(auth, (user) => {
  // optional: use user to control write permissions/UI
  if (user) {
    console.log("Signed in:", user.displayName || user.email);
  } else {
    console.log("Not signed in");
  }
});

// -----------------------------
// Service worker registration (PWA)
// -----------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/weddingbar/sw.js") // <-- absolute path
      .then((reg) => console.log("SW registered", reg.scope))
      .catch((err) => console.warn("SW register failed", err));
  });
}

// -----------------------------
// Init
// -----------------------------
try {
  listenRealtime();
} catch (e) {
  console.error("Init failed, falling back to dummy", e);
  render(DUMMY.slice());
}
