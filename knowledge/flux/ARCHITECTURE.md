# Flux — Architecture

## Firebase Realtime DB Integration

**Config (script.js 11–23):** `test-database-55379` (asia-southeast1).

**Listener (`fetchTasks`, line 113–130):**
```js
function fetchTasks() {
  onValue(ref(db, "tasks"), (snap) => {
    const data = snap.val();
    allTasks = data ? Object.entries(data).map(([id, val]) => ({ id, ...val })) : [];

    // Sort: priority DESC, then time ASC
    allTasks.sort((a, b) => {
      const pA = priorityScore[a.priority || "none"];
      const pB = priorityScore[b.priority || "none"];
      if (pB !== pA) return pB - pA;
      return (a.time || "99:99").localeCompare(b.time || "99:99");
    });

    renderCalendar();
    renderSidebars();
  });
}
```

Runs on DOMContentLoaded. Re-fetches whenever DB changes (real-time).

## Task CRUD

**Create:**
```js
push(ref(db, "tasks"), { title, desc: "", date: "", time: "", allDay: true, color: "blue", priority: "none" });
```

**Update:**
```js
await update(ref(db, `tasks/${id}`), { date: newDate });          // Drag to date
await update(ref(db, `tasks/${id}`), { isDone: !t.isDone });      // Toggle done
await update(ref(db, `tasks/${id}`), { /* full edit fields */ }); // Edit modal save
```

**Delete:**
```js
await remove(ref(db, `tasks/${id}`));
```

## Calendar Rendering

**Month View (`renderMonthView`, lines 164–200):**
1. First day: `new Date(year, month, 1).getDay()`
2. Pad empty cells before 1st
3. Loop d=1 to daysInMonth, create `.month-cell` (7-col grid, 120px min height)
4. Filter tasks: `allTasks.filter(t => t.date === dateStr)`

**Week View (`renderWeekView`, lines 202–231):**
1. Calculate week start: `new Date(selectedDate).setDate(selectedDate.getDate() - selectedDate.getDay())`
2. Loop i=0 to 6, create `.week-column` (flex: 1)
3. Header: day name + large date number, `.today-column` highlighted

**Day View (`renderDayView`, lines 233–247):**
1. Format selectedDate as "LONG, MONTH DATE"
2. Center container (max-w-4xl mx-auto)
3. Render all tasks with time prefixes ("ALL DAY" if no time)

**Mobile 3-Row (`renderMobile3Row`, lines 612–679):**
1. **Row 1 (#mobile-row-calendar):** mini month grid (7×7), colored dots showing tasks
2. **Row 2 (#mobile-row-details):** task list for selected date with time prefixes
3. **Row 3 (#mobile-row-dump):** collapsible drawer (resizable via #mobile-dump-resizer)

**Drawer Resizer (`setupMobileDrawerResizer`, lines 64–99):**
- Pointer capture, drag to resize
- Min 40px, max 80% viewport height
- `.dump-collapsed` class when h ≤ 50px

## Drag/Drop System

**Pattern (lines 510–600):**
1. `pointerdown`: `handlePillDown()` → set `dragStartX/Y`, capture pointer
2. `pointermove`: if distance > 10px AND drag handle clicked → enter drag state (`.dragging` class, show trash zone, position fixed/cursor-following)
3. `pointerup`:
   - Drag = false → open peek modal (normal click)
   - Drag = true → find drop zone, update task date or delete

**Drop targets:** `.cell-content`, `#pending-tasks-list`, `#trash-zone`.

**Trash zone:** appears at bottom on drag start (height 0 → 120px).

**10px threshold:** prevents accidental scroll-triggered drags.

## Dark Mode (`toggleDarkMode`)

```js
window.toggleDarkMode = () => {
  const isDark = document.documentElement.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
};
```

**Init (line 48–50):**
```js
const savedTheme = localStorage.getItem("theme");
if (savedTheme === "dark") document.documentElement.classList.add("dark");
```

**Tailwind config (index.html 12–14):** `darkMode: "class"`.

## PWA Strategy

**manifest.json:** name "Flux Digital Planner", display "standalone", theme color #2563eb.

**Service Worker (sw.js, Workbox v7.0.0):**
- `skipWaiting()`: activate immediately
- `clientsClaim()`: take control of pages

**Cache Strategies:**
| Route | Strategy | Cache |
|-------|----------|-------|
| HTML, CSS, JS | StaleWhileRevalidate | flux-static-assets |
| Google Fonts | CacheFirst (max 20) | google-fonts |
| Tailwind CDN | StaleWhileRevalidate | tailwind-cdn |
| Firebase (gstatic) | CacheFirst | firebase-core |

**Registration (index.html 497–506):**
```js
navigator.serviceWorker.register("/flux/sw.js", { scope: "/flux/" });
```

## Offline Behavior

- First visit: Firebase cached
- Subsequent: cached Firebase loaded
- BUT: can't make real-time DB calls without network
- **No offline edit queue** — edits offline are lost

## Hotkeys (`setupHotkeys`, line 101–111)

```js
window.addEventListener("keydown", (e) => {
  if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
  if (e.key.toLowerCase() === "m") changeView("month");
  if (e.key.toLowerCase() === "w") changeView("week");
  if (e.key.toLowerCase() === "d") changeView("day");
  if (e.key.toLowerCase() === "t") goToToday();
  if (e.key.toLowerCase() === "n") /* focus task input */;
});
```

Disabled when input/textarea focused.

## Responsive

**Mobile <768px:** Hide desktop, show 3-row mobile.
**Desktop ≥768px:** Hide mobile, show sidebar + calendar.

**Resize listener (line 692):** `window.addEventListener("resize", renderCalendar);`
