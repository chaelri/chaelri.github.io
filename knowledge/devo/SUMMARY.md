# Quick Reference

## File Structure
```
devo/
├── index.html           (UI skeleton, modals & controls)
├── script.js            (~8,881 lines: app logic)
├── style.css            (~7,500 lines: styling)
├── config.js            (270B: API keys)
├── firebase-sync.js     (~350 lines: Firebase sync for Charlie)
├── bible-meta.js        (book/chapter metadata)
├── nasb2020.json        (~5.5MB: Bible data)
├── easy2024.json        (~4.5MB: Bible data)
├── manifest.json        (PWA manifest)
├── sw.js                (Service worker)
└── assets/icons/        (PWA icons)
```

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
