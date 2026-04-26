# Guard Exit Interview Tracker — Recurring Patterns

## 1. Firebase Auth + Email Allowlist

```javascript
fbAuth.onAuthStateChanged(user => {
  currentUser = user || null
  const email = (user && user.email || '').toLowerCase()
  isEditor = !!user && ALLOWED_EDITORS.includes(email)
  applyEditorMode()
  renderAuthControl()
})

// Sign-in
fbAuth.signInWithPopup(new firebase.auth.GoogleAuthProvider())
  .catch(err => { if (err.code !== 'auth/popup-closed-by-user') alert(err.message) })

// Sign-out
fbAuth.signOut()
```

**Guard Gate:**
```javascript
function saveToFirebase() {
  if (!isEditor) return
  getFirebaseRef().set(records).catch(err => console.warn(err))
}
```

**View-Only CSS:**
```css
body.readonly-mode #btn-new-record,
body.readonly-mode .btn-delete-record {
  display: none !important;
}
body.readonly-mode input, textarea, select {
  pointer-events: none !important;
  background-color: #f8fafc !important;
  cursor: not-allowed !important;
}
```

## 2. RTDB Read/Write (Array Pattern)

**Write (overwrite):**
```javascript
function saveToFirebase() {
  if (!isEditor) return
  getFirebaseRef().set(records)
}
```

**Read once:**
```javascript
function loadFromFirebase() {
  return getFirebaseRef().once('value').then(snap => {
    const fbData = snap.val()
    if (fbData && Array.isArray(fbData) && fbData.length) {
      records = fbData
      localStorage.setItem(getStorageKey(), JSON.stringify(records))
      renderAll()
    } else {
      saveToFirebase()  // Push local up
    }
  })
}
```

**Listen continuously:**
```javascript
let fbListener = null

function startFirebaseListener() {
  if (fbListener) fbListener()  // Cleanup
  const ref = getFirebaseRef()
  const cb = ref.on('value', snap => {
    const fbData = snap.val()
    if (fbData && Array.isArray(fbData) && JSON.stringify(fbData) !== JSON.stringify(records)) {
      records = fbData
      localStorage.setItem(getStorageKey(), JSON.stringify(records))
      renderAll()
      if (currentView === 'summary') renderSummary()
      if (currentView === 'table') renderTable()
    }
  })
  fbListener = () => ref.off('value', cb)
}
```

## 3. Render-on-Change Architecture

```javascript
input.addEventListener('change', e => {
  records[activeRecordIdx][fieldKey] = parseValue(e.target.value)
  renderAll()        // Full re-render
  saveToFirebase()   // Sync
})

function renderAll() {
  updateHeaderSubtitle()
  renderRecordList()
  buildSectionNav()
  renderFormSection()
}

function renderFormSection() {
  const r = records[activeRecordIdx]
  const container = document.getElementById('form-content')
  container.innerHTML = ''  // Clear

  switch (activeSection) {
    case 'guard-info': renderGuardInfo(container, r); break
    case 'income-payroll': renderIncomePayroll(container, r); break
    // ...
  }

  // Re-attach listeners after rendering
  wireTextInputs(container, r)
  wireSelects(container, r)
  wireScaleButtons(container, r)
  wireYNButtons(container, r)
}
```

## 4. Form Field Build + Wire Pattern

```javascript
// STEP 1: Build HTML
function makeScaleRow(label, fieldKey, currentVal, values, btnClass) {
  return `
    <div class="scale-row">
      <div class="scale-row-label">${escHtml(label)}</div>
      <div class="btn-group">
        ${values.map(v => `
          <button class="btn-group-item ${btnClass}" data-value="${v}"
            ${currentVal === v ? 'data-active="true"' : ''}>
            ${v}
          </button>
        `).join('')}
      </div>
    </div>
  `
}

// STEP 2: Wire listeners
function wireScaleButtons(container, r) {
  container.querySelectorAll('.btn-scale, .btn-trust, .btn-freq, .btn-yn').forEach(btn => {
    btn.addEventListener('click', e => {
      const val = e.target.dataset.value
      const fieldKey = e.target.closest('[data-field]').dataset.field
      r[fieldKey] = val
      renderAll()
      saveToFirebase()
    })
  })
}
```

**Field key conventions:**
- Text/select: `fullName`, `rankPosition`
- Yes/No: prefixed by section: `ip_*`, `er_*`, `os_*`, `sv_*`, `cp_*`, `sf_*`, `ti_*`

## 5. Table Inline Editing

