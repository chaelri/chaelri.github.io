# WeddingTimeline — Architecture

## Module Overview

Vanilla JS + Tailwind PWA, no frameworks/build tools. CDN deps: Firebase SDK v10.7.1, Tailwind v4, Material Icons Round.

## HTML Structure

- **Single DOM** with hidden overlay panels toggled via `.hidden`
- **No shadow DOM** — pure Tailwind + custom CSS
- **Semantic modals**: `role="dialog"`, `role="alertdialog"`
- **Safe area insets** via `env(safe-area-inset-*)`

## JavaScript Architecture (script.js, 2375 lines)

### Initialization Flow (line 1419–1427)
```
DOMContentLoaded
├─ wireFilters()          // grid/timeline toggle listeners
├─ renderDashboard()      // countdown + progress
├─ setInterval(60s)       // refresh countdown minutely
├─ wireToBuyControls()    // status/category pickers
└─ initSync()             // Firebase listeners
   └─ initToBuySync()     // wishlist sync
```

## State Management

**Global (mutable, persisted):**
```js
weddingData              // Full chapter + layout tree
guestDataMap             // { guestId: { name, role, notes } }
toBuyData                // { itemId: { name, price, category, ... } }
```

**UI state (ephemeral):**
```js
activeIndex              // Currently open chapter modal
activeFilter             // Gallery filter
activeView               // "grid" | "timeline"
currentTableId           // Floor plan table being edited
isDraggingTable          // Pauses Firebase sync during drag
isResizing               // Pauses sync during resize
scale, panX, panY        // Floor plan zoom/pan
```

## Firebase Sync (lines 550–624)

**`initSync()`** attaches `onValue` listeners to `wedding_data` + `guestList`:
- Merges snapshots into `weddingData` and `guestDataMap`
- **Migration:** removes legacy "Phone" column from Ch 5 on first load (562–576)
- **Debounced:** skips remote updates while dragging/resizing (552)
- **Conditional re-renders:**
  - `renderDashboard()` always
  - `renderGallery()` always
  - `refreshModal()` only if `activeIndex !== null`
  - `renderTableContext()` + `renderGuestPicker()` only if Ch13 open & guest picker visible

**`pushToFirebase()` (1412–1415):** Called on chapter content change. `setSyncSaving()` shows spinner, `setSyncOk()` shows checkmark after ack.

## Chapter Rendering

**`renderGallery()` (657–727):**
1. Maps `weddingData.chapters` through status filter (`passesFilter()`)
2. Computes progress (`getChapterProgress()`)
3. Determines status: "now", "upcoming", "done", "overdue" via `computeChapterStatus()`
4. Returns HTML with progress blocks
5. Toggles `.timeline-view` class for CSS grid breakpoints

**`refreshModal()` (768–851):**
- Populates title/period inputs (onchange → `pushToFirebase()`)
- Dispatches by `ch.type`:
  - **list**: renders check items + textareas (798–811)
  - **table**: 3-column rows (819–845)
  - **planner**: calls `renderPlanner()` (793)

## Floor Plan Planner (Chapter 13, lines 892–1192)

**Rendering:**
- Canvas: `#planner-canvas` (raw viewport)
- Viewport: `#planner-viewport` (scaled/transformed group of objects)
- Objects: `.planner-object.table-{type}` (circle, square, rect, vip, text, corner, h-line, v-line)
- Transform: `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${scale})`

**Interactions:**

1. **Wheel zoom (899–905):** scale ∈ [0.2, 3]
2. **Mouse + touch pan (912–959):** `isPanning` flag, 2-finger pinch-zoom on mobile
3. **Table drag (1083–1135):**
   - `isDraggingTable = true` (pauses sync)
   - Updates `obj.x`, `obj.y` locally
   - `update(ref(db), ...)` on mouse/touch end
4. **Table resize (1040–1080):**
   - `isResizing = true`
   - Calculates delta from resize handle
   - Updates `obj.w`, `obj.h` then pushes
5. **Lock/delete buttons (1009–1031):**
   - `lock-btn` toggles `layout[id].locked`
   - `delete-table-btn` requires confirmation

**Adding objects:**
- `window.addTable(type)` (1143–1167) creates new ID + layout entry
- Types: circle, square, rect, vip, corner, h-line, v-line, text

## Seat Assignment Modal (1194–1373)

**Opening:** click planner table → `openSeatModal()` → `renderTableContext()` + `renderGuestPicker()`

**Left pane (`renderTableContext`):**
- `.zoom-table-base.zoom-{type}` (scaled preview)
- `.seat-bubble` per assigned guest (initials inside)
- Drag bubbles → updates `table.assigned[guestId] = { x, y }` (0–100%)
- On drop: `update(ref(db), ...)`

**Right pane (`renderGuestPicker`):**
- Lists guests sorted by `ROLE_HIERARCHY` (bride, groom, parents, officiant, etc.)
- Groups by role with `.picker-role-header`
- Each guest: name, role badge, add/check/lock button
  - Add/check: toggles in `table.assigned`
  - Lock: shown if guest assigned elsewhere
- Search box filters by name (`filterGuestList()`)

## Things to Buy Module (1429–2374)

**Data:**
```js
toBuyData = {
  itemId: {
    id, name, price, category,
    status: "wishlist"|"decided"|"bought",
    link, note, imageURL, imagePath,
    parentId,        // null = primary, else parent ID
    createdAt, updatedAt
  }
}
```

**Variants:** Parent (`parentId = null`) can have alternatives (`parentId = parent.id`).

**Render (`renderToBuy()` 1616–1720):**
1. Filter parents by category & search
2. Sort (recent/name/price)
3. Group by category
4. Each: header + subtotal + item cards
5. Flat view (`toBuyView = "flat"`): skip grouping

**Item Card (`renderItemCard()` 1722–1775):**
- Thumbnail (image or placeholder icon)
- Status badge (color-coded)
- Layers badge (alternative count)
- Variant chips (first 4; "+N more")
- Link & note flags

**Quick View (`renderQuickView()` 1801–1880):**
- Hero image with background blur
- Title, price, category
- Alternative variants section (grid)
- Edit, add alternative, delete actions
- "Make Primary" button (1887–1906) — swaps parent/variant

**Edit Sheet (`openAddItem()` 1949–2011):**
- Form: name, price, category, link, note, status
- Image uploader with compression (2263–2325):
  - Canvas-based resize to ≤1400px max
  - Quality 0.82 JPEG
  - Uploads to `wedding/tobuy/{ts}_{random}.jpg`
  - Progress ring (Compressing → Uploading → Finalizing)
- Status pills: Wishlist, Decided, Bought

**Persistence (`saveCurrentItem()` 2112–2167):**
- New: `push(ref(db, "wedding_data/toBuy"))` → auto ID
- Edit: `set(ref(db, "wedding_data/toBuy/{id}"), {...})`
- Tracks `createdAt` (immutable), `updatedAt` (mutable)

## Status & Filtering (400–441, 642–654)

**`getChapterProgress()`:**
- list: counts checked items
- table: total rows = done (100%)
- planner: tables with ≥1 assigned guest = done

**`computeChapterStatus()`:**
1. If list 100% complete → "done"
2. Parse period string → compare `now` vs start/end:
   - before start → "upcoming"
   - within range → "now"
   - after end + not done → "overdue"
   - after end + done → "done"
3. Fallback: "upcoming" if 0 total, "active" if in-progress

**Filters (`passesFilter()`):**
- "all": everything
- "now"/"active": current chapter
- "upcoming"/"done"/"overdue": status
- "paperwork"/"party"/"dayof"/"social": cluster
