// Global error catcher for iOS debugging
window.onerror = function(msg, src, line, col, err) {
  alert("JS Error: " + msg + "\nLine: " + line + "\nFile: " + (src||"").split("/").pop());
};
window.addEventListener("unhandledrejection", function(e) {
  alert("Promise Error: " + (e.reason?.message || e.reason));
});

const FAV_PAGE_SIZE = 20;
let favoritesPage = 0;
let currentVersion = localStorage.getItem("bibleVersion") || "NASB";
let recentPassageId = localStorage.getItem("recentPassageId");
let recentPassage = localStorage.getItem("recentPassage");
let verseChatHistories = {};

const GEMINI_PROXY = 'https://gemini-proxy-668755364170.asia-southeast1.run.app';
const AI_TONE = `Be direct — no greetings, no filler, no "Hey there!", no "Great question!", no restating the verse. Start immediately with the insight. Use clear, simple English. Bold key terms with **double asterisks**.`;

// Warm up Cloud Run on page load so the first AI call doesn't pay the
// cold-start tax (~1–3s container spin-up). Fires a cheap GET to the health
// route — zero tokens, zero cost, but leaves the container alive and ready.
(function _warmGeminiProxy() {
  try {
    fetch(GEMINI_PROXY, { method: 'GET', cache: 'no-store', keepalive: true }).catch(() => {});
  } catch {}
})();

