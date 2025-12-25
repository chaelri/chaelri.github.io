// scripts/sync/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

let app = null;
let db = null;

export function initFirebase(firebaseConfig) {
  if (app) return { app, db };

  app = initializeApp(firebaseConfig);
  db = getDatabase(app);

  return { app, db };
}

export function getDB() {
  if (!db) {
    throw new Error("Firebase not initialized");
  }
  return db;
}
