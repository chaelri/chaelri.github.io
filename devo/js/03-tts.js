// Microsoft Edge "Read Aloud" voice (en-US-AndrewNeural) via the gemini-proxy
// /edge-tts endpoint. Per-verse synthesis is ~100-300ms — roughly 10× faster
// than the previous Google Journey-D path, which is why we now synth the WHOLE
// chapter in parallel on Listen-tap instead of caching to IndexedDB.
const TTS_VOICE = { name: "en-US-BrianNeural" };
let _ttsReadyCount = 0;

// Concurrency: 10 in-flight synthesis calls. Each call opens a fresh WebSocket
// from Cloud Run to Microsoft's Edge endpoint. A 20-verse chapter drains in
// ~2 batches × ~250ms ≈ ~500ms, so users tap Listen and the whole chapter is
// ready before they finish reading the verse-1 intro on screen.
const _synthSem = { active: 0, max: 10, queue: [] };
function _synthAcquire() {
  if (_synthSem.active < _synthSem.max) { _synthSem.active++; return Promise.resolve(); }
  return new Promise(resolve => _synthSem.queue.push(resolve));
}
function _synthRelease() {
  _synthSem.active = Math.max(0, _synthSem.active - 1);
  if (_synthSem.queue.length && _synthSem.active < _synthSem.max) {
    _synthSem.active++;
    _synthSem.queue.shift()();
  }
}
function _synthReset() {
  _synthSem.active = 0;
  _synthSem.queue.length = 0; // abandon stale waiters, they'll be GC'd
}

// On-demand synthesis: synthesize a single item if not already done
function _ttsSynthItem(item, gen) {
  if (item.ready) return item.ready; // already in-flight or done
  item.ready = ttsSynthesize(item.ttsText || item.text).then(
    ({ url, timepoints, words }) => {
      item.url = url;
      item.timepoints = timepoints;
      item.words = words;
      _ttsReadyCount++;
      const bar = document.getElementById("ttsProgressBar");
      if (gen === ttsGen && bar) {
        const pct = `${(_ttsReadyCount / ttsQueue.length) * 100}%`;
        bar.style.width = pct;
        const immBar = document.getElementById("ttsImmLoadBar");
        if (immBar) immBar.style.width = pct;
        if (_ttsReadyCount === ttsQueue.length) {
          document.getElementById("ttsPlayer")?.classList.add("tts-ready");
        }
      }
    },
    () => { item.url = null; }
  );
  return item.ready;
}

// Fire synthesis for every queued verse at once. The 10-slot semaphore caps
// in-flight count, so this is safe even on a long chapter.
function _ttsSynthAll(gen) {
  for (const item of ttsQueue) _ttsSynthItem(item, gen);
}

