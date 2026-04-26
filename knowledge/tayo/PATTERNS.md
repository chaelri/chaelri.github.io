# Tayo — Recurring Patterns

## 1. RTDB Read/Write

**One-time read:**
```js
onValue(ref(db, "tayo/settings/vibe"), (snap) => {
  const vibe = snap.val() || "anything";
}, {onlyOnce: true});
```

**Continuous listen:**
```js
const unsub = onValue(ref(db, "tayo/presence/karla"), (snap) => {
  partnerOnline = snap.val()?.online === true;
});
remoteListeners.push(unsub);  // track for cleanup
```

**Write:**
```js
set(ref(db, "tayo/settings/vibe"), newVibe);
update(ref(db, "tayo/remote/quizAnswers"), {charlie: {pick: 2, time: Date.now()}});
remove(ref(db, "tayo/remote/session"));
onDisconnect(myPresRef).set({online: false, lastSeen: serverTimestamp()});
```

## 2. Presence Detection

```js
function setOnline(isOnline) {
  set(myPresRef, {online: isOnline, lastSeen: Date.now()});
}

document.addEventListener("visibilitychange", () => {
  setOnline(!document.hidden);
});

onValue(partnerRef, (snap) => {
  partnerOnline = snap.val()?.online === true;
  $("partner-dot").classList.toggle("offline", !partnerOnline);
});
```

## 3. Vibe Tracking

```js
function saveVibe(vibe) {
  currentVibe = vibe;
  updateVibeDisplay(vibe);
  set(ref(db, "tayo/settings/vibe"), vibe);
}

function updateVibeDisplay(vibe) {
  const label = vibe.charAt(0).toUpperCase() + vibe.slice(1);
  el.textContent = label;
  el.style.setProperty("--current-vibe-color", VIBE_COLORS[vibe] || "#998e8e");
}
```

## 4. Journal CRUD

**Create:**
```js
function saveToJournal() {
  const journal = JSON.parse(localStorage.getItem("tayo_journal") || "[]");
  journal.unshift({
    question: currentQuestion,
    charlie: currentAnswers.charlie || "",
    karla: currentAnswers.karla || "",
    charlieVoiceURL: voices.charlie || null,
    karlaVoiceURL: voices.karla || null,
    time: Date.now(),
  });
  if (journal.length > 200) journal = journal.slice(0, 200);
  localStorage.setItem("tayo_journal", JSON.stringify(journal));
  syncJournalToFirebase();
}
```

**Update (edit):**
```js
journal[idx].charlie = newText;
localStorage.setItem("tayo_journal", JSON.stringify(journal));
syncJournalToFirebase();
```

**Delete:**
```js
journal.splice(idx, 1);
localStorage.setItem("tayo_journal", JSON.stringify(journal));
syncJournalToFirebase();
// Also delete voice files from Storage
```

## 5. localStorage + Firebase Sync

```js
function syncJournalToFirebase() {
  const journal = JSON.parse(localStorage.getItem("tayo_journal") || "[]");
  set(ref(db, "tayo/journal"), journal);
}

// Load from Firebase on init
onValue(ref(db, "tayo/journal"), (snap) => {
  if (snap.val()) localStorage.setItem("tayo_journal", JSON.stringify(snap.val()));
}, {onlyOnce: true});
```

## 6. Mode Toggle (Journal vs Settings)

```js
$("journal-hint").addEventListener("click", () => {
  const journal = JSON.parse(localStorage.getItem("tayo_journal") || "[]");
  const list = $("journal-list");
  list.innerHTML = journal.map((e, idx) => /* render entry */).join("");
  $("journal").classList.add("open");
});

$("settings-btn").addEventListener("click", () => {
  settingsPanel.classList.add("open");
  settingsBackdrop.classList.add("show");
});

function closeSettings() {
  settingsPanel.classList.remove("open");
  settingsBackdrop.classList.remove("show");
}
```

## 7. Play Mode Switching

```js
function setPlayMode(mode) {
  playMode = mode;
  localStorage.setItem("tayo_playmode", mode);
  if (mode === "remote") {
    remoteSection.classList.remove("hidden");
    initRemote();
  } else {
    cleanupRemote();
  }
}

function setIdentity(id) {
  myIdentity = id;
  localStorage.setItem("tayo_identity", id);
}
```

## 8. Voice Recording State Machine

```
idle (show voice-btn)
  ↓ click
recording (show timer + live wave)
  ↓ stop or timeout
preview (show waveform + play/delete)
  ↓ save or delete
idle (clear blob, URL, UI)
```

**Preserve across tab switches (Together):**
```js
// On switch: save current person's voice
if (recordingBlob) {
  voicePerPerson[currentWho] = {blob, url, duration};
}

// On switch back: restore
const saved = voicePerPerson[currentWho];
if (saved) {
  recordingBlob = saved.blob;
  recordingURL = saved.url;
  recordDuration = saved.duration;
  showVoicePreview();
}
```

## 9. Quiz Turn Indicator (Together)

```js
function renderPicks() {
  const cDone = charliePick !== null;
  const kDone = karlaPick !== null;
  if (cDone && kDone) {
    picksEl.innerHTML = "";
  } else {
    const name = currentPicker === "charlie" ? "Charlie" : "Karla";
    picksEl.innerHTML = `<span class="quiz-turn-label">${name}'s turn</span>...`;
  }
}
```

## 10. Answer Reveal (Remote)

```js
function buildReveal(id, data) {
  const el = $(id);
  el.innerHTML = "";
  if (data.text) el.innerHTML += `<span>${data.text}</span>`;
  if (data.voiceURL) el.innerHTML += `<div class="je-voice-player">...${data.voiceURL}...</div>`;
}

if (cData && kData) {
  buildReveal("reveal-charlie", cData);
  buildReveal("reveal-karla", kData);
  reveal.classList.remove("hidden");
  creatureCelebrate();
  setTimeout(() => reveal.classList.add("hidden"), 8000);
}
```
