// Table Numbers — landscape 3-panel flat table card with glue tab. Folds into
// a triangular tent: panel 1 = "table N" + couple block, panel 2 = "share the
// love" QR + "capture the moment" prompts, panel 3 = welcome + THANK YOU body.
// Tab on the right wraps behind panel 1 for paste.
//
// Each visual element is a zone with editable bounds. Toggle "Edit boxes" to
// drag (move) or grab the corner handle (resize). Bounds persist to state +
// Firebase, so layout edits sync across devices.

import { svgToPngBlob, downloadPng } from "../../shared/export.js";
import { uploadPngBlob, sanitizeFilename, COLLATERALS_FOLDER_URL } from "../../shared/drive.js";
import { getTemplateData, setTemplateData, setStatus, getAllStatus } from "../../shared/state.js";
import { fbGet, fbSet, fbSubscribe } from "../../shared/firebase-sync.js";
import { COUPLE } from "../../shared/design.js";

const TEMPLATE_ID = "table-numbers";
const CARD = { w: 2600, h: 1800 };                          // 8.67″ × 6″ @ 300 DPI landscape
const A4 = { w: 3508, h: 2480 };                            // A4 landscape @ 300 DPI

// Column geometry — three equal columns with outer margins + inter-column gaps,
// plus the glue tab on the right.
// 125 + 650 + 100 + 650 + 100 + 650 + 125 + 200 = 2600 ✓
const COL = { w: 650, gap: 100, mLeft: 125 };
const COL_X = [
  COL.mLeft,                                                // 125
  COL.mLeft + COL.w + COL.gap,                              // 875
  COL.mLeft + 2 * (COL.w + COL.gap),                        // 1625
];
const COL_CX = COL_X.map((x) => x + COL.w / 2);             // [450, 1200, 1950]
const TAB = { x: 2400, w: 200 };                            // glue tab — 200 × 1800

const INK = "#1a1816";
const INK_SOFT = "#3a3530";

// === Zones ================================================================
// Every editable element is a zone keyed by id. The default x/y/w/h is the
// design-time bounds; `_state.zones[id]` (when present) overrides it. `kind`
// dispatches to a renderer; remaining fields are renderer-specific knobs.

const ZONES_DEFAULT = {
  "left_tableScript": {
    x: 125, y: 90, w: 650, h: 200,
    kind: "script", text: "table", family: "Sacramento, cursive",
    naturalSize: 180, color: INK,
  },
  "left_numeral": {
    x: 220, y: 280, w: 460, h: 540,
    kind: "numeral", family: "Playfair Display, serif",
    naturalSize: 560, weight: 400, color: INK,
  },
  "left_couple": {
    x: 125, y: 1020, w: 650, h: 240,
    kind: "couple", capsSize: 58, scriptSize: 68, letterSpacing: 10, color: INK,
  },
  "left_dateVenue": {
    x: 125, y: 1280, w: 650, h: 130,
    kind: "multiCaps", naturalSize: 32, weight: 400,
    letterSpacing: 6, textRef: "dateVenue", color: INK_SOFT,
  },
  "left_rule": {
    x: 340, y: 1440, w: 220, h: 4,
    kind: "rule", color: INK, weight: 2,
  },

  "middle_shareScript": {
    x: 875, y: 70, w: 650, h: 160,
    kind: "script", text: "share the love",
    family: "Sacramento, cursive", naturalSize: 130, color: INK,
  },
  "middle_camera": {
    x: 1100, y: 240, w: 200, h: 130,
    kind: "camera", color: INK,
  },
  "middle_shareBody": {
    x: 875, y: 410, w: 650, h: 190,
    kind: "wrappedCaps", naturalSize: 30, weight: 500,
    letterSpacing: 2.4, textRef: "shareBody", color: INK,
  },
  "middle_qr": {
    x: 1040, y: 620, w: 320, h: 320,
    kind: "qr",
  },
  "middle_captureScript": {
    x: 875, y: 980, w: 650, h: 150,
    kind: "script", text: "capture the moment",
    family: "Sacramento, cursive", naturalSize: 120, color: INK,
  },
  "middle_prompts": {
    x: 875, y: 1180, w: 650, h: 580,
    kind: "prompts", naturalSize: 28, weight: 500,
    letterSpacing: 2, textRef: "prompts", color: INK,
  },

  "right_welcome": {
    x: 1625, y: 90, w: 650, h: 170,
    kind: "multiCaps", naturalSize: 46, weight: 500,
    letterSpacing: 6, textRef: "welcome", color: INK,
  },
  "right_thankYou": {
    x: 1625, y: 280, w: 650, h: 280,
    kind: "thankStack", naturalSize: 130, weight: 500,
    letterSpacing: 14, color: INK,
  },
  "right_thankRule": {
    x: 1860, y: 580, w: 180, h: 4,
    kind: "rule", color: INK, weight: 2,
  },
  "right_thankBody": {
    x: 1625, y: 610, w: 650, h: 940,
    kind: "wrappedCaps", naturalSize: 28, weight: 500,
    letterSpacing: 2, textRef: "thankBody", color: INK,
  },
  "right_signoff": {
    x: 1625, y: 1580, w: 650, h: 220,
    kind: "couple", capsSize: 40, scriptSize: 52, letterSpacing: 8, color: INK,
  },

  // Decorative C&K monogram, top-right of panel 1 — same gold accent as on
  // name-cards. Draggable; resize the corner handle to scale.
  "decor_ckLogo": {
    x: 600, y: 30, w: 160, h: 135,
    kind: "ckLogo",
  },

  // Free-position 7.png decoration. Drag to move, corner handle to resize.
  // Bounds persist via _state.zones → Firebase like every other zone.
  "decor_seven": {
    x: 1100, y: 60, w: 320, h: 320,
    kind: "seven",
  },
};

