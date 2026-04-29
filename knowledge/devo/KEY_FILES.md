## File-by-File Architecture Map

### index.html (34,535 bytes, ~900 lines)

**Purpose**: Markup scaffold for the PWA. Preloads fonts, Google TTS, Marked.js; declares all modal, sheet, and panel containers.

**Key Elements**:
- `<base target="_top" />` (line 4): Breaks out of any iframe context.
- Preconnect to Gemini proxy (line 20), DNS prefetch (line 21) for latency optimization.
- Manifest.json reference (line 22), PWA metadata (lines 11–15).
- Google Material Symbols & Icons fonts (lines 28–38).
- Marked.js CDN for markdown rendering (line 24).

**Sections**:
1. **Splash screen** (line 43): `#app-splash` shown while loading.
2. **Top toolbar** (line 48): `#topActions`, brand, home button, mt-listen, etc.
3. **Controls** (line 112): Book/chapter selects and picker sheets (lines 179–222).
4. **Bible search modal** (line 226): `#bibleSearchModal` for full-text verse search.
5. **Output area** (line 258): `#output` (main verse display).
6. **Sidebar** (line 261): `#aiReflection`, summary, notes (lines 262–274).
7. **Notes app** (line 281): Full CRUD UI for notes (lines 281–324).
8. **Modals** (lines 348–610): `#modalOverlay/#modalContent` (cross-refs), `#storyModal` (story view), `#ttsImmersive` (immersive TTS), `#ttsPlayer` (inline player), `#imgCreatorPanel` (image creation).
9. **Name & Dialog** (lines 327–346): Name prompt, confirm dialog.

**Script Loading** (line ~800+): `<script src="firebase-sync.js"></script>` (loads first), then 10 ordered chunks under `js/` are injected dynamically by firebase-sync.js with `async=false`.

---

### js/ (split from former monolithic script.js, 9,881 lines)

**The split rationale**: The original `script.js` was a single 388 KB / 9,881-line classic script. It was sliced into 10 contiguous files by line range — pure cut/paste, no logic changes. All files load as classic `<script>` tags via `firebase-sync.js` (`async=false`), sharing one script-global scope identical to the original. Cross-file references to globals (`comments`, `favorites`, `ttsQueue`, `bibleData`, `modalOverlay`, etc.) work unchanged.

**Load order is significant** — function declarations from earlier files are visible to later files via the shared global scope. Top-level executable statements (e.g. `updateIcon()` at file 02 line ~150, `fetchBibleData()` / `loadBooks()` / `showDashboard()` at file 05) only call functions defined in the same file (hoisting) or in earlier files (already loaded).

#### File map

