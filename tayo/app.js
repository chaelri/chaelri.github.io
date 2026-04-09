// ═══════════════════════════════════════
//  Tayo — Charlie & Karla
// ═══════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getDatabase, ref, set, get, update, onValue, onDisconnect, serverTimestamp, remove } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyB8ahT56WbEUaGAymsRNNA-DrfZnUnWIwk",
  authDomain: "test-database-55379.firebaseapp.com",
  databaseURL: "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "test-database-55379",
  storageBucket: "test-database-55379.firebasestorage.app",
  messagingSenderId: "933688602756",
  appId: "1:933688602756:web:392a3a4ce040cb9d4452d1",
};
const fbApp = initializeApp(firebaseConfig);
const db = getDatabase(fbApp);
const auth = getAuth(fbApp);
const ALLOWED_EMAILS = ["charliecayno@gmail.com", "kasromantico@gmail.com"];

const GEMINI_PROXY = "https://gemini-proxy-668755364170.asia-southeast1.run.app";
const WEDDING_DATE = new Date("2026-07-02T00:00:00+08:00");
const HISTORY_KEY = "tayo_history";
const SCORES_KEY = "tayo_scores";

// ── Elements ──
const $ = (s) => document.getElementById(s);
const creatureBody = $("creature-body");
const creatureGlow = $("creature-glow");
const bubble = $("bubble-container");
const bubbleText = $("bubble-text");
const vibeChips = $("vibe-chips");
const vibeInput = $("vibe-input");
const countdownEl = $("countdown");

// ── State ──
let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
let scores = JSON.parse(localStorage.getItem(SCORES_KEY) || '{"charlie":0,"karla":0}');
let conversationContext = [];
let currentVibe = "anything";
let isGenerating = false;
let quizDismissTimer = null;
let currentMode = "question";

// ═══════════════════════════════════════
//  SOUND FX (Web Audio API)
// ═══════════════════════════════════════
let audioCtx = null;
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

// Pre-warm audio context on first touch anywhere
document.addEventListener("touchstart", () => getAudio(), { once: true });
document.addEventListener("click", () => getAudio(), { once: true });

function playOink() {
  const ctx = getAudio();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(600 + Math.random() * 200, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(250, ctx.currentTime + 0.15);
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.2);
}

function playThinkOink() {
  const ctx = getAudio();
  let t = ctx.currentTime;

  const patterns = [
    // Curious "hmm?" — rising then settling
    [
      { freq: 350, end: 420, dur: 0.22, vol: 0.09 },
      { freq: 420, end: 380, dur: 0.25, vol: 0.07 },
      { freq: 360, end: 400, dur: 0.18, vol: 0.06 },
    ],
    // Pondering "hmmm..." — slow low hum
    [
      { freq: 280, end: 310, dur: 0.3, vol: 0.08 },
      { freq: 310, end: 290, dur: 0.35, vol: 0.07 },
    ],
    // Quick double "oink oink" thinking
    [
      { freq: 400, end: 320, dur: 0.15, vol: 0.09 },
      { freq: 380, end: 300, dur: 0.15, vol: 0.08 },
      { freq: 350, end: 420, dur: 0.2, vol: 0.07 },
      { freq: 420, end: 360, dur: 0.18, vol: 0.06 },
    ],
    // Confused "huh?" — up-down-up
    [
      { freq: 320, end: 450, dur: 0.18, vol: 0.08 },
      { freq: 450, end: 300, dur: 0.22, vol: 0.07 },
      { freq: 300, end: 400, dur: 0.15, vol: 0.06 },
    ],
    // Gentle mumble — soft warble
    [
      { freq: 300, end: 330, dur: 0.2, vol: 0.07 },
      { freq: 330, end: 310, dur: 0.18, vol: 0.06 },
      { freq: 310, end: 350, dur: 0.22, vol: 0.07 },
      { freq: 350, end: 300, dur: 0.2, vol: 0.05 },
    ],
  ];

  const pattern = patterns[Math.floor(Math.random() * patterns.length)];

  pattern.forEach((n) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(n.freq, t);
    osc.frequency.linearRampToValueAtTime(n.end, t + n.dur * 0.6);
    osc.frequency.linearRampToValueAtTime(n.freq, t + n.dur);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(n.vol, t + 0.03);
    gain.gain.setValueAtTime(n.vol, t + n.dur * 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, t + n.dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t); osc.stop(t + n.dur);
    t += n.dur + 0.08;
  });
}

function playTap() {
  const ctx = getAudio();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(800, ctx.currentTime);
  gain.gain.setValueAtTime(0.06, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.06);
}

function playCelebrate() {
  const ctx = getAudio();
  // Chime
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t = ctx.currentTime + i * 0.1;
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.3);
  });
  // Happy oink on top — excited rising squeal
  const t = ctx.currentTime + 0.15;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(350, t);
  osc.frequency.linearRampToValueAtTime(550, t + 0.12);
  osc.frequency.linearRampToValueAtTime(480, t + 0.2);
  gain.gain.setValueAtTime(0.001, t);
  gain.gain.linearRampToValueAtTime(0.1, t + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.22);
  // Second happy oink
  const t2 = t + 0.25;
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(380, t2);
  osc2.frequency.linearRampToValueAtTime(600, t2 + 0.1);
  osc2.frequency.linearRampToValueAtTime(500, t2 + 0.18);
  gain2.gain.setValueAtTime(0.001, t2);
  gain2.gain.linearRampToValueAtTime(0.09, t2 + 0.03);
  gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.2);
  osc2.connect(gain2).connect(ctx.destination);
  osc2.start(t2); osc2.stop(t2 + 0.2);
}

function playSadSound() {
  const ctx = getAudio();
  // Sad descending tones
  const notes = [440, 370, 311];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t = ctx.currentTime + i * 0.15;
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.25);
  });
  // Sad droopy oink — falling pitch
  const t = ctx.currentTime + 0.1;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(400, t);
  osc.frequency.linearRampToValueAtTime(250, t + 0.3);
  osc.frequency.linearRampToValueAtTime(200, t + 0.45);
  gain.gain.setValueAtTime(0.001, t);
  gain.gain.linearRampToValueAtTime(0.08, t + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.5);
}

function playSelect() {
  const ctx = getAudio();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(600, ctx.currentTime);
  osc.frequency.setValueAtTime(750, ctx.currentTime + 0.04);
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.1);
}

function playReveal() {
  const ctx = getAudio();
  for (let i = 0; i < 6; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 300 + i * 50;
    const t = ctx.currentTime + i * 0.06;
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.05);
  }
}

// ═══════════════════════════════════════
//  SPLASH
// ═══════════════════════════════════════
setTimeout(() => $("splash").classList.add("gone"), 2600);

