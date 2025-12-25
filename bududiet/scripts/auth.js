// scripts/auth.js
import { state } from "./state.js";

const ALLOWED_EMAILS = ["charliecayno@gmail.com", "kasromantico@gmail.com"];

const GOOGLE_CLIENT_ID =
  "668755364170-3uiq2nrimb4b91hf5o5junu217b4eeef.apps.googleusercontent.com";

/* ---------------------------
   Init Google Identity Auth
---------------------------- */
export function initAuth() {
  let resolved = false;

  return new Promise((resolve, reject) => {
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      auto_select: false,
      callback: (response) => {
        try {
          const payload = parseJwt(response.credential);

          if (!ALLOWED_EMAILS.includes(payload.email)) {
            reject(new Error("Unauthorized user"));
            return;
          }

          state.user = {
            uid: payload.sub,
            email: payload.email,
            name: payload.name,
            photo: payload.picture,
          };

          resolved = true;
          resolve();
        } catch (err) {
          reject(err);
        }
      },
    });

    let container = document.getElementById("google-login");

    if (!container) {
      container = document.createElement("div");
      container.id = "google-login";
      container.style.marginTop = "24px";
      document.body.appendChild(container);
    }

    window.google.accounts.id.renderButton(container, {
      theme: "outline",
      size: "large",
      shape: "pill",
      text: "continue_with",
    });

    window.google.accounts.id.prompt();

    setTimeout(() => {
      if (!resolved) {
        reject(new Error("Login required"));
      }
    }, 60_000);
  });
}

/* ---------------------------
   Logout
---------------------------- */
export function logout() {
  state.user = null;
  window.google.accounts.id.disableAutoSelect();
  location.reload();
}

/* ---------------------------
   JWT Decoder
---------------------------- */
function parseJwt(token) {
  const base64 = token.split(".")[1];
  const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(decodeURIComponent(escape(json)));
}
