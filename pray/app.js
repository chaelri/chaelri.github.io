import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  push,
  set,
  update,
  remove,
  increment,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import {
  getStorage,
  ref as sRef,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";

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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const storage = getStorage(app);

// DOM & State
const swiperEl = document.getElementById("swiper");
const introScreen = document.getElementById("intro-screen");
const appContent = document.getElementById("app-content");
const landingView = document.getElementById("view-landing");
const prayerView = document.getElementById("view-prayer");
const requestsModal = document.getElementById("modal-requests");
const confirmModal = document.getElementById("modal-confirm");
const stopPrayerModal = document.getElementById("modal-stop-prayer");
const checklistModal = document.getElementById("modal-add-checklist");
const exitPrayerBtn = document.getElementById("exit-prayer");
const abortPrayerBtn = document.getElementById("abort-prayer");
const requestInput = document.getElementById("new-request-input");
const addRequestBtn = document.getElementById("add-request-btn");
const lastPrayInfo = document.getElementById("last-pray-info");
const fireTransition = document.getElementById("fire-transition");
const imageViewer = document.getElementById("modal-image-viewer");
const viewerFullImg = document.getElementById("viewer-full-img");
const viewerProgressBar = document.getElementById("viewer-progress-bar");
const requestSendingOverlay = document.getElementById(
  "request-sending-overlay"
);
const checklistItemInput = document.getElementById("checklist-item-input");

let activeRequests = [];
let answeredRequests = [];
let currentTimer = null;
let currentTab = "active";
let pendingDeleteId = null;
let pendingImage = null;
let pendingChecklist = [];
let targetChecklistRequestId = null;
let isDirectPrayer = false;
let returnContext = "landing";
let currentStreak = 0;

// Initialization
window.addEventListener("load", () => {
  setTimeout(() => {
    introScreen.style.opacity = "0";
    appContent.classList.remove("opacity-0");
    setTimeout(() => introScreen.remove(), 500);
  }, 750);
  loadData();
  updateLastPrayedUI();
  setInterval(updateLastPrayedUI, 60000);
});

// Image Compression Tool
function compressImage(file, quality = 0.6, maxWidth = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function formatDate(timestamp) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

function loadData() {
  onValue(ref(db, "streak"), (snap) => {
    currentStreak = snap.val() || 0;
    document.getElementById("streak-count").innerText = currentStreak;
  });

  onValue(ref(db, "requests"), (snap) => {
    const data = snap.val() || {};
    const all = Object.entries(data).map(([id, val]) => ({ id, ...val }));
    activeRequests = all
      .filter((r) => !r.isAnswered)
      .sort((a, b) => b.createdAt - a.createdAt);
    answeredRequests = all
      .filter((r) => r.isAnswered)
      .sort((a, b) => b.createdAt - a.createdAt);
    renderLandingPreview();
    renderRequestsList(currentTab);
  });
}

function updateLastPrayedUI() {
  const last = JSON.parse(localStorage.getItem("last_prayer_record") || "null");
  if (!last) {
    lastPrayInfo.innerText = "Begin your journey today.";
    return;
  }
  const diff = Date.now() - last.timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  let timeStr = "Just now";
  if (days > 0) timeStr = `${days}d ago`;
  else if (hours > 0) timeStr = `${hours}hr ago`;
  else if (minutes > 0) timeStr = `${minutes}min ago`;
  lastPrayInfo.innerText =
    last.type === "acts"
      ? `Last prayed: ${timeStr}`
      : `Last prayed for ${last.name}: ${timeStr}`;
}

// Swiper Engine
let isDown = false,
  startX,
  scrollLeft;
swiperEl.addEventListener("mousedown", (e) => {
  isDown = true;
  swiperEl.style.scrollSnapType = "none";
  swiperEl.style.transition = "none";
  startX = e.pageX - swiperEl.offsetLeft;
  scrollLeft = swiperEl.scrollLeft;
});
window.addEventListener("mouseup", () => {
  if (!isDown) return;
  isDown = false;
  swiperEl.style.transition = "transform 0.5s cubic-bezier(0.2, 1, 0.3, 1)";
  swiperEl.style.transform = `translateX(0px)`;
  swiperEl.style.scrollSnapType = "x mandatory";
});
swiperEl.addEventListener("mousemove", (e) => {
  if (!isDown) return;
  e.preventDefault();
  const x = e.pageX - swiperEl.offsetLeft;
  const walk = x - startX;
  const maxScroll = swiperEl.scrollWidth - swiperEl.clientWidth;
  const currentScroll = scrollLeft - walk;
  if (currentScroll < 0) {
    swiperEl.style.transform = `translateX(${(walk - scrollLeft) * 0.3}px)`;
    swiperEl.scrollLeft = 0;
  } else if (currentScroll > maxScroll) {
    swiperEl.style.transform = `translateX(${
      (walk - (scrollLeft - maxScroll)) * 0.3
    }px)`;
    swiperEl.scrollLeft = maxScroll;
  } else {
    swiperEl.style.transform = `translateX(0px)`;
    swiperEl.scrollLeft = currentScroll;
  }
});
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !prayerView.classList.contains("hidden")) {
    e.preventDefault();
    swiperEl.scrollTo({
      left: swiperEl.scrollLeft + swiperEl.clientWidth,
      behavior: "smooth",
    });
  }
});

