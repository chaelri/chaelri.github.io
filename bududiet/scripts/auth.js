import { state } from "./state.js";

const ALLOWED_EMAILS = ["charliecayno@gmail.com", "kasromantico@gmail.com"];

/* ---------------------------
   Restore existing session
---------------------------- */
export function restoreUser() {
  const raw = localStorage.getItem("bududiet:user");
  if (!raw) return false;

  try {
    state.user = JSON.parse(raw);

    // 🔴 CRITICAL: idToken must exist for Firebase Auth
    if (!state.user.idToken) return false;

    return true;
  } catch {
    return false;
  }
}

/* ---------------------------
   Init Google Sign-In
---------------------------- */
export async function initAuth() {
  // ✅ auto-login if already signed in
  if (restoreUser()) {
    if (window.google?.accounts?.id) {
      google.accounts.id.disableAutoSelect();
    }
    return;
  }

  await waitForGoogle();

  return new Promise((resolve, reject) => {
    google.accounts.id.initialize({
      client_id:
        "80406735414-a042rk0m53m65ue6rffragg5spjhorm5.apps.googleusercontent.com",
      auto_select: false,
      callback: (res) => {
        try {
          handleCredential(res);
          resolve();
        } catch (e) {
          reject(e);
        }
      },
    });

    google.accounts.id.prompt((notification) => {
      if (notification.isSkippedMoment()) {
        resolve();
      }
    });
  });
}

/* ---------------------------
   Logout
---------------------------- */
export function logout() {
  if (window.google?.accounts?.id) {
    google.accounts.id.disableAutoSelect();
  }

  localStorage.clear();
  sessionStorage.clear();
  location.reload();
}

/* ---------------------------
   Helpers
---------------------------- */
function waitForGoogle() {
  return new Promise((resolve) => {
    if (window.google?.accounts?.id) return resolve();

    const interval = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(interval);
        resolve();
      }
    }, 50);
  });
}

function handleCredential(response) {
  const idToken = response.credential; // 🔥 KEEP THIS
  const payload = decodeJwt(idToken);

  if (!ALLOWED_EMAILS.includes(payload.email)) {
    document.body.innerHTML = "<h1>Access denied</h1>";
    throw new Error("Unauthorized user");
  }

  state.user = {
    email: payload.email,
    name: payload.name,
    photo: payload.picture,
    idToken, // 🔥 REQUIRED for Firebase Auth
  };

  localStorage.setItem("bududiet:user", JSON.stringify(state.user));
  state.authReady = true;
}

function decodeJwt(token) {
  const base64 = token.split(".")[1];
  return JSON.parse(atob(base64));
}
