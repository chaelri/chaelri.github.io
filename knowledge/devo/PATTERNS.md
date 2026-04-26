## Recurring Code Patterns

### 1. localStorage Schema & Access Patterns

**Static Keys** (script.js top-level, set early):
```javascript
let currentVersion = localStorage.getItem("bibleVersion") || "NASB";  // line 11
let comments = JSON.parse(localStorage.getItem("bibleComments") || "{}");  // line 778
let favorites = JSON.parse(localStorage.getItem("bibleFavorites") || "{}");  // line 781
let reflectionVisible = JSON.parse(localStorage.getItem("reflectionVisible")) ?? false;  // line 665
let isLightMode = JSON.parse(localStorage.getItem("isLightMode")) || false;  // line 681
```

**Save patterns**:
```javascript
function saveFavorites() {
  localStorage.setItem("bibleFavorites", JSON.stringify(favorites));  // line 784
}
```

**Reflection responses** (one Q&A per localStorage key):
```javascript
localStorage.setItem(`reflection-${devotionId()}-${i}`, `Q: ${questionText}\nA: ${ta.value}`);  // line 6870
const saved = localStorage.getItem(ta.id);  // line 6853, parse as text
```

**Reflection timestamps** (migration pattern):
```javascript
const savedReflTime = parseInt(localStorage.getItem(`reflection-time-${passageId}`) || "0");  // line 4309
localStorage.setItem(`reflection-time-${devotionId()}`, String(Date.now()));  // line 3961
```

**Canvas state** (keyed by component ID):
```javascript
const raw = localStorage.getItem(`devo.canvas.${key}`);  // line 8510
localStorage.setItem(`devo.canvas.${stateKey}`, JSON.stringify(state));  // line 8520
```

**SOAP entries**:
```javascript
function _soapStorageKey(type) { return `soap_${type}`; }  // line 7288
const entries = JSON.parse(localStorage.getItem(_soapStorageKey(type)) || "[]");  // line 7291
localStorage.setItem(_soapStorageKey(type), JSON.stringify(entries));  // line 7294
```

**Standalone notes** (array in one key):
```javascript
const standalone = JSON.parse(localStorage.getItem("devotionStandaloneNotes") || "[]");  // line 4333
localStorage.setItem("devotionStandaloneNotes", JSON.stringify(standalone));  // line 5266
```

**Story seen tracking**:
```javascript
const seen = JSON.parse(localStorage.getItem("storySeenHistory") || "{}");  // line 5831
localStorage.setItem("storySeenHistory", JSON.stringify(seen));  // line 5833
```

---

### 2. Modal Reuse Pattern

**Two-element reuse** (`#modalOverlay` and `#modalContent`):
```javascript
const modalOverlay = document.getElementById("modalOverlay");  // line 451
const modalContent = document.getElementById("modalContent");  // line 453

function openCrossRefPeek(refStr, anchorEl) {
  if (!modalOverlay || !modalContent) return;
  modalOverlay.hidden = false;
  modalContent.innerHTML = `<div>...cross-ref html...</div>`;
}

// Close on backdrop click
if (modalOverlay) {
  modalOverlay.onclick = (e) => {
    if (e.target === modalOverlay) modalOverlay.hidden = true;
  };
}
```

**Other modals** (reuse same container pattern):
- `#storyModal` (line 492 of index.html): Story content wrapper.
- `#reflectModal` (line 512): Reflection content wrapper.
- `#ttsImmersive` (line 376): Immersive TTS overlay with stage, footer, reflection panel.

---

### 3. Verse Rendering Structure

**Standard verse DOM layout** (generated in `loadPassageById`, lines 2697–2722):
```javascript
const wrap = document.createElement("div");
wrap.className = "verse";
wrap.dataset.verseKey = key;  // e.g., "JHN-3-16"
wrap.innerHTML = `
  <div class="verse-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
    <div class="verse-content">
      <span class="verse-num">${v.verse}</span>${formattedText}
    </div>
    <!-- metadata & comment toggle -->
  </div>
`;
document.getElementById("output").appendChild(wrap);
```

**Verse selection by ID** (TTS, immersive reflection):
```javascript
const allVerses = document.querySelectorAll("#output .verse");  // line 3262
const target = [...allVerses].find(el =>
  el.querySelector(".verse-num")?.textContent?.trim() === verseNum
);
```

**Metadata indicators** (comment count, favorite badge):
```javascript
let metaIndicators = verseContent.querySelector(".verse-meta-indicators");
if (!metaIndicators) {
  metaIndicators = document.createElement("span");
  metaIndicators.className = "verse-meta-indicators";
  verseContent.appendChild(metaIndicators);
}
// Update with comment count, favorite icon, etc.  // lines 3300–3327
```

