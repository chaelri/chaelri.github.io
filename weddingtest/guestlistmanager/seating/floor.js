import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  set,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

// ---------- State ----------
let allGuests = [];
let groups = [];
let expandedGroupId = null;
const DEFAULT_CAPACITY = 10;
const seatingRef = ref(db, "seatingGroups");
let suppressEchoes = 0;
let pendingWriteTimer = null;

let guestsLoaded = false;
let seatingLoaded = false;

// ---------- Firebase load ----------
onValue(ref(db, "guestList"), (snap) => {
  const obj = snap.val() || {};
  allGuests = Object.entries(obj).map(([id, g]) => ({
    id,
    name: g.name,
    side: g.side || "both",
    noCount: g.noCount === true,
    tags: Array.isArray(g.tags) ? g.tags : [],
  }));
  guestsLoaded = true;
  tryRender();
});

onValue(seatingRef, (snap) => {
  if (suppressEchoes > 0) {
    suppressEchoes--;
    return;
  }
  const val = snap.val();
  if (val && Array.isArray(val.groups)) {
    groups = val.groups.map(normalizeGroup);
  } else {
    groups = [];
  }
  seatingLoaded = true;
  setSyncStatus("Synced");
  tryRender();
});

function normalizeGroup(g) {
  const norm = {
    id: g.id || `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: g.name || "Untitled",
    capacity: typeof g.capacity === "number" ? g.capacity : DEFAULT_CAPACITY,
    memberIds: Array.isArray(g.memberIds) ? g.memberIds : [],
    memberMissing: Array.isArray(g.memberMissing) ? g.memberMissing : [],
  };
  if (g.pos && typeof g.pos.x === "number" && typeof g.pos.y === "number") {
    norm.pos = { x: g.pos.x, y: g.pos.y };
  }
  return norm;
}

function tryRender() {
  if (!guestsLoaded || !seatingLoaded) return;
  renderTables();
}

// ---------- Persistence ----------
function persist() {
  setSyncStatus("Saving…");
  if (pendingWriteTimer) clearTimeout(pendingWriteTimer);
  pendingWriteTimer = setTimeout(pushToFirebase, 250);
}

function pushToFirebase() {
  pendingWriteTimer = null;
  suppressEchoes++;
  set(seatingRef, {
    groups,
    savedAt: new Date().toISOString(),
  })
    .then(() => setSyncStatus("Synced"))
    .catch((err) => {
      console.error("[floor] Firebase write failed:", err);
      setSyncStatus("⚠ Sync failed");
      toast("⚠ Save failed — check console");
    });
}

function setSyncStatus(text) {
  const el = document.getElementById("syncStatus");
  if (el) el.textContent = text;
}

// ---------- Shape detection ----------
function shapeFor(group) {
  const name = (group.name || "").toLowerCase();
  if (name.includes("couple")) return "couple";
  if (name.includes("kids") || name.includes("kid's")) return "square";
  if (name.includes("vip") || group.capacity >= 11) return "rect-wide";
  return "round";
}

// ---------- Default layout ----------
function defaultPositionFor(group, index) {
  // Lay out below the stage. VIP first, then by group order.
  // Stage block: top ~90px tall, centered horizontally.
  // Canvas inner is 1800 x 1400.
  const canvasW = 1800;
  const shape = shapeFor(group);

  // Hardcoded slots for special tables so first load looks reasonable.
  const name = (group.name || "").toLowerCase();
  if (name.includes("vip 1") || name.includes("vip table 1")) {
    return { x: canvasW / 2 + 80, y: 140 };
  }
  if (name.includes("vip 2") || name.includes("vip table 2")) {
    return { x: canvasW / 2 - 320, y: 140 };
  }
  if (name.includes("couple")) {
    return { x: canvasW / 2 - 75, y: 250 };
  }
  if (name.includes("kids")) {
    return { x: canvasW / 2 - 350, y: 280 };
  }

  // Regular tables: grid below the VIP row.
  const cols = 5;
  const startY = 380;
  const dx = 200;
  const dy = 200;
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    x: canvasW / 2 - (cols * dx) / 2 + col * dx + 40,
    y: startY + row * dy,
  };
}

// ---------- Render ----------
function renderTables() {
  let canvasInner = document.querySelector(".floor-canvas-inner");
  const canvas = document.getElementById("canvas");
  if (!canvasInner) {
    canvasInner = document.createElement("div");
    canvasInner.className = "floor-canvas-inner";
    canvas.appendChild(canvasInner);
    // Move the stage div into the inner container so it scrolls with content
    const stage = document.getElementById("stage");
    if (stage && stage.parentElement === canvas) {
      canvasInner.appendChild(stage);
    }
  }

  // Remove old table elements
  canvasInner.querySelectorAll(".floor-table").forEach((el) => el.remove());

  // Regular order, but place VIP/Kids/Couple first so their default slots win
  const ordered = [...groups];

  let regularIndex = 0;
  for (const g of ordered) {
    const shape = shapeFor(g);
    const isSpecial = shape !== "round";
    const idx = isSpecial ? 0 : regularIndex++;
    const pos = g.pos || defaultPositionFor(g, idx);

    const card = document.createElement("div");
    card.className = `floor-table shape-${shape}`;
    card.dataset.groupId = g.id;
    card.style.left = pos.x + "px";
    card.style.top = pos.y + "px";
    if (expandedGroupId === g.id) card.classList.add("expanded");

    const total =
      g.memberIds.length + (g.memberMissing ? g.memberMissing.length : 0);
    const cap = g.capacity || DEFAULT_CAPACITY;
    const metaClass = total > cap ? "over" : total === cap ? "full" : "";

    card.innerHTML = `
      <div class="floor-table-name">${escapeHtml(g.name)}</div>
      <div class="floor-table-meta ${metaClass}">${total} / ${cap}</div>
      ${buildMemberList(g)}
    `;
    enableDrag(card, g);
    canvasInner.appendChild(card);
  }
}

function buildMemberList(g) {
  const items = [];
  g.memberIds.forEach((id) => {
    const guest = allGuests.find((x) => x.id === id);
    if (guest) {
      const cls = guest.noCount ? "lap" : "";
      items.push(
        `<li class="${cls}">${escapeHtml(guest.name)}${
          guest.noCount ? " <em>(lap)</em>" : ""
        }</li>`
      );
    } else {
      items.push(`<li class="missing">(unknown id ${id})</li>`);
    }
  });
  (g.memberMissing || []).forEach((name) => {
    items.push(`<li class="missing">⚠ ${escapeHtml(name)}</li>`);
  });
  if (!items.length)
    items.push(`<li style="color:#a8a29e;font-style:italic">(empty)</li>`);
  return `<div class="floor-table-members"><ol>${items.join("")}</ol></div>`;
}

// ---------- Drag + click distinction ----------
function enableDrag(card, group) {
  let pointerDown = false;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let origLeft = 0;
  let origTop = 0;
  const DRAG_THRESHOLD = 5;

  card.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    pointerDown = true;
    dragging = false;
    startX = e.clientX;
    startY = e.clientY;
    origLeft = parseFloat(card.style.left) || 0;
    origTop = parseFloat(card.style.top) || 0;
    card.setPointerCapture(e.pointerId);
  });

  card.addEventListener("pointermove", (e) => {
    if (!pointerDown) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (
      !dragging &&
      (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)
    ) {
      dragging = true;
      card.classList.add("dragging");
    }
    if (dragging) {
      const nx = Math.max(0, origLeft + dx);
      const ny = Math.max(0, origTop + dy);
      card.style.left = nx + "px";
      card.style.top = ny + "px";
    }
  });

  card.addEventListener("pointerup", (e) => {
    if (!pointerDown) return;
    pointerDown = false;
    try {
      card.releasePointerCapture(e.pointerId);
    } catch {}
    if (dragging) {
      card.classList.remove("dragging");
      group.pos = {
        x: parseFloat(card.style.left) || 0,
        y: parseFloat(card.style.top) || 0,
      };
      persist();
    } else {
      // Click: toggle expand
      toggleExpand(group.id);
    }
    dragging = false;
  });

  card.addEventListener("pointercancel", () => {
    pointerDown = false;
    dragging = false;
    card.classList.remove("dragging");
  });
}

function toggleExpand(groupId) {
  expandedGroupId = expandedGroupId === groupId ? null : groupId;
  renderTables();
}

// ---------- Auto-arrange ----------
document.getElementById("resetLayoutBtn").addEventListener("click", () => {
  if (
    !confirm(
      "Auto-arrange all tables into the default layout? Any positions you've set will be lost."
    )
  )
    return;
  let regularIndex = 0;
  for (const g of groups) {
    const shape = shapeFor(g);
    const idx = shape === "round" ? regularIndex++ : 0;
    g.pos = defaultPositionFor(g, idx);
  }
  persist();
  renderTables();
  toast("Layout reset");
});

// ---------- Toast ----------
function toast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2000);
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c])
  );
}
