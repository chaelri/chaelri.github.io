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
let selectedDate = new Date(); // Jan 1 2026 for testing
selectedDate.setHours(0, 0, 0, 0);

let allTasks = [];
let draggingElement = null;
let editingTaskId = null;

const formatLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

window.addEventListener("DOMContentLoaded", () => {
  fetchTasks();
  setupDragSystem();
});

function fetchTasks() {
  onValue(ref(db, "tasks"), (snap) => {
    const data = snap.val();
    // 1. Convert data to array
    allTasks = data
      ? Object.entries(data).map(([id, val]) => ({ id, ...val }))
      : [];

    // 2. ADD THIS LINE: Sort by time (All-day/empty times stay at the top)
    allTasks.sort((a, b) => (a.time || "").localeCompare(b.time || ""));

    renderCalendar();
    renderSidebar();
  });
}

function renderSidebar() {
  const list = document.getElementById("pending-tasks-list");
  list.innerHTML = allTasks
    .filter((t) => !t.date)
    .map((t) => createTaskPill(t))
    .join("");
}

window.changeView = (view) => {
  currentView = view;
  ["day", "week", "month"].forEach((v) => {
    document.getElementById(`btn-${v}`).className =
      v === view
        ? "px-4 py-1.5 rounded-lg text-sm bg-white shadow-sm font-bold text-blue-600"
        : "px-4 py-1.5 rounded-lg text-sm text-slate-400 font-medium hover:text-slate-900";
  });
  renderCalendar();
};

window.renderCalendar = () => {
  const container = document.getElementById("calendar-view-container");
  const label = document.getElementById("current-range-text");
  container.innerHTML = "";

  if (currentView === "month") {
    container.className = "view-month";
    renderMonthView(container, label);
  } else if (currentView === "week") {
    container.className = "view-week";
    renderWeekView(container, label);
  } else {
    container.className = "view-day";
    renderDayView(container, label);
  }
};

