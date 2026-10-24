function saveComments() {
  localStorage.setItem("bibleComments", JSON.stringify(comments));
}

const keyOf = (b, c, v) => `${b}-${c}-${v}`;
const devotionId = () =>
  `${bookEl.value}-${chapterEl.value}-${verseEl.value || ""}`;

function resetAISections() {
  aiContextSummaryEl.innerHTML = "";
  const reflection = document.getElementById("aiReflection");
  if (reflection) {
    reflection.innerHTML = "";
    reflection.style.display = "none";
  }
}

/* ── Passage section headings ──────────────────────────────────────────────
   The lines a printed Bible carries through a chapter — "Gideon Defeats the
   Midianites". A chapter usually holds more than one scene, so this returns a
   list anchored to verse numbers rather than a single title on top.

   Generated once per chapter and cached under `passageHeading-`, which is in
   firebase-sync's SYNC_DYNAMIC_PREFIXES — so a chapter titled on the phone is
   already titled on the laptop instead of costing a second call. */
const _HEADING_KEY = (book, chapter) => `passageHeading-${book}-${chapter}`;

// Bumped on every passage render. A response that lands after you've already
// flipped to the next chapter belongs to a passage that's no longer on
// screen, and inserting it would caption the wrong verses.
let _headingGen = 0;

function _cleanHeading(text) {
  const clean = String(text || "")
    .replace(/^["'“”‘’\s]+|["'“”‘’\s.]+$/g, "")
    .trim();
  // A model that ignores the word cap returns a sentence — better to show
  // nothing than a paragraph pretending to be a heading.
  return clean && clean.length <= 60 ? clean : "";
}

function _insertPassageHeadings(sections, gen) {
  if (gen !== _headingGen) return;
  const output = document.getElementById("output");
  if (!output || !Array.isArray(sections)) return;

  const added = [];

  sections.forEach((section) => {
    const title = _cleanHeading(section?.title);
    const verseNum = parseInt(section?.verse, 10);
    if (!title || !verseNum) return;

    // .verse-header carries id="<verseNum>" (set in the render loop), which is
    // also what the verse-chip scroll fallback resolves against.
    const wrap = document.getElementById(String(verseNum))?.closest(".verse");
    if (!wrap || wrap.parentNode !== output) return;
    // A re-render can race a cached read; never stack two headings on a verse.
    if (wrap.previousElementSibling?.classList.contains("passage-heading")) return;

    // The span is what makes the open animation possible: the h2 animates
    // grid-template-rows 0fr → 1fr, and a grid row can only collapse around a
    // real element — a bare text node becomes an anonymous item that can't
    // take the min-height: 0 the collapse needs.
    const h = document.createElement("h2");
    h.className = "passage-heading";
    const span = document.createElement("span");
    span.textContent = title;
    h.appendChild(span);
    output.insertBefore(h, wrap);
    added.push(h);
  });

  // Reveal on the next frame, so the browser has a 0fr start value to animate
  // FROM — setting the end state in the same frame as insertion just snaps.
  //
  // The setTimeout is not belt-and-braces, it's load-bearing: rAF does not run
  // in a background tab, and the heading is inserted with opacity 0 and a
  // collapsed row. Without a fallback, a response landing while the app is
  // backgrounded leaves the heading permanently invisible. Adding the class
  // twice is harmless.
  if (added.length) {
    const reveal = () =>
      added.forEach((h, i) => {
        h.style.transitionDelay = `${Math.min(i * 90, 400)}ms`;
        h.classList.add("passage-heading-in");
      });
    requestAnimationFrame(reveal);
    setTimeout(reveal, 80);
  }
}

/* Returns the section list for a chapter, from cache or the API. Split out
   from the reader's insertion so Retell can use the same sections instead of
   generating a second, differently-worded set for the same chapter. */
// Opening a chapter and hitting Retell fires two calls for the same sections
// before either has cached — and they come back differently worded, so the
// reader and the retelling disagree about what the chapter's sections are
// called. The second caller awaits the first instead. (Same pattern as
// _inflight in js/03-tts.js, for the same reason.)
const _headingInflight = new Map();

async function _fetchPassageSections(book, chapter, versesText) {
  if (!versesText) return null;
  const key = _HEADING_KEY(book, chapter);

  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // Written by the single-heading version of this feature — treat the
        // bare string as one section covering the chapter from verse 1.
        return [{ verse: 1, title: cached }];
      }
    }
  } catch {}

  if (_headingInflight.has(key)) return _headingInflight.get(key);

  const flight = _fetchPassageSectionsUncached(key, versesText).finally(() =>
    _headingInflight.delete(key),
  );
  _headingInflight.set(key, flight);
  return flight;
}

async function _fetchPassageSectionsUncached(key, versesText) {
  try {
    const raw = await callGemini(
      `Split this chapter into its sections the way a printed study Bible does, and give each one a heading — like "Gideon Defeats the Midianites" or "The Birth of Jesus".

Return ONLY a JSON array, no markdown fence, no commentary:
[{"verse": 1, "title": "Gideon Defeats the Midianites"}, {"verse": 15, "title": "..."}]

RULES:
- "verse" is the verse number the section STARTS at. The first section must start at verse 1.
- Break only where the chapter genuinely changes scene, speaker, or subject. A short or single-scene chapter gets ONE heading — do not invent breaks to pad the list.
- Most chapters need 1 to 4 headings. Never more than 5.
- Each title is 3 to 6 words, Title Case, naming what actually happens there using the names the chapter itself uses.
- No verse numbers, book names, or chapter numbers inside a title. No trailing punctuation.

CHAPTER:
${versesText}`,
      { maxOutputTokens: 300, temperature: 0.2 },
    );

    const text = String(raw || "");
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end <= start) throw new Error("no JSON array in response");
    const sections = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(sections) || !sections.length) throw new Error("no sections");

    try { localStorage.setItem(key, JSON.stringify(sections)); } catch {}
    return sections;
  } catch (err) {
    // Missing headings aren't worth surfacing — the chapter reads fine.
    console.warn("[passage headings]", err);
    return null;
  }
}

async function _loadPassageHeadings(book, chapter, versesText, gen) {
  const sections = await _fetchPassageSections(book, chapter, versesText);
  if (sections) _insertPassageHeadings(sections, gen);
}

// ── Verse-action button feedback ──────────────────────────────────────────
// Touch devices never fire :hover, so a tap on Context / Ask / Note used to
// look identical to no tap at all — and Context takes a second or two to
// render its card. Feedback is now continuity rather than decoration: the
// press scales the button (CSS :active), and the panel it opens grows out of
// that button, so the card visibly comes from where the finger was.
// See haptic() in 01-core.js for why this isn't a plain navigator.vibrate.
function _verseActionTap(btn) {
  if (!btn) return;
  haptic(8);
}

// Plays the open animation on `panel`, anchored to the tapped button's
// x-center so the reveal starts under the finger. The class is stripped on
// animationend — leaving it on would replay the whole thing when the loader
// card is swapped for the real content a second or two later.
// Reverse of _revealFromButton: the panel shrinks back up into the button it
// came from (height → 0, so the verses below slide up), THEN `done` empties or
// hides it. While it runs, panel._collapsing is set so a tap in that window
// is ignored instead of reopening a half-gone panel.
function _collapsePanel(panel, btn, done) {
  if (!panel || panel._collapsing) return;
  const h = panel.getBoundingClientRect().height;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!h || reduce || !panel.animate) { done(); return; }
  if (btn) {
    try {
      const originX = btn.getBoundingClientRect().left - panel.getBoundingClientRect().left
        + btn.getBoundingClientRect().width / 2;
      panel.style.setProperty("--ai-origin-x", `${Math.round(originX)}px`);
    } catch {}
  }
  panel._collapsing = true;
  const prevOverflow = panel.style.overflow;
  panel.style.overflow = "hidden";
  panel.style.transformOrigin = "var(--ai-origin-x, 32px) top";
  const anim = panel.animate(
    [
      { height: `${h}px`, opacity: 1, transform: "none" },
      { height: "0px", opacity: 0, transform: "translateY(-8px) scale(0.97)" },
    ],
    { duration: 300, easing: "cubic-bezier(0.4, 0, 0.2, 1)" },
  );
  anim.onfinish = anim.oncancel = () => {
    done();
    panel.style.overflow = prevOverflow;
    panel.style.transformOrigin = "";
    panel._collapsing = false;
  };
}

function _revealFromButton(panel, btn, cls) {
  if (!panel || !btn) return;
  try {
    const panelBox = panel.getBoundingClientRect();
    const btnBox = btn.getBoundingClientRect();
    const originX = btnBox.left - panelBox.left + btnBox.width / 2;
    panel.style.setProperty("--ai-origin-x", `${Math.round(originX)}px`);
  } catch {}
  panel.classList.remove(cls);
  void panel.offsetWidth; // reflow — restarts the animation on a rapid re-tap
  panel.classList.add(cls);
  // Only the panel's own animation ends the reveal. animationend bubbles, so
  // an inner animation (a fast body swap, a loader) would otherwise strip the
  // class mid-flight and snap the panel to its final size.
  const done = (e) => {
    if (e.target !== panel) return;
    panel.classList.remove(cls);
    panel.removeEventListener("animationend", done);
  };
  panel.addEventListener("animationend", done);
}

// Keeps the button lit for as long as the panel it opened is showing, so the
// row also answers "which one did I tap?" after the press animation ends.
// Context and Ask share one .inline-ai-mount, so state is read from what's
// actually rendered rather than tracked in a flag.
// ── Verse notes, shown under the verse ─────────────────────────────────────
// A verse's notes sit right under it whenever the editor is closed; a verse
// with none shows nothing (no "No notes" line). The editor (.comments) still
// lists them with delete buttons while it's open, so the two never show at once.
function _renderInlineNotes(wrap) {
  const el = wrap?.querySelector(".verse-notes-inline");
  if (!el) return;
  const list = comments[wrap.dataset.verseKey] || [];
  const editorOpen = !wrap.querySelector(".comments")?.hidden;
  el.hidden = editorOpen || !list.length;
  el.innerHTML = el.hidden ? "" : list.map((n) => `<div class="verse-note-inline">${n.text}</div>`).join("");
}

// ── Verse swipe actions ────────────────────────────────────────────────────
// The Context / Ask / Note row used to sit under every verse. Now:
//   swipe left → right : Note opens at once; the verse slides back over its icon
//   swipe right → left : the verse STAYS slid over, and the Context / Ask
//                        icons it uncovered are the buttons — tap one
// Swiping it back, tapping the verse, or tapping anywhere else closes it; one
// verse is open at a time. The slide is the CSS var --swipe-x on .verse (see
// style.css): the icons are clipped to the gap, so closing covers them rather
// than sliding text over them. Vertical drags, double-tap-to-favourite and iOS
// edge-back swipes are left alone. Mouse users get the row on hover instead.
const SWIPE_OPEN = { note: 64, ai: -108 };

function _setSwipeX(wrap, px) {
  wrap.style.setProperty("--swipe-x", `${px}px`);
}

function _closeVerseSwipe(wrap) {
  if (!wrap) return;
  wrap.classList.remove("verse-swipe-open", "verse-swipe-armed", "verse-swiping");
  delete wrap.dataset.swipeOpen;
  _setSwipeX(wrap, 0);
}

function _openVerseSwipe(wrap, side) {
  document.querySelectorAll(".verse.verse-swipe-open").forEach((w) => { if (w !== wrap) _closeVerseSwipe(w); });
  wrap.classList.remove("verse-swiping");
  wrap.classList.add("verse-swipe-open");
  wrap.dataset.swipeOpen = side;
  _setSwipeX(wrap, SWIPE_OPEN[side]);
}

function _wireVerseSwipe() {
  if (output._swipeWired) return;
  output._swipeWired = true;
  const SWIPE_ARM = 56, SWIPE_MAX = 130, EDGE = 24;
  let st = null;

  output.addEventListener("touchstart", (e) => {
    st = null;
    if (e.touches.length !== 1 || output.classList.contains("tts-mode")) return;
    const header = e.target.closest(".verse-header");
    if (!header || e.target.closest("button, a, textarea, input")) return;
    const t = e.touches[0];
    if (t.clientX < EDGE || t.clientX > innerWidth - EDGE) return;
    const wrap = header.closest(".verse");
    const open = wrap.dataset.swipeOpen;
    st = { x: t.clientX, y: t.clientY, wrap, dx: 0, mode: null, armed: false,
           open, base: open ? SWIPE_OPEN[open] : 0 };
  }, { passive: true });

  output.addEventListener("touchmove", (e) => {
    if (!st) return;
    const t = e.touches[0];
    const dx = t.clientX - st.x, dy = t.clientY - st.y;
    if (!st.mode) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.3) { st = null; return; } // a scroll
      st.mode = "h";
      st.wrap.classList.add("verse-swiping");
    }
    e.preventDefault();
    st.dx = dx;
    _setSwipeX(st.wrap, Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, st.base + dx * 0.8)));
    if (st.open) return; // dragging an open verse: release decides
    const armed = Math.abs(dx) >= SWIPE_ARM;
    if (armed !== st.armed) {
      st.armed = armed;
      st.wrap.classList.toggle("verse-swipe-armed", armed);
      if (armed) haptic(8);
    }
  }, { passive: false });

  const end = () => {
    if (!st || st.mode !== "h") { st = null; return; }
    const { wrap, dx, armed, open } = st;
    st = null;
    if (open) {
      // Dragged back toward closed (or past it) → close; otherwise stay open.
      const back = open === "note" ? dx < -24 : dx > 24;
      if (back) _closeVerseSwipe(wrap); else _openVerseSwipe(wrap, open);
      return;
    }
    if (armed && dx < 0) { _openVerseSwipe(wrap, "ai"); return; }
    // Note opens straight away; the verse slides back over its icon.
    _closeVerseSwipe(wrap);
    if (armed && dx > 0) wrap.querySelector('[data-action="note"]')?.click();
  };
  output.addEventListener("touchend", end);
  output.addEventListener("touchcancel", end);

  // Tap a revealed icon → that action. Tap the open verse or anywhere else →
  // close it (that first tap does nothing else).
  document.addEventListener("click", (e) => {
    const act = e.target.closest(".vsh-btn");
    const openWraps = [...document.querySelectorAll(".verse.verse-swipe-open")];
    if (act) {
      const wrap = act.closest(".verse");
      e.stopPropagation();
      _closeVerseSwipe(wrap);
      wrap.querySelector(`.verse-action-btn[data-action="${act.dataset.swipeAct}"]`)?.click();
      return;
    }
    if (!openWraps.length) return;
    if (openWraps.some((w) => w.querySelector(".verse-header")?.contains(e.target))) e.stopPropagation();
    openWraps.forEach((w) => _closeVerseSwipe(w));
  }, true);
}

