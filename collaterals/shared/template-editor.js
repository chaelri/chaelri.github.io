// Shared editor for every collateral.
//
// Each template page mounts this with a config:
//
//   import { mountEditor } from "../../shared/template-editor.js";
//   mountEditor({
//     templateId: "name-cards",
//     title: "Name Cards",
//     subtitle: "...",
//     canvas: { w: 1050, h: 600 },
//     fonts: ["Sacramento", "Inter"],   // optional — restrict the font dropdown
//     zones: [
//       { id: "name",     label: "Name",     x, y, w, h, fontFamily, ... },
//       { id: "subtitle", label: "Subtitle", x, y, w, h, fontFamily, ... },
//     ],
//     batchMode: true,
//     batchLabel: "Guest list",
//     batchPlaceholder: "Karla | TABLE 1\nCharlie | TABLE 1\n…",
//     exportPrefix: "Name Card",
//   });
//
// Backward-compat: `cfg.defaultZone` is accepted as a single-zone shorthand.
//
// User workflow:
//   1. Upload a PNG made in Canva (locked background).
//   2. Drag/resize each text zone over the spot they left blank.
//   3. Type variable text (one textarea per zone), or paste a "|"-separated list.
//   4. Toggle off the edit chrome to preview clean. Download or upload-all to Drive.

import { saveAsset, getAsset, clearAsset } from "./assets.js";
import { svgToPngBlob, downloadPng, composeToPngBlob, composeToDownload } from "./export.js";
import { uploadPngBlob, sanitizeFilename, COLLATERALS_FOLDER_URL } from "./drive.js";
import { getTemplateData, setTemplateData, setStatus, getAllStatus } from "./state.js";
import { fbGet, fbSet, fbSubscribe } from "./firebase-sync.js";

const ALL_FONTS = [
  { id: "Playfair Display", label: "Playfair Display (serif)" },
  { id: "Dancing Script",   label: "Dancing Script (script)" },
  { id: "Great Vibes",      label: "Great Vibes (script)" },
  { id: "Sacramento",       label: "Sacramento (script)" },
  { id: "Allura",           label: "Allura (script)" },
  { id: "Inter",            label: "Inter (sans)" },
  { id: "Georgia",          label: "Georgia (serif fallback)" },
];

const BATCH_SEP = "|";

function escapeXML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
}

function showToast(msg, kind = "ok", ms = 2400) {
  const el = document.getElementById("toast");
  const m = document.getElementById("toast-msg");
  if (!el || !m) { console.log("[toast]", msg); return; }
  m.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (el.className = "toast"), ms);
}

function normalizeZones(cfg) {
  if (Array.isArray(cfg.zones) && cfg.zones.length) return cfg.zones;
  if (cfg.defaultZone) return [{ id: "main", label: "Text", ...cfg.defaultZone }];
  throw new Error("template-editor: cfg.zones or cfg.defaultZone required");
}

// === Rendering ============================================================

let _measureCtx = null;
function measureLineWidth(line, fontSize, zone) {
  if (!_measureCtx) _measureCtx = document.createElement("canvas").getContext("2d");
  const style = zone.italic ? "italic" : "normal";
  const weight = zone.weight || 400;
  _measureCtx.font = `${style} ${weight} ${fontSize}px "${zone.fontFamily}", Georgia, serif`;
  let w = _measureCtx.measureText(line).width;
  const ls = Number(zone.letterSpacing) || 0;
  if (ls) w += ls * Math.max(0, line.length - 1);
  return w;
}

// Auto-fit: zone.fontSize is the *preferred* size. If any line overflows the
// zone width, shrink uniformly so the longest line fits. Never up-scale.
// Script fonts (Sacramento, Great Vibes) need fonts.ready before measurement
// is accurate — mountEditor re-renders on fonts.ready to refresh.
function fitFontSize(lines, zone) {
  const target = zone.fontSize;
  let maxW = 0;
  for (const l of lines) {
    if (!l) continue;
    const w = measureLineWidth(l, target, zone);
    if (w > maxW) maxW = w;
  }
  if (maxW <= zone.w || maxW === 0) return target;
  // 0.98 safety margin — canvas measurement isn't pixel-perfect vs SVG render.
  return target * (zone.w / maxW) * 0.98;
}

function zoneTextSVG(zone, text) {
  const lines = String(text || "").split(/\n/);
  const anchor = zone.align === "left" ? "start" : zone.align === "right" ? "end" : "middle";
  const tx = zone.align === "left" ? zone.x
           : zone.align === "right" ? zone.x + zone.w
           : zone.x + zone.w / 2;
  const fontSize = fitFontSize(lines, zone);
  const lineH = fontSize * (zone.lineHeight || 1.15);
  const totalH = lineH * lines.length;
  // Approximate vertical center: top of first cap-line.
  const topY = zone.y + zone.h / 2 - totalH / 2 + fontSize * 0.82;
  const tspans = lines.map((l, i) =>
    `<tspan x="${tx}" dy="${i === 0 ? 0 : lineH}">${escapeXML(l)}</tspan>`
  ).join("");
  return `<text x="${tx}" y="${topY}" text-anchor="${anchor}"
                font-family="${zone.fontFamily}, Georgia, serif"
                font-size="${fontSize}"
                font-weight="${zone.weight || 400}"
                font-style="${zone.italic ? "italic" : "normal"}"
                letter-spacing="${zone.letterSpacing || 0}"
                fill="${zone.color}">${tspans}</text>`;
}

