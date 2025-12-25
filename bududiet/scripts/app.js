import { initTabs, switchTab } from "./tabs.js";
import { state, restoreToday } from "./state.js";
import { initFirebase, getFirebaseApp, getDB } from "./sync/firebase.js";
import { initAuth, startLogin } from "./auth.js";
import {
  ref,
  set,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// 🔐 Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBdaiwTZH_dq8tP2XPSTEazOrgPacM1lYA",
  authDomain: "budu-diet.firebaseapp.com",
  databaseURL:
    "https://budu-diet-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "budu-diet",
  storageBucket: "budu-diet.appspot.com",
  messagingSenderId: "80406735414",
  appId: "1:80406735414:web:98d96d87ea440d666ec697",
};

document.addEventListener("DOMContentLoaded", async () => {
  const loadingEl = document.getElementById("auth-loading");

  // 1️⃣ Init Firebase (no auth yet)
  initFirebase(firebaseConfig);

  // 2️⃣ Check auth state ONLY (no redirects here)
  try {
    await initAuth(getFirebaseApp());
  } catch (e) {
    // 🔐 Not logged in yet → start redirect ONCE
    if (e.message === "NO_AUTH") {
      startLogin();
      return;
    }

    // ❌ Logged in but not allowed
    loadingEl.classList.add("hidden");
    document.body.innerHTML = `
      <div style="padding:32px;text-align:center">
        <h2>🚫 Access denied</h2>
        <p>This app is private.</p>
      </div>
    `;
    return;
  }

  // ✅ AUTH CONFIRMED HERE (uid is guaranteed)
  const db = getDB();

  // (TEMP sanity write – you may remove later)
  await set(ref(db, `users/${state.user.uid}/meta`), {
    email: state.user.email,
    createdAt: Date.now(),
  });

  // Restore local state
  restoreToday();

  // Boot UI
  loadingEl.classList.add("hidden");
  initTabs();
  await switchTab("home");
});
