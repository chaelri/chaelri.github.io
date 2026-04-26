# CHALEE — Decisions

## Why Firebase (No localStorage for Data)

**Decision:** Firebase Realtime DB for all task persistence; localStorage only for UI prefs.

**Rationale:**
- **Multi-device sync:** Charlie + Karla need real-time across devices
- **Shared data:** Wedding fund tree shared between users
- **Scalability:** Unlimited tasks (vs 5-10MB localStorage limit)
- **Data integrity:** Server-side ops atomic
- **Future-proof:** Multi-user, offline sync extensible

**Trade-off:** Requires always-online (no offline edit queue currently).

## Why "CHALEE" Branding (Not Generic)

- **Personal identity:** "This is MY budget app"
- **Emotional engagement:** Custom logo, colors, monthly gradients > generic UI
- **Floating money emoji** (💵💸🤑) on login = whimsy
- **Scope signal:** Two-user system (Charlie/Karla), not generic SaaS

**Naming:** Logo `assets/money-icon.png` (512×512), Manifest "Money" (PWA listing), HTML title "CHALEE | Personal Budget".

## Why Category-Based (Not Account-Based)

**Four fixed categories:**
1. Income Sources (recurring optional)
2. Fixed Expenses (ALWAYS recurring to future months)
3. Credit Cards (with payment history log)
4. Others (discretionary)

**Why not free-form?** Charlie's needs are bounded: income → expenses → savings. Free-form would require account creation, sub-accounts, transfer logic.

**Built-in recurring:** Fixed expenses can't be forgotten.

## Why `isPaid` Boolean (Not Real Ledger)

- Simple toggle per item
- No reconciliation with bank statements
- Tracks "deferred obligations" (₱100K fixed but only ₱60K paid this month)
- Works without Plaid/banking API integration

**Trade-off:** Manual update; not real bank sync.

## Why Two-User (Hardcoded Charlie + Karla)

- Personal use case (joint wedding planning)
- Simplified auth (no username/password, no recovery)
- Firebase paths simply switch: `chalee_v1` vs `karla_v1`
- Shared wedding data (`weddingCosts/`)

## What's NOT Included

- ❌ Offline mode
- ❌ Multi-currency (₱ only)
- ❌ Budgeting limits & alerts
- ❌ Recurring schedule flexibility (no quarterly)
- ❌ Data export (CSV/Excel)
- ❌ Sub-categories & tagging
- ❌ Bill splitting & settlement (handled via Venmo/bank manually)

## Month Completion (Manual)

**Why explicit "Complete Month" button:**
- Forces review ritual (catch missed entries)
- Confidence check before next month
- Avoids edge cases of mid-month auto-archive
- Visual reset (zeroing income forces fresh start)

## Wedding & CharLa Goals (Hardcoded)

```js
const CHARLA_SCHEDULE = [
  { label: "Jan 2025", y: 2025, m: 0, charlie: 14000, karla: 6000 },
  // ... through June 2026
];
const CHARLA_TARGET = 354372;
```

**Hardcoded because:** Wedding is fixed June 2026; ring schedule agreed; alignment with WeddingBar app.

**Trade-off:** Plans change → code edit + redeploy.

## Visual Decisions

**Monthly gradients (12 unique):** Each month visual identity, prevents horizontal scroll blur, emotional mapping.

**Dark theme (slate-900 bg):**
- Reduces eye strain (frequent use)
- Modern fintech aesthetic
- Cards pop against dark bg

**No light mode:** Design-led choice.

## Recurrence Logic

**Fixed expenses always recur:**
```js
const isFixed = type === "fixedExpenses"
const isRecurring = isFixed || recurringInput.checked
const endIdx = isRecurring ? 11 : monthIdx
```

Prevents "forgot to add rent" silent errors.

## No Sync Bar During Reads

**Sync bar visible for writes only, not reads.**

**Why:** User-initiated actions get feedback (visible bar). Auto-synced remote changes are silent (smooth UX). Avoids notification spam.

## Trade-off Summary

| Decision | Benefit | Cost |
|----------|---------|------|
| Firebase | Real-time sync, shared data | Requires connectivity |
| 4 fixed categories | Simple mental model | No sub-categories |
| `isPaid` flag | Quick, lightweight | Not real bank sync |
| Two-user system | Simple auth | Can't scale |
| Manual month completion | Review ritual | Extra click |
| Hardcoded CharLa | Consistency with WeddingBar | Inflexible |
| Dark theme | Reduced eye strain | Excludes light-pref users |
