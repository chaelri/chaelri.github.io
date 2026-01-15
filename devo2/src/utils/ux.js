export function smoothScrollTo(target, offset = 80, duration = 700) {
  const startY = window.scrollY;
  const targetY = target.getBoundingClientRect().top + startY - offset;
  const diff = targetY - startY;
  let startTime = null;

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function step(timestamp) {
    if (!startTime) startTime = timestamp;
    const time = Math.min((timestamp - startTime) / duration, 1);
    const eased = easeInOutCubic(time);
    window.scrollTo(0, startY + diff * eased);

    if (time < 1) {
      requestAnimationFrame(step);
    }
  }
  requestAnimationFrame(step);
}

export function lockAppScroll(lock) {
  const layout = document.querySelector(".layout");
  if (!layout) return;
  layout.style.overflowY = lock ? "hidden" : "auto";
}