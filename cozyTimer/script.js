// --- CONFIG & STATE ---
const quotes = [
  "you are doing great ✨",
  "stay cozy, stay focused",
  "just breathe...",
  "every small step counts",
  "soft thoughts, sharp focus",
];
const emojiMap = {
  coffee: "☕",
  work: "💻",
  sleep: "😴",
  study: "📚",
  gym: "💪",
};

let timeLeft = 300;
let totalTime = 300;
let timerId = null;
let isRunning = false;
let isEditing = true;
let isAmbientPlaying = false;
let stars = parseInt(localStorage.getItem("stars")) || 0;
let totalMinutesSession = 0;
let blinkInterval = null;

// --- DOM ELEMENTS ---
const display = document.getElementById("timer-display");
const inputGroup = document.getElementById("input-group");
const minsInput = document.getElementById("minutes-input");
const secsInput = document.getElementById("seconds-input");
const playBtn = document.getElementById("play-pause-btn");
const playIcon = document.getElementById("play-icon");
const progressBar = document.getElementById("progress-bar");
const glassCard = document.getElementById("main-card");
const quoteEl = document.getElementById("zen-quote");
const starDisplay = document.getElementById("star-count");
const taskInput = document.getElementById("task-label");
const ambientAudio = document.getElementById("ambient-audio");
const bopSound = document.getElementById("bop-sound");
const finishSound = document.getElementById("finish-sound");
const modal = document.getElementById("times-up-modal");

// --- UTILS ---
function playBop() {
  bopSound.currentTime = 0;
  bopSound.volume = 0.4;
  bopSound.play().catch(() => {});
  if ("vibrate" in navigator) navigator.vibrate(10);
}