// Card body colors — match the cream/ink tone used in name-cards instead of
// pure white. PALETTE.paper is the canonical token.
const PAPER = "#faf9f6";

const DEFAULTS = {
  numbers: "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11",
  qrUrl: "https://chaelri.github.io/sharethelove/",
  dateVenue: `07.02.2026\nCCF EAST ORTIGAS`,
  welcome: "WE'RE SO GLAD\nYOU'RE HERE!",
  thankBody:
    "We would like to express our many thanks for sharing our wedding day with us. Thank you for celebrating in our joy, love, and happiness. You have helped to make us who we are today, and for that we are forever grateful. So please enjoy tonight and let it be but a small gift for all you have done for us. You are our favorite people in the world and we love you beyond words can express!",
  shareBody:
    "Please share all your photos and videos with us! Scan the QR code below to upload to our digital photo / video album!",
  prompts: "Scan to upload your favorite moments with us!",
  zones: {},
};

const COUPLE_FIRST = COUPLE.first.toUpperCase();
const COUPLE_SECOND = COUPLE.second.toUpperCase();

// === Helpers ==============================================================

function escapeXML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
}

let _measureCtx = null;
function measureLineWidth(line, family, size, weight, letterSpacing) {
  if (!_measureCtx) _measureCtx = document.createElement("canvas").getContext("2d");
  _measureCtx.font = `${weight} ${size}px ${family}`;
  let w = _measureCtx.measureText(line).width;
  if (letterSpacing) w += letterSpacing * Math.max(0, line.length - 1);
  return w;
}

function fitToWidth(line, family, size, weight, maxWidth, letterSpacing = 0) {
  const w = measureLineWidth(line, family, size, weight, letterSpacing);
  if (w <= maxWidth || w === 0) return size;
  return size * (maxWidth / w) * 0.98;
}

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

// === Image assets =========================================================
// Inlined as base64 data URIs so the SVG → canvas rasterizer can paint them
// (external image refs don't resolve when the SVG is loaded via a blob URL).

let _ckLogoDataUrl = null;
async function ckLogoDataUrl() {
  if (_ckLogoDataUrl) return _ckLogoDataUrl;
  try {
    const resp = await fetch("../../assets/ck-logo.png");
    const blob = await resp.blob();
    _ckLogoDataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn("ck-logo load failed", e);
    _ckLogoDataUrl = "";
  }
  return _ckLogoDataUrl;
}

async function renderCkLogo(z) {
  const href = await ckLogoDataUrl();
  if (!href) return "";
  return `<image href="${href}" x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}"
          preserveAspectRatio="xMidYMid meet"/>`;
}

let _sevenDataUrl = null;
async function sevenDataUrl() {
  if (_sevenDataUrl) return _sevenDataUrl;
  try {
    const resp = await fetch("../../assets/7.png");
    const blob = await resp.blob();
    _sevenDataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn("7.png load failed", e);
    _sevenDataUrl = "";
  }
  return _sevenDataUrl;
}

