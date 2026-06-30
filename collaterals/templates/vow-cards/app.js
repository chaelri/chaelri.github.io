// Vow Cards — pre-baked Canva artwork (vow-cards.png) at its native size,
// centered on an A4 portrait sheet with dashed cut indicators so the printer
// can trim each of the four quadrants cleanly. Same skeleton as mirror-chart:
// CARD = source's natural pixel dimensions (true to source), A4 sheet wraps
// around it. No upscaling — re-export from Canva at higher res when you want
// crisper print quality.

import { uploadPngBlob, sanitizeFilename, COLLATERALS_FOLDER_URL } from "../../shared/drive.js";
import { setStatus, getAllStatus } from "../../shared/state.js";
import { blobToBase64 } from "../../shared/export.js";

const TEMPLATE_ID = "vow-cards";

// Native source dimensions — vow-cards.png as exported from Canva. The
// design prints at this exact pixel size; A4 is just the carrier sheet.
const CARD = { w: 1414, h: 2000 };
// A4 portrait at 300 DPI.
const A4 = { w: 2480, h: 3508 };

const SOURCE_FILE = "vow-cards.png";

// === Asset loader =========================================================

let _sourcePromise = null;
function loadSource() {
  if (_sourcePromise) return _sourcePromise;
  _sourcePromise = (async () => {
    const resp = await fetch(SOURCE_FILE);
    if (!resp.ok) throw new Error(`fetch ${SOURCE_FILE} ${resp.status}`);
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
  return _sourcePromise;
}

// === Rendering ============================================================

function blobToObjectUrl(blob) { return URL.createObjectURL(blob); }

// Draw the dashed cut indicators (per-quadrant trim borders + center cross)
// onto the given context at (ox, oy) with the supplied scale.
function drawCutMarks(ctx, ox, oy, scale) {
  const W = CARD.w * scale;
  const H = CARD.h * scale;
  const midX = ox + W / 2;
  const midY = oy + H / 2;
  ctx.save();
  ctx.strokeStyle = "#8c8c8c";
  ctx.lineWidth = Math.max(1, 2 * scale);
  ctx.setLineDash([22 * scale, 12 * scale]);
  ctx.globalAlpha = 0.6;
  // Outer trim — full card boundary.
  ctx.strokeRect(ox, oy, W, H);
  // Center cross — splits into 2 × 2 quadrants.
  ctx.beginPath();
  ctx.moveTo(ox, midY); ctx.lineTo(ox + W, midY);
  ctx.moveTo(midX, oy); ctx.lineTo(midX, oy + H);
  ctx.stroke();
  ctx.restore();
}

async function renderCardCanvas({ scale = 1, withCuts = true } = {}) {
  const W = Math.round(CARD.w * scale);
  const H = Math.round(CARD.h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  const { img } = await loadSource();
  ctx.drawImage(img, 0, 0, W, H);
  if (withCuts) drawCutMarks(ctx, 0, 0, scale);
  return canvas;
}

async function renderSheetCanvas({ scale = 1, withCuts = true } = {}) {
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

  const { img } = await loadSource();
  // Center the card on the A4 sheet at its native size.
  const mx = Math.round((A4.w - CARD.w) / 2) * scale;
  const my = Math.round((A4.h - CARD.h) / 2) * scale;
  const cw = CARD.w * scale;
  const ch = CARD.h * scale;
  ctx.drawImage(img, mx, my, cw, ch);
  if (withCuts) drawCutMarks(ctx, mx, my, scale);
  return canvas;
}

async function renderBlob(mode, { scale = 1, withCuts = true } = {}) {
  const canvas = mode === "sheet"
    ? await renderSheetCanvas({ scale, withCuts })
    : await renderCardCanvas({ scale, withCuts });
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
  if (!root) throw new Error("vow-cards: #editor-root missing");

  let printMode = true;
  let showCuts = true;

  root.innerHTML = `
    <div class="editor-header">
      <div class="title-block">
        <h1>Vow Cards</h1>
        <p>Pre-edited Canva vow cards · ${CARD.w} × ${CARD.h} px (true to source) · centered on A4 portrait (${A4.w} × ${A4.h} px @ 300 DPI) · 2 × 2 cards per sheet</p>
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
          <h3>Source artwork</h3>
          <p class="field-hint">The vow cards are finalized in Canva — <code>vow-cards.png</code> is the source of truth. Edits should happen in Canva and the file re-dropped into <code>templates/vow-cards/</code>.</p>
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
          <button type="button" id="ed-pdf" class="btn btn-ghost">
            <span class="material-symbols-outlined">picture_as_pdf</span>
            Download A4 PDF (1 page)
          </button>
          <a href="${COLLATERALS_FOLDER_URL}" target="_blank" rel="noopener" class="btn-link" style="font-size:0.74rem;text-align:center;margin-top:2px">Open Drive folder ↗</a>
        </div>
      </div>
      <div class="preview-pane">
        <div class="preview-toolbar">
          <span class="label" id="ed-preview-label">Preview · A4 ${A4.w} × ${A4.h}</span>
          <label class="toggle"><input id="ed-show-cuts" type="checkbox" checked/> Cut marks</label>
          <label class="toggle"><input id="ed-print-mode" type="checkbox" checked/> A4 sheet</label>
        </div>
        <div id="ed-stage" class="preview-stage" style="min-height:480px;width:100%;display:flex;justify-content:center;align-items:flex-start"></div>
      </div>
    </div>
  `;

  const $ = (id) => document.getElementById(id);
  const statusSel = $("status-select");
  const dlBtn     = $("ed-dl");
  const upBtn     = $("ed-up");
  const pdfBtn    = $("ed-pdf");
  const cutsCk    = $("ed-show-cuts");
  const printCk   = $("ed-print-mode");
  const previewLbl= $("ed-preview-label");
  const stage     = $("ed-stage");

  statusSel.value = getAllStatus()[TEMPLATE_ID] || "pending";
  statusSel.addEventListener("change", () => {
    setStatus(TEMPLATE_ID, statusSel.value);
    showToast(`Marked as ${statusSel.options[statusSel.selectedIndex].text}`);
  });

  function syncLabel() {
    previewLbl.textContent = printMode
      ? `Preview · A4 ${A4.w} × ${A4.h}`
      : `Preview · card ${CARD.w} × ${CARD.h}`;
  }

  let _previewUrl = null;
  let _renderToken = 0;
  async function render() {
    const myToken = ++_renderToken;
    stage.innerHTML = `<div style="color:var(--ink-faint);padding:24px;font-size:0.85rem">Rendering…</div>`;
    let blob;
    try {
      // Preview scale chosen so each mode renders to a similar on-screen size.
      const previewScale = printMode ? 0.5 : (1240 / CARD.w);
      blob = await renderBlob(printMode ? "sheet" : "card", { scale: previewScale, withCuts: showCuts });
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
    syncLabel();
  }

  cutsCk.addEventListener("change", () => { showCuts = cutsCk.checked; render(); });
  printCk.addEventListener("change", () => { printMode = printCk.checked; render(); });

  const cardSlug  = () => sanitizeFilename("Vow Cards");
  const sheetSlug = () => sanitizeFilename("Vow Cards A4 sheet");

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
      showToast(printMode ? "Rendering sheet…" : "Rendering card…");
      const blob = await renderBlob(printMode ? "sheet" : "card", { scale: 1, withCuts: showCuts });
      const filename = (printMode ? sheetSlug() : cardSlug()) + ".png";
      downloadBlob(blob, filename);
      showToast("Downloaded");
    } catch (e) { console.error(e); showToast("Download failed", "err"); }
  });

  upBtn.addEventListener("click", async () => {
    try {
      showToast("Uploading…");
      const blob = await renderBlob(printMode ? "sheet" : "card", { scale: 1, withCuts: showCuts });
      const filename = (printMode ? sheetSlug() : cardSlug()) + ".png";
      const j = await uploadPngBlob(blob, filename);
      try { await navigator.clipboard.writeText(j.link); } catch {}
      showToast("Uploaded · link copied");
      window.open(j.link, "_blank", "noopener");
    } catch (e) { console.error(e); showToast(e.message || "Upload failed", "err", 4000); }
  });

  pdfBtn.addEventListener("click", async () => {
    try {
      showToast("Loading PDF library…");
      const { jsPDF } = await import("https://esm.sh/jspdf@2.5.2");
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
      showToast("Rendering A4 sheet…");
      const blob = await renderBlob("sheet", { scale: 1, withCuts: showCuts });
      const dataUrl = "data:image/png;base64," + (await blobToBase64(blob));
      pdf.addImage(dataUrl, "PNG", 0, 0, 210, 297, undefined, "FAST");
      pdf.save("Vow Cards — A4 print sheet.pdf");
      showToast("PDF saved · 1 page");
    } catch (e) { console.error(e); showToast(e.message || "PDF generation failed", "err", 4000); }
  });

  render();
}

mount();
