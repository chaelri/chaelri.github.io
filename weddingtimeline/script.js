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

let weddingData = { chapters: [] };
let activeIndex = null;
let guestDataMap = {};
let currentTableId = null;

function autoResize(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

function initSync() {
  onValue(ref(db, "wedding_data"), (snapshot) => {
    try {
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
      }
      document.getElementById("sync-indicator").innerHTML =
        '<span class="material-icons-round text-xs text-emerald-500">cloud_done</span> Up to Date';
      renderGallery();
      if (activeIndex !== null && activeIndex !== 13) refreshModal();
    } catch (e) {
      console.error(e);
    }
  });

  onValue(ref(db, "guestList"), (snapshot) => {
    const list = snapshot.val() || {};
    guestDataMap = list;

    const sortedGuests = Object.entries(list)
      .filter(([id, g]) => {
        const r = (g.role || "").toLowerCase().trim();
        return r !== "";
      })
      .sort((a, b) => {
        const roleA = (a[1].role || "guest").toLowerCase().trim();
        const roleB = (b[1].role || "guest").toLowerCase().trim();
        const idxA =
          ROLE_HIERARCHY.indexOf(roleA) === -1
            ? 99
            : ROLE_HIERARCHY.indexOf(roleA);
        const idxB =
          ROLE_HIERARCHY.indexOf(roleB) === -1
            ? 99
            : ROLE_HIERARCHY.indexOf(roleB);

        if (idxA !== idxB) return idxA - idxB;
        return (a[1].name || "").localeCompare(b[1].name || "");
      });

    const entChapter = weddingData.chapters.find((c) => c.id === 6);
    if (entChapter) {
      entChapter.content = sortedGuests
        .filter(
          ([id, g]) => !["guest", "guests"].includes(g.role.toLowerCase())
        )
        .map(([id, g]) => [g.name, g.role, g.notes || "", id]);
    }

    renderGallery();
    if (activeIndex === 6) refreshModal();
    if (activeIndex === 13) refreshModal();
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
                <div>
                    <h3 class="text-stone-500 font-bold text-[10px] uppercase tracking-widest mb-1">Quest Log</h3>
                    <h2 class="font-['Playfair_Display'] italic text-2xl text-stone-100">${ch.title}</h2>
                </div>
                <div class="bg-black/60 w-fit px-3 py-1.5 rounded-lg text-[9px] font-bold text-amber-500 border border-white/5 uppercase tracking-[0.15em] mt-4">
                    ${ch.period}
                </div>
            </div>
        </div>
    `
    )
    .join("");
}

window.openModal = function (idx) {
  activeIndex = idx;
  document.getElementById("modal").classList.remove("hidden");
  refreshModal();
};

function refreshModal() {
  const ch = weddingData.chapters[activeIndex];
  const body = document.getElementById("modal-body");
  const addBtn = document.getElementById("add-row-btn");

  if (activeIndex === 6 || activeIndex === 13) addBtn.classList.add("hidden");
  else addBtn.classList.remove("hidden");

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
                <button onclick="window.removeItem(${i})" class="opacity-0 group-hover:opacity-100 text-stone-600 hover:text-red-500 transition px-2 mt-2">
                    <span class="material-icons-round text-sm">delete</span>
                </button>
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

function renderPlanner(container) {
  container.innerHTML = `<div id="planner-canvas"></div>`;
  const canvas = document.getElementById("planner-canvas");
  const layout = weddingData.chapters[13].layout || {};

  Object.entries(layout).forEach(([id, obj]) => {
    const el = document.createElement("div");
    el.className = `planner-object table-${obj.type}`;
    el.style.left = obj.x + "%";
    el.style.top = obj.y + "%";
    el.style.transform = "translate(-50%, -50%)";
    const count = (obj.assigned || []).length;
    el.innerHTML = `${
      count > 0 ? `<div class="seat-count">${count}</div>` : ""
    }<span class="table-label uppercase">${obj.label}</span>`;
    el.onclick = (e) => {
      if (el.dataset.dragging === "true") return;
      currentTableId = id;
      openSeatModal();
    };

    let isDragging = false;
    const startDrag = (e) => {
      isDragging = true;
      el.dataset.dragging = "false";
      const onDrag = (ev) => {
        if (!isDragging) return;
        el.dataset.dragging = "true";
        const moveX = ev.type?.includes("touch")
          ? ev.touches[0].clientX
          : ev.clientX;
        const moveY = ev.type?.includes("touch")
          ? ev.touches[0].clientY
          : ev.clientY;
        const rect = canvas.getBoundingClientRect();
        let xp = ((moveX - rect.left) / rect.width) * 100;
        let yp = ((moveY - rect.top) / rect.height) * 100;
        xp = Math.max(0, Math.min(100, xp));
        yp = Math.max(0, Math.min(100, yp));
        el.style.left = xp + "%";
        el.style.top = yp + "%";
        obj.x = Math.round(xp);
        obj.y = Math.round(yp);
      };
      const endDrag = () => {
        isDragging = false;
        pushToFirebase();
        document.removeEventListener("mousemove", onDrag);
        document.removeEventListener("mouseup", endDrag);
        document.removeEventListener("touchmove", onDrag);
        document.removeEventListener("touchend", endDrag);
      };
      document.addEventListener("mousemove", onDrag);
      document.addEventListener("mouseup", endDrag);
      document.addEventListener("touchmove", onDrag, { passive: false });
      document.addEventListener("touchend", endDrag);
    };
    el.addEventListener("mousedown", startDrag);
    el.addEventListener("touchstart", startDrag);
    canvas.appendChild(el);
  });
}

function openSeatModal() {
  document.getElementById(
    "seat-modal-title"
  ).innerText = `${weddingData.chapters[13].layout[currentTableId].label} Assignments`;
  document.getElementById("seat-modal").classList.remove("hidden");
  renderGuestPicker();
}

function renderGuestPicker() {
  const listEl = document.getElementById("guest-selection-list");
  const tableObj = weddingData.chapters[13].layout[currentTableId];
  const assignedIds = tableObj.assigned || [];
  const query = document.getElementById("guest-search").value.toLowerCase();
  const allAssigned = Object.values(weddingData.chapters[13].layout).flatMap(
    (t) => t.assigned || []
  );

  const filteredAndSorted = Object.entries(guestDataMap)
    .filter(([id, g]) => (g.name || "").toLowerCase().includes(query))
    .sort((a, b) => {
      const roleA = (a[1].role || "guest").toLowerCase().trim();
      const roleB = (b[1].role || "guest").toLowerCase().trim();
      const idxA =
        ROLE_HIERARCHY.indexOf(roleA) === -1
          ? 99
          : ROLE_HIERARCHY.indexOf(roleA);
      const idxB =
        ROLE_HIERARCHY.indexOf(roleB) === -1
          ? 99
          : ROLE_HIERARCHY.indexOf(roleB);
      if (idxA !== idxB) return idxA - idxB;
      return (a[1].name || "").localeCompare(b[1].name || "");
    });

  let currentRoleGroup = "";
  listEl.innerHTML = filteredAndSorted
    .map(([id, g]) => {
      let html = "";
      const role = (g.role || "guest").toLowerCase().trim();
      const colorClass = getRoleColorClass(role);

      // Add Header if role changes
      if (role !== currentRoleGroup) {
        currentRoleGroup = role;
        html += `<div class="picker-role-header">
                        <span class="w-2 h-2 rounded-full bg-stone-700"></span>
                        ${role}
                     </div>`;
      }

      const isHere = assignedIds.includes(id);
      const isElsewhere = !isHere && allAssigned.includes(id);

      html += `<div class="flex items-center justify-between bg-white/5 p-4 rounded-[1.5rem] border border-white/5 hover:border-white/10 transition group ${
        isElsewhere ? "opacity-30 pointer-events-none grayscale" : ""
      }">
                <div class="flex flex-col">
                    <span class="text-sm font-bold text-stone-100 ${colorClass}">${
        g.name
      }</span>
                    <span class="text-[9px] uppercase tracking-widest text-stone-500 font-black mt-1">${
                      g.role
                    }</span>
                </div>
                <button onclick="window.toggleSeat('${id}')" class="w-10 h-10 rounded-full flex items-center justify-center transition ${
        isHere
          ? "bg-amber-500 text-[#1c1b19]"
          : "bg-stone-800 text-stone-500 group-hover:bg-amber-500/20 group-hover:text-amber-500"
      }">
                    <span class="material-icons-round text-lg">${
                      isHere ? "check" : "add"
                    }</span>
                </button>
            </div>`;
      return html;
    })
    .join("");
}

window.toggleSeat = (id) => {
  const assigned =
    weddingData.chapters[13].layout[currentTableId].assigned || [];
  const idx = assigned.indexOf(id);
  if (idx > -1) assigned.splice(idx, 1);
  else assigned.push(id);
  weddingData.chapters[13].layout[currentTableId].assigned = assigned;
  pushToFirebase();
  renderGuestPicker();
};

window.filterGuestList = () => renderGuestPicker();
window.closeSeatModal = () =>
  document.getElementById("seat-modal").classList.add("hidden");
window.autoResize = autoResize;
window.toggleCheck = (idx, isChecked) => {
  weddingData.chapters[activeIndex].content[idx].checked = isChecked;
  pushToFirebase();
};
window.saveContent = (idx, val) => {
  weddingData.chapters[activeIndex].content[idx].text = val;
  pushToFirebase();
};
window.removeItem = (idx) => {
  weddingData.chapters[activeIndex].content.splice(idx, 1);
  pushToFirebase();
};
window.closeModal = () => {
  document.getElementById("modal").classList.add("hidden");
  activeIndex = null;
};

document.getElementById("add-row-btn").onclick = () => {
  const ch = weddingData.chapters[activeIndex];
  if (ch.type === "list")
    ch.content.push({ text: "New Item Entry...", checked: false });
  else ch.content.push(new Array(ch.headers.length).fill("-"));
  pushToFirebase();
};

function pushToFirebase() {
  document.getElementById("sync-indicator").innerHTML =
    '<span class="material-icons-round text-xs animate-spin">sync</span> Saving...';
  set(ref(db, "wedding_data"), weddingData);
}

initSync();
