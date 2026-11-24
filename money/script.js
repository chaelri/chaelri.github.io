import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  set,
  push,
  get,
  query,
  limitToLast,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// =============================
// Firebase config (existing project, new joint path)
// =============================
const firebaseConfig = {
  apiKey: "AIzaSyB8ahT56WbEUaGAymsRNNA-DrfZnUnWIwk",
  authDomain: "test-database-55379.firebaseapp.com",
  databaseURL:
    "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "test-database-55379",
  storageBucket: "test-database-55379.firebasestorage.app",
  messagingSenderId: "933688602756",
  appId: "1:933688602756:web:392a3a4ce040cb9d4452d1",
  measurementId: "G-1LSTC0N3NJ",
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);
const DB_PATH = "money_joint_v1"; // shared by both phones
const dbRef = ref(db, DB_PATH);
const HISTORY_PATH = "money_joint_history_v1"; // change log: {ts, device, changes[]}
const SNAPSHOT_PATH = "money_joint_snapshots_v1"; // full copy of the data, one per day, taken before that day's first change
const historyRef = ref(db, HISTORY_PATH);

// =============================
// Constants
// =============================
const HORIZON = 60; // months of timeline / projection
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
// owner meta
const OWNERS = {
  charlie: { label: "Charlie's", who: "charlie", accent: "blue", text: "text-blue-400", ring: "border-blue-500/20", grad: "from-blue-500 to-indigo-600" },
  karla: { label: "Karla's", who: "karla", accent: "rose", text: "text-rose-400", ring: "border-rose-500/20", grad: "from-rose-500 to-pink-600" },
  joint: { label: "Joint", who: "joint", accent: "amber", text: "text-amber-400", ring: "border-amber-500/20", grad: "from-amber-500 to-amber-600" },
};

// =============================
// State
// =============================
let appData = null;
let activeView = "budget";
let selectedKey = null; // "YYYY-MM"
let activeEdit = null; // { kind, ... }

// =============================
// Helpers
// =============================
const generateId = () => Math.random().toString(36).slice(2, 11);
const $ = (id) => document.getElementById(id);

