// ══════════════════════════════════════════════════════════════
// FOOD FARM — app.js  (isometric voxel)
// ══════════════════════════════════════════════════════════════

// ── GRID CONSTANTS ────────────────────────────────────────────
const FARM = {
  W: 390, H: 380,       // SVG viewBox — same width as mobile so scale=1 horizontally
  COLS: 10, ROWS: 7,    // main farm grid (fenced)
  HW: 22, HH: 11,       // tile half-width / half-height  (2:1 isometric)
  EDGE: 4,              // visible side-face depth on floor tiles
  OX: 162, OY: 120,     // SVG coord of tile(0,0) center
  EXT: 4,               // ambient tiles drawn beyond the fence each direction
  WALK: { c0: 1.5, c1: 7.5, r0: 1.5, r1: 5.2 },
};

// ── COORDINATE HELPERS ────────────────────────────────────────

function gToS(col, row) {
  return {
    x: FARM.OX + (col - row) * FARM.HW,
    y: FARM.OY + (col + row) * FARM.HH,
  };
}

// Floor tile — top face diamond + thin left/right side edges
function drawTile(col, row, topC, edgeL, edgeR) {
  const { x, y } = gToS(col, row);
  const { HW: hw, HH: hh, EDGE: e } = FARM;
  return (
    `<polygon points="${x-hw},${y} ${x},${y+hh} ${x},${y+hh+e} ${x-hw},${y+e}" fill="${edgeL}"/>` +
    `<polygon points="${x+hw},${y} ${x},${y+hh} ${x},${y+hh+e} ${x+hw},${y+e}" fill="${edgeR}"/>` +
    `<polygon points="${x},${y-hh} ${x+hw},${y} ${x},${y+hh} ${x-hw},${y}" fill="${topC}"/>`
  );
}

// Isometric cube sitting on a tile (H = visual height above the tile)
function drawCube(col, row, H, topC, leftC, rightC) {
  const { x, y } = gToS(col, row);
  const { HW: hw, HH: hh } = FARM;
  const top   = `${x},${y-hh-H} ${x+hw},${y-H} ${x},${y+hh-H} ${x-hw},${y-H}`;
  const left  = `${x-hw},${y-H} ${x},${y+hh-H} ${x},${y+hh} ${x-hw},${y}`;
  const right = `${x+hw},${y-H} ${x},${y+hh-H} ${x},${y+hh} ${x+hw},${y}`;
  return (
    `<polygon points="${left}"  fill="${leftC}"/>` +
    `<polygon points="${right}" fill="${rightC}"/>` +
    `<polygon points="${top}"   fill="${topC}"/>`
  );
}

// Thin fence rail bar connecting two tile centers at height H
function drawRail(c1, r1, c2, r2, H, thick, color) {
  const a = gToS(c1, r1), b = gToS(c2, r2);
  const ay = a.y - H, by = b.y - H;
  return `<polygon points="${a.x},${ay} ${b.x},${by} ${b.x},${by+thick} ${a.x},${ay+thick}" fill="${color}" opacity="0.92"/>`;
}

// ── FARM SVG ──────────────────────────────────────────────────