function _syncVerseActionStates(wrap) {
  if (!wrap) return;
  const mount = wrap.querySelector(".inline-ai-mount");
  const commentsEl = wrap.querySelector(".comments");
  const openState = {
    context: !!mount?.querySelector(".inline-ai-card"),
    ask: !!mount?.querySelector(".verse-chat-wrapper"),
    note: !!commentsEl && !commentsEl.hidden,
  };
  wrap.querySelectorAll(".verse-action-btn").forEach((b) => {
    b.classList.toggle("verse-action-btn-on", !!openState[b.dataset.action]);
  });
}

// ── Inline AI card: build once, swap the body ─────────────────────────────
// Every card state used to rewrite mountEl.innerHTML in full — loader, then
// answer, then error. That tore down and rebuilt the entire subtree each
// time, so one tap read as the card blinking two or three separate times.
// The shell is now created once and only `.ai-card-body` changes.
function _mountAICardShell(mountEl, { label, extraClass = "", effectsHTML = "" }) {
  mountEl.innerHTML = `<div class="inline-ai-card ${extraClass}">
    ${effectsHTML}
    <div class="ai-card-gradient">
      <div class="ai-card-header">
        <span class="ai-card-label">${label}</span>
        <button class="ai-card-close" title="Close">✕</button>
      </div>
      <div class="ai-card-body"></div>
    </div>
  </div>`;
  mountEl.querySelector(".ai-card-close").onclick = () => {
    const verseWrap = mountEl.closest?.(".verse");
    _collapsePanel(mountEl, verseWrap?.querySelector('[data-action="context"]'), () => {
      mountEl.innerHTML = "";
      if (verseWrap) _syncVerseActionStates(verseWrap);
    });
  };
  return {
    card: mountEl.querySelector(".inline-ai-card"),
    body: mountEl.querySelector(".ai-card-body"),
  };
}

// Runs `mutate` (which rewrites the card body) between two height
// measurements and animates the mount between them, so loader → answer is
// the card growing rather than snapping to a new size. The incoming body
// fades up over the same curve so the text doesn't hard-cut.
function _swapCardBody(mountEl, mutate) {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const start = mountEl.getBoundingClientRect().height;
  mutate();
  if (reduce) return;

  const body = mountEl.querySelector(".ai-card-body");
  if (body) {
    body.classList.remove("ai-card-body--fresh");
    void body.offsetWidth; // reflow so a rapid second swap replays the fade
    body.classList.add("ai-card-body--fresh");
  }

  const end = mountEl.getBoundingClientRect().height;
  if (Math.abs(end - start) < 1) return;

  mountEl.style.overflow = "hidden";
  mountEl.style.height = `${start}px`;
  void mountEl.offsetWidth;
  mountEl.style.transition = "height 0.38s cubic-bezier(0.22, 1, 0.36, 1)";
  mountEl.style.height = `${end}px`;

  const cleanup = () => {
    mountEl.style.height = "";
    mountEl.style.overflow = "";
    mountEl.style.transition = "";
  };
  mountEl.addEventListener("transitionend", cleanup, { once: true });
  // Belt and braces: if the mount is detached mid-transition (user closes the
  // card, passage reloads) transitionend never fires and the inline height
  // would stick.
  setTimeout(cleanup, 600);
}

async function fetchInlineQuickContext(
  { book, chapter, verse, text },
  mountEl,
) {
  const { card, body } = _mountAICardShell(mountEl, { label: "Quick Context" });
  body.innerHTML = sparkleLoaderHTML("Quick context…");

  try {
    const aiText = await callGemini(`You are a Bible study assistant. Be extremely concise.

Explain ${book} ${chapter}:${verse} in exactly 2-3 short sentences. Start directly with the verse reference (e.g., "${book} ${chapter}:${verse} tells us..."). Cover what it means in context and why it matters. No headers, no bullet points, no fluff, no greetings — just the core insight.

IMPORTANT: Bold the key theological terms and important words using **double asterisks**.

"${text}"`);

    _swapCardBody(mountEl, () => {
      body.innerHTML = `<div class="ai-md-content">${mdToHTML(aiText)}</div>`;
      // Footer is appended to the existing card rather than rebuilt with it,
      // so the header and gradient never repaint.
      if (!card.querySelector(".inline-ai-dig-footer")) {
        const footer = document.createElement("div");
        footer.className = "inline-ai-dig-footer";
        footer.title = "Dig Deeper";
        footer.innerHTML =
          `<span class="material-icons">auto_awesome</span>` +
          `<span class="dig-footer-label">Dig Deeper</span>` +
          `<span class="material-icons chevron">chevron_right</span>`;
        footer.onclick = () => {
          fetchInlineDigDeeper({ book, chapter, verse, text }, mountEl);
        };
        card.appendChild(footer);
      }
    });
  } catch (err) {
    _swapCardBody(mountEl, () => {
      body.innerHTML = aiFailHTML("Quick context", err, () =>
        fetchInlineQuickContext({ book, chapter, verse, text }, mountEl));
    });
  }
}

async function toggleVerseChat(key, book, chapter, verse, text, mountEl) {
  if (mountEl.querySelector(".verse-chat-wrapper")) {
    const verseWrap = mountEl.closest?.(".verse");
    _collapsePanel(mountEl, verseWrap?.querySelector('[data-action="ask"]'), () => {
      mountEl.innerHTML = "";
      if (verseWrap) _syncVerseActionStates(verseWrap);
    });
    // Reset chat memory on close — user wants every reopen to start fresh
    // ("pag inopen ulit dapat refreshed"). Suggestions/followups too.
    delete verseChatHistories[key];
    if (window._chatSuggestions) delete window._chatSuggestions[key];
    if (window._chatFollowups) delete window._chatFollowups[key];
    return;
  }

  // Track suggestions and follow-ups per key.
  if (!window._chatSuggestions) window._chatSuggestions = {};
  if (!window._chatFollowups) window._chatFollowups = {};
  // History always starts empty on open (we wiped it on the previous close,
  // but be defensive in case the chat was first-opened in a stale path).
  verseChatHistories[key] = [];
  const hasHistory = false;


  // In the reader the chat wears the Quick Context card's header (label + ✕);
  // other surfaces (canvas, TTS pause, retell) have their own chrome.
  const inReader = !!mountEl.closest?.("#output .verse");
  mountEl.innerHTML = `
    <div class="verse-chat-wrapper">
      ${inReader ? `<div class="ai-card-header verse-chat-head"><span class="ai-card-label">Ask</span><button class="ai-card-close" title="Close">✕</button></div>` : ""}
      <div class="chat-history${hasHistory ? "" : " hidden"}" id="chat-hist-${key}"></div>
      <div id="chat-empty-${key}" class="${hasHistory ? "hidden" : ""}">
        <div class="chat-empty-state">
          <span class="material-icons">chat_bubble_outline</span>
          <span class="chat-empty-text">Ask anything about this verse</span>
          <div class="chat-suggestions" id="chat-suggest-${key}">
            ${sparkleLoaderHTML('Loading questions…')}
          </div>
        </div>
      </div>
      <div id="chat-followups-${key}" class="chat-followups" style="display:none"></div>
      <div id="chat-typing-${key}" class="chat-typing" style="display:none">
        ${sparkleLoaderHTML('Thinking…')}
      </div>
      <div class="chat-input-area">
        <textarea placeholder="Ask about this verse..." id="chat-input-${key}"></textarea>
        <button class="chat-send-btn" id="chat-send-${key}"><span class="material-icons">send</span></button>
      </div>
    </div>
  `;
  mountEl.querySelector(".verse-chat-head .ai-card-close")?.addEventListener("click", (e) => {
    e.stopPropagation();
    mountEl.closest(".verse")?.querySelector('[data-action="ask"]')?.click();
  });

  const input = document.getElementById(`chat-input-${key}`);
  const sendBtn = document.getElementById(`chat-send-${key}`);
  const histEl = document.getElementById(`chat-hist-${key}`);
  const emptyEl = document.getElementById(`chat-empty-${key}`);
  const suggestEl = document.getElementById(`chat-suggest-${key}`);
  const followupsEl = document.getElementById(`chat-followups-${key}`);
  const typingEl = document.getElementById(`chat-typing-${key}`);

  // Render existing history if any
  if (hasHistory) {
    renderChatHistory(key, histEl);
    // Show follow-ups if we have them
    if (window._chatFollowups[key]?.length) {
      renderFollowups(key);
    }
  }

  // Update send button active state
  const updateSendState = () => {
    sendBtn.classList.toggle('active', !!input.value.trim());
  };
  input.addEventListener('input', updateSendState);

  // Fetch suggested questions
  if (!hasHistory) {
    fetchSuggestedQuestions(book, chapter, verse, text, key, suggestEl);
  }

  async function fetchSuggestedQuestions(bk, ch, v, vt, k, el) {
    try {
      const raw = await callGemini(`Generate 4 unique, thought-provoking questions someone might ask about ${bk} ${ch}:${v}: "${vt}"

RULES:
- Questions should be specific to THIS verse, not generic.
- Focus on: real-life application, surprising insights, theological implications, emotional/relational angles.
- Do NOT ask about word meanings or historical context (those are covered elsewhere).
- Each question must be 1 short sentence, under 10 words.
- Return ONLY the 4 questions, one per line, no numbers, no bullets, no extra text.`);

      const questions = raw.split('\n').map(q => q.trim()).filter(q => q.length > 5).slice(0, 4);
      window._chatSuggestions[k] = questions;

      el.innerHTML = [...questions].filter(Boolean).map(q =>
        `<button class="chat-suggestion-chip${q === _IMAGE_CHIP_TEXT ? ' chat-img-chip' : ''}">${q}</button>`
      ).join('');

      el.querySelectorAll('.chat-suggestion-chip').forEach(chip => {
        chip.onclick = () => {
          const q = chip.textContent;
          window._chatFollowups[k] = questions.filter(s => s !== q);
          performSend(q);
        };
      });
    } catch {
      el.innerHTML = ['What does this verse mean?', 'How can I apply this today?'].filter(Boolean).map(q =>
        `<button class="chat-suggestion-chip${q === _IMAGE_CHIP_TEXT ? ' chat-img-chip' : ''}">${q}</button>`
      ).join('');
      el.querySelectorAll('.chat-suggestion-chip').forEach(chip => {
        chip.onclick = () => performSend(chip.textContent);
      });
    }
  }

  function renderFollowups(k) {
    const chips = window._chatFollowups[k] || [];
    if (!chips.length) { followupsEl.style.display = 'none'; return; }
    followupsEl.style.display = '';
    followupsEl.innerHTML = `<span class="chat-followups-label">Keep exploring</span>` +
      chips.map(q =>
        `<button class="chat-followup-chip">${q}</button>`
      ).join('');
    followupsEl.querySelectorAll('.chat-followup-chip').forEach(chip => {
      chip.onclick = () => {
        const q = chip.textContent;
        window._chatFollowups[k] = (window._chatFollowups[k] || []).filter(s => s !== q);
        performSend(q);
      };
    });
  }

  const performSend = async (questionOverride) => {
    const question = questionOverride || input.value.trim();
    if (!question) return;

    if (!verseChatHistories[key]) verseChatHistories[key] = [];
    verseChatHistories[key].push({ role: "user", text: question });
    input.value = "";
    updateSendState();

    // Hide empty state, show history
    emptyEl.classList.add("hidden");
    histEl.classList.remove("hidden");
    renderChatHistory(key, histEl);

    // Show typing indicator, hide follow-ups
    typingEl.style.display = '';
    followupsEl.style.display = 'none';
    histEl.scrollTop = histEl.scrollHeight;

    try {
      // Image generation request
      if (_isImageRequest(question)) {
        const isDefault = question === _IMAGE_CHIP_TEXT;
        const prompt = isDefault
          ? buildScenePrompt(book, chapter, verse, text.slice(0, 80))
          : `Scene from ${book} ${chapter}:${verse}. "${text.slice(0, 80)}". User request: ${question}. No text, no words, no letters in the image.`;
        const dataUrl = await callImageGen(prompt, "16:9");
        verseChatHistories[key].push({ role: "model", image: dataUrl, text: "" });
        typingEl.style.display = 'none';
        renderChatHistory(key, histEl);
        renderFollowups(key);
        return;
      }

      const historyStr = verseChatHistories[key].length > 1
        ? `HISTORY: ${JSON.stringify(verseChatHistories[key].slice(-5).map(m => m.image ? { role: m.role, text: "[generated image]" } : m))}`
        : '';

      // Push a streaming message placeholder so we can update it in place
      verseChatHistories[key].push({ role: "model", text: "", streaming: true });
      typingEl.style.display = 'none';
      renderChatHistory(key, histEl);

      const answer = await callGeminiStream(
        `You are a Bible study assistant. ${AI_TONE}

CONTEXT (for reference): ${book} ${chapter}:${verse} - "${text}"
${historyStr}

RULES:
- Be very concise (max 3 sentences).
- Answer the question directly and straightforwardly.
- Always reply in English, even when the question is in Tagalog or Taglish.
- Only relate your answer to the verse context if the question is clearly about the verse. If the question is general (e.g. about theology, history, a word meaning, or any topic), answer it on its own merits without forcing a verse connection.
- Stay youth-friendly and encouraging.
- Do NOT start with greetings like "Hey there!" or "Great question!" — start directly with the answer.
- Bold key theological terms using **double asterisks**.

QUESTION: ${question}`,
        (_delta, full) => {
          const msg = verseChatHistories[key][verseChatHistories[key].length - 1];
          if (msg && msg.streaming) {
            msg.text = full;
            renderChatHistory(key, histEl);
            histEl.scrollTop = histEl.scrollHeight;
          }
        }
      );

      const lastMsg = verseChatHistories[key][verseChatHistories[key].length - 1];
      if (lastMsg) {
        lastMsg.text = answer;
        delete lastMsg.streaming;
      }
      if (verseChatHistories[key].length > 10) verseChatHistories[key].shift();

      renderChatHistory(key, histEl);
      renderFollowups(key);
    } catch (err) {
      console.error("[Verse Chat Error]", err);
      typingEl.style.display = 'none';
      verseChatHistories[key].push({ role: "model", text: aiFailText("Chat", err) });
      renderChatHistory(key, histEl);
    }
  };

  sendBtn.onclick = () => performSend();
  input.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      performSend();
    }
  };
}

