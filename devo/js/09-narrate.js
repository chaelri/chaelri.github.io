/* ============================================================
   RETELL — the chapter as narration + dialogue
   ============================================================
   Lays the loaded chapter out as a screenplay: narration beats and speech
   bubbles with a circular avatar per speaker.

   The text is VERBATIM — narration as well as dialogue. The model is a
   typesetter, not a writer: it splits the chapter's existing words into
   beats, works out who is speaking, and drops the attribution clause that
   the bubble's own label replaces ("The Lord said to Gideon,"). It writes
   nothing of its own except the title and logline. An earlier version let it
   phrase narration itself and it quietly rewrote the chapter — "So 22,000
   men left that place" came back as "Twenty-two thousand men leave".

   Occupies the js/09 slot freed when the SOAP feature was deleted
   (DECISIONS #23), so the chunk order stays contiguous.

   Flow, because generation takes a few seconds:
     click → curtain wipes up over the reader → loading → beats fade in
   The curtain is one element that stays put for all three stages, so the
   screen never flashes between them.
============================================================ */

// Bumped whenever output shape changes — "narrate_" held rewritten prose,
// "narrate2_"/"narrate3_" held verses whose speech was never split out of the
// narration. Cached entries would otherwise keep serving the old shape for a
// week. Superseded keys expire on their own TTL and are never read again.
const _NR_CACHE_PREFIX = "narrate4_";
const _NR_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days, same as the story cache

/* Bubble colours cycle per distinct speaker so two people in the same scene
   never share one. God/the Lord is pinned to index 0 so He reads consistently
   across every chapter rather than shifting with cast order. */
const _NR_SPEAKER_TONES = [
  { bg: "rgba(219, 39, 119, 0.16)", ring: "rgba(219, 39, 119, 0.45)", ink: "#ffb3d9" },
  { bg: "rgba(96, 165, 250, 0.15)", ring: "rgba(96, 165, 250, 0.45)", ink: "#a9cdff" },
  { bg: "rgba(52, 211, 153, 0.14)", ring: "rgba(52, 211, 153, 0.42)", ink: "#8ee9c4" },
  { bg: "rgba(251, 191, 36, 0.15)", ring: "rgba(251, 191, 36, 0.45)", ink: "#ffd98a" },
  { bg: "rgba(167, 139, 250, 0.16)", ring: "rgba(167, 139, 250, 0.45)", ink: "#cbb4ff" },
  { bg: "rgba(248, 113, 113, 0.15)", ring: "rgba(248, 113, 113, 0.45)", ink: "#ffb0b0" },
];

function _nrIsDivine(name) {
  return /^(the )?(lord|god|yahweh|jesus|christ|holy spirit|angel of the lord)$/i.test(
    String(name || "").trim(),
  );
}

function _nrToneFor(name, registry) {
  const key = String(name || "").trim().toLowerCase();
  if (!(key in registry)) {
    registry[key] = _nrIsDivine(name)
      ? 0
      : 1 + (Object.keys(registry).length % (_NR_SPEAKER_TONES.length - 1));
  }
  return _NR_SPEAKER_TONES[registry[key]];
}

/* Divine speakers get a mark instead of initials — "LO" for the Lord read as
   a username. A plain Latin cross: the crossbar sits above centre, ends are
   rounded, nothing ornamental. Inline SVG rather than a Material ligature so
   a missing glyph can never render as a literal word inside the circle. */
const _NR_CROSS_SVG = `<svg class="nr-cross" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 2.5 V21.5 M5.5 8.6 H18.5"
        stroke="currentColor" stroke-width="2.6" stroke-linecap="round" fill="none"/>
</svg>`;

function _nrInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  // Drop a leading article so "The Lord" reads as L, not TL.
  if (parts.length > 1 && /^the$/i.test(parts[0])) parts.shift();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function _nrEsc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

/* Speech inside speech — "So say to the men, “If you are very afraid…”" — is
   a second voice and shouldn't sit in the bubble as raw punctuation. Runs
   AFTER _nrEsc: curly marks pass through escaping untouched, which is exactly
   what makes it safe to regex for them without escaping our own markup.
   Deliberately inline, not pulled onto its own line: these are usually mid
   sentence ("If I say, “…,” then take him"), and breaking them out would cut
   the sentence in half. Colour matches the reader's nested quotes so inner
   speech reads the same way throughout the app. */
