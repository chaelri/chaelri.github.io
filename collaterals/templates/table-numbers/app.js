// Table Numbers — landscape 8″ × 6″ flat table card, 3-column layout per the
// reference design Charlie picked: left column = "table N" + couple names +
// date/venue, middle column = "share the love" photo-album QR + "capture the
// moment" photo prompts, right column = welcome heading + thank-you body +
// sign-off. Per-table only the numeral changes; the rest is shared content
// edited once in the editor.
//
// Card sized 2400 × 1800 px (8″ × 6″ @ 300 DPI). A4 portrait sheet centers the
// landscape card with margins; cut out by hand or print on pre-cut 6×8 stock.

import { svgToPngBlob, downloadPng } from "../../shared/export.js";
import { uploadPngBlob, sanitizeFilename, COLLATERALS_FOLDER_URL } from "../../shared/drive.js";
import { getTemplateData, setTemplateData, setStatus, getAllStatus } from "../../shared/state.js";
import { fbGet, fbSet, fbSubscribe } from "../../shared/firebase-sync.js";
import { COUPLE } from "../../shared/design.js";

const TEMPLATE_ID = "table-numbers";
const CARD = { w: 2400, h: 1800 };                          // 8″ × 6″ @ 300 DPI landscape
const A4 = { w: 2480, h: 3508 };                            // A4 portrait @ 300 DPI

// Column geometry — three equal columns with outer margins + inter-column gaps.
// 125 + 650 + 100 + 650 + 100 + 650 + 125 = 2400 ✓
const COL = { w: 650, gap: 100, mLeft: 125 };
const COL_X = [
  COL.mLeft,                                                // 125
  COL.mLeft + COL.w + COL.gap,                              // 875
  COL.mLeft + 2 * (COL.w + COL.gap),                        // 1625
];
const COL_CX = COL_X.map((x) => x + COL.w / 2);             // [450, 1200, 1950]

// Defaults — couple/date pulled from shared/design.js. Charlie can override
// any of these in the editor; values persist to localStorage + Firebase.
const DEFAULTS = {
  numbers: "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11",
  qrUrl: "",
  dateVenue: `${COUPLE.dateShort} | CCF EAST ORTIGAS`,
  welcome: "WE'RE SO GLAD\nYOU'RE HERE!",
  thankBody:
    "We would like to express our many thanks for sharing our wedding day with us. Thank you for celebrating in our joy, love, and happiness. You have helped to make us who we are today, and for that we are forever grateful. So please enjoy tonight and let it be but a small gift for all you have done for us. You are our favorite people in the world and we love you beyond words can express!",
  shareBody:
    "Please share all your photos and videos with us! Scan the QR code below to upload to our digital photo / video album!",
  prompts: [
    "Selfie photo of your table",
    "The bride and groom",
    "The hora chair dance",
    "Dance floor dance party",
    "Sunset photo",
    "Selfie with someone you just met",
    "The bride and groom's first dance",
    "The father daughter dance",
    "The mother son dance",
    "Selfie with the bride and groom",
  ].join("\n"),
};

// === Helpers ==============================================================

function escapeXML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
}

const COUPLE_FIRST = COUPLE.first.toUpperCase();
const COUPLE_SECOND = COUPLE.second.toUpperCase();

// Canvas-backed line-width measurement for SVG text wrapping. Returns line
// width in CSS pixels for a given font/weight/size + letter-spacing.
let _measureCtx = null;
function measureLineWidth(line, family, size, weight, letterSpacing) {
  if (!_measureCtx) _measureCtx = document.createElement("canvas").getContext("2d");
  _measureCtx.font = `${weight} ${size}px ${family}`;
  let w = _measureCtx.measureText(line).width;
  if (letterSpacing) w += letterSpacing * Math.max(0, line.length - 1);
  return w;
}

