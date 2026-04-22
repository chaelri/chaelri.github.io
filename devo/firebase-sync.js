// ── Firebase Realtime Database Sync (Charlie-only, secret activation) ──
// Tap "devotion." logo 5 times to activate. Data syncs across devices via RTDB.

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

// Keys to sync — static keys that hold JSON objects/arrays/strings
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

// Dynamic key prefix for reflections and canvas highlights
const SYNC_DYNAMIC_PREFIXES = ["reflection-", "devo.canvas."];

const RTDB_PATH = "devo-sync";

let _fbApp = null;
let _fbDb = null;
let _syncEnabled = false;
let _ignoreRemoteUpdate = false;
let _ignoreLocalUpdate = false;
let _syncDebounceTimers = {};

// ── Secret tap activation ──
let _secretTapBound = false;
function _initSecretTap() {
  if (_secretTapBound) return;
  const brand = document.getElementById("dashBrand");
  if (!brand) {
    // Retry — element may not exist yet
    setTimeout(_initSecretTap, 1000);
    return;
  }

  _secretTapBound = true;
  let tapCount = 0;
  let tapTimer = null;

  brand.addEventListener("click", (e) => {
    e.stopPropagation();
    tapCount++;
    clearTimeout(tapTimer);

    if (tapCount >= 5) {
      tapCount = 0;
      if (_syncEnabled) {
        _showSyncToast("Sync is active ✓");
      } else {
        // First check: name must be Charlie
        const name = (localStorage.getItem("userName") || "").trim().toLowerCase();
        if (name !== "charlie") return; // silently ignore
        _showCharlieConfirm();
      }
      return;
    }

    tapTimer = setTimeout(() => { tapCount = 0; }, 1200);
  });
}

