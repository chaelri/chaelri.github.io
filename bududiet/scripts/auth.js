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

/* ---------------------------
   Init Firebase Auth
---------------------------- */
export function initAuth(firebaseApp) {
  auth = getAuth(firebaseApp);
  const provider = new GoogleAuthProvider();

  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      console.log("AUTH STATE CHANGED:", user?.email);
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
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        console.log("POPUP SIGNED IN AS:", user.email);

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