function formatMoney(n) {
  const v = Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
  const hasFrac = Math.abs(v % 1) > 1e-9; // show 2 decimals only when there IS a fraction (.7 -> .70, .00 -> none)
  return v.toLocaleString("en-PH", { minimumFractionDigits: hasFrac ? 2 : 0, maximumFractionDigits: 2 });
}
function peso(n) { return `₱${formatMoney(n)}`; }
function signedPeso(n) {
  const s = n > 0.005 ? "+" : n < -0.005 ? "-" : "";
  return `${s}₱${formatMoney(Math.abs(n))}`;
}
function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
// Parse an auto-complete day from a name like "Every 29", "15th", "Every 27".
function parseDueDay(name) {
  const m = (name || "").match(/every\s*(\d{1,2})\b/i) || (name || "").match(/\b(\d{1,2})(?:st|nd|rd|th)\b/i);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  return d >= 1 && d <= 31 ? d : null;
}
function dueDayFor(it) {
  return it.dueDay != null ? it.dueDay : parseDueDay(it.name);
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// --- month-key math (keys are "YYYY-MM", lexicographically ordered) ---
function mkKey(y, m /* 0-11 */) { return `${y}-${String(m + 1).padStart(2, "0")}`; }
function keyParts(k) { const [y, m] = k.split("-").map(Number); return { y, m: m - 1 }; }
function addMonths(k, n) { const { y, m } = keyParts(k); const d = new Date(y, m + n, 1); return mkKey(d.getFullYear(), d.getMonth()); }
function cmpKey(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function monthName(k) { return MONTHS[keyParts(k).m]; }
function monthShort(k) { const { y, m } = keyParts(k); return `${MONTHS_SHORT[m]} '${String(y).slice(2)}`; }
function currentKey() { const d = new Date(); return mkKey(d.getFullYear(), d.getMonth()); }
function monthsInclusive(a, b) { const A = keyParts(a), B = keyParts(b); return (B.y - A.y) * 12 + (B.m - A.m) + 1; }

function timeline() {
  const out = [];
  let k = appData.startMonth;
  for (let i = 0; i < HORIZON; i++) { out.push(k); k = addMonths(k, 1); }
  return out;
}

// =============================
// Firebase
// =============================
function showSync() { const b = $("sync-bar"); if (b) b.style.opacity = "1"; }
function hideSync() { const b = $("sync-bar"); if (b) b.style.opacity = "0"; }
let pendingEchoes = 0; // count of our own writes whose onValue echo should not re-render
async function syncSet() {
  logChanges();
  pendingEchoes++;
  showSync();
  try { await set(dbRef, appData); }
  catch (e) { pendingEchoes = Math.max(0, pendingEchoes - 1); console.error(e); toast("Sync failed", "error"); }
  finally { setTimeout(hideSync, 400); }
}

// =============================
// History: every save is diffed against the last known data and logged
// =============================
const HISTORY_SHOWN = 500;
const HISTORY_PAGE_SIZE = 8;
const HISTORY_MAX_LINES = 40;
let logBaseline = null; // last data known to be in Firebase
let historyEntries = []; // newest first
let historyPage = 0; // 0 = newest
let historyOpen = false; // keeps the section open across re-renders

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function asList(v) { return (Array.isArray(v) ? v : Object.values(v || {})).filter(Boolean); }
function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return navigator.maxTouchPoints > 1 ? "iPad" : "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "Unknown device";
}

function flatItems(d) {
  const out = {};
  for (const who of ["charlie", "karla"]) {
    for (const kind of ["income", "expenses"]) {
      for (const it of asList(d.items?.[who]?.[kind])) out[it.id] = { it, who, kind };
    }
  }
  return out;
}
function namesById(...sources) {
  const names = {};
  for (const d of sources) {
    for (const { it } of Object.values(flatItems(d))) {
      names[it.id] = it.name;
      names[PROJECT_MOVED_ID] = "Pag-IBIG fund transfer";
      for (const c of asList(it.children)) names[c.id] = c.name;
    }
  }
  return names;
}
function monthLabel(k) { return k ? monthShort(k) : "none"; }
function ownerLabel(who) { return who === "karla" ? "Karla" : "Charlie"; }
function spendTotal(v) { return asList(v).reduce((s, e) => s + (Number(e.amount) || 0), 0); }

function fieldChanges(label, a, b) {
  const lines = [];
  if ((a.name || "") !== (b.name || "")) lines.push(`Renamed ${a.name || "unnamed"} to ${b.name || "unnamed"}`);
  if ((Number(a.amount) || 0) !== (Number(b.amount) || 0) && !asList(b.children).length) {
    lines.push(`${label}: ${peso(a.amount)} → ${peso(b.amount)}`);
  }
  if ((a.start || "") !== (b.start || "")) lines.push(`${label}: start ${monthLabel(a.start)} → ${monthLabel(b.start)}`);
  if ((a.end || "") !== (b.end || "")) lines.push(`${label}: end ${monthLabel(a.end)} → ${monthLabel(b.end)}`);
  if ((a.dueDay ?? null) !== (b.dueDay ?? null)) lines.push(`${label}: due day ${a.dueDay ?? "none"} → ${b.dueDay ?? "none"}`);
  if (!!a.recurring !== !!b.recurring) lines.push(`${label}: ${b.recurring ? "now recurring" : "now one-time"}`);
  if ((Number(a.every) || 1) !== (Number(b.every) || 1)) lines.push(`${label}: ${Number(b.every) === 3 ? "now quarterly" : "now monthly"}`);
  return lines;
}

function describeChanges(before, after) {
  const lines = [];
  const names = namesById(before, after);
  const nameOf = (id) => names[id] || id;

  const accBefore = Object.fromEntries(asList(before.accounts).map((a) => [a.id, a]));
  const accAfter = Object.fromEntries(asList(after.accounts).map((a) => [a.id, a]));
  for (const [id, a] of Object.entries(accAfter)) {
    const old = accBefore[id], label = `${a.name} (${ownerLabel(a.owner)})`;
    if (!old) lines.push(`Added account ${label}: ${peso(a.amount)}`);
    else if ((Number(old.amount) || 0) !== (Number(a.amount) || 0)) lines.push(`${label}: ${peso(old.amount)} → ${peso(a.amount)}`);
    else if (old.name !== a.name) lines.push(`Renamed account ${old.name} to ${a.name}`);
  }
  for (const [id, a] of Object.entries(accBefore)) {
    if (!accAfter[id]) lines.push(`Removed account ${a.name} (${ownerLabel(a.owner)}): ${peso(a.amount)}`);
  }

  const itemsBefore = flatItems(before), itemsAfter = flatItems(after);
  for (const [id, { it, who, kind }] of Object.entries(itemsAfter)) {
    const type = kind === "income" ? "income" : "expense";
    const old = itemsBefore[id]?.it;
    if (!old) { lines.push(`Added ${type}: ${it.name} ${peso(it.amount)} (${ownerLabel(who)}, ${monthLabel(it.start)})`); continue; }
    lines.push(...fieldChanges(it.name, old, it));
    const kidsBefore = Object.fromEntries(asList(old.children).map((c) => [c.id, c]));
    const kidsAfter = Object.fromEntries(asList(it.children).map((c) => [c.id, c]));
    for (const [cid, c] of Object.entries(kidsAfter)) {
      if (!kidsBefore[cid]) lines.push(`Added to ${it.name}: ${c.name} ${peso(c.amount)}`);
      else lines.push(...fieldChanges(`${it.name} / ${c.name}`, kidsBefore[cid], c));
    }
    for (const [cid, c] of Object.entries(kidsBefore)) {
      if (!kidsAfter[cid]) lines.push(`Removed from ${it.name}: ${c.name} ${peso(c.amount)}`);
    }
  }
  for (const [id, { it, kind }] of Object.entries(itemsBefore)) {
    if (!itemsAfter[id]) lines.push(`Removed ${kind === "income" ? "income" : "expense"}: ${it.name} ${peso(it.amount)}`);
  }

  const months = (a, b) => [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].sort();
  for (const k of months(before.paid, after.paid)) {
    const a = before.paid?.[k] || {}, b = after.paid?.[k] || {};
    for (const id of Object.keys({ ...a, ...b })) {
      if (!!a[id] === !!b[id]) continue;
      const income = (itemsAfter[id] || itemsBefore[id])?.kind === "income";
      lines.push(`${b[id] ? (income ? "Received" : "Paid") : (income ? "Not received" : "Unpaid")}: ${nameOf(id)} (${monthShort(k)})`);
    }
  }
  for (const k of months(before.overrides, after.overrides)) {
    const a = before.overrides?.[k] || {}, b = after.overrides?.[k] || {};
    for (const id of Object.keys({ ...a, ...b })) {
      if (a[id] === b[id]) continue;
      if (b[id] == null) lines.push(`${nameOf(id)} (${monthShort(k)}): removed the ${peso(a[id])} monthly amount`);
      else lines.push(`${nameOf(id)} (${monthShort(k)}): ${a[id] == null ? "usual amount" : peso(a[id])} → ${peso(b[id])}`);
    }
  }
  for (const k of months(before.spend, after.spend)) {
    const a = before.spend?.[k] || {}, b = after.spend?.[k] || {};
    for (const id of Object.keys({ ...a, ...b })) {
      const x = spendTotal(a[id]), y = spendTotal(b[id]);
      if (x !== y) lines.push(`Spent on ${nameOf(id)} (${monthShort(k)}): ${peso(x)} → ${peso(y)}`);
    }
  }
  return lines;
}

function snapshotDay() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
async function saveDailySnapshot(data) {
  const dayRef = ref(db, `${SNAPSHOT_PATH}/${snapshotDay()}`);
  if (!(await get(dayRef)).exists()) await set(dayRef, data);
}
// Logging must never get in the way of saving, so failures are only reported to the console.
function logChanges() {
  if (!logBaseline) { logBaseline = clone(appData); return; }
  const before = logBaseline;
  const lines = describeChanges(before, appData);
  logBaseline = clone(appData);
  if (!lines.length) return;
  const changes = lines.length > HISTORY_MAX_LINES
    ? [...lines.slice(0, HISTORY_MAX_LINES), `and ${lines.length - HISTORY_MAX_LINES} more`]
    : lines;
  push(historyRef, { ts: Date.now(), device: deviceName(), changes }).catch((e) => console.error(e));
  saveDailySnapshot(before).catch((e) => console.error(e));
}

// Log lines are plain text, so older entries render the same way as new ones.
function parseLogLine(line) {
  const metaOf = (t) => {
    const m = t.match(/^(.*) \(([^()]+)\)$/);
    return m ? { title: m[1], meta: m[2] } : { title: t, meta: "" };
  };
  const nameAmount = (t) => {
    const m = t.match(/^(.*) (₱[\d,.]+)$/);
    return m ? { name: m[1], amount: m[2] } : { name: t, amount: "" };
  };
  let m;
  if ((m = line.match(/^Added (income|expense): (.+?)(?: \(([^()]+)\))?$/))) {
    const x = nameAmount(m[2]);
    return { kind: "add", tag: `Added ${m[1]}`, title: x.name, meta: m[3] || "", prev: "None", next: x.amount };
  }
  if ((m = line.match(/^Removed (income|expense): (.+)$/))) {
    const x = nameAmount(m[2]);
    return { kind: "remove", tag: `Removed ${m[1]}`, title: x.name, meta: "", prev: x.amount, next: "Removed" };
  }
  if ((m = line.match(/^(Added|Removed) account (.+): (₱[\d,.]+)$/))) {
    const t = metaOf(m[2]), added = m[1] === "Added";
    return { kind: added ? "add" : "remove", tag: `${m[1]} account`, title: t.title, meta: t.meta, prev: added ? "None" : m[3], next: added ? m[3] : "Removed" };
  }
  if ((m = line.match(/^(Added to|Removed from) (.+): (.+)$/))) {
    const x = nameAmount(m[3]), added = m[1] === "Added to";
    return { kind: added ? "add" : "remove", tag: `${m[1]} ${m[2]}`, title: x.name, meta: "", prev: added ? "None" : x.amount, next: added ? x.amount : "Removed" };
  }
  if ((m = line.match(/^(Paid|Unpaid|Received|Not received): (.+)$/))) {
    const t = metaOf(m[2]), income = /Received|received/.test(m[1]), done = m[1] === "Paid" || m[1] === "Received";
    const yes = income ? "Received" : "Paid", no = income ? "Not received" : "Unpaid";
    return { kind: done ? "done" : "edit", tag: yes === "Paid" ? "Payment" : "Income", title: t.title, meta: t.meta, prev: done ? no : yes, next: done ? yes : no };
  }
  if ((m = line.match(/^Renamed (?:account )?(.+) to (.+)$/))) return { kind: "edit", tag: "Renamed", title: m[2], meta: "", prev: m[1], next: m[2] };
  if ((m = line.match(/^(.+): (now quarterly|now monthly)$/))) return { kind: "edit", tag: "Schedule", title: m[1], meta: "", prev: m[2] === "now quarterly" ? "Monthly" : "Quarterly", next: m[2] === "now quarterly" ? "Quarterly" : "Monthly" };
  if ((m = line.match(/^(.+): (now recurring|now one-time)$/))) return { kind: "edit", tag: "Schedule", title: m[1], meta: "", prev: m[2] === "now recurring" ? "One-time" : "Recurring", next: m[2] === "now recurring" ? "Recurring" : "One-time" };
  if ((m = line.match(/^(.+): (.+) → (.+)$/))) {
    const t = metaOf(m[1]);
    const f = m[2].match(/^(start|end|due day) (.+)$/);
    const tag = f ? { start: "Start month", end: "End month", "due day": "Due day" }[f[1]] : t.title.startsWith("Spent on ") ? "Spending" : "Amount";
    return { kind: "edit", tag, title: t.title.replace(/^Spent on /, ""), meta: t.meta, prev: f ? f[2] : m[2], next: m[3] };
  }
  if ((m = line.match(/^(.+): removed the (₱[\d,.]+) monthly amount$/))) {
    const t = metaOf(m[1]);
    return { kind: "edit", tag: "Amount", title: t.title, meta: t.meta, prev: m[2], next: "Usual amount" };
  }
  return { kind: "note", tag: "", title: line, meta: "", prev: "", next: "" };
}
function capitalize(t) { const v = String(t); return v.charAt(0).toUpperCase() + v.slice(1); }
function pesoValue(t) {
  const m = String(t).match(/^₱([\d,.]+)$/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}
function historyChangeHtml(line, e) {
  const c = parseLogLine(line);
  const when = new Date(e.ts).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  if (c.kind === "note") return `<div class="h-[76px] md:h-[52px] px-4 flex items-center border-t border-slate-700/40"><p class="text-[11px] font-semibold text-slate-400">${escapeHtml(c.title)}</p></div>`;
  const look = {
    add: ["add", "from-emerald-500 to-teal-600"],
    remove: ["remove", "from-rose-500 to-pink-600"],
    done: ["check", "from-emerald-500 to-teal-600"],
    edit: ["edit", "from-blue-500 to-indigo-600"],
  }[c.kind];
  const a = pesoValue(c.prev), b = pesoValue(c.next);
  const diff = a != null && b != null ? b - a : null;
  const chip = (value, cls) => `<span class="inline-block max-w-[9.5rem] truncate rounded-lg px-2 py-1 text-[11px] font-black ${cls}">${escapeHtml(capitalize(value))}</span>`;
  const isEmpty = (v) => /^none$/i.test(String(v));
  const values = isEmpty(c.prev) ? chip(`Added ${c.next}`, "bg-gradient-to-r from-emerald-500 to-teal-600 text-white")
    : isEmpty(c.next) || c.next === "Removed" ? chip(`Removed ${c.prev}`, "bg-gradient-to-r from-rose-500 to-pink-600 text-white")
    : `${chip(c.prev, "bg-slate-700 text-slate-200")}<span class="material-icons text-slate-400 flex-shrink-0" style="font-size:14px">arrow_forward</span>${chip(c.next, "bg-gradient-to-r from-indigo-600 to-violet-700 text-white")}`;
  const diffHtml = diff ? `<span class="text-[10px] font-black ${diff > 0 ? "text-emerald-300" : "text-rose-300"} flex-shrink-0">${signedPeso(diff)}</span>` : "";
  return `<div class="h-[76px] md:h-[52px] px-4 flex flex-wrap md:flex-nowrap items-center content-center gap-x-3 gap-y-1 border-t border-slate-700/40">
    <span class="w-7 h-7 rounded-lg bg-gradient-to-br ${look[1]} flex items-center justify-center flex-shrink-0"><span class="material-icons text-white" style="font-size:15px">${look[0]}</span></span>
    <div class="min-w-0 flex-1">
      <p class="text-[12px] font-bold text-white truncate">${escapeHtml(c.title)}</p>
      <p class="text-[10px] font-semibold text-slate-500 truncate">${when} · ${escapeHtml(c.tag)}${c.meta ? ` · ${escapeHtml(c.meta)}` : ""} · ${escapeHtml(e.device || "Unknown device")}</p>
    </div>
    <div class="flex items-center gap-1.5 basis-full md:basis-auto pl-10 md:pl-0 flex-shrink-0">${values}${diffHtml}</div>
  </div>`;
}
// Pages are counted in single changes, so every page has a predictable height.
function historyLines() {
  return historyEntries.flatMap((e) => asList(e.changes).map((line) => ({ e, line })));
}
function historyPageCount() { return Math.max(1, Math.ceil(historyLines().length / HISTORY_PAGE_SIZE)); }
function historyPagerHtml() {
  const pages = historyPageCount();
  if (pages < 2) return "";
  const button = (delta, icon, label, disabled) => `<button onclick="moveHistoryPage(${delta})" ${disabled ? "disabled" : ""} class="btn-sm ${disabled ? "btn-outline" : "btn-solid"}">${delta < 0 ? `<span class="material-icons" style="font-size:17px">${icon}</span>${label}` : `${label}<span class="material-icons" style="font-size:17px">${icon}</span>`}</button>`;
  return `<div class="flex items-center justify-between gap-3 px-4 py-2 border-t border-slate-700/40">
    ${button(-1, "chevron_left", "Newer", historyPage === 0)}
    <p class="text-[11px] font-bold text-slate-400">Page ${historyPage + 1} of ${pages}</p>
    ${button(1, "chevron_right", "Older", historyPage >= pages - 1)}
  </div>`;
}
function historyRowsHtml() {
  if (!historyEntries.length) return `<p class="px-4 py-5 text-[12px] text-slate-500">No changes logged yet.</p>`;
  historyPage = Math.min(historyPage, historyPageCount() - 1);
  const start = historyPage * HISTORY_PAGE_SIZE;
  const rows = historyLines().slice(start, start + HISTORY_PAGE_SIZE).map(({ e, line }) => historyChangeHtml(line, e)).join("");
  // Fixed height: every row is the same size and a short last page keeps its empty space.
  return `<div class="h-[608px] md:h-[416px]">${rows}</div>${historyPagerHtml()}`;
}
window.setHistoryOpen = function (open) { historyOpen = open; };
window.moveHistoryPage = function (delta) {
  historyPage = Math.max(0, Math.min(historyPageCount() - 1, historyPage + delta));
  refreshHistoryUi();
};
function historyCardHtml() {
  return `<details id="history-card" ${historyOpen ? "open" : ""} ontoggle="setHistoryOpen(this.open)" class="glass-card rounded-2xl overflow-hidden md:col-span-2">
    <summary class="flex items-center gap-3 px-4 py-3.5 cursor-pointer list-none">
      <span class="material-icons text-indigo-400">history</span>
      <span class="flex-1 text-sm font-bold text-white">History</span>
      <span id="history-count" class="text-[11px] font-bold text-slate-500">${historyLines().length}</span>
    </summary>
    <div id="history-rows">${historyRowsHtml()}</div>
  </details>`;
}
function refreshHistoryUi() {
  const rows = $("history-rows"), count = $("history-count");
  if (rows) rows.innerHTML = historyRowsHtml();
  if (count) count.textContent = historyLines().length;
}

function normalize(d) {
  d = d || {};
  d.accounts = Array.isArray(d.accounts) ? d.accounts : (d.accounts ? Object.values(d.accounts) : []);
  d.startMonth = d.startMonth || currentKey();
  d.items = d.items || {};
  for (const who of ["charlie", "karla"]) {
    d.items[who] = d.items[who] || {};
    for (const kind of ["income", "expenses"]) {
      const v = d.items[who][kind];
      d.items[who][kind] = Array.isArray(v) ? v : (v ? Object.values(v) : []);
    }
  }
  d.paid = d.paid || {};
  d.overrides = d.overrides || {};
  d.projects = d.projects || {};
  d.spend = d.spend || {}; // per-month actual spending logged against a sub-expense: spend[k][childId] = [{id,label,amount}]
  return d;
}

function emptyData() {
  return normalize({ startMonth: currentKey() });
}

// =============================
// Data accessors
// =============================
function getItems(who, kind) {
  const items = (appData.items?.[who]?.[kind] || []).filter(Boolean);
  const fund = who === "charlie" && kind === "expenses" ? projectFundItem() : null;
  return fund ? [...items, fund] : items;
}
function itemActiveIn(it, k) {
  if (!it.recurring) return it.start === k;
  if (cmpKey(k, it.start) < 0) return false;
  if (it.end && cmpKey(k, it.end) > 0) return false;
  return (monthsInclusive(it.start, k) - 1) % everyMonths(it) === 0;
}
// How many months between payments: 1 = monthly, 3 = quarterly.
function everyMonths(it) { return Number(it.every) || 1; }
// Number of payments between an item's start and end.
function paymentCount(it) { return Math.ceil(monthsInclusive(it.start, it.end) / everyMonths(it)); }
function amountIn(it, k) {
  if (it.virtual) return projectTransfer(activeProject(), projectPlan(activeProject()), k);
  const ov = appData.overrides?.[k]?.[it.id];
  return ov != null ? Number(ov) : Number(it.amount) || 0;
}
function hasOverride(id, k) { return appData.overrides?.[k]?.[id] != null; }
function isPaid(id, k) { return !!appData.paid?.[k]?.[id]; }
function accountsTotal() { return (appData.accounts || []).reduce((s, a) => s + (Number(a.amount) || 0), 0); }

// Sub-expenses: an item with children is a container; its amount = sum of children,
// and each child is checked/paid individually.
function getKids(it) { return Array.isArray(it.children) ? it.children.filter(Boolean) : []; }
// A sub-expense can start later than its parent (c.start = "YYYY-MM"); before that month it does not count.
function kidActive(c, k) { return !c.start || cmpKey(k, c.start) >= 0; }

// Actual spending logged against a sub-expense in month k (Firebase may hand back an array as an object).
function getSpendList(childId, k) {
  const v = appData.spend?.[k]?.[childId];
  if (!v) return [];
  return (Array.isArray(v) ? v : Object.values(v)).filter(Boolean);
}
function spentIn(childId, k) { return getSpendList(childId, k).reduce((s, e) => s + (Number(e.amount) || 0), 0); }
// The amount a sub-expense settles at for month k: the actual logged spend if any, else the estimate.
// This is what gets "locked as the final" when the child is checked; unlogged months fall back to the estimate.
function childFinal(c, k) {
  const list = getSpendList(c.id, k);
  return list.length ? spentIn(c.id, k) : (Number(c.amount) || 0);
}

function itemTotal(it, k) {
  const kids = getKids(it);
  if (!kids.length) return amountIn(it, k);
  // Budgeted estimate while unpaid; the locked final once checked.
  return kids.filter((c) => kidActive(c, k)).reduce((s, c) => s + (isPaid(c.id, k) ? childFinal(c, k) : (Number(c.amount) || 0)), 0);
}
// {total, paid} for an expense/income item, expanding children.
function itemAmts(it, k) {
  const kids = getKids(it);
  if (!kids.length) { const a = amountIn(it, k); return { total: a, paid: isPaid(it.id, k) ? a : 0 }; }
  let total = 0, paid = 0;
  for (const c of kids) {
    if (!kidActive(c, k)) continue;
    const settled = isPaid(c.id, k);
    const amt = settled ? childFinal(c, k) : (Number(c.amount) || 0);
    total += amt;
    if (settled) paid += amt;
  }
  return { total, paid };
}

function monthTotals(k) {
  let cI = 0, kI = 0, cE = 0, kE = 0, incRecv = 0, expPaid = 0;
  for (const it of getItems("charlie", "income")) if (itemActiveIn(it, k)) { const r = itemAmts(it, k); cI += r.total; incRecv += r.paid; }
  for (const it of getItems("karla", "income")) if (itemActiveIn(it, k)) { const r = itemAmts(it, k); kI += r.total; incRecv += r.paid; }
  for (const it of getItems("charlie", "expenses")) if (itemActiveIn(it, k)) { const r = itemAmts(it, k); cE += r.total; expPaid += r.paid; }
  for (const it of getItems("karla", "expenses")) if (itemActiveIn(it, k)) { const r = itemAmts(it, k); kE += r.total; expPaid += r.paid; }
  const income = cI + kI, expenses = cE + kE, toPay = expenses - expPaid;
  const toReceive = income - incRecv;
  // Projected math excludes already-paid expenses (only what you still OWE reduces funds).
  return {
    cI, kI, cE, kE, income, expenses, savings: income - toPay,
    incomeReceived: incRecv, expensePaid: expPaid,
    toReceive, toPay,
    // Net change to funds still pending this month. For the CURRENT month, income
    // already received + expenses already paid are baked into accountsTotal(), so
    // only what's still to receive/pay moves the balance — using `savings` here would
    // double-count already-received income. For future months this equals `savings`.
    netPending: toReceive - toPay,
  };
}

function runningFundsAt(k) {
  let bal = accountsTotal();
  for (const mk of timeline()) { bal += monthTotals(mk).netPending; if (mk === k) break; }
  return bal + projectFundEffect(k);
}

// Current cash on hand right now = the account balances you maintain.
function currentMoneyAt() { return accountsTotal(); }

// Auto-complete recurring expenses whose due-day has passed (current month),
// and migrate a parsed due-day into the item so it survives name edits.
function reconcileAutoPaid() {
  let changed = false;
  const curK = currentKey();
  const inTimeline = timeline().includes(curK);
  const today = new Date().getDate();
  for (const who of ["charlie", "karla"]) {
    for (const it of getItems(who, "expenses")) {
      if (it.dueDay == null) {
        const d = parseDueDay(it.name);
        if (d != null) { it.dueDay = d; changed = true; }
      }
      if (inTimeline && it.recurring && itemActiveIn(it, curK)) {
        const d = dueDayFor(it);
        if (d != null && today >= d) {
          appData.paid[curK] = appData.paid[curK] || {};
          if (appData.paid[curK][it.id] === undefined) { appData.paid[curK][it.id] = true; changed = true; }
        }
      }
    }
  }
  return changed;
}

function allInstallments() {
  const out = [];
  for (const who of ["charlie", "karla"]) {
    for (const it of getItems(who, "expenses")) {
      if (it.recurring && it.end && !it.virtual) out.push({ ...it, who });
    }
  }
  return out;
}

// =============================
// Rendering
// =============================
function clampSelected() {
  const t = timeline();
  if (!selectedKey || !t.includes(selectedKey)) {
    selectedKey = t.includes(currentKey()) ? currentKey() : t[0];
  }
}

function renderAll() {
  if (!appData) return;
  clampSelected();
  updateHeader();
  renderMonthStrip();
  if (!stripPositioned) { stripPositioned = true; scrollChipIntoView(true); }
  renderBudget();
}
let stripPositioned = false;

function updateHeader() {
  $("current-month-display").textContent = monthName(selectedKey).toUpperCase();
  $("current-year-display").textContent = keyParts(selectedKey).y;
}

function renderMonthStrip() {
  const strip = $("month-strip");
  const nowK = currentKey();
  // months grouped by year: the year sits on its own line above its months
  const groups = [];
  for (const k of timeline()) {
    const { y } = keyParts(k);
    if (!groups.length || groups[groups.length - 1].y !== y) groups.push({ y, keys: [] });
    groups[groups.length - 1].keys.push(k);
  }
  strip.innerHTML = groups.map((g, gi) => `<div class="flex-shrink-0 ${gi ? "pl-2 ml-2 border-l border-slate-700" : ""}">
    <p class="sticky text-[10px] font-bold text-slate-500 px-4 w-max" style="left:0">${g.y}</p>
    <div class="flex items-center">${g.keys.map((k) => {
      const active = k === selectedKey;
      const isNow = k === nowK;
      const cls = active ? "is-active text-white" : isNow ? "text-slate-200" : "text-slate-400";
      return `<button onclick="selectMonth('${k}')" data-k="${k}" class="month-chip ${isNow ? "is-now" : ""} flex-shrink-0 relative px-4 h-12 text-sm font-bold transition-colors ${cls}">${MONTHS_SHORT[keyParts(k).m]}${isNow ? '<span class="now-dot"></span>' : ""}</button>`;
    }).join("")}</div>
  </div>`).join("") + '<div class="flex-shrink-0" style="width:60%" aria-hidden="true"></div>';
  // phones: a slim stepper instead of a long strip of pills
  const stp = $("month-stepper");
  if (stp) {
    const tl = timeline();
    const at = tl.indexOf(selectedKey);
    const prev = at > 0 ? tl[at - 1] : null;
    const next = at >= 0 && at < tl.length - 1 ? tl[at + 1] : null;
    const arrow = (k, icon, label) => `<button ${k ? `onclick="selectMonth('${k}')"` : "disabled"} aria-label="${label}" class="flex-shrink-0 w-12 h-12 rounded-xl border border-slate-700 text-slate-100 flex items-center justify-center ${k ? "" : "opacity-30"}"><span class="material-icons">${icon}</span></button>`;
    stp.innerHTML = `${arrow(prev, "chevron_left", "Previous month")}
      <div class="flex-1 h-12 rounded-xl bg-slate-800 text-sm font-bold text-white flex items-center justify-center">${monthShort(selectedKey)}</div>
      ${arrow(next, "chevron_right", "Next month")}`;
  }
  renderMonthBanner();
}

// Scroll the selected chip into view only on an explicit pick (not on every render/load).
// The selected month sits at the left edge of the strip (earlier months scroll off to the left).
function scrollChipIntoView(instant) {
  const strip = $("month-strip");
  const btn = strip?.querySelector(`[data-k="${selectedKey}"]`);
  if (!btn) return;
  const left = btn.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft - 16;
  strip.scrollTo({ left: Math.max(0, left), behavior: instant ? "auto" : "smooth" });
}

function renderMonthBanner() {
  const el = $("month-banner");
  if (!el) return;
  const nowK = currentKey();
  if (selectedKey === nowK) { el.innerHTML = ""; el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  const when = cmpKey(selectedKey, nowK) > 0 ? "Future month" : "Past month";
  const jump = timeline().includes(nowK)
    ? `<button onclick="selectMonth('${nowK}')" class="btn-sm btn-solid"><span class="material-icons" style="font-size:16px">undo</span>Back to ${monthShort(nowK)}</button>`
    : "";
  el.innerHTML = `<div class="flex items-center justify-between gap-3">
    <span class="text-sm font-bold text-slate-400">${when}</span>
    ${jump}
  </div>`;
}

// A sub-expense row (checked/edited individually).
function childRowHtml(parentId, c, k, who) {
  const paid = isPaid(c.id, k);
  const est = Number(c.amount) || 0;
  const spent = spentIn(c.id, k);
  const hasSpend = getSpendList(c.id, k).length > 0;
  const over = spent > est;
  const pct = est > 0 ? Math.min(100, Math.round((spent / est) * 100)) : (spent > 0 ? 100 : 0);
  const remaining = est - spent;
  // Right-side amount: the locked final once checked, otherwise the budgeted estimate.
  const rightMain = paid ? childFinal(c, k) : est;
  // Show a spend tracker line only while tracking is in progress (has entries, not yet locked).
  const spendLine = (hasSpend && !paid)
    ? `<div class="child-spendline flex items-center gap-1.5 mt-1">
        <div class="flex-1 h-1 bg-slate-900/70 rounded-full overflow-hidden max-w-[130px]"><div class="h-full ${over ? "bg-rose-500" : "bg-gradient-to-r from-emerald-500 to-teal-400"} rounded-full" style="width:${pct}%"></div></div>
        <span class="text-[10px] font-bold ${over ? "text-rose-400" : "text-emerald-400"}">${over ? `over ${peso(-remaining)}` : `${peso(remaining)} left`}</span>
      </div>`
    : "";
  return `<div data-child="${c.id}" onclick="openChildModal('${who}','${parentId}','${c.id}')" class="item-row flex items-center gap-2 py-1.5 pl-2 rounded-lg cursor-pointer ${paid ? "opacity-60" : ""}">
    <button onclick="togglePaidQuick(event,'${c.id}','expenses')" title="Mark paid" class="paid-check ${paid ? "is-paid bg-emerald-500 border-emerald-500" : "border-slate-600"} w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 border">
      <span class="material-icons check-icon text-white" style="font-size:16px">check</span>
    </button>
    ${rowIconHtml(c.name, 24)}
    <div class="flex-1 min-w-0">
      <span class="item-name block text-[13px] font-bold text-slate-300 truncate ${paid ? "line-through" : ""}">${escapeHtml(c.name)}</span>
      ${spendLine}
    </div>
    <span class="child-amt text-[13px] font-black text-slate-100 flex-shrink-0">${peso(rightMain)}</span>
  </div>`;
}
// An expandable parent (its amount = sum of sub-expenses).
function parentRowHtml(it, k, kind, who, opts = {}) {
  const kids = getKids(it).filter((c) => kidActive(c, k));
  const total = itemTotal(it, k);
  const paidCount = kids.filter((c) => isPaid(c.id, k)).length;
  const allPaid = kids.length > 0 && paidCount === kids.length;
  const pct = kids.length ? Math.round((paidCount / kids.length) * 100) : 0;
  const icon = opts.hideIcon ? null : iconFor(it.name);
  const iconInner = icon
    ? `<img src="assets/banks/${icon}.png" alt="" class="w-full h-full object-cover" />`
    : `<span class="material-icons text-white" style="font-size:20px">home_work</span>`;
  const iconBg = icon ? "" : "bg-gradient-to-br from-violet-500 to-fuchsia-600";
  const childRows = kids.map((c) => childRowHtml(it.id, c, k, who)).join("");
  return `<details open class="item-parent glass-card rounded-2xl overflow-hidden my-1.5" data-parent="${it.id}" data-who="${who}">
    <summary class="parent-summary flex items-center gap-3 px-4 py-3.5 cursor-pointer list-none bg-gradient-to-r from-violet-500/[0.12] via-violet-500/[0.04] to-transparent ${allPaid ? "opacity-70" : ""}">
      <div class="acct-icon ${iconBg} flex-shrink-0">${iconInner}</div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5">
          <p class="item-name text-base font-black text-white truncate ${allPaid ? "line-through" : ""}">${escapeHtml(it.name)}</p>
          <span class="parent-caret material-icons text-violet-300/70 flex-shrink-0" style="font-size:18px">chevron_right</span>
        </div>
        <div class="flex items-center gap-2 mt-1.5">
          <div class="flex-1 h-1.5 bg-slate-900/60 rounded-full overflow-hidden max-w-[150px]"><div class="parent-bar h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full transition-all duration-300" style="width:${pct}%"></div></div>
          <span class="text-[10px] font-black text-violet-300 uppercase tracking-wide flex-shrink-0"><span class="parent-paid-count">${paidCount}</span>/${kids.length} paid</span>
        </div>
      </div>
      <p class="text-base font-black text-white flex-shrink-0">${peso(total)}</p>
    </summary>
    <div class="px-4 pb-2 pt-1 space-y-0.5">
      ${childRows}
      <button onclick="openChildModal('${who}','${it.id}',null)" class="w-full py-2 text-[11px] font-bold text-violet-300/80 hover:text-violet-200 flex items-center justify-center gap-1 rounded-lg"><span class="material-icons" style="font-size:14px">add</span>Add sub-expense</button>
    </div>
  </details>`;
}

// Monthly budget row (Extra Spending): always reserves its full amount; logged spends only shrink what's "left".
function budgetRowHtml(it, k, kind, who) {
  const amt = amountIn(it, k);
  const settled = isPaid(it.id, k);
  const spent = spentIn(it.id, k);
  const over = spent > amt;
  const pct = amt > 0 ? Math.min(100, Math.round((spent / amt) * 100)) : 0;
  const list = getSpendList(it.id, k);
  const chips = list.map((e) => `<button onclick="deleteBudgetSpend(event,'${it.id}','${e.id}')" title="Remove" class="px-2 py-1 rounded-lg bg-slate-800 text-[11px] font-bold text-slate-300 flex items-center gap-1">${peso(e.amount)}<span class="material-icons text-slate-500" style="font-size:12px">close</span></button>`).join("");
  return `<div class="budget-row glass-card rounded-2xl border ${over ? "border-rose-500/40" : "border-slate-700"} overflow-hidden my-2" data-budget="${it.id}">
  <div onclick="openItemModal('${who}','${kind}','${it.id}')" class="px-4 py-4 cursor-pointer">
    <div class="flex items-center justify-between gap-3">
      <p class="item-name text-sm font-bold text-slate-400 truncate">${escapeHtml(it.name)}</p>
      <button onclick="toggleBudgetAdd(event,'${it.id}')" class="text-[11px] font-bold text-cyan-400 flex items-center gap-1 transition-transform"><span class="material-icons" style="font-size:14px">add</span>Add spend</button>
    </div>
    <p class="text-2xl font-black leading-none mt-2 ${over ? "text-rose-400" : "text-white"}">${over ? `-${peso(spent - amt)}` : peso(amt - spent)}</p>
    <p class="text-[10px] font-bold text-slate-400 mt-2">${over ? "over" : "left"} of ${peso(amt)}</p>
    <div class="mt-4 h-2 rounded-full overflow-hidden" style="background:#2A2C31"><div class="h-full ${over ? "bg-rose-400" : "bg-emerald-400"} rounded-full" style="width:${pct}%"></div></div>
  </div>
  <div id="budget-add-${it.id}" class="hidden px-4 pb-3">
    <div class="flex items-center gap-2">
      <input type="number" id="budget-amt-${it.id}" inputmode="decimal" placeholder="Spent  ₱0" onclick="event.stopPropagation()" onkeydown="if(event.key==='Enter'){event.preventDefault();addBudgetSpend('${it.id}');}" class="spend-amt bg-slate-900 rounded-xl text-[13px] font-bold text-white focus:outline-none" />
      <button type="button" onclick="addBudgetSpend('${it.id}')" title="Log spending" class="flex-shrink-0 w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 flex items-center justify-center active:scale-95 transition-transform"><span class="material-icons" style="font-size:22px">check</span></button>
    </div>
    ${chips ? `<div class="flex flex-wrap gap-1.5 mt-2">${chips}</div>` : ""}
  </div>
  </div>`;
}
window.toggleBudgetAdd = function (e, id) {
  e.stopPropagation();
  const el = $("budget-add-" + id);
  if (!el) return;
  el.classList.toggle("hidden");
  if (!el.classList.contains("hidden")) setTimeout(() => $("budget-amt-" + id)?.focus(), 40);
};
window.addBudgetSpend = async function (id) {
  const amount = parseFloat($("budget-amt-" + id)?.value) || 0;
  if (!amount) return toast("Amount required", "error");
  const k = selectedKey;
  const cur = getSpendList(id, k);
  cur.push({ id: generateId(), amount });
  appData.spend = appData.spend || {};
  appData.spend[k] = appData.spend[k] || {};
  appData.spend[k][id] = cur;
  await syncSet();
  renderAll();
  toast("Logged");
  window.toggleBudgetAdd({ stopPropagation() {} }, id);
};
window.deleteBudgetSpend = async function (e, id, entryId) {
  e.stopPropagation();
  const k = selectedKey;
  appData.spend = appData.spend || {};
  appData.spend[k] = appData.spend[k] || {};
  appData.spend[k][id] = getSpendList(id, k).filter((x) => x.id !== entryId);
  await syncSet();
  renderAll();
  window.toggleBudgetAdd({ stopPropagation() {} }, id);
};

function itemRowHtml(it, k, kind, who, opts = {}) {
  if (getKids(it).length) return parentRowHtml(it, k, kind, who, opts);
  if (it.budget || it.id === "extra-spending") return budgetRowHtml(it, k, kind, who);
  const amt = amountIn(it, k);
  const settled = isPaid(it.id, k); // income => received, expense => paid
  const iconHtml = opts.hideIcon ? "" : rowIconHtml(it.name, 28);
  const installment = it.recurring && it.end;
  const dd = dueDayFor(it);
  const tags = [];
  if (installment) tags.push(`<span class="text-[9px] font-bold text-amber-400/80">→ ${monthShort(it.end)}</span>`);
  else if (it.recurring && everyMonths(it) === 3) tags.push(`<span class="text-[9px] font-bold text-indigo-300/90 uppercase tracking-wide flex items-center gap-0.5"><span class="material-icons" style="font-size:11px">autorenew</span>Quarterly</span>`);
  else if (it.recurring && dd != null) tags.push(`<span class="text-[9px] font-bold text-sky-300 uppercase tracking-wide flex items-center gap-0.5"><span class="material-icons" style="font-size:11px">event_available</span>${ordinal(dd)}</span>`);
  let progress = "";
  if (installment) {
    const total = paymentCount(it);
    const paidM = monthsPaidCount(it);
    const pct = total ? Math.round((paidM / total) * 100) : 0;
    progress = `<div class="flex items-center gap-2 mt-1.5 max-w-[220px]">
      <div class="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden"><div class="inst-bar-fill h-full bg-gradient-to-r ${OWNERS[who].grad} rounded-full" style="width:${pct}%"></div></div>
      <span class="inst-bar-count text-[9px] font-bold text-slate-500 flex-shrink-0">${paidM}/${total}</span>
    </div>`;
  }
  return `<div ${it.virtual ? "" : `onclick="openItemModal('${who}','${kind}','${it.id}')"`}
    class="item-row flex items-center gap-3 py-2.5 px-3 rounded-xl transition-colors cursor-pointer ${settled ? "opacity-60" : ""}">
    <button onclick="togglePaidQuick(event,'${it.id}','${kind}')" title="${kind === "income" ? "Mark received" : "Mark paid"}" class="paid-check ${settled ? "is-paid bg-emerald-500 border-emerald-500" : "border-slate-600"} w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 border">
      <span class="material-icons check-icon text-white" style="font-size:16px">check</span>
    </button>
    ${iconHtml}
    <div class="flex-1 min-w-0">
      <p class="item-name text-sm font-bold text-slate-200 truncate ${settled ? "line-through" : ""}">${escapeHtml(it.name)}</p>
      ${tags.length ? `<div class="flex gap-2 mt-0.5">${tags.join("")}</div>` : ""}
      ${progress}
    </div>
    <p class="text-sm font-black ${kind === "income" ? "text-emerald-400" : "text-slate-100"} flex-shrink-0">${peso(amt)}</p>
  </div>`;
}

// 0 auto-pay · 1 recurring (no end) · 2 installment (has end) · 3 one-time
function itemCategory(it) {
  if (!it.recurring) return 3;
  if (dueDayFor(it) != null) return 0;
  if (it.end) return 2;
  return 1;
}
const CATEGORY_LABELS = ["Auto-pay", "Recurring", "Installments", "One-time"];
const BANK_LABELS = { maribank: "Maribank", gcash: "GCash", bpi: "BPI", metrobank: "Metrobank", bdo: "BDO", unionbank: "UnionBank", gotyme: "GoTyme", komo: "Komo" };

function sortItems(items) {
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => {
      const ca = itemCategory(a.it), cb = itemCategory(b.it);
      if (ca !== cb) return ca - cb;
      if (ca === 0) return (dueDayFor(a.it) - dueDayFor(b.it)) || a.i - b.i; // auto-pay: earliest day first
      if (ca === 2) return cmpKey(a.it.end, b.it.end) || a.i - b.i; // installments: closest to finish first
      return a.i - b.i;
    })
    .map((x) => x.it);
}

// Category sub-groups (Auto-pay/Recurring/Installments/One-time), headers only when >1 group.
function categoryGroupedHtml(items, k, kind, who) {
  if (!items.length) return "";
  const sorted = sortItems(items);
  const showHeaders = new Set(sorted.map(itemCategory)).size > 1;
  let html = "", lastCat = -1;
  for (const it of sorted) {
    const c = itemCategory(it);
    if (showHeaders && c !== lastCat) {
      html += `<p class="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600 px-3 pt-2 pb-0.5">${CATEGORY_LABELS[c]}</p>`;
      lastCat = c;
    }
    html += itemRowHtml(it, k, kind, who);
  }
  return html;
}

// A bank owned across items -> one icon + name + total, each item a sub-row (like accounts).
function bankGroupHtml(bank, list, k, kind, who) {
  const total = list.reduce((s, it) => s + amountIn(it, k), 0);
  const subs = sortItems(list).map((it) => itemRowHtml(it, k, kind, who, { hideIcon: true })).join("");
  return `<div class="py-1">
    <div class="flex items-center gap-3 px-3 py-2">
      <div class="acct-icon flex-shrink-0"><img src="assets/banks/${bank}.png" alt="" class="w-full h-full object-cover" /></div>
      <p class="text-sm font-black text-white flex-1 min-w-0 truncate">${BANK_LABELS[bank] || bank}</p>
      <p class="text-sm font-black text-slate-100 flex-shrink-0">${peso(total)}</p>
    </div>
    <div class="ml-4 pl-3 border-l border-slate-700/60 space-y-0.5">${subs}</div>
  </div>`;
}

// Parent cards (items with sub-expenses) pinned first, then bank groups, then category groups.
function groupedRowsHtml(items, k, kind, who) {
  if (!items.length) return `<p class="text-[11px] text-slate-600 px-3 py-2">No ${kind === "income" ? "income" : "expenses"} this month</p>`;
  let html = "";
  // 1. parent expenses (with sub-expenses) always on top
  const parents = items.filter((it) => getKids(it).length);
  for (const it of parents) html += itemRowHtml(it, k, kind, who);
  // 1b. monthly budget rows (Extra Spending) right after the parent cards
  for (const it of items.filter((it) => !getKids(it).length && (it.budget || it.id === "extra-spending"))) html += itemRowHtml(it, k, kind, who);
  const rest = items.filter((it) => !getKids(it).length && !(it.budget || it.id === "extra-spending"));
  // 2. bank groups (banks with 2+ items)
  const buckets = {}, order = [];
  for (const it of rest) { const b = bankIconFor(it.name); if (b) (buckets[b] = buckets[b] || []).push(it); }
  for (const it of rest) { const b = bankIconFor(it.name); if (b && buckets[b].length > 1 && !order.includes(b)) order.push(b); }
  const grouped = new Set();
  for (const b of order) { buckets[b].forEach((it) => grouped.add(it.id)); html += bankGroupHtml(b, buckets[b], k, kind, who); }
  // 3. category groups for everything else
  html += categoryGroupedHtml(rest.filter((it) => !grouped.has(it.id)), k, kind, who);
  return html;
}

function personSectionHtml(who) {
  const o = OWNERS[who];
  const k = selectedKey;
  const income = getItems(who, "income").filter((it) => itemActiveIn(it, k));
  const expenses = getItems(who, "expenses").filter((it) => itemActiveIn(it, k));
  const t = monthTotals(k);
  const incTot = who === "charlie" ? t.cI : t.kI;
  const expTot = who === "charlie" ? t.cE : t.kE;
  const net = incTot - expTot;
  const incHtml = groupedRowsHtml(income, k, "income", who);
  // The fund transfer sits at the top so it isn't lost among the bank groups.
  const fund = expenses.find((it) => it.virtual);
  const fundHtml = fund ? `<div class="fund-row rounded-2xl mb-2">${itemRowHtml(fund, k, "expenses", who)}</div>` : "";
  const expHtml = fundHtml + groupedRowsHtml(expenses.filter((it) => !it.virtual), k, "expenses", who);
  return `<div class="glass-card rounded-2xl overflow-hidden border ${o.ring}">
    <div class="flex flex-wrap items-center justify-between gap-y-2 px-5 py-4 bg-slate-800 border-b border-slate-700">
      <div class="flex items-center gap-3">
        <img src="assets/avatar-${who}.jpg" alt="${o.label}" class="w-10 h-10 rounded-xl object-cover ring-2 ring-current ${o.text} flex-shrink-0" />
        <div>
          <h3 class="text-sm font-black ${o.text} uppercase tracking-wide">${o.label}</h3>
          <p class="text-[10px] font-bold whitespace-nowrap ${net >= 0 ? "text-emerald-300" : "text-rose-300"} mt-1">net ${signedPeso(net)}</p>
        </div>
      </div>
      <div class="flex gap-6 w-full md:w-auto whitespace-nowrap">
        <div><p class="text-[12px] font-bold text-slate-400">money in</p><p class="text-sm font-black text-emerald-300 mt-1">${peso(incTot)}</p></div>
        <div><p class="text-[12px] font-bold text-slate-400">money out</p><p class="text-sm font-black text-white mt-1">${peso(expTot)}</p></div>
      </div>
    </div>
    </div>
    <div class="p-3 space-y-3">
      <div>
        <div class="flex items-center justify-between px-3 mb-1">
          <p class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Income</p>
          <button onclick="openItemModal('${who}','income',null)" class="text-[11px] font-bold ${o.text} flex items-center gap-1 transition-transform"><span class="material-icons" style="font-size:14px">add</span>Add</button>
        </div>
        <div class="space-y-0.5">${incHtml}</div>
      </div>
      <div class="border-t border-white/[0.04] pt-3">
        <div class="flex items-center justify-between px-3 mb-1">
          <p class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Expenses</p>
          <button onclick="openItemModal('${who}','expenses',null)" class="text-[11px] font-bold ${o.text} flex items-center gap-1 transition-transform"><span class="material-icons" style="font-size:14px">add</span>Add</button>
        </div>
        <div class="space-y-0.5">${expHtml}</div>
      </div>
    </div>
  </div>`;
}

// Match an account name to a known bank icon (else null -> initial-letter squircle).
function bankIconFor(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("maribank") || n.includes("mari bank")) return "maribank";
  if (n.includes("gcash")) return "gcash";
  if (n.includes("bpi")) return "bpi";
  if (n.includes("metrobank") || n.includes("metro bank")) return "metrobank";
  if (n.includes("bdo")) return "bdo";
  if (n.includes("unionbank") || n.includes("union bank") || n === "ub") return "unionbank";
  if (n.includes("gotyme") || n.includes("go tyme")) return "gotyme";
  if (/\bkomo\b/.test(n)) return "komo";
  return null;
}
// Non-bank brand icons (these don't group; they just show on the row).
function brandIconFor(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("netflix")) return "netflix";
  if (n.includes("youtube")) return "youtube";
  if (n.includes("prulife") || n.includes("prudential")) return "prulife";
  if (n.includes("campus missionary")) return "cms";
  if (n.includes("tithe")) return "ccf";
  if (n.includes("claude")) return "claude";
  if (n.includes("eastwest") || n.includes("east west")) return "eastwest";
  return null;
}
function iconFor(name) { return bankIconFor(name) || brandIconFor(name); }
// Generic category -> Material icon (fallback when there's no brand/bank logo).
function categoryIcon(name) {
  const n = (name || "").toLowerCase();
  if (/electric|kuryent|meralco|\bpower\b/.test(n)) return "bolt";
  if (/wifi|internet|pldt|converge|\bfiber\b|broadband|gomo|globe|smart/.test(n)) return "wifi";
  if (/drinking water|purified|mineral|distilled/.test(n)) return "local_drink";
  if (/\bwater\b|tubig|maynilad|manila water/.test(n)) return "water_drop";
  if (/gas station|gasoline|petrol|diesel|motor gas|fuel/.test(n)) return "local_gas_station";
  if (/gasul|lpg|cooking gas/.test(n)) return "local_fire_department";
  if (/parking/.test(n)) return "local_parking";
  if (/grocer|palengke|market|supermarket|puregold|sm\b/.test(n)) return "shopping_cart";
  if (/laundry|labada/.test(n)) return "local_laundry_service";
  if (/extra|spending|allowance/.test(n)) return "payments";
  if (/\brent\b|renta/.test(n)) return "home";
  if (/tuition|school|educ|braces/.test(n)) return "school";
  if (/med|medicine|pharmacy|drug|health|doctor/.test(n)) return "medication";
  if (/\bcar\b|auto|vehicle|change oil/.test(n)) return "directions_car";
  if (/food|dining|resto|restaurant|\bmeal|kain/.test(n)) return "restaurant";
  if (/insurance/.test(n)) return "verified_user";
  if (/loan|utang|hulog/.test(n)) return "request_quote";
  if (/birthday|gift|regalo/.test(n)) return "cake";
  if (/tithe|church|missionary|ministry|offering/.test(n)) return "volunteer_activism";
  if (/salary|income|pay\b|sahod/.test(n)) return "payments";
  if (/pet|dog|cat|kobe|dudu/.test(n)) return "pets";
  return null;
}
// Row icon: brand/bank logo, else a category material-icon tile, else nothing.
function rowIconHtml(name, sz) {
  const brand = iconFor(name);
  if (brand) return `<div class="rounded-lg overflow-hidden flex-shrink-0" style="width:${sz}px;height:${sz}px"><img src="assets/banks/${brand}.png" alt="" class="w-full h-full object-cover" /></div>`;
  const cat = categoryIcon(name);
  if (cat) return `<div class="rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0" style="width:${sz}px;height:${sz}px"><span class="material-icons text-slate-300" style="font-size:${Math.round(sz * 0.62)}px">${cat}</span></div>`;
  return "";
}
function acctIconHtml(a) {
  const bank = bankIconFor(a.name);
  const ownerKey = a.owner === "karla" ? "karla" : "charlie";
  const letter = escapeHtml((a.name || "?").trim().charAt(0).toUpperCase() || "?");
  const inner = bank
    ? `<img src="assets/banks/${bank}.png" alt="" class="w-full h-full object-cover" />`
    : `<span class="text-lg font-black text-white">${letter}</span>`;
  const bg = bank ? "" : "bg-gradient-to-br from-indigo-500 to-violet-600";
  return `<div class="acct-icon-wrap">
    <div class="acct-icon ${bg}">${inner}</div>
    <img src="assets/avatar-${ownerKey}.jpg" alt="" class="acct-owner-badge" />
  </div>`;
}

