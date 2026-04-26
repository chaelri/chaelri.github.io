# Horizon — Quick Reference

**Charlie's financial future planner.** Salary scenarios, house financing options (Pag-IBIG, BDO, rent), 12-month + repricing projections.

**Stack:** Vanilla JS (1,471 LOC), Tailwind CSS (CDN), Chart.js 4.4.1, Inter + Space Grotesk fonts, Firebase RTDB (read-only).

**Status:** Parked Apr 16, 2026.

## File Structure
- `index.html` (434 lines) — UI layout, 4 main sections (Overview / House / Trajectory / Timeline)
- `script.js` (1,471 lines) — calculation engine, renderers, Firebase sync
- `style.css` (327 lines) — glass morphism, animations, responsive

## Core Constants
- **HOUSE_PRICE:** ₱6,000,000
- **GOV_FEES:** ₱125,000
- **WEDDING_DATE:** July 2, 2026
- **Pag-IBIG Terms:** 30yr, repricing schedule (5.75% → 9.75% over 30 years)
- **BDO Terms:** 20yr max, 6.00% / 6.50% fixed
- **Default Rent:** ₱15,000/mo

## Salary Scenarios (PH TRAIN Law 2023+)
- 125K gross → 98,537 net (Azur)
- 185K gross → 142,843 net
- 210K gross → 160,343 net

## Post-Wedding Living (₱22,299/mo, kicks in Aug 2026+)
Electricity ₱4K, Water ₱400, Drinkable Water ₱600, Motor Gas ₱2.5K, Cooking Gas ₱600, Grocery ₱10K, Parking ₱2.5K, WiFi ₱1.7K

## Family Support Reduction (post-wedding July 2026+)
- `"full"`: keep paying current
- `"prorated"`: 50% reduction
- `"none"`: zero out

## State (script.js)
```js
let appData = null;        // Firebase data snapshot (chalee_v1 path — shared with Money app)
let currentSalary = 125000;
let currentTrack = "rent"; // "rent" | "pagibig90" | "bdo"
let currentRate = 5.75;
let activeSection = "overview";
let charts = {};           // Chart.js instances
let familyMode = "full";
```

## Firebase
- **Project:** `test-database-55379`, `chalee_v1` path
- **READ-ONLY:** Reads Money app's monthly data; no writes from Horizon
- Real-time listener (`onValue(dbRef, ...)`)

## Key Functions
- `calcMonthly(principal, rate, months)` — amortization
- `getMonthData(monthIdx)` — Firebase month aggregation
- `getCurrentFinancials()`, `getProjectedIncome(baseIncome)`
- `getMonthlyHousingCost()`, `renderHouse()`, `renderTrajectory()`
- `renderDonutChart`, `renderDTIChart`, `renderYearlyProgression`, `renderAmortChart`

## Charts
1. **Donut (Overview)** — `chart-donut`, expense breakdown
2. **DTI Gauge (House)** — `chart-dti`, 28%/35% thresholds
3. **Yearly Progression (Trajectory)** — `chart-yearly`, repricing schedule
4. **Amortization (Timeline)** — `chart-amort`, principal vs interest

## Why
- **Why client-side only:** Personal app, no server needed, instant calculations
- **Why Firebase RTDB:** Reuses Money app data (shared `chalee_v1`)
- **Why vanilla JS:** 60 KB total, no framework overhead
- **Why Chart.js:** ~15 KB, supports all needed chart types
- **Why hardcoded constants:** Personal app, rare changes
- **Why no inflation modeling:** Simplicity; 5-year horizon doesn't justify it