/* ---------- SHARED: Call Gemini Proxy ---------- */
async function callGemini(prompt) {
  const res = await fetch(GEMINI_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'summary', contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) throw new Error(`Gemini proxy error: ${res.status}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/* ---------- SHARED: Streaming Gemini (SSE) ----------
 * Streams tokens as they're generated. First token typically arrives in
 * ~200-400ms vs ~2s for the full non-streaming response.
 *
 * onChunk(delta, full) fires for every incremental token batch:
 *   delta = the new text that just arrived
 *   full  = the full accumulated text so far
 * Resolves with the full text when the stream ends.
 */
async function callGeminiStream(prompt, onChunk) {
  // Dead-simple: fetch the full response non-streaming, then reveal it to
  // the UI character-by-character via setTimeout. We tried server-side
  // streaming but Cloud Run + HTTP/2 intermediaries buffer chunks until
  // the response ends, which makes real SSE streaming unreliable. This
  // approach guarantees a visible typing effect regardless of network
  // behavior — user always sees text appearing progressively.
  const text = await callGemini(prompt);
  if (!text) {
    try { onChunk?.('', ''); } catch {}
    return '';
  }
  await _typeOut(text, onChunk);
  return text;
}

function _typeOut(text, onChunk) {
  return new Promise((resolve) => {
    // ~4 chars per 16ms tick = ~240 chars/sec. Feels like fast typing
    // without feeling laggy on long responses.
    let i = 0;
    const step = () => {
      const take = Math.min(4, text.length - i);
      i += take;
      try { onChunk?.(text.slice(i - take, i), text.slice(0, i)); } catch {}
      if (i < text.length) setTimeout(step, 16);
      else resolve();
    };
    step();
  });
}

/* ---------- SHARED: Generate Image via Proxy + IndexedDB Cache ---------- */
const _imageCache = {};
const _IMG_DB_NAME = "devo-cache";
const _IMG_DB_VER = 3; // bumped to invalidate old cached images with black bars
const _IMG_STORE = "images";
const _STORY_STORE = "stories";
const _IMG_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
const _STORY_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

function _openImageDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(_IMG_DB_NAME, _IMG_DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Delete and recreate image store on version bump to clear stale images
      if (db.objectStoreNames.contains(_IMG_STORE)) db.deleteObjectStore(_IMG_STORE);
      db.createObjectStore(_IMG_STORE, { keyPath: "key" });
      if (!db.objectStoreNames.contains(_STORY_STORE)) {
        db.createObjectStore(_STORY_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function _getImageFromIDB(key) {
  try {
    const db = await _openImageDB();
    return new Promise((resolve) => {
      const tx = db.transaction(_IMG_STORE, "readonly");
      const store = tx.objectStore(_IMG_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const entry = req.result;
        if (entry && Date.now() - entry.time < _IMG_MAX_AGE) resolve(entry.dataUrl);
        else resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function _saveImageToIDB(key, dataUrl) {
  try {
    const db = await _openImageDB();
    const tx = db.transaction(_IMG_STORE, "readwrite");
    tx.objectStore(_IMG_STORE).put({ key, dataUrl, time: Date.now() });
  } catch {}
}

/* ── Story AI cache (glance + segments + closing) ── */

async function _getStoryCache(key) {
  try {
    const db = await _openImageDB();
    return new Promise((resolve) => {
      const tx = db.transaction(_STORY_STORE, "readonly");
      const req = tx.objectStore(_STORY_STORE).get(key);
      req.onsuccess = () => {
        const entry = req.result;
        if (entry && Date.now() - entry.time < _STORY_MAX_AGE) resolve(entry.data);
        else resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function _saveStoryCache(key, data) {
  try {
    const db = await _openImageDB();
    const tx = db.transaction(_STORY_STORE, "readwrite");
    tx.objectStore(_STORY_STORE).put({ key, data, time: Date.now() });
  } catch {}
}

// Purge expired entries on startup (images: 1 day, stories: 7 days)
(async function _purgeExpiredCache() {
  try {
    const db = await _openImageDB();
    const purge = (storeName, maxAge) => {
      const tx = db.transaction(storeName, "readwrite");
      const req = tx.objectStore(storeName).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        if (Date.now() - cursor.value.time >= maxAge) cursor.delete();
        cursor.continue();
      };
    };
    purge(_IMG_STORE, _IMG_MAX_AGE);
    purge(_STORY_STORE, _STORY_MAX_AGE);
  } catch {}
})();

// Image generation disabled — AI image calls were the main cost driver.
// Keeping this function as a throwing stub so every caller's existing try/catch
// or .catch() path silently skips the image without breaking the surrounding UI.
async function callImageGen(prompt, aspectRatio = "9:16") {
  throw new Error("Image generation disabled");
}

function buildScenePrompt(bookName, chapter, verseRange, context) {
  return `Ultra-premium cinematic biblical scene from ${bookName} chapter ${chapter}${verseRange ? " verses " + verseRange : ""}. ${context || ""}. Shot with shallow depth of field, f/1.4 aperture — main subject sharp and close to camera, background figures softly blurred with beautiful bokeh. Extreme high-detail cinematic quality. Sharp facial features, natural skin texture, realistic hair strands, crisp eyes. Balanced cinematic warm lighting. Poster-grade realism, 8K resolution, studio-level sharpness. Photorealistic textures, historically accurate clothing and setting. Reverent, atmospheric. IMPORTANT: Fill the entire frame edge to edge — absolutely NO black bars, NO letterboxing, NO borders, NO cinematic black strips on top or bottom. No text, no words, no letters, no UI elements.`;
}

/* ---------- SHARED: Markdown → HTML (white-on-gradient) ---------- */
function mdToHTML(text) {
  if (!text) return '';
  const lines = text.split('\n');
  let html = '';
  for (const line of lines) {
    const t = line.trim();
    if (!t) { html += '<div style="height:6px"></div>'; continue; }
    // h4+
    const h4 = t.match(/^#{4,}\s+(.+)/);
    if (h4) { html += `<div class="md-h4">${inlineMd(h4[1])}</div>`; continue; }
    // h2/h3
    const h2 = t.match(/^#{1,3}\s+(.+)/);
    if (h2) { html += `<div class="md-h2">${inlineMd(h2[1])}</div>`; continue; }
    // bullet
    if (t.startsWith('- ') || t.startsWith('* ')) {
      html += `<div class="md-bullet"><span class="md-bullet-dot">•</span><span style="flex:1">${inlineMd(t.slice(2))}</span></div>`;
      continue;
    }
    html += `<p>${inlineMd(t)}</p>`;
  }
  return linkifyBibleRefs(html);
}

function inlineMd(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\u201c([^\u201d]+)\u201d/g, '<em>&ldquo;$1&rdquo;</em>');
}

// Bible reference pattern: matches "Genesis 1:2", "1 John 4:7-8", "Psalm 23:1, 3"
const _XREF_RE = /\b((?:[123]\s)?(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|Samuel|Kings|Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Song of Solomon|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|Corinthians|Galatians|Ephesians|Philippians|Colossians|Thessalonians|Timothy|Titus|Philemon|Hebrews|James|Peter|Jude|Revelation))\s+(\d+):(\d+(?:\s*[-–,]\s*\d+)*)\b/gi;

function linkifyBibleRefs(html) {
  return html.replace(_XREF_RE, (match, book, ch, verses) => {
    const ref = `${book} ${ch}:${verses}`;
    return `<span class="xref-link" onclick="openCrossRefPeek('${ref.replace(/'/g, "\\'")}', this)">${match}</span>`;
  });
}