// One standalone account row (icon + owner badge + name + owner + amount).
function acctRowHtml(a) {
  const o = OWNERS[a.owner] || OWNERS.charlie;
  return `<div onclick="openAccountModal('${a.id}')" class="item-row flex items-center gap-3 py-2.5 px-3 rounded-xl cursor-pointer">
    ${acctIconHtml(a)}
    <div class="flex-1 min-w-0">
      <p class="text-sm font-bold text-slate-200 truncate">${escapeHtml(a.name)}</p>
      <span class="text-[9px] font-bold uppercase ${o.text}">${o.label}</span>
    </div>
    <p class="text-sm font-black text-slate-100 flex-shrink-0">${peso(a.amount)}</p>
  </div>`;
}
// Same bank owned by both people -> one icon, group total, one sub-row per owner.
function acctGroupHtml(g) {
  const total = g.items.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const bank = bankIconFor(g.name);
  const letter = escapeHtml((g.name || "?").trim().charAt(0).toUpperCase() || "?");
  const inner = bank
    ? `<img src="assets/banks/${bank}.png" alt="" class="w-full h-full object-cover" />`
    : `<span class="text-lg font-black text-white">${letter}</span>`;
  const bg = bank ? "" : "bg-gradient-to-br from-indigo-500 to-violet-600";
  const subs = g.items.map((a) => {
    const o = OWNERS[a.owner] || OWNERS.charlie;
    const ok = a.owner === "karla" ? "karla" : "charlie";
    return `<div onclick="openAccountModal('${a.id}')" class="item-row flex items-center gap-2 py-1.5 pl-2 rounded-lg cursor-pointer">
      <img src="assets/avatar-${ok}.jpg" alt="" class="w-5 h-5 rounded-full object-cover flex-shrink-0 ring-1 ring-white/20" />
      <span class="text-[10px] font-bold uppercase ${o.text} flex-1">${o.label}</span>
      <span class="text-sm font-black text-slate-100 flex-shrink-0">${peso(a.amount)}</span>
    </div>`;
  }).join("");
  return `<div class="px-3 pt-2.5 pb-1.5 rounded-xl">
    <div class="flex items-center gap-3">
      <div class="acct-icon ${bg} flex-shrink-0">${inner}</div>
      <p class="text-sm font-bold text-slate-200 flex-1 min-w-0 truncate">${escapeHtml(g.name)}</p>
      <p class="text-sm font-black text-slate-100 flex-shrink-0">${peso(total)}</p>
    </div>
    <div class="mt-1 ml-4 pl-3 border-l border-slate-700/60 space-y-0.5">${subs}</div>
  </div>`;
}

