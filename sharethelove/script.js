// Share the Love — guest photo / video upload page for Charlie + Karla's
// wedding. Uses the same Firebase project as weddingbar / collaterals (the
// "test-database-55379" shared bucket). Photos are compressed client-side
// before upload; videos pass through as-is with a hard size cap.
//
// Flow:
//   1. Guest taps the drop zone or drops files onto it.
//   2. We make a local preview thumbnail per file.
//   3. On "Send to our album", we compress images (2400px long edge, q=0.85),
//      sign in anonymously, and upload each via uploadBytesResumable so we can
//      paint a per-file progress bar.
//   4. Once every file finishes (or errors), we show the thank-you state.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getStorage, ref, uploadBytesResumable,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyB8ahT56WbEUaGAymsRNNA-DrfZnUnWIwk",
  authDomain: "test-database-55379.firebaseapp.com",
  databaseURL: "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "test-database-55379",
  storageBucket: "test-database-55379.firebasestorage.app",
  messagingSenderId: "933688602756",
  appId: "1:933688602756:web:392a3a4ce040cb9d4452d1",
  measurementId: "G-1LSTC0N3NJ",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);

// Storage layout: /wedding-uploads/<yyyy-mm>/<ts>-<rand>.<ext>
// Grouped by month so Charlie can browse the bucket without scrolling forever.
const STORAGE_ROOT = "wedding-uploads";

// Compression knobs — 2400 px on the long edge at JPEG q=0.85 lands around
// 300–700 KB per photo with no visible loss on a phone or 5–7" print.
const MAX_IMAGE_DIM = 2400;
const IMAGE_QUALITY = 0.85;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;                   // 50 MB

// === DOM ==================================================================

const $ = (id) => document.getElementById(id);
const dropzone   = $("dropzone");
const fileInput  = $("file-input");
const previewEl  = $("preview-list");
const controlsEl = $("upload-controls");
const uploadBtn  = $("upload-btn");
const uploadLbl  = $("upload-label");
const uploadStat = $("upload-status");
const successEl  = $("success");
const moreBtn    = $("upload-more");
const guestNameEl = $("guest-name");
const toastEl    = $("toast");
const toastMsg   = $("toast-msg");
const florals    = Array.from(document.querySelectorAll(".floral"));

// Reveal florals on a stagger so the page eases in rather than slamming.
florals.forEach((el, i) => setTimeout(() => el.classList.add("in"), 120 + i * 90));

// === State ================================================================

const items = new Map();                                    // id → { file, blob, url, status, pct }
let isUploading = false;

function rand() { return Math.random().toString(36).slice(2, 10); }

function showToast(msg, kind = "ok", ms = 2400) {
  toastMsg.textContent = msg;
  toastEl.className = `toast show ${kind === "err" ? "err" : ""}`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (toastEl.className = "toast"), ms);
}

// === Image compression ====================================================

function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); rej(e); };
    img.src = url;
  });
}

async function compressImage(file) {
  // Skip compression for tiny files — re-encoding small JPEGs sometimes makes
  // them slightly larger because of header overhead.
  if (file.size < 200 * 1024) return file;
  let img;
  try { img = await loadImage(file); }
  catch (e) { console.warn("decode failed; uploading original", e); return file; }
  const ratio = Math.min(1, MAX_IMAGE_DIM / Math.max(img.width, img.height));
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise((res) =>
    canvas.toBlob(res, "image/jpeg", IMAGE_QUALITY)
  );
  // If compression somehow grew the file (very rare), keep the original.
  if (!blob || blob.size >= file.size) return file;
  return blob;
}

// === Thumbnails ===========================================================

function addThumb(file) {
  const id = `${Date.now()}-${rand()}`;
  const url = URL.createObjectURL(file);
  const isVideo = file.type.startsWith("video/");
  const node = document.createElement("div");
  node.className = "thumb";
  node.dataset.id = id;
  node.innerHTML = `
    ${isVideo
      ? `<video src="${url}" muted playsinline preload="metadata"></video>`
      : `<img src="${url}" alt="${file.name}">`}
    <div class="remove" title="Remove">
      <span class="material-symbols-outlined" style="font-size:16px">close</span>
    </div>
    <div class="progress"><div class="progress-fill"></div></div>
    <div class="check">
      <span class="material-symbols-outlined" style="font-size:32px;font-variation-settings:'FILL' 1">check</span>
    </div>
  `;
  previewEl.appendChild(node);
  node.querySelector(".remove").addEventListener("click", () => removeItem(id));
  items.set(id, { file, blob: file, url, status: "queued", pct: 0, node, isVideo });
  refreshControls();
}

function removeItem(id) {
  const it = items.get(id);
  if (!it || it.status === "uploading") return;
  URL.revokeObjectURL(it.url);
  it.node.remove();
  items.delete(id);
  refreshControls();
}

function refreshControls() {
  const n = items.size;
  if (n === 0) {
    controlsEl.classList.add("hidden-init");
    return;
  }
  controlsEl.classList.remove("hidden-init");
  uploadLbl.textContent = isUploading
    ? `Sending… ${countDone()}/${n}`
    : n === 1 ? `Send 1 photo to our album` : `Send ${n} photos to our album`;
}

function countDone() {
  let n = 0;
  for (const it of items.values()) if (it.status === "done") n++;
  return n;
}

function setProgress(id, pct) {
  const it = items.get(id);
  if (!it) return;
  it.pct = pct;
  const fill = it.node.querySelector(".progress-fill");
  if (fill) fill.style.width = `${pct}%`;
}

