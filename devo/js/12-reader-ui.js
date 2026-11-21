/* ═══════════════════════════════════════════════════════════════════════════
   READER UI (2026-11-21 rebuild)
   - Notes sheet: one note per chapter, split 50/50 under the scripture
   - Compact header: slim one-row title bar once you scroll
   - Flowing layout (default) + verse tap bar + floating Context/Ask card
   - Archive: read-only list of the old verse notes and reflection answers
   Notes data lives in 06-notes.js (_loadChapterNote / _saveChapterNote).
   ═══════════════════════════════════════════════════════════════════════════ */
(function readerUI() {
  const $ = (id) => document.getElementById(id);
  const body = document.body;
  const layout = document.querySelector(".layout");
  const out = $("output");
  const ic = (n) => `<span class="material-symbols-outlined" aria-hidden="true">${n}</span>`;
  const isReading = () => !layout.classList.contains("layout-unset");

  /* ───────────────────────── Notes sheet ───────────────────────── */
  const sheet = document.createElement("section");
  sheet.id = "notesSheet";
  sheet.className = "notes-sheet";
  sheet.hidden = true;
  sheet.setAttribute("aria-label", "Chapter notes");
  sheet.innerHTML = `
    <div class="notes-grab" id="notesGrab" role="separator" aria-orientation="horizontal" aria-label="Drag to resize"><i></i></div>
    <div class="notes-head">
      <div class="notes-title" id="notesTitle"></div>
      <div class="notes-acts">
        <button type="button" class="notes-ib" id="notesFull" aria-label="Fullscreen">${ic("open_in_full")}</button>
        <button type="button" class="notes-ib" id="notesClose" aria-label="Close notes">${ic("close")}</button>
      </div>
    </div>
    <textarea id="notesText" class="notes-text" placeholder="Write about this chapter…" spellcheck="true"></textarea>`;
  body.appendChild(sheet);
  const ta = $("notesText"), titleEl = $("notesTitle"), fullBtn = $("notesFull");

  let curBook = null, curCh = null, saveT = null;
  const chapterLabel = () => `${BIBLE_META[bookEl.value]?.name || bookEl.value} ${chapterEl.value}`;

  function flushNote() {
    clearTimeout(saveT);
    saveT = null;
    if (curBook == null) return;
    const prev = _loadChapterNote(curBook, curCh).text;
    if (ta.value !== prev) _saveChapterNote(curBook, curCh, ta.value);
    updateNoteDot();
  }
  function loadNote() {
    curBook = bookEl.value;
    curCh = chapterEl.value;
    ta.value = _loadChapterNote(curBook, curCh).text;
    titleEl.textContent = chapterLabel();
    updateNoteDot();
  }
  function updateNoteDot() {
    const has = !!_loadChapterNote(bookEl.value, chapterEl.value).text.trim();
    document.querySelector('#readerDock [data-dock="note"]')?.classList.toggle("has-note", has);
  }
  ta.addEventListener("input", () => {
    clearTimeout(saveT);
    saveT = setTimeout(flushNote, 400);
  });
  window.addEventListener("pagehide", flushNote);
  document.addEventListener("visibilitychange", () => { if (document.hidden) flushNote(); });

  function setNotesH(px) {
    const max = Math.round(innerHeight * 0.7), min = Math.round(innerHeight * 0.3);
    body.style.setProperty("--notes-h", Math.max(min, Math.min(max, Math.round(px))) + "px");
  }
  function openNotes() {
    if (!isReading()) return;
    closeVerseCard();
    hideBar();
    loadNote();
    if (!body.style.getPropertyValue("--notes-h")) setNotesH(innerHeight * 0.5);
    sheet.hidden = false;
    requestAnimationFrame(() => {
      body.classList.add("notes-open");
      setTimeout(() => { if (!matchMedia("(pointer: coarse)").matches) ta.focus(); }, 250);
    });
    document.querySelector('#readerDock [data-dock="note"]')?.classList.add("on");
  }
  function closeNotes() {
    flushNote();
    body.classList.remove("notes-open", "notes-full");
    fullBtn.innerHTML = ic("open_in_full");
    document.querySelector('#readerDock [data-dock="note"]')?.classList.remove("on");
    ta.blur();
    setTimeout(() => { if (!body.classList.contains("notes-open")) sheet.hidden = true; }, 360);
  }
  fullBtn.onclick = () => {
    const full = body.classList.toggle("notes-full");
    fullBtn.innerHTML = ic(full ? "close_fullscreen" : "open_in_full");
    fullBtn.setAttribute("aria-label", full ? "Exit fullscreen" : "Fullscreen");
  };
  $("notesClose").onclick = closeNotes;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && body.classList.contains("notes-open") && !archiveOpen()) closeNotes(); });
  document.addEventListener("click", (e) => {
    const b = e.target.closest('#readerDock [data-dock="note"]');
    if (b) body.classList.contains("notes-open") ? closeNotes() : openNotes();
  });

  // Drag the grab bar to resize the split.
  (function dragResize() {
    const grab = $("notesGrab");
    let dragging = false;
    grab.addEventListener("pointerdown", (e) => {
      if (body.classList.contains("notes-full")) return;
      dragging = true;
      grab.setPointerCapture(e.pointerId);
      body.classList.add("notes-dragging");
    });
    grab.addEventListener("pointermove", (e) => { if (dragging) setNotesH(innerHeight - e.clientY); });
    const end = () => { dragging = false; body.classList.remove("notes-dragging"); };
    grab.addEventListener("pointerup", end);
    grab.addEventListener("pointercancel", end);
  })();

  // Keep the sheet above the on-screen keyboard.
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const fit = () => body.style.setProperty("--kb", Math.max(0, innerHeight - vv.height - vv.offsetTop) + "px");
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
  }

  // A new chapter while the sheet is open: save the old one, show the new one.
  new MutationObserver(() => {
    if (body.classList.contains("notes-open") && (bookEl.value !== curBook || chapterEl.value !== curCh)) {
      flushNote();
      loadNote();
    } else if (!body.classList.contains("notes-open")) {
      updateNoteDot();
    }
    if (!isReading()) { if (body.classList.contains("notes-open")) closeNotes(); }
  }).observe(passageTitleEl, { childList: true, characterData: true, subtree: true });
  // Remote sync of the open chapter's note (only when not typing).
  window.addEventListener("storage", () => { if (document.activeElement !== ta && body.classList.contains("notes-open")) loadNote(); });

  /* ───────────────────────── Compact header (option C) ───────────────────────── */
  const cbar = document.createElement("div");
  cbar.id = "compactBar";
  cbar.className = "compact-bar";
  cbar.hidden = true;
  cbar.innerHTML = `
    <button type="button" class="cb-ib" data-cb="home" aria-label="Home">${ic("chevron_left")}</button>
    <button type="button" class="cb-title" data-cb="title" aria-label="Change passage"></button>
    <button type="button" class="cb-ib" data-cb="prev" aria-label="Previous chapter">${ic("navigate_before")}</button>
    <button type="button" class="cb-ib" data-cb="next" aria-label="Next chapter">${ic("navigate_next")}</button>
    <button type="button" class="cb-ib" data-cb="more" aria-label="More actions">${ic("more_horiz")}</button>`;
  body.appendChild(cbar);
  const cbTitle = cbar.querySelector(".cb-title");
  const syncCbTitle = () => { cbTitle.textContent = passageTitleEl.textContent; };
  new MutationObserver(syncCbTitle).observe(passageTitleEl, { childList: true, characterData: true, subtree: true });
  syncCbTitle();
  cbar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cb]");
    if (!b) return;
    const k = b.dataset.cb;
    if (k === "home") $("homeBtn")?.click();
    else if (k === "title") passageTitleEl.click();
    else if (k === "prev") $("passageTitlePrev")?.click();
    else if (k === "next") $("passageTitleNext")?.click();
    else if (k === "more") {
      $("mtOverflow")?.click();
      const panel = document.querySelector("#mtOverflowSheet .mt-sheet-panel");
      if (panel && innerWidth >= 1024) {
        const r = b.getBoundingClientRect(), w = 384;
        const left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8));
        panel.style.top = Math.round(r.bottom + 12) + "px";
        panel.style.left = Math.round(left) + "px";
        panel.style.setProperty("--arrow-right", Math.round(Math.max(16, left + w - r.right + r.width / 2 - 5)) + "px");
      }
    }
  });
  let cbOn = false;
  function syncCompact() {
    const want = isReading() && !passageTitleEl.hidden && layout.scrollTop > 48 && !body.classList.contains("notes-full");
    if (want === cbOn) return;
    cbOn = want;
    body.classList.toggle("compact-on", want);
    if (want) { cbar.hidden = false; requestAnimationFrame(() => cbar.classList.add("on")); }
    else { cbar.classList.remove("on"); setTimeout(() => { if (!cbOn) cbar.hidden = true; }, 260); }
  }
  layout.addEventListener("scroll", syncCompact, { passive: true });
  new MutationObserver(syncCompact).observe(layout, { attributes: true, attributeFilter: ["class"] });
  new MutationObserver(syncCompact).observe(body, { attributes: true, attributeFilter: ["class"] });

  /* ───────────────────────── Flowing layout ───────────────────────── */
  const FLOW_KEY = "devoReadLayout"; // "flow" (default) | "blocks"
  const getFlow = () => { try { return localStorage.getItem(FLOW_KEY) !== "blocks"; } catch { return true; } };
  function applyFlow() {
    const flow = getFlow();
    body.classList.toggle("flow-read", flow);
    document.querySelectorAll("#mtLayoutRow [data-layout]").forEach((b) => b.classList.toggle("active", (b.dataset.layout === "flow") === flow));
    if (!flow) { hideBar(); closeVerseCard(); }
  }

  const ALIGN_KEY = "devoReadAlign"; // "justify" (default) | "left"
  const getJustify = () => { try { return localStorage.getItem(ALIGN_KEY) !== "left"; } catch { return true; } };
  function applyAlign() {
    const j = getJustify();
    body.classList.toggle("flow-justify", j);
    document.querySelectorAll("#mtAlignRow [data-align]").forEach((b) => b.classList.toggle("active", (b.dataset.align === "justify") === j));
  }

  /* ───────── ⋯ menu: Layout row + Archive item ───────── */
  const themeItem = $("mtThemeToggle");
  if (themeItem) {
    const row = document.createElement("div");
    row.className = "mt-sheet-row";
    row.id = "mtLayoutRow";
    row.innerHTML = `
      <div class="mt-sheet-row-left"><span class="material-symbols-outlined">view_headline</span>Layout</div>
      <div class="mt-sheet-version">
        <button class="mt-sheet-ver" data-layout="flow">Flowing</button>
        <button class="mt-sheet-ver" data-layout="blocks">Verses</button>
      </div>`;
    themeItem.insertAdjacentElement("beforebegin", row);
    const alignRow = document.createElement("div");
    alignRow.className = "mt-sheet-row";
    alignRow.id = "mtAlignRow";
    alignRow.innerHTML = `
      <div class="mt-sheet-row-left"><span class="material-symbols-outlined">format_align_justify</span>Align</div>
      <div class="mt-sheet-version">
        <button class="mt-sheet-ver" data-align="left">Left</button>
        <button class="mt-sheet-ver" data-align="justify">Justified</button>
      </div>`;
    themeItem.insertAdjacentElement("beforebegin", alignRow);
    alignRow.addEventListener("click", (e) => {
      const b = e.target.closest("[data-align]");
      if (!b) return;
      try { localStorage.setItem(ALIGN_KEY, b.dataset.align); } catch {}
      applyAlign();
    });
    row.addEventListener("click", (e) => {
      const b = e.target.closest("[data-layout]");
      if (!b) return;
      try { localStorage.setItem(FLOW_KEY, b.dataset.layout); } catch {}
      applyFlow();
    });
    const arch = document.createElement("button");
    arch.className = "mt-sheet-item";
    arch.id = "mtArchive";
    arch.innerHTML = `<span class="material-symbols-outlined">inventory_2</span>Archive`;
    themeItem.insertAdjacentElement("afterend", arch);
    arch.addEventListener("click", () => { $("mtOverflowSheet").hidden = true; openArchive(); });
  }
  applyFlow();
  applyAlign();

  /* ───────── Verse tap bar (flowing layout) ───────── */
  const bar = document.createElement("div");
  bar.id = "verseBar";
  bar.className = "verse-bar";
  bar.hidden = true;
  bar.innerHTML = `
    <button type="button" data-vb="context">${ic("auto_awesome")}<span>Context</span></button>
    <button type="button" data-vb="ask">${ic("chat_bubble_outline")}<span>Ask</span></button>
    <button type="button" data-vb="fav" aria-label="Favorite">${ic("favorite")}</button>`;
  body.appendChild(bar);

  let selVerse = null;
  function hideBar() {
    bar.classList.remove("on");
    setTimeout(() => { if (!bar.classList.contains("on")) bar.hidden = true; }, 220);
    if (selVerse && !card.classList.contains("on")) selVerse.classList.remove("verse-sel");
    if (!card.classList.contains("on")) selVerse = null;
  }
  function showBar(v) {
    out.querySelectorAll(".verse.verse-sel").forEach((x) => x.classList.remove("verse-sel"));
    selVerse = v;
    v.classList.add("verse-sel");
    syncFav();
    bar.hidden = false;
    requestAnimationFrame(() => bar.classList.add("on"));
  }
  function syncFav() {
    if (!selVerse) return;
    const on = isFavorite(selVerse.dataset.verseKey);
    const b = bar.querySelector('[data-vb="fav"]');
    b.classList.toggle("is-fav", on);
    b.firstElementChild.style.fontVariationSettings = on ? "'FILL' 1" : "";
  }
  out.addEventListener("click", (e) => {
    if (!body.classList.contains("flow-read") || out.classList.contains("tts-mode")) return;
    if (getSelection().toString().trim()) return;
    if (e.target.closest("a, button, textarea, input")) return;
    const v = e.target.closest(".verse");
    if (!v) return;
    if (v === selVerse && bar.classList.contains("on")) { hideBar(); return; }
    if (card.classList.contains("on")) closeVerseCard();
    showBar(v);
  });
  document.addEventListener("click", (e) => {
    if (!bar.classList.contains("on")) return;
    if (e.target.closest("#verseBar, #output .verse, #verseCard, #readerDock")) return;
    hideBar();
  });
  layout.addEventListener("scroll", () => { if (bar.classList.contains("on") && !card.classList.contains("on")) hideBar(); }, { passive: true });

  /* ───────── Floating Context / Ask card ───────── */
  const card = document.createElement("div");
  card.id = "verseCard";
  card.className = "verse-card";
  card.hidden = true;
  card.innerHTML = `
    <div class="vc-head">
      <div class="vc-tabs" role="tablist">
        <button type="button" role="tab" data-vc="context">Context</button>
        <button type="button" role="tab" data-vc="ask">Ask</button>
      </div>
      <span class="vc-ref" id="vcRef"></span>
      <button type="button" class="notes-ib" id="vcClose" aria-label="Close">${ic("close")}</button>
    </div>
    <div class="vc-pane" data-pane="context"></div>
    <div class="vc-pane" data-pane="ask"></div>`;
  body.appendChild(card);
  const panes = { context: card.querySelector('[data-pane="context"]'), ask: card.querySelector('[data-pane="ask"]') };
  let cardKey = null;

  function verseInfo(v) {
    const key = v.dataset.verseKey;
    const [bookId, chapter, verse] = key.split("-");
    return { key, bookId, chapter, verse, book: BIBLE_META[bookId]?.name || bookId, text: getVerseText(bookId, chapter, verse) || "" };
  }
  function showPane(which) {
    card.querySelectorAll("[data-vc]").forEach((b) => b.classList.toggle("on", b.dataset.vc === which));
    Object.entries(panes).forEach(([k, el]) => { el.hidden = k !== which; });
    const info = verseInfo(selVerse);
    if (!panes[which].dataset.loaded) {
      panes[which].dataset.loaded = "1";
      if (which === "context") fetchInlineQuickContext({ book: info.book, chapter: info.chapter, verse: info.verse, text: info.text }, panes.context);
      else toggleVerseChat(info.key, info.book, info.chapter, info.verse, info.text, panes.ask);
    }
  }
  function openVerseCard(which) {
    if (!selVerse) return;
    const info = verseInfo(selVerse);
    if (cardKey !== info.key) {
      Object.values(panes).forEach((p) => { p.innerHTML = ""; delete p.dataset.loaded; });
      if (window.verseChatHistories) delete verseChatHistories[info.key];
      cardKey = info.key;
    }
    $("vcRef").textContent = `${info.book} ${info.chapter}:${info.verse}`;
    card.hidden = false;
    bar.classList.remove("on");
    setTimeout(() => { if (!bar.classList.contains("on")) bar.hidden = true; }, 220);
    requestAnimationFrame(() => card.classList.add("on"));
    body.classList.add("verse-card-open");
    showPane(which);
    // Keep the tapped verse above the card.
    setTimeout(() => {
      const r = selVerse.getBoundingClientRect(), lim = card.getBoundingClientRect().top - 16;
      if (r.bottom > lim) layout.scrollBy({ top: r.bottom - lim, behavior: "smooth" });
    }, 120);
  }
  function closeVerseCard() {
    if (card.hidden) return;
    card.classList.remove("on");
    body.classList.remove("verse-card-open");
    out.querySelectorAll(".verse.verse-sel").forEach((x) => x.classList.remove("verse-sel"));
    selVerse = null;
    setTimeout(() => { if (!card.classList.contains("on")) card.hidden = true; }, 260);
  }
  bar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-vb]");
    if (!b || !selVerse) return;
    if (b.dataset.vb === "fav") {
      toggleFavorite(selVerse.dataset.verseKey);
      selVerse.classList.toggle("highlighted", isFavorite(selVerse.dataset.verseKey));
      syncFav();
      return;
    }
    openVerseCard(b.dataset.vb);
  });
  card.addEventListener("click", (e) => {
    const t = e.target.closest("[data-vc]");
    if (t) showPane(t.dataset.vc);
  });
  $("vcClose").onclick = closeVerseCard;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (!card.hidden) closeVerseCard(); else hideBar(); } });
  // Changing chapter drops any open verse UI.
  new MutationObserver(() => { hideBar(); closeVerseCard(); cardKey = null; }).observe(passageTitleEl, { childList: true, characterData: true, subtree: true });

  /* ───────────────────────── Archive (read-only) ───────────────────────── */
  const arch = document.createElement("div");
  arch.id = "archiveView";
  arch.className = "archive-view";
  arch.hidden = true;
  arch.innerHTML = `
    <div class="ar-bar">
      <button type="button" class="notes-ib" id="arClose" aria-label="Back">${ic("arrow_back_ios_new")}</button>
      <div class="ar-title">Archive</div>
      <button type="button" class="ar-dl" id="arDl">Download</button>
    </div>
    <div class="ar-list" id="arList"></div>`;
  body.appendChild(arch);
  const archiveOpen = () => !arch.hidden;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function archiveEntries() {
    const items = [];
    _getArchiveNotes().forEach((n) => {
      if (n.type === "verse") {
        n.allItems.forEach((it) => {
          const [b, c, v] = it.verseKey.split("-");
          items.push({ kind: "note", ref: `${BIBLE_META[b]?.name || b} ${c}${v ? ":" + v : ""}`, goto: [b, c, v || ""], text: it.text, time: it.time || 0 });
        });
      } else if (n.type === "reflection") {
        const [b, c] = n.passageKey.split("-");
        n.QAs.forEach((qa) => {
          const q = (qa.raw.split("\nA: ")[0] || "").replace(/^Q:\s*/, "").trim();
          const a = (qa.raw.split("\nA: ")[1] || "").trim();
          if (a) items.push({ kind: "reflection", ref: n.title, goto: [b, c, ""], question: q, text: a, time: n.time || 0 });
        });
      }
    });
    return items.sort((x, y) => y.time - x.time);
  }
  function openArchive() {
    const items = archiveEntries();
    $("arList").innerHTML = items.length
      ? items.map((it, i) => `
        <button type="button" class="ar-card" data-i="${i}">
          <span class="ar-ref">${esc(it.ref)}${it.kind === "reflection" ? " · reflection" : ""}</span>
          ${it.question ? `<span class="ar-q">${esc(it.question)}</span>` : ""}
          <span class="ar-text">${esc(it.text)}</span>
          ${it.time ? `<span class="ar-time">${new Date(it.time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>` : ""}
        </button>`).join("")
      : `<p class="ar-empty">Nothing archived.</p>`;
    $("arList")._items = items;
    arch.hidden = false;
    requestAnimationFrame(() => arch.classList.add("on"));
    arch.querySelector(".ar-list").scrollTop = 0;
  }
  function closeArchive() {
    arch.classList.remove("on");
    setTimeout(() => { if (!arch.classList.contains("on")) arch.hidden = true; }, 260);
  }
  $("arClose").onclick = closeArchive;
  $("arList").addEventListener("click", (e) => {
    const c = e.target.closest(".ar-card");
    if (!c) return;
    const it = $("arList")._items[+c.dataset.i];
    closeArchive();
    dashNoteGoToVerse(`${it.goto[0]}-${it.goto[1]}-${it.goto[2]}`, it.goto[2]);
  });
  $("arDl").onclick = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      entries: archiveEntries().map((it) => ({ kind: it.kind, ref: it.ref, question: it.question || undefined, text: it.text, time: it.time ? new Date(it.time).toISOString() : null })),
    };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = "devo-notes-archive.json";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
})();