function accountsCardHtml() {
  const accts = appData.accounts || [];
  // group accounts that share a bank (else by name) so a bank owned by both shows once
  const groups = [];
  const idx = {};
  for (const a of accts) {
    const key = bankIconFor(a.name) || (a.name || "").trim().toLowerCase();
    if (idx[key] === undefined) { idx[key] = groups.length; groups.push({ key, name: a.name, items: [] }); }
    groups[idx[key]].items.push(a);
  }
  const rows = accts.length
    ? groups.map((g) => (g.items.length > 1 ? acctGroupHtml(g) : acctRowHtml(g.items[0]))).join("")
    : `<p class="text-[11px] text-slate-600 px-3 py-2">No accounts yet — add your current balances.</p>`;
  const acctOpen = accountsOpen === null ? window.matchMedia("(min-width:1024px)").matches : accountsOpen;
  return `<details ${acctOpen ? "open" : ""} ontoggle="setAccountsOpen(this.open)" class="glass-card rounded-2xl overflow-hidden border border-emerald-500/10 md:col-span-2">
    <summary class="flex items-center justify-between px-5 py-4 cursor-pointer list-none">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
          <span class="material-icons text-white" style="font-size:18px">account_balance</span>
        </div>
        <div>
          <h3 class="text-sm font-black text-white uppercase tracking-wide">Accounts</h3>
          <p class="text-[10px] text-slate-400">Starting balances on hand</p>
        </div>
      </div>
      <div class="flex items-center gap-4">
        <p class="text-base font-black text-emerald-400">${peso(accountsTotal())}</p>
        <button onclick="event.preventDefault();event.stopPropagation();openAccountModal(null)" class="text-[11px] font-bold text-cyan-400 flex items-center gap-1 transition-transform"><span class="material-icons" style="font-size:14px">add</span>Add</button>
      </div>
    </summary>
    <div class="px-4 pb-4 pt-0">
      <div class="acct-list md:grid md:grid-cols-2 md:gap-x-8">${rows}</div>
    </div>
  </details>`;
}

// The 4 summary stat cells with the color/sign rules.

// The projected banner gets its own color each year.
const BANNER_GRADIENTS = [
  "from-indigo-600 to-violet-700", // 2026
  "from-blue-600 to-cyan-700", // 2027
  "from-emerald-600 to-teal-700", // 2028
  "from-rose-600 to-pink-700", // 2029
  "from-amber-600 to-orange-700", // 2030
  "from-fuchsia-600 to-purple-700", // 2031
];
function bannerGradient(k) {
  const n = BANNER_GRADIENTS.length;
  return BANNER_GRADIENTS[(((keyParts(k).y - 2026) % n) + n) % n];
}

// ---------- cash tiers (shared by the 5-month piles and the summary morph) ----------
const CASH_TIERS = [30000, 80000, 160000, 300000, 500000, 750000, 1000000];
const cashTierOf = (v) => 1 + CASH_TIERS.filter((t) => v >= t).length;
// ---------- summary card: a mini pile that morphs from this month to the next ----------
const MINI = {
  0: { body: "#FB7185", coin: "#FECDD3", e1: "#E11D48", e2: "#FB7185" },
  1: { body: "#4ADE9F", coin: "#86EFC0", e1: "#2DBE88", e2: "#34D399" },
  2: { body: "#60A5FA", coin: "#BFDBFE", e1: "#3B82F6", e2: "#60A5FA" },
  3: { body: "#A78BFA", coin: "#DDD6FE", e1: "#8B5CF6", e2: "#A78BFA" },
  4: { body: "#FBBF24", coin: "#FDE68A", e1: "#F59E0B", e2: "#FBBF24" },
  5: { body: "#FB9B6B", coin: "#FFF7ED", e1: "#F46A5C", e2: "#FB8A6B" },
  6: { body: "#7DD3FC", coin: "#FFFFFF", e1: "#4CC3E6", e2: "#79D7F1" },
  7: { body: "#E11D48", coin: "#FDE68A", e1: "#9F1239", e2: "#E11D48" },
  8: { body: "#3A3D48", coin: "#FBBF24", e1: "#2E3039", e2: "#FBBF24" },
};
// Projected money as one 3D gem: a brilliant cut spinning at a low angle, tinted by the cash tier, bigger with more money.
const GemFx = (() => {
  const TIERS = [
    { b: "#FB7185", e1: "#E11D48" }, { b: "#4ADE9F", e1: "#2DBE88" }, { b: "#60A5FA", e1: "#3B82F6" },
    { b: "#A78BFA", e1: "#8B5CF6" }, { b: "#FBBF24", e1: "#F59E0B" }, { b: "#FB9B6B", e1: "#F46A5C" },
    { b: "#7DD3FC", e1: "#4CC3E6" }, { b: "#E11D48", e1: "#9F1239" }, { b: "#4A4D5A", e1: "#23252C", hi: "#FBBF24" },
  ];
  const N = 10, hx = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const cl = (x, a, b) => Math.max(a, Math.min(b, x));
  const mixc = (a, b, t) => { const A = hx(a), B = hx(b); return "#" + A.map((c, i) => Math.round(c + (B[i] - c) * cl(t, 0, 1)).toString(16).padStart(2, "0")).join(""); };
  const ring = (r, y, off = 0) => [...Array(N)].map((_, i) => { const a = ((i + off) / N) * Math.PI * 2; return [Math.cos(a) * r, y, Math.sin(a) * r]; });
  const table = ring(0.56, 0.34), girdle = ring(1, 0), mid = ring(0.8, 0.2, 0.5), culet = [0, -0.95, 0], FACES = [];
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    FACES.push([table[i], table[j], mid[i]], [table[i], mid[i], girdle[i], mid[(i + N - 1) % N]], [mid[i], girdle[i], girdle[j]], [girdle[i], girdle[j], culet]);
  }
  FACES.push(table); FACES.forEach((f, k) => (f.id = k));
  const rot = (p, yaw, pitch) => { const [x, y, z] = p, cy = Math.cos(yaw), sy = Math.sin(yaw), x1 = x * cy + z * sy, z1 = -x * sy + z * cy, cp = Math.cos(pitch), sp = Math.sin(pitch); return [x1, y * cp - z1 * sp, y * sp + z1 * cp]; };
  const Lv = (() => { const v = [-0.45, 0.75, 0.55], m = Math.hypot(...v); return v.map((x) => x / m); })();
  function draw(ctx, W, H, tier, k, t) {
    const c = TIERS[tier], S = Math.min(W, H) * 0.34 * k * 1.5, cx = W / 2, cy = H * 0.52 + Math.sin(t * 1.6) * H * 0.03, neg = tier === 0, yaw = t * 0.55, pitch = 0.52, out = [];
    for (const f of FACES) {
      const P = f.map((p) => rot(p, yaw, pitch)), [a, b, d] = P;
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; const m = Math.hypot(...n) || 1; n = n.map((x) => x / m);
      const ctr = P.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map((x) => x / P.length);
      if (n[0] * ctr[0] + n[1] * (ctr[1] + 0.1) + n[2] * ctr[2] < 0) n = n.map((x) => -x);
      out.push({ P, n, z: ctr[2], id: f.id });
    }
    out.sort((p, q) => p.z - q.z);
    ctx.lineJoin = "round";
    for (const o of out) {
      if (o.n[2] <= -0.02 && !neg) continue;
      const d = Math.max(0, o.n[0] * Lv[0] + o.n[1] * Lv[1] + o.n[2] * Lv[2]), hv = [Lv[0], Lv[1], Lv[2] + 1], hm = Math.hypot(...hv);
      const spec = Math.pow(Math.max(0, (o.n[0] * hv[0] + o.n[1] * hv[1] + o.n[2] * hv[2]) / hm), 22), tw = Math.pow(Math.max(0, Math.sin(t * 2.2 + o.id * 1.7)), 14) * 0.5;
      const col = mixc(mixc(c.e1, c.b, 0.25 + d * 1.1), c.hi || "#ffffff", cl(spec * 1.1 + tw, 0, 0.9));
      ctx.beginPath(); o.P.forEach((p, i) => { const x = cx + p[0] * S, y = cy - p[1] * S; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath();
      if (neg) { ctx.setLineDash([3, 3]); ctx.strokeStyle = "rgba(251,113,133,.7)"; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]); }
      else { ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 0.6; ctx.stroke(); }
    }
  }
  const sizeK = (v) => cl(0.5 + 0.5 * Math.sqrt(Math.max(v, 0) / 1e6), 0.5, 1);
  function frame(ms) {
    requestAnimationFrame(frame);
    const dpr = Math.min(2, devicePixelRatio || 1);
    document.querySelectorAll(".gem-cv").forEach((cv) => {
      if (!cv.offsetParent) return;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) return;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const v = +cv.dataset.v || 0;
      draw(ctx, w, h, v <= 0 ? 0 : cashTierOf(v), +cv.dataset.s || sizeK(v), ms / 1000 + (+cv.dataset.p || 0));
    });
  }
  requestAnimationFrame(frame);
  return { colorOf: (v) => { const c = TIERS[v <= 0 ? 0 : cashTierOf(v)]; return c.hi || c.b; }, tier: (v) => TIERS[v <= 0 ? 0 : cashTierOf(v)] };
})();
// Debt jar: a gem-cut glass jar whose faceted liquid is everything still to pay, one band per installment (soonest-ending on top).
const JarFx = (() => {
  const N = 10, cl = (x, a, b) => Math.max(a, Math.min(b, x)), hx = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)), tc = (x) => (typeof x === "string" ? hx(x) : x);
  const mixc = (a, b, t) => { const A = tc(a), B = tc(b); return A.map((c, i) => Math.round(c + (B[i] - c) * cl(t, 0, 1))); }, rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
  const PAL = {
    charlie: [["#22b8d4", "#0b6d85"], ["#0e9bb8", "#075870"], ["#35c9e2", "#0d7f98"], ["#0a89a6", "#064a5e"], ["#4fd6ea", "#1296b0"]],
    karla: [["#f0506b", "#9c1f3a"], ["#e0334f", "#7c1229"], ["#f56f86", "#b02a46"]],
    joint: [["#fbbf24", "#9a6a0a"], ["#f59e0b", "#7c4a05"], ["#fcd34d", "#b7860f"]],
  };
  const ring = (r, y, off) => [...Array(N)].map((_, i) => { const a = ((i + off) / N) * Math.PI * 2; return [Math.cos(a) * r, y, Math.sin(a) * r]; });
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cr = (u, w) => [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  function mk(p, yref, nUp) {
    let n = cr(sub(p[1], p[0]), sub(p[2], p[0])); const m = Math.hypot(...n); if (m < 1e-5) return null; n = n.map((x) => x / m);
    const c = p.reduce((s, q) => [s[0] + q[0], s[1] + q[1], s[2] + q[2]], [0, 0, 0]).map((x) => x / p.length);
    if (nUp) n = [0, 1, 0]; else if (n[0] * c[0] + n[1] * (c[1] - yref) + n[2] * c[2] < 0) n = n.map((x) => -x);
    return { p, n, c };
  }
  function lathe(pr, yref) { // gem style: alternating half-step rings, triangle facets
    const R = pr.map(([r, y], k) => ring(r, y, (k % 2) * 0.5)), F = [];
    for (let k = 0; k < R.length - 1; k++) {
      const A = R[k], B = R[k + 1], o1 = (k % 2) * 0.5, o2 = ((k + 1) % 2) * 0.5;
      for (let i = 0; i < N; i++) { const j = o1 - o2 > 0 ? i + 1 : i; F.push([A[i], A[(i + 1) % N], B[((j % N) + N) % N]]); }
      for (let j = 0; j < N; j++) { const i = o2 - o1 > 0 ? j + 1 : j; F.push([B[j], B[(j + 1) % N], A[((i % N) + N) % N]]); }
    }
    return F.map((p) => mk(p, yref)).filter(Boolean);
  }
  function cap(r, y, up, off = 0) {
    const o = ring(r, y, off), i2 = ring(r * 0.55, y + 0.025, off + 0.5), F = [];
    for (let i = 0; i < N; i++) { F.push(mk([o[i], o[(i + 1) % N], i2[i]], 0, up)); F.push(mk([i2[i], i2[(i + 1) % N], o[(i + 1) % N]], 0, up)); }
    const t = [0, y + 0.04, 0]; for (let i = 0; i < N; i++) F.push(mk([t, i2[i], i2[(i + 1) % N]], 0, up));
    return F.filter(Boolean);
  }
  const G = [[0, 0], [0.5, 0.02], [0.82, 0.2], [1, 0.5], [1, 1.4], [0.84, 1.7], [0.4, 1.95], [0.4, 2.2]], YB = 1.7, Y0 = 0.04, SPAN = 3.05, PIV = 1.25, PITCH = 0.42;
  const glassF = lathe(G, 1.1), lidF = [...lathe([[0, 2.2], [0.5, 2.2], [0.5, 2.5]], 2.35), ...cap(0.5, 2.5, true)];
  const interp = (y) => { for (let k = 0; k < G.length - 1; k++) { const [a, b] = [G[k], G[k + 1]]; if (y >= a[1] && y <= b[1]) return a[0] + (b[0] - a[0]) * ((y - a[1]) / (b[1] - a[1] || 1)); } return 1; };
  const edges = (() => { const M = new Map(), k = (p) => p.map((v) => v.toFixed(3)).join(","); glassF.forEach((f, i) => { for (let e = 0; e < 3; e++) { const a = f.p[e], b = f.p[(e + 1) % 3], ka = k(a), kb = k(b), key = ka < kb ? ka + "|" + kb : kb + "|" + ka; if (!M.has(key)) M.set(key, { a, b, f: [], ring: Math.abs(a[1] - b[1]) < 1e-4 }); M.get(key).f.push(i); } }); return [...M.values()]; })();
  function liquid(lvl, bands) {
    const yL = Y0 + lvl * (YB - Y0), cuts = new Set([yL]); let acc = 0; const bandY = [];
    bands.forEach((b) => { acc += b.w; bandY.push(Y0 + acc * (yL - Y0)); cuts.add(Y0 + acc * (yL - Y0)); });
    const ys = new Set([Y0, ...G.map((g) => g[1]).filter((y) => y > Y0 + 0.01 && y < yL - 0.01), ...cuts]);
    const arr = [...ys].filter((y) => y <= yL + 1e-6).sort((a, b) => a - b), prof = arr.map((y) => [y <= 0.0401 ? 0 : interp(y) * 0.92, y]);
    const F = lathe(prof, yL / 2); F.forEach((o) => { o.band = Math.min(bands.length - 1, bandY.findIndex((by) => o.c[1] <= by + 1e-6)); });
    const C = cap(prof[prof.length - 1][0], yL, true, ((prof.length - 1) % 2) * 0.5); C.forEach((o) => (o.band = bands.length - 1));
    return { F: [...F, ...C], yL };
  }
  const rot = (p, yaw, pitch) => { const [x, y, z] = p, cy = Math.cos(yaw), sy = Math.sin(yaw), x1 = x * cy + z * sy, z1 = -x * sy + z * cy, cp = Math.cos(pitch), sp = Math.sin(pitch); return [x1, y * cp - z1 * sp, y * sp + z1 * cp]; };
  const Lv = (() => { const v = [-0.45, 0.75, 0.55], m = Math.hypot(...v); return v.map((x) => x / m); })();
  const R = (f, yaw, pitch) => ({ P: f.p.map((p) => rot(p, yaw, pitch)), n: rot(f.n, yaw, pitch), z: rot(f.c, yaw, pitch)[2], src: f });
  const light = (n, t, id) => { const d = Math.max(0, n[0] * Lv[0] + n[1] * Lv[1] + n[2] * Lv[2]), hv = [Lv[0], Lv[1], Lv[2] + 1], hm = Math.hypot(...hv), spec = Math.pow(Math.max(0, (n[0] * hv[0] + n[1] * hv[1] + n[2] * hv[2]) / hm), 22), tw = Math.pow(Math.max(0, Math.sin(t * 2.2 + id * 1.7)), 14) * 0.5; return { d, spec, tw }; };
  const path = (ctx, P, cx, cy, S) => { ctx.beginPath(); P.forEach((p, i) => { const x = cx + p[0] * S, y = cy - p[1] * S; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); };
  const ST = { sp: 0.5, dk: 0.9, wire: 0.45, lid: 0.65 };
  const PER = 5; let items = [], bands = [], lvl = 0, L = null, sel = -1, page = 0, yawA = 0, last = 0, hit = [], view = null;
  function prepare(rows, level) { // rows: soonest-ending first, {left}; adds .w (band share) and .col (ring colour)
    items = rows; lvl = cl(level, 0, 1); if (sel >= rows.length) sel = -1; if (page > Math.max(0, Math.ceil(rows.length / PER) - 1)) page = 0;
    bands = rows.slice().reverse(); const n = bands.length, mn = Math.min(0.09, 0.5 / Math.max(1, n)), tot = bands.reduce((s, b) => s + b.left, 0) || 1;
    const ws = bands.reduce((s, b) => s + Math.max(b.left / tot, mn), 0), ci = { charlie: 0, karla: 0, joint: 0 };
    bands.forEach((b) => { b.w = Math.max(b.left / tot, mn) / ws; const p = PAL[b.who] || PAL.charlie; b.pair = p[ci[b.who]++ % p.length] || p[0]; b.col = b.pair[0]; });
    L = n ? liquid(lvl, bands) : null;
  }
  function listHtml() {
    const pages = Math.max(1, Math.ceil(items.length / PER)), from = page * PER;
    const rows = items.slice(from, from + PER).map((r, j) => { const k = from + j; return `<div class="jar-row${k === sel ? " on" : ""}" onclick="JarFx.pick(${k})">
      <img src="assets/avatar-${r.who}.jpg" alt="" style="--rc:${r.col}" onerror="this.style.visibility='hidden'" />
      <span class="jn">${escapeHtml(r.name)}</span><b>${peso(r.left)}</b>
      <small>${peso(r.a)}${r.q ? "/qtr" : "/mo"} · ${r.l}${r.q ? "" : " mo"} left</small>
    </div>`; }).join("");
    const pager = pages > 1 ? `<div class="jar-pg"><button type="button" onclick="JarFx.go(-1)" ${page === 0 ? "disabled" : ""}>prev</button><span>${page + 1} / ${pages}</span><button type="button" onclick="JarFx.go(1)" ${page >= pages - 1 ? "disabled" : ""}>next</button></div>` : "";
    return rows + pager;
  }
  function refresh() { const el = document.getElementById("jarLegend"); if (el) el.innerHTML = listHtml(); }
  function pick(k) { sel = sel === k ? -1 : k; if (sel >= 0) page = Math.floor(sel / PER); refresh(); }
  function go(d) { page = cl(page + d, 0, Math.max(0, Math.ceil(items.length / PER) - 1)); refresh(); }
  function click(cv, e) {
    if (!view) return; const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    for (let k = hit.length - 1; k >= 0; k--) {
      const Q = hit[k].P.map((p) => [view.cx + p[0] * view.S, view.cy - p[1] * view.S]); let ins = false;
      for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) if ((Q[i][1] > y) !== (Q[j][1] > y) && x < ((Q[j][0] - Q[i][0]) * (y - Q[i][1])) / (Q[j][1] - Q[i][1]) + Q[i][0]) ins = !ins;
      if (ins) { pick(items.length - 1 - hit[k].band); return; }
    }
    if (sel >= 0) pick(sel);
  }
  function draw(ctx, w, h, ms) {
    const dt = Math.min(0.05, (ms - last) / 1000); last = ms; yawA += dt * 0.5;
    const t = ms / 1000, yaw = yawA, pitch = PITCH, S = Math.min(h / SPAN, w / 2.35), cx = w / 2, cy = h / 2 + PIV * Math.cos(pitch) * S + Math.sin(t * 1.4) * h * 0.006; view = { S, cx, cy };
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    const fr0 = glassF.map((f) => R(f, yaw, pitch)), gb = fr0.filter((r) => r.n[2] < 0).sort((a, b) => a.z - b.z), gf = fr0.filter((r) => r.n[2] >= 0);
    for (const o of gb) { path(ctx, o.P, cx, cy, S); ctx.fillStyle = "rgba(255,255,255,.03)"; ctx.fill(); }
    const line = (a, b, al, wd) => { const A = rot(a, yaw, pitch), B = rot(b, yaw, pitch); ctx.beginPath(); ctx.moveTo(cx + A[0] * S, cy - A[1] * S); ctx.lineTo(cx + B[0] * S, cy - B[1] * S); ctx.strokeStyle = `rgba(255,255,255,${al})`; ctx.lineWidth = wd; ctx.stroke(); };
    const EV = edges.map((e) => ({ e, nf: e.f.filter((i) => fr0[i].n[2] >= 0).length }));
    EV.forEach(({ e, nf }) => { if (nf === 0 && e.ring) line(e.a, e.b, 0.1 * ST.wire, 1); });
    hit = [];
    if (L) {
      const lq = L.F.map((f) => R(f, yaw, pitch)).filter((o) => o.n[2] > -0.02 || o.src.n[1] > 0.9).sort((a, b) => a.z - b.z);
      lq.forEach((o, k) => {
        const b = bands[o.src.band], { d, spec, tw } = light(o.n, t, k), isSel = sel >= 0 && items.length - 1 - o.src.band === sel;
        let col = mixc(mixc(b.pair[1], b.pair[0], 0.25 + d * ST.dk), [255, 255, 255], cl((spec * 1.1 + tw) * ST.sp, 0, 0.9)); if (isSel) col = mixc(col, [255, 255, 255], 0.2);
        path(ctx, o.P, cx, cy, S); ctx.fillStyle = rgb(col); ctx.fill(); ctx.strokeStyle = rgb(col); ctx.lineWidth = 0.6; ctx.stroke();
        ctx.strokeStyle = isSel ? "rgba(255,255,255,.6)" : "rgba(255,255,255,.14)"; ctx.stroke(); hit.push({ P: o.P, band: o.src.band });
      });
    }
    const fr = [...gf.map((o) => ((o.glass = 1), o)), ...lidF.map((f) => R(f, yaw, pitch)).filter((o) => o.n[2] > -0.02 || o.src.n[1] > 0.9)].sort((a, b) => a.z - b.z);
    fr.forEach((o, k) => {
      const { d, spec, tw } = light(o.n, t, k + 40); path(ctx, o.P, cx, cy, S);
      if (o.glass) { ctx.fillStyle = `rgba(255,255,255,${0.025 + d * 0.05 + (spec * 0.5 + tw * 0.25) * ST.sp})`; ctx.fill(); }
      else { const col = mixc(mixc([70, 78, 84], [172, 182, 188], 0.2 + d * 1.2), [255, 255, 255], cl((spec + tw) * ST.sp, 0, 0.8)).map((x) => Math.round(x * ST.lid)); ctx.fillStyle = rgb(col); ctx.fill(); ctx.strokeStyle = rgb(col); ctx.lineWidth = 0.6; ctx.stroke(); }
    });
    EV.forEach(({ e, nf }) => { if (e.f.length === 2 && nf === 1) line(e.a, e.b, 0.6 * ST.wire + 0.15, 1.6); else if (nf >= 1 && e.ring) line(e.a, e.b, 0.28 * ST.wire + 0.05, 1.1); });
  }
  function frame(ms) {
    requestAnimationFrame(frame);
    const dpr = Math.min(2, devicePixelRatio || 1);
    document.querySelectorAll(".jar-cv").forEach((cv) => {
      if (!cv.offsetParent) return; const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h); draw(ctx, w, h, ms);
    });
  }
  requestAnimationFrame(frame);
  return { prepare, pick, click, go, listHtml };
})();
window.JarFx = JarFx; // inline onclick handlers live outside the module scope

