// scripts/localAuth.js
import { state } from "./state.js";

const KEY = "bududiet:user";

export function initLocalAuth() {
  const saved = localStorage.getItem(KEY);
  if (saved) {
    state.user = JSON.parse(saved);
    return true;
  }
  return false;
}

export function selectUser(name) {
  const user =
    name === "Charlie"
      ? {
          uid: "charlie",
          email: "charlie@local",
          name: "Charlie",
          photo: "C",
        }
      : {
          uid: "karla",
          email: "karla@local",
          name: "Karla",
          photo: "K",
        };

  state.user = user;
  localStorage.setItem(KEY, JSON.stringify(user));
}

export function logout() {
  localStorage.removeItem(KEY);
  location.reload();
}
