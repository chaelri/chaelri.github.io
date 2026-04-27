# Quick Reference

## File Structure
```
devo/
├── index.html              (UI skeleton, modals & controls)
├── js/                     (app logic, split from former script.js)
│   ├── 01-core.js          (~533 lines: globals, AI/Gemini, image cache, markdown, cross-ref, Strong's modal)
│   ├── 02-data.js          (~286 lines: bible data load, IDB, scroll lock, theme, favorites/comments globals)
│   ├── 03-tts.js           (~705 lines: full TTS system — synthesis, queue, playback, word highlight)
│   ├── 04-passage.js       (~1770 lines: passage load, AI reflection/chat, summary, controls)
│   ├── 05-render-init.js   (~938 lines: comments rendering, summary, init/event wiring, push)
│   ├── 06-notes.js         (~1093 lines: notes app — sessions, detail view, standalone editor)
│   ├── 07-immersive.js     (~497 lines: immersive TTS overlay)
│   ├── 08-story.js         (~1227 lines: story modal, reflect modal, verse peek, story builders)
│   ├── 09-soap.js          (~970 lines: SOAP screen, dashboard, list panel)
│   ├── 10-creator-canvas.js (~1862 lines: image creator, canvas mode, main toolbar, book/chapter picker)
│   └── 11-boot.js          (~22 lines: final kickoff — fetchBibleData/loadBooks/showDashboard/updateControlStates/_onAppLoad trigger; runs LAST so cross-file calls resolve)
├── style.css               (~7,500 lines: styling)
├── config.js               (270B: API keys)
├── firebase-sync.js        (~380 lines: Firebase sync for Charlie + ordered injector for js/*.js)
├── bible-meta.js           (book/chapter metadata)
├── nasb2020.json           (~5.5MB: Bible data)
├── easy2024.json           (~4.5MB: Bible data)
├── manifest.json           (PWA manifest)
├── sw.js                   (Service worker — caches all js/*.js chunks)
└── assets/icons/           (PWA icons)
```

**How the split works:** All 10 js/*.js files are classic `<script>` tags (not modules) injected by `firebase-sync.js` with `async = false`, so they share a single script-global scope identical to the former monolithic script.js. Cross-file globals (`comments`, `favorites`, `ttsQueue`, `bibleData`, etc.) work unchanged because top-level `let`/`const`/`function` declarations all go into the same lexical script-global environment.

## Storage Tiers

| Where | What | Scope |
|-------|------|-------|
| localStorage | settings, favorites, comments, notes | Client (origin-locked) |
| IndexedDB (devo-cache) | images, stories (7-day cache) | Client |
| Firebase RTDB | synced localStorage (Charlie only) | Cloud (devo-sync path) |

## Key Global Variables

| Variable | Type | Purpose |
|----------|------|---------|
| `favorites` | Object | `{ "GEN.1.1": timestamp, ... }` |
| `comments` | Object | `{ "GEN.1.1": [{ text, time }, ...], ... }` |
| `ttsQueue` | Array | Current chapter verses queued for playback |
| `ttsIdx` | Number | Current playing verse index |
| `window.__aiPayload` | Object | Current passage data for modals |
| `verseChatHistories` | Object | Chat messages per verse key |
| `currentVersion` | String | "NASB" or "EASY" |

## localStorage Keys

```
bibleVersion, bibleComments, bibleFavorites, devotionStandaloneNotes
recentPassageId, recentPassage, userName
isLightMode, reflectionVisible
storySeenHistory
soap_application, soap_prayer
reflection-[passageId], devo.canvas.[passageId]
```

## Entry Point Functions

| Action | Function |
|--------|----------|
| Load passage | `loadPassageById(id, scrollToVerse)` |
| Show dashboard | `renderDashboard()` |
| Play TTS | `playChapter()` |
| Open story modal | `openStoryModal()` |
| Open canvas | `document.getElementById("canvasModeBtn").click()` |
| Explain verse | `fetchInlineQuickContext({ book, chapter, verse, text }, mountEl)` |
| Chat with verse | `toggleVerseChat(key, book, chapter, verse, text, mountEl)` |

## Common Selectors

```css
#output               /* verse container */
#output .verse        /* single verse */
.verse-header         /* verse + number */
.verse-content        /* verse text */
#modalOverlay         /* reusable modal */
#mtBar                /* compact toolbar */
#ttsPlayer            /* TTS player UI */
#ttsImmersive         /* full-screen TTS mode */
#canvasModeOverlay    /* drawing mode */
```
