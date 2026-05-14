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
let rsvpsLoaded = false;
let latestRsvps = [];

// Visible table footprint per shape (kept in sync with floor.css)
const TABLE_DIMS = {
  round: { w: 130, h: 130 },
  "rect-tall": { w: 100, h: 240 },
  square: { w: 120, h: 120 },
  couple: { w: 150, h: 70 },
};

// ---------- Firebase ----------
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
  mergeRsvpStatus();
  tryRender();
});
onValue(ref(db, "rsvps"), (snap) => {
  latestRsvps = Object.values(snap.val() || {});
  rsvpsLoaded = true;
  mergeRsvpStatus();
  tryRender();
});
onValue(seatingRef, (snap) => {
  if (suppressEchoes > 0) {
    suppressEchoes--;
    return;
  }
  const val = snap.val();
  groups = val && Array.isArray(val.groups)
    ? val.groups.map(normalizeGroup)
    : [];
  seatingLoaded = true;
  setSyncStatus("Synced");
  tryRender();
});

function mergeRsvpStatus() {
  if (!guestsLoaded || !rsvpsLoaded) return;
  for (const g of allGuests) {
    const r = latestRsvps.find(
      (x) => x.guestName?.toLowerCase() === g.name.toLowerCase()
    );
    g.status = r ? r.attending : "pending";
  }
}

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
  if (!guestsLoaded || !seatingLoaded || !rsvpsLoaded) return;
  renderTables();
  renderPool();
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
      toast("⚠ Save failed");
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
  if (name.includes("vip") || group.capacity >= 11) return "rect-tall";
  return "round";
}

// ---------- Chair positions (relative to top-left of the table card) ----------
function chairPositionsFor(group, shape) {
  const count = group.capacity || group.memberIds.length || 0;
  if (!count || shape === "couple") return [];
  const dims = TABLE_DIMS[shape];
  const { w, h } = dims;
  const offset = 18;
  const positions = [];

  if (shape === "round" || shape === "square") {
    const r = w / 2 + offset;
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / count;
      positions.push({
        x: w / 2 + r * Math.cos(angle),
        y: h / 2 + r * Math.sin(angle),
      });
    }
    return positions;
  }

  if (shape === "rect-tall") {
    // Seat 1 at top center; then right side top→bottom; bottom; left side bottom→top
    positions.push({ x: w / 2, y: -offset });
    if (count === 1) return positions;

    const remaining = count - 1;
    const hasBottom = remaining >= 3;
    const sideTotal = hasBottom ? remaining - 1 : remaining;
    const rightCount = Math.ceil(sideTotal / 2);
    const leftCount = sideTotal - rightCount;

    for (let i = 0; i < rightCount; i++) {
      const y = ((i + 1) / (rightCount + 1)) * h;
      positions.push({ x: w + offset, y });
    }
    if (hasBottom) positions.push({ x: w / 2, y: h + offset });
    for (let i = 0; i < leftCount; i++) {
      const y = ((leftCount - i) / (leftCount + 1)) * h;
      positions.push({ x: -offset, y });
    }
    return positions;
  }

  return positions;
}

// ---------- Default table positions ----------
function defaultPositionFor(group, index) {
  const canvasW = 2000;
  const name = (group.name || "").toLowerCase();
  if (name.includes("vip 1") || name.includes("vip table 1")) {
    return { x: canvasW / 2 + 120, y: 180 };
  }
  if (name.includes("vip 2") || name.includes("vip table 2")) {
    return { x: canvasW / 2 - 220, y: 180 };
  }
  if (name.includes("couple")) {
    return { x: canvasW / 2 - 75, y: 480 };
  }
  if (name.includes("kids")) {
    return { x: canvasW / 2 - 400, y: 480 };
  }
  const cols = 5;
  const startY = 620;
  const dx = 240;
  const dy = 240;
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    x: canvasW / 2 - (cols * dx) / 2 + col * dx + 60,
    y: startY + row * dy,
  };
}

