import { initTabs, switchTab } from "./tabs.js";
import { initAuth } from "./auth.js";
import { state } from "./state.js";

document.addEventListener("DOMContentLoaded", async () => {
  await initAuth();

  if (!state.user) return; // HARD FAIL

  await switchTab("home");
  initTabs();
});
