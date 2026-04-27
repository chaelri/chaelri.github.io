// ============================================================================
// SNS DQ — Discussion Questions Generator
// ----------------------------------------------------------------------------
// Paste questions → Gemini formats (bold + italic emphasis only, no rewording)
// → render onto the SNS template canvas → copy / download / upload to Drive.
// ============================================================================

const GEMINI_PROXY = "https://gemini-proxy-668755364170.asia-southeast1.run.app";
const DRIVE_UPLOAD_URL = `${GEMINI_PROXY}/upload-drive`;
// Folder is hardcoded server-side in gemini-proxy/index.js (SNS_DQ_FOLDER_ID).
// The proxy authenticates as the Cloud Run service account; the target folder
// must be shared (Editor) with that SA email for uploads to succeed.

// ----------------------------------------------------------------------------
// Layout constants — measured against the 1920×1080 template
// ----------------------------------------------------------------------------
const LAYOUT = {
  width: 1920,
  height: 1080,
  // Content rect — measured against the pre-stamped template:
  //   "Discussion Questions:" sits at x≈168..1099, y≈156..234.
  //   We start below it (y=280) and align the "1." with the "D" (x=168).
  contentX: 168,
  contentY: 280,
  contentW: 1532,   // 1700 - 168, leaves ~220px right margin to clear the SNS logo
  contentH: 660,    // ends at y=940, leaving ~140px bottom padding
  // Vertical breathing room between numbered items
  itemGap: 28,
  // Multiplier for line height
  lineHeightRatio: 1.2,
  // Auto-fit — the upper bound is intentionally generous so short inputs
  // (1-2 short questions) scale up to fill the canvas like the SNS reference,
  // not just sit small in the middle.
  fontSizeMin: 36,
  fontSizeMax: 104,
  fontSizeStep: 2,
};

// ----------------------------------------------------------------------------
// State
// ----------------------------------------------------------------------------
let templateImage = null;
let lastFormatted = null;   // { questions: [{runs}], rawText }
let fontsReady = false;

// ----------------------------------------------------------------------------
// DOM
// ----------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const els = {
  input: $("dq-input"),
  generate: $("btn-generate"),
  regen: $("btn-regen"),
  copy: $("btn-copy"),
  download: $("btn-download"),
  drive: $("btn-drive"),
  canvas: $("canvas"),
  empty: $("canvas-empty"),
  loading: $("canvas-loading"),
  loadingText: $("loading-text"),
  status: $("status"),
  sizeMode: $("size-mode"),
  sizeManual: $("size-manual"),
  sizeManualVal: $("size-manual-val"),
  filename: $("filename"),
  driveResult: $("drive-result"),
  driveLink: $("drive-link"),
  driveFilename: $("drive-filename"),
  copyLink: $("btn-copy-link"),
  copyLinkIcon: $("copy-link-icon"),
  copyLinkLabel: $("copy-link-label"),
  filenamePreview: $("filename-preview"),
  help: $("btn-help"),
  helpModal: $("help-modal"),
  helpClose: $("help-close"),
  zoomModal: $("zoom-modal"),
  zoomImg: $("zoom-img"),
  zoomClose: $("zoom-close"),
};

// ----------------------------------------------------------------------------
// PWA share-target intake
// ----------------------------------------------------------------------------
// manifest.json declares this app as a share_target with method GET, so when
// the user shares text from another app (WhatsApp, Messenger, etc.) the OS
// opens us at "?text=...&title=...&url=...". Pre-fill the textarea with that.
// Returns true if a share was received, so the caller can skip the localStorage
// restore step.
function consumeShareTargetParams() {
  const params = new URLSearchParams(window.location.search);
  const title = params.get("title") || "";
  const text = params.get("text") || "";
  const url = params.get("url") || "";
  const combined = [title, text, url].filter(Boolean).join("\n").trim();
  if (!combined) return false;
  els.input.value = combined;
  // Wipe the query string so a refresh doesn't re-prefill the same content.
  history.replaceState({}, "", window.location.pathname);
  return true;
}

