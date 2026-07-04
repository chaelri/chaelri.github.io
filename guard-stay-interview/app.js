/* ===================================================================
   Guard Stay-In Interview — app.js
   Public form + admin dashboard. Sibling to guard-exit-interview.
   Same Firebase project + same admin allowlist. Auth session shared.
=================================================================== */

// ─── COMPANY ────────────────────────────────────────────────────────
const COMPANIES = {
  manela: { id: 'manela', name: 'New Manela' },
  moriah: { id: 'moriah', name: 'New Moriah' },
};
const COMPANY_KEY = 'stay_interview_active_company';
let currentCompany = localStorage.getItem(COMPANY_KEY) || 'manela';

// ─── FIREBASE (identical to guard-exit-interview) ───────────────────
const firebaseConfig = {
  apiKey: "AIzaSyB8ahT56WbEUaGAymsRNNA-DrfZnUnWIwk",
  authDomain: "test-database-55379.firebaseapp.com",
  databaseURL: "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "test-database-55379",
  storageBucket: "test-database-55379.firebasestorage.app",
  messagingSenderId: "933688602756",
  appId: "1:933688602756:web:392a3a4ce040cb9d4452d1"
};
firebase.initializeApp(firebaseConfig);
const fbDb = firebase.database();
const fbAuth = firebase.auth();

// ─── AUTH ALLOWLIST (identical to guard-exit-interview) ─────────────
const ALLOWED_EDITORS = [
  'willy23.mgc@gmail.com',
  'kasromantico@gmail.com',
  'charliecayno@gmail.com',
];
let currentUser = null;
let isEditor = false;

// ─── DATA ───────────────────────────────────────────────────────────
let submissions = [];              // guard_stay_interview/<company>
let detachments = [];              // shared with guard_exit_interview_config/<company>/detachments
let submissionsListener = null;
let detachmentsListener = null;
let currentView = 'form';          // 'form' | 'dashboard' | 'table'

// ─── CONCERNS SCHEMA ────────────────────────────────────────────────
const CONCERNS = [
  { key: 'salary',        icon: 'payments',           en: 'Salary / delayed pay / underpayment', tl: 'Sweldo / delayed / kulang' },
  { key: 'vl_sl',         icon: 'event_busy',         en: 'VL / SL / rest day not granted',      tl: 'Hindi naibibigay ang VL / SL / rest day' },
  { key: 'straight_duty', icon: 'schedule',           en: 'Straight duty / excessive hours',     tl: 'Straight duty / sobrang oras' },
  { key: 'bullying',      icon: 'report',             en: 'Bullying',                            tl: 'Binu-bully' },
  { key: 'harassment',    icon: 'no_adult_content',   en: 'Sexual harassment',                   tl: 'Sexual harassment' },
  { key: 'favoritism',    icon: 'workspace_premium',  en: 'Favoritism',                          tl: 'May paboritism' },
  { key: 'dispute_super', icon: 'gavel',              en: 'Dispute with supervisor',             tl: 'Away sa supervisor' },
  { key: 'dispute_peer',  icon: 'group_off',          en: 'Dispute with co-guard',               tl: 'Away sa ka-guard' },
  { key: 'work_cond',     icon: 'construction',       en: 'Working conditions (post, PPE, CR)',  tl: 'Kondisyon (post, PPE, CR)' },
  { key: 'family',        icon: 'family_restroom',    en: 'Family concerns',                     tl: 'Pamilya' },
  { key: 'health',        icon: 'medication',         en: 'Health concerns',                     tl: 'Kalusugan' },
  { key: 'other',         icon: 'more_horiz',         en: 'Other (specify below)',               tl: 'Iba pa (isulat)' },
];
const CONCERN_LABELS = Object.fromEntries(CONCERNS.map(c => [c.key, c.en]));

const RESIGN_LABELS = {
  yes: 'Yes — I plan to resign',
  thinking: 'Thinking about it',
  no: 'Not yet',
};
const DURATION_LABELS = {
  lt1: '< 1 month',
  '1to3': '1 – 3 months',
  '3to6': '3 – 6 months',
  gt6: '> 6 months',
};

