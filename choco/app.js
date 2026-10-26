// Steamed Choco Cake — recipe read from Yummy.ph's video, drawn as 8-bit sprites.
import { mountScenes, replay } from './scenes.js';

// ---------- pixel sprites ----------
const PAL = {
  K: '#3a2216', // outline
  D: '#4a2a1b', // sponge
  C: '#5e3624', // crumb
  M: '#6b3d26', // ganache
  G: '#a86c4a', // ganache shine
  E: '#fff4e8', // eye
  B: '#ff9ec7', // blush
  r: '#ff7fae', // mouth
  P: '#ffffff', // plate
  q: '#d9cff5', // plate shade
  Y: '#ffd86b', // gold
  y: '#f2b84b',
  W: '#ffffff',
  w: '#dcd3ff', // wing / cloud shade
  e: '#fff1dc', // egg
  b: '#9ad7ff', // milk blue
  p: '#ffb8d9', // pink
  m: '#8fe0c0', // mint
  f: '#f6ead6', // flour
  F: '#e2cba6',
  V: '#a8693a', // vanilla
  S: '#d8dbe8', // steel
  s: '#aab0c9',
  g: '#c9a27a', // wood
};

const SPRITES = {
  cake: [
    '...KKKKKKKK...',
    '.KKGGMMMMMMKK.',
    'KGGMMMMMMMMMMK',
    'KMMMMMMMMMMMMK',
    'KMMDMMMDMMMDMK',
    'KDDDDDDDDDDDDK',
    'KDDDEDDDDEDDDK',
    'KDDBDDrrDDBDDK',
    'KDDDDDDDDDDDDK',
    'KDCDDDDDDDCDDK',
    '.KKKKKKKKKKKK.',
    'qPPPPPPPPPPPPq',
    '.qqqqqqqqqqqq.',
  ],
  halo: [
    '....YYYYYY....',
    '..YY......YY..',
    '....yyyyyy....',
  ],
  wing: [
    '....WW',
    '..WWWw',
    '.WWWww',
    'WWWwww',
    '.WWww.',
    '..Ww..',
  ],
  cloud: [
    '....WWWW........',
    '..WWWWWWWW.WWW..',
    '.WWWWWWWWWWWWWW.',
    'WWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWW',
    '.wwwwwwwwwwwwww.',
  ],
  star: [
    '..Y..',
    '..Y..',
    'YYWYY',
    '..Y..',
    '..Y..',
  ],
  butter: [
    '........',
    '........',
    '.KKKKKK.',
    'KYYYYYYK',
    'KYWYYYYK',
    'KYYYYYyK',
    'KyyyyyyK',
    '.KKKKKK.',
  ],
  milk: [
    '...KK...',
    '..KWWK..',
    '.KWWWWK.',
    '.KbbbbK.',
    '.KWWWWK.',
    '.KWbbWK.',
    '.KWWWWK.',
    '.KKKKKK.',
  ],
  cream: [
    '...KK...',
    '..KWWK..',
    '.KWWWWK.',
    '.KppppK.',
    '.KWWWWK.',
    '.KWppWK.',
    '.KWWWWK.',
    '.KKKKKK.',
  ],
  sugar: [
    '........',
    '...WW...',
    '..WWWW..',
    '.WWWWWW.',
    'KppppppK',
    '.KppppK.',
    '..KKKK..',
    '........',
  ],
  flour: [
    '..K..K..',
    '...KK...',
    '..KffK..',
    '.KffffK.',
    'KffFFffK',
    'KfFffFfK',
    'KffffffK',
    '.KKKKKK.',
  ],
  cocoa: [
    '..mmmm..',
    '.mmmmmm.',
    '.KKKKKK.',
    '.KMMMMK.',
    '.KMDMMK.',
    '.KMMMDK.',
    '.KMMMMK.',
    '.KKKKKK.',
  ],
  powder: [
    '..ssss..',
    '.KKKKKK.',
    '.KYYYYK.',
    '.KWWWWK.',
    '.KWyyWK.',
    '.KWWWWK.',
    '.KYYYYK.',
    '.KKKKKK.',
  ],
  salt: [
    '..KKKK..',
    '..KSSK..',
    '..KKKK..',
    '.KWWWWK.',
    '.KWWWWK.',
    '.KWWWWK.',
    '.KWWWWK.',
    '.KKKKKK.',
  ],
  egg: [
    '...ee...',
    '..eeee..',
    '.eeeeee.',
    '.eeeeee.',
    'eeeeeeee',
    'eeeeeeFe',
    '.eeeeFe.',
    '..eeee..',
  ],
  vanilla: [
    '...KK...',
    '...KK...',
    '..KVVK..',
    '.KVVVVK.',
    '.KVeeVK.',
    '.KVVVVK.',
    '.KVVVVK.',
    '..KKKK..',
  ],
  choco: [
    'KKKKKKK.',
    'KMGKMGK.',
    'KMMKMMK.',
    'KKKKKKK.',
    'KMGKMGK.',
    'KMMKMMK.',
    'KKKKKKK.',
    '........',
  ],
  pan: [
    '........',
    '..KKKK..',
    '.KYYYYK.',
    'KYyYYyYK',
    'KYYYYYYK',
    '.KKKKKK.',
    '......Kg',
    '.......g',
  ],
  whisk: [
    '..KKK...',
    '.K.K.K..',
    'K..K..K.',
    'K..K..K.',
    '.K.K.K..',
    '..KKK...',
    '...g....',
    '...g....',
  ],
  tin: [
    '........',
    '.s.s.s..',
    '........',
    'SSSSSSSS',
    'sSSSSSSs',
    '.sSsSsS.',
    '..SSSS..',
    '........',
  ],
  pot: [
    '.w..w.w.',
    '..w.w..w',
    '...KK...',
    '.KKKKKK.',
    'KSSSSSSK',
    'KSWSSSSK',
    'KSSSSSSK',
    '.KKKKKK.',
  ],
  spatula: [
    '.KKKK...',
    '.KppK...',
    '.KppK...',
    '.KKKK...',
    '...g....',
    '...g....',
    '...g....',
    '...g....',
  ],
  arR: [
    'K...',
    'KK..',
    'KKK.',
    'KKKK',
    'KKK.',
    'KK..',
    'K...',
  ],
  arL: [
    '...K',
    '..KK',
    '.KKK',
    'KKKK',
    '.KKK',
    '..KK',
    '...K',
  ],
  bag: [
    '..KKKK..',
    '.K....K.',
    'KKKKKKKK',
    'KppppppK',
    'KpWppppK',
    'KppppppK',
    'KppppppK',
    'KKKKKKKK',
  ],
};