// ----------------------------------------------------------------------------
// Persistence — input + last formatted result survive reloads / PWA reopens
// ----------------------------------------------------------------------------
const STORAGE = { input: "snsdq_input", formatted: "snsdq_last_formatted" };

let saveInputTimer;
function persistInput() {
  clearTimeout(saveInputTimer);
  saveInputTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE.input, els.input.value); } catch {}
  }, 400);
}
function persistFormatted(formatted) {
  try { localStorage.setItem(STORAGE.formatted, JSON.stringify(formatted)); } catch {}
}
function restoreSavedInput() {
  const v = localStorage.getItem(STORAGE.input);
  if (v) els.input.value = v;
}
function restoreLastFormatted() {
  const raw = localStorage.getItem(STORAGE.formatted);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.questions?.length) return parsed;
  } catch {}
  return null;
}

// ----------------------------------------------------------------------------
// Per-button loading / success feedback
// ----------------------------------------------------------------------------
// All action buttons follow the shape:
//   <button>
//     <span class="material-symbols-outlined ...">icon_name</span>
//     <span>Label</span>
//   </button>
// withButtonFeedback swaps the icon to a spinner + label to runningLabel
// while the async `run` is in flight, optionally flashes a success state
// (icon=check, label=successLabel) for ~1.6s, then restores the original.
async function withButtonFeedback(btn, { runningLabel, successLabel = null, run }) {
  const spans = btn.querySelectorAll("span");
  const iconEl = spans[0];
  const labelEl = spans[1];
  const origIcon = iconEl?.textContent;
  const origLabel = labelEl?.textContent;
  const wasDisabled = btn.disabled;

  const restore = () => {
    if (iconEl) {
      iconEl.classList.remove("animate-spin");
      iconEl.textContent = origIcon;
    }
    if (labelEl) labelEl.textContent = origLabel;
    btn.disabled = wasDisabled;
    // Re-sync input-dependent buttons so they don't get stuck enabled when
    // input is empty.
    syncInputButtons();
  };

  btn.disabled = true;
  if (iconEl) {
    iconEl.textContent = "progress_activity";
    iconEl.classList.add("animate-spin");
  }
  if (labelEl && runningLabel) labelEl.textContent = runningLabel;

  try {
    const result = await run();
    if (successLabel) {
      if (iconEl) {
        iconEl.classList.remove("animate-spin");
        iconEl.textContent = "check";
      }
      if (labelEl) labelEl.textContent = successLabel;
      setTimeout(restore, 1600);
    } else {
      restore();
    }
    return result;
  } catch (e) {
    restore();
    throw e;
  }
}

// Warm the proxy on load (skip cold-start tax for first generate).
fetch(GEMINI_PROXY, { method: "GET", cache: "no-store", keepalive: true }).catch(() => {});

// ----------------------------------------------------------------------------
// Fonts — load Open Sauce Sans variants via FontFace
// ----------------------------------------------------------------------------
const FONTS = [
  ["assets/fonts/OpenSauceSans-Regular.ttf", { weight: "400", style: "normal" }],
  ["assets/fonts/OpenSauceSans-SemiBold.ttf", { weight: "600", style: "normal" }],
  ["assets/fonts/OpenSauceSans-Bold.ttf", { weight: "700", style: "normal" }],
  ["assets/fonts/OpenSauceSans-BoldItalic.ttf", { weight: "700", style: "italic" }],
  ["assets/fonts/OpenSauceSans-ExtraBold.ttf", { weight: "800", style: "normal" }],
  ["assets/fonts/OpenSauceSans-ExtraBoldItalic.ttf", { weight: "800", style: "italic" }],
];

async function loadFonts() {
  const tasks = FONTS.map(async ([url, descriptors]) => {
    const face = new FontFace("Open Sauce Sans", `url(${url})`, descriptors);
    await face.load();
    document.fonts.add(face);
  });
  await Promise.all(tasks);
  fontsReady = true;
}

