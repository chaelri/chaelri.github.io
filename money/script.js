import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  set,
  get,
  off,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

import Sortable from "https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/modular/sortable.core.esm.js";

// =============================
// Firebase config
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

// --- APP STATE ---
const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const monthlyGradients = [
  "from-indigo-600 to-blue-700",
  "from-rose-600 to-pink-700",
  "from-emerald-600 to-teal-700",
  "from-amber-500 to-orange-700",
  "from-fuchsia-600 to-purple-700",
  "from-sky-500 to-blue-600",
  "from-cyan-600 to-blue-700",
  "from-lime-500 to-green-700",
  "from-violet-600 to-purple-700",
  "from-orange-500 to-red-700",
  "from-slate-600 to-slate-800",
  "from-blue-800 to-indigo-900",
];

let currentUser = null;
let currentMonthIdx = 0;
let appData = null;
let activeEdit = null;
let activeView = "budget";
let dbRef = null;
let isEditMode = false;
let sortableInstances = [];

// --- HELPERS ---
const generateId = () => Math.random().toString(36).substr(2, 9);
const formatMoney = (val) =>
  (val || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const getSectionLabel = (type) => {
  switch (type) {
    case "incomeSources":
      return "INCOME SOURCES";
    case "fixedExpenses":
      return "FIXED EXPENSES";
    case "cc":
      return "CREDIT CARDS";
    case "others":
      return "OTHERS";
    default:
      return type.toUpperCase();
  }
};

function setupScrollSync() {
  const monthViews = document.querySelectorAll(".snap-point");

  monthViews.forEach((view) => {
    view.addEventListener("scroll", function (e) {
      if (isDesktop()) return; // No scroll sync needed on desktop (single pane)
      const currentScrollTop = e.target.scrollTop;

      monthViews.forEach((otherView) => {
        if (
          otherView !== e.target &&
          otherView.scrollTop !== currentScrollTop
        ) {
          otherView.scrollTop = currentScrollTop;
        }
      });
    });
  });
}

// --- INIT ---
window.addEventListener("DOMContentLoaded", async () => {
  const logo = document.getElementById("intro-logo");
  const introContainer = document.getElementById("intro-particles");
  const userSelection = document.getElementById("user-selection");

  // Money Cash Emoji Particles
  const emojis = ["💵", "💸", "🤑", "💵"];
  for (let i = 0; i < 12; i++) {
    const span = document.createElement("span");
    span.className = "intro-emoji";
    span.innerText = emojis[Math.floor(Math.random() * emojis.length)];
    span.style.left = Math.random() * 90 + 5 + "vw";
    span.style.animationDuration = 0.6 + Math.random() * 0.7 + "s";
    span.style.animationDelay = Math.random() * 0.3 + "s";
    introContainer.appendChild(span);
  }

  setTimeout(() => {
    logo.classList.add("scale-100");
    setTimeout(() => {
      userSelection.classList.remove(
        "opacity-0",
        "translate-y-10",
        "pointer-events-none",
      );
    }, 500);
  }, 50);
});

window.selectUser = async (name) => {
  currentUser = name;

  const userSelection = document.getElementById("user-selection");
  const loginStatus = document.getElementById("login-status");
  const introLogo = document.getElementById("intro-logo");

  // UI Login Transition: Hide buttons, show synchronizing state
  userSelection.classList.add("opacity-0", "pointer-events-none");
  setTimeout(() => {
    userSelection.classList.add("hidden");
    loginStatus.classList.remove("hidden");
    introLogo.classList.add("animate-bounce"); // Visual feedback of "active" login
  }, 400);

  // Path Mapping: Charlie gets legacy 'chalee_v1', Karla gets 'karla_v1'
  const path = name === "Charlie" ? "chalee_v1" : "karla_v1";
  dbRef = ref(db, path);

  document.getElementById("current-user-tag").innerText = name;
  document.getElementById("current-user-tag").className =
    `text-[10px] font-black tracking-[0.4em] uppercase ${
      name === "Charlie" ? "text-blue-400" : "text-rose-400"
    }`;

  try {
    const snapshot = await get(dbRef);
    if (snapshot.exists() && snapshot.val()) {
      appData = snapshot.val();
      if (!appData.monthlyData) appData.monthlyData = {};
      document.getElementById("setup-balance").value =
        appData.startingBalance || 0;
    } else {
      appData = { startingBalance: 0, monthlyData: {} };
      for (let i = 0; i < 12; i++) {
        appData.monthlyData[i] = {
          incomeSources: [],
          fixedExpenses: [],
          cc: [],
          others: [],
        };
      }
      await set(dbRef, appData);
    }

    // Hide intro and show app after minimal intentional delay for smoothness
    setTimeout(() => {
      const intro = document.getElementById("intro-screen");
      intro.classList.add("opacity-0", "pointer-events-none");
      document.getElementById("app").classList.add("opacity-100");

      // Start at the first active (uncompleted) month
      currentMonthIdx = getFirstActiveMonth();
      document.getElementById("current-month-display").innerText = months[currentMonthIdx];

      initMonthPicker();
      initDesktopSidebar();
      renderSwiper();
      setupSwiperObserver();

      // Desktop: show only active month on init
      lastIsDesktop = isDesktop();
      if (isDesktop()) {
        showDesktopMonth(currentMonthIdx);
      }

      updateCompleteMonthButtons();
      updateMonthVisibility();

      onValue(dbRef, (snapshot) => {
        const val = snapshot.val();
        if (snapshot.exists() && val) {
          appData = val;
          if (!appData.monthlyData) appData.monthlyData = {};
          updateAllCalculations();
          updateCompleteMonthButtons();
          updateMonthVisibility();
          if (activeView === "stats") renderStats();
        }
      });

      setTimeout(() => {
        setupScrollSync();
        intro.remove();
      }, 700);
    }, 800);
  } catch (e) {
    console.error("Login failed", e);
    logout();
  }
};

window.logout = () => {
  location.reload();
};

// --- RENDER ---
function renderSwiper() {
  const swiper = document.getElementById("budget-view");
  swiper.innerHTML = "";

  months.forEach((name, idx) => {
    const snap = document.createElement("div");
    snap.className = "snap-point px-6 pt-4 space-y-8";
    snap.id = `month-view-${idx}`;
    snap.dataset.index = idx;

    snap.innerHTML = `
            <section id="dashboard-${idx}" class="relative overflow-hidden bg-gradient-to-br ${
              monthlyGradients[idx]
            } p-6 md:p-8 rounded-[2.5rem] shadow-2xl transition-all duration-500">
                <div class="relative z-10 space-y-4">
                    <div>
                        <p class="text-white/60 text-[10px] font-black uppercase tracking-widest">Total Current Funds</p>
                        <h2 class="total-funds-display text-4xl md:text-5xl font-black tracking-tighter">₱ 0.00</h2>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 border-t border-white/10 pt-4">
                        <div class="flex justify-between md:flex-col md:gap-1 items-center md:items-start">
                            <span class="text-white/60 text-[10px] font-black uppercase">Gross Income</span>
                            <span class="total-income-display text-sm md:text-lg font-bold text-white">₱ 0.00</span>
                        </div>
                        <div class="flex justify-between md:flex-col md:gap-1 items-center md:items-start">
                            <span class="text-white/60 text-[10px] font-black uppercase">Total Expenses</span>
                            <span class="total-expenses-display text-sm md:text-lg font-bold text-white/90">₱ 0.00</span>
                        </div>
                        <div class="flex justify-between md:flex-col md:gap-1 items-center md:items-start bg-white/10 p-2 px-3 rounded-xl">
                            <span class="text-white/60 text-[10px] font-black uppercase">Net Savings</span>
                            <span class="monthly-savings-display text-sm md:text-lg font-black text-white">₱ 0.00</span>
                        </div>
                    </div>
                    <div id="complete-month-btn-${idx}" class="complete-month-wrapper hidden">
                        <button onclick="completeMonth(${idx})" class="w-full mt-3 py-3 bg-white/10 hover:bg-white/20 rounded-2xl font-black text-white text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all">
                            <span class="material-icons text-sm">check_circle</span> Complete ${months[idx]}
                        </button>
                    </div>
                </div>
            </section>

            ${createSectionHtml(
              "INCOME SOURCES",
              "incomeSources",
              "text-emerald-400",
              idx,
            )}
            ${createSectionHtml(
              "FIXED EXPENSES",
              "fixedExpenses",
              "text-slate-300",
              idx,
            )}
            ${createSectionHtml("CREDIT CARDS", "cc", "text-rose-400", idx)}
            ${createSectionHtml("OTHERS", "others", "text-amber-300", idx)}
        `;
    swiper.appendChild(snap);
  });
  updateAllCalculations();

  // Desktop: re-apply active month
  if (isDesktop()) {
    showDesktopMonth(currentMonthIdx);
  }
}

function createSectionHtml(title, key, color, monthIdx) {
  return `
        <section class="space-y-4" data-section-key="${key}"> <!-- ADDED data-section-key -->
            <div class="flex justify-between items-center">
                <h3 class="text-xs font-black uppercase tracking-[0.2em] text-slate-500">${title}</h3>
                <div class="flex gap-2">
                    <!-- NEW: Edit/Sort Button -->
                    <button onclick="toggleEditMode()" class="edit-mode-toggle active:scale-75 transition-transform text-slate-500">
                        <span class="material-icons text-xl">sort</span>
                    </button>
                    <!-- Existing Add Button -->
                    <button onclick="openModal('${key}', null, null, null, ${monthIdx})" class="add-item-btn active:scale-75 transition-transform text-blue-400">
                        <span class="material-icons text-xl">add</span>
                    </button>
                </div>
            </div>
            <div id="${key}-list-${monthIdx}" class="space-y-3 item-list"></div> <!-- ADDED item-list class -->
        </section>
    `;
}

function updateAllCalculations() {
  if (!appData || !appData.monthlyData) return;

  let runningBalance = parseFloat(appData.startingBalance || 0);

  // Preserve desktop active state after re-render
  const preserveDesktop = isDesktop();

  months.forEach((_, idx) => {
    const m = appData.monthlyData[idx] || {
      incomeSources: [],
      fixedExpenses: [],
      cc: [],
      others: [],
    };
    const { income, expenses, savings } = calculateMonthlyTotals(m);
    
    const net = income - expenses;
    runningBalance += net;

    renderRows(idx, "incomeSources", m.incomeSources || [], "text-emerald-400");
    renderRows(idx, "fixedExpenses", m.fixedExpenses || [], "text-slate-300");
    renderRows(idx, "cc", m.cc || [], "text-rose-400");
    renderRows(idx, "others", m.others || [], "text-amber-300");

    const view = document.getElementById(`month-view-${idx}`);
    if (!view) return;
    view.querySelector(".total-funds-display").innerText = `₱ ${formatMoney(
      runningBalance,
    )}`;
    view.querySelector(".total-income-display").innerText = `₱ ${formatMoney(
      income,
    )}`;
    view.querySelector(".total-expenses-display").innerText = `₱ ${formatMoney(
      expenses,
    )}`;
    const savingsEl = view.querySelector(".monthly-savings-display");
    const sign = net >= 0 ? "+" : "-";
    savingsEl.innerText = `${sign} ₱ ${formatMoney(Math.abs(net))}`;
  });

  // Re-apply desktop active state
  if (preserveDesktop) {
    showDesktopMonth(currentMonthIdx);
  }
  }

  function calculateMonthlyTotals(monthData) {
  const income = (monthData.incomeSources || []).reduce(
  (s, i) => s + parseFloat(i.amount || 0),
  0,
  );
  const filterPaid = (items) => (items || []).filter((item) => !item.isPaid);
  const expenses = [
  ...filterPaid(monthData.fixedExpenses),
  ...filterPaid(monthData.cc),
  ...filterPaid(monthData.others),
  ].reduce((s, i) => s + parseFloat(i.amount || 0), 0);
  const savings = income - expenses;
  return { income, expenses, savings };
  }

// =============================================
// COMPLETE MONTH
// =============================================
// Shows the button on months that are closable (last days of month, or past months not yet completed)
function updateCompleteMonthButtons() {
  if (!appData) return;
  const now = new Date();
  const realMonth = now.getMonth();
  const dayOfMonth = now.getDate();
  const completedMonths = appData.completedMonths || {};

  months.forEach((_, idx) => {
    const btn = document.getElementById(`complete-month-btn-${idx}`);
    if (!btn) return;

    const isCompleted = !!completedMonths[idx];
    // Show button if: month is past OR it's the closing days (28+) of current month, AND not yet completed
    const isPast = idx < realMonth;
    const isClosing = idx === realMonth && dayOfMonth >= 28;
    const shouldShow = !isCompleted && (isPast || isClosing);

    btn.classList.toggle("hidden", !shouldShow);

    // Mark completed months visually
    const dashboard = document.getElementById(`dashboard-${idx}`);
    if (dashboard && isCompleted) {
      dashboard.classList.add("opacity-50");
      // Add completed badge
      if (!dashboard.querySelector(".completed-badge")) {
        const badge = document.createElement("div");
        badge.className = "completed-badge absolute top-4 right-4 z-20 px-3 py-1 bg-emerald-500/20 rounded-lg text-[9px] font-black text-emerald-400 uppercase";
        badge.textContent = "Completed";
        dashboard.style.position = "relative";
        dashboard.appendChild(badge);
      }
    }
  });
}

// --- Custom Confirm Modal ---
let confirmResolve = null;

function showConfirm({ title, items, actionText, icon, iconGradient }) {
  const overlay = document.getElementById("confirm-overlay");
  const iconEl = document.getElementById("confirm-icon");
  const titleEl = document.getElementById("confirm-title");
  const bodyEl = document.getElementById("confirm-body");
  const actionBtn = document.getElementById("confirm-action-btn");

  titleEl.textContent = title;
  actionBtn.textContent = actionText || "Confirm";
  iconEl.className = `w-16 h-16 rounded-[1.5rem] bg-gradient-to-br ${iconGradient || "from-emerald-500 to-teal-600"} flex items-center justify-center shadow-lg`;
  iconEl.innerHTML = `<span class="material-icons text-white text-3xl">${icon || "check_circle"}</span>`;

  bodyEl.innerHTML = items.map(item =>
    `<div class="flex items-start gap-3 bg-slate-900/50 rounded-xl p-3 border border-white/[0.03]">
      <span class="material-icons text-sm mt-0.5 ${item.color || 'text-slate-400'}">${item.icon}</span>
      <div>
        <p class="text-[11px] font-bold text-white">${item.title}</p>
        ${item.sub ? `<p class="text-[9px] text-slate-500 mt-0.5">${item.sub}</p>` : ""}
      </div>
    </div>`
  ).join("");

  overlay.classList.add("open");

  return new Promise((resolve) => {
    confirmResolve = resolve;
    actionBtn.onclick = () => {
      // Close overlay without triggering the cancel resolve
      document.getElementById("confirm-overlay").classList.remove("open");
      confirmResolve = null;
      resolve(true);
    };
  });
}

window.closeConfirm = () => {
  document.getElementById("confirm-overlay").classList.remove("open");
  if (confirmResolve) { confirmResolve(false); confirmResolve = null; }
};

// --- Toast ---
function showToast(text, icon, duration) {
  const toast = document.getElementById("toast");
  document.getElementById("toast-text").textContent = text;
  document.getElementById("toast-icon").textContent = icon || "check_circle";
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), duration || 3000);
}

