// =============================================
// HORIZON — Financial Trajectory App
// Firebase + Chart.js + Pag-IBIG Calculator
// =============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  get,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- Firebase Config (same as Money app) ---
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

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);
const dbRef = ref(db, "chalee_v1");

// --- Constants ---
const HOUSE_PRICE = 6_000_000;
const GOV_FEES = 125_000;
const WEDDING_DATE = new Date(2026, 6, 2); // July 2, 2026
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// --- Post-Wedding Living Expenses (2 lovebirds, 1 roof) ---
// Kicks in after wedding (Aug 2026 onwards, first full month together)
const POST_WEDDING_EXPENSES = [
  { name: "Electricity", amount: 4_000, icon: "bolt" },
  { name: "Water", amount: 400, icon: "water_drop" },
  { name: "Drinkable Water", amount: 600, icon: "local_drink" },
  { name: "Motor Gas", amount: 2_500, icon: "local_gas_station" },
  { name: "Cooking Gas (LPG)", amount: 600, icon: "local_fire_department" },
  { name: "Grocery", amount: 10_000, icon: "shopping_cart" },
  { name: "Parking", amount: 2_500, icon: "local_parking" },
  { name: "WiFi", amount: 1_699, icon: "wifi" },
];
const POST_WEDDING_TOTAL = POST_WEDDING_EXPENSES.reduce((s, x) => s + x.amount, 0); // ₱22,299

// --- Family Support Scenarios ---
// Currently: Charlie + brother split household costs 50/50 for family of 4
// Items with "Bahay" in the name = family household contributions
// After wedding: Charlie leaves. Family becomes 3 (brother + parents).
const FAMILY_KEYWORDS = ["bahay", "contribution"]; // match expense names containing these
// "full" = keep paying as-is (current)
// "prorated" = pay only 1/4 of total (you were 1 of 4, now just helping from outside)
// "none" = stop all family contributions
let familyMode = "full"; // "full" | "prorated" | "none"

function getFamilyReduction(monthExpenseCategories) {
  // Find family-related expenses by name
  const familyItems = monthExpenseCategories.filter(c =>
    FAMILY_KEYWORDS.some(kw => (c.name || "").toLowerCase().includes(kw))
  );
  const familyTotal = familyItems.reduce((s, x) => s + x.amount, 0);

  if (familyMode === "none") return familyTotal; // save all of it
  if (familyMode === "prorated") return familyTotal * 0.5; // save half (was paying 1/2, now pay 1/4 of original = save 50% of your share)
  return 0; // "full" = no reduction
}

// --- Financing Tracks ---
const TRACKS = {
  pagibig90: {
    name: "Pag-IBIG (90% LTV)",
    shortName: "Pag-IBIG 90%",
    loanAmount: 5_400_000,        // 90% of 6M
    downPayment: 600_000,         // 10%
    termYears: 30,
    govFees: GOV_FEES,
    rates: [
      { rate: 5.75, label: "5.75%", sub: "1yr repricing" },
      { rate: 6.25, label: "6.25%", sub: "3yr repricing" },
      { rate: 6.50, label: "6.50%", sub: "5yr repricing" },
    ],
    defaultRate: 5.75,
    note: "Government-backed, lowest rates, 30yr max, no prepayment penalty",
  },
  bdo: {
    name: "BDO Bank Loan",
    shortName: "BDO",
    loanAmount: 6_000_000,
    downPayment: 0,
    termYears: 20,
    govFees: GOV_FEES,
    isRent: false,
    rates: [
      { rate: 6.00, label: "6.00%", sub: "1yr fixed" },
      { rate: 6.50, label: "6.50%", sub: "3yr fixed" },
      { rate: 6.50, label: "6.50%", sub: "5yr fixed" },
    ],
    defaultRate: 6.00,
    note: "Max 20yr term (no 30yr option), higher monthly but shorter payoff. Cashier said payslip-based approval is OK.",
  },
  rent: {
    name: "Rent a Condo/Apartment",
    shortName: "Rent",
    loanAmount: 0,
    downPayment: 0,
    termYears: 0,
    govFees: 0,
    isRent: true,
    rentAmount: 15_000,
    rates: [],
    defaultRate: 0,
    note: "₱15K/mo rent — no loan, no down payment, no interest. But no equity built. You pay forever with no ownership.",
  },
};

// --- App State ---
let appData = null;
let currentSalary = 125000;
let currentTrack = "rent";
let currentRate = 5.75;
let activeSection = "overview";
let charts = {};

// --- Rent Amount (editable) ---
window.setRentAmount = (val) => {
  const amt = Math.max(0, Math.round(Number(val) || 0));
  TRACKS.rent.rentAmount = amt;
  TRACKS.rent.note = `₱${(amt/1000).toFixed(0)}K/mo rent — no loan, no down payment, no interest. But no equity built.`;
  // Update all rent labels
  document.querySelectorAll(".rent-amt-label").forEach(el => {
    el.textContent = `₱${(amt/1000).toFixed(0)}K/mo`;
  });
  renderAll();
};

window.promptRentAmount = () => {
  const current = TRACKS.rent.rentAmount;
  const input = prompt("Enter monthly rent amount (₱):", current);
  if (input !== null && input.trim() !== "") {
    window.setRentAmount(input.replace(/[^0-9]/g, ""));
  }
};

// Derived from current track
function getTrack() { return TRACKS[currentTrack]; }
function getLoanAmount() { return getTrack().loanAmount; }
function getLoanTermMonths() { return getTrack().termYears * 12; }
function getDownPayment() { return getTrack().downPayment; }
function getTotalCashNeeded() { return getTrack().downPayment + getTrack().govFees; }
function isRentTrack() { return !!getTrack().isRent; }
function getMonthlyHousingCost() {
  const track = getTrack();
  if (track.isRent) return track.rentAmount;
  return calcMonthly(track.loanAmount, currentRate, track.termYears * 12);
}

