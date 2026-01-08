import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  set,
  update,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBNPdSYJXuzvmdEHIeHGkbPmFnZxUq1lAg",
  authDomain: "charlie-karla-wedding.firebaseapp.com",
  databaseURL:
    "https://charlie-karla-wedding-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "charlie-karla-wedding",
  storageBucket: "charlie-karla-wedding.firebasestorage.app",
  messagingSenderId: "954582649260",
  appId: "1:954582649260:web:393fcc0fddafeb571f5209",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const ROLE_HIERARCHY = [
  "bride",
  "groom",
  "parent of bride",
  "parent of groom",
  "officiant",
  "maid of honor",
  "bridesmaid",
  "best man",
  "groomsman",
  "principal sponsor",
  "secondary sponsor (veil)",
  "secondary sponsor (coin)",
  "secondary sponsor (candle)",
  "bible bearer",
  "ring bearer",
  "flower boy",
  "flower girl",
  "guest",
  "guests",
];

function getRoleColorClass(role) {
  role = (role || "").toLowerCase().trim();
  if (role === "bride" || role === "groom") return "role-couple";
  if (role.includes("parent")) return "role-family";
  if (role.includes("officiant")) return "role-officiant";
  if (
    role.includes("maid") ||
    role.includes("best man") ||
    role.includes("bridesmaid") ||
    role.includes("groomsman")
  )
    return "role-party";
  if (role.includes("sponsor")) return "role-sponsor";
  if (role.includes("bearer") || role.includes("boy") || role.includes("girl"))
    return "role-kids";
  return "";
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * DATABASE STRUCTURE - CHAPTERS 0 - 14
 */
let weddingData = {
  chapters: [
    {
      id: 0,
      title: "The Foundation",
      subtitle: "6 Months Out",
      period: "Jan 02 - Feb 01, 2026",
      color: "#8c6239",
      type: "list",
      content: [
        { text: "Check LCR Requirements", checked: false },
        { text: "Check Church specific rules", checked: false },
        { text: "Review PSA spelling errors", checked: false },
        { text: "Fix late registration issues", checked: false },
      ],
    },
    {
      id: 1,
      title: "The Basics",
      subtitle: "5 Months Out",
      period: "Feb 02 - Mar 01, 2026",
      color: "#4a5d23",
      type: "list",
      content: [
        { text: "Finalize wedding date", checked: false },
        { text: "Prepare 2 Valid IDs", checked: false },
        { text: "Get 2x2 Photos", checked: false },
        { text: "Organize old PSA docs", checked: false },
      ],
    },
    {
      id: 2,
      title: "Document Request",
      subtitle: "4 Months Out",
      period: "Mar 02 - Apr 01, 2026",
      color: "#967e43",
      type: "list",
      content: [
        { text: "Request fresh PSA Birth Certs", checked: false },
        { text: "Request fresh PSA CENOMAR", checked: false },
      ],
    },
    {
      id: 3,
      title: "The Seminars",
      subtitle: "3 Months Out",
      period: "Apr 02 - May 01, 2026",
      color: "#5b6341",
      type: "list",
      content: [
        { text: "Pre-marriage Counseling", checked: false },
        { text: "Family Planning Seminar", checked: false },
        { text: "Secure Cedula", checked: false },
        { text: "Barangay Certificate", checked: false },
      ],
    },
    {
      id: 4,
      title: "The License",
      subtitle: "2 Months Out",
      period: "May 02 - Jun 22, 2026",
      color: "#7a743a",
      type: "list",
      content: [
        { text: "Apply for License at City Hall", checked: false },
        { text: "Mandatory 10-day Posting", checked: false },
        { text: "Pick up License (Valid 120 days)", checked: false },
      ],
    },
    {
      id: 5,
      title: "The Vendor Guild",
      subtitle: "Guild Roster",
      period: "Contacts",
      color: "#2d3e50",
      type: "table",
      headers: ["Service", "Vendor", "Contact Person", "Phone"],
      content: [
        ["Venue", "-", "-", "-"],
        ["Catering", "-", "-", "-"],
      ],
    },
    {
      id: 6,
      title: "The Entourage",
      subtitle: "Party Roles",
      period: "Responsibilities",
      color: "#6e2c2c",
      type: "table",
      headers: ["Name", "Role", "Responsibilities"],
      content: [],
    },
    {
      id: 7,
      title: "Ceremony Inventory",
      subtitle: "Checklist",
      period: "Church Items",
      color: "#4d5b6e",
      type: "list",
      content: [
        { text: "Wedding Rings", checked: false },
        { text: "Arrhae", checked: false },
        { text: "Bible", checked: false },
        { text: "Veil", checked: false },
        { text: "Cord", checked: false },
      ],
    },
    {
      id: 8,
      title: "Reception Inventory",
      subtitle: "Checklist",
      period: "Party Items",
      color: "#5e4d6e",
      type: "list",
      content: [
        { text: "Wine", checked: false },
        { text: "Prizes for Games", checked: false },
        { text: "Guestlist Chart", checked: false },
      ],
    },
    {
      id: 9,
      title: "Emergency Kit",
      subtitle: "Checklist",
      period: "Survival Gear",
      color: "#6e4d4d",
      type: "list",
      content: [
        { text: "Bobby Pins", checked: false },
        { text: "Safety Pins", checked: false },
        { text: "Mints", checked: false },
        { text: "Biogesic/Diatabs", checked: false },
      ],
    },
    {
      id: 10,
      title: "Snapshot List",
      subtitle: "Media",
      period: "Shot List",
      color: "#4d6e5e",
      type: "list",
      content: [
        { text: "Bride with Mochi (Dog)", checked: false },
        { text: "Groom with Andre (Dog)", checked: false },
        { text: "First Kiss", checked: false },
      ],
    },
    {
      id: 11,
      title: "The Music Box",
      subtitle: "Audio",
      period: "Playlists",
      color: "#543864",
      type: "list",
      content: [
        { text: "Bridal Walk: Goodness of God", checked: false },
        { text: "Flower Men: Back in Black", checked: false },
        { text: "First Dance: Palagi", checked: false },
      ],
    },
    {
      id: 12,
      title: "Side Quests",
      subtitle: "Entertainment",
      period: "Games & Prizes",
      color: "#5b4a23",
      type: "list",
      content: [
        { text: "Guess The Tune", checked: false },
        { text: "Trivia Game", checked: false },
        { text: "Tumpakners", checked: false },
      ],
    },
    {
      id: 13,
      title: "Boss Room Layout",
      subtitle: "Setup",
      period: "Floor Plan",
      color: "#2d5a5a",
      type: "planner",
      layout: {
        stage: {
          x: 2500,
          y: 2150,
          type: "special",
          label: "STAGE",
          assigned: {},
        },
        couple: {
          x: 2500,
          y: 2300,
          type: "couple",
          label: "COUPLE SEAT",
          assigned: {},
        },
      },
    },
    {
      id: 14,
      title: "TikTok Trends",
      subtitle: "Social Media",
      period: "Reel Pegs",
      color: "#8c395a",
      type: "list",
      content: [
        { text: "Bouquet Transition", checked: false },
        { text: "Spin Phone Transition", checked: false },
        { text: "Day in the Life Vlog", checked: false },
      ],
    },
  ],
};

let activeIndex = null;
let guestDataMap = {};
let currentTableId = null;
let isDraggingBubble = false;
let isDraggingTable = false;
let panX = 0,
  panY = 0,
  scale = 1;

function autoResize(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

function initSync() {
  onValue(ref(db, "wedding_data"), (snapshot) => {
    if (isDraggingBubble || isDraggingTable) return;
    const data = snapshot.val();
    if (data) {
      data.chapters = data.chapters.map((ch) => {
        if (ch.type === "list") {
          ch.content = (ch.content || []).map((item) =>
            typeof item === "string" ? { text: item, checked: false } : item
          );
        }
        return ch;
      });
      weddingData = data;
    } else {
      set(ref(db, "wedding_data"), weddingData);
    }
    document.getElementById("sync-indicator").innerHTML =
      '<span class="material-icons-round text-xs text-emerald-500">cloud_done</span> Up to Date';
    renderGallery();
    if (activeIndex !== null) refreshModal();
  });

  onValue(ref(db, "guestList"), (snapshot) => {
    const list = snapshot.val() || {};
    guestDataMap = list;

    const sortedGuests = Object.entries(list)
      .filter(([id, g]) => g && (g.role || "").toLowerCase().trim() !== "")
      .sort((a, b) => {
        const roleA = (a[1].role || "").toLowerCase().trim();
        const roleB = (b[1].role || "").toLowerCase().trim();
        const idxA = ROLE_HIERARCHY.indexOf(roleA);
        const idxB = ROLE_HIERARCHY.indexOf(roleB);
        const valA = idxA === -1 ? 99 : idxA;
        const valB = idxB === -1 ? 99 : idxB;
        if (valA !== valB) return valA - valB;
        return (a[1].name || "").localeCompare(b[1].name || "");
      });

    const entChapter = weddingData.chapters.find((c) => c.id === 6);
    if (entChapter) {
      entChapter.content = sortedGuests
        .filter(
          ([id, g]) =>
            !["guest", "guests"].includes((g.role || "").toLowerCase())
        )
        .map(([id, g]) => [g.name, g.role, g.notes || "", id]);
    }

    renderGallery();
    if (activeIndex === 6) refreshModal();
    if (activeIndex === 13 && currentTableId && !isDraggingBubble) {
      renderTableContext();
      renderGuestPicker();
    }
  });
}

function renderGallery() {
  const gallery = document.getElementById("chapter-gallery");
  if (!weddingData.chapters) return;
  gallery.innerHTML = weddingData.chapters
    .map(
      (ch, idx) => `
        <div class="chapter-card min-w-[300px] h-[460px] bg-[#1c1b19] rounded-[2rem] border border-stone-800 cursor-pointer overflow-hidden flex flex-col snap-center shadow-2xl" onclick="window.openModal(${idx})">
            <div class="chapter-image-container h-[55%] w-full" style="background-color: ${ch.color}">
                <div class="absolute top-6 right-6 bg-black/40 backdrop-blur-md px-3 py-1 rounded text-[10px] font-bold text-white border border-white/10 uppercase tracking-widest">${ch.subtitle}</div>
            </div>
            <div class="p-8 flex-1 flex flex-col justify-between">
                <div><h2 class="font-['Playfair_Display'] italic text-2xl text-stone-100">${ch.title}</h2></div>
                <div class="bg-black/60 w-fit px-3 py-1.5 rounded-lg text-[9px] font-bold text-amber-500 border border-white/5 uppercase tracking-[0.15em] mt-4">${ch.period}</div>
            </div>
        </div>
    `
    )
    .join("");
}

window.openModal = function (idx) {
  activeIndex = idx;
  const modalCont = document.getElementById("modal-container");
  const toolbar = document.getElementById("planner-toolbar");

  if (idx === 13) {
    modalCont.classList.add("planner-fullscreen");
    toolbar.classList.remove("hidden");
  } else {
    modalCont.classList.remove("planner-fullscreen");
    toolbar.classList.add("hidden");
  }

  document.getElementById("modal").classList.remove("hidden");
  refreshModal();
};

function refreshModal() {
  const ch = weddingData.chapters[activeIndex];
  const body = document.getElementById("modal-body");
  const addBtn = document.getElementById("add-row-btn");

  addBtn.classList.toggle("hidden", activeIndex === 6 || activeIndex === 13);
  document.getElementById("modal-banner").style.backgroundColor = ch.color;
  document.getElementById("modal-badge").innerText = ch.subtitle;
  document.getElementById("modal-title-input").value = ch.title;
  document.getElementById("modal-date-input").value = ch.period;

  document.getElementById("modal-title-input").onchange = (e) => {
    ch.title = e.target.value;
    pushToFirebase();
  };
  document.getElementById("modal-date-input").onchange = (e) => {
    ch.period = e.target.value;
    pushToFirebase();
  };

  if (activeIndex === 13) {
    renderPlanner(body);
    return;
  }

  if (ch.type === "list") {
    body.innerHTML = ch.content
      .map(
        (item, i) => `
            <div class="check-item group">
                <input type="checkbox" class="custom-checkbox" ${
                  item.checked ? "checked" : ""
                } onchange="window.toggleCheck(${i}, this.checked)">
                <textarea rows="1" class="edit-input" oninput="window.autoResize(this)" onchange="window.saveContent(${i}, this.value)">${
          item.text
        }</textarea>
                <button onclick="window.removeItem(${i})" class="opacity-0 group-hover:opacity-100 text-stone-600 hover:text-red-500 transition px-2 mt-2"><span class="material-icons-round text-sm">delete</span></button>
            </div>
        `
      )
      .join("");
  } else {
    body.innerHTML = `
            <table class="data-table">
                <thead><tr>${ch.headers
                  .map((h) => `<th>${h}</th>`)
                  .join("")}<th></th></tr></thead>
                <tbody>
                    ${ch.content
                      .map((row, rIdx) => {
                        const rowId = activeIndex === 6 ? row[3] : null;
                        const colorClass =
                          activeIndex === 6 ? getRoleColorClass(row[1]) : "";
                        return `
                        <tr>
                            <td><input type="text" value="${
                              row[0]
                            }" class="edit-input ${colorClass}" onchange="window.saveTable(${rIdx}, 0, this.value, '${rowId}')"></td>
                            <td><input type="text" value="${
                              row[1]
                            }" class="edit-input ${colorClass}" onchange="window.saveTable(${rIdx}, 1, this.value, '${rowId}')"></td>
                            <td><textarea rows="1" class="edit-input ${colorClass}" oninput="window.autoResize(this)" onchange="window.saveTable(${rIdx}, 2, this.value, '${rowId}')">${
                          row[2]
                        }</textarea></td>
                            <td class="w-8 pt-2">
                                ${
                                  activeIndex !== 6
                                    ? `<button onclick="window.removeItem(${rIdx})" class="text-stone-700 hover:text-red-500 px-2"><span class="material-icons-round text-sm">close</span></button>`
                                    : ""
                                }
                            </td>
                        </tr>`;
                      })
                      .join("")}
                </tbody>
            </table>`;
  }
  setTimeout(
    () => document.querySelectorAll("textarea").forEach(autoResize),
    10
  );
}