// --- Complete Month ---
window.completeMonth = async (monthIdx) => {
  if (!appData || !appData.monthlyData || !appData.monthlyData[monthIdx]) return;

  const confirmed = await showConfirm({
    title: `Complete ${months[monthIdx]}?`,
    icon: "task_alt",
    iconGradient: "from-emerald-500 to-teal-600 shadow-emerald-500/20",
    actionText: `Complete ${months[monthIdx]}`,
    items: [
      { icon: "check_circle", color: "text-emerald-400", title: "Mark all expenses as paid", sub: "Fixed, credit cards, and others" },
      { icon: "money_off", color: "text-blue-400", title: "Zero out all income sources", sub: "You'll set up next month manually" },
      { icon: "visibility_off", color: "text-slate-400", title: "Hide from main view", sub: "Month will be dimmed and skipped" },
    ],
  });

  if (!confirmed) return;

  const m = appData.monthlyData[monthIdx];
  const toArr = (v) => Array.isArray(v) ? v : (v ? Object.values(v) : []);

  // 1. Mark all expenses as paid
  ["fixedExpenses", "cc", "others"].forEach((key) => {
    toArr(m[key]).forEach((item) => { item.isPaid = true; });
  });

  // 2. Zero out ALL income sources
  toArr(m.incomeSources).forEach((item) => { item.amount = 0; });

  // 3. Mark month as completed
  if (!appData.completedMonths) appData.completedMonths = {};
  appData.completedMonths[monthIdx] = { completedAt: Date.now() };

  // Save
  await set(dbRef, appData);
  updateAllCalculations();
  updateCompleteMonthButtons();
  updateMonthVisibility();

  updateMonthPicker();
  initDesktopSidebar();
  showToast(`${months[monthIdx]} completed`, "task_alt", 3000);

  // Auto-navigate to next uncompleted month
  const nextMonth = getFirstActiveMonth();
  if (nextMonth !== monthIdx) {
    currentMonthIdx = nextMonth;
    const display = document.getElementById("current-month-display");
    if (display) display.innerText = months[nextMonth];
    if (isDesktop()) {
      showDesktopMonth(nextMonth);
    } else {
      const swiper = document.getElementById("budget-view");
      if (swiper) swiper.scrollTo({ left: swiper.clientWidth * nextMonth, behavior: "smooth" });
    }
  }

  if (window.navigator.vibrate) window.navigator.vibrate([10, 50, 10]);
};

