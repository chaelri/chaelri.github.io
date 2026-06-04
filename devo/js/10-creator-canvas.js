/* ═══════════════════════════════════════════════════════════════════════════
   IMAGE CREATOR — Scene & Verse Card Generator
   ═══════════════════════════════════════════════════════════════════════════ */

let _imgcrMode = "scene";
let _imgcrAspect = "9:16";
let _imgcrLastDataUrl = null;

function openImageCreator(mode) {
  _imgcrMode = mode || "scene";
  _imgcrLastDataUrl = null;
  const panel = document.getElementById("imgCreatorPanel");
  panel.hidden = false;
  requestAnimationFrame(() => panel.classList.add("imgcr-open"));
  document.getElementById("imgCreatorTitle").textContent = _imgcrMode === "scene" ? "Create Scene" : "Create Verse Card";
  document.getElementById("imgcrModeScene").classList.toggle("active", _imgcrMode === "scene");
  document.getElementById("imgcrModeVerse").classList.toggle("active", _imgcrMode === "verse");
  document.getElementById("imgcrAspectRow").style.display = _imgcrMode === "scene" ? "flex" : "none";
  _imgcrAspect = "9:16";
  _imgcrPopulateBooks();
  document.getElementById("imgcrPreview").innerHTML = "";
  document.getElementById("imgcrActions").hidden = true;
  document.getElementById("imgCreatorBack").onclick = closeImageCreator;
  document.getElementById("imgcrModeScene").onclick = () => _imgcrSwitchMode("scene");
  document.getElementById("imgcrModeVerse").onclick = () => _imgcrSwitchMode("verse");
  document.getElementById("imgcrGenBtn").onclick = _imgcrGenerate;
  document.querySelectorAll(".imgcr-aspect-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.ratio === _imgcrAspect);
    btn.onclick = () => {
      document.querySelectorAll(".imgcr-aspect-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      _imgcrAspect = btn.dataset.ratio;
    };
  });
  document.getElementById("imgcrDownload").onclick = _imgcrDownload;
  document.getElementById("imgcrShare").onclick = _imgcrShare;
}

function closeImageCreator() {
  const panel = document.getElementById("imgCreatorPanel");
  panel.classList.remove("imgcr-open");
  panel.addEventListener("transitionend", () => { panel.hidden = true; }, { once: true });
}

function _imgcrSwitchMode(mode) {
  _imgcrMode = mode;
  document.getElementById("imgCreatorTitle").textContent = mode === "scene" ? "Create Scene" : "Create Verse Card";
  document.getElementById("imgcrModeScene").classList.toggle("active", mode === "scene");
  document.getElementById("imgcrModeVerse").classList.toggle("active", mode === "verse");
  document.getElementById("imgcrAspectRow").style.display = mode === "scene" ? "flex" : "none";
  if (mode === "verse") _imgcrAspect = "9:16";
}

function _imgcrPopulateBooks() {
  const bSel = document.getElementById("imgcrBook");
  const cSel = document.getElementById("imgcrChapter");
  const vSel = document.getElementById("imgcrVerse");
  bSel.innerHTML = Object.keys(BIBLE_META).map(k => `<option value="${k}">${BIBLE_META[k].name}</option>`).join("");
  if (bookEl?.value) bSel.value = bookEl.value;
  const fillCh = () => {
    const meta = BIBLE_META[bSel.value];
    if (!meta) return;
    cSel.innerHTML = meta.chapters.map((_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("");
    if (bSel.value === bookEl?.value && chapterEl?.value) cSel.value = chapterEl.value;
    fillV();
  };
  const fillV = () => {
    const meta = BIBLE_META[bSel.value];
    if (!meta) return;
    const count = meta.chapters[parseInt(cSel.value) - 1] || 30;
    vSel.innerHTML = '<option value="">Whole chapter</option>' + Array.from({ length: count }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("");
  };
  bSel.onchange = fillCh;
  cSel.onchange = fillV;
  fillCh();
}

async function _imgcrGenerate() {
  const btn = document.getElementById("imgcrGenBtn");
  const preview = document.getElementById("imgcrPreview");
  const actions = document.getElementById("imgcrActions");
  const bookCode = document.getElementById("imgcrBook").value;
  const chapter = document.getElementById("imgcrChapter").value;
  const verse = document.getElementById("imgcrVerse").value;
  const bookName = BIBLE_META[bookCode]?.name || bookCode;
  btn.disabled = true;
  btn.innerHTML = '<span class="material-icons">hourglass_top</span> Generating...';
  actions.hidden = true;
  const ratio = _imgcrMode === "verse" ? "9 / 16" : _imgcrAspect.replace(":", " / ");
  preview.innerHTML = `<div class="imgcr-shimmer" style="aspect-ratio:${ratio}"></div>`;
  try {
    let dataUrl;
    if (_imgcrMode === "scene") {
      const prompt = buildScenePrompt(bookName, chapter, verse || null, "Highly detailed, dramatic, museum quality");
      dataUrl = await callImageGen(prompt, _imgcrAspect);
    } else {
      dataUrl = await _imgcrBuildVerseCard(bookCode, bookName, chapter, verse);
    }
    _imgcrLastDataUrl = dataUrl;
    preview.innerHTML = `<img src="${dataUrl}" alt="Generated image">`;
    actions.hidden = false;
  } catch {
    preview.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.3);padding:20px"><span class="material-icons" style="font-size:32px;display:block;margin-bottom:8px">error_outline</span>Failed to generate. Try again.</div>';
  }
  btn.disabled = false;
  btn.innerHTML = '<span class="material-icons">auto_awesome</span> Generate';
}

async function _imgcrBuildVerseCard(bookCode, bookName, chapter, verse) {
  let verseText = "", refLabel = bookName + " " + chapter;
  if (verse) {
    verseText = getVerseText(bookCode, chapter, verse);
    refLabel = bookName + " " + chapter + ":" + verse;
  } else {
    const v1 = getVerseText(bookCode, chapter, "1");
    const v2 = getVerseText(bookCode, chapter, "2");
    verseText = v1 + (v2 && v2 !== "Verse text not found." ? " " + v2 : "");
    refLabel = bookName + " " + chapter + ":1-2";
  }
  if (!verseText || verseText === "Verse text not found.") verseText = "The Lord is my shepherd; I shall not want.";

  // Unique theme per passage so each verse gets a different design
  const themes = ["soft golden light and warm earth tones", "cool blue twilight with silver accents", "warm sunset amber and deep burgundy", "gentle morning mist with sage greens", "deep indigo night sky with starlight", "rose gold and blush pink marble texture", "ocean teal with soft white foam patterns", "autumn bronze and deep forest green"];
  const themeIdx = (bookCode.charCodeAt(0) + parseInt(chapter) + parseInt(verse || "0")) % themes.length;
  const bgPrompt = "Abstract minimalist background for " + bookName + " " + chapter + (verse ? ":" + verse : "") + ". Style: " + themes[themeIdx] + ". Subtle light rays, elegant, modern, clean. No people, no objects, no text, no letters, no words.";
  const bgDataUrl = await callImageGen(bgPrompt, "9:16");

  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");

  const bgImg = new Image();
  await new Promise((res, rej) => { bgImg.onload = res; bgImg.onerror = rej; bgImg.src = bgDataUrl; });
  ctx.drawImage(bgImg, 0, 0, 1080, 1920);

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, 0, 1080, 1920);

  ctx.textAlign = "center";
  const fs = verseText.length > 150 ? 48 : verseText.length > 80 ? 56 : 64;
  const font = "300 " + fs + "px 'Google Sans Flex', 'Helvetica Neue', sans-serif";
  ctx.font = font;
  const maxW = 900, lh = fs * 1.5;
  const words = verseText.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);

  const totalH = lines.length * lh;
  let y = (1920 - totalH) / 2 + fs;

  ctx.font = "200 120px 'Google Sans Flex', serif";
  ctx.fillStyle = "rgba(219,39,119,0.6)";
  ctx.fillText("\u201C", 540, y - 50);

  ctx.font = font;
  ctx.fillStyle = "#ffffff";
  for (const line of lines) { ctx.fillText(line, 540, y); y += lh; }

  ctx.font = "600 36px 'Google Sans Flex', sans-serif";
  ctx.fillStyle = "rgba(219,39,119,0.8)";
  ctx.fillText(refLabel, 540, y + 40);

  ctx.font = "400 28px 'Monsieur La Doulaise', cursive";
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillText("devotion.", 540, 1860);

  return canvas.toDataURL("image/png");
}

function _imgcrDownload() {
  if (!_imgcrLastDataUrl) return;
  const a = document.createElement("a");
  a.href = _imgcrLastDataUrl;
  a.download = "devotion-" + _imgcrMode + "-" + Date.now() + ".png";
  a.click();
}

async function _imgcrShare() {
  if (!_imgcrLastDataUrl) return;
  try {
    const res = await fetch(_imgcrLastDataUrl);
    const blob = await res.blob();
    const file = new File([blob], "devotion-" + _imgcrMode + ".png", { type: "image/png" });
    if (navigator.share && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Devotion" });
    } else { _imgcrDownload(); }
  } catch { _imgcrDownload(); }
}

// =============================================
// BIBLE SEARCH — Full-text search across all books
// =============================================
(function initBibleSearch() {
  const searchBtn = document.getElementById("bibleSearchBtn");
  const modal = document.getElementById("bibleSearchModal");
  const input = document.getElementById("bibleSearchInput");
  const closeBtn = document.getElementById("bibleSearchClose");
  const resultsEl = document.getElementById("bibleSearchResults");
  const hintEl = document.getElementById("bibleSearchHint");
  if (!searchBtn || !modal) return;

  const BOOK_KEYS = Object.keys(BIBLE_META);
  const MAX_RESULTS = 50;

  function openSearch() {
    modal.hidden = false;
    requestAnimationFrame(() => {
      modal.classList.add("open");
      input.value = "";
      resultsEl.innerHTML = "";
      hintEl.textContent = "Type at least 3 characters to search all verses";
      hintEl.hidden = false;
      setTimeout(() => input.focus(), 100);
    });
  }

  function closeSearch() {
    modal.classList.remove("open");
    input.blur();
    setTimeout(() => { modal.hidden = true; }, 250);
  }

  searchBtn.onclick = async () => {
    if (!bibleData) await fetchBibleData();
    openSearch();
  };
  closeBtn.onclick = closeSearch;

  // Parse verse reference like "John 3:16", "Gen 1", "1 Cor 13:4"
  function parseRef(q) {
    const m = q.match(/^(\d?\s?[a-zA-Z]+(?:\s[a-zA-Z]+)?)\s+(\d+)(?::(\d+))?$/);
    if (!m) return null;
    const rawBook = m[1].trim().toLowerCase();
    const ch = parseInt(m[2]);
    const v = m[3] ? parseInt(m[3]) : null;
    // Match against BIBLE_META
    for (const code of BOOK_KEYS) {
      const name = BIBLE_META[code].name.toLowerCase();
      if (name === rawBook || name.startsWith(rawBook) || code.toLowerCase() === rawBook) {
        if (ch >= 1 && ch <= BIBLE_META[code].chapters.length) {
          return { code, name: BIBLE_META[code].name, ch, v };
        }
      }
    }
    return null;
  }

  function highlight(text, query) {
    if (!query || query.length < 3) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(new RegExp(`(${escaped})`, "gi"), '<mark class="bible-search-mark">$1</mark>');
  }

  function renderResults(results, query) {
    if (!results.length) {
      resultsEl.innerHTML = `<div class="bible-search-empty">No results for "${query}"</div>`;
      return;
    }
    resultsEl.innerHTML = results.map((r) => `
      <div class="bible-search-result" data-id="${r.code}-${r.ch}-${r.v || ''}">
        <div class="bible-search-ref">${r.name} ${r.ch}${r.v ? ':' + r.v : ''}</div>
        <div class="bible-search-text">${highlight(r.text, query)}</div>
      </div>
    `).join("");

    if (results.length >= MAX_RESULTS) {
      resultsEl.innerHTML += `<div class="bible-search-cap">Showing first ${MAX_RESULTS} results</div>`;
    }
  }

  function doSearch(q) {
    q = q.trim();
    if (q.length < 3) {
      resultsEl.innerHTML = "";
      hintEl.textContent = "Type at least 3 characters to search all verses";
      hintEl.hidden = false;
      return;
    }
    hintEl.hidden = true;

    if (!bibleData) {
      resultsEl.innerHTML = '<div class="bible-search-empty">Bible data not loaded. Try again.</div>';
      return;
    }

    // 1. Try reference parse
    const ref = parseRef(q);
    if (ref) {
      const bookName = BIBLE_META[ref.code].name.toUpperCase();
      const chData = bibleData[bookName]?.[String(ref.ch)];
      if (chData) {
        const found = [];
        if (ref.v) {
          const text = chData[String(ref.v)];
          if (text) found.push({ code: ref.code, name: ref.name, ch: ref.ch, v: ref.v, text });
        } else {
          for (const [vn, text] of Object.entries(chData)) {
            if (vn.includes("-")) continue;
            found.push({ code: ref.code, name: ref.name, ch: ref.ch, v: parseInt(vn), text });
          }
          found.sort((a, b) => a.v - b.v);
        }
        if (found.length) {
          renderResults(found, q);
          return;
        }
      }
    }

    // 2. Book name matches
    const lower = q.toLowerCase();
    const found = [];
    for (const code of BOOK_KEYS) {
      const meta = BIBLE_META[code];
      if (meta.name.toLowerCase().startsWith(lower)) {
        found.push({ code, name: meta.name, ch: 1, v: null, text: `${meta.name} — ${meta.chapters.length} chapters` });
      }
    }

    // 3. Text content search
    for (const code of BOOK_KEYS) {
      if (found.length >= MAX_RESULTS) break;
      const meta = BIBLE_META[code];
      const bookData = bibleData[meta.name.toUpperCase()] || bibleData[meta.name];
      if (!bookData) continue;
      for (let ch = 1; ch <= meta.chapters.length; ch++) {
        if (found.length >= MAX_RESULTS) break;
        const chData = bookData[String(ch)];
        if (!chData) continue;
        for (const [vn, text] of Object.entries(chData)) {
          if (vn.includes("-")) continue;
          if (text.toLowerCase().includes(lower)) {
            found.push({ code, name: meta.name, ch, v: parseInt(vn), text });
            if (found.length >= MAX_RESULTS) break;
          }
        }
      }
    }

    renderResults(found, q);
  }

  let _searchTimer = null;
  input.addEventListener("input", () => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => doSearch(input.value), 200);
  });

  // Navigate on result click
  resultsEl.addEventListener("click", (e) => {
    const row = e.target.closest(".bible-search-result");
    if (!row) return;
    const id = row.dataset.id;
    closeSearch();
    const [bookCode, ch, v] = id.split("-");
    loadPassageById(`${bookCode}-${ch}-`, v || null);
  });

  // Close on Escape
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSearch();
  });
})();