// ----------------------------------------------------------------------------
// Template image preload
// ----------------------------------------------------------------------------
function loadTemplate() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { templateImage = img; resolve(); };
    img.onerror = reject;
    img.src = "assets/template.png";
  });
}

// ----------------------------------------------------------------------------
// Input parser — pre-clean text into a clean array of questions before sending
// to Gemini, so the AI can't miscount or include headers.
// ----------------------------------------------------------------------------

// Numbered prefix at the start of a line: "1.", "2)", "Q1:", "(1)", etc.
const NUMBER_PREFIX_RE = /^\s*(?:\d+[.)]|Q\d+[:.]?|\(\d+\)[.):]?)\s+/i;

// Header-only lines we still want to drop in the un-numbered fallback path
// (when the user pastes plain prose questions with no numbering).
const HEADER_LINE_RE =
  /^\s*(?:discussion\s*questions?|questions?|reflect(?:ion)?|sharing|small\s*group|small\s*group\s*questions?|sermon\s*notes?)\s*[:\-–]?.*$/i;

function splitQuestions(text) {
  const lines = text.split(/\n/).map((l) => l.trim());
  const hasAnyNumbered = lines.some((l) => NUMBER_PREFIX_RE.test(l));

  // Strong rule: if numbered prefixes exist anywhere in the input, treat them
  // as the source of truth. Anything BEFORE the first numbered line, or any
  // un-numbered line that doesn't directly continue a numbered one, is
  // preamble (e.g. "Discussion Questions: *PENDING APPROVAL") and gets dropped.
  if (hasAnyNumbered) {
    const result = [];
    let acc = null; // null = not currently inside a question
    const flush = () => { if (acc) { result.push(acc.join(" ")); acc = null; } };
    for (const line of lines) {
      if (!line) { flush(); continue; }
      if (NUMBER_PREFIX_RE.test(line)) {
        flush();
        acc = [line.replace(NUMBER_PREFIX_RE, "")];
      } else if (acc) {
        // Continuation of the current numbered item (wrapped text).
        acc.push(line);
      }
      // else: pre-question preamble — drop silently.
    }
    flush();
    return result.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  }

  // No numbered prefixes anywhere — fall back to blank-line block splitting,
  // and drop any block whose first line looks like a heading.
  const blocks = text
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);
  return blocks
    .filter((b) => !HEADER_LINE_RE.test(b.split("\n")[0]))
    .map((b) => b.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function normalize(s) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

// ----------------------------------------------------------------------------
// Gemini call — formatting only, no rewording
// ----------------------------------------------------------------------------
const FORMAT_PROMPT = `You format Discussion Questions for a graphic.

You are given a JSON array of questions, already cleaned (no headers, no
numbering — just the question text). Format each by splitting it into runs
with style "normal", "bold", or "italic".

Return ONLY valid minified JSON matching this schema (no markdown, no commentary):
{"questions":[{"runs":[{"t":"...","s":"normal"|"bold"|"italic"}]}]}

CRITICAL RULES:
1. Output exactly one element in "questions" per input question, in the same order. Do not skip, merge, split, reorder, or add questions.
2. Concatenating all "t" values within a question (in order) MUST reproduce that question EXACTLY — same characters, spaces, punctuation. Do NOT rephrase, fix typos, or add/remove words.
3. Emphasis taxonomy:
   • "italic" = THE central verb or adjective whose meaning the question hinges on (the action / quality the discussion is really probing). Pick 1, occasionally 2 per question.
   • "bold"   = important nouns, themes, or short noun phrases (1–4 words) that anchor the meaning so a reader can scan and grasp the question.
   • "normal" = connecting / filler words.
4. Aim for ~25–40% of words emphasized total. The bold/italic words alone should let a reader skim and grasp the question.
5. Whitespace: preserve spaces. Trailing/leading spaces inside runs are fine — only the concatenation must match.

EXAMPLE
Input:
["How do we dishonor God's name, and how can we honor it in our daily lives?"]

Output:
{"questions":[{"runs":[{"t":"How do we ","s":"normal"},{"t":"dishonor","s":"italic"},{"t":" ","s":"normal"},{"t":"God's name","s":"bold"},{"t":", and how can we ","s":"normal"},{"t":"honor","s":"italic"},{"t":" it in our ","s":"normal"},{"t":"daily lives","s":"bold"},{"t":"?","s":"normal"}]}]}

Now format this input. Return ONLY the JSON.

Input:
`;

async function formatWithGemini(questions) {
  const body = {
    contents: [{ parts: [{ text: FORMAT_PROMPT + JSON.stringify(questions) }] }],
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
    },
  };
  const r = await fetch(GEMINI_PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini");

  // Strip code fences if any sneak through.
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error("Bad JSON from Gemini:", text);
    throw new Error("AI returned invalid JSON. Try Reformat.");
  }
  if (!parsed?.questions?.length) throw new Error("AI returned no questions.");
  return parsed;
}

