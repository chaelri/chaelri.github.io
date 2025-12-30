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

    startGlobalPetalFall();
  });

  const revealWrappers = document.querySelectorAll(".reveal-wrapper");

  revealWrappers.forEach((wrapper) => {
    wrapper.addEventListener("click", function () {
      // Add the class to trigger CSS transitions
      this.classList.add("is-revealed");

      // Optional: Add a subtle haptic-like scale effect on click
      this.style.transform = "scale(0.98)";
      setTimeout(() => {
        this.style.transform = "";
      }, 100);
    });
  });

  const progressBar = document.getElementById("scroll-progress-bar");

  window.addEventListener(
    "scroll",
    () => {
      // Calculate how many pixels the user has scrolled
      const windowScroll =
        window.pageYOffset || document.documentElement.scrollTop;

      // Calculate the total scrollable height of the document
      const height =
        document.documentElement.scrollHeight -
        document.documentElement.clientHeight;

      // Convert to percentage
      const scrolled = (windowScroll / height) * 100;

      // Apply width to the bar
      if (progressBar) {
        progressBar.style.width = scrolled + "%";
      }
    },
    { passive: true }
  );

  const startGlobalPetalFall = () => {
    const colors = ["#7b8a5b", "#ffb7c5", "#fdfcf9", "#e2e8d8"]; // Sage, Pink, Cream

    // This function spawns 1-2 petals at a time from the top
    const frame = () => {
      confetti({
        particleCount: 1,
        startVelocity: 0, // Let them fall naturally from gravity
        ticks: 400, // How long they stay on screen
        origin: {
          x: Math.random(), // Random horizontal position
          y: -0.1, // Start slightly above the top of the screen
        },
        colors: [colors[Math.floor(Math.random() * colors.length)]],
        shapes: ["circle"], // Circles look most like falling petals
        gravity: 0.4, // Slow, dreamy fall
        scalar: Math.random() * (0.8 - 0.4) + 0.4, // Vary the size
        drift: Math.random() * (0.5 - -0.5) + -0.5, // Allow them to sway left/right
      });

      // Slow down the spawn rate so it's a "gentle drift" and not a storm
      // It spawns a new petal every ~400ms to ~800ms
      setTimeout(() => {
        requestAnimationFrame(frame);
      }, Math.random() * 400 + 400);
    };

    frame();
  };

  // --- THE ULTIMATE GALLERY ENGINE (NO JUMP + SWIPE) ---

  let scrollYMemory = 0; // Where we store your scroll position
  let currentImagesArray = [];
  let currentImgIndex = 0;
  let touchStartX = 0;

  // (Your attireData object remains exactly as you had it)
  const attireData = {
    "Best Man": [
      "./assets/attire/bestman-1.jpg",
      "./assets/attire/bestman-2.jpg",
      "./assets/attire/bestman-3.jpg",
    ],
    "Maid of Honor": [
      "./assets/attire/moh-1.jpg",
      "./assets/attire/moh-2.jpg",
      "./assets/attire/moh-3.jpg",
    ],
    Bridesmaids: [
      "./assets/attire/bm-1.jpg",
      "./assets/attire/bm-2.jpg",
      "./assets/attire/bm-3.jpg",
    ],
    Groomsmen: [
      "./assets/attire/gm-1.jpg",
      "./assets/attire/gm-2.jpg",
      "./assets/attire/gm-3.jpg",
    ],
    Mothers: [
      "./assets/attire/mothers-1.jpg",
      "./assets/attire/mothers-2.jpg",
      "./assets/attire/mothers-3.jpg",
    ],
    Fathers: [
      "./assets/attire/fathers-1.jpg",
      "./assets/attire/fathers-2.jpg",
      "./assets/attire/fathers-3.jpg",
    ],
    Ninangs: [
      "./assets/attire/ninangs-1.jpg",
      "./assets/attire/ninangs-2.jpg",
      "./assets/attire/ninangs-3.jpg",
    ],
    Ninongs: [
      "./assets/attire/ninongs-1.jpg",
      "./assets/attire/ninongs-2.jpg",
      "./assets/attire/ninongs-3.jpg",
    ],
    "Lady Guests": [
      "./assets/attire/lady-1.jpg",
      "./assets/attire/lady-2.jpg",
      "./assets/attire/lady-3.jpg",
    ],
    "Gentleman Guests": [
      "./assets/attire/gent-1.jpg",
      "./assets/attire/gent-2.jpg",
      "./assets/attire/gent-3.jpg",
    ],
  };

  // 1. OPEN MODAL
  document.querySelectorAll(".attire-album-card").forEach((card) => {
    card.addEventListener("click", () => {
      const role = card.getAttribute("data-role");
      const description = card.getAttribute("data-description");
      currentImagesArray = attireData[role] || [];
      currentImgIndex = 0;

      // STEP A: Capture Scroll Position
      scrollYMemory = window.pageYOffset || document.documentElement.scrollTop;

      // STEP B: Update Content
      document.getElementById("attireModalTitle").innerText = role;
      document.getElementById("attireModalDescription").innerText = description;
      document.getElementById("mainAttireImg").src = currentImagesArray[0];

      document.getElementById("attireThumbs").innerHTML = currentImagesArray
        .map(
          (src, index) => `
        <img src="${src}" class="attire-thumb ${index === 0 ? "active" : ""}" 
             onclick="window.updateGalleryView(${index})">
      `
        )
        .join("");

      // STEP C: Prevent Background Jump
      // We set the body to fixed BUT move it up by our scroll memory
      document.body.style.top = `-${scrollYMemory}px`;
      document.body.classList.add("modal-active");

      const modal = document.getElementById("attireModal");
      modal.style.display = "flex";
      setTimeout(() => (modal.style.opacity = "1"), 10);
    });
  });

  // 2. CLOSE MODAL
  window.closeAttireModal = () => {
    const modal = document.getElementById("attireModal");
    modal.style.opacity = "0";

    setTimeout(() => {
      modal.style.display = "none";

      // STEP D: Restore Scroll Position
      document.body.classList.remove("modal-active");
      document.body.style.top = "";
      window.scrollTo({
        top: scrollYMemory,
        left: 0,
        behavior: "instant",
      });
    }, 0);
  };

  // 3. NAVIGATION & THUMB SCROLL
  window.updateGalleryView = (index) => {
    if (index < 0 || index >= currentImagesArray.length) return;
    currentImgIndex = index;

    const mainImg = document.getElementById("mainAttireImg");

    mainImg.src = currentImagesArray[currentImgIndex];
    mainImg.style.opacity = "1";

    const thumbs = document.querySelectorAll(".attire-thumb");
    thumbs.forEach((t, i) => {
      t.classList.toggle("active", i === currentImgIndex);
      if (i === currentImgIndex) {
        // Scroll filmstrip only, not page
        t.parentNode.scrollTo({
          left: t.offsetLeft - t.parentNode.offsetWidth / 2 + t.offsetWidth / 2,
          behavior: "smooth",
        });
      }
    });
  };

  // 4. MESSENGER SWIPE LOGIC
  const modalArea = document.getElementById("attireModal");

  modalArea.addEventListener(
    "touchstart",
    (e) => {
      touchStartX = e.changedTouches[0].screenX;
    },
    { passive: true }
  );

  modalArea.addEventListener(
    "touchend",
    (e) => {
      const touchEndX = e.changedTouches[0].screenX;
      const diff = touchStartX - touchEndX;

      if (Math.abs(diff) > 60) {
        // Swipe sensitivity
        if (diff > 0)
          window.updateGalleryView(currentImgIndex + 1); // Left swipe
        else window.updateGalleryView(currentImgIndex - 1); // Right swipe
      }
    },
    { passive: true }
  );

  // --- 1. NAV MORE MENU LOGIC ---
  const moreTrigger = document.getElementById("more-trigger");
  const moreMenu = document.getElementById("more-menu");

  if (moreTrigger && moreMenu) {
    // Toggle menu when "More" is clicked
    moreTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = moreMenu.classList.contains("pointer-events-none");

      if (isHidden) {
        moreMenu.classList.remove(
          "opacity-0",
          "scale-95",
          "pointer-events-none"
        );
      } else {
        moreMenu.classList.add("opacity-0", "scale-95", "pointer-events-none");
      }
    });

    // NEW: Close menu when any option inside the dropdown is clicked
    moreMenu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        moreMenu.classList.add("opacity-0", "scale-95", "pointer-events-none");
      });
    });

    // Close menu when clicking anywhere else on the screen
    document.addEventListener("click", (e) => {
      if (!moreMenu.contains(e.target) && e.target !== moreTrigger) {
        moreMenu.classList.add("opacity-0", "scale-95", "pointer-events-none");
      }
    });
  }

  // --- 2. FAQ ACCORDION LOGIC ---
  const faqTriggers = document.querySelectorAll(".faq-trigger");

  faqTriggers.forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const content = trigger.nextElementSibling;
      const icon = trigger.querySelector(".material-icons-outlined");
      const item = trigger.closest(".faq-item");

      const isOpen = !content.classList.contains("hidden");

      // Close all others
      document
        .querySelectorAll(".faq-content")
        .forEach((c) => c.classList.add("hidden"));
      document
        .querySelectorAll(".faq-trigger .material-icons-outlined")
        .forEach((i) => {
          i.style.transform = "rotate(0deg)";
        });
      document.querySelectorAll(".faq-item").forEach((i) => {
        i.classList.remove("bg-white/80", "border-[#7b8a5b]/20");
      });

      // Toggle current
      if (!isOpen) {
        content.classList.remove("hidden");
        icon.style.transform = "rotate(180deg)";
        item.classList.add("bg-white/80", "border-[#7b8a5b]/20");
      }
    });
  });
});

