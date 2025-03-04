// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  onValue,
  set,
  get,
  push,
  remove,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";

// Firebase configuration
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
const auth = getAuth();
const provider = new GoogleAuthProvider();

// Firebase references
const counterRef = ref(db, "counter");
const clickHistoryRef = ref(db, "clickHistory");
const chatRef = ref(db, "chat");
const typingRef = ref(db, "typing");

// UI elements
const floatingTextContainer = document.getElementById(
  "floating-text-container"
);
const clickableImage = document.getElementById("clickableImage");
const clickHistoryList = document.getElementById("click-history");
const apaSound = document.getElementById("apaSound");
const ilySound = document.getElementById("ilySound");
const whoAmIToYouSound = document.getElementById("whoAmIToYouSound");
const hmmmpSound = document.getElementById("hmmmpSound");
const chatModal = document.getElementById("chatModal");
const openChatBtn = document.getElementById("openChat");
const closeChatBtn = document.querySelector(".close-chat");
const messageInput = document.getElementById("messageInput");
const sendMessageBtn = document.getElementById("sendMessage");
const chatBox = document.getElementById("chatBox");
const typingCharlie = document.getElementById("typingCharlie");
const typingKarla = document.getElementById("typingKarla");
const loginContainer = document.getElementById("login-container");
const protectedContent = document.getElementById("protected-content");
const onlineStatus = document.getElementById("online-status");

// Constants
const floatingMessages = [
  "I miss you too!",
  "apa!",
  "mehehehe",
  "si lovee",
  "I love you!",
];
const allowedEmails = ["charliecayno@gmail.com", "kasromantico@gmail.com"];
let lastCount = 0;
let userInteracted = false;
let currentUserEmail = "";
const formattedUser =
  currentUserEmail === "charliecayno@gmail.com" ? "charlie" : "karla";\
console.log('formattedUser', formattedUser)
console.log('currentUserEmail', currentUserEmail)

// Function to show floating text
function showFloatingText() {
  const message =
    floatingMessages[Math.floor(Math.random() * floatingMessages.length)];
  const floatingText = document.createElement("div");
  floatingText.classList.add("floating-text");
  floatingText.innerText = message;

  const rect = clickableImage.getBoundingClientRect();
  const isLeft = Math.random() < 0.5;
  const offsetX = isLeft
    ? rect.left + window.scrollX + rect.width * -0.1
    : rect.left + window.scrollX + rect.width * 0.65;
  const offsetY = rect.top + window.scrollY - rect.height * 0.95;

  floatingText.style.left = `${offsetX}px`;
  floatingText.style.top = `${offsetY}px`;
  floatingTextContainer.appendChild(floatingText);

  setTimeout(() => floatingText.remove(), 2000);
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
  });
}

// Function to play random sound
function playRandomSound(count) {
  if (count % 100 === 0 && count !== 0) {
    ilySound.currentTime = 0;
    return ilySound
      .play()
      .catch((error) => console.log("Audio play failed:", error));
  }

  const randomNum = Math.random() * 100;
  let soundToPlay;

  if (randomNum < 55) {
    soundToPlay = apaSound;
  } else if (randomNum < 80) {
    soundToPlay = hmmmpSound;
  } else if (randomNum < 95) {
    soundToPlay = whoAmIToYouSound;
  } else {
    soundToPlay = ilySound;
  }

  soundToPlay.currentTime = 0;
  soundToPlay.play().catch((error) => console.log("Audio play failed:", error));
}

// Function to trigger image animation
function triggerImageAnimation() {
  clickableImage.classList.remove("heart-beat");
  void clickableImage.offsetWidth;
  clickableImage.classList.add("heart-beat");
}

// Function to send a browser notification
function sendNotification(count) {
  if (
    document.visibilityState === "hidden" &&
    Notification.permission === "granted"
  ) {
    new Notification("New Click!", {
      body: `Someone clicked! Miss counter: ${count}`,
      icon: "Chalee1.png",
    });
  }
}

// Function to increment counter
async function increment() {
  const snapshot = await get(counterRef);
  const currentCount = snapshot.exists() ? snapshot.val() : 0;
  const newCount = currentCount + 1;

  await set(counterRef, newCount);
  playRandomSound(newCount);
  triggerImageAnimation();

  const timestamp = new Date().toISOString();
  await set(counterRef, newCount);
  await push(clickHistoryRef, timestamp);
  await updateClickHistoryInFirebase();

  if ("vibrate" in navigator) {
    navigator.vibrate([100, 50, 200]);
  }
}

// Function to update click history in Firebase
async function updateClickHistoryInFirebase() {
  const snapshot = await get(clickHistoryRef);
  let clicks = [];

  snapshot.forEach((childSnapshot) => {
    clicks.push({ key: childSnapshot.key, value: childSnapshot.val() });
  });

  clicks.sort((a, b) => new Date(b.value) - new Date(a.value));

  if (clicks.length > 5) {
    const excess = clicks.slice(5);
    for (let item of excess) {
      await remove(ref(db, `clickHistory/${item.key}`));
    }
  }
}

