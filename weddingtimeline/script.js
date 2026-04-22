import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  set,
  update,
  remove,
  push,
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
  authDomain: "charlie-karla-wedding.firebaseapp.com",
  databaseURL:
    "https://charlie-karla-wedding-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "charlie-karla-wedding",
  storageBucket: "charlie-karla-wedding.firebasestorage.app",
  messagingSenderId: "954582649260",
  appId: "1:954582649260:web:393fcc0fddafeb571f5209",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const storage = getStorage(app);

const WEDDING_DATE = new Date("2026-07-02T00:00:00");

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
      period: "Jan 02 - Feb 01, 2026",
      image: "assets/1.JPG",
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
      period: "Feb 02 - Mar 01, 2026",
      image: "assets/2.JPG",
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
      period: "Mar 02 - Apr 01, 2026",
      image: "assets/3.JPG",
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
      period: "Apr 02 - May 01, 2026",
      image: "assets/4.JPG",
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
      period: "May 02 - Jun 22, 2026",
      image: "assets/5.JPG",
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
      image: "assets/6.JPG",
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
      image: "assets/7.JPG",
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
      image: "assets/8.JPG",
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
      image: "assets/9.JPG",
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
      image: "assets/10.JPG",
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
      image: "assets/11.JPG",
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
      image: "assets/12.JPG",
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
      image: "assets/13.JPG",
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
      image: "assets/14.JPG",
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
      image: "assets/15.JPG",
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
  const m = periodStr.match(
    /([A-Za-z]{3,})\s+(\d{1,2})\s*-\s*([A-Za-z]{3,})\s+(\d{1,2}),\s*(\d{4})/
  );
  if (!m) return null;
  const [, m1, d1, m2, d2, y] = m;
  const start = new Date(`${m1} ${d1} ${y}`);
  const end = new Date(`${m2} ${d2} ${y} 23:59:59`);
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
  onValue(ref(db, "wedding_data"), (snapshot) => {
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
      if (migrated) set(ref(db, "wedding_data"), weddingData);
    } else {
      set(ref(db, "wedding_data"), weddingData);
    }
    setSyncOk();
    renderDashboard();
    renderGallery();
    if (activeIndex !== null) refreshModal();
  });

  onValue(ref(db, "guestList"), (snapshot) => {
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
    updates[`guestList/${rowId}/${fields[c]}`] = val;
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
        [`wedding_data/chapters/13/layout/${id}/locked`]: !isLocked,
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
        update(ref(db), { [`wedding_data/chapters/13/layout/${id}`]: null });
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
          [`wedding_data/chapters/13/layout/${id}/w`]: obj.w,
          [`wedding_data/chapters/13/layout/${id}/h`]: obj.h,
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
            [`wedding_data/chapters/13/layout/${id}/x`]: obj.x,
            [`wedding_data/chapters/13/layout/${id}/y`]: obj.y,
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
  update(ref(db), { [`wedding_data/chapters/13/layout/${id}`]: newTable });
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
          [`wedding_data/chapters/13/layout/${currentTableId}/assigned/${guestId}`]:
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
    [`wedding_data/chapters/13/layout/${currentTableId}/label`]: newLabel,
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
    [`wedding_data/chapters/13/layout/${currentTableId}/assigned`]:
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
  set(ref(db, "wedding_data"), weddingData);
}

/* ───────────────────────── Boot ───────────────────────── */

document.addEventListener("DOMContentLoaded", () => {
  wireFilters();
  renderDashboard();
  // Re-render dashboard every minute so countdown stays fresh
  setInterval(renderDashboard, 60_000);
  wireToBuyControls();
});
initSync();
initToBuySync();

/* ═══════════════════════════════════════════════════════════════
   Things to Buy — Home Wishlist Module
═══════════════════════════════════════════════════════════════ */

const CATEGORIES = [
  { id: "living",    label: "Living Room", icon: "weekend" },
  { id: "bedroom",   label: "Bedroom",     icon: "bed" },
  { id: "kitchen",   label: "Kitchen",     icon: "kitchen" },
  { id: "dining",    label: "Dining",      icon: "restaurant" },
  { id: "bathroom",  label: "Bathroom",    icon: "bathtub" },
  { id: "wardrobe",  label: "Wardrobe",    icon: "checkroom" },
  { id: "office",    label: "Office",      icon: "desk" },
  { id: "appliances",label: "Appliances",  icon: "blender" },
  { id: "aircon",    label: "Aircon / HVAC", icon: "ac_unit" },
  { id: "tools",     label: "Tools",       icon: "handyman" },
  { id: "cleaning",  label: "Cleaning",    icon: "cleaning_services" },
  { id: "decor",     label: "Decor",       icon: "local_florist" },
  { id: "tech",      label: "Tech",        icon: "router" },
  { id: "leisure",   label: "Leisure",     icon: "sports_esports" },
  { id: "laundry",   label: "Laundry",     icon: "local_laundry_service" },
  { id: "outdoor",   label: "Outdoor",     icon: "deck" },
  { id: "other",     label: "Other",       icon: "category" },
];

let toBuyData = {};                  // { itemId: { ...item } }
let toBuySearch = "";
let toBuySort = "recent";
let toBuyCatFilter = "all";
let toBuyView = "grouped";
let currentItemId = null;            // id of item being edited (null if new)
let currentItemParentId = null;      // if creating a variant
let stagedImage = { url: null, path: null }; // pending image upload result for the active form
let currentStatus = "wishlist";
let currentCategory = "other";

function formatPHP(n) {
  const v = Number(n) || 0;
  return "₱" + v.toLocaleString("en-PH", { maximumFractionDigits: 0 });
}

function getCategoryMeta(catId) {
  return CATEGORIES.find((c) => c.id === catId) || {
    id: catId || "other",
    label: (catId || "Other").replace(/(^|\s)\S/g, (m) => m.toUpperCase()),
    icon: "category",
  };
}

function initToBuySync() {
  onValue(ref(db, "wedding_data/toBuy"), (snapshot) => {
    toBuyData = snapshot.val() || {};
    renderToBuyEntry();
    const overlayOpen = !document.getElementById("tobuy-overlay").classList.contains("hidden");
    if (overlayOpen) {
      renderToBuyCats();
      renderToBuy();
    }
    // Refresh the alternatives list if the edit sheet is open
    if (!document.getElementById("item-sheet").classList.contains("hidden")) {
      renderVariantsInForm();
    }
    // Refresh quick view if open
    if (!document.getElementById("item-quickview").classList.contains("hidden") && quickViewItemId) {
      // If the current quick-view item was deleted, close it
      if (!toBuyData[quickViewItemId]) {
        window.closeQuickView();
      } else {
        renderQuickView();
      }
    }
  });
}

/* ───── Hero entry ───── */
function renderToBuyEntry() {
  const items = Object.values(toBuyData);
  const visible = items.filter((it) => !it.parentId); // only count parents
  const picked = items.filter((it) => {
    // For variants, only count if picked or no siblings. For parents without variants, count.
    if (it.parentId) return false;
    return true;
  });
  // Grand total: sum of "effective" prices — picked variant if any, else parent price
  let total = 0;
  picked.forEach((parent) => {
    const variants = items.filter((x) => x.parentId === parent.id);
    const chosen = variants.find((v) => v.status === "decided" || v.status === "bought");
    const priceSource = chosen || parent;
    const price = Number(priceSource.price) || 0;
    if (priceSource.status === "bought" || priceSource.status === "decided" || variants.length === 0) {
      total += price;
    } else {
      // wishlist — still include min price of variants or parent
      const prices = [parent, ...variants].map((x) => Number(x.price) || 0).filter((p) => p > 0);
      if (prices.length) total += Math.min(...prices);
    }
  });

  const totalEl = document.getElementById("tobuy-entry-total");
  const countEl = document.getElementById("tobuy-entry-count");
  if (totalEl) totalEl.textContent = formatPHP(total);
  if (countEl) {
    const n = visible.length;
    countEl.textContent = `${n} item${n === 1 ? "" : "s"}`;
  }
}

/* ───── Overlay open/close ───── */
window.openToBuy = function () {
  document.getElementById("tobuy-overlay").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  renderToBuyCats();
  renderToBuy();
};
window.closeToBuy = function () {
  document.getElementById("tobuy-overlay").classList.add("hidden");
  document.body.style.overflow = "";
};

/* ───── Controls ───── */
function wireToBuyControls() {
  // Status toggle in form
  document.querySelectorAll("#item-sheet .st-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#item-sheet .st-opt").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      currentStatus = btn.dataset.status;
    });
  });
}