// ═══════════════════════════════════════
//  COUNTDOWN
// ═══════════════════════════════════════
function updateCountdown() {
  const diff = WEDDING_DATE - new Date();
  if (diff <= 0) { countdownEl.textContent = "Today is the day"; return; }
  const days = Math.floor(diff / 86400000);
  countdownEl.textContent = `${days} day${days !== 1 ? "s" : ""} until forever`;
}
updateCountdown();
setInterval(updateCountdown, 60000);

// ═══════════════════════════════════════
//  SETTINGS PANEL
// ═══════════════════════════════════════
const settingsPanel = $("settings-panel");
const settingsBackdrop = $("settings-backdrop");

$("settings-btn").addEventListener("click", () => {
  settingsPanel.classList.add("open");
  settingsBackdrop.classList.add("show");
});

function closeSettings() {
  settingsPanel.classList.remove("open");
  settingsBackdrop.classList.remove("show");
}
$("settings-close").addEventListener("click", closeSettings);
settingsBackdrop.addEventListener("click", closeSettings);

// ═══════════════════════════════════════
//  PLAY MODE + IDENTITY + REMOTE
// ═══════════════════════════════════════
let playMode = localStorage.getItem("tayo_playmode") || "together"; // "together" | "remote"
let myIdentity = localStorage.getItem("tayo_identity") || "charlie"; // "charlie" | "karla"
let currentUser = null;
let partnerOnline = false;
let remoteListeners = [];

// Play mode toggle
const playModeToggle = $("play-mode-toggle");
const playModeHint = $("play-mode-hint");
const identitySection = $("identity-section");
const remoteSection = $("remote-section");

function setPlayMode(mode) {
  playMode = mode;
  localStorage.setItem("tayo_playmode", mode);
  playModeToggle.classList.toggle("right", mode === "remote");
  playModeToggle.querySelectorAll(".settings-toggle-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.playmode === mode);
  });
  if (mode === "together") {
    playModeHint.textContent = "Same device — pass the phone";
    identitySection.classList.add("hidden");
    remoteSection.classList.add("hidden");
    $("partner-dot").classList.add("hidden");
    cleanupRemote();
  } else {
    playModeHint.textContent = "Separate devices — real-time sync";
    identitySection.classList.add("hidden");
    remoteSection.classList.remove("hidden");
    initRemote();
  }
}

playModeToggle.addEventListener("click", (e) => {
  const btn = e.target.closest(".settings-toggle-btn");
  if (!btn) return;
  setPlayMode(btn.dataset.playmode);
  playTap();
});

// Identity toggle (together mode)
const identityToggle = $("identity-toggle");
function setIdentity(id) {
  myIdentity = id;
  localStorage.setItem("tayo_identity", id);
  identityToggle.classList.toggle("right", id === "karla");
  identityToggle.querySelectorAll(".settings-toggle-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.identity === id);
  });
}

identityToggle.addEventListener("click", (e) => {
  const btn = e.target.closest(".settings-toggle-btn");
  if (!btn) return;
  setIdentity(btn.dataset.identity);
  playTap();
});

// Init from saved state
setPlayMode(playMode);
setIdentity(myIdentity);

// ═══════════════════════════════════════
//  REMOTE — Google Sign-In + Presence
// ═══════════════════════════════════════
$("btn-google-signin").addEventListener("click", async () => {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    if (!ALLOWED_EMAILS.includes(result.user.email)) {
      await signOut(auth);
      $("remote-status").textContent = "This app is just for Charlie & Karla.";
      return;
    }
  } catch (e) {
    $("remote-status").textContent = "Sign-in failed. Try again.";
  }
});

onAuthStateChanged(auth, (user) => {
  if (user && ALLOWED_EMAILS.includes(user.email)) {
    currentUser = user;
    myIdentity = user.email === "charliecayno@gmail.com" ? "charlie" : "karla";
    if (playMode === "remote") initRemote();
  } else {
    currentUser = null;
    if (playMode === "remote") {
      $("remote-status").textContent = "";
      $("partner-status").textContent = "";
    }
  }
});

$("logout-btn").addEventListener("click", async () => {
  if (currentUser) {
    set(ref(db, `tayo/presence/${myIdentity}`), { online: false, lastSeen: Date.now() });
  }
  await signOut(auth);
  currentUser = null;
  cleanupRemote();
  $("remote-signin-card").classList.remove("hidden");
  $("remote-status-card").classList.add("hidden");
  $("partner-dot").classList.add("hidden");
});

function initRemote() {
  if (!currentUser) {
    $("remote-signin-card").classList.remove("hidden");
    $("remote-status-card").classList.add("hidden");
    return;
  }

  $("remote-signin-card").classList.add("hidden");
  $("remote-status-card").classList.remove("hidden");
  const name = myIdentity === "charlie" ? "Charlie" : "Karla";
  $("remote-avatar").textContent = name[0];
  $("remote-user-name").textContent = name;
  $("remote-user-email").textContent = currentUser.email;

  // Presence
  const myPresRef = ref(db, `tayo/presence/${myIdentity}`);
  set(myPresRef, { online: true, lastSeen: Date.now() });
  onDisconnect(myPresRef).set({ online: false, lastSeen: serverTimestamp() });

  // Listen to partner
  const partnerId = myIdentity === "charlie" ? "karla" : "charlie";
  const partnerRef = ref(db, `tayo/presence/${partnerId}`);
  const unsub = onValue(partnerRef, (snap) => {
    const data = snap.val();
    partnerOnline = data?.online === true;
    // Topbar dot
    const dot = $("partner-dot");
    dot.classList.remove("hidden");
    dot.classList.toggle("offline", !partnerOnline);
    // Settings card
    const pDot = $("remote-partner-dot");
    const pText = $("remote-partner-text");
    const pName = partnerId === "charlie" ? "Charlie" : "Karla";
    pDot.classList.toggle("online", partnerOnline);
    pText.textContent = partnerOnline ? `${pName} is online` : `${pName} is offline`;
  });
  remoteListeners.push(unsub);

  // Listen for remote session (partner started a question)
  const sessionRef = ref(db, "tayo/remote/session");
  const unsub2 = onValue(sessionRef, (snap) => {
    const session = snap.val();
    if (!session || session.startedBy === myIdentity) return;

    // Partner started a question — show it on our device too
    if (session.state === "thinking") {
      setCreatureState("thinking");
      creatureGlow.classList.add("active");
      bubble.classList.remove("show");
      setTimeout(playThinkOink, 400);
    } else if (session.state === "revealed" && session.data) {
      setCreatureState(null);
      creatureGlow.classList.remove("active");
      currentTopicLabel = session.topicLabel || "";
      const topicEl = $("bubble-topic");
      if (topicEl) {
        topicEl.textContent = currentTopicLabel;
        topicEl.style.setProperty("--vibe-color", session.vibeColor || "#998e8e");
      }
      revealBubble(session.data);
    }
  });
  remoteListeners.push(unsub2);

  // Listen for remote quiz answers (race mode)
  const answersRef = ref(db, "tayo/remote/quizAnswers");
  const unsub3 = onValue(answersRef, (snap) => {
    const answers = snap.val();
    if (!answers) return;
    // This is handled inside setupQuizRemote
  });
  remoteListeners.push(unsub3);

  // Listen for remote question answers (reveal together)
  const qAnswersRef = ref(db, "tayo/remote/questionAnswers");
  const unsub4 = onValue(qAnswersRef, (snap) => {
    const answers = snap.val();
    if (!answers) return;
    // Check if both answered — reveal
    if (answers.charlie && answers.karla) {
      $("remote-waiting").classList.add("hidden");
      const reveal = $("remote-reveal");
      $("reveal-charlie").textContent = answers.charlie;
      $("reveal-karla").textContent = answers.karla;
      reveal.classList.remove("hidden");
      creatureCelebrate();

      // Save to journal
      saveToJournalDirect(answers.question, answers.charlie, answers.karla);

      // Clear after 8s
      setTimeout(() => {
        reveal.classList.add("hidden");
        remove(qAnswersRef);
      }, 8000);
    } else if (answers[myIdentity]) {
      // We answered, waiting for partner
      $("remote-waiting").classList.remove("hidden");
      $("remote-waiting").textContent = `Waiting for ${myIdentity === "charlie" ? "Karla" : "Charlie"}...`;
    }
  });
  remoteListeners.push(unsub4);
}

