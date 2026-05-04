## Overview

> **Note (2026-04-27 split):** Line numbers in playbooks below reference the original monolithic `devo/script.js`. Code now lives in 11 ordered chunks under `devo/js/`. When a step says "edit script.js around line X", use [`KEY_FILES.md`](KEY_FILES.md)'s line-range map to find the right `js/0N-*.js` file. The semantics are identical — chunks share one script-global scope.

Step-by-step playbooks for common development tasks. All line numbers and element IDs from the actual `devo/` codebase. Follow existing patterns for consistency.

---

## 1. Add a New Control to the Toolbar

**Files:** `index.html` (70–82), `script.js` (~1300), `style.css`

**Steps:**

1a. Add button to HTML (index.html, ~70–82):
```html
<button class="mt-custom-btn" id="mtCustomAction" aria-label="My action">
  <span class="material-icons">your_icon</span>
</button>
```

1b. Wire click handler (script.js, ~1300):
```javascript
const mtCustomBtn = document.getElementById("mtCustomAction");
if (mtCustomBtn) {
  mtCustomBtn.onclick = () => { myNewFunction(); };
}
```

1c. Add CSS (style.css):
```css
.mt-custom-btn {
  padding: 8px 12px; border: none; background: transparent;
  cursor: pointer; display: flex; align-items: center; gap: 4px;
}
.mt-custom-btn:hover { background: rgba(255, 255, 255, 0.1); }
.mt-custom-btn.active { background: rgba(107, 122, 148, 0.3); }
```

**Pattern examples:** `mtListen` (line 60), `mtThemeToggle` (line 97)

---

## 2. Add a New localStorage Setting

**Files:** `script.js`, `firebase-sync.js` (if synced)

**Steps:**

2a. Define key (kebab-case or dot-notation):
- Top-level: `"bibleVersion"` (line 11), `"isLightMode"` (line 681)
- Dynamic: `"reflection-time-${passageId}"` (line 3961), `"devo.canvas.${id}"` (line 35)

2b. Read on init (script.js, top-level, lines 1–50):
```javascript
let myNewSetting = localStorage.getItem("myNewKey") || "default-value";
```

2c. Save on change:
```javascript
document.getElementById("myBtn").onclick = () => {
  myNewSetting = "new-value";
  localStorage.setItem("myNewKey", myNewSetting);
};
```

2d. Register for Firebase sync (firebase-sync.js, lines 22–35, if needed):
```javascript
const SYNC_STATIC_KEYS = [
  "bibleFavorites",
  // ... existing ...
  "myNewKey",  // ADD THIS
];
```

**Example:** Theme toggle (lines 681–690)

---

## 3. Add a New AI Prompt (Gemini Proxy)

**Files:** `script.js`, `index.html` (optional mount)

**Steps:**

3a. Create mount (if needed):
```html
<div id="myModal" class="modal" hidden>
  <div id="myModalMount"></div>
</div>
```

3b. Non-streaming function:
```javascript
async function myAIFeature() {
  const mount = document.getElementById("myModalMount");
  mount.innerHTML = `<div>${sparkleLoaderHTML('Generating...')}</div>`;
  try {
    const prompt = `${AI_TONE}\n\nGenerate for: ${window.__aiPayload?.book}...`;
    const result = await callGemini(prompt);
    mount.innerHTML = mdToHTML(result);
  } catch (err) {
    mount.innerHTML = "<p>Failed.</p>";
  }
}
```

3c. Streaming function:
```javascript
async function myStreamingFeature() {
  const mount = document.getElementById("myModalMount");
  const responseEl = document.createElement("div");
  mount.appendChild(responseEl);

  await callGeminiStream(prompt, (delta, full) => {
    responseEl.innerHTML = mdToHTML(full);
  });
}
```

3d. Set `window.__aiPayload` before calling:
```javascript
window.__aiPayload = {
  book: "GENESIS",
  chapter: "1",
  versesText: "1:1 In the beginning...\n1:2 And..."
};
myAIFeature();
```

3e. Wire to button:
```javascript
document.getElementById("myTriggerBtn").onclick = () => {
  if (!window.__aiPayload) { alert("Load a passage first."); return; }
  myAIFeature();
};
```

**Pattern example:** `renderAIContextSummary()` (lines 2967–3056, dual prompt)

---

## 4. Add a Modal-Based Feature

**Files:** `index.html`, `script.js`, `style.css`

**Steps:**

4a. Add HTML (index.html):

Option A — Reuse global `#modalOverlay` (line 348):
```html
<!-- No new HTML; use existing #modalOverlay / #modalContent -->
```

Option B — Dedicated modal:
```html
<div id="myFeatureModal" class="modal my-feature-modal" hidden>
  <div class="modal-overlay" onclick="closeMyModal()"></div>
  <div class="modal-box">
    <button class="modal-close" onclick="closeMyModal()">✕</button>
    <div id="myFeatureMount"></div>
  </div>
</div>
```

