// chaelri.github.io/work/app.js
// Phase 1: Firebase Auth gate (Google Sign-in, locked to charliecayno@gmail.com)
//          + rich rendering (description / comments / reviewer state) from sample data.
// Phase 2 (next): replace SAMPLE_DATA reads with Firebase RTDB at /work-brief/{uid}/{date},
//          and update ~/bin/work-brief.sh to fetch the rich payload (jira issue view,
//          bitbucket pullrequest activity) and POST to a gemini-proxy endpoint.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

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

const ALLOWED_EMAIL = "charliecayno@gmail.com";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// ---------- Placeholder data — only fields cron actually captures today ----------
// Description / comments / branch / stats / labels are intentionally absent —
// the cron script doesn't fetch them yet. The UI will show empty states.
// Phase 2 wires acli jira workitem view + bitbucket PR/activity API to fill these.
const SAMPLE_DATA = {
  generatedAt: "2026-05-03T08:50:15+08:00",
  date: "2026-05-03",
  topOfMind: [],
  jira: {
    assigned: [
      { key: "CRUX-1998", type: "Story", status: "On-Hold", priority: "Low", summary: "Marsh cert: custom wordings appear after core cert", url: "https://azurtechnology.atlassian.net/browse/CRUX-1998" },
      { key: "CRUX-1995", type: "Story", status: "To Do", priority: "Low", summary: "GC Certificate: update reinsurance certificate template", url: "https://azurtechnology.atlassian.net/browse/CRUX-1995" },
      { key: "CRUX-2032", type: "Story", status: "To Do", priority: "Low", summary: "Generate revised GC certificate template on bind for QuoteBox API user", url: "https://azurtechnology.atlassian.net/browse/CRUX-2032" },
    ],
    recent24h: [],
  },
  bitbucket: {
    mine: [
      { id: 1280, title: "CRUX-1939: Map '9987 - ROW ex UK - Core Market' binder name to ROW ex UK (CRX9987) picklist", url: "https://bitbucket.org/truffengers/crux-underwriting/pull-requests/1280", ageDays: 10, reviewers: [{ name: "Curt T", approved: false }, { name: "Rayson L", approved: false }], approvals: 0 },
      { id: 1286, title: "CRUX-2031: Add DnB option to Cedant Code Type picklist", url: "https://bitbucket.org/truffengers/crux-underwriting/pull-requests/1286", ageDays: 6, reviewers: [{ name: "Curt T", approved: false }, { name: "Rayson L", approved: false }], approvals: 0 },
      { id: 1287, title: "CRUX-2036: Non-Standard Form S&T wrap referral rule (broker-agnostic)", url: "https://bitbucket.org/truffengers/crux-underwriting/pull-requests/1287", ageDays: 6, reviewers: [{ name: "Curt T", approved: false }, { name: "Rayson L", approved: false }], approvals: 0 },
      { id: 1288, title: "CRUX-2033: Map QuoteBox policyFormType/wordingsApplicable to Crux fields", url: "https://bitbucket.org/truffengers/crux-underwriting/pull-requests/1288", ageDays: 5, reviewers: [{ name: "Curt T", approved: false }, { name: "Rayson L", approved: false }], approvals: 0 },
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
  notes: [],
};

// ---------- DOM helpers ----------
const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slug = (s) => String(s).toLowerCase().replace(/\s+/g, "-");

function show(id) { $(id)?.classList.remove("hidden"); }
function hide(id) { $(id)?.classList.add("hidden"); }

// Tiny markdown-ish renderer for descriptions/comments. Handles **bold**, `code`,
// line breaks, and bare URLs. Not a full markdown engine — keeps the bundle tiny.
function mdInline(s) {
  let out = escapeHtml(String(s ?? ""));
  out = out.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-zinc-800 rounded text-pink-300 text-[12px]">$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" class="text-pink-400 hover:underline">$1</a>');
  return out;
}
function mdBlock(s) {
  // Preserve double-newline paragraph breaks; single newlines → <br>.
  return String(s ?? "")
    .split(/\n\s*\n/)
    .map((p) => `<p>${mdInline(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function relativeTime(date) {
  const diffMs = Date.now() - new Date(date).getTime();
  const m = Math.round(diffMs / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
function dateOnly(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Track which cards are expanded
const expandedCards = new Set();
function toggleExpand(id) {
  if (expandedCards.has(id)) expandedCards.delete(id);
  else expandedCards.add(id);
  document.querySelectorAll(`[data-card-id="${id}"]`).forEach((el) => {
    el.classList.toggle("is-expanded", expandedCards.has(id));
  });
}

// ---------- Render: header ----------
function renderHeader(data) {
  const d = new Date(data.date + "T00:00:00");
  $("hdrDate").textContent = d.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  const gen = data.generatedAt ? new Date(data.generatedAt) : null;
  if (gen) {
    $("hdrUpdated").textContent = `Updated ${relativeTime(gen)} · ${gen.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
    $("footerStatus").textContent = `Generated at ${gen.toLocaleString("en-US")}`;
  } else {
    $("hdrUpdated").textContent = "No timestamp on this brief";
  }
}

// ---------- Render: top of mind ----------
function renderTopOfMind(items) {
  const mount = $("topOfMind");
  if (!items?.length) { mount.innerHTML = `<div class="empty">Nothing flagged today.</div>`; return; }
  mount.innerHTML = items.map((t) => `
    <div class="tom-row fade-in">
      <span class="material-symbols-outlined">arrow_right</span>
      <span>${mdInline(t)}</span>
    </div>`).join("");
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
const priorityKey = (p) => String(p || "").toLowerCase();

function avatarFor(name) {
  const initials = String(name || "?").trim().split(/\s+/).map(s => s[0]).join("").slice(0, 2).toUpperCase();
  const colors = [
    "linear-gradient(135deg,#6366f1,#3b82f6)",
    "linear-gradient(135deg,#10b981,#059669)",
    "linear-gradient(135deg,#f59e0b,#d97706)",
    "linear-gradient(135deg,#ec4899,#be185d)",
    "linear-gradient(135deg,#a855f7,#7c3aed)",
    "linear-gradient(135deg,#06b6d4,#0891b2)",
  ];
  let h = 0;
  for (const ch of String(name || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `<span class="avatar" style="background:${colors[h % colors.length]}" title="${escapeHtml(name)}">${escapeHtml(initials)}</span>`;
}

function commentsBlockHtml(comments) {
  if (!comments?.length) return `<div class="text-[12px] text-zinc-500 italic">No comments yet.</div>`;
  return `
    <div class="comments-list">
      ${comments.map((c) => `
        <div class="comment-row">
          ${avatarFor(c.author)}
          <div class="min-w-0 flex-1">
            <div class="flex items-baseline gap-2 mb-0.5">
              <span class="text-[12px] font-semibold text-zinc-200">${escapeHtml(c.author || "?")}</span>
              <span class="text-[10.5px] text-zinc-500" title="${escapeHtml(c.created || "")}">${c.created ? relativeTime(c.created) : ""}</span>
            </div>
            <div class="text-[13px] text-zinc-300 leading-relaxed prose-tight">${mdInline(c.body || "")}</div>
          </div>
        </div>`).join("")}
    </div>`;
}

function jiraCardHtml(it) {
  const id = `jira-${it.key}`;
  const expanded = expandedCards.has(id);
  return `
    <div data-card-id="${id}" class="card detail-card ${expanded ? "is-expanded" : ""} fade-in" data-expand>
      <div class="card-summary px-4 py-3 cursor-pointer" data-expand-trigger>
        <div class="flex items-start gap-3">
          <span class="priority-dot mt-2" data-priority="${priorityKey(it.priority)}" title="${escapeHtml(it.priority || "")}"></span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center flex-wrap gap-2 mb-1">
              <span class="font-mono text-[11px] tracking-tight text-pink-300 font-semibold">${escapeHtml(it.key)}</span>
              <span class="status-pill" data-status="${statusKey(it.status)}">${escapeHtml(it.status || "?")}</span>
              ${it.type ? `<span class="text-[10.5px] uppercase tracking-wider text-zinc-500">${escapeHtml(it.type)}</span>` : ""}
              ${it.labels?.length ? it.labels.map(l => `<span class="label-chip">${escapeHtml(l)}</span>`).join("") : ""}
            </div>
            <div class="text-sm text-zinc-200 leading-snug">${escapeHtml(it.summary || "")}</div>
          </div>
          <span class="expand-chevron material-symbols-outlined text-zinc-500 text-[20px] mt-1">expand_more</span>
        </div>
      </div>
      <div class="card-detail">
        <div class="px-4 pb-4 pt-1 space-y-4 border-t border-zinc-800/60">
          <div class="meta-row">
            <span class="meta-cell"><span class="meta-key">Assignee</span>${escapeHtml(it.assignee || "—")}</span>
            <span class="meta-cell"><span class="meta-key">Reporter</span>${escapeHtml(it.reporter || "—")}</span>
            <span class="meta-cell"><span class="meta-key">Updated</span>${it.updated ? relativeTime(it.updated) : "—"}</span>
            <span class="meta-cell"><span class="meta-key">Created</span>${it.created ? dateOnly(it.created) : "—"}</span>
          </div>
          <div>
            <div class="detail-section-label">Description</div>
            ${it.description
              ? `<div class="detail-body">${mdBlock(it.description)}</div>`
              : `<div class="text-[12px] text-zinc-500 italic">Description not fetched yet — Phase 2 wires this from <code class="text-pink-300 not-italic">acli jira workitem view</code>.</div>`}
          </div>
          <div>
            <div class="detail-section-label">Comments <span class="text-zinc-600 font-normal">(${it.comments?.length || 0})</span></div>
            ${it.comments?.length ? commentsBlockHtml(it.comments) : `<div class="text-[12px] text-zinc-500 italic">Comments not fetched yet.</div>`}
          </div>
          <div class="flex justify-end">
            <a href="${escapeHtml(it.url || "#")}" target="_blank" rel="noopener" class="open-external" onclick="event.stopPropagation();">
              <span class="material-symbols-outlined text-[14px]">open_in_new</span> Open in Jira
            </a>
          </div>
        </div>
      </div>
    </div>`;
}

function renderJira(jira) {
  const list = jira?.assigned || [];
  const recent = jira?.recent24h || [];
  $("jiraCount").textContent = list.length ? `${list.length} active` : "";
  $("jiraList").innerHTML = list.length
    ? list.map(jiraCardHtml).join("")
    : `<div class="empty">No assigned issues.</div>`;

  if (recent.length) {
    show("jiraRecentWrap");
    $("jiraRecent").innerHTML = recent.map(jiraCardHtml).join("");
  } else {
    hide("jiraRecentWrap");
  }
}

// ---------- Render: bitbucket ----------
function reviewerListHtml(reviewers) {
  if (!reviewers?.length) return `<span class="text-[11px] text-zinc-500">No reviewers</span>`;
  return reviewers.map((r) => {
    const approved = r.approved;
    const cls = approved ? "reviewer-row approved" : "reviewer-row pending";
    const icon = approved ? "check_circle" : "pending";
    return `<span class="${cls}">${avatarFor(r.name)}<span class="text-[12px]">${escapeHtml(r.name)}</span><span class="material-symbols-outlined text-[14px]">${icon}</span></span>`;
  }).join("");
}

function bbCardHtml(pr) {
  const id = `bb-${pr.id}`;
  const expanded = expandedCards.has(id);
  const stale = pr.ageDays >= 7;
  const reviewerAvatars = (pr.reviewers || []).map((r) => avatarFor(r.name)).join("");
  const stats = pr.stats || {};
  return `
    <div data-card-id="${id}" class="card detail-card ${expanded ? "is-expanded" : ""} fade-in" data-expand>
      <div class="card-summary px-4 py-3 cursor-pointer" data-expand-trigger>
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 mb-1.5 flex-wrap">
              <span class="font-mono text-[11px] tracking-tight text-emerald-300 font-semibold">#${pr.id}</span>
              <span class="age-chip" data-stale="${stale ? 1 : 0}">
                <span class="material-symbols-outlined text-[12px]">schedule</span>${pr.ageDays}d
              </span>
              ${pr.approvals > 0
                ? `<span class="text-[11px] font-medium text-emerald-400 inline-flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">check_circle</span>${pr.approvals} approval${pr.approvals === 1 ? "" : "s"}</span>`
                : `<span class="text-[11px] text-zinc-500 inline-flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">pending</span>0 approvals</span>`}
              ${pr.comments?.length ? `<span class="text-[11px] text-zinc-500 inline-flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">forum</span>${pr.comments.length}</span>` : ""}
            </div>
            <div class="text-sm text-zinc-200 leading-snug mb-2">${escapeHtml(pr.title || "")}</div>
            <div class="flex items-center gap-1">${reviewerAvatars}</div>
          </div>
          <span class="expand-chevron material-symbols-outlined text-zinc-500 text-[20px] mt-1">expand_more</span>
        </div>
      </div>
      <div class="card-detail">
        <div class="px-4 pb-4 pt-1 space-y-4 border-t border-zinc-800/60">
          <div class="meta-row">
            <span class="meta-cell"><span class="meta-key">Branch</span><code class="text-pink-300">${escapeHtml(pr.branch || "?")}</code> → <code class="text-zinc-400">${escapeHtml(pr.destBranch || "?")}</code></span>
            <span class="meta-cell"><span class="meta-key">Updated</span>${pr.updatedAt ? relativeTime(pr.updatedAt) : "—"}</span>
            ${stats.commits != null ? `<span class="meta-cell"><span class="meta-key">Commits</span>${stats.commits}</span>` : ""}
            ${stats.filesChanged != null ? `<span class="meta-cell"><span class="meta-key">Files</span>${stats.filesChanged}</span>` : ""}
            ${stats.additions != null ? `<span class="meta-cell"><span class="meta-key">Δ</span><span class="text-emerald-400">+${stats.additions}</span> <span class="text-rose-400">-${stats.deletions || 0}</span></span>` : ""}
          </div>
          <div>
            <div class="detail-section-label">Description</div>
            ${pr.description
              ? `<div class="detail-body">${mdBlock(pr.description)}</div>`
              : `<div class="text-[12px] text-zinc-500 italic">Description not fetched yet — Phase 2 wires the Bitbucket PR detail API.</div>`}
          </div>
          <div>
            <div class="detail-section-label">Reviewers</div>
            <div class="reviewer-list">${reviewerListHtml(pr.reviewers)}</div>
          </div>
          <div>
            <div class="detail-section-label">Comments <span class="text-zinc-600 font-normal">(${pr.comments?.length || 0})</span></div>
            ${pr.comments?.length ? commentsBlockHtml(pr.comments) : `<div class="text-[12px] text-zinc-500 italic">Comments not fetched yet.</div>`}
          </div>
          <div class="flex justify-end">
            <a href="${escapeHtml(pr.url || "#")}" target="_blank" rel="noopener" class="open-external" onclick="event.stopPropagation();">
              <span class="material-symbols-outlined text-[14px]">open_in_new</span> Open in Bitbucket
            </a>
          </div>
        </div>
      </div>
    </div>`;
}

function renderBitbucket(bb) {
  const mine = bb?.mine || [];
  const reviewing = bb?.reviewing || [];
  const total = mine.length + reviewing.length;
  $("bbCount").textContent = total ? `${total} open` : "";

  if (total === 0) {
    show("bbMineWrap");
    $("bbMine").innerHTML = `<div class="empty">No open PRs. 🎉</div>`;
    hide("bbReviewingWrap");
    return;
  }
  if (mine.length) {
    show("bbMineWrap");
    $("bbMine").innerHTML = mine.map(bbCardHtml).join("");
  } else hide("bbMineWrap");
  if (reviewing.length) {
    show("bbReviewingWrap");
    $("bbReviewing").innerHTML = reviewing.map(bbCardHtml).join("");
  } else hide("bbReviewingWrap");
}

// ---------- Render: salesforce ----------
function renderSalesforce(sf) {
  const mount = $("sfList");
  const orgs = Object.keys(sf || {});
  const withData = orgs.filter((o) => (sf[o]?.cases?.length || 0) + (sf[o]?.quotes?.length || 0) > 0);
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
      </div>`).join("") : "";
    const qsHtml = qs.length ? qs.map((q) => `
      <div class="flex items-center gap-2.5 py-1.5 text-sm">
        <span class="font-mono text-[11px] text-cyan-300 font-semibold w-32 shrink-0 truncate">${escapeHtml(q.name || q.Name || "")}</span>
        <span class="status-pill" data-status="${slug(q.status || q.Status)}">${escapeHtml(q.status || q.Status || "?")}</span>
        <span class="text-zinc-400 text-xs">${escapeHtml(q.type || "")}</span>
      </div>`).join("") : "";

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
      </div>`;
  }).join("");
}

// ---------- Render: notes ----------
function renderNotes(notes) {
  if (!notes?.length) { hide("notesSection"); return; }
  show("notesSection");
  $("notesList").innerHTML = notes.map((n) => `<div class="card px-4 py-2.5 text-sm text-zinc-300 fade-in">${mdInline(n)}</div>`).join("");
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

// Expand-in-place via event delegation (works after rerender too)
document.addEventListener("click", (e) => {
  // If the user clicked the external link inside a detail card, don't toggle.
  if (e.target.closest(".open-external")) return;
  const trigger = e.target.closest("[data-expand-trigger]");
  if (!trigger) return;
  const card = trigger.closest("[data-card-id]");
  if (!card) return;
  toggleExpand(card.dataset.cardId);
});

// ---------- Auth ----------
function resolveEmail(user) {
  if (user?.email) return user.email.toLowerCase();
  return user?.providerData?.find((p) => p?.email)?.email?.toLowerCase() || null;
}

async function gateAndShow(user) {
  const email = resolveEmail(user);
  if (email !== ALLOWED_EMAIL) {
    hide("dashboard"); hide("signInScreen"); hide("bootScreen"); show("deniedScreen");
    $("deniedMsg").textContent = `Signed in as ${email || user?.displayName || "(no email shared)"}. This dashboard is locked to ${ALLOWED_EMAIL}.`;
    return;
  }
  hide("bootScreen"); hide("signInScreen"); hide("deniedScreen"); show("dashboard");
  await refreshDashboard();
}

function showSignIn() {
  hide("bootScreen"); hide("dashboard"); hide("deniedScreen"); show("signInScreen");
}

onAuthStateChanged(auth, (user) => user ? gateAndShow(user) : showSignIn());

$("signInBtn").addEventListener("click", async () => {
  const errEl = $("signInError");
  errEl.classList.add("hidden");
  try {
    const provider = new GoogleAuthProvider();
    provider.addScope("email");
    provider.addScope("profile");
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(auth, provider);
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
