// Share the Love — guest photo / video upload page for Charlie + Karla's
// wedding. Gallery-first layout: every visitor lands on the shared album,
// then taps the floating share button to add photos via the device camera
// (custom-UI capture) or the file picker.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject,
  listAll, getMetadata,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";
import {
  getDatabase, ref as dbRef, push as dbPush, set as dbSet, update as dbUpdate,
  remove as dbRemove, onValue, get as dbGet, query as dbQuery, limitToLast,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";

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
const db = getDatabase(app);

// === Constants ============================================================
const FEED_PATH = "wedding-photos";
const FEED_LIMIT = 240;
const DELETION_LOG_PATH = "wedding-photo-deletes";          // /<originalUid>/<autoId>
const STORAGE_ROOT = "wedding-uploads";

const MAX_IMAGE_DIM = 2400;
const IMAGE_QUALITY = 0.85;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

// === DOM ==================================================================
const $ = (id) => document.getElementById(id);

// Share modal + form
const shareModal   = $("share-modal");
const shareCard    = $("share-card");
const shareClose   = $("share-close");
const shareMain    = $("share-main");
const successEl    = $("success");
const dropzone     = $("dropzone");
const fileInput    = $("file-input");
const previewEl    = $("preview-list");
const controlsEl   = $("upload-controls");
const uploadBtn    = $("upload-btn");
const uploadLbl    = $("upload-label");
const uploadStat   = $("upload-status");
const moreBtn      = $("upload-more");
const doneBtn      = $("share-done");
const successCountdown = $("success-countdown");
const successCounter   = $("success-counter");
const successText      = $("success-text");
const guestNameEl  = $("guest-name");

// FAB
const fabWrap      = $("fab-wrap");
const fabCameraBtn = $("fab-camera");
const fabUploadBtn = $("fab-upload");
const openCameraBtn = $("open-camera-btn");

// Camera view
const cameraView   = $("camera-view");
const cameraStage  = $("camera-stage");
const cameraVideo  = $("camera-video");
const cameraFlash  = $("camera-flash");
const cameraTopFlip   = $("camera-flip");
const cameraTopClose  = $("camera-close");
const cameraShutter   = $("camera-shutter");
const cameraDone   = $("camera-done");
const cameraStrip  = $("camera-strip");
const cameraError  = $("camera-error");
const cameraErrorMsg = $("camera-error-msg");
const cameraErrorClose = $("camera-error-close");
const cameraModeWrap = $("camera-mode");
const cameraModeBtns = cameraModeWrap ? Array.from(cameraModeWrap.querySelectorAll(".cm-btn")) : [];
const cameraRecEl    = $("camera-rec");
const cameraRecTime  = $("camera-rec-time");
const cameraZoomChip = $("camera-zoom");

// Queue previewer (fullscreen review of locally-captured items before send)
const queuePrev      = $("queue-prev");
const qpStage        = $("qp-stage");
const qpCaption      = $("qp-caption");
const qpClose        = $("qp-close");
const qpRemove       = $("qp-remove");
const qpPrev         = $("qp-prev");
const qpNext         = $("qp-next");
const qpSend         = $("qp-send");
const qpSendLabel    = $("qp-send-label");

// Toast
const toastEl  = $("toast");
const toastMsg = $("toast-msg");

// Florals
const florals = Array.from(document.querySelectorAll(".floral"));

// Gallery
const galleryGrid  = $("gallery-grid");
const galleryCount = $("gallery-count");
const galleryEmpty = $("gallery-empty");

// Lightbox
const lightbox   = $("lightbox");
const lbStage    = $("lb-stage");
const lbCaption  = $("lb-caption");
const lbClose    = $("lb-close");
const lbPrev     = $("lb-prev");
const lbNext     = $("lb-next");
const lbDelete   = $("lb-delete");
const lbDownload = $("lb-download");
const lbShare    = $("lb-share");
const lbStrip    = $("lb-strip");

// Confirm modal
const confirmModal = $("confirm-modal");
const confirmTitle = $("confirm-title");
const confirmMsg   = $("confirm-msg");
const modalCancel  = $("modal-cancel");
const modalConfirm = $("modal-confirm");

// Name onboarding modal
const nameModal      = $("name-modal");
const nameModalInput = $("name-modal-input");
const nameModalSkip  = $("name-modal-skip");
const nameModalSave  = $("name-modal-save");

// Notification banner (admin deletion log)
const notifyBanner   = $("notify-banner");
const notifyText     = $("notify-text");
const notifyDismiss  = $("notify-dismiss");

// Drag-over overlay
const dropover = $("dropover");

// === Florals stagger ======================================================
florals.forEach((el, i) => setTimeout(() => el.classList.add("in"), 120 + i * 90));

// === Guest name persistence ===============================================
// First-time visitors get a tiny modal asking who they are. After that the
// name lives in localStorage and is auto-applied to every upload + auto-
// written to storage customMetadata.guestName (the existing upload flow
// already reads from guestNameEl.value).
const NAME_KEY = "stl:guest-name";

function savedGuestName() {
  return (localStorage.getItem(NAME_KEY) || "").trim();
}
function persistGuestName(name) {
  const trimmed = (name || "").trim().slice(0, 80);
  if (trimmed) localStorage.setItem(NAME_KEY, trimmed);
  else         localStorage.removeItem(NAME_KEY);
  guestNameEl.value = trimmed;
}

function openNameModal() {
  nameModalInput.value = savedGuestName();
  nameModal.classList.add("open");
  nameModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  setTimeout(() => nameModalInput.focus(), 320);
}
function closeNameModal() {
  nameModal.classList.remove("open");
  nameModal.setAttribute("aria-hidden", "true");
  if (!lightbox.classList.contains("open") &&
      !shareModal.classList.contains("open") &&
      !cameraView.classList.contains("open") &&
      !confirmModal.classList.contains("open")) {
    document.body.style.overflow = "";
  }
}

nameModalSave.addEventListener("click", () => {
  persistGuestName(nameModalInput.value);
  closeNameModal();
});
nameModalSkip.addEventListener("click", closeNameModal);
nameModalInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    persistGuestName(nameModalInput.value);
    closeNameModal();
  }
});
nameModal.addEventListener("click", (e) => {
  if (e.target === nameModal) closeNameModal();
});

// Prefill the share-modal name input from storage and keep them synced.
guestNameEl.value = savedGuestName();
guestNameEl.addEventListener("blur", () => persistGuestName(guestNameEl.value));

// Show the onboarding modal once for new visitors (delay so the page eases
// in first instead of slamming a modal in their face).
if (!savedGuestName()) {
  setTimeout(openNameModal, 700);
}

// === State ================================================================
const items = new Map();                                    // id → preview file state
let isUploading = false;

// Admin mode — Charlie's escape hatch. Visit ?admin=1 once, sticky after.
const params = new URLSearchParams(location.search);
if (params.get("admin") === "1") localStorage.setItem("stl:admin", "1");
if (params.get("admin") === "0") localStorage.removeItem("stl:admin");
const IS_ADMIN = localStorage.getItem("stl:admin") === "1";

function rand() { return Math.random().toString(36).slice(2, 10); }

