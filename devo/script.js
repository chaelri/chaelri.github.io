const API_WEB = "https://bible-api.com/data/web";

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
      }
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
    const response = await fetch("nasb2020.json"); // Ensure your filename matches this
    bibleData = await response.json();
    console.log("NASB 2020 Loaded");
  } catch (err) {
    console.error("Failed to load local Bible JSON:", err);
  }
}

/* ---------- INDEXEDDB (DEVOTION DATA) ---------- */
const STORE = "devotions";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("dudu-devotion-db", 1);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ---------- VERSE CACHE (INDEXEDDB) ---------- */
const VERSE_STORE = "verses";

function openDBWithVerses() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("dudu-verses-db", 1);

    req.onupgradeneeded = () => {
      const db = req.result;
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

async function getCachedVerses(id) {
  const db = await openDBWithVerses();
  return new Promise((resolve) => {
    const req = db
      .transaction(VERSE_STORE, "readonly")
      .objectStore(VERSE_STORE)
      .get(id);
    req.onsuccess = () => resolve(req.result?.verses || null);
  });
}

async function saveCachedVerses(id, verses) {
  const db = await openDBWithVerses();
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

const notesCopyStatusEl = document.getElementById("notesCopyStatus");
const toggleReflectionBtn = document.getElementById("toggleReflectionBtn");
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

function saveComments() {
  localStorage.setItem("bibleComments", JSON.stringify(comments));
}

copyNotesBtn.onclick = async () => {
  if (!window.__currentSummaryItems?.length) {
    alert("No notes to copy.");
    return;
  }

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

/* migrate old notes */
Object.keys(comments).forEach((k) => {
  comments[k] = comments[k].map((n) =>
    typeof n === "string" ? { text: n, time: Date.now() } : n
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
  mountEl
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
      }
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
        deepEl
      );
    };
  } catch {
    mountEl.innerHTML = "";
  }
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
      }
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
            '<a class="strong-num" data-strong="$1">[$1]</a>'
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
    mountEl.innerHTML = "";
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
function showLanding() {
  lockAppScroll(true);
  document.querySelector(".summary").style.display = "none";

  output.innerHTML = `
    <div class="landing">
      <div class="landing-card">
        <h2>Open the Word 📖</h2>
        <p>Select a book and chapter, then press <strong>Search</strong>.</p>
      </div>
    </div>
  `;
  passageTitleEl.hidden = true;
  toggleReflectionBtn.hidden = true;
  summaryTitleEl.hidden = true;

  aiContextSummaryEl.innerHTML = "";
  const reflection = document.getElementById("aiReflection");
  if (reflection) {
    reflection.innerHTML = "";
    reflection.style.display = "none";
  }

  summaryEl.innerHTML = "";
  copyNotesBtn.style.display = "none";
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

  if (!output.querySelector(".landing")) {
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
  showLoading();
  lockAppScroll(false);
  updatePassageTitle();
  document.querySelector(".summary").style.display = "block";

  passageTitleEl.hidden = false;
  toggleReflectionBtn.hidden = false;
  summaryTitleEl.hidden = false;

  try {
    titleForGemini = passageTitleEl.textContent;

    const bookId = bookEl.value;
    let bookName = BIBLE_META[bookId].name.toUpperCase();
    const chapterNum = chapterEl.value;
    const single = verseEl.value;

    if (!bibleData) {
      await fetchBibleData();
    }

    /* ---------- GET LOCAL VERSES ---------- */
    if (bookName === "PSALMS") {
      bookName = "PSALM";
    }

    const bookContent = bibleData[bookName];
    if (!bookContent) throw new Error(`Book ${bookName} not found in JSON.`);

    const chapterContent = bookContent[chapterNum];
    if (!chapterContent)
      throw new Error(`Chapter ${chapterNum} not found in ${bookName}.`);

    let verses = Object.entries(chapterContent).map(([vNum, text]) => ({
      book_id: bookId,
      chapter: Number(chapterNum),
      verse: Number(vNum),
      text: text.trim().replace(/\s+/g, " "),
    }));

    // Generate Payload for AI before filtering for single verse
    const fullVersesText = verses
      .map((v) => `${v.verse}. ${v.text}`)
      .join("\n");

    if (single) {
      verses = verses.filter((v) => v.verse === +single);
    }

    window.__aiPayload = {
      book: bookName,
      chapter: chapterNum,
      versesText: single
        ? verses.map((v) => `${v.verse}. ${v.text}`).join("\n")
        : fullVersesText,
    };

    /* ---------- RENDER ---------- */
    output.innerHTML = "";

    verses.forEach((v) => {
      const key = keyOf(v.book_id, v.chapter, v.verse);
      const count = comments[key]?.length || 0;

      const wrap = document.createElement("div");
      wrap.className = "verse";
      wrap.innerHTML = `
        <div id="${v.verse}" class="verse-header">
          <div>
            <span class="verse-num">${v.verse}</span>${v.text}
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <button class="inline-ai-btn" title="Quick verse context">✨</button>
            ${count ? `<div class="comment-indicator">💬 ${count}</div>` : ""}
          </div>
        </div>
        <div class="inline-ai-mount"></div>
        <div class="comments ai-fade-in" hidden></div>
      `;

      const commentsEl = wrap.querySelector(".comments");
      wrap.querySelector(".verse-header").onclick = () => {
        commentsEl.hidden = !commentsEl.hidden;
        if (!commentsEl.hidden) renderComments(key, commentsEl);
      };

      wrap.querySelector(".inline-ai-btn").onclick = (e) => {
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
          mount
        );
      };

      output.appendChild(wrap);
    });

    renderSummary();
    hideLoading();
  } catch (err) {
    console.error(err);
    hideLoading();
    showLoadError("Failed to load passage. Check if nasb2020.json is present.");
  }
}

async function runAIForCurrentPassage() {
  if (!window.__aiPayload) return;

  const cached = await loadAIFromStorage();
  if (cached) {
    aiContextSummaryEl.innerHTML = cached.contextHTML;
    document.getElementById("aiReflection").innerHTML = cached.reflectionHTML;
    applyReflectionVisibility();

    initializeReflections();
    return;
  }

  const { book, chapter, versesText } = window.__aiPayload;
  titleForGemini = `${book} ${chapter}`;

  await Promise.all([
    renderAIContextSummary(),
    renderAIReflectionQuestions({ book, chapter, versesText }),
  ]);

  await saveAIToStorage({
    contextHTML: aiContextSummaryEl.innerHTML,
    reflectionHTML: document.getElementById("aiReflection").innerHTML,
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
max-width: 360px;
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
      }
    );

    const gemData = await gemini.json();
    aiContextSummaryEl.innerHTML =
      gemData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (aiContextSummaryEl.firstElementChild) {
      aiContextSummaryEl.firstElementChild.classList.add("ai-fade-in");
    }
  } catch (err) {
    console.error(err);
  }
}

