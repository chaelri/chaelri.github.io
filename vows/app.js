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

  const form = document.getElementById("lockForm");
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
  getDatabase, ref, onValue, set, update, remove, push, get
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

const ROOT = "vows-karla";
const sectionsRef = ref(db, `${ROOT}/sections`);
const itemsRef = ref(db, `${ROOT}/items`);

const authReady = new Promise(resolve => {
  const unsub = onAuthStateChanged(auth, user => {
    if (user) { unsub(); resolve(user); }
  });
});
signInAnonymously(auth).catch(e => console.warn("anon signin failed:", e));

// ─────────────── default sections (seeded once) ───────────────
const DEFAULT_SECTIONS = [
  { name: "Commit & Vow", icon: "favorite", hue: "sage", order: 0 },
  { name: "Funny Lines", icon: "theater_comedy", hue: "peach", order: 1 },
  { name: "To Include", icon: "playlist_add_check", hue: "rose", order: 2 },
  { name: "Quotes", icon: "format_quote", hue: "lilac", order: 3 }
];

const HUE_VALUES = {
  sage:    "#7b8a5b",
  rose:    "#d4889a",
  peach:   "#e6a37a",
  amber:   "#c89b4d",
  lilac:   "#b893c8",
  sky:     "#7aaecc",
  emerald: "#6fa885",
  violet:  "#b893c8"   // alias for legacy entries
};

// ─────────────── DOM refs ───────────────
const $ = id => document.getElementById(id);
const mapEl = $("map");
const centerEl = $("center");
const connectorsEl = $("connectors");
const syncDot = $("syncDot");

const panelEl = $("panel");
const panelScrim = $("panelScrim");
const panelIcon = $("panelIcon");
const panelTitle = $("panelTitle");
const panelCount = $("panelCount");
const itemListEl = $("itemList");
const itemInput = $("itemInput");
const addItemForm = $("addItemForm");
const closePanelBtn = $("closePanelBtn");
const renameSectionBtn = $("renameSectionBtn");
const deleteSectionBtn = $("deleteSectionBtn");

const modalEl = $("modal");
const modalForm = $("modalForm");
const modalTitle = $("modalTitle");
const modalClose = $("modalClose");
const modalCancel = $("modalCancel");
const sectionNameInput = $("sectionName");
const hueRow = $("hueRow");
const iconRow = $("iconRow");
const addSectionBtn = $("addSectionBtn");

// ─────────────── state ───────────────
let sections = {};   // { id: { name, icon, hue, order, createdAt } }
let items = {};      // { sectionId: { itemId: { text, createdAt } } }
let activeSectionId = null;
let modalMode = "create";   // "create" | "edit"
let modalEditingId = null;
let modalSelected = { hue: "sage", icon: "favorite" };
let pendingScrollBottom = false;  // set when we want renderItems to jump to bottom

// ─────────────── sync indicator ───────────────
onValue(ref(db, ".info/connected"), snap => {
  const ok = snap.val() === true;
  syncDot.classList.toggle("on", ok);
  syncDot.title = ok ? "synced" : "offline";
});

// ─────────────── seed defaults if empty ───────────────
async function seedIfEmpty() {
  await authReady;
  const snap = await get(sectionsRef);
  if (snap.exists()) return;
  const updates = {};
  DEFAULT_SECTIONS.forEach((s, i) => {
    const id = push(sectionsRef).key;
    updates[id] = { ...s, createdAt: Date.now() };
  });
  await update(sectionsRef, updates);
}

// ─────────────── live listeners ───────────────
onValue(sectionsRef, snap => {
  sections = snap.val() || {};
  renderMap();
  if (activeSectionId && sections[activeSectionId]) refreshPanelHeader();
});

onValue(itemsRef, snap => {
  items = snap.val() || {};
  renderMap();
  if (activeSectionId) renderItems(activeSectionId);
});