window.addRow = function () {
  const ch = weddingData.chapters[activeIndex];
  if (!ch) return;

  if (ch.type === "list") {
    if (!ch.content) ch.content = [];
    ch.content.push({ text: "", checked: false });
  } else if (ch.type === "table") {
    if (!ch.content) ch.content = [];
    const newRow = ch.headers.map(() => "-");
    ch.content.push(newRow);
  }

  pushToFirebase();
  refreshModal();

  const allEl = document.querySelectorAll("[class='check-item group']");
  const newEl = allEl[allEl.length - 1];
  if (newEl) {
    newEl.scrollIntoView({ behavior: "smooth", block: "center" });
    newEl.focus();
  }
};

window.saveTable = (r, c, val, rowId) => {
  if (activeIndex === 6) {
    const fields = ["name", "role", "notes"];
    const updates = {};
    updates[`guestList/${rowId}/${fields[c]}`] = val;
    update(ref(db), updates);
  } else {
    weddingData.chapters[activeIndex].content[r][c] = val;
    pushToFirebase();
  }
};

/**
 * BOSS ROOM LAYOUT ENGINE - MIRO STYLE
 */
function renderPlanner(container) {
  if (!container.querySelector("#planner-canvas")) {
    container.innerHTML = `<div id="planner-canvas"><div id="planner-viewport"></div></div>`;

    const canvas = document.getElementById("planner-canvas");
    const viewport = document.getElementById("planner-viewport");

    // Zooming Logic
    canvas.onwheel = (e) => {
      e.preventDefault();
      const zoomSpeed = 0.05;
      const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
      scale = Math.max(0.2, Math.min(3, scale + delta));
      viewport.style.transform = `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${scale})`;
    };

    // Panning Logic (Delta: Added Touch Support)
    let isPanning = false;
    let startX, startY;

    const startPanning = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      if (e.target !== canvas && e.target !== viewport) return;
      isPanning = true;
      startX = clientX - panX;
      startY = clientY - panY;
    };

    const movePanning = (e) => {
      if (!isPanning) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      panX = clientX - startX;
      panY = clientY - startY;
      viewport.style.transform = `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${scale})`;
    };

    const endPanning = () => {
      isPanning = false;
    };

    canvas.onmousedown = startPanning;
    window.onmousemove = movePanning;
    window.onmouseup = endPanning;

    // Mobile Touch Listeners
    canvas.addEventListener("touchstart", startPanning, { passive: false });
    window.addEventListener("touchmove", movePanning, { passive: false });
    window.addEventListener("touchend", endPanning);
  }

  const viewport = document.getElementById("planner-viewport");
  const layout = weddingData.chapters[13].layout || {};

  viewport.innerHTML = "";
  viewport.style.transform = `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${scale})`;

  Object.entries(layout).forEach(([id, obj]) => {
    // COORDINATE MIGRATION: If values are small (0-100), migrate to pixel space (2500 center)
    if (obj.x <= 150 || obj.y <= 150) {
      obj.x = 2500 + (obj.x - 50) * 35;
      obj.y = 2500 + (obj.y - 50) * 35;
    }

    const el = document.createElement("div");
    el.className = `planner-object table-${obj.type}`;
    el.style.left = obj.x + "px";
    el.style.top = obj.y + "px";

    const assigned = Object.keys(obj.assigned || {}).length;
    el.innerHTML = `
        <button class="delete-table-btn"><span class="material-icons-round">cancel</span></button>
        ${assigned > 0 ? `<div class="seat-count">${assigned}</div>` : ""}
        <input type="text" class="table-label-input uppercase" value="${
          obj.label
        }" />
    `;

    // Inline Renaming Logic
    const labelInput = el.querySelector(".table-label-input");
    labelInput.onmousedown = (e) => e.stopPropagation();
    labelInput.addEventListener("touchstart", (e) => e.stopPropagation());
    labelInput.onchange = (e) => {
      const val = e.target.value.trim();
      if (val) {
        obj.label = val;
        update(ref(db), {
          [`wedding_data/chapters/13/layout/${id}/label`]: val,
        });
      }
    };

    // Delete Table logic
    const deleteBtn = el.querySelector(".delete-table-btn");
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm(`Remove ${obj.label} permanently?`)) {
        update(ref(db), { [`wedding_data/chapters/13/layout/${id}`]: null });
      }
    };
    deleteBtn.addEventListener("touchstart", (e) => {
      e.stopPropagation();
    });

    el.onclick = (e) => {
      if (el.dataset.dragging === "true") return;
      if (e.target.classList.contains("table-label-input")) return;
      currentTableId = id;
      openSeatModal();
    };

    // Table Dragging (Delta: Added Touch Support)
    let isDragging = false;
    const handleDragStart = (e) => {
      if (
        e.target.closest(".delete-table-btn") ||
        e.target.classList.contains("table-label-input")
      )
        return;

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      e.stopPropagation();
      isDragging = true;
      isDraggingTable = true;
      el.dataset.dragging = "false";

      let shiftX = (clientX - el.getBoundingClientRect().left) / scale;
      let shiftY = (clientY - el.getBoundingClientRect().top) / scale;

      const handleDragMove = (ev) => {
        const moveX = ev.touches ? ev.touches[0].clientX : ev.clientX;
        const moveY = ev.touches ? ev.touches[0].clientY : ev.clientY;

        isDragging = true;
        el.dataset.dragging = "true";
        const rect = viewport.getBoundingClientRect();
        let nx = (moveX - rect.left) / scale - shiftX;
        let ny = (moveY - rect.top) / scale - shiftY;
        el.style.left = nx + "px";
        el.style.top = ny + "px";
        obj.x = Math.round(nx);
        obj.y = Math.round(ny);
      };

      const handleDragEnd = () => {
        isDraggingTable = false;
        if (isDragging) {
          update(ref(db), {
            [`wedding_data/chapters/13/layout/${id}/x`]: obj.x,
            [`wedding_data/chapters/13/layout/${id}/y`]: obj.y,
          });
        }
        document.removeEventListener("mousemove", handleDragMove);
        document.removeEventListener("mouseup", handleDragEnd);
        document.removeEventListener("touchmove", handleDragMove);
        document.removeEventListener("touchend", handleDragEnd);
      };
      document.addEventListener("mousemove", handleDragMove);
      document.addEventListener("mouseup", handleDragEnd);
      document.addEventListener("touchmove", handleDragMove, {
        passive: false,
      });
      document.addEventListener("touchend", handleDragEnd);
    };

    el.onmousedown = handleDragStart;
    el.addEventListener("touchstart", handleDragStart, { passive: false });

    viewport.appendChild(el);
  });
}

