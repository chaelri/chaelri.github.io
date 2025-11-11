// 💗 Wedding Bubble Planner - Smarter Pull-to-Refresh
let startY = 0;
let distance = 0;
let isTouching = false;
let isRefreshing = false;
const indicator = document.getElementById("refreshIndicator");

// Configure thresholds
const TRIGGER_DISTANCE = 130; // how far to pull before refresh
const MAX_DISTANCE = 180; // visual limit for heart pull

// touch start
window.addEventListener("touchstart", (e) => {
  if (window.scrollY <= 2) {
    isTouching = true;
    startY = e.touches[0].pageY;
    distance = 0;
  }
});

// touch move
window.addEventListener("touchmove", (e) => {
  if (!isTouching || isRefreshing) return;
  const currentY = e.touches[0].pageY;
  distance = Math.min(currentY - startY, MAX_DISTANCE);

  if (distance > 0 && window.scrollY <= 2) {
    // Prevent native pull-to-refresh
    e.preventDefault();
    // Show heart proportional to pull distance
    indicator.style.top = Math.min(distance / 3, 50) + "px";
    indicator.style.opacity = Math.min(distance / TRIGGER_DISTANCE, 1);
  }

  if (distance > TRIGGER_DISTANCE && !isRefreshing) {
    triggerRefresh();
  }
});

// touch end
window.addEventListener("touchend", () => {
  isTouching = false;
  indicator.style.top = "-60px";
  indicator.style.opacity = "0";
});

function triggerRefresh() {
  isRefreshing = true;
  indicator.classList.add("show");
  if (window.navigator.vibrate) window.navigator.vibrate(40);
  showToast("🔄 Refreshing Wedding Planner...");
  setTimeout(() => {
    indicator.classList.remove("show");
    isRefreshing = false;
    window.location.reload(true);
  }, 1000);
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("success");
  toast.style.opacity = "1";
  toast.style.visibility = "visible";
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.visibility = "hidden";
  }, 2000);
}