const gemHtml = (v) => `<div class="gem-hero" aria-hidden="true"><canvas class="gem-cv" data-hero="1" data-v="${v}"></canvas></div>`;

// ---------- summary card: gem, projected, lowest point, trend ----------
const trendK = (v) => { const a = Math.abs(v), sg = v < 0 ? "-" : ""; return a >= 1e6 ? sg + "₱" + (a / 1e6).toFixed(2) + "M" : a >= 1e5 ? sg + "₱" + Math.round(a / 1e3) + "k" : a >= 1e3 ? sg + "₱" + (a / 1e3).toFixed(1) + "k" : sg + "₱" + Math.round(a); };
function summaryParts() {
  const pts = peekMonths();
  if (pts.length < 2) return { cards: "" };
  const mx = Math.max(...pts.map((p) => p.v), 1);
  const tl = timeline();
  const cards = pts.map((p, i) => {
    const prevK = addMonths(p.k, -1), prev = i ? pts[i - 1].v : tl.includes(prevK) ? runningFundsAt(prevK) : null;
    const dl = prev == null ? null : p.v - prev;
    const delta = dl == null ? (p.k === currentKey() ? "now" : "") : (dl < 0 ? "-" : "+") + trendK(Math.abs(dl)).replace("₱", "");
    const dcol = dl == null ? "text-white/85" : dl < 0 ? "text-rose-300" : "text-emerald-300";
    const s = (0.45 + 0.55 * Math.sqrt(Math.max(p.v, 0) / mx)).toFixed(2);
    return `<div class="rounded-2xl bg-black/20 px-0.5 md:px-1 py-3 text-center min-w-0">
      <p class="text-xs font-bold text-white/85">${MONTHS_SHORT[keyParts(p.k).m]}</p>
      <canvas class="gem-cv sum-gem" data-v="${p.v}" data-s="${s}" data-p="${(i * 0.4).toFixed(1)}"></canvas>
      <p class="sum-v text-sm font-black text-white whitespace-nowrap tracking-tight">${trendK(p.v)}</p>
      <p class="sum-d text-xs font-extrabold whitespace-nowrap tracking-tight ${dcol} min-h-[16px]">${delta}</p>
    </div>`;
  }).join("");
  return {
    cards: `<div class="grid grid-cols-5 gap-1.5 md:gap-2">${cards}</div>`,
  };
}

function renderBudget() {
  const k = selectedKey;
  const t = monthTotals(k);
  const projected = runningFundsAt(k);

  const sp = summaryParts();
  const summary = `<section class="rounded-3xl overflow-hidden relative shadow-xl" id="summary-card">
    <div class="absolute inset-0 bg-gradient-to-br ${bannerGradient(k)}"></div>
    <div class="relative p-4 md:p-7 grid gap-4 md:grid-cols-[170px_260px_minmax(0,1fr)] md:gap-6 md:items-center">
      ${gemHtml(projected)}
      <div class="text-center">
        <p class="text-xs font-black text-white/85">Projected</p>
        <p id="sum-projected" class="text-4xl font-black text-white mt-1 leading-none">${peso(projected)}</p>
      </div>
      <div id="sum-cards">${sp.cards}</div>
    </div>
  </section>`;

  $("budget-body").innerHTML =
    `<div class="md:col-span-2">${summary}</div>` +
    accountsCardHtml() +
    personTabsHtml(t) +
    `<div class="person-wrap" data-who="charlie">${personSectionHtml("charlie")}</div>` +
    `<div class="person-wrap" data-who="karla">${personSectionHtml("karla")}</div>` +
    historyCardHtml();
  $("budget-body").dataset.tab = personTab;
}

// "Next 5 months": projected balance at the end of each month (the selected month + the 4 after it).
function peekMonths() {
  const tl = timeline();
  const out = [];
  for (let i = 0; i < 5; i++) {
    const k = addMonths(selectedKey, i);
    if (tl.includes(k)) out.push({ k, v: runningFundsAt(k) });
  }
  return out;
}

// Phones show one person at a time (a segmented switch); desktop shows both side by side.
let personTab = "charlie";
let accountsOpen = null; // null = default (open on desktop, closed on phones)
function personTabsHtml(t) {
  const btn = (who, label, net) => `<button onclick="setPersonTab('${who}')" data-w="${who}" class="seg-btn h-12 rounded-xl text-sm font-bold flex flex-col items-center justify-center leading-tight"><span>${label}</span><span class="text-[10px] font-bold opacity-80">${signedPeso(net)}</span></button>`;
  return `<div class="seg md:hidden grid grid-cols-2 gap-2">${btn("charlie", "Charlie", t.cI - t.cE)}${btn("karla", "Karla", t.kI - t.kE)}</div>`;
}
window.setAccountsOpen = function (open) { accountsOpen = open; };
window.setPersonTab = function (who) {
  personTab = who;
  $("budget-body").dataset.tab = who;
};

// Installments + projection live in the "More" sheet (header insights button), not the main page.
window.openMore = async function () {
  const ov = $("more-overlay");
  const fill = () => {
    const body = $("more-body");
    const inst = installmentsCardHtml() || `<div class="glass-card rounded-2xl p-6 text-center text-[12px] text-slate-500">No installments yet — add an expense with a "runs until" month.</div>`;
    body.innerHTML = inst + projectionCardHtml();
    body.querySelectorAll("details").forEach((d) => (d.open = true));
  };
  if (ov.classList.contains("open")) return fill(); // already on the screen: just refresh it
  await withWash(() => { fill(); ov.classList.add("open"); ov.scrollTop = 0; });
};
window.closeMore = async function () {
  const ov = $("more-overlay");
  if (!ov.classList.contains("open")) return;
  await withWash(() => ov.classList.remove("open"));
};

// Count how many months of an installment have been checked as paid.
function monthsPaidCount(it) {
  let count = 0, k = it.start;
  while (cmpKey(k, it.end) <= 0) {
    if (isPaid(it.id, k)) count++;
    k = addMonths(k, 1);
  }
  return count;
}

// Installments as an inline expandable card (same pattern as Accounts).
// Progress is driven by ACTUAL checked payments so ticking a month updates it live.
// =============================
// Project: pay off a loan from a fund kept out of main money
// =============================
const PROJECT_ID = "urdaneta";
const PROJECT_MOVED_ID = "proj_urdaneta_fund";
function activeProject() { return appData?.projects?.[PROJECT_ID] || null; }
// The fund transfer shows as a row in each planned month. It's generated from the project, not saved as an item.
function projectFundItem() {
  const p = activeProject();
  if (!p) return null;
  return { id: PROJECT_MOVED_ID, name: "Pag-IBIG Fund (Urdaneta House)", amount: projectPlan(p).monthly, recurring: true, start: p.fundStart, end: p.payoffMonth, virtual: true };
}
// Month-by-month loan balance from the statement, split into interest and insurance.
function projectLoanSchedule(p) {
  const rate = p.rate / 12;
  const schedule = {};
  let balance = p.loanBalance, cost = 0, k = p.balanceAsOf;
  while (balance > 0.01) {
    const interest = balance * rate;
    balance = Math.max(0, balance + interest - (p.monthly - p.insurance));
    cost += interest + p.insurance;
    schedule[k] = { balance, cost };
    k = addMonths(k, 1);
  }
  return { schedule, totalCost: cost, lastMonth: addMonths(k, -1) };
}
function projectPlan(p) {
  const { schedule, totalCost, lastMonth } = projectLoanSchedule(p);
  const end = schedule[p.payoffMonth] || schedule[lastMonth];
  const payoff = Math.round(end.balance);
  const months = monthsInclusive(p.fundStart, p.payoffMonth) - 1;
  const monthly = Math.ceil((payoff - p.fundFirst) / months / 1000) * 1000;
  return { payoff, saved: Math.round(totalCost - end.cost), monthly, lastMonth };
}
function projectTransfer(p, plan, k) {
  if (cmpKey(k, p.fundStart) < 0 || cmpKey(k, p.payoffMonth) > 0) return 0;
  return k === p.fundStart ? p.fundFirst : plan.monthly;
}
function projectMoved(k) { return isPaid(PROJECT_MOVED_ID, k); }
// Transfers run through the monthly fund row, so only the leftover after the payoff comes back to main money.
function projectFundEffect(k) {
  const p = activeProject();
  if (!p || cmpKey(k, p.payoffMonth) < 0) return 0;
  const plan = projectPlan(p);
  let total = 0;
  for (let m = p.fundStart; cmpKey(m, p.payoffMonth) <= 0; m = addMonths(m, 1)) total += projectTransfer(p, plan, m);
  return total - plan.payoff;
}
function projectSpendLimit(p, k) {
  const limit = p.spendByMonth?.[k];
  return limit != null ? Number(limit) : Number(p.spendDefault) || 0;
}
function projectMonths(p, plan) {
  const rows = [];
  let main = accountsTotal(), fund = 0, spendTotal = 0;
  for (let m = p.fundStart; cmpKey(m, p.payoffMonth) <= 0; m = addMonths(m, 1)) {
    if (projectMoved(m)) fund += projectTransfer(p, plan, m);
  }
  for (let k = currentKey(); cmpKey(k, p.payoffMonth) <= 0; k = addMonths(k, 1)) {
    const t = monthTotals(k);
    const start = main;
    const spend = projectSpendLimit(p, k);
    const planned = projectTransfer(p, plan, k);
    const moved = projectMoved(k);
    const toFund = moved ? 0 : planned;
    const bills = t.toPay - toFund; // the fund row sits in toPay but has its own column here
    const left = t.toReceive - bills;
    main += left - spend - toFund;
    spendTotal += spend;
    fund += toFund;
    rows.push({ k, start, moneyIn: t.toReceive, bills, left, spend, planned, moved, toFund, toMain: left - spend - toFund, main, fund });
  }
  const last = rows[rows.length - 1];
  if (last && last.k === p.payoffMonth) {
    last.leftover = last.fund - plan.payoff;
    last.main += last.leftover;
    last.fund = 0;
  }
  return rows;
}
window.toggleProjectMoved = async function (k) {
  appData.paid[k] = appData.paid[k] || {};
  appData.paid[k][PROJECT_MOVED_ID] = !appData.paid[k][PROJECT_MOVED_ID];
  await syncSet();
  renderAll();
  window.openMore();
};
function wholePeso(n) {
  const v = Math.round(n);
  return `${v < 0 ? "-" : ""}₱${Math.abs(v).toLocaleString("en-PH")}`;
}
function projectCardHtml() {
  const p = activeProject();
  if (!p) return "";
  const plan = projectPlan(p);
  const rows = projectMonths(p, plan);
  const last = rows[rows.length - 1];
  const tile = (label, value) => `<div class="rounded-xl bg-slate-900 px-3 py-2.5 min-w-0"><p class="text-[10px] font-bold text-slate-400">${label}</p><p class="text-sm font-black text-white truncate">${value}</p></div>`;
  const body = rows.map((r) => {
    const goal = r.k === p.payoffMonth;
    const cell = (v, cls = "") => `<td class="px-2 py-2 text-right whitespace-nowrap ${cls}">${v}</td>`;
    const moved = r.planned ? `<button onclick="toggleProjectMoved('${r.k}')" aria-label="Moved to fund, ${monthShort(r.k)}" class="w-5 h-5 rounded flex items-center justify-center ${r.moved ? "bg-emerald-600" : "bg-slate-700"}"><span class="material-icons text-white" style="font-size:14px">${r.moved ? "check" : ""}</span></button>` : "";
    return `<tr class="border-t border-slate-700/50 ${goal ? "bg-indigo-600 font-black" : ""}">
      <td class="px-2 py-2 whitespace-nowrap font-bold">${monthShort(r.k)}</td>
      ${cell(wholePeso(r.start))}${cell(wholePeso(r.moneyIn))}${cell(wholePeso(r.bills))}${cell(wholePeso(r.left))}${cell(wholePeso(r.spend))}
      ${cell(r.planned ? wholePeso(r.planned) : "—")}
      ${cell(r.toMain >= 0 ? wholePeso(r.toMain) : `Uses ${wholePeso(-r.toMain)}`)}
      ${cell(wholePeso(r.main), "font-black")}${cell(wholePeso(r.fund))}
      <td class="px-2 py-2">${moved}</td>
    </tr>`;
  }).join("");
  const head = ["Month", "Main money start", "Money in", "Bills", "Left after bills", "Left to spend", "To fund", "To main money", "Main money end", "Fund", "Moved"];
  return `<section class="glass-card rounded-2xl overflow-hidden md:col-span-2 p-4 space-y-3">
    <div class="flex items-center gap-3">
      <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0"><span class="material-icons text-white" style="font-size:18px">home</span></div>
      <div class="min-w-0"><h3 class="text-sm font-black text-white uppercase tracking-wide">${escapeHtml(p.name)}</h3><p class="text-[10px] text-slate-400">${monthShort(p.fundStart)} → ${monthShort(p.payoffMonth)}. Updates when /money changes.</p></div>
    </div>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
      ${tile("Payoff estimate", wholePeso(plan.payoff))}
      ${tile("Main money after", wholePeso(last?.main ?? 0))}
      ${tile("Fund plan", `${wholePeso(p.fundFirst)} + ${wholePeso(plan.monthly)}/mo`)}
      ${tile("Estimated savings", wholePeso(plan.saved))}
    </div>
    <div class="overflow-x-auto custom-scrollbar">
      <table class="w-full text-[11px] font-semibold text-slate-100" style="min-width:880px">
        <thead><tr class="text-[10px] text-slate-400">${head.map((h, i) => `<th class="px-2 py-2 font-bold ${i ? "text-right" : "text-left"}">${h}</th>`).join("")}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <p class="text-[10px] font-semibold text-slate-400">Main money end assumes you spend the full limit. Tick Moved after transferring to the separate fund account, and update your account balance. The exact payoff is on Pag-IBIG's Payment Order Form.</p>
  </section>`;
}

