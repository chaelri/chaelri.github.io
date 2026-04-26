# Tayo — Quick Reference

**App:** Shared journal & mood-tracking for Charlie & Karla. Two-user real-time sync via Firebase RTDB.
**Stack:** Vanilla JS + Custom CSS (Playfair Display + Material Symbols Rounded) + Firebase RTDB + IndexedDB + PWA
**URL:** `/tayo/` (mobile-first, 480px max-width)

## File Structure
```
tayo/
├── index.html           # DOM (topbar, bubble, quiz, answer, journal, settings)
├── app.js              # All logic (~2365 lines, modular)
├── style.css           # Themed dark UI (--bg: #1a1818, --accent: #ffede9)
├── manifest.json       # PWA metadata
├── sw.js               # Service worker (network-first, aggressive cache)
└── icon-192.png, icon-512.png, favicon.png
```

## Key Globals (app.js)
```js
let history = JSON.parse(localStorage.getItem("tayo_history") || "[]");
let scores = JSON.parse(localStorage.getItem(SCORES_KEY) || '{"charlie":0,"karla":0}');
let conversationContext = [];
let currentVibe = "anything"; // "deep"|"fun"|"sweet"|"silly"|"real talk"|"growth"|"spiritual"
let isGenerating = false;
let currentMode = "question"; // or "quiz"
let playMode = "together"; // "solo"|"together"|"remote"
let myIdentity = "charlie"; // "charlie"|"karla" (in together mode)
let currentUser = null; // Firebase auth user (remote mode)
let partnerOnline = false;
```

## RTDB Schema
```
tayo/
├── settings/vibe
├── presence/{charlie|karla}: { online, lastSeen }
├── remote/
│   ├── session: { state: "thinking"|"revealed", startedBy, data, topicLabel, vibeColor, time }
│   ├── quizAnswers: { charlie: {pick, time}, karla: {pick, time} }
│   └── questionAnswers: { charlie: JSON, karla: JSON, question }
└── journal: [
    { question, charlie, karla, charlieVoiceURL?, karlaVoiceURL?, time,
      type?: "quiz"|"solo", choices?, correct?, explanation?,
      reactions?: {charlie?: emoji, karla?: emoji},
      answerReactions?, partnerReply? }
  ]
```

## Common Selectors

**Topbar:** `#partner-dot`, `#current-playmode`, `#current-vibe`

**Main:** `#creature`, `#creature-body`, `#bubble-container`, `#bubble`, `#bubble-text`, `#bubble-topic`, `#quiz-area`, `#quiz-picks`, `#quiz-choices`, `#answer-area`, `#answer-text`, `#answer-who`, `#saved-answers`, `#remote-waiting`, `#remote-reveal`

**Panels:** `#settings-panel`, `#settings-backdrop`, `#journal`

**Voice:** `#voice-btn`, `#voice-recording`, `#voice-preview`, `#voice-audio`

## Entry Flow

1. **Splash Screen** → Hidden at 2.6s
2. **Tap Pig → `askAI()`**
   - Creature thinking, broadcasts to Firebase if remote
   - Calls Gemini proxy with vibe + random topic
   - Receives `{question, choices?, correct?, explanation?}`
3. **Display in Bubble → `revealBubble()`**
   - Typewriter, quiz stagger
   - Shows answer area or quiz choices
4. **Save Answers**
   - Together: Charlie → Karla (tab switch) → Save both → Journal
   - Remote: Save to `tayo/remote/questionAnswers`, wait for partner, reveal together
   - Solo: Save with `myIdentity`, allow partner reply
5. **Journal:** Click "Journal" button, render entries with edit/delete/react

## Key Functions

**Creature & Sound:** `setCreatureState()`, `creatureCelebrate()`, `creatureSad()`, `trackEyes()`, `playOink()`, `playThinkOink()`, `playCelebrate()`, `playSadSound()`

**AI & Questions:** `askAI()`, `getSystemPrompt()`, `getRandomTopic()`, `revealBubble()`, `typewriter()`, `parseJSON()`, `getFallback()`

**Quiz:** `setupQuiz()`, `updateScoreboard()`

**Answers & Voice:** `showAnswerArea()`, `startVoiceRecording()`, `stopVoiceRecording()`, `showVoicePreview()`, `uploadVoice()`, `saveToJournal()`, `saveQuizToJournal()`

**Remote:** `initRemote()`, `cleanupRemote()`

**Journal:** `syncJournalToFirebase()`, journal handlers (delete, edit, react, reply)

## Notes

- **Fallback questions:** Hardcoded array if Gemini fails (line 2343)
- **Quiz:** 4 choices always, `correct` is index 0-3
- **Voice path:** `tayo/voices/{timestamp}_{myIdentity}.webm`
- **Journal limit:** 200 entries max (auto-truncate)
- **Presence:** `onDisconnect()` → Firebase clears on disconnect
- **Remote session:** Only one at a time (overwrite on new question)
