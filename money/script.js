import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  set,
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
  joint: { label: "Joint", who: "joint", accent: "indigo", text: "text-indigo-400", ring: "border-indigo-500/20", grad: "from-indigo-500 to-violet-600" },
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
  pendingEchoes++;
  showSync();
  try { await set(dbRef, appData); }
  catch (e) { pendingEchoes = Math.max(0, pendingEchoes - 1); console.error(e); toast("Sync failed", "error"); }
  finally { setTimeout(hideSync, 400); }
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
  return d;
}

function emptyData() {
  return normalize({ startMonth: currentKey() });
}

// =============================
// Data accessors
// =============================
function getItems(who, kind) { return appData.items?.[who]?.[kind] || []; }
function itemActiveIn(it, k) {
  if (!it.recurring) return it.start === k;
  if (cmpKey(k, it.start) < 0) return false;
  if (it.end && cmpKey(k, it.end) > 0) return false;
  return true;
}
function amountIn(it, k) {
  const ov = appData.overrides?.[k]?.[it.id];
  return ov != null ? Number(ov) : Number(it.amount) || 0;
}
function hasOverride(id, k) { return appData.overrides?.[k]?.[id] != null; }
function isPaid(id, k) { return !!appData.paid?.[k]?.[id]; }
function accountsTotal() { return (appData.accounts || []).reduce((s, a) => s + (Number(a.amount) || 0), 0); }

function monthTotals(k) {
  let cI = 0, kI = 0, cE = 0, kE = 0, incRecv = 0, expPaid = 0;
  for (const it of getItems("charlie", "income")) if (itemActiveIn(it, k)) { const a = amountIn(it, k); cI += a; if (isPaid(it.id, k)) incRecv += a; }
  for (const it of getItems("karla", "income")) if (itemActiveIn(it, k)) { const a = amountIn(it, k); kI += a; if (isPaid(it.id, k)) incRecv += a; }
  for (const it of getItems("charlie", "expenses")) if (itemActiveIn(it, k)) { const a = amountIn(it, k); cE += a; if (isPaid(it.id, k)) expPaid += a; }
  for (const it of getItems("karla", "expenses")) if (itemActiveIn(it, k)) { const a = amountIn(it, k); kE += a; if (isPaid(it.id, k)) expPaid += a; }
  const income = cI + kI, expenses = cE + kE, toPay = expenses - expPaid;
  // Projected math excludes already-paid expenses (only what you still OWE reduces funds).
  return {
    cI, kI, cE, kE, income, expenses, savings: income - toPay,
    incomeReceived: incRecv, expensePaid: expPaid,
    toReceive: income - incRecv, toPay,
  };
}

function runningFundsAt(k) {
  let bal = accountsTotal();
  for (const mk of timeline()) { bal += monthTotals(mk).savings; if (mk === k) break; }
  return bal;
}

// Current cash on hand right now = the account balances you maintain.
function currentMoneyAt() { return accountsTotal(); }

