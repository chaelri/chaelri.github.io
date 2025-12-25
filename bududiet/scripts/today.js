import { state } from "./state.js";

export function bindToday() {
  const el = document.getElementById("netCalories");
  if (!el) return;

  el.textContent = `Net calories: ${state.today.net} kcal`;
}
