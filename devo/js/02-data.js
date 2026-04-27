/* ---------- LOCAL BIBLE DATA ---------- */
let bibleData = null;

async function fetchBibleData() {
  try {
    const file = VERSION_FILES[currentVersion];
    const response = await fetch(file);
    bibleData = await response.json();
  } catch (err) {
    console.error("Failed to load local Bible JSON:", err);
  }
}

async function switchVersion(ver) {
  if (ver === currentVersion) return;
  currentVersion = ver;
  localStorage.setItem("bibleVersion", ver);

  const vSelect = document.getElementById("versionSelect");
  if (vSelect) vSelect.value = ver;
  _updateVersionPills?.(ver);

  await fetchBibleData();

  // Refresh view
  if (document.querySelector(".summary").style.display === "block") {
    loadPassage();
  } else {
    showDashboard();
  }
}

/* ---------- INDEXEDDB ---------- */
const STORE = "devotions";
const VERSE_STORE = "verses"; // Ensure VERSE_STORE is defined globally

function openDB() {
  // This now replaces both previous openDB functions
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("dudu-devotion-db", 1); // Using the devotion DB name

    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(VERSE_STORE)) {
        db.createObjectStore(VERSE_STORE, { keyPath: "id" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// NEW: Helper to get all devotion entries for dashboard
async function getAllDevotionEntries() {
  const db = await openDB();
  return new Promise((resolve) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

/* ---------- VERSE CACHE (INDEXEDDB) ---------- */
// VERSE_STORE is already defined above

async function getCachedVerses(id) {
  const db = await openDB();
  return new Promise((resolve) => {
    const req = db
      .transaction(VERSE_STORE, "readonly")
      .objectStore(VERSE_STORE)
      .get(id);
    req.onsuccess = () => resolve(req.result?.verses || null);
  });
}

async function saveCachedVerses(id, verses) {
  const db = await openDB();
  const tx = db.transaction(VERSE_STORE, "readwrite");
  tx.objectStore(VERSE_STORE).put({
    id,
    verses,
    savedAt: Date.now(),
  });
}

function lockAppScroll(lock) {
  const layout = document.querySelector(".layout");
  if (!layout) return;

  layout.style.overflowY = lock ? "hidden" : "auto";
}

async function dbPut(entry) {
  const db = await openDB();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(entry);
}

async function dbGet(id) {
  const db = await openDB();
  return new Promise((resolve) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
  });
}

const bookEl = document.getElementById("book");
const chapterEl = document.getElementById("chapter");
const verseEl = document.getElementById("verse");
const aiContextSummaryEl = document.getElementById("aiContextSummary");

const output = document.getElementById("output");
const passageTitleEl = document.getElementById("passageTitle");
const summaryTitleEl = document.getElementById("summaryTitle");
const summaryEl = document.getElementById("summaryContent");

const loadBtn = document.getElementById("load");
const copyNotesBtn = document.getElementById("copyNotesBtn");
copyNotesBtn.style.display = "none";

const homeBtn = document.getElementById("homeBtn");

const notesCopyStatusEl = document.getElementById("notesCopyStatus");
const toggleReflectionBtn = document.getElementById("toggleReflectionBtn");
const toggleModesBtn = document.getElementById("mode-toggle");
let reflectionVisible =
  JSON.parse(localStorage.getItem("reflectionVisible")) ?? false;

function applyReflectionVisibility() {
  // Reflection is now in the Reflect modal — always keep sidebar version hidden
  const el = document.getElementById("aiReflection");
  if (el) el.style.display = "none";
  const btn = document.getElementById("toggleReflectionBtn");
  if (btn) btn.style.display = "none";
}

toggleReflectionBtn.onclick = () => {
  reflectionVisible = !reflectionVisible;
  localStorage.setItem("reflectionVisible", JSON.stringify(reflectionVisible));
  applyReflectionVisibility();
};

let isLightMode = JSON.parse(localStorage.getItem("isLightMode")) || false;

document.body.classList.toggle("light", isLightMode);
updateIcon();

toggleModesBtn.onclick = () => {
  isLightMode = !isLightMode;

  document.body.classList.toggle("light", isLightMode);
  localStorage.setItem("isLightMode", isLightMode);
  updateIcon();
};

// Dashboard theme toggle (next to the menu_book button). Proxies to the
// existing #mode-toggle so all the light-mode logic stays in one place.
const dashThemeBtn = document.getElementById("dashThemeBtn");
if (dashThemeBtn) {
  dashThemeBtn.onclick = () => toggleModesBtn.click();
}

function updateIcon() {
  const next = isLightMode ? "dark_mode" : "light_mode";
  const icon = toggleModesBtn.querySelector("span");
  if (icon) icon.innerText = next;
  // Keep the dashboard theme button's icon in sync.
  const dashIcon = document.querySelector("#dashThemeBtn .material-symbols-outlined");
  if (dashIcon) dashIcon.innerText = next;
}

function saveComments() {
  localStorage.setItem("bibleComments", JSON.stringify(comments));
}

copyNotesBtn.onclick = async () => {
  const bookName = bookEl.options[bookEl.selectedIndex]?.text;
  const chapter = chapterEl.value;
  const single = verseEl.value;

  let title = `${bookName} ${chapter} Notes`;
  if (single) title = `${bookName} ${chapter}:${single} Notes`;

  const lines = [title, ""];

  window.__currentSummaryItems
    .sort((a, b) => a.verseNum - b.verseNum)
    .forEach((item) => {
      const joined = item.list.map((n) => n.text).join("; ");
      lines.push(`v${item.verseNum}: ${joined}`);
    });

  let hasReflections = false;
  const reflectionLines = [];
  const seenReflectionIds = new Set();

  // Scope to the primary reflection container so stray/cached textareas
  // elsewhere in the DOM (e.g. old panels, notes previews) can't duplicate
  // the Q&A list. Also dedupe by id as a belt-and-suspenders guard.
  document
    .querySelectorAll('#aiReflection textarea[id^="reflection-"]')
    .forEach((area, idx) => {
      // Normalize the answer: strip leading/trailing whitespace AND collapse
      // runs of 3+ newlines to a single paragraph break (prevents stray
      // dangling blank lines from sneaking into the clipboard).
      const answer = area.value
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]+\n/g, "\n")
        .trim();
      if (!answer) return;
      if (area.id && seenReflectionIds.has(area.id)) return;
      if (area.id) seenReflectionIds.add(area.id);
      const li = area.closest("li");
      const questionP = li?.querySelector("p");
      const questionText = questionP ? questionP.textContent.trim() : `Question ${idx + 1}`;
      if (reflectionLines.length) reflectionLines.push("");
      reflectionLines.push(`Q: ${questionText}`);
      reflectionLines.push(`A: ${answer}`);
      hasReflections = true;
    });

  if (hasReflections) {
    lines.push("\nGuided Reflection 🙏🏼\n");
    lines.push(...reflectionLines);
  }

  // Drop any trailing blanks from the final output.
  while (lines.length && lines[lines.length - 1].replace(/\s+/g, "") === "") {
    lines.pop();
  }

  await navigator.clipboard.writeText(lines.join("\n"));
  notesCopyStatusEl.textContent = "✅ Notes copied to clipboard";
  setTimeout(() => (notesCopyStatusEl.textContent = ""), 2000);
};

let titleForGemini = "";

async function saveAIToStorage(data) {
  await dbPut({
    id: devotionId(),
    ...data,
    updatedAt: Date.now(),
  });
}

async function loadAIFromStorage() {
  return await dbGet(devotionId());
}

let comments = JSON.parse(localStorage.getItem("bibleComments") || "{}");

// NEW: Favorites store
let favorites = JSON.parse(localStorage.getItem("bibleFavorites") || "{}");

function saveFavorites() {
  localStorage.setItem("bibleFavorites", JSON.stringify(favorites));
}

function isFavorite(key) {
  return !!favorites[key];
}

function toggleFavorite(key) {
  if (favorites[key]) {
    delete favorites[key];
  } else {
    favorites[key] = Date.now();
  }
  saveFavorites();
}

function animateFavorite(verseWrap) {
  const icon = verseWrap.querySelector(".favorite-indicator");
  if (icon) {
    icon.classList.remove("fav-pop");
    void icon.offsetWidth;
    icon.classList.add("fav-pop");
    icon.addEventListener("animationend", () => icon.classList.remove("fav-pop"), { once: true });
  }
  if (isFavorite(verseWrap.querySelector(".favorite-indicator")?.dataset.key)) {
    verseWrap.classList.remove("fav-flash");
    void verseWrap.offsetWidth;
    verseWrap.classList.add("fav-flash");
    verseWrap.addEventListener("animationend", () => verseWrap.classList.remove("fav-flash"), { once: true });
  }
}

// ── TTS — Google Cloud Text-to-Speech ─────────────────────────────────────────
// Server-side synthesis: ~200-400ms per verse vs ~12s for in-browser WASM.
// All verses fire in parallel; full chapter buffers in ~5 seconds.

