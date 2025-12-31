const AUDIO_SRC = "./thejoy.mp3"; // Replace with your file
const HAPPYNEWYEAR_SRC = "./happynewyear.m4a"; // Replace with your file
const audio = document.getElementById("ny-audio");
const audio2 = document.getElementById("ny-audio2");
const startBtn = document.getElementById("startBtn");
const overlay = document.getElementById("overlay");
const flash = document.getElementById("flash-overlay");
const mainTitle = document.getElementById("main-title");
const grid = document.getElementById("countdown-grid");

let countdownInterval;
let audioPlayed = false;
let happyNewYearPlayed = false;

startBtn.addEventListener("click", () => {
  audio.src = AUDIO_SRC;
  audio2.src = HAPPYNEWYEAR_SRC;

  audio
    .play()
    .then(() => {
      audio.pause();
      audio.currentTime = 0;
    })
    .catch(() => {});
  audio2
    .play()
    .then(() => {
      audio2.pause();
      audio2.currentTime = 0;
    })
    .catch(() => {});

  overlay.classList.add("opacity-0");
  setTimeout(() => overlay.remove(), 1000);
  startCountdown();
});

function getTargetTime() {
  // Correct target: Midnight (00:00:00) Jan 1, 2026 PH Time
  return new Date("January 1, 2026 00:00:00").getTime();
}

function startCountdown() {
  const target = getTargetTime();
  countdownInterval = setInterval(() => {
    const now = Date.now();
    const diff = target - now;

    if (diff <= 0) {
      triggerHappyNewYear();
      clearInterval(countdownInterval);
      return;
    }

    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const ms = Math.floor((diff % 1000) / 10);

    document.getElementById("h").innerText = h.toString().padStart(2, "0");
    document.getElementById("m").innerText = m.toString().padStart(2, "0");
    document.getElementById("s").innerText = s.toString().padStart(2, "0");
    document.getElementById("ms").innerText = ms.toString().padStart(2, "0");
  }, 45);
}

function triggerHappyNewYear() {
  document
    .querySelectorAll(".glass div:first-child")
    .forEach((el) => (el.innerText = "00"));

  flash.classList.add("flash-active");

  if (!audioPlayed) {
    audio2.play()
    setTimeout(() => {
      audio.play();
    }, 1500);
    happyNewYearPlayed = true;
    audioPlayed = true;
  }

  mainTitle.innerHTML = `<span class="gold-text animate-celebrate block">HAPPY NEW YEAR!</span>`;
  mainTitle.style.fontSize = "clamp(3rem, 15vw, 9rem)";
  grid.style.transform = "scale(0.8)";
  grid.style.opacity = "0.4";
  document.getElementById("subtitle").innerText = "WELCOME TO 2026";
  document.getElementById(
    "status"
  ).innerHTML = `<span class="material-icons animate-bounce text-amber-500">auto_awesome</span>`;

  for (let i = 0; i < 150; i++) {
    setTimeout(createParticle, i * 40);
  }
}

function createParticle() {
  const p = document.createElement("div");
  p.classList.add("particle");
  const size = Math.random() * 4 + 2;
  p.style.width = `${size}px`;
  p.style.height = `${size}px`;
  p.style.left = Math.random() * 100 + "vw";
  p.style.top = "-10px";
  document.getElementById("particles-container").appendChild(p);

  p.animate(
    [
      { transform: "translateY(0) rotate(0deg)", opacity: 1 },
      {
        transform: `translateY(110vh) rotate(${Math.random() * 360}deg)`,
        opacity: 0,
      },
    ],
    {
      duration: Math.random() * 3000 + 2000,
      easing: "cubic-bezier(0, .9, .57, 1)",
    }
  ).onfinish = () => p.remove();
}
