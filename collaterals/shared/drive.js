// Drive upload — calls the gemini-proxy /upload-drive endpoint with
// app: "collaterals" so the file lands in the wedding collaterals folder.
//
// Server-side: see gemini-proxy/index.js (DRIVE_FOLDERS map).
// Folder: https://drive.google.com/drive/folders/1IJWFdaSe8xSuqK-FJEJjMzhyqnOBQNhW

import { blobToBase64 } from "./export.js";

export const COLLATERALS_FOLDER_URL =
  "https://drive.google.com/drive/folders/1IJWFdaSe8xSuqK-FJEJjMzhyqnOBQNhW";

const PROXY = "https://gemini-proxy-668755364170.asia-southeast1.run.app";

const FILENAME_RE = /^[\w .,()\-+&'’]+\.(png|pdf)$/i;

export function sanitizeFilename(name) {
  // Replace anything outside the proxy's allow-list, then trim.
  const cleaned = name.replace(/[^\w .,()\-+&'’]/g, "_").replace(/\s+/g, " ").trim();
  return cleaned || "collateral";
}

export async function uploadPngBlob(blob, filename) {
  if (!FILENAME_RE.test(filename)) {
    filename = sanitizeFilename(filename.replace(/\.\w+$/, "")) + ".png";
  }
  const base64 = await blobToBase64(blob);
  const r = await fetch(`${PROXY}/upload-drive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, imageBase64: base64, app: "collaterals" }),
  });
  if (!r.ok) {
    let msg = `Upload failed (${r.status})`;
    try {
      const j = await r.json();
      if (j?.error) msg += `: ${j.error}`;
    } catch {}
    throw new Error(msg);
  }
  return await r.json(); // { id, link, downloadLink }
}
