# WeddingTimeline — Decisions

## Why Read-Only with Dual Edit Modes

Two-layer workflow:

1. **Read-only displays** (gallery, hero, quick view) — show without accidental edits
2. **Edit modals** (bottom sheets, full overlays) — must explicitly open to change data

**Rationale:** Prevents fat-finger mobile edits while scrolling. Firebase real-time sync ensures multi-device consistency.

## Why Static Timeline (Not Dynamic Scheduling)

15 chapters with **fixed date ranges** (Jan 02 – Jul 01).

**Rationale:**
- **Simplicity:** Date ranges map to wedding planning phases (6mo→2mo→day-of)
- **No rescheduling:** Couples don't expect to drag tasks
- **Clear timeline:** Visual "distance from wedding" paramount
- **Discrete milestones:** Each chapter is a milestone, not a dynamic task

**Alternative rejected:** Dynamic scheduling adds conflict resolution + priority queues + calendar views — too complex for a binder.

## Scope vs Related Apps

- **weddingtimeline (this app):** timeline, vendor list, seating/floor plan, wishlist
- **weddingtest:** RSVP, guest list, schedule (the actual invitation)
- **weddingbar:** vendor bar, reception planning
- **wedding100:** 100-day countdown fitness tracker

**weddingtimeline scope:**
- Included: timeline, vendor list, seating, wishlist
- NOT included: RSVPs, budget tracking, vendor payments, invitation designs, photo gallery, ceremony schedule (detailed minute-by-minute)

Deliberately opinionated: a binder, not an ERP.

## Architecture Decisions

### Firebase Realtime DB (No Auth)

**Pro:** instant multi-device sync, no servers, generous free tier.
**Con:** no user isolation (anyone with DB URL can edit).
**Mitigation:** Firebase rules (assumed restrictive, not visible in code).

**Why not alternatives:**
- Firestore: overkill for 2-3 collections
- REST API: no real-time push
- GraphQL: unnecessary complexity
- Local-only: single device, defeats purpose

### Vanilla JS + Tailwind (No Framework)

**Pro:** zero build, instant load, low-connectivity friendly.
**Con:** imperative DOM, manual state, no component reuse.
**Mitigation:** state centralized (weddingData, toBuyData), logical function organization.

**Why not React/Vue:**
- Bundle bloat (100+ KB minified)
- Learning curve
- Overkill for ~2K lines of glue

### Planner Canvas as Absolute Positioning (Not SVG/Canvas)

- Objects stored as `{ x, y, w, h, type, label, assigned }` in layout map
- DOM elements absolutely positioned, transformed with viewport
- **No real SVG:** avoids math library overhead

**Why not Konva/Fabric:**
- Adds 50-100 KB
- Overkill: only 2D translation/scale needed
- Simpler debugging (inspect DOM directly)

### Wishlist as Firebase Realtime Map

`wedding_data/toBuy/` = flat object with auto-IDs:
```
{
  "-O7k...": { name: "Sofa", ... },
  "-O7l...": { name: "Desk", parentId: "-O7k...", ... }
}
```

**Why not array:** Arrays in RTDB are anti-pattern (indices shift on delete).

**Why not Firestore:** RTDB `onValue` simpler (single listener per path).

### Image Compression Client-Side

Max 1400px, JPEG 0.82 quality before upload (2208–2237).

**Pro:** saves bandwidth + storage costs.
**Con:** mobile devices may lack canvas support (rare in 2026).

**Why not server-side:** No backend; Firebase Storage has no transform hooks.

### Seat Assignment as Percentage Coordinates

Bubble positions stored as `{ x, y }` (0-100%) instead of pixels (1244–1250).

**Pro:** survives table resize, responsive across zoom levels.
**Con:** precision loss (rounded to nearest %).

**Rationale:** suitable for visual planner, not precise seat charts.