// --- 2. FIREBASE & RSVP ---
get(child(ref(db), "guestList")).then((snapshot) => {
  if (snapshot.exists())
    masterGuestList = Object.values(snapshot.val()).map((g) => g.name);
});

// --- SMART RSVP TYPEAHEAD ---
const nameInput = document.getElementById("guestName");
const listContainer = document.getElementById("autocomplete-list");
let currentFocus = -1;

nameInput.addEventListener("input", function () {
  const val = this.value;
  closeAllLists();
  if (!val || val.length < 2) return;

  currentFocus = -1;
  const matches = masterGuestList.filter((n) =>
    n.toLowerCase().includes(val.toLowerCase())
  );

  if (matches.length > 0) {
    listContainer.classList.remove("hidden");

    // Add a "header" hint
    const hint = document.createElement("div");
    hint.className = "typeahead-hint";
    hint.innerText = "Please select your name";
    listContainer.appendChild(hint);

    matches.forEach((name) => {
      const div = document.createElement("div");
      div.className = "suggestion-item";

      // Highlight the matching part
      const matchIndex = name.toLowerCase().indexOf(val.toLowerCase());
      const before = name.substr(0, matchIndex);
      const middle = name.substr(matchIndex, val.length);
      const after = name.substr(matchIndex + val.length);

      div.innerHTML = `${before}<strong>${middle}</strong>${after}`;

      div.addEventListener("click", () => {
        nameInput.value = name;
        closeAllLists();
        // Optional: Automatically trigger focus on the next field
        document.getElementById("attendance").focus();
      });
      listContainer.appendChild(div);
    });
  }
});

