# Wedding Invitation — Recurring Patterns

## 1. Modal Open/Close (Scroll Lock)

**ALL modals follow this pattern:**

```js
// Open
scrollYMemory = window.pageYOffset;
document.body.style.top = `-${scrollYMemory}px`;
document.body.classList.add("modal-active");
modal.style.display = "flex";
setTimeout(() => (modal.style.opacity = "1"), 10);  // CSS transition

// Close
modal.style.opacity = "0";
setTimeout(() => {
  modal.style.display = "none";
  document.body.classList.remove("modal-active");
  document.body.style.top = "";
  window.scrollTo({ top: scrollYMemory, behavior: "instant" });
}, 300);
```

Used by: Attire Gallery (`#attireModal`), Story Images (reuses `#attireModal`), QR Lightbox (`#qrLightbox`), Welcome Modal (custom timing).

**CSS:**
```css
.modal-active {
  position: fixed;
  overflow: hidden;
}
```

## 2. Animation Trigger (IntersectionObserver)

```js
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("revealed");
        if (entry.target.id === "forever-section") triggerCelebration();
      } else {
        entry.target.classList.remove("revealed");
      }
    });
  },
  { threshold: 0.5 }
);

document.querySelectorAll(".reveal-wrapper, section[id]").forEach((el) => {
  revealObserver.observe(el);
});
```

**CSS:**
```css
.revealed {
  animation: fadeInUp 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
}
```

## 3. Form Validation (Multi-Step)

```js
// 1. Live autocomplete
inputField.addEventListener("input", (e) => {
  const val = e.target.value;
  suggestionsList.innerHTML = "";
  if (!val || val.length < 2) { suggestionsList.classList.add("hidden"); return; }
  const matches = masterGuestList.filter(name => name.toLowerCase().includes(val.toLowerCase()));
  if (!matches.length) return;
  suggestionsList.classList.remove("hidden");
  matches.forEach(match => {
    const div = document.createElement("div");
    div.className = "suggestion-item";
    const idx = match.toLowerCase().indexOf(val.toLowerCase());
    div.innerHTML = `${match.substring(0, idx)}<strong>${match.substring(idx, idx + val.length)}</strong>${match.substring(idx + val.length)}`;
    div.addEventListener("click", () => {
      inputField.value = match;
      suggestionsList.classList.add("hidden");
    });
    suggestionsList.appendChild(div);
  });
});

// 2. Submit validation
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = inputField.value.trim();
  const isValid = masterGuestList.some(n => n.toLowerCase() === name.toLowerCase());

  if (!isValid) {
    inputField.classList.add("border-error", "shake");
    document.getElementById("nameErrorMsg").classList.remove("hidden");
    setTimeout(() => inputField.classList.remove("shake"), 500);
    return;
  }

  // 3. Success
  await submitToFirebase(name);
  form.classList.add("hidden");
  successMsg.classList.remove("hidden");
  confetti({ /* config */ });
});
```

## 4. Confetti Variants

**1. Continuous Petal Drift (after intro):**
```js
const startGlobalPetalFall = () => {
  const colors = ["#7b8a5b", "#ffb7c5", "#fdfcf9", "#e2e8d8"];
  const frame = () => {
    confetti({
      particleCount: 1, startVelocity: 0, ticks: 1000,
      origin: { x: Math.random(), y: -0.1 },
      colors: [colors[Math.floor(Math.random() * colors.length)]],
      shapes: ["circle"], gravity: 0.4,
      scalar: Math.random() * (0.8 - 0.4) + 0.4,
      drift: Math.random() * (0.5 - -0.5) + -0.5,
    });
    setTimeout(() => requestAnimationFrame(frame), Math.random() * 400 + 400);
  };
  frame();
};
```

**2. RSVP Burst (celebration):**
```js
confetti({
  particleCount: 300, spread: 70, origin: { y: 0.8 },
  colors: ["#7b8a5b", "#ffb7c5", "#fdfcf9"],
  shapes: ["circle", "square"], scalar: 1.2
});
```

**3. Forever Section Drift (sides):**
```js
confetti({ particleCount: 1, angle: 60, spread: 55, origin: { x: 0, y: 0.6 }, ...});  // Left
confetti({ particleCount: 1, angle: 120, spread: 55, origin: { x: 1, y: 0.6 }, ...}); // Right
```

**4. Trivia Sparkle (localized):**
```js
confetti({
  particleCount: 20, spread: 30,
  origin: {
    x: note.getBoundingClientRect().left / window.innerWidth,
    y: note.getBoundingClientRect().top / window.innerHeight
  },
  colors: ["#7b8a5b", "#ffb7c5"], scalar: 0.5
});
```

