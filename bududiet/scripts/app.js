import { initTabs, switchTab } from "./tabs.js";

document.addEventListener("DOMContentLoaded", async () => {
  await switchTab("home");
  initTabs();
});