4b. Open function (script.js):
```javascript
async function openMyModal() {
  const modal = document.getElementById("myFeatureModal");
  const mount = document.getElementById("myFeatureMount");
  modal.hidden = false;
  mount.innerHTML = sparkleLoaderHTML('Loading...');
  try {
    mount.innerHTML = await fetchMyData();
  } catch (err) {
    mount.innerHTML = "<p>Error</p>";
  }
}
```

4c. Close function (script.js):
```javascript
function closeMyModal() {
  const modal = document.getElementById("myFeatureModal");
  if (modal) {
    modal.classList.add("fade-out");
    setTimeout(() => {
      modal.hidden = true;
      modal.classList.remove("fade-out");
    }, 250);
  }
}
```

**Examples:** Story modal (lines 5843–5907), Reflect modal

---

## 5. Add a New Free-Form Journal (mirrors Obedience / Gratitude / Prayers)

**Files:** `js/04-passage.js`, `firebase-sync.js`

**Replaces the old SOAP guide** — SOAP was deleted 2026-05-05. The current pattern is three parallel journals, each living in `04-passage.js`, with a pink dashboard pill in `dash-journal-row` and a modal that opens via `#modalOverlay` / `#modalContent`. The Prayers journal added 2026-05-05 is the cleanest reference because it's the simplest of the three (free text, no status/notes).

**Current structure (all in `04-passage.js`):**
- `_OBED_JOURNAL_KEY = "obedienceJournal"` — entries: `{id, ts, text, status: "todo"|"done", notes?: [...]}`
- `_GRAT_JOURNAL_KEY = "gratitudeJournal"` — entries: `{id, ts, text}`
- `_PRAY_JOURNAL_KEY = "prayersJournal"` — entries: `{id, ts, text}`

**Steps to add a new journal:**

5a. Define helpers in `04-passage.js` (mirror the Prayers block):
```javascript
const _MYJ_JOURNAL_KEY = "myjJournal";
const _MYJ_JOURNAL_MAX = 500;

function _getMyjEntries() { /* same shape as _getPrayersEntries */ }
function _saveMyjEntries(arr) { /* localStorage.setItem */ }
function _addMyjEntry(entry) { /* unshift + cap at MAX */ }
function _deleteMyjEntry(id) { /* filter by id */ }
function _refreshMyjJournalLink() { /* update count badge + empty class */ }

function openMyjJournal() {
  // Build modal markup using the .grat-modal / .grat-* class structure
  // for free reuse of the existing pink-themed modal styling. Add a
  // .myj-modal modifier if you want unique tweaks.
}

function _renderMyjEntry(e) { /* one <li> per entry */ }
```

5b. Add the dashboard pill in `renderDashboard` (`04-passage.js`, in `.dash-journal-row`):
```javascript
<button type="button" id="dashMyjLink" class="dash-journal-link dash-journal-link--myj dash-journal-link-empty" onclick="openMyjJournal()">
  <span class="material-symbols-outlined">your_icon</span>
  <span>My journal</span>
  <span id="dashMyjCount" class="dash-journal-count"></span>
  <span class="material-symbols-outlined dash-journal-arrow">arrow_forward</span>
</button>
```
Plus call `_refreshMyjJournalLink()` near the other `_refresh*JournalLink()` calls.

5c. Wire Firebase sync in `firebase-sync.js`:
```javascript
const SYNC_STATIC_KEYS = [
  // ... existing ...
  "myjJournal",  // ADD THIS
];
// And in the noteJournalKey handler in _listenForRemoteChanges:
if (k === "obedienceJournal" || k === "gratitudeJournal" || k === "prayersJournal" || k === "myjJournal")
  changedJournalKeys.push(k);
```

5d. Wire the live re-render in the `devo:journal-sync` event listener (bottom of `04-passage.js`):
```javascript
if (keys.includes("myjJournal")) {
  _refreshMyjJournalLink();
  if (modalOpen && content.querySelector(".myj-modal")) {
    const draft = content.querySelector(".myj-add-input")?.value || "";
    openMyjJournal();
    const ta = document.querySelector(".myj-modal .myj-add-input");
    if (ta && draft) ta.value = draft;
  }
}
```

