# WeddingBar — Architecture

## Layered Model

```
UI (HTML+CSS) → Logic (script.js) → Firebase RTDB + Firebase Storage
                                  ↘ Service Worker (offline shell)
                                  ↘ localStorage (UI prefs only)
```

## Persistence Layers

### Firebase Realtime DB (PRIMARY)
- **Project:** `test-database-55379`, asia-southeast1
- **Auth:** Anonymous (public read/write — security risk acknowledged)
- **Real-time listeners (3 main):**
  1. Expenses: `onValue(ref(db, "weddingCosts"), cb)` — re-renders bar chart + summary
  2. Checklist: `onValue(ref(db, "weddingNextSteps"), cb)` — when panel open
  3. Guests: `onValue(ref(db, "weddingGuests"), cb)` — list or Kanban view

**CRUD:**
```js
saveEntry(obj)  → set(push(ref(db, PATH)), obj)
listenRealtime() → onValue(ref(db, PATH), callback)
updateEntry(id, obj) → update(ref(db, `${PATH}/${id}`), obj)
deleteEntry(id) → remove(ref(db, `${PATH}/${id}`))
```

### Firebase Cloud Storage (SECONDARY)
- Path: `weddingCosts/{itemId}/{filename}.jpg`
- Compress image client-side (canvas) before upload
- Upload returns CDN URL + path metadata
- URL + path stored in `attachments` array in RTDB
- Delete: `deleteFromFirebaseStorage(path)` removes file + RTDB metadata

### Browser localStorage (UI ONLY)
- `mainSort`: expense list sort preference
- `tableSort`: table view column sort state (JSON)

**NOT used for data** — all expenses/checklists/guests in Firebase.

### Service Worker (`sw.js`)

**Network-first with cache fallback:**
```
User requests resource
├─ TRY: Fetch from network → update cache → serve
└─ IF FAIL: Serve from cache
```

**Cached:** `index.html`, `style.css`, `script.js`, `manifest.json`, icons.
**NOT cached:** Firebase RTDB responses (live data only).

**Version Strategy:** `weddingbar-v{Date.now()}` — auto cache-bust per deploy.

**Offline:** App shell works; data does not.

## Rendering & State Management

**No framework, pure DOM manipulation.** State lives in Firebase (source of truth). DOM updated by render functions called after Firebase changes.

**Main render functions:**

1. **`render(items, sortType)`** — Expense bar chart
   - Sorts items by selected criteria
   - Creates bar-card elements (button + progress)
   - Mobile = width %, Desktop = height %

2. **`updateSummary(items)`** — Stats + circle progress
   - Calculates totalPaid, grandTotal, progress %
   - SVG stroke-dashoffset animation
   - Updates Booked, Remaining Items, Remaining Costs

3. **`showDetails(item)`** — Detail panel
   - Form fields (name, paid, total, booked, priority)
   - Attachment list with delete buttons
   - File input for new attachments
   - Update/Delete buttons → Firebase

4. **`loadGuests()` / `renderGuestList()`** — List or Kanban
   - Fetches from Firebase, applies search + filters
   - Toggle list view vs Kanban (drag-drop columns)
   - Each guest row editable inline

5. **`renderTableView(items)`** — Tabular cost view
   - Sortable columns (click header)
   - Mobile swipe-right modal

6. **`renderGallery(items)`** — Attachment gallery
   - All attachments in grid, click for fullscreen viewer

## Real-Time Sync & Event Loop

**Listener Lifecycle:**
```js
function listenRealtime() {
  onValue(ref(db, PATH), (snap) => {
    const arr = Object.keys(val).map((id) => ({ id, ...val[id] }));
    render(arr, savedSort);
    updateSummary(arr);
  });
}
```

**Behavior:**
- Listener attaches, sends snapshot (initial + real-time)
- Re-renders whenever ANY item changes
- ⚠️ No debouncing (rapid changes = rapid re-renders)

**Unsubscribing:** `guestsUnsub = onValue(...)`. Call before new `onValue` to prevent leaks.

## Form → Firebase Flow

```
User fills form (name, total, paid, booked)
    ↓
"Add / Save" click → validate
    ↓
saveEntry({ name, total, paid, booked, priority, createdAt })
    ↓
set(push(ref(db, PATH)), obj)
    ↓
Firebase generates ID
    ↓
onValue() listener fires
    ↓
render() re-draws + summary
    ↓
Form cleared, "✓ Saved!" toast
```

## Guest Kanban Drag-Drop

**Desktop (mouse):**
1. `dragstart` → `dataTransfer.setData("text/plain", guestId)`
2. `dragover` on target column → `e.preventDefault()`
3. `drop` → get guestId, `update(ref(db, `${GUESTS_PATH}/${id}`), { role })`
4. Firebase updates → `onValue()` re-renders → guest moves to correct column

**Mobile (touch):**
- `touchstart`/`touchmove`/`touchend` events
- `elementFromPoint()` for drop target during drag
- Same Firebase update on `touchend`
- `kanbanDragLock` flag prevents duplicate touchend events

## Deployment

**No build step:**
- Vanilla JS (no transpilation)
- Tailwind CDN
- Direct deploy

**Firebase config:**
```json
{
  "hosting": {
    "public": "weddingbar",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"]
  }
}
```

**Deploy:** `firebase deploy` → contents of `weddingbar/` to Firebase Hosting root.

**Dual deployment:**
- Firebase Hosting: `https://test-database-55379.web.app` (or custom domain)
- GitHub Pages: `/chaelri.github.io/weddingbar/`
- Same code served from multiple CDNs
