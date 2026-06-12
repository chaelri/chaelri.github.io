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

// Zoom + search state
let zoom = 1.0;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;
const ZOOM_STEP_WHEEL = 0.04;
const CANVAS_W = 2000;
const CANVAS_H = 1600;
const POOL_WIDTH = 300;
let searchQuery = "";

// Tap-to-move pick state
let pickedGuestId = null;

function pickGuest(guestId) {
  if (!guestId) return;
  pickedGuestId = guestId;
  applyPickHighlights();
  updatePickBanner();
  document.body.classList.add("has-picked");
}

function clearPick() {
  if (!pickedGuestId) return;
  pickedGuestId = null;
  applyPickHighlights();
  updatePickBanner();
  document.body.classList.remove("has-picked");
}

function applyPickHighlights() {
  document
    .querySelectorAll(".floor-pool-chip.picked, .floor-chair.picked")
    .forEach((el) => el.classList.remove("picked"));
  if (!pickedGuestId) return;
  document
    .querySelectorAll(
      `.floor-pool-chip[data-guest-id="${pickedGuestId}"], .floor-chair[data-guest-id="${pickedGuestId}"]`
    )
    .forEach((el) => el.classList.add("picked"));
}

function updatePickBanner() {
  const banner = document.getElementById("pickBanner");
  if (!banner) return;
  if (!pickedGuestId) {
    banner.classList.add("hidden");
    return;
  }
  const g = allGuests.find((x) => x.id === pickedGuestId);
  banner.classList.remove("hidden");
  const nameEl = banner.querySelector(".pick-name");
  if (nameEl) nameEl.textContent = g ? g.name : "Guest";
}

// Drop the currently-picked guest onto the given target.
// `target` is { groupId?: string, seat?: number, unassign?: true }.
function dropPickedOn(target) {
  if (!pickedGuestId) return false;
  if (target.unassign) {
    unassignGuest(pickedGuestId);
  } else if (target.groupId && target.seat != null) {
    moveGuestToPosition(pickedGuestId, target.groupId, target.seat - 1);
  } else if (target.groupId) {
    moveGuestToPosition(pickedGuestId, target.groupId, Infinity);
  } else {
    return false;
  }
  clearPick();
  return true;
}

// Visible table footprint per shape (kept in sync with floor.css)
const TABLE_DIMS = {
  round: { w: 130, h: 130 },
  "rect-tall": { w: 130, h: 360 },
  square: { w: 120, h: 120 },
  couple: { w: 280, h: 60 },
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
    gender: g.gender || "",
    role: g.role || "guest",
    photoUrl: g.photoUrl || "",
    finalChecked: g.finalChecked === true,
  }));
  guestsLoaded = true;
  mergeRsvpStatus();
  tryRender();
});

// Source of truth for who is allowed to be seated. Matches the dashboard's
// "Final Yes" filter: RSVP'd yes AND finalChecked.
function isFinalYes(g) {
  return !!g && g.status === "yes" && g.finalChecked === true;
}

function cycleGender(guestId) {
  const g = allGuests.find((x) => x.id === guestId);
  if (!g) return;
  const order = ["", "Male", "Female"];
  const cur = Math.max(0, order.indexOf(g.gender));
  const next = order[(cur + 1) % order.length];
  g.gender = next;
  set(ref(db, `guestList/${guestId}/gender`), next).catch((err) => {
    console.error("[floor] gender save failed", err);
    toast("⚠ Couldn't save gender");
  });
  tryRender();
}
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

function normalizeRsvpName(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,'"`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mergeRsvpStatus() {
  if (!guestsLoaded || !rsvpsLoaded) return;
  for (const g of allGuests) {
    // Match the dashboard: latest RSVP by submittedAt wins, so manual
    // "Declined" overrides beat the older website "Yes". Otherwise stale-yes
    // guests slip through isFinalYes and don't render red.
    const key = normalizeRsvpName(g.name);
    const matches = latestRsvps
      .filter((r) => r.guestName && normalizeRsvpName(r.guestName) === key)
      .sort(
        (a, b) =>
          new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0)
      );
    g.status = matches[0] ? matches[0].attending : "pending";
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
  applyPickHighlights();
  updatePickBanner();
  updateSeatedCount();
}

function updateSeatedCount() {
  const el = document.getElementById("seatedCount");
  if (!el) return;
  let seated = 0;
  for (const g of groups) {
    seated += g.memberIds.filter(Boolean).length;
  }
  el.textContent = `Seated ${seated}`;
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
  // Couple seat: any table whose 2 members are Charlie + Karla (bride & groom).
  if (group.memberIds && group.memberIds.length === 2 && allGuests.length) {
    const names = group.memberIds
      .map((id) => allGuests.find((x) => x.id === id))
      .filter(Boolean)
      .map((g) => firstName(g.name).toLowerCase());
    if (names.includes("charlie") && names.includes("karla")) {
      return "couple";
    }
  }
  return "round";
}

// ---------- Chair positions (relative to top-left of the table card) ----------
function chairPositionsFor(group, shape) {
  if (shape === "couple") {
    const { w } = TABLE_DIMS.couple;
    return [
      { x: w * 0.28, y: -14 },
      { x: w * 0.72, y: -14 },
    ];
  }
  const count = group.capacity || group.memberIds.length || 0;
  if (!count) return [];
  const dims = TABLE_DIMS[shape];
  const { w, h } = dims;
  // Wider clearance on VIP head tables so name pills don't crowd the table.
  const offset = shape === "rect-tall" ? 56 : 18;
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
    // Long sides only — no seats at the short ends (no one stuck in front of the table).
    // Seat 1 starts at the top of the right side; right side top→bottom, then left side bottom→top.
    const rightCount = Math.ceil(count / 2);
    const leftCount = count - rightCount;
    for (let i = 0; i < rightCount; i++) {
      const y = ((i + 1) / (rightCount + 1)) * h;
      positions.push({ x: w + offset, y });
    }
    for (let i = 0; i < leftCount; i++) {
      const y = ((leftCount - i) / (leftCount + 1)) * h;
      positions.push({ x: -offset, y });
    }
    return positions;
  }

  return positions;
}

