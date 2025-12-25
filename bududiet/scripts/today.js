import { state } from "./state.js";

export function bindToday(animate = false) {
  const circle = document.getElementById("wheelProgress");
  const value = document.getElementById("wheelValue");
  const emoji = document.getElementById("wheelEmoji");
  if (!circle || !value || !emoji) return;

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

  if (net < 0) emoji.textContent = "🔥";
  else if (net > goal) emoji.textContent = "😵";
  else if (net > goal * 0.9) emoji.textContent = "😐";
  else if (net > goal * 0.6) emoji.textContent = "😊";
  else emoji.textContent = "🙂";
}

function getGoal() {
  return state.user.email === "charliecayno@gmail.com" ? 1100 : 1500;
}
