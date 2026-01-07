/**
 * Senior Frontend Controller - Youth Devotion Presentation
 */

let currentSlide = 1;
const totalSlides = 9;

const slides = document.querySelectorAll(".slide");
const nextBtn = document.getElementById("next-btn");
const prevBtn = document.getElementById("prev-btn");
const progressBar = document.getElementById("progress-bar");
const slideNumDisplay = document.getElementById("current-slide-num");
const fsBtn = document.getElementById("fullscreen-btn");
const navFooter = document.querySelector("footer");

/**
 * Fullscreen Logic
 */
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => {
      alert(`Error attempting to enable full-screen mode: ${err.message}`);
    });
    fsBtn.querySelector("span").innerText = "fullscreen_exit";
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
      fsBtn.querySelector("span").innerText = "fullscreen";
    }
  }
}

/**
 * Slide Navigation Logic
 */
function updatePresentation() {
  // Transition slides
  slides.forEach((slide, index) => {
    slide.classList.remove("active");
    if (index === currentSlide - 1) {
      slide.classList.add("active");
    }
  });

  // UI Visibility: Hide footer and progress bar on Slide 1 (Landing Page)
  if (currentSlide === 1) {
    navFooter.classList.add("opacity-0", "pointer-events-none");
    progressBar.parentElement.classList.add("opacity-0");
  } else {
    navFooter.classList.remove("opacity-0", "pointer-events-none");
    progressBar.parentElement.classList.remove("opacity-0");
  }

  // Handle Button States
  prevBtn.disabled = currentSlide === 1;
  nextBtn.disabled = currentSlide === totalSlides;
  nextBtn.classList.toggle("opacity-0", currentSlide === totalSlides);

  // Update Progress (Calculation adjusted for 9 slides)
  const progressPercentage = (currentSlide / totalSlides) * 100;
  progressBar.style.width = `${progressPercentage}%`;
  slideNumDisplay.innerText = currentSlide;
}

function nextSlide() {
  if (currentSlide < totalSlides) {
    currentSlide++;
    updatePresentation();
  }
}

function prevSlide() {
  if (currentSlide > 1) {
    currentSlide--;
    updatePresentation();
  }
}

function restartPresentation() {
  currentSlide = 1;
  updatePresentation();
}

/**
 * Event Listeners
 */

// Button Clicks
nextBtn.addEventListener("click", nextSlide);
prevBtn.addEventListener("click", prevSlide);
fsBtn.addEventListener("click", toggleFullscreen);

// Keyboard Shortcuts
document.addEventListener("keydown", (e) => {
  switch (e.key) {
    case "ArrowRight":
    case " ": // Spacebar
      nextSlide();
      break;
    case "ArrowLeft":
      prevSlide();
      break;
    case "f":
    case "F":
      toggleFullscreen();
      break;
    case "Escape":
      if (document.fullscreenElement) toggleFullscreen();
      break;
  }
});

// Double Tap/Click on background to toggle fullscreen
document
  .getElementById("presentation-area")
  .addEventListener("dblclick", toggleFullscreen);

// Swipe Support for Touch Devices
let touchstartX = 0;
let touchendX = 0;

document.addEventListener(
  "touchstart",
  (e) => (touchstartX = e.changedTouches[0].screenX)
);
document.addEventListener("touchend", (e) => {
  touchendX = e.changedTouches[0].screenX;
  if (touchendX < touchstartX - 70) nextSlide();
  if (touchendX > touchstartX + 70) prevSlide();
});

// Initial Init
updatePresentation();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}