// Support Arrow Keys and Enter
nameInput.addEventListener("keydown", function (e) {
  let items = listContainer.getElementsByClassName("suggestion-item");
  if (e.keyCode == 40) {
    // Down
    currentFocus++;
    addActive(items);
  } else if (e.keyCode == 38) {
    // Up
    currentFocus--;
    addActive(items);
  } else if (e.keyCode == 13) {
    // Enter
    e.preventDefault();
    if (currentFocus > -1 && items) items[currentFocus].click();
  }
});

function addActive(items) {
  if (!items) return false;
  removeActive(items);
  if (currentFocus >= items.length) currentFocus = 0;
  if (currentFocus < 0) currentFocus = items.length - 1;
  items[currentFocus].classList.add("is-active");
  items[currentFocus].scrollIntoView({ block: "nearest" });
}

function removeActive(items) {
  for (let i = 0; i < items.length; i++) {
    items[i].classList.remove("is-active");
  }
}

function closeAllLists() {
  listContainer.innerHTML = "";
  listContainer.classList.add("hidden");
  document.getElementById("nameErrorMsg").classList.add("hidden");
  nameInput.classList.remove("border-error");
}

// Close if user clicks away
document.addEventListener("click", (e) => {
  if (e.target !== nameInput) closeAllLists();
});

