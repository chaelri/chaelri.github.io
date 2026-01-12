// =============================
// Firebase config
// =============================
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
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const bloomRef = db.ref("bloom_items");

// --- Data State ---
let items = [];
const COLORS = [
  "#FF5C8D", // Strawberry
  "#5C7AFF", // Blueberry
  "#FF9F43", // Peach
  "#28C76F", // Apple
  "#9F44FF", // Grape
  "#00CFE8", // Sky
  "#FF6B6B", // Watermelon
  "#10AC84", // Mint
  "#54A0FF", // Ice
  "#Feca57", // Honey
];
let selectedColor = COLORS[0];

// --- Physics State ---
const physicsBubbles = new Map();
let isFocusMode = false;
let evCache = [];
let prevDiff = -1;
let lastInteractionTime = Date.now();
let shakePermissionGranted = false;

// --- Initialization ---
function init() {
  setupColorPicker();
  createPollen();
  createLavaLamp();
  setupGestures();
  setupShakeDetector();

  bloomRef.on("value", (snapshot) => {
    const data = snapshot.val();
    if (data) {
      items = Object.keys(data).map((key) => ({
        id: key,
        ...data[key],
        taps: data[key].taps || [],
      }));
    } else {
      items = [];
    }
    renderBubbles();
    updateLavaDominantColor();
    wakeAll();
  });

  setTimeout(() => {
    const intro = document.getElementById("intro");
    if (intro) {
      intro.style.opacity = "0";
      intro.style.transform = "scale(1.1)";
      intro.style.pointerEvents = "none";
      setTimeout(() => intro.remove(), 1000);
    }
  }, 2500);

  requestAnimationFrame(updatePhysics);
}

function createPollen() {
  const container = document.getElementById("viewport");
  for (let i = 0; i < 15; i++) {
    const p = document.createElement("div");
    p.className = "pollen";
    const size = 2 + Math.random() * 5;
    p.style.width = `${size}px`;
    p.style.height = `${size}px`;
    p.style.left = `${Math.random() * 100}%`;
    p.style.top = `${Math.random() * 100}%`;
    p.style.setProperty("--tx", `${(Math.random() - 0.5) * 100}px`);
    p.style.setProperty("--ty", `${(Math.random() - 0.5) * 100}px`);
    p.style.setProperty("--d", `${20 + Math.random() * 20}s`);
    container.appendChild(p);
  }
}

function createLavaLamp() {
  const container = document.getElementById("lava-bg");
  for (let i = 0; i < 3; i++) {
    const blob = document.createElement("div");
    blob.className = "lava-blob";
    blob.style.left = `${Math.random() * 60}%`;
    blob.style.top = `${Math.random() * 60}%`;
    blob.style.setProperty("--d", `${15 + Math.random() * 15}s`);
    container.appendChild(blob);
  }
}

function updateLavaDominantColor() {
  if (items.length === 0) return;
  const colorCounts = {};
  items.forEach((item) => {
    colorCounts[item.color] = (colorCounts[item.color] || 0) + item.taps.length;
  });
  const sortedColors = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]);
  const dominantColor = sortedColors[0][0];
  document.documentElement.style.setProperty("--lava-dominant", dominantColor);
}

function setupGestures() {
  const el = document.body;
  el.onpointerdown = (ev) => evCache.push(ev);
  el.onpointermove = (ev) => {
    for (let i = 0; i < evCache.length; i++) {
      if (ev.pointerId == evCache[i].pointerId) {
        evCache[i] = ev;
        break;
      }
    }
    if (evCache.length == 2) {
      const curDiff = Math.abs(evCache[0].clientX - evCache[1].clientX);
      if (prevDiff > 0) {
        if (curDiff > prevDiff + 15 && !isFocusMode) toggleFocusMode(true);
        else if (curDiff < prevDiff - 15 && isFocusMode) toggleFocusMode(false);
      }
      prevDiff = curDiff;
    }
  };
  el.onpointerup = el.onpointercancel = (ev) => {
    evCache = evCache.filter((p) => p.pointerId !== ev.pointerId);
    if (evCache.length < 2) prevDiff = -1;
  };
}

// --- Shake Logic (iPhone Compatible) ---
function setupShakeDetector() {
  let lastShake = 0;
  const shakeThreshold = 18;

  window.addEventListener("devicemotion", (event) => {
    const acc = event.accelerationIncludingGravity;
    if (!acc) return;

    const totalAcc = Math.abs(acc.x) + Math.abs(acc.y) + Math.abs(acc.z);
    const now = Date.now();

    if (totalAcc > shakeThreshold && now - lastShake > 1000) {
      lastShake = now;
      scatterBubbles();
    }
  });
}

async function requestMotionPermission() {
  if (typeof DeviceMotionEvent.requestPermission === "function") {
    try {
      const permission = await DeviceMotionEvent.requestPermission();
      if (permission === "granted") {
        shakePermissionGranted = true;
        renderHistory(); // Refresh the list to hide button
      }
    } catch (e) {
      console.error(e);
    }
  } else {
    // Non-iOS devices don't need explicit permission
    shakePermissionGranted = true;
  }
}

