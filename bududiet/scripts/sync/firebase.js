import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import {
  getAuth,
  signInWithCredential,
  GoogleAuthProvider,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let app = null;
let db = null;
let auth = null;

export function initFirebase(firebaseConfig) {
  if (app) return { app, db, auth };

  app = initializeApp(firebaseConfig);
  db = getDatabase(app);
  auth = getAuth(app);

  return { app, db, auth };
}

/**
 * Bridge GIS → Firebase Auth
 * @param {string} idToken - Google ID token from GIS
 */
export async function signInFirebaseWithGoogle(idToken) {
  if (!auth) throw new Error("Firebase not initialized");

  const credential = GoogleAuthProvider.credential(idToken);
  return signInWithCredential(auth, credential);
}

export function getDB() {
  if (!db) throw new Error("Firebase not initialized");
  return db;
}

export function getFirebaseAuth() {
  if (!auth) throw new Error("Firebase not initialized");
  return auth;
}
