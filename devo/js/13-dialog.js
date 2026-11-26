/* ── Dialog mode ─────────────────────────────────────────────────────────────
   A separate screen that reads the open chapter one verse at a time, like a
   game dialog box (Charlie, 2026-11-26). Opened from the dialog button in the
   floating reader dock; "‹ Reader" goes back to the same verse.

   - Tap the lit (cream) box or empty space → next verse (typed out the first
     time, shown at once when stepping through verses already read).
   - Tap a dim verse → jump back to it.
   - The lit verse shows "context" / "ask" buttons under it; the result mounts
     under that verse (replaced the swipe-left, Charlie 2026-11-26).
   - Portrait: stacked log under the header. Landscape phones and desktop:
     split panel (title, section, progress on the left, log on the right).
   - Reads window.__passageVerses (set by loadPassage) and the AI section
     headings already inserted into #output; rebuilds on "devo:passage" so the
     ••• translation switch and chapter changes carry over.
*/
(function () {
  const $ = (id) => document.getElementById(id);
  let root, log, inDialog = false, boxes = [], wraps = [], f = -1, ty = null, data = null;

  function build() {
    if (root) return;
    root = document.createElement("section");
    root.id = "dialogMode";
    root.className = "dlgm";
    root.hidden = true;
    root.setAttribute("aria-label", "Dialog mode");
    root.innerHTML = `
      <div class="dlgm-top">
        <button type="button" class="dlgm-back" id="dlgmBack"><span class="material-symbols-outlined" aria-hidden="true">chevron_left</span>Reader</button>
        <h1 class="dlgm-title" id="dlgmTitle"></h1>
        <div class="dlgm-side"><div class="dlgm-sect" id="dlgmSect"></div><div class="dlgm-prog" id="dlgmProg"></div><div class="dlgm-bar"><i id="dlgmBar"></i></div></div>
      </div>
      <div class="dlgm-log" id="dlgmLog"></div>`;
    document.body.appendChild(root);
    log = $("dlgmLog");
    $("dlgmBack").addEventListener("click", close);
    log.addEventListener("click", () => next());
    addEventListener("keydown", (e) => {
      if (!inDialog || !document.querySelector("#mtOverflowSheet[hidden]")) return;
      if (e.target.closest?.("input, textarea, [contenteditable]")) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowUp") { e.preventDefault(); back(); }
      else if (e.key === "ArrowDown" || e.key === " ") { e.preventDefault(); next(); }
    });
  }

  // ── data ──
  const bookName = () => BIBLE_META[data.bookId]?.name || "";
  const vnum = (v) => parseInt(v.verse, 10);
  function headingFor(i) {
    // AI headings sit in #output right before the verse they caption.
    let found = "";
    document.querySelectorAll("#output .passage-heading").forEach((h) => {
      const key = h.nextElementSibling?.dataset?.verseKey;
      const idx = data.verses.findIndex((v) => keyOf(v.book_id, v.chapter, v.verse) === key);
      if (idx > -1 && idx <= i) found = h.textContent.trim();
    });
    return found;
  }
  function headingAt(i) {
    const v = data.verses[i];
    const prev = document.querySelector(`#output .verse[data-verse-key="${keyOf(v.book_id, v.chapter, v.verse)}"]`)?.previousElementSibling;
    return prev?.classList.contains("passage-heading") ? prev.textContent.trim() : "";
  }
  function firstVisibleIndex() {
    const verses = [...document.querySelectorAll("#output .verse")];
    const top = 120;
    const el = verses.find((w) => w.getBoundingClientRect().bottom > top);
    const idx = el ? data.verses.findIndex((v) => keyOf(v.book_id, v.chapter, v.verse) === el.dataset.verseKey) : 0;
    return Math.max(0, idx);
  }

  // Names/places list, built once from the NASB text (always capitalised
  // mid-sentence, minus Lord/God/pronouns). Loaded on first open.
  let NAMES = null;
  const namesReady = () => NAMES ? Promise.resolve() :
    fetch("bible-names.json").then((r) => r.json()).then((a) => { NAMES = new Set(a); }).catch(() => { NAMES = new Set(); });

  // ── typewriter over the quote-formatted HTML ──
  function verseHTML(v, stack) {
    const holder = document.createElement("p");
    holder.innerHTML = `<span class="dlgm-n">${v.verse}</span>${formatVerseQuotes(v.text, stack)}`;
    const walker = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const charsInto = (parent, str) => {
      for (const ch of str) {
        const s = document.createElement("span");
        s.className = "dlgm-c";
        s.textContent = ch;
        parent.appendChild(s);
      }
    };
    nodes.forEach((t) => {
      const frag = document.createDocumentFragment();
      // Names and places (bible-names.json) read in pink.
      t.textContent.split(/([A-Za-z][A-Za-z-]*)/).forEach((part, k) => {
        if (k % 2 && NAMES?.has(part)) {
          const nm = document.createElement("span");
          nm.className = "dlgm-name";
          charsInto(nm, part);
          frag.appendChild(nm);
        } else charsInto(frag, part);
      });
      t.replaceWith(frag);
    });
    return holder;
  }
  function typer(box) {
    const cs = [...box.querySelectorAll(".dlgm-c")];
    let i = 0, t;
    const step = () => {
      cs[i++]?.classList.add("on");
      if (i < cs.length) t = setTimeout(step, /[,.;:”’]/.test(cs[i - 1].textContent) ? 60 : 9);
    };
    step();
    return {
      skip() { clearTimeout(t); cs.forEach((c) => c.classList.add("on")); i = cs.length; },
      done: () => i >= cs.length,
    };
  }

  // ── log ──
  const quoteStack = [];
  function add(instant) {
    const i = boxes.length;
    const v = data.verses[i];
    if (!v) return;
    const h = headingAt(i);
    if (h) { const el = document.createElement("div"); el.className = "dlgm-head"; el.textContent = h; log.appendChild(el); }
    const w = document.createElement("div");
    w.className = "dlgm-vw";
    w.innerHTML = `<div class="dlgm-box"></div><div class="dlgm-acts"><button type="button" class="dlgm-act" data-act="context">context</button><button type="button" class="dlgm-act" data-act="ask">ask</button></div><div class="dlgm-mount"></div>`;
    const box = w.querySelector(".dlgm-box");
    box.appendChild(verseHTML(v, quoteStack));
    log.appendChild(w);
    boxes.push(box);
    wraps.push(w);
    box.addEventListener("click", (e) => {
      e.stopPropagation();
      if (i === f) next();
      else { if (ty && !ty.done()) ty.skip(); focus(i); }
    });
    w.querySelector(".dlgm-mount").addEventListener("click", (e) => e.stopPropagation());
    w.querySelectorAll(".dlgm-act").forEach((a) => a.addEventListener("click", (e) => {
      e.stopPropagation();
      const was = a.classList.contains("on");
      w.querySelectorAll(".dlgm-act").forEach((x) => x.classList.remove("on"));
      a.classList.toggle("on", !was);
      runAction(a.dataset.act, i);
    }));
    if (instant) box.querySelectorAll(".dlgm-c").forEach((c) => c.classList.add("on"));
    else { box.classList.add("new"); ty = typer(box); }
    if (i === data.verses.length - 1) {
      const end = document.createElement("div");
      end.className = "dlgm-end";
      end.textContent = `end of ${bookName()} ${data.chapter}`;
      log.appendChild(end);
    }
    if (!instant) focus(i);
  }
  function focus(i) {
    f = i;
    boxes.forEach((b, j) => b.classList.toggle("old", j !== i));
    wraps.forEach((w, j) => w.classList.toggle("lit", j === i));
    const n = i + 1, total = data.verses.length;
    $("dlgmSect").textContent = headingFor(i);
    $("dlgmProg").textContent = `verse ${data.verses[i].verse} of ${total}`;
    $("dlgmBar").style.width = (n / total) * 100 + "%";
    const w = wraps[i];
    setTimeout(() => {
      const hgt = log.clientHeight, bot = w.offsetTop + w.offsetHeight;
      // Split (landscape/desktop): the lit verse sits in the vertical middle.
      const top = root.classList.contains("split")
        ? w.offsetTop + w.offsetHeight / 2 - hgt / 2
        : Math.max(w.offsetTop - hgt * 0.38, bot - (hgt - 112));
      log.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }, 40);
  }
  function next() {
    if (ty && !ty.done()) return ty.skip();
    if (f < boxes.length - 1) focus(f + 1); else add();
  }
  function back() {
    if (ty && !ty.done()) ty.skip();
    if (f > 0) focus(f - 1);
  }
  function startAt(idx, keepTyped) {
    if (ty) ty.skip();
    ty = null;
    log.innerHTML = "";
    boxes = []; wraps = []; quoteStack.length = 0;
    for (let j = 0; j < idx; j++) add(true);
    if (keepTyped) { add(true); focus(idx); } else add(false);
  }

  // ── Context / Ask under the verse ──
  function runAction(act, i) {
    const v = data.verses[i], mount = wraps[i].querySelector(".dlgm-mount");
    if (i !== f) focus(i);
    if (act === "context") {
      if (mount.querySelector(".inline-ai-card")) { mount.innerHTML = ""; return; }
      fetchInlineQuickContext({ book: bookName(), chapter: v.chapter, verse: v.verse, text: v.text }, mount);
    } else {
      toggleVerseChat(keyOf(v.book_id, v.chapter, v.verse), bookName(), v.chapter, v.verse, v.text, mount);
    }
  }

  // ── open / close (curtain rise with a curved top, like the loader) ──
  const EASE = "cubic-bezier(.7,0,.2,1)";
  const CURVE = "50% 50% 0 0 / 96px 96px 0 0";
  async function open() {
    data = window.__passageVerses;
    if (inDialog || !data?.verses?.length) return;
    build();
    inDialog = true;
    await namesReady();
    $("dlgmTitle").textContent = `${bookName()} ${data.chapter}`;
    root.hidden = false;
    document.body.classList.add("dialog-open");
    startAt(firstVisibleIndex());
    await root.animate(
      [{ transform: "translateY(101%)", borderRadius: CURVE }, { transform: "translateY(0)", borderRadius: "0" }],
      { duration: 520, easing: EASE, fill: "forwards" },
    ).finished;
  }
  async function close() {
    if (!inDialog) return;
    inDialog = false;
    const v = data.verses[Math.max(0, f)];
    const target = v && document.querySelector(`#output .verse[data-verse-key="${keyOf(v.book_id, v.chapter, v.verse)}"]`);
    document.body.classList.remove("dialog-open");
    if (target) target.scrollIntoView({ block: "center" });
    await root.animate(
      [{ transform: "translateY(0)", borderRadius: "0" }, { transform: "translateY(101%)", borderRadius: CURVE }],
      { duration: 480, easing: EASE, fill: "forwards" },
    ).finished;
    root.hidden = true;
    root.getAnimations().forEach((a) => a.cancel());
    log.innerHTML = "";
  }

  // Translation switch / chapter change while open: rebuild in place.
  document.addEventListener("devo:passage", () => {
    if (!inDialog) return;
    const prev = data;
    data = window.__passageVerses;
    if (!data?.verses?.length) return close();
    $("dlgmTitle").textContent = `${bookName()} ${data.chapter}`;
    const same = prev && prev.bookId === data.bookId && prev.chapter === data.chapter;
    if (same) startAt(Math.min(Math.max(0, f), data.verses.length - 1), true);
    else startAt(0);
  });

  // Split layout: landscape phones and desktop.
  const splitMQ = matchMedia("(orientation: landscape) and (max-height: 600px), (min-width: 1024px)");
  const applySplit = () => root?.classList.toggle("split", splitMQ.matches);
  splitMQ.addEventListener?.("change", applySplit);

  document.getElementById("readerDock")?.addEventListener("click", (e) => {
    if (!e.target.closest('button[data-dock="dialog"]')) return;
    build();
    applySplit();
    open();
  });
  window.openDialogMode = () => { build(); applySplit(); open(); };
})();
