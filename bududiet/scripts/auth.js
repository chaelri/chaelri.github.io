import { state } from "./state.js";

const ALLOWED_EMAILS = ["charliecayno@gmail.com", "kasromantico@gmail.com"];

export async function initAuth() {
  return new Promise((resolve) => {
    google.accounts.id.initialize({
      client_id: "YOUR_GOOGLE_CLIENT_ID",
      callback: handleCredential,
      auto_select: true,
    });

    google.accounts.id.prompt();
    resolve();
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