function cleanupRemote() {
  remoteListeners.forEach((unsub) => { if (typeof unsub === "function") unsub(); });
  remoteListeners = [];
  $("partner-dot").classList.add("hidden");
}

function saveToJournalDirect(question, charlieAnswer, karlaAnswer) {
  const JOURNAL_KEY = "tayo_journal";
  let journal = JSON.parse(localStorage.getItem(JOURNAL_KEY) || "[]");
  journal.unshift({ question, charlie: charlieAnswer, karla: karlaAnswer, time: Date.now() });
  if (journal.length > 200) journal = journal.slice(0, 200);
  localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
  syncJournalToFirebase();
}

// ═══════════════════════════════════════
//  PIG — Eye tracking
// ═══════════════════════════════════════
const leftEye = document.querySelector(".left-eye");
const rightEye = document.querySelector(".right-eye");

document.addEventListener("mousemove", (e) => trackEyes(e.clientX, e.clientY));
document.addEventListener("touchmove", (e) => {
  const t = e.touches[0];
  trackEyes(t.clientX, t.clientY);
});

function trackEyes(cx, cy) {
  if (creatureBody.classList.contains("thinking") || creatureBody.classList.contains("happy")) return;
  const rect = creatureBody.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = (cx - centerX) / window.innerWidth * 3;
  const dy = (cy - centerY) / window.innerHeight * 2;
  const clampX = Math.max(-2, Math.min(2, dx));
  const clampY = Math.max(-1.5, Math.min(1.5, dy));
  const t = `translate(${clampX}px, ${clampY}px)`;
  leftEye.style.transform = t;
  rightEye.style.transform = t;
}

// ═══════════════════════════════════════
//  PIG — Tap to ask
// ═══════════════════════════════════════
$("creature").addEventListener("click", () => {
  // Remote mode: block if partner is offline
  if (playMode === "remote" && currentUser && !partnerOnline) {
    playTap();
    // Show a temporary message
    const hint = $("tap-hint");
    hint.textContent = myIdentity === "charlie" ? "Karla is offline..." : "Charlie is offline...";
    hint.style.display = "";
    hint.style.opacity = "1";
    setTimeout(() => { hint.style.opacity = "0"; }, 2000);
    return;
  }
  playOink();
  askAI();
});

function setCreatureState(state) {
  creatureBody.classList.remove("thinking", "happy", "sad");
  if (state) creatureBody.classList.add(state);
}

function creatureCelebrate() {
  setCreatureState("happy");
  creatureGlow.classList.add("active");
  playCelebrate();
  setTimeout(() => {
    setCreatureState(null);
    creatureGlow.classList.remove("active");
  }, 2000);
}

function creatureSad() {
  setCreatureState("sad");
  playSadSound();
  setTimeout(() => {
    setCreatureState(null);
  }, 2500);
}

// ═══════════════════════════════════════
//  VIBE + MODE
// ═══════════════════════════════════════
const VIBE_COLORS = {
  anything: "#998e8e",
  deep: "#6366f1",
  fun: "#f59e0b",
  sweet: "#ec4899",
  silly: "#8b5cf6",
  "real talk": "#ef4444",
  growth: "#22c55e",
  spiritual: "#3b82f6",
};

function updateVibeDisplay(vibe) {
  const el = $("current-vibe");
  const label = vibe.charAt(0).toUpperCase() + vibe.slice(1);
  el.textContent = label;
  el.style.setProperty("--current-vibe-color", VIBE_COLORS[vibe] || "#998e8e");
}

function saveVibe(vibe) {
  currentVibe = vibe;
  updateVibeDisplay(vibe);
  set(ref(db, "tayo/settings/vibe"), vibe);
}

// Load vibe from Firebase on start
onValue(ref(db, "tayo/settings/vibe"), (snap) => {
  const vibe = snap.val() || "anything";
  currentVibe = vibe;
  updateVibeDisplay(vibe);
  // Update chip selection
  vibeChips.querySelectorAll(".vibe-chip").forEach((c) => {
    c.classList.toggle("active", c.dataset.vibe === vibe);
  });
}, { onlyOnce: true });

vibeChips.addEventListener("click", (e) => {
  const chip = e.target.closest(".vibe-chip");
  if (!chip) return;
  vibeChips.querySelectorAll(".vibe-chip").forEach((c) => c.classList.remove("active"));
  chip.classList.add("active");
  saveVibe(chip.dataset.vibe);
  vibeInput.value = "";
  playTap();
});

vibeInput.addEventListener("input", () => {
  if (vibeInput.value.trim()) {
    vibeChips.querySelectorAll(".vibe-chip").forEach((c) => c.classList.remove("active"));
    saveVibe(vibeInput.value.trim());
  } else {
    vibeChips.querySelector('[data-vibe="anything"]').classList.add("active");
    saveVibe("anything");
  }
});

vibeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); closeSettings(); askAI(); }
});

const modeToggle = document.querySelector(".mode-toggle");
modeToggle.addEventListener("click", (e) => {
  const chip = e.target.closest(".mode-chip");
  if (!chip) return;
  document.querySelectorAll(".mode-chip").forEach((c) => c.classList.remove("active"));
  chip.classList.add("active");
  currentMode = chip.dataset.mode;
  modeToggle.classList.toggle("quiz-active", currentMode === "quiz");
  playTap();
});

