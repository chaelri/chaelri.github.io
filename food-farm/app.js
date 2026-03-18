// ══════════════════════════════════════════════════════════════
// FOOD FARM — app.js
// ══════════════════════════════════════════════════════════════

const TYPES = {
  chicken: { label: 'Chicken', emoji: '🐔', size: 44, isPlant: false },
  pork:    { label: 'Pork',    emoji: '🐷', size: 46, isPlant: false },
  beef:    { label: 'Beef',    emoji: '🐄', size: 54, isPlant: false },
  fish:    { label: 'Fish',    emoji: '🐟', size: 42, isPlant: false },
  rice:    { label: 'Rice',    emoji: '🌾', size: 38, isPlant: true  },
  veggie:  { label: 'Veggie',  emoji: '🥦', size: 34, isPlant: true  },
};

let state = { weekKey: '', animals: [] };
let saveDebounce = null;

// ── INIT ──────────────────────────────────────────────────────

function init() {
  const key = getWeekKey();
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('food-farm-' + key)); } catch(e) {}

  if (saved && saved.weekKey === key) {
    state = saved;
  } else {
    state = { weekKey: key, animals: [] };
    saveState();
  }

  updateWeekLabel();
  buildDecorations();

  // Rehydrate saved animals (no spawn animation)
  state.animals.forEach(a => createAnimalEl(a, false));
  updateCount();
  renderLog();

  // Start wandering for mobile creatures
  state.animals.forEach(a => {
    if (!TYPES[a.type]?.isPlant) startWanderFor(a);
  });

  // Button listeners
  document.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', () => spawnAnimal(btn.dataset.type));
  });
}

// ── WEEK HELPERS ──────────────────────────────────────────────

function getWeekKey() {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

function updateWeekLabel() {
  const monday = new Date(state.weekKey + 'T00:00:00');
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  document.getElementById('week-label').textContent = `${fmt(monday)} – ${fmt(sunday)}`;
}

// ── SPAWN ─────────────────────────────────────────────────────

function spawnAnimal(type) {
  const def = TYPES[type];
  if (!def) return;

  const farm = document.getElementById('farm');
  const W = farm.offsetWidth;
  const H = farm.offsetHeight;
  const PAD = 58; // keep inside fence

  const id = Math.random().toString(36).slice(2, 10);
  const x  = PAD + Math.random() * (W - def.size - PAD * 2);
  const y  = PAD + Math.random() * (H - def.size - PAD * 2);

  const entry = { id, type, x, y, facingLeft: false };
  state.animals.push(entry);
  saveState();

  createAnimalEl(entry, true);
  updateCount();
  renderLog();

  if (!def.isPlant) startWanderFor(entry);
}

// ── DOM CREATION ──────────────────────────────────────────────

function createAnimalEl(entry, animate) {
  const def = TYPES[entry.type];
  if (!def) return;

  const wrap = document.createElement('div');
  wrap.className = 'animal-wrap';
  wrap.dataset.type = entry.type;
  wrap.dataset.id   = entry.id;
  wrap.style.left   = Math.round(entry.x) + 'px';
  wrap.style.top    = Math.round(entry.y) + 'px';
  wrap.style.zIndex = 10 + Math.round(entry.y);
  if (!animate) wrap.style.transition = 'none';

  const inner = document.createElement('div');
  inner.className = animate ? 'animal-inner is-spawning' : 'animal-inner';
  if (entry.facingLeft) inner.style.transform = 'scaleX(-1)';
  if (!animate) inner.style.animation = 'none';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width',  def.size);
  svg.setAttribute('height', def.size);
  svg.classList.add('animal-svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#spr-' + entry.type);
  svg.appendChild(use);

  const shadow = document.createElement('div');
  shadow.className = 'animal-shadow';
  shadow.style.width = Math.round(def.size * 0.72) + 'px';

  inner.appendChild(svg);
  wrap.appendChild(inner);
  wrap.appendChild(shadow);
  document.getElementById('farm-animals').appendChild(wrap);

  // Re-enable transitions after first paint (prevents jump on load)
  if (!animate) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      wrap.style.transition = '';
      inner.style.animation = '';
    }));
  }
}