// --- Helpers ---
const fmt = (v) => "₱" + Math.round(v || 0).toLocaleString("en-PH");
const fmtShort = (v) => {
  if (v >= 1_000_000) return "₱" + (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return "₱" + (v / 1_000).toFixed(0) + "K";
  return "₱" + Math.round(v);
};
const pct = (v) => (v * 100).toFixed(1) + "%";
const el = (id) => document.getElementById(id);

// --- Pag-IBIG Monthly Payment Calculator ---
function calcMonthly(principal, annualRate, months) {
  const r = annualRate / 100 / 12;
  if (r === 0) return principal / months;
  return principal * (r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

// --- Extract financials from Firebase data ---
function getMonthData(monthIdx) {
  if (!appData?.monthlyData?.[monthIdx]) {
    return { income: 0, fixedExpenses: 0, cc: 0, others: 0, total: 0, categories: [], raw: null };
  }
  const m = appData.monthlyData[monthIdx];

  // Helper: normalize Firebase data (could be array or object with numeric keys)
  const toArr = (v) => {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    return Object.values(v);
  };

  const incomeSources = toArr(m.incomeSources);
  const fixedArr = toArr(m.fixedExpenses);
  const ccArr = toArr(m.cc);
  const othersArr = toArr(m.others);

  // Income: sum ALL sources (salary + bank balances + everything)
  const income = incomeSources.reduce((s, x) => s + (Number(x.amount) || 0), 0);

  // Expenses: only count UNPAID items (isPaid !== true)
  // This matches the Money app's dashboard logic where paid items
  // are already reflected in reduced bank/income balances
  const fixed = fixedArr.filter(x => !x.isPaid).reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const cc = ccArr.filter(x => !x.isPaid).reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const others = othersArr.filter(x => !x.isPaid).reduce((s, x) => s + (Number(x.amount) || 0), 0);

  // Categories for detail view (show ALL items, mark paid/unpaid)
  const categories = [];
  fixedArr.forEach(x => categories.push({ name: x.name, amount: Number(x.amount) || 0, type: "fixed", isPaid: !!x.isPaid }));
  ccArr.forEach(x => categories.push({ name: x.name, amount: Number(x.amount) || 0, type: "cc", isPaid: !!x.isPaid }));
  othersArr.forEach(x => categories.push({ name: x.name, amount: Number(x.amount) || 0, type: "others", isPaid: !!x.isPaid }));

  return {
    income,
    fixedExpenses: fixed,
    cc,
    others,
    total: fixed + cc + others,
    categories: categories.sort((a, b) => b.amount - a.amount),
    raw: m,
  };
}

// Get the current month's data (or latest with data)
function getCurrentFinancials() {
  const now = new Date();
  const currentMonthIdx = now.getMonth(); // 0-11
  let data = getMonthData(currentMonthIdx);

  // If current month has no income data, try previous months
  if (data.income === 0) {
    for (let i = currentMonthIdx - 1; i >= 0; i--) {
      const prev = getMonthData(i);
      if (prev.income > 0) { data = prev; break; }
    }
  }
  return data;
}

// --- Salary override logic ---
// PH TRAIN Law 2023+ tax computation (valid through 2026)
// Mandatory gov deductions (employee share, all salaries hit the caps):
//   SSS:        ₱1,750/mo  (5% of max MSC ₱35,000)
//   PhilHealth: ₱2,500/mo  (2.5% of max ₱100K ceiling, no 2026 hike per PIA)
//   Pag-IBIG:     ₱200/mo  (2% of max ₱10K fund salary)
//   Total gov:  ₱4,450/mo
//
// Taxable = Gross − ₱4,450 gov deductions
// 125K: taxable ₱120,550 → 25% bracket → tax ₱22,013 → net ₱98,537
// 185K: taxable ₱180,550 → 30% bracket → tax ₱37,707 → net ₱142,843
// 210K: taxable ₱205,550 → 30% bracket → tax ₱45,207 → net ₱160,343
//
// Note: 185K & 210K jump to the 30% bracket (over ₱166,667 taxable)
//       vs 125K which stays in the 25% bracket — significant tax hit
const NET_SALARY_125K = 98_537;
const NET_SALARY_185K = 142_843;
const NET_SALARY_210K = 160_343;
const SALARY_INCREASE_185K = NET_SALARY_185K - NET_SALARY_125K; // +₱44,306/mo
const SALARY_INCREASE_210K = NET_SALARY_210K - NET_SALARY_125K; // +₱61,806/mo

function getProjectedIncome(baseIncome) {
  if (baseIncome <= 0) return baseIncome;
  if (currentSalary === 185000) return baseIncome + SALARY_INCREASE_185K;
  if (currentSalary === 210000) return baseIncome + SALARY_INCREASE_210K;
  return baseIncome;
}

// =============================================
// SPLASH ANIMATION
// =============================================
function runSplash() {
  const particles = el("splash-particles");
  const colors = ["#3b82f6", "#6366f1", "#8b5cf6", "#60a5fa", "#818cf8"];

  for (let i = 0; i < 20; i++) {
    const dot = document.createElement("div");
    dot.className = "splash-dot";
    const size = 3 + Math.random() * 5;
    dot.style.cssText = `
      width: ${size}px; height: ${size}px;
      left: ${10 + Math.random() * 80}%;
      bottom: -10px;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      --dur: ${1.5 + Math.random() * 1.5}s;
      --delay: ${0.2 + Math.random() * 0.8}s;
    `;
    particles.appendChild(dot);
  }

  // Animate horizon line
  setTimeout(() => {
    const line = el("horizon-line");
    const glow = el("horizon-glow");
    line.style.width = "80vw";
    glow.style.width = "60vw";
    glow.style.opacity = "1";
  }, 200);

  // Show text
  setTimeout(() => {
    const text = el("splash-text");
    text.style.opacity = "1";
    text.style.transform = "translateY(0)";
  }, 800);

  // Transition to app
  setTimeout(() => {
    el("splash").style.opacity = "0";
    el("splash").style.pointerEvents = "none";
    el("app").style.opacity = "1";
    setTimeout(() => el("splash").remove(), 700);
  }, 2200);
}

// =============================================
// NAVIGATION
// =============================================
window.switchSection = (name) => {
  if (name === activeSection) return;
  activeSection = name;

  // Update nav buttons
  document.querySelectorAll(".nav-btn").forEach((btn, i) => {
    const sections = ["overview", "house", "trajectory", "timeline"];
    btn.classList.toggle("active", sections[i] === name);
  });

  // Show/hide sections with animation
  document.querySelectorAll(".app-section").forEach((sec) => {
    sec.classList.add("hidden");
    sec.style.animation = "none";
  });

  const target = el(`sec-${name}`);
  target.classList.remove("hidden");
  // Force re-trigger animation
  void target.offsetWidth;
  target.style.animation = "section-enter 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards";

  // Scroll to top
  el("main-content").scrollTo({ top: 0, behavior: "smooth" });

  // Render section-specific content
  if (name === "house") renderHouse();
  if (name === "trajectory") renderTrajectory();
  if (name === "timeline") renderTimeline();
};

// =============================================
// SALARY TOGGLE
// =============================================
window.setSalary = (val) => {
  currentSalary = val;
  const toggle = el("salary-toggle");
  toggle.classList.remove("pos-1", "pos-2");
  if (val === 185000) toggle.classList.add("pos-1");
  else if (val === 210000) toggle.classList.add("pos-2");
  document.querySelectorAll(".sal-chip").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.sal === String(val / 1000));
  });
  renderAll();
};

// =============================================
// FAMILY MODE TOGGLE
// =============================================
window.setFamilyMode = (mode) => {
  familyMode = mode;
  document.querySelectorAll(".fam-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.id === `fam-${mode}`);
  });
  renderAll();
};

// =============================================
// FINANCING TRACK TOGGLE
// =============================================
window.setTrack = (trackId) => {
  currentTrack = trackId;
  const track = getTrack();
  currentRate = track.defaultRate;
  // Sync ALL track buttons (House tab + Trajectory tab copies)
  document.querySelectorAll(".track-btn").forEach((btn) => {
    const match = btn.id === `track-${trackId}` || btn.dataset.track === trackId;
    btn.classList.toggle("active", match);
  });
  renderAll();
};

// =============================================
// RATE TOGGLE
// =============================================
window.setRate = (rate) => {
  currentRate = rate;
  const track = getTrack();
  document.querySelectorAll(".rate-btn").forEach((btn, i) => {
    btn.classList.toggle("active", track.rates[i]?.rate === rate);
  });
  renderHouse();
  if (activeSection === "trajectory") renderTrajectory();
  if (activeSection === "timeline") renderTimeline();
};

// =============================================
// MONTH DETAIL TOGGLE
// =============================================
window.toggleMonthDetail = (detailId, cardEl) => {
  const detail = document.getElementById(detailId);
  if (!detail) return;

  const isOpen = detail.classList.contains("open");
  const chevron = cardEl.querySelector(".mc-chevron");

  // Close all others first
  document.querySelectorAll(".expense-detail.open").forEach((d) => {
    if (d.id !== detailId) {
      d.classList.remove("open");
      const otherCard = d.closest(".month-card");
      if (otherCard) {
        const otherChev = otherCard.querySelector(".mc-chevron");
        if (otherChev) otherChev.style.transform = "rotate(0deg)";
      }
    }
  });

  // Toggle this one
  detail.classList.toggle("open", !isOpen);
  if (chevron) chevron.style.transform = isOpen ? "rotate(0deg)" : "rotate(180deg)";
};