function buildFarmSVG() {
  const { W, H, COLS, ROWS, HW, HH, EXT } = FARM;

  const BARN = new Set(['8,0','9,0','8,1','9,1']);
  const POND = new Set(['0,4','0,5','0,6','1,5','1,6']);
  const PATH = new Set(['4,2','5,2','4,3','5,3','4,4','5,4']);
  const PERIM = new Set();
  for (let c = 0; c < COLS; c++) {
    PERIM.add(`${c},0`); PERIM.add(`${c},${ROWS-1}`);
  }
  for (let r = 1; r < ROWS - 1; r++) {
    PERIM.add(`0,${r}`); PERIM.add(`${COLS-1},${r}`);
  }

  const G = [
    `<svg id="farm-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"`,
    ` preserveAspectRatio="xMidYMid slice"`,
    ` style="position:absolute;inset:0;width:100%;height:100%;">`,
    `<defs>`,
    `<linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0%" stop-color="#b8d898"/>`,
    `<stop offset="40%" stop-color="#c4e0a4"/>`,
    `<stop offset="100%" stop-color="#a8cc88"/>`,
    `</linearGradient>`,
    `<radialGradient id="vigG" cx="50%" cy="50%" r="70%">`,
    `<stop offset="0%" stop-color="transparent"/>`,
    `<stop offset="100%" stop-color="rgba(20,50,10,0.22)"/>`,
    `</radialGradient>`,
    `</defs>`,
    `<rect width="${W}" height="${H}" fill="url(#skyG)"/>`,
  ].join('');

  const parts = [G];

  // Draw tiles back→front using painter's algorithm (sort by col+row sum)
  // Extended range covers EXT tiles beyond the fence in all directions
  const SUM_MIN = -(EXT * 2);
  const SUM_MAX = COLS + ROWS - 2 + EXT * 2;

  for (let sum = SUM_MIN; sum <= SUM_MAX; sum++) {
    const inMainRange = sum >= 0 && sum <= COLS + ROWS - 2;
    const cMin = Math.max(-EXT, sum - ROWS - EXT + 1);
    const cMax = Math.min(COLS + EXT - 1, sum + EXT);

    for (let col = cMin; col <= cMax; col++) {
      const row = sum - col;
      if (row < -EXT || row >= ROWS + EXT) continue;

      const inMain = col >= 0 && col < COLS && row >= 0 && row < ROWS;
      const key = `${col},${row}`;

      if (!inMain) {
        // Ambient tile outside the fence — slightly wilder green
        const s = (col + row) % 2;
        parts.push(drawTile(col, row, s ? '#6ab858' : '#60ae50', '#3c7230', '#306028'));
        continue;
      }

      if (BARN.has(key)) {
        parts.push(drawTile(col, row, '#c8986a', '#8a6838', '#7a5828'));
        continue;
      }
      if (POND.has(key)) {
        const { x, y } = gToS(col, row);
        parts.push(`<polygon points="${x},${y-HH+2} ${x+HW},${y+2} ${x},${y+HH+2} ${x-HW},${y+2}" fill="#48a8cc"/>`);
        parts.push(`<ellipse cx="${x-4}" cy="${y}" rx="7" ry="2.5" fill="rgba(255,255,255,0.2)" transform="rotate(-18 ${x-4} ${y})"/>`);
        continue;
      }
      if (PATH.has(key)) {
        parts.push(drawTile(col, row, '#c8986a', '#8a6838', '#7a5828'));
        continue;
      }
      if (PERIM.has(key)) {
        const s = (col + row) % 2;
        parts.push(drawTile(col, row, s ? '#7acc68' : '#74c860', '#4a9838', '#3a8028'));
        parts.push(drawCube(col, row, 16, '#d8a870', '#a87848', '#8a6030'));
        continue;
      }
      // Standard grass
      const s = (col + row) % 2;
      parts.push(drawTile(col, row, s ? '#7ecc6a' : '#76c862', '#4a9838', '#3a8028'));
    }

    // Fence rails — only for main fence perimeter
    if (inMainRange) {
      // top row (row=0) rail: col-1 → col along row=0
      if (sum >= 1 && sum <= COLS - 1) {
        const c = sum;
        parts.push(drawRail(c-1,0, c,0, 14,3,'#c89050'));
        parts.push(drawRail(c-1,0, c,0,  8,2,'#a87030'));
      }
      // left col (col=0) rail
      if (sum >= 1 && sum <= ROWS - 1) {
        const r = sum;
        parts.push(drawRail(0,r-1, 0,r, 14,3,'#c89050'));
        parts.push(drawRail(0,r-1, 0,r,  8,2,'#a87030'));
      }
      // right col (col=COLS-1) rail
      if (sum >= COLS && sum <= COLS + ROWS - 2) {
        const r = sum - (COLS - 1);
        if (r >= 1) {
          parts.push(drawRail(COLS-1,r-1, COLS-1,r, 14,3,'#c89050'));
          parts.push(drawRail(COLS-1,r-1, COLS-1,r,  8,2,'#a87030'));
        }
      }
      // bottom row (row=ROWS-1) rail
      if (sum >= ROWS && sum <= COLS + ROWS - 2) {
        const c = sum - (ROWS - 1);
        if (c >= 1 && c < COLS) {
          parts.push(drawRail(c-1,ROWS-1, c,ROWS-1, 14,3,'#c89050'));
          parts.push(drawRail(c-1,ROWS-1, c,ROWS-1,  8,2,'#a87030'));
        }
      }
    }

    // Barn at sum=9 (covers tile area 8+1=9)
    if (sum === 9) parts.push(buildBarn());

    // Trees
    if (sum === 2)  parts.push(buildTree(1, 1, 36));
    if (sum === 13) parts.push(buildTree(8, 5, 30));
  }

  // Pond detail
  const pC = gToS(0.5, 5.2);
  parts.push(`<ellipse cx="${pC.x}" cy="${pC.y+3}" rx="8" ry="4.5" fill="#3a9030"/>`);

  // Flowers (fixed positions)
  [[2,2],[3,4],[6,1],[7,3],[2,3],[6,4],[3,1],[7,2],[5,1],[4,5],[2,5],[6,3]].forEach(([c,r]) => {
    parts.push(buildFlowerAt(c, r));
  });

  // Atmospheric vignette
  parts.push(`<rect width="${W}" height="${H}" fill="url(#vigG)" pointer-events="none"/>`);
  parts.push(`</svg>`);
  return parts.join('');
}

