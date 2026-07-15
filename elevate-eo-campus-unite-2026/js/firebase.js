// Shared Firebase init + auth helpers.
// v9 modular SDK loaded direct from gstatic (same pattern as weddingbar/).
// Project: test-database-55379 (asia-southeast1) — shared with autoclicker, aircon, tayo, echoes, weddingbar.

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import {
  getDatabase, ref, onValue, get, set, update, push, child, off,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, signInAnonymously, onAuthStateChanged,
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

// Named Firebase app so this site has its own isolated auth persistence slot.
// Sibling apps on chaelri.github.io (autoclicker, weddingbar, aircon, tayo, echoes)
// share the same Firebase project + origin. If we used the default app name,
// their anonymous sign-ins would overwrite our Google admin session and we'd
// keep getting bumped back to a "?" anonymous pill on reload.
export const app = initializeApp(firebaseConfig, "elevate-eo-campus-unite-2026");
export const db = getDatabase(app);
export const auth = getAuth(app);

// Re-export the bits each page needs so callers don't import from gstatic.
export { ref, onValue, get, set, update, push, child, off };
export { GoogleAuthProvider, signInWithPopup, signOut, signInAnonymously, onAuthStateChanged };

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
export function checkinLogRef() { return ref(db, `${SCHEMA_ROOT}/checkinLog`); }
export function interestsRef() { return ref(db, `${SCHEMA_ROOT}/interests`); }
export function interestRef(id) { return ref(db, `${SCHEMA_ROOT}/interests/${id}`); }

// =============================
// Admin allowlist (Google sign-in)
// =============================
// Add emails here to grant dashboard / print / raffle access.
export const ALLOWED_ADMINS = [
  "charliecayno@gmail.com",
  "maui.victorio@ccf.org.ph",
  "christian.ilao@ccf.org.ph",
  "kobe.serrano@cm.ccf.org.ph",
  "jharmaine4@gmail.com",
  "angelica.macalalad@ccf.org.ph",
  "anggemacalalad@gmail.com",
  "serranokobe1@gmail.com",
  "ilao.christian.gonzales@gmail.com",
  "ilaomauirochell@gmail.com",
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

// Ensure the page has *some* auth identity before doing RTDB reads/writes.
// register.html (public) uses this so locked-down security rules can require
// `auth != null` without forcing students through a Google sign-in flow.
// Resolves once an auth user (anonymous OR existing Google) is present.
export function ensureAnonAuth() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) { unsub(); resolve(user); }
    });
    signInAnonymously(auth).catch((err) => { unsub(); reject(err); });
  });
}

// Subscribe to auth state. Callback gets { user, isAdmin }.
// Anonymous users (signed in by sibling apps sharing this Firebase project —
// autoclicker, weddingbar, etc.) are reported as null so they never render in
// the admin auth pill. This app only cares about Google sign-ins.
export function watchAuth(cb) {
  return onAuthStateChanged(auth, (user) => {
    const realUser = user && !user.isAnonymous ? user : null;
    cb({
      user: realUser,
      isAdmin: !!realUser && isAdminEmail((realUser.email || "").toLowerCase()),
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
