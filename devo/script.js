const FAV_PAGE_SIZE = 5;
let favoritesPage = 0;
let currentVersion = localStorage.getItem("bibleVersion") || "NASB";
let recentPassageId = localStorage.getItem("recentPassageId");
let recentPassage = localStorage.getItem("recentPassage");
let verseChatHistories = {};

const VERSION_FILES = {
  NASB: "nasb2020.json",
  EASY: "easy2024.json",
};

/* ---------- MODAL HANDLING ---------- */
const modalOverlay = document.getElementById("modalOverlay");
const modalClose = document.getElementById("modalClose");
const modalContent = document.getElementById("modalContent");

if (modalClose) {
  modalClose.onclick = () => {
    modalOverlay.hidden = true;
  };
}

if (modalOverlay) {
  modalOverlay.onclick = (e) => {
    if (e.target === modalOverlay) modalOverlay.hidden = true;
  };
}

async function openStrongModal(strongNum, contextText) {
  if (!modalOverlay || !modalContent) return;

  modalOverlay.hidden = false;
  modalContent.innerHTML = `
    <div class="inline-ai-loading">
      <div class="inline-ai-spinner"></div>
      <span>Finding cross-references for ${strongNum}…</span>
    </div>
  `;

  // Parse contextText: "English Word — Original (transliteration) [Strong's]"
  const parts = contextText.split(" — ");
  const englishWord = parts[0]?.trim() || "";
  const originalPart = parts[1] || contextText;
  const wordMatch = originalPart.match(/^([^\(]+)/);
  const originalWord = wordMatch ? wordMatch[1].trim() : "";

  const prompt = `
    TASK: Find 5 cross-references for Strong's ${strongNum} (${englishWord} / ${originalWord}).
    
    OUTPUT FORMAT (STRICT):
    - RAW HTML ONLY
    - NO code blocks, backticks, or "html" labels
    - ONE outer <div>
    - Format per entry:
      <div class="cross-ref-item">
        <span class="cross-ref-ref">Book Chapter:Verse</span>
        <p class="cross-ref-text">Verse text with **${englishWord}** or **${originalWord}** BOLDED (use <strong> tag)</p>
        <p style="font-size:12px; opacity:0.8; margin-top:4px;">* Taglish explanation of usage.</p>
      </div>

    RULES:
    - BE FAST: Keep verses short.
    - HIGHLIGHT: You MUST bold the translated word in the verse text using <strong>.
    - LANGUAGE: Taglish explanation.
  `;

  try {
    const res = await fetch(
      "https://gemini-proxy-668755364170.asia-southeast1.run.app",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "summary",
          contents: [{ parts: [{ text: prompt }] }],
        }),
      },
    );

    const data = await res.json();
    modalContent.innerHTML = `
      <h3 style="margin:0 0 4px; font-size:20px;">${englishWord}</h3>
      <div style="opacity:0.6; font-size:14px; margin-bottom:20px;">
        ${originalWord} [${strongNum}] • Cross-references & Usage
      </div>
      ${
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        "No references found."
      }
    `;
  } catch (err) {
    modalContent.innerHTML = "Failed to load cross-references.";
  }
}

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
  const el = document.getElementById("aiReflection");
  if (!el) return;

  el.style.display = reflectionVisible ? "block" : "none";
  toggleReflectionBtn.textContent = reflectionVisible
    ? "🙏 Hide Guided Reflection"
    : "🙏 Show Guided Reflection";
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

