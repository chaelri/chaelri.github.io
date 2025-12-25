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
  } catch (e) {
    if (e.message === "NO_AUTH") {
      loadingEl.classList.add("hidden");

      // 🔥 SHOW LOGIN UI (NO AUTO REDIRECT)
      loadingEl.classList.add("hidden");

      const login = document.createElement("div");
      login.innerHTML = `
        <div style="padding:32px;text-align:center">
            <h2>Budu Diet</h2>
            <button id="loginBtn">Continue with Google</button>
        </div>
        `;

      document.body.appendChild(login);

      document.getElementById("loginBtn").onclick = () => login();

      return;
    }

    document.body.innerHTML = "<h2>🚫 Access denied</h2>";
    return;
  }

  // ✅ AUTH OK
  const db = getDB();
  await set(ref(db, `users/${state.user.uid}/meta`), {
    email: state.user.email,
    createdAt: Date.now(),
  });

  restoreToday();

  loadingEl.classList.add("hidden");
  initTabs();
  await switchTab("home");
});
