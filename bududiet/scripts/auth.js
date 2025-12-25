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

let auth;
const REDIRECT_FLAG = "bududiet:redirecting";

export function initAuth(firebaseApp) {
  auth = getAuth(firebaseApp);
  const provider = new GoogleAuthProvider();

  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      // ✅ Already signed in
      if (user) {
        if (!ALLOWED_EMAILS.includes(user.email)) {
          await signOut(auth);
          sessionStorage.removeItem(REDIRECT_FLAG);
          reject(new Error("Unauthorized user"));
          return;
        }

        state.user = {
          uid: user.uid,
          email: user.email,
          name: user.displayName,
          photo: user.photoURL,
        };

        sessionStorage.removeItem(REDIRECT_FLAG);
        resolve();
        return;
      }

      // ⛔ Prevent infinite redirect
      if (sessionStorage.getItem(REDIRECT_FLAG)) {
        // Waiting for redirect result, do NOTHING
        return;
      }

      // 🔐 Start redirect login ONCE
      sessionStorage.setItem(REDIRECT_FLAG, "1");
      await signInWithRedirect(auth, provider);
    });
  });
}

export async function logout() {
  if (!auth) return;
  sessionStorage.removeItem(REDIRECT_FLAG);
  await signOut(auth);
  location.reload();
}