function updateDisplay() {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeStr = `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
  display.textContent = timeStr;

  // Ring Progress & Gradient Logic
  const progress = timeLeft / totalTime;
  progressBar.style.strokeDashoffset = isNaN(progress)
    ? 0
    : 753.98 - progress * 753.98;
  progressBar.style.stroke = progress < 0.2 ? "#ff85a2" : "#f472b6"; // Warmer at end

  if (timeLeft <= 10 && isRunning) display.classList.add("urgent-timer");
  else display.classList.remove("urgent-timer");

  document.title = isRunning ? `(${timeStr}) Cozy Focus` : "Cozy Timer ✨";
}

function cleanInputs() {
  let m = parseInt(minsInput.value) || 0;
  let s = parseInt(secsInput.value) || 0;
  if (s >= 60) {
    m += Math.floor(s / 60);
    s = s % 60;
    minsInput.value = m;
    secsInput.value = s.toString().padStart(2, "0");
  }
  timeLeft = m * 60 + s;
  totalTime = timeLeft;
}

// --- CORE LOGIC ---
function startTimer() {
  if (timeLeft <= 0) {
    glassCard.classList.add("shake");
    setTimeout(() => glassCard.classList.remove("shake"), 300);
    return;
  }
  cleanInputs();
  isEditing = false;
  isRunning = true;

  inputGroup.classList.add("hidden");
  display.classList.remove("hidden");
  playIcon.textContent = "pause";
  glassCard.classList.add("is-running");
  document.body.classList.add("is-running-active");

  setFavicon("⏳");
  updateQuote();

  timerId = setInterval(() => {
    timeLeft--;
    updateDisplay();
    if (timeLeft % 15 === 0) updateQuote();
    if (timeLeft <= 0) handleComplete();
  }, 1000);
}

function pauseTimer() {
  isRunning = false;
  clearInterval(timerId);
  playIcon.textContent = "play_arrow";
  glassCard.classList.remove("is-running");
  document.body.classList.remove("is-running-active");
  setFavicon("✨");
}

function handleComplete() {
  pauseTimer();
  // Star Logic
  stars++;
  localStorage.setItem("stars", stars);
  starDisplay.textContent = stars;
  document.getElementById("star-container").classList.add("star-pop");
  setTimeout(
    () =>
      document.getElementById("star-container").classList.remove("star-pop"),
    300
  );

  // Session Stats
  totalMinutesSession += Math.floor(totalTime / 60);
  document.getElementById(
    "session-total"
  ).textContent = `${totalMinutesSession}m total today`;

  // Modal & FX
  finishSound.play();
  modal.classList.add("active");
  spawnEmoji();

  // Tab Alert
  blinkInterval = setInterval(() => {
    document.title = document.title === "DONE! ✨" ? "Cozy Timer" : "DONE! ✨";
  }, 1000);
}

// --- MICRO-INTERACTIONS ---
function updateQuote() {
  if (!isRunning) return quoteEl.classList.remove("opacity-100");
  quoteEl.classList.remove("opacity-100");
  setTimeout(() => {
    quoteEl.textContent = quotes[Math.floor(Math.random() * quotes.length)];
    quoteEl.classList.add("opacity-100");
  }, 500);
}

function setFavicon(emoji) {
  const canvas = document.createElement("canvas");
  canvas.height = 32;
  canvas.width = 32;
  const ctx = canvas.getContext("2d");
  ctx.font = "28px serif";
  ctx.fillText(emoji, 0, 28);
  let link =
    document.querySelector("link[rel*='icon']") ||
    document.createElement("link");
  link.href = canvas.toDataURL();
  document.head.appendChild(link);
}

function spawnEmoji() {
  const emojis = ["✨", "🌸", "💫", "💖"];
  for (let i = 0; i < 15; i++) {
    const span = document.createElement("span");
    span.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    span.className = "absolute pointer-events-none text-xl z-50";
    span.style.left = Math.random() * 100 + "vw";
    span.style.top = "100vh";
    span.style.transition = `all ${Math.random() * 2 + 1}s ease-out`;
    document.body.appendChild(span);
    setTimeout(() => {
      span.style.transform = `translateY(-120vh) translateX(${
        (Math.random() - 0.5) * 100
      }px)`;
      span.style.opacity = "0";
    }, 50);
    setTimeout(() => span.remove(), 3000);
  }
}

// --- EVENT LISTENERS ---
playBtn.addEventListener("click", () => {
  playBop();
  isRunning ? pauseTimer() : startTimer();
});

document.getElementById("edit-toggle-btn").addEventListener("click", () => {
  playBop();
  if (isRunning) pauseTimer();
  isEditing = !isEditing;
  inputGroup.classList.toggle("hidden", !isEditing);
  display.classList.toggle("hidden", isEditing);
  document.getElementById("edit-icon").textContent = isEditing
    ? "done"
    : "edit";
  if (!isEditing) cleanInputs();
});

document.getElementById("reset-btn").addEventListener("click", () => {
  playBop();
  pauseTimer();
  timeLeft = totalTime;
  updateDisplay();
});

// Steppers, Wheel, Focus Auto-Select
function adjustTime(amount) {
  playBop();
  let m = parseInt(minsInput.value) || 0;
  let s = parseInt(secsInput.value) || 0;
  let total = m * 60 + s + amount;
  if (total < 0) total = 0;
  minsInput.value = Math.floor(total / 60);
  secsInput.value = (total % 60).toString().padStart(2, "0");
  timeLeft = total;
  totalTime = total;
  updateDisplay();
}

document
  .getElementById("min-up")
  .addEventListener("click", () => adjustTime(60));
document
  .getElementById("min-down")
  .addEventListener("click", () => adjustTime(-60));
document
  .getElementById("sec-up")
  .addEventListener("click", () => adjustTime(1));
document
  .getElementById("sec-down")
  .addEventListener("click", () => adjustTime(-1));

[minsInput, secsInput].forEach((input) => {
  input.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      adjustTime(
        e.deltaY < 0
          ? input === minsInput
            ? 60
            : 1
          : input === minsInput
          ? -60
          : -1
      );
    },
    { passive: false }
  );
  input.addEventListener("focus", () => input.select());
});

// Ambient & Task Persistence
document.getElementById("ambient-btn").addEventListener("click", () => {
  playBop();
  isAmbientPlaying = !isAmbientPlaying;
  isAmbientPlaying ? ambientAudio.play() : ambientAudio.pause();
  document.getElementById("ambient-icon").textContent = isAmbientPlaying
    ? "blur_on"
    : "water_drop";
});

taskInput.value = localStorage.getItem("savedTask") || "";
taskInput.addEventListener("input", (e) =>
  localStorage.setItem("savedTask", e.target.value)
);

// Aesthetic Interactions
document.addEventListener("mousemove", (e) => {
  const x = (window.innerWidth / 2 - e.pageX) / 40;
  const y = (window.innerHeight / 2 - e.pageY) / 40;
  document
    .querySelectorAll(".floating")
    .forEach((el) => (el.style.transform = `translate(${x}px, ${y}px)`));
});

glassCard.addEventListener("mousemove", (e) => {
  const { left, top, width, height } = glassCard.getBoundingClientRect();
  const x = (e.clientX - left) / width - 0.5;
  const y = (e.clientY - top) / height - 0.5;
  glassCard.style.transform = `perspective(1000px) rotateY(${
    x * 8
  }deg) rotateX(${-y * 8}deg)`;
});
glassCard.addEventListener(
  "mouseleave",
  () =>
    (glassCard.style.transform = `perspective(1000px) rotateY(0) rotateX(0)`)
);

// Keyboard Support
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" && e.target.tagName !== "INPUT") {
    e.preventDefault();
    playBop();
    isRunning ? pauseTimer() : startTimer();
  }
});

// Modal Close logic
document.getElementById("close-modal-btn").addEventListener("click", () => {
  playBop();
  clearInterval(blinkInterval);
  modal.classList.remove("active");
  timeLeft = totalTime;
  updateDisplay();
});

// Spawn Dust Motes
for (let i = 0; i < 15; i++) {
  const d = document.createElement("div");
  d.className = "dust";
  const size = Math.random() * 4 + "px";
  Object.assign(d.style, {
    width: size,
    height: size,
    left: Math.random() * 100 + "vw",
    animationDuration: Math.random() * 10 + 10 + "s",
    animationDelay: Math.random() * 5 + "s",
  });
  document.body.appendChild(d);
}

// Init
starDisplay.textContent = stars;
updateDisplay();