document.getElementById("rsvpForm").onsubmit = async (e) => {
  e.preventDefault();

  const typedName = nameInput.value.trim();
  const attendanceVal = document.getElementById("attendance").value;

  // 1. Check if name is in master list
  const isValid = masterGuestList.some(
    (n) => n.toLowerCase() === typedName.toLowerCase()
  );

  if (!isValid) {
    nameInput.classList.add("border-error", "shake");
    document.getElementById("nameErrorMsg").classList.remove("hidden");
    setTimeout(() => nameInput.classList.remove("shake"), 500);
    return;
  }

  // 2. PERSONALIZATION LOGIC
  const firstName = typedName.split(" ")[0];
  const nameEl = document.getElementById("res-name");
  const statusEl = document.getElementById("res-status");
  const noteEl = document.getElementById("res-note");

  if (attendanceVal === "yes") {
    nameEl.innerText = `Thank you, ${firstName}!`;
    statusEl.innerText = "Joyfully Accepts";
    statusEl.style.color = "#7b8a5b"; // Sage green
    noteEl.innerText =
      "We are so happy you're joining us! We can't wait to celebrate God's faithfulness with you this July.";
  } else {
    nameEl.innerText = `We'll miss you, ${firstName}.`;
    statusEl.innerText = "Regretfully Declines";
    statusEl.style.color = "#a8a29e"; // Stone color for declines
    noteEl.innerText =
      "We're sad we won't see you there, but we are so grateful for your love and prayers from afar!";
  }

  // 3. FIREBASE SUBMISSION
  try {
    await push(ref(db, "rsvps"), {
      guestName: typedName,
      attending: attendanceVal,
      submittedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Submission failed:", error);
    alert("Something went wrong. Please try again!");
    return;
  }

  // 4. UI TRANSITION (Hide form, show success)
  document.getElementById("rsvpForm").classList.add("hidden");
  const successMsg = document.getElementById("successMsg");
  successMsg.classList.remove("hidden");

  // 5. INJECT DIGITAL WAX SEAL
  const sealPlaceholder = document.getElementById("wax-seal-placeholder");
  if (sealPlaceholder) {
    // We use an <img> tag now instead of CSS divs
    sealPlaceholder.innerHTML = `
      <img src="./assets/monogram.png" alt="C&K Seal" class="wax-seal-img" />
    `;
  }

  // 7. CELEBRATION BURST
  // Fire a confetti burst centered on the RSVP box
  if (typeof confetti === "function") {
    confetti({
      particleCount: 300,
      spread: 70,
      origin: { y: 0.8 },
      colors: ["#7b8a5b", "#ffb7c5", "#fdfcf9"],
    });
  }

  // 8. SCROLL TO TOP OF MESSAGE
  // Wait 100ms for the form to hide and the message to render
  setTimeout(() => {
    const rsvpTop = document.getElementById("rsvp").offsetTop;
    window.scrollTo({
      top: rsvpTop - 50, // Scroll to the section with a little padding
      behavior: "smooth",
    });
  }, 100);

  // 0. DISCORD WEBHOOK LOGIC
  const DISCORD_WEBHOOK_URL =
    "https://discord.com/api/webhooks/1437276590726971544/kFU4J-RAvwzp2tNdPXFNZLPWms2GWoxGdGLXYBN4ZQd7FygY89sJu26Q_THSI-N5IPhG";

  const sendToDiscord = async (name, status) => {
    const color = status === "yes" ? 0x7b8a5b : 0xa8a29e; // Sage for Yes, Stone for No
    const emoji = status === "yes" ? "✅" : "❌";

    const payload = {
      embeds: [
        {
          title: `${emoji} New RSVP Received!`,
          description: `**${name}** has responded to the invitation.`,
          color: color,
          fields: [
            { name: "Guest Name", value: name, inline: true },
            {
              name: "Attendance",
              value:
                status === "yes" ? "Joyfully Accepts" : "Regretfully Declines",
              inline: true,
            },
          ],
          footer: { text: "Charlie & Karla Wedding" },
          timestamp: new Date().toISOString(),
        },
      ],
    };

    try {
      await fetch(DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error("Discord notification failed", err);
    }
  };

  // --- INTEGRATION ---
  // Put this line right after your Firebase push logic:
  await sendToDiscord(typedName, attendanceVal);
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

// ... (Your Intro, Firebase, and Countdown logic remains the same) ...

document.addEventListener("DOMContentLoaded", () => {
  // --- FIX 1: IOS SMOOTH SCROLL HELPER ---
  document.querySelectorAll('nav a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      const targetId = this.getAttribute("href");
      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        window.scrollTo({
          top: targetElement.offsetTop - 80, // Adjust for sticky nav height
          behavior: "smooth",
        });
      }
    });
  });

  // --- FIX 2: AUDIO TOGGLE (DIRECT ATTACHMENT FOR IOS) ---
  const audio = document.getElementById("courtshipAudio");
  const audioBtn = document.getElementById("audioToggle");
  const audioIcon = document.getElementById("audioIcon");
  const spinningFlower = document.getElementById("spinningFlower");
  const subtitleText = document.getElementById("audioSubtitles");
  // (Transcription array remains the same as before)
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
        audioIcon.innerText = "pause"; // Using Material Icon name
        spinningFlower.classList.add("animate-spin-slow");
      } else {
        audio.pause();
        audioIcon.innerText = "arrow_right"; // Using Material Icon name
        spinningFlower.classList.remove("animate-spin-slow");
      }
    });

    audio.addEventListener("timeupdate", () => {
      // Progress ring logic...
      const progressRing = document.getElementById("audioProgressRing");
      if (progressRing) {
        const percent = (audio.currentTime / audio.duration) * 100;
        const offset = 282.7 - (percent / 100) * 282.7;
        progressRing.style.strokeDashoffset = offset;
      }

      // Subtitle logic...
      let currentLine = transcription[0];
      for (let i = 0; i < transcription.length; i++) {
        if (audio.currentTime >= transcription[i].time)
          currentLine = transcription[i];
      }

      if (
        subtitleText &&
        subtitleText.getAttribute("data-current") !== currentLine.text
      ) {
        subtitleText.style.opacity = 0;
        setTimeout(() => {
          subtitleText.innerText = `"${currentLine.text}"`;
          subtitleText.setAttribute("data-current", currentLine.text);
          subtitleText.style.color =
            currentLine.speaker === "karla" ? "#FFB7C5" : "#7b8a5b";
          subtitleText.style.opacity = 1;
        }, 200);
      }
    });
  }

  // --- FIX 3: QR LIGHTBOX (MOVE FROM ONCLICK TO ADDEVENTLISTENER) ---
  const qrTriggers = document.querySelectorAll(".qr-trigger");
  const lightbox = document.getElementById("qrLightbox");

  qrTriggers.forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const src = trigger.getAttribute("data-src");
      const bank = trigger.getAttribute("data-bank");

      document.getElementById("lightboxImg").src = src;
      document.getElementById("lightboxTitle").innerText = bank;
      document.getElementById("downloadQR").href = src;

      lightbox.classList.remove("hidden");
      lightbox.style.display = "flex";
      document.body.style.overflow = "hidden";
      setTimeout(() => {
        lightbox.style.opacity = "1";
      }, 10);
    });
  });

  // Global Close Function
  window.closeQRModal = function () {
    lightbox.style.opacity = "0";
    setTimeout(() => {
      lightbox.classList.add("hidden");
      lightbox.style.display = "none";
      document.body.style.overflow = "auto";
    }, 300);
  };
});