| File | Original lines | Size | Responsibility |
|------|----------------|------|---------------|
| `js/01-core.js` | 1–533 | 533 | Globals, error handler, AI tone constant, `callGemini` / `callGeminiStream` / `_typeOut`, IndexedDB image+story cache, `mdToHTML` / `inlineMd` / `linkifyBibleRefs`, cross-ref peek, modal overlay refs, Strong's modal |
| `js/02-data.js` | 534–819 | 286 | `fetchBibleData`, `bibleData` global, `openDB` (IndexedDB `dudu-devotion-db`), verse cache, `lockAppScroll`, reflection-visibility helpers, theme toggle (`updateIcon`), `comments` + `favorites` globals + `saveFavorites` / `isFavorite` / `toggleFavorite` |
| `js/03-tts.js` | 820–1524 | 705 | Full TTS system — `TTS_VOICE`, semaphore, `_ttsSynthItem`, `_ttsPrepareLookahead`, word-span injection + highlight RAF loop, `ttsBuildQueue`, `playChapter`, `ttsPlayAt`, pause/prev/next, immersive pause-panel, ends with the (duplicate) `saveComments()` definition |
| `js/04-passage.js` | 1525–3294 | 1770 | `resetAISections`, inline quick-context, `toggleVerseChat`, `renderChatHistory`, `fetchInlineDigDeeper`, `updatePassageTitle`, `updateControlStates`, dashboard (`renderDashboard`, dash clock), `loadPassage` / `loadPassageById`, `runAIForCurrentPassage`, `showLoading` / `hideLoading`, `renderAIContextSummary`, `renderAIReflectionQuestions`, `restoreSavedReflectionAnswers` |
| `js/05-render-init.js` | 3295–4232 | 938 | `updateMetaIndicators`, `renderComments`, `toggleAllNotes`, `renderSummary`, scroll-top button, version pills, prev/next chapter buttons, TTS button wiring, push subscribe/unsubscribe (`_subscribePush`, `_handlePushToggle`, `_syncPushContext`), `initializeReflections` MutationObserver, smooth-scroll, name prompt, confirm dialog, top-of-app init calls (`fetchBibleData`, `loadBooks`, `showDashboard`, `updateControlStates`) |
| `js/06-notes.js` | 4233–5325 | 1093 | Notes app — `showBackToNotesBubble`, `_getAllNotes`, `openNotesApp` / `closeNotesApp`, `_getSessions`, `_renderNotesList`, `_openSessionDetail`, `_shareSession`, note detail view, `_renderStandaloneEditor`, `_createNewNote` / `_updateStandaloneNote` / `_deleteStandaloneNote`, `initNotesApp` |
| `js/07-immersive.js` | 5326–5822 | 497 | Immersive TTS overlay — `ttsImmersiveOpen` / `Close`, `_loadTtsImmersiveBg`, `_ttsImmStartPlayback`, scrubber, `ttsImmersiveUpdate`, `ttsImmReflectionOpen` / `Show`, `_immParseVerseRefs`, `_immShowVersePopup` |
| `js/08-story.js` | 5823–7049 | 1227 | Story modal — `markStorySeen`, `openStoryModal` / `closeStoryModal`, `renderStorySlide`, navigation, `buildSlideHTML` / `buildGlanceHTML` / `buildMapHTML` / `buildSegmentHTML` / `buildScrapbookHTML` / `buildConversationHTML` / `buildTeachingHTML` / `buildContrastHTML` / `buildRecapHTML` / `buildReflectHTML`, story Gemini fetches (glance/timeline/closing/digDeeper), reflect modal (`openReflectModal` / `closeReflectModal`), verse peek (`openVersePeek`) |
| `js/09-soap.js` | 7050–8019 | 970 | SOAP — categories, respond screen, dashboard combined view, stack cards, list panel, picker, verse popover, Firebase flush helpers |
| `js/10-creator-canvas.js` | 8020–9881 | 1862 | Image creator (`openImageCreator`, mode switcher, generate, download, share), canvas mode IIFE (drawing/highlight/notes overlay), main-toolbar IIFE (proxy buttons over legacy controls), book/chapter picker IIFE (mobile bottom-sheet selectors) |

#### Section anchor: original line ranges (for grep-by-line)

The line ranges below are from the **original** `script.js`. Inside each split file, subtract the file's starting line to get the local line. For example, "loadPassageById line 2037" lives in `04-passage.js` at local line `2037 - 1525 + 1 = 513`.

(Sections A–Q below preserve the original line-numbering for historical grep familiarity.)

#### Sections (by grep of top-level functions and headers — ORIGINAL line numbers):

**A. Utility & Proxy Layers (lines 1–600)**
- **Gemini Proxy** (line 28): `_typeOut(text, onChunk)` (line 65) — streams text chunks.
- **Image Generation** (line 81): `_openImageDB()` (line 90), `callImageGen(prompt, ratio)` (line 180).
- **Story Prompt Builder** (line 184): `buildScenePrompt()`.
- **Markdown & HTML** (line 188): `mdToHTML()` (line 189), `inlineMd()` (line 212), `linkifyBibleRefs()` (line 222).
- **Cross-Reference Peek** (line 229): `openCrossRefPeek()` — inline modal for verse refs.
- **Helper utilities**: `_bookNameToId()` (line 343), `_goToPassageFromPeek()` (line 355), `_showGoBackPill()` (line 399), `sparkleLoaderHTML()` (line 438).