// ─── UTIL ───────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('en-PH', { year:'numeric', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit' });
}
function newId() {
  return 'stay_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// ─── AUTH RENDERING ─────────────────────────────────────────────────
function applyAdminMode() {
  document.body.classList.toggle('is-admin', isEditor);
  const banner = document.getElementById('admin-banner');
  if (banner) banner.hidden = !isEditor;
  // If admin signs out while on dashboard/table, drop back to form.
  if (!isEditor && (currentView === 'dashboard' || currentView === 'table')) {
    switchView('form');
  }
}

function renderAuthControl() {
  const box = document.getElementById('auth-control');
  if (!box) return;

  let html;
  if (currentUser) {
    const fullName = currentUser.displayName || currentUser.email || 'User';
    const initial = (fullName || '?')[0].toUpperCase();
    const photo = currentUser.photoURL || '';
    const avatarHtml = photo
      ? `<img class="auth-avatar-img" src="${escHtml(photo)}" alt="" referrerpolicy="no-referrer" />`
      : `<span class="auth-avatar">${escHtml(initial)}</span>`;
    const tooltip = `${fullName} (${currentUser.email}) — ${isEditor ? 'admin access' : 'signed in but not an admin'}`;
    const label = isEditor ? fullName.split('@')[0] : 'view only';
    html = `<button class="auth-btn ${isEditor ? 'auth-btn-editor' : ''}" title="${escHtml(tooltip)}">
      ${avatarHtml}
      <span>${escHtml(label)}</span>
      <span class="material-icons auth-signout-icon" title="Sign out">logout</span>
    </button>`;
  } else {
    html = `<button class="auth-btn" title="Admin sign-in">
      <span class="material-icons">login</span>
      <span>Admin sign-in</span>
    </button>`;
  }
  box.innerHTML = html;
  const btn = box.querySelector('.auth-btn');
  btn.addEventListener('click', () => {
    if (currentUser) fbAuth.signOut();
    else openSignInPopover(btn);
  });
}

// ─── SIGN-IN POPOVER (email/password + Google) ──────────────────────
const LAST_EMAIL_KEY = 'gsi_last_signin_email';

function openSignInPopover(anchorBtn) {
  closeSignInPopover();
  const lastEmail = localStorage.getItem(LAST_EMAIL_KEY) || '';
  const pop = document.createElement('div');
  pop.id = 'auth-popover';
  pop.className = 'auth-popover';
  pop.innerHTML = `
    <div class="auth-popover-title">Admin sign-in</div>
    <label class="auth-popover-label">Email</label>
    <input id="ap-email" type="email" autocomplete="username" inputmode="email"
           class="auth-popover-input" placeholder="you@example.com" value="${escHtml(lastEmail)}" />
    <label class="auth-popover-label">Password</label>
    <input id="ap-pass" type="password" autocomplete="current-password"
           class="auth-popover-input" placeholder="••••••••" />
    <div id="ap-err" class="auth-popover-error" hidden></div>
    <div class="auth-popover-actions">
      <button id="ap-cancel" class="auth-popover-btn auth-popover-btn-secondary">Cancel</button>
      <button id="ap-submit" class="auth-popover-btn auth-popover-btn-primary">Sign in</button>
    </div>
    <button id="ap-google" class="auth-popover-google">
      <span class="material-icons" style="font-size:16px;">account_circle</span>
      Sign in with Google
    </button>
  `;
  document.body.appendChild(pop);

  const rect = anchorBtn.getBoundingClientRect();
  const popWidth = 280;
  const top = rect.bottom + window.scrollY + 8;
  let left = rect.right + window.scrollX - popWidth;
  if (left < 8) left = 8;
  if (left + popWidth > window.innerWidth - 8) left = window.innerWidth - popWidth - 8;
  pop.style.top = top + 'px';
  pop.style.left = left + 'px';

  const emailInput = pop.querySelector('#ap-email');
  const passInput = pop.querySelector('#ap-pass');
  const errEl = pop.querySelector('#ap-err');
  const submitBtn = pop.querySelector('#ap-submit');
  const cancelBtn = pop.querySelector('#ap-cancel');
  const googleBtn = pop.querySelector('#ap-google');

  setTimeout(() => (lastEmail ? passInput : emailInput).focus(), 30);

  const showError = (msg) => { errEl.textContent = msg; errEl.hidden = false; };

  const doSignIn = () => {
    const email = emailInput.value.trim().toLowerCase();
    const password = passInput.value;
    if (!email || !password) { showError('Email and password are required.'); return; }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in…';
    errEl.hidden = true;
    fbAuth.signInWithEmailAndPassword(email, password)
      .then(() => {
        localStorage.setItem(LAST_EMAIL_KEY, email);
        closeSignInPopover();
      })
      .catch(err => {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign in';
        const code = (err && err.code) || '';
        let msg = (err && err.message) || 'Sign-in failed.';
        if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') {
          msg = 'Wrong email or password.';
        } else if (code === 'auth/user-not-found') {
          msg = 'No account for that email. Ask Charlie.';
        } else if (code === 'auth/too-many-requests') {
          msg = 'Too many attempts. Wait a bit and try again.';
        } else if (code === 'auth/network-request-failed') {
          msg = 'Network error. Check your connection.';
        }
        showError(msg);
      });
  };

  submitBtn.addEventListener('click', doSignIn);
  cancelBtn.addEventListener('click', closeSignInPopover);
  googleBtn.addEventListener('click', () => {
    fbAuth.signInWithPopup(new firebase.auth.GoogleAuthProvider())
      .then(() => closeSignInPopover())
      .catch(err => {
        if (err && err.code !== 'auth/popup-closed-by-user') showError(err.message || 'Google sign-in failed.');
      });
  });
  [emailInput, passInput].forEach(inp => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); doSignIn(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeSignInPopover(); }
    });
  });

  setTimeout(() => document.addEventListener('mousedown', onOutsideClick), 0);
}