// ACTS Card Generation
function generatePrayerCards(isSingle = false, singleReq = null) {
  swiperEl.innerHTML = "";
  isDirectPrayer = isSingle;
  exitPrayerBtn.innerText = isSingle ? "End Prayer" : "End Session";
  let cards = [];
  if (isSingle && singleReq) {
    cards.push({
      ...singleReq,
      title: "Praying For",
      sub: singleReq.text,
      duration: 120,
      isRequest: true,
    });
  } else {
    cards = [
      {
        id: "a",
        title: "Adoration",
        sub: "Praise God for who He is.",
        duration: 60,
      },
      {
        id: "c",
        title: "Confession",
        sub: "Ask for forgiveness and turn away.",
        duration: 60,
      },
      {
        id: "t",
        title: "Thanksgiving",
        sub: "Gratitude for His blessings.",
        duration: 60,
      },
    ];
    const actsIncluded = activeRequests.filter(
      (r) => r.includeInActs !== false
    );
    if (actsIncluded.length > 0)
      actsIncluded.forEach((req) =>
        cards.push({
          ...req,
          title: "Supplication",
          sub: req.text,
          duration: 120,
          isRequest: true,
        })
      );
    else
      cards.push({
        id: "s-def",
        title: "Supplication",
        sub: "Bring your requests to God.",
        duration: 120,
      });
  }
  cards.forEach((data, idx) =>
    swiperEl.appendChild(createCardElement(data, idx === cards.length - 1))
  );
  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("active");
          startTimer(entry.target);
          if (entry.target.dataset.isRequest === "true")
            update(ref(db, `requests/${entry.target.dataset.id}`), {
              count: increment(1),
            });
        } else entry.target.classList.remove("active");
      });
    },
    { root: swiperEl, threshold: 0.6 }
  );
  document.querySelectorAll(".snap-point").forEach((p) => obs.observe(p));
  swiperEl.scrollTo({ left: 0, behavior: "instant" });
}