function markDone(id) {
  const it = items.get(id);
  if (!it) return;
  it.status = "done";
  it.node.classList.add("done");
}

function markError(id) {
  const it = items.get(id);
  if (!it) return;
  it.status = "error";
  it.node.style.outline = "2px solid #c97070";
}

// === File picking + drag-drop =============================================

function ingestFiles(fileList) {
  for (const f of Array.from(fileList)) {
    if (!f.type.startsWith("image/") && !f.type.startsWith("video/")) {
      showToast(`Skipped non-media file: ${f.name}`, "err");
      continue;
    }
    if (f.type.startsWith("video/") && f.size > MAX_VIDEO_BYTES) {
      showToast(`${f.name} is over 50 MB — please trim it first`, "err", 4200);
      continue;
    }
    addThumb(f);
  }
}

fileInput.addEventListener("change", () => {
  if (fileInput.files?.length) {
    ingestFiles(fileInput.files);
    fileInput.value = "";                                   // allow re-picking the same file
  }
});

["dragenter", "dragover"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  })
);
["dragleave", "dragend", "drop"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
  })
);
dropzone.addEventListener("drop", (e) => {
  if (e.dataTransfer?.files?.length) ingestFiles(e.dataTransfer.files);
});

// === Upload ===============================================================

async function ensureAuth() {
  if (auth.currentUser) return auth.currentUser;
  return new Promise((res, rej) => {
    const off = onAuthStateChanged(auth, (user) => {
      if (user) { off(); res(user); }
    });
    signInAnonymously(auth).catch(rej);
  });
}

function extFor(file) {
  // Honor the chosen container for videos; force .jpg for images since we
  // re-encode to JPEG during compression.
  if (file.type.startsWith("image/")) return ".jpg";
  const m = /^video\/([a-z0-9]+)$/i.exec(file.type);
  if (m) return "." + m[1].toLowerCase().replace("quicktime", "mov");
  // Fall back to the filename's extension.
  const i = file.name.lastIndexOf(".");
  return i >= 0 ? file.name.slice(i).toLowerCase() : ".bin";
}

function monthFolder() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function uploadOne(id, it, guestName) {
  it.status = "uploading";
  it.node.classList.add("uploading");
  let blob = it.file;
  if (!it.isVideo) {
    try { blob = await compressImage(it.file); }
    catch (e) { console.warn("compress failed", e); blob = it.file; }
  }
  const ext = extFor(it.file);
  const filename = `${Date.now()}-${rand()}${ext}`;
  const path = `${STORAGE_ROOT}/${monthFolder()}/${filename}`;
  const fileRef = ref(storage, path);
  const metadata = {
    contentType: it.isVideo ? it.file.type : "image/jpeg",
    customMetadata: {
      originalName: it.file.name.slice(0, 120),
      guestName: (guestName || "").slice(0, 80),
      originalSize: String(it.file.size),
    },
  };
  await new Promise((res, rej) => {
    const task = uploadBytesResumable(fileRef, blob, metadata);
    task.on(
      "state_changed",
      (snap) => setProgress(id, (snap.bytesTransferred / snap.totalBytes) * 100),
      (err) => rej(err),
      () => res()
    );
  });
  setProgress(id, 100);
  markDone(id);
}

uploadBtn.addEventListener("click", async () => {
  if (isUploading || !items.size) return;
  isUploading = true;
  uploadBtn.disabled = true;
  refreshControls();
  try {
    await ensureAuth();
  } catch (e) {
    console.error("auth failed", e);
    showToast("Couldn't sign in — try again?", "err", 4200);
    isUploading = false;
    uploadBtn.disabled = false;
    refreshControls();
    return;
  }
  const guestName = guestNameEl.value.trim();
  // Upload in parallel but cap concurrency so phones with weak networks don't
  // collapse under 30 simultaneous PUTs. 3 at a time is the sweet spot.
  const queue = Array.from(items.entries()).filter(([, it]) => it.status === "queued");
  const concurrency = 3;
  let cursor = 0;
  let errored = 0;
  async function runOne() {
    while (cursor < queue.length) {
      const i = cursor++;
      const [id, it] = queue[i];
      try { await uploadOne(id, it, guestName); }
      catch (e) {
        console.error("upload failed", id, e);
        markError(id);
        errored++;
      }
      uploadStat.textContent = `Uploaded ${countDone()} of ${queue.length}…`;
      refreshControls();
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, runOne);
  await Promise.all(workers);
  isUploading = false;
  uploadBtn.disabled = false;
  if (errored) {
    uploadStat.textContent = `${countDone()} sent · ${errored} failed`;
    showToast(`${errored} file${errored === 1 ? "" : "s"} couldn't upload — tap Send again to retry`, "err", 4500);
  } else {
    uploadStat.textContent = "";
    successEl.classList.remove("hidden-init");
    successEl.scrollIntoView({ behavior: "smooth", block: "center" });
    // Hide upload chrome — they'll come back if they tap "Share more".
    controlsEl.classList.add("hidden-init");
    setTimeout(() => previewEl.classList.add("hidden-init"), 800);
  }
});

// "Share more" → reset to a fresh upload state without losing the guest's name.
moreBtn.addEventListener("click", () => {
  for (const it of items.values()) URL.revokeObjectURL(it.url);
  items.clear();
  previewEl.innerHTML = "";
  previewEl.classList.remove("hidden-init");
  successEl.classList.add("hidden-init");
  refreshControls();
  // Open the file picker so the next batch is one tap away.
  fileInput.click();
});