/* =====================================================================
 * CANVAS MODE — full-screen highlight / note / text view (paper bg, no scale)
 * =====================================================================
 * Per-passage state (localStorage key `devo.canvas.<book>-<chapter>`):
 *   { highlights:{wordIdx:color}, notes:{wordIdx:text},
 *     textBoxes:[{x,y,text}], gridOn }
 * Highlight is applied LIVE as the pointer crosses a word (WYSIWYG — same
 * color during swipe and after). Word hit-testing uses elementFromPoint.
 * No pan/zoom transform → text stays crisp.
 * =================================================================== */
(function canvasMode() {
  const overlay   = document.getElementById("canvasModeOverlay");
  if (!overlay) return;
  const btn       = document.getElementById("canvasModeBtn");
  const closeBtn  = document.getElementById("cmCloseBtn");
  const titleEl   = document.getElementById("cmTitle");
  const undoBtn   = document.getElementById("cmUndoBtn");
  const redoBtn   = document.getElementById("cmRedoBtn");
  const viewport  = document.getElementById("cmViewport");
  const scrollEl  = document.getElementById("cmScroll");
  const paperEl   = document.getElementById("cmPaper");
  const passageTitleEl2 = document.getElementById("cmPassageTitle");
  const passageEl = document.getElementById("cmPassage");
  const contextEl = document.getElementById("cmContext");
  // Q&A thread for the current chapter view. Resets on every renderPassage
  // (so leaving + re-entering a chapter starts a clean thread).
  let _ctxThread = [];
  const popover   = document.getElementById("cmPopover");
  const fab       = document.getElementById("cmFab");
  const fabIcon   = document.getElementById("cmFabIcon");
  const fabArc    = document.getElementById("cmFabArc");
  const fabColorDot = document.getElementById("cmFabColorDot");
  const COLOR_HEX = { yellow: "#ffe66b", pink: "#f9a8d4", blue: "#93c5fd", orange: "#fdba74", green: "#bef264" };
  const COLOR_GLOW = {
    yellow: "rgba(255, 230, 107, 0.55)",
    pink:   "rgba(249, 168, 212, 0.55)",
    blue:   "rgba(147, 197, 253, 0.55)",
    orange: "rgba(253, 186, 116, 0.55)",
    green:  "rgba(190, 242, 100, 0.55)",
  };
  const noteModal = document.getElementById("cmNoteModal");
  const noteRef   = document.getElementById("cmNoteRef");
  const noteInput = document.getElementById("cmNoteInput");
  const noteSave  = document.getElementById("cmNoteSave");
  const noteCancel = document.getElementById("cmNoteCancel");
  const noteView  = document.getElementById("cmNoteView");
  const noteViewRef = document.getElementById("cmNoteViewRef");
  const noteViewBody = document.getElementById("cmNoteViewBody");
  const noteViewClose = document.getElementById("cmNoteViewClose");
  const noteViewEdit = document.getElementById("cmNoteViewEdit");
  const noteViewDelete = document.getElementById("cmNoteViewDelete");

  const DEFAULT_COLOR = "yellow";
  let state = null;
  let stateKey = null;
  let currentInfo = null;     // { bookId, bookName, chapterNum, ... }
  let tool = "highlight";
  let color = DEFAULT_COLOR;
  let strokeActive = false;
  let strokeTouched = null;   // Set of word indices touched this stroke
  let strokePointerId = null;
  // After a long-press stroke ends, the browser still fires a synthesized
  // `click` for the pointerdown/up pair (since the pointer didn't move
  // enough to suppress it). That click would otherwise open the tap-popover
  // — so we swallow exactly one click after any committed stroke.
  let suppressNextClick = false;
  // Long-press to highlight: hold ~350ms without moving to engage stroke
  // mode. Moving before the timer fires cancels it so `touch-action: pan-y`
  // lets the browser scroll normally. Tap (quick down+up with no movement)
  // falls through to the click listener → popover. No direction arbitration,
  // so mobile browsers can't steal the gesture mid-swipe.
  let pendingStroke = null;        // { x, y, pointerId }
  let longPressTimer = null;
  const LONG_PRESS_MS = 100;
  const LONG_PRESS_MOVE_MAX = 8;   // px before we abandon the hold
  function cancelLongPress() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    pendingStroke = null;
  }

  // Undo/redo: snapshot state.highlights before each mutation. Capped to
  // avoid unbounded memory on heavy sessions.
  const HISTORY_MAX = 50;
  let undoStack = [];
  let redoStack = [];
  function snapshot() { return JSON.parse(JSON.stringify(state.highlights || {})); }
  function pushHistory() {
    undoStack.push(snapshot());
    if (undoStack.length > HISTORY_MAX) undoStack.shift();
    redoStack = [];
    refreshHistoryButtons();
  }
  function refreshHistoryButtons() {
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
  }
  function resetHistory() {
    undoStack = [];
    redoStack = [];
    refreshHistoryButtons();
  }
  function doUndo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    state.highlights = undoStack.pop();
    saveState();
    if (currentInfo) renderPassage(currentInfo);
    refreshHistoryButtons();
  }
  function doRedo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    state.highlights = redoStack.pop();
    saveState();
    if (currentInfo) renderPassage(currentInfo);
    refreshHistoryButtons();
  }

  // ---------- Persistence ----------
  function loadState(key) {
    try {
      const raw = localStorage.getItem(`devo.canvas.${key}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { highlights: parsed.highlights || {} };
      }
    } catch (_) {}
    return { highlights: {} };
  }
  function saveState() {
    if (!stateKey) return;
    try { localStorage.setItem(`devo.canvas.${stateKey}`, JSON.stringify(state)); } catch (_) {}
  }

  // ---------- Passage info ----------
  function getCurrentPassageInfo() {
    const bookId = bookEl?.value;
    const chapterNum = chapterEl?.value;
    if (!bookId || !chapterNum || !bibleData) return null;
    const bookName = BIBLE_META[bookId]?.name;
    if (!bookName) return null;
    const chapterContent = bibleData[bookName.toUpperCase()]?.[chapterNum];
    if (!chapterContent) return null;
    return { bookId, bookName, chapterNum, chapterContent, key: `${bookId}-${chapterNum}` };
  }

  // ---------- Render passage ----------
  function renderPassage(info) {
    passageEl.innerHTML = "";
    _ctxThread = [];
    _renderContext(info);
    let wordIdx = 0;
    const verses = Object.entries(info.chapterContent)
      .map(([v, t]) => ({ v, t }))
      .sort((a, b) => parseInt(a.v) - parseInt(b.v));

    for (const { v, t } of verses) {
      const verseEl2 = document.createElement("div");
      verseEl2.className = "cm-verse";
      const num = document.createElement("span");
      num.className = "cm-verse-num";
      num.textContent = v;
      verseEl2.appendChild(num);
      const verseKey = keyOf(info.bookId, info.chapterNum, v);
      const words = t.trim().replace(/\s+/g, " ").split(" ");
      for (let i = 0; i < words.length; i++) {
        const w = document.createElement("span");
        w.className = "cm-word";
        w.dataset.idx = wordIdx;
        w.dataset.verseKey = verseKey;
        w.dataset.verse = v;
        w.textContent = words[i];
        const c = state.highlights[wordIdx];
        if (c) w.dataset.color = c;
        verseEl2.appendChild(w);
        if (i < words.length - 1) {
          const gap = document.createElement("span");
          gap.className = "cm-gap";
          gap.dataset.left = wordIdx;
          gap.dataset.right = wordIdx + 1;
          gap.textContent = " ";
          verseEl2.appendChild(gap);
        }
        wordIdx++;
      }
      // Heart toggle pinned to the top-right of the verse block. Same store as
      // the dashboard — toggleFavorite() / saveFavorites() update the global
      // `favorites` map and (in Charlie mode) flow through to RTDB.
      const favBtn = document.createElement("button");
      favBtn.className = "cm-fav-btn";
      favBtn.type = "button";
      favBtn.setAttribute("aria-label", "Favorite verse");
      const setFavIcon = () => {
        const filled = typeof isFavorite === "function" && isFavorite(verseKey);
        favBtn.classList.toggle("active", filled);
        favBtn.innerHTML = `<span class="material-icons">${filled ? "favorite" : "favorite_border"}</span>`;
      };
      setFavIcon();
      favBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (typeof toggleFavorite === "function") {
          toggleFavorite(verseKey);
          setFavIcon();
          favBtn.classList.add("cm-fav-pop");
          setTimeout(() => favBtn.classList.remove("cm-fav-pop"), 320);
        }
      });
      verseEl2.appendChild(favBtn);
      passageEl.appendChild(verseEl2);

      // Tap the verse number to jump TTS playback. If TTS isn't running yet,
      // start canvas-mode playback at this verse. We deliberately put the jump
      // affordance on the number (and not the words) so word-tap stays free
      // for the existing popover.
      num.addEventListener("click", (e) => {
        e.stopPropagation();
        if (typeof ttsJumpToVerse === "function" && ttsJumpToVerse(v)) return;
        if (typeof playChapterInCanvas === "function") playChapterInCanvas(v);
      });
    }

    // Reflect button at the end — matches the styled one from the dashboard
    // (pink volunteer_activism icon + pill button).
    const reflectRow = document.createElement("div");
    reflectRow.className = "cm-reflect-row";
    const reflectBtn = document.createElement("button");
    reflectBtn.className = "action-reflect-btn cm-reflect-btn";
    reflectBtn.innerHTML = `<span class="material-icons">volunteer_activism</span>Reflect`;
    reflectBtn.addEventListener("click", () => {
      if (typeof openReflectModal === "function") openReflectModal();
    });
    reflectRow.appendChild(reflectBtn);
    passageEl.appendChild(reflectRow);

    refreshRuns();
    refreshNoteBadges();
  }

  // Float a small badge ABOVE each noted word (absolute-positioned child),
  // so it never breaks the inline reading flow.
  function refreshNoteBadges() {
    passageEl.querySelectorAll(".cm-note-badge").forEach((n) => n.remove());
    passageEl.querySelectorAll(".cm-word").forEach((w) => {
      const idx = +w.dataset.idx;
      const vKey = w.dataset.verseKey;
      const entries = (typeof comments !== "undefined" && comments[vKey]) || [];
      if (entries.some((e) => e.wordIdx === idx)) {
        const badge = document.createElement("span");
        badge.className = "cm-note-badge";
        badge.dataset.wordIdx = idx;
        badge.innerHTML = '<span class="material-symbols-outlined">sticky_note_2</span>';
        badge.setAttribute("aria-label", "View note");
        w.classList.add("cm-word-has-note");
        w.appendChild(badge);
      }
    });
  }

  // ── Compact context accordion ─────────────────────────────────────────────
  // Sits above the verses in canvas mode. Shows a 4-line AI summary
  // (characters / setting / background / recap) cached per chapter in
  // localStorage. Charlie's localStorage mirror auto-flushes the
  // `chapterContext.` prefix to RTDB (see firebase-sync.js).
  // Below the summary, a small "Ask…" input streams Q&A inline; the thread
  // is session-only (cleared on each renderPassage).
  const _ctxKey = (info) => `chapterContext.${info.bookId}-${info.chapterNum}`;

  function _ctxBuildPrompt(info) {
    const isChapterOne = String(info.chapterNum) === "1";
    return [
      `You are summarizing a Bible chapter for a quick context card. Be tight and useful.`,
      `Book: ${info.bookName} — Chapter: ${info.chapterNum}.`,
      `Output EXACTLY four lines, each starting with the bolded label as shown. No extras, no markdown bullets, no preamble.`,
      `**Characters:** comma-separated key figures in this chapter (max ~6).`,
      `**Setting:** time + place in 1 short clause.`,
      `**Background:** 1–2 sentences on what's going on at this point in the book.`,
      isChapterOne
        ? `**What's just before:** Write "Opening of ${info.bookName}." and nothing else.`
        : `**What's just before:** ONE sentence recapping the immediately prior chapter(s).`,
      `Use plain English. Bold the labels with **double asterisks**. Total ≤90 words.`,
    ].join(" ");
  }

  function _ctxAskPrompt(info, question, summaryText, thread) {
    const prior = (thread || [])
      .slice(-8) // keep last few turns to bound prompt size
      .map((t) => `${t.role === "user" ? "USER" : "ASSISTANT"}: ${t.text}`)
      .join("\n");
    return [
      `You are a patient Bible-study teacher whose primary topic is ${info.bookName} ${info.chapterNum}, but you're also happy to answer related curiosities the user brings up. Your job is to actually TEACH, not just spit a one-liner — explain the WHAT, the WHY, and a concrete example so it sticks.`,
      `Topic-handling rules — pick ONE before answering:`,
      `• ON-TOPIC (default): question is about a word, person, event, theme, or detail in ${info.bookName} ${info.chapterNum}, OR is ambiguous. Anchor your answer in the chapter and tie it back at the end.`,
      `• ADJACENT: question is biblical/spiritual/historical but not about this chapter (e.g. asking about another book, a doctrine, a Bible character from elsewhere, a Hebrew/Greek word, prayer practice, etc.). Just answer it directly. You MAY add one short sentence at the end relating it to ${info.bookName} ${info.chapterNum} ONLY if a natural connection exists — never force one. If no clean tie-in exists, end the answer without one.`,
      `• OFF-TOPIC: question is genuinely unrelated to the Bible (e.g. coding, recipes, current events, random trivia). Answer it normally and naturally — do NOT scold, redirect, or apologize for going off-topic. The user is allowed to be curious. Don't pretend to redirect to the chapter; just answer the question and stop.`,
      `Existing context summary you can rely on:\n${summaryText || "(none)"}`,
      prior ? `Conversation so far (oldest → newest):\n${prior}` : "",
      `Smart-input rules — apply BEFORE answering:`,
      `1. If a word in the question looks like a typo or near-spelling of a real biblical/animal/place term (e.g. "hoop" → "hoof", "Mosses" → "Moses"), gently correct it on the FIRST line: "Did you mean **<correct>**?" then answer about the corrected term.`,
      `2. If the user mixes English with Filipino filler particles ("pala", "ba", "naman", "po", "kasi", "lang", "din", "rin", "yung", "talaga", "e", "nga"), strip them and answer the underlying question. Don't quote them back as if they were content.`,
      `3. If the user types a single word or fragment, treat it as "what is/who is/where is …?" — interpret using the chapter context first, but if the term clearly doesn't appear there, answer it on its own.`,
      `4. If the question is ambiguous, pick the most likely meaning given the chapter content and answer; only ask back if truly impossible.`,
      `5. Use the conversation so far for pronouns and follow-ups ("what about him?" / "and then?") — resolve them silently from history.`,
      `6. Detect CONFUSION SIGNALS like "di ko gets", "hindi ko gets", "i don't understand", "explain", "what is X", "ano ba yun", "paano", "why", "how", "huh", "wtf", or any phrasing that says the user wants more clarity. When you detect any of these, default to the LONGER teaching format below.`,
      `Answer formats — choose ONE based on the question:`,
      `• SHORT (2–3 sentences): when the user asks a plain factual question and clearly already knows the territory ("how many verses?", "who said X?").`,
      `• TEACHING (4–7 sentences in 1–2 short paragraphs): when ANY confusion signal fires, when the user asks "what is X?" about a non-obvious term, or when the answer needs anchoring. Structure: (a) plain-language definition or correction, (b) a concrete real-world example or analogy when useful, (c) how it ties to ${info.bookName} ${info.chapterNum} ONLY if it actually does, (d) a brief "so what" if natural.`,
      `Voice: warm, patient, like a friend explaining over coffee. No filler ("Great question!", "That's a fascinating…"). No hedging ("It is interesting to note that…"). Bold key terms with **double asterisks**. Plain English; if the user wrote Taglish you can mirror a casual Taglish tone in your reply.`,
      `User question: "${question}"`,
      AI_TONE,
    ].filter(Boolean).join("\n\n");
  }

  function _renderContext(info) {
    if (!contextEl) return;
    contextEl.hidden = false;
    contextEl.innerHTML = `
      <button type="button" class="cm-ctx-head" aria-expanded="false">
        <span class="material-symbols-outlined cm-ctx-head-icon">menu_book</span>
        <span class="cm-ctx-head-label">Context · Ask</span>
        <span class="material-symbols-outlined cm-ctx-head-chev">expand_more</span>
      </button>
      <div class="cm-ctx-panel">
        <div class="cm-ctx-panel-inner">
          <button type="button" class="cm-ctx-refresh" aria-label="Regenerate summary" title="Regenerate summary">
            <span class="material-symbols-outlined">refresh</span>
          </button>
          <div class="cm-ctx-summary" data-state="loading">
            <span class="cm-ctx-loader"><span class="gdot"></span><span class="gdot"></span><span class="gdot"></span></span>
          </div>
          <form class="cm-ctx-ask">
            <input type="text" class="cm-ctx-ask-input" placeholder="Ask about this chapter…" autocomplete="off" />
            <button type="submit" class="cm-ctx-ask-send" aria-label="Send">
              <span class="material-symbols-outlined">arrow_upward</span>
            </button>
          </form>
        </div>
      </div>
      <div class="cm-ctx-thread"></div>
    `;

    // Stop pointer/click events from bubbling into the canvas-mode draw/erase
    // handlers on the viewport — those swallow clicks if a stroke is being
    // tracked, which is why the accordion sometimes "won't close".
    ["pointerdown", "pointerup", "click", "touchstart"].forEach((evt) => {
      contextEl.addEventListener(evt, (e) => e.stopPropagation());
    });

    const head = contextEl.querySelector(".cm-ctx-head");
    const panel = contextEl.querySelector(".cm-ctx-panel");
    const summary = contextEl.querySelector(".cm-ctx-summary");
    const askForm = contextEl.querySelector(".cm-ctx-ask");
    const askInput = askForm.querySelector(".cm-ctx-ask-input");
    const thread = contextEl.querySelector(".cm-ctx-thread");
    const refreshBtn = contextEl.querySelector(".cm-ctx-refresh");

    refreshBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // Bust the cache + re-fetch. Spin the icon while the request is in flight.
      try { localStorage.removeItem(_ctxKey(info)); } catch {}
      refreshBtn.classList.add("cm-ctx-refresh-spinning");
      summary.dataset.state = "loading";
      summary.innerHTML = `<span class="cm-ctx-loader"><span class="gdot"></span><span class="gdot"></span><span class="gdot"></span></span>`;
      _ctxFetchSummary(info, summary).finally(() => {
        refreshBtn.classList.remove("cm-ctx-refresh-spinning");
      });
    });

    head.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = !panel.classList.contains("cm-ctx-panel--open");
      panel.classList.toggle("cm-ctx-panel--open", willOpen);
      head.setAttribute("aria-expanded", String(willOpen));
      head.classList.toggle("cm-ctx-head-open", willOpen);
      // Reset thread on every open — user requested fresh-start behavior
      // ("pag inopen ulit dapat refreshed"). Summary stays cached because
      // it's persisted; only the in-memory Q&A thread is wiped.
      if (willOpen) {
        _ctxThread = [];
        thread.innerHTML = "";
      }
    });

    askForm.addEventListener("submit", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const q = askInput.value.trim();
      if (!q) return;
      askInput.value = "";
      _ctxAsk(info, q, summary, thread);
    });

    // Render cached summary if present, otherwise fetch.
    const cached = (() => {
      try { return localStorage.getItem(_ctxKey(info)); } catch { return null; }
    })();
    if (cached) {
      _ctxRenderSummary(summary, cached);
    } else {
      _ctxFetchSummary(info, summary);
    }
  }

  async function _ctxFetchSummary(info, summary) {
    try {
      const text = await callGemini(_ctxBuildPrompt(info));
      const cleaned = (text || "").trim();
      if (!cleaned) throw new Error("empty response");
      try { localStorage.setItem(_ctxKey(info), cleaned); } catch {}
      _ctxRenderSummary(summary, cleaned);
    } catch (err) {
      console.warn("Context summary failed:", err);
      summary.dataset.state = "error";
      summary.innerHTML = `<span class="cm-ctx-error">Couldn't load context. Tap to retry.</span>`;
      summary.onclick = () => {
        summary.onclick = null;
        summary.dataset.state = "loading";
        summary.innerHTML = `<span class="cm-ctx-loader"><span class="gdot"></span><span class="gdot"></span><span class="gdot"></span></span>`;
        _ctxFetchSummary(info, summary);
      };
    }
  }

  function _ctxRenderSummary(summary, text) {
    summary.dataset.state = "ready";
    summary.innerHTML = (typeof mdToHTML === "function" ? mdToHTML(text) : text)
      .replace(/<p>/g, "<p class=\"cm-ctx-line\">");
  }

  async function _ctxAsk(info, question, summary, thread) {
    // Collapse all prior Q&A so only the new one is fully open. Tap an old
    // question to reopen its answer.
    thread.querySelectorAll(".cm-ctx-qa").forEach((el) => el.classList.add("cm-ctx-qa-collapsed"));

    const priorThread = _ctxThread.slice(); // snapshot BEFORE pushing new turn
    _ctxThread.push({ role: "user", text: question });

    const qaWrap = document.createElement("div");
    qaWrap.className = "cm-ctx-qa";
    qaWrap.innerHTML = `
      <button type="button" class="cm-ctx-q">
        <span class="material-symbols-outlined">help</span>
        <span class="cm-ctx-q-text"></span>
        <span class="material-symbols-outlined cm-ctx-q-chev">expand_more</span>
      </button>
      <div class="cm-ctx-a">
        <span class="cm-ctx-loader"><span class="gdot"></span><span class="gdot"></span><span class="gdot"></span></span>
      </div>
    `;
    qaWrap.querySelector(".cm-ctx-q-text").textContent = question;

    // Tap the question to toggle the answer's visibility.
    qaWrap.querySelector(".cm-ctx-q").addEventListener("click", (e) => {
      e.stopPropagation();
      qaWrap.classList.toggle("cm-ctx-qa-collapsed");
    });

    thread.appendChild(qaWrap);
    qaWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });

    const ansEl = qaWrap.querySelector(".cm-ctx-a");
    const summaryText = summary.textContent || "";
    try {
      let full = "";
      await callGeminiStream(
        _ctxAskPrompt(info, question, summaryText, priorThread),
        (_d, accum) => {
          full = accum;
          ansEl.innerHTML = (typeof mdToHTML === "function" ? mdToHTML(full) : full);
        }
      );
      _ctxThread.push({ role: "assistant", text: full });
    } catch (err) {
      console.warn("Context ask failed:", err);
      ansEl.innerHTML = `<span class="cm-ctx-error">Couldn't answer. Try again.</span>`;
    }
  }

  // Adjacent same-color words fuse into a single bar:
  //   - gap span colored when both sides share color
  //   - .cm-run-l / .cm-run-r on words drop the joining side's radius
  //
  // The gap color also respects preview state: during a stroke, words get
  // `data-preview-color` (lighter wash) and the connector between two such
  // words should also wash light so the run looks continuous while dragging.
  // Words being erased ignore their committed color for gap calculations so
  // the gap disappears too (preview = "about to be gone").
  function refreshRuns() {
    const allWords = [...passageEl.querySelectorAll(".cm-word")];

    // Effective color of a word for run/gap calculations:
    //   - erase-preview → null (treat as uncolored)
    //   - preview-color → that color (not yet committed)
    //   - else committed data-color / state.highlights
    function effective(w) {
      if (!w) return null;
      if (w.dataset.previewErase) return null;
      if (w.dataset.previewColor) return w.dataset.previewColor;
      return state.highlights[+w.dataset.idx] || null;
    }
    function isPreview(w) {
      return !!(w && (w.dataset.previewColor || w.dataset.previewErase));
    }

    allWords.forEach((w, i) => {
      w.classList.remove("cm-run-l", "cm-run-r");
      const c = effective(w);
      if (!c) return;
      const prev = allWords[i - 1];
      const next = allWords[i + 1];
      if (prev && effective(prev) === c) w.classList.add("cm-run-l");
      if (next && effective(next) === c) w.classList.add("cm-run-r");
    });

    passageEl.querySelectorAll(".cm-gap").forEach((g) => {
      const leftW = passageEl.querySelector(`.cm-word[data-idx="${g.dataset.left}"]`);
      const rightW = passageEl.querySelector(`.cm-word[data-idx="${g.dataset.right}"]`);
      const cl = effective(leftW);
      const cr = effective(rightW);
      if (cl && cl === cr) {
        if (isPreview(leftW) || isPreview(rightW)) {
          g.dataset.previewColor = cl;
          delete g.dataset.color;
        } else {
          g.dataset.color = cl;
          delete g.dataset.previewColor;
        }
      } else {
        delete g.dataset.color;
        delete g.dataset.previewColor;
      }
    });
  }

  // ---------- Textboxes ----------
  // ---------- Note input modal (writes to app's comments store) ----------
  let pendingNote = null; // { wordIdx, verseKey, verseNum, bookName, chapterNum }

  function openNoteInput(wordEl) {
    const idx = +wordEl.dataset.idx;
    const verseKey = wordEl.dataset.verseKey;
    if (!verseKey) return;
    const verseNum = wordEl.dataset.verse;
    const bookName = currentInfo?.bookName || verseKey.split("-")[0];
    const chapterNum = currentInfo?.chapterNum || verseKey.split("-")[1];
    pendingNote = { wordIdx: idx, verseKey, verseNum, bookName, chapterNum };
    const existing = (comments[verseKey] || []).find((e) => e.wordIdx === idx);
    noteInput.value = existing ? existing.text : "";
    noteRef.textContent = `${bookName} ${chapterNum}:${verseNum}`;
    noteModal.hidden = false;
    setTimeout(() => noteInput.focus(), 30);
  }
  function closeNoteInput() {
    noteModal.hidden = true;
    pendingNote = null;
  }
  noteSave.addEventListener("click", () => {
    if (!pendingNote) return;
    const text = noteInput.value.trim();
    const { verseKey, wordIdx: idx } = pendingNote;
    if (!text) {
      // Empty save = delete existing
      if (comments[verseKey]) {
        const ei = comments[verseKey].findIndex((e) => e.wordIdx === idx);
        if (ei !== -1) comments[verseKey].splice(ei, 1);
        if (comments[verseKey].length === 0) delete comments[verseKey];
        saveComments();
        if (typeof _debouncedPushSync === "function") _debouncedPushSync();
      }
      closeNoteInput();
      refreshNoteBadges();
      return;
    }
    if (!comments[verseKey]) comments[verseKey] = [];
    const existingIdx = comments[verseKey].findIndex((e) => e.wordIdx === idx);
    const entry = { text, time: Date.now(), wordIdx: idx };
    if (existingIdx !== -1) comments[verseKey][existingIdx] = entry;
    else comments[verseKey].push(entry);
    saveComments();
    if (typeof _debouncedPushSync === "function") _debouncedPushSync();
    closeNoteInput();
    refreshNoteBadges();
  });
  noteCancel.addEventListener("click", closeNoteInput);
  noteModal.addEventListener("click", (e) => {
    if (e.target === noteModal) closeNoteInput();
  });

  // ---------- Note view popover ----------
  function openNoteView(wordIdx, anchorEl) {
    const w = passageEl.querySelector(`.cm-word[data-idx="${wordIdx}"]`);
    if (!w) return;
    const verseKey = w.dataset.verseKey;
    const note = (comments[verseKey] || []).find((e) => e.wordIdx === wordIdx);
    if (!note) return;
    const verseNum = w.dataset.verse;
    const bookName = currentInfo?.bookName || "";
    const chapterNum = currentInfo?.chapterNum || "";
    noteViewRef.textContent = `${bookName} ${chapterNum}:${verseNum}`;
    noteViewBody.textContent = note.text;
    noteView.dataset.wordIdx = wordIdx;
    noteView.hidden = false;
    // Position near the anchor (badge or word)
    const r = (anchorEl || w).getBoundingClientRect();
    const pw = noteView.offsetWidth;
    const ph = noteView.offsetHeight;
    let left = r.left + r.width / 2 - pw / 2;
    let top = r.bottom + 10;
    if (top + ph > window.innerHeight - 8) top = r.top - ph - 10;
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    top = Math.max(8, top);
    noteView.style.left = left + "px";
    noteView.style.top = top + "px";
  }
  function closeNoteView() {
    noteView.hidden = true;
    noteView.dataset.wordIdx = "";
  }
  noteViewClose.addEventListener("click", closeNoteView);
  noteViewEdit.addEventListener("click", () => {
    const idx = +noteView.dataset.wordIdx;
    const w = passageEl.querySelector(`.cm-word[data-idx="${idx}"]`);
    closeNoteView();
    if (w) openNoteInput(w);
  });
  noteViewDelete.addEventListener("click", () => {
    const idx = +noteView.dataset.wordIdx;
    const w = passageEl.querySelector(`.cm-word[data-idx="${idx}"]`);
    if (!w) { closeNoteView(); return; }
    const verseKey = w.dataset.verseKey;
    _confirmDialog("Delete this note?", () => {
      if (comments[verseKey]) {
        const ei = comments[verseKey].findIndex((e) => e.wordIdx === idx);
        if (ei !== -1) comments[verseKey].splice(ei, 1);
        if (comments[verseKey].length === 0) delete comments[verseKey];
        saveComments();
        if (typeof _debouncedPushSync === "function") _debouncedPushSync();
      }
      closeNoteView();
      refreshNoteBadges();
    });
  });

  // ---------- Tool UI ----------
  // Pan is gone — smart gestures handle scroll vs stroke automatically.
  // Only two tools now: highlight (horizontal swipe paints the color) and
  // eraser (horizontal swipe removes). Vertical swipes always scroll.
  const MODE_LABELS = { highlight: "Highlight", eraser: "Eraser" };
  function setTool(t) {
    if (t !== "highlight" && t !== "eraser") t = "highlight";
    tool = t;
    overlay.querySelectorAll(".cm-tool-btn").forEach((b) => b.classList.toggle("active", b.dataset.tool === t));
    const modeLabel = overlay.querySelector("#cmModeLabel");
    if (modeLabel) {
      modeLabel.textContent = MODE_LABELS[t] || "";
      modeLabel.dataset.tool = t;
    }
    const showSwatch = (t === "highlight");
    overlay.querySelectorAll(".cm-swatch").forEach((s) => {
      s.classList.toggle("active", showSwatch && s.dataset.color === color);
    });
    viewport.classList.remove("cm-tool-draw", "cm-tool-erase");
    if (t === "highlight") viewport.classList.add("cm-tool-draw");
    else viewport.classList.add("cm-tool-erase");
    // Keep FAB icon + color in sync with the active tool.
    if (fab) {
      fab.dataset.current = t;
      if (t === "highlight") fab.dataset.color = color;
      else delete fab.dataset.color;
    }
    if (fabColorDot) {
      fabColorDot.style.setProperty("--active-color", COLOR_HEX[color] || COLOR_HEX.yellow);
    }
    if (fabIcon) {
      fabIcon.textContent =
        t === "highlight" ? "edit" :
        t === "eraser"    ? "ink_eraser" :
                            "pan_tool";
    }
  }

  // ---------- Radial FAB arc (4 other colors + eraser) ----------
  const ARC_COLORS = [
    { id: "yellow", sw: "#ffe66b" },
    { id: "pink",   sw: "#f9a8d4" },
    { id: "blue",   sw: "#93c5fd" },
    { id: "orange", sw: "#fdba74" },
    { id: "green",  sw: "#bef264" },
  ];
  const ARC_RADIUS = 82;
  const ARC_AUTOHIDE_MS = 3000;
  let arcHideTimer = null;

  function renderArc() {
    if (!fabArc) return;
    fabArc.innerHTML = "";
    // 4 color chips — eraser no longer lives in the arc (FAB toggles it now).
    const items = ARC_COLORS.filter(c => c.id !== color).map(c => ({ kind: "color", ...c }));
    const n = items.length;
    const isNarrow = window.innerWidth < 360;
    items.forEach((it, i) => {
      const btn = document.createElement("button");
      btn.className = "cm-fab-arc-chip cm-fab-arc-color";
      btn.dataset.color = it.id;
      btn.style.setProperty("--sw", it.sw);
      btn.setAttribute("aria-label", `Highlight ${it.id}`);
      let dx, dy;
      if (isNarrow) {
        // Vertical stack above FAB — safer on phones < 360px wide.
        dx = 0;
        dy = -(i + 1) * 50;
      } else {
        // Quarter-arc from 12 o'clock → 9 o'clock (top → left).
        const theta = (Math.PI / 2) * (i / (n - 1));
        dx = -ARC_RADIUS * Math.sin(theta);
        dy = -ARC_RADIUS * Math.cos(theta);
      }
      btn.style.setProperty("--dx", `${dx}px`);
      btn.style.setProperty("--dy", `${dy}px`);
      btn.style.setProperty("--i", i);
      fabArc.appendChild(btn);
    });
  }
  function openArc() {
    if (!fabArc) return;
    renderArc();
    // Force a layout so the initial "scaled 0" state is committed before we
    // add the open class; without this the transition sometimes skips.
    void fabArc.offsetWidth;
    fabArc.classList.add("cm-fab-arc-open");
    scheduleArcHide(ARC_AUTOHIDE_MS);
  }
  function closeArc() {
    if (!fabArc) return;
    fabArc.classList.remove("cm-fab-arc-open");
    clearTimeout(arcHideTimer);
    arcHideTimer = null;
  }
  function scheduleArcHide(ms) {
    clearTimeout(arcHideTimer);
    arcHideTimer = setTimeout(closeArc, ms);
  }
  function isArcOpen() { return fabArc?.classList.contains("cm-fab-arc-open"); }

  // FAB tap: toggle highlight ↔ eraser. Arc (color picker) shows for 3s when
  // re-entering highlight so the user can pick a color right away.
  fab?.addEventListener("click", () => {
    if (tool === "eraser") {
      setTool("highlight");
      openArc();
    } else {
      setTool("eraser");
      closeArc();
    }
  });

  // Arc chip tap: change color.
  fabArc?.addEventListener("click", (e) => {
    const chip = e.target.closest(".cm-fab-arc-chip");
    if (!chip) return;
    color = chip.dataset.color;
    setTool("highlight");
    renderArc();
    void fabArc.offsetWidth;
    scheduleArcHide(ARC_AUTOHIDE_MS);
  });
  overlay.querySelectorAll(".cm-tool-btn").forEach((b) =>
    b.addEventListener("click", () => setTool(b.dataset.tool))
  );

  function setColor(c) {
    color = c;
    // Clicking a swatch means "I want to highlight with this" → switch to highlight
    // tool, which also refreshes swatch active state.
    setTool("highlight");
  }
  overlay.querySelectorAll(".cm-swatch").forEach((s) =>
    s.addEventListener("click", () => setColor(s.dataset.color))
  );

  // ---------- Word hit detection ----------
  function wordAtPoint(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    // Note badges sit inside words — if the pointer lands on a badge, ignore it
    // for stroke purposes (stroke shouldn't fire on badges anyway, but belt-and-suspenders).
    if (el.closest && el.closest(".cm-note-badge")) return null;
    const w = el.closest && el.closest(".cm-word");
    if (w) return w;
    const gap = el.closest && el.closest(".cm-gap");
    if (gap) return passageEl.querySelector(`.cm-word[data-idx="${gap.dataset.left}"]`);
    return null;
  }

  function applyStrokeAt(cx, cy) {
    const wordEl = wordAtPoint(cx, cy);
    if (!wordEl) return;
    const idx = +wordEl.dataset.idx;
    if (strokeTouched.has(idx)) return;
    strokeTouched.add(idx);
    if (tool === "highlight") spawnWordLabel(wordEl);
    // Preview only — don't mutate state.highlights until the stroke is
    // released. That gives the "light while dragging, pops to full color
    // on release" feel.
    if (tool === "highlight") {
      wordEl.dataset.previewColor = color;
    } else if (tool === "eraser") {
      if (idx in state.highlights) wordEl.dataset.previewErase = "1";
    }
    refreshRuns();  // keeps gap connectors in sync with the preview state
  }

  // Apply every previewed word to the real state + refresh the fused runs.
  function commitStroke() {
    if (!strokeTouched || strokeTouched.size === 0) return false;
    for (const idx of strokeTouched) {
      const wordEl = passageEl.querySelector(`.cm-word[data-idx="${idx}"]`);
      if (!wordEl) continue;
      if (wordEl.dataset.previewColor) {
        const c = wordEl.dataset.previewColor;
        state.highlights[idx] = c;
        wordEl.dataset.color = c;
        delete wordEl.dataset.previewColor;
      }
      if (wordEl.dataset.previewErase) {
        delete state.highlights[idx];
        delete wordEl.dataset.color;
        delete wordEl.dataset.previewErase;
      }
    }
    refreshRuns();
    return true;
  }

  // Roll back preview without committing (used when a stroke is cancelled
  // by some external signal — e.g. lost pointer capture with no pointerup).
  function rollbackStroke() {
    if (!strokeTouched) return;
    for (const idx of strokeTouched) {
      const wordEl = passageEl.querySelector(`.cm-word[data-idx="${idx}"]`);
      if (!wordEl) continue;
      delete wordEl.dataset.previewColor;
      delete wordEl.dataset.previewErase;
    }
  }

  // ---------- Pointer on viewport (long-press to highlight) ----------
  // Down+hold (still) for LONG_PRESS_MS → engage stroke, haptic nudge, then
  // any movement paints. Down+move (before the timer) → browser scrolls via
  // `touch-action: pan-y`. Down+up (quick, no movement) → click fires →
  // popover. Unambiguous, so the native scroll arbitration can't steal the
  // intent the way the old horizontal-swipe heuristic did.
  viewport.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".cm-fab") || e.target.closest(".cm-fab-arc")) return;
    // Any new gesture clears a stale suppress flag from a prior stroke that
    // never produced a synthesized click (e.g. swipe highlight that ended
    // off-target).
    suppressNextClick = false;
    closePopover();
    if (e.target.closest(".cm-note-badge")) return;
    cancelLongPress();
    const sx = e.clientX, sy = e.clientY, pid = e.pointerId;
    pendingStroke = { x: sx, y: sy, pointerId: pid };
    longPressTimer = setTimeout(() => {
      if (!pendingStroke || pendingStroke.pointerId !== pid) return;
      pendingStroke = null;
      longPressTimer = null;
      closeArc();
      strokeActive = true;
      strokeTouched = new Set();
      strokePointerId = pid;
      try { viewport.setPointerCapture(pid); } catch (_) {}
      try { navigator.vibrate && navigator.vibrate(12); } catch (_) {}
      spawnEngageRipple(sx, sy);
      applyStrokeAt(sx, sy);
    }, LONG_PRESS_MS);
  });

  // Floating phrase pills that pop up as the stroke sweeps, then fade out
  // in order on release. ALL phrases active in the current stroke remain
  // open for extension — so if you highlight "the Lord", jump down, then
  // come back up to "has" (adjacent to the earlier phrase), it still
  // fuses. A new word can also bridge two phrases, merging them into one.
  const activeLabels = [];
  const activePhrases = []; // [{ label, minIdx, maxIdx }] — all extensible

  function updatePhraseLabel(phrase) {
    const { label, minIdx, maxIdx } = phrase;
    const parts = [];
    for (let i = minIdx; i <= maxIdx; i++) {
      const w = passageEl.querySelector(`.cm-word[data-idx="${i}"]`);
      if (w) parts.push((w.textContent || "").trim());
    }
    label.textContent = parts.join(" ");

    const first = passageEl.querySelector(`.cm-word[data-idx="${minIdx}"]`);
    const last  = passageEl.querySelector(`.cm-word[data-idx="${maxIdx}"]`);
    if (!first) return;
    const r1 = first.getBoundingClientRect();
    const r2 = last ? last.getBoundingClientRect() : r1;
    const sameLine = Math.abs(r1.top - r2.top) < 6;
    const centerX  = sameLine ? (r1.left + r2.right) / 2 : (r1.left + r1.width / 2);
    const topY     = r1.top;
    const halfW = label.offsetWidth / 2;
    const clampedX = Math.max(halfW + 8, Math.min(centerX, window.innerWidth - halfW - 8));
    label.style.left = clampedX + "px";
    label.style.top  = topY + "px";
  }

  function pulsePhrase(phrase) {
    phrase.label.classList.remove("cm-engage-word-grow");
    void phrase.label.offsetWidth;
    phrase.label.classList.add("cm-engage-word-grow");
  }

  function removePhrase(phrase) {
    if (phrase.label.isConnected) phrase.label.remove();
    const i = activePhrases.indexOf(phrase);
    if (i >= 0) activePhrases.splice(i, 1);
    const j = activeLabels.indexOf(phrase.label);
    if (j >= 0) activeLabels.splice(j, 1);
  }

  function spawnWordLabel(wordEl) {
    if (!wordEl || tool !== "highlight") return;
    // Floating word/phrase labels were redundant with the engage glow + the
    // ripple. Now this function only fires the brief glow on the engaged
    // word. The ripple still fires from the long-press handler.
    wordEl.style.setProperty("--engage-glow", COLOR_GLOW[color] || COLOR_GLOW.yellow);
    wordEl.classList.add("cm-word-engage");
    wordEl.addEventListener("animationend", () => wordEl.classList.remove("cm-word-engage"), { once: true });
  }

  function fadeOutLabels() {
    // All labels fade out together on release — simpler, snappier.
    const labels = activeLabels.splice(0);
    activePhrases.length = 0;
    labels.forEach((label) => {
      if (!label.isConnected) return;
      label.classList.add("cm-engage-word-out");
      label.addEventListener("animationend", () => label.remove(), { once: true });
    });
  }

  // Engage feedback on long-press lock-in: subtle ripple at the touch
  // point. The first word's floating label is spawned by applyStrokeAt
  // (which fires for every new word the stroke touches, including the
  // first), so we don't duplicate that here.
  function spawnEngageRipple(cx, cy) {
    const hex = COLOR_HEX[color] || "#ffe66b";
    const ripple = document.createElement("div");
    ripple.className = "cm-engage-ripple";
    ripple.style.left = cx + "px";
    ripple.style.top  = cy + "px";
    ripple.style.background = hex;
    document.body.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
  }

  viewport.addEventListener("pointermove", (e) => {
    if (pendingStroke && e.pointerId === pendingStroke.pointerId) {
      const dx = e.clientX - pendingStroke.x;
      const dy = e.clientY - pendingStroke.y;
      if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_MAX) cancelLongPress();
      return;
    }
    if (!strokeActive || e.pointerId !== strokePointerId) return;
    e.preventDefault();
    applyStrokeAt(e.clientX, e.clientY);
  });

  // While a stroke is active, block the browser's native pan-y scroll so the
  // user can drag in any direction (including across lines) without the
  // gesture being stolen mid-stroke. Non-passive is required for
  // preventDefault on touchmove to actually cancel scrolling on mobile.
  viewport.addEventListener("touchmove", (e) => {
    if (strokeActive) e.preventDefault();
  }, { passive: false });

  function finishStroke(e) {
    // Tap (pointerdown → pointerup before long-press timer) → clear pending
    // gate and let the click listener open the popover.
    if (pendingStroke && e && e.pointerId === pendingStroke.pointerId) {
      cancelLongPress();
    }
    if (!strokeActive) return;
    if (e && e.pointerId !== strokePointerId) return;
    try { viewport.releasePointerCapture(strokePointerId); } catch (_) {}
    fadeOutLabels();
    const pre = snapshot();
    const committed = commitStroke();
    strokeActive = false;
    strokePointerId = null;
    strokeTouched = null;
    // The stroke engaged — eat the trailing click so single-word holds
    // don't pop the tap-popover.
    suppressNextClick = true;
    if (committed) {
      undoStack.push(pre);
      if (undoStack.length > HISTORY_MAX) undoStack.shift();
      redoStack = [];
      refreshHistoryButtons();
      saveState();
    }
  }
  viewport.addEventListener("pointerup", finishStroke);
  viewport.addEventListener("pointercancel", finishStroke);
  viewport.addEventListener("lostpointercapture", (e) => {
    if (strokeActive && e.pointerId === strokePointerId) {
      // Commit what the user touched — losing capture shouldn't lose work.
      fadeOutLabels();
      const pre = snapshot();
      const committed = commitStroke();
      strokeActive = false;
      strokePointerId = null;
      strokeTouched = null;
      suppressNextClick = true;
      if (committed) {
        undoStack.push(pre);
        if (undoStack.length > HISTORY_MAX) undoStack.shift();
        redoStack = [];
        refreshHistoryButtons();
        saveState();
      }
    }
  });

  // Tap a word → popover. Tap a note badge → note view. A long-press stroke
  // (even on a single word with no drag) sets `suppressNextClick` so we
  // ignore the synthesized click that follows pointerup.
  passageEl.addEventListener("click", (e) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      e.stopPropagation();
      return;
    }
    const badge = e.target.closest(".cm-note-badge");
    if (badge) {
      e.stopPropagation();
      closePopover();
      openNoteView(+badge.dataset.wordIdx, badge);
      return;
    }
    const w = e.target.closest(".cm-word");
    if (!w) return;
    openPopover(w);
  });

  // ---------- Popover ----------
  function openPopover(wordEl) {
    popover.hidden = false;
    popover.dataset.wordIdx = wordEl.dataset.idx;
    // Mark the targeted word so the user can see which one the popover acts
    // on. Re-add the class to retrigger the shake even when tapping the
    // same target after a close.
    passageEl.querySelectorAll(".cm-word-popover-target")
      .forEach((el) => el.classList.remove("cm-word-popover-target"));
    void wordEl.offsetWidth; // force reflow so the next class add restarts animation
    wordEl.classList.add("cm-word-popover-target");

    const r = wordEl.getBoundingClientRect();
    const pw = popover.offsetWidth;
    const ph = popover.offsetHeight;
    let left = r.left + r.width / 2 - pw / 2;
    let top  = r.top - ph - 10;
    let side = "above";
    if (top < 70) { top = r.bottom + 10; side = "below"; }
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    popover.style.left = left + "px";
    popover.style.top  = top + "px";
    popover.dataset.side = side;
    // Retrigger the open animation on every open (e.g. tapping a different
    // word while the popover is already visible).
    popover.dataset.state = "";
    void popover.offsetWidth;
    popover.dataset.state = "open";
  }
  function closePopover() {
    if (popover.hidden) return;
    popover.dataset.state = "closing";
    const finalize = () => {
      popover.removeEventListener("animationend", finalize);
      popover.hidden = true;
      popover.dataset.wordIdx = "";
      popover.dataset.state = "";
      passageEl.querySelectorAll(".cm-word-popover-target")
        .forEach((el) => el.classList.remove("cm-word-popover-target"));
    };
    popover.addEventListener("animationend", finalize);
    // Safety net in case animationend doesn't fire.
    setTimeout(() => { if (popover.dataset.state === "closing") finalize(); }, 260);
  }

  popover.addEventListener("click", (e) => {
    const idx = +popover.dataset.wordIdx;
    const wordEl = passageEl.querySelector(`.cm-word[data-idx="${idx}"]`);
    const swatch = e.target.closest(".cm-pop-swatch");
    const action = e.target.closest(".cm-pop-action");
    const secondary = e.target.closest(".cm-pop-secondary-btn");
    if (swatch) {
      const c = swatch.dataset.color;
      if (state.highlights[idx] !== c) pushHistory();
      state.highlights[idx] = c;
      if (wordEl) wordEl.dataset.color = c;
      refreshRuns();
      saveState();
      closePopover();
      return;
    }
    if (action) {
      const a = action.dataset.action;
      if (a === "clear") {
        if (idx in state.highlights) pushHistory();
        delete state.highlights[idx];
        if (wordEl) delete wordEl.dataset.color;
        refreshRuns();
        saveState();
        closePopover();
      } else if (a === "note") {
        closePopover();
        if (wordEl) openNoteInput(wordEl);
      } else if (a === "copy") {
        if (wordEl) copyVerseFromWord(wordEl);
        closePopover();
      }
      return;
    }
    if (secondary) {
      const a = secondary.dataset.action;
      if (!wordEl) return;
      closePopover();
      if (a === "context") openAiModal(wordEl, "context");
      else if (a === "ask") openAiModal(wordEl, "ask");
    }
  });

  // ---------- Context / Ask Question modal ----------
  const aiModal = document.getElementById("cmAiModal");
  const aiRef   = document.getElementById("cmAiRef");
  const aiBody  = document.getElementById("cmAiBody");
  const aiClose = document.getElementById("cmAiClose");

  function openAiModal(wordEl, kind) {
    const verseNum = wordEl.dataset.verse;
    const bookName = currentInfo?.bookName;
    const chapterNum = currentInfo?.chapterNum;
    const verseText = currentInfo?.chapterContent?.[verseNum];
    if (!bookName || !chapterNum || !verseText) return;
    const key = keyOf(currentInfo.bookId, chapterNum, verseNum);
    aiRef.textContent = `${bookName} ${chapterNum}:${verseNum}`;
    aiBody.innerHTML = "";
    aiModal.hidden = false;
    if (kind === "context") {
      fetchInlineQuickContext({ book: bookName, chapter: chapterNum, verse: verseNum, text: verseText }, aiBody);
    } else {
      toggleVerseChat(key, bookName, chapterNum, verseNum, verseText, aiBody);
    }
  }
  function closeAiModal() {
    aiModal.hidden = true;
    aiBody.innerHTML = "";
  }
  aiClose?.addEventListener("click", closeAiModal);
  aiModal?.addEventListener("click", (e) => { if (e.target === aiModal) closeAiModal(); });

  // ---------- Copy verse ----------
  function cmToast(message) {
    const t = document.createElement("div");
    t.className = "cm-toast";
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  }
  function copyVerseFromWord(wordEl) {
    const verseNum = wordEl.dataset.verse;
    const bookName = currentInfo?.bookName;
    const chapterNum = currentInfo?.chapterNum;
    const verseText = currentInfo?.chapterContent?.[verseNum];
    if (!bookName || !chapterNum || !verseText) return;
    const ref = `${bookName} ${chapterNum}:${verseNum}`;
    const text = `${ref} — ${verseText.trim()}`;
    const done = () => cmToast(`${ref} copied!`);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => {
        // Fallback — older iOS / insecure contexts.
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); done(); } catch (_) {}
        ta.remove();
      });
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); done(); } catch (_) {}
      ta.remove();
    }
  }

  document.addEventListener("click", (e) => {
    if (overlay.hidden) return;
    if (!popover.hidden && !popover.contains(e.target) && !e.target.closest(".cm-word")) closePopover();
    if (!noteView.hidden && !noteView.contains(e.target) && !e.target.closest(".cm-note-badge")) closeNoteView();
  });

  undoBtn?.addEventListener("click", doUndo);
  redoBtn?.addEventListener("click", doRedo);

  // ---------- Keyboard ----------
  // Color shortcuts: 1-5 map to swatches in toolbar order (matches index.html
  // and the visible row). Picking a color also flips the tool to highlight.
  const KEY_TO_COLOR = { "1": "yellow", "2": "pink", "3": "blue", "4": "orange", "5": "green" };
  document.addEventListener("keydown", (e) => {
    if (overlay.hidden) return;
    if (noteModal && !noteModal.hidden) return; // typing in note input
    if (aiModal && !aiModal.hidden) {
      // Inside AI modal: only handle Escape to dismiss, never steal typing.
      if (e.key === "Escape") closeAiModal();
      return;
    }
    // Don't intercept when the user is typing in any input/textarea
    // (e.g. the context-accordion's "Ask about this chapter…" field).
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.key === "Escape") {
      if (!noteView.hidden) closeNoteView();
      else if (!popover.hidden) closePopover();
      else close();
    } else if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      if (e.shiftKey) doRedo(); else doUndo();
    } else if ((e.metaKey || e.ctrlKey) && (e.key === "y" || e.key === "Y")) {
      e.preventDefault();
      doRedo();
    } else if (e.key === "h" || e.key === "H") setTool("highlight");
    else if (e.key === "e" || e.key === "E") setTool("eraser");
    else if (KEY_TO_COLOR[e.key] && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Picking a color implies "I want to highlight." Switch tool too.
      e.preventDefault();
      setTool("highlight");
      setColor(KEY_TO_COLOR[e.key]);
    }
  });

  // ---------- Open / close ----------
  function open() {
    const info = getCurrentPassageInfo();
    if (!info) { alert("Load a passage first."); return; }
    currentInfo = info;
    stateKey = info.key;
    state = loadState(stateKey);
    const titleText = `${info.bookName} ${info.chapterNum}`;
    titleEl.textContent = titleText;
    passageTitleEl2.textContent = titleText;

    renderPassage(info);
    resetHistory();

    // Reveal the canvas behind a dramatic study-mode intro: a cream paper
    // overlay covers the screen, the chapter title rises into the center,
    // a yellow highlighter sweeps across it, then everything fades and the
    // already-rendered canvas is exposed underneath. No zoom-in on the
    // canvas itself — the intro IS the entry animation.
    overlay.hidden = false;
    _playStudyIntro(`${info.bookName} ${info.chapterNum}`);

    color = DEFAULT_COLOR;
    setTool("highlight");
    scrollEl.scrollTop = 0;
  }

  // Re-render canvas content for the current bookEl/chapterEl values without
  // replaying the open intro. Called when the user uses the canvas-side
  // chapter chevrons or picks a new passage from the title-tap book picker.
  function reload() {
    if (overlay.hidden) return;
    const info = getCurrentPassageInfo();
    if (!info) return;
    currentInfo = info;
    stateKey = info.key;
    state = loadState(stateKey);
    const titleText = `${info.bookName} ${info.chapterNum}`;
    titleEl.textContent = titleText;
    passageTitleEl2.textContent = titleText;
    renderPassage(info);
    resetHistory();
    scrollEl.scrollTop = 0;
  }
  window._cmReload = reload;

  // Cinematic study-mode intro — used by open(). Builds a one-shot DOM node,
  // lets the CSS keyframes run for ~1.4s, then removes itself.
  function _playStudyIntro(titleText) {
    // Cancel any leftover intro from a rapid re-open.
    document.querySelectorAll(".cm-intro").forEach((n) => n.remove());

    const intro = document.createElement("div");
    intro.className = "cm-intro";
    intro.innerHTML = `
      <div class="cm-intro-stage">
        <div class="cm-intro-highlight"></div>
        <span class="material-symbols-outlined cm-intro-marker">ink_highlighter</span>
        <h1 class="cm-intro-title"></h1>
      </div>
    `;
    intro.querySelector(".cm-intro-title").textContent = titleText;

    // Pick a random highlight color from the swatch palette so the intro
    // doesn't always look the same. Mirrors the 5 swatch hexes in index.html.
    const palette = [
      { mid: "255, 230, 107", edge: "255, 220, 80",  glow: "255, 200, 0" },   // yellow
      { mid: "249, 168, 212", edge: "236, 145, 196", glow: "236, 110, 178" }, // pink
      { mid: "147, 197, 253", edge: "120, 175, 245", glow:  "80, 150, 230" }, // blue
      { mid: "253, 186, 116", edge: "245, 165,  90", glow: "230, 140,  60" }, // orange
      { mid: "190, 242, 100", edge: "170, 225,  85", glow: "140, 200,  60" }, // green
    ];
    const pick = palette[Math.floor(Math.random() * palette.length)];
    const hi = intro.querySelector(".cm-intro-highlight");
    if (hi) {
      hi.style.setProperty("--cm-hi-1", `rgba(${pick.mid}, 0.95)`);
      hi.style.setProperty("--cm-hi-2", `rgba(${pick.edge}, 0.95)`);
      hi.style.setProperty("--cm-hi-3", `rgba(${pick.mid}, 0.85)`);
      hi.style.setProperty("--cm-hi-glow", `rgba(${pick.glow}, 0.22)`);
    }

    document.body.appendChild(intro);

    // Belt-and-suspenders cleanup: remove on the wrapper's animationend, with
    // a setTimeout fallback in case the listener doesn't fire.
    const remove = () => intro.remove();
    intro.addEventListener("animationend", (e) => {
      if (e.target === intro) remove();
    });
    setTimeout(remove, 3800);
  }

  function close() {
    closePopover();
    closeNoteView();
    closeNoteInput();
    closeAiModal();
    closeArc();
    cancelLongPress();
    fadeOutLabels();
    strokeActive = false;
    strokePointerId = null;
    strokeTouched = null;
    // Stop any in-canvas playback so audio doesn't keep going after exit.
    if (typeof stopTTS === "function" && document.body.classList.contains("tts-canvas-active")) {
      stopTTS();
    }
    // Zoom-out transition — play the leaving animation, then actually hide
    // the overlay after it finishes. Falls back to instant hide if anim
    // doesn't fire (e.g. removed mid-flight).
    overlay.classList.remove("view-enter");
    overlay.classList.add("view-leaving");
    let hidden = false;
    const finalize = () => {
      if (hidden) return;
      hidden = true;
      overlay.classList.remove("view-leaving");
      overlay.hidden = true;
      overlay.removeEventListener("animationend", finalize);
    };
    overlay.addEventListener("animationend", finalize, { once: true });
    setTimeout(finalize, 320); // safety
  }

  btn?.addEventListener("click", open);

  // Listen button: toggle canvas-mode TTS. Tap again to stop.
  const cmListenBtn = document.getElementById("cmListenBtn");
  cmListenBtn?.addEventListener("click", () => {
    if (document.body.classList.contains("tts-canvas-active")) {
      if (typeof stopTTS === "function") stopTTS();
    } else if (typeof playChapterInCanvas === "function") {
      playChapterInCanvas();
    }
  });

  // Sticky mini-player buttons (prev / pause-play / next / stop). The bar's
  // visibility is gated entirely by `body.tts-canvas-active` in CSS.
  document.getElementById("cmListenPrevBtn")?.addEventListener("click", () => {
    if (typeof ttsPrevVerse === "function") ttsPrevVerse();
  });
  document.getElementById("cmListenPauseBtn")?.addEventListener("click", () => {
    if (typeof pauseResumeTTS === "function") pauseResumeTTS();
  });
  document.getElementById("cmListenNextBtn")?.addEventListener("click", () => {
    if (typeof ttsNextVerse === "function") ttsNextVerse();
  });
  document.getElementById("cmListenStopBtn")?.addEventListener("click", () => {
    if (typeof stopTTS === "function") stopTTS();
  });
  document.getElementById("cmListenFollowBtn")?.addEventListener("click", () => {
    if (typeof cmTtsToggleAutoFollow === "function") cmTtsToggleAutoFollow();
  });
  document.getElementById("cmListenAutoBtn")?.addEventListener("click", () => {
    if (typeof cmTtsToggleAutoAdvance === "function") cmTtsToggleAutoAdvance();
  });

  // Audio Library button wiring lives in 03-tts.js (covers all entry points
  // — dashboard, canvas top bar, overflow sheet — in one place).

  // Canvas-side chapter nav. Stop any in-canvas TTS before swapping content
  // (the queue references the old chapter's DOM; letting it keep playing
  // breaks the highlight system). Reuse the legacy prev/next chapter button
  // logic so we get the cross-book wraparound + verseEl reset for free, then
  // call reload() once #output finishes re-rendering.
  function _switchChapter(triggerBtnId) {
    if (typeof stopTTS === "function" && document.body.classList.contains("tts-canvas-active")) {
      stopTTS();
    }
    document.getElementById(triggerBtnId)?.click();
    // The trigger fires loadPassage asynchronously; the loadBtn.onclick
    // wrapper below also calls reload() once load completes, but we kick a
    // short follow-up here in case the wrapper isn't reached for some flow.
    setTimeout(reload, 250);
  }
  document.getElementById("cmPrevChBtn")?.addEventListener("click", () => _switchChapter("prevChapterBtn"));
  document.getElementById("cmNextChBtn")?.addEventListener("click", () => _switchChapter("nextChapterBtn"));

  // Tap chapter title → open the existing book picker bottom-sheet. When the
  // user picks a passage, the picker triggers loadBtn.click() which our
  // wrapper (further down) intercepts to reload the canvas.
  titleEl?.addEventListener("click", () => {
    if (typeof stopTTS === "function" && document.body.classList.contains("tts-canvas-active")) {
      stopTTS();
    }
    if (typeof window._openBookPicker === "function") window._openBookPicker();
  });

  // Keyboard "L" → toggle canvas Listen (mirrors the H/E shortcuts). Only
  // bind once and only fire while canvas is open + no input is focused.
  document.addEventListener("keydown", (e) => {
    if (overlay.hidden) return;
    const tag = (e.target?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
    if (e.key === "l" || e.key === "L") {
      e.preventDefault();
      cmListenBtn?.click();
    }
  });
  closeBtn.addEventListener("click", close);

  // When Firebase sync applies remote canvas updates, refresh if the
  // currently open canvas state changed out from under us.
  window.addEventListener("devo:canvas-sync", (e) => {
    if (overlay.hidden || !stateKey) return;
    const keys = e.detail?.keys || [];
    if (!keys.includes(`devo.canvas.${stateKey}`)) return;
    state = loadState(stateKey);
    if (currentInfo) renderPassage(currentInfo);
  });
})();