// Total installments due in month k.
function paymentLoadIn(k) {
  return allInstallments().reduce((sum, it) => sum + (itemActiveIn(it, k) ? amountIn(it, k) : 0), 0);
}
// What's left from regular salary in month k after every expense. One-time income
// (loans, back pay, 13th month) is left out so the chart shows the normal monthly picture.
function salaryIn(k) {
  return ["charlie", "karla"].reduce((sum, who) => sum + getItems(who, "income")
    .filter((it) => it.recurring && itemActiveIn(it, k))
    .reduce((s, it) => s + itemAmts(it, k).total, 0), 0);
}
function expensesIn(k) {
  return ["charlie", "karla"].reduce((sum, who) => sum + getItems(who, "expenses")
    .filter((it) => itemActiveIn(it, k) && !it.virtual)
    .reduce((s, it) => s + itemAmts(it, k).total, 0), 0);
}
const LOAD_TIGHT_BELOW = 20000;
const LOAD_STATES = {
  heavy: { label: "Heavy", color: "#FB7185", icon: "warning" },
  tight: { label: "Tight", color: "#FFB938", icon: "error_outline" },
  goods: { label: "Goods", color: "#34D399", icon: "check_circle" },
};
function paymentLoadMonths() {
  const insts = allInstallments();
  const first = currentKey();
  const last = insts.reduce((max, it) => (cmpKey(it.end, max) > 0 ? it.end : max), first);
  const months = [];
  for (let k = first; cmpKey(k, last) <= 0; k = addMonths(k, 1)) {
    const due = paymentLoadIn(k), salary = salaryIn(k), left = salary - expensesIn(k);
    months.push({
      k, due, salary, left,
      change: due - paymentLoadIn(addMonths(k, -1)),
      balance: timeline().includes(k) ? runningFundsAt(k) : null,
      state: left < 0 ? "heavy" : left < LOAD_TIGHT_BELOW ? "tight" : "goods",
      ending: insts.filter((it) => it.end === k).map((it) => it.name),
      starting: insts.filter((it) => it.start === k).map((it) => it.name),
    });
  }
  return months;
}
let loadMonths = [];
function loadReadoutHtml(m) {
  // Heavy months are still fine while the bank balance stays positive; "Short" means it doesn't.
  const short = m.balance != null && m.balance < 0;
  const state = LOAD_STATES[m.state];
  const firstGoods = loadMonths.find((x) => x.state === "goods");
  const stat = (label, value) => `<div class="min-w-0"><p class="text-[10px] font-bold text-slate-400">${label}</p><p class="text-sm font-black text-white truncate">${value}</p></div>`;
  const notes = [
    m.state === "heavy" && !short ? "Covered by savings and the loan" : "",
    m.k === firstGoods?.k ? "First month with ₱20,000 or more left" : "",
    m.ending.length ? `Last payment: ${m.ending.join(", ")}` : "",
    m.starting.length ? `Starts: ${m.starting.join(", ")}` : "",
  ].filter(Boolean).map((t) => `<p class="text-[10px] font-semibold text-slate-300 leading-snug">${escapeHtml(t)}</p>`).join("");
  return `<div class="flex items-center justify-between gap-3">
      <p class="text-lg font-black text-white">${monthShort(m.k)}</p>
      <span class="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-black" style="background:${state.color};color:#0F1012"><span class="material-icons" style="font-size:14px">${state.icon}</span>${short ? "Short" : state.label}</span>
    </div>
    <div class="grid grid-cols-2 gap-2">
      ${stat("Installments", peso(m.due))}
      ${stat("Vs last month", m.change ? signedPeso(m.change) : "Same")}
      ${stat("Salary minus expenses", `${m.left < 0 ? "-" : ""}${peso(Math.abs(m.left))}`)}
      ${stat("End-of-month balance", m.balance == null ? "Past 5-year view" : `${m.balance < 0 ? "-" : ""}${peso(Math.abs(m.balance))}`)}
    </div>
    ${notes}`;
}
window.selectLoadMonth = function (k) {
  const m = loadMonths.find((x) => x.k === k);
  const box = $("load-readout");
  if (!m || !box) return;
  box.innerHTML = loadReadoutHtml(m);
  document.querySelectorAll("#load-bars button").forEach((b) => { b.style.opacity = b.dataset.k === k ? "1" : "0.75"; });
};
function paymentLoadCardHtml() {
  if (!allInstallments().length) return "";
  loadMonths = paymentLoadMonths();
  const salary = loadMonths[0].salary;
  const peak = Math.max(...loadMonths.map((m) => m.due), salary);
  const step = 50000;
  const top = Math.ceil(peak / step) * step;
  const CHART_HEIGHT = 170;
  const y = (v) => Math.round((v / top) * CHART_HEIGHT);
  const ticks = [];
  for (let v = 0; v <= top; v += step * 2) ticks.push(v);
  const axis = ticks.map((v) => `<span class="absolute right-1.5 text-[9px] font-bold text-slate-400" style="bottom:${y(v) + 19}px">${v ? `${v / 1000}k` : "0"}</span>`).join("");
  const grid = ticks.map((v) => `<div class="absolute left-0 right-0 bg-slate-700/60" style="height:1px;bottom:${y(v)}px"></div>`).join("");
  const selected = loadMonths.find((m) => m.state === "goods") || loadMonths[0];
  const bars = loadMonths.map((m) => {
    const { y: year, m: month } = keyParts(m.k);
    const isJan = month === 0 || m.k === loadMonths[0].k;
    return `<button type="button" data-k="${m.k}" aria-label="${monthShort(m.k)}, ${peso(m.due)}, ${LOAD_STATES[m.state].label}" onclick="selectLoadMonth('${m.k}')" onmouseenter="selectLoadMonth('${m.k}')" class="relative flex-shrink-0 h-full" style="width:18px;opacity:${m.k === selected.k ? 1 : 0.75}">
      <span class="absolute bottom-0 left-px right-px" style="height:${Math.max(y(m.due), 2)}px;background:${LOAD_STATES[m.state].color};border-radius:4px 4px 0 0"></span>
      <span class="absolute left-0 right-0 text-center text-[9px] font-bold text-slate-400" style="top:${CHART_HEIGHT + 3}px">${MONTHS_SHORT[month][0]}</span>
      ${isJan ? `<span class="absolute left-0 whitespace-nowrap text-[9px] font-black text-slate-300" style="top:${CHART_HEIGHT + 15}px">${year}</span>` : ""}
    </button>`;
  }).join("");
  const legend = Object.entries(LOAD_STATES).map(([, s]) => `<span class="flex items-center gap-1 text-[10px] font-semibold text-slate-300"><span class="w-2.5 h-2.5 rounded-sm" style="background:${s.color}"></span>${s.label}</span>`).join("");
  return `<section class="glass-card rounded-2xl overflow-hidden border border-indigo-500/15 md:col-span-2 p-4 space-y-3">
    <div class="flex items-center gap-3">
      <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0"><span class="material-icons text-white" style="font-size:18px">bar_chart</span></div>
      <div class="min-w-0"><h3 class="text-sm font-black text-white uppercase tracking-wide">Payment Load</h3></div>
    </div>
    <div class="flex flex-wrap gap-x-3 gap-y-1">${legend}</div>
    <div class="flex">
      <div class="relative flex-shrink-0" style="width:30px;height:${CHART_HEIGHT + 34}px">${axis}</div>
      <div class="overflow-x-auto custom-scrollbar flex-1 min-w-0 pb-1">
        <div class="relative" style="width:${loadMonths.length * 18}px;height:${CHART_HEIGHT + 30}px">
          <div class="absolute left-0 right-0 top-0" style="height:${CHART_HEIGHT}px">
            ${grid}
            <div class="absolute left-0 right-0" style="bottom:${y(salary)}px;border-top:1px dashed #cbd5e1"></div>
            <div id="load-bars" class="absolute inset-x-0 top-0 flex" style="height:${CHART_HEIGHT}px">${bars}</div>
          </div>
        </div>
      </div>
    </div>
    <p class="text-[10px] font-semibold text-slate-400">Dashed line: monthly salary, ${peso(salary)}. Swipe for later months, tap a bar for details.</p>
    <div id="load-readout" class="rounded-xl bg-slate-900 p-3 space-y-2">${loadReadoutHtml(selected)}</div>
  </section>`;
}

function installmentsCardHtml() {
  // Nearest end date first; finished ones drop to the bottom.
  const isDone = (it) => paymentCount(it) - monthsPaidCount(it) <= 0;
  const insts = allInstallments().sort((a, b) => isDone(a) - isDone(b) || cmpKey(a.end, b.end) || a.name.localeCompare(b.name));
  if (!insts.length) return "";
  let grandRemaining = 0, grandOrig = 0, grandMonthly = 0, lastEnd = null;
  const run = [];
  insts.forEach((it) => {
    const monthsLeft = Math.max(0, paymentCount(it) - monthsPaidCount(it)), monthly = Number(it.amount) || 0;
    // Walk every payment so a smaller final payment (a monthly override) is counted correctly.
    let remaining = 0, orig = 0;
    for (let k = it.start; cmpKey(k, it.end) <= 0; k = addMonths(k, 1)) if (itemActiveIn(it, k)) { const a = amountIn(it, k); orig += a; if (!isPaid(it.id, k)) remaining += a; }
    grandOrig += orig; grandRemaining += remaining;
    if (monthsLeft > 0) { grandMonthly += monthly / everyMonths(it); if (!lastEnd || cmpKey(it.end, lastEnd) > 0) lastEnd = it.end; run.push({ name: it.name, who: it.who, left: remaining, a: monthly, l: monthsLeft, q: everyMonths(it) === 3 }); }
  });
  const lvl = grandOrig ? grandRemaining / grandOrig : 0, paidPct = Math.round((1 - lvl) * 100);
  JarFx.prepare(run, lvl);
  return `<section class="md:col-span-2 px-1 pt-2 pb-4">
    <div class="flex items-center justify-between gap-4 mb-6">
      <h3 class="text-sm font-black text-white uppercase tracking-wide">Installments</h3>
      <div class="text-right"><p class="text-2xl font-black text-cyan-300 leading-none">${peso(grandRemaining)}</p><p class="text-[12px] text-slate-400 mt-1">total left</p></div>
    </div>
    <div class="grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-x-6 gap-y-6 items-start">
      <canvas class="jar-cv" onclick="JarFx.click(this,event)" style="width:100%;max-width:320px;aspect-ratio:360/460;display:block;margin:0 auto"></canvas>
      <div>
        ${lastEnd ? `<p class="text-[15px] text-slate-400">jar is empty by ${monthShort(lastEnd)}</p>` : `<p class="text-[15px] text-emerald-400">jar is empty</p>`}
        <div class="flex gap-8 mt-6 whitespace-nowrap">
          <div><p class="text-2xl font-black text-white leading-none">${paidPct}%</p><p class="text-[12px] text-slate-500 mt-1">already paid</p></div>
          <div><p class="text-2xl font-black text-white leading-none">${peso(grandMonthly)}</p><p class="text-[12px] text-slate-500 mt-1">every month</p></div>
        </div>
        <div class="mt-6" id="jarLegend">${JarFx.listHtml()}</div>
      </div>
    </div>
  </section>`;
}

// 5-year projection as an inline collapsed card (no separate tab).
function projectionCardHtml() {
  const endBal = runningFundsAt(timeline()[HORIZON - 1]);
  return `<details class="glass-card rounded-2xl overflow-hidden border border-indigo-500/10 md:col-span-2">
    <summary class="flex items-center justify-between px-5 py-4 cursor-pointer list-none">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center"><span class="material-icons text-white" style="font-size:18px">trending_up</span></div>
        <div><h3 class="text-sm font-black text-white uppercase tracking-wide">5-Year Projection</h3><p class="text-[10px] text-slate-400">Running balance + yearly savings</p></div>
      </div>
      <p class="text-base font-black text-indigo-300">${peso(endBal)}</p>
    </summary>
    <div id="projection-inner" class="p-4 pt-0 space-y-4">${projectionInnerHtml()}</div>
  </details>`;
}

function projectionInnerHtml() {
  const keys = timeline();
  let bal = accountsTotal();
  const series = keys.map((k) => { const t = monthTotals(k); bal += t.netPending; return { k, bal, savings: t.savings, income: t.income }; });
  const years = {};
  series.forEach((s) => { const y = keyParts(s.k).y; years[y] = years[y] || { income: 0, savings: 0, endBal: s.bal }; years[y].income += s.income; years[y].savings += s.savings; years[y].endBal = s.bal; });
  const yearCards = Object.entries(years).map(([y, v]) => `
    <div class="bg-slate-900/40 rounded-xl p-3 flex items-center justify-between">
      <div><p class="text-sm font-black text-white">${y}</p><p class="text-[10px] text-slate-500">end ${peso(v.endBal)}</p></div>
      <div class="text-right"><p class="text-[9px] uppercase text-slate-500 font-bold">Saved</p><p class="text-xs font-black ${v.savings >= 0 ? "text-emerald-400" : "text-amber-400"}">${v.savings >= 0 ? "+" : ""}${peso(v.savings)}</p></div>
    </div>`).join("");
  return `<div class="space-y-2">${yearCards}</div>`;
}

// =============================
// Single-page (Budget only)
// =============================
window.selectMonth = function (k) {
  selectedKey = k;
  updateHeader();
  renderMonthStrip();
  renderBudget();
  scrollChipIntoView();
};

// =============================
// Modal — items
// =============================
// Owner choice shown with their faces (used for new items and accounts).
function ownerBtnHtml(w, on) {
  const name = w === "karla" ? "Karla" : "Charlie";
  return `<button type="button" onclick="pickOwner(this,'${w}')" data-w="${w}" data-on="${on}" class="owner-btn"><img src="assets/avatar-${w}.jpg" alt="" /><span>${name}</span></button>`;
}
function inputBlock(label, id, value, type = "text", extra = "") {
  return `<div class="space-y-1">
    <label class="text-[10px] font-bold uppercase text-slate-500 ml-1">${label}</label>
    <input type="${type}" id="${id}" value="${escapeHtml(value)}" ${extra}
      class="w-full bg-slate-900 rounded-2xl py-4 px-5 text-lg font-black text-white focus:outline-none" />
  </div>`;
}

function monthSelect(id, value, includeOngoing, minKey, span = HORIZON) {
  const opts = [];
  if (includeOngoing) opts.push(`<option value="">Ongoing (no end)</option>`);
  const keys = [];
  for (let i = 0, k = appData.startMonth; i < span; i++, k = addMonths(k, 1)) keys.push(k);
  keys.forEach((k) => {
    if (minKey && cmpKey(k, minKey) < 0) return;
    const label = `${monthName(k)} ${keyParts(k).y}`;
    opts.push(`<option value="${k}" ${k === value ? "selected" : ""}>${label}</option>`);
  });
  return opts.join("");
}