function _escapeSSML(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function _textToSSML(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const body  = words.map((w, i) => `<mark name="w${i}"/>${_escapeSSML(w)}`).join(" ");
  return { ssml: `<speak>${body}</speak>`, words };
}

// ── Word-by-word highlight helpers ───────────────────────────────────────────
let _ttsWordRaf = null;
let _ttsActiveWordItem = null;

function _injectWordSpans(item) {
  if (!item.words?.length || !item.timepoints?.length) return;
  const el = item.el?.querySelector(".verse-content");
  if (!el) return;
  item._originalHTML = el.innerHTML;
  // Edge timings include any chapter-title prefix on v1; skip those tokens
  // so the rendered verse-content stays clean (no "Genesis 1" prepended).
  const prefix = item.prefixWordCount || 0;
  const visible = item.words.slice(prefix);
  el.innerHTML = visible.map((w, i) =>
    `<span class="tts-word" data-idx="${i}">${w}</span>`
  ).join(" ");
}

function _restoreVerseText(item) {
  if (!item || item._originalHTML === undefined) return;
  const el = item.el?.querySelector(".verse-content");
  if (el) el.innerHTML = item._originalHTML;
  delete item._originalHTML;
}

// Estimate per-word timings when the TTS provider doesn't give real ones.
// Each word's time share is proportional to its letter count (plus a small
// base), with extra weight for trailing punctuation so the highlight holds
// over a comma, colon, period, etc. — mimicking how a narrator would pause.
function _computeSyntheticTimepoints(words, duration) {
  if (!words?.length || !isFinite(duration) || duration <= 0) return [];

  // Extra "silence weight" to simulate pauses. Tuned empirically against
  // ~150–170 wpm narration — a comma reads as roughly a half-syllable pause,
  // a period closer to a full one.
  const punctWeight = (tail) => {
    if (!tail) return 0;
    if (/[.!?]["')\]]?$/.test(tail)) return 3.2;       // sentence end
    if (/[;:]$/.test(tail))            return 2.2;     // clause break
    if (/[,—–-]$/.test(tail))          return 1.5;     // mid-sentence pause
    return 0;
  };

  const weights = words.map((w) => {
    const letters = (w.match(/[A-Za-z0-9]/g) || []).length;
    const tail = (w.match(/[^A-Za-z0-9]+$/) || [""])[0];
    return Math.max(1, letters) + 1.4 + punctWeight(tail);
  });

  const total = weights.reduce((a, b) => a + b, 0);
  const leadIn = duration * 0.015;
  const usable = duration * 0.965;
  let acc = leadIn;
  return weights.map((w) => {
    const tp = { timeSeconds: acc };
    acc += (w / total) * usable;
    return tp;
  });
}

function _startWordHighlight(audio, item) {
  if (!item) return;
  const el = item.el?.querySelector(".verse-content");
  const immEl = document.getElementById("ttsImmCurText");
  if (!el && !immEl) return;

  const ensurePoints = () => {
    if (item.timepoints?.length) return true;
    if (!item.words?.length) return false;
    const dur = audio.duration;
    if (!isFinite(dur) || dur <= 0) return false;
    item.timepoints = _computeSyntheticTimepoints(item.words, dur);
    return item.timepoints.length > 0;
  };

  const beginTick = () => {
    const pts = item.timepoints;
    if (!pts?.length) return;
    const prefix = item.prefixWordCount || 0;
    // Canvas-mode word elements for the currently-playing verse. Cached once
    // per-verse so the RAF loop just toggles class on a known list. Empty
    // outside canvas mode.
    const cmWords = _ttsInCanvas
      ? [...document.querySelectorAll(`#cmPassage .cm-word[data-verse="${item.verseNum}"]`)]
      : [];
    function tick() {
      const t = audio.currentTime;
      let wi = -1;
      for (let i = 0; i < pts.length; i++) {
        if (pts[i].timeSeconds <= t) wi = i; else break;
      }
      // `wi` is the synth-side word index (may include a chapter-title prefix
      // that isn't rendered). Shift into display-word space for highlighting.
      const displayIdx = wi >= 0 ? wi - prefix : -1;
      if (el) {
        // .verse-content spans are rendered without the prefix words, so
        // index them by displayIdx (verse-relative), not wi (synth-side).
        el.querySelectorAll(".tts-word").forEach((s, i) =>
          s.classList.toggle("tts-word-active", i === displayIdx)
        );
      }
      if (immEl) {
        immEl.querySelectorAll(".tts-imm-word").forEach((s, i) =>
          s.classList.toggle("tts-imm-word-active", i === displayIdx)
        );
      }
      if (cmWords.length) {
        for (let i = 0; i < cmWords.length; i++) {
          cmWords[i].classList.toggle("cm-word-tts-active", i === displayIdx);
        }
      }
      if (!audio.paused && !audio.ended) _ttsWordRaf = requestAnimationFrame(tick);
    }
    _ttsWordRaf = requestAnimationFrame(tick);
  };

  if (ensurePoints()) {
    beginTick();
  } else {
    const onMeta = () => {
      audio.removeEventListener("loadedmetadata", onMeta);
      if (ensurePoints()) beginTick();
    };
    audio.addEventListener("loadedmetadata", onMeta);
  }
}

function _stopWordHighlight() {
  if (_ttsWordRaf) { cancelAnimationFrame(_ttsWordRaf); _ttsWordRaf = null; }
  // Clear any lingering canvas-mode underline so it doesn't stick on pause.
  document.querySelectorAll("#cmPassage .cm-word.cm-word-tts-active")
    .forEach(w => w.classList.remove("cm-word-tts-active"));
}

// Canvas-mode flag — when true, playChapterInCanvas() routes playback without
// the immersive overlay so the user keeps drawing/highlighting underneath.
let _ttsInCanvas = false;

// Auto-scroll: when on, the canvas viewport pins itself to the current verse
// as TTS advances. Toggleable via the lock icon in the canvas Listen bar so
// Charlie can disable it and scroll freely during playback. Persisted in
// localStorage; defaults to ON since most listen sessions want follow.
const _CM_TTS_FOLLOW_KEY = "devo.cmTtsAutoFollow";
let _cmTtsAutoFollow = localStorage.getItem(_CM_TTS_FOLLOW_KEY) !== "false";

function _cmTtsScrollToCurrent() {
  if (!_ttsInCanvas || !_cmTtsAutoFollow) return;
  const item = ttsQueue[ttsIdx];
  if (!item) return;
  const w = document.querySelector(`#cmPassage .cm-word[data-verse="${item.verseNum}"]`);
  const verseEl = w?.closest(".cm-verse");
  if (verseEl?.scrollIntoView) {
    verseEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

// Marching-ants pink dotted border around the currently-playing verse in
// canvas mode. Big "you are here" cue layered ON TOP of the per-word soft
// wash — one scans the verse, the other tracks the word.
function _cmMarkActiveVerse(verseNum) {
  if (!_ttsInCanvas) return;
  // Clear previous active marker. The class is what the "dim other verses"
  // CSS uses as the :not() target — no SVG/border injection anymore.
  document.querySelectorAll("#cmPassage .cm-verse.cm-verse-tts-active")
    .forEach(v => v.classList.remove("cm-verse-tts-active"));
  if (verseNum == null) return;
  const w = document.querySelector(`#cmPassage .cm-word[data-verse="${verseNum}"]`);
  const verseEl = w?.closest(".cm-verse");
  if (verseEl) verseEl.classList.add("cm-verse-tts-active");
}

// ── Media Session API + visibility hooks ───────────────────────────────────
// Without these, iOS Safari pauses audio the moment the screen locks. With
// them, the OS treats devo as a media app: lock-screen shows the current
// verse + ◀◀ ▶ ▶▶ controls, headphone buttons work, and audio keeps playing
// past chapter boundaries while the phone is asleep.
let _mediaSessionWired = false;
function _setupMediaSession() {
  if (!("mediaSession" in navigator) || _mediaSessionWired) return;
  _mediaSessionWired = true;
  try {
    navigator.mediaSession.setActionHandler("play",  () => { if (ttsPaused) pauseResumeTTS(); });
    navigator.mediaSession.setActionHandler("pause", () => { if (!ttsPaused) pauseResumeTTS(); });
    navigator.mediaSession.setActionHandler("previoustrack", () => ttsPrevVerse());
    navigator.mediaSession.setActionHandler("nexttrack",     () => ttsNextVerse());
  } catch {}
}

function _updateMediaSession(item) {
  if (!("mediaSession" in navigator) || !item) return;
  try {
    const bookName = BIBLE_META?.[bookEl?.value]?.name || "Devotion";
    const ch = chapterEl?.value || "";
    navigator.mediaSession.metadata = new MediaMetadata({
      title:  `${bookName} ${ch}:${item.verseNum}`,
      artist: "Devotion",
      album:  `${bookName} ${ch}`,
    });
    navigator.mediaSession.playbackState = ttsPaused ? "paused" : "playing";
  } catch {}
}

// When the user opens the phone again (or switches tabs back), snap the
// canvas viewport to the verse currently being read — auto-scroll during
// `visibilitychange:hidden` is a no-op in most browsers, so we replay it
// once visibility returns.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  if (_ttsInCanvas && _cmTtsAutoFollow) {
    setTimeout(_cmTtsScrollToCurrent, 100);
  }
});

function cmTtsToggleAutoFollow() {
  _cmTtsAutoFollow = !_cmTtsAutoFollow;
  try { localStorage.setItem(_CM_TTS_FOLLOW_KEY, String(_cmTtsAutoFollow)); } catch {}
  // Body class drives the "dim inactive verses" CSS — only applied while
  // follow is locked, so unlocked free-scroll keeps full opacity everywhere.
  document.body.classList.toggle("tts-canvas-follow", _cmTtsAutoFollow && _ttsInCanvas);
  _cmListenBarUpdate();
  if (_cmTtsAutoFollow) _cmTtsScrollToCurrent();
}

// Sync the canvas Listen mini-player to the current TTS state. No-op when the
// bar isn't rendered (i.e. canvas overlay isn't open).
function _cmListenBarUpdate() {
  if (!document.getElementById("cmListenBar")) return;
  const verseLabel = document.getElementById("cmListenVerse");
  const pauseBtn   = document.getElementById("cmListenPauseBtn");
  const prevBtn    = document.getElementById("cmListenPrevBtn");
  const nextBtn    = document.getElementById("cmListenNextBtn");
  if (verseLabel) {
    if (ttsQueue.length && ttsIdx >= 0) {
      const cur = ttsQueue[ttsIdx]?.verseNum ?? "";
      verseLabel.innerHTML =
        `<span class="cm-listen-verse-cur">${cur}</span>` +
        `<span class="cm-listen-verse-sep">/</span>` +
        `<span class="cm-listen-verse-total">${ttsQueue.length}</span>`;
    } else {
      verseLabel.textContent = "";
    }
  }
  if (pauseBtn) {
    pauseBtn.innerHTML =
      `<span class="material-symbols-outlined">${ttsPaused ? "play_arrow" : "pause"}</span>`;
  }
  if (prevBtn) prevBtn.disabled = ttsIdx <= 0;
  if (nextBtn) nextBtn.disabled = ttsIdx >= ttsQueue.length - 1;
  const followBtn = document.getElementById("cmListenFollowBtn");
  if (followBtn) {
    followBtn.classList.toggle("active", _cmTtsAutoFollow);
    followBtn.innerHTML =
      `<span class="material-symbols-outlined">${_cmTtsAutoFollow ? "lock" : "lock_open"}</span>`;
    followBtn.title = _cmTtsAutoFollow
      ? "Auto-scroll on — tap to scroll freely"
      : "Auto-scroll off — tap to follow current verse";
  }
}

function _edgeToClientShape(blob, timings) {
  // Real WordBoundary timings from msedge-tts. `words` is Edge's tokenization
  // of the FULL ttsText (so for v1 it includes the chapter-title prefix
  // words). Caller's prefixWordCount tells the highlight loop how many
  // leading words to skip when rendering spans into .verse-content.
  const edgeWords = timings.map(t => t.word);
  const timepoints = timings.map(t => ({ timeSeconds: t.start }));
  return { url: URL.createObjectURL(blob), timepoints, words: edgeWords };
}

async function ttsSynthesize(text, retries = 5) {
  const cacheKey = `${TTS_VOICE.name}|${text}`;

  // Cache hit — instant return, no API call, no semaphore.
  // Wrapped in try/catch because IDB plumbing can throw if the schema is
  // mid-upgrade or the store is unexpectedly missing — fall through to the
  // network path rather than killing the whole synth pipeline.
  let cached = null;
  try { cached = await _getTtsAudio(cacheKey); } catch {}
  if (cached?.blob) return _edgeToClientShape(cached.blob, cached.timings || []);

  await _synthAcquire();
  try {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const resp = await fetch(`${GEMINI_PROXY}/edge-tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: TTS_VOICE.name }),
        });

        if (resp.status === 429) throw new Error("rate-limit");
        if (!resp.ok) throw new Error(`api-${resp.status}`);

        const { audioBase64, timings } = await resp.json();
        const bytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: "audio/mpeg" });
        // Fire-and-forget IDB save; survives reload + offline replay for 3 days.
        _saveTtsAudio(cacheKey, blob, timings);
        return _edgeToClientShape(blob, timings);
      } catch (err) {
        if (attempt < retries - 1) {
          const base = err.message === "rate-limit" ? 2000 : 600;
          const delay = Math.min(base * Math.pow(1.8, attempt), 12000) + Math.random() * 800;
          await new Promise(r => setTimeout(r, delay));
        } else {
          throw err;
        }
      }
    }
  } finally {
    _synthRelease();
  }
}

// Fire-and-forget background prefetch for the current chapter. Called from
// loadPassage so audio is cached by the time the user thinks to tap Listen
// (or at the latest, by the time they finish reading the verse on screen).
// Idempotent on revisits — every miss hits the proxy, every hit is instant
// IDB read. Even if the user spam-flips through 10 chapters, this just
// queues ~300 calls behind the 10-slot semaphore and they drain in the
// background.
function _ttsPrefetchChapter() {
  if (!window.__aiPayload?.versesText) return;
  const bookName = BIBLE_META?.[bookEl?.value]?.name || "";
  const ch = chapterEl?.value || "";
  const prefix = (bookName && ch) ? `${bookName} ${ch}.` : "";

  const lines = window.__aiPayload.versesText.split("\n").filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    // Strip the leading verse-number prefix that __aiPayload uses internally
    // (e.g. "1. In the beginning..." → "In the beginning...").
    const text = lines[i].replace(/^\d[\d\-]*\.\s*/, "").trim();
    if (!text) continue;
    const speak = (i === 0 && prefix) ? `${prefix} ${text}` : text;
    // Cache check is inside ttsSynthesize, so already-cached chapters are a
    // no-op pair of IDB reads (one per verse).
    ttsSynthesize(speak).catch(() => {});
  }
}

// No API key needed — the proxy handles Microsoft's endpoint server-side.
function ttsGetOrPromptKey() {
  return true;
}

// ── Playback state ───────────────────────────────────────────────────────────
let ttsGen = 0;
let ttsQueue = [];   // [{el, verseNum, text, url, ready}]
let ttsIdx = -1;
let ttsAudio = null;
let ttsPaused = false;

// ── AI loading state ──
let _contextLoading = false;
let _reflectionLoading = false;
let _ttsFinished = false;

// ── Immersive mode state (declared here so stopTTS can reference before the immersive block) ──
let _immDoubleTapCount = 0;
let _immDoubleTapTimer = null;
let _immReflIndex = 0;
let _immAutoReflTimer = null;
let _immVerseUpdateTimer = null;

function ttsBuildQueue() {
  const els = [...document.querySelectorAll("#output .verse")];
  const lines = (window.__aiPayload?.versesText || "").split("\n").filter(Boolean);
  return els.map((el, i) => ({
    el,
    verseNum: el.querySelector(".verse-num")?.textContent?.trim() || String(i + 1),
    text: (lines[i] || "").replace(/^\d[\d\-]*\.\s*/, "").trim(),
    url: null,
    ready: null,
  }));
}

async function playChapter() {
  if (!ttsGetOrPromptKey()) return;

  ttsGen++;
  const gen = ttsGen;
  _ttsFinished = false;

  const pauseBtn = document.getElementById("ttsPauseBtn");
  if (pauseBtn) pauseBtn.innerHTML = '<span class="material-symbols-outlined">pause</span>';

  ttsQueue = ttsBuildQueue();

  // Prepend chapter title to first verse's SPOKEN text only (display text stays clean)
  const _ttsBookName = BIBLE_META[bookEl?.value]?.name || "";
  const _ttsCh = chapterEl?.value || "";
  if (_ttsBookName && _ttsCh && ttsQueue.length > 0) {
    const prefix = `${_ttsBookName} ${_ttsCh}.`;
    ttsQueue[0].ttsText = `${prefix} ${ttsQueue[0].text}`;
    ttsQueue[0].prefixWordCount = prefix.split(/\s+/).filter(Boolean).length;
  }

  ttsIdx = -1;
  if (!ttsQueue.length) return;

  const playBtn = document.getElementById("ttsPlayBtn");
  if (playBtn) playBtn.disabled = true;
  document.getElementById("output")?.classList.add("tts-mode");

  _ttsReadyCount = 0;
  const bar = document.getElementById("ttsProgressBar");
  if (bar) bar.style.width = "0%";

  // Fire synthesis for every verse in parallel — 10-slot semaphore caps
  // in-flight count, so the whole chapter is ready in ~500ms-2s.
  _ttsSynthAll(gen);

  // Set verse range indicator in immersive top bar
  const rangeEl = document.getElementById("ttsImmRange");
  if (rangeEl && ttsQueue.length > 0) {
    const first = ttsQueue[0].verseNum;
    const last  = ttsQueue[ttsQueue.length - 1].verseNum;
    rangeEl.textContent = ttsQueue.length === 1
      ? `Verse ${first}`
      : `Verses ${first}–${last}`;
  }

  // Lock-screen controls + metadata so iOS doesn't kill audio on screen lock.
  _setupMediaSession();

  // Show context intro screen — user taps "Start Reading" to begin playback
  ttsImmContextOpen(gen);
}

// Canvas-mode equivalent of playChapter: same queue + synth pipeline, but
// skips the immersive overlay and starts playback directly so the canvas
// (with all its highlights and notes) stays visible. `startVerse` is the
// optional verse-number string to begin at; defaults to verse 1.
async function playChapterInCanvas(startVerse) {
  if (!ttsGetOrPromptKey()) return;

  ttsGen++;
  const gen = ttsGen;
  _ttsFinished = false;
  _ttsInCanvas = true;

  ttsQueue = ttsBuildQueue();

  const _ttsBookName = BIBLE_META[bookEl?.value]?.name || "";
  const _ttsCh = chapterEl?.value || "";
  if (_ttsBookName && _ttsCh && ttsQueue.length > 0) {
    const prefix = `${_ttsBookName} ${_ttsCh}.`;
    ttsQueue[0].ttsText = `${prefix} ${ttsQueue[0].text}`;
    ttsQueue[0].prefixWordCount = prefix.split(/\s+/).filter(Boolean).length;
  }

  if (!ttsQueue.length) { _ttsInCanvas = false; return; }

  document.body.classList.add("tts-canvas-active");
  if (_cmTtsAutoFollow) document.body.classList.add("tts-canvas-follow");
  document.getElementById("cmListenBtn")?.classList.add("active");

  _setupMediaSession();
  _ttsReadyCount = 0;
  _ttsSynthAll(gen);

  let startIdx = 0;
  if (startVerse != null) {
    const want = String(startVerse);
    const idx = ttsQueue.findIndex(it => it.verseNum === want);
    if (idx >= 0) startIdx = idx;
  }
  ttsIdx = -1;
  ttsPlayAt(startIdx, gen);
}

// Jump TTS to a specific verse number. Returns true if a jump happened.
// Used by the canvas verse-number tap; safe to call when no TTS is active.
function ttsJumpToVerse(verseNum) {
  if (!ttsQueue?.length) return false;
  const want = String(verseNum);
  const idx = ttsQueue.findIndex(it => it.verseNum === want);
  if (idx < 0) return false;
  ttsGen++;
  if (ttsAudio) { ttsAudio.onended = null; ttsAudio.pause(); ttsAudio = null; }
  ttsPlayAt(idx, ttsGen);
  return true;
}

let _ttsPlaySeq = 0; // debounce sequence for rapid next/prev

async function ttsPlayAt(index, gen) {
  if (gen !== ttsGen) return;
  if (index < 0 || index >= ttsQueue.length) {
    if (gen === ttsGen) ttsFinish();
    return;
  }

  // Debounce rapid navigation — only the latest call wins
  const seq = ++_ttsPlaySeq;
  await new Promise(r => setTimeout(r, 150));
  if (seq !== _ttsPlaySeq || gen !== ttsGen) return;

  // Hide pause panel when verse changes
  const _pp = document.getElementById("ttsImmPausePanel");
  if (_pp) _pp.hidden = true;

  ttsIdx = index;
  const item = ttsQueue[index];

  if (ttsAudio) { ttsAudio.onended = null; ttsAudio.pause(); ttsAudio = null; }

  // Reset pause btn in case it was repurposed as a retry button
  const pauseBtn = document.getElementById("ttsPauseBtn");
  if (pauseBtn) { pauseBtn.innerHTML = '<span class="material-symbols-outlined">pause</span>'; pauseBtn.onclick = pauseResumeTTS; }

  // Ensure tts-mode is on #output regardless of how ttsPlayAt was reached
  // (e.g. navigating back during the continue prompt removes tts-mode via ttsFinish)
  document.getElementById("output")?.classList.add("tts-mode");
  ttsMark(item.el);
  ttsImmersiveUpdate(index);
  const immPauseBtn = document.getElementById("ttsImmPauseBtn");
  const immLoadBar = document.getElementById("ttsImmLoadBar");
  if (!item.url) {
    ttsSetStatus(`Preparing verse ${item.verseNum}\u2026`);
    if (immPauseBtn) immPauseBtn.classList.add("tts-imm-btn-loading");
    if (immLoadBar) immLoadBar.classList.add("buffering");
  } else {
    ttsSetStatus(`${ttsIcon("graphic_eq")} ${item.verseNum} / ${ttsQueue.length}`);
  }
  document.getElementById("ttsPlayer")?.classList.add("tts-buffering");

  // Idempotent — every verse was already fired in playChapter; this just
  // covers edge cases like manual ttsPlayAt jumps from outside playChapter.
  _ttsSynthItem(item, gen);

  try {
    await _ttsSynthItem(item, gen); // instant if already done, else wait
    if (gen !== ttsGen) return;
    if (!item.url) throw new Error("synthesis failed");

    document.getElementById("ttsPlayer")?.classList.remove("tts-buffering");
    if (immPauseBtn) immPauseBtn.classList.remove("tts-imm-btn-loading");
    if (immLoadBar) immLoadBar.classList.remove("buffering");

    // Restore previous verse text, inject word spans for this verse
    _stopWordHighlight();
    _restoreVerseText(_ttsActiveWordItem);
    _injectWordSpans(item);
    _ttsActiveWordItem = item;

    ttsAudio = new Audio(item.url);
    ttsPaused = false;
    await ttsAudio.play();
    if (gen !== ttsGen) { ttsAudio.pause(); return; }

    _startWordHighlight(ttsAudio, item);
    ttsSetStatus(`${ttsIcon("graphic_eq")} ${item.verseNum} / ${ttsQueue.length}`);
    ttsNavUpdate();
    _cmListenBarUpdate();
    _cmTtsScrollToCurrent();
    _cmMarkActiveVerse(item.verseNum);
    _updateMediaSession(item);

    ttsAudio.onended = () => {
      if (!ttsPaused && gen === ttsGen) ttsPlayAt(index + 1, gen);
    };
  } catch (err) {
    if (gen !== ttsGen) return;
    console.error("TTS", err);
    _stopWordHighlight();
    if (immPauseBtn) immPauseBtn.classList.remove("tts-imm-btn-loading");
    if (immLoadBar) immLoadBar.classList.remove("buffering");
    document.getElementById("ttsPlayer")?.classList.remove("tts-buffering");
    ttsSetStatus(`${ttsIcon("warning")} Verse ${item.verseNum} failed`);

    // Repurpose pause button as a single-verse retry
    const pauseBtn = document.getElementById("ttsPauseBtn");
    const immPauseBtn2 = document.getElementById("ttsImmPauseBtn");
    const retryIcon = '<span class="material-symbols-outlined">refresh</span>';
    const retryHandler = () => {
      if (pauseBtn) { pauseBtn.innerHTML = '<span class="material-symbols-outlined">pause</span>'; pauseBtn.onclick = pauseResumeTTS; }
      if (immPauseBtn2) { immPauseBtn2.innerHTML = '<span class="material-symbols-outlined">pause</span>'; immPauseBtn2.onclick = pauseResumeTTS; }
      item.url = null;
      item.ready = ttsSynthesize(item.text).then(
        ({ url, timepoints, words }) => { item.url = url; item.timepoints = timepoints; item.words = words; },
        () => { item.url = null; }
      );
      ttsPlayAt(index, gen);
    };
    if (pauseBtn) { pauseBtn.innerHTML = retryIcon; pauseBtn.onclick = retryHandler; }
    if (immPauseBtn2) { immPauseBtn2.innerHTML = retryIcon; immPauseBtn2.onclick = retryHandler; }
  }
}

function ttsMark(el) {
  document.querySelectorAll("#output .verse.tts-active").forEach(v => v.classList.remove("tts-active"));
  document.querySelectorAll("#output .verse-header.verse-highlight").forEach(v => v.classList.remove("verse-highlight"));
  if (!el) return;
  el.classList.add("tts-active");
  const hdr = el.querySelector(".verse-header");
  if (hdr) { void hdr.offsetWidth; hdr.classList.add("verse-highlight"); }
  const layout = document.querySelector(".layout");
  if (layout) {
    layout.scrollTo({
      top: el.getBoundingClientRect().top - layout.getBoundingClientRect().top + layout.scrollTop - 120,
      behavior: "smooth",
    });
  }
}

function pauseResumeTTS() {
  if (!ttsAudio) return;
  const btn = document.getElementById("ttsPauseBtn");
  const immBtn = document.getElementById("ttsImmPauseBtn");
  const pausePanel = document.getElementById("ttsImmPausePanel");
  if (ttsPaused) {
    ttsAudio.play(); ttsPaused = false;
    if (btn) btn.innerHTML = '<span class="material-symbols-outlined">pause</span>';
    if (immBtn) immBtn.innerHTML = '<span class="material-symbols-outlined">pause</span>';
    ttsSetStatus(`${ttsIcon("graphic_eq")} ${ttsQueue[ttsIdx]?.verseNum} / ${ttsQueue.length}`);
    _startWordHighlight(ttsAudio, _ttsActiveWordItem);
    if (pausePanel) pausePanel.hidden = true;
  } else {
    ttsAudio.pause(); ttsPaused = true;
    _stopWordHighlight();
    if (btn) btn.innerHTML = '<span class="material-symbols-outlined">play_arrow</span>';
    if (immBtn) immBtn.innerHTML = '<span class="material-symbols-outlined">play_arrow</span>';
    ttsSetStatus(`${ttsIcon("pause")} Verse ${ttsQueue[ttsIdx]?.verseNum}`);
    // Pause panel covers the canvas, so skip it when listening in canvas mode.
    if (!_ttsInCanvas) _ttsImmShowPausePanel();
  }
  _cmListenBarUpdate();
  // Sync the lock-screen play/pause icon with the new state.
  if ("mediaSession" in navigator) {
    try { navigator.mediaSession.playbackState = ttsPaused ? "paused" : "playing"; } catch {}
  }
}

function _ttsImmShowPausePanel() {
  const panel = document.getElementById("ttsImmPausePanel");
  const content = document.getElementById("ttsImmPauseContent");
  if (!panel || !content) return;

  const item = ttsQueue[ttsIdx];
  if (!item) return;

  const bookKey = bookEl.value;
  const ch = chapterEl.value;
  const verseNum = item.verseNum;
  const key = keyOf(bookKey, ch, verseNum);
  const bookName = BIBLE_META[bookKey]?.name || "";
  const verseText = item.text;

  content.innerHTML = "";
  panel.hidden = false;

  const noteBtn = document.getElementById("ttsImmPauseNote");
  const ctxBtn = document.getElementById("ttsImmPauseContext");
  const askBtn = document.getElementById("ttsImmPauseAsk");

  [noteBtn, ctxBtn, askBtn].forEach(b => b?.classList.remove("active"));

  const toggleAction = (btn, renderFn) => {
    const wasActive = btn.classList.contains("active");
    [noteBtn, ctxBtn, askBtn].forEach(b => b?.classList.remove("active"));
    content.innerHTML = "";
    if (!wasActive) {
      btn.classList.add("active");
      renderFn();
    }
  };

  if (noteBtn) noteBtn.onclick = () => toggleAction(noteBtn, () => {
    const notesDiv = document.createElement("div");
    notesDiv.className = "tts-imm-pause-notes";
    content.appendChild(notesDiv);
    renderComments(key, notesDiv);
  });

  if (ctxBtn) ctxBtn.onclick = () => toggleAction(ctxBtn, () => {
    fetchInlineQuickContext({ book: bookName, chapter: ch, verse: verseNum, text: verseText }, content);
  });

  if (askBtn) askBtn.onclick = () => toggleAction(askBtn, () => {
    toggleVerseChat(key, bookName, ch, verseNum, verseText, content);
  });
}

function ttsPrevVerse() {
  if (ttsIdx <= 0) return;
  ttsGen++;
  if (ttsAudio) { ttsAudio.onended = null; ttsAudio.pause(); ttsAudio = null; }
  ttsPlayAt(ttsIdx - 1, ttsGen);
}

function ttsNextVerse() {
  if (ttsIdx >= ttsQueue.length - 1) return;
  ttsGen++;
  if (ttsAudio) { ttsAudio.onended = null; ttsAudio.pause(); ttsAudio = null; }
  ttsPlayAt(ttsIdx + 1, ttsGen);
}

function _ttsCleanupMode() {
  _stopWordHighlight();
  _restoreVerseText(_ttsActiveWordItem);
  _ttsActiveWordItem = null;
  document.getElementById("output")?.classList.remove("tts-mode");
  _ttsInCanvas = false;
  document.body.classList.remove("tts-canvas-active", "tts-canvas-follow");
  document.getElementById("cmListenBtn")?.classList.remove("active");
  // Drop the active-verse class so the dim effect releases.
  document.querySelectorAll("#cmPassage .cm-verse.cm-verse-tts-active")
    .forEach(v => v.classList.remove("cm-verse-tts-active"));
  // Drop the lock-screen media session card when playback ends.
  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
    } catch {}
  }
}

function stopTTS() {
  _ttsFinished = false;
  ttsGen++;
  _synthReset();
  _ttsCleanupMode();
  if (ttsAudio) { ttsAudio.onended = null; ttsAudio.pause(); ttsAudio = null; }
  ttsQueue = []; ttsIdx = -1; ttsPaused = false;
  document.querySelectorAll("#output .verse.tts-active").forEach(v => v.classList.remove("tts-active"));
  document.querySelectorAll("#output .verse-header.verse-highlight").forEach(v => v.classList.remove("verse-highlight"));
  const player = document.getElementById("ttsPlayer");
  player.classList.remove("tts-buffering", "tts-ready");
  const bar = document.getElementById("ttsProgressBar");
  if (bar) bar.style.width = "0%";
  player.hidden = true;
  ttsImmersiveClose();
  const playBtn = document.getElementById("ttsPlayBtn");
  if (playBtn) playBtn.disabled = false;
}

function ttsFinish() {
  _ttsFinished = true;
  // Capture the canvas flag before cleanup wipes it — controls whether we
  // open the immersive continue-prompt or just stop quietly.
  const wasCanvas = _ttsInCanvas;
  _ttsCleanupMode();
  if (ttsAudio) { ttsAudio.pause(); ttsAudio = null; }
  ttsPaused = false;
  document.querySelectorAll("#output .verse.tts-active").forEach(v => v.classList.remove("tts-active"));
  document.querySelectorAll("#output .verse-header.verse-highlight").forEach(v => v.classList.remove("verse-highlight"));
  const player = document.getElementById("ttsPlayer");
  player.classList.remove("tts-buffering", "tts-ready");
  const bar = document.getElementById("ttsProgressBar");
  if (bar) bar.style.width = "0%";
  // Canvas mode: just stop. The immersive continue-prompt would cover the
  // canvas, defeating the point of in-place playback.
  if (wasCanvas) {
    ttsQueue = []; ttsIdx = -1;
    return;
  }
  ttsShowContinuePrompt();
}

function ttsShowContinuePrompt() {
  const bookKeys = Object.keys(BIBLE_META);
  let bookIdx = bookKeys.indexOf(bookEl.value);
  let ch = parseInt(chapterEl.value);
  const totalCh = BIBLE_META[bookEl.value].chapters.length;

  let nextBook, nextCh, nextName;
  if (ch < totalCh) {
    nextBook = bookEl.value; nextCh = ch + 1;
  } else if (bookIdx < bookKeys.length - 1) {
    nextBook = bookKeys[bookIdx + 1]; nextCh = 1;
  } else {
    stopTTS(); return; // end of Bible
  }
  nextName = `${BIBLE_META[nextBook].name} ${nextCh}`;

  _immCancelAutoRefl();

  // Update stage to show "complete" state
  const immCurNum  = document.getElementById("ttsImmCurNum");
  const immCurText = document.getElementById("ttsImmCurText");
  if (immCurNum)  immCurNum.textContent  = "";
  if (immCurText) immCurText.textContent = "Chapter complete ✓";
  const immPrevNum  = document.getElementById("ttsImmPrevNum");
  const immPrevText = document.getElementById("ttsImmPrevText");
  if (immPrevNum)  immPrevNum.textContent  = "";
  if (immPrevText) immPrevText.textContent = "";
  const immNextNum  = document.getElementById("ttsImmNextNum");
  const immNextText = document.getElementById("ttsImmNextText");
  if (immNextNum)  immNextNum.textContent  = "";
  if (immNextText) immNextText.textContent = "";

  // Disable pause/next — chapter is done. Keep prev enabled so user can replay any verse.
  const immPauseBtn = document.getElementById("ttsImmPauseBtn");
  if (immPauseBtn) { immPauseBtn.innerHTML = '<span class="material-symbols-outlined">pause</span>'; immPauseBtn.disabled = true; }
  const immNextBtn = document.getElementById("ttsImmNextBtn");
  if (immNextBtn) immNextBtn.disabled = true;
  const immPrevBtn = document.getElementById("ttsImmPrevBtn");
  if (immPrevBtn) {
    immPrevBtn.disabled = false;
    immPrevBtn.onclick = () => {
      // Clear end state and resume normal navigation
      panel.hidden = true;
      const pauseActionsRow = document.querySelector(".tts-imm-pause-actions");
      if (pauseActionsRow) pauseActionsRow.hidden = false;
      if (immPauseBtn) immPauseBtn.disabled = false;
      if (immNextBtn) immNextBtn.disabled = false;
      _ttsFinished = false;
      immPrevBtn.onclick = ttsPrevVerse;
      ttsPrevVerse();
    };
  }

  // Keep reflect btn hidden — surfaced in the panel below
  const reflectBtn = document.getElementById("ttsImmReflectBtn");
  if (reflectBtn) reflectBtn.hidden = true;

  // Show choice panel
  const panel = document.getElementById("ttsImmPausePanel");
  const content = document.getElementById("ttsImmPauseContent");
  if (!panel || !content) return;

  const reflReady = !_reflectionLoading && document.querySelectorAll('#aiReflection textarea[id^="reflection-"]').length > 0;

  content.innerHTML = `
    <div class="tts-imm-end-choices">
      <button class="tts-imm-end-btn tts-imm-end-continue" id="ttsEndContinueBtn">
        <span class="material-symbols-outlined">play_arrow</span>
        <div><strong>${nextName}</strong><span>Continue reading</span></div>
      </button>
      ${reflReady ? `<button class="tts-imm-end-btn tts-imm-end-reflect" id="ttsEndReflectBtn">
        <span class="material-icons">volunteer_activism</span>
        <div><strong>Guided Reflection</strong><span>Reflect on this chapter</span></div>
      </button>` : ''}
    </div>
  `;

  // Disable the action row buttons since this isn't a "paused" state
  const noteBtn = document.getElementById("ttsImmPauseNote");
  const ctxBtn  = document.getElementById("ttsImmPauseContext");
  const askBtn  = document.getElementById("ttsImmPauseAsk");
  const pauseActionsRow = document.querySelector(".tts-imm-pause-actions");
  if (pauseActionsRow) pauseActionsRow.hidden = true;

  panel.hidden = false;

  const continueHandler = async () => {
    panel.hidden = true;
    const pauseActionsRow = document.querySelector(".tts-imm-pause-actions");
    if (pauseActionsRow) pauseActionsRow.hidden = false;
    if (immPauseBtn) immPauseBtn.disabled = false;
    if (immPrevBtn) immPrevBtn.disabled = false;
    if (immNextBtn) immNextBtn.disabled = false;
    if (nextBook !== bookEl.value) { bookEl.value = nextBook; loadChapters(); }
    chapterEl.value = nextCh;
    verseEl.value = "";
    document.getElementById("output").innerHTML = "";
    stopTTS();
    resetAISections();
    document.getElementById("prevChapterBtn").classList.remove("hidden");
    document.getElementById("nextChapterBtn").classList.remove("hidden");
    document.getElementById("ttsPlayBtn").classList.remove("hidden");
    document.getElementById("notesToggleBtn").classList.remove("hidden");
    document.getElementById("canvasModeBtn")?.classList.remove("hidden");
    await loadPassage();
    runAIForCurrentPassage();
    playChapter();
  };

  document.getElementById("ttsEndContinueBtn")?.addEventListener("click", continueHandler);
  document.getElementById("ttsEndReflectBtn")?.addEventListener("click", () => {
    ttsImmReflectionOpen();
  });
}

function _immCancelAutoRefl() {
  if (_immAutoReflTimer) { clearTimeout(_immAutoReflTimer); _immAutoReflTimer = null; }
  _immHideAutoReflBar();
}

function _immHideAutoReflBar() {
  const bar = document.getElementById("ttsImmAutoReflBar");
  if (bar) bar.hidden = true;
}

function ttsShowPlayer(_status) {
  // Old pill stays hidden — immersive overlay is used instead
  ttsImmersiveOpen();
}

function ttsIcon(name) {
  return `<span class="material-symbols-outlined tts-status-icon">${name}</span>`;
}
function ttsSetStatus(html) {
  const el = document.getElementById("ttsStatus");
  if (el) el.innerHTML = html;
}

function ttsNavUpdate() {
  const prev = document.getElementById("ttsPrevBtn");
  const next = document.getElementById("ttsNextBtn");
  if (prev) prev.disabled = ttsIdx <= 0;
  if (next) next.disabled = ttsIdx >= ttsQueue.length - 1;
}


/* migrate old notes */
Object.keys(comments).forEach((k) => {
  comments[k] = comments[k].map((n) =>
    typeof n === "string" ? { text: n, time: Date.now() } : n,
  );
});

saveComments();

