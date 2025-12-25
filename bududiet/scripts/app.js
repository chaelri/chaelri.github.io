// scripts/app.js
import { initTabs, switchTab } from "./tabs.js";
import { state, restoreToday } from "./state.js";
import { initFirebase, getFirebaseApp, getDB } from "./sync/firebase.js";
import { initAuth, login } from "./auth.js";
import {
  ref,
  set,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

  initFirebase(firebaseConfig);

  try {
    await initAuth(getFirebaseApp());
  } catch {
    document.body.innerHTML = "<h2>🚫 Access denied</h2>";
    return;
  }

  // 🔐 If NOT logged in → show login screen
  if (!state.user) {
    loadingEl.classList.add("hidden");
    showLogin();
    return;
  }

  // ✅ Logged in → boot app
  const db = getDB();
  await set(ref(db, `users/${state.user.uid}/meta`), {
    email: state.user.email,
    lastSeen: Date.now(),
  });

  restoreToday();
  loadingEl.classList.add("hidden");
  initTabs();
  await switchTab("home");
});

function showLogin() {
  document.body.innerHTML = `
    <div style="
      height:100vh;
      display:flex;
      flex-direction:column;
      justify-content:center;
      align-items:center;
      background:radial-gradient(circle at top,#121b33,#0b1220);
    ">
      <h1>Budu Diet</h1>
      <button id="loginBtn" style="padding:14px 24px;font-size:16px">
        Continue with Google
      </button>
    </div>
  `;

  document.getElementById("loginBtn").onclick = () => login();
}
