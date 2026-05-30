// Firebase Storage wrapper for collaterals — uploads user-supplied images
// (template backgrounds, custom monograms, etc.) to a shared bucket so both
// Charlie and Karla can see the same files across devices.
//
// Project: test-database-55379 (bucket: test-database-55379.firebasestorage.app).
// Path:    collaterals/<key>/<random-name>.<ext>
// Rules:   open read/write (same risk profile as weddingbar's storage).
//
// API:
//   await uploadBlob(key, fileOrBlob)
//     → { url, path, contentType, size }
//   await deleteByPath(path)
//   await fetchAsDataUrl(url)
//     → "data:image/...;base64,..." (used for offline cache + SVG embedding)

import {
  getStorage,
  ref as sRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";

import { getFbApp } from "./firebase-sync.js";

let _storage = null;
function ensureStorage() {
  if (_storage) return _storage;
  _storage = getStorage(getFbApp());
  return _storage;
}

function randomName(file) {
  const ext = (file.name?.split(".").pop() || "bin").toLowerCase().slice(0, 6);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now()}-${rand}.${ext}`;
}

function safeKey(key) {
  // Storage paths can't contain `..`, accept letters, digits, `-`, `_`, `:`, `/`
  return key.replace(/[^a-zA-Z0-9\-_:/]/g, "_");
}

export async function uploadBlob(key, fileOrBlob) {
  const storage = ensureStorage();
  const name = fileOrBlob.name ? randomName(fileOrBlob) : `${Date.now()}.bin`;
  const path = `collaterals/${safeKey(key)}/${name}`;
  const ref = sRef(storage, path);
  const snap = await uploadBytes(ref, fileOrBlob, {
    contentType: fileOrBlob.type || "application/octet-stream",
  });
  const url = await getDownloadURL(ref);
  return {
    url,
    path,
    contentType: snap.metadata.contentType || fileOrBlob.type || "",
    size: snap.metadata.size || fileOrBlob.size || 0,
  };
}

export async function deleteByPath(path) {
  if (!path) return;
  const storage = ensureStorage();
  try {
    await deleteObject(sRef(storage, path));
  } catch (e) {
    // Don't fail callers if the object is already gone or rules block delete.
    console.warn("deleteByPath failed", path, e);
  }
}

// Convert a Storage download URL → data URL (for SVG <image> embedding +
// IndexedDB cache). Streams through fetch + FileReader, no canvas hop.
export async function fetchAsDataUrl(url) {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