// ─────────────── render: mind map ───────────────
function getSortedSections() {
  return Object.entries(sections)
    .map(([id, s]) => ({ id, ...s }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

function nodeRadius() {
  const w = window.innerWidth, h = window.innerHeight;
  const min = Math.min(w, h);
  const count = Object.keys(sections).length || 4;

  // base radius derived from viewport
  let R;
  if (min < 360)      R = min * 0.40;
  else if (min < 480) R = min * 0.40;
  else if (min < 720) R = min * 0.34;
  else                R = Math.min(320, min * 0.32);

  // bump radius slightly when there are many sections so they don't crowd
  if (count > 6) R += 12;

  return R;
}

function renderMap() {
  const list = getSortedSections();
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;

  // index whatever's already in the DOM so we can reuse instead of rebuilding
  const existingNodes  = new Map();   // secId → button.section-node
  const existingPaths  = new Map();   // secId → SVGPathElement
  const existingOrbits = new Map();   // "secId|slot" → div.section-orbit
  mapEl.querySelectorAll(".section-node").forEach(n => existingNodes.set(n.dataset.id, n));
  connectorsEl.querySelectorAll("path").forEach(p => existingPaths.set(p.dataset.id, p));
  mapEl.querySelectorAll(".section-orbit").forEach(o => existingOrbits.set(o.dataset.key, o));

  if (list.length === 0) {
    existingNodes.forEach(n => n.remove());
    existingPaths.forEach(p => p.remove());
    existingOrbits.forEach(o => o.remove());
    return;
  }

  const R = nodeRadius();
  const keepNodes  = new Set();
  const keepPaths  = new Set();
  const keepOrbits = new Set();

  list.forEach((sec, i) => {
    const angle = (-Math.PI / 2) + (i * 2 * Math.PI / list.length);
    const x = Math.cos(angle) * R;
    const y = Math.sin(angle) * R;
    const hueColor = HUE_VALUES[sec.hue] || HUE_VALUES.rose;
    const xAbs = cx + x, yAbs = cy + y;

    // ── connector ──
    const mx = cx + (xAbs - cx) * 0.5;
    const my = cy + (yAbs - cy) * 0.5;
    const perpX = -(yAbs - cy) * 0.12;
    const perpY =  (xAbs - cx) * 0.12;
    const d = `M ${cx} ${cy} Q ${mx + perpX} ${my + perpY} ${xAbs} ${yAbs}`;

    let path = existingPaths.get(sec.id);
    if (!path) {
      path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.dataset.id = sec.id;
      path.setAttribute("fill", "none");
      path.setAttribute("stroke-width", "1.6");
      path.setAttribute("stroke-opacity", "0.55");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-dasharray", "3 5");
      connectorsEl.appendChild(path);
    }
    if (path.getAttribute("d") !== d) path.setAttribute("d", d);
    if (path.getAttribute("stroke") !== hueColor) {
      path.setAttribute("stroke", hueColor);
      path.style.filter = `drop-shadow(0 1px 3px ${hueColor}33)`;
    }
    keepPaths.add(sec.id);

    // ── section node ──
    const count = countItems(sec.id);
    const countLabel = `${count} ${count === 1 ? "entry" : "entries"}`;
    const leftStr = `calc(50% + ${x}px)`;
    const topStr  = `calc(50% + ${y}px)`;
    const iconName = sec.icon || "favorite";

    let node = existingNodes.get(sec.id);
    if (!node) {
      node = document.createElement("button");
      node.type = "button";
      node.className = "section-node";
      node.dataset.id = sec.id;
      node.innerHTML = `
        <span class="material-symbols-rounded section-icon"></span>
        <div class="section-name"></div>
        <div class="section-count"></div>
      `;
      node.addEventListener("click", () => openPanel(node.dataset.id));
      mapEl.appendChild(node);
    }
    if (node.style.left !== leftStr) node.style.left = leftStr;
    if (node.style.top  !== topStr)  node.style.top  = topStr;
    if (node.style.getPropertyValue("--hue") !== hueColor) node.style.setProperty("--hue", hueColor);
    const iconEl = node.querySelector(".section-icon");
    if (iconEl.textContent !== iconName) iconEl.textContent = iconName;
    const nameEl = node.querySelector(".section-name");
    if (nameEl.textContent !== sec.name) nameEl.textContent = sec.name;
    const countEl = node.querySelector(".section-count");
    if (countEl.textContent !== countLabel) countEl.textContent = countLabel;
    keepNodes.add(sec.id);

    // ── orbit tags (hidden on phones via CSS) ──
    if (window.innerWidth > 640) {
      const recent = recentItemsFor(sec.id, 2);
      const tagR = R + Math.min(96, window.innerWidth * 0.10);
      const margin = 92;
      recent.forEach((it, idx) => {
        const tagAngle = angle + (idx === 0 ? -0.32 : 0.32);
        const tx = Math.cos(tagAngle) * tagR;
        const ty = Math.sin(tagAngle) * tagR;
        const absX = cx + tx, absY = cy + ty;
        if (absX < margin || absX > window.innerWidth - margin) return;
        if (absY < 70     || absY > window.innerHeight - 70)    return;

        const slotKey = `${sec.id}|${idx}`;
        const tagText = truncate(it.text, 28);
        const tagLeft = `calc(50% + ${tx}px)`;
        const tagTop  = `calc(50% + ${ty}px)`;

        let tag = existingOrbits.get(slotKey);
        if (!tag) {
          tag = document.createElement("div");
          tag.className = "section-orbit";
          tag.dataset.key = slotKey;
          tag.style.transform = "translate(-50%, -50%)";
          tag.style.animationDelay = `${0.1 + idx * 0.08}s`;
          mapEl.appendChild(tag);
        }
        if (tag.textContent !== tagText) tag.textContent = tagText;
        if (tag.style.left !== tagLeft) tag.style.left = tagLeft;
        if (tag.style.top  !== tagTop)  tag.style.top  = tagTop;
        keepOrbits.add(slotKey);
      });
    }
  });

  // sweep orphans
  existingNodes.forEach((n, id)  => { if (!keepNodes.has(id))   n.remove(); });
  existingPaths.forEach((p, id)  => { if (!keepPaths.has(id))   p.remove(); });
  existingOrbits.forEach((o, k)  => { if (!keepOrbits.has(k))   o.remove(); });
}

function countItems(secId) {
  return Object.keys(items[secId] || {}).length;
}

function recentItemsFor(secId, n) {
  const bag = items[secId] || {};
  return Object.values(bag)
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, n);
}

function truncate(s, n) {
  s = (s || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// reflow on resize / orientation change
let resizeTimer;
function scheduleReflow() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderMap, 120);
}
window.addEventListener("resize", scheduleReflow);
window.addEventListener("orientationchange", scheduleReflow);

// ─────────────── panel ───────────────
function openPanel(secId) {
  activeSectionId = secId;
  pendingScrollBottom = true;   // jump to newest on open
  refreshPanelHeader();
  renderItems(secId);
  panelEl.classList.add("show");
  panelScrim.classList.add("show");
  panelEl.setAttribute("aria-hidden", "false");
  setTimeout(() => itemInput.focus(), 350);
}

function closePanel() {
  panelEl.classList.remove("show");
  panelScrim.classList.remove("show");
  panelEl.setAttribute("aria-hidden", "true");
  activeSectionId = null;
  panelTitle.setAttribute("contenteditable", "false");
}

function refreshPanelHeader() {
  const sec = sections[activeSectionId];
  if (!sec) return;
  const hueColor = HUE_VALUES[sec.hue] || HUE_VALUES.rose;
  panelEl.style.setProperty("--hue", hueColor);
  panelIcon.textContent = sec.icon || "favorite";
  panelTitle.textContent = sec.name;
  const n = countItems(activeSectionId);
  panelCount.textContent = `${n} ${n === 1 ? "entry" : "entries"}`;
}

function relTime(ms) {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const m = 60_000, h = 60 * m, d = 24 * h;
  if (diff < m)        return "just now";
  if (diff < h)        return Math.floor(diff / m) + "m ago";
  if (diff < d)        return Math.floor(diff / h) + "h ago";
  if (diff < 7 * d)    return Math.floor(diff / d) + "d ago";
  const dt = new Date(ms);
  const sameYear = dt.getFullYear() === new Date().getFullYear();
  const opts = sameYear
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" };
  return dt.toLocaleDateString(undefined, opts);
}

function buildItemNode(it, n, time, secId) {
  const div = document.createElement("div");
  div.className = "item";
  div.dataset.id = it.id;
  div.innerHTML = `
    <div class="item-meta">
      <span class="item-no">#${n}</span>
      <span class="item-meta-dot"></span>
      <span class="item-time">${escapeHtml(time)}</span>
    </div>
    <div class="item-body">${escapeHtml(it.text)}</div>
    <div class="item-actions">
      <button class="item-act act-edit" type="button" title="Edit"><span class="material-symbols-rounded">edit</span></button>
      <button class="item-act act-del" type="button" title="Delete"><span class="material-symbols-rounded">close</span></button>
      <button class="item-act act-save" type="button" title="Save"><span class="material-symbols-rounded">check</span></button>
      <button class="item-act act-cancel" type="button" title="Cancel"><span class="material-symbols-rounded">close</span></button>
    </div>
  `;
  const body = div.querySelector(".item-body");
  div.querySelector(".act-edit").addEventListener("click", e => { e.stopPropagation(); startEdit(div, body, secId, it.id); });
  div.querySelector(".act-del").addEventListener("click", e => { e.stopPropagation(); deleteItem(secId, it.id); });
  div.querySelector(".act-save").addEventListener("click", e => { e.stopPropagation(); commitEdit(div, body, secId, it.id); });
  div.querySelector(".act-cancel").addEventListener("click", e => { e.stopPropagation(); cancelEdit(div, body, secId, it.id); });
  return div;
}

function renderItems(secId) {
  // capture scroll before mutating
  const prevScroll = itemListEl.scrollTop;

  const bag = items[secId] || {};
  const list = Object.entries(bag)
    .map(([id, it]) => ({ id, ...it }))
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

  if (list.length === 0) {
    itemListEl.innerHTML = `<div class="empty">nothing here yet · add your first thought below</div>`;
    pendingScrollBottom = false;
    return;
  }

  // drop empty placeholder if present
  itemListEl.querySelector(".empty")?.remove();

  // map existing nodes by id so we can reuse them instead of rebuilding
  const existing = new Map();
  itemListEl.querySelectorAll(".item").forEach(n => existing.set(n.dataset.id, n));

  const total = list.length;
  const pad = String(total).length;
  const keep = new Set();

  list.forEach((it, i) => {
    const noStr = `#${String(i + 1).padStart(pad, "0")}`;
    const time = relTime(it.createdAt);
    let node = existing.get(it.id);

    if (!node) {
      node = buildItemNode(it, noStr.slice(1), time, secId);
    } else {
      // update text only if user isn't mid-edit on this card
      if (!node.classList.contains("editing")) {
        const body = node.querySelector(".item-body");
        if (body.textContent !== it.text) body.textContent = it.text;
      }
      const noEl = node.querySelector(".item-no");
      if (noEl.textContent !== noStr) noEl.textContent = noStr;
      const timeEl = node.querySelector(".item-time");
      if (timeEl.textContent !== time) timeEl.textContent = time;
    }
    keep.add(it.id);

    // ensure correct order (only moves if needed — no flicker for stable order)
    const slot = itemListEl.children[i] || null;
    if (slot !== node) itemListEl.insertBefore(node, slot);
  });

  // remove nodes that are no longer in the list
  existing.forEach((node, id) => {
    if (!keep.has(id)) node.remove();
  });

  // scroll: jump to bottom only when explicitly requested; otherwise leave it
  requestAnimationFrame(() => {
    if (pendingScrollBottom) {
      itemListEl.scrollTop = itemListEl.scrollHeight;
      pendingScrollBottom = false;
    } else if (itemListEl.scrollTop !== prevScroll) {
      itemListEl.scrollTop = prevScroll;
    }
  });
}

// edit-mode state per item lives in dataset.original so cancel can revert
function startEdit(itemEl, bodyEl, secId, itemId) {
  // close any other open editor first
  itemListEl.querySelectorAll(".item.editing").forEach(other => {
    if (other !== itemEl) {
      const ob = other.querySelector(".item-body");
      ob.textContent = other.dataset.original || ob.textContent;
      ob.removeAttribute("contenteditable");
      other.classList.remove("editing");
      delete other.dataset.original;
    }
  });

  const orig = items[secId]?.[itemId]?.text || bodyEl.textContent;
  itemEl.dataset.original = orig;
  bodyEl.textContent = orig;
  itemEl.classList.add("editing");
  bodyEl.setAttribute("contenteditable", "true");
  bodyEl.focus();

  // place caret at end
  const r = document.createRange();
  r.selectNodeContents(bodyEl); r.collapse(false);
  const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);

  // keyboard shortcuts: Esc → cancel, Cmd/Ctrl+Enter → save
  bodyEl._editKeyHandler = e => {
    if (e.key === "Escape") { e.preventDefault(); cancelEdit(itemEl, bodyEl, secId, itemId); }
    else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commitEdit(itemEl, bodyEl, secId, itemId);
    }
  };
  bodyEl.addEventListener("keydown", bodyEl._editKeyHandler);
}