// ── BARN ──────────────────────────────────────────────────────

function buildBarn() {
  const bk = gToS(8,0), rt = gToS(9,0), fr = gToS(9,1), lf = gToS(8,1);
  const wH = 40, rH = 26;

  const ubk = {x:bk.x, y:bk.y-wH}, urt = {x:rt.x, y:rt.y-wH};
  const ufr = {x:fr.x, y:fr.y-wH}, ulf = {x:lf.x, y:lf.y-wH};
  const ridgeL = {x:(ubk.x+ulf.x)/2, y:(ubk.y+ulf.y)/2 - rH};
  const ridgeR = {x:(urt.x+ufr.x)/2, y:(urt.y+ufr.y)/2 - rH};

  const p = pts => pts.map(q => `${Math.round(q.x)},${Math.round(q.y)}`).join(' ');

  return [
    // Walls
    `<polygon points="${p([ulf,ufr,fr,lf])}" fill="#a01818"/>`,
    `<polygon points="${p([ufr,urt,rt,fr])}" fill="#881010"/>`,
    `<polygon points="${p([ubk,urt,ufr,ulf])}" fill="#c02020"/>`,
    // Roof slopes
    `<polygon points="${p([ridgeL,ridgeR,ufr,ulf])}" fill="#c82828"/>`,
    `<polygon points="${p([ridgeL,ridgeR,urt,ubk])}" fill="#d83030"/>`,
    // Gable ends
    `<polygon points="${p([ulf,ubk,ridgeL])}" fill="#b01818"/>`,
    `<polygon points="${p([urt,ufr,ridgeR])}" fill="#981010"/>`,
    // Door
    `<polygon points="${Math.round(ulf.x+7)},${Math.round(ulf.y+15)} ${Math.round(ulf.x+14)},${Math.round(ulf.y+18.5)} ${Math.round(ulf.x+14)},${Math.round(ulf.y+wH)} ${Math.round(ulf.x+7)},${Math.round(ulf.y+wH-3.5)}" fill="#4a1808"/>`,
    `<line x1="${Math.round(ulf.x+10.5)}" y1="${Math.round(ulf.y+15)}" x2="${Math.round(ulf.x+10.5)}" y2="${Math.round(ulf.y+wH)}" stroke="#381008" stroke-width="1"/>`,
    `<line x1="${Math.round(ulf.x+7)}" y1="${Math.round(ulf.y+25)}" x2="${Math.round(ulf.x+14)}" y2="${Math.round(ulf.y+28.5)}" stroke="#381008" stroke-width="1"/>`,
    // Window
    `<polygon points="${Math.round(ulf.x+17)},${Math.round(ulf.y+9)} ${Math.round(ulf.x+24)},${Math.round(ulf.y+12.5)} ${Math.round(ulf.x+24)},${Math.round(ulf.y+20.5)} ${Math.round(ulf.x+17)},${Math.round(ulf.y+17)}" fill="#f8e880"/>`,
    `<line x1="${Math.round(ulf.x+20.5)}" y1="${Math.round(ulf.y+9)}" x2="${Math.round(ulf.x+20.5)}" y2="${Math.round(ulf.y+20.5)}" stroke="#9a7020" stroke-width="1"/>`,
    `<line x1="${Math.round(ulf.x+17)}" y1="${Math.round(ulf.y+14.5)}" x2="${Math.round(ulf.x+24)}" y2="${Math.round(ulf.y+18)}" stroke="#9a7020" stroke-width="1"/>`,
  ].join('\n');
}

