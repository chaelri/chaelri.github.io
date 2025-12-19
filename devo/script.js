const API_WEB = "https://bible-api.com/data/web";

const bookEl = document.getElementById("book");
const chapterEl = document.getElementById("chapter");
const verseEl = document.getElementById("verse");
const verseFromEl = document.getElementById("verseFrom");
const verseToEl = document.getElementById("verseTo");

const output = document.getElementById("output");
const passageTitleEl = document.getElementById("passageTitle");
const summaryTitleEl = document.getElementById("summaryTitle");
const summaryEl = document.getElementById("summaryContent");

const loadBtn = document.getElementById("load");
const toggleAllBtn = document.getElementById("toggleAll");

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

  console.log(title);
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

  console.log("verses");
  console.log(verses);
  console.log(
    "im inside verses and the whole summary verse that needs to be search is: ",
    passageTitleEl.textContent
  );

  const API_KEY = "AIzaSyAZsOkUSvWUCB14gXJQyNrCzCJtgW_JH7c"; // TEMP ONLY
  let testText = `Send ${passageTitleEl.textContent} NASB2020 ver in this JSON list format [{book: "John", book_id: "JHN", chapter: 1, text: "In the beginning was the Word, and the Word was with God, and the Word was God.\n", verse: 1},{book: "John", book_id: "JHN", chapter: 1, text: "The same was in the beginning with God.\n", verse: 2}]. Send only the actual JSON [{}], no other words.`;
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
      data.candidates?.[0]?.content?.parts?.[0]?.text
        .replace("```json\n", "")
        .replace("```", "")
    ) || JSON.stringify(gemData, null, 2)
  );
  output.innerHTML = "";

  console.log("verses before");
  console.log(verses);
  verses = JSON.parse(
    data.candidates?.[0]?.content?.parts?.[0]?.text
      .replace("```json\n", "")
      .replace("```", "")
  );
  console.log("verses after");
  console.log(verses);

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

  renderSummary();
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

    console.log("items");
    console.log(items);

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