// --- 4. SCROLL-TRIGGERED FLOWERS ---
document.addEventListener("DOMContentLoaded", () => {
  // Mapping: "When this ID is on screen" -> "Show this Flower ID"
  const flowerMap = {
    // Story Parts (You'll need to make sure these match your content)
    "story-part-1": "s-fl-5",
    "story-part-2": "s-fl-6",
    "story-part-3": "s-fl-7",
    "story-part-4": "s-fl-8",
    "story-part-5": "s-fl-9",
    "story-part-6": "s-fl-10",
    // Main Sections
    entourage: "s-fl-5",
    attire: "s-fl-6",
    schedule: "s-fl-7",
    gifting: "s-fl-8",
  };

  // Helper: To identify Story sections since they don't have IDs yet,
  // we find all large divs inside the #story section and give them IDs.
  const storyDivs = document.querySelectorAll("#story > div > div");
  storyDivs.forEach((div, index) => {
    div.id = `story-part-${index + 1}`;
  });

  const observerOptions = {
    threshold: 0.3, // Trigger when 30% of the part is visible
    rootMargin: "-5% 0px -5% 0px", // Slight buffer for smoother transitions
  };

  const scrollObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const flowerId = flowerMap[entry.target.id];
      if (!flowerId) return;

      const flowerElement = document.getElementById(flowerId);

      if (entry.isIntersecting) {
        // Show the flower linked to this section
        flowerElement.classList.add("is-active");
      } else {
        // Hide the flower when the section leaves
        flowerElement.classList.remove("is-active");
      }
    });
  }, observerOptions);

  // Tell observer to watch all mapped IDs
  Object.keys(flowerMap).forEach((id) => {
    const el = document.getElementById(id);
    if (el) scrollObserver.observe(el);
  });
});