function scatterBubbles() {
  if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
  wakeAll();
  physicsBubbles.forEach((b) => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 20 + Math.random() * 30;
    b.vx = Math.cos(angle) * speed;
    b.vy = Math.sin(angle) * speed;
  });
}

function toggleFocusMode(active) {
  isFocusMode = active;
  lastInteractionTime = Date.now();
  wakeAll();
  if (navigator.vibrate) navigator.vibrate(active ? [30, 40] : 30);
  renderBubbles();
}

function wakeAll() {
  physicsBubbles.forEach((b) => (b.isSleeping = false));
}

// --- Physics Engine ---
function updatePhysics() {
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  const friction = 0.75;
  const attractionStrength = 0.04;
  const repulsionStrength = 0.2;
  const sleepThreshold = 0.06;

  physicsBubbles.forEach((b, id) => {
    if (b.isSleeping) return;

    const dx = centerX - b.x;
    const dy = centerY - b.y;
    b.vx += dx * attractionStrength;
    b.vy += dy * attractionStrength;

    physicsBubbles.forEach((other, otherId) => {
      if (id === otherId) return;
      const distDx = b.x - other.x;
      const distDy = b.y - other.y;
      const dist = Math.sqrt(distDx * distDx + distDy * distDy);
      const minDist = b.radius + other.radius;

      if (dist < minDist) {
        const angle = Math.atan2(distDy, distDx);
        const force = (minDist - dist) * repulsionStrength;
        b.vx += Math.cos(angle) * force;
        b.vy += Math.sin(angle) * force;
      }
    });

    b.vx *= friction;
    b.vy *= friction;

    if (
      Math.abs(b.vx) < sleepThreshold &&
      Math.abs(b.vy) < sleepThreshold &&
      Math.abs(dx) < 3 &&
      Math.abs(dy) < 3
    ) {
      b.vx = 0;
      b.vy = 0;
      b.isSleeping = true;
    }

    b.x += b.vx;
    b.y += b.vy;

    const el = document.getElementById(`bubble-${id}`);
    if (el) {
      el.style.left = `${b.x - b.radius}px`;
      el.style.top = `${b.y - b.radius}px`;
    }
  });

  requestAnimationFrame(updatePhysics);
}

function renderBubbles() {
  const container = document.getElementById("bubble-container");
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;

  const sorted = [...items].sort(
    (a, b) => (b.lastTappedAt || 0) - (a.lastTappedAt || 0)
  );

  sorted.forEach((item, index) => {
    const tapCount = item.taps.length;
    const baseSize = 100;
    const size = Math.min(210, baseSize + tapCount * 1.6);
    const radius = size / 2;

    let bubble = document.getElementById(`bubble-${item.id}`);

    if (!bubble) {
      bubble = document.createElement("div");
      bubble.id = `bubble-${item.id}`;
      bubble.className = "bubble";
      bubble.onpointerdown = (e) => {
        e.preventDefault();
        handleTap(item.id, e);
      };
      container.appendChild(bubble);

      physicsBubbles.set(item.id, {
        x: centerX + (Math.random() - 0.5) * 50,
        y: centerY + (Math.random() - 0.5) * 50,
        vx: 0,
        vy: 0,
        radius: radius,
        isSleeping: false,
      });
    }

    const b = physicsBubbles.get(item.id);
    b.radius = radius;

    if (isFocusMode && index > 0) bubble.classList.add("focus-hidden");
    else bubble.classList.remove("focus-hidden");

    bubble.style.width = `${size}px`;
    bubble.style.height = `${size}px`;
    bubble.style.backgroundColor = item.color;
    bubble.style.color = item.color;
    bubble.style.zIndex = 100 - index;

    const oldRing = bubble.querySelector(".plasma-ring");
    if (oldRing) oldRing.remove();

    if (index === 0 && items.length > 0) {
      bubble.classList.add("bubble-priority");
      const ring = document.createElement("div");
      ring.className = "plasma-ring";
      bubble.appendChild(ring);
    } else {
      bubble.classList.remove("bubble-priority");
    }

    let content = bubble.querySelector(".bubble-content");
    if (!content) {
      content = document.createElement("div");
      content.className =
        "bubble-content flex flex-col items-center pointer-events-none text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]";
      bubble.appendChild(content);
    }
    content.innerHTML = `
            <span class="leading-tight px-3 text-[0.95rem] font-extrabold">${item.text}</span>
            <div class="mt-1.5 bg-black/30 rounded-full px-2.5 py-0.5 text-[0.65rem] font-black border border-white/10">${tapCount}</div>
        `;
  });

  physicsBubbles.forEach((_, id) => {
    if (!items.find((i) => i.id === id)) {
      physicsBubbles.delete(id);
      const el = document.getElementById(`bubble-${id}`);
      if (el) el.remove();
    }
  });
}

