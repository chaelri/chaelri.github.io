// chaelri.github.io/work/app.js
// Phase 1: Firebase Auth gate (Google Sign-in, locked to charliecayno@gmail.com)
//          + render dashboard from sample data baked into this file.
// Phase 2 (next): replace SAMPLE_DATA reads with Firebase RTDB at /work-brief/{uid}/{date}.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
// import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";
//   ↑ uncomment in Phase 2 when we wire the live data path

// ---------- Firebase config (shared with rest of chaelri.github.io) ----------
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

const ALLOWED_EMAIL = "charliecayno@gmail.com";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// const db = getDatabase(app);

// ---------- Sample data (Phase 1 placeholder — replaced by RTDB read in Phase 2) ----------
const SAMPLE_DATA = {
  generatedAt: "2026-05-03T08:50:15+08:00",
  date: "2026-05-03",
  topOfMind: [
    "PR #1280 stale 10d — no reviewer approvals, oldest open PR",
    "CRUX-1998 On-Hold — Marsh cert wordings ordering, needs unblock decision",
    "3 Referred quotes in CruxQA (TE…3904/3905/3906) — review backlog",
  ],
  jira: {
    assigned: [
      {
        key: "CRUX-1998",
        type: "Story",
        status: "On-Hold",
        priority: "Low",
        summary: "Marsh cert: custom wordings appear after core cert",
        url: "https://azurtechnology.atlassian.net/browse/CRUX-1998",
      },
      {
        key: "CRUX-1995",
        type: "Story",
        status: "To Do",
        priority: "Low",
        summary: "GC Certificate: update reinsurance certificate template",
        url: "https://azurtechnology.atlassian.net/browse/CRUX-1995",
      },
      {
        key: "CRUX-2032",
        type: "Story",
        status: "To Do",
        priority: "Low",
        summary: "Generate revised GC certificate template on bind for QuoteBox API user",
        url: "https://azurtechnology.atlassian.net/browse/CRUX-2032",
      },
    ],
    recent24h: [],
  },
  bitbucket: {
    mine: [
      {
        id: 1280,
        title: "CRUX-1939: Map '9987 - ROW ex UK - Core Market' binder name to ROW ex UK (CRX9987) picklist",
        url: "https://bitbucket.org/truffengers/crux-underwriting/pull-requests/1280",
        ageDays: 10,
        reviewers: ["Curt", "Rayson"],
        approvals: 0,
      },
      {
        id: 1286,
        title: "CRUX-2031: Add DnB option to Cedant Code Type picklist",
        url: "https://bitbucket.org/truffengers/crux-underwriting/pull-requests/1286",
        ageDays: 6,
        reviewers: ["Curt", "Rayson"],
        approvals: 0,
      },
      {
        id: 1287,
        title: "CRUX-2036: Non-Standard Form S&T wrap referral rule (broker-agnostic)",
        url: "https://bitbucket.org/truffengers/crux-underwriting/pull-requests/1287",
        ageDays: 6,
        reviewers: ["Curt", "Rayson"],
        approvals: 0,
      },
      {
        id: 1288,
        title: "CRUX-2033: Map QuoteBox policyFormType/wordingsApplicable to Crux fields",
        url: "https://bitbucket.org/truffengers/crux-underwriting/pull-requests/1288",
        ageDays: 5,
        reviewers: ["Curt", "Rayson"],
        approvals: 0,
      },
    ],
    reviewing: [],
  },
  salesforce: {
    DEV: { cases: [], quotes: [] },
    CruxQA: {
      cases: [],
      quotes: [
        { name: "TE2600003908", status: "Draft", modified: "2026-04-29", type: "NB Quote" },
        { name: "TE2600003907", status: "Draft", modified: "2026-04-29", type: "NB Quote" },
        { name: "TE2600003906", status: "Referred", modified: "2026-04-29", type: "NB Quote" },
        { name: "TE2600003905", status: "Referred", modified: "2026-04-29", type: "NB Quote" },
        { name: "TE2600003904", status: "Referred", modified: "2026-04-29", type: "NB Quote" },
        { name: "TE2600003879", status: "Quoted", modified: "2026-04-28", type: "NB Quote" },
      ],
    },
  },
  notes: [
    "All 4 open PRs assigned to Curt + Rayson, zero approvals — chase reviewers",
    "GC Certificate work (CRUX-1995/2032) both To Do — sequencing question",
  ],
};

