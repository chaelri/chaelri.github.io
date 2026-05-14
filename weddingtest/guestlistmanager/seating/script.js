import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  set,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { tagDef } from "../tags.js";

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
// Two keys on purpose:
// - STORAGE_KEY: the pre-Firebase snapshot from each browser. NEVER overwritten
//   by the current code. Used as a last-resort recovery source.
// - CACHE_KEY: the live cache that mirrors Firebase. Written on every save.
const STORAGE_KEY = "ck_seating_groups_v2";
const CACHE_KEY = "ck_seating_cache";
const DEFAULT_CAPACITY = 10;
let pickedChipEl = null;

// Firebase sync wiring
const seatingRef = ref(db, "seatingGroups");
let seatingLoaded = false;
let latestSeatingFromFirebase = null;
let suppressEchoes = 0; // increments before our own writes to ignore the round-trip
let pendingWriteTimer = null;

let guestsLoaded = false;
let rsvpsLoaded = false;
let latestGuests = {};
let latestRsvps = [];
let hasHydrated = false;

// ---------- Firebase load (read-only) ----------
onValue(ref(db, "guestList"), (snap) => {
  latestGuests = snap.val() || {};
  guestsLoaded = true;
  tryHydrate();
});
onValue(ref(db, "rsvps"), (snap) => {
  latestRsvps = Object.values(snap.val() || {});
  rsvpsLoaded = true;
  tryHydrate();
});
onValue(seatingRef, (snap) => {
  if (suppressEchoes > 0) {
    suppressEchoes--;
    return;
  }
  latestSeatingFromFirebase = snap.val();
  seatingLoaded = true;
  // If we've already hydrated and a remote update comes in, refresh local state.
  if (hasHydrated && latestSeatingFromFirebase && Array.isArray(latestSeatingFromFirebase.groups)) {
    groups = normalizeGroups(latestSeatingFromFirebase.groups);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
    reResolveMissing();
    render();
    setSyncStatus("Synced");
  }
  tryHydrate();
});

function tryHydrate() {
  if (!guestsLoaded || !rsvpsLoaded || !seatingLoaded) return;
  allGuests = Object.entries(latestGuests).map(([id, g]) => {
    const r = latestRsvps.find(
      (x) => x.guestName?.toLowerCase() === g.name.toLowerCase()
    );
    return {
      id,
      name: g.name,
      side: g.side || "both",
      status: r ? r.attending : "pending",
      role: g.role || "guest",
      noCount: g.noCount === true,
      tags: Array.isArray(g.tags) ? g.tags : [],
      pairWith: g.pairWith || "",
    };
  });

  if (!hasHydrated) {
    loadGroups();
    hasHydrated = true;
  } else {
    reResolveMissing();
  }
  render();
}

function loadGroups() {
  // Priority: Firebase > CACHE_KEY (live cache) > STORAGE_KEY (pre-migration
  // backup) > empty. The pre-Firebase STORAGE_KEY is NEVER overwritten by
  // this code path, so it remains a safety net.
  if (
    latestSeatingFromFirebase &&
    Array.isArray(latestSeatingFromFirebase.groups) &&
    latestSeatingFromFirebase.groups.length > 0
  ) {
    groups = normalizeGroups(latestSeatingFromFirebase.groups);
    localStorage.setItem(CACHE_KEY, JSON.stringify(groups)); // cache only
    reResolveMissing();
    setSyncStatus("Synced");
    return;
  }

  // Firebase empty → try local backups in order: cache, then pre-migration.
  for (const key of [CACHE_KEY, STORAGE_KEY]) {
    const saved = localStorage.getItem(key);
    if (!saved) continue;
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        groups = normalizeGroups(parsed);
        reResolveMissing();
        console.log(
          `[seating] Restored ${groups.length} tables from local '${key}' → pushing to Firebase`
        );
        pushToFirebase();
        return;
      }
    } catch (e) {
      console.warn(`Saved '${key}' corrupt, skipping`, e);
    }
  }

  // Truly fresh state — start empty. User adds tables manually.
  groups = [];
}