function renderChatHistory(key, container) {
  const history = verseChatHistories[key] || [];
  // While a streaming bubble is still empty, show the sparkle loader inside
  // it. As soon as the first chunk of text lands, it swaps to the text.
  const botBubbleHTML = (msg) => {
    if (msg.text) {
      return msg.text
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>');
    }
    return msg.streaming ? sparkleLoaderHTML('Thinking…') : '';
  };

  const renderMsg = (msg) => {
    const div = document.createElement('div');
    if (msg.role === 'user') {
      div.className = 'chat-msg user chat-msg-new';
      div.innerHTML = msg.text;
    } else if (msg.image) {
      div.className = 'chat-msg bot chat-msg-new';
      div.innerHTML = `<img src="${msg.image}" class="chat-gen-img" alt="Generated scene">`;
    } else {
      div.className = 'chat-msg bot' + (msg.streaming ? '' : ' chat-msg-new');
      div.innerHTML = botBubbleHTML(msg);
    }
    return div;
  };

  // Append newly-arrived messages
  const existing = container.children.length;
  for (let i = existing; i < history.length; i++) {
    container.appendChild(renderMsg(history[i]));
  }

  // If the last message is streaming, update its DOM in place each tick
  // instead of rebuilding the whole list — keeps the typing animation smooth.
  const last = history[history.length - 1];
  if (last && last.streaming && container.lastElementChild) {
    container.lastElementChild.innerHTML = botBubbleHTML(last);
  }

  container.scrollTop = container.scrollHeight;
}

// Image generation in verse chat disabled — was a Gemini image-API cost driver.
const _IMAGE_CHIP_TEXT = null;
function _isImageRequest() { return false; }

function _digDeeperEffectsHTML() {
  return `<span class="dig-spark ds1 material-icons">auto_awesome</span>
    <span class="dig-spark ds2 material-icons">auto_awesome</span>
    <span class="dig-spark ds3 material-icons">auto_awesome</span>
    <span class="dig-spark ds4 material-icons">auto_awesome</span>
    <span class="dig-spark ds5 material-icons">auto_awesome</span>
    <span class="dig-spark ds6 material-icons">auto_awesome</span>
    <span class="dig-spark ds7 material-icons">auto_awesome</span>
    <span class="dig-spark ds8 material-icons">auto_awesome</span>
    <div class="dig-orbit do1"></div>
    <div class="dig-orbit do2"></div>`;
}

async function fetchInlineDigDeeper({ book, chapter, verse, text }, mountEl) {
  // One shell, built once. This used to write the same markup twice in a row
  // — loader shell, then an identical shell with a stream target — which was
  // a wasted teardown before the request had even started.
  // Swapping the Quick Context card for this one is a genuine rebuild (new
  // label, new background effects), so it rides the same height animation
  // instead of snapping. The stream target is created up front and the loader
  // lives inside it, overwritten by the first streamed chunk.
  let shell;
  _swapCardBody(mountEl, () => {
    shell = _mountAICardShell(mountEl, {
      label: "Dig Deeper",
      extraClass: "dig-deeper",
      effectsHTML: _digDeeperEffectsHTML(),
    });
    shell.body.innerHTML =
      `<div class="ai-md-content" id="dig-deeper-stream">${sparkleLoaderHTML('Digging deeper…')}</div>`;
  });
  const body = shell.body;

  const verseText = text || '';

  try {
    const streamEl = mountEl.querySelector('#dig-deeper-stream');

    await callGeminiStream(
      `You are a premium Bible study tool. ${AI_TONE}

${book} ${chapter}:${verse}: "${verseText}"

Give a dense, high-value word study. NO fluff. Every word must earn its place. ~120 words total.

#### Original Language
- **English Word** — Greek/Hebrew script (transliteration, pronunciation) — meaning. Max 2-3 key words.
- Example format: **Word** — λόγος (logos, LOH-goss) — reason, divine utterance.

#### Deeper Meaning
- 2 sharp insights. Connect to broader theology. One sentence each.

#### Cross-References
- 3 verses max. **Reference** — one-line why it matters.

#### Takeaway
- One powerful sentence for real life. Make it hit.

STRICT: No greetings. No "this verse tells us". No padding. Start with #### Original Language immediately.`,
      (_delta, full) => {
        streamEl.innerHTML = mdToHTML(full);
      }
    );

  } catch (err) {
    console.error(err);
    _swapCardBody(mountEl, () => {
      body.innerHTML = aiFailHTML("Deeper context", err, () =>
        fetchInlineDigDeeper({ book, chapter, verse, text }, mountEl));
    });
  }
}

/* ---------- PASSAGE TITLE ---------- */
function updatePassageTitle() {
  const book = bookEl.options[bookEl.selectedIndex]?.text || "";
  const chapter = chapterEl.value;
  const verse = verseEl.value;

  let title = `${book} ${chapter}`;
  if (verse) title += `:${verse}`;

  passageTitleEl.textContent = title;
  summaryTitleEl.textContent = title;
}

/* ---------- UX MODE ---------- */
const verseCtrl = verseEl.closest(".control");

verseEl.onchange = () => {
  updateControlStates();
  updatePassageTitle();
  renderSummary();
};

function updateControlStates() {
  document.querySelectorAll(".control").forEach((c) => {
    const field = c.querySelector("input, select");
    c.classList.toggle("has-value", !!field?.value);
  });
}

// NEW: Helper to format key back to human-readable reference
const formatKey = (key) => {
  const [bookId, chapter, verse] = key.split("-");
  const bookName = BIBLE_META[bookId]?.name || bookId;
  return `${bookName} ${chapter}${verse ? ":" + verse : ""}`;
};

// Open daily story without navigating away from dashboard
async function _openDailyStory(bookKey, ch) {
  const bookName = BIBLE_META[bookKey]?.name;
  if (!bookName) return;

  // Ensure bible data is loaded
  if (!bibleData) await fetchBibleData();

  const bookContent = bibleData[bookName.toUpperCase()];
  if (!bookContent || !bookContent[ch]) return;

  // Build versesText from the chapter data
  const chapterData = bookContent[ch];
  const versesText = Object.entries(chapterData)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    .map(([v, text]) => `${v}. ${normalizeVerseText(text)}`)
    .join("\n");

  // Temporarily set __aiPayload so the story modal can use it
  const prevPayload = window.__aiPayload;
  window.__aiPayload = { book: bookName.toUpperCase(), chapter: String(ch), versesText };

  // Temporarily set selects for markStorySeen
  const prevBook = bookEl.value;
  const prevCh = chapterEl.value;
  bookEl.value = bookKey;
  loadChapters();
  chapterEl.value = ch;

  // Store restore info — will be cleaned up when story/reflect modal closes
  window._dailyStoryRestore = {
    prevPayload,
    prevBook,
    prevCh,
  };

  await openStoryModal();
}

function loadPassageById(id, scrollToVerse) {
  const [bookId, chapter, verse] = id.split("-");

  // Set the select elements
  bookEl.value = bookId;
  loadChapters();
  chapterEl.value = chapter;
  loadVerses();

  // Always load full chapter, then scroll to the verse
  const targetVerse = scrollToVerse || verse;
  verseEl.value = "";

  // Trigger load then scroll to the verse
  loadBtn.click();

  if (targetVerse) {
    // Wait for rendering to finish, then scroll
    requestAnimationFrame(() => {
      setTimeout(() => {
        const verseEl2 = document.getElementById(targetVerse);
        if (verseEl2) {
          verseEl2.scrollIntoView({ behavior: "smooth", block: "center" });
          verseEl2.classList.add("verse-highlight");
          setTimeout(() => verseEl2.classList.remove("verse-highlight"), 5000);
        }
      }, 300);
    });
  }
}

function dashNoteGoToVerse(verseKey, verseNum) {
  const [bookId, chapter] = verseKey.split("-");
  bookEl.value = bookId;
  loadChapters();
  chapterEl.value = chapter;
  loadVerses();
  verseEl.value = "";
  loadBtn.click();

  requestAnimationFrame(() => {
    setTimeout(() => {
      const verseEl2 = document.getElementById(verseNum);
      if (verseEl2) {
        verseEl2.scrollIntoView({ behavior: "smooth", block: "center" });
        verseEl2.classList.add("verse-highlight");
        setTimeout(() => verseEl2.classList.remove("verse-highlight"), 5000);
        // Auto-open the note section for this verse
        const wrap = verseEl2.closest(".verse");
        if (wrap) {
          const commentsEl = wrap.querySelector(".comments");
          if (commentsEl) {
            commentsEl.hidden = false;
            renderComments(verseKey, commentsEl);
          }
        }
      }
    }, 400);
  });
}