// Placements describe how the (per-tile) design canvas tiles onto an output
// sheet. The design view = one tile at origin, no tent/fold. Tent-fold = one
// tile shifted down by the design height, with a blank tent top + fold line.
// A4 2-up = two tent-fold tiles stacked centred on an A4-300DPI sheet, plus a
// cut indicator between them.
function computePlacements({ designCanvas, printLayout }) {
  const { w: dw, h: dh } = designCanvas;
  if (!printLayout) {
    return {
      sheet: { w: dw, h: dh },
      tiles: [{ x: 0, y: 0, tent: null, fold: null }],
      cuts: [],
    };
  }
  if (printLayout.type === "tent-fold") {
    return {
      sheet: { w: dw, h: dh * 2 },
      tiles: [{
        x: 0, y: dh,
        tent: { x: 0, y: 0, w: dw, h: dh },
        fold: { x1: dw * 0.02, y1: dh, x2: dw * 0.98, y2: dh },
      }],
      cuts: [],
    };
  }
  if (printLayout.type === "a4-tent-4up") {
    // A4 portrait at 300 DPI · 2×2 grid of tent-fold cards.
    const sheetW = 2480, sheetH = 3508;
    const tileH = dh * 2;
    // Gutters between cards so the cut indicators sit in clean white space.
    const gap = 30;
    const cols = 2, rows = 2;
    const xStart = Math.round((sheetW - cols * dw - (cols - 1) * gap) / 2);
    const yStart = Math.round((sheetH - rows * tileH - (rows - 1) * gap) / 2);
    const tiles = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tileLeft = xStart + c * (dw + gap);
        const tileTop = yStart + r * (tileH + gap);
        tiles.push({
          x: tileLeft,
          y: tileTop + dh,
          tent: { x: tileLeft, y: tileTop, w: dw, h: dh },
          fold: {
            x1: tileLeft + dw * 0.02, y1: tileTop + dh,
            x2: tileLeft + dw * 0.98, y2: tileTop + dh,
          },
          // Trim-cut border around the full tent-fold flat (1050×1200) so
          // each card can be cut precisely without leaving gutter margin.
          border: { x: tileLeft, y: tileTop, w: dw, h: tileH },
        });
      }
    }
    return {
      sheet: { w: sheetW, h: sheetH },
      tiles,
      cuts: [
        // Horizontal cut between row 0 and row 1
        { x1: 0, y1: yStart + tileH + gap / 2, x2: sheetW, y2: yStart + tileH + gap / 2 },
        // Vertical cut between col 0 and col 1
        { x1: xStart + dw + gap / 2, y1: 0, x2: xStart + dw + gap / 2, y2: sheetH },
      ],
    };
  }
  return {
    sheet: { w: dw, h: dh },
    tiles: [{ x: 0, y: 0, tent: null, fold: null }],
    cuts: [],
  };
}

function buildSVG({ bgUrl, designCanvas, zones, tilesTexts, editing = false, accent = "#7b8a5b", noBg = false, placements }) {
  const { sheet, tiles, cuts } = placements;
  const { w: sw, h: sh } = sheet;
  const { w: dw, h: dh } = designCanvas;
  const isMultiTile = tiles.length > 1;

  const hasContent = (i) => (tilesTexts[i] || []).some((s) => s && String(s).trim().length > 0);

  // Tent white panels — painted before the bg so the bg image sits cleanly
  // on top in the design half and the tent top stays pure white.
  const tentTops = tiles.map((t, i) => {
    if (!t.tent) return "";
    if (isMultiTile && !hasContent(i)) return "";
    return `<rect x="${t.tent.x}" y="${t.tent.y}" width="${t.tent.w}" height="${t.tent.h}" fill="#ffffff"/>`;
  }).join("");

  const bgLayers = noBg
    ? ""
    : tiles.map((t, i) => {
        if (isMultiTile && !hasContent(i)) return "";
        if (bgUrl) {
          return `<image href="${bgUrl}" x="${t.x}" y="${t.y}" width="${dw}" height="${dh}" preserveAspectRatio="xMidYMid slice"/>`;
        }
        // Placeholder shown once (tile 0) when no bg uploaded.
        if (isMultiTile && i !== 0) return "";
        return `<rect x="${t.x}" y="${t.y}" width="${dw}" height="${dh}" fill="#f3eedf"/>
                <text x="${t.x + dw/2}" y="${t.y + dh/2}" text-anchor="middle" dominant-baseline="middle"
                      font-family="Inter, sans-serif" font-size="${Math.max(18, dw * 0.025)}" fill="#9a948a">
                  Upload your Canva PNG to start (${dw} × ${dh} px)
                </text>`;
      }).join("");

  // Text layers: zones are stored in design coords, each tile shifts them.
  const textLayers = tiles.map((t, ti) => {
    const tileTexts = tilesTexts[ti] || [];
    return zones.map((z, zi) => {
      const txt = tileTexts[zi];
      const zPlaced = { ...z, x: z.x + t.x, y: z.y + t.y };
      return `<g data-role="text-layer" data-z="${zi}" data-tile="${ti}">${txt ? zoneTextSVG(zPlaced, txt) : ""}</g>`;
    }).join("");
  }).join("");

  const foldLines = tiles.map((t, i) => {
    if (!t.fold) return "";
    if (isMultiTile && !hasContent(i)) return "";
    return `<line x1="${t.fold.x1}" y1="${t.fold.y1}" x2="${t.fold.x2}" y2="${t.fold.y2}"
                  stroke="#bdbdbd" stroke-width="${Math.max(1, dw * 0.0014)}"
                  stroke-dasharray="${Math.max(5, dw * 0.009)} ${Math.max(5, dw * 0.009)}"
                  stroke-linecap="round" opacity="0.7"/>`;
  }).join("");

  // Cut indicators: longer dashes than the fold line, edge-to-edge, so the
  // printer reads them as "slice here" not "fold here". Lines are described
  // by generic endpoints so they can run horizontally or vertically. Per-tile
  // borders give a precise trim guide around each card's outer boundary.
  const dim = Math.max(sw, sh);
  const cutDash1 = Math.max(28, dim * 0.014);
  const cutDash2 = Math.max(12, dim * 0.006);
  const cutStroke = Math.max(1.2, dim * 0.0007);
  // Sheet-spanning separators between cards use red so they're visually
  // distinct from the per-card gray border guides — the printer can't
  // confuse "main quadrant split" with "trim around each card".
  const cutLines = (cuts || []).map((c) =>
    `<line x1="${c.x1}" y1="${c.y1}" x2="${c.x2}" y2="${c.y2}"
           stroke="#d32f2f" stroke-width="${cutStroke}"
           stroke-dasharray="${cutDash1} ${cutDash2}" opacity="0.75"/>`
  ).join("");
  const borderCuts = tiles.map((t, i) => {
    if (!t.border) return "";
    if (isMultiTile && !hasContent(i)) return "";
    const { x, y, w, h } = t.border;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}"
                  fill="none" stroke="#8c8c8c" stroke-width="${cutStroke}"
                  stroke-dasharray="${cutDash1} ${cutDash2}" opacity="0.55"/>`;
  }).join("");

  // Editing chrome only renders in the design view (single tile, no tent).
  const isDesignView = tiles.length === 1 && !tiles[0].tent;
  const editLayers = (editing && isDesignView)
    ? zones.map((z, i) =>
        `<rect data-role="edit-border" data-z="${i}"
               x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}"
               fill="rgba(123,138,91,0.06)" stroke="${accent}"
               stroke-width="${Math.max(1.5, dw * 0.002)}"
               stroke-dasharray="${Math.max(8, dw * 0.012)} ${Math.max(6, dw * 0.008)}"/>`
      ).join("")
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
               viewBox="0 0 ${sw} ${sh}" width="${sw}" height="${sh}"
               style="max-width:100%;height:auto;display:block">
            ${tentTops}
            ${bgLayers}
            ${textLayers}
            ${foldLines}
            ${cutLines}
            ${borderCuts}
            ${editLayers}
          </svg>`;
}