function allInstallments() {
  const out = [];
  for (const who of ["charlie", "karla"]) {
    for (const it of getItems(who, "expenses")) {
      if (it.recurring && it.end) out.push({ ...it, who });
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
  renderBudget();
}

function updateHeader() {
  $("current-month-display").textContent = monthName(selectedKey).toUpperCase();
  $("current-year-display").textContent = keyParts(selectedKey).y;
}

function renderMonthStrip() {
  const strip = $("month-strip");
  const nowK = currentKey();
  strip.innerHTML = timeline().map((k) => {
    const active = k === selectedKey;
    const isNow = k === nowK;
    const cls = active
      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/40 ring-2 ring-indigo-400/60"
      : "bg-slate-800/60 text-slate-400";
    return `<button onclick="selectMonth('${k}')" data-k="${k}"
      class="month-chip ${isNow ? "is-now" : ""} flex-shrink-0 relative px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wide transition-colors ${cls}">
      ${isNow ? '<span class="now-banner">Now</span>' : ""}${monthShort(k)}
    </button>`;
  }).join("");
  renderMonthBanner();
}

// Scroll the selected chip into view only on an explicit pick (not on every render/load).
function scrollChipIntoView() {
  const btn = $("month-strip")?.querySelector(`[data-k="${selectedKey}"]`);
  if (btn) btn.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
}

function renderMonthBanner() {
  const el = $("month-banner");
  if (!el) return;
  const nowK = currentKey();
  if (selectedKey === nowK) { el.innerHTML = ""; el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  const label = `${monthName(selectedKey)} ${keyParts(selectedKey).y}`;
  const jump = timeline().includes(nowK)
    ? `<button onclick="selectMonth('${nowK}')" class="text-[11px] font-black uppercase tracking-wider text-white bg-indigo-500/80 hover:bg-indigo-500 rounded-lg px-3 py-1.5 flex items-center gap-1.5 shadow-lg shadow-indigo-900/30 transition-colors"><span class="material-icons" style="font-size:15px">undo</span>Back to ${monthShort(nowK)}</button>`
    : "";
  el.innerHTML = `<div class="flex items-center justify-between gap-2 py-2 pl-4 pr-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
    <span class="text-[11px] font-black uppercase tracking-wider text-amber-400">Viewing ${label}</span>
    ${jump}
  </div>`;
}

function itemRowHtml(it, k, kind, who) {
  const amt = amountIn(it, k);
  const settled = isPaid(it.id, k); // income => received, expense => paid
  const installment = it.recurring && it.end;
  const tags = [];
  if (installment) tags.push(`<span class="text-[9px] font-bold text-amber-400/80">→ ${monthShort(it.end)}</span>`);
  else if (it.recurring) tags.push(`<span class="text-[9px] font-bold text-indigo-300/90 uppercase tracking-wide flex items-center gap-0.5"><span class="material-icons" style="font-size:11px">autorenew</span>Recurring</span>`);
  return `<div onclick="openItemModal('${who}','${kind}','${it.id}')"
    class="item-row flex items-center gap-3 py-2.5 px-3 rounded-xl transition-colors cursor-pointer ${settled ? "opacity-60" : ""}">
    <button onclick="togglePaidQuick(event,'${it.id}','${kind}')" title="${kind === "income" ? "Mark received" : "Mark paid"}" class="paid-check ${settled ? "is-paid bg-emerald-500 border-emerald-500" : "border-slate-600"} w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 border">
      <span class="material-icons check-icon text-white" style="font-size:16px">check</span>
    </button>
    <div class="flex-1 min-w-0">
      <p class="item-name text-sm font-bold text-slate-200 truncate ${settled ? "line-through" : ""}">${escapeHtml(it.name)}</p>
      ${tags.length ? `<div class="flex gap-2 mt-0.5">${tags.join("")}</div>` : ""}
    </div>
    <p class="text-sm font-black ${kind === "income" ? "text-emerald-400" : "text-slate-100"} flex-shrink-0">${peso(amt)}</p>
  </div>`;
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
  const incHtml = income.length
    ? income.map((it) => itemRowHtml(it, k, "income", who)).join("")
    : `<p class="text-[11px] text-slate-600 px-3 py-2">No income this month</p>`;
  const expHtml = expenses.length
    ? expenses.map((it) => itemRowHtml(it, k, "expenses", who)).join("")
    : `<p class="text-[11px] text-slate-600 px-3 py-2">No expenses this month</p>`;
  return `<div class="glass-card rounded-2xl overflow-hidden border ${o.ring}">
    <div class="flex items-center justify-between px-5 py-4 bg-gradient-to-r ${o.grad} bg-opacity-10">
      <div class="flex items-center gap-3">
        <img src="assets/avatar-${who}.jpg" alt="${o.label}" class="w-9 h-9 rounded-xl object-cover ring-2 ring-white/25 flex-shrink-0" />
        <div>
          <h3 class="text-sm font-black text-white uppercase tracking-wide">${o.label}</h3>
          <p class="text-[10px] font-bold ${net >= 0 ? "text-emerald-300" : "text-rose-300"}">net ${net >= 0 ? "+" : ""}${peso(net)}</p>
        </div>
      </div>
      <div class="text-right">
        <p class="text-[9px] font-bold uppercase text-white/60">in / out</p>
        <p class="text-[11px] font-black text-white">${peso(incTot)} <span class="text-white/40">·</span> ${peso(expTot)}</p>
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
  return null;
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

function accountsCardHtml() {
  const accts = appData.accounts || [];
  const rows = accts.length
    ? accts.map((a) => {
        const o = OWNERS[a.owner] || OWNERS.charlie;
        return `<div onclick="openAccountModal('${a.id}')" class="item-row flex items-center gap-3 py-2.5 px-3 rounded-xl cursor-pointer">
          ${acctIconHtml(a)}
          <div class="flex-1 min-w-0">
            <p class="text-sm font-bold text-slate-200 truncate">${escapeHtml(a.name)}</p>
            <span class="text-[9px] font-bold uppercase ${o.text}">${o.label}</span>
          </div>
          <p class="text-sm font-black text-slate-100 flex-shrink-0">${peso(a.amount)}</p>
        </div>`;
      }).join("")
    : `<p class="text-[11px] text-slate-600 px-3 py-2">No accounts yet — add your current balances.</p>`;
  return `<details class="glass-card rounded-2xl overflow-hidden border border-emerald-500/10 md:col-span-2">
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
      <p class="text-base font-black text-emerald-400">${peso(accountsTotal())}</p>
    </summary>
    <div class="p-3 pt-0 space-y-0.5">
      ${rows}
      <button onclick="openAccountModal(null)" class="w-full mt-2 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl font-bold text-emerald-400 text-[11px] flex items-center justify-center gap-1 transition-transform"><span class="material-icons" style="font-size:16px">add</span>Add account</button>
    </div>
  </details>`;
}

// The 4 summary stat cells with the color/sign rules.
function statsGridHtml(t) {
  const current = currentMoneyAt();
  const savColor = t.savings > 0.005 ? "text-emerald-300" : t.savings < -0.005 ? "text-rose-300" : "text-amber-300";
  const cell = (icon, iconColor, label, valColor, val) =>
    `<div class="bg-black/20 rounded-2xl px-4 py-3">
      <div class="flex items-center gap-1.5">
        <span class="material-icons ${iconColor}" style="font-size:13px">${icon}</span>
        <p class="text-[9px] font-bold uppercase text-white/60">${label}</p>
      </div>
      <p class="text-base font-black ${valColor} mt-1">${val}</p>
    </div>`;
  return (
    cell("account_balance_wallet", "text-white/70", "Current Money", "text-white", peso(current)) +
    cell("savings", savColor, "Savings", savColor, signedPeso(t.savings)) +
    cell("south_west", "text-emerald-300", "To receive", "text-emerald-300", signedPeso(t.toReceive)) +
    cell("north_east", "text-rose-300", "To pay", "text-rose-300", signedPeso(-t.toPay))
  );
}

function renderBudget() {
  const k = selectedKey;
  const t = monthTotals(k);
  const projected = runningFundsAt(k);

  const summary = `<section class="md:col-span-2 rounded-3xl overflow-hidden relative shadow-xl">
    <div class="absolute inset-0 bg-gradient-to-br from-indigo-600 to-violet-700"></div>
    <div class="ambient-glow" style="top:-30px;right:60px"></div>
    <div class="relative p-6 md:p-7 space-y-5">
      <div>
        <p class="text-[10px] font-black uppercase tracking-[0.3em] text-white/60">Projected · end of ${monthName(k)}</p>
        <p id="sum-projected" class="text-4xl md:text-5xl font-black text-white mt-1 leading-none">${peso(projected)}</p>
      </div>
      <div id="sum-stats" class="grid grid-cols-2 md:grid-cols-4 gap-3">${statsGridHtml(t)}</div>
    </div>
  </section>`;

  $("budget-body").innerHTML =
    summary +
    accountsCardHtml() +
    personSectionHtml("charlie") +
    personSectionHtml("karla");
}

// Installments + projection live in the "More" sheet (header insights button), not the main page.
window.openMore = function () {
  const body = $("more-body");
  const inst = installmentsCardHtml() || `<div class="glass-card rounded-2xl p-6 text-center text-[12px] text-slate-500">No installments yet — add an expense with a "runs until" month.</div>`;
  body.innerHTML = inst + projectionCardHtml();
  body.querySelectorAll("details").forEach((d) => (d.open = true));
  const ov = $("more-overlay");
  ov.classList.add("open");
};
window.closeMore = function () {
  $("more-overlay").classList.remove("open");
};

// Installments as an inline expandable card (same pattern as Accounts).
function installmentsCardHtml() {
  const insts = allInstallments();
  if (!insts.length) return "";
  const nowK = currentKey();
  let grandRemaining = 0, grandMonthly = 0;
  const rows = insts.map((it) => {
    const o = OWNERS[it.who];
    const total = monthsInclusive(it.start, it.end);
    const startCount = cmpKey(nowK, it.start) > 0 ? nowK : it.start;
    let monthsLeft, monthsPaid;
    if (cmpKey(nowK, it.end) > 0) { monthsLeft = 0; monthsPaid = total; }
    else { monthsLeft = monthsInclusive(startCount, it.end); monthsPaid = total - monthsLeft; }
    const monthly = Number(it.amount) || 0;
    const remaining = monthly * monthsLeft;
    const pct = total ? Math.round((monthsPaid / total) * 100) : 0;
    grandRemaining += remaining; if (monthsLeft > 0) grandMonthly += monthly;
    const urgency = monthsLeft === 0 ? "text-emerald-400 bg-emerald-500/15" : monthsLeft <= 6 ? "text-rose-400 bg-rose-500/15" : monthsLeft <= 12 ? "text-amber-400 bg-amber-500/15" : "text-slate-400 bg-slate-500/15";
    return `<div class="px-3 py-2.5 rounded-xl space-y-2">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2"><p class="text-sm font-bold text-slate-200 truncate">${escapeHtml(it.name)}</p><span class="text-[9px] font-bold uppercase ${o.text}">${o.label}</span></div>
          <p class="text-[10px] text-slate-500">${monthShort(it.start)} → ${monthShort(it.end)} · ${peso(monthly)}/mo · ${peso(remaining)} left</p>
        </div>
        <span class="text-[10px] font-black px-2.5 py-1 rounded-lg ${urgency} uppercase flex-shrink-0">${monthsLeft === 0 ? "Done" : monthsLeft + " mo left"}</span>
      </div>
      <div class="h-2 bg-slate-900/60 rounded-full overflow-hidden"><div class="h-full bg-gradient-to-r ${o.grad} rounded-full" style="width:${pct}%"></div></div>
    </div>`;
  }).join("");
  return `<details class="glass-card rounded-2xl overflow-hidden border border-fuchsia-500/15 md:col-span-2">
    <summary class="flex items-center justify-between px-5 py-4 cursor-pointer list-none">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-600 flex items-center justify-center"><span class="material-icons text-white" style="font-size:18px">hourglass_top</span></div>
        <div><h3 class="text-sm font-black text-white uppercase tracking-wide">Installments</h3><p class="text-[10px] text-slate-400">${insts.length} running · ${peso(grandMonthly)}/mo</p></div>
      </div>
      <p class="text-base font-black text-fuchsia-300">${peso(grandRemaining)}</p>
    </summary>
    <div class="p-3 pt-0 space-y-1">${rows}</div>
  </details>`;
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
  const series = keys.map((k) => { const t = monthTotals(k); bal += t.savings; return { k, bal, savings: t.savings, income: t.income }; });
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
  if ($("month-picker").classList.contains("open")) toggleMonthPicker();
};

// =============================
// Month picker
// =============================
window.toggleMonthPicker = function () {
  const mp = $("month-picker");
  const open = mp.classList.toggle("open");
  mp.style.opacity = open ? "1" : "0";
  mp.style.pointerEvents = open ? "auto" : "none";
  if (open) {
    const years = {};
    timeline().forEach((k) => { const y = keyParts(k).y; (years[y] = years[y] || []).push(k); });
    $("month-picker-grid").innerHTML = Object.entries(years).map(([y, keys]) => `
      <div>
        <p class="text-xs font-black uppercase tracking-[0.3em] text-slate-500 mb-3">${y}</p>
        <div class="grid grid-cols-3 gap-3">
          ${keys.map((k) => `<button onclick="selectMonth('${k}')" class="py-4 rounded-2xl font-black text-sm ${k === selectedKey ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-300"} transition-transform">${MONTHS_SHORT[keyParts(k).m]}</button>`).join("")}
        </div>
      </div>`).join("");
  }
};

// =============================
// Modal — items
// =============================
function inputBlock(label, id, value, type = "text", extra = "") {
  return `<div class="space-y-1">
    <label class="text-[10px] font-bold uppercase text-slate-500 ml-1">${label}</label>
    <input type="${type}" id="${id}" value="${escapeHtml(value)}" ${extra}
      class="w-full bg-slate-900 rounded-2xl py-4 px-5 text-lg font-black text-white focus:outline-none" />
  </div>`;
}

function monthSelect(id, value, includeOngoing, minKey) {
  const opts = [];
  if (includeOngoing) opts.push(`<option value="">Ongoing (no end)</option>`);
  timeline().forEach((k) => {
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

  const recurring = it ? it.recurring !== false : true;
  const start = it ? it.start : selectedKey;
  const end = it && it.end ? it.end : "";
  const name = it ? it.name : "";
  const amount = it ? amountIn(it, selectedKey) : "";
  const settledNow = it ? isPaid(it.id, selectedKey) : false;

  const title = isNew ? `Add ${kind === "income" ? "Income" : "Expense"}` : "Edit";
  $("modal-title").textContent = title;
  $("modal-title").className = `text-2xl font-black uppercase tracking-tight ${o.text}`;

  let body = "";
  body += inputBlock(kind === "income" ? "Source" : "Name", "f-name", name, "text", 'placeholder="e.g. Rent"');
  body += inputBlock("Amount (₱)", "f-amount", amount, "number", 'inputmode="decimal" placeholder="0"');

  // recurring toggle
  body += `<div class="flex items-center justify-between bg-slate-900 rounded-2xl px-5 py-4">
    <div><p class="text-sm font-bold text-white">Recurring</p><p class="text-[10px] text-slate-500">Repeats every month</p></div>
    <button type="button" id="f-recurring" data-on="${recurring}" onclick="toggleField(this)" class="w-14 h-8 rounded-full transition-colors ${recurring ? "bg-indigo-600" : "bg-slate-700"} relative flex-shrink-0">
      <span class="absolute top-1 ${recurring ? "left-7" : "left-1"} w-6 h-6 bg-white rounded-full transition-all"></span>
    </button>
  </div>`;

  // start month
  body += `<div class="space-y-1"><label class="text-[10px] font-bold uppercase text-slate-500 ml-1">Starts</label>
    <select id="f-start" class="w-full bg-slate-900 rounded-2xl py-4 px-5 text-base font-bold text-white focus:outline-none">${monthSelect("f-start", start, false)}</select></div>`;

  // end month (installment)
  body += `<div class="space-y-1" id="f-end-wrap"><label class="text-[10px] font-bold uppercase text-slate-500 ml-1">Runs until <span class="text-amber-400">(installment)</span></label>
    <select id="f-end" class="w-full bg-slate-900 rounded-2xl py-4 px-5 text-base font-bold text-white focus:outline-none">${monthSelect("f-end", end, true, start)}</select></div>`;

  // scope for editing recurring amount
  if (!isNew && recurring) {
    body += `<div class="space-y-1"><label class="text-[10px] font-bold uppercase text-slate-500 ml-1">Apply amount to</label>
      <select id="f-scope" class="w-full bg-slate-900 rounded-2xl py-4 px-5 text-base font-bold text-white focus:outline-none">
        <option value="all">All months</option>
        <option value="month" ${hasOverride(id, selectedKey) ? "selected" : ""}>${monthName(selectedKey)} ${keyParts(selectedKey).y} only</option>
      </select></div>`;
  }

  // received / paid this month
  if (!isNew) {
    const verb = kind === "income" ? "Received" : "Paid";
    const hint = kind === "income" ? "Mark this month's income received" : "Mark this month settled";
    body += `<div class="flex items-center justify-between bg-slate-900 rounded-2xl px-5 py-4">
      <div><p class="text-sm font-bold text-white">${verb} in ${monthShort(selectedKey)}</p><p class="text-[10px] text-slate-500">${hint}</p></div>
      <button type="button" id="f-paid" data-on="${settledNow}" onclick="toggleField(this)" class="w-14 h-8 rounded-full transition-colors ${settledNow ? "bg-emerald-600" : "bg-slate-700"} relative flex-shrink-0">
        <span class="absolute top-1 ${settledNow ? "left-7" : "left-1"} w-6 h-6 bg-white rounded-full transition-all"></span>
      </button>
    </div>`;
  }

  $("modal-body").innerHTML = body;

  const delBtn = $("delete-btn");
  if (isNew) { delBtn.classList.add("hidden"); }
  else { delBtn.classList.remove("hidden"); delBtn.onclick = () => confirmDelete(); }

  openModalShell();
};

window.toggleField = function (btn) {
  const on = btn.dataset.on !== "true";
  btn.dataset.on = on;
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
      ${["charlie", "karla"].map((w) => `<button type="button" onclick="pickOwner(this,'${w}')" class="py-3 rounded-xl font-bold text-xs ${w === owner ? "bg-indigo-600 text-white" : "bg-slate-900 text-slate-400"}">${OWNERS[w].label}</button>`).join("")}
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
    c.className = `py-3 rounded-xl font-bold text-xs ${on ? "bg-indigo-600 text-white" : "bg-slate-900 text-slate-400"}`;
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

  // item
  if (!name) return toast("Name required", "error");
  const { who, type, id } = activeEdit;
  const recurring = $("f-recurring").dataset.on === "true";
  const start = $("f-start").value;
  const end = $("f-end").value || null;
  const list = appData.items[who][type];

  if (id) {
    const it = list.find((x) => x.id === id);
    if (it) {
      it.name = name;
      it.recurring = recurring;
      it.start = start;
      it.end = recurring ? end : null;
      const scope = $("f-scope") ? $("f-scope").value : "all";
      if (recurring && scope === "month") {
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
      if (on) appData.paid[selectedKey][id] = true;
      else delete appData.paid[selectedKey][id];
    }
  } else {
    list.push({ id: generateId(), name, amount, start, end: recurring ? end : null, recurring });
  }
  await syncSet();
  closeModal(); renderAll(); toast("Saved"); celebrate();
};

window.togglePaidQuick = async function (event, id, kind) {
  event.stopPropagation();
  const btn = event.currentTarget;
  appData.paid[selectedKey] = appData.paid[selectedKey] || {};
  const nowSettled = !appData.paid[selectedKey][id];
  if (nowSettled) appData.paid[selectedKey][id] = true;
  else delete appData.paid[selectedKey][id];
  applyPaidVisual(btn, nowSettled); // surgical — no full re-render, no scroll jump
  if (nowSettled) {
    const valEl = btn.closest(".item-row")?.lastElementChild; // the amount, right side
    flashLabel(valEl || btn, kind === "income" ? "Received!" : "Paid!");
  }
  refreshRealized();
  await syncSet();
};

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
  const stats = $("sum-stats");
  if (stats) stats.innerHTML = statsGridHtml(t);
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
  const emojis = ["💸", "💵", "🪙"];
  const bills = Array.from({ length: 18 }, () => ({
    x: Math.random() * canvas.width,
    y: -40 - Math.random() * 200,
    vy: 3 + Math.random() * 4,
    vx: (Math.random() - 0.5) * 2,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.2,
    e: emojis[Math.floor(Math.random() * emojis.length)],
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
      ctx.font = `${b.size}px serif`;
      ctx.textAlign = "center";
      ctx.fillText(b.e, 0, 0);
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
  const colors = ["#6366f1", "#8b5cf6", "#3b82f6", "#f43f5e"];
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
function revealApp() {
  const intro = $("intro-screen");
  const app = $("app");
  intro.style.opacity = "0";
  intro.style.pointerEvents = "none";
  setTimeout(() => { intro.style.display = "none"; }, 700);
  app.style.opacity = "1";
  initParticles();
}

function runIntro() {
  const tag = $("intro-tag");
  setTimeout(() => { if (tag) tag.style.opacity = "1"; }, 1150);
}

let firstLoad = true;
function boot() {
  runIntro();
  onValue(dbRef, (snap) => {
    // Skip re-render for the echo of our own writes (appData is already current locally).
    if (!firstLoad && pendingEchoes > 0) { pendingEchoes--; return; }
    const val = snap.val();
    appData = val ? normalize(val) : emptyData();
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
