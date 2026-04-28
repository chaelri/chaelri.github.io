// ============================================================
// EPISODE CONFIG
// ep:0 = Pre-Fall special (rendered as featured prologue card)
// ep:1..12 = Dusk-era main run
// ============================================================
const EPISODES = [
  { ep: 0,  title: "Pre-Fall",                                         fileId: "1IFCcDRlqAepZy6qBJlPvC8AKu4PcD_gG", dur: "~16:00", era: "prefall",
    blurb: "Before cryosleep. Before the apocalypse. The night Akira tried to tell Towasa what she already knew." },
  { ep: 1,  title: "The Day the Flowers Wilted",                       fileId: "1mV8eBu23fTWflRbdjDnDBsu0nBEs5rwH", dur: "~24:00", era: "dusk",
    blurb: "Akira and Towasa's friendship blooms into something more — until the world turns on her AI research." },
  { ep: 2,  title: "A Stranger Beneath an Unknown Sky",                fileId: "1Gsi9y2tZOfar05yo8PlSsF4CHKkHCjlJ", dur: "~24:00", era: "dusk",
    blurb: "Two hundred years late, Akira wakes to a world that decided his fate without him." },
  { ep: 3,  title: "An Android's Proposal",                            fileId: "1WxcDNQ6t42KNmMG3hdhZ7sDBHv03I7v3", dur: "~24:00", era: "dusk",
    blurb: "Yugure says marry me. A storybook artist says wait. Akira says he just wants to find her." },
  { ep: 4,  title: "When the Cage Opens",                              fileId: "1-Cnhh_PzW6-xcpPa_0QVkpX_pc0BsSPa", dur: "~24:00", era: "dusk",
    blurb: "OWEL has Amoru. A rescue is the smallest of their problems." },
  { ep: 5,  title: "His and Her Long Afternoon",                       fileId: "1N_6MYF_cY8ExacFEHDmuz352wfYkcLgf", dur: "~24:00", era: "dusk",
    blurb: "A double date. Family baggage. The kind of afternoon that becomes a memory." },
  { ep: 6,  title: "A Chance to Shout Love at World's End",            fileId: "1D3FzpWXxSnAvbANme6zOSwFsmnbh17lA", dur: "~24:00", era: "dusk",
    blurb: "Akira and Yugure go on a date. Amoru wrestles with what she feels watching them." },
  { ep: 7,  title: "Hymn to the Tome of the Budding Primate",          fileId: "1V4QheyKA9KMoDFZ1unK_pj_L1EAg_mQR", dur: "~24:00", era: "dusk",
    blurb: "Amoru hunts her parents' banned storybooks. The trail leads to a sealed library." },
  { ep: 8,  title: "The Faithless Swallow Succumbs to the Tides",      fileId: "1K9wEGiB2Mn4iqfxQIqFzXf2BZetrwKiv", dur: "~24:00", era: "dusk",
    blurb: "Out of the library, into hiding. OWEL doesn't forget." },
  { ep: 9,  title: "Staring Into the Horizon of the Past",             fileId: "1nixjMF_3o8_Ep_Y1hdvg3FF9iJ8B5NR-", dur: "~24:00", era: "dusk",
    blurb: "Sometimes love isn't enough. Especially when the lies were always there." },
  { ep: 10, title: "The Endless Twilight They Shared",                 fileId: "1iPjCkAH01XY6TFSeKvl-iQZP2o7mSNEB", dur: "~24:00", era: "dusk",
    blurb: "One act of violence. Two centuries later, the bullet still echoes." },
  { ep: 11, title: "Hold Back Your Tears, Said the Girl",              fileId: "16-KB6ff4uR7BBCz4TIMa_MbEHiBKHWd6", dur: "~24:00", era: "dusk",
    blurb: "Amoru wants to stay. The world keeps deciding she can't." },
  { ep: 12, title: "Your Love is Yours",                               fileId: "1IUylDVsgczkEu_ZzD79zCUVPy_yR6I8B", dur: "~24:00", era: "dusk",
    blurb: "Forever, finally, on someone's terms." },
];