function _nrMarkInnerQuotes(escaped) {
  return String(escaped)
    .replace(/“([^”]+)”/g, '<span class="nr-inner">“$1”</span>')
    .replace(/‘([^’]+)’/g, '<span class="nr-inner">‘$1’</span>')
    // Straight quotes as a fallback. The prompt forbids swapping the curly
    // marks for these, but the model does it anyway often enough that inner
    // speech would otherwise silently lose its colour. `"` is `&quot;` by the
    // time it reaches here, since this runs after escaping.
    .replace(/&quot;([^&]+?)&quot;/g, '<span class="nr-inner">&quot;$1&quot;</span>');
}

/* ── Speech extraction (the safety net) ────────────────────────────────────
   The prompt tells the model to split a verse where narration meets speech.
   It complies most of the time and then quietly doesn't — one verse becomes a
   bubble while the next leaves the speech sitting in a narration beat. No
   amount of extra prompt wording fixed that reliably, so the split is done
   here instead, deterministically, after the model has answered.

   The model still does the part only it can do: deciding the beat order and
   naming speakers it can infer. This pass only rescues what it missed. */
const _NR_SAY_VERBS =
  "said|says|say|told|tells|replied|replies|answered|answers|asked|asks|" +
  "shouted|shouts|cried|cries|called|calls|announced|declared|spoke|speaks|promised|warned";

// Subjects that carry no name. Resolved against the first proper noun in the
// same beat before the split is allowed.
const _NR_PRONOUNS = /^(he|she|they|it|we|you|i)$/i;

// Words that open a sentence and would otherwise be mistaken for a name.
const _NR_NOT_NAMES = new Set([
  "when", "so", "but", "then", "and", "after", "now", "the", "a", "an", "this",
  "that", "these", "those", "at", "in", "on", "for", "as", "if", "while",
  "before", "because", "there", "here", "one", "some", "all", "his", "her",
  "their", "its", "he", "she", "they", "it",
]);