window.addTable = (type) => {
  const id = "table_" + Date.now();
  const newTable = {
    x: 2500 - panX / scale,
    y: 2500 - panY / scale,
    type: type,
    label: type.toUpperCase(),
    assigned: {},
  };
  update(ref(db), { [`wedding_data/chapters/13/layout/${id}`]: newTable });
};

window.resetView = () => {
  panX = 0;
  panY = 0;
  scale = 1;
  const viewport = document.getElementById("planner-viewport");
  if (viewport) viewport.style.transform = `translate(-50%, -50%) scale(1)`;
  const body = document.getElementById("modal-body");
  body.innerHTML = "";
  renderPlanner(body);
};

function openSeatModal() {
  document.getElementById("seat-modal").classList.remove("hidden");
  renderTableContext();
  renderGuestPicker();
}

function renderTableContext() {
  const container = document.getElementById("table-zoom-container");
  const namesList = document.getElementById("assigned-names-list");
  const table = weddingData.chapters[13].layout[currentTableId];

  container.innerHTML = `<div id="zoom-table" class="zoom-table-base zoom-${table.type}">${table.label}</div>`;
  namesList.innerHTML = "";

  Object.entries(table.assigned || {}).forEach(([guestId, coords]) => {
    const guest = guestDataMap[guestId];
    if (!guest) return;

    const nameItem = document.createElement("div");
    nameItem.className = "flex items-center justify-between group/name";
    nameItem.innerHTML = `
      <div class="flex items-center gap-2 py-0.5">
        <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
        <span class="truncate">${guest.name}</span>
      </div>
      <button onclick="window.toggleSeat('${guestId}')" class="opacity-0 group-hover/name:opacity-100 text-stone-600 hover:text-red-500 transition px-1">
        <span class="material-icons-round text-xs">close</span>
      </button>
    `;
    namesList.appendChild(nameItem);

    const bubble = document.createElement("div");
    bubble.className = "seat-bubble";
    bubble.innerText = getInitials(guest.name);
    bubble.setAttribute("data-name", guest.name);
    bubble.style.left = (coords.x || 50) + "%";
    bubble.style.top = (coords.y || 50) + "%";

    const startDrag = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      isDraggingBubble = true;
      const move = (ev) => {
        const moveX = ev.touches ? ev.touches[0].clientX : ev.clientX;
        const moveY = ev.touches ? ev.touches[0].clientY : ev.clientY;
        const rect = container.getBoundingClientRect();

        let posX = ((moveX - rect.left) / rect.width) * 100;
        let posY = ((moveY - rect.top) / rect.height) * 100;

        posX = Math.max(5, Math.min(95, posX));
        posY = Math.max(5, Math.min(95, posY));

        bubble.style.left = posX + "%";
        bubble.style.top = posY + "%";
        table.assigned[guestId] = { x: Math.round(posX), y: Math.round(posY) };
      };
      const stop = () => {
        isDraggingBubble = false;
        update(ref(db), {
          [`wedding_data/chapters/13/layout/${currentTableId}/assigned/${guestId}`]:
            table.assigned[guestId],
        });
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", stop);
        document.removeEventListener("touchmove", move);
        document.removeEventListener("touchend", stop);
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", stop);
      document.addEventListener("touchmove", move, { passive: false });
      document.addEventListener("touchend", stop);
    };
    bubble.onmousedown = startDrag;
    bubble.addEventListener("touchstart", startDrag, { passive: false });
    container.appendChild(bubble);
  });
}

