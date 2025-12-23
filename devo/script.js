const API_WEB = "https://bible-api.com/data/web";

/* ---------- INDEXEDDB (DEVOTION DATA) ---------- */
const DB_NAME = "dudu-devotion-db";
const DB_VERSION = 2;
const STORE = "devotions";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

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
    const req = indexedDB.open(DB_NAME, DB_VERSION + 1);

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
const verseFromEl = document.getElementById("verseFrom");
const verseToEl = document.getElementById("verseTo");
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
  const from = verseFromEl.value;
  const to = verseToEl.value;

  let title = `${bookName} ${chapter} Notes`;
  if (single) title = `${bookName} ${chapter}:${single} Notes`;
  else if (from && to) title = `${bookName} ${chapter}:${from}-${to} Notes`;

  const lines = [title, ""];

  window.__currentSummaryItems
    .sort((a, b) => a.verseNum - b.verseNum)
    .forEach((item) => {
      const joined = item.list.map((n) => n.text).join("; ");
      lines.push(`v${item.verseNum}: ${joined}`);
    });

  const cached = loadAIFromStorage();
  if (cached?.answers) {
    lines.push("", "Guided Reflection:");
    const questions = Array.from(
      document.querySelectorAll("#aiReflection p")
    ).map((p) => p.textContent);

    Object.entries(cached.answers).forEach(([i, answer]) => {
      if (!answer.trim()) return;
      lines.push(`Q: ${questions[i]}`);
      lines.push(`A: ${answer}`, "");
    });
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
  `${bookEl.value}-${chapterEl.value}-${verseEl.value || ""}-${
    verseFromEl.value || ""
  }-${verseToEl.value || ""}`;

function resetAISections() {
  aiContextSummaryEl.innerHTML = "";
  const reflection = document.getElementById("aiReflection");
  if (reflection) {
    reflection.innerHTML = "";
    reflection.style.display = "none";
  }
  document.getElementById("runAI").style.display = "inline-block";
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
    </div>
    `;

    mountEl.querySelector(".inline-ai-close").onclick = () => {
      mountEl.innerHTML = "";
    };
  } catch {
    mountEl.innerHTML = "";
  }
}

/* ---------- PASSAGE TITLE ---------- */
function updatePassageTitle() {
  const book = bookEl.options[bookEl.selectedIndex]?.text || "";
  const chapter = chapterEl.value;
  const verse = verseEl.value;
  const from = verseFromEl.value;
  const to = verseToEl.value;

  let title = `${book} ${chapter}`;

  if (verse) title += `:${verse}`;
  else if (from && to) title += `:${from}–${to}`;

  passageTitleEl.textContent = title;
  summaryTitleEl.textContent = title;
}

/* ---------- UX MODE ---------- */
const verseCtrl = verseEl.closest(".control");
const fromCtrl = verseFromEl.closest(".control");
const toCtrl = verseToEl.closest(".control");

verseEl.onchange = () => {
  if (verseEl.value) {
    verseFromEl.value = "";
    verseToEl.value = "";
    fromCtrl.classList.add("collapsed");
    toCtrl.classList.add("collapsed");
  } else {
    fromCtrl.classList.remove("collapsed");
    toCtrl.classList.remove("collapsed");
  }
  updateControlStates();
  updatePassageTitle();
  renderSummary();
};

[verseFromEl, verseToEl].forEach(
  (el) =>
    (el.oninput = () => {
      if (verseFromEl.value || verseToEl.value) {
        verseEl.value = "";
        verseCtrl.classList.add("collapsed");
      } else {
        verseCtrl.classList.remove("collapsed");
      }
      updateControlStates();
      updatePassageTitle();
      renderSummary();
    })
);

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

  output.innerHTML = `
    <div class="landing">
      <div class="landing-card">
        <h2>Open the Word 📖</h2>
        <p>Select a book and chapter, then press <strong>Search</strong>.</p>
      </div>
    </div>
  `;
  passageTitleEl.hidden = true;
  document.getElementById("runAI").hidden = true;
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

  passageTitleEl.hidden = false;
  document.getElementById("runAI").hidden = false;
  toggleReflectionBtn.hidden = false;
  summaryTitleEl.hidden = false;

  try {
    titleForGemini = passageTitleEl.textContent;

    const bookId = bookEl.value;
    const bookName = BIBLE_META[bookId].name;
    const chapterNum = chapterEl.value;

    const single = verseEl.value;
    const from = +verseFromEl.value;
    const to = +verseToEl.value;

    /* ---------- BASE TEXT (AI CONTEXT / REFLECTION ONLY) ---------- */
    const baseRes = await fetch(`${API_WEB}/${bookId}/${chapterNum}`);
    const baseData = await baseRes.json();

    let baseVerses = baseData.verses;
    if (single) baseVerses = baseVerses.filter((v) => v.verse == single);
    else if (from && to)
      baseVerses = baseVerses.filter((v) => v.verse >= from && v.verse <= to);

    const versesText = baseVerses
      .map((v) => `${v.verse}. ${v.text}`)
      .join("\n");

    window.__aiPayload = {
      book: bookName,
      chapter: chapterNum,
      versesText,
    };

    /* ---------- NASB LITERALWORD (CACHE → FETCH UNLI) ---------- */
    const query =
      (bookName === "Song of Solomon" ? "Song of Songs" : bookName) +
      " " +
      chapterNum;

    const verseCacheId = `${bookId}-${chapterNum}`;

    let verses = await getCachedVerses(verseCacheId);

    if (!verses) {
      const { contents } = await fetchAllOriginsUnli(
        `https://api.allorigins.win/get?url=${encodeURIComponent(
          `https://nasb.literalword.com/?q=${query}`
        )}`
      );

      const a = document.createElement("div");
      a.innerHTML = contents;

      const raw = a.querySelector(".passage").innerText;

      verses = raw
        .replace(/^[A-Z][A-Za-z\s]+(?=[A-Z])/g, "")
        .replace(/^/, "1 ")
        .replace(/\s+/g, " ")
        .replace(/(\d)([A-Za-z“])/g, "$1 $2")
        .replace(/\s(?=\d+\s)/g, "\n")
        .trim()
        .split("\n")
        .map((line) => {
          const i = line.indexOf(" ");
          return {
            book_id: bookId,
            chapter: Number(chapterNum),
            verse: Number(line.slice(0, i)),
            text: line.slice(i + 1),
          };
        });

      await saveCachedVerses(verseCacheId, verses);
    }

    if (single) verses = verses.filter((v) => v.verse === +single);
    else if (from && to)
      verses = verses.filter((v) => v.verse >= from && v.verse <= to);

    /* ---------- RENDER ---------- */
    output.innerHTML = "";

    verses.forEach((v) => {
      const key = keyOf(v.book_id, v.chapter, v.verse);
      const count = comments[key]?.length || 0;

      const wrap = document.createElement("div");
      wrap.className = "verse";
      wrap.innerHTML = `
        <div class="verse-header">
          <div>
            <span class="verse-num">${v.verse}</span>${v.text}
          </div>
          <div style="display:flex;align-items:center;gap:8px">
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
    showLoadError("Failed to load passage.");
  }
}

