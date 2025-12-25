// scripts/auth.js
import { state } from "./state.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithRedirect,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const ALLOWED_EMAILS = ["charliecayno@gmail.com", "kasromantico@gmail.com"];

let auth;
let provider;

export function initAuth(firebaseApp) {
  auth = getAuth(firebaseApp);
  provider = new GoogleAuthProvider();

  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        // 🔥 wait for Firebase to finish restoring session
        setTimeout(() => {
          reject(new Error("NO_AUTH"));
        }, 0);
        return;
      }

      if (!ALLOWED_EMAILS.includes(user.email)) {
        await signOut(auth);
        reject(new Error("UNAUTHORIZED"));
        return;
      }

      state.user = {
        uid: user.uid,
        email: user.email,
        name: user.displayName,
        photo: user.photoURL,
      };

      // 🔥 IMPORTANT: re-bootstrap app after redirect login
      location.reload();
    });
  });
}

// 🔐 USER-TRIGGERED LOGIN (ONLY PLACE REDIRECT EXISTS)
export function login() {
  if (!auth) return;
  signInWithRedirect(auth, provider);
}

export async function logout() {
  if (auth) await signOut(auth);
  location.reload();
}