window.onToBuySearch = (val) => {
  toBuySearch = (val || "").toLowerCase();
  renderToBuy();
};
window.onToBuySort = (val) => {
  toBuySort = val;
  renderToBuy();
};
window.onToBuyView = (val) => {
  toBuyView = val;
  document.querySelectorAll(".tobuy-view-toggle .tbv").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.view === val)
  );
  renderToBuy();
};

/* ───── Category pills ───── */
function renderToBuyCats() {
  const container = document.getElementById("tobuy-cats");
  if (!container) return;
  const items = Object.values(toBuyData).filter((x) => !x.parentId);
  const counts = {};
  items.forEach((it) => {
    const c = it.category || "other";
    counts[c] = (counts[c] || 0) + 1;
  });

  const pills = [
    { id: "all", label: "All", icon: "apps", count: items.length },
    ...CATEGORIES
      .filter((c) => counts[c.id])
      .map((c) => ({ ...c, count: counts[c.id] })),
    ...Object.keys(counts)
      .filter((c) => !CATEGORIES.find((x) => x.id === c))
      .map((c) => ({ id: c, label: getCategoryMeta(c).label, icon: "category", count: counts[c] })),
  ];

  container.innerHTML = pills
    .map(
      (p) => `
      <button class="cat-pill ${p.id === toBuyCatFilter ? "is-active" : ""}" data-cat="${p.id}" onclick="window.onCatFilter('${p.id}')">
        <span class="material-icons-round mat">${p.icon}</span>
        <span>${p.label}</span>
        <span class="cat-count">${p.count}</span>
      </button>
    `
    )
    .join("");
}
window.onCatFilter = (id) => {
  toBuyCatFilter = id;
  renderToBuyCats();
  renderToBuy();
};

