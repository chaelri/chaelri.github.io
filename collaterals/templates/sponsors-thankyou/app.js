// Sponsors Thank-You — print-ready A4 sheets from Charlie's pre-edited Canva
// cards. The 11 PNGs in `cards/1.png … cards/11.png` ARE the final art (one
// per principal-sponsor couple, fully designed in Canva). This module skips
// the SVG-rendering pipeline entirely — it just lays the raster cards out
// 2 cols × 3 rows per A4 portrait sheet for the printer.

import { uploadPngBlob, sanitizeFilename, COLLATERALS_FOLDER_URL } from "../../shared/drive.js";
import { setStatus, getAllStatus } from "../../shared/state.js";
import { blobToBase64 } from "../../shared/export.js";

const TEMPLATE_ID = "sponsors-thankyou";

// Each Canva card = 900 × 1050 px (3″ × 3.5″ @ 300 DPI). A4 portrait @ 300 DPI
// = 2480 × 3508 px. 2×3 grid fits with comfortable margins.
const CARD = { w: 900, h: 1050 };
const A4 = { w: 2480, h: 3508 };
const GRID = { cols: 2, rows: 3, gap: 60 };
const PER_SHEET = GRID.cols * GRID.rows;

const SPONSOR_COUNT = 11;
const CARD_FILES = Array.from({ length: SPONSOR_COUNT }, (_, i) => `${i + 1}.png`);

// === Asset loader =========================================================

const _imgCache = new Map();
async function loadCard(filename) {
  if (_imgCache.has(filename)) return _imgCache.get(filename);
  const p = (async () => {
    const resp = await fetch(`cards/${filename}`);
    if (!resp.ok) throw new Error(`fetch ${filename} ${resp.status}`);
    const blob = await resp.blob();
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = dataUrl;
    });
    return { blob, dataUrl, img };
  })();
  _imgCache.set(filename, p);
  return p;
}

// === Rendering ============================================================

function blobToObjectUrl(blob) {
  return URL.createObjectURL(blob);
}

async function renderSheetCanvas(startIdx, { scale = 1 } = {}) {
  const W = Math.round(A4.w * scale);
  const H = Math.round(A4.h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const { cols, rows, gap } = GRID;
  const gridW = cols * CARD.w + (cols - 1) * gap;
  const gridH = rows * CARD.h + (rows - 1) * gap;
  const mx = (A4.w - gridW) / 2;
  const my = (A4.h - gridH) / 2;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const slotIdx = startIdx + r * cols + c;
      if (slotIdx >= SPONSOR_COUNT) continue;
      const { img } = await loadCard(CARD_FILES[slotIdx]);
      const tx = (mx + c * (CARD.w + gap)) * scale;
      const ty = (my + r * (CARD.h + gap)) * scale;
      const tw = CARD.w * scale;
      const th = CARD.h * scale;
      ctx.drawImage(img, tx, ty, tw, th);
      // Dashed cut indicator so the printer can trim accurately.
      ctx.save();
      ctx.strokeStyle = "#8c8c8c";
      ctx.lineWidth = Math.max(1, 2 * scale);
      ctx.setLineDash([22 * scale, 12 * scale]);
      ctx.globalAlpha = 0.55;
      ctx.strokeRect(tx, ty, tw, th);
      ctx.restore();
    }
  }
  return canvas;
}

