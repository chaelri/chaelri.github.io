const FAV_PAGE_SIZE = 3;
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

// ── AI loading state ──
let _contextLoading = false;
let _reflectionLoading = false;
let _ttsFinished = false;

// ── Immersive mode state (declared here so stopTTS can reference before the immersive block) ──
let _immDoubleTapCount = 0;
let _immDoubleTapTimer = null;
let _immReflIndex = 0;
let _immAutoReflTimer = null;
let _immVerseUpdateTimer = null;

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
  _ttsFinished = false;

  const pauseBtn = document.getElementById("ttsPauseBtn");
  if (pauseBtn) pauseBtn.innerHTML = '<span class="material-symbols-outlined">pause</span>';

  ttsQueue = ttsBuildQueue();

  // Prepend chapter title to first verse's SPOKEN text only (display text stays clean)
  const _ttsBookName = BIBLE_META[bookEl?.value]?.name || "";
  const _ttsCh = chapterEl?.value || "";
  if (_ttsBookName && _ttsCh && ttsQueue.length > 0) {
    ttsQueue[0].ttsText = `${_ttsBookName} ${_ttsCh}. ${ttsQueue[0].text}`;
  }

  ttsIdx = -1;
  if (!ttsQueue.length) return;

  const playBtn = document.getElementById("ttsPlayBtn");
  if (playBtn) playBtn.disabled = true;
  document.getElementById("output")?.classList.add("tts-mode");

  _ttsReadyCount = 0;
  const bar = document.getElementById("ttsProgressBar");
  if (bar) bar.style.width = "0%";

  // Start all synthesis in background
  for (const item of ttsQueue) {
    item.ready = ttsSynthesize(item.ttsText || item.text).then(
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

  // Set verse range indicator in immersive top bar
  const rangeEl = document.getElementById("ttsImmRange");
  if (rangeEl && ttsQueue.length > 0) {
    const first = ttsQueue[0].verseNum;
    const last  = ttsQueue[ttsQueue.length - 1].verseNum;
    rangeEl.textContent = ttsQueue.length === 1
      ? `Verse ${first}`
      : `Verses ${first}–${last}`;
  }

  // Show context intro screen — user taps "Start Reading" to begin playback
  ttsImmContextOpen(gen);
}

async function ttsPlayAt(index, gen) {
  if (gen !== ttsGen) return;
  if (index < 0 || index >= ttsQueue.length) {
    if (gen === ttsGen) ttsFinish();
    return;
  }

  // Hide pause panel when verse changes
  const _pp = document.getElementById("ttsImmPausePanel");
  if (_pp) _pp.hidden = true;

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
  const pausePanel = document.getElementById("ttsImmPausePanel");
  if (ttsPaused) {
    ttsAudio.play(); ttsPaused = false;
    if (btn) btn.innerHTML = '<span class="material-symbols-outlined">pause</span>';
    if (immBtn) immBtn.innerHTML = '<span class="material-symbols-outlined">pause</span>';
    ttsSetStatus(`${ttsIcon("graphic_eq")} ${ttsQueue[ttsIdx]?.verseNum} / ${ttsQueue.length}`);
    _startWordHighlight(ttsAudio, _ttsActiveWordItem);
    if (pausePanel) pausePanel.hidden = true;
  } else {
    ttsAudio.pause(); ttsPaused = true;
    _stopWordHighlight();
    if (btn) btn.innerHTML = '<span class="material-symbols-outlined">play_arrow</span>';
    if (immBtn) immBtn.innerHTML = '<span class="material-symbols-outlined">play_arrow</span>';
    ttsSetStatus(`${ttsIcon("pause")} Verse ${ttsQueue[ttsIdx]?.verseNum}`);
    _ttsImmShowPausePanel();
  }
}

function _ttsImmShowPausePanel() {
  const panel = document.getElementById("ttsImmPausePanel");
  const content = document.getElementById("ttsImmPauseContent");
  if (!panel || !content) return;

  const item = ttsQueue[ttsIdx];
  if (!item) return;

  const bookKey = bookEl.value;
  const ch = chapterEl.value;
  const verseNum = item.verseNum;
  const key = keyOf(bookKey, ch, verseNum);
  const bookName = BIBLE_META[bookKey]?.name || "";
  const verseText = item.text;

  content.innerHTML = "";
  panel.hidden = false;

  const noteBtn = document.getElementById("ttsImmPauseNote");
  const ctxBtn = document.getElementById("ttsImmPauseContext");
  const askBtn = document.getElementById("ttsImmPauseAsk");

  [noteBtn, ctxBtn, askBtn].forEach(b => b?.classList.remove("active"));

  const toggleAction = (btn, renderFn) => {
    const wasActive = btn.classList.contains("active");
    [noteBtn, ctxBtn, askBtn].forEach(b => b?.classList.remove("active"));
    content.innerHTML = "";
    if (!wasActive) {
      btn.classList.add("active");
      renderFn();
    }
  };

  if (noteBtn) noteBtn.onclick = () => toggleAction(noteBtn, () => {
    const notesDiv = document.createElement("div");
    notesDiv.className = "tts-imm-pause-notes";
    content.appendChild(notesDiv);
    renderComments(key, notesDiv);
  });

  if (ctxBtn) ctxBtn.onclick = () => toggleAction(ctxBtn, () => {
    fetchInlineQuickContext({ book: bookName, chapter: ch, verse: verseNum, text: verseText }, content);
  });

  if (askBtn) askBtn.onclick = () => toggleAction(askBtn, () => {
    toggleVerseChat(key, bookName, ch, verseNum, verseText, content);
  });
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
  _ttsFinished = false;
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
  _ttsFinished = true;
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

  let nextBook, nextCh, nextName;
  if (ch < totalCh) {
    nextBook = bookEl.value; nextCh = ch + 1;
  } else if (bookIdx < bookKeys.length - 1) {
    nextBook = bookKeys[bookIdx + 1]; nextCh = 1;
  } else {
    stopTTS(); return; // end of Bible
  }
  nextName = `${BIBLE_META[nextBook].name} ${nextCh}`;

  _immCancelAutoRefl();

  // Update stage to show "complete" state
  const immCurNum  = document.getElementById("ttsImmCurNum");
  const immCurText = document.getElementById("ttsImmCurText");
  if (immCurNum)  immCurNum.textContent  = "";
  if (immCurText) immCurText.textContent = "Chapter complete ✓";
  const immPrevNum  = document.getElementById("ttsImmPrevNum");
  const immPrevText = document.getElementById("ttsImmPrevText");
  if (immPrevNum)  immPrevNum.textContent  = "";
  if (immPrevText) immPrevText.textContent = "";
  const immNextNum  = document.getElementById("ttsImmNextNum");
  const immNextText = document.getElementById("ttsImmNextText");
  if (immNextNum)  immNextNum.textContent  = "";
  if (immNextText) immNextText.textContent = "";

  // Disable pause/next — chapter is done. Keep prev enabled so user can replay any verse.
  const immPauseBtn = document.getElementById("ttsImmPauseBtn");
  if (immPauseBtn) { immPauseBtn.innerHTML = '<span class="material-symbols-outlined">pause</span>'; immPauseBtn.disabled = true; }
  const immNextBtn = document.getElementById("ttsImmNextBtn");
  if (immNextBtn) immNextBtn.disabled = true;
  const immPrevBtn = document.getElementById("ttsImmPrevBtn");
  if (immPrevBtn) {
    immPrevBtn.disabled = false;
    immPrevBtn.onclick = () => {
      // Clear end state and resume normal navigation
      panel.hidden = true;
      const pauseActionsRow = document.querySelector(".tts-imm-pause-actions");
      if (pauseActionsRow) pauseActionsRow.hidden = false;
      if (immPauseBtn) immPauseBtn.disabled = false;
      if (immNextBtn) immNextBtn.disabled = false;
      _ttsFinished = false;
      immPrevBtn.onclick = ttsPrevVerse;
      ttsPrevVerse();
    };
  }

  // Keep reflect btn hidden — surfaced in the panel below
  const reflectBtn = document.getElementById("ttsImmReflectBtn");
  if (reflectBtn) reflectBtn.hidden = true;

  // Show choice panel
  const panel = document.getElementById("ttsImmPausePanel");
  const content = document.getElementById("ttsImmPauseContent");
  if (!panel || !content) return;

  const reflReady = !_reflectionLoading && document.querySelectorAll('#aiReflection textarea[id^="reflection-"]').length > 0;

  content.innerHTML = `
    <div class="tts-imm-end-choices">
      <button class="tts-imm-end-btn tts-imm-end-continue" id="ttsEndContinueBtn">
        <span class="material-symbols-outlined">play_arrow</span>
        <div><strong>${nextName}</strong><span>Continue reading</span></div>
      </button>
      ${reflReady ? `<button class="tts-imm-end-btn tts-imm-end-reflect" id="ttsEndReflectBtn">
        <span class="material-icons">volunteer_activism</span>
        <div><strong>Guided Reflection</strong><span>Reflect on this chapter</span></div>
      </button>` : ''}
    </div>
  `;

  // Disable the action row buttons since this isn't a "paused" state
  const noteBtn = document.getElementById("ttsImmPauseNote");
  const ctxBtn  = document.getElementById("ttsImmPauseContext");
  const askBtn  = document.getElementById("ttsImmPauseAsk");
  const pauseActionsRow = document.querySelector(".tts-imm-pause-actions");
  if (pauseActionsRow) pauseActionsRow.hidden = true;

  panel.hidden = false;

  const continueHandler = async () => {
    panel.hidden = true;
    const pauseActionsRow = document.querySelector(".tts-imm-pause-actions");
    if (pauseActionsRow) pauseActionsRow.hidden = false;
    if (immPauseBtn) immPauseBtn.disabled = false;
    if (immPrevBtn) immPrevBtn.disabled = false;
    if (immNextBtn) immNextBtn.disabled = false;
    if (nextBook !== bookEl.value) { bookEl.value = nextBook; loadChapters(); }
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

  document.getElementById("ttsEndContinueBtn")?.addEventListener("click", continueHandler);
  document.getElementById("ttsEndReflectBtn")?.addEventListener("click", () => {
    ttsImmReflectionOpen();
  });
}

function _immCancelAutoRefl() {
  if (_immAutoReflTimer) { clearTimeout(_immAutoReflTimer); _immAutoReflTimer = null; }
  _immHideAutoReflBar();
}

function _immHideAutoReflBar() {
  const bar = document.getElementById("ttsImmAutoReflBar");
  if (bar) bar.hidden = true;
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

  const hasHistory = verseChatHistories[key]?.length > 0;

  mountEl.innerHTML = `
    <div class="verse-chat-wrapper ai-fade-in">
      <div class="chat-history${hasHistory ? "" : " hidden"}" id="chat-hist-${key}"></div>
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
  if (hasHistory) renderChatHistory(key, histEl);

  const performSend = async () => {
    const question = input.value.trim();
    if (!question) return;

    // Initialize history if empty
    if (!verseChatHistories[key]) verseChatHistories[key] = [];

    // Add User Message
    verseChatHistories[key].push({ role: "user", text: question });
    input.value = "";
    histEl.classList.remove("hidden");
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
  const dashBrand = document.getElementById("dashBrand");
  if (dashBrand) dashBrand.hidden = false;

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
      .replace(/([.!?,;:])(?=[a-zA-Z])/g, "$1 ")
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

  <div class="dash-greeting">
    <div class="dash-greeting-top">
      <div class="dash-greeting-text">${(() => { const h = new Date().getHours(); const g = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; const name = getUserName(); return name ? `${g}, ${name}!` : g; })()}</div>
      <button class="dash-name-edit-btn" onclick="_showNamePrompt(() => renderDashboard())" title="Edit name"><span class="material-icons">edit</span></button>
    </div>
    <div class="dash-greeting-date">${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
    <div id="dashGreetingMsg" class="dash-greeting-msg"></div>
  </div>
  
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

      <!-- NOTES -->
      <section class="dashboard-section">
        <h3 style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <span><span class="material-icons dashboard-icon">edit_note</span> Notes</span>
          <button class="dash-notes-open-btn" onclick="openNotesApp()">View all →</button>
        </h3>
        ${(() => {
          const sessions = _getSessions().slice(0, 3);
          if (!sessions.length) return `<p class="empty-state">No notes yet. Add notes to Bible verses, complete a Guided Reflection, or tap "View all" to write your first note.</p>`;
          return `<div class="dash-notes-list">${sessions.map(session => {
            const dateStr = new Date(session.time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            const allItems = [
              ...session.verse.map(n => ({ icon: "menu_book", label: n.title })),
              ...session.reflection.map(n => ({ icon: "volunteer_activism", label: n.title })),
              ...session.standalone.map(n => ({ icon: "edit_note", label: n.title || "Note" })),
            ];
            const visibleItems = allItems.slice(0, 3);
            const extra = allItems.length - 3;
            return `<div class="dash-notes-card" onclick="openNotesApp()">
              <div class="dash-notes-card-date">${dateStr}</div>
              <div class="dash-notes-card-items">
                ${visibleItems.map(i => `<div class="dash-notes-item"><span class="material-icons" style="font-size:14px;opacity:0.7;">${i.icon}</span><span class="dash-notes-item-label">${_escHtml(i.label)}</span></div>`).join("")}
                ${extra > 0 ? `<div class="dash-notes-item-more">+${extra} more</div>` : ""}
              </div>
            </div>`;
          }).join("")}</div>`;
        })()}
      </section>
      </div>
      </div>
      `;

  output.innerHTML = dashboardHTML;

  if (recentPassageId) {
    document.getElementById("continue-reading")?.classList.remove("hidden");
  }

  loadDashGreetingMsg();

  const favPrevBtn = document.getElementById("favPrevBtn");
  const favNextBtn = document.getElementById("favNextBtn");

  if (favPrevBtn) {
    favPrevBtn.onclick = () => changeFavoritesPage(-1);
  }
  if (favNextBtn) {
    favNextBtn.onclick = () => changeFavoritesPage(1);
  }
}

async function loadDashGreetingMsg() {
  const el = document.getElementById("dashGreetingMsg");
  if (!el) return;

  el.textContent = "";
  el.classList.remove("dash-greeting-msg-ready");
  el.innerHTML = `<span class="dash-greeting-glow-loader"><span class="gdot"></span><span class="gdot"></span><span class="gdot"></span></span>`;

  const name = getUserName();
  const sessions = _getSessions();
  const todayKey = (() => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; })();
  const todaySessions = sessions.filter(s => s.dateKey === todayKey);
  const hasActivityToday = todaySessions.length > 0;
  const lastRead = recentPassage || "";
  const h = new Date().getHours();
  const timeOfDay = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";

  const prompt = `You are a warm, uplifting Christian Bible devotion companion. Write ONE short sentence for a dashboard greeting.

User name: ${name || "friend"}
Time of day: ${timeOfDay}
Already read or reflected today: ${hasActivityToday ? "yes" : "no"}
Last passage they read: ${lastRead || "not yet"}

Tone rules — VERY IMPORTANT:
- Never imply they missed anything or failed to do something
- Never say "No worries", "don't worry", "you missed", "you haven't"
- If no activity yet: just warmly invite them — curiosity, excitement, not guilt
- If they have activity: celebrate it, keep the energy going
- Casual, like a friend — not a pastor, not a motivational poster
- Use their name once max, only if it feels natural
- No emojis, no "May God bless you", no generic phrases
- Max 15 words
- Reply with ONLY the sentence`;

  try {
    const res = await fetch("https://gemini-proxy-668755364170.asia-southeast1.run.app", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: "summary", contents: [{ parts: [{ text: prompt }] }] }),
    });
    const data = await res.json();
    const msg = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (msg) {
      el.textContent = "";
      // Add cursor then type letter by letter
      const cursor = document.createElement("span");
      cursor.className = "dash-greeting-cursor";
      el.appendChild(cursor);
      let i = 0;
      const type = () => {
        if (i < msg.length) {
          el.insertBefore(document.createTextNode(msg[i++]), cursor);
          setTimeout(type, 32);
        } else {
          // Remove cursor after typing done
          setTimeout(() => cursor.remove(), 600);
        }
      };
      type();
    } else {
      el.textContent = "";
    }
  } catch {
    el.textContent = "";
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
  const dashBrand = document.getElementById("dashBrand");
  if (dashBrand) dashBrand.hidden = true;

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
            <span class="verse-meta-indicators" style="display:inline-flex; align-items:center; margin-left:8px; opacity:0.6;">
              <span class="material-icons favorite-indicator" style="font-size:14px; margin-right:4px; ${
                isFav ? 'color:#c83086;"' : '"'
              } data-key="${key}">${isFav ? "favorite" : "favorite_border"}</span>
            </span>
          </div>
        </div>
        <div class="verse-actions">
          <button class="verse-action-btn" data-action="context"><span class="material-icons">auto_awesome</span><span>Context</span></button>
          <button class="verse-action-btn" data-action="ask"><span class="material-icons">chat_bubble_outline</span><span>Ask</span></button>
          <button class="verse-action-btn" data-action="note"><span class="material-icons">edit_note</span><span>Note</span></button>
        </div>
        <div class="inline-ai-mount"></div>
        <div class="comments ai-fade-in" hidden></div>
      `;

      // ... keep your existing listener code here ...
      const commentsEl = wrap.querySelector(".comments");
      const headerEl = wrap.querySelector(".verse-header");
      const aiBtn = wrap.querySelector('[data-action="context"]');

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

      const chatBtn = wrap.querySelector('[data-action="ask"]');
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

      const noteActionBtn = wrap.querySelector('[data-action="note"]');
      if (noteActionBtn) {
        noteActionBtn.onclick = (e) => {
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

  // Set loading flags synchronously before any await so playChapter()/ttsImmContextOpen()
  // always sees them as true when TTS opens the context screen right after this call.
  _contextLoading = true;
  _reflectionLoading = true;

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
    _contextLoading = false;
    _reflectionLoading = false;
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
    renderAIContextSummary().then(() => { _contextLoading = false; }),
    renderAIReflectionQuestions({ book, chapter, versesText }).then(() => {
      _reflectionLoading = false;
      // If TTS already finished while reflection was loading, show the reflect button now
      if (_ttsFinished) {
        const reflectBtn = document.getElementById("ttsImmReflectBtn");
        const ready = document.querySelectorAll('#aiReflection textarea[id^="reflection-"]').length > 0;
        if (reflectBtn && ready) {
          reflectBtn.hidden = false;
          reflectBtn.onclick = () => { _immCancelAutoRefl(); ttsImmReflectionOpen(); };
        }
      }
    }),
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

  let testText = `You are a friendly Bible reading companion helping someone prepare to read a passage.

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
padding: 1.25rem 1.5rem 1.75rem;
border-radius: 16px;
box-shadow: 0 12px 30px rgba(236, 72, 153, 0.45);
font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
color: #ffffff;
width: 100%;
margin-bottom: 0;
box-sizing: border-box;

