# Guard Exit Interview Tracker — Decisions

## 🚨 CRITICAL: Dual-Repo Deployment

**Every change MUST be committed to BOTH:**

1. **`chaelri.github.io`** (path: `/Users/ccayno/Documents/chaelri.github.io/guard-exit-interview/`) — GitHub Pages public hosting.
2. **`guard-exit-tracker`** (separate repo) — Source of truth, primary development.

**Workflow:**
1. Edit in `chaelri.github.io/guard-exit-interview/`
2. Commit to local `guard-exit-tracker` worktree first
3. Push to `guard-exit-tracker` upstream
4. Sync changes to `chaelri.github.io` repo and push
5. Verify both remotes have the commit

**Rationale:**
- Separation: `guard-exit-tracker` = dev hub, `chaelri.github.io` = deployment surface
- Backup & history: Two independent git histories
- Visibility: Audit-friendly tracking

---

## Why Firebase Realtime Database (RTDB)?

**Pros:**
- Real-time sync (multi-device listener auto-updates)
- Offline capable (Firebase SDK local cache)
- Simple schema matches in-memory `records[]` array
- Low cost (free tier sufficient for guard team size)
- Auth built-in (Google OAuth + email allowlist)

**Cons:**
- Less flexible queries (no built-in date filters)
- No automatic indexing on custom fields

**Alternative considered:** Firestore — rejected as overhead for simple use case.

---

## Why View-Only Authentication Model?

**Allowlist-based, not role-based:**
- All users can view/read
- Only emails in `ALLOWED_EDITORS` can create/edit/delete
- Non-editors see read-only UI: no buttons, disabled inputs, warning banner

**Pros:**
- Simplicity (no roles, permissions, ACL DB)
- Transparency (HR/management can review)
- Audit trail (named editors only)
- Multi-layer enforcement (JS guard + CSS display + CSS pointer events + UI banner)

**Cons:**
- No fine-grained permissions
- Allowlist in code (could move to Firebase config later)

---

## Why xlsx-js-style for Excel Export?

**Enables:**
- Color-coded cells (exit reason scales, trust scales, frequency)
- Merged headers (group columns spanning multiple)
- Frozen panes (ID + Name visible when scrolling)
- Two sheets (Records + Summary Analytics)

**Alternatives rejected:**
- CSV: No styling, frozen panes, or merged headers
- Google Sheets API: OAuth scope expansion, async complexity
- Simple HTML→Excel: Inconsistent styling

`xlsx-js-style` extends `xlsx.js` with styling support; well-maintained, low footprint via CDN.

---

## Why Vanilla JS (No Frameworks)?

**Rationale:**
- Solo developer (Charlie); framework overhead unjustified
- 3 main views (form, summary, table) with straightforward state
- Firebase SDK works well with vanilla JS
- No build step → faster iteration
- Single HTML/JS/CSS deploy = trivial

**Trade-offs:**
- Manual re-render on state change (renderAll() acceptable speed)
- No component isolation (single global `records[]`)
- Verbose DOM querying (mitigated by IDs + data-* attrs)

---

## Why Tailwind + Custom CSS?

**Tailwind CDN:** No build process, responsive utilities, Material Icons integration.

**Custom CSS:** Splash animations, complex tables, mobile slide panels, theme switching (`data-company` attribute).

Why not Bootstrap? Tailwind is more flexible, smaller, mobile-first.

---

## Why Multi-Tenant Single App (Manela + Moriah)?

**Model:** Two companies, separate RTDB paths and localStorage keys, theme toggles.

**Rationale:**
- Reusability: One codebase for both
- Growth: New companies via COMPANIES object + theme CSS
- Clarity: Different colors prevent cross-company confusion
- Independent storage: No data leakage

---

## Mobile-First Responsive

**Breakpoint 767px:**
- Tailwind `md:` standard (768px = "desktop")
- iPad mini accommodated as desktop layout

**Sliding panels (transform translateX) over tabs:**
- More intuitive on mobile (swipe-like)
- Doesn't waste vertical space

**Table horizontal scroll on mobile:**
- Sticky columns (ID + name) visible
- Excel-like editing experience
- Wrap columns rejected as cluttered

---

## Date Storage as YYYY-MM-DD Strings

- Day-level events; time irrelevant
- Avoids UTC conversion bugs
- HTML date input native format
- Easier parsing for charts (`date.slice(0, 7)` for month)

---

## Period Filtering (Not Just All Time)

**Options:** All, YTD, Last 90 days, Custom range.

**Rationale:**
- HR strategy: review trends quarterly
- Context: compare turnover across periods
- Flexibility: strategic reports + ad-hoc analysis

---

## localStorage + RTDB (Dual Persistence)

**localStorage:** Read on init (fast offline load), updated when RTDB syncs, fallback if Firebase down.

**RTDB:** Source of truth, multi-device sync, conflict resolution.

**Conflict:** Firebase wins (assumed fresher). Listener detects remote changes, updates local + localStorage.

---

## No Comms Queue / Background Processing

**Synchronous save on every change:**
- User edits field → record updated → renderAll() → saveToFirebase()
- All in one tick (or setTimeout callback)
- No queue, no retry logic, no offline persistence

**Rationale:** 50–100 records max, ~30 KB each, RTDB `.set()` <100ms. UI feedback via toast (planned).

---

## No Custom Validation Rules

**Records "completed" only when `fullName` present:**
- Allows WIP records
- No required attribute on form fields
- Charts/summaries filter by completion

**Rationale:** Real-world flexibility — guards may not fill entire form in one session.

---

## Splash Screen Animation

**Sequence:**
1. Page loads → splash visible
2. App initializes (storage, Firebase) in background
3. After 550ms, splash fades + scales up
4. App UI revealed

**Rationale:** Professional feel, covers Firebase load time, smooth transition.

---

## Future Considerations (Not Implemented)

1. **Firebase Security Rules:** Currently unrestricted; should lock by auth
2. **Toast Notifications:** No save success/failure feedback
3. **Offline Queue:** No persistence of edits made offline
4. **Detailed Logging:** No audit trail per edit
5. **Advanced Filtering:** Beyond detachment (date range, marital status)
6. **CSV Import:** No bulk spreadsheet import
7. **Mobile App:** Could wrap in React Native or Flutter
8. **Dark Mode:** Not implemented