// Function to update click history UI
function updateClickHistoryUI(snapshot) {
  let clicks = [];

  snapshot.forEach((childSnapshot) => {
    clicks.push(childSnapshot.val());
  });

  clicks.reverse();
  clicks = clicks.slice(0, 5);

  clickHistoryList.innerHTML = "";
  clicks.forEach((timestamp) => {
    const listItem = document.createElement("li");
    const timeAgo = getTimeAgo(new Date(timestamp));
    listItem.textContent = `${formatDateTime(timestamp)} | ${timeAgo}`;
    listItem.classList.add("visible");
    clickHistoryList.appendChild(listItem);

    setTimeout(() => listItem.classList.add("visible"), 100);
  });
}

// Function to calculate time ago
function getTimeAgo(date) {
  const now = Date.now();
  const diffInSeconds = Math.floor((now - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return `${diffInSeconds} sec ago`;
  } else if (diffInSeconds < 3600) {
    return `${Math.floor(diffInSeconds / 60)} min ago`;
  } else {
    return `${Math.floor(diffInSeconds / 3600)} hr ago`;
  }
}

// Function to update counter
async function updateCounter() {
  const snapshot = await get(counterRef);
  const count = snapshot.exists() ? snapshot.val() : 0;

  document.getElementById("counter").innerText = count;
  document.getElementById("counter-container").style.display = "block";
}

// Add click event listener
clickableImage.addEventListener("click", (event) => {
  increment();
  const x = event.clientX + window.scrollX;
  const y = event.clientY + window.scrollY;
  createParticles(x, y);
});

// Set the flag when the user interacts with the page
document.addEventListener("click", () => {
  userInteracted = true;
});

// Listen for real-time updates
onValue(counterRef, (snapshot) => {
  const count = snapshot.exists() ? snapshot.val() : 0;
  document.getElementById("counter").innerText = count;

  triggerImageAnimation();
  showFloatingText();

  if (userInteracted && "vibrate" in navigator) {
    navigator.vibrate([100, 50, 200]);
  }

  if (count > lastCount) {
    sendNotification(count);
  }

  lastCount = count;
});

// Listen for real-time updates on click history
onValue(clickHistoryRef, (snapshot) => {
  updateClickHistoryUI(snapshot);
});

// Set interval to update click history every second
setInterval(() => {
  get(clickHistoryRef).then((snapshot) => {
    updateClickHistoryUI(snapshot);
  });
}, 1000);

// Initial load
updateCounter();

// Initialize sounds on first user interaction
document.addEventListener(
  "click",
  function initializeAudio() {
    [apaSound, ilySound, whoAmIToYouSound, hmmmpSound].forEach((sound) => {
      sound
        .play()
        .then(() => {
          sound.pause();
          sound.currentTime = 0;
        })
        .catch(console.error);
    });

    document.removeEventListener("click", initializeAudio);
  },
  { once: true }
);

// Request notification permission when the page loads
document.addEventListener("DOMContentLoaded", () => {
  if (Notification.permission !== "granted") {
    Notification.requestPermission();
  }
});

// Function to create particle effects
function createParticles(x, y) {
  const numParticles = 15;

  for (let i = 0; i < numParticles; i++) {
    const particle = document.createElement("div");
    particle.classList.add("particle");

    const angle = Math.random() * 2 * Math.PI;
    const speed = Math.random() * 5 + 2;
    const velocityX = Math.cos(angle) * speed;
    const velocityY = Math.sin(angle) * speed;

    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;
    document.body.appendChild(particle);

    setTimeout(() => {
      particle.style.transform = `translate(${velocityX * 15}px, ${
        velocityY * 15
      }px)`;
      particle.style.opacity = "0";
    }, 10);

    setTimeout(() => particle.remove(), 1000);
  }
}

// Open & close chat modal
openChatBtn.addEventListener("click", () => {
  chatModal.style.display = "flex";
  setTimeout(scrollToBottom, 100);
});
closeChatBtn.addEventListener(
  "click",
  () => (chatModal.style.display = "none")
);

// Send message (Enter to send, Shift + Enter for new line)
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessageBtn.click();
  }
});

// Send message to Firebase
sendMessageBtn.addEventListener("click", async () => {
  const message = messageInput.value.trim();
  if (!message) return;

  await push(chatRef, {
    user: formattedUser,
    message,
    timestamp: new Date().toISOString(),
  });

  messageInput.value = "";
  updateTypingStatus("");
});

// Function to scroll chat to the latest message
function scrollToBottom() {
  chatBox.scrollTop = chatBox.scrollHeight;
}