// ----------------------------------------------------------------------------
// Per-question verification: AI output must concatenate to the input verbatim
// (whitespace-normalized). On mismatch, fall back to literal text so wording
// is never silently changed.
// ----------------------------------------------------------------------------
function reconcileWithInput(parsed, inputs) {
  const out = inputs.map((target, i) => {
    const q = parsed.questions[i];
    if (q && q.runs?.length) {
      const concat = q.runs.map((r) => r.t).join("");
      if (normalize(concat) === normalize(target)) return q;
      console.warn(`Question ${i + 1} mismatch — falling back to literal.`, { concat, target });
    }
    return { runs: [{ t: target, s: "normal" }] };
  });
  return { questions: out };
}

// ----------------------------------------------------------------------------
// Canvas rendering
// ----------------------------------------------------------------------------
function styleToFont(size, style) {
  // Three-tier emphasis with wide contrast matching the SNS reference sample:
  //   normal → Regular (400)    — body / connecting words, clearly lighter
  //   bold   → Bold (700)       — noun-phrase anchors, clearly heavier
  //   italic → Bold Italic      — key verb / adjective, heavier + slant
  switch (style) {
    case "italic":
      return `italic 700 ${size}px "Open Sauce Sans"`;
    case "bold":
      return `700 ${size}px "Open Sauce Sans"`;
    case "normal":
    default:
      return `400 ${size}px "Open Sauce Sans"`;
  }
}

// Tokenize a question's runs into measurable atoms: each atom is a non-breaking
// chunk of text in a single style, plus an optional 'breakable' flag for spaces.
function runsToAtoms(runs) {
  const atoms = [];
  for (const run of runs) {
    // Split text on whitespace, keeping the whitespace as separate breakable atoms.
    const parts = run.t.split(/(\s+)/);
    for (const part of parts) {
      if (!part) continue;
      atoms.push({
        text: part,
        style: run.s || "normal",
        space: /^\s+$/.test(part),
      });
    }
  }
  return atoms;
}

function measureAtoms(ctx, atoms, size) {
  for (const a of atoms) {
    ctx.font = styleToFont(size, a.style);
    a.width = ctx.measureText(a.text).width;
  }
}

// Greedy word-wrap. Returns array of lines; each line is array of atoms.
function wrapAtoms(atoms, maxWidth) {
  const lines = [];
  let cur = [];
  let curW = 0;
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    if (a.space) {
      if (cur.length === 0) continue; // leading space — drop
      // peek next non-space chunk width
      let nextW = 0;
      let j = i + 1;
      while (j < atoms.length && !atoms[j].space) {
        nextW += atoms[j].width;
        j++;
      }
      if (curW + a.width + nextW > maxWidth) {
        // wrap before the next word
        lines.push(cur);
        cur = [];
        curW = 0;
        // skip the space (don't put a leading space on next line)
      } else {
        cur.push(a);
        curW += a.width;
      }
    } else {
      if (curW + a.width > maxWidth && cur.length > 0) {
        lines.push(cur);
        cur = [];
        curW = 0;
      }
      cur.push(a);
      curW += a.width;
    }
  }
  if (cur.length) lines.push(cur);
  // Trim trailing spaces from each line
  for (const line of lines) {
    while (line.length && line[line.length - 1].space) line.pop();
  }
  return lines;
}