function _nrFirstProperNoun(text) {
  const words = String(text || "").match(/[A-Z][a-z'’]+/g) || [];
  return words.find((w) => !_NR_NOT_NAMES.has(w.toLowerCase())) || null;
}

/* Reads the tail of the narration that runs up to a quote and works out who
   is about to speak. Returns null when it can't tell — and null means DON'T
   split, because a bubble labelled with the wrong speaker is worse than one
   that stayed as narration. */
function _nrReadAttribution(before, wholeBeat) {
  const tail = String(before || "");
  const m = tail.match(
    new RegExp(
      `([A-Z][\\w'’]*(?:\\s+[\\w'’]+){0,3}|\\b(?:He|She|They|It)\\b)\\s+(?:${_NR_SAY_VERBS})\\b([^,]*),?\\s*$`,
      "i",
    ),
  );
  if (!m) return null;

  let speaker = m[1].trim().replace(/^(and|so|but|then|when)\s+/i, "");
  const toMatch = (m[2] || "").match(/\bto\s+([\w'’ ]+?)\s*$/i);
  const to = toMatch ? toMatch[1].trim() : "";

  if (_NR_PRONOUNS.test(speaker)) {
    // "He shouted to his men" — the name is usually earlier in the same beat.
    const named = _nrFirstProperNoun(wholeBeat);
    if (!named) return null;
    speaker = named;
  }

  return {
    speaker,
    to,
    // Everything before the attribution clause stays narration.
    narration: tail.slice(0, m.index).trim(),
  };
}

const _NR_QUOTE_RE = /“([^”]*)”|‘([^’]*)’|"([^"]*)"/g;

function _nrSplitSpeech(beats) {
  const out = [];

  for (const beat of beats) {
    if (beat.type !== "narration" || !beat.text) {
      out.push(beat);
      continue;
    }

    const text = String(beat.text);
    _NR_QUOTE_RE.lastIndex = 0;
    let cursor = 0;
    let produced = false;
    let match;

    while ((match = _NR_QUOTE_RE.exec(text)) !== null) {
      const quoted = match[1] ?? match[2] ?? match[3] ?? "";
      if (!quoted.trim()) continue;

      const before = text.slice(cursor, match.index);
      const attr = _nrReadAttribution(before, text);
      if (!attr) continue; // unattributable — leave this quote where it is

      if (attr.narration) {
        out.push({ type: "narration", text: attr.narration, verses: beat.verses });
      }
      out.push({
        type: "dialogue",
        speaker: attr.speaker,
        to: attr.to,
        text: quoted.trim(),
        verses: beat.verses,
      });
      cursor = match.index + match[0].length;
      produced = true;
    }

    if (!produced) {
      out.push(beat);
      continue;
    }
    const rest = text.slice(cursor).trim();
    if (rest) out.push({ type: "narration", text: rest, verses: beat.verses });
  }

  return out;
}

/* Verse tags on a beat become the same chips used in reflection questions, so
   tapping one opens the peek sheet instead of leaving the retelling. */
function _nrVerseChip(ref) {
  const clean = String(ref || "").trim();
  if (!clean) return "";
  const first = (clean.match(/\d+/) || [])[0];
  if (!first) return "";
  const label = /[-–,]/.test(clean) ? `vv. ${clean}` : `v. ${clean}`;
  return `<a href="#${first}" class="reflection-link nr-chip">${_nrEsc(label)}</a>`;
}

function _nrBuildPrompt(book, chapter, versesText) {
  return `You are laying out one chapter of the Bible as a screenplay: the chapter's own words, split into narration and speech bubbles. You do NOT rewrite the chapter. You re-format it.

Book: ${book} — Chapter: ${chapter}

Return ONLY a JSON object, no markdown fence, no commentary:

{
  "title": "a short scene title, max 6 words",
  "logline": "one sentence naming what this chapter is really about",
  "beats": [
    { "type": "narration", "text": "...", "verses": "1-3" },
    { "type": "dialogue", "speaker": "The Lord", "to": "Gideon", "text": "...", "verses": "2" }
  ]
}

BEAT TYPES:
- "narration" — the chapter's own narrative text, outside of anyone's speech.
- "dialogue" — someone speaks. Needs "speaker". Add "to" when the chapter makes the listener clear.

YOU ARE NOT A WRITER HERE. YOU ARE A TYPESETTER.

Every word of every "text" must be copied VERBATIM from the passage below. You are not retelling the chapter, summarising it, modernising it, or improving it. You are splitting the text that already exists into beats and labelling who is speaking. The reader is going to compare this against the verse — if a single word differs, you have failed.

FORBIDDEN, no exceptions:
- Rewording anything. "So 22,000 men left that place and they went home" must appear exactly like that — NOT "Twenty-two thousand men leave".
- Changing numerals to words or words to numerals. "22,000" stays "22,000". "ten" stays "ten".
- Changing tense. If the chapter says "left", you write "left" — never "leave".
- Compressing two sentences into one, or dropping a clause because it seems repetitive.
- Adding a connecting phrase, a scene-setting line, or any sentence of your own.

A VERSE IS NOT A BEAT. THIS IS THE PART MOST OFTEN GOT WRONG.

One verse very often contains narration AND speech. You must split it at the boundary. Scan the passage for quotation marks — every opening mark starts speech, every closing mark ends it:
- Text OUTSIDE quotation marks → narration beat.
- Text INSIDE quotation marks → dialogue beat.
Both beats carry the same "verses" number. That is expected and correct.

If a verse contains a quotation mark and you emit it as a single narration beat, you have failed. Speech never stays inside a narration beat.

The order inside a verse can go either way and you must handle both:
- speech first, then narration ("…you may go." So 22,000 men left…)
- narration first, then speech (So Gideon took the men… The Lord said, 'Put the men…')

ONE EXCEPTION — quotes INSIDE someone's speech stay in their bubble. When the Lord says: If I say, "This man should go with you," then take him — that inner quote is part of what the Lord is saying. It does NOT become its own bubble and it does NOT get its own speaker. Leave it in the sentence exactly as written.

THE ONLY EDITS YOU MAY MAKE:
1. Split the text into beats, in the order it already appears — splitting WITHIN a verse wherever narration meets speech.
2. When speech goes into a dialogue bubble, drop its surrounding quote marks — the bubble is the quote.
3. When speech goes into a bubble, drop ONLY the attribution clause that introduces it ("The Lord said to Gideon,", "Gideon said to them,") — the bubble's speaker name already carries it. Everything else in that verse stays as narration.
4. Split one long speech into consecutive dialogue beats by the same speaker.

WORKED EXAMPLE — if the passage contained:
  v2 The Lord said to Gideon, 'You have too many men in your army.'
  v3 So say to the men, "If you are very afraid of the battle, you may go." ' So 22,000 men left that place and they went home. But 10,000 soldiers remained with Gideon.

CORRECT output beats:
  { "type": "dialogue", "speaker": "The Lord", "to": "Gideon", "text": "You have too many men in your army.", "verses": "2" }
  { "type": "dialogue", "speaker": "The Lord", "to": "Gideon", "text": "So say to the men, \\"If you are very afraid of the battle, you may go.\\"", "verses": "3" }
  { "type": "narration", "text": "So 22,000 men left that place and they went home. But 10,000 soldiers remained with Gideon.", "verses": "3" }

Note the third beat: copied character for character. That is the standard for every beat.

WORKED EXAMPLE 2 — narration first, then speech, inside ONE verse:
  v5 So Gideon took the men to the spring of water. The Lord said to Gideon, 'Put the men who use their tongues to drink like a dog in one group.'

CORRECT:
  { "type": "narration", "text": "So Gideon took the men to the spring of water.", "verses": "5" }
  { "type": "dialogue", "speaker": "The Lord", "to": "Gideon", "text": "Put the men who use their tongues to drink like a dog in one group.", "verses": "5" }

WRONG (this is the most common failure — the whole verse dumped into narration because it happens to start with narration):
  { "type": "narration", "text": "So Gideon took the men to the spring of water. The Lord said to Gideon, 'Put the men who use their tongues to drink like a dog in one group.'", "verses": "5" }

KEEP QUOTATION MARKS AS THEY ARE. If the passage uses ' and ' , do not swap them for " and " . Copy the characters you were given.

REMAINING RULES:

A. COVER EVERYTHING. Work through the chapter start to finish. Every verse's text must appear in some beat — nothing skipped, nothing merged away. Because you are copying rather than compressing, a long chapter simply produces more beats.

B. NAME THE SPEAKER AS THE CHAPTER DOES ("The Lord", "Gideon", "The men of Ephraim"). If a group speaks, name the group. Never use "Narrator" — narration beats have no speaker.

C. "verses" is the verse or range that beat came from, digits only ("7" or "12-14").

D. No verse numbers inside "text", no markdown, no headers, no bullets.

E. "title" and "logline" are the ONLY places you write your own words.

PASSAGE:
${versesText}`;
}

/* The model occasionally wraps the JSON in a fence or adds a sentence before
   it despite the instruction, so pull the outermost object rather than
   trusting the whole response to parse. */
function _nrParse(raw) {
  const text = String(raw || "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in response");
  const data = JSON.parse(text.slice(start, end + 1));
  if (!data || !Array.isArray(data.beats) || !data.beats.length) {
    throw new Error("no beats in response");
  }
  data.beats = _nrSplitSpeech(data.beats);
  return data;
}

function _nrRenderBeats(data, sections) {
  const tones = {};
  let lastSpeaker = null;

  // Same section headings the reader shows, from the same cache — a chapter
  // titled in one place is titled identically in the other. Sorted and
  // consumed as the beats walk past their start verse.
  const pending = (Array.isArray(sections) ? [...sections] : [])
    .map((s) => ({ verse: parseInt(s?.verse, 10), title: String(s?.title || "").trim() }))
    .filter((s) => s.verse && s.title)
    .sort((a, b) => a.verse - b.verse);

  const html = data.beats
    .map((beat, i) => {
      const delay = `style="animation-delay:${Math.min(i * 55, 900)}ms"`;
      const chip = _nrVerseChip(beat.verses);

      // Emit every heading this beat has reached. A beat covering "9-12"
      // consumes a section starting at 9 AND one starting at 11 — otherwise a
      // heading whose verse falls inside a multi-verse beat is dropped.
      const beatVerse = parseInt(String(beat.verses || "").match(/\d+/)?.[0], 10);
      let headings = "";
      while (pending.length && beatVerse && pending[0].verse <= beatVerse) {
        const sec = pending.shift();
        headings += `<h3 class="nr-pageable nr-heading" ${delay}>${_nrEsc(sec.title)}</h3>`;
        lastSpeaker = null; // a new section restarts the speaker run
      }

      if (beat.type === "dialogue" && beat.text) {
        const speaker = beat.speaker || "Someone";
        const tone = _nrToneFor(speaker, tones);
        // Consecutive bubbles from one speaker drop the avatar and name so a
        // long speech reads as one continuous turn instead of a stutter.
        const isRun = speaker === lastSpeaker;
        lastSpeaker = speaker;
        const to = beat.to ? `<span class="nr-to">to ${_nrEsc(beat.to)}</span>` : "";
        const divine = _nrIsDivine(speaker);
        const mark = divine ? _NR_CROSS_SVG : _nrEsc(_nrInitials(speaker));
        return headings + `<div class="nr-pageable nr-line nr-line-say ${isRun ? "nr-run" : ""}" ${delay}>
          <div class="nr-avatar ${divine ? "nr-avatar-divine" : ""}" style="background:${tone.bg};border-color:${tone.ring};color:${tone.ink}">
            ${isRun ? "" : mark}
          </div>
          <div class="nr-bubble-wrap">
            ${isRun ? "" : `<div class="nr-who" style="color:${tone.ink}">${_nrEsc(speaker)}${to}</div>`}
            <div class="nr-bubble" style="background:${tone.bg};border-color:${tone.ring}">
              ${_nrMarkInnerQuotes(_nrEsc(beat.text))}
              ${chip}
            </div>
          </div>
        </div>`;
      }

      if (beat.type === "beat" && beat.text) {
        lastSpeaker = null;
        return headings + `<div class="nr-pageable nr-line nr-turn" ${delay}>${_nrEsc(beat.text)}</div>`;
      }

      if (!beat.text) return "";
      lastSpeaker = null;
      return headings + `<div class="nr-pageable nr-line nr-narr" ${delay}>
        <p>${_nrMarkInnerQuotes(_nrEsc(beat.text))}</p>
        ${chip}
      </div>`;
    })
    .join("");

  return `
    ${data.logline ? `<p class="nr-pageable nr-logline">${_nrEsc(data.logline)}</p>` : ""}
    ${html}
    <div class="nr-pageable nr-end">
      <span>End of ${_nrEsc(data.title || "the chapter")}</span>
    </div>`;
}

async function _nrGetCached(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const wrapped = JSON.parse(raw);
    if (!wrapped || Date.now() - (wrapped.t || 0) > _NR_CACHE_TTL) return null;
    return wrapped.d;
  } catch {
    return null;
  }
}

function _nrPutCached(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data }));
  } catch {
    /* quota — the retelling regenerates next time, which is fine */
  }
}

