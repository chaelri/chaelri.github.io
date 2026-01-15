const DB_NAME_DEVOTION = "dudu-devotion-db";
const STORE_DEVOTIONS = "devotions";

function openDevotionDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME_DEVOTION, 1);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_DEVOTIONS)) {
        db.createObjectStore(STORE_DEVOTIONS, { keyPath: "id" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function dbPut(entry) {
  const db = await openDevotionDB();
  const tx = db.transaction(STORE_DEVOTIONS, "readwrite");
  tx.objectStore(STORE_DEVOTIONS).put(entry);
}

export async function dbGet(id) {
  const db = await openDevotionDB();
  return new Promise((resolve) => {
    const req = db.transaction(STORE_DEVOTIONS, "readonly").objectStore(STORE_DEVOTIONS).get(id);
    req.onsuccess = () => resolve(req.result || null);
  });
}

// NOTE: Verse caching IndexedDB is excluded to keep it simpler, as the local JSON load is fast.