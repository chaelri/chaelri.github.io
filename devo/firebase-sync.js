// Firebase RTDB bootstrap. For supported sync users (Charlie, Karla),
// localStorage is replaced with an in-memory mirror backed by Firebase
// Realtime Database — all reads/writes hit the mirror (instant, sync),
// writes also debounce-flush to RTDB, and remote changes flow back via
// .on("value"). Each sync user gets their OWN RTDB path so personal
// devotions, notes, reflections stay private to their account / devices.
// For everyone else this file is a no-op and the app uses real
// localStorage as before.
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
  "dashGreetingCacheV2",
  "gratitudeJournal",
  "prayersJournal",
  "retellReactions",
];
// NOTE: `obedienceJournal` was dropped 2026-08-10 with the obedience journal
// itself (see DECISIONS #26). Existing entries stay in RTDB but are never read
// or written again — same quiet-decay treatment the SOAP keys got.

const SYNC_DYNAMIC_PREFIXES = ["reflection-", "devo.canvas.", "chapterContext.", "passageRecap-", "passageHeading-"];

// Per-user RTDB path map. Charlie's path is the legacy "devo-sync" so his
// existing data stays at the root we've always used (no migration needed).
// Karla gets her own scoped path. Add additional users here by name.
const SYNC_USERS = {
  charlie: "devo-sync",
  karla:   "devo-sync-karla",
};

const BOOTSTRAP_KEY = "userName";
const FB_WRITE_DEBOUNCE_MS = 400;

// Capture the original localStorage before we shadow it. All references to
// real persistence (e.g. userName boot identity) go through _realLs.
const _realLs = window.localStorage;

let _fbApp = null;
let _fbDb = null;
let _syncUser = null;          // lowercase name of the active sync user, or null
let _syncPath = null;          // resolved RTDB path for the active user
let _mirror = null;            // { [decodedKey]: stringValue }
let _suppressFbWrites = false; // true while we apply remote changes locally
let _writeTimers = {};
let _remoteListenerCb = null;  // saved so deactivation can detach it

// Offline-first state. The mirror is also kept on the device (IndexedDB), so
// the app boots from it with no network, and every synced write is recorded as
// PENDING until RTDB acknowledges it. Pending writes survive reloads and are
// replayed (merged against whatever RTDB has by then) when a connection comes
// back. Before this, a sync user offline either hung forever on boot (RTDB
// once() never resolves offline) or — if the SDK failed to load — booted on an
// empty real localStorage whose later merge could overwrite the real journals.
let _pending = new Map();      // decodedKey -> string value, or null for a delete
let _live = false;             // true once pending is replayed and the listener is attached
let _connGen = 0;              // bumped on activate/deactivate so a stale background connect bails
let _unsent = new Set();       // keys whose debounced RTDB write hasn't been handed to the SDK yet
// Declared up here, not beside the IndexedDB helpers: bootstrap() runs at load
// and would hit them in their temporal dead zone.
const LOCAL_DB = "devo-sync-local";
let _localDbP = null;
let _dirty = new Set();
let _flushTimer = null;

// ── Boot ────────────────────────────────────────────────────────────────────
(async function bootstrap() {
  const name = (_realLs.getItem(BOOTSTRAP_KEY) || "").trim().toLowerCase();
  if (name && name in SYNC_USERS) {
    try { await _activateSyncFor(name); }
    catch (err) { console.error("Firebase bootstrap failed:", err); }
  }
  _injectAppScript();
})();

