// ============================================================================
// notes.js — the MULTIPLY 2026 note format, shared by the editor and the
// read-only site so the two can never render the same notes differently.
//
// The stored note is plain text. Everything below is the grammar that turns it
// into typography:
//
//   ALL CAPS LINE            → sermon point (lime highlight, listed in the index)
//   Sentence with a CAPS word→ sub-point (yellow highlight, nested in the index)
//   first line of a session  → lede, set at display size
//   line under a point       → deck, that point's gloss
//   "quoted line"            → dialogue
//   line + "— Name"          → quotable quote, set as a pull quote
//   negation + counterpart   → antithesis couplet
//   - item                   → list item
//   line ending in ':'       → lead-in
//   Daniel 6:10              → scripture, fetched and folded into an accordion
//   Tagalog/Taglish          → italic
// ============================================================================

export const SESSIONS = [
  { id: "s1", day: "Day 1 · Friday, July 31",    time: "9:40 AM",  title: "Courage to Pray",    short: "S1",  chip: "S1 · Pray",    heading: "Session 1: Courage to Pray" },
  { id: "s2", day: "Day 1 · Friday, July 31",    time: "12:35 PM", title: "Courage to Move",    short: "S2",  chip: "S2 · Move",    heading: "Session 2: Courage to Move" },
  { id: "panel", day: "Day 1 · Friday, July 31", time: "2:00 PM",  title: "Panel Q&A",          short: "Q&A", chip: "Panel Q&A",    heading: "Panel Q&A" },
  { id: "s3", day: "Day 1 · Friday, July 31",    time: "3:30 PM",  title: "Courage to Worship", short: "S3",  chip: "S3 · Worship", heading: "Session 3: Courage to Worship" },
  { id: "s4", day: "Day 2 · Saturday, August 1", time: "9:30 AM",  title: "Courage to Lead",    short: "S4",  chip: "S4 · Lead",    heading: "Session 4: Courage to Lead" },
];

export const FIREBASE = {
  apiKey: "AIzaSyB8ahT56WbEUaGAymsRNNA-DrfZnUnWIwk",
  authDomain: "test-database-55379.firebaseapp.com",
  databaseURL: "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "test-database-55379",
};
export const DBURL = FIREBASE.databaseURL;
export const ROOT = "multiply2026/notes";

/* ── Scripture ────────────────────────────────────────────────────────── */
// Per-chapter files (~3.5 KB) rather than the 4.6 MB whole-bible JSON, so a
// phone on conference wifi only pulls the chapter actually referenced.
const BOOKS = ["genesis","exodus","leviticus","numbers","deuteronomy","joshua","judges","ruth","1-samuel","2-samuel","1-kings","2-kings","1-chronicles","2-chronicles","ezra","nehemiah","esther","job","psalms","proverbs","ecclesiastes","song-of-solomon","isaiah","jeremiah","lamentations","ezekiel","daniel","hosea","joel","amos","obadiah","jonah","micah","nahum","habakkuk","zephaniah","haggai","zechariah","malachi","matthew","mark","luke","john","acts","romans","1-corinthians","2-corinthians","galatians","ephesians","philippians","colossians","1-thessalonians","2-thessalonians","1-timothy","2-timothy","titus","philemon","hebrews","james","1-peter","2-peter","1-john","2-john","3-john","jude","revelation"];
const REF_RE = /^((?:[1-3]\s*)?[A-Za-z][A-Za-z\s]*?)\.?\s*(\d+)\s*:\s*(\d+)(?:\s*[-–]\s*(\d+))?$/;
const chapterCache = new Map();

function bookSlug(raw) {
  const s = raw.trim().toLowerCase().replace(/\.$/, "").replace(/\s+/g, "-");
  if (BOOKS.includes(s)) return s;
  const hits = BOOKS.filter((b) => b.startsWith(s) || b.replace(/-/g, "").startsWith(s.replace(/-/g, "")));
  return hits.length === 1 ? hits[0] : null;
}

export function parseRef(line) {
  const m = REF_RE.exec(line.trim());
  if (!m) return null;
  const slug = bookSlug(m[1]);
  if (!slug) return null;
  const from = +m[3], to = m[4] ? +m[4] : from;
  if (to < from) return null;
  const name = m[1].trim().replace(/\s+/g, " ");
  return { slug, chapter: m[2], from, to, name,
           label: `${name} ${m[2]}:${from}${to > from ? "–" + to : ""}` };
}

