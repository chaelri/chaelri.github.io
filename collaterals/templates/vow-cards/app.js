// Vow Cards — pre-baked Canva artwork (vow-cards.png) printed at true A4 size.
// The source is a 2×2 layout (To-My-Wife + To-My-Husband, two copies of each),
// upscaled to fill an A4 portrait canvas at 300 DPI so each quadrant lands at
// A6 (105 × 148.5 mm), the intended physical vow-card size. Dashed cut
// indicators overlay the center cross + per-quadrant borders so the printer
// can trim cleanly. Same skeleton as menu / sponsors-thankyou — no SVG-text
// overlay, just raster + cut marks.

import { uploadPngBlob, sanitizeFilename, COLLATERALS_FOLDER_URL } from "../../shared/drive.js";
import { setStatus, getAllStatus } from "../../shared/state.js";
import { blobToBase64 } from "../../shared/export.js";

const TEMPLATE_ID = "vow-cards";

// A4 portrait at 300 DPI — the final print size. The source PNG is A4 aspect
// (1414 × 2000, 1:√2) and is upscaled to fill the canvas.
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
  // Full-bleed onto A4 — the source PNG is A4 aspect, so this upscales without
  // distortion. Re-export from Canva at 2480 × 3508 for sharpest print.
  ctx.drawImage(img, 0, 0, W, H);

  if (withCuts) {
    ctx.save();
    ctx.strokeStyle = "#8c8c8c";
    ctx.lineWidth = Math.max(1, 2 * scale);
    ctx.setLineDash([22 * scale, 12 * scale]);
    ctx.globalAlpha = 0.6;
    // Center cross — splits the 2×2 grid into four quadrants.
    const midX = W / 2;
    const midY = H / 2;
    ctx.beginPath();
    ctx.moveTo(0, midY); ctx.lineTo(W, midY);
    ctx.moveTo(midX, 0); ctx.lineTo(midX, H);
    ctx.stroke();
    // Per-quadrant trim borders (slightly lighter so they don't fight the
    // center cross visually).
    ctx.globalAlpha = 0.45;
    ctx.strokeRect(0, 0, midX, midY);
    ctx.strokeRect(midX, 0, midX, midY);
    ctx.strokeRect(0, midY, midX, midY);
    ctx.strokeRect(midX, midY, midX, midY);
    ctx.restore();
  }
  return canvas;
}

async function renderSheetBlob({ scale = 1, withCuts = true } = {}) {
  const canvas = await renderSheetCanvas({ scale, withCuts });
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

  let showCuts = true;

  root.innerHTML = `
    <div class="editor-header">
      <div class="title-block">
        <h1>Vow Cards</h1>
        <p>Pre-edited Canva vow cards · 2 × 2 on A4 portrait (${A4.w} × ${A4.h} px @ 300 DPI) · each quadrant = A6 (105 × 148.5 mm), the true vow-card size</p>
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
            Download A4 PNG
          </button>
          <button type="button" id="ed-up" class="btn btn-primary">
            <span class="material-symbols-outlined">cloud_upload</span>
            Upload A4 PNG to Drive
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
          <span class="label" id="ed-preview-label">Preview · A4 sheet ${A4.w} × ${A4.h}</span>
          <label class="toggle"><input id="ed-show-cuts" type="checkbox" checked/> Cut marks</label>
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
  const stage     = $("ed-stage");

  statusSel.value = getAllStatus()[TEMPLATE_ID] || "pending";
  statusSel.addEventListener("change", () => {
    setStatus(TEMPLATE_ID, statusSel.value);
    showToast(`Marked as ${statusSel.options[statusSel.selectedIndex].text}`);
  });

  let _previewUrl = null;
  let _renderToken = 0;
  async function render() {
    const myToken = ++_renderToken;
    stage.innerHTML = `<div style="color:var(--ink-faint);padding:24px;font-size:0.85rem">Rendering…</div>`;
    let blob;
    try {
      // Half-scale preview (1240 × 1754) — full scale is reserved for export.
      blob = await renderSheetBlob({ scale: 0.5, withCuts: showCuts });
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
  }

  cutsCk.addEventListener("change", () => { showCuts = cutsCk.checked; render(); });

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
      showToast("Rendering sheet…");
      const blob = await renderSheetBlob({ scale: 1, withCuts: showCuts });
      downloadBlob(blob, sheetSlug() + ".png");
      showToast("Downloaded");
    } catch (e) { console.error(e); showToast("Download failed", "err"); }
  });

  upBtn.addEventListener("click", async () => {
    try {
      showToast("Uploading…");
      const blob = await renderSheetBlob({ scale: 1, withCuts: showCuts });
      const j = await uploadPngBlob(blob, sheetSlug() + ".png");
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
      const blob = await renderSheetBlob({ scale: 1, withCuts: showCuts });
      const dataUrl = "data:image/png;base64," + (await blobToBase64(blob));
      pdf.addImage(dataUrl, "PNG", 0, 0, 210, 297, undefined, "FAST");
      pdf.save("Vow Cards — A4 print sheet.pdf");
      showToast("PDF saved · 1 page");
    } catch (e) { console.error(e); showToast(e.message || "PDF generation failed", "err", 4000); }
  });

  render();
}

mount();