function getGuestTableInfo(guestId) {
  const layout = weddingData.chapters[13].layout;
  for (const tableId in layout) {
    if (layout[tableId].assigned && layout[tableId].assigned[guestId]) {
      return { id: tableId, label: layout[tableId].label };
    }
  }
  return null;
}

function renderGuestPicker() {
  const listEl = document.getElementById("guest-selection-list");
  const table = weddingData.chapters[13].layout[currentTableId];
  const assignedIds = Object.keys(table.assigned || {});
  const query = (
    document.getElementById("guest-search").value || ""
  ).toLowerCase();

  const sorted = Object.entries(guestDataMap)
    .filter(([id, g]) => g && (g.name || "").toLowerCase().includes(query))
    .sort((a, b) => {
      const roleA = (a[1].role || "").toLowerCase().trim();
      const roleB = (b[1].role || "").toLowerCase().trim();
      const idxA = ROLE_HIERARCHY.indexOf(roleA);
      const idxB = ROLE_HIERARCHY.indexOf(roleB);
      const valA = idxA === -1 ? 99 : idxA;
      const valB = idxB === -1 ? 99 : idxB;
      if (valA !== valB) return valA - valB;
      return (a[1].name || "").localeCompare(b[1].name || "");
    });

  let currentRole = "";
  listEl.innerHTML = sorted
    .map(([id, g]) => {
      let html = "";
      const role = (g.role || "guest").toLowerCase().trim();
      if (role !== currentRole) {
        currentRole = role;
        html += `<div class="picker-role-header"><span class="w-1 h-1 rounded-full bg-stone-700"></span>${role}</div>`;
      }

      const assignment = getGuestTableInfo(id);
      const isHere = assignedIds.includes(id);
      const elsewhere = assignment && !isHere;

      html += `<div class="flex items-center justify-between bg-white/5 p-3 rounded-2xl border border-white/5 ${
        elsewhere ? "opacity-50" : ""
      }">
                <div class="flex flex-col">
                  <span class="text-xs font-bold text-stone-200">${
                    g.name
                  }</span>
                  <div class="flex items-center gap-2">
                    <span class="text-[8px] uppercase text-stone-500 font-black">${
                      g.role || "Guest"
                    }</span>
                    ${
                      elsewhere
                        ? `<span class="text-[7px] text-amber-500 font-bold uppercase tracking-tighter bg-amber-500/10 px-1 rounded">At ${assignment.label}</span>`
                        : ""
                    }
                  </div>
                </div>
                <button onclick="${
                  elsewhere ? "" : `window.toggleSeat('${id}')`
                }" class="w-8 h-8 rounded-full flex items-center justify-center transition ${
        isHere
          ? "bg-amber-500 text-stone-900"
          : elsewhere
          ? "bg-stone-800/50 text-stone-700 cursor-not-allowed"
          : "bg-stone-800 text-stone-500"
      }">
                    <span class="material-icons-round text-sm">${
                      isHere ? "check" : elsewhere ? "lock" : "add"
                    }</span>
                </button>
            </div>`;
      return html;
    })
    .join("");
}