function normalizeGroups(input) {
  return input.map((g) => ({
    id: g.id || `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: g.name || "Untitled",
    capacity: typeof g.capacity === "number" ? g.capacity : DEFAULT_CAPACITY,
    memberIds: Array.isArray(g.memberIds) ? g.memberIds : [],
    memberMissing: Array.isArray(g.memberMissing) ? g.memberMissing : [],
  }));
}

function normalizeName(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics (ñ→n, é→e)
    .toLowerCase()
    .replace(/[.,'"`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findGuestByName(name) {
  const target = normalizeName(name);
  if (!target) return null;
  return allGuests.find((g) => normalizeName(g.name) === target);
}

function reResolveMissing() {
  // For each group, re-attempt to match memberMissing strings against the
  // current Firebase guestList. Promote successful matches into memberIds and
  // drop them from memberMissing. Runs on every hydrate so newly-added Firebase
  // guests automatically heal the ⚠ chips on refresh.
  let changed = 0;
  for (const grp of groups) {
    const stillMissing = [];
    for (const name of grp.memberMissing || []) {
      const match = findGuestByName(name);
      if (match) {
        if (!grp.memberIds.includes(match.id)) grp.memberIds.push(match.id);
        changed++;
      } else {
        stillMissing.push(name);
      }
    }
    grp.memberMissing = stillMissing;
  }
  if (changed) persist();
  return changed;
}

function persist() {
  // Write to live CACHE only — pre-migration STORAGE_KEY stays frozen as backup.
  localStorage.setItem(CACHE_KEY, JSON.stringify(groups));
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
      console.error("[seating] Firebase write failed:", err);
      setSyncStatus("⚠ Sync failed — check rules");
      toast("⚠ Firebase save failed — check console");
    });
}

function setSyncStatus(text) {
  const el = document.getElementById("syncStatus");
  if (el) el.textContent = text;
}

// ---------- Render ----------
function render() {
  renderPool();
  renderGroups();
}

function isAssigned(id) {
  return groups.some((g) => g.memberIds.includes(id));
}

function renderPool() {
  const pool = document.getElementById("pool");
  const search = document.getElementById("searchInput").value.toLowerCase().trim();
  const side = document.getElementById("filterSide").value;
  const status = document.getElementById("filterStatus").value;
  pool.innerHTML = "";

  const unassignedAll = allGuests.filter((g) => !isAssigned(g.id));
  const unassigned = unassignedAll
    .filter((g) => side === "all" || g.side === side)
    .filter((g) => status === "all" || g.status === status)
    .filter((g) => !search || g.name.toLowerCase().includes(search))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const g of unassigned) pool.appendChild(buildChip(g));
  document.getElementById("poolCount").textContent = unassigned.length;
  document.getElementById("totalCount").textContent = unassignedAll.length;
}

function findGroupOfGuest(guestId) {
  return groups.find((grp) => grp.memberIds.includes(guestId)) || null;
}

function buildPairPill(g) {
  if (!g.pairWith) return "";
  const partner = allGuests.find((x) => x.id === g.pairWith);
  if (!partner) return "";
  const myGroup = findGroupOfGuest(g.id);
  const partnerGroup = findGroupOfGuest(partner.id);
  const firstName = partner.name.split(" ")[0];
  let state = "neutral";
  let title = `Paired with ${partner.name} — not seated yet`;
  if (myGroup && partnerGroup) {
    if (myGroup.id === partnerGroup.id) {
      state = "together";
      title = `✓ At the same table as ${partner.name}`;
    } else {
      state = "split";
      title = `⚠ Paired with ${partner.name} (in ${partnerGroup.name})`;
    }
  } else if (partnerGroup) {
    state = "split";
    title = `⚠ Paired with ${partner.name} (in ${partnerGroup.name})`;
  }
  return `<span class="pair-pill ${state}" title="${escapeHtml(
    title
  )}"><span class="material-icons" style="font-size:10px">favorite</span>${escapeHtml(
    firstName
  )}</span>`;
}

function buildChip(g) {
  const chip = document.createElement("div");
  chip.className = "guest-chip" + (g.noCount ? " lap" : "");
  chip.draggable = true;
  chip.dataset.guestId = g.id;
  chip.title = g.noCount ? "Lap child — not counted in food/pax" : "";
  const tagPills = (g.tags || [])
    .map((id) => tagDef(id))
    .filter(Boolean)
    .map(
      (t) =>
        `<span class="tag-pill" style="background:${t.bg};color:${t.fg}" title="${t.label}"><span class="d" style="background:${t.dot}"></span>${t.label}</span>`
    )
    .join("");
  chip.innerHTML = `
    <span class="dot ${g.side}"></span>
    <span class="name">${escapeHtml(g.name)}</span>
    ${tagPills}
    ${buildPairPill(g)}
    ${
      g.noCount
        ? `<span class="status lap">lap</span>`
        : `<span class="status ${g.status}">${g.status}</span>`
    }
  `;
  chip.addEventListener("dragstart", (e) => {
    chip.classList.add("dragging");
    e.dataTransfer.setData("text/plain", g.id);
    e.dataTransfer.effectAllowed = "move";
  });
  chip.addEventListener("dragend", () => chip.classList.remove("dragging"));
  chip.addEventListener("click", (e) => {
    e.stopPropagation();
    pickChip(chip);
  });
  return chip;
}

function buildMissingChip(name, groupId) {
  const chip = document.createElement("div");
  chip.className = "guest-chip missing";
  chip.title = "This name doesn't match any guest in Firebase guestList";
  chip.innerHTML = `
    <span class="material-icons-outlined" style="font-size:12px;color:#b91c1c;">warning_amber</span>
    <span class="name">${escapeHtml(name)}</span>
    <span class="material-icons-outlined" data-remove-missing data-group-id="${groupId}" data-name="${escapeHtml(
    name
  )}" style="font-size:12px;cursor:pointer;opacity:0.6;">close</span>
  `;
  return chip;
}

function renderGroups() {
  const wrap = document.getElementById("groups");
  wrap.innerHTML = "";
  for (const grp of groups) {
    const card = document.createElement("div");
    card.className = "group-card";
    card.dataset.groupId = grp.id;
    const total = grp.memberIds.length + (grp.memberMissing?.length || 0);
    const cap = grp.capacity || DEFAULT_CAPACITY;
    const over = total > cap;
    const full = total === cap;
    const countClass = over ? "over" : full ? "full" : "";
    card.innerHTML = `
      <div class="group-header">
        <input class="group-name" value="${escapeHtml(
          grp.name
        )}" data-group-id="${grp.id}" />
        <div class="group-meta">
          <span class="group-count ${countClass}" data-edit-capacity data-group-id="${
      grp.id
    }" title="Click to change capacity">${total} / ${cap} pax</span>
          <span class="material-icons-outlined group-delete" data-group-id="${
            grp.id
          }" title="Delete group">delete_outline</span>
        </div>
      </div>
      <div class="group-zone ${
        full && !over ? "is-full" : ""
      } ${over ? "is-over" : ""}" data-droppable="group" data-group-id="${
      grp.id
    }"></div>
    `;
    const zone = card.querySelector(".group-zone");
    for (const id of grp.memberIds) {
      const g = allGuests.find((x) => x.id === id);
      if (g) zone.appendChild(buildChip(g));
    }
    for (const name of grp.memberMissing || []) {
      zone.appendChild(buildMissingChip(name, grp.id));
    }
    wrap.appendChild(card);
  }
  wireGroupEvents();
}

function wireGroupEvents() {
  document.querySelectorAll(".group-name").forEach((input) => {
    input.addEventListener("change", (e) => {
      const id = e.target.dataset.groupId;
      const grp = groups.find((g) => g.id === id);
      if (grp) {
        grp.name = e.target.value.trim() || "Untitled";
        persist();
      }
    });
  });
  document.querySelectorAll(".group-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = e.target.dataset.groupId;
      const grp = groups.find((g) => g.id === id);
      if (!grp) return;
      const total = grp.memberIds.length + (grp.memberMissing?.length || 0);
      if (total > 0) {
        if (
          !confirm(
            `Delete "${grp.name}"? Its ${total} member(s) will return to the pool.`
          )
        )
          return;
      }
      groups = groups.filter((g) => g.id !== id);
      persist();
      render();
    });
  });
  document.querySelectorAll("[data-edit-capacity]").forEach((badge) => {
    badge.addEventListener("click", (e) => {
      const id = e.target.dataset.groupId;
      const grp = groups.find((g) => g.id === id);
      if (!grp) return;
      const next = prompt(
        `Capacity for "${grp.name}" (number of seats):`,
        String(grp.capacity || DEFAULT_CAPACITY)
      );
      if (next === null) return;
      const n = parseInt(next, 10);
      if (!Number.isFinite(n) || n <= 0) {
        toast("Capacity must be a positive number");
        return;
      }
      grp.capacity = n;
      persist();
      render();
    });
  });
  document.querySelectorAll("[data-remove-missing]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const groupId = e.target.dataset.groupId;
      const name = e.target.dataset.name;
      const grp = groups.find((g) => g.id === groupId);
      if (!grp) return;
      grp.memberMissing = (grp.memberMissing || []).filter((n) => n !== name);
      persist();
      render();
    });
  });

  document.querySelectorAll("[data-droppable]").forEach((zone) => {
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("drag-over");
      e.dataTransfer.dropEffect = "move";
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("drag-over");
      const guestId = e.dataTransfer.getData("text/plain");
      if (!guestId) return;
      const target =
        zone.dataset.droppable === "pool" ? null : zone.dataset.groupId;
      moveGuest(guestId, target);
    });
    zone.addEventListener("click", (e) => {
      if (!pickedChipEl) return;
      // Don't move if clicked element is a chip (chip click handles itself)
      if (e.target.closest(".guest-chip")) return;
      const guestId = pickedChipEl.dataset.guestId;
      const target =
        zone.dataset.droppable === "pool" ? null : zone.dataset.groupId;
      moveGuest(guestId, target);
      clearPick();
    });
  });
}