// ═══════════════════════════════════════
//  QUIZ LOGIC
// ═══════════════════════════════════════
function updateScoreboard() {
  $("score-charlie").textContent = scores.charlie;
  $("score-karla").textContent = scores.karla;
  $("scoreboard").classList.toggle("show", currentMode === "quiz");
  localStorage.setItem(SCORES_KEY, JSON.stringify(scores));
}

function setupQuiz(data) {
  const choices = data.choices || [];
  const correct = data.correct ?? 0;
  const explanation = data.explanation || "";
  const picksEl = $("quiz-picks");
  const choicesEl = $("quiz-choices");
  const resultEl = $("quiz-result");

  let charliePick = null, karlaPick = null;
  let currentPicker = Math.random() < 0.5 ? "charlie" : "karla";
  let revealed = false;

  resultEl.classList.remove("show");
  resultEl.textContent = "";
  choicesEl.innerHTML = "";

  function renderPicks() {
    if (revealed) {
      picksEl.innerHTML = "";
      return;
    }
    const cDone = charliePick !== null;
    const kDone = karlaPick !== null;
    if (cDone && kDone) {
      picksEl.innerHTML = "";
    } else {
      const name = currentPicker === "charlie" ? "Charlie" : "Karla";
      picksEl.innerHTML = `
        <span class="quiz-turn-label">${name}'s turn</span>
        <span class="quiz-pick-tags">
          <span class="quiz-pick-tag ${cDone ? 'picked' : ''} ${currentPicker === 'charlie' ? 'active' : ''}">C ${cDone ? '✓' : ''}</span>
          <span class="quiz-pick-tag ${kDone ? 'picked' : ''} ${currentPicker === 'karla' ? 'active' : ''}">K ${kDone ? '✓' : ''}</span>
        </span>
      `;
    }
  }

  choices.forEach((choice, i) => {
    const btn = document.createElement("button");
    btn.className = "quiz-choice";
    btn.textContent = choice;
    btn.addEventListener("click", () => {
      if (revealed) return;

      if (playMode === "remote" && currentUser) {
        // Remote race mode — save my pick to Firebase
        update(ref(db, "tayo/remote/quizAnswers"), {
          [myIdentity]: { pick: i, time: Date.now() },
        });
        // Disable all choices for me
        choicesEl.querySelectorAll(".quiz-choice").forEach((b) => { b.style.pointerEvents = "none"; b.style.opacity = "0.6"; });
        btn.style.opacity = "1";
        btn.classList.add(myIdentity === "charlie" ? "selected-charlie" : "selected-karla");
        playSelect();
        return;
      }

      // Together mode — normal turn-based
      if (currentPicker === "charlie") {
        charliePick = i;
        currentPicker = karlaPick === null ? "karla" : "done";
      } else if (currentPicker === "karla") {
        karlaPick = i;
        currentPicker = charliePick === null ? "charlie" : "done";
      } else return;
      playSelect();
      renderChoiceState();
      renderPicks();
      if (currentPicker !== "done") {
        const label = picksEl.querySelector(".quiz-turn-label");
        if (label) {
          label.style.transition = "none";
          label.style.opacity = "0";
          label.style.transform = "translateY(-4px)";
          void label.offsetWidth;
          label.style.transition = "opacity 0.3s ease, transform 0.3s ease";
          label.style.opacity = "1";
          label.style.transform = "translateY(0)";
        }
      }
      if (charliePick !== null && karlaPick !== null) setTimeout(revealAnswer, 600);
    });
    choicesEl.appendChild(btn);
  });

  function renderChoiceState() {
    choicesEl.querySelectorAll(".quiz-choice").forEach((btn, i) => {
      btn.classList.remove("selected-charlie", "selected-karla");
      const old = btn.querySelector(".pick-indicators");
      if (old) old.remove();
      let indicators = "";
      if (charliePick === i) { btn.classList.add("selected-charlie"); indicators += '<span class="pick-dot charlie">C</span>'; }
      if (karlaPick === i) { btn.classList.add("selected-karla"); indicators += '<span class="pick-dot karla">K</span>'; }
      if (indicators) {
        const div = document.createElement("div");
        div.className = "pick-indicators";
        div.innerHTML = indicators;
        btn.appendChild(div);
      }
    });
  }

  function revealAnswer() {
    revealed = true;
    playReveal();
    choicesEl.querySelectorAll(".quiz-choice").forEach((btn, i) => {
      btn.style.pointerEvents = "none";
      btn.classList.add(i === correct ? "correct" : "wrong");
    });
    if (charliePick === correct) { scores.charlie++; popScore("score-charlie"); }
    if (karlaPick === correct) { scores.karla++; popScore("score-karla"); }
    let msg = charliePick === correct && karlaPick === correct ? "Both got it!" :
              charliePick === correct ? "Charlie got it!" :
              karlaPick === correct ? "Karla got it!" : "Neither got it!";
    resultEl.innerHTML = `<strong>${msg}</strong>${explanation ? "<br>" + explanation : ""}`;
    resultEl.classList.add("show");
    updateScoreboard();

    if (charliePick === correct || karlaPick === correct) {
      creatureCelebrate();
    } else {
      creatureSad();
    }

    // Auto-dismiss after 5s — reset to normal state
    if (quizDismissTimer) clearTimeout(quizDismissTimer);
    quizDismissTimer = setTimeout(() => {
      // Only dismiss if we haven't started a new question
      if (!isGenerating) {
        bubble.classList.remove("show");
        $("quiz-area").classList.remove("show");
      }
      quizDismissTimer = null;
    }, 10000);

    // Save quiz to journal
    saveQuizToJournal({
      question: data.question,
      choices,
      correct,
      charliePick,
      karlaPick,
      explanation,
    });
  }

  function popScore(id) {
    const el = $(id);
    el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
  }

  renderPicks();
  updateScoreboard();

  // Remote race mode — listen for both answers
  if (playMode === "remote" && currentUser) {
    picksEl.innerHTML = '<span class="quiz-turn-label">Race! Pick your answer</span>';
    const quizAnswersRef = ref(db, "tayo/remote/quizAnswers");
    const unsubQuiz = onValue(quizAnswersRef, (snap) => {
      const answers = snap.val();
      if (!answers) return;
      const cAnswer = answers.charlie;
      const kAnswer = answers.karla;

      // Update visual for partner's pick
      if (cAnswer) charliePick = cAnswer.pick;
      if (kAnswer) karlaPick = kAnswer.pick;
      renderChoiceState();

      // Both answered — reveal with "First!" badge
      if (cAnswer && kAnswer && !revealed) {
        const charlieFirst = cAnswer.time <= kAnswer.time;
        setTimeout(() => {
          revealAnswer();
          // Add "First!" badge
          const firstPerson = charlieFirst ? "Charlie" : "Karla";
          const resultEl = $("quiz-result");
          resultEl.innerHTML += `<br><span style="font-size:0.6rem;opacity:0.7">${firstPerson} answered first! ⚡</span>`;
        }, 600);
      }
    });
    remoteListeners.push(unsubQuiz);
  }
}