function createCardElement(data, isLast) {
  const div = document.createElement("div");
  div.className = "snap-point";
  div.dataset.id = data.id;
  div.dataset.name = data.sub;
  div.dataset.duration = data.duration;
  div.dataset.isRequest = data.isRequest || false;
  const hasImg = !!data.imageUrl;
  let checklistHtml =
    data.checklist?.length > 0
      ? `<div class="prayer-checklist custom-scrollbar">${data.checklist
          .map(
            (item) =>
              `<div class="prayer-checklist-item"><i class="material-icons text-[10px] mt-1">circle</i><span>${item}</span></div>`
          )
          .join("")}</div>`
      : "";
  const badgeHtml = data.isRequest
    ? `<div class="card-meta-top-left"><span class="badge-visible"><img src="assets/pray.png" class="w-3.5 h-3.5">${
        data.count || 0
      }x</span></div>`
    : "";

  if (hasImg) {
    div.innerHTML = `<div class="card is-polaroid">${badgeHtml}<h1>${
      data.title
    }</h1><div class="polaroid-container" onclick="window.viewImage('${
      data.imageUrl
    }')"><div class="polaroid-image-wrapper"><img src="${
      data.imageUrl
    }" class="polaroid-image"><svg class="timer-ring" viewBox="0 0 100 100"><rect x="2" y="2" width="96" height="96" /></svg></div><div class="polaroid-chin-text">${
      data.sub
    }</div></div>${checklistHtml}<div class="card-meta-footer">${
      !isLast
        ? `<span class="badge opacity-20 uppercase">PULL TO NEXT</span>`
        : ""
    }</div></div>`;
  } else {
    div.innerHTML = `<div class="card">${badgeHtml}<svg class="timer-ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" /></svg><h1>${
      data.title
    }</h1><p>${data.sub}</p>${checklistHtml}<div class="card-meta-footer">${
      !isLast
        ? `<span class="badge opacity-20 uppercase">PULL TO NEXT</span>`
        : ""
    }</div></div>`;
  }
  return div;
}

function startTimer(el) {
  if (currentTimer) clearInterval(currentTimer);
  const dur = parseInt(el.dataset.duration);
  const path = el.querySelector("circle, rect");
  const isRect = path.tagName.toLowerCase() === "rect";
  const circ = isRect ? 384 : 2 * Math.PI * 48;

  path.style.transition = "none";
  path.style.strokeDasharray = circ;
  path.style.strokeDashoffset = circ;
  path.getBoundingClientRect();

  let left = dur;
  left--;
  path.style.transition = "stroke-dashoffset 1s linear";
  path.style.strokeDashoffset = (left / dur) * circ;

  syncViewerProgressBar(left, dur);

  currentTimer = setInterval(() => {
    left--;
    path.style.strokeDashoffset = (left / dur) * circ;
    syncViewerProgressBar(left, dur);
    if (left <= 0) clearInterval(currentTimer);
  }, 1000);
}

function syncViewerProgressBar(left, dur) {
  if (!imageViewer.classList.contains("hidden")) {
    const percent = ((dur - left) / dur) * 100;
    viewerProgressBar.style.width = percent + "%";
  }
}

function runFireTransition(cb) {
  fireTransition.innerHTML = "";
  fireTransition.style.opacity = "1";
  const fragment = document.createDocumentFragment();
  const count = 15;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("div");
    p.className = "fire-particle animate-fire-blast";
    const sz = Math.random() * 150 + 100;
    p.style.width = p.style.height = sz + "px";
    const ang = Math.random() * Math.PI * 2,
      dist = Math.random() * 80 + 50;
    p.style.setProperty("--tx", Math.cos(ang) * dist + "vw");
    p.style.setProperty("--ty", Math.sin(ang) * dist + "vh");
    p.style.setProperty("--s", Math.random() * 4 + 2);
    p.style.setProperty("--r", Math.random() * 360 + "deg");
    p.style.animationDelay = Math.random() * 0.3 + "s";
    fragment.appendChild(p);
  }
  fireTransition.appendChild(fragment);
  setTimeout(cb, 600);
  setTimeout(() => {
    fireTransition.style.opacity = "0";
    setTimeout(() => (fireTransition.innerHTML = ""), 300);
  }, 1400);
}

