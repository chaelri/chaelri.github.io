// scripts/app.js
import { initTabs, switchTab } from "./tabs.js";
import { state } from "./state.js";
import { initFirebase, getDB } from "./sync/firebase.js";
import { initLocalAuth, selectUser } from "./localAuth.js";
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
  // Init Firebase FIRST
  initFirebase(firebaseConfig);

  // 🔐 Local profile selection
  if (!initLocalAuth()) {
    hideLoading();
    showPicker();
    return;
  }

  await boot();
});

async function boot() {
  hideLoading();

  const db = getDB();

  await set(ref(db, `users/${state.user.uid}/meta`), {
    name: state.user.name,
    createdAt: Date.now(),
  });

  const realtime = await import("./sync/realtime.js");
  realtime.initRealtimeSync();

  initTabs();
  await switchTab("home");
}

function showPicker() {
  document.body.innerHTML = `
  <div class="local-auth-root">
    <div class="local-auth-card">
      <h2>Who are you?</h2>

      <button id="charlie" class="local-auth-btn charlie">
        <span class="local-auth-avatar">C</span>
        Charlie
      </button>

      <button id="karla" class="local-auth-btn karla">
        <span class="local-auth-avatar">K</span>
        Karla
      </button>
    </div>
  </div>
`;

  document.getElementById("charlie").onclick = () => {
    selectUser("Charlie");
    location.reload();
  };

  document.getElementById("karla").onclick = () => {
    selectUser("Karla");
    location.reload();
  };
}

function hideLoading() {
  const el = document.getElementById("auth-loading");
  if (el) el.classList.add("hidden");
}