/* =====================================================================
 * REVAMPED MAIN TOOLBAR — thin proxy over the legacy controls
 * =====================================================================
 * The old .controls.smart-header is hidden and shown as a modal sheet
 * only when the user taps the passage pill. Every button in the new
 * toolbar forwards clicks to the original hidden button so all existing
 * JS (which watches #book.value, #load.onclick, etc.) keeps working.
 * =================================================================== */
(function mainToolbar() {
  const mtBar          = document.getElementById("mtBar");
  const mtPassage      = document.getElementById("mtPassage");
  const mtPassageText  = document.getElementById("mtPassageText");
  const mtPrev         = document.getElementById("mtPrev");
  const mtNext         = document.getElementById("mtNext");
  const mtActions      = document.getElementById("mtActions");
  const mtListen       = document.getElementById("mtListen");
  const mtOverflow     = document.getElementById("mtOverflow");
  const mtOverflowSheet = document.getElementById("mtOverflowSheet");
  const mtOverflowBackdrop = document.getElementById("mtOverflowBackdrop");
  const mtThemeToggle  = document.getElementById("mtThemeToggle");
  const mtSearchBible  = document.getElementById("mtSearchBible");
  const mtNotesToggle  = document.getElementById("mtNotesToggle");
  if (!mtPassage) return;

  const bookSel     = document.getElementById("book");
  const chapterSel  = document.getElementById("chapter");
  const loadBtn     = document.getElementById("load");
  const prevOrigBtn = document.getElementById("prevChapterBtn");
  const nextOrigBtn = document.getElementById("nextChapterBtn");
  const ttsBtn      = document.getElementById("ttsPlayBtn");
  const notesBtn    = document.getElementById("notesToggleBtn");
  const themeBtn    = document.getElementById("mode-toggle");
  const searchBtn   = document.getElementById("bibleSearchBtn");

  function updatePassageText() {
    const book = bookSel?.options[bookSel.selectedIndex]?.text?.trim();
    const ch = chapterSel?.value;
    mtPassageText.textContent = book && ch ? `${book} ${ch}` : "Select passage";
  }

  // Passage sheet (reveals the old dropdowns as a modal).
  function openCfgSheet() { document.body.classList.add("cfg-sheet-open"); }
  function closeCfgSheet() { document.body.classList.remove("cfg-sheet-open"); }
  // Passage entry points all open the Book picker directly — the old
   // intermediate "passage sheet" modal is gone. Chapter pick auto-loads.
  function openBookDirectly() {
    window._openBookPicker?.();
  }
  mtPassage.addEventListener("click", openBookDirectly);
  document.getElementById("dashBrowseBtn")?.addEventListener("click", openBookDirectly);
  // Big passage header itself is the primary navigator now.
  document.getElementById("passageTitle")?.addEventListener("click", openBookDirectly);
  // Passage title chevrons proxy to the legacy prev/next chapter buttons.
  document.getElementById("passageTitlePrev")?.addEventListener("click", () =>
    document.getElementById("prevChapterBtn")?.click()
  );
  document.getElementById("passageTitleNext")?.addEventListener("click", () =>
    document.getElementById("nextChapterBtn")?.click()
  );

  // Close the sheet immediately on Search click, then fire the original
  // loadBtn handler async. Awaiting first left the sheet open for the whole
  // loadPassage() + runAIForCurrentPassage() cycle (several seconds).
  if (loadBtn) {
    const prev = loadBtn.onclick;
    loadBtn.onclick = async function (...args) {
      closeCfgSheet();
      updatePassageText();
      try {
        if (prev) {
          const result = await prev.apply(this, args);
          // If the canvas overlay is open, refresh its contents so the new
          // passage replaces what's drawn on the paper. No-op when canvas
          // isn't visible — reload() guards on overlay.hidden.
          if (typeof window._cmReload === "function") window._cmReload();
          return result;
        }
      } catch (err) { console.error(err); }
    };
  }
  bookSel?.addEventListener("change", updatePassageText);
  chapterSel?.addEventListener("change", updatePassageText);
  updatePassageText();

  // Chevron / action proxies
  mtPrev?.addEventListener("click", () => prevOrigBtn?.click());
  mtNext?.addEventListener("click", () => nextOrigBtn?.click());
  mtListen?.addEventListener("click", () => ttsBtn?.click());

  // Version toggle moved into the overflow sheet (Settings-ish row).
  // Proxies taps to the original .version-pill buttons so all downstream JS
  // still runs; mirrors the active state both ways.
  const mtSheetVer = document.getElementById("mtSheetVersion");
  function syncSheetVerPills() {
    const active = document.querySelector(".version-pill.active")?.dataset.ver;
    mtSheetVer?.querySelectorAll(".mt-sheet-ver").forEach(b => {
      b.classList.toggle("active", b.dataset.ver === active);
    });
  }
  mtSheetVer?.addEventListener("click", (e) => {
    const btn = e.target.closest(".mt-sheet-ver");
    if (!btn) return;
    document.querySelector(`.version-pill[data-ver="${btn.dataset.ver}"]`)?.click();
    setTimeout(syncSheetVerPills, 10);
  });
  document.querySelectorAll(".version-pill").forEach(p =>
    p.addEventListener("click", () => setTimeout(syncSheetVerPills, 10))
  );
  syncSheetVerPills();

  // Overflow sheet
  function openOverflow() { mtOverflowSheet.hidden = false; }
  function closeOverflow() { mtOverflowSheet.hidden = true; }
  mtOverflow?.addEventListener("click", openOverflow);
  mtOverflowBackdrop?.addEventListener("click", closeOverflow);
  mtThemeToggle?.addEventListener("click", () => { themeBtn?.click(); closeOverflow(); });
  mtSearchBible?.addEventListener("click", () => { searchBtn?.click(); closeOverflow(); });
  mtNotesToggle?.addEventListener("click", () => { notesBtn?.click(); closeOverflow(); });

  // Mirror the "hidden until passage loaded" behavior of the original buttons.
  // Watch the ttsPlayBtn's class list — when loadBtn.click() unhides it, show
  // our chevrons + action row.
  function syncPassageLoadedState() {
    const loaded = ttsBtn && !ttsBtn.classList.contains("hidden");
    mtPrev.hidden = !loaded;
    mtNext.hidden = !loaded;
    mtActions.hidden = !loaded;
  }
  if (ttsBtn) {
    new MutationObserver(syncPassageLoadedState)
      .observe(ttsBtn, { attributes: true, attributeFilter: ["class"] });
  }
  syncPassageLoadedState();

  // Reflect TTS playing state on the Listen pill.
  function syncListenState() {
    const playing = ttsBtn?.classList.contains("playing");
    mtListen?.classList.toggle("playing", !!playing);
  }
  if (ttsBtn) {
    new MutationObserver(syncListenState)
      .observe(ttsBtn, { attributes: true, attributeFilter: ["class"] });
  }
})();

