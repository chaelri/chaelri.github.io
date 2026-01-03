import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  push,
  remove,
  update,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyB8ahT56WbEUaGAymsRNNA-DrfZnUnWIwk",
  authDomain: "test-database-55379.firebaseapp.com",
  databaseURL:
    "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "test-database-55379",
  storageBucket: "test-database-55379.firebasestorage.app",
  messagingSenderId: "933688602756",
  appId: "1:933688602756:web:392a3a4ce040cb9d4452d1",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let currentView = "month";
let selectedDate = new Date();
selectedDate.setHours(0, 0, 0, 0);

let allTasks = [];
let draggingElement = null;
let editingTaskId = null;
let deletingTaskId = null;
let isDumpCollapsed = false;
let selectedEditColor = "blue";

const formatLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

window.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") {
    document.documentElement.classList.add("dark");
  } else if (
    !savedTheme &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    // Optional: Follow system preference if user hasn't toggled yet
    document.documentElement.classList.add("dark");
  }
  fetchTasks();
  setupDragSystem();
  document
    .getElementById("task-input")
    .addEventListener(
      "keydown",
      (e) => e.key === "Enter" && addTaskFromInput()
    );
});

function fetchTasks() {
  onValue(ref(db, "tasks"), (snap) => {
    const data = snap.val();
    allTasks = data
      ? Object.entries(data).map(([id, val]) => ({ id, ...val }))
      : [];
    allTasks.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    renderCalendar();
    renderSidebars();
  });
}

window.renderCalendar = () => {
  const isMobile = window.innerWidth < 768;
  const label = document.getElementById("current-range-text");
  if (isMobile) {
    document.getElementById("desktop-view-container").classList.add("hidden");
    document.getElementById("mobile-view-container").classList.remove("hidden");
    renderMobile3Row(label);
  } else {
    document
      .getElementById("desktop-view-container")
      .classList.remove("hidden");
    document.getElementById("mobile-view-container").classList.add("hidden");
    renderDesktopView(label);
  }
};

function renderDesktopView(label) {
  const container = document.getElementById("calendar-view-container");
  container.innerHTML = "";
  ["day", "week", "month"].forEach((v) => {
    const btn = document.getElementById(`btn-${v}`);
    btn.className =
      v === currentView
        ? "px-4 py-1.5 rounded-lg text-sm bg-white dark:bg-slate-700 shadow-sm font-bold text-blue-600 dark:text-blue-400"
        : "px-4 py-1.5 rounded-lg text-sm text-slate-400 hover:text-slate-900 dark:hover:text-white";
  });

  if (currentView === "month") renderMonthView(container, label);
  else if (currentView === "week") renderWeekView(container, label);
  else renderDayView(container, label);
}

function renderMonthView(container, label) {
  container.className = "view-month flex-1";
  label.innerText = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(selectedDate);
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach(
    (d) => (container.innerHTML += `<div class="month-header">${d}</div>`)
  );

  const year = selectedDate.getFullYear(),
    month = selectedDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay(),
    daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = formatLocal(new Date());

  for (let i = 0; i < firstDay; i++)
    container.innerHTML += `<div class="bg-slate-50/50 dark:bg-slate-900/50"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatLocal(new Date(year, month, d));
    const isToday = dateStr === todayStr;
    container.innerHTML += `
            <div class="month-cell ${isToday ? "today-cell" : ""}">
                <div class="p-2 text-right text-[10px] font-black ${
                  isToday
                    ? "text-blue-600"
                    : "text-slate-300 dark:text-slate-600"
                }">${d}</div>
                <div class="cell-content" data-date="${dateStr}">${allTasks
      .filter((t) => t.date === dateStr)
      .map((t) => createTaskPill(t))
      .join("")}</div>
            </div>`;
  }
}

function renderWeekView(container, label) {
  container.className = "view-week flex-1 bg-white dark:bg-slate-950";
  const start = new Date(selectedDate);
  start.setDate(selectedDate.getDate() - selectedDate.getDay());
  label.innerText = `Week of ${start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = formatLocal(d);
    container.innerHTML += `<div class="week-column"><div class="week-header"><div class="day-name font-bold text-[10px] text-slate-400 uppercase">${d.toLocaleDateString(
      undefined,
      { weekday: "short" }
    )}</div><div class="day-num font-black text-xl">${d.getDate()}</div></div><div class="cell-content" data-date="${dateStr}">${allTasks
      .filter((t) => t.date === dateStr)
      .map((t) => createTaskPill(t))
      .join("")}</div></div>`;
  }
}