**Flow:** User taps the pill → `openMyjJournal()` builds the modal in `#modalContent` → user types in a textarea → save handler calls `_addMyjEntry` (which writes to localStorage, mirrored to RTDB by `firebase-sync.js`'s `setItem` proxy) → `_refreshMyjJournalLink()` updates the dashboard count badge → modal re-opens to show the new entry.

---

## 6. Add a Verse-Level Action

**Files:** `script.js` (2700–2790), `style.css`

**Steps:**

6a. Add button to verse HTML (script.js, lines 2712–2716):
```javascript
<div class="verse-actions">
  <button class="verse-action-btn" data-action="context">…</button>
  <button class="verse-action-btn" data-action="ask">…</button>
  <button class="verse-action-btn" data-action="note">…</button>
  <!-- NEW -->
  <button class="verse-action-btn" data-action="myAction">
    <span class="material-icons">my_icon</span>
    <span>My Action</span>
  </button>
</div>
```

6b. Wire click handler (script.js, lines 2739–2778):
```javascript
const myActionBtn = wrap.querySelector('[data-action="myAction"]');
if (myActionBtn) {
  myActionBtn.onclick = (e) => {
    e.stopPropagation();
    const mount = wrap.querySelector(".inline-ai-mount");
    myVerseAction(key, book, chapter, verse, text, mount);
  };
}
```

6c. Implement function:
```javascript
async function myVerseAction(key, book, chapter, verse, text, mount) {
  mount.innerHTML = '<div>Loading...</div>';
  try {
    const result = await callGemini(`Do something with ${book} ${chapter}:${verse}`);
    mount.innerHTML = mdToHTML(result);
  } catch {
    mount.innerHTML = "<p>Error</p>";
  }
}
```

---

## 7. Add Feature to Immersive TTS Overlay

**Files:** `index.html` (~376), `script.js` (5327–5627)

**Steps:**

7a. Add UI element (index.html, near `id="ttsImmersive"`):
```html
<div id="ttsImmersive" class="tts-immersive" hidden>
  <div class="tts-imm-footer">
    <button id="ttsImmMyFeatureBtn" class="tts-imm-btn">
      <span class="material-icons">my_icon</span>
    </button>
  </div>
  <div id="ttsImmMyPanel" hidden class="tts-imm-panel">
    <div id="ttsImmMyMount"></div>
  </div>
</div>
```

7b. Wire button in `ttsImmersiveOpen()` (script.js, lines 5327–5374):
```javascript
document.getElementById("ttsImmMyFeatureBtn").onclick = () => {
  const panel = document.getElementById("ttsImmMyPanel");
  panel.hidden = !panel.hidden;
  if (!panel.hidden) loadMyFeature();
};
```

7c. Implement feature:
```javascript
async function loadMyFeature() {
  const mount = document.getElementById("ttsImmMyMount");
  mount.innerHTML = sparkleLoaderHTML('Loading...');
  try {
    mount.innerHTML = await fetchData();
  } catch {
    mount.innerHTML = "<p>Error</p>";
  }
}
```

7d. Clean up in `ttsImmersiveClose()` (script.js, lines 5398–5432):
```javascript
const panel = document.getElementById("ttsImmMyPanel");
if (panel) panel.hidden = true;
```

**Examples:** Reflection panel (`#ttsImmReflPanel`, line 5332), Context panel (`#ttsImmContextPanel`, line 5421)

---

## 8. Push a New Deploy

**Files:** `sw.js` (lines 1–4)

**Steps:**

8a. Update DEPLOYMENT_ID (sw.js, line 3):
```javascript
const DEPLOYMENT_ID = "v1.2.0-" + Date.now();  // ALWAYS include Date.now()
const CACHE_NAME = "dudu-devotion-" + DEPLOYMENT_ID;
```

8b. Commit and push:
```bash
git add devo/
git commit -m "Feature: Add my new feature"
git push
```

**No manual cache clearing needed.** Each SW update:
- `install` forces `skipWaiting()` (line 20)
- `activate` deletes all old caches (line 36)
- Clients reload on `controllerchange`

8c. Users on old version see updates on next page load:
- HTML always NETWORK (line 83–84)
- New HTML pulls fresh `script.js`, `style.css`
- Old cache cleared on new SW activation

**Key constants:**
- `CORE_ASSETS` (lines 7–16) — always refresh
- `CACHE_NAME` uses `DEPLOYMENT_ID` with timestamp

**Do NOT manually edit `CACHE_NAME`.** Use `Date.now()` suffix for uniqueness.

---

## Summary Table

| Task | Files | Key Functions | Key Elements |
|------|-------|---------------|--------------|
| Toolbar Button | HTML (70–82), script.js (~1300), CSS | onClick | `.mt-*` pattern |
| localStorage | script.js (1–50), firebase-sync.js | getItem/setItem | kebab-case keys |
| AI Prompt | script.js | callGemini / callGeminiStream | `window.__aiPayload` |
| Modal | HTML, script.js, CSS | openXxx / closeXxx | `#modalOverlay` or dedicated |
| Free-form journal | js/04-passage.js, firebase-sync.js | _getPrayersEntries / _getGratitudeEntries / _getObedienceJournal | dashJournalRow, SYNC_STATIC_KEYS |
| Verse Action | script.js (2712–2790) | Button handler | `.verse-action-btn` data-action |
| Immersive | HTML (376), script.js (5327–5432) | ttsImmersiveOpen/Close | `#ttsImm*` IDs |
| Deploy | sw.js (3) | DEPLOYMENT_ID | Date.now() suffix |
