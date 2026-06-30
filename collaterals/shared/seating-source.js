// Pulls the live seating layout from the wedding invitation Firebase project
// (charlie-karla-wedding, NOT test-database-55379) and composes a name-card
// batch string: "Guest Name | TABLE LABEL", one per line.
//
// Reads three RTDB paths:
//   seatingGroups → { groups: [{ id, name, capacity, memberIds, memberMissing }] }
//   guestList     → { id: { name, side, role, ... } }
//   rsvps         → { pushId: { guestName, attending } }
//
// Only RSVPs with attending === "yes" are included — matches the seating
// arranger's "Yes" filter default. Read-only by design; edits happen in
// weddingtest/guestlistmanager/seating/.

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";

const WEDDING_CONFIG = {
  apiKey: "AIzaSyBNPdSYJXuzvmdEHIeHGkbPmFnZxUq1lAg",
  authDomain: "charlie-karla-wedding.firebaseapp.com",
  databaseURL: "https://charlie-karla-wedding-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "charlie-karla-wedding",
  storageBucket: "charlie-karla-wedding.firebasestorage.app",
  messagingSenderId: "954582649260",
  appId: "1:954582649260:web:393fcc0fddafeb571f5209",
};

let _db = null;
function ensureDb() {
  if (_db) return _db;
  // Named app so it doesn't collide with the collaterals Firebase project
  // (test-database-55379) initialized in shared/firebase-sync.js.
  const app = initializeApp(WEDDING_CONFIG, "wedding-readonly");
  _db = getDatabase(app);
  return _db;
}

// "VIP Table 2 — Cayno" → "VIP TABLE 2"
// "Table 5 — Romantico" → "TABLE 5"
// "Table 3"             → "TABLE 3"
// The bit after " — " is the assigned family / wing, kept private from the card.
function parseTableLabel(name) {
  if (!name) return "";
  const i = name.indexOf(" — ");
  return (i >= 0 ? name.slice(0, i) : name).trim().toUpperCase();
}

function fullNameOf(fullName) {
  return String(fullName || "").trim().replace(/\s+/g, " ");
}

export async function fetchSeating() {
  const db = ensureDb();
  const [seatingSnap, guestSnap, rsvpSnap] = await Promise.all([
    get(ref(db, "seatingGroups")),
    get(ref(db, "guestList")),
    get(ref(db, "rsvps")),
  ]);
  const seating = seatingSnap.val();
  const guestList = guestSnap.val() || {};
  const rsvps = Object.values(rsvpSnap.val() || {});

  if (!seating || !Array.isArray(seating.groups)) {
    throw new Error("No seating groups found in Firebase");
  }

  const rsvpByName = new Map();
  for (const r of rsvps) {
    if (r?.guestName) rsvpByName.set(String(r.guestName).toLowerCase(), r.attending);
  }

  const rows = [];
  for (const group of seating.groups) {
    const tableLabel = parseTableLabel(group?.name);
    const tail = tableLabel ? ` | ${tableLabel}` : "";

    for (const id of (group?.memberIds || [])) {
      const g = guestList[id];
      const name = g?.name;
      if (!name) continue;
      if (rsvpByName.get(name.toLowerCase()) !== "yes") continue;
      rows.push(`${fullNameOf(name)}${tail}`);
    }
    // memberMissing holds raw name strings the matcher couldn't link to a
    // guestList row — still worth including if they RSVP'd yes by name.
    for (const rawName of (group?.memberMissing || [])) {
      if (!rawName) continue;
      if (rsvpByName.get(String(rawName).toLowerCase()) !== "yes") continue;
      rows.push(`${fullNameOf(rawName)}${tail}`);
    }
  }
  return rows;
}

export async function fetchSeatingBatchText() {
  const rows = await fetchSeating();
  return rows.join("\n");
}

// Diff helper: pull live seating, compare against whatever's already pasted
// in the batch textarea, return ONLY guests who are new OR whose table
// assignment changed. Used to print follow-up name cards without redoing the
// whole stack.
//
// Line shape: "Full Name | TABLE LABEL" (subtitle optional). Name compare is
// case-insensitive with collapsed whitespace; subtitle compare is uppercase
// trimmed (matches how `parseTableLabel` normalizes Firebase group names).
//
// Returns either a non-empty diff string, or `{ message }` when nothing has
// changed so the editor can surface that to the user without clobbering the
// current textarea.
function normNameKey(s) {
  return String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
}
function normSubtitleKey(s) {
  return String(s || "").trim().toUpperCase();
}
function parseBatchLine(line) {
  const i = line.indexOf("|");
  if (i < 0) return { name: line.trim(), subtitle: "" };
  return { name: line.slice(0, i).trim(), subtitle: line.slice(i + 1).trim() };
}

