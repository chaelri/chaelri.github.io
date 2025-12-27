import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  set,
  get,
  child,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBNPdSYJXuzvmdEHIeHGkbPmFnZxUq1lAg",
  authDomain: "charlie-karla-wedding.firebaseapp.com",
  databaseURL:
    "https://charlie-karla-wedding-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "charlie-karla-wedding",
  storageBucket: "charlie-karla-wedding.firebasestorage.app",
  messagingSenderId: "954582649260",
  appId: "1:954582649260:web:393fcc0fddafeb571f5209",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
let masterGuestList = [];

// --- 1. INTRO & FORCE TOP ---
document.addEventListener("DOMContentLoaded", () => {
  if (window.location.hash) {
    window.history.replaceState(null, null, window.location.pathname);
  }

  const overlay = document.getElementById("floral-overlay");
  const mono = document.getElementById("intro-monogram");
  const flowers = document.querySelectorAll(".floral-element");
  const modal = document.getElementById("welcomeModal");
  const closeBtn = document.getElementById("closeModalBtn");

  document.body.style.overflow = "hidden";

  // Step A: Monogram In
  setTimeout(() => {
    mono.style.opacity = "1";
  }, 500);

  // Step B: Flowers Glide In
  setTimeout(() => {
    mono.style.opacity = "0";
    flowers.forEach((f) => {
      f.classList.add("floral-center");
      // Wait for glide to finish, then start breathing
      setTimeout(() => {
        f.classList.add("floral-alive");
      }, 2000);
    });
  }, 2500);

  // Step C: Show Modal
  setTimeout(() => {
    modal.classList.remove("hidden");
    setTimeout(() => {
      modal.style.opacity = "1";
    }, 50);
  }, 4500);

  // Step D: Exit Sequence
  closeBtn.addEventListener("click", () => {
    document.body.style.overflow = "auto";
    overlay.style.pointerEvents = "none";
    modal.style.opacity = "0";

    setTimeout(() => {
      flowers.forEach((f) => {
        f.classList.remove("floral-alive"); // Stop breathing
        f.classList.remove("floral-center"); // Glide out
      });
    }, 200);

    overlay.style.transition = "background-color 2s ease, opacity 2.5s ease";
    overlay.style.backgroundColor = "transparent";
    window.scrollTo(0, 0);

    setTimeout(() => {
      overlay.style.opacity = "0";
      setTimeout(() => {
        overlay.style.display = "none";
      }, 2500);
    }, 500);
  });
});

// --- 2. FIREBASE & RSVP ---
get(child(ref(db), "guestList")).then((snapshot) => {
  if (snapshot.exists())
    masterGuestList = Object.values(snapshot.val()).map((g) => g.name);
});

const nameInput = document.getElementById("guestName");
const listContainer = document.getElementById("autocomplete-list");

nameInput.addEventListener("input", function () {
  const val = this.value;
  listContainer.innerHTML = "";
  listContainer.classList.add("hidden");
  if (!val || val.length < 2) return;
  const matches = masterGuestList.filter((n) =>
    n.toLowerCase().includes(val.toLowerCase())
  );
  if (matches.length > 0) {
    listContainer.classList.remove("hidden");
    matches.forEach((name) => {
      const div = document.createElement("div");
      div.className = "suggestion-item";
      div.innerHTML = `<strong>${name}</strong>`;
      div.onclick = () => {
        nameInput.value = name;
        listContainer.classList.add("hidden");
      };
      listContainer.appendChild(div);
    });
  }
});

document.getElementById("rsvpForm").onsubmit = async (e) => {
  e.preventDefault();
  const typedName = nameInput.value.trim();
  const isValid = masterGuestList.some(
    (n) => n.toLowerCase() === typedName.toLowerCase()
  );
  if (!isValid) {
    nameInput.classList.add("border-error", "shake");
    document.getElementById("nameErrorMsg").classList.remove("hidden");
    setTimeout(() => nameInput.classList.remove("shake"), 500);
    return;
  }
  await push(ref(db, "rsvps"), {
    guestName: typedName,
    attending: document.getElementById("attendance").value,
    submittedAt: new Date().toISOString(),
  });
  document.getElementById("rsvpForm").classList.add("hidden");
  document.getElementById("successMsg").classList.remove("hidden");
};