/* ── Pagination ────────────────────────────────────────────────────────────
   The retelling reads as a sequence of screens rather than one long scroll.
   Beats are measured once at their natural height and grouped into pages that
   fit the viewport, so a page break never lands mid-bubble.

   Measurement has to happen with every beat visible — a hidden element has no
   height — so the order is: render all, measure all, then hide all but the
   current page. */
let _nrPages = [];
let _nrPageIdx = 0;

function _nrPaginate(keepIndex = 0) {
  const scroll = document.getElementById("nrScroll");
  const pager = document.getElementById("nrPager");
  if (!scroll) return;

  const items = [...scroll.querySelectorAll(".nr-pageable")];
  if (!items.length) {
    _nrPages = [];
    if (pager) pager.hidden = true;
    return;
  }

  items.forEach((el) => el.style.removeProperty("display"));

  const cs = getComputedStyle(scroll);
  const avail =
    scroll.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);

  // A zero height means the overlay hasn't been laid out yet (measured during
  // the rise, or while still display:none). Paginating against it puts every
  // beat on its own page — 58 pages for one chapter — so retry instead.
  if (avail <= 0) {
    setTimeout(() => _nrPaginate(keepIndex), 160);
    return;
  }

  _nrPages = [];
  let page = [];
  let pageTop = null;

  items.forEach((el) => {
    const top = el.offsetTop;
    if (pageTop === null) pageTop = top;
    // Break BEFORE the element that would overflow, never through it. The
    // `page.length` guard means a single beat taller than the screen still
    // gets its own page rather than an empty one — that page scrolls.
    if (page.length && top + el.offsetHeight - pageTop > avail) {
      _nrPages.push(page);
      page = [];
      pageTop = top;
    }
    page.push(el);
  });
  if (page.length) _nrPages.push(page);

  if (pager) pager.hidden = _nrPages.length < 2;
  _nrGoToPage(Math.min(keepIndex, _nrPages.length - 1));
}

