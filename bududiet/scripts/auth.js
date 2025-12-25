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
      } catch (e) {
        reject(e);
      }
    }

    // ✅ Initialize once
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: onCredential,
    });

    // ✅ Try One Tap
    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed()) {
        console.warn(
          "[AUTH] One Tap not shown:",
          notification.getNotDisplayedReason()
        );

        // 👇 FALLBACK — manual button (Incognito-safe)
        showManualButton(onCredential);
      }
    });
  });
}

function showManualButton(callback) {
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
}

export function logout() {
  state.user = null;
  window.google.accounts.id.disableAutoSelect();
  location.reload();
}

function parseJwt(token) {
  const base64 = token.split(".")[1];
  const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(decodeURIComponent(escape(json)));
}