async function renderSeven(z) {
  const href = await sevenDataUrl();
  if (!href) return "";
  return `<image href="${href}" x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}"
          preserveAspectRatio="xMidYMid meet"/>`;
}

// === QR code (lazy CDN import) ============================================

let _qrcodeMod = null;
async function qrcode() {
  if (_qrcodeMod) return _qrcodeMod;
  const m = await import("https://esm.sh/qrcode-generator@1.4.4");
  _qrcodeMod = m.default;
  return _qrcodeMod;
}

async function qrSvgGroup(url, x, y, size) {
  if (!url) {
    return `
      <rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#f4f0ea" stroke="#cfc7bc" stroke-width="3"/>
      <line x1="${x}" y1="${y}" x2="${x + size}" y2="${y + size}" stroke="#cfc7bc" stroke-width="3"/>
      <line x1="${x + size}" y1="${y}" x2="${x}" y2="${y + size}" stroke="#cfc7bc" stroke-width="3"/>
      <text x="${x + size / 2}" y="${y + size + 36}" text-anchor="middle"
            font-family="Inter, sans-serif" font-size="${Math.max(14, size * 0.07)}"
            fill="#a09a90" letter-spacing="2">QR URL EMPTY</text>`;
  }
  const QR = await qrcode();
  const qr = QR(0, "M");
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
      rects.push(`<rect x="${rx.toFixed(2)}" y="${ry.toFixed(2)}" width="${(cell + 0.5).toFixed(2)}" height="${(cell + 0.5).toFixed(2)}" fill="#1a1816"/>`);
    }
  }
  return rects.join("");
}

// === Camera icon ==========================================================

function cameraIconSVG(z) {
  const { x, y, w, h, color } = z;
  const stroke = color || INK;
  const sw = Math.max(2.5, Math.min(w, h) * 0.04);
  const lensR = Math.min(w, h) * 0.28;
  const cx = x + w / 2;
  const cy = y + h / 2 + h * 0.06;
  // Body rect with a small flash-mount notch on top.
  const bodyTop = y + h * 0.23;
  const bodyL = x + sw;
  const bodyR = x + w - sw;
  const flashL = x + w * 0.36;
  const flashR = x + w * 0.64;
  const flashTop = y + sw * 1.5;
  return `
    <g fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
      <path d="M ${bodyL} ${bodyTop}
               L ${flashL - h * 0.05} ${bodyTop}
               L ${flashL} ${flashTop}
               L ${flashR} ${flashTop}
               L ${flashR + h * 0.05} ${bodyTop}
               L ${bodyR} ${bodyTop}
               L ${bodyR} ${y + h - sw}
               L ${bodyL} ${y + h - sw} Z"/>
      <circle cx="${cx}" cy="${cy}" r="${lensR}"/>
      <circle cx="${cx}" cy="${cy}" r="${lensR * 0.6}"/>
      <circle cx="${bodyR - sw * 2}" cy="${bodyTop + sw * 2}" r="${sw * 0.7}" fill="${stroke}"/>
    </g>`;
}

// === Zone renderers =======================================================

function renderScript(z) {
  const size = fitToWidth(z.text, z.family, z.naturalSize, 400, z.w);
  const cx = z.x + z.w / 2;
  const cy = z.y + z.h * 0.78;
  return `<text x="${cx}" y="${cy}" text-anchor="middle"
          font-family="${z.family}" font-size="${size.toFixed(2)}"
          fill="${z.color}">${escapeXML(z.text)}</text>`;
}

function renderNumeral(z, label) {
  const text = String(label || "");
  if (!text) return "";
  const sizeByH = z.h * 0.95;
  const sizeByW = fitToWidth(text, z.family, sizeByH, z.weight, z.w);
  const size = Math.min(sizeByH, sizeByW);
  const cx = z.x + z.w / 2;
  const cy = z.y + z.h * 0.88;
  return `<text x="${cx}" y="${cy}" text-anchor="middle"
          font-family="${z.family}" font-size="${size.toFixed(2)}"
          font-weight="${z.weight}" fill="${z.color}">${escapeXML(text)}</text>`;
}