**verseGlow animation** (flash highlight):
```javascript
const allVerses = document.querySelectorAll("#output .verse");
const target = allVerses.find(el => el.querySelector(".verse-num")?.textContent?.trim() === verseNum);
if (target) {
  const header = target.querySelector(".verse-header") || target;
  header.classList.remove("verseGlow");
  setTimeout(() => { header.classList.add("verseGlow"); }, 10);  // lines 3262–3271
}
```
(CSS rule: `.verseGlow { animation: flashGlow 0.6s ease-in-out; }`)

---

### 4. window.__aiPayload Staging Pattern

**Set before AI request**:
```javascript
window.__aiPayload = {
  book: bookName.toUpperCase(),        // e.g., "JOHN"
  chapter: String(ch),                 // e.g., "3"
  isSingle: single ? true : undefined,
  versesText                           // "\nv1. John was...\nv2. In the..."
};  // line 2639
```

**Used by AI functions**:
```javascript
function renderAIReflectionQuestions(payload) {
  const { book, chapter, isSingle, versesText } = window.__aiPayload || {};
  // ... call _typeOut() with versesText as context
}

// TTS uses it for context:
const lines = (window.__aiPayload?.versesText || "").split("\n").filter(Boolean);  // line 1068
```

**Preserved on cross-ref navigation**:
```javascript
const prevPayload = window.__aiPayload;  // line 360
// ... open peek or navigate
window.__aiPayload = prevPayload;
```

---

### 5. IndexedDB Cache Layer (devo-cache)

**Image DB** (declared but unused in current code):
```javascript
const _IMG_DB_NAME = "devo-cache";  // line 83
const _IMG_DB_VER = 1;
```

**Verse DB** (current, `dudu-devotion-db`):
```javascript
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("dudu-devotion-db", 1);
    req.onsuccess = () => resolve(req.result);
    // ... upgrade handler to create "verses" store
  });  // lines 570–596
}

async function getVerseCache(key) { /* ... */ }   // line 604
async function saveVerseCache(key, verses) { /* ... */ }  // line 624
async function clearVerseCache(key) { /* ... */ }  // line 638
```

**Lifecycle**: Opened on demand, cached data persists across sessions, survives browser restart.

---

### 6. TTS Item & Queue Pattern

**TTS item object** (populated by `ttsBuildQueue`, line 1066):
```javascript
const item = {
  verseNum: String(i + 1),          // "1", "2", ...
  el: verseEl,                       // DOM reference
  audio: null,                       // Web Audio buffer after synthesis
  startTime: 0,                      // playback time in seconds
  words: [],                         // [{ word, start, duration }, ...]
};
```

**Queue build** (lines 1067–1213):
```javascript
function ttsBuildQueue() {
  const els = [...document.querySelectorAll("#output .verse")];
  const lines = (window.__aiPayload?.versesText || "").split("\n").filter(Boolean);
  const queue = els.map((el, i) => ({
    verseNum: el.querySelector(".verse-num")?.textContent?.trim() || String(i + 1),
    el,
  }));
  // Then synthesize each item asynchronously
}
```

**Playback tracking**:
```javascript
let ttsIdx = 0;                       // current item index
let ttsQueue = [];                    // full queue
let ttsAudioContext = null;           // Web Audio context
```

**Word highlighting** during playback:
```javascript
function _startWordHighlight(audio, item) {
  // Parse item.words, schedule highlights via requestAnimationFrame
  // lines 938–989
}

function _stopWordHighlight() {
  document.querySelectorAll("#output .verse.tts-active").forEach(v => v.classList.remove("tts-active"));
  document.querySelectorAll("#output .verse-header.verse-highlight").forEach(v => v.classList.remove("verse-highlight"));
}
```

---

### 7. Reflection State & Auto-Migration

**Reflection key format**: `reflection-[BOOK]-[CHAPTER]-[VERSE]-[INDEX]`
Example: `reflection-PSA-117-1-0` (first Q&A for Psalm 117:1).

**Auto-save on textarea change** (line 3937–3961):
```javascript
const textAreas = document.querySelectorAll('textarea[id^="reflection-"]');
textAreas.forEach(ta => {
  ta.addEventListener("input", () => {
    const questionText = ta.dataset.question || "";
    localStorage.setItem(ta.id, `Q: ${questionText}\nA: ${ta.value}`);
    localStorage.setItem(`reflection-time-${devotionId()}`, String(Date.now()));
  });
});
```

**Reflection timestamp migration** (one-time, line 4113–4128):
```javascript
if (localStorage.getItem("refl-time-migrated")) return;
const passageIds = new Set();
for (const k of Object.keys(localStorage)) {
  if (!k.startsWith("reflection-") || k.startsWith("reflection-time-")) continue;
  const keyParts = k.replace("reflection-", "").split("-");
  const passageId = `${keyParts[0]}-${keyParts[1]}-${keyParts[2]}`;
  passageIds.add(passageId);
}
```

