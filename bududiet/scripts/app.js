import { initTabs, switchTab } from "./tabs.js";
import { initAuth } from "./auth.js";
import { state, restoreToday } from "./state.js";
import { initFirebase } from "./sync/firebase.js";

// 🔐 Firebase config (CDN-safe)
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

  try {
    await initAuth();
  } catch (e) {
    loadingEl.classList.add("hidden");
    document.body.innerHTML = `
      <div style="padding:32px;text-align:center">
        <h2>🚫 Access denied</h2>
        <p>This app is private.</p>
      </div>
    `;
    return;
  }

  if (!state.user) return;

  // ✅ Firebase init AFTER auth (correct)
  initFirebase(firebaseConfig);

  // Restore local state
  restoreToday();

  loadingEl.classList.add("hidden");

  initTabs();
  await switchTab("home");
});