function renderCouple(z) {
  const cx = z.x + z.w / 2;
  // Three lines: caps · script "and" · caps. Distribute by zone height.
  // Native ratio: caps 58 / script 68 / caps 58 from defaults — keep same.
  const scale = z.h / 240;                                  // 240 = default left.couple h
  const capsSize = z.capsSize * scale;
  const scriptSize = z.scriptSize * scale;
  const letterSpacing = z.letterSpacing * scale;
  const y1 = z.y + z.h * 0.33;
  const y2 = z.y + z.h * 0.62;
  const y3 = z.y + z.h * 0.92;
  return `
    <text x="${cx}" y="${y1}" text-anchor="middle"
          font-family="Inter, sans-serif" font-size="${capsSize.toFixed(2)}"
          font-weight="500" letter-spacing="${letterSpacing.toFixed(2)}"
          fill="${z.color}">${escapeXML(COUPLE_FIRST)}</text>
    <text x="${cx}" y="${y2}" text-anchor="middle"
          font-family="Sacramento, cursive" font-size="${scriptSize.toFixed(2)}"
          fill="${z.color}">and</text>
    <text x="${cx}" y="${y3}" text-anchor="middle"
          font-family="Inter, sans-serif" font-size="${capsSize.toFixed(2)}"
          font-weight="500" letter-spacing="${letterSpacing.toFixed(2)}"
          fill="${z.color}">${escapeXML(COUPLE_SECOND)}</text>`;
}

function renderSpacedCaps(z, text) {
  const t = String(text || "").toUpperCase();
  if (!t) return "";
  const size = Math.min(z.h * 0.78, fitToWidth(t, "Inter, sans-serif", z.naturalSize, z.weight, z.w, z.letterSpacing));
  const cx = z.x + z.w / 2;
  const cy = z.y + z.h * 0.78;
  return `<text x="${cx}" y="${cy}" text-anchor="middle"
          font-family="Inter, sans-serif" font-size="${size.toFixed(2)}"
          font-weight="${z.weight}" letter-spacing="${z.letterSpacing}"
          fill="${z.color}">${escapeXML(t)}</text>`;
}

function renderMultiCaps(z, text) {
  const lines = String(text || "").split(/\r?\n/).filter((l) => l.length > 0).map((l) => l.toUpperCase());
  if (!lines.length) return "";
  const cx = z.x + z.w / 2;
  // Fit each line to width independently, then use the min size for visual consistency.
  let size = z.naturalSize;
  for (const l of lines) {
    size = Math.min(size, fitToWidth(l, "Inter, sans-serif", z.naturalSize, z.weight, z.w, z.letterSpacing));
  }
  const lineH = Math.min(size * 1.3, z.h / lines.length);
  const startY = z.y + lineH * 0.78;
  return lines.map((l, i) => `<text x="${cx}" y="${startY + i * lineH}" text-anchor="middle"
          font-family="Inter, sans-serif" font-size="${size.toFixed(2)}"
          font-weight="${z.weight}" letter-spacing="${z.letterSpacing}"
          fill="${z.color}">${escapeXML(l)}</text>`).join("");
}

function renderThankStack(z) {
  // Two stacked words "THANK" / "YOU", scaled to fit.
  const cx = z.x + z.w / 2;
  let size = z.naturalSize;
  size = Math.min(size, fitToWidth("THANK", "Inter, sans-serif", z.naturalSize, z.weight, z.w, z.letterSpacing));
  size = Math.min(size, fitToWidth("YOU", "Inter, sans-serif", z.naturalSize, z.weight, z.w, z.letterSpacing));
  size = Math.min(size, z.h * 0.45);
  const y1 = z.y + z.h * 0.42;
  const y2 = z.y + z.h * 0.88;
  return `
    <text x="${cx}" y="${y1}" text-anchor="middle"
          font-family="Inter, sans-serif" font-size="${size.toFixed(2)}"
          font-weight="${z.weight}" letter-spacing="${z.letterSpacing}"
          fill="${z.color}">THANK</text>
    <text x="${cx}" y="${y2}" text-anchor="middle"
          font-family="Inter, sans-serif" font-size="${size.toFixed(2)}"
          font-weight="${z.weight}" letter-spacing="${z.letterSpacing}"
          fill="${z.color}">YOU</text>`;
}