function layoutQuestions(ctx, questions, size) {
  const lineH = Math.round(size * LAYOUT.lineHeightRatio);
  // Determine number prefix width ("1. ") at this size, in ExtraBold.
  ctx.font = styleToFont(size, "normal");
  const prefixW = ctx.measureText("1. ").width;
  const wrapW = LAYOUT.contentW - prefixW;

  const result = [];
  let y = LAYOUT.contentY;
  for (let i = 0; i < questions.length; i++) {
    const atoms = runsToAtoms(questions[i].runs);
    measureAtoms(ctx, atoms, size);
    const lines = wrapAtoms(atoms, wrapW);
    result.push({ index: i + 1, lines, prefixW, y, lineH });
    y += lines.length * lineH + LAYOUT.itemGap;
  }
  const totalH = y - LAYOUT.contentY - LAYOUT.itemGap;
  return { result, totalH, lineH };
}

function fitFontSize(ctx, questions) {
  for (let size = LAYOUT.fontSizeMax; size >= LAYOUT.fontSizeMin; size -= LAYOUT.fontSizeStep) {
    const { totalH } = layoutQuestions(ctx, questions, size);
    if (totalH <= LAYOUT.contentH) return size;
  }
  return LAYOUT.fontSizeMin;
}

function renderToCanvas(parsed, opts = {}) {
  const ctx = els.canvas.getContext("2d");
  ctx.clearRect(0, 0, LAYOUT.width, LAYOUT.height);
  if (templateImage) ctx.drawImage(templateImage, 0, 0, LAYOUT.width, LAYOUT.height);

  const questions = parsed.questions;
  const size = opts.fontSize || fitFontSize(ctx, questions);
  const { result, lineH } = layoutQuestions(ctx, questions, size);

  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "alphabetic";

  for (const q of result) {
    // Number prefix
    ctx.font = styleToFont(size, "normal");
    const prefix = `${q.index}. `;
    let textBaseY = q.y + size; // baseline at bottom of cap line
    ctx.fillText(prefix, LAYOUT.contentX, textBaseY);

    // Each wrapped line
    for (let li = 0; li < q.lines.length; li++) {
      const line = q.lines[li];
      let x = LAYOUT.contentX + q.prefixW;
      const lineY = q.y + size + li * lineH;
      for (const atom of line) {
        ctx.font = styleToFont(size, atom.style);
        ctx.fillText(atom.text, x, lineY);
        x += atom.width;
      }
    }
  }

  els.empty.classList.add("hidden");
  return { fontSize: size };
}

// ----------------------------------------------------------------------------
// Generate flow
// ----------------------------------------------------------------------------
async function generate({ regen = false } = {}) {
  const text = els.input.value.trim();
  if (!text) {
    setStatus("Paste at least one question first.");
    els.input.focus();
    return;
  }

  setLoading(regen ? "Reformatting…" : "Formatting…");
  try {
    if (!fontsReady || !templateImage) {
      await Promise.all([loadFonts(), loadTemplate()]);
    }
    const questions = splitQuestions(text);
    if (!questions.length) {
      throw new Error("No questions found. Each question should be on its own line.");
    }
    const aiOut = await formatWithGemini(questions);
    const reconciled = reconcileWithInput(aiOut, questions);
    lastFormatted = { ...reconciled, rawText: text };
    persistFormatted(lastFormatted);

    const opts = {};
    if (!els.sizeMode.checked) opts.fontSize = parseInt(els.sizeManual.value, 10);
    renderToCanvas(reconciled, opts);

    enableActions(true);
    setStatus("");
  } catch (e) {
    console.error(e);
    setStatus(`Error: ${e.message}`);
    throw e;
  } finally {
    setLoading(false);
  }
}

