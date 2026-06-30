// Vow Cards — pre-baked Canva artwork (vow-cards.png) split into two A4
// landscape spreads. The source is a 2×2 layout; the TOP half is the "to my
// wife" booklet spread (monogram + message), the BOTTOM half is the "to my
// husband" spread. Each half is rendered full-bleed onto its own A4
// landscape page so the printed cards are double the size of the prior 2×2
// portrait layout — actual physical card ≈ A5 (148.5 × 210 mm) per side.
//
// Dashed cut marks: outer trim border (cut from sheet edge) + center
// vertical fold line (between the two cards of the booklet spread).

import { uploadPngBlob, sanitizeFilename, COLLATERALS_FOLDER_URL } from "../../shared/drive.js";
import { setStatus, getAllStatus } from "../../shared/state.js";
import { blobToBase64 } from "../../shared/export.js";

const TEMPLATE_ID = "vow-cards";

// A4 landscape at 300 DPI — the final print size.
const A4 = { w: 3508, h: 2480 };
const HALVES = [
  { id: "wife",    label: "To-my-wife spread",    srcTop: 0,   srcH: 0.5 },
  { id: "husband", label: "To-my-husband spread", srcTop: 0.5, srcH: 0.5 },
];

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

async function renderHalfCanvas(half, { scale = 1, withCuts = true } = {}) {
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
  // Crop the chosen half of the source PNG and stretch it to fill A4 landscape.
  // Source aspect (1414 × 1000 per half) = 1.414, identical to A4 landscape
  // (3508 × 2480 = 1.414), so no distortion.
  const sx = 0;
  const sy = Math.round(img.naturalHeight * half.srcTop);
  const sW = img.naturalWidth;
  const sH = Math.round(img.naturalHeight * half.srcH);
  ctx.drawImage(img, sx, sy, sW, sH, 0, 0, W, H);

  if (withCuts) {
    ctx.save();
    ctx.strokeStyle = "#8c8c8c";
    ctx.lineWidth = Math.max(1, 2 * scale);
    ctx.setLineDash([22 * scale, 12 * scale]);
    // Outer trim border (cut sheet to A4 landscape edge).
    ctx.globalAlpha = 0.55;
    ctx.strokeRect(0, 0, W, H);
    // Center vertical fold line — the spine of the booklet spread.
    ctx.globalAlpha = 0.65;
    const midX = W / 2;
    ctx.beginPath();
    ctx.moveTo(midX, 0); ctx.lineTo(midX, H);
    ctx.stroke();
    ctx.restore();
  }
  return canvas;
}