async function chapter(slug, ch) {
  const key = `${slug}/${ch}`;
  if (chapterCache.has(key)) return chapterCache.get(key);
  // Resolved against THIS module's URL, so it works from /multiply/ and from
  // /multiply/read/ alike without either page knowing the depth.
  const url = new URL(`../devo/nasb-split/${slug}/${ch}.json`, import.meta.url);
  const p = fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  chapterCache.set(key, p);
  return p;
}

/* ── Line grammar ─────────────────────────────────────────────────────── */
// Function words common in Tagalog that are NOT English words. "at", "may" and
// "din" are deliberately excluded — they'd fire on ordinary English lines.
const TAGALOG = new Set(["ang","ng","mga","na","sa","ay","yung","yun","nung","nito","niyan","ako","akin","sakin","ikaw","siya","niya","tayo","natin","satin","kayo","ninyo","nila","kanila","ito","iyan","yan","dito","doon","pero","kasi","dahil","kung","kaya","para","kaysa","tapos","wag","huwag","hindi","di","wala","meron","mayroon","marami","lang","naman","talaga","sana","dapat","baka","minsan","mas","agad","madali","mahirap","ganda","maganda","alam","gusto","nakikita","tao","diyos","buhay","puso","salita","panalangin","manalangin"]);
export function isTaglish(t) {
  const w = t.toLowerCase().match(/[a-zà-ÿ]+/g) || [];
  if (w.length < 3) return false;
  return new Set(w.filter((x) => TAGALOG.has(x))).size >= 2;
}

// *word* marks a word inline, in the same yellow used for a shouted word —
// a way to stress something mid-sentence without SHOUTING it.
const EMPH = /\*([^*\n]{1,60})\*/g;
export const inline = (s) => esc(s).replace(EMPH, '<span class="cap">$1</span>');

export const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));

// An ALL-CAPS line ("PROTECT YOUR PRIORITY") is a sermon point. Two words
// minimum and must start with a letter, so "(NASB 1995)" doesn't qualify.
export function isPoint(t) {
  const s = t.replace(/[:.]+$/, "").trim();
  if (!/^[A-Z]/.test(s)) return false;
  if (s !== s.toUpperCase() || s.length > 70) return false;
  const words = s.split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
  // A single shouted word is a heading too ("PERSPECTIVE"), but it needs some
  // length — a two-letter fragment on its own line usually isn't one.
  if (words.length < 2) return words.length === 1 && /^[A-Z]{4,}$/.test(words[0]);
  return (s.match(/[A-Za-z]/g) || []).length >= 3;
}

// A sub-point is a short line whose shouted word LANDS it — "He had a PLACE."
// Both conditions matter: shouting mid-sentence for emphasis ("it will allow us
// to MOVE where God wants you to go") is ordinary prose, not a heading, and
// treating it as one filled the index with fragments.
const CAPWORD = /\b[A-Z]{2,}(?:[’']?[A-Z]+)*(?:\s+[A-Z]{2,}(?:[’']?[A-Z]+)*)*\b/;
export function isSubPoint(t) {
  const s = t.trim().replace(/[.!?]+$/, "");
  if (s.length > 60 || !/[a-z]/.test(s)) return false;
  const shouts = s.match(new RegExp(CAPWORD.source, "g"));
  if (!shouts || !shouts.some((w) => w.replace(/\s/g, "").length >= 3)) return false;
  return s.endsWith(shouts[shouts.length - 1]);
}
const isOrdinal = (t) => /^(first|second|third|fourth|fifth|sixth|1st|2nd|3rd|4th|5th)[.:]?$/i.test(t.trim());
const isAttr = (t) => /^[—–]\s*\S/.test(t) && t.length <= 80;

// "1. Sin", "2) Distractions" — an enumerated list. These must be recognised
// before the deck and antithesis rules, or a list gets torn apart: the first
// item reads as the heading's gloss, and any item containing "not" pairs with
// the one after it as a couplet.
const NUM_RE = /^(\d{1,2})[.)]\s+(.+)$/;
const normal = (t) => t.trim().toLowerCase().replace(/[.:]+$/, "").replace(/\s+/g, " ");

// Panel Q&A — "Q: how do you…?" then "A: …", optionally "A (Ptr Marty): …".
// Fast to type live, and the pair renders as one exchange.
// Empty brackets are allowed — typing "A (): …" while the panelist's name
// hasn't landed yet is normal mid-panel, and it shouldn't drop out of the
// Q&A styling into raw text.
const QA_RE = /^([QA])\s*(?:\(([^)]{0,40})\))?\s*[:.\-]\s*(.+)$/;

