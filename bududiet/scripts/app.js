// scripts/app.js
import { initTabs, switchTab } from "./tabs.js";
import { state, restoreToday } from "./state.js";
import { initFirebase, getFirebaseApp, getDB } from "./sync/firebase.js";
import { initAuth, login } from "./auth.js";
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

  // 1️⃣ Init Firebase once
  initFirebase(firebaseConfig);

  // 2️⃣ Auth gate
  try {
    await initAuth(getFirebaseApp());
  } catch (e) {
    // 🔐 Not logged in → show login overlay
    if (e.message === "NO_AUTH") {
      loadingEl.classList.add("hidden");
      showLoginOverlay();
      return;
    }

    // ❌ Unauthorized user
    loadingEl.classList.add("hidden");
    document.body.innerHTML = `
      <div style="padding:32px;text-align:center">
        <h2>🚫 Access denied</h2>
        <p>This app is private.</p>
      </div>
    `;
    return;
  }

  // ✅ AUTH CONFIRMED HERE

  // Remove login overlay if it exists
  const overlay = document.getElementById("login-overlay");
  if (overlay) overlay.remove();

  // 3️⃣ Optional sanity write (safe to remove later)
  const db = getDB();
  await set(ref(db, `users/${state.user.uid}/meta`), {
    email: state.user.email,
    lastSeen: Date.now(),
  });

  // 4️⃣ Restore local app state
  restoreToday();

  // 5️⃣ Boot UI
  loadingEl.classList.add("hidden");
  initTabs();
  await switchTab("home");
});

/* ---------------------------
   Login Overlay UI
---------------------------- */
function showLoginOverlay() {
  if (document.getElementById("login-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "login-overlay";
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(circle at top, #121b33, #0b1220);
  `;

  overlay.innerHTML = `
    <div style="text-align:center">
      <h1 style="margin-bottom:16px">Budu Diet</h1>
      <button
        id="loginBtn"
        style="
          padding:14px 24px;
          font-size:16px;
          border-radius:999px;
          border:none;
          background:linear-gradient(135deg,#4f8cff,#6fd1ff);
          color:#fff;
          cursor:pointer;
        "
      >
        Continue with Google
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById("loginBtn").onclick = () => {
    login(); // 🔥 redirect happens here
  };
}