// Strictly unique IDs — `Date.now()-rand()` could collide if two captures
// happened in the same millisecond AND rand()'s base36 truncation aligned.
// crypto.randomUUID is supported in Safari 15.4+, Chrome 92+, FF 95+ — fall
// back to a doubled-rand if unavailable so old browsers still get uniqueness.
function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${rand()}${rand()}${rand()}`;
}

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
  const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", IMAGE_QUALITY));
  if (!blob || blob.size >= file.size) return file;
  return blob;
}

// === Thumbnails ===========================================================
function addThumb(file) {
  const id = uid();
  const url = URL.createObjectURL(file);
  const isVideo = file.type.startsWith("video/");
  const node = document.createElement("div");
  node.className = "thumb";
  node.dataset.id = id;
  node.innerHTML = `
    ${isVideo
      ? `<video src="${url}" muted playsinline preload="auto"></video>
         <div class="thumb-video-tag" aria-hidden="true"><span class="material-symbols-outlined">videocam</span></div>
         <div class="thumb-play" aria-hidden="true"><span class="material-symbols-outlined">play_arrow</span></div>`
      : `<img src="${url}" alt="${escAttr(file.name)}">`}
    <div class="remove" title="Remove">
      <span class="material-symbols-outlined" style="font-size:16px">close</span>
    </div>
    <div class="progress"><div class="progress-fill"></div></div>
    <div class="check">
      <span class="material-symbols-outlined" style="font-size:32px;font-variation-settings:'FILL' 1">check</span>
    </div>
  `;
  previewEl.appendChild(node);
  node.querySelector(".remove").addEventListener("click", (e) => {
    e.stopPropagation();
    removeItem(id);
  });
  // Tap the thumb anywhere except the remove X = open fullscreen preview.
  node.style.cursor = "zoom-in";
  node.addEventListener("click", (e) => {
    if (e.target.closest(".remove")) return;
    openQueuePrev(id);
  });
  items.set(id, { file, blob: file, url, status: "queued", pct: 0, node, isVideo });
  refreshControls();
  return id;
}

function removeItem(id) {
  const it = items.get(id);
  if (!it || it.status === "uploading") return;
  URL.revokeObjectURL(it.url);
  it.node.remove();
  items.delete(id);
  refreshControls();
}

// Kind-aware counting + labels — so the share modal, upload button, and
// success text say "video" / "videos" / "photo" / "photos" / "moments"
// instead of always defaulting to "photo".
function countByKind() {
  let p = 0, v = 0;
  for (const it of items.values()) { if (it.isVideo) v++; else p++; }
  return { p, v, total: p + v };
}
function kindNounPhrase({ p, v, total }) {
  if (v === 0) return total === 1 ? "photo"  : "photos";
  if (p === 0) return total === 1 ? "video"  : "videos";
  return "moments";
}

function refreshControls() {
  const n = items.size;
  if (n === 0) {
    controlsEl.classList.add("hidden-init");
    return;
  }
  controlsEl.classList.remove("hidden-init");
  const counts = countByKind();
  uploadLbl.textContent = isUploading
    ? `Sending… ${countDone()}/${n}`
    : `Send ${n} ${kindNounPhrase(counts)} to our album`;
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

function resetUploadState() {
  for (const it of items.values()) URL.revokeObjectURL(it.url);
  items.clear();
  previewEl.innerHTML = "";
  successEl.classList.add("hidden-init");
  shareMain.classList.remove("hidden-init");
  controlsEl.classList.add("hidden-init");
  uploadStat.textContent = "";
  uploadBtn.disabled = false;
  cancelSuccessCountdown();
}

// Auto-dismiss the success state after 5s so guests land back on the gallery
// without needing to tap Done. Cancelled the moment they interact (Share more,
// Done, X, or background tap).
let _countdownTimer = null;
function startSuccessCountdown() {
  cancelSuccessCountdown();
  let n = 5;
  if (successCounter) successCounter.textContent = String(n);
  if (successCountdown) successCountdown.style.display = "";
  _countdownTimer = setInterval(() => {
    n--;
    if (successCounter) successCounter.textContent = String(Math.max(n, 0));
    if (n <= 0) {
      cancelSuccessCountdown();
      closeShareModal();
    }
  }, 1000);
}
function cancelSuccessCountdown() {
  if (_countdownTimer) clearInterval(_countdownTimer);
  _countdownTimer = null;
  if (successCountdown) successCountdown.style.display = "none";
}

// === File ingest + drag-drop =============================================
function ingestFiles(fileList) {
  let accepted = 0;
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
    accepted++;
  }
  return accepted;
}

fileInput.addEventListener("change", () => {
  if (fileInput.files?.length) {
    if (successEl.classList.contains("hidden-init") === false) resetUploadState();
    const n = ingestFiles(fileInput.files);
    fileInput.value = "";
    if (n) openShareModal();
  }
});

// Drag-anywhere drop overlay — show when files are dragged over the window,
// drop ingests + opens the share modal.
let _dragDepth = 0;
function isFileDrag(e) {
  return e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
}
window.addEventListener("dragenter", (e) => {
  if (!isFileDrag(e)) return;
  _dragDepth++;
  dropover.classList.add("show");
});
window.addEventListener("dragleave", () => {
  _dragDepth = Math.max(0, _dragDepth - 1);
  if (_dragDepth === 0) dropover.classList.remove("show");
});
window.addEventListener("dragover", (e) => { if (isFileDrag(e)) e.preventDefault(); });
window.addEventListener("drop", (e) => {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  _dragDepth = 0;
  dropover.classList.remove("show");
  if (e.dataTransfer.files?.length) {
    if (successEl.classList.contains("hidden-init") === false) resetUploadState();
    const n = ingestFiles(e.dataTransfer.files);
    if (n) openShareModal();
  }
});

// === Share modal control ==================================================
function openShareModal({ resetState = false } = {}) {
  // If the success card lingered from a prior upload (e.g. user dismissed via
  // the X), reopen lands on a clean form rather than the leftover thank-you.
  if (resetState || !successEl.classList.contains("hidden-init")) resetUploadState();
  shareModal.classList.add("open");
  shareModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function closeShareModal() {
  cancelSuccessCountdown();
  shareModal.classList.remove("open");
  shareModal.setAttribute("aria-hidden", "true");
  if (!lightbox.classList.contains("open") && !cameraView.classList.contains("open")) {
    document.body.style.overflow = "";
  }
  // If the upload finished (success card visible), wipe state once the
  // slide-out animation finishes so the next open is a clean slate.
  if (!successEl.classList.contains("hidden-init")) {
    setTimeout(() => { if (!shareModal.classList.contains("open")) resetUploadState(); }, 480);
  }
}
shareClose.addEventListener("click", closeShareModal);
shareModal.addEventListener("click", (e) => { if (e.target === shareModal) closeShareModal(); });

fabUploadBtn.addEventListener("click", () => openShareModal());
fabCameraBtn.addEventListener("click", () => {
  openShareModal();
  openCamera();
});
openCameraBtn.addEventListener("click", () => openCamera());

doneBtn.addEventListener("click", () => closeShareModal());

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
  if (file.type.startsWith("image/")) return ".jpg";
  const m = /^video\/([a-z0-9]+)$/i.exec(file.type);
  if (m) return "." + m[1].toLowerCase().replace("quicktime", "mov");
  const i = file.name.lastIndexOf(".");
  return i >= 0 ? file.name.slice(i).toLowerCase() : ".bin";
}

function monthFolder() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Extract a poster frame from a video File so the gallery can show a real
// preview before the <video> element has fetched metadata. Seeks to ~0.25s
// to skip any all-black opening frame. Returns null on any failure — caller
// just falls back to the bare <video> tile.
async function extractVideoPoster(file) {
  try {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.src = url;
    await new Promise((res, rej) => {
      video.onloadedmetadata = res;
      video.onerror = rej;
      setTimeout(rej, 8000);
    });
    const target = Math.min(0.25, (video.duration || 1) * 0.05);
    await new Promise((res, rej) => {
      video.onseeked = res;
      video.onerror = rej;
      try { video.currentTime = target; } catch (e) { rej(e); }
      setTimeout(rej, 6000);
    });
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) { URL.revokeObjectURL(url); return null; }
    const scale = Math.min(1, 800 / Math.max(w, h));
    const cw = Math.round(w * scale), ch = Math.round(h * scale);
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, cw, ch);
    URL.revokeObjectURL(url);
    return await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.82));
  } catch (e) {
    console.warn("poster extraction failed", e);
    return null;
  }
}

// Uploads bytes to storage and returns the prepared feed entry. The caller
// (uploadBtn handler) collects every entry then writes them all in a SINGLE
// atomic dbUpdate() — previously each uploadOne wrote its own feed entry in
// parallel, which on some networks was silently dropping all-but-one write
// even though the storage bytes all landed. Atomic update guarantees the
// gallery sees every successful upload.
async function uploadOne(id, it, guestName) {
  it.status = "uploading";
  it.node.classList.add("uploading");
  let blob = it.file;
  if (!it.isVideo) {
    try { blob = await compressImage(it.file); }
    catch (e) { console.warn("compress failed", e); blob = it.file; }
  }
  const ext = extFor(it.file);
  const filename = `${Date.now()}-${uid()}${ext}`;
  const path = `${STORAGE_ROOT}/${monthFolder()}/${filename}`;
  const fileRef = ref(storage, path);

  // For videos, extract a poster frame first and upload it as a sibling
  // .jpg under the same basename so gallery tiles render instantly. Poster
  // URL gets stamped onto the video's customMetadata.posterUrl so the
  // gallery refresh picks it up without an extra fetch.
  let posterUrl = "";
  if (it.isVideo) {
    try {
      const posterBlob = await extractVideoPoster(it.file);
      if (posterBlob) {
        const posterFilename = filename.replace(/\.[^.]+$/, "") + ".poster.jpg";
        const posterPath = `${STORAGE_ROOT}/${monthFolder()}/${posterFilename}`;
        const posterRef = ref(storage, posterPath);
        await new Promise((res, rej) => {
          const t = uploadBytesResumable(posterRef, posterBlob, {
            contentType: "image/jpeg",
            customMetadata: { kind: "poster", uid: auth.currentUser?.uid || "" },
          });
          t.on("state_changed", null, rej, res);
        });
        posterUrl = await getDownloadURL(posterRef);
      }
    } catch (e) {
      console.warn("poster upload failed (continuing without)", e);
    }
  }

  const metadata = {
    contentType: it.isVideo ? it.file.type : "image/jpeg",
    customMetadata: {
      originalName: it.file.name.slice(0, 120),
      guestName: (guestName || "").slice(0, 80),
      originalSize: String(it.file.size),
      uid: auth.currentUser?.uid || "",
      ...(posterUrl ? { posterUrl } : {}),
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
  const url = await getDownloadURL(fileRef);
  const feedKey = filename.replace(/[.#$/\[\]]/g, "_");
  const entry = {
    url,
    name: it.file.name.slice(0, 120),
    guest: (guestName || "").slice(0, 80),
    ts: Date.now(),
    isVideo: it.isVideo,
    path,
    uid: auth.currentUser?.uid || "",
    ...(posterUrl ? { posterUrl } : {}),
  };
  markDone(id);
  return { feedKey, entry };
}

uploadBtn.addEventListener("click", async () => {
  if (isUploading || !items.size) return;
  isUploading = true;
  uploadBtn.disabled = true;
  refreshControls();
  let queue = [];
  let errored = 0;
  let feedSyncOK = true;
  const successResults = [];
  try {
    try {
      await ensureAuth();
    } catch (e) {
      console.error("auth failed", e);
      showToast("Couldn't sign in — try again?", "err", 4200);
      return;                                              // finally still runs
    }
    const guestName = guestNameEl.value.trim();
    if (guestName) persistGuestName(guestName);
    queue = Array.from(items.entries()).filter(([, it]) => it.status === "queued");
    const concurrency = 3;
    let cursor = 0;
    async function runOne() {
      while (cursor < queue.length) {
        const i = cursor++;
        const [id, it] = queue[i];
        try {
          const result = await uploadOne(id, it, guestName);
          successResults.push(result);
        } catch (e) {
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

    // RTDB feed entries are supplementary — storage customMetadata is the
    // source of truth (see refreshFeedNow). Each dbUpdate attempt is timeout-
    // raced at 3s so a flaky RTDB connection can never hang the UI. Even if
    // every attempt fails, the gallery still picks the new tiles up from
    // storage on the next poll, so we still surface success to the user.
    if (successResults.length) {
      const updates = {};
      for (const { feedKey, entry } of successResults) {
        updates[`${FEED_PATH}/${feedKey}`] = entry;
      }
      feedSyncOK = false;
      for (let attempt = 0; attempt < 3 && !feedSyncOK; attempt++) {
        try {
          await Promise.race([
            dbUpdate(dbRef(db), updates),
            new Promise((_, rej) => setTimeout(() => rej(new Error("rtdb timeout")), 3000)),
          ]);
          feedSyncOK = true;
        } catch (e) {
          console.warn(`feed batch update attempt ${attempt + 1} failed`, e);
          if (attempt < 2) await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        }
      }
      if (!feedSyncOK) console.warn("rtdb feed sync gave up — gallery will sync from storage");
    }
  } finally {
    // Guaranteed UI reset, even if any await above hangs or throws.
    isUploading = false;
    uploadBtn.disabled = false;
    if (errored && errored === (queue.length || 0)) {
      // Everything failed — keep the user in the form so they can retry.
      uploadStat.textContent = `0 sent · ${errored} failed`;
      showToast(`Upload failed — check your connection and try again`, "err", 4500);
      refreshControls();
    } else if (successResults.length) {
      // At least one storage upload succeeded — show the success card.
      uploadStat.textContent = errored
        ? `${countDone()} sent · ${errored} failed`
        : "";
      if (successText) {
        let pv = 0, vv = 0;
        for (const [, it] of queue) { if (it.isVideo) vv++; else pv++; }
        const total = pv + vv;
        const noun  = kindNounPhrase({ p: pv, v: vv, total });
        const verb  = total === 1 ? "is" : "are";
        successText.textContent = `Your ${noun} ${verb} on their way to our album.`;
      }
      shareMain.classList.add("hidden-init");
      successEl.classList.remove("hidden-init");
      startSuccessCountdown();
    } else {
      refreshControls();
    }
    // Storage is source of truth — pull the bucket again so the new tiles
    // render immediately even if the RTDB sync was skipped or timed out.
    refreshFeedNow();
  }
});

// "Share more" — return to form view, keep modal open
moreBtn.addEventListener("click", () => {
  resetUploadState();
  // Optional: bounce open the file picker (commented out so user can choose camera too)
});

// === Camera (custom-UI capture) ==========================================
// Photo mode: tap shutter → canvas snapshot → JPEG file.
// Video mode: tap shutter → MediaRecorder start, tap again → stop. Audio
// track is requested only when the user switches into video mode so photo-
// only sessions don't trigger a mic permission prompt.
let _stream = null;
let _facing = "environment";
let _hasMultipleCams = false;
let _captureMode = "photo";                                 // "photo" | "video"
let _recorder = null;
let _recordChunks = [];
let _recordedBytes = 0;                                     // running sum across chunks
let _recordStartTs = 0;
let _recordTickTimer = null;
let _recordAutoStopTimer = null;
const MAX_RECORD_MS = 60_000;                               // 60s cap → ~25-40 MB
// Soft size cap: stop the recorder just before the 50 MB upload limit so
// we never discard a clip the guest actually shot. ~2 MB headroom covers
// the in-flight timeslice chunk that lands after we call stop().
const VIDEO_AUTOSTOP_BYTES = 48 * 1024 * 1024;

async function openCamera() {
  cameraError.classList.remove("show");
  cameraView.classList.add("open");
  cameraView.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  setCaptureMode("photo");
  await startCameraStream(_facing, { withAudio: false });
  // Detect multiple cameras once permission has been granted.
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === "videoinput");
    _hasMultipleCams = cams.length > 1;
    cameraTopFlip.style.display = _hasMultipleCams ? "" : "none";
  } catch {
    cameraTopFlip.style.display = "none";
  }
}

function showCameraError(msg) {
  cameraErrorMsg.textContent = msg;
  cameraError.classList.add("show");
}

async function startCameraStream(facing, { withAudio = false } = {}) {
  stopCameraStream();
  if (!navigator.mediaDevices?.getUserMedia) {
    showCameraError("Your browser doesn't support the camera here. Try uploading instead.");
    return;
  }
  try {
    const constraints = {
      audio: withAudio ? { echoCancellation: true, noiseSuppression: true } : false,
      video: {
        facingMode: { ideal: facing },
        width:  { ideal: 1920 },
        height: { ideal: 1080 },
      },
    };
    _stream = await navigator.mediaDevices.getUserMedia(constraints);
    cameraVideo.srcObject = _stream;
    // Mirror logic: a real mirror flips what you see. We honor that for any
    // camera that isn't explicitly the rear camera (selfie cam, laptop
    // webcams that report no facingMode at all). The save path also mirrors
    // when the preview does, so "what you see is what you get".
    const track = _stream.getVideoTracks?.()[0];
    const actual = track?.getSettings?.().facingMode;
    if (actual === "environment") cameraVideo.classList.remove("mirror");
    else                          cameraVideo.classList.add("mirror");
    await cameraVideo.play().catch(() => {});
    setupZoomFromStream();
  } catch (e) {
    console.warn("camera error", e);
    let msg = "We couldn't open the camera on this device.";
    if (e?.name === "NotAllowedError" || e?.name === "SecurityError") msg = "Camera permission was blocked. Enable camera access in your browser settings, or use upload instead.";
    else if (e?.name === "NotFoundError") msg = "No camera was found on this device.";
    else if (e?.name === "NotReadableError") msg = "Camera is busy in another app — close it and try again.";
    showCameraError(msg);
  }
}

function stopCameraStream() {
  if (_stream) {
    _stream.getTracks().forEach((t) => t.stop());
    _stream = null;
  }
  cameraVideo.srcObject = null;
}

function closeCamera() {
  // If a recording is in flight, abort cleanly (drop the result — closing
  // the camera implies cancel, not save).
  if (_recorder && _recorder.state === "recording") {
    try { _recorder.onstop = null; _recorder.stop(); } catch {}
  }
  stopRecordTimer();
  _recorder = null;
  _recordChunks = [];
  cameraShutter.classList.remove("recording", "video");
  cameraTopFlip.disabled = false;
  if (cameraRecEl) cameraRecEl.classList.add("hidden-init");
  if (cameraModeWrap) cameraModeWrap.style.display = "";
  resetZoom();
  stopCameraStream();
  cameraView.classList.remove("open");
  cameraView.setAttribute("aria-hidden", "true");
  // Reset capture counters + done-button state for next session
  _cameraStripCount = 0;
  _photoCount = 0;
  _videoCount = 0;
  cameraDone.disabled = true;
  cameraDone.classList.remove("active");
  cameraDone.textContent = "Done";
  renderCameraCounter();
  if (!shareModal.classList.contains("open") && !lightbox.classList.contains("open")) {
    document.body.style.overflow = "";
  }
}

cameraTopClose.addEventListener("click", closeCamera);
cameraErrorClose.addEventListener("click", () => {
  closeCamera();
  // Bounce into the file picker so they're not stuck.
  fileInput.click();
});

cameraTopFlip.addEventListener("click", async () => {
  const newFacing = _facing === "environment" ? "user" : "environment";
  const wasRecording = !!(_recorder && _recorder.state === "recording");
  // Smooth path: applyConstraints swaps cameras on the live track without
  // killing the MediaRecorder, so recording continues seamlessly across
  // the flip. Verify the physical camera actually changed (many Android
  // Chromes accept the constraint silently while keeping the same camera).
  const track = _stream?.getVideoTracks?.()[0];
  if (track && typeof track.applyConstraints === "function") {
    try {
      await track.applyConstraints({
        facingMode: { ideal: newFacing },
        width:  { ideal: 1920 },
        height: { ideal: 1080 },
      });
      const actual = track.getSettings?.().facingMode;
      if (actual === newFacing) {
        _facing = newFacing;
        if (actual === "environment") cameraVideo.classList.remove("mirror");
        else                          cameraVideo.classList.add("mirror");
        return;
      }
    } catch (e) {
      console.warn("applyConstraints flip failed, restarting stream", e);
    }
  }
  // Fallback: full stream restart. If we were mid-recording, save the
  // current clip cleanly first so the user doesn't lose their take.
  if (wasRecording) {
    showToast("Saved your clip — flipping camera", "ok", 1800);
    await stopRecording();
  }
  _facing = newFacing;
  await startCameraStream(_facing, { withAudio: _captureMode === "video" });
});

let _cameraStripCount = 0;
let _photoCount = 0;
let _videoCount = 0;

function bumpStripDone() {
  const total = _photoCount + _videoCount;
  _cameraStripCount = total;
  cameraDone.disabled = false;
  cameraDone.classList.add("active");
  cameraDone.textContent = `Done · ${total}`;
}

// The camera-strip used to render clickable thumbnails, but they implied
// a tap-to-preview that didn't exist. Replaced with simple count chips —
// camera icon + N for stills, videocam icon + N for clips. Just shows the
// user the session tally so they can decide whether to keep capturing or
// press Done.
function renderCameraCounter(justCaptured) {
  const total = _photoCount + _videoCount;
  if (total === 0) {
    cameraStrip.innerHTML = `<span class="camera-strip-placeholder">Tap to capture</span>`;
    return;
  }
  const chips = [];
  if (_photoCount > 0) {
    chips.push(
      `<div class="cs-count${justCaptured === "photo" ? " bump" : ""}" data-kind="photo" aria-label="${_photoCount} photo${_photoCount === 1 ? "" : "s"} captured">`
      + `<span class="material-symbols-outlined">photo_camera</span>`
      + `<span class="cs-n">${_photoCount}</span>`
      + `</div>`
    );
  }
  if (_videoCount > 0) {
    chips.push(
      `<div class="cs-count${justCaptured === "video" ? " bump" : ""}" data-kind="video" aria-label="${_videoCount} video${_videoCount === 1 ? "" : "s"} captured">`
      + `<span class="material-symbols-outlined">videocam</span>`
      + `<span class="cs-n">${_videoCount}</span>`
      + `</div>`
    );
  }
  cameraStrip.innerHTML = chips.join("");
}

// Rapid-tap friendly: every shutter click fires its own async pipeline. The
// previous design used a _shutterBusy gate that silently swallowed any tap
// landing while canvas.toBlob() was still encoding the prior frame — which
// is what made multi-tap sessions only register 1 photo. drawImage is
// synchronous so we capture the frame at the moment of click, then encode
// in the background.
async function capturePhoto() {
  if (!cameraVideo.videoWidth || !cameraVideo.videoHeight) return;
  const canvas = document.createElement("canvas");
  canvas.width = cameraVideo.videoWidth;
  canvas.height = cameraVideo.videoHeight;
  const ctx = canvas.getContext("2d");
  // Save mirrored when the preview is mirrored, so the photo matches what
  // the user just saw on screen ("raise left hand → left hand on left").
  if (cameraVideo.classList.contains("mirror")) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);
  cameraShutter.classList.add("busy");
  setTimeout(() => cameraShutter.classList.remove("busy"), 140);
  cameraFlash.classList.add("fire");
  setTimeout(() => cameraFlash.classList.remove("fire"), 110);
  try {
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.92));
    if (!blob) throw new Error("capture failed");
    const file = new File([blob], `camera-${uid()}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
    addThumb(file);
    _photoCount++;
    renderCameraCounter("photo");
    bumpStripDone();
  } catch (e) {
    console.error(e);
    showToast("Capture failed — try again", "err");
  }
}