function _nrGoToPage(idx) {
  const scroll = document.getElementById("nrScroll");
  if (!scroll || !_nrPages.length) return;

  _nrPageIdx = Math.max(0, Math.min(idx, _nrPages.length - 1));

  _nrPages.forEach((pg, p) =>
    pg.forEach((el) => {
      el.style.display = p === _nrPageIdx ? "" : "none";
    }),
  );

  // Replay the stagger for the page you just landed on — otherwise only the
  // first page ever animates and later pages just appear.
  _nrPages[_nrPageIdx].forEach((el, k) => {
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.removeProperty("animation");
    el.style.animationDelay = `${Math.min(k * 55, 500)}ms`;
  });

  scroll.scrollTop = 0;
  // Only a page holding one oversized beat needs to scroll; everything else
  // is locked so the screen can't drift half a beat out of frame.
  scroll.classList.toggle(
    "nr-scrollable-page",
    scroll.scrollHeight > scroll.clientHeight + 2,
  );

  const ind = document.getElementById("nrPageInd");
  if (ind) ind.textContent = `${_nrPageIdx + 1} / ${_nrPages.length}`;
  const prev = document.getElementById("nrPrev");
  const next = document.getElementById("nrNext");
  if (prev) prev.disabled = _nrPageIdx === 0;
  if (next) next.disabled = _nrPageIdx >= _nrPages.length - 1;
}

