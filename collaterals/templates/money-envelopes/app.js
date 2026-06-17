// Money Envelopes — pre-baked Canva artwork laid out as a two-panel envelope
// dieline. Two full-size faces sit side-by-side; tabs (left, right, bottom)
// wrap around the BACK face to seal the pocket; a rounded top flap above the
// BACK face closes the open top.
//
// Dieline layout (printed face up on paper):
//
//                          _____________
//                         /  TOP FLAP   \      ← rounded seal flap above BACK only
//        +______________+_____________+---+
//        |              |              |   |
//        |   FRONT      |    BACK      |RT |   ← only ONE side tab (right side)
//        |   FACE       |    FACE      |   |
//        |  (front.png) |  (back.png)  |   |
//        |              |              |   |
//        +______________+______________+---+
//                       |              |
//                       |  BOTTOM TAB  |       ← bottom glue tab (below BACK only)
//                       +______________+
//
// Assembly:
//   1. Cut along the red dashed outer perimeter.
//   2. Pre-crease every sage dashed fold line. The CENTER fold (between
//      FRONT and BACK faces) is the main fold.
//   3. Fold RT inward over the BACK face (180° around its left edge).
//   4. Fold the BOTTOM TAB upward 180° behind the BACK face.
//   5. Apply adhesive to the now-exposed (inner) side of RT and BOTTOM TAB.
//   6. Fold along the CENTER vertical — BACK face goes BEHIND FRONT face.
//      Press to bond: the tabs are sandwiched between the two layers. RT
//      seals the left edge of the folded envelope (because RT mirrors to
//      the left after the center fold); BOTTOM TAB seals the bottom. The
//      right edge of the envelope is the center fold itself.
//   7. Insert cash + cards. Fold the TOP FLAP forward to close.
//
// Face size = 1160 × 2840 px (98.3 × 240.5 mm @ 300 DPI) — bill aspect (2.448:1)
// scaled up to fill A4 portrait near the edge. PHP banknote (160 × 66 mm) goes
// in vertically: bill's 160 mm long axis runs along the 240 mm envelope height,
// bill's 66 mm short axis sits across the 98 mm width. Generous buffer (~40 mm
// vertical, ~32 mm horizontal) but the envelope fills A4 — printable area is
// maximized so the printer's edge margin doesn't crop the design.
//
// Two PNGs in this folder (exported from Canva at 1160 × 2840 px):
//   front.png — LEFT face (visible side when sealed, decorative)
//   back.png  — RIGHT face (form / message side, ends up inside the pocket
//               after the center fold — accessible while filling before the
//               envelope is glued shut, or visible through the top opening)

import { uploadPngBlob, sanitizeFilename, COLLATERALS_FOLDER_URL } from "../../shared/drive.js";
import { setStatus, getAllStatus } from "../../shared/state.js";
import { blobToBase64 } from "../../shared/export.js";

const TEMPLATE_ID = "money-envelopes";

const FACE       = { w: 1160, h: 2840 };          // 98.3 × 240.5 mm @ 300 DPI — sized to fill A4 portrait near the edge while keeping bill aspect (2.448:1)
const TOP_FLAP   = { h: 303, cornerR: 116 };      // ~25.7 mm flap depth, ~9.8 mm rounded corners — proportional to face width
const SIDE_TAB   = { w: 120 };                    // ~10.2 mm right-side glue strip (only one tab — left side has none)
const BOTTOM_TAB = { h: 200 };                    // ~17 mm bottom glue strip
const TAB_TAPER  = 60;                            // ~5 mm trapezoidal inset on every tab edge

const DIELINE = {
  w: FACE.w + FACE.w + SIDE_TAB.w,                // 2440 px (206.7 mm)
  h: TOP_FLAP.h + FACE.h + BOTTOM_TAB.h,          // 3343 px (283.2 mm)
};

// A4 portrait — dieline fills nearly edge-to-edge with a tiny safe margin.
const A4 = { w: 2480, h: 3508 };
const MARGIN = 20;

