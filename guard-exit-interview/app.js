/* ===================================================================
   Guard Exit Interview Tracker — app.js
   Pure vanilla JS, no frameworks, localStorage persistence
=================================================================== */

// ─── DATA SCHEMA ────────────────────────────────────────────────────
const STORAGE_KEY = 'exit_interview_records';

const SECTIONS = [
  { id: 'guard-info',       label: 'Guard Info',          icon: 'badge' },
  { id: 'exit-reasons',     label: 'Exit Reasons',         icon: 'logout' },
  { id: 'op-stressors',     label: 'Operational Stressors',icon: 'warning_amber' },
  { id: 'supervision',      label: 'Supervision & Power',  icon: 'manage_accounts' },
  { id: 'complaints',       label: 'Complaint Handling',   icon: 'report_problem' },
  { id: 'exit-summary',     label: 'Exit Summary',         icon: 'exit_to_app' },
  { id: 'stay-factors',     label: 'Stay Factors',         icon: 'anchor' },
  { id: 'trust-index',      label: 'Trust Index',          icon: 'verified_user' },
];

const EXIT_REASON_FIELDS = [
  'Financial / Pay', 'Workload / Stress', 'Scheduling Problems',
  'Poor Leadership', 'Culture / Relationships', 'Career Growth',
  'Lack of Recognition', 'Personal / External', 'Safety Concerns',
  'Benefits / HMO', 'Commute / Location',
];
const OP_STRESSOR_FIELDS = [
  'Sudden Schedule Changes', 'Cancelled Rest Days', 'Extended Shifts',
  'Emotional Burnout', 'Physical Exhaustion', 'Feeling Underpaid for Effort',
  'No Proper Breaks',
];
const SUPERVISION_FLAGS = [
  'Public Reprimand', 'Abuse of Authority', 'Coercion',
  'Obstruction of Reporting', 'Favoritism', 'Hostile Environment',
  'Harassment / Bullying',
];
const COMPLAINT_FLAGS = [
  'Agency Protects Guards', 'Fair Investigation', 'Sides with Client Always',
  'Inadequate Support', 'No Experience Handling Complaints',
];
const STAY_FACTOR_FIELDS = [
  'More Predictable Schedule', 'Fairer Supervision', 'Better Recognition',
  'Career Growth Path', 'Transfer to Closer Post', 'Higher Pay', 'Better Benefits',
];
const TRUST_FIELDS = [
  'I felt valued by the agency', 'I trusted management',
  'I felt replaceable / disposable', 'I felt respected at work',
  'I felt safe at work', 'My concerns were heard', 'Policies were applied fairly',
];
const EXIT_TYPE_OPTIONS = ['Resignation','Retirement','Termination','End of Contract','AWOL','Transfer'];
const MAIN_FACTOR_OPTIONS = ['Financial','Scheduling','Leadership','Culture','Career Growth','Recognition','Personal / External','Safety','Benefits','Commute','Other'];
const FREQ_LABELS = ['Never','Sometimes','Often','Very Often'];

function blankRecord(id) {
  const r = { _id: id };
  // Guard Info
  r.fullName = ''; r.age = ''; r.gender = ''; r.rankPosition = '';
  r.detachment = ''; r.lengthOfService = ''; r.typeOfExit = ''; r.dateOfExit = '';
  // Exit Reasons (0-5 scale)
  EXIT_REASON_FIELDS.forEach(f => r[`er_${key(f)}`] = null);
  // Op Stressors (0-3 freq)
  OP_STRESSOR_FIELDS.forEach(f => r[`os_${key(f)}`] = null);
  // Supervision flags (yes/no)
  SUPERVISION_FLAGS.forEach(f => r[`sv_${key(f)}`] = null);
  r.safeToSpeak = '';
  // Complaint flags
  COMPLAINT_FLAGS.forEach(f => r[`cp_${key(f)}`] = null);
  // Exit Summary
  r.mainExitFactor = ''; r.secondaryFactor = ''; r.breakingPoint = ''; r.wouldRecommend = '';
  // Stay Factors
  STAY_FACTOR_FIELDS.forEach(f => r[`sf_${key(f)}`] = null);
  r.otherSuggestions = '';
  // Trust Index (1-5)
  TRUST_FIELDS.forEach(f => r[`ti_${key(f)}`] = null);
  return r;
}

function key(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// ─── STATE ──────────────────────────────────────────────────────────
let records = [];
let activeRecordIdx = 0;
let activeSectionId = 'guard-info';
let currentView = 'form'; // 'form' | 'summary' | 'table'
let stickyNameCol = true;

// ─── INIT ────────────────────────────────────────────────────────────
function init() {
  loadFromStorage();
  buildSectionNav();
  renderAll();

  document.getElementById('btn-new-record').addEventListener('click', addRecord);
  document.getElementById('btn-form-view').addEventListener('click', () => switchView('form'));
  document.getElementById('btn-summary-view').addEventListener('click', () => switchView('summary'));
  document.getElementById('btn-table-view').addEventListener('click', () => switchView('table'));
  document.getElementById('btn-export-csv').addEventListener('click', exportXLSX);
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      records = JSON.parse(raw);
      if (!records.length) records = [blankRecord(0)];
    } else {
      records = [blankRecord(0)];
    }
  } catch {
    records = [blankRecord(0)];
  }
}

function saveToLocalStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  updateHeaderSubtitle();
}

// ─── VIEW SWITCH ─────────────────────────────────────────────────────
function switchView(view) {
  currentView = view;
  document.getElementById('form-view').classList.toggle('hidden', view !== 'form');
  document.getElementById('summary-view').classList.toggle('hidden', view !== 'summary');
  document.getElementById('table-view').classList.toggle('hidden', view !== 'table');
  document.getElementById('btn-form-view').classList.toggle('active-tab', view === 'form');
  document.getElementById('btn-summary-view').classList.toggle('active-tab', view === 'summary');
  document.getElementById('btn-table-view').classList.toggle('active-tab', view === 'table');
  if (view === 'summary') renderSummary();
  if (view === 'table') renderTable();
}

// ─── RENDER ALL ──────────────────────────────────────────────────────
function renderAll() {
  renderRecordList();
  renderFormSection();
  updateHeaderSubtitle();
}

function updateHeaderSubtitle() {
  const completed = records.filter(r => r.fullName && r.fullName.trim()).length;
  document.getElementById('header-subtitle').textContent =
    `${completed} completed · ${records.length} total`;
}

// ─── RECORD LIST ─────────────────────────────────────────────────────
function renderRecordList() {
  const list = document.getElementById('record-list');
  list.innerHTML = '';
  records.forEach((r, i) => {
    const div = document.createElement('div');
    div.className = 'record-item' + (i === activeRecordIdx ? ' active' : '');
    const displayName = (r.fullName && r.fullName.trim()) ? r.fullName.trim() : `Record #${String(i + 1).padStart(4,'0')}`;
    const detStr = r.detachment ? r.detachment : (r.typeOfExit ? r.typeOfExit : '—');
    div.innerHTML = `
      <div class="record-info">
        <div class="record-name">${escHtml(displayName)}</div>
        <div class="record-meta">${escHtml(detStr)}</div>
      </div>
      <span class="record-id-badge">${String(i + 1).padStart(4,'0')}</span>
      ${records.length > 1 ? `<button class="btn-delete-record" data-idx="${i}" title="Delete record"><span class="material-icons">close</span></button>` : ''}
    `;
    div.addEventListener('click', (e) => {
      if (e.target.closest('.btn-delete-record')) return;
      activeRecordIdx = i;
      activeSectionId = 'guard-info';
      renderAll();
    });
    list.appendChild(div);
  });

  // Delete buttons
  list.querySelectorAll('.btn-delete-record').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      confirmDelete(idx);
    });
  });
}

function confirmDelete(idx) {
  const r = records[idx];
  const name = (r.fullName && r.fullName.trim()) ? r.fullName.trim() : `Record #${String(idx + 1).padStart(4,'0')}`;
  showModal(
    'Delete Record?',
    `Are you sure you want to delete "${escHtml(name)}"? This cannot be undone.`,
    () => {
      records.splice(idx, 1);
      if (activeRecordIdx >= records.length) activeRecordIdx = records.length - 1;
      saveToLocalStorage();
      renderAll();
      if (currentView === 'table') renderTable();
    }
  );
}

function addRecord() {
  records.push(blankRecord(records.length));
  activeRecordIdx = records.length - 1;
  activeSectionId = 'guard-info';
  saveToLocalStorage();
  renderAll();
}

// ─── SECTION NAV ─────────────────────────────────────────────────────
function buildSectionNav() {
  const nav = document.getElementById('section-nav');
  nav.innerHTML = '';
  SECTIONS.forEach(sec => {
    const div = document.createElement('div');
    div.className = 'section-nav-item' + (sec.id === activeSectionId ? ' active' : '');
    div.dataset.sectionId = sec.id;
    div.innerHTML = `<span class="material-icons">${sec.icon}</span>${escHtml(sec.label)}`;
    div.addEventListener('click', () => {
      activeSectionId = sec.id;
      document.querySelectorAll('.section-nav-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      renderFormSection();
    });
    nav.appendChild(div);
  });
}

function updateSectionNavActive() {
  document.querySelectorAll('.section-nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.sectionId === activeSectionId);
  });
}

// ─── FORM SECTION RENDERER ───────────────────────────────────────────
function renderFormSection() {
  updateSectionNavActive();
  const container = document.getElementById('form-content');
  container.innerHTML = '';
  const r = records[activeRecordIdx];
  if (!r) return;

  switch (activeSectionId) {
    case 'guard-info':      renderGuardInfo(container, r); break;
    case 'exit-reasons':    renderExitReasons(container, r); break;
    case 'op-stressors':    renderOpStressors(container, r); break;
    case 'supervision':     renderSupervision(container, r); break;
    case 'complaints':      renderComplaints(container, r); break;
    case 'exit-summary':    renderExitSummary(container, r); break;
    case 'stay-factors':    renderStayFactors(container, r); break;
    case 'trust-index':     renderTrustIndex(container, r); break;
  }
}

// ─── SECTION 1: GUARD INFO ───────────────────────────────────────────
function renderGuardInfo(container, r) {
  const card = makeCard('Guard Info', 'badge', 'Basic information about the guard');
  const body = card.querySelector('.form-card-body');

  const grid = makeGrid2();
  grid.appendChild(makeTextField('Full Name', 'fullName', r.fullName, 'text', 'e.g. Juan dela Cruz'));
  grid.appendChild(makeTextField('Age', 'age', r.age, 'number', ''));
  grid.appendChild(makeSelectField('Gender', 'gender', r.gender, ['','Male','Female','Prefer not to say','Other']));
  grid.appendChild(makeTextField('Rank / Position', 'rankPosition', r.rankPosition, 'text', 'e.g. Security Guard I'));
  grid.appendChild(makeTextField('Detachment / Post', 'detachment', r.detachment, 'text', 'e.g. SM North EDSA'));
  grid.appendChild(makeSelectField('Length of Service', 'lengthOfService', r.lengthOfService, ['','Less than 6 months','6–12 months','1–2 years','2–5 years','5–10 years','10+ years']));
  grid.appendChild(makeSelectField('Type of Exit', 'typeOfExit', r.typeOfExit, ['', ...EXIT_TYPE_OPTIONS]));
  grid.appendChild(makeDateField('Date of Exit', 'dateOfExit', r.dateOfExit));

  body.appendChild(grid);
  container.appendChild(card);
  wireTextInputs(container, r);
  wireSelects(container, r);
}

// ─── SECTION 2: EXIT REASONS ─────────────────────────────────────────
function renderExitReasons(container, r) {
  const card = makeCard('Exit Reasons', 'logout', '');
  const body = card.querySelector('.form-card-body');
  body.appendChild(makeNoteBar('info', '0 = Not a factor  |  1 = Minor  |  3 = Moderate  |  5 = Major'));

  EXIT_REASON_FIELDS.forEach(label => {
    const fk = `er_${key(label)}`;
    body.appendChild(makeScaleRow(label, fk, r[fk], [0,1,2,3,4,5], 'btn-scale'));
  });
  container.appendChild(card);
  wireScaleButtons(container, r);
}

