// scripts/auth.js
import { state } from "./state.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const ALLOWED_EMAILS = ["charliecayno@gmail.com", "kasromantico@gmail.com"];

let auth;

function isPWA() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

/* ---------------------------
   Init Firebase Auth
---------------------------- */
export async function initAuth(firebaseApp) {
  auth = getAuth(firebaseApp);
  const provider = new GoogleAuthProvider();

  // 🔐 Handle redirect result (PWA only, safe to call always)
  try {
    await getRedirectResult(auth);
  } catch (e) {
    console.warn("[AUTH] Redirect result error", e);
  }

  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (!ALLOWED_EMAILS.includes(user.email)) {
          await signOut(auth);
          reject(new Error("Unauthorized user"));
          return;
        }

        state.user = {
          uid: user.uid,
          email: user.email,
          name: user.displayName,
          photo: user.photoURL,
        };

        resolve();
        return;
      }

      // No user → show Google popup
      try {
        if (isPWA()) {
          await signInWithRedirect(auth, provider);
          return;
        }

        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        if (!ALLOWED_EMAILS.includes(user.email)) {
          await signOut(auth);
          reject(new Error("Unauthorized user"));
          return;
        }

        state.user = {
          uid: user.uid,
          email: user.email,
          name: user.displayName,
          photo: user.photoURL,
        };

        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
}

/* ---------------------------
   Logout
---------------------------- */
export async function logout() {
  if (!auth) return;
  await signOut(auth);
  location.reload();
}
