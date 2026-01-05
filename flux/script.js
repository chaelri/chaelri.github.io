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

// Drag vs Click Tracking
let dragStartX = 0;
let dragStartY = 0;
let isIntentionalDrag = false;

const formatLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

const priorityScore = { high: 3, medium: 2, low: 1, none: 0 };

window.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") document.documentElement.classList.add("dark");
  fetchTasks();
  setupDragSystem();
  setupHotkeys();
  setupMobileDrawerResizer(); // NEW: Drawer Slider logic
  document
    .getElementById("task-input")
    .addEventListener(
      "keydown",
      (e) => e.key === "Enter" && addTaskFromInput()
    );
});

// NEW: Drawer Resizing logic (The Slider)
function setupMobileDrawerResizer() {
  const handle = document.getElementById("mobile-dump-resizer");
  const drawer = document.getElementById("mobile-row-dump");
  let startY, startH;

  handle.addEventListener("pointerdown", (e) => {
    startY = e.clientY;
    startH = drawer.offsetHeight;
    handle.setPointerCapture(e.pointerId);

    const onMove = (me) => {
      const delta = startY - me.clientY;
      const newH = Math.min(
        window.innerHeight * 0.8,
        Math.max(40, startH + delta)
      );
      drawer.style.height = `${newH}px`;
      if (newH <= 50) drawer.classList.add("dump-collapsed");
      else drawer.classList.remove("dump-collapsed");
    };

    const onUp = () => {
      handle.releasePointerCapture(e.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  });

  // Keep the single click toggle for quick hide
  handle.addEventListener("click", (e) => {
    if (Math.abs(startY - e.clientY) < 5) toggleMobileDump();
  });
}

function setupHotkeys() {
  window.addEventListener("keydown", (e) => {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
    const key = e.key.toLowerCase();
    if (key === "m") changeView("month");
    if (key === "w") changeView("week");
    if (key === "d") changeView("day");
    if (key === "t") goToToday();
    if (key === "n") document.getElementById("task-input").focus();
  });
}

function fetchTasks() {
  onValue(ref(db, "tasks"), (snap) => {
    const data = snap.val();
    allTasks = data
      ? Object.entries(data).map(([id, val]) => ({ id, ...val }))
      : [];

    allTasks.sort((a, b) => {
      const pA = priorityScore[a.priority || "none"];
      const pB = priorityScore[b.priority || "none"];
      if (pB !== pA) return pB - pA;
      return (a.time || "99:99").localeCompare(b.time || "99:99");
    });

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
                <div class="cell-content" data-date="${dateStr}" onclick="handleEmptyCellClick(event, '${dateStr}')">
                    ${allTasks
                      .filter((t) => t.date === dateStr)
                      .map((t) => createTaskPill(t))
                      .join("")}
                </div>
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
    const isToday = dateStr === formatLocal(new Date());
    container.innerHTML += `
    <div class="${isToday ? "week-column today-column" : "week-column"}">
      <div class="week-header">
        <div class="day-name">${d.toLocaleDateString(undefined, {
          weekday: "short",
        })}</div>
        <div class="day-num">${d.getDate()}</div>
      </div>
      <div class="cell-content" data-date="${dateStr}" onclick="handleEmptyCellClick(event, '${dateStr}')">
        ${allTasks
          .filter((t) => t.date === dateStr)
          .map((t) => createTaskPill(t))
          .join("")}
      </div>
    </div>`;
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
  container.innerHTML = `<div class="max-w-4xl mx-auto"><h3 class="text-blue-600 font-black text-[10px] uppercase tracking-widest mb-8 border-b pb-4">FOCUS FOR ${getDynamicFocusText(
    selectedDate
  )}</h3><div class="cell-content" data-date="${dateStr}">${allTasks
    .filter((t) => t.date === dateStr)
    .map((t) => createTaskPill(t))
    .join("")}</div></div>`;
}

// UPDATED: Added Drag Handle to prevent accidental dragging during scroll
function createTaskPill(task) {
  const isDone = task.isDone ? "is-done" : "";
  const priorityClass = task.priority ? `priority-${task.priority}` : "";
  const time = task.allDay ? "" : task.time || "";

  let progressHtml = "";
  if (task.subtasks && task.subtasks.length > 0) {
    const done = task.subtasks.filter((s) => s.done).length;
    const pct = (done / task.subtasks.length) * 100;
    progressHtml = `<div class="progress-bar-container"><div class="progress-bar-fill" style="width:${pct}%"></div></div>`;
  }

  return `
    <div class="task-pill color-${
      task.color || "blue"
    } ${priorityClass} ${isDone}" data-id="${
    task.id
  }" onpointerdown="handlePillDown(event)">
      <div class="flex items-center min-w-0">
        <span class="material-icons drag-handle text-[18px] opacity-40 mr-1 p-1">drag_indicator</span>
        ${
          time
            ? `<span class="opacity-40 font-bold mr-1 text-[8px]">${time}</span>`
            : ""
        }
        <span class="truncate font-bold tracking-tight">${task.title}</span>
      </div>
      ${progressHtml}
    </div>`;
}

window.openPeekModal = (id) => {
  const t = allTasks.find((x) => x.id === id);
  if (!t) return;
  const modal = document.getElementById("peek-modal");
  document.getElementById("peek-title").innerText = t.title;
  document.getElementById("peek-desc").innerText =
    t.desc || "No description added.";
  document.getElementById("peek-date").innerText = t.date || "Unscheduled";
  document.getElementById("peek-time").innerText = t.allDay
    ? "All-Day"
    : t.time || "No time";

  const pTag = document.getElementById("peek-priority-tag");
  pTag.innerText = t.priority ? t.priority : "No Priority";
  pTag.className = `text-[10px] font-black px-2 py-1 rounded uppercase tracking-widest ${
    t.priority ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-400"
  }`;

  const subList = document.getElementById("peek-subtasks-list");
  subList.innerHTML =
    (t.subtasks || [])
      .map(
        (s, i) => `
        <div class="flex items-center gap-2 group">
            <input type="checkbox" ${
              s.done ? "checked" : ""
            } onchange="toggleSubtask('${id}', ${i})" class="w-4 h-4 rounded border-slate-300">
            <span class="text-sm ${
              s.done
                ? "line-through text-slate-400"
                : "text-slate-600 dark:text-slate-300"
            }">${s.text}</span>
        </div>
    `
      )
      .join("") || `<p class="text-xs text-slate-400 italic">No subtasks.</p>`;

  document.getElementById("peek-done-btn").innerText = t.isDone
    ? "Mark as Undone"
    : "Mark as Done";
  document.getElementById("peek-done-btn").onclick = () => toggleTaskDone(id);
  document.getElementById("peek-edit-btn").onclick = () => {
    closePeekModal();
    openEditModal(id);
  };
  document.getElementById("peek-del-btn").onclick = () => {
    closePeekModal();
    deleteTask(id);
  };

  modal.classList.remove("hidden");
};

window.closePeekModal = () =>
  document.getElementById("peek-modal").classList.add("hidden");

window.toggleSubtask = async (id, index) => {
  const t = allTasks.find((x) => x.id === id);
  const subtasks = [...(t.subtasks || [])];
  subtasks[index].done = !subtasks[index].done;
  await update(ref(db, `tasks/${id}`), { subtasks });
};

window.toggleTaskDone = async (id) => {
  const t = allTasks.find((x) => x.id === id);
  await update(ref(db, `tasks/${id}`), { isDone: !t.isDone });
  closePeekModal();
};

window.handleEmptyCellClick = (e, dateStr) => {
  if (e.target.classList.contains("cell-content")) {
    const title = prompt("Quick Add Task:");
    if (title) {
      push(ref(db, "tasks"), {
        title,
        date: dateStr,
        allDay: true,
        color: "blue",
        priority: "none",
      });
    }
  }
};

window.openEditModal = (id) => {
  const t = allTasks.find((x) => x.id === id);
  if (!t) return;
  editingTaskId = id;
  document.getElementById("edit-task-name").value = t.title || "";
  document.getElementById("edit-task-desc").value = t.desc || "";
  document.getElementById("edit-task-date").value = t.date || "";
  document.getElementById("edit-task-time").value = t.time || "";
  document.getElementById("edit-task-allday").checked = t.allDay || false;
  document.getElementById("edit-task-priority").value = t.priority || "none";
  document.getElementById("edit-task-subtasks").value = (t.subtasks || [])
    .map((s) => s.text)
    .join("\n");
  toggleTimeInput(t.allDay || false);
  setEditColor(t.color || "blue");
  document.getElementById("edit-modal").classList.remove("hidden");
};

window.closeModal = () =>
  document.getElementById("edit-modal").classList.add("hidden");

window.saveTaskEdit = async () => {
  if (!editingTaskId) return;
  const isAllDay = document.getElementById("edit-task-allday").checked;
  const subtasksRaw = document
    .getElementById("edit-task-subtasks")
    .value.split("\n")
    .filter((l) => l.trim());
  const t = allTasks.find((x) => x.id === editingTaskId);

  const subtasks = subtasksRaw.map((text) => {
    const existing = (t.subtasks || []).find((s) => s.text === text);
    return { text, done: existing ? existing.done : false };
  });

  await update(ref(db, `tasks/${editingTaskId}`), {
    title: document.getElementById("edit-task-name").value,
    desc: document.getElementById("edit-task-desc").value,
    date: document.getElementById("edit-task-date").value,
    time: isAllDay ? "" : document.getElementById("edit-task-time").value,
    allDay: isAllDay,
    color: selectedEditColor,
    priority: document.getElementById("edit-task-priority").value,
    subtasks: subtasks,
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
  if (isMobile || currentView === "month")
    selectedDate.setMonth(selectedDate.getMonth() - 1);
  else if (currentView === "week")
    selectedDate.setDate(selectedDate.getDate() - 7);
  else selectedDate.setDate(selectedDate.getDate() - 1);
  renderCalendar();
};
window.nextPeriod = () => {
  const isMobile = window.innerWidth < 768;
  if (isMobile || currentView === "month")
    selectedDate.setMonth(selectedDate.getMonth() + 1);
  else if (currentView === "week")
    selectedDate.setDate(selectedDate.getDate() + 7);
  else selectedDate.setDate(selectedDate.getDate() + 1);
  renderCalendar();
};
window.changeView = (v) => {
  currentView = v;
  renderCalendar();
};
window.toggleSidebar = () => {
  const sidebar = document.getElementById("sidebar");
  const isMobile = window.innerWidth < 768;
  if (isMobile) sidebar.classList.toggle("-translate-x-full");
  else sidebar.classList.toggle("sidebar-collapsed");
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
      priority: "none",
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
      date: "",
      time: "",
      allDay: true,
      color: "blue",
      priority: "none",
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
    // UPDATED: Only allow drag if handle is used. Else just track for click/peek.
    const isHandle = e.target.closest(".drag-handle");

    dragStartX = e.clientX;
    dragStartY = e.clientY;
    isIntentionalDrag = false;
    draggingElement = e.currentTarget;
    draggingElement.setPointerCapture(e.pointerId);

    // If not handle, we block the "Intentional Drag" transition below
    draggingElement.dataset.isHandle = isHandle ? "true" : "false";
  };

  document.addEventListener("pointermove", (e) => {
    if (!draggingElement) return;

    const dist = Math.sqrt(
      (e.clientX - dragStartX) ** 2 + (e.clientY - dragStartY) ** 2
    );
    const isHandle = draggingElement.dataset.isHandle === "true";

    // UPDATED: Only enter drag state if the HANDLE was used
    if (dist > 10 && !isIntentionalDrag && isHandle) {
      isIntentionalDrag = true;
      draggingElement.classList.add("dragging");
      document.getElementById("trash-zone").classList.add("trash-active");
    }

    if (isIntentionalDrag) {
      draggingElement.style.position = "fixed";
      draggingElement.style.width = "200px";
      draggingElement.style.zIndex = "1000";
      draggingElement.style.left = e.clientX - 100 + "px";
      draggingElement.style.top = e.clientY - 15 + "px";

      const zone = document
        .elementsFromPoint(e.clientX, e.clientY)
        .find(
          (el) =>
            el.classList.contains("cell-content") || el.id === "trash-zone"
        );

      document
        .querySelectorAll(".drop-target-active")
        .forEach((el) => el.classList.remove("drop-target-active"));
      if (zone) zone.classList.add("drop-target-active");
    }
  });

  document.addEventListener("pointerup", async (e) => {
    if (!draggingElement) return;

    if (!isIntentionalDrag) {
      openPeekModal(draggingElement.dataset.id);
    } else {
      const id = draggingElement.dataset.id;
      const zone = document
        .elementsFromPoint(e.clientX, e.clientY)
        .find(
          (el) =>
            el.classList.contains("cell-content") ||
            el.id === "pending-tasks-list" ||
            el.id === "mobile-pending-list" ||
            el.id === "trash-zone"
        );

      if (zone) {
        if (zone.id === "trash-zone") {
          deleteTask(id);
        } else {
          const isDump =
            zone.id === "pending-tasks-list" ||
            zone.id === "mobile-pending-list";
          let newDate = isDump
            ? ""
            : zone.dataset.date || formatLocal(selectedDate);
          await update(ref(db, `tasks/${id}`), { date: newDate });
        }
      }
    }

    document.getElementById("trash-zone").classList.remove("trash-active");
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
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatLocal(new Date(year, month, d));
    const isSelected = formatLocal(selectedDate) === dateStr;
    const dayTasks = allTasks.filter((t) => t.date === dateStr);
    const uniqueColors = [...new Set(dayTasks.map((t) => t.color || "blue"))];
    const dotsMarkup =
      uniqueColors.length > 0
        ? `<div class="dot-row">${uniqueColors
            .map((color) => `<div class="mini-dot dot-${color}"></div>`)
            .join("")}</div>`
        : "";
    html += `<div class="mini-day-square cell-content ${
      isSelected ? "selected" : ""
    }" data-date="${dateStr}" onclick="selectDate('${dateStr}')">${d}${dotsMarkup}</div>`;
  }
  r1.innerHTML = html + `</div>`;

  const r2 = document.getElementById("mobile-row-details");
  const currDateStr = formatLocal(selectedDate);

  r2.className = "flex-1 overflow-y-auto p-4 cell-content";
  r2.dataset.date = currDateStr;
  r2.innerHTML = `<h3 class="text-blue-600 font-black text-[10px] uppercase tracking-widest mb-4 border-b pb-2">FOCUS FOR ${getDynamicFocusText(
    selectedDate
  )}</h3><div class="space-y-3">
    ${allTasks
      .filter((t) => t.date === currDateStr)
      .map((t) => {
        const subCount = t.subtasks ? t.subtasks.length : 0;
        const subDone = t.subtasks
          ? t.subtasks.filter((s) => s.done).length
          : 0;
        return `
            <div class="flex flex-col gap-1">
                <div class="flex items-center gap-3">
                    <span class="timeline-time">${
                      t.allDay ? "ALL DAY" : t.time
                    }</span>
                    <div class="flex-1">${createTaskPill(t)}</div>
                </div>
                ${
                  subCount > 0
                    ? `<div class="ml-14 text-[10px] font-bold text-slate-400">${subDone}/${subCount} SUBTASKS COMPLETED</div>`
                    : ""
                }
            </div>
        `;
      })
      .join("")}
  </div>`;
}

window.selectDate = (d) => {
  selectedDate = new Date(d);
  renderCalendar();
};
window.toggleMobileDump = () => {
  isDumpCollapsed = !isDumpCollapsed;
  const drawer = document.getElementById("mobile-row-dump");
  drawer.classList.toggle("dump-collapsed", isDumpCollapsed);
  // Reset height to defaults if toggled via button
  drawer.style.height = isDumpCollapsed ? "40px" : "33.333%";
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
