# monthsary/ — 4th Monthsary Page

@../knowledge/monthsary/SUMMARY.md

@../knowledge/monthsary/ARCHITECTURE.md

@../knowledge/monthsary/DECISIONS.md

## Quick reminders

- **Recently rebuilt 2026-04-26** (commit `b9ad526`). Moved from root to `/monthsary/`, Firebase upgraded 9.6.1 → 11.0.2.
- **Login gate:** Google OAuth + hardcoded `allowedEmails: ["charliecayno@gmail.com", "kasromantico@gmail.com"]`.
- **Date-locking to Nov 11 is NOT yet implemented** despite the project's intent. Add a `today.getMonth() === 10 && today.getDate() === 11` check before `updateUI()` if you want to enforce.
- **Audio randomization:** 55% apa.mp3 / 25% hmmmp.mp3 / 15% who-am-i.mp3 / 5% ily.mp3, but every 100 clicks forces ily.mp3.
- **Real-time chat** between Charlie ("Chalee") and Karla ("Karlyy") via Firebase RTDB at `chat/`.
- **All audio files in repo** (~129 KB total). Don't suggest moving to streaming (privacy + simplicity preferred).
