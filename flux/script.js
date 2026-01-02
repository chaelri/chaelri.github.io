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

const formatLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

window.addEventListener("DOMContentLoaded", () => {
  fetchTasks();
  setupDragSystem();
  document.getElementById("task-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addTaskFromInput();
  });
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

// --- MOBILE 3-ROW RENDERER ---
function renderMobile3Row(label) {
  label.innerText = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(selectedDate);

  // Row 1: Calendar Grid
  const r1 = document.getElementById("mobile-row-calendar");
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let html = `<div class="mobile-mini-grid">`;
  ["S", "M", "T", "W", "T", "F", "S"].forEach(
    (d) =>
      (html += `<div class="text-[9px] font-black text-slate-400 text-center py-1 bg-white">${d}</div>`)
  );
  for (let i = 0; i < firstDay; i++)
    html += `<div class="bg-slate-50 border-0.5 border-white"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatLocal(new Date(year, month, d));
    const isSelected = formatLocal(selectedDate) === dateStr;
    const hasTasks = allTasks.some((t) => t.date === dateStr);
    html += `<div class="mini-day-square cell-content ${
      isSelected ? "selected" : ""
    }" data-date="${dateStr}" onclick="selectDate('${dateStr}')">${d}${
      hasTasks ? '<div class="task-dot"></div>' : ""
    }</div>`;
  }
  r1.innerHTML = html + `</div>`;

  // Row 2: Details
  const r2 = document.getElementById("mobile-row-details");
  const currDateStr = formatLocal(selectedDate);
  r2.innerHTML = `
        <h3 class="text-blue-600 font-black text-[10px] uppercase tracking-[0.2em] mb-4 border-b pb-2">${getDynamicFocusText(
          selectedDate
        )}</h3>
        <div class="cell-content" data-date="${currDateStr}">
            ${allTasks
              .filter((t) => t.date === currDateStr)
              .map((t) => createTaskPill(t))
              .join("")}
        </div>`;
}

// --- DESKTOP RENDERERS ---
function renderDesktopView(label) {
  const container = document.getElementById("calendar-view-container");
  container.innerHTML = "";
  ["day", "week", "month"].forEach((v) => {
    const btn = document.getElementById(`btn-${v}`);
    btn.className =
      v === currentView
        ? "px-4 py-1.5 rounded-lg text-sm bg-white shadow-sm font-bold text-blue-600"
        : "px-4 py-1.5 rounded-lg text-sm text-slate-400 hover:text-slate-900";
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
  for (let i = 0; i < firstDay; i++)
    container.innerHTML += `<div class="bg-slate-50/50"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatLocal(new Date(year, month, d));
    container.innerHTML += `<div class="month-cell"><div class="p-2 text-right text-[10px] font-black text-slate-300">${d}</div><div class="cell-content" data-date="${dateStr}">${allTasks
      .filter((t) => t.date === dateStr)
      .map((t) => createTaskPill(t))
      .join("")}</div></div>`;
  }
}

function renderWeekView(container, label) {
  container.className = "view-week flex-1 bg-white";
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
    container.innerHTML += `<div class="week-column"><div class="week-header"><div class="day-name">${d.toLocaleDateString(
      undefined,
      { weekday: "short" }
    )}</div><div class="day-num">${d.getDate()}</div></div><div class="cell-content" data-date="${dateStr}">${allTasks
      .filter((t) => t.date === dateStr)
      .map((t) => createTaskPill(t))
      .join("")}</div></div>`;
  }
}

function renderDayView(container, label) {
  container.className = "view-day flex-1 bg-white";
  const dateStr = formatLocal(selectedDate);
  label.innerText = selectedDate.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  container.innerHTML = `<div class="max-w-4xl"><h3 class="text-blue-600 font-black text-[10px] uppercase tracking-[0.2em] mb-8 border-b pb-4">FOCUS FOR ${getDynamicFocusText(
    selectedDate
  )}</h3><div class="cell-content" data-date="${dateStr}">${allTasks
    .filter((t) => t.date === dateStr)
    .map((t) => createTaskPill(t))
    .join("")}</div></div>`;
}

// INTERACTIVITY
window.selectDate = (dateStr) => {
  selectedDate = new Date(dateStr);
  renderCalendar();
};
window.changeView = (view) => {
  currentView = view;
  renderCalendar();
};
window.toggleMobileDump = () => {
  isDumpCollapsed = !isDumpCollapsed;
  const row = document.getElementById("mobile-row-dump");
  const arrow = document.getElementById("dump-arrow");
  row.classList.toggle("dump-collapsed", isDumpCollapsed);
  arrow.innerText = isDumpCollapsed
    ? "keyboard_arrow_up"
    : "keyboard_arrow_down";
};

