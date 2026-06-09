// Per-template state + cross-template completion tracker.
// Firebase-backed (test-database-55379, same project as weddingbar/) with a
// localStorage write-through so UI reads stay synchronous and the page works
// offline. Calling code shouldn't have to await anything on the read path.

import { fbGet, fbSet, fbSubscribe } from "./firebase-sync.js";

const STATE_KEY = "collaterals:v1";

export const TEMPLATES = [
  { id: "name-cards",      label: "Name Cards",     icon: "badge",            path: "templates/name-cards/" },
  { id: "menu",            label: "Menu",           icon: "restaurant_menu",  path: "templates/menu/" },
  { id: "money-envelopes", label: "Money Envelopes",icon: "mail",             path: "templates/money-envelopes/" },
  { id: "mirror-chart",    label: "Mirror Seating", icon: "view_quilt",       path: "templates/mirror-chart/" },
  { id: "table-numbers",   label: "Table Numbers",  icon: "view_module",      path: "templates/table-numbers/" },
  { id: "monogram",        label: "Monogram (LED)", icon: "favorite",         path: "templates/monogram/" },
  { id: "invitation",      label: "Invitation",     icon: "draft",            path: "templates/invitation/" },
];

export const STATUSES = ["pending", "in_progress", "ready", "printed"];

function load() {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function save(s) {
  localStorage.setItem(STATE_KEY, JSON.stringify(s));
}

// Pull the latest snapshot for a template from Firebase and merge into the
// local cache. Templates call this once on boot before reading state.
// Returns whatever's now in localStorage for the template (post-merge).
const _hydrated = new Set();
export async function hydrateFromFirebase(id) {
  if (_hydrated.has(id)) return getTemplateData(id);
  try {
    const remote = await fbGet(id);
    if (remote && typeof remote === "object") {
      const s = load();
      s.data = s.data || {};
      s.data[id] = remote;
      save(s);
    }
    _hydrated.add(id);
  } catch (e) {
    console.warn("hydrateFromFirebase failed for", id, e);
  }
  return getTemplateData(id);
}

// Live-sync: if another tab/device writes to this template, mirror locally.
export function subscribeTemplate(id, cb) {
  return fbSubscribe(id, (remote) => {
    const s = load();
    s.data = s.data || {};
    s.data[id] = remote;
    save(s);
    if (cb) cb(remote);
  });
}

export function getAllStatus() {
  const s = load();
  const out = {};
  for (const t of TEMPLATES) {
    out[t.id] = s.status?.[t.id] || "pending";
  }
  return out;
}

export function setStatus(id, status) {
  if (!STATUSES.includes(status)) throw new Error(`bad status: ${status}`);
  const s = load();
  s.status = s.status || {};
  s.status[id] = status;
  save(s);
}

export function getTemplateData(id) {
  const s = load();
  return s.data?.[id] || {};
}

export function setTemplateData(id, data) {
  const s = load();
  s.data = s.data || {};
  s.data[id] = data;
  save(s);
}

export function getProgressPct() {
  const st = getAllStatus();
  const total = TEMPLATES.length;
  let score = 0;
  for (const id of Object.keys(st)) {
    if (st[id] === "in_progress") score += 0.4;
    else if (st[id] === "ready") score += 0.85;
    else if (st[id] === "printed") score += 1;
  }
  return Math.round((score / total) * 100);
}
