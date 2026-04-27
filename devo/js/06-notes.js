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
      preview: _stripNotePreview(n),
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
      const latestText = n.allItems?.sort((a,b) => (b.time||0) - (a.time||0))[0]?.text || "";
      const notePreview = latestText.length > 60 ? latestText.slice(0, 60) + "…" : latestText;
      timelineItems.push({ icon: "menu_book", label: n.title, sub: `${count} verse note${count !== 1 ? "s" : ""}`, preview: notePreview });
    });
    session.reflection.forEach(n => {
      const firstAnswer = n.QAs?.[0]?.raw?.split("\nA: ")?.[1]?.trim() || "";
      const answerPreview = firstAnswer.length > 60 ? firstAnswer.slice(0, 60) + "…" : firstAnswer;
      timelineItems.push({ icon: "self_improvement", label: n.title, sub: "Reflection", preview: answerPreview });
    });
    session.standalone.forEach(n => {
      timelineItems.push({ icon: "edit_note", label: n.title || "Untitled note", sub: n.preview ? _escHtml(n.preview.slice(0, 40)) : "" });
    });

    const MAX_VISIBLE = 4;
    const visible = timelineItems.slice(0, MAX_VISIBLE);
    const extra = timelineItems.length - MAX_VISIBLE;

    const timelineHTML = visible.map(item => {
      return `<div class="nst-item">
        <div class="nst-item-header">
          <span class="nst-label">${_escHtml(item.label)}</span>
          ${item.sub ? `<span class="nst-sub">${item.sub}</span>` : ""}
        </div>
        ${item.preview ? `<div class="nst-preview">${_escHtml(item.preview)}</div>` : ""}
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
  if (deleteBtn) {
    deleteBtn.style.display = "";
    deleteBtn.onclick = () => _confirmDialog("Delete all notes from this day?", () => {
      // Delete verse comments
      session.verse.forEach(note => {
        (note.verseKeys || []).forEach(k => { delete comments[k]; });
      });
      saveComments();
      // Delete reflections
      session.reflection.forEach(note => {
        (note.QAs || []).forEach(qa => { if (qa.lsKey) localStorage.removeItem(qa.lsKey); });
        if (note.passageKey) localStorage.removeItem("reflection-time-" + note.passageKey);
      });
      // Delete standalone notes
      if (session.standalone.length) {
        const ids = session.standalone.map(n => n.standaloneId);
        const all = JSON.parse(localStorage.getItem("devotionStandaloneNotes") || "[]");
        localStorage.setItem("devotionStandaloneNotes", JSON.stringify(all.filter(n => !ids.includes(n.id))));
      }
      _closeNoteDetail();
    });
  }
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
    deleteBtn.style.display = "";
    if (note.type === "standalone") {
      deleteBtn.onclick = () => _deleteStandaloneNote(note.standaloneId);
    } else if (note.type === "verse") {
      deleteBtn.onclick = () => _confirmDialog("Delete all notes for this passage?", () => {
        (note.verseKeys || [note.chapterKey + "-1"]).forEach(k => { delete comments[k]; });
        saveComments();
        _closeNoteDetail();
      });
    } else if (note.type === "reflection") {
      deleteBtn.onclick = () => _confirmDialog("Delete this reflection?", () => {
        (note.QAs || []).forEach(qa => { if (qa.lsKey) localStorage.removeItem(qa.lsKey); });
        localStorage.removeItem("reflection-time-" + note.passageKey);
        _closeNoteDetail();
      });
    }
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
      <button class="ne-tool" data-cmd="underline" title="Underline"><u>U</u></button>
      <button class="ne-tool" data-cmd="strikeThrough" title="Strikethrough"><s>S</s></button>
      <div class="ne-tool-sep"></div>
      <button class="ne-tool" data-cmd="heading" title="Heading"><span style="font-weight:800">H</span></button>
      <button class="ne-tool" data-cmd="insertUnorderedList" title="Bullet list"><span class="material-icons" style="font-size:16px;vertical-align:middle;">format_list_bulleted</span></button>
      <button class="ne-tool" data-cmd="insertOrderedList" title="Numbered list"><span class="material-icons" style="font-size:16px;vertical-align:middle;">format_list_numbered</span></button>
      <div class="ne-tool-sep"></div>
      <button class="ne-tool" data-cmd="blockquote" title="Quote"><span class="material-icons" style="font-size:16px;vertical-align:middle;">format_quote</span></button>
      <button class="ne-tool" data-cmd="insertHorizontalRule" title="Divider"><span class="material-icons" style="font-size:16px;vertical-align:middle;">horizontal_rule</span></button>
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
    </div>
    <div class="bref-dropdown" id="brefDropdown" hidden></div>
    <div class="bref-preview" id="brefPreview" hidden>
      <div class="bref-preview-ref" id="brefPreviewRef"></div>
      <div class="bref-preview-body" id="brefPreviewBody"></div>
      <div class="bref-preview-actions">
        <button class="bref-preview-dismiss" id="brefDismiss">Dismiss</button>
        <button class="bref-preview-insert" id="brefInsert">Insert verse</button>
      </div>
    </div>`;

  container.style.position = "relative";
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
    if (cmd === "bold" || cmd === "italic" || cmd === "underline" || cmd === "strikeThrough"
        || cmd === "insertUnorderedList" || cmd === "insertOrderedList" || cmd === "insertHorizontalRule") {
      document.execCommand(cmd);
    } else if (cmd === "heading") {
      const sel = window.getSelection();
      const block = sel?.anchorNode?.parentElement?.closest("h1,h2,h3,p,div");
      const isHeading = block && /^H[1-6]$/.test(block.tagName);
      document.execCommand("formatBlock", false, isHeading ? "p" : "h2");
    } else if (cmd === "blockquote") {
      const sel = window.getSelection();
      const block = sel?.anchorNode?.parentElement?.closest("blockquote,p,div,h2");
      const isQuote = block && block.tagName === "BLOCKQUOTE";
      document.execCommand("formatBlock", false, isQuote ? "p" : "blockquote");
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

  // ── Bible Reference Typeahead ──────────────────────────────────────────────
  const brefDropdown = container.querySelector("#brefDropdown");
  const brefPreview  = container.querySelector("#brefPreview");
  let brefState = null;

  // Build flat book list once
  if (!window._brefBookList) {
    window._brefBookList = Object.entries(BIBLE_META).map(([code, meta]) => ({
      code, name: meta.name, nameLower: meta.name.toLowerCase()
    }));
  }
  const bookList = window._brefBookList;

  function _brefFindExactBook(str) {
    const lower = str.toLowerCase();
    return bookList.find(b => b.nameLower === lower) || null;
  }

  function _brefHide() {
    brefDropdown.hidden = true;
    brefPreview.hidden = true;
  }

  function _brefPositionAt(el) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    const scrollTop = container.parentElement?.scrollTop || 0;
    el.style.top = (rect.bottom - cRect.top + scrollTop + 4) + "px";
    el.style.left = Math.max(0, Math.min(rect.left - cRect.left, cRect.width - el.offsetWidth - 16)) + "px";
  }

  function _brefShowDropdown(matches, query, textNode, cursorOffset, regexMatch) {
    brefPreview.hidden = true;
    brefDropdown.innerHTML = matches.map((b, i) => {
      const idx = b.nameLower.indexOf(query);
      const before = b.name.substring(0, idx);
      const matched = b.name.substring(idx, idx + query.length);
      const after = b.name.substring(idx + query.length);
      return `<div class="bref-dropdown-item${i === 0 ? ' active' : ''}" data-code="${b.code}" data-name="${_escHtml(b.name)}">` +
        `${_escHtml(before)}<span class="bref-match">${_escHtml(matched)}</span>${_escHtml(after)}</div>`;
    }).join("");
    _brefPositionAt(brefDropdown);
    brefDropdown.hidden = false;
    brefState = { textNode, cursorOffset, regexMatch, query };
  }

  function _brefShowPreview(book, ch, vFrom, vTo, textNode, regexMatch) {
    brefDropdown.hidden = true;
    const refLabel = vFrom
      ? `${book.name} ${ch}:${vFrom}${vTo ? "\u2013" + vTo : ""}`
      : `${book.name} ${ch}`;

    const verses = [];
    if (!vFrom) {
      for (let v = 1; v <= 3; v++) {
        const t = getVerseText(book.code, ch, String(v));
        if (t && t !== "Verse text not found.") verses.push({ n: v, t });
      }
    } else {
      const start = parseInt(vFrom), end = vTo ? parseInt(vTo) : start;
      for (let v = start; v <= Math.min(end, start + 4); v++) {
        const t = getVerseText(book.code, ch, String(v));
        if (t && t !== "Verse text not found.") verses.push({ n: v, t });
      }
    }
    if (verses.length === 0) { _brefHide(); return; }

    container.querySelector("#brefPreviewRef").textContent = refLabel;
    container.querySelector("#brefPreviewBody").innerHTML =
      verses.map(v => `<sup style="font-size:9px;opacity:0.5">${v.n}</sup> ${_escHtml(v.t)}`).join(" ") +
      (!vFrom ? " ..." : (vTo && parseInt(vTo) - parseInt(vFrom) > 4 ? " ..." : ""));

    _brefPositionAt(brefPreview);
    brefPreview.hidden = false;
    // Scroll preview into view on mobile (keyboard eats space)
    setTimeout(() => brefPreview.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    brefState = { book, ch, vFrom, vTo, textNode, regexMatch, refLabel };
  }

  function _brefOnInput() {
    const sel = window.getSelection();
    if (!sel || !sel.isCollapsed || !sel.rangeCount) { _brefHide(); return; }

    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE || !bodyEl.contains(node)) { _brefHide(); return; }

    const textBefore = node.textContent.substring(0, range.startOffset);

    // Try full reference: "BookName Chapter:Verse-Verse" or "BookName Chapter"
    const fullRef = textBefore.match(
      /(?:^|\s)((?:[123]\s)?[A-Za-z][A-Za-z ]*?)\s+(\d+)(?::(\d+)(?:\s*[-\u2013]\s*(\d+))?)?\s*$/
    );
    if (fullRef) {
      const bookStr = fullRef[1].trim();
      const ch = fullRef[2];
      const vFrom = fullRef[3] || null;
      const vTo = fullRef[4] || null;
      const matched = _brefFindExactBook(bookStr);
      if (matched) {
        const chapters = BIBLE_META[matched.code]?.chapters;
        if (chapters && parseInt(ch) >= 1 && parseInt(ch) <= chapters.length) {
          if (vFrom !== null) {
            _brefShowPreview(matched, ch, vFrom, vTo, node, fullRef);
            return;
          }
          // "Book Ch " with trailing space → show whole chapter preview
          if (textBefore.endsWith(" ")) {
            _brefShowPreview(matched, ch, null, null, node, fullRef);
            return;
          }
        }
      }
    }

    // Try partial book name match for dropdown
    const partial = textBefore.match(/(?:^|\s)((?:[123]\s)?[A-Za-z]{2,}[A-Za-z ]*)$/);
    if (partial) {
      const query = partial[1].trim().toLowerCase();
      if (query.length >= 2) {
        const matches = bookList.filter(b =>
          b.nameLower.startsWith(query) || b.nameLower.includes(query)
        ).slice(0, 6);
        // Don't show dropdown if the only match is an exact match (user already typed full name)
        if (matches.length > 0 && !(matches.length === 1 && matches[0].nameLower === query)) {
          _brefShowDropdown(matches, query, node, range.startOffset, partial);
          return;
        }
      }
    }

    _brefHide();
  }

  // Dropdown click → replace partial text with full book name
  brefDropdown.addEventListener("mousedown", e => {
    e.preventDefault(); // prevent blur
  });
  brefDropdown.addEventListener("click", e => {
    const item = e.target.closest(".bref-dropdown-item");
    if (!item || !brefState) return;
    const name = item.dataset.name;
    const { textNode, cursorOffset, regexMatch } = brefState;

    const matchStart = cursorOffset - regexMatch[1].length;
    const before = textNode.textContent.substring(0, matchStart);
    const after = textNode.textContent.substring(cursorOffset);
    textNode.textContent = before + name + " " + after;

    const newOffset = matchStart + name.length + 1;
    const r = document.createRange();
    r.setStart(textNode, Math.min(newOffset, textNode.textContent.length));
    r.collapse(true);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);

    _brefHide();
    autoSave();
  });

  // Preview insert → replace typed ref with verse block
  container.querySelector("#brefInsert").addEventListener("mousedown", e => e.preventDefault());
  container.querySelector("#brefInsert").addEventListener("click", () => {
    if (!brefState || !brefState.book) return;
    const { book, ch, vFrom, vTo, textNode, regexMatch, refLabel } = brefState;

    // Build verse block (same format as manual insert)
    const verses = [];
    if (!vFrom) {
      const total = BIBLE_META[book.code]?.chapters[parseInt(ch) - 1] || 1;
      for (let v = 1; v <= Math.min(total, 30); v++) {
        const t = getVerseText(book.code, ch, String(v));
        if (t && t !== "Verse text not found.") verses.push({ n: v, t });
      }
    } else {
      const start = parseInt(vFrom), end = vTo ? parseInt(vTo) : start;
      for (let v = start; v <= end; v++) {
        const t = getVerseText(book.code, ch, String(v));
        if (t && t !== "Verse text not found.") verses.push({ n: v, t });
      }
    }

    const versesHTML = verses.map(v =>
      `<span class="nvb-verse"><sup class="nvb-num">${v.n}</sup>${_escHtml(v.t)}</span>`
    ).join(" ");
    const blockHTML = `<div class="note-verse-block" contenteditable="false" data-ref="${_escHtml(refLabel)}">` +
      `<button class="nvb-delete" contenteditable="false">\u2715</button>` +
      `<div class="nvb-ref"><span class="material-icons" style="font-size:13px;vertical-align:middle;margin-right:3px;">menu_book</span>${_escHtml(refLabel)}</div>` +
      `<div class="nvb-body">${versesHTML}</div></div><p><br></p>`;

    // Select the typed reference text so insertHTML replaces it cleanly
    bodyEl.focus();
    const fullText = regexMatch[0];
    const trimmed = fullText.replace(/^\s/, "");
    const content = textNode.textContent;
    const matchIdx = content.lastIndexOf(trimmed);
    if (matchIdx >= 0 && textNode.parentNode) {
      const r = document.createRange();
      r.setStart(textNode, matchIdx);
      r.setEnd(textNode, matchIdx + trimmed.length);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    }
    document.execCommand("insertHTML", false, blockHTML);

    // Ensure cursor lands in the new <p> after the block
    setTimeout(() => {
      const allP = bodyEl.querySelectorAll("p");
      const lastP = allP[allP.length - 1];
      if (lastP) {
        const r = document.createRange();
        r.selectNodeContents(lastP);
        r.collapse(false);
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
      }
    }, 0);

    _brefHide();
    autoSave();
  });

  // Dismiss preview
  container.querySelector("#brefDismiss").addEventListener("mousedown", e => e.preventDefault());
  container.querySelector("#brefDismiss").addEventListener("click", () => _brefHide());

  // Wire up input listener
  bodyEl.addEventListener("input", _brefOnInput);
  bodyEl.addEventListener("blur", () => setTimeout(_brefHide, 250));
  bodyEl.addEventListener("keydown", e => {
    if (e.key === "Escape") { _brefHide(); return; }
    if (!brefDropdown.hidden) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = brefDropdown.querySelectorAll(".bref-dropdown-item");
        let idx = [...items].findIndex(i => i.classList.contains("active"));
        items[idx]?.classList.remove("active");
        idx = e.key === "ArrowDown" ? Math.min(idx + 1, items.length - 1) : Math.max(idx - 1, 0);
        items[idx]?.classList.add("active");
      }
      if (e.key === "Enter" || e.key === "Tab") {
        const active = brefDropdown.querySelector(".bref-dropdown-item.active");
        if (active) { e.preventDefault(); active.click(); }
      }
    }
  });
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

function _stripNotePreview(n) {
  const html = n.bodyHTML || "";
  if (html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    // Replace verse blocks with just their reference label (e.g. "[John 3:16]")
    tmp.querySelectorAll(".note-verse-block").forEach(el => {
      const ref = el.dataset.ref || el.querySelector(".nvb-ref")?.textContent?.trim() || "";
      el.replaceWith(document.createTextNode(ref ? ` [${ref}] ` : " "));
    });
    return (tmp.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);
  }
  return (n.body || "").replace(/\n/g, " ").slice(0, 120);
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
