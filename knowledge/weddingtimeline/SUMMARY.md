# WeddingTimeline — Wedding Day Binder

**Wedding planning binder with 15 chapters: timeline, vendor list, seating/floor plan, wishlist.**

**Stack:** Vanilla JS PWA, Tailwind v4, Material Icons Round, Firebase RTDB, Firebase Storage. Last commit Jan 24, 2026.

**Wedding Date:** July 2, 2026 (`new Date("2026-07-02T00:00:00")`).

## File Structure
```
weddingtimeline/
├── index.html      (23 KB) — DOM, modals, overlays
├── script.js       (84 KB) — Firebase sync, rendering
├── style.css       (77 KB) — Tailwind v4, design tokens, responsive
├── manifest.json   — PWA metadata
└── assets/         — 16 JPEG images (1.JPG–16.JPG)
```

## 15 Chapters (IDs 0–14)
- **Paperwork (0–4):** The Foundation, The Basics, Document Request, The Seminars, The License (6mo→2mo out)
- **Party (5–6):** Vendor Guild, Entourage
- **Day-of (7–12):** Ceremony Inventory, Reception Inventory, Emergency Kit, Snapshot List, The Music Box, Side Quests
- **Layout (13):** Boss Room Layout (interactive floor plan)
- **Social (14):** TikTok Trends

## Chapter Types
- **list** (0–4, 7–12, 14): `[{ text, checked }]` — checklist items
- **table** (5–6): `[[cell1, cell2, cell3], ...]` with headers
- **planner** (13): Interactive floor plan with `layout` map of `{x, y, type, label, w, h, locked, assigned}`

## Firebase RTDB
- **Path:** `wedding_data/`
  - `chapters/` — array of 15 chapter objects
  - `toBuy/` — map of wishlist items
- **Path:** `guestList/` — map of `{ name, role, notes }`

## Wishlist (Things to Buy) Schema
```js
toBuyData = {
  itemId: {
    id, name, price, category, status: "wishlist"|"decided"|"bought",
    link, note, imageURL, imagePath,
    parentId,        // null = primary, else parent ID (variants)
    createdAt, updatedAt
  }
}
```

**Variants:** Parent items can have alternative variants (`parentId = parent.id`). Display: parent shows variant chips; quick view shows full alternatives grid.

## Image Storage
- Wedding items at `wedding/tobuy/{timestamp}_{random}.jpg`
- Compressed client-side (max 1400px, JPEG 0.82 quality)

## State (Mutable, Persisted)
```js
weddingData          // Full chapter + layout tree
guestDataMap         // { guestId: { name, role, notes } }
toBuyData            // { itemId: { name, price, ... } }
```

**UI state (ephemeral):**
```js
activeIndex          // Currently open chapter modal
activeFilter         // Gallery filter
activeView           // "grid" or "timeline"
currentTableId       // Floor plan table being edited
isDraggingTable      // Pauses Firebase sync during drag
isResizing           // Pauses sync during resize
scale, panX, panY    // Floor plan zoom/pan
```

## Floor Plan Planner (Chapter 13)
- **Wheel zoom:** scale ∈ [0.2, 3]
- **Mouse + touch pan:** 2-finger pinch-zoom on mobile
- **Table drag/resize:** sets `isDragging*=true` to pause Firebase sync, updates `obj.x/y/w/h`, pushes on end
- **Lock/delete:** `lock-btn` toggles `layout[id].locked`; `delete-table-btn` requires confirmation
- **Object types:** circle, square, rect, vip, corner, h-line, v-line, text

## Seat Assignment (Modal)
- **Left pane:** Zoom table preview with draggable initials bubbles
- **Right pane:** Role-grouped guest picker with search + ROLE_HIERARCHY ordering (bride, groom, parents, officiant, ...)
- Bubble positions stored as percentages (0–100%) — survives table resize
- Drag bubbles → updates `table.assigned[guestId] = { x, y }`

## Key Functions
- `renderGallery()` — Chapter cards with status filter
- `refreshModal()` — Populate edit modal
- `renderPlanner()` — Floor plan canvas with all objects
- `renderTableContext()` — Seat preview with draggable bubbles
- `renderGuestPicker()` — Role-grouped sortable guest list
- `renderToBuy()` — Wishlist with category grouping + filters
- `renderQuickView()`, `renderItemCard()`, `openAddItem()`
- `pushToFirebase()` — Persist any chapter content change

## Why
- **Why static timeline (no scheduling):** Date ranges are fixed wedding phases (6mo→2mo→day-of)
- **Why Firebase RTDB:** Multi-device sync, free tier, simple
- **Why vanilla JS:** No build overhead, ~2K lines glue logic
- **Why planner as DOM (not SVG/canvas):** Avoids math library overhead, leverages browser layout
- **Why wishlist as flat map:** Avoids array index shift on delete
- **Why client-side image compression:** Save bandwidth, no server-side
- **Why percentage seat coords:** Survives table resize
- **Why no auth:** Anyone with URL can edit (security risk acknowledged)
