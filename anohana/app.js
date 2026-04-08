// ============================================================
// EPISODE CONFIG
// ============================================================
const EPISODES = [
  { ep: 1,  title: "Super Peace Busters",            fileId: "1do98q2TiEmEPEiTGRHpwkz1lcBN3E7o4", dur: "22:30" },
  { ep: 2,  title: "Menma the Hero",                 fileId: "1JBF_WGlRfM5Ngf12hJFqgUu1ygESCMQ8", dur: "22:30" },
  { ep: 3,  title: "Menma Search Party",             fileId: "1FyjvidOlaSrpmbABYSuE3OTKB1YHkFk0", dur: "22:30" },
  { ep: 4,  title: "White Canvas with Black Letters", fileId: "1VDC4Ld5A_tubeEMQr76w-D0rEwuShgL4", dur: "22:30" },
  { ep: 5,  title: "Tunnel",                         fileId: "1-agBEw7YzPTrL-L_FcT_K2xntSdtRtDC", dur: "22:30" },
  { ep: 6,  title: "Forget-Me-Not Flower",           fileId: "1WghG0tMuyYgunjqj9j0tZCKRP2lGFlep", dur: "22:30" },
  { ep: 7,  title: "Who Calls the Real Thing",       fileId: "1xUkF8BIFfcdVVXr_5wxO7w-1s4eE_g7a", dur: "22:30" },
  { ep: 8,  title: "I Wonder",                       fileId: "19pstHxoVt5nAw5NYdnG114nzyUo-owwU", dur: "22:30" },
  { ep: 9,  title: "Menma and Everyone",             fileId: "1oUl627xWHY_j0b7C12__kpaqvhSaPHXu", dur: "22:30" },
  { ep: 10, title: "Fireworks",                      fileId: "1QOnMA_3otgaFd64CI9wawNB_elYbNc0I", dur: "22:30" },
  { ep: 11, title: "The Flower We Saw That Day",     fileId: "1mElvi6vWHj1rsQQO3ygXbafQR7nlZAUz", dur: "22:30" },
];