window.openItemModal = function (who, kind, id) {
  const list = getItems(who, kind);
  const it = id ? list.find((x) => x.id === id) : null;
  const isNew = !it;
  const o = OWNERS[who];
  activeEdit = { kind: "item", who, type: kind, id };

  const recurring = it ? it.recurring !== false : false; // new items default to one-time
  const every = it ? everyMonths(it) : 1;
  const start = it ? it.start : selectedKey;
  const end = it && it.end ? it.end : "";
  const name = it ? it.name : "";
  const amount = it ? amountIn(it, selectedKey) : "";
  const settledNow = it ? isPaid(it.id, selectedKey) : false;

  const title = isNew ? `Add ${kind === "income" ? "Income" : "Expense"}` : "Edit";
  $("modal-title").textContent = title;
  $("modal-title").className = `text-2xl font-black uppercase tracking-tight ${o.text}`;

  const kids = it ? getKids(it) : [];
  let body = "";
  // Whose is it? Only on a new item — the header's quick-add has no section to infer it from,
  // and it doubles as a fix for tapping the wrong person's Add.
  if (isNew) {
    body += `<div class="space-y-1"><label class="text-[10px] font-bold uppercase text-slate-500 ml-1">Whose is this?</label>
      <div class="grid grid-cols-2 gap-2" id="f-owner" data-val="${who}">
        ${["charlie", "karla"].map((w) => ownerBtnHtml(w, w === who)).join("")}
      </div></div>`;
  }
  body += inputBlock(kind === "income" ? "Where from?" : "What is it?", "f-name", name, "text", 'placeholder="e.g. Rent"');
  if (kids.length) {
    body += `<div class="space-y-1"><label class="text-[10px] font-bold uppercase text-slate-500 ml-1">How much? (₱)</label>
      <div class="w-full bg-slate-900 rounded-2xl py-4 px-5 text-base font-black text-slate-300">${peso(itemTotal(it, selectedKey))} <span class="text-[11px] font-bold text-slate-500">· sum of ${kids.length} sub-expenses</span></div></div>`;
  } else {
    body += inputBlock("How much? (₱)", "f-amount", amount, "number", 'inputmode="decimal" placeholder="0"');
  }

  // recurring toggle
  body += `<div class="flex items-center justify-between bg-slate-900 rounded-2xl px-5 py-4">
    <div><p class="text-sm font-bold text-white">Recurring</p><p class="text-[10px] text-slate-500">Repeats on a schedule</p></div>
    <button type="button" id="f-recurring" data-on="${recurring}" onclick="toggleField(this)" class="w-14 h-8 rounded-full transition-colors ${recurring ? "bg-indigo-600" : "bg-slate-700"} relative flex-shrink-0">
      <span class="absolute top-1 ${recurring ? "left-7" : "left-1"} w-6 h-6 bg-white rounded-full transition-all"></span>
    </button>
  </div>`;

  // how often a recurring item repeats
  body += `<div class="space-y-1"><label class="text-[10px] font-bold uppercase text-slate-500 ml-1">How often?</label>
    <select id="f-every" class="w-full bg-slate-900 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none">
      <option value="1" ${every === 1 ? "selected" : ""}>Every month</option>
      <option value="3" ${every === 3 ? "selected" : ""}>Quarterly (every 3 months)</option>
    </select></div>`;

  // start month
  body += `<div class="space-y-1"><label class="text-[10px] font-bold uppercase text-slate-500 ml-1">Starting</label>
    <select id="f-start" class="w-full bg-slate-900 rounded-2xl py-4 px-5 text-base font-bold text-white focus:outline-none">${monthSelect("f-start", start, false)}</select></div>`;

  // end month (installment)
  body += `<div class="space-y-1" id="f-end-wrap"><label class="text-[10px] font-bold uppercase text-slate-500 ml-1">Until when? <span class="text-slate-400">(for installments)</span></label>
    <select id="f-end" class="w-full bg-slate-900 rounded-2xl py-4 px-5 text-base font-bold text-white focus:outline-none">${monthSelect("f-end", end, true, start, 180)}</select></div>`;

  // auto-complete day of month
  const ddVal = it ? (dueDayFor(it) ?? "") : "";
  body += `<div class="space-y-1"><label class="text-[10px] font-bold uppercase text-slate-500 ml-1">Mark paid on day <span class="text-slate-400">(1-31, optional)</span></label>
    <input type="number" id="f-dueday" min="1" max="31" inputmode="numeric" value="${ddVal}" placeholder="e.g. 29" class="w-full bg-slate-900 rounded-2xl py-4 px-5 text-base font-bold text-white focus:outline-none" /></div>`;

  // scope for editing recurring amount
  if (!isNew && recurring && !kids.length) {
    body += `<div class="space-y-1"><label class="text-[10px] font-bold uppercase text-slate-500 ml-1">Apply amount to</label>
      <select id="f-scope" class="w-full bg-slate-900 rounded-2xl py-4 px-5 text-base font-bold text-white focus:outline-none">
        <option value="all">All months</option>
        <option value="month" ${hasOverride(id, selectedKey) ? "selected" : ""}>${monthName(selectedKey)} ${keyParts(selectedKey).y} only</option>
      </select></div>`;
  }

  // received / paid this month
  if (!isNew && !kids.length) {
    const verb = kind === "income" ? "Received" : "Paid";
    const hint = kind === "income" ? "Mark this month's income received" : "Mark this month settled";
    body += `<div class="flex items-center justify-between bg-slate-900 rounded-2xl px-5 py-4">
      <div><p class="text-sm font-bold text-white">${verb} in ${monthShort(selectedKey)}</p><p class="text-[10px] text-slate-500">${hint}</p></div>
      <button type="button" id="f-paid" data-on="${settledNow}" onclick="toggleField(this)" class="w-14 h-8 rounded-full transition-colors ${settledNow ? "bg-emerald-600" : "bg-slate-700"} relative flex-shrink-0">
        <span class="absolute top-1 ${settledNow ? "left-7" : "left-1"} w-6 h-6 bg-white rounded-full transition-all"></span>
      </button>
    </div>`;
  }

  if (!isNew && kind === "expenses") {
    body += `<button type="button" onclick="openChildModal('${who}','${id}',null)" class="mx-auto px-6 h-12 md:h-10 bg-cyan-400 text-slate-900 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"><span class="material-icons" style="font-size:18px">account_tree</span>Add sub-expense</button>`;
  }

  $("modal-body").innerHTML = body;
  syncRecurringFields();
  if (isNew && kind === "expenses") enhanceAddExpense();

  const delBtn = $("delete-btn");
  if (isNew) { delBtn.classList.add("hidden"); }
  else { delBtn.classList.remove("hidden"); delBtn.onclick = () => confirmDelete(); }

  openModalShell();
  if (isNew) setTimeout(() => $("f-name")?.focus(), 320); // after the sheet finishes sliding up
};

// ---- Add expense: two choices, "extra spending" (log a spend against the monthly budget) or "other expense" ----
function findExtraSpending() {
  for (const who of ["charlie", "karla"]) {
    for (const it of getItems(who, "expenses")) {
      const c = getKids(it).find((x) => /^extra spending$/i.test((x.name || "").trim()));
      if (c) return { who, parent: it, child: c };
    }
  }
  return null;
}
function enhanceAddExpense() {
  const ex = findExtraSpending();
  if (!ex) return;
  const body = $("modal-body");
  [...body.children].forEach((c) => { c.dataset.mode = "other"; });
  const left = (Number(ex.child.amount) || 0) - spentIn(ex.child.id, selectedKey);
  body.insertAdjacentHTML("afterbegin", `<div id="f-mode" class="mode-switch" role="group" aria-label="What are you adding?">
      <button type="button" class="mode-btn" data-m="extra" onclick="setExpenseMode('extra')"><span class="material-icons">payments</span>quick spend</button>
      <button type="button" class="mode-btn" data-m="other" onclick="setExpenseMode('other')"><span class="material-icons">receipt_long</span>new bill</button>
    </div>`);
  body.insertAdjacentHTML("beforeend",
    `<div data-mode="extra" class="space-y-1"><label>What did you spend on?</label><input type="text" id="f-xlabel" placeholder="e.g. grab, lunch, gas" class="w-full" /></div>` +
    `<div data-mode="extra" class="space-y-1"><label>How much? (₱)</label><input type="number" id="f-xamount" inputmode="decimal" placeholder="0" oninput="updateXLeft()" class="w-full" /></div>` +
    `<div data-mode="extra" id="f-xleft" class="spend-left-card" data-base="${left}" data-month="${monthShort(selectedKey)}"><p id="f-xnum" class="spend-left-num ${left < 0 ? "over" : ""}">${left < 0 ? "-" : ""}${peso(Math.abs(left))}</p><p id="f-xcap" class="spend-left-cap">${left < 0 ? "over" : "left"} in extra spending for ${monthShort(selectedKey)}</p></div>`);
  setExpenseMode("extra");
}
// As you type, show what would be left in extra spending after this spend.
window.updateXLeft = function () {
  const card = $("f-xleft");
  if (!card) return;
  const base = Number(card.dataset.base) || 0;
  const amt = parseFloat($("f-xamount")?.value) || 0;
  const left = base - amt;
  const num = $("f-xnum");
  num.textContent = `${left < 0 ? "-" : ""}${peso(Math.abs(left))}`;
  num.classList.toggle("over", left < 0);
  $("f-xcap").textContent = amt ? (left < 0 ? `over after this spend, ${card.dataset.month}` : `left after this spend, ${card.dataset.month}`) : `${left < 0 ? "over" : "left"} in extra spending for ${card.dataset.month}`;
};
window.setExpenseMode = function (m) {
  const body = $("modal-body");
  if (!body || !activeEdit) return;
  activeEdit.mode = m;
  body.querySelectorAll("[data-mode]").forEach((el) => { el.hidden = el.dataset.mode !== m; });
  body.querySelectorAll(".mode-btn").forEach((b) => { b.dataset.on = b.dataset.m === m; });
  setTimeout(() => $(m === "extra" ? "f-xlabel" : "f-name")?.focus(), 60);
};

// Add an expense without first picking a person — the owner buttons are in the form.
// Remembers who you picked last so the common case is one tap less.
window.quickAddExpense = function () {
  let who = "charlie";
  try { const w = localStorage.getItem("money.lastOwner"); if (w === "charlie" || w === "karla") who = w; } catch (e) {}
  openItemModal(who, "expenses", null);
};

// Sub-expense modal (add/edit a child under a parent expense).
window.openChildModal = function (who, parentId, childId) {
  const parent = getItems(who, "expenses").find((x) => x.id === parentId);
  if (!parent) return;
  const c = childId ? getKids(parent).find((x) => x.id === childId) : null;
  const isNew = !c;
  activeEdit = { kind: "child", who, parentId, id: childId };
  $("modal-title").textContent = isNew ? "Add Sub-expense" : "Edit Sub-expense";
  $("modal-title").className = "text-2xl font-black uppercase tracking-tight text-violet-300";
  const settledNow = c ? isPaid(c.id, selectedKey) : false;
  let body = `<p class="text-[11px] text-slate-500 mb-1">Under <span class="font-bold text-slate-300">${escapeHtml(parent.name)}</span></p>`;
  body += inputBlock("Name", "f-name", c ? c.name : "", "text", 'placeholder="e.g. Electricity"');
  body += inputBlock("Estimate (₱)", "f-amount", c ? c.amount : "", "number", 'inputmode="decimal" placeholder="0"');
  if (!isNew) {
    body += `<div id="spend-section">${spendSectionHtml(who, parentId, c)}</div>`;
    body += `<div class="flex items-center justify-between bg-slate-900 rounded-2xl px-5 py-4">
      <div><p class="text-sm font-bold text-white">Paid in ${monthShort(selectedKey)}</p><p class="text-[10px] text-slate-500">Locks the final for this month${getSpendList(c.id, selectedKey).length ? "" : " (at the estimate)"}</p></div>
      <button type="button" id="f-paid" data-on="${settledNow}" onclick="toggleField(this)" class="w-14 h-8 rounded-full transition-colors ${settledNow ? "bg-emerald-600" : "bg-slate-700"} relative flex-shrink-0"><span class="absolute top-1 ${settledNow ? "left-7" : "left-1"} w-6 h-6 bg-white rounded-full transition-all"></span></button>
    </div>`;
  } else {
    body += `<button type="button" onclick="saveChildAndAddAnother()" class="mx-auto px-6 h-12 md:h-10 border border-slate-600 text-slate-100 rounded-xl font-bold text-sm flex items-center justify-center gap-2"><span class="material-icons" style="font-size:18px">playlist_add</span>Save &amp; add another</button>`;
  }
  $("modal-body").innerHTML = body;
  const delBtn = $("delete-btn");
  if (isNew) delBtn.classList.add("hidden");
  else { delBtn.classList.remove("hidden"); delBtn.onclick = () => confirmDelete(); }
  openModalShell();
};

// Save the current sub-expense and immediately reopen a fresh form (batch add).
window.saveChildAndAddAnother = async function () {
  if (!activeEdit || activeEdit.kind !== "child") return;
  const name = ($("f-name")?.value || "").trim();
  const amount = parseFloat($("f-amount")?.value) || 0;
  if (!name) return toast("Name required", "error");
  const { who, parentId } = activeEdit;
  const parent = getItems(who, "expenses").find((x) => x.id === parentId);
  if (parent) {
    if (!Array.isArray(parent.children)) parent.children = [];
    parent.children.push({ id: generateId(), name, amount });
  }
  await syncSet();
  renderAll();
  openChildModal(who, parentId, null); // fresh form, modal stays open
  toast("Added");
  setTimeout(() => $("f-name")?.focus(), 60);
};

// Locate a sub-expense (child) by id, returning it with its parent + owner.
function findChildById(id) {
  for (const who of ["charlie", "karla"]) {
    for (const it of getItems(who, "expenses")) {
      const c = getKids(it).find((x) => x.id === id);
      if (c) return { c, parent: it, who };
    }
  }
  return null;
}

// The "Spending in <month>" tracker shown inside the sub-expense modal:
// running spent vs estimate, remaining/over, the logged entries, and an add row.
function spendSectionHtml(who, parentId, c) {
  const k = selectedKey;
  const list = getSpendList(c.id, k);
  const spent = spentIn(c.id, k);
  const est = Number(c.amount) || 0;
  const remaining = est - spent;
  const over = remaining < 0;
  const pct = est > 0 ? Math.min(100, Math.round((spent / est) * 100)) : (spent > 0 ? 100 : 0);
  const rows = list.map((e, i) => `
    <div class="spend-row">
      <span class="material-icons text-emerald-400" style="font-size:16px">payments</span>
      <span class="flex-1 min-w-0 truncate text-[10px] font-bold text-slate-400">${e.label ? escapeHtml(e.label) : "Spend " + (i + 1)}</span>
      <span class="text-sm font-black text-white">${peso(e.amount)}</span>
      <button type="button" onclick="deleteSpend('${e.id}')" title="Remove" class="text-slate-500 hover:text-rose-400 flex-shrink-0"><span class="material-icons" style="font-size:16px">close</span></button>
    </div>`).join("");
  return `<div class="spend-block">
    <label>Spending in ${monthShort(k)}</label>
    <p class="spend-hero ${over ? "text-rose-400" : "text-white"}">${over ? `-${peso(-remaining)}` : peso(remaining)} <span>${over ? "over" : "left"} of ${peso(est)}</span></p>
    <div class="spend-bar"><div class="${over ? "bg-rose-400" : "bg-emerald-400"}" style="width:${pct}%"></div></div>
    ${rows ? `<div class="spend-rows">${rows}</div>` : `<p class="spend-empty">No spending logged yet</p>`}
    <div class="spend-add flex items-center gap-2">
      <input type="number" id="f-spend-amount" inputmode="decimal" placeholder="How much did you spend? ₱" onkeydown="if(event.key==='Enter'){event.preventDefault();addSpend();}" class="spend-amt" />
      <button type="button" onclick="addSpend()" aria-label="Log spending" class="spend-btn"><span class="material-icons" style="font-size:22px">add</span></button>
    </div>
  </div>`;
}

// Re-render just the spend section in the open modal (keeps name/estimate inputs untouched).
function refreshSpendSection(childId) {
  const info = findChildById(childId);
  const host = $("spend-section");
  if (info && host) host.innerHTML = spendSectionHtml(info.who, info.parent.id, info.c);
}

// Log an actual spend entry against the open sub-expense, for the selected month.
window.addSpend = async function () {
  if (!activeEdit || activeEdit.kind !== "child" || !activeEdit.id) return;
  const amount = parseFloat($("f-spend-amount")?.value) || 0;
  if (!amount) return toast("Amount required", "error");
  const { id } = activeEdit, k = selectedKey;
  const cur = getSpendList(id, k);
  cur.push({ id: generateId(), amount });
  appData.spend = appData.spend || {};
  appData.spend[k] = appData.spend[k] || {};
  appData.spend[k][id] = cur;
  await syncSet();
  refreshSpendSection(id);
  renderAll();
  toast("Logged");
  setTimeout(() => $("f-spend-amount")?.focus(), 60);
};

// Remove a logged spend entry from the open sub-expense.
window.deleteSpend = async function (entryId) {
  if (!activeEdit || activeEdit.kind !== "child" || !activeEdit.id) return;
  const { id } = activeEdit, k = selectedKey;
  const cur = getSpendList(id, k).filter((e) => e.id !== entryId);
  appData.spend = appData.spend || {};
  appData.spend[k] = appData.spend[k] || {};
  appData.spend[k][id] = cur;
  await syncSet();
  refreshSpendSection(id);
  renderAll();
};

// "how often" and "until when" only mean something while Recurring is on.
function syncRecurringFields() {
  const t = $("f-recurring");
  if (!t) return;
  const on = t.dataset.on === "true";
  ["f-every", "f-end"].forEach((id) => { const w = $(id)?.closest(".space-y-1"); if (w) w.style.display = on ? "" : "none"; });
}
window.toggleField = function (btn) {
  const on = btn.dataset.on !== "true";
  btn.dataset.on = on;
  if (btn.id === "f-recurring") setTimeout(syncRecurringFields, 0);
  const knob = btn.querySelector("span");
  const isPaidToggle = btn.id === "f-paid";
  btn.className = `w-14 h-8 rounded-full transition-colors ${on ? (isPaidToggle ? "bg-emerald-600" : "bg-indigo-600") : "bg-slate-700"} relative flex-shrink-0`;
  knob.className = `absolute top-1 ${on ? "left-7" : "left-1"} w-6 h-6 bg-white rounded-full transition-all`;
};

// =============================
// Modal — accounts
// =============================
window.openAccountModal = function (id) {
  const a = id ? (appData.accounts || []).find((x) => x.id === id) : null;
  const isNew = !a;
  activeEdit = { kind: "account", id };
  $("modal-title").textContent = isNew ? "Add Account" : "Edit Account";
  $("modal-title").className = "text-2xl font-black uppercase tracking-tight text-emerald-400";

  const owner = a ? (a.owner === "joint" ? "charlie" : a.owner || "charlie") : "charlie";
  let body = "";
  body += inputBlock("Account name", "f-name", a ? a.name : "", "text", 'placeholder="e.g. BPI"');
  body += inputBlock("Balance (₱)", "f-amount", a ? a.amount : "", "number", 'inputmode="decimal" placeholder="0"');
  body += `<div class="space-y-1"><label class="text-[10px] font-bold uppercase text-slate-500 ml-1">Owner</label>
    <div class="grid grid-cols-2 gap-2" id="f-owner" data-val="${owner}">
      ${["charlie", "karla"].map((w) => ownerBtnHtml(w, w === owner)).join("")}
    </div></div>`;
  $("modal-body").innerHTML = body;

  const delBtn = $("delete-btn");
  if (isNew) delBtn.classList.add("hidden");
  else { delBtn.classList.remove("hidden"); delBtn.onclick = () => confirmDelete(); }

  openModalShell();
};

window.pickOwner = function (btn, w) {
  const wrap = $("f-owner");
  wrap.dataset.val = w;
  [...wrap.children].forEach((c) => {
    const on = c === btn;
    c.dataset.on = on;
  });
};

// =============================
// Modal shell + save + delete
// =============================
function openModalShell() {
  $("save-btn").onclick = saveModal;
  const ov = $("modal-overlay");
  ov.classList.add("open");
}
window.closeModal = function () {
  $("modal-overlay").classList.remove("open");
  activeEdit = null;
};

