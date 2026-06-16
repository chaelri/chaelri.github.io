// ─────────────── soft lock (localStorage-backed) ───────────────
// Not a real security measure — just stops Karla from accidentally opening
// the page on a shared device. Password lives in source, that's intentional.
(function gate() {
  const KEY = "vows-unlocked";
  const PIN = "1234";
  const lock = document.getElementById("lock");
  if (!lock) return;

  if (localStorage.getItem(KEY) === "1") {
    lock.classList.add("unlocked");
    setTimeout(() => lock.remove(), 600);
    return;
  }

  const form  = document.getElementById("lockForm");
  const input = document.getElementById("lockInput");
  const errEl = document.getElementById("lockError");
  setTimeout(() => input.focus(), 120);

  form.addEventListener("submit", e => {
    e.preventDefault();
    if (input.value === PIN) {
      localStorage.setItem(KEY, "1");
      lock.classList.add("unlocked");
      setTimeout(() => lock.remove(), 600);
    } else {
      errEl.classList.add("show");
      input.classList.add("shake");
      setTimeout(() => input.classList.remove("shake"), 500);
      input.value = "";
      input.focus();
    }
  });
  input.addEventListener("input", () => errEl.classList.remove("show"));
})();

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import {
  getDatabase, ref, onValue, set, update, remove, push
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

// ─────────────── firebase init (shared client config) ───────────────
const app = initializeApp({
  apiKey: "AIzaSyB8ahT56WbEUaGAymsRNNA-DrfZnUnWIwk",
  authDomain: "test-database-55379.firebaseapp.com",
  databaseURL: "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "test-database-55379"
});
const db = getDatabase(app);
const auth = getAuth(app);

const ROOT       = "vows-karla";
const VOWS_PATH  = `${ROOT}/vows`;       // new flat structure (writes go here)
const ITEMS_PATH = `${ROOT}/items`;      // legacy /items/{secId}/{itemId} — still read

const authReady = new Promise(resolve => {
  const unsub = onAuthStateChanged(auth, user => {
    if (user) { unsub(); resolve(user); }
  });
});
signInAnonymously(auth).catch(e => console.warn("anon signin failed:", e));

// ─────────────── speech-pacing knob ───────────────
// Wedding-vow pace (intentional, with pauses) is roughly 110–130 wpm.
// 125 wpm hits the middle.
const WORDS_PER_MIN = 125;

// ─────────────── DOM refs ───────────────
const $ = id => document.getElementById(id);
const feedEl       = $("feed");
const feedEmpty    = $("feedEmpty");
const composerForm = $("addForm");
const composerInput = $("composerInput");
const syncDot      = $("syncDot");
const statEntries  = $("statEntries");
const statWords    = $("statWords");
const statTime     = $("statTime");

// inner container for cards — created once so feed scrollbar lives on .feed
const feedInner = document.createElement("div");
feedInner.className = "feed-inner";
feedEl.appendChild(feedInner);

// ─────────────── state ───────────────
// Each vow: { id, path, text, createdAt } — `path` is the Firebase ref string
// so edits/deletes go back to wherever the item lives (new flat path or legacy)
let vowsNew    = {};   // { vowId: { text, createdAt, order? } }
let vowsLegacy = {};   // { "secId/itemId": { text, createdAt, order? } }
let pendingScrollBottom = false;
let dragInProgress      = false;   // pauses renderFeed while a card is mid-drag

// ─────────────── sync indicator ───────────────
onValue(ref(db, ".info/connected"), snap => {
  const ok = snap.val() === true;
  syncDot.classList.toggle("on", ok);
  syncDot.title = ok ? "synced" : "offline";
});

// ─────────────── live listeners ───────────────
onValue(ref(db, VOWS_PATH), snap => {
  vowsNew = snap.val() || {};
  renderAll();
});

onValue(ref(db, ITEMS_PATH), snap => {
  // Flatten { secId: { itemId: { ... } } } → { "secId/itemId": { ... } }
  const flat = {};
  const raw = snap.val() || {};
  for (const secId of Object.keys(raw)) {
    const bag = raw[secId] || {};
    for (const itemId of Object.keys(bag)) {
      flat[`${secId}/${itemId}`] = bag[itemId];
    }
  }
  vowsLegacy = flat;
  renderAll();
});

// ─────────────── helpers ───────────────
function mergedVows() {
  // Returns the merged, sorted list of all vows from new + legacy sources.
  // Sort key is `order` if set (drag-to-reorder writes this), else createdAt.
  const list = [];
  for (const id of Object.keys(vowsNew)) {
    const v = vowsNew[id];
    const created = v.createdAt ?? 0;
    list.push({
      id: `new:${id}`,
      path: `${VOWS_PATH}/${id}`,
      text: v.text || "",
      createdAt: created,
      order: v.order ?? created
    });
  }
  for (const key of Object.keys(vowsLegacy)) {
    const v = vowsLegacy[key];
    const created = v.createdAt ?? 0;
    list.push({
      id: `old:${key.replace(/\//g, ":")}`,
      path: `${ITEMS_PATH}/${key}`,
      text: v.text || "",
      createdAt: created,
      order: v.order ?? created
    });
  }
  list.sort((a, b) => a.order - b.order);
  return list;
}

// Look up a vow's effective order by its DOM dataset.id ("new:xxx" or "old:sec:itm")
function vowOrderFromDomId(domId) {
  if (!domId) return null;
  if (domId.startsWith("new:")) {
    const id = domId.slice(4);
    const v = vowsNew[id];
    return v ? (v.order ?? v.createdAt ?? 0) : null;
  }
  if (domId.startsWith("old:")) {
    const key = domId.slice(4).replace(/:/g, "/");
    const v = vowsLegacy[key];
    return v ? (v.order ?? v.createdAt ?? 0) : null;
  }
  return null;
}

function wordCount(text) {
  return (text.trim().match(/\S+/g) || []).length;
}

function fmtSpeech(words, { compact = false } = {}) {
  // Returns "1:25" style or "1m 25s" when compact=false.
  if (!words) return compact ? "0s" : "0:00";
  const totalSec = Math.round((words / WORDS_PER_MIN) * 60);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (compact) {
    if (m === 0) return `${s}s`;
    if (s === 0) return `${m}m`;
    return `${m}m ${s}s`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function relTime(ms) {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const m = 60_000, h = 60 * m, d = 24 * h;
  if (diff < m)     return "just now";
  if (diff < h)     return Math.floor(diff / m) + "m ago";
  if (diff < d)     return Math.floor(diff / h) + "h ago";
  if (diff < 7 * d) return Math.floor(diff / d) + "d ago";
  const dt = new Date(ms);
  const sameYear = dt.getFullYear() === new Date().getFullYear();
  const opts = sameYear
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" };
  return dt.toLocaleDateString(undefined, opts);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function fmtThousands(n) {
  return n.toLocaleString();
}

// ─────────────── render ───────────────
function renderAll() {
  const list = mergedVows();
  renderStats(list);
  renderFeed(list);
}

function renderStats(list) {
  const totalWords = list.reduce((sum, v) => sum + wordCount(v.text), 0);
  statEntries.textContent = fmtThousands(list.length);
  statWords.textContent   = fmtThousands(totalWords);
  statTime.textContent    = fmtSpeech(totalWords);
}

function buildItemNode(v, noStr) {
  const div = document.createElement("div");
  div.className = "item";
  div.dataset.id = v.id;
  div.dataset.path = v.path;
  div.innerHTML = `
    <button class="drag-handle" type="button" title="Drag to reorder" aria-label="Drag to reorder">
      <span class="material-symbols-rounded">drag_indicator</span>
    </button>
    <div class="item-meta">
      <span class="item-no">#${noStr}</span>
      <span class="item-meta-dot"></span>
      <span class="item-time"></span>
      <span class="item-meta-dot"></span>
      <span class="item-words"></span>
      <span class="item-meta-dot"></span>
      <span class="item-speech"></span>
    </div>
    <div class="item-body"></div>
    <div class="item-actions">
      <button class="item-act act-edit"   type="button" title="Edit"><span class="material-symbols-rounded">edit</span></button>
      <button class="item-act act-del"    type="button" title="Delete"><span class="material-symbols-rounded">close</span></button>
      <button class="item-act act-save"   type="button" title="Save"><span class="material-symbols-rounded">check</span></button>
      <button class="item-act act-cancel" type="button" title="Cancel"><span class="material-symbols-rounded">close</span></button>
    </div>
  `;
  const body = div.querySelector(".item-body");
  div.querySelector(".act-edit"  ).addEventListener("click", e => { e.stopPropagation(); startEdit(div, body); });
  div.querySelector(".act-del"   ).addEventListener("click", e => { e.stopPropagation(); deleteVow(div); });
  div.querySelector(".act-save"  ).addEventListener("click", e => { e.stopPropagation(); commitEdit(div, body); });
  div.querySelector(".act-cancel").addEventListener("click", e => { e.stopPropagation(); cancelEdit(div, body); });
  attachDrag(div, div.querySelector(".drag-handle"));
  return div;
}

function renderFeed(list) {
  if (dragInProgress) return;   // don't disturb the user's in-flight drag
  const prevScroll = feedEl.scrollTop;

  if (list.length === 0) {
    feedEmpty.hidden = false;
    feedInner.querySelectorAll(".item").forEach(n => n.remove());
    return;
  }
  feedEmpty.hidden = true;

  const existing = new Map();
  feedInner.querySelectorAll(".item").forEach(n => existing.set(n.dataset.id, n));

  const total = list.length;
  const pad = String(total).length;
  const keep = new Set();

  list.forEach((v, i) => {
    const noStr  = String(i + 1).padStart(pad, "0");
    const w      = wordCount(v.text);
    const time   = relTime(v.createdAt);
    const wordsT = `${fmtThousands(w)} ${w === 1 ? "word" : "words"}`;
    const speech = `~${fmtSpeech(w, { compact: true })}`;

    let node = existing.get(v.id);
    if (!node) {
      node = buildItemNode(v, noStr);
    } else {
      if (node.dataset.path !== v.path) node.dataset.path = v.path;
      if (!node.classList.contains("editing")) {
        const body = node.querySelector(".item-body");
        if (body.textContent !== v.text) body.textContent = v.text;
      }
    }

    const noEl     = node.querySelector(".item-no");
    const timeEl   = node.querySelector(".item-time");
    const wordsEl  = node.querySelector(".item-words");
    const speechEl = node.querySelector(".item-speech");
    if (noEl.textContent     !== `#${noStr}`) noEl.textContent     = `#${noStr}`;
    if (timeEl.textContent   !== time)        timeEl.textContent   = time;
    if (wordsEl.textContent  !== wordsT)      wordsEl.textContent  = wordsT;
    if (speechEl.textContent !== speech)      speechEl.textContent = speech;

    // body content (handled above when not editing) — for first-time mount:
    if (!existing.has(v.id)) {
      node.querySelector(".item-body").textContent = v.text;
    }

    keep.add(v.id);

    const slot = feedInner.children[i] || null;
    if (slot !== node) feedInner.insertBefore(node, slot);
  });

  existing.forEach((node, id) => { if (!keep.has(id)) node.remove(); });

  requestAnimationFrame(() => {
    if (pendingScrollBottom) {
      feedEl.scrollTop = feedEl.scrollHeight;
      pendingScrollBottom = false;
    } else if (feedEl.scrollTop !== prevScroll) {
      feedEl.scrollTop = prevScroll;
    }
  });
}

// ─────────────── edit flow ───────────────
function startEdit(itemEl, bodyEl) {
  // close any other open editor first
  feedInner.querySelectorAll(".item.editing").forEach(other => {
    if (other !== itemEl) {
      const ob = other.querySelector(".item-body");
      if (other.dataset.original !== undefined) ob.textContent = other.dataset.original;
      ob.removeAttribute("contenteditable");
      other.classList.remove("editing");
      delete other.dataset.original;
    }
  });

  const orig = bodyEl.textContent;
  itemEl.dataset.original = orig;
  itemEl.classList.add("editing");
  bodyEl.setAttribute("contenteditable", "true");
  bodyEl.focus();

  const r = document.createRange();
  r.selectNodeContents(bodyEl); r.collapse(false);
  const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);

  bodyEl._editKeyHandler = e => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit(itemEl, bodyEl);
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commitEdit(itemEl, bodyEl);
    }
  };
  bodyEl.addEventListener("keydown", bodyEl._editKeyHandler);
}

async function commitEdit(itemEl, bodyEl) {
  const orig = itemEl.dataset.original ?? "";
  const next = bodyEl.innerText.trim();
  bodyEl.removeAttribute("contenteditable");
  itemEl.classList.remove("editing");
  if (bodyEl._editKeyHandler) {
    bodyEl.removeEventListener("keydown", bodyEl._editKeyHandler);
    delete bodyEl._editKeyHandler;
  }
  delete itemEl.dataset.original;
  if (next && next !== orig) {
    await update(ref(db, itemEl.dataset.path), { text: next });
  } else {
    // restore canonical text + bail (no firebase write)
    bodyEl.textContent = orig;
  }
}

function cancelEdit(itemEl, bodyEl) {
  const orig = itemEl.dataset.original ?? bodyEl.textContent;
  bodyEl.removeAttribute("contenteditable");
  itemEl.classList.remove("editing");
  if (bodyEl._editKeyHandler) {
    bodyEl.removeEventListener("keydown", bodyEl._editKeyHandler);
    delete bodyEl._editKeyHandler;
  }
  delete itemEl.dataset.original;
  bodyEl.textContent = orig;
}

async function deleteVow(itemEl) {
  const path = itemEl.dataset.path;
  if (!path) return;
  if (!confirm("Delete this vow? This can't be undone.")) return;
  await remove(ref(db, path));
}

// ─────────────── drag-to-reorder ───────────────
const DRAG_THRESHOLD = 6;          // px before drag actually starts
const REORDER_GAP    = 10_000;     // sparse spacing for fresh order values

function attachDrag(card, handle) {
  handle.addEventListener("pointerdown", ev => {
    // ignore right/middle mouse buttons
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    ev.preventDefault();
    try { handle.setPointerCapture(ev.pointerId); } catch {}

    const startY = ev.clientY;
    const startX = ev.clientX;
    const originalPrev = card.previousElementSibling;
    const originalNext = card.nextElementSibling;
    let active = false;
    let placeholder = null;
    let cardRect = null;

    const onMove = e => {
      if (!active) {
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (Math.max(dx, dy) < DRAG_THRESHOLD) return;
        beginDrag();
      }
      if (!active) return;
      e.preventDefault();

      // visually follow the pointer (rotation gives a little "lifted" feel)
      card.style.transform = `translate(${e.clientX - startX}px, ${e.clientY - startY}px) rotate(-1deg)`;

      // figure out where the placeholder should sit
      const pointerY = e.clientY;
      const candidates = Array.from(feedInner.children)
        .filter(c => c !== card && c !== placeholder);
      let inserted = false;
      for (const sib of candidates) {
        const r = sib.getBoundingClientRect();
        if (pointerY < r.top + r.height / 2) {
          if (placeholder.nextSibling !== sib) feedInner.insertBefore(placeholder, sib);
          inserted = true;
          break;
        }
      }
      if (!inserted && placeholder !== feedInner.lastElementChild) {
        feedInner.appendChild(placeholder);
      }

      autoScrollFeed(pointerY);
    };

    const onUp = async () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      try { handle.releasePointerCapture(ev.pointerId); } catch {}

      if (!active) return;   // never crossed threshold → no-op (handle still clickable)

      // drop the card into the placeholder's slot, restore styles
      placeholder.parentNode.insertBefore(card, placeholder);
      placeholder.remove();
      placeholder = null;

      card.classList.remove("dragging");
      card.style.position = "";
      card.style.left = "";
      card.style.top = "";
      card.style.width = "";
      card.style.transform = "";
      card.style.zIndex = "";
      dragInProgress = false;

      // skip Firebase write if the card landed in the same slot
      if (card.previousElementSibling === originalPrev &&
          card.nextElementSibling     === originalNext) {
        return;
      }
      await commitOrder(card);
    };

    function beginDrag() {
      active = true;
      dragInProgress = true;
      cardRect = card.getBoundingClientRect();

      placeholder = document.createElement("div");
      placeholder.className = "drag-placeholder";
      placeholder.style.height = cardRect.height + "px";
      card.parentNode.insertBefore(placeholder, card);

      // lift card out of flow so it can follow the pointer freely
      card.style.position = "fixed";
      card.style.left  = cardRect.left + "px";
      card.style.top   = cardRect.top  + "px";
      card.style.width = cardRect.width + "px";
      card.classList.add("dragging");
    }

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  });
}

