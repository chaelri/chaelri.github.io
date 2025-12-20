const API_WEB = "https://bible-api.com/data/web";

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
const summarizeNotesBtn = document.getElementById("summarizeNotesBtn");
summarizeNotesBtn.style.display = "none";

const aiNotesSummaryEl = document.getElementById("aiNotesSummary");
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

summarizeNotesBtn.onclick = async () => {
  if (!window.__currentSummaryItems?.length) {
    alert("No notes to summarize for this passage.");
    return;
  }

  showLoading();
  aiContextSummaryEl.innerHTML = `
  <div class="ai-shimmer">
    <div class="ai-shimmer-block"></div>
    <div class="ai-shimmer-block short"></div>
    <div class="ai-shimmer-block"></div>
  </div>
`;

  aiNotesSummaryEl.innerHTML = "";

  const notesText = window.__currentSummaryItems
    .map(
      (item) =>
        `Verse ${item.verseNum}:\n` +
        item.list.map((n) => `- ${n.text}`).join("\n")
    )
    .join("\n\n");
  const reflectionAnswers = Array.from(
    document.querySelectorAll(".ai-reflection textarea")
  )
    .map((t, i) => `Reflection ${i + 1}: ${t.value.trim()}`)
    .filter(Boolean)
    .join("\n");

  const fullNotesText =
    notesText +
    (reflectionAnswers ? `\n\nGUIDED REFLECTION:\n${reflectionAnswers}` : "");

  const prompt = `
IMPORTANT:
Respond with RAW HTML ONLY.
No markdown. No explanations.

Use ONE outer div with EXACT style:
background: linear-gradient(135deg, #001358, #020103);
padding: 1rem;
border-radius: 12px;
box-shadow: 0 12px 30px #18234a;
font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
font-size: 16px;
line-height: 1.4;
color: #ffffff;
max-width: 360px;
margin: 2rem 0;

Allowed tags only: div, p, ul, li, strong, em

STRUCTURE:
1) A <strong>title line</strong>:
   "${passageTitleEl.textContent} Notes Summary by AI ✨"

2) A short paragraph (1–2 sentences) that sounds like MY OWN REFLECTION,
   preserving my tone, language (Taglish if present), and emphasis.

3) A <ul> of 3–5 bullets that:
   - paraphrase my exact thoughts
   - reuse key phrases I wrote (not generic theology)
   - make me feel: "oo nga, sinabi ko nga yan"

RULES:
- DO NOT sound academic
- DO NOT rewrite into sermon language
- DO NOT remove emotion, prayers, or personal reactions
- You may lightly clean grammar but KEEP MY VOICE

NOTES (verbatim, do not reinterpret):
${fullNotesText}

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
    aiNotesSummaryEl.innerHTML = html;

    const shareBtn = document.createElement("button");
    shareBtn.className = "ai-notes-share";
    shareBtn.innerHTML = "🔗";
    shareBtn.title = "Share notes summary";

    shareBtn.onclick = async () => {
      const temp = document.createElement("div");
      temp.innerHTML = aiNotesSummaryEl.innerHTML;

      const text = temp.innerText.trim();

      if (navigator.share) {
        await navigator.share({
          title: `${passageTitleEl.textContent} Notes Summary`,
          text,
        });
      } else {
        await navigator.clipboard.writeText(text);
        alert("Notes summary copied to clipboard.");
      }
    };

    aiNotesSummaryEl.appendChild(shareBtn);

    aiNotesSummaryEl.style.position = "relative";
  } catch (e) {
    console.error(e);
    alert("Failed to summarize notes.");
  } finally {
    hideLoading();
  }
};

let titleForGemini = "";

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
  output.innerHTML = `
    <div class="landing">
      <div class="landing-card">
        <h2>Open the Word 📖</h2>
        <p>Select a book and chapter, then press <strong>Search</strong>.</p>
      </div>
    </div>
  `;

  aiContextSummaryEl.innerHTML = "";
  const reflection = document.getElementById("aiReflection");
  if (reflection) {
    reflection.innerHTML = "";
    reflection.style.display = "none";
  }

  summaryEl.innerHTML = "";
  summarizeNotesBtn.style.display = "none";
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

  updatePassageTitle();
  renderSummary();
}

/* ---------- LOAD PASSAGE ---------- */
async function loadPassage() {
  showLoading();
  aiContextSummaryEl.innerHTML = "";

  try {
    titleForGemini = passageTitleEl.textContent;
    const bookName = BIBLE_META[bookEl.value].name;
    const chapterNum = chapterEl.value;

    const baseRes = await fetch(
      `${API_WEB}/${bookEl.value}/${chapterEl.value}`
    );
    const baseData = await baseRes.json();

    let baseVerses = baseData.verses;
    const single = verseEl.value;
    const from = +verseFromEl.value;
    const to = +verseToEl.value;

    if (single) baseVerses = baseVerses.filter((v) => v.verse == single);
    else if (from && to)
      baseVerses = baseVerses.filter((v) => v.verse >= from && v.verse <= to);

    const versesText = baseVerses
      .map((v) => `${v.verse}. ${v.text}`)
      .join("\n");

    // 🔥 FIRE EVERYTHING AT ONCE (NO ORDER)
    renderAIContextSummary();
    renderAIReflectionQuestions({
      book: bookName,
      chapter: chapterNum,
      versesText,
    });

    const versePrompt = `Send ${titleForGemini} in NASB 2020.
FORMAT RULES (MANDATORY):
- One verse per line
- Format EXACTLY:
  BOOK_ID|CHAPTER|VERSE|VERSE_TEXT
- BOOK_ID must be ONE OF THE FOLLOWING VALID IDS ONLY:
  ${Object.keys(BIBLE_META).join(", ")}
- Use ONLY the correct BOOK_ID for ${titleForGemini}
- CHAPTER must match the chapter in ${titleForGemini}
- NO quotes
- NO JSON
- NO markdown
- NO commentary
- NO blank lines`;

    const verseGeminiPromise = fetch(
      "https://gemini-proxy-668755364170.asia-southeast1.run.app",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "text",
          contents: [{ parts: [{ text: versePrompt }] }],
        }),
      }
    ).then((r) => r.json());

    verseGeminiPromise
      .then((verseGemData) => {
        const aiText =
          verseGemData.candidates?.[0]?.content?.parts?.[0]?.text || "";

        if (!aiText.includes("|")) {
          throw new Error("Invalid AI verse format");
        }

        const verses = aiText
          .trim()
          .split("\n")
          .map((line) => {
            const [book_id, chapter, verse, ...rest] = line.split("|");
            return {
              book_id,
              chapter: Number(chapter),
              verse: Number(verse),
              text: rest.join("|").trim(),
            };
          });

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
                ${
                  count
                    ? `<div class="comment-indicator">💬 ${count}</div>`
                    : ""
                }
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
      })
      .catch((err) => {
        console.error(err);
        alert("Failed to load passage.");
      })
      .finally(() => {
        hideLoading();
      });
  } catch (err) {
    console.error(err);
    hideLoading();
    alert("Failed to load passage.");
  }
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
padding: 1rem 1.5rem;
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
- The FIRST element inside the div must be a p tag
- The title format must be:
  "{BOOK} {CHAPTER} {VERSE (if it exists)} AI-Generated Context ✨"
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
      gemData.candidates?.[0]?.content?.parts?.[0]?.text;

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
  } catch (e) {
    console.error(e);
  }
  return true;
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
  aiNotesSummaryEl.innerHTML = "";
  aiNotesSummaryEl.style.position = "";
  summarizeNotesBtn.style.display = "none";
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
    summarizeNotesBtn.style.display = "block";
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

/* ---------- EVENTS ---------- */
bookEl.onchange = loadChapters;
chapterEl.onchange = loadVerses;
loadBtn.onclick = () => {
  output.innerHTML = "";
  loadPassage();
};

/* ---------- INIT ---------- */
loadBooks();
showLanding();
updateControlStates();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js");
  });
}