function thumbUrl(fileId) {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w240`;
}

const QUOTES = [
  "\"Two hundred years asleep, and still I am looking for you.\"",
  "\"Are you still real, Towasa?\"",
  "\"Marriage? You don't even know what that means.\"",
  "\"The sky stays orange forever now.\"",
  "\"Even an android can love. Even a man can be lost.\"",
  "\"The sun never quite sets in this world.\"",
  "\"I want to find her. That's all that's left of me.\"",
  "\"Forever isn't long enough.\"",
  "\"A vow exchanged between human and machine.\"",
  "\"You are real to me. That is enough.\"",
];

// ============================================================
// DOM
// ============================================================
const player = document.getElementById("player");
const placeholder = document.getElementById("player-placeholder");
const nowPlaying = document.getElementById("now-playing");
const nowPlayingText = document.getElementById("now-playing-text");
const list = document.getElementById("episode-list");
const prefallContainer = document.getElementById("prefall-container");
const appBody = document.getElementById("app-body");
const introOverlay = document.getElementById("intro-overlay");

let currentEp = null; // index into EPISODES

// ============================================================
// INTRO ANIMATION (sun rising over horizon → fade)
// ============================================================
function playIntro() {
  const sun = document.getElementById("intro-sun");
  const horizon = document.getElementById("intro-horizon");
  const title = document.getElementById("intro-title");
  const sub = document.getElementById("intro-sub");
  const tag = document.getElementById("intro-tagline");

  setTimeout(() => { sun.style.opacity = "1"; sun.style.transform = "translateY(0) scale(1)"; }, 250);
  setTimeout(() => { horizon.style.opacity = "1"; }, 700);
  setTimeout(() => { title.style.opacity = "1"; title.style.transform = "translateY(0)"; }, 1200);
  setTimeout(() => { sub.style.opacity = "1"; sub.style.transform = "translateY(0)"; }, 1700);
  setTimeout(() => { tag.style.opacity = "1"; tag.style.transform = "translateY(0)"; }, 2150);

  setTimeout(() => {
    introOverlay.style.opacity = "0";
    appBody.style.opacity = "1";
    appBody.style.transform = "translateY(0)";
    setTimeout(() => { introOverlay.style.display = "none"; }, 800);
  }, 3300);
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
  if (h < 6)       { greet = "Late night drift…";       icon = "dark_mode"; }
  else if (h < 12) { greet = "Good morning";            icon = "wb_sunny"; }
  else if (h < 17) { greet = "Afternoon ember";         icon = "wb_sunny"; }
  else if (h < 21) { greet = "Yuugure — the dusk hour"; icon = "wb_twilight"; }
  else              { greet = "Late night drift…";      icon = "nights_stay"; }
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
setTimeout(typeQuote, 3500);

// ============================================================
// PLAYER
// ============================================================
function buildDriveUrl(fileId) {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

function playEpisode(index, { scroll = true } = {}) {
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
  const label = ep.ep === 0 ? `Prologue — ${ep.title}` : `EP ${String(ep.ep).padStart(2,"0")} — ${ep.title}`;
  nowPlayingText.textContent = label;

  document.querySelectorAll("[data-ep-index]").forEach((row) => {
    row.classList.toggle("active", parseInt(row.dataset.epIndex, 10) === index);
  });

  localStorage.setItem("towa_last_ep", index);
  if (scroll) {
    document.querySelector("nav").scrollIntoView({ behavior: "smooth", block: "start" });
  }
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
// PRE-FALL SPECIAL CARD (EP 00)
// ============================================================
(function renderPrefall() {
  const idx = EPISODES.findIndex((e) => e.ep === 0);
  if (idx < 0) return;
  const ep = EPISODES[idx];
  const card = document.createElement("button");
  card.className = "prefall-card reveal w-full flex items-center gap-3 sm:gap-4 text-left cursor-pointer";
  card.dataset.epIndex = String(idx);
  card.innerHTML = `
    <div class="ep-thumb shrink-0">
      <img src="${thumbUrl(ep.fileId)}" alt="Prologue" loading="lazy" />
      <div class="thumb-play">
        <span class="material-symbols-outlined text-white text-[28px] drop-shadow-lg">play_arrow</span>
      </div>
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 mb-1">
        <span class="prefall-tag">EP 00 · Special</span>
        <span class="now-badge items-center gap-1 text-[9px] font-bold tracking-widest uppercase text-prefall-ice bg-prefall-blue/15 px-1.5 py-0.5 rounded-full">playing</span>
      </div>
      <div class="ep-title display-title text-base sm:text-lg font-semibold text-white leading-snug">${ep.title}</div>
      <div class="ep-sub text-[12px] text-zinc-500 mt-1 leading-snug">${ep.blurb}</div>
      <div class="text-[10px] text-zinc-600 mt-1.5 flex items-center gap-2">
        <span class="material-symbols-outlined text-[12px]" style="color:#93c5fd;">schedule</span>
        <span>${ep.dur}</span>
        <span>·</span>
        <span style="color:#93c5fd;">Pre-Fall era · 2038</span>
      </div>
    </div>
  `;
  card.onclick = () => playEpisode(idx);
  prefallContainer.appendChild(card);
})();

// ============================================================
// MAIN EPISODE LIST (Dusk era, EP 01-12)
// ============================================================
EPISODES.forEach((ep, i) => {
  if (ep.ep === 0) return; // handled above
  const row = document.createElement("button");
  row.className =
    "ep-row reveal w-full flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 rounded-xl border border-transparent cursor-pointer text-left";
  row.style.transitionDelay = `${i * 0.04}s`;
  row.dataset.epIndex = String(i);
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
        <span>EP ${String(ep.ep).padStart(2,"0")}</span>
        <span>·</span>
        <span>${ep.dur}</span>
        <span class="now-badge items-center gap-1 text-[9px] font-bold tracking-widest uppercase text-dusk-amber bg-dusk-orange/10 px-1.5 py-0.5 rounded-full ml-1">playing</span>
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
// INIT — resume or default to prologue
// ============================================================
const lastEp = localStorage.getItem("towa_last_ep");
const startIdx = lastEp !== null ? parseInt(lastEp, 10) : 0;
if (startIdx >= 0 && startIdx < EPISODES.length) {
  setTimeout(() => playEpisode(startIdx, { scroll: false }), 3500);
}

// ============================================================
// FLOATING EMBERS (warm dust drifting up)
// ============================================================
const emberContainer = document.getElementById("embers");
const EMBER_COLORS = ["#f97316", "#fbbf24", "#fb923c", "#fde047", "#7c3aed"];

function spawnEmber() {
  const e = document.createElement("div");
  e.className = "ember";
  const size = 2 + Math.random() * 4;
  const color = EMBER_COLORS[Math.floor(Math.random() * EMBER_COLORS.length)];
  const left = Math.random() * 100;
  const duration = 9 + Math.random() * 7;
  e.style.cssText = `
    width:${size}px;height:${size}px;left:${left}%;bottom:-10px;
    background:${color};box-shadow:0 0 ${size*3}px ${color};
    animation:ember-rise ${duration}s ease-out forwards;`;
  emberContainer.appendChild(e);
  setTimeout(() => e.remove(), duration * 1000 + 100);
}

function emberLoop() {
  spawnEmber();
  setTimeout(emberLoop, 1500 + Math.random() * 2500);
}
setTimeout(emberLoop, 3500);

// ============================================================
// STARS (in the hero)
// ============================================================
const starContainer = document.getElementById("stars");
const STAR_COLORS = ["#fef3c7", "#fbbf24", "#fde68a", "#e9d5ff"];
for (let i = 0; i < 14; i++) {
  const dot = document.createElement("div");
  dot.className = "twinkle";
  const size = 1.5 + Math.random() * 2;
  const color = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
  const x = Math.random() * 100, y = Math.random() * 60;
  const dur = 3 + Math.random() * 4, delay = Math.random() * 4;
  dot.style.cssText = `
    width:${size}px;height:${size}px;left:${x}%;top:${y}%;
    background:${color};box-shadow:0 0 ${size*3}px ${color};
    animation: star-twinkle ${dur}s ${delay}s ease-in-out infinite;`;
  starContainer.appendChild(dot);
}