// === Video recording ======================================================
// Mode toggle (Photo | Video) + MediaRecorder. Tap shutter in video mode to
// start, tap again to stop; auto-stops at MAX_RECORD_MS to keep the resulting
// file under the 50 MB upload cap.

function setCaptureMode(mode) {
  if (mode !== "photo" && mode !== "video") return;
  if (_recorder && _recorder.state === "recording") return;
  _captureMode = mode;
  cameraModeBtns.forEach((b) => {
    const on = b.dataset.mode === mode;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  cameraShutter.classList.toggle("video", mode === "video");
  cameraShutter.setAttribute("aria-label", mode === "video" ? "Record video" : "Capture photo");
}

cameraModeBtns.forEach((btn) => {
  btn.addEventListener("click", async () => {
    const next = btn.dataset.mode;
    if (next === _captureMode) return;
    setCaptureMode(next);
    // Splice audio in/out of the existing stream instead of restarting the
    // whole pipeline — avoids Chrome mobile flashing its "camera access
    // allowed" indicator every mode switch.
    const needAudio = next === "video";
    const haveAudio = !!_stream?.getAudioTracks?.().length;
    if (needAudio && !haveAudio) {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        audioStream.getAudioTracks().forEach((t) => _stream.addTrack(t));
      } catch (e) {
        console.warn("audio track add failed", e);
        showToast("Microphone unavailable — recording silent video", "err", 3000);
      }
    } else if (!needAudio && haveAudio) {
      _stream.getAudioTracks().forEach((t) => { t.stop(); _stream.removeTrack(t); });
    }
  });
});

function pickRecMime() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  const candidates = [
    "video/mp4;codecs=h264,aac",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const m of candidates) if (MediaRecorder.isTypeSupported(m)) return m;
  return "";
}

function formatRecTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function startRecordTimer() {
  if (cameraRecEl) cameraRecEl.classList.remove("hidden-init");
  if (cameraModeWrap) cameraModeWrap.style.display = "none";
  if (cameraRecTime) cameraRecTime.textContent = "0:00";
  _recordTickTimer = setInterval(() => {
    if (cameraRecTime) cameraRecTime.textContent = formatRecTime(Date.now() - _recordStartTs);
  }, 250);
}
function stopRecordTimer() {
  if (_recordTickTimer) clearInterval(_recordTickTimer);
  _recordTickTimer = null;
  if (_recordAutoStopTimer) clearTimeout(_recordAutoStopTimer);
  _recordAutoStopTimer = null;
  if (cameraRecEl) cameraRecEl.classList.add("hidden-init");
  if (cameraModeWrap) cameraModeWrap.style.display = "";
}

async function startRecording() {
  if (typeof MediaRecorder === "undefined") {
    showToast("Video recording isn't supported on this browser", "err", 4200);
    return;
  }
  if (!_stream || !_stream.getVideoTracks().length) {
    showToast("Camera not ready — try again", "err");
    return;
  }
  if (!_stream.getAudioTracks().length) {
    // Splice an audio track onto the existing stream rather than restarting,
    // so the hold-to-record path doesn't flash the camera permission
    // indicator or drop frames mid-press.
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      audioStream.getAudioTracks().forEach((t) => _stream.addTrack(t));
    } catch (e) {
      console.warn("mic permission denied — recording silent video", e);
      showToast("Recording without sound", "err", 2200);
    }
  }
  const mime = pickRecMime();
  _recordChunks = [];
  try {
    _recorder = new MediaRecorder(_stream, mime ? { mimeType: mime } : {});
  } catch (e) {
    console.error("MediaRecorder init failed", e);
    showToast("Recording not supported here", "err");
    return;
  }
  _recordedBytes = 0;
  _recorder.ondataavailable = (e) => {
    if (!e.data || !e.data.size) return;
    _recordChunks.push(e.data);
    _recordedBytes += e.data.size;
    // Soft-stop the recorder right before the 50 MB upload cap so the
    // clip the user actually shot is preserved — never discard their take.
    if (_recordedBytes >= VIDEO_AUTOSTOP_BYTES && _recorder && _recorder.state === "recording") {
      showToast("50 MB reached — saved your clip", "ok", 2400);
      try { _recorder.stop(); } catch {}
    }
  };
  _recorder.onstop = onRecordStop;
  _recorder.onerror = (e) => { console.error("recorder error", e); showToast("Recording failed", "err"); };
  // 250ms chunks: iOS Safari hands back data more reliably with timeslice.
  try { _recorder.start(250); } catch { _recorder.start(); }
  _recordStartTs = Date.now();
  cameraShutter.classList.add("recording");
  cameraTopFlip.disabled = true;
  startRecordTimer();
  _recordAutoStopTimer = setTimeout(() => {
    if (_recorder && _recorder.state === "recording") stopRecording();
  }, MAX_RECORD_MS);
}

function stopRecording() {
  return new Promise((resolve) => {
    if (!_recorder || _recorder.state !== "recording") return resolve();
    const r = _recorder;
    const prevOnStop = r.onstop;
    r.onstop = (e) => {
      if (prevOnStop) prevOnStop.call(r, e);
      resolve();
    };
    try { r.stop(); } catch (e) { console.warn("stop failed", e); resolve(); }
  });
}

function onRecordStop() {
  const rec = _recorder;
  _recorder = null;
  cameraShutter.classList.remove("recording");
  cameraTopFlip.disabled = false;
  stopRecordTimer();
  if (!_recordChunks.length) {
    showToast("No video captured — try again", "err");
    return;
  }
  const mime = rec?.mimeType || "video/webm";
  const blob = new Blob(_recordChunks, { type: mime });
  _recordChunks = [];
  const ext = mime.includes("mp4") ? ".mp4" : ".webm";
  const file = new File([blob], `camera-${uid()}${ext}`, { type: mime, lastModified: Date.now() });
  // No hard reject — the recorder auto-stops at ~48 MB so this file is
  // already within the storage budget. Keep what the guest shot.
  addThumb(file);
  _videoCount++;
  renderCameraCounter("video");
  bumpStripDone();
}

// Shutter: tap = photo (in photo mode) or start/stop recording (in video mode).
// In photo mode, holding the shutter past SHUTTER_HOLD_MS instead starts an
// ad-hoc video "snip" — release to stop. Pointer events so this works on
// both touch and mouse without double-firing via synthetic click.
const SHUTTER_HOLD_MS = 350;
let _shutterHoldTimer = null;
let _shutterHoldFired = false;

