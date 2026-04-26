# Flux — Decisions

## Why Firebase RTDB (Not localStorage)

- **Real-time sync** across tabs/devices (instant updates)
- **Scalability** (unlimited tasks vs 5-10MB localStorage)
- **Data integrity** (server-side ops atomic)
- **Future-proof** (multi-user, offline sync extensible)

**Trade-off:** Requires network for writes (no offline edit queue).

## Why No Offline Edit Queue

- Simpler UI (no "pending changes" indicator)
- Firebase is source of truth
- Most users have persistent connection
- Avoids sync conflict resolution complexity

**Trade-off:** Edits offline are discarded silently.

## Why Drag-and-Drop Scheduling

- Visual, intuitive (matches paper planner)
- Faster than modal form for reschedule
- Engaging UX (gamification)

**Implementation:** Drag handle required (10px threshold prevents accidental drags from scroll).

**Trade-off:** Can't drag to change time (must use edit modal).

## Why Three Calendar Views

- **Month:** overview, whole month at a glance
- **Week:** plan around meetings/deadlines
- **Day:** deep focus on single day
- **Hotkeys (M/W/D):** power user efficiency

**Trade-off:** 3 render functions, 3 CSS rule sets.

## Why Mobile 3-Row Split

- No modal stacking (one modal = whole screen)
- Mini grid shows whole month, tap to jump
- Resizable drawer adapts to user preference
- Accessible touch targets

**Trade-off:** Limited space for task list (row 2).

## Why Subtasks as Object Array

```js
subtasks: [{ text: "Step 1", done: false }, ...]
```

- Simple toggle (flip `done`)
- Display: progress bar (X/N completed)
- Preserve order, reuse existing text

**Trade-off:** No nested edit (can't edit subtask text after creation).

## Why Priority as Metadata (Not Filter)

- Visual cue (red/orange/blue stripe)
- Sorting bubbles high-priority to top
- Reduces toolbar clutter

**Trade-off:** No "show only high priority" filter.

## Why Hotkey Shortcuts + Material Icons

- **Hotkeys:** power user UX, single letter mnemonic
- **Material Icons:** consistent, accessible, free CDN

**Trade-off:** No hotkey customization, Material Icons CDN dependency.

## Why Tailwind + Custom CSS

- Fast prototyping (Tailwind utilities)
- Custom for complex layouts (grid, drag, dark mode tweaks)
- No build step

**Trade-off:** CSS not tree-shaken (whole Tailwind via CDN).

## Why No Authentication

- MVP scope: single user, no privacy requirement
- Reduces onboarding friction
- Firebase rules not configured (default: anyone can edit)

**⚠️ Security risk:** Anyone with database URL can edit/delete all tasks. Not suitable for production.

## What's NOT Included

- ❌ Recurring tasks (every day/week)
- ❌ Task dependencies / blocking
- ❌ Team collaboration / sharing
- ❌ Cloud sync to other devices (only within-app real-time)
- ❌ Notifications / reminders
- ❌ Undo/redo
- ❌ Search or full-text filtering
- ❌ Custom tags/categories (only color)
- ❌ Time-blocking or estimates
- ❌ Export (CSV, PDF, etc.)
- ❌ Keyboard customization
- ❌ Mobile native app