---

### 8. Comments (Verse Notes) Pattern

**Storage**:
```javascript
let comments = JSON.parse(localStorage.getItem("bibleComments") || "{}");
// Structure: { "JHN-3-16": [{ text: "...", time: 1713916200 }, ...], ... }
```

**Render** (line 3340):
```javascript
function renderComments(key, container, { skipFocus = false } = {}) {
  const list = comments[key] || [];
  container.innerHTML = list.map((cmt, i) => `
    <div class="comment-item">
      <p>${cmt.text}</p>
      <button onclick="deleteComment('${key}', ${i})">Delete</button>
    </div>
  `).join("");
}
```

**Add/delete**:
```javascript
function deleteComment(key, index) {
  const list = comments[key] || [];
  list.splice(index, 1);
  saveComments();
}

const val = prompt("Note on verse?");
if (!comments[key]) comments[key] = [];
comments[key].push({ text: val, time: Date.now() });
saveComments();  // line 3405–3410
```

**Visibility toggle** (line 2775–2785):
```javascript
const commentsEl = wrap.querySelector(".comments");
commentsEl.hidden = !commentsEl.hidden;
if (!commentsEl.hidden) renderComments(key, commentsEl);
```

---

### 9. Favorites (Bookmarking) Pattern

**Storage**:
```javascript
let favorites = JSON.parse(localStorage.getItem("bibleFavorites") || "{}");
// Structure: { "JHN-3-16": 1713916200, "ROM-8-28": 1713916100, ... }
```

**Check & toggle**:
```javascript
function isFavorite(key) { return !!favorites[key]; }  // line 787

function toggleFavorite(key) {
  if (favorites[key]) {
    delete favorites[key];
  } else {
    favorites[key] = Date.now();
  }
  saveFavorites();
}  // lines 791–798
```

**Animate** (heart icon flash):
```javascript
function animateFavorite(verseWrap) {
  const icon = verseWrap.querySelector(".heart-icon");
  if (icon) {
    icon.classList.add("pulse");
    setTimeout(() => icon.classList.remove("pulse"), 600);
  }
}  // lines 800–823
```

**Dashboard display** (paginated list):
```javascript
const favoritesKeys = Object.keys(favorites).sort(
  (a, b) => favorites[b] - favorites[a]  // newest first
);
const allFavoritePassages = favoritesKeys.map(key => {
  const [book, ch, v] = key.split("-");
  return { key, book, chapter: ch, verse: v, time: favorites[key] };
});
```

---

### 10. Service Worker Cache Pattern (sw.js)

**Deployment ID**:
```javascript
const DEPLOYMENT_ID = "v1.1.0-" + Date.now();
const CACHE_NAME = "dudu-devotion-" + DEPLOYMENT_ID;
```

**Install** (force new cache):
```javascript
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(
        CORE_ASSETS.map((url) => new Request(url, { cache: "no-store" }))
      );
    })
  );
});
```

**Activate** (nuke old caches):
```javascript
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});
```

**Fetch** (network-first for assets):
```javascript
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {
    event.respondWith(fetch(req, { cache: "no-store" }));
    return;
  }
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
```

---

### 11. Firebase Sync Mirror Pattern (Charlie-only)

**Detection**:
```javascript
const name = (_realLs.getItem(BOOTSTRAP_KEY) || "").trim().toLowerCase();
_isCharlie = name === "charlie";  // line 54 firebase-sync.js
```

**Mirror proxy**:
```javascript
const mirrorLs = {
  getItem(key) { return key in _mirror ? _mirror[key] : null; },
  setItem(key, value) {
    const v = String(value);
    if (_mirror[key] === v) return;
    _mirror[key] = v;
    if (_suppressFbWrites) return;
    if (!_shouldSync(key)) return;
    _scheduleFbWrite(key, v);  // debounce 400ms
  },
  removeItem(key) { /* ... */ },
};
Object.defineProperty(window, "localStorage", {
  configurable: true,
  get() { return mirrorLs; },
});
```

**Remote listen**:
```javascript
_fbDb.ref(RTDB_PATH).on("value", (snap) => {
  const remote = snap.val() || {};
  const decoded = _decodeAll(remote);
  for (const [key, val] of Object.entries(decoded)) {
    if (_mirror[key] !== val) {
      _mirror[key] = val;
    }
  }
  for (const key of Object.keys(_mirror)) {
    if (!(key in decoded)) delete _mirror[key];
  }
  if (typeof renderDashboard === "function") {
    try { renderDashboard(); } catch {}
  }
});
```
