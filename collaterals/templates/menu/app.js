// Menu — pre-baked Canva artwork (menu.png, 1500 × 2100 px) laid out 2-up on
// A4 landscape for efficient printing. Same structural pattern as
// sponsors-thankyou: source PNG is final art, no SVG-text overlay; this module
// just handles the A4 grid + PDF + Drive plumbing.

import { uploadPngBlob, sanitizeFilename, COLLATERALS_FOLDER_URL } from "../../shared/drive.js";
import { setStatus, getAllStatus } from "../../shared/state.js";
import { blobToBase64 } from "../../shared/export.js";

const TEMPLATE_ID = "menu";

// Canva canvas — 5″ × 7″ portrait at 300 DPI.
const CARD = { w: 1500, h: 2100 };
// A4 landscape at 300 DPI — fits two 5×7 menus side-by-side comfortably.
const A4 = { w: 3508, h: 2480 };
const GRID = { cols: 2, rows: 1, gap: 60 };
const PER_SHEET = GRID.cols * GRID.rows;

const MENU_FILE = "menu.png";

// === Asset loader =========================================================

let _menuPromise = null;
function loadMenu() {
  if (_menuPromise) return _menuPromise;
  _menuPromise = (async () => {
    const resp = await fetch(MENU_FILE);
    if (!resp.ok) throw new Error(`fetch ${MENU_FILE} ${resp.status}`);
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
  return _menuPromise;
}

// === Rendering ============================================================

function blobToObjectUrl(blob) { return URL.createObjectURL(blob); }

async function renderSheetCanvas({ scale = 1 } = {}) {
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

  const { img } = await loadMenu();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
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

async function renderSheetBlob({ scale = 1 } = {}) {
  const canvas = await renderSheetCanvas({ scale });
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
  if (!root) throw new Error("menu: #editor-root missing");

  let printMode = true; // A4 layout is the default view — that's the print-ready output

  root.innerHTML = `
    <div class="editor-header">
      <div class="title-block">
        <h1>Menu</h1>
        <p>Pre-edited Canva menu · ${CARD.w} × ${CARD.h} px (5″ × 7″ @ 300 DPI) · laid out 2-up on A4 landscape (${A4.w} × ${A4.h} px)</p>
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
          <p class="field-hint">The menu is already finalized in Canva — <code>menu.png</code> is the source of truth. Edits should happen in Canva and the file re-dropped into <code>templates/menu/</code>.</p>
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
          <button type="button" id="ed-dl-card" class="btn btn-ghost">
            <span class="material-symbols-outlined">download</span>
            Download single menu (${CARD.w} × ${CARD.h})
          </button>
          <button type="button" id="ed-pdf" class="btn btn-ghost">
            <span class="material-symbols-outlined">picture_as_pdf</span>
            Download A4 PDF (2-up, 1 page)
          </button>
          <a href="${COLLATERALS_FOLDER_URL}" target="_blank" rel="noopener" class="btn-link" style="font-size:0.74rem;text-align:center;margin-top:2px">Open Drive folder ↗</a>
        </div>
      </div>
      <div class="preview-pane">
        <div class="preview-toolbar">
          <span class="label" id="ed-preview-label">Preview</span>
          <label class="toggle"><input id="ed-print-mode" type="checkbox" checked/> A4 2-up</label>
        </div>
        <div id="ed-stage" class="preview-stage" style="min-height:480px;width:100%;display:flex;justify-content:center;align-items:flex-start"></div>
      </div>
    </div>
  `;

  const $ = (id) => document.getElementById(id);
  const statusSel = $("status-select");
  const dlBtn     = $("ed-dl");
  const upBtn     = $("ed-up");
  const dlCardBtn = $("ed-dl-card");
  const pdfBtn    = $("ed-pdf");
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
      ? `Preview · A4 sheet ${A4.w} × ${A4.h}`
      : `Preview · menu ${CARD.w} × ${CARD.h}`;
  }

  let _previewUrl = null;
  let _renderToken = 0;
  async function render() {
    const myToken = ++_renderToken;
    stage.innerHTML = `<div style="color:var(--ink-faint);padding:24px;font-size:0.85rem">Rendering…</div>`;
    let blob;
    try {
      if (printMode) {
        // Half-scale preview is plenty on-screen — full scale is reserved for
        // the actual download / PDF.
        blob = await renderSheetBlob({ scale: 0.5 });
      } else {
        const card = await loadMenu();
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
    syncLabel();
  }

  printCk.addEventListener("change", () => { printMode = printCk.checked; render(); });

  const cardSlug = () => sanitizeFilename("Menu");
  const sheetSlug = () => sanitizeFilename("Menu A4 sheet");

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
        const blob = await renderSheetBlob({ scale: 1 });
        downloadBlob(blob, sheetSlug() + ".png");
      } else {
        const { blob } = await loadMenu();
        downloadBlob(blob, cardSlug() + ".png");
      }
      showToast("Downloaded");
    } catch (e) { console.error(e); showToast("Download failed", "err"); }
  });

  upBtn.addEventListener("click", async () => {
    try {
      showToast("Uploading…");
      let blob, filename;
      if (printMode) {
        blob = await renderSheetBlob({ scale: 1 });
        filename = sheetSlug() + ".png";
      } else {
        ({ blob } = await loadMenu());
        filename = cardSlug() + ".png";
      }
      const j = await uploadPngBlob(blob, filename);
      try { await navigator.clipboard.writeText(j.link); } catch {}
      showToast("Uploaded · link copied");
      window.open(j.link, "_blank", "noopener");
    } catch (e) { console.error(e); showToast(e.message || "Upload failed", "err", 4000); }
  });

  dlCardBtn.addEventListener("click", async () => {
    try {
      const { blob } = await loadMenu();
      downloadBlob(blob, cardSlug() + ".png");
      showToast("Downloaded single menu");
    } catch (e) { console.error(e); showToast("Download failed", "err"); }
  });

  pdfBtn.addEventListener("click", async () => {
    try {
      showToast("Loading PDF library…");
      const { jsPDF } = await import("https://esm.sh/jspdf@2.5.2");
      // A4 landscape — 297 × 210 mm.
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape", compress: true });
      showToast("Rendering A4 sheet…");
      const blob = await renderSheetBlob({ scale: 1 });
      const dataUrl = "data:image/png;base64," + (await blobToBase64(blob));
      pdf.addImage(dataUrl, "PNG", 0, 0, 297, 210, undefined, "FAST");
      pdf.save("Menu — A4 print sheet.pdf");
      showToast("PDF saved · 1 page");
    } catch (e) { console.error(e); showToast(e.message || "PDF generation failed", "err", 4000); }
  });

  render();
}

mount();