**B. Modal & UI Framework (lines 450–566)**
- **Modal overlay** (line 451): `const modalOverlay = document.getElementById("modalOverlay")`, `modalContent = document.getElementById("modalContent")`.
- Modal helper functions for opening/closing.

**C. Local Bible Data & IndexedDB (lines 534–640)**
- **Bible data loading** (line 534): Lazy loads and caches `bibleData` object.
- **IndexedDB wrapper** (line 566): `openDB()` (line 570) returns a Promise<IDBDatabase>.
- **Verse cache functions** (line 600): `getVerseCache()`, `saveVerseCache()`, `clearVerseCache()`.

**D. UI State & Reflection (lines 624–900)**
- **App scroll control** (line 624): `lockAppScroll(lock)`.
- **Reflection visibility** (line 667): `applyReflectionVisibility()`, localStorage key `reflectionVisible`.
- **Theme toggle** (line 694): `updateIcon()`, `isLightMode` tracking.
- **Favorites & Comments** (line 699): `saveComments()` (line 699), `saveFavorites()` (line 783), `isFavorite()` (line 787), `toggleFavorite()` (line 791), `animateFavorite()` (line 800).

**E. Text-to-Speech (TTS) System (lines 825–1525)**
- **Synthesis management** (line 825): `_synthAcquire()`, `_synthRelease()`, `_synthReset()`.
- **Core TTS** (line 843): `_ttsSynthItem(item, gen)` — renders Web Audio for one verse.
- **Word-level highlighting** (line 886): `_injectWordSpans()` (line 886), `_restoreVerseText()` (line 896), `_computeSyntheticTimepoints()` (line 907), `_startWordHighlight()` (line 938), `_stopWordHighlight()` (line 992).
- **Queue building** (line 1066): `ttsBuildQueue()` — constructs playable verse list from #output.
- **Playback control** (line 1228): `ttsMark()` (line 1228), `pauseResumeTTS()` (line 1244), `_ttsImmShowPausePanel()` (line 1266).
- **Navigation** (line 1316): `ttsPrevVerse()`, `ttsNextVerse()` (line 1323), `_ttsCleanupMode()` (line 1330), `stopTTS()` (line 1337), `ttsFinish()` (line 1356).
- **Immersive TTS** (line 1495): `ttsShowPlayer()`, `ttsIcon()` (line 1500), `ttsSetStatus()` (line 1503), `ttsNavUpdate()` (line 1508).

**F. AI Reflection & Chat (lines 1533–2000)**
- **Reset AI sections** (line 1533): `resetAISections()` — clears prior AI output.
- **Chat history rendering** (line 1810): `renderChatHistory(key, container)`.
- **Passage title** (line 1963): `updatePassageTitle()`.
- **Control state** (line 1984): `updateControlStates()` — shows/hides UI based on mode.

**G. Passage Loading & Display (lines 2037–2900)**
- **Load passage by ID** (line 2037): `loadPassageById(id, scrollToVerse)` — main entry point after "Search" click.
  - Fetches verses from bibleData.
  - Sets `window.__aiPayload`.
  - Renders to #output with verse structure.
  - Stages AI request.
- **Dashboard navigation** (line 2068): `dashNoteGoToVerse()`, `dashNoteGoToReflection()` (line 2098).
- **Books/chapters/verses** (lines 2114–2566): `loadBooks()` (line 2114), `loadChapters()` (line 2507), `loadVerses()` (line 2522).
- **Version switching** (line 3546): `_updateVersionPills()`.
- **Load feedback** (line 2877): `showLoadError()`, `showLoading()` (line 2904), `hideLoading()` (line 2959).
- **Summary & parsing** (line 3058): `parseQuickSummary()`, `summaryMdToHTML()` (line 3077).