// Listen for new messages & display in chat
onValue(chatRef, (snapshot) => {
  chatBox.innerHTML = "";

  let messages = [];
  snapshot.forEach((child) => {
    messages.push(child.val());
  });

  messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  messages.forEach(({ user, message, timestamp }) => {
    const chatBubble = document.createElement("div");
    chatBubble.classList.add("chat-bubble", user);

    const displayName = user === "charlie" ? "Chalee" : "Karlyy";
    chatBubble.classList.add(
      user === formattedUser ? "sent-message" : "received-message"
    );
    chatBubble.innerHTML = `<strong>${displayName}</strong>: ${message} <br><small>${formatTime(
      timestamp
    )}</small>`;
    chatBox.appendChild(chatBubble);
  });

  setTimeout(scrollToBottom, 100);
});

// Real-time typing updates
messageInput.addEventListener("input", () => {
  updateTypingStatus(messageInput.value);
});

// Listen for typing updates & show real-time typing
onValue(typingRef, (snapshot) => {
  const data = snapshot.val();
  typingCharlie.innerText = data?.karla
    ? `Karla is typing: "${data.karla}"`
    : "";
  typingKarla.innerText = data?.charlie
    ? `Charlie is typing: "${data.charlie}"`
    : "";
});

// Update typing status in Firebase
async function updateTypingStatus(text) {
  await set(ref(db, `typing/${formattedUser}`), text);
}

// Format timestamp for chat messages
function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// Google Sign-In function
document.getElementById("googleSignIn").addEventListener("click", async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    if (!allowedEmails.includes(user.email)) {
      alert("Access Denied: Your email is not authorized.");
      await firebaseSignOut(auth);
      return;
    }

    currentUserEmail = user.email;
    loginContainer.style.display = "none";
    protectedContent.style.display = "block";
    updateOnlineStatus(user.email, true);
  } catch (error) {
    console.error("Google Sign-In Failed:", error);
  }
});

// Handle UI after login
function updateUI(email) {
  loginContainer.style.display = "none";
  protectedContent.style.display = "block";
  trackOnlineStatus();
}

// Sign out function
document
  .getElementById("sign-out-button")
  .addEventListener("click", async () => {
    try {
      await firebaseSignOut(auth);
      loginContainer.style.display = "block";
      protectedContent.style.display = "none";

      if (currentUserEmail) {
        remove(ref(db, `onlineUsers/${currentUserEmail.replace(".", "_")}`));
        currentUserEmail = "";
      }

      console.log("User signed out.");
    } catch (error) {
      console.error("Sign-out error:", error);
    }
  });

// Track online status in Firebase
function updateOnlineStatus(email, isOnline) {
  const emailKey = email.replace(/\./g, "_");
  if (isOnline) {
    set(ref(db, `onlineUsers/${emailKey}`), {
      online: true,
      timestamp: Date.now(),
    });
  } else {
    remove(ref(db, `onlineUsers/${emailKey}`));
  }
}

// Detect auth state change
onAuthStateChanged(auth, (user) => {
  if (user && allowedEmails.includes(user.email)) {
    currentUserEmail = user.email;
    updateUI(user.email);
    updateOnlineStatus(user.email, true);
  } else {
    signOut();
  }
});

// Listen for Karla's online status
function trackOnlineStatus() {
  const userEmail = currentUserEmail;
  let otherUserEmailKey = "";
  let otherUserName = "";

  if (userEmail === "charliecayno@gmail.com") {
    otherUserEmailKey = "kasromantico@gmail_com";
    otherUserName = "Karla";
  } else if (userEmail === "kasromantico@gmail.com") {
    otherUserEmailKey = "charliecayno@gmail_com";
    otherUserName = "Charlie";
  } else {
    console.error("User email not recognized for tracking.");
    return;
  }

  onValue(ref(db, `onlineUsers/${otherUserEmailKey}`), (snapshot) => {
    const onlineStatusElement = document.getElementById("online-status");

    if (snapshot.exists() && snapshot.val().online) {
      onlineStatusElement.innerHTML = `${otherUserName} is 🟢 Online`;
    } else {
      const lastSeen = snapshot.exists() ? snapshot.val().timestamp : null;
      onlineStatusElement.innerHTML = lastSeen
        ? `${otherUserName} is 🔴 Offline (Last seen ${timeAgo(lastSeen)})`
        : `${otherUserName} is 🔴 Offline`;
    }
  });
}

// Function to calculate time ago
function timeAgo(timestamp) {
  const now = Date.now();
  const diffInSeconds = Math.floor((now - timestamp) / 1000);

  if (diffInSeconds < 60) {
    return `${diffInSeconds} sec ago`;
  } else if (diffInSeconds < 3600) {
    return `${Math.floor(diffInSeconds / 60)} min ago`;
  } else if (diffInSeconds < 86400) {
    return `${Math.floor(diffInSeconds / 3600)} hr ago`;
  } else {
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
}

// Handle window unload event
window.addEventListener("beforeunload", () => {
  if (currentUserEmail) {
    set(ref(db, `onlineUsers/${currentUserEmail.replace(".", "_")}`), {
      online: false,
      timestamp: Date.now(),
    });
  }
});