// --- Sync Wedding Remaining to June Expenses ---
const WEDDING_EXPENSE_ID = "wedding_vendor_remaining";

window.syncWeddingToJune = async () => {
  if (!appData) return;

  const data = await loadWeddingData();
  const vendorRemaining = data.grandTotal - (data.vendorPaid || 0);
  const charlaCovers = data.charlaPaid || 0;
  // Charlie only pays what CharLa joint doesn't cover
  const charlieShare = Math.max(0, vendorRemaining - charlaCovers);

  if (vendorRemaining <= 0) {
    showToast("All vendors paid — nothing to sync", "check_circle", 3000);
    return;
  }

  const confirmed = await showConfirm({
    title: "Sync to June?",
    icon: "sync",
    iconGradient: "from-blue-500 to-indigo-600 shadow-blue-500/20",
    actionText: `Add ₱${formatMoney(charlieShare)} to June`,
    items: [
      { icon: "receipt_long", color: "text-amber-400", title: `Total vendor remaining: ₱${formatMoney(vendorRemaining)}`, sub: "Full amount still owed to vendors" },
      { icon: "diamond", color: "text-rose-400", title: `CharLa joint covers: ₱${formatMoney(charlaCovers)}`, sub: "This comes from your joint commitment fund" },
      { icon: "person", color: "text-blue-400", title: `Your share: ₱${formatMoney(charlieShare)}`, sub: "Only this hits YOUR June balance" },
    ],
  });

  if (!confirmed) return;

  // Ensure June data exists
  const juneIdx = 5;
  if (!appData.monthlyData) appData.monthlyData = {};
  if (!appData.monthlyData[juneIdx]) {
    appData.monthlyData[juneIdx] = { incomeSources: [], fixedExpenses: [], cc: [], others: [] };
  }
  if (!appData.monthlyData[juneIdx].others) appData.monthlyData[juneIdx].others = [];

  const others = appData.monthlyData[juneIdx].others;
  const toArr = (v) => Array.isArray(v) ? v : (v ? Object.values(v) : []);
  const list = toArr(others);

  // Sync Charlie's share only (not CharLa's portion)
  const existing = list.findIndex(item => item.id === WEDDING_EXPENSE_ID);
  if (charlieShare > 0) {
    if (existing >= 0) {
      list[existing].amount = charlieShare;
      list[existing].name = "Wedding (My Share)";
    } else {
      list.push({
        id: WEDDING_EXPENSE_ID,
        name: "Wedding (My Share)",
        amount: charlieShare,
        isPaid: false,
        logs: [],
      });
    }
  } else if (existing >= 0) {
    // CharLa covers everything, remove the expense
    list.splice(existing, 1);
  }

  appData.monthlyData[juneIdx].others = list;
  await set(dbRef, appData);
  updateAllCalculations();

  showToast(`₱${formatMoney(charlieShare)} synced to June`, "sync", 3000);
};

// Get first non-completed month (the one you should be looking at)
function getFirstActiveMonth() {
  const completed = appData?.completedMonths || {};
  const now = new Date();
  const realMonth = now.getMonth();
  // Start from current real month, find first uncompleted
  for (let i = realMonth; i < 12; i++) {
    if (!completed[i]) return i;
  }
  // Fallback: find any uncompleted
  for (let i = 0; i < 12; i++) {
    if (!completed[i]) return i;
  }
  return 0;
}

