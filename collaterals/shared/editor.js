// Shared helpers for each template editor page.
// Builds the action row (download / upload / status select) + toast.

import { svgToPngBlob, downloadPng } from "./export.js";
import { uploadPngBlob, COLLATERALS_FOLDER_URL, sanitizeFilename } from "./drive.js";
import { TEMPLATES, getTemplateData, setTemplateData, setStatus, getAllStatus } from "./state.js";

export function templateMeta(id) {
  return TEMPLATES.find((t) => t.id === id);
}

export function showToast(msg, kind = "ok", ms = 2400) {
  const el = document.getElementById("toast");
  const m = document.getElementById("toast-msg");
  if (!el || !m) return;
  m.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (el.className = "toast"), ms);
}

export function bindStatusSelect(id, selectEl) {
  selectEl.value = getAllStatus()[id];
  selectEl.addEventListener("change", () => {
    setStatus(id, selectEl.value);
    showToast(`Marked “${templateMeta(id).label}” as ${selectEl.options[selectEl.selectedIndex].text}`);
  });
}

export function bindData(id, fields, onChange) {
  // fields: { fieldId: { defaultValue, parse?, format? } }
  const saved = getTemplateData(id);
  const data = {};
  for (const [k, def] of Object.entries(fields)) {
    const el = document.getElementById(k);
    if (!el) continue;
    const fromSaved = saved[k] !== undefined ? saved[k] : def.defaultValue;
    if (def.format) {
      el.value = def.format(fromSaved);
    } else {
      el.value = fromSaved;
    }
    data[k] = fromSaved;
    el.addEventListener("input", () => {
      const v = def.parse ? def.parse(el.value) : el.value;
      data[k] = v;
      persist();
      onChange(data);
    });
  }
  function persist() {
    setTemplateData(id, data);
  }
  // Trigger initial render
  onChange(data);
  return data;
}

export async function exportFlow(svgEl, filename, { scale = 3 } = {}) {
  const blob = await svgToPngBlob(svgEl, { scale });
  return blob;
}

export async function handleDownload(svgEl, filename, scale = 3) {
  try {
    await downloadPng(svgEl, filename, { scale });
    showToast("Downloaded · check your Downloads folder");
  } catch (e) {
    console.error(e);
    showToast("Download failed", "err");
  }
}

export async function handleUpload(svgEl, filename, scale = 3) {
  let final = sanitizeFilename(filename.replace(/\.png$/i, "")) + ".png";
  try {
    showToast("Uploading to Drive…");
    const blob = await svgToPngBlob(svgEl, { scale });
    const j = await uploadPngBlob(blob, final);
    showToast("Uploaded · link in clipboard");
    try {
      await navigator.clipboard.writeText(j.link);
    } catch {}
    // Open the file in a new tab.
    window.open(j.link, "_blank", "noopener");
  } catch (e) {
    console.error(e);
    showToast(e.message || "Upload failed", "err", 4000);
  }
}

export function attachActionRow({
  id,
  svgGetter,         // () => SVGElement
  filenameGetter,    // () => "Some name.png"
  scale = 3,
  multiSvgGetter,    // optional: () => [{svg, filename}] for batch downloads
}) {
  const btnDl = document.getElementById("btn-download");
  const btnUp = document.getElementById("btn-upload");
  const btnDlAll = document.getElementById("btn-download-all");
  const driveLink = document.getElementById("drive-folder-link");

  if (driveLink) driveLink.href = COLLATERALS_FOLDER_URL;

  if (btnDl) {
    btnDl.addEventListener("click", async () => {
      await handleDownload(svgGetter(), filenameGetter(), scale);
    });
  }
  if (btnUp) {
    btnUp.addEventListener("click", async () => {
      await handleUpload(svgGetter(), filenameGetter(), scale);
    });
  }
  if (btnDlAll && multiSvgGetter) {
    btnDlAll.addEventListener("click", async () => {
      try {
        const items = multiSvgGetter();
        for (const { svg, filename } of items) {
          await downloadPng(svg, filename, { scale });
          await new Promise((r) => setTimeout(r, 80));
        }
        showToast(`Downloaded ${items.length} files`);
      } catch (e) {
        console.error(e);
        showToast("Batch download failed", "err");
      }
    });
  }
}