SPRITES.cakeBlink = SPRITES.cake.map(r => r.replace(/E/g, 'D'));

function sprite(name, scale = 4, cls = '') {
  const rows = SPRITES[name];
  const h = rows.length, w = rows[0].length;
  let rects = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < w) {
      const c = row[x];
      if (c === '.') { x++; continue; }
      let end = x;
      while (end < w && row[end] === c) end++;
      rects += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${PAL[c]}"/>`;
      x = end;
    }
  });
  return `<svg class="sprite ${cls}" viewBox="0 0 ${w} ${h}" width="${w * scale}" height="${h * scale}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

function hydrateSprites(root = document) {
  root.querySelectorAll('[data-sprite]').forEach(el => {
    el.innerHTML = sprite(el.dataset.sprite, Number(el.dataset.scale) || 4);
  });
}

// ---------- storage (never required) ----------
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem('choco.' + key); return v == null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('choco.' + key, JSON.stringify(value)); } catch {}
  },
};

// ---------- recipe (read off the video's on-screen captions) ----------
// amount = list of [qty, unit] parts so "½ cup + 2 tbsp" scales cleanly
const INGREDIENTS = [
  { id: 'butter',  group: 'cake',    icon: 'butter',  name: 'butter',               amount: [[0.25, 'cup']] },
  { id: 'milk',    group: 'cake',    icon: 'milk',    name: 'fresh milk',           amount: [[0.5, 'cup'], [2, 'tbsp']] },
  { id: 'sugar',   group: 'cake',    icon: 'sugar',   name: 'sugar',                amount: [[0.5, 'cup']] },
  { id: 'flour',   group: 'cake',    icon: 'flour',   name: 'all-purpose flour',    amount: [[0.5, 'cup']] },
  { id: 'cocoa',   group: 'cake',    icon: 'cocoa',   name: 'cocoa powder',         amount: [[0.25, 'cup']] },
  { id: 'bp',      group: 'cake',    icon: 'powder',  name: 'baking powder',        amount: [[0.5, 'tsp']] },
  { id: 'salt',    group: 'cake',    icon: 'salt',    name: 'salt',                 amount: [[1, 'pinch']] },
  { id: 'egg',     group: 'cake',    icon: 'egg',     name: '',                     amount: [[1, 'large egg']] },
  { id: 'vanilla', group: 'cake',    icon: 'vanilla', name: 'vanilla',              amount: [[0.5, 'tsp']] },
  { id: 'cream',   group: 'ganache', icon: 'cream',   name: 'all-purpose cream',    amount: [[1, 'cup']], spoonNote: n => `${n === 1 ? 'one' : n} 250 ml pack${n > 1 ? 's' : ''}` },
  { id: 'choco',   group: 'ganache', icon: 'choco',   name: 'dark chocolate chunks', amount: [[1, 'cup']], spoonNote: n => `about ${170 * n} g` },
];

const STEPS = [
  { icon: 'butter', title: 'Melt the butter',
    text: 'In a saucepan over low heat, melt {butter} butter.' },
  { icon: 'milk', title: 'Milk + sugar',
    text: 'Pour in {milk} fresh milk and {sugar} sugar. Stir until the sugar dissolves, then take it off the heat.' },
  { icon: 'flour', title: 'Dry team',
    text: 'In a bowl, whisk {flour} flour, {cocoa} cocoa powder, {bp} baking powder and {salt} of salt until even.' },
  { icon: 'egg', title: 'Egg + vanilla',
    text: 'In a bigger bowl, beat {egg} with {vanilla} vanilla.' },
  { icon: 'whisk', title: 'Wet team unite',
    text: 'Slowly pour the butter-sugar mixture into the egg while whisking.' },
  { icon: 'cocoa', title: 'Make the batter',
    text: 'Add the flour-cocoa mixture and whisk until smooth, glossy and lump-free.' },
  { icon: 'tin', title: 'Tin + foil hat',
    text: 'Pour the batter into a small foil tin. Cover the top tightly with foil and crimp the edges.' },
  { icon: 'pot', title: 'Steam it', timer: true,
    text: 'Set the tin in a hot steamer, cover, and steam for 40 minutes, or until a toothpick inserted comes out clean.' },
  { icon: 'cream', title: 'Ganache time',
    text: 'Heat {cream} all-purpose cream over low heat until it just scalds. Add {choco} dark chocolate chunks and stir until silky.' },
  { icon: 'spatula', title: 'Frost + float',
    text: 'Turn the cake out onto a plate and spread the ganache over the top and sides. Swirl it. Ascend.' },
];

const TIPS = [
  { tag: 'video', text: 'The foil cover is not optional: it keeps lid drips off the batter so the top stays smooth.' },
  { tag: 'video', text: 'Toothpick test: poke the center. Clean or a few dry crumbs means done; wet batter means 5 more minutes.' },
  { tag: 'video', text: 'Scald, don\'t boil the cream: tiny bubbles at the edge, then add the chocolate.' },
  { tag: 'bonus', text: 'Let the butter-milk mixture cool a minute before it meets the egg, so the egg doesn\'t scramble.' },
  { tag: 'bonus', text: 'Wrap the steamer lid in a kitchen towel to catch condensation as an extra safety net.' },
  { tag: 'bonus', text: 'Let the cake rest about 10 minutes before unmolding. If the ganache is too runny, let it sit 5-10 minutes to thicken.' },
];

// ---------- amounts ----------
const FRAC = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
const PLURAL = { cup: 'cups', pinch: 'pinches', 'large egg': 'large eggs' };

function fmtQty(q) {
  const whole = Math.floor(q), frac = +(q - whole).toFixed(2);
  return (whole ? String(whole) : '') + (FRAC[frac] || '');
}

let units = store.get('units', 'cups');

// spoons mode folds cups into tablespoons: 1 cup = 16 tbsp
function fmtAmount(parts, scale) {
  let list = parts.map(([q, u]) => [q * scale, u]);
  if (units === 'spoons') {
    const tbsp = list.reduce((n, [q, u]) => n + (u === 'cup' ? q * 16 : u === 'tbsp' ? q : 0), 0);
    list = list.filter(([, u]) => u !== 'cup' && u !== 'tbsp');
    if (tbsp) list.unshift([tbsp, 'tbsp']);
  }
  return list.map(([n, unit]) => `${fmtQty(n)} ${n > 1 && PLURAL[unit] ? PLURAL[unit] : unit}`).join(' + ');
}

function noteFor(ing) {
  return units === 'spoons' && ing.spoonNote ? ing.spoonNote(scale) : '';
}

// ---------- inventory ----------
let scale = store.get('scale', 1);
const have = new Set(store.get('inv', []));

function renderInventory() {
  for (const group of ['cake', 'ganache']) {
    const ul = document.querySelector(`.inv[data-group="${group}"]`);
    ul.innerHTML = INGREDIENTS.filter(i => i.group === group).map(i => `
      <li>
        <button type="button" class="inv-item${have.has(i.id) ? ' is-on' : ''}" data-inv="${i.id}" aria-pressed="${have.has(i.id)}">
          <span class="inv-icon">${sprite(i.icon, 4)}</span>
          <b class="inv-amt">${fmtAmount(i.amount, scale)}</b>
          ${i.name ? `<span class="inv-name">${i.name}</span>` : ''}
          ${noteFor(i) ? `<span class="inv-note">${noteFor(i)}</span>` : ''}
          <span class="tick" aria-hidden="true"></span>
        </button>
      </li>`).join('');
  }
  document.querySelectorAll('[data-scale-btn]').forEach(b => {
    b.setAttribute('aria-pressed', String(Number(b.dataset.scaleBtn) === scale));
  });
  document.querySelectorAll('[data-units]').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.units === units));
  });
  document.querySelector('[data-x2-note]').hidden = scale !== 2;
  document.querySelector('[data-spoon-note]').hidden = units !== 'spoons';
}

document.addEventListener('click', e => {
  const inv = e.target.closest('[data-inv]');
  if (inv) {
    const id = inv.dataset.inv;
    have.has(id) ? have.delete(id) : (have.add(id), blip(660));
    store.set('inv', [...have]);
    renderInventory();
    return;
  }
  const ub = e.target.closest('[data-units]');
  if (ub) {
    units = ub.dataset.units;
    store.set('units', units);
    renderInventory();
    renderSteps();
    return;
  }
  const sb = e.target.closest('[data-scale-btn]');
  if (sb) {
    scale = Number(sb.dataset.scaleBtn);
    store.set('scale', scale);
    renderInventory();
    renderSteps();
  }
});

// ---------- steps ----------
let done = new Set(store.get('steps', []));

function fillAmounts(text) {
  return text.replace(/\{(\w+)\}/g, (_, id) => {
    const ing = INGREDIENTS.find(i => i.id === id);
    const note = noteFor(ing);
    return `<b class="amt">${fmtAmount(ing.amount, scale)}</b>${note ? ` (${note})` : ''}`;
  });
}

function renderSteps() {
  const ol = document.querySelector('[data-steps]');
  ol.innerHTML = STEPS.map((s, i) => `
    <li class="step">
      <div class="step-num">${i + 1}</div>
      <div class="step-top">
        <span class="step-icon">${sprite(s.icon, 3)}</span>
        <h3>${s.title}</h3>
      </div>
      <button type="button" class="step-check" data-step="${i}" aria-label="Mark step ${i + 1} done"></button>
      <div class="step-body">
        <button type="button" class="scene" data-replay aria-label="Replay step ${i + 1} animation">
          <canvas data-scene="${i}" role="img" aria-label="Animation: ${s.title}"></canvas>
          <span class="scene-tag">STAGE ${i + 1}</span>
        </button>
        <p>${fillAmounts(s.text)}</p>
        <div class="step-actions">
          ${s.timer ? '<button type="button" class="btn btn-ghost btn-sm" data-goto-timer>40-min timer</button>' : ''}
          <button type="button" class="btn btn-mint btn-sm btn-done" data-step="${i}"></button>
        </div>
      </div>
    </li>`).join('');

  mountScenes(ol);
  revealSteps(ol);
  updateSteps();
  requestAnimationFrame(() => goTo(pos, false));
}

// toggling a step only flips classes, so the scenes keep playing
function updateSteps() {
  document.querySelectorAll('.step').forEach((li, i) => {
    const isDone = done.has(i);
    li.classList.toggle('is-done', isDone);
    li.querySelector('.step-check').setAttribute('aria-pressed', String(isDone));
    li.querySelector('.btn-done').textContent = isDone ? 'Undo' : i === STEPS.length - 1 ? 'Done!' : 'Done, next';
  });
  const n = done.size;
  document.querySelector('[data-meter-text]').textContent = n === STEPS.length ? 'CAKE GET!' : `${n}/${STEPS.length}`;
  document.querySelector('[data-meter]').innerHTML = STEPS.map((_, i) =>
    `<button type="button" class="${done.has(i) ? 'on' : ''}${i === pos ? ' cur' : ''}" data-go="${i}" aria-label="Go to step ${i + 1}"${i === pos ? ' aria-current="step"' : ''}></button>`).join('');
  document.querySelector('[data-pos]').textContent = `${pos + 1} / ${STEPS.length}`;
  document.querySelector('[data-nav="-1"]').disabled = pos === 0;
  document.querySelector('[data-nav="1"]').disabled = pos === STEPS.length - 1;
}

// ---------- quest carousel: one step at a time, left to right ----------
function firstOpen() {
  for (let i = 0; i < STEPS.length; i++) if (!done.has(i)) return i;
  return STEPS.length - 1;
}
let pos = Math.min(STEPS.length - 1, Math.max(0, store.get('pos', firstOpen())));

function track() { return document.querySelector('[data-steps]'); }

function setPos(i) {
  if (i === pos) return;
  pos = i;
  store.set('pos', pos);
  updateSteps();
  const cv = track().children[pos]?.querySelector('canvas');
  if (cv) replay(cv); // each step's scene starts from the top when you arrive
}

function goTo(i, smooth = true) {
  const ol = track();
  i = Math.max(0, Math.min(STEPS.length - 1, i));
  ol.scrollTo({ left: i * ol.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
  setPos(i);
}

let settle;
track().addEventListener('scroll', () => {
  clearTimeout(settle);
  settle = setTimeout(() => {
    const ol = track();
    setPos(Math.round(ol.scrollLeft / ol.clientWidth));
  }, 90);
}, { passive: true });

addEventListener('resize', () => goTo(pos, false));

addEventListener('keydown', e => {
  if (e.target.closest('input, textarea') || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
  const r = document.getElementById('steps').getBoundingClientRect();
  if (r.bottom < 0 || r.top > innerHeight) return;
  goTo(pos + (e.key === 'ArrowRight' ? 1 : -1));
});

// cards pop in the first time they slide into view
const revealIO = 'IntersectionObserver' in window
  ? new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); }
    }, { threshold: 0.15 })
  : null;

function revealSteps(root) {
  root.querySelectorAll('.step').forEach(li => revealIO ? revealIO.observe(li) : li.classList.add('in'));
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-step]');
  if (b) {
    const i = Number(b.dataset.step);
    const li = b.closest('.step');
    if (done.has(i)) done.delete(i);
    else {
      done.add(i);
      if (done.size === STEPS.length) { fanfare(); burst(b); }
      else {
        blip(880); burst(b, 6);
        if (i < STEPS.length - 1) setTimeout(() => goTo(i + 1), 450); // checked → slide to the next step
      }
    }
    store.set('steps', [...done]);
    updateSteps();
    if (done.has(i)) {
      li.classList.remove('just-done');
      void li.offsetWidth; // restart the hop
      li.classList.add('just-done');
    }
    return;
  }
  const nav = e.target.closest('[data-nav]');
  if (nav) { goTo(pos + Number(nav.dataset.nav)); return; }
  const go = e.target.closest('[data-go]');
  if (go) { goTo(Number(go.dataset.go)); return; }
  if (e.target.closest('[data-reset-steps]')) {
    done = new Set();
    store.set('steps', []);
    updateSteps();
    goTo(0);
    return;
  }
  const rp = e.target.closest('[data-replay]');
  if (rp) {
    replay(rp.querySelector('canvas'));
    return;
  }
  const hero = e.target.closest('[data-hero]');
  if (hero) {
    const box = hero.closest('.halo-cake');
    box.classList.remove('jump');
    void box.offsetWidth;
    box.classList.add('jump');
    blip(990);
    burst(hero, 10);
    return;
  }
  if (e.target.closest('[data-goto-timer]')) {
    document.getElementById('timer').scrollIntoView({ behavior: 'smooth' });
    if (!timer.end) startTimer();
  }
});

// hero cake blinks every few seconds
const heroCake = document.querySelector('.hero-cake');
function blink() {
  heroCake.innerHTML = sprite('cakeBlink', 9);
  setTimeout(() => { heroCake.innerHTML = sprite('cake', 9); }, 140);
  setTimeout(blink, 2200 + Math.random() * 2600);
}
setTimeout(blink, 1600);

// ---------- steam timer (wall-clock based, survives reloads + background tabs) ----------
const DEFAULT_MS = 40 * 60 * 1000;
const timer = Object.assign({ end: null, left: DEFAULT_MS, rang: false }, store.get('timer', {}));
const clockEl = document.querySelector('[data-clock]');
const msgEl = document.querySelector('[data-clock-msg]');
const goBtn = document.querySelector('[data-t="go"]');

function remaining() {
  return timer.end ? Math.max(0, timer.end - Date.now()) : timer.left;
}

function fmtClock(ms) {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function saveTimer() { store.set('timer', timer); }

function startTimer() {
  unlockAudio();
  timer.end = Date.now() + timer.left;
  timer.rang = false;
  saveTimer();
  drawTimer();
}

function pauseTimer() {
  timer.left = remaining();
  timer.end = null;
  saveTimer();
  drawTimer();
}

function drawTimer() {
  const ms = remaining();
  clockEl.textContent = fmtClock(ms);
  const running = !!timer.end && ms > 0;
  goBtn.textContent = running ? 'Pause' : (ms === DEFAULT_MS ? 'Start' : 'Resume');
  clockEl.classList.toggle('is-running', running);
  clockEl.classList.toggle('is-done', ms === 0);
  if (ms === 0) msgEl.textContent = 'DING! toothpick test time';
  else if (running) msgEl.textContent = 'steaming... keep the water topped up';
  else msgEl.textContent = ms === DEFAULT_MS ? 'ready when you are' : 'paused';
  document.title = running ? `${fmtClock(ms)} · Choco Cake` : 'Heavenly Choco Cake';
}

function tick() {
  if (timer.end && remaining() === 0 && !timer.rang) {
    timer.rang = true;
    timer.left = 0;
    saveTimer();
    fanfare();
    try { navigator.vibrate?.([200, 100, 200, 100, 400]); } catch {}
  }
  drawTimer();
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-t]');
  if (!t) return;
  const action = t.dataset.t;
  if (action === 'go') {
    if (timer.end && remaining() > 0) pauseTimer();
    else {
      if (remaining() === 0) timer.left = DEFAULT_MS;
      startTimer();
    }
  } else if (action === 'reset') {
    Object.assign(timer, { end: null, left: DEFAULT_MS, rang: false });
    saveTimer();
    drawTimer();
  } else {
    const delta = Number(action) * 60 * 1000;
    if (timer.end) timer.end = Math.max(Date.now() + 1000, timer.end + delta);
    else timer.left = Math.max(60 * 1000, timer.left + delta);
    timer.rang = false;
    saveTimer();
    drawTimer();
  }
});

// ---------- 8-bit sound ----------
let audio;
function unlockAudio() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch {}
}

function tone(freq, start, dur, vol = 0.06) {
  if (!audio) return;
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = 'square';
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, audio.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + start + dur);
  o.connect(g).connect(audio.destination);
  o.start(audio.currentTime + start);
  o.stop(audio.currentTime + start + dur);
}

function blip(freq) {
  unlockAudio();
  tone(freq, 0, 0.08);
  tone(freq * 1.5, 0.06, 0.1);
}

function fanfare() {
  unlockAudio();
  [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.12, i === 5 ? 0.5 : 0.14));
}

// ---------- sparkles ----------
function burst(el, count = 14) {
  const r = el.getBoundingClientRect();
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.className = 'spark';
    s.innerHTML = sprite('star', 2 + (i % 2));
    const a = (Math.PI * 2 * i) / count;
    const d = 30 + Math.random() * 40;
    s.style.left = r.left + r.width / 2 + 'px';
    s.style.top = r.top + r.height / 2 + 'px';
    s.style.setProperty('--dx', Math.cos(a) * d + 'px');
    s.style.setProperty('--dy', Math.sin(a) * d + 'px');
    document.body.appendChild(s);
    s.addEventListener('animationend', () => s.remove());
  }
}

// ---------- heavenly sky ----------
function buildSky() {
  const sky = document.getElementById('sky');
  let html = '';
  for (let i = 0; i < 7; i++) {
    const top = 4 + i * 14 + Math.random() * 6;
    const dur = 40 + Math.random() * 40;
    const delay = -Math.random() * dur;
    const sc = [3, 4, 5][i % 3];
    html += `<span class="cloud" style="top:${top}%;animation-duration:${dur}s;animation-delay:${delay}s;opacity:${0.55 + (i % 3) * 0.15}">${sprite('cloud', sc)}</span>`;
  }
  for (let i = 0; i < 18; i++) {
    html += `<span class="twinkle" style="left:${Math.random() * 96}%;top:${Math.random() * 96}%;animation-delay:${-Math.random() * 3}s">${sprite('star', 2)}</span>`;
  }
  sky.innerHTML = html;
}

// ---------- tips ----------
function renderTips() {
  document.querySelector('[data-tips]').innerHTML = TIPS.map(t => `
    <li><span class="tag tag-${t.tag}">${t.tag === 'video' ? 'from video' : 'bonus'}</span><p>${t.text}</p></li>`).join('');
}

// ---------- boot ----------
buildSky();
hydrateSprites();
renderInventory();
renderSteps();
renderTips();
drawTimer();
setInterval(tick, 250);