// Hide completed months from sidebar + swiper
function updateMonthVisibility() {
  const completed = appData?.completedMonths || {};

  // Desktop sidebar: dim completed months
  document.querySelectorAll(".sidebar-month-btn").forEach((btn, idx) => {
    if (completed[idx]) {
      btn.classList.add("opacity-30");
      if (!btn.querySelector(".done-dot")) {
        const dot = document.createElement("span");
        dot.className = "done-dot material-icons text-[10px] text-emerald-500";
        dot.textContent = "check_circle";
        btn.appendChild(dot);
      }
    } else {
      btn.classList.remove("opacity-30");
    }
  });

  // Mobile swiper: hide completed snap-points (they can still access via month picker)
  if (!isDesktop()) {
    document.querySelectorAll(".snap-point").forEach((sp, idx) => {
      if (completed[idx]) {
        sp.style.display = "none";
      } else {
        sp.style.display = "";
      }
    });
  }
}

  function renderRows(monthIdx, key, items, colorClass) {
  const container = document.getElementById(`${key}-list-${monthIdx}`);
  if (!container) return;
  container.innerHTML = "";

  // Determine if the current month is the one in edit mode
  const isCurrentMonthEditMode = isEditMode && monthIdx === currentMonthIdx;

  items.forEach((item) => {
    const div = document.createElement("div");
    const isPaid = item.isPaid === true;
    const cardStyle = isPaid
      ? "bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
      : "glass-card";
    const textColor = isPaid ? "text-emerald-400 opacity-60" : "text-slate-300";
    const amountColor = isPaid ? "text-emerald-500" : colorClass;

    // Set drag-specific attributes/styles
    const dragClass = isCurrentMonthEditMode ? "cursor-grab" : "";

    div.className = `${cardStyle} p-4 rounded-2xl flex justify-between items-center transition-all duration-300 ${dragClass}`;
    div.dataset.id = item.id; // Crucial for reordering

    // Only allow item editing if NOT in edit mode
    if (!isCurrentMonthEditMode) {
      div.onclick = () =>
        openModal(key, item.id, item.name, item.amount, monthIdx);
    } else {
      // Stop the click event from propagating when in edit mode
      div.onclick = (e) => e.stopPropagation();
    }

    div.innerHTML = `
            <div class="flex items-center gap-3">
                ${
                  isCurrentMonthEditMode
                    ? `<span class="material-icons text-slate-500 drag-handle text-xl cursor-grab mr-2">drag_indicator</span>` // NEW: Drag handle
                    : isPaid
                      ? '<span class="material-icons text-emerald-500 text-sm">check_circle</span>'
                      : ""
                }
                <span class="font-bold ${textColor} text-sm tracking-tight ${
                  isPaid ? "line-through" : ""
                }">${item.name}</span>
            </div>
            <span class="font-black ${amountColor}">₱ ${formatMoney(
              item.amount,
            )}</span>
        `;
    container.appendChild(div);
  });
}

window.toggleEditMode = () => {
  const monthIdx = currentMonthIdx;
  isEditMode = !isEditMode;

  if (window.navigator.vibrate) window.navigator.vibrate(5); // Vibrate feedback

  // 1. Destroy all sortable instances when toggling
  sortableInstances.forEach((sortable) => sortable.destroy());
  sortableInstances = [];

  // Disable main swiper's horizontal scroll when in edit mode to allow vertical dragging
  const swiper = document.getElementById("budget-view");
  if (swiper) swiper.style.overflowX = isEditMode ? "hidden" : "auto";

  // Update button icons and visibility
  const toggleButtons = document.querySelectorAll(".edit-mode-toggle");
  const addButtons = document.querySelectorAll(".add-item-btn");

  toggleButtons.forEach((btn) => {
    btn.classList.toggle("text-rose-400", isEditMode);
    btn.classList.toggle("text-slate-500", !isEditMode);
    btn.querySelector(".material-icons").innerText = isEditMode
      ? "close"
      : "sort";
  });

  addButtons.forEach((btn) => {
    btn.style.display = isEditMode ? "none" : "block";
  });

  // 2. Re-render everything to apply drag handles/styles or remove them
  updateAllCalculations();

  // 3. If in edit mode, set up the sortable lists *after* they are rendered
  if (isEditMode) {
    setupSortableLists(monthIdx);
  }
};

function setupSortableLists(monthIdx) {
  // Only target lists within the current visible month view
  const listContainers = document.querySelectorAll(
    `#month-view-${monthIdx} .item-list`,
  );

  listContainers.forEach((container) => {
    // Get the key (e.g., 'fixedExpenses') from the parent section
    const key = container.parentElement.dataset.sectionKey;

    if (!key) return;

    const sortable = Sortable.create(container, {
      animation: 150,
      ghostClass: "sortable-ghost", // See CSS delta
      handle: ".drag-handle", // Only the handle is draggable
      scroll: true,
      bubbleScroll: true,
      forceFallback: true, // For better mobile support

      onUpdate: function (evt) {
        // Get the new order of IDs from the DOM elements
        const newOrder = Array.from(evt.from.children)
          .map((item) => item.dataset.id)
          .filter((id) => id);

        // Save the new order to Firebase
        reorderItems(monthIdx, key, newOrder);
      },
    });
    sortableInstances.push(sortable);
  });
}

async function reorderItems(monthIdx, type, newOrder) {
  if (
    !appData ||
    !appData.monthlyData ||
    !appData.monthlyData[monthIdx] ||
    !appData.monthlyData[monthIdx][type]
  )
    return;

  const startIdx = monthIdx;
  const endIdx = type === "fixedExpenses" ? 11 : monthIdx;

  const currentList = appData.monthlyData[monthIdx][type];
  const reorderedListStructure = [];

  newOrder.forEach((id) => {
    const item = currentList.find((i) => i.id === id);
    if (item) {
      reorderedListStructure.push(item);
    }
  });

  try {
    for (let i = startIdx; i <= endIdx; i++) {
      if (appData.monthlyData[i] && appData.monthlyData[i][type]) {
        const monthList = appData.monthlyData[i][type];
        const newMonthOrder = [];

        reorderedListStructure.forEach((reorderedItem) => {
          const existingItem = monthList.find(
            (item) => item.id === reorderedItem.id,
          );
          if (existingItem) {
            newMonthOrder.push(existingItem);
          }
        });

        appData.monthlyData[i][type] = newMonthOrder;
      }
    }

    await set(dbRef, appData);
  } catch (e) {
  console.error("Reorder failed:", e);
  alert("Reordering items failed. Please try again.");
  }
  }

window.switchView = (view) => {
  activeView = view;
  const views = ["budget", "stats", "commitments", "setup"];
  views.forEach((v) => {
    const el = document.getElementById(`${v}-view`);
    const nav = document.getElementById(`nav-${v}`);
    if (!el || !nav) return;
    if (v === view) {
      el.classList.add("opacity-100");
      el.classList.remove("opacity-0", "pointer-events-none");
      nav.classList.add("text-blue-400");
      nav.classList.remove("text-slate-500");
    } else {
      el.classList.remove("opacity-100");
      el.classList.add("opacity-0", "pointer-events-none");
      nav.classList.remove("text-blue-400");
      nav.classList.add("text-slate-500");
    }
  });
  if (view === "stats") renderStats();
  if (view === "commitments") renderCommitments();
  const header = document.querySelector("header");
  if (header) header.style.display = view === "budget" ? "flex" : "none";
  const sidebar = document.getElementById("desktop-sidebar");
  if (sidebar) sidebar.style.display = (view === "budget" && isDesktop()) ? "flex" : "none";
};

function renderStats() {
  if (!appData || !appData.monthlyData) return;
  const annualChart = document.getElementById("annual-chart");
  const savingsChart = document.getElementById("savings-chart");
  if (!annualChart || !savingsChart) return;
  annualChart.innerHTML = "";
  savingsChart.innerHTML = "";
  const monthlyTotals = months.map((_, idx) => {
    const m = appData.monthlyData[idx] || {
      incomeSources: [],
      fixedExpenses: [],
      cc: [],
      others: [],
    };
    const { income, expenses, savings } = calculateMonthlyTotals(m);
    return { income, expenses, savings };
    });
  const categories = [
    { label: "Income", key: "income", color: "bg-emerald-500" },
    { label: "Expenses", key: "expenses", color: "bg-rose-500" },
  ];
  categories.forEach((cat) => {
    const total = monthlyTotals.reduce((s, m) => s + m[cat.key], 0);
    const div = document.createElement("div");
    div.className = "space-y-2";
    div.innerHTML = `<div class="flex justify-between text-[10px] font-black uppercase text-slate-500"><span>Annual ${
      cat.label
    }</span><span>₱ ${formatMoney(
      total,
    )}</span></div><div class="stat-bar"><div class="stat-fill ${
      cat.color
    }" style="width: ${total > 0 ? "100%" : "0%"}"></div></div>`;
    annualChart.appendChild(div);
  });
  let maxSavings = Math.max(
    ...monthlyTotals.map((m) => Math.abs(m.savings)),
    1,
  );
  monthlyTotals.forEach((m) => {
    const col = document.createElement("div");
    col.className = "trend-col";
    const h = Math.max((Math.abs(m.savings) / maxSavings) * 100, 5);
    col.style.height = `${h}%`;
    col.style.background = m.savings >= 0 ? "#10b981" : "#f43f5e";
    savingsChart.appendChild(col);
  });
}

