// ═══════════════════════════════════════
//  Tayo — Charlie & Karla
// ═══════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getDatabase, ref, set, get, update, onValue, onDisconnect, serverTimestamp, remove } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";

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
const storage = getStorage(fbApp);
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
  if (!countdownEl) return;
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
  // Pill position: solo=left, together=center, remote=right
  playModeToggle.classList.remove("left", "right");
  if (mode === "solo") playModeToggle.classList.add("left");
  else if (mode === "remote") playModeToggle.classList.add("right");
  playModeToggle.querySelectorAll(".settings-toggle-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.playmode === mode);
  });
  identitySection.classList.add("hidden");
  remoteSection.classList.add("hidden");
  $("partner-dot").classList.add("hidden");
  cleanupRemote();

  // Update topbar indicator
  const pmLabel = $("current-playmode");
  if (pmLabel) pmLabel.textContent = mode === "solo" ? "Solo" : mode === "together" ? "Together" : "Remote";

  if (mode === "solo") {
    playModeHint.textContent = "Just you — reflect on your own";
  } else if (mode === "together") {
    playModeHint.textContent = "Same device — pass the phone";
  } else {
    playModeHint.textContent = "Separate devices — real-time sync";
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

  // Presence — online only when tab is visible
  const myPresRef = ref(db, `tayo/presence/${myIdentity}`);

  function setOnline(isOnline) {
    set(myPresRef, { online: isOnline, lastSeen: Date.now() });
  }

  setOnline(!document.hidden);
  onDisconnect(myPresRef).set({ online: false, lastSeen: serverTimestamp() });

  // Track tab visibility
  const visHandler = () => setOnline(!document.hidden);
  document.addEventListener("visibilitychange", visHandler);
  remoteListeners.push(() => document.removeEventListener("visibilitychange", visHandler));

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

    // Parse JSON answer data (text + voiceURL)
    function parseAnswer(raw) {
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return { text: raw, voiceURL: null }; }
    }

    const cData = parseAnswer(answers.charlie);
    const kData = parseAnswer(answers.karla);

    // Check if both answered — reveal
    if (cData && kData) {
      $("remote-waiting").classList.add("hidden");
      answerArea.classList.remove("show");
      const reveal = $("remote-reveal");

      // Build reveal content with text + voice
      function buildReveal(id, data) {
        const el = $(id);
        el.innerHTML = "";
        if (data.text) el.innerHTML += `<span>${data.text}</span>`;
        if (data.voiceURL) {
          el.innerHTML += `
            <div class="je-voice-player" style="margin-top:0.3rem">
              <button class="je-voice-play" onclick="const a=this.parentElement.querySelector('audio');if(a.paused){a.play();this.querySelector('.material-symbols-rounded').textContent='pause'}else{a.pause();this.querySelector('.material-symbols-rounded').textContent='play_arrow'}">
                <span class="material-symbols-rounded">play_arrow</span>
              </button>
              <div class="je-voice-bars">${Array.from({length:20},()=>`<div class="je-bar" style="height:${3+Math.random()*14}px"></div>`).join("")}</div>
              <audio src="${data.voiceURL}" onended="this.parentElement.querySelector('.je-voice-play .material-symbols-rounded').textContent='play_arrow'"></audio>
            </div>`;
        }
        if (!data.text && !data.voiceURL) el.textContent = "(no answer)";
      }

      buildReveal("reveal-charlie", cData);
      buildReveal("reveal-karla", kData);
      reveal.classList.remove("hidden");
      creatureCelebrate();

      // Save to journal with voice URLs
      const JOURNAL_KEY = "tayo_journal";
      let journal = JSON.parse(localStorage.getItem(JOURNAL_KEY) || "[]");
      journal.unshift({
        question: answers.question,
        charlie: cData.text || "",
        karla: kData.text || "",
        charlieVoiceURL: cData.voiceURL || null,
        karlaVoiceURL: kData.voiceURL || null,
        time: Date.now(),
      });
      if (journal.length > 200) journal = journal.slice(0, 200);
      localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
      syncJournalToFirebase();

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

  // Solo quiz — single player, no turns
  if (playMode === "solo") {
    picksEl.innerHTML = "";
    charliePick = null;
    karlaPick = null;
    let soloPicked = false;

    choices.forEach((choice, i) => {
      const btn = choicesEl.children[i];
      if (!btn) return;
      // Replace click handler for solo
      const newBtn = btn.cloneNode(true);
      btn.replaceWith(newBtn);
      newBtn.addEventListener("click", () => {
        if (soloPicked) return;
        soloPicked = true;
        playSelect();

        // Mark pick
        if (myIdentity === "charlie") charliePick = i;
        else karlaPick = i;

        // Reveal immediately
        choicesEl.querySelectorAll(".quiz-choice").forEach((b, j) => {
          b.style.pointerEvents = "none";
          b.classList.add(j === correct ? "correct" : "wrong");
          if (j === i) b.classList.add(myIdentity === "charlie" ? "selected-charlie" : "selected-karla");
        });

        const isRight = i === correct;
        if (isRight) { scores[myIdentity]++; popScore(myIdentity === "charlie" ? "score-charlie" : "score-karla"); }
        const name = myIdentity === "charlie" ? "Charlie" : "Karla";
        resultEl.innerHTML = `<strong>${isRight ? `${name} got it!` : "Wrong!"}</strong>${explanation ? "<br>" + explanation : ""}`;
        resultEl.classList.add("show");
        updateScoreboard();
        if (isRight) creatureCelebrate(); else creatureSad();

        if (quizDismissTimer) clearTimeout(quizDismissTimer);
        quizDismissTimer = setTimeout(() => {
          if (!isGenerating) { bubble.classList.remove("show"); $("quiz-area").classList.remove("show"); }
          quizDismissTimer = null;
        }, 10000);

        saveQuizToJournal({ question: data.question, choices, correct, charliePick, karlaPick, explanation });
      });
    });
    updateScoreboard();
    return;
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

  const partnerName = myIdentity === "charlie" ? "Karla" : "Charlie";
  const myName = myIdentity === "charlie" ? "Charlie" : "Karla";

  if (playMode === "solo") {
    modeBlock = `MODE: SOLO — You are talking to ${myName}. Their partner is ${partnerName}.
Ask a personal reflective question addressed to ${myName} about ${partnerName}, their relationship, or their own life.
Use "you" for ${myName} and "${partnerName}" by name. Example: "What's one thing ${partnerName} does that always makes you smile?"
Make it feel intimate and personal — this is ${myName}'s alone time to reflect.

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
- Never start a question with "Thinking about" or any -ing gerund opener. Use direct phrasing like "Think about...", "What's...", "If we could...", "What would...".
- Quiz mode: ALWAYS include "choices" array (4 items) and "correct" index (0-3) and "explanation".
- Quiz choices must be SHORT — max 5 words each. Be concise and direct.
- NEVER reveal the answer inside the choices. Choices should not contain hints like parenthetical translations or explanations. Bad: "い (i)" Good: "い". Bad: "Mars (Red Planet)" Good: "Mars".
- There must be EXACTLY ONE correct answer. All 4 choices must be clearly distinct with no ambiguity. Never have two choices that could both be correct.`;
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

  // Show answer area for question mode or solo play mode
  if (currentMode === "question" || playMode === "solo") {
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
  if (playMode === "remote" || playMode === "solo") {
    // Remote or solo: no tabs, just text input
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
  voicePerPerson = {};
  clearVoiceRecording();
  answerArea.classList.add("show");
}

const answerWho = document.querySelector(".answer-who");
let voicePerPerson = {}; // { charlie: { blob, url, duration }, karla: ... }

[tabCharlie, tabKarla].forEach((tab) => {
  tab.addEventListener("click", () => {
    // Save current person's text + voice
    const text = answerText.textContent.trim();
    if (text) currentAnswers[currentWho] = text;
    if (recordingBlob) {
      voicePerPerson[currentWho] = { blob: recordingBlob, url: recordingURL, duration: recordDuration };
    }

    // Stop recording if active
    if (mediaRecorder && mediaRecorder.state === "recording") {
      stopVoiceRecording();
    }

    // Switch person
    currentWho = tab.dataset.who;
    tabCharlie.classList.toggle("active", currentWho === "charlie");
    tabKarla.classList.toggle("active", currentWho === "karla");
    answerWho.classList.toggle("karla-active", currentWho === "karla");

    // Restore text
    answerText.textContent = currentAnswers[currentWho] || "";

    // Restore voice
    const saved = voicePerPerson[currentWho];
    if (saved) {
      recordingBlob = saved.blob;
      recordingURL = saved.url;
      recordDuration = saved.duration;
      voiceAudio.src = recordingURL;
      showVoicePreview();
    } else {
      recordingBlob = null;
      recordingURL = null;
      voicePreview.classList.add("hidden");
    }

    updateSaveBtn();
    playTap();
  });
});

answerText.addEventListener("input", updateSaveBtn);
function updateSaveBtn() {
  const hasText = answerText.textContent.trim().length > 0;
  const hasVoice = recordingBlob !== null;
  saveBtn.classList.toggle("ready", hasText || hasVoice);
}

saveBtn.addEventListener("click", async () => {
  // If still recording, stop and wait for blob
  if (mediaRecorder && mediaRecorder.state === "recording") {
    await new Promise((resolve) => {
      mediaRecorder.onstop = () => {
        mediaRecorder.stream.getTracks().forEach((t) => t.stop());
        cancelAnimationFrame(liveWaveRAF);
        clearInterval(recordTimerInterval);
        recordingBlob = new Blob(audioChunks, { type: "audio/webm" });
        recordingURL = URL.createObjectURL(recordingBlob);
        voiceBtn.classList.remove("hidden");
        voiceRecording.classList.add("hidden");
        resolve();
      };
      mediaRecorder.stop();
    });
  }

  const text = answerText.textContent.trim();
  if (!text && !recordingBlob) return;
  playSelect();

  if (playMode === "solo") {
    // Solo: save immediately with identity
    let voiceURL = null;
    if (recordingBlob) {
      try {
        saveBtn.textContent = "Uploading...";
        voiceURL = await uploadVoice(recordingBlob);
      } catch (e) { /* silent */ }
    }
    const JOURNAL_KEY = "tayo_journal";
    let journal = JSON.parse(localStorage.getItem(JOURNAL_KEY) || "[]");
    journal.unshift({
      type: "solo",
      question: currentQuestion,
      who: myIdentity,
      answer: text || "",
      voiceURL: voiceURL || null,
      voiceDuration: voiceURL ? recordDuration : null,
      time: Date.now(),
    });
    if (journal.length > 200) journal = journal.slice(0, 200);
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
    syncJournalToFirebase();
    answerText.textContent = "";
    clearVoiceRecording();
    saveBtn.textContent = "Save";
    saveBtn.classList.remove("ready");
    answerArea.classList.remove("show");
    creatureCelebrate();
    return;
  } else if (playMode === "remote" && currentUser) {
    // Remote: upload voice if any, then save answer to Firebase
    let voiceURL = null;
    if (recordingBlob) {
      try {
        saveBtn.textContent = "Uploading...";
        voiceURL = await uploadVoice(recordingBlob);
      } catch (e) { /* silent */ }
      saveBtn.textContent = "Save";
    }
    const answerData = {
      text: text || "",
      voiceURL: voiceURL || null,
    };
    update(ref(db, "tayo/remote/questionAnswers"), {
      [myIdentity]: JSON.stringify(answerData),
      question: currentQuestion,
    });
    answerText.textContent = "";
    clearVoiceRecording();
    saveBtn.classList.remove("ready");
    $("remote-waiting").classList.remove("hidden");
    $("remote-waiting").textContent = `Waiting for ${myIdentity === "charlie" ? "Karla" : "Charlie"}...`;
  } else {
    // Together mode: normal flow
    let voiceURL = null;
    if (recordingBlob) {
      try {
        saveBtn.textContent = "Uploading...";
        voiceURL = await uploadVoice(recordingBlob);
      } catch (e) { /* silent */ }
      saveBtn.textContent = "Save";
    }
    currentAnswers[currentWho] = text || (voiceURL ? "Voice message" : "");
    if (voiceURL) {
      if (!currentAnswers._voices) currentAnswers._voices = {};
      currentAnswers._voices[currentWho] = voiceURL;
    }
    // Clear only this person's voice, preserve other's
    recordingBlob = null;
    recordingURL = null;
    voicePreview.classList.add("hidden");
    delete voicePerPerson[currentWho];
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

      // Restore other person's pending voice if they have one
      const saved = voicePerPerson[currentWho];
      if (saved) {
        recordingBlob = saved.blob;
        recordingURL = saved.url;
        recordDuration = saved.duration;
        voiceAudio.src = recordingURL;
        showVoicePreview();
      }
      answerText.textContent = currentAnswers[currentWho] || "";
      updateSaveBtn();
    }

    if (currentAnswers.charlie && currentAnswers.karla) {
      saveToJournal();
      creatureCelebrate();
    }
  }
});

function renderSavedAnswers() {
  savedAnswers.innerHTML = "";
  const voices = currentAnswers._voices || {};
  for (const who of ["charlie", "karla"]) {
    if (currentAnswers[who] || voices[who]) {
      const chip = document.createElement("div");
      chip.className = "saved-answer-chip";
      const label = who === "charlie" ? "C" : "K";
      const text = currentAnswers[who] && currentAnswers[who] !== "Voice message" ? currentAnswers[who] : "";
      const voiceURL = voices[who];

      chip.innerHTML = `
        <span class="sa-who">${label}</span>
        <div class="sa-content">
          ${text ? `<span class="sa-text">${text}</span>` : ""}
          ${voiceURL ? `
          <div class="sa-voice">
            <button class="sa-voice-play" onclick="const a=this.nextElementSibling;if(a.paused){a.play();this.querySelector('.material-symbols-rounded').textContent='pause'}else{a.pause();this.querySelector('.material-symbols-rounded').textContent='play_arrow'}">
              <span class="material-symbols-rounded" style="font-size:14px">play_arrow</span>
            </button>
            <audio src="${voiceURL}" onended="this.previousElementSibling.querySelector('.material-symbols-rounded').textContent='play_arrow'"></audio>
            <span class="sa-voice-label">Voice</span>
          </div>` : ""}
        </div>
      `;
      savedAnswers.appendChild(chip);
    }
  }
}

// ═══════════════════════════════════════
//  VOICE RECORDING
// ═══════════════════════════════════════
const voiceBtn = $("voice-btn");
const voiceRecording = $("voice-recording");
const voiceStopBtn = $("voice-stop-btn");
const voiceLiveWave = $("voice-live-wave");
const voiceTimer = $("voice-timer");
const voicePreview = $("voice-preview");
const voiceAudio = $("voice-audio");
const voicePlayBtn = $("voice-play-btn");
const voiceDeleteBtn = $("voice-delete-btn");
const voiceWaveform = $("voice-waveform");
const voiceDur = $("voice-dur");

let mediaRecorder = null;
let audioChunks = [];
let recordingBlob = null;
let recordingURL = null;
let recordTimerInterval = null;
let recordStartTime = 0;
let recordDuration = 0;
let analyser = null;
let liveWaveRAF = null;
const VOICE_MAX_SECONDS = 30;

voiceBtn.addEventListener("click", startVoiceRecording);
voiceStopBtn.addEventListener("click", stopVoiceRecording);

async function startVoiceRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Set up analyser for live waveform
    const ctx = getAudio();
    const source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);

    mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(liveWaveRAF);
      recordingBlob = new Blob(audioChunks, { type: "audio/webm" });
      recordingURL = URL.createObjectURL(recordingBlob);
      voiceAudio.src = recordingURL;
      showVoicePreview();
      updateSaveBtn();
    };

    mediaRecorder.start();

    // UI: switch to recording state
    voiceBtn.classList.add("hidden");
    voiceRecording.classList.remove("hidden");
    voicePreview.classList.add("hidden");
    saveBtn.classList.add("ready");

    // Build live bars
    voiceLiveWave.innerHTML = "";
    const barCount = 24;
    for (let i = 0; i < barCount; i++) {
      const bar = document.createElement("div");
      bar.className = "lbar";
      bar.style.height = "3px";
      voiceLiveWave.appendChild(bar);
    }

    // Animate live waveform
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    function drawLive() {
      analyser.getByteFrequencyData(dataArray);
      const bars = voiceLiveWave.querySelectorAll(".lbar");
      bars.forEach((bar, i) => {
        const val = dataArray[i % dataArray.length] / 255;
        bar.style.height = `${3 + val * 18}px`;
      });
      liveWaveRAF = requestAnimationFrame(drawLive);
    }
    drawLive();

    // Timer countdown
    recordStartTime = Date.now();
    recordDuration = 0;
    voiceTimer.textContent = `0:${String(VOICE_MAX_SECONDS).padStart(2, "0")}`;
    recordTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordStartTime) / 1000);
      recordDuration = elapsed;
      const left = Math.max(0, VOICE_MAX_SECONDS - elapsed);
      voiceTimer.textContent = `0:${String(left).padStart(2, "0")}`;
      if (elapsed >= VOICE_MAX_SECONDS) stopVoiceRecording();
    }, 500);

    playTap();
  } catch (e) {
    alert("Microphone access denied.");
  }
}

function stopVoiceRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }
  cancelAnimationFrame(liveWaveRAF);
  clearInterval(recordTimerInterval);
  voiceBtn.classList.remove("hidden");
  voiceRecording.classList.add("hidden");
  playTap();
}

async function showVoicePreview() {
  voicePreview.classList.remove("hidden");
  voiceWaveform.innerHTML = "";
  voiceDur.textContent = `0:${String(Math.round(recordDuration)).padStart(2, "0")}`;

  // Decode audio and extract real waveform
  try {
    const ctx = getAudio();
    const arrayBuffer = await recordingBlob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const rawData = audioBuffer.getChannelData(0);
    const bars = 28;
    const blockSize = Math.floor(rawData.length / bars);

    for (let i = 0; i < bars; i++) {
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(rawData[i * blockSize + j]);
      }
      const avg = sum / blockSize;
      const height = Math.max(3, Math.min(18, avg * 80));
      const bar = document.createElement("div");
      bar.className = "bar";
      bar.style.height = `${height}px`;
      voiceWaveform.appendChild(bar);
    }
  } catch (e) {
    for (let i = 0; i < 28; i++) {
      const bar = document.createElement("div");
      bar.className = "bar";
      bar.style.height = `${3 + Math.random() * 14}px`;
      voiceWaveform.appendChild(bar);
    }
  }
}