// ---------- Render: tables + chairs ----------
function renderTables() {
  const inner = document.querySelector(".floor-canvas-inner");
  inner.querySelectorAll(".floor-table").forEach((el) => el.remove());

  let regularIndex = 0;
  for (const g of groups) {
    const shape = shapeFor(g);
    const isSpecial = shape !== "round";
    const layoutIndex = isSpecial ? 0 : regularIndex++;
    const pos = g.pos || defaultPositionFor(g, layoutIndex);

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
    enableTableDrag(card, g);

    // Append chairs as children so they move with the table.
    if (shape !== "couple") {
      const chairPos = chairPositionsFor(g, shape);
      chairPos.forEach((p, i) => {
        const guestId = g.memberIds[i];
        const guest = guestId ? allGuests.find((x) => x.id === guestId) : null;
        const chair = document.createElement("div");
        const occupied = !!guest;
        chair.className = `floor-chair ${occupied ? "occupied" : "empty"}${
          guest && guest.noCount ? " lap" : ""
        }`;
        chair.dataset.seat = i + 1;
        chair.dataset.groupId = g.id;
        if (guestId) chair.dataset.guestId = guestId;
        chair.style.left = p.x + "px";
        chair.style.top = p.y + "px";
        chair.textContent = i + 1;
        chair.title = guest
          ? `Seat ${i + 1} — ${guest.name}`
          : `Seat ${i + 1} (empty)`;
        if (occupied) enableChairDrag(chair, g.id, i);
        else enableChairAsDropZone(chair);
        card.appendChild(chair);
      });
    }

    inner.appendChild(card);
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

// ---------- Render: pool of unassigned ----------
function renderPool() {
  const poolChips = document.getElementById("poolChips");
  if (!poolChips) return;
  poolChips.innerHTML = "";
  const assigned = new Set();
  groups.forEach((g) => g.memberIds.forEach((id) => assigned.add(id)));
  const unassigned = allGuests
    .filter((g) => !assigned.has(g.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  document.getElementById("poolCount").textContent = unassigned.length;

  for (const guest of unassigned) {
    const chip = document.createElement("div");
    chip.className = "floor-pool-chip";
    chip.dataset.guestId = guest.id;
    chip.innerHTML = `<span class="dot ${guest.side}"></span><span>${escapeHtml(
      guest.name
    )}</span>`;
    enablePoolChipDrag(chip, guest);
    poolChips.appendChild(chip);
  }
}

// ---------- Table drag (reposition the table card) ----------
function enableTableDrag(card, group) {
  let pointerDown = false;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let origLeft = 0;
  let origTop = 0;
  const THRESHOLD = 5;

  card.addEventListener("pointerdown", (e) => {
    // Don't start a table drag from a chair pointer event.
    if (e.target.closest(".floor-chair")) return;
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
      (Math.abs(dx) > THRESHOLD || Math.abs(dy) > THRESHOLD)
    ) {
      dragging = true;
      card.classList.add("dragging");
    }
    if (dragging) {
      card.style.left = Math.max(0, origLeft + dx) + "px";
      card.style.top = Math.max(0, origTop + dy) + "px";
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

// ---------- Chair drag (occupied chairs) ----------
function enableChairDrag(chair, groupId, seatIndex) {
  let pointerDown = false;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let lastDropTarget = null;
  const THRESHOLD = 5;

  chair.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    if (e.button !== undefined && e.button !== 0) return;
    pointerDown = true;
    dragging = false;
    startX = e.clientX;
    startY = e.clientY;
    chair.setPointerCapture(e.pointerId);
  });
  chair.addEventListener("pointermove", (e) => {
    if (!pointerDown) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (
      !dragging &&
      (Math.abs(dx) > THRESHOLD || Math.abs(dy) > THRESHOLD)
    ) {
      dragging = true;
      chair.classList.add("dragging");
    }
    if (dragging) {
      chair.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;
      updateDropTarget(chair, e.clientX, e.clientY, (t) => (lastDropTarget = t), () => lastDropTarget);
    }
  });
  chair.addEventListener("pointerup", (e) => {
    if (!pointerDown) return;
    pointerDown = false;
    try {
      chair.releasePointerCapture(e.pointerId);
    } catch {}
    if (lastDropTarget) lastDropTarget.classList.remove("drop-target");

    if (dragging) {
      const under = pickUnder(chair, e.clientX, e.clientY);
      handleAssignDrop(groupOf(groupId)?.memberIds[seatIndex], under, groupId);
    }
    dragging = false;
    lastDropTarget = null;
    chair.classList.remove("dragging");
    chair.style.transform = "";
  });
  chair.addEventListener("pointercancel", () => {
    pointerDown = false;
    dragging = false;
    chair.classList.remove("dragging");
    chair.style.transform = "";
    if (lastDropTarget) lastDropTarget.classList.remove("drop-target");
    lastDropTarget = null;
  });
}

// ---------- Empty chairs as drop zones (highlight target only) ----------
function enableChairAsDropZone(chair) {
  // Empty chairs don't drag, but they need to participate as drop targets.
  // No-op binding; drop logic happens via pointerup of the source via
  // elementFromPoint, which already finds the chair element.
}

// ---------- Pool chip drag ----------
function enablePoolChipDrag(chip, guest) {
  let pointerDown = false;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startRect = null;
  let originalParent = null;
  let originalNext = null;
  let lastDropTarget = null;
  const THRESHOLD = 5;

  chip.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    if (e.button !== undefined && e.button !== 0) return;
    pointerDown = true;
    dragging = false;
    startX = e.clientX;
    startY = e.clientY;
    chip.setPointerCapture(e.pointerId);
  });
  chip.addEventListener("pointermove", (e) => {
    if (!pointerDown) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (
      !dragging &&
      (Math.abs(dx) > THRESHOLD || Math.abs(dy) > THRESHOLD)
    ) {
      dragging = true;
      chip.classList.add("dragging");
      // Promote to fixed positioning so it can move outside the pool strip
      startRect = chip.getBoundingClientRect();
      originalParent = chip.parentElement;
      originalNext = chip.nextSibling;
      chip.style.position = "fixed";
      chip.style.left = startRect.left + "px";
      chip.style.top = startRect.top + "px";
      chip.style.margin = "0";
      document.body.appendChild(chip);
    }
    if (dragging) {
      chip.style.transform = `translate(${dx}px, ${dy}px)`;
      updateDropTarget(chip, e.clientX, e.clientY, (t) => (lastDropTarget = t), () => lastDropTarget);
    }
  });
  chip.addEventListener("pointerup", (e) => {
    if (!pointerDown) return;
    pointerDown = false;
    try {
      chip.releasePointerCapture(e.pointerId);
    } catch {}
    if (lastDropTarget) lastDropTarget.classList.remove("drop-target");

    if (dragging) {
      const under = pickUnder(chip, e.clientX, e.clientY);
      handleAssignDrop(guest.id, under, null);
    }
    // Re-render restores chip layout; no need to manually restore parent.
    dragging = false;
    lastDropTarget = null;
    chip.classList.remove("dragging");
    chip.style.transform = "";
    chip.style.position = "";
    chip.style.left = "";
    chip.style.top = "";
    chip.style.margin = "";
    renderPool();
  });
  chip.addEventListener("pointercancel", () => {
    pointerDown = false;
    dragging = false;
    chip.classList.remove("dragging");
    chip.style.transform = "";
    chip.style.position = "";
    chip.style.left = "";
    chip.style.top = "";
    if (lastDropTarget) lastDropTarget.classList.remove("drop-target");
    lastDropTarget = null;
    renderPool();
  });
}

// ---------- Shared drop helpers ----------
function pickUnder(self, x, y) {
  const prev = self.style.pointerEvents;
  self.style.pointerEvents = "none";
  const el = document.elementFromPoint(x, y);
  self.style.pointerEvents = prev;
  return el;
}

function updateDropTarget(self, x, y, setLast, getLast) {
  const under = pickUnder(self, x, y);
  const dropTarget = under?.closest(".floor-chair, .floor-table, .floor-pool");
  const prev = getLast();
  if (dropTarget !== prev) {
    if (prev) prev.classList.remove("drop-target");
    if (dropTarget && dropTarget !== self) dropTarget.classList.add("drop-target");
    setLast(dropTarget && dropTarget !== self ? dropTarget : null);
  }
}

function handleAssignDrop(guestId, dropTargetEl, sourceGroupId) {
  if (!guestId) {
    tryRender();
    return;
  }
  // Drop on a chair? → insert at that seat in that group.
  const targetChair = dropTargetEl?.closest(".floor-chair");
  if (targetChair) {
    const tgtGroupId = targetChair.dataset.groupId;
    const tgtSeat = parseInt(targetChair.dataset.seat, 10) - 1;
    moveGuestToPosition(guestId, tgtGroupId, tgtSeat);
    return;
  }
  // Drop on a table (not a chair)? → append to that table.
  const targetTable = dropTargetEl?.closest(".floor-table");
  if (targetTable) {
    const tgtGroupId = targetTable.dataset.groupId;
    moveGuestToPosition(guestId, tgtGroupId, Infinity);
    return;
  }
  // Drop on the pool? → unassign.
  const pool = dropTargetEl?.closest(".floor-pool");
  if (pool) {
    unassignGuest(guestId);
    return;
  }
  // No valid target — just re-render (snap back).
  tryRender();
}

function moveGuestToPosition(guestId, targetGroupId, targetIndex) {
  for (const g of groups) {
    g.memberIds = g.memberIds.filter((id) => id !== guestId);
  }
  const target = groups.find((g) => g.id === targetGroupId);
  if (!target) {
    persist();
    tryRender();
    return;
  }
  const idx = Math.max(0, Math.min(targetIndex, target.memberIds.length));
  target.memberIds.splice(idx, 0, guestId);
  persist();
  tryRender();
}

function unassignGuest(guestId) {
  for (const g of groups) {
    g.memberIds = g.memberIds.filter((id) => id !== guestId);
  }
  persist();
  tryRender();
}

function groupOf(id) {
  return groups.find((g) => g.id === id);
}

// ---------- Toolbar ----------
const pool = document.getElementById("pool");
document.getElementById("togglePoolBtn").addEventListener("click", () => {
  pool.classList.toggle("collapsed");
});
document.getElementById("poolHeader").addEventListener("click", (e) => {
  if (e.target.closest(".floor-pool-caret, .floor-pool-title, .floor-pool-count")) {
    pool.classList.toggle("collapsed");
  }
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