window.updateStartingBalance = async (val) => {
  if (!appData) appData = { startingBalance: 0, monthlyData: {} };
  appData.startingBalance = parseFloat(val) || 0;
  await set(dbRef, appData);
};

window.openModal = (type, id, name, amount, monthIdx) => {
  if (!appData.monthlyData) appData.monthlyData = {};
  if (!appData.monthlyData[monthIdx]) {
    appData.monthlyData[monthIdx] = {
      incomeSources: [],
      fixedExpenses: [],
      cc: [],
      others: [],
    };
  }
  const list = appData.monthlyData[monthIdx][type] || [];
  const item = list.find((it) => it.id === id) || {};
  activeEdit = {
    type,
    id,
    monthIdx,
    initialAmount: amount || 0,
    isPaid: item.isPaid || false,
  };
  const overlay = document.getElementById("modal-overlay");
  const body = document.getElementById("modal-body");
  const deleteBtn = document.getElementById("delete-btn");
  const saveBtn = document.getElementById("save-btn");
  if (!overlay || !body || !deleteBtn || !saveBtn) return;
  saveBtn.disabled = false;
  saveBtn.innerText = id ? "Update" : "Add Item";
  const labelType = getSectionLabel(type);
  document.getElementById("modal-title").innerText = id
    ? `EDIT ${name}`
    : `ADD TO ${labelType}`;

  // Explicit padding removal on modal-body to match header alignment
  let bodyHtml = `
        <div class="space-y-4 px-1">
            <div class="space-y-1">
                <label class="text-[10px] font-black uppercase text-slate-500 ml-1">Label ${
                  item.isPaid ? "(PAID)" : ""
                }</label>
                <input type="text" id="edit-name" value="${
                  name || ""
                }" class="w-full bg-slate-900 border-none rounded-2xl text-lg font-bold text-white focus:ring-2 focus:ring-blue-500">
            </div>
            <div class="space-y-1">
                <label class="text-[10px] font-black uppercase text-slate-500 ml-1">Total Amount (₱)</label>
                <input type="number" id="edit-amount" value="${
                  amount || ""
                }" class="w-full bg-slate-900 border-none rounded-2xl text-2xl font-black text-white focus:ring-2 focus:ring-blue-500">
            </div>
        </div>
    `;

  if (type !== "incomeSources" && id) {
    bodyHtml += `<div class="flex flex-col gap-4 mt-6 pt-4 border-t border-white/5 mx-1"><button onclick="togglePaidStatus()" id="paid-btn" class="w-full py-4 rounded-2xl font-black flex items-center justify-center gap-2 transition-all duration-300 ${
      item.isPaid
        ? "bg-emerald-500 text-white"
        : "bg-slate-700/50 text-slate-400"
    }"><span class="material-icons">${
      item.isPaid ? "check_circle" : "radio_button_unchecked"
    }</span>${item.isPaid ? "PAID" : "MARK AS PAID"}</button></div>`;
  }

  if (type === "cc" && id) {
    bodyHtml += `<div class="space-y-2 mt-6 pt-4 border-t border-white/5 mx-1"><label class="text-[10px] font-bold uppercase text-emerald-400 ml-1">Quick Add Spent (₱)</label><input type="number" id="cc-quick-add" placeholder="e.g. 213" class="w-full bg-slate-900 border-none rounded-2xl py-5 px-6 text-xl font-bold text-emerald-400 focus:ring-2 focus:ring-emerald-500"></div><div class="space-y-3 mt-4 mx-1"><label class="text-[10px] font-bold uppercase text-slate-500 ml-1">History Log</label><div class="max-h-40 overflow-y-auto space-y-2 pr-2 custom-scrollbar" id="cc-history-log">${
      (item.logs || []).length > 0
        ? item.logs
            .map(
              (log) =>
                `<div class="flex justify-between items-center bg-slate-900/40 p-3 rounded-xl border border-white/5"><span class="text-[10px] font-bold text-slate-500 uppercase">${new Date(
                  log.timestamp,
                ).toLocaleDateString()}</span><span class="text-sm font-black text-emerald-400">+₱${formatMoney(
                  log.amount,
                )}</span></div>`,
            )
            .reverse()
            .join("")
        : '<div class="text-[10px] text-slate-600 italic text-center py-4">No recent history</div>'
    }</div></div>`;
  }

  bodyHtml += `<div id="recurring-wrapper" class="flex items-center gap-3 px-4 py-5 bg-slate-900/50 rounded-2xl mx-1 mt-6 ${
    type === "fixedExpenses" ? "hidden" : "flex"
  }"><input type="checkbox" id="edit-recurring" class="w-5 h-5 rounded border-none bg-slate-900 text-blue-500 focus:ring-0"><label for="edit-recurring" class="text-[10px] font-black uppercase text-slate-400">Apply to all future months</label></div>`;
  body.innerHTML = bodyHtml;

  const handleEnterKey = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      window.saveModal();
    }
  };

  const nameInput = document.getElementById("edit-name");
  const amountInput = document.getElementById("edit-amount");
  const quickAddInput = document.getElementById("cc-quick-add");

  if (nameInput) nameInput.addEventListener("keydown", handleEnterKey);
  if (amountInput) amountInput.addEventListener("keydown", handleEnterKey);
  if (quickAddInput) quickAddInput.addEventListener("keydown", handleEnterKey);
  // ---------------------------------------------

  if (type === "cc" && id) {
    quickAddInput.addEventListener("input", (e) => {
      const extra = parseFloat(e.target.value) || 0;
      amountInput.value = (amount || 0) + extra;
    });
  }
  deleteBtn.style.display = id ? "block" : "none";
  deleteBtn.onclick = () => deleteItem();
  overlay.classList.add("open");
  setTimeout(() => document.getElementById("edit-name").focus(), 300);
};

window.togglePaidStatus = () => {
  activeEdit.isPaid = !activeEdit.isPaid;
  const btn = document.getElementById("paid-btn");
  if (btn) {
    btn.className = `w-full py-4 rounded-2xl font-black flex items-center justify-center gap-2 transition-all duration-300 ${
      activeEdit.isPaid
        ? "bg-emerald-500 text-white"
        : "bg-slate-700/50 text-slate-400"
    }`;
    btn.innerHTML = `<span class="material-icons">${
      activeEdit.isPaid ? "check_circle" : "radio_button_unchecked"
    }</span> ${activeEdit.isPaid ? "PAID" : "MARK AS PAID"}`;
  }
};

window.closeModal = () => {
  const overlay = document.getElementById("modal-overlay");
  if (overlay) overlay.classList.remove("open");
};

