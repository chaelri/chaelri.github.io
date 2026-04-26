# Tayo — Architecture

## Two-User Model

Always **exactly two users: Charlie & Karla**. Three play modes:

1. **Together (Device Sharing)**
   - Same device, users pass phone
   - Tab switching: `currentWho` toggles between "charlie" and "karla"
   - Settings stores `tayo_identity` in localStorage
   - No Firebase sync needed for core flow

2. **Remote (Separate Devices)**
   - Google Sign-In (Firebase Auth)
   - Emails validated against `ALLOWED_EMAILS`
   - Identity auto-detected: `charliecayno@gmail.com` → "charlie"
   - Real-time sync via Firebase RTDB listeners
   - Session broadcast (question, answer reveal, quiz picks)
   - Presence tracking with topbar dot

3. **Solo (Self-Reflection)**
   - Single user, partner replies later
   - `type: "solo"`, `who: "charlie"|"karla"`
   - Partner reply stored as `partnerReply`

## Real-Time Sync (Remote Mode)

**Session Broadcast:**
```
User A taps pig
  → askAI() broadcasts state: "thinking"
  → Creature animates
  → Gemini responds with question
  → askAI() broadcasts state: "revealed" + data + vibe color
User B sees listener fire:
  → Same question, same topic appears
  → Can answer (no thinking animation, just question)
```

**Answer Reveal (Question Mode):**
```
User A submits → tayo/remote/questionAnswers.charlie
User B sees "Waiting for Karla..."
User B submits → tayo/remote/questionAnswers.karla
Both submitted → buildReveal() shows both answers
  → creatureCelebrate(), saves to journal, auto-clears after 8s
```

**Quiz Race:**
```
Both see choices (broadcast)
User A picks → tayo/remote/quizAnswers.charlie + timestamp
User B sees partner's pick highlighted
User B picks → tayo/remote/quizAnswers.karla + timestamp
Both picked → revealAnswer()
  → Correct highlighted, scores pop, "First!" badge, auto-dismiss 10s
```

## Partner Presence

**Topbar dot (`#partner-dot`):**
```js
initRemote() → onValue(ref(db, `tayo/presence/{partnerId}`))
  → partnerOnline = data?.online === true
  → dot.classList.toggle("offline", !partnerOnline)
```

**Visibility-based:**
- `document.visibilitychange` listener
- Tab away → `online: false`
- Tab active → `online: true`
- Disconnects → `onDisconnect()` clears

## IndexedDB Caching

**Currently localStorage-based, not full IndexedDB.**

**Keys:**
- `tayo_playmode`: "together" | "solo" | "remote"
- `tayo_identity`: "charlie" | "karla"
- `tayo_history`: historical entries (unused?)
- `tayo_scores`: `{charlie, karla}`
- `tayo_journal`: journal array (200-entry limit)

**Sync to Firebase:**
- `syncJournalToFirebase()` after every save
- Pushes entire journal to `tayo/journal`
- Load: `onValue(ref(db, "tayo/journal"), ..., {onlyOnce: true})`

**Reconnect:** Firebase auto-reconnect handles it.

## PWA Strategy (sw.js)

**Network-first, cache fallback:**
```
sw.js INSTALL: skipWaiting + cache CORE_ASSETS (no-store)
sw.js ACTIVATE: Clear old caches + claimClients()

FETCH:
  - navigate (HTML): always network
  - others: network-first, cache on success, fallback caches.match()
```

**Aggressive refresh:**
```js
const DEPLOYMENT_ID = "v1-" + Date.now()
const CACHE_NAME = "tayo-" + DEPLOYMENT_ID
```
Each deploy = new cache, old caches nuked on activate.

## Journal Data Model

**Question entry (both users):**
```js
{
  question, charlie: string|"", karla: string|"",
  charlieVoiceURL: URL|null, karlaVoiceURL: URL|null,
  time, reactions?: {charlie?: emoji, karla?: emoji},
  answerReactions?: { charlie: {charlie?, karla?}, karla: {charlie?, karla?} }
}
```

**Quiz entry:**
```js
{
  type: "quiz", question, choices: [4],
  correct: 0|1|2|3, explanation,
  charliePick, karlaPick, charlieRight, karlaRight,
  time, reactions?
}
```

**Solo entry:**
```js
{
  type: "solo", question, who: "charlie"|"karla",
  answer, voiceURL, voiceDuration, time,
  partnerReply?, answerReactions?
}
```

**Reactions:**
- Entry-level: `reactions[myIdentity] = emoji` (whole Q&A)
- Answer-level: `answerReactions[answerKey][myIdentity] = emoji`

## Voice Recording

**Lifecycle:**
1. User clicks mic → `startVoiceRecording()`
2. MediaRecorder streams to `audioChunks[]`
3. Live waveform from analyser frequency data
4. 30s max timer (`VOICE_MAX_SECONDS`)
5. Stop → `recordingBlob` + `recordingURL`
6. Preview with waveform decoded from buffer
7. Save → `uploadVoice(blob)` to `tayo/voices/{timestamp}_{myIdentity}.webm`
8. URL in journal as `charlieVoiceURL` / `karlaVoiceURL`
9. On delete → `deleteObject(storageRef)`

**Waveform:**
- Live: `analyser.getByteFrequencyData()` → bar heights
- Preview: `decodeAudioData()` → RMS height
- Fallback: random if decode fails

## Vibe & Topic System

**8 preset vibes:** anything, deep, fun, sweet, silly, real talk, growth, spiritual.
**Custom vibe:** user types free text, overrides presets.
**Each vibe maps to color** (`VIBE_COLORS`).
**Stored:** `tayo/settings/vibe` (Firebase).

**Topic randomization:**
```
if (currentVibe === "anything")
  → pick random vibe (quiz: all vibes, question: subset)
topicList = QUESTION_TOPICS_BY_VIBE[activeVibe] or QUIZ_TOPICS_BY_VIBE[activeVibe]
getRandomTopic(topicList) → avoids `lastTopicIndex`
```

## AI Integration (Gemini Proxy)

**Endpoint:** `https://gemini-proxy-668755364170.asia-southeast1.run.app`

**Request:**
```js
fetch(GEMINI_PROXY, {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({
    task: "tayo",
    contents: [{parts: [{text: prompt}]}],
    generationConfig: {temperature: 1.1, maxOutputTokens: 300}
  })
})
```

**Response parsing:**
```js
raw = data.candidates[0].content.parts[0].text
parsed = parseJSON(raw)  // extract { question, choices?, correct?, explanation? }
if (!parsed) parsed = getFallback()
```

**System prompt:** ~1000 lines (app.js 963-1022)
- Role: Tayo, companion for Charlie & Karla
- Mode-aware (question vs quiz vs solo)
- Vibe-aware (deep, fun, sweet, etc.)
- Strict rules: no pet names, no sexual content, pure + wholesome
