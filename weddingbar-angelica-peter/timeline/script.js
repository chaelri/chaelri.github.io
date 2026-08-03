import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  set,
  update,
  remove,
  push,
  get,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBNPdSYJXuzvmdEHIeHGkbPmFnZxUq1lAg",
  authDomain: "test-database-55379.firebaseapp.com",
  databaseURL:
    "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "test-database-55379",
  storageBucket: "test-database-55379.firebasestorage.app",
  messagingSenderId: "954582649260",
  appId: "1:954582649260:web:393fcc0fddafeb571f5209",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const storage = getStorage(app);

// All of this couple's data lives under one root, so it can never touch
// another couple's copy of this template in the same Firebase project.
const DB_ROOT = "angelicaPeter";
const DB_WEDDING = `${DB_ROOT}/wedding_data`;
const DB_GUESTS = `${DB_ROOT}/guestList`;

const WEDDING_DATE = new Date("2027-02-01T00:00:00");

const ROLE_HIERARCHY = [
  "bride",
  "groom",
  "parent of bride",
  "parent of groom",
  "officiant",
  "maid of honor",
  "bridesmaid",
  "best man",
  "groomsman",
  "principal sponsor",
  "secondary sponsor (veil)",
  "secondary sponsor (coin)",
  "secondary sponsor (candle)",
  "bible bearer",
  "ring bearer",
  "flower boy",
  "flower girl",
  "guest",
  "guests",
];

// Cluster map by chapter id
const CLUSTER_BY_ID = {
  0: "paperwork", 1: "paperwork", 2: "paperwork", 3: "paperwork", 4: "paperwork",
  5: "party", 6: "party",
  7: "dayof", 8: "dayof", 9: "dayof", 10: "dayof", 11: "dayof", 12: "dayof",
  13: "layout",
  14: "social",
};

