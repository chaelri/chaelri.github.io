// ─────────────────────────────────────────────────────────────────────────────
// 11-boot.js — Final bootstrap. Loads LAST in the chunk chain.
//
// All other chunks (01–10) only DEFINE functions and globals; this file is the
// one that fires the cross-file kickoff calls. Doing it here guarantees every
// referenced function is already in the script-global scope, so chains like
// showDashboard() → stopTTS() → ttsImmersiveClose() resolve cleanly across
// files instead of hitting "X is not defined" during early script execution.
// ─────────────────────────────────────────────────────────────────────────────

/* ---------- INIT ---------- */
fetchBibleData(); // Load the JSON file on startup
loadBooks();
const _dashboardBoot = showDashboard(); // Changed from showLanding()
updateControlStates();

// Restore last-read passage selection. Must run AFTER loadBooks() — that's
// what populates #book with <option> elements; setting bookEl.value before
// then is a no-op and would leave loadChapters() reading BIBLE_META[""].
if (recentPassageId) {
  const recentPassageSplit = recentPassageId.split("-");
  bookEl.value = recentPassageSplit[0];
  loadChapters();
  chapterEl.value = recentPassageSplit[1];
}

// _onAppLoad lives in 05-render-init.js. We trigger it here because it calls
// initNotesApp, which is defined in 06-notes.js — both chunks are loaded by
// the time 11-boot.js executes.
if (document.readyState === "complete") _onAppLoad();
else window.addEventListener("load", _onAppLoad);

// ── Splash gating ────────────────────────────────────────────────────────────
// The splash loops its own idle animation while the dashboard builds itself in
// the background; we only tear it down once the dashboard is genuinely filled
// in (Bible JSON parsed, dashboard DOM rendered, AI greeting + continue-recap
// settled, web fonts resolved).
//
//   MIN — the brand moment is never a subliminal flash on a warm cache.
//   MAX — hard ceiling so a dead network can't strand the user on the splash.
//         Past it we reveal the dashboard and let its own in-card loaders
//         finish the job.
const SPLASH_MIN_MS = 1200;
const SPLASH_MAX_MS = 7000;
const _splashStart = Date.now();

(async () => {
  const deadline = new Promise((r) => setTimeout(r, SPLASH_MAX_MS));
  try {
    // showDashboard() awaits fetchBibleData() + renderDashboard(); renderDashboard
    // publishes window.__dashboardReady before it resolves.
    await Promise.race([_dashboardBoot, deadline]);
    await Promise.race([window.__dashboardReady || Promise.resolve(), deadline]);
  } catch (err) {
    console.warn("[boot] dashboard preload failed — revealing anyway", err);
  }
  const elapsed = Date.now() - _splashStart;
  if (elapsed < SPLASH_MIN_MS) {
    await new Promise((r) => setTimeout(r, SPLASH_MIN_MS - elapsed));
  }
  _hideSplash();
})();