// ─── SECTION 3: OP STRESSORS ─────────────────────────────────────────
function renderOpStressors(container, r) {
  const card = makeCard('Operational Stressors', 'warning_amber', '');
  const body = card.querySelector('.form-card-body');
  body.appendChild(makeNoteBar('warning', '0 = Never  |  1 = Sometimes  |  2 = Often  |  3 = Very Often'));

  OP_STRESSOR_FIELDS.forEach(label => {
    const fk = `os_${key(label)}`;
    body.appendChild(makeFreqRow(label, fk, r[fk]));
  });
  container.appendChild(card);
  wireScaleButtons(container, r);
}

// ─── SECTION 4: SUPERVISION ───────────────────────────────────────────
function renderSupervision(container, r) {
  const card = makeCard('Supervision & Power', 'manage_accounts', '');
  const body = card.querySelector('.form-card-body');
  body.appendChild(makeNoteBar('info', 'Mark Yes / No for each item'));

  SUPERVISION_FLAGS.forEach(label => {
    const fk = `sv_${key(label)}`;
    body.appendChild(makeYNRow(label, fk, r[fk]));
  });

  const divider = document.createElement('div');
  divider.className = 'mt-4 pt-4 border-t border-slate-100';
  divider.appendChild(makeSelectField('Safe to Speak Up?', 'safeToSpeak', r.safeToSpeak, ['','Yes','Somewhat','No']));
  body.appendChild(divider);

  container.appendChild(card);
  wireYNButtons(container, r);
  wireSelects(container, r);
}

// ─── SECTION 5: COMPLAINTS ────────────────────────────────────────────
function renderComplaints(container, r) {
  const card = makeCard('Complaint Handling', 'report_problem', '');
  const body = card.querySelector('.form-card-body');
  body.appendChild(makeNoteBar('info', 'Mark Yes / No for each item'));

  COMPLAINT_FLAGS.forEach(label => {
    const fk = `cp_${key(label)}`;
    body.appendChild(makeYNRow(label, fk, r[fk]));
  });
  container.appendChild(card);
  wireYNButtons(container, r);
}

// ─── SECTION 6: EXIT SUMMARY ──────────────────────────────────────────
function renderExitSummary(container, r) {
  const card = makeCard('Exit Summary', 'exit_to_app', '');
  const body = card.querySelector('.form-card-body');
  const grid = makeGrid2();
  grid.appendChild(makeSelectField('Main Exit Factor', 'mainExitFactor', r.mainExitFactor, ['', ...MAIN_FACTOR_OPTIONS]));
  grid.appendChild(makeSelectField('Secondary Factor', 'secondaryFactor', r.secondaryFactor, ['None', ...MAIN_FACTOR_OPTIONS]));
  body.appendChild(grid);
  body.appendChild(makeTextareaField('Breaking Point Event', 'breakingPoint', r.breakingPoint, 'Describe the key event or moment that led to the decision to leave…'));
  body.appendChild(makeSelectField('Would Recommend Agency?', 'wouldRecommend', r.wouldRecommend, ['','Yes','Maybe','No']));
  container.appendChild(card);
  wireTextInputs(container, r);
  wireSelects(container, r);
}

// ─── SECTION 7: STAY FACTORS ─────────────────────────────────────────
function renderStayFactors(container, r) {
  const card = makeCard('Stay Factors', 'anchor', '');
  const body = card.querySelector('.form-card-body');
  body.appendChild(makeNoteBar('lightbulb', 'What could have made the guard stay?'));

  STAY_FACTOR_FIELDS.forEach(label => {
    const fk = `sf_${key(label)}`;
    body.appendChild(makeYNRow(label, fk, r[fk]));
  });

  const divider = document.createElement('div');
  divider.className = 'mt-4 pt-4 border-t border-slate-100';
  divider.appendChild(makeTextareaField('Other Suggestions', 'otherSuggestions', r.otherSuggestions, 'Any additional suggestions from the guard…'));
  body.appendChild(divider);

  container.appendChild(card);
  wireYNButtons(container, r);
  wireTextInputs(container, r);
}

// ─── SECTION 8: TRUST INDEX ───────────────────────────────────────────
function renderTrustIndex(container, r) {
  const card = makeCard('Trust Index', 'verified_user', '');
  const body = card.querySelector('.form-card-body');
  body.appendChild(makeNoteBar('star', '1 = Strongly Disagree  |  5 = Strongly Agree'));

  TRUST_FIELDS.forEach(label => {
    const fk = `ti_${key(label)}`;
    body.appendChild(makeScaleRow(label, fk, r[fk], [1,2,3,4,5], 'btn-trust'));
  });
  container.appendChild(card);
  wireScaleButtons(container, r);
}

// ─── FIELD BUILDERS ──────────────────────────────────────────────────
function makeCard(title, icon, subtitle) {
  const card = document.createElement('div');
  card.className = 'form-card';
  card.innerHTML = `
    <div class="form-section-title"><span class="material-icons">${icon}</span>${escHtml(title)}</div>
    ${subtitle ? `<div class="form-section-subtitle">${escHtml(subtitle)}</div>` : ''}
    <div class="form-card-body"></div>
  `;
  return card;
}

function makeGrid2() {
  const g = document.createElement('div');
  g.className = 'form-grid-2';
  return g;
}

function makeNoteBar(icon, text) {
  const div = document.createElement('div');
  div.className = 'note-bar';
  div.innerHTML = `<span class="material-icons">${icon}</span><span>${escHtml(text)}</span>`;
  return div;
}

function makeTextField(label, fieldKey, value, type = 'text', placeholder = '') {
  const div = document.createElement('div');
  div.className = 'field-group';
  div.innerHTML = `
    <label class="field-label">${escHtml(label)}</label>
    <input type="${type}" class="field-input" data-field="${fieldKey}" value="${escHtml(value||'')}" placeholder="${escHtml(placeholder)}" />
  `;
  return div;
}

function makeDateField(label, fieldKey, value) {
  const div = document.createElement('div');
  div.className = 'field-group';
  div.innerHTML = `
    <label class="field-label">${escHtml(label)}</label>
    <input type="date" class="field-input" data-field="${fieldKey}" value="${escHtml(value||'')}" />
  `;
  return div;
}

function makeSelectField(label, fieldKey, value, options) {
  const div = document.createElement('div');
  div.className = 'field-group';
  const opts = options.map(o => `<option value="${escHtml(o)}" ${o === value ? 'selected' : ''}>${escHtml(o||'— Select —')}</option>`).join('');
  div.innerHTML = `
    <label class="field-label">${escHtml(label)}</label>
    <select class="field-select" data-field="${fieldKey}">${opts}</select>
  `;
  return div;
}

function makeTextareaField(label, fieldKey, value, placeholder = '') {
  const div = document.createElement('div');
  div.className = 'field-group';
  div.innerHTML = `
    <label class="field-label">${escHtml(label)}</label>
    <textarea class="field-textarea" data-field="${fieldKey}" placeholder="${escHtml(placeholder)}">${escHtml(value||'')}</textarea>
  `;
  return div;
}

function makeScaleRow(label, fieldKey, currentVal, values, btnClass) {
  const row = document.createElement('div');
  row.className = 'scale-row';
  const btns = values.map(v =>
    `<button class="${btnClass} ${currentVal === v ? 'active' : ''}" data-field="${fieldKey}" data-val="${v}">${v}</button>`
  ).join('');
  row.innerHTML = `
    <span class="scale-row-label">${escHtml(label)}</span>
    <div class="btn-group">${btns}</div>
  `;
  return row;
}

function makeFreqRow(label, fieldKey, currentVal) {
  const row = document.createElement('div');
  row.className = 'scale-row';
  const btns = FREQ_LABELS.map((fl, i) =>
    `<button class="btn-freq ${currentVal === i ? 'active' : ''}" data-field="${fieldKey}" data-val="${i}">${escHtml(fl)}</button>`
  ).join('');
  row.innerHTML = `
    <span class="scale-row-label">${escHtml(label)}</span>
    <div class="btn-group">${btns}</div>
  `;
  return row;
}

function makeYNRow(label, fieldKey, currentVal) {
  const row = document.createElement('div');
  row.className = 'scale-row';
  row.innerHTML = `
    <span class="scale-row-label">${escHtml(label)}</span>
    <div class="btn-group">
      <button class="btn-yn yes ${currentVal === true ? 'active' : ''}" data-field="${fieldKey}" data-val="true">Yes</button>
      <button class="btn-yn no ${currentVal === false ? 'active' : ''}" data-field="${fieldKey}" data-val="false">No</button>
    </div>
  `;
  return row;
}

// ─── WIRE EVENTS ─────────────────────────────────────────────────────
function wireTextInputs(container, r) {
  container.querySelectorAll('input[data-field], textarea[data-field]').forEach(el => {
    el.addEventListener('input', () => {
      r[el.dataset.field] = el.value;
      saveToLocalStorage();
      renderRecordList();
    });
  });
}

function wireSelects(container, r) {
  container.querySelectorAll('select[data-field]').forEach(el => {
    el.addEventListener('change', () => {
      r[el.dataset.field] = el.value;
      saveToLocalStorage();
      renderRecordList();
    });
  });
}

function wireScaleButtons(container, r) {
  container.querySelectorAll('button[data-field][data-val]').forEach(btn => {
    btn.addEventListener('click', () => {
      const fk = btn.dataset.field;
      const val = parseFloat(btn.dataset.val);
      r[fk] = val;
      // Update active state among siblings
      const siblings = container.querySelectorAll(`button[data-field="${fk}"]`);
      siblings.forEach(s => s.classList.toggle('active', parseFloat(s.dataset.val) === val));
      saveToLocalStorage();
    });
  });
}

function wireYNButtons(container, r) {
  container.querySelectorAll('.btn-yn').forEach(btn => {
    btn.addEventListener('click', () => {
      const fk = btn.dataset.field;
      const val = btn.dataset.val === 'true';
      r[fk] = val;
      const siblings = container.querySelectorAll(`button.btn-yn[data-field="${fk}"]`);
      siblings.forEach(s => {
        const sv = s.dataset.val === 'true';
        s.classList.toggle('active', sv === val);
      });
      saveToLocalStorage();
    });
  });
}

// ─── TABLE VIEW ──────────────────────────────────────────────────────

/*
  Column schema — each entry describes one column in the table.
  type: 'text' | 'number' | 'date' | 'select' | 'scale-er' | 'scale-ti' | 'freq' | 'yn' | 'textarea'
  field: key on the record object
  label: short column header
  width: px (used as min-width)
  options: for select type
*/
const TABLE_COLUMNS = [
  // ── Guard Info ───────────────────────────────────────────
  { group: 'Guard Info', field: 'fullName',       label: 'Full Name',    type: 'text',   width: 150 },
  { group: 'Guard Info', field: 'age',            label: 'Age',          type: 'number', width: 52  },
  { group: 'Guard Info', field: 'gender',         label: 'Gender',       type: 'select', width: 90,
    options: ['','Male','Female','Prefer not to say','Other'] },
  { group: 'Guard Info', field: 'rankPosition',   label: 'Rank/Position',type: 'text',   width: 120 },
  { group: 'Guard Info', field: 'detachment',     label: 'Detachment',   type: 'text',   width: 120 },
  { group: 'Guard Info', field: 'lengthOfService',label: 'Tenure',       type: 'select', width: 110,
    options: ['','Less than 6 months','6–12 months','1–2 years','2–5 years','5–10 years','10+ years'] },
  { group: 'Guard Info', field: 'typeOfExit',     label: 'Exit Type',    type: 'select', width: 110,
    options: ['', ...EXIT_TYPE_OPTIONS] },
  { group: 'Guard Info', field: 'dateOfExit',     label: 'Exit Date',    type: 'date',   width: 110 },
  // ── Exit Reasons ─────────────────────────────────────────
  ...EXIT_REASON_FIELDS.map(f => ({
    group: 'Exit Reasons', field: `er_${key(f)}`, label: f, type: 'scale-er', width: 60,
  })),
  // ── Operational Stressors ────────────────────────────────
  ...OP_STRESSOR_FIELDS.map(f => ({
    group: 'Stressors', field: `os_${key(f)}`, label: f, type: 'freq', width: 96,
  })),
  // ── Supervision Flags ────────────────────────────────────
  ...SUPERVISION_FLAGS.map(f => ({
    group: 'Supervision', field: `sv_${key(f)}`, label: f, type: 'yn', width: 64,
  })),
  { group: 'Supervision', field: 'safeToSpeak', label: 'Safe to Speak', type: 'select', width: 90,
    options: ['','Yes','Somewhat','No'] },
  // ── Complaint Handling ───────────────────────────────────
  ...COMPLAINT_FLAGS.map(f => ({
    group: 'Complaints', field: `cp_${key(f)}`, label: f, type: 'yn', width: 64,
  })),
  // ── Exit Summary ─────────────────────────────────────────
  { group: 'Exit Summary', field: 'mainExitFactor',  label: 'Main Factor',   type: 'select', width: 110,
    options: ['', ...MAIN_FACTOR_OPTIONS] },
  { group: 'Exit Summary', field: 'secondaryFactor', label: 'Secondary',     type: 'select', width: 110,
    options: ['None', ...MAIN_FACTOR_OPTIONS] },
  { group: 'Exit Summary', field: 'breakingPoint',   label: 'Breaking Point',type: 'textarea', width: 160 },
  { group: 'Exit Summary', field: 'wouldRecommend',  label: 'Recommend?',    type: 'select', width: 88,
    options: ['','Yes','Maybe','No'] },
  // ── Stay Factors ─────────────────────────────────────────
  ...STAY_FACTOR_FIELDS.map(f => ({
    group: 'Stay Factors', field: `sf_${key(f)}`, label: f, type: 'yn', width: 64,
  })),
  { group: 'Stay Factors', field: 'otherSuggestions', label: 'Suggestions', type: 'textarea', width: 140 },
  // ── Trust Index ──────────────────────────────────────────
  ...TRUST_FIELDS.map(f => ({
    group: 'Trust Index', field: `ti_${key(f)}`, label: f, type: 'scale-ti', width: 60,
  })),
];