window.saveModal = async () => {
  const saveBtn = document.getElementById("save-btn");
  if (!saveBtn || saveBtn.disabled) return;
  const nameInput = document.getElementById("edit-name");
  const amountInput = document.getElementById("edit-amount");
  const quickAddInput = document.getElementById("cc-quick-add");
  if (!nameInput || !amountInput) return;
  const name = nameInput.value.trim() || "Untitled";
  const amount = parseFloat(amountInput.value) || 0;
  const quickAddAmount = quickAddInput
    ? parseFloat(quickAddInput.value) || 0
    : 0;
  if (!activeEdit) return;
  const { type, id, monthIdx, isPaid } = activeEdit;
  if (!appData) appData = { startingBalance: 0, monthlyData: {} };
  if (!appData.monthlyData) appData.monthlyData = {};
  const isFixed = type === "fixedExpenses";
  const recurringInput = document.getElementById("edit-recurring");
  const isRecurring = isFixed || (recurringInput && recurringInput.checked);
  const itemId = id || generateId();
  const startIdx = monthIdx;
  const endIdx = isRecurring ? 11 : monthIdx;

  try {
    saveBtn.disabled = true;
    saveBtn.innerText = "Saving...";
    for (let i = startIdx; i <= endIdx; i++) {
      if (!appData.monthlyData[i])
        appData.monthlyData[i] = {
          incomeSources: [],
          fixedExpenses: [],
          cc: [],
          others: [],
        };
      if (!appData.monthlyData[i][type]) appData.monthlyData[i][type] = [];
      const list = appData.monthlyData[i][type];
      const existingIndex = list.findIndex((item) => item.id === itemId);
      if (existingIndex > -1) {
        const item = list[existingIndex];
        item.name = name;
        item.amount = amount;
        if (i === monthIdx) item.isPaid = isPaid;
        if (i === monthIdx && quickAddAmount > 0) {
          if (!item.logs) item.logs = [];
          item.logs.push({
            id: generateId(),
            amount: quickAddAmount,
            timestamp: Date.now(),
          });
        }
      } else {
        const newItem = {
          id: itemId,
          name,
          amount,
          isPaid: i === monthIdx ? isPaid : false,
          logs: [],
        };
        if (i === monthIdx && quickAddAmount > 0)
          newItem.logs.push({
            id: generateId(),
            amount: quickAddAmount,
            timestamp: Date.now(),
          });
        list.push(newItem);
      }
    }
    await set(dbRef, appData);
    closeModal();
  } catch (e) {
    console.error("Save failed:", e);
    saveBtn.disabled = false;
    saveBtn.innerText = "Retry";
  }
};

async function deleteItem() {
  if (!activeEdit || !appData || !appData.monthlyData) return;
  const { type, id, monthIdx } = activeEdit;
  const isFixed = type === "fixedExpenses";
  const startIdx = monthIdx;
  const endIdx = isFixed ? 11 : monthIdx;
  for (let i = startIdx; i <= endIdx; i++) {
    if (appData.monthlyData[i] && appData.monthlyData[i][type]) {
      appData.monthlyData[i][type] = appData.monthlyData[i][type].filter(
        (item) => item.id !== id,
      );
    }
  }
  await set(dbRef, appData);
  closeModal();
}

function setupSwiperObserver() {
  const swiper = document.getElementById("budget-view");
  if (!swiper) return;

  // Use IntersectionObserver — works correctly even with hidden months
  const observer = new IntersectionObserver(
    (entries) => {
      if (isDesktop()) return;
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const idx = parseInt(entry.target.dataset.index);
          if (idx >= 0 && idx < 12 && idx !== currentMonthIdx) {
            updateHeader(idx);
          }
        }
      });
    },
    { root: swiper, threshold: 0.6 },
  );
  document.querySelectorAll(".snap-point").forEach((p) => observer.observe(p));
}

function isDesktop() {
  return window.innerWidth >= 768;
}

function updateHeader(idx) {
  if (idx === currentMonthIdx) return;
  currentMonthIdx = idx;
  const display = document.getElementById("current-month-display");
  if (display) display.innerText = months[idx];
  if (window.navigator.vibrate) window.navigator.vibrate(5);

  // Desktop: show only active month pane + update sidebar
  if (isDesktop()) {
    showDesktopMonth(idx);
  }
}

function showDesktopMonth(idx) {
  // Show only the selected month's snap-point
  document.querySelectorAll(".snap-point").forEach((sp, i) => {
    sp.classList.toggle("desktop-active", i === idx);
  });
  // Update sidebar active state
  document.querySelectorAll(".sidebar-month-btn").forEach((btn, i) => {
    btn.classList.toggle("active", i === idx);
  });
}

function initDesktopSidebar() {
  const sidebar = document.getElementById("desktop-sidebar");
  if (!sidebar) return;
  sidebar.innerHTML = "";

  months.forEach((m, idx) => {
    const btn = document.createElement("button");
    btn.className = `sidebar-month-btn ${idx === currentMonthIdx ? "active" : ""}`;
    btn.innerHTML = `
      <span>${m}</span>
      <span class="text-[10px] font-bold opacity-50">${String(idx + 1).padStart(2, "0")}</span>
    `;
    btn.onclick = () => {
      currentMonthIdx = idx;
      const display = document.getElementById("current-month-display");
      if (display) display.innerText = months[idx];
      showDesktopMonth(idx);
      if (window.navigator.vibrate) window.navigator.vibrate(5);
    };
    sidebar.appendChild(btn);
  });
}

// Handle resize: switch between mobile swiper and desktop single-pane
let lastIsDesktop = false;
function handleResize() {
  const desktop = isDesktop();
  if (desktop !== lastIsDesktop) {
    lastIsDesktop = desktop;
    if (desktop) {
      showDesktopMonth(currentMonthIdx);
    } else {
      // Back to mobile: show all snap-points, remove desktop-active
      document.querySelectorAll(".snap-point").forEach((sp) => {
        sp.classList.remove("desktop-active");
        sp.style.display = "";
      });
      // Scroll swiper to current month
      const target = document.getElementById(`month-view-${currentMonthIdx}`);
      if (target) {
        setTimeout(() => target.scrollIntoView({ inline: "start" }), 100);
      }
    }
  }
}
window.addEventListener("resize", handleResize);

window.toggleMonthPicker = () => {
  const mp = document.getElementById("month-picker");
  if (!mp) return;
  const isOpen = mp.classList.contains("opacity-100");
  mp.classList.toggle("opacity-0", isOpen);
  mp.classList.toggle("opacity-100", !isOpen);
  mp.classList.toggle("pointer-events-none", isOpen);
};

function initMonthPicker() {
  const picker = document.getElementById("month-picker");
  if (!picker) return;
  const container = picker.querySelector("div");
  if (!container) return;
  container.innerHTML = "";
  const completed = appData?.completedMonths || {};

  months.forEach((m, idx) => {
    const isDone = !!completed[idx];
    const btn = document.createElement("button");
    btn.className = `p-6 rounded-3xl text-lg font-black active:scale-90 transition-transform uppercase tracking-widest ${
      isDone ? "bg-emerald-500/10 text-emerald-500/40 border border-emerald-500/10" : "bg-slate-800 text-slate-400"
    }`;
    btn.id = `mp-btn-${idx}`;
    btn.innerHTML = isDone
      ? `<div class="flex items-center justify-center gap-2"><span class="material-icons text-sm">check_circle</span>${m.substring(0, 3)}</div>`
      : m.substring(0, 3);
    btn.onclick = () => {
      const target = document.getElementById(`month-view-${idx}`);
      if (target) {
        // Unhide temporarily if completed so user can view it
        if (isDone) target.style.display = "";
        target.scrollIntoView({ behavior: "smooth", inline: "start" });
      }
      updateHeader(idx);
      window.toggleMonthPicker();
    };
    container.appendChild(btn);
  });
}

// Re-init month picker when completed state changes
function updateMonthPicker() {
  initMonthPicker();
}