// ── TREE ──────────────────────────────────────────────────────

function buildTree(col, row, trunkH) {
  const { x, y } = gToS(col, row);
  const { HW: hw, HH: hh } = FARM;
  const lw = hw * 1.35, lhh = hh * 1.35, ly = y - trunkH;
  return [
    // Trunk
    `<polygon points="${x-4},${ly} ${x+4},${ly} ${x+4},${ly+trunkH} ${x-4},${ly+trunkH}" fill="#7a5030"/>`,
    // Layer 3 (bottom, widest)
    `<polygon points="${x-lw},${ly+lhh*0.4} ${x},${ly+lhh*1.4} ${x},${ly+lhh*1.4+4} ${x-lw},${ly+lhh*0.4+4}" fill="#1e4c14"/>`,
    `<polygon points="${x+lw},${ly+lhh*0.4} ${x},${ly+lhh*1.4} ${x},${ly+lhh*1.4+4} ${x+lw},${ly+lhh*0.4+4}" fill="#245818"/>`,
    `<polygon points="${x},${ly-lhh*0.6} ${x+lw},${ly+lhh*0.4} ${x},${ly+lhh*1.4} ${x-lw},${ly+lhh*0.4}" fill="#2e6820"/>`,
    // Layer 2 (mid)
    `<polygon points="${x-lw*.8},${ly-15+lhh*.4} ${x},${ly-15+lhh*1.2} ${x},${ly-15+lhh*1.2+3} ${x-lw*.8},${ly-15+lhh*.4+3}" fill="#2c6820"/>`,
    `<polygon points="${x+lw*.8},${ly-15+lhh*.4} ${x},${ly-15+lhh*1.2} ${x},${ly-15+lhh*1.2+3} ${x+lw*.8},${ly-15+lhh*.4+3}" fill="#245818"/>`,
    `<polygon points="${x},${ly-15-lhh*.4} ${x+lw*.8},${ly-15+lhh*.4} ${x},${ly-15+lhh*1.2} ${x-lw*.8},${ly-15+lhh*.4}" fill="#388028"/>`,
    // Layer 1 (top)
    `<polygon points="${x},${ly-30-lhh*.3} ${x+lw*.5},${ly-30+lhh*.3} ${x},${ly-30+lhh*1.1} ${x-lw*.5},${ly-30+lhh*.3}" fill="#48a038"/>`,
    // Highlight
    `<ellipse cx="${x+4}" cy="${ly-30+3}" rx="4" ry="2.5" fill="#68c050" opacity="0.35"/>`,
  ].join('\n');
}

// ── FLOWER ────────────────────────────────────────────────────

