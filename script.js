// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  set,
  get,
  push,
  remove,
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
const clickHistoryRef = ref(db, "clickHistory");

// Function to update counter from database
// Get the image element
// Messages for floating text
const floatingMessages = [
  "I miss you too!",
  "apa!",
  "mehehehe",
  "si lovee",
  "I love you!",
];
const floatingTextContainer = document.getElementById(
  "floating-text-container"
);
const clickableImage = document.getElementById("clickableImage");
const clickHistoryList = document.getElementById("click-history");
const apaSound = document.getElementById("apaSound");
const ilySound = document.getElementById("ilySound");
const whoAmIToYouSound = document.getElementById("whoAmIToYouSound");
const hmmmpSound = document.getElementById("hmmmpSound");

// Function to show floating text
function showFloatingText() {
  const message =
    floatingMessages[Math.floor(Math.random() * floatingMessages.length)]; // Pick random message

  const floatingText = document.createElement("div");
  floatingText.classList.add("floating-text");
  floatingText.innerText = message;

  // Get image position
  const image = document.getElementById("clickableImage");
  const rect = image.getBoundingClientRect();

  // Randomly decide left or right shoulder
  const isLeft = Math.random() < 0.5;

  // Calculate shoulder positions relative to image
  const offsetX = isLeft
    ? rect.left + window.scrollX + rect.width * -0.1
    : rect.left + window.scrollX + rect.width * 0.35;

  const offsetY = rect.top + window.scrollY - rect.height * 0.95;

  floatingText.style.left = `${offsetX}px`;
  floatingText.style.top = `${offsetY}px`;

  floatingTextContainer.appendChild(floatingText);

  // Remove text after 2s
  setTimeout(() => {
    floatingText.remove();
  }, 2000);
}

// Function to format time dynamically
function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: true,
  }); // Example: "Mar 3, 6:24:10 AM"
}

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

// Function to trigger image animation
function triggerImageAnimation() {
  clickableImage.classList.remove("heart-beat");
  void clickableImage.offsetWidth; // Force reflow
  clickableImage.classList.add("heart-beat");
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
  triggerImageAnimation();

  // Get current timestamp
  const timestamp = new Date().toISOString(); // Store in UTC format

  // Update Firebase (counter & timestamp log)
  await set(counterRef, newCount);
  await push(clickHistoryRef, timestamp); // Add new timestamp to Firebase

  // Keep only recent 5 in Firebase
  await updateClickHistoryInFirebase();

  // 📳 Vibrate on phone (200ms)
  if ("vibrate" in navigator) {
    navigator.vibrate([100, 50, 200]);
  }
}

// Function to update click history in Firebase (only store last 5)
async function updateClickHistoryInFirebase() {
  const snapshot = await get(clickHistoryRef);
  let clicks = [];

  // Collect all timestamps
  snapshot.forEach((childSnapshot) => {
    clicks.push({ key: childSnapshot.key, value: childSnapshot.val() });
  });

  // Sort by newest first
  clicks.sort((a, b) => new Date(b.value) - new Date(a.value));

  // Keep only the latest 5
  if (clicks.length > 5) {
    const excess = clicks.slice(5); // Get older ones to delete
    for (let item of excess) {
      await remove(ref(db, `clickHistory/${item.key}`)); // Remove from Firebase
    }
  }
}

// Function to update click history UI
function updateClickHistoryUI(snapshot) {
  let clicks = [];

  snapshot.forEach((childSnapshot) => {
    clicks.push(childSnapshot.val());
  });

  // Sort newest to oldest
  clicks.reverse();

  // Keep only the 5 most recent clicks
  clicks = clicks.slice(0, 5);

  // Clear and update UI
  clickHistoryList.innerHTML = "";
  clicks.forEach((timestamp) => {
    const listItem = document.createElement("li");
    listItem.textContent = `${formatDateTime(timestamp)} - Clicked!`;
    clickHistoryList.appendChild(listItem);
  });
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
clickableImage.addEventListener("click", () => {
  increment(); // Increase counter
  showFloatingText(); // Show floating text
});

// Listen for real-time updates
onValue(counterRef, (snapshot) => {
  const count = snapshot.exists() ? snapshot.val() : 0;
  document.getElementById("counter").innerText = count;

  triggerImageAnimation();
});

// Listen for real-time updates on click history
onValue(clickHistoryRef, (snapshot) => {
  updateClickHistoryUI(snapshot);
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