async function runAIForCurrentPassage() {
  if (!window.__aiPayload) return;

  const cached = await loadAIFromStorage();
  if (cached) {
    aiContextSummaryEl.innerHTML = cached.contextHTML;
    document.getElementById("aiReflection").innerHTML = cached.reflectionHTML;
    applyReflectionVisibility();
    document.getElementById("runAI").style.display = "none";
    restoreReflectionAnswers();
    return;
  }

  const { book, chapter, versesText } = window.__aiPayload;
  titleForGemini = `${book} ${chapter}`;

  await renderAIContextSummary();
  await renderAIReflectionQuestions({ book, chapter, versesText });

  await saveAIToStorage({
    contextHTML: aiContextSummaryEl.innerHTML,
    reflectionHTML: document.getElementById("aiReflection").innerHTML,
    answers: {},
  });

  document.getElementById("runAI").style.display = "none";
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
div, p, ul, li, strong, em, textarea


ROLE:
You generate reflection QUESTIONS ONLY.
You must NOT give advice.
You must NOT suggest actions.
You must NOT speak as God.
You must NOT include answers.

TASK:
Generate EXACTLY 3 reflection questions.

VERY IMPORTANT RULES:
- Each question MUST reuse a clear word or phrase found directly in the passage
  (examples: "light", "darkness", "receive", "beginning", "Word", etc.)
- If a question could exist without this passage, it is INVALID.
- Use simple, everyday English.
- Avoid abstract, academic, or theological language.
- The questions should sound like personal journaling thoughts, not Bible study analysis.
- Do NOT explain the passage.
- Do NOT define concepts.
- Do NOT summarize meaning.

Goal:
Turn the passage’s own words into gentle, personal reflection questions.


STRUCTURE:
- Title: "Guided Reflection 🙏🏼"
- NO intro sentence
- A <ul> with EXACTLY 3 questions

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
    if (mount.firstElementChild) {
      mount.firstElementChild.classList.add("ai-reflection", "ai-fade-in");
      applyReflectionVisibility();
    }
    mount.querySelectorAll("textarea").forEach((ta) => {
      ta.addEventListener("input", persistReflectionAnswers);
    });

    restoreReflectionAnswers();
  } catch (e) {
    console.error(e);
  }
  return true;
}