function handleTap(id, e) {
  const item = items.find((i) => i.id === id);
  if (!item) return;

  lastInteractionTime = Date.now();
  wakeAll();

  if (navigator.vibrate) navigator.vibrate(25);

  const rect = e.currentTarget.getBoundingClientRect();
  const bx = rect.left + rect.width / 2;
  const by = rect.top + rect.height / 2;

  createImpactEffect(bx, by, item.color);
  createSparkles(bx, by, item.color);

  const shockwaveStrength = 8;
  physicsBubbles.forEach((b, bid) => {
    if (bid === id) return;
    const dx = b.x - bx;
    const dy = b.y - by;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 400) {
      const angle = Math.atan2(dy, dx);
      const force = (1 - dist / 400) * shockwaveStrength;
      b.vx += Math.cos(angle) * force;
      b.vy += Math.sin(angle) * force;
      b.isSleeping = false;
    }
  });

  e.currentTarget.classList.remove("bubble-pop");
  void e.currentTarget.offsetWidth;
  e.currentTarget.classList.add("bubble-pop");

  const now = Date.now();
  item.taps.push(now);
  item.lastTappedAt = now;
  bloomRef.child(id).update({ lastTappedAt: now, taps: item.taps });
}

function createImpactEffect(x, y, color) {
  const ring = document.createElement("div");
  ring.className = "impact-ring";
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;
  ring.style.borderColor = color;
  document.body.appendChild(ring);
  setTimeout(() => ring.remove(), 600);
}

function createSparkles(x, y, color) {
  for (let i = 0; i < 10; i++) {
    const s = document.createElement("div");
    s.className = "sparkle";
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.style.backgroundColor = color;
    s.style.setProperty("--sx", `${(Math.random() - 0.5) * 400}px`);
    s.style.setProperty("--sy", `${(Math.random() - 0.5) * 400}px`);
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 700);
  }
}

// --- UI Actions ---
function setupColorPicker() {
  const grid = document.querySelector(".color-grid");
  COLORS.forEach((color) => {
    const dot = document.createElement("div");
    dot.className = "color-dot";
    dot.style.backgroundColor = color;
    dot.onclick = () => {
      selectedColor = color;
      document
        .querySelectorAll(".color-dot")
        .forEach((d) => d.classList.remove("selected"));
      dot.classList.add("selected");
    };
    if (color === selectedColor) dot.classList.add("selected");
    grid.appendChild(dot);
  });
}

function addItem() {
  const input = document.getElementById("newItemText");
  if (!input.value.trim()) return;
  wakeAll();
  bloomRef.push({
    text: input.value.trim(),
    color: selectedColor,
    createdAt: Date.now(),
    lastTappedAt: Date.now(),
    taps: [Date.now()],
  });
  input.value = "";
  closePanels();
}

function deleteItem(id) {
  if (confirm("Let go of this focus?")) {
    bloomRef.child(id).remove();
    renderHistory();
  }
}

function openPanel(type) {
  document.getElementById("overlay").classList.add("active");
  if (type === "add") document.getElementById("addPanel").classList.add("open");
  else {
    renderHistory();
    document.getElementById("statsPanel").classList.add("open");
  }
}

function closePanels() {
  document.getElementById("overlay").classList.remove("active");
  document
    .querySelectorAll(".panel")
    .forEach((p) => p.classList.remove("open"));
}

function renderHistory() {
  const list = document.getElementById("historyList");
  list.innerHTML = "";

  // iOS Motion Permission Button
  if (
    !shakePermissionGranted &&
    typeof DeviceMotionEvent.requestPermission === "function"
  ) {
    const permBtn = document.createElement("button");
    permBtn.className =
      "w-full bg-indigo-600 text-white p-5 rounded-3xl font-black mb-6 animate-pulse";
    permBtn.innerHTML = "Enable Shake Tracking";
    permBtn.onclick = requestMotionPermission;
    list.appendChild(permBtn);
  }

  [...items]
    .sort((a, b) => b.lastTappedAt - a.lastTappedAt)
    .forEach((item) => {
      const div = document.createElement("div");
      div.className =
        "bg-white/[0.05] rounded-[28px] p-6 flex justify-between items-center mb-4 border border-white/5";
      div.innerHTML = `
            <div class="flex-1">
                <div class="flex items-center gap-3 mb-1">
                    <div class="w-3 h-3 rounded-full shadow-[0_0_8px_currentColor]" style="background:${
                      item.color
                    }; color:${item.color}"></div>
                    <h3 class="font-extrabold text-lg tracking-tight text-white">${
                      item.text
                    }</h3>
                </div>
                <div class="opacity-40 text-[10px] font-black uppercase tracking-widest text-white">Added ${new Date(
                  item.createdAt
                ).toLocaleDateString()}</div>
            </div>
            <div class="text-right flex flex-col items-end gap-2">
                <span class="text-2xl font-black gradient-text">${
                  item.taps.length
                }</span>
                <button onclick="deleteItem('${
                  item.id
                }')" class="text-[10px] text-white/20 uppercase font-black hover:text-red-400 transition-colors">Dismiss</button>
            </div>
        `;
      list.appendChild(div);
    });
}

init();
