# CHALEE — Architecture

## Layered Model

```
UI (HTML+CSS) → Logic (script.js) → Firebase RTDB (asia-southeast1)
                                  ↘ shared with Horizon (read-only consumer)
```

## CRUD Flow

**Create (`openModal(type)`):**
1. User clicks "+" → `openModal()` initializes `activeEdit = { type, id: null, monthIdx, isPaid: false }`
2. Form rendered into `#modal-body`: `#edit-name`, `#edit-amount`, `#edit-recurring` (except fixedExpenses), CC quick-add log
3. Save → validate → determine recurring scope: `endIdx = isRecurring ? 11 : monthIdx`
4. For each month in [startIdx, endIdx]: update existing (by id) or push new with `id = generateId()`
5. `syncSet(dbRef, appData)` → Firebase write
6. `onValue` listener fires → `updateAllCalculations()`

**Read (`renderRows(monthIdx, key, items, colorClass)`):**
- Get list from `appData.monthlyData[monthIdx][type]`
- For each item: create row with name/amount/status indicator
- `isPaid === true` → dim, checkmark
- `isPaid === false` → full opacity, payment button
- Append to `#{type}-list-{monthIdx}`

**Update:** Same as Create flow with `activeEdit.id` set, `#save-btn` text "Update", `#delete-btn` visible.

**Delete (`deleteItem()`):**
- Determines scope: `isFixed = (type === "fixedExpenses")`, `endIdx = isFixed ? 11 : monthIdx`
- Filters out item by `id` from each month in range
- `syncSet(dbRef, appData)` → re-render

**Mark as Paid (line 1154):**
- Only for expense items (not income), only when editing existing
- Toggles `activeEdit.isPaid`
- On save: `item.isPaid = isPaid`
- Removed from expense calculation

## Calculation Engine

**`calculateMonthlyTotals(monthData)` (line 435):** Returns `{income, expenses, savings}`. Filters `isPaid === false` for expenses.

**`getRunningBalanceAt(monthIdx)` (line 1611):** Cumulative balance from month 0 → specified index.

**`updateAllCalculations()` (line 394):** Loop all months, calculate, animate displays, re-render lists.

**Key rule:** Paid expenses do NOT reduce balance (already reflected in bank).

## View Switching

**`switchView(view)` (line 916):**
- Hide all views (opacity 0, pointer-events: none)
- Show target view
- Update nav pill position
- Lazy-render view-specific content (renderStats / renderCommitments / renderTrajectory)

## Firebase Sync

**Init (`selectUser`):**
- Path: `chalee_v1` (Charlie) or `karla_v1` (Karla)
- One-time fetch: `get(dbRef)` → if exists, load; else init empty + push
- Listener: `onValue(dbRef, ...)` for multi-device sync

**Write (`syncSet(ref, data)`):**
- Show sync bar (#sync-bar 2px gradient at top)
- `await set(ref, data)` → Firebase write
- Hide sync bar (400ms delay)

## Mobile vs Desktop

**Mobile (<768px):**
- Horizontal snap-scroll (swiper) for budget view
- Single row of abbreviated month buttons
- Bottom nav with icon + label
- Modals as bottom sheets

**Desktop (≥768px):**
- 200px sidebar with 12 month buttons
- Single-pane vertical scroll, hidden months
- Center-aligned modal pop-ups
- Month picker hidden

**Resize handler (line 1391):** detects breakpoint change, re-shows months, scrolls to active.

## Edit Mode (Sortable.js)

**`toggleEditMode()` (line 771):**
1. Sets `isEditMode = true`, re-renders
2. For each list in current month: `setupSortableLists(monthIdx)` (line 810)
3. Sortable.js binds drag handle (`.sort-handle`)
4. On drop: `reorderItems(monthIdx, type, newOrder)` overwrites array, syncs to Firebase

## Complete Month (`completeMonth(monthIdx)`)

1. Confirmation modal with summary
2. Mark all expenses `isPaid = true`
3. Set all income `amount = 0`
4. Add to `appData.completedMonths[monthIdx]`
5. Visual: dashboard `.opacity-50`, "Completed" badge, hidden from swiper
6. Auto-navigate to first active (uncompleted) month

## Trajectory View (`renderTrajectory()` line 1943)

**Inputs (`appData.trajSettings`):**
- `salary`: 125K / 185K / 210K
- `rent`: monthly (default ₱15K)
- `livingExpenses[]`: array of items
- `familyMode`: "full" / "prorated" / "none"

**Logic:**
1. Extract monthly income from current data
2. For next 24 months: salary + rent + living + family (per mode)
3. Compute net = income - (rent + living + family)
4. Render 24 month cards with ending balance projection, expense breakdown (% pie-style), color coding