/* ───── Main render ───── */
function renderToBuy() {
  const grid = document.getElementById("tobuy-grid");
  const grandEl = document.getElementById("tobuy-grand-total");
  if (!grid) return;

  const all = Object.values(toBuyData);
  const parents = all.filter((x) => !x.parentId);
  const variantsByParent = {};
  all.filter((x) => x.parentId).forEach((v) => {
    if (!variantsByParent[v.parentId]) variantsByParent[v.parentId] = [];
    variantsByParent[v.parentId].push(v);
  });

  // Filter
  let filtered = parents.filter((it) => {
    const catOK = toBuyCatFilter === "all" || (it.category || "other") === toBuyCatFilter;
    if (!catOK) return false;
    if (!toBuySearch) return true;
    const hay = [it.name, it.note, it.category, ...(variantsByParent[it.id] || []).map((v) => v.name)]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(toBuySearch);
  });

  // Sort
  filtered = filtered.slice().sort((a, b) => {
    switch (toBuySort) {
      case "name-asc": return (a.name || "").localeCompare(b.name || "");
      case "price-asc": return (Number(a.price) || 0) - (Number(b.price) || 0);
      case "price-desc": return (Number(b.price) || 0) - (Number(a.price) || 0);
      case "recent":
      default: return (b.createdAt || 0) - (a.createdAt || 0);
    }
  });

  // Grand total (respecting filter)
  let grand = 0;
  filtered.forEach((it) => {
    const variants = variantsByParent[it.id] || [];
    const chosen = variants.find((v) => v.status === "decided" || v.status === "bought");
    const source = chosen || it;
    grand += Number(source.price) || 0;
  });
  if (grandEl) grandEl.textContent = formatPHP(grand);

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="tobuy-empty">
        <span class="material-icons-round">shopping_bag</span>
        <p>No items yet. Tap <strong>Add Item</strong> to start your home wishlist.</p>
      </div>
    `;
    return;
  }

  if (toBuyView === "flat") {
    grid.innerHTML = `
      <div class="tobuy-group-items">
        ${filtered.map((it) => renderItemCard(it, variantsByParent[it.id] || [])).join("")}
      </div>
    `;
    return;
  }

  // Grouped by category
  const byCat = {};
  filtered.forEach((it) => {
    const c = it.category || "other";
    if (!byCat[c]) byCat[c] = [];
    byCat[c].push(it);
  });

  const order = [...CATEGORIES.map((c) => c.id), ...Object.keys(byCat).filter((c) => !CATEGORIES.find((x) => x.id === c))];

  grid.innerHTML = order
    .filter((c) => byCat[c])
    .map((c) => {
      const meta = getCategoryMeta(c);
      const arr = byCat[c];
      const subtotal = arr.reduce((sum, it) => {
        const variants = variantsByParent[it.id] || [];
        const chosen = variants.find((v) => v.status === "decided" || v.status === "bought");
        const source = chosen || it;
        return sum + (Number(source.price) || 0);
      }, 0);
      return `
        <div class="tobuy-group">
          <div class="tobuy-group-head">
            <span class="tobuy-group-title">
              <span class="material-icons-round mat">${meta.icon}</span>${meta.label}
            </span>
            <span class="tobuy-group-meta">
              <span>${arr.length} item${arr.length === 1 ? "" : "s"}</span>
              <span class="tobuy-group-total">${formatPHP(subtotal)}</span>
            </span>
          </div>
          <div class="tobuy-group-items">
            ${arr.map((it) => renderItemCard(it, variantsByParent[it.id] || [])).join("")}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderItemCard(item, variants) {
  const chosen = variants.find((v) => v.status === "decided" || v.status === "bought");
  const display = chosen || item;
  const imgURL = display.imageURL || item.imageURL;
  const status = display.status || item.status || "wishlist";
  const statusLabel = { wishlist: "Wishlist", decided: "Decided", bought: "Bought" }[status] || "Wishlist";
  const name = display.name || item.name || "(unnamed)";

  const thumbOpen = imgURL
    ? `<div class="item-thumb" style="background-image: url('${imgURL}')">`
    : `<div class="item-thumb placeholder">`;

  const variantBadge = variants.length
    ? `<span class="item-variants"><span class="material-icons-round">layers</span>${variants.length + 1}</span>`
    : "";

  const variantChips = variants.length
    ? `<div class="item-variants-row">${variants
        .slice(0, 4)
        .map((v) => {
          const t = `${(v.name || "(unnamed)").replace(/"/g, "&quot;")} · ${formatPHP(v.price)}`;
          const bg = v.imageURL ? `style="background-image: url('${v.imageURL}')"` : "";
          return `<div class="variant-chip" ${bg} title="${t}" onclick="event.stopPropagation(); window.openQuickView('${v.id}')"></div>`;
        })
        .join("")}${
        variants.length > 4
          ? `<div class="variant-chip variant-more" onclick="event.stopPropagation(); window.openQuickView('${item.id}')">+${variants.length - 4}</div>`
          : ""
      }</div>`
    : "";

  const link = display.link || item.link;
  const linkChip = link
    ? `<a href="${link}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()"><span class="material-icons-round">open_in_new</span>Link</a>`
    : "";
  const noteFlag = (display.note || item.note)
    ? `<span class="item-note-flag"><span class="material-icons-round text-[13px] align-middle">sticky_note_2</span></span>`
    : "";

  return `
    <div class="item-card" onclick="window.openQuickView('${item.id}')">
      ${thumbOpen}
        <span class="item-status is-${status}">${statusLabel}</span>
        ${variantBadge}
      </div>
      <div class="item-body">
        <div class="item-name" title="${name.replace(/"/g, "&quot;")}">${name}</div>
        <div class="item-price">${formatPHP(display.price || item.price)}</div>
        <div class="item-meta">${linkChip}${noteFlag}</div>
        ${variantChips}
      </div>
    </div>
  `;
}

/* ───── Quick view (read-only) ───── */
let quickViewItemId = null;

window.openQuickView = function (id) {
  const item = toBuyData[id];
  if (!item) return;
  quickViewItemId = id;
  document.getElementById("item-quickview").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  renderQuickView();
};

window.closeQuickView = function () {
  document.getElementById("item-quickview").classList.add("hidden");
  quickViewItemId = null;
  const toBuyOpen = !document.getElementById("tobuy-overlay").classList.contains("hidden");
  const editOpen = !document.getElementById("item-sheet").classList.contains("hidden");
  if (!toBuyOpen && !editOpen) document.body.style.overflow = "";
};

window.onQuickViewBackdrop = (e) => {
  if (e.target && e.target.id === "item-quickview") window.closeQuickView();
};

function renderQuickView() {
  const item = toBuyData[quickViewItemId];
  if (!item) return;

  // If the item is a variant, the displayed "group" centers on its parent's image fallback
  const variants = Object.values(toBuyData).filter((x) => x.parentId === (item.parentId || item.id) && x.id !== (item.parentId || item.id));
  // ^ variants of the same group
  const parentId = item.parentId || item.id;
  const parent = toBuyData[parentId];
  const siblings = Object.values(toBuyData).filter((x) => x.parentId === parentId);
  const group = parent ? [parent, ...siblings] : [item];

  const heroImg = document.getElementById("qv-hero-img");
  const heroBg = document.getElementById("qv-hero-bg");
  const imgURL = item.imageURL || (parent && parent.imageURL) || "";
  if (imgURL) {
    heroImg.style.backgroundImage = `url('${imgURL}')`;
    heroImg.classList.remove("placeholder");
    if (heroBg) {
      heroBg.style.backgroundImage = `url('${imgURL}')`;
      heroBg.classList.add("is-visible");
    }
  } else {
    heroImg.style.backgroundImage = "";
    heroImg.classList.add("placeholder");
    if (heroBg) {
      heroBg.style.backgroundImage = "";
      heroBg.classList.remove("is-visible");
    }
  }

  const statusEl = document.getElementById("qv-status");
  const status = item.status || "wishlist";
  const statusLabel = { wishlist: "Wishlist", decided: "Decided", bought: "Bought" }[status] || "Wishlist";
  statusEl.textContent = statusLabel;
  statusEl.className = `qv-status-chip is-${status}`;

  const variantsChip = document.getElementById("qv-variants-chip");
  if (group.length > 1) {
    variantsChip.classList.remove("hidden");
    document.getElementById("qv-variants-count").textContent = String(group.length);
  } else {
    variantsChip.classList.add("hidden");
  }

  document.getElementById("qv-title").textContent = item.name || "(unnamed)";
  document.getElementById("qv-price").textContent = formatPHP(item.price);

  const meta = getCategoryMeta(item.category || "other");
  const metaRow = document.getElementById("qv-meta-row");
  const isVariant = !!item.parentId;
  metaRow.innerHTML = `
    <span class="qv-cat-chip">
      <span class="material-icons-round">${meta.icon}</span>${meta.label}
    </span>
    ${isVariant ? `<span class="qv-cat-chip qv-alt-chip"><span class="material-icons-round">layers</span>Alternative</span>` : ""}
    ${isVariant ? `<button class="qv-make-primary" onclick="window.makePrimary()"><span class="material-icons-round">star</span>Make Primary</button>` : ""}
    ${item.link ? `<a class="qv-link-btn" href="${item.link}" target="_blank" rel="noopener noreferrer"><span class="material-icons-round">open_in_new</span>Open Link</a>` : ""}
  `;

  const noteWrap = document.getElementById("qv-note-wrap");
  if (item.note) {
    noteWrap.classList.remove("hidden");
    document.getElementById("qv-note").textContent = item.note;
  } else {
    noteWrap.classList.add("hidden");
  }

  const varSection = document.getElementById("qv-variants-section");
  const varList = document.getElementById("qv-variants-list");
  if (group.length > 1) {
    varSection.classList.remove("hidden");
    const lowest = Math.min(...group.map((r) => Number(r.price) || Infinity));
    varList.innerHTML = group
      .map((r) => renderVariantRow(r, parentId, r.id === item.id, lowest, group.length, "qv"))
      .join("");
  } else {
    varSection.classList.add("hidden");
  }
}

window.quickViewEdit = function () {
  if (!quickViewItemId) return;
  window.openAddItem(quickViewItemId);
};

window.makePrimary = async function () {
  if (!quickViewItemId) return;
  const current = toBuyData[quickViewItemId];
  if (!current || !current.parentId) return;
  const oldParentId = current.parentId;

  const updates = {};
  // Current becomes primary
  updates[`wedding_data/toBuy/${current.id}/parentId`] = null;
  // Old primary becomes a variant of the new primary
  updates[`wedding_data/toBuy/${oldParentId}/parentId`] = current.id;
  // Any sibling variants move under the new primary
  Object.values(toBuyData).forEach((it) => {
    if (it && it.parentId === oldParentId && it.id !== current.id) {
      updates[`wedding_data/toBuy/${it.id}/parentId`] = current.id;
    }
  });
  await update(ref(db), updates);
  // The quick view will re-render via onValue; no manual refresh needed
};

window.quickViewAddAlternative = function () {
  if (!quickViewItemId) return;
  const item = toBuyData[quickViewItemId];
  if (!item) return;
  const parent = item.parentId || item.id;
  window.openAddItem(null, parent);
};

window.quickViewDelete = async function () {
  if (!quickViewItemId) return;
  const item = toBuyData[quickViewItemId];
  if (!item) return;

  const subVariants = Object.values(toBuyData).filter((x) => x.parentId === quickViewItemId);
  const extra = subVariants.length
    ? ` This will also delete ${subVariants.length} alternative${subVariants.length === 1 ? "" : "s"}.`
    : "";
  const ok = await confirmModal({
    title: "Delete this item?",
    message: `{{name}} will be permanently removed.${extra}`,
    strong: item.name || "(unnamed)",
    okLabel: "Delete",
  });
  if (!ok) return;

  // Delete Storage images first — await so we actually know if they succeeded
  const toDelete = [item, ...subVariants];
  await Promise.all(
    toDelete
      .filter((it) => it && it.imagePath)
      .map((it) => deleteStorageFile(it.imagePath, `delete item ${it.id}`))
  );
  // Then remove DB rows
  await remove(ref(db, `wedding_data/toBuy/${quickViewItemId}`));
  for (const v of subVariants) {
    await remove(ref(db, `wedding_data/toBuy/${v.id}`));
  }
  window.closeQuickView();
};

/* ───── Add / Edit item ───── */
window.openAddItem = function (existingId = null, parentId = null) {
  currentItemId = existingId;
  currentItemParentId = parentId;
  stagedImage = { url: null, path: null };
  const sheet = document.getElementById("item-sheet");
  const title = document.getElementById("item-sheet-title");
  const deleteBtn = document.getElementById("item-delete-btn");
  const parentHint = document.getElementById("item-parent-hint");

  sheet.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  renderCatPicker();

  // Hydrate form
  const item = existingId ? toBuyData[existingId] : null;
  const effectiveParent = parentId || (item && item.parentId) || null;

  const addVariantBtn = document.getElementById("item-addvariant-btn");
  if (existingId && item) {
    title.textContent = item.parentId ? "Edit Alternative" : "Edit Item";
    deleteBtn.classList.remove("hidden");
    if (addVariantBtn) addVariantBtn.classList.remove("hidden");
    document.getElementById("item-name").value = item.name || "";
    document.getElementById("item-price").value = item.price ? String(item.price) : "";
    document.getElementById("item-link").value = item.link || "";
    document.getElementById("item-note").value = item.note || "";
    currentStatus = item.status || "wishlist";
    currentCategory = item.category || "other";
    document.getElementById("item-cat-custom").value = CATEGORIES.find((c) => c.id === currentCategory) ? "" : (item.category || "");
    stagedImage = { url: item.imageURL || null, path: item.imagePath || null };
  } else {
    title.textContent = parentId ? "Add Alternative" : "Add Item";
    deleteBtn.classList.add("hidden");
    if (addVariantBtn) addVariantBtn.classList.add("hidden");
    document.getElementById("item-name").value = "";
    document.getElementById("item-price").value = "";
    document.getElementById("item-link").value = "";
    document.getElementById("item-note").value = "";
    currentStatus = "wishlist";
    currentCategory = parentId && toBuyData[parentId] ? (toBuyData[parentId].category || "other") : "other";
    document.getElementById("item-cat-custom").value = "";
  }

  // Status pills
  document.querySelectorAll("#item-sheet .st-opt").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.status === currentStatus)
  );

  // Parent hint
  if (effectiveParent && toBuyData[effectiveParent]) {
    parentHint.classList.remove("hidden");
    document.getElementById("item-parent-name").textContent = toBuyData[effectiveParent].name || "(unnamed)";
  } else {
    parentHint.classList.add("hidden");
  }

  // Image preview
  syncImagePreview();

  // Alternatives list
  renderVariantsInForm();
};

function renderVariantsInForm() {
  const section = document.getElementById("item-variants-section");
  const list = document.getElementById("item-variants-list");
  if (!section || !list) return;

  const item = currentItemId ? toBuyData[currentItemId] : null;
  if (!item) { section.classList.add("hidden"); return; }

  const parentId = item.parentId || item.id;
  const parent = toBuyData[parentId];
  if (!parent) { section.classList.add("hidden"); return; }

  const variants = Object.values(toBuyData).filter((x) => x.parentId === parentId);
  if (!variants.length) { section.classList.add("hidden"); return; }

  section.classList.remove("hidden");
  const rows = [parent, ...variants];
  const lowest = Math.min(...rows.map((r) => Number(r.price) || Infinity));

  list.innerHTML = rows.map((r) => renderVariantRow(r, parentId, r.id === currentItemId, lowest, rows.length, "edit")).join("");
}

function renderVariantRow(r, parentId, isCurrent, lowest, totalCount, mode /* "edit" | "qv" */) {
  const isPrimary = r.id === parentId;
  const thumb = r.imageURL
    ? `<div class="variant-row-thumb" style="background-image: url('${r.imageURL}')"></div>`
    : `<div class="variant-row-thumb"><span class="material-icons-round text-[18px]">image</span></div>`;
  const status = r.status || "wishlist";
  const statusBadge = status === "decided"
    ? `<span class="badge is-decided"><span class="material-icons-round">check_circle</span>Decided</span>`
    : status === "bought"
    ? `<span class="badge is-bought"><span class="material-icons-round">shopping_cart_checkout</span>Bought</span>`
    : "";
  const priceVal = Number(r.price) || 0;
  const cheapestTag = priceVal > 0 && priceVal === lowest && totalCount > 1
    ? `<span class="badge is-cheapest"><span class="material-icons-round">savings</span>Cheapest</span>` : "";
  const primaryBadge = isPrimary
    ? `<span class="badge is-parent"><span class="material-icons-round">star</span>Primary</span>`
    : "";
  const rightIcon = isCurrent
    ? `<span class="variant-row-current-mark"><span class="material-icons-round">visibility</span></span>`
    : `<span class="material-icons-round variant-row-arrow">chevron_right</span>`;

  const onClick = isCurrent
    ? ""
    : mode === "qv"
    ? `onclick="window.openQuickView('${r.id}')"`
    : `onclick="window.openAddItem('${r.id}')"`;

  return `
    <div class="variant-row ${isCurrent ? "is-current" : ""}" ${onClick}>
      ${thumb}
      <div class="variant-row-info">
        <div class="variant-row-name">${r.name || "(unnamed)"}</div>
        <div class="variant-row-sub">
          <span class="price">${formatPHP(r.price)}</span>
          ${primaryBadge}
          ${statusBadge}
          ${cheapestTag}
        </div>
      </div>
      ${rightIcon}
    </div>
  `;
}

function renderCatPicker() {
  const host = document.getElementById("item-cat-grid");
  if (!host) return;
  host.innerHTML = CATEGORIES.map(
    (c) => `
      <button type="button" class="cat-opt ${c.id === currentCategory ? "is-active" : ""}" data-cat="${c.id}" onclick="window.pickCategory('${c.id}')">
        <span class="material-icons-round">${c.icon}</span>
        <span>${c.label}</span>
      </button>
    `
  ).join("");
}
window.pickCategory = (id) => {
  currentCategory = id;
  document.getElementById("item-cat-custom").value = "";
  renderCatPicker();
};

window.onItemOverlayClick = (e) => {
  if (e.target && e.target.id === "item-sheet") window.closeAddItem();
};

window.closeAddItem = function () {
  document.getElementById("item-sheet").classList.add("hidden");
  // If ToBuy overlay or quick view is still open, keep body locked
  const toBuyOpen = !document.getElementById("tobuy-overlay").classList.contains("hidden");
  const qvOpen = !document.getElementById("item-quickview").classList.contains("hidden");
  if (!toBuyOpen && !qvOpen) document.body.style.overflow = "";
  currentItemId = null;
  currentItemParentId = null;
  stagedImage = { url: null, path: null };
};

window.saveCurrentItem = async function () {
  const name = document.getElementById("item-name").value.trim();
  const priceRaw = document.getElementById("item-price").value.trim();
  const link = document.getElementById("item-link").value.trim();
  const note = document.getElementById("item-note").value.trim();
  const customCat = document.getElementById("item-cat-custom").value.trim();

  if (!name) {
    alert("Please enter a name.");
    return;
  }
  const price = priceRaw ? Number(priceRaw) : 0;
  const category = customCat ? customCat.toLowerCase().replace(/\s+/g, "-") : currentCategory;

  // Determine parent: prefer explicit parentId passed when opening, else preserve existing item.parentId
  const parentId = currentItemParentId ||
    (currentItemId && toBuyData[currentItemId] ? (toBuyData[currentItemId].parentId || null) : null);

  const base = {
    name,
    price,
    link: link || null,
    note: note || null,
    category,
    status: currentStatus,
    parentId: parentId || null,
    imageURL: stagedImage.url || null,
    imagePath: stagedImage.path || null,
  };

  if (currentItemId) {
    // Edit
    const prev = toBuyData[currentItemId] || {};
    // If image was replaced or cleared, delete old storage object
    if (prev.imagePath && prev.imagePath !== stagedImage.path) {
      await deleteStorageFile(prev.imagePath, `replaced on save of item ${currentItemId}`);
    }
    await set(ref(db, `wedding_data/toBuy/${currentItemId}`), {
      ...prev,
      ...base,
      id: currentItemId,
      createdAt: prev.createdAt || Date.now(),
      updatedAt: Date.now(),
    });
  } else {
    // New
    const newRef = push(ref(db, "wedding_data/toBuy"));
    const id = newRef.key;
    await set(newRef, {
      ...base,
      id,
      createdAt: Date.now(),
    });
  }
  window.closeAddItem();
};

window.addVariantToCurrent = function () {
  if (!currentItemId) return;
  const item = toBuyData[currentItemId];
  if (!item) return;
  // If current item is itself a variant, the new variant belongs to the same parent
  const parent = item.parentId || currentItemId;
  window.openAddItem(null, parent);
};

window.deleteCurrentItem = async function () {
  if (!currentItemId) return;
  const item = toBuyData[currentItemId];
  if (!item) return;
  const variants = Object.values(toBuyData).filter((x) => x.parentId === currentItemId);
  const extra = variants.length
    ? ` This will also delete ${variants.length} alternative${variants.length === 1 ? "" : "s"}.`
    : "";
  const ok = await confirmModal({
    title: "Delete this item?",
    message: `{{name}} will be permanently removed.${extra}`,
    strong: item.name || "(unnamed)",
    okLabel: "Delete",
  });
  if (!ok) return;

  // Delete image(s)
  const toDelete = [item, ...variants];
  toDelete.forEach((it) => {
    if (it.imagePath) deleteObject(storageRef(storage, it.imagePath)).catch(() => {});
  });
  // Delete data
  await remove(ref(db, `wedding_data/toBuy/${currentItemId}`));
  for (const v of variants) {
    await remove(ref(db, `wedding_data/toBuy/${v.id}`));
  }
  window.closeAddItem();
};

/* ───── Image upload + compression ───── */
function compressImage(file, maxDim = 1400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))),
          "image/jpeg",
          quality
        );
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function setUploadProgress(stage) {
  const stepEl = document.getElementById("item-image-step");
  const labelEl = document.getElementById("item-image-progress-text");
  const ring = document.getElementById("item-image-ring");
  const labels = {
    compressing: { label: "Preparing your photo", step: "Compressing" },
    uploading: { label: "Saving to cloud", step: "Uploading" },
    finalizing: { label: "Almost done", step: "Finalizing" },
  };
  const l = labels[stage] || labels.compressing;
  if (stepEl) stepEl.textContent = l.step;
  if (labelEl) labelEl.textContent = l.label;
  if (ring) ring.classList.add("is-indeterminate");
}

function preloadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

window.onItemImagePick = async function (e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;

  const drop = document.getElementById("image-drop");
  const progress = document.getElementById("item-image-progress");
  const placeholder = document.getElementById("item-image-placeholder");
  const preview = document.getElementById("item-image-preview");
  const clearBtn = document.getElementById("item-image-clear");

  // Start: show shimmer overlay, fade placeholder out, keep current preview until new one loads
  drop.classList.add("is-loading");
  progress.classList.remove("hidden");
  placeholder.classList.add("hidden");
  clearBtn.classList.add("hidden");
  setUploadProgress("compressing");

  try {
    // 1. Compress
    const blob = await compressImage(file);

    // 2. Clean up previous staged upload if we're replacing it (and it wasn't saved to an item yet)
    const prevPath = stagedImage.path;
    const existingItem = currentItemId ? toBuyData[currentItemId] : null;
    if (prevPath && (!existingItem || existingItem.imagePath !== prevPath)) {
      await deleteStorageFile(prevPath, "replaced staged upload");
    }

    // 3. Upload
    setUploadProgress("uploading");
    const filename = `wedding/tobuy/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const sRef = storageRef(storage, filename);
    await uploadBytes(sRef, blob, { contentType: "image/jpeg" });
    const url = await getDownloadURL(sRef);

    // 4. Preload the final URL so the swap is flicker-free
    setUploadProgress("finalizing");
    await preloadImage(url);

    stagedImage = { url, path: filename };

    // Swap the preview BEFORE hiding the shimmer, so the image is already painted
    preview.src = url;
    preview.classList.remove("hidden");
    // Small delay lets the layout settle, then crossfade
    requestAnimationFrame(() => {
      preview.classList.add("is-visible");
      clearBtn.classList.remove("hidden");
      // Fade out progress after the image is visible
      setTimeout(() => {
        progress.classList.add("hidden");
        drop.classList.remove("is-loading");
      }, 180);
    });
  } catch (err) {
    console.error("[tobuy upload]", err);
    alert("Couldn't upload that image. Try again?");
    progress.classList.add("hidden");
    drop.classList.remove("is-loading");
    syncImagePreview();
  }
};