async function renderSheetBlob(startIdx, { scale = 1 } = {}) {
  const canvas = await renderSheetCanvas(startIdx, { scale });
  return await new Promise((res) => canvas.toBlob(res, "image/png", 1));
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
  if (!root) throw new Error("sponsors-thankyou: #editor-root missing");

  const totalSheets = Math.ceil(SPONSOR_COUNT / PER_SHEET);
  let cardIdx = 0;
  let sheetIdx = 0;
  let printMode = true; // default to A4 view — that's what the user came here for

  root.innerHTML = `
    <div class="editor-header">
      <div class="title-block">
        <h1>Sponsors Thank-You</h1>
        <p>11 pre-edited Canva cards · 900 × 1050 px each · laid out 2 × 3 per A4 portrait sheet · ${totalSheets} sheets total</p>
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
          <h3>Source cards</h3>
          <p class="field-hint">The artwork is already finalized in Canva — these 11 PNGs are the source of truth. Edits should happen in Canva and the files re-dropped into <code>cards/</code>.</p>
          <div class="batch-nav">
            <button type="button" id="ed-prev" class="btn btn-ghost">‹</button>
            <span id="ed-counter">— of —</span>
            <button type="button" id="ed-next" class="btn btn-ghost">›</button>
          </div>
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
          <button type="button" id="ed-dl-cards" class="btn btn-ghost">
            <span class="material-symbols-outlined">download</span>
            Download all 11 cards
          </button>
          <button type="button" id="ed-pdf" class="btn btn-ghost">
            <span class="material-symbols-outlined">picture_as_pdf</span>
            Download A4 PDF (6-up, ${totalSheets} pages)
          </button>
          <button type="button" id="ed-up-cards" class="btn btn-primary">
            <span class="material-symbols-outlined">cloud_upload</span>
            Upload all 11 cards to Drive
          </button>
          <a href="${COLLATERALS_FOLDER_URL}" target="_blank" rel="noopener" class="btn-link" style="font-size:0.74rem;text-align:center;margin-top:2px">Open Drive folder ↗</a>
        </div>
      </div>
      <div class="preview-pane">
        <div class="preview-toolbar">
          <span class="label" id="ed-preview-label">Preview</span>
          <label class="toggle"><input id="ed-print-mode" type="checkbox" checked/> A4 6-up</label>
        </div>
        <div id="ed-stage" class="preview-stage" style="min-height:480px;width:100%;display:flex;justify-content:center;align-items:flex-start"></div>
      </div>
    </div>
  `;

  const $ = (id) => document.getElementById(id);
  const statusSel = $("status-select");
  const prevBtn   = $("ed-prev");
  const nextBtn   = $("ed-next");
  const counter   = $("ed-counter");
  const dlBtn     = $("ed-dl");
  const upBtn     = $("ed-up");
  const dlCardsBtn= $("ed-dl-cards");
  const pdfBtn    = $("ed-pdf");
  const upCardsBtn= $("ed-up-cards");
  const printCk   = $("ed-print-mode");
  const previewLbl= $("ed-preview-label");
  const stage     = $("ed-stage");

  statusSel.value = getAllStatus()[TEMPLATE_ID] || "pending";
  statusSel.addEventListener("change", () => {
    setStatus(TEMPLATE_ID, statusSel.value);
    showToast(`Marked as ${statusSel.options[statusSel.selectedIndex].text}`);
  });

  function updateCounter() {
    if (printMode) counter.textContent = `Sheet ${sheetIdx + 1} of ${totalSheets}`;
    else counter.textContent = `Card ${cardIdx + 1} of ${SPONSOR_COUNT}`;
  }
  function syncLabel() {
    previewLbl.textContent = printMode
      ? `Preview · A4 sheet ${A4.w} × ${A4.h}`
      : `Preview · card ${CARD.w} × ${CARD.h}`;
  }

  let _previewUrl = null;
  let _renderToken = 0;
  async function render() {
    const myToken = ++_renderToken;
    stage.innerHTML = `<div style="color:var(--ink-faint);padding:24px;font-size:0.85rem">Rendering…</div>`;
    let blob;
    try {
      if (printMode) {
        // Half-scale preview is plenty on-screen (1240 × 1754) — full scale is
        // reserved for the actual download / PDF.
        blob = await renderSheetBlob(sheetIdx * PER_SHEET, { scale: 0.5 });
      } else {
        const card = await loadCard(CARD_FILES[cardIdx]);
        blob = card.blob;
      }
    } catch (e) {
      if (myToken !== _renderToken) return;
      console.error(e);
      stage.innerHTML = `<div style="color:#c0392b;padding:24px;font-size:0.85rem">Preview failed: ${e.message}</div>`;
      return;
    }
    if (myToken !== _renderToken) return;
    if (_previewUrl) URL.revokeObjectURL(_previewUrl);
    _previewUrl = blobToObjectUrl(blob);
    stage.innerHTML = `<img src="${_previewUrl}" alt="preview" style="max-width:100%;height:auto;display:block;box-shadow:0 2px 12px rgba(0,0,0,0.08)"/>`;
    updateCounter();
    syncLabel();
  }

  prevBtn.addEventListener("click", () => {
    if (printMode) sheetIdx = (sheetIdx - 1 + totalSheets) % totalSheets;
    else cardIdx = (cardIdx - 1 + SPONSOR_COUNT) % SPONSOR_COUNT;
    render();
  });
  nextBtn.addEventListener("click", () => {
    if (printMode) sheetIdx = (sheetIdx + 1) % totalSheets;
    else cardIdx = (cardIdx + 1) % SPONSOR_COUNT;
    render();
  });
  printCk.addEventListener("change", () => { printMode = printCk.checked; render(); });

  const cardSlug = (idx) => sanitizeFilename(`Sponsor ${String(idx + 1).padStart(2, "0")}`);
  const sheetSlug = (idx) => sanitizeFilename(`Sponsors A4 sheet ${idx + 1}`);

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".png") || filename.endsWith(".pdf") ? filename : filename + ".png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  dlBtn.addEventListener("click", async () => {
    try {
      if (printMode) {
        showToast("Rendering sheet…");
        const blob = await renderSheetBlob(sheetIdx * PER_SHEET, { scale: 1 });
        downloadBlob(blob, sheetSlug(sheetIdx) + ".png");
      } else {
        const { blob } = await loadCard(CARD_FILES[cardIdx]);
        downloadBlob(blob, cardSlug(cardIdx) + ".png");
      }
      showToast("Downloaded");
    } catch (e) { console.error(e); showToast("Download failed", "err"); }
  });

  upBtn.addEventListener("click", async () => {
    try {
      showToast("Uploading…");
      let blob, filename;
      if (printMode) {
        blob = await renderSheetBlob(sheetIdx * PER_SHEET, { scale: 1 });
        filename = sheetSlug(sheetIdx) + ".png";
      } else {
        ({ blob } = await loadCard(CARD_FILES[cardIdx]));
        filename = cardSlug(cardIdx) + ".png";
      }
      const j = await uploadPngBlob(blob, filename);
      try { await navigator.clipboard.writeText(j.link); } catch {}
      showToast("Uploaded · link copied");
      window.open(j.link, "_blank", "noopener");
    } catch (e) { console.error(e); showToast(e.message || "Upload failed", "err", 4000); }
  });

  dlCardsBtn.addEventListener("click", async () => {
    try {
      for (let i = 0; i < SPONSOR_COUNT; i++) {
        showToast(`Downloading ${i + 1}/${SPONSOR_COUNT}…`);
        const { blob } = await loadCard(CARD_FILES[i]);
        downloadBlob(blob, cardSlug(i) + ".png");
        await new Promise((r) => setTimeout(r, 120));
      }
      showToast(`Downloaded ${SPONSOR_COUNT} cards`);
    } catch (e) { console.error(e); showToast("Batch download failed", "err"); }
  });

  pdfBtn.addEventListener("click", async () => {
    try {
      showToast("Loading PDF library…");
      const { jsPDF } = await import("https://esm.sh/jspdf@2.5.2");
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
      for (let i = 0; i < totalSheets; i++) {
        showToast(`Rendering sheet ${i + 1}/${totalSheets}…`);
        const blob = await renderSheetBlob(i * PER_SHEET, { scale: 1 });
        const dataUrl = "data:image/png;base64," + (await blobToBase64(blob));
        if (i > 0) pdf.addPage();
        pdf.addImage(dataUrl, "PNG", 0, 0, 210, 297, undefined, "FAST");
      }
      pdf.save("Sponsors Thank-You — A4 print sheets.pdf");
      showToast(`PDF saved · ${totalSheets} ${totalSheets === 1 ? "page" : "pages"}`);
    } catch (e) { console.error(e); showToast(e.message || "PDF generation failed", "err", 4000); }
  });

  upCardsBtn.addEventListener("click", async () => {
    try {
      for (let i = 0; i < SPONSOR_COUNT; i++) {
        showToast(`Uploading ${i + 1}/${SPONSOR_COUNT}…`);
        const { blob } = await loadCard(CARD_FILES[i]);
        await uploadPngBlob(blob, cardSlug(i) + ".png");
      }
      showToast(`Uploaded ${SPONSOR_COUNT} cards to Drive`, "ok", 4000);
      window.open(COLLATERALS_FOLDER_URL, "_blank", "noopener");
    } catch (e) { console.error(e); showToast(e.message || "Batch upload failed", "err", 4000); }
  });

  render();
}

mount();
