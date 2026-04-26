# Horizon — Decisions

## Why Client-Side Only

- Personal app (single user); no auth/data isolation
- Simplicity (JavaScript covers amortization, tax, dates)
- Speed (no server round-trips, instant slider updates)
- No infrastructure cost
- Privacy (calculations never leave browser)

**Trade-off:** No audit trail; user could edit constants in DevTools.

## Why Firebase RTDB

- Reuses Money app database (`chalee_v1`)
- Real-time sync (changes in Money auto-appear in Horizon)
- Lightweight (read-only listener)
- Reuses Firebase from other apps

**Read-only from Horizon's side.** Money writes monthly breakdown, Horizon transforms (filters unpaid bills, applies salary overrides).

**Alternative rejected:** localStorage (would require manual data entry).

## Why Vanilla JS (No Framework)

- 60 KB total file size
- No reactivity layer needed (single global state)
- Interactivity limited (tab switching, chart updates, form toggles)
- No build pipeline

**Trade-off:** Manual `renderAll()` calls; large render functions (renderTrajectory ~400 LOC).

## Why Chart.js

- ~15 KB
- Supports all needed chart types (donut, gauge, stacked bar)
- Easy to destroy + recreate on data change
- Tailored colors fit dark theme

## Why Inter + Space Grotesk

- Inter (body): excellent legibility at 10–12px
- Space Grotesk (display): bold geometric for "financial data" feel
- Free Google Fonts CDN

## Scope: Included vs Not

**Included:**
- 3 salary scenarios (125K/185K/210K), TRAIN Law tax
- 3 financing tracks (Rent/Pag-IBIG 90%/BDO)
- Pag-IBIG repricing (7 periods)
- Family reduction (Full/Pro-rated/None)
- Post-wedding living (₱22.3K/mo)
- DTI gauge (35% max)
- Timeline (6 milestones)

**NOT included:**
- Investment projections (out of scope)
- Inflation modeling (5-year horizon doesn't justify)
- Emergency fund tracking (Money app handles balance)
- Dual income post-marriage (Karla's career path uncertain)
- Loan refinancing
- Real estate appreciation (focused on cash flow, not equity)

## UI/UX Decisions

- **Bottom nav (4 tabs):** mobile-first, always visible, clear sections
- **Splash 2.2s:** brand moment, covers Firebase fetch
- **Month cards collapsible:** mobile-friendly compact summary, expand for detail
- **Toggle sliding background:** custom UI, animated, real-time chart update

## Data Flow Decisions

**Why filter by `isPaid`:**
- Money app marks paid items → already reflected in bank balance
- Counting them as "expenses" would double-count
- Only `unpaid` items are future obligations

**Why carry-forward balance:**
- Shows impact of spending patterns over time
- Informs "Can I afford house if I keep spending like this?"

## Hardcoded Constants

All values in script.js — `HOUSE_PRICE = 6_000_000`, `NET_SALARY_125K = 98_537`, `POST_WEDDING_EXPENSES`, `REPRICING_SCHEDULE`.

**Rationale:** Personal app, rare changes, transparency, simplicity.

**Trade-off:** Code edit required to change values.

## No Backend Validation

- Personal use, Charlie trusts himself
- Math simple enough to validate in JS
- No sensitive data

## Uncertainty Notes

- Firebase credentials in source (test keys?)
- Tax tables (2023+, may need 2025+ update)
- Hardcoded age 26 (no birthdate stored)
- Repricing simplified (real Pag-IBIG depends on origination date)
- Family heuristic matches "bahay"/"contribution" — fragile if naming changes
- No offline mode
- Carry-forward assumes all prior months in Firebase