// Group spans — computed once
const TABLE_GROUPS = (() => {
  const groups = [];
  TABLE_COLUMNS.forEach(col => {
    const last = groups[groups.length - 1];
    if (last && last.name === col.group) {
      last.span++;
    } else {
      groups.push({ name: col.group, span: 1 });
    }
  });
  return groups;
})();

// Group background colors
const GROUP_COLORS = {
  'Guard Info':    '#1e3a5f',
  'Exit Reasons':  '#7f1d1d',
  'Stressors':     '#78350f',
  'Supervision':   '#3b0764',
  'Complaints':    '#164e63',
  'Exit Summary':  '#14532d',
  'Stay Factors':  '#1e3a5f',
  'Trust Index':   '#4a1d96',
};

function renderTable() {
  const toolbar = document.getElementById('table-toolbar');
  const content = document.getElementById('table-content');

  // ── Toolbar ────────────────────────────────────────────
  toolbar.innerHTML = '';
  const info = document.createElement('div');
  info.className = 'table-toolbar-info';
  info.innerHTML = `
    <span class="material-icons">table_view</span>
    <span><strong>${records.length}</strong> records · <strong>${records.filter(r => r.fullName && r.fullName.trim()).length}</strong> completed</span>
    <span style="color:#cbd5e1;">·</span>
    <span style="color:#94a3b8;">Click any cell to edit. Changes save instantly.</span>
  `;
  const stickyBtn = document.createElement('button');
  stickyBtn.className = 'btn-sticky-toggle' + (stickyNameCol ? ' pinned' : '');
  stickyBtn.innerHTML = `<span class="material-icons">push_pin</span> ${stickyNameCol ? 'Unpin' : 'Pin'} Name`;
  stickyBtn.title = 'Toggle sticky Full Name column';
  stickyBtn.addEventListener('click', () => {
    stickyNameCol = !stickyNameCol;
    renderTable();
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'btn-table-add';
  addBtn.innerHTML = '<span class="material-icons">add</span> New Record';
  addBtn.addEventListener('click', () => {
    addRecord();
    renderTable();
  });
  toolbar.appendChild(info);
  toolbar.appendChild(stickyBtn);
  toolbar.appendChild(addBtn);

  // ── Table ──────────────────────────────────────────────
  content.innerHTML = '';
  const table = document.createElement('table');
  table.className = 'data-table';

  // Group header row
  const groupTr = document.createElement('tr');
  groupTr.className = 'group-header';
  // ID + Actions sticky cells
  const thIdG = document.createElement('th');
  thIdG.className = 'sticky-col col-id';
  thIdG.style.background = '#0f172a';
  thIdG.textContent = '#';
  groupTr.appendChild(thIdG);

  const thActG = document.createElement('th');
  thActG.style.cssText = 'background:#0f172a;position:sticky;top:0;z-index:20;width:28px;min-width:28px;';
  groupTr.appendChild(thActG);

  TABLE_GROUPS.forEach(g => {
    const th = document.createElement('th');
    th.colSpan = g.span;
    th.textContent = g.name;
    th.style.background = GROUP_COLORS[g.name] || '#1e3a5f';
    groupTr.appendChild(th);
  });

  // Field header row
  const fieldTr = document.createElement('tr');
  fieldTr.className = 'field-header';
  const thIdF = document.createElement('th');
  thIdF.className = 'sticky-col col-id';
  thIdF.textContent = 'ID';
  fieldTr.appendChild(thIdF);
  const thActF = document.createElement('th');
  thActF.style.cssText = 'width:28px;min-width:28px;position:sticky;top:27px;z-index:19;background:#f1f5f9;border-bottom:2px solid #cbd5e1;border-right:1px solid #e2e8f0;';
  fieldTr.appendChild(thActF);

  TABLE_COLUMNS.forEach((col, ci) => {
    const th = document.createElement('th');
    th.title = col.label;
    th.style.minWidth = col.width + 'px';
    th.textContent = col.label;
    if (col.field === 'fullName' && stickyNameCol) th.classList.add('sticky-col', 'col-name');
    // Mark last col in each group for divider
    const nextCol = TABLE_COLUMNS[ci + 1];
    if (!nextCol || nextCol.group !== col.group) th.style.borderRight = '2px solid #cbd5e1';
    fieldTr.appendChild(th);
  });

  const thead = document.createElement('thead');
  thead.appendChild(groupTr);
  thead.appendChild(fieldTr);
  table.appendChild(thead);

  // Body rows
  const tbody = document.createElement('tbody');
  records.forEach((r, rowIdx) => {
    const tr = document.createElement('tr');
    if (rowIdx === activeRecordIdx) tr.classList.add('active-row');

    // ID cell — click to jump to form
    const tdId = document.createElement('td');
    tdId.className = 'sticky-col col-id td-id';
    tdId.textContent = String(rowIdx + 1).padStart(4, '0');
    tdId.title = 'Click to open in Form view';
    tdId.addEventListener('click', () => {
      activeRecordIdx = rowIdx;
      activeSectionId = 'guard-info';
      switchView('form');
    });
    tr.appendChild(tdId);

    // Delete button cell
    const tdDel = document.createElement('td');
    tdDel.style.cssText = 'text-align:center;padding:2px;';
    if (records.length > 1) {
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-row-delete';
      delBtn.title = 'Delete record';
      delBtn.innerHTML = '<span class="material-icons">close</span>';
      delBtn.addEventListener('click', () => confirmDelete(rowIdx));
      tdDel.appendChild(delBtn);
    }
    tr.appendChild(tdDel);

    // Data cells
    TABLE_COLUMNS.forEach((col, ci) => {
      const td = document.createElement('td');
      if (col.field === 'fullName' && stickyNameCol) td.classList.add('sticky-col', 'col-name');
      const nextCol = TABLE_COLUMNS[ci + 1];
      if (!nextCol || nextCol.group !== col.group) td.classList.add('section-divider');

      td.appendChild(buildTableCell(col, r, rowIdx));
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  content.appendChild(table);
}

function buildTableCell(col, r, rowIdx) {
  const val = r[col.field];

  if (col.type === 'scale-er') {
    const sel = document.createElement('select');
    sel.className = 'td-scale-select scale-er-' + (val !== null && val !== undefined ? val : 'null');
    [['—', ''], ...[[0,'0'],[1,'1'],[2,'2'],[3,'3'],[4,'4'],[5,'5']]].forEach(([label, v]) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = label;
      if (String(val) === v) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      r[col.field] = sel.value === '' ? null : parseFloat(sel.value);
      sel.className = 'td-scale-select scale-er-' + (sel.value === '' ? 'null' : sel.value);
      saveToLocalStorage();
      updateTableRowHighlight(rowIdx);
    });
    return sel;
  }

  if (col.type === 'scale-ti') {
    const sel = document.createElement('select');
    sel.className = 'td-scale-select scale-ti-' + (val !== null && val !== undefined ? val : 'null');
    [['—', ''], ...[[1,'1'],[2,'2'],[3,'3'],[4,'4'],[5,'5']]].forEach(([label, v]) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = label;
      if (String(val) === v) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      r[col.field] = sel.value === '' ? null : parseFloat(sel.value);
      sel.className = 'td-scale-select scale-ti-' + (sel.value === '' ? 'null' : sel.value);
      saveToLocalStorage();
    });
    return sel;
  }

  if (col.type === 'freq') {
    const FREQ_SHORT = ['Never', 'Smetms', 'Often', 'V.Often'];
    const sel = document.createElement('select');
    sel.className = 'td-freq-select scale-freq-' + (val !== null && val !== undefined ? val : 'null');
    sel.title = val !== null && val !== undefined ? FREQ_LABELS[val] : '—';
    [['—', ''], ...FREQ_SHORT.map((l, i) => [l, String(i)])].forEach(([label, v]) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = label;
      if (String(val) === v) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      r[col.field] = sel.value === '' ? null : parseInt(sel.value);
      sel.className = 'td-freq-select scale-freq-' + (sel.value === '' ? 'null' : sel.value);
      sel.title = sel.value !== '' ? FREQ_LABELS[parseInt(sel.value)] : '—';
      saveToLocalStorage();
    });
    return sel;
  }

  if (col.type === 'yn') {
    const ynClass = val === true ? 'yn-yes' : val === false ? 'yn-no' : 'yn-null';
    const sel = document.createElement('select');
    sel.className = 'td-yn-select ' + ynClass;
    [['—', ''],['Yes','true'],['No','false']].forEach(([label, v]) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = label;
      if ((val === true && v === 'true') || (val === false && v === 'false') || (val === null && v === '')) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      r[col.field] = sel.value === '' ? null : sel.value === 'true';
      sel.className = 'td-yn-select ' + (sel.value === 'true' ? 'yn-yes' : sel.value === 'false' ? 'yn-no' : 'yn-null');
      saveToLocalStorage();
    });
    return sel;
  }

  if (col.type === 'select') {
    const sel = document.createElement('select');
    sel.className = 'td-select';
    sel.style.minWidth = col.width + 'px';
    // Recommend coloring
    if (col.field === 'wouldRecommend') {
      sel.style.fontWeight = '700';
      if (val === 'Yes') sel.style.color = '#14532d';
      else if (val === 'No') sel.style.color = '#991b1b';
      else if (val === 'Maybe') sel.style.color = '#92400e';
    }
    col.options.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt || '—';
      if (opt === val) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      r[col.field] = sel.value;
      if (col.field === 'wouldRecommend') {
        sel.style.color = sel.value === 'Yes' ? '#14532d' : sel.value === 'No' ? '#991b1b' : sel.value === 'Maybe' ? '#92400e' : '';
      }
      saveToLocalStorage();
      if (col.field === 'typeOfExit' || col.field === 'detachment') renderRecordList();
    });
    return sel;
  }

  if (col.type === 'textarea') {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'td-input';
    inp.style.minWidth = col.width + 'px';
    inp.value = val || '';
    inp.placeholder = '…';
    inp.title = val || '';
    inp.addEventListener('input', () => {
      r[col.field] = inp.value;
      inp.title = inp.value;
      saveToLocalStorage();
    });
    return inp;
  }

  // text / number / date
  const inp = document.createElement('input');
  inp.type = col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text';
  inp.className = 'td-input';
  inp.style.minWidth = col.width + 'px';
  inp.value = val || '';
  if (col.field === 'fullName') inp.style.fontWeight = '600';
  inp.addEventListener('input', () => {
    r[col.field] = inp.value;
    saveToLocalStorage();
    if (col.field === 'fullName') {
      renderRecordList();
      updateTableRowHighlight(rowIdx);
    }
  });
  return inp;
}