function moveGuest(guestId, targetGroupId) {
  for (const g of groups) {
    g.memberIds = g.memberIds.filter((id) => id !== guestId);
  }
  if (targetGroupId) {
    const target = groups.find((g) => g.id === targetGroupId);
    if (target && !target.memberIds.includes(guestId)) {
      target.memberIds.push(guestId);
    }
  }
  persist();
  render();
}

function pickChip(chip) {
  if (pickedChipEl === chip) {
    clearPick();
    return;
  }
  clearPick();
  pickedChipEl = chip;
  chip.classList.add("picked");
  document
    .querySelectorAll("[data-droppable]")
    .forEach((z) => z.classList.add("pick-target"));
  document.getElementById("clearPickBtn").classList.remove("hidden");
}

function clearPick() {
  if (pickedChipEl) pickedChipEl.classList.remove("picked");
  pickedChipEl = null;
  document
    .querySelectorAll("[data-droppable]")
    .forEach((z) => z.classList.remove("pick-target"));
  document.getElementById("clearPickBtn").classList.add("hidden");
}

// ---------- Controls ----------
document.getElementById("searchInput").addEventListener("input", renderPool);
document.getElementById("filterSide").addEventListener("change", renderPool);
document.getElementById("filterStatus").addEventListener("change", renderPool);
document.getElementById("clearPickBtn").addEventListener("click", clearPick);