function dashNoteGoToReflection(passageKey) {
  const [bookId, chapter] = passageKey.split("-");
  bookEl.value = bookId;
  loadChapters();
  chapterEl.value = chapter;
  loadVerses();
  verseEl.value = "";
  loadBtn.click();

  // Wait for passage + reflections to load, then open reflect modal
  requestAnimationFrame(() => {
    setTimeout(() => openReflectModal(), 600);
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

// ── Dashboard Clock (Philippine Time) ────────────────────────────────────────
let _dashClockTimer = null;
function _startDashClock() {
  _updateDashClock();
  _dashClockTimer = setInterval(_updateDashClock, 15000); // update every 15s
}
function _stopDashClock() {
  if (_dashClockTimer) { clearInterval(_dashClockTimer); _dashClockTimer = null; }
}
function _updateDashClock() {
  const el = document.getElementById("dashClock");
  if (!el) return;
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  const h = now.getHours();
  const m = now.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  const mm = String(m).padStart(2, "0");
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  const monthDay = now.toLocaleDateString("en-US", { month: "long", day: "numeric" }).toUpperCase();
  el.innerHTML = `<span class="dash-clock-day">${weekday}</span><span class="dash-clock-date">${monthDay}</span><span class="dash-clock-row"><span class="dash-clock-time">${h12}:${mm}</span><span class="dash-clock-ampm">${ampm}</span></span>`;
}

// Renamed and updated from showLanding to showDashboard
async function showDashboard() {
  stopTTS(); // always stop audio when returning to dashboard

  if (!bibleData) {
    await fetchBibleData();
  }

  // lockAppScroll(true); // FIX: Removed to allow dashboard scrolling on mobile
  document.querySelector(".summary").style.display = "none";

  passageTitleEl.hidden = true;
  toggleReflectionBtn.hidden = true;
  summaryTitleEl.hidden = true;
  document.getElementById("storyReflectRow")?.classList.add("hidden");
  homeBtn.style.display = "none"; // HIDE HOME BUTTON ON DASHBOARD
  const dashBrandRow = document.getElementById("dashBrandRow");
  if (dashBrandRow) dashBrandRow.hidden = false;
  _startDashClock();

  favoritesPage = 0;

  aiContextSummaryEl.innerHTML = "";
  const reflection = document.getElementById("aiReflection");
  if (reflection) {
    reflection.innerHTML = "";
    reflection.style.display = "none";
  }
  summaryEl.innerHTML = "";
  copyNotesBtn.style.display = "none";

  // Display loading state first
  output.innerHTML = `
    <div class="landing">
      <div class="landing-card">
        <h2>Loading Dashboard...</h2>
      </div>
    </div>
  `;

  // Ensure layout is unset for dashboard view to allow vertical scrolling
  document.querySelector(".layout").classList.add("layout-unset");

  await renderDashboard();
  _playViewAnim(output, "view-enter");
}

function getVerseText(bookId, chapter, verse) {
  const bookName = BIBLE_META[bookId]?.name.toUpperCase();
  const bookData = bibleData?.[bookName];
  if (!bookData || !bookData[chapter]) return "Verse text not found.";

  const chapterData = bookData[chapter];
  // Regex to fix ".Word" -> ". Word"
  const clean = normalizeVerseText;

  if (chapterData[verse]) return clean(chapterData[verse]);

  const rangeKey = Object.keys(chapterData).find((k) => {
    if (!k.includes("-")) return false;
    const [start, end] = k.split("-").map(Number);
    const v = Number(verse);
    return v >= start && v <= end;
  });

  return rangeKey ? clean(chapterData[rangeKey]) : "Verse text not found.";
}

async function renderDashboard() {
  const favoritesKeys = Object.keys(favorites).sort(
    (a, b) => favorites[b] - favorites[a],
  );

  // 1. Get favorite passages data (UPDATED)
  const allFavoritePassages = favoritesKeys.map((key) => {
    const [bookId, chapter, verse] = key.split("-");
    const verseToFetch = verse || "1"; // Default to verse 1 if chapter selected
    const verseText = getVerseText(bookId, chapter, verseToFetch);
    return {
      key,
      verseText,
      time: favorites[key],
    };
  });

  const startFavIndex = favoritesPage * FAV_PAGE_SIZE;
  const endFavIndex = startFavIndex + FAV_PAGE_SIZE;
  const favoritePassages = allFavoritePassages.slice(
    startFavIndex,
    endFavIndex,
  );

  const totalFavPages = Math.ceil(allFavoritePassages.length / FAV_PAGE_SIZE);

  // 1. Get recent notes (from localStorage)
  let recentNotes = [];

  Object.entries(comments).forEach(([key, list]) => {
    if (list && list.length) {
      const [bookId, chapter, verse] = key.split("-");
      const verseToFetch = verse || "1";
      const verseText = getVerseText(bookId, chapter, verseToFetch);

      // Push EVERY note in the list to the recentNotes array
      list.forEach((note) => {
        recentNotes.push({
          key,
          latestNoteTime: note.time, // Using the individual note time
          noteText: note.text, // Using the individual note text
          verseText,
        });
      });
    }
  });

  // Sort globally so the absolute newest notes appear first
  recentNotes.sort((a, b) => b.latestNoteTime - a.latestNoteTime);

  // 2. Get reflection answer counts and actual Q&A from localStorage (UPDATED TO REMOVE IDB DEPENDENCY)
  const reflectionPassages = {}; // Store { passageId: { QAs: ["Q:...\nA:...", ...], keys: ["reflection-JHN-1-1-0", ...], latestTime: 0 } }

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith("reflection-")) {
      const reflectionIdParts = key.split("-");
      // The structure is reflection-B-C-V-INDEX. The passage ID is B-C-V.
      // Note: Passage ID here is B-C-V if single verse, or B-C- if whole chapter
      const passageId = reflectionIdParts.slice(1, 4).join("-");

      const rawValue = localStorage.getItem(key);
      const answer = rawValue.split("\nA: ")[1]?.trim() || "";

      if (answer.length > 0) {
        if (!reflectionPassages[passageId]) {
          reflectionPassages[passageId] = { QAs: [], keys: [] };
        }
        reflectionPassages[passageId].QAs.push(rawValue); // Store the full Q&A string
        reflectionPassages[passageId].keys.push(key);
        // NOTE: Since the only timestamp is on 'comment' entries, and we cannot use IDB,
        // we can't reliably sort reflection passages by time. We'll simply list them.
      }
    }
  }

  // 3. Prepare recent reflections data structure
  let recentReflections = Object.keys(reflectionPassages).map((passageId) => {
    const data = reflectionPassages[passageId];
    return {
      id: passageId,
      // Since no reliable timestamp is available, we use the average time of the notes
      // to try and guess the correct order, falling back to 0 if no notes exist.
      // Fallback to 0 if no notes, relying on JS object key insertion order otherwise (unreliable but necessary without proper data).
      updatedAt:
        recentNotes.find((n) => n.key.startsWith(passageId))?.latestNoteTime ||
        0,
      reflectionCount: data.QAs.length,
      QAs: data.QAs,
    };
  });

  // Sort by the best available proxy time
  recentReflections.sort((a, b) => b.updatedAt - a.updatedAt);

  // Clean up the updatedAt proxy if it was 0 for better visual presentation in dashboard
  recentReflections = recentReflections.map((r) => ({
    ...r,
    updatedAt: r.updatedAt || Date.now(), // Fallback to current time if 0, so it displays something
  }));

  // Game-feel ambient layer: floating pink motes drifting up across the
  // dashboard area + twinkling sparkles scattered behind. Generated once per
  // dashboard render with randomized CSS custom properties so each particle
  // has its own duration/delay/path. All behind prefers-reduced-motion so
  // users with that OS setting see a still page.
  const moteCount = 18;
  const twinkleCount = 10;
  const motesHTML = Array.from({ length: moteCount }, () => {
    const x = Math.random() * 100;
    const dur = 9 + Math.random() * 12;       // 9–21s
    const delay = -(Math.random() * 20);       // start mid-flight so the field is full from t=0
    const scale = 0.55 + Math.random() * 0.95; // 0.55–1.5
    const opacity = 0.18 + Math.random() * 0.42;
    const drift = (Math.random() - 0.5) * 40;  // ±20px lateral drift
    return `<span class="dash-ambient-mote" style="--m-x:${x}%;--m-d:${dur}s;--m-l:${delay}s;--m-s:${scale};--m-o:${opacity};--m-drift:${drift}px"></span>`;
  }).join("");
  const twinklesHTML = Array.from({ length: twinkleCount }, () => {
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const dur = 3 + Math.random() * 4;         // 3–7s
    const delay = -(Math.random() * 6);
    const scale = 0.6 + Math.random() * 0.9;
    return `<span class="dash-twinkle" style="--t-x:${x}%;--t-y:${y}%;--t-d:${dur}s;--t-l:${delay}s;--t-s:${scale}"></span>`;
  }).join("");

  const dashboardHTML = `
  <div class="dashboard ai-fade-in">

  <div class="dash-ambient" aria-hidden="true">${motesHTML}</div>
  <div class="dash-twinkles" aria-hidden="true">${twinklesHTML}</div>

  <div class="dash-greeting">
    <div class="dash-greeting-top">
      <div class="dash-greeting-text">${(() => { const h = new Date().getHours(); const g = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; const name = getUserName(); return name ? `${g}, ${name}!` : g; })()}</div>
      <button class="dash-name-edit-btn" onclick="_showNamePrompt(() => renderDashboard())" title="Edit name"><span class="material-icons">edit</span></button>
    </div>
    <div id="dashGreetingMsg" class="dash-greeting-msg"></div>
    <div class="dash-journal-row">
      <button type="button" id="dashGratLink" class="dash-journal-link dash-journal-link--grat dash-journal-link-empty" onclick="openGratitudeJournal()">
        <span class="material-symbols-outlined">favorite</span>
        <span>Gratitude journal</span>
        <span id="dashGratCount" class="dash-journal-count"></span>
        <span class="material-symbols-outlined dash-journal-arrow">arrow_forward</span>
      </button>
      <button type="button" id="dashPrayLink" class="dash-journal-link dash-journal-link--pray dash-journal-link-empty" onclick="openPrayersJournal()">
        <span class="material-symbols-outlined">volunteer_activism</span>
        <span>Prayers</span>
        <span id="dashPrayCount" class="dash-journal-count"></span>
        <span class="material-symbols-outlined dash-journal-arrow">arrow_forward</span>
      </button>
    </div>
  </div>

  ${/* Daily featured story removed — was driving image-gen costs. */ ""}

  <div class="dashboard-grid">

      <!-- CONTINUE READING + FAVORITES -->
      <section class="dashboard-section">

        <div id="continue-reading" class="hidden">
          <h3><span><span class="material-icons dashboard-icon dashboard-icon--book">book</span> Pick up where you left off</span></h3>
          <button class="dash-continue-btn" onclick="loadPassageById('${recentPassageId}')" aria-label="Resume ${recentPassage}">
            <div class="dash-continue-text">
              <span class="dash-continue-ref">${recentPassage}</span>
              <div id="dashContinueRecap" class="dash-continue-recap"></div>
            </div>
            <span class="material-icons dash-continue-chev">arrow_forward</span>
          </button>
        </div>

        <div id="dashFavoritesContent">${_renderFavoritesContent(allFavoritePassages)}</div>
      </section>

      <!-- NOTES -->
      <section class="dashboard-section">
        <h3 style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <span><span class="material-icons dashboard-icon dashboard-icon--notes">edit_note</span> Notes</span>
          <button class="dash-notes-open-btn" onclick="openNotesApp()">View all →</button>
        </h3>
        ${(() => {
          const allNotes = _getAllNotes()
            .filter(n => n.preview)
            .sort((a, b) => (b.time || 0) - (a.time || 0))
            .slice(0, 5);
          if (!allNotes.length) return `<p class="empty-state">No notes yet. Add notes to Bible verses, complete a Guided Reflection, or tap "View all" to write your first note.</p>`;
          // Only show the type label when the visible set contains both
          // reflections and verse notes — otherwise every row carries the same
          // tag and it reads as visual noise.
          const types = new Set(allNotes.map(n => n.type));
          const showTypeLabel = types.size > 1;
          return `<div class="dash-notes-list">${allNotes.map(n => {
            // Pass a generous upper bound; the actual visual ellipsis is done
            // by CSS line-clamp on .dash-notes-card-preview, which adapts to
            // the card's real width — narrow on mobile, much wider on desktop.
            const preview = n.preview.length > 400 ? n.preview.slice(0, 400) + "…" : n.preview;
            const dateStr = n.time ? new Date(n.time).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
            const label = showTypeLabel
              ? `<span class="dash-notes-type-label">${n.type === "reflection" ? "Reflection" : "Verse note"}</span>`
              : "";
            let onclick = `openNotesApp()`;
            if (n.type === "verse" && n.verseKeys?.length) {
              const firstKey = n.verseKeys.sort((a,b) => {
                const va = parseInt(a.split("-")[2] || "1"), vb = parseInt(b.split("-")[2] || "1");
                return va - vb;
              })[0];
              const verseNum = firstKey.split("-")[2] || "";
              onclick = `dashNoteGoToVerse('${_escHtml(firstKey)}', '${_escHtml(verseNum)}')`;
            } else if (n.type === "reflection" && n.passageKey) {
              onclick = `dashNoteGoToReflection('${_escHtml(n.passageKey)}')`;
            }
            return `<div class="dash-notes-card" onclick="${onclick}">
              <div class="dash-notes-card-date">${dateStr}${label}</div>
              <div class="dash-notes-card-preview">${_escHtml(preview)}</div>
            </div>`;
          }).join("")}</div>`;
        })()}
      </section>

      ${/* "Create & Share" removed — opened the AI image creator. */ ""}

      ${/* Daily Reminder section removed — it relied on Cloud Scheduler + Gemini personalization. */ ""}
      </div>
      </div>
      `;

  output.innerHTML = dashboardHTML;

  // Every async cell on the dashboard is collected here so the boot sequence
  // (js/11-boot.js) can hold the splash screen until the page is actually
  // filled in — no half-populated dashboard flashing loaders on first paint.
  // Each job is wrapped so one failure can't reject the group; the splash
  // also has its own hard deadline, so a slow cell delays but never blocks.
  const dashJobs = [];
  const track = (p) => { if (p && typeof p.then === "function") dashJobs.push(p.catch(() => {})); };

  if (recentPassageId) {
    document.getElementById("continue-reading")?.classList.remove("hidden");
    track(loadDashContinueRecap());
  }

  track(loadDashGreetingMsg());
  _refreshGratitudeJournalLink();
  _refreshPrayersJournalLink();

  // Web fonts too — the dashboard leans on "Editors Note" for the refs, and
  // revealing before it resolves shows a fallback serif that then swaps.
  if (document.fonts?.ready) track(document.fonts.ready);

  // Published, NOT returned/awaited — showDashboard() awaits renderDashboard(),
  // and the home button shouldn't sit on a blank frame waiting for AI cells.
  // Only the boot splash cares about this promise.
  window.__dashboardReady = Promise.all(dashJobs);
}

function _typewriterReveal(el, msg) {
  el.textContent = "";
  const cursor = document.createElement("span");
  cursor.className = "dash-greeting-cursor";
  el.appendChild(cursor);
  let i = 0;
  const type = () => {
    if (cursor.parentNode !== el) return; // el was replaced, bail out
    if (i < msg.length) {
      el.insertBefore(document.createTextNode(msg[i++]), cursor);
      setTimeout(type, 32);
    } else {
      setTimeout(() => cursor.remove(), 600);
    }
  };
  type();
}

async function _loadDashFeaturedImage() {
  const card = document.getElementById("dashFeaturedStory");
  const bg = document.getElementById("dashFeaturedBg");
  if (!card || !bg) return;
  const bookName = card.dataset.bookName;
  const ch = card.dataset.ch;
  const prompt = buildScenePrompt(bookName, ch, null, "Overview scene of the entire chapter");
  try {
    const dataUrl = await callImageGen(prompt, "21:9");
    bg.style.backgroundImage = `url(${dataUrl})`;
    bg.classList.add("dash-featured-bg-loaded");
  } catch {}
}

// Short AI recap rendered under the "Pick up where you left off" ref. Cached
// by passage id in localStorage under the `passageRecap-` prefix — that prefix
// is in firebase-sync.js's SYNC_DYNAMIC_PREFIXES, so for Charlie the cache
// rides the existing localStorage→RTDB mirror and the same recap shows up on
// every device. For other users it's just plain localStorage.
async function loadDashContinueRecap() {
  const el = document.getElementById("dashContinueRecap");
  if (!el || !recentPassageId) return;

  const cacheKey = `passageRecap-${recentPassageId}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    el.textContent = cached;
    el.classList.add("dash-continue-recap-ready");
    return;
  }

  // Offline: nothing to show and nothing to wait for — the recap is optional.
  if (navigator.onLine === false) { el.textContent = ""; return; }

  // Cache miss — show subtle dim loader, then fetch.
  el.innerHTML = `<span class="dash-continue-recap-loader"><span class="rdot"></span><span class="rdot"></span><span class="rdot"></span></span>`;

  const refLabel = recentPassage || recentPassageId;
  const prompt = `Write ONE short, casual sentence (max 18 words) recapping what ${refLabel} is about, written for someone returning to it. No "this chapter" preamble — start with the substance. Reply with ONLY the sentence, no quotes, no emojis.`;

  try {
    const res = await aiFetch(GEMINI_PROXY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: "summary", contents: [{ parts: [{ text: prompt }] }] }),
    });
    const data = await res.json();
    const msg = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (msg && document.getElementById("dashContinueRecap") === el) {
      localStorage.setItem(cacheKey, msg);
      el.textContent = msg;
      el.classList.add("dash-continue-recap-ready");
    } else if (document.getElementById("dashContinueRecap") === el) {
      el.textContent = "";
    }
  } catch {
    if (document.getElementById("dashContinueRecap") === el) el.textContent = "";
  }
}

async function loadDashGreetingMsg() {
  const el = document.getElementById("dashGreetingMsg");
  if (!el) return;

  const name = getUserName();
  const h = new Date().getHours();
  const timeOfDay = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  // One AI generation per (user, day, time-of-day) bucket. The greeting
  // doesn't need to refresh on every dashboard render — those fire any time
  // Firebase pushes a remote update, and a fresh prompt every time costs
  // tokens AND looks twitchy. Bucket key changes ~3x/day.
  const cacheKey = `${name}::${today}::${timeOfDay}`;

  let cachedMsg = "";
  let cacheHit = false;
  try {
    const raw = localStorage.getItem("dashGreetingCacheV2");
    if (raw) {
      const obj = JSON.parse(raw);
      cachedMsg = obj.msg || "";
      cacheHit = obj.key === cacheKey && !!cachedMsg;
    }
  } catch {}

  // Cache hit → render and stop. No network, no typewriter (avoid re-animating
  // on every renderDashboard tick).
  if (cacheHit) {
    el.textContent = cachedMsg;
    el.style.opacity = "";
    return;
  }

  // Offline: keep yesterday's greeting (or none) rather than loading dots that
  // can't resolve.
  if (navigator.onLine === false) {
    el.textContent = cachedMsg;
    el.style.opacity = "";
    return;
  }

  // Cache miss → show stale msg dimmed (or loading dots) while we fetch.
  if (cachedMsg) {
    el.textContent = cachedMsg;
    el.style.opacity = "0.4";
  } else {
    el.innerHTML = `<span class="dash-greeting-glow-loader"><span class="gdot"></span><span class="gdot"></span><span class="gdot"></span></span>`;
  }

  // 2026-08-13: this used to pass _getRecentNotesContext() — the first 300
  // chars of recent reflections and notes — so the greeting could reference
  // something personal. Dropped when the proxy moved to a free-tier Gemini
  // key: free tier does NOT carry the paid tier's exclusion from training, and
  // reflections/notes are the most personal thing in the app. The greeting is
  // ambient dashboard chrome; it isn't worth sending private journalling to a
  // training-eligible endpoint for. Only the name and time of day go out now.
  //
  // If we ever return to a paid key, restore the notes branch — don't
  // reintroduce it while GEMINI_API_KEY points at a billing-free project.
  const prompt = `Write ONE warm greeting sentence (max 15 words) for ${name || "a friend"} opening a Bible app this ${timeOfDay}. Casual, caring, like a friend. No emojis, no guilt. Reply with ONLY the sentence.`;

  try {
    const res = await aiFetch(GEMINI_PROXY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: "summary", contents: [{ parts: [{ text: prompt }] }] }),
    });
    const data = await res.json();
    const msg = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (msg) {
      localStorage.setItem("dashGreetingCacheV2", JSON.stringify({ msg, key: cacheKey }));
      if (document.getElementById("dashGreetingMsg") === el) {
        el.style.opacity = "";
        _typewriterReveal(el, msg);
      }
    } else if (cachedMsg) {
      el.style.opacity = "";
    } else if (document.getElementById("dashGreetingMsg") === el) {
      el.textContent = ""; // empty reply: don't leave the loading dots up forever
    }
  } catch {
    // Keep showing cached if fetch fails
    if (cachedMsg) { el.style.opacity = ""; }
    else el.textContent = "";
  }
}

// Build the favorites section HTML. Pure function — takes the precomputed
// allFavoritePassages list, reads the global favoritesPage, returns markup.
// Used by both renderDashboard (initial render) and changeFavoritesPage
// (swap-in-place so prev/next doesn't trigger the dashboard's fade-in
// animation on every click).
function _renderFavoritesContent(allFavoritePassages) {
  const total = allFavoritePassages.length;
  const lastPage = Math.max(0, Math.ceil(total / FAV_PAGE_SIZE) - 1);
  if (favoritesPage > lastPage) favoritesPage = lastPage; // guard
  const start = favoritesPage * FAV_PAGE_SIZE;
  const pageItems = allFavoritePassages.slice(start, start + FAV_PAGE_SIZE);
  const showNav = total > FAV_PAGE_SIZE;
  const header = `
    <h3 style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <span><span class="material-icons dashboard-icon dashboard-icon--fav">favorite</span> Favorites</span>
      ${showNav ? `<div class="dash-fav-nav" aria-label="Favorites pagination">
        <button class="dash-fav-nav-btn" onclick="changeFavoritesPage(-1)" aria-label="Previous favorites"${favoritesPage <= 0 ? ' disabled' : ''}><span class="material-icons">chevron_left</span></button>
        <span class="dash-fav-nav-page">${favoritesPage + 1}/${lastPage + 1}</span>
        <button class="dash-fav-nav-btn" onclick="changeFavoritesPage(1)" aria-label="Next favorites"${favoritesPage >= lastPage ? ' disabled' : ''}><span class="material-icons">chevron_right</span></button>
      </div>` : ""}
    </h3>`;
  const body = total
    ? `<div class="dash-fav-list">
        ${pageItems.map((item) => {
          const ref = formatKey(item.key);
          const raw = (item.verseText || "").replace(/\s+/g, " ").trim();
          const preview = raw && raw !== "Verse text not found."
            ? (raw.length > 110 ? raw.slice(0, 110) + "…" : raw)
            : "";
          return `<div class="dash-fav-row" onclick="loadPassageById('${item.key}')">
            <div class="dash-fav-row-ref">${ref}<span class="material-icons dash-fav-row-chev">chevron_right</span></div>
            ${preview ? `<div class="dash-fav-row-text">${_escHtml(preview)}</div>` : ""}
          </div>`;
        }).join("")}
      </div>`
    : `<p class="empty-state">No favorite verses yet. Double-click a verse or tap the <span class="material-icons" style="font-size:1em; vertical-align:middle; color:#c83086;">favorite_border</span> icon to add one!</p>`;
  return header + body;
}

function changeFavoritesPage(delta) {
  favoritesPage = Math.max(0, favoritesPage + delta);
  // Swap only the favorites section's content — re-rendering the whole
  // dashboard would re-fire the section fade-in animations, which is jarring
  // on what should feel like a tiny pagination interaction.
  const mount = document.getElementById("dashFavoritesContent");
  if (!mount) { renderDashboard(); return; } // fallback if dashboard not visible
  const allFavoritePassages = Object.keys(favorites)
    .sort((a, b) => favorites[b] - favorites[a])
    .map((key) => {
      const [bookId, chapter, verse] = key.split("-");
      const verseToFetch = verse || "1";
      return { key, verseText: getVerseText(bookId, chapter, verseToFetch), time: favorites[key] };
    });
  mount.innerHTML = _renderFavoritesContent(allFavoritePassages);
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

  if (!output.querySelector(".dashboard")) {
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
  document.querySelector(".layout").classList.remove("layout-unset");
  showLoading();
  lockAppScroll(false);
  updatePassageTitle();
  document.querySelector(".summary").style.display = "block";

  passageTitleEl.hidden = false;
  toggleReflectionBtn.hidden = false;
  summaryTitleEl.hidden = false;
  homeBtn.style.display = "inline-flex"; // SHOW HOME BUTTON
  const dashBrandRow2 = document.getElementById("dashBrandRow");
  if (dashBrandRow2) dashBrandRow2.hidden = true;
  _stopDashClock();

  try {
    titleForGemini = passageTitleEl.textContent;

    const bookId = bookEl.value;
    let bookName = BIBLE_META[bookId].name.toUpperCase();
    const chapterNum = chapterEl.value;
    const single = verseEl.value;

    recentPassageId = `${bookId}-${chapterNum}`;
    recentPassage = `${bookName} ${chapterNum}`;
    localStorage.setItem("recentPassageId", recentPassageId);
    localStorage.setItem("recentPassage", recentPassage);
    _debouncedPushSync();

    if (!bibleData) {
      await fetchBibleData();
    }

    /* ---------- GET LOCAL VERSES ---------- */
    const bookContent = bibleData[bookName];
    if (!bookContent) throw new Error(`Book ${bookName} not found in JSON.`);

    const chapterContent = bookContent[chapterNum];
    if (!chapterContent)
      throw new Error(`Chapter ${chapterNum} not found in ${bookName}.`);

    let verses = Object.entries(chapterContent).map(([vNum, text]) => ({
      book_id: bookId,
      chapter: Number(chapterNum),
      verse: vNum, // Keep as string (e.g. "1-4")
      text: normalizeVerseText(text),
    }));

    // Sort by numeric start so range keys like "1-4" don’t get pushed to the end
    // (JS Object.entries puts integer-like keys first, non-integer strings after)
    verses.sort((a, b) => parseInt(a.verse) - parseInt(b.verse));

    // Logic to filter single verse including range overlap
    if (single) {
      verses = verses.filter((v) => {
        if (v.verse == single) return true;
        if (v.verse.includes("-")) {
          const [start, end] = v.verse.split("-").map(Number);
          return +single >= start && +single <= end;
        }
        return false;
      });
    }

    // Generate Payload for AI before filtering for single verse
    const fullVersesText = verses
      .map((v) => `${v.verse}. ${v.text}`)
      .join("\n");

    window.__aiPayload = {
      book: bookName,
      chapter: chapterNum,
      isSingle: single,
      versesText: single
        ? verses.map((v) => `${v.verse}. ${v.text}`).join("\n")
        : fullVersesText,
    };

    /* ---------- RENDER ---------- */
    output.innerHTML = "";
    _allNotesOpen = false;
    document.getElementById("notesToggleBtn")?.classList.remove("ctrl-icon-active");

    _headingGen++;

    // Carried across the whole passage — quoted speech routinely opens in one
    // verse and closes in a later one.
    const quoteStack = [];

    verses.forEach((v) => {
      const key = keyOf(v.book_id, v.chapter, v.verse);
      const count = comments[key]?.length || 0;
      const isFav = isFavorite(key);

      const formattedText = formatVerseQuotes(v.text, quoteStack);

      const wrap = document.createElement("div");
      wrap.className = "verse" + (isFav ? " highlighted" : "");
      wrap.dataset.verseKey = key;
      wrap.innerHTML = `
        <div class="verse-swipe-track">
        <div class="verse-swipe-hints" aria-hidden="true">
          <span class="vsh vsh-note">
            <button type="button" class="vsh-btn" data-swipe-act="note" aria-label="Note" tabindex="-1"><span class="material-icons">edit_note</span></button>
          </span>
          <span class="vsh vsh-ai">
            <button type="button" class="vsh-btn" data-swipe-act="context" aria-label="Context" tabindex="-1"><span class="material-icons">auto_awesome</span></button>
            <button type="button" class="vsh-btn" data-swipe-act="ask" aria-label="Ask" tabindex="-1"><span class="material-icons">chat_bubble_outline</span></button>
          </span>
        </div>
        <div id="${
          v.verse
        }" class="verse-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div class="verse-content">
            <span class="verse-num">${v.verse}</span>${formattedText}
            <span class="verse-meta-indicators" style="display:inline-flex; align-items:center; margin-left:8px; opacity:0.6;">
              <span class="material-icons favorite-indicator" style="font-size:14px; margin-right:4px; ${
                isFav ? 'color:#c83086;"' : '"'
              } data-key="${key}">${isFav ? "favorite" : "favorite_border"}</span>
            </span>
          </div>
        </div>
        </div>
        <div class="verse-notes-inline" hidden></div>
        <div class="verse-actions">
          <button class="verse-action-btn" data-action="context"><span class="material-icons">auto_awesome</span><span>Context</span></button>
          <button class="verse-action-btn" data-action="ask"><span class="material-icons">chat_bubble_outline</span><span>Ask</span></button>
          <button class="verse-action-btn" data-action="note"><span class="material-icons">edit_note</span><span>Note</span></button>
        </div>
        <div class="inline-ai-mount"></div>
        <div class="comments ai-fade-in" hidden></div>
      `;
      _renderInlineNotes(wrap);

      // ... keep your existing listener code here ...
      const commentsEl = wrap.querySelector(".comments");
      const headerEl = wrap.querySelector(".verse-header");
      const aiBtn = wrap.querySelector('[data-action="context"]');

      // New: Favorite icon listener
      const favIndicator = wrap.querySelector(".favorite-indicator");
      const verseContentEl = wrap.querySelector(".verse-content"); // Get verseContent for updateMetaIndicators

      // Double-click: toggle favorite
      headerEl.ondblclick = (e) => {
        e.stopPropagation();
        toggleFavorite(key);
        wrap.classList.toggle("highlighted", isFavorite(key));
        updateMetaIndicators(key, verseContentEl, comments[key]?.length || 0);
        animateFavorite(wrap);
      };

      aiBtn.onclick = (e) => {
        e.stopPropagation();
        _verseActionTap(aiBtn);
        const mount = wrap.querySelector(".inline-ai-mount");
        if (mount._collapsing) return;
        if (mount.innerHTML.trim()) {
          _collapsePanel(mount, aiBtn, () => {
            mount.innerHTML = "";
            _syncVerseActionStates(wrap);
          });
          return;
        }
        fetchInlineQuickContext(
          {
            book: BIBLE_META[v.book_id].name,
            chapter: v.chapter,
            verse: v.verse,
            text: v.text,
          },
          mount,
        );
        // Loader card is written synchronously above, so it's in the DOM to
        // animate by the time we get here.
        _revealFromButton(mount, aiBtn, "inline-ai-mount--revealing");
        _syncVerseActionStates(wrap);
      };

      const chatBtn = wrap.querySelector('[data-action="ask"]');
      chatBtn.onclick = (e) => {
        e.stopPropagation();
        _verseActionTap(chatBtn);
        const mount = wrap.querySelector(".inline-ai-mount");
        if (mount._collapsing) return;
        const wasOpen = !!mount.querySelector(".verse-chat-wrapper");
        toggleVerseChat(
          key,
          BIBLE_META[v.book_id].name,
          v.chapter,
          v.verse,
          v.text,
          mount,
        );
        if (!wasOpen) _revealFromButton(mount, chatBtn, "inline-ai-mount--revealing");
        _syncVerseActionStates(wrap);
      };

      const noteActionBtn = wrap.querySelector('[data-action="note"]');
      if (noteActionBtn) {
        noteActionBtn.onclick = (e) => {
          e.stopPropagation();
          _verseActionTap(noteActionBtn);
          if (commentsEl._collapsing) return;
          if (!commentsEl.hidden) {
            _collapsePanel(commentsEl, noteActionBtn, () => {
              commentsEl.hidden = true;
              _renderInlineNotes(wrap);
              _syncVerseActionStates(wrap);
            });
            return;
          }
          commentsEl.hidden = false;
          renderComments(key, commentsEl);
          _revealFromButton(commentsEl, noteActionBtn, "comments--revealing");
          _renderInlineNotes(wrap);
          _syncVerseActionStates(wrap);
        };
      }

      if (favIndicator) {
        favIndicator.onclick = (e) => {
          e.stopPropagation();
          toggleFavorite(key);
          wrap.classList.toggle("highlighted", isFavorite(key));
          updateMetaIndicators(key, verseContentEl, comments[key]?.length || 0);
          animateFavorite(wrap);
        };
      }

      output.appendChild(wrap);
    });

    // Any click inside a verse can change what's open — the card's own ✕, a
    // chat close, a note toggle. One delegated listener re-syncs the button
    // lit-states on the next frame instead of threading callbacks through
    // every card renderer. #output is a stable node across passage loads, so
    // guard against stacking duplicate listeners.
    _wireVerseSwipe();

    if (!output._verseActionSyncWired) {
      output.addEventListener("click", (e) => {
        const verseWrap = e.target.closest?.(".verse");
        if (verseWrap) requestAnimationFrame(() => _syncVerseActionStates(verseWrap));
      });
      output._verseActionSyncWired = true;
    }

    // Section headings, the way a printed Bible carries them through a chapter
    // ("Gideon Defeats the Midianites"). MUST run after the verses are in the
    // DOM: each heading anchors to the verse it starts at, and on a cache hit
    // this inserts synchronously — called before the render loop it would find
    // nothing to anchor to and silently do nothing on every visit after the
    // first. Skipped for single-verse views, where a section heading would be
    // describing text that isn't on screen.
    if (!single) {
      _loadPassageHeadings(bookId, chapterNum, fullVersesText, _headingGen);
    }

    // Add Reflect button below the last verse
    const reflectRow = document.createElement("div");
    reflectRow.className = "passage-end-reflect";
    reflectRow.innerHTML = `
      <button class="passage-end-reflect-btn" onclick="openReflectModal()">Reflect</button>
    `;
    output.appendChild(reflectRow);

    renderSummary();
    hideLoading();
    // Drill-in transition: passage rises + fades into place after dashboard
    // fades out. Same easing as the canvas overlay so all view-changes feel
    // like one motion vocabulary.
    _playViewAnim(output, "view-enter");

    // Background TTS prefetch — fire-and-forget. Cache hits are instant IDB
    // reads; cache misses queue behind the 10-slot semaphore and stream into
    // IDB so a later Listen tap is silent. 3-day TTL keeps DB size bounded
    // even if the user spam-flips chapters.
    if (typeof _ttsPrefetchChapter === "function") _ttsPrefetchChapter();
  } catch (err) {
    console.error(err);
    hideLoading();
    showLoadError(
      `Failed to load passage. Check if ${VERSION_FILES[currentVersion]} is present.`,
    );
  }
}

async function runAIForCurrentPassage() {
  if (!window.__aiPayload) return;

  // Set loading flags synchronously before any await so playChapter()/ttsImmContextOpen()
  // always sees them as true when TTS opens the context screen right after this call.
  _contextLoading = true;
  _reflectionLoading = true;

  const cached = await loadAIFromStorage();
  if (
    cached &&
    cached.contextHTML &&
    cached.reflectionHTML &&
    !_isAiFailHTML(cached.contextHTML) &&
    !_isAiFailHTML(cached.reflectionHTML) &&
    cached.contextHTML != "<p>Failed to generate context summary.</p>" &&
    cached.reflectionHTML != "<p>Failed to generate reflection questions.</p>"
  ) {
    aiContextSummaryEl.innerHTML = cached.contextHTML;
    const reflMount = document.getElementById("aiReflection");
    // A chapter cached with the old three questions and nothing written yet
    // gets the one-question card. With answers it stays as it was until the
    // refresh button folds them into one notes box.
    const id = devotionId();
    const oldUnanswered =
      !cached.reflectionHTML.includes("refl-unified") &&
      ![0, 1, 2].some((i) => (localStorage.getItem(`reflection-${id}-${i}`) || "").split("A: ")[1]?.trim());
    if (oldUnanswered) {
      _contextLoading = false;
      await renderAIReflectionQuestions(window.__aiPayload);
      _reflectionLoading = false;
      applyReflectionVisibility();
      await _saveCurrentAI();
      return;
    }
    reflMount.innerHTML = cached.reflectionHTML;
    _ensureReflectionRetryUI(reflMount);
    applyReflectionVisibility();
    _contextLoading = false;
    _reflectionLoading = false;
    initializeReflections();
    return;
  }

  const { book, chapter, isSingle, versesText } = window.__aiPayload;
  titleForGemini = `${book} ${chapter}`;

  if (isSingle) {
    let verseNum;
    verseNum = versesText.split(".")[0];
    titleForGemini = `${book} ${chapter}:${verseNum}`;
  }

  await Promise.all([
    renderAIContextSummary().then(() => { _contextLoading = false; }),
    renderAIReflectionQuestions({ book, chapter, versesText }).then(() => {
      _reflectionLoading = false;
      // If TTS already finished while reflection was loading, show the reflect button now
      if (_ttsFinished) {
        const reflectBtn = document.getElementById("ttsImmReflectBtn");
        const ready = document.querySelectorAll('#aiReflection textarea[id^="reflection-"]').length > 0;
        if (reflectBtn && ready) {
          reflectBtn.hidden = false;
          reflectBtn.onclick = () => { _immCancelAutoRefl(); ttsImmReflectionOpen(); };
        }
      }
    }),
  ]);

  await _saveCurrentAI();
}

// Persist whatever passage AI is on screen, leaving failures out so they're
// regenerated next time instead of being served from cache.
async function _saveCurrentAI() {
  const ctx = aiContextSummaryEl.innerHTML;
  const refl = document.getElementById("aiReflection").innerHTML;
  await saveAIToStorage({
    contextHTML: _isAiFailHTML(ctx) ? null : ctx,
    reflectionHTML: _isAiFailHTML(refl) ? null : refl,
    answers: {},
  });
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
  const { book, chapter, versesText } = window.__aiPayload || {};
  const bookChapter = titleForGemini || `${book} ${chapter}`;

  aiContextSummaryEl.innerHTML = `<div style="padding:20px 0;text-align:center;">${sparkleLoaderHTML('Generating summary…')}</div>`;

  const quickPrompt = `You are a Bible study assistant. Give a brief structured summary for ${bookChapter}.