// In-place activation for a specific sync user. Used by bootstrap (when the
// userName is already a known sync user at page load) AND by _showNamePrompt
// (when the user types charlie/karla mid-session and we want to enable RTDB
// sync without a page reload).
async function _activateSyncFor(user) {
  const lower = (user || "").trim().toLowerCase();
  const path = SYNC_USERS[lower];
  if (!path) {
    console.warn("Unknown sync user:", user);
    return;
  }
  if (_syncUser === lower) return; // idempotent — already active for this user
  // If a different user is active, tear them down first so the mirror /
  // listener / write timers belong to exactly one user at any time.
  if (_syncUser) await _deactivateSync();
  _syncUser = lower;
  _syncPath = path;
  const gen = ++_connGen;

  // Local copy on this device → boot from it right now, connect in the
  // background. The app never waits on the network.
  const local = await _loadLocal(lower).catch((err) => {
    console.warn("[sync] local copy unreadable", err);
    return null;
  });
  if (gen !== _connGen) return;
  if (local) {
    _mirror = local.mirror;
    _pending = local.pending;
    // Anything still in real localStorage (e.g. written before typing the
    // name mid-session) is folded in as a pending local change.
    for (const [enc, v] of Object.entries(_readRealLsForSync())) {
      const key = _decodeKey(enc);
      const merged = key in _mirror ? _mergeOne(key, v, _mirror[key]) : v;
      _mirror[key] = merged;
      _pending.set(key, merged);
      _markDirty(key);
    }
    _installMirror();
    _clearMigratedRealLs();
    _refreshAppGlobals();
    _connectInBackground(gen);
    return;
  }

  // First run on this device (no local copy yet): RTDB is the only place the
  // data lives, so this one boot has to reach it.
  await _initFirebase();
  const merged = await _mergeOnBoot();
  if (gen !== _connGen) return;
  _mirror = _decodeAll(merged);
  _pending = new Map();
  _installMirror();
  _clearMigratedRealLs();
  for (const k of Object.keys(_mirror)) _markDirty(k);
  _flushLocal();
  _live = true;
  _listenForRemoteChanges();
  _refreshAppGlobals();
}

// Reach RTDB whenever it becomes reachable: replay pending local writes
// (merged with what RTDB has now, per key, same rules as the boot merge),
// then attach the live listener. Retries on `online` and every 30 s.
async function _connectInBackground(gen) {
  const retry = () => {
    if (gen !== _connGen) return;
    clearTimeout(_connectInBackground._t);
    _connectInBackground._t = setTimeout(() => _connectInBackground(gen), 30000);
    window.addEventListener("online", () => _connectInBackground(gen), { once: true });
  };
  if (gen !== _connGen || _live || _connectInBackground._busy === gen) return;
  _connectInBackground._busy = gen;
  try {
    await _initFirebase();
    const snap = await _fbDb.ref(_syncPath).once("value"); // resolves once connected
    if (gen !== _connGen) return;
    const remote = _decodeAll(snap.val() || {});
    const updates = {};
    const sent = new Map();
    for (const [key, v] of _pending) {
      const out = v === null ? null : key in remote ? _mergeOne(key, v, remote[key]) : v;
      updates[_encodeKey(key)] = out;
      sent.set(key, out);
      if (out === null) delete _mirror[key];
      else _mirror[key] = out;
      _markDirty(key);
    }
    if (sent.size) {
      _fbDb.ref(_syncPath).update(updates).then(() => {
        for (const [key, out] of sent) {
          if (_pending.get(key) === out) _pending.delete(key); // unchanged since → acked
          _markDirty(key);
        }
      }).catch((err) => console.warn("[sync] pending replay failed", err));
      // Keep pending as the merged values until RTDB acks.
      for (const [key, out] of sent) _pending.set(key, out);
    }
    _live = true;
    _listenForRemoteChanges(); // fires at once with the full snapshot; changed keys repaint themselves
    if (sent.has("bibleFavorites") || sent.has("bibleComments")) {
      try { favorites = JSON.parse(_mirror["bibleFavorites"] || "{}"); } catch {}
      try { comments = JSON.parse(_mirror["bibleComments"] || "{}"); } catch {}
    }
  } catch (err) {
    console.warn("[sync] offline — using the copy on this device", err);
    retry();
  } finally {
    if (_connectInBackground._busy === gen) _connectInBackground._busy = null;
  }
}
// One key through the boot-merge rules (favorites max, comments union, …).
function _mergeOne(key, localVal, remoteVal) {
  const enc = _encodeKey(key);
  return _mergeAll({ [enc]: localVal }, { [enc]: remoteVal })[enc];
}
window.activateSyncForUser = _activateSyncFor;