function renderMonthView(container, label) {
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  label.innerText = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(selectedDate);

  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((d) => {
    container.innerHTML += `<div class="month-header">${d}</div>`;
  });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++)
    container.innerHTML += `<div class="bg-slate-50/50"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatLocal(new Date(year, month, d));
    container.innerHTML += `
            <div class="month-cell">
                <div class="p-2 text-right text-[10px] font-black text-slate-300">${d}</div>
                <div class="cell-content" data-date="${dateStr}">${allTasks
      .filter((t) => t.date === dateStr)
      .map((t) => createTaskPill(t))
      .join("")}</div>
            </div>`;
  }
}

function renderWeekView(container, label) {
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
    container.innerHTML += `
            <div class="week-column">
                <div class="week-header">
                    <div class="day-name">${d.toLocaleDateString(undefined, {
                      weekday: "short",
                    })}</div>
                    <div class="day-num">${d.getDate()}</div>
                </div>
                <div class="cell-content" data-date="${dateStr}">
                    ${allTasks
                      .filter((t) => t.date === dateStr)
                      .map((t) => createTaskPill(t))
                      .join("")}
                </div>
            </div>`;
  }
}

function renderDayView(container, label) {
  const dateStr = formatLocal(selectedDate);
  label.innerText = selectedDate.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // Get the dynamic text (TODAY, TOMORROW, YESTERDAY, or the DATE)
  const focusLabel = getDynamicFocusText(selectedDate);

  container.innerHTML = `
        <div class="max-w-4xl">
            <h3 class="text-blue-600 font-black text-[10px] uppercase tracking-[0.2em] mb-8 border-b pb-4">
                FOCUS FOR ${focusLabel}
            </h3>
            <div class="cell-content" data-date="${dateStr}">
                ${allTasks
                  .filter((t) => t.date === dateStr)
                  .map((t) => createTaskPill(t))
                  .join("")}
            </div>
        </div>`;
}

// DRAG SYSTEM
function setupDragSystem() {
  window.handlePillDown = (e) => {
    if (e.target.closest("button")) return;
    draggingElement = e.currentTarget;
    draggingElement.classList.add("dragging");
    draggingElement.setPointerCapture(e.pointerId);
    const rect = draggingElement.getBoundingClientRect();
    draggingElement.dataset.offsetX = e.clientX - rect.left;
    draggingElement.dataset.offsetY = e.clientY - rect.top;
  };

  document.addEventListener("pointermove", (e) => {
    if (!draggingElement) return;
    draggingElement.style.position = "fixed";
    draggingElement.style.width = "240px";
    draggingElement.style.zIndex = "1000";
    draggingElement.style.left =
      e.clientX - draggingElement.dataset.offsetX + "px";
    draggingElement.style.top =
      e.clientY - draggingElement.dataset.offsetY + "px";

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

    const taskId = draggingElement.dataset.id;

    // 1. Find the zone where we dropped it
    const zone = document
      .elementsFromPoint(e.clientX, e.clientY)
      .find(
        (el) =>
          el.classList.contains("cell-content") ||
          el.id === "pending-tasks-list"
      );

    // 2. Update Firebase if a valid zone was found
    if (zone) {
      const newDate = zone.dataset.date || ""; // Sidebar has no data-date, so it becomes ""
      const { ref, update, getDatabase } = await import(
        "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js"
      );
      const db = getDatabase();
      await update(ref(db, `tasks/${taskId}`), { date: newDate });
    }

    // 3. CLEANUP (The fix)
    // Remove the blue dotted border from EVERYTHING (sidebar and calendar cells)
    document.querySelectorAll(".drop-target-active").forEach((el) => {
      el.classList.remove("drop-target-active");
    });

    // Reset dragging element styles
    draggingElement.style = "";
    draggingElement.classList.remove("dragging");
    draggingElement = null;

    // Refresh views
    renderCalendar();
    renderSidebar(); // Ensure sidebar also refreshes to show the returned task
  });
}

function createTaskPill(task) {
  const time = task.time
    ? `<span class="opacity-30 font-bold mr-2 text-[9px]">${task.time}</span>`
    : "";
  return `
        <div class="task-pill" data-id="${task.id}" onpointerdown="handlePillDown(event)">
            <div class="flex items-center truncate mr-2"><span class="truncate font-bold tracking-tight">${time}${task.title}</span></div>
            <div class="flex gap-2">
                <button onclick="openEditModal('${task.id}')" class="material-icons text-[14px] opacity-20 hover:opacity-100">edit</button>
                <button onclick="deleteTask('${task.id}')" class="material-icons text-[14px] opacity-20 hover:opacity-100 hover:text-red-600">delete</button>
            </div>
        </div>`;
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

let deletingTaskId = null; // Add this to your global variables at the top

// Replace your old deleteTask function with this
window.deleteTask = (id) => {
  deletingTaskId = id;
  document.getElementById("delete-modal").classList.remove("hidden");
};

// Add this to close the modal
window.closeDeleteModal = () => {
  document.getElementById("delete-modal").classList.add("hidden");
  deletingTaskId = null;
};

// Add this to perform the actual Firebase deletion
window.confirmDelete = async () => {
  if (deletingTaskId) {
    const { ref, remove, getDatabase } = await import(
      "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js"
    );
    const db = getDatabase();
    await remove(ref(db, `tasks/${deletingTaskId}`));
    closeDeleteModal();
  }
};

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

window.prevPeriod = () => {
  if (currentView === "month")
    selectedDate.setMonth(selectedDate.getMonth() - 1);
  else if (currentView === "week")
    selectedDate.setDate(selectedDate.getDate() - 7);
  else selectedDate.setDate(selectedDate.getDate() - 1);
  renderCalendar();
};

window.nextPeriod = () => {
  if (currentView === "month")
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
window.toggleSidebar = () =>
  document.getElementById("sidebar").classList.toggle("-translate-x-full");

function getDynamicFocusText(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "TODAY";
  if (diffDays === 1) return "TOMORROW";
  if (diffDays === -1) return "YESTERDAY";

  // For any other date, return the formatted date string
  return target
    .toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    .toUpperCase();
}
