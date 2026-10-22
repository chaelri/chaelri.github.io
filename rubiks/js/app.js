import { CubeState, parseAlg, invertAlg, algToString, simplify, removeYRotations, eq } from './cube.js';
import { CubePlayer } from './player.js';
import { isoSVG, topSVG } from './thumbs.js';
import * as C from './content.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------------------------------------------------------- player
const player = new CubePlayer($('#viewport'));
const ui = {
  moves: $('#moves'), play: $('#btnPlay'), loop: $('#btnLoop'),
  kicker: $('#stageKicker'), title: $('#stageTitle'), view: $('#viewBtn'),
};
const P = { steps: [], labels: {}, setup: [], idx: 0, playing: false, loop: false, gen: 0, view: 'top' };

// "[Label] R U R'" -> steps + label positions
function parseWithLabels(str) {
  const steps = [], labels = {};
  for (const tok of (str || '').match(/\[[^\]]*\]|[^\s()]+/g) || []) {
    if (tok[0] === '[') labels[steps.length] = tok.slice(1, -1);
    else steps.push(parseAlg(tok)[0]);
  }
  return { steps, labels };
}

function load(c, { autoplay = true } = {}) {
  P.gen++;
  P.playing = false;
  const { steps, labels } = parseWithLabels(c.alg);
  P.steps = steps;
  P.labels = labels;
  P.setup = c.setup !== undefined ? parseAlg(c.setup) : invertAlg(steps);
  P.idx = 0;
  P.mask = c.mask || 'none';
  player.reset();
  player.setMask(P.mask);
  setView(c.view || 'top', true);
  player.applyNow(P.setup);
  ui.kicker.textContent = c.kicker || '';
  ui.title.textContent = c.title || '';
  renderMoves();
  syncPlay();
  if (autoplay && steps.length) {
    const g = P.gen;
    setTimeout(() => { if (g === P.gen) play(); }, 550);
  }
}

function setView(v, snap = false) {
  P.view = v;
  player.setView(v, snap);
  ui.view.textContent = v === 'bottom' ? 'Top view' : 'Bottom view';
}
ui.view.addEventListener('click', () => setView(P.view === 'bottom' ? 'top' : 'bottom'));

function renderMoves() {
  if (!P.steps.length) {
    ui.moves.innerHTML = '<span class="empty">Pick a case to see it move.</span>';
    return;
  }
  let h = '';
  P.steps.forEach((m, i) => {
    if (P.labels[i] !== undefined) h += `<span class="mv-label" data-i="${i}">${esc(P.labels[i])}</span>`;
    h += `<button class="mv" data-i="${i}">${esc(m.tok)}</button>`;
  });
  ui.moves.innerHTML = h;
  markMoves();
}

function markMoves() {
  ui.moves.querySelectorAll('.mv').forEach((b) => {
    const i = +b.dataset.i;
    b.classList.toggle('done', i < P.idx);
    b.classList.toggle('next', i === P.idx && P.playing);
  });
  const cur = ui.moves.querySelector('.mv.next');
  if (cur) cur.scrollIntoView({ block: 'nearest' });
}

function syncPlay() {
  ui.play.classList.toggle('playing', P.playing);
  ui.loop.classList.toggle('on', P.loop);
  markMoves();
}

// Jump anywhere: rebuild from the setup instantly.
function seek(i) {
  P.gen++;
  P.playing = false;
  player.reset();
  player.applyNow(P.setup);
  player.applyNow(P.steps.slice(0, i));
  P.idx = i;
  syncPlay();
}

