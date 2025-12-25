import { state } from "./state.js";

const ALLOWED_EMAILS = ["charliecayno@gmail.com", "kasromantico@gmail.com"];

const GOOGLE_CLIENT_ID =
  "668755364170-3uiq2nrlmb4b91hf5o5junu217b4eeef.apps.googleusercontent.com";

let resolved = false;

export function initAuth() {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.id) {
      reject(new Error("Google Identity not loaded"));
      return;
    }

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      auto_select: true,
      callback: (response) => {
        try {
          const payload = parseJwt(response.credential);

          console.log("[AUTH] One Tap payload:", payload);

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

    // ✅ THIS shows the TOP One Tap
    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed()) {
        console.warn(
          "[AUTH] One Tap not displayed:",
          notification.getNotDisplayedReason()
        );
      }
    });

    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed()) {
        console.warn(
          "[AUTH] One Tap not shown:",
          notification.getNotDisplayedReason()
        );

        // Show manual button ONLY as fallback
        showManualLogin(resolve, reject);
      }
    });
  });
}

function showManualLogin(resolve, reject) {
  const btn = document.createElement("div");
  btn.style.marginTop = "24px";

  document.body.appendChild(btn);

  window.google.accounts.id.renderButton(btn, {
    theme: "outline",
    size: "large",
    shape: "pill",
    text: "continue_with",
  });

  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
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

        resolve();
      } catch (e) {
        reject(e);
      }
    },
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