**H. Comments & Notes (lines 3295–3450)**
- **Render comments** (line 3340): `renderComments(key, container)` — displays verse-level notes.
- **Toggle all notes** (line 3425): `toggleAllNotes()`.
- **Render summary** (line 3448): `renderSummary()` — AI summary in sidebar.

**I. Initialization & Push (lines 3539–4000)**
- **Version pills** (line 3546): `_updateVersionPills(ver)`.
- **Events** (line 3539): Early event binding.
- **TTS button wiring** (line 3635).
- **Init** (line 3681): `_subscribePush()` (line 3681), `_getRecentNotesContext()` (line 3744), `_showNotifPrompt()` (line 3869), `_debouncedPushSync()` (line 3903).
- **Text area handling** (line 3984): `checkIfHasTextAreaAnswers()`.

**J. Utilities & UX Helpers (lines 4045–4260)**
- **Smooth scroll** (line 4045): `smoothScrollTo()`.
- **User name** (line 4132): `getUserName()`.
- **Dialogs** (line 4134): `_showNamePrompt()`, `_confirmDialog()`.
- **Textarea** (line 4212): `autoExpand()`.
- **Notes bubble** (line 4238): `showBackToNotesBubble()`, `hideBubble()` (line 4257).

**K. Notes App (lines 4261–5320)**
- **Session/note retrieval** (line 4261): `_getAllNotes()`.
- **CRUD operations** (line 4349): `openNotesApp()` (line 4349), `closeNotesApp()` (line 4358), `_getSessions()` (line 4370), `_renderNotesList()` (line 4388), `_openSessionDetail()` (line 4455), `_shareSession()` (line 4603), `_openNoteDetail()` (line 4630), `_closeNoteDetail()` (line 4639), `_renderNoteDetail()` (line 4648).
- **Standalone notes** (line 5261): `_createNewNote()`, `_updateStandaloneNote()` (line 5270), `_deleteStandaloneNote()` (line 5277).
- **Shared utilities** (line 5299): `_stripNotePreview()`, `_escHtml()` (line 5314).
- **Init** (line 5318): `initNotesApp()`.

**L. Immersive TTS (lines 5327–5820)**
- **Open/close** (line 5327): `ttsImmersiveOpen()`, `ttsImmersiveClose()` (line 5398).
- **Playback & scrubber** (line 5434): `_ttsImmStartPlayback()` (line 5434), `ttsImmContextOpen()` (line 5464), `ttsImmersiveBuildScrubber()` (line 5524), `ttsImmersiveUpdate()` (line 5540).
- **Preview & popover** (line 5638): `_immPreview()`, `_immHandleDoubleTap()` (line 5643).
- **Immersive reflection** (line 5678): `ttsImmReflectionOpen()`, `ttsImmReflectionShow()` (line 5701).
- **Verse ref parsing** (line 5787): `_immParseVerseRefs()`, `_immShowVersePopup()` (line 5796).

**M. Story System (lines 5829–6350)**
- **Tracking** (line 5829): `markStorySeen()`, `updateStorySeenState()` (line 5836).
- **Reflection bridge** (line 5909): `_storyToReflect()`, `closeStoryModal()` (line 5918).
- **Restore & progress** (line 5932): `_restoreDailyStory()`, `updateStoryProgress()` (line 5945), `animateMapProgress()` (line 5953).
- **Rendering** (line 5961): `renderStorySlide()`, `_prefetchNextStoryImage()` (line 5987).
- **Navigation** (line 5996): `storyNext()`, `storyPrev()` (line 6001), `updateStoryNavButtons()` (line 6006).
- **HTML builders** (line 6306): `buildSlideHTML()`, `buildGlanceHTML()` (line 6317), `buildMapHTML()` (line 6345), `buildSegmentHTML()` (line 6372), `buildSegmentFooterHTML()` (line 6409), `buildScrapbookHTML()` (line 6429), `buildConversationHTML()` (line 6495), `buildTeachingHTML()` (line 6542), `buildContrastHTML()` (line 6560), `buildRecapHTML()` (line 6580), `buildReflectHTML()` (line 6592).
- **Reflection utilities** (line 6733): `getReflectClosingLine()`, `boldify()` (line 6737), `esc()` (line 6741).
- **Close** (line 6879): `closeReflectModal()`.

