import { state } from "./state.js";

const ALLOWED_EMAILS = ["charliecayno@gmail.com", "kasromantico@gmail.com"];

export async function initAuth() {
  await waitForGoogle();

  return new Promise((resolve) => {
    google.accounts.id.initialize({
      client_id:
        "668755364170-3uiq2nrlmb4b91hf5o5junu217b4eeef.apps.googleusercontent.com",
      callback: handleCredential,
      auto_select: true,
    });

    google.accounts.id.prompt();
    resolve();
  });
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
    return;
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
