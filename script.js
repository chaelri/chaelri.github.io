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
const clickableImage = document.getElementById("clickableImage");
const apaSound = document.getElementById("apaSound");
const ilySound = document.getElementById("ilySound");
const whoAmIToYouSound = document.getElementById("whoAmIToYouSound");
const hmmmpSound = document.getElementById("hmmmpSound");

// Function to play random sound
function playRandomSound(count) {
  // Check if count is divisible by 100
  if (count % 100 === 0 && count !== 0) {
    // Play ilySound for milestones
    ilySound.currentTime = 0;
    return ilySound.play().catch((error) => {
      console.log("Audio play failed:", error);
    });
  }

  // Regular weighted random distribution for other counts
  const randomNum = Math.random() * 100;

  let soundToPlay;

  if (randomNum < 55) {
    soundToPlay = apaSound; // 55% chance
  } else if (randomNum < 80) {
    soundToPlay = hmmmpSound; // 25% chance
  } else if (randomNum < 95) {
    soundToPlay = whoAmIToYouSound; // 15% chance
  } else {
    soundToPlay = ilySound; // 5% chance
  }

  soundToPlay.currentTime = 0;
  soundToPlay.play().catch((error) => {
    console.log("Audio play failed:", error);
  });
}

async function increment() {
  const snapshot = await get(counterRef);
  const currentCount = snapshot.exists() ? snapshot.val() : 0;
  const newCount = currentCount + 1;

  // Update Firebase
  await set(counterRef, newCount);

  // Play sound
  playRandomSound(newCount);

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

// Add click event listener
clickableImage.addEventListener("click", increment);

// Listen for real-time updates
onValue(counterRef, (snapshot) => {
  const count = snapshot.exists() ? snapshot.val() : 0;
  document.getElementById("counter").innerText = count;
});

// Initial load
updateCounter();

// Initialize sounds on first user interaction
document.addEventListener(
  "click",
  function initializeAudio() {
    // Play and immediately pause to initialize audio
    apaSound
      .play()
      .then(() => {
        apaSound.pause();
        apaSound.currentTime = 0;
      })
      .catch(console.error);

    ilySound
      .play()
      .then(() => {
        ilySound.pause();
        ilySound.currentTime = 0;
      })
      .catch(console.error);

    whoAmIToYouSound
      .play()
      .then(() => {
        whoAmIToYouSound.pause();
        whoAmIToYouSound.currentTime = 0;
      })
      .catch(console.error);

    hmmmpSound
      .play()
      .then(() => {
        hmmmpSound.pause();
        hmmmpSound.currentTime = 0;
      })
      .catch(console.error);

    // Remove this listener after initialization
    document.removeEventListener("click", initializeAudio);
  },
  { once: true }
);