## 5. Image Gallery (Attire/Story)

**Three-part system:**

```js
// PART 1: Data
const attireData = { "Best Man": ["./assets/attire/bestman-1.jpg", ...], ... };

// PART 2: Open
card.addEventListener("click", () => {
  const role = card.getAttribute("data-role");
  currentImagesArray = attireData[role] || [];
  currentImgIndex = 0;
  scrollYMemory = window.pageYOffset;
  // ... update modal, render thumbnails
  // Lock background + show modal
});

// PART 3: Navigate
window.updateGalleryView = (index) => {
  if (index < 0 || index >= currentImagesArray.length) return;
  currentImgIndex = index;
  mainImg.src = currentImagesArray[currentImgIndex];
  // Update active thumbnail + scroll into view
};

// PART 4: Swipe (Touch)
modal.addEventListener("touchstart", (e) => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
modal.addEventListener("touchend", (e) => {
  const diff = touchStartX - e.changedTouches[0].screenX;
  if (Math.abs(diff) > 60) {
    if (diff > 0) updateGalleryView(currentImgIndex + 1);
    else updateGalleryView(currentImgIndex - 1);
  }
}, { passive: true });
```

## 6. Dropdown Menu

```js
trigger.addEventListener("click", (e) => {
  e.stopPropagation();
  const isHidden = menu.classList.contains("pointer-events-none");
  if (isHidden) menu.classList.remove("opacity-0", "scale-95", "pointer-events-none");
  else menu.classList.add("opacity-0", "scale-95", "pointer-events-none");
});

menu.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => menu.classList.add("opacity-0", "scale-95", "pointer-events-none"));
});

document.addEventListener("click", (e) => {
  if (!menu.contains(e.target) && e.target !== trigger) {
    menu.classList.add("opacity-0", "scale-95", "pointer-events-none");
  }
});
```

## 7. Accordion (FAQ)

```js
faqTriggers.forEach((trigger) => {
  trigger.addEventListener("click", () => {
    const content = trigger.nextElementSibling;
    const icon = trigger.querySelector(".material-icons-outlined");
    const item = trigger.closest(".faq-item");
    const isOpen = !content.classList.contains("hidden");

    // Close all others first
    document.querySelectorAll(".faq-content").forEach(c => c.classList.add("hidden"));
    document.querySelectorAll(".faq-trigger .material-icons-outlined").forEach(i => i.style.transform = "rotate(0deg)");

    if (!isOpen) {
      content.classList.remove("hidden");
      icon.style.transform = "rotate(180deg)";
      item.classList.add("bg-white/80", "border-[#7b8a5b]/20");
    }
  });
});
```

## 8. Firebase Submit + Discord Webhook

```js
const submitRSVP = async (name, status) => {
  try {
    // 1. Push to Firebase
    await push(ref(db, "rsvps"), {
      guestName: name, attending: status,
      submittedAt: new Date().toISOString()
    });

    // 2. Discord notification
    await fetch(DISCORD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: `${emoji} New RSVP Received!`,
          description: `**${name}** has responded.`,
          color: status === "yes" ? 0x7b8a5b : 0xa8a29e,
          fields: [
            { name: "Guest Name", value: name, inline: true },
            { name: "Attendance", value: status === "yes" ? "Joyfully Accepts" : "Regretfully Declines", inline: true }
          ],
          timestamp: new Date().toISOString()
        }]
      })
    });

    // 3. UI update
    document.getElementById("rsvpForm").classList.add("hidden");
    document.getElementById("successMsg").classList.remove("hidden");
  } catch (error) {
    alert("Submission failed. Please try again.");
  }
};
```

## 9. Smooth Scroll (Anchor Nav)

```js
document.querySelectorAll('nav a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute("href"));
    if (target) window.scrollTo({ top: target.offsetTop - 80, behavior: "smooth" });
  });
});
```

## 10. Music Control (Smart Pause/Resume)

```js
let isMusicMuted = false;

const pauseBG = () => { if (!isMusicMuted) bgMusic.pause(); };
const resumeBG = () => { if (!isMusicMuted) bgMusic.play(); };

[courtshipAudio, ...allVideos].forEach(el => {
  if (el) {
    el.addEventListener("play", pauseBG);
    el.addEventListener("pause", resumeBG);
    el.addEventListener("ended", resumeBG);
  }
});

musicToggle.addEventListener("click", () => {
  if (bgMusic.paused) {
    bgMusic.play(); isMusicMuted = false; musicIcon.innerText = "volume_up";
  } else {
    bgMusic.pause(); isMusicMuted = true; musicIcon.innerText = "volume_off";
  }
});
```