Header rules (FIRST element inside div):
- A div containing TWO elements:
  1. A p tag with inline style: font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; opacity: 0.7; margin: 0 0 4px;
     Content: "Before you read"
  2. A p tag with inline style: font-size: 2.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: -3px; line-height: 1; margin: 0 0 1.25rem;
     Content: "{BOOK} {CHAPTER}" — use the actual book name and chapter number only

Section rules (AFTER the header div):
- Use a div with inline style: display: flex; flex-direction: column; gap: 14px;
- Inside, exactly 3 section divs, each with inline style: display: flex; gap: 10px; align-items: flex-start;
- Each section div contains:
  1. A span with inline style: font-family: 'Material Icons'; font-size: 18px; line-height: 1; flex-shrink: 0; margin-top: 2px; opacity: 0.9;
     The span content (text node) must be the Material Icon ligature name exactly:
     Section 1: info
     Section 2: bolt
     Section 3: visibility
  2. A div with inline style: flex: 1; font-size: 14px; line-height: 1.5; containing:
     - A strong tag: the section label (e.g. "Context", "What happens", "Watch for")
     - A br tag
     - Plain text: the content (1 sentence max, 20 words max)

CONTENT RULES:
- Section 1 (Context): One sentence — who wrote it and the key situation leading into this passage
- Section 2 (What happens): One sentence — the main event or action in this specific passage
- Section 3 (Watch for): One sentence — one specific thing (a word, theme, or moment) to notice while reading
- Tone: casual, like a friend texting you a heads-up before you read
- No academic language, no verse citations, no full summaries

