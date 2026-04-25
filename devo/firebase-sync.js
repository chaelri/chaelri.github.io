// Firebase RTDB bootstrap. For Charlie (userName === "charlie"), localStorage
// is replaced with an in-memory mirror backed by Firebase Realtime Database —
// all reads/writes hit the mirror (instant, sync), writes also debounce-flush
// to RTDB, and remote changes flow back via .on("value"). For everyone else
// this file is a no-op and the app uses real localStorage as before.
//
// This file MUST load before script.js. script.js is injected dynamically
// after the bootstrap settles so its top-level localStorage reads see the
// mirror (already populated from RTDB).

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB8ahT56WbEUaGAymsRNNA-DrfZnUnWIwk",
  authDomain: "test-database-55379.firebaseapp.com",
  databaseURL: "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "test-database-55379",
  storageBucket: "test-database-55379.firebasestorage.app",
  messagingSenderId: "933688602756",
  appId: "1:933688602756:web:392a3a4ce040cb9d4452d1",
  measurementId: "G-1LSTC0N3NJ",
};

const SYNC_STATIC_KEYS = [
  "bibleFavorites",
  "bibleComments",
  "devotionStandaloneNotes",
  "storySeenHistory",
  "userName",
  "bibleVersion",
  "recentPassageId",
  "recentPassage",
  "soap_application",
  "soap_prayer",
];

const SYNC_DYNAMIC_PREFIXES = ["reflection-", "devo.canvas."];
const RTDB_PATH = "devo-sync";
const BOOTSTRAP_KEY = "userName";
const FB_WRITE_DEBOUNCE_MS = 400;

// Capture the original localStorage before we shadow it. All references to
// real persistence (e.g. userName boot identity) go through _realLs.
const _realLs = window.localStorage;

let _fbApp = null;
let _fbDb = null;
let _isCharlie = false;
let _mirror = null;            // { [decodedKey]: stringValue }
let _suppressFbWrites = false; // true while we apply remote changes locally
let _writeTimers = {};

// ── Boot ────────────────────────────────────────────────────────────────────
(async function bootstrap() {
  const name = (_realLs.getItem(BOOTSTRAP_KEY) || "").trim().toLowerCase();
  _isCharlie = name === "charlie";

  if (!_isCharlie) {
    _injectAppScript();
    return;
  }

  // No sync splash — the regular "devotion." intro stays visible while we
  // pull from Firebase in the background.
  try {
    await _initFirebase();
    const merged = await _mergeOnBoot();
    _mirror = _decodeAll(merged);
    _installMirror();
    _clearMigratedRealLs();
    _listenForRemoteChanges();
  } catch (err) {
    console.error("Firebase bootstrap failed:", err);
  }
  _injectAppScript();
})();

function _injectAppScript() {
  const s = document.createElement("script");
  s.src = "script.js";
  document.body.appendChild(s);
}