function renderWrappedCaps(z, text) {
  const lines = wrapText(String(text || "").toUpperCase(), "Inter, sans-serif", z.naturalSize, z.weight, z.w, z.letterSpacing);
  if (!lines.length) return "";
  const cx = z.x + z.w / 2;
  let lineH = z.naturalSize * 1.45;
  // Shrink line spacing if the block would overflow height.
  if (lines.length * lineH > z.h) lineH = z.h / lines.length;
  const startY = z.y + lineH * 0.78;
  return lines.map((l, i) => `<text x="${cx}" y="${startY + i * lineH}" text-anchor="middle"
          font-family="Inter, sans-serif" font-size="${z.naturalSize}"
          font-weight="${z.weight}" letter-spacing="${z.letterSpacing}"
          fill="${z.color}">${escapeXML(l)}</text>`).join("");
}

function renderPrompts(z, text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => l.toUpperCase());
  if (!lines.length) return "";
  const cx = z.x + z.w / 2;
  const rowH = Math.min(z.naturalSize * 1.45, z.h / lines.length);
  const size = Math.min(z.naturalSize, rowH * 0.72);
  const startY = z.y + rowH * 0.78;
  return lines.map((l, i) => `<text x="${cx}" y="${startY + i * rowH}" text-anchor="middle"
          font-family="Inter, sans-serif" font-size="${size.toFixed(2)}"
          font-weight="${z.weight}" letter-spacing="${z.letterSpacing}"
          fill="${z.color}">${escapeXML(l)}</text>`).join("");
}

function renderRule(z) {
  const y = z.y + z.h / 2;
  return `<line x1="${z.x}" y1="${y}" x2="${z.x + z.w}" y2="${y}"
          stroke="${z.color}" stroke-width="${z.weight}"/>`;
}

async function renderZone(id, z, number, state) {
  switch (z.kind) {
    case "script":      return renderScript(z);
    case "numeral":     return renderNumeral(z, number);
    case "couple":      return renderCouple(z);
    case "spacedCaps":  return renderSpacedCaps(z, state[z.textRef]);
    case "multiCaps":   return renderMultiCaps(z, state[z.textRef]);
    case "thankStack":  return renderThankStack(z);
    case "wrappedCaps": return renderWrappedCaps(z, state[z.textRef]);
    case "prompts":     return renderPrompts(z, state[z.textRef]);
    case "rule":        return renderRule(z);
    case "camera":      return cameraIconSVG(z);
    case "qr":          return await qrSvgGroup(state.qrUrl, z.x, z.y, Math.min(z.w, z.h));
    case "ckLogo":      return await renderCkLogo(z);
    case "seven":       return await renderSeven(z);
    default:            return "";
  }
}

// === Static decorations ===================================================

function foldGuides() {
  const foldX = [
    COL_X[0] + COL.w + COL.gap / 2,                         // 825
    COL_X[1] + COL.w + COL.gap / 2,                         // 1575
    TAB.x,                                                  // 2400
  ];
  return foldX.map((fx) => `<line x1="${fx}" y1="60" x2="${fx}" y2="${CARD.h - 60}"
    stroke="#9a958c" stroke-width="2.4" stroke-dasharray="14 10" opacity="0.7"/>`).join("");
}

function glueTab() {
  const cx = TAB.x + TAB.w / 2;
  const cy = CARD.h / 2;
  return `
    <defs>
      <pattern id="tn-hatch" patternUnits="userSpaceOnUse" width="14" height="14" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="14" stroke="#cfc7bc" stroke-width="1.8"/>
      </pattern>
    </defs>
    <rect x="${TAB.x}" y="60" width="${TAB.w}" height="${CARD.h - 120}"
          fill="url(#tn-hatch)" opacity="0.65"/>
    <text x="${cx}" y="${cy}" text-anchor="middle"
          transform="rotate(-90 ${cx} ${cy})"
          font-family="Inter, sans-serif" font-size="32" font-weight="500"
          letter-spacing="8" fill="#7a746c">PASTE BEHIND PANEL 1</text>
  `;
}

// === Edit overlay =========================================================
// Dashed bounding rect + move overlay + resize handle per zone. Mounted only
// when `editMode` is true so the clean preview shows the printed result.

function editOverlay(zones) {
  const accent = "#7b8a5b";
  const handleR = 18;
  const moves = zones.map(([id, z]) => `
    <rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}"
          fill="none" stroke="${accent}" stroke-width="3" stroke-dasharray="14 10"
          opacity="0.85" data-edit-border="${id}" pointer-events="none"/>
    <rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}"
          fill="rgba(0,0,0,0.001)" style="cursor:move;touch-action:none"
          data-edit-role="move" data-edit-id="${id}"/>`).join("");
  const handles = zones.map(([id, z]) => `
    <circle cx="${z.x + z.w}" cy="${z.y + z.h}" r="${handleR}"
            fill="${accent}" stroke="white" stroke-width="3"
            style="cursor:nwse-resize;touch-action:none"
            data-edit-role="resize" data-edit-id="${id}"/>`).join("");
  return moves + handles;
}