**N. Verse Peek & Cross-Refs (lines 6901–7056)**
- **Peek functions** (line 6925): `openVersePeek()` — inline popup for verse lookup.

**O. SOAP Dashboard & Screen (lines 7062–7930)**
- **Main entry** (line 7062): `openSoapScreen()`.
- **Rendering** (line 7094): `_renderSoapScreenContent()`, `_soapScreenEntryHTML()` (line 7250).
- **Storage** (line 7288): `_soapStorageKey()`, `_getSoapEntries()` (line 7290), `_saveSoapEntries()` (line 7293), `_flushSoapToFirebase()` (line 7297).
- **SOAP buttons & picker** (line 7310): `_soapAPButtonsHTML()`, `_bindSoapAPButtons()` (line 7324), `_appendSoapPicker()` (line 7337).
- **Dashboard combined** (line 7456): `_renderSoapDashCombined()`.
- **Stack navigation** (line 7525): `_getFilteredSoapEntries()`, `_renderSoapStackCard()` (line 7530).
- **Event binding** (line 7635): `_rebuildSoapCombinedPills()`, `_bindSoapCombinedPills()` (line 7635), `_bindSoapStackNav()` (line 7652), `_bindSoapDashboard()` (line 7681).
- **List panel** (line 7713): `openSoapListPanel()`, `closeSoapListPanel()` (line 7732).
- **Verse links** (line 7892): `_bindSoapPassageLinks()`, `_parsePassageString()` (line 7901), `_showSoapVersePopover()` (line 7925).

**P. Image Creator (lines 8028–8200)**
- **Open/close** (line 8028): `openImageCreator()`, `closeImageCreator()` (line 8058).
- **Mode & UI** (line 8064): `_imgcrSwitchMode()`, `_imgcrPopulateBooks()` (line 8073).
- **Download** (line 8196): `_imgcrDownload()`.

**Q. Canvas Mode (lines 8216–end)**
- Drawing controls and state (`devo.canvas.*` localStorage keys).

---

### style.css (265,798 bytes, ~7500+ lines)

**Purpose**: Complete styling for the PWA. Uses CSS Grid, Flexbox, media queries for responsive design.

**Key Scopes**:
- **Root & scrolling** (@font-face, `.layout`, scrollbar styling — lines ~1–50).
- **Mobile/narrow responsive** (@media max-width: 1100px — lines ~100+).
- **Main layout** (`.main`, `.controls`, `.controls.smart-header`, sidebar `.summary` — flex containers).
- **Bible display** (`.bible`, `.verse`, `.verse-header`, `.verse-content`, `.verse-num`).
- **AI sections** (`#aiReflection`, textarea styling, animated fade-ins).
- **Modals & sheets** (`.modal-overlay`, `.bc-sheet`, `.story-modal`, `.tts-immersive`).
- **Notes app** (`.notes-app`, `.notes-list-view`, `.notes-detail-view`).
- **TTS player** (`.tts-player`, `.tts-immersive` with stage layout).
- **Canvas mode** (`.canvas-*`, drawing controls).
- **SOAP dashboard** (`.soap-*` classes for combined pill view, stack cards).
- **Animations** (`.verseGlow` flash, `.ai-fade-in`, typing effects).
- **Dark/light theme** via CSS variables and `body.light-mode` / `body.dark-mode` toggling.

---

### config.js (270 bytes)

**Purpose**: Static configuration constants loaded early.

```javascript
window.GOOGLE_TTS_KEY = "...";
window.VAPID_PUBLIC_KEY = "...";
window.PUSH_SERVER_URL = "https://gemini-proxy-668755364170.asia-southeast1.run.app";
```