// === Drag =================================================================

function attachZonesDrag({ svgEl, canvas, zones, texts, onCommit, accent = "#7b8a5b" }) {
  const NS = "http://www.w3.org/2000/svg";
  const { w: cw, h: ch } = canvas;
  const handleR = Math.max(8, cw * 0.014);

  const textLayers  = Array.from(svgEl.querySelectorAll('[data-role="text-layer"]'));
  const editBorders = Array.from(svgEl.querySelectorAll('[data-role="edit-border"]'));

  const overlay = document.createElementNS(NS, "g");
  overlay.setAttribute("data-role", "drag-overlay");
  // Two passes so all resize handles render ABOVE all move rects; otherwise an
  // outer zone's resize handle would be hidden under an inner zone's move rect.
  overlay.innerHTML =
    zones.map((z, i) => `
      <rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}"
            fill="rgba(0,0,0,0.001)" style="cursor:move;touch-action:none"
            data-role="move" data-z="${i}"/>
    `).join("") +
    zones.map((z, i) => `
      <circle cx="${z.x + z.w}" cy="${z.y + z.h}" r="${handleR}"
              fill="${accent}" stroke="white" stroke-width="${Math.max(1.5, cw * 0.002)}"
              style="cursor:nwse-resize;touch-action:none"
              data-role="resize" data-z="${i}"/>
    `).join("");
  svgEl.appendChild(overlay);

  const moveEls   = Array.from(overlay.querySelectorAll('[data-role="move"]'));
  const resizeEls = Array.from(overlay.querySelectorAll('[data-role="resize"]'));
  const live = zones.map((z) => ({ ...z }));

  function toSvg(ev) {
    const r = svgEl.getBoundingClientRect();
    return {
      sx: (ev.clientX - r.left) * (cw / r.width),
      sy: (ev.clientY - r.top)  * (ch / r.height),
    };
  }

  function paint(i) {
    const z = live[i];
    const m = moveEls[i];
    const hd = resizeEls[i];
    m.setAttribute("x", z.x); m.setAttribute("y", z.y);
    m.setAttribute("width", z.w); m.setAttribute("height", z.h);
    hd.setAttribute("cx", z.x + z.w); hd.setAttribute("cy", z.y + z.h);
    if (editBorders[i]) {
      editBorders[i].setAttribute("x", z.x);
      editBorders[i].setAttribute("y", z.y);
      editBorders[i].setAttribute("width", z.w);
      editBorders[i].setAttribute("height", z.h);
    }
    if (textLayers[i]) {
      textLayers[i].innerHTML = texts[i] ? zoneTextSVG(z, texts[i]) : "";
    }
  }

  let drag = null;
  function onMove(ev) {
    if (!drag) return;
    ev.preventDefault();
    const p = toSvg(ev);
    const dx = p.sx - drag.startSvg.sx;
    const dy = p.sy - drag.startSvg.sy;
    const start = drag.start;
    if (drag.role === "move") {
      live[drag.idx] = { ...start, x: start.x + dx, y: start.y + dy };
    } else {
      live[drag.idx] = {
        ...start,
        w: Math.max(cw * 0.04, start.w + dx),
        h: Math.max(ch * 0.04, start.h + dy),
      };
    }
    paint(drag.idx);
  }
  function onUp(ev) {
    if (!drag) return;
    try { drag.target.releasePointerCapture(ev.pointerId); } catch {}
    const idx = drag.idx;
    const z = live[idx];
    drag = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    if (onCommit) onCommit(idx, z);
  }

  [...moveEls, ...resizeEls].forEach((el) => {
    el.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      try { el.setPointerCapture(ev.pointerId); } catch {}
      const idx = Number(el.dataset.z) || 0;
      drag = {
        role: el.dataset.role,
        idx,
        startSvg: toSvg(ev),
        start: { ...live[idx] },
        target: el,
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    });
  });
}

// === Editor HTML ==========================================================

function zoneControlsBlock(idx, zone, fontOpts) {
  const z = idx;
  // Subtitle / second-and-later zones start collapsed so the panel stays tidy.
  const collapsedClass = idx === 0 ? "" : " collapsed";
  return `
    <div class="zone-section${collapsedClass}" data-zone-section="${z}">
      <div class="zone-head" data-zone-toggle="${z}">
        <span>${escapeXML(zone.label || `Text ${idx + 1}`)}</span>
        <span class="caret">▾</span>
      </div>
      <div class="zone-body">
        <label for="ed-${z}-font">Font</label>
        <select id="ed-${z}-font">${fontOpts}</select>
        <div class="row row-name-color">
          <div>
            <label for="ed-${z}-size">Size</label>
            <input id="ed-${z}-size" type="number" min="6" max="600" step="1"/>
          </div>
          <div>
            <label for="ed-${z}-color">Color</label>
            <input id="ed-${z}-color" type="color"/>
          </div>
        </div>
        <div class="row row-3" style="align-items:end">
          <div>
            <label for="ed-${z}-align">Align</label>
            <select id="ed-${z}-align">
              <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
            </select>
          </div>
          <div>
            <label for="ed-${z}-weight">Weight</label>
            <select id="ed-${z}-weight">
              <option value="400">Regular</option><option value="500">Medium</option><option value="600">Semi-bold</option><option value="700">Bold</option>
            </select>
          </div>
          <label style="display:flex;align-items:center;gap:5px;font-size:0.72rem;color:var(--ink-soft);text-transform:none;letter-spacing:0;padding-bottom:8px;font-weight:400">
            <input id="ed-${z}-italic" type="checkbox"/> Italic
          </label>
        </div>
        <details class="advanced">
          <summary>Advanced — spacing, position</summary>
          <div class="row row-2" style="margin-top:6px">
            <div><label for="ed-${z}-ls">Letter spacing</label><input id="ed-${z}-ls" type="number" step="0.5"/></div>
            <div><label for="ed-${z}-lh">Line height</label><input id="ed-${z}-lh" type="number" step="0.05"/></div>
            <div><label for="ed-${z}-x">X</label><input id="ed-${z}-x" type="number" step="1"/></div>
            <div><label for="ed-${z}-y">Y</label><input id="ed-${z}-y" type="number" step="1"/></div>
            <div><label for="ed-${z}-w">Width</label><input id="ed-${z}-w" type="number" step="1"/></div>
            <div><label for="ed-${z}-h">Height</label><input id="ed-${z}-h" type="number" step="1"/></div>
          </div>
          <button type="button" id="ed-${z}-reset" class="btn-link" style="font-size:0.72rem;padding:2px 0;margin-top:2px">reset zone</button>
        </details>
      </div>
    </div>
  `;
}

