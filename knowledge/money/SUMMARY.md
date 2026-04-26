# CHALEE Budget Tracker — Quick Reference

**Personal budget tracker, branded for Charlie.** All data persists via **Firebase RTDB** (no localStorage fallback for data; only UI prefs).

**Stack:** Vanilla JS (~2,126 lines), Tailwind, Material Icons, PWA. Last commit Apr 26, 2026.

## File Structure
```
money/
├── index.html              (610 lines) — DOM shell, modals, nav
├── script.js               (2,126 lines) — Logic, sync, calculations
├── style.css               — Animations, snap layout, glass cards
├── manifest.json           — PWA (name "Money", display "standalone")
└── assets/money-icon.png   — 512×512
```

## Categories (Fixed 4 per month)
1. **Income Sources** (`incomeSources`) — Salaries, bonuses, passive income (recurring optional)
2. **Fixed Expenses** (`fixedExpenses`) — Rent, utilities, subscriptions (ALWAYS recurring)
3. **Credit Cards** (`cc`) — Payments + history log
4. **Others** (`others`) — Discretionary, variable

## Item Structure
```js
{
  id: "abc123xyz",      // generateId() → 9-char random
  name: "Monthly Rent",
  amount: 15000,
  isPaid: false,        // Mark paid status
  logs: [               // CC-only: payment history
    { id, amount, timestamp }
  ]
}
```

## State (script.js)
```js
let currentUser = null;        // "Charlie" or "Karla"
let currentMonthIdx = 0;       // 0–11
let appData = null;            // Entire Firebase object
let activeView = "budget";     // budget | stats | commitments | trajectory
let dbRef = null;
let isEditMode = false;
let sortableInstances = [];
```

## Firebase Schema
**Path mapping:** Charlie → `chalee_v1/`, Karla → `karla_v1/`

```js
appData = {
  startingBalance: 85000,
  monthlyData: {
    0: { incomeSources: [...], fixedExpenses: [...], cc: [...], others: [...] },
    // ... 1-11
  },
  completedMonths: { 0: { completedAt: 1704067200000 }, ... },
  wedding: { charlaPaid, grandTotal, vendorPaid },
  trajSettings: { salary, rent, familyMode, livingExpenses }
}
```

## Key Functions
- `selectUser(name)` — Load user data, init UI, real-time listener
- `switchView(view)` — Switch active view with opacity transition
- `openModal(type, id, name, amount, monthIdx)` — Edit/add dialog
- `saveModal()` — Persist item to Firebase (handles recurring scope)
- `deleteItem()` — Remove item across month range
- `completeMonth(monthIdx)` — Mark done: paid all expenses, zero income, hide
- `toggleEditMode()` — Sortable.js reordering
- `reorderItems(monthIdx, type, newOrder)` — Save new order
- `calculateMonthlyTotals(monthData)` — `{income, expenses, savings}`
- `getRunningBalanceAt(monthIdx)` — Cumulative balance
- `updateAllCalculations()` — Loop all months, animate displays

## CRUD Flow
**Create:** `addRecord()` → `set(push(ref(db, PATH)), obj)` → Firebase generates ID → `onValue` listener fires → re-renders.

**Read:** `onValue(ref(db, PATH), cb)` — real-time, fires on initial load + any change.

**Update:** `update(ref(db, "...{id}"), partial)` — partial merge.

**Delete:** `remove(ref(db, "...{id}"))` — for fixed expenses, removes from current + all future months.

## Sync Bar
- `#sync-bar` (2px gradient at top)
- Visible during write, hidden 400ms after ack
- Only on writes (not reads)

## Why
- **Why Firebase (no localStorage):** Multi-device sync, shared data (wedding fund)
- **Why category-based (not free-form):** Simple mental model, tax mapping
- **Why isPaid flag:** Quick toggle, deferred obligation tracking
- **Why two-user (Charlie + Karla):** Personal/joint wedding planning, simple auth
- **Why dark slate theme:** Frequent use, eye strain, fintech aesthetic
- **Why hardcoded CharLa schedule:** Wedding June 2026, fixed dates
