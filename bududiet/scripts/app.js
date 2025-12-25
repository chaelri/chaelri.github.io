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
  initFirebase(firebaseConfig);

  // 🔐 Local profile selection
  if (!initLocalAuth()) {
    showPicker();
    return;
  }

  await boot();
});

async function boot() {
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
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center">
      <div class="glass pad-lg" style="text-align:center">
        <h2>Who are you?</h2>
        <button id="charlie" class="glass pad-md">🟦 Charlie</button>
        <div class="space-sm"></div>
        <button id="karla" class="glass pad-md">🟪 Karla</button>
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