// "Main Theme: Joshua 1:9" — the verse the whole talk hangs on. Shown in full
// rather than folded into an accordion: this is the one passage a reader should
// not have to click to see.
const THEME_RE = /^(main theme|theme|key verse|main passage|memory verse|main text)\s*:\s*(.+)$/i;
function themeRef(t) {
  const m = THEME_RE.exec(t.trim());
  if (!m) return null;
  const ref = parseRef(m[2]);
  return ref ? { label: m[1], ref } : null;
}

/* ── Vertical rhythm ──────────────────────────────────────────────────── */
const GAP = '<div class="gap"></div>';
// Blocks that already carry their own generous margin. A blank line next to one
// of these stacked on top of that margin — the uneven spacing where some gaps
// came out twice the size of others.
const AIRY = /^<(?:div class="anti"|blockquote|p class="(?:point|lede|ord|sub)\b)/;

function normalise(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b === GAP && out[out.length - 1] === GAP) continue;   // runs collapse to one
    out.push(b);
  }
  const spaced = [];
  for (let i = 0; i < out.length; i++) {
    if (out[i] === GAP) {
      const prev = spaced[spaced.length - 1], next = out[i + 1];
      if (!prev || !next) continue;                            // no leading/trailing gap
      if (AIRY.test(prev) || AIRY.test(next)) continue;
    }
    spaced.push(out[i]);
  }
  // A reference under a paragraph is that paragraph's source, not a free
  // floating block — close the gap and let it hug so they read as one group.
  for (let i = 0; i < spaced.length; i++) {
    if (!spaced[i].startsWith("<details")) continue;
    let j = i - 1;
    while (j >= 0 && spaced[j] === GAP) j--;
    if (j < 0 || spaced[j].startsWith("<details")) continue;   // two passages keep their air
    if (j < i - 1) { spaced.splice(j + 1, i - j - 1); i = j + 1; }
    spaced[i] = spaced[i].replace("<details", '<details class="tight"');
  }
  return spaced;
}

/* ── Render ───────────────────────────────────────────────────────────── */
let renderToken = 0;