async function renderHalfBlob(half, { scale = 1, withCuts = true } = {}) {
  const canvas = await renderHalfCanvas(half, { scale, withCuts });
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
        <p>Pre-edited Canva vow cards · split into <strong>2 A4 landscape pages</strong> (${A4.w} × ${A4.h} px @ 300 DPI each) · wife + husband booklet spreads, each card ≈ A5 (148.5 × 210 mm)</p>
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
          <p class="field-hint">The vow cards are finalized in Canva — <code>vow-cards.png</code> is the source of truth (2×2 layout). Edits should happen in Canva and the file re-dropped into <code>templates/vow-cards/</code>; the splitter will read the top half as the wife spread, bottom half as the husband spread.</p>
        </div>
        <div class="field-block actions">
          <button type="button" id="ed-pdf" class="btn btn-primary">
            <span class="material-symbols-outlined">picture_as_pdf</span>
            Download A4 PDF (2 pages)
          </button>
          <button type="button" id="ed-dl" class="btn btn-ghost">
            <span class="material-symbols-outlined">download</span>
            Download both PNGs
          </button>
          <button type="button" id="ed-up" class="btn btn-ghost">
            <span class="material-symbols-outlined">cloud_upload</span>
            Upload both PNGs to Drive
          </button>
          <a href="${COLLATERALS_FOLDER_URL}" target="_blank" rel="noopener" class="btn-link" style="font-size:0.74rem;text-align:center;margin-top:2px">Open Drive folder ↗</a>
        </div>
      </div>
      <div class="preview-pane">
        <div class="preview-toolbar">
          <span class="label" id="ed-preview-label">Preview · 2 × A4 landscape ${A4.w} × ${A4.h}</span>
          <label class="toggle"><input id="ed-show-cuts" type="checkbox" checked/> Cut marks</label>
        </div>
        <div id="ed-stage" class="preview-stage" style="min-height:480px;width:100%;display:flex;flex-direction:column;justify-content:flex-start;align-items:center;gap:12px"></div>
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

  let _previewUrls = [];
  let _renderToken = 0;
  async function render() {
    const myToken = ++_renderToken;
    stage.innerHTML = `<div style="color:var(--ink-faint);padding:24px;font-size:0.85rem">Rendering…</div>`;
    try {
      // Half-scale preview (1754 × 1240 each) — full scale reserved for export.
      const blobs = await Promise.all(HALVES.map((h) =>
        renderHalfBlob(h, { scale: 0.5, withCuts: showCuts })
      ));
      if (myToken !== _renderToken) return;
      _previewUrls.forEach((u) => URL.revokeObjectURL(u));
      _previewUrls = blobs.map((b) => blobToObjectUrl(b));
      stage.innerHTML = HALVES.map((h, i) => `
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:100%">
          <div style="font-size:0.74rem;color:var(--ink-faint);text-transform:uppercase;letter-spacing:0.08em">Page ${i + 1} · ${h.label}</div>
          <img src="${_previewUrls[i]}" alt="${h.label}" style="max-width:100%;height:auto;display:block;box-shadow:0 2px 12px rgba(0,0,0,0.08)"/>
        </div>
      `).join("");
    } catch (e) {
      if (myToken !== _renderToken) return;
      console.error(e);
      stage.innerHTML = `<div style="color:#c0392b;padding:24px;font-size:0.85rem">Preview failed: ${e.message}</div>`;
    }
  }

  cutsCk.addEventListener("change", () => { showCuts = cutsCk.checked; render(); });

  const halfSlug = (h) => sanitizeFilename(`Vow Cards — ${h.label}`);

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
      for (let i = 0; i < HALVES.length; i++) {
        showToast(`Rendering ${i + 1}/${HALVES.length}…`);
        const blob = await renderHalfBlob(HALVES[i], { scale: 1, withCuts: showCuts });
        downloadBlob(blob, halfSlug(HALVES[i]) + ".png");
        await new Promise((r) => setTimeout(r, 120));
      }
      showToast(`Downloaded ${HALVES.length} PNGs`);
    } catch (e) { console.error(e); showToast("Download failed", "err"); }
  });

  upBtn.addEventListener("click", async () => {
    try {
      for (let i = 0; i < HALVES.length; i++) {
        showToast(`Uploading ${i + 1}/${HALVES.length}…`);
        const blob = await renderHalfBlob(HALVES[i], { scale: 1, withCuts: showCuts });
        await uploadPngBlob(blob, halfSlug(HALVES[i]) + ".png");
      }
      showToast(`Uploaded ${HALVES.length} to Drive`, "ok", 4000);
      window.open(COLLATERALS_FOLDER_URL, "_blank", "noopener");
    } catch (e) { console.error(e); showToast(e.message || "Batch upload failed", "err", 4000); }
  });

  pdfBtn.addEventListener("click", async () => {
    try {
      showToast("Loading PDF library…");
      const { jsPDF } = await import("https://esm.sh/jspdf@2.5.2");
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape", compress: true });
      for (let i = 0; i < HALVES.length; i++) {
        showToast(`Rendering ${i + 1}/${HALVES.length}…`);
        const blob = await renderHalfBlob(HALVES[i], { scale: 1, withCuts: showCuts });
        const dataUrl = "data:image/png;base64," + (await blobToBase64(blob));
        if (i > 0) pdf.addPage();
        pdf.addImage(dataUrl, "PNG", 0, 0, 297, 210, undefined, "FAST");
      }
      pdf.save("Vow Cards — A4 print sheets.pdf");
      showToast(`PDF saved · ${HALVES.length} pages`);
    } catch (e) { console.error(e); showToast(e.message || "PDF generation failed", "err", 4000); }
  });

  render();
}

mount();