function onShutterDown(e) {
  if (e.cancelable) e.preventDefault();
  if (_recorder && _recorder.state === "recording") return;
  if (_captureMode === "video") return;                  // explicit video mode handles on up
  _shutterHoldFired = false;
  _shutterHoldTimer = setTimeout(async () => {
    _shutterHoldTimer = null;
    _shutterHoldFired = true;
    cameraShutter.classList.add("video");
    await startRecording();
  }, SHUTTER_HOLD_MS);
}

async function onShutterUp() {
  if (_shutterHoldTimer) {
    clearTimeout(_shutterHoldTimer);
    _shutterHoldTimer = null;
  }
  if (_captureMode === "video") {
    if (_recorder && _recorder.state === "recording") stopRecording();
    else await startRecording();
    return;
  }
  if (_shutterHoldFired) {
    // Was holding — stop the ad-hoc recording and revert the red shutter tint.
    if (_recorder && _recorder.state === "recording") stopRecording();
    cameraShutter.classList.remove("video");
    _shutterHoldFired = false;
    return;
  }
  // Quick tap in photo mode — take a photo.
  await capturePhoto();
}

cameraShutter.addEventListener("pointerdown", onShutterDown);
cameraShutter.addEventListener("pointerup", onShutterUp);
cameraShutter.addEventListener("pointercancel", onShutterUp);
cameraShutter.addEventListener("pointerleave", (e) => {
  // Treat dragging off-button as release so a hold doesn't get stuck.
  if (_shutterHoldTimer || _shutterHoldFired) onShutterUp(e);
});

// === Camera stage gestures: double-tap to flip + pinch to zoom ===========
// Pinch zoom uses MediaStreamTrack capabilities when the device supports
// hardware zoom (most modern phones do via ImageCapture + getCapabilities);
// otherwise falls back to a CSS transform on the <video> for soft digital
// zoom. Double-tap-anywhere-on-the-preview is a familiar phone-camera idiom
// for "flip cameras".
let _zoomMode = "none";                                   // "track" | "css" | "none"
let _zoomMin = 1, _zoomMax = 1, _zoomCurrent = 1, _zoomStep = 0.1;
let _zoomChipTimer = null;
let _pinchStartDist = 0;
let _pinchStartZoom = 1;
let _pinchActive = false;
let _stageLastTapAt = 0;

function setupZoomFromStream() {
  _zoomMode = "none"; _zoomMin = 1; _zoomMax = 1; _zoomCurrent = 1;
  cameraVideo.style.transform = cameraVideo.classList.contains("mirror") ? "scaleX(-1)" : "";
  hideZoomChip();
  const track = _stream?.getVideoTracks?.()[0];
  if (!track) return;
  try {
    const caps = typeof track.getCapabilities === "function" ? track.getCapabilities() : null;
    if (caps && typeof caps.zoom === "object" && caps.zoom !== null) {
      _zoomMode = "track";
      _zoomMin = typeof caps.zoom.min === "number" ? caps.zoom.min : 1;
      _zoomMax = typeof caps.zoom.max === "number" ? caps.zoom.max : _zoomMin;
      _zoomStep = typeof caps.zoom.step === "number" ? caps.zoom.step : 0.1;
      const settings = track.getSettings?.();
      _zoomCurrent = (settings && typeof settings.zoom === "number") ? settings.zoom : _zoomMin;
      if (_zoomMax <= _zoomMin) _zoomMode = "css";        // device reports zoom but no range
    }
  } catch { /* fall through */ }
  if (_zoomMode === "none") {
    _zoomMode = "css";                                    // soft fallback
    _zoomMin = 1; _zoomMax = 4; _zoomCurrent = 1; _zoomStep = 0.05;
  }
}

function showZoomChip() {
  if (!cameraZoomChip) return;
  cameraZoomChip.textContent = `${_zoomCurrent.toFixed(1)}x`;
  cameraZoomChip.classList.add("show");
  if (_zoomChipTimer) clearTimeout(_zoomChipTimer);
  _zoomChipTimer = setTimeout(hideZoomChip, 1200);
}
function hideZoomChip() {
  if (!cameraZoomChip) return;
  cameraZoomChip.classList.remove("show");
  if (_zoomChipTimer) { clearTimeout(_zoomChipTimer); _zoomChipTimer = null; }
}

async function applyZoom(z) {
  const clamped = Math.max(_zoomMin, Math.min(_zoomMax, z));
  _zoomCurrent = clamped;
  if (_zoomMode === "track") {
    const track = _stream?.getVideoTracks?.()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom: clamped }] });
    } catch (e) {
      console.warn("hardware zoom failed, falling back to css", e);
      _zoomMode = "css";
      cameraVideo.style.transform = `${cameraVideo.classList.contains("mirror") ? "scaleX(-1) " : ""}scale(${clamped})`;
    }
  } else {
    cameraVideo.style.transform = `${cameraVideo.classList.contains("mirror") ? "scaleX(-1) " : ""}scale(${clamped})`;
  }
  if (clamped > _zoomMin + 0.01) showZoomChip();
  else hideZoomChip();
}

function resetZoom() {
  if (_zoomMode === "css") {
    cameraVideo.style.transform = cameraVideo.classList.contains("mirror") ? "scaleX(-1)" : "";
  }
  _zoomCurrent = _zoomMin;
  hideZoomChip();
}

function pinchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

if (cameraStage) {
  cameraStage.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
      _pinchActive = true;
      _stageLastTapAt = 0;                                // pinch cancels any pending double-tap
      _pinchStartDist = pinchDistance(e.touches);
      _pinchStartZoom = _zoomCurrent;
    }
  }, { passive: true });
  cameraStage.addEventListener("touchmove", (e) => {
    if (!_pinchActive || e.touches.length < 2) return;
    if (e.cancelable) e.preventDefault();
    const dist = pinchDistance(e.touches);
    if (!_pinchStartDist) return;
    const ratio = dist / _pinchStartDist;
    applyZoom(_pinchStartZoom * ratio);
  }, { passive: false });
  cameraStage.addEventListener("touchend", (e) => {
    if (_pinchActive && e.touches.length < 2) {
      _pinchActive = false;
      _pinchStartDist = 0;
    }
  }, { passive: true });
  // Double-tap = flip cameras. Allowed even mid-recording — the flip
  // handler tries applyConstraints first so a recording can survive the
  // flip on devices that support it. Skipped while pinching or if the
  // device has only one camera.
  cameraStage.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    if (_pinchActive) return;
    if (!_hasMultipleCams) return;
    const now = Date.now();
    if (now - _stageLastTapAt < 320) {
      _stageLastTapAt = 0;
      cameraTopFlip.click();
    } else {
      _stageLastTapAt = now;
    }
  });
}

cameraDone.addEventListener("click", () => {
  closeCamera();
  shareCard.scrollTo({ top: shareCard.scrollHeight, behavior: "smooth" });
  // Auto-open the fullscreen previewer on the first queued item so guests
  // can review what they captured before sending.
  const first = items.keys().next().value;
  if (first) openQueuePrev(first);
});

// === Queue previewer =====================================================
// Fullscreen review of the local items map. Swipe / arrow nav, remove
// button per item, Send button that triggers the existing upload flow.
let _qpIds = [];
let _qpIdx = -1;
let _qpTouchX = 0;

function refreshQpSendLabel() {
  if (!qpSendLabel) return;
  const counts = countByKind();
  qpSendLabel.textContent = counts.total === 0
    ? "Send"
    : `Send ${counts.total} ${kindNounPhrase(counts)}`;
}

function openQueuePrev(startId) {
  _qpIds = Array.from(items.keys());
  if (!_qpIds.length) return;
  const i = startId ? _qpIds.indexOf(startId) : 0;
  _qpIdx = i < 0 ? 0 : i;
  paintQueuePrev();
  refreshQpSendLabel();
  queuePrev.classList.add("open");
  queuePrev.setAttribute("aria-hidden", "false");
  lockPageScroll();
}

function closeQueuePrev() {
  queuePrev.classList.remove("open");
  queuePrev.setAttribute("aria-hidden", "true");
  qpStage.innerHTML = "";
  _qpIdx = -1;
  _qpIds = [];
  // Don't fully unlock if the share modal is keeping the lock — share modal
  // owns body overflow via its own open class.
  if (!shareModal.classList.contains("open") && !cameraView.classList.contains("open")) {
    unlockPageScroll();
  } else {
    _lbScrollY = -1;
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
  }
}

function paintQueuePrev() {
  if (_qpIdx < 0 || _qpIdx >= _qpIds.length) { closeQueuePrev(); return; }
  const id = _qpIds[_qpIdx];
  const it = items.get(id);
  if (!it) {
    _qpIds.splice(_qpIdx, 1);
    if (!_qpIds.length) { closeQueuePrev(); return; }
    if (_qpIdx >= _qpIds.length) _qpIdx = _qpIds.length - 1;
    paintQueuePrev();
    return;
  }
  qpStage.innerHTML = it.isVideo
    ? `<video src="${escHtml(it.url)}" controls autoplay playsinline></video>`
    : `<img src="${escHtml(it.url)}" alt="">`;
  qpCaption.textContent = `${_qpIdx + 1} / ${_qpIds.length}`;
}