let _nrResizeTimer = null;
window.addEventListener("resize", () => {
  if (!_nrOpen || !_nrPages.length) return;
  clearTimeout(_nrResizeTimer);
  // Debounced because iOS fires resize continuously as the URL bar collapses.
  // Re-paginating keeps the beat you were on, so a rotation doesn't lose your
  // place — the page number would be meaningless at a new width.
  _nrResizeTimer = setTimeout(() => {
    const anchor = _nrPages[_nrPageIdx]?.[0];
    _nrPaginate(0);
    if (anchor) {
      const found = _nrPages.findIndex((pg) => pg.includes(anchor));
      if (found > -1) _nrGoToPage(found);
    }
  }, 220);
});

let _nrOpen = false;

async function openNarrate() {
  const payload = window.__aiPayload;
  if (!payload || !payload.versesText) {
    alert("Load a passage first.");
    return;
  }
  if (_nrOpen) return;
  _nrOpen = true;

  const overlay = document.getElementById("narrateOverlay");
  const scroll = document.getElementById("nrScroll");
  const titleEl = document.getElementById("nrTitle");
  if (!overlay || !scroll) return;

  const bookName = BIBLE_META[payload.book]?.name || payload.book;
  titleEl.textContent = `${bookName} ${payload.chapter}`;

  // Stage 1 — curtain wipes up over the reader, then the shell fades in
  // behind it. Both live on the same element so there's no flash between.
  overlay.hidden = false;
  document.body.classList.add("nr-locked");
  // Force a reflow between un-hiding and adding the class. Going straight from
  // display:none to the end state in the same frame means the browser has no
  // start value to interpolate from and the overlay just appears, unanimated.
  void overlay.offsetWidth;
  overlay.classList.add("nr-rising");

  // Stage 2 — loading. Shown immediately so the wait is never a blank screen.
  scroll.innerHTML = `<div class="nr-loading">
    ${sparkleLoaderHTML("Retelling this chapter…")}
    <p class="nr-loading-sub">Reading all ${bookName} ${payload.chapter}, finding who speaks.</p>
  </div>`;

  const cacheKey = `${_NR_CACHE_PREFIX}${payload.book}_${payload.chapter}`;

  try {
    let data = await _nrGetCached(cacheKey);
    if (!data) {
      const raw = await callGemini(
        _nrBuildPrompt(bookName, payload.chapter, payload.versesText),
        // Long chapters produce a lot of beats, and a truncated JSON object
        // fails to parse outright rather than degrading — so give it room.
        // Near-zero temperature: this is a copy-and-split task, so any
        // creative sampling shows up as the model "improving" a sentence.
        { maxOutputTokens: 8192, temperature: 0.1 },
      );
      data = _nrParse(raw);
      _nrPutCached(cacheKey, data);
    }

    // Stage 3 — swap loading for the scroll. The beats stagger themselves in
    // via animation-delay, so the screen fills rather than snapping.
    // Section headings, fetched in parallel with the retelling above. Usually
    // already cached by the reader, in which case this resolves instantly and
    // costs nothing.
    // Key by book ID, not payload.book — that's the uppercased NAME
    // ("JUDGES"), while the reader keys by ID ("JDG"). Passing it straight
    // through gave the two views separate caches, so each generated its own
    // wording and the same chapter had different section titles depending on
    // where you looked.
    const sections = await _fetchPassageSections(
      _bookNameToId(payload.book) || payload.book,
      payload.chapter,
      payload.versesText,
    ).catch(() => null);

    scroll.innerHTML = _nrRenderBeats(data, sections);
    _nrPageIdx = 0;
    // Wait a frame so fonts and wrapping have settled — measuring mid-layout
    // gives heights that are wrong by a line or two and pages break oddly.
    // The timeout is the fallback that actually matters: rAF does not run in a
    // background tab, and generation takes long enough that the app often IS
    // backgrounded when this lands. Without it the retelling falls back to one
    // long scroll and the pager never appears. Re-paginating is idempotent.
    requestAnimationFrame(() => _nrPaginate(0));
    setTimeout(() => _nrPaginate(_nrPageIdx), 120);
  } catch (err) {
    console.warn("[retell]", err);
    scroll.innerHTML = `<div class="nr-loading">
      <p class="nr-error">Couldn't retell this chapter.</p>
      <button type="button" class="nr-retry" id="nrRetry">Try again</button>
    </div>`;
    document.getElementById("nrRetry")?.addEventListener("click", () => {
      closeNarrate();
      setTimeout(openNarrate, 260);
    });
  }
}

