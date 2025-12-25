// scripts/auth.js
import { state } from "./state.js";

const ALLOWED_EMAILS = ["charliecayno@gmail.com", "kasromantico@gmail.com"];

const GOOGLE_CLIENT_ID =
  "668755364170-3uiq2nrlmb4b91hf5o5junu217b4eeef.apps.googleusercontent.com";

let resolved = false;

export function initAuth() {
  return new Promise((resolve, reject) => {
    function onCredential(response) {
      try {
        const payload = parseJwt(response.credential);

        console.log("[AUTH] credential received", payload.email);

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
        hideLogin();
        resolve();
      } catch (err) {
        reject(err);
      }
    }

    // ✅ Initialize GIS
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: onCredential,
      auto_select: false, // IMPORTANT
      cancel_on_tap_outside: false,
    });

    // ✅ ALWAYS render button (Incognito-safe)
    showLogin(onCredential);

    // ✅ Optional: try One Tap, but never depend on it
    window.google.accounts.id.prompt();
  });
}

/* ---------------------------
   UI helpers
---------------------------- */
function showLogin() {
  let el = document.getElementById("google-login");
  if (!el) {
    el = document.createElement("div");
    el.id = "google-login";
    document.body.appendChild(el);
  }

  el.hidden = false;
  el.style.display = "flex";
  el.style.justifyContent = "center";
  el.style.marginTop = "24px";

  window.google.accounts.id.renderButton(el, {
    theme: "filled_blue",
    size: "large",
    shape: "pill",
    text: "continue_with",
  });
}

function hideLogin() {
  const el = document.getElementById("google-login");
  if (el) el.hidden = true;
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
   JWT decode (safe)
---------------------------- */
function parseJwt(token) {
  const base64 = token.split(".")[1];
  const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(decodeURIComponent(escape(json)));
}