// "VIP Table 1 — Cayno" → { title: "CAYNO", subtitle: "VIP 1" }
// Anything else → { title: rawName, subtitle: "" }
function formatTableTitle(rawName) {
  const m = String(rawName || "").match(
    /^vip\s*(?:table)?\s*(\d+)\s*[—–-]\s*(.+)$/i
  );
  if (m) {
    return { title: m[2].trim().toUpperCase(), subtitle: `VIP ${m[1]}` };
  }
  return { title: rawName, subtitle: "" };
}

// ---------- Default table positions ----------
// Top-down layout: Stage → Couple → VIPs → Kids → Tables 1-11.
function defaultPositionFor(group, index) {
  const canvasW = 2000;
  const cx = canvasW / 2;
  const name = (group.name || "").toLowerCase();
  if (name.includes("couple")) {
    // 280 wide → x = cx - 140.
    return { x: cx - 140, y: 180 };
  }
  if (name.includes("vip 2") || name.includes("vip table 2")) {
    return { x: cx - 420, y: 280 };
  }
  if (name.includes("vip 1") || name.includes("vip table 1")) {
    return { x: cx + 290, y: 280 };
  }
  if (name.includes("kids")) {
    // 120 wide → x = cx - 60.
    return { x: cx - 60, y: 700 };
  }
  // Regular tables 1-11: 4-4-3 grid centered under everything.
  const m = name.match(/table\s*(\d+)/);
  const num = m ? parseInt(m[1], 10) : index + 1;
  const seq = Math.max(0, num - 1); // 0..10 for tables 1..11
  const dx = 220;
  let row, col, rowCount;
  if (seq < 4) {
    row = 0;
    col = seq;
    rowCount = 4;
  } else if (seq < 8) {
    row = 1;
    col = seq - 4;
    rowCount = 4;
  } else {
    row = 2;
    col = seq - 8;
    rowCount = 3;
  }
  const startCenter = cx - ((rowCount - 1) * dx) / 2;
  return {
    x: startCenter + col * dx - 65,
    y: 860 + row * 200,
  };
}

// ---------- Render: tables + chairs ----------
function buildViewModeList(g, cap, title, subtitle) {
  const wrap = document.createElement("div");
  wrap.className = "floor-view-list";
  let html = `<div class="floor-view-list-title">${escapeHtml(title)}</div>`;
  if (subtitle)
    html += `<div class="floor-view-list-subtitle">${escapeHtml(subtitle)}</div>`;
  html += '<ol class="floor-view-list-items">';
  for (let i = 0; i < cap; i++) {
    const id = g.memberIds[i];
    const guest = id ? allGuests.find((x) => x.id === id) : null;
    if (guest) html += `<li>${escapeHtml(guest.name)}</li>`;
    else html += `<li class="empty"></li>`;
  }
  html += "</ol>";
  wrap.innerHTML = html;
  return wrap;
}

// Maps a guest's `role` value to a coarse color group used by the
// "Roles" toggle. Keeping this small means the legend stays readable.
function roleGroupFor(role) {
  switch (role) {
    case "Bride":
    case "Groom":
      return "couple";
    case "Parent of Bride":
    case "Parent of Groom":
      return "parent";
    case "Officiant":
      return "officiant";
    case "Maid of Honor":
    case "Best Man":
      return "major";
    case "Bridesmaid":
    case "Groomsman":
      return "party";
    case "Principal Sponsor":
      return "principal";
    case "Secondary Sponsor":
    case "Secondary Sponsor (Veil)":
    case "Secondary Sponsor (Coin)":
    case "Secondary Sponsor (Strands)":
    case "Secondary Sponsor (Candle)":
      return "secondary";
    case "Bible Bearer":
    case "Ring Bearer":
      return "bearer";
    case "Flower Boy":
    case "Flower Girl":
      return "flower";
    default:
      return "guest";
  }
}

function renderSortKey(g) {
  const name = (g.name || "").toLowerCase();
  if (name.includes("couple")) return [0, 0];
  if (name.includes("vip")) {
    const m = name.match(/vip\s*(?:table)?\s*(\d+)/);
    return [1, m ? parseInt(m[1], 10) : 99];
  }
  if (name.includes("kids") || name.includes("kid's")) return [2, 0];
  const m = name.match(/table\s*(\d+)/);
  if (m) return [3, parseInt(m[1], 10)];
  return [4, 0];
}

