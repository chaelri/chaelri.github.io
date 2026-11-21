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
  ctx.fillStyle = "rgba(219, 39, 119,0.6)";
  ctx.fillText("\u201C", 540, y - 50);

  ctx.font = font;
  ctx.fillStyle = "#ffffff";
  for (const line of lines) { ctx.fillText(line, 540, y); y += lh; }

  ctx.font = "600 36px 'Google Sans Flex', sans-serif";
  ctx.fillStyle = "rgba(219, 39, 119,0.8)";
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

  // Floating dock: proxies to the existing controls so their behaviour is unchanged.
  document.getElementById("readerDock")?.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-dock]");
    if (!b) return;
    const map = { study: "studyBtn", reflect: "passageReflectBtn", retell: "passageNarrateBtn" };
    if (b.dataset.dock === "listen") {
      if (!document.body.classList.contains("tts-mini")) mtListen?.click();
      else if (_ttsFinished) { stopTTS(); playChapter(); }
      else pauseResumeTTS();
    }
    else document.getElementById(map[b.dataset.dock])?.click();
  });
  // Spring from the dock: the sheet scales up from the bottom centre while the
  // dock shrinks away and the chip lifts off. Closing plays it in reverse and
  // only drops the open class once the sheet has gone.
  let _ttsSheetAnims = [];
  const setTtsSheet = (open) => {
    const body = document.body;
    if (body.classList.contains("tts-sheet-open") === open && !_ttsSheetAnims.length) return;
    _ttsSheetAnims.forEach((a) => a.cancel());
    _ttsSheetAnims = [];
    const sheet = document.getElementById("ttsPlayer");
    const dock = document.getElementById("readerDock");
    const chip = document.getElementById("ttsChip");
    if (open) body.classList.add("tts-sheet-open");
    if (!sheet?.animate || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      body.classList.toggle("tts-sheet-open", open);
      return;
    }
    const spring = "cubic-bezier(.34,1.32,.64,1)";
    const run = (el, frames, duration, delay, easing) => {
      if (!el) return null;
      const a = el.animate(frames, { duration, delay, easing, fill: "both" });
      _ttsSheetAnims.push(a);
      return a;
    };
    const sheetOff = { opacity: 0, scale: ".86", translate: "0 24px" }, sheetOn = { opacity: 1, scale: "1", translate: "0 0" };
    const dockOff = { opacity: 0, scale: ".88" }, dockOn = { opacity: 1, scale: "1" };
    const chipOff = { opacity: 0, translate: "-50% -24px" }, chipOn = { opacity: 1, translate: "-50% 0" };
    if (open) {
      run(dock, [dockOn, dockOff], 200, 0, "ease-out");
      run(chip, [chipOn, chipOff], 200, 0, "ease-out");
      run(sheet, [sheetOff, sheetOn], 460, 40, spring);
    } else {
      const out = run(sheet, [sheetOn, sheetOff], 240, 0, "cubic-bezier(.4,0,1,1)");
      run(dock, [dockOff, dockOn], 320, 160, spring);
      run(chip, [chipOff, chipOn], 260, 200, "ease-out");
      out.onfinish = () => body.classList.remove("tts-sheet-open");
    }
    const last = _ttsSheetAnims;
    Promise.all(last.map((a) => a.finished)).then(() => {
      if (_ttsSheetAnims !== last) return;
      last.forEach((a) => a.cancel());
      _ttsSheetAnims = [];
    }, () => {});
  };
  document.getElementById("ttsChip")?.addEventListener("click", () => setTtsSheet(true));
  document.getElementById("ttsSheetScrim")?.addEventListener("click", () => setTtsSheet(false));
  document.getElementById("ttsSheetGrab")?.addEventListener("click", () => setTtsSheet(false));
  document.getElementById("ttsSheetDown")?.addEventListener("click", () => setTtsSheet(false));

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

  // Font choice — Nunito is the CSS default on every device; picking SYSTEM
  // adds `body.font-system`, which restores the old stack (see that block in
  // style.css). Persisted so the choice survives reloads, but NOT synced to
  // RTDB: font is a per-device reading preference, and a phone and a laptop
  // can reasonably differ.
  const mtSheetFont = document.getElementById("mtSheetFont");
  function applyFontChoice(choice) {
    // Nunito is the CSS default, so only the opt-out carries a class.
    document.body.classList.toggle("font-system", choice === "system");
    mtSheetFont?.querySelectorAll(".mt-sheet-ver").forEach((b) => {
      b.classList.toggle("active", b.dataset.font === choice);
    });
  }
  mtSheetFont?.addEventListener("click", (e) => {
    const btn = e.target.closest(".mt-sheet-ver");
    if (!btn) return;
    const choice = btn.dataset.font === "nunito" ? "nunito" : "system";
    try { localStorage.setItem(_FONT_CHOICE_KEY, choice); } catch {}
    applyFontChoice(choice);
  });
  applyFontChoice(_getFontChoice());

  // Text size — verse text only, per-device (not synced, like the font).
  const TEXT_SIZE_KEY = "devo.verseTextSize";
  const mtTextSize = document.getElementById("mtTextSize");
  function applyTextSize(px) {
    const v = Math.min(24, Math.max(15, parseInt(px, 10) || 16));
    document.body.style.setProperty("--verse-fs", v + "px");
    if (mtTextSize) mtTextSize.value = String(v);
    return v;
  }
  let _savedTextSize = 16;
  try { _savedTextSize = localStorage.getItem(TEXT_SIZE_KEY) || 16; } catch {}
  applyTextSize(_savedTextSize);
  mtTextSize?.addEventListener("input", () => {
    const v = applyTextSize(mtTextSize.value);
    try { localStorage.setItem(TEXT_SIZE_KEY, String(v)); } catch {}
  });

  // Overflow sheet
  // Desktop: the menu is a popover just under the ... button (phones keep the bottom sheet).
  function placeOverflowPopover() {
    const panel = mtOverflowSheet.querySelector(".mt-sheet-panel");
    if (!panel) return;
    if (window.innerWidth < 1024 || !mtOverflow) { panel.style.top = panel.style.left = ""; return; }
    const r = mtOverflow.getBoundingClientRect();
    const w = 384;
    const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
    panel.style.top = Math.round(r.bottom + 12) + "px";
    panel.style.left = Math.round(left) + "px";
    panel.style.setProperty("--arrow-right", Math.round(Math.max(16, left + w - r.right + r.width / 2 - 5)) + "px");
  }
  function openOverflow() { mtOverflowSheet.hidden = false; placeOverflowPopover(); }
  function closeOverflow() { mtOverflowSheet.hidden = true; }
  mtOverflow?.addEventListener("click", openOverflow);
  mtOverflowBackdrop?.addEventListener("click", closeOverflow);
  mtThemeToggle?.addEventListener("click", () => { themeBtn?.click(); closeOverflow(); });
  mtSearchBible?.addEventListener("click", () => { searchBtn?.click(); closeOverflow(); });
  mtNotesToggle?.addEventListener("click", () => { notesBtn?.click(); closeOverflow(); });

  // Desktop only: hide the reflection sidebar so the page is just the passage.
  // Device-only preference (not in SYNC_STATIC_KEYS) — the phone layout stacks
  // the sidebar under the passage, where it never competes for width.
  const REFLECT_PANEL_KEY = "devo.hideReflectPanel";
  const mtReflectPanelToggle = document.getElementById("mtReflectPanelToggle");
  function applyReflectPanel(hidden) {
    document.body.classList.toggle("reflect-panel-hidden", hidden);
    if (!mtReflectPanelToggle) return;
    mtReflectPanelToggle.querySelector(".material-symbols-outlined").textContent =
      hidden ? "right_panel_open" : "right_panel_close";
    mtReflectPanelToggle.querySelector(".mt-reflect-panel-label").textContent =
      hidden ? "Show reflection" : "Hide reflection";
  }
  let reflectPanelHidden = false;
  // The hide/show toggle was removed: the reflection panel is always shown, and any old "hidden" preference is cleared.
  try { localStorage.removeItem(REFLECT_PANEL_KEY); } catch {}
  applyReflectPanel(false);
  mtReflectPanelToggle?.addEventListener("click", () => {
    reflectPanelHidden = !reflectPanelHidden;
    try { localStorage.setItem(REFLECT_PANEL_KEY, reflectPanelHidden ? "1" : "0"); } catch {}
    applyReflectPanel(reflectPanelHidden);
    closeOverflow();
  });

  // Mirror the "hidden until passage loaded" behavior of the original buttons.
  // Watch the ttsPlayBtn's class list — when loadBtn.click() unhides it, show
  // our chevrons + action row.
  function syncPassageLoadedState() {
    const loaded = ttsBtn && !ttsBtn.classList.contains("hidden");
    mtPrev.hidden = !loaded;
    mtNext.hidden = !loaded;
    mtActions.hidden = !loaded;
    { const _dock = document.getElementById("readerDock"); if (_dock) _dock.hidden = !loaded; }
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
    document.querySelector('#readerDock [data-dock="listen"]')?.classList.toggle("on", !!playing);
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
        const tile = bookList.querySelector(`.bc-tile[data-code="${expandedBook}"]`);
        tile?.scrollIntoView({ block: "center", behavior: "auto" });
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

  // Book tiles grouped by section; book order index → section label.
  const SECTIONS = [
    [0, "Law"], [5, "History"], [17, "Poetry & Wisdom"], [22, "Major Prophets"], [27, "Minor Prophets"],
    [39, "Gospels"], [43, "History"], [44, "Paul's Letters"], [57, "General Letters"], [65, "Prophecy"],
  ];
  const ABBR = { "Song of Solomon": "Song", "Song of Songs": "Song", Judges: "Jdg", Philippians: "Php", Philemon: "Phm", Ezekiel: "Ezk", Habakkuk: "Hab", Zephaniah: "Zep", Psalms: "Psa", Mark: "Mrk", John: "Jhn" };
  function abbr(name) {
    if (ABBR[name]) return ABBR[name];
    const m = name.match(/^(\d)\s+(\w{2})/);
    return m ? `${m[1]} ${m[2]}` : name.slice(0, 3);
  }
  function sectionOf(code) {
    const i = BOOK_ORDER.indexOf(code);
    let label = "";
    for (const [start, l] of SECTIONS) if (i >= start) label = l;
    return label;
  }

  function chapterGrid(code, current, curCh) {
    const box = document.createElement("div");
    box.className = "bc-tile-chapters";
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
    box.appendChild(grid);
    return box;
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
    let tiles = null, lastSection = null;
    for (const code of list) {
      const section = sectionOf(code);
      if (section !== lastSection || !tiles) {
        lastSection = section;
        const label = document.createElement("div");
        label.className = "bc-group-label";
        label.textContent = section;
        tiles = document.createElement("div");
        tiles.className = "bc-tiles";
        bookList.append(label, tiles);
      }
      const name = META[code].name;
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "bc-tile"
        + (code === current ? " active" : "")
        + (code === expandedBook ? " expanded" : "");
      tile.dataset.code = code;
      tile.setAttribute("aria-expanded", code === expandedBook ? "true" : "false");
      tile.innerHTML = `
        <span class="bc-tile-ch">${META[code].chapters.length}</span>
        <span class="bc-tile-ab">${abbr(name)}</span>
        <span class="bc-tile-name">${name}</span>
      `;
      tile.addEventListener("click", () => toggleBookExpansion(code));
      tiles.appendChild(tile);
      if (code === expandedBook) tiles.appendChild(chapterGrid(code, current, curCh));
    }
  }

  function toggleBookExpansion(code) {
    expandedBook = (expandedBook === code) ? null : code;
    renderBookList();
    if (expandedBook) {
      // Keep the just-tapped tile + its newly-revealed chapter grid in view.
      requestAnimationFrame(() => {
        bookList.querySelector(".bc-tile-chapters")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
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

