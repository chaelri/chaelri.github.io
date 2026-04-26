# Guard Exit Interview Tracker — File-by-File Map

## index.html (~182 lines)

DOM structure with semantic HTML5, Tailwind CDN, Firebase SDK, xlsx-js-style CDN.

**Sections:**
1. **Splash Screen** (lines 33–41): `#splash-screen` with animated logo, fades on init.
2. **Header** (44–93): Fixed `#app-header`, blue-900/purple-900 by company. Title + tabs left. Desktop nav buttons (Form/Summary/Table/Export). `#auth-control` for sign-in. `#readonly-banner` warning.
3. **Main Content** (96–157):
   - **Form View** (99–142): 3-column layout — `#col-records`, `#col-sections`, `#col-form`
   - **Summary View** (145–147): Hidden, swapped via JS
   - **Table View** (150–155): Toolbar + scrollable table
4. **Mobile Bottom Nav** (160–177): 4 buttons (Form/Summary/Table/Export)

## app.js (~3,800 lines)

### Sections by line range:

**1–34: Data & Config**
- `COMPANIES`, `currentCompany`, Firebase init, `ALLOWED_EDITORS`, `currentUser`, `isEditor`

**37–107: Authentication**
- `applyEditorMode()` (37–41): Toggle readonly-mode class
- `renderAuthControl()` (43–99): Sign-in button or badge
- `fbAuth.onAuthStateChanged()` (101–107): Auth state listener

**109–153: Firebase Sync**
- `getFirebaseRef()` (109–111): Returns `ref('guard_exit_interview/' + currentCompany)`
- `saveToFirebase()` (113–118): `set(records)`, guards `!isEditor`
- `loadFromFirebase()` (120–135): `.once('value')`, compare with local
- `startFirebaseListener()` (139–153): Real-time listener

**155–886: Schema Definitions**
- `SECTIONS` (155–165), `EXIT_REASON_CATEGORIES` (167–247)
- `OP_STRESSOR_FIELDS` (248–260), `SUPERVISION_FLAGS` (261–268)
- `COMPLAINT_FLAGS` (269–272), `STAY_FACTOR_FIELDS` (273–280)
- Select options (281–886): EXIT_TYPE, DETACHMENT, LENGTH_OF_SERVICE, MARITAL_STATUS, EDUCATIONAL_ATTAINMENT, FAMILY_LOCATION, IP_*_FIELDS, MAIN_FACTOR_OPTIONS, TRUST_FIELDS, FREQ_LABELS

**888–944: UI State**
- `records`, `activeRecordIdx`, `currentView`, `activeSection`, `mobilePanelState`
- `tableSort`, `tableFilter`, `filteredRows`

**967–1014: Initialization**
- `init()`: loadFromStorage → loadFromFirebase → startFirebaseListener → renderAll → splash hide

**1018–1041: Local Storage**
- `loadFromStorage()`, `saveToLocalStorage()`

**1047–1088: Layout & Mobile**
- `updateHeaderHeight()`, `isMobile()`, `setMobilePanel(panel)`, `updateMobileBreadcrumb()`, `updateMobileBottomNav(view)`

**1096–1124: View Switching**
- `switchView(view)`, `renderAll()`, `updateHeaderSubtitle()`

**1125–1195: Company Switching**
- `switchCompany(id)`: updates path, body data-company attr, re-renders

**1197–1260: Record List**
- `renderRecordList()`, `confirmDelete(idx)`, `addRecord()`

**1260–1306: Section Navigation**
- `buildSectionNav()`, `updateSectionNavActive()`, `renderFormSection()`

**1307–1583: Form Rendering**
- `renderGuardInfo()`, `renderIncomePayroll()`, `renderExitReasons()`, `renderOpStressors()`, `renderSupervision()`, `renderComplaints()`, `renderExitSummary()`, `renderStayFactors()`, `renderTrustIndex()`

**1584–1688: Form Builders**
- `makeCard()`, `makeGrid2()`, `makeTextField()`, `makeSelectField()`, `makeScaleRow()`, `makeFreqRow()`, `makeYNRow()`

**1689–1850: Input Wiring**
- `wireTextInputs()`, `wireSelects()`, `wireScaleButtons()`, `wireYNButtons()`

**1850–2410: Table View**
- `getTableRows()`, `renderTable()`, `renderTableBody()`, `buildTableCell()`, `updateTableRowHighlight()`
- `TABLE_COLUMNS` schema (1749–1820)

**2407–2459: Period Filtering**
- `getPeriodBounds(period)`, `getFilteredCompleted()`, `renderPeriodFilter()`

**2614–3440: Summary View**
- `renderSummary()` + 11 chart functions

**3442–3700+: Excel Export**
- `exportXLSX()`, `xs(bg, fc, bold, align)` style builder, `cell(v, style)`, `applyStyles(ws, rows)`, `cellStyleFor(col, raw)`

## style.css (~1,615 lines)

- Splash (1–78)
- Base (80–104): Root vars, scrollbar, fonts
- Layout utilities (106–119): `.header-tab`, `.record-item`, `.section-nav-item`
- Form (212–428): `.form-card`, `.field-*`, `.btn-scale`, `.btn-trust`, `.btn-freq`, `.btn-yn`, `.scale-row`
- Summary (439–556): `.kpi-card`, `.bar-row`, `.bar-fill-*`
- Table (712–1063): `.data-table`, `.group-header`, `.field-header`, `.sticky-col`, `.td-scale-select`, `.scale-er-*` / `.scale-ti-*`
- Company themes (1085–1272): `body[data-company="moriah"]` overrides
- Mobile (1289–1502): `@media (max-width: 767px)` + `@media (max-width: 380px)`
- Read-only mode (1511–1615)

## Utility Functions

- `key(label)` (923–965): camelCase from label (e.g., "Low salary" → "lowSalary")
- `escHtml(str)`: HTML escape
- `blankRecord(id)` (888–921): Empty record with all fields initialized
