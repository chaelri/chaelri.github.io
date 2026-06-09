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
  getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject,
  listAll, getMetadata,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";
import {
  getDatabase, ref as dbRef, push, set as dbSet, remove as dbRemove,
  onValue, query as dbQuery, limitToLast,
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

// RTDB path that backs the shared gallery feed — each entry holds the public
// download URL + light metadata. Single subscription, no per-file
// getDownloadURL round-trips on render.
const FEED_PATH = "wedding-photos";
const FEED_LIMIT = 240;                                     // most-recent N rendered up front

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
const galleryGrid  = $("gallery-grid");
const galleryCount = $("gallery-count");
const galleryEmpty = $("gallery-empty");
const lightbox    = $("lightbox");
const lbStage     = $("lb-stage");
const lbCaption   = $("lb-caption");
const lbClose     = $("lb-close");
const lbPrev      = $("lb-prev");
const lbNext      = $("lb-next");
const lbDelete    = $("lb-delete");
const confirmModal = $("confirm-modal");
const modalCancel  = $("modal-cancel");
const modalConfirm = $("modal-confirm");

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
  // Write a feed entry once the bytes land — gallery subscription picks it up
  // and the tile appears in the shared album for every other guest in
  // real time. URL is captured here so the gallery doesn't have to query
  // getDownloadURL on every render. Feed key is derived from the storage
  // filename (RTDB-safe — dots → underscores) so the reconcile job can't
  // race-double-write the same entry.
  try {
    const url = await getDownloadURL(fileRef);
    const feedKey = filename.replace(/[.#$/\[\]]/g, "_");
    await dbSet(dbRef(db, `${FEED_PATH}/${feedKey}`), {
      url,
      name: it.file.name.slice(0, 120),
      guest: (guestName || "").slice(0, 80),
      ts: Date.now(),
      isVideo: it.isVideo,
      path,
      // uid stamps ownership so the uploader (anonymous-auth uid is sticky
      // across reloads via Firebase's local persistence) can later delete
      // their own tiles. No one else's uid matches.
      uid: auth.currentUser?.uid || "",
    });
  } catch (e) {
    console.warn("feed write failed (file still uploaded)", e);
  }
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

// === Gallery + lightbox ===================================================

let _feed = [];                                             // newest-first
let _renderedIds = new Set();                               // for stagger animation on new tiles
let _lightboxIdx = -1;

function escHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function renderGallery() {
  if (!_feed.length) {
    galleryGrid.innerHTML = "";
    galleryEmpty.classList.remove("hidden-init");
    galleryCount.textContent = "";
    return;
  }
  galleryEmpty.classList.add("hidden-init");
  galleryCount.textContent = `${_feed.length} ${_feed.length === 1 ? "moment" : "moments"} shared`;

  // Reuse existing tiles by id to avoid layout thrash + re-trigger animations
  // only for genuinely new entries.
  const seen = new Set();
  for (const entry of _feed) {
    seen.add(entry.id);
    let tile = galleryGrid.querySelector(`[data-feed-id="${entry.id}"]`);
    if (tile) continue;
    tile = document.createElement("div");
    tile.className = "gallery-item";
    tile.dataset.feedId = entry.id;
    const mediaHtml = entry.isVideo
      ? `<video src="${escHtml(entry.url)}" preload="metadata" muted playsinline></video>
         <div class="video-badge"><span class="material-symbols-outlined" style="font-size:16px;font-variation-settings:'FILL' 1">play_arrow</span></div>`
      : `<img src="${escHtml(entry.url)}" alt="${escHtml(entry.name || "wedding photo")}" loading="lazy">`;
    const tag = entry.guest
      ? `<div class="guest-tag">${escHtml(entry.guest)}</div>`
      : "";
    const isOwn = entry.uid && entry.uid === auth.currentUser?.uid;
    const deleteBtn = isOwn
      ? `<button class="tile-delete" data-delete-id="${entry.id}" aria-label="Remove your upload" title="Remove">
           <span class="material-symbols-outlined" style="font-size:16px">delete</span>
         </button>`
      : "";
    tile.innerHTML = mediaHtml + tag + deleteBtn;
    tile.addEventListener("click", (e) => {
      // Don't open lightbox if the user clicked the delete chip.
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
  // Remove tiles whose entry got deleted server-side.
  Array.from(galleryGrid.children).forEach((tile) => {
    if (!seen.has(tile.dataset.feedId)) tile.remove();
  });
  // Reorder existing tiles to match the newest-first feed.
  for (let i = _feed.length - 1; i >= 0; i--) {
    const id = _feed[i].id;
    const tile = galleryGrid.querySelector(`[data-feed-id="${id}"]`);
    if (tile && galleryGrid.firstChild !== tile) {
      galleryGrid.insertBefore(tile, galleryGrid.firstChild);
    }
  }
}

let _firstSnapshotReceived = false;
function subscribeFeed() {
  const q = dbQuery(dbRef(db, FEED_PATH), limitToLast(FEED_LIMIT));
  onValue(q, (snap) => {
    const list = [];
    snap.forEach((c) => list.push({ id: c.key, ...c.val() }));
    list.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    _feed = list;
    renderGallery();
    if (!_firstSnapshotReceived) {
      _firstSnapshotReceived = true;
      // Self-heal Storage / feed drift on first load. Anything in the bucket
      // that the feed doesn't know about (e.g. files uploaded before this
      // page started writing feed entries) gets backfilled.
      reconcileOrphans().catch((e) => console.warn("reconcile failed", e));
    }
  }, (err) => {
    console.warn("gallery subscribe failed", err);
  });
}

// Walk every month folder under wedding-uploads/ and write a feed entry for
// any storage object the RTDB feed is missing. Deterministic feed keys
// (filename with dots → underscores) make concurrent reconciles idempotent.
// Orphan entries land with uid="" so they can't be deleted through the
// owner-only UI (Charlie can still remove them from the Firebase console).
async function reconcileOrphans() {
  const FLAG_KEY = "stl:storage-reconciled-v1";
  if (localStorage.getItem(FLAG_KEY)) return;
  const known = new Set(_feed.map((e) => e.path).filter(Boolean));
  let root;
  try {
    root = await listAll(ref(storage, STORAGE_ROOT));
  } catch (e) {
    console.warn("listAll root failed", e);
    return;
  }
  let addedCount = 0;
  for (const monthRef of root.prefixes) {
    let month;
    try { month = await listAll(monthRef); }
    catch (e) { console.warn("listAll month failed", monthRef.fullPath, e); continue; }
    for (const item of month.items) {
      if (known.has(item.fullPath)) continue;
      try {
        const [url, meta] = await Promise.all([
          getDownloadURL(item),
          getMetadata(item),
        ]);
        const feedKey = item.name.replace(/[.#$/\[\]]/g, "_");
        await dbSet(dbRef(db, `${FEED_PATH}/${feedKey}`), {
          url,
          name: meta.customMetadata?.originalName || item.name,
          guest: meta.customMetadata?.guestName || "",
          ts: new Date(meta.timeCreated).getTime() || Date.now(),
          isVideo: !(meta.contentType?.startsWith("image/")),
          path: item.fullPath,
          uid: "",                                          // orphan — admin-only delete
        });
        addedCount++;
      } catch (e) {
        console.warn("reconcile item failed", item.fullPath, e);
      }
    }
  }
  localStorage.setItem(FLAG_KEY, "1");
  if (addedCount) console.log(`reconcile: backfilled ${addedCount} storage orphans into feed`);
}

function openLightbox(id) {
  const idx = _feed.findIndex((e) => e.id === id);
  if (idx < 0) return;
  _lightboxIdx = idx;
  paintLightbox();
  lightbox.classList.add("open");
  lightbox.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  lightbox.classList.remove("open");
  lightbox.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  lbStage.innerHTML = "";
  _lightboxIdx = -1;
}

function paintLightbox() {
  const entry = _feed[_lightboxIdx];
  if (!entry) { closeLightbox(); return; }
  lbStage.innerHTML = entry.isVideo
    ? `<video src="${escHtml(entry.url)}" controls autoplay playsinline></video>`
    : `<img src="${escHtml(entry.url)}" alt="${escHtml(entry.name || "")}">`;
  const parts = [];
  if (entry.guest) parts.push(escHtml(entry.guest));
  parts.push(`${_lightboxIdx + 1} / ${_feed.length}`);
  lbCaption.innerHTML = parts.join(" · ");
  // Show the lightbox-level delete button only on the uploader's own media.
  const isOwn = entry.uid && entry.uid === auth.currentUser?.uid;
  lbDelete.dataset.feedId = entry.id;
  if (isOwn) lbDelete.classList.remove("hidden-init");
  else       lbDelete.classList.add("hidden-init");
}

function nav(delta) {
  if (_lightboxIdx < 0 || !_feed.length) return;
  _lightboxIdx = (_lightboxIdx + delta + _feed.length) % _feed.length;
  paintLightbox();
}

lbClose.addEventListener("click", closeLightbox);
lbPrev.addEventListener("click", () => nav(-1));
lbNext.addEventListener("click", () => nav(1));
lightbox.addEventListener("click", (e) => {
  // Click outside the media closes the lightbox.
  if (e.target === lightbox) closeLightbox();
});
document.addEventListener("keydown", (e) => {
  if (!lightbox.classList.contains("open")) return;
  if (e.key === "Escape") closeLightbox();
  else if (e.key === "ArrowLeft") nav(-1);
  else if (e.key === "ArrowRight") nav(1);
});

// Touch-swipe nav on phones.
let _touchX = 0;
lbStage.addEventListener("touchstart", (e) => { _touchX = e.touches[0].clientX; }, { passive: true });
lbStage.addEventListener("touchend", (e) => {
  const dx = e.changedTouches[0].clientX - _touchX;
  if (Math.abs(dx) > 48) nav(dx < 0 ? 1 : -1);
}, { passive: true });

// === Delete (owner-only) =================================================
// Two entry points (tile chip + lightbox button) both call askDelete(id),
// which opens the confirm modal. The modal's confirm runs deleteEntry, which
// removes the Storage object first (so we never end up with a tombstoned
// RTDB entry pointing at a 404) then the RTDB record.

let _pendingDeleteId = null;

function askDelete(id) {
  const entry = _feed.find((e) => e.id === id);
  if (!entry) return;
  if (entry.uid !== auth.currentUser?.uid) {
    showToast("You can only remove your own uploads", "err");
    return;
  }
  _pendingDeleteId = id;
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
  // Restore scroll lock only if the lightbox isn't also open.
  if (!lightbox.classList.contains("open")) document.body.style.overflow = "";
}

async function deleteEntry(id) {
  const entry = _feed.find((e) => e.id === id);
  if (!entry) return;
  // Storage first. If the object is already gone (e.g. previously deleted via
  // console), swallow the not-found and proceed to clear the RTDB record.
  if (entry.path) {
    try {
      await deleteObject(ref(storage, entry.path));
    } catch (e) {
      if (e?.code !== "storage/object-not-found") {
        console.error("storage delete failed", e);
        throw e;
      }
    }
  }
  await dbRemove(dbRef(db, `${FEED_PATH}/${id}`));
}

modalCancel.addEventListener("click", closeConfirm);
confirmModal.addEventListener("click", (e) => {
  if (e.target === confirmModal) closeConfirm();
});
modalConfirm.addEventListener("click", async () => {
  if (!_pendingDeleteId) return;
  modalConfirm.disabled = true;
  modalConfirm.innerHTML = `<span class="material-symbols-outlined align-middle" style="font-size:18px">hourglass_top</span> Removing…`;
  const id = _pendingDeleteId;
  try {
    await deleteEntry(id);
    showToast("Removed");
    // If the lightbox was showing this entry, close it — the feed update
    // about to arrive will reorder tiles around it anyway.
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
});

lbDelete.addEventListener("click", () => {
  if (lbDelete.dataset.feedId) askDelete(lbDelete.dataset.feedId);
});

// Kick off the gallery once auth is settled — Storage download URLs include a
// token so they're readable without further auth, but RTDB rules may require
// auth. Subscribing after sign-in is safest. Anonymous so it's invisible.
ensureAuth().then(subscribeFeed).catch((e) => {
  console.warn("anon auth failed, falling back to unauth gallery read", e);
  subscribeFeed();
});