function openCrossRefPeek(refStr, anchorEl) {
  // Parse "1 John 4:7-8" into book, chapter, verse range
  const m = refStr.match(/^(.+?)\s+(\d+):(.+)$/);
  if (!m) return;
  const [, bookStr, chStr, versesStr] = m;
  const ch = parseInt(chStr, 10);

  // Parse verse numbers
  const verseNums = [];
  versesStr.split(",").forEach(part => {
    part = part.trim();
    const rangeParts = part.split(/[-–]/);
    const start = parseInt(rangeParts[0], 10);
    const end = rangeParts[1] ? parseInt(rangeParts[1], 10) : start;
    if (!isNaN(start) && !isNaN(end)) {
      for (let v = start; v <= end; v++) verseNums.push(v);
    }
  });
  if (!verseNums.length) return;

  // Look up book in bibleData
  const bookUpper = bookStr.toUpperCase();
  let bookContent = bibleData?.[bookUpper];
  if (!bookContent) {
    // Try matching by BIBLE_META name
    for (const key of Object.keys(BIBLE_META)) {
      if (BIBLE_META[key].name.toUpperCase() === bookUpper) {
        bookContent = bibleData?.[BIBLE_META[key].name.toUpperCase()] || bibleData?.[BIBLE_META[key].name];
        break;
      }
    }
  }

  const rows = verseNums.map(v => {
    const text = bookContent?.[ch]?.[String(v)]?.trim()?.replace(/([.!?,;:])(?=[a-zA-Z])/g, "$1 ")?.replace(/\s+/g, " ");
    return { num: v, text: text || "Verse not available." };
  });

  const refLabel = `${bookStr} ${chStr}:${versesStr}`;
  const bodyHTML = rows.map(r =>
    `<div class="verse-peek-row"><span class="verse-peek-num">v.${r.num}</span><span>${r.text}</span></div>`
  ).join("");

  // Remove existing peek
  document.querySelector(".verse-peek-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "verse-peek-overlay";

  const bubble = document.createElement("div");
  bubble.className = "verse-peek-bubble";
  bubble.innerHTML = `
    <div class="verse-peek-header">
      <div class="verse-peek-ref">${refLabel}</div>
      <button class="verse-peek-goto" title="Go to passage"><span class="material-icons">open_in_new</span></button>
    </div>
    <div class="verse-peek-body-wrap">
      <div class="verse-peek-body">${bodyHTML}</div>
    </div>
    <div class="verse-peek-tail"></div>`;

  bubble.querySelector(".verse-peek-goto").onclick = () => {
    _goToPassageFromPeek(bookStr, chStr, verseNums[0]);
  };

  const peekWrap = bubble.querySelector(".verse-peek-body-wrap");
  const checkPeekScroll = () => {
    const atEnd = peekWrap.scrollHeight - peekWrap.scrollTop - peekWrap.clientHeight < 8;
    peekWrap.classList.toggle("peek-scrolled-end", atEnd);
  };
  peekWrap.addEventListener("scroll", checkPeekScroll);
  peekWrap.addEventListener("touchmove", e => e.stopPropagation());
  overlay.addEventListener("touchmove", e => {
    if (!peekWrap.contains(e.target)) e.preventDefault();
  }, { passive: false });
  requestAnimationFrame(checkPeekScroll);
  overlay.appendChild(bubble);
  document.body.appendChild(overlay);

  // Position
  if (anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    const anchorCenterX = rect.left + rect.width / 2;
    requestAnimationFrame(() => {
      const bw = bubble.offsetWidth;
      const bh = bubble.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const pad = 8;
      let left = anchorCenterX - bw / 2;
      left = Math.max(pad, Math.min(left, vw - bw - pad));
      let top = rect.top - bh - 10;
      let tailBelow = true;
      if (top < pad) { top = rect.bottom + 10; tailBelow = false; }
      top = Math.max(pad, Math.min(top, vh - bh - pad));
      bubble.style.left = left + "px";
      bubble.style.top = top + "px";
      const tail = bubble.querySelector(".verse-peek-tail");
      const tailX = anchorCenterX - left;
      tail.style.left = Math.max(18, Math.min(tailX, bw - 18)) + "px";
      if (!tailBelow) tail.classList.add("verse-peek-tail-top");
    });
  } else {
    bubble.style.left = "50%";
    bubble.style.top = "50%";
    bubble.style.transform = "translate(-50%, -50%)";
  }

  overlay.addEventListener("click", e => {
    if (e.target === overlay) overlay.remove();
  });
}

// ── Go to Passage from Peek ─────────────────────────────────────────────
function _bookNameToId(name) {
  const upper = name.toUpperCase();
  for (const [key, meta] of Object.entries(BIBLE_META)) {
    if (meta.name.toUpperCase() === upper) return key;
  }
  // Try partial match (e.g. "John" → "1JN" won't work, but "John" → "JHN" might)
  for (const [key, meta] of Object.entries(BIBLE_META)) {
    if (meta.name.toUpperCase().includes(upper) || upper.includes(meta.name.toUpperCase())) return key;
  }
  return null;
}

function _goToPassageFromPeek(bookName, chapter, verseNum) {
  // Save current state for "Go Back"
  const prevBook = bookEl.value;
  const prevCh = chapterEl.value;
  const prevScroll = document.getElementById("output")?.scrollTop || window.scrollY;
  const prevPayload = window.__aiPayload;
  const wasStoryOpen = !document.getElementById("storyModal")?.hidden;

  // Close peek overlay
  document.querySelector(".verse-peek-overlay")?.remove();

  // Close story modal if open
  if (wasStoryOpen) {
    const storyModal = document.getElementById("storyModal");
    storyModal.hidden = true;
  }

  // Navigate to the passage
  const bookId = _bookNameToId(bookName);
  if (!bookId) return;

  bookEl.value = bookId;
  loadChapters();
  chapterEl.value = chapter;
  loadVerses();
  verseEl.value = "";
  loadBtn.click();

  // Scroll to verse after render
  requestAnimationFrame(() => {
    setTimeout(() => {
      const vEl = document.getElementById(String(verseNum));
      if (vEl) {
        vEl.scrollIntoView({ behavior: "smooth", block: "center" });
        vEl.classList.add("verse-highlight");
        setTimeout(() => vEl.classList.remove("verse-highlight"), 5000);
      }
    }, 400);
  });

  // Show "Go Back" floating pill
  _showGoBackPill(prevBook, prevCh, prevScroll, prevPayload, wasStoryOpen);
}

function _showGoBackPill(prevBook, prevCh, prevScroll, prevPayload, wasStoryOpen) {
  // Remove existing pill
  document.getElementById("goBackPill")?.remove();

  const prevBookName = BIBLE_META[prevBook]?.name || prevBook;
  const pill = document.createElement("button");
  pill.id = "goBackPill";
  pill.className = "go-back-pill";
  pill.innerHTML = `<span class="material-icons">arrow_back</span> Back to ${prevBookName} ${prevCh}`;
  document.body.appendChild(pill);

  // Animate in
  requestAnimationFrame(() => pill.classList.add("visible"));

  pill.onclick = () => {
    pill.remove();
    bookEl.value = prevBook;
    loadChapters();
    chapterEl.value = prevCh;
    loadVerses();
    verseEl.value = "";
    window.__aiPayload = prevPayload;
    loadBtn.click();

    if (wasStoryOpen) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          const storyModal = document.getElementById("storyModal");
          storyModal.hidden = false;
        }, 400);
      });
    }
  };

  // Auto-dismiss after 15 seconds
  setTimeout(() => { if (pill.parentNode) pill.classList.remove("visible"); setTimeout(() => pill.remove(), 300); }, 15000);
}

/* ---------- SHARED: Sparkle Loader HTML ---------- */
function sparkleLoaderHTML(msg) {
  return `<div class="sparkle-loader">
    <div class="sparkle-row"><span class="sparkle">✦</span><span class="sparkle">✦</span><span class="sparkle">✦</span></div>
    <span class="sparkle-text">${msg || 'Generating...'}</span>
  </div>`;
}

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

