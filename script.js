// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  set,
  get,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";

// 🔥 Replace with your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyB8ahT56WbEUaGAymsRNNA-DrfZnUnWIwk",
  authDomain: "test-database-55379.firebaseapp.com",
  databaseURL:
    "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "test-database-55379",
  storageBucket: "test-database-55379.firebasestorage.app",
  messagingSenderId: "933688602756",
  appId: "1:933688602756:web:392a3a4ce040cb9d4452d1",
  measurementId: "G-1LSTC0N3NJ",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const counterRef = ref(db, "counter");

// Function to update counter from database
// Get the image element
const clickableImage = document.querySelector(".clickable-image");

async function increment() {
  const snapshot = await get(counterRef);
  const currentCount = snapshot.exists() ? snapshot.val() : 0;
  const newCount = currentCount + 1;

  // Update Firebase
  await set(counterRef, newCount);

  // Trigger animation
  clickableImage.classList.remove("heart-beat");
  void clickableImage.offsetWidth; // Trigger reflow
  clickableImage.classList.add("heart-beat");
}

async function updateCounter() {
  const snapshot = await get(counterRef);
  let count = snapshot.exists() ? snapshot.val() : 0;

  // Update UI
  document.getElementById("counter").innerText = count;

  // Show the counter container after loading
  document.getElementById("counter-container").style.display = "block";
}

// Listen for real-time updates
onValue(counterRef, (snapshot) => {
  const count = snapshot.exists() ? snapshot.val() : 0;
  document.getElementById("counter").innerText = count;
});

// Initial load
updateCounter();