async function commitEdit(itemEl, bodyEl, secId, itemId) {
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
    await update(ref(db, `${ROOT}/items/${secId}/${itemId}`), { text: next });
  } else {
    // re-render to restore canonical text + ordering
    renderItems(secId);
  }
}

function cancelEdit(itemEl, bodyEl, secId, itemId) {
  const orig = itemEl.dataset.original ?? items[secId]?.[itemId]?.text ?? "";
  bodyEl.removeAttribute("contenteditable");
  itemEl.classList.remove("editing");
  if (bodyEl._editKeyHandler) {
    bodyEl.removeEventListener("keydown", bodyEl._editKeyHandler);
    delete bodyEl._editKeyHandler;
  }
  delete itemEl.dataset.original;
  bodyEl.textContent = orig;
}

// ─────────────── add item ───────────────
addItemForm.addEventListener("submit", async e => {
  e.preventDefault();
  if (!activeSectionId) return;
  const text = itemInput.value.trim();
  if (!text) return;
  itemInput.value = "";
  fitInput();
  pendingScrollBottom = true;   // jump to the bottom once Firebase echoes
  await authReady;
  const targetRef = ref(db, `${ROOT}/items/${activeSectionId}`);
  const newRef = push(targetRef);
  await set(newRef, { text, createdAt: Date.now() });
});

