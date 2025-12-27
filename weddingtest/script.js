import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  set,
  get,
  child,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBNPdSYJXuzvmdEHIeHGkbPmFnZxUq1lAg",
  authDomain: "charlie-karla-wedding.firebaseapp.com",
  databaseURL:
    "https://charlie-karla-wedding-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "charlie-karla-wedding",
  storageBucket: "charlie-karla-wedding.firebasestorage.app",
  messagingSenderId: "954582649260",
  appId: "1:954582649260:web:393fcc0fddafeb571f5209",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
let masterGuestList = [];

// --- 1. INTRO ANIMATION & SMOOTH EXIT ---
document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("floral-overlay");
  const mono = document.getElementById("intro-monogram");
  const flowers = document.querySelectorAll(".floral-element");
  const modal = document.getElementById("welcomeModal");
  const closeBtn = document.getElementById("closeModalBtn");

  document.body.style.overflow = "hidden";

  // A. Monogram In
  setTimeout(() => {
    mono.style.opacity = "1";
  }, 500);

  // B. Monogram Out, Flowers Glide In
  setTimeout(() => {
    mono.style.opacity = "0";
    flowers.forEach((f) => f.classList.add("floral-center"));
  }, 2500);

  // C. Show Modal
  setTimeout(() => {
    modal.classList.remove("hidden");
    setTimeout(() => {
      modal.style.opacity = "1";
    }, 50);
  }, 4500);

  // D. EXIT SEQUENCE (No Jumps)
  closeBtn.addEventListener("click", () => {
    // Unlock scrolling immediately for the user
    document.body.style.overflow = "auto";
    // Make overlay ignore all mouse events so user can interact with site
    overlay.style.pointerEvents = "none";

    modal.style.transition = "opacity 0.8s ease";
    modal.style.opacity = "0";

    // Glide flowers back to the void
    setTimeout(() => {
      flowers.forEach((f) => f.classList.remove("floral-center"));
    }, 200);

    // Fade background color slowly
    overlay.style.transition = "background-color 2s ease, opacity 2.5s ease";
    overlay.style.backgroundColor = "transparent";

    setTimeout(() => {
      overlay.style.opacity = "0";
      // Finally hide it from DOM after everything is invisible
      setTimeout(() => {
        overlay.style.display = "none";
      }, 2000);
    }, 500);
  });
});

// --- 2. FIREBASE & RSVP ---
get(child(ref(db), "guestList")).then((snapshot) => {
  if (snapshot.exists())
    masterGuestList = Object.values(snapshot.val()).map((g) => g.name);
});

const nameInput = document.getElementById("guestName");
const listContainer = document.getElementById("autocomplete-list");

nameInput.addEventListener("input", function () {
  const val = this.value;
  listContainer.innerHTML = "";
  listContainer.classList.add("hidden");
  nameInput.classList.remove("border-error", "shake");

  if (!val || val.length < 2) return;
  const matches = masterGuestList.filter((n) =>
    n.toLowerCase().includes(val.toLowerCase())
  );

  if (matches.length > 0) {
    listContainer.classList.remove("hidden");
    matches.forEach((name) => {
      const div = document.createElement("div");
      div.className = "suggestion-item";
      div.innerHTML = `<strong>${name}</strong>`;
      div.onclick = () => {
        nameInput.value = name;
        listContainer.classList.add("hidden");
      };
      listContainer.appendChild(div);
    });
  }
});

document.getElementById("rsvpForm").onsubmit = async (e) => {
  e.preventDefault();
  const typedName = nameInput.value.trim();
  const isValid = masterGuestList.some(
    (n) => n.toLowerCase() === typedName.toLowerCase()
  );

  if (!isValid) {
    nameInput.classList.add("border-error", "shake");
    document.getElementById("nameErrorMsg").classList.remove("hidden");
    setTimeout(() => nameInput.classList.remove("shake"), 500);
    return;
  }

  const submitBtn = e.target.querySelector("button");
  submitBtn.innerText = "SAVING...";
  submitBtn.disabled = true;

  try {
    await push(ref(db, "rsvps"), {
      guestName: typedName,
      attending: document.getElementById("attendance").value,
      submittedAt: new Date().toISOString(),
    });
    document.getElementById("rsvpForm").classList.add("hidden");
    document.getElementById("successMsg").classList.remove("hidden");
  } catch (err) {
    alert("Error saving RSVP.");
    submitBtn.innerText = "SEND RSVP";
    submitBtn.disabled = false;
  }
};

// --- 3. COUNTDOWN ---
setInterval(() => {
  const dist =
    new Date("July 2, 2026 16:00:00").getTime() - new Date().getTime();
  const days = Math.floor(dist / (1000 * 60 * 60 * 24));
  const hrs = Math.floor((dist % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((dist % (1000 * 60 * 60)) / (1000 * 60));
  const secs = Math.floor((dist % (1000 * 60)) / 1000);
  const el = document.getElementById("countdown");
  if (el) el.innerHTML = `${days}d ${hrs}h ${mins}m ${secs}s`;
}, 1000);