function rerender() {
  if (!lastFormatted) return;
  const opts = {};
  if (!els.sizeMode.checked) opts.fontSize = parseInt(els.sizeManual.value, 10);
  renderToCanvas(lastFormatted, opts);
}

function enableActions(enabled) {
  els.copy.disabled = !enabled;
  els.download.disabled = !enabled;
  els.drive.disabled = !enabled;
  // Regen also depends on whether the textarea currently has content.
  els.regen.disabled = !enabled || !els.input.value.trim();
}

function syncInputButtons() {
  const hasInput = !!els.input.value.trim();
  els.generate.disabled = !hasInput;
  // Reformat needs both a prior result AND non-empty input.
  els.regen.disabled = !hasInput || !lastFormatted;
}

function setLoading(textOrFalse) {
  if (textOrFalse) {
    els.loadingText.textContent = textOrFalse;
    els.loading.classList.remove("hidden");
    els.loading.classList.add("flex");
  } else {
    els.loading.classList.add("hidden");
    els.loading.classList.remove("flex");
  }
}
function setStatus(msg) {
  els.status.textContent = msg || "";
}

// ----------------------------------------------------------------------------
// Export — blob, copy, download
// ----------------------------------------------------------------------------
function canvasToBlob() {
  return new Promise((resolve) => {
    els.canvas.toBlob((b) => resolve(b), "image/png");
  });
}

async function copyImage() {
  const blob = await canvasToBlob();
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

function defaultFilename() {
  const custom = els.filename.value.trim();
  if (custom) return custom.endsWith(".png") ? custom : `${custom}.png`;
  // Naming convention: "DQ SNS <Full Month> <Day>.png"  (e.g. "DQ SNS April 27.png")
  const d = new Date();
  const month = d.toLocaleString("en-US", { month: "long" });
  return `DQ SNS ${month} ${d.getDate()}.png`;
}

function updateFilenamePreview() {
  if (els.filenamePreview) els.filenamePreview.textContent = defaultFilename();
  // Also keep the Filename input's placeholder in sync with today's auto-name.
  if (els.filename && !els.filename.value) {
    const today = defaultFilename().replace(/\.png$/, "");
    els.filename.placeholder = today;
  }
}

async function downloadImage() {
  const blob = await canvasToBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = defaultFilename();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function flashStatus(msg) {
  setStatus(msg);
  setTimeout(() => { if (els.status.textContent === msg) setStatus(""); }, 2200);
}

// ----------------------------------------------------------------------------
// Drive upload — POST PNG to gemini-proxy /upload-drive
// ----------------------------------------------------------------------------
// The proxy auths as the Cloud Run service account and uploads to a hardcoded
// folder. No OAuth in the browser. Charlie shares the folder with the SA once.

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => {
      const url = r.result;
      const i = url.indexOf(",");
      resolve(i >= 0 ? url.slice(i + 1) : url);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function uploadToDrive() {
  if (!lastFormatted) return;
  const blob = await canvasToBlob();
  const imageBase64 = await blobToBase64(blob);
  const filename = defaultFilename();

  const r = await fetch(DRIVE_UPLOAD_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, imageBase64 }),
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    throw new Error(`Drive upload failed (${r.status}): ${errText.slice(0, 200)}`);
  }
  const { link } = await r.json();
  if (!link) throw new Error("Upload succeeded but no link returned.");

  els.driveLink.href = link;
  els.driveLink.dataset.url = link;
  els.driveFilename.textContent = filename;
  els.driveResult.classList.remove("hidden");
}

// ----------------------------------------------------------------------------
// UI wiring
// ----------------------------------------------------------------------------
els.generate.addEventListener("click", () =>
  withButtonFeedback(els.generate, {
    runningLabel: "Generating…",
    run: () => generate({ regen: false }),
  }).catch(() => {}) // error already surfaced via setStatus inside generate()
);
els.regen.addEventListener("click", () =>
  withButtonFeedback(els.regen, {
    runningLabel: "Reformatting…",
    run: () => generate({ regen: true }),
  }).catch(() => {})
);
els.copy.addEventListener("click", () =>
  withButtonFeedback(els.copy, {
    runningLabel: "Copying…",
    successLabel: "Copied!",
    run: copyImage,
  }).catch((e) => setStatus(`Copy failed: ${e.message}`))
);
els.download.addEventListener("click", () =>
  withButtonFeedback(els.download, {
    runningLabel: "Saving…",
    successLabel: "Saved!",
    run: downloadImage,
  }).catch((e) => setStatus(`Download failed: ${e.message}`))
);
els.drive.addEventListener("click", () =>
  withButtonFeedback(els.drive, {
    runningLabel: "Uploading…",
    successLabel: "Uploaded!",
    run: uploadToDrive,
  }).catch((e) => setStatus(`Drive error: ${e.message}`))
);

els.copyLink.addEventListener("click", async () => {
  const link = els.driveLink.dataset.url || els.driveLink.href;
  try {
    await navigator.clipboard.writeText(link);
    // Inline feedback inside the button itself — momentary check + "Copied!"
    els.copyLinkIcon.textContent = "check";
    els.copyLinkLabel.textContent = "Copied!";
    setTimeout(() => {
      els.copyLinkIcon.textContent = "content_copy";
      els.copyLinkLabel.textContent = "Copy link";
    }, 1600);
  } catch {
    setStatus("Couldn't copy link to clipboard.");
  }
});

// Cmd/Ctrl + Enter from textarea triggers generate
els.input.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    if (!els.generate.disabled) generate({ regen: false });
  }
});

