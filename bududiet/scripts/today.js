import { state } from "./state.js";

export function bindToday(animate = false) {
  const circle = document.getElementById("wheelProgress");
  const value = document.getElementById("wheelValue");
  const icon = document.getElementById("wheelIcon");
  if (!circle || !value || !icon) return;

  const goal = getGoal();
  const net = state.today.net;

  const pct = Math.min(Math.abs(net) / goal, 1);
  const circumference = 565;
  const offset = circumference * (1 - pct);

  if (animate) {
    circle.style.transition = "none";
    circle.style.strokeDashoffset = 565;

    requestAnimationFrame(() => {
      circle.style.transition =
        "stroke-dashoffset 700ms cubic-bezier(0.22, 1, 0.36, 1)";
      circle.style.strokeDashoffset = offset;
    });
  } else {
    circle.style.strokeDashoffset = offset;
  }
  value.textContent = `${net} kcal`;

  icon.classList.remove("wheel-ok", "wheel-warning", "wheel-over");

  if (net < 0) {
    icon.textContent = "local_fire_department";
    icon.classList.add("wheel-ok");
  } else if (net > goal) {
    icon.textContent = "sentiment_very_dissatisfied";
    icon.classList.add("wheel-over");
  } else if (net > goal * 0.9) {
    icon.textContent = "sentiment_neutral";
    icon.classList.add("wheel-warning");
  } else if (net > goal * 0.6) {
    icon.textContent = "sentiment_satisfied";
    icon.classList.add("wheel-ok");
  } else {
    icon.textContent = "sentiment_satisfied_alt";
    icon.classList.add("wheel-ok");
  }
}

function getGoal() {
  return state.user.email === "charliecayno@gmail.com" ? 1100 : 1500;
}