/* =====================================================================
 * BOOK / CHAPTER PICKER — mobile-inspired bottom-sheet selectors
 * =====================================================================
 * Replaces the native <select> UI inside the passage sheet. The selects
 * stay in the DOM (and stay in sync) because the rest of the app reads
 * bookEl.value / chapterEl.value directly.
 * =================================================================== */
(function bookChapterPicker() {
  const bookBtn     = document.getElementById("bookPickerBtn");
  const chapterBtn  = document.getElementById("chapterPickerBtn");
  const bookText    = document.getElementById("bookPickerText");
  const chapterText = document.getElementById("chapterPickerText");
  const bookSheet   = document.getElementById("bookPickerSheet");
  const chapSheet   = document.getElementById("chapterPickerSheet");
  const bookList    = document.getElementById("bookPickerList");
  const chapGrid    = document.getElementById("chapterPickerGrid");
  const chapLabel   = document.getElementById("chapterPickerLabel");
  const bookSearch  = document.getElementById("bookPickerSearch");
  const bookTabs    = document.getElementById("bookPickerTabs");
  if (!bookBtn || !chapterBtn) return;

  const bookSel     = document.getElementById("book");
  const chapterSel  = document.getElementById("chapter");
  const META        = window.BIBLE_META || {};
  const BOOK_ORDER  = Object.keys(META);
  const OT = BOOK_ORDER.slice(0, 39);
  const NT = BOOK_ORDER.slice(39);

  let activeTab = "OT";
  let searchTerm = "";
  // Audio-library-style accordion: only one book can be expanded at a time;
  // tapping its row reveals the chapter grid inline directly underneath
  // (instead of opening a separate chapter sheet).
  let expandedBook = null;

  function fire(el, type) { el?.dispatchEvent(new Event(type, { bubbles: true })); }

  function currentBookCode() { return bookSel?.value || ""; }
  function currentChapterNum() { return parseInt(chapterSel?.value, 10) || 1; }

  function renderLabels() {
    const code = currentBookCode();
    bookText.textContent = code ? (META[code]?.name || "Select book") : "Select book";
    chapterText.textContent = currentChapterNum() ? String(currentChapterNum()) : "1";
  }

  function openBookSheet({ expand = null } = {}) {
    // Default tab to whichever testament the current book belongs to.
    const code = currentBookCode();
    activeTab = code && NT.includes(code) ? "NT" : "OT";
    searchTerm = "";
    if (bookSearch) bookSearch.value = "";
    expandedBook = expand;
    updateTabsUI();
    renderBookList();
    renderCurrentPassage();
    bookSheet.hidden = false;
    // If we auto-expanded the current book, scroll its accordion row into
    // view so the user lands on the chapters they were just reading.
    if (expandedBook) {
      requestAnimationFrame(() => {
        const wrap = bookList.querySelector(`.bc-book[data-code="${expandedBook}"]`);
        wrap?.scrollIntoView({ block: "start", behavior: "auto" });
      });
    }
    // Only auto-focus the search input on devices where summoning a soft
    // keyboard is unlikely (≥768px viewport, typically a laptop/iPad
    // hardware-keyboard scenario). On phones, an immediate focus flashes
    // the keyboard up and obscures the OT/NT tabs the user usually wants
    // to browse first; let them tap the input themselves.
    if (!expandedBook && window.matchMedia && window.matchMedia("(min-width: 768px)").matches) {
      setTimeout(() => bookSearch?.focus(), 100);
    }
  }

  function renderCurrentPassage() {
    const banner = document.getElementById("bookPickerCurrent");
    const ref = document.getElementById("bookPickerCurrentRef");
    if (!banner || !ref) return;
    const code = currentBookCode();
    const ch = currentChapterNum();
    if (!code || !META[code]) {
      banner.hidden = true;
      return;
    }
    ref.textContent = `${META[code].name} ${ch}`;
    banner.hidden = false;
  }
  function closeBookSheet() { bookSheet.hidden = true; }

  function updateTabsUI() {
    bookTabs.querySelectorAll(".bc-tab").forEach(t => {
      t.classList.toggle("active", t.dataset.tab === activeTab);
    });
  }

  function renderBookList() {
    bookList.innerHTML = "";
    const list = searchTerm
      ? BOOK_ORDER.filter(c => META[c].name.toLowerCase().includes(searchTerm.toLowerCase()))
      : (activeTab === "OT" ? OT : NT);
    if (!list.length) {
      bookList.innerHTML = `<div class="bc-empty">No books match "${searchTerm}"</div>`;
      return;
    }
    const current = currentBookCode();
    const curCh = currentChapterNum();
    for (const code of list) {
      const wrap = document.createElement("div");
      wrap.className = "bc-book";
      wrap.dataset.code = code;

      const row = document.createElement("div");
      row.className = "bc-book-row"
        + (code === current ? " active" : "")
        + (code === expandedBook ? " expanded" : "");
      row.innerHTML = `
        <span class="bc-book-name">${META[code].name}</span>
        <span class="bc-book-chapters">${META[code].chapters.length} chapters</span>
      `;
      row.addEventListener("click", () => toggleBookExpansion(code));
      wrap.appendChild(row);

      if (code === expandedBook) {
        const detail = document.createElement("div");
        detail.className = "bc-book-detail";
        const grid = document.createElement("div");
        grid.className = "bc-chapter-grid";
        const n = META[code]?.chapters?.length || 1;
        const activeChapter = (code === current) ? curCh : 0;
        for (let i = 1; i <= n; i++) {
          const cell = document.createElement("button");
          cell.type = "button";
          cell.className = "bc-chapter-cell" + (i === activeChapter ? " active" : "");
          cell.textContent = i;
          cell.addEventListener("click", (e) => {
            e.stopPropagation();
            selectBookAndChapter(code, i);
          });
          grid.appendChild(cell);
        }
        detail.appendChild(grid);
        wrap.appendChild(detail);
      }

      bookList.appendChild(wrap);
    }
  }

  function toggleBookExpansion(code) {
    expandedBook = (expandedBook === code) ? null : code;
    renderBookList();
    if (expandedBook) {
      // Keep the just-tapped row + its newly-revealed chapter grid in view.
      requestAnimationFrame(() => {
        const wrap = bookList.querySelector(`.bc-book[data-code="${expandedBook}"]`);
        wrap?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    }
  }

  function selectBookAndChapter(code, n) {
    if (!bookSel) return;
    bookSel.value = code;
    fire(bookSel, "change"); // legacy loadChapters populates chapter dropdown
    if (chapterSel) {
      chapterSel.value = String(n);
      fire(chapterSel, "change");
    }
    renderLabels();
    if (bookSearch) bookSearch.blur();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    closeBookSheet();
    // Auto-load — no Search button in the new accordion flow.
    document.getElementById("load")?.click();
  }

  // Expose the opener so the passage pill / dashboard browse button can hit
  // it directly (skipping the deprecated passage-sheet modal).
  window._openBookPicker = openBookSheet;

  // Wiring
  bookBtn.addEventListener("click", () => openBookSheet());
  // Tapping the chapter pill jumps straight into the current book's chapter
  // grid — open the picker with that book auto-expanded.
  chapterBtn.addEventListener("click", () => openBookSheet({ expand: currentBookCode() }));
  // "Currently reading" banner behavior is context-aware:
  //   - from dashboard → navigate to that passage (close + load)
  //   - from reading view → just dismiss (user is staying)
  document.getElementById("bookPickerCurrent")?.addEventListener("click", () => {
    closeBookSheet();
    const onDashboard = document.querySelector(".layout")?.classList.contains("layout-unset");
    if (onDashboard) document.getElementById("load")?.click();
  });
  bookTabs.addEventListener("click", (e) => {
    const tab = e.target.closest(".bc-tab");
    if (!tab) return;
    activeTab = tab.dataset.tab;
    searchTerm = "";
    if (bookSearch) bookSearch.value = "";
    expandedBook = null;
    updateTabsUI();
    renderBookList();
  });
  bookSearch?.addEventListener("input", (e) => {
    searchTerm = e.target.value.trim();
    expandedBook = null;
    renderBookList();
  });
  // Close handlers — explicit per-sheet to avoid any delegation quirks.
  bookSheet?.querySelectorAll("[data-close-bc]").forEach((el) =>
    el.addEventListener("click", closeBookSheet)
  );

  // Keep picker labels in sync when the legacy dropdowns change from elsewhere
  // (e.g., prev/next chapter buttons, loadPassageById, dashboard shortcuts).
  bookSel?.addEventListener("change", renderLabels);
  chapterSel?.addEventListener("change", renderLabels);
  renderLabels();
})();

/* =====================================================================
 * Arcade mode — Tomb-of-the-Mask-vibe one-verse-per-tap viewer.
 * Tap the card (or the right zone, or arrow-right, or swipe-left) to
 * advance; left zone / arrow-left / swipe-right to back up. Esc closes.
 * Reads from #output .verse so NASB↔EASY toggles flow through.
 * =================================================================== */
(function arcadeMode() {
  const overlay   = document.getElementById("arcadeMode");
  const openBtn   = document.getElementById("mtArcadeBtn");
  const closeBtn  = document.getElementById("arcadeClose");
  const themeBtn  = document.getElementById("arcadeTheme");
  const prevBtn   = document.getElementById("arcadePrev");
  const nextBtn   = document.getElementById("arcadeNext");
  const stage     = document.getElementById("arcadeStage");
  const card      = document.getElementById("arcadeCard");
  const tagEl     = document.getElementById("arcadeCardTag");
  const textEl    = document.getElementById("arcadeCardText");
  const passageEl = document.getElementById("arcadePassage");
  const counterEl = document.getElementById("arcadeCounter");
  if (!overlay || !openBtn) return;

  const THEME_KEY = "devo.arcadeTheme";
  function applyTheme(t) {
    overlay.dataset.theme = t;
    const icon = themeBtn?.querySelector(".material-symbols-outlined");
    if (icon) icon.textContent = t === "eink" ? "dark_mode" : "auto_stories";
  }
  applyTheme(localStorage.getItem(THEME_KEY) === "eink" ? "eink" : "dark");
  themeBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const next = overlay.dataset.theme === "eink" ? "dark" : "eink";
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch {}
  });

  let verses = [];   // [{ num, text }]
  let pages = [];    // flat [{ vIdx, num, text }] — one entry per paginated screen
  let pIdx = 0;

  function readVerses() {
    return [...document.querySelectorAll("#output .verse")].map((v, i) => {
      const num = v.querySelector(".verse-num")?.textContent?.trim() || String(i + 1);
      const content = v.querySelector(".verse-content");
      let text = "";
      if (content) {
        const clone = content.cloneNode(true);
        clone.querySelectorAll(
          ".verse-num, .verse-meta-indicators, .heart-icon, .inline-ai-mount, .comments, .verse-actions, button"
        ).forEach(n => n.remove());
        text = clone.textContent.replace(/\s+/g, " ").trim();
      }
      return { num, text };
    }).filter(v => v.text);
  }

  function passageLabel() {
    const bookSel = document.getElementById("book");
    const ch = document.getElementById("chapter")?.value;
    const book = bookSel?.options?.[bookSel.selectedIndex]?.text?.trim();
    if (book && ch) return `${book} ${ch}`;
    return (document.getElementById("mtPassageText")?.textContent?.trim() || "—");
  }

  // Greedy paginate each verse into chunks that fit textEl without overflow.
  // Binary-search the largest word slice whose rendered height ≤ box height.
  function paginate() {
    pages = [];
    if (!verses.length) return;
    const rect = textEl.getBoundingClientRect();
    const cs = window.getComputedStyle(textEl);
    const measure = document.createElement("div");
    measure.style.cssText = [
      "position:fixed",
      "left:-9999px",
      "top:0",
      "visibility:hidden",
      `width:${rect.width}px`,
      `font-size:${cs.fontSize}`,
      `line-height:${cs.lineHeight}`,
      `font-family:${cs.fontFamily}`,
      `font-weight:${cs.fontWeight}`,
      `letter-spacing:${cs.letterSpacing}`,
      "word-wrap:break-word",
      "white-space:normal",
    ].join(";");
    document.body.appendChild(measure);
    const maxH = rect.height;

    for (let vi = 0; vi < verses.length; vi++) {
      const words = verses[vi].text.split(" ");
      let start = 0;
      while (start < words.length) {
        let lo = start + 1, hi = words.length, last = lo;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          measure.textContent = words.slice(start, mid).join(" ");
          if (measure.scrollHeight <= maxH) { last = mid; lo = mid + 1; }
          else { hi = mid - 1; }
        }
        if (last <= start) last = start + 1; // guarantee progress
        pages.push({ vIdx: vi, num: verses[vi].num, text: words.slice(start, last).join(" ") });
        start = last;
      }
    }
    measure.remove();
  }

  function render() {
    if (!pages.length) {
      tagEl.textContent = "—";
      textEl.textContent = "Load a passage first.";
      counterEl.textContent = "0/0";
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      return;
    }
    const p = pages[pIdx];
    tagEl.textContent = `VERSE ${String(p.num).padStart(2, "0")}`;
    textEl.textContent = p.text;
    counterEl.textContent = `${p.vIdx + 1}/${verses.length}`;
    prevBtn.disabled = pIdx <= 0;
    nextBtn.disabled = pIdx >= pages.length - 1;
    card.classList.remove("swapping");
    void card.offsetWidth;
    card.classList.add("swapping");
  }

  function open() {
    verses = readVerses();
    passageEl.textContent = passageLabel().toUpperCase();
    pIdx = 0;
    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("arcade-open");
    // Need the modal painted to measure textEl; defer one frame.
    requestAnimationFrame(() => { paginate(); render(); });
  }

  function close() {
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("arcade-open");
  }

  function go(delta) {
    if (!pages.length) return;
    const ni = Math.min(pages.length - 1, Math.max(0, pIdx + delta));
    if (ni === pIdx) return;
    pIdx = ni;
    render();
  }

  // Re-paginate on resize. Keep the user roughly in place by remembering
  // which verse they were on; reset to page 0 of that verse.
  let resizeT = null;
  window.addEventListener("resize", () => {
    if (overlay.hidden) return;
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      const currentVIdx = pages[pIdx]?.vIdx ?? 0;
      paginate();
      pIdx = pages.findIndex(p => p.vIdx === currentVIdx);
      if (pIdx < 0) pIdx = 0;
      render();
    }, 150);
  });

  openBtn.addEventListener("click", open);
  closeBtn?.addEventListener("click", close);
  prevBtn?.addEventListener("click", (e) => { e.stopPropagation(); go(-1); });
  nextBtn?.addEventListener("click", (e) => { e.stopPropagation(); go(1); });

  // Tap anywhere on the card = next.
  card?.addEventListener("click", () => go(1));

  document.addEventListener("keydown", (e) => {
    if (overlay.hidden) return;
    if (e.key === "Escape") { close(); e.preventDefault(); return; }
    if (e.key === "ArrowRight" || e.key === " ") { go(1); e.preventDefault(); return; }
    if (e.key === "ArrowLeft") { go(-1); e.preventDefault(); return; }
  });

  // Touch swipe on the stage (horizontal-dominant swipe of >40 px).
  let touchStartX = 0, touchStartY = 0;
  stage?.addEventListener("touchstart", (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  stage?.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
  }, { passive: true });
})();