// Backwards-compat shims so any older references / cockpit modes still work.
window.activateCharlieSync = () => _activateSyncFor("charlie");
window.activateKarlaSync   = () => _activateSyncFor("karla");

// Tear the mirror back down without reloading. Used when the user switches
// away from a sync user via the name prompt. After this runs,
// window.localStorage is real localStorage again, RTDB writes/listens are
// detached, and the app's in-memory globals are reseeded from real LS
// (mostly empty post-clear).
async function _deactivateSync() {
  if (!_syncUser) return;
  _connGen++;
  _flushLocal(); // this user's pending writes stay on the device for next time
  _live = false;
  _pending = new Map();
  _unsent = new Set();
  if (_fbDb && _remoteListenerCb && _syncPath) {
    try { _fbDb.ref(_syncPath).off("value", _remoteListenerCb); } catch {}
  }
  _remoteListenerCb = null;
  for (const t of Object.values(_writeTimers)) clearTimeout(t);
  _writeTimers = {};
  // Restore real localStorage on window. (configurable: true was set during
  // install so we can redefine here.)
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get() { return _realLs; },
  });
  _mirror = null;
  _syncUser = null;
  _syncPath = null;
  _refreshAppGlobals();
}
window.deactivateSync = _deactivateSync;
window.deactivateCharlieSync = _deactivateSync; // backwards-compat
window.deactivateKarlaSync   = _deactivateSync; // symmetric API for Karla

// After the mirror is installed (or torn down) mid-session, the in-memory
// globals declared at the top of script chunks (favorites, comments) may be
// stale relative to what window.localStorage now backs to. Reseed them and
// trigger a dashboard re-render. We read through window.localStorage so this
// works in both directions: post-activation it hits the mirror, post-
// deactivation it hits real localStorage.
function _refreshAppGlobals() {
  try { if (typeof favorites !== "undefined") favorites = JSON.parse(localStorage.getItem("bibleFavorites") || "{}"); } catch {}
  try { if (typeof comments  !== "undefined") comments  = JSON.parse(localStorage.getItem("bibleComments")  || "{}"); } catch {}
  if (typeof renderDashboard === "function") {
    try { renderDashboard(); } catch {}
  }
}

function _injectAppScript() {
  // script.js is split into 10 ordered chunks under js/. They share the same
  // script-global scope as a single classic <script>, so cross-file globals
  // (e.g. `comments`, `favorites`, `ttsQueue`) keep working unchanged. We set
  // async=false on dynamically-inserted scripts to force in-order execution.
  const files = [
    "js/01-core.js",
    "js/02-data.js",
    "js/03-tts.js",
    "js/04-passage.js",
    "js/05-render-init.js",
    "js/06-notes.js",
    "js/07-immersive.js",
    "js/08-story.js",
    "js/09-narrate.js",
    "js/10-creator-canvas.js",
    "js/11-boot.js",
  ];
  for (const src of files) {
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    document.body.appendChild(s);
  }
}