TASK:
Prepare the reader for ${titleForGemini}.
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

  // 2. Note dot indicator (shows when notes exist, no interaction needed — Note button handles it)
  if (newCommentCount > 0) {
    const noteDot = document.createElement("span");
    noteDot.style.cssText = "width:6px;height:6px;border-radius:50%;background:#c83086;display:inline-block;margin-left:2px;flex-shrink:0;";
    metaIndicators.appendChild(noteDot);
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
if (vSelect) vSelect.value = currentVersion;

// Version pill toggle
function _updateVersionPills(ver) {
  document.querySelectorAll(".version-pill").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.ver === ver);
  });
}
_updateVersionPills(currentVersion);
document.querySelectorAll(".version-pill").forEach(btn => {
  btn.addEventListener("click", () => switchVersion(btn.dataset.ver));
});
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
        // Save timestamp for this devotion session so notes can group by correct day
        localStorage.setItem(`reflection-time-${devotionId()}`, String(Date.now()));
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

// One-time migration: backfill reflection-time-* from IndexedDB updatedAt
(async () => {
  if (localStorage.getItem("refl-time-migrated")) return;
  const passageIds = new Set();
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k.startsWith("reflection-") || k.startsWith("reflection-time-")) continue;
    const parts = k.split("-");
    const passageId = parts.slice(1, 4).join("-");
    if (!localStorage.getItem(`reflection-time-${passageId}`)) passageIds.add(passageId);
  }
  for (const pid of passageIds) {
    const entry = await dbGet(pid);
    if (entry?.updatedAt) localStorage.setItem(`reflection-time-${pid}`, String(entry.updatedAt));
  }
  localStorage.setItem("refl-time-migrated", "1");
})();

// ── User name ─────────────────────────────────────────────────────────────────
function getUserName() { return localStorage.getItem("userName") || ""; }

function _showNamePrompt(onDone) {
  const screen = document.getElementById("namePromptScreen");
  const input  = document.getElementById("namePromptInput");
  const btn    = document.getElementById("namePromptSubmit");
  if (!screen) return;
  input.value = getUserName();
  screen.hidden = false;
  requestAnimationFrame(() => screen.classList.add("name-prompt-visible"));
  const submit = () => {
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    localStorage.setItem("userName", name);
    screen.classList.remove("name-prompt-visible");
    screen.addEventListener("transitionend", () => { screen.hidden = true; }, { once: true });
    if (onDone) onDone(name);
  };
  btn.onclick = submit;
  input.onkeydown = e => { if (e.key === "Enter") submit(); };
  setTimeout(() => input.focus(), 300);
}

// ── Custom confirm dialog ──────────────────────────────────────────────────────
function _confirmDialog(message, onConfirm) {
  const dialog    = document.getElementById("confirmDialog");
  const msgEl     = document.getElementById("confirmMessage");
  const okBtn     = document.getElementById("confirmOk");
  const cancelBtn = document.getElementById("confirmCancel");
  if (!dialog) { if (confirm(message)) onConfirm(); return; }
  msgEl.textContent = message;
  dialog.hidden = false;
  requestAnimationFrame(() => dialog.classList.add("confirm-visible"));
  const close = () => {
    dialog.classList.remove("confirm-visible");
    dialog.addEventListener("transitionend", () => { dialog.hidden = true; }, { once: true });
  };
  okBtn.onclick = () => { close(); onConfirm(); };
  cancelBtn.onclick = close;
}

