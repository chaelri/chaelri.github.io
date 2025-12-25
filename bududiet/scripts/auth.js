import { state } from "./state.js";

const ALLOWED_EMAILS = ["charliecayno@gmail.com", "kasromantico@gmail.com"];

export async function initAuth() {
  await waitForGoogle();

  return new Promise((resolve, reject) => {
    google.accounts.id.initialize({
      client_id:
        "668755364170-3uiq2nrlmb4b91hf5o5junu217b4eeef.apps.googleusercontent.com",
      callback: (res) => {
        try {
          handleCredential(res);
          resolve();
        } catch (e) {
          reject(e);
        }
      },
      auto_select: true,
    });

    google.accounts.id.prompt();
  });
}

export function logout() {
  if (window.google?.accounts?.id) {
    google.accounts.id.disableAutoSelect();
  }

  localStorage.clear();
  sessionStorage.clear();

  location.reload();
}

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
  const payload = decodeJwt(response.credential);

  if (!ALLOWED_EMAILS.includes(payload.email)) {
    document.body.innerHTML = "<h1>Access denied</h1>";
    throw new Error("Unauthorized user");
  }

  state.user = {
    email: payload.email,
    name: payload.name,
    photo: payload.picture,
  };

  state.authReady = true;
}

function decodeJwt(token) {
  const base64 = token.split(".")[1];
  return JSON.parse(atob(base64));
}