function clearVoiceRecording() {
  recordingBlob = null;
  if (recordingURL) { URL.revokeObjectURL(recordingURL); recordingURL = null; }
  voicePreview.classList.add("hidden");
  voiceAudio.src = "";
  updateSaveBtn();
}

voicePlayBtn.addEventListener("click", () => {
  if (voiceAudio.paused) {
    voiceAudio.play();
    voicePlayBtn.querySelector(".material-symbols-rounded").textContent = "pause";
  } else {
    voiceAudio.pause();
    voicePlayBtn.querySelector(".material-symbols-rounded").textContent = "play_arrow";
  }
});
voiceAudio.addEventListener("ended", () => {
  voicePlayBtn.querySelector(".material-symbols-rounded").textContent = "play_arrow";
});

voiceDeleteBtn.addEventListener("click", clearVoiceRecording);

// Upload voice to Firebase Storage
async function uploadVoice(blob) {
  const filename = `tayo/voices/${Date.now()}_${myIdentity}.webm`;
  const sRef = storageRef(storage, filename);
  await uploadBytes(sRef, blob);
  return await getDownloadURL(sRef);
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
  const voices = currentAnswers._voices || {};
  journal.unshift({
    question: currentQuestion,
    charlie: currentAnswers.charlie || "",
    karla: currentAnswers.karla || "",
    charlieVoiceURL: voices.charlie || null,
    karlaVoiceURL: voices.karla || null,
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
      const deleteBtn = `<button class="je-delete" data-idx="${idx}" title="Delete"><span class="material-symbols-rounded">delete</span></button>`;
      const REACT_EMOJIS = ["💕", "😂", "😮", "😢", "🥹", "😡"];
      // Helper: answer-level react button
      function answerReactHTML(entryIdx, answerKey) {
        const ar = e.answerReactions || {};
        const myReact = ar[answerKey]?.[myIdentity];
        if (myReact) {
          return `<button class="je-ans-react has-react" data-idx="${entryIdx}" data-answer="${answerKey}">${myReact}</button>`;
        }
        return `<button class="je-ans-react" data-idx="${entryIdx}" data-answer="${answerKey}"><span class="material-symbols-rounded" style="font-size:14px">add_reaction</span></button>`;
      }
      // Helper: answer actions (edit/delete own, add response to partner's)
      function answerActionsHTML(entryIdx, answerKey) {
        return `<div class="je-ans-actions">
          <button class="je-ans-action je-ans-edit" data-idx="${entryIdx}" data-answer="${answerKey}" title="Edit"><span class="material-symbols-rounded" style="font-size:13px">edit</span></button>
          <button class="je-ans-action je-ans-del" data-idx="${entryIdx}" data-answer="${answerKey}" title="Delete"><span class="material-symbols-rounded" style="font-size:13px">delete</span></button>
        </div>`;
      }
      const reactions = e.reactions || {};
      const reactionsHTML = (() => {
        const entries = Object.entries(reactions);
        if (entries.length === 0) return "";
        const emojis = entries.map(([,e]) => e);
        const unique = [...new Set(emojis)];
        const tooltipLines = entries.map(([who, emoji]) => `${who === "charlie" ? "Charlie" : "Karla"} ${emoji}`);
        return `<div class="je-reactions-float" data-idx="${idx}">
          <span class="je-react-emojis">${unique.map(e => `<span>${e}</span>`).join("")}</span>
          ${entries.length > 1 ? `<span class="je-react-count">${entries.length}</span>` : ""}
          <div class="je-react-tooltip">${tooltipLines.join("<br>")}</div>
        </div>`;
      })();
      const reactBtn = "";
      if (e.type === "solo") {
        const who = (e.who || "charlie");
        const whoLabel = who === "charlie" ? "Charlie" : "Karla";
        return `
          <div class="journal-entry solo-entry">
            <div class="je-header">
              <span class="je-icon"><span class="material-symbols-rounded">person</span></span>
              <span class="je-type-label">Solo — ${whoLabel}</span>
              <span class="je-time">${timeAgo(e.time)}</span>
              ${reactBtn}${deleteBtn}
            </div>
            <div class="je-question">${e.question}</div>
            <div class="je-answer-card">
              <span class="je-answer-name">${whoLabel}</span>
              ${answerReactHTML(idx, who)}
              ${answerActionsHTML(idx, who)}
              ${e.answer ? `<span class="je-answer-text">${e.answer}</span>` : ""}
              ${e.voiceURL ? `
              <div class="je-voice-player">
                <button class="je-voice-play" onclick="const a=this.parentElement.querySelector('audio');if(a.paused){a.play();this.querySelector('.material-symbols-rounded').textContent='pause'}else{a.pause();this.querySelector('.material-symbols-rounded').textContent='play_arrow'}">
                  <span class="material-symbols-rounded">play_arrow</span>
                </button>
                <div class="je-voice-bars">${Array.from({length:24},()=>`<div class="je-bar" style="height:${3+Math.random()*14}px"></div>`).join("")}</div>
                <span class="je-voice-dur">${e.voiceDuration ? `0:${String(Math.round(e.voiceDuration)).padStart(2,"0")}` : "--"}</span>
                <audio src="${e.voiceURL}"
                  onloadedmetadata="const d=this.parentElement.querySelector('.je-voice-dur');if(d.textContent==='--'){const s=Math.round(this.duration);d.textContent='0:'+String(s).padStart(2,'0')}"
                  ontimeupdate="const p=(this.currentTime/this.duration*100)||0;this.parentElement.style.setProperty('--progress',p+'%');const bars=this.parentElement.querySelectorAll('.je-bar');const played=Math.floor(bars.length*p/100);bars.forEach((b,i)=>b.style.opacity=i<played?'1':'0.35')"
                  onended="this.parentElement.querySelector('.je-voice-play .material-symbols-rounded').textContent='play_arrow';this.parentElement.style.setProperty('--progress','0%');this.parentElement.querySelectorAll('.je-bar').forEach(b=>b.style.opacity='1')"
                ></audio>
              </div>
              ` : ""}
            </div>
            ${(() => {
              const partner = who === "charlie" ? "karla" : "charlie";
              const partnerLabel = partner === "charlie" ? "Charlie" : "Karla";
              if (e.partnerReply) {
                return `
                  <div class="je-answer-card je-reply">
                    <span class="je-answer-name">${partnerLabel}'s reply</span>
                    <span class="je-answer-text">${e.partnerReply}</span>
                  </div>`;
              } else {
                return `
                  <div class="je-reply-prompt">
                    <button class="je-reply-btn" data-idx="${idx}">
                      <span class="material-symbols-rounded" style="font-size:14px">reply</span>
                      ${partnerLabel}, reply to this
                    </button>
                  </div>`;
              }
            })()}
            ${reactionsHTML}
          </div>
        `;
      }
      if (e.type === "quiz") {
        const correctAnswer = e.choices?.[e.correct] || "?";
        const cRight = e.charlieRight;
        const kRight = e.karlaRight;
        return `
          <div class="journal-entry">
            <div class="je-header">
              <span class="je-icon"><span class="material-symbols-rounded">quiz</span></span>
              <span class="je-type-label">Quiz</span>
              <span class="je-time">${timeAgo(e.time)}</span>
              ${reactBtn}${deleteBtn}
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
            ${reactionsHTML}
          </div>
        `;
      }
      return `
        <div class="journal-entry">
          <div class="je-header">
            <span class="je-icon"><span class="material-symbols-rounded">chat_bubble</span></span>
            <span class="je-type-label">Question</span>
            <span class="je-time">${timeAgo(e.time)}</span>
            ${reactBtn}${deleteBtn}
          </div>
          <div class="je-question">${e.question}</div>
          ${e.charlie ? `
            <div class="je-answer-card">
              <span class="je-answer-name">Charlie</span>
              ${answerReactHTML(idx, "charlie")}
              ${answerActionsHTML(idx, "charlie")}
              ${e.charlie && e.charlie !== "Voice message" ? `<span class="je-answer-text">${e.charlie}</span>` : ""}
              ${e.charlieVoiceURL ? `
              <div class="je-voice-player">
                <button class="je-voice-play" onclick="const a=this.parentElement.querySelector('audio');if(a.paused){a.play();this.querySelector('.material-symbols-rounded').textContent='pause'}else{a.pause();this.querySelector('.material-symbols-rounded').textContent='play_arrow'}">
                  <span class="material-symbols-rounded">play_arrow</span>
                </button>
                <div class="je-voice-bars">${Array.from({length:24},()=>`<div class="je-bar" style="height:${3+Math.random()*14}px"></div>`).join("")}</div>
                <span class="je-voice-dur">--</span>
                <audio src="${e.charlieVoiceURL}"
                  onloadedmetadata="const d=this.parentElement.querySelector('.je-voice-dur');const s=Math.round(this.duration);d.textContent='0:'+String(s).padStart(2,'0')"
                  ontimeupdate="const p=(this.currentTime/this.duration*100)||0;const bars=this.parentElement.querySelectorAll('.je-bar');const played=Math.floor(bars.length*p/100);bars.forEach((b,i)=>b.style.opacity=i<played?'1':'0.35')"
                  onended="this.parentElement.querySelector('.je-voice-play .material-symbols-rounded').textContent='play_arrow';this.parentElement.querySelectorAll('.je-bar').forEach(b=>b.style.opacity='1')"
                ></audio>
              </div>` : ""}
            </div>` : ""}
          ${e.karla ? `
            <div class="je-answer-card">
              <span class="je-answer-name">Karla</span>
              ${answerReactHTML(idx, "karla")}
              ${answerActionsHTML(idx, "karla")}
              ${e.karla && e.karla !== "Voice message" ? `<span class="je-answer-text">${e.karla}</span>` : ""}
              ${e.karlaVoiceURL ? `
              <div class="je-voice-player">
                <button class="je-voice-play" onclick="const a=this.parentElement.querySelector('audio');if(a.paused){a.play();this.querySelector('.material-symbols-rounded').textContent='pause'}else{a.pause();this.querySelector('.material-symbols-rounded').textContent='play_arrow'}">
                  <span class="material-symbols-rounded">play_arrow</span>
                </button>
                <div class="je-voice-bars">${Array.from({length:24},()=>`<div class="je-bar" style="height:${3+Math.random()*14}px"></div>`).join("")}</div>
                <span class="je-voice-dur">--</span>
                <audio src="${e.karlaVoiceURL}"
                  onloadedmetadata="const d=this.parentElement.querySelector('.je-voice-dur');const s=Math.round(this.duration);d.textContent='0:'+String(s).padStart(2,'0')"
                  ontimeupdate="const p=(this.currentTime/this.duration*100)||0;const bars=this.parentElement.querySelectorAll('.je-bar');const played=Math.floor(bars.length*p/100);bars.forEach((b,i)=>b.style.opacity=i<played?'1':'0.35')"
                  onended="this.parentElement.querySelector('.je-voice-play .material-symbols-rounded').textContent='play_arrow';this.parentElement.querySelectorAll('.je-bar').forEach(b=>b.style.opacity='1')"
                ></audio>
              </div>` : ""}
            </div>` : ""}
          ${reactionsHTML}
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
      const entry = journal[idx];

      // Remove from journal immediately
      journal.splice(idx, 1);
      localStorage.setItem("tayo_journal", JSON.stringify(journal));
      syncJournalToFirebase();

      // Animate out
      btn.closest(".journal-entry").style.transition = "opacity 0.3s, transform 0.3s";
      btn.closest(".journal-entry").style.opacity = "0";
      btn.closest(".journal-entry").style.transform = "translateX(30px)";
      setTimeout(() => { $("journal-hint").click(); }, 300);

      // Delete voice files from Firebase Storage in background (fire and forget)
      if (entry) {
        const voiceURLs = [entry.voiceURL, entry.charlieVoiceURL, entry.karlaVoiceURL].filter(Boolean);
        voiceURLs.forEach((url) => {
          try {
            const path = decodeURIComponent(url.split("/o/")[1]?.split("?")[0]);
            if (path) deleteObject(storageRef(storage, path)).catch(() => {});
          } catch {}
        });
      }
    });
  });

  // Reaction handlers
  const REACT_EMOJIS_LIST = ["💕", "😂", "😮", "😢", "🥹", "😡"];



  // Answer edit/delete handlers
  list.querySelectorAll(".je-ans-edit").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const key = btn.dataset.answer;
      const journal = JSON.parse(localStorage.getItem("tayo_journal") || "[]");
      const entry = journal[idx];
      if (!entry) return;
      const currentText = entry.type === "solo" ? entry.answer : entry[key];
      const card = btn.closest(".je-answer-card");
      const textEl = card.querySelector(".je-answer-text");
      if (!textEl) return;

      // Replace text with editable textarea
      const textarea = document.createElement("textarea");
      textarea.className = "je-edit-field";
      textarea.value = currentText || "";
      textarea.rows = 2;
      textEl.replaceWith(textarea);
      textarea.focus();
      textarea.style.height = textarea.scrollHeight + "px";
      textarea.addEventListener("input", () => { textarea.style.height = "auto"; textarea.style.height = textarea.scrollHeight + "px"; });

      // Save on blur or Enter
      const save = () => {
        const newText = textarea.value.trim();
        if (entry.type === "solo") { journal[idx].answer = newText; }
        else { journal[idx][key] = newText; }
        localStorage.setItem("tayo_journal", JSON.stringify(journal));
        syncJournalToFirebase();
        $("journal-hint").click();
      };
      textarea.addEventListener("blur", save);
      textarea.addEventListener("keydown", (e2) => { if (e2.key === "Enter" && !e2.shiftKey) { e2.preventDefault(); save(); } });
    });
  });

  list.querySelectorAll(".je-ans-del").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const key = btn.dataset.answer;
      const journal = JSON.parse(localStorage.getItem("tayo_journal") || "[]");
      if (!journal[idx]) return;

      if (journal[idx].type === "solo") {
        // Delete the whole solo entry
        const voiceURL = journal[idx].voiceURL;
        journal.splice(idx, 1);
        if (voiceURL) { try { const p = decodeURIComponent(voiceURL.split("/o/")[1]?.split("?")[0]); if (p) deleteObject(storageRef(storage, p)).catch(() => {}); } catch {} }
      } else {
        // Delete just this person's answer
        const voiceKey = key + "VoiceURL";
        const voiceURL = journal[idx][voiceKey];
        journal[idx][key] = "";
        if (voiceURL) { journal[idx][voiceKey] = null; try { const p = decodeURIComponent(voiceURL.split("/o/")[1]?.split("?")[0]); if (p) deleteObject(storageRef(storage, p)).catch(() => {}); } catch {} }
        // If both empty, remove entire entry
        if (!journal[idx].charlie && !journal[idx].karla) journal.splice(idx, 1);
      }

      localStorage.setItem("tayo_journal", JSON.stringify(journal));
      syncJournalToFirebase();
      $("journal-hint").click();
    });
  });

  // Answer-level react handlers
  list.querySelectorAll(".je-ans-react").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const answerKey = btn.dataset.answer;

      // If already reacted, tap to remove
      if (btn.classList.contains("has-react")) {
        const journal = JSON.parse(localStorage.getItem("tayo_journal") || "[]");
        if (journal[idx]?.answerReactions?.[answerKey]) {
          delete journal[idx].answerReactions[answerKey][myIdentity];
          localStorage.setItem("tayo_journal", JSON.stringify(journal));
          syncJournalToFirebase();
          $("journal-hint").click();
        }
        return;
      }

      // Show emoji picker near button
      document.querySelectorAll(".je-ans-picker").forEach((p) => p.remove());
      const picker = document.createElement("div");
      picker.className = "je-ans-picker";
      picker.innerHTML = REACT_EMOJIS_LIST.map((emoji) =>
        `<button class="je-react-emoji" data-emoji="${emoji}">${emoji}</button>`
      ).join("");
      btn.closest(".je-answer-card").appendChild(picker);
      requestAnimationFrame(() => picker.classList.add("show"));

      picker.querySelectorAll(".je-react-emoji").forEach((emojiBtn) => {
        emojiBtn.addEventListener("click", (e2) => {
          e2.stopPropagation();
          const journal = JSON.parse(localStorage.getItem("tayo_journal") || "[]");
          if (journal[idx]) {
            if (!journal[idx].answerReactions) journal[idx].answerReactions = {};
            if (!journal[idx].answerReactions[answerKey]) journal[idx].answerReactions[answerKey] = {};
            journal[idx].answerReactions[answerKey][myIdentity] = emojiBtn.dataset.emoji;
            localStorage.setItem("tayo_journal", JSON.stringify(journal));
            syncJournalToFirebase();
            $("journal-hint").click();
          }
        });
      });

      setTimeout(() => {
        const close = (e3) => {
          if (!picker.contains(e3.target)) {
            picker.classList.remove("show");
            setTimeout(() => picker.remove(), 200);
            document.removeEventListener("click", close);
          }
        };
        document.addEventListener("click", close);
      }, 10);
    });
  });

  // Floating reaction pill — tap to change, hold/hover for tooltip
  list.querySelectorAll(".je-reactions-float").forEach((el) => {
    let holdTimer = null;

    // Tap = show picker to change reaction
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      document.querySelectorAll(".je-float-picker").forEach((p) => p.remove());
      const idx = parseInt(el.dataset.idx);
      const picker = document.createElement("div");
      picker.className = "je-float-picker";
      picker.innerHTML = REACT_EMOJIS_LIST.map((emoji) =>
        `<button class="je-react-emoji" data-emoji="${emoji}">${emoji}</button>`
      ).join("");
      el.appendChild(picker);
      requestAnimationFrame(() => picker.classList.add("show"));

      picker.querySelectorAll(".je-react-emoji").forEach((emojiBtn) => {
        emojiBtn.addEventListener("click", (e2) => {
          e2.stopPropagation();
          const journal = JSON.parse(localStorage.getItem("tayo_journal") || "[]");
          if (journal[idx]) {
            if (!journal[idx].reactions) journal[idx].reactions = {};
            if (journal[idx].reactions[myIdentity] === emojiBtn.dataset.emoji) {
              delete journal[idx].reactions[myIdentity];
            } else {
              journal[idx].reactions[myIdentity] = emojiBtn.dataset.emoji;
            }
            localStorage.setItem("tayo_journal", JSON.stringify(journal));
            syncJournalToFirebase();
            $("journal-hint").click();
          }
        });
      });

      setTimeout(() => {
        const close = (e3) => {
          if (!picker.contains(e3.target)) {
            picker.classList.remove("show");
            setTimeout(() => picker.remove(), 200);
            document.removeEventListener("click", close);
          }
        };
        document.addEventListener("click", close);
      }, 10);
    });

    // Long press = show tooltip
    el.addEventListener("touchstart", () => {
      holdTimer = setTimeout(() => {
        const tip = el.querySelector(".je-react-tooltip");
        if (tip) { tip.classList.add("show"); setTimeout(() => tip.classList.remove("show"), 2500); }
      }, 500);
    });
    el.addEventListener("touchend", () => clearTimeout(holdTimer));
    el.addEventListener("touchmove", () => clearTimeout(holdTimer));
  });

  // Reply handlers
  list.querySelectorAll(".je-reply-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const replyInput = document.createElement("div");
      replyInput.className = "je-reply-input";
      replyInput.innerHTML = `
        <textarea class="je-reply-field" placeholder="Type your reply..." rows="1"></textarea>
        <button class="je-reply-send"><span class="material-symbols-rounded" style="font-size:16px">send</span></button>
      `;
      btn.replaceWith(replyInput);
      const field = replyInput.querySelector(".je-reply-field");
      field.focus();

      // Auto-expand
      field.addEventListener("input", () => {
        field.style.height = "auto";
        field.style.height = field.scrollHeight + "px";
      });

      replyInput.querySelector(".je-reply-send").addEventListener("click", () => {
        const reply = field.value.trim();
        if (!reply) return;
        const journal = JSON.parse(localStorage.getItem("tayo_journal") || "[]");
        if (journal[idx]) {
          journal[idx].partnerReply = reply;
          localStorage.setItem("tayo_journal", JSON.stringify(journal));
          syncJournalToFirebase();
          $("journal-hint").click(); // Re-render
        }
      });

      field.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") replyInput.querySelector(".je-reply-send").click();
      });
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