// Toggle Generate / Reformat + persist input as user types.
els.input.addEventListener("input", () => {
  syncInputButtons();
  persistInput();
});

// Custom-filename input updates the live preview hint.
els.filename.addEventListener("input", updateFilenamePreview);

// Initial state — share-target wins over localStorage; otherwise restore.
if (!consumeShareTargetParams()) restoreSavedInput();
syncInputButtons();
updateFilenamePreview();

// ----------------------------------------------------------------------------
// Canvas zoom (tap canvas → fullscreen lightbox)
// ----------------------------------------------------------------------------
els.canvas.addEventListener("click", () => {
  // Snapshot the current canvas as a data URL into the lightbox img.
  els.zoomImg.src = els.canvas.toDataURL("image/png");
  els.zoomModal.showModal();
});
els.zoomClose.addEventListener("click", () => els.zoomModal.close());
// Click on the backdrop (dialog itself, not its inner content) to close.
els.zoomModal.addEventListener("click", (e) => {
  if (e.target === els.zoomModal) els.zoomModal.close();
});

// Auto-fit toggle
els.sizeMode.addEventListener("change", () => {
  els.sizeManual.disabled = els.sizeMode.checked;
  rerender();
});
els.sizeManual.addEventListener("input", () => {
  els.sizeManualVal.textContent = els.sizeManual.value;
  if (!els.sizeMode.checked) rerender();
});

// Help dialog
els.help.addEventListener("click", () => els.helpModal.showModal());
els.helpClose.addEventListener("click", () => els.helpModal.close());

// Preload fonts + template in background so first generate is fast.
// Also restore the last formatted result if there is one so a refresh /
// PWA-reopen brings the preview back without having to regenerate.
Promise.all([loadFonts(), loadTemplate()])
  .then(() => {
    const saved = restoreLastFormatted();
    if (saved) {
      lastFormatted = saved;
      const opts = {};
      if (!els.sizeMode.checked) opts.fontSize = parseInt(els.sizeManual.value, 10);
      renderToCanvas(saved, opts);
      enableActions(true);
    } else {
      // No saved render — show the bare template so the user sees the canvas.
      const ctx = els.canvas.getContext("2d");
      ctx.drawImage(templateImage, 0, 0, LAYOUT.width, LAYOUT.height);
      els.empty.classList.add("hidden");
    }
  })
  .catch((e) => console.warn("Preload failed", e));