// --- 3. COUNTDOWN ---
setInterval(() => {
  const dist =
    new Date("July 2, 2026 15:00:00").getTime() - new Date().getTime();
  const days = Math.floor(dist / (1000 * 60 * 60 * 24));
  const hrs = Math.floor((dist % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((dist % (1000 * 60 * 60)) / (1000 * 60));
  const secs = Math.floor((dist % (1000 * 60)) / 1000);
  const el = document.getElementById("countdown");
  if (el) el.innerHTML = `${days}d ${hrs}h ${mins}m ${secs}s`;
}, 1000);

// --- 4. AUDIO TOGGLE LOGIC ---
document.addEventListener("DOMContentLoaded", () => {
  const audio = document.getElementById("courtshipAudio");
  const audioBtn = document.getElementById("audioToggle");
  const audioIcon = document.getElementById("audioIcon");
  const progressRing = document.getElementById("audioProgressRing");
  const subtitleText = document.getElementById("audioSubtitles");
  const spinningFlower = document.getElementById("spinningFlower");

  const radius = 45;
  const circumference = 2 * Math.PI * radius;

  // --- TRANSCRIPTION WITH SPEAKER COLORS ---
  const transcription = [
    {
      time: 0,
      speaker: "charlie",
      text: "Hi Karla, Gusto ko lang sabihin na...",
    },
    { time: 6, speaker: "charlie", text: "May gusto ako sa'yo." },
    { time: 7, speaker: "charlie", text: "Hahahahahaha sorry! Hahahahaha" },
    { time: 16, speaker: "charlie", text: "Ahaha" },
    {
      time: 19,
      speaker: "charlie",
      text: "Umm, ayan nakalagay diyan. Karla, I want to know you more and I'm here to ask",
    },
    { time: 25, speaker: "karla", text: "Bakit kailangan may presentation?" },
    {
      time: 27,
      speaker: "charlie",
      text: "'Di kasi ano lang yan, guideline lang!",
    },
    {
      time: 29,
      speaker: "charlie",
      text: "Ahaa! De I mean.. yeah. and I'm here to ask kung ano kung pwede manligaw",
    },
    {
      time: 35,
      speaker: "charlie",
      text: "Pero iih.. madaming slides yan, I mean di siya super. 34 slides lang!",
    },
  ];

  if (audioBtn) {
    audioBtn.addEventListener("click", () => {
      if (audio.paused) {
        audio.play();
        audioIcon.innerText = "⏸";
        spinningFlower.classList.add("animate-spin-slow");
      } else {
        audio.pause();
        audioIcon.innerText = "▶";
        spinningFlower.classList.remove("animate-spin-slow");
      }
    });

    audio.addEventListener("timeupdate", () => {
      // 1. Update Progress Ring
      const percent = (audio.currentTime / audio.duration) * 100;
      const offset = circumference - (percent / 100) * circumference;
      progressRing.style.strokeDashoffset = offset;

      // 2. Find Current Line
      let currentLine = transcription[0];
      for (let i = 0; i < transcription.length; i++) {
        if (audio.currentTime >= transcription[i].time) {
          currentLine = transcription[i];
        }
      }

      // 3. Update Text and Color if changed
      if (subtitleText.getAttribute("data-current") !== currentLine.text) {
        subtitleText.style.opacity = 0;

        setTimeout(() => {
          subtitleText.innerText = `"${currentLine.text}"`;
          subtitleText.setAttribute("data-current", currentLine.text);

          // APPLY SPEAKER COLOR
          if (currentLine.speaker === "karla") {
            subtitleText.style.color = "#FFB7C5"; // Spring Pink
          } else {
            subtitleText.style.color = "#7b8a5b"; // Sage Green
          }

          subtitleText.style.opacity = 1;
        }, 200);
      }
    });

    audio.onended = () => {
      audioIcon.innerText = "▶";
      spinningFlower.classList.remove("animate-spin-slow");
      progressRing.style.strokeDashoffset = circumference;
      subtitleText.innerText = "Click play to listen again...";
      subtitleText.style.color = "#a8a29e"; // Reset to stone gray
      subtitleText.setAttribute("data-current", "");
    };
  }
});

// ... (Your existing Intro, Firebase, Countdown, and Audio logic remains exactly the same) ...

// --- 5. QR LIGHTBOX LOGIC ---
// --- 5. QR LIGHTBOX LOGIC (FIXED FOR MODULE SCOPE) ---
window.openQRModal = function (imgSrc, bankName) {
  const lightbox = document.getElementById("qrLightbox");
  const lightboxImg = document.getElementById("lightboxImg");
  const lightboxTitle = document.getElementById("lightboxTitle");
  const downloadBtn = document.getElementById("downloadQR");

  if (!lightbox || !lightboxImg || !lightboxTitle || !downloadBtn) return;

  // Set content
  lightboxImg.src = imgSrc;
  lightboxTitle.innerText = bankName;
  downloadBtn.href = imgSrc;

  // Show modal
  lightbox.classList.remove("hidden");
  lightbox.style.display = "flex"; // Force flex display

  // Prevent background scrolling
  document.body.style.overflow = "hidden";

  // Trigger animation
  setTimeout(() => {
    lightbox.style.opacity = "1";
  }, 10);
};

window.closeQRModal = function () {
  const lightbox = document.getElementById("qrLightbox");
  if (!lightbox) return;

  lightbox.style.opacity = "0";

  setTimeout(() => {
    lightbox.classList.add("hidden");
    lightbox.style.display = "none";

    // Only re-enable scroll if the floral overlay is already gone
    const overlay = document.getElementById("floral-overlay");
    if (!overlay || overlay.style.display === "none") {
      document.body.style.overflow = "auto";
    }
  }, 300);
};