// ── WANDERING ─────────────────────────────────────────────────

function startWanderFor(entry) {
  // Stagger start so they don't all move at once
  setTimeout(() => wanderStep(entry), 500 + Math.random() * 3000);
}

function wanderStep(entry) {
  const wrap = document.querySelector(`.animal-wrap[data-id="${entry.id}"]`);
  if (!wrap) return; // removed from DOM

  const farm = document.getElementById('farm');
  const def  = TYPES[entry.type];
  const PAD  = 58;
  const W    = farm.offsetWidth;
  const H    = farm.offsetHeight;

  const tx = PAD + Math.random() * (W - def.size - PAD * 2);
  const ty = PAD + Math.random() * (H - def.size - PAD * 2);

  const dx = tx - entry.x;
  const dy = ty - entry.y;
  const dist = Math.hypot(dx, dy);

  // Speed varies per animal type
  const speeds = { chicken: 55, pork: 38, beef: 30, fish: 65 };
  const baseSpeed = speeds[entry.type] || 40;
  const speed = baseSpeed + Math.random() * 20;
  const travelMs = Math.max(700, (dist / speed) * 1000);

  // Flip sprite based on horizontal direction
  const facingLeft = dx < 0;
  const inner = wrap.querySelector('.animal-inner');
  inner.style.transform = facingLeft ? 'scaleX(-1)' : 'scaleX(1)';
  entry.facingLeft = facingLeft;

  // Animate position
  wrap.style.transition = `left ${travelMs}ms ease-in-out, top ${travelMs}ms ease-in-out`;
  wrap.style.left   = Math.round(tx) + 'px';
  wrap.style.top    = Math.round(ty) + 'px';
  wrap.style.zIndex = 10 + Math.round(ty);
  wrap.classList.add('is-walking');

  // Persist new position
  entry.x = tx;
  entry.y = ty;
  saveState();

  setTimeout(() => {
    wrap.classList.remove('is-walking');
    const idleMs = 1500 + Math.random() * 4500;
    setTimeout(() => wanderStep(entry), idleMs);
  }, travelMs);
}

// ── LOG ───────────────────────────────────────────────────────

function renderLog() {
  const container = document.getElementById('food-log');
  if (state.animals.length === 0) {
    container.innerHTML = '<span class="food-tag-empty">Nothing yet this week...</span>';
    return;
  }
  const counts = {};
  state.animals.forEach(({ type }) => {
    counts[type] = (counts[type] || 0) + 1;
  });
  container.innerHTML = Object.entries(counts).map(([type, n]) => {
    const def = TYPES[type];
    if (!def) return '';
    return `<span class="food-tag" data-type="${type}">${def.emoji} ${def.label}${n > 1 ? ' ×' + n : ''}</span>`;
  }).join('');
}

function updateCount() {
  const n = state.animals.length;
  document.getElementById('animal-count').textContent =
    n === 0 ? 'empty farm' : n === 1 ? '1 friend' : `${n} friends`;
}

// ── PERSISTENCE ───────────────────────────────────────────────

function saveState() {
  clearTimeout(saveDebounce);
  saveDebounce = setTimeout(() => {
    localStorage.setItem('food-farm-' + state.weekKey, JSON.stringify(state));
  }, 250);
}

// ── DECORATIONS ───────────────────────────────────────────────

