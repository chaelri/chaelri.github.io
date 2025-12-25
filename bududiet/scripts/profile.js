import { state } from "./state.js";

export function bindProfile() {
  if (!state.user) return;

  document.getElementById("profile-name").textContent = state.user.name;
  document.getElementById("profile-email").textContent = state.user.email;
  document.getElementById("profile-photo").src = state.user.photo;
}