window.addEventListener("load", () => {
  const splash = document.getElementById("app-splash");

  setTimeout(() => {
    splash.classList.add("splash-hidden");
    if (!getUserName()) _showNamePrompt(() => renderDashboard());
  }, 2000);

  initNotesApp();
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

// ── NOTES APP ─────────────────────────────────────────────────────────────────

let _notesActiveId = null;
let _notesReturnNote = null; // stores note to reopen when returning from verse nav

function showBackToNotesBubble(note) {
  _notesReturnNote = note;
  let bubble = document.getElementById("backToNotesBubble");
  if (!bubble) {
    bubble = document.createElement("div");
    bubble.id = "backToNotesBubble";
    bubble.className = "back-to-notes-bubble";
    bubble.innerHTML = `<span class="material-symbols-outlined">arrow_back_ios_new</span> Back to Notes`;
    bubble.addEventListener("click", () => {
      const ret = _notesReturnNote;
      hideBubble();
      openNotesApp();
      if (ret) requestAnimationFrame(() => _openNoteDetail(ret));
    });
    document.body.appendChild(bubble);
  }
  bubble.classList.add("visible");
}

function hideBubble() {
  document.getElementById("backToNotesBubble")?.classList.remove("visible");
}

function _getAllNotes() {
  const notes = [];

  // 1. Verse notes — grouped by chapter (BOOKID-CH), not individual verse
  const chapterBuckets = {};
  Object.entries(comments).forEach(([key, list]) => {
    if (!list || !list.length) return;
    const parts = key.split("-");
    const bookId = parts[0], ch = parts[1];
    const chKey = `${bookId}-${ch}`;
    if (!chapterBuckets[chKey]) chapterBuckets[chKey] = { verseKeys: [], allItems: [], time: 0 };
    chapterBuckets[chKey].verseKeys.push(key);
    list.forEach(n => chapterBuckets[chKey].allItems.push({ ...n, verseKey: key }));
    chapterBuckets[chKey].time = Math.max(chapterBuckets[chKey].time, ...list.map(n => n.time));
  });
  Object.entries(chapterBuckets).forEach(([chKey, data]) => {
    const [bookId, ch] = chKey.split("-");
    const bookName = BIBLE_META[bookId]?.name || bookId;
    const verseNums = data.verseKeys.map(k => parseInt(k.split("-")[2] || "1")).sort((a,b) => a-b);
    const verseLabel = verseNums.length === 1 ? `verse ${verseNums[0]}` : `${verseNums.length} verses`;
    const latestItem = data.allItems.sort((a,b) => b.time - a.time)[0];
    notes.push({
      id: `verse-${chKey}`,
      type: "verse",
      chapterKey: chKey,
      passageKey: chKey,
      title: `${bookName} ${ch}`,
      subtitle: verseLabel,
      preview: latestItem?.text || "",
      time: data.time,
      verseKeys: data.verseKeys,
      allItems: data.allItems,
    });
  });

  // 2. Reflections
  const refls = {};
  for (let i = 0; i < localStorage.length; i++) {
    const lsKey = localStorage.key(i);
    if (!lsKey.startsWith("reflection-")) continue;
    const parts = lsKey.split("-");
    const passageId = parts.slice(1, 4).join("-");
    const rawValue = localStorage.getItem(lsKey);
    const answer = rawValue.split("\nA: ")[1]?.trim() || "";
    if (!answer) continue;
    if (!refls[passageId]) refls[passageId] = { QAs: [], time: 0 };
    refls[passageId].QAs.push({ raw: rawValue, lsKey });
    // Find time from: saved reflection timestamp, or matching verse comments
    const savedReflTime = parseInt(localStorage.getItem(`reflection-time-${passageId}`) || "0");
    const chPrefix = passageId.replace(/-$/, "");
    const commentTime = Math.max(0, ...Object.entries(comments)
      .filter(([k]) => k === chPrefix || k.startsWith(chPrefix + "-"))
      .flatMap(([, list]) => (list || []).map(n => n.time || 0)));
    refls[passageId].time = Math.max(refls[passageId].time, savedReflTime, commentTime);
  }
  Object.entries(refls).forEach(([passageId, data]) => {
    const [bookId, ch, verse] = passageId.split("-");
    const bookName = BIBLE_META[bookId]?.name || bookId;
    const ref = verse ? `${bookName} ${ch}:${verse}` : `${bookName} ${ch}`;
    const firstAnswer = data.QAs[0]?.raw.split("\nA: ")[1]?.trim() || "";
    notes.push({
      id: `refl-${passageId}`,
      type: "reflection",
      passageKey: passageId,
      title: ref,
      preview: firstAnswer,
      time: data.time || null, // null = unknown; excluded from session grouping
      QAs: data.QAs,
    });
  });

  // 3. Standalone notes
  const standalone = JSON.parse(localStorage.getItem("devotionStandaloneNotes") || "[]");
  standalone.forEach(n => {
    notes.push({
      id: `s-${n.id}`,
      type: "standalone",
      standaloneId: n.id,
      title: n.title || "Untitled",
      preview: (n.body || "").replace(/\n/g, " ").slice(0, 120),
      time: n.updatedAt,
      data: n,
    });
  });

  return notes.sort((a, b) => b.time - a.time);
}

function openNotesApp() {
  hideBubble();
  const el = document.getElementById("notesApp");
  if (!el) return;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add("notes-app-open"));
  _renderNotesList();
}

function closeNotesApp() {
  const el = document.getElementById("notesApp");
  if (!el) return;
  el.classList.remove("notes-app-open");
  el.addEventListener("transitionend", () => { el.hidden = true; }, { once: true });
  const detail = document.getElementById("notesDetailView");
  if (detail) { detail.classList.remove("notes-detail-open"); detail.hidden = true; }
  // Refresh dashboard if visible
  if (homeBtn && homeBtn.style.display === "none") renderDashboard();
}

// Group all notes into day-based devotion sessions
function _getSessions(filter = "") {
  const all = _getAllNotes();
  const q = filter.toLowerCase();
  const flat = all.filter(n => n.time != null && (!q || (n.title + " " + (n.subtitle||"") + " " + n.preview).toLowerCase().includes(q)));

  const buckets = {};
  flat.forEach(note => {
    // Use local date string as key so days are correct per device timezone
    const d = new Date(note.time);
    const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!buckets[dateKey]) buckets[dateKey] = { dateKey, time: 0, verse: [], reflection: [], standalone: [] };
    buckets[dateKey].time = Math.max(buckets[dateKey].time, note.time);
    buckets[dateKey][note.type].push(note);
  });

  return Object.values(buckets).sort((a, b) => b.time - a.time);
}

function _renderNotesList(filter = "") {
  const sessions = _getSessions(filter);
  const listEl = document.getElementById("notesList");
  const emptyEl = document.getElementById("notesEmptyState");
  const countEl = document.getElementById("notesCount");
  if (!listEl) return;

  if (!sessions.length) {
    listEl.innerHTML = "";
    if (emptyEl) emptyEl.hidden = false;
    if (countEl) countEl.textContent = "";
    return;
  }
  if (emptyEl) emptyEl.hidden = true;
  if (countEl) countEl.textContent = `${sessions.length} devotion${sessions.length !== 1 ? "s" : ""}`;

  let html = "";
  sessions.forEach(session => {
    const dateStr = new Date(session.time).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    // Build flat timeline items: verse notes first, then reflections, then standalone
    const timelineItems = [];
    session.verse.forEach(n => {
      const count = n.allItems?.length || 1;
      timelineItems.push({ icon: "menu_book", label: n.title, sub: `${count} verse note${count !== 1 ? "s" : ""}` });
    });
    session.reflection.forEach(n => {
      timelineItems.push({ icon: "volunteer_activism", label: n.title, sub: "Reflection" });
    });
    session.standalone.forEach(n => {
      timelineItems.push({ icon: "edit_note", label: n.title || "Untitled note", sub: n.preview ? _escHtml(n.preview.slice(0, 40)) : "" });
    });

    const MAX_VISIBLE = 4;
    const visible = timelineItems.slice(0, MAX_VISIBLE);
    const extra = timelineItems.length - MAX_VISIBLE;

    const timelineHTML = visible.map(item => {
      return `<div class="nst-item">
        <span class="material-icons nst-icon">${item.icon}</span>
        <span class="nst-label">${_escHtml(item.label)}</span>
        ${item.sub ? `<span class="nst-sub">${item.sub}</span>` : ""}
      </div>`;
    }).join("") + (extra > 0 ? `<div class="nst-more">+${extra} more</div>` : "");

    html += `
      <div class="notes-card notes-session-card" data-session-key="${session.dateKey}">
        <div class="notes-card-date">${dateStr}</div>
        <div class="notes-session-timeline">${timelineHTML}</div>
      </div>`;
  });
  listEl.innerHTML = html;

  listEl.querySelectorAll(".notes-session-card").forEach(card => {
    card.addEventListener("click", () => {
      const session = sessions.find(s => s.dateKey === card.dataset.sessionKey);
      if (session) _openSessionDetail(session);
    });
  });
}