// ═══════════════════════════════════════
//  AI PROMPT
// ═══════════════════════════════════════
function getSystemPrompt() {
  let modeBlock = "";
  if (currentMode === "quiz") {
    modeBlock = `MODE: QUIZ — A trivia question with ONE objectively correct answer that can be verified by anyone.
NEVER ask personal questions about Charlie and Karla — the AI doesn't know them personally.
ONLY ask factual trivia: science, geography, history, pop culture, Bible, food, animals, sports, language, math, etc.
The answer must be a FACT, not an opinion or personal detail.

JSON format:
{ "question": "...", "choices": ["A", "B", "C", "D"], "correct": 0, "explanation": "short explanation why" }`;
  } else {
    modeBlock = `MODE: QUESTION — a conversation question they discuss face to face. No choices, no correct answer. Just a question to talk about.

JSON format:
{ "question": "..." }`;
  }

  return `You are Tayo, a companion for Charlie and Karla — a Filipino couple together right now.

VIBE: "{VIBE}"
TOPIC: "{TOPIC}" — your question MUST be about this specific topic. Do not deviate.
${modeBlock}

Rules:
- Topics should be VARIED and RANDOM. Pick from this list unpredictably each time:
  * Fun: funny memories, embarrassing moments, hot takes, would-you-rather, food debates, pop culture opinions
  * Memories: childhood, first experiences, favorite moments together, nostalgia
  * Growth: one small habit to improve, ways to love better, communication goals (only sometimes, not every time)
  * Dreams: future plans, bucket list, travel, career goals, silly dreams
  * Deep: fears, gratitude, emotional check-ins, things unsaid, vulnerability
  * Random: preferences, favorites, hypotheticals, personality quirks, unpopular opinions
- Do NOT make every question about improvement or relationship building. Mix it up. Be unpredictable.
- NEVER ask about superpowers, time machines, invisibility, or overused hypotheticals. Be original.
- "spiritual" = BIBLE-BASED: Bible trivia, verse discussions, Bible characters, Scripture-rooted faith questions. NOT generic inspirational stuff.
- Always write in English only. No Filipino, no Taglish.
- Vibes: deep=vulnerable, fun=playful, sweet=romantic, silly=absurd, real talk=honest/raw, spiritual=Bible-based
- NO pet names (babe, baby, mahal, love). Just ask directly.
- Frame questions as "we/us/our" not "you/your". The question should feel shared.
- NEVER address Charlie or Karla by name in the question.
- Pure and wholesome. No sexual content.
- Charlie and Karla are a committed Christian couple. They never dated casually or had a "fling." Don't imply that. Their relationship has always been intentional and serious.
- Question under 25 words.
- Quiz mode: ALWAYS include "choices" array (4 items) and "correct" index (0-3) and "explanation".
- Quiz choices must be SHORT — max 5 words each. Be concise and direct.
- NEVER reveal the answer inside the choices. Choices should not contain hints like parenthetical translations or explanations. Bad: "い (i)" Good: "い". Bad: "Mars (Red Planet)" Good: "Mars".`;
}

// ═══════════════════════════════════════
//  ASK AI
// ═══════════════════════════════════════
// ═══════════════════════════════════════
//  RANDOMIZER — JS controls the topic
// ═══════════════════════════════════════
const QUESTION_TOPICS_BY_VIBE = {
  deep: [
    "something we've been meaning to say but haven't",
    "our biggest fear about the future together",
    "a moment we felt most supported by each other",
    "what makes us feel most loved and why",
    "something we're currently struggling with alone",
    "a past hurt that still affects us sometimes",
    "what forgiveness looks like in our relationship",
    "when we last cried and what caused it",
    "a fear we haven't shared with anyone else",
    "what vulnerability means to each of us",
    "a time we felt misunderstood by each other",
    "what we wish we could tell our younger selves",
    "the heaviest thing on our minds right now",
    "what we're most grateful for that we don't say enough",
  ],
  fun: [
    "a funny childhood memory worth sharing",
    "our most embarrassing moment as a couple",
    "a hot take or unpopular opinion we hold",
    "a would-you-rather with funny options",
    "a food debate we'll never agree on",
    "a pop culture opinion about movies or music",
    "a fictional character we each relate to most",
    "what animal best represents each of us",
    "the funniest misunderstanding we've ever had",
    "a skill we're hilariously bad at",
    "the most useless talent we have",
    "if our relationship was a TV show what genre",
    "the most random purchase we've ever made",
    "a trend we secretly love but won't admit",
  ],
  sweet: [
    "a favorite memory from early in our relationship",
    "a moment that made us fall deeper in love",
    "the best gift we've ever given each other",
    "a time one of us surprised the other perfectly",
    "a song that reminds us of a specific moment",
    "a small moment that meant a lot but we never discussed",
    "the moment we each knew this was real",
    "what we love most about being together",
    "a letter or message that meant the world to us",
    "our dream date if money wasn't an issue",
    "the first thing we noticed about each other",
    "a compliment from each other we'll never forget",
    "what we'd write in a love letter right now",
    "the little things the other does that melt our heart",
  ],
  silly: [
    "a would-you-rather with absurd options",
    "the most random thing that secretly annoys us",
    "the dumbest argument we've ever had",
    "what we'd do if we swapped bodies for a day",
    "a made-up rule our relationship needs",
    "the weirdest dream we've had about each other",
    "if we were contestants on a game show which one",
    "the most irrational fear we each have",
    "a conspiracy theory one of us lowkey believes",
    "what our pets would say about us if they could talk",
    "the most dramatic thing we've done over something small",
    "if we had to survive on one meal forever what is it",
    "the worst possible couple costume we'd actually wear",
    "something petty we will absolutely never let go of",
  ],
  "real talk": [
    "something we've been avoiding talking about",
    "a topic we always circle back to but never resolve",
    "how we've changed as a couple this past year",
    "one honest thing we should tell each other today",
    "what we think each other's biggest blind spot is",
    "how we deal with jealousy or insecurity",
    "what bothers us that we downplay to keep peace",
    "how we can fight more fairly",
    "what we wish the other understood without explaining",
    "a promise we should make to each other",
    "how we feel about where we are in life right now",
    "what success looks like for us as a couple",
    "something we pretend doesn't bother us but it does",
    "the hardest season we've been through and what it taught us",
  ],
  growth: [
    "one small daily habit to strengthen our relationship",
    "a new way we could show appreciation daily",
    "how we can be more intentional with our time",
    "a conflict resolution approach worth trying",
    "how we can better support each other's personal dreams",
    "one thing to change about our daily routine together",
    "a new activity or hobby to try as a couple",
    "a habit we should build for our future family",
    "what we can do to make each other feel more secure",
    "one area where we've grown and one where we can improve",
    "how we can create better quality time together",
    "a financial habit we should start practicing now",
    "how we can hold each other accountable lovingly",
    "what our best version as a couple looks like",
  ],
  spiritual: [
    "a Bible verse that has been meaningful to us lately",
    "how we can pray for each other this week specifically",
    "a Bible character whose faith journey inspires us",
    "what God has been teaching us individually lately",
    "how we can grow spiritually together as a couple",
    "a sermon or teaching that recently challenged us",
    "what worship looks like in our everyday life",
    "how we handle doubts or questions about our faith",
    "a prayer we should pray together right now",
    "what trusting God looks like in our current season",
    "a Bible story that relates to what we're going through",
    "how we can serve and bless others together",
    "a spiritual discipline we want to build as a couple",
    "a time we clearly saw God answer our prayer",
  ],
};