function thumbUrl(fileId) {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w240`;
}

const QUOTES = [
  "\"I wonder if the day will come when we'll all be together again.\"",
  "\"We still don't know the name of the flower we saw that day.\"",
  "\"You were always crying and running off somewhere.\"",
  "\"Even if I can't see you... I know you're there.\"",
  "\"I found you, Menma.\"",
  "\"The feelings we had that summer were real.\"",
  "\"It's not that I can't forget. It's that I don't want to.\"",
  "\"Even though the seasons change, our memories stay the same.\"",
  "\"We were just kids... but what we felt was real.\"",
  "\"Please don't forget about me.\"",
];

const SECRET_BASE_LYRICS = [
  "Kimi to natsu no owari shourai no yume...",
  "Ookina kibou wasurenai...",
  "Juunen go no hachigatsu...",
  "Mata deaeru no wo shinjite...",
  "Kimi ga saigo ni ookiku te wo futta...",
  "Sore wa mada dare mo shiranai...",
  "Ano hi mita hana no namae wo bokutachi wa mada shiranai...",
];

// ============================================================
// DOM
// ============================================================
const player = document.getElementById("player");
const placeholder = document.getElementById("player-placeholder");
const nowPlaying = document.getElementById("now-playing");
const nowPlayingText = document.getElementById("now-playing-text");
const list = document.getElementById("episode-list");
const appBody = document.getElementById("app-body");
const introOverlay = document.getElementById("intro-overlay");

let currentEp = null;

// ============================================================
// INTRO ANIMATION
// ============================================================
function playIntro() {
  const menma = document.getElementById("intro-menma");
  const title = document.getElementById("intro-title");
  const sub = document.getElementById("intro-sub");
  const flower = document.getElementById("intro-flower");

  // Stagger the intro elements
  setTimeout(() => { flower.style.opacity = "1"; flower.style.transform = "scale(1) rotate(0deg)"; }, 300);
  setTimeout(() => { menma.style.opacity = "1"; menma.style.transform = "translateY(0)"; }, 800);
  setTimeout(() => { title.style.opacity = "1"; title.style.transform = "translateY(0)"; }, 1400);
  setTimeout(() => { sub.style.opacity = "1"; sub.style.transform = "translateY(0)"; }, 1900);

  // Fade out intro, reveal app
  setTimeout(() => {
    introOverlay.style.opacity = "0";
    appBody.style.opacity = "1";
    appBody.style.transform = "translateY(0)";
    setTimeout(() => { introOverlay.style.display = "none"; }, 800);
  }, 3200);
}

playIntro();

// ============================================================
// TIME GREETING
// ============================================================
function setTimeGreeting() {
  const el = document.getElementById("time-greeting");
  if (!el) return;
  const h = new Date().getHours();
  let greet, icon;
  if (h < 6)       { greet = "Late night watching..."; icon = "dark_mode"; }
  else if (h < 12) { greet = "Good morning"; icon = "wb_sunny"; }
  else if (h < 17) { greet = "Good afternoon"; icon = "wb_sunny"; }
  else if (h < 21) { greet = "Evening vibes"; icon = "nights_stay"; }
  else              { greet = "Late night watching..."; icon = "dark_mode"; }
  el.innerHTML = `<span class="material-symbols-outlined text-[12px] align-middle mr-1">${icon}</span>${greet}`;
}
setTimeGreeting();

// ============================================================
// TYPING QUOTE
// ============================================================
function typeQuote() {
  const el = document.querySelector(".quote-text");
  if (!el) return;
  const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  let i = 0;
  el.textContent = "";
  el.classList.remove("quote-done");
  function tick() {
    if (i <= quote.length) {
      el.textContent = quote.slice(0, i);
      i++;
      setTimeout(tick, 35 + Math.random() * 25);
    } else {
      el.classList.add("quote-done");
      setTimeout(typeQuote, 8000);
    }
  }
  tick();
}
setTimeout(typeQuote, 3500); // start after intro

// ============================================================
// PLAYER
// ============================================================
function buildDriveUrl(fileId) {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

function playEpisode(index) {
  const ep = EPISODES[index];
  if (!ep) return;
  currentEp = index;

  player.style.opacity = "0";
  setTimeout(() => {
    player.src = buildDriveUrl(ep.fileId);
    placeholder.classList.add("hidden");
    player.onload = () => { player.style.opacity = "1"; };
  }, 200);

  nowPlaying.classList.remove("hidden");
  nowPlayingText.textContent = `EP ${ep.ep} — ${ep.title}`;


  document.querySelectorAll(".ep-row").forEach((row, i) => {
    row.classList.toggle("active", i === index);
  });

  localStorage.setItem("anohana_last_ep", index);
  document.querySelector("nav").scrollIntoView({ behavior: "smooth", block: "start" });
}

function playNext() {
  if (currentEp === null) return playEpisode(0);
  if (currentEp < EPISODES.length - 1) playEpisode(currentEp + 1);
}

function playPrev() {
  if (currentEp === null) return;
  if (currentEp > 0) playEpisode(currentEp - 1);
}

// ============================================================
// EPISODE LIST
// ============================================================
EPISODES.forEach((ep, i) => {
  const row = document.createElement("button");
  row.className =
    "ep-row reveal w-full flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 rounded-xl border border-transparent cursor-pointer text-left";
  row.style.transitionDelay = `${i * 0.04}s`;
  row.innerHTML = `
    <div class="ep-thumb shrink-0">
      <img src="${thumbUrl(ep.fileId)}" alt="EP ${ep.ep}" loading="lazy" />
      <div class="thumb-play">
        <span class="material-symbols-outlined text-white text-[28px] drop-shadow-lg">play_arrow</span>
      </div>
    </div>
    <div class="flex-1 min-w-0">
      <div class="ep-title text-sm font-semibold text-zinc-300 truncate">${ep.title}</div>
      <div class="ep-sub text-[11px] text-zinc-600 mt-0.5 flex items-center gap-2">
        <span>EP ${ep.ep}</span>
        <span>·</span>
        <span>${ep.dur}</span>
        <span class="now-badge items-center gap-1 text-[9px] font-bold tracking-widest uppercase text-ano-red bg-ano-red/10 px-1.5 py-0.5 rounded-full ml-1">playing</span>
      </div>
    </div>
  `;
  row.onclick = () => playEpisode(i);
  list.appendChild(row);
});

// ============================================================
// SCROLL REVEAL
// ============================================================
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
);
document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));

// ============================================================
// INIT — resume or default to EP 1
// ============================================================
const lastEp = localStorage.getItem("anohana_last_ep");
const startIdx = lastEp !== null ? parseInt(lastEp, 10) : 0;
if (startIdx >= 0 && startIdx < EPISODES.length) {
  setTimeout(() => playEpisode(startIdx), 3400); // after intro finishes
}

// ============================================================
// FLOATING PETALS
// ============================================================
const petalContainer = document.getElementById("petals");
const PETAL_COLORS = ["#e53935", "#ef9a9a", "#f48fb1", "#ce93d8", "#90caf9"];

function createPetalSVG(color) {
  return `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 1C10 1 4 5 4 10C4 13.3 6.7 16 10 16C13.3 16 16 13.3 16 10C16 5 10 1 10 1Z" fill="${color}" opacity="0.8"/>
  </svg>`;
}

function spawnPetal() {
  const petal = document.createElement("div");
  petal.className = "petal";
  const size = 10 + Math.random() * 14;
  const color = PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)];
  const left = Math.random() * 100;
  const duration = 8 + Math.random() * 7;
  petal.style.cssText = `width:${size}px;height:${size}px;left:${left}%;top:-20px;animation:petal-fall ${duration}s ease-in forwards;`;
  petal.innerHTML = createPetalSVG(color);
  petalContainer.appendChild(petal);
  setTimeout(() => petal.remove(), duration * 1000 + 100);
}

function petalLoop() {
  spawnPetal();
  setTimeout(petalLoop, 2000 + Math.random() * 3000);
}
setTimeout(petalLoop, 3500);

// ============================================================
// FIREFLIES
// ============================================================
const fireflyContainer = document.getElementById("fireflies");
const FIREFLY_COLORS = ["#e53935", "#1e88e5", "#ffab40", "#e0e0e0"];

for (let i = 0; i < 12; i++) {
  const dot = document.createElement("div");
  dot.className = "firefly";
  const size = 2 + Math.random() * 3;
  const color = FIREFLY_COLORS[Math.floor(Math.random() * FIREFLY_COLORS.length)];
  const x = Math.random() * 100, y = Math.random() * 100;
  const dur = 4 + Math.random() * 6, delay = Math.random() * 5;
  const fx = (Math.random() - 0.5) * 60, fy = (Math.random() - 0.5) * 40;
  dot.style.cssText = `width:${size}px;height:${size}px;left:${x}%;top:${y}%;background:${color};box-shadow:0 0 ${size*3}px ${color};--fx:${fx}px;--fy:${fy}px;animation:firefly-float ${dur}s ${delay}s ease-in-out infinite;`;
  fireflyContainer.appendChild(dot);
}

// ============================================================
// MENMA PEEKING
// ============================================================
const MENMA_IMGS = ["menma2.png", "menma3.png"];

function menmaAppear() {
  const container = document.getElementById("menma-container");
  const sides = ["from-right", "from-left", "from-bottom", "from-top-right"];
  const side = sides[Math.floor(Math.random() * sides.length)];
  const img = MENMA_IMGS[Math.floor(Math.random() * MENMA_IMGS.length)];

  const el = document.createElement("div");
  el.className = `menma-peek ${side}`;
  el.innerHTML = `<img src="${img}" style="width:80px;filter:drop-shadow(0 0 12px rgba(229,57,53,0.25));" alt="Menma" />`;
  container.appendChild(el);

  // Peek in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add("show"));
  });

  // Hide after a few seconds
  const stayTime = 3000 + Math.random() * 3000;
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 1000);
  }, stayTime);
}

// Menma peeks — TEST MODE (frequent)
function menmaLoop() {
  const delay = 5000 + Math.random() * 5000; // every 5–10s for testing
  setTimeout(() => {
    menmaAppear();
    menmaLoop();
  }, delay);
}
// First peek after 3s
setTimeout(() => { menmaAppear(); menmaLoop(); }, 3000);

// ============================================================
// SECRET BASE FLOATING LYRICS
// ============================================================
function floatLyric() {
  const lyric = SECRET_BASE_LYRICS[Math.floor(Math.random() * SECRET_BASE_LYRICS.length)];
  const el = document.createElement("div");
  el.className = "floating-lyric";
  el.textContent = lyric;
  el.style.top = (20 + Math.random() * 60) + "vh";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 12500);
}

function lyricLoop() {
  const delay = 20000 + Math.random() * 40000;
  setTimeout(() => { floatLyric(); lyricLoop(); }, delay);
}
setTimeout(lyricLoop, 10000);