// Enter to submit, Shift+Enter for newline
itemInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    addItemForm.requestSubmit();
  }
});
const MIN_INPUT_H = 82;   // ≈ 3 lines of 14px Inter @ 1.45
const MAX_INPUT_H = 220;
function fitInput() {
  itemInput.style.height = "auto";
  const h = Math.max(MIN_INPUT_H, Math.min(itemInput.scrollHeight, MAX_INPUT_H));
  itemInput.style.height = h + "px";
}
itemInput.addEventListener("input", fitInput);
fitInput();

async function deleteItem(secId, itemId) {
  await remove(ref(db, `${ROOT}/items/${secId}/${itemId}`));
}

// ─────────────── close / rename / delete section ───────────────
closePanelBtn.addEventListener("click", closePanel);
panelScrim.addEventListener("click", closePanel);
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    if (modalEl.classList.contains("show")) closeModal();
    else if (panelEl.classList.contains("show")) closePanel();
  }
});

renameSectionBtn.addEventListener("click", () => {
  if (!activeSectionId) return;
  openModal("edit", sections[activeSectionId], activeSectionId);
});

deleteSectionBtn.addEventListener("click", async () => {
  if (!activeSectionId) return;
  const name = sections[activeSectionId]?.name || "this section";
  const n = countItems(activeSectionId);
  const msg = n > 0
    ? `Delete "${name}" and its ${n} entr${n === 1 ? "y" : "ies"}? This can't be undone.`
    : `Delete "${name}"?`;
  if (!confirm(msg)) return;
  const id = activeSectionId;
  closePanel();
  await Promise.all([
    remove(ref(db, `${ROOT}/sections/${id}`)),
    remove(ref(db, `${ROOT}/items/${id}`))
  ]);
});