const QUIZ_TOPICS_BY_VIBE = {
  anything: [
    "geography (countries, capitals, oceans, mountains)",
    "science facts (space, biology, chemistry, physics)",
    "history events and dates",
    "world records and extremes",
    "food origins and cooking facts",
    "animal facts and nature",
    "human body and health facts",
    "technology and inventions",
    "movies and directors",
    "music artists and songs",
    "Filipino history and heroes",
    "Philippine geography and provinces",
    "Filipino food and cuisine",
  ],
  deep: [
    "psychology facts and mental health",
    "philosophy and famous thinkers",
    "emotional intelligence concepts",
    "famous quotes and who said them",
    "relationship science and studies",
    "human behavior and body language",
  ],
  fun: [
    "movies and directors",
    "music artists and songs",
    "TV shows and series",
    "video games trivia",
    "celebrity facts",
    "memes and internet culture",
    "sports facts and records",
    "funny world records",
  ],
  sweet: [
    "famous love stories in history",
    "romance movies and their details",
    "love songs and their artists",
    "wedding traditions around the world",
    "Valentine's Day history and facts",
    "famous couples in history",
  ],
  silly: [
    "weird animal facts",
    "bizarre world records",
    "strange food from around the world",
    "funny laws that actually exist",
    "ridiculous inventions that are real",
    "weird body facts",
  ],
  "real talk": [
    "current events and world news",
    "social media and technology impact",
    "financial literacy basics",
    "health and wellness facts",
    "career and work-life facts",
    "Filipino current events and culture",
  ],
  growth: [
    "productivity and habit science",
    "famous success stories and entrepreneurs",
    "health and nutrition facts",
    "financial literacy and money facts",
    "communication and leadership",
    "self-improvement book facts",
  ],
  spiritual: [
    "Old Testament characters and stories",
    "New Testament events and miracles",
    "Bible verses and their books",
    "Kings and prophets of Israel",
    "Jesus' parables and teachings",
    "Books of the Bible facts",
    "Biblical numbers and symbolism",
    "Apostles and the early church",
  ],
};

let lastTopicIndex = -1;

function getRandomTopic(list) {
  let idx;
  do { idx = Math.floor(Math.random() * list.length); } while (idx === lastTopicIndex && list.length > 1);
  lastTopicIndex = idx;
  return list[idx];
}

async function askAI() {
  if (isGenerating) return;
  isGenerating = true;

  if (quizDismissTimer) { clearTimeout(quizDismissTimer); quizDismissTimer = null; }
  setCreatureState("thinking");
  creatureGlow.classList.add("active");
  bubble.classList.remove("show");
  answerArea.classList.remove("show");
  $("remote-reveal").classList.add("hidden");
  $("remote-waiting").classList.add("hidden");
  setTimeout(playThinkOink, 400);

  // Remote: broadcast thinking state
  if (playMode === "remote" && currentUser) {
    set(ref(db, "tayo/remote/session"), { state: "thinking", startedBy: myIdentity, time: Date.now() });
    remove(ref(db, "tayo/remote/quizAnswers"));
    remove(ref(db, "tayo/remote/questionAnswers"));
  }
  const tapHint = $("tap-hint");
  if (tapHint) tapHint.style.display = "none";

  await sleep(300);

  // JS picks the random topic based on vibe
  let topicList;
  let activeVibe = currentVibe;
  let isCustomVibe = false;
  let customTopic = null;

  // Check if it's a predefined vibe or custom text
  const predefinedVibes = ["anything", "deep", "fun", "sweet", "silly", "real talk", "growth", "spiritual"];
  if (!predefinedVibes.includes(currentVibe)) {
    // Custom vibe — pass directly to AI as topic
    isCustomVibe = true;
    customTopic = currentVibe;
    activeVibe = currentVibe;
  }

  if (isCustomVibe) {
    // For custom vibes, we skip the topic list and tell AI directly
    topicList = [customTopic];
  } else if (currentMode === "quiz") {
    if (currentVibe === "anything") {
      const vibes = Object.keys(QUIZ_TOPICS_BY_VIBE);
      activeVibe = vibes[Math.floor(Math.random() * vibes.length)];
    }
    topicList = QUIZ_TOPICS_BY_VIBE[activeVibe] || QUIZ_TOPICS_BY_VIBE.anything;
  } else {
    if (currentVibe === "anything") {
      const vibes = ["deep", "fun", "sweet", "silly", "real talk", "growth", "spiritual"];
      activeVibe = vibes[Math.floor(Math.random() * vibes.length)];
    }
    topicList = QUESTION_TOPICS_BY_VIBE[activeVibe] || QUESTION_TOPICS_BY_VIBE.fun;
  }

  const randomTopic = getRandomTopic(topicList);
  const modeLabel = currentMode === "quiz" ? "Quiz" : "";
  const vibeLabel = activeVibe.charAt(0).toUpperCase() + activeVibe.slice(1);
  currentTopicLabel = modeLabel ? `${vibeLabel} · ${modeLabel}` : vibeLabel;
  const topicEl = $("bubble-topic");
  if (topicEl) topicEl.style.setProperty("--vibe-color", VIBE_COLORS[activeVibe] || "#f59e0b");

  let parsed = null;
  try {
    const prompt = getSystemPrompt().replace("{VIBE}", currentVibe).replace("{TOPIC}", randomTopic) + "\n\nAssistant:";
    const res = await fetch(GEMINI_PROXY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: "tayo",
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 1.1, maxOutputTokens: 300 },
      }),
    });
    const data = await res.json();
    const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    parsed = parseJSON(raw);
  } catch (e) { /* silent */ }

  if (!parsed) parsed = getFallback();

  setCreatureState(null);
  creatureGlow.classList.remove("active");

  currentQuestion = parsed.question;

  // Remote: broadcast question to partner
  if (playMode === "remote" && currentUser) {
    set(ref(db, "tayo/remote/session"), {
      state: "revealed",
      startedBy: myIdentity,
      data: parsed,
      topicLabel: currentTopicLabel,
      vibeColor: VIBE_COLORS[activeVibe] || "#f59e0b",
      time: Date.now(),
    });
  }

  await revealBubble(parsed);
  isGenerating = false;
}

