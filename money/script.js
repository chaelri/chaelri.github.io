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
  console.log(monthViews);

  monthViews.forEach((view) => {
    // Attach scroll listener to each month view
    view.addEventListener("scroll", function (e) {
      const currentScrollTop = e.target.scrollTop;
      console.log(currentScrollTop);

      // Apply the current scroll position to all other month views
      monthViews.forEach((otherView) => {
        // Crucial check: Only update if the scroll position is different
        // and ensure we are not updating the source of the event
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

      initMonthPicker();
      renderSwiper();
      setupSwiperObserver();

      onValue(dbRef, (snapshot) => {
        const val = snapshot.val();
        if (snapshot.exists() && val) {
          appData = val;
          if (!appData.monthlyData) appData.monthlyData = {};
          updateAllCalculations();
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
            } p-6 rounded-[2.5rem] shadow-2xl transition-all duration-500">
                <div class="relative z-10 space-y-4">
                    <div>
                        <p class="text-white/60 text-[10px] font-black uppercase tracking-widest">Total Current Funds</p>
                        <h2 class="total-funds-display text-4xl font-black tracking-tighter">₱ 0.00</h2>
                    </div>
                    <div class="grid grid-cols-1 gap-2 border-t border-white/10 pt-4">
                        <div class="flex justify-between items-center">
                            <span class="text-white/60 text-[10px] font-black uppercase">Gross Income</span>
                            <span class="total-income-display text-sm font-bold text-white">₱ 0.00</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-white/60 text-[10px] font-black uppercase">Total Expenses</span>
                            <span class="total-expenses-display text-sm font-bold text-white/90">₱ 0.00</span>
                        </div>
                        <div class="flex justify-between items-center bg-white/10 p-2 px-3 rounded-xl">
                            <span class="text-white/60 text-[10px] font-black uppercase">Net Savings</span>
                            <span class="monthly-savings-display text-sm font-black text-white">₱ 0.00</span>
                        </div>
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

  months.forEach((_, idx) => {
    const m = appData.monthlyData[idx] || {
      incomeSources: [],
      fixedExpenses: [],
      cc: [],
      others: [],
    };
    const income = (m.incomeSources || []).reduce(
      (s, i) => s + parseFloat(i.amount || 0),
      0,
    );
    const filterPaid = (items) => (items || []).filter((item) => !item.isPaid);
    const expenses = [
      ...filterPaid(m.fixedExpenses),
      ...filterPaid(m.cc),
      ...filterPaid(m.others),
    ].reduce((s, i) => s + parseFloat(i.amount || 0), 0);

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
  }
}

window.switchView = (view) => {
  activeView = view;
  const views = ["budget", "stats", "setup"];
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
  const header = document.querySelector("header");
  if (header) header.style.display = view === "budget" ? "flex" : "none";
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
    const income = (m.incomeSources || []).reduce(
      (s, i) => s + parseFloat(i.amount || 0),
      0,
    );
    const expenses = [
      ...(m.fixedExpenses || []),
      ...(m.cc || []),
      ...(m.others || []),
    ].reduce((s, i) => s + parseFloat(i.amount || 0), 0);
    const savings = income - expenses;
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
  }"><input type="checkbox" id="edit-recurring" ${
    type === "fixedExpenses" ? "checked" : ""
  } class="w-5 h-5 rounded border-none bg-slate-900 text-blue-500 focus:ring-0"><label for="edit-recurring" class="text-[10px] font-black uppercase text-slate-400">Apply to all future months</label></div>`;
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
  swiper.onscroll = () => {
    const idx = Math.round(swiper.scrollLeft / swiper.clientWidth);
    if (idx !== currentMonthIdx && idx >= 0 && idx < 12) updateHeader(idx);
  };
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting)
          updateHeader(parseInt(entry.target.dataset.index));
      });
    },
    { root: swiper, threshold: 0.6 },
  );
  document.querySelectorAll(".snap-point").forEach((p) => observer.observe(p));
}

function updateHeader(idx) {
  if (idx === currentMonthIdx) return;
  currentMonthIdx = idx;
  const display = document.getElementById("current-month-display");
  if (display) display.innerText = months[idx];
  if (window.navigator.vibrate) window.navigator.vibrate(5);
}

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
  months.forEach((m, idx) => {
    const btn = document.createElement("button");
    btn.className =
      "p-6 rounded-3xl bg-slate-800 text-lg font-black active:scale-90 transition-transform uppercase tracking-widest text-slate-400";
    btn.innerText = m.substring(0, 3);
    btn.onclick = () => {
      const swiper = document.getElementById("budget-view");
      if (swiper)
        swiper.scrollTo({ left: swiper.clientWidth * idx, behavior: "smooth" });
      updateHeader(idx);
      window.toggleMonthPicker();
    };
    container.appendChild(btn);
  });
}
