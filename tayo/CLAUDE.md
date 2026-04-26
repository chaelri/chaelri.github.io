# tayo/ — Charlie & Karla Shared Journal

@../knowledge/tayo/SUMMARY.md

@../knowledge/tayo/ARCHITECTURE.md

@../knowledge/tayo/KEY_FILES.md

@../knowledge/tayo/PATTERNS.md

@../knowledge/tayo/DECISIONS.md

## Quick reminders

- **Always exactly two users** (Charlie + Karla). Three play modes: solo / together / remote.
- **Together mode:** same device, pass phone, tab switching via `currentWho`.
- **Remote mode:** Google Sign-In, email matched against `ALLOWED_EMAILS`, Firebase RTDB sync.
- **Solo mode:** single user, partner can reply later (`partnerReply` field).
- **Vibe is shared** (one for both users), stored at `tayo/settings/vibe`.
- **Voice clips:** uploaded to Firebase Storage at `tayo/voices/{ts}_{identity}.webm`, max 30s.
- **Journal cap:** 200 entries, auto-truncated.
- **AI feature tone:** Taglish, casual, intentional couple language.