function parseJSON(raw) {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { const o = JSON.parse(m[0]); if (o.question) return o; }
  } catch {}
  return null;
}

// ═══════════════════════════════════════
//  BUBBLE REVEAL
// ═══════════════════════════════════════
let currentTopicLabel = "";

async function revealBubble(data) {
  bubbleText.textContent = "";
  $("bubble-topic").textContent = currentTopicLabel;
  const quizArea = $("quiz-area");
  quizArea.classList.remove("show");
  bubble.classList.add("show");
  await sleep(150);

  // Typewriter first
  await typewriter(bubbleText, data.question || "", 22);
  await sleep(300);

  // Then reveal quiz choices with stagger (only in quiz mode)
  if (currentMode === "quiz" && data.choices && data.choices.length) {
    setupQuiz(data);
    quizArea.classList.add("show");

    // Stagger each choice
    const choices = quizArea.querySelectorAll(".quiz-choice");
    choices.forEach((c) => { c.style.opacity = "0"; c.style.transform = "translateY(8px)"; });
    for (let i = 0; i < choices.length; i++) {
      await sleep(100);
      choices[i].style.transition = "opacity 0.3s ease, transform 0.3s ease";
      choices[i].style.opacity = "1";
      choices[i].style.transform = "translateY(0)";
    }
  }

  // Show answer area for question mode
  if (currentMode === "question") {
    await sleep(300);
    showAnswerArea();
  }
}

