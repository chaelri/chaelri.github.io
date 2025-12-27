// 1. IMPORT FIREBASE SDKS
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  set,
  get,
  child,
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

// INITIALIZE
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
let masterGuestList = [];

// DOM ELEMENTS
const nameInput = document.getElementById("guestName");
const listContainer = document.getElementById("autocomplete-list");
const nameErrorMsg = document.getElementById("nameErrorMsg");
const rsvpForm = document.getElementById("rsvpForm");
const successMsg = document.getElementById("successMsg");
const modal = document.getElementById("welcomeModal");
const closeBtn = document.getElementById("closeModalBtn");

// --- 1. FETCH GUEST LIST FOR TYPE-AHEAD ---
const dbRef = ref(db);
get(child(dbRef, "guestList"))
  .then((snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      // Map the names into our local array
      masterGuestList = Object.values(data).map((guest) => guest.name);
      console.log("Guest list loaded:", masterGuestList.length, "names found.");
    }
  })
  .catch((error) => console.error("Error fetching guest list:", error));

// --- 2. TYPE-AHEAD / AUTOCOMPLETE LOGIC ---
nameInput.addEventListener("input", function () {
  const val = this.value;
  closeAllLists();

  // Reset visual error state as user types
  nameInput.classList.remove("border-error", "shake");
  if (nameErrorMsg) nameErrorMsg.classList.add("hidden");

  if (!val || val.length < 2) return false;

  const matches = masterGuestList.filter((name) =>
    name.toLowerCase().includes(val.toLowerCase())
  );

  if (matches.length > 0) {
    listContainer.classList.remove("hidden");
    matches.forEach((name) => {
      const item = document.createElement("div");
      item.className = "suggestion-item";
      item.innerHTML = name.replace(
        new RegExp(val, "gi"),
        (match) => `<strong>${match}</strong>`
      );

      item.addEventListener("click", function () {
        nameInput.value = name;
        closeAllLists();
        // Remove error if they select a valid name
        nameInput.classList.remove("border-error");
        if (nameErrorMsg) nameErrorMsg.classList.add("hidden");
      });
      listContainer.appendChild(item);
    });
  }
});

function closeAllLists() {
  listContainer.innerHTML = "";
  listContainer.classList.add("hidden");
}

document.addEventListener("click", (e) => {
  if (e.target !== nameInput) closeAllLists();
});

// --- 3. RSVP SUBMISSION + VALIDATION ---
if (rsvpForm) {
  rsvpForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const typedName = nameInput.value.trim();
    const submitBtn = rsvpForm.querySelector("button");

    // VALIDATION: Check if name is in master list (Case Insensitive)
    const isNameValid = masterGuestList.some(
      (name) => name.toLowerCase() === typedName.toLowerCase()
    );

    if (!isNameValid) {
      // Trigger Error UI
      nameInput.classList.add("border-error", "shake");
      if (nameErrorMsg) nameErrorMsg.classList.remove("hidden");

      // Remove shake class after animation so it can trigger again
      setTimeout(() => nameInput.classList.remove("shake"), 500);
      return; // STOP HERE
    }

    // If valid, proceed to save
    submitBtn.disabled = true;
    submitBtn.innerText = "SAVING...";

    try {
      const rsvpRef = ref(db, "rsvps");
      const newRsvpRef = push(rsvpRef);

      await set(newRsvpRef, {
        guestName: typedName,
        attending: document.getElementById("attendance").value,
        submittedAt: new Date().toISOString(),
      });

      rsvpForm.classList.add("hidden");
      successMsg.classList.remove("hidden");
    } catch (error) {
      console.error("Firebase Error:", error);
      alert("Error saving RSVP. Please try again.");
      submitBtn.disabled = false;
      submitBtn.innerText = "SEND RSVP";
    }
  });
}

// --- 4. MODAL LOGIC ---
document.body.style.overflow = "hidden"; // Start locked
if (closeBtn) {
  closeBtn.addEventListener("click", () => {
    modal.classList.add("hidden");
    document.body.style.overflow = "auto";
  });
}

// --- 5. COUNTDOWN LOGIC ---
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
