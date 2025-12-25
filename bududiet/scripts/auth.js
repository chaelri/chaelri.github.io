import { state } from "./state.js";

const ALLOWED_EMAILS = ["charliecayno@gmail.com", "kasromantico@gmail.com"];

const GOOGLE_CLIENT_ID =
  "668755364170-3uiq2nrlmb4b91hf5o5junu217b4eeef.apps.googleusercontent.com";

let initialized = false;

export function initAuth() {
  return new Promise((resolve) => {
    function handleCredential(response) {
      try {
        const payload = parseJwt(response.credential);

        console.log("[AUTH] credential received:", payload.email);

        if (!ALLOWED_EMAILS.includes(payload.email)) {
          document.body.innerHTML = `
            <div style="padding:32px;text-align:center">
              <h2>🚫 Access denied</h2>
              <p>This app is private.</p>
            </div>
          `;
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
        console.error("[AUTH] parse failed", e);
      }
    }

    if (!initialized) {
      initialized = true;

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredential,
        auto_select: false, // IMPORTANT for PWA + incognito
        cancel_on_tap_outside: false,
      });
    }

    // Try One Tap
    window.google.accounts.id.prompt((notification) => {
      console.log("[AUTH] one-tap status", notification);

      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        showManualButton();
      }
    });

    function showManualButton() {
      let container = document.getElementById("google-login");

      if (!container) {
        container = document.createElement("div");
        container.id = "google-login";
        container.style.display = "flex";
        container.style.justifyContent = "center";
        container.style.marginTop = "32px";
        document.body.appendChild(container);
      }

      window.google.accounts.id.renderButton(container, {
        theme: "filled_blue",
        size: "large",
        shape: "pill",
        text: "continue_with",
      });
    }
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
