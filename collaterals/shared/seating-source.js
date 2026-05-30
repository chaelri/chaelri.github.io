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