function onOutsideClick(e) {
  const pop = document.getElementById('auth-popover');
  if (!pop) return;
  if (pop.contains(e.target)) return;
  if (e.target.closest('.auth-btn')) return;
  closeSignInPopover();
}

function closeSignInPopover() {
  const pop = document.getElementById('auth-popover');
  if (pop) pop.remove();
  document.removeEventListener('mousedown', onOutsideClick);
}

fbAuth.onAuthStateChanged(user => {
  currentUser = user || null;
  const email = (user && user.email || '').toLowerCase();
  isEditor = !!user && ALLOWED_EDITORS.includes(email);
  applyAdminMode();
  renderAuthControl();
  // Refresh admin views if they're open
  if (isEditor) {
    if (currentView === 'dashboard') renderDashboard();
    if (currentView === 'table') renderTable();
  }
});

// ─── FIREBASE REFS ──────────────────────────────────────────────────
function getSubmissionsRef() {
  return fbDb.ref('guard_stay_interview/' + currentCompany);
}
function getDetachmentsRef() {
  // shared with the exit-interview app so admins manage one list
  return fbDb.ref('guard_exit_interview_config/' + currentCompany + '/detachments');
}

function saveSubmission(sub) {
  // Anonymous users can push submissions (RTDB rules must allow this path).
  // Using push() so the server assigns a unique key.
  return getSubmissionsRef().push(sub);
}

function deleteSubmission(key) {
  if (!isEditor) return Promise.reject('not admin');
  return getSubmissionsRef().child(key).remove();
}

function startSubmissionsListener() {
  if (submissionsListener) submissionsListener();
  const ref = getSubmissionsRef();
  const cb = ref.on('value', snap => {
    const val = snap.val() || {};
    submissions = Object.entries(val).map(([key, v]) => ({ _key: key, ...v }));
    // Sort newest first
    submissions.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
    if (currentView === 'dashboard') renderDashboard();
    if (currentView === 'table') renderTable();
  });
  submissionsListener = () => ref.off('value', cb);
}

