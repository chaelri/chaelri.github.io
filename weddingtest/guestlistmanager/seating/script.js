import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
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

// ---------- Pre-seeded table arrangement (per Charlie's wedding-setup layout, 2026-05-14) ----------
// Order in `members` reflects seat order at the table (seat 1, seat 2, …).
const TABLE_SEEDS = [
  {
    id: "vip1",
    name: "VIP Table 1 — Cayno",
    capacity: 13,
    members: [
      "Fernando Cayno",
      "Arlene Cayno",
      "Mary Grace Francisco",
      "Sherill Obillo",
      "Cristina Nofiel",
      "Zhardo Nofiel",
      "Alexis Perez",
      "Carmela Perez",
      "Aldine Mercado",
      "Sharmaine Mercado",
      "Jerdin Catanghal",
      "Melvin Catanghal",
    ],
  },
  {
    id: "vip2",
    name: "VIP Table 2 — Romantico",
    capacity: 12,
    members: [
      "Wilfredo Romantico",
      "Honey Dawn Romantico",
      "Aylene Andal",
      "Amante Andal",
      "Vanie Madrazo",
      "Judith Zamora",
      "Maui Rochell Ilao",
      "Christian Ilao",
      "Ivan John Gomez",
      "Sheniah Gomez",
      "Jael Rayala",
      "Kharl John Rayala",
    ],
  },
  {
    id: "table3",
    name: "Table 3",
    capacity: 10,
    members: [
      "Heleaena Luv Romantico",
      "Quiana Bernardo",
      "Camille Cayabyab",
      "Mitzi Marzan",
      "Angelica Macalalad",
      "Annika Meraña",
      "Alyssa Moira Mangubat",
      "Diane Faith Adviento",
      "Eutemio Josef Romantico",
    ],
  },
  {
    id: "table4",
    name: "Table 4",
    capacity: 10,
    members: [
      "Charles Cayno",
      "Cy Matthieu Cayno",
      "Joshua Obillo",
      "King David Gomez",
      "James Patacsil",
      "Peter Carl Pardo",
      "Matt Joshua Cabezas",
      "Albert Kobe Serrano",
      "Rainer John Alabado",
    ],
  },
  {
    id: "table5",
    name: "Table 5",
    capacity: 10,
    members: [
      "Mercedes Castillo",
      "Elvie Asuncion",
      "Christine Joy Dais",
      "Vangie Dais",
      "Lanie Basmayor",
      "Leopoldo Ventura",
      "Milagros Ventura",
      "Erly Cruz",
      "Merla Cruz",
      "Melody Calimlim",
    ],
  },
  {
    id: "table6",
    name: "Table 6",
    capacity: 10,
    members: [
      "Maria Karmina Lopez",
      "Coleen Anne Astilla",
      "Joanne Marie Orola",
      "Erickson Miguel Montoya",
      "Gabriel Gersaniba",
      "Carlos Romero",
      "Vivian Franz Escorido",
      "Yan Christine Lao",
      "Jose Eduardo De Vera",
      "Mikhail Luigi Agbing",
    ],
  },
  {
    id: "table7",
    name: "Table 7",
    capacity: 10,
    members: [
      "Julyen Figueroa",
      "Arnel Figueroa",
      "Aaron Aculado",
      "Marchie Salamanca",
      "Leo Aculado",
      "Mae Aculado",
      "John Jun Aculado",
      "Fairy Joy Albarado",
    ],
  },
  {
    id: "table8",
    name: "Table 8",
    capacity: 10,
    members: [
      "Marla Del Rosario",
      "Albergino Del Rosario",
      "Herbert Ungriano",
      "Severino Hernandez III",
      "Vienly Jane Noche",
      "Cassandra Lee Hufalar",
      "Katherine Guevarra",
    ],
  },
  {
    id: "kids",
    name: "Kids Table",
    capacity: 10,
    members: [
      "Lance Ailen Grey Francisco",
      "Pierce Raven Francisco",
      "Minea Obillo",
      "Chloe Obillo",
      "Cayla Ochoa",
    ],
  },
];

// ---------- State ----------
let allGuests = [];
let groups = [];
const STORAGE_KEY = "ck_seating_groups_v2";
const DEFAULT_CAPACITY = 10;
let pickedChipEl = null;

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

function tryHydrate() {
  if (!guestsLoaded || !rsvpsLoaded) return;
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
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      groups = JSON.parse(saved);
      // Backfill missing fields for older saves
      groups.forEach((g) => {
        if (!Array.isArray(g.memberIds)) g.memberIds = [];
        if (!Array.isArray(g.memberMissing)) g.memberMissing = [];
        if (typeof g.capacity !== "number") g.capacity = DEFAULT_CAPACITY;
      });
      // One-time migration: VIP 1 was originally seeded at 12 but needs 13
      // (pastor added). Don't shrink if the user has manually set it higher.
      const vip1 = groups.find((g) => g.id === "vip1");
      if (vip1 && vip1.capacity < 13) {
        vip1.capacity = 13;
        persist();
      }
      reResolveMissing();
      return;
    } catch (e) {
      console.warn("Saved groups corrupt, seeding fresh");
    }
  }
  groups = TABLE_SEEDS.map(seedToGroup);
}

function seedToGroup(seed) {
  const memberIds = [];
  const memberMissing = [];
  for (const name of seed.members) {
    const g = findGuestByName(name);
    if (g) memberIds.push(g.id);
    else memberMissing.push(name);
  }
  return {
    id: seed.id,
    name: seed.name,
    capacity: seed.capacity || DEFAULT_CAPACITY,
    memberIds,
    memberMissing,
  };
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
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

function buildChip(g) {
  const chip = document.createElement("div");
  chip.className = "guest-chip" + (g.noCount ? " lap" : "");
  chip.draggable = true;
  chip.dataset.guestId = g.id;
  chip.title = g.noCount ? "Lap child — not counted in food/pax" : "";
  chip.innerHTML = `
    <span class="dot ${g.side}"></span>
    <span class="name">${escapeHtml(g.name)}</span>
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
    // Count only counted (non-lap) members toward capacity.
    const lapCount = grp.memberIds.reduce((n, id) => {
      const g = allGuests.find((x) => x.id === id);
      return n + (g && g.noCount ? 1 : 0);
    }, 0);
    const countedTotal =
      grp.memberIds.length - lapCount + (grp.memberMissing?.length || 0);
    const cap = grp.capacity || DEFAULT_CAPACITY;
    const over = countedTotal > cap;
    const full = countedTotal === cap;
    const countClass = over ? "over" : full ? "full" : "";
    const lapSuffix = lapCount > 0 ? ` +${lapCount} lap` : "";
    card.innerHTML = `
      <div class="group-header">
        <input class="group-name" value="${escapeHtml(
          grp.name
        )}" data-group-id="${grp.id}" />
        <div class="group-meta">
          <span class="group-count ${countClass}" data-edit-capacity data-group-id="${
      grp.id
    }" title="Click to change capacity. Lap children don't count toward pax.">${countedTotal} / ${cap} pax${lapSuffix}</span>
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

document.getElementById("resetBtn").addEventListener("click", () => {
  if (
    !confirm(
      "Reset all tables back to the original seeded layout (VIP 1, VIP 2, Tables 3–8, Kids)? Local changes will be lost."
    )
  )
    return;
  groups = TABLE_SEEDS.map(seedToGroup);
  persist();
  render();
  toast("Reset to VIP seed");
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
