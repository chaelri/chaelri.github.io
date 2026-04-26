# Tayo — Decisions

## 1. Firebase RTDB (Not Firestore)

**Why:**
- Real-time presence via `onDisconnect()` (simpler than Firestore)
- Fast session broadcasting (partner sees question immediately)
- Simple JSON structure (no schema validation)
- Low latency for two-user sync (no collection queries)
- Cheaper for sparse writes

**Trade-offs:**
- No built-in security rules (mitigated: email allowlist + RTDB rules)
- No transactions (rarely needed for two users)
- Flat structure (200-entry journal limit prevents bloat)

## 2. Two-User Only

**Why strict two-user:**
- Charlie & Karla relationship-specific
- No group complexity (permissions, roles, voting)
- Simpler state machine (identity = email → charlie or karla)
- Presence dot unambiguous

If Tayo expands: refactor `ALLOWED_EMAILS`, identity auto-detection more complex.

## 3. localStorage (Not Full IndexedDB)

**Current:** localStorage for simplicity (JSON stringify/parse).

**Why not IndexedDB:**
- Two-user app, minimal data (200 journal entries, small state)
- localStorage synchronous (easier debugging)
- PWA + service worker handles offline caching

**If needed:** upgrade for sync queue on reconnect, larger data sets.

## 4. Playfair Display (Serif Branding)

**Why serif:**
- Intimate, personal aesthetic (relationship journal)
- Differentiates from typical tech UI
- Aligns with hand-written journal feeling
- Used only for headings (avoids eye strain)

**Pair:** Playfair Display (serif italic, titles) + Inter (sans, UI).

## 5. Material Symbols Rounded

- Consistency with Google design language
- 100+ icons needed
- Rounded variant matches "cute pig" aesthetic
- Free + built-in to web

## 6. Web Audio API (Synthesis)

**Why over pre-recorded:**
- Procedural oink sounds feel more alive
- No assets to load (faster startup)
- Variation per state (think oink ≠ happy oink)
- Full pitch + envelope control

## 7. Gemini Proxy (Not Direct API)

**Why:**
- API key hidden (not exposed in client)
- Rate limiting server-side
- Custom prompt injection protection
- Allows future model swaps

**Endpoint:** Asia-Southeast (Philippines TZ + lower latency).

## 8. Typewriter Animation

**Why character-by-character:**
- Feels conversational
- Time to mentally prepare
- Reduces cognitive load
- Matches "companion" tone

## 9. Quiz Choices as Buttons

**Why over radio:**
- Spatial 2x2 grid feels more game-like
- Faster tap targets
- Animated feedback (scale, color) more satisfying

## 10. Entry-Level + Answer-Level Reactions

**Two types:**
- Entry: celebrate the whole Q&A ("love this conversation 💕")
- Answer: react to one person's specific answer ("funny 😂")

```
reactions[myIdentity] = emoji
answerReactions[answerKey][myIdentity] = emoji
```

**Not implemented:** comment threads (scope creep).

## 11. Vibe as Shared Setting

**Why shared:**
- Both users see same vibe indicator
- Next question respects their mood together
- Simpler state management

**Alternative rejected:** Per-user vibe (conflicting preferences need resolution).

## 12. Custom Vibe (Text Input Fallback)

- Not all moods fit 8 presets
- Couples know their own language
- Topic system gracefully falls back

## 13. Voice as Optional Answer

- Voice adds intimacy (hearing partner's tone)
- Optional (text sufficient, voice more personal)
- Uploaded to Storage (not stored in RTDB, too large)

**Not implemented:** real-time voice call (would need WebRTC).

## 14. 30-Second Voice Limit

- Answers typically short + snappy
- Forces clarity (not rambling)
- Reduces Storage quota usage

## 15. 200-Entry Journal Limit

- localStorage limit (~5-10MB on most browsers)
- Performance (rendering 200+ entries gets slow)
- Couples can export/archive externally

## 16. No Encryption

**Why not E2E:**
- Firebase rules already restrict access
- No adversarial threat model
- Simpler UX (no key management)

If paranoid: encrypt voiceURLs client-side, but adds complexity.

## 17. Wedding Countdown Display

- Celebrates milestone (wedding 2026-07-02)
- Educational (app built BY couple FOR couple)

## 18. PWA + Service Worker (Not Native)

**Why web:**
- Single codebase (iOS + Android + web)
- No app store delays
- Easy to update (new deploy = immediate code)
- Offline-capable via SW