// ── Firebase init ───────────────────────────────────────────────────────────
function _loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function _initFirebase() {
  await _loadScript("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
  await _loadScript("https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js");
  if (!_fbApp) _fbApp = firebase.initializeApp(FIREBASE_CONFIG);
  _fbDb = firebase.database();
}

// ── Initial merge: pull remote, fold in any local data, push back ───────────
async function _mergeOnBoot() {
  const local = _readRealLsForSync();
  const snap = await _fbDb.ref(RTDB_PATH).once("value");
  const remote = snap.val() || {};
  const merged = _mergeAll(local, remote);
  // Only write if something changed to avoid pointless RTDB churn.
  if (!_shallowEqual(merged, remote)) {
    await _fbDb.ref(RTDB_PATH).set(merged);
  }
  return merged;
}

function _shallowEqual(a, b) {
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (a[k] !== b[k]) return false;
  return true;
}

function _readRealLsForSync() {
  const out = {};
  for (const key of SYNC_STATIC_KEYS) {
    const v = _realLs.getItem(key);
    if (v !== null) out[_encodeKey(key)] = v;
  }
  for (let i = 0; i < _realLs.length; i++) {
    const k = _realLs.key(i);
    if (k && SYNC_DYNAMIC_PREFIXES.some(p => k.startsWith(p))) {
      out[_encodeKey(k)] = _realLs.getItem(k);
    }
  }
  return out;
}

// Strip synced keys from real localStorage after the initial migration. The
// mirror is now the working store. userName stays so the next boot detects
// Charlie before Firebase loads.
function _clearMigratedRealLs() {
  const removeKeys = new Set();
  for (const key of SYNC_STATIC_KEYS) {
    if (key !== BOOTSTRAP_KEY) removeKeys.add(key);
  }
  for (let i = 0; i < _realLs.length; i++) {
    const k = _realLs.key(i);
    if (k && SYNC_DYNAMIC_PREFIXES.some(p => k.startsWith(p))) removeKeys.add(k);
  }
  // Legacy flag from the old 5-tap activation, no longer needed.
  removeKeys.add("_charlieMode");
  for (const k of removeKeys) _realLs.removeItem(k);
}

// ── Install mirror as window.localStorage ───────────────────────────────────
function _installMirror() {
  const mirrorLs = {
    getItem(key) { return key in _mirror ? _mirror[key] : null; },
    setItem(key, value) {
      const v = String(value);
      if (_mirror[key] === v) return;
      _mirror[key] = v;
      // Mirror userName back to real LS so next page load detects Charlie
      // before Firebase finishes loading.
      if (key === BOOTSTRAP_KEY) _realLs.setItem(key, v);
      if (_suppressFbWrites) return;
      if (!_shouldSync(key)) return;
      _scheduleFbWrite(key, v);
    },
    removeItem(key) {
      if (!(key in _mirror)) return;
      delete _mirror[key];
      if (key === BOOTSTRAP_KEY) _realLs.removeItem(key);
      if (_suppressFbWrites) return;
      if (!_shouldSync(key)) return;
      _fbDb.ref(`${RTDB_PATH}/${_encodeKey(key)}`).remove().catch(() => {});
    },
    clear() {
      _mirror = {};
    },
    key(i) { return Object.keys(_mirror)[i] || null; },
    get length() { return Object.keys(_mirror).length; },
  };

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get() { return mirrorLs; },
  });
}

function _shouldSync(key) {
  return SYNC_STATIC_KEYS.includes(key) ||
    SYNC_DYNAMIC_PREFIXES.some(p => key.startsWith(p));
}

function _scheduleFbWrite(key, value) {
  const enc = _encodeKey(key);
  clearTimeout(_writeTimers[enc]);
  _writeTimers[enc] = setTimeout(() => {
    _fbDb.ref(`${RTDB_PATH}/${enc}`).set(value).catch((err) => {
      console.warn("RTDB write failed for", key, err);
    });
  }, FB_WRITE_DEBOUNCE_MS);
}

// ── Listen for remote changes ───────────────────────────────────────────────
function _listenForRemoteChanges() {
  _fbDb.ref(RTDB_PATH).on("value", (snap) => {
    const remote = snap.val() || {};
    const decoded = _decodeAll(remote);

    const changedCanvasKeys = [];
    let favoritesChanged = false;
    let commentsChanged = false;
    let anyChanged = false;

    // Apply additions / updates.
    for (const [key, val] of Object.entries(decoded)) {
      if (_mirror[key] !== val) {
        _mirror[key] = val;
        anyChanged = true;
        if (key.startsWith("devo.canvas.")) changedCanvasKeys.push(key);
        if (key === "bibleFavorites") favoritesChanged = true;
        if (key === "bibleComments") commentsChanged = true;
      }
    }
    // Apply remote deletions.
    for (const key of Object.keys(_mirror)) {
      if (!(key in decoded)) {
        delete _mirror[key];
        anyChanged = true;
        if (key.startsWith("devo.canvas.")) changedCanvasKeys.push(key);
        if (key === "bibleFavorites") favoritesChanged = true;
        if (key === "bibleComments") commentsChanged = true;
      }
    }

    if (!anyChanged) return;

    // Refresh in-memory globals declared in script.js.
    if (favoritesChanged) {
      try { favorites = JSON.parse(_mirror["bibleFavorites"] || "{}"); } catch {}
    }
    if (commentsChanged) {
      try { comments = JSON.parse(_mirror["bibleComments"] || "{}"); } catch {}
    }

    if (changedCanvasKeys.length) {
      window.dispatchEvent(new CustomEvent("devo:canvas-sync", { detail: { keys: changedCanvasKeys } }));
    }

    // Re-render dashboard if it's the visible view.
    const homeBtn = document.getElementById("homeBtn");
    if (homeBtn && homeBtn.style.display === "none" && typeof renderDashboard === "function") {
      try { renderDashboard(); } catch {}
    }
  });
}