function _openSessionDetail(session) {
  const detailView = document.getElementById("notesDetailView");
  if (!detailView) return;

  const deleteBtn = document.getElementById("notesDetailDelete");
  const shareBtn  = document.getElementById("notesDetailShare");
  if (deleteBtn) deleteBtn.hidden = true;
  if (shareBtn)  shareBtn.onclick = () => _shareSession(session);

  const content = document.getElementById("notesDetailContent");
  if (!content) return;

  const dateStr = new Date(session.time).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  let html = `<div class="notes-detail-title">${dateStr}</div>`;

  // Verse notes per chapter
  session.verse.forEach(note => {
    html += `
      <div class="notes-session-section">
        <div class="notes-session-section-label"><span class="material-icons" style="font-size:13px;vertical-align:middle;margin-right:4px;">menu_book</span>${_escHtml(note.title)}</div>`;
    // Group by verse key within the chapter
    const byVerse = {};
    (note.allItems || []).forEach(item => {
      const vk = item.verseKey || note.passageKey;
      const vNum = vk.split("-")[2] || "?";
      if (!byVerse[vNum]) byVerse[vNum] = [];
      byVerse[vNum].push(item);
    });
    Object.entries(byVerse).sort((a,b) => parseInt(a[0])-parseInt(b[0])).forEach(([vNum, items]) => {
      html += `<div class="notes-session-verse-group">
        <span class="notes-session-verse-num">v${vNum}</span>
        <div class="notes-session-verse-notes">${items.map(i => `<div class="notes-verse-item-text">${_escHtml(i.text)}</div>`).join("")}</div>
      </div>`;
    });
    html += `<button class="notes-go-passage-btn" data-passage="${note.passageKey}">
      <span class="material-symbols-outlined">menu_book</span> Go to passage
    </button></div>`;
  });

  // Reflections
  session.reflection.forEach(note => {
    html += `
      <div class="notes-session-section">
        <div class="notes-session-section-label"><span class="material-icons" style="font-size:13px;vertical-align:middle;margin-right:4px;">volunteer_activism</span>Reflection · ${_escHtml(note.title)}</div>
        <div class="notes-refl-qas">${note.QAs.map(qa => {
          const parts = qa.raw.split("\nA: ");
          const q = parts[0].replace("Q: ", "").trim();
          const a = parts[1]?.trim() || "";
          return `<div class="notes-refl-qa"><div class="notes-refl-q">${_escHtml(q)}</div><div class="notes-refl-a">${_escHtml(a)}</div></div>`;
        }).join("")}</div>
        <button class="notes-go-passage-btn" data-passage="${note.passageKey}">
          <span class="material-symbols-outlined">menu_book</span> Go to passage
        </button>
      </div>`;
  });

  // Standalone notes
  session.standalone.forEach(note => {
    const hasBody = note.data?.bodyHTML || note.data?.body;
    html += `
      <div class="notes-session-section notes-session-standalone-card" data-standalone-id="${note.standaloneId}">
        <div class="notes-session-standalone-header">
          <div class="notes-session-section-label"><span class="material-icons" style="font-size:13px;vertical-align:middle;margin-right:4px;">edit_note</span>${_escHtml(note.title || "Untitled Note")}</div>
          <div class="notes-session-standalone-actions">
            <button class="notes-session-copy-btn" data-standalone-id="${note.standaloneId}" title="Copy this note">
              <span class="material-symbols-outlined">content_copy</span>
            </button>
            <button class="notes-session-edit-btn" data-standalone-id="${note.standaloneId}">Edit</button>
            <button class="notes-session-del-btn" data-standalone-id="${note.standaloneId}" title="Delete note">
              <span class="material-symbols-outlined">delete</span>
            </button>
          </div>
        </div>
        ${hasBody ? `<div class="notes-session-standalone-body">${note.data?.bodyHTML || _escHtml(note.data?.body || "")}</div>` : `<div class="notes-session-standalone-empty">Empty note</div>`}
      </div>`;
  });

  content.innerHTML = html;

  // Wire passage buttons
  content.querySelectorAll(".notes-go-passage-btn[data-passage]").forEach(btn => {
    btn.addEventListener("click", () => {
      const [bookId, ch] = btn.dataset.passage.split("-");
      closeNotesApp();
      loadPassageById(`${bookId}-${ch}-`);
      showBackToNotesBubble(null);
    });
  });
  // Wire copy standalone buttons
  content.querySelectorAll(".notes-session-copy-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const standalone = JSON.parse(localStorage.getItem("devotionStandaloneNotes") || "[]");
      const noteData = standalone.find(n => n.id === btn.dataset.standaloneId);
      if (!noteData) return;
      const text = `📝 ${noteData.title || "Note"}\n${noteData.body || ""}`;
      navigator.clipboard.writeText(text).then(() => {
        const toast = document.createElement("div");
        toast.className = "notes-toast";
        toast.textContent = "✅ Note copied";
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
      });
    });
  });
  // Wire edit standalone buttons
  content.querySelectorAll(".notes-session-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const standalone = JSON.parse(localStorage.getItem("devotionStandaloneNotes") || "[]");
      const noteData = standalone.find(n => n.id === btn.dataset.standaloneId);
      if (noteData) _openNoteDetail({ id: `s-${noteData.id}`, type: "standalone", standaloneId: noteData.id, title: noteData.title, preview: "", time: noteData.updatedAt, data: noteData });
    });
  });
  // Wire delete standalone buttons
  content.querySelectorAll(".notes-session-del-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      _confirmDialog("Delete this note?", () => {
        const standalone = JSON.parse(localStorage.getItem("devotionStandaloneNotes") || "[]");
        localStorage.setItem("devotionStandaloneNotes", JSON.stringify(standalone.filter(n => n.id !== btn.dataset.standaloneId)));
        btn.closest(".notes-session-standalone-card").remove();
      });
    });
  });

  detailView.hidden = false;
  requestAnimationFrame(() => detailView.classList.add("notes-detail-open"));
}

function _shareSession(session) {
  const dateStr = new Date(session.time).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  let text = `${dateStr}\n${"─".repeat(30)}\n\n`;
  session.verse.forEach(note => {
    text += `📖 ${note.title}\n`;
    (note.allItems || []).forEach(item => { text += `  v${item.verseKey?.split("-")[2] || "?"}: ${item.text}\n`; });
    text += "\n";
  });
  session.reflection.forEach(note => {
    text += `🙏 Reflection · ${note.title}\n`;
    note.QAs.forEach(qa => {
      const p = qa.raw.split("\nA: ");
      text += `  Q: ${p[0].replace("Q: ","").trim()}\n  A: ${p[1]?.trim()||""}\n\n`;
    });
  });
  session.standalone.forEach(note => {
    text += `📝 ${note.title || "Note"}\n${note.data?.body || ""}\n\n`;
  });
  navigator.clipboard.writeText(text).then(() => {
    const toast = document.createElement("div");
    toast.className = "notes-toast";
    toast.textContent = "✅ Copied to clipboard";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  });
}

function _openNoteDetail(note) {
  _notesActiveId = note.id;
  const detailView = document.getElementById("notesDetailView");
  if (!detailView) return;
  _renderNoteDetail(note);
  detailView.hidden = false;
  requestAnimationFrame(() => detailView.classList.add("notes-detail-open"));
}

function _closeNoteDetail() {
  const detailView = document.getElementById("notesDetailView");
  if (!detailView) return;
  detailView.classList.remove("notes-detail-open");
  detailView.addEventListener("transitionend", () => { detailView.hidden = true; }, { once: true });
  _notesActiveId = null;
  _renderNotesList(document.getElementById("notesSearch")?.value || "");
}

function _renderNoteDetail(note) {
  const content = document.getElementById("notesDetailContent");
  const deleteBtn = document.getElementById("notesDetailDelete");
  const shareBtn = document.getElementById("notesDetailShare");
  if (!content) return;

  if (deleteBtn) {
    deleteBtn.hidden = note.type !== "standalone";
    deleteBtn.onclick = note.type === "standalone" ? () => _deleteStandaloneNote(note.standaloneId) : null;
  }
  if (shareBtn) shareBtn.onclick = () => _shareNote(note);

  if (note.type === "standalone") _renderStandaloneEditor(note.data, content);
  else if (note.type === "verse") _renderVerseNoteDetail(note, content);
  else if (note.type === "reflection") _renderReflNoteDetail(note, content);
}