function buildDecorations() {
  const layer = document.getElementById('farm-deco');
  const farm  = document.getElementById('farm');

  requestAnimationFrame(() => {
    const W = farm.offsetWidth;
    const H = farm.offsetHeight;

    // Barn — top right corner
    layer.innerHTML += barnSVG(W - 90, 18);

    // Trees — corners (avoid barn)
    layer.innerHTML += treeSVG(16, 16);
    layer.innerHTML += treeSVG(16, H - 82);
    layer.innerHTML += treeSVG(W - 65, H - 85);

    // Dirt path — diagonal strip through center
    const path = document.createElement('div');
    path.className = 'deco';
    path.style.cssText = `
      left: 50%; top: 50%;
      transform: translate(-50%,-50%) rotate(-22deg);
      width: 26px; height: ${H * 0.75}px;
      background: rgba(156,100,48,0.2);
      border-radius: 20px;
    `;
    layer.appendChild(path);

    // Pond — bottom left
    layer.innerHTML += pondSVG(20, H - 75);

    // Flowers — scattered
    const flowerCount = 12 + Math.floor(Math.random() * 6);
    for (let i = 0; i < flowerCount; i++) {
      const fx = 55 + Math.random() * (W - 110);
      const fy = 55 + Math.random() * (H - 110);
      layer.innerHTML += flowerSVG(fx, fy);
    }

    // Rocks
    for (let i = 0; i < 4; i++) {
      const rx = 60 + Math.random() * (W - 120);
      const ry = 60 + Math.random() * (H - 120);
      layer.innerHTML += rockSVG(rx, ry);
    }
  });
}

// ── DECORATION SVGs ───────────────────────────────────────────

function barnSVG(x, y) {
  return `<svg class="deco" style="left:${x}px;top:${y}px;width:72px;height:82px;" viewBox="0 0 72 82" xmlns="http://www.w3.org/2000/svg">
    <!-- Roof shadow -->
    <polygon points="0,36 36,2 72,36" fill="#7a1818"/>
    <!-- Roof -->
    <polygon points="4,36 36,7 68,36" fill="#b02020"/>
    <!-- Roof highlight -->
    <polygon points="8,36 36,12 64,36" fill="#c42828" opacity="0.7"/>
    <!-- Body -->
    <rect x="6" y="34" width="60" height="48" fill="#c42828"/>
    <!-- Body shading -->
    <rect x="6" y="34" width="8" height="48" fill="rgba(0,0,0,0.12)"/>
    <rect x="58" y="34" width="8" height="48" fill="rgba(0,0,0,0.08)"/>
    <!-- Door -->
    <rect x="23" y="52" width="26" height="30" rx="13" fill="#4a1e0a"/>
    <line x1="36" y1="52" x2="36" y2="82" stroke="#3a1606" stroke-width="1.5"/>
    <line x1="23" y1="64" x2="49" y2="64" stroke="#3a1606" stroke-width="1.5"/>
    <!-- Left window -->
    <rect x="10" y="40" width="14" height="11" rx="3" fill="#f8e890"/>
    <line x1="17" y1="40" x2="17" y2="51" stroke="#7a4820" stroke-width="1.5"/>
    <line x1="10" y1="45.5" x2="24" y2="45.5" stroke="#7a4820" stroke-width="1.5"/>
    <!-- Right window -->
    <rect x="48" y="40" width="14" height="11" rx="3" fill="#f8e890"/>
    <line x1="55" y1="40" x2="55" y2="51" stroke="#7a4820" stroke-width="1.5"/>
    <line x1="48" y1="45.5" x2="62" y2="45.5" stroke="#7a4820" stroke-width="1.5"/>
  </svg>`;
}

function treeSVG(x, y) {
  return `<svg class="deco" style="left:${x}px;top:${y}px;width:54px;height:70px;" viewBox="0 0 54 70" xmlns="http://www.w3.org/2000/svg">
    <!-- Trunk -->
    <rect x="21" y="45" width="12" height="25" rx="4" fill="#7a5030"/>
    <rect x="24" y="45" width="5"  height="25" rx="2.5" fill="#8a6040" opacity="0.45"/>
    <!-- Canopy layers (dark to light, bottom to top) -->
    <ellipse cx="27" cy="42" rx="22" ry="17" fill="#266020"/>
    <ellipse cx="27" cy="36" rx="19" ry="15" fill="#307a28"/>
    <ellipse cx="27" cy="29" rx="16" ry="13" fill="#3a9038"/>
    <ellipse cx="27" cy="22" rx="12" ry="11" fill="#46a044"/>
    <!-- Highlight -->
    <ellipse cx="31" cy="24" rx="5" ry="4" fill="#68c860" opacity="0.45"/>
  </svg>`;
}

