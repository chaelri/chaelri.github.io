// scripts/auth.js
import { state } from "./state.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const ALLOWED_EMAILS = ["charliecayno@gmail.com", "kasromantico@gmail.com"];

// session key to guard redirects
const REDIRECT_KEY = "bududiet:redirecting";

let auth;
let provider;
let redirectHandled = false;

export async function initAuth(firebaseApp) {
  auth = getAuth(firebaseApp);
  provider = new GoogleAuthProvider();

  // 🔁 STEP 1: consume redirect result ONCE
  if (!redirectHandled) {
    redirectHandled = true;

    try {
      const result = await getRedirectResult(auth);
      if (result?.user) {
        const user = result.user;

        if (!ALLOWED_EMAILS.includes(user.email)) {
          await signOut(auth);
          sessionStorage.removeItem(REDIRECT_KEY);
          throw new Error("UNAUTHORIZED");
        }

        state.user = {
          uid: user.uid,
          email: user.email,
          name: user.displayName,
          photo: user.photoURL,
        };

        sessionStorage.removeItem(REDIRECT_KEY);
        return;
      }
    } catch {
      // ignore redirect errors
      sessionStorage.removeItem(REDIRECT_KEY);
    }
  }

  // 🔍 STEP 2: observe auth state
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (!ALLOWED_EMAILS.includes(user.email)) {
          await signOut(auth);
          sessionStorage.removeItem(REDIRECT_KEY);
          reject(new Error("UNAUTHORIZED"));
          return;
        }

        state.user = {
          uid: user.uid,
          email: user.email,
          name: user.displayName,
          photo: user.photoURL,
        };

        sessionStorage.removeItem(REDIRECT_KEY);
        resolve();
        return;
      }

      // 🔐 STEP 3: no user → redirect (ONLY if not already redirecting)
      if (!sessionStorage.getItem(REDIRECT_KEY)) {
        sessionStorage.setItem(REDIRECT_KEY, "1");
        signInWithRedirect(auth, provider);
        return;
      }

      // waiting for redirect to complete
    });
  });
}

export async function logout() {
  // 🔥 CRITICAL: full reset
  sessionStorage.removeItem(REDIRECT_KEY);
  redirectHandled = false;

  if (auth) {
    await signOut(auth);
  }

  location.reload();
}