// =============================================
// RENDER: OVERVIEW
// =============================================
function renderOverview() {
  const fin = getCurrentFinancials();
  const income = getProjectedIncome(fin.income);
  const expenses = fin.total;
  const savings = income - expenses;
  const rate = income > 0 ? savings / income : 0;

  // Animate numbers
  animateValue("ov-income", income);
  animateValue("ov-expenses", expenses);
  animateValue("ov-savings", savings);
  el("ov-rate").textContent = pct(rate);
  el("ov-rate").classList.add("count-up");
  setTimeout(() => el("ov-rate").classList.remove("count-up"), 300);

  // Donut chart
  renderDonutChart(income, fin);

  // Expense bars
  renderExpenseBars(fin.categories, expenses);
}

function animateValue(id, target) {
  const elem = el(id);
  const start = parseInt(elem.textContent.replace(/[^0-9-]/g, "")) || 0;
  const diff = target - start;
  const duration = 600;
  const startTime = performance.now();

  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const current = Math.round(start + diff * ease);
    elem.textContent = fmt(current);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function renderDonutChart(income, fin) {
  const ctx = el("chart-donut").getContext("2d");
  const data = [fin.fixedExpenses, fin.cc, fin.others, Math.max(0, income - fin.total)];
  const labels = ["Fixed", "Credit Cards", "Others", "Savings"];
  const colors = ["#64748b", "#f43f5e", "#f59e0b", "#3b82f6"];

  if (charts.donut) charts.donut.destroy();
  charts.donut = new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, spacing: 2 }] },
    options: {
      cutout: "70%",
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false }, tooltip: { enabled: true } },
      animation: { animateRotate: true, duration: 800 },
    },
  });

  el("donut-center").textContent = fmtShort(income - fin.total);

  // Legend
  const legend = el("donut-legend");
  legend.innerHTML = labels.map((l, i) => `
    <div class="flex items-center justify-between">
      <span class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${colors[i]}"></span>
        <span class="text-slate-400">${l}</span>
      </span>
      <span class="font-bold text-white tabular-nums">${fmtShort(data[i])}</span>
    </div>
  `).join("");
}

function renderExpenseBars(categories, totalExpenses) {
  const container = el("expense-bars");
  if (!categories.length) {
    container.innerHTML = '<p class="text-[10px] text-slate-500 text-center py-4">No expense data found</p>';
    return;
  }

  const typeColors = { fixed: "#64748b", cc: "#f43f5e", others: "#f59e0b" };
  const top = categories.slice(0, 8);
  const maxAmt = top[0]?.amount || 1;

  container.innerHTML = top.map((c) => {
    const w = (c.amount / maxAmt * 100).toFixed(1);
    return `
      <div class="space-y-1">
        <div class="flex justify-between text-[10px]">
          <span class="text-slate-300 truncate max-w-[60%]">${c.name}</span>
          <span class="font-bold text-white tabular-nums">${fmt(c.amount)}</span>
        </div>
        <div class="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div class="exp-bar-fill h-full rounded-full" style="width:0%;background:${typeColors[c.type] || '#64748b'}"></div>
        </div>
      </div>
    `;
  }).join("");

  // Animate bars
  requestAnimationFrame(() => {
    setTimeout(() => {
      container.querySelectorAll(".exp-bar-fill").forEach((bar, i) => {
        const w = (top[i].amount / maxAmt * 100).toFixed(1);
        bar.style.width = w + "%";
      });
    }, 50);
  });
}

