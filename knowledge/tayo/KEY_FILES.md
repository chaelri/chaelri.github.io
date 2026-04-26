# Tayo — File-by-File Reference

## index.html

**Structure:** splash, app container (max 480px), topbar (Journal | Tayo + partner-dot | Settings), mode toggle, bubble + creature group, answer area, remote states, settings panel, journal panel.

**Key IDs:**
- UI Control: `settings-btn`, `journal-hint`, `settings-close`, `journal-close`
- Creature: `creature`, `creature-body`, `creature-glow`, `partner-dot`
- Bubble: `bubble-container`, `bubble`, `bubble-text`, `bubble-topic`, `quiz-area`
- Answers: `answer-area`, `answer-text`, `answer-who`, `tab-charlie`, `tab-karla`, `saved-answers`
- Voice: `voice-btn`, `voice-recording`, `voice-preview`, `voice-audio`, `voice-live-wave`, `voice-waveform`
- Quiz: `quiz-picks`, `quiz-choices`, `quiz-result`, `scoreboard`, `score-charlie`, `score-karla`
- Settings: `play-mode-toggle`, `identity-toggle`, `vibe-chips`, `vibe-input`, `btn-google-signin`, `logout-btn`
- Remote: `partner-dot`, `remote-waiting`, `remote-reveal`, `reveal-charlie`, `reveal-karla`, `remote-partner-dot`, `remote-partner-text`
- Journal: `journal`, `journal-list`, `journal-subtitle`

## style.css

**Architecture:**
- CSS Variables (--bg, --surface, --border, --muted, --subtle, --light, --white, --accent, --accent-text, safe-area insets)
- Typography: Playfair Display (italic, brand), Inter (UI), Material Symbols Rounded (icons)
- Color Palette: dark theme #1a1818 bg, #222020 surface, #d4cccc light
- Accent: #ffede9 cream with #3d2c2c dark text
- Vibes: deep=#6366f1, fun=#f59e0b, sweet=#ec4899, silly=#8b5cf6, real talk=#ef4444, growth=#22c55e, spiritual=#3b82f6
- Animations: fadeUp, fadeScale, lineGrow, glowPulse (splash), pigIdle/Excited/Squish/Think (creature), pigHappy/Sad (celebration), voicePulse (recording), dotPulse (presence)
- Layout: flex column, 480px max-width, safe area support

**Key classes:** `.hidden`, `.show`, `.active`, `.offline`, `.online`

## manifest.json

PWA: name "Tayo — Charlie & Karla", display "standalone", theme #1a1818, 192/512 maskable icons.

Installable on iOS + Android, fullscreen, offline via sw.js.

## sw.js

Network-first cache strategy, aggressive cache busting via timestamp.

```js
const DEPLOYMENT_ID = "v1-" + Date.now()
const CACHE_NAME = "tayo-" + DEPLOYMENT_ID
const CORE_ASSETS = ["./", "./index.html", "./style.css", "./app.js", "./manifest.json", "./icon-*.png"]

INSTALL: skipWaiting() → cache.addAll(CORE_ASSETS, no-store)
ACTIVATE: caches.keys() → delete all old → clients.claim()
FETCH:
  if navigate (HTML): always network
  else: fetch() → cache on success → fallback cache.match()
```

## app.js — Function Groups

**Setup & Init:** Firebase config, Gemini proxy, wedding date, allowed emails, element refs (`$ = id => document.getElementById(id)`), state vars

**Sound (Web Audio):** `playOink()`, `playThinkOink()`, `playCelebrate()`, `playSadSound()`, `playSelect()`, `playReveal()`, `playTap()` — auto-resume audio context on first interaction

**Settings & Play Modes:** `setPlayMode(mode)`, `setIdentity(id)`, play-mode and identity toggle listeners

**Remote (Firebase):** `initRemote()` (Google Sign-In, presence + session + answer listeners), `cleanupRemote()`, listeners: presence (online/offline), session (incoming question), quiz/question answers; `remoteListeners` array tracks all unsub functions

**Creature:** `setCreatureState(state)`, `creatureCelebrate()`, `creatureSad()`, `trackEyes(cx, cy)` on mousemove + touchmove

**Tap to Ask:** click `#creature` → `askAI()` (unless offline in remote mode)

**Vibe & Mode:** vibe chip click → `saveVibe()` → Firebase + display update; custom vibe input → overrides; mode toggle (question/quiz) → toggle `.quiz-active` class

**Quiz:** `setupQuiz(data)` (4 choices, turn-based or race), `revealAnswer()`, `popScore(id)`, `updateScoreboard()`

**AI Prompt & Topics:** `getSystemPrompt()` (~1000 lines), `QUESTION_TOPICS_BY_VIBE`, `QUIZ_TOPICS_BY_VIBE`, `getRandomTopic(list)` (avoids `lastTopicIndex`), `askAI()` (set thinking → fetch Gemini → parse JSON → revealBubble)

**Bubble & Answer:** `revealBubble(data)` (typewriter + stagger choices), `typewriter(el, text, speed)`, `showAnswerArea()` (tabs in together, hidden in solo/remote)

**Answer Input (Question Mode):** tab switching saves/loads each person's text+voice, `updateSaveBtn()`, save flow varies by mode

**Voice Recording:** `startVoiceRecording()` (getUserMedia + MediaRecorder + analyser), live waveform, 30s max, `stopVoiceRecording()`, `showVoicePreview()` (decode buffer + RMS), `uploadVoice(blob)` to Firebase Storage, `deleteObject()` on delete

**Journal:** `saveToJournal()`, `saveQuizToJournal(data)`, `syncJournalToFirebase()`, load via `onValue(..., {onlyOnce: true})`, journal click renders entries with edit/delete/react/reply handlers

**Journal Interactions:** entry types (question/quiz/solo), reactions (entry-level + answer-level), edit (textarea on blur/Enter), delete (removes entry + voice files), reply (solo entries)

**Fallback:** `parseJSON(raw)` extract JSON object, `getFallback()` hardcoded 10 questions if Gemini fails