FORMAT (follow exactly — 3 sections, each 1-2 sentences max):
CONTEXT: [Brief background — what's happening at this point in the book]
WHAT_HAPPENS: [What occurs in this chapter]
WATCH_FOR: [One key thing the reader should pay attention to]

Keep it concise and clear. No bullet points, no numbering. Casual tone, like a friend giving you a heads-up.

PASSAGE:
${versesText || ''}`;

  const fullPrompt = `You are a Bible study assistant. Give a detailed context summary for ${bookChapter}.

RULES:
- Do NOT start with greetings or intro sentences. Start directly with the content.
- Use these exact section headers with ## markdown: ## Background, ## Key Themes, ## Watch For
- Use bullet points with bold key terms using **double asterisks**
- Reference specific verse numbers
- Be thorough but readable
- Friendly English tone, casual yet respectful

Here are the verses:
${versesText || ''}`;

  try {
    // Render the scaffold immediately so streaming has a target.
    aiContextSummaryEl.innerHTML = `
      <div class="ai-fade-in">
        <div id="ai-quick-mount">
          <div class="summary-quick-card summary-quick-skeleton">
            <div class="summary-quick-label">Before you read</div>
            <div class="summary-quick-title">${(book || '').toUpperCase()} ${chapter}</div>
            <div style="padding:20px 0;text-align:center;">${sparkleLoaderHTML('…')}</div>
          </div>
        </div>
        <div class="summary-full-section" id="ai-full-mount"></div>
      </div>`;

    const quickMount = document.getElementById('ai-quick-mount');
    const fullMount = document.getElementById('ai-full-mount');

    // Fire both in parallel. Quick stays non-streaming (we need to parse
    // structured CONTEXT:/WHAT_HAPPENS:/WATCH_FOR: sections). Full streams
    // so the user sees text appearing almost immediately.
    const quickPromise = callGemini(quickPrompt).then((quickText) => {
      const quick = parseQuickSummary(quickText);
      let html = `
        <div class="summary-quick-card">
          <div class="summary-quick-label">Before you read</div>
          <div class="summary-quick-title">${(book || '').toUpperCase()} ${chapter}</div>`;
      if (quick.context) {
        html += `<div class="summary-quick-section">
          <div class="summary-quick-section-title">Context</div>
          <div class="summary-quick-section-text">${quick.context}</div>
        </div>`;
      }
      if (quick.whatHappens) {
        html += `<div class="summary-quick-section">
          <div class="summary-quick-section-title">What Happens</div>
          <div class="summary-quick-section-text">${quick.whatHappens}</div>
        </div>`;
      }
      if (quick.watchFor) {
        html += `<div class="summary-quick-section">
          <div class="summary-quick-section-title">Watch For</div>
          <div class="summary-quick-section-text">${quick.watchFor}</div>
        </div>`;
      }
      html += `</div>`;
      quickMount.innerHTML = html;
    });

    const fullPromise = callGeminiStream(fullPrompt, (_chunk, full) => {
      // Re-render progressively. summaryMdToHTML is fast (~<1ms on typical input).
      fullMount.innerHTML = summaryMdToHTML(full);
    });

    await Promise.all([quickPromise, fullPromise]);
  } catch (err) {
    console.error(err);
    aiContextSummaryEl.innerHTML = aiFailHTML("The chapter summary", err, async () => {
      await renderAIContextSummary();
      await _saveCurrentAI();
    });
  }
}

function parseQuickSummary(text) {
  let context = '', whatHappens = '', watchFor = '';
  const lines = text.split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (/^CONTEXT:/i.test(t)) context = t.replace(/^CONTEXT:\s*/i, '');
    else if (/^WHAT.?HAPPENS:/i.test(t)) whatHappens = t.replace(/^WHAT.?HAPPENS:\s*/i, '');
    else if (/^WATCH.?FOR:/i.test(t)) watchFor = t.replace(/^WATCH.?FOR:\s*/i, '');
  }
  // Fallback
  if (!context && !whatHappens && !watchFor) {
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    context = sentences[0] || text;
    whatHappens = sentences[1] || '';
    watchFor = sentences[2] || '';
  }
  return { context, whatHappens, watchFor };
}

function summaryMdToHTML(text) {
  if (!text) return '';
  const lines = text.split('\n');
  let html = '';
  for (const line of lines) {
    const t = line.trim();
    if (!t) { html += '<div style="height:8px"></div>'; continue; }
    if (t.startsWith('#### ')) { html += `<h3>${t.slice(5)}</h3>`; continue; }
    if (t.startsWith('### ')) { html += `<h3>${t.slice(4)}</h3>`; continue; }
    if (t.startsWith('## ')) { html += `<h2>${t.slice(3)}</h2>`; continue; }
    if (t.startsWith('# ')) { html += `<h1>${t.slice(2)}</h1>`; continue; }
    if (t.startsWith('- ') || t.startsWith('* ')) {
      html += `<div class="md-bullet"><span class="md-bullet-dot">•</span><span class="md-bullet-text">${inlineMd(t.slice(2))}</span></div>`;
      continue;
    }
    const numMatch = t.match(/^(\d+)\.\s(.*)$/);
    if (numMatch) {
      html += `<div class="md-bullet"><span class="md-num">${numMatch[1]}.</span><span class="md-bullet-text">${inlineMd(numMatch[2])}</span></div>`;
      continue;
    }
    html += `<p>${inlineMd(t)}</p>`;
  }
  return html;
}

// Idempotent: ensures (a) the delegated retry-click handler is wired on
// #aiReflection, (b) the .ai-refl-retry button exists in the DOM, and
// (c) the button's enabled/tooltip state matches current answer count.
function _ensureReflectionRetryUI(mount) {
  if (!mount) return;

  if (!mount.dataset.retryWired) {
    mount.dataset.retryWired = "1";

    // Click → a different question; the notes stay.
    mount.addEventListener("click", async (e) => {
      const btn = e.target.closest(".ai-refl-retry");
      if (!btn || !mount.contains(btn)) return;
      e.stopPropagation();
      if (btn.disabled) return;
      btn.disabled = true;
      btn.classList.add("ai-refl-retry-spinning");
      try {
        await _refreshReflectionQuestion();
      } catch (err) {
        console.error("[reflection retry]", err);
      } finally {
        const stillBtn = mount.querySelector(".ai-refl-retry");
        if (stillBtn) stillBtn.classList.remove("ai-refl-retry-spinning");
        _refreshRetryButtonState(mount);
      }
    });

    // Verse chips → peek sheet instead of scrolling the page away. The
    // fullscreen reflect modal has always done this (js/08-story.js); the
    // inline panel was the odd one out, falling through to the global
    // `a[href^="#"]` delegate in js/05-render-init.js that smooth-scrolls and
    // flashes .verse-highlight — which means losing your place in the
    // questions to go look at one verse.
    //
    // This listener sits on #aiReflection, so it runs during bubbling BEFORE
    // that document-level delegate; stopPropagation is what keeps the scroll
    // from also firing.
    mount.addEventListener("click", (e) => {
      const link = e.target.closest("a.reflection-link, a[href^='#']");
      if (!link || !mount.contains(link)) return;
      e.preventDefault();
      e.stopPropagation();
      // Read the range off the label, not the href: _normalizeReflectionLinks
      // collapses href to the FIRST verse, so "vv. 16–17" would peek only 16.
      const verseRef =
        link.textContent.replace(/[^0-9,\-–\s]/g, "").trim() ||
        link.getAttribute("href")?.replace("#", "");
      if (verseRef) openVersePeek(verseRef, link);
    });

    // Input on any reflection textarea → recompute button state. Delegation
    // means it works for textareas added later (partial regen creates new ones).
    mount.addEventListener("input", (e) => {
      if (e.target?.tagName === "TEXTAREA") _refreshRetryButtonState(mount);
    });
  }

  if (!mount.querySelector(".ai-refl-retry")) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ai-refl-retry";
    btn.setAttribute("aria-label", "Different question");
    btn.title = "Different question";
    btn.innerHTML = `<span class="material-symbols-outlined">refresh</span>`;
    mount.insertBefore(btn, mount.firstChild);
  }

  // Repair any malformed verse-chip hrefs after every innerHTML overwrite
  // (fresh render, cache restore, partial retry) so the global anchor delegate
  // can resolve them. Idempotent.
  _normalizeReflectionLinks(mount);

  _refreshRetryButtonState(mount);
}

// The refresh button is always live. With one question there's nothing to
// "finish" — swapping the question is how you get a different lesson out of
// the same chapter, and the notes you've written stay where they are.
function _refreshRetryButtonState(mount) {
  const btn = mount?.querySelector(".ai-refl-retry");
  if (!btn || btn.classList.contains("ai-refl-retry-spinning")) return;
  btn.disabled = false;
  btn.title = "Different question";
  btn.classList.remove("ai-refl-retry-done");
}

// Swaps the question for a fresh one from another lesson in the chapter and
// carries the notes across. Also the upgrade path for a chapter cached with
// the old three questions: their answers are joined into the one notes box
// and the leftover reflection-<id>-1/-2 keys are removed, so the notes app
// doesn't keep listing questions that are no longer on screen.
async function _refreshReflectionQuestion() {
  const mount = document.getElementById("aiReflection");
  const payload = window.__aiPayload;
  if (!mount || !payload) return;

  const oldAreas = [...mount.querySelectorAll('textarea[id^="reflection-"]')];
  const notes = oldAreas
    .map((ta) => (ta.value || "").trim())
    .filter(Boolean)
    .join("\n\n");
  const oldQuestions = [...mount.querySelectorAll("li > p")]
    .map((p) => p.textContent.trim())
    .filter(Boolean);

  const r = await _fetchUnifiedReflection({
    ...payload,
    avoid: [...oldQuestions, ..._getRecentReflQs()],
  });
  if (!r) throw new Error("no reflection returned");

  const id = `reflection-${devotionId()}-0`;
  oldAreas.forEach((ta) => {
    if (ta.id && ta.id !== id) localStorage.removeItem(ta.id);
  });

  mount.innerHTML = _unifiedReflectionHTML(r);
  _appendRecentReflQs([r.question]);
  const ta = mount.querySelector("textarea");
  ta.id = id;
  ta.value = notes;
  _wireReflectionTextarea(ta);
  _normalizeReflectionLinks(mount);
  if (notes) {
    localStorage.setItem(id, `Q: ${r.question}\nA: ${notes}`);
  } else {
    localStorage.removeItem(id);
  }
  if (typeof autoExpand === "function") autoExpand(ta);

  const existing = (await loadAIFromStorage()) || {};
  await saveAIToStorage({
    ...existing,
    reflectionHTML: mount.innerHTML,
    answers: notes ? { [id]: notes } : {},
  });
}

// Wires the input listener used by initializeReflections — extracted so we
// can wire NEW textareas added during partial regen without re-wiring
// existing ones (which would double-fire saves).
function _wireReflectionTextarea(area) {
  if (!area || area.dataset.wiredInput === "1") return;
  area.dataset.wiredInput = "1";
  area.addEventListener("input", async () => {
    // Read the question now, not at wire time — refresh swaps it under the
    // same textarea.
    const questionText = area.previousElementSibling?.textContent || "Question";
    const formattedEntry = `Q: ${questionText}\nA: ${area.value}`;
    localStorage.setItem(area.id, formattedEntry);
    localStorage.setItem(`reflection-time-${devotionId()}`, String(Date.now()));
    if (typeof checkIfHasTextAreaAnswers === "function") checkIfHasTextAreaAnswers();
    if (typeof _debouncedPushSync === "function") _debouncedPushSync();
    const cachedAI = await loadAIFromStorage();
    if (cachedAI) {
      if (!cachedAI.answers) cachedAI.answers = {};
      cachedAI.answers[area.id] = area.value;
      await saveAIToStorage(cachedAI);
    }
  });
}

// Verse-chip clicks open the peek sheet — see the delegated handler in
// _ensureReflectionRetryUI. They used to fall through to the global
// `a[href^="#"]` delegate in js/05-render-init.js, which smooth-scrolled the
// page to the verse; that's still the fallback for chips rendered anywhere
// else, so the href must stay well-formed.
//
// The AI sometimes emits `#v.7` or `#vv. 41` instead of `#7` / `#41`, and
// getElementById then finds nothing, so the delegate bails and the browser
// follows the dead hash. Rewriting the href to the first verse number in the
// label fixes those without touching the click path.
//
// (Historical note: a per-link handler here once called preventDefault() and
// added a class named "verseGlow" — but `verseGlow` is the @keyframes name,
// not a class, so it matched no CSS rule while still swallowing the click.)
function _normalizeReflectionLinks(scope) {
  if (!scope) return;

  // The AI sometimes emits a range as TWO links with a bare dash between them
  // — `vv. 16` — `17` — instead of one `vv. 16–17`. That renders as two chips
  // and, worse, peeking either one shows a single verse when the question is
  // about the whole span. Merge them back into one link before anything else
  // reads the labels. Only a dash joins a range; a comma ("v. 3, v. 9") is two
  // genuinely separate references and is left alone.
  scope.querySelectorAll('a[href^="#"]').forEach((a) => {
    if (!a.isConnected) return; // already swallowed by an earlier merge
    let next = a.nextSibling;
    while (next) {
      const gap = next;
      if (gap.nodeType !== Node.TEXT_NODE || !/^\s*[–—-]\s*$/.test(gap.textContent)) break;
      const partner = gap.nextSibling;
      if (!partner || partner.nodeName !== "A" || !partner.getAttribute?.("href")?.startsWith("#")) break;

      const start = (a.textContent.match(/\d+/) || [])[0];
      const end = (partner.textContent.match(/\d+/) || [])[0];
      if (!start || !end) break;

      a.textContent = `vv. ${start}–${end}`;
      gap.remove();
      partner.remove();
      next = a.nextSibling; // a range could in principle chain further
    }
  });

  // Href always points at the FIRST verse so the scroll fallback in
  // js/05-render-init.js can resolve it with getElementById. The peek sheet
  // reads the full range off the label instead — see _ensureReflectionRetryUI.
  scope.querySelectorAll('a[href^="#"]').forEach((a) => {
    const fromText = (a.textContent.match(/\d+/) || [])[0];
    const fromHref = (a.getAttribute("href").match(/\d+/) || [])[0];
    const verseNum = fromText || fromHref;
    if (verseNum) a.setAttribute("href", `#${verseNum}`);
  });
}

// Every chapter teaches more than one thing. Each question (and each refresh)
// draws one of these lenses at random, so the same chapter can hand the
// reader a different lesson on another day instead of the same one forever.
const _REFLECTION_LENSES = [
  { id: "god",      label: "WHAT GOD IS LIKE",   desc: "Something God does, says, allows, or withholds in this chapter, and what it shows about Him." },
  { id: "choice",   label: "A CHOICE SOMEONE MAKES", desc: "A decision a person or group makes here — wise or foolish — and where the reader faces the same kind of choice." },
  { id: "heart",    label: "WHAT'S IN THE HEART", desc: "An attitude the chapter exposes — pride, fear, trust, jealousy, loyalty, impatience, grief — and where the reader carries it too." },
  { id: "people",   label: "HOW PEOPLE TREAT EACH OTHER", desc: "Loyalty, betrayal, advice, kindness, rivalry, family — what the chapter shows about relationships, landed on one of the reader's own." },
  { id: "promise",  label: "SOMETHING TO HOLD ON TO", desc: "A promise, a truth, or a moment of God's care in this chapter the reader could lean on in what they're facing now." },
  { id: "warning",  label: "A WARNING",          desc: "Where something goes wrong in this chapter and the quiet cause behind it — then where that same cause could be starting in the reader." },
  { id: "step",     label: "ONE SMALL STEP",     desc: "One small, doable thing this week that follows from what happens in this chapter. An invitation, never an assignment." },
];

function _pickReflectionLens() {
  return _REFLECTION_LENSES[Math.floor(Math.random() * _REFLECTION_LENSES.length)];
}

// Rolling buffer of the last ~15 reflection questions the user has seen
// across recent chapters. Passed to the prompt as "RECENTLY ASKED" so the AI
// varies tone/openings/angles from them. Cross-chapter scope: this is what
// stops the Leviticus 23 → 24 → 25 questions from feeling identical.
const _RECENT_REFL_KEY = "devo.recentReflQs";
const _RECENT_REFL_MAX = 15;

function _getRecentReflQs() {
  try {
    const raw = localStorage.getItem(_RECENT_REFL_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string") : [];
  } catch { return []; }
}

function _appendRecentReflQs(questions) {
  if (!questions || !questions.length) return;
  const arr = _getRecentReflQs();
  for (const q of questions) {
    const t = (q || "").trim();
    if (!t) continue;
    arr.push(t);
  }
  while (arr.length > _RECENT_REFL_MAX) arr.shift();
  try { localStorage.setItem(_RECENT_REFL_KEY, JSON.stringify(arr)); } catch {}
}

// One question for the whole chapter: what the reader saw in the text, then
// how it lands in their own life. Comes back as JSON and the markup is built
// here, so the model can't break the layout or style its own words.
async function _fetchUnifiedReflection({ book, chapter, versesText, avoid = [] }) {
  const lens = _pickReflectionLens();
  const avoidBlock = avoid.length
    ? `\nDON'T REPEAT — these were already asked (this chapter or recent ones). Pick a different lesson and phrase it differently:\n${avoid.slice(-15).map((q) => `- ${q}`).join("\n")}\n`
    : "";

  const prompt = `You write ONE guided-reflection question for someone who just read a whole Bible chapter. It goes: what they saw in the text → how it applies to their life.

Return ONLY a JSON object, no markdown fence, no commentary:
{"observe": "...", "verses": "1-5", "question": "..."}

"observe" — one plain sentence (max 25 words) saying what actually happens or is said in the chapter that this lesson comes from. A fact from the text, not the lesson. Can sum up a stretch of the chapter.
"verses" — the verse or range "observe" points at, digits only ("7" or "12-14"). Must exist in the passage below.
"question" — one question (max 22 words), straight to the reader ("you"), about how that applies to their life now.

THE LESSON TO USE — ${lens.label}: ${lens.desc}
This chapter has many lessons; this is the one to draw out today. If the chapter genuinely has nothing for it, use the strongest other lesson in the chapter.
${avoidBlock}
RULES:
- About THIS chapter. The observation must name a real person, action, place, or words from it. If the question could be pasted onto another chapter, rewrite it.
- It lands on the reader: something they've felt, done, wanted, a person in their life, a situation they're in. Not a study question about the text.
- Friendly and plain, like a friend over coffee. A 16-year-old understands every word. ONE question, one idea — never "X, and what could you do about it?" tacked on.
- Invite, never prescribe: no "you must", "you should", "commit to". "I don't know yet" is an allowed answer.
- No sermon before the question, no answer, never speak as God.
- New covenant: never ask the reader to keep an Old Testament ceremonial, food, sacrifice, or civil law. Ask about what it shows about God or the heart instead.
- Don't drift to Jesus or the cross unless this chapter itself pictures it.
- Banned words: theological, implications, in light of, considering, ultimate, wrestle with, grapple, reflect on, sovereign, providence.

SHAPE ONLY — these are from other chapters. Never reuse their subject or wording:
{"observe": "Boaz tells his workers to leave extra grain on purpose so Ruth can gather it without shame.", "verses": "15-16", "question": "Who could you help this week in a way that lets them keep their dignity?"}
{"observe": "Joseph is thrown into prison for refusing Potiphar's wife, yet the Lord is with him there.", "verses": "20-23", "question": "Where does doing the right thing feel like it cost you, right now?"}

PASSAGE:
${book} ${chapter}

${versesText}`;

  const raw = await callGemini(prompt, { temperature: 0.9 });
  const text = String(raw || "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let data;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const question = String(data?.question || "").trim();
  if (!question) return null;
  return {
    question,
    observe: String(data.observe || "").trim(),
    verses: String(data.verses || "").replace(/[^\d,\-–]/g, ""),
  };
}

// The one-card layout. The question <p> sits directly before the textarea —
// initializeReflections, the immersive reflection panel and the reflect modal
// all read the question from there, and the notes app from the Q: line.
function _unifiedReflectionHTML({ observe, verses, question }) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const first = (verses.match(/\d+/) || [])[0];
  const chip = first
    ? ` <a href="#${first}" class="reflection-link">${/[-–,]/.test(verses) ? "vv." : "v."} ${esc(verses.replace(/-/g, "–"))}</a>`
    : "";
  return `
    <button type="button" class="ai-refl-retry" aria-label="Different question" title="Different question">
      <span class="material-symbols-outlined">refresh</span>
    </button>
    <ol class="refl-unified"><li>
      ${observe ? `<div class="refl-obs">${esc(observe)}${chip}</div>` : ""}
      <p class="refl-q">${esc(question)}</p>
      <textarea placeholder="What you noticed, and how it applies to you…"></textarea>
    </li></ol>`;
}

async function renderAIReflectionQuestions({ book, chapter, versesText }) {
  const mount = document.getElementById("aiReflection");
  const _reflRetry = async () => {
    await renderAIReflectionQuestions({ book, chapter, versesText });
    await _saveCurrentAI();
  };
  mount.classList.add("ai-fade-in");
  _ensureReflectionRetryUI(mount);

  // Skeleton of the one card that's coming — a line from the chapter, the
  // question, then the notes box.
  mount.innerHTML = `
  <div class="refl-skel refl-skel--one" aria-hidden="true">
    <div class="refl-skel-item">
      <div class="refl-skel-q">
        <span class="refl-skel-short"></span><span></span><span class="refl-skel-short"></span>
      </div>
      <div class="refl-skel-box"></div>
    </div>
  </div>
  <div class="refl-skel-status">${sparkleLoaderHTML("Finding something to reflect on…")}</div>
`;

  try {
    const r = await _fetchUnifiedReflection({ book, chapter, versesText, avoid: _getRecentReflQs() });
    if (!r) {
      mount.innerHTML = aiFailHTML("Reflection", null, _reflRetry);
      return true;
    }
    // Rolling cross-chapter buffer so the next chapter's question doesn't
    // open the same way.
    _appendRecentReflQs([r.question]);

    mount.innerHTML = _unifiedReflectionHTML(r);
    const ta = mount.querySelector("textarea");
    ta.id = `reflection-${devotionId()}-0`;
    setTimeout(restoreSavedReflectionAnswers, 0);
    _normalizeReflectionLinks(mount);
    initializeReflections();
    _refreshRetryButtonState(mount);
  } catch (e) {
    console.error(e);
    mount.innerHTML = aiFailHTML("Reflection", e, _reflRetry);
  }
  return true;
}

async function restoreSavedReflectionAnswers() {
  const cached = await loadAIFromStorage();
  if (!cached?.answers) return;

  document.querySelectorAll("#aiReflection textarea").forEach((ta) => {
    if (cached.answers[ta.id] !== undefined) {
      ta.value = cached.answers[ta.id];
    }
  });
}

// =============================================================================
// GRATITUDE JOURNAL — free-form list of random things Charlie's thankful for.
// Open-ended thanks, no verse tie-in. Modal has an always-on input at the top
// + the running list below.
// =============================================================================

const _GRAT_JOURNAL_KEY = "gratitudeJournal";
const _GRAT_JOURNAL_MAX = 500;

function _getGratitudeEntries() {
  try {
    const raw = localStorage.getItem(_GRAT_JOURNAL_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function _saveGratitudeEntries(arr) {
  try { localStorage.setItem(_GRAT_JOURNAL_KEY, JSON.stringify(arr)); } catch {}
}

function _addGratitudeEntry(entry) {
  const arr = _getGratitudeEntries();
  arr.unshift(entry); // newest first
  while (arr.length > _GRAT_JOURNAL_MAX) arr.pop();
  _saveGratitudeEntries(arr);
  return arr;
}

function _deleteGratitudeEntry(id) {
  const arr = _getGratitudeEntries().filter((e) => e.id !== id);
  _saveGratitudeEntries(arr);
  return arr;
}

function _refreshGratitudeJournalLink() {
  const link = document.getElementById("dashGratLink");
  const countEl = document.getElementById("dashGratCount");
  if (!link || !countEl) return;
  const n = _getGratitudeEntries().length;
  countEl.textContent = n > 0 ? `${n}` : "";
  link.classList.toggle("dash-journal-link-empty", n === 0);
}

function openGratitudeJournal() {
  const overlay = document.getElementById("modalOverlay");
  const content = document.getElementById("modalContent");
  if (!overlay || !content) return;

  const entries = _getGratitudeEntries();
  const listBody = entries.length === 0
    ? `<div class="grat-empty">
         <span class="material-symbols-outlined">favorite</span>
         <p>Nothing here yet.</p>
         <p class="grat-empty-sub">Type the smallest thing — coffee, a friend, that you woke up. Anything you're grateful for.</p>
       </div>`
    : `<ul class="grat-list">${entries.map(_renderGratitudeEntry).join("")}</ul>`;

  content.innerHTML = `
    <div class="grat-modal">
      <header class="grat-modal-header">
        <span class="grat-eyebrow">Gratitude Journal</span>
        <h2 class="grat-title">Things you're thankful for</h2>
        <p class="grat-sub">Random thanks, big or small. Add as many as you want.</p>
      </header>
      <div class="grat-add">
        <textarea class="grat-add-input" placeholder="I'm thankful for..." rows="2"></textarea>
        <div class="grat-add-row">
          <span class="grat-add-hint">⌘/Ctrl+Enter to save</span>
          <button type="button" class="grat-add-save">
            <span class="material-symbols-outlined">add</span>
            Add to journal
          </button>
        </div>
      </div>
      ${listBody}
    </div>
  `;
  overlay.hidden = false;

  // Wire add input — same auto-grow pattern the reflect-modal textareas use.
  // Direct "auto" → scrollHeight (NOT the global autoExpand which uses
  // "inherit" and breaks inside flex-column parents).
  const ta = content.querySelector(".grat-add-input");
  if (ta) {
    ta.style.overflowY = "hidden";
    const growGrat = () => {
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
    };
    growGrat();
    ta.addEventListener("input", growGrat);
    requestAnimationFrame(growGrat);
    ta.focus();

    const trySave = () => {
      const txt = (ta.value || "").trim();
      if (!txt) return;
      _addGratitudeEntry({
        id: `grat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ts: Date.now(),
        text: txt,
      });
      _refreshGratitudeJournalLink();
      openGratitudeJournal(); // re-render the modal with the new entry
    };
    ta.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") trySave();
    });
    content.querySelector(".grat-add-save")?.addEventListener("click", trySave);
  }

  content.querySelectorAll(".grat-delete-btn").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      if (!id) return;
      _deleteGratitudeEntry(id);
      _refreshGratitudeJournalLink();
      openGratitudeJournal();
    };
  });
}

function _renderGratitudeEntry(e) {
  const date = new Date(e.ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = new Date(e.ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `
    <li class="grat-item">
      <div class="grat-item-row">
        <span class="grat-item-date">${date} · ${time}</span>
        <button type="button" class="grat-delete-btn" data-id="${_escHtml(e.id)}" aria-label="Delete entry" title="Delete entry">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="grat-item-text">${_escHtml(e.text)}</div>
    </li>
  `;
}

// =============================================================================
// PRAYERS JOURNAL — free-form list of prayer requests. Mirrors the gratitude
// journal pattern (open-ended add input on top, list below). Replaces the old
// SOAP "Prayer" feature which lived inside Dig Deeper.
// =============================================================================

const _PRAY_JOURNAL_KEY = "prayersJournal";
const _PRAY_JOURNAL_MAX = 500;

function _getPrayersEntries() {
  try {
    const raw = localStorage.getItem(_PRAY_JOURNAL_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function _savePrayersEntries(arr) {
  try { localStorage.setItem(_PRAY_JOURNAL_KEY, JSON.stringify(arr)); } catch {}
}

function _addPrayerEntry(entry) {
  const arr = _getPrayersEntries();
  arr.unshift(entry);
  while (arr.length > _PRAY_JOURNAL_MAX) arr.pop();
  _savePrayersEntries(arr);
  return arr;
}

function _deletePrayerEntry(id) {
  const arr = _getPrayersEntries().filter((e) => e.id !== id);
  _savePrayersEntries(arr);
  return arr;
}

function _refreshPrayersJournalLink() {
  const link = document.getElementById("dashPrayLink");
  const countEl = document.getElementById("dashPrayCount");
  if (!link || !countEl) return;
  const n = _getPrayersEntries().length;
  countEl.textContent = n > 0 ? `${n}` : "";
  link.classList.toggle("dash-journal-link-empty", n === 0);
}

function openPrayersJournal() {
  const overlay = document.getElementById("modalOverlay");
  const content = document.getElementById("modalContent");
  if (!overlay || !content) return;

  const entries = _getPrayersEntries();
  const listBody = entries.length === 0
    ? `<div class="grat-empty">
         <span class="material-symbols-outlined">volunteer_activism</span>
         <p>Nothing here yet.</p>
         <p class="grat-empty-sub">Write a prayer — for yourself, family, ministry, or anything on your heart.</p>
       </div>`
    : `<ul class="grat-list">${entries.map(_renderPrayerEntry).join("")}</ul>`;

  content.innerHTML = `
    <div class="grat-modal pray-modal">
      <header class="grat-modal-header">
        <span class="grat-eyebrow">Prayers</span>
        <h2 class="grat-title">Prayer requests</h2>
        <p class="grat-sub">Lift them up. Keep them in front of you. Add as many as you want.</p>
      </header>
      <div class="grat-add">
        <textarea class="grat-add-input" placeholder="Lord, I pray..." rows="2"></textarea>
        <div class="grat-add-row">
          <span class="grat-add-hint">⌘/Ctrl+Enter to save</span>
          <button type="button" class="grat-add-save">
            <span class="material-symbols-outlined">add</span>
            Add prayer
          </button>
        </div>
      </div>
      ${listBody}
    </div>
  `;
  overlay.hidden = false;

  const ta = content.querySelector(".grat-add-input");
  if (ta) {
    ta.style.overflowY = "hidden";
    const growPray = () => {
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
    };
    growPray();
    ta.addEventListener("input", growPray);
    requestAnimationFrame(growPray);
    ta.focus();

    const trySave = () => {
      const txt = (ta.value || "").trim();
      if (!txt) return;
      _addPrayerEntry({
        id: `pray-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ts: Date.now(),
        text: txt,
      });
      _refreshPrayersJournalLink();
      openPrayersJournal();
    };
    ta.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") trySave();
    });
    content.querySelector(".grat-add-save")?.addEventListener("click", trySave);
  }

  content.querySelectorAll(".grat-delete-btn").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      if (!id) return;
      _deletePrayerEntry(id);
      _refreshPrayersJournalLink();
      openPrayersJournal();
    };
  });
}

