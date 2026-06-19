// Shared Firebase init + auth helpers.
// v9 modular SDK loaded direct from gstatic (same pattern as weddingbar/).
// Project: test-database-55379 (asia-southeast1) — shared with autoclicker, aircon, tayo, echoes, weddingbar.

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import {
  getDatabase, ref, onValue, get, set, update, push, child, off,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB8ahT56WbEUaGAymsRNNA-DrfZnUnWIwk",
  authDomain: "test-database-55379.firebaseapp.com",
  databaseURL:
    "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "test-database-55379",
  storageBucket: "test-database-55379.firebasestorage.app",
  messagingSenderId: "933688602756",
  appId: "1:933688602756:web:392a3a4ce040cb9d4452d1",
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

// Re-export the bits each page needs so callers don't import from gstatic.
export { ref, onValue, get, set, update, push, child, off };
export { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged };

// =============================
// Project-scoped paths
// =============================
export const SCHEMA_ROOT = "elevate-eo-campus-unite-2026";
export const TICKET_COUNT = 1000;
export const TICKET_PREFIX = "ECU";

export function ticketId(n) {
  return `${TICKET_PREFIX}-${String(n).padStart(4, "0")}`;
}

export function ticketsRef() { return ref(db, `${SCHEMA_ROOT}/tickets`); }
export function ticketRef(id) { return ref(db, `${SCHEMA_ROOT}/tickets/${id}`); }
export function registrationsRef() { return ref(db, `${SCHEMA_ROOT}/registrations`); }
export function registrationRef(id) { return ref(db, `${SCHEMA_ROOT}/registrations/${id}`); }
export function raffleDrawsRef() { return ref(db, `${SCHEMA_ROOT}/raffle/draws`); }
export function raffleLastDrawRef() { return ref(db, `${SCHEMA_ROOT}/raffle/lastDraw`); }

// =============================
// Admin allowlist (Google sign-in)
// =============================
// Add emails here to grant dashboard / print / raffle access.
export const ALLOWED_ADMINS = [
  "charliecayno@gmail.com",
];

export function isAdminEmail(email) {
  return !!email && ALLOWED_ADMINS.includes(email.toLowerCase());
}

// =============================
// Auth helpers
// =============================
export function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}

export function signOutNow() {
  return signOut(auth);
}

// Subscribe to auth state. Callback gets { user, isAdmin }.
export function watchAuth(cb) {
  return onAuthStateChanged(auth, (user) => {
    cb({
      user: user || null,
      isAdmin: !!user && isAdminEmail((user.email || "").toLowerCase()),
    });
  });
}

// =============================
// URL helpers
// =============================
// The public URL a QR sticker should encode. Uses current origin + path so it works
// in dev (file://, localhost) and prod (chaelri.github.io/elevate-campus-unite-2026/).
export function registrationUrl(id) {
  const base = new URL("register.html", window.location.href);
  base.searchParams.set("id", id);
  return base.toString();
}