function editorHTML(cfg, zonesArr) {
  const allowed = cfg.fonts;
  const fontList = allowed ? ALL_FONTS.filter((f) => allowed.includes(f.id)) : ALL_FONTS;
  const fontOpts = fontList.map((f) => `<option value="${f.id}">${f.label}</option>`).join("");
  const zoneControls = zonesArr.map((z, i) => zoneControlsBlock(i, z, fontOpts)).join("");

  let contentBlock;
  if (cfg.batchMode) {
    const sepNote = zonesArr.length > 1
      ? ` Separator <code>${BATCH_SEP}</code> · order: <strong>${zonesArr.map((z) => escapeXML(z.label || z.id)).join(` ${BATCH_SEP} `)}</strong>.`
      : "";
    const importsArr = Array.isArray(cfg.batchImport)
      ? cfg.batchImport
      : (cfg.batchImport ? [cfg.batchImport] : []);
    const importBtn = importsArr.length
      ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px">${importsArr.map((imp, idx) => `
          <button type="button" id="ed-batch-import-${idx}" class="btn btn-ghost" style="font-size:0.72rem;padding:5px 9px">
            <span class="material-symbols-outlined" style="font-size:14px">${escapeXML(imp.icon || "download")}</span>
            ${escapeXML(imp.label)}
          </button>`).join("")}
        </div>`
      : "";
    contentBlock = `
    <div class="field-block">
      <h3>${escapeXML(cfg.batchLabel || "List")}</h3>
      <p class="field-hint">One per line.${sepNote}</p>
      ${importBtn}
      <textarea id="ed-batch" rows="6" placeholder="${escapeXML(cfg.batchPlaceholder || "")}"></textarea>
      <div class="batch-nav">
        <button type="button" id="ed-prev" class="btn btn-ghost">‹</button>
        <span id="ed-counter">— of —</span>
        <button type="button" id="ed-next" class="btn btn-ghost">›</button>
      </div>
    </div>`;
  } else {
    contentBlock = `
    <div class="field-block">
      <h3>Text</h3>
      ${zonesArr.map((z, i) => `
        <label for="ed-single-${i}">${escapeXML(z.label || `Zone ${i + 1}`)}</label>
        <textarea id="ed-single-${i}" rows="2" placeholder="${escapeXML(cfg.singlePlaceholder || "")}"></textarea>
      `).join("")}
    </div>`;
  }

  const batchActions = cfg.batchMode ? `
    <button type="button" id="ed-dl-all" class="btn btn-ghost">
      <span class="material-symbols-outlined">download</span>
      Download all
    </button>
    ${cfg.printLayout ? `
    <button type="button" id="ed-pdf-all" class="btn btn-ghost">
      <span class="material-symbols-outlined">picture_as_pdf</span>
      Download A4 PDF
    </button>` : ""}
    <button type="button" id="ed-up-all" class="btn btn-primary">
      <span class="material-symbols-outlined">cloud_upload</span>
      Upload all to Drive
    </button>` : "";

  return `
    <div class="editor-header">
      <div class="title-block">
        <h1>${escapeXML(cfg.title)}</h1>
        <p>${escapeXML(cfg.subtitle || `${cfg.canvas.w} × ${cfg.canvas.h} px`)}</p>
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
          <h3>Background</h3>
          <p class="field-hint">Canva canvas: <strong>${cfg.canvas.w} × ${cfg.canvas.h} px</strong>. Design everything except the variable text, then upload the PNG.</p>
          <input id="ed-bg" type="file" accept="image/png,image/jpeg,image/webp"/>
          <div id="ed-bg-row" class="bg-thumb-row">
            <img id="ed-bg-thumb" alt="background"/>
            <span class="name">background loaded</span>
            <button type="button" id="ed-bg-clear" class="btn-link" style="font-size:0.72rem;padding:0">remove</button>
          </div>
        </div>
        <div class="field-block">
          <h3>Text zones</h3>
          <p class="field-hint">Drag dashed box on preview to move. Drag corner dot to resize.</p>
          ${zoneControls}
        </div>
        ${contentBlock}
        <div class="field-block actions">
          <label for="ed-quality">Export quality</label>
          <select id="ed-quality">
            <option value="1">1× · ${cfg.canvas.w} × ${cfg.canvas.h}</option>
            <option value="2">2× · ${cfg.canvas.w * 2} × ${cfg.canvas.h * 2}</option>
            <option value="4" selected>4× · ${cfg.canvas.w * 4} × ${cfg.canvas.h * 4}</option>
            <option value="6">6× · ${cfg.canvas.w * 6} × ${cfg.canvas.h * 6}</option>
          </select>
          <p class="field-hint" style="margin:-2px 0 4px">Text scales perfectly. The Canva background upsamples past its native size — for crispest output, design Canva at 2× / 4× too.</p>
          <button type="button" id="ed-dl" class="btn btn-ghost">
            <span class="material-symbols-outlined">download</span>
            Download current
          </button>
          <button type="button" id="ed-up" class="btn btn-primary">
            <span class="material-symbols-outlined">cloud_upload</span>
            Upload current to Drive
          </button>
          ${batchActions}
          <a id="ed-drive-link" href="${COLLATERALS_FOLDER_URL}" target="_blank" rel="noopener" class="btn-link" style="font-size:0.74rem;text-align:center;margin-top:2px">Open Drive folder ↗</a>
        </div>
      </div>
      <div class="preview-pane">
        <div class="preview-toolbar">
          <span class="label" id="ed-preview-label">Preview · ${cfg.canvas.w} × ${cfg.canvas.h}</span>
          <label class="toggle"><input id="ed-show-chrome" type="checkbox" checked/> Edit boxes</label>
          ${cfg.printLayout ? `<label class="toggle"><input id="ed-print-mode" type="checkbox"/> ${escapeXML(cfg.printLayout.label || "Print version")}</label>` : ""}
        </div>
        <div id="ed-stage" class="preview-stage" style="min-height:420px;width:100%"></div>
      </div>
    </div>
  `;
}