window.saveModal = async function () {
  if (!activeEdit) return;
  if (activeEdit.mode === "extra") {
    const ex = findExtraSpending();
    const amt = parseFloat($("f-xamount")?.value) || 0;
    if (!ex) return toast("Extra Spending not found", "error");
    if (!amt) return toast("Amount required", "error");
    const label = ($("f-xlabel")?.value || "").trim();
    const k = selectedKey;
    const cur = getSpendList(ex.child.id, k);
    cur.push({ id: generateId(), amount: amt, ...(label ? { label } : {}) });
    appData.spend = appData.spend || {};
    appData.spend[k] = appData.spend[k] || {};
    appData.spend[k][ex.child.id] = cur;
    await syncSet();
    closeModal(); renderAll(); toast("Logged"); celebrate();
    return;
  }
  const name = ($("f-name")?.value || "").trim();
  const amount = parseFloat($("f-amount")?.value) || 0;

  if (activeEdit.kind === "account") {
    if (!name) return toast("Name required", "error");
    const owner = $("f-owner").dataset.val;
    if (activeEdit.id) {
      const a = appData.accounts.find((x) => x.id === activeEdit.id);
      if (a) { a.name = name; a.amount = amount; a.owner = owner; }
    } else {
      appData.accounts.push({ id: generateId(), name, amount, owner });
    }
    await syncSet();
    closeModal(); renderAll(); toast("Saved"); celebrate();
    return;
  }

  if (activeEdit.kind === "child") {
    if (!name) return toast("Name required", "error");
    const { who, parentId, id } = activeEdit;
    const parent = getItems(who, "expenses").find((x) => x.id === parentId);
    if (parent) {
      if (!Array.isArray(parent.children)) parent.children = [];
      if (id) {
        const c = parent.children.find((x) => x.id === id);
        if (c) { c.name = name; c.amount = amount; }
        const pf = $("f-paid");
        if (pf) { appData.paid[selectedKey] = appData.paid[selectedKey] || {}; appData.paid[selectedKey][id] = pf.dataset.on === "true"; }
      } else {
        parent.children.push({ id: generateId(), name, amount });
      }
    }
    await syncSet();
    closeModal(); renderAll(); toast("Saved"); celebrate();
    return;
  }

  // item
  if (!name) return toast("Name required", "error");
  const { type, id } = activeEdit;
  let who = activeEdit.who;
  if (!id && $("f-owner")) {
    who = $("f-owner").dataset.val;
    try { localStorage.setItem("money.lastOwner", who); } catch (e) {}
  }
  const recurring = $("f-recurring").dataset.on === "true";
  const every = recurring && $("f-every")?.value === "3" ? 3 : null;
  const start = $("f-start").value;
  const end = $("f-end").value || null;
  const ddInput = $("f-dueday");
  let dueDay = null;
  if (ddInput && ddInput.value !== "") { const d = parseInt(ddInput.value, 10); if (d >= 1 && d <= 31) dueDay = d; }
  const list = appData.items[who][type];

  if (id) {
    const it = list.find((x) => x.id === id);
    if (it) {
      it.name = name;
      it.recurring = recurring;
      it.every = every;
      it.start = start;
      it.end = recurring ? end : null;
      it.dueDay = dueDay;
      const scope = $("f-scope") ? $("f-scope").value : "all";
      if (getKids(it).length) {
        // amount is derived from sub-expenses; leave it.amount untouched
      } else if (recurring && scope === "month") {
        appData.overrides[selectedKey] = appData.overrides[selectedKey] || {};
        appData.overrides[selectedKey][id] = amount;
      } else {
        it.amount = amount;
        if (appData.overrides[selectedKey]) delete appData.overrides[selectedKey][id];
      }
    }
    // paid toggle
    const pf = $("f-paid");
    if (pf) {
      const on = pf.dataset.on === "true";
      appData.paid[selectedKey] = appData.paid[selectedKey] || {};
      appData.paid[selectedKey][id] = on;
    }
  } else {
    list.push({ id: generateId(), name, amount, start, end: recurring ? end : null, recurring, every, dueDay });
  }
  await syncSet();
  closeModal(); renderAll(); toast("Saved"); celebrate();
};

window.togglePaidQuick = async function (event, id, kind) {
  event.stopPropagation();
  const btn = event.currentTarget;
  appData.paid[selectedKey] = appData.paid[selectedKey] || {};
  const nowSettled = appData.paid[selectedKey][id] !== true;
  appData.paid[selectedKey][id] = nowSettled; // explicit true/false so auto-complete won't re-check a manual uncheck
  applyPaidVisual(btn, nowSettled); // surgical — no full re-render, no scroll jump
  updateInstallmentBar(btn, id);    // keep the mini progress bar in sync
  updateParentBadge(id);            // if this is a sub-expense, refresh its parent's X/Y badge
  // A sub-expense with logged spending settles at its actual total, not the estimate — reflect that in place.
  const childInfo = findChildById(id);
  if (childInfo) {
    const row = btn.closest(".item-row");
    const amtEl = row?.querySelector(".child-amt");
    if (amtEl) amtEl.textContent = peso(nowSettled ? childFinal(childInfo.c, selectedKey) : (Number(childInfo.c.amount) || 0));
    const line = row?.querySelector(".child-spendline");
    if (line) line.style.display = nowSettled ? "none" : "";
  }
  if (nowSettled) {
    const valEl = btn.closest(".item-row")?.lastElementChild; // the amount, right side
    flashLabel(valEl || btn, kind === "income" ? "Received!" : "Paid!");
  }
  refreshRealized();
  await syncSet();
};

// When a sub-expense is toggled, update its parent's "X/Y paid" badge + all-paid styling.
function updateParentBadge(childId) {
  let parent = null;
  for (const who of ["charlie", "karla"]) {
    for (const it of getItems(who, "expenses")) {
      if (getKids(it).some((c) => c.id === childId)) { parent = it; break; }
    }
    if (parent) break;
  }
  if (!parent) return;
  const details = document.querySelector(`details.item-parent[data-parent="${parent.id}"]`);
  if (!details) return;
  const kids = getKids(parent);
  const paidCount = kids.filter((c) => isPaid(c.id, selectedKey)).length;
  const allPaid = kids.length > 0 && paidCount === kids.length;
  const countEl = details.querySelector(".parent-paid-count");
  if (countEl) countEl.textContent = paidCount;
  const bar = details.querySelector(".parent-bar");
  if (bar) bar.style.width = (kids.length ? Math.round((paidCount / kids.length) * 100) : 0) + "%";
  const summary = details.querySelector("summary");
  const name = summary?.querySelector(".item-name");
  if (summary) summary.classList.toggle("opacity-70", allPaid);
  if (name) name.classList.toggle("line-through", allPaid);
}

function findItemById(id) {
  for (const who of ["charlie", "karla"]) {
    for (const kind of ["income", "expenses"]) {
      const it = getItems(who, kind).find((x) => x.id === id);
      if (it) return it;
    }
  }
  return null;
}
// Refresh an installment row's mini progress bar in place after a paid toggle.
function updateInstallmentBar(btn, id) {
  const it = findItemById(id);
  if (!it || !it.recurring || !it.end) return;
  const row = btn.closest(".item-row");
  if (!row) return;
  const total = paymentCount(it);
  const paidM = monthsPaidCount(it);
  const fill = row.querySelector(".inst-bar-fill");
  const cnt = row.querySelector(".inst-bar-count");
  if (fill) fill.style.width = (total ? Math.round((paidM / total) * 100) : 0) + "%";
  if (cnt) cnt.textContent = `${paidM}/${total}`;
}

// Floating "Received!" / "Paid!" pop above the checkbox.
function flashLabel(anchorEl, text) {
  const r = anchorEl.getBoundingClientRect();
  const el = document.createElement("div");
  el.className = "flash-label";
  el.textContent = text;
  el.style.left = `${r.left + r.width / 2}px`;
  el.style.top = `${r.top - 4}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

function applyPaidVisual(btn, settled) {
  const row = btn.closest(".item-row");
  const name = row ? row.querySelector(".item-name") : null;
  if (settled) {
    btn.classList.add("is-paid", "bg-emerald-500", "border-emerald-500");
    btn.classList.remove("border-slate-600");
    if (row) row.classList.add("opacity-60");
    if (name) name.classList.add("line-through");
    btn.classList.remove("paid-burst"); void btn.offsetWidth; btn.classList.add("paid-burst");
    if (row) { row.classList.remove("row-sweep"); void row.offsetWidth; row.classList.add("row-sweep"); setTimeout(() => row.classList.remove("row-sweep"), 750); }
  } else {
    btn.classList.remove("is-paid", "bg-emerald-500", "border-emerald-500");
    btn.classList.add("border-slate-600");
    if (row) row.classList.remove("opacity-60");
    if (name) name.classList.remove("line-through");
  }
}

// Recompute only the numbers that shift when marking received/paid (no full re-render).
function refreshRealized() {
  const t = monthTotals(selectedKey);
  const proj = $("sum-projected");
  if (proj) proj.textContent = peso(runningFundsAt(selectedKey));
  const gcv = document.querySelector(".gem-cv[data-hero]"); // the gem follows the projected number
  if (gcv) gcv.dataset.v = runningFundsAt(selectedKey);
  const sp = summaryParts(); // lowest point + trend follow too
  const cdEl = $("sum-cards"); if (cdEl) cdEl.innerHTML = sp.cards;
  const pi = $("projection-inner"); // inline projection card — refresh in place
  if (pi) pi.innerHTML = projectionInnerHtml();
}

// --- delete via confirm ---
function confirmDelete() {
  const c = $("confirm-overlay");
  c.classList.add("open");
  c.style.opacity = "1"; c.style.pointerEvents = "auto";
  $("confirm-action-btn").onclick = doDelete;
}
window.closeConfirm = function () {
  const c = $("confirm-overlay");
  c.classList.remove("open");
  c.style.opacity = "0"; c.style.pointerEvents = "none";
};
async function doDelete() {
  if (!activeEdit) return;
  if (activeEdit.kind === "account") {
    appData.accounts = appData.accounts.filter((a) => a.id !== activeEdit.id);
  } else if (activeEdit.kind === "child") {
    const { who, parentId, id } = activeEdit;
    const parent = getItems(who, "expenses").find((x) => x.id === parentId);
    if (parent && Array.isArray(parent.children)) parent.children = parent.children.filter((c) => c.id !== id);
    for (const k of Object.keys(appData.paid)) delete appData.paid[k][id];
    for (const k of Object.keys(appData.spend || {})) { if (appData.spend[k]) delete appData.spend[k][id]; }
  } else {
    const { who, type, id } = activeEdit;
    appData.items[who][type] = appData.items[who][type].filter((x) => x.id !== id);
    // clean orphaned per-month state
    for (const k of Object.keys(appData.paid)) delete appData.paid[k][id];
    for (const k of Object.keys(appData.overrides)) delete appData.overrides[k][id];
  }
  await syncSet();
  closeConfirm(); closeModal(); renderAll(); toast("Deleted");
}

// =============================
// Toast
// =============================
let toastTimer = null;
function toast(msg, type = "ok") {
  const t = $("toast");
  $("toast-text").textContent = msg;
  const icon = $("toast-icon");
  icon.textContent = type === "error" ? "error" : "check_circle";
  icon.className = `material-icons text-lg ${type === "error" ? "text-rose-400" : "text-emerald-400"}`;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2000);
}

// =============================
// Money rain celebration
// =============================
function celebrate() {
  const canvas = $("money-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.opacity = "1";
  const gemColors = ["#FB9B6B", "#4ADE9F", "#60A5FA", "#A78BFA", "#FBBF24", "#7DD3FC"];
  const bills = Array.from({ length: 18 }, () => ({
    x: Math.random() * canvas.width,
    y: -40 - Math.random() * 200,
    vy: 3 + Math.random() * 4,
    vx: (Math.random() - 0.5) * 2,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.2,
    e: gemColors[Math.floor(Math.random() * gemColors.length)],
    size: 24 + Math.random() * 16,
  }));
  let frames = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    bills.forEach((b) => {
      b.y += b.vy; b.x += b.vx; b.rot += b.vr;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      const g = b.size / 24; // a small brilliant-cut gem instead of emoji
      ctx.scale(g, g);
      ctx.fillStyle = b.e; ctx.beginPath(); ctx.moveTo(-12, -2); ctx.lineTo(-6, -10); ctx.lineTo(6, -10); ctx.lineTo(12, -2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = b.e; ctx.beginPath(); ctx.moveTo(-12, -2); ctx.lineTo(12, -2); ctx.lineTo(0, 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.beginPath(); ctx.moveTo(-12, -2); ctx.lineTo(12, -2); ctx.lineTo(0, 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.moveTo(-6, -10); ctx.lineTo(6, -10); ctx.lineTo(3, -2); ctx.lineTo(-3, -2); ctx.closePath(); ctx.fill();
      ctx.restore();
    });
    frames++;
    if (frames < 90) requestAnimationFrame(draw);
    else { canvas.style.opacity = "0"; ctx.clearRect(0, 0, canvas.width, canvas.height); }
  }
  draw();
}

// =============================
// Background particles
// =============================
function initParticles() {
  const app = $("app");
  if (!app) return;
  const colors = ["#3DD9F0", "#34D399", "#FFB938", "#FB7185"];
  for (let i = 0; i < 8; i++) {
    const p = document.createElement("div");
    p.className = "bg-particle";
    const size = 3 + Math.random() * 4;
    p.style.cssText = `width:${size}px;height:${size}px;left:${5 + Math.random() * 90}%;bottom:-10px;background:${colors[Math.floor(Math.random() * colors.length)]};animation-duration:${12 + Math.random() * 18}s;animation-delay:${Math.random() * 10}s;`;
    app.appendChild(p);
  }
}

// =============================
// Boot
// =============================
// Liquid wash: a sheet in the current month's gem colour rises like the debt jar filling (rippling surface), swap() runs while it covers
// the screen, then it drains back down. Used for splash -> app and for opening/closing the overview screen.
// Web Animations API on purpose: it ignores the OS reduce-motion setting.
async function liquidWash(swap) {
  const W = innerWidth, H = innerHeight;
  const wash = (() => { try { return GemFx.colorOf(runningFundsAt(currentKey())); } catch (e) { return "#3DD9F0"; } })(); // gem colour of the current month
  const light = (() => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(wash.slice(i, i + 2), 16)); return "#" + [r, g, b].map((v) => Math.round(v + (255 - v) * 0.3).toString(16).padStart(2, "0")).join(""); })();
  const P = 130, n = Math.ceil(W / P), SW = 2 * n * P; // wave period 130px: shifting by n whole periods loops seamlessly
  const wavePath = (y) => { let d = `M0 ${y}`; for (let x = 0; x <= SW; x += 65) d += x ? ` T${x + 65} ${y}` : ` Q32 ${y - 4} 65 ${y}`; return d; };
  const wave = (c, top) => `<svg width="${SW}" height="40" viewBox="0 0 ${SW} 40" style="position:absolute;left:0;top:${top}px;display:block"><path d="${wavePath(20)}V40H0Z" fill="${c}"/></svg>`;
  const box = (css, parent) => { const d = document.createElement("div"); d.style.cssText = css; parent.appendChild(d); return d; };
  const loop = (el, ms, dir) => el.animate([{ transform: "translateX(0)" }, { transform: `translateX(${dir * -n * P}px)` }], { duration: ms, iterations: Infinity, easing: "linear" });
  const c = document.createElement("div");
  c.style.cssText = "position:fixed;inset:0;z-index:200;overflow:hidden;pointer-events:auto"; // blocks taps while the wash runs
  document.body.appendChild(c);
  const g = box(`position:absolute;left:0;right:0;top:0;height:${H + 80}px;transform:translateY(${H + 50}px)`, c);
  const w1 = box("position:absolute;left:0;right:0;top:0;height:40px", g); w1.innerHTML = wave(light, -33);
  box(`position:absolute;left:0;right:0;top:0;bottom:0;background:${light}`, g);
  box(`position:absolute;left:0;right:0;top:12px;bottom:0;background:${wash}`, g);
  const w2 = box("position:absolute;left:0;right:0;top:12px;height:40px", g); w2.innerHTML = wave(wash, -39);
  loop(w1.firstChild, 1300, 1); loop(w2.firstChild, 900, -1);
  await g.animate([{ transform: `translateY(${H + 50}px)` }, { transform: "translateY(-20px)" }], { duration: 900, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" }).finished;
  try { await swap(); } catch (e) { console.error(e); }
  await new Promise((r) => setTimeout(r, 150));
  await g.animate([{ transform: "translateY(-20px)" }, { transform: `translateY(${H + 60}px)` }], { duration: 900, easing: "cubic-bezier(.6,0,.4,1)", fill: "forwards" }).finished;
  c.remove();
}
let washing = false;
async function withWash(swap) { if (washing) return; washing = true; try { await liquidWash(swap); } finally { washing = false; } }

let revealing = false;
async function revealApp() {
  if (revealing) return;
  revealing = true;
  const intro = $("intro-screen");
  const app = $("app");
  await withWash(() => {
    intro.style.display = "none";
    intro.style.pointerEvents = "none";
    app.style.opacity = "1";
    scrollChipIntoView(true);
    if (document.fonts?.ready) document.fonts.ready.then(() => scrollChipIntoView(true));
    initParticles();
  });
}

function runIntro() {
  const tag = $("intro-tag");
  setTimeout(() => { if (tag) tag.style.opacity = "1"; }, 1150);
}

// =============================
// Keyboard
// =============================
// Escape closes the topmost layer; Enter inside an open form saves it.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if ($("confirm-overlay").classList.contains("open")) return closeConfirm();
    if ($("modal-overlay").classList.contains("open")) return closeModal();
    if ($("more-overlay").classList.contains("open")) return closeMore();
    return;
  }
  if (e.key !== "Enter") return;
  if (!$("modal-overlay").classList.contains("open")) return;
  const el = e.target;
  if (!el) return;
  if (el.id === "f-spend-amount") return; // that field logs its own entry on Enter
  if (el.tagName === "BUTTON" || el.tagName === "TEXTAREA") return;
  e.preventDefault();
  saveModal();
});

let firstLoad = true;
function boot() {
  runIntro();
  onValue(query(historyRef, limitToLast(HISTORY_SHOWN)), (snap) => {
    historyEntries = Object.values(snap.val() || {}).sort((a, b) => b.ts - a.ts);
    refreshHistoryUi();
  }, (err) => console.error(err));
  onValue(dbRef, (snap) => {
    // Skip re-render for the echo of our own writes (appData is already current locally).
    if (!firstLoad && pendingEchoes > 0) { pendingEchoes--; return; }
    const val = snap.val();
    appData = val ? normalize(val) : emptyData();
    logBaseline = clone(appData);
    // One-time fix: the Extra Spending sub-expense counts from Nov 2026, not from the parent's July start.
    if (val && !appData.extraStartFixed) {
      appData.extraStartFixed = true;
      for (const who of ["charlie", "karla"]) for (const it of getItems(who, "expenses")) for (const c of getKids(it)) if (c.name === "Extra Spending" && !c.start) c.start = "2026-11";
      syncSet();
    }
    // One-time seed: the monthly Extra Spending budget (never re-created if deleted later).
    if (val && !appData.extraSeeded) {
      appData.extraSeeded = true;
      appData.items.charlie.expenses.push({ id: "extra-spending", name: "Extra Spending", amount: 15000, recurring: true, start: appData.startMonth, budget: true });
      syncSet();
    }
    if (reconcileAutoPaid()) syncSet();
    if (firstLoad) {
      firstLoad = false;
      clampSelected();
      renderAll();
      setTimeout(revealApp, 1900);
    } else {
      renderAll();
    }
  }, (err) => {
    console.error(err);
    appData = emptyData();
    renderAll();
    revealApp();
    toast("Offline — check connection", "error");
  });

  // safety: reveal even if Firebase is slow
  setTimeout(() => {
    if (firstLoad) {
      firstLoad = false;
      appData = appData || emptyData();
      renderAll();
      revealApp();
    }
  }, 4000);
}

boot();