function autoScrollFeed(pointerY) {
  const r = feedEl.getBoundingClientRect();
  const edge = 70;
  if (pointerY < r.top + edge)       feedEl.scrollTop -= 10;
  else if (pointerY > r.bottom - edge) feedEl.scrollTop += 10;
}

async function commitOrder(card) {
  const path = card.dataset.path;
  if (!path) return;

  const prev = card.previousElementSibling;
  const next = card.nextElementSibling;
  const prevOrder = prev ? vowOrderFromDomId(prev.dataset.id) : null;
  const nextOrder = next ? vowOrderFromDomId(next.dataset.id) : null;

  let newOrder;
  if (prevOrder != null && nextOrder != null) {
    newOrder = (prevOrder + nextOrder) / 2;
  } else if (prevOrder != null) {
    newOrder = prevOrder + REORDER_GAP;
  } else if (nextOrder != null) {
    newOrder = nextOrder - REORDER_GAP;
  } else {
    newOrder = Date.now();
  }

  await update(ref(db, path), { order: newOrder });
}

// ─────────────── add new vow ───────────────
composerForm.addEventListener("submit", async e => {
  e.preventDefault();
  const text = composerInput.value.trim();
  if (!text) return;
  composerInput.value = "";
  fitComposer();
  pendingScrollBottom = true;
  await authReady;
  const newRef = push(ref(db, VOWS_PATH));
  await set(newRef, { text, createdAt: Date.now() });
});

composerInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    composerForm.requestSubmit();
  }
});

const MIN_COMPOSER_H = 82;
const MAX_COMPOSER_H = 220;
function fitComposer() {
  composerInput.style.height = "auto";
  const h = Math.max(MIN_COMPOSER_H, Math.min(composerInput.scrollHeight, MAX_COMPOSER_H));
  composerInput.style.height = h + "px";
}
composerInput.addEventListener("input", fitComposer);
fitComposer();

// ─────────────── periodic refresh of time labels ───────────────
// Relative times drift ("3m ago" → "4m ago"). Re-render every 45s so the meta
// strip stays accurate even when the data hasn't changed.
setInterval(() => {
  if (document.hidden) return;
  renderAll();
}, 45_000);

// ─────────────── ambient petals canvas (background only) ───────────────
(function startPetals() {
  const c = document.getElementById("petals");
  if (!c) return;
  const ctx = c.getContext("2d");
  let W, H, petals = [];

  function resize() {
    W = c.width  = window.innerWidth  * devicePixelRatio;
    H = c.height = window.innerHeight * devicePixelRatio;
  }
  resize();
  window.addEventListener("resize", resize);

  const COLORS = ["#ffb7c5", "#7b8a5b", "#d4889a", "#e2e8d8", "#f4cfbb"];
  function spawn() {
    return {
      x: Math.random() * W,
      y: -20 - Math.random() * H * 0.2,
      r: (2 + Math.random() * 3.5) * devicePixelRatio,
      vy: (0.15 + Math.random() * 0.45) * devicePixelRatio,
      vx: ((Math.random() - 0.5) * 0.2) * devicePixelRatio,
      drift: Math.random() * Math.PI * 2,
      driftSpeed: 0.005 + Math.random() * 0.01,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      alpha: 0.20 + Math.random() * 0.35
    };
  }
  for (let i = 0; i < 32; i++) {
    const p = spawn();
    p.y = Math.random() * H;
    petals.push(p);
  }

  function tick() {
    ctx.clearRect(0, 0, W, H);
    for (const p of petals) {
      p.drift += p.driftSpeed;
      p.x += p.vx + Math.sin(p.drift) * 0.3 * devicePixelRatio;
      p.y += p.vy;
      if (p.y > H + 30 || p.x < -30 || p.x > W + 30) Object.assign(p, spawn());
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(tick);
  }
  tick();
})();

// ─────────────── kickoff ───────────────
// On first render, jump to the bottom so the newest entry is in view.
pendingScrollBottom = true;
