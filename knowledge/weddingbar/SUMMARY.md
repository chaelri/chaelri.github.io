# WeddingBar — Cost Tracker

**Wedding expense tracker with checklist + guest Kanban.** Vanilla JS PWA with real-time Firebase RTDB sync.

**🚨 DUAL DEPLOYMENT:**
1. **GitHub Pages:** `https://chaelri.github.io/weddingbar/`
2. **Firebase Hosting:** Root domain (configured in `firebase.json` with `"public": "weddingbar"`)

This directory is the Firebase Hosting public root AND a GH Pages subpath.

## File Structure
```
weddingbar/
├── index.html          (27 KB) — Modular sections (costs/checklist/guests)
├── script.js           (85 KB) — All logic, Firebase, PWA register
├── style.css           (29 KB) — Dark theme, Tailwind-inspired
├── sw.js               (1.5 KB) — Network-first cache
├── manifest.json       (495 B) — PWA metadata
└── icons/icon-192.png, icon-512.png
```

## Data Models

### Expenses (Firebase: `weddingCosts/{id}`)
```js
{
  name: string,
  total: number,
  paid: number,
  booked: boolean,
  priority: "low"|"medium"|"high",
  createdAt: timestamp,
  attachments: [{ url, path }]   // Firebase Storage
}
```

### Checklist (Firebase: `weddingNextSteps/{id}`)
```js
{
  text: string,
  notes: string|null,
  deadline: string|null,
  priority: "low"|"medium"|"high",
  done: boolean
}
```

### Guests (Firebase: `weddingGuests/{id}`)
```js
{
  name: string,
  gender: "male"|"female"|"",
  side: "charlie"|"karla"|"both",
  relation: "family"|"friend",
  role: "guest"|"bride"|"groom"|"parent"|"bridesmaid"|"groomsman"|"principal"|"secondary",
  rsvp: "pending"|"yes"|"no",
  notes: string
}
```

## Storage Layers
| Where | What |
|-------|------|
| Firebase RTDB | Expenses, checklists, guests (real-time sync) |
| Firebase Storage | Receipt/quote images (`weddingCosts/{itemId}/{filename}`) |
| localStorage | UI prefs only: `mainSort`, `tableSort` |

**No task/expense data in localStorage** — all in Firebase.

## Firebase Config
- **Project:** `test-database-55379` (asia-southeast1)
- **Auth:** Anonymous (public read/write — security risk acknowledged)
- **Real-time:** `onValue()` listeners

## Hardcoded
- **Wedding Date:** July 2, 2026
- **Theme:** `#071025` dark navy
- **Currency:** Philippine Peso (`Intl.NumberFormat("en-PH")`)

## Sorting Options
1. Alphabetical (A→Z, Z→A)
2. Status (Booked→Not, Not→Booked)
3. Paid amount (low→high, high→low)
4. Total amount (low→high, high→low)
5. Progress % (low, high)
6. Priority (high→low, low→high)

## Live Metrics
- Total Paid (sum of `paid`)
- Grand Total (sum of `total`)
- Progress % (paid/total × 100)
- Booked Count (`booked === true`)
- Remaining Items, Remaining Costs, Days to Wedding

## Guest Filtering
- By side (Charlie/Karla/Both)
- By relation (Family/Friend)
- By role (8 options)
- By RSVP (Yes/No/Pending)
- Full-text search

## Key Sections
1. **#weddingCostsWrapper** — Main cost tracking (default visible)
2. **#checklistPanel** — Checklist tasks
3. **#guestsPanel** — Guest management with Kanban
4. **#tableViewPanel** — Tabular cost view (swipe-right modal)
5. **#galleryPanel** — Expense attachment gallery

## Patterns
- **CRUD Pattern:** `set(push(ref(db, PATH)), obj)` for create, `update(ref(db, "...{id}"), partial)` for update, `remove(ref(db, "...{id}"))` for delete
- **Real-time listener:** `onValue(ref(db, PATH), callback)` re-renders on any change (no debouncing)
- **Kanban drag-drop:** desktop = HTML5 drag events, mobile = touch events with `elementFromPoint()` for drop target

## Why
- **Why Firebase RTDB:** Real-time, simple, low cost
- **Why dual deployment:** Redundancy + decoupling from single vendor
- **Why vanilla JS:** No build step, fast iteration
- **Why PWA + Service Worker:** Install-as-app, offline UI shell
- **Why Firebase Storage (not data URLs):** Bandwidth, lazy-load, scalability
- **Why network-first cache:** Always fresh on update
- **Why no auth:** Personal use, low-sensitivity data (acknowledged risk)