function updateTableRowHighlight(rowIdx) {
  // refresh ID cell text in case name changed
  const rows = document.querySelectorAll('#table-content tbody tr');
  if (rows[rowIdx]) {
    const idCell = rows[rowIdx].querySelector('.td-id');
    if (idCell) idCell.textContent = String(rowIdx + 1).padStart(4, '0');
  }
  updateHeaderSubtitle();
}

// ─── SUMMARY VIEW ────────────────────────────────────────────────────
function renderSummary() {
  const container = document.getElementById('summary-content');
  container.innerHTML = '';

  const completed = records.filter(r => r.fullName && r.fullName.trim());

  // ── KPI Row ──
  container.appendChild(renderKPIs(completed));

  // ── Charts ──
  container.appendChild(renderExitReasonsChart(completed));
  container.appendChild(renderExitTypeChart(completed));
  container.appendChild(renderTrustIndexChart(completed));
  container.appendChild(renderOpStressorsChart(completed));
  container.appendChild(renderSupervisionChart(completed));
  container.appendChild(renderStayFactorsChart(completed));
  container.appendChild(renderServiceLengthChart(completed));
  container.appendChild(renderRecommendChart(completed));

  // Animate bars after DOM is inserted
  requestAnimationFrame(() => {
    container.querySelectorAll('.bar-fill[data-pct]').forEach(el => {
      el.style.width = el.dataset.pct + '%';
    });
    container.querySelectorAll('.donut-segment[data-deg]').forEach(el => {
      el.style.setProperty('--seg-deg', el.dataset.deg + 'deg');
    });
  });
}

// ─── KPI CARDS ───────────────────────────────────────────────────────
function renderKPIs(completed) {
  const all = records;
  const factors = completed.map(r => r.mainExitFactor).filter(Boolean);
  const topFactor = factors.length ? mode(factors) : '—';
  const trustScores = completed.flatMap(r =>
    TRUST_FIELDS.map(f => r[`ti_${key(f)}`]).filter(v => v !== null)
  );
  const avgTrust = trustScores.length ? (trustScores.reduce((a, b) => a + b, 0) / trustScores.length).toFixed(2) : '—';

  const grid = document.createElement('div');
  grid.className = 'kpi-grid';
  grid.innerHTML = `
    ${kpiCard('Total Records', all.length, '')}
    ${kpiCard('Completed', completed.length, `${all.length ? Math.round(completed.length/all.length*100) : 0}% completion rate`)}
    ${kpiCard('Top Exit Factor', topFactor, 'Most cited main factor')}
    ${kpiCard('Avg Trust Score', avgTrust, 'Average across all Trust Index fields')}
  `;
  return grid;
}

function kpiCard(label, value, sub) {
  return `<div class="kpi-card">
    <div class="kpi-label">${escHtml(label)}</div>
    <div class="kpi-value">${escHtml(String(value))}</div>
    ${sub ? `<div class="kpi-sub">${escHtml(sub)}</div>` : ''}
  </div>`;
}

// ─── CHART: EXIT REASONS (horizontal bars, ranked) ────────────────────
function renderExitReasonsChart(completed) {
  const section = makeSummarySection('Top Exit Reasons', 'logout', 'Total severity score across all guards (0–5 scale per guard)');

  const scores = EXIT_REASON_FIELDS.map(label => {
    const fk = `er_${key(label)}`;
    const vals = completed.map(r => r[fk]).filter(v => v !== null);
    const total = vals.reduce((a, b) => a + b, 0);
    const guardCount = vals.length;
    return { label, total, guardCount };
  }).sort((a, b) => b.total - a.total);

  const maxScore = scores[0]?.total || 1;

  if (!completed.length) { section.appendChild(emptyState()); return section; }

  scores.forEach((s, i) => {
    const pct = Math.round(s.total / maxScore * 100);
    // Color by severity
    const colorClass = pct >= 75 ? 'bar-fill-red' : pct >= 45 ? 'bar-fill-orange' : 'bar-fill-blue';
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <span class="bar-rank">#${i+1}</span>
      <span class="bar-label">${escHtml(s.label)}</span>
      <div class="bar-track"><div class="bar-fill ${colorClass}" data-pct="${pct}" style="width:0%"></div></div>
      <span class="bar-meta">${s.guardCount} guards · ${s.total} pts</span>
    `;
    section.appendChild(row);
  });
  return section;
}

// ─── CHART: EXIT TYPE DISTRIBUTION (donut + cards) ────────────────────
function renderExitTypeChart(completed) {
  const section = makeSummarySection('Exit Type Distribution', 'donut_large', 'Breakdown of how guards exited');

  if (!completed.length) { section.appendChild(emptyState()); return section; }

  const counts = {};
  EXIT_TYPE_OPTIONS.forEach(t => counts[t] = 0);
  completed.forEach(r => { if (r.typeOfExit) counts[r.typeOfExit] = (counts[r.typeOfExit] || 0) + 1; });

  const total = completed.length;
  const COLORS = ['#3b82f6','#22c55e','#ef4444','#f59e0b','#8b5cf6','#06b6d4'];

  // Donut chart (CSS conic-gradient)
  const wrapper = document.createElement('div');
  wrapper.className = 'flex flex-col md:flex-row gap-6 items-center';

  // Build conic gradient
  let deg = 0;
  const segments = EXIT_TYPE_OPTIONS.map((t, i) => {
    const pct = total ? counts[t] / total * 100 : 0;
    const start = deg;
    deg += pct * 3.6;
    return { label: t, count: counts[t], pct, color: COLORS[i], start, end: deg };
  }).filter(s => s.count > 0);

  const gradParts = segments.map(s => `${s.color} ${s.start.toFixed(1)}deg ${s.end.toFixed(1)}deg`).join(', ');

  const donutWrap = document.createElement('div');
  donutWrap.className = 'flex-shrink-0 flex flex-col items-center gap-3';
  donutWrap.innerHTML = `
    <div style="
      width:160px; height:160px; border-radius:50%;
      background: conic-gradient(${gradParts});
      position:relative;
    ">
      <div style="
        position:absolute; inset:30px; border-radius:50%;
        background:#fff; display:flex; flex-direction:column;
        align-items:center; justify-content:center;
      ">
        <span style="font-size:22px;font-weight:700;color:#1e293b;">${total}</span>
        <span style="font-size:11px;color:#94a3b8;">guards</span>
      </div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:200px;">
      ${segments.map(s => `
        <div style="display:flex;align-items:center;gap:4px;font-size:11px;color:#374151;">
          <span style="width:10px;height:10px;border-radius:50%;background:${s.color};flex-shrink:0;display:inline-block;"></span>
          ${escHtml(s.label)}
        </div>
      `).join('')}
    </div>
  `;

  const cardsGrid = document.createElement('div');
  cardsGrid.className = 'exit-type-grid flex-1';
  EXIT_TYPE_OPTIONS.forEach((t, i) => {
    const card = document.createElement('div');
    card.className = 'exit-type-card';
    card.style.borderColor = COLORS[i] + '55';
    const pct = total ? Math.round(counts[t] / total * 100) : 0;
    card.innerHTML = `
      <div class="et-count" style="color:${COLORS[i]}">${counts[t]}</div>
      <div class="et-label">${escHtml(t)}</div>
      <div style="font-size:10.5px;color:#94a3b8;margin-top:2px;">${pct}% of total</div>
    `;
    cardsGrid.appendChild(card);
  });

  wrapper.appendChild(donutWrap);
  wrapper.appendChild(cardsGrid);
  section.appendChild(wrapper);
  return section;
}

// ─── CHART: TRUST INDEX (horizontal bars + avg score indicators) ──────
function renderTrustIndexChart(completed) {
  const section = makeSummarySection('Trust Index Averages', 'verified_user', 'Average agreement score per statement (1–5 scale)');

  if (!completed.length) { section.appendChild(emptyState()); return section; }

  const avgs = TRUST_FIELDS.map(label => {
    const fk = `ti_${key(label)}`;
    const vals = completed.map(r => r[fk]).filter(v => v !== null);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return { label, avg: +avg.toFixed(2), count: vals.length };
  });

  // Overall trust gauge
  const allVals = avgs.filter(a => a.count > 0);
  if (allVals.length) {
    const overallAvg = allVals.reduce((a, b) => a + b.avg, 0) / allVals.length;
    const gaugeColor = overallAvg >= 4 ? '#22c55e' : overallAvg >= 3 ? '#f59e0b' : '#ef4444';
    const gaugeLabel = overallAvg >= 4 ? 'High Trust' : overallAvg >= 3 ? 'Moderate Trust' : 'Low Trust';
    const gaugePct = (overallAvg - 1) / 4 * 100;

    const gauge = document.createElement('div');
    gauge.className = 'mb-5 p-4 rounded-lg border border-slate-100 flex items-center gap-4';
    gauge.innerHTML = `
      <div style="text-align:center;flex-shrink:0;">
        <div style="font-size:32px;font-weight:800;color:${gaugeColor}">${overallAvg.toFixed(2)}</div>
        <div style="font-size:11.5px;font-weight:600;color:${gaugeColor}">${escHtml(gaugeLabel)}</div>
        <div style="font-size:11px;color:#94a3b8;">out of 5</div>
      </div>
      <div style="flex:1;">
        <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Overall Trust Score</div>
        <div class="bar-track" style="height:14px;border-radius:999px;">
          <div class="bar-fill" style="background:${gaugeColor};height:100%;border-radius:999px;transition:width 0.4s ease;width:0%" data-pct="${Math.round(gaugePct)}"></div>
        </div>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px;">Based on ${allVals.length} indicators</div>
      </div>
    `;
    section.appendChild(gauge);
  }

  avgs.forEach(a => {
    const pct = a.avg / 5 * 100;
    const color = a.avg >= 4 ? '#8b5cf6' : a.avg >= 3 ? '#a78bfa' : '#c4b5fd';
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <span class="bar-label" style="width:240px">${escHtml(a.label)}</span>
      <div class="bar-track"><div class="bar-fill" style="background:${color};width:0%" data-pct="${Math.round(pct)}"></div></div>
      <span class="bar-meta">${a.avg > 0 ? a.avg : '—'} / 5</span>
    `;
    section.appendChild(row);
  });
  return section;
}

// ─── CHART: OPERATIONAL STRESSORS (stacked frequency bars) ───────────
function renderOpStressorsChart(completed) {
  const section = makeSummarySection('Operational Stressors', 'warning_amber', 'Frequency of each stressor across all guards');

  if (!completed.length) { section.appendChild(emptyState()); return section; }

  const freqColors = ['#e2e8f0','#fbbf24','#f97316','#ef4444'];
  const freqLabels = ['Never','Sometimes','Often','Very Often'];

  // Legend
  const legend = document.createElement('div');
  legend.className = 'flex gap-4 mb-4 flex-wrap';
  legend.innerHTML = freqLabels.map((l, i) =>
    `<div class="flex items-center gap-1.5 text-xs text-slate-600">
      <span style="width:12px;height:12px;border-radius:3px;background:${freqColors[i]};display:inline-block;"></span>${l}
    </div>`
  ).join('');
  section.appendChild(legend);

  OP_STRESSOR_FIELDS.forEach(label => {
    const fk = `os_${key(label)}`;
    const vals = completed.map(r => r[fk]).filter(v => v !== null);
    if (!vals.length) return;

    const counts = [0,1,2,3].map(i => vals.filter(v => v === i).length);
    const total = vals.length;

    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom:10px;';
    const labelEl = document.createElement('div');
    labelEl.style.cssText = 'font-size:12.5px;font-weight:500;color:#374151;margin-bottom:4px;';
    labelEl.textContent = label;

    const stackTrack = document.createElement('div');
    stackTrack.style.cssText = 'display:flex;height:22px;border-radius:6px;overflow:hidden;gap:1px;';

    counts.forEach((c, i) => {
      const pct = total ? c / total * 100 : 0;
      if (pct === 0) return;
      const seg = document.createElement('div');
      seg.style.cssText = `background:${freqColors[i]};width:0%;transition:width 0.4s ease;display:flex;align-items:center;justify-content:center;`;
      seg.dataset.pct = pct.toFixed(1);
      if (pct > 8) {
        seg.innerHTML = `<span style="font-size:10px;font-weight:700;color:${i < 1 ? '#64748b' : '#fff'};">${c}</span>`;
      }
      stackTrack.appendChild(seg);
    });

    const metaEl = document.createElement('div');
    metaEl.style.cssText = 'font-size:11px;color:#94a3b8;margin-top:3px;';
    const worstPct = total ? Math.round(counts[3] / total * 100) : 0;
    metaEl.textContent = `${total} responses · ${worstPct}% Very Often`;

    row.appendChild(labelEl);
    row.appendChild(stackTrack);
    row.appendChild(metaEl);
    section.appendChild(row);

    // Animate stacked bars
    requestAnimationFrame(() => {
      stackTrack.querySelectorAll('[data-pct]').forEach(el => {
        setTimeout(() => { el.style.width = el.dataset.pct + '%'; }, 50);
      });
    });
  });

  return section;
}

