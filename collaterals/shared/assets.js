// Tiny IndexedDB store for user-uploaded image assets (floral strips, custom
// monograms, etc.). Stored as data URLs so they embed straight into SVG
// <image xlink:href="..."/> tags and survive the canvas serialize → PNG path.
//
// Use:
//   await saveAsset("name-cards:floral", file);
//   const dataUrl = await getAsset("name-cards:floral");
//   await clearAsset("name-cards:floral");

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

export async function saveAsset(key, fileOrDataUrl) {
  const dataUrl = typeof fileOrDataUrl === "string"
    ? fileOrDataUrl
    : await fileToDataURL(fileOrDataUrl);
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ dataUrl, savedAt: Date.now() }, key);
    tx.oncomplete = () => res(dataUrl);
    tx.onerror = () => rej(tx.error);
  });
}

export async function getAsset(key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => res(req.result?.dataUrl || null);
    req.onerror = () => rej(req.error);
  });
}

export async function clearAsset(key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