// --- AUDIO ENDED RESET LOGIC ---
document.addEventListener("DOMContentLoaded", () => {
  const audio = document.getElementById("courtshipAudio");
  const audioIcon = document.getElementById("audioIcon");
  const spinningFlower = document.getElementById("spinningFlower");
  const subtitleText = document.getElementById("audioSubtitles");
  const progressRing = document.getElementById("audioProgressRing");

  if (audio) {
    audio.addEventListener("ended", () => {
      // 1. Reset the Icon to "replay" or "play"
      audioIcon.innerText = "replay";

      // 2. Stop the flower spinning
      spinningFlower.classList.remove("animate-spin-slow");

      // 3. Update the text to prompt the user
      subtitleText.style.opacity = 0;
      setTimeout(() => {
        subtitleText.innerText = '"Click to play again..."';
        subtitleText.style.color = "#7b8a5b"; // Reset to sage color
        subtitleText.style.opacity = 1;
      }, 300);

      // 4. Reset the Progress Ring visually
      if (progressRing) {
        progressRing.style.transition = "stroke-dashoffset 0.8s ease"; // Smooth reset
        progressRing.style.strokeDashoffset = "282.7";
      }

      // 5. Reset audio time so the next click starts from the beginning
      audio.currentTime = 0;
    });
  }
});