// === mount ================================================================

export async function mountEditor(cfg) {
  const root = document.getElementById("editor-root");
  if (!root) throw new Error("template-editor: #editor-root missing in the page");
  const zonesArr = normalizeZones(cfg);
  root.innerHTML = editorHTML(cfg, zonesArr);

  const bgKey = `${cfg.templateId}:bg`;
  const chromeKey = `collaterals:${cfg.templateId}:chrome`;

  const defaultZones = {};
  const defaultValues = {};
  for (const z of zonesArr) {
    defaultZones[z.id] = {
      x: z.x, y: z.y, w: z.w, h: z.h,
      fontFamily: z.fontFamily, fontSize: z.fontSize,
      weight: z.weight || 400, italic: !!z.italic,
      align: z.align || "center", color: z.color || "#000000",
      letterSpacing: z.letterSpacing || 0, lineHeight: z.lineHeight || 1.15,
    };
    defaultValues[z.id] = "";
  }
  const defaults = {
    zones: defaultZones,
    values: defaultValues,
    batch: cfg.batchMode ? "" : undefined,
    previewIdx: 0,
  };
  let state = JSON.parse(JSON.stringify(defaults));
  let bgUrl = null;
  // Edit chrome toggle is purely a viewing preference — kept in localStorage,
  // not Firebase, so each device can preview however it wants.
  let showChrome = (() => {
    try { return localStorage.getItem(chromeKey) !== "0"; } catch { return true; }
  })();
  const printKey = `collaterals:${cfg.templateId}:print-mode`;
  let printMode = !!cfg.printLayout && (() => {
    try { return localStorage.getItem(printKey) === "1"; } catch { return false; }
  })();

  // ---- restore ----
  Object.assign(state, normalizeState(getTemplateData(cfg.templateId), defaults, zonesArr));
  try {
    const remote = await fbGet(cfg.templateId);
    if (remote && typeof remote === "object") {
      Object.assign(state, normalizeState(remote, defaults, zonesArr));
      setTemplateData(cfg.templateId, state);
    }
  } catch (e) { console.warn("fb hydrate failed", e); }
  bgUrl = await getAsset(bgKey);

  // ---- DOM refs ----
  const $ = (id) => document.getElementById(id);
  const statusSel  = $("status-select");
  const bgInput    = $("ed-bg");
  const bgRow      = $("ed-bg-row");
  const bgThumb    = $("ed-bg-thumb");
  const bgClear    = $("ed-bg-clear");
  const stage      = $("ed-stage");
  const chromeCk   = $("ed-show-chrome");
  const printCk    = $("ed-print-mode");
  const previewLbl = $("ed-preview-label");
  const batchTA    = $("ed-batch");
  const prevBtn    = $("ed-prev");
  const nextBtn    = $("ed-next");
  const counter    = $("ed-counter");
  const dlBtn      = $("ed-dl");
  const upBtn      = $("ed-up");
  const dlAllBtn   = $("ed-dl-all");
  const pdfAllBtn  = $("ed-pdf-all");
  const upAllBtn   = $("ed-up-all");
  const qualitySel = $("ed-quality");
  const singleTAs  = zonesArr.map((_, i) => $(`ed-single-${i}`));

  // ---- export quality ----
  const qualityKey = `collaterals:${cfg.templateId}:quality`;
  function loadQuality() {
    try {
      const saved = Number(localStorage.getItem(qualityKey));
      if ([1, 2, 4, 6].includes(saved)) return saved;
    } catch {}
    return Number(cfg.scale) || 4;
  }
  function exportScale() {
    return Number(qualitySel.value) || loadQuality();
  }
  qualitySel.value = String(loadQuality());
  qualitySel.addEventListener("change", () => {
    try { localStorage.setItem(qualityKey, qualitySel.value); } catch {}
  });

  // ---- status ----
  statusSel.value = getAllStatus()[cfg.templateId] || "pending";
  statusSel.addEventListener("change", () => {
    setStatus(cfg.templateId, statusSel.value);
    showToast(`Marked as ${statusSel.options[statusSel.selectedIndex].text}`);
  });

  // ---- background ----
  function paintBgRow() {
    if (bgUrl) { bgRow.classList.add("show"); bgThumb.src = bgUrl; }
    else       { bgRow.classList.remove("show"); bgThumb.removeAttribute("src"); }
  }

  // ---- zone collapse toggle ----
  root.querySelectorAll("[data-zone-toggle]").forEach((head) => {
    head.addEventListener("click", () => {
      const section = head.closest(".zone-section");
      if (section) section.classList.toggle("collapsed");
    });
  });
  paintBgRow();
  bgInput.addEventListener("change", async () => {
    const f = bgInput.files?.[0];
    if (!f) return;
    bgUrl = await saveAsset(bgKey, f);
    paintBgRow();
    render();
    showToast("Background loaded");
  });
  bgClear.addEventListener("click", async () => {
    await clearAsset(bgKey);
    bgUrl = null;
    bgInput.value = "";
    paintBgRow();
    render();
  });

  // ---- preview chrome toggle ----
  chromeCk.checked = showChrome;
  chromeCk.addEventListener("change", () => {
    showChrome = chromeCk.checked;
    try { localStorage.setItem(chromeKey, showChrome ? "1" : "0"); } catch {}
    render();
  });

  // ---- print-version toggle (tent-fold) ----
  if (printCk) {
    printCk.checked = printMode;
    chromeCk.disabled = printMode;
    syncPreviewLabel();
    printCk.addEventListener("change", () => {
      printMode = printCk.checked;
      try { localStorage.setItem(printKey, printMode ? "1" : "0"); } catch {}
      chromeCk.disabled = printMode;
      syncPreviewLabel();
      render();
      updateCounter();
    });
  }
  function syncPreviewLabel() {
    if (!previewLbl) return;
    const ec = effectiveCanvas();
    previewLbl.textContent = `Preview · ${ec.w} × ${ec.h}`;
  }
  function activePrintLayout() {
    return printMode ? cfg.printLayout : null;
  }
  function placementsForActive() {
    return computePlacements({
      designCanvas: cfg.canvas,
      printLayout: activePrintLayout(),
    });
  }
  function effectiveCanvas() {
    return placementsForActive().sheet;
  }
  function tilesPerSheet() {
    return placementsForActive().tiles.length;
  }
  function bgRectsForSheet(sheetIdx) {
    if (!printMode) return null;
    const placements = placementsForActive();
    const tilesTexts = tilesTextsForSheet(sheetIdx);
    const rects = [];
    placements.tiles.forEach((t, ti) => {
      const has = (tilesTexts[ti] || []).some((s) => s && String(s).trim().length > 0);
      if (has) rects.push({ x: t.x, y: t.y, w: cfg.canvas.w, h: cfg.canvas.h });
    });
    return rects.length ? rects : null;
  }

  // ---- per-zone style controls ----
  const refreshFns = {};
  zonesArr.forEach((zoneDef, i) => {
    const z = i;
    const fontSel   = $(`ed-${z}-font`);
    const sizeIn    = $(`ed-${z}-size`);
    const colorIn   = $(`ed-${z}-color`);
    const alignSel  = $(`ed-${z}-align`);
    const weightSel = $(`ed-${z}-weight`);
    const italicCk  = $(`ed-${z}-italic`);
    const lsIn      = $(`ed-${z}-ls`);
    const lhIn      = $(`ed-${z}-lh`);
    const xIn       = $(`ed-${z}-x`);
    const yIn       = $(`ed-${z}-y`);
    const wIn       = $(`ed-${z}-w`);
    const hIn       = $(`ed-${z}-h`);
    const resetBtn  = $(`ed-${z}-reset`);

    function refresh() {
      const s = state.zones[zoneDef.id];
      if (cfg.fonts && !cfg.fonts.includes(s.fontFamily)) s.fontFamily = cfg.fonts[0];
      fontSel.value    = s.fontFamily;
      sizeIn.value     = s.fontSize;
      colorIn.value    = s.color;
      alignSel.value   = s.align;
      weightSel.value  = String(s.weight || 400);
      italicCk.checked = !!s.italic;
      lsIn.value       = s.letterSpacing || 0;
      lhIn.value       = s.lineHeight || 1.15;
      xIn.value        = Math.round(s.x);
      yIn.value        = Math.round(s.y);
      wIn.value        = Math.round(s.w);
      hIn.value        = Math.round(s.h);
    }
    refresh();
    refreshFns[zoneDef.id] = refresh;

    const wire = (el, key, parse = (v) => v) => {
      el.addEventListener("input", () => {
        state.zones[zoneDef.id][key] = parse(el.value);
        persist(); render();
      });
    };
    wire(fontSel,   "fontFamily");
    wire(sizeIn,    "fontSize", (v) => Number(v) || 12);
    wire(colorIn,   "color");
    wire(alignSel,  "align");
    wire(weightSel, "weight", (v) => Number(v));
    italicCk.addEventListener("change", () => {
      state.zones[zoneDef.id].italic = italicCk.checked;
      persist(); render();
    });
    wire(lsIn, "letterSpacing", (v) => Number(v) || 0);
    wire(lhIn, "lineHeight",    (v) => Number(v) || 1.15);
    wire(xIn,  "x", (v) => Number(v) || 0);
    wire(yIn,  "y", (v) => Number(v) || 0);
    wire(wIn,  "w", (v) => Math.max(10, Number(v) || 10));
    wire(hIn,  "h", (v) => Math.max(10, Number(v) || 10));

    resetBtn.addEventListener("click", () => {
      state.zones[zoneDef.id] = { ...defaultZones[zoneDef.id] };
      refresh();
      persist(); render();
      showToast(`Reset ${zoneDef.label || zoneDef.id}`);
    });
  });

  // ---- content (batch or per-zone single) ----
  function currentBatch() {
    return (state.batch || "").split(/\n/).map((s) => s).filter((s) => s.trim().length > 0);
  }
  // Texts for a single guest index (or single-zone defaults when not batch).
  function textsForGuest(idx) {
    if (cfg.batchMode) {
      const lines = currentBatch();
      if (!lines.length || idx == null || idx < 0 || idx >= lines.length) {
        return zonesArr.map(() => "");
      }
      const segs = lines[idx].split(BATCH_SEP).map((s) => s.trim());
      return zonesArr.map((_, k) => segs[k] || "");
    }
    return zonesArr.map((z) => state.values[z.id] || "");
  }
  // Texts per tile for a given sheet. In design view, one tile = current guest.
  // In print mode, N tiles = N consecutive guests starting at sheetIdx * N.
  function tilesTextsForSheet(sheetIdx) {
    const n = tilesPerSheet();
    if (n <= 1) return [textsForGuest(sheetIdx ?? state.previewIdx)];
    const sIdx = sheetIdx ?? currentSheetIndex();
    return Array.from({ length: n }, (_, t) => textsForGuest(sIdx * n + t));
  }
  function sheetCount() {
    if (!cfg.batchMode) return 1;
    const total = currentBatch().length;
    if (!total) return 0;
    return Math.ceil(total / tilesPerSheet());
  }
  function currentSheetIndex() {
    return Math.floor(state.previewIdx / tilesPerSheet());
  }
  function updateCounter() {
    if (!counter) return;
    const lines = currentBatch();
    if (!lines.length) { counter.textContent = "— of —"; return; }
    if (printMode && tilesPerSheet() > 1) {
      const total = sheetCount();
      const s = Math.min(currentSheetIndex(), Math.max(0, total - 1));
      const first = s * tilesPerSheet() + 1;
      const last = Math.min(first + tilesPerSheet() - 1, lines.length);
      counter.textContent = `Sheet ${s + 1} of ${total} · ${first}–${last}`;
    } else {
      const idx = Math.min(state.previewIdx, Math.max(0, lines.length - 1));
      counter.textContent = `${idx + 1} of ${lines.length}`;
    }
  }

  if (cfg.batchMode) {
    batchTA.value = state.batch || "";
    batchTA.addEventListener("input", () => {
      state.batch = batchTA.value;
      state.previewIdx = 0;
      persist(); render(); updateCounter();
    });
    if (cfg.batchImport) {
      const importsArr = Array.isArray(cfg.batchImport) ? cfg.batchImport : [cfg.batchImport];
      importsArr.forEach((imp, idx) => {
        const importBtnEl = $(`ed-batch-import-${idx}`);
        importBtnEl?.addEventListener("click", async () => {
          importBtnEl.disabled = true;
          const prevHtml = importBtnEl.innerHTML;
          importBtnEl.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px">hourglass_top</span> Loading…`;
          try {
            const result = await imp.handler(state.batch || "");
            const text = typeof result === "string" ? result : result?.text;
            const message = (result && typeof result === "object") ? result.message : null;
            if (message && text == null) {
              showToast(message);
            } else if (text != null) {
              state.batch = text;
              batchTA.value = text;
              state.previewIdx = 0;
              persist(); render(); updateCounter();
              const count = text.split(/\n/).filter((l) => l.trim()).length;
              showToast(message || `Imported ${count} guests`);
            }
          } catch (e) {
            console.error(e);
            showToast(e?.message || "Import failed", "err", 4000);
          } finally {
            importBtnEl.disabled = false;
            importBtnEl.innerHTML = prevHtml;
          }
        });
      });
    }
    prevBtn.addEventListener("click", () => {
      const total = currentBatch().length;
      if (!total) return;
      if (printMode && tilesPerSheet() > 1) {
        const sCount = sheetCount();
        const s = (currentSheetIndex() - 1 + sCount) % sCount;
        state.previewIdx = s * tilesPerSheet();
      } else {
        state.previewIdx = (state.previewIdx - 1 + total) % total;
      }
      persist(); render(); updateCounter();
    });
    nextBtn.addEventListener("click", () => {
      const total = currentBatch().length;
      if (!total) return;
      if (printMode && tilesPerSheet() > 1) {
        const sCount = sheetCount();
        const s = (currentSheetIndex() + 1) % sCount;
        state.previewIdx = s * tilesPerSheet();
      } else {
        state.previewIdx = (state.previewIdx + 1) % total;
      }
      persist(); render(); updateCounter();
    });
    updateCounter();
  } else {
    zonesArr.forEach((zoneDef, i) => {
      const ta = singleTAs[i];
      if (!ta) return;
      ta.value = state.values[zoneDef.id] || "";
      ta.addEventListener("input", () => {
        state.values[zoneDef.id] = ta.value;
        persist(); render();
      });
    });
  }

  // ---- export ----
  // Text-only SVG (transparent background) — the bg PNG is composed directly
  // onto the canvas in export.js, avoiding the double-resampling that
  // happened when the bg was embedded inside the SVG.
  function textOnlySvgForSheet(sheetIdx) {
    const wrap = document.createElement("div");
    wrap.innerHTML = buildSVG({
      bgUrl: null,
      designCanvas: cfg.canvas,
      zones: zonesFromState(),
      tilesTexts: tilesTextsForSheet(sheetIdx),
      editing: false,
      noBg: true,
      placements: placementsForActive(),
    });
    return wrap.querySelector("svg");
  }
  function fnamePrefix() {
    return sanitizeFilename(cfg.exportPrefix || cfg.title || "Collateral");
  }
  function fnameForGuestLine(line) {
    const parts = String(line || "")
      .split(BATCH_SEP)
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length
      ? parts.map((p) => sanitizeFilename(p.slice(0, 60))).join(" — ")
      : "blank";
  }
  function fnameForSheet(sheetIdx) {
    const suffix = printMode ? " (print)" : "";
    const n = tilesPerSheet();
    if (!cfg.batchMode || n <= 1) {
      const line = cfg.batchMode ? (currentBatch()[sheetIdx] || "") : "";
      return `${fnamePrefix()} — ${fnameForGuestLine(line)}${suffix}.png`;
    }
    const lines = currentBatch();
    const baseIdx = sheetIdx * n;
    const names = [];
    for (let t = 0; t < n; t++) {
      const idx = baseIdx + t;
      if (idx < lines.length) {
        const first = (lines[idx].split(BATCH_SEP)[0] || "").trim();
        names.push(sanitizeFilename(first.slice(0, 50)) || `tile${t + 1}`);
      }
    }
    const tag = names.length ? names.join(" + ") : "blank";
    return `${fnamePrefix()} — ${tag}${suffix}.png`;
  }
  function zonesFromState() {
    return zonesArr.map((z) => ({ ...z, ...state.zones[z.id] }));
  }

  dlBtn.addEventListener("click", async () => {
    try {
      const s = currentSheetIndex();
      await composeToDownload({
        bgDataUrl: bgUrl,
        textSvgEl: textOnlySvgForSheet(s),
        canvas: effectiveCanvas(),
        scale: exportScale(),
        filename: fnameForSheet(s),
        bgRects: bgRectsForSheet(s),
      });
      showToast("Downloaded");
    } catch (e) { console.error(e); showToast("Download failed", "err"); }
  });
  upBtn.addEventListener("click", async () => {
    try {
      showToast("Uploading…");
      const s = currentSheetIndex();
      const blob = await composeToPngBlob({
        bgDataUrl: bgUrl,
        textSvgEl: textOnlySvgForSheet(s),
        canvas: effectiveCanvas(),
        scale: exportScale(),
        bgRects: bgRectsForSheet(s),
      });
      const j = await uploadPngBlob(blob, fnameForSheet(s));
      try { await navigator.clipboard.writeText(j.link); } catch {}
      showToast("Uploaded · link copied");
      window.open(j.link, "_blank", "noopener");
    } catch (e) { console.error(e); showToast(e.message || "Upload failed", "err", 4000); }
  });
  if (dlAllBtn) {
    dlAllBtn.addEventListener("click", async () => {
      const total = sheetCount();
      if (!total) { showToast("List is empty", "err"); return; }
      try {
        for (let s = 0; s < total; s++) {
          showToast(`Downloading ${s + 1}/${total}…`);
          await composeToDownload({
            bgDataUrl: bgUrl,
            textSvgEl: textOnlySvgForSheet(s),
            canvas: effectiveCanvas(),
            scale: exportScale(),
            filename: fnameForSheet(s),
            bgRects: bgRectsForSheet(s),
          });
          await new Promise((r) => setTimeout(r, 120));
        }
        showToast(`Downloaded ${total} ${total === 1 ? "PNG" : "PNGs"}`);
      } catch (e) { console.error(e); showToast("Batch download failed", "err"); }
    });
  }
  if (pdfAllBtn) {
    pdfAllBtn.addEventListener("click", async () => {
      // PDF only makes sense in print-layout mode (one A4 sheet per page).
      // Force it on temporarily so sheetCount + sheet helpers all use the 4-up layout.
      const wasPrintMode = printMode;
      printMode = true;
      const total = sheetCount();
      if (!total) {
        printMode = wasPrintMode;
        showToast("List is empty", "err");
        return;
      }
      try {
        showToast("Loading PDF library…");
        const { jsPDF } = await import("https://esm.sh/jspdf@2.5.2");
        const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
        for (let s = 0; s < total; s++) {
          showToast(`Rendering ${s + 1}/${total}…`);
          const blob = await composeToPngBlob({
            bgDataUrl: bgUrl,
            textSvgEl: textOnlySvgForSheet(s),
            canvas: effectiveCanvas(),
            scale: 1, // 1× of 2480×3508 ≈ 300 DPI A4
            bgRects: bgRectsForSheet(s),
          });
          const dataUrl = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(String(r.result));
            r.onerror = rej;
            r.readAsDataURL(blob);
          });
          if (s > 0) pdf.addPage();
          pdf.addImage(dataUrl, "PNG", 0, 0, 210, 297, undefined, "FAST");
        }
        pdf.save(`${fnamePrefix()} — A4 print sheets.pdf`);
        showToast(`PDF saved · ${total} ${total === 1 ? "page" : "pages"}`);
      } catch (e) {
        console.error(e);
        showToast(e.message || "PDF generation failed", "err", 4000);
      } finally {
        printMode = wasPrintMode;
      }
    });
  }
  if (upAllBtn) {
    upAllBtn.addEventListener("click", async () => {
      const total = sheetCount();
      if (!total) { showToast("List is empty", "err"); return; }
      try {
        for (let s = 0; s < total; s++) {
          showToast(`Uploading ${s + 1}/${total}…`);
          const blob = await composeToPngBlob({
            bgDataUrl: bgUrl,
            textSvgEl: textOnlySvgForSheet(s),
            canvas: effectiveCanvas(),
            scale: exportScale(),
            bgRects: bgRectsForSheet(s),
          });
          await uploadPngBlob(blob, fnameForSheet(s));
        }
        showToast(`Uploaded ${total} to Drive`, "ok", 4000);
        window.open(COLLATERALS_FOLDER_URL, "_blank", "noopener");
      } catch (e) { console.error(e); showToast(e.message || "Batch upload failed", "err", 4000); }
    });
  }

  // ---- render + drag ----
  function render() {
    const zonesLive = zonesFromState();
    const placements = placementsForActive();
    const tilesTexts = tilesTextsForSheet();
    stage.innerHTML = buildSVG({
      bgUrl,
      designCanvas: cfg.canvas,
      zones: zonesLive,
      tilesTexts,
      editing: showChrome && !printMode,
      placements,
    });
    // Drag handles only exist in the design view (single tile at origin).
    if (!showChrome || printMode) return;
    const svgEl = stage.querySelector("svg");
    if (!svgEl) return;
    attachZonesDrag({
      svgEl, canvas: cfg.canvas, zones: zonesLive, texts: tilesTexts[0] || [],
      onCommit: (idx, z) => {
        const zoneId = zonesArr[idx].id;
        state.zones[zoneId] = { ...state.zones[zoneId], ...z };
        refreshFns[zoneId]?.();
        persist();
        render();
      },
    });
  }
  render();

  // Auto-fit uses canvas measureText, which falls back to a generic font until
  // the script faces (Sacramento, Great Vibes…) finish loading. Re-render once
  // they're ready so the first preview reflects the real metrics.
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => render()).catch(() => {});
  }

  function persist() {
    const snapshot = JSON.parse(JSON.stringify(state));
    setTemplateData(cfg.templateId, snapshot);
    fbSet(cfg.templateId, snapshot);
  }

  // Live sync — apply remote changes from other tabs/devices.
  fbSubscribe(cfg.templateId, (remote) => {
    if (!remote || typeof remote !== "object") return;
    const next = normalizeState(remote, defaults, zonesArr);
    if (JSON.stringify(next) === JSON.stringify(state)) return;
    Object.assign(state, next);
    zonesArr.forEach((z) => refreshFns[z.id]?.());
    if (cfg.batchMode && batchTA && state.batch !== batchTA.value) batchTA.value = state.batch || "";
    if (!cfg.batchMode) {
      zonesArr.forEach((z, i) => {
        const ta = singleTAs[i];
        if (ta && (state.values[z.id] || "") !== ta.value) ta.value = state.values[z.id] || "";
      });
    }
    render();
    updateCounter();
  });
}

// Pull only the keys we expect, with backward-compat for the old single-zone
// shape (`zone`, `single`) the editor used before the N-zone refactor.
function normalizeState(src, defaults, zonesArr) {
  const out = JSON.parse(JSON.stringify(defaults));
  if (!src || typeof src !== "object") return out;
  // Legacy: { zone, single }
  if (src.zone && !src.zones && zonesArr.length === 1) {
    Object.assign(out.zones[zonesArr[0].id], src.zone);
  }
  if (typeof src.single === "string" && (!src.values) && zonesArr.length === 1) {
    out.values[zonesArr[0].id] = src.single;
  }
  if (src.zones && typeof src.zones === "object") {
    for (const id of Object.keys(out.zones)) {
      if (src.zones[id] && typeof src.zones[id] === "object") {
        Object.assign(out.zones[id], src.zones[id]);
      }
    }
  }
  if (src.values && typeof src.values === "object") {
    for (const id of Object.keys(out.values)) {
      if (typeof src.values[id] === "string") out.values[id] = src.values[id];
    }
  }
  if (typeof src.batch === "string") out.batch = src.batch;
  if (Number.isFinite(src.previewIdx)) out.previewIdx = src.previewIdx;
  return out;
}
