// ── NOTES ─────────────────────────────────────────────────────────────────────
// Notes are one text per chapter (localStorage `chapterNote.<BOOK>-<CH>` = {text,time}),
// synced per user. The old per-verse notes and AI reflection answers (retired
// 2026-11-21) stay in localStorage untouched and are read-only through the Archive.

const CHAPTER_NOTE_PREFIX = "chapterNote.";
function _chapterNoteKey(bookId, ch) { return `${CHAPTER_NOTE_PREFIX}${bookId}-${ch}`; }
function _loadChapterNote(bookId, ch) {
  try {
    const o = JSON.parse(localStorage.getItem(_chapterNoteKey(bookId, ch)) || "null");
    return o && typeof o.text === "string" ? o : { text: "", time: 0 };
  } catch { return { text: "", time: 0 }; }
}
function _saveChapterNote(bookId, ch, text) {
  const k = _chapterNoteKey(bookId, ch);
  if (!text.trim()) localStorage.removeItem(k);
  else localStorage.setItem(k, JSON.stringify({ text, time: Date.now() }));
}

function _getAllNotes() {
  const notes = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(CHAPTER_NOTE_PREFIX)) continue;
    const [bookId, ch] = k.slice(CHAPTER_NOTE_PREFIX.length).split("-");
    const n = _loadChapterNote(bookId, ch);
    if (!n.text.trim()) continue;
    notes.push({
      id: `chapter-${bookId}-${ch}`,
      type: "chapter",
      bookId, chapter: ch,
      passageKey: `${bookId}-${ch}`,
      title: `${BIBLE_META[bookId]?.name || bookId} ${ch}`,
      preview: n.text.trim(),
      time: n.time,
    });
  }
  const standalone = JSON.parse(localStorage.getItem("devotionStandaloneNotes") || "[]");
  standalone.forEach(n => {
    notes.push({ id: `s-${n.id}`, type: "standalone", standaloneId: n.id, title: n.title || "Untitled", preview: _stripNotePreview(n), time: n.updatedAt, data: n });
  });
  return notes.sort((a, b) => b.time - a.time);
}

// Read-only archive of everything written before the rebuild.
function _getArchiveNotes() {
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

  return notes.sort((a, b) => b.time - a.time);
}

// Share devotion (multi-chapter Q&A) to Apple Notes / share sheet.
// Bundles every reflection-* localStorage entry with a non-empty answer,
// grouped by book + chapter, formatted to match Charlie's iCloud Notes pattern.
function _collectDevoReflections() {
  const groups = {};
  // Use Web Storage API key(i)/length so this works with the Firebase-sync
  // mirror too (mirror exposes length/key/getItem but NOT Object.keys).
  const keys = [];
  const len = localStorage.length || 0;
  for (let i = 0; i < len; i++) {
    const k = localStorage.key(i);
    if (k) keys.push(k);
  }
  for (const key of keys) {
    if (!key.startsWith("reflection-")) continue;
    if (key.startsWith("reflection-time-")) continue;
    const value = localStorage.getItem(key);
    if (!value) continue;
    const aIdx = value.indexOf("\nA: ");
    if (aIdx < 0) continue;
    const question = value.slice(0, aIdx).replace(/^Q:\s*/, "").trim();
    const answer = value.slice(aIdx + 4).trim();
    if (!answer) continue;
    const stripped = key.slice("reflection-".length);
    const parts = stripped.split("-");
    if (parts.length < 4) continue;
    const index = parseInt(parts[parts.length - 1], 10);
    const verse = parts[parts.length - 2];
    const chapter = parts[parts.length - 3];
    const book = parts.slice(0, parts.length - 3).join("-");
    if (!book || !chapter) continue;
    const passageId = `${book}-${chapter}-${verse}`;
    if (!groups[passageId]) {
      const t = parseInt(localStorage.getItem(`reflection-time-${passageId}`) || "0", 10);
      groups[passageId] = { book, chapter, verse, items: [], lastTime: t };
    }
    groups[passageId].items.push({ index: isNaN(index) ? 0 : index, question, answer });
  }
  for (const k of Object.keys(groups)) {
    groups[k].items.sort((a, b) => a.index - b.index);
  }
  const bookOrder = (window.BIBLE_META && Object.keys(window.BIBLE_META)) || [];
  return Object.values(groups).sort((a, b) => {
    const ai = bookOrder.indexOf(a.book);
    const bi = bookOrder.indexOf(b.book);
    if (ai !== bi) return ai - bi;
    const ac = parseInt(a.chapter, 10) || 0;
    const bc = parseInt(b.chapter, 10) || 0;
    if (ac !== bc) return ac - bc;
    return (parseInt(a.verse, 10) || 0) - (parseInt(b.verse, 10) || 0);
  });
}

function _devoShareGroupLabel(g) {
  const meta = window.BIBLE_META && window.BIBLE_META[g.book];
  const bookName = meta?.name || g.book;
  return g.verse ? `${bookName} ${g.chapter}:${g.verse}` : `${bookName} ${g.chapter}`;
}

function _devoShareIsToday(ms) {
  if (!ms) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return ms >= start.getTime();
}

function _devoShareFormatTitle(isoDate) {
  const [y, m, d] = isoDate.split("-").map(n => parseInt(n, 10));
  if (!y || !m || !d) return "Devotion";
  const dt = new Date(y, m - 1, d);
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${months[dt.getMonth()]} ${dt.getDate()} Devotion`;
}

function _devoShareBuildText(title, groups) {
  let out = `${title}\n\n`;
  groups.forEach((g, gi) => {
    out += `${_devoShareGroupLabel(g)} Notes\n\n`;
    g.items.forEach(({ question, answer }, i) => {
      out += `Q: ${question}\nA: ${answer}`;
      if (i < g.items.length - 1) out += "\n\n";
    });
    if (gi < groups.length - 1) out += "\n\n";
  });
  return out;
}

function _devoShareToast(msg) {
  const toast = document.createElement("div");
  toast.className = "notes-toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
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

// "Nov 20, 5:20 PM" (year only when it is not this year).
function _noteStamp(ms) {
  const d = new Date(ms);
  const opts = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleString("en-US", opts);
}

function _escHtml(str) {
  return (str || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ── IMMERSIVE TTS MODE ────────────────────────────────────────────────────────