function buildFlowerAt(col, row) {
  const { x, y } = gToS(col, row);
  const colors = ['#e82858','#f0a020','#9018c0','#e03870','#2898d8','#e83060'];
  const ci = Math.abs(Math.sin(col * 7 + row * 13));
  const c  = colors[Math.floor(ci * colors.length)];
  const s  = 0.7 + Math.abs(Math.sin(col * 5 + row * 11)) * 0.45;
  const ox = ((Math.sin(col * 3 + row) * 8) | 0);
  const oy = ((Math.sin(col + row * 4) * 5) | 0);
  const cx = x + ox, cy = y + oy;
  return (
    `<line x1="${cx}" y1="${cy+8*s}" x2="${cx}" y2="${cy+2}" stroke="#3a8828" stroke-width="1.5"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${4.5*s}" fill="${c}" opacity="0.9"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${2*s}" fill="#f8e840"/>`
  );
}

// ── ANIMAL TYPES ──────────────────────────────────────────────

const TYPES = {
  chicken: { label: 'Chicken', emoji: '🐔', w: 44, h: 44, isPlant: false },
  pork:    { label: 'Pork',    emoji: '🐷', w: 46, h: 44, isPlant: false },
  beef:    { label: 'Beef',    emoji: '🐄', w: 54, h: 44, isPlant: false },
  fish:    { label: 'Fish',    emoji: '🐟', w: 44, h: 30, isPlant: false },
  rice:    { label: 'Rice',    emoji: '🌾', w: 34, h: 40, isPlant: true  },
  veggie:  { label: 'Veggie',  emoji: '🥦', w: 28, h: 40, isPlant: true  },
};

// ── STATE ─────────────────────────────────────────────────────

let state = { weekKey: '', animals: [] };
let saveDebounce = null;

// ── COORDINATE CONVERSION ─────────────────────────────────────

function gridToScreen(col, row) {
  const svgX = FARM.OX + (col - row) * FARM.HW;
  const svgY = FARM.OY + (col + row) * FARM.HH;
  const farm = document.getElementById('farm');
  // preserveAspectRatio=slice → scale = max of both axes
  const scaleX = farm.offsetWidth  / FARM.W;
  const scaleY = farm.offsetHeight / FARM.H;
  const scale  = Math.max(scaleX, scaleY);
  const offX   = (farm.offsetWidth  - FARM.W * scale) / 2;
  const offY   = (farm.offsetHeight - FARM.H * scale) / 2;
  return { x: svgX * scale + offX, y: svgY * scale + offY };
}

// ── INIT ──────────────────────────────────────────────────────

function init() {
  const key = getWeekKey();
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('food-farm-' + key)); } catch(e) {}

  state = (saved && saved.weekKey === key) ? saved : { weekKey: key, animals: [] };
  if (!saved || saved.weekKey !== key) saveState();

  document.getElementById('farm').insertAdjacentHTML('afterbegin', buildFarmSVG());

  updateWeekLabel();
  state.animals.forEach(a => createAnimalEl(a, false));
  updateCount();
  renderLog();
  state.animals.forEach(a => { if (!TYPES[a.type]?.isPlant) startWanderFor(a); });

  document.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', () => spawnAnimal(btn.dataset.type));
  });
}

// ── WEEK ──────────────────────────────────────────────────────

function getWeekKey() {
  const d = new Date();
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  mon.setHours(0, 0, 0, 0);
  return mon.toISOString().slice(0, 10);
}

function updateWeekLabel() {
  const mon = new Date(state.weekKey + 'T00:00:00');
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  document.getElementById('week-label').textContent = `${fmt(mon)} – ${fmt(sun)}`;
}

// ── SPAWN ─────────────────────────────────────────────────────

function spawnAnimal(type) {
  const def = TYPES[type]; if (!def) return;
  const { c0, c1, r0, r1 } = FARM.WALK;
  const col = c0 + Math.random() * (c1 - c0);
  const row = r0 + Math.random() * (r1 - r0);
  const id  = Math.random().toString(36).slice(2, 10);
  const entry = { id, type, col, row, facingLeft: false };
  state.animals.push(entry);
  saveState();
  createAnimalEl(entry, true);
  updateCount(); renderLog();
  if (!def.isPlant) startWanderFor(entry);
}