function pondSVG(x, y) {
  return `<svg class="deco" style="left:${x}px;top:${y}px;width:58px;height:38px;" viewBox="0 0 58 38" xmlns="http://www.w3.org/2000/svg">
    <!-- Pond shadow/edge -->
    <ellipse cx="29" cy="21" rx="27" ry="16" fill="#2a6888"/>
    <!-- Pond water -->
    <ellipse cx="29" cy="20" rx="26" ry="15" fill="#4898c8"/>
    <!-- Water sheen -->
    <ellipse cx="24" cy="15" rx="10" ry="5" fill="rgba(255,255,255,0.18)" transform="rotate(-15 24 15)"/>
    <!-- Lily pad -->
    <ellipse cx="34" cy="22" rx="5" ry="3.5" fill="#3a8828"/>
    <line x1="34" y1="19" x2="36" y2="22" stroke="#3a8828" stroke-width="1.2"/>
    <!-- Small ripple lines -->
    <path d="M18 22 Q22 20 26 22" stroke="rgba(255,255,255,0.3)" stroke-width="1" fill="none"/>
    <path d="M32 27 Q36 25 40 27" stroke="rgba(255,255,255,0.3)" stroke-width="1" fill="none"/>
  </svg>`;
}

function flowerSVG(x, y) {
  const palettes = [
    ['#f02858','#f8e060'], ['#f0a030','#fff060'], ['#9820c8','#f8e060'],
    ['#e04080','#ffd060'], ['#28a8e8','#fff8a0'], ['#f83858','#ffee50'],
  ];
  const [petal, center] = palettes[Math.floor(Math.random() * palettes.length)];
  const s = 0.55 + Math.random() * 0.55;
  const rot = Math.random() * 360;
  return `<svg class="deco" style="left:${x}px;top:${y}px;width:${15*s}px;height:${19*s}px;" viewBox="0 0 15 19" xmlns="http://www.w3.org/2000/svg">
    <line x1="7.5" y1="19" x2="7.5" y2="10" stroke="#3a8028" stroke-width="1.5"/>
    <g transform="rotate(${rot}, 7.5, 8)">
      <circle cx="7.5" cy="4.5" r="2.8" fill="${petal}" opacity="0.88"/>
      <circle cx="11"  cy="8.5" r="2.8" fill="${petal}" opacity="0.88"/>
      <circle cx="4"   cy="8.5" r="2.8" fill="${petal}" opacity="0.88"/>
      <circle cx="5.5" cy="4"   r="2.2" fill="${petal}" opacity="0.75"/>
      <circle cx="9.5" cy="4"   r="2.2" fill="${petal}" opacity="0.75"/>
    </g>
    <circle cx="7.5" cy="8" r="2.2" fill="${center}"/>
  </svg>`;
}

function rockSVG(x, y) {
  const s = 0.75 + Math.random() * 0.45;
  return `<svg class="deco" style="left:${x}px;top:${y}px;width:${18*s}px;height:${13*s}px;" viewBox="0 0 18 13" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="9" cy="8"  rx="8" ry="5"   fill="#8a8878"/>
    <ellipse cx="9" cy="7"  rx="7" ry="4.5" fill="#a0a090"/>
    <ellipse cx="7" cy="5.5" rx="2.5" ry="1.8" fill="#c0c0b0" opacity="0.55"/>
  </svg>`;
}

// ── START ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