function qpNav(delta) {
  if (!_qpIds.length) return;
  _qpIdx = (_qpIdx + delta + _qpIds.length) % _qpIds.length;
  paintQueuePrev();
}

function qpRemoveCurrent() {
  if (_qpIdx < 0) return;
  const id = _qpIds[_qpIdx];
  removeItem(id);                                          // also revokes URL, deletes thumb
  _qpIds.splice(_qpIdx, 1);
  refreshQpSendLabel();
  if (!_qpIds.length) { closeQueuePrev(); return; }
  if (_qpIdx >= _qpIds.length) _qpIdx = _qpIds.length - 1;
  paintQueuePrev();
}

qpClose.addEventListener("click", closeQueuePrev);
qpPrev.addEventListener("click", () => qpNav(-1));
qpNext.addEventListener("click", () => qpNav(1));
qpRemove.addEventListener("click", qpRemoveCurrent);
qpSend.addEventListener("click", () => {
  if (!items.size) { closeQueuePrev(); return; }
  closeQueuePrev();
  // Fire the existing upload path so the rest of the flow (success card,
  // countdown, gallery refresh) stays intact.
  uploadBtn.click();
});

// Swipe left/right on stage to nav (mirrors lightbox behavior).
qpStage.addEventListener("touchstart", (e) => { _qpTouchX = e.touches[0].clientX; }, { passive: true });
qpStage.addEventListener("touchend", (e) => {
  const dx = e.changedTouches[0].clientX - _qpTouchX;
  if (Math.abs(dx) > 48) qpNav(dx < 0 ? 1 : -1);
}, { passive: true });

document.addEventListener("keydown", (e) => {
  if (!queuePrev.classList.contains("open")) return;
  if (e.key === "Escape") closeQueuePrev();
  else if (e.key === "ArrowLeft") qpNav(-1);
  else if (e.key === "ArrowRight") qpNav(1);
});

// === Gallery + lightbox ===================================================
let _feed = [];
let _renderedIds = new Set();
let _lightboxIdx = -1;

function escHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
function escAttr(s) { return escHtml(s); }

