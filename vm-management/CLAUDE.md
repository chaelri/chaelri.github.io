# VM Management — Claude Code Reference

## Project
Sunday church service volunteer management system (chaelri.github.io/vm-management).
Stack: Vanilla JS + Firebase Realtime DB + Tailwind CSS + Material Icons Round.
No build step — direct browser files.

## Files
| File | Purpose | Lines |
|------|---------|-------|
| `index.html` | Volunteer sign-in app (public) | ~433 |
| `script.js` | Sign-in logic, Firebase writes | ~2118 |
| `monitor.html` | Admin monitor dashboard | — |
| `monitor.js` | Admin dashboard logic | ~2420 |
| `admin.js` | Comms history panel (inside monitor.html) | ~485 |

## Firebase Schema
```
/logs/YYYY-MM-DD/<pushKey>
  volunteerId, name, segment, role, commsId, pendingCommsId
  timeIn, timeOut, status ("pending"|null), date, services[]

/volunteers/<id>
  name, email, segment, role, commsId

/comms/<code>
  status ("available"|"assigned"), assignedTo (volunteerId), assignedTime

/commsEvents/<pushKey>
  commsId, eventType, volunteerId, volunteerName, timestamp, date
  previousCommsId?, nextCommsId?  (for transferred_from/to)
```

## Key Concepts

**Services** — 4 Sunday slots: `["9AM","12NN","3PM","6PM"]`. Stored as array on log entries. AM batch = 9AM+12NN (sky color), PM batch = 3PM+6PM (violet color). Pre-selected by PH hour (`getPHHour()` in script.js).

**Comms queuing** — `pendingCommsId` on a log entry reserves an occupied comms without releasing current. `releaseCommsOrAutoAssign(commsCode)` auto-assigns on release: Priority 1 = pending time-in with matching `commsId`; Priority 2 = active confirmed log with matching `pendingCommsId`.

**activeCommsMap** — `commsId → { ...log, key }` for all active non-timed-out logs. Lives in monitor.js.

**Unlimited roles** — Multiple sign-ins allowed for roles matching `/(volunteer)|trainee|observer|technical director/i`. All others limited to one active session.

**Timezone** — Always Philippine time (`Asia/Manila`). `getPHDate()` → YYYY-MM-DD, `getPHHour()` → 0-23.

## Color System (Tailwind)
- AM services: `sky` (sky-400/sky-500/bg-sky-900)
- PM services: `violet`
- Active/confirmed: `green`
- Pending: `amber`
- Comms queue: `amber` + `hourglass_top` icon
- Timeout: `red`

## servicesBadge helper
Exists in both `monitor.js` and `admin.js`. Renders colored span badges for a `services` array.

## Do Not
- Never auto-timeout a volunteer — only manual user or admin timeout allowed
- Never use `db.ref('comms/X').update({status:'available'})` directly when releasing — always call `releaseCommsOrAutoAssign(X)` so the queue is checked first