// Checklist Modal Logic
document.getElementById("btn-add-check").onclick = () => {
  targetChecklistRequestId = null;
  checklistItemInput.value = "";
  checklistModal.classList.remove("hidden");
  checklistItemInput.focus();
};
function renderChecklistBuilder() {
  const builder = document.getElementById("checklist-builder");
  const preview = document.getElementById("checklist-items-preview");
  if (pendingChecklist.length === 0) {
    builder.classList.add("hidden");
    return;
  }
  builder.classList.remove("hidden");
  preview.innerHTML = pendingChecklist
    .map(
      (it, idx) =>
        `<div class="bg-blue-500/20 text-blue-300 text-[10px] font-bold px-2 py-1 rounded flex items-center gap-2"><span>${it}</span><button onclick="window.removePendingCheck(${idx})" class="material-icons text-[12px]">close</button></div>`
    )
    .join("");
}
window.removePendingCheck = (idx) => {
  pendingChecklist.splice(idx, 1);
  renderChecklistBuilder();
};
window.openAddChecklistToExisting = (id) => {
  targetChecklistRequestId = id;
  checklistItemInput.value = "";
  checklistModal.classList.remove("hidden");
  checklistItemInput.focus();
};
document.getElementById("btn-cancel-checklist").onclick = () => {
  checklistModal.classList.add("hidden");
  targetChecklistRequestId = null;
};
document.getElementById("btn-save-checklist-item").onclick = async () => {
  const val = checklistItemInput.value.trim();
  if (!val) return;
  if (targetChecklistRequestId) {
    const req = activeRequests.find((r) => r.id === targetChecklistRequestId);
    const existing = req.checklist || [];
    await update(ref(db, `requests/${targetChecklistRequestId}`), {
      checklist: [...existing, val],
    });
  } else {
    pendingChecklist.push(val);
    renderChecklistBuilder();
  }
  checklistModal.classList.add("hidden");
  targetChecklistRequestId = null;
};
window.removeChecklistItem = async (reqId, itemIndex) => {
  const req = activeRequests.find((r) => r.id === reqId);
  if (!req || !req.checklist) return;
  const newList = [...req.checklist];
  newList.splice(itemIndex, 1);
  await update(ref(db, `requests/${reqId}`), { checklist: newList });
};

// Actions
document.getElementById("start-acts").onclick = () => {
  returnContext = "landing";
  prayerView.classList.remove("hidden");
  generatePrayerCards();
};
abortPrayerBtn.onclick = () => stopPrayerModal.classList.remove("hidden");
document.getElementById("stop-no").onclick = () =>
  stopPrayerModal.classList.add("hidden");
document.getElementById("stop-yes").onclick = () => {
  if (currentTimer) clearInterval(currentTimer);
  stopPrayerModal.classList.add("hidden");
  prayerView.classList.add("hidden");
  isDirectPrayer && returnContext === "requests"
    ? requestsModal.classList.remove("hidden")
    : landingView.classList.remove("hidden");
};
exitPrayerBtn.onclick = () => {
  if (currentTimer) clearInterval(currentTimer);
  const cur = document.querySelector(".snap-point.active");
  localStorage.setItem(
    "last_prayer_record",
    JSON.stringify({
      timestamp: Date.now(),
      type: isDirectPrayer ? "single" : "acts",
      name: isDirectPrayer ? cur?.dataset.name || "Unknown" : null,
    })
  );
  runFireTransition(() => {
    prayerView.classList.add("hidden");
    if (!isDirectPrayer) set(ref(db, "streak"), currentStreak + 1);
    isDirectPrayer && returnContext === "requests"
      ? requestsModal.classList.remove("hidden")
      : landingView.classList.remove("hidden");
    updateLastPrayedUI();
  });
};
document.getElementById("open-requests").onclick = () =>
  requestsModal.classList.remove("hidden");
document.getElementById("close-requests").onclick = () =>
  requestsModal.classList.add("hidden");
requestInput.onkeyup = (e) => {
  if (e.key === "Enter") addRequestBtn.click();
};

