# guard-exit-interview/ — Production Offboarding Tracker

@../knowledge/guard-exit-interview/SUMMARY.md

@../knowledge/guard-exit-interview/ARCHITECTURE.md

@../knowledge/guard-exit-interview/KEY_FILES.md

@../knowledge/guard-exit-interview/PATTERNS.md

@../knowledge/guard-exit-interview/DECISIONS.md

## 🚨 CRITICAL: Dual-Repo Push

**Every change MUST be committed and pushed to BOTH:**

1. `chaelri.github.io` (this repo — GitHub Pages public hosting)
2. `guard-exit-tracker` (separate repo — primary dev hub)

Forgetting one breaks the deployment. Verify both remotes before considering work complete.

## Quick reminders

- **Multi-tenant:** New Manela (blue) + New Moriah (purple). Each has its own RTDB path and localStorage key.
- **Auth:** Google OAuth + email allowlist (`ALLOWED_EDITORS`). Non-editors see read-only mode.
- **No-auto-push hook is active** at the repo root — `git push` is blocked. Charlie pushes manually.
- **Excel export uses `xlsx-js-style`** (not vanilla `xlsx`) for color-coded cells, merged headers, frozen panes.
- **Mobile is sliding panels** (records → sections → form), not tabs.
- **All dates as `YYYY-MM-DD` strings**, no time component.