// ── Merge logic (preserved from previous version) ───────────────────────────
function _mergeAll(local, remote) {
  const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  const merged = {};
  for (const key of allKeys) {
    const lVal = local[key];
    const rVal = remote[key];
    if (lVal === undefined) { merged[key] = rVal; continue; }
    if (rVal === undefined) { merged[key] = lVal; continue; }

    const decodedKey = _decodeKey(key);
    if (decodedKey === "bibleFavorites" || decodedKey === "storySeenHistory") {
      merged[key] = _mergeJsonObjects(lVal, rVal, "max");
    } else if (decodedKey === "bibleComments") {
      merged[key] = _mergeComments(lVal, rVal);
    } else if (decodedKey === "devotionStandaloneNotes") {
      merged[key] = _mergeStandaloneNotes(lVal, rVal);
    } else if (decodedKey === "soap_application" || decodedKey === "soap_prayer") {
      merged[key] = _mergeSoapEntries(lVal, rVal);
    } else if (decodedKey.startsWith("devo.canvas.")) {
      merged[key] = _mergeCanvasState(lVal, rVal);
    } else {
      merged[key] = lVal;
    }
  }
  return merged;
}

function _mergeJsonObjects(a, b, strategy) {
  try {
    const objA = typeof a === "string" ? JSON.parse(a) : a || {};
    const objB = typeof b === "string" ? JSON.parse(b) : b || {};
    const merged = { ...objB, ...objA };
    if (strategy === "max") {
      for (const k of Object.keys(objB)) {
        if (k in objA) merged[k] = Math.max(Number(objA[k]) || 0, Number(objB[k]) || 0);
      }
    }
    return JSON.stringify(merged);
  } catch { return a || b; }
}

function _mergeComments(a, b) {
  try {
    const objA = typeof a === "string" ? JSON.parse(a) : a || {};
    const objB = typeof b === "string" ? JSON.parse(b) : b || {};
    const merged = { ...objB };
    for (const [verseKey, notesA] of Object.entries(objA)) {
      if (!merged[verseKey]) merged[verseKey] = notesA;
      else {
        const existing = new Set(merged[verseKey].map(n => n.time));
        for (const note of notesA) if (!existing.has(note.time)) merged[verseKey].push(note);
        merged[verseKey].sort((a, b) => a.time - b.time);
      }
    }
    return JSON.stringify(merged);
  } catch { return a || b; }
}

function _mergeStandaloneNotes(a, b) {
  try {
    const arrA = typeof a === "string" ? JSON.parse(a) : a || [];
    const arrB = typeof b === "string" ? JSON.parse(b) : b || [];
    const byId = {};
    for (const n of arrB) byId[n.id] = n;
    for (const n of arrA) {
      if (!byId[n.id] || (n.updatedAt || 0) >= (byId[n.id].updatedAt || 0)) byId[n.id] = n;
    }
    return JSON.stringify(Object.values(byId).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
  } catch { return a || b; }
}

function _mergeCanvasState(a, b) {
  try {
    const objA = typeof a === "string" ? JSON.parse(a) : a || {};
    const objB = typeof b === "string" ? JSON.parse(b) : b || {};
    const highlights = { ...(objB.highlights || {}), ...(objA.highlights || {}) };
    return JSON.stringify({ highlights });
  } catch { return a || b; }
}

function _mergeSoapEntries(a, b) {
  try {
    const arrA = typeof a === "string" ? JSON.parse(a) : a || [];
    const arrB = typeof b === "string" ? JSON.parse(b) : b || [];
    const byId = {};
    for (const e of arrB) byId[e.id] = e;
    for (const e of arrA) byId[e.id] = e;
    return JSON.stringify(Object.values(byId).sort((a, b) => (b.time || 0) - (a.time || 0)));
  } catch { return a || b; }
}

// ── Key encoding (RTDB disallows . # $ [ ] /) ───────────────────────────────
function _encodeKey(key) { return key.replace(/\./g, "__DOT__").replace(/\//g, "__SL__"); }
function _decodeKey(key) { return key.replace(/__DOT__/g, ".").replace(/__SL__/g, "/"); }

function _decodeAll(encoded) {
  const out = {};
  for (const [k, v] of Object.entries(encoded)) {
    if (v === null || v === undefined) continue;
    out[_decodeKey(k)] = v;
  }
  return out;
}