function renderTables() {
  const inner = document.querySelector(".floor-canvas-inner");
  inner
    .querySelectorAll(".floor-table, .floor-view-list, .floor-table-block, .floor-row-break")
    .forEach((el) => el.remove());
  const inViewMode = document.body.classList.contains("view-mode");

  // View mode reads top→bottom like a printout: Couple → VIPs → Kids → Tables 1-11.
  const renderList = inViewMode
    ? [...groups].sort((a, b) => {
        const [ap, an] = renderSortKey(a);
        const [bp, bn] = renderSortKey(b);
        if (ap !== bp) return ap - bp;
        return an - bn;
      })
    : groups;

  let regularIndex = 0;
  let prevCat = null;
  for (const g of renderList) {
    if (inViewMode) {
      const cat = renderSortKey(g)[0];
      // Stage shares row 1 with the couple seat (cat 0). After that, each
      // new category (VIP → Kids → Tables) starts on its own row.
      if (prevCat !== null && cat !== prevCat) {
        const brk = document.createElement("div");
        brk.className = "floor-row-break";
        inner.appendChild(brk);
      }
      prevCat = cat;
    }
    const shape = shapeFor(g);
    const isSpecial = shape !== "round";
    const layoutIndex = isSpecial ? 0 : regularIndex++;
    const pos = g.pos || defaultPositionFor(g, layoutIndex);

    const card = document.createElement("div");
    card.className = `floor-table shape-${shape}`;
    card.dataset.groupId = g.id;
    if (!inViewMode) {
      card.style.left = pos.x + "px";
      card.style.top = pos.y + "px";
    }
    if (expandedGroupId === g.id) card.classList.add("expanded");

    const total =
      g.memberIds.filter(Boolean).length +
      (g.memberMissing ? g.memberMissing.length : 0);
    const isCouple = shape === "couple";
    const cap = isCouple ? 2 : g.capacity || DEFAULT_CAPACITY;
    const metaClass = total > cap ? "over" : total === cap ? "full" : "";

    const { title, subtitle } = isCouple
      ? { title: "Couple Seat", subtitle: "" }
      : formatTableTitle(g.name);
    const subtitleHtml = subtitle
      ? `<div class="floor-table-sublabel">${escapeHtml(subtitle)}</div>`
      : "";
    let couplePhotoHtml = "";
    if (isCouple) {
      const avatars = g.memberIds
        .map((id) => allGuests.find((x) => x.id === id))
        .filter((p) => p && p.photoUrl)
        .map(
          (p) =>
            `<img class="floor-couple-avatar" src="${escapeHtml(
              p.photoUrl
            )}" alt="${escapeHtml(p.name)}" />`
        )
        .join("");
      if (avatars) {
        couplePhotoHtml = `<div class="floor-couple-photos">${avatars}</div>`;
      }
    }
    card.innerHTML = `
      ${couplePhotoHtml}
      <div class="floor-table-name${subtitle ? " is-stacked" : ""}">${escapeHtml(title)}</div>
      ${subtitleHtml}
      <div class="floor-table-meta ${metaClass}">${total} / ${cap}</div>
    `;
    card.appendChild(buildMemberGrid(g, { viewMode: inViewMode }));
    card.appendChild(buildEditButton(g));
    card.appendChild(buildCopyButton(g, cap));
    card.appendChild(buildCloseButton(g));
    enableTableDrag(card, g);

    // Append chairs as children so they move with the table.
    {
      const chairPos = chairPositionsFor(g, shape);
      chairPos.forEach((p, i) => {
        const guestId = g.memberIds[i];
        const guest = guestId ? allGuests.find((x) => x.id === guestId) : null;
        const chair = document.createElement("div");
        const occupied = !!guest;
        const side = guest ? guest.side || "both" : null;
        const matches =
          occupied &&
          searchQuery &&
          guest.name.toLowerCase().includes(searchQuery);
        const genderClass = !occupied
          ? ""
          : guest.gender === "Male"
          ? "gender-male"
          : guest.gender === "Female"
          ? "gender-female"
          : "gender-unknown";
        const roleGroup = occupied ? roleGroupFor(guest.role) : "";
        const notFinal = occupied && !isFinalYes(guest);
        chair.className = [
          "floor-chair",
          occupied ? "occupied" : "empty",
          side ? `side-${side}` : "",
          genderClass,
          roleGroup ? `role-${roleGroup}` : "",
          guest && guest.noCount ? "lap" : "",
          matches ? "search-match" : "",
          notFinal ? "not-final" : "",
        ]
          .filter(Boolean)
          .join(" ");
        chair.dataset.seat = i + 1;
        chair.dataset.groupId = g.id;
        if (guestId) chair.dataset.guestId = guestId;
        chair.style.left = p.x + "px";
        chair.style.top = p.y + "px";
        if (inViewMode) {
          chair.textContent = i + 1;
        } else if (guest) {
          chair.innerHTML =
            `<span class="chair-seat">${i + 1}</span>` +
            `<span class="chair-name">${escapeHtml(firstName(guest.name))}</span>`;
        } else {
          chair.textContent = i + 1;
        }
        chair.title = guest
          ? `Seat ${i + 1} — ${guest.name}`
          : `Seat ${i + 1} (empty)`;
        if (!inViewMode) {
          if (occupied) enableChairDrag(chair, g.id, i);
          else enableChairAsDropZone(chair);
        }
        card.appendChild(chair);
      });
    }

    if (inViewMode) {
      const block = document.createElement("div");
      block.className = "floor-table-block";
      block.appendChild(card);
      block.appendChild(buildViewModeList(g, cap, title, subtitle));
      inner.appendChild(block);
    } else {
      inner.appendChild(card);
    }
  }
}

async function copyTableNames(group) {
  const isCouple = shapeFor(group) === "couple";
  const cap = isCouple ? 2 : group.capacity || DEFAULT_CAPACITY;
  const lines = [];
  for (let i = 0; i < cap; i++) {
    const id = group.memberIds[i];
    const guest = id ? allGuests.find((x) => x.id === id) : null;
    lines.push(guest ? guest.name : "");
  }
  const text = lines.join("\n");
  const label = isCouple ? "Couple Seat" : group.name || "Table";
  try {
    await navigator.clipboard.writeText(text);
    toast(`Copied ${label} ✓`);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    toast(`Copied ${label} ✓`);
  }
}

// Google Sheets accepts pasted HTML and preserves inline styles (borders,
// backgrounds, alignment, font weight). We write both rich HTML (preferred)
// and a TSV fallback to the clipboard so the paste picks up formatting.
// The ALPHABETICAL NAME column is a single ARRAYFORMULA in the first data
// row that fills the rest of the column from the NAME column automatically —
// no per-row formula needed, and the user can keep typing names into the
// sheet and watch the alpha column update live.
const SEATING_EXPORT_FORMULA =
  '=ARRAYFORMULA(IF(B2:B="","",IFERROR(REGEXEXTRACT(B2:B,"\\S+$")&", "&REGEXEXTRACT(B2:B,"^.+(?=\\s+\\S+$)"),B2:B)))';