```javascript
function buildTableCell(col, r, rowIdx) {
  let input;
  if (col.type === 'text') {
    input = `<input class="td-input" type="text" value="${escHtml(r[col.field] || '')}" />`
  } else if (col.type === 'scale-er') {
    const val = r[col.field] || 'null'
    input = `<select class="td-select td-scale-select scale-er-${val}">
      <option value="null">—</option>
      ${[0,1,2,3,4,5].map(v => `<option value="${v}" ${val === v ? 'selected' : ''}>${v}</option>`).join('')}
    </select>`
  }
  // ... other types

  const td = document.createElement('td')
  td.innerHTML = input
  td.querySelector('input, select').addEventListener('change', e => {
    r[col.field] = parseValue(e.target.value)
    updateTableRowHighlight(rowIdx)
    renderAll()
    saveToFirebase()
  })
  return td
}
```

## 6. Monthly Trends + Branch Filtering

```javascript
function renderMonthlyTrendChart(completed) {
  const monthCounts = {}
  completed.forEach(r => {
    if (!r.dateOfExit) return
    const month = r.dateOfExit.slice(0, 7)
    monthCounts[month] = (monthCounts[month] || 0) + 1
  })

  const months = Object.keys(monthCounts).sort()
  months.forEach((m, i) => {
    const curr = monthCounts[m]
    const prev = i > 0 ? monthCounts[months[i - 1]] : curr
    const trend = curr > prev ? 'up' : curr < prev ? 'down' : 'flat'
    // Render bar with trend indicator
  })
}

function getFilteredCompleted() {
  return records.filter(r => {
    if (!r.fullName?.trim()) return false
    if (!isWithinPeriod(r.dateOfExit, tableFilter.period)) return false
    if (tableFilter.detachment && r.detachment !== tableFilter.detachment) return false
    return true
  })
}
```

## 7. Excel Styling (xlsx-js-style)

```javascript
const ER_BG = { null:'F1F5F9', 0:'F8FAFC', 1:'FEF9C3', 2:'FEF3C7', 3:'FED7AA', 4:'FECACA', 5:'EF4444' }
const ER_FC = { null:'94A3B8', 0:'94A3B8', 1:'854D0E', 2:'92400E', 3:'9A3412', 4:'991B1B', 5:'FFFFFF' }

function xs(bg, fc='1E293B', bold=false, align='left') {
  return {
    fill: { patternType: 'solid', fgColor: { rgb: bg } },
    font: { bold, color: { rgb: fc }, name: 'Calibri', sz: 10 },
    alignment: { vertical: 'center', horizontal: align },
    border: { /* thin all around */ }
  }
}

function cellStyleFor(col, raw) {
  if (col.type === 'scale-er') {
    const k = raw != null ? raw : 'null'
    return xs(ER_BG[k] || 'F1F5F9', ER_FC[k] || '1E293B', true, 'center')
  }
  if (col.type === 'yn') {
    if (raw === true)  return xs('DCFCE7', '14532D', true, 'center')
    if (raw === false) return xs('FEE2E2', '991B1B', false, 'center')
    return xs('F1F5F9', '94A3B8', false, 'center')
  }
  return xs('FFFFFF', '1E293B')
}
```

## 8. Mobile Slide Panels

```javascript
function setMobilePanel(panel) {
  const cont = document.getElementById('panel-container')
  cont.classList.remove('mp-records', 'mp-sections', 'mp-form')

  if (panel === 'records') mobilePanelState = 'records'
  else if (panel === 'sections') { cont.classList.add('mp-sections'); mobilePanelState = 'sections' }
  else if (panel === 'form') { cont.classList.add('mp-form'); mobilePanelState = 'form' }
}
```

```css
@media (max-width: 767px) {
  #col-records, #col-sections, #col-form {
    position: absolute; inset: 0; width: 100%;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Default: records visible */
  #col-records  { transform: translateX(0); }
  #col-sections { transform: translateX(100%); }
  #col-form     { transform: translateX(200%); }

  /* Sections active */
  .mp-sections #col-records  { transform: translateX(-100%); }
  .mp-sections #col-sections { transform: translateX(0); }
  .mp-sections #col-form     { transform: translateX(100%); }

  /* Form active */
  .mp-form #col-records  { transform: translateX(-200%); }
  .mp-form #col-sections { transform: translateX(-100%); }
  .mp-form #col-form     { transform: translateX(0); }
}
```

## 9. Company Theme Switching

```javascript
function switchCompany(id) {
  currentCompany = id
  localStorage.setItem('exit_interview_active_company', id)
  document.body.setAttribute('data-company', id)
  renderAuthControl()
  renderAll()
  if (currentView === 'summary') renderSummary()
  if (currentView === 'table') renderTable()
}
```

```css
#app-header { background-color: #1e3a8a; }  /* Blue default */
body[data-company="moriah"] #app-header { background-color: #2e1065; }
body[data-company="moriah"] .header-tab.active-tab { background: #6d28d9; }
body[data-company="moriah"] .trend-bar { background: linear-gradient(to top, #7c3aed, #a78bfa); }
```