function getRoleColorClass(role) {
  role = (role || "").toLowerCase().trim();
  if (role === "bride" || role === "groom") return "role-couple";
  if (role.includes("parent")) return "role-family";
  if (role.includes("officiant")) return "role-officiant";
  if (
    role.includes("maid") ||
    role.includes("best man") ||
    role.includes("bridesmaid") ||
    role.includes("groomsman")
  )
    return "role-party";
  if (role.includes("sponsor")) return "role-sponsor";
  if (role.includes("bearer") || role.includes("boy") || role.includes("girl"))
    return "role-kids";
  return "";
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * DATABASE STRUCTURE - CHAPTERS 0 - 14
 */
let weddingData = {
  chapters: [
    {
      id: 0,
      title: "The Foundation",
      subtitle: "6 Months Out",
      period: "Aug 01 - Sep 01, 2026",
      color: "#1e3a8a",
      type: "list",
      content: [
        { text: "Check LCR Requirements", checked: false },
        { text: "Check Church specific rules", checked: false },
        { text: "Review PSA spelling errors", checked: false },
        { text: "Fix late registration issues", checked: false },
      ],
    },
    {
      id: 1,
      title: "The Basics",
      subtitle: "5 Months Out",
      period: "Sep 02 - Oct 01, 2026",
      color: "#1e40af",
      type: "list",
      content: [
        { text: "Finalize wedding date", checked: false },
        { text: "Prepare 2 Valid IDs", checked: false },
        { text: "Get 2x2 Photos", checked: false },
        { text: "Organize old PSA docs", checked: false },
      ],
    },
    {
      id: 2,
      title: "Document Request",
      subtitle: "4 Months Out",
      period: "Oct 02 - Nov 01, 2026",
      color: "#1d4ed8",
      type: "list",
      content: [
        { text: "Request fresh PSA Birth Certs", checked: false },
        { text: "Request fresh PSA CENOMAR", checked: false },
      ],
    },
    {
      id: 3,
      title: "The Seminars",
      subtitle: "3 Months Out",
      period: "Nov 02 - Dec 01, 2026",
      color: "#2563eb",
      type: "list",
      content: [
        { text: "Pre-marriage Counseling", checked: false },
        { text: "Family Planning Seminar", checked: false },
        { text: "Secure Cedula", checked: false },
        { text: "Barangay Certificate", checked: false },
      ],
    },
    {
      id: 4,
      title: "The License",
      subtitle: "2 Months Out",
      period: "Dec 02, 2026 - Jan 22, 2027",
      color: "#3b82f6",
      type: "list",
      content: [
        { text: "Apply for License at City Hall", checked: false },
        { text: "Mandatory 10-day Posting", checked: false },
        { text: "Pick up License (Valid 120 days)", checked: false },
      ],
    },
    {
      id: 5,
      title: "The Vendor Guild",
      subtitle: "Guild Roster",
      period: "Contacts",
      color: "#b45309",
      type: "table",
      headers: ["Service", "Vendor", "Contact Person"],
      content: [
        ["Venue", "-", "-"],
        ["Catering", "-", "-"],
      ],
    },
    {
      id: 6,
      title: "The Entourage",
      subtitle: "Party Roles",
      period: "Responsibilities",
      color: "#d97706",
      type: "table",
      headers: ["Name", "Role", "Responsibilities"],
      content: [],
    },
    {
      id: 7,
      title: "Ceremony Inventory",
      subtitle: "Day-Of Checklist",
      period: "Church Items",
      color: "#881337",
      type: "list",
      content: [
        { text: "Wedding Rings", checked: false },
        { text: "Arrhae", checked: false },
        { text: "Bible", checked: false },
        { text: "Veil", checked: false },
        { text: "Cord", checked: false },
      ],
    },
    {
      id: 8,
      title: "Reception Inventory",
      subtitle: "Day-Of Checklist",
      period: "Party Items",
      color: "#9f1239",
      type: "list",
      content: [
        { text: "Wine", checked: false },
        { text: "Prizes for Games", checked: false },
        { text: "Guestlist Chart", checked: false },
      ],
    },
    {
      id: 9,
      title: "Emergency Kit",
      subtitle: "Survival Gear",
      period: "Day-Of Essentials",
      color: "#be123c",
      type: "list",
      content: [
        { text: "Bobby Pins", checked: false },
        { text: "Safety Pins", checked: false },
        { text: "Mints", checked: false },
        { text: "Biogesic/Diatabs", checked: false },
      ],
    },
    {
      id: 10,
      title: "Snapshot List",
      subtitle: "Photography",
      period: "Shot List",
      color: "#e11d48",
      type: "list",
      content: [
        { text: "Bride with Mochi (Dog)", checked: false },
        { text: "Groom with Andre (Dog)", checked: false },
        { text: "First Kiss", checked: false },
      ],
    },
    {
      id: 11,
      title: "The Music Box",
      subtitle: "Audio",
      period: "Playlists",
      color: "#9d174d",
      type: "list",
      content: [
        { text: "Bridal Walk: Goodness of God", checked: false },
        { text: "Flower Men: Back in Black", checked: false },
        { text: "First Dance: Palagi", checked: false },
      ],
    },
    {
      id: 12,
      title: "Side Quests",
      subtitle: "Entertainment",
      period: "Games & Prizes",
      color: "#a21caf",
      type: "list",
      content: [
        { text: "Guess The Tune", checked: false },
        { text: "Trivia Game", checked: false },
        { text: "Tumpakners", checked: false },
      ],
    },
    {
      id: 13,
      title: "Boss Room Layout",
      subtitle: "Setup",
      period: "Floor Plan",
      color: "#115e59",
      type: "planner",
      layout: {
        stage: {
          x: 2500, y: 2150, type: "special", label: "STAGE", assigned: {},
        },
        couple: {
          x: 2500, y: 2300, type: "couple", label: "COUPLE SEAT", assigned: {},
        },
      },
    },
    {
      id: 14,
      title: "TikTok Trends",
      subtitle: "Social Media",
      period: "Reel Pegs",
      color: "#be185d",
      type: "list",
      content: [
        { text: "Bouquet Transition", checked: false },
        { text: "Spin Phone Transition", checked: false },
        { text: "Day in the Life Vlog", checked: false },
      ],
    },
  ],
};

let activeIndex = null;
let guestDataMap = {};
let currentTableId = null;
let isDraggingBubble = false;
let isDraggingTable = false;
let isResizing = false;
let panX = 0, panY = 0, scale = 0.8;

let activeFilter = "all";
let activeView = "grid";

function autoResize(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

/* ───────────────────────── Confirm modal ───────────────────────── */

let _confirmResolver = null;

/**
 * Show a styled confirm dialog. Returns a Promise<boolean>.
 * opts: { title, message, okLabel, variant: "danger" | "safe", strong }
 */
function confirmModal(opts = {}) {
  const {
    title = "Are you sure?",
    message = "",
    okLabel = "Delete",
    variant = "danger",
    strong = null,
  } = opts;

  return new Promise((resolve) => {
    const modal = document.getElementById("confirm-modal");
    if (!modal) { resolve(window.confirm(message || title)); return; }

    document.getElementById("confirm-title").textContent = title;
    // Allow one <strong> interpolation via the `strong` field
    const bodyEl = document.getElementById("confirm-body");
    if (strong) {
      const esc = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      bodyEl.innerHTML = esc(message).replace("{{name}}", `<strong>${esc(strong)}</strong>`);
    } else {
      bodyEl.textContent = message;
    }
    document.getElementById("confirm-ok-label").textContent = okLabel;
    const okBtn = modal.querySelector(".confirm-ok");
    okBtn.classList.toggle("is-safe", variant === "safe");

    modal.classList.remove("hidden");
    _confirmResolver = resolve;
  });
}

window.resolveConfirm = (val) => {
  const modal = document.getElementById("confirm-modal");
  if (modal) modal.classList.add("hidden");
  if (_confirmResolver) {
    const r = _confirmResolver;
    _confirmResolver = null;
    r(!!val);
  }
};
window.onConfirmBackdrop = (e) => {
  if (e.target && e.target.id === "confirm-modal") window.resolveConfirm(false);
};

/* ───────────────────────── Dashboard & status ───────────────────────── */

function parsePeriod(periodStr) {
  if (!periodStr || typeof periodStr !== "string") return null;
  // Expect "Jan 02 - Feb 01, 2026"
  // The start may carry its own year ("Dec 02, 2026 - Jan 22, 2027"); when it
  // doesn't, both ends share the trailing year.
  const m = periodStr.match(
    /([A-Za-z]{3,})\s+(\d{1,2})(?:,\s*(\d{4}))?\s*-\s*([A-Za-z]{3,})\s+(\d{1,2}),\s*(\d{4})/
  );
  if (!m) return null;
  const [, m1, d1, y1, m2, d2, y2] = m;
  const start = new Date(`${m1} ${d1} ${y1 || y2}`);
  const end = new Date(`${m2} ${d2} ${y2} 23:59:59`);
  // A range with no explicit start year that appears to run backwards really
  // began the previous year.
  if (!y1 && start > end) start.setFullYear(start.getFullYear() - 1);
  if (isNaN(start) || isNaN(end)) return null;
  return { start, end };
}

function getChapterProgress(ch) {
  if (ch.type === "list") {
    const total = (ch.content || []).length;
    const done = (ch.content || []).filter((it) => it && it.checked).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { kind: "list", total, done, pct };
  }
  if (ch.type === "table") {
    const rows = (ch.content || []).length;
    return { kind: "table", total: rows, done: rows, pct: rows > 0 ? 100 : 0 };
  }
  if (ch.type === "planner") {
    const layout = ch.layout || {};
    const tables = Object.values(layout);
    const total = tables.length;
    const done = tables.filter((t) => Object.keys(t.assigned || {}).length > 0).length;
    return { kind: "planner", total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }
  return { kind: "unknown", total: 0, done: 0, pct: 0 };
}

function computeChapterStatus(ch) {
  const prog = getChapterProgress(ch);
  const period = parsePeriod(ch.period);
  const now = new Date();

  if (prog.kind === "list" && prog.total > 0 && prog.pct === 100) return "done";

  if (period) {
    if (now < period.start) return "upcoming";
    if (now > period.end) {
      if (prog.pct === 100) return "done";
      return "overdue";
    }
    return "now";
  }

  // No date range — derive from progress only
  if (prog.pct === 100 && prog.total > 0) return "done";
  if (prog.total === 0) return "upcoming";
  return "active";
}

function statusChipMarkup(status) {
  const map = {
    now: { cls: "is-now", label: "Now" },
    active: { cls: "is-now", label: "Active" },
    done: { cls: "is-done", label: "Done" },
    upcoming: { cls: "is-upcoming", label: "Upcoming" },
    overdue: { cls: "is-overdue", label: "Overdue" },
  };
  const s = map[status] || map.upcoming;
  return `<span class="status-chip ${s.cls}"><span class="dot"></span>${s.label}</span>`;
}

function renderDashboard() {
  const chapters = weddingData.chapters || [];
  // Countdown
  const now = new Date();
  const diffMs = WEDDING_DATE - now;
  const days = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const cdEl = document.getElementById("countdown-days");
  const cdSub = document.getElementById("countdown-sub");
  if (cdEl) cdEl.textContent = days.toString();
  if (cdSub) {
    if (days === 0) cdSub.textContent = "today's the day";
    else if (days <= 14) cdSub.textContent = `that's ${weeks} week${weeks === 1 ? "" : "s"} away`;
    else if (days <= 90) cdSub.textContent = `about ${weeks} weeks · ${months} month${months === 1 ? "" : "s"}`;
    else cdSub.textContent = `about ${months} months out`;
  }

  // Overall progress (list chapters only weighed by items)
  let totalItems = 0, doneItems = 0;
  chapters.forEach((ch) => {
    if (ch.type === "list") {
      const p = getChapterProgress(ch);
      totalItems += p.total;
      doneItems += p.done;
    }
  });
  const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;
  const pctEl = document.getElementById("progress-pct");
  if (pctEl) pctEl.textContent = `${pct}%`;
  const ring = document.getElementById("ring-progress");
  if (ring) {
    const circumference = 2 * Math.PI * 52; // ~326.7
    const dashOffset = circumference * (1 - pct / 100);
    ring.style.strokeDashoffset = dashOffset.toString();
  }

  // Stats strip
  const doneEl = document.getElementById("stat-done");
  const leftEl = document.getElementById("stat-left");
  const chaptersEl = document.getElementById("stat-chapters");
  if (doneEl) doneEl.textContent = doneItems.toString();
  if (leftEl) leftEl.textContent = Math.max(0, totalItems - doneItems).toString();
  if (chaptersEl) chaptersEl.textContent = chapters.length.toString();

  // Current phase callout — first chapter whose status === "now"
  const nowCh = chapters.find((c) => computeChapterStatus(c) === "now");
  const titleEl = document.getElementById("now-title");
  const periodEl = document.getElementById("now-period");
  const nowCard = document.getElementById("now-card");

  const applyNowBg = (chapter) => {
    if (!nowCard) return;
    if (chapter && chapter.image) {
      nowCard.style.setProperty("--now-bg", `url('${chapter.image}')`);
      nowCard.classList.add("has-bg");
    } else {
      nowCard.style.removeProperty("--now-bg");
      nowCard.classList.remove("has-bg");
    }
  };

  if (nowCh) {
    if (titleEl) titleEl.textContent = nowCh.title;
    if (periodEl) periodEl.textContent = nowCh.period;
    if (nowCard) nowCard.dataset.index = chapters.indexOf(nowCh).toString();
    applyNowBg(nowCh);
  } else {
    // Find next upcoming
    const next = chapters
      .map((c) => ({ c, p: parsePeriod(c.period) }))
      .filter((x) => x.p && x.p.start >= now)
      .sort((a, b) => a.p.start - b.p.start)[0];
    if (next) {
      if (titleEl) titleEl.textContent = `Next up: ${next.c.title}`;
      if (periodEl) periodEl.textContent = next.c.period;
      if (nowCard) nowCard.dataset.index = chapters.indexOf(next.c).toString();
      applyNowBg(next.c);
    } else {
      if (titleEl) titleEl.textContent = "All phases complete";
      if (periodEl) periodEl.textContent = "You're on cloud nine";
      if (nowCard) nowCard.dataset.index = "";
      applyNowBg(null);
    }
  }
}

window.openFromNow = function () {
  const nowCard = document.getElementById("now-card");
  const idx = nowCard ? nowCard.dataset.index : "";
  if (idx !== "" && idx != null) window.openModal(parseInt(idx, 10));
};

/* ───────────────────────── Firebase sync ───────────────────────── */

function initSync() {
  onValue(ref(db, DB_WEDDING), (snapshot) => {
    if (isDraggingBubble || isDraggingTable || isResizing) return;
    const data = snapshot.val();
    if (data) {
      let migrated = false;
      data.chapters = data.chapters.map((ch) => {
        if (ch.type === "list") {
          ch.content = (ch.content || []).map((item) =>
            typeof item === "string" ? { text: item, checked: false } : item
          );
        }
        // Migration: drop legacy "Phone" column from Vendor Guild (chapter 5)
        if (ch.id === 5 && Array.isArray(ch.headers)) {
          const phoneIdx = ch.headers.findIndex(
            (h) => (h || "").toLowerCase().trim() === "phone"
          );
          if (phoneIdx !== -1) {
            ch.headers.splice(phoneIdx, 1);
            ch.content = (ch.content || []).map((row) => {
              const next = Array.isArray(row) ? [...row] : row;
              if (Array.isArray(next)) next.splice(phoneIdx, 1);
              return next;
            });
            migrated = true;
          }
        }
        return ch;
      });
      weddingData = data;
      if (migrated) set(ref(db, DB_WEDDING), weddingData);
    } else {
      set(ref(db, DB_WEDDING), weddingData);
    }
    setSyncOk();
    renderDashboard();
    renderGallery();
    if (activeIndex !== null) refreshModal();
  });

  onValue(ref(db, DB_GUESTS), (snapshot) => {
    const list = snapshot.val() || {};
    guestDataMap = list;

    const sortedGuests = Object.entries(list)
      .filter(([id, g]) => g && (g.role || "").toLowerCase().trim() !== "")
      .sort((a, b) => {
        const roleA = (a[1].role || "").toLowerCase().trim();
        const roleB = (b[1].role || "").toLowerCase().trim();
        const idxA = ROLE_HIERARCHY.indexOf(roleA);
        const idxB = ROLE_HIERARCHY.indexOf(roleB);
        const valA = idxA === -1 ? 99 : idxA;
        const valB = idxB === -1 ? 99 : idxB;
        if (valA !== valB) return valA - valB;
        return (a[1].name || "").localeCompare(b[1].name || "");
      });

    const entChapter = weddingData.chapters.find((c) => c.id === 6);
    if (entChapter) {
      entChapter.content = sortedGuests
        .filter(
          ([id, g]) =>
            !["guest", "guests"].includes((g.role || "").toLowerCase())
        )
        .map(([id, g]) => [g.name, g.role, g.notes || "", id]);
    }

    renderDashboard();
    renderGallery();
    if (activeIndex === 6) refreshModal();
    if (activeIndex === 13 && currentTableId && !isDraggingBubble) {
      renderTableContext();
      renderGuestPicker();
    }
  });
}

function setSyncOk() {
  const el = document.getElementById("sync-indicator");
  if (!el) return;
  el.classList.add("is-ok");
  el.innerHTML = `<span class="material-icons-round text-[14px]">cloud_done</span><span>Up to date</span>`;
}
function setSyncSaving() {
  const el = document.getElementById("sync-indicator");
  if (!el) return;
  el.classList.remove("is-ok");
  el.innerHTML = `<span class="material-icons-round text-[14px] animate-spin">sync</span><span>Saving</span>`;
}

/* ───────────────────────── Gallery render ───────────────────────── */

function passesFilter(ch, status) {
  const cluster = CLUSTER_BY_ID[ch.id];
  switch (activeFilter) {
    case "all": return true;
    case "now": return status === "now" || status === "active";
    case "upcoming": return status === "upcoming";
    case "done": return status === "done";
    case "paperwork": return cluster === "paperwork";
    case "party": return cluster === "party";
    case "dayof": return cluster === "dayof";
    case "social": return cluster === "social";
    default: return true;
  }
}

function renderGallery() {
  const gallery = document.getElementById("chapter-gallery");
  if (!gallery || !weddingData.chapters) return;

  gallery.classList.toggle("timeline-view", activeView === "timeline");

  const cards = weddingData.chapters
    .map((ch, idx) => {
      const status = computeChapterStatus(ch);
      if (!passesFilter(ch, status)) return null;

      const prog = getChapterProgress(ch);
      const cluster = CLUSTER_BY_ID[ch.id] || "";
      const padNum = (idx + 1).toString().padStart(2, "0");
      const bgImg = ch.image
        ? `<div class="chapter-media-img" style="background-image: url('${ch.image}'); background-color: ${ch.color};"></div>`
        : `<div class="chapter-media-img" style="background: linear-gradient(135deg, ${ch.color}, rgba(0,0,0,0.6));"></div>`;

      let progressBlock = "";
      if (prog.kind === "list") {
        const widthPct = prog.pct;
        progressBlock = `
          <div class="chapter-progress">
            <div class="progress-bar"><div class="progress-bar-fill" style="width:${widthPct}%"></div></div>
            <div class="progress-meta">
              <span><span class="done-num">${prog.done}</span><span class="total-num">/${prog.total}</span></span>
              <span class="progress-icon"><span class="material-icons-round text-[12px]">check_circle</span>${widthPct}%</span>
            </div>
          </div>`;
      } else if (prog.kind === "table") {
        progressBlock = `
          <div class="chapter-progress">
            <div class="progress-meta">
              <span><span class="done-num">${prog.total}</span><span class="total-num"> entr${prog.total === 1 ? "y" : "ies"}</span></span>
              <span class="progress-icon"><span class="material-icons-round text-[12px]">table_rows</span>Table</span>
            </div>
          </div>`;
      } else if (prog.kind === "planner") {
        progressBlock = `
          <div class="chapter-progress">
            <div class="progress-meta">
              <span><span class="done-num">${prog.done}</span><span class="total-num">/${prog.total} tables seated</span></span>
              <span class="progress-icon"><span class="material-icons-round text-[12px]">view_quilt</span>Canvas</span>
            </div>
          </div>`;
      }

      return `
        <div class="chapter-card cluster-${cluster}" onclick="window.openModal(${idx})">
          <div class="chapter-media">
            ${bgImg}
          </div>
          <div class="chapter-body">
            <span class="chapter-subtitle">${ch.subtitle || ""}</span>
            <h3 class="chapter-title">${ch.title || ""}</h3>
            <span class="chapter-period">${ch.period || ""}</span>
            ${progressBlock}
          </div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");

  gallery.innerHTML = cards || `
    <div class="col-span-full text-center py-20 text-stone-500 text-sm">
      <span class="material-icons-round text-[36px] opacity-40 block mb-2">filter_alt_off</span>
      No chapters match this filter.
    </div>
  `;
}

/* ───────────────────────── Filters + view toggle ───────────────────────── */

function wireFilters() {
  document.querySelectorAll(".view-toggle .vtoggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".view-toggle .vtoggle").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      activeView = btn.dataset.view;
      renderGallery();
    });
  });
}

/* ───────────────────────── Modal / bottom sheet ───────────────────────── */

window.openModal = function (idx) {
  activeIndex = idx;
  const modalCont = document.getElementById("modal-container");
  const toolbar = document.getElementById("planner-toolbar");

  if (idx === 13) {
    modalCont.classList.add("planner-fullscreen");
    document.getElementById("modal-footer").classList.add("hidden");
    toolbar.classList.remove("hidden");
  } else {
    modalCont.classList.remove("planner-fullscreen");
    document.getElementById("modal-footer").classList.remove("hidden");
    toolbar.classList.add("hidden");
  }

  document.getElementById("modal").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  refreshModal();
};

window.onOverlayClick = function (e) {
  if (e.target && e.target.id === "modal") window.closeModal();
};

function refreshModal() {
  const ch = weddingData.chapters[activeIndex];
  const body = document.getElementById("modal-body");
  const addBtn = document.getElementById("add-row-btn");

  addBtn.classList.toggle("hidden", activeIndex === 6 || activeIndex === 13);

  const banner = document.getElementById("modal-banner");
  banner.style.backgroundImage = ch.image ? `url('${ch.image}')` : "";
  banner.style.backgroundColor = ch.color || "#1a1c2e";

  document.getElementById("modal-badge").innerText = ch.subtitle || "";
  document.getElementById("modal-title-input").value = ch.title || "";
  document.getElementById("modal-date-input").value = ch.period || "";

  document.getElementById("modal-title-input").onchange = (e) => {
    ch.title = e.target.value;
    pushToFirebase();
  };
  document.getElementById("modal-date-input").onchange = (e) => {
    ch.period = e.target.value;
    pushToFirebase();
  };

  if (activeIndex === 13) {
    renderPlanner(body);
    return;
  }

  if (ch.type === "list") {
    body.innerHTML = (ch.content || [])
      .map(
        (item, i) => `
          <div class="check-item group">
            <input type="checkbox" class="custom-checkbox" ${
              item.checked ? "checked" : ""
            } onchange="window.toggleCheck(${i}, this.checked)">
            <textarea rows="1" class="edit-input" oninput="window.autoResize(this)" onchange="window.saveContent(${i}, this.value)">${
          item.text || ""
        }</textarea>
            <button onclick="window.removeItem(${i})" class="opacity-0 group-hover:opacity-100 text-stone-600 hover:text-red-500 transition px-2 mt-2"><span class="material-icons-round text-sm">delete</span></button>
          </div>
        `
      )
      .join("");
  } else {
    const headers = ch.headers || [];
    const h0 = headers[0] || "Field 1";
    const h1 = headers[1] || "Field 2";
    const h2 = headers[2] || "Field 3";
    const esc = (s) => String(s || "").replace(/"/g, "&quot;");
    body.innerHTML = `
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead><tr>${headers
            .map((h) => `<th>${h}</th>`)
            .join("")}<th></th></tr></thead>
          <tbody>
            ${(ch.content || [])
              .map((row, rIdx) => {
                const rowId = activeIndex === 6 ? row[3] : null;
                const colorClass =
                  activeIndex === 6 ? getRoleColorClass(row[1]) : "";
                const deleteBtn = activeIndex !== 6
                  ? `<button onclick="window.removeItem(${rIdx})" class="row-delete" title="Delete row"><span class="material-icons-round text-sm">close</span></button>`
                  : "";
                return `
                  <tr class="row-card">
                    <td data-label="${esc(h0)}"><textarea rows="1" class="edit-input ${colorClass}" placeholder="${esc(h0)}" oninput="window.autoResize(this)" onchange="window.saveTable(${rIdx}, 0, this.value, '${rowId}')">${esc(row[0])}</textarea></td>
                    <td data-label="${esc(h1)}"><textarea rows="1" class="edit-input ${colorClass}" placeholder="${esc(h1)}" oninput="window.autoResize(this)" onchange="window.saveTable(${rIdx}, 1, this.value, '${rowId}')">${esc(row[1])}</textarea></td>
                    <td data-label="${esc(h2)}"><textarea rows="1" class="edit-input ${colorClass}" placeholder="${esc(h2)}" oninput="window.autoResize(this)" onchange="window.saveTable(${rIdx}, 2, this.value, '${rowId}')">${esc(row[2])}</textarea></td>
                    <td class="row-actions">${deleteBtn}</td>
                  </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>`;
  }
  setTimeout(
    () => document.querySelectorAll("#modal-body textarea").forEach(autoResize),
    10
  );
}

window.addRow = function () {
  const ch = weddingData.chapters[activeIndex];
  if (!ch) return;

  if (ch.type === "list") {
    if (!ch.content) ch.content = [];
    ch.content.push({ text: "", checked: false });
  } else if (ch.type === "table") {
    if (!ch.content) ch.content = [];
    const newRow = ch.headers.map(() => "-");
    ch.content.push(newRow);
  }

  pushToFirebase();
  refreshModal();

  const allEl = document.querySelectorAll(".check-item");
  const newEl = allEl[allEl.length - 1];
  if (newEl) {
    newEl.scrollIntoView({ behavior: "smooth", block: "center" });
    const ta = newEl.querySelector("textarea");
    if (ta) ta.focus();
  }
};

window.saveTable = (r, c, val, rowId) => {
  if (activeIndex === 6) {
    const fields = ["name", "role", "notes"];
    const updates = {};
    updates[`${DB_GUESTS}/${rowId}/${fields[c]}`] = val;
    update(ref(db), updates);
  } else {
    weddingData.chapters[activeIndex].content[r][c] = val;
    pushToFirebase();
  }
};

/* ───────────────────────── Boss Room Planner ───────────────────────── */

function renderPlanner(container) {
  if (!container.querySelector("#planner-canvas")) {
    container.innerHTML = `<div id="planner-canvas"><div id="planner-viewport"></div></div>`;

    const canvas = document.getElementById("planner-canvas");
    const viewport = document.getElementById("planner-viewport");

    canvas.onwheel = (e) => {
      e.preventDefault();
      const zoomSpeed = 0.05;
      const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
      scale = Math.max(0.2, Math.min(3, scale + delta));
      viewport.style.transform = `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${scale})`;
    };

    let isPanning = false;
    let startX, startY;
    let initialPinchDist = null;
    let initialScale = 0.8;

    const startPanning = (e) => {
      if (e.touches && e.touches.length === 2) {
        initialPinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialScale = scale;
        isPanning = false;
        return;
      }
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      if (e.target !== canvas && e.target !== viewport) return;
      isPanning = true;
      startX = clientX - panX;
      startY = clientY - panY;
    };

    const movePanning = (e) => {
      if (e.touches && e.touches.length === 2 && initialPinchDist !== null) {
        const currentDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const zoomFactor = currentDist / initialPinchDist;
        scale = Math.max(0.2, Math.min(3, initialScale * zoomFactor));
        viewport.style.transform = `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${scale})`;
        return;
      }
      if (!isPanning) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      panX = clientX - startX;
      panY = clientY - startY;
      viewport.style.transform = `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${scale})`;
    };

    const endPanning = () => {
      isPanning = false;
      initialPinchDist = null;
    };

    canvas.onmousedown = startPanning;
    window.addEventListener("mousemove", movePanning);
    window.addEventListener("mouseup", endPanning);
    canvas.addEventListener("touchstart", startPanning, { passive: false });
    window.addEventListener("touchmove", movePanning, { passive: false });
    window.addEventListener("touchend", endPanning);
  }

  const viewport = document.getElementById("planner-viewport");
  const layout = weddingData.chapters[13].layout || {};

  viewport.innerHTML = "";
  viewport.style.transform = `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${scale})`;

  Object.entries(layout).forEach(([id, obj]) => {
    if (obj.x <= 150 || obj.y <= 150) {
      obj.x = 2500 + (obj.x - 50) * 35;
      obj.y = 2500 + (obj.y - 50) * 35;
    }

    const isLocked = obj.locked || false;
    const el = document.createElement("div");
    el.className = `planner-object table-${obj.type} ${
      isLocked ? "is-locked" : ""
    }`;
    el.style.left = obj.x + "px";
    el.style.top = obj.y + "px";
    if (obj.w) el.style.width = obj.w + "px";
    if (obj.h) el.style.height = obj.h + "px";

    const assigned = Object.keys(obj.assigned || {}).length;
    const isLayoutOnly = ["corner", "h-line", "v-line", "text"].includes(
      obj.type
    );

    el.innerHTML = `
      <button class="delete-table-btn"><span class="material-icons-round">cancel</span></button>
      <button class="lock-btn"><span class="material-icons-round text-[14px]">${
        isLocked ? "lock" : "lock_open"
      }</span></button>
      ${
        assigned > 0 && !isLayoutOnly
          ? `<div class="seat-count">${assigned}</div>`
          : ""
      }
      ${
        obj.type !== "corner"
          ? `<div class="table-label-input uppercase pointer-events-none select-none ${
              obj.type === "text" ? "!normal-case !text-lg !font-medium" : ""
            }">${obj.label}</div>`
          : ""
      }
      <div class="resize-handle"></div>
    `;

    const lockBtn = el.querySelector(".lock-btn");
    lockBtn.onclick = (e) => {
      e.stopPropagation();
      update(ref(db), {
        [`${DB_WEDDING}/chapters/13/layout/${id}/locked`]: !isLocked,
      });
    };
    lockBtn.addEventListener("touchstart", (e) => e.stopPropagation());

    const deleteBtn = el.querySelector(".delete-table-btn");
    deleteBtn.onclick = async (e) => {
      e.stopPropagation();
      const ok = await confirmModal({
        title: "Remove this piece?",
        message: `Delete {{name}} from the floor plan?`,
        strong: obj.label || "this item",
        okLabel: "Remove",
      });
      if (ok) {
        update(ref(db), { [`${DB_WEDDING}/chapters/13/layout/${id}`]: null });
      }
    };
    deleteBtn.addEventListener("touchstart", (e) => e.stopPropagation());

    el.onclick = (e) => {
      if (el.dataset.dragging === "true" || isResizing || isLocked) return;
      if (e.target.classList.contains("resize-handle")) return;
      currentTableId = id;
      openSeatModal();
    };

    const handle = el.querySelector(".resize-handle");
    const handleResizeStart = (e) => {
      e.preventDefault();
      e.stopPropagation();
      isResizing = true;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const startW = el.offsetWidth;
      const startH = el.offsetHeight;

      const handleResizeMove = (ev) => {
        const moveX = ev.touches ? ev.touches[0].clientX : ev.clientX;
        const moveY = ev.touches ? ev.touches[0].clientY : ev.clientY;
        const dw = (moveX - clientX) / scale;
        const dh = (moveY - clientY) / scale;
        const nw = Math.max(1, startW + dw);
        const nh = Math.max(1, startH + dh);
        el.style.width = nw + "px";
        el.style.height = nh + "px";
        obj.w = Math.round(nw);
        obj.h = Math.round(nh);
      };

      const handleResizeEnd = () => {
        isResizing = false;
        update(ref(db), {
          [`${DB_WEDDING}/chapters/13/layout/${id}/w`]: obj.w,
          [`${DB_WEDDING}/chapters/13/layout/${id}/h`]: obj.h,
        });
        document.removeEventListener("mousemove", handleResizeMove);
        document.removeEventListener("mouseup", handleResizeEnd);
        document.removeEventListener("touchmove", handleResizeMove);
        document.removeEventListener("touchend", handleResizeEnd);
      };
      document.addEventListener("mousemove", handleResizeMove);
      document.addEventListener("mouseup", handleResizeEnd);
      document.addEventListener("touchmove", handleResizeMove, { passive: false });
      document.addEventListener("touchend", handleResizeEnd);
    };
    handle.onmousedown = handleResizeStart;
    handle.addEventListener("touchstart", handleResizeStart, { passive: false });

    let isDragging = false;
    const handleDragStart = (e) => {
      if (isResizing || isLocked) return;
      if (e.touches && e.touches.length > 1) return;
      if (
        e.target.closest(".delete-table-btn") ||
        e.target.closest(".lock-btn") ||
        e.target.classList.contains("resize-handle")
      )
        return;

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      e.stopPropagation();
      isDragging = true;
      isDraggingTable = true;
      el.dataset.dragging = "false";

      let shiftX = (clientX - el.getBoundingClientRect().left) / scale;
      let shiftY = (clientY - el.getBoundingClientRect().top) / scale;

      const handleDragMove = (ev) => {
        const moveX = ev.touches ? ev.touches[0].clientX : ev.clientX;
        const moveY = ev.touches ? ev.touches[0].clientY : ev.clientY;
        isDragging = true;
        el.dataset.dragging = "true";
        const rect = viewport.getBoundingClientRect();
        let nx = (moveX - rect.left) / scale - shiftX;
        let ny = (moveY - rect.top) / scale - shiftY;
        el.style.left = nx + "px";
        el.style.top = ny + "px";
        obj.x = Math.round(nx);
        obj.y = Math.round(ny);
      };

      const handleDragEnd = () => {
        isDraggingTable = false;
        if (isDragging) {
          update(ref(db), {
            [`${DB_WEDDING}/chapters/13/layout/${id}/x`]: obj.x,
            [`${DB_WEDDING}/chapters/13/layout/${id}/y`]: obj.y,
          });
        }
        document.removeEventListener("mousemove", handleDragMove);
        document.removeEventListener("mouseup", handleDragEnd);
        document.removeEventListener("touchmove", handleDragMove);
        document.removeEventListener("touchend", handleDragEnd);
      };
      document.addEventListener("mousemove", handleDragMove);
      document.addEventListener("mouseup", handleDragEnd);
      document.addEventListener("touchmove", handleDragMove, { passive: false });
      document.addEventListener("touchend", handleDragEnd);
    };

    el.onmousedown = handleDragStart;
    el.addEventListener("touchstart", handleDragStart, { passive: false });
    viewport.appendChild(el);
  });
}

window.addTable = (type) => {
  const id = "table_" + Date.now();
  let w = 100, h = 100;
  if (type === "thin-rect") { w = 200; h = 40; }
  else if (type === "thin-square") { w = 40; h = 40; }
  else if (type === "rect") { w = 200; h = 100; }
  else if (type === "vip") { w = 100; h = 220; }
  else if (type === "corner") { w = 50; h = 50; }
  else if (type === "h-line") { w = 200; h = 2; }
  else if (type === "v-line") { w = 2; h = 200; }
  else if (type === "text") { w = 250; h = 60; }

  const label = ["h-line", "v-line", "corner"].includes(type)
    ? ""
    : type === "text"
    ? "Enter Text Here"
    : type.toUpperCase();

  const newTable = {
    x: 2500 - panX / scale,
    y: 2500 - panY / scale,
    type, label, assigned: {}, w, h, locked: false,
  };
  update(ref(db), { [`${DB_WEDDING}/chapters/13/layout/${id}`]: newTable });
};

window.resetView = () => {
  panX = 0;
  panY = 0;
  scale = 0.8;
  const viewport = document.getElementById("planner-viewport");
  if (viewport) viewport.style.transform = `translate(-50%, -50%) scale(0.8)`;
  const body = document.getElementById("modal-body");
  body.innerHTML = "";
  renderPlanner(body);
};

window.importSeating = async () => {
  const layout = weddingData.chapters[13].layout || {};
  const cleanupUpdates = {};
  Object.keys(layout).forEach((id) => {
    if (id.startsWith("imported_")) {
      cleanupUpdates[`${DB_WEDDING}/chapters/13/layout/${id}`] = null;
    }
  });
  const hadBadImports = Object.keys(cleanupUpdates).length > 0;
  if (hadBadImports) {
    try {
      await update(ref(db), cleanupUpdates);
    } catch (err) {
      console.error("[import] cleanup failed", err);
      alert("Couldn't clean up old imports. Try again.");
      return;
    }
  }

  let snap;
  try {
    snap = await get(ref(db, "seatingGroups"));
  } catch (err) {
    console.error("[import] failed to read seatingGroups", err);
    alert("Couldn't read seating data. Try again.");
    return;
  }
  const data = snap.val() || {};
  const groups = Array.isArray(data.groups) ? data.groups : [];
  if (!groups.length) {
    alert(
      hadBadImports
        ? "Cleaned up the imported tables. No seating groups found in the Guest List Manager."
        : "No seating groups found in the Guest List Manager yet."
    );
    return;
  }

  const updates = {};

  const normalize = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  const tablesByName = {};
  Object.entries(layout).forEach(([id, obj]) => {
    if (id.startsWith("imported_")) return;
    if (["corner", "h-line", "v-line", "text"].includes(obj.type)) return;
    const key = normalize(obj.label);
    if (!key) return;
    if (!tablesByName[key]) tablesByName[key] = { id, obj };
  });

  const totalSeated = groups.reduce(
    (s, g) => s + ((g.memberIds || []).filter(Boolean).length),
    0
  );

  const matched = [];
  const unmatched = [];

  groups.forEach((group) => {
    const ids = (group.memberIds || []).filter(Boolean);
    if (!ids.length) return;
    const key = normalize(group.name);
    const target = tablesByName[key];
    if (!target) {
      unmatched.push(group.name || "(unnamed)");
      return;
    }
    matched.push({ group, target, ids });
  });

  const ok = await confirmModal({
    title: "Import seated guests?",
    message: `Pull {{name}} into your existing tables. The Guest List Manager itself won't change.${
      unmatched.length
        ? `\n\nCouldn't find a table with these names: ${unmatched.join(", ")}. Rename them in the planner first if you want them included.`
        : ""
    }`,
    strong: `${matched.length} of ${groups.length} groups · ${totalSeated} guests total`,
    okLabel: "Import",
    variant: "safe",
  });
  if (!ok) return;

  matched.forEach(({ target, ids }) => {
    const { id, obj } = target;
    const type = obj.type;
    const count = ids.length;
    const assigned = {};
    ids.forEach((memberId, i) => {
      let bx, by;
      if (type === "couple") {
        bx = count === 1 ? 50 : i === 0 ? 28 : 72;
        by = 50;
      } else if (type === "vip" || type === "rect" || type === "thin-rect") {
        const rightCount = Math.ceil(count / 2);
        const leftCount = count - rightCount;
        if (i < rightCount) {
          bx = 85;
          by = ((i + 1) / (rightCount + 1)) * 100;
        } else {
          const j = i - rightCount;
          bx = 15;
          by = ((leftCount - j) / (leftCount + 1)) * 100;
        }
      } else {
        const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(count, 1);
        const r = 38;
        bx = 50 + r * Math.cos(angle);
        by = 50 + r * Math.sin(angle);
      }
      assigned[memberId] = {
        x: Math.round(Math.max(5, Math.min(95, bx))),
        y: Math.round(Math.max(5, Math.min(95, by))),
      };
    });
    updates[`${DB_WEDDING}/chapters/13/layout/${id}/assigned`] = assigned;
  });

  try {
    await update(ref(db), updates);
  } catch (err) {
    console.error("[import] write failed", err);
    alert("Failed to save imported seating. Try again.");
    return;
  }

  if (unmatched.length) {
    alert(
      `Imported ${matched.length} table(s).\n\nCouldn't find a matching table for:\n• ${unmatched.join("\n• ")}\n\nRename those tables in the planner so the names match, then re-import.`
    );
  }
};

window.exportLayout = () => {
  const layout = weddingData.chapters[13].layout || {};

  const defaultSizes = {
    circle: { w: 100, h: 100 },
    square: { w: 90, h: 90 },
    rect: { w: 200, h: 100 },
    "thin-rect": { w: 200, h: 40 },
    "thin-square": { w: 40, h: 40 },
    corner: { w: 50, h: 50 },
    "h-line": { w: 200, h: 2 },
    "v-line": { w: 2, h: 200 },
    text: { w: 250, h: 60 },
    vip: { w: 100, h: 220 },
    couple: { w: 180, h: 80 },
    special: { w: 120, h: 40 },
  };

  const items = Object.entries(layout).map(([id, obj]) => {
    const def = defaultSizes[obj.type] || { w: 100, h: 100 };
    return {
      id,
      type: obj.type,
      label: obj.label || "",
      x: obj.x,
      y: obj.y,
      w: obj.w || def.w,
      h: obj.h || def.h,
      assignedCount: Object.keys(obj.assigned || {}).length,
    };
  });

  if (!items.length) {
    alert("Add some pieces to the layout first.");
    return;
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  items.forEach((it) => {
    minX = Math.min(minX, it.x);
    minY = Math.min(minY, it.y);
    maxX = Math.max(maxX, it.x + it.w);
    maxY = Math.max(maxY, it.y + it.h);
  });

  const padding = 240;
  const titleHeight = 220;
  const footerHeight = 140;
  const offX = -minX + padding;
  const offY = -minY + padding + titleHeight;
  const svgW = (maxX - minX) + padding * 2;
  const svgH = (maxY - minY) + padding * 2 + titleHeight + footerHeight;

  const c = {
    ink: "#0f1729",
    line: "#1e293b",
    soft: "#cbd5e1",
    amber: "#b45309",
    amberFill: "#fef3c7",
    paper: "#fafaf6",
  };

  const escapeXml = (s) =>
    String(s).replace(/[&<>'"]/g, (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" })[ch]
    );

  function fitLabel(text, boxW, boxH) {
    const txt = String(text || "");
    if (!txt) return null;
    const padding = Math.min(boxW, boxH) * 0.15;
    const maxW = Math.max(20, boxW - padding * 2);
    const maxH = Math.max(12, boxH - padding * 2);
    const charWFactor = 0.62;
    const maxStart = Math.min(18, Math.max(8, Math.floor(Math.min(boxW, boxH) * 0.42)));
    for (let size = maxStart; size >= 7; size -= 1) {
      const charW = size * charWFactor;
      const maxChars = Math.max(1, Math.floor(maxW / charW));
      const words = txt.split(/\s+/).filter(Boolean);
      let cur = "";
      const lines = [];
      let fits = true;
      for (const word of words) {
        if (word.length > maxChars) { fits = false; break; }
        const test = cur ? cur + " " + word : word;
        if (test.length <= maxChars) cur = test;
        else { lines.push(cur); cur = word; }
      }
      if (!fits) continue;
      if (cur) lines.push(cur);
      const lineHeight = size * 1.2;
      if (lineHeight * lines.length <= maxH) {
        return { lines, size, lineHeight };
      }
    }
    return { lines: [txt], size: 7, lineHeight: 8 };
  }

  function renderLabel(text, cxC, cyC, boxW, boxH, color, opts = {}) {
    const aspect = boxW / boxH;
    const rotated = opts.rotate !== false && aspect < 0.6;
    const layoutW = rotated ? boxH : boxW;
    const layoutH = rotated ? boxW : boxH;
    const fit = fitLabel(text, layoutW, layoutH);
    if (!fit) return "";
    const startY = -((fit.lines.length - 1) / 2) * fit.lineHeight;
    const tspans = fit.lines
      .map(
        (line, i) =>
          `<text x="0" y="${(startY + i * fit.lineHeight).toFixed(2)}" text-anchor="middle" dominant-baseline="central" font-family="${opts.family || "'Inter', sans-serif"}" font-style="${opts.style || "normal"}" font-weight="${opts.weight || 700}" font-size="${fit.size}" fill="${color}" letter-spacing="${opts.letterSpacing || "0.6"}">${escapeXml(line)}</text>`
      )
      .join("");
    const transform = rotated
      ? `translate(${cxC} ${cyC}) rotate(-90)`
      : `translate(${cxC} ${cyC})`;
    return `<g transform="${transform}">${tspans}</g>`;
  }

  function renderItem(it) {
    const cx = it.x + offX;
    const cy = it.y + offY;
    const cw = it.w;
    const ch = it.h;
    const cxC = cx + cw / 2;
    const cyC = cy + ch / 2;

    if (it.type === "corner") {
      return `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" fill="none" stroke="${c.line}" stroke-width="1.5" stroke-dasharray="6 6" rx="6"/>`;
    }
    if (it.type === "h-line") {
      return `<line x1="${cx}" y1="${cy + ch / 2}" x2="${cx + cw}" y2="${cy + ch / 2}" stroke="${c.line}" stroke-width="2"/>`;
    }
    if (it.type === "v-line") {
      return `<line x1="${cx + cw / 2}" y1="${cy}" x2="${cx + cw / 2}" y2="${cy + ch}" stroke="${c.line}" stroke-width="2"/>`;
    }
    if (it.type === "text") {
      return renderLabel(it.label, cxC, cyC, cw, ch, c.ink, {
        family: "Georgia, 'Playfair Display', serif",
        style: "italic",
        weight: 400,
        letterSpacing: "0",
        rotate: false,
      });
    }

    let fill = "#ffffff";
    let stroke = c.line;
    let strokeWidth = 2.5;
    let textColor = c.ink;

    if (it.type === "couple") {
      fill = c.amberFill;
      stroke = c.amber;
      strokeWidth = 3;
    } else if (it.type === "special") {
      fill = "#fde68a";
      stroke = c.amber;
      strokeWidth = 3;
      textColor = c.amber;
    }

    let shape;
    if (it.type === "circle") {
      const r = Math.min(cw, ch) / 2;
      shape = `<circle cx="${cxC}" cy="${cyC}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
    } else {
      const rx = it.type === "square" ? 12 : 10;
      shape = `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
    }

    const labelText = (it.label || "").toUpperCase();
    const label = renderLabel(labelText, cxC, cyC, cw, ch, textColor);

    let seatBadge = "";
    if (it.assignedCount > 0 && !["couple", "special"].includes(it.type)) {
      const bx = cx + cw - 6;
      const by = cy + 6;
      seatBadge = `<g><circle cx="${bx}" cy="${by}" r="14" fill="${c.amber}" stroke="white" stroke-width="2"/><text x="${bx}" y="${by}" text-anchor="middle" dominant-baseline="central" font-family="'Inter', sans-serif" font-weight="700" font-size="13" fill="white">${it.assignedCount}</text></g>`;
    }

    return shape + label + seatBadge;
  }

  const titleX = svgW / 2;
  const totalSeated = items.reduce((s, it) => s + it.assignedCount, 0);
  const tableCount = items.filter(
    (it) => !["corner", "h-line", "v-line", "text", "couple", "special"].includes(it.type)
  ).length;
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const innerX = padding / 2;
  const innerY = titleHeight + padding / 2;
  const innerW = svgW - padding;
  const innerH = svgH - titleHeight - footerHeight - padding;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">
  <defs>
    <pattern id="grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
      <circle cx="20" cy="20" r="1" fill="${c.soft}" opacity="0.55"/>
    </pattern>
  </defs>
  <rect width="${svgW}" height="${svgH}" fill="${c.paper}"/>
  <rect x="${innerX}" y="${innerY}" width="${innerW}" height="${innerH}" fill="url(#grid)"/>
  <rect x="${innerX}" y="${innerY}" width="${innerW}" height="${innerH}" fill="none" stroke="${c.line}" stroke-width="1.5"/>

  <text x="${titleX}" y="90" text-anchor="middle" font-family="Georgia, 'Playfair Display', serif" font-style="italic" font-size="54" fill="${c.ink}" letter-spacing="2">Reception Floor Plan</text>
  <text x="${titleX}" y="132" text-anchor="middle" font-family="'Inter', sans-serif" font-size="16" fill="${c.line}" letter-spacing="8">PETER &amp; ANGELICA · FEBRUARY 2027</text>
  <line x1="${titleX - 70}" y1="158" x2="${titleX + 70}" y2="158" stroke="${c.amber}" stroke-width="1.5"/>
  <text x="${titleX}" y="186" text-anchor="middle" font-family="'Inter', sans-serif" font-size="12" fill="${c.line}" letter-spacing="4">SEATING ARRANGEMENT &amp; STAGE LAYOUT</text>

  ${items.map(renderItem).join("\n  ")}

  <g transform="translate(${innerX + 8}, ${svgH - footerHeight + 24})">
    <text x="0" y="0" font-family="'Inter', sans-serif" font-size="12" font-weight="700" fill="${c.ink}" letter-spacing="3">LEGEND</text>
    <g transform="translate(0, 22)">
      <rect width="28" height="20" rx="4" fill="${c.amberFill}" stroke="${c.amber}" stroke-width="2"/>
      <text x="40" y="14" font-family="'Inter', sans-serif" font-size="13" fill="${c.ink}">Couple seat &amp; stage</text>
    </g>
    <g transform="translate(0, 52)">
      <rect width="28" height="20" rx="4" fill="white" stroke="${c.line}" stroke-width="2"/>
      <text x="40" y="14" font-family="'Inter', sans-serif" font-size="13" fill="${c.ink}">Guest table</text>
    </g>
    <g transform="translate(240, 22)">
      <circle cx="14" cy="10" r="12" fill="${c.amber}"/>
      <text x="14" y="11" text-anchor="middle" dominant-baseline="central" font-family="'Inter', sans-serif" font-size="11" font-weight="700" fill="white">#</text>
      <text x="34" y="14" font-family="'Inter', sans-serif" font-size="13" fill="${c.ink}">Guests seated at table</text>
    </g>
    <g transform="translate(240, 52)">
      <rect width="28" height="18" rx="4" fill="none" stroke="${c.line}" stroke-width="1.5" stroke-dasharray="5 5"/>
      <text x="40" y="14" font-family="'Inter', sans-serif" font-size="13" fill="${c.ink}">Reference marker / corner</text>
    </g>
  </g>
  <text x="${svgW - innerX - 8}" y="${svgH - footerHeight + 46}" text-anchor="end" font-family="'Inter', sans-serif" font-size="12" font-weight="700" fill="${c.ink}" letter-spacing="2">${tableCount} TABLES · ${totalSeated} GUESTS ASSIGNED</text>
  <text x="${svgW - innerX - 8}" y="${svgH - footerHeight + 68}" text-anchor="end" font-family="'Inter', sans-serif" font-size="11" fill="${c.line}" letter-spacing="2">Generated ${today.toUpperCase()}</text>
</svg>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reception Floor Plan — Peter &amp; Angelica</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Playfair+Display:ital@1&display=swap" rel="stylesheet">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{background:#e8e6df;font-family:'Inter',sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:24px 16px 80px;color:#0f1729}
  .toolbar{position:fixed;top:16px;right:16px;display:flex;gap:8px;z-index:100;flex-wrap:wrap;max-width:calc(100vw - 32px);justify-content:flex-end}
  .toolbar button{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border:none;border-radius:12px;background:#0f1729;color:#fff;font-family:'Inter',sans-serif;font-weight:600;font-size:13px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.18);transition:transform .15s,background .15s}
  .toolbar button:hover{background:#1e293b;transform:translateY(-1px)}
  .toolbar button.primary{background:#b45309}
  .toolbar button.primary:hover{background:#92400e}
  .hint{font-size:12px;color:#475569;margin-bottom:16px;letter-spacing:2px;text-transform:uppercase}
  .sheet{background:#fafaf6;box-shadow:0 24px 60px rgba(0,0,0,.18),0 4px 12px rgba(0,0,0,.08);max-width:100%;overflow:auto}
  .sheet svg{display:block;max-width:100%;height:auto}
  @media print{body{background:#fff;padding:0}.toolbar,.hint{display:none!important}.sheet{box-shadow:none}@page{margin:0;size:auto}}
</style>
</head>
<body>
  <div class="toolbar">
    <button class="primary" onclick="window.print()">Print / Save as PDF</button>
    <button onclick="downloadPng()">Download PNG</button>
    <button onclick="downloadSvg()">Download SVG</button>
  </div>
  <div class="hint">Reception Floor Plan · Print or download for suppliers</div>
  <div class="sheet" id="sheet">${svg}</div>
  <script>
    const svgEl = document.querySelector('#sheet svg');
    const svgSource = new XMLSerializer().serializeToString(svgEl);
    function downloadSvg(){
      const blob = new Blob([svgSource], {type:'image/svg+xml'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'reception-floor-plan.svg';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    }
    function downloadPng(){
      const w = svgEl.viewBox.baseVal.width;
      const h = svgEl.viewBox.baseVal.height;
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = w * scale; canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fafaf6';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = 'reception-floor-plan.png';
          document.body.appendChild(a); a.click(); a.remove();
          URL.revokeObjectURL(url);
        }, 'image/png');
      };
      const blob = new Blob([svgSource], {type:'image/svg+xml;charset=utf-8'});
      img.src = URL.createObjectURL(blob);
    }
  <\/script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) {
    alert("Please allow popups to export the layout.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
};

let hiddenToggle = false;
window.toggleAddShapes = () => {
  hiddenToggle = !hiddenToggle;
  const toolbar = document.getElementById("planner-toolbar");
  const toggleBtn = document.getElementById("toggleAddObjects");
  if (hiddenToggle) {
    toolbar.classList.add("hidden");
    toggleBtn.classList.remove("hidden");
  } else {
    toolbar.classList.remove("hidden");
    toggleBtn.classList.add("hidden");
  }
};

/* ───────────────────────── Seat assignment modal ───────────────────────── */

function openSeatModal() {
  document.getElementById("seat-modal").classList.remove("hidden");
  renderTableContext();
  renderGuestPicker();
}

function renderTableContext() {
  const container = document.getElementById("table-zoom-container");
  const namesList = document.getElementById("assigned-names-list");
  const titleEl = document.getElementById("seat-modal-title");
  const table = weddingData.chapters[13].layout[currentTableId];
  if (!table) return;

  titleEl.innerHTML = `<input type="text" class="bg-transparent border-b border-white/10 outline-none w-full focus:border-amber-500 transition-colors text-[22px] font-display italic" value="${table.label || ""}" onchange="window.renameTable(this.value)">`;

  container.innerHTML = `<div id="zoom-table" class="zoom-table-base zoom-${table.type}">${table.label || ""}</div>`;
  namesList.innerHTML = "";

  Object.entries(table.assigned || {}).forEach(([guestId, coords]) => {
    const guest = guestDataMap[guestId];
    if (!guest) return;

    const nameItem = document.createElement("div");
    nameItem.className = "flex items-center justify-between group/name";
    nameItem.innerHTML = `
      <div class="flex items-center gap-2 py-0.5">
        <span class="w-1.5 h-1.5 rounded-full bg-amber-glow"></span>
        <span class="truncate">${guest.name}</span>
      </div>
      <button onclick="window.toggleSeat('${guestId}')" class="opacity-0 group-hover/name:opacity-100 text-stone-600 hover:text-red-500 transition px-1">
        <span class="material-icons-round text-xs">close</span>
      </button>
    `;
    namesList.appendChild(nameItem);

    const bubble = document.createElement("div");
    bubble.className = "seat-bubble";
    bubble.innerText = getInitials(guest.name);
    bubble.setAttribute("data-name", guest.name);
    bubble.style.left = (coords.x || 50) + "%";
    bubble.style.top = (coords.y || 50) + "%";

    const startDrag = (e) => {
      isDraggingBubble = true;
      const move = (ev) => {
        const moveX = ev.touches ? ev.touches[0].clientX : ev.clientX;
        const moveY = ev.touches ? ev.touches[0].clientY : ev.clientY;
        const rect = container.getBoundingClientRect();
        let posX = ((moveX - rect.left) / rect.width) * 100;
        let posY = ((moveY - rect.top) / rect.height) * 100;
        posX = Math.max(5, Math.min(95, posX));
        posY = Math.max(5, Math.min(95, posY));
        bubble.style.left = posX + "%";
        bubble.style.top = posY + "%";
        table.assigned[guestId] = { x: Math.round(posX), y: Math.round(posY) };
      };
      const stop = () => {
        isDraggingBubble = false;
        update(ref(db), {
          [`${DB_WEDDING}/chapters/13/layout/${currentTableId}/assigned/${guestId}`]:
            table.assigned[guestId],
        });
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", stop);
        document.removeEventListener("touchmove", move);
        document.removeEventListener("touchend", stop);
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", stop);
      document.addEventListener("touchmove", move, { passive: false });
      document.addEventListener("touchend", stop);
    };
    bubble.onmousedown = startDrag;
    bubble.addEventListener("touchstart", startDrag, { passive: false });
    container.appendChild(bubble);
  });
}

window.renameTable = (newLabel) => {
  if (!currentTableId) return;
  update(ref(db), {
    [`${DB_WEDDING}/chapters/13/layout/${currentTableId}/label`]: newLabel,
  });
};

function getGuestTableInfo(guestId) {
  const layout = weddingData.chapters[13].layout || {};
  for (const tableId in layout) {
    if (layout[tableId].assigned && layout[tableId].assigned[guestId]) {
      return { id: tableId, label: layout[tableId].label };
    }
  }
  return null;
}

function renderGuestPicker() {
  const listEl = document.getElementById("guest-selection-list");
  const table = weddingData.chapters[13].layout[currentTableId];
  if (!table) return;
  const assignedIds = Object.keys(table.assigned || {});
  const query = (document.getElementById("guest-search").value || "").toLowerCase();

  const sorted = Object.entries(guestDataMap)
    .filter(([id, g]) => g && (g.name || "").toLowerCase().includes(query))
    .sort((a, b) => {
      const roleA = (a[1].role || "").toLowerCase().trim();
      const roleB = (b[1].role || "").toLowerCase().trim();
      const idxA = ROLE_HIERARCHY.indexOf(roleA);
      const idxB = ROLE_HIERARCHY.indexOf(roleB);
      const valA = idxA === -1 ? 99 : idxA;
      const valB = idxB === -1 ? 99 : idxB;
      if (valA !== valB) return valA - valB;
      return (a[1].name || "").localeCompare(b[1].name || "");
    });

  let currentRole = "";
  listEl.innerHTML = sorted
    .map(([id, g]) => {
      let html = "";
      const role = (g.role || "guest").toLowerCase().trim();
      if (role !== currentRole) {
        currentRole = role;
        html += `<div class="picker-role-header"><span class="w-1 h-1 rounded-full bg-stone-600"></span>${role}</div>`;
      }
      const assignment = getGuestTableInfo(id);
      const isHere = assignedIds.includes(id);
      const elsewhere = assignment && !isHere;
      html += `<div class="flex items-center justify-between bg-white/[0.035] p-3 rounded-2xl border border-white/5 ${
        elsewhere ? "opacity-50" : ""
      }">
                <div class="flex flex-col min-w-0">
                  <span class="text-xs font-bold text-stone-200 truncate">${g.name}</span>
                  <div class="flex items-center gap-2">
                    <span class="text-[8px] uppercase text-stone-500 font-black tracking-wider">${g.role || "Guest"}</span>
                    ${
                      elsewhere
                        ? `<span class="text-[7px] text-amber-glow font-bold uppercase tracking-tighter bg-amber-500/10 px-1 rounded">At ${assignment.label}</span>`
                        : ""
                    }
                  </div>
                </div>
                <button onclick="${
                  elsewhere ? "" : `window.toggleSeat('${id}')`
                }" class="w-8 h-8 rounded-full flex items-center justify-center transition shrink-0 ${
        isHere
          ? "bg-amber-glow text-stone-900"
          : elsewhere
          ? "bg-stone-800/50 text-stone-700 cursor-not-allowed"
          : "bg-stone-800 text-stone-400 hover:bg-stone-700"
      }">
                    <span class="material-icons-round text-sm">${
                      isHere ? "check" : elsewhere ? "lock" : "add"
                    }</span>
                </button>
            </div>`;
      return html;
    })
    .join("");
}

window.toggleSeat = (id) => {
  const table = weddingData.chapters[13].layout[currentTableId];
  if (!table.assigned) table.assigned = {};
  if (table.assigned[id]) delete table.assigned[id];
  else table.assigned[id] = { x: 50, y: 50 };
  update(ref(db), {
    [`${DB_WEDDING}/chapters/13/layout/${currentTableId}/assigned`]:
      table.assigned,
  });
  renderTableContext();
  renderGuestPicker();
};

window.closeSeatModal = () => {
  document.getElementById("seat-modal").classList.add("hidden");
  refreshModal();
};
window.filterGuestList = () => renderGuestPicker();
window.autoResize = autoResize;
window.toggleCheck = (i, v) => {
  weddingData.chapters[activeIndex].content[i].checked = v;
  pushToFirebase();
};
window.saveContent = (i, v) => {
  weddingData.chapters[activeIndex].content[i].text = v;
  pushToFirebase();
};
window.removeItem = async (i) => {
  const ch = weddingData.chapters[activeIndex];
  if (!ch) return;
  const row = ch.content[i];
  const label =
    ch.type === "list"
      ? (row && row.text) || "(blank)"
      : Array.isArray(row)
      ? row.filter(Boolean).slice(0, 2).join(" · ") || "(blank)"
      : "(blank)";

  const ok = await confirmModal({
    title: "Delete entry?",
    message: `This will permanently remove {{name}} from this chapter.`,
    strong: label,
    okLabel: "Delete",
  });
  if (!ok) return;

  ch.content.splice(i, 1);
  pushToFirebase();
};
window.closeModal = () => {
  document.getElementById("modal").classList.add("hidden");
  document.body.style.overflow = "";
  activeIndex = null;
  currentTableId = null;
};

function pushToFirebase() {
  setSyncSaving();
  set(ref(db, DB_WEDDING), weddingData);
}

/* ───────────────────────── Boot ───────────────────────── */

document.addEventListener("DOMContentLoaded", () => {
  wireFilters();
  renderDashboard();
  // Re-render dashboard every minute so countdown stays fresh
  setInterval(renderDashboard, 60_000);
});
initSync();
