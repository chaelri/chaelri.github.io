// 💐 Wedding Bubble Planner - Scroll Up to Refresh (with heart spinner)
let startY = 0;
let isRefreshing = false;
const indicator = document.getElementById("refreshIndicator");

window.addEventListener("touchstart", e => {
  if (window.scrollY === 0) {
    startY = e.touches[0].pageY;
  }
});

window.addEventListener("touchmove", e => {
  const currentY = e.touches[0].pageY;
  if (window.scrollY === 0 && currentY - startY > 100 && !isRefreshing) {
    isRefreshing = true;

    // 💗 show heart spinner
    indicator.classList.add("show");

    if (window.navigator.vibrate) window.navigator.vibrate(40);
    showToast("🔄 Refreshing Wedding Planner...");

    // reload after a short animation delay
    setTimeout(() => {
      indicator.classList.remove("show");
      window.location.reload(true);
    }, 1000);
  }
});

window.addEventListener("touchend", () => {
  isRefreshing = false;
});

// optional mini-toast (uses your existing #toast)
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