// ─── CHART: SUPERVISION FLAGS ─────────────────────────────────────────
function renderSupervisionChart(completed) {
  const section = makeSummarySection('Supervision & Power Flags', 'manage_accounts', 'Number of guards who reported each issue (Yes responses)');

  if (!completed.length) { section.appendChild(emptyState()); return section; }

  const data = SUPERVISION_FLAGS.map(label => {
    const fk = `sv_${key(label)}`;
    const yesCount = completed.filter(r => r[fk] === true).length;
    return { label, count: yesCount };
  }).sort((a, b) => b.count - a.count);

  const maxCount = data[0]?.count || 1;
  const total = completed.length;

  // Risk indicator
  const totalFlags = data.reduce((s, d) => s + d.count, 0);
  const avgFlagsPerGuard = total ? (totalFlags / total).toFixed(1) : 0;
  const riskLevel = avgFlagsPerGuard >= 3 ? { label: 'HIGH RISK', color: '#ef4444' } :
                    avgFlagsPerGuard >= 1.5 ? { label: 'MODERATE', color: '#f59e0b' } :
                    { label: 'LOW', color: '#22c55e' };
  const alertDiv = document.createElement('div');
  alertDiv.className = 'mb-4 p-3 rounded-lg flex items-center gap-3';
  alertDiv.style.cssText = `background:${riskLevel.color}15;border:1px solid ${riskLevel.color}40;`;
  alertDiv.innerHTML = `
    <span class="material-icons" style="color:${riskLevel.color};font-size:20px;">flag</span>
    <div>
      <div style="font-size:12.5px;font-weight:700;color:${riskLevel.color}">${riskLevel.label} supervision risk</div>
      <div style="font-size:11.5px;color:#64748b;">${avgFlagsPerGuard} avg flags per guard across ${total} records</div>
    </div>
  `;
  section.appendChild(alertDiv);

  data.forEach(d => {
    const pct = Math.round(d.count / maxCount * 100);
    const guardPct = total ? Math.round(d.count / total * 100) : 0;
    const barColor = guardPct >= 50 ? '#ef4444' : guardPct >= 25 ? '#f97316' : '#f59e0b';
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <span class="bar-label">${escHtml(d.label)}</span>
      <div class="bar-track"><div class="bar-fill" style="background:${barColor};width:0%" data-pct="${pct}"></div></div>
      <span class="bar-meta">${d.count} / ${total} (${guardPct}%)</span>
    `;
    section.appendChild(row);
  });

  return section;
}

// ─── CHART: STAY FACTORS ──────────────────────────────────────────────
function renderStayFactorsChart(completed) {
  const section = makeSummarySection('Stay Factors', 'anchor', 'What could have made the guard stay?');

  if (!completed.length) { section.appendChild(emptyState()); return section; }

  const data = STAY_FACTOR_FIELDS.map(label => {
    const fk = `sf_${key(label)}`;
    const yesCount = completed.filter(r => r[fk] === true).length;
    return { label, count: yesCount };
  }).sort((a, b) => b.count - a.count);

  const maxCount = data[0]?.count || 1;
  const total = completed.length;

  data.forEach(d => {
    const pct = Math.round(d.count / maxCount * 100);
    const guardPct = total ? Math.round(d.count / total * 100) : 0;
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <span class="bar-label">${escHtml(d.label)}</span>
      <div class="bar-track"><div class="bar-fill bar-fill-green" style="width:0%" data-pct="${pct}"></div></div>
      <span class="bar-meta">${d.count} / ${total} (${guardPct}%)</span>
    `;
    section.appendChild(row);
  });

  return section;
}

// ─── CHART: SERVICE LENGTH DISTRIBUTION ──────────────────────────────
function renderServiceLengthChart(completed) {
  const section = makeSummarySection('Length of Service at Exit', 'schedule', 'When do guards tend to leave?');

  if (!completed.length) { section.appendChild(emptyState()); return section; }

  const options = ['Less than 6 months','6–12 months','1–2 years','2–5 years','5–10 years','10+ years'];
  const counts = {};
  options.forEach(o => counts[o] = 0);
  completed.forEach(r => { if (r.lengthOfService) counts[r.lengthOfService] = (counts[r.lengthOfService] || 0) + 1; });

  const total = completed.length;
  const maxCount = Math.max(...Object.values(counts), 1);

  const TENURE_COLORS = ['#ef4444','#f97316','#f59e0b','#22c55e','#3b82f6','#8b5cf6'];
  options.forEach((o, i) => {
    const c = counts[o];
    const pct = Math.round(c / maxCount * 100);
    const guardPct = total ? Math.round(c / total * 100) : 0;
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <span class="bar-label">${escHtml(o)}</span>
      <div class="bar-track"><div class="bar-fill" style="background:${TENURE_COLORS[i]};width:0%" data-pct="${pct}"></div></div>
      <span class="bar-meta">${c} guards (${guardPct}%)</span>
    `;
    section.appendChild(row);
  });

  // Insight: most common departure window
  const topTenure = options.reduce((a, b) => counts[a] >= counts[b] ? a : b);
  if (counts[topTenure] > 0) {
    const insight = document.createElement('div');
    insight.className = 'mt-4 p-3 rounded-lg bg-blue-50 border border-blue-100 text-sm text-blue-800';
    insight.innerHTML = `<span class="font-semibold">Insight:</span> Most guards leave during the <strong>${escHtml(topTenure)}</strong> tenure window (${counts[topTenure]} guard${counts[topTenure] > 1 ? 's' : ''}).`;
    section.appendChild(insight);
  }

  return section;
}

// ─── CHART: WOULD RECOMMEND (donut + breakdown) ───────────────────────
function renderRecommendChart(completed) {
  const section = makeSummarySection('Would Recommend Agency?', 'thumb_up', 'Guard advocacy and satisfaction indicator');

  if (!completed.length) { section.appendChild(emptyState()); return section; }

  const counts = { Yes: 0, Maybe: 0, No: 0 };
  completed.forEach(r => { if (r.wouldRecommend && counts[r.wouldRecommend] !== undefined) counts[r.wouldRecommend]++; });

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) { section.appendChild(emptyState('No data yet')); return section; }

  const colors = { Yes: '#22c55e', Maybe: '#f59e0b', No: '#ef4444' };

  const wrapper = document.createElement('div');
  wrapper.className = 'flex gap-6 items-center flex-wrap';

  // Donut
  let deg = 0;
  const segs = Object.entries(counts).filter(([, c]) => c > 0).map(([k, c]) => {
    const pct = c / total * 100;
    const start = deg;
    deg += pct * 3.6;
    return { label: k, count: c, pct, color: colors[k], start, end: deg };
  });
  const gradStr = segs.map(s => `${s.color} ${s.start.toFixed(1)}deg ${s.end.toFixed(1)}deg`).join(', ');
  const nps = total ? Math.round((counts.Yes - counts.No) / total * 100) : 0;
  const npsColor = nps >= 50 ? '#22c55e' : nps >= 0 ? '#f59e0b' : '#ef4444';

  const donutDiv = document.createElement('div');
  donutDiv.className = 'flex-shrink-0 flex flex-col items-center gap-2';
  donutDiv.innerHTML = `
    <div style="width:140px;height:140px;border-radius:50%;background:conic-gradient(${gradStr});position:relative;">
      <div style="position:absolute;inset:28px;border-radius:50%;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <span style="font-size:18px;font-weight:800;color:${npsColor}">${nps > 0 ? '+' : ''}${nps}%</span>
        <span style="font-size:10px;color:#94a3b8;">net score</span>
      </div>
    </div>
    <div style="font-size:11px;color:#64748b;text-align:center">Promoters minus Detractors</div>
  `;

  const bars = document.createElement('div');
  bars.style.flex = '1';
  Object.entries(counts).forEach(([label, count]) => {
    const pct = total ? Math.round(count / total * 100) : 0;
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <span class="bar-label" style="width:80px;font-weight:600;color:${colors[label]}">${escHtml(label)}</span>
      <div class="bar-track"><div class="bar-fill" style="background:${colors[label]};width:0%" data-pct="${pct}"></div></div>
      <span class="bar-meta">${count} (${pct}%)</span>
    `;
    bars.appendChild(row);
  });

  wrapper.appendChild(donutDiv);
  wrapper.appendChild(bars);
  section.appendChild(wrapper);
  return section;
}

// ─── SUMMARY SECTION HELPER ──────────────────────────────────────────
function makeSummarySection(title, icon, subtitle) {
  const div = document.createElement('div');
  div.className = 'summary-section';
  div.innerHTML = `
    <div class="summary-section-title">
      <span class="material-icons">${icon}</span>
      <div>
        <div>${escHtml(title)}</div>
        ${subtitle ? `<div style="font-size:11.5px;font-weight:400;color:#94a3b8;margin-top:1px;">${escHtml(subtitle)}</div>` : ''}
      </div>
    </div>
  `;
  return div;
}

function emptyState(msg = 'No completed records yet') {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.innerHTML = `<span class="material-icons">inbox</span>${escHtml(msg)}`;
  return div;
}

// ─── EXCEL EXPORT ────────────────────────────────────────────────────