// =============================================
// RENDER: HOUSE PLAN
// =============================================
function renderHouse() {
  const track = getTrack();
  const fin = getCurrentFinancials();
  const income = getProjectedIncome(fin.income);
  const grossIncome = currentSalary;

  // Update titles
  el("house-title").textContent = track.isRent ? "Renting a Condo/Apartment" : `₱6M House via ${track.shortName}`;
  el("calc-title").textContent = track.isRent ? "Rent Details" : `${track.shortName} Loan Calculator`;

  // Render dynamic summary row
  if (track.isRent) {
    el("house-summary").innerHTML = `
      <div class="bg-slate-800/50 rounded-xl p-3 text-center border border-white/[0.04] col-span-2 cursor-pointer active:scale-95 transition-transform" onclick="promptRentAmount()">
        <p class="text-[10px] font-bold tracking-widest uppercase text-slate-500">Monthly Rent <span class="material-icons-round text-[10px] align-middle text-blue-400/60">edit</span></p>
        <p class="text-xl font-display font-bold text-indigo-400 mt-1">${fmt(track.rentAmount)}</p>
      </div>
      <div class="bg-slate-800/50 rounded-xl p-3 text-center border border-white/[0.04]">
        <p class="text-[10px] font-bold tracking-widest uppercase text-slate-500">Down Payment</p>
        <p class="text-base font-display font-bold text-emerald-400 mt-1">None</p>
      </div>
      <div class="bg-slate-800/50 rounded-xl p-3 text-center border border-white/[0.04]">
        <p class="text-[10px] font-bold tracking-widest uppercase text-slate-500">Equity Built</p>
        <p class="text-base font-display font-bold text-rose-400 mt-1">None</p>
      </div>
    `;
  } else {
    el("house-summary").innerHTML = `
      <div class="bg-slate-800/50 rounded-xl p-3 text-center border border-white/[0.04]">
        <p class="text-[10px] font-bold tracking-widest uppercase text-slate-500">Loan</p>
        <p class="text-base font-display font-bold text-white mt-1">${fmtShort(track.loanAmount)}</p>
      </div>
      <div class="bg-slate-800/50 rounded-xl p-3 text-center border border-white/[0.04]">
        <p class="text-[10px] font-bold tracking-widest uppercase text-slate-500">Down Payment</p>
        <p class="text-base font-display font-bold ${track.downPayment > 0 ? 'text-amber-400' : 'text-emerald-400'} mt-1">${track.downPayment > 0 ? fmtShort(track.downPayment) : 'None'}</p>
      </div>
      <div class="bg-slate-800/50 rounded-xl p-3 text-center border border-white/[0.04]">
        <p class="text-[10px] font-bold tracking-widest uppercase text-slate-500">Term</p>
        <p class="text-base font-display font-bold text-white mt-1">${track.termYears}yr</p>
      </div>
      <div class="bg-slate-800/50 rounded-xl p-3 text-center border border-white/[0.04]">
        <p class="text-[10px] font-bold tracking-widest uppercase text-slate-500">Gov Fees</p>
        <p class="text-base font-display font-bold text-amber-400 mt-1">${fmtShort(track.govFees)}</p>
      </div>
    `;
  }

  // Render rate buttons (hide for rent)
  if (track.isRent) {
    el("rate-buttons").innerHTML = `<p class="text-[11px] text-slate-500 italic">Flat ${fmt(getTrack().rentAmount)}/mo — no interest</p>`;
  } else {
    el("rate-buttons").innerHTML = track.rates.map((r) => {
      const isActive = r.rate === currentRate;
      return `<button onclick="setRate(${r.rate})" class="rate-btn ${isActive ? 'active' : ''} text-[10px] font-bold px-3 py-2 rounded-xl border transition-all duration-300">${r.label} <span class="text-slate-400 font-normal">${r.sub}</span></button>`;
    }).join("");
  }

  // Monthly cost
  const monthly = getMonthlyHousingCost();
  const totalPaid = track.isRent ? 0 : monthly * getLoanTermMonths();
  const totalInterest = track.isRent ? 0 : totalPaid - getLoanAmount();
  const maxCapacity = grossIncome * 0.35;
  const buffer = maxCapacity - monthly;
  const dti = monthly / grossIncome;

  el("h-monthly").textContent = fmt(monthly);
  el("h-interest").textContent = track.isRent ? "₱0" : fmtShort(totalInterest);
  el("h-total").textContent = track.isRent ? "Ongoing" : fmtShort(totalPaid);
  el("h-buffer").textContent = fmt(buffer);

  // DTI
  el("dti-val").textContent = pct(dti);
  el("dti-cap").textContent = fmt(maxCapacity);

  const dtiStatus = el("dti-status");
  if (dti <= 0.28) {
    dtiStatus.textContent = "EXCELLENT — Very Comfortable";
    dtiStatus.className = "mt-2 px-3 py-1.5 rounded-lg text-[10px] font-bold text-center bg-emerald-500/15 text-emerald-400";
  } else if (dti <= 0.35) {
    dtiStatus.textContent = "APPROVED — Within Limits";
    dtiStatus.className = "mt-2 px-3 py-1.5 rounded-lg text-[10px] font-bold text-center bg-blue-500/15 text-blue-400";
  } else {
    dtiStatus.textContent = "EXCEEDS — Over 35% DTI Limit";
    dtiStatus.className = "mt-2 px-3 py-1.5 rounded-lg text-[10px] font-bold text-center bg-rose-500/15 text-rose-400";
  }

  // DTI Gauge chart
  renderDTIChart(dti);

  // Cash tracker (dynamic per track)
  const savings = income - fin.total;
  const cashNeeded = getTotalCashNeeded();
  const cashTracker = el("cash-tracker");

  let cashRows = "";
  if (track.downPayment > 0) {
    cashRows += `
      <div>
        <div class="flex justify-between text-[10px] mb-1.5">
          <span class="text-slate-400">Down Payment</span>
          <span class="font-bold text-amber-400">0 / ${fmt(track.downPayment)}</span>
        </div>
        <div class="h-2.5 bg-slate-800 rounded-full overflow-hidden">
          <div class="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full" style="width:0%"></div>
        </div>
      </div>`;
  }
  cashRows += `
    <div>
      <div class="flex justify-between text-[10px] mb-1.5">
        <span class="text-slate-400">Gov Fees + Lawyer</span>
        <span class="font-bold text-amber-400">0 / ${fmt(track.govFees)}</span>
      </div>
      <div class="h-2.5 bg-slate-800 rounded-full overflow-hidden">
        <div class="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full" style="width:0%"></div>
      </div>
    </div>`;

  if (cashNeeded > 0) {
    cashRows += `
      <div class="bg-slate-800/40 rounded-xl p-2.5 border border-white/[0.04] text-center">
        <span class="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Total upfront: </span>
        <span class="text-sm font-display font-bold text-white">${fmt(cashNeeded)}</span>
      </div>`;
  } else {
    cashRows += `
      <div class="bg-emerald-500/10 rounded-xl p-2.5 border border-emerald-500/20 text-center">
        <span class="text-[10px] font-bold text-emerald-400">No down payment needed — only gov fees ${fmt(track.govFees)}</span>
      </div>`;
  }
  cashTracker.innerHTML = cashRows;

  const monthsToSave = (cashNeeded > 0 && savings > 0) ? Math.ceil(cashNeeded / savings) : (cashNeeded <= 0 ? 0 : Infinity);
  el("h-months-save").textContent = monthsToSave === Infinity ? "--" : monthsToSave === 0 ? "Gov fees only" : monthsToSave + " mo";

  // Track note
  el("track-note").textContent = track.note;
}

function renderDTIChart(dti) {
  const ctx = el("chart-dti").getContext("2d");
  const dtiPct = Math.min(dti * 100, 50);
  const remaining = 50 - dtiPct;

  if (charts.dti) charts.dti.destroy();
  charts.dti = new Chart(ctx, {
    type: "doughnut",
    data: {
      datasets: [{
        data: [dtiPct, Math.max(0, 35 - dtiPct), remaining > 15 ? remaining - 35 + dtiPct : 0, 50],
        backgroundColor: [
          dtiPct <= 28 ? "#22c55e" : dtiPct <= 35 ? "#3b82f6" : "#ef4444",
          "rgba(255,255,255,0.05)",
          "transparent",
          "transparent",
        ],
        borderWidth: 0,
      }],
    },
    options: {
      cutout: "78%",
      rotation: -90,
      circumference: 180,
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      animation: { duration: 800 },
    },
  });

  el("dti-pct").textContent = (dti * 100).toFixed(1) + "%";
}

// =============================================
// RENDER: TRAJECTORY (Budget After House)
// =============================================

// Pag-IBIG repricing schedule from the MD guide
// After the initial fixed period, we model potential rate increases
const REPRICING_SCHEDULE = [
  { label: "Year 1", years: [1], rate: 5.75 },
  { label: "Year 2–3", years: [2, 3], rate: 6.25 },
  { label: "Year 4–5", years: [4, 5], rate: 6.50 },
  { label: "Year 6–10", years: [6, 7, 8, 9, 10], rate: 7.125 },
  { label: "Year 11–15", years: [11, 12, 13, 14, 15], rate: 7.75 },
  { label: "Year 16–20", years: [16, 17, 18, 19, 20], rate: 8.50 },
  { label: "Year 21–30", years: [21, 22, 23, 24, 25, 26, 27, 28, 29, 30], rate: 9.75 },
];

function renderTrajectory() {
  const monthly = getMonthlyHousingCost();

  // Scenario badge
  const scenarioLabels = { 125000: "Azur 125K", 185000: "T. 185K", 210000: "T. 210K" };
  const scenarioStyles = { 125000: "bg-blue-500/20 text-blue-300", 185000: "bg-amber-500/20 text-amber-300", 210000: "bg-emerald-500/20 text-emerald-300" };
  el("traj-scenario").textContent = scenarioLabels[currentSalary] || "125K";
  el("traj-scenario").className = `text-[9px] font-bold px-2 py-1 rounded-lg ${scenarioStyles[currentSalary] || "bg-blue-500/20 text-blue-300"}`;

  // === Card 1: Month-by-Month ===
  renderMonthCards(monthly);

  // Update family savings note
  const fin = getCurrentFinancials();
  const famReduc = getFamilyReduction(fin.categories);
  const famNote = el("fam-savings-note");
  if (familyMode === "full") {
    famNote.textContent = "Currently keeping full family contributions.";
  } else if (familyMode === "prorated") {
    famNote.textContent = `Saving ~${fmt(famReduc)}/mo — you pay half, kuya covers the rest.`;
  } else {
    famNote.textContent = `Saving ~${fmt(famReduc)}/mo — no more family contributions.`;
  }

  // === Card 2: Year-by-Year Repricing ===
  const income = getProjectedIncome(fin.income);
  // Adjust expenses for yearly view too
  const adjustedExpForYearly = fin.total - getFamilyReduction(fin.categories) + POST_WEDDING_TOTAL;
  renderYearlyProgression(income, adjustedExpForYearly);

  // === Card 3: Salary Comparison (3-way) ===
  const income125 = fin.income;
  const income185 = fin.income + SALARY_INCREASE_185K;
  const income210 = fin.income + SALARY_INCREASE_210K;
  renderSalaryComparison(income125, income185, income210, adjustedExpForYearly, monthly);
}

