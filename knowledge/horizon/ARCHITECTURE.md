# Horizon — Architecture

## Data Flow

```
Firebase (chalee_v1) — shared with Money app
    ↓
DOMContentLoaded
    ↓
get(dbRef) → snapshot.val() → appData
    ↓
onValue(dbRef, ...) listener (real-time)
    ↓
renderAll() on change
```

**Initialization (lines 1428–1471):**
1. Splash animation (2200ms)
2. Loading overlay
3. Firebase fetch at 1800ms mark
4. App renders at 2400ms mark
5. Real-time listener attached
6. Error fallback (cloud_off icon) if Firebase unavailable

## Monthly Financials Processing

**`getMonthData(monthIdx)` (lines 180–223):**
```
incomeSources[] → sum all amounts → income
fixedExpenses[] → filter isPaid !== true → fixed
cc[] → filter isPaid !== true → cc
others[] → filter isPaid !== true → others

total = fixed + cc + others
categories = [all three types] sorted by amount DESC
```

**`isPaid` filter rationale:** Paid items already affect bank balance. Only unpaid count as future obligations.

**Fallback (line 232):** If current month has no income data, walk back to find latest month with data.

## Salary Projection

**Override by `currentSalary`:**
- 125K: no adjustment
- 185K: +₱44,306/mo (after taxes)
- 210K: +₱61,806/mo (after taxes)

**Tax brackets (TRAIN Law 2023+):**
- Gov deductions capped: SSS ₱1.75K, PhilHealth ₱2.5K, Pag-IBIG ₱200 (₱4.45K total)
- 125K: 25% bracket (taxable ₱120.55K)
- 185K & 210K: 30% bracket — significant jump

## Housing Calculation

**Loan tracks:**
```js
calcMonthly(principal, annualRate, months):
  r = annualRate / 100 / 12
  return principal * (r * (1+r)^months) / ((1+r)^months - 1)
```

**Rent track:** Flat ₱15K/mo (default, user-editable).

## Family Support Reduction

**Trigger:** After wedding (July 2026+, monthIdx 6).

**Logic (lines 61–71):**
```
familyItems = categories where name.toLowerCase() includes "bahay" or "contribution"
familyTotal = sum(familyItems)

if familyMode === "none" → save 100%
if familyMode === "prorated" → save 50%
if familyMode === "full" → save 0%
```

## Post-Wedding Living

**Trigger:** Aug 2026+ (monthIdx 7).
**Amount:** ₱22,299/mo (8 items, lines 39–49).

## Repricing Schedule (Pag-IBIG)

```
Year 1:     5.75%
Year 2–3:   6.25%
Year 4–5:   6.50%
Year 6–10:  7.125%
Year 11–15: 7.75%
Year 16–20: 8.50%
Year 21–30: 9.75%
```

BDO & Rent: fixed (no repricing).

## Chart.js Patterns

**Lifecycle:**
```js
const ctx = el("chart-id").getContext("2d");
if (charts.key) charts.key.destroy();  // Clean up old
charts.key = new Chart(ctx, { type, data, options });
```

**4 charts:**
1. Donut (Overview) — `chart-donut`, expense breakdown
2. DTI Gauge (House) — `chart-dti`, semicircle, color by threshold
3. Yearly Progression (Trajectory) — `chart-yearly`, stacked bar (expenses + payment + remaining)
4. Amortization (Timeline) — `chart-amort`, principal vs interest

## Tabs

- **Overview:** Live snapshot (4 KPIs) + donut + expense category bars
- **House:** Track toggle + summary + loan calculator + DTI gauge + cash needed tracker
- **Trajectory:** Month-by-month cards + yearly repricing chart + 3-column salary comparison
- **Timeline:** Journey milestones + key numbers + amortization Year 1

## Firebase Sync

```js
const dbRef = ref(db, "chalee_v1");
get(dbRef) → appData = snapshot.val()
onValue(dbRef, snap => { appData = snap.val(); renderAll(); })
```

**Read-only from Horizon's perspective.** Money app writes; Horizon reads + projects.