// ── DOM ───────────────────────────────────────────────────────

function createAnimalEl(entry, animate) {
  const def = TYPES[entry.type]; if (!def) return;
  const pos = gridToScreen(entry.col, entry.row);

  const wrap = document.createElement('div');
  wrap.className = 'animal-wrap';
  wrap.dataset.type = entry.type;
  wrap.dataset.id   = entry.id;
  wrap.style.left   = Math.round(pos.x - def.w / 2) + 'px';
  wrap.style.top    = Math.round(pos.y - def.h) + 'px';
  wrap.style.zIndex = Math.round(pos.y);
  if (!animate) wrap.style.transition = 'none';

  const inner = document.createElement('div');
  inner.className = animate ? 'animal-inner is-spawning' : 'animal-inner';
  if (entry.facingLeft) inner.style.transform = 'scaleX(-1)';
  if (!animate) inner.style.animation = 'none';

  const shadow = document.createElement('div');
  shadow.className = 'iso-shadow';
  shadow.style.width = Math.round(def.w * 0.7) + 'px';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', def.w);
  svg.setAttribute('height', def.h);
  svg.classList.add('animal-svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#spr-' + entry.type);
  svg.appendChild(use);

  inner.appendChild(svg);
  wrap.appendChild(shadow);
  wrap.appendChild(inner);
  document.getElementById('farm-animals').appendChild(wrap);

  if (!animate) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      wrap.style.transition = '';
      inner.style.animation = '';
    }));
  }
}

// ── WANDER ────────────────────────────────────────────────────

function startWanderFor(entry) {
  setTimeout(() => wanderStep(entry), 500 + Math.random() * 2500);
}

function wanderStep(entry) {
  const wrap = document.querySelector(`.animal-wrap[data-id="${entry.id}"]`);
  if (!wrap) return;
  const def = TYPES[entry.type];
  const { c0, c1, r0, r1 } = FARM.WALK;

  const tc = c0 + Math.random() * (c1 - c0);
  const tr = r0 + Math.random() * (r1 - r0);
  const tPos = gridToScreen(tc, tr);
  const cPos = gridToScreen(entry.col, entry.row);
  const dist = Math.hypot(tPos.x - cPos.x, tPos.y - cPos.y);
  const speeds = { chicken: 55, pork: 38, beef: 28, fish: 62 };
  const travelMs = Math.max(800, (dist / (speeds[entry.type] || 40)) * 1000);

  const facingLeft = tPos.x < cPos.x;
  wrap.querySelector('.animal-inner').style.transform = facingLeft ? 'scaleX(-1)' : 'scaleX(1)';
  entry.facingLeft = facingLeft;

  wrap.style.transition = `left ${travelMs}ms ease-in-out, top ${travelMs}ms ease-in-out`;
  wrap.style.left   = Math.round(tPos.x - def.w / 2) + 'px';
  wrap.style.top    = Math.round(tPos.y - def.h) + 'px';
  wrap.style.zIndex = Math.round(tPos.y);
  wrap.classList.add('is-walking');

  entry.col = tc; entry.row = tr;
  saveState();

  setTimeout(() => {
    wrap.classList.remove('is-walking');
    setTimeout(() => wanderStep(entry), 1500 + Math.random() * 4000);
  }, travelMs);
}

// ── LOG / COUNT ───────────────────────────────────────────────

function renderLog() {
  const el = document.getElementById('food-log');
  if (!state.animals.length) {
    el.innerHTML = '<span class="food-tag-empty">Nothing yet this week...</span>';
    return;
  }
  const counts = {};
  state.animals.forEach(({ type }) => counts[type] = (counts[type] || 0) + 1);
  el.innerHTML = Object.entries(counts).map(([type, n]) => {
    const def = TYPES[type]; if (!def) return '';
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

document.addEventListener('DOMContentLoaded', init);