function renderMonthCards(housePayment) {
  const container = el("month-cards");
  const housingLabel = isRentTrack() ? "Rent" : "Pag-IBIG";
  const now = new Date();
  const startMonth = now.getMonth(); // current month (0-indexed)
  const startYear = now.getFullYear();
  const currentYear = startYear; // 2026

  // Find a "reference month" — the current month's data as fallback for empty months
  const refData = getCurrentFinancials();

  // Start with Firebase startingBalance (running balance from Money app)
  let runningBalance = Number(appData?.startingBalance) || 0;

  // Calculate running balance UP TO current month (from month 0 to startMonth-1)
  for (let m = 0; m < startMonth; m++) {
    const d = getMonthData(m);
    runningBalance += d.income - d.total;
  }

  // Show only remaining months in current year (no 2027 projections)
  const maxMonths = 12 - startMonth;
  const cards = [];
  let lastYear = startYear;

  for (let i = 0; i < maxMonths; i++) {
    const mIdx = (startMonth + i) % 12;
    const year = startYear + Math.floor((startMonth + i) / 12);
    const monthLabel = `${MONTH_FULL[mIdx]} ${year}`;

    // Year divider when crossing into a new year
    if (year !== lastYear) {
      cards.push(`
        <div class="col-span-full flex items-center gap-3 py-2">
          <div class="flex-1 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent"></div>
          <div class="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 rounded-xl border border-amber-500/20">
            <span class="material-icons-round text-[12px] text-amber-400">auto_awesome</span>
            <span class="text-[9px] font-bold tracking-[0.25em] uppercase text-amber-400">Projected ${year}</span>
          </div>
          <div class="flex-1 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent"></div>
        </div>
      `);
      lastYear = year;
    }

    // Pull Firebase data — if month has no data (income=0), use reference month
    const rawData = getMonthData(mIdx);
    const isProjected = (year > currentYear) || rawData.income === 0;
    const mData = (rawData.income > 0) ? rawData : refData;
    const income = getProjectedIncome(mData.income);
    const expenses = mData.total;

    // House payment starts May 2026 (when you buy the house)
    const houseActive = (year > 2026) || (year === 2026 && mIdx >= 4); // May = index 4
    const thisHouse = houseActive ? housePayment : 0;

    // Post-wedding living expenses kick in Aug 2026 (first full month as married)
    const postWeddingActive = (year > 2026) || (year === 2026 && mIdx >= 7); // Aug = index 7
    const livingCost = postWeddingActive ? POST_WEDDING_TOTAL : 0;

    // Family support reduction kicks in July 2026 (month you leave)
    const familyLeft = (year > 2026) || (year === 2026 && mIdx >= 6); // Jul = index 6
    const familyReduction = familyLeft ? getFamilyReduction(mData.categories) : 0;

    const carryOver = runningBalance;
    const adjustedExpenses = expenses - familyReduction;
    const monthNet = income - adjustedExpenses - thisHouse - livingCost;
    runningBalance += monthNet; // carry forward
    const endBalance = runningBalance;

    const isWedding = (mIdx === 6 && year === 2026);
    const isHouseStart = (i === 6);
    const isCurrent = (i === 0);

    // Status based on END OF MONTH balance (not just monthly net)
    let statusColor, statusBg, statusText;
    if (endBalance < 0) {
      statusColor = "text-rose-400"; statusBg = "border-rose-500/20"; statusText = "NEGATIVE";
    } else if (monthNet < 0 && endBalance >= 0) {
      statusColor = "text-amber-400"; statusBg = "border-amber-500/20"; statusText = "DIPPING INTO SAVINGS";
    } else if (monthNet < 10000) {
      statusColor = "text-amber-300"; statusBg = "border-amber-500/10"; statusText = "TIGHT";
    } else if (monthNet < 20000) {
      statusColor = "text-blue-400"; statusBg = "border-blue-500/10"; statusText = "OK";
    } else {
      statusColor = "text-emerald-400"; statusBg = "border-emerald-500/20"; statusText = "COMFORTABLE";
    }

    // Badge
    let badge = "";
    if (isCurrent) badge = '<span class="px-2 py-0.5 rounded-md text-[8px] font-bold bg-blue-500/20 text-blue-300 uppercase">Now</span>';
    else if (isWedding) badge = '<span class="px-2 py-0.5 rounded-md text-[8px] font-bold bg-pink-500/20 text-pink-300 uppercase">Wedding</span>';
    else if (isHouseStart) badge = '<span class="px-2 py-0.5 rounded-md text-[8px] font-bold bg-indigo-500/20 text-indigo-300 uppercase">House Starts</span>';
    else if (isProjected) badge = '<span class="px-2 py-0.5 rounded-md text-[8px] font-bold bg-amber-500/10 text-amber-400/70 uppercase">Projected</span>';

    // Usage bar: how much of income is consumed
    const totalIn = carryOver + income;
    const totalSpend = adjustedExpenses + thisHouse + livingCost;
    const usedPct = totalIn > 0 ? Math.min((totalSpend / totalIn) * 100, 100) : 0;
    const expPct = totalIn > 0 ? Math.min((adjustedExpenses / totalIn) * 100, 100) : 0;
    const housePct = totalIn > 0 ? Math.min((thisHouse / totalIn) * 100, 100) : 0;
    const livingPct = totalIn > 0 ? Math.min((livingCost / totalIn) * 100, 100) : 0;

    // Build expense detail rows for expandable section
    const typeLabels = { fixed: "Fixed", cc: "Credit Card", others: "Other" };
    const typeColors = { fixed: "text-slate-400", cc: "text-rose-400", others: "text-amber-400" };
    const typeDots = { fixed: "bg-slate-500", cc: "bg-rose-500", others: "bg-amber-500" };

    // Income items from raw Firebase data (handle both array and object)
    const rawIncome = mData.raw?.incomeSources || [];
    const incomeItems = Array.isArray(rawIncome) ? rawIncome : Object.values(rawIncome);
    const expenseItems = mData.categories || [];

    const detailId = `detail-${i}`;

    cards.push(`
      <div class="month-card bg-slate-800/40 rounded-2xl p-4 border ${statusBg} space-y-3 transition-all duration-300" style="animation-delay: ${i * 40}ms" onclick="toggleMonthDetail('${detailId}', this)">
        <!-- Header -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-sm font-display font-bold text-white">${monthLabel}</span>
            ${badge}
          </div>
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded-md text-[8px] font-bold ${statusColor} bg-slate-900/50">${statusText}</span>
            <span class="material-icons-round text-[14px] text-slate-500 mc-chevron transition-transform duration-300">expand_more</span>
          </div>
        </div>

        <!-- Budget lines -->
        <div class="space-y-1.5">
          ${carryOver !== 0 ? `
          <div class="flex items-center justify-between text-[10px]">
            <span class="flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              <span class="text-slate-400">Carry-over</span>
            </span>
            <span class="font-semibold ${carryOver >= 0 ? 'text-blue-400' : 'text-rose-400'} tabular-nums">${fmt(carryOver)}</span>
          </div>` : ""}
          <div class="flex items-center justify-between text-[10px]">
            <span class="flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span class="text-slate-400">Income</span>
            </span>
            <span class="font-bold text-emerald-400 tabular-nums font-display">${fmt(income)}</span>
          </div>
          <div class="flex items-center justify-between text-[10px]">
            <span class="flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
              <span class="text-slate-400">Expenses${familyReduction > 0 ? ' <span class="text-[7px] text-emerald-400/70">(−' + fmtShort(familyReduction) + ' fam)</span>' : ''}</span>
            </span>
            <span class="font-semibold text-rose-400 tabular-nums">- ${fmt(adjustedExpenses)}</span>
          </div>
          ${houseActive ? `
          <div class="flex items-center justify-between text-[10px]">
            <span class="flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
              <span class="text-slate-400">${housingLabel}</span>
            </span>
            <span class="font-semibold text-indigo-400 tabular-nums">- ${fmt(thisHouse)}</span>
          </div>` : ""}
          ${postWeddingActive ? `
          <div class="flex items-center justify-between text-[10px]">
            <span class="flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-pink-500"></span>
              <span class="text-slate-400">Living Expenses</span>
            </span>
            <span class="font-semibold text-pink-400 tabular-nums">- ${fmt(livingCost)}</span>
          </div>` : ""}
          <div class="border-t border-white/[0.06] pt-1.5 space-y-1">
            <div class="flex items-center justify-between text-[10px]">
              <span class="text-slate-500 text-[9px]">This month's net</span>
              <span class="font-semibold tabular-nums ${monthNet >= 0 ? 'text-emerald-400/70' : 'text-rose-400/70'}">${monthNet >= 0 ? '+' : ''}${fmt(monthNet)}</span>
            </div>
            <div class="flex items-center justify-between text-[10px]">
              <span class="text-slate-300 font-bold uppercase tracking-wider text-[9px]">End of Month</span>
              <span class="font-bold font-display text-sm tabular-nums ${statusColor}">${fmt(endBalance)}</span>
            </div>
          </div>
        </div>

        <!-- Visual bar: how much of total available (carry+income) is consumed -->
        <div class="h-2 bg-slate-900/60 rounded-full overflow-hidden flex">
          <div class="h-full bg-rose-500/70 rounded-l-full transition-all duration-700 mc-bar" style="width: 0%" data-width="${expPct}%"></div>
          ${houseActive ? `<div class="h-full bg-indigo-500/70 transition-all duration-700 mc-bar" style="width: 0%" data-width="${housePct}%"></div>` : ""}
          ${postWeddingActive ? `<div class="h-full bg-pink-500/70 transition-all duration-700 mc-bar" style="width: 0%" data-width="${livingPct}%"></div>` : ""}
          <div class="h-full flex-1 bg-emerald-500/30 rounded-r-full"></div>
        </div>
        <div class="flex justify-between text-[8px] text-slate-500 font-semibold">
          <span>${usedPct.toFixed(0)}% of funds used</span>
          <span>${(100 - usedPct).toFixed(0)}% remaining</span>
        </div>

        <!-- Expandable Expense Detail -->
        <div id="${detailId}" class="expense-detail" onclick="event.stopPropagation()">
          <div class="pt-2 border-t border-white/[0.06] space-y-3">
            ${incomeItems.length ? `
            <div>
              <p class="text-[8px] font-bold tracking-[0.25em] uppercase text-emerald-500/70 mb-1.5">Income Sources</p>
              <div class="space-y-1">
                ${incomeItems.map(x => `
                  <div class="flex justify-between text-[10px]">
                    <span class="text-slate-400 truncate max-w-[60%]">${x.name}</span>
                    <span class="text-emerald-400 font-semibold tabular-nums">${fmt(x.amount)}</span>
                  </div>
                `).join("")}
              </div>
            </div>` : ""}
            ${expenseItems.length ? `
            <div>
              <p class="text-[8px] font-bold tracking-[0.25em] uppercase text-rose-500/70 mb-1.5">Expense Breakdown</p>
              <div class="space-y-1">
                ${expenseItems.map(x => `
                  <div class="flex justify-between items-center text-[10px] ${x.isPaid ? 'opacity-40' : ''}">
                    <span class="flex items-center gap-1.5 truncate max-w-[60%]">
                      <span class="w-1 h-1 rounded-full ${x.isPaid ? 'bg-emerald-500' : (typeDots[x.type] || 'bg-slate-500')} flex-shrink-0"></span>
                      <span class="text-slate-400 truncate ${x.isPaid ? 'line-through' : ''}">${x.name}</span>
                      <span class="text-[7px] ${typeColors[x.type] || 'text-slate-500'} flex-shrink-0">${typeLabels[x.type] || ''}</span>
                      ${x.isPaid ? '<span class="text-[7px] text-emerald-500 flex-shrink-0">PAID</span>' : ''}
                    </span>
                    <span class="${x.isPaid ? 'text-slate-500' : 'text-rose-400/80'} font-semibold tabular-nums flex-shrink-0">${fmt(x.amount)}</span>
                  </div>
                `).join("")}
              </div>
            </div>` : '<p class="text-[10px] text-slate-500 text-center py-2">No expense data for this month</p>'}
            ${postWeddingActive ? `
            <div>
              <p class="text-[8px] font-bold tracking-[0.25em] uppercase text-pink-500/70 mb-1.5">Living Expenses (Post-Wedding)</p>
              <div class="space-y-1">
                ${POST_WEDDING_EXPENSES.map(x => `
                  <div class="flex justify-between items-center text-[10px]">
                    <span class="flex items-center gap-1.5">
                      <span class="material-icons-round text-[11px] text-pink-400/60">${x.icon}</span>
                      <span class="text-slate-400">${x.name}</span>
                    </span>
                    <span class="text-pink-400/80 font-semibold tabular-nums">${fmt(x.amount)}</span>
                  </div>
                `).join("")}
                <div class="flex justify-between items-center text-[10px] border-t border-white/[0.04] pt-1 mt-1">
                  <span class="text-slate-300 font-bold text-[9px]">TOTAL</span>
                  <span class="text-pink-400 font-bold tabular-nums">${fmt(POST_WEDDING_TOTAL)}</span>
                </div>
              </div>
            </div>` : ""}
          </div>
        </div>
      </div>
    `);
  }

  container.innerHTML = cards.join("");

  // Animate the bars in
  requestAnimationFrame(() => {
    setTimeout(() => {
      container.querySelectorAll(".mc-bar").forEach((bar) => {
        bar.style.width = bar.dataset.width;
      });
    }, 100);
  });
}