const CUT_COLOR       = "#c03a2e";
const FOLD_COLOR      = "#6b8552";
const FOLD_MAIN_COLOR = "#4d6b35";

// === Asset loader =========================================================

const _imgCache = new Map();
function loadImage(filename) {
  if (_imgCache.has(filename)) return _imgCache.get(filename);
  const p = (async () => {
    const resp = await fetch(filename);
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

// === Dieline path =========================================================

function traceCutPerimeter(ctx, mapX, mapY, scale) {
  const fw = FACE.w, fh = FACE.h;
  const flh = TOP_FLAP.h, flr = TOP_FLAP.cornerR;
  const tt  = TAB_TAPER;
  const W = DIELINE.w, H = DIELINE.h;
  const arcFlap = flr * scale;

  ctx.beginPath();
  // Clockwise from FRONT face top-left. No left tab — the FRONT face's left
  // edge is the outer cut. Trapezoidal RT (right side) + BOTTOM TAB taper
  // inward so they fold cleanly without overlapping the FRONT face.
  ctx.moveTo(mapX(0), mapY(flh));                                                   // FRONT face TL = dieline TL
  ctx.lineTo(mapX(fw), mapY(flh));                                                  // → top of FRONT face
  ctx.lineTo(mapX(fw), mapY(flr));                                                  // ↑ flap left edge to round-start
  ctx.arcTo(mapX(fw), mapY(0), mapX(fw + flr), mapY(0), arcFlap);                   // ⌒ flap TL rounded
  ctx.lineTo(mapX(2*fw - flr), mapY(0));                                            // → flap top
  ctx.arcTo(mapX(2*fw), mapY(0), mapX(2*fw), mapY(flr), arcFlap);                   // ⌒ flap TR rounded
  ctx.lineTo(mapX(2*fw), mapY(flh));                                                // ↓ flap right edge to inside corner
  ctx.lineTo(mapX(W), mapY(flh + tt));                                              // ↘ RT top angled
  ctx.lineTo(mapX(W), mapY(flh + fh - tt));                                         // ↓ RT outer-right (straight vertical)
  ctx.lineTo(mapX(2*fw), mapY(flh + fh));                                           // ↙ RT bottom angled to inside corner
  ctx.lineTo(mapX(2*fw - tt), mapY(H));                                             // ↘ bottom tab right angled
  ctx.lineTo(mapX(fw + tt), mapY(H));                                               // ← bottom tab bottom (straight)
  ctx.lineTo(mapX(fw), mapY(flh + fh));                                             // ↖ bottom tab left angled to inside corner
  ctx.lineTo(mapX(0), mapY(flh + fh));                                              // ← bottom of FRONT face
  ctx.closePath();                                                                   // ↑ FRONT face left edge back to start
}

function drawDielineMarks(ctx, mapX, mapY, scale) {
  const fw = FACE.w, fh = FACE.h, flh = TOP_FLAP.h;

  // Cut perimeter (red dashed)
  ctx.save();
  ctx.strokeStyle = CUT_COLOR;
  ctx.lineWidth = Math.max(2, 3.5 * scale);
  ctx.setLineDash([22 * scale, 12 * scale]);
  ctx.lineCap = "butt";
  ctx.globalAlpha = 0.85;
  traceCutPerimeter(ctx, mapX, mapY, scale);
  ctx.stroke();
  ctx.restore();

  const inset = 30;

  // MAIN center fold — slightly bolder + darker sage to flag it as the
  // primary fold (FRONT/BACK seam).
  ctx.save();
  ctx.strokeStyle = FOLD_MAIN_COLOR;
  ctx.lineWidth = Math.max(2, 3 * scale);
  ctx.setLineDash([14 * scale, 10 * scale]);
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(mapX(fw), mapY(flh + inset));
  ctx.lineTo(mapX(fw), mapY(flh + fh - inset));
  ctx.stroke();
  ctx.restore();

  // Secondary folds: top flap base, bottom tab seam, right tab seam.
  ctx.save();
  ctx.strokeStyle = FOLD_COLOR;
  ctx.lineWidth = Math.max(1.5, 2.5 * scale);
  ctx.setLineDash([9 * scale, 9 * scale]);
  ctx.globalAlpha = 0.7;

  // Top fold: flap base
  ctx.beginPath();
  ctx.moveTo(mapX(fw + inset), mapY(flh));
  ctx.lineTo(mapX(2*fw - inset), mapY(flh));
  ctx.stroke();

  // Bottom fold: BACK / BOTTOM TAB seam
  ctx.beginPath();
  ctx.moveTo(mapX(fw + inset), mapY(flh + fh));
  ctx.lineTo(mapX(2*fw - inset), mapY(flh + fh));
  ctx.stroke();

  // R tab fold: BACK / RT seam
  ctx.beginPath();
  ctx.moveTo(mapX(2*fw), mapY(flh + inset));
  ctx.lineTo(mapX(2*fw), mapY(flh + fh - inset));
  ctx.stroke();
  ctx.restore();
}

// === Sheet render =========================================================

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

  // Fit dieline within A4 landscape with margin
  const availW = A4.w - MARGIN * 2;
  const availH = A4.h - MARGIN * 2;
  const fit = Math.min(availW / DIELINE.w, availH / DIELINE.h);
  const dlW = DIELINE.w * fit;
  const dlH = DIELINE.h * fit;
  const dlX = (A4.w - dlW) / 2;
  const dlY = (A4.h - dlH) / 2;

  const mapX = (x) => (dlX + x * fit) * scale;
  const mapY = (y) => (dlY + y * fit) * scale;
  const drawScale = fit * scale;

  const [frontImg, backImg] = await Promise.all([
    loadImage("front.png").catch(() => null),
    loadImage("back.png").catch(() => null),
  ]);

  const fw = FACE.w * drawScale;
  const fh = FACE.h * drawScale;

  // Clip everything to the cut perimeter so face art never bleeds past it.
  ctx.save();
  traceCutPerimeter(ctx, mapX, mapY, drawScale);
  ctx.clip();

  // FRONT face — left panel (starts at x=0, the dieline's left edge)
  if (frontImg) {
    ctx.drawImage(frontImg.img, mapX(0), mapY(TOP_FLAP.h), fw, fh);
  } else {
    ctx.fillStyle = "#f5f1ea";
    ctx.fillRect(mapX(0), mapY(TOP_FLAP.h), fw, fh);
  }
  // BACK face — right panel
  if (backImg) {
    ctx.drawImage(backImg.img, mapX(FACE.w), mapY(TOP_FLAP.h), fw, fh);
  } else {
    ctx.fillStyle = "#eef0e8";
    ctx.fillRect(mapX(FACE.w), mapY(TOP_FLAP.h), fw, fh);
  }
  ctx.restore();

  drawDielineMarks(ctx, mapX, mapY, drawScale);

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
  if (!root) throw new Error("money-envelopes: #editor-root missing");

  root.innerHTML = `
    <div class="editor-header">
      <div class="title-block">
        <h1>Money Envelopes</h1>
        <p>Two-panel envelope dieline · FRONT + BACK faces (${FACE.w} × ${FACE.h} px each, ~98 × 240 mm — fills A4 portrait near edge, bill-aspect sleeve for PHP banknotes inserted vertically) · rounded top flap above BACK + 2 trapezoidal glue tabs (right + bottom) to seal the pocket</p>
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
          <p class="field-hint">Two Canva pages, each <strong>${FACE.w} × ${FACE.h} px</strong>:</p>
          <ul style="margin:6px 0 10px 18px;color:var(--ink-soft);font-size:0.78rem;line-height:1.55">
            <li><code>front.png</code> — LEFT panel art (visible when sealed, decorative)</li>
            <li><code>back.png</code> — RIGHT panel art (form / message side; ends up inside the pocket after the center fold)</li>
          </ul>
        </div>
        <div class="field-block">
          <h3>Assembly</h3>
          <ol style="margin:0 0 0 18px;color:var(--ink-soft);font-size:0.78rem;line-height:1.6">
            <li>Cut along the <strong style="color:${CUT_COLOR}">red dashed</strong> outline.</li>
            <li>Pre-crease every <strong style="color:${FOLD_COLOR}">sage dashed</strong> line. The <strong style="color:${FOLD_MAIN_COLOR}">darker sage</strong> center vertical is the main fold.</li>
            <li>Fold the right tab INWARD over the BACK face.</li>
            <li>Fold the bottom tab UP behind the BACK face.</li>
            <li>Apply adhesive to the right and bottom tabs (the side that will face the FRONT face after the main fold).</li>
            <li>Fold along the main center vertical — BACK face goes BEHIND FRONT face. Press to bond the tabs. The right tab now seals the left edge of the folded envelope; the bottom tab seals the bottom.</li>
            <li>Insert cash. Fold the top flap forward to close.</li>
          </ol>
        </div>
        <div class="field-block actions">
          <button type="button" id="ed-dl" class="btn btn-ghost">
            <span class="material-symbols-outlined">download</span>
            Download A4 sheet (PNG)
          </button>
          <button type="button" id="ed-up" class="btn btn-primary">
            <span class="material-symbols-outlined">cloud_upload</span>
            Upload A4 sheet to Drive
          </button>
          <button type="button" id="ed-pdf" class="btn btn-ghost">
            <span class="material-symbols-outlined">picture_as_pdf</span>
            Download A4 PDF
          </button>
          <a href="${COLLATERALS_FOLDER_URL}" target="_blank" rel="noopener" class="btn-link" style="font-size:0.74rem;text-align:center;margin-top:2px">Open Drive folder ↗</a>
        </div>
      </div>
      <div class="preview-pane">
        <div class="preview-toolbar">
          <span class="label">Preview · A4 landscape (${A4.w} × ${A4.h} px)</span>
        </div>
        <div id="ed-stage" class="preview-stage" style="min-height:520px;width:100%;display:flex;justify-content:center;align-items:flex-start"></div>
      </div>
    </div>
  `;

  const $ = (id) => document.getElementById(id);
  const statusSel = $("status-select");
  const dlBtn     = $("ed-dl");
  const upBtn     = $("ed-up");
  const pdfBtn    = $("ed-pdf");
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
    try {
      const blob = await renderSheetBlob({ scale: 0.5 });
      if (myToken !== _renderToken) return;
      if (_previewUrl) URL.revokeObjectURL(_previewUrl);
      _previewUrl = blobToObjectUrl(blob);
      stage.innerHTML = `<img src="${_previewUrl}" alt="preview" style="max-width:100%;height:auto;display:block;box-shadow:0 2px 12px rgba(0,0,0,0.08)"/>`;
    } catch (e) {
      if (myToken !== _renderToken) return;
      console.error(e);
      stage.innerHTML = `<div style="color:#c0392b;padding:24px;font-size:0.85rem">Preview failed: ${e.message}</div>`;
    }
  }

  const sheetName = () => sanitizeFilename("Money Envelope A4");

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  dlBtn.addEventListener("click", async () => {
    try {
      showToast("Rendering full-scale…");
      const blob = await renderSheetBlob({ scale: 1 });
      downloadBlob(blob, sheetName() + ".png");
      showToast("Downloaded");
    } catch (e) { console.error(e); showToast("Download failed", "err"); }
  });

  upBtn.addEventListener("click", async () => {
    try {
      showToast("Uploading…");
      const blob = await renderSheetBlob({ scale: 1 });
      const j = await uploadPngBlob(blob, sheetName() + ".png");
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
      const blob = await renderSheetBlob({ scale: 1 });
      const dataUrl = "data:image/png;base64," + (await blobToBase64(blob));
      pdf.addImage(dataUrl, "PNG", 0, 0, 210, 297, undefined, "FAST");
      pdf.save("Money Envelope — A4 dieline.pdf");
      showToast("PDF saved · 1 page");
    } catch (e) { console.error(e); showToast(e.message || "PDF generation failed", "err", 4000); }
  });

  render();
}

mount();
