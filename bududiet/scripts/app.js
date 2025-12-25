// scripts/app.js
import { initTabs, switchTab } from "./tabs.js";
import { state } from "./state.js";
import { initFirebase, getDB } from "./sync/firebase.js";
import { initAuth } from "./auth.js";
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

  // ⏳ WAIT — DO NOT DENY
  await initAuth();

  console.log("[BOOT] logged in as", state.user.email);

  const db = getDB();
  await set(ref(db, `users/${state.user.uid}/meta`), {
    email: state.user.email,
    createdAt: Date.now(),
  });

  const realtime = await import("./sync/realtime.js");
  realtime.initRealtimeSync();

  loadingEl.classList.add("hidden");
  initTabs();
  await switchTab("home");
});