function escapeHtmlForCell(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function buildSeatingExport(g, cap) {
  const tableName = (g.name || "Table").toString().trim();
  const rows = [];
  for (let i = 0; i < cap; i++) {
    const id = g.memberIds[i];
    const guest = id ? allGuests.find((x) => x.id === id) : null;
    rows.push({ seat: i + 1, name: guest ? guest.name : "" });
  }

  // Plain TSV fallback (no formulas — Sheets parses tab-separated text)
  const tsvLines = [
    tableName,
    "",
    ["SEAT", "NAME", "ALPHABETICAL NAME"].join("\t"),
  ];
  rows.forEach((r, idx) => {
    const alpha = idx === 0 ? SEATING_EXPORT_FORMULA : "";
    tsvLines.push([r.seat, r.name, alpha].join("\t"));
  });
  const tsv = tsvLines.join("\n");

  // Rich HTML (styled table)
  const SAGE = "#7b8a5b";
  const SAGE_DEEP = "#5e6b44";
  const BORDER = "#c8c2b7";
  const SEAT_BG = "#f4f1ea";
  const EMPTY_BG = "#faf9f6";
  const INK = "#2a2723";
  const STONE = "#a8a29e";

  const titleTd = `<td colspan="3" style="background:${SAGE_DEEP};color:#ffffff;padding:10px 14px;font-weight:700;font-size:13pt;letter-spacing:0.05em;text-align:center;border:1px solid ${SAGE_DEEP};font-family:Calibri,Arial,sans-serif">${escapeHtmlForCell(
    tableName.toUpperCase(),
  )}</td>`;

  const thStyle =
    `background:${SAGE};color:#ffffff;border:1px solid ${SAGE_DEEP};` +
    `padding:8px 12px;font-weight:700;font-size:10pt;letter-spacing:0.06em;` +
    `font-family:Calibri,Arial,sans-serif`;
  const headerRow = `
    <tr>
      <th style="${thStyle};text-align:center;width:60px">SEAT</th>
      <th style="${thStyle};text-align:left">NAME</th>
      <th style="${thStyle};text-align:left">ALPHABETICAL NAME</th>
    </tr>`;

  const dataRows = rows
    .map((r, idx) => {
      const isEmpty = !r.name;
      const nameBg = isEmpty ? EMPTY_BG : "#ffffff";
      const nameFg = isEmpty ? STONE : INK;
      const nameCell = isEmpty
        ? ""
        : escapeHtmlForCell(r.name);
      // Only the FIRST data row gets the array formula. Sheets fills the
      // remaining alpha cells automatically. Leaving the rest blank is what
      // ARRAYFORMULA needs (it errors if downstream cells already have data).
      // We do NOT html-escape the formula — Sheets needs the raw `=` and `"`
      // characters to parse it.
      const alphaContent = idx === 0 ? SEATING_EXPORT_FORMULA : "";
      const alphaBg = isEmpty && idx !== 0 ? EMPTY_BG : "#ffffff";
      return `
        <tr>
          <td style="border:1px solid ${BORDER};padding:7px 12px;text-align:center;font-weight:700;background:${SEAT_BG};color:${INK};font-size:11pt;font-family:Calibri,Arial,sans-serif;width:60px">${r.seat}</td>
          <td style="border:1px solid ${BORDER};padding:7px 14px;text-align:left;background:${nameBg};color:${nameFg};font-size:11pt;font-family:Calibri,Arial,sans-serif">${nameCell}</td>
          <td style="border:1px solid ${BORDER};padding:7px 14px;text-align:left;background:${alphaBg};color:${INK};font-size:11pt;font-family:Calibri,Arial,sans-serif">${alphaContent}</td>
        </tr>`;
    })
    .join("");

  const html =
    `<meta charset="utf-8">` +
    `<table style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif">` +
    `<tr>${titleTd}</tr>` +
    headerRow +
    dataRows +
    `</table>`;

  return { html, tsv };
}

async function writeRichClipboard(html, tsv) {
  // Preferred path: write both MIME types so Google Sheets picks the HTML.
  if (navigator.clipboard && typeof window.ClipboardItem === "function") {
    try {
      await navigator.clipboard.write([
        new window.ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([tsv], { type: "text/plain" }),
        }),
      ]);
      return true;
    } catch (e) {
      console.warn("clipboard.write failed, falling back", e);
    }
  }
  // Fallback 1: copy via contenteditable host so HTML is preserved on paste.
  try {
    const host = document.createElement("div");
    host.contentEditable = "true";
    host.innerHTML = html;
    host.style.position = "fixed";
    host.style.left = "-9999px";
    host.style.top = "0";
    document.body.appendChild(host);
    const range = document.createRange();
    range.selectNodeContents(host);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand("copy");
    sel.removeAllRanges();
    document.body.removeChild(host);
    if (ok) return true;
  } catch (e) {
    console.warn("execCommand HTML copy failed, falling back to plain", e);
  }
  // Fallback 2: plain TSV.
  const ta = document.createElement("textarea");
  ta.value = tsv;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
  return true;
}

function buildCopyButton(g, cap) {
  const btn = document.createElement("button");
  btn.className = "floor-table-copy";
  btn.title = "Copy seat list (paste into Sheets — keeps borders + colors)";
  btn.innerHTML = '<span class="material-icons-outlined">content_copy</span>';
  btn.addEventListener("pointerdown", (e) => e.stopPropagation());
  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const { html, tsv } = buildSeatingExport(g, cap);
    await writeRichClipboard(html, tsv);
    toast("Copied with formatting ✓");
  });
  return btn;
}

