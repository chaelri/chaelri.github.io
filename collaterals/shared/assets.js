// Asset store for user-uploaded images (template backgrounds, custom
// monograms, etc.).
//
// Two-layer storage:
//   1. Firebase Storage — source of truth, shared across devices.
//      Path: collaterals/<key>/<random-name>.<ext>
//      A small RTDB index at /collaterals/_assets/<key> records the latest
//      { url, path, contentType, size, savedAt } so any device can find it.
//   2. IndexedDB — per-device cache as a data URL so SVG <image> tags can
//      embed instantly without a network round-trip (also lets the canvas
//      rasterizer in shared/export.js find the bytes synchronously).
//
// Public API stays the same as before so callers don't change:
//   await saveAsset(key, file)   → returns data URL (and pushes to Storage)
//   await getAsset(key)          → returns data URL (Storage → cache fallback)
//   await clearAsset(key)        → wipes Storage + RTDB + cache

import {
  uploadBlob,
  deleteByPath,
  fetchAsDataUrl,
} from "./firebase-storage.js";
import {
  fbAssetGet,
  fbAssetSet,
  fbAssetClear,
} from "./firebase-sync.js";

const DB_NAME = "collaterals-assets";
const STORE = "assets";

let _dbPromise = null;
function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return _dbPromise;
}

function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

async function idbPut(key, record) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => res(req.result || null);
    req.onerror = () => rej(req.error);
  });
}

async function idbDelete(key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function saveAsset(key, fileOrDataUrl) {
  // Cache the data URL locally first so the UI can paint instantly.
  const dataUrl = typeof fileOrDataUrl === "string"
    ? fileOrDataUrl
    : await fileToDataURL(fileOrDataUrl);

  // For string data URLs we still upload as a Blob so other devices can fetch.
  let blob = fileOrDataUrl;
  if (typeof fileOrDataUrl === "string") {
    const res = await fetch(fileOrDataUrl);
    blob = await res.blob();
  }

  let meta = null;
  try {
    meta = await uploadBlob(key, blob);
    await fbAssetSet(key, { ...meta, savedAt: Date.now() });
  } catch (e) {
    // If Storage upload fails (offline, etc.), we still cache locally so the
    // current device works. The next successful save will sync up.
    console.warn("saveAsset upload failed — local cache only", key, e);
  }

  await idbPut(key, {
    dataUrl,
    url: meta?.url || null,
    path: meta?.path || null,
    savedAt: Date.now(),
  });
  return dataUrl;
}

export async function getAsset(key) {
  // Fast path: device has a cached data URL from a previous save/hydrate.
  const cached = await idbGet(key);
  if (cached?.dataUrl) {
    // If the remote URL has changed since we last cached, refresh in the
    // background — don't block the caller.
    fbAssetGet(key).then((remote) => {
      if (remote?.url && remote.url !== cached.url) {
        hydrateFromRemote(key, remote).catch(() => {});
      }
    }).catch(() => {});
    return cached.dataUrl;
  }
  // No local cache — pull from Firebase if anyone has uploaded.
  const remote = await fbAssetGet(key).catch((e) => {
    console.warn("getAsset RTDB read failed", key, e);
    return null;
  });
  if (!remote?.url) return null;
  // Try to fetch+convert to a data URL so canvas export works. If the bucket
  // CORS isn't configured for fetch, this throws — fall back to the raw URL
  // (which still renders fine in <img> and SVG <image> tags for display).
  try {
    const dataUrl = await fetchAsDataUrl(remote.url);
    await idbPut(key, { ...remote, dataUrl, savedAt: Date.now() });
    return dataUrl;
  } catch (e) {
    console.warn(
      "getAsset: CORS fetch failed — using download URL for display only. " +
      "Run `gsutil cors set cors.json gs://test-database-55379.firebasestorage.app` " +
      "to enable cross-device export.",
      key, e,
    );
    // Cache the URL alone so subsequent gets don't re-hit RTDB.
    await idbPut(key, { ...remote, dataUrl: null, savedAt: Date.now() });
    return remote.url;
  }
}

async function hydrateFromRemote(key, remote) {
  const dataUrl = await fetchAsDataUrl(remote.url);
  await idbPut(key, { ...remote, dataUrl, savedAt: Date.now() });
}

export async function clearAsset(key) {
  const cached = await idbGet(key);
  await idbDelete(key);
  try {
    if (cached?.path) await deleteByPath(cached.path);
    await fbAssetClear(key);
  } catch (e) {
    console.warn("clearAsset remote wipe failed", key, e);
  }
}