function typewriter(el, text, speed = 30) {
  return new Promise((resolve) => {
    let i = 0;
    el.textContent = "";
    const iv = setInterval(() => {
      el.textContent += text[i];
      i++;
      if (i >= text.length) { clearInterval(iv); resolve(); }
    }, speed);
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ═══════════════════════════════════════
//  ANSWER AREA (Question mode)
// ═══════════════════════════════════════
const answerArea = $("answer-area");
const answerText = $("answer-text");
const answerBox = $("answer-box");
const micBtn = $("mic-btn");
const saveBtn = $("save-answer-btn");
const savedAnswers = $("saved-answers");
const tabCharlie = $("tab-charlie");
const tabKarla = $("tab-karla");
let currentWho = "charlie";
let currentAnswers = {};
let currentQuestion = null;
let recognition = null;
let isRecording = false;

function showAnswerArea() {
  if (playMode === "remote") {
    // Remote: no tabs, just show text input for my answer
    currentWho = myIdentity;
    document.querySelector(".answer-who").classList.add("hidden");
  } else {
    currentWho = "charlie";
    document.querySelector(".answer-who").classList.remove("hidden");
    tabCharlie.classList.add("active");
    tabCharlie.classList.remove("has-answer");
    tabKarla.classList.remove("active", "has-answer");
    answerWho.classList.remove("karla-active");
  }
  answerText.textContent = "";
  savedAnswers.innerHTML = "";
  saveBtn.classList.remove("ready");
  $("remote-waiting").classList.add("hidden");
  $("remote-reveal").classList.add("hidden");
  answerArea.classList.add("show");
}

const answerWho = document.querySelector(".answer-who");

[tabCharlie, tabKarla].forEach((tab) => {
  tab.addEventListener("click", () => {
    const text = answerText.textContent.trim();
    if (text) currentAnswers[currentWho] = text;
    currentWho = tab.dataset.who;
    tabCharlie.classList.toggle("active", currentWho === "charlie");
    tabKarla.classList.toggle("active", currentWho === "karla");
    answerWho.classList.toggle("karla-active", currentWho === "karla");
    answerText.textContent = currentAnswers[currentWho] || "";
    updateSaveBtn();
  });
});

answerText.addEventListener("input", updateSaveBtn);
function updateSaveBtn() {
  saveBtn.classList.toggle("ready", answerText.textContent.trim().length > 0);
}

saveBtn.addEventListener("click", () => {
  const text = answerText.textContent.trim();
  if (!text) return;
  playSelect();

  if (playMode === "remote" && currentUser) {
    // Remote: save my answer to Firebase, wait for partner
    update(ref(db, "tayo/remote/questionAnswers"), {
      [myIdentity]: text,
      question: currentQuestion,
    });
    answerText.textContent = "";
    saveBtn.classList.remove("ready");
    $("remote-waiting").classList.remove("hidden");
    $("remote-waiting").textContent = `Waiting for ${myIdentity === "charlie" ? "Karla" : "Charlie"}...`;
  } else {
    // Together mode: normal flow
    currentAnswers[currentWho] = text;
    if (currentWho === "charlie") tabCharlie.classList.add("has-answer");
    else tabKarla.classList.add("has-answer");
    renderSavedAnswers();
    answerText.textContent = "";
    saveBtn.classList.remove("ready");

    const other = currentWho === "charlie" ? "karla" : "charlie";
    if (!currentAnswers[other]) {
      currentWho = other;
      tabCharlie.classList.toggle("active", currentWho === "charlie");
      tabKarla.classList.toggle("active", currentWho === "karla");
      answerWho.classList.toggle("karla-active", currentWho === "karla");
    }

    if (currentAnswers.charlie && currentAnswers.karla) {
      saveToJournal();
      creatureCelebrate();
    }
  }
});

function renderSavedAnswers() {
  savedAnswers.innerHTML = "";
  for (const who of ["charlie", "karla"]) {
    if (currentAnswers[who]) {
      const chip = document.createElement("div");
      chip.className = "saved-answer-chip";
      chip.innerHTML = `<span class="sa-who">${who === "charlie" ? "C" : "K"}</span><span class="sa-text">${currentAnswers[who]}</span>`;
      savedAnswers.appendChild(chip);
    }
  }
}

// Speech-to-Text
micBtn.addEventListener("click", toggleRecording);

function toggleRecording() {
  if (isRecording) { stopRecording(); return; }
  if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
    alert("Speech recognition not supported. Try Chrome or Safari.");
    return;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-PH";

  let finalText = answerText.textContent || "";
  recognition.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
      else interim = e.results[i][0].transcript;
    }
    answerText.textContent = finalText + interim;
    updateSaveBtn();
  };
  recognition.onerror = () => stopRecording();
  recognition.onend = () => stopRecording();
  recognition.start();
  isRecording = true;
  micBtn.classList.add("recording");
  answerBox.classList.add("recording");
}

function stopRecording() {
  if (recognition) { try { recognition.stop(); } catch {} recognition = null; }
  isRecording = false;
  micBtn.classList.remove("recording");
  answerBox.classList.remove("recording");
}

function saveQuizToJournal(data) {
  const JOURNAL_KEY = "tayo_journal";
  let journal = JSON.parse(localStorage.getItem(JOURNAL_KEY) || "[]");
  journal.unshift({
    type: "quiz",
    question: data.question,
    choices: data.choices,
    correct: data.correct,
    charliePick: data.charliePick,
    karlaPick: data.karlaPick,
    explanation: data.explanation,
    charlieRight: data.charliePick === data.correct,
    karlaRight: data.karlaPick === data.correct,
    time: Date.now(),
  });
  if (journal.length > 200) journal = journal.slice(0, 200);
  localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
  syncJournalToFirebase();
}

function saveToJournal() {
  const JOURNAL_KEY = "tayo_journal";
  let journal = JSON.parse(localStorage.getItem(JOURNAL_KEY) || "[]");
  journal.unshift({
    question: currentQuestion,
    charlie: currentAnswers.charlie || "",
    karla: currentAnswers.karla || "",
    time: Date.now(),
  });
  if (journal.length > 200) journal = journal.slice(0, 200);
  localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
  syncJournalToFirebase();
}

// ═══════════════════════════════════════
//  HISTORY / JOURNAL
// ═══════════════════════════════════════
// Save journal to Firebase
function syncJournalToFirebase() {
  const journal = JSON.parse(localStorage.getItem("tayo_journal") || "[]");
  set(ref(db, "tayo/journal"), journal);
}

// Load journal from Firebase on start
onValue(ref(db, "tayo/journal"), (snap) => {
  const data = snap.val();
  if (data && Array.isArray(data)) {
    localStorage.setItem("tayo_journal", JSON.stringify(data));
  }
}, { onlyOnce: true });

$("journal-hint").addEventListener("click", () => {
  const panel = $("journal");
  const list = $("journal-list");
  const journal = JSON.parse(localStorage.getItem("tayo_journal") || "[]");
  if (!journal.length) {
    list.innerHTML = '<p class="journal-empty">No entries yet. Answer some questions together!</p>';
    $("journal-subtitle").textContent = "";
  } else {
    $("journal-subtitle").textContent = `${journal.length} conversation${journal.length !== 1 ? "s" : ""}`;
    list.innerHTML = journal.map((e, idx) => {
      const deleteBtn = `<button class="je-delete" data-idx="${idx}"><span class="material-symbols-rounded">delete</span></button>`;
      if (e.type === "quiz") {
        const correctAnswer = e.choices?.[e.correct] || "?";
        const cRight = e.charlieRight;
        const kRight = e.karlaRight;
        return `
          <div class="journal-entry">
            ${deleteBtn}
            <div class="je-header">
              <span class="je-icon"><span class="material-symbols-rounded">quiz</span></span>
              <span class="je-type-label">Quiz</span>
              <span class="je-time">${timeAgo(e.time)}</span>
            </div>
            <div class="je-question">${e.question}</div>
            <div class="je-correct">
              <span class="material-symbols-rounded je-correct-icon">check_circle</span>
              ${correctAnswer}
            </div>
            <div class="je-picks">
              <div class="je-pick-card ${cRight ? 'correct' : 'wrong'}">
                <span class="je-pick-name">Charlie</span>
                <span class="je-pick-answer">${e.choices?.[e.charliePick] || "?"}</span>
                <span class="material-symbols-rounded je-pick-icon">${cRight ? "check" : "close"}</span>
              </div>
              <div class="je-pick-card ${kRight ? 'correct' : 'wrong'}">
                <span class="je-pick-name">Karla</span>
                <span class="je-pick-answer">${e.choices?.[e.karlaPick] || "?"}</span>
                <span class="material-symbols-rounded je-pick-icon">${kRight ? "check" : "close"}</span>
              </div>
            </div>
          </div>
        `;
      }
      return `
        <div class="journal-entry">
          ${deleteBtn}
          <div class="je-header">
            <span class="je-icon"><span class="material-symbols-rounded">chat_bubble</span></span>
            <span class="je-type-label">Question</span>
            <span class="je-time">${timeAgo(e.time)}</span>
          </div>
          <div class="je-question">${e.question}</div>
          ${e.charlie ? `
            <div class="je-answer-card">
              <span class="je-answer-name">Charlie</span>
              <span class="je-answer-text">${e.charlie}</span>
            </div>` : ""}
          ${e.karla ? `
            <div class="je-answer-card">
              <span class="je-answer-name">Karla</span>
              <span class="je-answer-text">${e.karla}</span>
            </div>` : ""}
        </div>
      `;
    }).join("");
  }
  // Delete handlers
  list.querySelectorAll(".je-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const journal = JSON.parse(localStorage.getItem("tayo_journal") || "[]");
      journal.splice(idx, 1);
      localStorage.setItem("tayo_journal", JSON.stringify(journal));
      syncJournalToFirebase();
      // Re-render
      btn.closest(".journal-entry").style.transition = "opacity 0.3s, transform 0.3s";
      btn.closest(".journal-entry").style.opacity = "0";
      btn.closest(".journal-entry").style.transform = "translateX(30px)";
      setTimeout(() => {
        $("journal-hint").click(); // Re-open to refresh
      }, 300);
    });
  });

  panel.classList.add("open");
});

$("journal-close").addEventListener("click", () => $("journal").classList.remove("open"));

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ═══════════════════════════════════════
//  FALLBACKS
// ═══════════════════════════════════════
function getFallback() {
  const f = [
    { question: "What's the most embarrassing thing we've done as a couple?" },
    { question: "What's the weirdest food combination we secretly enjoy?" },
    { question: "What's an unpopular opinion we'd both defend?" },
    { question: "If we could master any instrument overnight, which one?" },
    { question: "What's a movie we can rewatch forever and never get tired of?" },
    { question: "What's one thing we wish we learned earlier in life?" },
    { question: "What's our biggest guilty pleasure that nobody knows about?" },
    { question: "What's the funniest misunderstanding we've ever had?" },
    { question: "If our life together had a theme song, what would it be?" },
    { question: "What's the best meal we've ever shared and where was it?" },
  ];
  return f[Math.floor(Math.random() * f.length)];
}

// ═══════════════════════════════════════
//  SERVICE WORKER
// ═══════════════════════════════════════
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
