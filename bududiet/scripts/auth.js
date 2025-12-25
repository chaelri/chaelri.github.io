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

const REDIRECT_KEY = "bududiet:auth-redirected";

let auth;
let provider;

export function initAuth(firebaseApp) {
  auth = getAuth(firebaseApp);
  provider = new GoogleAuthProvider();

  return new Promise(async (resolve, reject) => {
    // 1️⃣ Handle redirect result FIRST
    const redirectResult = await getRedirectResult(auth);
    if (redirectResult?.user) {
      const user = redirectResult.user;

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

    // 2️⃣ Observe auth state
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

      // 3️⃣ No user → redirect ONCE
      if (!sessionStorage.getItem(REDIRECT_KEY)) {
        sessionStorage.setItem(REDIRECT_KEY, "1");
        signInWithRedirect(auth, provider);
      }
    });
  });
}

export async function logout() {
  sessionStorage.removeItem(REDIRECT_KEY);
  if (auth) await signOut(auth);
  location.reload();
}