function buildEditButton(g) {
  const btn = document.createElement("button");
  btn.className = "floor-table-edit";
  btn.title = "Edit table name & capacity";
  btn.innerHTML = '<span class="material-icons-outlined">edit</span>';
  btn.addEventListener("pointerdown", (e) => e.stopPropagation());
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    let changed = false;

    const currentName = g.name || "";
    const nextName = window.prompt("Rename table:", currentName);
    if (nextName != null) {
      const trimmed = nextName.trim();
      if (trimmed && trimmed !== currentName) {
        g.name = trimmed;
        changed = true;
      }
    }

    const currentCap = typeof g.capacity === "number" ? g.capacity : DEFAULT_CAPACITY;
    const nextCap = window.prompt("Number of seats:", String(currentCap));
    if (nextCap != null) {
      const n = parseInt(nextCap, 10);
      if (Number.isFinite(n) && n > 0 && n !== currentCap) {
        g.capacity = n;
        changed = true;
      }
    }

    if (!changed) return;
    persist();
    tryRender();
    toast("Saved ✓");
  });
  return btn;
}

function buildCloseButton(g) {
  const btn = document.createElement("button");
  btn.className = "floor-table-close";
  btn.title = "Close";
  btn.innerHTML = '<span class="material-icons-outlined">close</span>';
  btn.addEventListener("pointerdown", (e) => e.stopPropagation());
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (expandedGroupId === g.id) {
      expandedGroupId = null;
      renderTables();
    }
  });
  return btn;
}

function buildMemberGrid(g, opts = {}) {
  const wrap = document.createElement("div");
  wrap.className = "floor-table-members";
  const grid = document.createElement("div");
  grid.className = "floor-pool-section-chips two-col";

  const cap = g.capacity || DEFAULT_CAPACITY;
  const totalSlots = Math.max(g.memberIds.length, cap);
  for (let i = 0; i < totalSlots; i++) {
    const id = g.memberIds[i];
    if (id) {
      const guest = allGuests.find((x) => x.id === id);
      if (guest) {
        grid.appendChild(
          buildSidebarChip(guest, {
            seat: i + 1,
            groupId: g.id,
            compact: true,
            showStatus: !!opts.viewMode,
          })
        );
      } else {
        const miss = document.createElement("div");
        miss.className = "floor-pool-chip compact missing";
        miss.textContent = `(unknown id ${id})`;
        grid.appendChild(miss);
      }
    } else {
      // Empty placeholder seat — clickable/droppable.
      const slot = document.createElement("div");
      slot.className = "floor-pool-chip compact empty-slot";
      slot.dataset.groupId = g.id;
      slot.dataset.seat = i + 1;
      slot.innerHTML =
        `<span class="seat-num">${i + 1}</span>` +
        `<span class="name empty-label">empty</span>`;
      grid.appendChild(slot);
    }
  }
  (g.memberMissing || []).forEach((name) => {
    const miss = document.createElement("div");
    miss.className = "floor-pool-chip compact missing";
    miss.textContent = "⚠ " + name;
    grid.appendChild(miss);
  });
  if (!grid.children.length) {
    const empty = document.createElement("div");
    empty.className = "floor-table-members-empty";
    empty.textContent = "(empty)";
    grid.appendChild(empty);
  }

  wrap.appendChild(grid);
  return wrap;
}

// ---------- Render: pool sidebar (unassigned + per-table sections) ----------
// Pool only ever shows Final-Yes guests. Anyone else who's still in a group
// renders red in the canvas and per-table list, draggable out only.

function buildSidebarChip(guest, opts = {}) {
  const chip = document.createElement("div");
  chip.className = "floor-pool-chip";
  if (opts.compact) chip.classList.add("compact");
  if (
    searchQuery &&
    guest.name.toLowerCase().includes(searchQuery)
  ) {
    chip.classList.add("search-match");
  }
  // Per-table chips that show a non-Final-Yes guest get the red treatment
  // so the user can spot them in the sidebar too, not just on the canvas.
  if (opts.groupId && !isFinalYes(guest)) {
    chip.classList.add("not-final");
    chip.title = "Not in Final Yes — drag out to remove";
  }
  chip.dataset.guestId = guest.id;
  if (opts.groupId) chip.dataset.groupId = opts.groupId;
  if (opts.seat != null) chip.dataset.seat = opts.seat;
  const seatBadge =
    opts.seat != null
      ? `<span class="seat-num">${opts.seat}</span>`
      : "";
  const genderKey =
    guest.gender === "Male"
      ? "male"
      : guest.gender === "Female"
      ? "female"
      : "unknown";
  const genderGlyph =
    guest.gender === "Male" ? "M" : guest.gender === "Female" ? "F" : "?";
  const genderHtml = `<span class="gender-icon ${genderKey}" data-action="cycle-gender" title="${
    guest.gender || "Set gender"
  }">${genderGlyph}</span>`;
  const statusHtml =
    opts.showStatus && guest.status
      ? `<span class="status-pill status-${guest.status}">${guest.status}</span>`
      : "";
  chip.innerHTML =
    seatBadge +
    genderHtml +
    `<span class="dot ${guest.side || "both"}"></span>` +
    `<span class="name">${escapeHtml(guest.name)}${
      guest.noCount ? ' <em class="lap-tag">(lap)</em>' : ""
    }</span>` +
    statusHtml;
  chip.addEventListener("click", (e) => {
    if (e.target.closest('[data-action="cycle-gender"]')) {
      e.stopPropagation();
      cycleGender(guest.id);
      return;
    }
    if (chip._suppressNextClick) {
      chip._suppressNextClick = false;
      return;
    }
    e.stopPropagation();
    // If something is already picked, drop it onto this chip's slot.
    if (pickedGuestId && pickedGuestId !== guest.id) {
      if (chip.dataset.groupId && chip.dataset.seat) {
        dropPickedOn({
          groupId: chip.dataset.groupId,
          seat: parseInt(chip.dataset.seat, 10),
        });
      } else {
        dropPickedOn({ unassign: true });
      }
      return;
    }
    // Otherwise: toggle pick on this guest.
    if (pickedGuestId === guest.id) clearPick();
    else pickGuest(guest.id);
  });
  enablePoolChipDrag(chip, guest);
  return chip;
}

