# devo-mobile/ — React Native (Expo) Mobile App

@../knowledge/devo-mobile/SUMMARY.md

@../knowledge/devo-mobile/ARCHITECTURE.md

@../knowledge/devo-mobile/KEY_FILES.md

@../knowledge/devo-mobile/DECISIONS.md

## Quick reminders

- **Status: Parked Feb 2026.** Companion to web devo, separate codebase.
- **Routing:** Expo Router v6 (file-based, like Next.js). Routes in `app/`.
- **State:** Single Zustand store at `src/store/useStore.ts`.
- **Storage:** `expo-secure-store` (mobile) / localStorage (web), with chunking for >2KB values.
- **No Firebase integration** — local-only, no auth, no sync.
- **Premium is a flag only** — no real billing backend wired up.
- **Bible data shared with web devo** in spirit (NASB2020, EASY2024 JSONs, same metadata) but separate copies.