function _renderVerseNoteDetail(note, container) {
  const [bookId, ch, verse] = note.passageKey.split("-");
  const verseText = getVerseText(bookId, ch, verse || "1");
  const dateStr = new Date(note.time).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  container.innerHTML = `
    <div class="notes-detail-title">${_escHtml(note.title)}</div>
    <div class="notes-detail-meta">${note.items.length} note${note.items.length !== 1 ? "s" : ""} · ${dateStr}</div>
    ${verseText ? `<div class="notes-detail-verse-quote">"${_escHtml(verseText)}"</div>` : ""}
    <div class="notes-detail-section-label">Your Notes</div>
    <div class="notes-verse-items">
      ${note.items.map(item => `
        <div class="notes-verse-item">
          <div class="notes-verse-item-text">${_escHtml(item.text)}</div>
          <div class="notes-verse-item-time">${new Date(item.time).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
        </div>`).join("")}
    </div>
    <button class="notes-go-passage-btn" id="notesGoPassage">
      <span class="material-symbols-outlined">menu_book</span> Go to passage
    </button>`;
  container.querySelector("#notesGoPassage")?.addEventListener("click", () => {
    loadPassageById(note.passageKey);
    closeNotesApp();
  });
}

function _renderReflNoteDetail(note, container) {
  const dateStr = new Date(note.time).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  container.innerHTML = `
    <div class="notes-detail-title">${_escHtml(note.title)}</div>
    <div class="notes-detail-subtitle">Guided Reflection</div>
    <div class="notes-detail-meta">${note.QAs.length} question${note.QAs.length !== 1 ? "s" : ""} answered · ${dateStr}</div>
    <div class="notes-detail-section-label">Reflection Q&amp;A</div>
    <div class="notes-refl-qas">
      ${note.QAs.map(qa => {
        const parts = qa.raw.split("\nA: ");
        const q = parts[0].replace("Q: ", "").trim();
        const a = parts[1]?.trim() || "";
        return `<div class="notes-refl-qa">
          <div class="notes-refl-q">${_escHtml(q)}</div>
          <div class="notes-refl-a">${_escHtml(a)}</div>
        </div>`;
      }).join("")}
    </div>
    <button class="notes-go-passage-btn" id="notesGoPassage">
      <span class="material-symbols-outlined">menu_book</span> Go to passage
    </button>`;
  container.querySelector("#notesGoPassage")?.addEventListener("click", () => {
    loadPassageById(note.passageKey);
    closeNotesApp();
  });
}

// Parse "Psalms 117:1" / "John 3:16-20" / "Genesis 1" → "PSA-117-1" / "JN-3-16" / "GEN-1-"
function _refToPassageId(ref) {
  const match = ref.match(/^(.+?)\s+(\d+)(?::(\d+))?/);
  if (!match) return null;
  const [, bookName, ch, verse] = match;
  const bookId = Object.keys(BIBLE_META).find(k =>
    BIBLE_META[k].name.toLowerCase() === bookName.toLowerCase()
  );
  if (!bookId) return null;
  return `${bookId}-${ch}-${verse || ""}`;
}

function _renderStandaloneEditor(data, container) {
  const dateStr = new Date(data.updatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

  // Convert plain-text body to HTML for contenteditable (migrate old notes)
  let bodyHTML = data.bodyHTML || "";
  if (!bodyHTML && data.body) {
    bodyHTML = data.body.split("\n").map(l => l ? `<p>${_escHtml(l)}</p>` : `<br>`).join("");
  }

  // Build book options from BIBLE_META
  const bookOpts = Object.entries(BIBLE_META).map(([k, v]) =>
    `<option value="${k}">${v.name}</option>`).join("");

  container.innerHTML = `
    <input class="notes-editor-title" id="notesEditorTitle" value="${_escHtml(data.title || "")}" placeholder="Title">
    <div class="notes-editor-date" id="notesEditorDate">${dateStr}</div>
    <div class="notes-editor-toolbar" id="notesEditorToolbar">
      <button class="ne-tool" data-cmd="bold" title="Bold"><b>B</b></button>
      <button class="ne-tool" data-cmd="italic" title="Italic"><i>I</i></button>
      <div class="ne-tool-sep"></div>
      <button class="ne-tool" data-cmd="heading" title="Heading">H</button>
      <div class="ne-tool-sep"></div>
      <button class="ne-tool ne-tool-verse" id="neVerseBtn" title="Insert verse"><span class="material-icons" style="font-size:15px;vertical-align:middle;">menu_book</span> Verse</button>
    </div>
    <div class="notes-editor-body" id="notesEditorBody" contenteditable="true" data-placeholder="Start writing…">${bodyHTML}</div>
    <div class="ne-verse-picker" id="neVersePicker" hidden>
      <div class="ne-verse-mode-row">
        <button class="ne-mode-btn active" data-mode="single">Single verse</button>
        <button class="ne-mode-btn" data-mode="range">Range</button>
        <button class="ne-mode-btn" data-mode="chapter">Whole chapter</button>
      </div>
      <div class="ne-verse-picker-row">
        <select class="ne-verse-sel" id="nePickerBook">${bookOpts}</select>
        <select class="ne-verse-sel" id="nePickerChapter"></select>
        <select class="ne-verse-sel ne-picker-verse" id="nePickerVerseFrom"></select>
        <select class="ne-verse-sel ne-picker-verse-to" id="nePickerVerseTo" hidden></select>
      </div>
      <button class="ne-verse-insert-btn" id="neVerseInsert">Insert</button>
    </div>`;

  const titleEl  = container.querySelector("#notesEditorTitle");
  const bodyEl   = container.querySelector("#notesEditorBody");
  const toolbar  = container.querySelector("#notesEditorToolbar");
  const picker   = container.querySelector("#neVersePicker");

  // Backspace deletes whole verse block as one unit (mobile + desktop)
  bodyEl.addEventListener("beforeinput", e => {
    if (e.inputType !== "deleteContentBackward") return;
    const sel = window.getSelection();
    if (!sel || !sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    let node = range.startContainer;
    const offset = range.startOffset;
    // Find what block-level element we're at the start of
    let checkNode = null;
    if (node === bodyEl) {
      checkNode = bodyEl.childNodes[offset - 1];
    } else if (offset === 0) {
      // Walk up to find our top-level child in bodyEl
      let el = node;
      while (el.parentNode && el.parentNode !== bodyEl) el = el.parentNode;
      checkNode = el.previousSibling;
    }
    if (checkNode?.classList?.contains("note-verse-block")) {
      e.preventDefault();
      checkNode.remove();
      autoSave();
    }
  });

  // Verse block: X to delete, click to navigate
  bodyEl.addEventListener("click", e => {
    // Delete button
    if (e.target.closest(".nvb-delete")) {
      const block = e.target.closest(".note-verse-block");
      if (block) { block.remove(); autoSave(); }
      return;
    }
    // Navigate to passage (always load whole chapter, then scroll to verse)
    const block = e.target.closest(".note-verse-block");
    if (!block) return;
    const ref = block.dataset.ref || "";
    const fullId = _refToPassageId(ref);
    if (!fullId) return;
    const [bookId, ch, verse] = fullId.split("-");
    const returnNote = { id: `s-${data.id}`, type: "standalone", standaloneId: data.id, title: data.title, preview: "", time: data.updatedAt, data };
    closeNotesApp();
    loadPassageById(`${bookId}-${ch}-`); // always chapter view
    showBackToNotesBubble(returnNote);
    if (verse) {
      setTimeout(() => {
        const target = [...document.querySelectorAll("#output .verse")]
          .find(el => el.querySelector(".verse-num")?.textContent?.trim() === verse);
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 600);
    }
  });

  let saveTimer, savedRange = null;
  const autoSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      data.title   = titleEl.value;
      data.bodyHTML = bodyEl.innerHTML;
      data.body    = bodyEl.innerText; // plain text fallback
      data.updatedAt = Date.now();
      container.querySelector("#notesEditorDate").textContent =
        new Date(data.updatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
      _updateStandaloneNote(data);
    }, 500);
  };
  titleEl.addEventListener("input", autoSave);
  bodyEl.addEventListener("input", autoSave);

  // Toolbar commands
  toolbar.addEventListener("mousedown", e => {
    const btn = e.target.closest("[data-cmd]");
    if (!btn) return;
    e.preventDefault();
    const cmd = btn.dataset.cmd;
    if (cmd === "bold" || cmd === "italic") {
      document.execCommand(cmd);
    } else if (cmd === "heading") {
      const sel = window.getSelection();
      const block = sel?.anchorNode?.parentElement?.closest("h1,h2,h3,p,div");
      const isHeading = block && /^H[1-6]$/.test(block.tagName);
      document.execCommand("formatBlock", false, isHeading ? "p" : "h2");
    }
    autoSave();
  });

  // Save cursor position on mousedown (fires before editor loses focus)
  let neVerseBtn = container.querySelector("#neVerseBtn");
  neVerseBtn.addEventListener("mousedown", e => {
    e.preventDefault(); // keep focus in editor
    const sel = window.getSelection();
    if (sel && sel.rangeCount && bodyEl.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      savedRange = sel.getRangeAt(0).cloneRange();
    }
  });
  neVerseBtn.addEventListener("click", () => {
    picker.hidden = !picker.hidden;
    neVerseBtn.classList.toggle("active", !picker.hidden);
    if (!picker.hidden) _nePopulateChapters();
  });

  // Mode selector
  let neMode = "single"; // single | range | chapter
  picker.querySelectorAll(".ne-mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      neMode = btn.dataset.mode;
      picker.querySelectorAll(".ne-mode-btn").forEach(b => b.classList.toggle("active", b === btn));
      _neApplyMode();
    });
  });

  function _neApplyMode() {
    const verseFromEl = container.querySelector("#nePickerVerseFrom");
    const verseToEl   = container.querySelector("#nePickerVerseTo");
    if (neMode === "chapter") {
      verseFromEl.hidden = true;
      verseToEl.hidden   = true;
    } else if (neMode === "range") {
      verseFromEl.hidden = false;
      verseToEl.hidden   = false;
    } else { // single
      verseFromEl.hidden = false;
      verseToEl.hidden   = true;
    }
  }

  // Verse picker selects
  container.querySelector("#nePickerBook").addEventListener("change", _nePopulateChapters);
  container.querySelector("#nePickerChapter").addEventListener("change", _nePopulateVerses);

  // Insert verse block
  container.querySelector("#neVerseInsert").addEventListener("click", () => {
    const book     = container.querySelector("#nePickerBook").value;
    const ch       = container.querySelector("#nePickerChapter").value;
    const vFromEl  = container.querySelector("#nePickerVerseFrom");
    const vToEl    = container.querySelector("#nePickerVerseTo");
    const vFrom    = neMode !== "chapter" ? vFromEl.value : "";
    const vTo      = neMode === "range"   ? vToEl.value  : "";
    const bookName = BIBLE_META[book]?.name || book;

    // Collect verse texts
    const verses = [];
    if (neMode === "chapter") {
      const total = BIBLE_META[book]?.chapters[parseInt(ch)-1] || 1;
      for (let v = 1; v <= Math.min(total, 30); v++) {
        const t = getVerseText(book, ch, String(v));
        if (t && t !== "Verse text not found.") verses.push({ n: v, t });
      }
    } else {
      const start = parseInt(vFrom) || 1;
      const end   = neMode === "range" && vTo ? parseInt(vTo) : start;
      for (let v = start; v <= end; v++) {
        const t = getVerseText(book, ch, String(v));
        if (t && t !== "Verse text not found.") verses.push({ n: v, t });
      }
    }

    const refLabel = neMode === "chapter"
      ? `${bookName} ${ch}`
      : `${bookName} ${ch}:${vFrom}${neMode === "range" && vTo && vTo !== vFrom ? "–"+vTo : ""}`;
    const versesHTML = verses.map(v => `<span class="nvb-verse"><sup class="nvb-num">${v.n}</sup>${_escHtml(v.t)}</span>`).join(" ");
    const blockHTML = `<div class="note-verse-block" contenteditable="false" data-ref="${_escHtml(refLabel)}"><button class="nvb-delete" contenteditable="false">✕</button><div class="nvb-ref"><span class="material-icons" style="font-size:13px;vertical-align:middle;margin-right:3px;">menu_book</span>${_escHtml(refLabel)}</div><div class="nvb-body">${versesHTML}</div></div><p><br></p>`;

    // Insert at saved cursor position
    bodyEl.focus();
    if (savedRange) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
      savedRange = null;
    }
    document.execCommand("insertHTML", false, blockHTML);
    picker.hidden = true;
    neVerseBtn.classList.remove("active");
    autoSave();
  });

  function _nePopulateChapters() {
    const book = container.querySelector("#nePickerBook").value;
    const chapters = BIBLE_META[book]?.chapters || [];
    const chSel = container.querySelector("#nePickerChapter");
    chSel.innerHTML = chapters.map((_,i) => `<option value="${i+1}">${i+1}</option>`).join("");
    _nePopulateVerses();
  }
  function _nePopulateVerses() {
    const book  = container.querySelector("#nePickerBook").value;
    const ch    = container.querySelector("#nePickerChapter").value;
    const total = BIBLE_META[book]?.chapters[parseInt(ch)-1] || 1;
    const verseOpts = Array.from({length:total},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join("");
    container.querySelector("#nePickerVerseFrom").innerHTML = verseOpts;
    container.querySelector("#nePickerVerseTo").innerHTML   = verseOpts;
  }
  _nePopulateChapters();
  _neApplyMode();

  if (!data.title) setTimeout(() => titleEl.focus(), 100);
  else setTimeout(() => bodyEl.focus(), 100);
}