function renderYearlyProgression(income, expenses) {
  const track = getTrack();

  // For rent: show simple flat projection (no repricing)
  if (track.isRent) {
    const payment = track.rentAmount;
    const remaining = income - expenses - payment - POST_WEDDING_TOTAL;
    const periods = [
      { label: "Every Year", rate: 0, payment, remaining },
    ];

    // Simple chart for rent
    const ctx = el("chart-yearly").getContext("2d");
    if (charts.yearly) charts.yearly.destroy();
    charts.yearly = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["Year 1", "Year 2", "Year 3", "Year 5", "Year 10"],
        datasets: [
          { label: "Expenses", data: Array(5).fill(Math.round(expenses)), backgroundColor: "rgba(244, 63, 94, 0.5)", borderRadius: 4, barPercentage: 0.65 },
          { label: "Rent", data: Array(5).fill(Math.round(payment)), backgroundColor: "rgba(99, 102, 241, 0.7)", borderRadius: 4, barPercentage: 0.65 },
          { label: "Remaining", data: Array(5).fill(Math.max(0, Math.round(remaining))), backgroundColor: "rgba(34, 197, 94, 0.6)", borderRadius: 4, barPercentage: 0.65 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { stacked: true, ticks: { color: "#475569", font: { size: 8, weight: 600 } }, grid: { display: false } },
          y: { stacked: true, ticks: { color: "#475569", font: { size: 8, weight: 600 }, callback: (v) => fmtShort(v) }, grid: { color: "rgba(255,255,255,0.03)" }, max: Math.round(income * 1.1) },
        },
        plugins: { legend: { display: false }, tooltip: { backgroundColor: "#1e293b", titleColor: "#94a3b8", bodyColor: "#f1f5f9" } },
        animation: { duration: 700 },
      },
    });

    const tbody = el("yearly-table");
    const isOk = remaining > 0;
    const statusColor = !isOk ? "text-rose-400" : remaining < 15000 ? "text-amber-400" : "text-emerald-400";
    const statusText = !isOk ? "OVER" : remaining < 15000 ? "TIGHT" : "OK";
    const statusBg = !isOk ? "bg-rose-500/15" : remaining < 15000 ? "bg-amber-500/15" : "bg-emerald-500/15";
    tbody.innerHTML = `
      <tr>
        <td class="py-2.5 px-2 text-slate-300 font-medium">Every month, forever</td>
        <td class="py-2.5 px-2 text-right text-slate-400 tabular-nums">—</td>
        <td class="py-2.5 px-2 text-right text-indigo-400 font-bold tabular-nums">${fmt(payment)}</td>
        <td class="py-2.5 px-2 text-right ${statusColor} font-bold tabular-nums">${fmt(remaining)}</td>
        <td class="py-2.5 px-2 text-right"><span class="px-2 py-0.5 rounded-md text-[9px] font-bold ${statusBg} ${statusColor}">${statusText}</span></td>
      </tr>
      <tr>
        <td colspan="5" class="py-3 px-2 text-[10px] text-slate-500 text-center italic">Flat ${fmt(payment)}/mo — no repricing, no equity.</td>
      </tr>
    `;
    return;
  }

  // Loan tracks: Build data for each repricing period
  const periods = REPRICING_SCHEDULE.map((p) => {
    const payment = calcMonthly(getLoanAmount(), p.rate, getLoanTermMonths());
    const remaining = income - expenses - payment - POST_WEDDING_TOTAL;
    return { ...p, payment, remaining };
  });

  // Stacked bar chart: Expenses + House + Remaining = Income
  const ctx = el("chart-yearly").getContext("2d");
  if (charts.yearly) charts.yearly.destroy();

  charts.yearly = new Chart(ctx, {
    type: "bar",
    data: {
      labels: periods.map((p) => p.label),
      datasets: [
        {
          label: "Expenses",
          data: periods.map(() => Math.round(expenses)),
          backgroundColor: "rgba(244, 63, 94, 0.5)",
          borderRadius: 4,
          barPercentage: 0.65,
        },
        {
          label: "Pag-IBIG",
          data: periods.map((p) => Math.round(p.payment)),
          backgroundColor: "rgba(99, 102, 241, 0.7)",
          borderRadius: 4,
          barPercentage: 0.65,
        },
        {
          label: "Remaining",
          data: periods.map((p) => Math.max(0, Math.round(p.remaining))),
          backgroundColor: "rgba(34, 197, 94, 0.6)",
          borderRadius: 4,
          barPercentage: 0.65,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          ticks: { color: "#475569", font: { size: 8, weight: 600 } },
          grid: { display: false },
        },
        y: {
          stacked: true,
          ticks: { color: "#475569", font: { size: 8, weight: 600 }, callback: (v) => fmtShort(v) },
          grid: { color: "rgba(255,255,255,0.03)" },
          max: Math.round(income * 1.1),
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1e293b",
          titleColor: "#94a3b8",
          bodyColor: "#f1f5f9",
          borderColor: "rgba(255,255,255,0.1)",
          borderWidth: 1,
          padding: 10,
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` },
        },
      },
      animation: { duration: 700 },
    },
  });

  // Detail table
  const tbody = el("yearly-table");
  tbody.innerHTML = periods.map((p) => {
    const isOk = p.remaining > 0;
    const isTight = p.remaining > 0 && p.remaining < 15000;
    const statusColor = !isOk ? "text-rose-400" : isTight ? "text-amber-400" : "text-emerald-400";
    const statusText = !isOk ? "OVER" : isTight ? "TIGHT" : "OK";
    const statusBg = !isOk ? "bg-rose-500/15" : isTight ? "bg-amber-500/15" : "bg-emerald-500/15";
    return `
      <tr>
        <td class="py-2.5 px-2 text-slate-300 font-medium">${p.label}</td>
        <td class="py-2.5 px-2 text-right text-slate-400 tabular-nums">${p.rate}%</td>
        <td class="py-2.5 px-2 text-right text-indigo-400 font-bold tabular-nums">${fmt(p.payment)}</td>
        <td class="py-2.5 px-2 text-right ${statusColor} font-bold tabular-nums">${fmt(p.remaining)}</td>
        <td class="py-2.5 px-2 text-right"><span class="px-2 py-0.5 rounded-md text-[9px] font-bold ${statusBg} ${statusColor}">${statusText}</span></td>
      </tr>
    `;
  }).join("");
}

function renderSalaryComparison(income125, income185, income210, expenses, monthly) {
  const remaining125 = income125 - expenses - monthly - POST_WEDDING_TOTAL;
  const remaining185 = income185 - expenses - monthly - POST_WEDDING_TOTAL;
  const remaining210 = income210 - expenses - monthly - POST_WEDDING_TOTAL;
  const diff185 = remaining185 - remaining125;
  const diff210 = remaining210 - remaining125;

  function buildColumn(income, remaining, colId) {
    const housingLabel = isRentTrack() ? "Rent" : "Pag-IBIG";
    const items = [
      { label: "Income", value: fmt(income), color: "text-emerald-400" },
      { label: "Expenses", value: `- ${fmt(expenses)}`, color: "text-rose-400" },
      { label: housingLabel, value: `- ${fmt(monthly)}`, color: "text-indigo-400" },
      { label: "Living", value: `- ${fmt(POST_WEDDING_TOTAL)}`, color: "text-pink-400" },
      { label: "divider", value: "", color: "" },
      { label: "Left", value: fmt(remaining), color: remaining >= 0 ? "text-emerald-400" : "text-rose-400", bold: true },
    ];

    el(colId).innerHTML = items.map((item) => {
      if (item.label === "divider") return '<div class="border-t border-white/[0.06] my-1"></div>';
      return `
        <div class="flex justify-between items-center">
          <span class="text-[8px] text-slate-500 uppercase tracking-wider">${item.label}</span>
          <span class="text-[10px] ${item.color} tabular-nums ${item.bold ? "font-bold font-display text-[11px]" : "font-semibold"}">${item.value}</span>
        </div>
      `;
    }).join("");
  }

  buildColumn(income125, remaining125, "col-125");
  buildColumn(income185, remaining185, "col-185");
  buildColumn(income210, remaining210, "col-210");

  el("salary-diff-185").textContent = `+ ${fmt(diff185)}`;
  el("salary-diff-210").textContent = `+ ${fmt(diff210)}`;
}

// =============================================
// RENDER: TIMELINE
// =============================================
function renderTimeline() {
  const fin = getCurrentFinancials();
  const income = getProjectedIncome(fin.income);
  const savings = income - fin.total;
  const monthly = calcMonthly(getLoanAmount(), currentRate, getLoanTermMonths());
  const monthsToDP = savings > 0 ? Math.ceil(getTotalCashNeeded() / savings) : 99;

  const now = new Date();
  const weddingPassed = now >= WEDDING_DATE;

  // Calculate dates
  const dpReadyDate = new Date(now);
  dpReadyDate.setMonth(dpReadyDate.getMonth() + monthsToDP);

  const applyDate = new Date(dpReadyDate);
  applyDate.setMonth(applyDate.getMonth() - 2); // Apply 2 months before DP ready

  const approvalDate = new Date(applyDate);
  approvalDate.setMonth(approvalDate.getMonth() + 3); // ~3 months to approval

  const firstPayment = new Date(approvalDate);
  firstPayment.setMonth(firstPayment.getMonth() + 1);

  const paidOffDate = new Date(firstPayment);
  paidOffDate.setFullYear(paidOffDate.getFullYear() + getTrack().termYears);

  const formatDate = (d) => `${MONTH_FULL[d.getMonth()]} ${d.getFullYear()}`;
  const shortDate = (d) => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

  const milestones = [
    {
      icon: "favorite",
      color: "#f472b6",
      title: "Wedding Day",
      date: shortDate(WEDDING_DATE),
      desc: "Charlie & Karla",
      status: weddingPassed ? "done" : (now.getMonth() >= 5 && now.getFullYear() === 2026 ? "active" : "future"),
    },
    {
      icon: "savings",
      color: "#f59e0b",
      title: "Down Payment Saved",
      date: formatDate(dpReadyDate),
      desc: `${fmt(getTotalCashNeeded())} target (${monthsToDP} months)`,
      status: "future",
    },
    {
      icon: "description",
      color: "#3b82f6",
      title: "Pag-IBIG Application",
      date: formatDate(applyDate),
      desc: "Submit documents & apply",
      status: "future",
    },
    {
      icon: "verified",
      color: "#22c55e",
      title: "Loan Approval",
      date: formatDate(approvalDate),
      desc: `${fmt(getLoanAmount())} @ ${currentRate}% for 30 years`,
      status: "future",
    },
    {
      icon: "home",
      color: "#6366f1",
      title: "First Payment",
      date: formatDate(firstPayment),
      desc: `${fmt(monthly)}/month begins`,
      status: "future",
    },
    {
      icon: "celebration",
      color: "#a855f7",
      title: "Fully Paid",
      date: formatDate(paidOffDate),
      desc: `House is 100% yours at age ${26 + getTrack().termYears}`,
      status: "future",
    },
  ];

  const container = el("timeline-list");
  container.innerHTML = `<div class="tl-line"></div>` + milestones.map((m, i) => `
    <div class="tl-node" style="--d: ${i * 0.1}s">
      <div class="tl-dot ${m.status}">
        ${m.status === "done" ? '<span class="material-icons-round text-emerald-400">check</span>' : ""}
      </div>
      <div>
        <div class="flex items-center gap-2 mb-0.5">
          <span class="material-icons-round text-[14px]" style="color:${m.color}">${m.icon}</span>
          <span class="text-xs font-bold text-white">${m.title}</span>
        </div>
        <p class="text-[10px] font-semibold text-blue-400">${m.date}</p>
        <p class="text-[10px] text-slate-400 mt-0.5">${m.desc}</p>
      </div>
    </div>
  `).join("");

  // Key numbers
  const keyNums = el("key-numbers");
  const age = 26;
  const data = [
    { label: "Your Age", value: `${age}`, sub: "years old" },
    { label: "Loan Term", value: "30", sub: "years" },
    { label: "Paid Off Age", value: `${age + getTrack().termYears}`, sub: "years old" },
    { label: "Total Interest", value: fmtShort(calcMonthly(getLoanAmount(), currentRate, getLoanTermMonths()) * getLoanTermMonths() - getLoanAmount()), sub: "over 30 years" },
    { label: "Monthly Payment", value: fmt(monthly), sub: `@ ${currentRate}%` },
    { label: "Monthly Buffer", value: fmt(currentSalary * 0.35 - monthly), sub: "from DTI limit" },
  ];

  keyNums.innerHTML = data.map((d) => `
    <div class="bg-slate-800/50 rounded-xl p-3 border border-white/[0.04] text-center">
      <p class="text-[10px] font-bold tracking-widest uppercase text-slate-500">${d.label}</p>
      <p class="text-sm font-display font-bold text-white mt-1 tabular-nums">${d.value}</p>
      <p class="text-[8px] text-slate-500 mt-0.5">${d.sub}</p>
    </div>
  `).join("");

  // Amortization chart (first 12 months)
  renderAmortChart();
}

function renderAmortChart() {
  const ctx = el("chart-amort").getContext("2d");
  if (charts.amort) charts.amort.destroy();

  const monthly = calcMonthly(getLoanAmount(), currentRate, getLoanTermMonths());
  const r = currentRate / 100 / 12;
  let balance = getLoanAmount();

  const principals = [];
  const interests = [];
  const labels = [];

  for (let i = 1; i <= 12; i++) {
    const interestPart = balance * r;
    const principalPart = monthly - interestPart;
    interests.push(Math.round(interestPart));
    principals.push(Math.round(principalPart));
    labels.push(`Mo ${i}`);
    balance -= principalPart;
  }

  charts.amort = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Principal",
          data: principals,
          backgroundColor: "#3b82f6",
          borderRadius: 4,
          barPercentage: 0.6,
        },
        {
          label: "Interest",
          data: interests,
          backgroundColor: "#f43f5e",
          borderRadius: 4,
          barPercentage: 0.6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          ticks: { color: "#475569", font: { size: 8, weight: 600 } },
          grid: { display: false },
        },
        y: {
          stacked: true,
          ticks: { color: "#475569", font: { size: 8, weight: 600 }, callback: (v) => fmtShort(v) },
          grid: { color: "rgba(255,255,255,0.03)" },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1e293b",
          titleColor: "#94a3b8",
          bodyColor: "#f1f5f9",
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` },
        },
      },
      animation: { duration: 600 },
    },
  });
}