document.getElementById("backupBtn").addEventListener("click", () => {
  const summarize = (raw, label) => {
    if (!raw) return `• ${label}: (none)`;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.length)
        return `• ${label}: (empty)`;
      const totalMembers = parsed.reduce(
        (n, g) =>
          n +
          (Array.isArray(g.memberIds) ? g.memberIds.length : 0) +
          (Array.isArray(g.memberMissing) ? g.memberMissing.length : 0),
        0
      );
      return `• ${label}: ${parsed.length} tables, ${totalMembers} members`;
    } catch {
      return `• ${label}: (corrupt)`;
    }
  };

  const v2Raw = localStorage.getItem(STORAGE_KEY);
  const cacheRaw = localStorage.getItem(CACHE_KEY);
  const liveCount = groups.length;
  const liveMembers = groups.reduce(
    (n, g) =>
      n +
      g.memberIds.length +
      (Array.isArray(g.memberMissing) ? g.memberMissing.length : 0),
    0
  );

  const message = [
    "LOCAL BACKUPS ON THIS DEVICE:",
    summarize(v2Raw, "Pre-Firebase (v2)"),
    summarize(cacheRaw, "Live cache"),
    "",
    `CURRENT FIREBASE: ${liveCount} tables, ${liveMembers} members`,
    "",
    "Which backup do you want to restore?",
    "  - OK  → push the pre-Firebase v2 backup to Firebase",
    "  - Cancel → do nothing",
    "",
    "This will OVERWRITE the current Firebase data.",
  ].join("\n");

  if (!v2Raw) {
    alert(
      "No pre-Firebase backup found on this device.\n\n" +
        `Current Firebase: ${liveCount} tables, ${liveMembers} members.\n` +
        "Live cache: " +
        summarize(cacheRaw, "").replace("• : ", "") +
        "\n\nIf you expected to see a backup, check that you're on the same browser where you originally edited."
    );
    return;
  }

  if (!confirm(message)) return;

  try {
    const parsed = JSON.parse(v2Raw);
    if (!Array.isArray(parsed) || !parsed.length) {
      alert("Backup is empty — nothing to restore.");
      return;
    }
    groups = normalizeGroups(parsed);
    reResolveMissing();
    pushToFirebase();
    render();
    toast("Backup restored → Firebase");
  } catch (e) {
    alert("Backup is corrupt and can't be parsed.");
    console.error(e);
  }
});

document.getElementById("addGroupBtn").addEventListener("click", () => {
  const id = "g_" + Date.now();
  const num = groups.length + 1;
  groups.push({
    id,
    name: `Table ${num}`,
    capacity: DEFAULT_CAPACITY,
    memberIds: [],
    memberMissing: [],
  });
  persist();
  render();
});

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2000);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c])
  );
}