// === Assemble card ========================================================

function zoneBounds(id, state) {
  const def = ZONES_DEFAULT[id];
  const ov = state.zones?.[id];
  if (!ov) return def;
  return { ...def, x: ov.x ?? def.x, y: ov.y ?? def.y, w: ov.w ?? def.w, h: ov.h ?? def.h };
}

async function renderCardSVG(number, state, opts = {}) {
  const editMode = !!opts.editMode;
  const zonePairs = Object.keys(ZONES_DEFAULT).map((id) => [id, zoneBounds(id, state)]);
  const layers = [];
  for (const [id, z] of zonePairs) {
    const svg = await renderZone(id, z, number, state);
    layers.push(`<g data-zone-id="${id}">${svg}</g>`);
  }
  const overlay = editMode ? editOverlay(zonePairs) : "";
  return `
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
         viewBox="0 0 ${CARD.w} ${CARD.h}"
         width="${CARD.w}" height="${CARD.h}"
         style="max-width:100%;height:auto;display:block">
      <rect x="0" y="0" width="${CARD.w}" height="${CARD.h}" fill="${PAPER}"/>
      ${layers.join("\n")}
      ${glueTab()}
      ${foldGuides()}
      ${overlay}
    </svg>`;
}

async function renderSheetSVG(number, state, opts = {}) {
  const cardSvg = await renderCardSVG(number, state, opts);
  const cardInner = cardSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/)[1];
  const mx = Math.round((A4.w - CARD.w) / 2);
  const my = Math.round((A4.h - CARD.h) / 2);
  return `
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
         viewBox="0 0 ${A4.w} ${A4.h}"
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

let _state = { ...DEFAULTS, zones: {} };
function persist() {
  setTemplateData(TEMPLATE_ID, _state);
  fbSet(TEMPLATE_ID, _state);
}
function parseNumbers(text) {
  return String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
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

// === Drag/resize handlers =================================================
// Attached to the rendered SVG when edit mode is on. Pointer events translate
// to SVG-coord deltas; commits update _state.zones[id] + persist + re-render.

function attachZoneDrag(svgEl, onFinal) {
  const moves   = Array.from(svgEl.querySelectorAll('[data-edit-role="move"]'));
  const resizes = Array.from(svgEl.querySelectorAll('[data-edit-role="resize"]'));

  function toSvg(ev) {
    const r = svgEl.getBoundingClientRect();
    return {
      sx: (ev.clientX - r.left) * (CARD.w / r.width),
      sy: (ev.clientY - r.top)  * (CARD.h / r.height),
    };
  }

  // Visual-only updates during drag — move the box + border + handle in-place
  // so the user sees feedback without us tearing down the SVG (which would
  // also kill the in-flight pointer capture). The actual content (text / QR /
  // camera) snaps to the new bounds on pointer-up via `onFinal` → render().
  function paintLive(id, next) {
    const move = svgEl.querySelector(`[data-edit-role="move"][data-edit-id="${id}"]`);
    const border = svgEl.querySelector(`[data-edit-border="${id}"]`);
    const handle = svgEl.querySelector(`[data-edit-role="resize"][data-edit-id="${id}"]`);
    for (const el of [move, border]) {
      if (!el) continue;
      el.setAttribute("x", next.x);
      el.setAttribute("y", next.y);
      el.setAttribute("width", next.w);
      el.setAttribute("height", next.h);
    }
    if (handle) {
      handle.setAttribute("cx", next.x + next.w);
      handle.setAttribute("cy", next.y + next.h);
    }
  }

  let drag = null;
  function onMove(ev) {
    if (!drag) return;
    ev.preventDefault();
    const p = toSvg(ev);
    const dx = p.sx - drag.start.sx;
    const dy = p.sy - drag.start.sy;
    const z0 = drag.z0;
    const next = drag.role === "move"
      ? { x: z0.x + dx, y: z0.y + dy, w: z0.w, h: z0.h }
      : { x: z0.x, y: z0.y, w: Math.max(40, z0.w + dx), h: Math.max(40, z0.h + dy) };
    drag.last = next;
    paintLive(drag.id, next);
  }
  function onUp(ev) {
    if (!drag) return;
    try { drag.target.releasePointerCapture(ev.pointerId); } catch {}
    const { id, last } = drag;
    drag = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    onFinal(id, last);
  }

  [...moves, ...resizes].forEach((el) => {
    el.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      try { el.setPointerCapture(ev.pointerId); } catch {}
      const id = el.dataset.editId;
      const z = zoneBounds(id, _state);
      drag = {
        id, role: el.dataset.editRole,
        start: toSvg(ev),
        z0: { x: z.x, y: z.y, w: z.w, h: z.h },
        last: { x: z.x, y: z.y, w: z.w, h: z.h },
        target: el,
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    });
  });
}

// === Mount ================================================================

async function mount() {
  const root = document.getElementById("editor-root");
  if (!root) throw new Error("table-numbers: #editor-root missing");

  const local = getTemplateData(TEMPLATE_ID) || {};
  _state = { ...DEFAULTS, ...local, zones: { ...DEFAULTS.zones, ...(local.zones || {}) } };
  try {
    const remote = await fbGet(TEMPLATE_ID);
    if (remote && typeof remote === "object") {
      _state = {
        ...DEFAULTS, ..._state, ...remote,
        zones: { ..._state.zones, ...(remote.zones || {}) },
      };
      setTemplateData(TEMPLATE_ID, _state);
    }
  } catch (e) { console.warn("fb hydrate failed", e); }

  // One-time migration: old single-line "07.02.26 | CCF EAST ORTIGAS" → new
  // two-line format. Any other " | "-separated value Charlie may have typed
  // also gets split into multiple lines.
  if (_state.dateVenue === "07.02.26 | CCF EAST ORTIGAS") {
    _state.dateVenue = DEFAULTS.dateVenue;
    persist();
  } else if (_state.dateVenue && _state.dateVenue.includes(" | ")) {
    _state.dateVenue = _state.dateVenue.replace(/\s*\|\s*/g, "\n");
    persist();
  }

  // One-time migration: dot-keyed zone IDs ("left.tableScript") rewritten to
  // underscore-keyed ("left_tableScript"). Firebase RTDB rejects "." in child
  // names, which silently blocked every layout edit from syncing across
  // devices. Walk _state.zones once; if any dot-keyed entries exist, rebuild
  // the map with underscored keys + persist.
  if (_state.zones && Object.keys(_state.zones).some((k) => k.includes("."))) {
    const fixed = {};
    for (const [k, v] of Object.entries(_state.zones)) {
      fixed[k.replace(/\./g, "_")] = v;
    }
    _state.zones = fixed;
    persist();
  }

  // Backfill the QR URL once — the empty-string default we shipped earlier
  // sticks around in saved state and won't fall back to the new default. If
  // it's still blank, point it at the photo-upload page.
  if (!_state.qrUrl) {
    _state.qrUrl = DEFAULTS.qrUrl;
    persist();
  }

  let previewIdx = 0;
  let printMode = false;
  let editMode = false;

  root.innerHTML = `
    <div class="editor-header">
      <div class="title-block">
        <h1>Table Numbers</h1>
        <p>3-panel flat card + glue tab · 2600 × 1800 (8.67″ × 6″) landscape · 1 per A4 landscape · folds into a triangular tent</p>
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
          <p class="field-hint">One per line — drives how many cards get generated.</p>
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
          <label>QR URL <span style="color:var(--ink-faint);font-weight:400">(scan-to-upload photo album)</span></label>
          <input id="ed-qr" type="url" placeholder="https://photos.app.goo.gl/…"/>
          <label>Date · Venue <span style="color:var(--ink-faint);font-weight:400">(one per line)</span></label>
          <textarea id="ed-datevenue" rows="2"></textarea>
          <label>Welcome heading</label>
          <textarea id="ed-welcome" rows="2"></textarea>
          <label>Share-the-love body</label>
          <textarea id="ed-share" rows="3"></textarea>
          <label>Thank-you body</label>
          <textarea id="ed-thank" rows="8"></textarea>
          <label>QR instruction <span style="color:var(--ink-faint);font-weight:400">(one per line)</span></label>
          <textarea id="ed-prompts" rows="3"></textarea>
        </div>
        <div class="field-block">
          <h3>Layout</h3>
          <p class="field-hint">Drag elements to move; corner handle to resize. Resets every box to its design-time position.</p>
          <button type="button" id="ed-reset-zones" class="btn btn-ghost" style="font-size:0.72rem;padding:5px 9px">
            <span class="material-symbols-outlined" style="font-size:14px">restart_alt</span>
            Reset layout
          </button>
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
          <label class="toggle"><input id="ed-edit-mode" type="checkbox"/> Edit boxes</label>
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
  const editCk     = $("ed-edit-mode");
  const printCk    = $("ed-print-mode");
  const resetBtn   = $("ed-reset-zones");
  const previewLbl = $("ed-preview-label");
  const stage      = $("ed-stage");

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
    const svg = printMode
      ? await renderSheetSVG(num, _state, { editMode: false })
      : await renderCardSVG(num, _state, { editMode });
    if (myToken !== _renderToken) return;
    stage.innerHTML = svg;
    updateCounter();
    syncLabel();
    if (editMode && !printMode) wireDrag();
  }

  // Pointer-up commit — state + Firebase update once the user releases, then
  // a full re-render so the text/QR/camera snap to the new bounds.
  function commitZone(id, next) {
    _state = { ..._state, zones: { ..._state.zones, [id]: next } };
    persist();
    render();
  }

  function wireDrag() {
    const svgEl = stage.querySelector("svg");
    if (!svgEl) return;
    attachZoneDrag(svgEl, commitZone);
  }

  numbersTA.addEventListener("input", () => { _state.numbers = numbersTA.value; previewIdx = 0; persist(); render(); });
  qrInput.addEventListener("input", () => { _state.qrUrl = qrInput.value; persist(); render(); });
  dvInput.addEventListener("input", () => { _state.dateVenue = dvInput.value; persist(); render(); });
  welcomeTA.addEventListener("input", () => { _state.welcome = welcomeTA.value; persist(); render(); });
  shareTA.addEventListener("input", () => { _state.shareBody = shareTA.value; persist(); render(); });
  thankTA.addEventListener("input", () => { _state.thankBody = thankTA.value; persist(); render(); });
  promptsTA.addEventListener("input", () => { _state.prompts = promptsTA.value; persist(); render(); });

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
  editCk.addEventListener("change", () => { editMode = editCk.checked; render(); });
  printCk.addEventListener("change", () => { printMode = printCk.checked; render(); });
  resetBtn.addEventListener("click", () => {
    if (!confirm("Reset every element to its design-time position?")) return;
    _state = { ..._state, zones: {} };
    persist();
    render();
    showToast("Layout reset");
  });

  // Export helpers — render without edit overlay
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
      const svg = printMode
        ? await renderSheetSVG(n, _state, { editMode: false })
        : await renderCardSVG(n, _state, { editMode: false });
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
      const svg = printMode
        ? await renderSheetSVG(n, _state, { editMode: false })
        : await renderCardSVG(n, _state, { editMode: false });
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
        const svg = await renderCardSVG(arr[i], _state, { editMode: false });
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
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape", compress: true });
      for (let i = 0; i < arr.length; i++) {
        showToast(`Rendering ${i + 1}/${arr.length}…`);
        const svg = await renderSheetSVG(arr[i], _state, { editMode: false });
        const blob = await svgToPngBlob(detachedSvg(svg), { scale: 1 });
        const dataUrl = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result));
          r.onerror = rej;
          r.readAsDataURL(blob);
        });
        if (i > 0) pdf.addPage();
        pdf.addImage(dataUrl, "PNG", 0, 0, 297, 210, undefined, "FAST");
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
        const svg = await renderCardSVG(arr[i], _state, { editMode: false });
        const blob = await svgToPngBlob(detachedSvg(svg), { scale: 1.5 });
        await uploadPngBlob(blob, `Table Number — ${numSlug(arr[i])}.png`);
      }
      showToast(`Uploaded ${arr.length} to Drive`, "ok", 4000);
      window.open(COLLATERALS_FOLDER_URL, "_blank", "noopener");
    } catch (e) { console.error(e); showToast(e.message || "Batch upload failed", "err", 4000); }
  });

  // Live sync — text fields + zones from other devices.
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
    if (remote.zones && typeof remote.zones === "object") {
      _state = { ..._state, zones: { ...remote.zones } };
      dirty = true;
    }
    if (dirty) render();
  });

  render();
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => render()).catch(() => {});
  }
}

mount();