addRequestBtn.onclick = async () => {
  const val = requestInput.value;
  if (!val) return;
  requestSendingOverlay.classList.remove("hidden");
  try {
    let imageUrl = null;
    if (pendingImage) {
      // Compress image before upload
      const compressedBlob = await compressImage(pendingImage);
      const sRefObj = sRef(storage, `prayers/${Date.now()}.jpg`);
      const snapshot = await uploadBytes(sRefObj, compressedBlob);
      imageUrl = await getDownloadURL(snapshot.ref);
    }
    await push(ref(db, "requests"), {
      text: val,
      imageUrl,
      isAnswered: false,
      count: 0,
      createdAt: Date.now(),
      includeInActs: true,
      checklist: pendingChecklist,
    });
    requestInput.value = "";
    pendingChecklist = [];
    renderChecklistBuilder();
    clearUpload();
  } catch (e) {
    alert("Failed to send.");
  } finally {
    requestSendingOverlay.classList.add("hidden");
  }
};

function renderLandingPreview() {
  const container = document.getElementById("landing-requests-preview");
  if (activeRequests.length === 0) {
    container.innerHTML = `<div class="py-8 px-4 bg-white/5 rounded-3xl border border-dashed border-white/10 opacity-60"><p class="text-sm font-bold">The silence is a holy space.</p></div>`;
    return;
  }
  container.innerHTML = activeRequests
    .slice(0, 3)
    .map(
      (req) =>
        `<div onclick="window.directPray('${
          req.id
        }', 'landing')" class="flex items-center gap-4 bg-white/5 p-4 rounded-3xl border border-white/5 active:bg-white/10 cursor-pointer transition-all"><div class="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400 overflow-hidden shrink-0">${
          req.imageUrl
            ? `<img src="${req.imageUrl}" class="w-full h-full object-cover">`
            : '<img src="assets/pray.png" class="w-7 h-7 object-contain">'
        }</div><div class="flex-1 text-left min-w-0"><p class="text-sm font-bold text-slate-300 truncate">${
          req.text
        }</p><p class="text-[8px] uppercase tracking-tighter text-slate-600 mt-1">Started ${formatDate(
          req.createdAt
        )} • ${req.count || 0} PRAYERS</p></div></div>`
    )
    .join("");
}