// ─────────────── modal: new / edit section ───────────────
function openModal(mode, existing, existingId) {
  modalMode = mode;
  modalEditingId = existingId || null;
  modalTitle.textContent = mode === "edit" ? "Rename section" : "New section";
  sectionNameInput.value = existing?.name || "";
  modalSelected.hue = existing?.hue || "rose";
  modalSelected.icon = existing?.icon || "favorite";
  hueRow.querySelectorAll(".hue-chip").forEach(c => c.classList.toggle("active", c.dataset.hue === modalSelected.hue));
  iconRow.querySelectorAll(".icon-chip").forEach(c => c.classList.toggle("active", c.dataset.icon === modalSelected.icon));
  modalEl.classList.add("show");
  modalEl.setAttribute("aria-hidden", "false");
  setTimeout(() => sectionNameInput.focus(), 150);
}

function closeModal() {
  modalEl.classList.remove("show");
  modalEl.setAttribute("aria-hidden", "true");
  modalEditingId = null;
}

addSectionBtn.addEventListener("click", () => openModal("create"));
modalClose.addEventListener("click", closeModal);
modalCancel.addEventListener("click", closeModal);
modalEl.addEventListener("click", e => { if (e.target === modalEl) closeModal(); });

hueRow.querySelectorAll(".hue-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    modalSelected.hue = chip.dataset.hue;
    hueRow.querySelectorAll(".hue-chip").forEach(c => c.classList.toggle("active", c === chip));
  });
});
iconRow.querySelectorAll(".icon-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    modalSelected.icon = chip.dataset.icon;
    iconRow.querySelectorAll(".icon-chip").forEach(c => c.classList.toggle("active", c === chip));
  });
});