function _createNewNote() {
  const id = `note_${Date.now()}`;
  const note = { id, title: "", body: "", createdAt: Date.now(), updatedAt: Date.now() };
  const standalone = JSON.parse(localStorage.getItem("devotionStandaloneNotes") || "[]");
  standalone.unshift(note);
  localStorage.setItem("devotionStandaloneNotes", JSON.stringify(standalone));
  _openNoteDetail({ id: `s-${id}`, type: "standalone", standaloneId: id, title: "", preview: "", time: note.updatedAt, data: note });
}

function _updateStandaloneNote(updated) {
  const standalone = JSON.parse(localStorage.getItem("devotionStandaloneNotes") || "[]");
  const idx = standalone.findIndex(n => n.id === updated.id);
  if (idx >= 0) standalone[idx] = updated;
  localStorage.setItem("devotionStandaloneNotes", JSON.stringify(standalone));
}

function _deleteStandaloneNote(noteId) {
  _confirmDialog("Delete this note?", () => {
    const standalone = JSON.parse(localStorage.getItem("devotionStandaloneNotes") || "[]");
    localStorage.setItem("devotionStandaloneNotes", JSON.stringify(standalone.filter(n => n.id !== noteId)));
    _closeNoteDetail();
  });
}

function _shareNote(note) {
  let text = `${note.title}\n\n`;
  if (note.type === "verse") note.items.forEach(item => { text += `• ${item.text}\n`; });
  else if (note.type === "reflection") note.QAs.forEach(qa => { const p = qa.raw.split("\nA: "); text += `Q: ${p[0].replace("Q: ","").trim()}\nA: ${p[1]?.trim()||""}\n\n`; });
  else text += note.data?.body || "";
  navigator.clipboard.writeText(text).then(() => {
    const toast = document.createElement("div");
    toast.className = "notes-toast";
    toast.textContent = "✅ Copied to clipboard";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  });
}