export async function fetchSeatingDiffBatchText(currentText) {
  const liveRows = await fetchSeating();

  const currentByName = new Map();
  for (const raw of String(currentText || "").split(/\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const { name, subtitle } = parseBatchLine(line);
    const key = normNameKey(name);
    if (key) currentByName.set(key, normSubtitleKey(subtitle));
  }

  const diff = [];
  for (const row of liveRows) {
    const { name, subtitle } = parseBatchLine(row);
    const key = normNameKey(name);
    if (!key) continue;
    const prev = currentByName.get(key);
    const isNew = prev === undefined;
    const isReassigned = !isNew && prev !== normSubtitleKey(subtitle);
    if (isNew || isReassigned) diff.push(row);
  }

  if (!diff.length) {
    return { message: "No new or reassigned guests since your last pull." };
  }
  return diff.join("\n");
}

// Group-per-card format used by the table-numbers template (positional —
// one line per seat, "-" for empty seats so the printed card can render the
// same dashed-circle diagram the seating arranger's floor view shows):
//
//   Romantico | VIP 1 | 10
//   Wilfredo Romantico
//   Honey Dawn Romantico
//   -
//   -
//   Mauro Mangubat
//   …
//
// Title / subtitle split: the positional label (VIP 1, Table 5) drives the
// Sacramento headline at the top of the card. The family / wing name is
// dropped — Charlie's preference is to identify cards by table position only.
// Anything that doesn't match the VIP/Table pattern (Couple, Kids, custom
// labels) falls back to the raw group name as the title so it still surfaces.
function titleCase(s) {
  return String(s || "").toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}
function formatCardHeader(rawName) {
  const s = String(rawName || "").trim();
  let m = s.match(/^vip\s*(?:table)?\s*(\d+)\s*[—–-]\s*.+$/i);
  if (m) return { title: `VIP ${m[1]}`, subtitle: "" };
  m = s.match(/^table\s*(\d+)\s*[—–-]\s*.+$/i);
  if (m) return { title: `Table ${m[1]}`, subtitle: "" };
  // No positional prefix → use the raw name (e.g., "Couple", "Kids").
  return { title: titleCase(s), subtitle: "" };
}

export async function fetchSeatingTablesText() {
  const db = ensureDb();
  const [seatingSnap, guestSnap, rsvpSnap] = await Promise.all([
    get(ref(db, "seatingGroups")),
    get(ref(db, "guestList")),
    get(ref(db, "rsvps")),
  ]);
  const seating = seatingSnap.val();
  const guestList = guestSnap.val() || {};
  const rsvps = Object.values(rsvpSnap.val() || {});
  if (!seating || !Array.isArray(seating.groups)) {
    throw new Error("No seating groups found in Firebase");
  }
  const rsvpByName = new Map();
  for (const r of rsvps) {
    if (r?.guestName) rsvpByName.set(String(r.guestName).toLowerCase(), r.attending);
  }
  const blocks = [];
  for (const group of seating.groups) {
    const { title, subtitle } = formatCardHeader(group?.name);
    const capacity = Number(group?.capacity) || 10;
    const memberIds = Array.isArray(group?.memberIds) ? group.memberIds : [];
    const seatLines = [];
    let filled = 0;
    for (let i = 0; i < capacity; i++) {
      const id = memberIds[i];
      const g = id ? guestList[id] : null;
      const name = g?.name || "";
      const isYes = name && rsvpByName.get(String(name).toLowerCase()) === "yes";
      if (isYes) {
        seatLines.push(fullNameOf(name));
        filled++;
      } else {
        seatLines.push("-");
      }
    }
    if (filled === 0) continue;
    const header = `${title || "Table"} | ${subtitle} | ${capacity}`;
    blocks.push([header, ...seatLines].join("\n"));
  }
  return blocks.join("\n\n");
}

// Block-aware diff for the mirror-chart template. Pulls live tables, parses
// both the textarea and the live data into per-table {title → seat array},
// and returns ONLY the full blocks for tables whose seat layout changed or
// who didn't exist in the textarea yet. Used to print follow-up mirror cards
// without redoing the whole stack of cards.
//
// "Changed" = any seat slot now holds a different normalized name (case-
// insensitive, collapsed whitespace; "-" / "—" / empty all treated as null).
// Order matters — moving a guest to a different seat at the same table still
// counts as a change, since the card shows positional seat numbers.
function parseBlocks(text) {
  return String(text || "")
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split(/\n/).map((l) => l.trim()).filter((l) => l.length > 0);
      const [headerLine = "", ...seatLines] = lines;
      const parts = headerLine.split("|").map((s) => (s || "").trim());
      const title = parts[0] || "";
      const seats = seatLines.map((raw) => {
        if (!raw || /^[-—]+$/.test(raw)) return null;
        return normNameKey(raw);
      });
      return { titleKey: normSubtitleKey(title), block, seats };
    });
}
function seatsEqual(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if ((a[i] ?? null) !== (b[i] ?? null)) return false;
  }
  return true;
}

export async function fetchSeatingTablesDiffText(currentText) {
  const liveText = await fetchSeatingTablesText();
  const liveBlocks = parseBlocks(liveText);
  const currentByTitle = new Map();
  for (const b of parseBlocks(currentText)) {
    currentByTitle.set(b.titleKey, b);
  }
  const diff = [];
  for (const b of liveBlocks) {
    const prev = currentByTitle.get(b.titleKey);
    const isNew = !prev;
    const isChanged = prev && !seatsEqual(prev.seats, b.seats);
    if (isNew || isChanged) diff.push(b.block);
  }
  if (!diff.length) {
    return { message: "No new or reseated tables since your last pull." };
  }
  return diff.join("\n\n");
}