function updateIcon() {
  const icon = toggleModesBtn.querySelector("span");
  icon.innerText = isLightMode ? "dark_mode" : "light_mode";
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

  document.querySelectorAll('textarea[id^="reflection-"]').forEach((area) => {
    const entry = localStorage.getItem(area.id);
    if (entry && area.value.trim() !== "") {
      reflectionLines.push(entry);
      reflectionLines.push(""); // Spacer
      hasReflections = true;
    }
  });

  if (hasReflections) {
    lines.push("\nGuided Reflection 🙏🏼\n");
    lines.push(...reflectionLines);
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

const TTS_VOICE = { languageCode: "en-US", name: "en-US-Journey-D" };
let _ttsReadyCount = 0;

// Semaphore: max 2 concurrent TTS requests to stay under rate limits
const _synthSem = { active: 0, max: 2, queue: [] };
function _synthAcquire() {
  if (_synthSem.active < _synthSem.max) { _synthSem.active++; return Promise.resolve(); }
  return new Promise(resolve => _synthSem.queue.push(resolve));
}
function _synthRelease() {
  _synthSem.active = Math.max(0, _synthSem.active - 1);
  if (_synthSem.queue.length && _synthSem.active < _synthSem.max) {
    _synthSem.active++;
    _synthSem.queue.shift()();
  }
}
function _synthReset() {
  _synthSem.active = 0;
  _synthSem.queue.length = 0; // abandon stale waiters, they'll be GC'd
}

function _escapeSSML(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function _textToSSML(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const body  = words.map((w, i) => `<mark name="w${i}"/>${_escapeSSML(w)}`).join(" ");
  return { ssml: `<speak>${body}</speak>`, words };
}

// ── Word-by-word highlight helpers ───────────────────────────────────────────
let _ttsWordRaf = null;
let _ttsActiveWordItem = null;

function _injectWordSpans(item) {
  if (!item.words?.length || !item.timepoints?.length) return;
  const el = item.el?.querySelector(".verse-content");
  if (!el) return;
  item._originalHTML = el.innerHTML;
  el.innerHTML = item.words.map((w, i) =>
    `<span class="tts-word" data-idx="${i}">${w}</span>`
  ).join(" ");
}

function _restoreVerseText(item) {
  if (!item || item._originalHTML === undefined) return;
  const el = item.el?.querySelector(".verse-content");
  if (el) el.innerHTML = item._originalHTML;
  delete item._originalHTML;
}

function _startWordHighlight(audio, item) {
  if (!item?.timepoints?.length) return;
  const el = item.el?.querySelector(".verse-content");
  if (!el) return;
  const pts = item.timepoints;
  function tick() {
    const t = audio.currentTime;
    let wi = -1;
    for (let i = 0; i < pts.length; i++) {
      if (pts[i].timeSeconds <= t) wi = i; else break;
    }
    el.querySelectorAll(".tts-word").forEach((s, i) =>
      s.classList.toggle("tts-word-active", i === wi)
    );
    if (!audio.paused && !audio.ended) _ttsWordRaf = requestAnimationFrame(tick);
  }
  _ttsWordRaf = requestAnimationFrame(tick);
}

function _stopWordHighlight() {
  if (_ttsWordRaf) { cancelAnimationFrame(_ttsWordRaf); _ttsWordRaf = null; }
}

async function ttsSynthesize(text, retries = 10) {
  const key = window.GOOGLE_TTS_KEY || localStorage.getItem("googleTtsKey");
  if (!key) throw new Error("no-key");

  const words = text.split(/\s+/).filter(Boolean);

  await _synthAcquire();
  try {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const resp = await fetch(
          `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              input: { text },
              voice: TTS_VOICE,
              audioConfig: { audioEncoding: "MP3" },
            }),
          }
        );

        if (resp.status === 401 || resp.status === 403) throw new Error("auth");
        if (resp.status === 429) throw new Error("rate-limit");
        if (!resp.ok) throw new Error(`api-${resp.status}`);

        const { audioContent } = await resp.json();
        const bytes = Uint8Array.from(atob(audioContent), c => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
        return { url, timepoints: [], words };
      } catch (err) {
        if (err.message === "auth" || err.message === "no-key") throw err;
        if (attempt < retries - 1) {
          const base = err.message === "rate-limit" ? 3000 : 800;
          const delay = Math.min(base * Math.pow(1.8, attempt), 30000) + Math.random() * 1500;
          await new Promise(r => setTimeout(r, delay));
        } else {
          throw err;
        }
      }
    }
  } finally {
    _synthRelease();
  }
}

function ttsGetOrPromptKey() {
  return !!(window.GOOGLE_TTS_KEY || localStorage.getItem("googleTtsKey"));
}

// ── Playback state ───────────────────────────────────────────────────────────
let ttsGen = 0;
let ttsQueue = [];   // [{el, verseNum, text, url, ready}]
let ttsIdx = -1;
let ttsAudio = null;
let ttsPaused = false;

// ── Immersive mode state (declared here so stopTTS can reference before the immersive block) ──
let _immDoubleTapCount = 0;
let _immDoubleTapTimer = null;
let _immReflIndex = 0;

function ttsBuildQueue() {
  const els = [...document.querySelectorAll("#output .verse")];
  const lines = (window.__aiPayload?.versesText || "").split("\n").filter(Boolean);
  return els.map((el, i) => ({
    el,
    verseNum: el.querySelector(".verse-num")?.textContent?.trim() || String(i + 1),
    text: (lines[i] || "").replace(/^\d[\d\-]*\.\s*/, "").trim(),
    url: null,
    ready: null,
  }));
}

async function playChapter() {
  if (!ttsGetOrPromptKey()) return;

  ttsGen++;
  const gen = ttsGen;

  const pauseBtn = document.getElementById("ttsPauseBtn");
  if (pauseBtn) pauseBtn.innerHTML = '<span class="material-symbols-outlined">pause</span>';

  ttsQueue = ttsBuildQueue();
  ttsIdx = -1;
  if (!ttsQueue.length) return;

  const playBtn = document.getElementById("ttsPlayBtn");
  if (playBtn) playBtn.disabled = true;
  ttsShowPlayer("Starting\u2026");
  document.getElementById("output")?.classList.add("tts-mode");

  _ttsReadyCount = 0;
  const bar = document.getElementById("ttsProgressBar");
  if (bar) bar.style.width = "0%";

  for (const item of ttsQueue) {
    item.ready = ttsSynthesize(item.text).then(
      ({ url, timepoints, words }) => {
        item.url = url;
        item.timepoints = timepoints;
        item.words = words;
        _ttsReadyCount++;
        if (gen === ttsGen && bar) {
          const pct = `${(_ttsReadyCount / ttsQueue.length) * 100}%`;
          bar.style.width = pct;
          const immBar = document.getElementById("ttsImmLoadBar");
          if (immBar) immBar.style.width = pct;
          if (_ttsReadyCount === ttsQueue.length)
            document.getElementById("ttsPlayer")?.classList.add("tts-ready");
        }
      },
      () => { item.url = null; }
    );
  }

  await ttsPlayAt(0, gen);
}

async function ttsPlayAt(index, gen) {
  if (gen !== ttsGen) return;
  if (index < 0 || index >= ttsQueue.length) {
    if (gen === ttsGen) ttsFinish();
    return;
  }

  ttsIdx = index;
  const item = ttsQueue[index];

  if (ttsAudio) { ttsAudio.onended = null; ttsAudio.pause(); ttsAudio = null; }

  // Reset pause btn in case it was repurposed as a retry button
  const pauseBtn = document.getElementById("ttsPauseBtn");
  if (pauseBtn) { pauseBtn.innerHTML = '<span class="material-symbols-outlined">pause</span>'; pauseBtn.onclick = pauseResumeTTS; }

  // Ensure tts-mode is on #output regardless of how ttsPlayAt was reached
  // (e.g. navigating back during the continue prompt removes tts-mode via ttsFinish)
  document.getElementById("output")?.classList.add("tts-mode");
  ttsMark(item.el);
  ttsImmersiveUpdate(index);
  ttsSetStatus(`Loading ${item.verseNum}\u2026`);
  document.getElementById("ttsPlayer")?.classList.add("tts-buffering");

  try {
    await item.ready;           // instant if already synthesised, else wait
    if (gen !== ttsGen) return;
    if (!item.url) throw new Error("synthesis failed");

    document.getElementById("ttsPlayer")?.classList.remove("tts-buffering");

    // Restore previous verse text, inject word spans for this verse
    _stopWordHighlight();
    _restoreVerseText(_ttsActiveWordItem);
    _injectWordSpans(item);
    _ttsActiveWordItem = item;

    ttsAudio = new Audio(item.url);
    ttsPaused = false;
    await ttsAudio.play();
    if (gen !== ttsGen) { ttsAudio.pause(); return; }

    _startWordHighlight(ttsAudio, item);
    ttsSetStatus(`${ttsIcon("graphic_eq")} ${item.verseNum} / ${ttsQueue.length}`);
    ttsNavUpdate();

    ttsAudio.onended = () => {
      if (!ttsPaused && gen === ttsGen) ttsPlayAt(index + 1, gen);
    };
  } catch (err) {
    if (gen !== ttsGen) return;
    console.error("TTS", err);
    _stopWordHighlight();
    document.getElementById("ttsPlayer")?.classList.remove("tts-buffering");
    ttsSetStatus(`${ttsIcon("warning")} Verse ${item.verseNum} failed`);

    // Repurpose pause button as a single-verse retry
    const pauseBtn = document.getElementById("ttsPauseBtn");
    const immPauseBtn = document.getElementById("ttsImmPauseBtn");
    const retryIcon = '<span class="material-symbols-outlined">refresh</span>';
    const retryHandler = () => {
      if (pauseBtn) { pauseBtn.innerHTML = '<span class="material-symbols-outlined">pause</span>'; pauseBtn.onclick = pauseResumeTTS; }
      if (immPauseBtn) { immPauseBtn.innerHTML = '<span class="material-symbols-outlined">pause</span>'; immPauseBtn.onclick = pauseResumeTTS; }
      item.url = null;
      item.ready = ttsSynthesize(item.text).then(
        ({ url, timepoints, words }) => { item.url = url; item.timepoints = timepoints; item.words = words; },
        () => { item.url = null; }
      );
      ttsPlayAt(index, gen);
    };
    if (pauseBtn) { pauseBtn.innerHTML = retryIcon; pauseBtn.onclick = retryHandler; }
    if (immPauseBtn) { immPauseBtn.innerHTML = retryIcon; immPauseBtn.onclick = retryHandler; }
  }
}

function ttsMark(el) {
  document.querySelectorAll("#output .verse.tts-active").forEach(v => v.classList.remove("tts-active"));
  document.querySelectorAll("#output .verse-header.verse-highlight").forEach(v => v.classList.remove("verse-highlight"));
  if (!el) return;
  el.classList.add("tts-active");
  const hdr = el.querySelector(".verse-header");
  if (hdr) { void hdr.offsetWidth; hdr.classList.add("verse-highlight"); }
  const layout = document.querySelector(".layout");
  if (layout) {
    layout.scrollTo({
      top: el.getBoundingClientRect().top - layout.getBoundingClientRect().top + layout.scrollTop - 120,
      behavior: "smooth",
    });
  }
}

function pauseResumeTTS() {
  if (!ttsAudio) return;
  const btn = document.getElementById("ttsPauseBtn");
  const immBtn = document.getElementById("ttsImmPauseBtn");
  if (ttsPaused) {
    ttsAudio.play(); ttsPaused = false;
    if (btn) btn.innerHTML = '<span class="material-symbols-outlined">pause</span>';
    if (immBtn) immBtn.innerHTML = '<span class="material-symbols-outlined">pause</span>';
    ttsSetStatus(`${ttsIcon("graphic_eq")} ${ttsQueue[ttsIdx]?.verseNum} / ${ttsQueue.length}`);
    _startWordHighlight(ttsAudio, _ttsActiveWordItem);
  } else {
    ttsAudio.pause(); ttsPaused = true;
    _stopWordHighlight();
    if (btn) btn.innerHTML = '<span class="material-symbols-outlined">play_arrow</span>';
    if (immBtn) immBtn.innerHTML = '<span class="material-symbols-outlined">play_arrow</span>';
    ttsSetStatus(`${ttsIcon("pause")} Verse ${ttsQueue[ttsIdx]?.verseNum}`);
  }
}

function ttsPrevVerse() {
  if (ttsIdx <= 0) return;
  ttsGen++;
  if (ttsAudio) { ttsAudio.onended = null; ttsAudio.pause(); ttsAudio = null; }
  ttsPlayAt(ttsIdx - 1, ttsGen);
}

function ttsNextVerse() {
  if (ttsIdx >= ttsQueue.length - 1) return;
  ttsGen++;
  if (ttsAudio) { ttsAudio.onended = null; ttsAudio.pause(); ttsAudio = null; }
  ttsPlayAt(ttsIdx + 1, ttsGen);
}

function _ttsCleanupMode() {
  _stopWordHighlight();
  _restoreVerseText(_ttsActiveWordItem);
  _ttsActiveWordItem = null;
  document.getElementById("output")?.classList.remove("tts-mode");
}

function stopTTS() {
  ttsGen++;
  _synthReset();
  _ttsCleanupMode();
  if (ttsAudio) { ttsAudio.onended = null; ttsAudio.pause(); ttsAudio = null; }
  ttsQueue = []; ttsIdx = -1; ttsPaused = false;
  document.querySelectorAll("#output .verse.tts-active").forEach(v => v.classList.remove("tts-active"));
  document.querySelectorAll("#output .verse-header.verse-highlight").forEach(v => v.classList.remove("verse-highlight"));
  const player = document.getElementById("ttsPlayer");
  player.classList.remove("tts-buffering", "tts-ready");
  const bar = document.getElementById("ttsProgressBar");
  if (bar) bar.style.width = "0%";
  player.hidden = true;
  ttsImmersiveClose();
  const playBtn = document.getElementById("ttsPlayBtn");
  if (playBtn) playBtn.disabled = false;
}

function ttsFinish() {
  _ttsCleanupMode();
  if (ttsAudio) { ttsAudio.pause(); ttsAudio = null; }
  ttsPaused = false;
  document.querySelectorAll("#output .verse.tts-active").forEach(v => v.classList.remove("tts-active"));
  document.querySelectorAll("#output .verse-header.verse-highlight").forEach(v => v.classList.remove("verse-highlight"));
  const player = document.getElementById("ttsPlayer");
  player.classList.remove("tts-buffering", "tts-ready");
  const bar = document.getElementById("ttsProgressBar");
  if (bar) bar.style.width = "0%";
  ttsShowContinuePrompt();
}

function ttsShowContinuePrompt() {
  const bookKeys = Object.keys(BIBLE_META);
  let bookIdx = bookKeys.indexOf(bookEl.value);
  let ch = parseInt(chapterEl.value);
  const totalCh = BIBLE_META[bookEl.value].chapters.length;

  let nextBook, nextCh;
  if (ch < totalCh) {
    nextBook = bookEl.value;
    nextCh = ch + 1;
  } else if (bookIdx < bookKeys.length - 1) {
    nextBook = bookKeys[bookIdx + 1];
    nextCh = 1;
  } else {
    stopTTS(); // end of Bible
    return;
  }

  const nextName = `${BIBLE_META[nextBook].name} ${nextCh}`;

  const passageEl = document.getElementById("ttsPassage");
  if (passageEl) passageEl.textContent = nextName;
  ttsSetStatus("Continue?");

  const continueHandler = async () => {
    // Remove pulse from play button
    document.getElementById("ttsImmPauseBtn")?.classList.remove("tts-imm-btn-pulse");
    if (nextBook !== bookEl.value) {
      bookEl.value = nextBook;
      loadChapters();
    }
    chapterEl.value = nextCh;
    verseEl.value = "";
    document.getElementById("output").innerHTML = "";
    stopTTS();
    resetAISections();
    document.getElementById("prevChapterBtn").classList.remove("hidden");
    document.getElementById("nextChapterBtn").classList.remove("hidden");
    document.getElementById("ttsPlayBtn").classList.remove("hidden");
    await loadPassage();
    runAIForCurrentPassage();
    playChapter();
  };

  const pauseBtn = document.getElementById("ttsPauseBtn");
  if (pauseBtn) {
    pauseBtn.innerHTML = ttsIcon("play_circle");
    pauseBtn.onclick = continueHandler;
  }
  // Update immersive: keep current title, show "Up Next" in the stage
  const immStatus = document.getElementById("ttsImmStatusEl");
  if (immStatus) immStatus.textContent = `Up next: ${nextName}`;

  const immCurNum  = document.getElementById("ttsImmCurNum");
  const immCurText = document.getElementById("ttsImmCurText");
  if (immCurNum)  immCurNum.textContent  = "Done";
  if (immCurText) immCurText.textContent = "Chapter complete.";

  const immNextNum  = document.getElementById("ttsImmNextNum");
  const immNextText = document.getElementById("ttsImmNextText");
  if (immNextNum)  immNextNum.textContent  = "Up Next";
  if (immNextText) immNextText.textContent = nextName;

  const immPrevNum  = document.getElementById("ttsImmPrevNum");
  const immPrevText = document.getElementById("ttsImmPrevText");
  if (immPrevNum)  immPrevNum.textContent  = "";
  if (immPrevText) immPrevText.textContent = "";

  const immPauseBtn = document.getElementById("ttsImmPauseBtn");
  if (immPauseBtn) {
    immPauseBtn.innerHTML = '<span class="material-symbols-outlined">play_arrow</span>';
    immPauseBtn.classList.add("tts-imm-btn-pulse");
    immPauseBtn.onclick = continueHandler;
  }

  const reflectBtn = document.getElementById("ttsImmReflectBtn");
  if (reflectBtn) {
    reflectBtn.hidden = false;
    reflectBtn.onclick = ttsImmReflectionOpen;
  }
}

function ttsShowPlayer(_status) {
  // Old pill stays hidden — immersive overlay is used instead
  ttsImmersiveOpen();
}

function ttsIcon(name) {
  return `<span class="material-symbols-outlined tts-status-icon">${name}</span>`;
}
function ttsSetStatus(html) {
  const el = document.getElementById("ttsStatus");
  if (el) el.innerHTML = html;
}

function ttsNavUpdate() {
  const prev = document.getElementById("ttsPrevBtn");
  const next = document.getElementById("ttsNextBtn");
  if (prev) prev.disabled = ttsIdx <= 0;
  if (next) next.disabled = ttsIdx >= ttsQueue.length - 1;
}


/* migrate old notes */
Object.keys(comments).forEach((k) => {
  comments[k] = comments[k].map((n) =>
    typeof n === "string" ? { text: n, time: Date.now() } : n,
  );
});

saveComments();

function saveComments() {
  localStorage.setItem("bibleComments", JSON.stringify(comments));
}

const keyOf = (b, c, v) => `${b}-${c}-${v}`;
const devotionId = () =>
  `${bookEl.value}-${chapterEl.value}-${verseEl.value || ""}`;

function resetAISections() {
  aiContextSummaryEl.innerHTML = "";
  const reflection = document.getElementById("aiReflection");
  if (reflection) {
    reflection.innerHTML = "";
    reflection.style.display = "none";
  }
}

async function fetchInlineQuickContext(
  { book, chapter, verse, text },
  mountEl,
) {
  mountEl.innerHTML = `
    <div class="inline-ai-loading">
      <div class="inline-ai-spinner"></div>
      <span>Quick context…</span>
    </div>
  `;

  const prompt = `
    IMPORTANT OUTPUT RULES (STRICT):
    - Respond with RAW HTML ONLY
    - DO NOT use code blocks
    - DO NOT use backticks
    - DO NOT write the word html
    - DO NOT explain anything outside the HTML
    - The FIRST character of your response MUST be "<"
    - The LAST character of your response MUST be ">"

    HTML RULES:
    - Use ONE div only
    - Allowed tags ONLY: div, p, strong, em

    CONTENT RULES:
    - VERY SHORT (1–2 sentences)
    - Simple explanation of meaning
    - Taglish (Filipino + English)
    - Youth-friendly, casual, warm tone
    - Early-believer level (easy to understand, not deep theology)
    - No preaching
    - No applications
    - No titles
    - No verse quotation

    TASK:
    Explain this verse briefly:

    ${book} ${chapter}:${verse}
    ${text}
    `;

  try {
    const res = await fetch(
      "https://gemini-proxy-668755364170.asia-southeast1.run.app",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "summary",
          contents: [{ parts: [{ text: prompt }] }],
        }),
      },
    );

    const data = await res.json();
    mountEl.innerHTML = `
    <div class="inline-ai-result">
        <button class="inline-ai-close" title="Close">✕</button>
        ${data.candidates?.[0]?.content?.parts?.[0]?.text || ""}
        <div class="inline-ai-actions">
          <button class="inline-ai-dig">🔎 Dig Deeper</button>
        </div>
        <div class="inline-ai-deep" hidden></div>
    </div>
    `;

    mountEl.querySelector(".inline-ai-close").onclick = () => {
      mountEl.innerHTML = "";
    };

    const digBtn = mountEl.querySelector(".inline-ai-dig");
    const deepEl = mountEl.querySelector(".inline-ai-deep");

    digBtn.onclick = async (e) => {
      e.stopPropagation();

      if (!deepEl.hidden) {
        deepEl.hidden = true;
        return;
      }

      deepEl.hidden = false;

      await fetchInlineDigDeeper(
        {
          book,
          chapter,
          verse,
        },
        deepEl,
      );
    };
  } catch {
    mountEl.innerHTML =
      '<div class="inline-ai-result"><p>Failed to load quick context.</p></div>'; // More descriptive error
  }
}

async function toggleVerseChat(key, book, chapter, verse, text, mountEl) {
  if (mountEl.querySelector(".verse-chat-wrapper")) {
    mountEl.innerHTML = "";
    return;
  }

  mountEl.innerHTML = `
    <div class="verse-chat-wrapper ai-fade-in">
      <div class="chat-history" id="chat-hist-${key}"></div>
      <div class="chat-input-area">
        <textarea placeholder="Ask something about this verse..." id="chat-input-${key}"></textarea>
        <button id="chat-send-${key}"><span class="material-icons">send</span></button>
      </div>
    </div>
  `;

  const input = document.getElementById(`chat-input-${key}`);
  const sendBtn = document.getElementById(`chat-send-${key}`);
  const histEl = document.getElementById(`chat-hist-${key}`);

  // Render existing history if any
  renderChatHistory(key, histEl);

  const performSend = async () => {
    const question = input.value.trim();
    if (!question) return;

    // Initialize history if empty
    if (!verseChatHistories[key]) verseChatHistories[key] = [];

    // Add User Message
    verseChatHistories[key].push({ role: "user", text: question });
    input.value = "";
    renderChatHistory(key, histEl);

    // Show loading
    const botMsgDiv = document.createElement("div");
    botMsgDiv.className = "chat-msg bot loading";
    botMsgDiv.innerHTML = `<div class="inline-ai-spinner"></div>`;
    histEl.appendChild(botMsgDiv);
    histEl.scrollTop = histEl.scrollHeight;

    const prompt = `
      You are a Bible study assistant.
      CONTEXT: ${book} ${chapter}:${verse} - "${text}"
      HISTORY: ${JSON.stringify(verseChatHistories[key].slice(-5))}
      
      RULES:
      - Be very concise (max 3 sentences).
      - Focus on the specific verse context.
      - Stay youth-friendly and encouraging.
      
      QUESTION: ${question}
    `;

    try {
      const res = await fetch(
        "https://gemini-proxy-668755364170.asia-southeast1.run.app",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task: "summary",
            contents: [{ parts: [{ text: prompt }] }],
          }),
        },
      );

      const data = await res.json();
      const answer =
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        "Pasensya na, hindi ko masagot 'yan sa ngayon.";

      // Update history
      verseChatHistories[key].push({ role: "model", text: answer });

      // Limit history to 6 items (3 turns)
      if (verseChatHistories[key].length > 6) verseChatHistories[key].shift();

      renderChatHistory(key, histEl);
    } catch (err) {
      botMsgDiv.innerHTML = "Error connecting to AI.";
    }
  };

  sendBtn.onclick = performSend;
  input.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      performSend();
    }
  };
}

function renderChatHistory(key, container) {
  const history = verseChatHistories[key] || [];
  container.innerHTML = history
    .map((msg) => {
      // Convert Markdown to HTML if it's from the bot
      const content = msg.role === "model" ? marked.parse(msg.text) : msg.text;

      return `
          <div class="chat-msg ${msg.role === "user" ? "user" : "bot"}">
            ${content}
          </div>
        `;
    })
    .join("");
  container.scrollTop = container.scrollHeight;
}

async function fetchInlineDigDeeper({ book, chapter, verse }, mountEl) {
  mountEl.innerHTML = `
    <div class="inline-ai-loading">
      <div class="inline-ai-spinner"></div>
      <span>Digging deeper…</span>
    </div>
  `;

  const prompt = `
IMPORTANT OUTPUT RULES (ABSOLUTE — NO EXCEPTIONS):

GENERAL:
- RAW HTML ONLY
- ONE outer <div> only
- NO markdown, NO explanations, NO preaching

LEXICAL RULES (VERY STRICT):
- EVERY lexical entry MUST:
  1. Start with the English meaning/word
  2. Include original script (Greek/Hebrew) and transliteration in parentheses
  3. Include Strong's Number in brackets
  4. Follow format: English Word — original (transliteration) [Strong's Number]
- DO NOT output English-only words
- If original word is unknown, SKIP it

LANGUAGE:
- New Testament → GREEK ONLY
- Old Testament → HEBREW ONLY

STRUCTURE (MANDATORY):
<div>
  <section data-col="lexical">
    <div>word — λόγος (logos) [G3056]</div>
  </section>

  <section data-col="flow">
    <div>Entity</div>
  </section>

  <section data-col="meta">
    <div data-type>Type text</div>
    <div data-focus>Focus text</div>
    <div data-time data-keyword>Time text</div>
  </section>
</div>

TASK:
Extract structured study data for:

${book} ${chapter}:${verse}
`;

  try {
    const res = await fetch(
      "https://gemini-proxy-668755364170.asia-southeast1.run.app",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "summary",
          contents: [{ parts: [{ text: prompt }] }],
        }),
      },
    );

    const data = await res.json();
    const html = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const temp = document.createElement("div");
    temp.innerHTML = html;
    const root = temp.querySelector("div");
    if (!root) throw new Error("Invalid AI output");

    // Reuse existing container (prevents double inline-ai-deep)
    mountEl.innerHTML = "";
    mountEl.classList.add("inline-ai-deep");

    const lexCol = document.createElement("div");
    lexCol.className = "deep-col deep-col-lexical";
    lexCol.innerHTML = `<div class="deep-col-title">Original Words</div>`;

    const flowCol = document.createElement("div");
    flowCol.className = "deep-col deep-col-flow";
    flowCol.innerHTML = `<div class="deep-col-title">Message Flow</div>`;

    const metaCol = document.createElement("div");
    metaCol.className = "deep-col deep-col-meta";
    metaCol.innerHTML = `<div class="deep-col-title">Overview</div>`;

    /* ---------- ROUTE AI CONTENT ---------- */
    root.querySelectorAll("section").forEach((section) => {
      const col = section.dataset.col;

      /* --- LEXICAL (FILTER BAD ENTRIES) --- */
      if (col === "lexical") {
        section.querySelectorAll("div").forEach((el) => {
          let html = el.innerHTML;

          // Require original script (Greek or Hebrew)
          const hasGreek = /[\u0370-\u03FF]/.test(html);
          const hasHebrew = /[\u0590-\u05FF]/.test(html);

          if (!hasGreek && !hasHebrew) return; // DROP invalid entry

          // Identify Strong's number [G1234] or [H1234]
          html = html.replace(
            /\[([GH]\d+)\]/g,
            '<a class="strong-num" data-strong="$1">[$1]</a>',
          );

          const newEl = document.createElement("div");
          newEl.className = "lex-item";
          newEl.innerHTML = html;

          // Add click listener for Strong's numbers
          newEl.querySelectorAll(".strong-num").forEach((sn) => {
            sn.onclick = (e) => {
              e.stopPropagation();
              openStrongModal(sn.dataset.strong, newEl.textContent);
            };
          });

          lexCol.appendChild(newEl);
        });
      }

      /* --- FLOW --- */
      if (col === "flow") {
        section.querySelectorAll("div").forEach((el, i, arr) => {
          el.classList.add("flow-step");
          flowCol.appendChild(el);
          if (i < arr.length - 1) {
            const arrow = document.createElement("div");
            arrow.className = "flow-arrow";
            arrow.textContent = "↓";
            flowCol.appendChild(arrow);
          }
        });
      }

      /* --- META --- */
      if (col === "meta") {
        section.querySelectorAll("div").forEach((el) => {
          const block = document.createElement("div");
          block.className = "meta-block";

          if (el.hasAttribute("data-type")) {
            block.innerHTML = `<div class="meta-label">Type</div>${el.textContent}`;
          } else if (el.hasAttribute("data-focus")) {
            block.innerHTML = `<div class="meta-label">Focus</div>${el.textContent}`;
          } else if (el.hasAttribute("data-time")) {
            block.innerHTML = `<div class="meta-label">Time</div>${el.textContent}`;
          }

          metaCol.appendChild(block);
        });
      }
    });

    mountEl.appendChild(lexCol);
    mountEl.appendChild(flowCol);
    mountEl.appendChild(metaCol);

    /* ---------- HIGHLIGHT SHARED KEYWORD ---------- */
    metaCol.querySelectorAll("[data-keyword]").forEach((kw) => {
      lexCol.querySelectorAll(".lex-item").forEach((item) => {
        if (item.textContent.includes(kw.dataset.keyword)) {
          item.classList.add("lexeme-highlight");
        }
      });
    });
  } catch (err) {
    console.error(err);
    mountEl.innerHTML = "<p>Failed to load deeper context.</p>"; // More descriptive error
  }
}

/* ---------- PASSAGE TITLE ---------- */
function updatePassageTitle() {
  const book = bookEl.options[bookEl.selectedIndex]?.text || "";
  const chapter = chapterEl.value;
  const verse = verseEl.value;

  let title = `${book} ${chapter}`;
  if (verse) title += `:${verse}`;

  passageTitleEl.textContent = title;
  summaryTitleEl.textContent = title;
}

/* ---------- UX MODE ---------- */
const verseCtrl = verseEl.closest(".control");

verseEl.onchange = () => {
  updateControlStates();
  updatePassageTitle();
  renderSummary();
};

function updateControlStates() {
  document.querySelectorAll(".control").forEach((c) => {
    const field = c.querySelector("input, select");
    c.classList.toggle("has-value", !!field?.value);
  });
}

// NEW: Helper to format key back to human-readable reference
const formatKey = (key) => {
  const [bookId, chapter, verse] = key.split("-");
  const bookName = BIBLE_META[bookId]?.name || bookId;
  return `${bookName} ${chapter}${verse ? ":" + verse : ""}`;
};

// NEW: Function to load passage from a dashboard link
function loadPassageById(id) {
  const [bookId, chapter, verse] = id.split("-");

  // Set the select elements
  bookEl.value = bookId;
  loadChapters();
  chapterEl.value = chapter;
  loadVerses();
  verseEl.value = verse || "";

  // Trigger the load button action
  loadBtn.click();
}

/* ---------- BOOKS ---------- */
function loadBooks() {
  bookEl.innerHTML = "";

  Object.entries(BIBLE_META).forEach(([id, book]) => {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = book.name;
    bookEl.appendChild(o);
  });

  bookEl.value = "JHN";
  loadChapters();
}

// Renamed and updated from showLanding to showDashboard
async function showDashboard() {
  stopTTS(); // always stop audio when returning to dashboard

  if (!bibleData) {
    await fetchBibleData();
  }

  // lockAppScroll(true); // FIX: Removed to allow dashboard scrolling on mobile
  document.querySelector(".summary").style.display = "none";

  passageTitleEl.hidden = true;
  toggleReflectionBtn.hidden = true;
  summaryTitleEl.hidden = true;
  homeBtn.style.display = "none"; // HIDE HOME BUTTON ON DASHBOARD

  favoritesPage = 0;

  aiContextSummaryEl.innerHTML = "";
  const reflection = document.getElementById("aiReflection");
  if (reflection) {
    reflection.innerHTML = "";
    reflection.style.display = "none";
  }

  summaryEl.innerHTML = "";
  copyNotesBtn.style.display = "none";

  // Display loading state first
  output.innerHTML = `
    <div class="landing">
      <div class="landing-card">
        <h2>Loading Dashboard...</h2>
      </div>
    </div>
  `;

  // Ensure layout is unset for dashboard view to allow vertical scrolling
  document.querySelector(".layout").classList.add("layout-unset");

  await renderDashboard();
}

function getVerseText(bookId, chapter, verse) {
  const bookName = BIBLE_META[bookId]?.name.toUpperCase();
  const bookData = bibleData?.[bookName];
  if (!bookData || !bookData[chapter]) return "Verse text not found.";

  const chapterData = bookData[chapter];
  // Regex to fix ".Word" -> ". Word"
  const clean = (txt) =>
    txt
      .trim()
      .replace(/\.(?=[a-zA-Z])/g, ". ")
      .replace(/\s+/g, " ");

  if (chapterData[verse]) return clean(chapterData[verse]);

  const rangeKey = Object.keys(chapterData).find((k) => {
    if (!k.includes("-")) return false;
    const [start, end] = k.split("-").map(Number);
    const v = Number(verse);
    return v >= start && v <= end;
  });

  return rangeKey ? clean(chapterData[rangeKey]) : "Verse text not found.";
}

async function renderDashboard() {
  const favoritesKeys = Object.keys(favorites).sort(
    (a, b) => favorites[b] - favorites[a],
  );

  // 1. Get favorite passages data (UPDATED)
  const allFavoritePassages = favoritesKeys.map((key) => {
    const [bookId, chapter, verse] = key.split("-");
    const verseToFetch = verse || "1"; // Default to verse 1 if chapter selected
    const verseText = getVerseText(bookId, chapter, verseToFetch);
    return {
      key,
      verseText,
      time: favorites[key],
    };
  });

  const startFavIndex = favoritesPage * FAV_PAGE_SIZE;
  const endFavIndex = startFavIndex + FAV_PAGE_SIZE;
  const favoritePassages = allFavoritePassages.slice(
    startFavIndex,
    endFavIndex,
  );

  const totalFavPages = Math.ceil(allFavoritePassages.length / FAV_PAGE_SIZE);

  // 1. Get recent notes (from localStorage)
  let recentNotes = [];

  Object.entries(comments).forEach(([key, list]) => {
    if (list && list.length) {
      const [bookId, chapter, verse] = key.split("-");
      const verseToFetch = verse || "1";
      const verseText = getVerseText(bookId, chapter, verseToFetch);

      // Push EVERY note in the list to the recentNotes array
      list.forEach((note) => {
        recentNotes.push({
          key,
          latestNoteTime: note.time, // Using the individual note time
          noteText: note.text, // Using the individual note text
          verseText,
        });
      });
    }
  });

  // Sort globally so the absolute newest notes appear first
  recentNotes.sort((a, b) => b.latestNoteTime - a.latestNoteTime);

  // 2. Get reflection answer counts and actual Q&A from localStorage (UPDATED TO REMOVE IDB DEPENDENCY)
  const reflectionPassages = {}; // Store { passageId: { QAs: ["Q:...\nA:...", ...], keys: ["reflection-JHN-1-1-0", ...], latestTime: 0 } }

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith("reflection-")) {
      const reflectionIdParts = key.split("-");
      // The structure is reflection-B-C-V-INDEX. The passage ID is B-C-V.
      // Note: Passage ID here is B-C-V if single verse, or B-C- if whole chapter
      const passageId = reflectionIdParts.slice(1, 4).join("-");

      const rawValue = localStorage.getItem(key);
      const answer = rawValue.split("\nA: ")[1]?.trim() || "";

      if (answer.length > 0) {
        if (!reflectionPassages[passageId]) {
          reflectionPassages[passageId] = { QAs: [], keys: [] };
        }
        reflectionPassages[passageId].QAs.push(rawValue); // Store the full Q&A string
        reflectionPassages[passageId].keys.push(key);
        // NOTE: Since the only timestamp is on 'comment' entries, and we cannot use IDB,
        // we can't reliably sort reflection passages by time. We'll simply list them.
      }
    }
  }

  // 3. Prepare recent reflections data structure
  let recentReflections = Object.keys(reflectionPassages).map((passageId) => {
    const data = reflectionPassages[passageId];
    return {
      id: passageId,
      // Since no reliable timestamp is available, we use the average time of the notes
      // to try and guess the correct order, falling back to 0 if no notes exist.
      // Fallback to 0 if no notes, relying on JS object key insertion order otherwise (unreliable but necessary without proper data).
      updatedAt:
        recentNotes.find((n) => n.key.startsWith(passageId))?.latestNoteTime ||
        0,
      reflectionCount: data.QAs.length,
      QAs: data.QAs,
    };
  });

  // Sort by the best available proxy time
  recentReflections.sort((a, b) => b.updatedAt - a.updatedAt);

  // Clean up the updatedAt proxy if it was 0 for better visual presentation in dashboard
  recentReflections = recentReflections.map((r) => ({
    ...r,
    updatedAt: r.updatedAt || Date.now(), // Fallback to current time if 0, so it displays something
  }));

  const dashboardHTML = `
  <div class="dashboard ai-fade-in">
  <style>
  .dashboard-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
  }
  @media (min-width: 768px) {
  .dashboard-grid {
  grid-template-columns: 1fr 1fr 1fr;
  }
  }
  </style>
  
  <h2>Your Dashboard</h2>
  
  <div class="dashboard-grid">

      <!-- CONTINUE READING + FAVORITES -->
      <section class="dashboard-section">
      
        <div id="continue-reading" class="hidden">
          <h3><span class="material-icons dashboard-icon">book</span> Continue Reading?</h3>
          <div onclick="loadPassageById('${recentPassageId}')" style="margin-bottom: 1rem; cursor: pointer">
            <div class="dashboard-ref flex">
            ${recentPassage} <span class="material-icons right">chevron_right</span>
            </div>
          </div>
        </div>
        
        <h3><span class="material-icons dashboard-icon">favorite</span> Favorites</h3>
        ${
          favoritesKeys.length
            ? `
          ${
            totalFavPages > 1
              ? `<div style="display:flex; justify-content: space-between; margin-bottom: 12px;">
                    <button class="secondary" id="favPrevBtn" style="opacity: 1; visibility: ${favoritesPage === 0 ? "hidden" : "visible"};">
                      <span class="material-icons dashboard-icon">chevron_left</span>
                    </button>
                    <span id="pageRef" style="font-size:12px; opacity: 0.7; align-self: center; text-transform: uppercase;">Page ${favoritesPage + 1} of ${totalFavPages}</span>
                    <button class="secondary" id="favNextBtn" style="opacity: 1; visibility: ${favoritesPage >= totalFavPages - 1 ? "hidden" : "visible"};">
                      <span class="material-icons dashboard-icon">chevron_right</span>
                    </button>
                 </div>`
              : ""
          }
          <div class="dashboard-list">
            ${favoritePassages
              .map(
                (item) => `
              <div class="dashboard-item" onclick="loadPassageById('${item.key}')">
                <span class="dashboard-ref">${formatKey(item.key)}</span>
                <p class="dashboard-verse-text">${item.verseText}</p>
                <time>${new Date(item.time).toLocaleDateString()}</time>
              </div>
            `,
              )
              .join("")}
          </div>`
            : `<p class="empty-state">No favorite verses yet. Double-click a verse or tap the <span class="material-icons" style="font-size:1em; vertical-align:middle; color:#c83086;">favorite_border</span> icon to add one!</p>`
        }
      </section>

      <!-- RECENT NOTES -->
      <section class="dashboard-section">
        <h3><span class="material-icons dashboard-icon">edit_note</span> Recent Notes</h3>
        ${
          recentNotes.length
            ? `<div class="dashboard-list">
            ${recentNotes
              .slice(0, 5)
              .map(
                (item) => `
              <div class="dashboard-item dashboard-item-notes" onclick="loadPassageById('${item.key}')">
                <div class="note-header">
                  <span class="dashboard-ref">${formatKey(item.key)}</span>
                  <time>${new Date(item.latestNoteTime).toLocaleDateString()}</time>
                </div>
                <p class="dashboard-verse-text">"${item.verseText}"</p>
                <div class="note-preview-wrapper">
                    <p class="dashboard-preview">${item.noteText}</p>
                </div>
              </div>
            `,
              )
              .join("")}
          </div>`
            : `<p class="empty-state">No notes saved recently.</p>`
        }
      </section>

      <!-- RECENT REFLECTIONS -->
      <section class="dashboard-section">
        <h3><span class="material-icons dashboard-icon">psychology_alt</span> Recent Reflections</h3>
        ${
          recentReflections.slice(0, 5).length
            ? `<div class="dashboard-list">
            ${recentReflections
              .slice(0, 5)
              .map(
                (entry) => `
              <div class="dashboard-item" onclick="loadPassageById('${entry.id}')">
                <span class="dashboard-ref">${formatKey(entry.id)}</span>
                <div class="reflection-qas">
                    ${entry.QAs.map((qa) => {
                      // Q&A text stored as "Q: [Question]\nA: [Answer]"
                      const parts = qa.split("\nA: ");
                      const question = parts[0].replace("Q: ", "").trim();
                      const answer = parts[1]?.trim() || "No answer recorded.";

                      return `
                            <div class="qa-pair" style="margin-top: 10px; padding: 8px 0; border-top: 1px solid rgba(255, 255, 255, 0.05);">
                                <p style="font-size: 14px; font-weight: 600; margin: 0 0 4px; color: white;">Q: ${question}</p>
                                <div style="font-size: 16px;
                                          margin: 0;
                                          opacity: 0.8;
                                          padding: 1rem;
                                          width: fit-content;
                                          border-radius: 12px;
                                          margin-top: 1rem;
                                          background: #00000063;
                                          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);">
                                          <div style="text-transform: uppercase;
                                                      opacity: 0.3;
                                                      letter-spacing: 5px;
                                                      font-size: x-small;
                                                      margin-bottom: 0.5rem;">ANSWER</div>
                                          <span>${answer}</span>
                                </div>
                            </div>
                        `;
                    }).join("")}
                </div>
                <time>Last noted ${new Date(entry.updatedAt).toLocaleDateString()}</time>
              </div>
            `,
              )
              .join("")}
          </div>`
            : `<p class="empty-state">No reflections saved. Load a passage to use the Guided Reflection feature.</p>`
        }
      </section>
      </div>
      </div>
      `;

  output.innerHTML = dashboardHTML;

  if (recentPassageId) {
    document.getElementById("continue-reading")?.classList.remove("hidden");
  }

  const favPrevBtn = document.getElementById("favPrevBtn");
  const favNextBtn = document.getElementById("favNextBtn");

  if (favPrevBtn) {
    favPrevBtn.onclick = () => changeFavoritesPage(-1);
  }
  if (favNextBtn) {
    favNextBtn.onclick = () => changeFavoritesPage(1);
  }
}

function changeFavoritesPage(delta) {
  favoritesPage = Math.max(0, favoritesPage + delta);
  renderDashboard();
}

/* ---------- CHAPTERS ---------- */
function loadChapters() {
  chapterEl.innerHTML = "";

  const chapters = BIBLE_META[bookEl.value].chapters;
  chapters.forEach((_, i) => {
    const o = document.createElement("option");
    o.value = i + 1;
    o.textContent = i + 1;
    chapterEl.appendChild(o);
  });

  loadVerses();
}

/* ---------- VERSES ---------- */
function loadVerses() {
  verseEl.innerHTML = `<option value="">All verses</option>`;

  const count = BIBLE_META[bookEl.value].chapters[chapterEl.value - 1];

  for (let i = 1; i <= count; i++) {
    const o = document.createElement("option");
    o.value = i;
    o.textContent = i;
    verseEl.appendChild(o);
  }

  if (!output.querySelector(".dashboard")) {
    updatePassageTitle();
  }

  renderSummary();
}
async function fetchWithTimeout(url, timeout = 4000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function fetchAllOriginsUnli(url) {
  while (true) {
    try {
      const res = await fetchWithTimeout(url, 4000);
      if (!res.ok) throw new Error("allorigins failed");
      return await res.json();
    } catch (err) {
      if (err.name !== "AbortError") {
        console.warn("allorigins retrying due to error:", err);
      }
      // retry immediately, unli
    }
  }
}

/* ---------- LOAD PASSAGE ---------- */
async function loadPassage() {
  document.querySelector(".layout").classList.remove("layout-unset");
  showLoading();
  lockAppScroll(false);
  updatePassageTitle();
  document.querySelector(".summary").style.display = "block";

  passageTitleEl.hidden = false;
  toggleReflectionBtn.hidden = false;
  summaryTitleEl.hidden = false;
  homeBtn.style.display = "inline-flex"; // SHOW HOME BUTTON

  try {
    titleForGemini = passageTitleEl.textContent;

    const bookId = bookEl.value;
    let bookName = BIBLE_META[bookId].name.toUpperCase();
    const chapterNum = chapterEl.value;
    const single = verseEl.value;

    recentPassageId = `${bookId}-${chapterNum}`;
    recentPassage = `${bookName} ${chapterNum}`;
    localStorage.setItem("recentPassageId", recentPassageId);
    localStorage.setItem("recentPassage", recentPassage);

    if (!bibleData) {
      await fetchBibleData();
    }

    /* ---------- GET LOCAL VERSES ---------- */
    const bookContent = bibleData[bookName];
    if (!bookContent) throw new Error(`Book ${bookName} not found in JSON.`);

    const chapterContent = bookContent[chapterNum];
    if (!chapterContent)
      throw new Error(`Chapter ${chapterNum} not found in ${bookName}.`);

    let verses = Object.entries(chapterContent).map(([vNum, text]) => ({
      book_id: bookId,
      chapter: Number(chapterNum),
      verse: vNum, // Keep as string (e.g. "1-4")
      text: text
        .trim()
        .replace(/([.,!?’])(?=[a-zA-Z0-9])/g, "$1 ")
        .replace(/\s+/g, " "),
    }));

    // Sort by numeric start so range keys like "1-4" don’t get pushed to the end
    // (JS Object.entries puts integer-like keys first, non-integer strings after)
    verses.sort((a, b) => parseInt(a.verse) - parseInt(b.verse));

    // Logic to filter single verse including range overlap
    if (single) {
      verses = verses.filter((v) => {
        if (v.verse == single) return true;
        if (v.verse.includes("-")) {
          const [start, end] = v.verse.split("-").map(Number);
          return +single >= start && +single <= end;
        }
        return false;
      });
    }

    // Generate Payload for AI before filtering for single verse
    const fullVersesText = verses
      .map((v) => `${v.verse}. ${v.text}`)
      .join("\n");

    window.__aiPayload = {
      book: bookName,
      chapter: chapterNum,
      isSingle: single,
      versesText: single
        ? verses.map((v) => `${v.verse}. ${v.text}`).join("\n")
        : fullVersesText,
    };

    /* ---------- RENDER ---------- */
    output.innerHTML = "";

    let isInsideQuote = false;

    verses.forEach((v) => {
      const key = keyOf(v.book_id, v.chapter, v.verse);
      const count = comments[key]?.length || 0;
      const isFav = isFavorite(key);

      let formattedText = "";

      // If we are already inside a quote from the previous verse,
      // start this verse with the opening span.
      if (isInsideQuote) {
        formattedText += '<span class="quote-style">';
      }

      for (let char of v.text) {
        if (
          char === '"' ||
          char === "“" ||
          char === "”" ||
          char === `‘` ||
          char === `’`
        ) {
          if (!isInsideQuote) {
            // Transition: Outside -> Inside
            formattedText += '<span class="quote-style">' + char;
            isInsideQuote = true;
          } else {
            // Transition: Inside -> Outside
            formattedText += char + "</span>";
            isInsideQuote = false;
          }
        } else {
          formattedText += char;
        }
      }

      // SAFETY: If the verse ends but the quote is still open,
      // close the span for this div so it doesn't break the layout.
      if (isInsideQuote) {
        formattedText += "</span>";
      }

      const wrap = document.createElement("div");
      wrap.className = "verse" + (isFav ? " highlighted" : "");
      wrap.innerHTML = `
        <div id="${
          v.verse
        }" class="verse-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div class="verse-content">
            <span class="verse-num">${v.verse}</span>${formattedText}
            <!-- RENDER meta-indicators ALWAYS for the favorite icon -->
            <span class="verse-meta-indicators" style="display:inline-flex; align-items:center; margin-left:8px; opacity:0.6;">
              <span class="material-icons favorite-indicator" style="font-size:14px; margin-right:4px; ${
                isFav ? 'color:#c83086;"' : '"'
              } data-key="${key}">${isFav ? "favorite" : "favorite_border"}</span>
              <span class="material-icons note-indicator" style="font-size:14px; margin-right:4px; cursor:pointer; ${count ? "opacity:1;" : "opacity:0.25;"}" data-key="${key}">edit_note</span>
              ${
                count
                  ? `<span style="font-size:11px; opacity:0.5;">${count}</span>`
                  : ""
              }
            </span>
          </div>
          <div class="verse-actions">
            <button class="inline-ai-btn" title="Quick verse context">✨</button>
            <button id="verse-chat-btn" class="inline-ai-btn" title="Chat with this verse">
              <span class="material-icons" style="font-size:16px;">question_mark</span>
            </button>
          </div>
        </div>
        <div class="inline-ai-mount"></div>
        <div class="comments ai-fade-in" hidden></div>
      `;

      // ... keep your existing listener code here ...
      const commentsEl = wrap.querySelector(".comments");
      const headerEl = wrap.querySelector(".verse-header");
      const aiBtn = wrap.querySelector(".inline-ai-btn");

      // New: Favorite icon listener
      const favIndicator = wrap.querySelector(".favorite-indicator");
      const verseContentEl = wrap.querySelector(".verse-content"); // Get verseContent for updateMetaIndicators

      // Double-click: toggle favorite
      headerEl.ondblclick = (e) => {
        e.stopPropagation();
        toggleFavorite(key);
        wrap.classList.toggle("highlighted", isFavorite(key));
        updateMetaIndicators(key, verseContentEl, comments[key]?.length || 0);
        animateFavorite(wrap);
      };

      aiBtn.onclick = (e) => {
        e.stopPropagation();
        const mount = wrap.querySelector(".inline-ai-mount");
        if (mount.innerHTML.trim()) {
          mount.innerHTML = "";
          return;
        }
        fetchInlineQuickContext(
          {
            book: BIBLE_META[v.book_id].name,
            chapter: v.chapter,
            verse: v.verse,
            text: v.text,
          },
          mount,
        );
      };

      const chatBtn = wrap.querySelector("#verse-chat-btn");
      chatBtn.onclick = (e) => {
        e.stopPropagation();
        const mount = wrap.querySelector(".inline-ai-mount");
        toggleVerseChat(
          key,
          BIBLE_META[v.book_id].name,
          v.chapter,
          v.verse,
          v.text,
          mount,
        );
      };

      // Note icon: open comments
      const noteIndicator = wrap.querySelector(".note-indicator");
      if (noteIndicator) {
        noteIndicator.onclick = (e) => {
          e.stopPropagation();
          commentsEl.hidden = !commentsEl.hidden;
          if (!commentsEl.hidden) renderComments(key, commentsEl);
        };
      }

      if (favIndicator) {
        favIndicator.onclick = (e) => {
          e.stopPropagation();
          toggleFavorite(key);
          wrap.classList.toggle("highlighted", isFavorite(key));
          updateMetaIndicators(key, verseContentEl, comments[key]?.length || 0);
          animateFavorite(wrap);
        };
      }

      output.appendChild(wrap);
    });

    renderSummary();
    hideLoading();
  } catch (err) {
    console.error(err);
    hideLoading();
    showLoadError(
      `Failed to load passage. Check if ${VERSION_FILES[currentVersion]} is present.`,
    );
  }
}

async function runAIForCurrentPassage() {
  if (!window.__aiPayload) return;

  const cached = await loadAIFromStorage();
  if (
    cached &&
    cached.contextHTML &&
    cached.reflectionHTML &&
    cached.contextHTML != "<p>Failed to generate context summary.</p>" &&
    cached.reflectionHTML != "<p>Failed to generate reflection questions.</p>"
  ) {
    aiContextSummaryEl.innerHTML = cached.contextHTML;
    document.getElementById("aiReflection").innerHTML = cached.reflectionHTML;
    applyReflectionVisibility();

    initializeReflections();
    return;
  }

  const { book, chapter, isSingle, versesText } = window.__aiPayload;
  titleForGemini = `${book} ${chapter}`;

  if (isSingle) {
    let verseNum;
    verseNum = versesText.split(".")[0];
    titleForGemini = `${book} ${chapter}:${verseNum}`;
  }

  await Promise.all([
    renderAIContextSummary(),
    renderAIReflectionQuestions({ book, chapter, versesText }),
  ]);

  await saveAIToStorage({
    contextHTML:
      aiContextSummaryEl.innerHTML !=
      "<p>Failed to generate context summary.</p>"
        ? aiContextSummaryEl.innerHTML
        : null,
    reflectionHTML:
      document.getElementById("aiReflection").innerHTML !=
      "<p>Failed to generate reflection questions.</p>"
        ? document.getElementById("aiReflection").innerHTML
        : null,
    answers: {},
  });
}

function showLoadError(message) {
  output.innerHTML = `
    <div style="
      background: linear-gradient(180deg, #1f2937, #111827);
      border-radius: 16px;
      padding: 20px;
      text-align: center;
    ">
      <p style="margin:0 0 12px; font-weight:600;">
        ⚠️ ${message}
      </p>
      <div style="display:flex; gap:10px; justify-content:center;">
        <button id="retryLoadBtn" class="primary">Retry</button>
        <button id="closeLoadBtn" class="secondary">✕ Close</button>
      </div>
    </div>
  `;

  document.getElementById("retryLoadBtn").onclick = () => {
    loadPassage();
  };

  document.getElementById("closeLoadBtn").onclick = () => {
    output.innerHTML = "";
  };
}

function showLoading() {
  // Prevent duplicates
  if (document.getElementById("ai-loading-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "ai-loading-overlay";
  overlay.className = "ai-loading-overlay";

  const card = document.createElement("div");
  card.className = "ai-loading-card";

  const spinner = document.createElement("div");
  spinner.className = "ai-spinner";

  const text = document.createElement("span");
  text.id = "ai-loading-text";
  text.textContent = "Generating context… (up to 15s) ⏳";

  card.appendChild(spinner);
  card.appendChild(text);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // smoother, readable keep-alive (does NOT block completion)
  let seconds = 15;
  const messages = [
    "Reading ancient scrolls 📜",
    "Aligning verses ✨",
    "Consulting apostles 🕊️",
    "Almost there 🙏",
  ];

  let msgIndex = 0;
  let dots = 0;

  window.__aiLoadingInterval = setInterval(() => {
    seconds = Math.max(0, seconds - 1);

    // animate dots smoothly
    dots = (dots + 1) % 4;
    const dotStr = ".".repeat(dots);

    // change message every 4s (not every second)
    if (seconds % 4 === 3 && msgIndex < messages.length - 1) {
      msgIndex++;
    }

    text.textContent = `${messages[msgIndex]}${dotStr} (${seconds}s)`;

    if (seconds <= 0) clearInterval(window.__aiLoadingInterval);
  }, 1000);
  // subtle pulse so user "feels" loading
  card.style.animation = "aiPulse 1.6s ease-in-out infinite";
}

function hideLoading() {
  const overlay = document.getElementById("ai-loading-overlay");
  if (overlay) {
    overlay.remove();
    clearInterval(window.__aiLoadingInterval);
  }
}

async function renderAIContextSummary() {
  aiContextSummaryEl.innerHTML = `
    <div class="ai-shimmer" style="margin-bottom:2rem;max-width:360px;">
      <div class="ai-shimmer-block"></div>
      <div class="ai-shimmer-block"></div>
      <div class="ai-shimmer-block short"></div>
    </div>
  `;

  let testText = `You are a Bible study assistant.

IMPORTANT:
Your response will be assigned directly to element.innerHTML.
Because of this, you must follow the rules below exactly.

OUTPUT RULES (MANDATORY):

Respond with RAW HTML ONLY
Do NOT use any code block formatting
Do NOT wrap the response in backticks
Do NOT label the response as code
Do NOT explain anything
Do NOT include the word html anywhere
The first character of your response must be the less-than symbol
Start immediately with a div tag

ALLOWED TAGS ONLY:
div, p, ul, li, strong, em

STYLING RULES (MUST MATCH EXACTLY):

Use ONE outer div with THIS EXACT inline style and DO NOT MODIFY IT:

background: linear-gradient(135deg, #486bec, #db2777);
padding: 1rem 1.5rem 2rem;
border-radius: 12px;
box-shadow: 0 12px 30px rgba(236, 72, 153, 0.45);
font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
font-size: 16px;
line-height: 1.4;
color: #ffffff;
width: 100%;
margin-bottom: 2rem;
box-sizing: border-box;

Title rules:
- The FIRST element inside the div must be a p tag WITH inline styles:
  font-size: 20px;
  font-weight: 700;
  margin: 0 0 0.8rem;
- The title format must be:
  "{BOOK} {CHAPTER} {VERSE (if it exists)} Context ✨"
- Use the actual book name and chapter from the task
- Title should feel calm and clear (slightly stronger than body text)

List rules:
- Use a ul directly under the title
- The ul MUST include inline styles:
  margin-top: 1rem;
  margin-bottom: 0;
  padding-left: 1.25rem;
- 3 to 5 short bullet points only
- Short, clean sentences
- Use <strong> to highlight key theological identities (e.g. Jesus, Word, Light, Lamb of God)
- Use <em> to highlight important actions or roles (e.g. became flesh, witnessing, calling disciples)
- Do NOT overuse emphasis — only 1–2 emphasized phrases per bullet
- No extra spacing or decoration


CONTENT RULES:

Very concise
Neutral, study-focused tone
No modern application
No verse quotations

TASK:
Create a compact background context for ${titleForGemini}.
`;
  console.log(titleForGemini);
  try {
    const gemini = await fetch(
      "https://gemini-proxy-668755364170.asia-southeast1.run.app",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "summary",
          contents: [
            {
              parts: [{ text: testText }],
            },
          ],
        }),
      },
    );

    const gemData = await gemini.json();
    aiContextSummaryEl.innerHTML =
      gemData.candidates?.[0]?.content?.parts?.[0]?.text ||
      "<p>Failed to generate context summary.</p>"; // More descriptive error

    if (aiContextSummaryEl.firstElementChild) {
      aiContextSummaryEl.firstElementChild.classList.add("ai-fade-in");
    }
  } catch (err) {
    console.error(err);
    aiContextSummaryEl.innerHTML = "<p>Failed to generate context summary.</p>"; // More descriptive error on fetch failure
  }
}

async function renderAIReflectionQuestions({ book, chapter, versesText }) {
  const mount = document.getElementById("aiReflection");
  mount.classList.add("ai-fade-in");
  mount.innerHTML = `
  <div class="ai-shimmer">
    <div class="ai-shimmer-block"></div>
    <div class="ai-shimmer-block"></div>
    <div class="ai-shimmer-block short"></div>
  </div>
`;

  const prompt = `
IMPORTANT OUTPUT RULES (STRICT):
- Respond with RAW HTML ONLY
- DO NOT use code blocks
- DO NOT use backticks
- DO NOT write the word html
- The FIRST character must be "<"
- Use ONE outer div only
- EACH question must be followed by a <textarea> for the user's answer
- Textareas must be empty and user-editable


ALLOWED TAGS:
div, p, ol, li, strong, em, textarea, a


ROLE:
You generate DISCUSSION AND REFLECTION QUESTIONS.
You must NOT give answers.
You must NOT speak as God.


TASK:
Generate EXACTLY 3 numbered questions based on the passage.


CRITICAL LINKING RULE (MUST FOLLOW):
- EVERY verse reference MUST be written as an <a> link
- Link format: <a href="#X" class="reflection-link">v. X</a> or <a href="#X" class="reflection-link">vv. X–Y</a>
- The href MUST always point to the FIRST verse in the reference
- DO NOT include any verse numbers outside of <a> tags
- STRICTOR RULE: DO NOT include parentheses around the link or the text inside the link (e.g., write "v. 5", NOT "(v. 5)" and NOT "<a>(v. 5)</a>")
- If a question references multiple verses or ranges, EACH one must be linked
- Final output must contain ZERO plain-text verse references and ZERO parentheses surrounding verse links


QUESTION STYLE (MATCH THE SAMPLE):
- Personally directed reflection tone (address the reader directly)
- Questions MUST speak in second person ("you", "your")
- Questions should invite personal meaning, conviction, or response
- Questions may ask what the passage says to you, challenges you about, or calls you to consider
- At least ONE question should ask about practical steps or responses you might take
- Questions may connect the passage to present-day life or society as experienced by you
- Do NOT provide answers
- Do NOT preach
- Do NOT explain theology beyond what the text directly supports

PERSONALIZATION RULE (STRICT):
- ALL questions MUST be directly addressed to the reader
- Avoid third-person or general phrasing (e.g., "people today", "believers", "society")
- Prefer phrasing like:
  "What does this passage say to you…"
  "How does this challenge you…"
  "What might this mean for the way you respond…"
  "What practical steps could you take…"
- If a question could apply without being personal, rewrite it

STRUCTURE:
- NO title
- NO intro sentence
- An <ol> with EXACTLY 3 <li> items
- Inside each <li>:
  - A single <p> containing the full question text (including the verse link)
  - A <textarea> immediately after the <p>


PASSAGE:
${book} ${chapter}

${versesText}
`;

  try {
    const res = await fetch(
      "https://gemini-proxy-668755364170.asia-southeast1.run.app",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "summary",
          contents: [{ parts: [{ text: prompt }] }],
        }),
      },
    );

    const data = await res.json();
    mount.innerHTML =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "<p>Failed to generate reflection questions.</p>"; // More descriptive error
    setTimeout(restoreSavedReflectionAnswers, 0);

    mount.querySelectorAll("textarea").forEach((ta, i) => {
      const id = `reflection-${devotionId()}-${i}`;
      ta.id = id;
    });

    initializeReflections();
  } catch (e) {
    console.error(e);
    mount.innerHTML = "<p>Failed to generate reflection questions.</p>"; // More descriptive error on fetch failure
  }
  return true;
}

async function restoreSavedReflectionAnswers() {
  const cached = await loadAIFromStorage();
  if (!cached?.answers) return;

  document.querySelectorAll("#aiReflection textarea").forEach((ta) => {
    if (cached.answers[ta.id] !== undefined) {
      ta.value = cached.answers[ta.id];
    }
  });
}

/* ---------- COMMENTS ---------- */

// Moved to a higher scope for reusability and efficiency
const updateMetaIndicators = (key, verseContent, newCommentCount) => {
  const isFav = isFavorite(key);
  let metaIndicators = verseContent.querySelector(".verse-meta-indicators");

  // This block should ideally not be needed if loadPassage always renders it.
  // Kept for robustness but it should rarely be hit.
  if (!metaIndicators) {
    metaIndicators = document.createElement("span");
    metaIndicators.className = "verse-meta-indicators";
    metaIndicators.style.cssText =
      "display:inline-flex; align-items:center; margin-left:8px; opacity:0.6;";
    verseContent.appendChild(metaIndicators);
  } else {
    // Clear existing indicators to rebuild, ensuring no duplicates or stale states
    metaIndicators.innerHTML = "";
  }

  // 1. Favorite Indicator
  const favIndicator = document.createElement("span");
  favIndicator.className = "material-icons favorite-indicator";
  favIndicator.style.cssText = "font-size:14px; margin-right:4px;";
  favIndicator.setAttribute("data-key", key);
  favIndicator.textContent = isFav ? "favorite" : "favorite_border";
  favIndicator.style.color = isFav ? "#c83086" : "";
  const verseWrap = verseContent.closest(".verse");
  if (verseWrap) verseWrap.classList.toggle("highlighted", isFav);
  favIndicator.onclick = (e) => {
    e.stopPropagation();
    toggleFavorite(key);
    updateMetaIndicators(key, verseContent, comments[key]?.length || 0);
    if (verseWrap) animateFavorite(verseWrap);
  };
  metaIndicators.appendChild(favIndicator);

  // 2. Note Indicator
  const noteIndicator = document.createElement("span");
  noteIndicator.className = "material-icons note-indicator";
  noteIndicator.style.cssText = `font-size:14px; margin-right:4px; cursor:pointer; ${newCommentCount > 0 ? "opacity:1;" : "opacity:0.25;"}`;
  noteIndicator.setAttribute("data-key", key);
  noteIndicator.textContent = "edit_note";
  noteIndicator.onclick = (e) => {
    e.stopPropagation();
    const commentsEl = verseWrap?.querySelector(".comments");
    if (commentsEl) {
      commentsEl.hidden = !commentsEl.hidden;
      if (!commentsEl.hidden) renderComments(key, commentsEl);
    }
  };
  metaIndicators.appendChild(noteIndicator);

  // 3. Comment Count
  if (newCommentCount > 0) {
    const countSpan = document.createElement("span");
    countSpan.style.cssText = "font-size:11px; opacity:0.5;";
    countSpan.textContent = newCommentCount;
    metaIndicators.appendChild(countSpan);
  }
};

function renderComments(key, container) {
  container.innerHTML = "";

  // key format: "BOOKID-CHAPTER-VERSE" where VERSE may contain a dash (e.g. "1-4")
  const parts = key.split("-");
  const verseIndex = parts.slice(2).join("-");
  const verseHeader = document.getElementById(verseIndex);
  // Find the flex container that holds the verse content
  const verseContent = verseHeader.children[0];

  const commentHeader = document.createElement("div");
  commentHeader.classList.add("flex");
  container.appendChild(commentHeader);

  const commentLabel = document.createElement("div");
  commentLabel.classList.add("comment-label");
  commentLabel.innerText = "NOTES";
  commentHeader.appendChild(commentLabel);

  const verse =
    bibleData[BIBLE_META[key.split("-")[0]].name.toUpperCase()][
      key.split("-")[1]
    ][verseIndex];

  const copyVerse = document.createElement("div");
  copyVerse.classList.add("copy-verse");
  copyVerse.innerText = "COPY VERSE";
  commentHeader.appendChild(copyVerse);
  copyVerse.onclick = () => {
    copyVerse.style.opacity = "1";
    copyVerse.classList.add("ai-fade-in");
    copyVerse.innerText = "VERSE COPIED! ✅";
    setTimeout(() => {
      copyVerse.classList.remove("ai-fade-in");
      copyVerse.innerText = "COPY VERSE";
      copyVerse.style.opacity = "0.6";
    }, 2000);
    navigator.clipboard.writeText(
      `${verse}
${BIBLE_META[key.split("-")[0]].name.toUpperCase()} ${key.split("-")[1]}:${verseIndex}`,
    );
  };

  const list = comments[key] || [];

  list.forEach((obj, i) => {
    const c = document.createElement("div");
    c.className = "comment";
    c.innerHTML = `${obj.text}<button>✕</button>`;
    c.querySelector("button").onclick = () => {
      comments[key].splice(i, 1);
      saveComments();
      renderComments(key, container);
      renderSummary();
      updateMetaIndicators(key, verseContent, comments[key].length);
    };
    container.appendChild(c);
  });

  const input = document.createElement("div");
  input.className = "comment-input";
  input.innerHTML = `<textarea rows="1"></textarea><button>Add</button>`;
  input.querySelector("button").onclick = () => {
    const val = input.querySelector("textarea").value.trim();
    if (!val) return;
    if (!comments[key]) comments[key] = [];
    comments[key].push({ text: val, time: Date.now() });
    saveComments();
    renderComments(key, container);
    renderSummary();
    updateMetaIndicators(key, verseContent, comments[key].length);
  };

  container.appendChild(input);

  // Initial call to ensure indicators are correct when comments pane opens
  updateMetaIndicators(key, verseContent, list.length);

  const newTextarea = input.querySelector("textarea");
  newTextarea.focus();
}

let hasCurrentComments = false;
/* ---------- SUMMARY ---------- */
function renderSummary() {
  summaryEl.innerHTML = "";
  notesCopyStatusEl.textContent = "";
  copyNotesBtn.style.display = "none";

  applyReflectionVisibility();

  const single = verseEl.value;
  window.__currentSummaryItems = [];

  let items = [];
  hasCurrentComments = false;
  Object.entries(comments).forEach(([key, list]) => {
    const parts = key.split("-");
    const b = parts[0];
    const c = parts[1];
    const v = parts.slice(2).join("-"); // preserves range keys like "1-4"

    if (b !== bookEl.value || c !== chapterEl.value) return;
    if (single && parseInt(v) !== +single) return;
    if (!list.length) return;

    hasCurrentComments = true;

    items.push({ verseNum: v, list });
    window.__currentSummaryItems.push({ verseNum: parseInt(v), list }); // numeric for copy-notes sort
    checkIfHasTextAreaAnswers();
  });

  if (!items.length) {
    summaryEl.textContent = "No notes yet for this passage.";
    return;
  }

  items.sort((a, b) => parseInt(a.verseNum) - parseInt(b.verseNum));

  items.forEach((item) => {
    const block = document.createElement("div");
    block.className = "summary-item";
    block.innerHTML = `<a href="#${item.verseNum}" class="summary-verse">Verse ${item.verseNum}</a>`;

    item.list.forEach((n) => {
      const note = document.createElement("div");
      note.className = "summary-note";
      note.innerHTML = `
        ${n.text}
        <time>
          ${new Date(n.time).toLocaleString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })}
        </time>
      `;
      block.appendChild(note);
    });

    summaryEl.appendChild(block);
  });
}

const scrollTopBtn = document.getElementById("scrollTopBtn");
const layoutEl = document.querySelector(".layout");

scrollTopBtn.style.display = "none";

layoutEl.addEventListener("scroll", () => {
  if (window.innerWidth > 900) return;

  scrollTopBtn.style.display = layoutEl.scrollTop > 160 ? "flex" : "none";
});

scrollTopBtn.onclick = () => {
  layoutEl.scrollTo({ top: 0, behavior: "smooth" });
};

/* ---------- EVENTS ---------- */
bookEl.onchange = loadChapters;
chapterEl.onchange = loadVerses;
const vSelect = document.getElementById("versionSelect");
if (vSelect) {
  vSelect.value = currentVersion;
  vSelect.onchange = () => switchVersion(vSelect.value);
}
loadBtn.onclick = async () => {
  output.innerHTML = "";
  stopTTS(); // fully reset TTS state so new chapter gets a fresh queue
  document.getElementById("prevChapterBtn").classList.remove("hidden");
  document.getElementById("nextChapterBtn").classList.remove("hidden");
  document.getElementById("ttsPlayBtn").classList.remove("hidden");
  resetAISections();

  await loadPassage();

  await runAIForCurrentPassage();
};

const prevChapterBtn = document.getElementById("prevChapterBtn");
const nextChapterBtn = document.getElementById("nextChapterBtn");

if (prevChapterBtn) {
  prevChapterBtn.onclick = () => {
    const bookKeys = Object.keys(BIBLE_META);
    let currentBookIdx = bookKeys.indexOf(bookEl.value);
    let currentChapter = parseInt(chapterEl.value);

    if (currentChapter > 1) {
      chapterEl.value = currentChapter - 1;
    } else if (currentBookIdx > 0) {
      currentBookIdx--;
      bookEl.value = bookKeys[currentBookIdx];
      loadChapters();
      const lastChapter = BIBLE_META[bookEl.value].chapters.length;
      chapterEl.value = lastChapter;
    } else {
      return; // Start of Bible
    }
    verseEl.value = "";
    loadBtn.click();
  };
}

if (nextChapterBtn) {
  nextChapterBtn.onclick = () => {
    const bookKeys = Object.keys(BIBLE_META);
    let currentBookIdx = bookKeys.indexOf(bookEl.value);
    let currentChapter = parseInt(chapterEl.value);
    const totalChapters = BIBLE_META[bookEl.value].chapters.length;

    if (currentChapter < totalChapters) {
      chapterEl.value = currentChapter + 1;
    } else if (currentBookIdx < bookKeys.length - 1) {
      currentBookIdx++;
      bookEl.value = bookKeys[currentBookIdx];
      loadChapters();
      chapterEl.value = 1;
    } else {
      return; // End of Bible
    }
    verseEl.value = "";
    loadBtn.click();
  };
}

homeBtn.onclick = () => {
  output.innerHTML = "";
  document.getElementById("prevChapterBtn").classList.add("hidden");
  document.getElementById("nextChapterBtn").classList.add("hidden");
  document.getElementById("ttsPlayBtn").classList.add("hidden");
  stopTTS();
  resetAISections();
  showDashboard();
  // Keep layout-unset for dashboard view to allow scroll
  // document.querySelector(".layout").classList.add("layout-unset");
};

/* ---------- TTS BUTTON WIRING ---------- */
const ttsPlayBtn = document.getElementById("ttsPlayBtn");
const ttsPrevBtn = document.getElementById("ttsPrevBtn");
const ttsPauseBtn = document.getElementById("ttsPauseBtn");
const ttsNextBtn = document.getElementById("ttsNextBtn");
const ttsCloseBtn = document.getElementById("ttsCloseBtn");
if (ttsPlayBtn) ttsPlayBtn.onclick = playChapter;
if (ttsPrevBtn) ttsPrevBtn.onclick = ttsPrevVerse;
if (ttsPauseBtn) ttsPauseBtn.onclick = pauseResumeTTS;
if (ttsNextBtn) ttsNextBtn.onclick = ttsNextVerse;
if (ttsCloseBtn) ttsCloseBtn.onclick = stopTTS;

/* ---------- INIT ---------- */
fetchBibleData(); // Load the JSON file on startup
loadBooks();
showDashboard(); // Changed from showLanding()
updateControlStates();

(async () => {
  const legacy = localStorage.getItem("ai-legacy-migrated");
  if (legacy) return;

  Object.keys(localStorage)
    .filter((k) => k.startsWith("ai-"))
    .forEach(async (k) => {
      try {
        const data = JSON.parse(localStorage.getItem(k));
        if (!data) return;
        await dbPut({
          id: k.replace("ai-", ""),
          ...data,
          migratedAt: Date.now(),
        });
      } catch {}
    });

  localStorage.setItem("ai-legacy-migrated", "1");
})();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js");
  });
}

const initializeReflections = () => {
  const textAreas = document.querySelectorAll('textarea[id^="reflection-"]');

  if (textAreas.length > 0) {
    textAreas.forEach((area) => {
      // 1. Find the question text (the <li> right before the textarea)
      const questionText =
        area.previousElementSibling?.textContent || "Question";

      // 2. Load existing data from localStorage
      const savedData = localStorage.getItem(area.id);
      if (savedData) {
        // We only want to put the "Answer" part back into the textarea UI
        const answerOnly = savedData.split("A: ")[1] || "";
        area.value = answerOnly;
        area.dispatchEvent(new Event("input", { bubbles: true }));
      }

      // 3. Save logic on input
      area.addEventListener("input", async () => {
        // Made async to await saveAIToStorage
        // Save in the specific format you requested (Q&A) to localStorage
        const formattedEntry = `Q: ${questionText}\nA: ${area.value}`;
        localStorage.setItem(area.id, formattedEntry);
        checkIfHasTextAreaAnswers();

        // Also update IndexedDB cache for AI reflections, storing only the answer
        const devotionID = devotionId(); // Get current devotion ID
        const cachedAI = await loadAIFromStorage(); // Load existing AI data
        if (cachedAI) {
          if (!cachedAI.answers) {
            cachedAI.answers = {};
          }
          cachedAI.answers[area.id] = area.value; // Store only the answer
          await saveAIToStorage(cachedAI); // Save updated AI data
        }
      });
    });

    // Stop watching once initialized
    observer.disconnect();
  }
  checkIfHasTextAreaAnswers();
};

function checkIfHasTextAreaAnswers() {
  const nodes = document.querySelectorAll('textarea[id^="reflection-"]');
  const ids = Array.from(nodes).map((node) => node.id);

  const hasActualResponse = ids.some((id) => {
    const storedData = localStorage.getItem(id);

    if (!storedData) return false;

    const answerPart = storedData.split("A:")[1] || "";
    return answerPart.trim().length > 0;
  });

  if (hasActualResponse || hasCurrentComments) {
    copyNotesBtn.style.display = "block";
  } else {
    copyNotesBtn.style.display = "none";
  }
}

const observer = new MutationObserver(() => initializeReflections());
observer.observe(document.body, { childList: true, subtree: true });
initializeReflections();

document.addEventListener("keydown", (e) => {
  // 1. Check if the focus is in your specific comment textarea
  const textArea = e.target.closest(".comment-input textarea");
  if (!textArea) return;

  // 2. Check for the Enter key (Key Code 13)
  // We also check !e.shiftKey so users can still do a new line with Shift+Enter if they want
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault(); // Prevents the actual new line from being added

    const addButton = textArea.parentElement.querySelector("button");
    if (addButton) {
      addButton.click();
    }
  }
});

document.addEventListener("click", (e) => {
  const link = e.target.closest('a[href^="#"]:not([href="#"])');
  if (!link) return;

  const id = link.getAttribute("href").slice(1);
  const target = document.getElementById(id);

  if (!target) return;

  e.preventDefault();

  smoothScrollTo(target, 700);

  // Highlight verse
  target.classList.remove("verse-highlight"); // reset if clicked again
  void target.offsetWidth; // force reflow
  target.classList.add("verse-highlight");
});

let isAutoScrolling = false; // Global flag
function smoothScrollTo(target, duration = 700) {
  const container = document.querySelector(".layout");
  if (!container || !target) return;

  isAutoScrolling = true;
  document.querySelector(".smart-header").classList.add("header-hidden");

  const startY = container.scrollTop;

  // Get the target's position relative to the container
  const containerTop = container.getBoundingClientRect().top;
  const targetTop = target.getBoundingClientRect().top;

  // targetTop - containerTop gives the distance from top of container to element
  // Then we add the current scroll position and subtract your 80px offset
  const targetY = targetTop - containerTop + startY - 80;

  const diff = targetY - startY;
  let startTime = null;

  // If the distance is basically zero, don't bother animating
  if (Math.abs(diff) < 2) return;

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function step(timestamp) {
    if (!startTime) startTime = timestamp;
    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);

    container.scrollTop = startY + diff * easeInOutCubic(progress);

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      // UNLOCK: Delay slightly to ensure the scroll event finishes firing
      setTimeout(() => {
        isAutoScrolling = false;
      }, 50);
    }
  }

  requestAnimationFrame(step);
}

const header = document.querySelector(".smart-header");
const layout = document.querySelector(".layout");

// Use scrollTop for elements, not scrollY
let lastScrollY = layout.scrollTop;

layout.addEventListener("scroll", () => {
  if (isAutoScrolling) return;
  const currentScrollY = layout.scrollTop;

  if (currentScrollY > lastScrollY && currentScrollY > 50) {
    // Scrolling Down - Hide Header
    header.classList.add("header-hidden");
  } else {
    // Scrolling Up - Show Header
    header.classList.remove("header-hidden");
  }

  lastScrollY = currentScrollY;
});

window.addEventListener("load", () => {
  const splash = document.getElementById("app-splash");

  // Give it a small 1-second delay so the logo is actually seen
  setTimeout(() => {
    splash.classList.add("splash-hidden");
  }, 1000);
});

const aiTextareas = document.querySelectorAll("#aiReflection textarea");

aiTextareas.forEach((textarea) => {
  textarea.style.overflowY = "hidden";
  autoExpand(textarea); // Set initial height based on content
});

// 2. Event Listener restricted only to #aiReflection textareas
document.addEventListener(
  "input",
  function (event) {
    // Check if the element is a textarea AND is inside #aiReflection
    if (
      event.target.tagName.toLowerCase() === "textarea" &&
      event.target.closest("#aiReflection")
    ) {
      autoExpand(event.target);
    }
  },
  false,
);

function autoExpand(field) {
  // Reset field height so it can shrink
  field.style.height = "inherit";

  // Calculate the height
  const computed = window.getComputedStyle(field);
  const height =
    field.scrollHeight +
    parseInt(computed.getPropertyValue("border-top-width"), 10) +
    parseInt(computed.getPropertyValue("border-bottom-width"), 10);

  field.style.height = height + "px";
}

if (recentPassageId) {
  let recentPassageSplit = recentPassageId.split("-");
  bookEl.value = recentPassageSplit[0];
  loadChapters();
  chapterEl.value = recentPassageSplit[1];
}

// ── IMMERSIVE TTS MODE ────────────────────────────────────────────────────────

function ttsImmersiveOpen() {
  const el = document.getElementById("ttsImmersive");
  if (!el) return;

  // Always reset reflection panel state so a fresh TTS session is clean
  const reflPanel = document.getElementById("ttsImmReflPanel");
  if (reflPanel) reflPanel.hidden = true;
  const stage = document.querySelector(".tts-imm-stage");
  if (stage) stage.style.display = "";
  const footer = document.querySelector(".tts-imm-footer");
  if (footer) footer.style.display = "";
  const reflectBtn = document.getElementById("ttsImmReflectBtn");
  if (reflectBtn) {
    const reflectionReady = document.querySelectorAll('#aiReflection textarea[id^="reflection-"]').length > 0;
    reflectBtn.hidden = !reflectionReady;
    if (reflectionReady) reflectBtn.onclick = ttsImmReflectionOpen;
  }

  // Set passage title
  const name = BIBLE_META[bookEl?.value]?.name || "";
  const ch = chapterEl?.value || "";
  const titleEl = document.getElementById("ttsImmTitle");
  if (titleEl) titleEl.textContent = name && ch ? `${name} ${ch}` : "";

  // Reset load bar + status
  const immBar = document.getElementById("ttsImmLoadBar");
  if (immBar) immBar.style.width = "0%";
  const immStatus = document.getElementById("ttsImmStatusEl");
  if (immStatus) immStatus.textContent = "";

  // Build scrubber dots from queue
  ttsImmersiveBuildScrubber();

  // Wire buttons
  document.getElementById("ttsImmPrevBtn").onclick = ttsPrevVerse;
  document.getElementById("ttsImmNextBtn").onclick = ttsNextVerse;
  document.getElementById("ttsImmPauseBtn").onclick = pauseResumeTTS;
  document.getElementById("ttsImmCloseBtn").onclick = stopTTS;

  // Prev/next verse slots are tappable to jump
  document.getElementById("ttsImmSlotPrev").onclick = () => { if (ttsIdx > 0) ttsPrevVerse(); };
  document.getElementById("ttsImmSlotNext").onclick = () => { if (ttsIdx < ttsQueue.length - 1) ttsNextVerse(); };

  // Double-tap current verse to favorite
  const curSlot = document.getElementById("ttsImmSlotCur");
  if (curSlot) {
    curSlot.addEventListener("click", _immHandleDoubleTap);
  }

  el.hidden = false;
}

function ttsImmersiveClose() {
  const el = document.getElementById("ttsImmersive");
  if (el) el.hidden = true;
  _immDoubleTapCount = 0;
  clearTimeout(_immDoubleTapTimer);
  // Reset reflection panel + verse popup state
  const panel = document.getElementById("ttsImmReflPanel");
  if (panel) panel.hidden = true;
  const versePopup = document.getElementById("ttsImmVersePopup");
  if (versePopup) versePopup.hidden = true;
  const stage = document.querySelector(".tts-imm-stage");
  if (stage) stage.style.display = "";
  const footer = document.querySelector(".tts-imm-footer");
  if (footer) footer.style.display = "";
  const reflectBtn = document.getElementById("ttsImmReflectBtn");
  if (reflectBtn) reflectBtn.hidden = true;
}

function ttsImmersiveBuildScrubber() {
  const scrubber = document.getElementById("ttsImmScrubber");
  if (!scrubber) return;
  scrubber.innerHTML = ttsQueue.map((item, i) =>
    `<button class="tts-imm-dot" data-idx="${i}">${item.verseNum}</button>`
  ).join("");
  scrubber.querySelectorAll(".tts-imm-dot").forEach(dot => {
    dot.onclick = () => {
      const idx = parseInt(dot.dataset.idx);
      ttsGen++;
      if (ttsAudio) { ttsAudio.onended = null; ttsAudio.pause(); ttsAudio = null; }
      ttsPlayAt(idx, ttsGen);
    };
  });
}

function ttsImmersiveUpdate(index) {
  if (index < 0 || index >= ttsQueue.length) return;

  const prev = ttsQueue[index - 1];
  const cur  = ttsQueue[index];
  const next = ttsQueue[index + 1];

  // Prev slot
  const prevNum  = document.getElementById("ttsImmPrevNum");
  const prevText = document.getElementById("ttsImmPrevText");
  if (prevNum)  prevNum.textContent  = prev ? `Verse ${prev.verseNum}` : "";
  if (prevText) prevText.textContent = prev ? _immPreview(prev.text) : "";

  // Current slot with animation
  const curSlot = document.getElementById("ttsImmSlotCur");
  const curNum  = document.getElementById("ttsImmCurNum");
  const curText = document.getElementById("ttsImmCurText");
  if (curSlot) {
    curSlot.classList.remove("tts-verse-anim");
    void curSlot.offsetWidth;
    curSlot.classList.add("tts-verse-anim");
  }
  if (curNum)  curNum.textContent  = `Verse ${cur.verseNum}`;
  if (curText) curText.textContent = cur.text;

  // Next slot
  const nextNum  = document.getElementById("ttsImmNextNum");
  const nextText = document.getElementById("ttsImmNextText");
  if (nextNum)  nextNum.textContent  = next ? `Verse ${next.verseNum}` : "";
  if (nextText) nextText.textContent = next ? _immPreview(next.text) : "";

  // Scrubber: activate current dot and scroll it into view
  document.querySelectorAll("#ttsImmScrubber .tts-imm-dot").forEach((d, i) => {
    d.classList.toggle("active", i === index);
  });
  const activeDot = document.querySelector(`#ttsImmScrubber .tts-imm-dot[data-idx="${index}"]`);
  if (activeDot) activeDot.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });

  // Nav buttons
  const prevBtn = document.getElementById("ttsImmPrevBtn");
  const nextBtn = document.getElementById("ttsImmNextBtn");
  if (prevBtn) prevBtn.disabled = index <= 0;
  if (nextBtn) nextBtn.disabled = index >= ttsQueue.length - 1;

  // Reset pause button to pause icon
  const pauseBtn = document.getElementById("ttsImmPauseBtn");
  if (pauseBtn && !ttsPaused) {
    pauseBtn.innerHTML = '<span class="material-symbols-outlined">pause</span>';
    pauseBtn.onclick = pauseResumeTTS;
  }
}

function _immPreview(text) {
  const words = text.split(/\s+/);
  return words.length > 8 ? words.slice(0, 8).join(" ") + "\u2026" : text;
}

function _immHandleDoubleTap() {
  _immDoubleTapCount++;
  if (_immDoubleTapCount === 2) {
    _immDoubleTapCount = 0;
    clearTimeout(_immDoubleTapTimer);
    const item = ttsQueue[ttsIdx];
    if (!item) return;
    const key = keyOf(bookEl.value, chapterEl.value, item.verseNum);
    toggleFavorite(key);
    // Sync the verse element in #output
    const favIcon = document.querySelector(`.favorite-indicator[data-key="${key}"]`);
    if (favIcon) {
      const isFav = isFavorite(key);
      const wrap = favIcon.closest(".verse");
      if (wrap) wrap.classList.toggle("highlighted", isFav);
      favIcon.textContent = isFav ? "favorite" : "favorite_border";
      favIcon.style.color = isFav ? "#c83086" : "";
    }
    const heart = document.getElementById("ttsImmHeart");
    if (heart) {
      heart.classList.remove("popping");
      void heart.offsetWidth;
      heart.classList.add("popping");
      heart.addEventListener("animationend", () => heart.classList.remove("popping"), { once: true });
    }
  } else {
    _immDoubleTapTimer = setTimeout(() => { _immDoubleTapCount = 0; }, 350);
  }
}

// ── Immersive Guided Reflection ──────────────────────────────────────────────

function ttsImmReflectionOpen() {
  const textAreas = Array.from(document.querySelectorAll('#aiReflection textarea[id^="reflection-"]'));
  if (textAreas.length === 0) {
    const status = document.getElementById("ttsImmStatusEl");
    if (status) {
      status.textContent = "Reflection not ready yet";
      status.style.opacity = "0.7";
      setTimeout(() => { status.style.opacity = ""; status.textContent = ""; }, 2500);
    }
    return;
  }
  // Hide stage + footer, show reflection panel
  const stage = document.querySelector(".tts-imm-stage");
  const footer = document.querySelector(".tts-imm-footer");
  if (stage) stage.style.display = "none";
  if (footer) footer.style.display = "none";
  const panel = document.getElementById("ttsImmReflPanel");
  if (panel) panel.hidden = false;
  _immReflIndex = 0;
  ttsImmReflectionShow(_immReflIndex);
}

function ttsImmReflectionShow(index) {
  const textAreas = Array.from(document.querySelectorAll('#aiReflection textarea[id^="reflection-"]'));
  const total = textAreas.length;
  const ta = textAreas[index];
  if (!ta) return;

  document.getElementById("ttsImmReflProgress").textContent = `${index + 1} / ${total}`;

  // Question text is in the <li> or <p> just before the textarea
  const questionText = ta.previousElementSibling?.textContent?.trim() || `Question ${index + 1}`;
  const questionEl = document.getElementById("ttsImmReflQuestion");
  questionEl.innerHTML = _immParseVerseRefs(questionText);
  questionEl.querySelectorAll(".tts-imm-verse-ref").forEach(chip => {
    chip.onclick = () => _immShowVersePopup(
      parseInt(chip.dataset.start),
      parseInt(chip.dataset.end)
    );
  });

  const myArea = document.getElementById("ttsImmReflArea");
  myArea.value = ta.value;
  myArea.oninput = () => {
    ta.value = myArea.value;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  };
  myArea.focus();

  const backBtn = document.getElementById("ttsImmReflBack");
  const nextBtn = document.getElementById("ttsImmReflNext");
  const copyBtn = document.getElementById("ttsImmReflCopy");
  const statusEl = document.getElementById("ttsImmReflStatus");
  statusEl.textContent = "";

  // Back: go to prev question, or return to TTS stage on Q1
  backBtn.textContent = index === 0 ? "← Verses" : "← Back";
  backBtn.onclick = () => {
    if (index === 0) {
      document.getElementById("ttsImmReflPanel").hidden = true;
      const stage = document.querySelector(".tts-imm-stage");
      if (stage) stage.style.display = "";
      const footer = document.querySelector(".tts-imm-footer");
      if (footer) footer.style.display = "";
    } else {
      _immReflIndex--;
      ttsImmReflectionShow(_immReflIndex);
    }
  };

  if (index < total - 1) {
    nextBtn.hidden = false;
    nextBtn.textContent = "Next →";
    nextBtn.onclick = () => {
      _immReflIndex++;
      ttsImmReflectionShow(_immReflIndex);
    };
    copyBtn.hidden = true;
  } else {
    nextBtn.hidden = true;
    copyBtn.hidden = false;
    copyBtn.onclick = async () => {
      await copyNotesBtn.onclick?.();
      statusEl.textContent = "✅ Notes copied!";
      setTimeout(() => { statusEl.textContent = ""; }, 2500);
    };
  }
}

function _immParseVerseRefs(text) {
  // Escape HTML first, then replace verse refs with tappable chips
  const escaped = text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  return escaped.replace(/\bv\.?\s*(\d+)(?:\s*[-–]\s*(\d+))?/gi, (match, start, end) => {
    return `<span class="tts-imm-verse-ref" data-start="${start}" data-end="${end || start}">${match}</span>`;
  });
}

function _immShowVersePopup(startVerse, endVerse) {
  const popup = document.getElementById("ttsImmVersePopup");
  const content = document.getElementById("ttsImmVersePopupContent");
  if (!popup || !content) return;

  const rows = [];
  for (let v = startVerse; v <= endVerse; v++) {
    const item = ttsQueue.find(q => String(q.verseNum) === String(v));
    if (item) {
      rows.push(`
        <div class="tts-imm-verse-popup-row">
          <span class="tts-imm-verse-popup-num">v.${v}</span>
          <span class="tts-imm-verse-popup-text">${item.text}</span>
        </div>`);
    }
  }

  content.innerHTML = rows.length
    ? rows.join("")
    : `<span class="tts-imm-verse-popup-text" style="opacity:0.5">Verse not found.</span>`;

  popup.hidden = false;

  document.getElementById("ttsImmVersePopupClose").onclick = () => { popup.hidden = true; };
  document.getElementById("ttsImmVersePopupBackdrop").onclick = () => { popup.hidden = true; };
}