modalForm.addEventListener("submit", async e => {
  e.preventDefault();
  const name = sectionNameInput.value.trim();
  if (!name) return;
  await authReady;

  if (modalMode === "edit" && modalEditingId) {
    await update(ref(db, `${ROOT}/sections/${modalEditingId}`), {
      name, hue: modalSelected.hue, icon: modalSelected.icon
    });
  } else {
    const list = getSortedSections();
    const nextOrder = list.length ? Math.max(...list.map(s => s.order ?? 0)) + 1 : 0;
    const newRef = push(sectionsRef);
    await set(newRef, {
      name, hue: modalSelected.hue, icon: modalSelected.icon,
      order: nextOrder, createdAt: Date.now()
    });
  }
  closeModal();
});

// inline title rename via panel-title (double-click)
panelTitle.addEventListener("dblclick", () => {
  if (!activeSectionId) return;
  panelTitle.setAttribute("contenteditable", "true");
  panelTitle.focus();
  const r = document.createRange();
  r.selectNodeContents(panelTitle); r.collapse(false);
  const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
});
panelTitle.addEventListener("blur", async () => {
  if (panelTitle.getAttribute("contenteditable") !== "true") return;
  panelTitle.setAttribute("contenteditable", "false");
  const next = panelTitle.innerText.trim();
  if (!activeSectionId) return;
  const orig = sections[activeSectionId]?.name || "";
  if (next && next !== orig) {
    await update(ref(db, `${ROOT}/sections/${activeSectionId}`), { name: next });
  } else {
    panelTitle.textContent = orig;
  }
});
panelTitle.addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); panelTitle.blur(); }
  if (e.key === "Escape") { panelTitle.textContent = sections[activeSectionId]?.name || ""; panelTitle.blur(); }
});

// ─────────────── ambient petals canvas ───────────────
(function startPetals() {
  const c = document.getElementById("petals");
  const ctx = c.getContext("2d");
  let W, H, petals = [];

  function resize() {
    W = c.width = window.innerWidth * devicePixelRatio;
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
      alpha: 0.25 + Math.random() * 0.40
    };
  }
  for (let i = 0; i < 36; i++) {
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
      if (p.y > H + 30 || p.x < -30 || p.x > W + 30) {
        Object.assign(p, spawn());
      }
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
seedIfEmpty().catch(e => console.warn("seed failed:", e));