function renderPool() {
  const poolChips = document.getElementById("poolChips");
  if (!poolChips) return;
  poolChips.innerHTML = "";

  const assigned = new Set();
  groups.forEach((g) => g.memberIds.forEach((id) => assigned.add(id)));

  // Unassigned = not in any group AND in Final-Yes (locked-in attendees).
  const unassigned = allGuests
    .filter((g) => !assigned.has(g.id) && isFinalYes(g))
    .sort((a, b) => a.name.localeCompare(b.name));

  document.getElementById("poolCount").textContent = unassigned.length;

  const matchesSearch = (g) =>
    !searchQuery || g.name.toLowerCase().includes(searchQuery);

  // ---- Unassigned section ----
  const unsec = document.createElement("section");
  unsec.className = "floor-pool-section";
  unsec.dataset.unassigned = "true";
  const unVisible = unassigned.filter(matchesSearch);
  unsec.innerHTML = `
    <div class="floor-pool-section-header" data-action="drop-unassign">
      <span class="floor-pool-section-title">Unassigned</span>
      <span class="floor-pool-section-meta">${unVisible.length}${
    searchQuery ? ` of ${unassigned.length}` : ""
  }</span>
    </div>
  `;
  unsec.querySelector(".floor-pool-section-header").addEventListener(
    "click",
    (e) => {
      if (!pickedGuestId) return;
      e.stopPropagation();
      dropPickedOn({ unassign: true });
    }
  );
  const unGrid = document.createElement("div");
  unGrid.className = "floor-pool-section-chips one-col";
  if (!unVisible.length) {
    const empty = document.createElement("div");
    empty.className = "floor-pool-empty";
    empty.textContent = searchQuery
      ? "No unassigned guests match."
      : unassigned.length === 0
      ? "Everyone confirmed is seated."
      : "Nothing here.";
    unGrid.appendChild(empty);
  } else {
    for (const g of unVisible) unGrid.appendChild(buildSidebarChip(g));
  }
  unsec.appendChild(unGrid);
  poolChips.appendChild(unsec);

  // ---- Per-table sections (2-col) ----
  for (const grp of groups) {
    const members = grp.memberIds
      .map((id, idx) => ({
        guest: allGuests.find((x) => x.id === id),
        seat: idx + 1,
      }))
      .filter((m) => m.guest);
    if (!members.length) continue;

    const visibleMembers = members.filter((m) => matchesSearch(m.guest));
    if (searchQuery && !visibleMembers.length) continue;

    const sec = document.createElement("section");
    sec.className = "floor-pool-section";
    sec.dataset.groupId = grp.id;
    const cap = grp.capacity || DEFAULT_CAPACITY;
    sec.innerHTML = `
      <div class="floor-pool-section-header" data-action="drop-append">
        <span class="floor-pool-section-title">${escapeHtml(grp.name)}</span>
        <span class="floor-pool-section-meta">${members.length} / ${cap}</span>
      </div>
    `;
    sec.querySelector(".floor-pool-section-header").addEventListener(
      "click",
      (e) => {
        if (!pickedGuestId) return;
        e.stopPropagation();
        dropPickedOn({ groupId: grp.id });
      }
    );
    const grid = document.createElement("div");
    grid.className = "floor-pool-section-chips two-col";
    const rows = searchQuery ? visibleMembers : members;
    for (const m of rows) {
      grid.appendChild(
        buildSidebarChip(m.guest, {
          seat: m.seat,
          groupId: grp.id,
          compact: true,
        })
      );
    }
    sec.appendChild(grid);
    poolChips.appendChild(sec);
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
    // Don't start a table drag from chairs, chips, or the close button.
    if (
      e.target.closest(".floor-chair, .floor-pool-chip, .floor-table-close")
    )
      return;
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
      card.style.left = Math.max(0, origLeft + dx / zoom) + "px";
      card.style.top = Math.max(0, origTop + dy / zoom) + "px";
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
    } else if (pickedGuestId) {
      dropPickedOn({ groupId: group.id });
    } else if (document.body.classList.contains("view-mode")) {
      copyTableNames(group);
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
      chair.style.transform = `translate(-50%, -50%) translate(${dx / zoom}px, ${dy / zoom}px)`;
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
      chair._suppressNextClick = true;
      const under = pickUnder(chair, e.clientX, e.clientY);
      handleAssignDrop(groupOf(groupId)?.memberIds[seatIndex], under, groupId);
    }
    dragging = false;
    lastDropTarget = null;
    chair.classList.remove("dragging");
    chair.style.transform = "";
  });
  chair.addEventListener("click", (e) => {
    if (chair._suppressNextClick) {
      chair._suppressNextClick = false;
      return;
    }
    e.stopPropagation();
    const seat = parseInt(chair.dataset.seat, 10);
    const guestId = chair.dataset.guestId;
    if (pickedGuestId && pickedGuestId !== guestId) {
      dropPickedOn({ groupId: chair.dataset.groupId, seat });
      return;
    }
    if (pickedGuestId === guestId) clearPick();
    else pickGuest(guestId);
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

// ---------- Empty chairs as drop zones (highlight target + tap-to-drop) ----------
function enableChairAsDropZone(chair) {
  // Drag-drop handled via elementFromPoint on the source; here we only need to
  // catch clicks so the user can tap an empty seat to drop a picked guest.
  chair.addEventListener("pointerdown", (e) => e.stopPropagation());
  chair.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!pickedGuestId) return;
    const seat = parseInt(chair.dataset.seat, 10);
    dropPickedOn({ groupId: chair.dataset.groupId, seat });
  });
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
    // Let the gender-icon click through without starting a drag.
    if (e.target.closest('[data-action="cycle-gender"]')) return;
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
      chip._suppressNextClick = true;
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
  const dropTarget = under?.closest(
    ".floor-chair, .floor-table, .floor-pool-chip[data-group-id], .floor-pool-section[data-group-id], .floor-pool"
  );
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
  // Drop on a chair (canvas)? → insert at that seat in that group.
  const targetChair = dropTargetEl?.closest(".floor-chair");
  if (targetChair) {
    const tgtGroupId = targetChair.dataset.groupId;
    const tgtSeat = parseInt(targetChair.dataset.seat, 10) - 1;
    moveGuestToPosition(guestId, tgtGroupId, tgtSeat);
    return;
  }
  // Drop on a table card (canvas)? → append to that table.
  const targetTable = dropTargetEl?.closest(".floor-table");
  if (targetTable) {
    moveGuestToPosition(guestId, targetTable.dataset.groupId, Infinity);
    return;
  }
  // Drop on a seated sidebar chip? → insert at that seat in that group.
  const seatedChip = dropTargetEl?.closest(".floor-pool-chip[data-group-id]");
  if (seatedChip) {
    const tgtGroupId = seatedChip.dataset.groupId;
    const tgtSeat = parseInt(seatedChip.dataset.seat, 10) - 1;
    moveGuestToPosition(guestId, tgtGroupId, tgtSeat);
    return;
  }
  // Drop on a per-table sidebar section? → append to that table.
  const section = dropTargetEl?.closest(".floor-pool-section[data-group-id]");
  if (section) {
    moveGuestToPosition(guestId, section.dataset.groupId, Infinity);
    return;
  }
  // Drop anywhere else in the pool sidebar? → unassign.
  const pool = dropTargetEl?.closest(".floor-pool");
  if (pool) {
    unassignGuest(guestId);
    return;
  }
  // No valid target — just re-render (snap back).
  tryRender();
}