async function play() {
  if (!P.steps.length) return;
  if (P.idx >= P.steps.length) seek(0);
  const g = ++P.gen;
  P.playing = true;
  syncPlay();
  while (g === P.gen && P.idx < P.steps.length) {
    markMoves();
    await player.animate(P.steps[P.idx]);
    if (g !== P.gen) return;
    P.idx++;
    markMoves();
    if (P.idx >= P.steps.length && P.loop) {
      await wait(900);
      if (g !== P.gen) return;
      seek(0);
      P.gen = g;
      P.playing = true;
      await wait(350);
    }
  }
  if (g === P.gen) { P.playing = false; syncPlay(); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function pause() { P.gen++; P.playing = false; syncPlay(); }

let stepping = false;
async function step(dir) {
  if (stepping) return;
  pause();
  stepping = true;
  if (dir > 0 && P.idx < P.steps.length) {
    await player.animate(P.steps[P.idx], 220);
    P.idx++;
  } else if (dir < 0 && P.idx > 0) {
    P.idx--;
    await player.animateInverse(P.steps[P.idx], 220);
  }
  stepping = false;
  syncPlay();
}

ui.play.addEventListener('click', () => (P.playing ? pause() : play()));
$('#btnNext').addEventListener('click', () => step(1));
$('#btnPrev').addEventListener('click', () => step(-1));
$('#btnRestart').addEventListener('click', () => seek(0));
ui.loop.addEventListener('click', () => { P.loop = !P.loop; syncPlay(); });
$('#speed').addEventListener('input', (e) => {
  player.speed = +e.target.value;
  $('#speedVal').textContent = (+e.target.value).toFixed(1) + '×';
});
ui.moves.addEventListener('click', (e) => {
  const t = e.target.closest('[data-i]');
  if (t) seek(+t.dataset.i);
});

// ---------------------------------------------------------------- helpers
const stateFor = (alg, setup) => {
  const s = new CubeState();
  if (setup !== undefined) return s.apply(setup);
  return s.apply(invertAlg(parseWithLabels(alg).steps));
};

function caseCard(c, i) {
  return `<button class="card" data-case="${i}">
    <div class="thumb">${c.svg}</div>
    <div class="row">${c.num ? `<span class="num">${c.num}</span>` : ''}<span class="name">${esc(c.name)}</span></div>
    <code class="alg">${esc(c.alg)}</code>
    ${c.note ? `<div class="note">${esc(c.note)}</div>` : ''}
  </button>`;
}

// Wire every [data-case] in the lesson to a list of case objects.
let registry = [];
function register(c) { registry.push(c); return registry.length - 1; }

$('#lesson').addEventListener('click', (e) => {
  const card = e.target.closest('[data-case]');
  if (!card) return;
  document.querySelectorAll('.card.active').forEach((x) => x.classList.remove('active'));
  card.classList.add('active');
  load(registry[+card.dataset.case]);
  if (window.matchMedia('(max-width: 900px)').matches)
    $('#stage').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ---------------------------------------------------------------- lessons
const LESSONS = {
  notation: {
    label: 'Notation',
    render() {
      const block = (list) => `<div class="grid wide">${list.map((n) => {
        const i = register({ kicker: 'Notation', title: n.name, alg: n.alg, setup: '', mask: 'none' });
        return `<button class="card text" data-case="${i}"><span class="big">${esc(n.name.split(' ')[0])}</span><span class="note">${esc(n.note)}</span></button>`;
      }).join('')}</div>`;
      return `
      <div class="kicker">Reference</div>
      <h2>Notation</h2>
      <p class="lead">Every algorithm is written in these letters. A letter alone is a clockwise quarter turn of that face, as if you were looking straight at it. <code>'</code> means counter-clockwise, <code>2</code> means half turn.</p>
      <p>Hold the cube with <strong>yellow on top and green in front</strong>. Tap a move to see it.</p>
      <h3>Face turns</h3>${block(C.NOTATION.faces)}
      <h3>Wide turns and slices</h3>
      <p>Lowercase means two layers together. <code>M</code> is the middle slice between L and R.</p>${block(C.NOTATION.wide)}
      <h3>Cube rotations</h3>
      <p>Rotate the whole cube in your hands. Rotations are slow in a real solve — the F2L algorithms here avoid them.</p>${block(C.NOTATION.rotations)}`;
    },
    stage: () => ({ kicker: 'Notation', title: 'Tap a move', alg: '', setup: '', mask: 'none' }),
  },

  cross: {
    label: 'Cross',
    render() {
      const cards = C.CROSS.map((c, k) => {
        const svg = isoSVG(stateFor(c.alg), 'cross', true);
        const i = register({ kicker: 'Cross', title: c.name, alg: c.alg, mask: 'cross', view: 'bottom' });
        return caseCard({ ...c, svg, num: k + 1 }, i);
      }).join('');
      return `
      <div class="kicker">Step 1</div>
      <h2>Cross — in 8 moves or less</h2>
      <p class="lead">White edges around the white centre, on the <strong>bottom</strong>. Aim for 8 moves or less.</p>
      <ul class="tips">
        <li>Plan all four edges in the 15 s inspection, then do it without stopping.</li>
        <li>Keep white on the bottom the whole time — never solve it on top and flip.</li>
      </ul>
      <h3>The six situations</h3>
      <div class="grid">${cards}</div>`;
    },
    stage: () => ({ kicker: 'Cross', title: 'Pick a case', alg: '', setup: '', mask: 'cross', view: 'bottom' }),
  },

  f2l: {
    label: 'F2L',
    render() {
      const groups = Object.fromEntries(C.F2L_GROUPS.map((g) => [g.key, []]));
      C.F2L.forEach((alg, k) => {
        const s = stateFor(alg);
        const corner = s.stickers.find((t) => eq(t.home, [1, -1, 1]) && t.c === 'D');
        const edge = s.stickers.find((t) => eq(t.home, [1, 0, 1]) && t.c === 'F');
        const cTop = corner.p[1] === 1, eTop = edge.p[1] === 1;
        const key = k < 4 ? 'basic' : cTop && eTop ? (corner.n[1] === 1 ? 'up' : 'side') : cTop ? 'edgeSlot' : eTop ? 'cornerSlot' : 'both';
        const i = register({ kicker: `F2L case ${k + 1}`, title: C.F2L_GROUPS.find((g) => g.key === key).title, alg, mask: 'f2l' });
        groups[key].push(caseCard({ name: `Case ${k + 1}`, alg, svg: isoSVG(s, 'f2l'), num: '' }, i));
      });
      const body = C.F2L_GROUPS.map((g) => `
        <div class="group-head"><h3>${esc(g.title)}</h3><span class="count">${groups[g.key].length}</span></div>
        <p class="group-note">${esc(g.note)}</p>
        <div class="grid">${groups[g.key].join('')}</div>`).join('');
      return `
      <div class="kicker">Step 2</div>
      <h2>F2L — all 41 cases</h2>
      <p class="lead">Pair a white corner with its edge and insert them together. Every pair is one of these 41 cases — see the case, do the moves.</p>
      <ul class="tips">
        <li>Shown for the front-right slot. Turn <code>U</code> to line it up; for front-left, mirror it (R↔L).</li>
        <li>While inserting one pair, look for the next. No pauses.</li>
      </ul>
      ${body}`;
    },
    stage: () => ({ kicker: 'F2L', title: 'Pick a case', alg: '', setup: '', mask: 'f2l' }),
  },

  oll: {
    label: 'OLL',
    render() {
      const mk = (list, kick) => list.map((c, k) => {
        const svg = topSVG(stateFor(c.alg), 'oll');
        const i = register({ kicker: kick, title: c.name, alg: c.alg, mask: 'oll' });
        return caseCard({ ...c, svg, num: k + 1 }, i);
      }).join('');
      return `
      <div class="kicker">Step 3</div>
      <h2>OLL — make the top yellow</h2>
      <p class="lead">Two looks: yellow cross first, then the corners. Turn <code>U</code> until it matches the picture (front = bottom of the picture).</p>
      <h3>Look 1 — yellow cross</h3><div class="grid">${mk(C.OLL_EDGES, 'OLL · edges')}</div>
      <h3>Look 2 — yellow corners</h3><div class="grid">${mk(C.OLL_CORNERS, 'OLL · corners')}</div>`;
    },
    stage: () => ({ kicker: 'OLL', title: 'Pick a case', alg: '', setup: '', mask: 'oll' }),
  },

  pll: {
    label: 'PLL',
    render() {
      const mk = (list, kick) => list.map((c, k) => {
        const svg = topSVG(stateFor(c.alg), 'none', true);
        const i = register({ kicker: kick, title: c.name, alg: c.alg, mask: 'none' });
        return caseCard({ ...c, svg, num: kick.includes('full') ? '' : k + 1 }, i);
      }).join('');
      return `
      <div class="kicker">Step 4</div>
      <h2>PLL — finish it</h2>
      <p class="lead">Move the top pieces home. Arrows show where each piece goes. Start with the 6 two-look algs, then learn all 21.</p>
      <ul class="tips">
        <li>Corners first: headlights on one side → hold them on the left, T perm. No headlights → Y perm.</li>
        <li>Then edges: Ua, Ub, H or Z.</li>
      </ul>
      <h3>2-look PLL — learn these first</h3><div class="grid">${mk(C.PLL_2LOOK, 'PLL · 2-look')}</div>
      <h3>Full PLL — all 21</h3>
      <div class="grid">${mk(C.PLL_FULL, 'PLL · full')}</div>`;
    },
    stage: () => ({ kicker: 'PLL', title: 'Pick a case', alg: '', setup: '', mask: 'none' }),
  },

  advanced: {
    label: 'Advanced',
    render() {
      const cards = C.ADVANCED.map((c) => {
        const st = new CubeState().apply(c.setup).apply(invertAlg(parseWithLabels(c.alg).steps));
        const i = register({ kicker: 'Advanced', title: c.name, alg: c.alg, setup: algToString(parseAlg(c.setup).concat(invertAlg(parseWithLabels(c.alg).steps))), mask: 'f2l', view: c.name === 'X-cross' ? 'bottom' : 'top' });
        return caseCard({ name: c.name, alg: c.alg.replace(/\[[^\]]*\]\s*/g, ''), note: c.note, svg: isoSVG(st, 'f2l', c.name === 'X-cross') }, i);
      }).join('');
      return `
      <div class="kicker">After sub-20</div>
      <h2>How the fastest do it</h2>
      <p class="lead">Yiheng Wang and other top solvers still use CFOP — these are the extras on top. Learn them only once the 4 steps are automatic.</p>
      <div class="grid wide">${cards}</div>
      <h3>The rest of the toolkit</h3>
      <ul class="tips">
        <li><strong>Keyhole</strong> — use an empty slot as a shortcut to drop in one piece, then fix the rest.</li>
        <li><strong>Multislotting</strong> — insert one pair while setting up the next in the same moves.</li>
        <li><strong>Full OLL (57)</strong> — the top turns yellow in one look instead of two.</li>
        <li><strong>COLL / ZBLL</strong> — solve the whole top layer in one algorithm, skipping PLL.</li>
        <li><strong>Colour neutral</strong> — start the cross on whichever colour is easiest, not just white.</li>
      </ul>`;
    },
    stage: () => ({ kicker: 'Advanced', title: 'Pick a technique', alg: '', setup: '', mask: 'none' }),
  },

  solve: {
    label: 'Full solve',
    render() {
      const sol = parseWithLabels(C.FULL_SOLVE).steps;
      const scramble = algToString(simplify(removeYRotations(invertAlg(sol))));
      const i = register({ kicker: 'Full solve', title: 'Cross → F2L ×4 → OLL → PLL', alg: C.FULL_SOLVE, mask: 'none' });
      const stages = [];
      for (const tok of C.FULL_SOLVE.match(/\[[^\]]*\]|[^\s]+/g)) {
        if (tok[0] === '[') stages.push({ name: tok.slice(1, -1), moves: [] });
        else stages[stages.length - 1].moves.push(tok);
      }
      return `
      <div class="kicker">Put it together</div>
      <h2>A whole CFOP solve</h2>
      <p class="lead">Every step from this site, in order. Use the stage labels above the moves to jump to any step.</p>
      <div class="grid wide"><button class="card text" data-case="${i}"><span class="big">▶</span><span class="note"><strong>Play the full solve</strong><br>${sol.length} moves, ${stages.length} stages</span></button></div>
      <h3>Scramble</h3>
      <p>Hold yellow on top, green in front and do this scramble on your real cube, then follow along.</p>
      <p><code>${esc(scramble)}</code></p>
      <h3>Solution</h3>
      <ul class="tips">${stages.map((s) => `<li><strong>${esc(s.name)}</strong> — <code>${esc(s.moves.join(' '))}</code></li>`).join('')}</ul>
      <div class="callout"><code>y</code> between F2L pairs turns the cube so the next slot is front-right. Real solves try to avoid these, but they keep the example readable.</div>`;
    },
    stage: () => ({ kicker: 'Full solve', title: 'Cross → F2L ×4 → OLL → PLL', alg: C.FULL_SOLVE, mask: 'none' }),
  },

  timer: {
    label: 'Timer',
    render() {
      return `
      <div class="kicker">Practice</div>
      <h2>Timer</h2>
      <div class="timer-box" id="timerBox">
        <div class="scramble" id="scr"></div>
        <div class="clock" id="clock">0.00</div>
        <div class="clock-hint" id="hint">Hold <strong>Space</strong> (or touch here) until green, let go to start. Any key stops.</div>
        <div class="row-btns">
          <button class="btn primary" id="newScr">New scramble</button>
          <button class="btn" id="delLast">Delete last</button>
          <button class="btn" id="clearAll">Clear all</button>
        </div>
      </div>
      <div class="stats" id="stats"></div>
      <div class="times" id="times"></div>
      <h3>Drills that actually make you faster</h3>
      <ul class="tips">
        <li><strong>Slow solves, zero pauses.</strong> 5 a day at half speed. Your eyes learn to look ahead.</li>
        <li><strong>Cross only.</strong> 15 s inspection, then the cross with eyes closed. Check how many edges are right.</li>
        <li><strong>Algorithm reps.</strong> Pick one F2L / PLL case, 20 reps in a row, then mix it into solves.</li>
        <li><strong>Average of 12, every day.</strong> Ao12 is the number to track, not your best single.</li>
      </ul>`;
    },
    mount: mountTimer,
    stage: () => ({ kicker: 'Timer', title: 'Your scramble', alg: '', setup: TIMER.scramble, mask: 'none' }),
  },
};

// ---------------------------------------------------------------- timer
const TIMER = { scramble: '', state: 'idle', start: 0, raf: 0, holdT: 0, times: loadTimes() };

function loadTimes() {
  try { return JSON.parse(localStorage.getItem('rubiks.times.v1')) || []; } catch { return []; }
}
function saveTimes() {
  try { localStorage.setItem('rubiks.times.v1', JSON.stringify(TIMER.times.slice(-500))); } catch { /* private mode */ }
}

function genScramble(n = 20) {
  const faces = ['U', 'D', 'R', 'L', 'F', 'B'], axis = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };
  const out = [];
  while (out.length < n) {
    const f = faces[(Math.random() * 6) | 0];
    const a = out[out.length - 1], b = out[out.length - 2];
    if (a && a[0] === f) continue;
    if (a && b && axis[a[0]] === axis[f] && axis[b[0]] === axis[f]) continue;
    out.push(f + ['', "'", '2'][(Math.random() * 3) | 0]);
  }
  return out.join(' ');
}

const fmt = (ms) => (ms == null ? '–' : ms === Infinity ? 'DNF' : (ms / 1000).toFixed(2));
function avg(list, n) {
  if (list.length < n) return null;
  const s = list.slice(-n).sort((a, b) => a - b).slice(1, -1);
  return s.reduce((a, b) => a + b, 0) / s.length;
}

function mountTimer() {
  newScramble();
  renderStats();
  $('#newScr').onclick = () => newScramble();
  $('#delLast').onclick = () => { TIMER.times.pop(); saveTimes(); renderStats(); };
  $('#clearAll').onclick = () => { TIMER.times = []; saveTimes(); renderStats(); };
  const box = $('#timerBox');
  box.addEventListener('touchstart', (e) => { if (e.target.closest('button')) return; e.preventDefault(); press(); }, { passive: false });
  box.addEventListener('touchend', (e) => { if (e.target.closest('button')) return; e.preventDefault(); release(); }, { passive: false });
}

function newScramble() {
  TIMER.scramble = genScramble();
  const el = $('#scr');
  if (el) el.textContent = TIMER.scramble;
  load({ kicker: 'Timer', title: 'Your scramble — match it on your cube', alg: '', setup: TIMER.scramble, mask: 'none' }, { autoplay: false });
}

function renderStats() {
  const t = TIMER.times;
  const best = t.length ? Math.min(...t) : null;
  $('#stats').innerHTML = [['Solves', t.length], ['Best', fmt(best)], ['Ao5', fmt(avg(t, 5))], ['Ao12', fmt(avg(t, 12))]]
    .map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
  $('#times').innerHTML = t.slice(-40).reverse().map((x) => `<span>${fmt(x)}</span>`).join('');
}

function press() {
  const clock = $('#clock');
  if (!clock) return;
  if (TIMER.state === 'running') return stop();
  if (TIMER.state !== 'idle') return;
  TIMER.state = 'holding';
  clock.className = 'clock hold';
  TIMER.holdT = setTimeout(() => { if (TIMER.state === 'holding') { TIMER.state = 'ready'; clock.className = 'clock ready'; clock.textContent = '0.00'; } }, 350);
}
function release() {
  const clock = $('#clock');
  if (!clock) return;
  clearTimeout(TIMER.holdT);
  if (TIMER.state === 'ready') {
    TIMER.state = 'running';
    clock.className = 'clock';
    TIMER.start = performance.now();
    const tick = () => {
      if (TIMER.state !== 'running') return;
      clock.textContent = ((performance.now() - TIMER.start) / 1000).toFixed(2);
      TIMER.raf = requestAnimationFrame(tick);
    };
    tick();
  } else if (TIMER.state === 'holding') {
    TIMER.state = 'idle';
    clock.className = 'clock';
  } else if (TIMER.state === 'stopped') {
    TIMER.state = 'idle';
  }
}
function stop() {
  cancelAnimationFrame(TIMER.raf);
  const ms = performance.now() - TIMER.start;
  TIMER.state = 'stopped';
  $('#clock').textContent = (ms / 1000).toFixed(2);
  TIMER.times.push(Math.round(ms));
  saveTimes();
  renderStats();
  newScramble();
}

// ---------------------------------------------------------------- tabs
const ORDER = ['cross', 'f2l', 'oll', 'pll', 'advanced', 'solve', 'notation', 'timer'];
const STEP_NO = { cross: 1, f2l: 2, oll: 3, pll: 4 };
let current = null;

function open(key, push = true) {
  if (!LESSONS[key]) key = 'cross';
  current = key;
  registry = [];
  const L = LESSONS[key];
  $('#lesson').innerHTML = L.render();
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.key === key)));
  if (L.mount) L.mount();
  else load(L.stage(), { autoplay: false });
  if (push) history.replaceState(null, '', '#' + key);
  window.scrollTo({ top: 0 });
}

$('#tabs').innerHTML = ORDER.map((k) =>
  `<button class="tab" role="tab" data-key="${k}">${STEP_NO[k] ? `<span class="n">${STEP_NO[k]}</span>` : ''}${LESSONS[k].label}</button>`).join('');
$('#tabs').addEventListener('click', (e) => {
  const t = e.target.closest('.tab');
  if (t) open(t.dataset.key);
});
window.addEventListener('hashchange', () => open(location.hash.slice(1), false));

// ---------------------------------------------------------------- keys
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea')) return;
  if (current === 'timer') {
    if (e.code === 'Space' || TIMER.state === 'running') {
      e.preventDefault();
      if (!e.repeat) press();
    }
    return;
  }
  if (e.code === 'Space') { e.preventDefault(); P.playing ? pause() : play(); }
  else if (e.key === 'ArrowRight') step(1);
  else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'Home') seek(0);
});
document.addEventListener('keyup', (e) => {
  if (current === 'timer' && (e.code === 'Space' || TIMER.state === 'stopped')) { e.preventDefault(); release(); }
});

open(location.hash.slice(1) || 'cross', false);
