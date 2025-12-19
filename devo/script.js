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
const toggleAllBtn = document.getElementById("toggleAll");

let titleForGemini = ''

let showAllComments = true;
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
verseEl.onchange = () => {
  if (verseEl.value) {
    verseFromEl.value = "";
    verseToEl.value = "";
    verseFromEl.disabled = verseToEl.disabled = true;
  } else {
    verseFromEl.disabled = verseToEl.disabled = false;
  }
  updatePassageTitle();
  renderSummary();
};

[verseFromEl, verseToEl].forEach(
  (el) =>
    (el.oninput = () => {
      if (verseFromEl.value || verseToEl.value) {
        verseEl.value = "";
        verseEl.disabled = true;
      } else {
        verseEl.disabled = false;
      }
      updatePassageTitle();
      renderSummary();
    })
);

/* ---------- BOOKS ---------- */
async function loadBooks() {
  const res = await fetch(API_WEB);
  const data = await res.json();

  bookEl.innerHTML = "";
  data.books.forEach((b) => {
    const o = document.createElement("option");
    o.value = b.id;
    o.textContent = b.name;
    bookEl.appendChild(o);
  });

  bookEl.value = "JHN";
  await loadChapters();
}

/* ---------- CHAPTERS ---------- */
async function loadChapters() {
  const res = await fetch(`${API_WEB}/${bookEl.value}`);
  const data = await res.json();

  chapterEl.innerHTML = "";
  data.chapters.forEach((c) => {
    const o = document.createElement("option");
    o.value = c.chapter;
    o.textContent = c.chapter;
    chapterEl.appendChild(o);
  });

  await loadVerses();
}

/* ---------- VERSES ---------- */
async function loadVerses() {
  verseEl.innerHTML = `<option value="">All verses</option>`;
  const res = await fetch(`${API_WEB}/${bookEl.value}/${chapterEl.value}`);
  const data = await res.json();

  data.verses.forEach((v) => {
    const o = document.createElement("option");
    o.value = v.verse;
    o.textContent = v.verse;
    verseEl.appendChild(o);
  });

  updatePassageTitle();
  renderSummary();
}

/* ---------- LOAD PASSAGE ---------- */
async function loadPassage() {
  const res = await fetch(`${API_WEB}/${bookEl.value}/${chapterEl.value}`);
  const data = await res.json();

  let verses = data.verses;
  const single = verseEl.value;
  const from = +verseFromEl.value;
  const to = +verseToEl.value;

  if (single) verses = verses.filter((v) => v.verse == single);
  else if (from && to)
    verses = verses.filter((v) => v.verse >= from && v.verse <= to);

  const book = bookEl.options[bookEl.selectedIndex]?.text || "";
  const verse = verseEl.value;
  const verseFrom = verseFromEl.value;
  const verseTo = verseToEl.value;

  let title = `${book} chapter ${chapterEl.value}`;

  if (verse) title += ` verse ${verse} only.`;
  else if (verseFrom && verseTo) title += ` verse ${verseFrom}–${verseTo} only.`;

  console.log(title);
  titleForGemini = title

  const API_KEY = "AIzaSyAZsOkUSvWUCB14gXJQyNrCzCJtgW_JH7c"; // TEMP ONLY
  let testText = `Send ${titleForGemini} NASB2020 ver in this JSON list format [{book: "John", book_id: "JHN", chapter: 1, text: "In the beginning was the Word, and the Word was with God, and the Word was God.\n", verse: 1},{book: "John", book_id: "JHN", chapter: 1, text: "The same was in the beginning with God.\n", verse: 2}]. Send only the actual JSON [{}], no other words.`;
  const gemini = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
      API_KEY,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: testText,
              },
            ],
          },
        ],
      }),
    }
  );

  const gemData = await gemini.json();
  console.log(
    JSON.parse(
      gemData.candidates?.[0]?.content?.parts?.[0]?.text
        .replace("```json\n", "")
        .replace("```", "")
    ) || JSON.stringify(gemData, null, 2)
  );
  output.innerHTML = "";
  aiContextSummaryEl.innerHTML = ""

  verses = JSON.parse(
    gemData.candidates?.[0]?.content?.parts?.[0]?.text
      .replace("```json\n", "")
      .replace("```", "")
  );

  verses.forEach((v) => {
    const key = keyOf(v.book_id, v.chapter, v.verse);
    const count = comments[key]?.length || 0;

    const wrap = document.createElement("div");
    wrap.className = "verse";
    wrap.innerHTML = `
      <div class="verse-header">
        <div><span class="verse-num">${v.verse}</span>${v.text.trim()}</div>
        ${count ? `<div class="comment-indicator">💬 ${count}</div>` : ""}
      </div>
      <div class="comments" hidden></div>
    `;

    const commentsEl = wrap.querySelector(".comments");
    wrap.querySelector(".verse-header").onclick = () => {
      commentsEl.hidden = !commentsEl.hidden;
      if (!commentsEl.hidden) renderComments(key, commentsEl);
    };

    output.appendChild(wrap);
  });

  renderAIContextSummary();
  renderSummary();
}

async function renderAIContextSummary() {
  const API_KEY = "AIzaSyAZsOkUSvWUCB14gXJQyNrCzCJtgW_JH7c"; // TEMP ONLY
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

background: linear-gradient(135deg, #ec4899, #db2777);
padding: 1rem;
border-radius: 12px;
box-shadow: 0 12px 30px rgba(236, 72, 153, 0.45);
font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
font-size: 16px;
line-height: 1.4;
color: #ffffff;
max-width: 360px;
margin-bottom: 2rem;

Title rules:
- The FIRST element inside the div must be a p tag
- The title format must be:
  "{BOOK} {CHAPTER} AI-Generated Context ✨"
- Use the actual book name and chapter from the task
- Title should feel calm and clear (slightly stronger than body text)

List rules:
- Use a ul directly under the title
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

  const gemini = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=" +
      API_KEY,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: testText,
              },
            ],
          },
        ],
      }),
    }
  );

  const gemData = await gemini.json();
  console.log(
    gemData.candidates?.[0]?.content?.parts?.[0]?.text ||
      JSON.stringify(gemData, null, 2)
  );
  aiContextSummaryEl.innerHTML =
    gemData.candidates?.[0]?.content?.parts?.[0]?.text;
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

  const single = verseEl.value;
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
loadBtn.onclick = loadPassage;

toggleAllBtn.onclick = () => {
  showAllComments = !showAllComments;
  toggleAllBtn.textContent = showAllComments
    ? "Hide comments"
    : "Show comments";
  document
    .querySelectorAll(".comments")
    .forEach((c) => (c.hidden = !showAllComments));
};

/* ---------- INIT ---------- */
loadBooks();