window.toggleSeat = (id) => {
  const table = weddingData.chapters[13].layout[currentTableId];
  if (!table.assigned) table.assigned = {};
  if (table.assigned[id]) delete table.assigned[id];
  else table.assigned[id] = { x: 50, y: 50 };
  update(ref(db), {
    [`wedding_data/chapters/13/layout/${currentTableId}/assigned`]:
      table.assigned,
  });
  renderTableContext();
  renderGuestPicker();
};

window.closeSeatModal = () => {
  document.getElementById("seat-modal").classList.add("hidden");
  refreshModal();
};
window.filterGuestList = () => renderGuestPicker();
window.autoResize = autoResize;
window.toggleCheck = (i, v) => {
  weddingData.chapters[activeIndex].content[i].checked = v;
  pushToFirebase();
};
window.saveContent = (i, v) => {
  weddingData.chapters[activeIndex].content[i].text = v;
  pushToFirebase();
};
window.removeItem = (i) => {
  weddingData.chapters[activeIndex].content.splice(i, 1);
  pushToFirebase();
};
window.closeModal = () => {
  document.getElementById("modal").classList.add("hidden");
  activeIndex = null;
  currentTableId = null;
};

function pushToFirebase() {
  document.getElementById("sync-indicator").innerHTML =
    '<span class="material-icons-round text-xs animate-spin">sync</span> Saving...';
  set(ref(db, "wedding_data"), weddingData);
}

initSync();