function renderDayView(container, label) {
  container.className = "view-day flex-1 bg-white dark:bg-slate-950";
  const dateStr = formatLocal(selectedDate);
  label.innerText = selectedDate.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // Restore dynamic Focus Text
  const focusText = getDynamicFocusText(selectedDate);

  container.innerHTML = `<div class="max-w-4xl mx-auto"><h3 class="text-blue-600 font-black text-[10px] uppercase tracking-widest mb-8 border-b pb-4">FOCUS FOR ${focusText}</h3><div class="cell-content" data-date="${dateStr}">${allTasks
    .filter((t) => t.date === dateStr)
    .map((t) => createTaskPill(t))
    .join("")}</div></div>`;
}

// UPDATE: Improved HTML structure for the pill to prevent stacking
function createTaskPill(task) {
  const time = task.allDay
    ? `<span class="opacity-40 font-bold mr-1 text-[8px] shrink-0">ALL-DAY</span>`
    : task.time
    ? `<span class="opacity-30 font-bold mr-1 text-[9px] shrink-0">${task.time}</span>`
    : "";

  const colorClass = `color-${task.color || "blue"}`;
  const descIcon = task.desc
    ? `<span class="material-icons text-[10px] ml-1 opacity-40 shrink-0">notes</span>`
    : "";

  return `
    <div class="task-pill ${colorClass}" data-id="${task.id}" onpointerdown="handlePillDown(event)">
      <div class="flex items-center min-w-0 flex-1">
        ${time}
        <span class="truncate font-bold tracking-tight flex-1">${task.title}</span>
        ${descIcon}
      </div>
      <div class="flex gap-1 ml-1 shrink-0">
        <button onclick="openEditModal('${task.id}')" class="material-icons text-[14px] opacity-20 hover:opacity-100">edit</button>
        <button onclick="deleteTask('${task.id}')" class="material-icons text-[14px] opacity-20 hover:opacity-100">delete</button>
      </div>
    </div>`;
}

// MODAL CONTROLS
window.openEditModal = (id) => {
  const t = allTasks.find((x) => x.id === id);
  if (!t) return;
  editingTaskId = id;
  // FIXED: Removed the invalid "no-task-selected" line causing the error
  document.getElementById("edit-task-name").value = t.title || "";
  document.getElementById("edit-task-desc").value = t.desc || "";
  document.getElementById("edit-task-date").value = t.date || "";
  document.getElementById("edit-task-time").value = t.time || "";
  document.getElementById("edit-task-allday").checked = t.allDay || false;
  toggleTimeInput(t.allDay || false);
  setEditColor(t.color || "blue");
  document.getElementById("edit-modal").classList.remove("hidden");
};

window.closeModal = () =>
  document.getElementById("edit-modal").classList.add("hidden");

window.saveTaskEdit = async () => {
  if (!editingTaskId) return;
  const isAllDay = document.getElementById("edit-task-allday").checked;
  await update(ref(db, `tasks/${editingTaskId}`), {
    title: document.getElementById("edit-task-name").value,
    desc: document.getElementById("edit-task-desc").value,
    date: document.getElementById("edit-task-date").value,
    time: isAllDay ? "" : document.getElementById("edit-task-time").value,
    allDay: isAllDay,
    color: selectedEditColor,
  });
  closeModal();
};