function _renderPrayerEntry(e) {
  const date = new Date(e.ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = new Date(e.ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `
    <li class="grat-item">
      <div class="grat-item-row">
        <span class="grat-item-date">${date} · ${time}</span>
        <button type="button" class="grat-delete-btn" data-id="${_escHtml(e.id)}" aria-label="Delete prayer" title="Delete prayer">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="grat-item-text">${_escHtml(e.text)}</div>
    </li>
  `;
}

// Real-time journal sync — fired by firebase-sync.js when remote gratitude or
// prayers journal data lands. Refreshes the dashboard pill counts
// and, if the matching modal is open, re-renders its contents in place so
// Charlie ↔ Karla edits flow live without a page reload.
window.addEventListener("devo:journal-sync", (e) => {
  const keys = (e?.detail?.keys) || [];
  const overlay = document.getElementById("modalOverlay");
  const content = document.getElementById("modalContent");
  const modalOpen = overlay && !overlay.hidden && content;

  if (keys.includes("gratitudeJournal")) {
    _refreshGratitudeJournalLink();
    if (modalOpen && content.querySelector(".grat-modal:not(.pray-modal)")) {
      const draft = content.querySelector(".grat-add-input")?.value || "";
      openGratitudeJournal();
      const ta = document.querySelector(".grat-add-input");
      if (ta && draft) ta.value = draft;
    }
  }

  if (keys.includes("prayersJournal")) {
    _refreshPrayersJournalLink();
    if (modalOpen && content.querySelector(".pray-modal")) {
      const draft = content.querySelector(".grat-add-input")?.value || "";
      openPrayersJournal();
      const ta = document.querySelector(".pray-modal .grat-add-input");
      if (ta && draft) ta.value = draft;
    }
  }
});


