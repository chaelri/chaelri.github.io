/**
 * Senior Frontend Controller - Youth Devotion Presentation
 */

let currentSlide = 1;
const totalSlides = 8;

const slides = document.querySelectorAll(".slide");
const nextBtn = document.getElementById("next-btn");
const prevBtn = document.getElementById("prev-btn");
const progressBar = document.getElementById("progress-bar");
const slideNumDisplay = document.getElementById("current-slide-num");
const fsBtn = document.getElementById("fullscreen-btn");

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

  // Handle Button States
  prevBtn.disabled = currentSlide === 1;
  prevBtn.classList.toggle("opacity-30", currentSlide === 1);
  prevBtn.classList.toggle("cursor-not-allowed", currentSlide === 1);

  nextBtn.disabled = currentSlide === totalSlides;
  nextBtn.classList.toggle("opacity-0", currentSlide === totalSlides);

  // Update Progress
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