async function renderAIReflectionQuestions({ book, chapter, versesText }) {
  const mount = document.getElementById("aiReflection");
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
      }
    );

    const data = await res.json();
    mount.innerHTML = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    setTimeout(restoreSavedReflectionAnswers, 0);

    mount.querySelectorAll("textarea").forEach((ta, i) => {
      const id = `reflection-${devotionId()}-${i}`;
      ta.id = id;
    });

    initializeReflections();
  } catch (e) {
    console.error(e);
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
function renderComments(key, container) {
  container.innerHTML = "";
  const verseIndex = key.split("-").pop();
  const verseHeader = document.getElementById(verseIndex);
  // Find the flex container that holds buttons and the indicator
  const controls = verseHeader?.querySelector('div[style*="display:flex"]');

  const updateIndicator = (newCount) => {
    if (!controls) return;
    let indicator = controls.querySelector(".comment-indicator");

    if (newCount > 0) {
      if (!indicator) {
        indicator = document.createElement("div");
        indicator.className = "comment-indicator";
        controls.appendChild(indicator);
      }
      indicator.innerText = `💬 ${newCount}`;
    } else if (indicator) {
      indicator.remove();
    }
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
      updateIndicator(comments[key].length); // Use actual array length for accuracy
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
    updateIndicator(comments[key].length);
  };

  container.appendChild(input);
}

/* ---------- SUMMARY ---------- */
function renderSummary() {
  summaryEl.innerHTML = "";
  notesCopyStatusEl.textContent = "";
  copyNotesBtn.style.display = "none";

  applyReflectionVisibility();

  const single = verseEl.value;
  window.__currentSummaryItems = [];

  let items = [];

  Object.entries(comments).forEach(([key, list]) => {
    const [b, c, v] = key.split("-");
    const verseNum = +v;

    if (b !== bookEl.value || c !== chapterEl.value) return;
    if (single && verseNum !== +single) return;
    if (!list.length) return;

    items.push({ verseNum, list });
    window.__currentSummaryItems.push({ verseNum, list });
    copyNotesBtn.style.display = "block";
  });

  if (!items.length) {
    summaryEl.textContent = "No notes yet for this passage.";
    return;
  }

  items.sort((a, b) => a.verseNum - b.verseNum);

  items.forEach((item) => {
    const block = document.createElement("div");
    block.className = "summary-item";
    block.innerHTML = `<div class="summary-verse">Verse ${item.verseNum}</div>`;

    item.list.forEach((n) => {
      const note = document.createElement("div");
      note.className = "summary-note";
      note.innerHTML = `
        ${n.text}
        <time>${new Date(n.time).toLocaleString()}</time>
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
loadBtn.onclick = async () => {
  output.innerHTML = "";
  resetAISections();

  await loadPassage();

  await runAIForCurrentPassage();
};

/* ---------- INIT ---------- */
fetchBibleData(); // Load the JSON file on startup
loadBooks();
showLanding();
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
      area.addEventListener("input", () => {
        // Save in the specific format you requested
        const formattedEntry = `Q: ${questionText}\nA: ${area.value}`;
        localStorage.setItem(area.id, formattedEntry);
      });
    });

    // Stop watching once initialized
    observer.disconnect();
  }
};

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

  smoothScrollTo(target, 50);

  // Highlight verse
  target.classList.remove("verse-highlight"); // reset if clicked again
  void target.offsetWidth; // force reflow
  target.classList.add("verse-highlight");
});

function smoothScrollTo(target, duration = 700) {
  const startY = window.scrollY;
  const targetY = target.getBoundingClientRect().top + startY - 80;
  const diff = targetY - startY;
  let startTime = null;

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function step(timestamp) {
    if (!startTime) startTime = timestamp;
    const time = Math.min((timestamp - startTime) / duration, 1);
    const eased = easeInOutCubic(time);

    window.scrollTo(0, startY + diff * eased);

    if (time < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}