async function restoreReflectionAnswers() {
  const cached = await loadAIFromStorage();
  if (!cached?.answers) return;

  document.querySelectorAll("#aiReflection textarea").forEach((ta, i) => {
    if (cached.answers[i]) ta.value = cached.answers[i];
  });
}

async function persistReflectionAnswers() {
  const cached = await loadAIFromStorage();
  if (!cached) return;

  const answers = {};
  document.querySelectorAll("#aiReflection textarea").forEach((ta, i) => {
    if (ta.value.trim()) answers[i] = ta.value.trim();
  });

  cached.answers = answers;
  await saveAIToStorage(cached);
}

/* ---------- COMMENTS ---------- */
function renderComments(key, container) {
  container.innerHTML = "";

  (comments[key] || []).forEach((obj, i) => {
    const c = document.createElement("div");
    c.className = "comment";
    c.innerHTML = `${obj.text}<button>✕</button>`;
    c.querySelector("button").onclick = () => {
      comments[key].splice(i, 1);
      saveComments();
      renderComments(key, container);
      renderSummary();
    };
    container.appendChild(c);
  });

  const input = document.createElement("div");
  input.className = "comment-input";
  input.innerHTML = `<textarea rows="1"></textarea><button>Add</button>`;
  input.querySelector("button").onclick = () => {
    const val = input.querySelector("textarea").value.trim();
    if (!val) return;
    comments[key] = comments[key] || [];
    comments[key].push({ text: val, time: Date.now() });
    saveComments();
    renderComments(key, container);
    renderSummary();
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
  const from = +verseFromEl.value;
  const to = +verseToEl.value;

  let items = [];

  Object.entries(comments).forEach(([key, list]) => {
    const [b, c, v] = key.split("-");
    const verseNum = +v;

    if (b !== bookEl.value || c !== chapterEl.value) return;
    if (single && verseNum !== +single) return;
    if (!single && from && to && (verseNum < from || verseNum > to)) return;
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

document.getElementById("scrollTopBtn").onclick = () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
};

document.getElementById("runAI").onclick = async () => {
  const scrollBtn = document.getElementById("scrollTopBtn");

  if (window.innerWidth <= 900 && aiContextSummaryEl) {
    aiContextSummaryEl.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

    aiContextSummaryEl.setAttribute("tabindex", "-1");
    aiContextSummaryEl.focus({ preventScroll: true });
  }

  await runAIForCurrentPassage();

  const observer = new IntersectionObserver(
    ([entry]) => {
      scrollBtn.style.display =
        entry.isIntersecting && window.innerWidth <= 900 ? "flex" : "none";
    },
    { threshold: 0.2 }
  );

  observer.observe(aiContextSummaryEl);
};

/* ---------- EVENTS ---------- */
bookEl.onchange = loadChapters;
chapterEl.onchange = loadVerses;
loadBtn.onclick = async () => {
  output.innerHTML = "";
  resetAISections();
  document.getElementById("runAI").hidden = false;

  await loadPassage();

  if (await loadAIFromStorage()) {
    document.getElementById("runAI").style.display = "none";
    await runAIForCurrentPassage();
  }
};

/* ---------- INIT ---------- */
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
