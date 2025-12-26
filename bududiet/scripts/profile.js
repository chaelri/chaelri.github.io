// scripts/profile.js
import { state } from "./state.js";
import { logout } from "./localAuth.js";

export function bindProfile() {
  if (!state.user) return;

  const nameEl = document.getElementById("profile-name");
  const avatarEl = document.getElementById("profile-photo");
  const btn = document.getElementById("logoutBtn");

  if (nameEl) {
    nameEl.textContent =
      state.user.name == "Charlie"
        ? "Charlie Michael Cayno"
        : "Karla Sofia Romantico";
  }

  // ---------- AVATAR (C / K) ----------
  if (avatarEl) {
    avatarEl.textContent = state.user.photo; // "C" or "K"
    avatarEl.classList.add("avatar-circle");
  }

  if (btn) btn.onclick = logout;
}
