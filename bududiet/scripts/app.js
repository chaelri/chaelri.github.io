import { initTabs, switchTab } from "./tabs.js";
import { initAuth } from "./auth.js";
import { state } from "./state.js";

document.addEventListener("DOMContentLoaded", async () => {
  const loadingEl = document.getElementById("auth-loading");

  await initAuth();

  if (!state.user) return;

  loadingEl.classList.add("hidden");

  await switchTab("home");
  initTabs();
});
