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
showDashboard(); // Changed from showLanding()
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
