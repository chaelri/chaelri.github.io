/**
 * Home Blueprint — grid-based floor plan editor
 *
 * Data model (Firebase wedding_data/blueprint):
 *   rooms/{roomId}: { id, name, cellSize (cm per cell, default 20), cols, rows, createdAt }
 *   objects/{objectId}: { id, roomId, kind, ...payload }
 *     kind "wall"  => { x1, y1, x2, y2 }    (grid node coords, axis-aligned)
 *     kind "door"  => { x1, y1, x2, y2 }
 *     kind "window"=> { x1, y1, x2, y2 }
 *     kind "furn"  => { x, y, w, h, label, category, rotation (0|90|180|270) }
 *
 *   x/y are in *grid cell units*. Walls live on grid edges (between cells).
 *   Furniture occupies whole cells starting at (x, y) with size (w, h).
 */

import {
  ref,
  onValue,
  set,
  update,
  push,
  remove,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const CELL_UNIT = 40; // SVG units per grid cell
const WALL_THICKNESS = 6; // SVG units

const FURNITURE_LIBRARY = [
  // kitchen / appliances
  { key: "fridge",  label: "Fridge",       icon: "kitchen",          w: 3,  h: 3,  category: "appliance" },
  { key: "stove",   label: "Stove",        icon: "local_fire_department", w: 3, h: 3, category: "kitchen" },
  { key: "sink",    label: "Sink",         icon: "water_drop",       w: 3,  h: 3,  category: "kitchen" },
  { key: "counter", label: "Counter",      icon: "table_bar",        w: 8,  h: 3,  category: "kitchen" },
  { key: "dining",  label: "Dining Table", icon: "dinner_dining",    w: 8,  h: 6,  category: "kitchen" },
  { key: "chair",   label: "Chair",        icon: "chair",            w: 2,  h: 2,  category: "living" },
  { key: "microwave", label: "Microwave",  icon: "microwave",        w: 3,  h: 2,  category: "appliance" },

  // living
  { key: "sofa2",   label: "Sofa · 2-seat",icon: "weekend",          w: 7,  h: 4,  category: "living" },
  { key: "sofa3",   label: "Sofa · 3-seat",icon: "weekend",          w: 10, h: 4,  category: "living" },
  { key: "tv",      label: "TV",           icon: "tv",               w: 5,  h: 1,  category: "living" },
  { key: "center",  label: "Center Table", icon: "table_restaurant", w: 5,  h: 3,  category: "living" },
  { key: "rug",     label: "Rug",          icon: "crop_square",      w: 8,  h: 5,  category: "living" },

  // bedroom
  { key: "bedS",    label: "Bed · Single", icon: "bed",              w: 5,  h: 10, category: "bedroom" },
  { key: "bedQ",    label: "Bed · Queen",  icon: "bed",              w: 8,  h: 10, category: "bedroom" },
  { key: "bedK",    label: "Bed · King",   icon: "bed",              w: 9,  h: 10, category: "bedroom" },
  { key: "wardrobe",label: "Wardrobe",     icon: "checkroom",        w: 5,  h: 3,  category: "bedroom" },
  { key: "nightstand",label:"Nightstand",  icon: "nightlight_round", w: 2,  h: 2,  category: "bedroom" },

  // office
  { key: "desk",    label: "Desk",         icon: "desk",             w: 6,  h: 3,  category: "office" },
  { key: "chairO",  label: "Office Chair", icon: "chair_alt",        w: 3,  h: 3,  category: "office" },
  { key: "shelf",   label: "Shelf",        icon: "shelves",          w: 4,  h: 2,  category: "office" },

  // bath
  { key: "toilet",  label: "Toilet",       icon: "wc",               w: 2,  h: 3,  category: "bath" },
  { key: "shower",  label: "Shower",       icon: "shower",           w: 4,  h: 4,  category: "bath" },
  { key: "bathtub", label: "Bathtub",      icon: "bathtub",          w: 4,  h: 8,  category: "bath" },
  { key: "vanity",  label: "Vanity",       icon: "bathroom",         w: 4,  h: 3,  category: "bath" },

  // appliances / utility
  { key: "washer",  label: "Washer",       icon: "local_laundry_service", w: 3, h: 3, category: "appliance" },
  { key: "dryer",   label: "Dryer",        icon: "dry_cleaning",     w: 3,  h: 3,  category: "appliance" },
  { key: "aircon",  label: "Aircon",       icon: "ac_unit",          w: 4,  h: 1,  category: "appliance" },
  { key: "heater",  label: "Water Heater", icon: "water_damage",     w: 2,  h: 2,  category: "appliance" },

  // decor
  { key: "plant",   label: "Plant",        icon: "potted_plant",     w: 2,  h: 2,  category: "living" },
  { key: "mirror",  label: "Mirror",       icon: "crop_portrait",    w: 3,  h: 1,  category: "bedroom" },
];

// Default 3D heights in cm per furniture key (fallbacks: by category)
const FURNITURE_HEIGHTS = {
  bedS: 50, bedQ: 50, bedK: 50,
  sofa2: 80, sofa3: 80, center: 40, rug: 1,
  dining: 75, chair: 90, counter: 90, stove: 90, sink: 90, fridge: 180, microwave: 30,
  wardrobe: 200, nightstand: 55,
  desk: 75, chairO: 100, shelf: 180,
  toilet: 40, shower: 200, bathtub: 55, vanity: 85,
  washer: 85, dryer: 85, aircon: 30, heater: 60,
  plant: 120, mirror: 160, tv: 60,
};
const HEIGHT_BY_CATEGORY = {
  living: 60, bedroom: 120, kitchen: 90, bath: 100, office: 90, appliance: 120,
};

export function initBlueprint({ db, confirmModal }) {
  const state = {
    rooms: {},         // { id: room }
    objects: {},       // { id: object }
    currentRoomId: null,
    tool: "select",
    pendingFurn: null, // FurnitureDef if placing
    selectedId: null,
    // view
    zoom: 1,
    panX: 0,
    panY: 0,
    viewMode: "2d",    // "2d" | "3d"
    // drawing state (wall/door/window)
    drawStart: null,
    drawHover: null,
    isDrawingLine: false,
    // dragging
    draggingObj: null,
    dragStartCell: null,
    dragStartObj: null,
    isPanning: false,
    panStartClient: null,
    panStartPan: null,
    showGrid: true,
    showRuler: true,
  };

  // 3D module state (populated lazily)
  const three = {
    loaded: false,
    loading: null,
    THREE: null,
    OrbitControls: null,
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    raf: null,
    dynamicGroup: null,
    disposables: [],
    resizeObserver: null,
  };

  const $ = (id) => document.getElementById(id);
  const svg = $("bp-svg");

  /* ─── Firebase sync ─── */
  onValue(ref(db, "wedding_data/blueprint/rooms"), (snap) => {
    state.rooms = snap.val() || {};
    // Ensure at least one room exists
    const ids = Object.keys(state.rooms);
    if (ids.length === 0) {
      // Don't auto-create on first load — let the user pick. But seed entry count.
      state.currentRoomId = null;
    } else if (!state.currentRoomId || !state.rooms[state.currentRoomId]) {
      state.currentRoomId = ids[0];
    }
    updateEntryCount();
    renderAll();
  });

  onValue(ref(db, "wedding_data/blueprint/objects"), (snap) => {
    state.objects = snap.val() || {};
    renderObjects();
    if (state.viewMode === "3d" && three.loaded) rebuild3D();
  });

  function updateEntryCount() {
    const el = $("bp-entry-rooms");
    if (el) el.textContent = String(Object.keys(state.rooms).length);
  }

  /* ─── Open / close ─── */
  window.openBlueprint = function () {
    $("bp-overlay").classList.remove("hidden");
    document.body.style.overflow = "hidden";
    renderAll();
    // If no rooms, prompt create
    if (Object.keys(state.rooms).length === 0) {
      setTimeout(() => window.createRoom(), 200);
    }
  };
  window.closeBlueprint = function () {
    $("bp-overlay").classList.add("hidden");
    document.body.style.overflow = "";
    closeRoomMenu();
  };

  /* ─── Room management ─── */
  window.openRoomMenu = function () {
    const menu = $("bp-room-menu");
    const isOpen = !menu.classList.contains("hidden");
    if (isOpen) { menu.classList.add("hidden"); return; }
    renderRoomList();
    menu.classList.remove("hidden");
    setTimeout(() => {
      document.addEventListener("click", onDocClickCloseRoomMenu, { once: true });
    }, 0);
  };
  function onDocClickCloseRoomMenu(e) {
    if (!e.target.closest("#bp-room-menu") && !e.target.closest("#bp-room-btn")) {
      closeRoomMenu();
    } else {
      setTimeout(() => {
        document.addEventListener("click", onDocClickCloseRoomMenu, { once: true });
      }, 0);
    }
  }
  function closeRoomMenu() {
    const menu = $("bp-room-menu");
    if (menu) menu.classList.add("hidden");
  }

  function renderRoomList() {
    const list = $("bp-room-list");
    if (!list) return;
    const rooms = Object.values(state.rooms).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    list.innerHTML = rooms.map((r) => `
      <button class="bp-room-item ${r.id === state.currentRoomId ? "is-active" : ""}" onclick="window.switchRoom('${r.id}')">
        <span>${escapeHtml(r.name || "Untitled")}</span>
        <span class="tobuy-entry-count">${r.cols}×${r.rows}</span>
      </button>
    `).join("") || `<div style="padding:12px 10px;color:var(--text-faint);font-size:11px;">No rooms yet</div>`;
  }

  window.switchRoom = function (id) {
    if (!state.rooms[id]) return;
    state.currentRoomId = id;
    state.selectedId = null;
    renderAll();
    closeRoomMenu();
    if (state.viewMode === "3d" && three.loaded) rebuild3D();
  };

  window.createRoom = async function () {
    const name = (window.prompt("Name this room (e.g. Living Room, Master Bedroom)", "Living Room") || "").trim();
    if (!name) { closeRoomMenu(); return; }
    const newRef = push(ref(db, "wedding_data/blueprint/rooms"));
    const id = newRef.key;
    const room = {
      id, name,
      cellSize: 20,    // cm
      cols: 30, rows: 24,
      createdAt: Date.now(),
    };
    await set(newRef, room);
    state.currentRoomId = id;
    closeRoomMenu();
  };

  window.renameCurrentRoom = async function () {
    const room = currentRoom();
    if (!room) return;
    const name = (window.prompt("New room name", room.name || "") || "").trim();
    if (!name) { closeRoomMenu(); return; }
    await update(ref(db, `wedding_data/blueprint/rooms/${room.id}`), { name });
    closeRoomMenu();
  };

  window.resizeCurrentRoom = async function () {
    const room = currentRoom();
    if (!room) return;
    const input = window.prompt(
      `Room size in cells (1 cell = ${room.cellSize}cm). Format: cols×rows`,
      `${room.cols}x${room.rows}`
    );
    if (!input) { closeRoomMenu(); return; }
    const m = input.match(/(\d+)\s*[x×*]\s*(\d+)/i);
    if (!m) { alert("Use format like: 30x24"); return; }
    const cols = Math.max(4, Math.min(200, parseInt(m[1], 10)));
    const rows = Math.max(4, Math.min(200, parseInt(m[2], 10)));
    await update(ref(db, `wedding_data/blueprint/rooms/${room.id}`), { cols, rows });
    bpResetView();
    closeRoomMenu();
  };

  window.deleteCurrentRoom = async function () {
    const room = currentRoom();
    if (!room) return;
    const ok = await confirmModal({
      title: "Delete this room?",
      message: "{{name}} and all its walls, doors, windows and furniture will be permanently removed.",
      strong: room.name || "(unnamed)",
      okLabel: "Delete",
    });
    if (!ok) return;
    // Remove the room and all of its objects
    const objsToRemove = Object.values(state.objects).filter((o) => o.roomId === room.id);
    const updates = {};
    updates[`wedding_data/blueprint/rooms/${room.id}`] = null;
    objsToRemove.forEach((o) => {
      updates[`wedding_data/blueprint/objects/${o.id}`] = null;
    });
    await update(ref(db), updates);
    state.currentRoomId = null;
    closeRoomMenu();
  };

  function currentRoom() {
    return state.currentRoomId ? state.rooms[state.currentRoomId] : null;
  }

  /* ─── Tool + furniture selection ─── */
  window.setBpTool = function (tool) {
    state.tool = tool;
    state.pendingFurn = null;
    state.drawStart = null;
    state.isDrawingLine = false;
    state.selectedId = null;
    renderToolbar();
    renderPropsPanel();
    renderObjects();
    setSvgToolClass();
    showHint(toolHint(tool));
  };
  function renderToolbar() {
    document.querySelectorAll(".bp-tool").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.tool === state.tool && !state.pendingFurn)
    );
    document.querySelectorAll(".bp-furn-item").forEach((b) => {
      b.classList.toggle("is-active", state.pendingFurn && b.dataset.key === state.pendingFurn.key);
    });
  }
  function toolHint(tool) {
    if (state.pendingFurn) return `Tap the canvas to place ${state.pendingFurn.label}. Tap Select to cancel.`;
    switch (tool) {
      case "wall": return "Tap two grid points to draw a wall";
      case "door": return "Tap two grid points along a wall to place a door";
      case "window": return "Tap two grid points along a wall to place a window";
      case "erase": return "Tap a wall or furniture to delete it";
      default: return "Tap an item to select. Drag empty space to pan.";
    }
  }
  function setSvgToolClass() {
    svg.classList.remove("tool-select","tool-wall","tool-door","tool-window","tool-erase");
    svg.classList.add(`tool-${state.tool}`);
  }

  function pickFurniture(key) {
    const f = FURNITURE_LIBRARY.find((x) => x.key === key);
    if (!f) return;
    state.pendingFurn = { ...f };
    state.tool = "furn";
    state.selectedId = null;
    renderToolbar();
    renderPropsPanel();
    setSvgToolClass();
    showHint(toolHint(state.tool));
  }
  window.addCustomFurniture = function () {
    const label = (window.prompt("Label for custom box", "Thing") || "").trim();
    if (!label) return;
    const dims = window.prompt("Width × height in cm (e.g. 80x60)", "80x60");
    if (!dims) return;
    const m = dims.match(/(\d+)\s*[x×*]\s*(\d+)/i);
    if (!m) { alert("Use format like: 80x60"); return; }
    const room = currentRoom();
    const cellSize = room ? (room.cellSize || 20) : 20;
    const w = Math.max(1, Math.round(parseInt(m[1], 10) / cellSize));
    const h = Math.max(1, Math.round(parseInt(m[2], 10) / cellSize));
    state.pendingFurn = { key: "custom", label, category: "appliance", w, h, icon: "inventory_2" };
    state.tool = "furn";
    state.selectedId = null;
    renderToolbar();
    setSvgToolClass();
    showHint(toolHint(state.tool));
  };

  /* ─── Render library once ─── */
  function renderFurnitureLibrary() {
    const host = $("bp-furn-grid");
    if (!host) return;
    host.innerHTML = FURNITURE_LIBRARY.map((f) => {
      const room = currentRoom();
      const cs = room ? (room.cellSize || 20) : 20;
      const dim = `${f.w * cs}·${f.h * cs}`;
      return `
        <button class="bp-furn-item" data-key="${f.key}" onclick="window.pickBpFurn('${f.key}')">
          <span class="material-icons-round">${f.icon}</span>
          <span>${f.label}</span>
          <span class="bp-furn-dim">${dim}cm</span>
        </button>
      `;
    }).join("");
  }
  window.pickBpFurn = pickFurniture;

  /* ─── SVG rendering ─── */
  function roomPixels() {
    const room = currentRoom();
    if (!room) return { W: 0, H: 0 };
    return { W: room.cols * CELL_UNIT, H: room.rows * CELL_UNIT };
  }

  function renderAll() {
    renderToolbar();
    renderFurnitureLibrary();
    renderRoomHeader();
    renderCanvas();
    renderObjects();
    renderPropsPanel();
    setSvgToolClass();
    showHint(toolHint(state.tool));
  }

  function renderRoomHeader() {
    const room = currentRoom();
    const name = $("bp-room-name");
    const dims = $("bp-room-dims");
    if (!name || !dims) return;
    if (!room) {
      name.textContent = "No room";
      dims.textContent = "—";
      return;
    }
    name.textContent = room.name || "Untitled";
    const wCm = room.cols * room.cellSize;
    const hCm = room.rows * room.cellSize;
    dims.textContent = `${(wCm/100).toFixed(1)}m × ${(hCm/100).toFixed(1)}m · 1 cell ${room.cellSize}cm`;
  }

  function renderCanvas() {
    const room = currentRoom();
    if (!room) {
      svg.setAttribute("viewBox", "0 0 800 600");
      $("bp-floor").setAttribute("width", 0);
      $("bp-floor").setAttribute("height", 0);
      return;
    }
    const { W, H } = roomPixels();
    // Set floor + grid
    $("bp-floor").setAttribute("x", 0);
    $("bp-floor").setAttribute("y", 0);
    $("bp-floor").setAttribute("width", W);
    $("bp-floor").setAttribute("height", H);
    $("bp-grid-rect").setAttribute("x", 0);
    $("bp-grid-rect").setAttribute("y", 0);
    $("bp-grid-rect").setAttribute("width", W);
    $("bp-grid-rect").setAttribute("height", H);
    $("bp-grid-major-rect").setAttribute("x", 0);
    $("bp-grid-major-rect").setAttribute("y", 0);
    $("bp-grid-major-rect").setAttribute("width", W);
    $("bp-grid-major-rect").setAttribute("height", H);
    $("bp-grid-rect").style.display = state.showGrid ? "" : "none";
    $("bp-grid-major-rect").style.display = state.showGrid ? "" : "none";

    updateViewBox();
    // Room border + rulers
    renderRulers();
  }

  function updateViewBox() {
    const room = currentRoom();
    if (!room) return;
    const { W, H } = roomPixels();
    const container = $("bp-canvas-wrap");
    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    // Fit to view with 10% padding
    const pad = 0.1;
    const baseFit = Math.min(rect.width / W, rect.height / H) * (1 - pad);
    const scale = baseFit * state.zoom;
    const viewW = rect.width / scale;
    const viewH = rect.height / scale;
    const cx = W / 2 + state.panX;
    const cy = H / 2 + state.panY;
    const x = cx - viewW / 2;
    const y = cy - viewH / 2;
    svg.setAttribute("viewBox", `${x} ${y} ${viewW} ${viewH}`);
  }

  function renderRulers() {
    const g = $("bp-rulers");
    if (!g) return;
    const room = currentRoom();
    if (!room) { g.innerHTML = ""; return; }
    if (!state.showRuler) { g.innerHTML = ""; return; }
    const { W, H } = roomPixels();
    const wCm = room.cols * room.cellSize;
    const hCm = room.rows * room.cellSize;

    // Border + measurement labels
    const offset = CELL_UNIT * 1.2;
    g.innerHTML = `
      <rect class="bp-room-border" x="0" y="0" width="${W}" height="${H}" />
      <line class="bp-ruler-line" x1="0" y1="${-offset}" x2="${W}" y2="${-offset}" />
      <line class="bp-ruler-line" x1="${-offset}" y1="0" x2="${-offset}" y2="${H}" />
      <text class="bp-ruler-label" x="${W/2}" y="${-offset - 10}">${(wCm/100).toFixed(2)}m</text>
      <text class="bp-ruler-label" x="${-offset - 18}" y="${H/2}" transform="rotate(-90 ${-offset-18} ${H/2})">${(hCm/100).toFixed(2)}m</text>
    `;
  }

  function renderObjects() {
    const wallsG = $("bp-walls");
    const openG = $("bp-openings");
    const furnG = $("bp-furniture");
    if (!wallsG || !openG || !furnG) return;
    const objs = currentRoomObjects();
    const walls = objs.filter((o) => o.kind === "wall");
    const doors = objs.filter((o) => o.kind === "door");
    const windows = objs.filter((o) => o.kind === "window");
    const furn = objs.filter((o) => o.kind === "furn");

    wallsG.innerHTML = walls.map((o) => wallPath(o, state.selectedId === o.id)).join("");
    openG.innerHTML = [...doors.map((o) => doorPath(o, state.selectedId === o.id)),
                        ...windows.map((o) => windowPath(o, state.selectedId === o.id))].join("");
    furnG.innerHTML = furn.map((o) => furniturePath(o, state.selectedId === o.id)).join("");

    // Attach listeners (selection)
    wallsG.querySelectorAll("[data-id]").forEach((el) => el.addEventListener("pointerdown", onObjectPointerDown));
    openG.querySelectorAll("[data-id]").forEach((el) => el.addEventListener("pointerdown", onObjectPointerDown));
    furnG.querySelectorAll("[data-id]").forEach((el) => el.addEventListener("pointerdown", onObjectPointerDown));
  }

  function currentRoomObjects() {
    if (!state.currentRoomId) return [];
    return Object.values(state.objects).filter((o) => o.roomId === state.currentRoomId);
  }

  function wallRect(o) {
    // Return the rectangle covering a line between two grid nodes
    const x1 = o.x1 * CELL_UNIT;
    const y1 = o.y1 * CELL_UNIT;
    const x2 = o.x2 * CELL_UNIT;
    const y2 = o.y2 * CELL_UNIT;
    const minx = Math.min(x1, x2);
    const miny = Math.min(y1, y2);
    const maxx = Math.max(x1, x2);
    const maxy = Math.max(y1, y2);
    const isH = miny === maxy;
    const t = WALL_THICKNESS;
    return {
      x: minx - (isH ? 0 : t / 2),
      y: miny - (isH ? t / 2 : 0),
      w: (maxx - minx) + (isH ? 0 : t),
      h: (maxy - miny) + (isH ? t : 0),
    };
  }

  function wallPath(o, selected) {
    const r = wallRect(o);
    return `<rect data-id="${o.id}" data-kind="wall" class="bp-obj-wall ${selected ? "is-selected" : ""}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="2" />`;
  }
  function doorPath(o, selected) {
    const r = wallRect(o);
    // Thinner inside the wall so the "break" is visible; plus an arc
    const x1 = o.x1 * CELL_UNIT, y1 = o.y1 * CELL_UNIT;
    const x2 = o.x2 * CELL_UNIT, y2 = o.y2 * CELL_UNIT;
    const midx = (x1 + x2) / 2;
    const midy = (y1 + y2) / 2;
    const length = Math.hypot(x2 - x1, y2 - y1);
    const isH = y1 === y2;
    const arc = isH
      ? `M ${x1} ${midy} A ${length} ${length} 0 0 1 ${midx} ${midy - length}`
      : `M ${midx} ${y1} A ${length} ${length} 0 0 1 ${midx + length} ${midy}`;
    return `
      <rect data-id="${o.id}" data-kind="door" class="bp-obj-door ${selected ? "is-selected" : ""}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" />
      <path class="bp-obj-door-arc" d="${arc}" />
    `;
  }
  function windowPath(o, selected) {
    const r = wallRect(o);
    return `<rect data-id="${o.id}" data-kind="window" class="bp-obj-window ${selected ? "is-selected" : ""}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" />`;
  }

  function furniturePath(o, selected) {
    const x = o.x * CELL_UNIT;
    const y = o.y * CELL_UNIT;
    const w = o.w * CELL_UNIT;
    const h = o.h * CELL_UNIT;
    const cls = `bp-obj-furniture bp-furn-color-${o.category || "living"} ${selected ? "is-selected" : ""}`;
    const label = escapeHtml(o.label || "Thing");
    return `
      <g transform="translate(${x} ${y}) rotate(${o.rotation || 0} ${w/2} ${h/2})">
        <rect data-id="${o.id}" data-kind="furn" class="${cls}" x="0" y="0" width="${w}" height="${h}" rx="3" />
        <text class="bp-obj-furniture-label" x="${w/2}" y="${h/2}">${label}</text>
      </g>
    `;
  }

  /* ─── Interaction ─── */
  function getSVGPoint(evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  function pointToGridNode(pt) {
    return { gx: Math.round(pt.x / CELL_UNIT), gy: Math.round(pt.y / CELL_UNIT) };
  }
  function pointToGridCell(pt) {
    return { gx: Math.floor(pt.x / CELL_UNIT), gy: Math.floor(pt.y / CELL_UNIT) };
  }

  function onObjectPointerDown(e) {
    if (state.tool === "erase") {
      const id = e.currentTarget.dataset.id;
      deleteObjectById(id);
      e.stopPropagation();
      return;
    }
    if (state.tool !== "select") return;
    const id = e.currentTarget.dataset.id;
    const kind = e.currentTarget.dataset.kind;
    state.selectedId = id;
    renderObjects();
    renderPropsPanel();

    // Allow dragging furniture
    if (kind === "furn") {
      const obj = state.objects[id];
      if (!obj) return;
      const startPt = getSVGPoint(e);
      state.draggingObj = { id, kind };
      state.dragStartCell = { gx: startPt.x / CELL_UNIT, gy: startPt.y / CELL_UNIT };
      state.dragStartObj = { ...obj };
      svg.setPointerCapture(e.pointerId);
      svg.addEventListener("pointermove", onSvgPointerMove);
      svg.addEventListener("pointerup", onSvgPointerUp);
    }
    e.stopPropagation();
  }

  function onSvgPointerDown(e) {
    if (e.target.closest("[data-id]")) return; // object handler will fire
    const pt = getSVGPoint(e);

    // Furniture placement
    if (state.pendingFurn) {
      const cell = pointToGridCell(pt);
      placeFurniture(state.pendingFurn, cell.gx, cell.gy);
      return;
    }

    if (state.tool === "wall" || state.tool === "door" || state.tool === "window") {
      const node = pointToGridNode(pt);
      if (!state.drawStart) {
        state.drawStart = node;
        state.isDrawingLine = true;
        showHint("Tap another grid point to finish");
      } else {
        // Commit — axis-align to the dominant direction
        const aligned = axisAlign(state.drawStart, node);
        if (aligned) {
          commitWall(aligned, state.tool);
        }
        state.drawStart = null;
        state.isDrawingLine = false;
        showHint(toolHint(state.tool));
        clearPreview();
      }
      return;
    }

    if (state.tool === "erase") return;

    // Pan
    state.isPanning = true;
    state.panStartClient = { x: e.clientX, y: e.clientY };
    state.panStartPan = { x: state.panX, y: state.panY };
    svg.classList.add("is-panning");
    svg.setPointerCapture(e.pointerId);
    svg.addEventListener("pointermove", onSvgPointerMove);
    svg.addEventListener("pointerup", onSvgPointerUp);

    // Deselect
    if (state.selectedId) {
      state.selectedId = null;
      renderObjects();
      renderPropsPanel();
    }
  }

  function onSvgPointerMove(e) {
    if (state.draggingObj) {
      const pt = getSVGPoint(e);
      const nowCell = { gx: pt.x / CELL_UNIT, gy: pt.y / CELL_UNIT };
      const dx = Math.round(nowCell.gx - state.dragStartCell.gx);
      const dy = Math.round(nowCell.gy - state.dragStartCell.gy);
      const nx = state.dragStartObj.x + dx;
      const ny = state.dragStartObj.y + dy;
      // Live update local state for smooth render
      const local = state.objects[state.draggingObj.id];
      if (local) {
        local.x = nx;
        local.y = ny;
        renderObjects();
      }
      return;
    }
    if (state.isPanning) {
      const dx = e.clientX - state.panStartClient.x;
      const dy = e.clientY - state.panStartClient.y;
      // Convert screen delta to SVG delta
      const container = $("bp-canvas-wrap").getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const scaleX = vb.width / container.width;
      const scaleY = vb.height / container.height;
      state.panX = state.panStartPan.x - dx * scaleX;
      state.panY = state.panStartPan.y - dy * scaleY;
      updateViewBox();
      return;
    }
    if (state.isDrawingLine) {
      const pt = getSVGPoint(e);
      const node = pointToGridNode(pt);
      const aligned = axisAlign(state.drawStart, node);
      drawPreview(aligned, state.tool);
      return;
    }
  }

  function onSvgPointerUp(e) {
    if (state.draggingObj) {
      const obj = state.objects[state.draggingObj.id];
      if (obj) {
        update(ref(db, `wedding_data/blueprint/objects/${obj.id}`), {
          x: obj.x, y: obj.y,
        });
      }
      state.draggingObj = null;
      state.dragStartCell = null;
      state.dragStartObj = null;
    }
    if (state.isPanning) {
      state.isPanning = false;
      svg.classList.remove("is-panning");
    }
    try { svg.releasePointerCapture(e.pointerId); } catch {}
    svg.removeEventListener("pointermove", onSvgPointerMove);
    svg.removeEventListener("pointerup", onSvgPointerUp);
  }

  function axisAlign(a, b) {
    if (!a || !b) return null;
    if (a.gx === b.gx && a.gy === b.gy) return null;
    const dx = Math.abs(b.gx - a.gx);
    const dy = Math.abs(b.gy - a.gy);
    if (dx >= dy) return { x1: a.gx, y1: a.gy, x2: b.gx, y2: a.gy };
    return { x1: a.gx, y1: a.gy, x2: a.gx, y2: b.gy };
  }

  function drawPreview(aligned, kind) {
    if (!aligned) { clearPreview(); return; }
    const g = $("bp-overlay-g");
    const obj = { x1: aligned.x1, y1: aligned.y1, x2: aligned.x2, y2: aligned.y2 };
    const r = wallRect(obj);
    g.innerHTML = `<rect class="bp-preview" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="2" />`;
  }
  function clearPreview() {
    const g = $("bp-overlay-g");
    if (g) g.innerHTML = "";
  }

  async function commitWall(aligned, kind) {
    if (!state.currentRoomId) return;
    const newRef = push(ref(db, "wedding_data/blueprint/objects"));
    const id = newRef.key;
    await set(newRef, {
      id,
      roomId: state.currentRoomId,
      kind: kind === "wall" ? "wall" : kind,
      x1: aligned.x1, y1: aligned.y1, x2: aligned.x2, y2: aligned.y2,
      createdAt: Date.now(),
    });
  }

  async function placeFurniture(f, gx, gy) {
    if (!state.currentRoomId) return;
    const room = currentRoom();
    if (!room) return;
    // Clamp inside room
    const nx = Math.max(0, Math.min(room.cols - f.w, gx));
    const ny = Math.max(0, Math.min(room.rows - f.h, gy));
    const newRef = push(ref(db, "wedding_data/blueprint/objects"));
    const id = newRef.key;
    await set(newRef, {
      id,
      roomId: state.currentRoomId,
      kind: "furn",
      x: nx, y: ny, w: f.w, h: f.h,
      rotation: 0,
      label: f.label, category: f.category,
      createdAt: Date.now(),
    });
  }

  async function deleteObjectById(id) {
    if (!id) return;
    await remove(ref(db, `wedding_data/blueprint/objects/${id}`));
    if (state.selectedId === id) {
      state.selectedId = null;
      renderPropsPanel();
    }
  }

  window.deleteBpSelection = async function () {
    if (!state.selectedId) return;
    const obj = state.objects[state.selectedId];
    const label = obj?.label || (obj?.kind === "furn" ? "this piece" : obj?.kind || "this");
    const ok = await confirmModal({
      title: "Delete this?",
      message: `Remove {{name}} from the blueprint.`,
      strong: label,
      okLabel: "Delete",
    });
    if (!ok) return;
    deleteObjectById(state.selectedId);
  };
  window.clearBpSelection = function () {
    state.selectedId = null;
    renderObjects();
    renderPropsPanel();
  };

  /* ─── Properties panel ─── */
  function renderPropsPanel() {
    const panel = $("bp-props");
    const body = $("bp-props-body");
    const title = $("bp-props-title");
    if (!panel || !body) return;
    if (!state.selectedId) { panel.classList.add("hidden"); return; }
    const obj = state.objects[state.selectedId];
    if (!obj) { panel.classList.add("hidden"); return; }
    panel.classList.remove("hidden");

    const room = currentRoom();
    const cs = room ? (room.cellSize || 20) : 20;

    if (obj.kind === "furn") {
      title.textContent = obj.label || "Item";
      body.innerHTML = `
        <div class="form-field">
          <label class="form-label">Label</label>
          <input type="text" class="edit-input" value="${escapeHtml(obj.label || "")}" onchange="window.updateBpObj('${obj.id}', 'label', this.value)" />
        </div>
        <div class="form-row">
          <div class="form-field flex-1">
            <label class="form-label">Width (cm)</label>
            <input type="number" class="edit-input" value="${obj.w * cs}" step="${cs}" min="${cs}" onchange="window.updateBpObjDim('${obj.id}', 'w', this.value, ${cs})" />
          </div>
          <div class="form-field flex-1">
            <label class="form-label">Height (cm)</label>
            <input type="number" class="edit-input" value="${obj.h * cs}" step="${cs}" min="${cs}" onchange="window.updateBpObjDim('${obj.id}', 'h', this.value, ${cs})" />
          </div>
        </div>
        <div class="form-field">
          <label class="form-label">Rotation</label>
          <div class="status-toggle">
            ${[0,90,180,270].map((r) =>
              `<button type="button" class="st-opt ${(obj.rotation||0)===r ? "is-active" : ""}" onclick="window.updateBpObj('${obj.id}', 'rotation', ${r})">${r}°</button>`
            ).join("")}
          </div>
        </div>
        <div class="form-field">
          <label class="form-label">Category</label>
          <div class="status-toggle" style="flex-wrap:wrap">
            ${["living","bedroom","kitchen","bath","office","appliance"].map((c) =>
              `<button type="button" class="st-opt ${(obj.category||"living")===c ? "is-active" : ""}" onclick="window.updateBpObj('${obj.id}', 'category', '${c}')">${c}</button>`
            ).join("")}
          </div>
        </div>
      `;
    } else if (obj.kind === "wall" || obj.kind === "door" || obj.kind === "window") {
      const dx = Math.abs(obj.x2 - obj.x1);
      const dy = Math.abs(obj.y2 - obj.y1);
      const lenCells = Math.max(dx, dy);
      title.textContent = (obj.kind.charAt(0).toUpperCase() + obj.kind.slice(1));
      body.innerHTML = `
        <div class="form-field">
          <label class="form-label">Length</label>
          <div style="font-size:14px;font-weight:700;color:#fafaf9">${lenCells * cs} cm · ${lenCells} cells</div>
        </div>
        <div class="form-field">
          <label class="form-label">Change type</label>
          <div class="status-toggle">
            ${["wall","door","window"].map((k) =>
              `<button type="button" class="st-opt ${obj.kind===k ? "is-active" : ""}" onclick="window.updateBpObj('${obj.id}', 'kind', '${k}')">${k}</button>`
            ).join("")}
          </div>
        </div>
      `;
    }
  }

  window.updateBpObj = function (id, field, value) {
    update(ref(db, `wedding_data/blueprint/objects/${id}`), { [field]: value });
  };
  window.updateBpObjDim = function (id, field, cmValue, cellSize) {
    const cells = Math.max(1, Math.round(Number(cmValue) / cellSize));
    update(ref(db, `wedding_data/blueprint/objects/${id}`), { [field]: cells });
  };

  /* ─── View controls ─── */
  window.bpZoom = function (dir) {
    const step = 0.15;
    state.zoom = Math.max(0.3, Math.min(4, state.zoom * (1 + step * dir)));
    updateViewBox();
  };
  window.bpResetView = function () {
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    updateViewBox();
  };
  window.bpToggleGrid = function () {
    state.showGrid = !state.showGrid;
    $("bp-toggle-grid").classList.toggle("is-active", state.showGrid);
    $("bp-grid-rect").style.display = state.showGrid ? "" : "none";
    $("bp-grid-major-rect").style.display = state.showGrid ? "" : "none";
  };
  window.bpToggleRuler = function () {
    state.showRuler = !state.showRuler;
    $("bp-toggle-ruler").classList.toggle("is-active", state.showRuler);
    renderRulers();
  };
  window.toggleBpPalette = function () {
    $("bp-palette").classList.toggle("is-open");
  };

  /* ─── SVG-level pointer + wheel ─── */
  svg.addEventListener("pointerdown", onSvgPointerDown);
  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    window.bpZoom(e.deltaY > 0 ? -1 : 1);
  }, { passive: false });

  // Track hover to show preview during wall drawing
  svg.addEventListener("pointermove", (e) => {
    if (!state.isDrawingLine) return;
    const pt = getSVGPoint(e);
    const node = pointToGridNode(pt);
    const aligned = axisAlign(state.drawStart, node);
    drawPreview(aligned, state.tool);
  });

  // Pinch zoom (two-finger)
  let pinchStartDist = null;
  let pinchStartZoom = 1;
  svg.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
      pinchStartDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchStartZoom = state.zoom;
    }
  }, { passive: true });
  svg.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2 && pinchStartDist != null) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      state.zoom = Math.max(0.3, Math.min(4, pinchStartZoom * (d / pinchStartDist)));
      updateViewBox();
    }
  }, { passive: true });
  svg.addEventListener("touchend", () => { pinchStartDist = null; });

  // Recompute viewBox on resize
  window.addEventListener("resize", () => {
    updateViewBox();
    if (state.viewMode === "3d" && three.renderer) resize3D();
  });

  /* ─── 3D View ─── */
  window.setBpView = async function (mode) {
    state.viewMode = mode;
    document.querySelectorAll(".bp-view-btn").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.view === mode)
    );
    const overlay = $("bp-overlay");
    const canvas3d = $("bp-3d");
    if (mode === "3d") {
      overlay.classList.add("is-3d");
      canvas3d.classList.remove("hidden");
      showHint("");
      // Clear selection (3D is view-only for now)
      state.selectedId = null;
      renderObjects();
      renderPropsPanel();
      await ensureThreeLoaded();
      init3D();
      rebuild3D();
      start3DLoop();
    } else {
      overlay.classList.remove("is-3d");
      canvas3d.classList.add("hidden");
      stop3DLoop();
      showHint(toolHint(state.tool));
    }
  };

  async function ensureThreeLoaded() {
    if (three.loaded) return;
    if (three.loading) return three.loading;
    three.loading = (async () => {
      const THREE = await import("https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js");
      const { OrbitControls } = await import("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js");
      three.THREE = THREE;
      three.OrbitControls = OrbitControls;
      three.loaded = true;
    })();
    return three.loading;
  }

  function init3D() {
    if (three.scene) return; // already initialized
    const THREE = three.THREE;
    const container = $("bp-3d");
    container.innerHTML = "";
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(48, w / h, 1, 20000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace || renderer.outputColorSpace;
    container.appendChild(renderer.domElement);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambient);
    const hemi = new THREE.HemisphereLight(0xc7d2fe, 0x1e293b, 0.55);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d6, 0.9);
    sun.position.set(400, 900, 500);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 3000;
    sun.shadow.camera.left = -800;
    sun.shadow.camera.right = 800;
    sun.shadow.camera.top = 800;
    sun.shadow.camera.bottom = -800;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    // Controls
    const controls = new three.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.minDistance = 80;
    controls.maxDistance = 4000;

    // Dynamic group (cleared on each rebuild)
    const dynamicGroup = new THREE.Group();
    scene.add(dynamicGroup);

    three.scene = scene;
    three.camera = camera;
    three.renderer = renderer;
    three.controls = controls;
    three.dynamicGroup = dynamicGroup;

    // Size watcher
    if (three.resizeObserver) three.resizeObserver.disconnect();
    three.resizeObserver = new ResizeObserver(() => resize3D());
    three.resizeObserver.observe(container);
  }

  function resize3D() {
    if (!three.renderer || !three.camera) return;
    const container = $("bp-3d");
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    three.renderer.setSize(w, h, false);
    three.camera.aspect = w / h;
    three.camera.updateProjectionMatrix();
  }

  function dispose3DContent() {
    const { dynamicGroup } = three;
    if (!dynamicGroup) return;
    while (dynamicGroup.children.length) {
      const child = dynamicGroup.children.pop();
      disposeObject3D(child);
    }
    three.disposables.forEach((d) => { try { d.dispose && d.dispose(); } catch {} });
    three.disposables = [];
  }
  function disposeObject3D(obj) {
    obj.traverse && obj.traverse((n) => {
      if (n.geometry) n.geometry.dispose?.();
      if (n.material) {
        if (Array.isArray(n.material)) n.material.forEach((m) => m.dispose?.());
        else n.material.dispose?.();
      }
      if (n.material?.map) n.material.map.dispose?.();
    });
  }

  function rebuild3D() {
    if (!three.scene) return;
    const THREE = three.THREE;
    const room = currentRoom();
    dispose3DContent();
    if (!room) return;

    const cellCm = room.cellSize || 20;
    const roomW = room.cols * cellCm; // in cm
    const roomD = room.rows * cellCm;
    const WALL_H = 260;
    const WALL_T = 12;

    // Floor
    {
      const geo = new THREE.PlaneGeometry(roomW, roomD);
      const mat = new THREE.MeshStandardMaterial({ color: 0x16182a, roughness: 0.95, metalness: 0.02 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(roomW / 2, 0, roomD / 2);
      mesh.receiveShadow = true;
      three.dynamicGroup.add(mesh);
    }

    // Grid lines on the floor
    {
      const divisionsX = room.cols;
      const divisionsZ = room.rows;
      const grid = new THREE.GridHelper(Math.max(roomW, roomD), Math.max(divisionsX, divisionsZ), 0x3b3f5a, 0x252844);
      grid.position.set(roomW / 2, 0.2, roomD / 2);
      const mat = grid.material;
      if (Array.isArray(mat)) mat.forEach((m) => { m.transparent = true; m.opacity = 0.35; });
      else { mat.transparent = true; mat.opacity = 0.35; }
      three.dynamicGroup.add(grid);
    }

    // Room floor outline (faint)
    {
      const pts = [
        new THREE.Vector3(0, 0.5, 0),
        new THREE.Vector3(roomW, 0.5, 0),
        new THREE.Vector3(roomW, 0.5, roomD),
        new THREE.Vector3(0, 0.5, roomD),
        new THREE.Vector3(0, 0.5, 0),
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.5 });
      const line = new THREE.Line(geo, mat);
      three.dynamicGroup.add(line);
    }

    // Walls / doors / windows
    const objs = currentRoomObjects();
    objs.forEach((o) => {
      if (o.kind === "wall" || o.kind === "door" || o.kind === "window") {
        addWallLike3D(o, cellCm, WALL_H, WALL_T);
      } else if (o.kind === "furn") {
        addFurniture3D(o, cellCm);
      }
    });

    // Fit camera if this is first build
    fit3DCamera(roomW, roomD);
  }

  function addWallLike3D(o, cellCm, H, T) {
    const THREE = three.THREE;
    const x1 = o.x1 * cellCm, y1 = o.y1 * cellCm;
    const x2 = o.x2 * cellCm, y2 = o.y2 * cellCm;
    const lenX = Math.abs(x2 - x1);
    const lenZ = Math.abs(y2 - y1);
    const isH = y1 === y2;
    const length = Math.max(lenX, lenZ);
    if (length === 0) return;

    const width = isH ? length : T;
    const depth = isH ? T : length;
    const cx = (x1 + x2) / 2;
    const cz = (y1 + y2) / 2;

    let height = H;
    let yOffset = 0;
    let color = 0xcbd5e1;
    let opacity = 1;
    let emissive = 0x000000;
    if (o.kind === "door") {
      height = H * 0.78;
      color = 0xfbbf24;
      opacity = 0.6;
    } else if (o.kind === "window") {
      height = H * 0.42;
      yOffset = H * 0.38;
      color = 0x7dd3fc;
      opacity = 0.55;
      emissive = 0x0ea5e9;
    }

    const geo = new THREE.BoxGeometry(width, height, depth);
    const mat = new THREE.MeshStandardMaterial({
      color, transparent: opacity < 1, opacity,
      roughness: o.kind === "window" ? 0.15 : 0.85,
      metalness: o.kind === "window" ? 0.2 : 0.05,
      emissive,
      emissiveIntensity: o.kind === "window" ? 0.25 : 0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, yOffset + height / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    three.dynamicGroup.add(mesh);
  }

  function furnitureHeightCm(obj) {
    // Try to match against library keys by label
    const entry = FURNITURE_LIBRARY.find((f) => f.label === obj.label);
    if (entry && FURNITURE_HEIGHTS[entry.key]) return FURNITURE_HEIGHTS[entry.key];
    if (FURNITURE_HEIGHTS[obj.key]) return FURNITURE_HEIGHTS[obj.key];
    return HEIGHT_BY_CATEGORY[obj.category || "living"] || 90;
  }
  const FURN_COLORS = {
    living: 0xfbbf24,
    bedroom: 0xfda4af,
    kitchen: 0x6ee7b7,
    bath: 0x7dd3fc,
    office: 0xc4b5fd,
    appliance: 0xfb923c,
  };

  function addFurniture3D(o, cellCm) {
    const THREE = three.THREE;
    const w = o.w * cellCm;
    const d = o.h * cellCm;
    const height = furnitureHeightCm(o);
    const color = FURN_COLORS[o.category] || FURN_COLORS.living;

    const geo = new THREE.BoxGeometry(w, height, d);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.6,
      metalness: 0.08,
      transparent: true,
      opacity: 0.94,
    });
    const box = new THREE.Mesh(geo, mat);

    // Rotation around Y based on obj.rotation (degrees)
    const rot = ((o.rotation || 0) * Math.PI) / 180;

    const group = new THREE.Group();
    group.add(box);

    // Label via canvas texture on top
    const labelTex = makeLabelTexture(o.label || "Thing", Math.min(400, Math.max(120, w)));
    const labelMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, depthWrite: false });
    const labelGeo = new THREE.PlaneGeometry(Math.min(w, 160), Math.min(w, 160) * 0.35);
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.rotation.x = -Math.PI / 2;
    label.position.y = height + 1;
    group.add(label);

    // Edge highlight (thin outline)
    const edges = new THREE.EdgesGeometry(geo);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 });
    const wire = new THREE.LineSegments(edges, edgeMat);
    group.add(wire);

    // Position center
    const cx = (o.x + o.w / 2) * cellCm;
    const cz = (o.y + o.h / 2) * cellCm;
    group.position.set(cx, height / 2, cz);
    group.rotation.y = rot;

    box.castShadow = true;
    box.receiveShadow = true;
    three.disposables.push(labelTex);
    three.dynamicGroup.add(group);
  }

  function makeLabelTexture(text, widthPx) {
    const THREE = three.THREE;
    const canvas = document.createElement("canvas");
    const w = Math.max(256, Math.min(512, widthPx));
    const h = Math.round(w * 0.35);
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(10, 11, 20, 0.78)";
    const pad = 10;
    roundRect(ctx, 0, 0, w, h, 18);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#fafaf9";
    ctx.font = `700 ${Math.round(h * 0.48)}px Quicksand, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function fit3DCamera(roomW, roomD) {
    if (!three.camera || !three.controls) return;
    const target = new three.THREE.Vector3(roomW / 2, 80, roomD / 2);
    const dist = Math.max(roomW, roomD) * 1.15 + 300;
    three.camera.position.set(roomW * 0.85 + 100, dist * 0.75, roomD * 1.3);
    three.controls.target.copy(target);
    three.controls.update();
  }

  function start3DLoop() {
    if (three.raf) return;
    const tick = () => {
      if (!three.renderer) return;
      three.controls.update();
      three.renderer.render(three.scene, three.camera);
      three.raf = requestAnimationFrame(tick);
    };
    three.raf = requestAnimationFrame(tick);
  }
  function stop3DLoop() {
    if (three.raf) cancelAnimationFrame(three.raf);
    three.raf = null;
  }

  /* ─── Utility ─── */
  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function showHint(text) {
    const el = $("bp-hint");
    if (!el) return;
    if (!text) {
      el.classList.remove("is-visible");
      return;
    }
    el.textContent = text;
    el.classList.add("is-visible");
  }
}