function _escHtml(str) {
  return (str || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function initNotesApp() {
  document.getElementById("notesAppClose")?.addEventListener("click", closeNotesApp);
  document.getElementById("notesDetailBack")?.addEventListener("click", _closeNoteDetail);
  document.getElementById("notesNewBtn")?.addEventListener("click", _createNewNote);
  document.getElementById("notesSearch")?.addEventListener("input", e => _renderNotesList(e.target.value));
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
  // Reflect btn starts hidden — only revealed when TTS finishes AND reflection is loaded
  const reflectBtn = document.getElementById("ttsImmReflectBtn");
  if (reflectBtn) reflectBtn.hidden = true;

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
  _immCancelAutoRefl();
  if (_immVerseUpdateTimer) { clearTimeout(_immVerseUpdateTimer); _immVerseUpdateTimer = null; }
  // Reset all panels and any disabled states
  const pausePanel = document.getElementById("ttsImmPausePanel");
  if (pausePanel) pausePanel.hidden = true;
  const pauseActionsRow = document.querySelector(".tts-imm-pause-actions");
  if (pauseActionsRow) pauseActionsRow.hidden = false;
  ["ttsImmPauseNote","ttsImmPauseContext","ttsImmPauseAsk"].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.classList.remove("active");
  });
  const immPauseBtn = document.getElementById("ttsImmPauseBtn");
  if (immPauseBtn) { immPauseBtn.disabled = false; immPauseBtn.classList.remove("tts-imm-btn-pulse"); }
  const immPrevBtn = document.getElementById("ttsImmPrevBtn");
  if (immPrevBtn) immPrevBtn.disabled = false;
  const immNextBtn = document.getElementById("ttsImmNextBtn");
  if (immNextBtn) immNextBtn.disabled = false;
  const ctxPanel = document.getElementById("ttsImmContextPanel");
  if (ctxPanel) ctxPanel.hidden = true;
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

function ttsImmContextOpen(gen) {
  const el = document.getElementById("ttsImmersive");
  if (!el) return;

  el.hidden = false;

  // Hide stage + footer, hide reflection panel, hide reflect btn
  const stage = document.querySelector(".tts-imm-stage");
  if (stage) stage.style.display = "none";
  const footer = document.querySelector(".tts-imm-footer");
  if (footer) footer.style.display = "none";
  const reflPanel = document.getElementById("ttsImmReflPanel");
  if (reflPanel) reflPanel.hidden = true;
  const reflectBtn = document.getElementById("ttsImmReflectBtn");
  if (reflectBtn) reflectBtn.hidden = true;

  // Set passage title
  const name = BIBLE_META[bookEl?.value]?.name || "";
  const ch = chapterEl?.value || "";
  const titleEl = document.getElementById("ttsImmTitle");
  if (titleEl) titleEl.textContent = name && ch ? `${name} ${ch}` : "";

  // Close button stops TTS
  document.getElementById("ttsImmCloseBtn").onclick = stopTTS;

  // Populate context content
  const ctxPanel = document.getElementById("ttsImmContextPanel");
  const ctxContent = document.getElementById("ttsImmContextContent");
  if (ctxContent) {
    if (_contextLoading) {
      ctxContent.innerHTML = `<div class="tts-imm-ctx-loading"><div class="tts-imm-ctx-spinner"></div><p>Loading context…</p></div>`;
      const obs = new MutationObserver(() => {
        ctxContent.innerHTML = aiContextSummaryEl.innerHTML;
        if (!_contextLoading) obs.disconnect();
      });
      obs.observe(aiContextSummaryEl, { childList: true, subtree: true, characterData: true });
    } else {
      ctxContent.innerHTML = aiContextSummaryEl.innerHTML;
    }
  }
  if (ctxPanel) ctxPanel.hidden = false;

  // "Start Reading" button: hide context, show stage+footer, start TTS
  const startBtn = document.getElementById("ttsImmContextStart");
  if (startBtn) {
    startBtn.onclick = () => {
      if (gen !== ttsGen) return;
      if (ctxPanel) ctxPanel.hidden = true;

      const stage = document.querySelector(".tts-imm-stage");
      if (stage) stage.style.display = "";
      const footer = document.querySelector(".tts-imm-footer");
      if (footer) footer.style.display = "";

      const immBar = document.getElementById("ttsImmLoadBar");
      if (immBar) {
        // Reflect actual synthesis progress — may already be 100% if user read the context slowly
        const pct = ttsQueue.length > 0 ? `${(_ttsReadyCount / ttsQueue.length) * 100}%` : "0%";
        immBar.style.width = pct;
      }
      const immStatus = document.getElementById("ttsImmStatusEl");
      if (immStatus) immStatus.textContent = "";

      ttsImmersiveBuildScrubber();
      document.getElementById("ttsImmPrevBtn").onclick = ttsPrevVerse;
      document.getElementById("ttsImmNextBtn").onclick = ttsNextVerse;
      document.getElementById("ttsImmPauseBtn").onclick = pauseResumeTTS;
      document.getElementById("ttsImmSlotPrev").onclick = () => { if (ttsIdx > 0) ttsPrevVerse(); };
      document.getElementById("ttsImmSlotNext").onclick = () => { if (ttsIdx < ttsQueue.length - 1) ttsNextVerse(); };
      const curSlot = document.getElementById("ttsImmSlotCur");
      if (curSlot) curSlot.addEventListener("click", _immHandleDoubleTap);

      ttsPlayAt(0, gen);
    };
  }
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

  // Cancel any in-flight deferred update
  if (_immVerseUpdateTimer) {
    clearTimeout(_immVerseUpdateTimer);
    _immVerseUpdateTimer = null;
    const cs = document.getElementById("ttsImmSlotCur");
    if (cs) cs.classList.remove("tts-verse-exit", "tts-verse-anim");
  }

  // Phase 1: exit animation on current slot, fade side slots out
  const curSlot  = document.getElementById("ttsImmSlotCur");
  const prevSlot = document.getElementById("ttsImmSlotPrev");
  const nextSlot = document.getElementById("ttsImmSlotNext");
  if (curSlot) {
    curSlot.classList.remove("tts-verse-anim");
    void curSlot.offsetWidth;
    curSlot.classList.add("tts-verse-exit");
  }
  if (prevSlot) prevSlot.style.opacity = "0";
  if (nextSlot) nextSlot.style.opacity = "0";

  // Phase 2: after exit, swap content and animate in
  _immVerseUpdateTimer = setTimeout(() => {
    _immVerseUpdateTimer = null;

    // Prev slot
    const prevNum  = document.getElementById("ttsImmPrevNum");
    const prevText = document.getElementById("ttsImmPrevText");
    if (prevNum)  prevNum.textContent  = prev ? `Verse ${prev.verseNum}` : "";
    if (prevText) prevText.textContent = prev ? _immPreview(prev.text) : "";

    // Current slot
    const curNum  = document.getElementById("ttsImmCurNum");
    const curText = document.getElementById("ttsImmCurText");
    if (curSlot) {
      curSlot.classList.remove("tts-verse-exit");
      if (curNum)  curNum.textContent  = `Verse ${cur.verseNum}`;
      if (curText) curText.textContent = cur.text;
      void curSlot.offsetWidth;
      curSlot.classList.add("tts-verse-anim");
    } else {
      if (curNum)  curNum.textContent  = `Verse ${cur.verseNum}`;
      if (curText) curText.textContent = cur.text;
    }

    // Next slot
    const nextNum  = document.getElementById("ttsImmNextNum");
    const nextText = document.getElementById("ttsImmNextText");
    if (nextNum)  nextNum.textContent  = next ? `Verse ${next.verseNum}` : "";
    if (nextText) nextText.textContent = next ? _immPreview(next.text) : "";

    // Restore side slot opacity (CSS transition handles fade-in)
    if (prevSlot) prevSlot.style.opacity = "";
    if (nextSlot) nextSlot.style.opacity = "";

    // Favorite badge for current verse
    const favBadge = document.getElementById("ttsImmFavBadge");
    if (favBadge && cur) {
      const curKey = keyOf(bookEl.value, chapterEl.value, cur.verseNum);
      favBadge.classList.toggle("visible", isFavorite(curKey));
    }

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
  }, 120);
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
    // Update persistent fav badge
    const favBadge = document.getElementById("ttsImmFavBadge");
    if (favBadge) favBadge.classList.toggle("visible", isFavorite(key));
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
  myArea.focus({ preventScroll: true });

  const backBtn = document.getElementById("ttsImmReflBack");
  const nextBtn = document.getElementById("ttsImmReflNext");
  const copyBtn = document.getElementById("ttsImmReflCopy");
  const doneBtn = document.getElementById("ttsImmReflDone");
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
    if (doneBtn) doneBtn.hidden = true;
  } else {
    nextBtn.hidden = true;
    copyBtn.hidden = false;
    copyBtn.onclick = async () => {
      await copyNotesBtn.onclick?.();
      statusEl.textContent = "✅ Notes copied!";
      setTimeout(() => { statusEl.textContent = ""; }, 2500);
    };
    if (doneBtn) {
      doneBtn.hidden = false;
      doneBtn.onclick = () => stopTTS();
    }
  }
}

function _immParseVerseRefs(text) {
  // Escape HTML first, then replace verse refs with tappable chips
  // Handles: v. 1, v1, vv. 2-3, vv2-3, vv 3-5
  const escaped = text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  return escaped.replace(/\bvv?\.?\s*(\d+)(?:\s*[-–]\s*(\d+))?/gi, (match, start, end) => {
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