window.setEditColor = (color) => {
  selectedEditColor = color;
  ["blue", "green", "red", "purple"].forEach((c) => {
    const btn = document.getElementById(`color-${c}`);
    btn.style.boxShadow = c === color ? "0 0 0 2px #94a3b8" : "none";
  });
};

window.toggleTimeInput = (isAllDay) => {
  const input = document.getElementById("edit-task-time");
  input.classList.toggle("opacity-30", isAllDay);
  input.classList.toggle("pointer-events-none", isAllDay);
};

window.toggleDarkMode = () => {
  const isDark = document.documentElement.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
};
window.goToToday = () => {
  selectedDate = new Date();
  selectedDate.setHours(0, 0, 0, 0);
  currentView = "month";
  renderCalendar();
};
window.prevPeriod = () => {
  const isMobile = window.innerWidth < 768;
  if (isMobile || currentView === "month") {
    selectedDate.setMonth(selectedDate.getMonth() - 1);
  } else if (currentView === "week") {
    selectedDate.setDate(selectedDate.getDate() - 7);
  } else {
    selectedDate.setDate(selectedDate.getDate() - 1);
  }
  renderCalendar();
};
window.nextPeriod = () => {
  const isMobile = window.innerWidth < 768;
  if (isMobile || currentView === "month") {
    selectedDate.setMonth(selectedDate.getMonth() + 1);
  } else if (currentView === "week") {
    selectedDate.setDate(selectedDate.getDate() + 7);
  } else {
    selectedDate.setDate(selectedDate.getDate() + 1);
  }
  renderCalendar();
};
window.changeView = (v) => {
  currentView = v;
  renderCalendar();
};
// UPDATE: Restore full sidebar toggle logic for both Mobile and Desktop
window.toggleSidebar = () => {
  const sidebar = document.getElementById("sidebar");
  const isMobile = window.innerWidth < 768;

  if (isMobile) {
    // Mobile uses translation
    sidebar.classList.toggle("-translate-x-full");
  } else {
    // Desktop uses width collapse
    sidebar.classList.toggle("sidebar-collapsed");
  }
};

window.addTaskFromInput = () => {
  const input = document.getElementById("task-input");
  if (input.value.trim()) {
    push(ref(db, "tasks"), {
      title: input.value,
      desc: "",
      date: "",
      time: "",
      allDay: true,
      color: "blue",
    });
    input.value = "";
  }
};

window.addMobileTask = () => {
  const input = document.getElementById("mobile-dump-input");
  if (input.value.trim()) {
    push(ref(db, "tasks"), {
      title: input.value,
      desc: "",
      date: formatLocal(selectedDate),
      time: "",
      allDay: true,
      color: "blue",
    });
    input.value = "";
  }
};

window.deleteTask = (id) => {
  deletingTaskId = id;
  document.getElementById("delete-modal").classList.remove("hidden");
};
window.closeDeleteModal = () =>
  document.getElementById("delete-modal").classList.add("hidden");
window.confirmDelete = async () => {
  if (deletingTaskId) await remove(ref(db, `tasks/${deletingTaskId}`));
  closeDeleteModal();
};

function setupDragSystem() {
  window.handlePillDown = (e) => {
    if (e.target.closest("button")) return;
    draggingElement = e.currentTarget;
    draggingElement.classList.add("dragging");
    draggingElement.setPointerCapture(e.pointerId);
  };
  document.addEventListener("pointermove", (e) => {
    if (!draggingElement) return;
    draggingElement.style.position = "fixed";
    draggingElement.style.width = "200px";
    draggingElement.style.zIndex = "1000";
    draggingElement.style.left = e.clientX - 100 + "px";
    draggingElement.style.top = e.clientY - 15 + "px";
    const zone = document
      .elementsFromPoint(e.clientX, e.clientY)
      .find(
        (el) =>
          el.classList.contains("cell-content") ||
          el.id === "pending-tasks-list"
      );
    document
      .querySelectorAll(".drop-target-active")
      .forEach((el) => el.classList.remove("drop-target-active"));
    if (zone) zone.classList.add("drop-target-active");
  });
  document.addEventListener("pointerup", async (e) => {
    if (!draggingElement) return;
    const id = draggingElement.dataset.id;
    const zone = document
      .elementsFromPoint(e.clientX, e.clientY)
      .find(
        (el) =>
          el.classList.contains("cell-content") ||
          el.id === "pending-tasks-list"
      );
    if (zone)
      await update(ref(db, `tasks/${id}`), { date: zone.dataset.date || "" });
    draggingElement.style = "";
    draggingElement.classList.remove("dragging");
    draggingElement = null;
    document
      .querySelectorAll(".drop-target-active")
      .forEach((el) => el.classList.remove("drop-target-active"));
  });
}