---

### firebase-sync.js (~430 lines)

**Purpose**: Bootstrap layer for multi-user Firebase RTDB sync (Charlie + Karla as of 2026-04-29). Runs before the app scripts inject. Each sync user has their OWN RTDB path, so devotions/notes/reflections stay private to their account / devices.

**Flow**:
1. **Check identity** (bootstrap IIFE): If `userName.toLowerCase() in SYNC_USERS`, call `_activateSyncFor(name)`.
2. **Resolve path**: `_syncPath = SYNC_USERS[name]` — Charlie → `"devo-sync"` (legacy, kept stable for back-compat), Karla → `"devo-sync-karla"`.
3. **Merge on boot** (`_mergeOnBoot`): Pull remote state from `_syncPath`, fold in any local data, push merged result back.
4. **Install mirror** (`_installMirror`): Shadow window.localStorage with proxy object that reads/writes to the mirror, debounce-flushes to RTDB at `_syncPath`.
5. **Listen for remote** (`_listenForRemoteChanges`): `.on("value")` at `_syncPath` applies remote changes, re-parses JSON globals, triggers UI refresh.
6. **Mid-session swap**: If a different sync user is currently active, `_activateSyncFor` calls `_deactivateSync()` first to tear down the old mirror/listener/timers before activating the new path. No page reload needed for charlie ↔ karla swaps.

**Key Constants**:
- `SYNC_STATIC_KEYS`: `bibleFavorites`, `bibleComments`, `devotionStandaloneNotes`, `storySeenHistory`, `userName`, `bibleVersion`, `recentPassageId`, `recentPassage`, `soap_application`, `soap_prayer`, `dashGreetingCacheV2`.
- `SYNC_DYNAMIC_PREFIXES`: `"reflection-"`, `"devo.canvas."`, `"chapterContext."`, `"passageRecap-"`.
- `SYNC_USERS`: `{ charlie: "devo-sync", karla: "devo-sync-karla" }` — extend here to add more users.
- `FB_WRITE_DEBOUNCE_MS`: 400.

**Public API (window globals)**:
- `activateSyncForUser(name)` — generic activation; safe to call mid-session (handles user swaps internally).
- `deactivateSync()` — tear down whatever user is active.
- `activateCharlieSync()` / `activateKarlaSync()` — back-compat shims; both delegate to `activateSyncForUser`.
- `deactivateCharlieSync` / `deactivateKarlaSync` — back-compat shims pointing at `deactivateSync`.

**Merge strategies** (preserved across users):
- Favorites/storySeenHistory: `max` (take highest value).
- Comments: Merge by verse key, keep all entries.
- Canvas: Latest wins.
- Standalone notes: Merge by ID, latest `updatedAt` wins.
- SOAP entries: Merge by ID.

---

### bible-meta.js (6,295 bytes, ~200+ lines)

**Purpose**: Precomputed metadata for all 66 Bible books.

**Structure**:
```javascript
window.BIBLE_META = {
  GEN: { name: "Genesis", chapters: [31,25,24,...,32] },
  EXO: { name: "Exodus", chapters: [...] },
  // ... 64 more books
}
```

**Used by**: `loadBooks()` (script.js:2114) to populate book selector and validate chapter/verse ranges.

---

### sw.js (2,906 bytes, ~101 lines)

**Purpose**: Service worker for offline support and aggressive cache refresh.

**Key Functions**:
- **install** (line 19): Force immediate activation, cache CORE_ASSETS with `cache: "no-store"`.
- **activate** (line 31): Delete all old caches, claim all clients.
- **fetch** (line 76): Network-first for assets, network-only for HTML.
- **push** (line 48): Display notification for push events.
- **notificationclick** (line 61): Focus app window or open new.

**Deployment Strategy**: Uses `Date.now()` in `DEPLOYMENT_ID` to create a unique cache name on every deploy, ensuring stale caches are never reused.