// =============================================
// COMMITMENTS (CharLa Ring + Wedding Fund)
// =============================================
// Data stored in Firebase under `commitments` key in user's path
// Structure:
// {
//   ring: { charliePerMonth: 14000, karlaPerMonth: 6000, totalTarget: 440000, startMonth: "2025-01", endMonth: "2026-11", payments: [...] },
//   wedding: { grandTotal: 357527, charliePaid: 103477, karlaPaid: 189372, remaining: 25404 }
// }

// Actual CharLa payment schedule (from the spreadsheet)
// Jan-Aug 2025: ₱14K(C) + ₱6K(K) = ₱20K/mo × 8 = ₱160,000
// Sep 2025-Jan 2026: pause (₱0)
// Feb 2026: ₱118,372 lump sum
// Mar-Jun 2026: ₱14K(C) + ₱5K(K) = ₱19K/mo × 4 = ₱76,000
// Total target: ₱160,000 + ₱118,372 + ₱76,000 = ₱354,372
// But user says CharLa total = ₱189,372 — that's the CharLa joint portion
const CHARLA_SCHEDULE = [
  { label: "Jan 2025", y: 2025, m: 0, charlie: 14000, karla: 6000 },
  { label: "Feb 2025", y: 2025, m: 1, charlie: 14000, karla: 6000 },
  { label: "Mar 2025", y: 2025, m: 2, charlie: 14000, karla: 6000 },
  { label: "Apr 2025", y: 2025, m: 3, charlie: 14000, karla: 6000 },
  { label: "May 2025", y: 2025, m: 4, charlie: 14000, karla: 6000 },
  { label: "Jun 2025", y: 2025, m: 5, charlie: 14000, karla: 6000 },
  { label: "Jul 2025", y: 2025, m: 6, charlie: 14000, karla: 6000 },
  { label: "Aug 2025", y: 2025, m: 7, charlie: 14000, karla: 6000 },
  { label: "Sep 2025", y: 2025, m: 8, charlie: 0, karla: 0 },
  { label: "Oct 2025", y: 2025, m: 9, charlie: 0, karla: 0 },
  { label: "Nov 2025", y: 2025, m: 10, charlie: 0, karla: 0 },
  { label: "Dec 2025", y: 2025, m: 11, charlie: 0, karla: 0 },
  { label: "Jan 2026", y: 2026, m: 0, charlie: 0, karla: 0 },
  { label: "Feb 2026", y: 2026, m: 1, charlie: 118372, karla: 0 },
  { label: "Mar 2026", y: 2026, m: 2, charlie: 14000, karla: 5000 },
  { label: "Apr 2026", y: 2026, m: 3, charlie: 14000, karla: 5000 },
  { label: "May 2026", y: 2026, m: 4, charlie: 14000, karla: 5000 },
  { label: "Jun 2026", y: 2026, m: 5, charlie: 14000, karla: 5000 },
];
const CHARLA_TARGET = CHARLA_SCHEDULE.reduce((s, x) => s + x.charlie + x.karla, 0);

// Wedding fund defaults — will be overridden by Firebase if data exists
const WEDDING_DEFAULTS = {
  grandTotal: 357527,       // Total wedding cost
  vendorPaid: 90082,        // Actual payments made to vendors so far
  charlaPaid: 189372,       // CharLa joint commitment (funding source)
  dueDate: "2026-07-02",
};

function renderCommitments() {
  renderCharLaCommitment();
  renderWeddingFund();
}

function renderCharLaCommitment() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  let totalPaid = 0;
  let monthsWithPayment = 0;
  let monthsLeft = 0;

  CHARLA_SCHEDULE.forEach((s) => {
    const isPast = (s.y < currentYear) || (s.y === currentYear && s.m < currentMonth);
    const isCurrent = (s.y === currentYear && s.m === currentMonth);
    if (isPast || isCurrent) totalPaid += s.charlie + s.karla;
    if (!isPast && !isCurrent && (s.charlie + s.karla) > 0) monthsLeft++;
    if (s.charlie + s.karla > 0) monthsWithPayment++;
  });

  const remaining = CHARLA_TARGET - totalPaid;
  const progressPct = CHARLA_TARGET > 0 ? (totalPaid / CHARLA_TARGET * 100).toFixed(1) : "0";
  const isDone = remaining <= 0;

  const $ = (id) => document.getElementById(id);
  $("ring-target").textContent = `₱${formatMoney(CHARLA_TARGET)}`;
  $("ring-total-paid").textContent = `₱${formatMoney(totalPaid)}`;
  $("ring-remaining").textContent = isDone ? "₱0" : `₱${formatMoney(remaining)}`;
  $("ring-months-left").textContent = isDone ? "Done!" : `${monthsLeft}`;
  $("ring-progress-pct").textContent = `${progressPct}%`;
  $("ring-progress-bar").style.width = `${Math.min(100, parseFloat(progressPct))}%`;
  $("ring-status").textContent = isDone ? "COMPLETE" : `${monthsLeft} mo left`;
  $("ring-status").className = `text-[9px] font-black px-2 py-1 rounded-lg uppercase ${isDone ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`;

  // Timeline: show each month with actual payment amounts
  const timeline = $("ring-timeline");
  timeline.innerHTML = "";
  const mn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  CHARLA_SCHEDULE.forEach((s) => {
    const isPast = (s.y < currentYear) || (s.y === currentYear && s.m < currentMonth);
    const isCurrent = (s.y === currentYear && s.m === currentMonth);
    const total = s.charlie + s.karla;
    const hasAmount = total > 0;

    // All past months = PAID (even ₱0 months were bulk-covered by Feb lump sum)
    const cell = document.createElement("div");
    cell.className = `rounded-lg p-1.5 text-center text-[8px] font-bold border transition-all ${
      isPast ? "bg-emerald-500/15 border-emerald-500/20 text-emerald-400" :
      isCurrent ? "bg-blue-500/15 border-blue-500/30 text-blue-400 ring-1 ring-blue-500/30" :
      "bg-slate-800/50 border-white/[0.04] text-slate-500"
    }`;
    cell.innerHTML = `
      <div>${mn[s.m]} '${String(s.y).slice(-2)}</div>
      ${hasAmount ? `<div class="text-[7px] ${isPast ? 'text-emerald-500' : isCurrent ? 'text-blue-400' : 'text-slate-400'}">₱${total >= 100000 ? (total/1000).toFixed(0) + 'K' : (total/1000).toFixed(0) + 'K'}</div>` :
        `<div class="text-[7px] ${isPast ? 'text-emerald-500/50' : 'opacity-40'}">bulk</div>`}
      ${isPast ? '<span class="material-icons text-[9px]">check</span>' :
        isCurrent ? '<span class="material-icons text-[9px]">radio_button_checked</span>' : ''}
    `;
    timeline.appendChild(cell);
  });
}

// --- Wedding Fund (Firebase-backed, editable) ---
// Stored at: {userPath}/wedding  e.g. chalee_v1/wedding
async function loadWeddingData() {
  if (!currentUser) return WEDDING_DEFAULTS;
  const path = currentUser === "Charlie" ? "chalee_v1" : "karla_v1";
  const weddingRef = ref(db, `${path}/wedding`);
  const snapshot = await get(weddingRef);
  if (snapshot.exists() && snapshot.val()) {
    const saved = snapshot.val();
    // Migration: old data had 'totalPaid' (wrong), new uses 'vendorPaid'
    if (saved.totalPaid && !saved.vendorPaid) {
      saved.vendorPaid = WEDDING_DEFAULTS.vendorPaid; // reset to correct value
      delete saved.totalPaid;
      delete saved.charliePaid;
      await set(weddingRef, { ...WEDDING_DEFAULTS, ...saved });
    }
    return { ...WEDDING_DEFAULTS, ...saved };
  }
  await set(weddingRef, WEDDING_DEFAULTS);
  return WEDDING_DEFAULTS;
}