function startDetachmentsListener() {
  if (detachmentsListener) detachmentsListener();
  const ref = getDetachmentsRef();
  const cb = ref.on('value', snap => {
    const val = snap.val();
    detachments = Array.isArray(val) ? val.slice().sort((a,b) => a.localeCompare(b)) : [];
    updateDetachmentDatalist();
    populateDetachmentFilters();
  });
  detachmentsListener = () => ref.off('value', cb);
}

function updateDetachmentDatalist() {
  const dl = document.getElementById('detachment-options');
  if (dl) dl.innerHTML = detachments.map(d => `<option value="${escHtml(d)}"></option>`).join('');
}

function populateDetachmentFilters() {
  ['dash-detachment', 'table-detachment'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">All detachments</option>' +
      detachments.map(d => `<option value="${escHtml(d)}">${escHtml(d)}</option>`).join('');
    if (detachments.includes(prev)) sel.value = prev;
  });
}

// ─── COMPANY SWITCHING ──────────────────────────────────────────────
function switchCompany(id) {
  if (!COMPANIES[id]) return;
  currentCompany = id;
  localStorage.setItem(COMPANY_KEY, id);
  document.body.setAttribute('data-company', id);
  document.querySelectorAll('.header-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.company === id);
  });
  // Rewire listeners to new company
  startSubmissionsListener();
  startDetachmentsListener();
  // Reload company-scoped views
  if (currentView === 'dashboard') renderDashboard();
  if (currentView === 'table') renderTable();
}

// ─── VIEW SWITCHING ─────────────────────────────────────────────────
function switchView(name) {
  currentView = name;
  ['form-view','dashboard-view','table-view'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = (id !== name + '-view');
  });
  document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('btn-view-' + name);
  if (btn) btn.classList.add('active');

  if (name === 'dashboard') renderDashboard();
  if (name === 'table') renderTable();
}

// ─── CONCERNS UI ────────────────────────────────────────────────────
function buildConcernsGrid() {
  const grid = document.getElementById('concerns-grid');
  if (!grid) return;
  grid.innerHTML = CONCERNS.map(c => `
    <label class="concern-chip" data-key="${c.key}">
      <input type="checkbox" data-concern-key="${c.key}">
      <span class="material-icons cx-icon">${c.icon}</span>
      <span class="cx-body">
        <span class="cx-en">${escHtml(c.en)}</span>
        <span class="cx-tl">${escHtml(c.tl)}</span>
      </span>
    </label>
  `).join('');
  grid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      cb.closest('.concern-chip').classList.toggle('checked', cb.checked);
      // Show "other" textarea when Other is ticked
      const otherRow = document.getElementById('concern-other-row');
      const otherCb = grid.querySelector('input[data-concern-key="other"]');
      if (otherRow) otherRow.hidden = !(otherCb && otherCb.checked);
    });
  });
}

// ─── SUBMISSION ─────────────────────────────────────────────────────
function collectForm() {
  const val = id => (document.getElementById(id)?.value || '').trim();
  const rad = name => document.querySelector(`input[name="${name}"]:checked`)?.value || '';

  const concerns = Array.from(document.querySelectorAll('#concerns-grid input[type="checkbox"]:checked'))
    .map(cb => cb.dataset.concernKey);

  return {
    fullName: val('f-fullName'),
    detachment: val('f-detachment'),
    rank: val('f-rank'),
    tenure: val('f-tenure'),
    concerns,
    concernOther: val('f-concern-other'),
    duration: rad('f-duration'),
    resign: rad('f-resign'),
    help: val('f-help'),
    company: currentCompany,
    submittedAt: new Date().toISOString(),
  };
}

function validateSubmission(sub) {
  if (!sub.fullName) return 'Full name is required.';
  if (!sub.detachment) return 'Detachment is required.';
  if (!sub.concerns.length) return 'Please tick at least one concern.';
  if (sub.concerns.includes('other') && !sub.concernOther) return 'Please describe "Other" concern.';
  if (!sub.duration) return 'Please pick how long this has been going on.';
  if (!sub.resign) return 'Please pick your resign status.';
  return null;
}