// --- 7. FINAL RSVP BOUQUET LOGIC ---
document.addEventListener("DOMContentLoaded", () => {
  const rsvpSection = document.getElementById("rsvp");
  if (!rsvpSection) return;

  const wrapper = document.createElement("div");
  wrapper.className = "bouquet-wrapper";

  for (let i = 5; i <= 10; i++) {
    const img = document.createElement("img");
    img.src = `./assets/${i}.png`;
    img.id = `bq-${i}`;
    img.className = "bq-flower";
    wrapper.appendChild(img);
  }

  rsvpSection.prepend(wrapper);

  const bqObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const flowers = wrapper.querySelectorAll(".bq-flower");
        if (entry.isIntersecting) {
          flowers.forEach((f, idx) => {
            setTimeout(() => {
              f.classList.add("is-bloomed");
            }, idx * 150); // Staggered pop-out
          });
        } else {
          flowers.forEach((f) => f.classList.remove("is-bloomed"));
        }
      });
    },
    { threshold: 0.2 }
  );

  bqObserver.observe(rsvpSection);
});

// --- SMART NAVIGATION (Show on scroll up, hide on scroll down) ---
let lastScrollTop = 0;
const mainNav = document.getElementById("main-nav");
const scrollThreshold = 50; // Minimum scroll before hiding

window.addEventListener(
  "scroll",
  () => {
    let currentScroll =
      window.pageYOffset || document.documentElement.scrollTop;

    // 1. Always show at the very top
    if (currentScroll <= 10) {
      mainNav.classList.remove("nav-hidden");
      return;
    }

    // 2. Hide on scroll down, show on scroll up
    if (currentScroll > lastScrollTop && currentScroll > scrollThreshold) {
      // Scrolling Down
      mainNav.classList.add("nav-hidden");
    } else {
      // Scrolling Up
      mainNav.classList.remove("nav-hidden");
    }

    lastScrollTop = currentScroll <= 0 ? 0 : currentScroll;
  },
  { passive: true }
);

// --- CONFETTI & SPRING DRIFT LOGIC ---
let driftInterval;
let hasBurst = false;

const startSpringDrift = () => {
  const end = Date.now() + 1000 * 60 * 5; // Drift for 5 minutes if they stay on section
  const colors = ["#7b8a5b", "#ffb7c5", "#fdfcf9", "#e2e8d8"]; // Your wedding palette

  (function frame() {
    confetti({
      particleCount: 1,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.6 }, // Left side
      colors: colors,
      ticks: 200,
      gravity: 0.5,
      scalar: 0.7,
      shapes: ["circle"],
    });
    confetti({
      particleCount: 1,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.6 }, // Right side
      colors: colors,
      ticks: 200,
      gravity: 0.5,
      scalar: 0.7,
      shapes: ["circle"],
    });

    // Loop if the section is still in view
    if (window.isForeverVisible) {
      driftInterval = setTimeout(() => {
        requestAnimationFrame(frame);
      }, 400); // Frequency of drifting particles
    }
  })();
};

const triggerCelebration = () => {
  // 1. The Big Burst
  const count = 200;
  const defaults = {
    origin: { y: 0.7 },
    colors: ["#7b8a5b", "#ffb7c5", "#d4a373"],
    shapes: ["circle", "square"],
    scalar: 1.2,
  };

  function fire(particleRatio, opts) {
    confetti(
      Object.assign({}, defaults, opts, {
        particleCount: Math.floor(count * particleRatio),
      })
    );
  }

  fire(0.25, { spread: 26, startVelocity: 55 });
  fire(0.2, { spread: 60 });
  fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
  fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
  fire(0.1, { spread: 120, startVelocity: 45 });
};

// --- OBSERVER FOR THE TRANSITION SECTION ---
const foreverSection = document.getElementById("forever-section");
window.isForeverVisible = false;

const foreverObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        window.isForeverVisible = true;

        // Trigger burst if it hasn't fired for this "visit"
        if (!hasBurst) {
          triggerCelebration();
          hasBurst = true; // Mark as fired so it doesn't loop infinitely while sitting there
        }

        // Start the continuous soft drift
        startSpringDrift();
      } else {
        // WHEN LEAVING THE VIEWPORT
        window.isForeverVisible = false;
        hasBurst = false; // RESET HERE: This allows it to fire again next time they scroll in
        clearTimeout(driftInterval);
      }
    });
  },
  {
    // Adjusted threshold: 0.5 means it fires when half the section is visible
    threshold: 0.5,
  }
);