async function saveWeddingData(data) {
  if (!currentUser) return;
  const path = currentUser === "Charlie" ? "chalee_v1" : "karla_v1";
  const weddingRef = ref(db, `${path}/wedding`);
  await set(weddingRef, data);
}

// Calculate running balance at any month (inclusive)
function getRunningBalanceAt(monthIdx) {
  if (!appData || !appData.monthlyData) return 0;
  let balance = parseFloat(appData.startingBalance || 0);
  for (let i = 0; i <= monthIdx; i++) {
    const m = appData.monthlyData[i] || { incomeSources: [], fixedExpenses: [], cc: [], others: [] };
    const { income, expenses } = calculateMonthlyTotals(m);
    balance += income - expenses;
  }
  return balance;
}

// Calculate Charlie's running balance at June (month index 5)
function getJuneRunningBalance() {
  if (!appData || !appData.monthlyData) return 0;
  let balance = parseFloat(appData.startingBalance || 0);
  for (let i = 0; i <= 5; i++) { // 0=Jan through 5=June
    const m = appData.monthlyData[i] || { incomeSources: [], fixedExpenses: [], cc: [], others: [] };
    const { income, expenses } = calculateMonthlyTotals(m);
    balance += income - expenses;
  }
  return balance;
}

async function renderWeddingFund() {
  const data = await loadWeddingData();

  // Vendor payments
  const vendorPaid = data.vendorPaid || 0;
  const vendorRemaining = data.grandTotal - vendorPaid;
  const vendorPct = data.grandTotal > 0 ? (vendorPaid / data.grandTotal * 100).toFixed(1) : "0";

  // Funding sources
  const charlieAmount = getJuneRunningBalance();
  const totalFunding = charlieAmount + (data.charlaPaid || 0);
  const shortfall = vendorRemaining - totalFunding; // negative = surplus

  const dueDate = new Date(data.dueDate || "2026-07-02");
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24)));
  const isDone = vendorRemaining <= 0;

  const $ = (id) => document.getElementById(id);
  $("wedding-grand-total").textContent = `₱${formatMoney(data.grandTotal)}`;
  $("wedding-total-paid").textContent = `₱${formatMoney(vendorPaid)}`;
  $("wedding-remaining").textContent = isDone ? "₱0" : `₱${formatMoney(Math.max(0, vendorRemaining))}`;
  $("wedding-days-left").textContent = isDone ? "Done!" : `${daysLeft}`;
  $("wedding-progress-pct").textContent = `${vendorPct}%`;
  $("wedding-progress-bar").style.width = `${Math.min(100, parseFloat(vendorPct))}%`;
  $("wedding-charlie").textContent = `₱${formatMoney(charlieAmount)}`;
  $("wedding-karla").textContent = `₱${formatMoney(data.charlaPaid || 0)}`;

  // Status badge
  if (isDone) {
    $("wedding-status").textContent = "ALL PAID";
    $("wedding-status").className = "text-[9px] font-black px-2 py-1 rounded-lg uppercase bg-emerald-500/20 text-emerald-400";
  } else {
    $("wedding-status").textContent = `₱${formatMoney(vendorRemaining)} to vendors`;
    $("wedding-status").className = "text-[9px] font-black px-2 py-1 rounded-lg uppercase bg-amber-500/20 text-amber-400";
  }

  // === AFTER WEDDING: the whole point ===
  // July balance = what you actually have after wedding expenses hit in June
  // This uses the Money app's running balance at July (index 6)
  const julyBalance = getRunningBalanceAt(6);
  const charlieShare = Math.max(0, vendorRemaining - (data.charlaPaid || 0));

  $("aw-june-bal").textContent = `₱${formatMoney(charlieAmount)}`;
  $("aw-charla").textContent = `₱${formatMoney(data.charlaPaid || 0)}`;
  $("aw-vendor-remaining").textContent = `₱${formatMoney(charlieShare)}`;
  $("aw-result").textContent = `₱${formatMoney(julyBalance)}`;
  $("aw-result").className = `font-black ${julyBalance >= 0 ? "text-emerald-400" : "text-rose-400"}`;

  $("after-wedding-balance").textContent = `₱${formatMoney(julyBalance)}`;
  $("after-wedding-balance").className = `text-4xl font-black ${julyBalance >= 0 ? "text-emerald-400" : "text-rose-400"}`;

  if (julyBalance >= 0) {
    $("after-wedding-sub").textContent = "You'll have this left to start married life";
  } else {
    $("after-wedding-sub").textContent = "You'll be short — need to save more before July";
    $("after-wedding-sub").className = "text-[10px] text-rose-400 mt-1";
  }
}

// Update wedding fund: add a payment
window.openWeddingUpdate = async () => {
  const data = await loadWeddingData();
  const remaining = data.grandTotal - data.totalPaid;

  const overlay = document.getElementById("modal-overlay");
  const body = document.getElementById("modal-body");
  const deleteBtn = document.getElementById("delete-btn");
  const saveBtn = document.getElementById("save-btn");
  if (!overlay || !body) return;

  document.getElementById("modal-title").innerText = "UPDATE WEDDING FUND";
  deleteBtn.style.display = "none";
  saveBtn.disabled = false;
  saveBtn.innerText = "Save";

  const vendorPaid = data.vendorPaid || 0;
  const vendorRemaining = data.grandTotal - vendorPaid;

  body.innerHTML = `
    <div class="space-y-4 px-1">
      <div class="bg-slate-900/50 rounded-xl p-4 text-center space-y-1">
        <p class="text-[9px] font-bold uppercase text-slate-500">Still Owed to Vendors</p>
        <p class="text-2xl font-black text-amber-400">₱${formatMoney(Math.max(0, vendorRemaining))}</p>
      </div>
      <div class="space-y-1">
        <label class="text-[10px] font-black uppercase text-slate-500 ml-1">Grand Total (₱)</label>
        <input type="number" id="wed-grand-total" value="${data.grandTotal}" class="w-full bg-slate-900 border-none rounded-2xl text-lg font-bold text-white focus:ring-2 focus:ring-blue-500">
      </div>
      <div class="space-y-1">
        <label class="text-[10px] font-black uppercase text-slate-500 ml-1">Total Paid to Vendors (₱)</label>
        <input type="number" id="wed-vendor-paid" value="${vendorPaid}" class="w-full bg-slate-900 border-none rounded-2xl text-2xl font-black text-emerald-400 focus:ring-2 focus:ring-emerald-500">
      </div>
      <div class="space-y-1">
        <label class="text-[10px] font-black uppercase text-slate-500 ml-1">CharLa Joint Committed (₱)</label>
        <input type="number" id="wed-charla" value="${data.charlaPaid}" class="w-full bg-slate-900 border-none rounded-2xl text-lg font-bold text-rose-400 focus:ring-2 focus:ring-rose-500">
      </div>
    </div>
  `;

  // Override save to update wedding data
  activeEdit = null; // clear any budget edit
  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    saveBtn.innerText = "Saving...";
    const updated = {
      grandTotal: parseFloat(document.getElementById("wed-grand-total").value) || 0,
      vendorPaid: parseFloat(document.getElementById("wed-vendor-paid").value) || 0,
      charlaPaid: parseFloat(document.getElementById("wed-charla").value) || 0,
      dueDate: data.dueDate || "2026-07-02",
    };
    await saveWeddingData(updated);
    closeModal();
    renderWeddingFund();
    // Restore normal save behavior
    saveBtn.onclick = () => window.saveModal();
  };

  overlay.classList.add("open");
};