// ── Firebase init ───────────────────────────────────────────────────────────
function _loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    // Drop a failed tag, or the next attempt (back online) finds it and
    // "resolves" without the SDK ever loading.
    s.onerror = (e) => { s.remove(); reject(e); };
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
  const snap = await _fbDb.ref(_syncPath).once("value");
  const remote = snap.val() || {};
  const merged = _mergeAll(local, remote);
  // Only write if something changed to avoid pointless RTDB churn.
  if (!_shallowEqual(merged, remote)) {
    await _fbDb.ref(_syncPath).set(merged);
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
// the sync user before Firebase loads.
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
      _markDirty(key);
      // Mirror userName back to real LS so next page load detects the sync
      // user before Firebase finishes loading.
      if (key === BOOTSTRAP_KEY) _realLs.setItem(key, v);
      if (_suppressFbWrites) return;
      if (!_shouldSync(key)) return;
      _pending.set(key, v);
      _scheduleFbWrite(key, v);
    },
    removeItem(key) {
      if (!(key in _mirror)) return;
      delete _mirror[key];
      _markDirty(key);
      if (key === BOOTSTRAP_KEY) _realLs.removeItem(key);
      if (_suppressFbWrites) return;
      if (!_shouldSync(key)) return;
      _pending.set(key, null);
      _scheduleFbWrite(key, null);
    },
    clear() {
      for (const k of Object.keys(_mirror)) _markDirty(k);
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

// value === null means delete. Until the background connect has replayed the
// pending queue (_live), writes just stay pending — the replay sends them.
// Offline after that, the SDK queues the write itself; either way the key
// leaves _pending only when RTDB acknowledges that exact value.
function _scheduleFbWrite(key, value) {
  const enc = _encodeKey(key);
  clearTimeout(_writeTimers[enc]);
  if (!_live || !_fbDb) return;
  _unsent.add(key);
  _writeTimers[enc] = setTimeout(() => {
    delete _writeTimers[enc];
    _unsent.delete(key);
    const ref = _fbDb.ref(`${_syncPath}/${enc}`);
    (value === null ? ref.remove() : ref.set(value)).then(() => {
      if (_pending.get(key) === value) {
        _pending.delete(key);
        _markDirty(key);
      }
    }).catch((err) => {
      console.warn("RTDB write failed for", key, err);
    });
  }, FB_WRITE_DEBOUNCE_MS);
}

// ── Local copy (IndexedDB) ──────────────────────────────────────────────────
// Stores: kv [user, key] -> string, pending [user, key] -> {v}, meta user -> {savedAt}.
// meta marks a complete copy; without it the boot goes to RTDB first.

function _localDb() {
  if (!_localDbP) {
    _localDbP = new Promise((resolve, reject) => {
      const req = indexedDB.open(LOCAL_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of ["kv", "pending", "meta"]) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return _localDbP;
}

async function _loadLocal(user) {
  const db = await _localDb();
  const tx = db.transaction(["kv", "pending", "meta"], "readonly");
  const range = IDBKeyRange.bound([user], [user, []]);
  const req = (store, method, arg) => new Promise((res, rej) => {
    const r = tx.objectStore(store)[method](arg);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const [meta, keys, vals, pKeys, pVals] = await Promise.all([
    req("meta", "get", user),
    req("kv", "getAllKeys", range), req("kv", "getAll", range),
    req("pending", "getAllKeys", range), req("pending", "getAll", range),
  ]);
  if (!meta) return null;
  const mirror = {};
  keys.forEach((k, i) => { mirror[k[1]] = vals[i]; });
  const pending = new Map();
  pKeys.forEach((k, i) => pending.set(k[1], pVals[i].v));
  return { mirror, pending };
}

function _markDirty(key) {
  _dirty.add(key);
  clearTimeout(_flushTimer);
  _flushTimer = setTimeout(_flushLocal, 250);
}

function _flushLocal() {
  clearTimeout(_flushTimer);
  if (!_syncUser || !_mirror || !_dirty.size) return;
  const user = _syncUser, keys = [..._dirty];
  const snapshot = keys.map((k) => [k, _mirror[k], _pending.has(k) ? _pending.get(k) : undefined]);
  _dirty = new Set();
  _localDb().then((db) => {
    const tx = db.transaction(["kv", "pending", "meta"], "readwrite");
    const kv = tx.objectStore("kv"), pend = tx.objectStore("pending");
    for (const [k, v, p] of snapshot) {
      if (v === undefined) kv.delete([user, k]); else kv.put(v, [user, k]);
      if (p === undefined) pend.delete([user, k]); else pend.put({ v: p }, [user, k]);
    }
    tx.objectStore("meta").put({ savedAt: Date.now() }, user);
    tx.onerror = () => console.warn("[sync] local save failed", tx.error);
  }).catch((err) => console.warn("[sync] local save failed", err));
}

// Closing the tab / backgrounding the phone mustn't drop the last 250 ms.
addEventListener("pagehide", _flushLocal);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") _flushLocal(); });

// ── Listen for remote changes ───────────────────────────────────────────────
function _listenForRemoteChanges() {
  _remoteListenerCb = (snap) => {
    const remote = snap.val() || {};
    const decoded = _decodeAll(remote);

    const changedCanvasKeys = [];
    const changedJournalKeys = [];
    let favoritesChanged = false;
    let commentsChanged = false;
    let anyChanged = false;
    let nonJournalChanged = false;
    let reactionsChanged = false;

    const noteJournalKey = (k) => {
      if (k === "gratitudeJournal" || k === "prayersJournal") changedJournalKeys.push(k);
      // Retell reactions repaint themselves through their own event; a
      // dashboard re-render would be a whole-page fade for a pinned emoji.
      else if (k === "retellReactions") reactionsChanged = true;
      else nonJournalChanged = true;
    };

    // Apply additions / updates. A key typed in the last 400 ms hasn't reached
    // the SDK yet, so this snapshot still holds its OLD value — skip it, or the
    // keystroke gets reverted by an unrelated remote change.
    for (const [key, val] of Object.entries(decoded)) {
      if (_unsent.has(key)) continue;
      if (_mirror[key] !== val) {
        _mirror[key] = val;
        _markDirty(key);
        anyChanged = true;
        if (key.startsWith("devo.canvas.")) changedCanvasKeys.push(key);
        if (key === "bibleFavorites") favoritesChanged = true;
        if (key === "bibleComments") commentsChanged = true;
        noteJournalKey(key);
      }
    }
    // Apply remote deletions — synced keys only. Device-only settings (theme,
    // TTS prefs…) live in the mirror too and were never in RTDB.
    for (const key of Object.keys(_mirror)) {
      if (!(key in decoded) && _shouldSync(key) && !_unsent.has(key) && !_pending.has(key)) {
        delete _mirror[key];
        _markDirty(key);
        anyChanged = true;
        if (key.startsWith("devo.canvas.")) changedCanvasKeys.push(key);
        if (key === "bibleFavorites") favoritesChanged = true;
        if (key === "bibleComments") commentsChanged = true;
        noteJournalKey(key);
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
    // Real-time journal updates: dispatch a targeted event so any open
    // gratitude/prayers modal can re-render in place WITHOUT triggering the
    // whole dashboard fade. The dashboard pill counts get refreshed by the
    // listener too. This is the path that lets Charlie's edits show up live
    // on Karla's device (and vice versa).
    if (changedJournalKeys.length) {
      window.dispatchEvent(new CustomEvent("devo:journal-sync", { detail: { keys: changedJournalKeys } }));
    }
    if (reactionsChanged) {
      window.dispatchEvent(new CustomEvent("devo:retell-reactions"));
    }

    // Re-render dashboard ONLY if a non-journal key changed; pure-journal
    // updates avoid the heavy whole-page fade.
    const homeBtn = document.getElementById("homeBtn");
    if (nonJournalChanged && homeBtn && homeBtn.style.display === "none" && typeof renderDashboard === "function") {
      try { renderDashboard(); } catch {}
    }
  };
  _fbDb.ref(_syncPath).on("value", _remoteListenerCb);
}

// Retell reactions: one entry per beat, so merge per key and let the newer
// timestamp win. Local-wins (the default branch) would drop a reaction the
// other device added while this one was offline.
function _mergeReactions(lRaw, rRaw) {
  try {
    const l = JSON.parse(lRaw || "{}");
    const r = JSON.parse(rRaw || "{}");
    const out = { ...r };
    for (const [k, v] of Object.entries(l)) {
      if (!out[k] || (v?.ts || 0) >= (out[k]?.ts || 0)) out[k] = v;
    }
    return JSON.stringify(out);
  } catch {
    return lRaw;
  }
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
    } else if (decodedKey === "retellReactions") {
      merged[key] = _mergeReactions(lVal, rVal);
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

