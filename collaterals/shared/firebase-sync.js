// Firebase-backed state persistence for the collaterals studio.
// Replaces shared/state.js's localStorage-only layer with a Firebase RTDB
// path so settings (positions, locks, configs) sync across devices and
// between Charlie + Karla.
//
// Project: test-database-55379 (same as weddingbar/, autoclicker/, aircon/).
// Path:    /collaterals/<templateId>  → JSON state
// Path:    /collaterals/_global       → reserved for cross-template settings
//
// API mirrors shared/state.js:
//   await fbInit()              one-time on page load
//   await fbGet(templateId)     read latest snapshot
//   await fbSet(templateId, s)  write whole state
//   fbSubscribe(templateId, cb) live updates from other tabs/devices
//
// Auth is anonymous — same project rules as weddingbar where /.read & /.write
// are open. Acceptable risk: collaterals folder is per-template state, easily
// wipe-able if abuse happens.

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import {
  getDatabase, ref, get, set, onValue, child,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyB8ahT56WbEUaGAymsRNNA-DrfZnUnWIwk",
  authDomain: "test-database-55379.firebaseapp.com",
  databaseURL: "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "test-database-55379",
  storageBucket: "test-database-55379.firebasestorage.app",
  messagingSenderId: "933688602756",
  appId: "1:933688602756:web:392a3a4ce040cb9d4452d1",
  measurementId: "G-1LSTC0N3NJ",
};

let _app = null;
let _db = null;

function ensureInit() {
  if (_db) return _db;
  _app = initializeApp(firebaseConfig);
  _db = getDatabase(_app);
  return _db;
}

// Shared by sibling modules (e.g. firebase-storage.js) so we don't double-init.
export function getFbApp() {
  ensureInit();
  return _app;
}

const ROOT = "collaterals";

export async function fbGet(templateId) {
  const db = ensureInit();
  const snap = await get(child(ref(db), `${ROOT}/${templateId}`));
  return snap.exists() ? snap.val() : null;
}

let _writeTimer = null;
let _pendingWrites = new Map();
export function fbSet(templateId, state) {
  // Debounced batched write: rapid drag updates would otherwise hammer RTDB.
  const db = ensureInit();
  _pendingWrites.set(templateId, state);
  clearTimeout(_writeTimer);
  _writeTimer = setTimeout(async () => {
    const writes = Array.from(_pendingWrites.entries());
    _pendingWrites.clear();
    for (const [id, s] of writes) {
      try {
        await set(ref(db, `${ROOT}/${id}`), s);
      } catch (e) {
        console.warn("fbSet failed for", id, e);
      }
    }
  }, 350);
}

export function fbSubscribe(templateId, cb) {
  const db = ensureInit();
  return onValue(ref(db, `${ROOT}/${templateId}`), (snap) => {
    if (snap.exists()) cb(snap.val());
  });
}

// Asset-URL index: maps an asset key (e.g. "name-cards:bg") to its Firebase
// Storage download URL so any device can fetch the same uploaded image.
// Path: /collaterals/_assets/<key> → { url, path, savedAt }
export async function fbAssetGet(key) {
  const db = ensureInit();
  const safe = key.replace(/[.#$/\[\]]/g, "_");
  const snap = await get(child(ref(db), `${ROOT}/_assets/${safe}`));
  return snap.exists() ? snap.val() : null;
}

export async function fbAssetSet(key, meta) {
  const db = ensureInit();
  const safe = key.replace(/[.#$/\[\]]/g, "_");
  await set(ref(db, `${ROOT}/_assets/${safe}`), meta);
}

export async function fbAssetClear(key) {
  const db = ensureInit();
  const safe = key.replace(/[.#$/\[\]]/g, "_");
  await set(ref(db, `${ROOT}/_assets/${safe}`), null);
}