function renderSidebars() {
  const pills = allTasks
    .filter((t) => !t.date)
    .map((t) => createTaskPill(t))
    .join("");
  document.getElementById("pending-tasks-list").innerHTML = pills;
  if (document.getElementById("mobile-pending-list"))
    document.getElementById("mobile-pending-list").innerHTML = pills;
}

function renderMobile3Row(label) {
  label.innerText = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(selectedDate);
  const r1 = document.getElementById("mobile-row-calendar");
  const year = selectedDate.getFullYear(),
    month = selectedDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay(),
    daysInMonth = new Date(year, month + 1, 0).getDate();
  let html = `<div class="mobile-mini-grid">`;
  ["S", "M", "T", "W", "T", "F", "S"].forEach(
    (d) =>
      (html += `<div class="text-[9px] font-black text-slate-400 text-center py-1 bg-white dark:bg-slate-900">${d}</div>`)
  );
  for (let i = 0; i < firstDay; i++)
    html += `<div class="bg-slate-50 dark:bg-slate-900 border-0.5 border-white dark:border-slate-800"></div>`;
  // UPDATE: Logic inside the for loop in renderMobile3Row
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatLocal(new Date(year, month, d));
    const isSelected = formatLocal(selectedDate) === dateStr;

    // 1. Get all tasks for this specific day
    const dayTasks = allTasks.filter((t) => t.date === dateStr);

    // 2. Identify unique colors present on this day (default to blue if color is missing)
    const uniqueColors = [...new Set(dayTasks.map((t) => t.color || "blue"))];

    // 3. Generate the dots markup
    const dotsMarkup =
      uniqueColors.length > 0
        ? `<div class="dot-row">${uniqueColors
            .map((color) => `<div class="mini-dot dot-${color}"></div>`)
            .join("")}</div>`
        : "";

    html += `<div class="mini-day-square cell-content ${
      isSelected ? "selected" : ""
    }" data-date="${dateStr}" onclick="selectDate('${dateStr}')">
    ${d}
    ${dotsMarkup}
  </div>`;
  }
  r1.innerHTML = html + `</div>`;

  const r2 = document.getElementById("mobile-row-details");
  const currDateStr = formatLocal(selectedDate);

  // Restore dynamic Focus Text for mobile
  r2.innerHTML = `<h3 class="text-blue-600 font-black text-[10px] uppercase tracking-widest mb-4 border-b pb-2">FOCUS FOR ${getDynamicFocusText(
    selectedDate
  )}</h3><div class="cell-content" data-date="${currDateStr}">${allTasks
    .filter((t) => t.date === currDateStr)
    .map((t) => createTaskPill(t))
    .join("")}</div>`;
}

window.selectDate = (d) => {
  selectedDate = new Date(d);
  renderCalendar();
};
window.toggleMobileDump = () => {
  isDumpCollapsed = !isDumpCollapsed;
  document
    .getElementById("mobile-row-dump")
    .classList.toggle("dump-collapsed", isDumpCollapsed);
};
window.addEventListener("resize", renderCalendar);

function getDynamicFocusText(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "TODAY";
  if (diff === 1) return "TOMORROW";
  if (diff === -1) return "YESTERDAY";
  return target
    .toLocaleDateString(undefined, { month: "short", day: "numeric" })
    .toUpperCase();
}
