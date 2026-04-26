# Guard Exit Interview Tracker — Summary

**Active production:** New Manela & New Moriah guard offboarding tracker. Vanilla JS + Tailwind + Firebase Auth + Firebase RTDB + xlsx-js-style Excel export.

## File Structure
```
guard-exit-interview/
├── index.html          (DOM, splash, header, 3-column form, summary, table, mobile nav)
├── app.js              (85 KB, ~3,800 lines, ~60+ functions, data schemas)
├── style.css           (43 KB, Tailwind + custom utilities, responsive)
├── favicon.svg
```

## Key Globals
- `records` — array of guard exit interview objects
- `currentCompany` — `'manela' | 'moriah'` (localStorage persisted)
- `currentUser` — Firebase Auth user or null
- `isEditor` — boolean; true if `currentUser.email` in `ALLOWED_EDITORS`
- `activeRecordIdx` — selected record in form view
- `currentView` — `'form' | 'summary' | 'table'`
- `mobilePanelState` — `'records' | 'sections' | 'form'` (mobile only)

## RTDB Schema
**Path:** `guard_exit_interview/{manela|moriah}` — array of record objects.

**Fields per record (flattened):**
- Guard info: fullName, dateOfExit, typeOfExit, age, maritalStatus, etc.
- Income & Payroll: `ip_*` (yes/no)
- Exit Reasons: `er_*` (yes/no per reason), `er_biggest_impact` (select), `er_other_explain` (textarea)
- Operational Stressors: `os_*` (frequency: 0–3)
- Supervision: `sv_*` (yes/no), `safeToSpeak` (select)
- Complaints: `cp_*` (yes/no)
- Exit Summary: mainExitFactor, secondaryFactor, breakingPoint, wouldRecommend
- Stay Factors: `sf_*` (yes/no), otherSuggestions
- Trust Index: `ti_*` (scale 1–5)

## Firebase Configuration
- Project: `test-database-55379` (asia-southeast1)
- Database URL: `https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app`
- Auth: Google OAuth popup via `firebase.auth.GoogleAuthProvider`
- Realtime sync via listener

## Key Functions
| Function | Purpose |
|----------|---------|
| `init()` | Startup: load storage, Firebase listener, render |
| `switchView(view)` | Render form/summary/table |
| `switchCompany(id)` | Change company; theme swap |
| `renderAll()` | Re-render record list, section nav, form |
| `renderTable()` | Rebuild table view with filters/sorting |
| `renderSummary()` | KPIs, charts (exit reasons, trust, stressors, etc.) |
| `exportXLSX()` | 2-sheet Excel: Records + Summary Analytics |
| `saveToFirebase()` | Sync local records → RTDB (editor only) |
| `loadFromFirebase()` | Pull RTDB on init |

## Selectors
```
#app-header              // Fixed header (blue-900 manela / purple-900 moriah)
#main-content
#form-view, #col-records, #col-sections, #col-form
#summary-view, #table-view
#table-scroll
#readonly-banner         // "View only" warning
body.readonly-mode       // Class applied when !isEditor
```

## ALLOWED_EDITORS
```javascript
['wromantico603@gmail.com', 'kasromantico@gmail.com', 'charliecayno@gmail.com']
```
Non-editors: view-only, create/delete/edit hidden, inputs disabled.

## Company Themes
| Company | Header | CSS |
|---------|--------|-----|
| New Manela | #1e3a8a (blue-900) | default |
| New Moriah | #2e1065 (purple-900) | `body[data-company="moriah"]` |

## Mobile (≤767px)
- Form panels slide horizontally (translateX)
- Bottom nav (4 buttons) replaces desktop header buttons
- Breadcrumb nav bar instead of subtitle
- Touch targets ≥44px; inputs 16px (iOS zoom prevention)

## Storage Keys (localStorage)
- `exit_interview_records_manela`, `exit_interview_records_moriah`
- `exit_interview_active_company`
