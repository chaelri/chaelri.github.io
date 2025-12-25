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

export function initAuth(firebaseApp, onReady) {
  auth = getAuth(firebaseApp);
  provider = new GoogleAuthProvider();

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      onReady(null);
      return;
    }

    if (!ALLOWED_EMAILS.includes(user.email)) {
      await signOut(auth);
      onReady("unauthorized");
      return;
    }

    state.user = {
      uid: user.uid,
      email: user.email,
      name: user.displayName,
      photo: user.photoURL,
    };

    onReady(state.user);
  });
}

export function login() {
  signInWithRedirect(auth, provider);
}

export function logout() {
  signOut(auth).then(() => location.reload());
}