function exportXLSX() {
  if (!window.XLSX) {
    alert('Excel export library not loaded. Please check your internet connection and try again.');
    return;
  }
  const XL = window.XLSX;
  const completed = records.filter(r => r.fullName && r.fullName.trim());
  const today = new Date().toISOString().slice(0, 10);

  // ── Helpers ────────────────────────────────────────────
  function xs(bg, fc = '1E293B', bold = false, align = 'left') {
    return {
      fill: { patternType: 'solid', fgColor: { rgb: bg } },
      font: { bold, color: { rgb: fc }, name: 'Calibri', sz: 10 },
      alignment: { vertical: 'center', horizontal: align, wrapText: false },
      border: {
        top:    { style: 'thin', color: { rgb: 'E2E8F0' } },
        bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
        left:   { style: 'thin', color: { rgb: 'E2E8F0' } },
        right:  { style: 'thin', color: { rgb: 'E2E8F0' } },
      },
    };
  }
  function cell(v, style) {
    const t = typeof v === 'number' ? 'n' : 's';
    return { v: v === null || v === undefined ? '' : v, t, s: style };
  }
  function applyStyles(ws, rows) {
    rows.forEach((row, R) => {
      (row || []).forEach((c, C) => {
        if (!c || !c.s) return;
        const ref = XL.utils.encode_cell({ r: R, c: C });
        if (ws[ref]) ws[ref].s = c.s;
      });
    });
  }

  // ── Color maps (matches CSS table colors exactly) ─────
  const ER_BG  = { null:'F1F5F9', 0:'F8FAFC', 1:'FEF9C3', 2:'FEF3C7', 3:'FED7AA', 4:'FECACA', 5:'EF4444' };
  const ER_FC  = { null:'94A3B8', 0:'94A3B8', 1:'854D0E', 2:'92400E', 3:'9A3412', 4:'991B1B', 5:'FFFFFF' };
  const TI_BG  = { null:'F1F5F9', 1:'FECACA', 2:'FED7AA', 3:'FEF3C7', 4:'BBF7D0', 5:'22C55E' };
  const TI_FC  = { null:'94A3B8', 1:'991B1B', 2:'9A3412', 3:'92400E', 4:'14532D', 5:'FFFFFF' };
  const FR_BG  = { null:'F1F5F9', 0:'F8FAFC', 1:'FEF9C3', 2:'FED7AA', 3:'FECACA' };
  const FR_FC  = { null:'94A3B8', 0:'94A3B8', 1:'854D0E', 2:'9A3412', 3:'991B1B' };
  const GRP_HX = { 'Guard Info':'1E3A5F','Exit Reasons':'7F1D1D','Stressors':'78350F','Supervision':'3B0764','Complaints':'164E63','Exit Summary':'14532D','Stay Factors':'1E3A5F','Trust Index':'4A1D96' };

  function cellStyleFor(col, raw) {
    if (col.type === 'scale-er') {
      const k = raw !== null && raw !== undefined ? raw : 'null';
      return xs(ER_BG[k] || 'F1F5F9', ER_FC[k] || '1E293B', true, 'center');
    }
    if (col.type === 'scale-ti') {
      const k = raw !== null && raw !== undefined ? raw : 'null';
      return xs(TI_BG[k] || 'F1F5F9', TI_FC[k] || '1E293B', true, 'center');
    }
    if (col.type === 'freq') {
      const k = raw !== null && raw !== undefined ? raw : 'null';
      return xs(FR_BG[k] || 'F1F5F9', FR_FC[k] || '1E293B', false, 'center');
    }
    if (col.type === 'yn') {
      if (raw === true)  return xs('DCFCE7', '14532D', true, 'center');
      if (raw === false) return xs('FEE2E2', '991B1B', false, 'center');
      return xs('F1F5F9', '94A3B8', false, 'center');
    }
    if (col.field === 'wouldRecommend') {
      if (raw === 'Yes')   return xs('DCFCE7', '14532D', true);
      if (raw === 'No')    return xs('FEE2E2', '991B1B', true);
      if (raw === 'Maybe') return xs('FEF9C3', '854D0E', true);
    }
    return xs('FFFFFF', '1E293B');
  }

  // ══════════════════════════════════════════════════════
  // SHEET 1: Records (one row per guard, all fields colored)
  // ══════════════════════════════════════════════════════
  const recRows = [];

  // Row 0 — Group header (merged per group)
  const grpRow = [cell('ID', xs('0F172A','FFFFFF', true, 'center'))];
  TABLE_GROUPS.forEach(g => {
    const hex = GRP_HX[g.name] || '1E3A5F';
    grpRow.push(cell(g.name.toUpperCase(), xs(hex, 'FFFFFF', true, 'center')));
    for (let s = 1; s < g.span; s++) grpRow.push(cell('', xs(hex, 'FFFFFF', true, 'center')));
  });
  recRows.push(grpRow);

  // Row 1 — Field labels
  const fldRow = [cell('#', xs('EFF6FF', '1D4ED8', true, 'center'))];
  TABLE_COLUMNS.forEach(col => fldRow.push(cell(col.label, xs('EFF6FF', '1D4ED8', true))));
  recRows.push(fldRow);

  // Data rows
  records.forEach((r, i) => {
    const row = [cell(String(i + 1).padStart(4, '0'), xs('F8FAFC', '64748B', false, 'center'))];
    TABLE_COLUMNS.forEach(col => {
      const raw = r[col.field];
      let display = raw;
      if (col.type === 'freq')  display = raw !== null && raw !== undefined ? FREQ_LABELS[raw] : '';
      else if (col.type === 'yn') display = raw === true ? 'Yes' : raw === false ? 'No' : '';
      else if (raw === null || raw === undefined) display = '';
      const style = cellStyleFor(col, raw);
      const v = display === null || display === undefined ? '' : display;
      row.push(cell(typeof v === 'number' ? v : String(v), style));
    });
    recRows.push(row);
  });

  const wsRec = XL.utils.aoa_to_sheet(recRows.map(r => r.map(c => c.v)));
  applyStyles(wsRec, recRows);

  // Merge group header cells
  const recMerges = [{ s:{r:0,c:0}, e:{r:0,c:0} }];
  let mc = 1;
  TABLE_GROUPS.forEach(g => {
    recMerges.push({ s:{r:0,c:mc}, e:{r:0,c:mc+g.span-1} });
    mc += g.span;
  });
  wsRec['!merges'] = recMerges;

  // Column widths
  wsRec['!cols'] = [
    { wch: 6 },
    ...TABLE_COLUMNS.map(col => ({
      wch: col.type === 'scale-er' || col.type === 'scale-ti' ? 6
         : col.type === 'freq'   ? 12
         : col.type === 'yn'     ? 7
         : col.type === 'number' ? 6
         : col.type === 'date'   ? 12
         : col.type === 'textarea' ? 22
         : Math.max(col.label.length + 2, Math.round(col.width / 7)),
    })),
  ];
  wsRec['!rows'] = [{ hpt: 20 }, { hpt: 16 }, ...records.map(() => ({ hpt: 15 }))];
  wsRec['!views'] = [{ state: 'frozen', xSplit: 2, ySplit: 2 }];

  // ══════════════════════════════════════════════════════
  // SHEET 2: Summary Analytics (all charts with colors)
  // ══════════════════════════════════════════════════════
  const sumRows = [];
  const H = (text, bg, fc='FFFFFF', span=1) => {
    const row = [cell(text, xs(bg, fc, true))];
    for (let i = 1; i < span; i++) row.push(cell('', xs(bg, fc)));
    return row;
  };
  const subH = (...labels) => labels.map(l => cell(l, xs('F1F5F9', '475569', true)));

  sumRows.push(H('GUARD EXIT INTERVIEW — SUMMARY ANALYTICS', '1E293B', 'FFFFFF', 6));
  sumRows.push([cell(`Exported: ${today}  ·  ${records.length} records  ·  ${completed.length} completed`, xs('F8FAFC','64748B'))]);
  sumRows.push([]);

  // KPI
  const factors   = completed.map(r => r.mainExitFactor).filter(Boolean);
  const topFactor = factors.length ? mode(factors) : '—';
  const tScores   = completed.flatMap(r => TRUST_FIELDS.map(f => r[`ti_${key(f)}`]).filter(v => v !== null));
  const avgTrust  = tScores.length ? (tScores.reduce((a,b)=>a+b,0)/tScores.length).toFixed(2) : '—';
  const atNum     = parseFloat(avgTrust);
  sumRows.push(H('KEY PERFORMANCE INDICATORS', '1E3A5F', 'FFFFFF', 3));
  sumRows.push([cell('Metric',xs('EFF6FF','1D4ED8',true)), cell('Value',xs('EFF6FF','1D4ED8',true,'center')), cell('Notes',xs('EFF6FF','1D4ED8',true))]);
  sumRows.push([cell('Total Records',xs('FAFAFA','374151')), cell(records.length,xs('F8FAFC','1E293B',true,'center')), cell('',xs('FAFAFA','374151'))]);
  sumRows.push([cell('Completed',xs('FAFAFA','374151')), cell(completed.length,xs('F8FAFC','1E293B',true,'center')), cell(`${records.length?Math.round(completed.length/records.length*100):0}% rate`,xs('F8FAFC','64748B'))]);
  sumRows.push([cell('Top Exit Factor',xs('FAFAFA','374151')), cell(topFactor,xs('FEF9C3','92400E',true,'center')), cell('Most cited main factor',xs('F8FAFC','64748B'))]);
  const tBg = !isNaN(atNum) ? (atNum>=4?'DCFCE7':atNum>=3?'FEF9C3':'FEE2E2') : 'F1F5F9';
  const tFc = !isNaN(atNum) ? (atNum>=4?'14532D':atNum>=3?'92400E':'991B1B') : '94A3B8';
  sumRows.push([cell('Avg Trust Score',xs('FAFAFA','374151')), cell(avgTrust,xs(tBg,tFc,true,'center')), cell('out of 5.00',xs('F8FAFC','64748B'))]);
  sumRows.push([]);

  // Exit Reasons
  sumRows.push(H('EXIT REASONS — SEVERITY SCORES (0–5)', '7F1D1D', 'FFFFFF', 5));
  sumRows.push(subH('Exit Reason','Total Score','Guards','Avg/Guard','Severity'));
  const erD = EXIT_REASON_FIELDS.map(label => {
    const fk = `er_${key(label)}`;
    const vals = completed.map(r => r[fk]).filter(v => v !== null);
    const total = vals.reduce((a,b)=>a+b,0);
    return { label, total, count:vals.length, avg: vals.length ? total/vals.length : 0 };
  }).sort((a,b)=>b.total-a.total);
  const maxER = erD[0]?.total || 1;
  erD.forEach(d => {
    const pct = d.total/maxER;
    const bg = pct>=0.75?'EF4444':pct>=0.45?'FED7AA':'FEF9C3';
    const fc = pct>=0.75?'FFFFFF':'991B1B';
    const sev = d.avg>=4?'CRITICAL':d.avg>=3?'HIGH':d.avg>=2?'MODERATE':d.avg>=1?'LOW':'NEGLIGIBLE';
    const sBg = d.avg>=4?'EF4444':d.avg>=3?'FED7AA':d.avg>=2?'FEF9C3':'F1F5F9';
    const sFc = d.avg>=4?'FFFFFF':d.avg>=3?'9A3412':d.avg>=2?'92400E':'94A3B8';
    sumRows.push([cell(d.label,xs('FAFAFA','374151')), cell(d.total,xs(bg,fc,true,'center')), cell(d.count,xs('F8FAFC','374151',false,'center')), cell(d.count?+d.avg.toFixed(2):'—',xs('F8FAFC','374151',false,'center')), cell(sev,xs(sBg,sFc,true,'center'))]);
  });
  sumRows.push([]);

  // Trust Index
  sumRows.push(H('TRUST INDEX AVERAGES (1–5)', '4A1D96', 'FFFFFF', 5));
  sumRows.push(subH('Statement','Avg Score','/ 5','Guards','Interpretation'));
  TRUST_FIELDS.forEach(label => {
    const fk = `ti_${key(label)}`;
    const vals = completed.map(r => r[fk]).filter(v => v !== null);
    const avg  = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0;
    const k    = vals.length ? Math.round(avg) : 'null';
    const interp = avg>=4?'Agree':avg>=3?'Neutral':avg>0?'Disagree':'—';
    sumRows.push([cell(label,xs('FAFAFA','374151')), cell(vals.length?+avg.toFixed(2):'—',xs(TI_BG[k]||'F1F5F9',TI_FC[k]||'94A3B8',true,'center')), cell('/ 5',xs('F8FAFC','94A3B8',false,'center')), cell(vals.length,xs('F8FAFC','374151',false,'center')), cell(interp,xs('F8FAFC','64748B',false,'center'))]);
  });
  sumRows.push([]);

  // Operational Stressors
  sumRows.push(H('OPERATIONAL STRESSORS — FREQUENCY', '78350F', 'FFFFFF', 7));
  sumRows.push(subH('Stressor','Never','Sometimes','Often','Very Often','% V.Often','Severity'));
  OP_STRESSOR_FIELDS.forEach(label => {
    const fk    = `os_${key(label)}`;
    const vals  = completed.map(r => r[fk]).filter(v => v !== null);
    const cnts  = [0,1,2,3].map(i => vals.filter(v=>v===i).length);
    const voPct = vals.length ? Math.round(cnts[3]/vals.length*100) : 0;
    const sev   = voPct>=50?'CRITICAL':voPct>=25?'HIGH':voPct>=10?'MODERATE':'LOW';
    const sBg   = voPct>=50?'EF4444':voPct>=25?'FED7AA':voPct>=10?'FEF9C3':'F1F5F9';
    const sFc   = voPct>=50?'FFFFFF':voPct>=25?'9A3412':voPct>=10?'92400E':'94A3B8';
    sumRows.push([cell(label,xs('FAFAFA','374151')), cell(cnts[0],xs(FR_BG[0],'94A3B8',false,'center')), cell(cnts[1],xs(FR_BG[1],'854D0E',false,'center')), cell(cnts[2],xs(FR_BG[2],'9A3412',false,'center')), cell(cnts[3],xs(FR_BG[3],'991B1B',true,'center')), cell(`${voPct}%`,xs(sBg,sFc,true,'center')), cell(sev,xs(sBg,sFc,true,'center'))]);
  });
  sumRows.push([]);

  // Supervision Flags
  sumRows.push(H('SUPERVISION & POWER FLAGS', '3B0764', 'FFFFFF', 6));
  sumRows.push(subH('Flag','Yes','No','N/A','% Guards','Risk'));
  const svD = SUPERVISION_FLAGS.map(label => {
    const fk  = `sv_${key(label)}`;
    const yes = completed.filter(r=>r[fk]===true).length;
    const no  = completed.filter(r=>r[fk]===false).length;
    const pct = completed.length ? Math.round(yes/completed.length*100) : 0;
    return { label, yes, no, na:completed.length-yes-no, pct };
  }).sort((a,b)=>b.yes-a.yes);
  svD.forEach(d => {
    const rk  = d.pct>=50?'CRITICAL':d.pct>=25?'HIGH':d.pct>=10?'MODERATE':'LOW';
    const rBg = d.pct>=50?'EF4444':d.pct>=25?'FED7AA':d.pct>=10?'FEF9C3':'F1F5F9';
    const rFc = d.pct>=50?'FFFFFF':d.pct>=25?'9A3412':d.pct>=10?'92400E':'94A3B8';
    sumRows.push([cell(d.label,xs('FAFAFA','374151')), cell(d.yes,xs(d.yes>0?'FEE2E2':'F8FAFC',d.yes>0?'991B1B':'94A3B8',d.yes>0,'center')), cell(d.no,xs('F8FAFC','374151',false,'center')), cell(d.na,xs('F8FAFC','94A3B8',false,'center')), cell(`${d.pct}%`,xs(rBg,rFc,true,'center')), cell(rk,xs(rBg,rFc,true,'center'))]);
  });
  sumRows.push([]);

  // Stay Factors
  sumRows.push(H('STAY FACTORS', '14532D', 'FFFFFF', 6));
  sumRows.push(subH('Factor','Yes','No','N/A','% Guards','Priority'));
  STAY_FACTOR_FIELDS.map(label => {
    const fk  = `sf_${key(label)}`;
    const yes = completed.filter(r=>r[fk]===true).length;
    const no  = completed.filter(r=>r[fk]===false).length;
    const pct = completed.length ? Math.round(yes/completed.length*100) : 0;
    return { label, yes, no, na:completed.length-yes-no, pct };
  }).sort((a,b)=>b.yes-a.yes).forEach(d => {
    const pri = d.pct>=50?'HIGH':d.pct>=25?'MEDIUM':'LOW';
    const pBg = d.pct>=50?'22C55E':d.pct>=25?'BBF7D0':'F0FDF4';
    const pFc = d.pct>=50?'FFFFFF':'14532D';
    sumRows.push([cell(d.label,xs('FAFAFA','374151')), cell(d.yes,xs('DCFCE7','14532D',true,'center')), cell(d.no,xs('FEE2E2','991B1B',false,'center')), cell(d.na,xs('F8FAFC','94A3B8',false,'center')), cell(`${d.pct}%`,xs(pBg,pFc,true,'center')), cell(pri,xs(pBg,pFc,true,'center'))]);
  });
  sumRows.push([]);

  // Exit Type Distribution
  sumRows.push(H('EXIT TYPE DISTRIBUTION', '1E3A5F', 'FFFFFF', 4));
  sumRows.push(subH('Exit Type','Count','% of Total',''));
  const etC = {}; EXIT_TYPE_OPTIONS.forEach(t => etC[t]=0);
  completed.forEach(r => { if (r.typeOfExit) etC[r.typeOfExit]++; });
  const maxET = Math.max(...Object.values(etC), 1);
  EXIT_TYPE_OPTIONS.forEach(t => {
    const c2 = etC[t];
    const pct = completed.length ? Math.round(c2/completed.length*100) : 0;
    const isTop = c2 === maxET && c2 > 0;
    const bg = isTop ? 'DBEAFE' : 'FAFAFA';
    sumRows.push([cell(t,xs(bg,'374151',isTop)), cell(c2,xs(bg,'1D4ED8',isTop,'center')), cell(`${pct}%`,xs(bg,'64748B',false,'center')), cell(isTop?'◄ Most common':'',xs(bg,'2563EB',false))]);
  });
  sumRows.push([]);

  // Would Recommend / NPS
  const recC = { Yes:0, Maybe:0, No:0 };
  completed.forEach(r => { if (recC[r.wouldRecommend]!==undefined) recC[r.wouldRecommend]++; });
  const recT  = recC.Yes+recC.Maybe+recC.No;
  const nps   = recT ? Math.round((recC.Yes-recC.No)/recT*100) : 0;
  const npslb = nps>=50?'EXCELLENT':nps>=20?'GOOD':nps>=0?'NEUTRAL':'POOR';
  const nBg   = nps>=20?'DCFCE7':nps>=0?'FEF9C3':'FEE2E2';
  const nFc   = nps>=20?'14532D':nps>=0?'92400E':'991B1B';
  sumRows.push(H('WOULD RECOMMEND AGENCY? — NET PROMOTER SCORE', '1E3A5F', 'FFFFFF', 4));
  sumRows.push([cell(`NPS: ${nps>0?'+':''}${nps}  [${npslb}]`,xs(nBg,nFc,true,'center')), cell('Promoters − Detractors ÷ Total Responses',xs('F8FAFC','64748B'))]);
  [['Yes','Promoter','DCFCE7','14532D'],['Maybe','Passive','FEF9C3','854D0E'],['No','Detractor','FEE2E2','991B1B']].forEach(([k,role,bg,fc]) => {
    const cnt = recC[k];
    const pct = recT ? Math.round(cnt/recT*100) : 0;
    sumRows.push([cell(k,xs(bg,fc,true)), cell(cnt,xs(bg,fc,true,'center')), cell(`${pct}%`,xs('F8FAFC','64748B',false,'center')), cell(role,xs('F8FAFC','94A3B8',false))]);
  });

  // Build summary sheet
  const wsSum = XL.utils.aoa_to_sheet(sumRows.map(row => (row||[]).map(c => c ? c.v : '')));
  applyStyles(wsSum, sumRows);
  wsSum['!cols'] = [{ wch:38 },{ wch:14 },{ wch:12 },{ wch:12 },{ wch:12 },{ wch:12 }];

  // ── Write workbook ────────────────────────────────────
  const wb = XL.utils.book_new();
  XL.utils.book_append_sheet(wb, wsRec, 'Records');
  XL.utils.book_append_sheet(wb, wsSum, 'Summary Analytics');
  XL.writeFile(wb, `Exit_Interview_${today}.xlsx`);
}