function moveGuestToPosition(guestId, targetGroupId, targetIndex) {
  // Non-Final-Yes guests are locked: they can be dragged out (unassignGuest),
  // but any seat-to-seat move is rejected. Charlie can clear them but can't
  // accidentally reseat them.
  const guest = allGuests.find((x) => x.id === guestId);
  if (guest && !isFinalYes(guest)) {
    toast("Not in Final Yes — drag out to remove");
    tryRender();
    return;
  }
  // Remember where the guest is moving FROM so we can swap if the
  // target seat is occupied.
  let sourceGroup = null;
  let sourceIdx = -1;
  for (const g of groups) {
    const idx = g.memberIds.indexOf(guestId);
    if (idx >= 0) {
      sourceGroup = g;
      sourceIdx = idx;
      break;
    }
  }
  // Clear the source slot with a placeholder so the other members
  // keep their seats. Trailing empties get trimmed below.
  if (sourceGroup) sourceGroup.memberIds[sourceIdx] = "";

  const target = groups.find((g) => g.id === targetGroupId);
  if (!target) {
    persist();
    tryRender();
    return;
  }
  const cap = target.capacity || DEFAULT_CAPACITY;

  const placeAt = (idx, id) => {
    while (target.memberIds.length < idx) target.memberIds.push("");
    if (target.memberIds.length === idx) target.memberIds.push(id);
    else target.memberIds[idx] = id;
  };

  if (!Number.isFinite(targetIndex)) {
    // Fill first empty seat (a gap, then the end).
    let placed = false;
    for (let i = 0; i < cap; i++) {
      if (!target.memberIds[i]) {
        target.memberIds[i] = guestId;
        placed = true;
        break;
      }
    }
    if (!placed) target.memberIds.push(guestId);
  } else {
    const idx = Math.max(0, Math.min(targetIndex, cap - 1));
    const occupant = target.memberIds[idx];
    const occupantGuest = occupant
      ? allGuests.find((x) => x.id === occupant)
      : null;
    if (!occupant) {
      placeAt(idx, guestId);
    } else if (occupantGuest && !isFinalYes(occupantGuest)) {
      // Dropping a Final-Yes guest onto a red-occupied seat = replace.
      // Red guest gets removed outright (never hops to another seat).
      placeAt(idx, guestId);
      // sourceGroup's slot is already cleared above — nothing to swap in.
    } else if (sourceGroup) {
      // Swap with the existing occupant — guest goes to the target
      // seat, occupant goes to the now-empty source seat.
      placeAt(idx, guestId);
      sourceGroup.memberIds[sourceIdx] = occupant;
    } else {
      // No source (came from pool). Prefer the first empty slot to
      // avoid bumping the existing occupant off the table.
      let placed = false;
      for (let i = 0; i < cap; i++) {
        if (!target.memberIds[i]) {
          target.memberIds[i] = guestId;
          placed = true;
          break;
        }
      }
      if (!placed && target.memberIds.length < cap) {
        target.memberIds.push(guestId);
        placed = true;
      }
      if (!placed) {
        // Truly full — shift-right and let the red X / Y badge flag it.
        target.memberIds.splice(idx, 0, guestId);
      }
    }
  }

  // Trim trailing empties so length tracks the highest-occupied seat.
  const trim = (arr) => {
    while (arr.length && !arr[arr.length - 1]) arr.pop();
  };
  trim(target.memberIds);
  if (sourceGroup && sourceGroup !== target) trim(sourceGroup.memberIds);

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
const canvasEl = document.getElementById("canvas");
const sizerEl = document.getElementById("canvasSizer");
const innerEl = document.querySelector(".floor-canvas-inner");
const zoomLabel = document.getElementById("zoomLabel");

function applyZoom() {
  innerEl.style.transform = `scale(${zoom})`;
  sizerEl.style.width = CANVAS_W * zoom + "px";
  sizerEl.style.height = CANVAS_H * zoom + "px";
  zoomLabel.textContent = Math.round(zoom * 100) + "%";
}
applyZoom();

document.getElementById("zoomOutBtn").addEventListener("click", () => {
  const next = Math.max(ZOOM_MIN, +(zoom - ZOOM_STEP).toFixed(2));
  if (next === zoom) return;
  zoomAround(next, canvasEl.clientWidth / 2, canvasEl.clientHeight / 2);
});
document.getElementById("zoomInBtn").addEventListener("click", () => {
  const next = Math.min(ZOOM_MAX, +(zoom + ZOOM_STEP).toFixed(2));
  if (next === zoom) return;
  zoomAround(next, canvasEl.clientWidth / 2, canvasEl.clientHeight / 2);
});

// Keep the point at viewport (cx, cy) stationary while zoom changes
function zoomAround(newZoom, cx, cy) {
  const contentX = (canvasEl.scrollLeft + cx) / zoom;
  const contentY = (canvasEl.scrollTop + cy) / zoom;
  zoom = newZoom;
  applyZoom();
  canvasEl.scrollLeft = contentX * zoom - cx;
  canvasEl.scrollTop = contentY * zoom - cy;
}

// Ctrl/Cmd + wheel = zoom; plain wheel = scroll (default)
canvasEl.addEventListener(
  "wheel",
  (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP_WHEEL : ZOOM_STEP_WHEEL;
    const next = Math.min(
      ZOOM_MAX,
      Math.max(ZOOM_MIN, +(zoom + delta).toFixed(3))
    );
    if (next === zoom) return;
    const rect = canvasEl.getBoundingClientRect();
    zoomAround(next, e.clientX - rect.left, e.clientY - rect.top);
  },
  { passive: false }
);

// Pool collapse with scroll compensation so tables stay centered
function togglePool() {
  const isCollapsed = document.body.classList.contains("pool-collapsed");
  if (isCollapsed) {
    document.body.classList.remove("pool-collapsed");
    // Pool just stole 300px from the left — shift scroll so center stays put
    canvasEl.scrollLeft += POOL_WIDTH / 2;
  } else {
    document.body.classList.add("pool-collapsed");
    canvasEl.scrollLeft -= POOL_WIDTH / 2;
  }
}
document.getElementById("togglePoolBtn").addEventListener("click", togglePool);
document.getElementById("poolCollapseBtn").addEventListener("click", togglePool);

// Search filter
const searchInput = document.getElementById("searchInput");
searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  tryRender();
  if (searchQuery) requestAnimationFrame(focusSearchedChair);
});
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    searchInput.value = "";
    searchQuery = "";
    searchInput.blur();
    tryRender();
  } else if (e.key === "Enter") {
    e.preventDefault();
    focusSearchedChair();
  }
});