function wireSubmit() {
  const btn = document.getElementById('btn-submit');
  const errEl = document.getElementById('submit-error');
  btn.addEventListener('click', () => {
    const sub = collectForm();
    const err = validateSubmission(sub);
    if (err) {
      errEl.textContent = err;
      errEl.hidden = false;
      errEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    errEl.hidden = true;
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons">hourglass_top</span><span>Sending…</span>';
    saveSubmission(sub)
      .then(() => {
        document.getElementById('thankyou-overlay').hidden = false;
        btn.disabled = false;
        btn.innerHTML = '<span class="material-icons">send</span><span>Submit — <span class="tl-sub">Ipasa</span></span>';
      })
      .catch(e => {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-icons">send</span><span>Submit — <span class="tl-sub">Ipasa</span></span>';
        errEl.textContent = 'Failed to send: ' + (e.message || e);
        errEl.hidden = false;
      });
  });

  document.getElementById('btn-thankyou-new').addEventListener('click', () => {
    resetForm();
    document.getElementById('thankyou-overlay').hidden = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function resetForm() {
  ['f-fullName','f-detachment','f-rank','f-tenure','f-concern-other','f-help'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.querySelectorAll('#concerns-grid input[type="checkbox"]').forEach(cb => {
    cb.checked = false;
    cb.closest('.concern-chip').classList.remove('checked');
  });
  document.querySelectorAll('input[name="f-duration"], input[name="f-resign"]').forEach(r => r.checked = false);
  document.getElementById('concern-other-row').hidden = true;
  document.getElementById('submit-error').hidden = true;
}

// ─── DASHBOARD ──────────────────────────────────────────────────────
function getPeriodMs(period) {
  const now = Date.now();
  if (period === '30') return now - 30 * 86400e3;
  if (period === '90') return now - 90 * 86400e3;
  if (period === 'ytd') {
    const d = new Date();
    return new Date(d.getFullYear(), 0, 1).getTime();
  }
  return 0;
}

function getFilteredSubmissions() {
  const period = document.getElementById('dash-period')?.value || 'all';
  const detachment = document.getElementById('dash-detachment')?.value || '';
  const cutoff = getPeriodMs(period);
  return submissions.filter(s => {
    if (cutoff && new Date(s.submittedAt).getTime() < cutoff) return false;
    if (detachment && s.detachment !== detachment) return false;
    return true;
  });
}

function renderDashboard() {
  const rows = getFilteredSubmissions();

  // KPIs
  const total = rows.length;
  const resignYes = rows.filter(r => r.resign === 'yes').length;
  const resignThinking = rows.filter(r => r.resign === 'thinking').length;
  const riskCount = resignYes + resignThinking;
  const riskPct = total ? Math.round((riskCount / total) * 100) : 0;
  const topConcern = topConcernOf(rows);
  const detachmentCount = new Set(rows.map(r => r.detachment).filter(Boolean)).size;

  const kpiGrid = document.getElementById('kpi-grid');
  kpiGrid.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Submissions</div>
      <div class="kpi-label-tl">Kabuuang naipasa</div>
      <div class="kpi-value">${total}</div>
    </div>
    <div class="kpi-card ${resignYes ? 'kpi-danger' : ''}">
      <div class="kpi-label">Planning to resign</div>
      <div class="kpi-label-tl">Seryoso nang magresign</div>
      <div class="kpi-value ${resignYes ? 'kpi-danger-color' : ''}">${resignYes}</div>
    </div>
    <div class="kpi-card ${resignThinking ? 'kpi-warn' : ''}">
      <div class="kpi-label">Thinking about it</div>
      <div class="kpi-label-tl">Naiisip pa lang</div>
      <div class="kpi-value ${resignThinking ? 'kpi-warn-color' : ''}">${resignThinking}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">At-risk %</div>
      <div class="kpi-label-tl">Bahagdan ng at-risk</div>
      <div class="kpi-value">${riskPct}%</div>
      <div class="kpi-sub">of respondents may resign</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Top concern</div>
      <div class="kpi-label-tl">Pinakamalimit na hinaing</div>
      <div class="kpi-value" style="font-size:16px; line-height:1.2;">${topConcern ? escHtml(topConcern.label) : '—'}</div>
      ${topConcern ? `<div class="kpi-sub">${topConcern.count} mention${topConcern.count===1?'':'s'}</div>` : ''}
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Detachments heard from</div>
      <div class="kpi-label-tl">Bilang ng detachment na nagsalita</div>
      <div class="kpi-value">${detachmentCount}</div>
    </div>
  `;

  renderConcernChart(rows);
  renderResignChart(rows, total);
  renderDetachmentChart(rows);
  renderDurationChart(rows);
  renderTimelineChart(rows);
}

function topConcernOf(rows) {
  const counts = {};
  rows.forEach(r => (r.concerns || []).forEach(k => { counts[k] = (counts[k]||0) + 1; }));
  const entries = Object.entries(counts).sort((a,b) => b[1] - a[1]);
  if (!entries.length) return null;
  const [key, count] = entries[0];
  return { label: CONCERN_LABELS[key] || key, count };
}

function renderConcernChart(rows) {
  const el = document.getElementById('chart-concerns');
  if (!rows.length) { el.innerHTML = '<div class="chart-empty">No submissions yet.</div>'; return; }
  const counts = {};
  rows.forEach(r => (r.concerns || []).forEach(k => { counts[k] = (counts[k]||0) + 1; }));
  const entries = Object.entries(counts).sort((a,b) => b[1] - a[1]);
  const max = entries[0] ? entries[0][1] : 1;
  el.innerHTML = entries.map(([key, count]) => `
    <div>
      <div class="bar-row">
        <div class="bar-lbl">${escHtml(CONCERN_LABELS[key] || key)}</div>
        <div class="bar-count">${count}</div>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${(count/max)*100}%"></div></div>
    </div>
  `).join('');
}

function renderResignChart(rows, total) {
  const el = document.getElementById('chart-resign');
  if (!rows.length) { el.innerHTML = '<div class="chart-empty">No submissions yet.</div>'; return; }
  const buckets = [
    { key: 'yes', label: 'Yes — planning to resign', tl: 'Oo, seryoso na', fill: 'bar-fill-danger' },
    { key: 'thinking', label: 'Thinking about it', tl: 'Naiisip pa', fill: 'bar-fill-warn' },
    { key: 'no', label: 'Not yet', tl: 'Hindi pa naman', fill: 'bar-fill-ok' },
  ];
  el.innerHTML = buckets.map(b => {
    const count = rows.filter(r => r.resign === b.key).length;
    const pct = total ? (count/total)*100 : 0;
    return `
      <div>
        <div class="bar-row">
          <div class="bar-lbl">${escHtml(b.label)} <span class="tl-sub">${escHtml(b.tl)}</span></div>
          <div class="bar-count">${count}</div>
        </div>
        <div class="bar-track"><div class="bar-fill ${b.fill}" style="width:${pct}%"></div></div>
      </div>
    `;
  }).join('');
}

function renderDetachmentChart(rows) {
  const el = document.getElementById('chart-detachment');
  if (!rows.length) { el.innerHTML = '<div class="chart-empty">No submissions yet.</div>'; return; }
  const counts = {};
  rows.forEach(r => { if (r.detachment) counts[r.detachment] = (counts[r.detachment]||0) + 1; });
  const entries = Object.entries(counts).sort((a,b) => b[1] - a[1]);
  const max = entries[0] ? entries[0][1] : 1;
  el.innerHTML = entries.map(([name, count]) => `
    <div>
      <div class="bar-row">
        <div class="bar-lbl">${escHtml(name)}</div>
        <div class="bar-count">${count}</div>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${(count/max)*100}%"></div></div>
    </div>
  `).join('');
}

function renderDurationChart(rows) {
  const el = document.getElementById('chart-duration');
  if (!rows.length) { el.innerHTML = '<div class="chart-empty">No submissions yet.</div>'; return; }
  const buckets = [
    { key: 'lt1',  label: '< 1 month' },
    { key: '1to3', label: '1 – 3 months' },
    { key: '3to6', label: '3 – 6 months' },
    { key: 'gt6',  label: '> 6 months' },
  ];
  const total = rows.length;
  el.innerHTML = buckets.map(b => {
    const count = rows.filter(r => r.duration === b.key).length;
    const pct = total ? (count/total)*100 : 0;
    // Longer duration = redder fill
    const fill = b.key === 'gt6' ? 'bar-fill-danger' : b.key === '3to6' ? 'bar-fill-warn' : '';
    return `
      <div>
        <div class="bar-row">
          <div class="bar-lbl">${escHtml(b.label)}</div>
          <div class="bar-count">${count}</div>
        </div>
        <div class="bar-track"><div class="bar-fill ${fill}" style="width:${pct}%"></div></div>
      </div>
    `;
  }).join('');
}

function renderTimelineChart(rows) {
  const el = document.getElementById('chart-timeline');
  if (!rows.length) { el.innerHTML = '<div class="chart-empty">No submissions yet.</div>'; return; }
  const monthCounts = {};
  rows.forEach(r => {
    if (!r.submittedAt) return;
    const m = r.submittedAt.slice(0, 7);
    monthCounts[m] = (monthCounts[m]||0) + 1;
  });
  const months = Object.keys(monthCounts).sort();
  const max = Math.max(...Object.values(monthCounts), 1);
  el.innerHTML = `
    <div class="timeline-bars">
      ${months.map(m => {
        const count = monthCounts[m];
        const h = (count/max) * 100;
        return `
          <div class="tl-col">
            <div class="bar-count">${count}</div>
            <div class="tl-bar" style="height:${h}%"></div>
            <div class="tl-lbl">${escHtml(m.slice(2).replace('-', '/'))}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ─── TABLE VIEW ─────────────────────────────────────────────────────
function renderTable() {
  const tbody = document.getElementById('stay-tbody');
  const search = (document.getElementById('table-search')?.value || '').toLowerCase();
  const detachment = document.getElementById('table-detachment')?.value || '';
  const rows = submissions.filter(r => {
    if (detachment && r.detachment !== detachment) return false;
    if (search) {
      const hay = [
        r.fullName, r.detachment, r.rank, r.tenure, r.help, r.concernOther,
        ...(r.concerns || []).map(k => CONCERN_LABELS[k] || k),
      ].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="padding:24px; text-align:center; color:#94a3b8; font-style:italic;">No submissions match the filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const concerns = (r.concerns || []).map(k =>
      `<span class="concern-pill">${escHtml(CONCERN_LABELS[k] || k)}</span>`
    ).join('') + (r.concernOther ? `<div style="margin-top:4px; font-size:12px; color:#64748b;"><b>Other:</b> ${escHtml(r.concernOther)}</div>` : '');
    const riskCls = r.resign === 'yes' ? 'risk-pill-yes' : r.resign === 'thinking' ? 'risk-pill-thinking' : 'risk-pill-no';
    return `
      <tr data-key="${escHtml(r._key)}">
        <td>${escHtml(fmtDate(r.submittedAt))}</td>
        <td class="td-name">${escHtml(r.fullName || '')}</td>
        <td>${escHtml(r.detachment || '')}</td>
        <td>${escHtml(r.rank || '')}</td>
        <td>${escHtml(r.tenure || '')}</td>
        <td>${concerns}</td>
        <td>${escHtml(DURATION_LABELS[r.duration] || '')}</td>
        <td><span class="risk-pill ${riskCls}">${escHtml(RESIGN_LABELS[r.resign] || '—')}</span></td>
        <td>${escHtml(r.help || '')}</td>
        <td class="td-actions">
          <button class="btn-delete-row" data-key="${escHtml(r._key)}" title="Delete">
            <span class="material-icons">delete</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.btn-delete-row').forEach(btn => {
    btn.addEventListener('click', e => {
      const key = btn.dataset.key;
      const row = submissions.find(s => s._key === key);
      openConfirm(`Delete submission from ${row?.fullName || 'this guard'}?`, () => {
        deleteSubmission(key);
      });
    });
  });
}

// ─── CONFIRM MODAL ──────────────────────────────────────────────────
let confirmCb = null;
function openConfirm(body, cb) {
  document.getElementById('confirm-body').textContent = body;
  document.getElementById('confirm-overlay').hidden = false;
  confirmCb = cb;
}
function closeConfirm() {
  document.getElementById('confirm-overlay').hidden = true;
  confirmCb = null;
}

// ─── EXPORT (Excel) ─────────────────────────────────────────────────
function exportXLSX() {
  const rows = getFilteredSubmissions();
  if (!rows.length) { alert('No submissions to export.'); return; }
  const HEADERS = ['Submitted', 'Name', 'Detachment', 'Rank', 'Tenure', 'Concerns', 'Other concern', 'Duration', 'Resign risk', 'What would help'];
  const data = [HEADERS];
  rows.forEach(r => {
    data.push([
      fmtDate(r.submittedAt),
      r.fullName || '',
      r.detachment || '',
      r.rank || '',
      r.tenure || '',
      (r.concerns || []).map(k => CONCERN_LABELS[k] || k).join(', '),
      r.concernOther || '',
      DURATION_LABELS[r.duration] || '',
      RESIGN_LABELS[r.resign] || '',
      r.help || '',
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(data);
  // Header style
  HEADERS.forEach((_, c) => {
    const cell = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[cell]) ws[cell].s = {
      fill: { patternType: 'solid', fgColor: { rgb: currentCompany === 'moriah' ? 'FEF3C7' : 'CCFBF1' } },
      font: { bold: true, color: { rgb: currentCompany === 'moriah' ? 'B45309' : '0F766E' }, sz: 11 },
      alignment: { horizontal: 'left', vertical: 'center' },
    };
  });
  ws['!cols'] = [
    { wch: 20 }, { wch: 24 }, { wch: 22 }, { wch: 16 }, { wch: 18 },
    { wch: 40 }, { wch: 30 }, { wch: 14 }, { wch: 22 }, { wch: 40 },
  ];
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  const wb = XLSX.utils.book_new();
  const sheetName = COMPANIES[currentCompany].name + ' Stay-In';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `stay-in-interview-${currentCompany}-${today}.xlsx`);
}

// ─── WIRING ─────────────────────────────────────────────────────────
function wireHeader() {
  // Company tabs
  document.querySelectorAll('.header-tab').forEach(t => {
    t.addEventListener('click', () => switchCompany(t.dataset.company));
  });
  // View buttons
  document.getElementById('btn-view-form').addEventListener('click', () => switchView('form'));
  document.getElementById('btn-view-dashboard').addEventListener('click', () => switchView('dashboard'));
  document.getElementById('btn-view-table').addEventListener('click', () => switchView('table'));
  document.getElementById('btn-export').addEventListener('click', exportXLSX);
}

function wireDashboardFilters() {
  ['dash-period','dash-detachment'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => renderDashboard());
  });
}

function wireTableFilters() {
  document.getElementById('table-search').addEventListener('input', () => renderTable());
  document.getElementById('table-detachment').addEventListener('change', () => renderTable());
}

function wireConfirm() {
  document.getElementById('confirm-cancel').addEventListener('click', closeConfirm);
  document.getElementById('confirm-ok').addEventListener('click', () => {
    if (confirmCb) confirmCb();
    closeConfirm();
  });
}

// ─── INIT ───────────────────────────────────────────────────────────
function init() {
  document.body.setAttribute('data-company', currentCompany);
  document.querySelectorAll('.header-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.company === currentCompany);
  });

  wireHeader();
  buildConcernsGrid();
  wireSubmit();
  wireDashboardFilters();
  wireTableFilters();
  wireConfirm();
  renderAuthControl();
  switchView('form');

  startSubmissionsListener();
  startDetachmentsListener();

  // Hide splash after a beat
  setTimeout(() => {
    const s = document.getElementById('splash-screen');
    if (s) s.classList.add('hidden');
    setTimeout(() => { if (s) s.style.display = 'none'; }, 600);
  }, 550);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