// =============================================
// RENDER ALL
// =============================================
function renderAll() {
  renderOverview();
  if (activeSection === "house") renderHouse();
  if (activeSection === "trajectory") renderTrajectory();
  if (activeSection === "timeline") renderTimeline();
}

// =============================================
// INITIALIZATION
// =============================================
window.addEventListener("DOMContentLoaded", async () => {
  runSplash();

  // Show loading
  setTimeout(() => {
    el("loading-overlay").classList.remove("hidden");
  }, 1800);

  try {
    // Initial fetch
    const snapshot = await get(dbRef);
    if (snapshot.exists() && snapshot.val()) {
      appData = snapshot.val();
      if (!appData.monthlyData) appData.monthlyData = {};
    } else {
      appData = { startingBalance: 0, monthlyData: {} };
    }

    // Hide loading, render
    setTimeout(() => {
      el("loading-overlay").classList.add("hidden");
      renderAll();
    }, 2400);

    // Live listener for real-time updates
    onValue(dbRef, (snapshot) => {
      if (snapshot.exists() && snapshot.val()) {
        appData = snapshot.val();
        if (!appData.monthlyData) appData.monthlyData = {};
        renderAll();
      }
    });
  } catch (err) {
    console.error("Firebase error:", err);
    el("loading-overlay").innerHTML = `
      <div class="text-center space-y-3">
        <span class="material-icons-round text-4xl text-rose-400">cloud_off</span>
        <p class="text-sm font-bold text-white">Connection Failed</p>
        <p class="text-[10px] text-slate-400">Could not sync with Firebase</p>
        <button onclick="location.reload()" class="mt-2 px-4 py-2 bg-blue-600 rounded-xl text-xs font-bold active:scale-95 transition-transform">Retry</button>
      </div>
    `;
  }
});