function focusSearchedChair() {
  if (!searchQuery) return;
  const match = allGuests.find(
    (g) =>
      g.name.toLowerCase().includes(searchQuery) &&
      groups.some((grp) => grp.memberIds.includes(g.id))
  );
  if (!match) return;
  const chairEl = document.querySelector(
    `.floor-chair[data-guest-id="${match.id}"]`
  );
  if (!chairEl) return;
  const chairRect = chairEl.getBoundingClientRect();
  const canvasRect = canvasEl.getBoundingClientRect();
  const targetLeft =
    canvasEl.scrollLeft +
    (chairRect.left + chairRect.width / 2) -
    (canvasRect.left + canvasRect.width / 2);
  const targetTop =
    canvasEl.scrollTop +
    (chairRect.top + chairRect.height / 2) -
    (canvasRect.top + canvasRect.height / 2);
  canvasEl.scrollTo({
    left: targetLeft,
    top: targetTop,
    behavior: "smooth",
  });
  // Briefly flash the chair so it's easy to spot
  chairEl.classList.add("search-flash");
  setTimeout(() => chairEl.classList.remove("search-flash"), 1400);
}

// Toolbar collapse
document.getElementById("toolbarToggleBtn").addEventListener("click", () => {
  document.querySelector(".floor-toolbar").classList.toggle("collapsed");
});

// Show/hide the side indicator circles (C / K / CK) on chair pills.
const SIDES_FLAG = "floor:sidesHidden";
if (localStorage.getItem(SIDES_FLAG) === "1") {
  document.body.classList.add("sides-hidden");
}
document.getElementById("toggleSidesBtn").addEventListener("click", () => {
  const hidden = document.body.classList.toggle("sides-hidden");
  localStorage.setItem(SIDES_FLAG, hidden ? "1" : "0");
});

// Color chairs by entourage role instead of gender.
const ROLES_FLAG = "floor:rolesMode";
if (localStorage.getItem(ROLES_FLAG) === "1") {
  document.body.classList.add("roles-mode");
}
document.getElementById("toggleRolesBtn").addEventListener("click", () => {
  const on = document.body.classList.toggle("roles-mode");
  localStorage.setItem(ROLES_FLAG, on ? "1" : "0");
});

// View-only mode: hide chair pills, click a table for a clean seat-list popover.
const VIEW_FLAG = "floor:viewMode";
if (localStorage.getItem(VIEW_FLAG) === "1") {
  document.body.classList.add("view-mode");
}
document.getElementById("toggleViewBtn").addEventListener("click", () => {
  const on = document.body.classList.toggle("view-mode");
  localStorage.setItem(VIEW_FLAG, on ? "1" : "0");
  tryRender();
});

// Tap-to-move: cancel button + Escape
document.getElementById("pickCancelBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  clearPick();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && pickedGuestId) clearPick();
});

// Center the canvas on the tables once layout is ready
requestAnimationFrame(() => {
  canvasEl.scrollLeft = Math.max(
    0,
    (sizerEl.offsetWidth - canvasEl.clientWidth) / 2
  );
});

// ---------- Toast ----------
function toast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2000);
}

function firstName(full) {
  const trimmed = String(full || "").trim();
  if (!trimmed) return "";
  const word = trimmed.split(/\s+/)[0];
  // Trim trailing punctuation like commas
  return word.replace(/[,.;]+$/, "");
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