window.prevPeriod = () => {
  if (currentView === "month" || window.innerWidth < 768)
    selectedDate.setMonth(selectedDate.getMonth() - 1);
  else if (currentView === "week")
    selectedDate.setDate(selectedDate.getDate() - 7);
  else selectedDate.setDate(selectedDate.getDate() - 1);
  renderCalendar();
};

window.nextPeriod = () => {
  if (currentView === "month" || window.innerWidth < 768)
    selectedDate.setMonth(selectedDate.getMonth() + 1);
  else if (currentView === "week")
    selectedDate.setDate(selectedDate.getDate() + 7);
  else selectedDate.setDate(selectedDate.getDate() + 1);
  renderCalendar();
};

window.goToToday = () => {
  selectedDate = new Date();
  selectedDate.setHours(0, 0, 0, 0);
  renderCalendar();
};

function renderSidebars() {
  const pills = allTasks
    .filter((t) => !t.date)
    .map((t) => createTaskPill(t))
    .join("");
  document.getElementById("pending-tasks-list").innerHTML = pills;
  document.getElementById("mobile-pending-list").innerHTML = pills;
}

// PILL & MODAL LOGIC (Original)
function createTaskPill(task) {
  const time = task.time
    ? `<span class="opacity-30 font-bold mr-2 text-[9px]">${task.time}</span>`
    : "";
  return `<div class="task-pill" data-id="${task.id}" onpointerdown="handlePillDown(event)"><div class="flex items-center truncate mr-2"><span class="truncate font-bold tracking-tight">${time}${task.title}</span></div><div class="flex gap-2"><button onclick="openEditModal('${task.id}')" class="material-icons text-[14px] opacity-20 hover:opacity-100">edit</button><button onclick="deleteTask('${task.id}')" class="material-icons text-[14px] opacity-20 hover:opacity-100">delete</button></div></div>`;
}

window.addTaskFromInput = () => {
  const input = document.getElementById("task-input");
  if (input.value.trim()) {
    push(ref(db, "tasks"), {
      title: input.value,
      date: "",
      time: "",
      allDay: true,
    });
    input.value = "";
  }
};
window.addMobileTask = () => {
  const input = document.getElementById("mobile-dump-input");
  if (input.value.trim()) {
    push(ref(db, "tasks"), {
      title: input.value,
      date: "",
      time: "",
      allDay: true,
    });
    input.value = "";
  }
};

window.toggleSidebar = () => {
  const s = document.getElementById("sidebar");
  s.classList.toggle("-translate-x-full");
  s.classList.toggle("sidebar-collapsed");
};

// MODALS
window.openEditModal = (id) => {
  const t = allTasks.find((x) => x.id === id);
  editingTaskId = id;
  document.getElementById("edit-task-name").value = t.title;
  document.getElementById("edit-task-date").value = t.date || "";
  document.getElementById("edit-task-time").value = t.time || "";
  document.getElementById("edit-modal").classList.remove("hidden");
};
window.saveTaskEdit = async () => {
  await update(ref(db, `tasks/${editingTaskId}`), {
    title: document.getElementById("edit-task-name").value,
    date: document.getElementById("edit-task-date").value,
    time: document.getElementById("edit-task-time").value,
  });
  closeModal();
};
window.closeModal = () => {
  document.getElementById("edit-modal").classList.add("hidden");
  editingTaskId = null;
};
window.deleteTask = (id) => {
  deletingTaskId = id;
  document.getElementById("delete-modal").classList.remove("hidden");
};
window.closeDeleteModal = () => {
  document.getElementById("delete-modal").classList.add("hidden");
  deletingTaskId = null;
};
window.confirmDelete = async () => {
  if (deletingTaskId) {
    await remove(ref(db, `tasks/${deletingTaskId}`));
    closeDeleteModal();
  }
};

// DRAG SYSTEM
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
          el.id === "pending-tasks-list" ||
          el.id === "mobile-pending-list"
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
          el.id === "pending-tasks-list" ||
          el.id === "mobile-pending-list"
      );
    if (zone) {
      const isDump =
        zone.id === "pending-tasks-list" || zone.id === "mobile-pending-list";
      await update(ref(db, `tasks/${id}`), {
        date: isDump ? "" : zone.dataset.date || "",
      });
    }
    draggingElement.style = "";
    draggingElement.classList.remove("dragging");
    draggingElement = null;
    document
      .querySelectorAll(".drop-target-active")
      .forEach((el) => el.classList.remove("drop-target-active"));
  });
}

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

window.addEventListener("resize", renderCalendar);