/**
 * Delete a Storage object with explicit error logging. Returns true if deleted (or already absent),
 * false on persistent failure. Safe to call with empty path — no-op.
 */
async function deleteStorageFile(path, reason = "cleanup") {
  if (!path) return true;
  try {
    await deleteObject(storageRef(storage, path));
    console.log(`[tobuy storage] deleted ${path} (${reason})`);
    return true;
  } catch (err) {
    // object-not-found is fine (already gone)
    if (err && (err.code === "storage/object-not-found" || (err.message || "").includes("not found"))) {
      return true;
    }
    console.warn(`[tobuy storage] failed to delete ${path} (${reason}):`, err);
    return false;
  }
}

window.clearItemImage = async function () {
  // If the staged image isn't the one that's already persisted to this item, we can
  // safely delete it from Storage now. Otherwise leave it; cleanup happens on save/delete.
  if (stagedImage.path) {
    const existing = currentItemId ? toBuyData[currentItemId] : null;
    if (!existing || existing.imagePath !== stagedImage.path) {
      await deleteStorageFile(stagedImage.path, "clearItemImage (unsaved staged)");
    }
  }
  stagedImage = { url: null, path: null };
  syncImagePreview();
};

function syncImagePreview() {
  const placeholder = document.getElementById("item-image-placeholder");
  const preview = document.getElementById("item-image-preview");
  const clearBtn = document.getElementById("item-image-clear");
  if (stagedImage.url) {
    preview.src = stagedImage.url;
    preview.classList.remove("hidden");
    placeholder.classList.add("hidden");
    clearBtn.classList.remove("hidden");
  } else {
    preview.classList.add("hidden");
    placeholder.classList.remove("hidden");
    clearBtn.classList.add("hidden");
  }
}
