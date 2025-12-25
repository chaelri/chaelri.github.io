import { initTabs, switchTab } from "./tabs.js";
import { initAuth } from "./auth.js";
import { state } from "./state.js";

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

  loadingEl.classList.add("hidden");

  initTabs();
  await switchTab("home");
});