function renderRequestsList(tab) {
  currentTab = tab;
  const container = document.getElementById("requests-list");
  const data = tab === "active" ? activeRequests : answeredRequests;
  container.innerHTML = data
    .map(
      (req) => `
        <div class="bg-white/5 p-5 rounded-3xl border border-white/5 relative ${
          req.isAnswered ? "achievement-card" : ""
        }">
            ${
              !req.isAnswered
                ? `<button onclick="window.markAnswered('${req.id}')" class="absolute top-5 right-5 btn-subtle-check" title="Mark Answered"><i class="material-icons text-sm">check</i></button>`
                : `<button onclick="window.askDelete('${req.id}')" class="absolute top-5 right-5 w-9 h-9 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center"><i class="material-icons text-sm">delete</i></button>`
            }
            <div class="flex items-start gap-4">
                <div class="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400 overflow-hidden shrink-0 border border-white/5">${
                  req.imageUrl
                    ? `<img src="${req.imageUrl}" class="w-full h-full object-cover">`
                    : '<img src="assets/pray.png" class="w-7 h-7 object-contain">'
                }</div>
                <div class="flex-1 min-w-0 pr-10">
                    <p class="font-bold text-lg leading-tight break-words ${
                      req.isAnswered ? "glory-glow" : "text-white"
                    }">${req.text}</p>
                    <p class="text-[9px] uppercase tracking-widest text-slate-500 mt-1 font-bold italic">Lifting up since ${formatDate(
                      req.createdAt
                    )}</p>
                    <p class="text-[9px] text-blue-400/60 font-black mt-0.5">${
                      req.count || 0
                    } PRAYERS COMPLETED</p>
                    <div class="mt-3 flex flex-wrap gap-2">
                        ${(req.checklist || [])
                          .map(
                            (it, idx) =>
                              `<div class="checklist-tag"><span class="text-[8px] text-slate-400 font-bold">${it}</span>${
                                !req.isAnswered
                                  ? `<button onclick="window.removeChecklistItem('${req.id}', ${idx})" class="btn-delete-item"><i class="material-icons text-[12px]">close</i></button>`
                                  : ""
                              }</div>`
                          )
                          .join("")}
                        ${
                          !req.isAnswered
                            ? `<button onclick="window.openAddChecklistToExisting('${req.id}')" class="text-[8px] bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-xl text-blue-400 font-black tracking-widest uppercase hover:bg-blue-500/20 transition-colors">+ Item</button>`
                            : ""
                        }
                    </div>
                </div>
            </div>
            ${
              !req.isAnswered
                ? `<div class="mt-4 pt-4 border-t border-white/5 flex items-center gap-3"><button onclick="window.directPray('${
                    req.id
                  }', 'requests')" class="flex-1 btn-primary-pray py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-white">Pray Now</button><div class="flex items-center gap-3 px-3 bg-white/5 rounded-2xl py-1.5 h-full"><span class="text-[9px] text-slate-500 uppercase font-black">ACTS</span><label class="switch"><input type="checkbox" ${
                    req.includeInActs !== false ? "checked" : ""
                  } onchange="window.toggleActs('${
                    req.id
                  }', this.checked)"><span class="slider"></span></label></div></div>`
                : `<div class="mt-3"><span class="badge success">GOD HAS ANSWERED</span></div>`
            }
        </div>
    `
    )
    .join("");
}

// Global Handlers
window.markAnswered = (id) =>
  update(ref(db, `requests/${id}`), { isAnswered: true });
window.toggleActs = (id, val) =>
  update(ref(db, `requests/${id}`), { includeInActs: val });
window.directPray = (id, context = "landing") => {
  const req = activeRequests.find((r) => r.id === id);
  returnContext = context;
  if (context === "requests") requestsModal.classList.add("hidden");
  prayerView.classList.remove("hidden");
  generatePrayerCards(true, req);
};
window.askDelete = (id) => {
  pendingDeleteId = id;
  confirmModal.classList.remove("hidden");
};
window.viewImage = (url) => {
  viewerFullImg.src = url;
  imageViewer.classList.remove("hidden");
};
document.getElementById("close-viewer").onclick = () => {
  imageViewer.classList.add("hidden");
  viewerFullImg.src = "";
};
document.getElementById("confirm-yes").onclick = async () => {
  if (pendingDeleteId) {
    await remove(ref(db, `requests/${pendingDeleteId}`));
    pendingDeleteId = null;
    confirmModal.classList.add("hidden");
  }
};
document.getElementById("confirm-no").onclick = () =>
  confirmModal.classList.add("hidden");
document.getElementById("tab-active").onclick = (e) => {
  renderRequestsList("active");
  e.target.className =
    "text-blue-400 border-b-2 border-blue-400 pb-2 px-2 transition-all font-bold";
  document.getElementById("tab-answered").className =
    "text-slate-500 pb-2 px-2 transition-all";
};
document.getElementById("tab-answered").onclick = (e) => {
  renderRequestsList("answered");
  e.target.className =
    "text-blue-400 border-b-2 border-blue-400 pb-2 px-2 transition-all font-bold";
  document.getElementById("tab-active").className =
    "text-slate-500 pb-2 px-2 transition-all";
};
document.getElementById("image-upload").onchange = (e) => {
  pendingImage = e.target.files[0];
  if (pendingImage) {
    const r = new FileReader();
    r.onload = (ev) => {
      document.getElementById("preview-img").src = ev.target.result;
      document.getElementById("upload-preview").classList.remove("hidden");
    };
    r.readAsDataURL(pendingImage);
  }
};
function clearUpload() {
  pendingImage = null;
  document.getElementById("upload-preview").classList.add("hidden");
}
document.getElementById("clear-upload").onclick = clearUpload;