// ---------- DOM helpers ----------
const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slug = (s) => String(s).toLowerCase().replace(/\s+/g, "-");

function show(id) { $(id)?.classList.remove("hidden"); }
function hide(id) { $(id)?.classList.add("hidden"); }

// ---------- Render: header ----------
function renderHeader(data) {
  const d = new Date(data.date + "T00:00:00");
  const niceDate = d.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  $("hdrDate").textContent = niceDate;

  const gen = data.generatedAt ? new Date(data.generatedAt) : null;
  if (gen) {
    const rel = relativeTime(gen);
    const time = gen.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    $("hdrUpdated").textContent = `Updated ${rel} · ${time}`;
    $("footerStatus").textContent = `Generated at ${gen.toLocaleString("en-US")}`;
  } else {
    $("hdrUpdated").textContent = "No timestamp on this brief";
  }
}

function relativeTime(date) {
  const diffMs = Date.now() - date.getTime();
  const m = Math.round(diffMs / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

// ---------- Render: top of mind ----------
function renderTopOfMind(items) {
  const mount = $("topOfMind");
  if (!items || items.length === 0) {
    mount.innerHTML = `<div class="empty">Nothing flagged today.</div>`;
    return;
  }
  mount.innerHTML = items.map((t) => `
    <div class="tom-row fade-in">
      <span class="material-symbols-outlined">arrow_right</span>
      <span>${escapeHtml(t)}</span>
    </div>
  `).join("");
}

// ---------- Render: jira ----------
function statusKey(s) {
  const v = String(s || "").toLowerCase();
  if (v.includes("hold")) return "on-hold";
  if (v.includes("progress")) return "in-progress";
  if (v.includes("review")) return "in-review";
  if (v.includes("done") || v === "closed" || v === "resolved") return "done";
  if (v === "to do" || v === "open" || v === "backlog") return "todo";
  return "default";
}
function priorityKey(p) {
  return String(p || "").toLowerCase();
}

function renderJira(jira) {
  const list = jira?.assigned || [];
  const recent = jira?.recent24h || [];
  $("jiraCount").textContent = list.length ? `${list.length} active` : "";

  const mount = $("jiraList");
  if (list.length === 0) {
    mount.innerHTML = `<div class="empty">No assigned issues.</div>`;
  } else {
    mount.innerHTML = list.map((it) => `
      <a href="${escapeHtml(it.url || "#")}" target="_blank" rel="noopener" class="card block px-4 py-3 group fade-in">
        <div class="flex items-start gap-3">
          <span class="priority-dot mt-2" data-priority="${priorityKey(it.priority)}" title="${escapeHtml(it.priority || "")}"></span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center flex-wrap gap-2 mb-1">
              <span class="font-mono text-[11px] tracking-tight text-pink-300 font-semibold">${escapeHtml(it.key)}</span>
              <span class="status-pill" data-status="${statusKey(it.status)}">${escapeHtml(it.status || "?")}</span>
              ${it.type ? `<span class="text-[10.5px] uppercase tracking-wider text-zinc-500">${escapeHtml(it.type)}</span>` : ""}
            </div>
            <div class="text-sm text-zinc-200 leading-snug group-hover:text-white">${escapeHtml(it.summary || "")}</div>
          </div>
          <span class="material-symbols-outlined text-zinc-600 text-[18px] mt-1 group-hover:text-pink-400 transition">open_in_new</span>
        </div>
      </a>
    `).join("");
  }

  // Recent
  if (recent.length) {
    show("jiraRecentWrap");
    $("jiraRecent").innerHTML = recent.map((it) => `
      <a href="${escapeHtml(it.url || "#")}" target="_blank" rel="noopener" class="card block px-3.5 py-2.5">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-mono text-[11px] text-pink-300 font-semibold">${escapeHtml(it.key)}</span>
          <span class="status-pill" data-status="${statusKey(it.status)}">${escapeHtml(it.status || "?")}</span>
          <span class="text-xs text-zinc-300 truncate flex-1">${escapeHtml(it.summary || "")}</span>
        </div>
      </a>
    `).join("");
  } else {
    hide("jiraRecentWrap");
  }
}

// ---------- Render: bitbucket ----------
function avatarFor(name) {
  const initials = String(name || "?").trim().split(/\s+/).map(s => s[0]).join("").slice(0, 2).toUpperCase();
  // deterministic color from name
  const colors = [
    "linear-gradient(135deg,#6366f1,#3b82f6)",
    "linear-gradient(135deg,#10b981,#059669)",
    "linear-gradient(135deg,#f59e0b,#d97706)",
    "linear-gradient(135deg,#ec4899,#be185d)",
    "linear-gradient(135deg,#a855f7,#7c3aed)",
    "linear-gradient(135deg,#06b6d4,#0891b2)",
  ];
  let hash = 0;
  for (const ch of String(name || "")) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const bg = colors[hash % colors.length];
  return `<span class="avatar" style="background:${bg}" title="${escapeHtml(name)}">${escapeHtml(initials)}</span>`;
}

function prCardHtml(pr) {
  const stale = pr.ageDays >= 7;
  const reviewers = (pr.reviewers || []).map(avatarFor).join("");
  const approvalsBadge = pr.approvals > 0
    ? `<span class="text-[11px] font-medium text-emerald-400 inline-flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">check_circle</span>${pr.approvals} approval${pr.approvals === 1 ? "" : "s"}</span>`
    : `<span class="text-[11px] text-zinc-500 inline-flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">pending</span>0 approvals</span>`;
  return `
    <a href="${escapeHtml(pr.url || "#")}" target="_blank" rel="noopener" class="card block px-4 py-3 group fade-in">
      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 mb-1.5 flex-wrap">
            <span class="font-mono text-[11px] tracking-tight text-emerald-300 font-semibold">#${pr.id}</span>
            <span class="age-chip" data-stale="${stale ? 1 : 0}">
              <span class="material-symbols-outlined text-[12px]">schedule</span>${pr.ageDays}d
            </span>
            ${approvalsBadge}
          </div>
          <div class="text-sm text-zinc-200 leading-snug mb-2 group-hover:text-white">${escapeHtml(pr.title || "")}</div>
          <div class="flex items-center gap-1">
            ${reviewers || `<span class="text-[11px] text-zinc-500">No reviewers</span>`}
          </div>
        </div>
        <span class="material-symbols-outlined text-zinc-600 text-[18px] mt-1 group-hover:text-emerald-400 transition">open_in_new</span>
      </div>
    </a>
  `;
}

function renderBitbucket(bb) {
  const mine = bb?.mine || [];
  const reviewing = bb?.reviewing || [];
  const total = mine.length + reviewing.length;
  $("bbCount").textContent = total ? `${total} open` : "";

  if (mine.length === 0 && reviewing.length === 0) {
    $("bbMineWrap").classList.remove("hidden");
    $("bbMine").innerHTML = `<div class="empty">No open PRs. 🎉</div>`;
    hide("bbReviewingWrap");
    return;
  }

  if (mine.length) {
    show("bbMineWrap");
    $("bbMine").innerHTML = mine.map(prCardHtml).join("");
  } else {
    hide("bbMineWrap");
  }
  if (reviewing.length) {
    show("bbReviewingWrap");
    $("bbReviewing").innerHTML = reviewing.map(prCardHtml).join("");
  } else {
    hide("bbReviewingWrap");
  }
}

// ---------- Render: salesforce ----------
function renderSalesforce(sf) {
  const mount = $("sfList");
  const orgs = Object.keys(sf || {});
  if (orgs.length === 0) {
    mount.innerHTML = `<div class="empty">No Salesforce data.</div>`;
    return;
  }

  // Filter to orgs that actually have data
  const withData = orgs.filter((o) => {
    const cs = sf[o]?.cases?.length || 0;
    const qs = sf[o]?.quotes?.length || 0;
    return cs + qs > 0;
  });

  if (withData.length === 0) {
    mount.innerHTML = `<div class="empty">No open Cases or recent Quotes across queried orgs.</div>`;
    return;
  }

  mount.innerHTML = withData.map((org) => {
    const cs = sf[org].cases || [];
    const qs = sf[org].quotes || [];
    const csHtml = cs.length ? cs.map((c) => `
      <div class="flex items-center gap-2.5 py-1.5 text-sm">
        <span class="font-mono text-[11px] text-cyan-300 font-semibold w-20 shrink-0">${escapeHtml(c.caseNumber || c.CaseNumber || "")}</span>
        <span class="status-pill" data-status="${statusKey(c.status || c.Status)}">${escapeHtml(c.status || c.Status || "?")}</span>
        <span class="text-zinc-300 truncate">${escapeHtml(c.subject || c.Subject || "")}</span>
      </div>
    `).join("") : "";
    const qsHtml = qs.length ? qs.map((q) => `
      <div class="flex items-center gap-2.5 py-1.5 text-sm">
        <span class="font-mono text-[11px] text-cyan-300 font-semibold w-32 shrink-0 truncate">${escapeHtml(q.name || q.Name || "")}</span>
        <span class="status-pill" data-status="${slug(q.status || q.Status)}">${escapeHtml(q.status || q.Status || "?")}</span>
        <span class="text-zinc-400 text-xs">${escapeHtml(q.type || "")}</span>
      </div>
    `).join("") : "";

    return `
      <div class="org-card fade-in">
        <div class="org-card-header">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-cyan-400 text-[18px]">database</span>
            <span class="font-mono text-sm font-semibold text-cyan-200">${escapeHtml(org)}</span>
          </div>
          <span class="text-xs text-zinc-500">${cs.length} case${cs.length === 1 ? "" : "s"} · ${qs.length} quote${qs.length === 1 ? "" : "s"}</span>
        </div>
        ${cs.length ? `<div class="text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5">Cases</div>${csHtml}` : ""}
        ${cs.length && qs.length ? `<div class="h-px bg-zinc-800 my-3"></div>` : ""}
        ${qs.length ? `<div class="text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5">Recent Quotes (last 7d)</div>${qsHtml}` : ""}
      </div>
    `;
  }).join("");
}

// ---------- Render: notes ----------
function renderNotes(notes) {
  if (!notes || notes.length === 0) {
    hide("notesSection");
    return;
  }
  show("notesSection");
  $("notesList").innerHTML = notes.map((n) => `
    <div class="card px-4 py-2.5 text-sm text-zinc-300 fade-in">${escapeHtml(n)}</div>
  `).join("");
}

// ---------- Top-level render ----------
function renderAll(data) {
  renderHeader(data);
  renderTopOfMind(data.topOfMind);
  renderJira(data.jira || {});
  renderBitbucket(data.bitbucket || {});
  renderSalesforce(data.salesforce || {});
  renderNotes(data.notes);
}

async function loadBrief() {
  // Phase 1: just use sample. Phase 2: read from RTDB.
  return SAMPLE_DATA;
}

async function refreshDashboard() {
  const btn = $("refreshBtn");
  btn?.classList.add("spinning");
  try {
    const data = await loadBrief();
    renderAll(data);
  } catch (err) {
    console.error("loadBrief failed", err);
    $("footerStatus").textContent = `Load failed: ${err.message || err}`;
  } finally {
    btn?.classList.remove("spinning");
  }
}

// ---------- Auth flow ----------
async function gateAndShow(user) {
  if (user.email !== ALLOWED_EMAIL) {
    hide("dashboard");
    hide("signInScreen");
    hide("bootScreen");
    show("deniedScreen");
    $("deniedMsg").textContent = `Signed in as ${user.email}. This dashboard is locked to ${ALLOWED_EMAIL}.`;
    return;
  }
  hide("bootScreen");
  hide("signInScreen");
  hide("deniedScreen");
  show("dashboard");
  await refreshDashboard();
}

function showSignIn() {
  hide("bootScreen");
  hide("dashboard");
  hide("deniedScreen");
  show("signInScreen");
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    gateAndShow(user);
  } else {
    showSignIn();
  }
});

$("signInBtn").addEventListener("click", async () => {
  const errEl = $("signInError");
  errEl.classList.add("hidden");
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    console.error("sign-in error", err);
    errEl.textContent = err.message || "Sign-in failed.";
    errEl.classList.remove("hidden");
  }
});

$("deniedSignOut").addEventListener("click", () => signOut(auth));
$("signOutBtn").addEventListener("click", () => signOut(auth));
$("refreshBtn").addEventListener("click", refreshDashboard);

// ---------- Service worker ----------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch((err) => console.warn("SW register failed", err));
}
