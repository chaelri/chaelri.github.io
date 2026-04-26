# Guard Exit Interview Tracker — Architecture

## Initialization Flow
```
init()
  → loadFromStorage() [read localStorage]
  → loadFromFirebase() [read RTDB]
    → startFirebaseListener() [attach real-time listener]
  → renderAll() [build UI]
  → applyEditorMode() [readonly-mode class if !isEditor]
```

## Authentication & View-Only Mode

**OAuth Flow:**
- User clicks "Editor sign-in" → `firebase.auth.GoogleAuthProvider` popup
- `fbAuth.onAuthStateChanged(user => { ... })` fires on success/sign-out
- Email checked against `ALLOWED_EDITORS`
  - Match: `isEditor = true`, form/delete buttons enabled, "editor access" badge
  - No match: `isEditor = false`, `body.classList.add('readonly-mode')`, inputs disabled

**View-Only Enforcement (multi-layer):**
1. CSS: `body.readonly-mode #btn-new-record { display: none !important; }`
2. CSS: `body.readonly-mode input { pointer-events: none; cursor: not-allowed; }`
3. JS: `saveToFirebase()` returns early if `!isEditor`
4. JS: `addRecord()`, `confirmDelete()` guard with `!isEditor` check
5. UI: `#readonly-banner` visible only when `readonly-mode` class present

## Data Layer

### RTDB Sync Strategy

**Path Structure:**
```
guard_exit_interview/
  └── manela/   [array]
  └── moriah/   [array]
```

**Sync:**
- **Write:** `saveToFirebase()` → `getFirebaseRef().set(records)` (overwrites entire array)
- **Read on init:** `loadFromFirebase()` → `.once('value')`, compares with localStorage
- **Listen:** `startFirebaseListener()` → `ref.on('value', cb)` detects remote changes
- **Conflict:** If Firebase data differs from local, Firebase wins
- **Fallback:** If Firebase has no data, local is pushed up

## UI Rendering Pipeline

### 1. Form View (Desktop: 3-column)
```
renderAll()
  ├─ updateHeaderSubtitle() ["X completed · Y total"]
  ├─ renderRecordList()     [#record-list with active highlight]
  ├─ buildSectionNav()      [SECTIONS list]
  └─ renderFormSection()
      └─ render* dispatch by section (renderGuardInfo, renderIncomePayroll, etc.)
         ├─ makeCard(), makeGrid2(), makeTextField(), etc.
         └─ wireTextInputs, wireSelects, wireScaleButtons, wireYNButtons
            [change listener → update record → renderAll() → saveToFirebase()]
```

**Mobile Form View (Slide Panels):**
- 3 panels absolutely positioned, translateX(-100%/-200%)
- Tap record → show sections panel
- Tap section → show form panel
- Back button returns to records
- Breadcrumb shows current record name

### 2. Summary View (KPI + Charts)
```
renderSummary()
  ├─ renderPeriodFilter()      [date range, monthly/quarterly/all]
  ├─ getFilteredCompleted()    [records with fullName, within period]
  ├─ renderKPIs()              [completed, total, %, avg tenure]
  ├─ renderMonthlyTrendChart() [bars per month, up/down trends]
  ├─ renderExitReasonsChart()  [donut + legend, top 8]
  ├─ renderExitTypeChart()     [pie: Voluntary/Terminated/etc]
  ├─ renderTrustIndexChart()   [gauge + bars by category]
  ├─ renderOpStressorsChart()  [horizontal bars + frequency]
  ├─ renderSupervisionChart()  [risk alert + stacked bars]
  ├─ renderStayFactorsChart()
  ├─ renderServiceLengthChart()
  ├─ renderRecommendChart()
  └─ renderDetachmentChart()
```

**Period Filtering:**
- `getPeriodBounds(period)` returns `{startDate, endDate}`
- Completed records: `r.fullName && r.dateOfExit within period`
- Branch filtering: detachment dropdown

### 3. Table View (Inline Editing)
```
renderTable(refocusSearch)
  ├─ getTableRows()      [search/sort/filter applied]
  ├─ renderTableBody()   [tbody with inline <select>, <input>, <textarea>]
  ├─ Sticky columns: ID + Full Name (left: 52px each)
  ├─ Group header row (merged, dark background)
  ├─ Field header row (sortable, sticky at top:27px)
  └─ Data rows with scale-colored selects
```

**Column Types:** text, number, date, select, scale-er (0-5 yellow→red), scale-ti (1-5 red→green), freq (0-3 for stressors), yn (Yes/No green/red), textarea.

**Inline Editing:**
- On input change, record updated, `renderAll()` called, Firebase synced
- Sortable headers (click to toggle asc/desc)
- Filter by detachment (branch dropdown)

## Excel Export (xlsx-js-style)

**Sheet 1: Records**
- Row 0: Group headers (Guard Info, Income & Payroll, etc.) — merged cells
- Row 1: Field labels with light blue background
- Rows 2+: Data, color-coded by column type
- Frozen panes: Row 0&1, columns 0&1 (ID + name visible)

**Sheet 2: Summary Analytics**
- Monthly trend table, Exit reason rankings %, Exit type counts
- Trust index breakdown, Operational stressors severity, Supervision flags + risk
- Stay factors, Service length distribution, Recommendation, Detachment

**Color Maps (RGB Hex):**
- ER: `null:'F1F5F9'`, `0:'F8FAFC'`, `1:'FEF9C3'`...`5:'EF4444'`
- TI: `null:'F1F5F9'`, `1:'FECACA'`...`5:'22C55E'`
- FR: `null:'F1F5F9'`, `0:'F8FAFC'`, `1:'FEF9C3'`...`3:'FECACA'`

## Mobile Responsive
- Breakpoint 767px: 2-row header, 3 sliding panels, bottom nav, breadcrumb bar, table horizontal scroll
- Touch targets ≥44px, 16px font in inputs

## Timezone
- Exit dates as `YYYY-MM-DD` (no time)
- Chart grouping by `date.slice(0, 7)` for YYYY-MM
- All dates treated as local