// ── Charlie confirmation prompt ──
function _showCharlieConfirm() {
  const overlay = document.createElement("div");
  overlay.className = "sync-linked-overlay";
  overlay.innerHTML = `
    <div class="sync-confirm-card">
      <div class="sync-confirm-icon"><span class="material-icons">lock</span></div>
      <div class="sync-confirm-title">Are you really Charlie?</div>
      <div class="sync-confirm-sub">This enables cross-device sync for your data.</div>
      <div class="sync-confirm-actions">
        <button class="sync-confirm-btn yes" id="syncConfirmYes">Yes, it's me</button>
        <button class="sync-confirm-btn no" id="syncConfirmNo">No</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById("syncConfirmYes").onclick = () => {
    overlay.remove();
    localStorage.setItem("_charlieMode", "true");
    _showSyncLinkedAnimation();
  };

  document.getElementById("syncConfirmNo").onclick = () => {
    overlay.classList.add("fade-out");
    overlay.addEventListener("animationend", () => overlay.remove());
    _showSyncToast("Nice try 😉");
  };
}

// ── Sync linked animation (first-time activation) ──
function _showSyncLinkedAnimation() {
  const overlay = document.createElement("div");
  overlay.className = "sync-linked-overlay";
  overlay.innerHTML = `
    <div class="sync-linked-check"><span class="material-icons">link</span></div>
    <div class="sync-linked-text">Hey, Charlie</div>
    <div class="sync-linked-sub">Your data is now syncing across devices</div>
  `;
  document.body.appendChild(overlay);

  // Start sync in background while animation plays
  _startSync();

  // Dismiss after 2.5s
  setTimeout(() => {
    overlay.classList.add("fade-out");
    overlay.addEventListener("animationend", () => overlay.remove());
  }, 2500);
}

// ── Toast notification ──
function _showSyncToast(msg) {
  let toast = document.getElementById("syncToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "syncToast";
    toast.className = "sync-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.remove("sync-toast-out");
  toast.classList.add("sync-toast-in");
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => {
    toast.classList.remove("sync-toast-in");
    toast.classList.add("sync-toast-out");
  }, 2500);
}

// ── Load Firebase SDK dynamically ──
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

  if (!_fbApp) {
    _fbApp = firebase.initializeApp(FIREBASE_CONFIG);
  }
  _fbDb = firebase.database();
}

// ── Start sync ──
async function _startSync() {
  try {
    await _initFirebase();

    // Initial push: upload all local data to RTDB
    await _pushAllToRemote();

    // Listen for remote changes
    _listenForRemoteChanges();

    // Monkey-patch localStorage for live sync
    _patchLocalStorage();

    _syncEnabled = true;
    _showSyncToast("Sync connected ✓");

    // Refresh dashboard to reflect synced data
    const homeBtn = document.getElementById("homeBtn");
    if (homeBtn && homeBtn.style.display === "none" && typeof renderDashboard === "function") {
      renderDashboard();
    }
  } catch (err) {
    console.error("Firebase sync error:", err);
    _showSyncToast("Sync failed — check console");
  }
}

// ── Push all local data to RTDB ──
async function _pushAllToRemote() {
  const data = {};

  // Static keys
  for (const key of SYNC_STATIC_KEYS) {
    const val = localStorage.getItem(key);
    if (val !== null) data[key] = val;
  }

  // Dynamic reflection keys
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (SYNC_DYNAMIC_PREFIXES.some(p => key.startsWith(p))) {
      // RTDB keys can't contain . # $ [ ] / so encode them
      data[_encodeKey(key)] = localStorage.getItem(key);
    }
  }

  // Merge with remote — don't overwrite, merge intelligently
  const snapshot = await _fbDb.ref(RTDB_PATH).once("value");
  const remote = snapshot.val() || {};

  const merged = _mergeAll(data, remote);
  await _fbDb.ref(RTDB_PATH).set(merged);

  // Apply merged data back to local
  _ignoreLocalUpdate = true;
  _applyToLocal(merged);
  _ignoreLocalUpdate = false;
}

// ── Merge logic ──
function _mergeAll(local, remote) {
  const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  const merged = {};

  for (const key of allKeys) {
    const lVal = local[key];
    const rVal = remote[key];

    if (lVal === undefined) { merged[key] = rVal; continue; }
    if (rVal === undefined) { merged[key] = lVal; continue; }

    const decodedKey = _decodeKey(key);

    // Smart merge for known object types
    if (decodedKey === "bibleFavorites" || decodedKey === "storySeenHistory") {
      merged[key] = _mergeJsonObjects(lVal, rVal, "max"); // union, keep later timestamp
    } else if (decodedKey === "bibleComments") {
      merged[key] = _mergeComments(lVal, rVal);
    } else if (decodedKey === "devotionStandaloneNotes") {
      merged[key] = _mergeStandaloneNotes(lVal, rVal);
    } else if (decodedKey === "soap_application" || decodedKey === "soap_prayer") {
      merged[key] = _mergeSoapEntries(lVal, rVal);
    } else if (decodedKey.startsWith("devo.canvas.")) {
      merged[key] = _mergeCanvasState(lVal, rVal);
    } else {
      // For simple strings, prefer local (the device you're on)
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
      // For each key present in both, keep the larger value (later timestamp)
      for (const k of Object.keys(objB)) {
        if (k in objA) {
          merged[k] = Math.max(Number(objA[k]) || 0, Number(objB[k]) || 0);
        }
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
      if (!merged[verseKey]) {
        merged[verseKey] = notesA;
      } else {
        // Merge arrays by deduplicating on time
        const existing = new Set(merged[verseKey].map(n => n.time));
        for (const note of notesA) {
          if (!existing.has(note.time)) merged[verseKey].push(note);
        }
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
      if (!byId[n.id] || (n.updatedAt || 0) >= (byId[n.id].updatedAt || 0)) {
        byId[n.id] = n;
      }
    }

    return JSON.stringify(Object.values(byId).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
  } catch { return a || b; }
}

function _mergeCanvasState(a, b) {
  try {
    const objA = typeof a === "string" ? JSON.parse(a) : a || {};
    const objB = typeof b === "string" ? JSON.parse(b) : b || {};
    // Union highlights by wordIdx; local wins on color conflict
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
    for (const e of arrA) byId[e.id] = e; // local wins on conflict
    return JSON.stringify(Object.values(byId).sort((a, b) => (b.time || 0) - (a.time || 0)));
  } catch { return a || b; }
}

// ── RTDB key encoding (can't use . # $ [ ] /) ──
function _encodeKey(key) { return key.replace(/\./g, "__DOT__").replace(/\//g, "__SL__"); }
function _decodeKey(key) { return key.replace(/__DOT__/g, ".").replace(/__SL__/g, "/"); }

// ── Apply remote data to localStorage ──
function _applyToLocal(data) {
  const changedCanvasKeys = [];
  for (const [encodedKey, val] of Object.entries(data)) {
    if (val === null || val === undefined) continue;
    const key = _decodeKey(encodedKey);
    const current = localStorage.getItem(key);
    if (current !== val) {
      localStorage.setItem(key, val);
      if (key.startsWith("devo.canvas.")) changedCanvasKeys.push(key);
    }
  }

  // Refresh in-memory globals from localStorage
  try { favorites = JSON.parse(localStorage.getItem("bibleFavorites") || "{}"); } catch {}
  try { comments = JSON.parse(localStorage.getItem("bibleComments") || "{}"); } catch {}

  if (changedCanvasKeys.length) {
    window.dispatchEvent(new CustomEvent("devo:canvas-sync", { detail: { keys: changedCanvasKeys } }));
  }
}

// ── Listen for remote changes ──
function _listenForRemoteChanges() {
  _fbDb.ref(RTDB_PATH).on("value", (snapshot) => {
    if (_ignoreRemoteUpdate) return;
    const remote = snapshot.val();
    if (!remote) return;

    _ignoreLocalUpdate = true;
    _applyToLocal(remote);
    _ignoreLocalUpdate = false;

    // Refresh dashboard if it's visible
    const homeBtn = document.getElementById("homeBtn");
    if (homeBtn && homeBtn.style.display === "none" && typeof renderDashboard === "function") {
      renderDashboard();
    }
  });
}

// ── Monkey-patch localStorage.setItem for live outbound sync ──
function _patchLocalStorage() {
  const original = localStorage.setItem.bind(localStorage);

  localStorage.setItem = function (key, value) {
    original(key, value);

    if (_ignoreLocalUpdate) return;
    if (!_syncEnabled) return;

    // Check if this key should sync
    const shouldSync = SYNC_STATIC_KEYS.includes(key) ||
      SYNC_DYNAMIC_PREFIXES.some(p => key.startsWith(p));

    if (!shouldSync) return;

    // Debounce writes (500ms)
    const encodedKey = _encodeKey(key);
    clearTimeout(_syncDebounceTimers[encodedKey]);
    _syncDebounceTimers[encodedKey] = setTimeout(() => {
      _ignoreRemoteUpdate = true;
      _fbDb.ref(`${RTDB_PATH}/${encodedKey}`).set(value).then(() => {
        _ignoreRemoteUpdate = false;
      }).catch(() => {
        _ignoreRemoteUpdate = false;
      });
    }, 500);
  };

  // Also patch removeItem for deletions
  const originalRemove = localStorage.removeItem.bind(localStorage);
  localStorage.removeItem = function (key) {
    originalRemove(key);

    if (_ignoreLocalUpdate || !_syncEnabled) return;

    const shouldSync = SYNC_STATIC_KEYS.includes(key) ||
      SYNC_DYNAMIC_PREFIXES.some(p => key.startsWith(p));

    if (shouldSync) {
      _fbDb.ref(`${RTDB_PATH}/${_encodeKey(key)}`).remove();
    }
  };
}

// ── Init on page load ──
(function () {
  // Set up secret tap regardless
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _initSecretTap);
  } else {
    _initSecretTap();
  }

  // Auto-connect if Charlie mode was previously activated
  if (localStorage.getItem("_charlieMode") === "true") {
    // Small delay to let the main app initialize first
    setTimeout(_startSync, 1500);
  }
})();