if (foreverSection) foreverObserver.observe(foreverSection);

// --- SMART MEDIA CONTROLLER ---
const bgMusic = document.getElementById("bgMusic");
const musicToggle = document.getElementById("musicToggle");
const musicIcon = document.getElementById("musicIcon");
const courtshipAudio = document.getElementById("courtshipAudio");
const allVideos = document.querySelectorAll("video");

let isMusicMuted = false;

// 1. Initial Start (Triggered by the "Continue" button in your overlay)
const startBtn = document.getElementById("closeModalBtn");
startBtn.addEventListener("click", () => {
  bgMusic.volume = 0.4; // Set background music volume slightly lower
  bgMusic
    .play()
    .catch((e) => console.log("Autoplay blocked until interaction"));
});

// 2. Toggle Logic
musicToggle.addEventListener("click", () => {
  if (bgMusic.paused) {
    bgMusic.play();
    isMusicMuted = false;
    musicIcon.innerText = "volume_up";
  } else {
    bgMusic.pause();
    isMusicMuted = true;
    musicIcon.innerText = "volume_off";
  }
});

// 3. Prevent Overlap Function
const pauseBG = () => {
  if (!isMusicMuted) bgMusic.pause();
};
const resumeBG = () => {
  if (!isMusicMuted) bgMusic.play();
};

// Watch the Courtship Audio
if (courtshipAudio) {
  courtshipAudio.addEventListener("play", pauseBG);
  courtshipAudio.addEventListener("pause", resumeBG);
  courtshipAudio.addEventListener("ended", resumeBG);
}

// Watch all Videos (Proposal, SkyRanch, etc.)
allVideos.forEach((video) => {
  video.addEventListener("play", pauseBG);
  video.addEventListener("pause", resumeBG);
  video.addEventListener("ended", resumeBG);
});

// --- TRIVIA NOTES LOGIC ---
document.querySelectorAll(".trivia-note").forEach((note) => {
  note.addEventListener("click", () => {
    // Check if it's already open
    const isOpen = note.classList.contains("is-active");

    // Close all other notes first
    document
      .querySelectorAll(".trivia-note")
      .forEach((n) => n.classList.remove("is-active"));

    // Toggle current note
    if (!isOpen) {
      note.classList.add("is-active");

      // Fun: Trigger a tiny sparkle/confetti only on this note!
      confetti({
        particleCount: 20,
        spread: 30,
        origin: {
          x: note.getBoundingClientRect().left / window.innerWidth,
          y: note.getBoundingClientRect().top / window.innerHeight,
        },
        colors: ["#7b8a5b", "#ffb7c5"],
        scalar: 0.5,
      });
    }
  });
});

// --- DRAMATIC COUNTDOWN LOGIC ---
setInterval(() => {
  const targetDate = new Date("July 2, 2026 15:00:00").getTime();
  const now = new Date().getTime();
  const dist = targetDate - now;

  if (dist < 0) {
    document.getElementById("countdown-container").innerHTML =
      "<p class='serif italic text-2xl text-[#7b8a5b]'>Today is the Day!</p>";
    return;
  }

  const d = Math.floor(dist / (1000 * 60 * 60 * 24));
  const h = Math.floor((dist % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const m = Math.floor((dist % (1000 * 60 * 60)) / (1000 * 60));
  const s = Math.floor((dist % (1000 * 60)) / 1000);

  // Update elements with padding (e.g., 05 instead of 5)
  document.getElementById("days").innerText = d.toString().padStart(2, "0");
  document.getElementById("hours").innerText = h.toString().padStart(2, "0");
  document.getElementById("minutes").innerText = m.toString().padStart(2, "0");
  document.getElementById("seconds").innerText = s.toString().padStart(2, "0");
}, 1000);
