// scripts/auth.js
import { state } from "./state.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
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
      if (user) {
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

        resolve();
      } else {
        // ❗ do nothing here
        // app.js will decide when to login
      }
    });
  });
}

export async function login() {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    if (!ALLOWED_EMAILS.includes(user.email)) {
      await signOut(auth);
      throw new Error("UNAUTHORIZED");
    }

    state.user = {
      uid: user.uid,
      email: user.email,
      name: user.displayName,
      photo: user.photoURL,
    };

    // 🔥 reload once after login
    location.reload();
  } catch (e) {
    console.error("Login failed", e);
  }
}

export async function logout() {
  if (auth) await signOut(auth);
  location.reload();
}