// Greedy word-wrap to fit within maxWidth. Preserves explicit \n line breaks.
function wrapText(text, family, size, weight, maxWidth, letterSpacing = 0) {
  const out = [];
  const blocks = String(text || "").split(/\r?\n/);
  for (const block of blocks) {
    if (!block.trim()) { out.push(""); continue; }
    const words = block.split(/\s+/).filter(Boolean);
    let cur = "";
    for (const w of words) {
      const tentative = cur ? cur + " " + w : w;
      if (measureLineWidth(tentative, family, size, weight, letterSpacing) > maxWidth && cur) {
        out.push(cur);
        cur = w;
      } else {
        cur = tentative;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

// === QR code (loaded lazily from CDN) =====================================

let _qrcodeMod = null;
async function qrcode() {
  if (_qrcodeMod) return _qrcodeMod;
  // qrcode-generator@1.4.4 — tiny pure-JS QR. ESM wrapper via esm.sh.
  const m = await import("https://esm.sh/qrcode-generator@1.4.4");
  _qrcodeMod = m.default;
  return _qrcodeMod;
}

// Build an SVG <g> of black squares that render a QR encoding of `url`.
// Returned group is positioned at (x, y) with total size = size × size px.
async function qrSvgGroup(url, x, y, size) {
  if (!url) {
    // Placeholder — light grey box with diagonal slashes so the layout still
    // shows the QR region while the URL is empty.
    return `
      <rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#f4f0ea" stroke="#cfc7bc" stroke-width="3"/>
      <line x1="${x}" y1="${y}" x2="${x + size}" y2="${y + size}" stroke="#cfc7bc" stroke-width="3"/>
      <line x1="${x + size}" y1="${y}" x2="${x}" y2="${y + size}" stroke="#cfc7bc" stroke-width="3"/>
      <text x="${x + size / 2}" y="${y + size + 36}" text-anchor="middle"
            font-family="Inter, sans-serif" font-size="20" fill="#a09a90"
            letter-spacing="2">QR URL EMPTY</text>`;
  }
  const QR = await qrcode();
  const qr = QR(0, "M");                                    // auto type, medium ECC
  qr.addData(url);
  qr.make();
  const count = qr.getModuleCount();
  const cell = size / count;
  const rects = [];
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (!qr.isDark(r, c)) continue;
      const rx = x + c * cell;
      const ry = y + r * cell;
      // Pad cell width slightly to avoid hairline gaps on rasterization.
      rects.push(`<rect x="${rx.toFixed(2)}" y="${ry.toFixed(2)}" width="${(cell + 0.5).toFixed(2)}" height="${(cell + 0.5).toFixed(2)}" fill="#1a1816"/>`);
    }
  }
  return rects.join("");
}

// === Decorative camera icon ===============================================

// Hand-drawn line-art camera matching the script-heavy aesthetic. Centered
// at (cx, cy) with the body roughly 180 × 120 wide.
function cameraIconSVG(cx, cy) {
  const w = 200, h = 130;
  const x = cx - w / 2, y = cy - h / 2;
  const stroke = "#2a2723";
  const sw = 5;
  return `
    <g fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
      <path d="M ${x + 20} ${y + 30}
               L ${x + 60} ${y + 30}
               L ${x + 72} ${y + 12}
               L ${x + 128} ${y + 12}
               L ${x + 140} ${y + 30}
               L ${x + w - 20} ${y + 30}
               Q ${x + w - 6} ${y + 30}, ${x + w - 6} ${y + 44}
               L ${x + w - 6} ${y + h - 16}
               Q ${x + w - 6} ${y + h - 2}, ${x + w - 20} ${y + h - 2}
               L ${x + 20} ${y + h - 2}
               Q ${x + 6} ${y + h - 2}, ${x + 6} ${y + h - 16}
               L ${x + 6} ${y + 44}
               Q ${x + 6} ${y + 30}, ${x + 20} ${y + 30} Z"/>
      <circle cx="${cx}" cy="${y + h / 2 + 8}" r="30"/>
      <circle cx="${cx}" cy="${y + h / 2 + 8}" r="18"/>
      <circle cx="${x + w - 28}" cy="${y + 46}" r="3.5" fill="${stroke}"/>
    </g>`;
}

// === Card layers ==========================================================

function leftColumn(number) {
  const cx = COL_CX[0];
  const parts = [];

  // "table" script headline — slanted slightly via Sacramento's natural italic
  parts.push(`<text x="${cx}" y="180" text-anchor="middle"
              font-family="Sacramento, cursive" font-size="180" fill="#1a1816">table</text>`);

  // Big numeral — tall, thin-ish serif. Playfair Display 700 looks like the ref.
  parts.push(`<text x="${cx}" y="700" text-anchor="middle"
              font-family="Playfair Display, serif" font-size="560" font-weight="400"
              fill="#1a1816" letter-spacing="0">${escapeXML(String(number))}</text>`);

  // Couple block — sans caps for first/second names, script "and" between.
  // Three lines stacked, all centered on cx.
  parts.push(`<text x="${cx}" y="1100" text-anchor="middle"
              font-family="Inter, sans-serif" font-size="58" font-weight="500"
              letter-spacing="10" fill="#1a1816">${escapeXML(COUPLE_FIRST)}</text>`);
  parts.push(`<text x="${cx}" y="1170" text-anchor="middle"
              font-family="Sacramento, cursive" font-size="68" fill="#1a1816">and</text>`);
  parts.push(`<text x="${cx}" y="1235" text-anchor="middle"
              font-family="Inter, sans-serif" font-size="58" font-weight="500"
              letter-spacing="10" fill="#1a1816">${escapeXML(COUPLE_SECOND)}</text>`);

  // Date | venue
  parts.push(`<text x="${cx}" y="1320" text-anchor="middle"
              font-family="Inter, sans-serif" font-size="32" font-weight="400"
              letter-spacing="6" fill="#3a3530">${escapeXML(state().dateVenue)}</text>`);

  // Thin rule below
  parts.push(`<line x1="${cx - 110}" y1="1370" x2="${cx + 110}" y2="1370"
              stroke="#1a1816" stroke-width="2"/>`);

  return parts.join("");
}

async function middleColumn() {
  const cx = COL_CX[1];
  const colLeft = COL_X[1];
  const colRight = COL_X[1] + COL.w;
  const s = state();
  const parts = [];

  // "share the love" — script
  parts.push(`<text x="${cx}" y="170" text-anchor="middle"
              font-family="Sacramento, cursive" font-size="130" fill="#1a1816">share the love</text>`);

  // Camera icon
  parts.push(cameraIconSVG(cx, 310));

  // Share body — spaced caps, wrapped to column width
  const shareLines = wrapText(s.shareBody.toUpperCase(), "Inter, sans-serif", 30, 500, COL.w - 60, 2.4);
  shareLines.forEach((line, i) => {
    parts.push(`<text x="${cx}" y="${440 + i * 44}" text-anchor="middle"
                font-family="Inter, sans-serif" font-size="30" font-weight="500"
                letter-spacing="2.4" fill="#1a1816">${escapeXML(line)}</text>`);
  });
  const sharePadY = 440 + shareLines.length * 44 + 20;

  // QR code — fixed 320×320, centered horizontally, below share body
  const qrSize = 320;
  parts.push(await qrSvgGroup(s.qrUrl, cx - qrSize / 2, sharePadY, qrSize));
  const afterQrY = sharePadY + qrSize + 40;

  // Thin rule
  parts.push(`<line x1="${colLeft + 50}" y1="${afterQrY}" x2="${colRight - 50}" y2="${afterQrY}"
              stroke="#1a1816" stroke-width="2"/>`);

  // "capture the moment" — script
  parts.push(`<text x="${cx}" y="${afterQrY + 110}" text-anchor="middle"
              font-family="Sacramento, cursive" font-size="120" fill="#1a1816">capture the moment</text>`);

  // Photo prompts — centered list, prefixed with dash
  const promptLines = String(s.prompts || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const promptsTopY = afterQrY + 160;
  const rowH = Math.min(40, Math.max(28, (CARD.h - promptsTopY - 80) / Math.max(promptLines.length, 1)));
  const fontPx = Math.min(28, rowH * 0.72);
  promptLines.forEach((line, i) => {
    parts.push(`<text x="${cx}" y="${promptsTopY + i * rowH}" text-anchor="middle"
                font-family="Inter, sans-serif" font-size="${fontPx.toFixed(2)}" font-weight="500"
                letter-spacing="2" fill="#1a1816">- ${escapeXML(line.toUpperCase())}</text>`);
  });

  return parts.join("");
}

function rightColumn() {
  const cx = COL_CX[2];
  const s = state();
  const parts = [];

  // Welcome heading — spaced caps, can be multi-line via \n
  const welcomeLines = String(s.welcome || "").split(/\r?\n/).filter((l) => l.length > 0);
  welcomeLines.forEach((line, i) => {
    parts.push(`<text x="${cx}" y="${160 + i * 60}" text-anchor="middle"
                font-family="Inter, sans-serif" font-size="46" font-weight="500"
                letter-spacing="6" fill="#1a1816">${escapeXML(line.toUpperCase())}</text>`);
  });

  // "THANK / YOU" big spaced caps — two stacked lines
  parts.push(`<text x="${cx}" y="380" text-anchor="middle"
              font-family="Inter, sans-serif" font-size="130" font-weight="500"
              letter-spacing="14" fill="#1a1816">THANK</text>`);
  parts.push(`<text x="${cx}" y="510" text-anchor="middle"
              font-family="Inter, sans-serif" font-size="130" font-weight="500"
              letter-spacing="14" fill="#1a1816">YOU</text>`);

  // Thin rule
  parts.push(`<line x1="${cx - 90}" y1="570" x2="${cx + 90}" y2="570"
              stroke="#1a1816" stroke-width="2"/>`);

  // Body — wrap to column. Spaced caps look heavy at 32px so use 28.
  const bodyLines = wrapText(s.thankBody.toUpperCase(), "Inter, sans-serif", 28, 500, COL.w - 60, 2);
  const bodyTopY = 630;
  // Auto-shrink line spacing if the paragraph would overflow before the sign-off.
  const signoffY = 1620;
  const reservedBottom = 60;
  const availH = signoffY - reservedBottom - bodyTopY;
  let lineH = 42;
  if (bodyLines.length * lineH > availH) lineH = availH / bodyLines.length;
  bodyLines.forEach((line, i) => {
    parts.push(`<text x="${cx}" y="${bodyTopY + i * lineH}" text-anchor="middle"
                font-family="Inter, sans-serif" font-size="28" font-weight="500"
                letter-spacing="2" fill="#1a1816">${escapeXML(line)}</text>`);
  });

  // Sign-off — same shape as left column's couple block, slightly smaller.
  parts.push(`<text x="${cx}" y="${signoffY}" text-anchor="middle"
              font-family="Inter, sans-serif" font-size="40" font-weight="500"
              letter-spacing="8" fill="#1a1816">${escapeXML(COUPLE_FIRST)}</text>`);
  parts.push(`<text x="${cx}" y="${signoffY + 56}" text-anchor="middle"
              font-family="Sacramento, cursive" font-size="52" fill="#1a1816">and</text>`);
  parts.push(`<text x="${cx}" y="${signoffY + 110}" text-anchor="middle"
              font-family="Inter, sans-serif" font-size="40" font-weight="500"
              letter-spacing="8" fill="#1a1816">${escapeXML(COUPLE_SECOND)}</text>`);

  return parts.join("");
}

// Fold guides — two vertical dashed lines marking where to fold the card into
// a tri-fold table tent. Sit in the inter-column gaps, light grey so they
// print subtly. "FOLD" labels float at top + bottom of each crease.
function foldGuides() {
  const foldX = [
    COL_X[0] + COL.w + COL.gap / 2,                         // 825 — between col 1 & 2
    COL_X[1] + COL.w + COL.gap / 2,                         // 1575 — between col 2 & 3
  ];
  const parts = [];
  for (const fx of foldX) {
    parts.push(`<line x1="${fx}" y1="60" x2="${fx}" y2="${CARD.h - 60}"
                stroke="#9a958c" stroke-width="2.4" stroke-dasharray="14 10" opacity="0.7"/>`);
    parts.push(`<text x="${fx}" y="36" text-anchor="middle"
                font-family="Inter, sans-serif" font-size="20" font-weight="500"
                letter-spacing="4" fill="#9a958c">FOLD</text>`);
    parts.push(`<text x="${fx}" y="${CARD.h - 18}" text-anchor="middle"
                font-family="Inter, sans-serif" font-size="20" font-weight="500"
                letter-spacing="4" fill="#9a958c">FOLD</text>`);
  }
  return parts.join("");
}

async function renderCardSVG(number) {
  const left = leftColumn(number);
  const mid = await middleColumn();
  const right = rightColumn();
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD.w} ${CARD.h}"
         width="${CARD.w}" height="${CARD.h}"
         style="max-width:100%;height:auto;display:block">
      <rect x="0" y="0" width="${CARD.w}" height="${CARD.h}" fill="#ffffff"/>
      ${left}
      ${mid}
      ${right}
      ${foldGuides()}
    </svg>`;
}

async function renderSheetSVG(number) {
  const cardSvg = await renderCardSVG(number);
  const cardInner = cardSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/)[1];
  const mx = Math.round((A4.w - CARD.w) / 2);
  const my = Math.round((A4.h - CARD.h) / 2);
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${A4.w} ${A4.h}"
         width="${A4.w}" height="${A4.h}"
         style="max-width:100%;height:auto;display:block">
      <rect x="0" y="0" width="${A4.w}" height="${A4.h}" fill="#ffffff"/>
      <g transform="translate(${mx} ${my})">${cardInner}</g>
      <rect x="${mx}" y="${my}" width="${CARD.w}" height="${CARD.h}"
            fill="none" stroke="#8c8c8c" stroke-width="2.4"
            stroke-dasharray="36 16" opacity="0.55"/>
    </svg>`;
}

// === State + persistence ==================================================

// One shared in-memory state object — every render reads from here. Persist
// to localStorage + Firebase on change.
let _state = { ...DEFAULTS };
function state() { return _state; }
function setStateField(field, value) {
  _state = { ..._state, [field]: value };
}
function persist() {
  setTemplateData(TEMPLATE_ID, _state);
  fbSet(TEMPLATE_ID, _state);
}

function parseNumbers(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

// === Toast ================================================================

function showToast(msg, kind = "ok", ms = 2400) {
  const el = document.getElementById("toast");
  const m = document.getElementById("toast-msg");
  if (!el || !m) { console.log("[toast]", msg); return; }
  m.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (el.className = "toast"), ms);
}

// === Mount ================================================================

async function mount() {
  const root = document.getElementById("editor-root");
  if (!root) throw new Error("table-numbers: #editor-root missing");

  // Hydrate state — local first, then merge in latest Firebase snapshot.
  const local = getTemplateData(TEMPLATE_ID) || {};
  _state = { ...DEFAULTS, ...local };
  try {
    const remote = await fbGet(TEMPLATE_ID);
    if (remote && typeof remote === "object") {
      _state = { ...DEFAULTS, ..._state, ...remote };
      setTemplateData(TEMPLATE_ID, _state);
    }
  } catch (e) { console.warn("fb hydrate failed", e); }

  let previewIdx = 0;
  let printMode = false;

  root.innerHTML = `
    <div class="editor-header">
      <div class="title-block">
        <h1>Table Numbers</h1>
        <p>3-column flat card · 8″ × 6″ landscape · 1 per A4 page · QR-coded photo album + thank-you note</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <label style="font-size:0.74rem;color:var(--ink-faint);text-transform:uppercase;letter-spacing:0.06em">Status</label>
        <select id="status-select" class="status-select">
          <option value="pending">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="ready">Ready to print</option>
          <option value="printed">Printed</option>
        </select>
      </div>
    </div>
    <div class="editor-grid editor-compact">
      <div>
        <div class="field-block">
          <h3>Numbers</h3>
          <p class="field-hint">One per line — drives how many cards get generated. Use whatever labels you want (1, 2, "VIP 1", "KIDS", etc.).</p>
          <textarea id="ed-numbers" rows="8"></textarea>
          <div class="batch-nav">
            <button type="button" id="ed-prev" class="btn btn-ghost">‹</button>
            <span id="ed-counter">— of —</span>
            <button type="button" id="ed-next" class="btn btn-ghost">›</button>
          </div>
        </div>
        <div class="field-block">
          <h3>Shared content</h3>
          <p class="field-hint">Lives across every card. Edit once.</p>
          <label class="field-label">QR URL <span style="color:var(--ink-faint);font-weight:400">(scan-to-upload photo album)</span></label>
          <input id="ed-qr" type="url" placeholder="https://photos.app.goo.gl/…"/>
          <label class="field-label">Date · Venue</label>
          <input id="ed-datevenue" type="text"/>
          <label class="field-label">Welcome heading</label>
          <textarea id="ed-welcome" rows="2"></textarea>
          <label class="field-label">Share-the-love body</label>
          <textarea id="ed-share" rows="3"></textarea>
          <label class="field-label">Thank-you body</label>
          <textarea id="ed-thank" rows="8"></textarea>
          <label class="field-label">Photo prompts <span style="color:var(--ink-faint);font-weight:400">(one per line)</span></label>
          <textarea id="ed-prompts" rows="8"></textarea>
        </div>
        <div class="field-block actions">
          <button type="button" id="ed-dl" class="btn btn-ghost">
            <span class="material-symbols-outlined">download</span>
            Download current
          </button>
          <button type="button" id="ed-up" class="btn btn-primary">
            <span class="material-symbols-outlined">cloud_upload</span>
            Upload current to Drive
          </button>
          <button type="button" id="ed-dl-all" class="btn btn-ghost">
            <span class="material-symbols-outlined">download</span>
            Download all (per-card PNGs)
          </button>
          <button type="button" id="ed-pdf-all" class="btn btn-ghost">
            <span class="material-symbols-outlined">picture_as_pdf</span>
            Download A4 PDF
          </button>
          <button type="button" id="ed-up-all" class="btn btn-primary">
            <span class="material-symbols-outlined">cloud_upload</span>
            Upload all to Drive
          </button>
          <a href="${COLLATERALS_FOLDER_URL}" target="_blank" rel="noopener" class="btn-link" style="font-size:0.74rem;text-align:center;margin-top:2px">Open Drive folder ↗</a>
        </div>
      </div>
      <div class="preview-pane">
        <div class="preview-toolbar">
          <span class="label" id="ed-preview-label">Preview · card ${CARD.w} × ${CARD.h}</span>
          <label class="toggle"><input id="ed-print-mode" type="checkbox"/> A4 sheet</label>
        </div>
        <div id="ed-stage" class="preview-stage" style="min-height:420px;width:100%"></div>
      </div>
    </div>
  `;

  const $ = (id) => document.getElementById(id);
  const statusSel  = $("status-select");
  const numbersTA  = $("ed-numbers");
  const qrInput    = $("ed-qr");
  const dvInput    = $("ed-datevenue");
  const welcomeTA  = $("ed-welcome");
  const shareTA    = $("ed-share");
  const thankTA    = $("ed-thank");
  const promptsTA  = $("ed-prompts");
  const prevBtn    = $("ed-prev");
  const nextBtn    = $("ed-next");
  const counter    = $("ed-counter");
  const dlBtn      = $("ed-dl");
  const upBtn      = $("ed-up");
  const dlAllBtn   = $("ed-dl-all");
  const pdfAllBtn  = $("ed-pdf-all");
  const upAllBtn   = $("ed-up-all");
  const printCk    = $("ed-print-mode");
  const previewLbl = $("ed-preview-label");
  const stage      = $("ed-stage");

  // Hydrate inputs
  numbersTA.value = _state.numbers || DEFAULTS.numbers;
  qrInput.value   = _state.qrUrl   || "";
  dvInput.value   = _state.dateVenue || DEFAULTS.dateVenue;
  welcomeTA.value = _state.welcome || DEFAULTS.welcome;
  shareTA.value   = _state.shareBody || DEFAULTS.shareBody;
  thankTA.value   = _state.thankBody || DEFAULTS.thankBody;
  promptsTA.value = _state.prompts || DEFAULTS.prompts;
  statusSel.value = getAllStatus()[TEMPLATE_ID] || "pending";

  statusSel.addEventListener("change", () => {
    setStatus(TEMPLATE_ID, statusSel.value);
    showToast(`Marked as ${statusSel.options[statusSel.selectedIndex].text}`);
  });

  const numbers = () => parseNumbers(_state.numbers);
  const clampIdx = () => {
    const n = numbers().length;
    if (!n) { previewIdx = 0; return; }
    if (previewIdx >= n) previewIdx = n - 1;
    if (previewIdx < 0) previewIdx = 0;
  };

  function updateCounter() {
    const arr = numbers();
    counter.textContent = arr.length ? `${previewIdx + 1} of ${arr.length}` : "— of —";
  }
  function syncLabel() {
    previewLbl.textContent = printMode
      ? `Preview · A4 ${A4.w} × ${A4.h}`
      : `Preview · card ${CARD.w} × ${CARD.h}`;
  }

  let _renderToken = 0;
  async function render() {
    clampIdx();
    const myToken = ++_renderToken;
    const arr = numbers();
    const num = arr[previewIdx] || "";
    const svg = printMode ? await renderSheetSVG(num) : await renderCardSVG(num);
    if (myToken !== _renderToken) return;                   // stale render — skip
    stage.innerHTML = svg;
    updateCounter();
    syncLabel();
  }

  // Field bindings
  numbersTA.addEventListener("input", () => {
    setStateField("numbers", numbersTA.value);
    previewIdx = 0;
    persist();
    render();
  });
  qrInput.addEventListener("input", () => { setStateField("qrUrl", qrInput.value); persist(); render(); });
  dvInput.addEventListener("input", () => { setStateField("dateVenue", dvInput.value); persist(); render(); });
  welcomeTA.addEventListener("input", () => { setStateField("welcome", welcomeTA.value); persist(); render(); });
  shareTA.addEventListener("input", () => { setStateField("shareBody", shareTA.value); persist(); render(); });
  thankTA.addEventListener("input", () => { setStateField("thankBody", thankTA.value); persist(); render(); });
  promptsTA.addEventListener("input", () => { setStateField("prompts", promptsTA.value); persist(); render(); });

  prevBtn.addEventListener("click", () => {
    const arr = numbers();
    if (!arr.length) return;
    previewIdx = (previewIdx - 1 + arr.length) % arr.length;
    render();
  });
  nextBtn.addEventListener("click", () => {
    const arr = numbers();
    if (!arr.length) return;
    previewIdx = (previewIdx + 1) % arr.length;
    render();
  });
  printCk.addEventListener("change", () => { printMode = printCk.checked; render(); });

  // Export helpers
  const detachedSvg = (html) => {
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    return wrap.querySelector("svg");
  };
  const numSlug = (n) => sanitizeFilename(`Table ${n}`).slice(0, 60);

  dlBtn.addEventListener("click", async () => {
    try {
      const arr = numbers();
      if (!arr.length) { showToast("Numbers list is empty", "err"); return; }
      const n = arr[previewIdx];
      const svg = printMode ? await renderSheetSVG(n) : await renderCardSVG(n);
      const filename = printMode
        ? `Table Number — ${numSlug(n)} (A4).png`
        : `Table Number — ${numSlug(n)}.png`;
      await downloadPng(detachedSvg(svg), filename, { scale: printMode ? 1 : 1.5 });
      showToast("Downloaded");
    } catch (e) { console.error(e); showToast("Download failed", "err"); }
  });

  upBtn.addEventListener("click", async () => {
    try {
      const arr = numbers();
      if (!arr.length) { showToast("Numbers list is empty", "err"); return; }
      showToast("Uploading…");
      const n = arr[previewIdx];
      const svg = printMode ? await renderSheetSVG(n) : await renderCardSVG(n);
      const blob = await svgToPngBlob(detachedSvg(svg), { scale: printMode ? 1 : 1.5 });
      const filename = printMode
        ? `Table Number — ${numSlug(n)} (A4).png`
        : `Table Number — ${numSlug(n)}.png`;
      const j = await uploadPngBlob(blob, filename);
      try { await navigator.clipboard.writeText(j.link); } catch {}
      showToast("Uploaded · link copied");
      window.open(j.link, "_blank", "noopener");
    } catch (e) { console.error(e); showToast(e.message || "Upload failed", "err", 4000); }
  });

  dlAllBtn.addEventListener("click", async () => {
    const arr = numbers();
    if (!arr.length) { showToast("Numbers list is empty", "err"); return; }
    try {
      for (let i = 0; i < arr.length; i++) {
        showToast(`Downloading ${i + 1}/${arr.length}…`);
        const svg = await renderCardSVG(arr[i]);
        await downloadPng(detachedSvg(svg), `Table Number — ${numSlug(arr[i])}.png`, { scale: 1.5 });
        await new Promise((r) => setTimeout(r, 120));
      }
      showToast(`Downloaded ${arr.length} ${arr.length === 1 ? "PNG" : "PNGs"}`);
    } catch (e) { console.error(e); showToast("Batch download failed", "err"); }
  });

  pdfAllBtn.addEventListener("click", async () => {
    const arr = numbers();
    if (!arr.length) { showToast("Numbers list is empty", "err"); return; }
    try {
      showToast("Loading PDF library…");
      const { jsPDF } = await import("https://esm.sh/jspdf@2.5.2");
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
      for (let i = 0; i < arr.length; i++) {
        showToast(`Rendering ${i + 1}/${arr.length}…`);
        const svg = await renderSheetSVG(arr[i]);
        const blob = await svgToPngBlob(detachedSvg(svg), { scale: 1 });
        const dataUrl = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result));
          r.onerror = rej;
          r.readAsDataURL(blob);
        });
        if (i > 0) pdf.addPage();
        pdf.addImage(dataUrl, "PNG", 0, 0, 210, 297, undefined, "FAST");
      }
      pdf.save(`Table Numbers — A4 print sheets.pdf`);
      showToast(`PDF saved · ${arr.length} ${arr.length === 1 ? "page" : "pages"}`);
    } catch (e) {
      console.error(e);
      showToast(e.message || "PDF generation failed", "err", 4000);
    }
  });

  upAllBtn.addEventListener("click", async () => {
    const arr = numbers();
    if (!arr.length) { showToast("Numbers list is empty", "err"); return; }
    try {
      for (let i = 0; i < arr.length; i++) {
        showToast(`Uploading ${i + 1}/${arr.length}…`);
        const svg = await renderCardSVG(arr[i]);
        const blob = await svgToPngBlob(detachedSvg(svg), { scale: 1.5 });
        await uploadPngBlob(blob, `Table Number — ${numSlug(arr[i])}.png`);
      }
      showToast(`Uploaded ${arr.length} to Drive`, "ok", 4000);
      window.open(COLLATERALS_FOLDER_URL, "_blank", "noopener");
    } catch (e) { console.error(e); showToast(e.message || "Batch upload failed", "err", 4000); }
  });

  // Live sync with other tabs / Karla's device
  fbSubscribe(TEMPLATE_ID, (remote) => {
    if (!remote || typeof remote !== "object") return;
    let dirty = false;
    for (const key of ["numbers", "qrUrl", "dateVenue", "welcome", "shareBody", "thankBody", "prompts"]) {
      if (typeof remote[key] === "string" && remote[key] !== _state[key]) {
        _state = { ..._state, [key]: remote[key] };
        const el = { numbers: numbersTA, qrUrl: qrInput, dateVenue: dvInput,
                     welcome: welcomeTA, shareBody: shareTA, thankBody: thankTA, prompts: promptsTA }[key];
        if (el && document.activeElement !== el) el.value = remote[key];
        dirty = true;
      }
    }
    if (dirty) render();
  });

  render();
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => render()).catch(() => {});
  }
}

mount();