// Keep nullStr / boolStr used by legacy code paths
function nullStr(v) { return v !== null && v !== undefined ? String(v) : ''; }
function boolStr(v) { return v === true ? 'Yes' : v === false ? 'No' : ''; }

// (Legacy CSV kept for reference — no longer wired to UI)
function exportCSV() {
  const completed = records.filter(r => r.fullName && r.fullName.trim());
  const total = records.length;
  const today = new Date().toISOString().slice(0, 10);

  const rows = [];

  // ── SHEET 1: Raw Record Data ──────────────────────────────────────
  rows.push(['=== RAW INTERVIEW DATA ===', `Exported: ${today}`, `Total Records: ${total}`, `Completed: ${completed.length}`]);
  rows.push([]);

  const headers = [
    'Guard ID', 'Full Name', 'Age', 'Gender', 'Rank/Position', 'Detachment/Post',
    'Length of Service', 'Type of Exit', 'Date of Exit',
    ...EXIT_REASON_FIELDS.map(f => `ExitReason: ${f}`),
    ...OP_STRESSOR_FIELDS.map(f => `Stressor: ${f}`),
    ...SUPERVISION_FLAGS.map(f => `Supervision: ${f}`),
    'Safe to Speak Up',
    ...COMPLAINT_FLAGS.map(f => `Complaint: ${f}`),
    'Main Exit Factor', 'Secondary Factor', 'Breaking Point', 'Would Recommend',
    ...STAY_FACTOR_FIELDS.map(f => `Stay: ${f}`),
    'Other Suggestions',
    ...TRUST_FIELDS.map(f => `Trust: ${f}`),
  ];
  rows.push(headers);

  records.forEach((r, i) => {
    const row = [
      String(i + 1).padStart(4, '0'),
      r.fullName || '', r.age || '', r.gender || '', r.rankPosition || '',
      r.detachment || '', r.lengthOfService || '', r.typeOfExit || '', r.dateOfExit || '',
      ...EXIT_REASON_FIELDS.map(f => nullStr(r[`er_${key(f)}`])),
      ...OP_STRESSOR_FIELDS.map(f => {
        const v = r[`os_${key(f)}`];
        return v !== null && v !== undefined ? FREQ_LABELS[v] || v : '';
      }),
      ...SUPERVISION_FLAGS.map(f => boolStr(r[`sv_${key(f)}`])),
      r.safeToSpeak || '',
      ...COMPLAINT_FLAGS.map(f => boolStr(r[`cp_${key(f)}`])),
      r.mainExitFactor || '', r.secondaryFactor || '',
      (r.breakingPoint || '').replace(/\n/g, ' '),
      r.wouldRecommend || '',
      ...STAY_FACTOR_FIELDS.map(f => boolStr(r[`sf_${key(f)}`])),
      (r.otherSuggestions || '').replace(/\n/g, ' '),
      ...TRUST_FIELDS.map(f => nullStr(r[`ti_${key(f)}`])),
    ];
    rows.push(row);
  });

  // ── KPI SUMMARY ──────────────────────────────────────────────────
  rows.push([]);
  rows.push([]);
  rows.push(['╔══════════════════════════════════════════════════╗']);
  rows.push(['║              SUMMARY ANALYTICS                  ║']);
  rows.push(['╚══════════════════════════════════════════════════╝']);
  rows.push([]);

  const factors = completed.map(r => r.mainExitFactor).filter(Boolean);
  const topFactor = factors.length ? mode(factors) : '—';
  const trustScores = completed.flatMap(r =>
    TRUST_FIELDS.map(f => r[`ti_${key(f)}`]).filter(v => v !== null)
  );
  const avgTrust = trustScores.length
    ? (trustScores.reduce((a, b) => a + b, 0) / trustScores.length).toFixed(2)
    : '—';
  const trustLevel = avgTrust !== '—'
    ? (parseFloat(avgTrust) >= 4 ? 'HIGH TRUST' : parseFloat(avgTrust) >= 3 ? 'MODERATE TRUST' : 'LOW TRUST')
    : '—';

  rows.push(['KEY PERFORMANCE INDICATORS']);
  rows.push(['Metric', 'Value', 'Notes']);
  rows.push(['Total Records', total, '']);
  rows.push(['Completed Records', completed.length, `${total ? Math.round(completed.length / total * 100) : 0}% completion rate`]);
  rows.push(['Top Exit Factor', topFactor, 'Most cited main exit factor']);
  rows.push(['Average Trust Score', avgTrust, `out of 5.00 — ${trustLevel}`]);

  // ── CHART 1: Top Exit Reasons ─────────────────────────────────────
  rows.push([]);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['CHART 1 — TOP EXIT REASONS', '', '', '', 'Scale: 0 (Not a factor) → 5 (Major)']);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['Rank', 'Exit Reason', 'Bar (out of max score)', 'Total Score', 'Guards', 'Avg / Guard', 'Severity']);

  const erData = EXIT_REASON_FIELDS.map(label => {
    const fk = `er_${key(label)}`;
    const vals = completed.map(r => r[fk]).filter(v => v !== null);
    const totalScore = vals.reduce((a, b) => a + b, 0);
    const avg = vals.length ? totalScore / vals.length : 0;
    return { label, totalScore, count: vals.length, avg };
  }).sort((a, b) => b.totalScore - a.totalScore);

  const maxER = erData[0]?.totalScore || 1;
  erData.forEach((d, i) => {
    const sev = d.avg >= 4 ? 'CRITICAL' : d.avg >= 3 ? 'HIGH' : d.avg >= 2 ? 'MODERATE' : d.avg >= 1 ? 'LOW' : 'NEGLIGIBLE';
    rows.push([
      `#${i + 1}`,
      d.label,
      asciiBar(d.totalScore, maxER),
      d.totalScore,
      `${d.count} guards`,
      d.count ? d.avg.toFixed(2) : '—',
      sev,
    ]);
  });
  if (!completed.length) rows.push(['', '(No completed records)', '', '', '', '', '']);

  // ── CHART 2: Exit Type Distribution ──────────────────────────────
  rows.push([]);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['CHART 2 — EXIT TYPE DISTRIBUTION']);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['Exit Type', 'Bar', 'Count', '% of Total', 'Notes']);

  const etCounts = {};
  EXIT_TYPE_OPTIONS.forEach(t => etCounts[t] = 0);
  completed.forEach(r => { if (r.typeOfExit) etCounts[r.typeOfExit] = (etCounts[r.typeOfExit] || 0) + 1; });
  const maxET = Math.max(...Object.values(etCounts), 1);
  EXIT_TYPE_OPTIONS.forEach(t => {
    const c = etCounts[t];
    const pct = completed.length ? Math.round(c / completed.length * 100) : 0;
    rows.push([t, asciiBar(c, maxET), c, `${pct}%`, c === Math.max(...Object.values(etCounts)) && c > 0 ? '◄ Most common' : '']);
  });
  if (!completed.length) rows.push(['(No completed records)', '', '', '', '']);

  // ── CHART 3: Trust Index Averages ─────────────────────────────────
  rows.push([]);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['CHART 3 — TRUST INDEX AVERAGES', '', '', '', 'Scale: 1 (Strongly Disagree) → 5 (Strongly Agree)']);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);

  const tiData = TRUST_FIELDS.map(label => {
    const fk = `ti_${key(label)}`;
    const vals = completed.map(r => r[fk]).filter(v => v !== null);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return { label, avg: +avg.toFixed(2), count: vals.length };
  });
  const tiWithData = tiData.filter(d => d.count > 0);
  const overallTrust = tiWithData.length
    ? (tiWithData.reduce((a, b) => a + b.avg, 0) / tiWithData.length).toFixed(2)
    : '—';
  const tLevel = overallTrust !== '—'
    ? (parseFloat(overallTrust) >= 4 ? 'HIGH TRUST ▲' : parseFloat(overallTrust) >= 3 ? 'MODERATE TRUST ●' : 'LOW TRUST ▼')
    : '—';
  rows.push([`Overall Trust Score: ${overallTrust} / 5.00   [${tLevel}]`]);
  rows.push(['Statement', 'Bar (out of 5)', 'Avg Score', 'Guards Responded', 'Interpretation']);

  tiData.forEach(d => {
    const interp = d.avg >= 4 ? 'Agree' : d.avg >= 3 ? 'Neutral' : d.avg > 0 ? 'Disagree' : '—';
    rows.push([
      d.label,
      d.count ? asciiBar(d.avg, 5) : '(no data)',
      d.count ? `${d.avg} / 5` : '—',
      d.count,
      interp,
    ]);
  });
  if (!completed.length) rows.push(['(No completed records)']);

  // ── CHART 4: Operational Stressors ───────────────────────────────
  rows.push([]);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['CHART 4 — OPERATIONAL STRESSORS', '', '', '', 'Frequency breakdown per stressor']);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['Stressor', 'Frequency Bar', 'Never', 'Sometimes', 'Often', 'Very Often', '% Very Often', 'Severity']);

  OP_STRESSOR_FIELDS.forEach(label => {
    const fk = `os_${key(label)}`;
    const vals = completed.map(r => r[fk]).filter(v => v !== null);
    if (!vals.length) { rows.push([label, '(no data)', '', '', '', '', '', '']); return; }
    const counts = [0, 1, 2, 3].map(i => vals.filter(v => v === i).length);
    const voPct = Math.round(counts[3] / vals.length * 100);
    // Stacked ASCII: weight each segment
    const barFilled = Math.round((counts[2] + counts[3]) / vals.length * 20);
    const barMid = Math.round(counts[1] / vals.length * 20);
    const barEmpty = Math.max(0, 20 - barFilled - barMid);
    const stressBar = '█'.repeat(barFilled) + '▒'.repeat(barMid) + '░'.repeat(barEmpty);
    const sev = voPct >= 50 ? 'CRITICAL' : voPct >= 25 ? 'HIGH' : voPct >= 10 ? 'MODERATE' : 'LOW';
    rows.push([label, stressBar, counts[0], counts[1], counts[2], counts[3], `${voPct}%`, sev]);
  });
  rows.push(['', 'Legend: █ = Often/Very Often  ▒ = Sometimes  ░ = Never']);

  // ── CHART 5: Supervision & Power Flags ───────────────────────────
  rows.push([]);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['CHART 5 — SUPERVISION & POWER FLAGS', '', '', 'Yes = issue was reported by guard']);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);

  const svData = SUPERVISION_FLAGS.map(label => {
    const fk = `sv_${key(label)}`;
    const yesCount = completed.filter(r => r[fk] === true).length;
    const noCount = completed.filter(r => r[fk] === false).length;
    const pct = completed.length ? Math.round(yesCount / completed.length * 100) : 0;
    return { label, yesCount, noCount, pct };
  }).sort((a, b) => b.yesCount - a.yesCount);

  const totalSvFlags = svData.reduce((s, d) => s + d.yesCount, 0);
  const avgFlags = completed.length ? (totalSvFlags / completed.length).toFixed(1) : '0';
  const riskLevel = parseFloat(avgFlags) >= 3 ? 'HIGH RISK' : parseFloat(avgFlags) >= 1.5 ? 'MODERATE RISK' : 'LOW RISK';
  rows.push([`Risk Level: ${riskLevel}   Avg flags per guard: ${avgFlags}   Total flag instances: ${totalSvFlags}`]);
  rows.push([]);
  rows.push(['Flag', 'Bar', 'Yes', 'No', 'N/A', '% of Guards', 'Risk']);

  const maxSV = svData[0]?.yesCount || 1;
  svData.forEach(d => {
    const na = completed.length - d.yesCount - d.noCount;
    const risk = d.pct >= 50 ? 'CRITICAL' : d.pct >= 25 ? 'HIGH' : d.pct >= 10 ? 'MODERATE' : 'LOW';
    rows.push([d.label, asciiBar(d.yesCount, maxSV), d.yesCount, d.noCount, na, `${d.pct}%`, risk]);
  });

  // Safe to Speak Up breakdown
  const speakCounts = { Yes: 0, Somewhat: 0, No: 0 };
  completed.forEach(r => { if (r.safeToSpeak && speakCounts[r.safeToSpeak] !== undefined) speakCounts[r.safeToSpeak]++; });
  rows.push([]);
  rows.push(['Safe to Speak Up?', 'Yes', 'Somewhat', 'No']);
  rows.push(['', speakCounts.Yes, speakCounts.Somewhat, speakCounts.No]);

  // ── CHART 6: Stay Factors ─────────────────────────────────────────
  rows.push([]);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['CHART 6 — STAY FACTORS', '', '', 'What could have made the guard stay?']);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['Stay Factor', 'Bar', 'Yes', 'No', 'N/A', '% of Guards', 'Priority']);

  const sfData = STAY_FACTOR_FIELDS.map(label => {
    const fk = `sf_${key(label)}`;
    const yesCount = completed.filter(r => r[fk] === true).length;
    const noCount = completed.filter(r => r[fk] === false).length;
    const pct = completed.length ? Math.round(yesCount / completed.length * 100) : 0;
    return { label, yesCount, noCount, pct };
  }).sort((a, b) => b.yesCount - a.yesCount);

  const maxSF = sfData[0]?.yesCount || 1;
  sfData.forEach(d => {
    const na = completed.length - d.yesCount - d.noCount;
    const priority = d.pct >= 50 ? 'HIGH' : d.pct >= 25 ? 'MEDIUM' : 'LOW';
    rows.push([d.label, asciiBar(d.yesCount, maxSF), d.yesCount, d.noCount, na, `${d.pct}%`, priority]);
  });
  if (!completed.length) rows.push(['(No completed records)', '', '', '', '', '', '']);

  // ── CHART 7: Service Length at Exit ──────────────────────────────
  rows.push([]);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['CHART 7 — LENGTH OF SERVICE AT EXIT', '', '', 'When do guards tend to leave?']);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['Tenure Window', 'Bar', 'Guards', '% of Total', '']);

  const tenureOptions = ['Less than 6 months','6–12 months','1–2 years','2–5 years','5–10 years','10+ years'];
  const tenureCounts = {};
  tenureOptions.forEach(o => tenureCounts[o] = 0);
  completed.forEach(r => { if (r.lengthOfService) tenureCounts[r.lengthOfService] = (tenureCounts[r.lengthOfService] || 0) + 1; });
  const maxTenure = Math.max(...Object.values(tenureCounts), 1);
  const topTenure = tenureOptions.reduce((a, b) => tenureCounts[a] >= tenureCounts[b] ? a : b);

  tenureOptions.forEach(o => {
    const c = tenureCounts[o];
    const pct = completed.length ? Math.round(c / completed.length * 100) : 0;
    rows.push([o, asciiBar(c, maxTenure), c, `${pct}%`, c > 0 && o === topTenure ? '◄ Peak exit window' : '']);
  });
  if (tenureCounts[topTenure] > 0) {
    rows.push([]);
    rows.push([`INSIGHT: Most guards leave during the "${topTenure}" window (${tenureCounts[topTenure]} guard${tenureCounts[topTenure] > 1 ? 's' : ''}). Consider targeted retention at this stage.`]);
  }

  // ── CHART 8: Would Recommend ──────────────────────────────────────
  rows.push([]);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['CHART 8 — WOULD RECOMMEND AGENCY?', '', '', 'Guard advocacy & satisfaction indicator']);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);

  const recCounts = { Yes: 0, Maybe: 0, No: 0 };
  completed.forEach(r => { if (r.wouldRecommend && recCounts[r.wouldRecommend] !== undefined) recCounts[r.wouldRecommend]++; });
  const recTotal = recCounts.Yes + recCounts.Maybe + recCounts.No;
  const nps = recTotal ? Math.round((recCounts.Yes - recCounts.No) / recTotal * 100) : 0;
  const npsLabel = nps >= 50 ? 'EXCELLENT' : nps >= 20 ? 'GOOD' : nps >= 0 ? 'NEUTRAL' : 'POOR';
  rows.push([`Net Promoter Score (NPS): ${nps > 0 ? '+' : ''}${nps}   [${npsLabel}]   (Promoters − Detractors ÷ Total)`]);
  rows.push([]);
  rows.push(['Response', 'Bar', 'Count', '% of Total', 'Role in NPS']);

  const maxRec = Math.max(recCounts.Yes, recCounts.Maybe, recCounts.No, 1);
  [['Yes', 'Promoter'], ['Maybe', 'Passive'], ['No', 'Detractor']].forEach(([label, role]) => {
    const c = recCounts[label];
    const pct = recTotal ? Math.round(c / recTotal * 100) : 0;
    rows.push([label, asciiBar(c, maxRec), c, `${pct}%`, role]);
  });

  // ── COMPLAINT HANDLING ────────────────────────────────────────────
  rows.push([]);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['COMPLAINT HANDLING — SUMMARY']);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push(['Item', 'Bar (Yes responses)', 'Yes', 'No', 'N/A', '% Yes']);

  const cpData = COMPLAINT_FLAGS.map(label => {
    const fk = `cp_${key(label)}`;
    const yesCount = completed.filter(r => r[fk] === true).length;
    const noCount = completed.filter(r => r[fk] === false).length;
    const pct = completed.length ? Math.round(yesCount / completed.length * 100) : 0;
    return { label, yesCount, noCount, pct };
  });
  const maxCP = Math.max(...cpData.map(d => d.yesCount), 1);
  cpData.forEach(d => {
    const na = completed.length - d.yesCount - d.noCount;
    rows.push([d.label, asciiBar(d.yesCount, maxCP), d.yesCount, d.noCount, na, `${d.pct}%`]);
  });

  // ── FOOTER ────────────────────────────────────────────────────────
  rows.push([]);
  rows.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━']);
  rows.push([`Guard Exit Interview Tracker — Report generated ${today} — ${completed.length} completed records`]);
  rows.push(['Bar key: █ = filled  ░ = empty  ▒ = partial (stressors only)']);

  const csvStr = rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csvStr], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Exit_Interview_${today}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvCell(v) {
  const s = String(v == null ? '' : v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function nullStr(v) { return v !== null && v !== undefined ? String(v) : ''; }
function boolStr(v) { return v === true ? 'Yes' : v === false ? 'No' : ''; }

// ─── MODAL ────────────────────────────────────────────────────────────
function showModal(title, body, onConfirm) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-box">
      <div class="modal-title">${escHtml(title)}</div>
      <div class="modal-body">${escHtml(body)}</div>
      <div class="modal-actions">
        <button class="btn-modal-cancel">Cancel</button>
        <button class="btn-modal-confirm">Delete</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector('.btn-modal-cancel').addEventListener('click', () => backdrop.remove());
  backdrop.querySelector('.btn-modal-confirm').addEventListener('click', () => { backdrop.remove(); onConfirm(); });
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
}

// ─── UTILS ────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mode(arr) {
  const freq = {};
  arr.forEach(v => freq[v] = (freq[v] || 0) + 1);
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
}

// ─── BOOT ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