function closeNarrate() {
  const overlay = document.getElementById("narrateOverlay");
  if (!overlay) return;
  overlay.classList.remove("nr-rising");
  overlay.classList.add("nr-falling");
  const done = () => {
    overlay.hidden = true;
    overlay.classList.remove("nr-falling");
    document.body.classList.remove("nr-locked");
    _nrOpen = false;
    // Drop the element references — they belong to markup that gets replaced
    // on the next open, and holding them would pin a dead DOM tree in memory.
    _nrPages = [];
    _nrPageIdx = 0;
  };
  // transitionend can be missed if the tab backgrounds mid-close; the timeout
  // guarantees the overlay never stays stuck over the reader.
  overlay.addEventListener("transitionend", done, { once: true });
  setTimeout(done, 700);
}

document.addEventListener("click", (e) => {
  if (e.target.closest?.("#nrClose")) closeNarrate();
  if (e.target.closest?.("#nrPrev")) _nrGoToPage(_nrPageIdx - 1);
  if (e.target.closest?.("#nrNext")) _nrGoToPage(_nrPageIdx + 1);

  // Verse chips open the peek sheet. Without this they'd fall through to the
  // global `a[href^="#"]` delegate in js/05-render-init.js, which would
  // smooth-scroll the reader hidden BEHIND this overlay — a scroll you can't
  // see, leaving the chip looking dead.
  const chip = e.target.closest?.("#narrateOverlay a.nr-chip");
  if (chip) {
    e.preventDefault();
    e.stopPropagation();
    const ref =
      chip.textContent.replace(/[^0-9,\-–\s]/g, "").trim() ||
      chip.getAttribute("href")?.replace("#", "");
    if (ref) openVersePeek(ref, chip);
  }
});
document.addEventListener("keydown", (e) => {
  if (!_nrOpen) return;
  if (e.key === "Escape") closeNarrate();
  if (e.key === "ArrowRight") _nrGoToPage(_nrPageIdx + 1);
  if (e.key === "ArrowLeft") _nrGoToPage(_nrPageIdx - 1);
});
