// 1. IMPORT REALTIME DATABASE SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  set,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// YOUR FIREBASE CONFIG
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app); // Connects to Realtime Database

// 2. MODAL LOGIC
const modal = document.getElementById("welcomeModal");
const closeBtn = document.getElementById("closeModalBtn");
document.body.style.overflow = "hidden";

if (closeBtn) {
  closeBtn.addEventListener("click", () => {
    modal.classList.add("hidden");
    document.body.style.overflow = "auto";
  });
}

// 3. COUNTDOWN LOGIC
const weddingDate = new Date("July 2, 2026 16:00:00").getTime();
setInterval(() => {
  const now = new Date().getTime();
  const distance = weddingDate - now;
  const days = Math.floor(distance / (1000 * 60 * 60 * 24));
  const hours = Math.floor(
    (distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
  );
  const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((distance % (1000 * 60)) / 1000);

  const countdownEl = document.getElementById("countdown");
  if (countdownEl) {
    countdownEl.innerHTML = `${days}d ${hours}h ${minutes}m ${seconds}s`;
  }
}, 1000);

// 4. RSVP SUBMISSION (Updated for Realtime Database)
const rsvpForm = document.getElementById("rsvpForm");
const successMsg = document.getElementById("successMsg");

if (rsvpForm) {
  rsvpForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = rsvpForm.querySelector("button");
    submitBtn.disabled = true;
    submitBtn.innerText = "SAVING...";

    try {
      console.log("Attempting to save to Realtime Database...");

      // Create a reference to a folder called 'rsvps'
      const rsvpRef = ref(db, "rsvps");
      // Generate a new unique ID in that folder
      const newRsvpRef = push(rsvpRef);

      // Save the data
      await set(newRsvpRef, {
        guestName: document.getElementById("guestName").value,
        attending: document.getElementById("attendance").value,
        submittedAt: new Date().toISOString(), // Standard date format
      });

      console.log("Saved successfully!");
      rsvpForm.classList.add("hidden");
      successMsg.classList.remove("hidden");
    } catch (error) {
      console.error("Firebase Error:", error);
      alert("Error: " + error.message);
      submitBtn.disabled = false;
      submitBtn.innerText = "SEND RSVP";
    }
  });
}