// Paints `text` into `host`. Returns the points found, for the index.
// Verses fill in asynchronously so typing never blocks on a fetch.
export async function renderNotes(host, text, openRefs = new Set(), onOpenChange = null) {
  const token = ++renderToken;
  const lines = text.split("\n");
  const out = [], pending = [], points = [];
  let deckFor = -1;      // index into points[] whose gloss is next, or -1
  let deckNext = false;  // render the next plain line as a deck regardless
  let anchor = 0;        // id counter — not every anchor is indexed

  const skip = new Set(), quoteOf = new Map();

  // An outline item that comes back later as a standalone line is a section
  // heading — "1. Courage to Let Go" in the outline, then "Courage to Let Go"
  // heading its own section. That repeat is what marks the sermon's real points,
  // and it's what separates them from ordinary lists like "1. Sin, 2. Idols".
  const outlineAt = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = NUM_RE.exec(lines[i].trim());
    if (m && !outlineAt.has(normal(m[2]))) outlineAt.set(normal(m[2]), i);
  }
  const sectionOf = new Set();
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || NUM_RE.test(t)) continue;
    const at = outlineAt.get(normal(t));
    if (at !== undefined && at < i) sectionOf.add(i);
  }
  // When the talk states its own outline, those sections ARE the points. Other
  // shouted lines ("WHAT SHOULD I LET GO?") head supporting lists — they keep
  // their styling but stay out of the index, which otherwise buries the three
  // points the message is actually built on.
  // A numbered run whose items are separated by real content is an outline of
  // sections, not a list — "1. Seek God" then thirty lines, then "2. Faith in
  // God". A run whose items sit back to back ("1. Sin / 2. Distractions") is a
  // list. That spacing is the difference, and it's what tells session 3's three
  // points apart from session 2's inventories.
  const numAt = [];
  for (let i = 0; i < lines.length; i++) {
    const m = NUM_RE.exec(lines[i].trim());
    if (m) numAt.push({ i, n: +m[1] });
  }
  const spacedNum = new Set();
  for (let a = 0; a < numAt.length - 1; a++) {
    const cur = numAt[a], next = numAt[a + 1];
    if (next.n !== cur.n + 1) continue;                     // a different run
    const between = lines.slice(cur.i + 1, next.i).filter((l) => l.trim());
    if (!between.length) continue;                          // back to back: a list
    spacedNum.add(cur.i);
    spacedNum.add(next.i);
  }

  const hasOutline = sectionOf.size > 0 || spacedNum.size > 0;

  // Merge references that run on from each other — "Daniel 6:5-7" followed by
  // "Daniel 6:8-16" is one passage, 6:5–16.
  const refAt = new Map();
  for (let i = 0; i < lines.length; i++) {
    const r = parseRef(lines[i].trim());
    if (!r) continue;
    const cur = { ...r };
    let last = i;
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].trim()) continue;                 // blanks may separate them
      const n = parseRef(lines[j].trim());
      if (!n || n.slug !== cur.slug || n.chapter !== cur.chapter) break;
      if (n.from > cur.to + 1) break;                 // must be contiguous
      cur.to = Math.max(cur.to, n.to);
      last = j;
    }
    cur.label = `${cur.name} ${cur.chapter}:${cur.from}${cur.to > cur.from ? "–" + cur.to : ""}`;
    for (let k = i + 1; k <= last; k++) skip.add(k);
    refAt.set(i, cur);
    i = last;
  }

  // The last line is the charge the talk ends on — "Have the courage to GO."
  // Given display weight and a lime rule above it, so the notes land rather
  // than trailing off. Only plain prose qualifies; a verse or list keeps its own.
  let closerIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (!t) continue;
    if (!(parseRef(t) || NUM_RE.test(t) || isAttr(t) || isOrdinal(t) ||
          /^[-•*]\s+/.test(t) || themeRef(t) || QA_RE.test(t) || t.endsWith(":") || t.length > 90)) closerIdx = i;
    break;
  }

  // The session's first line is its opening statement — but only if it's plain
  // prose. If the notes open on a point or a verse, that keeps its own styling.
  let ledeIdx = lines.findIndex((l) => l.trim());
  if (ledeIdx >= 0) {
    const t = lines[ledeIdx].trim();
    if (isPoint(t) || isSubPoint(t) || isOrdinal(t) || parseRef(t) ||
        /^[-•*]\s+/.test(t) || /^["“”']/.test(t) || isAttr(t) || NUM_RE.test(t) ||
        themeRef(t) || QA_RE.test(t) || t.endsWith(":")) ledeIdx = -1;
  }

  // Quotable quotes: a plain line whose next non-blank neighbour is an em-dash
  // attribution. Looks forward, so it runs before the main loop.
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!isAttr(t)) continue;
    let q = i - 1;
    while (q >= 0 && !lines[q].trim()) q--;
    if (q < 0) continue;
    const qt = lines[q].trim();
    if (isPoint(qt) || isSubPoint(qt) || isOrdinal(qt) || parseRef(qt) ||
        /^[-•*]\s+/.test(qt) || qt.endsWith(":") || isAttr(qt) || NUM_RE.test(qt) || QA_RE.test(qt)) continue;
    quoteOf.set(q, { text: qt, by: t.replace(/^[—–]\s*/, "") });
    for (let k = q + 1; k <= i; k++) skip.add(k);
  }

  // Antithesis couplets: a negation immediately followed by its counterpart.
  // Adjacent lines only — a blank between them means two separate thoughts.
  const antiOf = new Map();
  const NEG = /\b(is\s?n[o']?t|does\s?n[o']?t|do\s?n[o']?t|was\s?n[o']?t|never|not)\b/i;
  const special = (t) =>
    isPoint(t) || isSubPoint(t) || isOrdinal(t) || parseRef(t) ||
    /^[-•*]\s+/.test(t) || /^["“”']/.test(t) || isAttr(t) || NUM_RE.test(t) || QA_RE.test(t) || t.endsWith(":");
  for (let i = 0; i < lines.length - 1; i++) {
    if (skip.has(i) || skip.has(i + 1) || quoteOf.has(i) || quoteOf.has(i + 1) || i === ledeIdx) continue;
    const a = lines[i].trim(), b = lines[i + 1].trim();
    if (!a || !b || a.length > 130 || b.length > 130) continue;
    if (!NEG.test(a) || special(a) || special(b)) continue;
    antiOf.set(i, { a, b });
    skip.add(i + 1);
    i++;                                              // never chain into a third line
  }

  for (let idx = 0; idx < lines.length; idx++) {
    if (skip.has(idx)) continue;

    if (antiOf.has(idx)) {
      const { a, b } = antiOf.get(idx);
      deckFor = -1;
      out.push(`<div class="anti">
        <p class="a ${isTaglish(a) ? "taglish" : ""}">${inline(a)}</p>
        <p class="b ${isTaglish(b) ? "taglish" : ""}">${inline(b)}</p></div>`);
      continue;
    }
    if (quoteOf.has(idx)) {
      const q = quoteOf.get(idx);
      deckFor = -1;
      out.push(`<blockquote class="qblock">
        <p class="qtext ${isTaglish(q.text) ? "taglish" : ""}">${esc(q.text)}</p>
        <p class="qby">${esc(q.by)}</p></blockquote>`);
      continue;
    }

    const line = lines[idx].trimEnd();
    if (!line.trim()) { out.push(GAP); continue; }

    if (idx === ledeIdx) {
      out.push(`<p class="lede ${isTaglish(line.trim()) ? "taglish" : ""}">${inline(line.trim())}</p>`);
      continue;
    }

    const ref = refAt.get(idx);
    if (ref) {
      pending.push({ slot: out.length, ref });
      out.push("");
      deckFor = -1;
      continue;
    }

    const t = line.trim();

    if (idx === closerIdx && idx !== ledeIdx) {
      const marked = inline(t).replace(CAPWORD, (w) => `<span class="cap">${w}</span>`);
      out.push(`<p class="closer ${isTaglish(t) ? "taglish" : ""}">${marked}</p>`);
      continue;
    }

    const qa = QA_RE.exec(t);
    if (qa) {
      const [, kind, who, body] = qa;
      deckFor = -1; deckNext = false;
      if (kind.toUpperCase() === "Q") {
        const id = `pt-${anchor++}`;
        points.push({ text: body.replace(/\s+/g, " ").trim(), level: 1, id, question: true });
        out.push(`<p class="qq" id="${id}">${inline(body)}</p>`);
      } else {
        const name = (who || "").trim();
        out.push(`<div class="qa">${name ? `<p class="who">${esc(name)}</p>` : ""}` +
                 `<p class="ans ${isTaglish(body) ? "taglish" : ""}">${inline(body)}</p></div>`);
      }
      continue;
    }

    const theme = themeRef(t);
    if (theme) {
      pending.push({ slot: out.length, ref: theme.ref, full: true });
      out.push("");
      deckFor = -1; deckNext = false;
      continue;
    }

    // A repeated outline item — the section this point actually covers.
    if (sectionOf.has(idx)) {
      const id = `pt-${anchor++}`;
      points.push({ text: t.replace(/[:.]+$/, "").trim(), level: 1, id });
      out.push(`<p class="point" id="${id}"><span>${esc(t)}</span></p>`);
      deckFor = points.length - 1; deckNext = true;
      continue;
    }

    const num = NUM_RE.exec(t);
    if (num && spacedNum.has(idx)) {
      // Heads its own section, so it reads and indexes as a point.
      const id = `pt-${anchor++}`;
      points.push({ text: num[2].replace(/[:.]+$/, "").trim(), level: 1, id });
      out.push(`<p class="point" id="${id}"><span>${esc(num[2])}</span></p>`);
      deckFor = points.length - 1; deckNext = true;
      continue;
    }
    if (num) {
      deckFor = -1; deckNext = false;
      out.push(`<p class="num"><span class="n">${num[1]}.</span><span>${inline(num[2])}</span></p>`);
      continue;
    }

    if (isOrdinal(t)) { deckFor = -1; deckNext = false; out.push(`<p class="ord">${esc(t.replace(/[.:]$/, ""))}</p>`); continue; }
    if (isPoint(t)) {
      const id = `pt-${anchor++}`;
      if (!hasOutline) { points.push({ text: t.replace(/[:.]+$/, "").trim(), level: 1, id }); deckFor = points.length - 1; }
      else deckFor = -1;
      out.push(`<p class="point" id="${id}"><span>${esc(t)}</span></p>`);
      deckNext = true;
      continue;
    }
    if (isSubPoint(t)) {
      const id = `pt-${anchor++}`;
      if (points.length) points.push({ text: t.replace(/[.]+$/, "").trim(), level: 2, id });
      const marked = esc(t).replace(CAPWORD, (w) => `<span class="cap">${w}</span>`);
      out.push(`<p class="sub" id="${id}">${marked}</p>`);
      deckFor = -1; deckNext = false;
      continue;
    }
    if (/^[-•*]\s+/.test(t)) { deckFor = -1; deckNext = false; out.push(`<p class="item">${inline(t.replace(/^[-•*]\s+/, ""))}</p>`); continue; }
    if (/^["“”']/.test(t))   { deckFor = -1; deckNext = false; out.push(`<p class="dialogue">${esc(t)}</p>`); continue; }
    if (t.endsWith(":"))     { deckFor = -1; deckNext = false; out.push(`<p class="lead">${esc(t)}</p>`); continue; }

    if (deckNext) {
      if (deckFor >= 0) points[deckFor].deck = t;
      deckFor = -1; deckNext = false;
      out.push(`<p class="deck ${isTaglish(t) ? "taglish" : ""}">${inline(t)}</p>`);
      continue;
    }
    out.push(`<p class="${isTaglish(t) ? "taglish" : ""}">${inline(t)}</p>`);
  }

  // Collapsed by default — the reference is the note, the verse is on demand.
  // Which ones are open is remembered, because the preview is rebuilt on every
  // keystroke and an open passage would otherwise slam shut mid-sentence.
  for (const { slot, ref, full } of pending) {
    if (full) {
      out[slot] = `<section class="theme">
        <p class="tlabel">Main theme</p>
        <p class="tverse" data-k="${slot}">loading…</p>
        <p class="tref">${esc(ref.label)}</p></section>`;
      continue;
    }
    out[slot] = `<details ${openRefs.has(ref.label) ? "open" : ""} data-ref="${esc(ref.label)}">
      <summary><span class="ms chev">chevron_right</span>${esc(ref.label)}</summary>
      <div class="verse" data-k="${slot}">loading…</div></details>`;
  }

  host.innerHTML = normalise(out).join("");

  host.querySelectorAll("details[data-ref]").forEach((d) => {
    d.addEventListener("toggle", () => {
      d.open ? openRefs.add(d.dataset.ref) : openRefs.delete(d.dataset.ref);
      onOpenChange?.(openRefs);
    });
  });

  for (const { slot, ref } of pending) {
    const ch = await chapter(ref.slug, ref.chapter);
    if (token !== renderToken) return points;          // a newer render superseded us
    const node = host.querySelector(`[data-k="${slot}"]`);
    if (!node) continue;
    if (!ch) { node.textContent = "verse not found"; continue; }
    const parts = [];
    for (let v = ref.from; v <= ref.to; v++) {
      if (!ch[String(v)]) continue;
      parts.push(ref.to > ref.from ? `<b>${v}</b> ${esc(ch[String(v)])}` : esc(ch[String(v)]));
    }
    node.innerHTML = parts.join(" ") || "verse not found";
  }
  return points;
}

/* ── Points index ─────────────────────────────────────────────────────── */
// Main points number 01, 02… ; sub-points letter a, b, c and reset under each.
export const indexLabel = (points) =>
  points.length && points.every((p) => p.question) ? "Questions" : "Points";

export function pointsHTML(points) {
  let main = 0, sub = 0;
  return points.map((p, i) => {
    const top = p.level === 1;
    if (top) { main++; sub = 0; } else { sub++; }
    const marker = top ? String(main).padStart(2, "0") : String.fromCharCode(96 + sub);
    return `
    <li class="${top ? (main > 1 ? "pt-1.5" : "") : "pl-6"}">
      <button data-pt="${p.id}" class="ptBtn group w-full text-left flex items-baseline gap-2.5 py-0.5">
        <span class="text-[10px] font-bold ${top ? "text-faint" : "text-faint/70"} tabular-nums pt-0.5 w-4 shrink-0">${marker}</span>
        <span class="${top
            ? "text-[13px] font-semibold tracking-[0.09em] uppercase decoration-lime"
            : "text-[12.5px] font-normal text-muted decoration-yellow"}
          group-hover:underline decoration-2 underline-offset-4">${esc(p.text)}</span>
      </button>
    </li>`;
  }).join("");
}

/* ── Poster wordmark ──────────────────────────────────────────────────── */
// On the poster, "THE COURAGE TO" and "JOSHUA 1:9" are tracked out until they
// span the exact width of MULTIPLY. A fixed letter-spacing can't do that — the
// gap has to be derived from the wordmark's width — so each character becomes a
// flex child and space-between distributes the slack.
export function spreadMark(root = document) {
  root.querySelectorAll(".spread").forEach((el) => {
    if (el.dataset.spread) return;                  // already done
    const text = (el.textContent || "").trim();
    el.dataset.spread = "1";
    el.textContent = "";
    for (const ch of text) {
      const s = document.createElement("span");
      s.textContent = ch === " " ? " " : ch;   // thin space keeps words apart
      el.appendChild(s);
    }
  });
}