// Deterministic avatar color per guest name so the same person always gets
// the same chip color across tiles. Brand-friendly palette.
const AVATAR_COLORS = ["#7b8a5b", "#b29554", "#d8a7a0", "#5e6b44", "#a36d5a", "#7896a8"];
function avatarColor(name) {
  let h = 0;
  const s = String(name || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function avatarInitial(name) {
  const s = String(name || "").trim();
  return s ? s.charAt(0).toUpperCase() : "·";
}
function formatAbsoluteTime(ts) {
  if (!ts) return "";
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === y.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay)     return time;
  if (isYesterday) return `Yesterday ${time}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  const dateStr = d.toLocaleDateString(undefined,
    sameYear ? { month: "short", day: "numeric" }
             : { month: "short", day: "numeric", year: "numeric" });
  return `${dateStr} ${time}`;
}

function formatRelativeTime(ts) {
  if (!ts) return "";
  const diff = Date.now() - Number(ts);
  if (!Number.isFinite(diff) || diff < 0) return "just now";
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) {
    // Round to nearest 10s so the label doesn't flicker every render
    const bucket = Math.max(10, Math.floor(sec / 10) * 10);
    return `${bucket}s ago`;
  }
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  const wk = Math.floor(day / 7);
  if (wk < 4) return `${wk} wk ago`;
  const d = new Date(Number(ts));
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function renderGuestChip(name, ts) {
  const time = formatRelativeTime(ts);
  return `<div class="guest-chip">`
    + `<div class="guest-avatar" style="background:${avatarColor(name)}">${escHtml(avatarInitial(name))}</div>`
    + `<div class="guest-meta">`
    + `<span class="guest-name-label">${escHtml(name)}</span>`
    + (time ? `<span class="guest-time-label" data-ts="${ts || ""}">${escHtml(time)}</span>` : "")
    + `</div>`
    + `</div>`;
}

function renderLightboxCaption(entry) {
  const out = [];
  if (entry.guest) {
    out.push(`<div class="lb-avatar" style="background:${avatarColor(entry.guest)}">${escHtml(avatarInitial(entry.guest))}</div>`);
    out.push(`<span class="lb-name">${escHtml(entry.guest)}</span>`);
  }
  if (entry.ts) {
    if (entry.guest) out.push(`<span class="lb-dot"></span>`);
    out.push(
      `<span class="lb-time-block">`
      + `<span class="material-symbols-outlined">schedule</span>`
      + `<span data-ts="${entry.ts}">${escHtml(formatRelativeTime(entry.ts))}</span>`
      + `</span>`
    );
    out.push(`<span class="lb-dot"></span>`);
    out.push(`<span class="lb-time-block">${escHtml(formatAbsoluteTime(entry.ts))}</span>`);
  }
  out.push(`<span class="lb-counter">${_lightboxIdx + 1} / ${_feed.length}</span>`);
  return out.join("");
}

// Keep relative timestamps fresh without re-rendering the whole gallery.
// 20s tick covers the "10s/20s ago" buckets without flickering on minutes+.
// Selector catches both the gallery chip (.guest-time-label) and the
// lightbox caption span — anything with data-ts.
setInterval(() => {
  document.querySelectorAll("[data-ts]").forEach((el) => {
    const ts = Number(el.dataset.ts);
    if (Number.isFinite(ts) && ts > 0) el.textContent = formatRelativeTime(ts);
  });
}, 20_000);

function renderGallery() {
  if (!_feed.length) {
    galleryGrid.innerHTML = "";
    galleryEmpty.classList.remove("hidden-init");
    galleryCount.textContent = "";
    return;
  }
  galleryEmpty.classList.add("hidden-init");
  galleryCount.textContent = `${_feed.length} ${_feed.length === 1 ? "moment" : "moments"} shared`;

  const seen = new Set();
  for (const entry of _feed) {
    seen.add(entry.id);
    let tile = galleryGrid.querySelector(`[data-feed-id="${entry.id}"]`);
    if (tile) continue;
    tile = document.createElement("div");
    tile.className = "gallery-item";
    tile.dataset.feedId = entry.id;
    const mediaHtml = entry.isVideo
      ? (entry.posterUrl
          ? `<img src="${escHtml(entry.posterUrl)}" alt="${escHtml(entry.name || "wedding video")}" loading="lazy">`
          : `<video src="${escHtml(entry.url)}" preload="metadata" muted playsinline></video>`)
        + `<div class="video-badge" aria-hidden="true"><span class="material-symbols-outlined" style="font-variation-settings:'FILL' 1">play_arrow</span></div>`
      : `<img src="${escHtml(entry.url)}" alt="${escHtml(entry.name || "wedding photo")}" loading="lazy">`;
    const tag = entry.guest ? renderGuestChip(entry.guest, entry.ts) : "";
    const isOwn = entry.uid && entry.uid === auth.currentUser?.uid;
    const canDelete = isOwn || IS_ADMIN;
    const deleteBtn = canDelete
      ? `<button class="tile-delete" data-delete-id="${entry.id}" aria-label="Remove this upload" title="Remove">
           <span class="material-symbols-outlined" style="font-size:18px">delete</span>
         </button>`
      : "";
    tile.innerHTML = mediaHtml + tag + deleteBtn;
    // (no auto-prune on img error — storage is the source of truth; if a tile
    // shows a broken image it's transient, not a reason to delete anything)
    tile.addEventListener("click", (e) => {
      if (e.target.closest("[data-delete-id]")) return;
      openLightbox(entry.id);
    });
    const delEl = tile.querySelector("[data-delete-id]");
    if (delEl) delEl.addEventListener("click", (e) => {
      e.stopPropagation();
      askDelete(entry.id);
    });
    galleryGrid.appendChild(tile);
    _renderedIds.add(entry.id);
  }
  Array.from(galleryGrid.children).forEach((tile) => {
    if (!seen.has(tile.dataset.feedId)) tile.remove();
  });
  for (let i = _feed.length - 1; i >= 0; i--) {
    const id = _feed[i].id;
    const tile = galleryGrid.querySelector(`[data-feed-id="${id}"]`);
    if (tile && galleryGrid.firstChild !== tile) {
      galleryGrid.insertBefore(tile, galleryGrid.firstChild);
    }
  }
}

// === Gallery feed — STORAGE IS THE SOURCE OF TRUTH =======================
// We had endless trouble with RTDB feed entries getting out of sync with the
// actual storage bucket (listener silently stopping, parallel writes dropping,
// etc.). New approach: directly list the storage bucket on every refresh.
// Files in storage = tiles in gallery. Period. No RTDB feed reads. RTDB is
// kept only for the per-uploader deletion log + uid attribution metadata,
// which now lives in storage customMetadata too.
//
// Caching: getDownloadURL + getMetadata are cached by path so repeat polls
// are cheap — only NEW files in the bucket trigger fresh fetches.
const _storageCache = new Map();                            // path → { url, meta }
let _isRefreshing = false;

async function refreshFeedNow() {
  if (_isRefreshing) return;
  _isRefreshing = true;
  try {
    const root = await listAll(ref(storage, STORAGE_ROOT));
    const allRefs = [];
    for (const monthRef of root.prefixes) {
      try {
        const month = await listAll(monthRef);
        allRefs.push(...month.items);
      } catch (e) {
        console.warn("listAll month failed", monthRef.fullPath, e);
      }
    }
    const entries = [];
    await Promise.all(allRefs.map(async (item) => {
      try {
        if (!_storageCache.has(item.fullPath)) {
          const [url, meta] = await Promise.all([getDownloadURL(item), getMetadata(item)]);
          _storageCache.set(item.fullPath, { url, meta });
        }
        const { url, meta } = _storageCache.get(item.fullPath);
        // Poster sidecars (<basename>.poster.jpg) aren't their own tiles —
        // they're attached to the parent video via customMetadata.posterUrl.
        if (meta.customMetadata?.kind === "poster" || /\.poster\.jpg$/i.test(item.name)) return;
        const id = item.name.replace(/[.#$/\[\]]/g, "_");
        entries.push({
          id,
          url,
          path: item.fullPath,
          name: meta.customMetadata?.originalName || item.name,
          guest: meta.customMetadata?.guestName || "",
          ts: new Date(meta.timeCreated).getTime() || 0,
          isVideo: !(meta.contentType?.startsWith("image/")),
          uid: meta.customMetadata?.uid || "",
          posterUrl: meta.customMetadata?.posterUrl || "",
        });
      } catch (e) {
        console.warn("failed to load entry", item.fullPath, e);
      }
    }));
    entries.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    _feed = entries;
    renderGallery();
  } catch (e) {
    console.error("refreshFeedNow failed", e);
  } finally {
    _isRefreshing = false;
  }
}

function subscribeFeed() {
  // First load + polling loop. Storage is authoritative — no RTDB listener.
  refreshFeedNow();
  setInterval(refreshFeedNow, 8000);
}

// Lightbox enforces full lock-in: the page behind cannot scroll, swipes
// up/down don't bleed through (touch-action:none on .lightbox.open), and
// the only way out is the X button or Escape. Background tap-to-dismiss
// is intentionally NOT wired so a stray finger on the gutter doesn't
// kick the user out mid-album-browse.
let _lbScrollY = -1;

function lockPageScroll() {
  if (_lbScrollY >= 0) return;
  _lbScrollY = window.scrollY || window.pageYOffset || 0;
  // position:fixed beats overflow:hidden on iOS, which still rubber-bands
  // with the latter. Restore the exact scroll Y on unlock.
  document.body.style.position = "fixed";
  document.body.style.top = `-${_lbScrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
  document.body.style.overflow = "hidden";
}
function unlockPageScroll() {
  if (_lbScrollY < 0) return;
  const y = _lbScrollY;
  _lbScrollY = -1;
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  document.body.style.overflow = "";
  // Skip smooth scroll so it snaps back instantly
  const prev = document.documentElement.style.scrollBehavior;
  document.documentElement.style.scrollBehavior = "auto";
  window.scrollTo(0, y);
  document.documentElement.style.scrollBehavior = prev;
}

function openLightbox(id) {
  const idx = _feed.findIndex((e) => e.id === id);
  if (idx < 0) return;
  _lightboxIdx = idx;
  paintLightbox();
  lightbox.classList.add("open");
  lightbox.setAttribute("aria-hidden", "false");
  lockPageScroll();
}

function closeLightbox() {
  lightbox.classList.remove("open");
  lightbox.setAttribute("aria-hidden", "true");
  // Only unlock if no other modal is keeping the page locked.
  if (!shareModal.classList.contains("open") && !cameraView.classList.contains("open")) {
    unlockPageScroll();
  } else {
    // Reset any inline body styles set by the lock so the share/camera
    // modal's own overflow:hidden behavior takes over cleanly.
    _lbScrollY = -1;
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
  }
  lbStage.innerHTML = "";
  _lightboxIdx = -1;
}

function paintLightbox() {
  const entry = _feed[_lightboxIdx];
  if (!entry) { closeLightbox(); return; }
  lbStage.innerHTML = entry.isVideo
    ? `<video src="${escHtml(entry.url)}"${entry.posterUrl ? ` poster="${escHtml(entry.posterUrl)}"` : ""} controls autoplay playsinline></video>`
    : `<img src="${escHtml(entry.url)}" alt="${escHtml(entry.name || "")}">`;
  lbCaption.innerHTML = renderLightboxCaption(entry);
  const isOwn = entry.uid && entry.uid === auth.currentUser?.uid;
  const canDelete = isOwn || IS_ADMIN;
  lbDelete.dataset.feedId = entry.id;
  if (canDelete) lbDelete.classList.remove("hidden-init");
  else           lbDelete.classList.add("hidden-init");
  // Strip: render once, then just update active highlight + scroll into view.
  if (lbStrip.childElementCount !== _feed.length) buildLbStrip();
  for (const el of lbStrip.children) {
    el.classList.toggle("active", Number(el.dataset.idx) === _lightboxIdx);
  }
  const active = lbStrip.querySelector(".lb-strip-thumb.active");
  if (active) active.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
}

function buildLbStrip() {
  lbStrip.innerHTML = "";
  _feed.forEach((entry, idx) => {
    const t = document.createElement("button");
    t.type = "button";
    t.className = "lb-strip-thumb";
    t.dataset.idx = String(idx);
    t.innerHTML = entry.isVideo
      ? (entry.posterUrl
          ? `<img src="${escHtml(entry.posterUrl)}" alt="" loading="lazy">`
          : `<video src="${escHtml(entry.url)}" muted playsinline preload="metadata"></video>`)
      : `<img src="${escHtml(entry.url)}" alt="" loading="lazy">`;
    t.addEventListener("click", () => {
      _lightboxIdx = idx;
      paintLightbox();
    });
    lbStrip.appendChild(t);
  });
}

async function downloadCurrent() {
  const entry = _feed[_lightboxIdx];
  if (!entry) return;
  lbDownload.disabled = true;
  const label = lbDownload.innerHTML;
  lbDownload.innerHTML = `<span class="material-symbols-outlined" style="font-size:20px">hourglass_top</span>`;
  try {
    // fetch → blob so the browser uses our chosen filename instead of opening
    // the Firebase Storage URL inline. Storage signed URLs allow GET CORS.
    const resp = await fetch(entry.url);
    if (!resp.ok) throw new Error("download failed: " + resp.status);
    const blob = await resp.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = entry.name || (entry.isVideo ? "wedding-video.mp4" : "wedding-photo.jpg");
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  } catch (e) {
    console.warn("download failed, falling back to new-tab", e);
    window.open(entry.url, "_blank", "noopener,noreferrer");
  } finally {
    lbDownload.disabled = false;
    lbDownload.innerHTML = label;
  }
}

lbDownload.addEventListener("click", downloadCurrent);

// === Native share =========================================================
// Pipes the current item through navigator.share with the file attached so
// iOS/Android open their native share sheet (Messages, WhatsApp, AirDrop,
// Photos, etc). Falls through to URL-only share, then to clipboard.
async function shareCurrent() {
  const entry = _feed[_lightboxIdx];
  if (!entry || !lbShare) return;
  lbShare.disabled = true;
  const label = lbShare.innerHTML;
  lbShare.innerHTML = `<span class="material-symbols-outlined" style="font-size:20px">hourglass_top</span>`;
  const filename = entry.name || (entry.isVideo ? "wedding-video.mp4" : "wedding-photo.jpg");
  const text = entry.guest
    ? `From Charlie & Karla's wedding album · shared by ${entry.guest}`
    : `From Charlie & Karla's wedding album ♡`;
  try {
    // Best path: share the actual file so the recipient gets the media,
    // not just a Firebase Storage URL that may expire or strip metadata.
    if (navigator.canShare && navigator.share) {
      try {
        const resp = await fetch(entry.url);
        if (resp.ok) {
          const blob = await resp.blob();
          const file = new File([blob], filename, { type: blob.type || (entry.isVideo ? "video/mp4" : "image/jpeg") });
          const data = { files: [file], title: "Wedding moment", text };
          if (navigator.canShare(data)) {
            await navigator.share(data);
            return;
          }
        }
      } catch (e) {
        if (e?.name === "AbortError") return;                  // user cancelled
        console.warn("file share failed, falling back to URL share", e);
      }
    }
    // Fallback 1: URL share (no file attachment).
    if (navigator.share) {
      try {
        await navigator.share({ title: "Wedding moment", text, url: entry.url });
        return;
      } catch (e) {
        if (e?.name === "AbortError") return;
        console.warn("url share failed", e);
      }
    }
    // Fallback 2: copy URL to clipboard.
    try {
      await navigator.clipboard.writeText(entry.url);
      showToast("Link copied — paste it anywhere");
    } catch {
      showToast("Sharing isn't supported on this browser", "err");
    }
  } finally {
    lbShare.disabled = false;
    lbShare.innerHTML = label;
  }
}

if (lbShare) lbShare.addEventListener("click", shareCurrent);

function nav(delta) {
  if (_lightboxIdx < 0 || !_feed.length) return;
  _lightboxIdx = (_lightboxIdx + delta + _feed.length) % _feed.length;
  paintLightbox();
}

lbClose.addEventListener("click", closeLightbox);
lbPrev.addEventListener("click", () => nav(-1));
lbNext.addEventListener("click", () => nav(1));
// NOTE: background tap-to-close is intentionally omitted — lock-in mode
// requires a deliberate X press (or Escape on desktop) to exit.
document.addEventListener("keydown", (e) => {
  if (!lightbox.classList.contains("open")) return;
  if (e.key === "Escape") closeLightbox();
  else if (e.key === "ArrowLeft") nav(-1);
  else if (e.key === "ArrowRight") nav(1);
});
let _touchX = 0;
lbStage.addEventListener("touchstart", (e) => { _touchX = e.touches[0].clientX; }, { passive: true });
lbStage.addEventListener("touchend", (e) => {
  const dx = e.changedTouches[0].clientX - _touchX;
  if (Math.abs(dx) > 48) nav(dx < 0 ? 1 : -1);
}, { passive: true });

// === Delete (owner + admin) ==============================================
// Owner can delete their own uploads; admin can delete any. When admin
// deletes someone else's photo, a deletion-log entry is written under
// /wedding-photo-deletes/<originalUid>/<autoId> so the uploader sees a
// notice on their next visit (their anonymous uid is sticky via Firebase
// auth persistence).

let _pendingDeleteId = null;

function askDelete(id) {
  const entry = _feed.find((e) => e.id === id);
  if (!entry) return;
  if (!IS_ADMIN && entry.uid !== auth.currentUser?.uid) {
    showToast("You can only remove your own uploads", "err");
    return;
  }
  // Admin shortcut: skip the confirm modal entirely. Charlie's curating
  // the live album in real time at the wedding — every extra tap is
  // friction. The deletion log still writes if the target wasn't his own
  // upload, so the original guest still sees the notice on next visit.
  if (IS_ADMIN) {
    const noun = entry.isVideo ? "Video" : "Photo";
    deleteEntry(id)
      .then(async () => {
        showToast(`${noun} removed`);
        await refreshFeedNow();
        if (lightbox.classList.contains("open")) {
          const stillThere = _feed.find((e) => e.id === id);
          if (!stillThere) closeLightbox();
        }
      })
      .catch((e) => {
        console.error(e);
        showToast(e?.message || "Couldn't remove", "err", 4000);
      });
    return;
  }
  _pendingDeleteId = id;
  const noun = entry.isVideo ? "video" : "photo";
  if (confirmTitle) confirmTitle.textContent = `Remove this ${noun}?`;
  confirmMsg.textContent = `It will be deleted from the shared album and from our storage — this can't be undone.`;
  confirmModal.classList.add("open");
  confirmModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeConfirm() {
  confirmModal.classList.remove("open");
  confirmModal.setAttribute("aria-hidden", "true");
  _pendingDeleteId = null;
  modalConfirm.disabled = false;
  modalConfirm.innerHTML = "Yes, remove";
  if (!lightbox.classList.contains("open") && !shareModal.classList.contains("open") && !cameraView.classList.contains("open")) {
    document.body.style.overflow = "";
  }
}

async function deleteEntry(id) {
  const entry = _feed.find((e) => e.id === id);
  if (!entry) return;
  // Capture details BEFORE removing — needed to write the deletion log so the
  // original uploader can see what was taken down.
  const willLog = IS_ADMIN && entry.uid && entry.uid !== auth.currentUser?.uid;
  if (entry.path) {
    try {
      await deleteObject(ref(storage, entry.path));
    } catch (e) {
      if (e?.code !== "storage/object-not-found") {
        console.error("storage delete failed", e);
        throw e;
      }
    }
    // Sibling poster .jpg — best-effort cleanup, fine if it doesn't exist.
    if (entry.isVideo) {
      const posterPath = entry.path.replace(/\.[^.]+$/, "") + ".poster.jpg";
      try { await deleteObject(ref(storage, posterPath)); }
      catch (e) { if (e?.code !== "storage/object-not-found") console.warn("poster cleanup failed", e); }
    }
  }
  await dbRemove(dbRef(db, `${FEED_PATH}/${id}`));
  if (willLog) {
    try {
      await dbPush(dbRef(db, `${DELETION_LOG_PATH}/${entry.uid}`), {
        photoName: entry.name || "",
        photoGuest: entry.guest || "",
        wasVideo: !!entry.isVideo,
        deletedAt: Date.now(),
        deletedByAdmin: true,
      });
    } catch (e) {
      console.warn("deletion log write failed", e);
    }
  }
}

modalCancel.addEventListener("click", closeConfirm);
confirmModal.addEventListener("click", (e) => { if (e.target === confirmModal) closeConfirm(); });
modalConfirm.addEventListener("click", async () => {
  if (!_pendingDeleteId) return;
  modalConfirm.disabled = true;
  modalConfirm.innerHTML = `<span class="material-symbols-outlined align-middle" style="font-size:18px">hourglass_top</span> Removing…`;
  const id = _pendingDeleteId;
  try {
    await deleteEntry(id);
    showToast("Removed");
    await refreshFeedNow();
    if (lightbox.classList.contains("open")) {
      const stillThere = _feed.find((e) => e.id === id);
      if (!stillThere) closeLightbox();
    }
  } catch (e) {
    console.error(e);
    showToast(e?.message || "Couldn't remove the photo", "err", 4000);
  } finally {
    closeConfirm();
  }
});
document.addEventListener("keydown", (e) => {
  if (confirmModal.classList.contains("open") && e.key === "Escape") closeConfirm();
  if (shareModal.classList.contains("open") && e.key === "Escape") closeShareModal();
  if (cameraView.classList.contains("open") && e.key === "Escape") closeCamera();
});
lbDelete.addEventListener("click", () => {
  if (lbDelete.dataset.feedId) askDelete(lbDelete.dataset.feedId);
});

// Self-heal dead URLs (storage object gone but feed entry remains).
const _pruned = new Set();
async function pruneDeadEntry(id, url) {
  if (_pruned.has(id)) return;
  _pruned.add(id);
  try {
    const resp = await fetch(url, { method: "HEAD" });
    if (resp.ok) return;
  } catch { return; }
  try {
    await dbRemove(dbRef(db, `${FEED_PATH}/${id}`));
    console.log("pruned dead feed entry", id);
  } catch (e) {
    console.warn("prune failed", id, e);
  }
}

// === Notification banner (admin → uploader) ==============================
// Each user reads their own deletion log; banner shows unseen entries.
// Dismissals are tracked per-id in localStorage so they don't keep nagging
// after acknowledgement, while the log itself stays so Charlie has an audit
// trail in the database.

function getSeenDeletions() {
  try { return new Set(JSON.parse(localStorage.getItem("stl:seen-deletes") || "[]")); }
  catch { return new Set(); }
}
function saveSeenDeletions(set) {
  localStorage.setItem("stl:seen-deletes", JSON.stringify(Array.from(set)));
}

let _myDeletionLog = [];
function renderNotifyBanner() {
  const seen = getSeenDeletions();
  const unseen = _myDeletionLog.filter((e) => !seen.has(e.id));
  if (!unseen.length) {
    notifyBanner.classList.remove("show");
    return;
  }
  const n = unseen.length;
  const noun = n === 1
    ? (unseen[0].wasVideo ? "video" : "photo")
    : "uploads";
  const named = unseen[0].photoName ? ` (“${unseen[0].photoName.slice(0, 40)}”${n > 1 ? " and others" : ""})` : "";
  notifyText.innerHTML = `<strong>An admin removed ${n} of your ${noun}${named}</strong> from the shared album. If this was a mistake, message Charlie & Karla.`;
  notifyBanner.classList.add("show");
}

notifyDismiss.addEventListener("click", () => {
  const seen = getSeenDeletions();
  _myDeletionLog.forEach((e) => seen.add(e.id));
  saveSeenDeletions(seen);
  notifyBanner.classList.remove("show");
});

function subscribeMyDeletions() {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  onValue(dbRef(db, `${DELETION_LOG_PATH}/${uid}`), (snap) => {
    const list = [];
    snap.forEach((c) => list.push({ id: c.key, ...c.val() }));
    list.sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
    _myDeletionLog = list;
    renderNotifyBanner();
  }, (err) => console.warn("deletion-log subscribe failed", err));
}

// === Admin badge ==========================================================
if (IS_ADMIN) {
  const badge = document.createElement("button");
  badge.className = "admin-badge";
  badge.textContent = "Admin · Tap to exit";
  badge.addEventListener("click", () => {
    localStorage.removeItem("stl:admin");
    location.search = location.search.replace(/[?&]admin=1/g, "");
    location.reload();
  });
  document.body.appendChild(badge);
}

// === Hidden admin toggle: 5-tap the C&K logo ==============================
// Discoverable enough for Charlie ("kala ko ba pag Charlie pwede ko i-delete
// everything"), invisible to guests. 5 taps within 2.5s flips admin mode and
// reloads so all the delete chips render.
(function setupLogoAdminTap() {
  const heroLogo = document.querySelector("header.hero img");
  if (!heroLogo) return;
  heroLogo.style.cursor = "pointer";
  let taps = [];
  heroLogo.addEventListener("click", () => {
    const now = Date.now();
    taps = taps.filter((t) => now - t < 2500);
    taps.push(now);
    if (taps.length >= 5) {
      taps = [];
      const on = localStorage.getItem("stl:admin") === "1";
      if (on) localStorage.removeItem("stl:admin");
      else    localStorage.setItem("stl:admin", "1");
      showToast(on ? "Admin mode off" : "Admin mode on", "ok", 1200);
      setTimeout(() => location.reload(), 600);
    }
  });
})();

// === Boot =================================================================
ensureAuth().then((user) => {
  subscribeFeed();
  if (user) subscribeMyDeletions();
}).catch((e) => {
  console.warn("anon auth failed, falling back to unauth gallery read", e);
  subscribeFeed();
});
